#!/bin/sh
# Start the app in the foreground on the port this brief names, bound to
# 0.0.0.0, reading every service address from the environment at container
# start. The schema and the seed are applied by the image itself, once and
# idempotently, before the first request is served.
set -e

cd /app

# The container-internal port is fixed at 4173 by the deployment contract;
# APP_PUBLIC_PORT is what the outside world maps onto it. Neither is written
# into the source: PORT may override for a different mapping.
PORT="${PORT:-4173}"

echo "cirrus: waiting for the database and applying the schema and the seed"
python -c "from cirrus.app import bootstrap; bootstrap()"

# The seed has run; the workers need not repeat it.
export CIRRUS_BOOTSTRAPPED=1

# The app writes its own single request line to stdout, so gunicorn's access
# log stays off: one request, one line.
echo "cirrus: serving on 0.0.0.0:${PORT}"
exec gunicorn \
    --bind "0.0.0.0:${PORT}" \
    --workers "${WEB_CONCURRENCY:-2}" \
    --threads 4 \
    --timeout 60 \
    --graceful-timeout 20 \
    --error-logfile - \
    wsgi:app
