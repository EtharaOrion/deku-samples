"""PostgreSQL access: a small in-process connection pool and a transaction
helper. PostgreSQL is the only backing store; nothing here caches rows."""
import contextlib
import os
import queue
import threading

import psycopg

DATABASE_URL = os.environ["DATABASE_URL"]

_local = threading.local()
_lock = threading.Lock()
_idle = None
_created = 0
MAX_CONN = 8


class _Pool:
    """A minimal queue-backed pool. psycopg's own pool would add a dependency
    this deployment does not need for the load it serves."""

    def __init__(self, dsn, size=8):
        self.dsn = dsn
        self.size = size
        self.q = queue.LifoQueue()
        self.count = 0
        self.lock = threading.Lock()

    def get(self, timeout=15):
        try:
            return self.q.get_nowait()
        except queue.Empty:
            pass
        with self.lock:
            if self.count < self.size:
                self.count += 1
                make = True
            else:
                make = False
        if make:
            try:
                return psycopg.connect(self.dsn)
            except Exception:
                with self.lock:
                    self.count -= 1
                raise
        return self.q.get(timeout=timeout)

    def put(self, conn):
        if conn.closed:
            with self.lock:
                self.count -= 1
            return
        if conn.closed:
            return
        try:
            if conn.read_only or conn.status != psycopg.pq.TransactionStatus.IDLE:
                conn.rollback()
            conn.read_only = False
        except Exception:
            with self.lock:
                self.count -= 1
            try:
                conn.close()
            except Exception:
                pass
            return
        self.q.put(conn)

    def discard(self, conn):
        with self.lock:
            self.count -= 1
        try:
            conn.close()
        except Exception:
            pass


def get_pool():
    pool = getattr(_local, "pool", None)
    if pool is None:
        with _lock:
            pool = getattr(_local, "pool", None)
            if pool is None:
                pool = _Pool(DATABASE_URL, MAX_CONN)
                _local.pool = pool
    return pool


@contextlib.contextmanager
def connection():
    pool = get_pool()
    conn = pool.get()
    try:
        yield conn
        pool.put(conn)
    except Exception:
        pool.discard(conn)
        raise


@contextlib.contextmanager
def tx(readonly=False):
    with connection() as conn:
        conn.read_only = readonly
        cur = conn.cursor(row_factory=psycopg.rows.dict_row)
        try:
            yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()
            conn.read_only = False


def one(cur, sql, args=()):
    cur.execute(sql, args)
    return cur.fetchone()


def all_(cur, sql, args=()):
    cur.execute(sql, args)
    return cur.fetchall()
