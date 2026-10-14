"""TIMEUP extra games: Vortex Spin, Chicken Quest (provably fair) and Tower Stack (skill, 3D).

Imported by server.py right before the API router is mounted. Uses server helpers lazily
via the `server` module so there is no circular-import problem.
"""
import asyncio
import hashlib
import hmac
import math
import random
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import server as S

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Default configs (merged into global config by server.get_config)
# ---------------------------------------------------------------------------
EXTRA_DEFAULTS = {
    "vortex_config": {
        "enabled": True,
        "min_bet": 20,
        "max_bet": 5000,
        "house_edge_percent": 4,
        "segments": 12,
        "partial_collect_percent": 50,
        "themes": {
            "earth": {"label": "Earth", "risk": "Low", "lose": [2, 2, 3, 3, 4]},
            "water": {"label": "Water", "risk": "Medium", "lose": [3, 3, 4, 5, 6]},
            "fire": {"label": "Fire", "risk": "High", "lose": [4, 5, 6, 7, 8]},
        },
    },
    "chicken_config": {
        "enabled": True,
        "min_bet": 20,
        "max_bet": 5000,
        "house_edge_percent": 3,
        "max_multiplier": 10000,
        "modes": {
            "easy": {"label": "Easy", "steps": 24, "hazard": 0.04},
            "medium": {"label": "Medium", "steps": 22, "hazard": 0.12},
            "hard": {"label": "Hard", "steps": 20, "hazard": 0.20},
            "hardcore": {"label": "Hardcore", "steps": 15, "hazard": 0.40},
        },
    },
    "stack_config": {
        "enabled": True,
        "min_bet": 20,
        "max_bet": 5000,
        # deterministic engine (same formula runs in browser + server replay)
        "range": 1.3,
        "base_speed": 0.55,
        "speed_step": 0.025,
        "max_speed": 1.5,
        "perfect_tolerance": 0.05,
        "combo_growth_after": 3,
        "combo_growth": 0.04,
        "min_tap_ms": 100,
        # endless payouts
        "min_height": 5,
        "per_level": 0.08,
        "per_perfect": 0.03,
        "max_multiplier": 20,
        "challenges": [
            {"id": "sprint", "label": "Sprint", "height": 10, "seconds": 30, "multiplier": 2},
            {"id": "pro", "label": "Pro", "height": 20, "seconds": 45, "multiplier": 4},
            {"id": "master", "label": "Master", "height": 30, "seconds": 60, "multiplier": 8},
        ],
        # multiplayer
        "mp_enabled": True,
        "mp_entry_fees": [50, 100, 200],
        "mp_sizes": [2, 4],
        "mp_platform_fee_percent": 10,
        "mp_play_window_seconds": 180,
        "mp_bot_fill_seconds": 20,
        "mp_bot_min_height": 6,
        "mp_bot_max_height": 26,
        "mp_open_timeout_minutes": 10,
    },
}
S.DEFAULT_CONFIG.update(EXTRA_DEFAULTS)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Provably fair core
# ---------------------------------------------------------------------------
def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def pf_floats(server_seed: str, client_seed: str, nonce: int, count: int) -> List[float]:
    """HMAC_SHA256(server_seed, f"{client_seed}:{nonce}:{cursor}") -> 8 floats per digest (4 bytes each)."""
    out: List[float] = []
    cursor = 0
    while len(out) < count:
        dig = hmac.new(server_seed.encode(), f"{client_seed}:{nonce}:{cursor}".encode(), hashlib.sha256).digest()
        for j in range(0, 32, 4):
            b = dig[j:j + 4]
            out.append(b[0] / 256 + b[1] / 256 ** 2 + b[2] / 256 ** 3 + b[3] / 256 ** 4)
        cursor += 1
    return out[:count]


def _new_seed():
    seed = secrets.token_hex(32)
    return seed, sha256_hex(seed)


async def ensure_pf(user: dict) -> dict:
    u = await S.get_user_by_id(str(user["_id"]))
    if not u.get("pf_server_seed"):
        seed, h = _new_seed()
        sets = {"pf_server_seed": seed, "pf_server_hash": h,
                "pf_client_seed": u.get("pf_client_seed") or secrets.token_hex(8),
                "pf_nonce": u.get("pf_nonce", 0)}
        await S.db.users.update_one({"_id": u["_id"]}, {"$set": sets})
        u.update(sets)
    return u


async def consume_pf(user: dict) -> dict:
    """Use the committed server seed for this round and immediately commit a fresh one."""
    for _ in range(5):
        u = await ensure_pf(user)
        seed, h = _new_seed()
        res = await S.db.users.update_one(
            {"_id": u["_id"], "pf_server_seed": u["pf_server_seed"]},
            {"$set": {"pf_server_seed": seed, "pf_server_hash": h}, "$inc": {"pf_nonce": 1}})
        if res.modified_count == 1:
            return {"server_seed": u["pf_server_seed"], "server_seed_hash": u["pf_server_hash"],
                    "client_seed": u["pf_client_seed"], "nonce": int(u.get("pf_nonce", 0)),
                    "next_server_seed_hash": h}
    raise HTTPException(status_code=409, detail="Please try again")


def fair_public(f: dict, reveal: bool) -> dict:
    out = {"server_seed_hash": f["server_seed_hash"], "client_seed": f["client_seed"], "nonce": f["nonce"]}
    if reveal:
        out["server_seed"] = f["server_seed"]
    return out


class ClientSeedReq(BaseModel):
    client_seed: str


@router.get("/fair/seed")
async def fair_seed(user: dict = Depends(S.get_current_user)):
    u = await ensure_pf(user)
    return {"server_seed_hash": u["pf_server_hash"], "client_seed": u["pf_client_seed"],
            "nonce": int(u.get("pf_nonce", 0))}


@router.post("/fair/client-seed")
async def fair_set_client_seed(body: ClientSeedReq, user: dict = Depends(S.get_current_user)):
    cs = body.client_seed.strip()
    if not (1 <= len(cs) <= 64) or not all(c.isalnum() or c in "-_" for c in cs):
        raise HTTPException(status_code=400, detail="Client seed: 1-64 letters, numbers, - or _")
    await ensure_pf(user)
    await S.db.users.update_one({"_id": user["_id"]}, {"$set": {"pf_client_seed": cs}})
    return await fair_seed(user)


