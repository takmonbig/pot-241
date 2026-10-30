"""Iteration 16: POT24 house games (color/matka timed rounds, andar, teen, break10, ludo, callbreak),
admin dashboard + house controls (aviator force, color override), profile summary, live feed."""
import os
import time
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
P1 = ("8800112233", "Test@123")
ADMIN = ("9999999999", "Admin@123")


def _login(mobile, pw, path="/auth/login"):
    s = requests.Session()
    r = s.post(f"{API}{path}", json={"mobile": mobile, "password": pw})
    assert r.status_code == 200, r.text
    d = r.json()
    s.cookies.clear()
    s.headers["Authorization"] = f"Bearer {d.get('access_token') or d.get('token')}"
    return s


def _bal(s):
    w = s.get(f"{API}/wallet").json()
    w = w.get("wallet", w)
    return round(w.get("main_balance", 0) + w.get("bonus_balance", 0), 2)


@pytest.fixture(scope="module")
def mdb():
    return MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "timeup_database")]


@pytest.fixture(scope="module")
def s1(mdb):
    mdb.users.update_one({"mobile": P1[0]}, {"$set": {"main_balance": 50000, "bonus_balance": 0}})
    return _login(*P1)


@pytest.fixture(scope="module")
def adm():
    try:
        return _login(*ADMIN)
    except AssertionError:
        return _login(*ADMIN, path="/admin/login")


def _secs_to(iso):
    return (datetime.fromisoformat(iso) - datetime.now(timezone.utc)).total_seconds()


def _wait_open(s, game, need=3):
    for _ in range(40):
        st = s.get(f"{API}/house/{game}/state").json()
        if _secs_to(st["round"]["lock_at"]) > need:
            return st
        time.sleep(1)
    raise AssertionError("no open window")


# --- timed state ---
@pytest.mark.parametrize("game,secs", [("color", 30), ("matka", 120)])
def test_timed_state(s1, game, secs):
    r = s1.get(f"{API}/house/{game}/state")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("period", "ends_at", "lock_at", "server_seed_hash", "round_seconds"):
        assert k in d["round"]
    assert d["round"]["round_seconds"] == secs
    assert isinstance(d["history"], list) and isinstance(d["my_bets"], list)
    assert "min_bet" in d["config"]
    lock_gap = (datetime.fromisoformat(d["round"]["ends_at"]) - datetime.fromisoformat(d["round"]["lock_at"])).total_seconds()
    assert lock_gap == (5 if game == "color" else 10)
    assert all("server_seed" not in h for h in d["history"])
    assert s1.get(f"{API}/house/foo/state").status_code == 404


def test_timed_bet_validation(s1):
    assert s1.post(f"{API}/house/color/bet", json={"kind": "color", "pick": "blue", "amount": 10}).status_code == 400
    assert s1.post(f"{API}/house/color/bet", json={"kind": "number", "pick": "10", "amount": 10}).status_code == 400
    assert s1.post(f"{API}/house/color/bet", json={"kind": "color", "pick": "red", "amount": 5}).status_code == 400
    assert s1.post(f"{API}/house/color/bet", json={"kind": "color", "pick": "red", "amount": 10001}).status_code == 400
    assert s1.post(f"{API}/house/matka/bet", json={"kind": "jodi", "pick": "100", "amount": 10}).status_code == 400
    assert s1.post(f"{API}/house/matka/bet", json={"kind": "single", "pick": "a", "amount": 10}).status_code == 400
    assert s1.post(f"{API}/house/matka/bet", json={"kind": "single", "pick": "3", "amount": 6000}).status_code == 400


def test_color_bet_locked(s1):
    for _ in range(40):
        st = s1.get(f"{API}/house/color/state").json()
        t = _secs_to(st["round"]["lock_at"])
        if -4 < t < -1:
            r = s1.post(f"{API}/house/color/bet", json={"kind": "color", "pick": "red", "amount": 10})
            assert r.status_code == 409, r.text
            return
        time.sleep(0.7)
    pytest.skip("did not hit lock window")


