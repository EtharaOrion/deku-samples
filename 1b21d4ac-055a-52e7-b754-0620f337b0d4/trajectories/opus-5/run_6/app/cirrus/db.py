"""Database access: pooling, schema application and the idempotent seed."""
import os
import threading
import time

import psycopg2
import psycopg2.extras
import psycopg2.pool
from werkzeug.security import generate_password_hash

HERE = os.path.dirname(os.path.abspath(__file__))
SEED_PASSWORD = "deku-demo-pw-2026"

_pool = None
_pool_lock = threading.Lock()


def _dsn():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL is not set")
    return dsn


def pool():
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = psycopg2.pool.ThreadedConnectionPool(1, 16, _dsn())
    return _pool


class connection:
    """Context manager yielding a dict-cursor-capable connection from the pool."""

    def __init__(self):
        self.conn = None

    def __enter__(self):
        self.conn = pool().getconn()
        return self.conn

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None:
                self.conn.commit()
            else:
                self.conn.rollback()
        finally:
            pool().putconn(self.conn)
        return False


def query(sql, args=None, one=False):
    with connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, args or ())
            if cur.description is None:
                return None
            rows = cur.fetchall()
    if one:
        return dict(rows[0]) if rows else None
    return [dict(r) for r in rows]


def execute(sql, args=None, returning=False):
    with connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, args or ())
            if returning and cur.description is not None:
                row = cur.fetchone()
                return dict(row) if row else None
    return None


def wait_for_db(timeout=90):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            conn = psycopg2.connect(_dsn())
            conn.close()
            return
        except Exception as exc:  # pragma: no cover - startup path
            last = exc
            time.sleep(1.0)
    raise RuntimeError(f"database never became reachable: {last}")


def apply_schema():
    with open(os.path.join(HERE, "schema.sql"), "r", encoding="utf-8") as fh:
        sql = fh.read()
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)


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

VARIANT_SIZE = {
    "left": (598, 320),
    "right": (300, 300),
    "centre": (1006, 617),
}


def _media_id(*parts):
    import hashlib

    return hashlib.md5(("cirrus-seed:" + ":".join(str(p) for p in parts)).encode()).hexdigest()


