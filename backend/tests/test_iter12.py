"""Iteration 12: Tower (stack) timed-only challenges, Vortex lose counts (first-spin loophole), Chicken 3 modes,
stats/by-game, admin nested garbage 400."""
import hashlib
import hmac
import os

import pytest
import requests
from pymongo import MongoClient

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


def pf_floats(server_seed, client_seed, nonce, count):
    out, cursor = [], 0
    while len(out) < count:
        dig = hmac.new(server_seed.encode(), f"{client_seed}:{nonce}:{cursor}".encode(), hashlib.sha256).digest()
        for j in range(0, 32, 4):
            b = dig[j:j + 4]
            out.append(b[0] / 256 + b[1] / 256 ** 2 + b[2] / 256 ** 3 + b[3] / 256 ** 4)
        cursor += 1
    return out[:count]


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


@pytest.fixture(scope="module")
def cfg():
    r = requests.get(f"{API}/games/extra/config")
    assert r.status_code == 200
    return r.json()


# ---------- Config ----------
class TestConfig:
    def test_stack_challenges(self, cfg):
        ch = {c["id"]: (c["height"], c["seconds"], c["multiplier"]) for c in cfg["stack"]["challenges"]}
        assert ch == {"sprint": (15, 25, 5), "pro": (25, 40, 10), "master": (45, 60, 20)}, ch

    def test_stack_mp_disabled(self, cfg):
        assert cfg["stack"].get("mp_enabled") is False

    def test_vortex_tables(self, cfg):
        exp = {"earth": [3, 3, 4, 4, 5], "water": [4, 5, 5, 6, 7], "fire": [5, 6, 7, 8, 9]}
        for k, lose in exp.items():
            t = cfg["vortex"]["tables"][k]
            assert t["segments"] == 12
            assert [len(st["lose_slots"]) for st in t["stages"]] == lose, (k, t)
        assert cfg["vortex"]["tables"]["earth"]["stages"][0]["survival"] == 0.75
        assert abs(cfg["vortex"]["tables"]["water"]["stages"][0]["survival"] - 0.6667) < 1e-3
        assert abs(cfg["vortex"]["tables"]["fire"]["stages"][0]["survival"] - 0.5833) < 1e-3

    def test_chicken_modes(self, cfg):
        m = cfg["chicken"]["modes"]
        assert list(m) == ["medium", "hard", "hardcore"]
        assert [m[k]["label"] for k in m] == ["Sprint", "Pro", "Master"]
        assert set(cfg["chicken"]["multipliers"]) == {"medium", "hard", "hardcore"}


