"""Full Call Break match (5 hands) with 4 real accounts, faster driver than pvp_e2e (2 GETs per step). Logs per-hand totals."""
import sys
import time
import uuid
import requests

API = open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0] + '/api'
USERS = ["8800112233", "8800112244", "8800112255", "8800112266"]


def login(m):
    d = requests.post(API + '/auth/login', json={"mobile": m, "password": "Test@123"}).json()
    return {"Authorization": "Bearer " + (d.get('access_token') or d.get('token'))}


H = [login(m) for m in USERS]
bal0 = [requests.get(API + '/wallet', headers=h).json()['main_balance'] for h in H]
fee = 10 + int(time.time()) % 7
rid = sys.argv[1] if len(sys.argv) > 1 else None
for h in ([] if rid else H):
    r = requests.post(API + '/pvp/quick', headers=h, json={"game": "callbreak", "players": 4, "entry_fee": fee})
    assert r.status_code == 200, r.text
    rid = rid or r.json()['room_id']
    assert r.json()['room_id'] == rid, "not same room"
t0 = time.time()
while requests.get(API + f'/pvp/{rid}', headers=H[0]).json()['room']['status'] not in ('ready', 'playing'):
    time.sleep(0.5)
for h in H:
    requests.post(API + f'/pvp/{rid}/ready', headers=h)
while not requests.get(API + f'/pvp/{rid}', headers=H[0]).json().get('match'):
    time.sleep(0.5)
seats = {requests.get(API + f'/pvp/{rid}', headers=h).json()['my_seat']: i for i, h in enumerate(H)}
hand_no0 = requests.get(API + f'/pvp/{rid}', headers=H[0]).json()['state']['hand_no']
print('room', rid, 'fee', fee, 'seats', seats, flush=True)
hand_no, steps = hand_no0, 0
while time.time() - t0 < 1500:
    v = requests.get(API + f'/pvp/{rid}', headers=H[0]).json()
    st = v['state']
    if st.get('hand_no') != hand_no:
        print('hand', hand_no, 'done; totals now', st['totals'], flush=True)
        hand_no = st['hand_no']
    if v['match']['result']:
        res = v['match']['result']
        views = [requests.get(API + f'/pvp/{rid}', headers=h).json()['match']['result']['winner_names'] for h in H]
        assert all(x == views[0] for x in views)
        print('DONE totals', res['totals'], 'winners', res['winner_names'], 'share', res['share'], 'hands', len(res['hands']), flush=True)
        time.sleep(1)
        print('wallet delta', [round(requests.get(API + '/wallet', headers=h).json()['main_balance'] - b, 2) for h, b in zip(H, bal0)], flush=True)
        break
    me = seats[st['turn']]
    mv = v if me == 0 else requests.get(API + f'/pvp/{rid}', headers=H[me]).json()
    s = mv['state']
    if s['phase'] == 'bid':
        a = {"bid": 2 + (me % 2)}
    elif s['phase'] == 'play' and s.get('legal'):
        c = s['legal'][0]
        a = {"rank": c[0], "suit": c[1]}
    else:
        time.sleep(0.3)
        continue
    r = requests.post(API + f'/pvp/{rid}/action', headers=H[me], json={"version": mv['match']['version'], "action_id": uuid.uuid4().hex, **a})
    if r.status_code not in (200, 409):
        print('ERR', r.status_code, r.text, flush=True)
    steps += 1
print('elapsed', round(time.time() - t0), 'steps', steps, flush=True)
