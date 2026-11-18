from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from . import ai_service, analytics, ml_service
from .auth import create_token, get_current_user, hash_password, verify_password
from .config import CATEGORIES
from .database import get_db
from .models import Budget, SavingsGoal, Transaction, User
from .rounding import calculate_roundup
from .schemas import (
    BudgetIn,
    BudgetOut,
    ChatIn,
    ExtractIn,
    GoalIn,
    GoalOut,
    LoginIn,
    RegisterIn,
    TokenOut,
    TransactionIn,
    TransactionOut,
    UserOut,
    rupees_to_paise,
)

router = APIRouter(prefix="/api")


# ============================ auth ============================
@router.post("/auth/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(409, "An account with this email already exists.")
    user = User(name=body.name.strip(), email=email, hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_token(user.id), user=user)


@router.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email.lower()).first()
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Email or password is incorrect.")
    return TokenOut(access_token=create_token(user.id), user=user)


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


# ============================ transactions ============================
def _apply_roundup(db: Session, user: User, tx: Transaction) -> None:
    budget = analytics.get_or_create_budget(db, user.id, tx.transaction_date.month, tx.transaction_date.year)
    tx.rounded_amount_paise, tx.savings_paise = calculate_roundup(tx.amount_paise, budget.rounding_increment_paise)


def _ml_text(merchant: str, description: str) -> str:
    return f"{merchant} {description}".strip()


def _get_owned(db: Session, user: User, tx_id: int) -> Transaction:
    tx = db.get(Transaction, tx_id)
    # 404 (not 403) so users cannot discover other people's IDs.
    if tx is None or tx.user_id != user.id:
        raise HTTPException(404, "Transaction not found.")
    return tx


@router.get("/transactions", response_model=list[TransactionOut])
def list_transactions(
    q: str | None = None,
    category: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(200, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Transaction).filter(Transaction.user_id == user.id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Transaction.merchant.ilike(like), Transaction.description.ilike(like)))
    if category:
        query = query.filter(Transaction.category == category)
    if date_from:
        query = query.filter(Transaction.transaction_date >= date_from)
    if date_to:
        query = query.filter(Transaction.transaction_date <= date_to)
    return query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).limit(limit).all()


