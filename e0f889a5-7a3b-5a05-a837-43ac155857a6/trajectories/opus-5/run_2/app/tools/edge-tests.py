#!/usr/bin/env python3
"""
The contract details the main journey does not touch: reading an order by its
access token as a visitor, an expired token, a variant parameter that names
nothing, entered values surviving a reload, and the derived device states.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASE = os.environ.get('BASE', 'http://localhost:4173')
DB = os.environ['DATABASE_URL']
PASSWORD = 'deku-demo-pw-2026'

passed = 0
failed = 0


def report(ok, name, detail=''):
    global passed, failed
    if ok:
        passed += 1
        print(f'  ok   {name}')
    else:
        failed += 1
        print(f'  FAIL {name} {detail}')


def sql(query):
    return subprocess.run(['psql', DB, '-tAc', query],
                          capture_output=True, text=True).stdout.strip()


def call(method, path, body=None, headers=None, cookies=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f'{BASE}{path}', data=data, method=method)
    if data:
        req.add_header('content-type', 'application/json')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    if cookies:
        req.add_header('cookie', '; '.join(f'{k}={v}' for k, v in cookies.items()))
    try:
        with urllib.request.urlopen(req) as res:
            payload = res.read()
            return res.status, (payload.decode() if raw else json.loads(payload or b'{}'))
    except urllib.error.HTTPError as e:
        payload = e.read()
        if raw:
            return e.code, payload.decode('utf8', 'replace')
        try:
            return e.code, json.loads(payload or b'{}')
        except Exception:
            return e.code, {}


print('--- an order read by its access token, as a visitor ---')
# A whole guest checkout, then read the order back with no session at all.
_, cart = call('POST', '/api/cart/lines', {'sku': 'VELA-CABLE-2M', 'quantity': 1})
cookies = {'vela_cart': cart['token']}
call('POST', '/api/cart/delivery', {
    'email': 'token-reader@example.com',
    'shipping_address': {'name': 'Reader', 'line1': '9 Test Row', 'city': 'Portland',
                         'region': 'OR', 'postal_code': '97204', 'country': 'US'},
    'shipping_method': 'standard',
}, cookies=cookies)
status, order = call('POST', '/api/orders', {},
                     {'idempotency-key': f'token-{os.getpid()}'}, cookies=cookies)
number = order['number']
token = order['access_token']
report(bool(token), 'placing returns an access token')

status, byToken = call('GET', f'/api/orders/{number}?access_token={token}')
report(status == 200 and byToken['number'] == number,
       'a visitor reads the order with its token', f'{status}')

# Without the token it is not found, never forbidden.
status, without = call('GET', f'/api/orders/{number}')
report(status == 404, 'the same order without a token is not found', f'{status}')
report(without.get('error', {}).get('code') == 'not_found',
       'and it reads as not found rather than forbidden',
       without.get('error', {}).get('code'))

# A wrong token is refused too.
status, _ = call('GET', f'/api/orders/{number}?access_token=not-the-token')
report(status == 404, 'a wrong access token is refused', f'{status}')

# The page itself renders for a visitor holding the token.
status, html = call('GET', f'/orders/{number}?access_token={token}', raw=True)
report(status == 200 and number in html,
       'the order page renders for a visitor holding the token')
report('is confirmed. We have emailed token-reader@example.com.' in html,
       'the page names the address the confirmation went to')

print()
print('--- an expired token ---')
tok = call('POST', '/api/auth/login',
           {'email': 'customer@example.com', 'password': PASSWORD})[1]['access_token']
status, _ = call('GET', '/api/account/devices', headers={'authorization': f'Bearer {tok}'})
report(status == 200, 'the fresh token works')

# Expire it in the store, exactly as time would.
import hashlib
digest = hashlib.sha256(tok.encode()).hexdigest()
sql(f"UPDATE auth_token SET expires_at = now() - interval '1 hour' WHERE token_hash = '{digest}'")

before = sql("SELECT count(*) FROM device_ownership WHERE released_at IS NULL")
status, body = call('POST', '/api/account/devices', {'serial': 'VA2609KTMHX4'},
                    {'authorization': f'Bearer {tok}'})
after = sql("SELECT count(*) FROM device_ownership WHERE released_at IS NULL")
report(status == 401, 'an expired token is refused', f'{status}')
report(before == after, 'and it mutated nothing', f'{before} -> {after}')

# The browser surface sends it back to sign-in rather than rendering the account.
status, html = call('GET', '/account/cameras', cookies={'vela_session': tok}, raw=True)
report(status in (302, 200) and ('sign-in' in html.lower() or status == 302),
       'an expired session lands on sign-in', f'{status}')

print()
print('--- a variant parameter that names nothing ---')
status, body = call('GET', '/api/products/compact?variant=NOT-A-REAL-SKU')
report(status == 200, 'the product still renders', f'{status}')
report(body['selected_sku'] == 'VELA-CRICKET-GRAPHITE',
       'it falls back to the default variant', body.get('selected_sku'))

status, html = call('GET', '/shop/compact?variant=NOT-A-REAL-SKU', raw=True)
report(status == 200 and 'Vela Cricket' in html,
       'the page renders rather than erroring')

print()
print('--- entered values survive a reload ---')
_, c2 = call('POST', '/api/cart/lines', {'sku': 'VELA-CASE-STD', 'quantity': 1})
ck = {'vela_cart': c2['token']}
call('POST', '/api/cart/delivery', {
    'email': 'persist@example.com',
    'shipping_address': {'name': 'Persist', 'line1': '11 Memory Lane', 'city': 'Portland',
                         'region': 'OR', 'postal_code': '97204', 'country': 'US'},
}, cookies=ck)
status, html = call('GET', '/checkout/where-it-goes', cookies=ck, raw=True)
for value in ['persist@example.com', 'Persist', '11 Memory Lane', '97204']:
    report(value in html, f'{value!r} survives a reload of step one')

call('POST', '/api/cart/delivery', {'shipping_method': 'express'}, cookies=ck)
status, html = call('GET', '/checkout/how-it-gets-there', cookies=ck, raw=True)
report('value="express"' in html and 'checked' in html,
       'the chosen delivery method survives a reload of step two')

print()
print('--- derived device states ---')
tok = call('POST', '/api/auth/login',
           {'email': 'customer@example.com', 'password': PASSWORD})[1]['access_token']
sql("UPDATE device SET firmware_version='7.0' WHERE serial='VC2609PVDA7Q'")
status, devices = call('GET', '/api/account/devices',
                       headers={'authorization': f'Bearer {tok}'})
cricket = next((d for d in devices['data'] if d['serial'] == 'VC2609PVDA7Q'), None)
report(cricket is not None, 'the seeded camera is listed')
report(cricket and cricket['update_available'] is True,
       'a camera behind the latest firmware reads as having an update',
       str(cricket))
report(cricket and cricket['latest_firmware'] == '7.2',
       'and it names the latest general image', cricket and cricket['latest_firmware'])

# A camera never heard from has no update, rather than a false one.
sql("UPDATE device SET firmware_version=NULL, firmware_reported_at=NULL WHERE serial='VC2609PVDA7Q'")
status, devices = call('GET', '/api/account/devices',
                       headers={'authorization': f'Bearer {tok}'})
cricket = next((d for d in devices['data'] if d['serial'] == 'VC2609PVDA7Q'), None)
report(cricket and cricket['update_available'] is False,
       'a camera never heard from does not claim an update')
sql("UPDATE device SET firmware_version='7.0', firmware_reported_at=now() WHERE serial='VC2609PVDA7Q'")

print()
print('--- renaming and releasing ---')
status, renamed = call('PATCH', '/api/account/devices/VC2609PVDA7Q',
                       {'nickname': 'The one in the bag'},
                       {'authorization': f'Bearer {tok}'})
report(status == 200 and renamed['nickname'] == 'The one in the bag',
       'a camera can be renamed', f'{status}')

# Another customer cannot rename it.
tok2 = call('POST', '/api/auth/login',
            {'email': 'customer2@example.com', 'password': PASSWORD})[1]['access_token']
status, _ = call('PATCH', '/api/account/devices/VC2609PVDA7Q',
                 {'nickname': 'Mine now'}, {'authorization': f'Bearer {tok2}'})
report(status == 404, "another customer cannot rename it, and it reads as not found", f'{status}')
still = sql("SELECT nickname FROM device WHERE serial='VC2609PVDA7Q'")
report(still == 'The one in the bag', 'and the name is unchanged', still)

# Releasing ends the link and grants it to nobody.
status, released = call('DELETE', '/api/account/devices/VC2609PVDA7Q',
                        headers={'authorization': f'Bearer {tok}'})
report(status == 200 and released.get('owner') is None,
       'releasing grants the camera to nobody', f'{status} {released}')
live = sql("SELECT count(*) FROM device_ownership o JOIN device d ON d.id=o.device_id "
           "WHERE d.serial='VC2609PVDA7Q' AND o.released_at IS NULL")
report(live == '0', 'no live ownership row remains', live)
closed = sql("SELECT count(*) FROM device_ownership o JOIN device d ON d.id=o.device_id "
             "WHERE d.serial='VC2609PVDA7Q' AND o.released_at IS NOT NULL")
report(closed == '1', 'the old link is closed rather than deleted', closed)

# It can then be registered by somebody else, which is the point of releasing.
status, _ = call('POST', '/api/account/devices', {'serial': 'VC2609PVDA7Q'},
                 {'authorization': f'Bearer {tok2}'})
report(status == 201, 'a released camera can be registered by another account', f'{status}')

print()
print('--- signup ---')
fresh = f'new-{os.getpid()}@example.com'
status, created = call('POST', '/api/auth/signup',
                       {'email': fresh, 'password': 'a-good-password-1', 'name': 'New Person'})
report(status == 201 and created.get('access_token'), 'signup returns a token', f'{status}')
status, me = call('GET', '/api/auth/me',
                  headers={'authorization': f"Bearer {created['access_token']}"})
report(status == 200 and me['customer']['email'] == fresh,
       'the new token identifies the new account')
status, empty = call('GET', '/api/account/devices',
                     headers={'authorization': f"Bearer {created['access_token']}"})
report(status == 200 and empty['data'] == [],
       'a new account holds no cameras', str(empty.get('data'))[:80])

print()
print(f'passed {passed}, failed {failed}')
sys.exit(1 if failed else 0)
