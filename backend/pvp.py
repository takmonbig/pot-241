"""Real-time (polling) multiplayer: Call Break, Ludo (2/3/4) and Break the 10. Server-authoritative engines."""
import asyncio
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
CFG = {"callbreak_hands": 5, "bid_seconds": 20, "play_seconds": 20, "ludo_seconds": 15, "ready_seconds": 20,
       "bot_fill_seconds": 25, "wait_minutes": 10, "fee_percent": 10, "three_six_penalty": True,
       "bot_delay": 1.2, "strict_callbreak": True}
GAMES = {"callbreak": [4], "ludo": [2, 3, 4], "break10": [4]}
LABEL = {"callbreak": "Call Break", "ludo": "Ludo", "break10": "Break the 10"}
SUITS = "SHDC"
RANKS = {14: "A", 13: "K", 12: "Q", 11: "J", 10: "10"}
_lock = asyncio.Lock()
rng = secrets.SystemRandom()


def _now():
    return G._now()


def _ts():
    return _now().timestamp()


# ------------------------------- cards -------------------------------------
def new_deck():
    d = [[r, s] for s in SUITS for r in range(2, 15)]
    rng.shuffle(d)
    return d


def deal4():
    d = new_deck()
    return [sorted(d[i * 13:(i + 1) * 13], key=lambda c: ("SHCD".index(c[1]), -c[0])) for i in range(4)]


def trick_winner(trick, trump):
    lead = trick[0][1][1]
    best = trick[0]
    for t in trick[1:]:
        c, b = t[1], best[1]
        if (c[1] == b[1] and c[0] > b[0]) or (trump and c[1] == trump and b[1] != trump):
            best = t
    return best[0]


def cb_legal(hand, trick):
    if not trick:
        return hand
    lead = trick[0][1][1]
    w = trick_winner(trick, "S")
    wc = next(c for s, c in trick if s == w)
    same = [c for c in hand if c[1] == lead]
    if same:
        if CFG["strict_callbreak"] and wc[1] == lead:
            beat = [c for c in same if c[0] > wc[0]]
            return beat or same
        return same
    spades = [c for c in hand if c[1] == "S"]
    if spades:
        if CFG["strict_callbreak"] and wc[1] == "S":
            beat = [c for c in spades if c[0] > wc[0]]
            return beat or hand
        return spades
    return hand


def b10_legal(hand, trick):
    if not trick:
        return hand
    same = [c for c in hand if c[1] == trick[0][1][1]]
    return same or hand


def best_sequence(hand, suit=None):
    """Longest same-suit run (descending). Returns (length, top, suit)."""
    best = (0, 0, None)
    for s in ([suit] if suit else SUITS):
        rs = sorted({c[0] for c in hand if c[1] == s}, reverse=True)
        i = 0
        while i < len(rs):
            j = i
            while j + 1 < len(rs) and rs[j + 1] == rs[j] - 1:
                j += 1
            cand = (j - i + 1, rs[i], s)
            if cand[:2] > best[:2]:
                best = cand
            i = j + 1
    return best


def valid_sequence(hand, suit, length, top):
    if suit not in SUITS or length < 2 or not (2 <= top <= 14) or top - length + 1 < 2:
        return False
    have = {(c[0], c[1]) for c in hand}
    return all((top - k, suit) in have for k in range(length))


# ------------------------------- ludo --------------------------------------
LUDO_COLORS = ["red", "green", "yellow", "blue"]
LUDO_OFFSET = {"red": 0, "green": 13, "yellow": 26, "blue": 39}
LUDO_SAFE = {0, 8, 13, 21, 26, 34, 39, 47}
LUDO_MODES = {2: ["red", "yellow"], 3: ["red", "green", "yellow"], 4: LUDO_COLORS}
HOME = 56


def ludo_abs(color, p):
    return (LUDO_OFFSET[color] + p) % 52 if 0 <= p <= 50 else None


