"""Idempotent corpus seed.

Every identifier that must survive a restart is derived from a hash of the
record it belongs to, so running this twice inserts nothing the second time.
"""

from __future__ import annotations

import hashlib
from typing import Any

from . import config, db, repo
from .auth import hash_password, hex_token
from .config import now_utc

HOUSES: tuple[dict[str, Any], ...] = (
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
        "tagline_upper": "FOR LIGHT",
        "tagline_lower": "AND ITS KEEPERS",
        "street": "4 RUE DES ORMES",
        "city": "LYON",
        "district": "02",
        "contact_email": "prod@meridian.example.com",
    },
)

ACCOUNTS: tuple[dict[str, Any], ...] = (
    {"email": "producer@example.com", "role": "producer", "house": "cirrus"},
    {"email": "producer.meridian@example.com", "role": "producer", "house": "meridian"},
    {"email": "viewer@example.com", "role": "viewer", "house": None},
)

CIRRUS_WORKS: tuple[tuple[str, str, str], ...] = (
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
)

CIRRUS_UNLISTED_WORK = ("The Quiet Room", "the-quiet-room", "left")

CIRRUS_TALENTS: tuple[tuple[str, str, str], ...] = (
    ("Rives", "rives", "director"),
    ("Halcyon", "halcyon", "director"),
    ("Camille Ferrand", "camille-ferrand", "photographer"),
)

CIRRUS_UNLISTED_TALENT = ("Noor Vasquez", "noor-vasquez", "stylist")

CIRRUS_CREDITS: tuple[tuple[str, str, str], ...] = (
    ("the-halo", "Director", "rives"),
    ("sonder", "Director", "halcyon"),
    ("loris", "Photographer", "camille-ferrand"),
)

MERIDIAN_WORKS = (("Foundry", "foundry", "left"),)
MERIDIAN_TALENTS = (("Sable Ito", "sable-ito", "director"),)

VARIANT_SIZE = {"left": (598, 320), "right": (300, 300), "centre": (1006, 617)}
REEL_SIZE = (1006, 617)
PORTRAIT_SIZE = (246, 308)
GALLERY_ORDER = ("left", "right", "centre")

# The entry cluster wants roughly twenty stills over twelve published works, so
# the first eight works carry one extra gallery still each.
CLUSTER_EXTRA = 8


def _phrase(*parts: object) -> str:
    return "\u001f".join(str(part) for part in parts)


def _media_id(house: str, kind: str, slug: str, role: str, position: int) -> str:
    return hex_token(_phrase("media", house, kind, slug, role, position))


def _seed_value(house: str, kind: str, slug: str, role: str, position: int) -> str:
    return hashlib.sha256(_phrase("seed", house, kind, slug, role, position).encode("utf-8")).hexdigest()[:16]


def _house_id(slug: str) -> int:
    row = db.one("SELECT id FROM houses WHERE slug = %s", (slug,))
    if row is None:  # pragma: no cover - the seed inserts it first
        raise RuntimeError(f"house {slug!r} missing")
    return int(row["id"])


def _seed_houses() -> None:
    for house in HOUSES:
        db.execute(
            """
            INSERT INTO houses (slug, name, tagline_upper, tagline_lower,
                                street, city, district, contact_email)
            VALUES (%(slug)s, %(name)s, %(tagline_upper)s, %(tagline_lower)s,
                    %(street)s, %(city)s, %(district)s, %(contact_email)s)
            ON CONFLICT (slug) DO NOTHING
            """,
            house,
        )


def _seed_accounts() -> None:
    for account in ACCOUNTS:
        existing = db.one(
            "SELECT id FROM accounts WHERE email = %s", (account["email"],)
        )
        if existing is not None:
            continue
        house_id = _house_id(account["house"]) if account["house"] else None
        db.execute(
            """
            INSERT INTO accounts (email, password_hash, role, house_id)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (email) DO NOTHING
            """,
            (
                account["email"],
                hash_password(config.seed_password(account["role"])),
                account["role"],
                house_id,
            ),
        )


def _upsert_item(
    house_id: int,
    house_slug: str,
    kind: str,
    title: str,
    slug: str,
    position: int,
    *,
    published: bool,
    discipline: str | None = None,
    variant: str | None = None,
) -> int:
    existing = db.one(
        "SELECT id FROM items WHERE house_id = %s AND kind = %s AND slug = %s",
        (house_id, kind, slug),
    )
    if existing is not None:
        return int(existing["id"])
    row = db.one(
        """
        INSERT INTO items (house_id, kind, slug, title, position,
                           discipline, variant, published, published_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                CASE WHEN %s THEN %s ELSE NULL END)
        ON CONFLICT (house_id, kind, slug) DO NOTHING
        RETURNING id
        """,
        (
            house_id,
            kind,
            slug,
            title,
            position,
            discipline,
            variant,
            published,
            published,
            now_utc(),
        ),
    )
    if row is not None:
        return int(row["id"])
    settled = db.one(
        "SELECT id FROM items WHERE house_id = %s AND kind = %s AND slug = %s",
        (house_id, kind, slug),
    )
    if settled is None:  # pragma: no cover - unreachable with the unique index
        raise RuntimeError(f"could not settle item {house_slug}/{kind}/{slug}")
    return int(settled["id"])


def _attach_media(
    item_id: int,
    house_slug: str,
    kind: str,
    slug: str,
    role: str,
    position: int,
    width: int,
    height: int,
    alt: str,
) -> None:
    db.execute(
        """
        INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING
        """,
        (
            _media_id(house_slug, kind, slug, role, position),
            item_id,
            role,
            position,
            _seed_value(house_slug, kind, slug, role, position),
            width,
            height,
            alt,
        ),
    )


