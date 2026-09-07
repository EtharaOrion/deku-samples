"""PostgreSQL access. The database is the only place a record lives."""
import threading
import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

from . import config

_pool = None
_lock = threading.Lock()


def pool():
    global _pool
    if _pool is None:
        with _lock:
            if _pool is None:
                _pool = ThreadedConnectionPool(
                    1, 12, dsn=config.DATABASE_URL, connect_timeout=10
                )
    return _pool


class _Conn:
    def __init__(self, commit):
        self.commit = commit
        self.conn = None

    def __enter__(self):
        self.conn = pool().getconn()
        self.conn.autocommit = False
        return self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None and self.commit:
                self.conn.commit()
            else:
                self.conn.rollback()
        finally:
            pool().putconn(self.conn)
        return False


def read():
    return _Conn(commit=False)


def write():
    return _Conn(commit=True)


def query(sql, params=None):
    with read() as cur:
        cur.execute(sql, params or ())
        return [dict(r) for r in cur.fetchall()]


def query_one(sql, params=None):
    rows = query(sql, params)
    return rows[0] if rows else None


SCHEMA = """
CREATE TABLE IF NOT EXISTS houses (
    id              SERIAL PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    tagline_upper   TEXT NOT NULL DEFAULT '',
    tagline_lower   TEXT NOT NULL DEFAULT '',
    street          TEXT NOT NULL DEFAULT '',
    city            TEXT NOT NULL DEFAULT '',
    district        TEXT NOT NULL DEFAULT '',
    contact_email   TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
    id              SERIAL PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('producer','viewer')),
    house_id        INTEGER REFERENCES houses(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
    id              SERIAL PRIMARY KEY,
    house_id        INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('work','talent')),
    slug            TEXT NOT NULL,
    title           TEXT NOT NULL,
    position        INTEGER NOT NULL DEFAULT 0,
    discipline      TEXT CHECK (discipline IN ('director','photographer','stylist')),
    variant         TEXT CHECK (variant IN ('left','right','centre')),
    published       BOOLEAN NOT NULL DEFAULT FALSE,
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Slug uniqueness per house per kind, decided after lowercasing, held by the
-- database itself rather than by an application-level check, so two concurrent
-- creates cannot both land.
CREATE UNIQUE INDEX IF NOT EXISTS items_house_kind_slug_key
    ON items (house_id, kind, lower(slug));

CREATE INDEX IF NOT EXISTS items_house_kind_pos ON items (house_id, kind, position, id);

CREATE TABLE IF NOT EXISTS media (
    id              TEXT PRIMARY KEY,
    item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('poster','reel','gallery')),
    position        INTEGER NOT NULL DEFAULT 0,
    seed            TEXT NOT NULL,
    width           INTEGER NOT NULL,
    height          INTEGER NOT NULL,
    alt             TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_item ON media (item_id, role, position, id);

CREATE TABLE IF NOT EXISTS credits (
    id              SERIAL PRIMARY KEY,
    item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL DEFAULT 0,
    role            TEXT NOT NULL,
    name            TEXT NOT NULL,
    talent_item_id  INTEGER REFERENCES items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS credits_item ON credits (item_id, position, id);
CREATE INDEX IF NOT EXISTS credits_talent ON credits (talent_item_id);

CREATE TABLE IF NOT EXISTS preview_tokens (
    id              SERIAL PRIMARY KEY,
    token           TEXT NOT NULL UNIQUE,
    item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_by      INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slug_redirects (
    id              SERIAL PRIMARY KEY,
    house_id        INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL,
    old_slug        TEXT NOT NULL,
    item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS slug_redirects_key
    ON slug_redirects (house_id, kind, lower(old_slug));

"""


def init_schema():
    with write() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(918273645)")
        cur.execute(SCHEMA)