def _seed_media(cur, item_id, kind, title, slug, variant, discipline):
    """Deterministic media rows for a seeded record; idempotent by derived id."""
    rows = []
    if kind == "work":
        w, h = VARIANT_SIZE.get(variant or "left", (598, 320))
        rows.append((_media_id(slug, "poster"), "poster", 0, f"{slug}-poster", w, h,
                     f"{title}, still from the film"))
        rows.append((_media_id(slug, "reel"), "reel", 0, f"{slug}-reel", 1440, 810,
                     f"{title}, showreel"))
        for i in range(3):
            var = ["left", "centre", "right"][i]
            gw, gh = VARIANT_SIZE[var]
            rows.append((_media_id(slug, "gallery", i), "gallery", i, f"{slug}-still-{i}", gw, gh,
                         f"{title}, still {i + 1}"))
    else:
        rows.append((_media_id(slug, "poster"), "poster", 0, f"{slug}-portrait", 246, 330,
                     f"{title}, {discipline}, portrait"))
        rows.append((_media_id(slug, "reel"), "reel", 0, f"{slug}-reel", 1440, 810,
                     f"{title}, showreel"))
    for mid, role, pos, seed, w, h, alt in rows:
        cur.execute(
            """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
            (mid, item_id, role, pos, seed, w, h, alt),
        )


def _upsert_item(cur, house_id, kind, slug, title, position, discipline, variant, published):
    cur.execute("SELECT id FROM items WHERE house_id=%s AND kind=%s AND lower(slug)=lower(%s)",
                (house_id, kind, slug))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        """INSERT INTO items (house_id, kind, slug, title, position, discipline, variant,
                              published, published_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s, CASE WHEN %s THEN now() ELSE NULL END)
           RETURNING id""",
        (house_id, kind, slug, title, position, discipline, variant, published, published),
    )
    return cur.fetchone()[0]


def seed():
    """Idempotent seed. Restarting the app must not duplicate rows."""
    with connection() as conn:
        with conn.cursor() as cur:
            # advisory lock so two workers starting together cannot race the seed
            cur.execute("SELECT pg_advisory_xact_lock(918273645)")
            houses = {}
            for slug, name, email in (
                ("cirrus", "Cirrus", "prod@example.com"),
                ("meridian", "Meridian", "prod@meridian.example.com"),
            ):
                cur.execute(
                    """INSERT INTO houses (slug, name, tagline_upper, tagline_lower, street, city,
                                           district, contact_email)
                       VALUES (%s,%s,'FOR PICTURE','AND ITS MAKERS','9 PASSAGE BELLEVUE','PARIS',
                               '11',%s)
                       ON CONFLICT (slug) DO NOTHING""",
                    (slug, name, email),
                )
                cur.execute("SELECT id FROM houses WHERE slug=%s", (slug,))
                houses[slug] = cur.fetchone()[0]

            pw = generate_password_hash(SEED_PASSWORD)
            for email, role, house in (
                ("producer@example.com", "producer", "cirrus"),
                ("producer.meridian@example.com", "producer", "meridian"),
                ("viewer@example.com", "viewer", None),
            ):
                cur.execute(
                    """INSERT INTO accounts (email, password_hash, role, house_id)
                       VALUES (%s,%s,%s,%s) ON CONFLICT (email) DO NOTHING""",
                    (email, pw, role, houses[house] if house else None),
                )

            cirrus = houses["cirrus"]
            work_ids = {}
            for i, (title, slug, variant) in enumerate(WORKS):
                iid = _upsert_item(cur, cirrus, "work", slug, title, i, None, variant, True)
                work_ids[slug] = iid
                _seed_media(cur, iid, "work", title, slug, variant, None)
            qr = _upsert_item(cur, cirrus, "work", "the-quiet-room", "The Quiet Room",
                              len(WORKS), None, "left", False)
            cur.execute(
                """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                   VALUES (%s,%s,'poster',0,'the-quiet-room-poster',598,320,%s)
                   ON CONFLICT (id) DO NOTHING""",
                (_media_id("the-quiet-room", "poster"), qr, "The Quiet Room, still from the film"),
            )

            talent_ids = {}
            for i, (title, slug, discipline) in enumerate(TALENTS):
                iid = _upsert_item(cur, cirrus, "talent", slug, title, i, discipline, None, True)
                talent_ids[slug] = iid
                _seed_media(cur, iid, "talent", title, slug, None, discipline)
            noor = _upsert_item(cur, cirrus, "talent", "noor-vasquez", "Noor Vasquez",
                                len(TALENTS), "stylist", None, False)
            cur.execute(
                """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                   VALUES (%s,%s,'poster',0,'noor-vasquez-portrait',246,330,%s)
                   ON CONFLICT (id) DO NOTHING""",
                (_media_id("noor-vasquez", "poster"), noor, "Noor Vasquez, stylist, portrait"),
            )

            credits = [
                ("the-halo", "Director", "Rives", talent_ids["rives"]),
                ("the-halo", "Producer", "Elise Marchand", None),
                ("sonder", "Director", "Halcyon", talent_ids["halcyon"]),
                ("sonder", "Producer", "Elise Marchand", None),
                ("loris", "Photographer", "Camille Ferrand", talent_ids["camille-ferrand"]),
                ("loris", "Production", "Cirrus", None),
            ]
            for pos, (work_slug, role, name, talent_id) in enumerate(credits):
                wid = work_ids[work_slug]
                cur.execute(
                    "SELECT id FROM credits WHERE item_id=%s AND role=%s AND name=%s",
                    (wid, role, name),
                )
                if cur.fetchone():
                    continue
                cur.execute(
                    """INSERT INTO credits (item_id, position, role, name, talent_item_id)
                       VALUES (%s,%s,%s,%s,%s)""",
                    (wid, pos, role, name, talent_id),
                )

            meridian = houses["meridian"]
            sable = _upsert_item(cur, meridian, "talent", "sable-ito", "Sable Ito", 0,
                                 "director", None, True)
            _seed_media(cur, sable, "talent", "Sable Ito", "sable-ito", None, "director")
            foundry = _upsert_item(cur, meridian, "work", "foundry", "Foundry", 0, None,
                                   "left", True)
            _seed_media(cur, foundry, "work", "Foundry", "foundry", "left", None)


def init():
    wait_for_db()
    apply_schema()
    seed()
