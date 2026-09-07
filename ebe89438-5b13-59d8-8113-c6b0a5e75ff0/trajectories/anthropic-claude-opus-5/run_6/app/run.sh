#!/bin/sh
# Keeps the app serving on the container-internal port, restarting it if it exits.
# Every address is read from the environment; nothing here is hardcoded.
cd /app
while true; do
  PORT="${PORT:-4173}" HOST="${HOST:-0.0.0.0}" STATIC_DIR="${STATIC_DIR:-/app/public}" \
    node dist/index.js >> /app/server.log 2>&1
  echo "{\"level\":\"warn\",\"msg\":\"server exited, restarting\"}" >> /app/server.log
  sleep 2
done
