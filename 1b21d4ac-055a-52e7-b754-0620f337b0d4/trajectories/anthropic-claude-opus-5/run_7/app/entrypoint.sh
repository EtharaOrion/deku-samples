#!/bin/sh
# Wait for the backing service, apply the schema and seed idempotently, then serve in the
# foreground. Every address is read from the environment at container start.
set -u

PORT="${PORT:-4173}"

echo "cirrus: applying schema and seed"
python -m cirrus.seed || exit 1

echo "cirrus: serving on 0.0.0.0:${PORT}"
# The app writes its own request line, so gunicorn's access log stays off: one line per request.
exec gunicorn \
  --bind "0.0.0.0:${PORT}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --threads "${WEB_THREADS:-4}" \
  --timeout 60 \
  --graceful-timeout 20 \
  --error-logfile - \
  --capture-output \
  "cirrus.app:app"
