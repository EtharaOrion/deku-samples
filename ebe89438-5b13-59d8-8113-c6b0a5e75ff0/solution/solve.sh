#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_SRC="${HERE}/app"
MANIFEST="${APP_SRC}/run.json"
WORKDIR=/app

if [ ! -f "${MANIFEST}" ]; then
  echo "solution/app/run.json is absent - the reference app has not been authored." >&2
  echo "The oracle gate cannot pass until ${APP_SRC} carries a run manifest." >&2
  exit 1
fi

read_field() {
  python3 - "$MANIFEST" "$1" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    print(json.load(fh).get(sys.argv[2], ""))
PY
}

INSTALL_CMD="$(read_field install)"
BUILD_CMD="$(read_field build)"
SERVE_CMD="$(read_field serve)"

if [ -z "${SERVE_CMD}" ]; then
  echo "run.json declares no serve command." >&2
  exit 1
fi

: "${APP_PUBLIC_PORT:=4173}"
: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${SMTP_HOST:?SMTP_HOST is not set}"
: "${SMTP_PORT:?SMTP_PORT is not set}"

mkdir -p "${WORKDIR}"
cp -a "${APP_SRC}/." "${WORKDIR}/"
cd "${WORKDIR}"
mkdir -p .browser_screenshots .downloads

if [ -n "${INSTALL_CMD}" ]; then
  bash -lc "${INSTALL_CMD}"
fi
if [ -n "${BUILD_CMD}" ]; then
  bash -lc "${BUILD_CMD}"
fi

setsid bash -lc "${SERVE_CMD}" > /tmp/app.log 2>&1 < /dev/null &

for _ in $(seq 1 120); do
  if curl -fsS "http://localhost:${APP_PUBLIC_PORT}/api/health" > /dev/null 2>&1; then
    echo "app healthy on ${APP_PUBLIC_PORT}"
    exit 0
  fi
  sleep 1
done

echo "health check never returned 200 within 120s" >&2
tail -n 200 /tmp/app.log >&2 || true
exit 1
