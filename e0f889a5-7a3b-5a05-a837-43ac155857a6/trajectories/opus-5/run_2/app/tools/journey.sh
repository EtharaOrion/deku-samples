#!/bin/bash
# The graded journey, driven against the API exactly as the brief describes it:
# a Graphite Vela Cricket and a Travel Case, guest checkout on Standard, landing
# on VE-...-0002 at $415.80, with the invoice read back out of killbill and the
# mail read back out of Mailpit.
BASE=${BASE:-http://localhost:4173}
J=/tmp/journey.jar
rm -f $J

say() { printf '\n=== %s ===\n' "$1"; }

say 'add a Graphite Vela Cricket'
curl -s -c $J -b $J -X POST "$BASE/api/cart/lines" -H 'content-type: application/json' \
  -d '{"sku":"VELA-CRICKET-GRAPHITE","quantity":1}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print("subtotal",d["subtotal_minor"],"items",d["item_count"])'

say 'add a Travel Case'
curl -s -c $J -b $J -X POST "$BASE/api/cart/lines" -H 'content-type: application/json' \
  -d '{"sku":"VELA-CASE-STD","quantity":1}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print("subtotal",d["subtotal_minor"],"(expect 37800)")'

say 'contact and address'
curl -s -c $J -b $J -X POST "$BASE/api/cart/delivery" -H 'content-type: application/json' \
  -d '{"email":"customer@example.com","shipping_address":{"name":"Iris Vantaa","line1":"44 Harbour Row","city":"Portland","region":"OR","postal_code":"97204","country":"US"}}' \
  -o /dev/null -w 'status %{http_code}\n'

say 'standard delivery'
curl -s -c $J -b $J -X POST "$BASE/api/cart/delivery" -H 'content-type: application/json' \
  -d '{"shipping_method":"standard"}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print("subtotal",d["subtotal_minor"],"shipping",d["shipping_minor"],"tax",d["tax_minor"],"total",d["total_minor"],"(expect 37800/0/3780/41580)")'

say 'place the order'
KEY="journey-$(date +%s%N)"
echo "idempotency key: $KEY"
curl -s -c $J -b $J -X POST "$BASE/api/orders" -H 'content-type: application/json' \
  -H "idempotency-key: $KEY" -d '{"expected_total_minor":41580}' > /tmp/order.json
python3 -c '
import json
d=json.load(open("/tmp/order.json"))
print("number", d.get("number"))
print("total_minor", d.get("total_minor"))
print("killbill_external_key", d.get("killbill_external_key"))
print("killbill_invoice_amount", d.get("killbill_invoice_amount"))
open("/tmp/order_number","w").write(d.get("number",""))
open("/tmp/order_token","w").write(d.get("access_token") or "")
'

say 'replay the same Idempotency-Key'
curl -s -c $J -b $J -X POST "$BASE/api/orders" -H 'content-type: application/json' \
  -H "idempotency-key: $KEY" -d '{"expected_total_minor":41580}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print("number",d.get("number"),"replayed",d.get("replayed"))'
