#!/bin/sh
# Start the Vela storefront.
#
# Every service address is read from the environment at container start; none is
# reachable during the image build, so the schema and the seed are applied here.
set -eu

log() {
  printf '{"ts":"%s","level":"info","msg":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"
}

if [ -z "${DATABASE_URL:-}" ]; then
  printf '{"level":"error","msg":"DATABASE_URL is not set"}\n' >&2
  exit 1
fi

# Wait for the database to accept a connection. The container may start before
# PostgreSQL is ready, and a crash loop is a worse answer than waiting.
log "waiting for the database"
i=0
until node -e "
const pg = require('pg');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
c.connect().then(() => c.query('select 1')).then(() => c.end()).then(
  () => process.exit(0),
  () => process.exit(1),
);
" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    printf '{"level":"error","msg":"the database did not become reachable"}\n' >&2
    exit 1
  fi
  sleep 2
done
log "database is reachable"

# Apply the schema and the seed. Both are idempotent, so restarting the
# container never duplicates a row.
log "applying schema and seed"
node ./db/seed.js
log "schema and seed applied"

# Hand PID 1 to the server so signals reach it and it keeps running in the
# foreground, bound to 0.0.0.0 on the port the environment names.
log "starting the server"
exec node ./dist/server/entry.mjs
