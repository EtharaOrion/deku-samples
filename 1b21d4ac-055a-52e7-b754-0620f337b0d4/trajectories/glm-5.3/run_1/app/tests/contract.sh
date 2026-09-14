#!/usr/bin/env bash
# Cirrus contract test: public reads, publish boundary, house scoping.
set -u
BASE="${BASE:-http://localhost:4173}"
PY=/usr/local/bin/python3.12
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  ok  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "FAIL  $1"; }
expect_code(){ local want=$1; shift; local got; got=$(curl -s -o /tmp/t.json -w '%{http_code}' "$@"); if [ "$got" = "$want" ]; then ok "$want $*"; else bad "wanted $want got $got :: $* :: $(head -c 160 /tmp/t.json)"; fi; }
same(){ if [ "$(curl -s "$1")" = "$2" ] || [ "$(curl -s "$1")" = "$3" ]; then ok "$1"; else bad "$1 -> $(curl -s "$1")"; fi; }

echo "== public reads =="
N=$(curl -s $BASE/api/works | $PY -c 'import json,sys;print(len(json.load(sys.stdin)))')
[ "$N" = "12" ] && ok "12 published works" || bad "works count $N"
curl -s $BASE/api/talents | $PY -c 'import json,sys;d=json.load(sys.stdin);assert [t["slug"] for t in d]==["rives","halcyon","camille-ferrand"],d' && ok "3 published talents in order" || bad "talents"
same "$BASE/api/disciplines" '["director", "photographer"]' '["director","photographer"]'
expect_code 200 $BASE/api/works/the-halo
expect_code 200 $BASE/api/talents/rives
ORD=$(curl -s $BASE/api/works | $PY -c 'import json,sys;print(",".join(w["ordinal_label"] for w in json.load(sys.stdin)))')
[ "$ORD" = "001,002,003,004,005,006,007,008,009,010,011,012" ] && ok "ordinals 001..012" || bad "ordinals $ORD"

echo "== unlisted records absent =="
expect_code 404 $BASE/api/talents/noor-vasquez
expect_code 404 $BASE/api/works/the-quiet-room
expect_code 404 $BASE/talents/noor-vasquez
expect_code 404 $BASE/works/the-quiet-room
expect_code 404 $BASE/preview/0000000000000000000000000000dead

echo "== studio auth =="
expect_code 401 $BASE/api/studio/items
VIEWER=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"viewer@example.com","password":"deku-demo-pw-2026"}' | $PY -c 'import json,sys;print(json.load(sys.stdin)["token"])')
[ -n "$VIEWER" ] && ok "viewer login" || bad "viewer login"
expect_code 403 $BASE/api/studio/items -H "Authorization: Bearer $VIEWER"
expect_code 403 -X POST $BASE/api/studio/items -H "Authorization: Bearer $VIEWER" -H 'Content-Type: application/json' -d '{"kind":"work","title":"Sneak"}'
expect_code 401 $BASE/api/studio/items -H "Authorization: Bearer nonsense"
PROD=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"producer@example.com","password":"deku-demo-pw-2026"}' | $PY -c 'import json,sys;print(json.load(sys.stdin)["token"])')
MER=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"producer.meridian@example.com","password":"deku-demo-pw-2026"}' | $PY -c 'import json,sys;print(json.load(sys.stdin)["token"])')
[ -n "$PROD" ] && ok "cirrus producer login" || bad "cirrus producer login"
[ -n "$MER" ] && ok "meridian producer login" || bad "meridian producer login"

