"""PostgreSQL access: a tiny thread-safe connection pool, the schema and the seed."""
from __future__ import annotations

import hashlib
import os
import queue
import threading
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row
from werkzeug.security import generate_password_hash

DATABASE_URL = os.environ.get("DATABASE_URL", "")
SEED_PASSWORD = "deku-demo-pw-2026"

_pool: "ConnectionPool | None" = None


class ConnectionPool:
    def __init__(self, dsn: str, size: int = 8):
        self.dsn = dsn
        self.size = size
        self._free: queue.LifoQueue = queue.LifoQueue()
        self._lock = threading.Lock()
        self._created = 0

    def _new(self):
        conn = psycopg.connect(self.dsn, row_factory=dict_row, autocommit=False)
        return conn

    def get(self):
        try:
            conn = self._free.get_nowait()
        except queue.Empty:
            with self._lock:
                if self._created < self.size:
                    self._created += 1
                    return self._new()
            conn = self._free.get()
        if conn.closed:
            return self._new()
        return conn

    def put(self, conn):
        if conn.closed:
            with self._lock:
                self._created -= 1
            return
        self._free.put(conn)


def pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(DATABASE_URL)
    return _pool


@contextmanager
def connection():
    p = pool()
    conn = p.get()
    try:
        yield conn
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        p.put(conn)


@contextmanager
def cursor():
    with connection() as conn:
        with conn.cursor() as cur:
            yield cur


