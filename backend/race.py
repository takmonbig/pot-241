"""Race mode: every player in a room plays the same provably-fair seed; highest score takes the pot."""
import asyncio
import math
import random
import secrets
import uuid
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import server as S
import games_extra as G

router = APIRouter(prefix="/api")

RACE_GAMES = ["aviator", "tower", "chicken", "vortex", "stack"]
RACE_PARAMS = {"tower": "medium", "chicken": "medium", "vortex": "water", "stack": "sprint"}
KINDS = {
    "1v1": {"min": 2, "max": 2, "fee_pct": 0, "win_mult": 1.8, "minutes": 5},
    "rooms": {"min": 2, "max": 8, "fee_pct": 10, "win_mult": None, "minutes": 5},
}
PUBLIC_FEES = [50, 100]
PLAY_WINDOW = 180
FRIENDS_MINUTES = 10
BOT_FILL_SECONDS = 30
_lock = asyncio.Lock()


def _now():
    return G._now()


def _race_seed(code: str) -> dict:
    seed = secrets.token_hex(32)
    return {"server_seed": seed, "server_seed_hash": G.sha256_hex(seed), "client_seed": code, "nonce": 0}


async def _create(game: str, kind: str, fee: float, host: Optional[dict] = None, group: bool = False) -> dict:
    k = KINDS["1v1" if (kind == "1v1" or (host and not group)) else "rooms"]
    code = ("RF" if host else "RC") + uuid.uuid4().hex[:5].upper()
    room = {
        "id": str(uuid.uuid4()), "room_code": code, "game": game, "param": RACE_PARAMS.get(game),
        "kind": "friends" if host else kind, "is_1v1": k["max"] == 2,
        "entry_fee": fee, "min_players": 2, "max_players": 10 if (host and group) else k["max"],
        "platform_fee_percent": 0 if host else k["fee_pct"],
        "win_multiplier": (2 if host else k["win_mult"]) if k["max"] == 2 else None,
        "host_id": str(host["_id"]) if host else None, "status": "OPEN", "participants": [],
        "seed": _race_seed(code),
        "join_deadline": G._iso(_now() + timedelta(minutes=FRIENDS_MINUTES if host else k["minutes"])),
        "live_deadline": None, "winner": None, "created_at": S.now_iso(),
    }
    await S.db.race_rooms.insert_one(dict(room))
    return room


def _public(room: dict, uid: str = None) -> dict:
    done = room["status"] == "COMPLETED"
    shown = room["status"] in ("COMPLETED", "REFUNDED")
    players = []
    for p in room.get("participants", []):
        players.append({"username": p["username"], "is_you": p["user_id"] == uid, "played": p.get("played", False),
                        "score": p.get("score") if (shown or p["user_id"] == uid) else None,
                        "label": p.get("label") if (shown or p["user_id"] == uid) else None,
                        "rank": p.get("rank"), "prize": p.get("prize", 0)})
    if done:
        players.sort(key=lambda x: x["rank"] or 99)
    me = next((p for p in room.get("participants", []) if p["user_id"] == uid), None)
    pool = round(len(room.get("participants", [])) * room["entry_fee"] * (1 - room["platform_fee_percent"] / 100.0), 2)
    seed = room["seed"]
    return {
        "id": room["id"], "room_code": room["room_code"], "game": room["game"], "param": room.get("param"),
        "kind": room["kind"], "is_1v1": room["is_1v1"], "entry_fee": room["entry_fee"],
        "min_players": room["min_players"], "max_players": room["max_players"], "status": room["status"],
        "current_players": len(room.get("participants", [])), "players": players,
        "prize": round(room["entry_fee"] * room["win_multiplier"], 2) if room["is_1v1"] else pool,
        "join_deadline": room["join_deadline"], "live_deadline": room.get("live_deadline"),
        "winner": room.get("winner"), "is_host": bool(uid and room.get("host_id") == uid),
        "joined": bool(me), "played": bool(me and me.get("played")),
        "my_prize": me.get("prize", 0) if me else 0, "refunded": room["status"] == "REFUNDED",
        "fair": {"server_seed_hash": seed["server_seed_hash"], "client_seed": seed["client_seed"],
                 **({"server_seed": seed["server_seed"]} if done else {})},
    }