echo "== house scoping =="
CIRRUS_ITEMS=$(curl -s $BASE/api/studio/items -H "Authorization: Bearer $PROD")
MER_ITEMS=$(curl -s $BASE/api/studio/items -H "Authorization: Bearer $MER")
$PY -c "
import json
a=json.loads('''$CIRRUS_ITEMS'''); b=json.loads('''$MER_ITEMS''')
assert all(i['slug'] not in ('foundry','sable-ito') for i in a), 'cirrus sees meridian'
assert all(i['slug'] not in ('the-halo','noor-vasquez') for i in b), 'meridian sees cirrus'
assert any(i['slug']=='the-quiet-room' for i in a)
assert any(i['slug']=='foundry' for i in b)
" && ok "each producer lists only their own house" || bad "house listing leak"
QUIET_ID=$(echo "$CIRRUS_ITEMS" | $PY -c 'import json,sys;print([i["id"] for i in json.load(sys.stdin) if i["slug"]=="the-quiet-room"][0])')
NOOR_ID=$(echo "$CIRRUS_ITEMS" | $PY -c 'import json,sys;print([i["id"] for i in json.load(sys.stdin) if i["slug"]=="noor-vasquez"][0])')
HALO_ID=$(echo "$CIRRUS_ITEMS" | $PY -c 'import json,sys;print([i["id"] for i in json.load(sys.stdin) if i["slug"]=="the-halo"][0])')
expect_code 404 $BASE/api/studio/items/$HALO_ID -H "Authorization: Bearer $MER"
expect_code 404 -X PATCH $BASE/api/studio/items/$HALO_ID -H "Authorization: Bearer $MER" -H 'Content-Type: application/json' -d '{"title":"Stolen"}'
expect_code 404 -X POST $BASE/api/studio/items/$HALO_ID/publish -H "Authorization: Bearer $MER" -H 'Content-Type: application/json' -d '{"published":false}'
expect_code 404 -X POST $BASE/api/studio/items/$HALO_ID/slug -H "Authorization: Bearer $MER" -H 'Content-Type: application/json' -d '{"slug":"stolen"}'
expect_code 404 -X POST $BASE/api/studio/items/$HALO_ID/media -H "Authorization: Bearer $MER" -H 'Content-Type: application/json' -d '{"role":"poster","width":100,"height":100,"alt":"x"}'
expect_code 404 -X POST $BASE/api/studio/items/$HALO_ID/credits -H "Authorization: Bearer $MER" -H 'Content-Type: application/json' -d '{"role":"Director","name":"X"}'
expect_code 404 -X POST $BASE/api/studio/works/order -H "Authorization: Bearer $MER" -H 'Content-Type: application/json' -d "{\"ordered_ids\":[\"$HALO_ID\"]}"
expect_code 404 -X POST $BASE/api/studio/preview-tokens -H "Authorization: Bearer $MER" -H 'Content-Type: application/json' -d "{\"item_id\":\"$HALO_ID\"}"
expect_code 404 -X POST $BASE/api/studio/preview-tokens -H "Authorization: Bearer $MER" -H 'Content-Type: application/json' -d "{\"item_id\":\"$NOOR_ID\"}"
TITLE_NOW=$(curl -s $BASE/api/works/the-halo | $PY -c 'import json,sys;print(json.load(sys.stdin)["title"])')
[ "$TITLE_NOW" = "The Halo" ] && ok "cirrus record unchanged after foreign writes" || bad "record changed: $TITLE_NOW"

