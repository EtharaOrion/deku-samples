#!/bin/sh
# Production entrypoint. Installs only when the lockfile moved, builds, then
# replaces this shell with the server so the process is not a child of a shell.
set -e

cd /app
mkdir -p .browser_screenshots .downloads

if [ -z "${APP_SECRET:-}" ]; then
  SECRET_FILE=".vela-runtime-secret"
  if [ ! -s "$SECRET_FILE" ]; then
    umask 077
    node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))' > "$SECRET_FILE"
  fi
  APP_SECRET="$(cat "$SECRET_FILE")"
  export APP_SECRET
fi

STAMP=".astro-install-stamp"
LOCK_SUM="$(md5sum package-lock.json | cut -d' ' -f1)"
if [ ! -d node_modules ] || [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$LOCK_SUM" ]; then
  echo "vela: installing dependencies"
  npm ci --no-audit --no-fund
  printf '%s' "$LOCK_SUM" > "$STAMP"
fi

# A failed build must not take the container down with it: keep trying so the
# mounted source can be corrected in place and the server comes up on its own.
while true; do
  echo "vela: building the production bundle"
  if npm run build; then
    echo "vela: serving the production bundle"
    exec node dist/server/entry.mjs
  fi
  echo "vela: the build failed, retrying in 10s"
  sleep 10
done
