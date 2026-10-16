"""Iteration 13: Race mode (/api/race) - public rooms, join rules, friends rooms, shared seeds, settlement,
refunds, solo-game isolation, defaults."""
import os
import time

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
P1 = ("8800112233", "Test@123")
P2 = ("8800112244", "Test@123")
GAMES = ["aviator", "tower", "chicken", "vortex", "stack"]


def _login(mobile, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"mobile": mobile, "password": pw})
    assert r.status_code == 200, r.text
    d = r.json()
    s.headers["Authorization"] = f"Bearer {d.get('access_token') or d.get('token')}"
    return s


@pytest.fixture(scope="module")
def mdb():
    return MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "timeup_database")]


@pytest.fixture(scope="module")
def s1(mdb):
    mdb.users.update_one({"mobile": P1[0]}, {"$set": {"main_balance": 20000, "bonus_balance": 0}})
    return _login(*P1)


@pytest.fixture(scope="module")
def s2(mdb):
    mdb.users.update_one({"mobile": P2[0]}, {"$set": {"main_balance": 20000, "bonus_balance": 0}})
    return _login(*P2)


def bal(mdb, mobile):
    u = mdb.users.find_one({"mobile": mobile})
    return round(u.get("main_balance", 0) + u.get("bonus_balance", 0), 2)


def friends(s1, s2, game, fee=50, group=False):
    r = s1.post(f"{API}/race/custom", json={"game": game, "group": group, "entry_fee": fee})
    assert r.status_code == 200, r.text
    room = r.json()
    j = s2.post(f"{API}/race/join-code", json={"code": room["room_code"]})
    assert j.status_code == 200, j.text
    st = s1.post(f"{API}/race/{room['id']}/start")
    assert st.status_code == 200, st.text
    assert st.json()["status"] == "LIVE"
    return room


def sess(mdb, sid):
    return mdb.game_sessions.find_one({"id": sid})


# --- Public room listing ---
class TestListing:
    def test_rooms_exist_for_all_games(self, s1):
        for g in GAMES:
            for kind in ["1v1", "rooms"]:
                r = s1.get(f"{API}/race/rooms", params={"game": g, "kind": kind, "tab": "active"})
                assert r.status_code == 200, r.text
                rooms = [x for x in r.json() if x["status"] == "OPEN"]
                fees = {x["entry_fee"] for x in rooms}
                assert {50, 100} <= fees, f"{g}/{kind} fees {fees}"
                for x in rooms:
                    if kind == "1v1":
                        assert x["prize"] == round(x["entry_fee"] * 1.8, 2)
                        assert x["max_players"] == 2
                    else:
                        assert x["prize"] == round(x["current_players"] * x["entry_fee"] * 0.9, 2)

    def test_completed_tab(self, s1):
        r = s1.get(f"{API}/race/rooms", params={"game": "chicken", "kind": "1v1", "tab": "completed"})
        assert r.status_code == 200
        assert all(x["status"] == "COMPLETED" for x in r.json())


