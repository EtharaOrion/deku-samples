#!/usr/bin/env bash
# Container entrypoint: build generated assets once, then serve in the foreground.
set -e
cd /app

export PYTHONDONTWRITEBYTECODE=1

mkdir -p /app/.browser_screenshots /app/.downloads

# an interpreter that actually carries the app's dependencies
PY="${PYTHON:-}"
if [ -z "$PY" ]; then
  for c in python3 /usr/local/bin/python3 /usr/bin/python3; do
    if "$c" -c "import gunicorn, flask, psycopg, PIL" >/dev/null 2>&1; then PY="$c"; break; fi
  done
fi
[ -n "$PY" ] || PY=python3

"$PY" scripts/build_assets.py

exec "$PY" -m gunicorn \
  --workers 2 \
  --threads 4 \
  --bind "0.0.0.0:${APP_INTERNAL_PORT:-4173}" \
  --access-logfile - \
  --error-logfile - \
  --timeout 60 \
  wsgi:app