# ---------------------------------------------------------------------------
# Shared outcomes (deterministic from the room seed)
# ---------------------------------------------------------------------------
def _floats(room, n):
    s = room["seed"]
    return G.pf_floats(s["server_seed"], s["client_seed"], s["nonce"], n)


def _crash(room, ac):
    he = max(0.0, min(0.5, ac.get("house_edge_percent", 5) / 100.0))
    r = _floats(room, 1)[0]
    if r < he:
        return 1.0
    return round(max(1.01, min((1.0 - he) / (1.0 - r), ac.get("max_multiplier", 100))), 2)


def _tower_layout(room, tc):
    d = tc["difficulties"].get(room["param"]) or next(iter(tc["difficulties"].values()))
    rows = tc.get("rows", 8)
    rng = random.Random(room["seed"]["server_seed"])
    layout = [sorted(rng.sample(range(d["cols"]), d["bombs"])) for _ in range(rows)]
    mults = S.tower_multipliers(d["cols"], d["bombs"], rows, tc.get("house_edge_percent", 5))
    return d, rows, layout, mults


def _chicken(room, cc):
    mode = room["param"] if room["param"] in cc["modes"] else next(iter(cc["modes"]))
    steps = int(cc["modes"][mode]["steps"])
    p = G._clamp_hazard(cc["modes"][mode]["hazard"])
    hz = next((i + 1 for i, f in enumerate(_floats(room, steps)) if f < p), None)
    return mode, steps, p, hz, G.chicken_multipliers(cc, mode)


def _vortex(room, vc):
    theme = room["param"] if room["param"] in vc["themes"] else "earth"
    table = G.vortex_table(vc, theme)
    landings = [int(f * table["segments"]) for f in _floats(room, len(table["stages"]))]
    return theme, table, landings


def _stack_engine(room, sc):
    eng = {k: sc[k] for k in G.ENGINE_KEYS}
    rng = random.Random(room["seed"]["server_seed"])
    eng["phases"] = [round(rng.uniform(0.0, 2.0), 4) for _ in range(300)]
    eng["jitter"] = [round(rng.uniform(0.9, 1.12), 4) for _ in range(300)]
    ch = next((c for c in sc.get("challenges", []) if c["id"] == room["param"]), sc["challenges"][0])
    return eng, ch


def _hidden(room):
    return {**room["seed"], "server_seed": "revealed when the race ends", "next_server_seed_hash": ""}


def stack_score(r: dict, ch: dict):
    reached = r.get("reached_at_ms")
    if reached is not None and reached <= ch["seconds"] * 1000:
        return round(r["height"] + (ch["seconds"] * 1000 - reached) / (ch["seconds"] * 1000), 4), \
            f"{r['height']} block{'s' if r['height'] != 1 else ''} · {reached / 1000:.1f}s"
    h = r.get("height", 0)
    return float(h), f"{h} block{'s' if h != 1 else ''}"


