"""Postgres access. One connection pool, plain SQL, no ORM."""
import threading

import psycopg
from psycopg_pool import ConnectionPool

from .config import Config

_pool = None
_lock = threading.Lock()


def init_pool():
    global _pool
    with _lock:
        if _pool is None:
            _pool = ConnectionPool(
                Config.DATABASE_URL,
                min_size=1,
                max_size=8,
                open=True,
                kwargs={"autocommit": False, "row_factory": psycopg.rows.dict_row},
            )
    return _pool


def get_pool():
    if _pool is None:
        init_pool()
    return _pool


def query(sql, params=(), one=False):
    """Run a read; returns dicts."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() if cur.description else []
    return (rows[0] if rows else None) if one else rows


def query_commit(sql, params=(), returning_one=True):
    """Run a write inside its own transaction. Raises on unique violation."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone() if cur.description else None
    return row


def transaction():
    return _Tx()


class _Tx:
    def __enter__(self):
        self._cm = get_pool().connection()
        self._conn = self._cm.__enter__()
        self._cur = self._conn.cursor()
        return self._cur

    def __exit__(self, exc_type, exc, tb):
        try:
            self._cur.close()
        finally:
            return self._cm.__exit__(exc_type, exc, tb)


def close_pool():
    global _pool
    with _lock:
        if _pool is not None:
            _pool.close()
            _pool = None
