#!/bin/bash
cd /app/server
for p in /proc/[0-9]*; do
  if grep -qa "dist/index.js" "$p/cmdline" 2>/dev/null; then kill "${p#/proc/}" 2>/dev/null; fi
done
sleep 1
if [ "$1" = "reset" ]; then
  psql "$DATABASE_URL" -q -c "DROP TABLE IF EXISTS email_log, registrations, events, calendars, accounts, auth_rate_limits CASCADE;" || exit 1
  curl -s -X DELETE http://mailpit:8025/api/v1/messages >/dev/null
fi
npx tsc -p tsconfig.json || exit 1
mkdir -p public
[ -f public/index.html ] || echo '<!doctype html><html><head></head><body>ok</body></html>' > public/index.html
STATIC_DIR=public PORT=4180 setsid node dist/index.js > /tmp/srv.log 2>&1 &
for i in $(seq 1 30); do
  sleep 1
  if curl -sf http://localhost:4180/api/health >/dev/null; then echo "server ready"; exit 0; fi
done
echo "server did not come up"; tail -20 /tmp/srv.log; exit 1
