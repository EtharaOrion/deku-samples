"""Seed: run once and idempotently. Restarting the app must not duplicate rows."""
import datetime as dt
import secrets

from . import auth, db

PASSWORD = "deku-demo-pw-2026"

CIRRUS_WORKS = [
    ("the-halo", "The Halo", 1, "left"),
    ("sonder", "Sonder", 2, "right"),
    ("binary", "BINARY", 3, "centre"),
    ("common-ground", "Common Ground", 4, "left"),
    ("nve", "NVE", 5, "right"),
    ("the-absolute-shelter", "The Absolute Shelter", 6, "centre"),
    ("maison-de-lumiere", "MAISON DE LUMIERE", 7, "left"),
    ("loris", "LORIS", 8, "right"),
    ("mdl-serie-extreme", "MDL Serie Extreme", 9, "centre"),
    ("ak", "AK", 10, "left"),
    ("loris-shoot-studio", "Loris Shoot Studio", 11, "right"),
    ("the-radiant", "The Radiant", 12, "centre"),
]

CIRRUS_TALENTS = [
    ("rives", "Rives", 1, "director"),
    ("halcyon", "Halcyon", 2, "director"),
    ("camille-ferrand", "Camille Ferrand", 3, "photographer"),
]

ASPECTS = {"left": (598, 320), "right": (300, 300), "centre": (1006, 617)}


def _now():
    return dt.datetime.now(dt.timezone.utc)


def run(cur):
    now = _now()

    def house(slug, **fields):
        row = db.one(
            cur,
            """insert into houses (slug, name, tagline_upper, tagline_lower, street,
                                   city, district, contact_email)
               values (%s,%s,%s,%s,%s,%s,%s,%s)
               on conflict (slug) do update
                 set name = excluded.name,
                     tagline_upper = excluded.tagline_upper,
                     tagline_lower = excluded.tagline_lower,
                     street = excluded.street,
                     city = excluded.city,
                     district = excluded.district,
                     contact_email = excluded.contact_email
               returning id""",
            (
                slug,
                fields.get("name", ""),
                fields.get("tagline_upper", ""),
                fields.get("tagline_lower", ""),
                fields.get("street", ""),
                fields.get("city", ""),
                fields.get("district", ""),
                fields.get("contact_email", ""),
            ),
        )
        return row["id"]

    cirrus_id = house(
        "cirrus",
        name="Cirrus",
        tagline_upper="FOR PICTURE",
        tagline_lower="AND ITS MAKERS",
        street="9 Passage Bellevue",
        city="Paris",
        district="11",
        contact_email="prod@example.com",
    )
    meridian_id = house(
        "meridian",
        name="Meridian",
        tagline_upper="FOR PICTURE",
        tagline_lower="AND ITS MAKERS",
        street="1 Meridian Row",
        city="Paris",
        district="3",
        contact_email="studio@meridian.example",
    )

    def account(email, role, house_id):
        db.one(
            cur,
            """insert into accounts (email, password_hash, role, house_id)
               values (%s, %s, %s, %s)
               on conflict (email) do update set password_hash = excluded.password_hash,
                     role = excluded.role, house_id = excluded.house_id
               returning id""",
            (email, auth.hash_password(PASSWORD), role, house_id),
        )

    account("producer@example.com", "producer", cirrus_id)
    account("producer.meridian@example.com", "producer", meridian_id)
    account("viewer@example.com", "viewer", None)

    def upsert_item(house_id, kind, slug, title, position, discipline, variant,
                    published, poster_alt):
        row = db.one(
            cur,
            """insert into items (house_id, kind, slug, title, position, discipline,
                                  variant, published, published_at)
               values (%s,%s,%s,%s,%s,%s,%s,%s,%s)
               on conflict (house_id, kind, lower(slug)) do update
                 set title = excluded.title,
                     position = excluded.position,
                     discipline = excluded.discipline,
                     variant = excluded.variant,
                     published = excluded.published,
                     published_at = excluded.published_at
               returning id""",
            (
                house_id, kind, slug, title, position, discipline, variant, published,
                now if published else None,
            ),
        )
        item_id = row["id"]
        if kind == "work":
            w, h = ASPECTS[variant]
        else:
            w, h = 492, 617
        if not db.one(
            cur, "select 1 from media where item_id = %s and role = 'poster'", (item_id,)
        ):
            db.one(
                cur,
                """insert into media (id, item_id, role, position, seed, width, height, alt)
                   values (%s,%s,'poster',0,%s,%s,%s,%s) returning id""",
                (secrets.token_hex(16), item_id, f"{slug}-poster", w, h, poster_alt),
            )
        if kind == "work" and published:
            if not db.one(
                cur, "select 1 from media where item_id = %s and role = 'reel'", (item_id,)
            ):
                db.one(
                    cur,
                    """insert into media (id, item_id, role, position, seed, width, height, alt)
                       values (%s,%s,'reel',1,%s,%s,%s,%s) returning id""",
                    (
                        secrets.token_hex(16), item_id, f"{slug}-reel",
                        1006, 617, f"Reel for {title}",
                    ),
                )
        return item_id

    work_ids = {}
    for slug, title, position, variant in CIRRUS_WORKS:
        work_ids[slug] = upsert_item(
            cirrus_id, "work", slug, title, position, None, variant, True,
            f"Still from {title}",
        )
    upsert_item(
        cirrus_id, "work", "the-quiet-room", "The Quiet Room", 13, None, "left", False,
        "Still from The Quiet Room",
    )

    talent_ids = {}
    for slug, title, position, discipline in CIRRUS_TALENTS:
        talent_ids[slug] = upsert_item(
            cirrus_id, "talent", slug, title, position, discipline, None, True,
            f"Portrait of {title}",
        )
    upsert_item(
        cirrus_id, "talent", "noor-vasquez", "Noor Vasquez", 4, "stylist", None, False,
        "Portrait of Noor Vasquez",
    )

    def credit(work_slug, position, role, name, talent_slug=None):
        item_id = work_ids[work_slug]
        talent_id = talent_ids.get(talent_slug) if talent_slug else None
        if db.one(
            cur,
            "select 1 from credits where item_id = %s and role = %s and name = %s",
            (item_id, role, name),
        ):
            return
        db.one(
            cur,
            """insert into credits (item_id, position, role, name, talent_item_id)
               values (%s,%s,%s,%s,%s) returning id""",
            (item_id, position, role, name, talent_id),
        )

    credit("the-halo", 0, "Director", "Rives", "rives")
    credit("sonder", 0, "Director", "Halcyon", "halcyon")
    credit("loris", 0, "Photographer", "Camille Ferrand", "camille-ferrand")

    upsert_item(
        meridian_id, "talent", "sable-ito", "Sable Ito", 1, "director", None, True,
        "Portrait of Sable Ito",
    )
    upsert_item(
        meridian_id, "work", "foundry", "Foundry", 1, None, "left", True,
        "Still from Foundry",
    )


def seed_if_needed(cur):
    row = db.one(
        cur, "select count(*) as n from houses where slug in ('cirrus','meridian')"
    )
    run(cur)
