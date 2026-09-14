"""Read and write models over the seven tables.

Everything a visitor reads is derived here: ordinals, the discipline set, a
talent's selected work and a work's neighbours are computed at read time and
never stored. Everything a producer touches is scoped by house here, so a
foreign record answers exactly as a missing one.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any, Iterable

import psycopg.errors

from .db import Database, new_hex_token, utcnow

UniqueViolation = psycopg.errors.UniqueViolation


WORK_SORT = "position, created_at"
KINDS = ("work", "talent")
DISCIPLINES = ("director", "photographer", "stylist")
VARIANTS = ("left", "right", "centre")


class NotFound(Exception):
    """A record that does not exist -- or does not exist for this caller."""


class Conflict(Exception):
    """A write that cannot land, with a reason a person can read."""


class BadRequest(Exception):
    pass


# ------------------------------------------------------------------- helpers

def _slugify(value: str) -> str:
    import re
    import unicodedata

    value = unicodedata.normalize("NFKD", value or "")
    value = value.encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value


def _iso(dt):
    return dt.isoformat() if dt else None


def _ordinal(index: int) -> str:
    return f"{index + 1:03d}"


# -------------------------------------------------------------------- public

def public_works(db: Database, house_id: str) -> list[dict[str, Any]]:
    """Published works of one house in stored order, with derived ordinals."""
    rows = db.all(
        f"""SELECT id, slug, title, variant, published_at
            FROM items
            WHERE house_id = %s AND kind = 'work' AND published
            ORDER BY {WORK_SORT}""",
        (house_id,),
    )
    out = []
    for i, r in enumerate(rows):
        out.append(
            {
                "id": r["id"],
                "slug": r["slug"],
                "title": r["title"],
                "variant": r["variant"],
                "ordinal": _ordinal(i),
                "published_at": _iso(r["published_at"]),
                "poster": _poster(db, r["id"]),
            }
        )
    return out


def _poster(db: Database, item_id: str) -> dict | None:
    r = db.one(
        """SELECT id, seed, width, height, alt, role FROM media
           WHERE item_id = %s
           ORDER BY (role = 'poster') DESC, position, created_at LIMIT 1""",
        (item_id,),
    )
    if not r:
        return None
    return _media_dict(r)



def _media_dict(r) -> dict:
    return {
        "id": r["id"],
        "role": r["role"],
        "seed": r["seed"],
        "width": r["width"],
        "height": r["height"],
        "alt": r["alt"],
        "url": f"/api/media/{r['id']}",
    }


def _media_for(db: Database, item_id: str) -> list[dict]:
    rows = db.all(
        """SELECT id, role, seed, width, height, alt FROM media
           WHERE item_id = %s ORDER BY position, created_at""",
        (item_id,),
    )
    return [_media_dict(r) for r in rows]


def _credits_for(db: Database, house_id: str, item_id: str) -> list[dict]:
    rows = db.all(
        """SELECT c.id, c.position, c.role, c.name, c.talent_item_id,
                  t.slug AS talent_slug, t.title AS talent_title, t.published AS talent_published
           FROM credits c
           LEFT JOIN items t ON t.id = c.talent_item_id AND t.house_id = %s
           WHERE c.item_id = %s
           ORDER BY c.position, c.created_at""",
        (house_id, item_id),
    )
    out = []
    for r in rows:
        credit = {
            "id": r["id"],
            "position": r["position"],
            "role": r["role"],
            "name": r["name"],
            "talent_id": r["talent_item_id"],
        }
        if r["talent_slug"] and r["talent_published"]:
            credit["talent"] = {"slug": r["talent_slug"], "title": r["talent_title"]}
        else:
            credit["talent"] = None
        out.append(credit)
    return out


def _published_slugs(db: Database, house_id: str, kind: str) -> list[str]:
    return [
        r["slug"]
        for r in db.all(
            f"""SELECT slug FROM items
                WHERE house_id = %s AND kind = %s AND published
                ORDER BY {WORK_SORT}""",
            (house_id, kind),
        )
    ]


def public_work(db: Database, house_id: str, slug: str) -> dict | None:
    """One published work with media, credits and derived neighbours."""
    r = db.one(
        """SELECT id, slug, title, variant, published, published_at
           FROM items
           WHERE house_id = %s AND kind = 'work' AND slug = %s""",
        (house_id, slug),
    )
    if not r or not r["published"]:
        return None
    slugs = _published_slugs(db, house_id, "work")
    index = slugs.index(slug)
    neighbours = _neighbours(db, house_id, "work", slugs, index)
    return {
        "id": r["id"],
        "kind": "work",
        "slug": r["slug"],
        "title": r["title"],
        "variant": r["variant"],
        "ordinal": _ordinal(index),
        "published_at": _iso(r["published_at"]),
        "media": _media_for(db, r["id"]),
        "credits": _credits_for(db, house_id, r["id"]),
        "next": neighbours[0],
        "previous": neighbours[1],
    }


def _neighbours(db: Database, house_id: str, kind: str, slugs: list[str],
                index: int) -> tuple[dict, dict]:
    """Next and previous by ordinal, wrapping at both ends."""
    def at(i: int) -> dict:
        slug = slugs[i % len(slugs)]
        row = db.one(
            """SELECT slug, title FROM items
               WHERE house_id = %s AND kind = %s AND slug = %s""",
            (house_id, kind, slug),
        )
        return {"slug": row["slug"], "title": row["title"], "ordinal": _ordinal(i % len(slugs))}

    return at(index + 1), at(index - 1)


def public_talents(db: Database, house_id: str, discipline: str | None = None) -> list[dict]:
    sql = f"""SELECT id, slug, title, discipline, published_at
              FROM items
              WHERE house_id = %s AND kind = 'talent' AND published"""
    params: list[Any] = [house_id]
    if discipline:
        sql += " AND discipline = %s"
        params.append(discipline)
    sql += f" ORDER BY {WORK_SORT}"
    rows = db.all(sql, tuple(params))
    out = []
    for i, r in enumerate(rows):
        out.append(
            {
                "id": r["id"],
                "slug": r["slug"],
                "title": r["title"],
                "discipline": r["discipline"],
                "ordinal": _ordinal(i),
                "published_at": _iso(r["published_at"]),
                "poster": _poster(db, r["id"]),
            }
        )
    return out


def public_talent(db: Database, house_id: str, slug: str) -> dict | None:
    r = db.one(
        """SELECT id, slug, title, discipline, published, published_at
           FROM items
           WHERE house_id = %s AND kind = 'talent' AND slug = %s""",
        (house_id, slug),
    )
    if not r or not r["published"]:
        return None
    # selected work is read from credits, never stored on the talent
    works = db.all(
        """SELECT w.id, w.slug, w.title, w.variant, w.published_at, w.position, w.created_at
           FROM credits c
           JOIN items w ON w.id = c.item_id
           WHERE c.talent_item_id = %s AND w.house_id = %s
             AND w.kind = 'work' AND w.published
           ORDER BY w.position, w.created_at""",
        (r["id"], house_id),
    )

    selected = []
    published_all = _published_slugs(db, house_id, "work")
    for w in works:
        ordinal = (_ordinal(published_all.index(w["slug"]))
                   if w["slug"] in published_all else None)
        selected.append(
            {
                "slug": w["slug"],
                "title": w["title"],
                "variant": w["variant"],
                "ordinal": ordinal,
                "poster": _poster(db, w["id"]),
            }
        )
    return {
        "id": r["id"],
        "kind": "talent",
        "slug": r["slug"],
        "title": r["title"],
        "discipline": r["discipline"],
        "published_at": _iso(r["published_at"]),
        "media": _media_for(db, r["id"]),
        "selected_work": selected,
    }


def derived_disciplines(db: Database, house_id: str) -> list[str]:
    """The discipline set from published talent, in first appearance order."""
    return [
        r["discipline"]
        for r in db.all(
            """SELECT discipline, MIN(position) AS first_pos, MIN(created_at) AS first_at
               FROM items
               WHERE house_id = %s AND kind = 'talent' AND published
                 AND discipline IS NOT NULL
               GROUP BY discipline
               ORDER BY first_pos, first_at""",
            (house_id,),
        )
        if r["discipline"]
    ]



def redirect_target(db: Database, house_id: str, kind: str, slug: str) -> dict | None:
    r = db.one(
        """SELECT i.slug, i.published
           FROM slug_redirects s JOIN items i ON i.id = s.item_id
           WHERE s.house_id = %s AND s.kind = %s AND lower(s.old_slug) = lower(%s)""",
        (house_id, kind, slug),
    )
    if not r or not r["published"]:
        return None
    return {"slug": r["slug"]}


# -------------------------------------------------------------- studio reads

def studio_items(db: Database, house_id: str, kind: str | None = None) -> list[dict]:
    sql = """SELECT id, kind, slug, title, position, discipline, variant,
                    published, published_at, created_at
             FROM items WHERE house_id = %s"""
    params: list[Any] = [house_id]
    if kind:
        sql += " AND kind = %s"
        params.append(kind)
    sql += f" ORDER BY kind, {WORK_SORT}"
    rows = db.all(sql, tuple(params))
    out = []
    ordinals = {
        "work": _published_slugs(db, house_id, "work"),
        "talent": _published_slugs(db, house_id, "talent"),
    }
    for r in rows:
        d = dict(r)
        d["published_at"] = _iso(r["published_at"])
        d["created_at"] = _iso(r["created_at"])
        if r["published"] and r["slug"] in ordinals[r["kind"]]:
            d["ordinal"] = _ordinal(ordinals[r["kind"]].index(r["slug"]))
        else:
            d["ordinal"] = None
        d["poster"] = _poster(db, r["id"])
        out.append(d)
    return out


def studio_item(db: Database, house_id: str, item_id: str) -> dict:
    """One record of the caller's own house; anything else is not found."""
    r = db.one(
        """SELECT id, kind, slug, title, position, discipline, variant,
                  published, published_at, created_at
           FROM items WHERE id = %s AND house_id = %s""",
        (item_id, house_id),
    )
    if not r:
        raise NotFound()
    ordinals = _published_slugs(db, house_id, r["kind"])
    ordinal = (_ordinal(ordinals.index(r["slug"]))
               if r["published"] and r["slug"] in ordinals else None)
    return {
        "id": r["id"],
        "kind": r["kind"],
        "slug": r["slug"],
        "title": r["title"],
        "position": r["position"],
        "discipline": r["discipline"],
        "variant": r["variant"],
        "published": r["published"],
        "published_at": _iso(r["published_at"]),
        "created_at": _iso(r["created_at"]),
        "ordinal": ordinal,
        "media": _media_for(db, r["id"]),
        "credits": _credits_for(db, house_id, r["id"]),
    }


