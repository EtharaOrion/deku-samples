#!/bin/bash
# There is no Docker daemon in this environment, so this reproduces what the image
# will contain: only the files the Dockerfile COPYs, with production dependencies
# only, started from a clean directory the way CMD will start it.
set -u
SIM=/tmp/ravel-image
rm -rf "$SIM"
mkdir -p "$SIM"

cd /app || exit 1

# --- build stage: the client is built from client/, public/ and vite.config.js ---
echo "[build stage] copying build inputs"
mkdir -p "$SIM/build"
cp package.json package-lock.json vite.config.js "$SIM/build/"
cp -r client public "$SIM/build/"
cd "$SIM/build" || exit 1
echo "[build stage] npm ci"
npm ci --silent > /tmp/sim-npm-build.log 2>&1 || { echo "npm ci FAILED"; tail -5 /tmp/sim-npm-build.log; exit 1; }
echo "[build stage] npm run build"
npm run build > /tmp/sim-build.log 2>&1 || { echo "build FAILED"; tail -20 /tmp/sim-build.log; exit 1; }
[ -f "$SIM/build/dist/index.html" ] || { echo "dist/index.html MISSING after build"; exit 1; }
echo "[build stage] dist produced: $(ls "$SIM/build/dist" | tr '\n' ' ')"

# --- runtime stage: only what the Dockerfile COPYs into the final image ---
echo "[runtime stage] assembling"
mkdir -p "$SIM/app"
cd /app || exit 1
cp package.json package-lock.json "$SIM/app/"
cp -r server db "$SIM/app/"
cp USER_README.md "$SIM/app/"
cp -r "$SIM/build/dist" "$SIM/app/dist"
mkdir -p "$SIM/app/.browser_screenshots" "$SIM/app/.downloads"

cd "$SIM/app" || exit 1
echo "[runtime stage] npm ci --omit=dev"
npm ci --omit=dev --silent > /tmp/sim-npm-run.log 2>&1 || { echo "npm ci --omit=dev FAILED"; tail -5 /tmp/sim-npm-run.log; exit 1; }

echo "[runtime stage] contents:"
ls -A "$SIM/app"

echo "[runtime stage] starting as CMD does, on a free port"
export RAVEL_PORT=4183
node server/index.js > /tmp/sim-server.log 2>&1 &
SIMPID=$!
echo "$SIMPID" > /tmp/sim.pid
sleep 1
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4183/api/health 2>/dev/null)
  if [ "$code" = "200" ]; then echo "[runtime stage] health 200 after ${i}s"; break; fi
  sleep 1
done
echo "--- server log ---"
tail -8 /tmp/sim-server.log