# ---------- Tower (stack) timed only ----------
class TestStackTimedOnly:
    def test_endless_without_challenge_400(self, s):
        r = s.post(f"{API}/games/stack/start", json={"bet": 20, "mode": "endless"})
        assert r.status_code == 400 and "timed challenge" in r.text, r.text

    def test_endless_with_challenge_forced_timed(self, s):
        r = s.post(f"{API}/games/stack/start", json={"bet": 20, "mode": "endless", "challenge_id": "sprint"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["type"] == "timed" and d["challenge"]["height"] == 15 and d["challenge"]["seconds"] == 25
        # finish with bogus taps -> loss, recorded as stack
        f = s.post(f"{API}/games/stack/finish", json={"session_id": d["session_id"], "token": d["token"], "taps": [500]})
        assert f.status_code == 200, f.text
        assert f.json()["won"] is False and f.json()["prize"] == 0

    def test_bad_challenge_400(self, s):
        r = s.post(f"{API}/games/stack/start", json={"bet": 20, "mode": "timed", "challenge_id": "zzz"})
        assert r.status_code == 400


# ---------- Chicken ----------
class TestChicken:
    def test_easy_falls_back_to_medium(self, s, cfg):
        r = s.post(f"{API}/games/chicken/start", json={"bet": 20, "mode": "easy"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["mode"] == "medium" and d["steps"] == cfg["chicken"]["modes"]["medium"]["steps"]
        assert d["multipliers"] == cfg["chicken"]["multipliers"]["medium"]
        st = s.post(f"{API}/games/chicken/step", json={"session_id": d["session_id"], "token": d["token"]})
        assert st.status_code == 200
        if st.json().get("safe") and not st.json().get("finished"):
            c = s.post(f"{API}/games/chicken/collect", json={"session_id": d["session_id"], "token": d["token"]})
            assert c.status_code == 200


# ---------- Vortex first-spin loophole ----------
class TestVortexFirstSpin:
    def test_fire_first_spin_losses(self, s, cfg, mdb):
        mdb.users.update_one({"mobile": PLAYER[0]}, {"$set": {"main_balance": 10000}})
        lose0 = cfg["vortex"]["tables"]["fire"]["stages"][0]["lose_slots"]
        n, losses, mismatches = 40, 0, []
        for _ in range(n):
            st = s.post(f"{API}/games/vortex/start", json={"bet": 20, "theme": "fire"})
            assert st.status_code == 200, st.text
            d = st.json()
            assert d["table"]["stages"][0]["lose_slots"] == lose0
            sp = s.post(f"{API}/games/vortex/spin", json={"session_id": d["session_id"], "token": d["token"]})
            assert sp.status_code == 200, sp.text
            r = sp.json()
            fair = r.get("fair")
            if not r["survived"]:
                losses += 1
            else:
                c = s.post(f"{API}/games/vortex/collect", json={"session_id": d["session_id"], "token": d["token"]})
                assert c.status_code == 200, c.text
                fair = c.json().get("fair")
            # provably fair verification
            if fair and fair.get("server_seed"):
                assert hashlib.sha256(fair["server_seed"].encode()).hexdigest() == fair["server_seed_hash"]
                exp = int(pf_floats(fair["server_seed"], fair["client_seed"], fair["nonce"], 5)[0] * 12)
                if exp != r["landing"] or ((exp in lose0) == r["survived"]):
                    mismatches.append((exp, r["landing"], r["survived"]))
            else:
                mismatches.append(("no seed revealed", r))
        print(f"fire first-spin losses: {losses}/{n} = {losses / n:.0%}")
        assert not mismatches, mismatches
        assert 6 <= losses <= 30, losses  # expected ~42% (17/40)


# ---------- Stats by game ----------
class TestStatsByGame:
    def test_by_game(self, s, mdb):
        r = s.get(f"{API}/stats/by-game")
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and rows
        labels = {"tower": "T Mines", "stack": "Tower", "fixed": "Stopwatch"}
        uid = str(mdb.users.find_one({"mobile": PLAYER[0]})["_id"])
        for row in rows:
            for k in ("mode", "game", "played", "won", "lost", "wagered", "earned", "net", "loss"):
                assert k in row, (k, row)
            assert row["played"] == row["won"] + row["lost"]
            assert abs(row["net"] - round(row["earned"] - row["wagered"], 2)) < 0.02
            assert row["loss"] == round(max(0, -row["net"]), 2)
            if row["mode"] in labels:
                assert row["game"] == labels[row["mode"]]
            assert row["played"] == mdb.games.count_documents({"user_id": uid, "mode": row["mode"]})
        assert any(r["mode"] == "vortex" for r in rows) and any(r["mode"] == "stack" for r in rows)

    def test_unauth(self):
        assert requests.get(f"{API}/stats/by-game").status_code in (401, 403)


# ---------- Admin nested garbage ----------
class TestAdminNested:
    def test_garbage_theme_400(self, admin):
        before = admin.get(f"{API}/admin/config").json()
        vc = {**before["vortex_config"], "themes": {**before["vortex_config"]["themes"], "earth": "garbage"}}
        try:
            r = admin.put(f"{API}/admin/config", json={"data": {"vortex_config": vc}})
            assert r.status_code == 400, (r.status_code, r.text)
        finally:
            admin.put(f"{API}/admin/config", json={"data": {"vortex_config": before["vortex_config"]}})
        assert admin.get(f"{API}/admin/config").json()["vortex_config"] == before["vortex_config"]

    def test_garbage_chicken_mode_400(self, admin):
        before = admin.get(f"{API}/admin/config").json()
        cc = {**before["chicken_config"], "modes": {**before["chicken_config"]["modes"], "hard": "x"}}
        try:
            r = admin.put(f"{API}/admin/config", json={"data": {"chicken_config": cc}})
            assert r.status_code == 400, (r.status_code, r.text)
        finally:
            admin.put(f"{API}/admin/config", json={"data": {"chicken_config": before["chicken_config"]}})
        assert admin.get(f"{API}/admin/config").json()["chicken_config"] == before["chicken_config"]
