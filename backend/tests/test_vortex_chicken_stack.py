"""Iteration 10: Vortex Spin, Chicken Quest (provably fair) & Tower Stack (solo + versus) backend tests."""
import hashlib
import hmac
import os
import time

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
PLAYER = ("8800112233", "Test@123")
ADMIN = ("9999999999", "Admin@123")
ENG = {"base_speed": 0.55, "speed_step": 0.025, "max_speed": 1.5}


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


def bal(s):
    return s.get(f"{API}/wallet").json()["total_balance"]


def pf_floats(server_seed, client_seed, nonce, count):
    out, cur = [], 0
    while len(out) < count:
        d = hmac.new(server_seed.encode(), f"{client_seed}:{nonce}:{cur}".encode(), hashlib.sha256).digest()
        for j in range(0, 32, 4):
            b = d[j:j + 4]
            out.append(b[0] / 256 + b[1] / 256 ** 2 + b[2] / 256 ** 3 + b[3] / 256 ** 4)
        cur += 1
    return out[:count]


def _speed(eng, i):
    return min(eng["max_speed"], eng["base_speed"] + i * eng["speed_step"]) * eng["jitter"][i % len(eng["jitter"])]


def perfect_taps(eng, n, noise=False, seed=1):
    """Exact perfect timing per block (phase/jitter aware). noise=True -> human-like 8-12ms error (still perfect)."""
    import random
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        sp, ph = _speed(eng, i), eng["phases"][i % len(eng["phases"])]
        x = (0.5 - ph) % 2.0
        t = x / sp * 1000
        if t < 150:
            t = (x + 2.0) / sp * 1000
        if noise:
            t += rnd.choice([-1, 1]) * rnd.uniform(8, 12)
        out.append(int(round(t)))
    return out


# ---------------- Provably fair ----------------
class TestFair:
    def test_seed_and_client_seed(self, s):
        r = s.get(f"{API}/fair/seed")
        assert r.status_code == 200
        d = r.json()
        assert len(d["server_seed_hash"]) == 64 and isinstance(d["nonce"], int) and d["client_seed"]
        for bad in ["", "a" * 65, "bad seed!", "x$y"]:
            assert s.post(f"{API}/fair/client-seed", json={"client_seed": bad}).status_code == 400, bad
        r = s.post(f"{API}/fair/client-seed", json={"client_seed": "TEST_seed-01"})
        assert r.status_code == 200 and r.json()["client_seed"] == "TEST_seed-01"
        assert s.get(f"{API}/fair/seed").json()["client_seed"] == "TEST_seed-01"

    def test_unauth(self):
        assert requests.get(f"{API}/fair/seed").status_code in (401, 403)


