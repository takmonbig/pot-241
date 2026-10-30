"""POT24 house games: Color Prediction & Matka (timed rounds), Andar Bahar, Teen Patti, Break the 10,
Ludo Lite and Call Break Lite (instant vs house/bots), plus admin dashboard and profile summary."""
import asyncio
import random
import secrets
import uuid
from collections import Counter
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import server as S
import games_extra as G

router = APIRouter(prefix="/api")

HOUSE_DEFAULTS = {
    "color": {"round_seconds": 30, "lock_seconds": 5, "payout_color": 2.0, "payout_color_half": 1.5,
              "payout_violet": 4.5, "payout_number": 9.0, "payout_size": 2.0, "min_bet": 10, "max_bet": 10000},
    "matka": {"round_seconds": 120, "lock_seconds": 10, "payout_single": 9.0, "payout_jodi": 90.0,
              "min_bet": 10, "max_bet": 5000},
    "andar": {"payout_andar": 1.9, "payout_bahar": 2.0, "min_bet": 10, "max_bet": 10000},
    "teen": {"payout": 1.95, "min_bet": 10, "max_bet": 10000},
    "break10": {"payout": 1.95, "payout_perfect": 3.0, "min_bet": 10, "max_bet": 10000},
    "ludo": {"payout": 1.9, "min_bet": 20, "max_bet": 5000},
    "callbreak": {"payout": 3.5, "min_bet": 20, "max_bet": 5000},
}
TIMED = ("color", "matka")
LABELS = {"color": "Color Prediction", "matka": "Matka", "andar": "Andar Bahar", "teen": "Teen Patti",
          "break10": "Break the 10", "ludo": "Ludo", "callbreak": "Call Break"}
G.GAME_LABELS.update(LABELS)


def _now():
    return G._now()


async def hcfg() -> dict:
    doc = await S.db.house_config.find_one({"_id": "main"}) or {}
    return {k: {**v, **(doc.get(k) or {})} for k, v in HOUSE_DEFAULTS.items()} | {
        "aviator_force": doc.get("aviator_force"), "overrides": doc.get("overrides", {})}


def _limits(c: dict, bet: float):
    if bet < c["min_bet"] or bet > c["max_bet"]:
        raise HTTPException(status_code=400, detail=f"Bet must be between {c['min_bet']} and {c['max_bet']}")


async def _debit(user, bet, game):
    u = await G._load_user_with_balance(user, bet)
    await S.debit_wallet(u, bet, "game_entry", meta={"mode": game})
    await S.db.users.update_one({"_id": u["_id"]}, {"$inc": {"stats.total_entries": bet}})
    return u


def _seed():
    s = secrets.token_hex(32)
    return s, G.sha256_hex(s)


# ---------------------------------------------------------------------------
# Timed rounds: Color Prediction & Matka
# ---------------------------------------------------------------------------
def color_of(n: int):
    if n == 0:
        return ["red", "violet"]
    if n == 5:
        return ["green", "violet"]
    return ["red"] if n % 2 == 0 else ["green"]


def _period(game, start):
    return start.strftime("%Y%m%d%H%M%S") + ("C" if game == "color" else "M")


async def _current_round(game: str, c: dict) -> dict:
    r = await S.db.timed_rounds.find_one({"game": game, "status": "open"}, sort=[("ends_at", -1)])
    if r:
        return r
    start = _now()
    seed, h = _seed()
    r = {"id": str(uuid.uuid4()), "game": game, "period": _period(game, start), "status": "open",
         "starts_at": G._iso(start), "ends_at": G._iso(start + timedelta(seconds=c["round_seconds"])),
         "server_seed": seed, "server_seed_hash": h, "result": None}
    await S.db.timed_rounds.insert_one(dict(r))
    return r


def _payout(game: str, c: dict, bet: dict, result: int) -> float:
    k, p = bet["kind"], str(bet["pick"])
    if game == "color":
        cols = color_of(result)
        if k == "color" and p in cols:
            if p == "violet":
                return c["payout_violet"]
            return c["payout_color_half"] if "violet" in cols else c["payout_color"]
        if k == "number" and int(p) == result:
            return c["payout_number"]
        if k == "size" and p == ("big" if result >= 5 else "small"):
            return c["payout_size"]
        return 0.0
    if k == "single" and int(p) == result % 10:
        return c["payout_single"]
    if k == "jodi" and int(p) == result:
        return c["payout_jodi"]
    return 0.0


