#!/bin/sh
# Applies the schema and the seed once, then serves in the foreground on 0.0.0.0.
set -e

cd /app

# Every service address is read from the environment at container start.
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set; the app has nowhere to keep its records" >&2
  exit 1
fi

# Idempotent: a restart adds no rows, and the advisory lock keeps two starts apart.
python bootstrap.py

# A production WSGI server, in the foreground, bound to every interface. A
# loopback-only listener would be unreachable from outside the container. 4173 is the
# container-internal port the deployment contract names; APP_PUBLIC_PORT is what the
# outside world maps onto it and is never bound here.
exec gunicorn \
  --bind "0.0.0.0:4173" \
  --workers "${WEB_CONCURRENCY:-3}" \
  --threads 4 \
  --timeout 60 \
  --graceful-timeout 20 \
  --keep-alive 5 \
  --access-logfile - \
  --error-logfile - \
  --access-logformat '%(m)s %(U)s %(s)s %(D)sus' \
  wsgi:application
