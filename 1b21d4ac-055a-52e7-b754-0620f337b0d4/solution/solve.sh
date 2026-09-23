#!/usr/bin/env bash
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_SRC="${HERE}/app"
MANIFEST="${APP_SRC}/run.json"

fail() {
    echo "solve.sh: FAILED: $*" >&2
    exit 1
}

if [ ! -f "${MANIFEST}" ]; then
    fail "no run manifest at solution/app/run.json. The reference application for this task is DEFERRED and is generated downstream from solution/checklist.md. Until that code lands this bundle is MECHANICALLY-GREEN, NO-SOLUTION and solve.sh cannot deploy anything."
fi

python3 - "${MANIFEST}" <<'PY' || fail "run.json did not satisfy the run-manifest-v1 contract"
import json
import sys

with open(sys.argv[1], encoding="utf-8") as fh:
    m = json.load(fh)
for k in ("install", "build", "serve"):
    if not isinstance(m.get(k), str):
        print("run.json: missing string field " + k, file=sys.stderr)
        raise SystemExit(1)
serve = m["serve"].strip()
if not serve:
    print("run.json: serve must not be empty", file=sys.stderr)
    raise SystemExit(1)
for bad in ("setsid", "nohup", "disown"):
    if bad in serve:
        print("run.json: serve must run in the foreground, found " + bad, file=sys.stderr)
        raise SystemExit(1)
if serve.endswith("&"):
    print("run.json: serve must run in the foreground, found a trailing &", file=sys.stderr)
    raise SystemExit(1)
PY

if [ -z "$(ls -A "${APP_SRC}" 2>/dev/null | grep -v -e '^run.json$' -e '^USER_README.md$')" ]; then
    fail "solution/app/ carries only its manifest and its README. The reference application is DEFERRED (D20) and is generated downstream from solution/checklist.md."
fi

for var in APP_PUBLIC_PORT DATABASE_URL; do
    if [ -z "${!var:-}" ]; then
        fail "required environment variable ${var} is not set"
    fi
done

mkdir -p /app
cp -a "${APP_SRC}/." /app/
mkdir -p /app/.browser_screenshots /app/.downloads
cd /app || fail "cannot enter /app"

INSTALL="$(python3 -c 'import json,sys;print(json.load(open("/app/run.json"))["install"])')"
BUILD="$(python3 -c 'import json,sys;print(json.load(open("/app/run.json"))["build"])')"
SERVE="$(python3 -c 'import json,sys;print(json.load(open("/app/run.json"))["serve"])')"

if [ -n "${INSTALL}" ]; then
    echo "solve.sh: install"
    sh -c "${INSTALL}" || fail "install step returned non-zero"
fi

if [ -n "${BUILD}" ]; then
    echo "solve.sh: build"
    sh -c "${BUILD}" || fail "build step returned non-zero"
fi

echo "solve.sh: serve"
setsid sh -c "${SERVE}" > /app/server.log 2>&1 < /dev/null &

HEALTH="http://localhost:${APP_PUBLIC_PORT}/api/health"
for _ in $(seq 1 120); do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' "${HEALTH}" || true)"
    if [ "${CODE}" = "200" ]; then
        echo "solve.sh: healthy at ${HEALTH}"
        exit 0
    fi
    sleep 1
done

echo "solve.sh: ${HEALTH} never returned 200. Server log follows." >&2
tail -n 200 /app/server.log >&2 || true
exit 1
