"""Schema migration and idempotent seed."""
import hashlib
import secrets
from datetime import datetime, timezone

from . import db
from .config import Config

SCHEMA_PATH = __file__.replace("seed.py", "") + "../migrations/schema.sql"

WORK_VARIANTS = {
    "the-halo": "left", "sonder": "right", "binary": "centre", "common-ground": "left",
    "nve": "right", "the-absolute-shelter": "centre", "maison-de-lumiere": "left",
    "loris": "right", "mdl-serie-extreme": "centre", "ak": "left",
    "loris-shoot-studio": "right", "the-radiant": "centre", "the-quiet-room": "left",
}
WORK_TITLES = {
    "the-halo": "The Halo", "sonder": "Sonder", "binary": "BINARY",
    "common-ground": "Common Ground", "nve": "NVE",
    "the-absolute-shelter": "The Absolute Shelter", "maison-de-lumiere": "MAISON DE LUMIERE",
    "loris": "LORIS", "mdl-serie-extreme": "MDL Serie Extreme", "ak": "AK",
    "loris-shoot-studio": "Loris Shoot Studio", "the-radiant": "The Radiant",
    "the-quiet-room": "The Quiet Room",
}
# (slug, title, published, discipline)
WORKS = [
    ("the-halo", "The Halo", True, None),
    ("sonder", "Sonder", True, None),
    ("binary", "BINARY", True, None),
    ("common-ground", "Common Ground", True, None),
    ("nve", "NVE", True, None),
    ("the-absolute-shelter", "The Absolute Shelter", True, None),
    ("maison-de-lumiere", "MAISON DE LUMIERE", True, None),
    ("loris", "LORIS", True, None),
    ("mdl-serie-extreme", "MDL Serie Extreme", True, None),
    ("ak", "AK", True, None),
    ("loris-shoot-studio", "Loris Shoot Studio", True, None),
    ("the-radiant", "The Radiant", True, None),
    ("the-quiet-room", "The Quiet Room", False, None),
]
TALENTS = [
    ("rives", "Rives", True, "director"),
    ("halcyon", "Halcyon", True, "director"),
    ("camille-ferrand", "Camille Ferrand", True, "photographer"),
    ("noor-vasquez", "Noor Vasquez", False, "stylist"),
]
CREDITS = [
    ("the-halo", "Director", "Rives", "rives"),
    ("sonder", "Director", "Halcyon", "halcyon"),
    ("loris", "Photographer", "Camille Ferrand", "camille-ferrand"),
]
VARIANT_SIZE = {"left": (598, 320), "right": (300, 300), "centre": (1006, 617)}
DEMO_PASSWORD = "deku-demo-pw-2026"


def mid(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(12)}"


def sid(*parts) -> str:
    """Deterministic short id from parts, e.g. seed rows."""
    h = hashlib.sha1(":".join(parts).encode()).hexdigest()
    return h[:20]


def hex32(*parts) -> str:
    return hashlib.sha1(":".join(parts).encode()).hexdigest()[:32]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def _now():
    return datetime.now(timezone.utc)


def seed_password_hash() -> str:
    from .auth import hash_password
    return hash_password(DEMO_PASSWORD)


def seed_media_for(kind, slug, variant):
    """Poster for every record; published works also carry a reel and gallery."""
    w, h = VARIANT_SIZE.get(variant or "left", (598, 320))
    rows = [{
        "id": hex32("media", kind, slug, "poster"),
        "role": "poster",
        "position": 0,
        "seed": int(hashlib.sha1(f"{slug}:poster".encode()).hexdigest()[:12], 16),
        "width": w,
        "height": h,
        "alt": f"Still from {WORK_TITLES.get(slug, slug.replace('-', ' ').title())}"
               if kind == "work" else f"Portrait of {slug.replace('-', ' ').title()}",
    }]
    if kind == "work":
        rows.append({
            "id": hex32("media", kind, slug, "reel"),
            "role": "reel", "position": 1,
            "seed": int(hashlib.sha1(f"{slug}:reel".encode()).hexdigest()[:12], 16),
            "width": 1280, "height": 720,
            "alt": f"Reel of {WORK_TITLES.get(slug, slug)}",
        })
        for i in range(4):
            rows.append({
                "id": hex32("media", kind, slug, "gallery", str(i)),
                "role": "gallery", "position": 2 + i,
                "seed": int(hashlib.sha1(f"{slug}:gallery:{i}".encode()).hexdigest()[:12], 16),
                "width": w, "height": h,
                "alt": f"{WORK_TITLES.get(slug, slug)}, frame {i + 1}",
            })
    else:
        rows[0]["width"], rows[0]["height"] = 246, 320
        rows.append({
            "id": hex32("media", kind, slug, "reel"), "role": "reel", "position": 1,
            "seed": int(hashlib.sha1(f"{slug}:talentreel".encode()).hexdigest()[:12], 16),
            "width": 1280, "height": 720,
            "alt": f"Reel of {slug.replace('-', ' ').title()}",
        })
    return rows


