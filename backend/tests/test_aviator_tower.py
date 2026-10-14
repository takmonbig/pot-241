"""Backend tests for Aviator & Tower games (iteration 9)."""
import os
import time
import math
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://timeup-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TEST_MOBILE = "8800112233"
TEST_PASSWORD = "Test@123"
TEST_NAME = "Aviator Tester"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # try login, else register
    r = s.post(f"{API}/auth/login", json={"mobile": TEST_MOBILE, "password": TEST_PASSWORD})
    if r.status_code != 200:
        s.post(f"{API}/auth/register", json={"full_name": TEST_NAME, "mobile": TEST_MOBILE, "password": TEST_PASSWORD})
        r = s.post(f"{API}/auth/login", json={"mobile": TEST_MOBILE, "password": TEST_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    if token:
        s.headers["Authorization"] = f"Bearer {token}"
    # Top-up balance via Mongo
    from pymongo import MongoClient
    mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    dbname = os.environ.get("DB_NAME", "test_database")
    mc[dbname].users.update_one({"mobile": TEST_MOBILE}, {"$set": {"main_balance": 10000, "bonus_balance": 0}})
    return s


def _bal(s):
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 200, r.text
    me = r.json()
    return (me.get("main_balance", 0) or 0) + (me.get("bonus_balance", 0) or 0)


def test_config_has_aviator_tower(session):
    r = session.get(f"{API}/config/public")
    assert r.status_code == 200
    data = r.json()
    assert "aviator_config" in data and data["aviator_config"]["enabled"] is True
    assert "tower_config" in data and data["tower_config"]["enabled"] is True
    assert "easy" in data["tower_config"]["difficulties"]


def test_aviator_start_and_cashout_win(session):
    bal_before = _bal(session)
    r = session.post(f"{API}/games/aviator/start", json={"bet": 50})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "session_id" in d and "nonce" in d and "crash_point" in d and "growth_rate" in d
    cp = float(d["crash_point"])
    # If crash_point is >1.5 we can cash out at 1.2x safely
    if cp > 1.5:
        # Wait until server elapsed enough to reach ~1.2x
        k = d["growth_rate"]
        t_target = math.log(1.2) / k
        time.sleep(t_target + 0.3)
        r2 = session.post(f"{API}/games/aviator/cashout",
                          json={"session_id": d["session_id"], "nonce": d["nonce"], "multiplier": 1.2})
        assert r2.status_code == 200, r2.text
        res = r2.json()
        assert res["won"] is True
        assert res["prize"] >= 50 * 1.0
        bal_after = _bal(session)
        # bet 50 debited, prize credited
        assert bal_after == pytest.approx(bal_before - 50 + res["prize"], abs=0.1)
    else:
        # Instant/early crash scenario -> cashing out should return won=False
        time.sleep(0.5)
        r2 = session.post(f"{API}/games/aviator/cashout",
                          json={"session_id": d["session_id"], "nonce": d["nonce"], "multiplier": 1.2})
        assert r2.status_code == 200
        assert r2.json()["won"] is False


def test_aviator_insufficient_balance(session):
    # Temporarily lower balance to below min_bet
    from pymongo import MongoClient
    mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    dbname = os.environ.get("DB_NAME", "test_database")
    mc[dbname].users.update_one({"mobile": TEST_MOBILE}, {"$set": {"main_balance": 5, "bonus_balance": 0}})
    try:
        r = session.post(f"{API}/games/aviator/start", json={"bet": 100})
        assert r.status_code == 400
        assert "insufficient" in r.text.lower()
    finally:
        mc[dbname].users.update_one({"mobile": TEST_MOBILE}, {"$set": {"main_balance": 10000}})


def test_aviator_min_bet(session):
    r = session.post(f"{API}/games/aviator/start", json={"bet": 5})
    assert r.status_code == 400


def test_aviator_double_cashout_rejected(session):
    r = session.post(f"{API}/games/aviator/start", json={"bet": 20})
    d = r.json()
    time.sleep(0.6)
    session.post(f"{API}/games/aviator/cashout",
                 json={"session_id": d["session_id"], "nonce": d["nonce"], "multiplier": 1.1})
    r2 = session.post(f"{API}/games/aviator/cashout",
                      json={"session_id": d["session_id"], "nonce": d["nonce"], "multiplier": 1.2})
    assert r2.status_code == 409


def test_tower_start_easy(session):
    bal_before = _bal(session)
    r = session.post(f"{API}/games/tower/start", json={"bet": 20, "difficulty": "easy"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["cols"] == 4 and d["bombs"] == 1 and d["rows"] == 8
    assert len(d["multipliers"]) == 8
    assert d["multipliers"][0] > 1.0
    bal_after = _bal(session)
    assert bal_after == pytest.approx(bal_before - 20, abs=0.1)
    # cashout before pick → 400
    r2 = session.post(f"{API}/games/tower/cashout",
                      json={"session_id": d["session_id"], "nonce": d["nonce"]})
    assert r2.status_code == 400


def test_tower_pick_until_outcome(session):
    r = session.post(f"{API}/games/tower/start", json={"bet": 20, "difficulty": "hard"})
    d = r.json()
    sid, nonce = d["session_id"], d["nonce"]
    # hard = 2 cols, 1 bomb → ~50% chance per row; just pick col 0 until bomb or finish
    for _ in range(8):
        pr = session.post(f"{API}/games/tower/pick",
                          json={"session_id": sid, "nonce": nonce, "col": 0})
        assert pr.status_code == 200, pr.text
        pd = pr.json()
        if not pd["safe"]:
            assert "bombs_layout" in pd
            return
        if pd.get("finished"):
            assert pd["prize"] > 0
            return


def test_tower_cashout_after_one_safe(session):
    # Try to get a safe pick & cashout. Hard=2 cols so set a few attempts
    for _ in range(6):
        r = session.post(f"{API}/games/tower/start", json={"bet": 20, "difficulty": "easy"})
        d = r.json()
        sid, nonce = d["session_id"], d["nonce"]
        # easy = 4 cols, 1 bomb → 75% chance safe pick
        pr = session.post(f"{API}/games/tower/pick",
                          json={"session_id": sid, "nonce": nonce, "col": 0}).json()
        if pr.get("safe"):
            bal_before = _bal(session)
            co = session.post(f"{API}/games/tower/cashout",
                              json={"session_id": sid, "nonce": nonce})
            assert co.status_code == 200
            cd = co.json()
            assert cd["won"] is True and cd["prize"] > 0
            bal_after = _bal(session)
            assert bal_after == pytest.approx(bal_before + cd["prize"], abs=0.1)
            return
    pytest.skip("Could not get a safe pick in 6 tries")


def test_tower_invalid_col(session):
    r = session.post(f"{API}/games/tower/start", json={"bet": 20, "difficulty": "easy"}).json()
    pr = session.post(f"{API}/games/tower/pick",
                      json={"session_id": r["session_id"], "nonce": r["nonce"], "col": 99})
    assert pr.status_code == 400
