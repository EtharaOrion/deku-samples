"""Reads and writes over the seven tables.

The four derived values live here and are computed at read time, never stored:
the displayed ordinal, the discipline set, a talent's selected work and a work's
neighbours.
"""
import os
from datetime import datetime, timedelta, timezone

import psycopg

from . import db
from .security import new_media_id, new_preview_token

PUBLIC_HOUSE_SLUG = os.environ.get("PUBLIC_HOUSE_SLUG", "cirrus")
PREVIEW_TTL_MINUTES = 15


class Conflict(Exception):
    """A slug already taken in this house and kind."""


class Invalid(Exception):
    """A refusal a person can read."""


def ordinal_str(n):
    return f"{n:03d}"


def public_house():
    return db.query_one("SELECT * FROM houses WHERE slug = %s", (PUBLIC_HOUSE_SLUG,))


def house_by_id(house_id):
    return db.query_one("SELECT * FROM houses WHERE id = %s", (house_id,))


# --------------------------------------------------------------------------- media

def media_for_items(item_ids):
    if not item_ids:
        return {}
    rows = db.query(
        """SELECT id, item_id, role, position, seed, width, height, alt
           FROM media WHERE item_id = ANY(%s)
           ORDER BY item_id, role, position, id""", (list(item_ids),))
    out = {}
    for r in rows:
        out.setdefault(r["item_id"], []).append(dict(r))
    return out


def media_shape(m):
    return {
        "media_id": m["id"],
        "role": m["role"],
        "position": m["position"],
        "width": m["width"],
        "height": m["height"],
        "alt": m["alt"],
        "url": f"/api/media/{m['id']}",
    }


def attach_media(item, media_map):
    rows = media_map.get(item["id"], [])
    poster = next((m for m in rows if m["role"] == "poster"), None)
    reel = next((m for m in rows if m["role"] == "reel"), None)
    gallery = [m for m in rows if m["role"] == "gallery"]
    item["poster"] = media_shape(poster) if poster else None
    item["reel"] = media_shape(reel) if reel else None
    item["gallery"] = [media_shape(m) for m in gallery]
    item["media"] = [media_shape(m) for m in rows]
    return item


def get_media_row(media_id):
    if not isinstance(media_id, str) or len(media_id) != 32:
        return None
    return db.query_one(
        """SELECT m.*, i.house_id, i.published, i.id AS owner_item_id
           FROM media m JOIN items i ON i.id = m.item_id
           WHERE m.id = %s""", (media_id,))


# --------------------------------------------------------------------------- works

def _work_shape(row, ordinal=None):
    d = {
        "id": row["id"],
        "kind": "work",
        "slug": row["slug"],
        "title": row["title"],
        "variant": row["variant"],
        "position": row["position"],
        "published": row["published"],
        "published_at": row["published_at"].isoformat() if row["published_at"] else None,
        "href": f"/works/{row['slug']}",
    }
    if ordinal is not None:
        d["ordinal"] = ordinal
        d["ordinal_label"] = ordinal_str(ordinal)
    return d


def published_works(house_id):
    """The published set of works in stored order. The ordinal derives from this
    list's own indexes, so it is contiguous from 001 by construction."""
    rows = db.query(
        """SELECT * FROM items
           WHERE house_id = %s AND kind = 'work' AND published
           ORDER BY position, id""", (house_id,))
    media_map = media_for_items([r["id"] for r in rows])
    out = []
    for i, r in enumerate(rows):
        w = _work_shape(r, i + 1)
        attach_media(w, media_map)
        out.append(w)
    return out


def credits_for(item_id, house_id):
    rows = db.query(
        """SELECT c.id, c.position, c.role, c.name, c.talent_item_id,
                  t.slug AS talent_slug, t.published AS talent_published,
                  t.house_id AS talent_house_id
           FROM credits c
           LEFT JOIN items t ON t.id = c.talent_item_id
           WHERE c.item_id = %s
           ORDER BY c.position, c.id""", (item_id,))
    out = []
    for r in rows:
        linked = bool(r["talent_item_id"] and r["talent_published"]
                      and r["talent_house_id"] == house_id)
        out.append({
            "id": r["id"],
            "role": r["role"],
            "name": r["name"],
            "position": r["position"],
            "talent_id": r["talent_item_id"],
            "talent_slug": r["talent_slug"] if linked else None,
            "href": f"/talents/{r['talent_slug']}" if linked else None,
        })
    return out


