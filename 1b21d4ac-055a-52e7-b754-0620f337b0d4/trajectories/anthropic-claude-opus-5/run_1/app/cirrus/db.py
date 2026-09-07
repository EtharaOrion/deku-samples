"""PostgreSQL access. The database is the only place a record lives."""
import os
import threading
import time

import psycopg2
import psycopg2.extras
from psycopg2 import pool as pg_pool

_pool = None
_lock = threading.Lock()

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")


def dsn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


def get_pool():
    global _pool
    if _pool is None:
        with _lock:
            if _pool is None:
                _pool = pg_pool.ThreadedConnectionPool(1, 12, dsn())
    return _pool


class connection:
    """Context manager yielding a pooled connection; commits or rolls back."""

    def __init__(self, commit=True):
        self.commit = commit
        self.conn = None

    def __enter__(self):
        self.conn = get_pool().getconn()
        return self.conn

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None and self.commit:
                self.conn.commit()
            else:
                self.conn.rollback()
        finally:
            get_pool().putconn(self.conn)
        return False


def query(sql, args=None, one=False, commit=False):
    with connection(commit=commit) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, args or ())
            if cur.description is None:
                return None
            rows = cur.fetchall()
    if one:
        return dict(rows[0]) if rows else None
    return [dict(r) for r in rows]


def execute(sql, args=None):
    return query(sql, args, commit=True)


def wait_for_db(timeout=90):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            conn = psycopg2.connect(dsn())
            conn.close()
            return True
        except Exception as exc:  # pragma: no cover - startup path
            last = exc
            time.sleep(1.0)
    raise RuntimeError("database unreachable: %s" % last)


def init_schema():
    with open(SCHEMA_PATH, "r", encoding="utf-8") as fh:
        sql = fh.read()
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
