"""Apply the schema and the idempotent seed, then draw the static assets."""
import logging
import os
import sys

import psycopg

logging.basicConfig(stream=sys.stdout, level=logging.INFO,
                    format="%(asctime)s %(levelname)s cirrus %(message)s")
log = logging.getLogger("cirrus")

url = os.environ["DATABASE_URL"]
for attempt in range(40):
    try:
        conn = psycopg.connect(url)
        break
    except Exception:
        if attempt == 39:
            raise
        import time
        time.sleep(1)
conn.autocommit = True
try:
    import seed
    seed.run(conn, os.environ.get("HOUSE_SLUG", "cirrus"))
finally:
    conn.close()

import media
media.build_static_assets()
log.info("bootstrap complete")
