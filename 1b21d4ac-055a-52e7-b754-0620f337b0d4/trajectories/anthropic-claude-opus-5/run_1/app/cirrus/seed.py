"""Idempotent seed. Restarting the app must not duplicate rows."""
import hashlib
from datetime import datetime, timezone

from . import auth, db
from .models import VARIANT_GEOMETRY

DEMO_PASSWORD = "deku-demo-pw-2026"

HOUSES = [
    {
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
        "slug": "meridian",
        "name": "Meridian",
        "tagline_upper": "FOR PICTURE",
        "tagline_lower": "AND ITS MAKERS",
        "street": "4 RUE DU FAUBOURG",
        "city": "PARIS",
        "district": "10",
        "contact_email": "prod.meridian@example.com",
    },
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

CREDITS = [
    ("the-halo", "Director", "Rives", "rives"),
    ("the-halo", "Photography", "Camille Ferrand", "camille-ferrand"),
    ("the-halo", "Production", "Aube Studio", None),
    ("sonder", "Director", "Halcyon", "halcyon"),
    ("sonder", "Post", "Atelier Nord", None),
    ("loris", "Photographer", "Camille Ferrand", "camille-ferrand"),
    ("loris", "Styling", "Juno Ferre", None),
    ("the-quiet-room", "Director", "Rives", "rives"),
]

GALLERY_VARIANTS = ["left", "right", "centre", "right", "left"]


def _stable_media_id(namespace: str) -> str:
    """A deterministic 32 character lowercase hex id keeps the seed idempotent."""
    return hashlib.sha256(("cirrus-seed:" + namespace).encode("utf-8")).hexdigest()[:32]


def _seed_value(namespace: str) -> str:
    return hashlib.sha256(("seed:" + namespace).encode("utf-8")).hexdigest()[:16]


def _upsert_house(cur, house):
    cur.execute("SELECT id FROM houses WHERE slug = %s", (house["slug"],))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "INSERT INTO houses (slug, name, tagline_upper, tagline_lower, street, city, "
        "district, contact_email) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
        (
            house["slug"],
            house["name"],
            house["tagline_upper"],
            house["tagline_lower"],
            house["street"],
            house["city"],
            house["district"],
            house["contact_email"],
        ),
    )
    return cur.fetchone()[0]


