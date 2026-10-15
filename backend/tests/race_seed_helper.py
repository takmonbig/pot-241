"""Helper: create LIVE friends races (P1 host, P2 joined) for UI testing. Usage: python race_seed_helper.py vortex tower stack"""
import os
import sys

import requests

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"


def login(m):
    s = requests.Session()
    d = s.post(f"{API}/auth/login", json={"mobile": m, "password": "Test@123"}).json()
    s.cookies.clear()
    s.headers["Authorization"] = f"Bearer {d.get('access_token') or d.get('token')}"
    return s


s1, s2 = login("8800112233"), login("8800112244")
for g in sys.argv[1:]:
    r = s1.post(f"{API}/race/custom", json={"game": g, "group": False, "entry_fee": 50}).json()
    s2.post(f"{API}/race/join-code", json={"code": r["room_code"]})
    st = s1.post(f"{API}/race/{r['id']}/start").json()
    print(g, r["id"], st["status"])