def query(sql: str, params: tuple = ()) -> list[dict]:
    with cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def query_one(sql: str, params: tuple = ()) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS houses (
    id             BIGSERIAL PRIMARY KEY,
    slug           TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    tagline_upper  TEXT NOT NULL,
    tagline_lower  TEXT NOT NULL,
    street         TEXT NOT NULL,
    city           TEXT NOT NULL,
    district       TEXT NOT NULL,
    contact_email  TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
    id             BIGSERIAL PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    role           TEXT NOT NULL CHECK (role IN ('producer','viewer')),
    house_id       BIGINT REFERENCES houses(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
    id             BIGSERIAL PRIMARY KEY,
    house_id       BIGINT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    kind           TEXT NOT NULL CHECK (kind IN ('work','talent')),
    slug           TEXT NOT NULL,
    title          TEXT NOT NULL,
    position       INTEGER NOT NULL DEFAULT 0,
    discipline     TEXT CHECK (discipline IN ('director','photographer','stylist')),
    variant        TEXT CHECK (variant IN ('left','right','centre')),
    published      BOOLEAN NOT NULL DEFAULT FALSE,
    published_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- slug uniqueness is held by the database, per house per kind, case-insensitively
CREATE UNIQUE INDEX IF NOT EXISTS items_house_kind_slug_key
    ON items (house_id, kind, lower(slug));
CREATE INDEX IF NOT EXISTS items_house_kind_pos_idx ON items (house_id, kind, position, id);

CREATE TABLE IF NOT EXISTS media (
    id             TEXT PRIMARY KEY,
    item_id        BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    role           TEXT NOT NULL CHECK (role IN ('poster','reel','gallery')),
    position       INTEGER NOT NULL DEFAULT 0,
    seed           TEXT NOT NULL,
    width          INTEGER NOT NULL,
    height         INTEGER NOT NULL,
    alt            TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_item_idx ON media (item_id, role, position, id);

CREATE TABLE IF NOT EXISTS credits (
    id             BIGSERIAL PRIMARY KEY,
    item_id        BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    position       INTEGER NOT NULL DEFAULT 0,
    role           TEXT NOT NULL,
    name           TEXT NOT NULL,
    talent_item_id BIGINT REFERENCES items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS credits_item_idx ON credits (item_id, position, id);
CREATE INDEX IF NOT EXISTS credits_talent_idx ON credits (talent_item_id);

CREATE TABLE IF NOT EXISTS preview_tokens (
    id             BIGSERIAL PRIMARY KEY,
    token          TEXT NOT NULL UNIQUE,
    item_id        BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    expires_at     TIMESTAMPTZ NOT NULL,
    created_by     BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slug_redirects (
    id             BIGSERIAL PRIMARY KEY,
    house_id       BIGINT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    kind           TEXT NOT NULL,
    old_slug       TEXT NOT NULL,
    item_id        BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS slug_redirects_key
    ON slug_redirects (house_id, kind, old_slug);
"""


def stable_media_id(*parts: str) -> str:
    """A deterministic 32 character lowercase hex id, so re-seeding is idempotent."""
    return hashlib.md5(("cirrus-seed:" + ":".join(parts)).encode("utf-8")).hexdigest()


WORKS = [
    ("The Halo", "the-halo", "left"),
    ("Sonder", "sonder", "right"),
    ("BINARY", "binary", "centre"),
    ("Common Ground", "common-ground", "left"),
    ("NVE", "nve", "right"),
    ("The Absolute Shelter", "the-absolute-shelter", "centre"),
    ("MAISON DE LUMIERE", "maison-de-lumiere", "left"),
    ("LORIS", "loris", "right"),
    ("MDL Serie Extreme", "mdl-serie-extreme", "centre"),
    ("AK", "ak", "left"),
    ("Loris Shoot Studio", "loris-shoot-studio", "right"),
    ("The Radiant", "the-radiant", "centre"),
]

TALENTS = [
    ("Rives", "rives", "director"),
    ("Halcyon", "halcyon", "director"),
    ("Camille Ferrand", "camille-ferrand", "photographer"),
]

VARIANT_SIZE = {
    "left": (598, 320),
    "right": (300, 300),
    "centre": (1006, 617),
}

EXTRA_CREDITS = [
    ("Producer", "Elise Marchand"),
    ("Director of Photography", "Tomas Rey"),
    ("Editor", "Juno Bell"),
]


def _upsert_house(cur, slug, name, tu, tl, street, city, district, email):
    cur.execute(
        """INSERT INTO houses (slug, name, tagline_upper, tagline_lower, street, city, district, contact_email)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT (slug) DO NOTHING""",
        (slug, name, tu, tl, street, city, district, email),
    )
    cur.execute("SELECT * FROM houses WHERE slug = %s", (slug,))
    return cur.fetchone()


def _upsert_account(cur, email, role, house_id):
    cur.execute(
        """INSERT INTO accounts (email, password_hash, role, house_id)
           VALUES (%s,%s,%s,%s) ON CONFLICT (email) DO NOTHING""",
        (email, generate_password_hash(SEED_PASSWORD), role, house_id),
    )


def _upsert_item(cur, house_id, kind, slug, title, position, discipline, variant, published):
    cur.execute(
        """INSERT INTO items (house_id, kind, slug, title, position, discipline, variant, published, published_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s, CASE WHEN %s THEN now() ELSE NULL END)
           ON CONFLICT (house_id, kind, lower(slug)) DO NOTHING""",
        (house_id, kind, slug, title, position, discipline, variant, published, published),
    )
    cur.execute(
        "SELECT * FROM items WHERE house_id=%s AND kind=%s AND lower(slug)=lower(%s)",
        (house_id, kind, slug),
    )
    return cur.fetchone()


def _upsert_media(cur, mid, item_id, role, position, seed, width, height, alt):
    cur.execute(
        """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
        (mid, item_id, role, position, seed, width, height, alt),
    )


def _upsert_credit(cur, item_id, position, role, name, talent_item_id):
    cur.execute(
        "SELECT id FROM credits WHERE item_id=%s AND position=%s",
        (item_id, position),
    )
    if cur.fetchone():
        return
    cur.execute(
        """INSERT INTO credits (item_id, position, role, name, talent_item_id)
           VALUES (%s,%s,%s,%s,%s)""",
        (item_id, position, role, name, talent_item_id),
    )


BOOTSTRAP_LOCK = 864213


def init_db():
    """CREATE TABLE IF NOT EXISTS still races two concurrent workers in the system
    catalog, so the whole schema is applied under one advisory lock."""
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(%s)", (BOOTSTRAP_LOCK,))
            cur.execute(SCHEMA_SQL)


def seed():
    """Idempotent: every insert is keyed on a natural key and skipped when present."""
    with connection() as conn:
        with conn.cursor() as cur:
            # one advisory lock so two workers cannot seed at once
            cur.execute("SELECT pg_advisory_xact_lock(%s)", (BOOTSTRAP_LOCK,))

            cirrus = _upsert_house(
                cur, "cirrus", "Cirrus", "FOR PICTURE", "AND ITS MAKERS",
                "9 PASSAGE BELLEVUE", "PARIS", "11", "prod@example.com",
            )
            meridian = _upsert_house(
                cur, "meridian", "Meridian", "FOR PICTURE", "AND ITS MAKERS",
                "4 RUE DES ORMES", "LYON", "02", "prod.meridian@example.com",
            )

            _upsert_account(cur, "producer@example.com", "producer", cirrus["id"])
            _upsert_account(cur, "producer.meridian@example.com", "producer", meridian["id"])
            _upsert_account(cur, "viewer@example.com", "viewer", None)

            talent_ids: dict[str, int] = {}

            for idx, (title, slug, variant) in enumerate(WORKS):
                item = _upsert_item(cur, cirrus["id"], "work", slug, title, idx, None, variant, True)
                w, h = VARIANT_SIZE[variant]
                _upsert_media(cur, stable_media_id("cirrus", slug, "poster"), item["id"],
                              "poster", 0, f"{slug}-poster", w, h,
                              f"{title}, still from the film")
                _upsert_media(cur, stable_media_id("cirrus", slug, "reel"), item["id"],
                              "reel", 0, f"{slug}-reel", 1440, 810,
                              f"{title}, showreel")
                for g, gvariant in enumerate(("left", "centre", "right")):
                    gw, gh = VARIANT_SIZE[gvariant]
                    _upsert_media(cur, stable_media_id("cirrus", slug, f"gallery-{g}"), item["id"],
                                  "gallery", g, f"{slug}-gallery-{g}", gw, gh,
                                  f"{title}, frame {g + 1}")

            quiet = _upsert_item(cur, cirrus["id"], "work", "the-quiet-room", "The Quiet Room",
                                 len(WORKS), None, "left", False)
            _upsert_media(cur, stable_media_id("cirrus", "the-quiet-room", "poster"), quiet["id"],
                          "poster", 0, "the-quiet-room-poster", 598, 320,
                          "The Quiet Room, still from the film")

            for idx, (title, slug, discipline) in enumerate(TALENTS):
                item = _upsert_item(cur, cirrus["id"], "talent", slug, title, idx, discipline, None, True)
                talent_ids[slug] = item["id"]
                _upsert_media(cur, stable_media_id("cirrus", slug, "poster"), item["id"],
                              "poster", 0, f"{slug}-portrait", 246, 328,
                              f"{title}, {discipline}, portrait")
                _upsert_media(cur, stable_media_id("cirrus", slug, "reel"), item["id"],
                              "reel", 0, f"{slug}-reel", 1440, 810,
                              f"{title}, showreel")

            noor = _upsert_item(cur, cirrus["id"], "talent", "noor-vasquez", "Noor Vasquez",
                                len(TALENTS), "stylist", None, False)
            _upsert_media(cur, stable_media_id("cirrus", "noor-vasquez", "poster"), noor["id"],
                          "poster", 0, "noor-vasquez-portrait", 246, 328,
                          "Noor Vasquez, stylist, portrait")

            # credits: three point at a talent, the rest name people the house does not represent
            cur.execute(
                "SELECT id, slug FROM items WHERE house_id=%s AND kind='work'", (cirrus["id"],)
            )
            works_by_slug = {r["slug"]: r["id"] for r in cur.fetchall()}
            linked = {
                "the-halo": ("Director", "Rives", talent_ids.get("rives")),
                "sonder": ("Director", "Halcyon", talent_ids.get("halcyon")),
                "loris": ("Photographer", "Camille Ferrand", talent_ids.get("camille-ferrand")),
            }
            for slug, work_id in works_by_slug.items():
                pos = 0
                if slug in linked:
                    role, name, tid = linked[slug]
                    _upsert_credit(cur, work_id, pos, role, name, tid)
                    pos += 1
                for role, name in EXTRA_CREDITS:
                    _upsert_credit(cur, work_id, pos, role, name, None)
                    pos += 1

            # meridian: one published talent and one published work, no public surface here
            sable = _upsert_item(cur, meridian["id"], "talent", "sable-ito", "Sable Ito", 0,
                                 "director", None, True)
            _upsert_media(cur, stable_media_id("meridian", "sable-ito", "poster"), sable["id"],
                          "poster", 0, "sable-ito-portrait", 246, 328,
                          "Sable Ito, director, portrait")
            foundry = _upsert_item(cur, meridian["id"], "work", "foundry", "Foundry", 0, None,
                                   "left", True)
            _upsert_media(cur, stable_media_id("meridian", "foundry", "poster"), foundry["id"],
                          "poster", 0, "foundry-poster", 598, 320,
                          "Foundry, still from the film")
            _upsert_media(cur, stable_media_id("meridian", "foundry", "reel"), foundry["id"],
                          "reel", 0, "foundry-reel", 1440, 810, "Foundry, showreel")