# ------------------------------------------------------------ studio writes

def create_item(db: Database, house_id: str, payload: dict) -> dict:
    kind = (payload.get("kind") or "").strip()
    if kind not in KINDS:
        raise BadRequest("kind must be 'work' or 'talent'")
    title = (payload.get("title") or "").strip()
    if not title:
        raise BadRequest("a title is required")
    slug = _slugify(payload.get("slug") or title)
    if not slug:
        raise BadRequest("a slug is required")
    discipline = payload.get("discipline") or None
    variant = payload.get("variant") or None
    if kind == "talent":
        if discipline not in DISCIPLINES:
            raise BadRequest("a talent needs a discipline of director, photographer or stylist")
    else:
        variant = variant or "left"
        if variant not in VARIANTS:
            raise BadRequest("variant must be left, right or centre")
    row = db.one(
        """SELECT coalesce(max(position), 0) + 1 AS next FROM items
           WHERE house_id = %s AND kind = %s""",
        (house_id, kind),
    )
    with db.tx() as c:
        try:
            r = c.execute(
                """INSERT INTO items (house_id, kind, slug, title, position,
                                      discipline, variant, published, published_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,FALSE,NULL) RETURNING id""",
                (house_id, kind, slug, title, row["next"], discipline, variant),
            ).fetchone()
        except UniqueViolation:
            # the database held the uniqueness, so the loser leaves nothing
            raise Conflict(f"the slug '{slug}' is already used by another {kind} in this house")
    return studio_item(db, house_id, r["id"])