# --- admin override color + real settlement ---
def test_color_override_and_payout(s1, adm, mdb):
    st = _wait_open(s1, "color", 4)
    r = adm.post(f"{API}/admin/house/control", json={"target": "color", "value": 7})
    assert r.status_code == 200, r.text
    period = st["round"]["period"]
    b0 = _bal(s1)
    bets = [("number", "7", 10), ("color", "green", 10), ("size", "big", 10), ("color", "red", 10), ("color", "violet", 10)]
    for k, p, a in bets:
        r = s1.post(f"{API}/house/color/bet", json={"kind": k, "pick": p, "amount": a})
        assert r.status_code == 200, r.text
    assert round(b0 - _bal(s1), 2) == 50
    time.sleep(max(0, _secs_to(st["round"]["ends_at"])) + 4)
    d = s1.get(f"{API}/house/color/state").json()
    h = [x for x in d["history"] if x["period"] == period]
    assert h and h[0]["result"] == 7, h
    mine = [b for b in d["my_bets"] if b["period"] == period]
    assert len(mine) == 5
    prizes = {(b["kind"], b["pick"]): b["prize"] for b in mine}
    assert prizes[("number", "7")] == 90 and prizes[("color", "green")] == 20 and prizes[("size", "big")] == 20
    assert prizes[("color", "red")] == 0 and prizes[("color", "violet")] == 0
    assert round(_bal(s1) - b0, 2) == 80  # -50 + 130
    assert mdb.audit_logs.find_one({"action": "house_control_color"}) is not None
    cfgdoc = mdb.house_config.find_one({"_id": "main"}) or {}
    assert "color" not in (cfgdoc.get("overrides") or {})


def test_color_override_zero_half_payout(s1, adm):
    st = _wait_open(s1, "color", 4)
    adm.post(f"{API}/admin/house/control", json={"target": "color", "value": 0})
    period = st["round"]["period"]
    s1.post(f"{API}/house/color/bet", json={"kind": "color", "pick": "red", "amount": 100})
    s1.post(f"{API}/house/color/bet", json={"kind": "color", "pick": "violet", "amount": 100})
    s1.post(f"{API}/house/color/bet", json={"kind": "size", "pick": "small", "amount": 100})
    time.sleep(max(0, _secs_to(st["round"]["ends_at"])) + 4)
    d = s1.get(f"{API}/house/color/state").json()
    prizes = {(b["kind"], b["pick"]): b["prize"] for b in d["my_bets"] if b["period"] == period}
    assert prizes == {("color", "red"): 150, ("color", "violet"): 450, ("size", "small"): 200}, prizes


def test_matka_bet_debit(s1):
    _wait_open(s1, "matka", 3)
    b0 = _bal(s1)
    r = s1.post(f"{API}/house/matka/bet", json={"kind": "jodi", "pick": "07", "amount": 10})
    assert r.status_code == 200, r.text
    assert r.json()["bet"]["pick"] == "7"
    r = s1.post(f"{API}/house/matka/bet", json={"kind": "single", "pick": "7", "amount": 10})
    assert r.status_code == 200
    assert round(b0 - _bal(s1), 2) == 20


def test_admin_matka_control_validation(adm):
    assert adm.post(f"{API}/admin/house/control", json={"target": "matka", "value": 150}).status_code == 400
    assert adm.post(f"{API}/admin/house/control", json={"target": "color", "value": 12}).status_code == 400
    assert adm.post(f"{API}/admin/house/control", json={"target": "xyz", "value": 1}).status_code == 400
    assert adm.post(f"{API}/admin/house/control", json={"target": "matka", "value": None}).status_code == 200


