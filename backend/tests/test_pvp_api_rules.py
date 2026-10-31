"""PvP API rule tests (iteration 17): turn/version/illegal-card/sequence validation, privacy, leave refunds,
duplicate action ids, tie refunds, winner credit, Ludo dice rules. Uses 4 real test accounts via the public URL;
DB is only touched to fast-forward long matches to their end."""
import os
import time
import uuid

import pymongo
import pytest
import requests
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
BASE = open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0].rstrip('/')
API = BASE + '/api'
USERS = ["8800112233", "8800112244", "8800112255", "8800112266"]
DB = pymongo.MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]


def login(m):
    d = requests.post(API + '/auth/login', json={"mobile": m, "password": "Test@123"}).json()
    return {"Authorization": "Bearer " + (d.get('access_token') or d.get('token'))}


@pytest.fixture(scope="module")
def H():
    return [login(m) for m in USERS]


def bal(h):
    return requests.get(API + '/wallet', headers=h).json()['main_balance']


def view(rid, h):
    return requests.get(API + f'/pvp/{rid}', headers=h).json()


def act(rid, h, v, **a):
    return requests.post(API + f'/pvp/{rid}/action', headers=h, json={"version": v, "action_id": uuid.uuid4().hex, **a})


def wait(cond, secs=30):
    t0 = time.time()
    while time.time() - t0 < secs:
        r = cond()
        if r:
            return r
        time.sleep(0.7)
    return None


def start_private(H, game, n, fee):
    r = requests.post(API + '/pvp/create', headers=H[0], json={"game": game, "players": n, "entry_fee": fee, "private": True})
    assert r.status_code == 200, r.text
    rid, code = r.json()['room_id'], r.json()['code']
    for h in H[1:n]:
        j = requests.post(API + '/pvp/join', headers=h, json={"code": code})
        assert j.status_code == 200, j.text
    assert wait(lambda: view(rid, H[0])['room']['status'] == 'ready')
    for h in H[:n]:
        assert requests.post(API + f'/pvp/{rid}/ready', headers=h).status_code == 200
    assert wait(lambda: view(rid, H[0]).get('match'))
    return rid


# ---------- leave / refund ----------
class TestLeave:
    def test_leave_before_start_refunds(self, H):
        b0 = bal(H[0])
        r = requests.post(API + '/pvp/create', headers=H[0], json={"game": "ludo", "players": 2, "entry_fee": 10, "private": True})
        rid = r.json()['room_id']
        assert bal(H[0]) == b0 - 10
        v = view(rid, H[0])
        assert v['room']['private'] is True and v['room']['code'].startswith('P')
        assert requests.post(API + f'/pvp/{rid}/leave', headers=H[0]).status_code == 200
        assert bal(H[0]) == b0
        assert requests.get(API + '/pvp/active', headers=H[0]).json() == {}

    def test_one_active_room_per_user(self, H):
        rid = requests.post(API + '/pvp/create', headers=H[0], json={"game": "ludo", "players": 2, "entry_fee": 10, "private": True}).json()['room_id']
        r = requests.post(API + '/pvp/quick', headers=H[0], json={"game": "callbreak", "players": 4, "entry_fee": 10})
        assert r.status_code == 409 and 'already in a' in r.json()['detail']
        requests.post(API + f'/pvp/{rid}/leave', headers=H[0])

    def test_outsider_leave_on_ready_room_gives_no_refund(self, H):
        """A non-member calling /leave on a room in 'ready' status must not be credited."""
        r = requests.post(API + '/pvp/create', headers=H[0], json={"game": "ludo", "players": 2, "entry_fee": 10, "private": True})
        rid, code = r.json()['room_id'], r.json()['code']
        requests.post(API + '/pvp/join', headers=H[1], json={"code": code})
        assert wait(lambda: view(rid, H[0])['room']['status'] == 'ready')
        b2 = bal(H[2])
        lr = requests.post(API + f'/pvp/{rid}/leave', headers=H[2])
        after = bal(H[2])
        for h in H[:2]:
            requests.post(API + f'/pvp/{rid}/leave', headers=h)
        assert after == b2, f"outsider got refunded {after - b2} (leave status {lr.status_code})"

    def test_invalid_game_and_fee(self, H):
        assert requests.post(API + '/pvp/quick', headers=H[0], json={"game": "callbreak", "players": 2, "entry_fee": 10}).status_code == 400
        assert requests.post(API + '/pvp/quick', headers=H[0], json={"game": "ludo", "players": 2, "entry_fee": 5}).status_code == 400
        assert requests.post(API + '/pvp/join', headers=H[0], json={"code": "ZZZZZZ"}).status_code == 404


