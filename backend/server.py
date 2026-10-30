from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import asyncio
import logging
import uuid
import secrets
import random
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict

from fastapi import (FastAPI, APIRouter, Request, Response, HTTPException, Depends,
                     WebSocket, WebSocketDisconnect, UploadFile, File, Form)
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel, EmailStr, Field
import cloudinary
import cloudinary.uploader

cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    secure=True,
)

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("pazer")

app = FastAPI(title="POT24 API")
api = APIRouter(prefix="/api")

LATENCY_BOUND = 2.5  # seconds tolerated between server-measured and client-reported elapsed
ROOM_EXTRA_SECONDS = 5  # rooms stay LIVE for (target + this) seconds before auto-finalizing
ROOM_DURATIONS = [5, 10, 15]  # only these 3 room durations exist (both 1v1 & multiplayer)
CUSTOM_ROOM_MINUTES = 10  # custom private rooms expire after this many minutes if not started

# ---------------------------------------------------------------------------
# Default configuration
# ---------------------------------------------------------------------------
DEFAULT_CONFIG = {
    "id": "global",
    "coin_value_inr": 1,
    "game_enabled": True,
    "real_money_enabled": False,
    "wallet": {
        "min_deposit": 100,
        "max_deposit": 100000,
        "bonus_enabled": True,
        "bonus_percentage": 10,
        "max_bonus": 1000,
        "min_withdrawal": 200,
        "max_withdrawal": 50000,
        "min_usdt_deposit": 10,
        "min_usdt_withdrawal": 10,
    },
    "payment_config": {
        "upi": {
            "enabled": True,
            "qr_url": "",
            "upi_id": "",
            "name": "",
            "note": "Scan the QR and pay the exact amount. Upload the payment screenshot after paying.",
            "upi_id_threshold": 1999,
        },
        "usdt": {
            "enabled": True,
            "qr_url": "",
            "wallet_address": "",
            "network": "TRC20",
            "rate": 100,
            "note": "Send USDT only on the TRC20 network. Upload the payment screenshot after sending.",
        },
        "inr_rate": 1,
    },
    "referral_config": {
        "enabled": True,
        "signup_bonus": 10,
        "loss_commission_percent": 7.5,
        "win_commission_percent": 2.5,
    },
    "meta_pixel": {
        "enabled": False,
        "pixel_id": "",
        "custom_head_code": "",
        "events": {
            "register": "CompleteRegistration",
            "deposit": "Purchase",
            "game_play": "Lead",
            "win": "",
        },
    },
    "support_config": {
        "telegram_url": "https://t.me/amoratime0109",
        "forgot_password_url": "https://t.me/amoratime0109",
    },
    "fixed_config": {
        "enabled": True,
        "min_bet": 20,
        "max_bet": 5000,
        "win_multiplier": 5,
        "targets": [5, 7, 10, 14, 16, 21, 26, 31],
    },
    "aviator_config": {
        "enabled": True,
        "min_bet": 20,
        "max_bet": 5000,
        "house_edge_percent": 5,
        "max_multiplier": 100,
        "growth_rate": 0.12,
    },
    "tower_config": {
        "enabled": True,
        "min_bet": 20,
        "max_bet": 5000,
        "house_edge_percent": 5,
        "rows": 8,
        "difficulties": {
            "easy": {"cols": 4, "bombs": 1},
            "medium": {"cols": 3, "bombs": 1},
            "hard": {"cols": 2, "bombs": 1},
        },
    },
    "room_config": {
        "entry_fee": 50,
        "entry_fees": [30, 50, 75, 100],
        "min_players": 2,
        "max_players": 10,
        "room_duration_minutes": 5,
        "platform_fee_percent": 20,
        "num_winners": 1,
        "runner_up_percent": 0,
        "auto_room_count": 6,
        "room_targets": [5, 10, 15],
    },
    "room_1v1_config": {
        "enabled": True,
        "entry_fee": 50,
        "entry_fees": [50, 75, 100, 150],
        "win_multiplier": 1.5,
        "room_duration_minutes": 5,
        "targets": [5, 10, 15],
    },
    "bot_config": {
        "enabled": True,
        "fill_1v1": True,
        "fill_multiplayer": True,
        "join_delay_seconds": 3,
        "error_range": 0.25,
    },
    "streak_config": {
        "enabled": True,
        "daily_bonus": 20,
    },
    "leaderboard_config": {
        "enabled": True,
        "auto_generate": True,
        "fake_count": 8,
        "min_win": 500,
        "max_win": 25000,
        "name_pool": ["Palak", "Rohan", "Aisha", "Vikram", "Neha", "Arjun", "Sana", "Karan",
                      "Priya", "Dev", "Meera", "Aditya", "Riya", "Sahil", "Yash", "Isha",
                      "Kabir", "Manish", "Simran", "Rahul", "Diya", "Nikhil", "Pooja", "Kavya",
                      "Alexei", "Daniel", "Sofia", "Lucas", "Emma", "Mateo", "Olivia", "Liam",
                      "Nadia", "Marco", "Chloe", "Diego", "Aiko", "Hassan", "Elena", "Omar",
                      "Viktor", "Layla", "Sergei", "Amara", "Noah", "Yuki", "Ivan", "Zoe"],
        "manual_entries": [],
    },
}


BOT_NAMES = ["Aarav", "Ishaan", "Ananya", "Vivaan", "Diya", "Kiara", "Reyansh", "Saanvi",
             "Advik", "Myra", "Kabir", "Aadhya", "Vihaan", "Anika", "Arnav", "Navya",
             "Shaurya", "Aaradhya", "Krish", "Prisha", "Rudra", "Tara", "Veer", "Zara",
             "Alex", "Daniel", "Sofia", "Lucas", "Emma", "Mateo", "Olivia", "Liam",
             "Nadia", "Marco", "Diego", "Hassan", "Elena", "Omar", "Viktor", "Yuki"]


def gen_referral_code() -> str:
    return "TU" + secrets.token_hex(3).upper()


async def get_config() -> dict:
    cfg = await db.config.find_one({"id": "global"}, {"_id": 0})
    if not cfg:
        await db.config.insert_one(dict(DEFAULT_CONFIG))
        return dict(DEFAULT_CONFIG)
    # merge any newly-added top-level keys without wiping admin customisations
    missing = {k: v for k, v in DEFAULT_CONFIG.items() if k not in cfg}
    if missing:
        await db.config.update_one({"id": "global"}, {"$set": missing})
        cfg.update(missing)
    # migrate room configs to the fixed 3-duration + fee-variants model
    sets = {}
    rcfg = cfg.get("room_config", {})
    if "entry_fees" not in rcfg:
        sets["room_config.entry_fees"] = DEFAULT_CONFIG["room_config"]["entry_fees"]
    if rcfg.get("max_players", 25) > 10:
        sets["room_config.max_players"] = 10
    if rcfg.get("min_players", 5) > 5:
        sets["room_config.min_players"] = 2
    v1cfg = cfg.get("room_1v1_config", {})
    if "entry_fees" not in v1cfg:
        sets["room_1v1_config.entry_fees"] = DEFAULT_CONFIG["room_1v1_config"]["entry_fees"]
    wcfg = cfg.get("wallet", {})
    if "min_usdt_deposit" not in wcfg:
        sets["wallet.min_usdt_deposit"] = DEFAULT_CONFIG["wallet"]["min_usdt_deposit"]
    if "min_usdt_withdrawal" not in wcfg:
        sets["wallet.min_usdt_withdrawal"] = DEFAULT_CONFIG["wallet"]["min_usdt_withdrawal"]
    if sets:
        await db.config.update_one({"id": "global"}, {"$set": sets})
        for k, v in sets.items():
            top, sub = k.split(".")
            cfg.setdefault(top, {})[sub] = v
    return cfg


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh",
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")


def serialize_user(user: dict) -> dict:
    user = dict(user)
    user["id"] = str(user.pop("_id"))
    user.pop("password_hash", None)
    return user


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if user.get("status") == "suspended":
            raise HTTPException(status_code=403, detail="Account suspended")
        if not user.get("referral_code") and user.get("role") != "admin":
            code = gen_referral_code()
            await db.users.update_one({"_id": user["_id"]}, {"$set": {
                "referral_code": code, "referral_earnings": user.get("referral_earnings", 0.0)}})
            user["referral_code"] = code
            user.setdefault("referral_earnings", 0.0)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------------------------------------------------------------------------
# Wallet ledger helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def record_txn(user_id: str, ttype: str, amount: float, wallet: str,
                     balance_before: float, balance_after: float,
                     status: str = "success", meta: Optional[dict] = None) -> dict:
    txn = {
        "id": str(uuid.uuid4()),
        "txn_id": "TXN" + uuid.uuid4().hex[:12].upper(),
        "user_id": user_id,
        "type": ttype,
        "amount": round(amount, 2),
        "coins": round(amount, 2),
        "wallet": wallet,
        "status": status,
        "balance_before": round(balance_before, 2),
        "balance_after": round(balance_after, 2),
        "created_at": now_iso(),
        "meta": meta or {},
    }
    await db.transactions.insert_one(dict(txn))
    txn.pop("_id", None)
    return txn


async def get_user_by_id(user_id: str) -> dict:
    return await db.users.find_one({"_id": ObjectId(user_id)})


async def debit_wallet(user: dict, amount: float, ttype: str, meta: dict = None):
    """Debit combined balance: main first, then bonus. Returns list of txns."""
    main = user.get("main_balance", 0.0)
    bonus = user.get("bonus_balance", 0.0)
    total = main + bonus
    if total < amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    before = total
    from_main = min(main, amount)
    from_bonus = amount - from_main
    new_main = main - from_main
    new_bonus = bonus - from_bonus
    await db.users.update_one({"_id": user["_id"]},
                              {"$set": {"main_balance": new_main, "bonus_balance": new_bonus}})
    txn = await record_txn(str(user["_id"]), ttype, -amount, "combined",
                           before, new_main + new_bonus, meta=meta)
    user["main_balance"] = new_main
    user["bonus_balance"] = new_bonus
    return txn


async def credit_wallet(user_id: str, amount: float, ttype: str, wallet: str = "main",
                        status: str = "success", meta: dict = None):
    user = await get_user_by_id(user_id)
    main = user.get("main_balance", 0.0)
    bonus = user.get("bonus_balance", 0.0)
    before = main + bonus
    if wallet == "bonus":
        new_bonus = bonus + amount
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"bonus_balance": new_bonus}})
        after = main + new_bonus
    else:
        new_main = main + amount
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"main_balance": new_main}})
        after = new_main + bonus
    return await record_txn(user_id, ttype, amount, wallet, before, after, status=status, meta=meta)