# --- instant games ---
def test_andar(s1):
    assert s1.post(f"{API}/house/andar/play", json={"bet": 10, "side": "x"}).status_code == 400
    b0 = _bal(s1)
    r = s1.post(f"{API}/house/andar/play", json={"bet": 100, "side": "andar"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["winner"] in ("andar", "bahar") and "joker" in d
    exp = 190 if d["winner"] == "andar" else 0
    assert d["prize"] == exp
    assert round(_bal(s1) - b0, 2) == exp - 100


def test_teen(s1):
    for _ in range(5):
        b0 = _bal(s1)
        r = s1.post(f"{API}/house/teen/play", json={"bet": 100})
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["you"]) == 3 and len(d["dealer"]) == 3
        exp = 100 if d["push"] else (195 if d["won"] else 0)
        assert d["prize"] == exp
        assert round(_bal(s1) - b0, 2) == exp - 100


def test_break10(s1):
    b0 = _bal(s1)
    r = s1.post(f"{API}/house/break10/start", json={"bet": 100})
    assert r.status_code == 200, r.text
    sid = r.json()["session_id"]
    assert round(b0 - _bal(s1), 2) == 100
    d = s1.post(f"{API}/house/break10/act", json={"session_id": sid, "action": "hit"}).json()
    if not d["done"]:
        d = s1.post(f"{API}/house/break10/act", json={"session_id": sid, "action": "stand"}).json()
    assert d["done"] and d["outcome"] in ("win", "lose", "push", "bust")
    assert round(_bal(s1) - b0, 2) == round(d["prize"] - 100, 2)
    assert s1.post(f"{API}/house/break10/act", json={"session_id": sid, "action": "hit"}).status_code == 409


def test_ludo_complete(s1):
    b0 = _bal(s1)
    r = s1.post(f"{API}/house/ludo/start", json={"bet": 100})
    assert r.status_code == 200, r.text
    sid = r.json()["session_id"]
    st = r.json()["state"]
    d = None
    for _ in range(300):
        roll = st["roll"]
        mv = [i for i in (0, 1) if st["you"][i] + roll <= 30]
        tok = max(mv, key=lambda i: st["you"][i]) if mv else 0
        rr = s1.post(f"{API}/house/ludo/move", json={"session_id": sid, "value": tok})
        assert rr.status_code == 200, rr.text
        d = rr.json()
        st = d["state"]
        if d["done"]:
            break
    assert d and d["done"]
    exp = 190 if d["won"] else 0
    assert round(_bal(s1) - b0, 2) == exp - 100
    assert s1.post(f"{API}/house/ludo/move", json={"session_id": sid, "value": 0}).status_code == 409


def test_callbreak_complete(s1):
    b0 = _bal(s1)
    r = s1.post(f"{API}/house/callbreak/start", json={"bet": 100})
    assert r.status_code == 200, r.text
    sid = r.json()["session_id"]
    assert r.json()["phase"] == "bid" and len(r.json()["state"]["hand"]) == 5
    assert s1.post(f"{API}/house/callbreak/act", json={"session_id": sid, "value": 9}).status_code == 400
    d = s1.post(f"{API}/house/callbreak/act", json={"session_id": sid, "value": 2}).json()
    assert d["phase"] == "play"
    illegal_checked = False
    for _ in range(10):
        st = d["state"]
        hand, trick = st["hand"], st["trick"]
        if trick:
            lead = trick[0]["card"]["suit"]
            legal = [i for i, c in enumerate(hand) if c["suit"] == lead] or list(range(len(hand)))
            bad = [i for i, c in enumerate(hand) if c["suit"] != lead]
            if bad and len(legal) < len(hand) and not illegal_checked:
                rr = s1.post(f"{API}/house/callbreak/act", json={"session_id": sid, "value": bad[0]})
                assert rr.status_code == 400, rr.text
                illegal_checked = True
        else:
            legal = list(range(len(hand)))
        rr = s1.post(f"{API}/house/callbreak/act", json={"session_id": sid, "value": legal[0]})
        assert rr.status_code == 200, rr.text
        d = rr.json()
        if d["phase"] == "done":
            break
    assert d["phase"] == "done" and len(d["scores"]) == 4
    exp = 350 if d["won"] else 0
    assert round(_bal(s1) - b0, 2) == exp - 100
    assert s1.post(f"{API}/house/callbreak/act", json={"session_id": sid, "value": 0}).status_code == 409
    print("illegal card checked:", illegal_checked)


def test_instant_bet_limits(s1):
    assert s1.post(f"{API}/house/teen/play", json={"bet": 5}).status_code == 400
    assert s1.post(f"{API}/house/ludo/start", json={"bet": 10}).status_code == 400
    assert s1.post(f"{API}/house/callbreak/start", json={"bet": 6000}).status_code == 400


# --- admin ---
def test_admin_dashboard(adm, s1):
    assert s1.get(f"{API}/admin/dashboard").status_code == 403
    for p in ("today", "week", "month"):
        r = adm.get(f"{API}/admin/dashboard", params={"period": p})
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("active_users", "new_users", "total_revenue", "series", "game_revenue", "agents", "controls"):
            assert k in d


def test_aviator_force(adm, s1, mdb):
    r = adm.post(f"{API}/admin/house/control", json={"target": "aviator", "value": 1.5, "rounds": 2})
    assert r.status_code == 200
    cps = []
    for _ in range(3):
        rr = s1.post(f"{API}/games/aviator/start", json={"bet": 20})
        assert rr.status_code == 200, rr.text
        cps.append(rr.json()["crash_point"])
    assert cps[0] == 1.5 and cps[1] == 1.5, cps
    doc = mdb.house_config.find_one({"_id": "main"})
    assert doc.get("aviator_force") is None
    # clear path
    adm.post(f"{API}/admin/house/control", json={"target": "aviator", "value": 3, "rounds": 1})
    adm.post(f"{API}/admin/house/control", json={"target": "aviator", "value": None})
    assert mdb.house_config.find_one({"_id": "main"}).get("aviator_force") is None
    assert mdb.audit_logs.find_one({"action": "house_control_aviator"}) is not None


# --- profile & feed ---
def test_profile_summary(s1):
    r = s1.get(f"{API}/profile/summary")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("total_matches", "wins", "win_rate", "profit", "favorite_game", "rank", "badges", "last_matches"):
        assert k in d
    assert d["total_matches"] > 0 and len(d["badges"]) == 4


def test_live_feed(s1):
    r = s1.get(f"{API}/feed/live")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("deposit", "withdrawal", "jackpot", "playing"):
        assert k in d