async def _bot_score(room, cfg):
    g = room["game"]
    if g == "aviator":
        t = round(random.uniform(1.2, 4.0), 2)
        sc = t if t < _crash(room, cfg["aviator_config"]) else 0.0
        return sc, (f"{t}×" if sc else "Flew away")
    if g == "tower":
        d, rows, layout, mults = _tower_layout(room, cfg["tower_config"])
        k = random.randint(1, 5)
        for i in range(k):
            if random.randrange(d["cols"]) in layout[i]:
                return 0.0, "Hit a mine"
        return mults[k - 1], f"{mults[k - 1]}×"
    if g == "chicken":
        _, steps, _, hz, mults = _chicken(room, cfg["chicken_config"])
        k = random.randint(2, 8)
        return (mults[k - 1], f"{mults[k - 1]}×") if (hz is None or hz > k) else (0.0, "Fried")
    if g == "vortex":
        _, table, landings = _vortex(room, cfg["vortex_config"])
        k = random.randint(1, 4)
        for i in range(k):
            if landings[i] in table["stages"][i]["lose_slots"]:
                return 0.0, "Vortex broke"
        return table["stages"][k - 1]["multiplier"], f"{table['stages'][k - 1]['multiplier']}×"
    _, sc = await G._stack_config()
    _, ch = _stack_engine(room, sc)
    h = random.randint(6, ch["height"])
    r = {"height": h, "reached_at_ms": int(random.uniform(0.6, 0.98) * ch["seconds"] * 1000) if h >= ch["height"] else None}
    return stack_score(r, ch)


# ---------------------------------------------------------------------------
# Session creation (reuses each game's normal endpoints for moves)
# ---------------------------------------------------------------------------
async def _make_session(room: dict, user: dict) -> dict:
    cfg = await S.get_config()
    g, uid, fee = room["game"], str(user["_id"]), room["entry_fee"]
    base = {"id": str(uuid.uuid4()), "user_id": uid, "mode": g, "entry_fee": fee, "race_id": room["id"],
            "status": "active", "created_at": S.now_iso()}
    if g == "aviator":
        ac = cfg["aviator_config"]
        s = {**base, "crash_point": _crash(room, ac), "growth_rate": ac.get("growth_rate", 0.12),
             "nonce": secrets.token_urlsafe(16), "force_win": False, "server_start": _now().timestamp()}
        out = {"session_id": s["id"], "nonce": s["nonce"], "entry_fee": fee, "crash_point": None,
               "growth_rate": s["growth_rate"], "max_multiplier": ac.get("max_multiplier", 100)}
    elif g == "tower":
        d, rows, layout, mults = _tower_layout(room, cfg["tower_config"])
        s = {**base, "difficulty": room["param"], "cols": d["cols"], "bombs": d["bombs"], "rows": rows,
             "bombs_layout": layout, "multipliers": mults, "current_row": 0, "nonce": secrets.token_urlsafe(16),
             "force_win": False}
        out = {"session_id": s["id"], "nonce": s["nonce"], "entry_fee": fee, "difficulty": room["param"],
               "cols": d["cols"], "bombs": d["bombs"], "rows": rows, "multipliers": mults}
    elif g == "chicken":
        mode, steps, p, hz, mults = _chicken(room, cfg["chicken_config"])
        s = {**base, "difficulty": mode, "steps": steps, "hazard": p, "hazard_step": hz, "multipliers": mults,
             "step": 0, "token": secrets.token_urlsafe(16), "seq": 0, "fair": _hidden(room)}
        out = {"session_id": s["id"], "token": s["token"], "entry_fee": fee, "mode": mode, "steps": steps,
               "multipliers": mults, "fair": G.fair_public(s["fair"], False)}
    elif g == "vortex":
        theme, table, landings = _vortex(room, cfg["vortex_config"])
        s = {**base, "theme": theme, "table": table, "landings": landings, "stage": 0, "at_risk": fee,
             "collected": 0.0, "partial_done_stage": -1, "token": secrets.token_urlsafe(16), "seq": 0,
             "fair": _hidden(room)}
        out = {"session_id": s["id"], "token": s["token"], "entry_fee": fee, "theme": theme, "table": table,
               "partial_collect_percent": 0, "fair": G.fair_public(s["fair"], False)}
    else:
        _, sc = await G._stack_config()
        eng, ch = _stack_engine(room, sc)
        s = {**base, "type": "timed", "challenge": ch, "engine": eng, "room_id": None,
             "token": secrets.token_urlsafe(16), "seq": 0, "server_start": _now().timestamp()}
        out = {"session_id": s["id"], "token": s["token"], "type": "timed", "challenge": ch, "entry_fee": fee, "engine": eng}
    await S.db.game_sessions.insert_one(dict(s))
    return {**out, "race_id": room["id"], "game": g}


