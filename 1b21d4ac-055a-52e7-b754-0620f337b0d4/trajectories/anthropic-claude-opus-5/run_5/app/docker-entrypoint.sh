#!/bin/sh
# The container reads every service address from the environment at start.
set -e

PORT="${PORT:-4173}"

echo "cirrus: waiting for the database"
python - <<'PY'
import os, sys, time
import psycopg

dsn = os.environ.get("DATABASE_URL")
if not dsn:
    sys.stderr.write("DATABASE_URL is not set\n")
    sys.exit(1)

for attempt in range(60):
    try:
        with psycopg.connect(dsn, connect_timeout=3) as conn:
            conn.execute("SELECT 1")
        print("cirrus: database is reachable")
        break
    except Exception as exc:
        if attempt == 59:
            sys.stderr.write(f"cirrus: database unreachable: {exc}\n")
            sys.exit(1)
        time.sleep(1)
PY

# the schema and the seed are applied by the image itself, once and idempotently,
# before any worker starts
echo "cirrus: applying the schema and the seed"
python -c "from cirrus.app import bootstrap; bootstrap()"

echo "cirrus: serving on 0.0.0.0:${PORT}"
export CIRRUS_SKIP_BOOTSTRAP=1
exec gunicorn \
    --bind "0.0.0.0:${PORT}" \
    --workers 2 \
    --threads 4 \
    --timeout 60 \
    --access-logfile - \
    --error-logfile - \
    --capture-output \
    wsgi:app