echo "== unlisted media =="
QUIET_MEDIA=$(curl -s $BASE/api/studio/items/$QUIET_ID -H "Authorization: Bearer $PROD" | $PY -c 'import json,sys;print(json.load(sys.stdin)["media"][0]["id"])')
NOOR_MEDIA=$(curl -s $BASE/api/studio/items/$NOOR_ID -H "Authorization: Bearer $PROD" | $PY -c 'import json,sys;print(json.load(sys.stdin)["media"][0]["id"])')
expect_code 404 $BASE/api/media/$QUIET_MEDIA
expect_code 404 $BASE/api/media/$NOOR_MEDIA
expect_code 404 "$BASE/api/media/$QUIET_MEDIA?token=$MER"
expect_code 404 $BASE/api/media/$NOOR_MEDIA -H "Authorization: Bearer $MER"
expect_code 404 $BASE/api/media/$NOOR_MEDIA -H "Authorization: Bearer $VIEWER"
expect_code 200 $BASE/api/media/$QUIET_MEDIA -H "Authorization: Bearer $PROD"
expect_code 200 "$BASE/api/media/$NOOR_MEDIA?token=$PROD"
CT=$(curl -s -o /tmp/img.png -w '%{content_type}' $BASE/api/media/$NOOR_MEDIA?token=$PROD)
[ "$CT" = "image/png" ] && ok "media renders png" || bad "media type $CT"
SAME1=$(md5sum < /tmp/img.png); curl -s -o /tmp/img2.png "$BASE/api/media/$NOOR_MEDIA?token=$PROD"; SAME2=$(md5sum < /tmp/img2.png)
[ "$SAME1" = "$SAME2" ] && ok "same media id, same pixels" || bad "unstable pixels"

echo "== publish flow =="
SUFFIX=$($PY -c 'import random;print(random.randint(1000,9999))')
NEW=$(curl -s -X POST $BASE/api/studio/items -H "Authorization: Bearer $PROD" -H 'Content-Type: application/json' -d "{\"kind\":\"talent\",\"title\":\"Test Stylist $SUFFIX\",\"slug\":\"test-stylist-$SUFFIX\",\"discipline\":\"stylist\"}")
NEW_ID=$(echo "$NEW" | $PY -c 'import json,sys;print(json.load(sys.stdin).get("id",""))')
[ -n "$NEW_ID" ] && ok "talent created" || bad "create talent: $NEW"
PUBLISHED=$(echo "$NEW" | $PY -c 'import json,sys;print(json.load(sys.stdin)["published"])')
[ "$PUBLISHED" = "False" ] && ok "created unlisted" || bad "created published"
expect_code 400 -X POST $BASE/api/studio/items/$NEW_ID/publish -H "Authorization: Bearer $PROD" -H 'Content-Type: application/json' -d '{"published":true}'
expect_code 404 $BASE/api/talents/test-stylist-$SUFFIX
curl -s -X POST $BASE/api/studio/items/$NEW_ID/media -H "Authorization: Bearer $PROD" -H 'Content-Type: application/json' -d '{"role":"poster","width":246,"height":328,"alt":"Portrait of Test Stylist, stylist"}' >/dev/null
expect_code 200 -X POST $BASE/api/studio/items/$NEW_ID/publish -H "Authorization: Bearer $PROD" -H 'Content-Type: application/json' -d '{"published":true}'
expect_code 200 $BASE/api/talents/test-stylist-$SUFFIX
same "$BASE/api/disciplines" '["director", "photographer", "stylist"]' '["director","photographer","stylist"]'
expect_code 200 -X POST $BASE/api/studio/items/$NEW_ID/publish -H "Authorization: Bearer $PROD" -H 'Content-Type: application/json' -d '{"published":false}'
expect_code 404 $BASE/api/talents/test-stylist-$SUFFIX
same "$BASE/api/disciplines" '["director", "photographer"]' '["director","photographer"]'

echo "== preview tokens =="
TOK=$(curl -s -X POST $BASE/api/studio/preview-tokens -H "Authorization: Bearer $PROD" -H 'Content-Type: application/json' -d "{\"item_id\":\"$NEW_ID\"}" | $PY -c 'import json,sys;print(json.load(sys.stdin)["token"])')
[ "${#TOK}" = "32" ] && ok "token is 32 hex" || bad "token '$TOK'"
expect_code 200 $BASE/api/preview/$TOK -H "Authorization: Bearer $PROD"
expect_code 404 $BASE/api/preview/$TOK -H "Authorization: Bearer $MER"
expect_code 404 $BASE/api/preview/$TOK
GOT=$(curl -s -o /dev/null -w '%{http_code}' $BASE/preview/$TOK)
[ "$GOT" = "404" ] && ok "preview page without session is 404" || bad "preview page anon gave $GOT"

