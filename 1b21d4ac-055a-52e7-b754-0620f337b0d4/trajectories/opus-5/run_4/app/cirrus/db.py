"""PostgreSQL access: pool, schema, idempotent seed."""
import os
import threading

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

_pool = None
_lock = threading.Lock()


def database_url():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


def pool():
    global _pool
    if _pool is None:
        with _lock:
            if _pool is None:
                _pool = ConnectionPool(
                    database_url(),
                    min_size=1,
                    max_size=int(os.environ.get("DB_POOL_MAX", "10")),
                    kwargs={"row_factory": dict_row, "autocommit": True},
                    open=True,
                    timeout=15,
                )
    return _pool


class _Conn:
    def __enter__(self):
        self._cm = pool().connection()
        self.conn = self._cm.__enter__()
        return self.conn

    def __exit__(self, *a):
        return self._cm.__exit__(*a)


def connection():
    return _Conn()


def dispose():
    """Close the pool and forget it.

    Under `--preload` the schema and the seed run in the master process. Its
    sockets must not be inherited by the forked workers, so the pool is closed
    here and each worker lazily opens its own.
    """
    global _pool
    with _lock:
        if _pool is not None:
            try:
                _pool.close()
            except Exception:
                pass
            _pool = None


def query(sql, params=None):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return cur.fetchall()


def query_one(sql, params=None):
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql, params=None):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            if cur.description:
                return cur.fetchall()
            return []


SCHEMA = """
CREATE TABLE IF NOT EXISTS houses (
    id              BIGGENERATED,
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
    id              BIGGENERATED,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('producer','viewer')),
    house_id        BIGINT REFERENCES houses(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT viewer_has_no_house CHECK (role <> 'viewer' OR house_id IS NULL),
    CONSTRAINT producer_has_house CHECK (role <> 'producer' OR house_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS items (
    id              BIGGENERATED,
    house_id        BIGINT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('work','talent')),
    slug            TEXT NOT NULL,
    title           TEXT NOT NULL,
    position        INTEGER NOT NULL DEFAULT 0,
    discipline      TEXT CHECK (discipline IN ('director','photographer','stylist')),
    variant         TEXT CHECK (variant IN ('left','right','centre')),
    published       BOOLEAN NOT NULL DEFAULT FALSE,
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT talent_has_discipline CHECK (kind <> 'talent' OR discipline IS NOT NULL),
    CONSTRAINT work_has_variant CHECK (kind <> 'work' OR variant IS NOT NULL),
    CONSTRAINT published_stamped CHECK ((published = FALSE AND published_at IS NULL)
                                     OR (published = TRUE  AND published_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS items_house_kind_slug_key
    ON items (house_id, kind, lower(slug));
CREATE INDEX IF NOT EXISTS items_house_kind_pos_idx
    ON items (house_id, kind, position, id);

CREATE TABLE IF NOT EXISTS media (
    id              TEXT PRIMARY KEY CHECK (id ~ '^[0-9a-f]{32}$'),
    item_id         BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('poster','reel','gallery')),
    position        INTEGER NOT NULL DEFAULT 0,
    seed            BIGINT NOT NULL,
    width           INTEGER NOT NULL CHECK (width > 0),
    height          INTEGER NOT NULL CHECK (height > 0),
    alt             TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_item_idx ON media (item_id, role, position, id);

CREATE TABLE IF NOT EXISTS credits (
    id              BIGGENERATED,
    item_id         BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL DEFAULT 0,
    role            TEXT NOT NULL,
    name            TEXT NOT NULL,
    talent_item_id  BIGINT REFERENCES items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS credits_item_idx ON credits (item_id, position, id);
CREATE INDEX IF NOT EXISTS credits_talent_idx ON credits (talent_item_id);

CREATE TABLE IF NOT EXISTS preview_tokens (
    id              BIGGENERATED,
    token           TEXT NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{32}$'),
    item_id         BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_by      BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slug_redirects (
    id              BIGGENERATED,
    house_id        BIGINT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('work','talent')),
    old_slug        TEXT NOT NULL,
    item_id         BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS slug_redirects_key
    ON slug_redirects (house_id, kind, lower(old_slug));
""".replace("BIGGENERATED", "BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")


def init_schema():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_lock(778811)")
            try:
                cur.execute(SCHEMA)
            finally:
                cur.execute("SELECT pg_advisory_unlock(778811)")