async def submit(session: dict, score: float, label: str):
    """Called by each game's settle path when the session belongs to a race."""
    await S.db.game_sessions.update_one({"id": session["id"]}, {"$set": {"status": "completed", "race_score": score,
                                                                          "stopped_at": S.now_iso()}})
    await S.db.race_rooms.update_one(
        {"id": session["race_id"], "participants": {"$elemMatch": {"user_id": session["user_id"], "played": {"$ne": True}}}},
        {"$set": {"participants.$.played": True, "participants.$.score": round(float(score), 4),
                  "participants.$.label": label, "participants.$.finished_at": _now().timestamp()}})
    await _maybe_finalize(session["race_id"])


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
async def _go_live(room: dict):
    cfg = await S.get_config()
    parts = room["participants"]
    t0 = _now().timestamp()
    for p in parts:
        if p.get("is_bot"):
            p["score"], p["label"] = await _bot_score(room, cfg)
            p["played"], p["finished_at"] = True, t0 + random.uniform(8, 60)
    await S.db.race_rooms.update_one({"id": room["id"], "status": "OPEN"}, {"$set": {
        "status": "LIVE", "participants": parts, "live_start": t0,
        "live_deadline": G._iso(_now() + timedelta(seconds=PLAY_WINDOW))}})


async def _refund(room: dict, reason: str):
    res = await S.db.race_rooms.update_one({"id": room["id"], "status": room["status"]},
                                           {"$set": {"status": "REFUNDED", "cancel_reason": reason}})
    if res.modified_count != 1:
        return
    for p in room["participants"]:
        if not p.get("is_bot"):
            await S.credit_wallet(p["user_id"], room["entry_fee"], "refund", "main", status="refunded",
                                  meta={"reason": reason, "race_id": room["id"]})


async def _maybe_finalize(room_id: str, force: bool = False):
    async with _lock:
        room = await S.db.race_rooms.find_one({"id": room_id})
        if not room or room["status"] != "LIVE":
            return
        parts = room["participants"]
        if not force and not all(p.get("played") for p in parts):
            return
        for p in parts:
            if not p.get("played"):
                p.update({"played": True, "score": 0.0, "label": "Did not play", "finished_at": float("inf")})
        ranked = sorted(parts, key=lambda p: (-p["score"], p.get("finished_at", float("inf"))))
        for i, p in enumerate(ranked):
            p["rank"], p["prize"] = i + 1, 0.0
        top = ranked[0]
        if top["score"] <= 0:
            for p in parts:
                p["finished_at"] = None if p.get("finished_at") == float("inf") else p.get("finished_at")
            room["participants"] = parts
            await S.db.race_rooms.update_one({"id": room_id}, {"$set": {"participants": parts}})
            room["status"] = "LIVE"
            await _refund(room, "Nobody scored")
            return
        gross = len(parts) * room["entry_fee"]
        prize = round(room["entry_fee"] * room["win_multiplier"], 2) if room["is_1v1"] \
            else round(gross * (1 - room["platform_fee_percent"] / 100.0), 2)
        top["prize"] = prize
        for p in parts:
            if p.get("finished_at") == float("inf"):
                p["finished_at"] = None
        res = await S.db.race_rooms.update_one({"id": room_id, "status": "LIVE"}, {"$set": {
            "status": "COMPLETED", "participants": parts, "winner": top["username"], "prize_pool": prize,
            "completed_at": S.now_iso()}})
        if res.modified_count != 1:
            return
    for p in parts:
        if p.get("is_bot"):
            continue
        won = p["prize"] > 0
        await G._record_game(p["user_id"], room["game"], room["entry_fee"], p["prize"], won, target=room["kind"],
                             recorded=p["score"], details={"race": room["kind"], "room_code": room["room_code"],
                                                           "rank": p["rank"], "label": p.get("label")})


