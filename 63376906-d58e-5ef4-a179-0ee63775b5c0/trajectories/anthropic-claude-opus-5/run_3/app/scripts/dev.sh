#!/bin/bash
# Restart the development server cleanly: stop whatever holds the port, then
# start again detached with its log where the checks can read it.
cd /app
# Stop every process running this server, by matching its own command line
# rather than a broad keyword, so nothing else in the container is touched.
for p in /proc/[0-9]*; do
  pid=$(basename "$p")
  [ -r "$p/cmdline" ] || continue
  case "$(tr '\0' ' ' < "$p/cmdline" 2>/dev/null)" in
    *"server/index.js"*) kill "$pid" 2>/dev/null ;;
  esac
done
sleep 1
for i in 1 2 3 4 5 6 7 8 9 10; do
  if ss -ltn 2>/dev/null | grep -q ':4173 '; then sleep 1; else break; fi
done
if [ "$1" = "reset" ]; then node scripts/reset-db.js; fi
setsid node server/index.js > /tmp/srv.log 2>&1 &
echo $! > /tmp/ravel.pid
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 2 http://127.0.0.1:4173/api/health 2>/dev/null)
  if [ "$code" = "200" ]; then echo "ready after ${i}s"; exit 0; fi
  sleep 1
done
echo "did not become ready"; tail -20 /tmp/srv.log; exit 1