def _seed_work_media(
    item_id: int, house_slug: str, title: str, slug: str, variant: str, ordinal: str
) -> None:
    width, height = VARIANT_SIZE[variant]
    _attach_media(
        item_id,
        house_slug,
        "work",
        slug,
        "poster",
        0,
        width,
        height,
        f"{title}, film {ordinal}",
    )
    _attach_media(
        item_id,
        house_slug,
        "work",
        slug,
        "reel",
        0,
        REEL_SIZE[0],
        REEL_SIZE[1],
        f"{title}, moving sequence",
    )
    for index, gallery_variant in enumerate(GALLERY_ORDER):
        gallery_width, gallery_height = VARIANT_SIZE[gallery_variant]
        _attach_media(
            item_id,
            house_slug,
            "work",
            slug,
            "gallery",
            index,
            gallery_width,
            gallery_height,
            f"{title}, frame {index + 1}",
        )


def _seed_talent_media(
    item_id: int, house_slug: str, title: str, slug: str, discipline: str
) -> None:
    _attach_media(
        item_id,
        house_slug,
        "talent",
        slug,
        "poster",
        0,
        PORTRAIT_SIZE[0],
        PORTRAIT_SIZE[1],
        f"{title}, {discipline}",
    )
    _attach_media(
        item_id,
        house_slug,
        "talent",
        slug,
        "reel",
        0,
        REEL_SIZE[0],
        REEL_SIZE[1],
        f"{title}, moving sequence",
    )


def _seed_credit(work_id: int, position: int, role: str, name: str, talent_id: int) -> None:
    existing = db.one(
        """
        SELECT id FROM credits
        WHERE item_id = %s AND role = %s AND name = %s
        """,
        (work_id, role, name),
    )
    if existing is not None:
        return
    db.execute(
        """
        INSERT INTO credits (item_id, position, role, name, talent_item_id)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (work_id, position, role, name, talent_id),
    )


def _seed_cirrus() -> None:
    house_id = _house_id("cirrus")
    work_ids: dict[str, int] = {}
    talent_ids: dict[str, int] = {}

    for index, (title, slug, variant) in enumerate(CIRRUS_WORKS):
        item_id = _upsert_item(
            house_id,
            "cirrus",
            "work",
            title,
            slug,
            index + 1,
            published=True,
            variant=variant,
        )
        work_ids[slug] = item_id
        _seed_work_media(item_id, "cirrus", title, slug, variant, repo.ordinal_of(index))

    title, slug, variant = CIRRUS_UNLISTED_WORK
    quiet_id = _upsert_item(
        house_id,
        "cirrus",
        "work",
        title,
        slug,
        len(CIRRUS_WORKS) + 1,
        published=False,
        variant=variant,
    )
    width, height = VARIANT_SIZE[variant]
    _attach_media(
        quiet_id, "cirrus", "work", slug, "poster", 0, width, height, f"{title}, unlisted"
    )

    for index, (title, slug, discipline) in enumerate(CIRRUS_TALENTS):
        item_id = _upsert_item(
            house_id,
            "cirrus",
            "talent",
            title,
            slug,
            index + 1,
            published=True,
            discipline=discipline,
        )
        talent_ids[slug] = item_id
        _seed_talent_media(item_id, "cirrus", title, slug, discipline)

    title, slug, discipline = CIRRUS_UNLISTED_TALENT
    noor_id = _upsert_item(
        house_id,
        "cirrus",
        "talent",
        title,
        slug,
        len(CIRRUS_TALENTS) + 1,
        published=False,
        discipline=discipline,
    )
    _attach_media(
        noor_id,
        "cirrus",
        "talent",
        slug,
        "poster",
        0,
        PORTRAIT_SIZE[0],
        PORTRAIT_SIZE[1],
        f"{title}, {discipline}",
    )

    names = {slug: title for title, slug, _ in CIRRUS_TALENTS}
    for work_slug, role, talent_slug in CIRRUS_CREDITS:
        _seed_credit(
            work_ids[work_slug], 0, role, names[talent_slug], talent_ids[talent_slug]
        )


def _seed_meridian() -> None:
    house_id = _house_id("meridian")
    for index, (title, slug, variant) in enumerate(MERIDIAN_WORKS):
        item_id = _upsert_item(
            house_id,
            "meridian",
            "work",
            title,
            slug,
            index + 1,
            published=True,
            variant=variant,
        )
        _seed_work_media(item_id, "meridian", title, slug, variant, repo.ordinal_of(index))
    for index, (title, slug, discipline) in enumerate(MERIDIAN_TALENTS):
        item_id = _upsert_item(
            house_id,
            "meridian",
            "talent",
            title,
            slug,
            index + 1,
            published=True,
            discipline=discipline,
        )
        _seed_talent_media(item_id, "meridian", title, slug, discipline)


def cluster_media(house_id: int) -> list[dict[str, Any]]:
    """Twenty-ish stills for the entry cluster, stable across loads."""
    rows = db.query(
        """
        SELECT m.id, m.item_id, m.role, m.position, m.seed, m.width, m.height,
               m.alt, i.slug, i.title
        FROM media m
        JOIN items i ON i.id = m.item_id
        WHERE i.house_id = %s
          AND i.kind = 'work'
          AND i.published = TRUE
          AND m.role IN ('poster', 'gallery')
        ORDER BY i.position ASC, i.id ASC, m.role DESC, m.position ASC
        """,
        (house_id,),
    )
    posters = [row for row in rows if row["role"] == "poster"]
    gallery = [row for row in rows if row["role"] == "gallery" and row["position"] == 0]
    return posters + gallery[:CLUSTER_EXTRA]


def run() -> None:
    """Seed the corpus. Safe to call on every boot and from every worker."""
    _seed_houses()
    _seed_accounts()
    _seed_cirrus()
    _seed_meridian()
