"""PostgreSQL access. One small connection pool, no ORM, no second datastore."""
import os
import queue
import threading
import time
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

_POOL: "queue.LifoQueue[psycopg.Connection]" = queue.LifoQueue()
_LOCK = threading.Lock()
_MADE = 0
_MAX = int(os.environ.get("DB_POOL_MAX", "8"))


def dsn() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


def _new_conn() -> psycopg.Connection:
    conn = psycopg.connect(dsn(), row_factory=dict_row, autocommit=False)
    return conn


def wait_for_db(timeout: float = 60.0) -> None:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            c = _new_conn()
            c.close()
            return
        except Exception as exc:  # pragma: no cover - startup path
            last = exc
            time.sleep(1.0)
    raise RuntimeError(f"database never became reachable: {last}")


@contextmanager
def connection():
    global _MADE
    try:
        conn = _POOL.get_nowait()
    except queue.Empty:
        with _LOCK:
            _MADE += 1
        conn = _new_conn()
    try:
        if conn.closed:
            conn = _new_conn()
        yield conn
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            conn.rollback()
        except Exception:
            try:
                conn.close()
            except Exception:
                pass
            conn = None
        if conn is not None and not conn.closed:
            if _POOL.qsize() < _MAX:
                _POOL.put(conn)
            else:
                conn.close()


def query(sql: str, params=None):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return cur.fetchall()


def query_one(sql: str, params=None):
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params=None):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            row = cur.fetchone() if cur.description else None
        conn.commit()
        return row
