"""Idempotent seed. Restarting the app must not duplicate rows."""
import logging

from . import db

log = logging.getLogger("cirrus.seed")

SEED_PASSWORD = "deku-demo-pw-2026"

POSTER_GEOM = {"left": (598, 320), "right": (300, 300), "centre": (1006, 618)}

WORKS = [
    # slug, title, variant
    ("the-halo", "The Halo", "left"),
    ("sonder", "Sonder", "right"),
    ("binary", "BINARY", "centre"),
    ("common-ground", "Common Ground", "left"),
    ("nve", "NVE", "right"),
    ("the-absolute-shelter", "The Absolute Shelter", "centre"),
    ("maison-de-lumiere", "MAISON DE LUMIERE", "left"),
    ("loris", "LORIS", "right"),
    ("mdl-serie-extreme", "MDL Serie Extreme", "centre"),
    ("ak", "AK", "left"),
    ("loris-shoot-studio", "Loris Shoot Studio", "right"),
    ("the-radiant", "The Radiant", "centre"),
]

TALENTS = [
    # slug, title, discipline, published
    ("rives", "Rives", "director", True),
    ("halcyon", "Halcyon", "director", True),
    ("camille-ferrand", "Camille Ferrand", "photographer", True),
    ("noor-vasquez", "Noor Vasquez", "stylist", False),
]

CREDITS = {
    "the-halo": [("Director", "Rives", "rives")],
    "sonder": [("Director", "Halcyon", "halcyon")],
    "loris": [("Photographer", "Camille Ferrand", "camille-ferrand")],
}


