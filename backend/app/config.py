"""Central settings, read from environment variables (.env supported)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


class Settings:
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/pennywise"
    )
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-only-secret-change-me")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    ML_MODEL_PATH: str = os.getenv("ML_MODEL_PATH", "app/models/category_classifier.joblib")
    TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    @property
    def model_path(self) -> Path:
        p = Path(self.ML_MODEL_PATH)
        return p if p.is_absolute() else BASE_DIR / p


settings = Settings()

CATEGORIES = [
    "Food & Drinks",
    "Shopping",
    "Transport",
    "Housing",
    "Bills & Utilities",
    "Health",
    "Entertainment",
    "Education",
    "Travel",
    "Other",
]
ALLOWED_INCREMENTS_PAISE = (1000, 5000, 10000)  # Rs 10, 50, 100
