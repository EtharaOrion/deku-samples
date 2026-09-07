"""Database access: connection handling, schema and the idempotent seed."""
import os
import secrets
import threading

import psycopg
from psycopg.rows import dict_row
from werkzeug.security import generate_password_hash

_local = threading.local()

DEMO_PASSWORD = "deku-demo-pw-2026"


def dsn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


def connect():
    return psycopg.connect(dsn(), row_factory=dict_row, autocommit=False)


def get_conn():
    """One connection per thread, reconnected if the server dropped it."""
    conn = getattr(_local, "conn", None)
    if conn is None or conn.closed:
        conn = connect()
        _local.conn = conn
    return conn


def close_conn(_exc=None):
    conn = getattr(_local, "conn", None)
    if conn is not None:
        try:
            if _exc is not None:
                conn.rollback()
        except Exception:
            pass


def query(sql, params=None):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            rows = cur.fetchall()
        conn.commit()
        return rows
    except Exception:
        conn.rollback()
        raise


def query_one(sql, params=None):
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql, params=None, returning=False):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            row = cur.fetchone() if returning else None
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise


SCHEMA = """
CREATE TABLE IF NOT EXISTS houses (
    id              BIGSERIAL PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    tagline_upper   TEXT NOT NULL,
    tagline_lower   TEXT NOT NULL,
    street          TEXT NOT NULL,
    city            TEXT NOT NULL,
    district        TEXT NOT NULL,
    contact_email   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
    id              BIGSERIAL PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('producer','viewer')),
    house_id        BIGINT REFERENCES houses(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT accounts_house_by_role CHECK (
        (role = 'producer' AND house_id IS NOT NULL) OR
        (role = 'viewer'   AND house_id IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS items (
    id              BIGSERIAL PRIMARY KEY,
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
    CONSTRAINT items_projection CHECK (
        (kind = 'work'   AND discipline IS NULL AND variant IS NOT NULL) OR
        (kind = 'talent' AND variant IS NULL    AND discipline IS NOT NULL)
    )
);

-- Slug uniqueness per house per kind, decided after lowercasing, held by the
-- database itself rather than by an application-level check.
CREATE UNIQUE INDEX IF NOT EXISTS items_house_kind_slug_key
    ON items (house_id, kind, lower(slug));

CREATE INDEX IF NOT EXISTS items_house_kind_pos_idx ON items (house_id, kind, position, id);

CREATE TABLE IF NOT EXISTS media (
    id              CHAR(32) PRIMARY KEY,
    item_id         BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('poster','reel','gallery')),
    position        INTEGER NOT NULL DEFAULT 0,
    seed            TEXT NOT NULL,
    width           INTEGER NOT NULL CHECK (width > 0),
    height          INTEGER NOT NULL CHECK (height > 0),
    alt             TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_item_idx ON media (item_id, role, position, id);

CREATE TABLE IF NOT EXISTS credits (
    id              BIGSERIAL PRIMARY KEY,
    item_id         BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL DEFAULT 0,
    role            TEXT NOT NULL,
    name            TEXT NOT NULL,
    talent_item_id  BIGINT REFERENCES items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS credits_item_idx ON credits (item_id, position, id);
CREATE INDEX IF NOT EXISTS credits_talent_idx ON credits (talent_item_id);

CREATE TABLE IF NOT EXISTS preview_tokens (
    id              BIGSERIAL PRIMARY KEY,
    token           CHAR(32) NOT NULL UNIQUE,
    item_id         BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_by      BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slug_redirects (
    id              BIGSERIAL PRIMARY KEY,
    house_id        BIGINT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('work','talent')),
    old_slug        TEXT NOT NULL,
    item_id         BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS slug_redirects_key
    ON slug_redirects (house_id, kind, lower(old_slug));
"""


def new_hex_id():
    return secrets.token_hex(16)


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

# Extra credits carried by seeded works; a name the house does not represent is
# the common case, which is why talent_item_id is nullable.
EXTRA_CREDITS = {
    "the-halo": [("Producer", "Elise Marchand"), ("Photography", "Tomas Iver")],
    "sonder": [("Producer", "Elise Marchand")],
    "loris": [("Direction", "Rives"), ("Producer", "Jean Aubert")],
    "binary": [("Director", "Halcyon"), ("Post", "Studio Vermeil")],
}