# ---------- break10 rules + tie refund ----------
class TestBreak10Rules:
    def test_rules_privacy_and_tie_refund(self, H):
        b0 = [bal(h) for h in H]
        rid = start_private(H, "break10", 4, 10)
        views = [view(rid, h) for h in H]
        seats = {v['my_seat']: i for i, v in enumerate(views)}
        v0 = views[0]
        # privacy: only own hand, counts for others
        import json
        for v in views:
            assert len(v['state']['hand']) == 13 and v['state']['counts'] == [13] * 4
            assert 'hands' not in v['state'] and 'owner10' not in v['state'] and 'dealt' not in v['state']
            others = [views[j]['state']['hand'] for j in range(4) if views[j] is not v]
            txt = json.dumps(v)
            assert 'hands' not in txt
        turn = v0['state']['turn']
        cur = seats[turn]
        ver = v0['match']['version']
        other = seats[(turn + 1) % 4]
        assert act(rid, H[other], ver, pass_=True).status_code == 409          # wrong turn
        assert act(rid, H[cur], ver - 1, pass_=True).status_code == 409        # outdated version
        hand = views[cur]['state']['hand']
        have = {(c[0], c[1]) for c in hand}
        bad = next((s, t) for s in "SHDC" for t in range(14, 3, -1) if not all((t - k, s) in have for k in range(3)))
        r = act(rid, H[cur], ver, suit=bad[0], length=3, top=bad[1])
        assert r.status_code == 400 and 'not in your hand' in r.json()['detail']
        # duplicate action id is ignored
        aid = "dup-" + uuid.uuid4().hex
        r1 = requests.post(API + f'/pvp/{rid}/action', headers=H[cur], json={"version": ver, "action_id": aid, "pass_": True})
        assert r1.status_code == 200
        v1 = view(rid, H[0])['match']['version']
        r2 = requests.post(API + f'/pvp/{rid}/action', headers=H[cur], json={"version": v1, "action_id": aid, "pass_": True})
        assert r2.status_code == 200 and r2.json()['event'] == 'duplicate'
        assert view(rid, H[0])['match']['version'] == v1
        # finish bidding + play, test an illegal (not following suit) card once
        illegal_tested = False
        tie_forced = False
        for _ in range(400):
            v = view(rid, H[0])
            if v['match']['result']:
                break
            st = v['state']
            if st['phase'] == 'play' and st['trick_no'] == 12 and not st['trick'] and not tie_forced:
                DB.pvp_matches.update_one({"id": v['match']['id']}, {"$set": {"state.points": [0, 0], "state.captured": ["10S", "10H", "10D", "10C"]}})
                tie_forced = True
            me = seats[st['turn']]
            mv = view(rid, H[me])
            s = mv['state']
            if s['phase'] == 'bid':
                b = s.get('best_sequence') or {}
                a = {"suit": b['suit'], "length": b['length'], "top": b['top']} if b.get('length', 0) >= 2 else {"pass_": True}
            else:
                if not illegal_tested and s['trick']:
                    ill = [c for c in s['hand'] if c not in s['legal']]
                    if ill:
                        r = act(rid, H[me], mv['match']['version'], rank=ill[0][0], suit=ill[0][1])
                        assert r.status_code == 400, r.text
                        illegal_tested = True
                c = s['legal'][0]
                a = {"rank": c[0], "suit": c[1]}
            act(rid, H[me], mv['match']['version'], **a)
        res = view(rid, H[0])['match']['result']
        assert res, "match not finished"
        assert illegal_tested
        assert res['tie'] is True and res['winners'] == []
        time.sleep(1)
        assert [bal(h) for h in H] == b0, "tie should refund everyone"


