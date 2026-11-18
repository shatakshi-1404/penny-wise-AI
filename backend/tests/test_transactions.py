from datetime import date

from .conftest import register

TX = {"merchant": "Domino's", "amount": "142", "description": "Pizza", "transaction_date": date.today().isoformat()}


def test_requires_auth(client):
    assert client.get("/api/transactions").status_code == 401
    assert client.get("/api/dashboard/summary").status_code == 401


def test_register_login_me(client):
    register(client, "x@example.com")
    r = client.post("/api/auth/login", json={"email": "x@example.com", "password": "password123"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["email"] == "x@example.com"
    assert client.post("/api/auth/login", json={"email": "x@example.com", "password": "wrongpass"}).status_code == 401
    dup = client.post("/api/auth/register", json={"name": "A", "email": "x@example.com", "password": "password123"})
    assert dup.status_code == 409


def test_create_transaction_stores_roundup_and_ml_category(client, auth):
    r = client.post("/api/transactions", json=TX, headers=auth)
    assert r.status_code == 201
    d = r.json()
    assert (d["amount_paise"], d["rounded_amount_paise"], d["savings_paise"]) == (14200, 15000, 800)
    assert d["predicted_category"] == "Food & Drinks" and d["category"] == "Food & Drinks"
    assert d["ml_confidence"] is not None


def test_manual_category_override_keeps_prediction(client, auth):
    d = client.post("/api/transactions", json={**TX, "category": "Shopping"}, headers=auth).json()
    assert d["category"] == "Shopping" and d["predicted_category"] == "Food & Drinks"


def test_already_rounded_amount_saves_zero(client, auth):
    d = client.post("/api/transactions", json={**TX, "amount": "950"}, headers=auth).json()
    assert d["savings_paise"] == 0 and d["rounded_amount_paise"] == 95000


def test_validation_rejects_bad_input(client, auth):
    for bad in (
        {**TX, "amount": "0"},
        {**TX, "amount": "-5"},
        {**TX, "amount": "12.345"},
        {**TX, "amount": "abc"},
        {**TX, "merchant": "   "},
        {**TX, "category": "Spaceships"},
        {**TX, "transaction_date": "not-a-date"},
    ):
        assert client.post("/api/transactions", json=bad, headers=auth).status_code == 422, bad


def test_update_and_delete(client, auth):
    tid = client.post("/api/transactions", json=TX, headers=auth).json()["id"]
    r = client.put(f"/api/transactions/{tid}", json={**TX, "amount": "299", "category": "Other"}, headers=auth)
    assert r.status_code == 200 and r.json()["savings_paise"] == 100 and r.json()["category"] == "Other"
    assert client.delete(f"/api/transactions/{tid}", headers=auth).status_code == 204
    assert client.get("/api/transactions", headers=auth).json() == []


def test_user_ownership_is_enforced(client, auth):
    tid = client.post("/api/transactions", json=TX, headers=auth).json()["id"]
    other = register(client, "other@example.com", "Other")
    assert client.get("/api/transactions", headers=other).json() == []
    assert client.put(f"/api/transactions/{tid}", json=TX, headers=other).status_code == 404
    assert client.delete(f"/api/transactions/{tid}", headers=other).status_code == 404
    assert len(client.get("/api/transactions", headers=auth).json()) == 1


def test_search_and_filter(client, auth):
    client.post("/api/transactions", json=TX, headers=auth)
    client.post("/api/transactions", json={**TX, "merchant": "Uber", "description": "cab ride", "amount": "300"}, headers=auth)
    assert len(client.get("/api/transactions?q=uber", headers=auth).json()) == 1
    assert len(client.get("/api/transactions?category=Transport", headers=auth).json()) == 1


def test_dashboard_and_budget_increment_recalculates(client, auth):
    client.post("/api/transactions", json=TX, headers=auth)  # 142 -> save 8 at Rs10
    s = client.get("/api/dashboard/summary", headers=auth).json()
    assert s["total_expenses_paise"] == 14200 and s["month_savings_paise"] == 800
    r = client.put("/api/budget", json={"monthly_limit": "5000", "rounding_increment": 50}, headers=auth)
    assert r.status_code == 200
    s = client.get("/api/dashboard/summary", headers=auth).json()
    assert s["month_savings_paise"] == 800  # 142 -> 150 at Rs 50 is still Rs 8
    assert s["remaining_paise"] == 500000 - 14200
    assert client.put("/api/budget", json={"monthly_limit": "5000", "rounding_increment": 25}, headers=auth).status_code == 422
    assert len(client.get("/api/dashboard/weekly", headers=auth).json()) == 7
    assert client.get("/api/dashboard/categories", headers=auth).json()[0]["category"] == "Food & Drinks"


def test_savings_goals_flow(client, auth):
    client.post("/api/transactions", json={**TX, "amount": "299"}, headers=auth)  # saves Rs 1
    g = client.post("/api/savings/goals", json={"title": "Headphones", "target_amount": "2500"}, headers=auth)
    assert g.status_code == 201 and g.json()["saved_amount_paise"] == 100
    s = client.get("/api/savings", headers=auth).json()
    assert s["total_savings_paise"] == 100 and len(s["goals"]) == 1
    other = register(client, "o2@example.com")
    assert client.delete(f"/api/savings/goals/{g.json()['id']}", headers=other).status_code == 404
    assert client.delete(f"/api/savings/goals/{g.json()['id']}", headers=auth).status_code == 204