# --- Join rules + public 1v1 goes LIVE with 2 humans + aviator shared crash + settlement ---
class TestPublic1v1:
    def test_join_live_shared_crash_and_settle(self, s1, s2, mdb):
        rooms = s1.get(f"{API}/race/rooms", params={"game": "aviator", "kind": "1v1"}).json()
        room = next(x for x in rooms if x["status"] == "OPEN" and x["entry_fee"] == 50 and x["current_players"] == 0)
        b1, b2 = bal(mdb, P1[0]), bal(mdb, P2[0])
        j1 = s1.post(f"{API}/race/{room['id']}/join")
        assert j1.status_code == 200 and j1.json()["joined"] and j1.json()["status"] == "OPEN"
        assert bal(mdb, P1[0]) == b1 - 50
        assert s1.post(f"{API}/race/{room['id']}/join").status_code == 409  # double join
        # play before LIVE -> 409
        assert s1.post(f"{API}/race/{room['id']}/play").status_code == 409
        j2 = s2.post(f"{API}/race/{room['id']}/join")
        assert j2.status_code == 200, j2.text
        assert j2.json()["status"] == "LIVE"
        a = s1.post(f"{API}/race/{room['id']}/play").json()
        b = s2.post(f"{API}/race/{room['id']}/play").json()
        # iter14: crash_point is hidden in race sessions; compare via the DB sessions instead
        assert a["crash_point"] is None and b["crash_point"] is None
        assert sess(mdb, a["session_id"])["crash_point"] == sess(mdb, b["session_id"])["crash_point"]
        assert s1.post(f"{API}/race/{room['id']}/play").status_code == 409  # once per player
        assert bal(mdb, P1[0]) == b1 - 50  # play does not debit
        time.sleep(1.5)
        crash = sess(mdb, a["session_id"])["crash_point"]
        m1 = max(1.0, round(min(crash - 0.01, 1.1), 2))
        c1 = s1.post(f"{API}/games/aviator/cashout", json={"session_id": a["session_id"], "nonce": a["nonce"], "multiplier": m1}).json()
        assert c1.get("race") is True and c1["prize"] == 0.0
        assert bal(mdb, P1[0]) == b1 - 50  # no direct credit
        r = s1.get(f"{API}/race/{room['id']}").json()
        assert r["status"] == "LIVE" and r["played"]
        c2 = s2.post(f"{API}/games/aviator/cashout", json={"session_id": b["session_id"], "nonce": b["nonce"], "multiplier": 1.0 if crash > 1.0 else 1.0}).json()
        assert c2.get("race") is True
        time.sleep(0.5)
        r = s1.get(f"{API}/race/{room['id']}").json()
        print("aviator race", crash, c1, c2, r["status"], r["players"])
        if crash <= 1.0 or (c1["multiplier"] == 0 and c2["multiplier"] == 0):
            assert r["status"] == "REFUNDED"
            assert bal(mdb, P1[0]) == b1 and bal(mdb, P2[0]) == b2
        else:
            assert r["status"] == "COMPLETED"
            win = next(p for p in r["players"] if p["rank"] == 1)
            assert win["prize"] == 90.0
            if c1["multiplier"] > c2["multiplier"]:
                assert win["is_you"] and bal(mdb, P1[0]) == b1 - 50 + 90
            assert r["fair"].get("server_seed")

    def test_insufficient_balance(self, s2, mdb):
        rooms = s2.get(f"{API}/race/rooms", params={"game": "tower", "kind": "rooms"}).json()
        room = next(x for x in rooms if x["status"] == "OPEN" and x["entry_fee"] == 100 and not x["joined"])
        mdb.users.update_one({"mobile": P2[0]}, {"$set": {"main_balance": 10, "bonus_balance": 0}})
        try:
            r = s2.post(f"{API}/race/{room['id']}/join")
            assert r.status_code == 400, r.text
        finally:
            mdb.users.update_one({"mobile": P2[0]}, {"$set": {"main_balance": 20000}})


# --- Friends rooms ---
class TestFriends:
    def test_custom_validation(self, s1):
        assert s1.post(f"{API}/race/custom", json={"game": "chicken", "group": False, "entry_fee": 40}).status_code == 400
        assert s1.post(f"{API}/race/custom", json={"game": "stopwatch", "group": False, "entry_fee": 50}).status_code == 400

    def test_group_min_30_max_10_no_fee(self, s1, s2, mdb):
        b1 = bal(mdb, P1[0])
        r = s1.post(f"{API}/race/custom", json={"game": "vortex", "group": True, "entry_fee": 30})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["room_code"].startswith("RF") and d["max_players"] == 10 and d["is_host"] and d["joined"]
        assert bal(mdb, P1[0]) == b1 - 30
        assert s1.post(f"{API}/race/{d['id']}/start").status_code == 400  # needs 2
        s2.post(f"{API}/race/join-code", json={"code": d["room_code"].lower()})
        assert s2.post(f"{API}/race/{d['id']}/start").status_code == 403  # host only
        r2 = s2.get(f"{API}/race/{d['id']}").json()
        assert r2["prize"] == 60.0 and r2["current_players"] == 2

    def test_1v1_friends_full(self, s1, s2, mdb):
        d = s1.post(f"{API}/race/custom", json={"game": "tower", "group": False, "entry_fee": 50}).json()
        assert d["max_players"] == 2 and d["prize"] == 100.0
        s2.post(f"{API}/race/join-code", json={"code": d["room_code"]})
        r = s2.get(f"{API}/race/{d['id']}").json()
        assert r["status"] == "OPEN"  # friends room waits for host
        # simulate a third user
        mdb.race_rooms.update_one({"id": d["id"]}, {"$pull": {"participants": {"user_id": mdb.users.find_one({"mobile": P2[0]})["_id"].__str__()}}})
        mdb.race_rooms.update_one({"id": d["id"]}, {"$push": {"participants": {"user_id": "fake_x", "username": "Fake", "joined_at": "2026-01-01T00:00:00+00:00"}}})
        j = s2.post(f"{API}/race/{d['id']}/join")
        assert j.status_code == 409 and "full" in j.text.lower()

    def test_bad_code(self, s1):
        assert s1.post(f"{API}/race/join-code", json={"code": "RFZZZZZ"}).status_code == 404