async def _settle_round(r: dict, cfg: dict):
    game, c = r["game"], cfg[r["game"]]
    ov = cfg["overrides"].get(game)
    if ov is not None:
        result, overridden = int(ov), True
        await S.db.house_config.update_one({"_id": "main"}, {"$unset": {f"overrides.{game}": ""}})
    else:
        f = G.pf_floats(r["server_seed"], r["period"], 0, 1)[0]
        result, overridden = int(f * (10 if game == "color" else 100)), False
    res = await S.db.timed_rounds.update_one({"id": r["id"], "status": "open"}, {"$set": {
        "status": "settled", "result": result, "overridden": overridden, "settled_at": S.now_iso()}})
    if res.modified_count != 1:
        return
    async for b in S.db.timed_bets.find({"round_id": r["id"], "status": "open"}):
        m = _payout(game, c, b, result)
        prize = round(b["amount"] * m, 2)
        await S.db.timed_bets.update_one({"id": b["id"]}, {"$set": {"status": "won" if m else "lost", "prize": prize, "result": result}})
        await G._record_game(b["user_id"], game, b["amount"], prize, m > 0, target=f"{b['kind']}:{b['pick']}",
                             recorded=result, details={"period": r["period"], "multiplier": m})


async def house_loop():
    while True:
        try:
            cfg = await hcfg()
            for g in TIMED:
                r = await _current_round(g, cfg[g])
                if _now() >= S.datetime.fromisoformat(r["ends_at"]):
                    await _settle_round(r, cfg)
                    await _current_round(g, cfg[g])
        except Exception as e:
            S.logger.error(f"house loop error: {e}")
        await asyncio.sleep(1)


def _round_public(r: dict, c: dict) -> dict:
    ends = S.datetime.fromisoformat(r["ends_at"])
    return {"period": r["period"], "ends_at": r["ends_at"], "lock_at": G._iso(ends - timedelta(seconds=c["lock_seconds"])),
            "server_seed_hash": r["server_seed_hash"], "round_seconds": c["round_seconds"]}


class TimedBetReq(BaseModel):
    kind: str
    pick: str
    amount: float


@router.get("/house/{game}/state")
async def timed_state(game: str, user: dict = Depends(S.get_current_user)):
    if game not in TIMED:
        raise HTTPException(status_code=404, detail="Unknown game")
    cfg = await hcfg()
    r = await _current_round(game, cfg[game])
    hist = await S.db.timed_rounds.find({"game": game, "status": "settled"}, {"_id": 0}).sort("ends_at", -1).to_list(20)
    for h in hist:
        if h.pop("overridden", False):
            h.pop("server_seed", None)
            h["admin_set"] = True
    mine = await S.db.timed_bets.find({"user_id": str(user["_id"]), "game": game}, {"_id": 0}).sort("created_at", -1).to_list(15)
    c = {k: v for k, v in cfg[game].items()}
    return {"round": _round_public(r, cfg[game]), "history": hist, "my_bets": mine, "config": c}


@router.post("/house/{game}/bet")
async def timed_bet(game: str, body: TimedBetReq, user: dict = Depends(S.get_current_user)):
    if game not in TIMED:
        raise HTTPException(status_code=404, detail="Unknown game")
    cfg = await hcfg()
    c = cfg[game]
    _limits(c, body.amount)
    valid = {"color": {"color": {"red", "green", "violet"}, "number": {str(i) for i in range(10)}, "size": {"big", "small"}},
             "matka": {"single": {str(i) for i in range(10)}, "jodi": {f"{i:02d}" for i in range(100)} | {str(i) for i in range(100)}}}[game]
    if body.kind not in valid or str(body.pick) not in valid[body.kind]:
        raise HTTPException(status_code=400, detail="Invalid pick")
    r = await _current_round(game, c)
    lock = S.datetime.fromisoformat(r["ends_at"]) - timedelta(seconds=c["lock_seconds"])
    if _now() >= lock:
        raise HTTPException(status_code=409, detail="Betting is closed for this round, wait for the next one")
    u = await _debit(user, round(body.amount, 2), game)
    b = {"id": str(uuid.uuid4()), "user_id": str(u["_id"]), "game": game, "round_id": r["id"], "period": r["period"],
         "kind": body.kind, "pick": str(int(body.pick)) if body.kind in ("jodi", "number", "single") else body.pick,
         "amount": round(body.amount, 2), "status": "open", "prize": 0, "created_at": S.now_iso()}
    await S.db.timed_bets.insert_one(dict(b))
    b.pop("_id", None)
    return {"bet": b, "wallet": await S.get_wallet(u)}


