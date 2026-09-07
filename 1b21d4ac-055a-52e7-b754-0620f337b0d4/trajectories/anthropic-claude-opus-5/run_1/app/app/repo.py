"""Reads and writes over the seven tables.

The four derived values -- a work's displayed ordinal, the roster's discipline
set, a talent's selected work and a work's neighbours -- are computed here at
read time and are never stored.
"""
import re
import secrets
from datetime import datetime, timedelta, timezone

from . import config, db

DISCIPLINES = ("director", "photographer", "stylist")
VARIANTS = ("left", "right", "centre")
KINDS = ("work", "talent")
MEDIA_ROLES = ("poster", "reel", "gallery")


def utcnow():
    return datetime.now(timezone.utc)


def hex_token() -> str:
    return secrets.token_hex(16)  # 32 lowercase hex characters


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return re.sub(r"-{2,}", "-", value).strip("-")


def is_valid_slug(value: str) -> bool:
    return bool(value) and bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value))


def house_by_slug(slug):
    return db.query_one("SELECT * FROM houses WHERE slug = %s", (slug,))


def served_house():
    return house_by_slug(config.HOUSE_SLUG)


# --------------------------------------------------------------------------
# media
# --------------------------------------------------------------------------

def media_for_items(item_ids):
    if not item_ids:
        return {}
    rows = db.query(
        "SELECT * FROM media WHERE item_id = ANY(%s) ORDER BY item_id, "
        "CASE role WHEN 'poster' THEN 0 WHEN 'reel' THEN 1 ELSE 2 END, position, id",
        (list(item_ids),),
    )
    out = {}
    for r in rows:
        out.setdefault(r["item_id"], []).append(media_public(r))
    return out


def media_public(row):
    return {
        "media_id": row["id"],
        "role": row["role"],
        "position": row["position"],
        "width": row["width"],
        "height": row["height"],
        "alt": row["alt"],
        "url": "/api/media/" + row["id"],
    }


def poster_of(media_list):
    for m in media_list or []:
        if m["role"] == "poster":
            return m
    return None


def reel_of(media_list):
    for m in media_list or []:
        if m["role"] == "reel":
            return m
    return None


# --------------------------------------------------------------------------
# items
# --------------------------------------------------------------------------

def published_items(house_id, kind):
    return db.query(
        "SELECT * FROM items WHERE house_id = %s AND kind = %s AND published "
        "ORDER BY position, id",
        (house_id, kind),
    )


def ordinal_label(index_zero_based: int) -> str:
    """Contiguous from 001 by construction: the record's place in the published set."""
    return str(index_zero_based + 1).zfill(3)


def works_list(house_id):
    rows = published_items(house_id, "work")
    media = media_for_items([r["id"] for r in rows])
    out = []
    for i, r in enumerate(rows):
        out.append(work_summary(r, i, media.get(r["id"], [])))
    return out


def work_summary(row, index, media_list):
    poster = poster_of(media_list)
    return {
        "id": row["id"],
        "kind": "work",
        "slug": row["slug"],
        "title": row["title"],
        "variant": row["variant"] or "left",
        "ordinal": ordinal_label(index),
        "published": row["published"],
        "published_at": iso(row["published_at"]),
        "poster": poster,
        "url": "/works/" + row["slug"],
    }


def talent_summary(row, media_list):
    poster = poster_of(media_list)
    return {
        "id": row["id"],
        "kind": "talent",
        "slug": row["slug"],
        "title": row["title"],
        "name": row["title"],
        "discipline": row["discipline"],
        "published": row["published"],
        "published_at": iso(row["published_at"]),
        "poster": poster,
        "url": "/talents/" + row["slug"],
    }


def talents_list(house_id, discipline=None):
    rows = published_items(house_id, "talent")
    if discipline:
        rows = [r for r in rows if (r["discipline"] or "") == discipline]
    media = media_for_items([r["id"] for r in rows])
    return [talent_summary(r, media.get(r["id"], [])) for r in rows]


def disciplines(house_id):
    """Derived from published talent in first appearance order, never authored."""
    rows = published_items(house_id, "talent")
    seen = []
    for r in rows:
        d = r["discipline"]
        if d and d not in seen:
            seen.append(d)
    return seen


def iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value)


def credits_for(item_id, house_id):
    rows = db.query(
        "SELECT c.*, t.slug AS talent_slug, t.published AS talent_published, "
        "       t.house_id AS talent_house_id "
        "FROM credits c LEFT JOIN items t ON t.id = c.talent_item_id "
        "WHERE c.item_id = %s ORDER BY c.position, c.id",
        (item_id,),
    )
    out = []
    for r in rows:
        linked = bool(
            r["talent_slug"] and r["talent_published"] and r["talent_house_id"] == house_id
        )
        out.append({
            "id": r["id"],
            "role": r["role"],
            "name": r["name"],
            "talent_id": r["talent_item_id"],
            # A name that matches a published talent links to that talent's route.
            "talent_slug": r["talent_slug"] if linked else None,
            "talent_url": ("/talents/" + r["talent_slug"]) if linked else None,
        })
    return out