def _ensure_media(cur, item_id, role, position, seed, width, height, alt):
    cur.execute(
        "SELECT id FROM media WHERE item_id=%s AND role=%s AND position=%s",
        (item_id, role, position),
    )
    if cur.fetchone():
        return
    cur.execute(
        """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
        (new_hex_id(), item_id, role, position, seed, width, height, alt),
    )


def _ensure_item(cur, house_id, kind, slug, title, position, discipline, variant,
                 published):
    cur.execute(
        "SELECT * FROM items WHERE house_id=%s AND kind=%s AND lower(slug)=lower(%s)",
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


def init_db():
    """Create the schema and seed it. Safe to run on every boot."""
    with connect() as conn:
        with conn.cursor() as cur:
            # One advisory lock so concurrent workers do not race the seed.
            cur.execute("SELECT pg_advisory_lock(918273645)")
            try:
                cur.execute(SCHEMA)
                _seed(cur)
            finally:
                cur.execute("SELECT pg_advisory_unlock(918273645)")
        conn.commit()


def _seed(cur):
    houses = {
        "cirrus": dict(
            name="Cirrus", tagline_upper="FOR PICTURE", tagline_lower="AND ITS MAKERS",
            street="9 PASSAGE BELLEVUE", city="PARIS", district="11",
            contact_email="prod@example.com",
        ),
        "meridian": dict(
            name="Meridian", tagline_upper="FOR PICTURE", tagline_lower="AND ITS MAKERS",
            street="4 RUE DES ORMES", city="LYON", district="02",
            contact_email="prod@meridian.example.com",
        ),
    }
    house_ids = {}
    for slug, h in houses.items():
        cur.execute("SELECT id FROM houses WHERE slug=%s", (slug,))
        row = cur.fetchone()
        if row:
            house_ids[slug] = row["id"]
            continue
        cur.execute(
            """INSERT INTO houses (slug, name, tagline_upper, tagline_lower, street,
                                   city, district, contact_email)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (slug, h["name"], h["tagline_upper"], h["tagline_lower"], h["street"],
             h["city"], h["district"], h["contact_email"]),
        )
        house_ids[slug] = cur.fetchone()["id"]

    pw = generate_password_hash(DEMO_PASSWORD)
    for email, role, house in (
        ("producer@example.com", "producer", "cirrus"),
        ("producer.meridian@example.com", "producer", "meridian"),
        ("viewer@example.com", "viewer", None),
    ):
        cur.execute("SELECT id FROM accounts WHERE email=%s", (email,))
        if cur.fetchone():
            continue
        cur.execute(
            "INSERT INTO accounts (email, password_hash, role, house_id) VALUES (%s,%s,%s,%s)",
            (email, pw, role, house_ids[house] if house else None),
        )

    cirrus = house_ids["cirrus"]

    for i, (title, slug, variant) in enumerate(WORKS):
        item_id = _ensure_item(cur, cirrus, "work", slug, title, i, None, variant, True)
        w, h = VARIANT_SIZE[variant]
        _ensure_media(cur, item_id, "poster", 0, f"{slug}-poster", w, h,
                      f"{title}, still from the film")
        _ensure_media(cur, item_id, "reel", 0, f"{slug}-reel", 1440, 810,
                      f"{title}, showreel")
        for j, (variant2, extra) in enumerate((("centre", "a"), ("left", "b"), ("right", "c"))):
            gw, gh = VARIANT_SIZE[variant2]
            _ensure_media(cur, item_id, "gallery", j, f"{slug}-gallery-{extra}", gw, gh,
                          f"{title}, frame {j + 1}")

    quiet = _ensure_item(cur, cirrus, "work", "the-quiet-room", "The Quiet Room", 12,
                         None, "left", False)
    _ensure_media(cur, quiet, "poster", 0, "the-quiet-room-poster", 598, 320,
                  "The Quiet Room, still from the film")

    talent_ids = {}
    for i, (name, slug, discipline) in enumerate(TALENTS):
        tid = _ensure_item(cur, cirrus, "talent", slug, name, i, discipline, None, True)
        talent_ids[slug] = tid
        _ensure_media(cur, tid, "poster", 0, f"{slug}-portrait", 246, 328,
                      f"{name}, {discipline}, portrait")
        _ensure_media(cur, tid, "reel", 0, f"{slug}-reel", 1440, 810,
                      f"{name}, showreel")

    noor = _ensure_item(cur, cirrus, "talent", "noor-vasquez", "Noor Vasquez", 3,
                        "stylist", None, False)
    _ensure_media(cur, noor, "poster", 0, "noor-vasquez-portrait", 246, 328,
                  "Noor Vasquez, stylist, portrait")

    def work_id(slug):
        cur.execute(
            "SELECT id FROM items WHERE house_id=%s AND kind='work' AND slug=%s",
            (cirrus, slug),
        )
        return cur.fetchone()["id"]

    def ensure_credit(item_id, position, role, name, talent_item_id):
        cur.execute(
            "SELECT id FROM credits WHERE item_id=%s AND position=%s", (item_id, position)
        )
        if cur.fetchone():
            return
        cur.execute(
            """INSERT INTO credits (item_id, position, role, name, talent_item_id)
               VALUES (%s,%s,%s,%s,%s)""",
            (item_id, position, role, name, talent_item_id),
        )

    ensure_credit(work_id("the-halo"), 0, "Director", "Rives", talent_ids["rives"])
    ensure_credit(work_id("sonder"), 0, "Director", "Halcyon", talent_ids["halcyon"])
    ensure_credit(work_id("loris"), 0, "Photographer", "Camille Ferrand",
                  talent_ids["camille-ferrand"])
    for slug, extras in EXTRA_CREDITS.items():
        wid = work_id(slug)
        for k, (role, name) in enumerate(extras, start=1):
            ensure_credit(wid, k, role, name, None)

    meridian = house_ids["meridian"]
    sable = _ensure_item(cur, meridian, "talent", "sable-ito", "Sable Ito", 0,
                         "director", None, True)
    _ensure_media(cur, sable, "poster", 0, "sable-ito-portrait", 246, 328,
                  "Sable Ito, director, portrait")
    foundry = _ensure_item(cur, meridian, "work", "foundry", "Foundry", 0, None,
                           "left", True)
    _ensure_media(cur, foundry, "poster", 0, "foundry-poster", 598, 320,
                  "Foundry, still from the film")
    _ensure_media(cur, foundry, "reel", 0, "foundry-reel", 1440, 810, "Foundry, showreel")