def work_detail(house_id, slug, allow_unpublished_id=None):
    """One published work with its media, credits and neighbours.

    `allow_unpublished_id` lets the preview harness render an unlisted record
    through this very same shape, so a preview is never a simplified renderer.
    """
    row = db.query_one(
        """SELECT * FROM items
           WHERE house_id = %s AND kind = 'work' AND lower(slug) = lower(%s)""",
        (house_id, slug))
    if not row:
        return None
    if not row["published"] and row["id"] != allow_unpublished_id:
        return None

    published = published_works(house_id)
    ordinal = None
    neighbours = {"next": None, "prev": None}
    for i, w in enumerate(published):
        if w["id"] == row["id"]:
            ordinal = i + 1
            nxt = published[(i + 1) % len(published)]
            prv = published[(i - 1) % len(published)]
            neighbours = {
                "next": {"slug": nxt["slug"], "title": nxt["title"],
                         "ordinal_label": nxt["ordinal_label"],
                         "href": f"/works/{nxt['slug']}"},
                "prev": {"slug": prv["slug"], "title": prv["title"],
                         "ordinal_label": prv["ordinal_label"],
                         "href": f"/works/{prv['slug']}"},
            }
            break

    work = _work_shape(row, ordinal)
    attach_media(work, media_for_items([row["id"]]))
    work["credits"] = credits_for(row["id"], house_id)
    work["next"] = neighbours["next"]
    work["prev"] = neighbours["prev"]
    return work


# ------------------------------------------------------------------------- talents

def _talent_shape(row):
    return {
        "id": row["id"],
        "kind": "talent",
        "slug": row["slug"],
        "title": row["title"],
        "name": row["title"],
        "discipline": row["discipline"],
        "position": row["position"],
        "published": row["published"],
        "published_at": row["published_at"].isoformat() if row["published_at"] else None,
        "href": f"/talents/{row['slug']}",
    }


def published_talents(house_id, discipline=None):
    rows = db.query(
        """SELECT * FROM items
           WHERE house_id = %s AND kind = 'talent' AND published
           ORDER BY position, id""", (house_id,))
    if discipline:
        rows = [r for r in rows if r["discipline"] == discipline]
    media_map = media_for_items([r["id"] for r in rows])
    out = []
    for r in rows:
        t = _talent_shape(r)
        attach_media(t, media_map)
        out.append(t)
    return out


def disciplines(house_id):
    """Derived from published talent in first appearance order, never authored."""
    rows = db.query(
        """SELECT discipline FROM items
           WHERE house_id = %s AND kind = 'talent' AND published AND discipline IS NOT NULL
           ORDER BY position, id""", (house_id,))
    seen = []
    for r in rows:
        if r["discipline"] not in seen:
            seen.append(r["discipline"])
    return seen


def selected_work_for_talent(house_id, talent_item_id):
    """Read from credits, never stored on the talent."""
    rows = db.query(
        """SELECT i.* FROM credits c
           JOIN items i ON i.id = c.item_id
           WHERE c.talent_item_id = %s AND i.house_id = %s
             AND i.kind = 'work' AND i.published
           ORDER BY i.position, i.id""", (talent_item_id, house_id))
    published = {w["id"]: w for w in published_works(house_id)}
    out = []
    for r in rows:
        w = published.get(r["id"])
        if w and not any(x["id"] == w["id"] for x in out):
            out.append(w)
    return out


def talent_detail(house_id, slug, allow_unpublished_id=None):
    row = db.query_one(
        """SELECT * FROM items
           WHERE house_id = %s AND kind = 'talent' AND lower(slug) = lower(%s)""",
        (house_id, slug))
    if not row:
        return None
    if not row["published"] and row["id"] != allow_unpublished_id:
        return None
    t = _talent_shape(row)
    attach_media(t, media_for_items([row["id"]]))
    t["selected_work"] = selected_work_for_talent(house_id, row["id"])
    return t


# ------------------------------------------------------------------- slug redirects

def resolve_redirect(house_id, kind, old_slug):
    row = db.query_one(
        """SELECT i.slug FROM slug_redirects r JOIN items i ON i.id = r.item_id
           WHERE r.house_id = %s AND r.kind = %s AND lower(r.old_slug) = lower(%s)""",
        (house_id, kind, old_slug))
    return row["slug"] if row else None