def ludo_moves(st, seat, roll):
    col = st["colors"][seat]
    out = []
    for i, p in enumerate(st["tokens"][col]):
        if p == -1 and roll == 6:
            out.append(i)
        elif p >= 0 and p + roll <= HOME:
            out.append(i)
    return out


# ------------------------------- match init --------------------------------
def init_state(game, n):
    if game == "callbreak":
        return {"hand_no": 1, "dealer": 3, "totals": [0] * 4, "history": [], **_cb_new_hand(3)}
    if game == "break10":
        return _b10_new_hand(rng.randrange(4))
    cols = LUDO_MODES[n]
    return {"colors": cols, "tokens": {c: [-1] * 4 for c in cols}, "turn": 0, "phase": "roll", "roll": None,
            "sixes": 0, "finished": [], "last": None}


def _cb_new_hand(dealer):
    hands = deal4()
    return {"hands": hands, "dealt": [[list(c) for c in h] for h in hands], "dealer": dealer,
            "bids": [None] * 4, "tricks": [0] * 4, "trick": [], "turn": (dealer + 1) % 4, "phase": "bid",
            "last_trick": None, "trick_no": 0}


def _b10_new_hand(dealer):
    hands = deal4()
    owner = {f"10{c[1]}": i for i, h in enumerate(hands) for c in h if c[0] == 10}
    return {"hands": hands, "owner10": owner, "dealer": dealer, "bids": [None] * 4, "turn": (dealer + 1) % 4,
            "phase": "bid", "trump": None, "bid_winner": None, "trick": [], "last_trick": None, "trick_no": 0,
            "points": [0, 0], "captured": [], "tricks_won": [0, 0], "history": []}


def team(seat):
    return seat % 2


# ------------------------------- actions -----------------------------------
def apply_action(m, seat, a):
    """Validate and apply; raises HTTPException on illegal moves. Returns event text."""
    g, st = m["game"], m["state"]
    if g == "ludo":
        return _ludo_action(st, seat, a, len(st["colors"]))
    if st["turn"] != seat:
        raise HTTPException(status_code=409, detail="Not your turn")
    hand = st["hands"][seat]
    if st["phase"] == "bid":
        if g == "callbreak":
            b = int(a.get("bid") or 0)
            if not 1 <= b <= 13:
                raise HTTPException(status_code=400, detail="Bid must be 1-13")
            st["bids"][seat] = b
            st["turn"] = (seat + 1) % 4
            if all(x is not None for x in st["bids"]):
                st["phase"], st["turn"] = "play", (st["dealer"] + 1) % 4
            return f"bid {b}"
        if a.get("pass"):
            st["bids"][seat] = {"pass": True}
        else:
            suit, length, top = a.get("suit"), int(a.get("length") or 0), int(a.get("top") or 0)
            if not valid_sequence(hand, suit, length, top):
                raise HTTPException(status_code=400, detail="That sequence is not in your hand")
            st["bids"][seat] = {"suit": suit, "length": length, "top": top, "order": sum(1 for x in st["bids"] if x)}
        st["turn"] = (seat + 1) % 4
        if all(x is not None for x in st["bids"]):
            valid = [(i, b) for i, b in enumerate(st["bids"]) if not b.get("pass")]
            if not valid:
                new = _b10_new_hand((st["dealer"] + 1) % 4)
                st.clear(); st.update(new)
                return "everyone passed, redeal"
            w = max(valid, key=lambda x: (x[1]["length"], x[1]["top"], -x[1]["order"]))
            st.update({"phase": "play", "trump": w[1]["suit"], "bid_winner": w[0], "turn": w[0]})
        return "bid"
    # play a card
    card = [int(a.get("rank") or 0), a.get("suit")]
    if card not in hand:
        raise HTTPException(status_code=400, detail="Card not in your hand")
    legal = cb_legal(hand, st["trick"]) if g == "callbreak" else b10_legal(hand, st["trick"])
    if card not in legal:
        raise HTTPException(status_code=400, detail="Illegal card: follow the rules for this trick")
    hand.remove(card)
    st["trick"].append([seat, card])
    if len(st["trick"]) < 4:
        st["turn"] = (seat + 1) % 4
        return "card"
    trump = "S" if g == "callbreak" else st["trump"]
    w = trick_winner(st["trick"], trump)
    st["trick_no"] += 1
    st["last_trick"] = {"cards": st["trick"], "winner": w}
    if g == "callbreak":
        st["tricks"][w] += 1
    else:
        wt = team(w)
        st["tricks_won"][wt] += 1
        for _, c in st["trick"]:
            cid = f"10{c[1]}"
            if c[0] == 10 and cid not in st["captured"]:
                st["captured"].append(cid)
                if team(st["owner10"][cid]) != wt:
                    st["points"][wt] += 1
        st["history"].append({"cards": st["trick"], "winner": w})
    st["trick"], st["turn"] = [], w
    if st["trick_no"] == 13:
        st["phase"] = "hand_end"
    return "trick"


