
#!/bin/sh
# Starts the production build detached from this shell, so it survives the
# session, using the same command and environment the container image uses.
set -u
cd /app
./tests/stop.sh "dist/index.js" > /dev/null 2>&1
./tests/stop.sh "src/index.ts" > /dev/null 2>&1
sleep 2
cd /app/server
setsid env NODE_ENV=production PORT=4173 HOST=0.0.0.0 STATIC_DIR=/app/web/dist/web/browser \
  node dist/index.js > /tmp/deku.log 2>&1 < /dev/null &
disown 2>/dev/null || true
for i in $(seq 1 40); do
  sleep 1
  curl -sf -m2 http://localhost:4173/api/health > /dev/null 2>&1 && { echo "running"; exit 0; }
done
echo "did not start" >&2
tail -5 /tmp/deku.log >&2
exit 1