async def pay_referral_commission(user_id: str, won: bool, entry_fee: float, prize: float):
    """Credit the referrer a commission when their referred player finishes a game."""
    try:
        u = await get_user_by_id(user_id)
    except Exception:
        return
    ref = u.get("referred_by") if u else None
    if not ref:
        return
    cfg = await get_config()
    rc = cfg.get("referral_config", {})
    if not rc.get("enabled", True):
        return
    if won:
        pct, base, reason = rc.get("win_commission_percent", 2.5), prize, "referral_win_commission"
    else:
        pct, base, reason = rc.get("loss_commission_percent", 7.5), entry_fee, "referral_loss_commission"
    amt = round(base * pct / 100.0, 2)
    if amt <= 0:
        return
    try:
        await credit_wallet(ref, amt, "referral", "main", meta={"reason": reason, "from": user_id})
        await db.users.update_one({"_id": ObjectId(ref)}, {"$inc": {"referral_earnings": amt}})
    except Exception as e:
        logger.warning(f"referral commission skipped: {e}")


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------
class RegisterReq(BaseModel):
    full_name: str
    mobile: str
    password: str
    referral_code: Optional[str] = None


class LoginReq(BaseModel):
    mobile: str
    password: str


class ForgotReq(BaseModel):
    mobile: str


class ResetReq(BaseModel):
    token: str
    password: str


class DepositReq(BaseModel):
    method: str  # 'upi' | 'usdt'
    amount: float  # INR for upi, USDT amount for usdt
    screenshot_url: str
    utr: Optional[str] = None


class ResubmitReq(BaseModel):
    screenshot_url: str


class WithdrawReq(BaseModel):
    amount: float
    method: Optional[str] = "upi"  # 'upi' | 'bank' | 'usdt'
    account: Optional[str] = None


class KycReq(BaseModel):
    full_name: str
    method: str  # 'bank' | 'upi'
    account_number: Optional[str] = None
    ifsc: Optional[str] = None
    bank_name: Optional[str] = None
    account_name: Optional[str] = None
    upi_id: Optional[str] = None
    upi_name: Optional[str] = None
    usdt_wallet_address: Optional[str] = None
    usdt_network: Optional[str] = "TRC20"
    usdt_qr_url: Optional[str] = None


class FixedStartReq(BaseModel):
    target: float
    bet: float


class FixedStopReq(BaseModel):
    session_id: str
    elapsed: float
    nonce: str


class AviatorStartReq(BaseModel):
    bet: float


class AviatorCashoutReq(BaseModel):
    session_id: str
    nonce: str
    multiplier: float


class TowerStartReq(BaseModel):
    bet: float
    difficulty: str = "easy"


class TowerPickReq(BaseModel):
    session_id: str
    nonce: str
    col: int


class TowerCashoutReq(BaseModel):
    session_id: str
    nonce: str


class RoomStopReq(BaseModel):
    elapsed: float


class CustomRoomReq(BaseModel):
    mode: str  # '1v1' | 'multiplayer'
    target: float
    entry_fee: float


class JoinCodeReq(BaseModel):
    code: str


# ---------------------------------------------------------------------------
# WebSocket manager
# ---------------------------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, room_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(room_id, []).append(ws)

    def disconnect(self, room_id: str, ws: WebSocket):
        if room_id in self.rooms and ws in self.rooms[room_id]:
            self.rooms[room_id].remove(ws)

    async def broadcast(self, room_id: str, message: dict):
        for ws in list(self.rooms.get(room_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(room_id, ws)


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api.post("/auth/register")
async def register(body: RegisterReq, response: Response):
    mobile = body.mobile.strip()
    if not mobile.isdigit() or len(mobile) < 10:
        raise HTTPException(status_code=400, detail="Enter a valid mobile number")
    if await db.users.find_one({"mobile": mobile}):
        raise HTTPException(status_code=400, detail="Mobile number already registered")
    username = "TU" + secrets.token_hex(4).upper()
    # referral handling
    cfg = await get_config()
    ref_cfg = cfg.get("referral_config", {})
    referrer = None
    ref_code = (body.referral_code or "").strip().upper()
    if ref_code and ref_cfg.get("enabled", True):
        referrer = await db.users.find_one({"referral_code": ref_code})
    # unique own referral code
    own_code = gen_referral_code()
    while await db.users.find_one({"referral_code": own_code}):
        own_code = gen_referral_code()
    doc = {
        "username": username,
        "mobile": mobile,
        "password_hash": hash_password(body.password),
        "display_name": body.full_name.strip(),
        "full_name": body.full_name.strip(),
        "role": "user",
        "status": "active",
        "kyc_status": "not_submitted",
        "profile_picture": None,
        "main_balance": 0.0,
        "bonus_balance": 0.0,
        "referral_code": own_code,
        "referred_by": str(referrer["_id"]) if referrer else None,
        "referral_earnings": 0.0,
        "force_win": False,
        "stats": {"games_played": 0, "games_won": 0, "total_entries": 0.0, "total_prizes": 0.0},
        "created_at": now_iso(),
    }
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    # award signup bonuses to both parties
    if referrer and ref_cfg.get("enabled", True):
        signup_bonus = ref_cfg.get("signup_bonus", 10)
        if signup_bonus > 0:
            await credit_wallet(uid, signup_bonus, "bonus", "bonus",
                                meta={"reason": "referral_signup", "referrer": str(referrer["_id"])})
            await credit_wallet(str(referrer["_id"]), signup_bonus, "bonus", "bonus",
                                meta={"reason": "referral_reward", "referred": uid})
            await db.users.update_one({"_id": referrer["_id"]},
                                      {"$inc": {"referral_earnings": signup_bonus}})
    access, refresh = create_access_token(uid, mobile), create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    user = await db.users.find_one({"_id": res.inserted_id})
    return {"user": serialize_user(user), "token": access}


@api.post("/auth/login")
async def login(body: LoginReq, request: Request, response: Response):
    mobile = body.mobile.strip()
    ip = request.client.host if request.client else "unknown"
    ident = f"{ip}:{mobile}"
    attempt = await db.login_attempts.find_one({"identifier": ident})
    if attempt and attempt.get("locked_until"):
        locked = datetime.fromisoformat(attempt["locked_until"])
        if locked > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    user = await db.users.find_one({"mobile": mobile})
    if not user and len(mobile) >= 10:
        # fallback: match by last 10 digits (handles country-code prefix differences)
        user = await db.users.find_one({"mobile": {"$regex": mobile[-10:] + "$"}})
    if not user or not verify_password(body.password, user["password_hash"]):
        count = (attempt["count"] if attempt else 0) + 1
        upd = {"identifier": ident, "count": count}
        if count >= 5:
            upd["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        await db.login_attempts.update_one({"identifier": ident}, {"$set": upd}, upsert=True)
        raise HTTPException(status_code=401, detail="Invalid mobile or password")
    await db.login_attempts.delete_one({"identifier": ident})
    uid = str(user["_id"])
    access, refresh = create_access_token(uid, mobile), create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"user": serialize_user(user), "token": access}


@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return serialize_user(user)


@api.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        access = create_access_token(str(user["_id"]), user.get("mobile", ""))
        response.set_cookie("access_token", access, httponly=True, secure=True,
                            samesite="none", max_age=43200, path="/")
        return {"token": access}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotReq):
    user = await db.users.find_one({"mobile": body.mobile.strip()})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "token": token, "user_id": str(user["_id"]),
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)),
            "used": False,
        })
        logger.info(f"[PASSWORD RESET] token for {body.mobile}: {token}")
    return {"message": "If the mobile exists, a reset code has been sent."}


@api.post("/auth/reset-password")
async def reset_password(body: ResetReq):
    rec = await db.password_reset_tokens.find_one({"token": body.token})
    if not rec or rec.get("used"):
        raise HTTPException(status_code=400, detail="Invalid or used token")
    await db.users.update_one({"_id": ObjectId(rec["user_id"])},
                              {"$set": {"password_hash": hash_password(body.password)}})
    await db.password_reset_tokens.update_one({"token": body.token}, {"$set": {"used": True}})
    return {"message": "Password updated"}


# ---------------------------------------------------------------------------
# Profile / KYC
# ---------------------------------------------------------------------------
class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    mobile: Optional[str] = None
    profile_picture: Optional[str] = None


@api.put("/profile")
async def update_profile(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if upd:
        await db.users.update_one({"_id": user["_id"]}, {"$set": upd})
    return serialize_user(await get_user_by_id(str(user["_id"])))


@api.post("/kyc")
async def submit_kyc(body: KycReq, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": user["_id"]}, {"$set": {
        "kyc_status": "pending",
        "kyc_data": body.model_dump(),
        "kyc_submitted_at": now_iso(),
    }})
    return {"message": "KYC submitted for review", "kyc_status": "pending"}


@api.post("/upload")
async def upload_image(file: UploadFile = File(...), folder: str = Form("uploads"),
                       user: dict = Depends(get_current_user)):
    allowed = {"uploads", "payment_qr", "payment_proof", "profile"}
    folder = folder if folder in allowed else "uploads"
    contents = await file.read()
    if len(contents) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 8MB)")
    try:
        result = cloudinary.uploader.upload(contents, folder=f"timeup/{folder}", resource_type="image")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")
    return {"url": result.get("secure_url"), "public_id": result.get("public_id")}


@api.get("/payment-info")
async def payment_info(user: dict = Depends(get_current_user)):
    cfg = await get_config()
    pc = cfg.get("payment_config", {})
    w = cfg.get("wallet", {})
    return {
        "upi": pc.get("upi", {}),
        "usdt": pc.get("usdt", {}),
        "inr_rate": pc.get("inr_rate", 1),
        "min_deposit": w.get("min_deposit", 100),
        "max_deposit": w.get("max_deposit", 100000),
        "min_usdt_deposit": w.get("min_usdt_deposit", 10),
    }


# ---------------------------------------------------------------------------
# Wallet endpoints
# ---------------------------------------------------------------------------
@api.get("/wallet")
async def get_wallet(user: dict = Depends(get_current_user)):
    u = await get_user_by_id(str(user["_id"]))
    return {
        "main_balance": round(u.get("main_balance", 0), 2),
        "bonus_balance": round(u.get("bonus_balance", 0), 2),
        "total_balance": round(u.get("main_balance", 0) + u.get("bonus_balance", 0), 2),
    }


@api.get("/wallet/transactions")
async def get_transactions(user: dict = Depends(get_current_user), type: Optional[str] = None):
    q = {"user_id": str(user["_id"])}
    if type:
        q["type"] = type
    txns = await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return txns