# ---------------- Vortex ----------------
class TestVortex:
    def test_validation(self, s, mdb):
        assert s.post(f"{API}/games/vortex/start", json={"bet": 10, "theme": "fire"}).status_code == 400
        mdb.users.update_one({"mobile": PLAYER[0]}, {"$set": {"main_balance": 30, "bonus_balance": 0}})
        assert s.post(f"{API}/games/vortex/start", json={"bet": 100, "theme": "fire"}).status_code == 400
        mdb.users.update_one({"mobile": PLAYER[0]}, {"$set": {"main_balance": 10000}})

    def test_collect_before_spin_and_wrong_token(self, s):
        r = s.post(f"{API}/games/vortex/start", json={"bet": 20, "theme": "earth"}).json()
        assert s.post(f"{API}/games/vortex/collect", json={"session_id": r["session_id"], "token": r["token"]}).status_code == 400
        assert s.post(f"{API}/games/vortex/spin", json={"session_id": r["session_id"], "token": "bad"}).status_code == 403

    def test_full_rounds_fair_and_determinism(self, s):
        seen_partial = seen_lose = seen_collect = False
        for theme in ["earth", "water", "fire"] * 4:
            seed = s.get(f"{API}/fair/seed").json()
            b0 = bal(s)
            st = s.post(f"{API}/games/vortex/start", json={"bet": 20, "theme": theme})
            assert st.status_code == 200, st.text
            st = st.json()
            assert st["fair"]["server_seed_hash"] == seed["server_seed_hash"]
            assert st["fair"]["nonce"] == seed["nonce"]
            assert abs(bal(s) - (b0 - 20)) < 0.01
            tbl = st["table"]
            assert tbl["segments"] == 12 and len(tbl["stages"]) == 5
            sid, tok = st["session_id"], st["token"]
            at_risk, collected, landings, end = 20.0, 0.0, [], None
            for k in range(5):
                sp = s.post(f"{API}/games/vortex/spin", json={"session_id": sid, "token": tok})
                assert sp.status_code == 200, sp.text
                sp = sp.json()
                landings.append(sp["landing"])
                if not sp["survived"]:
                    assert sp["landing"] in tbl["stages"][k]["lose_slots"]
                    assert abs(sp["total_prize"] - collected) < 0.02
                    seen_lose, end = True, sp
                    break
                if sp.get("finished"):
                    end = sp
                    break
                exp = round(at_risk * tbl["stages"][k]["step_multiplier"], 2)
                assert abs(sp["at_risk"] - exp) < 0.02
                at_risk = sp["at_risk"]
                if k == 0:  # partial collect once
                    bb = bal(s)
                    pc = s.post(f"{API}/games/vortex/collect", json={"session_id": sid, "token": tok, "partial": True})
                    assert pc.status_code == 200, pc.text
                    pc = pc.json()
                    assert abs(pc["collected_now"] - round(at_risk * 0.5, 2)) < 0.02
                    assert abs(bal(s) - (bb + pc["collected_now"])) < 0.02
                    assert s.post(f"{API}/games/vortex/collect", json={"session_id": sid, "token": tok, "partial": True}).status_code == 400
                    at_risk, collected, seen_partial = pc["at_risk"], pc["collected"], True
                if k == 2 and theme == "earth":
                    bb = bal(s)
                    fc = s.post(f"{API}/games/vortex/collect", json={"session_id": sid, "token": tok, "partial": False}).json()
                    assert fc["finished"] and abs(fc["total_prize"] - (collected + at_risk)) < 0.02
                    assert abs(bal(s) - (bb + at_risk)) < 0.02
                    seen_collect, end = True, fc
                    break
            f = end["fair"]
            assert hashlib.sha256(f["server_seed"].encode()).hexdigest() == seed["server_seed_hash"]
            fl = pf_floats(f["server_seed"], f["client_seed"], f["nonce"], 5)
            assert [int(x * 12) for x in fl][: len(landings)] == landings
            nxt = s.get(f"{API}/fair/seed").json()
            assert nxt["nonce"] == seed["nonce"] + 1 and nxt["server_seed_hash"] != seed["server_seed_hash"]
            # action after finish
            assert s.post(f"{API}/games/vortex/spin", json={"session_id": sid, "token": tok}).status_code == 409
        assert seen_partial and seen_collect
        print("seen_lose", seen_lose)

    def test_lose_slots_formula(self):
        r = requests.get(f"{API}/games/extra/config").json()
        for th, t in r["vortex"]["tables"].items():
            for k, st in enumerate(t["stages"]):
                L = r["vortex"]["themes"][th]["lose"][k]
                assert st["lose_slots"] == sorted({(j * 12) // L for j in range(L)})


# ---------------- Chicken ----------------
class TestChicken:
    def test_errors(self, s):
        st = s.post(f"{API}/games/chicken/start", json={"bet": 20, "mode": "easy"}).json()
        assert s.post(f"{API}/games/chicken/collect", json={"session_id": st["session_id"], "token": st["token"]}).status_code == 400
        assert s.post(f"{API}/games/chicken/step", json={"session_id": st["session_id"], "token": "x"}).status_code == 403
        assert s.post(f"{API}/games/chicken/start", json={"bet": 5, "mode": "easy"}).status_code == 400

    def test_rounds_and_verify(self, s):
        for mode, steps in [("easy", 3), ("medium", 3), ("hard", 25), ("hardcore", 25)]:
            seed = s.get(f"{API}/fair/seed").json()
            st = s.post(f"{API}/games/chicken/start", json={"bet": 20, "mode": mode})
            assert st.status_code == 200, st.text
            st = st.json()
            assert st["fair"]["server_seed_hash"] == seed["server_seed_hash"]
            mults, sid, tok = st["multipliers"], st["session_id"], st["token"]
            end, step = None, 0
            for _ in range(steps):
                r = s.post(f"{API}/games/chicken/step", json={"session_id": sid, "token": tok}).json()
                if not r["safe"]:
                    end = r
                    break
                step = r["step"]
                assert r["multiplier"] == mults[step - 1]
                if r.get("finished"):
                    end = r
                    break
            if end is None:
                bb = bal(s)
                end = s.post(f"{API}/games/chicken/collect", json={"session_id": sid, "token": tok}).json()
                assert abs(end["prize"] - round(20 * mults[step - 1], 2)) < 0.01
                assert abs(bal(s) - (bb + end["prize"])) < 0.02
            f = end["fair"]
            assert hashlib.sha256(f["server_seed"].encode()).hexdigest() == seed["server_seed_hash"]
            cfg = requests.get(f"{API}/games/extra/config").json()["chicken"]["modes"][mode]
            fl = pf_floats(f["server_seed"], f["client_seed"], f["nonce"], cfg["steps"])
            hz = next((i + 1 for i, x in enumerate(fl) if x < cfg["hazard"]), None)
            assert hz == end["hazard_step"]
            assert s.post(f"{API}/games/chicken/step", json={"session_id": sid, "token": tok}).status_code == 409

    def test_fair_rounds_list(self, s):
        rows = s.get(f"{API}/fair/rounds").json()
        assert len(rows) > 0 and all("server_seed" in r["fair"] for r in rows)
        assert {r["mode"] for r in rows} <= {"vortex", "chicken"}
        assert "_id" not in rows[0]


# ---------------- Tower Stack solo ----------------
class TestStackSolo:
    def test_endless_perfect(self, s):
        st = s.post(f"{API}/games/stack/start", json={"bet": 50, "mode": "endless"})
        assert st.status_code == 200, st.text
        st = st.json()
        assert st["engine"]["base_speed"] == 0.55
        assert len(st["engine"]["phases"]) >= 30 and len(st["engine"]["jitter"]) >= 30
        taps = perfect_taps(st["engine"], 8, noise=True)
        time.sleep(sum(taps) / 1000 + 0.3)
        r = s.post(f"{API}/games/stack/finish", json={"session_id": st["session_id"], "token": st["token"], "taps": taps}).json()
        assert r["flagged"] is False
        assert r["result"]["height"] == 8 and r["result"]["perfects"] == 8
        assert r["multiplier"] == round(8 * 0.08 + 8 * 0.03, 2)
        assert abs(r["prize"] - 50 * r["multiplier"]) < 0.01

    def test_endless_below_min_height(self, s):
        st = s.post(f"{API}/games/stack/start", json={"bet": 20, "mode": "endless"}).json()
        taps = perfect_taps(st["engine"], 3, noise=True)
        time.sleep(sum(taps) / 1000 + 0.2)
        r = s.post(f"{API}/games/stack/finish", json={"session_id": st["session_id"], "token": st["token"], "taps": taps}).json()
        assert r["result"]["height"] == 3 and r["prize"] == 0

    def test_anticheat(self, s):
        st = s.post(f"{API}/games/stack/start", json={"bet": 20, "mode": "endless"}).json()
        r = s.post(f"{API}/games/stack/finish", json={"session_id": st["session_id"], "token": st["token"], "taps": perfect_taps(st["engine"], 20)}).json()
        assert r["flagged"] is True and r["prize"] == 0
        # machine-precision perfect run (timing OK) -> bot_like flag
        st = s.post(f"{API}/games/stack/start", json={"bet": 20, "mode": "endless"}).json()
        taps = perfect_taps(st["engine"], 10)
        time.sleep(sum(taps) / 1000 + 0.3)
        r = s.post(f"{API}/games/stack/finish", json={"session_id": st["session_id"], "token": st["token"], "taps": taps}).json()
        assert r["flagged"] is True and r["prize"] == 0 and r["result"]["bot_like"] is True
        st = s.post(f"{API}/games/stack/start", json={"bet": 20, "mode": "endless"}).json()
        time.sleep(1)
        r = s.post(f"{API}/games/stack/finish", json={"session_id": st["session_id"], "token": st["token"], "taps": [50, 909]}).json()
        assert r["flagged"] is True

    def test_timed_sprint_win(self, s):
        assert s.post(f"{API}/games/stack/start", json={"bet": 20, "mode": "timed"}).status_code == 400
        st = s.post(f"{API}/games/stack/start", json={"bet": 20, "mode": "timed", "challenge_id": "sprint"}).json()
        assert st["challenge"]["height"] == 15 and st["challenge"]["seconds"] == 25
        taps = perfect_taps(st["engine"], 16, noise=True)
        time.sleep(sum(taps) / 1000 + 0.3)
        r = s.post(f"{API}/games/stack/finish", json={"session_id": st["session_id"], "token": st["token"], "taps": taps}).json()
        assert r["won"] is True and r["multiplier"] == 5 and r["prize"] == 100, (sum(taps), r)
        assert r["result"]["height"] == 15

    def test_timed_fail(self, s):
        st = s.post(f"{API}/games/stack/start", json={"bet": 20, "mode": "timed", "challenge_id": "sprint"}).json()
        taps = perfect_taps(st["engine"], 4, noise=True)
        time.sleep(sum(taps) / 1000 + 0.2)
        r = s.post(f"{API}/games/stack/finish", json={"session_id": st["session_id"], "token": st["token"], "taps": taps}).json()
        assert r["won"] is False and r["prize"] == 0


# ---------------- Config / admin ----------------
class TestConfig:
    def test_extra_config(self):
        r = requests.get(f"{API}/games/extra/config")
        assert r.status_code == 200
        d = r.json()
        assert set(d["vortex"]["tables"]) == {"earth", "water", "fire"}
        assert set(d["chicken"]["multipliers"]) == {"medium", "hard", "hardcore"}
        assert len(d["stack"]["challenges"]) == 3

    def test_admin_disable_enable(self, s, admin):
        d = requests.get(f"{API}/games/extra/config").json()
        for key, url, body in [("vortex", "vortex/start", {"bet": 20, "theme": "earth"}),
                               ("chicken", "chicken/start", {"bet": 20, "mode": "easy"}),
                               ("stack", "stack/start", {"bet": 20, "mode": "timed", "challenge_id": "sprint"})]:
            c = dict(d[key])
            c.pop("tables", None)
            c.pop("multipliers", None)
            try:
                r = admin.put(f"{API}/admin/config", json={"data": {f"{key}_config": {**c, "enabled": False}}})
                assert r.status_code == 200, r.text
                assert s.post(f"{API}/games/{url}", json=body).status_code == 403
            finally:
                admin.put(f"{API}/admin/config", json={"data": {f"{key}_config": {**c, "enabled": True}}})
            assert s.post(f"{API}/games/{url}", json=body).status_code == 200

    def test_non_admin_cannot_update(self, s):
        assert s.put(f"{API}/admin/config", json={"data": {"vortex_config": {}}}).status_code in (401, 403)


# ---------------- Tower Stack versus ----------------
class TestStackVersus:
    def test_rooms_join_play_settle(self, s):
        d = s.get(f"{API}/games/stack/rooms").json()
        combos = {(r["entry_fee"], r["max_players"]) for r in d["open"]}
        assert combos == {(f, n) for f in [50, 100, 200] for n in [2, 4]}
        room = next(r for r in d["open"] if r["entry_fee"] == 50 and r["max_players"] == 2)
        b0 = bal(s)
        j = s.post(f"{API}/games/stack/rooms/{room['id']}/join")
        assert j.status_code == 200, j.text
        assert abs(bal(s) - (b0 - 50)) < 0.01
        assert s.post(f"{API}/games/stack/rooms/{room['id']}/join").status_code == 409
        assert s.post(f"{API}/games/stack/rooms/{room['id']}/play").status_code == 409  # not live
        live = None
        for _ in range(15):
            time.sleep(3)
            g = s.get(f"{API}/games/stack/rooms/{room['id']}").json()
            if g["status"] == "LIVE":
                live = g
                break
        assert live, "room never went LIVE"
        assert live["deadline"] and len(live["players"]) == 2
        assert any(p["is_bot"] for p in live["players"]) and any(p["is_me"] for p in live["players"])
        pl = s.post(f"{API}/games/stack/rooms/{room['id']}/play")
        assert pl.status_code == 200, pl.text
        pl = pl.json()
        assert abs(bal(s) - (b0 - 50)) < 0.01  # no extra debit
        assert s.post(f"{API}/games/stack/rooms/{room['id']}/play").status_code == 409
        taps = perfect_taps(pl["engine"], 30, noise=True)
        time.sleep(sum(taps) / 1000 + 0.3)
        f = s.post(f"{API}/games/stack/finish", json={"session_id": pl["session_id"], "token": pl["token"], "taps": taps}).json()
        assert f["flagged"] is False and f["result"]["height"] == 30
        me = next(p for p in f["room"]["players"] if p["is_me"])
        assert me["started"] and me["height"] == 30
        done = None
        for _ in range(40):
            g = s.get(f"{API}/games/stack/rooms/{room['id']}").json()
            if g["status"] == "COMPLETED":
                done = g
                break
            time.sleep(3)
        assert done, "room never completed"
        assert done["winner"]["height"] == 30  # bots max 26
        assert done["prize"] == 90
        assert abs(bal(s) - (b0 - 50 + 90)) < 0.01
        rec = s.get(f"{API}/games/stack/rooms").json()["recent"]
        assert any(r["id"] == room["id"] for r in rec)