# ---------------------------------------------------------------------------
# Cards
# ---------------------------------------------------------------------------
SUITS = "SHDC"


def deck(seed: str):
    d = [(r, s) for s in SUITS for r in range(1, 14)]
    random.Random(seed).shuffle(d)
    return d


def card(c):
    return {"rank": c[0], "suit": c[1]}


async def _finish(user, game, bet, mult, details, seed, h):
    prize = round(bet * mult, 2)
    await G._record_game(str(user["_id"]), game, bet, prize, mult > 1, target=None, recorded=mult, details=details)
    return {"prize": prize, "multiplier": mult, "fair": {"server_seed": seed, "server_seed_hash": h},
            "wallet": await S.get_wallet(await S.get_user_by_id(str(user["_id"])))}


class BetReq(BaseModel):
    bet: float
    side: Optional[str] = None


@router.post("/house/andar/play")
async def andar_play(body: BetReq, user: dict = Depends(S.get_current_user)):
    c = (await hcfg())["andar"]
    _limits(c, body.bet)
    if body.side not in ("andar", "bahar"):
        raise HTTPException(status_code=400, detail="Pick Andar or Bahar")
    await _debit(user, body.bet, "andar")
    seed, h = _seed()
    d = deck(seed)
    joker, rest = d[0], d[1:]
    andar, bahar, win = [], [], None
    for i, cd in enumerate(rest):
        (andar if i % 2 == 0 else bahar).append(card(cd))
        if cd[0] == joker[0]:
            win = "andar" if i % 2 == 0 else "bahar"
            break
    mult = c["payout_andar"] if win == "andar" else c["payout_bahar"]
    mult = mult if win == body.side else 0.0
    out = await _finish(user, "andar", body.bet, mult, {"side": body.side, "winner": win}, seed, h)
    return {**out, "joker": card(joker), "andar": andar, "bahar": bahar, "winner": win, "won": mult > 0}


def tp_rank(hand):
    rs = sorted([c[0] if c[0] != 1 else 14 for c in hand], reverse=True)
    if rs == [14, 3, 2]:
        rs = [3, 2, 1]
    flush = len({c[1] for c in hand}) == 1
    seq = rs[0] - rs[1] == 1 and rs[1] - rs[2] == 1
    cnt = Counter(rs)
    if 3 in cnt.values():
        return (6, rs), "Trail"
    if seq and flush:
        return (5, rs), "Pure Sequence"
    if seq:
        return (4, rs), "Sequence"
    if flush:
        return (3, rs), "Color"
    if 2 in cnt.values():
        p = [r for r, n in cnt.items() if n == 2][0]
        k = [r for r in rs if r != p]
        return (2, [p] + k), "Pair"
    return (1, rs), "High Card"


@router.post("/house/teen/play")
async def teen_play(body: BetReq, user: dict = Depends(S.get_current_user)):
    c = (await hcfg())["teen"]
    _limits(c, body.bet)
    await _debit(user, body.bet, "teen")
    seed, h = _seed()
    d = deck(seed)
    you, dealer = d[0:6:2], d[1:6:2]
    (ry, ny), (rd, nd) = tp_rank(you), tp_rank(dealer)
    mult = c["payout"] if ry > rd else (1.0 if ry == rd else 0.0)
    out = await _finish(user, "teen", body.bet, mult, {"you": ny, "dealer": nd}, seed, h)
    return {**out, "you": [card(x) for x in you], "dealer": [card(x) for x in dealer], "you_hand": ny,
            "dealer_hand": nd, "won": mult > 1, "push": mult == 1.0}


# ---------------------------------------------------------------------------
# Session games: Break the 10, Ludo Lite, Call Break Lite
# ---------------------------------------------------------------------------
def b10_val(c):
    return 0 if c[0] >= 10 else c[0]


async def _new_session(user, game, bet, state, seed, h):
    s = {"id": str(uuid.uuid4()), "user_id": str(user["_id"]), "mode": game, "entry_fee": bet, "status": "active",
         "seed": seed, "seed_hash": h, "state": state, "created_at": S.now_iso()}
    await S.db.house_sessions.update_many({"user_id": s["user_id"], "mode": game, "status": "active"}, {"$set": {"status": "abandoned"}})
    await S.db.house_sessions.insert_one(dict(s))
    return s