# -------------------------------------------------------------------------- studio

def studio_items(house_id, kind=None):
    sql = """SELECT * FROM items WHERE house_id = %s"""
    params = [house_id]
    if kind:
        sql += " AND kind = %s"
        params.append(kind)
    sql += " ORDER BY kind, position, id"
    rows = db.query(sql, tuple(params))
    media_map = media_for_items([r["id"] for r in rows])
    out = []
    ordinals = {w["id"]: w["ordinal_label"] for w in published_works(house_id)}
    for r in rows:
        d = _work_shape(r) if r["kind"] == "work" else _talent_shape(r)
        d["kind"] = r["kind"]
        attach_media(d, media_map)
        if r["kind"] == "work":
            d["ordinal_label"] = ordinals.get(r["id"])
        out.append(d)
    return out


def studio_item(house_id, item_id):
    """A record of another house is answered exactly as a missing one: this
    returns None for both, and every caller turns None into the same not-found."""
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return None
    row = db.query_one("SELECT * FROM items WHERE id = %s AND house_id = %s",
                       (item_id, house_id))
    if not row:
        return None
    d = _work_shape(row) if row["kind"] == "work" else _talent_shape(row)
    d["kind"] = row["kind"]
    attach_media(d, media_for_items([row["id"]]))
    d["credits"] = credits_for(row["id"], house_id) if row["kind"] == "work" else []
    if row["kind"] == "work" and row["published"]:
        for w in published_works(house_id):
            if w["id"] == row["id"]:
                d["ordinal_label"] = w["ordinal_label"]
    if row["kind"] == "talent":
        d["selected_work"] = selected_work_for_talent(house_id, row["id"])
    return d


SLUG_OK = "abcdefghijklmnopqrstuvwxyz0123456789-"


def normalise_slug(value):
    if value is None:
        raise Invalid("A slug is required.")
    s = str(value).strip().lower()
    if not s:
        raise Invalid("A slug is required.")
    cleaned = "".join(ch if ch in SLUG_OK else "-" for ch in s)
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    cleaned = cleaned.strip("-")
    if not cleaned:
        raise Invalid("A slug must contain a letter or a number.")
    if cleaned != s:
        raise Invalid("A slug is lowercase kebab: letters, numbers and single hyphens.")
    return cleaned


def create_item(house_id, kind, slug, title, discipline=None, variant=None):
    if kind not in ("work", "talent"):
        raise Invalid("Kind must be 'work' or 'talent'.")
    if not title or not str(title).strip():
        raise Invalid("A title is required.")
    slug = normalise_slug(slug)
    if kind == "talent":
        if discipline not in ("director", "photographer", "stylist"):
            raise Invalid("A talent needs a discipline of director, photographer or stylist.")
        variant = None
    else:
        if variant not in ("left", "right", "centre"):
            raise Invalid("A work needs a variant of left, right or centre.")
        discipline = None
    try:
        with db.connection() as conn:
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute(
                        """SELECT COALESCE(MAX(position), -1) + 1 AS p FROM items
                           WHERE house_id = %s AND kind = %s""", (house_id, kind))
                    pos = cur.fetchone()["p"]
                    cur.execute(
                        """INSERT INTO items (house_id, kind, slug, title, position,
                                              discipline, variant, published, published_at)
                           VALUES (%s,%s,%s,%s,%s,%s,%s, FALSE, NULL) RETURNING id""",
                        (house_id, kind, slug, str(title).strip(), pos, discipline, variant))
                    new_id = cur.fetchone()["id"]
    except psycopg.errors.UniqueViolation:
        # The database holds slug uniqueness, so two simultaneous creates carrying
        # the same slug cannot both land: exactly one wins and the loser's whole
        # transaction rolls back, leaving no partial record.
        raise Conflict(f"That slug is already used by another {kind} in this house.")
    return studio_item(house_id, new_id)


EDITABLE = {"title", "discipline", "variant", "position"}