@router.get("/fair/rounds")
async def fair_rounds(user: dict = Depends(S.get_current_user)):
    rows = await S.db.games.find({"user_id": str(user["_id"]), "fair": {"$exists": True}},
                                 {"_id": 0}).sort("created_at", -1).to_list(50)
    return rows


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------
def _num(v, default):
    try:
        f = float(v)
        return default if math.isnan(f) else f
    except (TypeError, ValueError):
        return default


def _bet_checks(gc: dict, bet: float, name: str):
    lo, hi = _num(gc.get("min_bet"), 20), _num(gc.get("max_bet"), 5000)
    if bet <= 0 or bet < lo:
        raise HTTPException(status_code=400, detail=f"Minimum bet is {lo:g} coins")
    if bet > hi:
        raise HTTPException(status_code=400, detail=f"Maximum bet is {hi:g} coins")


def sanitize_extra_config(data: dict):
    """Validate / clamp admin edits of the 3 new game configs (called from PUT /admin/config)."""
    bad = []

    def fix(section, key, lo, hi, default, integer=False):
        sec = data.get(section)
        if not isinstance(sec, dict) or key not in sec:
            return
        v = _num(sec[key], None)
        if v is None:
            bad.append(f"{section}.{key}")
            v = default
        v = max(lo, min(hi, v))
        sec[key] = int(round(v)) if integer else v

    for sec in ("vortex_config", "chicken_config", "stack_config"):
        fix(sec, "min_bet", 1, 1e7, 20)
        fix(sec, "max_bet", 1, 1e8, 5000)
        fix(sec, "house_edge_percent", 0, 50, 4)
    fix("vortex_config", "partial_collect_percent", 1, 99, 50)
    fix("vortex_config", "segments", 4, 24, 12, integer=True)
    vc = data.get("vortex_config")
    if isinstance(vc, dict):
        seg = int(vc.get("segments", 12) or 12)
        for t in (vc.get("themes") or {}).values():
            lose = [int(max(1, min(seg - 1, _num(x, 1)))) for x in (t.get("lose") or [])]
            t["lose"] = lose or [2, 2, 3, 3, 4]
    cc = data.get("chicken_config")
    if isinstance(cc, dict):
        for m in (cc.get("modes") or {}).values():
            m["steps"] = int(max(2, min(60, _num(m.get("steps"), 20))))
            m["hazard"] = max(0.005, min(0.9, _num(m.get("hazard"), 0.1)))
    for key, lo, hi, d in [("min_height", 1, 100, 5), ("per_level", 0, 5, 0.08), ("per_perfect", 0, 5, 0.03),
                           ("max_multiplier", 1, 1000, 20), ("base_speed", 0.1, 5, 0.55), ("max_speed", 0.1, 8, 1.5),
                           ("speed_step", 0, 1, 0.025), ("perfect_tolerance", 0.005, 0.3, 0.05),
                           ("mp_platform_fee_percent", 0, 50, 10), ("mp_play_window_seconds", 30, 3600, 180),
                           ("mp_bot_fill_seconds", 3, 3600, 20)]:
        fix("stack_config", key, lo, hi, d)
    sc = data.get("stack_config")
    if isinstance(sc, dict):
        if "mp_sizes" in sc:
            sc["mp_sizes"] = sorted({int(max(2, min(4, _num(x, 2)))) for x in (sc.get("mp_sizes") or [2])}) or [2]
        if "mp_entry_fees" in sc:
            sc["mp_entry_fees"] = [round(_num(x, 50), 2) for x in (sc.get("mp_entry_fees") or []) if _num(x, 0) > 0] or [50]
    return bad


async def _load_user_with_balance(user: dict, bet: float) -> dict:
    u = await S.get_user_by_id(str(user["_id"]))
    if u.get("main_balance", 0) + u.get("bonus_balance", 0) < bet:
        raise HTTPException(status_code=400, detail="Insufficient balance for this bet")
    return u


async def _lock_session(session_id: str, token: str, user: dict, mode: str) -> dict:
    s = await S.db.game_sessions.find_one({"id": session_id})
    if not s or s.get("mode") != mode:
        raise HTTPException(status_code=404, detail="Session not found")
    if s["user_id"] != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Not your session")
    if s["status"] != "active":
        raise HTTPException(status_code=409, detail="Round already finished")
    if s.get("token") != token:
        raise HTTPException(status_code=403, detail="Invalid session token")
    locked = await S.db.game_sessions.find_one_and_update(
        {"id": session_id, "status": "active", "seq": s.get("seq", 0)}, {"$inc": {"seq": 1}})
    if not locked:
        raise HTTPException(status_code=409, detail="Action already in progress")
    return s


async def _record_game(user_id: str, mode: str, entry: float, prize: float, won: bool,
                       target, recorded, details: dict = None, fair: dict = None,
                       credit_now: float = None):
    """Insert game record, credit `credit_now` (defaults to prize), update stats, referral commission."""
    rec = {
        "id": str(uuid.uuid4()),
        "game_id": "GM" + uuid.uuid4().hex[:10].upper(),
        "user_id": user_id, "mode": mode, "target": target, "recorded": recorded, "diff": 0.0,
        "entry_fee": entry, "prize": round(prize, 2), "result": "won" if won else "lost",
        "flagged": False, "created_at": S.now_iso(), "details": details or {},
    }
    if fair:
        rec["fair"] = fair
    await S.db.games.insert_one(dict(rec))
    pay = prize if credit_now is None else credit_now
    if pay > 0:
        await S.credit_wallet(user_id, round(pay, 2), "prize", "main", meta={"mode": mode, "game_id": rec["game_id"]})
    inc = {"stats.games_played": 1}
    if won:
        inc["stats.games_won"] = 1
    if prize > 0:
        inc["stats.total_prizes"] = round(prize, 2)
    await S.db.users.update_one({"_id": ObjectId(user_id)}, {"$inc": inc})
    await S.pay_referral_commission(user_id, won, entry, prize)
    rec.pop("_id", None)
    return rec