def _one_id(cur, sql, params):
    cur.execute(sql, params)
    row = cur.fetchone()
    if row is None:
        return None
    return row["id"] if isinstance(row, dict) else row[0]


def run():
    schema_sql = open(SCHEMA_PATH).read()
    with db.transaction() as cur:
        # one worker at a time migrates and seeds; the lock frees with the commit
        cur.execute("SELECT pg_advisory_xact_lock(%s)", (918273645,))
        cur.execute(schema_sql)
        houses = [
            ("house_cirrus", "cirrus", "Cirrus", "FOR PICTURE", "AND ITS MAKERS",
             "9 Passage Bellevue", "Paris", "11", "prod@example.com"),
            ("house_meridian", "meridian", "Meridian", "FOR PICTURE", "AND ITS MAKERS",
             "4 Rue Oberkampf", "Paris", "11", "prod.meridian@example.com"),
        ]
        for h in houses:
            cur.execute(
                """INSERT INTO houses (id, slug, name, tagline_upper, tagline_lower, street, city, district, contact_email)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""", h)

        pw = seed_password_hash()
        accounts = [
            ("acc_producer_cirrus", "producer@example.com", "producer", "house_cirrus"),
            ("acc_producer_meridian", "producer.meridian@example.com", "producer", "house_meridian"),
            ("acc_viewer", "viewer@example.com", "viewer", None),
        ]
        for a in accounts:
            cur.execute(
                """INSERT INTO accounts (id, email, password_hash, role, house_id)
                   VALUES (%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
                (a[0], a[1], pw, a[2], a[3]))

        house = "house_cirrus"
        pos = 0
        for slug, title, published, discipline in WORKS:
            item_id = sid("item", house, "work", slug)
            cur.execute(
                """INSERT INTO items (id, house_id, kind, slug, title, position, discipline, variant, published, published_at)
                   VALUES (%s,%s,'work',%s,%s,%s,NULL,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
                (item_id, house, slug, title, pos, WORK_VARIANTS[slug], published,
                 _now() if published else None))
            if cur.rowcount:
                for m in seed_media_for("work", slug, WORK_VARIANTS[slug]):
                    cur.execute(
                        """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
                        (m["id"], item_id, m["role"], m["position"], m["seed"], m["width"], m["height"], m["alt"]))
            pos += 1
        pos = 0
        for slug, title, published, discipline in TALENTS:
            item_id = sid("item", house, "talent", slug)
            cur.execute(
                """INSERT INTO items (id, house_id, kind, slug, title, position, discipline, variant, published, published_at)
                   VALUES (%s,%s,'talent',%s,%s,%s,%s,'left',%s,%s) ON CONFLICT (id) DO NOTHING""",
                (item_id, house, slug, title, pos, discipline, published,
                 _now() if published else None))
            if cur.rowcount:
                for m in seed_media_for("talent", slug, None):
                    cur.execute(
                        """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
                        (m["id"], item_id, m["role"], m["position"], m["seed"], m["width"], m["height"], m["alt"]))
            pos += 1
        for work_slug, role, name, talent_slug in CREDITS:
            work_id = _one_id(cur, "SELECT id FROM items WHERE house_id=%s AND kind='work' AND slug=%s",
                              (house, work_slug))
            talent_id = _one_id(cur, "SELECT id FROM items WHERE house_id=%s AND kind='talent' AND slug=%s",
                                (house, talent_slug))
            cur.execute(
                """INSERT INTO credits (id, item_id, position, role, name, talent_item_id)
                   VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
                (sid("credit", work_slug, talent_slug), work_id, 0, role, name, talent_id))

        # meridian rows
        cur.execute(
            """INSERT INTO items (id, house_id, kind, slug, title, position, discipline, variant, published, published_at)
               VALUES (%s,%s,'talent',%s,%s,0,%s,'left',%s,%s) ON CONFLICT (id) DO NOTHING""",
            (sid("item", "house_meridian", "talent", "sable-ito"), "house_meridian",
             "sable-ito", "Sable Ito", "director", True, _now()))
        cur.execute(
            """INSERT INTO items (id, house_id, kind, slug, title, position, discipline, variant, published, published_at)
               VALUES (%s,%s,'work',%s,%s,0,NULL,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
            (sid("item", "house_meridian", "work", "foundry"), "house_meridian",
             "foundry", "Foundry", "left", True, _now()))
        for kind, slug, variant in [("talent", "sable-ito", "left"), ("work", "foundry", "left")]:
            item_id = _one_id(cur, "SELECT id FROM items WHERE house_id=%s AND kind=%s AND slug=%s",
                              ("house_meridian", kind, slug))
            if item_id:
                for m in seed_media_for(kind, slug, variant):
                    cur.execute(
                        """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
                        (m["id"], item_id, m["role"], m["position"], m["seed"], m["width"], m["height"], m["alt"]))
