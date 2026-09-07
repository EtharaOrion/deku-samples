"""Idempotent seed. Restarting the app must not duplicate rows."""
import hashlib

from . import db
from .auth import hash_password

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
        street="4 RUE DE LA FORGE",
        city="LYON",
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
    ("Rives", "rives", "director", True),
    ("Halcyon", "halcyon", "director", True),
    ("Camille Ferrand", "camille-ferrand", "photographer", True),
    ("Noor Vasquez", "noor-vasquez", "stylist", False),
]

# Credits: (work slug, role, name, talent slug or None)
CIRRUS_CREDITS = [
    ("the-halo", [("Director", "Rives", "rives"),
                  ("Producer", "Elise Marchand", None),
                  ("Client", "Atelier Nord", None)]),
    ("sonder", [("Director", "Halcyon", "halcyon"),
                ("Producer", "Elise Marchand", None)]),
    ("loris", [("Photographer", "Camille Ferrand", "camille-ferrand"),
               ("Stylist", "Noor Vasquez", "noor-vasquez"),
               ("Client", "Loris Paris", None)]),
    ("binary", [("Director", "Rives", "rives"), ("Client", "Studio Binaire", None)]),
    ("common-ground", [("Director", "Halcyon", "halcyon")]),
    ("nve", [("Photographer", "Camille Ferrand", "camille-ferrand")]),
    ("the-absolute-shelter", [("Director", "Rives", "rives")]),
    ("maison-de-lumiere", [("Director", "Halcyon", "halcyon"),
                           ("Client", "Maison de Lumiere", None)]),
    ("mdl-serie-extreme", [("Photographer", "Camille Ferrand", "camille-ferrand")]),
    ("ak", [("Director", "Rives", "rives")]),
    ("loris-shoot-studio", [("Photographer", "Camille Ferrand", "camille-ferrand")]),
    ("the-radiant", [("Director", "Halcyon", "halcyon")]),
    ("the-quiet-room", [("Director", "Rives", "rives")]),
]

VARIANT_SIZE = {
    "left": (598, 320),      # ~1.87
    "right": (300, 300),     # ~1.0
    "centre": (1006, 617),   # ~1.63
}


def media_id_for(*parts) -> str:
    """A stable 32-char lowercase hex id, so re-seeding cannot duplicate a row."""
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()[:32]


def _seed_for(*parts) -> str:
    return hashlib.sha256("seed|".join(str(p) for p in parts).encode()).hexdigest()[:16]


def _upsert_house(cur, h):
    cur.execute(
        """INSERT INTO houses (slug, name, tagline_upper, tagline_lower, street, city,
                               district, contact_email)
           VALUES (%(slug)s, %(name)s, %(tagline_upper)s, %(tagline_lower)s, %(street)s,
                   %(city)s, %(district)s, %(contact_email)s)
           ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
           RETURNING id""",
        h,
    )
    return cur.fetchone()["id"]


def _upsert_item(cur, house_id, kind, slug, title, position, discipline, variant, published):
    cur.execute(
        """INSERT INTO items (house_id, kind, slug, title, position, discipline, variant,
                              published, published_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                   CASE WHEN %s THEN now() ELSE NULL END)
           ON CONFLICT (house_id, kind, lower(slug)) DO NOTHING
           RETURNING id""",
        (house_id, kind, slug, title, position, discipline, variant, published, published),
    )
    row = cur.fetchone()
    if row:
        return row["id"]
    cur.execute(
        "SELECT id FROM items WHERE house_id = %s AND kind = %s AND lower(slug) = lower(%s)",
        (house_id, kind, slug),
    )
    return cur.fetchone()["id"]


def _upsert_media(cur, mid, item_id, role, position, seed, width, height, alt):
    cur.execute(
        """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (id) DO NOTHING""",
        (mid, item_id, role, position, seed, width, height, alt),
    )


def _upsert_credit(cur, item_id, position, role, name, talent_item_id):
    cur.execute(
        "SELECT id FROM credits WHERE item_id = %s AND position = %s",
        (item_id, position),
    )
    if cur.fetchone():
        return
    cur.execute(
        "INSERT INTO credits (item_id, position, role, name, talent_item_id) "
        "VALUES (%s, %s, %s, %s, %s)",
        (item_id, position, role, name, talent_item_id),
    )