def _ludo_action(st, seat, a, n):
    if st["turn"] != seat:
        raise HTTPException(status_code=409, detail="Not your turn")
    col = st["colors"][seat]
    if a.get("type") == "roll":
        if st["phase"] != "roll":
            raise HTTPException(status_code=409, detail="Already rolled, move a token")
        r = rng.randint(1, 6)
        st["roll"] = r
        st["sixes"] = st["sixes"] + 1 if r == 6 else 0
        if r == 6 and st["sixes"] == 3 and CFG["three_six_penalty"]:
            st["last"] = {"seat": seat, "roll": r, "note": "three sixes, turn lost"}
            _ludo_next(st, False)
            return "three sixes"
        if not ludo_moves(st, seat, r):
            st["last"] = {"seat": seat, "roll": r, "note": "no legal move"}
            _ludo_next(st, r == 6)
            return "no move"
        st["phase"] = "move"
        st["last"] = {"seat": seat, "roll": r}
        return f"rolled {r}"
    if st["phase"] != "move":
        raise HTTPException(status_code=409, detail="Roll the dice first")
    t = a.get("token")
    if t not in ludo_moves(st, seat, st["roll"]):
        raise HTTPException(status_code=400, detail="That token can't move")
    toks, r = st["tokens"][col], st["roll"]
    toks[t] = 0 if toks[t] == -1 else toks[t] + r
    extra = r == 6
    note = None
    sq = ludo_abs(col, toks[t])
    if sq is not None and sq not in LUDO_SAFE:
        for oc, ots in st["tokens"].items():
            if oc == col:
                continue
            for i, p in enumerate(ots):
                if ludo_abs(oc, p) == sq:
                    ots[i] = -1
                    extra, note = True, f"captured {oc}"
    if toks[t] == HOME:
        extra, note = True, "token home"
        if all(p == HOME for p in toks):
            st["finished"].append(seat)
            st["phase"] = "done"
            st["last"] = {"seat": seat, "roll": r, "token": t, "note": "all tokens home"}
            return "won"
    st["last"] = {"seat": seat, "roll": r, "token": t, "note": note}
    _ludo_next(st, extra)
    return "moved"


def _ludo_next(st, extra):
    st["phase"], st["roll"] = "roll", None
    if not extra:
        st["turn"] = (st["turn"] + 1) % len(st["colors"])
        st["sixes"] = 0