def seed():
    from datetime import datetime, timezone
    now_or_none = datetime.now(timezone.utc)
    with db.pool.tx() as conn:
        now = "now()"
        # --- houses -----------------------------------------------------
        conn.execute(
            """
            INSERT INTO houses (id, slug, name, tagline_upper, tagline_lower, street, city, district, contact_email)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (slug) DO NOTHING
            """,
            ("house_cirrus", "cirrus", "Cirrus", "FOR PICTURE", "AND ITS MAKERS",
             "9 Passage Bellevue", "Paris", "11", "prod@example.com"),
        )
        conn.execute(
            """
            INSERT INTO houses (id, slug, name, tagline_upper, tagline_lower, street, city, district, contact_email)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (slug) DO NOTHING
            """,
            ("house_meridian", "meridian", "Meridian", "FOR PICTURE", "AND ITS MAKERS",
             "3 Rue Ordener", "Paris", "18", "prod.meridian@example.com"),
        )

        from .auth import hash_password
        pw = hash_password(SEED_PASSWORD)
        conn.execute(
            """
            INSERT INTO accounts (id, email, password_hash, role, house_id)
            VALUES (%s,%s,%s,'producer','house_cirrus')
            ON CONFLICT (email) DO NOTHING
            """,
            ("acct_producer_cirrus", "producer@example.com", pw),
        )
        conn.execute(
            """
            INSERT INTO accounts (id, email, password_hash, role, house_id)
            VALUES (%s,%s,%s,'producer','house_meridian')
            ON CONFLICT (email) DO NOTHING
            """,
            ("acct_producer_meridian", "producer.meridian@example.com", pw),
        )
        conn.execute(
            """
            INSERT INTO accounts (id, email, password_hash, role, house_id)
            VALUES (%s,%s,%s,'viewer',NULL)
            ON CONFLICT (email) DO NOTHING
            """,
            ("acct_viewer", "viewer@example.com", pw),
        )

        # --- works ------------------------------------------------------
        for idx, (slug, title, variant) in enumerate(WORKS):
            item_id = "seed_work_%s" % slug
            conn.execute(
                """
                INSERT INTO items (id, house_id, kind, slug, title, position, variant, published, published_at)
                VALUES (%s,'house_cirrus','work',%s,%s,%s,%s,TRUE,now())
                ON CONFLICT DO NOTHING
                """,
                (item_id, slug, title, idx, variant),
            )
            existing = conn.execute(
                "SELECT id FROM media WHERE item_id = %s AND role = 'poster'", (item_id,)
            ).fetchone()
            if not existing:
                w, h = POSTER_GEOM[variant]
                conn.execute(
                    """
                    INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                    VALUES (%s,%s,'poster',0,%s,%s,%s,%s)
                    """,
                    (db.new_id(), item_id, "seed:%s:poster" % slug, w, h,
                     "Still from %s, %s of 12" % (title, "%03d" % (idx + 1))),
                )
                conn.execute(
                    """
                    INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                    VALUES (%s,%s,'reel',1,%s,1280,720,%s)
                    """,
                    (db.new_id(), item_id, "seed:%s:reel" % slug,
                     "Moving image for %s" % title),
                )

        # one gallery still per published work, so the entry cluster carries
        # about twenty stills in total (idempotent: only when absent)
        gallery_geom = [(598, 320), (300, 300), (1006, 618)]
        for idx, (slug, title, variant) in enumerate(WORKS):
            item_id = "seed_work_%s" % slug
            has_gallery = conn.execute(
                "SELECT 1 FROM media WHERE item_id = %s AND role = 'gallery'", (item_id,)
            ).fetchone()
            if not has_gallery:
                w, h = gallery_geom[idx % 3]
                conn.execute(
                    """
                    INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                    VALUES (%s,%s,'gallery',2,%s,%s,%s,%s)
                    """,
                    (db.new_id(), item_id, "seed:%s:gallery" % slug, w, h,
                     "Additional still from %s, %s of 12" % (title, "%03d" % (idx + 1))),
                )

        # the unlisted work
        conn.execute(
            """
            INSERT INTO items (id, house_id, kind, slug, title, position, variant, published, published_at)
            VALUES ('seed_work_the-quiet-room','house_cirrus','work','the-quiet-room','The Quiet Room',12,'left',FALSE,NULL)
            ON CONFLICT DO NOTHING
            """
        )
        if not conn.execute("SELECT 1 FROM media WHERE item_id = 'seed_work_the-quiet-room'").fetchone():
            conn.execute(
                """
                INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                VALUES (%s,'seed_work_the-quiet-room','poster',0,%s,598,320,%s)
                """,
                (db.new_id(), "seed:the-quiet-room:poster", "Still from The Quiet Room, unlisted"),
            )

        # --- talents ----------------------------------------------------
        for idx, (slug, title, disc, published) in enumerate(TALENTS):
            item_id = "seed_talent_%s" % slug
            conn.execute(
                """
                INSERT INTO items (id, house_id, kind, slug, title, position, discipline, published, published_at)
                VALUES (%s,'house_cirrus','talent',%s,%s,%s,%s,%s,%s)
                ON CONFLICT DO NOTHING
                """,
                (item_id, slug, title, idx, disc, published, now_or_none),
            )
            if not conn.execute("SELECT 1 FROM media WHERE item_id = %s AND role='poster'", (item_id,)).fetchone():
                conn.execute(
                    """
                    INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                    VALUES (%s,%s,'poster',0,%s,246,330,%s)
                    """,
                    (db.new_id(), item_id, "seed:%s:portrait" % slug,
                     "Portrait of %s, %s" % (title, disc)),
                )
                if published:
                    conn.execute(
                        """
                        INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                        VALUES (%s,%s,'reel',1,%s,1280,720,%s)
                        """,
                        (db.new_id(), item_id, "seed:%s:reel" % slug, "Showreel of %s" % title),
                    )

        # --- credits ----------------------------------------------------
        for work_slug, rows in CREDITS.items():
            work_id = "seed_work_%s" % work_slug
            for cpos, (role, name, talent_slug) in enumerate(rows):
                if conn.execute("SELECT 1 FROM credits WHERE item_id=%s AND position=%s", (work_id, cpos)).fetchone():
                    continue
                conn.execute(
                    """
                    INSERT INTO credits (id, item_id, position, role, name, talent_item_id)
                    VALUES (%s,%s,%s,%s,%s,(SELECT id FROM items WHERE house_id='house_cirrus' AND kind='talent' AND slug=%s))
                    """,
                    (db.new_id(), work_id, cpos, role, name, talent_slug),
                )

        # --- meridian ---------------------------------------------------
        conn.execute(
            """
            INSERT INTO items (id, house_id, kind, slug, title, position, discipline, published, published_at)
            VALUES ('seed_meridian_sable','house_meridian','talent','sable-ito','Sable Ito',0,'director',TRUE,now())
            ON CONFLICT DO NOTHING
            """
        )
        conn.execute(
            """
            INSERT INTO items (id, house_id, kind, slug, title, position, variant, published, published_at)
            VALUES ('seed_meridian_foundry','house_meridian','work','foundry','Foundry',0,'left',TRUE,now())
            ON CONFLICT DO NOTHING
            """
        )
        for item_id, kind, title, alt in (
            ("seed_meridian_sable", "talent", "Sable Ito", "Portrait of Sable Ito, director"),
            ("seed_meridian_foundry", "work", "Foundry", "Still from Foundry, 001 of 001"),
        ):
            if not conn.execute("SELECT 1 FROM media WHERE item_id=%s AND role='poster'", (item_id,)).fetchone():
                w, h = (246, 330) if kind == "talent" else (598, 320)
                conn.execute(
                    """
                    INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                    VALUES (%s,%s,'poster',0,%s,%s,%s,%s)
                    """,
                    (db.new_id(), item_id, "seed:%s:poster" % item_id, w, h, alt),
                )
                if kind == "work":
                    conn.execute(
                        """
                        INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                        VALUES (%s,%s,'reel',1,%s,1280,720,%s)
                        """,
                        (db.new_id(), item_id, "seed:%s:reel" % item_id, "Moving image for Foundry"),
                    )
    log.info("seed ensured")