@api.post("/wallet/deposit")
async def deposit(body: DepositReq, user: dict = Depends(get_current_user)):
    cfg = await get_config()
    w = cfg["wallet"]
    pc = cfg.get("payment_config", {})
    method = body.method.lower()
    if not body.screenshot_url:
        raise HTTPException(status_code=400, detail="Payment screenshot is required")
    if method == "usdt":
        min_usdt = w.get("min_usdt_deposit", 10)
        if body.amount < min_usdt:
            raise HTTPException(status_code=400, detail=f"Minimum USDT deposit is {min_usdt} USDT")
        coins = body.amount * pc.get("usdt", {}).get("rate", 100)
        amount_label = f"{body.amount} USDT"
    else:
        method = "upi"
        if body.amount < w["min_deposit"]:
            raise HTTPException(status_code=400, detail=f"Minimum deposit is {w['min_deposit']}")
        if body.amount > w["max_deposit"]:
            raise HTTPException(status_code=400, detail=f"Maximum deposit is {w['max_deposit']}")
        coins = body.amount * pc.get("inr_rate", 1)
        amount_label = f"₹{body.amount}"
    req = {
        "id": str(uuid.uuid4()),
        "req_id": "DEP" + uuid.uuid4().hex[:10].upper(),
        "user_id": str(user["_id"]),
        "username": user.get("username"),
        "mobile": user.get("mobile"),
        "display_name": user.get("display_name"),
        "method": method,
        "amount": round(body.amount, 2),
        "amount_label": amount_label,
        "coins": round(coins, 2),
        "screenshot_url": body.screenshot_url,
        "utr": body.utr,
        "status": "pending",
        "problem": None,
        "created_at": now_iso(),
    }
    await db.deposit_requests.insert_one(dict(req))
    req.pop("_id", None)
    return {"message": "Payment submitted. Our team will verify it shortly.", "request": req}


@api.get("/wallet/deposit-requests")
async def my_deposit_requests(user: dict = Depends(get_current_user)):
    return await db.deposit_requests.find({"user_id": str(user["_id"])}, {"_id": 0}) \
        .sort("created_at", -1).to_list(100)


@api.post("/wallet/deposit-requests/{req_id}/resubmit")
async def resubmit_deposit(req_id: str, body: ResubmitReq, user: dict = Depends(get_current_user)):
    req = await db.deposit_requests.find_one({"req_id": req_id, "user_id": str(user["_id"])})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] != "rejected":
        raise HTTPException(status_code=400, detail="Only rejected requests can be resubmitted")
    if not body.screenshot_url:
        raise HTTPException(status_code=400, detail="Payment screenshot is required")
    await db.deposit_requests.update_one({"req_id": req_id}, {"$set": {
        "screenshot_url": body.screenshot_url, "status": "pending",
        "problem": None, "resubmitted_at": now_iso()}})
    return {"message": "Resubmitted for review"}


@api.post("/wallet/withdraw")
async def withdraw(body: WithdrawReq, user: dict = Depends(get_current_user)):
    cfg = await get_config()
    w = cfg["wallet"]
    u = await get_user_by_id(str(user["_id"]))
    if u.get("kyc_status") != "verified":
        raise HTTPException(status_code=403, detail="KYC verification required before withdrawal")
    method = (body.method or "upi").lower()
    if method == "usdt":
        min_usdt = w.get("min_usdt_withdrawal", 10)
        # amount is in coins; 1 USDT = rate coins
        rate = cfg.get("payment_config", {}).get("usdt", {}).get("rate", 100)
        if body.amount < min_usdt * rate:
            raise HTTPException(status_code=400, detail=f"Minimum USDT withdrawal is {min_usdt} USDT ({int(min_usdt*rate)} coins)")
    else:
        if body.amount < w["min_withdrawal"]:
            raise HTTPException(status_code=400, detail=f"Minimum withdrawal is {w['min_withdrawal']}")
    if body.amount > w["max_withdrawal"]:
        raise HTTPException(status_code=400, detail=f"Maximum withdrawal is {w['max_withdrawal']}")
    if u.get("main_balance", 0) < body.amount:
        raise HTTPException(status_code=400, detail="Insufficient main wallet balance")
    before = u["main_balance"] + u.get("bonus_balance", 0)
    new_main = u["main_balance"] - body.amount
    await db.users.update_one({"_id": u["_id"]}, {"$set": {"main_balance": new_main}})
    txn = await record_txn(str(user["_id"]), "withdrawal", -body.amount, "main",
                           before, new_main + u.get("bonus_balance", 0),
                           status="pending", meta={"method": method, "account": body.account,
                                                   "username": u.get("username"), "mobile": u.get("mobile"),
                                                   "kyc": u.get("kyc_data", {})})
    return {"message": "Withdrawal request submitted for review", "transaction": txn,
            "wallet": await get_wallet(user)}


# ---------------------------------------------------------------------------
# Fixed-time challenge
# ---------------------------------------------------------------------------
@api.get("/config/public")
async def public_config():
    cfg = await get_config()
    return {
        "coin_value_inr": cfg["coin_value_inr"],
        "game_enabled": cfg["game_enabled"],
        "real_money_enabled": cfg["real_money_enabled"],
        "wallet": cfg["wallet"],
        "fixed_config": cfg["fixed_config"],
        "aviator_config": cfg.get("aviator_config", {}),
        "tower_config": cfg.get("tower_config", {}),
        "room_config": cfg["room_config"],
        "room_1v1_config": cfg["room_1v1_config"],
        "meta_pixel": cfg.get("meta_pixel", {}),
        "support": cfg.get("support_config", {}),
    }


@api.post("/games/fixed/start")
async def fixed_start(body: FixedStartReq, user: dict = Depends(get_current_user)):
    cfg = await get_config()
    if not cfg["game_enabled"] or not cfg["fixed_config"].get("enabled"):
        raise HTTPException(status_code=403, detail="Challenge is currently disabled")
    fc = cfg["fixed_config"]
    if body.target not in fc["targets"]:
        raise HTTPException(status_code=404, detail="Target time not available")
    bet = round(float(body.bet), 2)
    if bet < fc["min_bet"]:
        raise HTTPException(status_code=400, detail=f"Minimum bet is {fc['min_bet']} coins")
    if bet > fc["max_bet"]:
        raise HTTPException(status_code=400, detail=f"Maximum bet is {fc['max_bet']} coins")
    u = await get_user_by_id(str(user["_id"]))
    if u.get("main_balance", 0) + u.get("bonus_balance", 0) < bet:
        raise HTTPException(status_code=400, detail="Insufficient balance for this bet")
    active = await db.game_sessions.find_one({"user_id": str(user["_id"]), "status": "active"})
    if active:
        # auto-expire sessions abandoned for >90s so a stuck game never blocks the user
        created = active.get("created_at")
        stale = False
        try:
            stale = (datetime.now(timezone.utc) - datetime.fromisoformat(created)).total_seconds() > 90
        except Exception:
            stale = True
        if stale:
            await db.game_sessions.update_one({"id": active["id"]}, {"$set": {"status": "abandoned"}})
        else:
            raise HTTPException(status_code=409, detail="You already have an active game session")
    nonce = secrets.token_urlsafe(16)
    prize = round(bet * fc["win_multiplier"], 2)
    await debit_wallet(u, bet, "game_entry", meta={"mode": "fixed", "target": body.target})
    session = {
        "id": str(uuid.uuid4()),
        "user_id": str(user["_id"]),
        "mode": "fixed",
        "target": body.target,
        "entry_fee": bet,
        "prize": prize,
        "win_multiplier": fc["win_multiplier"],
        "nonce": nonce,
        "status": "active",
        "force_win": bool(u.get("force_win")),
        "server_start": datetime.now(timezone.utc).timestamp(),
        "created_at": now_iso(),
    }
    await db.game_sessions.insert_one(dict(session))
    await db.users.update_one({"_id": u["_id"]}, {"$inc": {"stats.total_entries": bet}})
    return {"session_id": session["id"], "nonce": nonce, "target": body.target,
            "entry_fee": bet, "prize": prize, "auto_win": bool(u.get("force_win"))}


@api.post("/games/fixed/stop")
async def fixed_stop(body: FixedStopReq, user: dict = Depends(get_current_user)):
    session = await db.game_sessions.find_one({"id": body.session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["user_id"] != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Not your session")
    if session["status"] != "active":
        raise HTTPException(status_code=409, detail="Session already completed")
    if session["nonce"] != body.nonce:
        raise HTTPException(status_code=403, detail="Invalid session token")
    if body.elapsed <= 0 or body.elapsed > 120:
        raise HTTPException(status_code=400, detail="Invalid elapsed time")
    server_elapsed = datetime.now(timezone.utc).timestamp() - session["server_start"]
    flagged = abs(server_elapsed - body.elapsed) > LATENCY_BOUND
    recorded = round(body.elapsed, 3)
    diff = round(abs(recorded - session["target"]), 3)
    # WIN: must stop exactly at the target time (matches at 2-decimal display)
    won = round(recorded, 2) == round(session["target"], 2) and not flagged
    prize = session["prize"] if won else 0.0
    # motivational force-win: admin can mark a user to win their next fixed challenge
    force_win = bool(session.get("force_win"))
    if force_win:
        recorded = round(session["target"], 3)
        diff = 0.0
        flagged = False
        won = True
        prize = session["prize"]
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"force_win": False}})

    await db.game_sessions.update_one({"id": session["id"]}, {"$set": {
        "status": "completed", "recorded": recorded, "diff": diff,
        "won": won, "prize_awarded": prize, "flagged": flagged,
        "server_elapsed": round(server_elapsed, 3), "stopped_at": now_iso(),
    }})
    game_record = {
        "id": str(uuid.uuid4()),
        "game_id": "GM" + uuid.uuid4().hex[:10].upper(),
        "user_id": str(user["_id"]),
        "mode": "fixed",
        "target": session["target"],
        "recorded": recorded,
        "diff": diff,
        "entry_fee": session["entry_fee"],
        "prize": prize,
        "result": "won" if won else "lost",
        "flagged": flagged,
        "created_at": now_iso(),
    }
    await db.games.insert_one(dict(game_record))
    inc = {"stats.games_played": 1}
    if won:
        inc["stats.games_won"] = 1
        inc["stats.total_prizes"] = prize
        await credit_wallet(str(user["_id"]), prize, "prize", "main",
                            meta={"mode": "fixed", "game_id": game_record["game_id"]})
    await db.users.update_one({"_id": user["_id"]}, {"$inc": inc})
    await pay_referral_commission(str(user["_id"]), won, session["entry_fee"], prize)
    game_record.pop("_id", None)
    return {"recorded": recorded, "target": session["target"], "diff": diff,
            "won": won, "prize": prize, "flagged": flagged, "game": game_record,
            "wallet": await get_wallet(user)}


def gen_crash_point(house_edge_percent: float, max_mult: float) -> float:
    he = max(0.0, min(0.5, house_edge_percent / 100.0))
    r = random.random()
    if r < he:
        return 1.00
    m = (1.0 - he) / (1.0 - r)
    return round(max(1.01, min(m, max_mult)), 2)


def tower_multipliers(cols: int, bombs: int, rows: int, house_edge_percent: float) -> List[float]:
    safe = max(1, cols - bombs)
    step = cols / safe
    he = max(0.0, min(0.5, house_edge_percent / 100.0))
    out = []
    cur = 1.0
    for _ in range(rows):
        cur *= step
        out.append(round(cur * (1.0 - he), 2))
    return out


