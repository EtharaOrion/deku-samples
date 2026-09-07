"""Idempotent seed. Restarting the app must not duplicate rows."""
import secrets

from . import db
from .security import hash_password

SEED_PASSWORD = "deku-demo-pw-2026"

HOUSES = [
    dict(slug="cirrus", name="Cirrus", tagline_upper="FOR PICTURE",
         tagline_lower="AND ITS MAKERS", street="9 PASSAGE BELLEVUE", city="PARIS",
         district="11", contact_email="prod@example.com"),
    dict(slug="meridian", name="Meridian", tagline_upper="FOR PICTURE",
         tagline_lower="AND ITS MAKERS", street="4 RUE DES ORMES", city="LYON",
         district="02", contact_email="prod.meridian@example.com"),
]

ACCOUNTS = [
    ("producer@example.com", "producer", "cirrus"),
    ("producer.meridian@example.com", "producer", "meridian"),
    ("viewer@example.com", "viewer", None),
]

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

CIRRUS_TALENTS = [
    ("Rives", "rives", "director"),
    ("Halcyon", "halcyon", "director"),
    ("Camille Ferrand", "camille-ferrand", "photographer"),
]

# variant -> (width, height) intrinsic size a container reserves
VARIANT_SIZE = {"left": (598, 320), "right": (300, 300), "centre": (1006, 617)}

GALLERY_PLAN = ["centre", "left", "right", "left"]


def _stable_seed(*parts):
    """A deterministic seed from the record's own identity, so a reseed is stable."""
    h = 2166136261
    for p in parts:
        for ch in str(p):
            h ^= ord(ch)
            h = (h * 16777619) & 0xFFFFFFFF
    return h % 100000


def _media_id(*parts):
    """Deterministic 32-char lowercase hex id derived from the row's identity.

    Deterministic so reseeding is idempotent; unguessable because the address is a
    keyed digest over values a visitor never sees, not a counter.
    """
    import hashlib
    return hashlib.sha256(("cirrus-media|" + "|".join(str(p) for p in parts)).encode()).hexdigest()[:32]


def _ensure_media(cur, item_id, role, position, seed, width, height, alt):
    mid = _media_id(item_id, role, position)
    cur.execute(
        """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT (id) DO UPDATE SET
             seed=EXCLUDED.seed, width=EXCLUDED.width,
             height=EXCLUDED.height, alt=EXCLUDED.alt""",
        (mid, item_id, role, position, seed, width, height, alt),
    )
    return mid


def _ensure_item(cur, house_id, kind, slug, title, position, discipline, variant, published):
    cur.execute(
        """INSERT INTO items (house_id, kind, slug, title, position, discipline, variant,
                              published, published_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s, CASE WHEN %s THEN now() ELSE NULL END)
           ON CONFLICT (house_id, kind, lower(slug)) DO UPDATE SET
             title=EXCLUDED.title, position=EXCLUDED.position,
             discipline=EXCLUDED.discipline, variant=EXCLUDED.variant
           RETURNING id""",
        (house_id, kind, slug, title, position, discipline, variant, published, published),
    )
    return cur.fetchone()["id"]


def _work_media(cur, item_id, title, ordinal_hint, variant):
    w, h = VARIANT_SIZE[variant]
    _ensure_media(cur, item_id, "poster", 0, _stable_seed(title, "poster"), w, h,
                  f"{title}, still {ordinal_hint}")
    _ensure_media(cur, item_id, "reel", 0, _stable_seed(title, "reel"), 1440, 810,
                  f"{title}, showreel")
    for i, gv in enumerate(GALLERY_PLAN):
        gw, gh = VARIANT_SIZE[gv]
        _ensure_media(cur, item_id, "gallery", i, _stable_seed(title, "gallery", i), gw, gh,
                      f"{title}, still {i + 2}")


def run_seed():
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_lock(778812)")
            try:
                _seed(cur)
            finally:
                cur.execute("SELECT pg_advisory_unlock(778812)")


