"""Reads and writes over the seven tables, with every derived value computed here."""
from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta, timezone

import psycopg

from . import db

PREVIEW_TTL = timedelta(minutes=15)
DISCIPLINES = ("director", "photographer", "stylist")
VARIANTS = ("left", "right", "centre")
KINDS = ("work", "talent")
MEDIA_ROLES = ("poster", "reel", "gallery")


class Conflict(Exception):
    """A slug that is already taken in this house and kind."""


class Invalid(Exception):
    """A body the store will not accept, with a reason a person can read."""


def now() -> datetime:
    return datetime.now(timezone.utc)


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def valid_slug(value: str) -> bool:
    return bool(value) and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value) is not None


# ---------------------------------------------------------------- houses

def house_by_slug(slug: str) -> dict | None:
    return db.query_one("SELECT * FROM houses WHERE slug = %s", (slug,))


def house_by_id(house_id: int) -> dict | None:
    return db.query_one("SELECT * FROM houses WHERE id = %s", (house_id,))


# ---------------------------------------------------------------- media

def media_for_items(item_ids: list[int]) -> dict[int, list[dict]]:
    if not item_ids:
        return {}
    rows = db.query(
        """SELECT * FROM media WHERE item_id = ANY(%s)
            ORDER BY item_id,
              CASE role WHEN 'poster' THEN 0 WHEN 'reel' THEN 1 ELSE 2 END,
              position, id""",
        (list(item_ids),),
    )
    out: dict[int, list[dict]] = {}
    for row in rows:
        out.setdefault(row["item_id"], []).append(row)
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


def poster_of(media: list[dict]) -> dict | None:
    for m in media:
        if m["role"] == "poster":
            return m
    return None


def reel_of(media: list[dict]) -> dict | None:
    for m in media:
        if m["role"] == "reel":
            return m
    return None


def media_row(media_id: str) -> dict | None:
    if not re.fullmatch(r"[0-9a-f]{32}", media_id or ""):
        return None
    return db.query_one(
        """SELECT m.*, i.house_id, i.published, i.kind
             FROM media m JOIN items i ON i.id = m.item_id
            WHERE m.id = %s""",
        (media_id,),
    )


# ---------------------------------------------------------------- items

def published_items(house_id: int, kind: str) -> list[dict]:
    return db.query(
        """SELECT * FROM items WHERE house_id=%s AND kind=%s AND published
            ORDER BY position, id""",
        (house_id, kind),
    )


def ordinal_string(index: int) -> str:
    return f"{index + 1:03d}"


def work_payload(item: dict, index: int, media: list[dict]) -> dict:
    poster = poster_of(media)
    reel = reel_of(media)
    return {
        "id": item["id"],
        "kind": "work",
        "slug": item["slug"],
        "title": item["title"],
        "variant": item["variant"],
        "ordinal": ordinal_string(index),
        "published": item["published"],
        "published_at": iso(item["published_at"]),
        "poster": media_public(poster) if poster else None,
        "reel": media_public(reel) if reel else None,
        "media": [media_public(m) for m in media],
        "href": f"/works/{item['slug']}",
    }


def talent_payload(item: dict, media: list[dict], selected_work: list[dict] | None = None) -> dict:
    poster = poster_of(media)
    reel = reel_of(media)
    return {
        "id": item["id"],
        "kind": "talent",
        "slug": item["slug"],
        "title": item["title"],
        "discipline": item["discipline"],
        "published": item["published"],
        "published_at": iso(item["published_at"]),
        "poster": media_public(poster) if poster else None,
        "reel": media_public(reel) if reel else None,
        "media": [media_public(m) for m in media],
        "selected_work": selected_work if selected_work is not None else [],
        "href": f"/talents/{item['slug']}",
    }


def iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value)


def list_works(house_id: int) -> list[dict]:
    items = published_items(house_id, "work")
    media = media_for_items([i["id"] for i in items])
    return [work_payload(item, idx, media.get(item["id"], [])) for idx, item in enumerate(items)]


def list_talents(house_id: int, discipline: str | None = None) -> list[dict]:
    items = published_items(house_id, "talent")
    if discipline:
        items = [i for i in items if (i["discipline"] or "") == discipline]
    media = media_for_items([i["id"] for i in items])
    return [talent_payload(i, media.get(i["id"], [])) for i in items]


def disciplines(house_id: int) -> list[str]:
    """Derived from published talent in first appearance order, never authored."""
    out: list[str] = []
    for item in published_items(house_id, "talent"):
        d = item["discipline"]
        if d and d not in out:
            out.append(d)
    return out