def bot_action(m, seat):
    g, st = m["game"], m["state"]
    if g == "ludo":
        if st["phase"] == "roll":
            return {"type": "roll"}
        mv = ludo_moves(st, seat, st["roll"])
        col = st["colors"][seat]
        return {"type": "move", "token": max(mv, key=lambda i: (st["tokens"][col][i] + st["roll"] == HOME, st["tokens"][col][i]))}
    hand = st["hands"][seat]
    if st["phase"] == "bid":
        if g == "callbreak":
            return {"bid": max(1, min(8, sum(1 for c in hand if c[0] >= 13 or (c[1] == "S" and c[0] >= 11))))}
        ln, top, s = best_sequence(hand)
        return {"suit": s, "length": ln, "top": top} if ln >= 2 else {"pass": True}
    legal = cb_legal(hand, st["trick"]) if g == "callbreak" else b10_legal(hand, st["trick"])
    c = max(legal, key=lambda x: x[0]) if not st["trick"] else min(legal, key=lambda x: (x[1] == ("S" if g == "callbreak" else st["trump"]), x[0]))
    return {"rank": c[0], "suit": c[1]}


# ------------------------------- views -------------------------------------
def view(room, m, uid):
    seat = next((i for i, s in enumerate(room["seats"]) if s["user_id"] == uid), None)
    base = {"room": {k: room[k] for k in ("id", "code", "game", "players", "entry_fee", "private", "status")},
            "seats": [{"name": s["name"], "bot": s.get("bot", False), "ready": s.get("ready", False),
                       "online": s.get("bot") or _ts() - s.get("last_seen", 0) < 8} for s in room["seats"]],
            "my_seat": seat, "pot": round(room["entry_fee"] * room["players"] * (1 - CFG["fee_percent"] / 100), 2),
            "ready_deadline": room.get("ready_deadline")}
    if not m:
        return base
    st = m["state"]
    out = {**base, "match": {"id": m["id"], "version": m["version"], "deadline": m.get("deadline"),
                             "result": m.get("result"), "status": m["status"]}}
    if m["game"] == "ludo":
        out["state"] = {k: st[k] for k in ("colors", "tokens", "turn", "phase", "roll", "finished", "last")}
        if seat is not None and st["turn"] == seat and st["phase"] == "move":
            out["state"]["movable"] = ludo_moves(st, seat, st["roll"])
        return out
    pub = {k: st.get(k) for k in ("bids", "turn", "phase", "trick", "last_trick", "trick_no", "dealer",
                                   "tricks", "totals", "hand_no", "trump", "bid_winner", "points", "tricks_won")}
    pub["counts"] = [len(h) for h in st["hands"]]
    if m["game"] == "break10":
        pub["captured"] = [{"card": c, "team": team(st["owner10"][c])} for c in st["captured"]]
        if m["status"] == "done":
            pub["owner10"] = st["owner10"]
    if seat is not None:
        pub["hand"] = st["hands"][seat]
        if st["turn"] == seat and st["phase"] == "play":
            pub["legal"] = cb_legal(st["hands"][seat], st["trick"]) if m["game"] == "callbreak" else b10_legal(st["hands"][seat], st["trick"])
        if m["game"] == "break10" and st["phase"] == "bid" and st["turn"] == seat:
            ln, top, s = best_sequence(st["hands"][seat])
            pub["best_sequence"] = {"length": ln, "top": top, "suit": s}
    out["state"] = pub
    return out


# ------------------------------- lifecycle ---------------------------------
def _deadline(m):
    st, g = m["state"], m["game"]
    secs = CFG["ludo_seconds"] if g == "ludo" else (CFG["bid_seconds"] if st.get("phase") == "bid" else CFG["play_seconds"])
    return _ts() + secs


async def _start_match(room):
    m = {"id": str(uuid.uuid4()), "room_id": room["id"], "game": room["game"], "players": [s["user_id"] for s in room["seats"]],
         "names": [s["name"] for s in room["seats"]], "bots": [bool(s.get("bot")) for s in room["seats"]],
         "status": "playing", "version": 1, "state": init_state(room["game"], room["players"]), "events": [],
         "action_ids": [], "started_at": S.now_iso(), "result": None}
    m["deadline"] = _deadline(m)
    m["turn_started"] = _ts()
    await S.db.pvp_matches.insert_one(dict(m))
    await S.db.pvp_rooms.update_one({"id": room["id"]}, {"$set": {"status": "playing", "match_id": m["id"]}})


