#!/bin/bash
# Reproduces what the Dockerfile does, in a clean directory, using only the
# files the build context would carry. There is no Docker daemon here, so this
# is how the image is proved: copy as COPY would, install as RUN would, build,
# then start the runtime tree on its own and call it over HTTP.
set -u

CTX=/tmp/vela-image-ctx
RUN=/tmp/vela-image-run
rm -rf "$CTX" "$RUN"
mkdir -p "$CTX"

echo "== build context (honouring .dockerignore) =="
cd /app || exit 1
# Everything the Dockerfile COPYs, and nothing .dockerignore excludes.
cp package.json package-lock.json astro.config.mjs USER_README.md "$CTX"/
cp -r src public server "$CTX"/
echo "context holds: $(cd "$CTX" && ls)"
for forbidden in node_modules dist .git scripts .browser_screenshots; do
  if [ -e "$CTX/$forbidden" ]; then echo "FAIL: $forbidden leaked into the context"; exit 1; fi
done
echo "no ignored path leaked into the context"

echo
echo "== build stage: npm install --omit=dev =="
cd "$CTX" || exit 1
npm install --omit=dev --no-audit --no-fund > /tmp/img-install.log 2>&1 || { tail -20 /tmp/img-install.log; exit 1; }
echo "installed"

echo "== build stage: npm run build =="
npm run build > /tmp/img-build.log 2>&1 || { tail -30 /tmp/img-build.log; exit 1; }
echo "built"

echo
echo "== runtime stage: assemble only what the image keeps =="
mkdir -p "$RUN"
cp -r "$CTX/node_modules" "$RUN"/node_modules
cp -r "$CTX/dist" "$RUN"/dist
cp "$CTX/package.json" "$RUN"/package.json
cp -r "$CTX/server" "$RUN"/server
cp "$CTX/USER_README.md" "$RUN"/USER_README.md
mkdir -p "$RUN/.browser_screenshots" "$RUN/.downloads"
echo "runtime tree: $(cd "$RUN" && ls -A)"

echo
echo "== start it exactly as CMD does =="
cd "$RUN" || exit 1
PORT=4199 HOST=0.0.0.0 NODE_ENV=production setsid node server/index.js > /tmp/img-app.log 2>&1 < /dev/null &
for i in $(seq 1 40); do
  sleep 1
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4199/api/health 2>/dev/null)
  [ "$code" = "200" ] && break
done
echo "health: $code"
