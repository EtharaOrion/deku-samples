#!/bin/sh
# Starts the app detached from any shell, so it keeps running after the
# session that launched it ends. The container image does not use this script:
# there the process runs in the foreground as PID 1 (see Dockerfile CMD).
set -u

cd /app/server || exit 1

: "${PORT:=4173}"
: "${HOST:=0.0.0.0}"
export PORT HOST
export WEB_ROOT="${WEB_ROOT:-/app/web-dist}"

exec node dist/index.js