def update_item(house_id, item_id, fields):
    current = db.query_one("SELECT * FROM items WHERE id = %s AND house_id = %s",
                           (item_id, house_id))
    if not current:
        return None
    sets, params = [], []
    for key in EDITABLE:
        if key in fields:
            value = fields[key]
            if key == "title":
                if not value or not str(value).strip():
                    raise Invalid("A title is required.")
                value = str(value).strip()
            if key == "discipline":
                if current["kind"] != "talent":
                    raise Invalid("Only a talent carries a discipline.")
                if value not in ("director", "photographer", "stylist"):
                    raise Invalid("A discipline is director, photographer or stylist.")
            if key == "variant":
                if current["kind"] != "work":
                    raise Invalid("Only a work carries a variant.")
                if value not in ("left", "right", "centre"):
                    raise Invalid("A variant is left, right or centre.")
            if key == "position":
                try:
                    value = int(value)
                except (TypeError, ValueError):
                    raise Invalid("Position must be a whole number.")
            sets.append(f"{key} = %s")
            params.append(value)
    if sets:
        params.extend([item_id, house_id])
        db.execute(f"UPDATE items SET {', '.join(sets)} WHERE id = %s AND house_id = %s",
                   tuple(params))
    return studio_item(house_id, item_id)


def set_published(house_id, item_id, published):
    row = db.query_one("SELECT * FROM items WHERE id = %s AND house_id = %s",
                       (item_id, house_id))
    if not row:
        return None
    if published:
        poster = db.query_one(
            """SELECT * FROM media WHERE item_id = %s AND role = 'poster'
               ORDER BY position, id LIMIT 1""", (item_id,))
        if not poster:
            raise Invalid("A record needs a poster before it can be published.")
        if not (poster["alt"] or "").strip():
            raise Invalid("The poster needs a written alternative before publishing.")
        db.execute(
            """UPDATE items SET published = TRUE, published_at = now()
               WHERE id = %s AND house_id = %s AND published = FALSE""",
            (item_id, house_id))
    else:
        db.execute(
            """UPDATE items SET published = FALSE, published_at = NULL
               WHERE id = %s AND house_id = %s""", (item_id, house_id))
    return studio_item(house_id, item_id)


