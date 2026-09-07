#!/bin/bash
# Restarts the app for local checking, detached from this shell.
cd /app || exit 1
for p in $(ls /proc | grep -E '^[0-9]+$'); do
  if tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | grep -q 'server/index.js'; then
    kill -9 "$p" 2>/dev/null
  fi
done
sleep 1
setsid node server/index.js > /tmp/app.log 2>&1 < /dev/null &
sleep 5
curl -s -o /dev/null -w 'health %{http_code}\n' http://localhost:4173/api/health