async def _get_session(sid, user, game):
    s = await S.db.house_sessions.find_one({"id": sid, "mode": game})
    if not s or s["user_id"] != str(user["_id"]):
        raise HTTPException(status_code=404, detail="Session not found")
    if s["status"] != "active":
        raise HTTPException(status_code=409, detail="This game is already finished")
    return s


async def _close(s, user, mult, details):
    res = await S.db.house_sessions.update_one({"id": s["id"], "status": "active"}, {"$set": {"status": "completed", "state": s["state"]}})
    if res.modified_count != 1:
        raise HTTPException(status_code=409, detail="Already settled")
    return await _finish(user, s["mode"], s["entry_fee"], mult, details, s["seed"], s["seed_hash"])


class ActReq(BaseModel):
    session_id: str
    action: Optional[str] = None
    value: Optional[int] = None


@router.post("/house/break10/start")
async def b10_start(body: BetReq, user: dict = Depends(S.get_current_user)):
    c = (await hcfg())["break10"]
    _limits(c, body.bet)
    await _debit(user, body.bet, "break10")
    seed, h = _seed()
    st = {"pos": 2, "you": [list(deck(seed)[0])], "dealer": [list(deck(seed)[1])]}
    s = await _new_session(user, "break10", body.bet, st, seed, h)
    return {"session_id": s["id"], "you": [card(x) for x in st["you"]], "dealer": [card(st["dealer"][0])], "seed_hash": h}


@router.post("/house/break10/act")
async def b10_act(body: ActReq, user: dict = Depends(S.get_current_user)):
    s = await _get_session(body.session_id, user, "break10")
    if body.action not in ("hit", "stand"):
        raise HTTPException(status_code=400, detail="Action must be hit or stand")
    c = (await hcfg())["break10"]
    st, d = s["state"], deck(s["seed"])
    tot = lambda h: sum(b10_val(x) for x in h)  # noqa: E731
    if body.action == "hit":
        st["you"].append(list(d[st["pos"]])); st["pos"] += 1
        if tot(st["you"]) > 10:
            out = await _close(s, user, 0.0, {"you": tot(st["you"]), "bust": True})
            return {**out, "you": [card(x) for x in st["you"]], "dealer": [card(x) for x in st["dealer"]], "done": True,
                    "outcome": "bust", "you_total": tot(st["you"]), "dealer_total": tot(st["dealer"])}
        await S.db.house_sessions.update_one({"id": s["id"]}, {"$set": {"state": st}})
        return {"you": [card(x) for x in st["you"]], "dealer": [card(st["dealer"][0])], "done": False, "you_total": tot(st["you"])}
    while tot(st["dealer"]) < 7:
        st["dealer"].append(list(d[st["pos"]])); st["pos"] += 1
    y, dl = tot(st["you"]), tot(st["dealer"])
    if dl > 10 or y > dl:
        mult, oc = (c["payout_perfect"] if y == 10 else c["payout"]), "win"
    elif y == dl:
        mult, oc = 1.0, "push"
    else:
        mult, oc = 0.0, "lose"
    out = await _close(s, user, mult, {"you": y, "dealer": dl})
    return {**out, "you": [card(x) for x in st["you"]], "dealer": [card(x) for x in st["dealer"]], "done": True,
            "outcome": oc, "you_total": y, "dealer_total": dl}


LUDO_END, LUDO_SAFE = 30, {0, 8, 15, 23}


def _dice(st, seed):
    st["rolls"] = st.get("rolls", 0) + 1
    return int(G.pf_floats(seed, "ludo", st["rolls"], 1)[0] * 6) + 1


def _ludo_move(st, who, tok, roll):
    mine, other = st[who], st["bot" if who == "you" else "you"]
    np_ = mine[tok] + roll
    if np_ > LUDO_END:
        return False
    mine[tok] = np_
    if np_ not in LUDO_SAFE and np_ != LUDO_END:
        for i, p in enumerate(other):
            if p == np_:
                other[i] = 0
                st["log"].append(f"{who} captured a token")
    return True