async def _forfeit_active(user_id: str, mode: str):
    """A new round replaces an unfinished one: settle the old one as lost (seed revealed, game recorded)."""
    for s in await S.db.game_sessions.find({"user_id": user_id, "mode": mode, "status": "active"}).to_list(10):
        res = await S.db.game_sessions.update_one({"id": s["id"], "status": "active"}, {"$set": {"status": "forfeited"}})
        if res.modified_count != 1:
            continue
        if mode == "vortex":
            total = round(s.get("collected", 0.0), 2)
            await _record_game(user_id, "vortex", s["entry_fee"], total, won=total > s["entry_fee"],
                               target=len(s["table"]["stages"]), recorded=s["stage"], credit_now=0.0,
                               details={"theme": s["theme"], "stages_cleared": s["stage"], "forfeited": True,
                                        "partial_collected": total, "segments": s["table"]["segments"],
                                        "lose": [len(x["lose_slots"]) for x in s["table"]["stages"]]},
                               fair=fair_public(s["fair"], True))
        else:
            await _record_game(user_id, "chicken", s["entry_fee"], 0.0, False, target=s["steps"], recorded=s["step"],
                               details={"difficulty": s["difficulty"], "hazard_step": s["hazard_step"], "forfeited": True,
                                        "steps": s["steps"], "hazard": s["hazard"]},
                               fair=fair_public(s["fair"], True))