@api.post("/games/aviator/start")
async def aviator_start(body: AviatorStartReq, user: dict = Depends(get_current_user)):
    cfg = await get_config()
    ac = cfg.get("aviator_config", {})
    if not cfg["game_enabled"] or not ac.get("enabled", True):
        raise HTTPException(status_code=403, detail="Aviator is currently disabled")
    bet = round(float(body.bet), 2)
    if bet < ac.get("min_bet", 20):
        raise HTTPException(status_code=400, detail=f"Minimum bet is {ac.get('min_bet', 20)} coins")
    if bet > ac.get("max_bet", 5000):
        raise HTTPException(status_code=400, detail=f"Maximum bet is {ac.get('max_bet', 5000)} coins")
    u = await get_user_by_id(str(user["_id"]))
    if u.get("main_balance", 0) + u.get("bonus_balance", 0) < bet:
        raise HTTPException(status_code=400, detail="Insufficient balance for this bet")
    await db.game_sessions.update_many(
        {"user_id": str(user["_id"]), "mode": "aviator", "status": "active", "race_id": None},
        {"$set": {"status": "abandoned"}})
    max_mult = ac.get("max_multiplier", 100)
    force_win = bool(u.get("force_win"))
    crash_point = max_mult if force_win else gen_crash_point(ac.get("house_edge_percent", 5), max_mult)
    nonce = secrets.token_urlsafe(16)
    await debit_wallet(u, bet, "game_entry", meta={"mode": "aviator"})
    if force_win:
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"force_win": False}})
    session = {
        "id": str(uuid.uuid4()),
        "user_id": str(user["_id"]),
        "mode": "aviator",
        "entry_fee": bet,
        "crash_point": crash_point,
        "growth_rate": ac.get("growth_rate", 0.12),
        "nonce": nonce,
        "status": "active",
        "force_win": force_win,
        "server_start": datetime.now(timezone.utc).timestamp(),
        "created_at": now_iso(),
    }
    await db.game_sessions.insert_one(dict(session))
    await db.users.update_one({"_id": u["_id"]}, {"$inc": {"stats.total_entries": bet}})
    return {"session_id": session["id"], "nonce": nonce, "entry_fee": bet,
            "crash_point": crash_point, "growth_rate": session["growth_rate"],
            "max_multiplier": max_mult}


@api.post("/games/aviator/cashout")
async def aviator_cashout(body: AviatorCashoutReq, user: dict = Depends(get_current_user)):
    session = await db.game_sessions.find_one({"id": body.session_id})
    if not session or session["mode"] != "aviator":
        raise HTTPException(status_code=404, detail="Session not found")
    if session["user_id"] != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Not your session")
    if session["status"] != "active":
        raise HTTPException(status_code=409, detail="Round already settled")
    if session["nonce"] != body.nonce:
        raise HTTPException(status_code=403, detail="Invalid session token")
    import math
    k = session.get("growth_rate", 0.12)
    server_elapsed = datetime.now(timezone.utc).timestamp() - session["server_start"]
    server_mult = math.exp(k * (server_elapsed + LATENCY_BOUND))
    claimed = round(float(body.multiplier), 2)
    crash = session["crash_point"]
    mult = min(claimed, round(server_mult, 2))
    mult = max(1.00, mult)
    # plane already gone before the click could have happened (0.6s network grace) -> late claim loses
    already_crashed = math.exp(k * max(0.0, server_elapsed - 0.6)) >= crash
    won = mult < crash and not already_crashed
    prize = round(session["entry_fee"] * mult, 2) if won else 0.0
    cashed = round(mult, 2) if won else 0.0
    if session.get("race_id"):
        import race as _race
        await _race.submit(session, cashed, f"{cashed}×" if won else "Flew away")
        return {"won": won, "multiplier": cashed, "crash_point": None, "prize": 0.0, "race": True}
    await db.game_sessions.update_one({"id": session["id"]}, {"$set": {
        "status": "completed", "cashout_mult": cashed, "crash_point": crash,
        "won": won, "prize_awarded": prize, "stopped_at": now_iso()}})
    game_record = {
        "id": str(uuid.uuid4()),
        "game_id": "GM" + uuid.uuid4().hex[:10].upper(),
        "user_id": str(user["_id"]),
        "mode": "aviator",
        "target": crash,
        "recorded": cashed,
        "diff": 0.0,
        "entry_fee": session["entry_fee"],
        "prize": prize,
        "result": "won" if won else "lost",
        "flagged": False,
        "created_at": now_iso(),
    }
    await db.games.insert_one(dict(game_record))
    inc = {"stats.games_played": 1}
    if won:
        inc["stats.games_won"] = 1
        inc["stats.total_prizes"] = prize
        await credit_wallet(str(user["_id"]), prize, "prize", "main",
                            meta={"mode": "aviator", "game_id": game_record["game_id"], "multiplier": cashed})
    await db.users.update_one({"_id": user["_id"]}, {"$inc": inc})
    await pay_referral_commission(str(user["_id"]), won, session["entry_fee"], prize)
    game_record.pop("_id", None)
    return {"won": won, "multiplier": cashed, "crash_point": crash, "prize": prize,
            "game": game_record, "wallet": await get_wallet(user)}


@api.post("/games/aviator/status")
async def aviator_status(body: AviatorCashoutReq, user: dict = Depends(get_current_user)):
    session = await db.game_sessions.find_one({"id": body.session_id, "mode": "aviator"})
    if not session or session["user_id"] != str(user["_id"]) or session["nonce"] != body.nonce:
        raise HTTPException(status_code=404, detail="Session not found")
    import math
    elapsed = datetime.now(timezone.utc).timestamp() - session["server_start"]
    crashed = session["status"] != "active" or math.exp(session.get("growth_rate", 0.12) * elapsed) >= session["crash_point"]
    hide = session.get("race_id") and session["status"] != "active"
    return {"crashed": crashed, "crash_point": session["crash_point"] if crashed and not hide else None}


@api.post("/games/tower/start")
async def tower_start(body: TowerStartReq, user: dict = Depends(get_current_user)):
    cfg = await get_config()
    tc = cfg.get("tower_config", {})
    if not cfg["game_enabled"] or not tc.get("enabled", True):
        raise HTTPException(status_code=403, detail="Tower is currently disabled")
    diff = body.difficulty if body.difficulty in tc.get("difficulties", {}) else "easy"
    d = tc["difficulties"][diff]
    cols, bombs = d["cols"], d["bombs"]
    rows = tc.get("rows", 8)
    bet = round(float(body.bet), 2)
    if bet < tc.get("min_bet", 20):
        raise HTTPException(status_code=400, detail=f"Minimum bet is {tc.get('min_bet', 20)} coins")
    if bet > tc.get("max_bet", 5000):
        raise HTTPException(status_code=400, detail=f"Maximum bet is {tc.get('max_bet', 5000)} coins")
    u = await get_user_by_id(str(user["_id"]))
    if u.get("main_balance", 0) + u.get("bonus_balance", 0) < bet:
        raise HTTPException(status_code=400, detail="Insufficient balance for this bet")
    await db.game_sessions.update_many(
        {"user_id": str(user["_id"]), "mode": "tower", "status": "active", "race_id": None},
        {"$set": {"status": "abandoned"}})
    force_win = bool(u.get("force_win"))
    bombs_layout = [sorted(random.sample(range(cols), bombs)) for _ in range(rows)]
    mults = tower_multipliers(cols, bombs, rows, tc.get("house_edge_percent", 5))
    nonce = secrets.token_urlsafe(16)
    await debit_wallet(u, bet, "game_entry", meta={"mode": "tower", "difficulty": diff})
    if force_win:
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"force_win": False}})
    session = {
        "id": str(uuid.uuid4()),
        "user_id": str(user["_id"]),
        "mode": "tower",
        "difficulty": diff,
        "cols": cols,
        "bombs": bombs,
        "rows": rows,
        "entry_fee": bet,
        "bombs_layout": bombs_layout,
        "multipliers": mults,
        "current_row": 0,
        "nonce": nonce,
        "status": "active",
        "force_win": force_win,
        "created_at": now_iso(),
    }
    await db.game_sessions.insert_one(dict(session))
    await db.users.update_one({"_id": u["_id"]}, {"$inc": {"stats.total_entries": bet}})
    return {"session_id": session["id"], "nonce": nonce, "entry_fee": bet,
            "difficulty": diff, "cols": cols, "bombs": bombs, "rows": rows,
            "multipliers": mults}


async def _settle_tower(session: dict, user: dict, won: bool, cashed_row: int):
    mults = session["multipliers"]
    mult = mults[cashed_row - 1] if won and cashed_row > 0 else 0.0
    if session.get("race_id"):
        import race as _race
        await _race.submit(session, mult, f"{mult}× · floor {cashed_row}" if won else "Hit a mine")
        return 0.0, round(mult, 2)
    prize = round(session["entry_fee"] * mult, 2) if won else 0.0
    await db.game_sessions.update_one({"id": session["id"]}, {"$set": {
        "status": "completed", "won": won, "prize_awarded": prize,
        "cashed_row": cashed_row, "stopped_at": now_iso()}})
    game_record = {
        "id": str(uuid.uuid4()),
        "game_id": "GM" + uuid.uuid4().hex[:10].upper(),
        "user_id": session["user_id"],
        "mode": "tower",
        "target": session["rows"],
        "recorded": cashed_row,
        "diff": 0.0,
        "entry_fee": session["entry_fee"],
        "prize": prize,
        "result": "won" if won else "lost",
        "flagged": False,
        "created_at": now_iso(),
    }
    await db.games.insert_one(dict(game_record))
    inc = {"stats.games_played": 1}
    if won:
        inc["stats.games_won"] = 1
        inc["stats.total_prizes"] = prize
        await credit_wallet(session["user_id"], prize, "prize", "main",
                            meta={"mode": "tower", "game_id": game_record["game_id"]})
    await db.users.update_one({"_id": ObjectId(session["user_id"])}, {"$inc": inc})
    await pay_referral_commission(session["user_id"], won, session["entry_fee"], prize)
    return prize, round(mult, 2)


@api.post("/games/tower/pick")
async def tower_pick(body: TowerPickReq, user: dict = Depends(get_current_user)):
    session = await db.game_sessions.find_one({"id": body.session_id})
    if not session or session["mode"] != "tower":
        raise HTTPException(status_code=404, detail="Session not found")
    if session["user_id"] != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Not your session")
    if session["status"] != "active":
        raise HTTPException(status_code=409, detail="Game already finished")
    if session["nonce"] != body.nonce:
        raise HTTPException(status_code=403, detail="Invalid session token")
    row = session["current_row"]
    if body.col < 0 or body.col >= session["cols"]:
        raise HTTPException(status_code=400, detail="Invalid tile")
    bombs_row = session["bombs_layout"][row]
    is_bomb = (body.col in bombs_row) and not session.get("force_win")
    if is_bomb:
        prize, _ = await _settle_tower(session, user, won=False, cashed_row=row)
        return {"safe": False, "lost": True, "row": row, "col": body.col,
                "bombs_layout": None if session.get("race_id") else session["bombs_layout"], "prize": 0.0,
                "wallet": await get_wallet(user)}
    new_row = row + 1
    await db.game_sessions.update_one({"id": session["id"]}, {"$set": {"current_row": new_row}})
    mult = session["multipliers"][row]
    finished = new_row >= session["rows"]
    if finished:
        prize, m = await _settle_tower(session, user, won=True, cashed_row=new_row)
        return {"safe": True, "finished": True, "row": new_row, "col": body.col,
                "multiplier": m, "prize": prize, "bombs_layout": None if session.get("race_id") else session["bombs_layout"],
                "wallet": await get_wallet(user)}
    return {"safe": True, "finished": False, "row": new_row, "col": body.col,
            "multiplier": round(mult, 2), "next_multiplier": session["multipliers"][new_row],
            "cashout_value": round(session["entry_fee"] * mult, 2)}


