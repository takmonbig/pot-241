"""Iteration 11: backend fixes - forfeit of active vortex/chicken, /active endpoints, vortex won rule,
admin config sanitize (400/clamp), versus deadline + hidden heights, stack bot_like detector."""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

from test_vortex_chicken_stack import perfect_taps

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
PLAYER = ("8800112233", "Test@123")
ADMIN = ("9999999999", "Admin@123")


def _login(mobile, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"mobile": mobile, "password": pw})
    assert r.status_code == 200, r.text
    s.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return s


@pytest.fixture(scope="module")
def mdb():
    return MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "timeup_database")]


@pytest.fixture(scope="module")
def s(mdb):
    mdb.users.update_one({"mobile": PLAYER[0]}, {"$set": {"main_balance": 10000, "bonus_balance": 0}})
    return _login(*PLAYER)


@pytest.fixture(scope="module")
def admin():
    return _login(*ADMIN)


# ---------- Forfeit + active (vortex) ----------
class TestForfeitActive:
    def test_vortex_active_and_forfeit(self, s, mdb):
        st = s.post(f"{API}/games/vortex/start", json={"bet": 20, "theme": "earth"}).json()
        a = s.get(f"{API}/games/vortex/active").json()
        assert a["active"] is True and a["session_id"] == st["session_id"] and a["token"] == st["token"]
        assert a["stage"] == 0 and "server_seed" not in a["fair"]
        st2 = s.post(f"{API}/games/vortex/start", json={"bet": 20, "theme": "fire"})
        assert st2.status_code == 200
        old = mdb.game_sessions.find_one({"id": st["session_id"]})
        assert old["status"] == "forfeited"
        g = mdb.games.find_one({"user_id": old["user_id"], "mode": "vortex", "details.forfeited": True,
                                "fair.server_seed_hash": st["fair"]["server_seed_hash"]})
        assert g and g["result"] == "lost" and g["fair"]["server_seed"]
        assert g["details"]["segments"] == 12 and len(g["details"]["lose"]) == 5
        rows = s.get(f"{API}/fair/rounds").json()
        assert any(r["fair"]["server_seed_hash"] == st["fair"]["server_seed_hash"] and r["fair"].get("server_seed")
                   for r in rows)
        # old token is now dead
        assert s.post(f"{API}/games/vortex/spin", json={"session_id": st["session_id"], "token": st["token"]}).status_code == 409
        a2 = s.get(f"{API}/games/vortex/active").json()
        assert a2["session_id"] == st2.json()["session_id"]
        # finish it -> no active
        s.post(f"{API}/games/vortex/start", json={"bet": 20, "theme": "fire"})  # forfeits st2
        sid = s.get(f"{API}/games/vortex/active").json()
        r = s.post(f"{API}/games/vortex/spin", json={"session_id": sid["session_id"], "token": sid["token"]}).json()
        if r["survived"] and not r.get("finished"):
            s.post(f"{API}/games/vortex/collect", json={"session_id": sid["session_id"], "token": sid["token"]})
        assert s.get(f"{API}/games/vortex/active").json() == {"active": False}

    def test_chicken_active_and_forfeit(self, s, mdb):
        st = s.post(f"{API}/games/chicken/start", json={"bet": 20, "mode": "easy"}).json()
        a = s.get(f"{API}/games/chicken/active").json()
        assert a["active"] and a["session_id"] == st["session_id"] and a["step"] == 0 and a["mode"] == "easy"
        assert s.post(f"{API}/games/chicken/start", json={"bet": 20, "mode": "medium"}).status_code == 200
        old = mdb.game_sessions.find_one({"id": st["session_id"]})
        assert old["status"] == "forfeited"
        g = mdb.games.find_one({"mode": "chicken", "details.forfeited": True,
                                "fair.server_seed_hash": st["fair"]["server_seed_hash"]})
        assert g and g["result"] == "lost" and g["prize"] == 0 and g["fair"]["server_seed"]
        assert "steps" in g["details"] and "hazard" in g["details"]
        a2 = s.get(f"{API}/games/chicken/active").json()
        r = s.post(f"{API}/games/chicken/step", json={"session_id": a2["session_id"], "token": a2["token"]}).json()
        if r["safe"] and not r.get("finished"):
            s.post(f"{API}/games/chicken/collect", json={"session_id": a2["session_id"], "token": a2["token"]})
        assert s.get(f"{API}/games/chicken/active").json() == {"active": False}
        gg = mdb.games.find_one({"mode": "chicken", "fair.server_seed_hash": a2["fair"]["server_seed_hash"]})
        assert gg and "steps" in gg["details"] and "hazard" in gg["details"]

    def test_active_unauth(self):
        assert requests.get(f"{API}/games/vortex/active").status_code in (401, 403)
        assert requests.get(f"{API}/games/chicken/active").status_code in (401, 403)


# ---------- Vortex won only if total > bet ----------
class TestVortexWonRule:
    def test_partial_then_lose_is_lost(self, s, mdb):
        found = False
        for _ in range(25):
            st = s.post(f"{API}/games/vortex/start", json={"bet": 20, "theme": "fire"}).json()
            sid, tok = st["session_id"], st["token"]
            sp = s.post(f"{API}/games/vortex/spin", json={"session_id": sid, "token": tok}).json()
            if not sp["survived"]:
                continue
            pc = s.post(f"{API}/games/vortex/collect", json={"session_id": sid, "token": tok, "partial": True}).json()
            end = None
            while True:
                sp = s.post(f"{API}/games/vortex/spin", json={"session_id": sid, "token": tok}).json()
                if not sp["survived"] or sp.get("finished"):
                    end = sp
                    break
            g = mdb.games.find_one({"fair.server_seed_hash": st["fair"]["server_seed_hash"], "mode": "vortex"})
            exp = "won" if g["prize"] > 20 else "lost"
            assert g["result"] == exp, g
            if not end["survived"] and pc["collected"] < 20:
                assert g["result"] == "lost"
                found = True
                break
        assert found, "never hit partial+lose below bet in 25 rounds"