# ---------- ludo rules + winner credit ----------
class TestLudo:
    def test_ludo_dice_movable_and_winner_credit(self, H):
        b0 = [bal(h) for h in H[:2]]
        r = requests.post(API + '/pvp/quick', headers=H[0], json={"game": "ludo", "players": 2, "entry_fee": 11})
        rid = r.json()['room_id']
        r2 = requests.post(API + '/pvp/quick', headers=H[1], json={"game": "ludo", "players": 2, "entry_fee": 11})
        assert r2.json()['room_id'] == rid
        assert wait(lambda: view(rid, H[0])['room']['status'] == 'ready')
        for h in H[:2]:
            requests.post(API + f'/pvp/{rid}/ready', headers=h)
        assert wait(lambda: view(rid, H[0]).get('match'))
        v = view(rid, H[0])
        assert v['state']['colors'] == ['red', 'yellow']
        seats = {view(rid, h)['my_seat']: i for i, h in enumerate(H[:2])}
        for _ in range(16):
            v = view(rid, H[0]); st = v['state']
            me = seats[st['turn']]
            mv, o = view(rid, H[me]), view(rid, H[1 - me])
            s = mv['state']
            if mv['match']['version'] != o['match']['version']:
                continue
            assert 'movable' not in o['state']  # only the current player sees movable
            col = s['colors'][mv['my_seat']]
            if s['phase'] == 'roll':
                r = act(rid, H[me], mv['match']['version'], type="roll")
                assert r.status_code == 200, r.text
                last = view(rid, H[me])['state']['last']
                assert 1 <= last['roll'] <= 6
                if all(p == -1 for p in s['tokens'][col]) and last['roll'] != 6:
                    assert r.json()['event'] == 'no move'  # 6 needed to leave base
            else:
                assert s['movable']
                if all(p == -1 for p in s['tokens'][col]):
                    assert s['roll'] == 6
                act(rid, H[me], mv['match']['version'], type="move", token=s['movable'][0])
        # fast-forward: put seat 0 (red) one step from home on all tokens
        mid = view(rid, H[0])['match']['id']
        DB.pvp_matches.update_one({"id": mid}, {"$set": {"state.tokens.red": [56, 56, 56, 55], "state.tokens.yellow": [-1, -1, -1, -1]}})
        win_seat = 0
        for _ in range(300):
            v = view(rid, H[0])
            if v['match']['result']:
                break
            st = v['state']
            me = seats[st['turn']]
            mv = view(rid, H[me])
            s = mv['state']
            a = {"type": "roll"} if s['phase'] == 'roll' else {"type": "move", "token": s['movable'][0]}
            act(rid, H[me], mv['match']['version'], **a)
        res = view(rid, H[0])['match']['result']
        assert res and res['winners'] == [win_seat] and res['share'] == round(22 * 0.9, 2)
        time.sleep(1)
        wi = seats[win_seat]
        assert bal(H[wi]) == round(b0[wi] - 11 + 19.8, 2)
        assert bal(H[1 - wi]) == b0[1 - wi] - 11
        hist = requests.get(API + '/pvp/history?game=ludo', headers=H[wi]).json()
        assert hist[0]['won'] is True


# ---------- admin ----------
def test_admin_matches():
    d = requests.post(API + '/auth/login', json={"mobile": "9999999999", "password": "Admin@123"}).json()
    h = {"Authorization": "Bearer " + (d.get('access_token') or d.get('token'))}
    r = requests.get(API + '/admin/pvp/matches', headers=h)
    assert r.status_code == 200 and 'matches' in r.json() and 'counts' in r.json()
    assert requests.get(API + '/admin/pvp/matches', headers=login(USERS[0])).status_code in (401, 403)
