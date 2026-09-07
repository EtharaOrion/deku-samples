#!/usr/bin/env bash
# Replays the Dockerfile's build steps against a copy of the source that honours
# .dockerignore, so the image is proved from the source alone rather than from
# anything this session left lying about.
set -u
CTX=/tmp/dockerctx
OUT=/tmp/dockerout
rm -rf "$CTX" "$OUT"
mkdir -p "$CTX"

echo "== assembling the build context (honouring .dockerignore)"
cd /app
rsync -a \
  --exclude 'node_modules' \
  --exclude 'web/dist' \
  --exclude 'server/dist' \
  --exclude 'server/public' \
  --exclude '.browser_screenshots' \
  --exclude '.downloads' \
  --exclude 'tools' \
  --exclude '.git' \
  --exclude '*.log' \
  --exclude '.angular' \
  --exclude '.vscode' \
  ./ "$CTX/"
echo "context contents:"
ls -A "$CTX"

# ---- stage 1: web ----
echo
echo "== stage web: COPY web/package.json web/package-lock.json + npm ci"
mkdir -p "$OUT/build/web"
cp "$CTX/web/package.json" "$CTX/web/package-lock.json" "$OUT/build/web/" || { echo "MISSING web manifests"; exit 1; }
( cd "$OUT/build/web" && npm ci --no-audit --no-fund --silent ) || { echo "npm ci failed in web stage"; exit 1; }

echo "== stage web: COPY tsconfigs, angular.json, public, src"
for f in tsconfig.json tsconfig.app.json angular.json; do
  cp "$CTX/web/$f" "$OUT/build/web/" || { echo "MISSING web/$f"; exit 1; }
done
cp -r "$CTX/web/public" "$OUT/build/web/public" || { echo "MISSING web/public"; exit 1; }
cp -r "$CTX/web/src" "$OUT/build/web/src" || { echo "MISSING web/src"; exit 1; }

echo "== stage web: ng build --configuration production"
( cd "$OUT/build/web" && npx ng build --configuration production ) || { echo "ng build failed"; exit 1; }
test -f "$OUT/build/web/dist/web/browser/index.html" || { echo "no index.html produced"; exit 1; }

# ---- stage 2: api ----
echo
echo "== stage api: COPY server manifests + npm ci"
mkdir -p "$OUT/build/server"
cp "$CTX/server/package.json" "$CTX/server/package-lock.json" "$OUT/build/server/" || { echo "MISSING server manifests"; exit 1; }
( cd "$OUT/build/server" && npm ci --no-audit --no-fund --silent ) || { echo "npm ci failed in api stage"; exit 1; }

echo "== stage api: COPY tsconfig + src, then tsc"
cp "$CTX/server/tsconfig.json" "$OUT/build/server/" || { echo "MISSING server/tsconfig.json"; exit 1; }
cp -r "$CTX/server/src" "$OUT/build/server/src" || { echo "MISSING server/src"; exit 1; }
( cd "$OUT/build/server" && npx tsc -p tsconfig.json ) || { echo "tsc failed"; exit 1; }
test -f "$OUT/build/server/dist/index.js" || { echo "no dist/index.js produced"; exit 1; }

# ---- stage 3: runtime ----
echo
echo "== stage runtime: production dependencies only"
mkdir -p "$OUT/app"
cp "$CTX/server/package.json" "$CTX/server/package-lock.json" "$OUT/app/"
( cd "$OUT/app" && NODE_ENV=production npm ci --omit=dev --no-audit --no-fund --silent ) || { echo "runtime npm ci failed"; exit 1; }

echo "== stage runtime: COPY dist, public, USER_README.md"
cp -r "$OUT/build/server/dist" "$OUT/app/dist"
cp -r "$OUT/build/web/dist/web/browser" "$OUT/app/public"
cp "$CTX/USER_README.md" "$OUT/app/USER_README.md" || { echo "MISSING USER_README.md"; exit 1; }
mkdir -p "$OUT/app/.browser_screenshots" "$OUT/app/.downloads"

echo
echo "== the image filesystem at /app:"
ls -A "$OUT/app"
echo "public/ holds: $(ls "$OUT/app/public" | wc -l) files, index.html present: $([ -f "$OUT/app/public/index.html" ] && echo yes || echo NO)"

echo
echo "== CMD [\"node\", \"dist/index.js\"] with PORT=4173 HOST=0.0.0.0"
cd "$OUT/app"
PORT=4399 HOST=0.0.0.0 NODE_ENV=production setsid node dist/index.js </dev/null > /tmp/dockerrun.log 2>&1 &
sleep 1
for i in $(seq 1 40); do
  sleep 1
  if curl -sf "http://127.0.0.1:4399/api/health" > /dev/null 2>&1; then
    echo "HEALTH OK after ${i}s"
    break
  fi
  if [ "$i" = "40" ]; then echo "NEVER BECAME HEALTHY"; tail -20 /tmp/dockerrun.log; exit 1; fi
done

echo "health:   $(curl -s http://127.0.0.1:4399/api/health)"
echo "events:   $(curl -s http://127.0.0.1:4399/api/events | head -c 120)..."
echo "shell:    $(curl -s http://127.0.0.1:4399/ | head -c 90)"
echo "themed:   $(curl -s http://127.0.0.1:4399/thursday-night-5k | grep -o '\--event-key:#[0-9a-f]*')"
echo "asset:    $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4399/index.html)"
echo "binding:  $(grep -o '"host":"[^"]*"' /tmp/dockerrun.log | head -1)"

for p in $(ls /proc | grep -E '^[0-9]+$'); do
  c=$(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null)
  case "$c" in *"dist/index.js"*) case "$c" in *4399*) ;; esac;; esac
done
echo
echo "DOCKERFILE REPLAY PASSED"
