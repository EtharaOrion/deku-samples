#!/bin/sh
# Starts the production build detached from any shell, so it keeps running
# after the session that started it ends. The Dockerfile runs the same server
# in the foreground instead; this script is only for running it in this
# container, outside a Docker daemon.
set -u

APP_DIR=/app
RUNTIME_DIR=/app/.runtime
LOG=/app/.runtime/app.log

mkdir -p "$RUNTIME_DIR"

# Assemble the same layout the runtime image has: compiled server, production
# dependencies, and the built static output.
rm -rf "$RUNTIME_DIR/dist" "$RUNTIME_DIR/public"
cp -r "$APP_DIR/server/dist" "$RUNTIME_DIR/dist"
cp -r "$APP_DIR/web/dist/web/browser" "$RUNTIME_DIR/public"
cp "$APP_DIR/server/package.json" "$APP_DIR/server/package-lock.json" "$RUNTIME_DIR/"

if [ ! -d "$RUNTIME_DIR/node_modules" ]; then
  (cd "$RUNTIME_DIR" && npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1)
fi

# Stop any instance already holding the port.
for p in /proc/[0-9]*; do
  pid=${p#/proc/}
  if tr '\0' ' ' < "$p/cmdline" 2>/dev/null | grep -q "dist/index.js"; then
    kill "$pid" 2>/dev/null
  fi
done
sleep 1

# setsid detaches the process from this shell's session, so it is not a child
# of the shell and does not die with it.
cd "$RUNTIME_DIR" || exit 1
NODE_ENV=production \
PORT="${PORT:-4173}" \
HOST=0.0.0.0 \
WEB_ROOT="$RUNTIME_DIR/public" \
  setsid nohup node dist/index.js >> "$LOG" 2>&1 < /dev/null &

sleep 6
printf 'health: '
curl -s "http://127.0.0.1:${PORT:-4173}/api/health" || echo 'not answering yet'
echo
