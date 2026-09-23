#!/usr/bin/env bash
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${HERE}/app/run.json"

if [ ! -f "${MANIFEST}" ]; then
  echo "solve.sh: ${MANIFEST} is absent. solution/app/ carries no reference code yet." >&2
  echo "solve.sh: this bundle is MECHANICALLY-GREEN, NO-SOLUTION and cannot be deployed." >&2
  exit 1
fi

if ! ls "${HERE}/app" | grep -qv -e '^run.json$' -e '^USER_README.md$'; then
  echo "solve.sh: solution/app/ carries only the manifest and the credentials file." >&2
  echo "solve.sh: generate the reference application before running this script." >&2
  exit 1
fi

read_field() {
  python3 - "$MANIFEST" "$1" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    print(json.load(fh).get(sys.argv[2], ""))
PY
}

INSTALL="$(read_field install)"
BUILD="$(read_field build)"
SERVE="$(read_field serve)"

if [ -z "${SERVE}" ]; then
  echo "solve.sh: run.json declares no serve command." >&2
  exit 1
fi

mkdir -p /app
cp -a "${HERE}/app/." /app/
mkdir -p /app/.browser_screenshots /app/.downloads

for var in APP_PUBLIC_PORT DATABASE_URL SMTP_HOST PAYMENTS_API_URL; do
  if [ -z "${!var:-}" ]; then
    echo "solve.sh: required environment variable ${var} is not set." >&2
    exit 1
  fi
done

if [ -n "${INSTALL}" ]; then
  echo "solve.sh: install"
  sh -c "${INSTALL}" || { echo "solve.sh: install failed" >&2; exit 1; }
fi

if [ -n "${BUILD}" ]; then
  echo "solve.sh: build"
  sh -c "${BUILD}" || { echo "solve.sh: build failed" >&2; exit 1; }
fi

echo "solve.sh: serve"
setsid sh -c "${SERVE}" >/tmp/app.log 2>&1 < /dev/null &
disown || true

DEADLINE=$(( $(date +%s) + 120 ))
while [ "$(date +%s)" -lt "${DEADLINE}" ]; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${APP_PUBLIC_PORT}/api/health" || true)"
  if [ "${CODE}" = "200" ]; then
    echo "solve.sh: healthy"
    exit 0
  fi
  sleep 2
done

echo "solve.sh: health did not reach 200 within 120s" >&2
tail -n 200 /tmp/app.log >&2 || true
exit 1