@api.post("/games/tower/cashout")
async def tower_cashout(body: TowerCashoutReq, user: dict = Depends(get_current_user)):
    session = await db.game_sessions.find_one({"id": body.session_id})
    if not session or session["mode"] != "tower":
        raise HTTPException(status_code=404, detail="Session not found")
    if session["user_id"] != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Not your session")
    if session["status"] != "active":
        raise HTTPException(status_code=409, detail="Game already finished")
    if session["nonce"] != body.nonce:
        raise HTTPException(status_code=403, detail="Invalid session token")
    row = session["current_row"]
    if row <= 0:
        raise HTTPException(status_code=400, detail="Clear at least one row before cashing out")
    prize, m = await _settle_tower(session, user, won=True, cashed_row=row)
    return {"won": True, "cashed_row": row, "multiplier": m, "prize": prize,
            "bombs_layout": None if session.get("race_id") else session["bombs_layout"], "wallet": await get_wallet(user)}


@api.get("/games/history")
async def game_history(user: dict = Depends(get_current_user), result: Optional[str] = None):
    q = {"user_id": str(user["_id"])}
    if result:
        q["result"] = result
    return await db.games.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.get("/stats")
async def user_stats(user: dict = Depends(get_current_user)):
    u = await get_user_by_id(str(user["_id"]))
    s = u.get("stats", {})
    played = s.get("games_played", 0)
    won = s.get("games_won", 0)
    return {
        "games_played": played,
        "games_won": won,
        "games_lost": played - won,
        "win_rate": round(won / played * 100, 1) if played else 0.0,
        "total_entries": round(s.get("total_entries", 0), 2),
        "total_prizes": round(s.get("total_prizes", 0), 2),
    }


# ---------------------------------------------------------------------------
# Daily login streak
# ---------------------------------------------------------------------------
def today_str() -> str:
    return datetime.now(timezone.utc).date().isoformat()


@api.get("/streak")
async def get_streak(user: dict = Depends(get_current_user)):
    cfg = await get_config()
    sc = cfg.get("streak_config", {})
    u = await get_user_by_id(str(user["_id"]))
    last = u.get("streak_last_claim")
    return {
        "enabled": sc.get("enabled", True),
        "daily_bonus": sc.get("daily_bonus", 20),
        "streak": u.get("streak_count", 0),
        "can_claim": sc.get("enabled", True) and last != today_str(),
        "last_claim": last,
    }


@api.post("/streak/claim")
async def claim_streak(user: dict = Depends(get_current_user)):
    cfg = await get_config()
    sc = cfg.get("streak_config", {})
    if not sc.get("enabled", True):
        raise HTTPException(status_code=403, detail="Daily rewards are disabled")
    u = await get_user_by_id(str(user["_id"]))
    today = today_str()
    if u.get("streak_last_claim") == today:
        raise HTTPException(status_code=409, detail="Already claimed today")
    yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    streak = u.get("streak_count", 0) + 1 if u.get("streak_last_claim") == yesterday else 1
    bonus = sc.get("daily_bonus", 20)
    await db.users.update_one({"_id": u["_id"]}, {"$set": {"streak_last_claim": today, "streak_count": streak}})
    await credit_wallet(str(user["_id"]), bonus, "bonus", "bonus",
                        meta={"reason": "daily_streak", "streak": streak})
    return {"claimed": True, "streak": streak, "bonus": bonus, "can_claim": False,
            "wallet": await get_wallet(user)}


# ---------------------------------------------------------------------------
# Weekly leaderboard (real winners + auto-changing promotional entries)
# ---------------------------------------------------------------------------
@api.get("/leaderboard/weekly")
async def weekly_leaderboard(user: dict = Depends(get_current_user)):
    cfg = await get_config()
    lc = cfg.get("leaderboard_config", {})
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    agg = await db.games.aggregate([
        {"$match": {"created_at": {"$gte": week_ago}, "prize": {"$gt": 0}}},
        {"$group": {"_id": "$user_id", "coins": {"$sum": "$prize"}}},
        {"$match": {"_id": {"$regex": "^[0-9a-fA-F]{24}$"}}},
        {"$lookup": {
            "from": "users",
            "let": {"uid": {"$toObjectId": "$_id"}},
            "pipeline": [
                {"$match": {"$expr": {"$eq": ["$_id", "$$uid"]}}},
                {"$project": {"display_name": 1, "username": 1, "role": 1}},
            ],
            "as": "user",
        }},
        {"$unwind": "$user"},
        {"$match": {"user.role": {"$ne": "admin"},
                    "user.display_name": {"$not": {"$regex": "^test", "$options": "i"}},
                    "user.username": {"$not": {"$regex": "^test", "$options": "i"}}}},
        {"$sort": {"coins": -1}}, {"$limit": 30},
    ]).to_list(30)
    my_id = str(user["_id"])
    entries = [{
        "name": a["user"].get("display_name") or a["user"].get("username"),
        "coins": round(a["coins"], 2),
        "is_you": a["_id"] == my_id,
    } for a in agg]
    # promotional entries (manual + auto-generated, stable per day)
    if lc.get("enabled", True):
        for e in lc.get("manual_entries", []):
            entries.append({"name": e.get("name", "Player"), "coins": e.get("coins", 0), "is_you": False})
        if lc.get("auto_generate", True):
            rng = random.Random(int(today_str().replace("-", "")))
            pool = lc.get("name_pool", []) or ["Player"]
            k = min(lc.get("fake_count", 8), len(pool))
            for name in rng.sample(pool, k):
                coins = rng.randint(lc.get("min_win", 500), lc.get("max_win", 25000))
                entries.append({"name": name, "coins": round(coins / 50) * 50, "is_you": False})
    entries.sort(key=lambda x: x["coins"], reverse=True)
    return [{"rank": i + 1, **e} for i, e in enumerate(entries[:25])]


# ---------------------------------------------------------------------------
# Multiplayer rooms
# ---------------------------------------------------------------------------
def room_public(room: dict) -> dict:
    r = dict(room)
    r.pop("_id", None)
    real = r.get("participants", [])
    r["current_players"] = len(real)
    # inflated "waiting" count so lobbies feel active (display only; game logic uses real count)
    if r.get("status") in ("OPEN", "FULL") and not r.get("is_custom"):
        if r.get("mode") == "multiplayer":
            seed = r.get("fake_seed") or (6 + (hash(r.get("id", "")) % 9))
            r["display_players"] = min(r["max_players"] - 1, len(real) + seed)
        else:
            humans = len([p for p in real if not p.get("is_bot")])
            r["display_players"] = humans
    else:
        r["display_players"] = r["current_players"]
    r["prize_pool"] = round(r["current_players"] * r["entry_fee"], 2)
    r["players"] = [{"user_id": p["user_id"], "username": p["username"],
                     "submitted": p.get("submitted", False),
                     "recorded": p.get("recorded"), "diff": p.get("diff"),
                     "rank": p.get("rank"), "prize": p.get("prize", 0)}
                    for p in r.get("participants", [])]
    r.pop("participants", None)
    return r


async def create_room(target: float, cfg: dict, mode: str = "multiplayer", entry_fee: float = None) -> dict:
    if mode == "1v1":
        rc = cfg["room_1v1_config"]
        entry_fee = entry_fee if entry_fee is not None else rc["entry_fee"]
        min_players, max_players = 2, 2
        win_multiplier = rc["win_multiplier"]
        duration = rc["room_duration_minutes"]
        platform_fee_percent, num_winners = 0, 1
    else:
        rc = cfg["room_config"]
        entry_fee = entry_fee if entry_fee is not None else rc["entry_fee"]
        min_players, max_players = rc["min_players"], rc["max_players"]
        win_multiplier = None
        duration = rc["room_duration_minutes"]
        platform_fee_percent, num_winners = rc["platform_fee_percent"], rc["num_winners"]
    room = {
        "id": str(uuid.uuid4()),
        "room_code": ("V1" if mode == "1v1" else "RM") + uuid.uuid4().hex[:6].upper(),
        "mode": mode,
        "target": target,
        "entry_fee": entry_fee,
        "min_players": min_players,
        "max_players": max_players,
        "win_multiplier": win_multiplier,
        "platform_fee_percent": platform_fee_percent,
        "num_winners": num_winners,
        "runner_up_percent": rc.get("runner_up_percent", 0),
        "fake_seed": random.randint(6, 14) if mode == "multiplayer" else 0,
        "status": "OPEN",
        "participants": [],
        "join_deadline": (datetime.now(timezone.utc) + timedelta(minutes=duration)).isoformat(),
        "live_deadline": None,
        "winner": None,
        "created_at": now_iso(),
    }
    await db.rooms.insert_one(dict(room))
    return room


@api.get("/rooms")
async def list_rooms(status: Optional[str] = None, mode: str = "multiplayer"):
    q = {"mode": mode, "is_custom": {"$ne": True}}
    if status:
        q["status"] = status.upper()
    else:
        q["status"] = {"$in": ["OPEN", "FULL", "STARTING", "LIVE"]}
    rooms = await db.rooms.find(q).sort("target", 1).to_list(100)
    return [room_public(r) for r in rooms]


@api.get("/rooms/completed")
async def completed_rooms(mode: str = "multiplayer"):
    rooms = await db.rooms.find({"mode": mode, "status": "COMPLETED", "is_custom": {"$ne": True}}) \
        .sort("created_at", -1).to_list(50)
    return [room_public(r) for r in rooms]


@api.get("/rooms/{room_id}")
async def get_room(room_id: str):
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room_public(room)


