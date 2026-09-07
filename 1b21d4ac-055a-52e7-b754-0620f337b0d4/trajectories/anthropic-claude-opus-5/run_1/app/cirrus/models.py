"""Reads, writes and the derived values.

Derived at read time and never stored: a work's displayed ordinal, the roster's
discipline set, a talent's selected work, and a work's neighbours.
"""
import re
import secrets
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras

from . import db, media as media_gen

SERVED_HOUSE_SLUG = "cirrus"
DISCIPLINES = ("director", "photographer", "stylist")
VARIANTS = ("left", "right", "centre")
KINDS = ("work", "talent")
MEDIA_ROLES = ("poster", "reel", "gallery")
PREVIEW_TTL = timedelta(minutes=15)

VARIANT_GEOMETRY = {
    "left": (598, 320),
    "right": (300, 300),
    "centre": (1006, 617),
}


class Refused(Exception):
    """A client error with a reason a person can read. Store unchanged."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


class NotFound(Refused):
    def __init__(self, message="That record is not here."):
        super().__init__(message, 404)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def valid_slug(value: str) -> bool:
    return bool(value) and bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value))


def mint_hex() -> str:
    return secrets.token_hex(16)


def now_utc():
    return datetime.now(timezone.utc)


def house_by_slug(slug):
    return db.query("SELECT * FROM houses WHERE slug = %s", (slug,), one=True)


def served_house():
    house = house_by_slug(SERVED_HOUSE_SLUG)
    if house is None:
        raise NotFound("The house is not here.")
    return house


def ordinal_string(index: int) -> str:
    return "%03d" % index


# --------------------------------------------------------------------------
# serialisation
# --------------------------------------------------------------------------

def media_row_json(row):
    return {
        "media_id": row["id"],
        "id": row["id"],
        "role": row["role"],
        "position": row["position"],
        "seed": row["seed"],
        "width": row["width"],
        "height": row["height"],
        "alt": row["alt"],
        "url": "/api/media/%s" % row["id"],
    }


def item_json(row, ordinal=None):
    out = {
        "id": row["id"],
        "kind": row["kind"],
        "slug": row["slug"],
        "title": row["title"],
        "position": row["position"],
        "published": row["published"],
        "published_at": row["published_at"].isoformat() if row.get("published_at") else None,
        "href": ("/works/%s" if row["kind"] == "work" else "/talents/%s") % row["slug"],
    }
    if row["kind"] == "work":
        out["variant"] = row["variant"]
        if ordinal is not None:
            out["ordinal"] = ordinal_string(ordinal)
    else:
        out["discipline"] = row["discipline"]
    return out


# --------------------------------------------------------------------------
# public reads: published records of the served house only
# --------------------------------------------------------------------------

def published_items(house_id, kind):
    return db.query(
        "SELECT * FROM items WHERE house_id = %s AND kind = %s AND published = TRUE "
        "ORDER BY position ASC, id ASC",
        (house_id, kind),
    )


def item_media(item_id, role=None):
    if role:
        return db.query(
            "SELECT * FROM media WHERE item_id = %s AND role = %s "
            "ORDER BY position ASC, created_at ASC, id ASC",
            (item_id, role),
        )
    return db.query(
        "SELECT * FROM media WHERE item_id = %s ORDER BY role ASC, position ASC, id ASC",
        (item_id,),
    )


def poster_of(item_id):
    rows = item_media(item_id, "poster")
    return rows[0] if rows else None


def reel_of(item_id):
    rows = item_media(item_id, "reel")
    return rows[0] if rows else None


def works_index(house_id):
    """The published works with their ordinals, contiguous from 001."""
    rows = published_items(house_id, "work")
    out = []
    for i, row in enumerate(rows, start=1):
        entry = item_json(row, ordinal=i)
        poster = poster_of(row["id"])
        entry["poster"] = media_row_json(poster) if poster else None
        out.append(entry)
    return out


def disciplines_of(house_id):
    """Derived from published talent in first appearance order. Never authored."""
    rows = published_items(house_id, "talent")
    seen = []
    for row in rows:
        d = row.get("discipline")
        if d and d not in seen:
            seen.append(d)
    return seen


def talents_index(house_id, discipline=None):
    rows = published_items(house_id, "talent")
    out = []
    for row in rows:
        if discipline and row.get("discipline") != discipline:
            continue
        entry = item_json(row)
        poster = poster_of(row["id"])
        entry["poster"] = media_row_json(poster) if poster else None
        out.append(entry)
    return out


def credits_of(work_id, house_id):
    rows = db.query(
        "SELECT * FROM credits WHERE item_id = %s ORDER BY position ASC, id ASC",
        (work_id,),
    )
    out = []
    for row in rows:
        entry = {
            "id": row["id"],
            "role": row["role"],
            "name": row["name"],
            "talent_id": row["talent_item_id"],
            "talent_slug": None,
            "talent_href": None,
        }
        if row["talent_item_id"]:
            t = db.query(
                "SELECT slug, published, house_id FROM items WHERE id = %s AND kind = 'talent'",
                (row["talent_item_id"],),
                one=True,
            )
            # A name links only when it matches a published talent of this house.
            if t and t["published"] and t["house_id"] == house_id:
                entry["talent_slug"] = t["slug"]
                entry["talent_href"] = "/talents/%s" % t["slug"]
        out.append(entry)
    return out


def selected_work_of(talent_id, house_id):
    """Read from credits, never stored on the talent."""
    published = published_items(house_id, "work")
    order = {row["id"]: i for i, row in enumerate(published, start=1)}
    credited = db.query(
        "SELECT DISTINCT item_id FROM credits WHERE talent_item_id = %s", (talent_id,)
    )
    ids = {r["item_id"] for r in credited}
    out = []
    for row in published:
        if row["id"] in ids:
            entry = item_json(row, ordinal=order[row["id"]])
            poster = poster_of(row["id"])
            entry["poster"] = media_row_json(poster) if poster else None
            out.append(entry)
    return out


def neighbours_of(work_id, house_id):
    rows = published_items(house_id, "work")
    if not rows:
        return None, None
    ids = [r["id"] for r in rows]
    if work_id not in ids:
        return None, None
    i = ids.index(work_id)
    prev_row = rows[(i - 1) % len(rows)]
    next_row = rows[(i + 1) % len(rows)]
    return (
        item_json(prev_row, ordinal=((i - 1) % len(rows)) + 1),
        item_json(next_row, ordinal=((i + 1) % len(rows)) + 1),
    )


def resolve_public(house_id, kind, slug):
    """Returns (item, redirect_slug). A published record, or a permanent redirect."""
    slug = (slug or "").lower()
    row = db.query(
        "SELECT * FROM items WHERE house_id = %s AND kind = %s AND lower(slug) = %s",
        (house_id, kind, slug),
        one=True,
    )
    if row and row["published"]:
        return row, None
    if row and not row["published"]:
        # Unlisted is absent, not merely unlinked.
        return None, None
    red = db.query(
        "SELECT i.slug AS target FROM slug_redirects r JOIN items i ON i.id = r.item_id "
        "WHERE r.house_id = %s AND r.kind = %s AND lower(r.old_slug) = %s AND i.published = TRUE",
        (house_id, kind, slug),
        one=True,
    )
    if red:
        return None, red["target"]
    return None, None


def work_detail(house_id, slug):
    row, redirect = resolve_public(house_id, "work", slug)
    if redirect:
        return None, redirect
    if row is None:
        raise NotFound("That page is not here.")
    published = published_items(house_id, "work")
    index = [r["id"] for r in published].index(row["id"]) + 1
    prev_item, next_item = neighbours_of(row["id"], house_id)
    detail = item_json(row, ordinal=index)
    poster = poster_of(row["id"])
    reel = reel_of(row["id"])
    detail["poster"] = media_row_json(poster) if poster else None
    detail["reel"] = media_row_json(reel) if reel else None
    detail["media"] = [media_row_json(m) for m in item_media(row["id"])]
    detail["gallery"] = [media_row_json(m) for m in item_media(row["id"], "gallery")]
    detail["credits"] = credits_of(row["id"], house_id)
    detail["previous"] = prev_item
    detail["next"] = next_item
    return detail, None


def talent_detail(house_id, slug):
    row, redirect = resolve_public(house_id, "talent", slug)
    if redirect:
        return None, redirect
    if row is None:
        raise NotFound("That page is not here.")
    detail = item_json(row)
    poster = poster_of(row["id"])
    reel = reel_of(row["id"])
    detail["poster"] = media_row_json(poster) if poster else None
    detail["reel"] = media_row_json(reel) if reel else None
    detail["media"] = [media_row_json(m) for m in item_media(row["id"])]
    detail["selected_work"] = selected_work_of(row["id"], house_id)
    return detail, None


# --------------------------------------------------------------------------
# media address
# --------------------------------------------------------------------------

def media_for_request(media_id, account):
    """Published records answer to anyone. An unlisted record's pixels answer
    only to that record's own house producer, however the caller got the id."""
    if not re.fullmatch(r"[0-9a-f]{32}", media_id or ""):
        raise NotFound("That image is not here.")
    row = db.query(
        "SELECT m.*, i.published, i.house_id FROM media m JOIN items i ON i.id = m.item_id "
        "WHERE m.id = %s",
        (media_id,),
        one=True,
    )
    if row is None:
        raise NotFound("That image is not here.")
    if row["published"]:
        return row, True
    if (
        account
        and account.get("role") == "producer"
        and account.get("house_id") == row["house_id"]
    ):
        return row, False
    raise NotFound("That image is not here.")


