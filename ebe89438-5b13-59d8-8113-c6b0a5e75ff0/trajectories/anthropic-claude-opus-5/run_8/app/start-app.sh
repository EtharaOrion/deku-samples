#!/bin/bash
# Start the production server detached from any shell, on the container-internal
# port this brief names, bound to 0.0.0.0. Mirrors what the image's CMD does.
cd /app/server
export PORT="${PORT:-4173}"
export HOST="${HOST:-0.0.0.0}"
export STATIC_DIR="${STATIC_DIR:-/app/server/public}"
export NODE_ENV=production
setsid nohup node dist/index.js >> /app/server/app.log 2>&1 < /dev/null &
disown
