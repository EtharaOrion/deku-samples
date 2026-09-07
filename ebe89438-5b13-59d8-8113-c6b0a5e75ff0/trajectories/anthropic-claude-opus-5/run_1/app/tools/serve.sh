#!/usr/bin/env bash
# Starts the production server on the container-internal port, detached from
# this shell so it outlives the session. Grading builds the Dockerfile instead;
# this only keeps the app reachable in the meantime.
PORT_APP=${PORT:-4173}

for p in $(ls /proc | grep -E '^[0-9]+$'); do
  c=$(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null)
  case "$c" in *"dist/index.js"*) kill "$p" 2>/dev/null;; esac
done
sleep 1

cd /app/server || exit 1
PORT=$PORT_APP HOST=0.0.0.0 NODE_ENV=production \
  setsid nohup node dist/index.js </dev/null >> /app/server/server.log 2>&1 &
disown 2>/dev/null

for i in $(seq 1 40); do
  sleep 1
  if curl -sf "http://127.0.0.1:$PORT_APP/api/health" >/dev/null 2>&1; then
    echo "serving on 0.0.0.0:$PORT_APP"
    exit 0
  fi
done
echo "did not come up"
tail -20 /app/server/server.log
exit 1
