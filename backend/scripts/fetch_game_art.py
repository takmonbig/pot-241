import shutil
import requests
from PIL import Image

B = "https://static.prod-images.emergentagent.com/jobs/1d2db223-cf0e-4ebf-b00c-a47a46100ac9/images/"
IMGS = {
    "ludo": "c9e64201d0086b0de4a68fd5d12848fa651f6af6e4b6a78f3413ad719e761d9f",
    "refer": "41b8fbbd52d9ac2aad118a73dbdb77755bc4c28d927237025dd0c8d59dc492a4",
    "matka": "a75881de37c9e878007aedba2912f4261af01d535c28a8570e612333aa481697",
    "callbreak": "dfad8e72efb074047e61dfd1cf174bcdbd394d1c77f0ff11e80f1028de85dc0b",
    "break10": "e0d947cd80bbcd81f9918d4c6d832cca43b3e06cd50f382180da989f6b3397aa",
    "jackpot": "930a56ad3304c2ac8107e25270c9e85e17e326d29d7358705144f14a94aca00e",
    "teen": "460d1444906811e6a88492292eb0094a5ab50ebe36ba503617313f49c2def4a7",
    "color": "8944b46c47761411f10d416b25e069a42c5350856f3816debf12458e40ef0e45",
    "andar": "3302e8074cf58fd0aaab37a116b11b99641080fea3b6f2dc949a7a8366866a35",
}
OUT = "/app/frontend/public/games/"
for k, h in IMGS.items():
    p = OUT + k + ".jpg"
    open(p, "wb").write(requests.get(B + h + ".jpeg", timeout=60).content)
    im = Image.open(p).convert("RGB")
    im.thumbnail((560, 560))
    im.save(p, quality=82)
for k in ["aviator", "stopwatch", "tower", "chicken", "stack", "vortex"]:
    shutil.copy(f"/app/frontend/public/videos/poster/{k}.jpg", OUT + k + ".jpg")
print("ok")