def selected_work_for_talent(talent_id, house_id):
    """Read from credits, never stored on the talent, and published works only."""
    rows = db.query(
        """SELECT w.* FROM credits c
             JOIN items w ON w.id = c.item_id
            WHERE c.talent_item_id = %s AND w.house_id = %s AND w.kind = 'work'
              AND w.published
            GROUP BY w.id
            ORDER BY w.position, w.id""",
        (talent_id, house_id),
    )
    order = {r["id"]: i for i, r in enumerate(published_items(house_id, "work"))}
    media = media_for_items([r["id"] for r in rows])
    out = []
    for r in rows:
        idx = order.get(r["id"], 0)
        out.append(work_summary(r, idx, media.get(r["id"], [])))
    return out


def neighbours(house_id, work_row):
    """Follow the ordinal and wrap at both ends."""
    rows = published_items(house_id, "work")
    ids = [r["id"] for r in rows]
    if work_row["id"] not in ids or len(rows) < 2:
        return None, None
    i = ids.index(work_row["id"])
    prev_row = rows[(i - 1) % len(rows)]
    next_row = rows[(i + 1) % len(rows)]

    def brief(row):
        j = ids.index(row["id"])
        return {
            "slug": row["slug"],
            "title": row["title"],
            "ordinal": ordinal_label(j),
            "url": "/works/" + row["slug"],
        }

    return brief(prev_row), brief(next_row)


def resolve_slug(house_id, kind, slug):
    """Return (item_row, redirect_to_slug_or_None). A renamed slug serves forever."""
    row = db.query_one(
        "SELECT * FROM items WHERE house_id = %s AND kind = %s AND lower(slug) = lower(%s)",
        (house_id, kind, slug),
    )
    if row:
        return row, None
    red = db.query_one(
        """SELECT i.* FROM slug_redirects r JOIN items i ON i.id = r.item_id
            WHERE r.house_id = %s AND r.kind = %s AND lower(r.old_slug) = lower(%s)""",
        (house_id, kind, slug),
    )
    if red:
        return red, red["slug"]
    return None, None


def work_detail(house_id, row):
    rows = published_items(house_id, "work")
    ids = [r["id"] for r in rows]
    index = ids.index(row["id"]) if row["id"] in ids else 0
    media = media_for_items([row["id"]]).get(row["id"], [])
    prev_w, next_w = neighbours(house_id, row)
    data = work_summary(row, index, media)
    data.update({
        "media": media,
        "reel": reel_of(media),
        "gallery": [m for m in media if m["role"] == "gallery"],
        "credits": credits_for(row["id"], house_id),
        "prev": prev_w,
        "next": next_w,
    })
    return data


def talent_detail(house_id, row):
    media = media_for_items([row["id"]]).get(row["id"], [])
    data = talent_summary(row, media)
    data.update({
        "media": media,
        "reel": reel_of(media),
        "gallery": [m for m in media if m["role"] == "gallery"],
        "selected_work": selected_work_for_talent(row["id"], house_id),
    })
    return data


def item_detail(house_id, row):
    if row["kind"] == "work":
        return work_detail(house_id, row)
    return talent_detail(house_id, row)


# --------------------------------------------------------------------------
# studio-side reads and writes (always house scoped by the caller)
# --------------------------------------------------------------------------

def studio_item(house_id, item_id):
    """A record of another house is answered exactly as a record that does not exist."""
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return None
    return db.query_one(
        "SELECT * FROM items WHERE id = %s AND house_id = %s", (item_id, house_id)
    )


def studio_item_public(row):
    media = media_for_items([row["id"]]).get(row["id"], [])
    return {
        "id": row["id"],
        "kind": row["kind"],
        "slug": row["slug"],
        "title": row["title"],
        "position": row["position"],
        "discipline": row["discipline"],
        "variant": row["variant"],
        "published": row["published"],
        "published_at": iso(row["published_at"]),
        "created_at": iso(row["created_at"]),
        "media": media,
        "poster": poster_of(media),
        "credits": credits_for(row["id"], row["house_id"]),
        "url": ("/works/" if row["kind"] == "work" else "/talents/") + row["slug"],
    }


def studio_items(house_id, kind=None):
    if kind:
        rows = db.query(
            "SELECT * FROM items WHERE house_id = %s AND kind = %s ORDER BY kind, position, id",
            (house_id, kind),
        )
    else:
        rows = db.query(
            "SELECT * FROM items WHERE house_id = %s ORDER BY kind, position, id",
            (house_id,),
        )
    return [studio_item_public(r) for r in rows]


def mint_preview_token(item_id, account_id):
    token = hex_token()
    expires = utcnow() + timedelta(seconds=config.PREVIEW_TTL_SECONDS)
    with db.write() as cur:
        cur.execute(
            "INSERT INTO preview_tokens (token, item_id, expires_at, created_by) "
            "VALUES (%s, %s, %s, %s) RETURNING token, expires_at",
            (token, item_id, expires, account_id),
        )
        row = cur.fetchone()
    return {"token": row["token"], "expires_at": iso(row["expires_at"]),
            "url": "/preview/" + row["token"]}


def preview_row(token):
    if not token or not re.fullmatch(r"[0-9a-f]{32}", token or ""):
        return None
    return db.query_one(
        """SELECT p.*, i.house_id, i.kind FROM preview_tokens p
             JOIN items i ON i.id = p.item_id
            WHERE p.token = %s AND p.expires_at > now()""",
        (token,),
    )