@router.post("/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(body: TransactionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pred = ml_service.predict_category(_ml_text(body.merchant, body.description))
    tx = Transaction(
        user_id=user.id,
        merchant=body.merchant,
        amount_paise=rupees_to_paise(body.amount),
        description=body.description.strip(),
        transaction_date=body.transaction_date,
        category=body.category or pred["category"],
        predicted_category=pred["category"],
        ml_confidence=pred["confidence"],
    )
    _apply_roundup(db, user, tx)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.put("/transactions/{tx_id}", response_model=TransactionOut)
def update_transaction(tx_id: int, body: TransactionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tx = _get_owned(db, user, tx_id)
    pred = ml_service.predict_category(_ml_text(body.merchant, body.description))
    tx.merchant = body.merchant
    tx.amount_paise = rupees_to_paise(body.amount)
    tx.description = body.description.strip()
    tx.transaction_date = body.transaction_date
    tx.category = body.category or pred["category"]
    tx.predicted_category = pred["category"]
    tx.ml_confidence = pred["confidence"]
    _apply_roundup(db, user, tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/transactions/{tx_id}", status_code=204)
def delete_transaction(tx_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tx = _get_owned(db, user, tx_id)
    db.delete(tx)
    db.commit()
    return Response(status_code=204)


# ============================ dashboard ============================
@router.get("/dashboard/summary")
def dashboard_summary(
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = Query(None, ge=2000, le=2100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    return analytics.dashboard_summary(db, user.id, month or today.month, year or today.year)


@router.get("/dashboard/weekly")
def dashboard_weekly(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return analytics.weekly_totals(db, user.id)


@router.get("/dashboard/categories")
def dashboard_categories(
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = Query(None, ge=2000, le=2100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    return analytics.category_breakdown(db, user.id, month or today.month, year or today.year)


# ============================ budget ============================
@router.get("/budget", response_model=BudgetOut)
def get_budget(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = date.today()
    return analytics.get_or_create_budget(db, user.id, t.month, t.year)


@router.put("/budget", response_model=BudgetOut)
def put_budget(body: BudgetIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = date.today()
    budget = analytics.get_or_create_budget(db, user.id, t.month, t.year)
    budget.monthly_limit_paise = rupees_to_paise(body.monthly_limit)
    budget.rounding_increment_paise = body.rounding_increment * 100
    # Re-calculate this month's round-ups so stored savings match the new increment.
    for tx in analytics._month_filter(db.query(Transaction).filter_by(user_id=user.id), t.month, t.year):
        tx.rounded_amount_paise, tx.savings_paise = calculate_roundup(tx.amount_paise, budget.rounding_increment_paise)
    db.commit()
    db.refresh(budget)
    return budget


# ============================ savings ============================
def _goal_out(g: SavingsGoal) -> GoalOut:
    return GoalOut(
        id=g.id,
        title=g.title,
        target_amount_paise=g.target_amount_paise,
        saved_amount_paise=g.saved_amount_paise,
        created_at=g.created_at,
    )


@router.get("/savings")
def get_savings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goals = analytics.sync_goals(db, user.id)
    t = date.today()
    summary = analytics.dashboard_summary(db, user.id, t.month, t.year)
    return {
        "total_savings_paise": summary["total_savings_paise"],
        "month_savings_paise": summary["month_savings_paise"],
        "rounding_increment_paise": summary["rounding_increment_paise"],
        "goals": [_goal_out(g) for g in goals],
    }


@router.post("/savings/goals", response_model=GoalOut, status_code=201)
def create_goal(body: GoalIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    g = SavingsGoal(user_id=user.id, title=body.title, target_amount_paise=rupees_to_paise(body.target_amount))
    db.add(g)
    db.commit()
    analytics.sync_goals(db, user.id)
    db.refresh(g)
    return _goal_out(g)


@router.delete("/savings/goals/{goal_id}", status_code=204)
def delete_goal(goal_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    g = db.get(SavingsGoal, goal_id)
    if g is None or g.user_id != user.id:
        raise HTTPException(404, "Goal not found.")
    db.delete(g)
    db.commit()
    analytics.sync_goals(db, user.id)
    return Response(status_code=204)


# ============================ ML ============================
@router.post("/ml/predict-category")
def predict_category(body: ExtractIn, user: User = Depends(get_current_user)):
    return ml_service.predict_category(body.text)


@router.get("/ml/metrics")
def ml_metrics(user: User = Depends(get_current_user)):
    m = ml_service.get_metrics()
    if m is None:
        raise HTTPException(404, "Model has not been trained yet. Run: python -m app.train_model")
    return {k: m[k] for k in ("accuracy", "macro_f1", "n_train", "n_test", "n_classes", "trained_at", "note") if k in m}


# ============================ AI (Groq) ============================
@router.post("/ai/extract-transaction")
def extract_transaction(body: ExtractIn, user: User = Depends(get_current_user)):
    try:
        tx = ai_service.extract_transaction(body.text)
    except ai_service.AIError as exc:
        raise HTTPException(exc.status_code, exc.message)
    # Independent opinion from OUR classifier, never from the LLM.
    ml = ml_service.predict_category(_ml_text(tx.merchant, tx.description or body.text))
    return {
        "extracted": {
            "merchant": tx.merchant,
            "amount": str(tx.amount),
            "category": tx.category,
            "date": (tx.date or date.today()).isoformat(),
            "description": tx.description,
        },
        "ml": ml,
        "categories_disagree": bool(tx.category and tx.category != ml["category"]),
        "categories": CATEGORIES,
    }


@router.post("/ai/insights")
def ai_insights(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stats = analytics.spending_stats(db, user.id)
    insights, source = ai_service.generate_insights(stats)
    return {"insights": insights, "source": source}


@router.post("/ai/chat")
def ai_chat(body: ChatIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stats = analytics.spending_stats(db, user.id)
    answer, source = ai_service.answer_question(body.question, stats)
    return {"answer": answer, "source": source, "stats_used": stats}
