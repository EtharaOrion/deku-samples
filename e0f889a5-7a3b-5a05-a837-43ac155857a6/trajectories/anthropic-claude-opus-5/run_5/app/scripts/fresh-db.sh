#!/bin/bash
# Grading re-creates the database from scratch, so the image must apply its own
# schema and seed into an empty one. The role here may not create databases or
# schemas, so this empties the one it has: every table is dropped, and then the
# runtime tree is started against it and must build everything back itself.
set -u

export PGPASSWORD=deku-local-dev
PSQL="psql -h postgres -U deku_app -d deku"

echo "== emptying the database =="
$PSQL -tAc "SELECT 'DROP TABLE IF EXISTS \"' || tablename || '\" CASCADE;'
            FROM pg_tables WHERE schemaname='public'" 2>/dev/null | $PSQL >/dev/null 2>&1
remaining=$($PSQL -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
echo "tables before the app starts: $remaining"
if [ "$remaining" != "0" ]; then echo "FAIL: the database is not empty"; exit 1; fi

cd /tmp/vela-image-run || { echo "run scripts/simulate-image.sh first"; exit 1; }
echo
echo "== starting the runtime tree against the empty database =="
PORT=4198 HOST=0.0.0.0 NODE_ENV=production \
  setsid node server/index.js > /tmp/fresh-app.log 2>&1 < /dev/null &

code=000
for i in $(seq 1 40); do
  sleep 1
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4198/api/health 2>/dev/null)
  [ "$code" = "200" ] && break
done
echo "health: $code"
echo "tables the app created: $($PSQL -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public'")"
echo "products seeded: $(curl -s 'http://127.0.0.1:4198/api/products?page_size=100' | grep -o '"handle"' | wc -l)"
echo "releases seeded: $(curl -s 'http://127.0.0.1:4198/api/releases?page_size=100' | grep -o '"version"' | wc -l)"
echo "devices seeded:  $($PSQL -tAc 'SELECT count(*) FROM device')"
echo "seeded order:    $($PSQL -tAc 'SELECT number FROM "order"')"

echo -n "front page:  "; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4198/
echo -n "shop page:   "; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4198/shop
echo -n "downloads:   "; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4198/downloads
echo -n "doctor:      "; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4198/doctor
echo -n "seeded login: "
curl -s -X POST http://127.0.0.1:4198/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"customer@example.com","password":"deku-demo-pw-2026"}' \
  -o /dev/null -w '%{http_code}\n'

echo
echo "== restarting it: the seed must not duplicate a row =="
for p in $(ls /proc | grep -E '^[0-9]+$'); do
  if grep -qa 'PORT=4198' "/proc/$p/environ" 2>/dev/null; then kill -9 "$p" 2>/dev/null; fi
done
sleep 2
PORT=4198 HOST=0.0.0.0 NODE_ENV=production \
  setsid node server/index.js > /tmp/fresh-app2.log 2>&1 < /dev/null &
for i in $(seq 1 40); do
  sleep 1
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4198/api/health 2>/dev/null)
  [ "$code" = "200" ] && break
done
echo "health after restart: $code"
echo "products still: $($PSQL -tAc 'SELECT count(*) FROM product')"
echo "variants still: $($PSQL -tAc 'SELECT count(*) FROM variant')"
echo "devices still:  $($PSQL -tAc 'SELECT count(*) FROM device')"
echo "orders still:   $($PSQL -tAc 'SELECT count(*) FROM "order"')"
echo "live owners:    $($PSQL -tAc 'SELECT count(*) FROM device_ownership WHERE released_at IS NULL')"

for p in $(ls /proc | grep -E '^[0-9]+$'); do
  if grep -qa 'PORT=4198' "/proc/$p/environ" 2>/dev/null; then kill -9 "$p" 2>/dev/null; fi
done
echo "stopped"
