"""Train the expense category classifier.

Run from the backend folder:   python -m app.train_model

Steps: load CSV -> stratified train/test split -> TF-IDF + Logistic Regression pipeline
-> evaluate on the held-out test set -> save model (joblib) and metrics (JSON).
"""
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from .config import settings

DATA_PATH = Path(__file__).resolve().parent / "data" / "expenses.csv"
RANDOM_SEED = 42
TEST_SIZE = 0.2


def load_dataset(path: Path = DATA_PATH) -> tuple[list[str], list[str]]:
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return [r["text"] for r in rows], [r["category"] for r in rows]


def build_pipeline() -> Pipeline:
    return Pipeline(
        [
            ("tfidf", TfidfVectorizer(lowercase=True, ngram_range=(1, 2), sublinear_tf=True)),
            ("clf", LogisticRegression(C=50.0, max_iter=1000, random_state=RANDOM_SEED)),
        ]
    )


def train(model_path: Path | None = None, metrics_path: Path | None = None) -> dict:
    model_path = Path(model_path or settings.model_path)
    metrics_path = Path(metrics_path or model_path.with_name("metrics.json"))

    texts, labels = load_dataset()
    x_train, x_test, y_train, y_test = train_test_split(
        texts, labels, test_size=TEST_SIZE, random_state=RANDOM_SEED, stratify=labels
    )

    pipeline = build_pipeline()
    pipeline.fit(x_train, y_train)

    y_pred = pipeline.predict(x_test)
    metrics = {
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "macro_f1": round(float(f1_score(y_test, y_pred, average="macro")), 4),
        "n_train": len(x_train),
        "n_test": len(x_test),
        "n_classes": len(set(labels)),
        "random_seed": RANDOM_SEED,
        "test_size": TEST_SIZE,
        "per_class": classification_report(y_test, y_pred, output_dict=True, zero_division=0),
        "sklearn_version": sklearn.__version__,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "note": "Evaluated on a small synthetic dataset; real-world accuracy will be lower.",
    }

    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, model_path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return metrics


if __name__ == "__main__":
    m = train()
    print(f"Saved model to {settings.model_path}")
    print(f"Train size: {m['n_train']}  Test size: {m['n_test']}")
    print(f"Accuracy: {m['accuracy']:.3f}   Macro-F1: {m['macro_f1']:.3f}")