async def _after_action(m, room):
    """Handle hand/match end; returns True if match finished."""
    st, g = m["state"], m["game"]
    if g == "callbreak" and st["phase"] == "hand_end":
        sc = [b * 10 + (t - b) if t >= b else -b * 10 for b, t in zip(st["bids"], st["tricks"])]
        st["totals"] = [a + b for a, b in zip(st["totals"], sc)]
        st["history"].append({"hand": st["hand_no"], "bids": st["bids"], "tricks": st["tricks"], "scores": sc})
        if st["hand_no"] >= CFG["callbreak_hands"]:
            top = max(st["totals"])
            return await _finish(m, room, [i for i, t in enumerate(st["totals"]) if t == top], {"totals": st["totals"], "hands": st["history"]})
        nd = (st["dealer"] + 1) % 4
        keep = {"hand_no": st["hand_no"] + 1, "totals": st["totals"], "history": st["history"]}
        st.clear(); st.update({**_cb_new_hand(nd), **keep})
    elif g == "break10" and st["phase"] == "hand_end":
        p = st["points"]
        winners = [] if p[0] == p[1] else [i for i in range(4) if team(i) == (0 if p[0] > p[1] else 1)]
        return await _finish(m, room, winners, {"points": p, "tie": p[0] == p[1], "owner10": st["owner10"], "tricks": st["history"]})
    elif g == "ludo" and st["phase"] == "done":
        return await _finish(m, room, [st["finished"][0]], {"winner_color": st["colors"][st["finished"][0]]})
    return False


async def _finish(m, room, winners, detail):
    m["status"] = "done"
    fee = room["entry_fee"]
    pool = round(fee * room["players"] * (1 - CFG["fee_percent"] / 100), 2)
    share = round(pool / len(winners), 2) if winners else 0
    m["result"] = {"winners": winners, "winner_names": [m["names"][i] for i in winners], "share": share, "tie": not winners, **detail}
    m["completed_at"] = S.now_iso()
    await S.db.pvp_rooms.update_one({"id": room["id"]}, {"$set": {"status": "done"}})
    for i, s in enumerate(room["seats"]):
        if s.get("bot"):
            continue
        if not winners:
            await S.credit_wallet(s["user_id"], fee, "refund", "main", status="refunded", meta={"reason": "pvp_tie", "match_id": m["id"]})
            await G._record_game(s["user_id"], room["game"], fee, 0, False, target="tie", recorded=0,
                                 details={"pvp": True, "tie": True}, credit_now=0)
            continue
        won = i in winners
        await G._record_game(s["user_id"], room["game"], fee, share if won else 0, won, target=f"{room['players']}p",
                             recorded=0, details={"pvp": True, "match_id": m["id"]})
    return True


async def _save(m):
    await S.db.pvp_matches.replace_one({"id": m["id"]}, m)


async def act(room, m, seat, a, action_id=None):
    if m["status"] != "playing":
        raise HTTPException(status_code=409, detail="Match is over")
    if action_id and action_id in m["action_ids"]:
        return "duplicate"
    ev = apply_action(m, seat, a)
    m["version"] += 1
    m["events"] = (m["events"] + [{"v": m["version"], "seat": seat, "ev": ev, "at": _ts()}])[-200:]
    if action_id:
        m["action_ids"] = (m["action_ids"] + [action_id])[-100:]
    await _after_action(m, room)
    m["deadline"], m["turn_started"] = _deadline(m), _ts()
    await _save(m)
    return ev