# --------------------------------------------------------------------------
# studio: every read and write is scoped to the caller's own house
# --------------------------------------------------------------------------

def studio_item(house_id, item_id):
    """A foreign record is answered exactly as a missing one."""
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        raise NotFound()
    row = db.query(
        "SELECT * FROM items WHERE id = %s AND house_id = %s", (item_id, house_id), one=True
    )
    if row is None:
        raise NotFound()
    return row


def studio_item_json(row):
    out = item_json(row)
    out["media"] = [media_row_json(m) for m in item_media(row["id"])]
    if row["kind"] == "work":
        out["credits"] = credits_of(row["id"], row["house_id"])
        published = published_items(row["house_id"], "work")
        ids = [r["id"] for r in published]
        out["ordinal"] = ordinal_string(ids.index(row["id"]) + 1) if row["id"] in ids else None
    return out


def studio_items(house_id, kind=None):
    if kind:
        if kind not in KINDS:
            raise Refused("kind must be work or talent.")
        rows = db.query(
            "SELECT * FROM items WHERE house_id = %s AND kind = %s "
            "ORDER BY kind ASC, position ASC, id ASC",
            (house_id, kind),
        )
    else:
        rows = db.query(
            "SELECT * FROM items WHERE house_id = %s ORDER BY kind ASC, position ASC, id ASC",
            (house_id,),
        )
    return [studio_item_json(r) for r in rows]


