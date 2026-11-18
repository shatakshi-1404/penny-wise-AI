import json
from datetime import date

import pytest

from app import ai_service
from app.config import settings


def test_missing_groq_key_gives_friendly_503(client, auth):
    assert settings.GROQ_API_KEY == ""
    r = client.post("/api/ai/extract-transaction", json={"text": "spent 350 at dominos"}, headers=auth)
    assert r.status_code == 503 and "Groq API key" in r.json()["detail"]


def test_chat_and_insights_fall_back_without_groq(client, auth):
    client.post("/api/transactions", json={"merchant": "Swiggy", "amount": "299", "description": "biryani"}, headers=auth)
    r = client.post("/api/ai/chat", json={"question": "How much did I save?"}, headers=auth).json()
    assert r["source"] == "fallback" and "₹1" in r["answer"]
    assert r["stats_used"]["total_virtual_savings_rs"] == 1.0
    i = client.post("/api/ai/insights", headers=auth).json()
    assert i["source"] == "fallback" and len(i["insights"]) >= 1


def test_normal_tracking_works_without_groq(client, auth):
    r = client.post("/api/transactions", json={"merchant": "Uber", "amount": "120"}, headers=auth)
    assert r.status_code == 201 and r.json()["category"] == "Transport"


GOOD = json.dumps({"merchant": "Domino's", "amount": 350, "category": "Food & Drinks", "date": "2026-11-17", "description": "Pizza"})


def test_valid_llm_output_is_parsed():
    tx = ai_service.parse_extraction(GOOD, today=date(2026, 11, 18))
    assert tx.merchant == "Domino's" and str(tx.amount) == "350" and tx.date == date(2026, 11, 17)


@pytest.mark.parametrize(
    "raw",
    [
        "not json at all",
        "[1, 2, 3]",
        json.dumps({"merchant": "X"}),  # missing amount
        json.dumps({"merchant": "X", "amount": 0}),
        json.dumps({"merchant": "X", "amount": -10}),
        json.dumps({"merchant": "X", "amount": "lots"}),
        json.dumps({"merchant": "", "amount": 10}),
    ],
)
def test_invalid_llm_output_is_rejected(raw):
    with pytest.raises(ai_service.AIError):
        ai_service.parse_extraction(raw)


def test_unknown_category_dropped_and_future_date_clamped():
    raw = json.dumps({"merchant": "X", "amount": 10, "category": "Crypto", "date": "2099-01-01"})
    tx = ai_service.parse_extraction(raw, today=date(2026, 11, 18))
    assert tx.category is None and tx.date == date(2026, 11, 18)


def test_endpoint_with_mocked_llm_and_disagreement(client, auth, monkeypatch):
    monkeypatch.setattr(ai_service, "_call_groq", lambda *a, **k: json.dumps(
        {"merchant": "Uber", "amount": 300, "category": "Shopping", "date": None, "description": "Uber ride"}))
    r = client.post("/api/ai/extract-transaction", json={"text": "300 on uber"}, headers=auth).json()
    assert r["ml"]["category"] == "Transport" and r["categories_disagree"] is True
    assert r["extracted"]["amount"] == "300"
    # Nothing is saved until the user confirms:
    assert client.get("/api/transactions", headers=auth).json() == []


def test_endpoint_rejects_garbage_llm_output(client, auth, monkeypatch):
    monkeypatch.setattr(ai_service, "_call_groq", lambda *a, **k: "Sure! Here's your expense")
    r = client.post("/api/ai/extract-transaction", json={"text": "spent some money"}, headers=auth)
    assert r.status_code == 502 and "couldn't understand" in r.json()["detail"]


def test_chat_uses_groq_when_available_but_stats_are_python(client, auth, monkeypatch):
    seen = {}

    def fake(messages, json_mode=False):
        seen["prompt"] = messages[-1]["content"]
        return "You are doing great."

    monkeypatch.setattr(ai_service, "_call_groq", fake)
    client.post("/api/transactions", json={"merchant": "Uber", "amount": "299"}, headers=auth)
    r = client.post("/api/ai/chat", json={"question": "biggest category?"}, headers=auth).json()
    assert r["source"] == "groq" and '"total_spent_rs": 299.0' in seen["prompt"]
