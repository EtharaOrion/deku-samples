#!/usr/bin/env bash
# Development helper: reset the database, rebuild and restart the local server.
PORT_DEV=${PORT_DEV:-4300}

stop() {
  for p in $(ls /proc | grep -E '^[0-9]+$'); do
    c=$(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null)
    case "$c" in *"dist/index.js"*) kill "$p" 2>/dev/null;; esac
  done
  sleep 1
}

reset_db() {
  PGPASSWORD='deku-local-dev' psql -q -h postgres -U deku_app -d deku \
    -c 'DROP TABLE IF EXISTS email_log, registrations, events, calendars, accounts CASCADE;' >/dev/null
  curl -s -X DELETE "http://${SMTP_HOST}:8025/api/v1/messages" >/dev/null
}

case "$1" in
  stop) stop ;;
  restart)
    stop
    [ "$2" = "reset" ] && reset_db
    cd /app/server && npx tsc -p tsconfig.json || exit 1
    cd /app/server && PORT=$PORT_DEV setsid node dist/index.js </dev/null > /tmp/srv.log 2>&1 &
    disown 2>/dev/null
    for i in $(seq 1 30); do
      sleep 1
      curl -sf "http://127.0.0.1:$PORT_DEV/api/health" >/dev/null && echo "up on $PORT_DEV" && exit 0
    done
    echo "did not come up"; tail -20 /tmp/srv.log; exit 1
    ;;
  *) echo "usage: dev.sh {stop|restart [reset]}" ;;
esac
