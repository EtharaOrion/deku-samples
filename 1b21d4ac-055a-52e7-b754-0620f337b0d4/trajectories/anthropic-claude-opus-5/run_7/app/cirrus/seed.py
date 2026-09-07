"""Idempotent schema application and seed. Runs at container start, once, safely."""
import hashlib
import os
import pathlib

from . import db
from .security import hash_password

SEED_PASSWORD = "deku-demo-pw-2026"

HOUSES = [
    dict(
        slug="cirrus",
        name="Cirrus",
        tagline_upper="FOR PICTURE",
        tagline_lower="AND ITS MAKERS",
        street="9 PASSAGE BELLEVUE",
        city="PARIS",
        district="11",
        contact_email="prod@example.com",
    ),
    dict(
        slug="meridian",
        name="Meridian",
        tagline_upper="FOR PICTURE",
        tagline_lower="AND ITS MAKERS",
        street="4 RUE DES ORMES",
        city="LYON",
        district="02",
        contact_email="prod.meridian@example.com",
    ),
]

ACCOUNTS = [
    ("producer@example.com", "producer", "cirrus"),
    ("producer.meridian@example.com", "producer", "meridian"),
    ("viewer@example.com", "viewer", None),
]

CIRRUS_WORKS = [
    ("The Halo", "the-halo", "left", True),
    ("Sonder", "sonder", "right", True),
    ("BINARY", "binary", "centre", True),
    ("Common Ground", "common-ground", "left", True),
    ("NVE", "nve", "right", True),
    ("The Absolute Shelter", "the-absolute-shelter", "centre", True),
    ("MAISON DE LUMIERE", "maison-de-lumiere", "left", True),
    ("LORIS", "loris", "right", True),
    ("MDL Serie Extreme", "mdl-serie-extreme", "centre", True),
    ("AK", "ak", "left", True),
    ("Loris Shoot Studio", "loris-shoot-studio", "right", True),
    ("The Radiant", "the-radiant", "centre", True),
    ("The Quiet Room", "the-quiet-room", "left", False),
]

CIRRUS_TALENTS = [
    ("Rives", "rives", "director", True),
    ("Halcyon", "halcyon", "director", True),
    ("Camille Ferrand", "camille-ferrand", "photographer", True),
    ("Noor Vasquez", "noor-vasquez", "stylist", False),
]

MERIDIAN_WORKS = [("Foundry", "foundry", "left", True)]
MERIDIAN_TALENTS = [("Sable Ito", "sable-ito", "director", True)]

CREDIT_SEED = {
    "the-halo": [("Director", "Rives", "rives"), ("Producer", "Elise Marchand", None)],
    "sonder": [("Director", "Halcyon", "halcyon"), ("Producer", "Elise Marchand", None)],
    "loris": [
        ("Photographer", "Camille Ferrand", "camille-ferrand"),
        ("Stylist", "Jonas Ekberg", None),
    ],
    "binary": [("Director", "Rives", "rives"), ("Editor", "Tomas Rey", None)],
    "common-ground": [("Producer", "Elise Marchand", None)],
    "nve": [("Photographer", "Camille Ferrand", "camille-ferrand")],
    "the-absolute-shelter": [("Director", "Halcyon", "halcyon")],
    "maison-de-lumiere": [("Director", "Rives", "rives")],
    "mdl-serie-extreme": [("Producer", "Anouk Girard", None)],
    "ak": [("Director", "Halcyon", "halcyon")],
    "loris-shoot-studio": [("Photographer", "Camille Ferrand", "camille-ferrand")],
    "the-radiant": [("Director", "Rives", "rives")],
    "the-quiet-room": [("Director", "Rives", "rives")],
    "foundry": [("Director", "Sable Ito", "sable-ito")],
}

VARIANT_SIZE = {"left": (598, 320), "right": (300, 300), "centre": (1006, 617)}


def media_id(*parts: str) -> str:
    return hashlib.md5(("cirrus-media:" + ":".join(parts)).encode()).hexdigest()


def apply_schema(conn) -> None:
    sql = (pathlib.Path(__file__).parent / "sql" / "schema.sql").read_text()
    with conn.cursor() as cur:
        cur.execute(sql)


def _house_ids(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT id, slug FROM houses")
        return {r["slug"]: r["id"] for r in cur.fetchall()}


def _upsert_house(conn, h):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO houses (slug, name, tagline_upper, tagline_lower, street, city,
                                   district, contact_email)
               VALUES (%(slug)s,%(name)s,%(tagline_upper)s,%(tagline_lower)s,%(street)s,
                       %(city)s,%(district)s,%(contact_email)s)
               ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
               RETURNING id""",
            h,
        )
        return cur.fetchone()["id"]


def _upsert_account(conn, email, role, house_id, pw_hash):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO accounts (email, password_hash, role, house_id)
               VALUES (%s,%s,%s,%s)
               ON CONFLICT (email) DO UPDATE
                 SET role = EXCLUDED.role, house_id = EXCLUDED.house_id
               RETURNING id""",
            (email.lower(), pw_hash, role, house_id),
        )
        return cur.fetchone()["id"]


