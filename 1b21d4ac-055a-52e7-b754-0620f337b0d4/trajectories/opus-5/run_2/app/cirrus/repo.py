"""Reads and writes. Every derived value is computed here at read time and
never stored: the displayed ordinal, the discipline set, a talent's selected
work and a work's neighbours."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from .db import execute, hex32, query, query_one

DISCIPLINES = ("director", "photographer", "stylist")
VARIANTS = ("left", "right", "centre")
KINDS = ("work", "talent")
MEDIA_ROLES = ("poster", "reel", "gallery")


def served_house_slug() -> str:
    return os.environ.get("APP_HOUSE_SLUG", "cirrus")


def house_by_slug(slug: str):
    return query_one("SELECT * FROM houses WHERE slug = %s", (slug,))


def served_house():
    return house_by_slug(served_house_slug())


def ordinal(n: int) -> str:
    return f"{n:03d}"


# --------------------------------------------------------------------------
# media

def media_for(item_ids: list[int]) -> dict[int, list[dict]]:
    if not item_ids:
        return {}
    rows = query(
        "SELECT * FROM media WHERE item_id = ANY(%s) ORDER BY item_id, "
        "CASE role WHEN 'poster' THEN 0 WHEN 'reel' THEN 1 ELSE 2 END, position, created_at",
        (list(item_ids),),
    )
    out: dict[int, list[dict]] = {}
    for r in rows:
        out.setdefault(r["item_id"], []).append(r)
    return out


def media_public(row: dict) -> dict:
    return {
        "media_id": row["id"],
        "role": row["role"],
        "position": row["position"],
        "width": row["width"],
        "height": row["height"],
        "alt": row["alt"],
        "url": f"/api/media/{row['id']}",
    }


def _first(media: list[dict], role: str):
    for m in media:
        if m["role"] == role:
            return m
    return None


# --------------------------------------------------------------------------
# item shaping

def item_public(item: dict, media: list[dict], ordinal_number: int | None = None) -> dict:
    poster = _first(media, "poster")
    reel = _first(media, "reel")
    out = {
        "id": item["id"],
        "kind": item["kind"],
        "slug": item["slug"],
        "title": item["title"],
        "published": item["published"],
        "published_at": _iso(item.get("published_at")),
        "poster": media_public(poster) if poster else None,
        "reel": media_public(reel) if reel else None,
        "media": [media_public(m) for m in media],
    }
    if item["kind"] == "work":
        out["variant"] = item["variant"]
        out["ordinal"] = ordinal(ordinal_number) if ordinal_number else None
        out["ordinal_number"] = ordinal_number
    else:
        out["discipline"] = item["discipline"]
    return out


def _iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    return str(value)


# --------------------------------------------------------------------------
# public reads (published records of the served house only)

def published_items(house_id: int, kind: str) -> list[dict]:
    return query(
        "SELECT * FROM items WHERE house_id = %s AND kind = %s AND published = TRUE "
        "ORDER BY position, id",
        (house_id, kind),
    )


def public_works(house_id: int) -> list[dict]:
    items = published_items(house_id, "work")
    media = media_for([i["id"] for i in items])
    return [item_public(it, media.get(it["id"], []), n)
            for n, it in enumerate(items, start=1)]


def public_talents(house_id: int, discipline: str | None = None) -> list[dict]:
    items = published_items(house_id, "talent")
    if discipline:
        items = [i for i in items if i["discipline"] == discipline]
    media = media_for([i["id"] for i in items])
    return [talent_public(it, media.get(it["id"], []), house_id) for it in items]


def talent_public(item: dict, media: list[dict], house_id: int) -> dict:
    out = item_public(item, media)
    out["selected_work"] = selected_work(item["id"], house_id)
    return out


def disciplines(house_id: int) -> list[str]:
    """Derived from published talent in first appearance order, never authored."""
    rows = query(
        "SELECT discipline FROM items WHERE house_id = %s AND kind = 'talent' "
        "AND published = TRUE AND discipline IS NOT NULL ORDER BY position, id",
        (house_id,),
    )
    seen: list[str] = []
    for r in rows:
        if r["discipline"] not in seen:
            seen.append(r["discipline"])
    return seen


def selected_work(talent_item_id: int, house_id: int) -> list[dict]:
    """Read from credits, never stored on the talent. Published works only."""
    rows = query(
        """
        SELECT i.*, c.role AS credit_role
          FROM credits c
          JOIN items i ON i.id = c.item_id
         WHERE c.talent_item_id = %s AND i.house_id = %s
           AND i.kind = 'work' AND i.published = TRUE
         ORDER BY i.position, i.id
        """,
        (talent_item_id, house_id),
    )
    if not rows:
        return []
    order = {it["id"]: n for n, it in enumerate(published_items(house_id, "work"), start=1)}
    media = media_for([r["id"] for r in rows])
    out = []
    for r in rows:
        entry = item_public(r, media.get(r["id"], []), order.get(r["id"]))
        entry["credit_role"] = r["credit_role"]
        out.append(entry)
    return out


def credits_for(work_id: int, house_id: int) -> list[dict]:
    rows = query(
        "SELECT * FROM credits WHERE item_id = %s ORDER BY position, id", (work_id,)
    )
    talent_ids = [r["talent_item_id"] for r in rows if r["talent_item_id"]]
    linked = {}
    if talent_ids:
        for t in query(
            "SELECT id, slug, title, published, discipline FROM items "
            "WHERE id = ANY(%s) AND house_id = %s AND kind = 'talent'",
            (talent_ids, house_id),
        ):
            linked[t["id"]] = t
    out = []
    for r in rows:
        talent = linked.get(r["talent_item_id"]) if r["talent_item_id"] else None
        # only a published talent of this house becomes a link
        link = talent["slug"] if talent and talent["published"] else None
        out.append({
            "id": r["id"],
            "role": r["role"],
            "name": r["name"],
            "talent_id": r["talent_item_id"],
            "talent_slug": link,
        })
    return out


def work_detail(house_id: int, slug: str, *, published_only: bool = True):
    """One work with its media, credits and neighbours. Follows a redirect."""
    item, redirected = resolve_slug(house_id, "work", slug, published_only=published_only)
    if not item:
        return None, None
    media = media_for([item["id"]]).get(item["id"], [])
    order = published_items(house_id, "work")
    index = next((n for n, it in enumerate(order) if it["id"] == item["id"]), None)
    detail = item_public(item, media, (index + 1) if index is not None else None)
    detail["credits"] = credits_for(item["id"], house_id)
    detail["gallery"] = [media_public(m) for m in media if m["role"] == "gallery"]
    if index is not None and order:
        nxt = order[(index + 1) % len(order)]
        prv = order[(index - 1) % len(order)]
        n_ord = ((index + 1) % len(order)) + 1
        p_ord = ((index - 1) % len(order)) + 1
        detail["next"] = {"slug": nxt["slug"], "title": nxt["title"], "ordinal": ordinal(n_ord)}
        detail["previous"] = {"slug": prv["slug"], "title": prv["title"], "ordinal": ordinal(p_ord)}
    else:
        detail["next"] = None
        detail["previous"] = None
    return detail, redirected


def talent_detail(house_id: int, slug: str, *, published_only: bool = True):
    item, redirected = resolve_slug(house_id, "talent", slug, published_only=published_only)
    if not item:
        return None, None
    media = media_for([item["id"]]).get(item["id"], [])
    return talent_public(item, media, house_id), redirected


def resolve_slug(house_id: int, kind: str, slug: str, *, published_only: bool = True):
    """Returns (item, canonical_slug_if_redirected)."""
    slug = (slug or "").strip().lower()
    item = query_one(
        "SELECT * FROM items WHERE house_id = %s AND kind = %s AND lower(slug) = %s",
        (house_id, kind, slug),
    )
    if item:
        if published_only and not item["published"]:
            return None, None
        return item, None
    row = query_one(
        "SELECT item_id FROM slug_redirects WHERE house_id = %s AND kind = %s AND old_slug = %s",
        (house_id, kind, slug),
    )
    if not row:
        return None, None
    target = query_one("SELECT * FROM items WHERE id = %s", (row["item_id"],))
    if not target:
        return None, None
    if published_only and not target["published"]:
        return None, None
    return target, target["slug"]


# --------------------------------------------------------------------------
# studio reads and writes, always house scoped

def studio_items(house_id: int, kind: str | None = None) -> list[dict]:
    if kind:
        items = query(
            "SELECT * FROM items WHERE house_id = %s AND kind = %s ORDER BY kind, position, id",
            (house_id, kind),
        )
    else:
        items = query(
            "SELECT * FROM items WHERE house_id = %s ORDER BY kind, position, id",
            (house_id,),
        )
    media = media_for([i["id"] for i in items])
    order = {it["id"]: n for n, it in enumerate(published_items(house_id, "work"), start=1)}
    return [studio_item_shape(i, media.get(i["id"], []), order.get(i["id"])) for i in items]


def studio_item_shape(item: dict, media: list[dict], ordinal_number=None) -> dict:
    out = item_public(item, media, ordinal_number)
    out["house_id"] = item["house_id"]
    out["position"] = item["position"]
    out["variant"] = item["variant"]
    out["discipline"] = item["discipline"]
    out["created_at"] = _iso(item.get("created_at"))
    return out


def studio_item(house_id: int, item_id: int):
    """A record of another house is answered exactly as a missing one."""
    item = query_one(
        "SELECT * FROM items WHERE id = %s AND house_id = %s", (item_id, house_id)
    )
    if not item:
        return None
    media = media_for([item["id"]]).get(item["id"], [])
    order = {it["id"]: n for n, it in enumerate(published_items(house_id, "work"), start=1)}
    shape = studio_item_shape(item, media, order.get(item["id"]))
    if item["kind"] == "work":
        shape["credits"] = credits_for(item["id"], house_id)
    else:
        shape["selected_work"] = selected_work(item["id"], house_id)
    return shape


def item_row(house_id: int, item_id: int):
    return query_one(
        "SELECT * FROM items WHERE id = %s AND house_id = %s", (item_id, house_id)
    )


def next_position(house_id: int, kind: str) -> int:
    row = query_one(
        "SELECT COALESCE(MAX(position), -1) + 1 AS n FROM items WHERE house_id = %s AND kind = %s",
        (house_id, kind),
    )
    return int(row["n"])


def create_item(house_id: int, kind: str, slug: str, title: str,
                discipline: str | None, variant: str | None) -> dict:
    rows = execute(
        """
        INSERT INTO items (house_id, kind, slug, title, position, discipline, variant,
                           published, published_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE, NULL)
        RETURNING *
        """,
        (house_id, kind, slug, title, next_position(house_id, kind), discipline, variant),
    )
    return rows[0]


def create_media(item_id: int, role: str, seed: str, width: int, height: int,
                 alt: str) -> dict:
    row = query_one(
        "SELECT COALESCE(MAX(position), -1) + 1 AS n FROM media WHERE item_id = %s AND role = %s",
        (item_id, role),
    )
    rows = execute(
        """
        INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (hex32(), item_id, role, int(row["n"]), seed, width, height, alt),
    )
    return rows[0]


def mint_preview_token(item_id: int, account_id: int, minutes: int = 15) -> dict:
    expires = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    rows = execute(
        """
        INSERT INTO preview_tokens (token, item_id, expires_at, created_by)
        VALUES (%s, %s, %s, %s)
        RETURNING token, expires_at
        """,
        (hex32(), item_id, expires, account_id),
    )
    return rows[0]


def preview_token_row(token: str):
    if not token or len(token) != 32 or any(c not in "0123456789abcdef" for c in token):
        return None
    return query_one(
        """
        SELECT p.*, i.house_id, i.kind
          FROM preview_tokens p
          JOIN items i ON i.id = p.item_id
         WHERE p.token = %s AND p.expires_at > now()
        """,
        (token,),
    )


def media_row(media_id: str):
    if not media_id or len(media_id) != 32:
        return None
    return query_one(
        """
        SELECT m.*, i.house_id, i.published, i.kind
          FROM media m JOIN items i ON i.id = m.item_id
         WHERE m.id = %s
        """,
        (media_id,),
    )
