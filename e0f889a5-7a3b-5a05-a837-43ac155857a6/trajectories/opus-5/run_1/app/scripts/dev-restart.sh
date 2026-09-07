#!/usr/bin/env bash
# Rebuild and restart the local app for development checks only.
# Production start is `node server/index.js` from the Dockerfile CMD.
set -u
cd /app || exit 1

for p in /proc/[0-9]*; do
  if grep -qa "server/index.js" "$p/cmdline" 2>/dev/null; then
    kill -9 "${p#/proc/}" 2>/dev/null
  fi
done
sleep 1

if [ "${1:-}" != "--no-build" ]; then
  npx astro build > /tmp/build.log 2>&1 || { echo "build failed"; tail -30 /tmp/build.log; exit 1; }
fi

setsid nohup node server/index.js > /tmp/server.log 2>&1 < /dev/null &
sleep 4
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -m 2 -w "%{http_code}" http://127.0.0.1:4173/api/health)
  if [ "$code" = "200" ]; then echo "up"; exit 0; fi
  sleep 1
done
echo "did not come up"
tail -20 /tmp/server.log
exit 1
