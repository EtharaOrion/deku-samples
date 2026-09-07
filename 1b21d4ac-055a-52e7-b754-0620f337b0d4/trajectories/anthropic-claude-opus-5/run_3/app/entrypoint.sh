#!/bin/sh
# No service is reachable during the build, so the schema and the seed are
# applied here, at container start, once and idempotently, before the workers
# come up.
set -e

PORT="${PORT:-4173}"

echo "cirrus: applying the schema and the seed"
python -c "from cirrus.db import init_db; init_db()"

echo "cirrus: serving on 0.0.0.0:${PORT}"
export CIRRUS_SKIP_INIT=1
exec gunicorn \
  --bind "0.0.0.0:${PORT}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --threads "${WEB_THREADS:-8}" \
  --timeout 60 \
  --graceful-timeout 30 \
  --access-logfile - \
  --error-logfile - \
  --capture-output \
  wsgi:app