def update_item(db: Database, house_id: str, item_id: str, payload: dict) -> dict:
    current = studio_item(db, house_id, item_id)  # raises NotFound for foreign
    fields: list[str] = []
    params: list[Any] = []
    if "title" in payload:
        title = (payload["title"] or "").strip()
        if not title:
            raise BadRequest("a title is required")
        fields.append("title = %s")
        params.append(title)
    if "discipline" in payload and current["kind"] == "talent":
        if payload["discipline"] not in DISCIPLINES:
            raise BadRequest("a talent needs a discipline of director, photographer or stylist")
        fields.append("discipline = %s")
        params.append(payload["discipline"])
    if "variant" in payload and current["kind"] == "work":
        if payload["variant"] not in VARIANTS:
            raise BadRequest("variant must be left, right or centre")
        fields.append("variant = %s")
        params.append(payload["variant"])
    if fields:
        params.append(item_id)
        db.run(f"UPDATE items SET {', '.join(fields)} WHERE id = %s", tuple(params))
    return studio_item(db, house_id, item_id)


def rename_slug(db: Database, house_id: str, item_id: str, new_slug: str) -> dict:
    current = studio_item(db, house_id, item_id)
    new_slug = _slugify(new_slug or "")
    if not new_slug:
        raise BadRequest("a slug is required")
    if new_slug == current["slug"]:
        return current
    with db.tx() as c:
        try:
            c.execute(
                "UPDATE items SET slug = %s WHERE id = %s AND house_id = %s",
                (new_slug, item_id, house_id),
            )
        except UniqueViolation:
            raise Conflict(f"the slug '{new_slug}' is already used in this house")
        # the old address redirects forever
        c.execute(
            """INSERT INTO slug_redirects (house_id, kind, old_slug, item_id)
               VALUES (%s,%s,%s,%s)
               ON CONFLICT (house_id, kind, lower(old_slug)) DO UPDATE
                 SET item_id = EXCLUDED.item_id""",
            (house_id, current["kind"], current["slug"], item_id),
        )
    return studio_item(db, house_id, item_id)