def _upsert_account(cur, email, role, house_id):
    cur.execute("SELECT id FROM accounts WHERE email = %s", (email,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "INSERT INTO accounts (email, password_hash, role, house_id) "
        "VALUES (%s, %s, %s, %s) RETURNING id",
        (email, auth.hash_password(DEMO_PASSWORD), role, house_id),
    )
    return cur.fetchone()[0]


def _upsert_item(cur, house_id, kind, slug, title, position, discipline, variant, published):
    cur.execute(
        "SELECT id FROM items WHERE house_id = %s AND kind = %s AND lower(slug) = %s",
        (house_id, kind, slug),
    )
    row = cur.fetchone()
    if row:
        return row[0]
    stamped = datetime.now(timezone.utc) if published else None
    cur.execute(
        "INSERT INTO items (house_id, kind, slug, title, position, discipline, variant, "
        "published, published_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
        (house_id, kind, slug, title, position, discipline, variant, published, stamped),
    )
    return cur.fetchone()[0]


def _upsert_media(cur, media_id, item_id, role, position, seed, width, height, alt):
    cur.execute("SELECT id FROM media WHERE id = %s", (media_id,))
    if cur.fetchone():
        return media_id
    cur.execute(
        "INSERT INTO media (id, item_id, role, position, seed, width, height, alt) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        (media_id, item_id, role, position, seed, width, height, alt),
    )
    return media_id


def _upsert_credit(cur, item_id, position, role, name, talent_item_id):
    cur.execute(
        "SELECT id FROM credits WHERE item_id = %s AND role = %s AND name = %s",
        (item_id, role, name),
    )
    if cur.fetchone():
        return
    cur.execute(
        "INSERT INTO credits (item_id, position, role, name, talent_item_id) "
        "VALUES (%s, %s, %s, %s, %s)",
        (item_id, position, role, name, talent_item_id),
    )


def _work_media(cur, house_slug, slug, title, variant, ordinal, published):
    cur.execute(
        "SELECT id FROM items WHERE kind = 'work' AND lower(slug) = %s "
        "AND house_id = (SELECT id FROM houses WHERE slug = %s)",
        (slug, house_slug),
    )
    item_id = cur.fetchone()[0]
    w, h = VARIANT_GEOMETRY[variant]
    _upsert_media(
        cur,
        _stable_media_id("%s:work:%s:poster" % (house_slug, slug)),
        item_id,
        "poster",
        1,
        _seed_value("%s:%s:poster" % (house_slug, slug)),
        w,
        h,
        "%s, work %03d" % (title, ordinal),
    )
    if published:
        _upsert_media(
            cur,
            _stable_media_id("%s:work:%s:reel" % (house_slug, slug)),
            item_id,
            "reel",
            1,
            _seed_value("%s:%s:reel" % (house_slug, slug)),
            1440,
            810,
            "Showreel for %s" % title,
        )
        for i, gvariant in enumerate(GALLERY_VARIANTS, start=1):
            gw, gh = VARIANT_GEOMETRY[gvariant]
            _upsert_media(
                cur,
                _stable_media_id("%s:work:%s:gallery:%d" % (house_slug, slug, i)),
                item_id,
                "gallery",
                i,
                _seed_value("%s:%s:gallery:%d" % (house_slug, slug, i)),
                gw,
                gh,
                "%s, still %d" % (title, i),
            )
    return item_id


def _talent_media(cur, house_slug, slug, name, discipline, published):
    cur.execute(
        "SELECT id FROM items WHERE kind = 'talent' AND lower(slug) = %s "
        "AND house_id = (SELECT id FROM houses WHERE slug = %s)",
        (slug, house_slug),
    )
    item_id = cur.fetchone()[0]
    _upsert_media(
        cur,
        _stable_media_id("%s:talent:%s:poster" % (house_slug, slug)),
        item_id,
        "poster",
        1,
        _seed_value("%s:%s:portrait" % (house_slug, slug)),
        246,
        330,
        "%s, %s" % (name, discipline),
    )
    if published:
        _upsert_media(
            cur,
            _stable_media_id("%s:talent:%s:reel" % (house_slug, slug)),
            item_id,
            "reel",
            1,
            _seed_value("%s:%s:reel" % (house_slug, slug)),
            1440,
            810,
            "Showreel for %s" % name,
        )
    return item_id


def run():
    """Seed once, idempotently, inside one transaction with an advisory lock."""
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(%s)", (823_114_907,))

            house_ids = {}
            for house in HOUSES:
                house_ids[house["slug"]] = _upsert_house(cur, house)

            for email, role, house_slug in ACCOUNTS:
                _upsert_account(cur, email, role, house_ids.get(house_slug) if house_slug else None)

            for position, (title, slug, variant, published) in enumerate(CIRRUS_WORKS, start=1):
                _upsert_item(
                    cur, house_ids["cirrus"], "work", slug, title, position, None, variant, published
                )
            for position, (name, slug, discipline, published) in enumerate(CIRRUS_TALENTS, start=1):
                _upsert_item(
                    cur, house_ids["cirrus"], "talent", slug, name, position, discipline, None, published
                )
            for position, (title, slug, variant, published) in enumerate(MERIDIAN_WORKS, start=1):
                _upsert_item(
                    cur, house_ids["meridian"], "work", slug, title, position, None, variant, published
                )
            for position, (name, slug, discipline, published) in enumerate(MERIDIAN_TALENTS, start=1):
                _upsert_item(
                    cur, house_ids["meridian"], "talent", slug, name, position, discipline, None, published
                )

            ordinal = 0
            for title, slug, variant, published in CIRRUS_WORKS:
                if published:
                    ordinal += 1
                _work_media(cur, "cirrus", slug, title, variant, ordinal or 1, published)
            for name, slug, discipline, published in CIRRUS_TALENTS:
                _talent_media(cur, "cirrus", slug, name, discipline, published)
            for title, slug, variant, published in MERIDIAN_WORKS:
                _work_media(cur, "meridian", slug, title, variant, 1, published)
            for name, slug, discipline, published in MERIDIAN_TALENTS:
                _talent_media(cur, "meridian", slug, name, discipline, published)

            for position, (work_slug, role, name, talent_slug) in enumerate(CREDITS, start=1):
                cur.execute(
                    "SELECT id FROM items WHERE kind = 'work' AND lower(slug) = %s "
                    "AND house_id = %s",
                    (work_slug, house_ids["cirrus"]),
                )
                work_id = cur.fetchone()[0]
                talent_id = None
                if talent_slug:
                    cur.execute(
                        "SELECT id FROM items WHERE kind = 'talent' AND lower(slug) = %s "
                        "AND house_id = %s",
                        (talent_slug, house_ids["cirrus"]),
                    )
                    talent_id = cur.fetchone()[0]
                _upsert_credit(cur, work_id, position, role, name, talent_id)

            cur.execute(
                "SELECT id FROM items WHERE kind = 'work' AND lower(slug) = 'foundry' "
                "AND house_id = %s",
                (house_ids["meridian"],),
            )
            foundry_id = cur.fetchone()[0]
            cur.execute(
                "SELECT id FROM items WHERE kind = 'talent' AND lower(slug) = 'sable-ito' "
                "AND house_id = %s",
                (house_ids["meridian"],),
            )
            sable_id = cur.fetchone()[0]
            _upsert_credit(cur, foundry_id, 1, "Director", "Sable Ito", sable_id)
