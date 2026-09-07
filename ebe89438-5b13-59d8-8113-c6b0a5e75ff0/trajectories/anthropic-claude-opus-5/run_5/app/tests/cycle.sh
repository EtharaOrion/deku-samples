#!/bin/sh
# Stops the app, waits for the port to be free, drops the schema and starts a
# fresh instance against the freshly seeded database.
set -u
cd /app

STATIC_DIR="${STATIC_DIR:-/app/web/dist/web/browser}"
if [ ! -f "$STATIC_DIR/index.html" ]; then
  echo "no application shell at $STATIC_DIR; build the front end first" >&2
  exit 1
fi

./tests/stop.sh "src/index.ts" > /dev/null 2>&1
for i in $(seq 1 20); do
  curl -sf -m1 http://localhost:4180/api/health > /dev/null 2>&1 || break
  sleep 1
done
sleep 2

./tests/reset.sh 2>/dev/null
remaining=$(psql "$DATABASE_URL" -t -A -c "select count(*) from information_schema.tables where table_schema='public' and table_name in ('accounts','events','registrations','calendars','email_log')")
if [ "$remaining" != "0" ]; then
  echo "reset did not take: $remaining tables remain" >&2
  exit 1
fi

curl -s -X DELETE "http://${SMTP_HOST}:8025/api/v1/messages" > /dev/null 2>&1

cd /app/server
STATIC_DIR="${STATIC_DIR:-/app/web/dist/web/browser}" PORT=4180 nohup npx tsx src/index.ts > /tmp/server.log 2>&1 &
for i in $(seq 1 40); do
  sleep 1
  curl -sf -m2 http://localhost:4180/api/health > /dev/null 2>&1 && exit 0
done
echo "app never became ready" >&2
tail -5 /tmp/server.log >&2
exit 1
