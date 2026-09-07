#!/usr/bin/env bash
# Walk the graded guest journey against the running app and read the values back.
set -u
B="${BASE:-http://127.0.0.1:4173}/api"
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT
CURL=(curl -s -c "$JAR" -b "$JAR")

say() { printf '\n== %s\n' "$1"; }

say "add a Graphite Vela Cricket and a Travel Case"
"${CURL[@]}" -X POST "$B/cart/lines" -H 'content-type: application/json' \
  -d '{"sku":"VELA-CRICKET-GRAPHITE","quantity":1}' -o /dev/null -w 'add cricket: %{http_code}\n'
"${CURL[@]}" -X POST "$B/cart/lines" -H 'content-type: application/json' \
  -d '{"sku":"VELA-CASE-STD","quantity":1}' -o /dev/null -w 'add case:    %{http_code}\n'

say "read the cart"
"${CURL[@]}" "$B/cart" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("subtotal_minor", d["subtotal_minor"])
print("tax_minor     ", d["tax_minor"])
print("total_minor   ", d["total_minor"])
print("item_count    ", d["item_count"])
'

say "delivery: guest customer@example.com, Standard"
"${CURL[@]}" -X POST "$B/cart/delivery" -H 'content-type: application/json' -d '{
  "email":"customer@example.com",
  "shipping_address":{"name":"Iris Vantaa","line1":"414 Harbour Road","city":"Portland","region":"OR","postal_code":"97204","country":"US"},
  "shipping_method":"standard"
}' | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("shipping_minor", d["shipping_minor"])
print("tax_minor     ", d["tax_minor"])
print("total_minor   ", d["total_minor"])
'

say "place the order twice with one Idempotency-Key"
KEY="check-$(date +%s)-$RANDOM"
"${CURL[@]}" -X POST "$B/orders" -H 'content-type: application/json' -H "idempotency-key: $KEY" \
  -d '{}' -o /tmp/order1.json -w 'first submit:  %{http_code}\n'
"${CURL[@]}" -X POST "$B/orders" -H 'content-type: application/json' -H "idempotency-key: $KEY" \
  -d '{}' -o /tmp/order2.json -w 'second submit: %{http_code}\n'

python3 -c '
import json
a=json.load(open("/tmp/order1.json")); b=json.load(open("/tmp/order2.json"))
print("number       ", a.get("number"), "|", b.get("number"), "same:", a.get("number")==b.get("number"))
print("total_minor  ", a.get("total_minor"))
print("external key ", a.get("killbill_external_key"))
print("serials      ", [s["serial"] for s in a.get("serials",[])])
'