async def tick():
    now = _ts()
    for room in await S.db.pvp_rooms.find({"status": {"$in": ["waiting", "ready"]}}).to_list(500):
        humans = [s for s in room["seats"] if not s.get("bot")]
        if not humans:
            await S.db.pvp_rooms.update_one({"id": room["id"]}, {"$set": {"status": "cancelled"}})
            continue
        if room["status"] == "waiting":
            age = now - S.datetime.fromisoformat(room["created_at"]).timestamp()
            if not room["private"] and age >= CFG["bot_fill_seconds"] and len(room["seats"]) < room["players"]:
                used = {s["name"] for s in room["seats"]}
                while len(room["seats"]) < room["players"]:
                    nm = "BOT " + random.choice([n for n in S.BOT_NAMES if "BOT " + n not in used])
                    used.add(nm)
                    room["seats"].append({"user_id": "bot_" + uuid.uuid4().hex[:6], "name": nm, "bot": True, "ready": True})
                await S.db.pvp_rooms.update_one({"id": room["id"]}, {"$set": {"seats": room["seats"]}})
            if len(room["seats"]) >= room["players"]:
                await S.db.pvp_rooms.update_one({"id": room["id"]}, {"$set": {"status": "ready", "ready_deadline": now + CFG["ready_seconds"]}})
            elif age >= CFG["wait_minutes"] * 60:
                await _cancel(room, "No players joined in time")
        else:
            if all(s.get("ready") for s in room["seats"]):
                await _start_match(room)
            elif now >= room.get("ready_deadline", now):
                keep = [s for s in room["seats"] if s.get("ready")]
                for s in room["seats"]:
                    if not s.get("ready") and not s.get("bot"):
                        await S.credit_wallet(s["user_id"], room["entry_fee"], "refund", "main", status="refunded", meta={"reason": "not_ready"})
                await S.db.pvp_rooms.update_one({"id": room["id"]}, {"$set": {"status": "waiting", "seats": keep}})
    for m in await S.db.pvp_matches.find({"status": "playing"}).to_list(500):
        seat = m["state"]["turn"]
        is_bot = m["bots"][seat]
        if (is_bot and now - m.get("turn_started", 0) >= CFG["bot_delay"]) or now >= m["deadline"]:
            room = await S.db.pvp_rooms.find_one({"id": m["room_id"]})
            async with _lock:
                fresh = await S.db.pvp_matches.find_one({"id": m["id"]})
                if fresh["version"] == m["version"] and fresh["status"] == "playing":
                    fresh.pop("_id", None)
                    try:
                        await act(room, fresh, seat, bot_action(fresh, seat))
                    except HTTPException as e:
                        S.logger.error(f"pvp auto action failed {m['id']}: {e.detail}")


async def _cancel(room, reason):
    res = await S.db.pvp_rooms.update_one({"id": room["id"], "status": {"$in": ["waiting", "ready"]}}, {"$set": {"status": "cancelled", "reason": reason}})
    if res.modified_count:
        for s in room["seats"]:
            if not s.get("bot"):
                await S.credit_wallet(s["user_id"], room["entry_fee"], "refund", "main", status="refunded", meta={"reason": reason})


async def pvp_loop():
    while True:
        try:
            await tick()
        except Exception as e:
            S.logger.error(f"pvp loop error: {e}")
        await asyncio.sleep(0.5)


# ------------------------------- routes ------------------------------------
class RoomReq(BaseModel):
    game: str
    players: int = 4
    entry_fee: float = 20
    private: bool = False


class CodeReq(BaseModel):
    code: str


class ActionReq(BaseModel):
    version: int
    action_id: Optional[str] = None
    type: Optional[str] = None
    bid: Optional[int] = None
    suit: Optional[str] = None
    rank: Optional[int] = None
    length: Optional[int] = None
    top: Optional[int] = None
    token: Optional[int] = None
    pass_: Optional[bool] = None