@api.post("/rooms/{room_id}/join")
async def join_room(room_id: str, user: dict = Depends(get_current_user)):
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room["status"] not in ("OPEN", "FULL"):
        raise HTTPException(status_code=409, detail="Room not open for joining")
    if any(p["user_id"] == str(user["_id"]) for p in room["participants"]):
        raise HTTPException(status_code=409, detail="Already joined this room")
    if len(room["participants"]) >= room["max_players"]:
        raise HTTPException(status_code=409, detail="Room is full")
    u = await get_user_by_id(str(user["_id"]))
    if u.get("main_balance", 0) + u.get("bonus_balance", 0) < room["entry_fee"]:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    await debit_wallet(u, room["entry_fee"], "game_entry",
                       meta={"mode": "room", "room_id": room_id, "target": room["target"]})
    await db.users.update_one({"_id": u["_id"]}, {"$inc": {"stats.total_entries": room["entry_fee"]}})
    participant = {"user_id": str(user["_id"]), "username": u["username"],
                   "joined_at": now_iso(), "submitted": False, "nonce": secrets.token_urlsafe(12)}
    existing = room["participants"]
    humans = [p for p in existing if not p.get("is_bot")]
    # if enough real players now join, drop the placeholder bots so real duel takes over
    if len(humans) + 1 >= room["max_players"]:
        kept = humans + [participant]
    else:
        kept = existing + [participant]
    new_status = "FULL" if len(kept) >= room["max_players"] else room["status"]
    await db.rooms.update_one({"id": room_id},
                              {"$set": {"participants": kept, "status": new_status}})
    updated = await db.rooms.find_one({"id": room_id})
    await manager.broadcast(room_id, {"event": "player_joined", "room": room_public(updated)})
    return room_public(updated)


@api.post("/rooms/custom")
async def create_custom_room(body: CustomRoomReq, user: dict = Depends(get_current_user)):
    mode = body.mode.lower()
    if mode not in ("1v1", "multiplayer"):
        raise HTTPException(status_code=400, detail="Invalid mode")
    min_fee = 50 if mode == "1v1" else 30
    entry_fee = round(float(body.entry_fee), 2)
    if entry_fee < min_fee:
        raise HTTPException(status_code=400, detail=f"Minimum entry for custom {mode} is {min_fee} coins")
    target = round(float(body.target), 2)
    if target < 3 or target > 60:
        raise HTTPException(status_code=400, detail="Target must be between 3 and 60 seconds")
    u = await get_user_by_id(str(user["_id"]))
    if u.get("main_balance", 0) + u.get("bonus_balance", 0) < entry_fee:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    max_players = 2 if mode == "1v1" else 10
    code = ("C1" if mode == "1v1" else "CM") + uuid.uuid4().hex[:5].upper()
    now = datetime.now(timezone.utc)
    room = {
        "id": str(uuid.uuid4()),
        "room_code": code,
        "mode": mode,
        "target": target,
        "entry_fee": entry_fee,
        "min_players": 2,
        "max_players": max_players,
        "win_multiplier": 2 if mode == "1v1" else None,
        "platform_fee_percent": 0,
        "num_winners": 1,
        "runner_up_percent": 0,
        "is_custom": True,
        "host_id": str(user["_id"]),
        "status": "OPEN",
        "participants": [],
        "join_deadline": (now + timedelta(minutes=CUSTOM_ROOM_MINUTES)).isoformat(),
        "live_deadline": None,
        "winner": None,
        "created_at": now_iso(),
    }
    await db.rooms.insert_one(dict(room))
    await debit_wallet(u, entry_fee, "game_entry", meta={"mode": "custom", "room_id": room["id"], "target": target})
    await db.users.update_one({"_id": u["_id"]}, {"$inc": {"stats.total_entries": entry_fee}})
    participant = {"user_id": str(user["_id"]), "username": u["username"],
                   "joined_at": now_iso(), "submitted": False, "nonce": secrets.token_urlsafe(12)}
    await db.rooms.update_one({"id": room["id"]}, {"$push": {"participants": participant}})
    updated = await db.rooms.find_one({"id": room["id"]})
    return room_public(updated)


@api.post("/rooms/join-code")
async def join_by_code(body: JoinCodeReq, user: dict = Depends(get_current_user)):
    code = body.code.strip().upper()
    room = await db.rooms.find_one({"room_code": code, "is_custom": True})
    if not room:
        raise HTTPException(status_code=404, detail="No custom room found for this code")
    if room["status"] not in ("OPEN", "FULL"):
        raise HTTPException(status_code=409, detail="This room is no longer open to join")
    return await join_room(room["id"], user)


@api.post("/rooms/{room_id}/start")
async def host_start_room(room_id: str, user: dict = Depends(get_current_user)):
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if not room.get("is_custom"):
        raise HTTPException(status_code=400, detail="Only custom rooms can be started manually")
    if room.get("host_id") != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Only the host can start the match")
    if room["status"] not in ("OPEN", "FULL"):
        raise HTTPException(status_code=409, detail="Room already started")
    if len(room["participants"]) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 players to start")
    now = datetime.now(timezone.utc)
    live_start = now.timestamp()
    await db.rooms.update_one({"id": room_id}, {"$set": {
        "status": "LIVE", "live_start": live_start,
        "live_deadline": (now + timedelta(seconds=room["target"] + ROOM_EXTRA_SECONDS)).isoformat()}})
    updated = await db.rooms.find_one({"id": room_id})
    await manager.broadcast(room_id, {"event": "started", "room": room_public(updated)})
    return room_public(updated)


@api.post("/rooms/{room_id}/begin")
async def room_begin(room_id: str, user: dict = Depends(get_current_user)):
    room = await db.rooms.find_one({"id": room_id})
    if not room or room["status"] != "LIVE":
        raise HTTPException(status_code=409, detail="Room is not live")
    part = next((p for p in room["participants"] if p["user_id"] == str(user["_id"])), None)
    if not part:
        raise HTTPException(status_code=403, detail="You are not in this room")
    await db.rooms.update_one(
        {"id": room_id, "participants.user_id": str(user["_id"])},
        {"$set": {"participants.$.started_at": datetime.now(timezone.utc).timestamp()}})
    return {"ok": True}


@api.post("/rooms/{room_id}/stop")
async def room_stop(room_id: str, body: RoomStopReq, user: dict = Depends(get_current_user)):
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room["status"] != "LIVE":
        raise HTTPException(status_code=409, detail="Room is not live")
    part = next((p for p in room["participants"] if p["user_id"] == str(user["_id"])), None)
    if not part:
        raise HTTPException(status_code=403, detail="You are not in this room")
    if part.get("submitted"):
        raise HTTPException(status_code=409, detail="Already submitted")
    if body.elapsed <= 0 or body.elapsed > 120:
        raise HTTPException(status_code=400, detail="Invalid elapsed time")
    start_ts = part.get("started_at") or room["live_start"]
    server_elapsed = datetime.now(timezone.utc).timestamp() - start_ts
    flagged = abs(server_elapsed - body.elapsed) > LATENCY_BOUND
    recorded = round(body.elapsed, 3)
    diff = round(abs(recorded - room["target"]), 3)
    await db.rooms.update_one(
        {"id": room_id, "participants.user_id": str(user["_id"])},
        {"$set": {"participants.$.submitted": True, "participants.$.recorded": recorded,
                  "participants.$.diff": diff, "participants.$.flagged": flagged,
                  "participants.$.stopped_at": datetime.now(timezone.utc).timestamp()}})
    updated = await db.rooms.find_one({"id": room_id})
    await manager.broadcast(room_id, {"event": "player_stopped", "room": room_public(updated)})
    # if everyone submitted, finalize early
    if all(p.get("submitted") for p in updated["participants"]):
        await finalize_room(updated)
    return {"recorded": recorded, "diff": diff, "flagged": flagged}


async def finalize_room(room: dict):
    room = await db.rooms.find_one({"id": room["id"]})
    if room["status"] not in ("LIVE",):
        return
    cfg = await get_config()
    participants = room["participants"]
    submitted = [p for p in participants if p.get("submitted") and not p.get("flagged")]
    # rank: smallest diff, tie -> earliest stop
    submitted.sort(key=lambda p: (p["diff"], p.get("stopped_at", float("inf"))))
    gross = len(participants) * room["entry_fee"]
    is_1v1 = room.get("mode") == "1v1"
    if is_1v1:
        # winner gets a fixed multiplier of their entry (e.g. 1.5x)
        prize_pool = round(room["entry_fee"] * (room.get("win_multiplier") or 1.5), 2)
        platform_fee = round(gross - prize_pool, 2)
        num_winners = 1 if submitted else 0
    else:
        platform_fee = gross * room["platform_fee_percent"] / 100.0
        prize_pool = gross - platform_fee
        num_winners = min(room["num_winners"], len(submitted))
    for i, p in enumerate(submitted):
        p["rank"] = i + 1
        p["prize"] = 0.0
    winner_name = None
    if num_winners >= 1 and submitted:
        if num_winners == 1:
            submitted[0]["prize"] = round(prize_pool, 2)
        else:
            share = prize_pool / num_winners
            for i in range(num_winners):
                submitted[i]["prize"] = round(share, 2)
        winner_name = submitted[0]["username"]
    # pay winners and record games
    for p in participants:
        won = p.get("prize", 0) > 0
        if p.get("is_bot"):
            continue  # bots have no wallet/stats
        if won:
            await credit_wallet(p["user_id"], p["prize"], "prize", "main",
                                meta={"mode": "room", "room_id": room["id"]})
        game_record = {
            "id": str(uuid.uuid4()), "game_id": "GM" + uuid.uuid4().hex[:10].upper(),
            "user_id": p["user_id"], "mode": "room", "room_code": room["room_code"],
            "target": room["target"], "recorded": p.get("recorded"),
            "diff": p.get("diff"), "entry_fee": room["entry_fee"],
            "prize": p.get("prize", 0), "rank": p.get("rank"),
            "result": "won" if won else "lost", "created_at": now_iso(),
        }
        await db.games.insert_one(dict(game_record))
        inc = {"stats.games_played": 1}
        if won:
            inc["stats.games_won"] = 1
            inc["stats.total_prizes"] = p["prize"]
        await db.users.update_one({"_id": ObjectId(p["user_id"])}, {"$inc": inc})
        await pay_referral_commission(p["user_id"], won, room["entry_fee"], p.get("prize", 0))
    await db.rooms.update_one({"id": room["id"]}, {"$set": {
        "status": "COMPLETED", "participants": participants,
        "winner": winner_name, "prize_pool": round(prize_pool, 2),
        "platform_fee": round(platform_fee, 2), "completed_at": now_iso(),
    }})
    final = await db.rooms.find_one({"id": room["id"]})
    await manager.broadcast(room["id"], {"event": "completed", "room": room_public(final)})


async def refund_room(room: dict):
    for p in room["participants"]:
        await credit_wallet(p["user_id"], room["entry_fee"], "refund", "main",
                            status="refunded",
                            meta={"reason": "room_cancelled", "room_id": room["id"]})
    await db.rooms.update_one({"id": room["id"]}, {"$set": {
        "status": "REFUNDED", "cancelled_at": now_iso(),
        "cancel_reason": "Minimum players not reached"}})
    final = await db.rooms.find_one({"id": room["id"]})
    await manager.broadcast(room["id"], {"event": "cancelled", "room": room_public(final)})


@api.websocket("/ws/rooms/{room_id}")
async def room_ws(websocket: WebSocket, room_id: str):
    await manager.connect(room_id, websocket)
    try:
        room = await db.rooms.find_one({"id": room_id})
        if room:
            await websocket.send_json({"event": "state", "room": room_public(room)})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
    except Exception:
        manager.disconnect(room_id, websocket)