echo "== slug rename redirects =="
expect_code 200 -X POST $BASE/api/studio/items/$NEW_ID/publish -H "Authorization: Bearer $PROD" -H 'Content-Type: application/json' -d '{"published":true}'
expect_code 200 -X POST $BASE/api/studio/items/$NEW_ID/slug -H "Authorization: Bearer $PROD" -H 'Content-Type: application/json' -d "{\"slug\":\"test-stylist-$SUFFIX-renamed\"}"
GOT=$(curl -s -o /dev/null -w "%{http_code}" $BASE/talents/test-stylist-$SUFFIX)
[ "$GOT" = "301" ] && ok "old slug redirects forever" || bad "old slug gave $GOT"
expect_code 200 $BASE/api/talents/test-stylist-$SUFFIX-renamed

echo "== neighbours wrap =="
curl -s $BASE/api/works/the-radiant | $PY -c '
import json,sys
d=json.load(sys.stdin)
assert d["ordinal_label"]=="012", d["ordinal_label"]
assert d["next"]["ordinal_label"]=="001", d["next"]
assert d["previous"]["ordinal_label"]=="011", d["previous"]
' && ok "012 wraps to 001" || bad "neighbour wrap"

echo "== unlist the fifth: eleven numbered 001..011 =="
FIFTH=$(curl -s $BASE/api/works | $PY -c 'import json,sys;print(json.load(sys.stdin)[4]["slug"])')
FIFTH_ID=$($PY -c "
import json
print([i['id'] for i in json.loads('''$CIRRUS_ITEMS''') if i['slug']=='$FIFTH'][0])")
curl -s -X POST $BASE/api/studio/items/$FIFTH_ID/publish -H "Authorization: Bearer $PROD" -H 'Content-Type: application/json' -d '{"published":false}' >/dev/null
ORD=$(curl -s $BASE/api/works | $PY -c 'import json,sys;d=json.load(sys.stdin);print(len(d), d[-1]["ordinal_label"])')
[ "$ORD" = "11 011" ] && ok "unlisting the fifth leaves eleven at 001..011" || bad "after unlist: $ORD"
curl -s -X POST $BASE/api/studio/items/$FIFTH_ID/publish -H "Authorization: Bearer $PROD" -H 'Content-Type: application/json' -d '{"published":true}' >/dev/null
ORD=$(curl -s $BASE/api/works | $PY -c 'import json,sys;print(len(json.load(sys.stdin)))')
[ "$ORD" = "12" ] && ok "republishing restores twelve" || bad "restore $ORD"

echo "== pages =="
for p in / /works /works/ /works/the-halo /talents /talents/ /talents/rives /about /signup /studio/login /share-image.png /robots.txt; do
  expect_code 200 "$BASE$p"
done
expect_code 404 $BASE/no-such-page
expect_code 404 $BASE/works/no-such-film
expect_code 302 $BASE/studio
GOT=$(curl -s $BASE/no-such-page | grep -c 'That page is not here.')
[ "$GOT" = "1" ] && ok "not-found page carries the line" || bad "not-found body"
GOT=$(curl -s $BASE/no-such-page | grep -c 'no-such-page')
[ "$GOT" = "0" ] && ok "not-found does not echo the path" || bad "path echoed"

echo "== signup =="
SIGNUP=$(curl -s -X POST $BASE/api/auth/signup -H 'Content-Type: application/json' -d '{"email":"stranger+$SUFFIX@example.com","password":"alongpassword1"}')
echo "$SIGNUP" | $PY -c '
import json,sys
d=json.load(sys.stdin)
assert d["role"]=="viewer" and "token" in d, d
' && ok "signup issues a viewer with a token" || bad "signup shape: $SIGNUP"

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