async def _seat_user(room, user):
    uid = str(user["_id"])
    busy = await S.db.pvp_rooms.find_one({"seats.user_id": uid, "status": {"$in": ["waiting", "ready", "playing"]}})
    if busy:
        if busy["id"] == room.get("id"):
            return busy
        raise HTTPException(status_code=409, detail=f"You're already in a {LABEL[busy['game']]} room ({busy['code']})")
    u = await G._load_user_with_balance(user, room["entry_fee"])
    seat = {"user_id": uid, "name": u.get("display_name") or u["username"], "ready": False, "last_seen": _ts()}
    res = await S.db.pvp_rooms.update_one({"id": room["id"], "status": "waiting", "seats.user_id": {"$ne": uid},
                                            f"seats.{room['players'] - 1}": {"$exists": False}}, {"$push": {"seats": seat}})
    if res.modified_count != 1:
        raise HTTPException(status_code=409, detail="Room is full, try again")
    await S.debit_wallet(u, room["entry_fee"], "game_entry", meta={"mode": room["game"], "pvp_room": room["id"]})
    await S.db.users.update_one({"_id": u["_id"]}, {"$inc": {"stats.total_entries": room["entry_fee"]}})
    return await S.db.pvp_rooms.find_one({"id": room["id"]})


def _check(body):
    if body.game not in GAMES or body.players not in GAMES[body.game]:
        raise HTTPException(status_code=400, detail="Invalid game or player count")
    if body.entry_fee < 10 or body.entry_fee > 10000:
        raise HTTPException(status_code=400, detail="Entry must be 10-10000")


async def _new_room(body, private):
    room = {"id": str(uuid.uuid4()), "code": "P" + uuid.uuid4().hex[:5].upper(), "game": body.game, "players": body.players,
            "entry_fee": round(body.entry_fee, 2), "private": private, "status": "waiting", "seats": [], "created_at": S.now_iso()}
    await S.db.pvp_rooms.insert_one(dict(room))
    return room


@router.post("/pvp/quick")
async def pvp_quick(body: RoomReq, user: dict = Depends(S.get_current_user)):
    _check(body)
    room = await S.db.pvp_rooms.find_one({"game": body.game, "players": body.players, "entry_fee": round(body.entry_fee, 2),
                                          "private": False, "status": "waiting", "seats.user_id": {"$ne": str(user["_id"])}}, sort=[("created_at", 1)])
    room = room or await _new_room(body, False)
    room = await _seat_user(room, user)
    return {"room_id": room["id"]}


@router.post("/pvp/create")
async def pvp_create(body: RoomReq, user: dict = Depends(S.get_current_user)):
    _check(body)
    room = await _seat_user(await _new_room(body, True), user)
    return {"room_id": room["id"], "code": room["code"]}


@router.post("/pvp/join")
async def pvp_join(body: CodeReq, user: dict = Depends(S.get_current_user)):
    room = await S.db.pvp_rooms.find_one({"code": body.code.strip().upper()})
    if not room:
        raise HTTPException(status_code=404, detail="No room with this code")
    if any(s["user_id"] == str(user["_id"]) for s in room["seats"]):
        return {"room_id": room["id"]}
    if room["status"] != "waiting":
        raise HTTPException(status_code=409, detail="This room already started")
    room = await _seat_user(room, user)
    return {"room_id": room["id"]}


@router.get("/pvp/active")
async def pvp_active(user: dict = Depends(S.get_current_user)):
    r = await S.db.pvp_rooms.find_one({"seats.user_id": str(user["_id"]), "status": {"$in": ["waiting", "ready", "playing"]}}, {"_id": 0, "id": 1, "game": 1})
    return r or {}


@router.get("/pvp/history")
async def pvp_history(game: Optional[str] = None, user: dict = Depends(S.get_current_user)):
    q = {"players": str(user["_id"]), "status": "done", **({"game": game} if game else {})}
    ms = await S.db.pvp_matches.find(q, {"_id": 0, "id": 1, "game": 1, "names": 1, "players": 1, "result.winners": 1,
                                         "result.winner_names": 1, "result.tie": 1, "completed_at": 1}).sort("completed_at", -1).to_list(30)
    uid = str(user["_id"])
    for x in ms:
        x["won"] = x["players"].index(uid) in (x.get("result") or {}).get("winners", [])
        x.pop("players")
    return ms


