import datetime as dt
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .config import ALLOWED_INCREMENTS_PAISE, CATEGORIES

MAX_AMOUNT = Decimal("10000000")  # Rs 1 crore sanity cap


def _check_amount(v: Decimal) -> Decimal:
    if v <= 0:
        raise ValueError("Amount must be greater than 0")
    if v > MAX_AMOUNT:
        raise ValueError("Amount is too large")
    if v != v.quantize(Decimal("0.01")):
        raise ValueError("Amount can have at most 2 decimal places")
    return v


def rupees_to_paise(v: Decimal) -> int:
    return int((v * 100).to_integral_value())


# ---------- auth ----------
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: str
    is_demo: bool = False
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- transactions ----------
class TransactionIn(BaseModel):
    merchant: str = Field(min_length=1, max_length=120)
    amount: Decimal  # in rupees
    transaction_date: date = Field(default_factory=date.today)
    description: str = Field(default="", max_length=500)
    category: Optional[str] = None  # None -> the ML model decides

    @field_validator("merchant")
    @classmethod
    def clean_merchant(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Merchant cannot be empty")
        return v

    @field_validator("amount")
    @classmethod
    def check_amount(cls, v: Decimal) -> Decimal:
        return _check_amount(v)

    @field_validator("category")
    @classmethod
    def check_category(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in CATEGORIES:
            raise ValueError(f"Category must be one of: {', '.join(CATEGORIES)}")
        return v


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    merchant: str
    amount_paise: int
    rounded_amount_paise: int
    savings_paise: int
    category: str
    predicted_category: Optional[str]
    ml_confidence: Optional[float]
    description: str
    transaction_date: date
    created_at: datetime


# ---------- budget / savings ----------
class BudgetIn(BaseModel):
    monthly_limit: Decimal  # rupees
    rounding_increment: int = 10  # rupees: 10, 50 or 100

    @field_validator("monthly_limit")
    @classmethod
    def check_limit(cls, v: Decimal) -> Decimal:
        return _check_amount(v)

    @field_validator("rounding_increment")
    @classmethod
    def check_inc(cls, v: int) -> int:
        if v * 100 not in ALLOWED_INCREMENTS_PAISE:
            raise ValueError("Rounding increment must be 10, 50 or 100")
        return v


class BudgetOut(BaseModel):
    month: int
    year: int
    monthly_limit_paise: int
    rounding_increment_paise: int


class GoalIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    target_amount: Decimal  # rupees

    @field_validator("title")
    @classmethod
    def clean_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Title cannot be empty")
        return v

    @field_validator("target_amount")
    @classmethod
    def check_target(cls, v: Decimal) -> Decimal:
        return _check_amount(v)


class GoalOut(BaseModel):
    id: int
    title: str
    target_amount_paise: int
    saved_amount_paise: int
    created_at: datetime


# ---------- AI ----------
class ExtractIn(BaseModel):
    text: str = Field(min_length=3, max_length=500)


class ChatIn(BaseModel):
    question: str = Field(min_length=2, max_length=500)


class ExtractedTransaction(BaseModel):
    """Validated shape of what the LLM must return. Anything else is rejected."""

    merchant: str = Field(min_length=1, max_length=120)
    amount: Decimal
    category: Optional[str] = None
    # NB: annotated via dt.date because the field is itself called `date` (it would shadow the type).
    date: Optional[dt.date] = None
    description: str = Field(default="", max_length=500)

    @field_validator("amount")
    @classmethod
    def check_amount(cls, v: Decimal) -> Decimal:
        return _check_amount(v)

    @field_validator("category")
    @classmethod
    def check_category(cls, v: Optional[str]) -> Optional[str]:
        # An unknown category from the LLM is dropped (the ML model will suggest one instead).
        return v if v in CATEGORIES else None

    @field_validator("merchant")
    @classmethod
    def clean_merchant(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("empty merchant")
        return v