def run():
    with db.write() as cur:
        # One seeder at a time, so two workers starting together cannot race.
        cur.execute("SELECT pg_advisory_xact_lock(5150912)")

        house_ids = {h["slug"]: _upsert_house(cur, h) for h in HOUSES}
        pw_hash = None
        for email, role, house_slug in ACCOUNTS:
            cur.execute("SELECT id FROM accounts WHERE email = %s", (email,))
            if cur.fetchone():
                continue
            if pw_hash is None:
                pw_hash = hash_password(SEED_PASSWORD)
            cur.execute(
                "INSERT INTO accounts (email, password_hash, role, house_id) "
                "VALUES (%s, %s, %s, %s)",
                (email, pw_hash, role, house_ids.get(house_slug) if house_slug else None),
            )

        cirrus = house_ids["cirrus"]
        meridian = house_ids["meridian"]
        work_ids, talent_ids = {}, {}

        for idx, (title, slug, variant) in enumerate(CIRRUS_WORKS):
            w, h = VARIANT_SIZE[variant]
            iid = _upsert_item(cur, cirrus, "work", slug, title, idx, None, variant, True)
            work_ids[slug] = iid
            _upsert_media(cur, media_id_for("cirrus", slug, "poster"), iid, "poster", 0,
                          _seed_for(slug, "poster"), w, h,
                          f"{title}, still from the film")
            _upsert_media(cur, media_id_for("cirrus", slug, "reel"), iid, "reel", 0,
                          _seed_for(slug, "reel"), 1440, 810,
                          f"{title}, showreel")
            for gi in range(2):
                gv = ["left", "right", "centre"][(idx + gi) % 3]
                gw, gh = VARIANT_SIZE[gv]
                _upsert_media(cur, media_id_for("cirrus", slug, "gallery", gi), iid,
                              "gallery", gi, _seed_for(slug, "gallery", gi), gw, gh,
                              f"{title}, still {gi + 1}")

        # The unlisted work, position after the published twelve.
        qw, qh = VARIANT_SIZE["left"]
        quiet = _upsert_item(cur, cirrus, "work", "the-quiet-room", "The Quiet Room",
                             len(CIRRUS_WORKS), None, "left", False)
        work_ids["the-quiet-room"] = quiet
        _upsert_media(cur, media_id_for("cirrus", "the-quiet-room", "poster"), quiet,
                      "poster", 0, _seed_for("the-quiet-room", "poster"), qw, qh,
                      "The Quiet Room, still from the film")

        for idx, (title, slug, discipline, published) in enumerate(CIRRUS_TALENTS):
            iid = _upsert_item(cur, cirrus, "talent", slug, title, idx, discipline,
                               None, published)
            talent_ids[slug] = iid
            _upsert_media(cur, media_id_for("cirrus", slug, "poster"), iid, "poster", 0,
                          _seed_for(slug, "poster"), 246, 320,
                          f"{title}, {discipline}, portrait")
            if published:
                _upsert_media(cur, media_id_for("cirrus", slug, "reel"), iid, "reel", 0,
                              _seed_for(slug, "reel"), 1440, 810, f"{title}, showreel")

        for work_slug, credits in CIRRUS_CREDITS:
            wid = work_ids.get(work_slug)
            if not wid:
                continue
            for pos, (role, name, talent_slug) in enumerate(credits):
                _upsert_credit(cur, wid, pos, role, name, talent_ids.get(talent_slug))

        # Meridian: a private house with no public surface on this deployment.
        mw, mh = VARIANT_SIZE["left"]
        m_work = _upsert_item(cur, meridian, "work", "foundry", "Foundry", 0, None,
                              "left", True)
        _upsert_media(cur, media_id_for("meridian", "foundry", "poster"), m_work,
                      "poster", 0, _seed_for("foundry", "poster"), mw, mh,
                      "Foundry, still from the film")
        _upsert_media(cur, media_id_for("meridian", "foundry", "reel"), m_work, "reel", 0,
                      _seed_for("foundry", "reel"), 1440, 810, "Foundry, showreel")
        m_talent = _upsert_item(cur, meridian, "talent", "sable-ito", "Sable Ito", 0,
                                "director", None, True)
        _upsert_media(cur, media_id_for("meridian", "sable-ito", "poster"), m_talent,
                      "poster", 0, _seed_for("sable-ito", "poster"), 246, 320,
                      "Sable Ito, director, portrait")
        _upsert_credit(cur, m_work, 0, "Director", "Sable Ito", m_talent)