def resolve_slug(house_id: int, kind: str, slug: str) -> tuple[dict | None, str | None]:
    """Returns (item, redirect_to_slug). A redirect row serves its address permanently."""
    slug = (slug or "").lower()
    item = db.query_one(
        "SELECT * FROM items WHERE house_id=%s AND kind=%s AND lower(slug)=%s",
        (house_id, kind, slug),
    )
    if item:
        return item, None
    red = db.query_one(
        """SELECT i.* FROM slug_redirects r JOIN items i ON i.id = r.item_id
            WHERE r.house_id=%s AND r.kind=%s AND lower(r.old_slug)=%s""",
        (house_id, kind, slug),
    )
    if red:
        return red, red["slug"]
    return None, None


def work_detail(house_id: int, item: dict) -> dict:
    """One work with media, credits and its wrapping neighbours."""
    items = published_items(house_id, "work")
    ids = [i["id"] for i in items]
    index = ids.index(item["id"]) if item["id"] in ids else None
    media = media_for_items([item["id"]]).get(item["id"], [])
    payload = work_payload(item, index if index is not None else 0, media)
    payload["credits"] = credits_for(house_id, item["id"])
    if index is not None and len(items) > 0:
        nxt = items[(index + 1) % len(items)]
        prv = items[(index - 1) % len(items)]
        nmedia = media_for_items([nxt["id"], prv["id"]])
        payload["next"] = neighbour(nxt, ids.index(nxt["id"]))
        payload["previous"] = neighbour(prv, ids.index(prv["id"]))
    else:
        payload["next"] = None
        payload["previous"] = None
    return payload


def neighbour(item: dict, index: int) -> dict:
    return {
        "slug": item["slug"],
        "title": item["title"],
        "ordinal": ordinal_string(index),
        "href": f"/works/{item['slug']}",
    }


def credits_for(house_id: int, work_id: int) -> list[dict]:
    rows = db.query(
        """SELECT c.*, t.slug AS talent_slug, t.published AS talent_published,
                  t.house_id AS talent_house
             FROM credits c LEFT JOIN items t ON t.id = c.talent_item_id
            WHERE c.item_id = %s ORDER BY c.position, c.id""",
        (work_id,),
    )
    out = []
    for r in rows:
        linked = bool(
            r["talent_slug"] and r["talent_published"] and r["talent_house"] == house_id
        )
        out.append(
            {
                "id": r["id"],
                "role": r["role"],
                "name": r["name"],
                "talent_id": r["talent_item_id"],
                "talent_slug": r["talent_slug"] if linked else None,
                "href": f"/talents/{r['talent_slug']}" if linked else None,
            }
        )
    return out


def selected_work_for_talent(house_id: int, talent_id: int) -> list[dict]:
    """Read from credits, never stored on the talent."""
    items = published_items(house_id, "work")
    ids = [i["id"] for i in items]
    rows = db.query(
        """SELECT DISTINCT c.item_id FROM credits c
             JOIN items w ON w.id = c.item_id
            WHERE c.talent_item_id = %s AND w.house_id = %s AND w.published""",
        (talent_id, house_id),
    )
    credited = {r["item_id"] for r in rows}
    media = media_for_items([i for i in ids if i in credited])
    return [
        work_payload(item, idx, media.get(item["id"], []))
        for idx, item in enumerate(items)
        if item["id"] in credited
    ]


def talent_detail(house_id: int, item: dict) -> dict:
    media = media_for_items([item["id"]]).get(item["id"], [])
    return talent_payload(item, media, selected_work_for_talent(house_id, item["id"]))


def item_detail_any(house_id: int, item: dict) -> dict:
    """The full shape for a record whatever its published state, for studio and preview."""
    if item["kind"] == "work":
        payload = work_detail(house_id, item)
        if not item["published"]:
            payload["ordinal"] = None
        return payload
    return talent_detail(house_id, item)


# ---------------------------------------------------------------- studio writes

def studio_items(house_id: int, kind: str | None = None) -> list[dict]:
    sql = "SELECT * FROM items WHERE house_id=%s"
    params: list = [house_id]
    if kind:
        sql += " AND kind=%s"
        params.append(kind)
    sql += " ORDER BY kind, position, id"
    items = db.query(sql, tuple(params))
    media = media_for_items([i["id"] for i in items])
    ordinals = {}
    for k in ("work", "talent"):
        pub = [i for i in items if i["kind"] == k and i["published"]]
        pub.sort(key=lambda r: (r["position"], r["id"]))
        for idx, i in enumerate(pub):
            ordinals[i["id"]] = ordinal_string(idx)
    return [studio_payload(i, media.get(i["id"], []), ordinals.get(i["id"])) for i in items]


