#!/bin/bash
# Starts the production build detached from any shell, bound to 0.0.0.0.
# The container image runs `node dist/index.js` in the foreground instead;
# this script is for running the same build inside this workspace.
set -u

APP_DIR=/app
LOG=${DEKU_LOG:-/var/log/deku.log}

# Stop any instance that is already holding the port.
for p in /proc/[0-9]*; do
  pid=${p#/proc/}
  [ -r "$p/cmdline" ] || continue
  case "$(tr '\0' ' ' < "$p/cmdline" 2>/dev/null)" in
    *"dist/index.js"*) kill -9 "$pid" 2>/dev/null ;;
  esac
done
sleep 1

cd "$APP_DIR/server" || exit 1

# setsid puts the server in its own session, so it is not a child of this
# shell and does not die with it. Every address comes from the environment.
setsid env \
  STATIC_DIR="${STATIC_DIR:-$APP_DIR/web/dist/web/browser}" \
  PORT="${PORT:-4173}" \
  HOST="${HOST:-0.0.0.0}" \
  NODE_ENV=production \
  node dist/index.js >> "$LOG" 2>&1 < /dev/null &

for i in $(seq 1 30); do
  sleep 1
  if curl -fsS -o /dev/null "http://127.0.0.1:${PORT:-4173}/api/health"; then
    echo "deku is up on ${HOST:-0.0.0.0}:${PORT:-4173}"
    exit 0
  fi
done

echo "deku did not become healthy; last log lines:"
tail -20 "$LOG"
exit 1
