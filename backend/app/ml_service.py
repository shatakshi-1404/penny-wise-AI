"""Loads the custom TF-IDF + Logistic Regression model and predicts expense categories.
Works fully offline: no Groq key needed."""
import json
import logging
import warnings

import joblib
from sklearn.exceptions import InconsistentVersionWarning

from .config import settings

log = logging.getLogger("pennywise.ml")

# Below this probability we flag the prediction as "uncertain" so the UI can ask the user to confirm.
CONFIDENCE_THRESHOLD = 0.40

_model = None


def _load_from_disk():
    with warnings.catch_warnings():
        # A model pickled by a different scikit-learn version is treated as unusable -> retrain.
        warnings.simplefilter("error", InconsistentVersionWarning)
        return joblib.load(settings.model_path)


def load_model(force_reload: bool = False):
    """Load the model once. If the file is missing/incompatible, train a fresh one from the CSV."""
    global _model
    if _model is not None and not force_reload:
        return _model
    try:
        _model = _load_from_disk()
    except Exception as exc:  # missing file, version mismatch, corrupt file
        log.warning("Could not load model (%s). Training a new one.", exc)
        from .train_model import train

        train()
        _model = _load_from_disk()
    return _model


def predict_category(text: str) -> dict:
    """Return {category, confidence, uncertain, top3}."""
    text = (text or "").strip()
    if not text:
        return {"category": "Other", "confidence": 0.0, "uncertain": True, "top3": []}
    try:
        model = load_model()
        proba = model.predict_proba([text])[0]
        classes = list(model.classes_)
        ranked = sorted(zip(classes, proba), key=lambda p: p[1], reverse=True)
        best, conf = ranked[0]
        return {
            "category": str(best),
            "confidence": round(float(conf), 4),
            "uncertain": bool(conf < CONFIDENCE_THRESHOLD),
            "top3": [{"category": str(c), "confidence": round(float(p), 4)} for c, p in ranked[:3]],
        }
    except Exception as exc:  # never break expense tracking because of the model
        log.error("Prediction failed: %s", exc)
        return {"category": "Other", "confidence": 0.0, "uncertain": True, "top3": []}


def get_metrics() -> dict | None:
    path = settings.model_path.with_name("metrics.json")
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
