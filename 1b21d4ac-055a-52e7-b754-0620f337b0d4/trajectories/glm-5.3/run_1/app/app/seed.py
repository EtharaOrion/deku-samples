"""Idempotent seed. Restarting the app must not duplicate rows."""
import hashlib
import uuid

from .auth import hash_password

DEMO_PASSWORD = "deku-demo-pw-2026"

HOUSE_CIRRUS = uuid.uuid5(uuid.NAMESPACE_URL, "cirrus:house:cirrus")
HOUSE_MERIDIAN = uuid.uuid5(uuid.NAMESPACE_URL, "cirrus:house:meridian")
ACC_PRODUCER = uuid.uuid5(uuid.NAMESPACE_URL, "cirrus:account:producer@example.com")
ACC_PRODUCER_MERIDIAN = uuid.uuid5(uuid.NAMESPACE_URL, "cirrus:account:producer.meridian@example.com")
ACC_VIEWER = uuid.uuid5(uuid.NAMESPACE_URL, "cirrus:account:viewer@example.com")

HOUSES = [
    {
        "id": HOUSE_CIRRUS,
        "slug": "cirrus",
        "name": "Cirrus",
        "tagline_upper": "FOR PICTURE",
        "tagline_lower": "AND ITS MAKERS",
        "street": "9 PASSAGE BELLEVUE",
        "city": "PARIS",
        "district": "11",
        "contact_email": "prod@example.com",
    },
    {
        "id": HOUSE_MERIDIAN,
        "slug": "meridian",
        "name": "Meridian",
        "tagline_upper": "FOR PICTURE",
        "tagline_lower": "AND ITS MAKERS",
        "street": "9 PASSAGE BELLEVUE",
        "city": "PARIS",
        "district": "11",
        "contact_email": "prod@example.com",
    },
]

SIZES = {
    "left": (598, 320),
    "right": (300, 300),
    "centre": (1006, 617),
}
TALENT_PORTRAIT = (246, 328)


def _item_uuid(kind, slug):
    return uuid.UUID("11111111-0000-4000-8000-" + hashlib.md5(f"{kind}:{slug}".encode()).hexdigest()[:12])


def _media_id(*parts):
    return hashlib.md5(("cirrus:" + ":".join(parts)).encode()).hexdigest()


CIRRUS_WORKS = [
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
CIRRUS_UNLISTED_WORKS = [("The Quiet Room", "the-quiet-room", "left")]

CIRRUS_TALENTS = [
    ("Rives", "rives", "director"),
    ("Halcyon", "halcyon", "director"),
    ("Camille Ferrand", "camille-ferrand", "photographer"),
]
CIRRUS_UNLISTED_TALENTS = [("Noor Vasquez", "noor-vasquez", "stylist")]

MERIDIAN_TALENTS = [("Sable Ito", "sable-ito", "director")]
MERIDIAN_WORKS = [("Foundry", "foundry", "left")]

CIRRUS_CREDITS = [
    # work slug, role, name, talent slug
    ("the-halo", "Director", "Rives", "rives"),
    ("sonder", "Director", "Halcyon", "halcyon"),
    ("loris", "Photographer", "Camille Ferrand", "camille-ferrand"),
]


def upsert_house(conn, h):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO houses (id, slug, name, tagline_upper, tagline_lower, street,
                                    city, district, contact_email)
               VALUES (%(id)s, %(slug)s, %(name)s, %(tagline_upper)s, %(tagline_lower)s,
                       %(street)s, %(city)s, %(district)s, %(contact_email)s)
               ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name""",
            h,
        )


def upsert_account(conn, id_, email, role, house_id):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO accounts (id, email, password_hash, role, house_id)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (email) DO UPDATE
                 SET role = EXCLUDED.role, house_id = EXCLUDED.house_id,
                     password_hash = EXCLUDED.password_hash""",
            (id_, email, hash_password(DEMO_PASSWORD), role, house_id),
        )


def upsert_item(conn, house_id, kind, slug, title, position, discipline, variant, published):
    iid = _item_uuid(kind, slug)
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO items (id, house_id, kind, slug, title, position,
                                  discipline, variant, published, published_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s, CASE WHEN %s THEN now() ELSE NULL END)
               ON CONFLICT (house_id, kind, slug) DO UPDATE
                 SET title = EXCLUDED.title, position = EXCLUDED.position,
                     discipline = EXCLUDED.discipline, variant = EXCLUDED.variant,
                     published = EXCLUDED.published,
                     published_at = CASE WHEN EXCLUDED.published THEN items.published_at ELSE NULL END""",
            (iid, house_id, kind, slug, title, position, discipline, variant, published, published),
        )
    return iid


def upsert_media(conn, item_id, role, position, seed, width, height, alt):
    mid = _media_id(item_id.hex, role, str(position))
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (id) DO UPDATE
                 SET role = EXCLUDED.role, position = EXCLUDED.position, seed = EXCLUDED.seed,
                     width = EXCLUDED.width, height = EXCLUDED.height, alt = EXCLUDED.alt""",
            (mid, item_id, role, position, seed, width, height, alt),
        )
    return mid