async def race_tick():
    cfg = await S.get_config()
    bots_on = cfg.get("bot_config", {}).get("enabled")
    now = _now()
    for room in await S.db.race_rooms.find({"status": "OPEN"}).to_list(500):
        parts = room["participants"]
        humans = [p for p in parts if not p.get("is_bot")]
        deadline = S.datetime.fromisoformat(room["join_deadline"])
        if room["kind"] != "friends":
            if humans and bots_on and len(parts) < room["min_players"]:
                first = min(S.datetime.fromisoformat(h["joined_at"]) for h in humans)
                if (now - first).total_seconds() >= BOT_FILL_SECONDS:
                    used = {p["username"] for p in parts}
                    while len(parts) < (room["min_players"] if room["is_1v1"] else random.randint(2, 4)):
                        name = random.choice([n for n in S.BOT_NAMES if n not in used] or S.BOT_NAMES)
                        used.add(name)
                        parts.append({"user_id": "bot_" + uuid.uuid4().hex[:8], "username": name, "is_bot": True,
                                      "joined_at": S.now_iso()})
                    await S.db.race_rooms.update_one({"id": room["id"]}, {"$set": {"participants": parts}})
                    room["participants"] = parts
                    await _go_live(room)
                    continue
            if len(parts) >= room["max_players"] or (now >= deadline and len(parts) >= room["min_players"]):
                await _go_live(room)
                continue
        if now >= deadline:
            if parts:
                await _refund(room, "Minimum players not reached")
            else:
                await S.db.race_rooms.delete_one({"id": room["id"], "status": "OPEN"})
    for room in await S.db.race_rooms.find({"status": "LIVE"}).to_list(500):
        if room.get("live_deadline") and now >= S.datetime.fromisoformat(room["live_deadline"]):
            await _maybe_finalize(room["id"], force=True)
    for game in RACE_GAMES:
        for kind in KINDS:
            for fee in PUBLIC_FEES:
                if not await S.db.race_rooms.find_one({"game": game, "kind": kind, "entry_fee": fee, "status": "OPEN"}):
                    await _create(game, kind, fee)


async def race_loop():
    while True:
        try:
            await race_tick()
        except Exception as e:
            S.logger.error(f"race loop error: {e}")
        await asyncio.sleep(4)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
class RaceCustomReq(BaseModel):
    game: str
    group: bool = False
    entry_fee: float


class RaceCodeReq(BaseModel):
    code: str


async def _get(room_id: str) -> dict:
    room = await S.db.race_rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


@router.get("/race/rooms")
async def race_rooms(game: str, kind: str = "1v1", tab: str = "active", user: dict = Depends(S.get_current_user)):
    st = ["COMPLETED"] if tab == "completed" else ["OPEN", "LIVE"]
    q = {"game": game, "kind": kind, "status": {"$in": st}}
    rooms = await S.db.race_rooms.find(q).sort([("status", -1), ("entry_fee", 1)]).to_list(50)
    uid = str(user["_id"])
    out = [_public(r, uid) for r in rooms]
    return [r for r in out if r["status"] == "OPEN" or r["joined"] or tab == "completed"][:30]


@router.get("/race/{room_id}")
async def race_get(room_id: str, user: dict = Depends(S.get_current_user)):
    return _public(await _get(room_id), str(user["_id"]))


