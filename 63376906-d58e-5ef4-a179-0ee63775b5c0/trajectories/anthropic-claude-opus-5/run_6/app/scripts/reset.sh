#!/bin/bash
# Drops and recreates the schema, then restarts the server so the seed re-runs.
# no ps or pgrep in this image: find the server through /proc
for p in $(ls /proc | grep -E '^[0-9]+$'); do
  c=$(tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null)
  case "$c" in *"server/index.js"*) kill "$p" 2>/dev/null ;; esac
done
sleep 2
rm -f /tmp/ravel.pid
psql "$DATABASE_URL" -q -t -c \
  "SELECT 'DROP TABLE IF EXISTS \"' || tablename || '\" CASCADE;' FROM pg_tables WHERE schemaname='public';" \
  | psql "$DATABASE_URL" -q > /dev/null 2>&1
cd /app || exit 1
node server/index.js > /tmp/srv.log 2>&1 &
echo $! > /tmp/ravel.pid
disown 2>/dev/null
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4173/api/health)
  if [ "$code" = "200" ]; then echo "ready"; exit 0; fi
  sleep 1
done
echo "did not become ready"
tail -20 /tmp/srv.log
exit 1
