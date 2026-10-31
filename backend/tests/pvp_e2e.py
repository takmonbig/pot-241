"""E2E: N real accounts play a full PvP match through the public API (no bots)."""
import sys
import time
import requests

API = open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0] + '/api'
USERS = [("8800112233", "Test@123"), ("8800112244", "Test@123"), ("8800112255", "Test@123"), ("8800112266", "Test@123")]


def login(m, p):
    r = requests.post(API + '/auth/login', json={"mobile": m, "password": p})
    if r.status_code != 200:
        requests.post(API + '/auth/register', json={"full_name": "Pvp " + m[-2:], "mobile": m, "password": p})
        r = requests.post(API + '/auth/login', json={"mobile": m, "password": p})
    d = r.json()
    return {"Authorization": "Bearer " + (d.get('access_token') or d.get('token'))}


def main(game, n):
    H = [login(*u) for u in USERS[:n]]
    fee = 10 + int(time.time()) % 7  # unique fee -> fresh room
    rid = None
    for h in H:
        r = requests.post(API + '/pvp/quick', headers=h, json={"game": game, "players": n, "entry_fee": fee})
        assert r.status_code == 200, r.text
        rid = rid or r.json()['room_id']
        assert r.json()['room_id'] == rid
    time.sleep(1.5)
    for h in H:
        print('ready', requests.post(API + f'/pvp/{rid}/ready', headers=h).status_code)
    steps, t0 = 0, time.time()
    while time.time() - t0 < 240:
        views = [requests.get(API + f'/pvp/{rid}', headers=h).json() for h in H]
        v = views[0]
        if v.get('match', {}).get('result'):
            res = [x['match']['result']['winner_names'] for x in views]
            assert all(r == res[0] for r in res), "results differ"
            print('DONE', game, n, 'steps', steps, 'winners', res[0], 'tie', v['match']['result']['tie'])
            return
        if not v.get('match'):
            time.sleep(0.5); continue
        st = v['state']
        turn = st['turn']
        me = next(i for i, x in enumerate(views) if x['my_seat'] == turn)
        mv, s = views[me], views[me]['state']
        if game == 'ludo':
            a = {"type": "roll"} if s['phase'] == 'roll' else {"type": "move", "token": s['movable'][0]}
        elif s['phase'] == 'bid':
            if game == 'callbreak':
                a = {"bid": 2}
            else:
                b = s.get('best_sequence') or {}
                a = {"suit": b['suit'], "length": b['length'], "top": b['top']} if b.get('length', 0) >= 2 else {"pass_": True}
        else:
            c = s['legal'][0]
            a = {"rank": c[0], "suit": c[1]}
        r = requests.post(API + f'/pvp/{rid}/action', headers=H[me], json={"version": mv['match']['version'], "action_id": f"{steps}-{time.time()}", **a})
        if r.status_code not in (200, 409):
            print('ERR', r.status_code, r.text); return
        steps += 1
    print('TIMEOUT', steps)


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]))
