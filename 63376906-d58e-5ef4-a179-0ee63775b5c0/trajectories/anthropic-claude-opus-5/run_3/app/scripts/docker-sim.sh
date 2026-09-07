#!/bin/bash
# Executes the Dockerfile's steps by hand, in order, from a copy of the source
# that honours .dockerignore. There is no Docker daemon in this environment, so
# this is how the image is read back as the machine executing it would.
set -u
cd /app

BUILD=/tmp/sim-build
RUN=/tmp/sim-run
rm -rf "$BUILD" "$RUN"
mkdir -p "$BUILD" "$RUN"

echo "=== build stage: WORKDIR /build ==="
# COPY package.json package-lock.json ./
cp package.json package-lock.json "$BUILD/" || { echo "FAIL: a manifest is missing"; exit 1; }

# RUN npm ci
( cd "$BUILD" && npm ci --no-audit --no-fund 2>&1 | tail -2 ) || { echo "FAIL: npm ci"; exit 1; }

# COPY client ./client   (honouring .dockerignore: no node_modules, no dist)
cp -r client "$BUILD/client"
rm -rf "$BUILD/client/node_modules" "$BUILD/client/dist"

# RUN npx vite build --config client/vite.config.js client
( cd "$BUILD" && npx vite build --config client/vite.config.js client 2>&1 | tail -6 ) \
  || { echo "FAIL: vite build"; exit 1; }
[ -f "$BUILD/client/dist/index.html" ] || { echo "FAIL: no index.html in the build output"; exit 1; }

echo
echo "=== runtime stage: WORKDIR /app ==="
cp package.json package-lock.json "$RUN/"
( cd "$RUN" && npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -2 ) || { echo "FAIL: npm ci --omit=dev"; exit 1; }

cp -r server "$RUN/server"
mkdir -p "$RUN/client"
cp -r "$BUILD/client/dist" "$RUN/client/dist"
mkdir -p "$RUN/.browser_screenshots" "$RUN/.downloads"
cp USER_README.md "$RUN/"

echo
echo "=== what the image contains ==="
( cd "$RUN" && ls -A && echo "--- client/dist ---" && ls client/dist && echo "--- fonts ---" && ls client/dist/fonts )

echo
echo "=== CMD node server/index.js, from /app ==="
for p in /proc/[0-9]*; do
  pid=$(basename "$p"); [ -r "$p/cmdline" ] || continue
  case "$(tr '\0' ' ' < "$p/cmdline" 2>/dev/null)" in *"server/index.js"*) kill "$pid" 2>/dev/null;; esac
done
sleep 2
node scripts/reset-db.js >/dev/null 2>&1
# Detached, with every stream redirected, so this script's own output pipe is
# not held open by the server it started.
( cd "$RUN" && setsid node server/index.js > /tmp/sim.log 2>&1 < /dev/null & ) >/dev/null 2>&1
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 2 http://127.0.0.1:4173/api/health 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 1
done
cat /tmp/sim.log
echo
echo "health:   $(curl -s http://127.0.0.1:4173/api/health)"
echo "index:    $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/)"
echo "script:   $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4173$(curl -s http://127.0.0.1:4173/ | grep -o '/assets/index-[^\"]*\.js' | head -1))"
echo "font:     $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/fonts/serif.woff2)"
echo "verify:   $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/api/verify/CERT-PILOT-000001)"
echo "console:  $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/console)"
echo
echo "The server is bound to:"
ss -ltn 2>/dev/null | grep 4173 || echo "  (ss unavailable)"