def _upsert_item(conn, house_id, kind, slug, title, position, discipline, variant, published):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM items WHERE house_id=%s AND kind=%s AND lower(slug)=%s",
            (house_id, kind, slug),
        )
        row = cur.fetchone()
        if row:
            return row["id"]
        cur.execute(
            """INSERT INTO items (house_id, kind, slug, title, position, discipline, variant,
                                  published, published_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,
                       CASE WHEN %s THEN (now() AT TIME ZONE 'utc') ELSE NULL END)
               RETURNING id""",
            (house_id, kind, slug, title, position, discipline, variant, published, published),
        )
        return cur.fetchone()["id"]


def _upsert_media(conn, mid, item_id, role, position, seed, width, height, alt):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (id) DO NOTHING""",
            (mid, item_id, role, position, seed, width, height, alt),
        )


def _upsert_credit(conn, item_id, position, role, name, talent_item_id):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM credits WHERE item_id=%s AND position=%s",
            (item_id, position),
        )
        if cur.fetchone():
            return
        cur.execute(
            "INSERT INTO credits (item_id, position, role, name, talent_item_id) "
            "VALUES (%s,%s,%s,%s,%s)",
            (item_id, position, role, name, talent_item_id),
        )


def _seed_work_media(conn, item_id, slug, title, variant, published, ordinal_hint):
    w, h = VARIANT_SIZE.get(variant, (598, 320))
    _upsert_media(
        conn, media_id(slug, "poster"), item_id, "poster", 0, f"{slug}-poster", w, h,
        f"{title}, still {ordinal_hint}",
    )
    if not published:
        return
    _upsert_media(
        conn, media_id(slug, "reel"), item_id, "reel", 0, f"{slug}-reel", 1440, 810,
        f"{title}, showreel",
    )
    for i, var in enumerate(("left", "right", "centre")):
        gw, gh = VARIANT_SIZE[var]
        _upsert_media(
            conn, media_id(slug, f"gallery{i}"), item_id, "gallery", i,
            f"{slug}-gallery-{i}", gw, gh, f"{title}, still {i + 1}",
        )


def _seed_talent_media(conn, item_id, slug, name, discipline, published):
    _upsert_media(
        conn, media_id(slug, "poster"), item_id, "poster", 0, f"{slug}-portrait", 246, 328,
        f"{name}, {discipline}",
    )
    if published:
        _upsert_media(
            conn, media_id(slug, "reel"), item_id, "reel", 0, f"{slug}-reel", 1440, 810,
            f"{name}, showreel",
        )


def run() -> None:
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_lock(872311001)")
        try:
            apply_schema(conn)
            conn.commit()

            pw_hash = hash_password(SEED_PASSWORD)
            for h in HOUSES:
                _upsert_house(conn, h)
            houses = _house_ids(conn)
            for email, role, house_slug in ACCOUNTS:
                _upsert_account(
                    conn, email, role, houses[house_slug] if house_slug else None, pw_hash
                )

            plan = [
                ("cirrus", CIRRUS_WORKS, CIRRUS_TALENTS),
                ("meridian", MERIDIAN_WORKS, MERIDIAN_TALENTS),
            ]
            slug_to_item = {}
            for house_slug, works, talents in plan:
                hid = houses[house_slug]
                for pos, (title, slug, variant, published) in enumerate(works):
                    iid = _upsert_item(
                        conn, hid, "work", slug, title, pos, None, variant, published
                    )
                    slug_to_item[(house_slug, "work", slug)] = iid
                    _seed_work_media(conn, iid, slug, title, variant, published, pos + 1)
                for pos, (name, slug, discipline, published) in enumerate(talents):
                    iid = _upsert_item(
                        conn, hid, "talent", slug, name, pos, discipline, None, published
                    )
                    slug_to_item[(house_slug, "talent", slug)] = iid
                    _seed_talent_media(conn, iid, slug, name, discipline, published)

            for house_slug, works, _ in plan:
                for title, slug, _v, _p in works:
                    iid = slug_to_item[(house_slug, "work", slug)]
                    for pos, (role, name, talent_slug) in enumerate(CREDIT_SEED.get(slug, [])):
                        tid = (
                            slug_to_item.get((house_slug, "talent", talent_slug))
                            if talent_slug
                            else None
                        )
                        _upsert_credit(conn, iid, pos, role, name, tid)
            conn.commit()
        finally:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_unlock(872311001)")
            conn.commit()


if __name__ == "__main__":  # pragma: no cover
    db.wait_for_db(float(os.environ.get("DB_WAIT_SECONDS", "60")))
    run()
    print("seed complete")
