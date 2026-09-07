"""Idempotent seed. Restarting the app must not duplicate a single row."""
from __future__ import annotations

import secrets

import psycopg

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
        street="4 RUE DU SENTIER",
        city="PARIS",
        district="02",
        contact_email="prod@meridian.example.com",
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

# Intrinsic sizes a container reserves before pixels arrive.
VARIANT_SIZE = {"left": (598, 320), "right": (300, 300), "centre": (1006, 617)}
PORTRAIT_SIZE = (246, 328)

CREDITS = {
    "the-halo": [
        ("Director", "Rives", "rives"),
        ("Producer", "Elise Marchand", None),
        ("Director of Photography", "Jonas Weil", None),
    ],
    "sonder": [
        ("Director", "Halcyon", "halcyon"),
        ("Producer", "Elise Marchand", None),
    ],
    "loris": [
        ("Photographer", "Camille Ferrand", "camille-ferrand"),
        ("Stylist", "Ines Aubert", None),
    ],
    "binary": [("Producer", "Elise Marchand", None)],
    "common-ground": [("Director", "Rives", "rives")],
    "nve": [("Photographer", "Camille Ferrand", "camille-ferrand")],
    "the-radiant": [("Director", "Halcyon", "halcyon")],
}

GALLERY_PATTERN = ["left", "centre", "right"]


def _hex32() -> str:
    return secrets.token_hex(16)


def _seed_for(slug: str, role: str, index: int) -> str:
    return f"{slug}-{role}-{index}"


def seed_all(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        for h in HOUSES:
            cur.execute(
                """
                INSERT INTO houses (slug, name, tagline_upper, tagline_lower,
                                    street, city, district, contact_email)
                VALUES (%(slug)s, %(name)s, %(tagline_upper)s, %(tagline_lower)s,
                        %(street)s, %(city)s, %(district)s, %(contact_email)s)
                ON CONFLICT (slug) DO NOTHING
                """,
                h,
            )
        cur.execute("SELECT id, slug FROM houses")
        houses = {r["slug"]: r["id"] for r in cur.fetchall()}

        pw = hash_password(SEED_PASSWORD)
        for email, role, house_slug in ACCOUNTS:
            cur.execute(
                """
                INSERT INTO accounts (email, password_hash, role, house_id)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (email) DO NOTHING
                """,
                (email, pw, role, houses.get(house_slug) if house_slug else None),
            )

        def upsert_items(house_slug, kind, rows):
            house_id = houses[house_slug]
            for pos, row in enumerate(rows):
                title, slug, extra, published = row
                discipline = extra if kind == "talent" else None
                variant = extra if kind == "work" else None
                cur.execute(
                    """
                    INSERT INTO items (house_id, kind, slug, title, position,
                                       discipline, variant, published, published_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                            CASE WHEN %s THEN now() ELSE NULL END)
                    ON CONFLICT (house_id, kind, lower(slug)) DO NOTHING
                    """,
                    (house_id, kind, slug, title, pos, discipline, variant,
                     published, published),
                )

        upsert_items("cirrus", "work", CIRRUS_WORKS)
        upsert_items("cirrus", "talent", CIRRUS_TALENTS)
        upsert_items("meridian", "work", MERIDIAN_WORKS)
        upsert_items("meridian", "talent", MERIDIAN_TALENTS)

        cur.execute("SELECT id, house_id, kind, slug, title, variant, discipline, published FROM items")
        items = cur.fetchall()
        by_key = {(r["house_id"], r["kind"], r["slug"]): r for r in items}

        # Media: only inserted when the record has none, which keeps the seed
        # idempotent while media ids stay randomly minted and unguessable.
        cur.execute("SELECT DISTINCT item_id FROM media")
        with_media = {r["item_id"] for r in cur.fetchall()}

        for it in items:
            if it["id"] in with_media:
                continue
            rows = []
            if it["kind"] == "work":
                w, h = VARIANT_SIZE.get(it["variant"] or "left", VARIANT_SIZE["left"])
                rows.append(("poster", 0, w, h,
                             f"{it['title']} - still from the film"))
                if it["published"]:
                    rows.append(("reel", 0, 1440, 810,
                                 f"{it['title']} - showreel"))
                    for i, variant in enumerate(GALLERY_PATTERN):
                        gw, gh = VARIANT_SIZE[variant]
                        rows.append(("gallery", i, gw, gh,
                                     f"{it['title']} - still {i + 1}"))
            else:
                pw_, ph_ = PORTRAIT_SIZE
                rows.append(("poster", 0, pw_, ph_,
                             f"{it['title']}, {it['discipline']} - portrait"))
                if it["published"]:
                    rows.append(("reel", 0, 1440, 810,
                                 f"{it['title']} - showreel"))
            for role, pos, w, h, alt in rows:
                cur.execute(
                    """
                    INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (_hex32(), it["id"], role, pos,
                     _seed_for(it["slug"], role, pos), w, h, alt),
                )

        cirrus = houses["cirrus"]
        cur.execute(
            "SELECT COUNT(*) AS n FROM credits c JOIN items i ON i.id = c.item_id "
            "WHERE i.house_id = %s",
            (cirrus,),
        )
        if cur.fetchone()["n"] == 0:
            for work_slug, entries in CREDITS.items():
                work = by_key.get((cirrus, "work", work_slug))
                if not work:
                    continue
                for pos, (role, name, talent_slug) in enumerate(entries):
                    talent = by_key.get((cirrus, "talent", talent_slug)) if talent_slug else None
                    cur.execute(
                        """
                        INSERT INTO credits (item_id, position, role, name, talent_item_id)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        (work["id"], pos, role, name, talent["id"] if talent else None),
                    )
    conn.commit()
