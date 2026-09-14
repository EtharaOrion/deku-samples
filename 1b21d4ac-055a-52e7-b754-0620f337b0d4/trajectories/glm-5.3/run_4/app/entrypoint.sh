#!/bin/sh
set -e
cd /app
PY=/usr/local/bin/python3
[ -x "$PY" ] || PY=python3
"$PY" bootstrap.py
exec "$PY" -m gunicorn -w 2 --threads 4 \
  -b 0.0.0.0:${PORT:-4173} \
  --error-logfile - --timeout 60 app:app
