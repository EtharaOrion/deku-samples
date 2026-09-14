"""PostgreSQL access: pool, schema, idempotent seed.

The database is the only store. Seven tables, every derived value computed at
read time, slug uniqueness held by a database unique index rather than by an
application check.
"""
from __future__ import annotations

import os
import secrets
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import psycopg
import psycopg_pool

SCHEMA = """
CREATE TABLE IF NOT EXISTS houses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('producer', 'viewer')),
    house_id      UUID REFERENCES houses (id) ON DELETE RESTRICT,
    -- bearer tokens: an opaque random id, stored only as a lookup hash
    token_hash        TEXT,
    token_expires_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((role = 'producer' AND house_id IS NOT NULL)
        OR (role = 'viewer'   AND house_id IS NULL))
);
CREATE INDEX IF NOT EXISTS accounts_token_idx ON accounts (token_hash);


CREATE TABLE IF NOT EXISTS items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id     UUID NOT NULL REFERENCES houses (id) ON DELETE CASCADE,
    kind         TEXT NOT NULL CHECK (kind IN ('work', 'talent')),
    slug         TEXT NOT NULL,
    title        TEXT NOT NULL,
    position     INTEGER NOT NULL DEFAULT 0,
    discipline   TEXT CHECK (discipline IN ('director', 'photographer', 'stylist')),
    variant      TEXT CHECK (variant IN ('left', 'right', 'centre')),
    published    BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((kind = 'work'   AND discipline IS NULL AND variant   IS NOT NULL)
        OR (kind = 'talent' AND variant IS NULL   AND discipline IS NOT NULL))
);
-- Slug uniqueness per house per kind, decided after lowercasing, held by the
-- database so concurrent creates cannot both land.
CREATE UNIQUE INDEX IF NOT EXISTS items_slug_unique
    ON items (house_id, kind, lower(slug));
CREATE INDEX IF NOT EXISTS items_order_idx
    ON items (house_id, kind, position);

CREATE TABLE IF NOT EXISTS media (
    id         CHAR(32) PRIMARY KEY CHECK (id ~ '^[0-9a-f]{32}$'),
    item_id    UUID NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('poster', 'reel', 'gallery')),
    position   INTEGER NOT NULL DEFAULT 0,
    seed       TEXT NOT NULL,
    width      INTEGER NOT NULL CHECK (width > 0),
    height     INTEGER NOT NULL CHECK (height > 0),
    alt        TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_item_idx ON media (item_id);

CREATE TABLE IF NOT EXISTS credits (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id       UUID NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    position      INTEGER NOT NULL DEFAULT 0,
    role          TEXT NOT NULL,
    name          TEXT NOT NULL,
    talent_item_id UUID REFERENCES items (id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credits_item_idx ON credits (item_id);

CREATE TABLE IF NOT EXISTS preview_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token      CHAR(32) NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{32}$'),
    item_id    UUID NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES accounts (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS preview_token_item_idx ON preview_tokens (item_id);

CREATE TABLE IF NOT EXISTS slug_redirects (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id   UUID NOT NULL REFERENCES houses (id) ON DELETE CASCADE,
    kind       TEXT NOT NULL CHECK (kind IN ('work', 'talent')),
    old_slug   TEXT NOT NULL,
    item_id    UUID NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS slug_redirects_unique
    ON slug_redirects (house_id, kind, lower(old_slug));
"""

# Passwords are hashed with scrypt; never stored in clear.
DEMO_PASSWORD = os.environ.get("CIRRUS_SEED_PASSWORD", "deku-demo-pw-2026")

WORKS = [
    # (slug, title, variant)
    ("the-halo", "The Halo", "left"),
    ("sonder", "Sonder", "right"),
    ("binary", "BINARY", "centre"),
    ("common-ground", "Common Ground", "left"),
    ("nve", "NVE", "right"),
    ("the-absolute-shelter", "The Absolute Shelter", "centre"),
    ("maison-de-lumiere", "MAISON DE LUMIERE", "left"),
    ("loris", "LORIS", "right"),
    ("mdl-serie-extreme", "MDL Serie Extreme", "centre"),
    ("ak", "AK", "left"),
    ("loris-shoot-studio", "Loris Shoot Studio", "right"),
    ("the-radiant", "The Radiant", "centre"),
]

TALENTS = [
    ("rives", "Rives", "director"),
    ("halcyon", "Halcyon", "director"),
    ("camille-ferrand", "Camille Ferrand", "photographer"),
]

UNLISTED_WORK = ("the-quiet-room", "The Quiet Room", "left")
UNLISTED_TALENT = ("noor-vasquez", "Noor Vasquez", "stylist")

