#!/bin/bash
# Contract tests against the running app. Each one names the rule it is checking.
BASE=${BASE:-http://localhost:4173}
PASS=0; FAIL=0

check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  ok   %s\n' "$1"
  else FAIL=$((FAIL+1)); printf '  FAIL %s (expected %s, got %s)\n' "$1" "$2" "$3"; fi
}
contains() { # contains <name> <needle> <haystack>
  case "$3" in *"$2"*) PASS=$((PASS+1)); printf '  ok   %s\n' "$1";;
  *) FAIL=$((FAIL+1)); printf '  FAIL %s (missing %q in %.200s)\n' "$1" "$2" "$3";; esac
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
json() { curl -s "$@"; }

echo '--- auth ---'
TOK=$(json -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d '{"email":"customer@example.com","password":"deku-demo-pw-2026"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
[ -n "$TOK" ] && { PASS=$((PASS+1)); echo '  ok   seeded password logs in'; } || { FAIL=$((FAIL+1)); echo '  FAIL seeded password logs in'; }

TOK2=$(json -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d '{"email":"customer2@example.com","password":"deku-demo-pw-2026"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')

check 'login is case-insensitive on email' 200 \
  "$(code -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -d '{"email":"Customer@Example.com","password":"deku-demo-pw-2026"}')"
check 'wrong password is rejected' 401 \
  "$(code -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -d '{"email":"customer@example.com","password":"wrong"}')"
check 'signup refuses a registered address' 409 \
  "$(code -X POST "$BASE/api/auth/signup" -H 'content-type: application/json' -d '{"email":"customer@example.com","password":"another-pw-123","name":"Someone"}')"
check 'absent token is rejected' 401 "$(code "$BASE/api/auth/me")"
check 'expired or bogus token is rejected' 401 "$(code "$BASE/api/auth/me" -H 'authorization: Bearer not-a-real-token')"

echo '--- the ownership boundary (server-side, not a hidden button) ---'
check 'visitor cannot list devices' 401 "$(code "$BASE/api/account/devices")"
check 'visitor cannot register a serial' 401 \
  "$(code -X POST "$BASE/api/account/devices" -H 'content-type: application/json' -d '{"serial":"VA2609KTMHX4"}')"
check 'visitor cannot list orders' 401 "$(code "$BASE/api/account/orders")"

OWNED=$(json -X POST "$BASE/api/account/devices" -H "authorization: Bearer $TOK2" \
  -H 'content-type: application/json' -d '{"serial":"VC2609PVDA7Q"}')
contains 'another customer camera is refused by name only' 'That camera is registered to someone else.' "$OWNED"
check 'that refusal is a 409' 409 \
  "$(code -X POST "$BASE/api/account/devices" -H "authorization: Bearer $TOK2" -H 'content-type: application/json' -d '{"serial":"VC2609PVDA7Q"}')"

# The refusal wrote no ownership row: the device is still the first customer's.
STILL=$(json "$BASE/api/account/devices/VC2609PVDA7Q" -H "authorization: Bearer $TOK" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("serial",""))')
check 'the refusal wrote no ownership row' 'VC2609PVDA7Q' "$STILL"
check "another customer's camera reads as not found" 404 \
  "$(code "$BASE/api/account/devices/VC2609PVDA7Q" -H "authorization: Bearer $TOK2")"

echo '--- serial rules ---'
contains 'unknown serial' 'We do not recognise that serial number.' \
  "$(json -X POST "$BASE/api/account/devices" -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d '{"serial":"VA2609ZZZZZZ"}')"
contains 'a serial with a forbidden letter is refused on shape' 'We do not recognise that serial number.' \
  "$(json -X POST "$BASE/api/account/devices" -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d '{"serial":"VA2609KTMHI4"}')"
check 'a blocked device is refused as blocked' 422 \
  "$(code -X POST "$BASE/api/account/devices" -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d '{"serial":"VC2609WJ3DKT"}')"

echo '--- pagination ---'
check 'a page size above the cap is refused' 400 "$(code "$BASE/api/releases?page_size=500")"
contains 'the refusal names the cap' '100' "$(json "$BASE/api/releases?page_size=500")"
contains 'limit=500 written as a page size is refused too' 'capped at 100' "$(json "$BASE/api/releases?limit=500")"
SHAPE=$(json "$BASE/api/releases?page_size=2")
contains 'a list carries data' '"data"' "$SHAPE"
contains 'a list carries next_cursor' '"next_cursor"' "$SHAPE"
contains 'a list carries has_more' '"has_more"' "$SHAPE"

# A keyset cursor never repeats or skips a row.
python3 - "$BASE" <<'PY'
import json, sys, urllib.request
base = sys.argv[1]
seen, cursor, pages = [], None, 0
while True:
    url = f"{base}/api/releases?page_size=2" + (f"&cursor={cursor}" if cursor else "")
    d = json.load(urllib.request.urlopen(url))
    seen += [r["build"] for r in d["data"]]
    pages += 1
    if not d["has_more"] or pages > 10: break
    cursor = d["next_cursor"]
ok = seen == sorted(set(seen), reverse=True) and len(seen) == len(set(seen))
print(f"  {'ok  ' if ok else 'FAIL'} the cursor walks every release once, newest build first: {seen}")
PY

echo '--- the release archive orders by build, never by date ---'
json "$BASE/api/releases?page_size=10" | python3 -c '
import sys, json
d = json.load(sys.stdin)["data"]
versions = [r["version"] for r in d]
builds = [r["build"] for r in d]
same_day = [r["version"] for r in d if r["released_on"] == "2024-05-20"]
ok = builds == sorted(builds, reverse=True) and same_day == ["1.4.3", "1.4.2"]
mark = "ok  " if ok else "FAIL"
print("  " + mark + " 1.4.3 precedes 1.4.2 on the shared date: " + str(versions))
'

echo '--- firmware and flash sessions ---'
MAN=$(json "$BASE/api/firmware/manifest?model=compact")
contains 'the manifest names its product' '"Vela Cricket"' "$MAN"
contains 'a manifest entry carries the digest' 'sha256' "$MAN"
json "$BASE/api/firmware/manifest?model=compact" | python3 -c '
import sys, json
e = json.load(sys.stdin)["entries"]
ok = all(x["channel"] == "general" for x in e)
mark = "ok  " if ok else "FAIL"
print("  " + mark + " only general-channel images are offered by default (" + str(len(e)) + " entries)")
'

# An image belonging to another product is refused before the session starts.
WRONG=$(json -X POST "$BASE/api/flash-sessions" -H 'content-type: application/json' \
  -d '{"serial":"VC2609PVDA7Q","target_build":240}')
contains 'an image for another camera is refused' 'different camera' "$WRONG"
check 'that refusal is a client error' 422 \
  "$(code -X POST "$BASE/api/flash-sessions" -H 'content-type: application/json' -d '{"serial":"VC2609PVDA7Q","target_build":240}')"

echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ]