def create_item(house_id, payload):
    kind = (payload.get("kind") or "").strip().lower()
    if kind not in KINDS:
        raise Refused("kind must be work or talent.")
    title = (payload.get("title") or "").strip()
    if not title:
        raise Refused("A title is required.")
    slug = slugify(payload.get("slug") or title)
    if not valid_slug(slug):
        raise Refused("A slug must be lowercase letters, numbers and hyphens.")
    discipline = (payload.get("discipline") or "").strip().lower() or None
    variant = (payload.get("variant") or "").strip().lower() or None
    if kind == "talent":
        if discipline not in DISCIPLINES:
            raise Refused("A talent needs a discipline of director, photographer or stylist.")
        variant = None
    else:
        if variant is None:
            variant = "left"
        if variant not in VARIANTS:
            raise Refused("A work needs a variant of left, right or centre.")
        discipline = None

    with db.connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT COALESCE(MAX(position), 0) + 1 AS p FROM items "
                "WHERE house_id = %s AND kind = %s",
                (house_id, kind),
            )
            position = cur.fetchone()["p"]
            try:
                cur.execute(
                    "INSERT INTO items (house_id, kind, slug, title, position, discipline, "
                    "variant, published, published_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE, NULL) RETURNING *",
                    (house_id, kind, slug, title, position, discipline, variant),
                )
                row = dict(cur.fetchone())
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                raise Refused("That slug is already used by another %s in this house." % kind, 409)
    return row