# --- Shared outcomes + settlement per game ---
class TestSharedOutcomes:
    def test_chicken_same_hazard_and_tie_earlier(self, s1, s2, mdb):
        room = friends(s1, s2, "chicken")
        b1, b2 = bal(mdb, P1[0]), bal(mdb, P2[0])
        a = s1.post(f"{API}/race/{room['id']}/play").json()
        b = s2.post(f"{API}/race/{room['id']}/play").json()
        assert a["mode"] == "medium"
        sa, sb = sess(mdb, a["session_id"]), sess(mdb, b["session_id"])
        assert sa["hazard_step"] == sb["hazard_step"]
        hz = sa["hazard_step"]
        if hz == 1:
            for x in (a, b):
                s = s1 if x is a else s2
                r = s.post(f"{API}/games/chicken/step", json={"session_id": x["session_id"], "token": x["token"]}).json()
                assert r["safe"] is False
            assert s1.get(f"{API}/race/{room['id']}").json()["status"] == "REFUNDED"
            assert bal(mdb, P1[0]) == b1 + 50 and bal(mdb, P2[0]) == b2 + 50
            return
        # both step 1 and collect (tie) -> earlier finisher (P1) wins
        for s, x in ((s1, a), (s2, b)):
            r = s.post(f"{API}/games/chicken/step", json={"session_id": x["session_id"], "token": x["token"]}).json()
            assert r["safe"]
            c = s.post(f"{API}/games/chicken/collect", json={"session_id": x["session_id"], "token": x["token"]}).json()
            assert c["prize"] == 0.0 and c["hazard_step"] is None
            time.sleep(0.3)
        r = s1.get(f"{API}/race/{room['id']}").json()
        assert r["status"] == "COMPLETED", r
        assert r["winner"] == next(p["username"] for p in r["players"] if p["is_you"])
        assert bal(mdb, P1[0]) == b1 + 100 and bal(mdb, P2[0]) == b2

    def test_tower_same_layout_and_refund(self, s1, s2, mdb):
        room = friends(s1, s2, "tower")
        b1, b2 = bal(mdb, P1[0]), bal(mdb, P2[0])
        a = s1.post(f"{API}/race/{room['id']}/play").json()
        b = s2.post(f"{API}/race/{room['id']}/play").json()
        sa, sb = sess(mdb, a["session_id"]), sess(mdb, b["session_id"])
        assert sa["bombs_layout"] == sb["bombs_layout"]
        bomb = sa["bombs_layout"][0][0]
        for s, x in ((s1, a), (s2, b)):
            r = s.post(f"{API}/games/tower/pick", json={"session_id": x["session_id"], "nonce": x["nonce"], "col": bomb}).json()
            assert r["safe"] is False
        time.sleep(0.5)
        r = s1.get(f"{API}/race/{room['id']}").json()
        assert r["status"] == "REFUNDED" and r["refunded"]
        assert bal(mdb, P1[0]) == b1 + 50 and bal(mdb, P2[0]) == b2 + 50

    def test_vortex_same_landings_partial_blocked(self, s1, s2, mdb):
        room = friends(s1, s2, "vortex")
        b1, b2 = bal(mdb, P1[0]), bal(mdb, P2[0])
        a = s1.post(f"{API}/race/{room['id']}/play").json()
        b = s2.post(f"{API}/race/{room['id']}/play").json()
        assert a["partial_collect_percent"] == 0
        sa, sb = sess(mdb, a["session_id"]), sess(mdb, b["session_id"])
        assert sa["landings"] == sb["landings"]
        r = s1.post(f"{API}/games/vortex/spin", json={"session_id": a["session_id"], "token": a["token"]}).json()
        if r.get("survived") and not r.get("finished"):
            p = s1.post(f"{API}/games/vortex/collect", json={"session_id": a["session_id"], "token": a["token"], "partial": True})
            assert p.status_code == 400
            c = s1.post(f"{API}/games/vortex/collect", json={"session_id": a["session_id"], "token": a["token"], "partial": False})
            assert c.status_code == 200 and c.json()["total_prize"] == 0.0
        # P2 forfeits by spinning till end (same landings -> same first outcome)
        r2 = s2.post(f"{API}/games/vortex/spin", json={"session_id": b["session_id"], "token": b["token"]}).json()
        assert r2.get("survived") == r.get("survived")
        if r2.get("survived") and not r2.get("finished"):
            s2.post(f"{API}/games/vortex/collect", json={"session_id": b["session_id"], "token": b["token"], "partial": False})
        time.sleep(0.5)
        rr = s1.get(f"{API}/race/{room['id']}").json()
        assert rr["status"] in ("COMPLETED", "REFUNDED"), rr["status"]
        assert bal(mdb, P2[0]) == (b2 + 50 if rr["status"] == "REFUNDED" else b2)
        if rr["status"] == "COMPLETED":
            assert bal(mdb, P1[0]) == b1 + 100

    def test_stack_race(self, s1, s2, mdb):
        from test_vortex_chicken_stack import perfect_taps
        room = friends(s1, s2, "stack")
        b1 = bal(mdb, P1[0])
        a = s1.post(f"{API}/race/{room['id']}/play").json()
        b = s2.post(f"{API}/race/{room['id']}/play").json()
        assert a["engine"]["phases"] == b["engine"]["phases"] and a["type"] == "timed"
        taps = perfect_taps(a["engine"], 6, noise=True)
        time.sleep(sum(taps) / 1000 + 0.3)
        f = s1.post(f"{API}/games/stack/finish", json={"session_id": a["session_id"], "token": a["token"], "taps": taps}).json()
        assert f.get("race") is True and f["prize"] == 0, f
        f2 = s2.post(f"{API}/games/stack/finish", json={"session_id": b["session_id"], "token": b["token"], "taps": [500]}).json()
        assert f2.get("race") is True
        time.sleep(0.5)
        r = s1.get(f"{API}/race/{room['id']}").json()
        print("stack", f["result"], r["players"])
        assert r["status"] == "COMPLETED" and r["winner"]
        assert bal(mdb, P1[0]) == b1 + 100


