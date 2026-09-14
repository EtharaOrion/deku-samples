"""Database access: connection pool, schema, transactions."""
import logging
import os
import secrets
import threading
import time

import psycopg
from psycopg.rows import dict_row

log = logging.getLogger("cirrus.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS houses (
    id            TEXT PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    tagline_upper TEXT NOT NULL,
    tagline_lower TEXT NOT NULL,
    street        TEXT NOT NULL,
    city          TEXT NOT NULL,
    district      TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('producer','viewer')),
    house_id      TEXT REFERENCES houses(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
    id           TEXT PRIMARY KEY,
    house_id     TEXT NOT NULL REFERENCES houses(id),
    kind         TEXT NOT NULL CHECK (kind IN ('work','talent')),
    slug         TEXT NOT NULL,
    title        TEXT NOT NULL,
    position     INTEGER NOT NULL DEFAULT 0,
    discipline   TEXT CHECK (discipline IN ('director','photographer','stylist')),
    variant      TEXT CHECK (variant IN ('left','right','centre')),
    published    BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (house_id, kind, slug)
);
CREATE UNIQUE INDEX IF NOT EXISTS items_slug_lower_idx ON items(house_id, kind, lower(slug));

CREATE TABLE IF NOT EXISTS media (
    id         TEXT PRIMARY KEY,
    item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('poster','reel','gallery')),
    position   INTEGER NOT NULL DEFAULT 0,
    seed       TEXT NOT NULL,
    width      INTEGER NOT NULL,
    height     INTEGER NOT NULL,
    alt        TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_item_idx ON media(item_id);

CREATE TABLE IF NOT EXISTS credits (
    id            TEXT PRIMARY KEY,
    item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL DEFAULT 0,
    role          TEXT NOT NULL,
    name          TEXT NOT NULL,
    talent_item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credits_item_idx ON credits(item_id);

CREATE TABLE IF NOT EXISTS preview_tokens (
    id         TEXT PRIMARY KEY,
    token      TEXT NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{32}$'),
    item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_by TEXT REFERENCES accounts(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slug_redirects (
    id         TEXT PRIMARY KEY,
    house_id   TEXT NOT NULL REFERENCES houses(id),
    kind       TEXT NOT NULL,
    old_slug   TEXT NOT NULL,
    item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (house_id, kind, old_slug)
);
CREATE INDEX IF NOT EXISTS slug_redirects_lookup_idx ON slug_redirects(house_id, kind, old_slug);
"""


def new_id() -> str:
    return secrets.token_hex(16)


def connect_kwargs() -> dict:
    url = os.environ["DATABASE_URL"]
    kw = {"row_factory": dict_row, "autocommit": False}
    return {"conninfo": url, **kw}


class _Conn:
    """A checked-out connection with commit/rollback context helpers."""

    def __init__(self, conn):
        self.conn = conn

    def execute(self, stmt, params=()):
        return self.conn.execute(stmt, params)

    def __enter__(self):
        return self.conn

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None:
                self.conn.commit()
            else:
                self.conn.rollback()
        finally:
            _release(self.conn)


class Pool:
    """A small thread-safe pool of psycopg connections."""

    def __init__(self, max_size=8):
        self._idle = []
        self._count = 0
        self._max = max_size
        self._lock = threading.Lock()

    def _new_conn(self):
        kw = {}
        opts = os.environ.get("PGOPTIONS")
        if opts:
            kw["options"] = opts
        return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row, autocommit=False, connect_timeout=10, **kw)

    def _acquire(self):
        with self._lock:
            if self._idle:
                conn = self._idle.pop()
                try:
                    conn.execute("SELECT 1").fetchone()
                    return conn
                except Exception:
                    try:
                        conn.close()
                    except Exception:
                        pass
                    self._count -= 1
            if self._count >= self._max:
                raise RuntimeError("connection pool exhausted")
            self._count += 1
        try:
            return self._new_conn()
        except Exception:
            with self._lock:
                self._count -= 1
            raise

    def _get(self):
        for attempt in range(3):
            try:
                return self._acquire()
            except RuntimeError:
                time.sleep(0.05 * (attempt + 1))
            except psycopg.OperationalError:
                time.sleep(0.2 * (attempt + 1))
        raise RuntimeError("could not reach the database")

    def query(self, stmt, params=()):
        conn = self._get()
        try:
            rows = conn.execute(stmt, params).fetchall()
            conn.commit()
            return rows
        except Exception:
            conn.rollback()
            raise
        finally:
            _release(conn)

    def query_one(self, stmt, params=()):
        conn = self._get()
        try:
            row = conn.execute(stmt, params).fetchone()
            conn.commit()
            return row
        except Exception:
            conn.rollback()
            raise
        finally:
            _release(conn)

    def run(self, stmt, params=()):
        conn = self._get()
        try:
            conn.execute(stmt, params)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            _release(conn)

    def tx(self):
        return _Conn(self._get())


def _release(conn):
    with _pool_lock:
        try:
            if conn.closed:
                POOL._count -= 1
            else:
                POOL._idle.append(conn)
        except Exception:
            pass


POOL = None
_pool_lock = threading.Lock()


def _pool():
    global POOL
    with _pool_lock:
        if POOL is None:
            POOL = Pool()
        return POOL


class _PoolFacade:
    def __getattr__(self, name):
        return getattr(_pool(), name)


pool = _PoolFacade()


def init_schema():
    """Create tables once. Safe to run repeatedly."""
    conn = _pool()._get()
    try:
        conn.execute(SCHEMA)
        conn.commit()
    finally:
        _release(conn)
    log.info("schema ensured")