def update_item(house_id, item_id, payload):
    row = studio_item(house_id, item_id)
    fields, args = [], []
    if "title" in payload:
        title = (payload.get("title") or "").strip()
        if not title:
            raise Refused("A title is required.")
        fields.append("title = %s")
        args.append(title)
    if "discipline" in payload and row["kind"] == "talent":
        discipline = (payload.get("discipline") or "").strip().lower()
        if discipline not in DISCIPLINES:
            raise Refused("A talent needs a discipline of director, photographer or stylist.")
        fields.append("discipline = %s")
        args.append(discipline)
    if "variant" in payload and row["kind"] == "work":
        variant = (payload.get("variant") or "").strip().lower()
        if variant not in VARIANTS:
            raise Refused("A work needs a variant of left, right or centre.")
        fields.append("variant = %s")
        args.append(variant)
    if "position" in payload:
        try:
            fields.append("position = %s")
            args.append(int(payload["position"]))
        except (TypeError, ValueError):
            raise Refused("A position must be a whole number.")
    if not fields:
        return row
    args.extend([item_id, house_id])
    updated = db.query(
        "UPDATE items SET %s WHERE id = %%s AND house_id = %%s RETURNING *" % ", ".join(fields),
        tuple(args),
        one=True,
        commit=True,
    )
    if updated is None:
        raise NotFound()
    return updated


def set_published(house_id, item_id, published):
    row = studio_item(house_id, item_id)
    if published:
        posters = item_media(row["id"], "poster")
        if not posters:
            raise Refused("A record needs a poster with a written alternative before it is published.")
        if not (posters[0]["alt"] or "").strip():
            raise Refused("A poster needs a written alternative before this record is published.")
        updated = db.query(
            "UPDATE items SET published = TRUE, published_at = %s "
            "WHERE id = %s AND house_id = %s RETURNING *",
            (now_utc(), row["id"], house_id),
            one=True,
            commit=True,
        )
    else:
        updated = db.query(
            "UPDATE items SET published = FALSE, published_at = NULL "
            "WHERE id = %s AND house_id = %s RETURNING *",
            (row["id"], house_id),
            one=True,
            commit=True,
        )
    if updated is None:
        raise NotFound()
    return updated


def add_media(house_id, item_id, payload):
    row = studio_item(house_id, item_id)
    role = (payload.get("role") or "poster").strip().lower()
    if role not in MEDIA_ROLES:
        raise Refused("A media role must be poster, reel or gallery.")
    alt = (payload.get("alt") or "").strip()
    if not alt:
        raise Refused("A written alternative is required on every image.")
    try:
        width = int(payload.get("width") or 0)
        height = int(payload.get("height") or 0)
    except (TypeError, ValueError):
        raise Refused("Width and height must be whole numbers.")
    if width <= 0 or height <= 0:
        raise Refused("Width and height must be greater than zero.")
    seed = str(payload.get("seed") or mint_hex())[:120]
    position = payload.get("position")
    if position is None:
        got = db.query(
            "SELECT COALESCE(MAX(position), 0) + 1 AS p FROM media WHERE item_id = %s AND role = %s",
            (row["id"], role),
            one=True,
        )
        position = got["p"]
    media_id = mint_hex()
    created = db.query(
        "INSERT INTO media (id, item_id, role, position, seed, width, height, alt) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
        (media_id, row["id"], role, int(position), seed, width, height, alt),
        one=True,
        commit=True,
    )
    return created


def add_credit(house_id, item_id, payload):
    row = studio_item(house_id, item_id)
    if row["kind"] != "work":
        raise Refused("Credits belong to a work.")
    role = (payload.get("role") or "").strip()
    name = (payload.get("name") or "").strip()
    if not role or not name:
        raise Refused("A credit needs a role and a name.")
    talent_id = payload.get("talent_id")
    if talent_id in ("", None):
        talent_id = None
    else:
        try:
            talent_id = int(talent_id)
        except (TypeError, ValueError):
            raise Refused("That talent is not here.")
        talent = db.query(
            "SELECT id FROM items WHERE id = %s AND house_id = %s AND kind = 'talent'",
            (talent_id, house_id),
            one=True,
        )
        if talent is None:
            raise NotFound()
    got = db.query(
        "SELECT COALESCE(MAX(position), 0) + 1 AS p FROM credits WHERE item_id = %s",
        (row["id"],),
        one=True,
    )
    return db.query(
        "INSERT INTO credits (item_id, position, role, name, talent_item_id) "
        "VALUES (%s, %s, %s, %s, %s) RETURNING *",
        (row["id"], got["p"], role, name, talent_id),
        one=True,
        commit=True,
    )


