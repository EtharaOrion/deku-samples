#!/usr/bin/env bash
# Full verification against the live deployment port, each suite starting from
# the seed the image itself plants.
BASE_PORT=${PORT:-4173}
BASE="http://127.0.0.1:$BASE_PORT"

reset_and_serve() {
  PGPASSWORD='deku-local-dev' psql -q -h postgres -U deku_app -d deku \
    -c 'DROP TABLE IF EXISTS email_log, registrations, events, calendars, accounts CASCADE;' >/dev/null 2>&1
  curl -s -X DELETE "http://${SMTP_HOST}:8025/api/v1/messages" >/dev/null
  PORT=$BASE_PORT bash /app/tools/serve.sh >/dev/null 2>&1
}

echo "=========================================="
echo " 1. API and invariants, from a clean seed"
echo "=========================================="
reset_and_serve
CHECK_BASE=$BASE node /app/tools/apicheck.mjs > /tmp/v_api.log 2>&1
API=$?
grep -E 'FAIL|passed' /tmp/v_api.log

echo
echo "=========================================="
echo " 2. Contention on the last seat"
echo "=========================================="
reset_and_serve
CHECK_BASE=$BASE node /app/tools/stress.mjs > /tmp/v_stress.log 2>&1
STRESS=$?
tail -14 /tmp/v_stress.log

echo
echo "=========================================="
echo " 3. The journeys in a browser"
echo "=========================================="
reset_and_serve
WALK_BASE=$BASE node /app/tools/walk.mjs > /tmp/v_walk.log 2>&1
WALK=$?
grep -E 'FAIL|passed' /tmp/v_walk.log

echo
echo "=========================================="
echo " 4. Leaving the app on its clean seed"
echo "=========================================="
reset_and_serve
echo "health: $(curl -s $BASE/api/health)"
PGPASSWORD='deku-local-dev' psql -h postgres -U deku_app -d deku -tAc \
  "select 'accounts='||(select count(*) from accounts)||' calendars='||(select count(*) from calendars)||' events='||(select count(*) from events)||' registrations='||(select count(*) from registrations);"

echo
echo "=========================================="
echo " apicheck=$API  stress=$STRESS  walk=$WALK"
echo "=========================================="
[ $API -eq 0 ] && [ $STRESS -eq 0 ] && [ $WALK -eq 0 ] && echo "ALL SUITES PASSED" || echo "SOMETHING FAILED"
