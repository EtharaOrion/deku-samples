#!/bin/sh
# Serves the app in the foreground on the container-internal port, bound to
# 0.0.0.0. Every service address is read from the environment at start.
set -u

: "${DATABASE_URL:?DATABASE_URL must be set}"

# 4173 is the container-internal port; APP_PUBLIC_PORT is what the outside maps.
PORT=4173

# The app itself writes one request line to stdout, so gunicorn's own access
# log stays off rather than printing a second line for every request.
exec gunicorn \
  --bind "0.0.0.0:${PORT}" \
  --workers "${WEB_CONCURRENCY:-3}" \
  --threads "${WEB_THREADS:-4}" \
  --timeout 90 \
  --graceful-timeout 30 \
  --keep-alive 5 \
  --error-logfile - \
  --preload \
  wsgi:app