def studio_payload(item: dict, media: list[dict], ordinal: str | None = None) -> dict:
    poster = poster_of(media)
    poster_payload = None
    if poster:
        poster_payload = media_public(poster)
        poster_payload["seed"] = poster["seed"]
    return {
        "id": item["id"],
        "kind": item["kind"],
        "slug": item["slug"],
        "title": item["title"],
        "position": item["position"],
        "discipline": item["discipline"],
        "variant": item["variant"],
        "published": item["published"],
        "published_at": iso(item["published_at"]),
        "ordinal": ordinal if item["published"] else None,
        "poster": poster_payload,
        "media": [media_public(m) for m in media],
        "href": f"/works/{item['slug']}" if item["kind"] == "work" else f"/talents/{item['slug']}",
        "studio_href": f"/studio/items/{item['id']}",
    }


def owned_item(house_id: int, item_id) -> dict | None:
    """A foreign record answers exactly as a missing one: this returns None for both."""
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return None
    return db.query_one(
        "SELECT * FROM items WHERE id=%s AND house_id=%s", (item_id, house_id)
    )


def create_item(house_id: int, kind: str, slug: str, title: str,
                discipline: str | None, variant: str | None) -> dict:
    if kind not in KINDS:
        raise Invalid("Kind must be either work or talent.")
    title = (title or "").strip()
    if not title:
        raise Invalid("A title is required.")
    slug = slugify(slug or title)
    if not valid_slug(slug):
        raise Invalid("A slug must be lowercase letters, numbers and single hyphens.")
    if kind == "talent":
        discipline = (discipline or "").strip().lower() or None
        if discipline not in DISCIPLINES:
            raise Invalid("A talent needs a discipline of director, photographer or stylist.")
        variant = None
    else:
        variant = (variant or "").strip().lower() or "left"
        if variant not in VARIANTS:
            raise Invalid("A work needs a variant of left, right or centre.")
        discipline = None
    try:
        with db.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM items WHERE house_id=%s AND kind=%s",
                    (house_id, kind),
                )
                position = cur.fetchone()["p"]
                cur.execute(
                    """INSERT INTO items (house_id, kind, slug, title, position, discipline, variant,
                                          published, published_at)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,FALSE,NULL) RETURNING *""",
                    (house_id, kind, slug, title, position, discipline, variant),
                )
                return cur.fetchone()
    except psycopg.errors.UniqueViolation:
        # the database holds slug uniqueness; the loser of a race leaves no partial record
        raise Conflict(f"The slug '{slug}' is already used by another {kind} in this house.")


def update_item(house_id: int, item: dict, fields: dict) -> dict:
    sets, params = [], []
    if "title" in fields:
        title = (fields.get("title") or "").strip()
        if not title:
            raise Invalid("A title is required.")
        sets.append("title = %s")
        params.append(title)
    if "discipline" in fields and item["kind"] == "talent":
        d = (fields.get("discipline") or "").strip().lower()
        if d not in DISCIPLINES:
            raise Invalid("A talent needs a discipline of director, photographer or stylist.")
        sets.append("discipline = %s")
        params.append(d)
    if "variant" in fields and item["kind"] == "work":
        v = (fields.get("variant") or "").strip().lower()
        if v not in VARIANTS:
            raise Invalid("A work needs a variant of left, right or centre.")
        sets.append("variant = %s")
        params.append(v)
    if not sets:
        return item
    params.extend([item["id"], house_id])
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE items SET {', '.join(sets)} WHERE id=%s AND house_id=%s RETURNING *",
                tuple(params),
            )
            return cur.fetchone()


def set_published(house_id: int, item: dict, published: bool) -> dict:
    if published:
        media = media_for_items([item["id"]]).get(item["id"], [])
        poster = poster_of(media)
        if poster is None or not (poster["alt"] or "").strip():
            raise Invalid(
                "This record cannot be published: its poster needs a written alternative."
            )
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE items SET published=%s,
                        published_at = CASE WHEN %s THEN COALESCE(published_at, now()) ELSE NULL END
                    WHERE id=%s AND house_id=%s RETURNING *""",
                (published, published, item["id"], house_id),
            )
            return cur.fetchone()


def add_media(house_id: int, item: dict, role: str, seed: str, width, height, alt: str) -> dict:
    role = (role or "poster").strip().lower()
    if role not in MEDIA_ROLES:
        raise Invalid("A media role is poster, reel or gallery.")
    try:
        width, height = int(width), int(height)
    except (TypeError, ValueError):
        raise Invalid("Media needs a numeric width and height.")
    if width <= 0 or height <= 0 or width > 8000 or height > 8000:
        raise Invalid("Media width and height must be between 1 and 8000.")
    alt = (alt or "").strip()
    if role == "poster" and not alt:
        raise Invalid("A poster needs a written alternative.")
    seed = (seed or secrets.token_hex(4)).strip()[:120]
    media_id = secrets.token_hex(16)
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM media WHERE item_id=%s AND role=%s",
                (item["id"], role),
            )
            position = cur.fetchone()["p"]
            cur.execute(
                """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
                (media_id, item["id"], role, position, seed, width, height, alt),
            )
            return cur.fetchone()