MERIDIAN_TALENT = ("sable-ito", "Sable Ito", "director")
MERIDIAN_WORK = ("foundry", "Foundry", "left")

# Intrinsic sizes of generated media, per variant. (width, height)
VARIANT_SIZE = {
    "left": (598, 320),    # 1.87
    "right": (300, 300),   # 1.0
    "centre": (1006, 617), # 1.63
}
PORTRAIT_SIZE = (246, 311)  # portrait poster on the roster


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_hex_token() -> str:
    return secrets.token_hex(16)


class Database:
    """Thin pool wrapper; every statement is parameterised."""

    def __init__(self, url: str):
        self.url = url
        self._pool = psycopg_pool.ConnectionPool(
            url,
            min_size=1,
            max_size=8,
            open=True,
            kwargs={"autocommit": True, "row_factory": psycopg.rows.dict_row},
        )

    @contextmanager
    def conn(self):
        with self._pool.connection() as c:
            yield c

    def one(self, query, params=()):
        with self.conn() as c:
            return c.execute(query, params).fetchone()

    def all(self, query, params=()):
        with self.conn() as c:
            return c.execute(query, params).fetchall()

    def run(self, query, params=()):
        with self.conn() as c:
            return c.execute(query, params)

    @contextmanager
    def tx(self):
        with self.conn() as c:
            with c.transaction():
                yield c

    # ---------------------------------------------------------------- setup

    def migrate(self):
        # the advisory lock keeps two booting workers from racing on the
        # catalog; CREATE TABLE IF NOT EXISTS is still the only writer
        with self.conn() as c:
            c.execute("SELECT pg_advisory_lock(hashtext('cirrus-migrate'))")
        try:
            with self.conn() as c:
                c.execute(SCHEMA)
        finally:
            with self.conn() as c:
                c.execute("SELECT pg_advisory_unlock(hashtext('cirrus-migrate'))")

    def healthy(self) -> bool:
        row = self.one("SELECT count(*) AS n FROM items WHERE kind = 'talent'")
        return bool(row and row["n"] >= 0)

    # ----------------------------------------------------------------- seed

    def seed(self):
        """Idempotent: every row is claimed by a stable natural key first.

        Two workers may boot at once; the advisory lock makes the seed serial,
        and the natural keys make running it twice a no-op.
        """
        with self.conn() as c:
            c.execute("SELECT pg_advisory_lock(hashtext('cirrus-seed'))")
        try:
            self._seed_body()
        finally:
            with self.conn() as c:
                c.execute("SELECT pg_advisory_unlock(hashtext('cirrus-seed'))")

    def _seed_body(self):
        with self.tx() as c:

            houses = {
                "cirrus": c.execute(
                    """INSERT INTO houses (slug, name, tagline_upper, tagline_lower,
                                              street, city, district, contact_email)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
                       RETURNING id""",
                    ("cirrus", "Cirrus", "For picture", "and its makers",
                     "9 passage Bellevue", "Paris", "11e", "prod@example.com"),
                ).fetchone()["id"],
                "meridian": c.execute(
                    """INSERT INTO houses (slug, name, tagline_upper, tagline_lower,
                                              street, city, district, contact_email)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
                       RETURNING id""",
                    ("meridian", "Meridian", "Measured pictures", "for measured people",
                     "3 rue de l'Index", "Paris", "3e", "prod@meridian.example"),
                ).fetchone()["id"],
            }

            from . import auth

            def account(email, role, house_id):
                c.execute(
                    """INSERT INTO accounts (email, password_hash, role, house_id)
                       VALUES (%s, %s, %s, %s)
                       ON CONFLICT (email) DO UPDATE
                         SET role = EXCLUDED.role, house_id = EXCLUDED.house_id""",
                    (email, auth.hash_password(DEMO_PASSWORD), role, house_id),
                )

            account("producer@example.com", "producer", houses["cirrus"])
            account("producer.meridian@example.com", "producer", houses["meridian"])
            account("viewer@example.com", "viewer", None)

            def item(house_id, kind, slug, title, position, discipline, variant,
                     published):
                return c.execute(
                    """INSERT INTO items (house_id, kind, slug, title, position,
                                          discipline, variant, published, published_at)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (house_id, kind, lower(slug)) DO UPDATE
                         SET title = EXCLUDED.title, position = EXCLUDED.position,
                             discipline = EXCLUDED.discipline, variant = EXCLUDED.variant
                       RETURNING id, published""",
                    (house_id, kind, slug, title, position, discipline, variant,
                     published, utcnow() if published else None),
                ).fetchone()

            def media(item_id, role, position, seed, width, height, alt):
                # A media row is claimed by (item, role, position): seeding twice
                # must not duplicate the pixels.
                existing = c.execute(
                    """SELECT id FROM media WHERE item_id = %s AND role = %s
                                             AND position = %s""",
                    (item_id, role, position),
                ).fetchone()
                if existing:
                    return existing["id"]
                mid = new_hex_token()
                c.execute(
                    """INSERT INTO media (id, item_id, role, position, seed,
                                          width, height, alt)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (mid, item_id, role, position, seed, width, height, alt),
                )
                return mid

            # ---- works
            for i, (slug, title, variant) in enumerate(WORKS, start=1):
                ordinal = f"{i:03d}"
                w, h = VARIANT_SIZE[variant]
                row = item(houses["cirrus"], "work", slug, title, i, None, variant, True)
                published = row["published"]
                media(row["id"], "poster", 0, f"{slug}-poster", w, h,
                      f"{title}, film {ordinal}, still" if published
                      else f"{title}, film still")
                media(row["id"], "reel", 0, f"{slug}-reel", w, h,
                      f"{title}, film {ordinal}, reel")
                # gallery stills: variant rhythm continues down the page
                for g in range(1, 3):
                    gv = VARIANT_SIZE[("left", "centre", "right")[(i + g) % 3]]
                    media(row["id"], "gallery", g, f"{slug}-still-{g}", gv[0], gv[1],
                          f"{title}, film {ordinal}, still {g + 1}" if published
                          else f"{title}, still {g + 1}")

            # ---- the unlisted work
            w, h = VARIANT_SIZE["left"]
            row = item(houses["cirrus"], "work", UNLISTED_WORK[0], UNLISTED_WORK[1],
                       len(WORKS) + 1, None, UNLISTED_WORK[2], False)
            media(row["id"], "poster", 0, "the-quiet-room-poster", w, h,
                  "The Quiet Room, film still")

            # ---- talents
            for i, (slug, title, discipline) in enumerate(TALENTS, start=1):
                row = item(houses["cirrus"], "talent", slug, title, i, discipline,
                           None, True)
                media(row["id"], "poster", 0, f"{slug}-portrait", *PORTRAIT_SIZE,
                      f"{title}, {discipline}, portrait")
                media(row["id"], "reel", 0, f"{slug}-reel", *VARIANT_SIZE["centre"],
                      f"{title}, {discipline}, reel")

            # ---- the unlisted talent
            row = item(houses["cirrus"], "talent", UNLISTED_TALENT[0], UNLISTED_TALENT[1],
                       len(TALENTS) + 1, UNLISTED_TALENT[2], None, False)
            media(row["id"], "poster", 0, "noor-vasquez-portrait", *PORTRAIT_SIZE,
                  "Noor Vasquez, stylist, portrait")

            # ---- meridian
            row = item(houses["meridian"], "talent", MERIDIAN_TALENT[0],
                       MERIDIAN_TALENT[1], 1, MERIDIAN_TALENT[2], None, True)
            media(row["id"], "poster", 0, "sable-ito-portrait", *PORTRAIT_SIZE,
                  "Sable Ito, director, portrait")
            row = item(houses["meridian"], "work", MERIDIAN_WORK[0], MERIDIAN_WORK[1],
                       1, None, MERIDIAN_WORK[2], True)
            w, h = VARIANT_SIZE["left"]
            media(row["id"], "poster", 0, "foundry-poster", w, h, "Foundry, film still")
            media(row["id"], "reel", 0, "foundry-reel", w, h, "Foundry, film reel")

            # ---- credits
            def credit(work_slug, role, name, talent_slug):
                wrow = c.execute(
                    "SELECT id FROM items WHERE house_id = %s AND kind = 'work' AND slug = %s",
                    (houses["cirrus"], work_slug)).fetchone()
                trow = None
                if talent_slug:
                    trow = c.execute(
                        "SELECT id FROM items WHERE house_id = %s AND kind = 'talent' AND slug = %s",
                        (houses["cirrus"], talent_slug)).fetchone()
                existing = c.execute(
                    "SELECT id FROM credits WHERE item_id = %s AND role = %s AND name = %s",
                    (wrow["id"], role, name)).fetchone()
                if existing:
                    return
                c.execute(
                    """INSERT INTO credits (item_id, position, role, name, talent_item_id)
                       VALUES (%s,%s,%s,%s,%s)""",
                    (wrow["id"], 0, role, name, trow["id"] if trow else None))

            credit("the-halo", "Director", "Rives", "rives")
            credit("sonder", "Director", "Halcyon", "halcyon")
            credit("loris", "Photographer", "Camille Ferrand", "camille-ferrand")


def init_db(url: str) -> Database:
    db = Database(url)
    db.migrate()
    db.seed()
    return db