@router.post("/house/ludo/start")
async def ludo_start(body: BetReq, user: dict = Depends(S.get_current_user)):
    c = (await hcfg())["ludo"]
    _limits(c, body.bet)
    await _debit(user, body.bet, "ludo")
    seed, h = _seed()
    st = {"you": [0, 0], "bot": [0, 0], "roll": None, "log": [], "rolls": 0}
    st["roll"] = _dice(st, seed)
    s = await _new_session(user, "ludo", body.bet, st, seed, h)
    return {"session_id": s["id"], "state": st, "end": LUDO_END, "safe": sorted(LUDO_SAFE), "seed_hash": h}


@router.post("/house/ludo/move")
async def ludo_move(body: ActReq, user: dict = Depends(S.get_current_user)):
    s = await _get_session(body.session_id, user, "ludo")
    c = (await hcfg())["ludo"]
    st, seed = s["state"], s["seed"]
    st["log"] = []
    roll = st["roll"]
    movable = [i for i in (0, 1) if st["you"][i] + roll <= LUDO_END]
    if movable:
        if body.value not in movable:
            raise HTTPException(status_code=400, detail="That token can't move")
        _ludo_move(st, "you", body.value, roll)
    if all(p == LUDO_END for p in st["you"]):
        out = await _close(s, user, c["payout"], {"winner": "you"})
        return {**out, "state": st, "done": True, "won": True, "bot_roll": None}
    br = _dice(st, seed)
    opts = [i for i in (0, 1) if st["bot"][i] + br <= LUDO_END]
    if opts:
        cap = [i for i in opts if (st["bot"][i] + br) in st["you"] and (st["bot"][i] + br) not in LUDO_SAFE]
        _ludo_move(st, "bot", (cap or sorted(opts, key=lambda i: -st["bot"][i]))[0], br)
    if all(p == LUDO_END for p in st["bot"]):
        out = await _close(s, user, 0.0, {"winner": "bot"})
        return {**out, "state": st, "done": True, "won": False, "bot_roll": br}
    st["roll"] = _dice(st, seed)
    await S.db.house_sessions.update_one({"id": s["id"]}, {"$set": {"state": st}})
    return {"state": st, "done": False, "bot_roll": br}


CB_SEATS = ["you", "Bot A", "Bot B", "Bot C"]


def _cb_winner(trick, lead):
    best = None
    for seat, cd in trick:
        if best is None:
            best = (seat, cd); continue
        b = best[1]
        if (cd[1] == b[1] and cd[0] > b[0]) or (cd[1] == "S" and b[1] != "S"):
            best = (seat, cd)
    return best[0]


def _cb_legal(hand, lead_suit):
    same = [c for c in hand if c[1] == lead_suit]
    return same or hand


def _cb_bot_play(hand, trick):
    if not trick:
        return max(hand, key=lambda c: (c[1] != "S", c[0]))
    legal = _cb_legal(hand, trick[0][1][1])
    best = trick[0]
    for t in trick[1:]:
        if _cb_winner([best, t], None) == t[0]:
            best = t
    beats = [c for c in legal if _cb_winner([best, ("x", c)], None) == "x"]
    return min(beats, key=lambda c: (c[1] == "S", c[0])) if beats else min(legal, key=lambda c: (c[1] == "S", c[0]))


def _cb_run_bots(st):
    """Bots play until it's your turn or the hand ends."""
    while st["turn"] != 0 and len(st["hands"][st["turn"]]) > 0:
        seat = st["turn"]
        hand = [tuple(c) for c in st["hands"][seat]]
        cd = _cb_bot_play(hand, [(s, tuple(c)) for s, c in st["trick"]])
        st["hands"][seat].remove(list(cd))
        st["trick"].append([seat, list(cd)])
        _cb_after_play(st)


def _cb_after_play(st):
    if len(st["trick"]) == 4:
        w = _cb_winner([(s, tuple(c)) for s, c in st["trick"]], None)
        st["tricks"][w] += 1
        st["last_trick"] = {"cards": st["trick"], "winner": w}
        st["trick"] = []
        st["turn"] = w
    else:
        st["turn"] = (st["turn"] + 1) % 4


def _cb_pub(st):
    r = lambda c: {"rank": c[0] if c[0] != 1 else 14, "suit": c[1]}  # noqa: E731
    return {"hand": [r(c) for c in st["hands"][0]], "trick": [{"seat": s, "card": r(c)} for s, c in st["trick"]],
            "bids": st["bids"], "tricks": st["tricks"], "turn": st["turn"], "seats": CB_SEATS,
            "last_trick": {"winner": st["last_trick"]["winner"], "cards": [{"seat": s, "card": r(c)} for s, c in st["last_trick"]["cards"]]} if st.get("last_trick") else None}


