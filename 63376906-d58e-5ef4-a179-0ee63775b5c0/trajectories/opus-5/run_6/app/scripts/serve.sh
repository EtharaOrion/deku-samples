#!/bin/bash
# Starts the production server detached from this shell, so it survives the session.
# In the graded image this is not used: the Dockerfile's CMD runs the same server
# in the foreground as PID 1.
cd /app || exit 1
for p in $(ls /proc | grep -E '^[0-9]+$'); do
  c=$(tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null)
  case "$c" in *"server/index.js"*) kill "$p" 2>/dev/null ;; esac
done
sleep 2
setsid nohup node server/index.js > /tmp/ravel-server.log 2>&1 < /dev/null &
echo $! > /tmp/ravel.pid
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4173/api/health)
  if [ "$code" = "200" ]; then
    echo "ravel is serving on 0.0.0.0:4173 (pid $(cat /tmp/ravel.pid))"
    exit 0
  fi
  sleep 1
done
echo "did not become ready"
tail -20 /tmp/ravel-server.log
exit 1
