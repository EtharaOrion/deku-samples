#!/bin/sh
# Starts the production build on the container-internal port the brief names,
# bound to every interface. Every service address is read from the environment;
# none is written here.
#
# In the shipped image the Dockerfile runs `node dist/index.js` directly, in the
# foreground as PID 1. This script is the same build inside this development
# container, started detached from the shell and kept up if it ever stops.
set -u

export NODE_ENV=production
export STATIC_DIR=${STATIC_DIR:-/app/web/dist/web/browser}
export PORT=${PORT:-4173}
export BIND_HOST=${BIND_HOST:-0.0.0.0}

cd /app/server

while true; do
  node dist/index.js
  echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"warn\",\"message\":\"server exited, restarting\"}"
  sleep 2
done
