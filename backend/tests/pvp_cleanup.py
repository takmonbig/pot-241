"""Helper: print active PvP room per test user and leave it if still waiting/ready."""
import requests

API = open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0] + '/api'
USERS = ["8800112233", "8800112244", "8800112255", "8800112266"]

for m in USERS:
    t = requests.post(API + '/auth/login', json={"mobile": m, "password": "Test@123"}).json()
    h = {"Authorization": "Bearer " + (t.get('access_token') or t.get('token'))}
    a = requests.get(API + '/pvp/active', headers=h).json()
    w = requests.get(API + '/wallet', headers=h)
    bal = w.json() if w.status_code == 200 else w.status_code
    if a.get('id'):
        v = requests.get(API + f"/pvp/{a['id']}", headers=h).json()
        st = v['room']['status']
        r = requests.post(API + f"/pvp/{a['id']}/leave", headers=h) if st in ('waiting', 'ready') else None
        print(m, a, st, 'leave', r.status_code if r else '-', 'phase', (v.get('state') or {}).get('phase'))
    else:
        print(m, 'no active room', str(bal)[:150])
