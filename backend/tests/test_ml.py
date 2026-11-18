import json

import joblib
import pytest

from app import ml_service
from app.config import CATEGORIES
from app.train_model import train


@pytest.fixture(scope="module")
def trained(tmp_path_factory):
    d = tmp_path_factory.mktemp("model")
    metrics = train(d / "m.joblib", d / "metrics.json")
    return d, metrics


def test_training_writes_model_and_honest_metrics(trained):
    d, m = trained
    assert (d / "m.joblib").exists()
    saved = json.loads((d / "metrics.json").read_text())
    assert saved["accuracy"] == m["accuracy"] and 0 <= m["macro_f1"] <= 1
    assert m["n_train"] + m["n_test"] == 300 and m["n_classes"] == 10
    assert m["accuracy"] > 0.5  # far above 10% chance


def test_training_is_reproducible(trained, tmp_path):
    _, m1 = trained
    m2 = train(tmp_path / "m.joblib", tmp_path / "metrics.json")
    assert (m1["accuracy"], m1["macro_f1"]) == (m2["accuracy"], m2["macro_f1"])


def test_model_loads_and_has_all_categories():
    model = ml_service.load_model()
    assert set(model.classes_) == set(CATEGORIES)


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Bought pizza at Domino's for 450", "Food & Drinks"),
        ("Paid 300 for an Uber ride", "Transport"),
        ("Bought headphones for 2500", "Shopping"),
        ("Paid electricity bill of 1800", "Bills & Utilities"),
    ],
)
def test_spec_examples_predicted(text, expected):
    r = ml_service.predict_category(text)
    assert r["category"] == expected and 0 < r["confidence"] <= 1 and not r["uncertain"]


def test_gibberish_is_flagged_uncertain():
    r = ml_service.predict_category("qwertyuiop zxcvb")
    assert r["uncertain"] is True


def test_empty_text_is_safe():
    assert ml_service.predict_category("   ")["uncertain"] is True


def test_missing_model_file_triggers_retrain(tmp_path, monkeypatch):
    monkeypatch.setattr(ml_service.settings, "ML_MODEL_PATH", str(tmp_path / "new.joblib"))
    monkeypatch.setattr(ml_service, "_model", None)
    model = ml_service.load_model(force_reload=True)
    assert (tmp_path / "new.joblib").exists() and hasattr(model, "predict_proba")
    monkeypatch.setattr(ml_service, "_model", None)  # let later tests reload the real model


def test_predict_endpoint(client, auth):
    r = client.post("/api/ml/predict-category", json={"text": "Netflix subscription"}, headers=auth)
    assert r.status_code == 200 and r.json()["category"] == "Entertainment"
    assert client.post("/api/ml/predict-category", json={"text": "x"}).status_code == 401
