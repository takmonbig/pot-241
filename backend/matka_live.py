"""Real Satta Matka markets: results from matkaapi.com, bets settled automatically."""
import asyncio
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import server as S
import games_extra as G

router = APIRouter(prefix="/api")
API = "https://www.matkaapi.com/mapi/market_api.php"
DOMAIN = "pot24.co"
IST = timezone(timedelta(hours=5, minutes=30))
PAYOUT = {"open_single": 9.5, "close_single": 9.5, "jodi": 95.0, "open_panna": 140.0, "close_panna": 140.0}
_cache = {"at": 0, "markets": []}


def _get(params):
    p = {**params, "domain_key": os.environ["MATKA_API_KEY"], "domain": DOMAIN}
    return requests.get(API, params=p, timeout=20).json()


def _t(day, s):
    return datetime.strptime(f"{day} {s}", "%Y-%m-%d %I:%M %p").replace(tzinfo=IST)


async def markets():
    if time.time() - _cache["at"] > 1800 or not _cache["markets"]:
        d = await asyncio.to_thread(_get, {"market_list": 1})
        today = datetime.now(IST)
        wd = today.weekday()
        seen, out = set(), []
        for m in d.get("data", []):
            if not m["open_time"] or m["name"] in seen:
                continue
            if (wd == 5 and m["sat_day"] != "1") or (wd == 6 and m["sun_day"] != "1"):
                continue
            seen.add(m["name"])
            out.append({"name": m["name"], "open_time": m["open_time"], "close_time": m["close_time"]})
        _cache.update(at=time.time(), markets=out)
    return _cache["markets"]


def parse(result: str):
    """'590-40-127' -> open panna 590, jodi 40, close panna 127. Partial '590-4' = open only."""
    parts = (result or "").split("-")
    op = parts[0] if parts and len(parts[0]) == 3 else None
    mid = parts[1] if len(parts) > 1 else ""
    cp = parts[2] if len(parts) > 2 and len(parts[2]) == 3 else None
    return {"open_panna": op, "open": mid[0] if mid else None, "close": mid[1] if len(mid) == 2 else None,
            "jodi": mid if len(mid) == 2 else None, "close_panna": cp}


_rcache = {}


async def fetch_result(name):
    """Today's result only (IST), cached 60s."""
    key = name.upper()
    hit = _rcache.get(key)
    if hit and time.time() - hit[0] < 60:
        return hit[1]
    d = await asyncio.to_thread(_get, {"market": name.lower()})
    today = datetime.now(IST).strftime("%Y-%m-%d")
    res = None
    if d.get("status") and d.get("data") and d["data"][0].get("date") == today:
        res = d["data"][0]["result"]
    _rcache[key] = (time.time(), res)
    return res


def _win(kind, pick, r):
    return {"open_single": r["open"], "close_single": r["close"], "jodi": r["jodi"],
            "open_panna": r["open_panna"], "close_panna": r["close_panna"]}[kind] == pick


def _decided(kind, r):
    return (r["open"] is not None and r["open_panna"] is not None) if kind.startswith("open") else r["close_panna"] is not None


async def settle_loop():
    while True:
        try:
            today = datetime.now(IST).strftime("%Y-%m-%d")
            # bets from past days whose result was never fetched: refund (history isn't available on this plan)
            async for b in S.db.matka_bets.find({"status": "open", "date": {"$lt": today}}):
                upd = await S.db.matka_bets.update_one({"id": b["id"], "status": "open"}, {"$set": {"status": "refunded"}})
                if upd.modified_count:
                    await S.credit_wallet(b["user_id"], b["amount"], "refund", "main", status="refunded", meta={"reason": "matka_no_result", "market": b["market"]})
            pending = await S.db.matka_bets.distinct("market", {"status": "open", "date": today})
            for name in pending:
                res = await fetch_result(name)
                if not res:
                    continue
                r = parse(res)
                async for b in S.db.matka_bets.find({"market": name, "status": "open", "date": today}):
                    if not _decided(b["kind"], r):
                        continue
                    won = _win(b["kind"], b["pick"], r)
                    prize = round(b["amount"] * PAYOUT[b["kind"]], 2) if won else 0
                    upd = await S.db.matka_bets.update_one({"id": b["id"], "status": "open"}, {"$set": {"status": "won" if won else "lost", "prize": prize, "result": res}})
                    if upd.modified_count:
                        await G._record_game(b["user_id"], "matka", b["amount"], prize, won, target=f"{b['kind']}:{b['pick']}",
                                             recorded=0, details={"market": name, "result": res})
        except Exception as e:
            S.logger.error(f"matka settle error: {e}")
        await asyncio.sleep(120)


class MatkaBet(BaseModel):
    market: str
    kind: str
    pick: str
    amount: float


@router.get("/matka/markets")
async def list_markets(user: dict = Depends(S.get_current_user)):
    ms = await markets()
    now = datetime.now(IST)
    day = now.strftime("%Y-%m-%d")
    out = []
    for m in ms:
        try:
            o, c = _t(day, m["open_time"]), _t(day, m["close_time"])
        except ValueError:
            continue
        if c < o:
            c += timedelta(days=1)
        out.append({**m, "open_at": o.isoformat(), "close_at": c.isoformat(), "open_bets": now < o, "close_bets": now < c})
    out.sort(key=lambda x: (not x["close_bets"], not x["open_bets"], x["open_at"]))
    return {"markets": out, "payout": PAYOUT, "now": now.isoformat()}


@router.get("/matka/result/{name}")
async def market_result(name: str, user: dict = Depends(S.get_current_user)):
    res = await fetch_result(name)
    return {"market": name, "result": res, "parsed": parse(res) if res else None}


@router.post("/matka/bet")
async def place(body: MatkaBet, user: dict = Depends(S.get_current_user)):
    if body.kind not in PAYOUT:
        raise HTTPException(status_code=400, detail="Invalid bet type")
    ln = 2 if body.kind == "jodi" else (3 if "panna" in body.kind else 1)
    if not (body.pick.isdigit() and len(body.pick) == ln):
        raise HTTPException(status_code=400, detail=f"Pick must be {ln} digit(s)")
    if body.amount < 10 or body.amount > 10000:
        raise HTTPException(status_code=400, detail="Bet must be 10-10000")
    m = next((x for x in (await list_markets(user))["markets"] if x["name"] == body.market), None)
    if not m:
        raise HTTPException(status_code=404, detail="Market not available today")
    if not (m["close_bets"] if body.kind.startswith("close") else m["open_bets"]):
        raise HTTPException(status_code=409, detail="Betting is closed for this market")
    u = await G._load_user_with_balance(user, body.amount)
    await S.debit_wallet(u, body.amount, "game_entry", meta={"mode": "matka", "market": body.market})
    await S.db.users.update_one({"_id": u["_id"]}, {"$inc": {"stats.total_entries": body.amount}})
    b = {"id": str(uuid.uuid4()), "user_id": str(u["_id"]), "market": body.market, "kind": body.kind, "pick": body.pick,
         "amount": round(body.amount, 2), "status": "open", "prize": 0, "date": datetime.now(IST).strftime("%Y-%m-%d"),
         "created_at": S.now_iso()}
    await S.db.matka_bets.insert_one(dict(b))
    b.pop("_id", None)
    return {"bet": b}


@router.get("/matka/my-bets")
async def my_bets(user: dict = Depends(S.get_current_user)):
    return await S.db.matka_bets.find({"user_id": str(user["_id"])}, {"_id": 0}).sort("created_at", -1).to_list(30)
