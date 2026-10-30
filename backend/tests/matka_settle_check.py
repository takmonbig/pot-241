"""Helper: set matka override 7, bet jodi 07 + single 7, wait for settlement and print prizes."""
import os
import time
from datetime import datetime, timezone
import requests

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"


def login(m, p):
    s = requests.Session()
    d = s.post(f"{API}/auth/login", json={"mobile": m, "password": p}).json()
    s.cookies.clear()
    s.headers["Authorization"] = f"Bearer {d.get('access_token') or d.get('token')}"
    return s


u, a = login("8800112233", "Test@123"), login("9999999999", "Admin@123")
st = u.get(f"{API}/house/matka/state").json()
lock = datetime.fromisoformat(st["round"]["lock_at"])
if (lock - datetime.now(timezone.utc)).total_seconds() < 3:
    time.sleep((datetime.fromisoformat(st["round"]["ends_at"]) - datetime.now(timezone.utc)).total_seconds() + 3)
    st = u.get(f"{API}/house/matka/state").json()
period = st["round"]["period"]
print("override", a.post(f"{API}/admin/house/control", json={"target": "matka", "value": 7}).json())
print(u.post(f"{API}/house/matka/bet", json={"kind": "jodi", "pick": "07", "amount": 10}).status_code)
print(u.post(f"{API}/house/matka/bet", json={"kind": "single", "pick": "7", "amount": 10}).status_code)
print(u.post(f"{API}/house/matka/bet", json={"kind": "single", "pick": "3", "amount": 10}).status_code)
time.sleep((datetime.fromisoformat(st["round"]["ends_at"]) - datetime.now(timezone.utc)).total_seconds() + 4)
d = u.get(f"{API}/house/matka/state").json()
print("history", [h for h in d["history"] if h["period"] == period])
print("bets", [(b["kind"], b["pick"], b["status"], b["prize"]) for b in d["my_bets"] if b["period"] == period])