def set_published(db: Database, house_id: str, item_id: str, published: bool) -> dict:
    item = studio_item(db, house_id, item_id)
    if published:
        poster = _poster(db, item_id)
        if poster is None or not (poster.get("alt") or "").strip():
            raise BadRequest("a record needs a poster with a written alternative before it can be published")
        db.run(
            "UPDATE items SET published = TRUE, published_at = %s WHERE id = %s",
            (utcnow(), item_id),
        )
    else:
        db.run(
            "UPDATE items SET published = FALSE, published_at = NULL WHERE id = %s",
            (item_id,),
        )
    return studio_item(db, house_id, item_id)


def add_media(db: Database, house_id: str, item_id: str, payload: dict) -> dict:
    studio_item(db, house_id, item_id)  # ownership check
    role = (payload.get("role") or "").strip()
    if role not in ("poster", "reel", "gallery"):
        raise BadRequest("role must be poster, reel or gallery")
    try:
        width = int(payload.get("width") or 0)
        height = int(payload.get("height") or 0)
    except (TypeError, ValueError):
        raise BadRequest("width and height must be numbers")
    if width <= 0 or height <= 0 or width > 4096 or height > 4096:
        raise BadRequest("width and height must be between 1 and 4096")
    seed = (payload.get("seed") or "").strip()
    if not seed:
        seed = new_hex_token()
    alt = (payload.get("alt") or "").strip()
    if role == "poster" and not alt:
        raise BadRequest("a poster needs a written alternative")
    mid = new_hex_token()
    pos = db.one(
        """SELECT coalesce(max(position), -1) + 1 AS next FROM media WHERE item_id = %s""",
        (item_id,),
    )["next"]
    db.run(
        """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
        (mid, item_id, role, pos, seed, width, height, alt),
    )
    m = db.one(
        "SELECT id, role, width, height FROM media WHERE id = %s", (mid,)
    )
    return {"media_id": m["id"], "role": m["role"], "width": m["width"], "height": m["height"]}


def add_credit(db: Database, house_id: str, item_id: str, payload: dict) -> dict:
    item = studio_item(db, house_id, item_id)
    if item["kind"] != "work":
        raise BadRequest("credits belong to works")
    role = (payload.get("role") or "").strip()
    name = (payload.get("name") or "").strip()
    if not role or not name:
        raise BadRequest("a credit needs a role and a name")
    talent_id = payload.get("talent_id") or None
    if talent_id:
        own = db.one(
            "SELECT id FROM items WHERE id = %s AND house_id = %s AND kind = 'talent'",
            (talent_id, house_id),
        )
        if not own:
            raise NotFound("that talent is not in this house")
    pos = db.one(
        "SELECT coalesce(max(position), -1) + 1 AS next FROM credits WHERE item_id = %s",
        (item_id,),
    )["next"]
    cid = db.one(
        """INSERT INTO credits (item_id, position, role, name, talent_item_id)
           VALUES (%s,%s,%s,%s,%s) RETURNING id""",
        (item_id, pos, role, name, talent_id),
    )["id"]
    row = db.one("SELECT id, position, role, name, talent_item_id FROM credits WHERE id = %s", (cid,))
    return {
        "id": row["id"],
        "position": row["position"],
        "role": row["role"],
        "name": row["name"],
        "talent_id": row["talent_item_id"],
    }


def reorder_works(db: Database, house_id: str, ordered_ids: Iterable[str]) -> list[dict]:
    ids = list(ordered_ids or [])
    own = {r["id"]: r["slug"] for r in db.all(
        "SELECT id, slug FROM items WHERE house_id = %s AND kind = 'work'", (house_id,))}
    unknown = [i for i in ids if i not in own]
    if unknown or len(set(ids)) != len(ids) or set(ids) != set(own):
        raise BadRequest("the ordered list must name every work of this house exactly once")
    with db.tx() as c:
        for position, item_id in enumerate(ids, start=1):
            c.execute(
                "UPDATE items SET position = %s WHERE id = %s AND house_id = %s",
                (position, item_id, house_id),
            )
    return studio_items(db, house_id, "work")


def mint_preview_token(db: Database, house_id: str, item_id: str, created_by: str | None) -> dict:
    studio_item(db, house_id, item_id)  # ownership: a foreign record is not found
    token = new_hex_token()
    expires = utcnow().replace(microsecond=0) + timedelta(minutes=15)
    db.run(
        """INSERT INTO preview_tokens (token, item_id, expires_at, created_by)
           VALUES (%s, %s, %s, %s)""",
        (token, item_id, expires, created_by),
    )
    return {"token": token, "expires_at": _iso(expires), "item_id": item_id}



def resolve_preview_token(db: Database, token: str) -> dict | None:
    r = db.one(
        """SELECT p.item_id, p.expires_at, i.house_id
           FROM preview_tokens p JOIN items i ON i.id = p.item_id
           WHERE p.token = %s""",
        (token,),
    )
    if not r or r["expires_at"] < utcnow():
        return None
    return r