@router.post("/house/callbreak/start")
async def cb_start(body: BetReq, user: dict = Depends(S.get_current_user)):
    c = (await hcfg())["callbreak"]
    _limits(c, body.bet)
    await _debit(user, body.bet, "callbreak")
    seed, h = _seed()
    d = [[14 if x[0] == 1 else x[0], x[1]] for x in deck(seed)[:20]]
    hands = [sorted(d[i::4], key=lambda x: (x[1], x[0])) for i in range(4)]
    bids = [0] + [max(1, min(3, sum(1 for x in hd if x[1] == "S" or x[0] >= 13))) for hd in hands[1:]]
    st = {"hands": hands, "bids": bids, "tricks": [0, 0, 0, 0], "trick": [], "turn": 0, "phase": "bid"}
    s = await _new_session(user, "callbreak", body.bet, st, seed, h)
    return {"session_id": s["id"], "state": _cb_pub(st), "phase": "bid", "seed_hash": h}


@router.post("/house/callbreak/act")
async def cb_act(body: ActReq, user: dict = Depends(S.get_current_user)):
    s = await _get_session(body.session_id, user, "callbreak")
    c = (await hcfg())["callbreak"]
    st = s["state"]
    if st["phase"] == "bid":
        if body.value not in (1, 2, 3, 4, 5):
            raise HTTPException(status_code=400, detail="Bid between 1 and 5")
        st["bids"][0], st["phase"] = body.value, "play"
    else:
        if st["turn"] != 0:
            raise HTTPException(status_code=409, detail="Not your turn")
        hand = [tuple(x) for x in st["hands"][0]]
        lead = st["trick"][0][1][1] if st["trick"] else None
        idx = body.value if body.value is not None else -1
        if idx < 0 or idx >= len(hand):
            raise HTTPException(status_code=400, detail="Pick a card")
        cd = hand[idx]
        if lead and cd not in _cb_legal(hand, lead):
            raise HTTPException(status_code=400, detail="You must follow the lead suit")
        st["hands"][0].pop(idx)
        st["trick"].append([0, list(cd)])
        _cb_after_play(st)
        _cb_run_bots(st)
    if all(len(hd) == 0 for hd in st["hands"]):
        score = [(t - b) * 0.1 + b if t >= b else -b for b, t in zip(st["bids"], st["tricks"])]
        won = score[0] > max(score[1:])
        out = await _close(s, user, c["payout"] if won else 0.0, {"score": score, "bids": st["bids"], "tricks": st["tricks"]})
        return {**out, "state": _cb_pub(st), "phase": "done", "scores": [round(x, 1) for x in score], "won": won}
    await S.db.house_sessions.update_one({"id": s["id"]}, {"$set": {"state": st}})
    return {"state": _cb_pub(st), "phase": st["phase"]}


# ---------------------------------------------------------------------------
# Feeds, profile summary, admin dashboard & controls
# ---------------------------------------------------------------------------
def _mask(name: str):
    name = name or "Player"
    return name[:2] + "***" + name[-1:]


@router.get("/feed/live")
async def live_feed(user: dict = Depends(S.get_current_user)):
    out = {}
    for t in ("deposit", "withdrawal"):
        rows = await S.db.transactions.find({"type": t, "status": {"$in": ["success", "approved", "completed"]}}, {"_id": 0}).sort("created_at", -1).to_list(8)
        items = []
        for r in rows:
            u = await S.get_user_by_id(r["user_id"]) if r.get("user_id") else None
            items.append({"name": _mask((u or {}).get("display_name") or (u or {}).get("username")), "amount": abs(r["amount"]), "at": r["created_at"]})
        out[t] = items
    since = G._iso(_now() - timedelta(hours=24))
    big = await S.db.games.find({"created_at": {"$gte": since}, "result": "won"}, {"_id": 0}).sort("prize", -1).to_list(1)
    jackpot = big[0] if big else None
    out["jackpot"] = {"amount": jackpot["prize"], "game": G.GAME_LABELS.get(jackpot["mode"], jackpot["mode"])} if jackpot else None
    out["playing"] = {m: n for m, n in [(r["_id"], r["n"]) for r in await S.db.games.aggregate([
        {"$match": {"created_at": {"$gte": G._iso(_now() - timedelta(hours=1))}}}, {"$group": {"_id": "$mode", "n": {"$sum": 1}}}]).to_list(50)]}
    return out


