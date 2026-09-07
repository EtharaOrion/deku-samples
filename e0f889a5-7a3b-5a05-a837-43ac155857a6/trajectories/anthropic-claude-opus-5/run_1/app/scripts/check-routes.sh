#!/usr/bin/env bash
# Every route answers, and the ones that should refuse do refuse.
set -u
B="${BASE:-http://127.0.0.1:4173}"

check() { # path expected
  code=$(curl -s -o /dev/null -w '%{http_code}' "$B$1")
  mark=" "
  [ "$code" = "$2" ] || mark="!"
  printf '%s %-42s %s (want %s)\n' "$mark" "$1" "$code" "$2"
}

echo "== public pages"
for p in / /shop /shop/flagship /shop/compact /shop/case /cart \
         /checkout/where-it-goes /checkout/how-it-gets-there /checkout/payment \
         /downloads /downloads/1.4.3 /downloads/2.0.0 /doctor /sign-in /sign-up; do
  check "$p" 200
done

echo
echo "== these must not be found"
check /shop/nope 404
check /downloads/9.9.9 404
check /orders/VE-2026-0001 404
check /nothing-here 404

echo
echo "== signed-out account routes redirect to sign-in"
for p in /account /account/orders /account/cameras; do
  loc=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$B$p")
  printf '  %-30s %s\n' "$p" "$loc"
done

echo
echo "== api, signed out"
for p in /api/health /api/products /api/products/compact /api/cart /api/releases \
         "/api/releases/1.4.3" "/api/firmware/manifest?model=compact"; do
  check "$p" 200
done
check /api/account/orders 401
check /api/account/devices 401

echo
echo "== page size cap"
curl -s "$B/api/products?page_size=500" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  code:", d.get("code"))
print("  message:", d.get("message"))
print("  request_id present:", bool(d.get("request_id")))
'
