"""PostgreSQL access and the seven tables.

Every record lives here and nowhere else. Connections are per-thread, which is
what a threaded gunicorn worker wants and what keeps the pool count bounded by
``workers x threads``.
"""

from __future__ import annotations

import threading
from contextlib import contextmanager
from typing import Any, Iterator, Sequence

import psycopg
from psycopg.rows import dict_row

from . import config

#: Advisory-lock key serialising schema creation and seeding across workers.
BOOTSTRAP_LOCK = 4173_1821

_local = threading.local()


# ---------------------------------------------------------------------------
# Connections
# ---------------------------------------------------------------------------


@contextmanager
def connection() -> Iterator[psycopg.Connection]:
    """Yield this thread's connection, reconnecting if the socket went away."""
    conn = getattr(_local, "conn", None)
    if conn is not None and conn.closed:
        conn = None
    if conn is None:
        conn = psycopg.connect(
            config.database_url(),
            row_factory=dict_row,
            autocommit=True,
            connect_timeout=10,
        )
        _local.conn = conn
    try:
        yield conn
    except (psycopg.OperationalError, psycopg.InterfaceError):
        _local.conn = None
        try:
            conn.close()
        except Exception:  # noqa: BLE001 - the socket is already gone
            pass
        raise


@contextmanager
def transaction() -> Iterator[psycopg.Connection]:
    """Run a block inside one transaction, rolled back on any exception."""
    with connection() as conn:
        with conn.transaction():
            yield conn


def query(sql: str, params: Sequence[Any] | None = None) -> list[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return list(cur.fetchall())


def one(sql: str, params: Sequence[Any] | None = None) -> dict[str, Any] | None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()


def execute(sql: str, params: Sequence[Any] | None = None) -> None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

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
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
    id              SERIAL PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('producer', 'viewer')),
    house_id        INTEGER REFERENCES houses(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT accounts_viewer_has_no_house
        CHECK (role <> 'viewer' OR house_id IS NULL)
);

CREATE TABLE IF NOT EXISTS items (
    id              SERIAL PRIMARY KEY,
    house_id        INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('work', 'talent')),
    slug            TEXT NOT NULL CHECK (slug = lower(slug) AND slug <> ''),
    title           TEXT NOT NULL,
    position        INTEGER NOT NULL DEFAULT 0,
    discipline      TEXT CHECK (discipline IN ('director', 'photographer', 'stylist')),
    variant         TEXT CHECK (variant IN ('left', 'right', 'centre')),
    published       BOOLEAN NOT NULL DEFAULT FALSE,
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT items_published_stamp
        CHECK (published = (published_at IS NOT NULL)),
    CONSTRAINT items_slug_unique_per_house_per_kind
        UNIQUE (house_id, kind, slug)
);

CREATE TABLE IF NOT EXISTS media (
    id              TEXT PRIMARY KEY
                    CHECK (id ~ '^[0-9a-f]{32}$'),
    item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('poster', 'reel', 'gallery')),
    position        INTEGER NOT NULL DEFAULT 0,
    seed            TEXT NOT NULL,
    width           INTEGER NOT NULL CHECK (width > 0),
    height          INTEGER NOT NULL CHECK (height > 0),
    alt             TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credits (
    id              SERIAL PRIMARY KEY,
    item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL DEFAULT 0,
    role            TEXT NOT NULL,
    name            TEXT NOT NULL,
    talent_item_id  INTEGER REFERENCES items(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS preview_tokens (
    id              SERIAL PRIMARY KEY,
    token           TEXT NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{32}$'),
    item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_by      INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS slug_redirects (
    id              SERIAL PRIMARY KEY,
    house_id        INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('work', 'talent')),
    old_slug        TEXT NOT NULL,
    item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT slug_redirects_unique_per_house_per_kind
        UNIQUE (house_id, kind, old_slug)
);

CREATE INDEX IF NOT EXISTS items_house_kind_published_idx
    ON items (house_id, kind, published, position, id);
CREATE INDEX IF NOT EXISTS media_item_idx ON media (item_id, role, position, id);
CREATE INDEX IF NOT EXISTS credits_item_idx ON credits (item_id, position, id);
CREATE INDEX IF NOT EXISTS credits_talent_idx ON credits (talent_item_id);
CREATE INDEX IF NOT EXISTS preview_tokens_item_idx ON preview_tokens (item_id);
"""


def ensure_schema() -> None:
    """Create the seven tables. Safe to run from every worker, every boot."""
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(SCHEMA)


def wait_for_database(attempts: int = 60, delay: float = 1.0) -> None:
    """Block until PostgreSQL answers. It is started before us, not by us."""
    import time

    last: Exception | None = None
    for _ in range(attempts):
        try:
            with connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
            return
        except Exception as exc:  # noqa: BLE001 - retried below
            last = exc
            _local.conn = None
            time.sleep(delay)
    raise RuntimeError(f"PostgreSQL never answered: {last}")
