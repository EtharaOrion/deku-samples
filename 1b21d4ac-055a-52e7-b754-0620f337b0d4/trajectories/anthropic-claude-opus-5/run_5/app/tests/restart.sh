#!/bin/sh
# Development helper: stop any running server and start a fresh one detached.
cd /app || exit 1
/usr/local/bin/python3 - <<'PY'
import os, signal
me = os.getpid()
for pid in os.listdir('/proc'):
    if not pid.isdigit() or int(pid) == me:
        continue
    try:
        cmd = open(f'/proc/{pid}/cmdline', 'rb').read().decode(errors='replace')
    except Exception:
        continue
    if 'wsgi:app' in cmd and 'gunicorn' in cmd:
        try:
            os.kill(int(pid), signal.SIGTERM)
        except Exception:
            pass
PY
sleep 2
setsid /usr/local/bin/python3 -m gunicorn --bind 0.0.0.0:4173 --workers 2 --threads 4 \
  --timeout 60 wsgi:app > /tmp/cirrus.log 2>&1 &
sleep 6
curl -s http://localhost:4173/api/health
echo
