import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
# Fal Universal Key supports queue inference through Emergent proxy, not Platform APIs.
CONTROL_BASE = os.environ.get("INTEGRATION_PROXY_URL", "https://integrations.emergentagent.com").rstrip("/") + "/api/v1/fal"
PUBLIC_QUEUE_BASE = f"{CONTROL_BASE}/queue"
ENDPOINT = "fal-ai/kling-video/v3/standard/text-to-video"
OUT = "/app/frontend/public/videos"

STYLE = " Dark neon casino game UI aesthetic, glossy 3D render, red and gold neon glow, cinematic lighting, smooth motion, no text."
PROMPTS = {
    "stopwatch": "A glowing 3D digital stopwatch counts up, a finger taps a big red STOP button exactly when the timer hits the target, gold coins burst out in celebration.",
    "aviator": "A small red 3D airplane takes off and climbs along a glowing curve over a dark sky while a multiplier rises, then a player cashes out and gold coins rain before the plane flies away.",
    "tower": "A 3D tower of glowing glass tile floors, a hand taps tiles one floor at a time revealing shiny green gems, climbing higher, then one tile reveals a bomb exploding in red sparks.",
    "chicken": "A cute 3D cartoon chicken hops forward across glowing road lanes dodging fire traps, each lane lights up, and it reaches a golden nest that opens to reveal a shining golden egg and coins.",
    "stack": "Colorful glossy 3D blocks slide back and forth and drop onto a growing tower, each one stacking perfectly with a flash, the tower rising higher against a countdown.",
    "vortex": "A glowing 3D spinning wheel with fire, water and earth elemental segments spins fast like a vortex, slows down and lands on a winning segment with a burst of magical energy and coins.",
    "1v1": "Two glowing 3D player avatars face each other on a neon split-screen arena, both race to win, a VS lightning bolt flashes between them and the winner gets a trophy and pile of coins.",
    "rooms": "A neon 3D lobby with many glowing player seats filling up around a central prize pool of gold coins that grows larger, then a crown lands on the top player.",
    "friends": "Friends share a glowing invite code on 3D phones, join the same private neon game room together, play and celebrate as gold coins split among the winners.",
}


def headers(extra=None):
    h = {"Authorization": f"Bearer {EMERGENT_LLM_KEY}", "Content-Type": "application/json"}
    if os.environ.get("job_id"):
        h["X-App-ID"] = h["X-Job-ID"] = os.environ["job_id"]
    if extra:
        h.update(extra)
    return h


def trusted(u):
    c, q = urlparse(u), urlparse(PUBLIC_QUEUE_BASE)
    if c.scheme != q.scheme or c.netloc != q.netloc or not c.path.startswith(q.path.rstrip("/") + "/"):
        raise RuntimeError("untrusted queue url")
    return u


def get_retry(url, deadline):
    for i in range(5):
        try:
            return requests.get(url, headers=headers(), timeout=60)
        except (requests.ConnectTimeout, requests.ReadTimeout, requests.ConnectionError):
            if i == 4 or time.monotonic() > deadline:
                raise
            time.sleep(2 ** i)


def gen(name):
    dest = f"{OUT}/{name}.mp4"
    if os.path.exists(dest):
        return name, "exists"
    payload = {"prompt": PROMPTS[name] + STYLE, "duration": "5", "aspect_ratio": "1:1", "generate_audio": False}
    r = requests.post(f"{CONTROL_BASE}/proxy", headers=headers({"X-Fal-Target-Url": f"https://queue.fal.run/{ENDPOINT}"}), json=payload, timeout=60)
    if r.status_code == 402:
        return name, "insufficient credits"
    r.raise_for_status()
    sub = r.json()
    su, ru = trusted(sub["status_url"]), trusted(sub["response_url"])
    deadline = time.monotonic() + 1200
    while time.monotonic() < deadline:
        s = get_retry(su, deadline)
        s.raise_for_status()
        st = (s.json().get("status") or "").upper()
        if st in {"COMPLETED", "OK"}:
            res = get_retry(ru, deadline)
            res.raise_for_status()
            url = res.json()["video"]["url"]
            with open(dest, "wb") as f:
                f.write(requests.get(url, timeout=120).content)
            return name, "ok"
        if st in {"FAILED", "CANCELLED", "CANCELED", "ERROR"}:
            return name, st
        time.sleep(5)
    return name, "timeout"


def _safe(n):
    try:
        return gen(n)
    except Exception as e:
        return n, f"error {e}"


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or list(PROMPTS)
    with ThreadPoolExecutor(9) as ex:
        for n, st in ex.map(lambda n: _safe(n), names):
            print(n, st, flush=True)
