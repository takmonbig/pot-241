"""Matka live (matkaapi.com) API tests: markets list, result fetch, bet validation and closed-market 409."""
import requests
import pytest

API = open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0].rstrip('/') + '/api'


@pytest.fixture(scope="module")
def h():
    d = requests.post(API + '/auth/login', json={"mobile": "8800112233", "password": "Test@123"}).json()
    return {"Authorization": "Bearer " + (d.get('access_token') or d.get('token'))}


@pytest.fixture(scope="module")
def mk(h):
    r = requests.get(API + '/matka/markets', headers=h, timeout=40)
    assert r.status_code == 200, r.text
    return r.json()


def test_markets_shape(mk):
    assert len(mk['markets']) > 0
    m = mk['markets'][0]
    for k in ("name", "open_time", "close_time", "open_at", "close_at", "open_bets", "close_bets"):
        assert k in m
    assert m['open_at'].endswith('+05:30')
    assert mk['payout']['jodi'] == 95.0
    print('markets', len(mk['markets']), [x['name'] for x in mk['markets']][:8])


def test_kalyan_result(h):
    r = requests.get(API + '/matka/result/KALYAN', headers=h, timeout=40)
    assert r.status_code == 200
    d = r.json()
    print('KALYAN', d)
    if d['result']:
        assert d['parsed']['open_panna'] is None or len(d['parsed']['open_panna']) == 3


@pytest.mark.parametrize("kind,pick,code", [("jodi", "4", 400), ("jodi", "456", 400), ("open_panna", "12", 400),
                                            ("open_single", "12", 400), ("bogus", "1", 400), ("jodi", "ab", 400)])
def test_pick_validation(h, mk, kind, pick, code):
    name = mk['markets'][0]['name']
    r = requests.post(API + '/matka/bet', headers=h, json={"market": name, "kind": kind, "pick": pick, "amount": 10})
    assert r.status_code == code, r.text


def test_amount_and_unknown_market(h, mk):
    assert requests.post(API + '/matka/bet', headers=h, json={"market": mk['markets'][0]['name'], "kind": "jodi", "pick": "12", "amount": 5}).status_code == 400
    assert requests.post(API + '/matka/bet', headers=h, json={"market": "NO_SUCH_MKT", "kind": "jodi", "pick": "12", "amount": 10}).status_code == 404


def test_closed_market_409(h, mk):
    closed = [m for m in mk['markets'] if not m['close_bets']]
    if not closed:
        pytest.skip("no closed market right now")
    r = requests.post(API + '/matka/bet', headers=h, json={"market": closed[0]['name'], "kind": "close_single", "pick": "1", "amount": 10})
    assert r.status_code == 409


def test_open_market_bet_and_my_bets(h, mk):
    op = [m for m in mk['markets'] if m['open_bets']]
    if not op:
        pytest.skip("no market open for bets now")
    b0 = requests.get(API + '/wallet', headers=h).json()['main_balance']
    r = requests.post(API + '/matka/bet', headers=h, json={"market": op[-1]['name'], "kind": "jodi", "pick": "47", "amount": 10})
    assert r.status_code == 200, r.text
    bet = r.json()['bet']
    assert bet['status'] == 'open' and bet['pick'] == '47'
    assert requests.get(API + '/wallet', headers=h).json()['main_balance'] == b0 - 10
    mine = requests.get(API + '/matka/my-bets', headers=h).json()
    assert any(x['id'] == bet['id'] for x in mine)