# --- Solo isolation & defaults ---
class TestSoloIsolation:
    def test_solo_chicken_does_not_forfeit_race(self, s1, s2, mdb):
        room = friends(s1, s2, "chicken")
        a = s1.post(f"{API}/race/{room['id']}/play").json()
        b0 = bal(mdb, P1[0])
        solo = s1.post(f"{API}/games/chicken/start", json={"bet": 20})
        assert solo.status_code == 200, solo.text
        assert solo.json()["mode"] == "medium"  # default mode
        assert bal(mdb, P1[0]) == b0 - 20
        assert sess(mdb, a["session_id"])["status"] == "active"
        act = s1.get(f"{API}/games/chicken/active").json()
        assert act["session_id"] == solo.json()["session_id"]
        # solo collect credits wallet normally
        sd = solo.json()
        st = s1.post(f"{API}/games/chicken/step", json={"session_id": sd["session_id"], "token": sd["token"]}).json()
        if st["safe"]:
            c = s1.post(f"{API}/games/chicken/collect", json={"session_id": sd["session_id"], "token": sd["token"]}).json()
            assert c["prize"] > 0 and bal(mdb, P1[0]) == round(b0 - 20 + c["prize"], 2)
        # race session still playable
        r = s1.post(f"{API}/games/chicken/step", json={"session_id": a["session_id"], "token": a["token"]})
        assert r.status_code == 200, r.text

    def test_solo_aviator_tower_vortex_dont_abandon(self, s1, s2, mdb):
        ids = {}
        for g in ["aviator", "tower", "vortex"]:
            room = friends(s1, s2, g)
            ids[g] = s1.post(f"{API}/race/{room['id']}/play").json()["session_id"]
        assert s1.post(f"{API}/games/aviator/start", json={"bet": 20}).status_code == 200
        assert s1.post(f"{API}/games/tower/start", json={"bet": 20, "difficulty": "medium"}).status_code == 200
        assert s1.post(f"{API}/games/vortex/start", json={"bet": 20, "theme": "water"}).status_code == 200
        for g, sid in ids.items():
            assert sess(mdb, sid)["status"] == "active", g

    def test_stack_mp_default_false(self):
        import sys
        sys.path.insert(0, "/app/backend")
        src = open("/app/backend/games_extra.py").read()
        assert '"mp_enabled": False' in src


# --- Bot fill for lone human in public room (~30s) ---
class TestBotFill:
    def test_bot_fill(self, s1, mdb):
        rooms = s1.get(f"{API}/race/rooms", params={"game": "chicken", "kind": "1v1"}).json()
        room = next(x for x in rooms if x["status"] == "OPEN" and x["current_players"] == 0 and x["entry_fee"] == 100)
        assert s1.post(f"{API}/race/{room['id']}/join").status_code == 200
        deadline = time.time() + 50
        st = "OPEN"
        while time.time() < deadline:
            r = s1.get(f"{API}/race/{room['id']}").json()
            st = r["status"]
            if st != "OPEN":
                break
            time.sleep(3)
        assert st == "LIVE", st
        assert r["current_players"] == 2
