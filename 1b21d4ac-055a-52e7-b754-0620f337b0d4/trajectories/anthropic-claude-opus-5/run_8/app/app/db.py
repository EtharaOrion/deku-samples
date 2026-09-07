"""PostgreSQL access: pool, schema, idempotent seed."""
import os
import secrets
import threading

import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

_pool = None
_lock = threading.Lock()

SERVED_HOUSE = os.environ.get("PUBLIC_HOUSE_SLUG", "cirrus")


def pool():
    global _pool
    if _pool is None:
        with _lock:
            if _pool is None:
                dsn = os.environ["DATABASE_URL"]
                _pool = ThreadedConnectionPool(1, 12, dsn)
    return _pool


class connection:
    """Context manager yielding a dict-cursor; commits on success."""

    def __init__(self, commit=True):
        self.commit = commit

    def __enter__(self):
        self.conn = pool().getconn()
        self.cur = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return self.cur

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None and self.commit:
                self.conn.commit()
            else:
                self.conn.rollback()
        finally:
            self.cur.close()
            pool().putconn(self.conn)
        return False


SCHEMA = """
CREATE TABLE IF NOT EXISTS houses (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    tagline_upper TEXT NOT NULL DEFAULT '',
    tagline_lower TEXT NOT NULL DEFAULT '',
    street TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    district TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('producer', 'viewer')),
    house_id INTEGER REFERENCES houses(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    house_id INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('work', 'talent')),
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    discipline TEXT CHECK (discipline IN ('director', 'photographer', 'stylist')),
    variant TEXT CHECK (variant IN ('left', 'right', 'centre')),
    published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- slug uniqueness held by the database, per house per kind, case-insensitively
CREATE UNIQUE INDEX IF NOT EXISTS items_house_kind_slug_key
    ON items (house_id, kind, lower(slug));

CREATE TABLE IF NOT EXISTS media (
    id CHAR(32) PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('poster', 'reel', 'gallery')),
    position INTEGER NOT NULL DEFAULT 0,
    seed BIGINT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    alt TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS media_item_role_position_key
    ON media (item_id, role, position);
CREATE INDEX IF NOT EXISTS media_item_idx ON media (item_id);

CREATE TABLE IF NOT EXISTS credits (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    talent_item_id INTEGER REFERENCES items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS credits_item_idx ON credits (item_id);
CREATE INDEX IF NOT EXISTS credits_talent_idx ON credits (talent_item_id);

CREATE TABLE IF NOT EXISTS preview_tokens (
    id SERIAL PRIMARY KEY,
    token CHAR(32) NOT NULL UNIQUE,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_by INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slug_redirects (
    id SERIAL PRIMARY KEY,
    house_id INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    old_slug TEXT NOT NULL,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS slug_redirects_key
    ON slug_redirects (house_id, kind, old_slug);

CREATE INDEX IF NOT EXISTS items_house_kind_idx ON items (house_id, kind, position);
"""

SEED_PASSWORD = "deku-demo-pw-2026"

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

VARIANT_SIZE = {"left": (598, 320), "right": (300, 300), "centre": (1006, 617)}
PORTRAIT_SIZE = (246, 328)


def new_hex_id():
    return secrets.token_hex(16)


def _ensure_media(cur, item_id, role, position, seed, width, height, alt):
    cur.execute(
        "SELECT id FROM media WHERE item_id=%s AND role=%s AND position=%s",
        (item_id, role, position),
    )
    if cur.fetchone():
        return
    cur.execute(
        """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT DO NOTHING""",
        (new_hex_id(), item_id, role, position, seed, width, height, alt),
    )


def _upsert_item(cur, house_id, kind, slug, title, position, discipline, variant,
                 published):
    cur.execute(
        "SELECT id FROM items WHERE house_id=%s AND kind=%s AND lower(slug)=lower(%s)",
        (house_id, kind, slug),
    )
    row = cur.fetchone()
    if row:
        return row["id"]
    cur.execute(
        """INSERT INTO items (house_id, kind, slug, title, position, discipline,
                              variant, published, published_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s, CASE WHEN %s THEN now() ELSE NULL END)
           RETURNING id""",
        (house_id, kind, slug, title, position, discipline, variant, published,
         published),
    )
    return cur.fetchone()["id"]