BADGES = [("high_roller", "High Roller", lambda s: s["wagered"] >= 10000), ("win_streak", "Win Streak", lambda s: s["streak"] >= 3),
          ("early_bird", "Early Bird", lambda s: s["matches"] >= 1), ("lucky_one", "Lucky One", lambda s: s["best_mult"] >= 5)]


@router.get("/profile/summary")
async def profile_summary(user: dict = Depends(S.get_current_user)):
    uid = str(user["_id"])
    games = await S.db.games.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    wins = sum(1 for g in games if g["result"] == "won")
    pushes = sum(1 for g in games if g["result"] != "won" and g.get("entry_fee") and abs(g.get("prize", 0) - g["entry_fee"]) < 0.01)
    wag = sum(g.get("entry_fee", 0) for g in games)
    won_amt = sum(g.get("prize", 0) for g in games)
    fav = Counter(g["mode"] for g in games).most_common(1)
    streak = 0
    for g in games:
        if g["result"] != "won":
            break
        streak += 1
    best = max([(g.get("prize", 0) / g["entry_fee"]) for g in games if g.get("entry_fee")] or [0])
    st = {"matches": len(games), "wagered": wag, "streak": streak, "best_mult": best}
    profit = round(won_amt - wag, 2)
    better = await S.db.users.count_documents({"role": "user", "stats.total_winnings": {"$gt": (user.get("stats") or {}).get("total_winnings", 0)}})
    return {"total_matches": len(games), "wins": wins, "losses": len(games) - wins - pushes, "pushes": pushes,
            "win_rate": round(wins * 100 / (len(games) - pushes), 1) if len(games) > pushes else 0, "profit": profit,
            "favorite_game": G.GAME_LABELS.get(fav[0][0], fav[0][0]) if fav else None, "rank": better + 1,
            "badges": [{"id": i, "name": n, "earned": f(st)} for i, n, f in BADGES],
            "last_matches": [{"game": G.GAME_LABELS.get(g["mode"], g["mode"]), "outcome": _outcome(g), "amount": g.get("prize") if g["result"] == "won" else g.get("entry_fee"),
                              "won": g["result"] == "won", "at": g["created_at"]} for g in games[:20]]}


def _outcome(g):
    if g.get("entry_fee") and g["result"] != "won" and abs(g.get("prize", 0) - g["entry_fee"]) < 0.01:
        return "Push"
    if g.get("entry_fee") and g.get("prize") and g["result"] == "won":
        return f"{round(g['prize'] / g['entry_fee'], 2)}x"
    return "Won" if g["result"] == "won" else "Lost"


