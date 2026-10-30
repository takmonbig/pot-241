import requests
API = open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0] + '/api'
def login(m, p):
    d = requests.post(API + '/auth/login', json={"mobile": m, "password": p}).json()
    return {"Authorization": "Bearer " + (d.get('access_token') or d.get('token'))}
U = login("8800112233", "Test@123"); A = login("9999999999", "Admin@123")
s = requests.post(API + '/house/break10/start', headers=U, json={"bet": 10}).json()
print('b10 bad', requests.post(API + '/house/break10/act', headers=U, json={"session_id": s['session_id'], "action": "x"}).status_code)
print('frac', requests.post(API + '/admin/house/control', headers=A, json={"target": "color", "value": 3.7}).status_code)
print('force', requests.post(API + '/admin/house/control', headers=A, json={"target": "aviator", "value": 1.5, "rounds": 2}).status_code)
for i in range(3):
    r = requests.post(API + '/games/aviator/start', headers=U, json={"bet": 20}).json()
    print(' crash', r.get('crash_point'))
h = requests.get(API + '/house/color/state', headers=U).json()['history']
print('seed revealed', bool(h and h[0].get('server_seed')))
print('summary', {k: v for k, v in requests.get(API + '/profile/summary', headers=U).json().items() if k in ('wins', 'losses', 'pushes', 'win_rate')})