def seed():
    from .auth import hash_password

    with connection() as cur:
        # one seeder at a time, whatever the worker count
        cur.execute("SELECT pg_advisory_xact_lock(918273645)")
        cur.execute(SCHEMA)

        houses = {}
        for slug, name, tu, tl, street, city, district, email in [
            ("cirrus", "Cirrus", "FOR PICTURE", "AND ITS MAKERS",
             "9 PASSAGE BELLEVUE", "PARIS", "11", "prod@example.com"),
            ("meridian", "Meridian", "FOR THE LONG VIEW", "AND ITS KEEPERS",
             "2 RUE DES ORMES", "LYON", "03", "prod.meridian@example.com"),
        ]:
            cur.execute(
                """INSERT INTO houses (slug, name, tagline_upper, tagline_lower,
                                       street, city, district, contact_email)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (slug) DO NOTHING""",
                (slug, name, tu, tl, street, city, district, email))
            cur.execute("SELECT id FROM houses WHERE slug=%s", (slug,))
            houses[slug] = cur.fetchone()["id"]

        pw = hash_password(SEED_PASSWORD)
        for email, role, house in [
            ("producer@example.com", "producer", "cirrus"),
            ("producer.meridian@example.com", "producer", "meridian"),
            ("viewer@example.com", "viewer", None),
        ]:
            cur.execute(
                """INSERT INTO accounts (email, password_hash, role, house_id)
                   VALUES (%s,%s,%s,%s) ON CONFLICT (email) DO NOTHING""",
                (email, pw, role, houses[house] if house else None))

        cirrus = houses["cirrus"]
        work_ids = {}
        for i, (title, slug, variant) in enumerate(WORKS):
            iid = _upsert_item(cur, cirrus, "work", slug, title, i, None, variant, True)
            work_ids[slug] = iid
            w, h = VARIANT_SIZE[variant]
            _ensure_media(cur, iid, "poster", 0, 1000 + i * 37, w, h,
                          "%s, still" % title)
            _ensure_media(cur, iid, "reel", 0, 4000 + i * 53, w, h,
                          "%s, showreel" % title)
            for g in range(2):
                gv = ["left", "centre", "right"][(i + g) % 3]
                gw, gh = VARIANT_SIZE[gv]
                _ensure_media(cur, iid, "gallery", g, 7000 + i * 91 + g * 13, gw, gh,
                              "%s, still %d" % (title, g + 2))

        qr = _upsert_item(cur, cirrus, "work", "the-quiet-room", "The Quiet Room",
                          len(WORKS), None, "left", False)
        _ensure_media(cur, qr, "poster", 0, 3110, 598, 320, "The Quiet Room, still")

        for i, (name, slug, discipline) in enumerate(TALENTS):
            tid = _upsert_item(cur, cirrus, "talent", slug, name, i, discipline, None,
                               True)
            _ensure_media(cur, tid, "poster", 0, 2000 + i * 71, *PORTRAIT_SIZE,
                          alt="%s, %s, portrait" % (name, discipline))
            _ensure_media(cur, tid, "reel", 0, 5000 + i * 67, 1006, 617,
                          "%s, showreel" % name)

        noor = _upsert_item(cur, cirrus, "talent", "noor-vasquez", "Noor Vasquez",
                            len(TALENTS), "stylist", None, False)
        _ensure_media(cur, noor, "poster", 0, 2410, *PORTRAIT_SIZE,
                      alt="Noor Vasquez, stylist, portrait")

        for work_slug, role, talent_slug in [
            ("the-halo", "Director", "rives"),
            ("sonder", "Director", "halcyon"),
            ("loris", "Photographer", "camille-ferrand"),
        ]:
            cur.execute(
                "SELECT id FROM items WHERE house_id=%s AND kind='talent' AND slug=%s",
                (cirrus, talent_slug))
            tid = cur.fetchone()["id"]
            cur.execute("SELECT title FROM items WHERE id=%s", (tid,))
            tname = cur.fetchone()["title"]
            wid = work_ids[work_slug]
            cur.execute(
                "SELECT id FROM credits WHERE item_id=%s AND talent_item_id=%s",
                (wid, tid))
            if not cur.fetchone():
                cur.execute(
                    """INSERT INTO credits (item_id, position, role, name,
                                            talent_item_id)
                       VALUES (%s,%s,%s,%s,%s)""", (wid, 0, role, tname, tid))
            cur.execute(
                "SELECT id FROM credits WHERE item_id=%s AND talent_item_id IS NULL",
                (wid,))
            if not cur.fetchone():
                cur.execute(
                    """INSERT INTO credits (item_id, position, role, name,
                                            talent_item_id)
                       VALUES (%s,%s,%s,%s,NULL)""",
                    (wid, 1, "Producer", "Cirrus"))

        # Every other work carries credits that name people the house does not
        # represent: the nullable column is the common case.
        outside = [("Director", "Ilse Marchand"), ("Photographer", "Tomas Reyk"),
                   ("Production", "Atelier Nord")]
        for i, (slug, wid) in enumerate(sorted(work_ids.items())):
            cur.execute("SELECT count(*) AS n FROM credits WHERE item_id=%s", (wid,))
            if cur.fetchone()["n"] == 0:
                for p, (role, name) in enumerate(outside[i % 2:][:2]):
                    cur.execute(
                        """INSERT INTO credits (item_id, position, role, name,
                                                talent_item_id)
                           VALUES (%s,%s,%s,%s,NULL)""", (wid, p, role, name))

        meridian = houses["meridian"]
        sable = _upsert_item(cur, meridian, "talent", "sable-ito", "Sable Ito", 0,
                             "director", None, True)
        _ensure_media(cur, sable, "poster", 0, 8100, *PORTRAIT_SIZE,
                      alt="Sable Ito, director, portrait")
        foundry = _upsert_item(cur, meridian, "work", "foundry", "Foundry", 0, None,
                               "left", True)
        _ensure_media(cur, foundry, "poster", 0, 8200, 598, 320, "Foundry, still")
        _ensure_media(cur, foundry, "reel", 0, 8300, 598, 320, "Foundry, showreel")