def change_slug(house_id, item_id, new_slug):
    row = studio_item(house_id, item_id)
    slug = slugify(new_slug)
    if not valid_slug(slug):
        raise Refused("A slug must be lowercase letters, numbers and hyphens.")
    if slug == row["slug"].lower():
        return row
    old_slug = row["slug"]
    try:
        with db.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE items SET slug = %s WHERE id = %s AND house_id = %s",
                    (slug, row["id"], house_id),
                )
                cur.execute(
                    "INSERT INTO slug_redirects (house_id, kind, old_slug, item_id) "
                    "VALUES (%s, %s, %s, %s) ON CONFLICT (house_id, kind, old_slug) "
                    "DO UPDATE SET item_id = EXCLUDED.item_id",
                    (house_id, row["kind"], old_slug, row["id"]),
                )
                cur.execute(
                    "DELETE FROM slug_redirects WHERE house_id = %s AND kind = %s "
                    "AND lower(old_slug) = %s",
                    (house_id, row["kind"], slug),
                )
    except psycopg2.errors.UniqueViolation:
        raise Refused("That slug is already used by another %s in this house." % row["kind"], 409)
    return studio_item(house_id, item_id)


def reorder_works(house_id, ordered_ids):
    if not isinstance(ordered_ids, list) or not ordered_ids:
        raise Refused("An order needs a list of record identifiers.")
    try:
        ids = [int(i) for i in ordered_ids]
    except (TypeError, ValueError):
        raise NotFound()
    rows = db.query(
        "SELECT id FROM items WHERE house_id = %s AND kind = 'work'", (house_id,)
    )
    own = {r["id"] for r in rows}
    if not set(ids).issubset(own):
        raise NotFound()
    with db.connection() as conn:
        with conn.cursor() as cur:
            for position, item_id in enumerate(ids, start=1):
                cur.execute(
                    "UPDATE items SET position = %s WHERE id = %s AND house_id = %s",
                    (position, item_id, house_id),
                )
    return studio_items(house_id, "work")


def mint_preview_token(house_id, account_id, item_id):
    row = studio_item(house_id, item_id)
    token = mint_hex()
    expires = now_utc() + PREVIEW_TTL
    db.execute(
        "INSERT INTO preview_tokens (token, item_id, expires_at, created_by) "
        "VALUES (%s, %s, %s, %s)",
        (token, row["id"], expires, account_id),
    )
    return {"token": token, "expires_at": expires.isoformat(), "item_id": row["id"]}


def resolve_preview(token, account):
    """A preview resolves only for a producer of that record's own house."""
    if not re.fullmatch(r"[0-9a-f]{32}", token or ""):
        raise NotFound()
    if not account or account.get("role") != "producer" or not account.get("house_id"):
        raise NotFound()
    row = db.query(
        "SELECT p.*, i.house_id FROM preview_tokens p JOIN items i ON i.id = p.item_id "
        "WHERE p.token = %s",
        (token,),
        one=True,
    )
    if row is None or row["house_id"] != account["house_id"]:
        raise NotFound()
    expires = row["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < now_utc():
        raise NotFound()
    item = studio_item(account["house_id"], row["item_id"])
    return item


def preview_payload(item):
    """The full record, rendered through the published route's own shape."""
    house_id = item["house_id"]
    detail = item_json(item)
    detail["media"] = [media_row_json(m) for m in item_media(item["id"])]
    poster = poster_of(item["id"])
    reel = reel_of(item["id"])
    detail["poster"] = media_row_json(poster) if poster else None
    detail["reel"] = media_row_json(reel) if reel else None
    if item["kind"] == "work":
        detail["credits"] = credits_of(item["id"], house_id)
        detail["gallery"] = [media_row_json(m) for m in item_media(item["id"], "gallery")]
        published = published_items(house_id, "work")
        detail["ordinal"] = ordinal_string(len(published) + 1)
        detail["previous"] = None
        detail["next"] = None
    else:
        detail["selected_work"] = selected_work_of(item["id"], house_id)
    return detail
