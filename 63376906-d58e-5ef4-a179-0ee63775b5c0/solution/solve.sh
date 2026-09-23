#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$HERE/app/run.json"

if [ ! -f "$MANIFEST" ]; then
  echo "solve.sh: $MANIFEST is absent." >&2
  exit 1
fi

if [ -z "$(find "$HERE/app" -type f ! -name USER_README.md ! -name run.json -print -quit)" ]; then
  echo "solve.sh: no reference application ships with this bundle." >&2
  echo "" >&2
  echo "This task exits the generation kit in state MECHANICALLY-GREEN, NO-SOLUTION" >&2
  echo "(D20, app-deferred). solution/app/ carries only USER_README.md and the run" >&2
  echo "manifest; the oracle application is generated downstream from" >&2
  echo "solution/checklist.md and then proven by 'harbor run -a oracle' returning" >&2
  echo "1.0 on two consecutive runs." >&2
  echo "" >&2
  echo "Failing loudly rather than exiting 0, because a silent success here would" >&2
  echo "read as a passing oracle to anything that only checks the exit code." >&2
  exit 1
fi

INSTALL="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["install"])' "$MANIFEST")"
BUILD="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["build"])' "$MANIFEST")"
SERVE="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["serve"])' "$MANIFEST")"

mkdir -p /app/.browser_screenshots /app/.downloads
cp -R "$HERE/app/." /app/

for var in APP_PUBLIC_PORT DATABASE_URL AUTH_ISSUER_URL SMTP_HOST; do
  if [ -z "${!var:-}" ]; then
    echo "solve.sh: $var is unset; the App Contract requires it from the environment." >&2
    exit 1
  fi
done

[ -n "$INSTALL" ] && eval "$INSTALL"
[ -n "$BUILD" ] && eval "$BUILD"

setsid bash -c "$SERVE" >/app/serve.log 2>&1 < /dev/null &

for _ in $(seq 1 120); do
  if curl -fsS "http://localhost:${APP_PUBLIC_PORT}/api/health" >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

echo "solve.sh: the app never answered /api/health within 120 seconds." >&2
cat /app/serve.log >&2 || true
exit 1