def add_media(house_id, item_id, role, seed, width, height, alt):
    row = db.query_one("SELECT * FROM items WHERE id = %s AND house_id = %s",
                       (item_id, house_id))
    if not row:
        return None
    if role not in ("poster", "reel", "gallery"):
        raise Invalid("A media role is poster, reel or gallery.")
    alt = (alt or "").strip()
    if not alt:
        raise Invalid("A written alternative is required.")
    try:
        seed = int(seed)
        width = int(width)
        height = int(height)
    except (TypeError, ValueError):
        raise Invalid("Seed, width and height must be whole numbers.")
    if width <= 0 or height <= 0:
        raise Invalid("Width and height must be positive.")
    if width > 4000 or height > 4000:
        raise Invalid("Width and height must be 4000 or less.")
    mid = new_media_id()
    pos = db.query_one(
        """SELECT COALESCE(MAX(position), -1) + 1 AS p FROM media
           WHERE item_id = %s AND role = %s""", (item_id, role))["p"]
    db.execute(
        """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
        (mid, item_id, role, pos, seed, width, height, alt))
    return {"media_id": mid, "role": role, "width": width, "height": height,
            "alt": alt, "url": f"/api/media/{mid}"}


def add_credit(house_id, item_id, role, name, talent_id=None):
    row = db.query_one(
        "SELECT * FROM items WHERE id = %s AND house_id = %s AND kind = 'work'",
        (item_id, house_id))
    if not row:
        return None
    if not (role or "").strip() or not (name or "").strip():
        raise Invalid("A credit needs a role and a name.")
    talent_item_id = None
    if talent_id not in (None, "", "null"):
        t = db.query_one(
            "SELECT id FROM items WHERE id = %s AND house_id = %s AND kind = 'talent'",
            (int(talent_id), house_id))
        if not t:
            raise Invalid("That talent is not in this house.")
        talent_item_id = t["id"]
    pos = db.query_one(
        "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM credits WHERE item_id = %s",
        (item_id,))["p"]
    created = db.execute(
        """INSERT INTO credits (item_id, position, role, name, talent_item_id)
           VALUES (%s,%s,%s,%s,%s) RETURNING id, position, role, name, talent_item_id""",
        (item_id, pos, role.strip(), name.strip(), talent_item_id))[0]
    return {"id": created["id"], "position": created["position"], "role": created["role"],
            "name": created["name"], "talent_id": created["talent_item_id"]}


def change_slug(house_id, item_id, new_slug):
    """A rename leaves the old address redirecting forever."""
    row = db.query_one("SELECT * FROM items WHERE id = %s AND house_id = %s",
                       (item_id, house_id))
    if not row:
        return None
    new_slug = normalise_slug(new_slug)
    if new_slug == row["slug"].lower():
        return studio_item(house_id, item_id)
    old_slug = row["slug"]
    try:
        with db.connection() as conn:
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE items SET slug = %s WHERE id = %s AND house_id = %s",
                        (new_slug, item_id, house_id))
                    cur.execute(
                        """INSERT INTO slug_redirects (house_id, kind, old_slug, item_id)
                           VALUES (%s,%s,%s,%s)
                           ON CONFLICT (house_id, kind, lower(old_slug))
                           DO UPDATE SET item_id = EXCLUDED.item_id""",
                        (house_id, row["kind"], old_slug, item_id))
                    cur.execute(
                        """DELETE FROM slug_redirects
                           WHERE house_id = %s AND kind = %s AND lower(old_slug) = lower(%s)""",
                        (house_id, row["kind"], new_slug))
    except psycopg.errors.UniqueViolation:
        raise Conflict(f"That slug is already used by another {row['kind']} in this house.")
    return studio_item(house_id, item_id)


def reorder_works(house_id, ordered_ids):
    if not isinstance(ordered_ids, list) or not ordered_ids:
        raise Invalid("Send the works in their new order as a list of ids.")
    try:
        ids = [int(i) for i in ordered_ids]
    except (TypeError, ValueError):
        raise Invalid("Every id must be a whole number.")
    owned = db.query(
        "SELECT id FROM items WHERE house_id = %s AND kind = 'work'", (house_id,))
    owned_ids = {r["id"] for r in owned}
    if set(ids) - owned_ids:
        # An id from another house is answered exactly as one that does not exist.
        return None
    with db.connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                for pos, iid in enumerate(ids):
                    cur.execute(
                        "UPDATE items SET position = %s WHERE id = %s AND house_id = %s",
                        (pos, iid, house_id))
                rest = [i for i in owned_ids if i not in set(ids)]
                for offset, iid in enumerate(sorted(rest)):
                    cur.execute(
                        "UPDATE items SET position = %s WHERE id = %s AND house_id = %s",
                        (len(ids) + offset, iid, house_id))
    return studio_items(house_id, "work")


def mint_preview_token(house_id, item_id, account_id):
    row = db.query_one("SELECT * FROM items WHERE id = %s AND house_id = %s",
                       (item_id, house_id))
    if not row:
        return None
    token = new_preview_token()
    expires = datetime.now(timezone.utc) + timedelta(minutes=PREVIEW_TTL_MINUTES)
    db.execute(
        """INSERT INTO preview_tokens (token, item_id, expires_at, created_by)
           VALUES (%s,%s,%s,%s)""", (token, item_id, expires, account_id))
    return {"token": token, "expires_at": expires.isoformat(),
            "item_id": row["id"], "href": f"/preview/{token}"}


def resolve_preview(token, house_id):
    """Scoped to exactly one record and to that record's house: another house's
    producer, or a token for another record, is answered as not found."""
    if not isinstance(token, str) or len(token) != 32:
        return None
    row = db.query_one(
        """SELECT p.*, i.house_id, i.kind, i.slug
           FROM preview_tokens p JOIN items i ON i.id = p.item_id
           WHERE p.token = %s AND p.expires_at > now()""", (token,))
    if not row or row["house_id"] != house_id:
        return None
    if row["kind"] == "work":
        record = work_detail(house_id, row["slug"], allow_unpublished_id=row["item_id"])
    else:
        record = talent_detail(house_id, row["slug"], allow_unpublished_id=row["item_id"])
    if not record:
        return None
    return {"record": record, "kind": row["kind"], "item_id": row["item_id"],
            "expires_at": row["expires_at"].isoformat()}


def media_visible_to(media_row, viewer_account):
    """Published records answer to everyone. An unlisted record's pixels are not
    found to anyone but that record's own house producer, however the caller got
    the id."""
    if media_row is None:
        return False
    if media_row["published"]:
        return media_row["house_id"] == public_house()["id"]
    if not viewer_account:
        return False
    return (viewer_account.get("role") == "producer"
            and viewer_account.get("house_id") == media_row["house_id"])
