#!/bin/bash
# Development helper: rebuild and restart the app for local verification.
# This container has no ps/pkill, so the pid is tracked in a file.
cd /app
PIDFILE=/tmp/vela.pid
if [ -f "$PIDFILE" ]; then
  OLD=$(cat "$PIDFILE")
  if [ -n "$OLD" ] && kill -0 "$OLD" 2>/dev/null; then kill "$OLD" 2>/dev/null; fi
fi
# Wait for the port to be released.
for i in $(seq 1 15); do
  curl -s -o /dev/null -m 1 http://localhost:4173/api/health || break
  sleep 1
done
if [ "$1" = "build" ]; then
  npx astro build > /tmp/build.log 2>&1 || { tail -25 /tmp/build.log; exit 1; }
fi
setsid node server/index.mjs > /tmp/vela.log 2>&1 < /dev/null &
echo $! > "$PIDFILE"
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 2 http://localhost:4173/api/health)
  [ "$code" = "200" ] && echo "up after ${i}s (pid $(cat $PIDFILE))" && exit 0
  sleep 1
done
echo "did not come up"; tail -25 /tmp/vela.log; exit 1