# ---------- Admin config sanitize ----------
class TestAdminConfigSanitize:
    def test_bad_values_400_and_unchanged(self, admin):
        before = admin.get(f"{API}/admin/config").json()
        for sec, key, val in [("vortex_config", "min_bet", None), ("chicken_config", "max_bet", "garbage"),
                              ("stack_config", "base_speed", "NaN"), ("stack_config", "min_height", None)]:
            c = dict(before[sec])
            c[key] = val
            r = admin.put(f"{API}/admin/config", json={"data": {sec: c}})
            assert r.status_code == 400, (sec, key, r.status_code, r.text)
        after = admin.get(f"{API}/admin/config").json()
        for sec in ("vortex_config", "chicken_config", "stack_config"):
            assert after[sec] == before[sec]

    def test_clamp_and_restore(self, admin):
        before = admin.get(f"{API}/admin/config").json()
        cc = {**before["chicken_config"], "modes": {k: dict(v) for k, v in before["chicken_config"]["modes"].items()}}
        cc["modes"]["hardcore"]["hazard"] = 5.0
        try:
            r = admin.put(f"{API}/admin/config", json={"data": {"chicken_config": cc}})
            assert r.status_code == 200, r.text
            assert r.json()["chicken_config"]["modes"]["hardcore"]["hazard"] == 0.9
        finally:
            admin.put(f"{API}/admin/config", json={"data": {"chicken_config": before["chicken_config"]}})
        assert admin.get(f"{API}/admin/config").json()["chicken_config"] == before["chicken_config"]

    def test_garbage_nested_theme(self, admin):
        """themes value not a dict -> should be 400, not 500"""
        before = admin.get(f"{API}/admin/config").json()
        vc = dict(before["vortex_config"])
        vc["themes"] = {"earth": "garbage"}
        try:
            r = admin.put(f"{API}/admin/config", json={"data": {"vortex_config": vc}})
            assert r.status_code in (400, 422), r.status_code
        finally:
            admin.put(f"{API}/admin/config", json={"data": {"vortex_config": before["vortex_config"]}})


# ---------- Versus: hidden heights, deadline, finish into non-LIVE ----------
class TestVersusFixes:
    def _join_live(self, s, mdb, fee=50):
        room = next(r for r in s.get(f"{API}/games/stack/rooms").json()["open"]
                    if r["entry_fee"] == fee and r["max_players"] == 2)
        assert s.post(f"{API}/games/stack/rooms/{room['id']}/join").status_code == 200
        mdb.stack_rooms.update_one({"id": room["id"]}, {"$set": {"players.0.joined_at":
                                   (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()}})
        for _ in range(12):
            time.sleep(2)
            g = s.get(f"{API}/games/stack/rooms/{room['id']}").json()
            if g["status"] == "LIVE":
                return g
        pytest.fail("room never went LIVE")

    def test_hidden_heights_then_visible(self, s, mdb):
        g = self._join_live(s, mdb)
        rid = g["id"]
        # force bot to submit now
        mdb.stack_rooms.update_one({"id": rid, "players.is_bot": True}, {"$set": {"players.$.bot_finish_at":
                                   (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()}})
        g = s.get(f"{API}/games/stack/rooms/{rid}").json()
        bot = next(p for p in g["players"] if p["is_bot"])
        assert bot["submitted"] and "height" not in bot and "perfects" not in bot, bot
        mine = next(r for r in s.get(f"{API}/games/stack/rooms").json()["mine"] if r["id"] == rid)
        assert all("height" not in p for p in mine["players"] if not p["is_me"])
        pl = s.post(f"{API}/games/stack/rooms/{rid}/play").json()
        taps = perfect_taps(pl["engine"], 6, noise=True)
        time.sleep(sum(taps) / 1000 + 0.3)
        f = s.post(f"{API}/games/stack/finish", json={"session_id": pl["session_id"], "token": pl["token"], "taps": taps}).json()
        assert f["flagged"] is False
        g = s.get(f"{API}/games/stack/rooms/{rid}").json()
        assert g["status"] == "COMPLETED"
        assert all("height" in p for p in g["players"])

    def test_play_after_deadline_409(self, s, mdb):
        g = self._join_live(s, mdb)
        rid = g["id"]
        mdb.stack_rooms.update_one({"id": rid}, {"$set": {"deadline":
                                   (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()}})
        r = s.post(f"{API}/games/stack/rooms/{rid}/play")
        assert r.status_code == 409, r.text

    def test_finish_into_non_live_ignored(self, s, mdb):
        g = self._join_live(s, mdb)
        rid = g["id"]
        pl = s.post(f"{API}/games/stack/rooms/{rid}/play").json()
        mdb.stack_rooms.update_one({"id": rid}, {"$set": {"deadline":
                                   (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()}})
        for _ in range(8):
            time.sleep(1.5)
            if s.get(f"{API}/games/stack/rooms/{rid}").json()["status"] == "COMPLETED":
                break
        taps = perfect_taps(pl["engine"], 8, noise=True)
        f = s.post(f"{API}/games/stack/finish", json={"session_id": pl["session_id"], "token": pl["token"], "taps": taps}).json()
        me = next(p for p in f["room"]["players"] if p["is_me"])
        assert me.get("height", 0) == 0, me
        assert f["room"]["status"] == "COMPLETED"
