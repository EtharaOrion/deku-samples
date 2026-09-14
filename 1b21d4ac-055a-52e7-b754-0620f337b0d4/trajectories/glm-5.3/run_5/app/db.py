"""Database access, schema creation and the idempotent seed.

PostgreSQL is the only store. Everything a record is lives here.
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS houses (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline_upper TEXT NOT NULL,
  tagline_lower TEXT NOT NULL,
  street TEXT NOT NULL,
  city TEXT NOT NULL,
  district TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('producer','viewer')),
  house_id TEXT REFERENCES houses(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((role = 'producer' AND house_id IS NOT NULL)
      OR (role = 'viewer' AND house_id IS NULL))
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  house_id TEXT NOT NULL REFERENCES houses(id),
  kind TEXT NOT NULL CHECK (kind IN ('work','talent')),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  discipline TEXT CHECK (discipline IN ('director','photographer','stylist')),
  variant TEXT CHECK (variant IN ('left','right','centre')),
  published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS items_slug_unique
  ON items (house_id, kind, lower(slug));
CREATE INDEX IF NOT EXISTS items_house_kind_pub ON items (house_id, kind, published, position);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('poster','reel','gallery')),
  position INTEGER NOT NULL DEFAULT 0,
  seed TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_item ON media (item_id, position);

CREATE TABLE IF NOT EXISTS credits (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  talent_item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credits_item ON credits (item_id, position);

CREATE TABLE IF NOT EXISTS preview_tokens (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by TEXT REFERENCES accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slug_redirects (
  id TEXT PRIMARY KEY,
  house_id TEXT NOT NULL REFERENCES houses(id),
  kind TEXT NOT NULL,
  old_slug TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (house_id, kind, old_slug)
);
"""

WORK_SEED = [
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

WORK_EXTRA_STILLS = {
    "the-halo": [("left", "Belle Chasse at first light"), ("right", "The hold, minutes before"),
                 ("centre", "On the far side of the window")],
    "sonder": [("right", "Studio floor after the last take"),
               ("centre", "Testing the long lens")],
    "loris": [("right", "The dolly waited an hour for this"),
              ("centre", "Props laid out for the second setup")],
    "maison-de-lumiere": [("right", "Testing one lamp against the plaster"),
                          ("centre", "Textures kept from the archive"),
                          ("left", "The room after everyone had gone")],
}

TALENT_SEED = [
    ("Rives", "rives", "director"),
    ("Halcyon", "halcyon", "director"),
    ("Camille Ferrand", "camille-ferrand", "photographer"),
]

MERIDIAN_TALENTS = [("Sable Ito", "sable-ito", "director")]
MERIDIAN_WORKS = [("Foundry", "foundry", "left")]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt) -> str | None:
    return dt.isoformat().replace("+00:00", "Z") if dt else None


def hex32() -> str:
    return secrets.token_hex(16)


def ident(kind: str) -> str:
    return f"{kind}_{hex32()}"


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"pbkdf2_sha256$120000${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt_hex, digest_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(rounds))
        return hmac.compare_digest(digest.hex(), digest_hex)
    except Exception:
        return False


def slugify(text: str) -> str:
    out = []
    for ch in text.strip().lower():
        if ch.isascii() and ch.isalnum():
            out.append(ch)
        elif ch in "-_":
            out.append("-")
        elif ch == " ":
            out.append("-")
    slug = "-".join(part for part in "".join(out).split("-") if part)
    return slug[:80]


def db() -> psycopg.Connection:
    conn = psycopg.connect(config.DATABASE_URL, autocommit=True)
    conn.execute("SET TIME ZONE 'UTC'")
    return conn


def ensure_schema(conn) -> None:
    conn.execute(SCHEMA)


