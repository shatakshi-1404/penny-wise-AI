"""Financial statistics are calculated here, in Python, from real database rows.
The LLM only ever sees these numbers; it never computes or invents totals."""
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Budget, SavingsGoal, Transaction

DEFAULT_LIMIT_PAISE = 2_000_000  # Rs 20,000
DEFAULT_INCREMENT_PAISE = 1000  # Rs 10


def get_or_create_budget(db: Session, user_id: int, month: int, year: int) -> Budget:
    b = db.query(Budget).filter_by(user_id=user_id, month=month, year=year).first()
    if b is None:
        # Carry over last known settings so the user doesn't have to re-enter them each month.
        last = db.query(Budget).filter_by(user_id=user_id).order_by(Budget.year.desc(), Budget.month.desc()).first()
        b = Budget(
            user_id=user_id,
            month=month,
            year=year,
            monthly_limit_paise=last.monthly_limit_paise if last else DEFAULT_LIMIT_PAISE,
            rounding_increment_paise=last.rounding_increment_paise if last else DEFAULT_INCREMENT_PAISE,
        )
        db.add(b)
        db.commit()
        db.refresh(b)
    return b


def _month_filter(q, month: int, year: int):
    start = date(year, month, 1)
    end = date(year + (month == 12), month % 12 + 1, 1)
    return q.filter(Transaction.transaction_date >= start, Transaction.transaction_date < end)


def total_savings(db: Session, user_id: int) -> int:
    return int(db.query(func.coalesce(func.sum(Transaction.savings_paise), 0)).filter_by(user_id=user_id).scalar())


def sync_goals(db: Session, user_id: int) -> list[SavingsGoal]:
    """Virtual savings fill the goals in the order they were created (oldest first)."""
    pool = total_savings(db, user_id)
    goals = db.query(SavingsGoal).filter_by(user_id=user_id).order_by(SavingsGoal.created_at, SavingsGoal.id).all()
    for g in goals:
        g.saved_amount_paise = min(g.target_amount_paise, pool)
        pool -= g.saved_amount_paise
    db.commit()
    return goals


def category_breakdown(db: Session, user_id: int, month: int, year: int) -> list[dict]:
    rows = _month_filter(
        db.query(Transaction.category, func.sum(Transaction.amount_paise)).filter_by(user_id=user_id), month, year
    ).group_by(Transaction.category).all()
    total = sum(int(r[1]) for r in rows) or 1
    out = [{"category": r[0], "total_paise": int(r[1]), "percent": round(int(r[1]) * 100 / total, 1)} for r in rows]
    return sorted(out, key=lambda x: x["total_paise"], reverse=True)


def weekly_totals(db: Session, user_id: int, today: date | None = None) -> list[dict]:
    today = today or date.today()
    days = [today - timedelta(days=i) for i in range(6, -1, -1)]
    rows = (
        db.query(Transaction.transaction_date, func.sum(Transaction.amount_paise))
        .filter(Transaction.user_id == user_id, Transaction.transaction_date >= days[0], Transaction.transaction_date <= today)
        .group_by(Transaction.transaction_date)
        .all()
    )
    by_day = defaultdict(int, {r[0]: int(r[1]) for r in rows})
    return [{"date": d.isoformat(), "label": d.strftime("%a"), "total_paise": by_day[d]} for d in days]


def dashboard_summary(db: Session, user_id: int, month: int, year: int) -> dict:
    budget = get_or_create_budget(db, user_id, month, year)
    spent, count, month_savings = _month_filter(
        db.query(
            func.coalesce(func.sum(Transaction.amount_paise), 0),
            func.count(Transaction.id),
            func.coalesce(func.sum(Transaction.savings_paise), 0),
        ).filter_by(user_id=user_id),
        month,
        year,
    ).one()
    spent, month_savings = int(spent), int(month_savings)
    goals = sync_goals(db, user_id)
    goal = None
    for g in goals:  # first goal that is not yet complete, else the latest one
        if g.saved_amount_paise < g.target_amount_paise:
            goal = g
            break
    if goal is None and goals:
        goal = goals[-1]
    return {
        "month": month,
        "year": year,
        "monthly_limit_paise": budget.monthly_limit_paise,
        "rounding_increment_paise": budget.rounding_increment_paise,
        "total_expenses_paise": spent,
        "remaining_paise": budget.monthly_limit_paise - spent,
        "budget_used_percent": round(spent * 100 / budget.monthly_limit_paise, 1) if budget.monthly_limit_paise else 0,
        "transaction_count": int(count),
        "month_savings_paise": month_savings,
        "total_savings_paise": total_savings(db, user_id),
        "goal": (
            {
                "id": goal.id,
                "title": goal.title,
                "target_amount_paise": goal.target_amount_paise,
                "saved_amount_paise": goal.saved_amount_paise,
            }
            if goal
            else None
        ),
    }


def spending_stats(db: Session, user_id: int, today: date | None = None) -> dict:
    """Compact, fully computed stats dict that is handed to the LLM (or the fallback)."""
    today = today or date.today()
    s = dashboard_summary(db, user_id, today.month, today.year)
    cats = category_breakdown(db, user_id, today.month, today.year)
    top_merchants = (
        _month_filter(
            db.query(Transaction.merchant, func.sum(Transaction.amount_paise)).filter_by(user_id=user_id),
            today.month,
            today.year,
        )
        .group_by(Transaction.merchant)
        .order_by(func.sum(Transaction.amount_paise).desc())
        .limit(3)
        .all()
    )
    rupees = lambda p: round(p / 100, 2)  # noqa: E731
    return {
        "month": today.strftime("%B %Y"),
        "monthly_budget_rs": rupees(s["monthly_limit_paise"]),
        "total_spent_rs": rupees(s["total_expenses_paise"]),
        "budget_remaining_rs": rupees(s["remaining_paise"]),
        "budget_used_percent": s["budget_used_percent"],
        "transaction_count": s["transaction_count"],
        "roundup_savings_this_month_rs": rupees(s["month_savings_paise"]),
        "total_virtual_savings_rs": rupees(s["total_savings_paise"]),
        "rounding_increment_rs": rupees(s["rounding_increment_paise"]),
        "top_category": cats[0]["category"] if cats else None,
        "top_category_spent_rs": rupees(cats[0]["total_paise"]) if cats else 0,
        "categories": [{"category": c["category"], "spent_rs": rupees(c["total_paise"]), "percent": c["percent"]} for c in cats],
        "top_merchants": [{"merchant": m, "spent_rs": rupees(int(t))} for m, t in top_merchants],
    }