# ---------------------------------------------------------------------------
# Room manager background loop
# ---------------------------------------------------------------------------
async def room_manager_loop():
    while True:
        try:
            cfg = await get_config()
            now = datetime.now(timezone.utc)
            bot_cfg = cfg.get("bot_config", {})
            error_range = bot_cfg.get("error_range", 0.25)

            # ---- Bot fill: fill rooms that already have a real player ----
            if bot_cfg.get("enabled"):
                fill_rooms = await db.rooms.find({"status": {"$in": ["OPEN", "FULL"]}, "is_custom": {"$ne": True}}).to_list(200)
                for room in fill_rooms:
                    parts = room["participants"]
                    humans = [p for p in parts if not p.get("is_bot")]
                    if not humans:
                        continue
                    if room["mode"] == "1v1" and not bot_cfg.get("fill_1v1", True):
                        continue
                    if room["mode"] == "multiplayer" and not bot_cfg.get("fill_multiplayer", True):
                        continue
                    target_count = 2 if room["mode"] == "1v1" else room["min_players"]
                    if len(parts) >= target_count:
                        continue
                    earliest = min(datetime.fromisoformat(h["joined_at"]) for h in humans)
                    # both modes wait 30s for real players before bots fill in
                    delay = 30
                    if (now - earliest).total_seconds() < delay:
                        continue
                    used = {p["username"] for p in parts}
                    while len(parts) < target_count:
                        name = random.choice([n for n in BOT_NAMES if n not in used] or BOT_NAMES)
                        used.add(name)
                        parts.append({"user_id": "bot_" + uuid.uuid4().hex[:8], "username": name,
                                      "is_bot": True, "joined_at": now_iso(), "submitted": False})
                    new_status = "FULL" if len(parts) >= room["max_players"] else room["status"]
                    upd = {"participants": parts, "status": new_status}
                    # start immediately once the bot fill reaches the required count
                    upd["join_deadline"] = now.isoformat()
                    await db.rooms.update_one({"id": room["id"]}, {"$set": upd})

            # ---- transition OPEN/FULL rooms that are ready (custom rooms are host-started) ----
            open_rooms = await db.rooms.find({"status": {"$in": ["OPEN", "FULL"]}, "is_custom": {"$ne": True}}).to_list(200)
            for room in open_rooms:
                deadline = datetime.fromisoformat(room["join_deadline"])
                ready = len(room["participants"]) >= room["max_players"] or now >= deadline
                if not ready:
                    continue
                if len(room["participants"]) >= room["min_players"]:
                    live_start = datetime.now(timezone.utc).timestamp()
                    parts = room["participants"]
                    # bots stop instantly with a configurable spread around the target
                    for p in parts:
                        if p.get("is_bot") and not p.get("submitted"):
                            rec = max(0.05, round(room["target"] + random.gauss(0, error_range), 3))
                            p["recorded"] = rec
                            p["diff"] = round(abs(rec - room["target"]), 3)
                            p["flagged"] = False
                            p["submitted"] = True
                            p["stopped_at"] = live_start + rec
                    await db.rooms.update_one({"id": room["id"]}, {"$set": {
                        "status": "LIVE", "live_start": live_start, "participants": parts,
                        "live_deadline": (now + timedelta(seconds=room["target"] + ROOM_EXTRA_SECONDS)).isoformat()}})
                    upd = await db.rooms.find_one({"id": room["id"]})
                    await manager.broadcast(room["id"], {"event": "started", "room": room_public(upd)})
                elif now >= deadline:
                    await refund_room(room)

            # ---- expire custom rooms that never started within their window ----
            custom_expired = await db.rooms.find(
                {"status": {"$in": ["OPEN", "FULL"]}, "is_custom": True}).to_list(200)
            for room in custom_expired:
                if now >= datetime.fromisoformat(room["join_deadline"]):
                    await refund_room(room)

            # ---- finalize LIVE rooms (all submitted or window passed) ----
            live_rooms = await db.rooms.find({"status": "LIVE"}).to_list(200)
            for room in live_rooms:
                ld = datetime.fromisoformat(room["live_deadline"]) if room.get("live_deadline") else None
                all_done = room["participants"] and all(p.get("submitted") for p in room["participants"])
                if all_done or (ld and now >= ld):
                    await finalize_room(room)
            # ensure auto rooms exist per duration × entry-fee variant (multiplayer)
            rc = cfg["room_config"]
            mp_fees = rc.get("entry_fees") or [rc.get("entry_fee", 50)]
            for target in ROOM_DURATIONS:
                for fee in mp_fees:
                    exists = await db.rooms.find_one({"mode": "multiplayer", "target": target,
                                                      "entry_fee": fee, "is_custom": {"$ne": True},
                                                      "status": {"$in": ["OPEN", "FULL"]}})
                    if not exists:
                        await create_room(target, cfg, "multiplayer", entry_fee=fee)
            # ensure auto 1v1 rooms exist per duration × entry-fee variant
            v1 = cfg.get("room_1v1_config", {})
            if v1.get("enabled", True):
                v1_fees = v1.get("entry_fees") or [v1.get("entry_fee", 50)]
                for target in ROOM_DURATIONS:
                    for fee in v1_fees:
                        exists = await db.rooms.find_one({"mode": "1v1", "target": target,
                                                          "entry_fee": fee, "is_custom": {"$ne": True},
                                                          "status": {"$in": ["OPEN", "FULL"]}})
                        if not exists:
                            await create_room(target, cfg, "1v1", entry_fee=fee)
        except Exception as e:
            logger.error(f"room loop error: {e}")
        await asyncio.sleep(5)


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------
@api.get("/admin/config")
async def admin_get_config(admin: dict = Depends(require_admin)):
    return await get_config()


class ConfigUpdate(BaseModel):
    data: dict


@api.put("/admin/config")
async def admin_update_config(body: ConfigUpdate, admin: dict = Depends(require_admin)):
    body.data.pop("id", None)
    import games_extra as _gx
    bad = _gx.sanitize_extra_config(body.data)
    if bad:
        raise HTTPException(status_code=400, detail=f"Invalid value for: {', '.join(bad)}")
    await db.config.update_one({"id": "global"}, {"$set": body.data}, upsert=True)
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "admin_id": str(admin["_id"]),
        "action": "update_config", "detail": list(body.data.keys()), "created_at": now_iso()})
    return await get_config()


@api.get("/admin/users")
async def admin_users(admin: dict = Depends(require_admin), search: Optional[str] = None):
    q = {}
    if search:
        q = {"$or": [{"username": {"$regex": search, "$options": "i"}},
                     {"mobile": {"$regex": search, "$options": "i"}},
                     {"display_name": {"$regex": search, "$options": "i"}}]}
    users = await db.users.find(q).sort("created_at", -1).to_list(500)
    return [serialize_user(u) for u in users]


@api.get("/admin/users/{user_id}")
async def admin_user_detail(user_id: str, admin: dict = Depends(require_admin)):
    u = await get_user_by_id(user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    txns = await db.transactions.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    games = await db.games.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    recent = games[:3]
    lost_last_3 = len(recent) == 3 and all(g.get("result") == "lost" for g in recent)
    deposits = await db.deposit_requests.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"user": serialize_user(u), "transactions": txns, "games": games,
            "deposits": deposits, "lost_last_3": lost_last_3,
            "referral_code": u.get("referral_code"), "referred_by": u.get("referred_by"),
            "referral_earnings": u.get("referral_earnings", 0)}


class WalletAdjustReq(BaseModel):
    amount: float
    action: str  # 'add' | 'remove'
    wallet: Optional[str] = "main"


@api.post("/admin/users/{user_id}/wallet")
async def admin_adjust_wallet(user_id: str, body: WalletAdjustReq, admin: dict = Depends(require_admin)):
    u = await get_user_by_id(user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    amt = abs(round(body.amount, 2))
    wallet = body.wallet if body.wallet in ("main", "bonus") else "main"
    if body.action == "add":
        await credit_wallet(user_id, amt, "admin_credit", wallet,
                            meta={"by": str(admin["_id"]), "reason": "admin_adjustment"})
    elif body.action == "remove":
        field = "main_balance" if wallet == "main" else "bonus_balance"
        cur = u.get(field, 0.0)
        take = min(cur, amt)
        before = u.get("main_balance", 0) + u.get("bonus_balance", 0)
        await db.users.update_one({"_id": u["_id"]}, {"$set": {field: cur - take}})
        await record_txn(user_id, "admin_debit", -take, wallet, before, before - take,
                         meta={"by": str(admin["_id"]), "reason": "admin_adjustment"})
    else:
        raise HTTPException(status_code=400, detail="Unknown action")
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "admin_id": str(admin["_id"]),
        "action": f"wallet_{body.action}", "target_user": user_id, "amount": amt, "created_at": now_iso()})
    return {"message": "Wallet updated", "user": serialize_user(await get_user_by_id(user_id))}


class ResetPwReq(BaseModel):
    password: str


@api.post("/admin/users/{user_id}/reset-password")
async def admin_reset_password(user_id: str, body: ResetPwReq, admin: dict = Depends(require_admin)):
    if len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Password too short")
    res = await db.users.update_one({"_id": ObjectId(user_id)},
                                    {"$set": {"password_hash": hash_password(body.password)}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="User not found")
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "admin_id": str(admin["_id"]),
        "action": "reset_password", "target_user": user_id, "created_at": now_iso()})
    return {"message": "Password reset"}


@api.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(require_admin)):
    u = await get_user_by_id(user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete an admin account")
    await db.users.delete_one({"_id": ObjectId(user_id)})
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "admin_id": str(admin["_id"]),
        "action": "delete_user", "target_user": user_id, "created_at": now_iso()})
    return {"message": "User deleted"}


@api.get("/admin/deposits")
async def admin_deposits(admin: dict = Depends(require_admin), status: Optional[str] = None):
    q = {}
    if status:
        q["status"] = status
    return await db.deposit_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)


class DepositAction(BaseModel):
    action: str  # 'approve' | 'reject'
    problem: Optional[str] = None


@api.post("/admin/deposits/{req_id}/action")
async def admin_deposit_action(req_id: str, body: DepositAction, admin: dict = Depends(require_admin)):
    req = await db.deposit_requests.find_one({"req_id": req_id})
    if not req or req["status"] != "pending":
        raise HTTPException(status_code=404, detail="Pending deposit not found")
    if body.action == "approve":
        await credit_wallet(req["user_id"], req["coins"], "deposit", "main",
                            meta={"method": req["method"], "req_id": req_id, "amount": req["amount"]})
        await db.deposit_requests.update_one({"req_id": req_id}, {"$set": {
            "status": "approved", "reviewed_at": now_iso(), "reviewed_by": str(admin["_id"])}})
    elif body.action == "reject":
        await db.deposit_requests.update_one({"req_id": req_id}, {"$set": {
            "status": "rejected", "problem": body.problem or "Payment could not be verified. Please upload a clearer screenshot.",
            "reviewed_at": now_iso(), "reviewed_by": str(admin["_id"])}})
    else:
        raise HTTPException(status_code=400, detail="Unknown action")
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "admin_id": str(admin["_id"]),
        "action": f"deposit_{body.action}", "req_id": req_id, "created_at": now_iso()})
    return {"message": f"Deposit {body.action}d"}


