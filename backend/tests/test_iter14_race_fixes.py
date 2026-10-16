"""Iteration 14: race fixes - join debit-once, aviator race hidden crash + /games/aviator/status, tower bombs_layout masking."""
import os
import time

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
P1 = ("8800112233", "Test@123")
P2 = ("8800112244", "Test@123")


def _login(mobile, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"mobile": mobile, "password": pw})
    assert r.status_code == 200, r.text
    d = r.json()
    s.cookies.clear()
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


def live_friends(s1, s2, game):
    room = s1.post(f"{API}/race/custom", json={"game": game, "group": False, "entry_fee": 50}).json()
    assert s2.post(f"{API}/race/join-code", json={"code": room["room_code"]}).status_code == 200
    st = s1.post(f"{API}/race/{room['id']}/start").json()
    assert st["status"] == "LIVE"
    return room


# Fix 3 - join debits exactly once, double join 409 without extra debit
class TestJoinDebit:
    def test_join_debit_once(self, s1, s2, mdb):
        rooms = s1.get(f"{API}/race/rooms", params={"game": "stack", "kind": "rooms"}).json()
        room = next(x for x in rooms if x["status"] == "OPEN" and x["entry_fee"] == 50 and not x["joined"])
        b = bal(mdb, P1[0])
        r = s1.post(f"{API}/race/{room['id']}/join")
        assert r.status_code == 200, r.text
        assert bal(mdb, P1[0]) == b - 50
        r2 = s1.post(f"{API}/race/{room['id']}/join")
        assert r2.status_code == 409
        assert bal(mdb, P1[0]) == b - 50
        txs = list(mdb.transactions.find({"meta.race_id": room["id"], "type": "game_entry"})) if "transactions" in mdb.list_collection_names() else []
        print("entry txs", len(txs))

    def test_friends_custom_debit_once(self, s1, mdb):
        b = bal(mdb, P1[0])
        d = s1.post(f"{API}/race/custom", json={"game": "chicken", "group": True, "entry_fee": 40}).json()
        assert d["joined"] and d["current_players"] == 1
        assert bal(mdb, P1[0]) == b - 40
        assert s1.post(f"{API}/race/{d['id']}/join").status_code == 409
        # join-code by host is idempotent and doesn't debit
        assert s1.post(f"{API}/race/join-code", json={"code": d["room_code"]}).status_code == 200
        assert bal(mdb, P1[0]) == b - 40

    def test_full_room_refunds(self, s1, s2, mdb):
        d = s1.post(f"{API}/race/custom", json={"game": "tower", "group": False, "entry_fee": 50}).json()
        mdb.race_rooms.update_one({"id": d["id"]}, {"$push": {"participants": {"user_id": "fake_y", "username": "FakeY", "joined_at": "2026-01-01T00:00:00+00:00"}}})
        b = bal(mdb, P2[0])
        j = s2.post(f"{API}/race/{d['id']}/join")
        assert j.status_code == 409
        assert bal(mdb, P2[0]) == b


# Fix 4 - aviator race hides crash; status endpoint
class TestAviatorRace:
    def test_race_hidden_crash_and_status(self, s1, s2, mdb):
        room = live_friends(s1, s2, "aviator")
        a = s1.post(f"{API}/race/{room['id']}/play").json()
        assert a["crash_point"] is None
        crash = mdb.game_sessions.find_one({"id": a["session_id"]})["crash_point"]
        st = s1.post(f"{API}/games/aviator/status", json={"session_id": a["session_id"], "nonce": a["nonce"], "multiplier": 0}).json()
        print("crash", crash, "status0", st)
        if crash > 1.05:
            assert st == {"crashed": False, "crash_point": None}
        # wrong nonce -> 404
        assert s1.post(f"{API}/games/aviator/status", json={"session_id": a["session_id"], "nonce": "x", "multiplier": 0}).status_code == 404
        # other user -> 404
        assert s2.post(f"{API}/games/aviator/status", json={"session_id": a["session_id"], "nonce": a["nonce"], "multiplier": 0}).status_code == 404
        # force crash quickly by moving server_start back
        import math
        k = mdb.game_sessions.find_one({"id": a["session_id"]})["growth_rate"]
        mdb.game_sessions.update_one({"id": a["session_id"]}, {"$inc": {"server_start": -(math.log(crash) / k + 1)}})
        st2 = s1.post(f"{API}/games/aviator/status", json={"session_id": a["session_id"], "nonce": a["nonce"], "multiplier": 0}).json()
        assert st2["crashed"] is True and st2["crash_point"] == crash
        # EXPLOIT CHECK: after status revealed the crash, a late cashout just under it should NOT score
        late = round(crash - 0.01, 2)
        c = s1.post(f"{API}/games/aviator/cashout", json={"session_id": a["session_id"], "nonce": a["nonce"], "multiplier": late}).json()
        print("late cashout after crash revealed", c)
        assert not (crash > 1.01 and c.get("won")), f"late cashout after crash accepted: {c}"

    def test_solo_still_returns_crash(self, s1):
        r = s1.post(f"{API}/games/aviator/start", json={"bet": 20})
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["crash_point"], (int, float)) and d["crash_point"] >= 1.0
        time.sleep(0.3)
        c = s1.post(f"{API}/games/aviator/cashout", json={"session_id": d["session_id"], "nonce": d["nonce"], "multiplier": 1.0}).json()
        assert "crash_point" in c


# Fix 5 - tower race masks bombs_layout
class TestTowerMask:
    def test_race_pick_and_cashout_mask(self, s1, s2, mdb):
        room = live_friends(s1, s2, "tower")
        a = s1.post(f"{API}/race/{room['id']}/play").json()
        b = s2.post(f"{API}/race/{room['id']}/play").json()
        layout = mdb.game_sessions.find_one({"id": a["session_id"]})["bombs_layout"]
        safe = next(c for c in range(a["cols"]) if c not in layout[0])
        r = s1.post(f"{API}/games/tower/pick", json={"session_id": a["session_id"], "nonce": a["nonce"], "col": safe}).json()
        assert r["safe"] is True
        c = s1.post(f"{API}/games/tower/cashout", json={"session_id": a["session_id"], "nonce": a["nonce"]}).json()
        assert c["won"] is True and c["bombs_layout"] is None and c["prize"] == 0.0
        bomb = layout[0][0]
        p = s2.post(f"{API}/games/tower/pick", json={"session_id": b["session_id"], "nonce": b["nonce"], "col": bomb}).json()
        assert p["safe"] is False and p["bombs_layout"] is None
        time.sleep(0.5)
        rr = s1.get(f"{API}/race/{room['id']}").json()
        assert rr["status"] == "COMPLETED"

    def test_solo_returns_layout(self, s1):
        d = s1.post(f"{API}/games/tower/start", json={"bet": 20, "difficulty": "medium"}).json()
        r = s1.post(f"{API}/games/tower/pick", json={"session_id": d["session_id"], "nonce": d["nonce"], "col": 0}).json()
        if r["safe"]:
            r = s1.post(f"{API}/games/tower/cashout", json={"session_id": d["session_id"], "nonce": d["nonce"]}).json()
        assert isinstance(r["bombs_layout"], list)


# Fix 7 - public room prize preview data (0 players)
class TestListingPrize:
    def test_rooms_zero_players(self, s1):
        rooms = s1.get(f"{API}/race/rooms", params={"game": "chicken", "kind": "rooms"}).json()
        z = [x for x in rooms if x["status"] == "OPEN" and x["current_players"] == 0]
        print([(x["entry_fee"], x["prize"], x["max_players"]) for x in z])
        assert all(x["prize"] == 0 for x in z)