# ---------------------------------------------------------------------------
# Vortex Spin
# ---------------------------------------------------------------------------
def vortex_lose_slots(segments: int, lose: int) -> List[int]:
    lose = max(0, min(segments - 1, lose))
    return sorted({(j * segments) // lose for j in range(lose)}) if lose else []


def vortex_table(vc: dict, theme: str) -> dict:
    t = vc["themes"][theme]
    seg = int(vc.get("segments", 12))
    he = max(0.0, min(0.5, vc.get("house_edge_percent", 4) / 100.0))
    stages, cum = [], 1.0
    for lose in t["lose"]:
        slots = vortex_lose_slots(seg, int(lose))
        surv = (seg - len(slots)) / seg
        step = (1.0 - he) / surv
        cum *= step
        stages.append({"lose_slots": slots, "survival": round(surv, 4),
                       "step_multiplier": round(step, 4), "multiplier": round(cum, 2)})
    return {"segments": seg, "stages": stages}


class VortexStartReq(BaseModel):
    bet: float
    theme: str = "earth"


class TokenReq(BaseModel):
    session_id: str
    token: str


class VortexCollectReq(BaseModel):
    session_id: str
    token: str
    partial: bool = False


@router.post("/games/vortex/start")
async def vortex_start(body: VortexStartReq, user: dict = Depends(S.get_current_user)):
    cfg = await S.get_config()
    vc = cfg.get("vortex_config", EXTRA_DEFAULTS["vortex_config"])
    if not cfg["game_enabled"] or not vc.get("enabled", True):
        raise HTTPException(status_code=403, detail="Vortex Spin is currently disabled")
    theme = body.theme if body.theme in vc["themes"] else "earth"
    bet = round(float(body.bet), 2)
    _bet_checks(vc, bet, "vortex")
    u = await _load_user_with_balance(user, bet)
    await _forfeit_active(str(user["_id"]), "vortex")
    fair = await consume_pf(user)
    table = vortex_table(vc, theme)
    floats = pf_floats(fair["server_seed"], fair["client_seed"], fair["nonce"], len(table["stages"]))
    landings = [int(f * table["segments"]) for f in floats]
    await S.debit_wallet(u, bet, "game_entry", meta={"mode": "vortex", "theme": theme})
    session = {
        "id": str(uuid.uuid4()), "user_id": str(user["_id"]), "mode": "vortex", "theme": theme,
        "entry_fee": bet, "table": table, "landings": landings, "stage": 0, "at_risk": bet,
        "collected": 0.0, "partial_done_stage": -1, "token": secrets.token_urlsafe(16), "seq": 0,
        "fair": fair, "status": "active", "created_at": S.now_iso(),
    }
    await S.db.game_sessions.insert_one(dict(session))
    await S.db.users.update_one({"_id": u["_id"]}, {"$inc": {"stats.total_entries": bet}})
    return {"session_id": session["id"], "token": session["token"], "entry_fee": bet, "theme": theme,
            "table": table, "partial_collect_percent": vc.get("partial_collect_percent", 50),
            "fair": fair_public(fair, False), "next_server_seed_hash": fair["next_server_seed_hash"],
            "wallet": await S.get_wallet(user)}


async def _vortex_settle(s: dict, user: dict, final_credit: float, lost: bool):
    total = round(s["collected"] + final_credit, 2)
    await S.db.game_sessions.update_one({"id": s["id"]}, {"$set": {
        "status": "completed", "prize_awarded": total, "lost": lost, "stopped_at": S.now_iso()}})
    rec = await _record_game(
        s["user_id"], "vortex", s["entry_fee"], total, won=total > s["entry_fee"], target=len(s["table"]["stages"]),
        recorded=s["stage"], credit_now=final_credit,
        details={"theme": s["theme"], "stages_cleared": s["stage"], "partial_collected": round(s["collected"], 2),
                 "segments": s["table"]["segments"], "lose": [len(x["lose_slots"]) for x in s["table"]["stages"]],
                 "landings": s["landings"][: s["stage"] + (1 if lost else 0)]},
        fair=fair_public(s["fair"], True))
    return total, rec


@router.post("/games/vortex/spin")
async def vortex_spin(body: TokenReq, user: dict = Depends(S.get_current_user)):
    s = await _lock_session(body.session_id, body.token, user, "vortex")
    k = s["stage"]
    stages = s["table"]["stages"]
    if k >= len(stages):
        raise HTTPException(status_code=400, detail="All stages cleared")
    landing = s["landings"][k]
    st = stages[k]
    if landing in st["lose_slots"]:
        s["at_risk"] = 0.0
        total, rec = await _vortex_settle(s, user, 0.0, lost=True)
        return {"survived": False, "stage": k, "landing": landing, "total_prize": total,
                "fair": fair_public(s["fair"], True), "game": rec, "wallet": await S.get_wallet(user)}
    new_risk = round(s["at_risk"] * st["step_multiplier"], 2)
    s["stage"] = k + 1
    s["at_risk"] = new_risk
    await S.db.game_sessions.update_one({"id": s["id"]}, {"$set": {"stage": k + 1, "at_risk": new_risk}})
    if k + 1 >= len(stages):
        total, rec = await _vortex_settle(s, user, new_risk, lost=False)
        return {"survived": True, "finished": True, "stage": k + 1, "landing": landing, "at_risk": 0.0,
                "total_prize": total, "fair": fair_public(s["fair"], True), "game": rec,
                "wallet": await S.get_wallet(user)}
    return {"survived": True, "finished": False, "stage": k + 1, "landing": landing, "at_risk": new_risk,
            "collected": round(s["collected"], 2)}


@router.post("/games/vortex/collect")
async def vortex_collect(body: VortexCollectReq, user: dict = Depends(S.get_current_user)):
    s = await _lock_session(body.session_id, body.token, user, "vortex")
    if s["stage"] < 1:
        raise HTTPException(status_code=400, detail="Spin at least once before collecting")
    if not body.partial:
        total, rec = await _vortex_settle(s, user, s["at_risk"], lost=False)
        return {"collected_now": round(s["at_risk"], 2), "finished": True, "total_prize": total,
                "fair": fair_public(s["fair"], True), "game": rec, "wallet": await S.get_wallet(user)}
    if s.get("partial_done_stage") == s["stage"]:
        raise HTTPException(status_code=400, detail="Partial collect already used at this stage — spin again first")
    cfg = await S.get_config()
    pct = cfg.get("vortex_config", {}).get("partial_collect_percent", 50)
    amt = round(s["at_risk"] * pct / 100.0, 2)
    new_risk = round(s["at_risk"] - amt, 2)
    collected = round(s["collected"] + amt, 2)
    await S.db.game_sessions.update_one({"id": s["id"]}, {"$set": {
        "at_risk": new_risk, "collected": collected, "partial_done_stage": s["stage"]}})
    await S.credit_wallet(s["user_id"], amt, "prize", "main", meta={"mode": "vortex", "partial": True})
    return {"collected_now": amt, "finished": False, "at_risk": new_risk, "collected": collected,
            "wallet": await S.get_wallet(user)}


@router.get("/games/vortex/active")
async def vortex_active(user: dict = Depends(S.get_current_user)):
    s = await S.db.game_sessions.find_one({"user_id": str(user["_id"]), "mode": "vortex", "status": "active"})
    if not s:
        return {"active": False}
    return {"active": True, "session_id": s["id"], "token": s["token"], "entry_fee": s["entry_fee"], "theme": s["theme"],
            "table": s["table"], "stage": s["stage"], "at_risk": s["at_risk"], "collected": s["collected"],
            "partial_done_stage": s.get("partial_done_stage", -1), "fair": fair_public(s["fair"], False)}


# ---------------------------------------------------------------------------
# Chicken Quest
# ---------------------------------------------------------------------------
def _clamp_hazard(h) -> float:
    return min(0.95, max(0.001, float(h)))


def chicken_multipliers(cc: dict, mode: str) -> List[float]:
    m = cc["modes"][mode]
    he = max(0.0, min(0.5, cc.get("house_edge_percent", 3) / 100.0))
    p = _clamp_hazard(m["hazard"])
    cap = cc.get("max_multiplier", 10000)
    return [round(min(cap, (1.0 - he) / ((1.0 - p) ** k)), 2) for k in range(1, int(m["steps"]) + 1)]


class ChickenStartReq(BaseModel):
    bet: float
    mode: str = "easy"


@router.post("/games/chicken/start")
async def chicken_start(body: ChickenStartReq, user: dict = Depends(S.get_current_user)):
    cfg = await S.get_config()
    cc = cfg.get("chicken_config", EXTRA_DEFAULTS["chicken_config"])
    if not cfg["game_enabled"] or not cc.get("enabled", True):
        raise HTTPException(status_code=403, detail="Chicken Quest is currently disabled")
    mode = body.mode if body.mode in cc["modes"] else "easy"
    bet = round(float(body.bet), 2)
    _bet_checks(cc, bet, "chicken")
    u = await _load_user_with_balance(user, bet)
    await _forfeit_active(str(user["_id"]), "chicken")
    fair = await consume_pf(user)
    steps = int(cc["modes"][mode]["steps"])
    p = _clamp_hazard(cc["modes"][mode]["hazard"])
    floats = pf_floats(fair["server_seed"], fair["client_seed"], fair["nonce"], steps)
    hazard_step = next((i + 1 for i, f in enumerate(floats) if f < p), None)
    mults = chicken_multipliers(cc, mode)
    await S.debit_wallet(u, bet, "game_entry", meta={"mode": "chicken", "difficulty": mode})
    session = {
        "id": str(uuid.uuid4()), "user_id": str(user["_id"]), "mode": "chicken", "difficulty": mode,
        "entry_fee": bet, "steps": steps, "hazard": p, "hazard_step": hazard_step, "multipliers": mults,
        "step": 0, "token": secrets.token_urlsafe(16), "seq": 0, "fair": fair,
        "status": "active", "created_at": S.now_iso(),
    }
    await S.db.game_sessions.insert_one(dict(session))
    await S.db.users.update_one({"_id": u["_id"]}, {"$inc": {"stats.total_entries": bet}})
    return {"session_id": session["id"], "token": session["token"], "entry_fee": bet, "mode": mode,
            "steps": steps, "multipliers": mults, "fair": fair_public(fair, False),
            "next_server_seed_hash": fair["next_server_seed_hash"], "wallet": await S.get_wallet(user)}


async def _chicken_settle(s: dict, won: bool, step: int):
    mult = s["multipliers"][step - 1] if won and step > 0 else 0.0
    prize = round(s["entry_fee"] * mult, 2) if won else 0.0
    await S.db.game_sessions.update_one({"id": s["id"]}, {"$set": {
        "status": "completed", "won": won, "prize_awarded": prize, "step": step, "stopped_at": S.now_iso()}})
    rec = await _record_game(s["user_id"], "chicken", s["entry_fee"], prize, won, target=s["steps"],
                             recorded=step, details={"difficulty": s["difficulty"], "hazard_step": s["hazard_step"],
                                                     "multiplier": mult, "steps": s["steps"], "hazard": s["hazard"]},
                             fair=fair_public(s["fair"], True))
    return prize, mult, rec


@router.get("/games/chicken/active")
async def chicken_active(user: dict = Depends(S.get_current_user)):
    s = await S.db.game_sessions.find_one({"user_id": str(user["_id"]), "mode": "chicken", "status": "active"})
    if not s:
        return {"active": False}
    return {"active": True, "session_id": s["id"], "token": s["token"], "entry_fee": s["entry_fee"], "mode": s["difficulty"],
            "steps": s["steps"], "multipliers": s["multipliers"], "step": s["step"], "fair": fair_public(s["fair"], False)}


@router.post("/games/chicken/step")
async def chicken_step(body: TokenReq, user: dict = Depends(S.get_current_user)):
    s = await _lock_session(body.session_id, body.token, user, "chicken")
    nxt = s["step"] + 1
    if nxt > s["steps"]:
        raise HTTPException(status_code=400, detail="Already at the finish")
    if s["hazard_step"] == nxt:
        await _chicken_settle(s, False, s["step"])
        return {"safe": False, "step": nxt, "hazard_step": s["hazard_step"], "prize": 0.0,
                "fair": fair_public(s["fair"], True), "wallet": await S.get_wallet(user)}
    await S.db.game_sessions.update_one({"id": s["id"]}, {"$set": {"step": nxt}})
    if nxt >= s["steps"]:
        prize, mult, rec = await _chicken_settle(s, True, nxt)
        return {"safe": True, "finished": True, "step": nxt, "multiplier": mult, "prize": prize,
                "hazard_step": s["hazard_step"], "fair": fair_public(s["fair"], True), "game": rec,
                "wallet": await S.get_wallet(user)}
    m = s["multipliers"][nxt - 1]
    return {"safe": True, "finished": False, "step": nxt, "multiplier": m,
            "cashout_value": round(s["entry_fee"] * m, 2), "next_multiplier": s["multipliers"][nxt]}


@router.post("/games/chicken/collect")
async def chicken_collect(body: TokenReq, user: dict = Depends(S.get_current_user)):
    s = await _lock_session(body.session_id, body.token, user, "chicken")
    if s["step"] < 1:
        raise HTTPException(status_code=400, detail="Take at least one step before collecting")
    prize, mult, rec = await _chicken_settle(s, True, s["step"])
    return {"won": True, "step": s["step"], "multiplier": mult, "prize": prize, "hazard_step": s["hazard_step"],
            "fair": fair_public(s["fair"], True), "game": rec, "wallet": await S.get_wallet(user)}


# ---------------------------------------------------------------------------
# Tower Stack (skill) — deterministic engine replayed server-side
# ---------------------------------------------------------------------------
ENGINE_KEYS = ["range", "base_speed", "speed_step", "max_speed", "perfect_tolerance",
               "combo_growth_after", "combo_growth", "min_tap_ms"]


def _tri(x: float) -> float:
    u = x % 2.0
    return -1.0 + 2.0 * u if u < 1.0 else 3.0 - 2.0 * u


def _block_params(eng: dict, i: int):
    phases = eng.get("phases") or [0.0]
    jitter = eng.get("jitter") or [1.0]
    return float(phases[i % len(phases)]), float(jitter[i % len(jitter)])


def stack_replay(eng: dict, taps: List[int], target: Optional[int] = None) -> dict:
    rng = float(eng["range"])
    tol = float(eng["perfect_tolerance"])
    top = {"x": 0.0, "z": 0.0, "w": 1.0, "d": 1.0}
    height = perfects = combo = max_combo = 0
    elapsed = 0
    failed = False
    reached_at = None
    perfect_offsets: List[float] = []
    for i, t in enumerate(taps):
        t = int(t)
        elapsed += t
        axis = i % 2
        speed = min(float(eng["max_speed"]), float(eng["base_speed"]) + i * float(eng["speed_step"]))
        ph, jit = _block_params(eng, i)
        speed = speed * jit
        off = rng * _tri(t / 1000.0 * speed + ph)
        key_c, key_s = ("x", "w") if axis == 0 else ("z", "d")
        size = top[key_s]
        new = dict(top)
        if abs(off) <= tol:
            combo += 1
            perfects += 1
            perfect_offsets.append(abs(off))
            if combo >= int(eng["combo_growth_after"]):
                new[key_s] = min(1.0, size + float(eng["combo_growth"]))
        else:
            combo = 0
            overlap = size - abs(off)
            if overlap <= 0:
                failed = True
                break
            new[key_c] = top[key_c] + off / 2.0
            new[key_s] = overlap
        max_combo = max(max_combo, combo)
        height += 1
        top = new
        if target and height >= target and reached_at is None:
            reached_at = elapsed
            break
    # machine-precision detector: humans land "perfects" spread across the tolerance window
    bot_like = len(perfect_offsets) >= 8 and (sum(perfect_offsets) / len(perfect_offsets)) < tol * 0.12
    return {"height": height, "perfects": perfects, "max_combo": max_combo, "failed": failed,
            "elapsed_ms": elapsed, "reached_at_ms": reached_at, "bot_like": bot_like}


def stack_endless_mult(sc: dict, height: int, perfects: int) -> float:
    if height < int(sc.get("min_height", 5)):
        return 0.0
    m = height * float(sc.get("per_level", 0.08)) + perfects * float(sc.get("per_perfect", 0.03))
    return round(min(float(sc.get("max_multiplier", 20)), m), 2)


def _engine(sc: dict) -> dict:
    eng = {k: sc[k] for k in ENGINE_KEYS}
    rnd = random.SystemRandom()
    # per-session random start phase & speed jitter for every block (defeats fixed-formula scripts)
    eng["phases"] = [round(rnd.uniform(0.0, 2.0), 4) for _ in range(300)]
    eng["jitter"] = [round(rnd.uniform(0.9, 1.12), 4) for _ in range(300)]
    return eng


class StackStartReq(BaseModel):
    bet: float = 0
    mode: str = "endless"  # endless | timed
    challenge_id: Optional[str] = None


class StackFinishReq(BaseModel):
    session_id: str
    token: str
    taps: List[int]


async def _stack_config():
    cfg = await S.get_config()
    sc = dict(EXTRA_DEFAULTS["stack_config"])
    sc.update(cfg.get("stack_config", {}))
    return cfg, sc


@router.post("/games/stack/start")
async def stack_start(body: StackStartReq, user: dict = Depends(S.get_current_user)):
    cfg, sc = await _stack_config()
    if not cfg["game_enabled"] or not sc.get("enabled", True):
        raise HTTPException(status_code=403, detail="Tower Stack is currently disabled")
    mode = body.mode if body.mode in ("endless", "timed") else "endless"
    challenge = None
    if mode == "timed":
        challenge = next((c for c in sc.get("challenges", []) if c["id"] == body.challenge_id), None)
        if not challenge:
            raise HTTPException(status_code=400, detail="Pick a timed challenge")
    bet = round(float(body.bet), 2)
    _bet_checks(sc, bet, "stack")
    u = await _load_user_with_balance(user, bet)
    await S.db.game_sessions.update_many({"user_id": str(user["_id"]), "mode": "stack", "status": "active",
                                          "room_id": None}, {"$set": {"status": "abandoned"}})
    await S.debit_wallet(u, bet, "game_entry", meta={"mode": "stack", "type": mode})
    session = {
        "id": str(uuid.uuid4()), "user_id": str(user["_id"]), "mode": "stack", "type": mode,
        "challenge": challenge, "entry_fee": bet, "engine": _engine(sc), "room_id": None,
        "token": secrets.token_urlsafe(16), "seq": 0, "status": "active",
        "server_start": _now().timestamp(), "created_at": S.now_iso(),
    }
    await S.db.game_sessions.insert_one(dict(session))
    await S.db.users.update_one({"_id": u["_id"]}, {"$inc": {"stats.total_entries": bet}})
    return {"session_id": session["id"], "token": session["token"], "type": mode, "challenge": challenge,
            "entry_fee": bet, "engine": session["engine"], "wallet": await S.get_wallet(user)}


def _validate_taps(s: dict, taps: List[int]):
    eng = s["engine"]
    if len(taps) > 2000:
        raise HTTPException(status_code=400, detail="Too many moves")
    if any((not isinstance(t, int)) or t < int(eng["min_tap_ms"]) or t > 600000 for t in taps):
        return True  # flagged
    server_ms = (_now().timestamp() - s["server_start"]) * 1000.0
    return sum(taps) > server_ms + S.LATENCY_BOUND * 1000.0


@router.post("/games/stack/finish")
async def stack_finish(body: StackFinishReq, user: dict = Depends(S.get_current_user)):
    s = await _lock_session(body.session_id, body.token, user, "stack")
    cfg, sc = await _stack_config()
    flagged = _validate_taps(s, body.taps)
    ch = s.get("challenge")
    r = stack_replay(s["engine"], body.taps, target=ch["height"] if ch else None)
    flagged = flagged or r.get("bot_like", False)
    if flagged:
        r["height"], r["perfects"] = 0, 0
    await S.db.game_sessions.update_one({"id": s["id"]}, {"$set": {
        "status": "completed", "result": r, "flagged": flagged, "taps": body.taps[:2000], "stopped_at": S.now_iso()}})

    if s.get("room_id"):
        await _mp_submit(s["room_id"], s["user_id"], r)
        room = await S.db.stack_rooms.find_one({"id": s["room_id"]}, {"_id": 0})
        return {"result": r, "flagged": flagged, "room": _annotate(room, s["user_id"]), "wallet": await S.get_wallet(user)}

    if s["type"] == "timed":
        ok = (not flagged) and r["reached_at_ms"] is not None and r["reached_at_ms"] <= ch["seconds"] * 1000
        mult = float(ch["multiplier"]) if ok else 0.0
        won = ok
    else:
        mult = 0.0 if flagged else stack_endless_mult(sc, r["height"], r["perfects"])
        won = mult >= 1.0
    prize = round(s["entry_fee"] * mult, 2)
    rec = await _record_game(s["user_id"], "stack", s["entry_fee"], prize, won,
                             target=ch["height"] if ch else None, recorded=r["height"],
                             details={"type": s["type"], "challenge": ch["id"] if ch else None,
                                      "perfects": r["perfects"], "max_combo": r["max_combo"], "multiplier": mult,
                                      "flagged": flagged})
    return {"result": r, "flagged": flagged, "multiplier": mult, "prize": prize, "won": won, "game": rec,
            "wallet": await S.get_wallet(user)}


# ---------------------------------------------------------------------------
# Tower Stack multiplayer rooms (2-4 players, highest tower takes the pool)
# ---------------------------------------------------------------------------
def _room_public(room: dict) -> dict:
    if not room:
        return None
    room = dict(room)
    room.pop("_id", None)
    room["players"] = [{**{k: v for k, v in p.items() if k not in ("session_id", "bot_finish_at", "bot_result")},
                        "started": bool(p.get("session_id")) or bool(p.get("submitted"))}
                       for p in room.get("players", [])]
    return room


def _annotate(room: dict, uid: str) -> dict:
    pub = _room_public(room)
    for p in pub["players"]:
        p["is_me"] = p["user_id"] == uid
    me = next((p for p in pub["players"] if p["is_me"]), None)
    pub["me_started"] = bool(me and me["started"])
    # don't reveal opponents' scores before you have submitted your own run
    if pub["status"] == "LIVE" and not (me and me.get("submitted")):
        for p in pub["players"]:
            if not p["is_me"]:
                p.pop("height", None)
                p.pop("perfects", None)
    return pub


async def _ensure_open_rooms(sc: dict):
    for fee in sc.get("mp_entry_fees", []):
        for size in sc.get("mp_sizes", []):
            exists = await S.db.stack_rooms.find_one({"status": "OPEN", "entry_fee": fee, "max_players": size})
            if not exists:
                await S.db.stack_rooms.insert_one({
                    "id": str(uuid.uuid4()), "code": "ST" + secrets.token_hex(2).upper(),
                    "entry_fee": fee, "max_players": size, "status": "OPEN", "players": [],
                    "platform_fee_percent": sc.get("mp_platform_fee_percent", 10),
                    "created_at": S.now_iso(), "live_at": None, "deadline": None,
                    "winner": None, "prize": 0.0})


async def _go_live(room: dict, sc: dict):
    now = _now()
    window = int(sc.get("mp_play_window_seconds", 180))
    players = room["players"]
    lo, hi = int(sc.get("mp_bot_min_height", 6)), int(sc.get("mp_bot_max_height", 26))
    for p in players:
        if p.get("is_bot"):
            h = random.randint(lo, hi)
            p["bot_finish_at"] = _iso(now + timedelta(seconds=random.randint(15, max(20, window // 2))))
            p["bot_result"] = {"height": h, "perfects": random.randint(0, max(1, h // 3))}
    await S.db.stack_rooms.update_one({"id": room["id"], "status": "OPEN"}, {"$set": {
        "status": "LIVE", "players": players, "live_at": _iso(now),
        "deadline": _iso(now + timedelta(seconds=window))}})


async def _mp_submit(room_id: str, user_id: str, r: dict):
    await S.db.stack_rooms.update_one(
        {"id": room_id, "status": "LIVE", "players.user_id": user_id},
        {"$set": {"players.$.submitted": True, "players.$.height": r["height"],
                  "players.$.perfects": r["perfects"], "players.$.finished_at": S.now_iso()}})
    await _maybe_settle(room_id)


async def _maybe_settle(room_id: str):
    room = await S.db.stack_rooms.find_one({"id": room_id})
    if not room or room["status"] != "LIVE":
        return
    now = _now()
    changed = False
    for p in room["players"]:
        if p.get("is_bot") and not p.get("submitted") and datetime.fromisoformat(p["bot_finish_at"]) <= now:
            p.update({"submitted": True, "height": p["bot_result"]["height"],
                      "perfects": p["bot_result"]["perfects"], "finished_at": _iso(now)})
            changed = True
    if changed:
        await S.db.stack_rooms.update_one({"id": room_id}, {"$set": {"players": room["players"]}})
    all_done = all(p.get("submitted") for p in room["players"])
    if not all_done and datetime.fromisoformat(room["deadline"]) > now:
        return
    # settle (atomic status flip)
    res = await S.db.stack_rooms.update_one({"id": room_id, "status": "LIVE"}, {"$set": {"status": "SETTLING"}})
    if res.modified_count != 1:
        return
    for p in room["players"]:
        if not p.get("submitted"):
            p.update({"submitted": True, "height": 0, "perfects": 0, "finished_at": _iso(now)})
    ranked = sorted(room["players"], key=lambda p: (-p.get("height", 0), -p.get("perfects", 0), p.get("finished_at", "")))
    pool = room["entry_fee"] * len(room["players"])
    prize = round(pool * (1 - room.get("platform_fee_percent", 10) / 100.0), 2)
    winner = ranked[0]
    for rank, p in enumerate(ranked, 1):
        p["rank"] = rank
    for p in room["players"]:
        if p.get("is_bot"):
            continue
        won = p["user_id"] == winner["user_id"]
        await _record_game(p["user_id"], "stack_mp", room["entry_fee"], prize if won else 0.0, won,
                           target=None, recorded=p.get("height", 0),
                           details={"room_id": room_id, "rank": p["rank"], "players": len(room["players"]),
                                    "perfects": p.get("perfects", 0)})
    await S.db.stack_rooms.update_one({"id": room_id}, {"$set": {
        "status": "COMPLETED", "players": room["players"], "prize": prize,
        "winner": {"user_id": winner["user_id"], "username": winner["username"], "height": winner.get("height", 0)},
        "completed_at": _iso(now)}})


async def stack_room_tick():
    cfg, sc = await _stack_config()
    now = _now()
    bot_cfg = cfg.get("bot_config", {})
    for room in await S.db.stack_rooms.find({"status": "OPEN"}).to_list(100):
        humans = [p for p in room["players"] if not p.get("is_bot")]
        if not humans:
            continue
        earliest = min(datetime.fromisoformat(h["joined_at"]) for h in humans)
        age = (now - earliest).total_seconds()
        if bot_cfg.get("enabled", True) and age >= int(sc.get("mp_bot_fill_seconds", 20)):
            used = {p["username"] for p in room["players"]}
            players = room["players"]
            while len(players) < room["max_players"]:
                name = random.choice([n for n in S.BOT_NAMES if n not in used] or S.BOT_NAMES)
                used.add(name)
                players.append({"user_id": "bot_" + uuid.uuid4().hex[:8], "username": name, "is_bot": True,
                                "joined_at": S.now_iso(), "submitted": False})
            room["players"] = players
            await _go_live(room, sc)
        elif age >= int(sc.get("mp_open_timeout_minutes", 10)) * 60:
            res = await S.db.stack_rooms.update_one({"id": room["id"], "status": "OPEN"},
                                                    {"$set": {"status": "CANCELLED"}})
            if res.modified_count == 1:
                for h in humans:
                    await S.credit_wallet(h["user_id"], room["entry_fee"], "refund", "main",
                                          meta={"mode": "stack_mp", "room_id": room["id"]})
    for room in await S.db.stack_rooms.find({"status": "LIVE"}).to_list(100):
        await _maybe_settle(room["id"])
    if sc.get("mp_enabled", True):
        await _ensure_open_rooms(sc)


async def stack_room_loop():
    while True:
        try:
            await stack_room_tick()
        except Exception as e:  # keep the loop alive
            S.logger.warning(f"stack room loop: {e}")
        await asyncio.sleep(3)


@router.get("/games/stack/rooms")
async def stack_rooms(user: dict = Depends(S.get_current_user)):
    cfg, sc = await _stack_config()
    if sc.get("mp_enabled", True):
        await _ensure_open_rooms(sc)
    uid = str(user["_id"])
    open_rooms = await S.db.stack_rooms.find({"status": "OPEN"}, {"_id": 0}).sort(
        [("entry_fee", 1), ("max_players", 1)]).to_list(50)
    mine = await S.db.stack_rooms.find({"players.user_id": uid, "status": {"$in": ["OPEN", "LIVE", "SETTLING"]}},
                                       {"_id": 0}).to_list(20)
    recent = await S.db.stack_rooms.find({"players.user_id": uid, "status": "COMPLETED"},
                                         {"_id": 0}).sort("completed_at", -1).to_list(5)
    return {"open": [_annotate(r, uid) for r in open_rooms], "mine": [_annotate(r, uid) for r in mine],
            "recent": [_annotate(r, uid) for r in recent], "enabled": sc.get("mp_enabled", True),
            "platform_fee_percent": sc.get("mp_platform_fee_percent", 10)}


@router.post("/games/stack/rooms/{room_id}/join")
async def stack_room_join(room_id: str, user: dict = Depends(S.get_current_user)):
    cfg, sc = await _stack_config()
    if not cfg["game_enabled"] or not sc.get("mp_enabled", True):
        raise HTTPException(status_code=403, detail="Tower Stack multiplayer is disabled")
    room = await S.db.stack_rooms.find_one({"id": room_id})
    if not room or room["status"] != "OPEN":
        raise HTTPException(status_code=409, detail="Room is no longer open")
    uid = str(user["_id"])
    if any(p["user_id"] == uid for p in room["players"]):
        raise HTTPException(status_code=409, detail="You already joined this room")
    if len(room["players"]) >= room["max_players"]:
        raise HTTPException(status_code=409, detail="Room is full")
    u = await _load_user_with_balance(user, room["entry_fee"])
    player = {"user_id": uid, "username": u.get("username", "player"), "is_bot": False,
              "joined_at": S.now_iso(), "submitted": False}
    res = await S.db.stack_rooms.update_one(
        {"id": room_id, "status": "OPEN", "players.user_id": {"$ne": uid},
         f"players.{room['max_players'] - 1}": {"$exists": False}},
        {"$push": {"players": player}})
    if res.modified_count != 1:
        raise HTTPException(status_code=409, detail="Could not join — try another room")
    await S.debit_wallet(u, room["entry_fee"], "game_entry", meta={"mode": "stack_mp", "room_id": room_id})
    await S.db.users.update_one({"_id": u["_id"]}, {"$inc": {"stats.total_entries": room["entry_fee"]}})
    room = await S.db.stack_rooms.find_one({"id": room_id})
    if len(room["players"]) >= room["max_players"]:
        await _go_live(room, sc)
    await _ensure_open_rooms(sc)
    room = await S.db.stack_rooms.find_one({"id": room_id}, {"_id": 0})
    return {"room": _room_public(room), "wallet": await S.get_wallet(user)}


@router.get("/games/stack/rooms/{room_id}")
async def stack_room_get(room_id: str, user: dict = Depends(S.get_current_user)):
    await _maybe_settle(room_id)
    room = await S.db.stack_rooms.find_one({"id": room_id}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return _annotate(room, str(user["_id"]))


@router.post("/games/stack/rooms/{room_id}/play")
async def stack_room_play(room_id: str, user: dict = Depends(S.get_current_user)):
    cfg, sc = await _stack_config()
    room = await S.db.stack_rooms.find_one({"id": room_id})
    uid = str(user["_id"])
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    me = next((p for p in room["players"] if p["user_id"] == uid), None)
    if not me:
        raise HTTPException(status_code=403, detail="You are not in this room")
    if room["status"] != "LIVE":
        raise HTTPException(status_code=409, detail="Room is not live yet")
    if me.get("submitted") or me.get("session_id"):
        raise HTTPException(status_code=409, detail="You already played this room")
    if room.get("deadline") and datetime.fromisoformat(room["deadline"]) <= _now():
        raise HTTPException(status_code=409, detail="The play window for this room has closed")
    session = {
        "id": str(uuid.uuid4()), "user_id": uid, "mode": "stack", "type": "mp", "challenge": None,
        "entry_fee": room["entry_fee"], "engine": _engine(sc), "room_id": room_id,
        "token": secrets.token_urlsafe(16), "seq": 0, "status": "active",
        "server_start": _now().timestamp(), "created_at": S.now_iso(),
    }
    res = await S.db.stack_rooms.update_one(
        {"id": room_id, "players": {"$elemMatch": {"user_id": uid, "session_id": {"$exists": False}}}},
        {"$set": {"players.$.session_id": session["id"]}})
    if res.modified_count != 1:
        raise HTTPException(status_code=409, detail="You already played this room")
    await S.db.game_sessions.insert_one(dict(session))
    return {"session_id": session["id"], "token": session["token"], "type": "mp", "challenge": None,
            "entry_fee": room["entry_fee"], "engine": session["engine"], "deadline": room["deadline"]}


# ---------------------------------------------------------------------------
# Public config for the three games
# ---------------------------------------------------------------------------
@router.get("/games/extra/config")
async def extra_config():
    cfg = await S.get_config()
    vc = cfg.get("vortex_config", EXTRA_DEFAULTS["vortex_config"])
    cc = cfg.get("chicken_config", EXTRA_DEFAULTS["chicken_config"])
    _, sc = await _stack_config()
    return {
        "vortex": {**vc, "tables": {k: vortex_table(vc, k) for k in vc["themes"]}},
        "chicken": {**cc, "multipliers": {k: chicken_multipliers(cc, k) for k in cc["modes"]}},
        "stack": {k: v for k, v in sc.items()},
    }