def upsert_credit(conn, work_id, position, role, name, talent_id):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO credits (id, item_id, position, role, name, talent_item_id)
               VALUES (%s,%s,%s,%s,%s,%s)
               ON CONFLICT DO NOTHING""",
            (uuid.uuid5(uuid.NAMESPACE_URL, f"cirrus-credit:{work_id.hex}:{position}"),
             work_id, position, role, name, talent_id),
        )


def seed_work_media(conn, house, iid, title, slug, variant, ordinal):
    w, h = SIZES[variant]
    upsert_media(conn, iid, "poster", 0, f"{house}:{slug}:poster", w, h,
                 f"Poster still for the film {title}")
    upsert_media(conn, iid, "reel", 0, f"{house}:{slug}:reel", w, h,
                 f"Reel of the film {title}")
    upsert_media(conn, iid, "gallery", 1, f"{house}:{slug}:g1", w, h,
                 f"Still from {title}")
    upsert_media(conn, iid, "gallery", 2, f"{house}:{slug}:g2", w, h,
                 f"Second still from {title}")


def run_seed(conn):
    for h in HOUSES:
        upsert_house(conn, h)
    upsert_account(conn, ACC_PRODUCER, "producer@example.com", "producer", HOUSE_CIRRUS)
    upsert_account(conn, ACC_PRODUCER_MERIDIAN, "producer.meridian@example.com", "producer", HOUSE_MERIDIAN)
    upsert_account(conn, ACC_VIEWER, "viewer@example.com", "viewer", None)

    ids = {}
    for pos, (title, slug, variant) in enumerate(CIRRUS_WORKS, start=1):
        iid = upsert_item(conn, HOUSE_CIRRUS, "work", slug, title, pos, None, variant, True)
        seed_work_media(conn, "cirrus", iid, title, slug, variant, pos)
        ids[slug] = iid
    for pos, (title, slug, variant) in enumerate(CIRRUS_UNLISTED_WORKS, start=len(CIRRUS_WORKS) + 1):
        iid = upsert_item(conn, HOUSE_CIRRUS, "work", slug, title, pos, None, variant, False)
        w, h = SIZES[variant]
        upsert_media(conn, iid, "poster", 0, f"cirrus:{slug}:poster", w, h,
                     f"Poster still for the film {title}")
        ids[slug] = iid
    for pos, (title, slug, variant) in enumerate(MERIDIAN_WORKS, start=1):
        iid = upsert_item(conn, HOUSE_MERIDIAN, "work", slug, title, pos, None, variant, True)
        seed_work_media(conn, "meridian", iid, title, slug, variant, pos)
        ids[slug] = iid

    talent_ids = {}
    for pos, (title, slug, disc) in enumerate(CIRRUS_TALENTS, start=1):
        iid = upsert_item(conn, HOUSE_CIRRUS, "talent", slug, title, pos, disc, None, True)
        w, h = TALENT_PORTRAIT
        upsert_media(conn, iid, "poster", 0, f"cirrus:{slug}:portrait", w, h,
                     f"Portrait of {title}, {disc}")
        upsert_media(conn, iid, "reel", 0, f"cirrus:{slug}:reel", w, h,
                     f"Reel of {title}")
        talent_ids[slug] = iid
    for pos, (title, slug, disc) in enumerate(CIRRUS_UNLISTED_TALENTS, start=len(CIRRUS_TALENTS) + 1):
        iid = upsert_item(conn, HOUSE_CIRRUS, "talent", slug, title, pos, disc, None, False)
        w, h = TALENT_PORTRAIT
        upsert_media(conn, iid, "poster", 0, f"cirrus:{slug}:portrait", w, h,
                     f"Portrait of {title}, {disc}")
        talent_ids[slug] = iid
    for pos, (title, slug, disc) in enumerate(MERIDIAN_TALENTS, start=1):
        iid = upsert_item(conn, HOUSE_MERIDIAN, "talent", slug, title, pos, disc, None, True)
        w, h = TALENT_PORTRAIT
        upsert_media(conn, iid, "poster", 0, f"meridian:{slug}:portrait", w, h,
                     f"Portrait of {title}, {disc}")
        talent_ids[slug] = iid

    for work_slug, role, name, talent_slug in CIRRUS_CREDITS:
        upsert_credit(conn, ids[work_slug], 1, role, name, talent_ids[talent_slug])

    conn.commit()
