#!/bin/bash
# Development helper only. Not shipped in the image.
for p in $(ls /proc | grep -E '^[0-9]+$'); do
  c=$(tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null)
  case "$c" in *"server/src/index.js"*) kill -9 "$p" 2>/dev/null ;; esac
done
sleep 2
if [ "$1" = "reset" ]; then
  psql "$DATABASE_URL" -q -t -A -c "select 'drop table if exists \"'||tablename||'\" cascade;' from pg_tables where schemaname='public'" | psql "$DATABASE_URL" -q >/dev/null 2>&1
  echo "db reset"
fi
cd /app || exit 1
nohup node server/src/index.js > /tmp/srv.log 2>&1 &
for i in $(seq 1 40); do
  sleep 1
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4173/api/health)
  if [ "$code" = "200" ]; then echo "ready after ${i}s"; exit 0; fi
done
echo "NOT READY"
tail -30 /tmp/srv.log
exit 1
