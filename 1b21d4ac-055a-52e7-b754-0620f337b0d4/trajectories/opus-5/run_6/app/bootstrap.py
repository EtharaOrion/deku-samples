"""Applied once at container start, before any worker serves: schema, then seed.

Both are idempotent and both take an advisory lock, so a restart adds no rows and two
simultaneous starts cannot race each other.
"""
import sys

from cirrus import db


def main():
    db.wait_for_db()
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(918273644)")
            db.apply_schema()
    db.seed()
    sys.stdout.write("schema applied and seed settled\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
