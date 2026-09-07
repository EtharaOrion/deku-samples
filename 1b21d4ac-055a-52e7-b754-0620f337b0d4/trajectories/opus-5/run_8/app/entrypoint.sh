#!/bin/sh
# Apply the schema and the idempotent seed, then serve in the foreground.
set -e

cd /app

# The container-internal port is fixed at 4173 by the deployment contract;
# APP_PUBLIC_PORT is what the outside world maps onto it. Neither is hardcoded
# into the application source.
PORT="${PORT:-4173}"

echo "cirrus: seeding"
python seed.py

echo "cirrus: serving on 0.0.0.0:${PORT}"
# The app writes its own single request line; gunicorn's access log is off so
# each request leaves exactly one line on stdout.
exec gunicorn \
    --bind "0.0.0.0:${PORT}" \
    --workers "${WEB_CONCURRENCY:-2}" \
    --threads 4 \
    --timeout 60 \
    --error-logfile - \
    wsgi:app