@api.get("/admin/live")
async def admin_live_activity(admin: dict = Depends(require_admin)):
    sessions = await db.game_sessions.find({"status": "active"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for s in sessions:
        try:
            pu = await get_user_by_id(s["user_id"])
            s["player"] = pu.get("display_name") or pu.get("username") if pu else s["user_id"]
        except Exception:
            s["player"] = s.get("user_id")
    live_rooms = await db.rooms.find({"status": {"$in": ["LIVE", "OPEN", "FULL"]}}).sort("created_at", -1).to_list(100)
    return {"active_sessions": sessions, "rooms": [room_public(r) for r in live_rooms]}


class UserActionReq(BaseModel):
    action: str  # suspend, reactivate, flag, verify_kyc, reject_kyc


@api.post("/admin/users/{user_id}/action")
async def admin_user_action(user_id: str, body: UserActionReq, admin: dict = Depends(require_admin)):
    mapping = {
        "suspend": {"status": "suspended"},
        "reactivate": {"status": "active"},
        "flag": {"flagged": True},
        "unflag": {"flagged": False},
        "verify_kyc": {"kyc_status": "verified"},
        "reject_kyc": {"kyc_status": "rejected"},
        "force_win": {"force_win": True},
        "cancel_force_win": {"force_win": False},
    }
    if body.action not in mapping:
        raise HTTPException(status_code=400, detail="Unknown action")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": mapping[body.action]})
    # so it also applies to a game the player is in RIGHT NOW
    if body.action in ("force_win", "cancel_force_win"):
        await db.game_sessions.update_many(
            {"user_id": user_id, "status": "active"},
            {"$set": {"force_win": body.action == "force_win"}})
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "admin_id": str(admin["_id"]),
        "action": body.action, "target_user": user_id, "created_at": now_iso()})
    return serialize_user(await get_user_by_id(user_id))


class BulkActionReq(BaseModel):
    user_ids: List[str]
    action: str  # 'delete' | 'recharge' | 'suspend' | 'reactivate'
    amount: Optional[float] = None


@api.post("/admin/users/bulk")
async def admin_bulk_action(body: BulkActionReq, admin: dict = Depends(require_admin)):
    ids = [i for i in body.user_ids if i]
    done = 0
    for uid in ids:
        u = await get_user_by_id(uid)
        if not u or u.get("role") == "admin":
            continue
        if body.action == "delete":
            await db.users.delete_one({"_id": ObjectId(uid)})
        elif body.action == "recharge" and body.amount:
            await credit_wallet(uid, abs(round(body.amount, 2)), "admin_credit", "main",
                                meta={"by": str(admin["_id"]), "reason": "bulk_recharge"})
        elif body.action in ("suspend", "reactivate"):
            await db.users.update_one({"_id": ObjectId(uid)},
                                      {"$set": {"status": "suspended" if body.action == "suspend" else "active"}})
        else:
            continue
        done += 1
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "admin_id": str(admin["_id"]),
        "action": f"bulk_{body.action}", "count": done, "created_at": now_iso()})
    return {"message": f"{body.action} applied to {done} users", "count": done}


@api.post("/admin/cleanup-test-accounts")
async def admin_cleanup_test_accounts(admin: dict = Depends(require_admin)):
    res = await db.users.delete_many({
        "role": {"$ne": "admin"},
        "$or": [{"display_name": {"$regex": "^test", "$options": "i"}},
                {"full_name": {"$regex": "^test", "$options": "i"}},
                {"username": {"$regex": "^test", "$options": "i"}},
                {"is_test": True}],
    })
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "admin_id": str(admin["_id"]),
        "action": "cleanup_test_accounts", "count": res.deleted_count, "created_at": now_iso()})
    return {"message": f"Removed {res.deleted_count} test accounts", "count": res.deleted_count}


class AdminAccountReq(BaseModel):
    new_password: Optional[str] = None
    new_mobile: Optional[str] = None


@api.post("/admin/account")
async def admin_update_account(body: AdminAccountReq, admin: dict = Depends(require_admin)):
    updates = {}
    if body.new_mobile:
        m = body.new_mobile.strip()
        if not m.isdigit() or len(m) < 10:
            raise HTTPException(status_code=400, detail="Enter a valid mobile number")
        clash = await db.users.find_one({"mobile": m, "_id": {"$ne": admin["_id"]}})
        if clash:
            raise HTTPException(status_code=400, detail="That mobile number is already in use")
        updates["mobile"] = m
    if body.new_password:
        if len(body.new_password) < 4:
            raise HTTPException(status_code=400, detail="Password too short")
        updates["password_hash"] = hash_password(body.new_password)
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.users.update_one({"_id": admin["_id"]}, {"$set": updates})
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "admin_id": str(admin["_id"]),
        "action": "admin_account_update", "fields": list(updates.keys()), "created_at": now_iso()})
    return {"message": "Admin account updated", "mobile": updates.get("mobile", admin.get("mobile"))}



@api.get("/admin/custom-rooms")
async def admin_custom_rooms(admin: dict = Depends(require_admin)):
    rooms = await db.rooms.find({"is_custom": True}).sort("created_at", -1).to_list(200)
    out = []
    for r in rooms:
        rp = room_public(r)
        host = None
        try:
            hu = await get_user_by_id(r.get("host_id"))
            host = hu.get("display_name") or hu.get("username") if hu else None
        except Exception:
            pass
        rp["host_name"] = host
        out.append(rp)
    return out


@api.get("/admin/withdrawals")
async def admin_withdrawals(admin: dict = Depends(require_admin)):
    txns = await db.transactions.find({"type": "withdrawal"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for t in txns:
        try:
            u = await get_user_by_id(t["user_id"])
            if u:
                t["user_name"] = u.get("display_name") or u.get("username")
                t["user_mobile"] = u.get("mobile")
                t["kyc_status"] = u.get("kyc_status")
                t["kyc_data"] = u.get("kyc_data", {})
        except Exception:
            pass
    return txns


class WithdrawalAction(BaseModel):
    action: str  # approve / reject


@api.post("/admin/withdrawals/{txn_id}/action")
async def admin_withdrawal_action(txn_id: str, body: WithdrawalAction, admin: dict = Depends(require_admin)):
    txn = await db.transactions.find_one({"txn_id": txn_id, "type": "withdrawal"})
    if not txn or txn["status"] != "pending":
        raise HTTPException(status_code=404, detail="Pending withdrawal not found")
    if body.action == "approve":
        await db.transactions.update_one({"txn_id": txn_id}, {"$set": {"status": "success"}})
    elif body.action == "reject":
        await credit_wallet(txn["user_id"], abs(txn["amount"]), "refund", "main",
                            status="refunded", meta={"reason": "withdrawal_rejected"})
        await db.transactions.update_one({"txn_id": txn_id}, {"$set": {"status": "rejected"}})
    else:
        raise HTTPException(status_code=400, detail="Unknown action")
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "admin_id": str(admin["_id"]),
        "action": f"withdrawal_{body.action}", "txn_id": txn_id, "created_at": now_iso()})
    return {"message": f"Withdrawal {body.action}d"}


@api.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    total_users = await db.users.count_documents({"role": "user"})
    total_games = await db.games.count_documents({})
    active_rooms = await db.rooms.count_documents({"status": {"$in": ["OPEN", "FULL", "LIVE", "STARTING"]}})
    deposits = await db.transactions.aggregate([
        {"$match": {"type": "deposit"}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    prizes = await db.transactions.aggregate([
        {"$match": {"type": "prize"}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    return {
        "total_users": total_users,
        "total_games": total_games,
        "active_rooms": active_rooms,
        "total_deposits": round(deposits[0]["total"], 2) if deposits else 0,
        "total_prizes_paid": round(prizes[0]["total"], 2) if prizes else 0,
    }


@api.get("/admin/audit-logs")
async def admin_audit_logs(admin: dict = Depends(require_admin)):
    return await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.get("/")
async def root():
    return {"message": "POT24 API", "status": "ok"}


import games_extra  # noqa: E402  (registers Vortex Spin / Chicken Quest / Tower Stack routes)
app.include_router(api)
app.include_router(games_extra.router)
import race  # noqa: E402  (race mode for all games in 1v1 / rooms / friends)
app.include_router(race.router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
async def seed_admin():
    mobile = os.environ.get("ADMIN_MOBILE", "9999999999")
    password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"mobile": mobile})
    if not existing:
        await db.users.insert_one({
            "username": "admin", "mobile": mobile, "password_hash": hash_password(password),
            "display_name": "POT24 Admin", "full_name": "POT24 Admin", "role": "admin", "status": "active",
            "kyc_status": "verified", "main_balance": 0.0, "bonus_balance": 0.0,
            "stats": {"games_played": 0, "games_won": 0, "total_entries": 0.0, "total_prizes": 0.0},
            "created_at": now_iso(),
        })
    elif not verify_password(password, existing["password_hash"]):
        await db.users.update_one({"mobile": mobile}, {"$set": {"password_hash": hash_password(password)}})


@app.on_event("startup")
async def startup():
    # index creation must never crash startup (deploy health check safety)
    try:
        await db.users.drop_index("email_1")
    except Exception:
        pass
    try:
        await db.users.drop_index("mobile_1")
    except Exception:
        pass
    try:
        # partial unique index: only enforce uniqueness on non-empty string mobiles
        # (avoids duplicate-key crash when legacy records have null/empty mobile)
        await db.users.create_index(
            "mobile", unique=True, name="mobile_unique_partial",
            partialFilterExpression={"mobile": {"$type": "string", "$gt": ""}},
        )
    except Exception as e:
        logger.warning(f"mobile index skipped: {e}")
    for coll, field, kwargs in [
        (db.users, "username", {}),
        (db.password_reset_tokens, "expires_at", {}),
        (db.login_attempts, "identifier", {}),
        (db.transactions, "user_id", {}),
        (db.games, "user_id", {}),
        (db.rooms, "status", {}),
    ]:
        try:
            await coll.create_index(field, **kwargs)
        except Exception as e:
            logger.warning(f"index {field} skipped: {e}")
    await seed_admin()
    await get_config()
    # clear stale empty auto-rooms (old durations/fees) so the loop rebuilds the correct grid
    try:
        stale = await db.rooms.find({"status": {"$in": ["OPEN", "FULL"]}, "is_custom": {"$ne": True}}).to_list(500)
        for r in stale:
            if not any(not p.get("is_bot") for p in r.get("participants", [])):
                await db.rooms.delete_one({"id": r["id"]})
    except Exception as e:
        logger.warning(f"stale room cleanup skipped: {e}")
    asyncio.create_task(room_manager_loop())
    asyncio.create_task(games_extra.stack_room_loop())
    asyncio.create_task(race.race_loop())
    logger.info("POT24 API started")


@app.on_event("shutdown")
async def shutdown():
    client.close()