def _seed(cur):
    house_ids = {}
    for h in HOUSES:
        cur.execute(
            """INSERT INTO houses (slug, name, tagline_upper, tagline_lower, street, city,
                                   district, contact_email)
               VALUES (%(slug)s,%(name)s,%(tagline_upper)s,%(tagline_lower)s,%(street)s,
                       %(city)s,%(district)s,%(contact_email)s)
               ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name,
                 tagline_upper=EXCLUDED.tagline_upper, tagline_lower=EXCLUDED.tagline_lower,
                 street=EXCLUDED.street, city=EXCLUDED.city, district=EXCLUDED.district,
                 contact_email=EXCLUDED.contact_email
               RETURNING id""", h)
        house_ids[h["slug"]] = cur.fetchone()["id"]

    pw = hash_password(SEED_PASSWORD)
    for email, role, house_slug in ACCOUNTS:
        cur.execute(
            """INSERT INTO accounts (email, password_hash, role, house_id)
               VALUES (%s,%s,%s,%s)
               ON CONFLICT (email) DO UPDATE SET role=EXCLUDED.role,
                 house_id=EXCLUDED.house_id
               RETURNING id""",
            (email, pw, role, house_ids.get(house_slug) if house_slug else None))
        cur.fetchone()

    cirrus = house_ids["cirrus"]
    meridian = house_ids["meridian"]

    work_ids = {}
    for i, (title, slug, variant) in enumerate(CIRRUS_WORKS):
        iid = _ensure_item(cur, cirrus, "work", slug, title, i, None, variant, True)
        work_ids[slug] = iid
        _work_media(cur, iid, title, i + 1, variant)

    quiet = _ensure_item(cur, cirrus, "work", "the-quiet-room", "The Quiet Room",
                         len(CIRRUS_WORKS), None, "left", False)
    work_ids["the-quiet-room"] = quiet
    w, h = VARIANT_SIZE["left"]
    _ensure_media(cur, quiet, "poster", 0, _stable_seed("The Quiet Room", "poster"), w, h,
                  "The Quiet Room, still")

    talent_ids = {}
    for i, (name, slug, discipline) in enumerate(CIRRUS_TALENTS):
        iid = _ensure_item(cur, cirrus, "talent", slug, name, i, discipline, None, True)
        talent_ids[slug] = iid
        _ensure_media(cur, iid, "poster", 0, _stable_seed(name, "portrait"), 246, 328,
                      f"{name}, {discipline}")
        _ensure_media(cur, iid, "reel", 0, _stable_seed(name, "reel"), 1440, 810,
                      f"{name}, showreel")

    noor = _ensure_item(cur, cirrus, "talent", "noor-vasquez", "Noor Vasquez",
                        len(CIRRUS_TALENTS), "stylist", None, False)
    talent_ids["noor-vasquez"] = noor
    _ensure_media(cur, noor, "poster", 0, _stable_seed("Noor Vasquez", "portrait"), 246, 328,
                  "Noor Vasquez, stylist")

    for slug, name, disc in [("sable-ito", "Sable Ito", "director")]:
        mid_t = _ensure_item(cur, meridian, "talent", slug, name, 0, disc, None, True)
        _ensure_media(cur, mid_t, "poster", 0, _stable_seed(name, "portrait"), 246, 328,
                      f"{name}, {disc}")
    mid_w = _ensure_item(cur, meridian, "work", "foundry", "Foundry", 0, None, "left", True)
    _work_media(cur, mid_w, "Foundry", 1, "left")

    credits = [
        (work_ids["the-halo"], 0, "Director", "Rives", talent_ids["rives"]),
        (work_ids["the-halo"], 1, "Producer", "Ines Marchand", None),
        (work_ids["sonder"], 0, "Director", "Halcyon", talent_ids["halcyon"]),
        (work_ids["sonder"], 1, "Editor", "Theo Blanc", None),
        (work_ids["loris"], 0, "Photographer", "Camille Ferrand", talent_ids["camille-ferrand"]),
        (work_ids["loris"], 1, "Producer", "Ines Marchand", None),
    ]
    for item_id, pos, role, name, talent_item_id in credits:
        cur.execute(
            """INSERT INTO credits (item_id, position, role, name, talent_item_id)
               SELECT %s,%s,%s,%s,%s
               WHERE NOT EXISTS (
                 SELECT 1 FROM credits WHERE item_id=%s AND position=%s AND role=%s AND name=%s)""",
            (item_id, pos, role, name, talent_item_id, item_id, pos, role, name))
