#!/usr/bin/env python3
"""
The single-winner rules, driven under real concurrency rather than in sequence.

Each test fires genuinely simultaneous requests and asserts that exactly one
won, that the loser was refused with a 409 naming the resource, and that the
store itself holds no second row behind the first.
"""
import json
import os
import subprocess
import sys
import threading
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
    out = subprocess.run(['psql', DB, '-tAc', query], capture_output=True, text=True)
    return out.stdout.strip()


def call(method, path, body=None, headers=None, cookies=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f'{BASE}{path}', data=data, method=method)
    req.add_header('content-type', 'application/json')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    if cookies:
        req.add_header('cookie', '; '.join(f'{k}={v}' for k, v in cookies.items()))
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read() or b'{}')
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b'{}')
        except Exception:
            return e.code, {'raw': raw.decode('utf8', 'replace')}


def login(email):
    _, body = call('POST', '/api/auth/login', {'email': email, 'password': PASSWORD})
    return body['access_token']


def race(fn, n=2):
    """Fire n calls at the same instant and collect their outcomes."""
    results = [None] * n
    barrier = threading.Barrier(n)

    def run(i):
        barrier.wait()
        results[i] = fn(i)

    threads = [threading.Thread(target=run, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


print('--- two simultaneous registrations of one serial ---')
# Free the seeded sold device so both racers see it unowned.
sql("DELETE FROM device_ownership WHERE device_id = (SELECT id FROM device WHERE serial='VA2609KTMHX4')")
sql("UPDATE device SET status='sold' WHERE serial='VA2609KTMHX4'")

tok_a = login('customer@example.com')
tok_b = login('customer2@example.com')

outcomes = race(lambda i: call(
    'POST', '/api/account/devices', {'serial': 'VA2609KTMHX4'},
    {'authorization': f'Bearer {tok_a if i == 0 else tok_b}'},
), 2)

statuses = sorted(s for s, _ in outcomes)
live_rows = sql("SELECT count(*) FROM device_ownership o JOIN device d ON d.id=o.device_id "
                "WHERE d.serial='VA2609KTMHX4' AND o.released_at IS NULL")
report(statuses == [201, 409], 'exactly one registration wins, the other is refused', f'statuses={statuses}')
report(live_rows == '1', 'the store holds exactly one live ownership row', f'rows={live_rows}')
loser = next((b for s, b in outcomes if s == 409), {})
report('resource' in loser.get('error', {}), 'the loser names the resource already taken', str(loser)[:160])

print()
print('--- two concurrent checkouts for the last VELA-A1-YELLOW ---')
sql("UPDATE inventory_level SET available=1, committed=0 "
    "WHERE variant_id=(SELECT id FROM variant WHERE sku='VELA-A1-YELLOW')")


def checkout(i):
    """A whole guest checkout in its own cart, racing on the last unit."""
    status, cart = call('POST', '/api/cart/lines', {'sku': 'VELA-A1-YELLOW', 'quantity': 1})
    token = cart['token']
    cookies = {'vela_cart': token}
    call('POST', '/api/cart/delivery', {
        'email': f'race{i}@example.com',
        'shipping_address': {'name': f'Racer {i}', 'line1': '1 Test Row', 'city': 'Portland',
                             'region': 'OR', 'postal_code': '97204', 'country': 'US'},
        'shipping_method': 'standard',
    }, cookies=cookies)
    return token, cookies


prepared = [checkout(0), checkout(1)]

results = race(lambda i: call(
    'POST', '/api/orders', {}, {'idempotency-key': f'race-key-{i}-{os.getpid()}'},
    cookies=prepared[i][1],
), 2)

statuses = sorted(s for s, _ in results)
report(statuses == [201, 409], 'one checkout wins, the other is refused', f'statuses={statuses}')

avail = sql("SELECT available FROM inventory_level WHERE variant_id="
            "(SELECT id FROM variant WHERE sku='VELA-A1-YELLOW')")
committed = sql("SELECT committed FROM inventory_level WHERE variant_id="
                "(SELECT id FROM variant WHERE sku='VELA-A1-YELLOW')")
report(avail == '0', 'available fell to zero and never below', f'available={avail}')
report(committed == '1', 'committed rose by exactly one', f'committed={committed}')

loser = next((b for s, b in results if s == 409), {})
report('sold out' in json.dumps(loser).lower() or 'stock' in json.dumps(loser).lower(),
       'the loser is told the stock ran out', str(loser)[:160])

# The loser was rejected before any invoice existed.
race_orders = sql("SELECT count(*) FROM \"order\" WHERE email LIKE 'race%@example.com'")
report(race_orders == '1', 'exactly one order row exists for the race', f'orders={race_orders}')

print()
print('--- the same order submitted twice with one Idempotency-Key ---')
_, cart = call('POST', '/api/cart/lines', {'sku': 'VELA-CABLE-1M', 'quantity': 1})
cookies = {'vela_cart': cart['token']}
call('POST', '/api/cart/delivery', {
    'email': 'idem@example.com',
    'shipping_address': {'name': 'Idem', 'line1': '2 Test Row', 'city': 'Portland',
                         'region': 'OR', 'postal_code': '97204', 'country': 'US'},
    'shipping_method': 'standard',
}, cookies=cookies)

key = f'idem-key-{os.getpid()}'
both = race(lambda i: call('POST', '/api/orders', {}, {'idempotency-key': key}, cookies=cookies), 2)
numbers = {b.get('number') for _, b in both}
report(len(numbers) == 1 and None not in numbers,
       'both submissions return the same order', f'numbers={numbers}')

rows = sql("SELECT count(*) FROM \"order\" WHERE idempotency_key = '%s'" % key)
report(rows == '1', 'one order row was written, not two', f'rows={rows}')

print()
print('--- the total invariant, with shipment protection on ---')
# Protection is a line of its own, excluded from tax, and counted exactly once.
_, cart = call('POST', '/api/cart/lines', {'sku': 'VELA-CRICKET-GRAPHITE', 'quantity': 1})
cookies = {'vela_cart': cart['token']}
call('POST', '/api/cart/protection', {'enabled': True}, cookies=cookies)
call('POST', '/api/cart/delivery', {
    'email': 'protection@example.com',
    'shipping_address': {'name': 'Prot', 'line1': '3 Test Row', 'city': 'Portland',
                         'region': 'OR', 'postal_code': '97204', 'country': 'US'},
    'shipping_method': 'express',
}, cookies=cookies)
status, order = call('POST', '/api/orders', {},
                     {'idempotency-key': f'prot-{os.getpid()}'}, cookies=cookies)

lines_sum = sum(l['total_minor'] for l in order.get('lines', []))
report(lines_sum == order['subtotal_minor'],
       'the line totals sum to the subtotal',
       f"lines={lines_sum} subtotal={order.get('subtotal_minor')}")
report(order['total_minor'] == order['subtotal_minor'] + order['shipping_minor']
       + order['tax_minor'] - order.get('discount_minor', 0),
       'the total equals subtotal plus shipping plus tax minus discount',
       json.dumps({k: order[k] for k in
                   ('subtotal_minor', 'shipping_minor', 'tax_minor', 'total_minor')}))
# Tax is ten percent of the goods alone: 29900 -> 2990, with 298 of protection untaxed.
report(order['tax_minor'] == 2990,
       'shipment protection is excluded from tax', f"tax={order['tax_minor']}")
report(order['shipping_minor'] == 2500,
       'protection is not folded into shipping as well', f"shipping={order['shipping_minor']}")

# Every order in the store satisfies the invariant, at every moment after it exists.
broken = sql('''SELECT count(*) FROM "order" o
  WHERE o.total_minor <> o.subtotal_minor + o.shipping_minor + o.tax_minor - o.discount_minor
     OR o.subtotal_minor <> (SELECT coalesce(sum(l.total_minor),0)
                               FROM order_line l WHERE l.order_id = o.id)''')
report(broken == '0', 'every order in the store satisfies the invariant', f'broken={broken}')

print()
print('--- a flash session records what the camera reported ---')
sql("DELETE FROM flash_session WHERE device_id=(SELECT id FROM device WHERE serial='VC2609PVDA7Q')")
sql("UPDATE device SET firmware_version='7.0' WHERE serial='VC2609PVDA7Q'")

status, session = call('POST', '/api/flash-sessions', {'serial': 'VC2609PVDA7Q', 'target_build': 720})
report(status == 201 and session.get('state') == 'started', 'a session starts', f'{status} {session}')

# Asked for 7.2, the camera comes back reporting 7.1: the record is 7.1.
status, done = call('POST', f"/api/flash-sessions/{session['id']}/complete", {'reported_version': '7.1'})
stored = sql("SELECT firmware_version FROM device WHERE serial='VC2609PVDA7Q'")
report(done.get('reported_version') == '7.1' and stored == '7.1',
       'the version read back is recorded, never the one requested',
       f"reported={done.get('reported_version')} stored={stored}")

# A failed session leaves the version as it was.
status, session2 = call('POST', '/api/flash-sessions', {'serial': 'VC2609PVDA7Q', 'target_build': 720})
call('POST', f"/api/flash-sessions/{session2['id']}/fail", {'reason': 'cable pulled'})
after = sql("SELECT firmware_version FROM device WHERE serial='VC2609PVDA7Q'")
report(after == '7.1', 'a failed session leaves the firmware as it was', f'version={after}')

# At most one session in `started` per device at any time.
status_a, _ = call('POST', '/api/flash-sessions', {'serial': 'VC2609PVDA7Q', 'target_build': 720})
status_b, second = call('POST', '/api/flash-sessions', {'serial': 'VC2609PVDA7Q', 'target_build': 720})
report(status_a == 201 and status_b == 409, 'a second live session on one camera is refused',
       f'{status_a} {status_b}')

print()
print(f'passed {passed}, failed {failed}')
sys.exit(1 if failed else 0)
