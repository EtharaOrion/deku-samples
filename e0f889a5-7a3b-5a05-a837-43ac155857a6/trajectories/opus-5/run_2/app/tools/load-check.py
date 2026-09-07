#!/usr/bin/env python3
"""
The brief requires the app to stay responsive with 10 products, 40 variants,
500 orders, 2000 devices and 200 releases. This loads that data straight into
PostgreSQL and then times the reads that would suffer: the list endpoints, the
account pages and the deepest page in the archive.
"""
import os
import subprocess
import sys
import time
import urllib.request

BASE = os.environ.get('BASE', 'http://localhost:4173')
DB = os.environ['DATABASE_URL']

passed = 0
failed = 0


def report(ok, name, detail=''):
    global passed, failed
    if ok:
        passed += 1
        print(f'  ok   {name} {detail}')
    else:
        failed += 1
        print(f'  FAIL {name} {detail}')


def sql(query):
    out = subprocess.run(['psql', DB, '-v', 'ON_ERROR_STOP=1', '-tAc', query],
                         capture_output=True, text=True)
    if out.returncode:
        print(out.stderr[:600])
        raise SystemExit('load failed')
    return out.stdout.strip()


print('--- loading the volumes the brief names ---')

# Products and variants, up to 10 and 40.
sql("""
INSERT INTO product (handle, title, subtitle, kind, status, position)
SELECT 'bulk-' || i, 'Bulk Product ' || i, 'A generated product.', 'accessory', 'active', 100 + i
  FROM generate_series(1, 4) AS i
ON CONFLICT (handle) DO NOTHING;
""")
sql("""
INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position)
SELECT p.id, 'BULK-' || p.handle || '-' || v, p.title || ' v' || v, 'Option ' || v,
       1000 * v, 'usd', v
  FROM product p, generate_series(1, 7) AS v
 WHERE p.handle LIKE 'bulk-%'
ON CONFLICT (sku) DO NOTHING;
""")
sql("""
INSERT INTO inventory_level (variant_id, available, committed)
SELECT id, 50, 0 FROM variant WHERE sku LIKE 'BULK-%'
ON CONFLICT (variant_id) DO NOTHING;
""")

# 200 releases.
sql("""
INSERT INTO app_release (version, build, released_on, channel, artifact_name,
                         size_bytes, sha256, description, notes)
SELECT '9.' || i || '.0', 90000 + i, date '2020-01-01' + i,
       'general', 'arranger-9.' || i || '.0.dmg', 150000000 + i,
       lpad(to_hex(i), 64, 'a'), 'A generated release.',
       '{"Bug Fixes": [{"text": "A generated note."}]}'::jsonb
  FROM generate_series(1, 200) AS i
ON CONFLICT (version) DO NOTHING;
""")

# 500 orders for the seeded customer, each with a line, so the invariant holds.
sql("""
WITH c AS (SELECT id FROM customer WHERE lower(email) = 'customer@example.com'),
     v AS (SELECT id, price_minor FROM variant WHERE sku = 'VELA-CABLE-1M'),
     ins AS (
  INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor,
      tax_minor, discount_minor, total_minor, currency, status, payment_status,
      fulfilment_status, shipping_method, shipping_address, access_token_hash, placed_at)
  SELECT 'VE-2019-' || lpad(i::text, 4, '0'), c.id, 'customer@example.com',
         v.price_minor, 0, (v.price_minor * 10) / 100, 0,
         v.price_minor + (v.price_minor * 10) / 100,
         'usd', 'confirmed', 'invoiced', 'fulfilled', 'standard',
         '{"name":"Iris Vantaa","line1":"44 Harbour Row","city":"Portland","region":"OR","postal_code":"97204","country":"US"}'::jsonb,
         md5(i::text), now() - (i || ' hours')::interval
    FROM generate_series(1, 500) AS i, c, v
  ON CONFLICT (number) DO NOTHING
  RETURNING id, subtotal_minor
)
INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot,
                        quantity, unit_price_minor, total_minor, position)
SELECT ins.id, v.id, 'Replacement Cable - 1 m', 'VELA-CABLE-1M', 1,
       ins.subtotal_minor, ins.subtotal_minor, 1
  FROM ins, v;
""")