def add_credit(house_id: int, item: dict, role: str, name: str, talent_id) -> dict:
    if item["kind"] != "work":
        raise Invalid("Credits belong to a work.")
    role = (role or "").strip()
    name = (name or "").strip()
    if not role or not name:
        raise Invalid("A credit needs a role and a name.")
    talent_item_id = None
    if talent_id not in (None, "", "null"):
        talent = owned_item(house_id, talent_id)
        if not talent or talent["kind"] != "talent":
            raise Invalid("That talent is not a record of this house.")
        talent_item_id = talent["id"]
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM credits WHERE item_id=%s",
                (item["id"],),
            )
            position = cur.fetchone()["p"]
            cur.execute(
                """INSERT INTO credits (item_id, position, role, name, talent_item_id)
                   VALUES (%s,%s,%s,%s,%s) RETURNING *""",
                (item["id"], position, role, name, talent_item_id),
            )
            return cur.fetchone()


def change_slug(house_id: int, item: dict, new_slug: str) -> dict:
    new_slug = slugify(new_slug)
    if not valid_slug(new_slug):
        raise Invalid("A slug must be lowercase letters, numbers and single hyphens.")
    if new_slug == item["slug"]:
        return item
    old_slug = item["slug"]
    try:
        with db.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE items SET slug=%s WHERE id=%s AND house_id=%s RETURNING *",
                    (new_slug, item["id"], house_id),
                )
                updated = cur.fetchone()
                cur.execute(
                    """INSERT INTO slug_redirects (house_id, kind, old_slug, item_id)
                       VALUES (%s,%s,%s,%s)
                       ON CONFLICT (house_id, kind, old_slug)
                       DO UPDATE SET item_id = EXCLUDED.item_id""",
                    (house_id, item["kind"], old_slug, item["id"]),
                )
                # a redirect standing at the new address would shadow the record
                cur.execute(
                    "DELETE FROM slug_redirects WHERE house_id=%s AND kind=%s AND lower(old_slug)=%s",
                    (house_id, item["kind"], new_slug),
                )
                return updated
    except psycopg.errors.UniqueViolation:
        raise Conflict(f"The slug '{new_slug}' is already used by another {item['kind']}.")


def reorder_works(house_id: int, ordered_ids: list) -> list[dict]:
    if not isinstance(ordered_ids, list) or not ordered_ids:
        raise Invalid("Send the ordered ids of this house's works.")
    try:
        ids = [int(i) for i in ordered_ids]
    except (TypeError, ValueError):
        raise Invalid("Send the ordered ids of this house's works.")
    rows = db.query(
        "SELECT id FROM items WHERE house_id=%s AND kind='work'", (house_id,)
    )
    owned = {r["id"] for r in rows}
    if set(ids) - owned:
        return []  # a foreign or missing id answers as not found, upstream
    with db.connection() as conn:
        with conn.cursor() as cur:
            for position, item_id in enumerate(ids):
                cur.execute(
                    "UPDATE items SET position=%s WHERE id=%s AND house_id=%s",
                    (position, item_id, house_id),
                )
    return studio_items(house_id, "work")


def mint_preview_token(house_id: int, item: dict, account_id: int) -> dict:
    token = secrets.token_hex(16)
    expires = now() + PREVIEW_TTL
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO preview_tokens (token, item_id, expires_at, created_by)
                   VALUES (%s,%s,%s,%s) RETURNING token, expires_at""",
                (token, item["id"], expires, account_id),
            )
            row = cur.fetchone()
    return {"token": row["token"], "expires_at": iso(row["expires_at"]),
            "preview_url": f"/preview/{row['token']}"}


def preview_item(token: str, house_id: int) -> dict | None:
    """Scoped to one record and to that record's house; expired tokens resolve to nothing."""
    if not token or len(token) != 32 or not re.fullmatch(r"[0-9a-f]{32}", token):
        return None
    return db.query_one(
        """SELECT i.* FROM preview_tokens p JOIN items i ON i.id = p.item_id
            WHERE p.token=%s AND p.expires_at > now() AND i.house_id=%s""",
        (token, house_id),
    )
