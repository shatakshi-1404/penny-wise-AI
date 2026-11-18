"""Create (or reset) the demo account with realistic SYNTHETIC data.

Run from the backend folder:   python -m app.seed
Login:  demo@pennywise.ai  /  Demo@1234
The demo user is flagged is_demo=True so the UI can show a "demo data" banner.
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from .analytics import get_or_create_budget, sync_goals
from .auth import hash_password
from .database import Base, SessionLocal, engine
from .models import Budget, SavingsGoal, Transaction, User
from .rounding import calculate_roundup
from . import ml_service

DEMO_EMAIL = "demo@pennywise.ai"
DEMO_PASSWORD = "Demo@1234"

# (merchant, description, category, min rupees, max rupees, weight)
TEMPLATES = [
    ("Swiggy", "Biryani and raita dinner", "Food & Drinks", 180, 520, 9),
    ("Zomato", "Pizza night with friends", "Food & Drinks", 250, 700, 5),
    ("College Canteen", "Lunch and chai", "Food & Drinks", 60, 140, 8),
    ("DMart", "Weekly groceries", "Food & Drinks", 600, 1800, 3),
    ("Starbucks", "Cold coffee", "Food & Drinks", 220, 420, 3),
    ("Uber", "Ride to the railway station", "Transport", 90, 380, 6),
    ("Rapido", "Bike taxi to college", "Transport", 40, 110, 6),
    ("Indian Oil", "Petrol for the bike", "Transport", 300, 700, 3),
    ("Amazon", "Phone case and cable", "Shopping", 199, 1499, 3),
    ("Myntra", "Shirt and jeans", "Shopping", 899, 2999, 2),
    ("Netflix", "Monthly subscription", "Entertainment", 199, 649, 1),
    ("BookMyShow", "Movie tickets", "Entertainment", 300, 700, 2),
    ("Apollo Pharmacy", "Medicines", "Health", 120, 650, 2),
    ("Udemy", "Machine learning course", "Education", 449, 649, 1),
    ("Jio", "Mobile recharge", "Bills & Utilities", 239, 299, 1),
    ("Haircut", "Salon visit", "Other", 150, 400, 1),
]


def seed() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    rng = random.Random(7)  # fixed seed: same demo data every time
    db = SessionLocal()
    try:
        old = db.query(User).filter_by(email=DEMO_EMAIL).first()
        if old:
            db.query(Transaction).filter_by(user_id=old.id).delete()
            db.query(SavingsGoal).filter_by(user_id=old.id).delete()
            db.query(Budget).filter_by(user_id=old.id).delete()
            db.delete(old)
            db.commit()

        user = User(name="Demo Student", email=DEMO_EMAIL, hashed_password=hash_password(DEMO_PASSWORD), is_demo=True)
        db.add(user)
        db.commit()
        db.refresh(user)

        today = date.today()
        weights = [t[5] for t in TEMPLATES]
        for days_ago in range(0, 62):
            d = today - timedelta(days=days_ago)
            for _ in range(rng.choice([0, 1, 1, 1, 2])):
                m, desc, cat, lo, hi, _w = rng.choices(TEMPLATES, weights=weights)[0]
                amount = Decimal(rng.randint(lo, hi))
                if rng.random() < 0.4:
                    amount += Decimal(rng.choice(["0.50", "0.00", "0.00"]))
                paise = int(amount * 100)
                budget = get_or_create_budget(db, user.id, d.month, d.year)
                rounded, saved = calculate_roundup(paise, budget.rounding_increment_paise)
                pred = ml_service.predict_category(f"{m} {desc}")
                db.add(
                    Transaction(
                        user_id=user.id, merchant=m, description=desc, category=cat, amount_paise=paise,
                        rounded_amount_paise=rounded, savings_paise=saved, transaction_date=d,
                        predicted_category=pred["category"], ml_confidence=pred["confidence"],
                    )
                )
        # monthly rent on the 1st of the current month
        budget = get_or_create_budget(db, user.id, today.month, today.year)
        db.add(Transaction(user_id=user.id, merchant="Landlord", description="Monthly PG rent", category="Housing",
                           amount_paise=550000, rounded_amount_paise=550000, savings_paise=0,
                           transaction_date=today.replace(day=1), predicted_category="Housing", ml_confidence=0.9))
        db.add_all([
            SavingsGoal(user_id=user.id, title="New headphones", target_amount_paise=250000),
            SavingsGoal(user_id=user.id, title="Goa trip fund", target_amount_paise=1500000),
        ])
        db.commit()
        sync_goals(db, user.id)
        n = db.query(Transaction).filter_by(user_id=user.id).count()
        print(f"Demo account ready: {DEMO_EMAIL} / {DEMO_PASSWORD}  ({n} synthetic transactions)")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