# 2000 devices, half of them owned by the seeded customer.
sql("""
WITH p AS (SELECT id FROM product WHERE handle = 'compact'),
     v AS (SELECT id FROM variant WHERE sku = 'VELA-CRICKET-GRAPHITE')
INSERT INTO device (serial, product_id, variant_id, status, firmware_version,
                    firmware_reported_at, warranty_until)
SELECT 'VC2610' || upper(substr(translate(md5(i::text), 'io01', 'xy45'), 1, 6)) || '',
       p.id, v.id, 'manufactured', '7.0', now(), date '2029-01-01'
  FROM generate_series(1, 2000) AS i, p, v
ON CONFLICT DO NOTHING;
""")
sql("""
WITH c AS (SELECT id FROM customer WHERE lower(email) = 'customer@example.com'),
     d AS (SELECT id FROM device WHERE serial LIKE 'VC2610%' LIMIT 1000)
INSERT INTO device_ownership (device_id, customer_id, method)
SELECT d.id, c.id, 'manual' FROM d, c
ON CONFLICT DO NOTHING;
""")

counts = sql("""
SELECT 'products ' || (SELECT count(*) FROM product) ||
       ', variants ' || (SELECT count(*) FROM variant) ||
       ', orders ' || (SELECT count(*) FROM "order") ||
       ', devices ' || (SELECT count(*) FROM device) ||
       ', releases ' || (SELECT count(*) FROM app_release) ||
       ', owned ' || (SELECT count(*) FROM device_ownership WHERE released_at IS NULL)
""")
print(f'  loaded: {counts}')

import hashlib
import json


def login(email, password='deku-demo-pw-2026'):
    req = urllib.request.Request(f'{BASE}/api/auth/login',
                                 data=json.dumps({'email': email, 'password': password}).encode(),
                                 method='POST')
    req.add_header('content-type', 'application/json')
    with urllib.request.urlopen(req) as r:
        return json.load(r)['access_token']


token = login('customer@example.com')


def timed(path, headers=None, budget_ms=1500):
    req = urllib.request.Request(f'{BASE}{path}')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    start = time.perf_counter()
    with urllib.request.urlopen(req) as r:
        body = r.read()
        status = r.status
    ms = (time.perf_counter() - start) * 1000
    report(status == 200 and ms < budget_ms, path, f'({status}, {ms:.0f} ms)')
    return body


print()
print('--- reads under those volumes ---')
auth = {'authorization': f'Bearer {token}'}
timed('/api/products?page_size=100')
timed('/api/releases?page_size=100')
timed('/api/account/orders?page_size=20', auth)
timed('/api/account/devices?page_size=20', auth)
timed('/api/account/overview', auth)
timed('/shop')
timed('/downloads')
timed('/account/orders', {'cookie': f'vela_session={token}'})
timed('/account/cameras', {'cookie': f'vela_session={token}'})
timed('/')

print()
print('--- the cursor still walks a large list correctly ---')
seen = []
cursor = None
pages = 0
while True:
    url = f'{BASE}/api/releases?page_size=50' + (f'&cursor={cursor}' if cursor else '')
    with urllib.request.urlopen(url) as r:
        page = json.load(r)
    seen += [x['build'] for x in page['data']]
    pages += 1
    if not page['has_more'] or pages > 20:
        break
    cursor = page['next_cursor']
report(len(seen) == len(set(seen)), 'no release is repeated across pages', f'{len(seen)} rows')
report(seen == sorted(seen, reverse=True), 'every page stays in build order', f'{pages} pages')
report(len(seen) == int(sql('SELECT count(*) FROM app_release')),
       'the walk reaches every release', f'{len(seen)} rows')

print()
print('--- cleaning the generated rows back out ---')
sql("DELETE FROM device_ownership WHERE device_id IN (SELECT id FROM device WHERE serial LIKE 'VC2610%')")
sql("DELETE FROM device WHERE serial LIKE 'VC2610%'")
sql("DELETE FROM order_line WHERE order_id IN (SELECT id FROM \"order\" WHERE number LIKE 'VE-2019-%')")
sql("DELETE FROM \"order\" WHERE number LIKE 'VE-2019-%'")
sql("DELETE FROM app_release WHERE version LIKE '9.%'")
sql("DELETE FROM inventory_level WHERE variant_id IN (SELECT id FROM variant WHERE sku LIKE 'BULK-%')")
sql("DELETE FROM variant WHERE sku LIKE 'BULK-%'")
sql("DELETE FROM product WHERE handle LIKE 'bulk-%'")
remaining = sql("""
SELECT 'products ' || (SELECT count(*) FROM product) ||
       ', orders ' || (SELECT count(*) FROM "order") ||
       ', devices ' || (SELECT count(*) FROM device) ||
       ', releases ' || (SELECT count(*) FROM app_release)
""")
print(f'  remaining: {remaining}')

print()
print(f'passed {passed}, failed {failed}')
sys.exit(1 if failed else 0)