@router.get("/pvp/{room_id}")
async def pvp_get(room_id: str, user: dict = Depends(S.get_current_user)):
    room = await S.db.pvp_rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    uid = str(user["_id"])
    await S.db.pvp_rooms.update_one({"id": room_id, "seats.user_id": uid}, {"$set": {"seats.$.last_seen": _ts()}})
    m = await S.db.pvp_matches.find_one({"id": room.get("match_id")}) if room.get("match_id") else None
    return {**view(room, m, uid), "server_time": _ts()}


@router.post("/pvp/{room_id}/ready")
async def pvp_ready(room_id: str, user: dict = Depends(S.get_current_user)):
    res = await S.db.pvp_rooms.update_one({"id": room_id, "status": "ready", "seats.user_id": str(user["_id"])}, {"$set": {"seats.$.ready": True}})
    if res.modified_count != 1:
        raise HTTPException(status_code=409, detail="Ready check isn't open")
    return {"ok": True}


@router.post("/pvp/{room_id}/leave")
async def pvp_leave(room_id: str, user: dict = Depends(S.get_current_user)):
    uid = str(user["_id"])
    room = await S.db.pvp_rooms.find_one({"id": room_id})
    if not room or room["status"] not in ("waiting", "ready"):
        raise HTTPException(status_code=409, detail="You can only leave before the match starts")
    res = await S.db.pvp_rooms.update_one({"id": room_id, "status": {"$in": ["waiting", "ready"]}, "seats.user_id": uid},
                                          {"$pull": {"seats": {"user_id": uid}}, "$set": {"status": "waiting"}})
    if res.modified_count:
        await S.credit_wallet(uid, room["entry_fee"], "refund", "main", status="refunded", meta={"reason": "left_room"})
        fresh = await S.db.pvp_rooms.find_one({"id": room_id})
        seats = [{**s, "ready": True if s.get("bot") else False} for s in fresh["seats"]]
        await S.db.pvp_rooms.update_one({"id": room_id}, {"$set": {"seats": seats}})
    elif not any(s["user_id"] == uid for s in room["seats"]):
        raise HTTPException(status_code=403, detail="You are not in this room")
    return {"ok": True}


@router.post("/pvp/{room_id}/action")
async def pvp_action(room_id: str, body: ActionReq, user: dict = Depends(S.get_current_user)):
    room = await S.db.pvp_rooms.find_one({"id": room_id})
    if not room or not room.get("match_id"):
        raise HTTPException(status_code=404, detail="Match not found")
    uid = str(user["_id"])
    seat = next((i for i, s in enumerate(room["seats"]) if s["user_id"] == uid), None)
    if seat is None:
        raise HTTPException(status_code=403, detail="You are not in this match")
    a = body.model_dump()
    a["pass"] = a.pop("pass_")
    async with _lock:
        m = await S.db.pvp_matches.find_one({"id": room["match_id"]})
        m.pop("_id", None)
        if body.action_id and body.action_id in m["action_ids"]:
            return {"ok": True, "event": "duplicate", "version": m["version"]}
        if body.version != m["version"]:
            raise HTTPException(status_code=409, detail="Out of date, refreshing")
        ev = await act(room, m, seat, a, body.action_id)
    return {"ok": True, "event": ev, "version": m["version"]}


@router.get("/admin/pvp/matches")
async def admin_pvp(admin: dict = Depends(S.require_admin)):
    ms = await S.db.pvp_matches.find({}, {"_id": 0, "id": 1, "game": 1, "names": 1, "bots": 1, "status": 1, "version": 1,
                                          "started_at": 1, "completed_at": 1, "result.winner_names": 1, "result.tie": 1,
                                          "state.phase": 1, "state.turn": 1}).sort("started_at", -1).to_list(50)
    counts = {g: await S.db.pvp_matches.count_documents({"game": g}) for g in GAMES}
    return {"matches": ms, "active_rooms": await S.db.pvp_rooms.count_documents({"status": {"$in": ["waiting", "ready", "playing"]}}),
            "counts": counts, "config": CFG}