def seed(conn) -> None:
    houses = [
        ("house_cirrus", "cirrus", "Cirrus", "FOR PICTURE", "AND ITS MAKERS",
         "9 Passage Bellevue", "Paris", "11e", "prod@example.com"),
        ("house_meridian", "meridian", "Meridian", "FOR PICTURE", "AND ITS MAKERS",
         "4 Rue de la Fonderie", "Paris", "12e", "studio@meridian.example"),
    ]
    for row in houses:
        conn.execute(
            """INSERT INTO houses (id, slug, name, tagline_upper, tagline_lower, street,
                                    city, district, contact_email)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""", row)

    pw = hash_password(config.DEMO_PASSWORD)
    accounts = [
        ("acc_producer_cirrus", "producer@example.com", pw, "producer", "house_cirrus"),
        ("acc_producer_meridian", "producer.meridian@example.com", pw, "producer", "house_meridian"),
        ("acc_viewer", "viewer@example.com", pw, "viewer", None),
    ]
    for row in accounts:
        conn.execute(
            """INSERT INTO accounts (id, email, password_hash, role, house_id)
               VALUES (%s,%s,%s,%s,%s) ON CONFLICT (email) DO NOTHING""", row)

    def ensure_item(house_id, kind, slug, title, position, discipline, variant, published):
        item_id = f"{kind}_{slugify(slug)}"
        conn.execute(
            """INSERT INTO items (id, house_id, kind, slug, title, position, discipline,
                                  variant, published, published_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (house_id, kind, lower(slug)) DO NOTHING""",
            (item_id, house_id, kind, slug, title, position, discipline, variant, published,
             utcnow() if published else None))
        return item_id

    def ensure_media(item_id, role, position, seed, width, height, alt):
        mid = f"media_{token_hash(f'{item_id}:{role}:{position}')[:32]}"
        conn.execute(
            """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
            (mid, item_id, role, position, seed, width, height, alt))
        return mid

    variant_geometry = {"left": (598, 320), "right": (300, 300), "centre": (1006, 617)}

    for i, (title, slug, variant) in enumerate(WORK_SEED):
        item_id = ensure_item("house_cirrus", "work", slug, title, i, None, variant, True)
        w, h = variant_geometry[variant]
        ensure_media(item_id, "poster", 0, f"seed-{slug}-poster", w, h,
                     f"Still from the film {title}")
        ensure_media(item_id, "reel", 0, f"seed-{slug}-reel", 1280, 720,
                     f"Moving image, {title}")
        for j, (extra_variant, alt) in enumerate(WORK_EXTRA_STILLS.get(slug, [])):
            ew, eh = variant_geometry[extra_variant]
            ensure_media(item_id, "gallery", j, f"seed-{slug}-g{j}", ew, eh, alt)

    ensure_item("house_cirrus", "work", "the-quiet-room", "The Quiet Room", 90, None, "left", False)
    ensure_media("work_the-quiet-room", "poster", 0, "seed-the-quiet-room-poster", 598, 320,
                 "Still from the film The Quiet Room")

    for i, (title, slug, discipline) in enumerate(TALENT_SEED):
        item_id = ensure_item("house_cirrus", "talent", slug, title, i, discipline, None, True)
        ensure_media(item_id, "poster", 0, f"seed-{slug}-portrait", 246, 340,
                     f"Portrait of {title}, {discipline}")

    ensure_item("house_cirrus", "talent", "noor-vasquez", "Noor Vasquez", 90, "stylist", None, False)
    ensure_media("talent_noor-vasquez", "poster", 0, "seed-noor-vasquez-portrait", 246, 340,
                 "Portrait of Noor Vasquez, stylist")

    for i, (title, slug, discipline) in enumerate(MERIDIAN_TALENTS):
        item_id = ensure_item("house_meridian", "talent", slug, title, i, discipline, None, True)
        ensure_media(item_id, "poster", 0, f"seed-{slug}-portrait", 246, 340,
                     f"Portrait of {title}, {discipline}")
    for i, (title, slug, variant) in enumerate(MERIDIAN_WORKS):
        item_id = ensure_item("house_meridian", "work", slug, title, i, None, variant, True)
        w, h = variant_geometry[variant]
        ensure_media(item_id, "poster", 0, f"seed-{slug}-poster", w, h, f"Still from {title}")
        ensure_media(item_id, "reel", 0, f"seed-{slug}-reel", 1280, 720, f"Moving image, {title}")

    credits = [
        ("work_the-halo", 0, "Director", "Rives", "talent_rives"),
        ("work_sonder", 0, "Director", "Halcyon", "talent_halcyon"),
        ("work_loris", 0, "Photographer", "Camille Ferrand", "talent_camille-ferrand"),
    ]
    for item_id, position, role, name, talent_id in credits:
        conn.execute(
            """INSERT INTO credits (id, item_id, position, role, name, talent_item_id)
               VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
            (f"credit_{token_hash(f'{item_id}:{role}:{name}')[:32]}",
             item_id, position, role, name, talent_id))
