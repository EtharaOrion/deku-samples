"""Database access: connection handling, schema and the idempotent seed."""
from __future__ import annotations

import os
import secrets
import threading
import time

import psycopg
from psycopg.rows import dict_row
from flask import g

_SCHEMA_LOCK = threading.Lock()
_schema_ready = False


def dsn() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


def connect() -> psycopg.Connection:
    return psycopg.connect(dsn(), row_factory=dict_row, autocommit=False)


def get_conn() -> psycopg.Connection:
    conn = getattr(g, "_conn", None)
    if conn is None or conn.closed:
        conn = connect()
        g._conn = conn
    return conn


def close_conn(_exc=None) -> None:
    conn = g.pop("_conn", None)
    if conn is not None and not conn.closed:
        try:
            if _exc is None:
                conn.commit()
            else:
                conn.rollback()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
        conn.close()


def query(sql: str, params=None) -> list[dict]:
    with get_conn().cursor() as cur:
        cur.execute(sql, params or ())
        return cur.fetchall()


def query_one(sql: str, params=None):
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params=None):
    with get_conn().cursor() as cur:
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
    house_id        BIGINT REFERENCES houses(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
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
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Slug uniqueness per house per kind, decided after lowercasing, held by the
-- database itself so two concurrent creates cannot both land.
CREATE UNIQUE INDEX IF NOT EXISTS items_house_kind_slug_key
    ON items (house_id, kind, lower(slug));

CREATE TABLE IF NOT EXISTS media (
    id              TEXT PRIMARY KEY CHECK (id ~ '^[0-9a-f]{32}$'),
    item_id         BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('poster','reel','gallery')),
    position        INTEGER NOT NULL DEFAULT 0,
    seed            TEXT NOT NULL,
    width           INTEGER NOT NULL,
    height          INTEGER NOT NULL,
    alt             TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_item_idx ON media (item_id, role, position);

CREATE TABLE IF NOT EXISTS credits (
    id              BIGGENERATED,
    item_id         BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL DEFAULT 0,
    role            TEXT NOT NULL,
    name            TEXT NOT NULL,
    talent_item_id  BIGINT REFERENCES items(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credits_item_idx ON credits (item_id, position);
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
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (house_id, kind, old_slug)
);
""".replace("BIGGENERATED", "BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")


def hex32() -> str:
    return secrets.token_hex(16)


def init_schema(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(SCHEMA)
    conn.commit()


def wait_for_db(attempts: int = 60, delay: float = 1.0) -> psycopg.Connection:
    last = None
    for _ in range(attempts):
        try:
            return connect()
        except Exception as exc:  # pragma: no cover - startup path
            last = exc
            time.sleep(delay)
    raise RuntimeError(f"database unreachable: {last}")


def ensure_ready() -> None:
    """Create the schema and seed once, safely under concurrent workers."""
    global _schema_ready
    with _SCHEMA_LOCK:
        if _schema_ready:
            return
        conn = wait_for_db()
        try:
            # A session-level advisory lock serialises workers racing to migrate.
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_lock(918273645)")
            conn.commit()
            init_schema(conn)
            from .seed import seed_all

            seed_all(conn)
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_unlock(918273645)")
            conn.commit()
        finally:
            conn.close()
        _schema_ready = True