@router.get("/admin/dashboard")
async def admin_dashboard(period: str = "month", admin: dict = Depends(S.require_admin)):
    days = {"today": 1, "week": 7, "month": 30}.get(period, 30)
    since_dt = _now() - timedelta(days=days)
    since = G._iso(since_dt)
    q = {"created_at": {"$gte": since}}
    active = len(await S.db.games.distinct("user_id", q))
    new_users = await S.db.users.count_documents({"role": "user", "created_at": {"$gte": since}})
    by_game = await S.db.games.aggregate([{"$match": q}, {"$group": {"_id": "$mode", "in": {"$sum": "$entry_fee"}, "out": {"$sum": "$prize"}}}]).to_list(50)
    revenue = round(sum(r["in"] - r["out"] for r in by_game), 2)
    series = {}
    async for t in S.db.transactions.find({"type": {"$in": ["deposit", "withdrawal"]}, **q}, {"_id": 0, "type": 1, "amount": 1, "created_at": 1}):
        d = t["created_at"][:10]
        series.setdefault(d, {"date": d, "deposits": 0, "withdrawals": 0})
        series[d]["deposits" if t["type"] == "deposit" else "withdrawals"] += abs(t["amount"])
    pend = await S.db.transactions.aggregate([{"$match": {"type": "withdrawal", "status": "pending"}},
                                              {"$group": {"_id": None, "sum": {"$sum": "$amount"}, "n": {"$sum": 1}}}]).to_list(1)
    live = len(await S.db.games.distinct("user_id", {"created_at": {"$gte": G._iso(_now() - timedelta(minutes=10))}}))
    agents = await S.db.transactions.aggregate([{"$match": {"type": {"$regex": "^referral"}}},
                                                {"$group": {"_id": "$user_id", "earned": {"$sum": "$amount"}}}, {"$sort": {"earned": -1}}, {"$limit": 5}]).to_list(5)
    top = []
    for a in agents:
        u = await S.get_user_by_id(a["_id"])
        top.append({"name": (u or {}).get("display_name") or (u or {}).get("username") or "?", "earned": round(a["earned"], 2)})
    cfg = await S.get_config()
    h = await hcfg()
    return {
        "active_users": active, "new_users": new_users, "total_revenue": revenue,
        "series": sorted(series.values(), key=lambda x: x["date"]),
        "game_revenue": [{"game": G.GAME_LABELS.get(r["_id"], r["_id"]), "revenue": round(r["in"] - r["out"], 2), "wagered": round(r["in"], 2)} for r in sorted(by_game, key=lambda r: -r["in"])],
        "live_users": live, "pending_withdrawals": {"amount": round(abs(pend[0]["sum"]), 2) if pend else 0, "count": pend[0]["n"] if pend else 0},
        "fraud_alerts": await S.db.games.count_documents({"flagged": True, **q}),
        "total_transactions": await S.db.transactions.count_documents(q),
        "agents": {"count": await S.db.users.count_documents({"role": "user", "referral_count": {"$gt": 0}}), "top": top,
                   "commission": cfg.get("referral_config", {}).get("loss_commission_percent", 7.5),
                   "pending_deposits": await S.db.transactions.count_documents({"type": "deposit", "status": "pending"})},
        "controls": {"aviator_force": h["aviator_force"], "overrides": h["overrides"]},
        "house_config": {k: h[k] for k in HOUSE_DEFAULTS},
    }


class ControlReq(BaseModel):
    target: str
    value: Optional[float] = None
    rounds: int = 1


@router.post("/admin/house/control")
async def admin_control(body: ControlReq, admin: dict = Depends(S.require_admin)):
    if body.target == "aviator":
        val = None if body.value is None else {"crash": max(1.0, round(body.value, 2)), "remaining": max(1, body.rounds)}
        await S.db.house_config.update_one({"_id": "main"}, {"$set": {"aviator_force": val}}, upsert=True)
    elif body.target in TIMED:
        hi = 9 if body.target == "color" else 99
        if body.value is None:
            await S.db.house_config.update_one({"_id": "main"}, {"$unset": {f"overrides.{body.target}": ""}}, upsert=True)
        elif body.value != int(body.value) or not 0 <= int(body.value) <= hi:
            raise HTTPException(status_code=400, detail=f"Result must be a whole number 0-{hi}")
        else:
            await S.db.house_config.update_one({"_id": "main"}, {"$set": {f"overrides.{body.target}": int(body.value)}}, upsert=True)
    else:
        raise HTTPException(status_code=400, detail="Unknown control")
    await S.db.audit_logs.insert_one({"id": str(uuid.uuid4()), "admin_id": str(admin["_id"]), "action": f"house_control_{body.target}",
                                      "details": body.model_dump(), "created_at": S.now_iso()})
    return {"ok": True}


class HouseCfgReq(BaseModel):
    game: str
    values: dict


@router.put("/admin/house/config")
async def admin_house_cfg(body: HouseCfgReq, admin: dict = Depends(S.require_admin)):
    if body.game not in HOUSE_DEFAULTS:
        raise HTTPException(status_code=400, detail="Unknown game")
    clean = {k: float(v) for k, v in body.values.items() if k in HOUSE_DEFAULTS[body.game]}
    await S.db.house_config.update_one({"_id": "main"}, {"$set": {f"{body.game}.{k}": v for k, v in clean.items()}}, upsert=True)
    return {"ok": True, "config": (await hcfg())[body.game]}


async def take_aviator_force() -> Optional[float]:
    from pymongo import ReturnDocument
    doc = await S.db.house_config.find_one_and_update(
        {"_id": "main", "aviator_force.remaining": {"$gte": 1}}, {"$inc": {"aviator_force.remaining": -1}},
        return_document=ReturnDocument.BEFORE)
    f = (doc or {}).get("aviator_force")
    if not f:
        return None
    if f["remaining"] <= 1:
        await S.db.house_config.update_one({"_id": "main", "aviator_force.remaining": {"$lte": 0}}, {"$set": {"aviator_force": None}})
    return f["crash"]