@router.post("/race/{room_id}/join")
async def race_join(room_id: str, user: dict = Depends(S.get_current_user)):
    room = await _get(room_id)
    uid = str(user["_id"])
    if room["status"] != "OPEN":
        raise HTTPException(status_code=409, detail="Room not open for joining")
    if any(p["user_id"] == uid for p in room["participants"]):
        raise HTTPException(status_code=409, detail="Already joined this room")
    if len(room["participants"]) >= room["max_players"]:
        raise HTTPException(status_code=409, detail="Room is full")
    u = await G._load_user_with_balance(user, room["entry_fee"])
    await S.debit_wallet(u, room["entry_fee"], "game_entry", meta={"mode": f"race_{room['game']}", "race_id": room_id})
    res = await S.db.race_rooms.update_one(
        {"id": room_id, "status": "OPEN", "participants.user_id": {"$ne": uid},
         f"participants.{room['max_players'] - 1}": {"$exists": False}},
        {"$push": {"participants": {"user_id": uid, "username": u["username"], "joined_at": S.now_iso()}}})
    if res.modified_count != 1:
        await S.credit_wallet(uid, room["entry_fee"], "refund", "main", status="refunded",
                              meta={"reason": "race_join_failed", "race_id": room_id})
        raise HTTPException(status_code=409, detail="Room just filled up, try another")
    await S.db.users.update_one({"_id": u["_id"]}, {"$inc": {"stats.total_entries": room["entry_fee"]}})
    room = await _get(room_id)
    if room["kind"] != "friends" and len(room["participants"]) >= room["max_players"]:
        await _go_live(room)
    return _public(await _get(room_id), uid)


@router.post("/race/custom")
async def race_custom(body: RaceCustomReq, user: dict = Depends(S.get_current_user)):
    if body.game not in RACE_GAMES:
        raise HTTPException(status_code=400, detail="Invalid game")
    fee = round(float(body.entry_fee), 2)
    min_fee = 30 if body.group else 50
    if fee < min_fee or fee > 5000:
        raise HTTPException(status_code=400, detail=f"Entry must be between {min_fee} and 5000 coins")
    await G._load_user_with_balance(user, fee)
    room = await _create(body.game, "friends", fee, host=user, group=body.group)
    return await race_join(room["id"], user)


@router.post("/race/join-code")
async def race_join_code(body: RaceCodeReq, user: dict = Depends(S.get_current_user)):
    room = await S.db.race_rooms.find_one({"room_code": body.code.strip().upper(), "kind": "friends"})
    if not room:
        raise HTTPException(status_code=404, detail="No room found for this code")
    if any(p["user_id"] == str(user["_id"]) for p in room["participants"]):
        return _public(room, str(user["_id"]))
    return await race_join(room["id"], user)


@router.post("/race/{room_id}/start")
async def race_start(room_id: str, user: dict = Depends(S.get_current_user)):
    room = await _get(room_id)
    if room.get("host_id") != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Only the host can start the match")
    if room["status"] != "OPEN":
        raise HTTPException(status_code=409, detail="Room already started")
    if len(room["participants"]) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 players to start")
    await _go_live(room)
    return _public(await _get(room_id), str(user["_id"]))


@router.post("/race/{room_id}/play")
async def race_play(room_id: str, user: dict = Depends(S.get_current_user)):
    room = await _get(room_id)
    uid = str(user["_id"])
    me = next((p for p in room["participants"] if p["user_id"] == uid), None)
    if not me:
        raise HTTPException(status_code=403, detail="You are not in this room")
    if room["status"] != "LIVE":
        raise HTTPException(status_code=409, detail="The race hasn't started yet" if room["status"] == "OPEN" else "Race is over")
    if me.get("played"):
        raise HTTPException(status_code=409, detail="You already played this race")
    res = await S.db.race_rooms.update_one(
        {"id": room_id, "participants": {"$elemMatch": {"user_id": uid, "session_id": {"$exists": False}}}},
        {"$set": {"participants.$.session_id": "pending"}})
    if res.modified_count != 1:
        raise HTTPException(status_code=409, detail="Your race round was already started")
    out = await _make_session(room, user)
    await S.db.race_rooms.update_one({"id": room_id, "participants.user_id": uid},
                                     {"$set": {"participants.$.session_id": out["session_id"]}})
    return out
