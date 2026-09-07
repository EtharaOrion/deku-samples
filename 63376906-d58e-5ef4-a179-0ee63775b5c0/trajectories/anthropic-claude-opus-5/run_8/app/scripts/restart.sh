#!/bin/bash
# Restarts the local app for development checks.
cd /app
for p in /proc/[0-9]*; do
  if grep -qa "server/index.js" "$p/cmdline" 2>/dev/null; then kill -9 "$(basename "$p")" 2>/dev/null; fi
done
sleep 1
if [ "$1" = "reset" ]; then node scripts/reset.mjs; fi
setsid node server/index.js > /tmp/server.log 2>&1 &
for i in $(seq 1 40); do
  if curl -sf -m 2 http://localhost:4173/api/health > /dev/null; then echo "up"; exit 0; fi
  sleep 0.5
done
echo "failed to start"; tail -20 /tmp/server.log; exit 1
