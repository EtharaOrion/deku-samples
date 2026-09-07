"""Reads and writes. Every derived value is computed here, never stored."""
import re

from .db import connection

KINDS = ("work", "talent")
DISCIPLINES = ("director", "photographer", "stylist")
VARIANTS = ("left", "right", "centre")


def ordinal(n: int) -> str:
    return "%03d" % n


def slugify(raw: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (raw or "").strip().lower()).strip("-")
    return s


def valid_slug(s: str) -> bool:
    return bool(s) and bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", s))


def house_by_slug(cur, slug):
    cur.execute("SELECT * FROM houses WHERE slug=%s", (slug,))
    return cur.fetchone()


def _media_rows(cur, item_ids):
    if not item_ids:
        return {}
    cur.execute(
        """SELECT id, item_id, role, position, seed, width, height, alt
           FROM media WHERE item_id = ANY(%s)
           ORDER BY item_id, role, position""", (list(item_ids),))
    out = {}
    for row in cur.fetchall():
        out.setdefault(row["item_id"], []).append(dict(row))
    return out


def media_public(row):
    return {
        "media_id": row["id"],
        "role": row["role"],
        "position": row["position"],
        "width": row["width"],
        "height": row["height"],
        "alt": row["alt"],
        "url": "/api/media/%s" % row["id"],
    }


def published_items(cur, house_id, kind):
    cur.execute(
        """SELECT * FROM items
           WHERE house_id=%s AND kind=%s AND published IS TRUE
           ORDER BY position, id""", (house_id, kind))
    return cur.fetchall()


def works_list(cur, house_id):
    """Published works in stored order; the ordinal is their place in that set."""
    rows = published_items(cur, house_id, "work")
    media = _media_rows(cur, [r["id"] for r in rows])
    out = []
    for i, row in enumerate(rows):
        out.append(work_public(row, i + 1, media.get(row["id"], [])))
    return out


def work_public(row, index, media):
    posters = [m for m in media if m["role"] == "poster"]
    reels = [m for m in media if m["role"] == "reel"]
    return {
        "id": row["id"],
        "kind": "work",
        "slug": row["slug"],
        "title": row["title"],
        "variant": row["variant"],
        "ordinal": ordinal(index),
        "published": row["published"],
        "published_at": row["published_at"].isoformat() if row["published_at"] else None,
        "poster": media_public(posters[0]) if posters else None,
        "reel": media_public(reels[0]) if reels else None,
        "media": [media_public(m) for m in media],
    }


def talent_public(row, media):
    posters = [m for m in media if m["role"] == "poster"]
    reels = [m for m in media if m["role"] == "reel"]
    return {
        "id": row["id"],
        "kind": "talent",
        "slug": row["slug"],
        "title": row["title"],
        "discipline": row["discipline"],
        "published": row["published"],
        "published_at": row["published_at"].isoformat() if row["published_at"] else None,
        "poster": media_public(posters[0]) if posters else None,
        "reel": media_public(reels[0]) if reels else None,
        "media": [media_public(m) for m in media],
    }


def talents_list(cur, house_id, discipline=None):
    rows = published_items(cur, house_id, "talent")
    if discipline:
        rows = [r for r in rows if r["discipline"] == discipline]
    media = _media_rows(cur, [r["id"] for r in rows])
    return [talent_public(r, media.get(r["id"], [])) for r in rows]


def disciplines_list(cur, house_id):
    """Derived from published talent in first appearance order, never authored."""
    seen = []
    for row in published_items(cur, house_id, "talent"):
        d = row["discipline"]
        if d and d not in seen:
            seen.append(d)
    return seen


def credits_for(cur, work_id, house_id):
    cur.execute(
        """SELECT c.id, c.position, c.role, c.name, c.talent_item_id,
                  t.slug AS talent_slug, t.published AS talent_published
           FROM credits c
           LEFT JOIN items t ON t.id = c.talent_item_id
           WHERE c.item_id = %s ORDER BY c.position, c.id""", (work_id,))
    out = []
    for row in cur.fetchall():
        out.append({
            "id": row["id"],
            "role": row["role"],
            "name": row["name"],
            "talent_id": row["talent_item_id"],
            # a name matching a published talent links to that talent's route
            "talent_slug": row["talent_slug"] if row["talent_published"] else None,
        })
    return out


def selected_work_for(cur, talent_id, house_id):
    """A talent's selected work is read from credits, never stored on the talent."""
    published = published_items(cur, house_id, "work")
    order = {row["id"]: i + 1 for i, row in enumerate(published)}
    cur.execute(
        """SELECT DISTINCT item_id FROM credits WHERE talent_item_id = %s""",
        (talent_id,))
    ids = [r["item_id"] for r in cur.fetchall() if r["item_id"] in order]
    rows = [r for r in published if r["id"] in ids]
    media = _media_rows(cur, ids)
    return [work_public(r, order[r["id"]], media.get(r["id"], [])) for r in rows]


def neighbours_for(cur, house_id, work_id):
    """Follows the ordinal and wraps at both ends."""
    rows = published_items(cur, house_id, "work")
    if not rows:
        return None, None
    ids = [r["id"] for r in rows]
    if work_id not in ids:
        return None, None
    i = ids.index(work_id)
    prev_row = rows[(i - 1) % len(rows)]
    next_row = rows[(i + 1) % len(rows)]

    def brief(row):
        return {
            "slug": row["slug"], "title": row["title"],
            "ordinal": ordinal(ids.index(row["id"]) + 1),
        }

    return brief(prev_row), brief(next_row)


def resolve_slug(cur, house_id, kind, slug):
    """Returns (item_row, canonical_slug_or_None). A renamed slug redirects."""
    cur.execute(
        """SELECT * FROM items
           WHERE house_id=%s AND kind=%s AND lower(slug)=lower(%s)""",
        (house_id, kind, slug))
    row = cur.fetchone()
    if row:
        return row, None
    cur.execute(
        """SELECT i.* FROM slug_redirects r JOIN items i ON i.id = r.item_id
           WHERE r.house_id=%s AND r.kind=%s AND lower(r.old_slug)=lower(%s)""",
        (house_id, kind, slug))
    row = cur.fetchone()
    if row:
        return row, row["slug"]
    return None, None


def work_detail(cur, house_id, row):
    published = published_items(cur, house_id, "work")
    ids = [r["id"] for r in published]
    index = ids.index(row["id"]) + 1 if row["id"] in ids else 0
    media = _media_rows(cur, [row["id"]]).get(row["id"], [])
    data = work_public(row, index, media)
    prev_row, next_row = neighbours_for(cur, house_id, row["id"])
    data["credits"] = credits_for(cur, row["id"], house_id)
    data["previous"] = prev_row
    data["next"] = next_row
    data["gallery"] = [m for m in data["media"] if m["role"] == "gallery"]
    return data


def talent_detail(cur, house_id, row):
    media = _media_rows(cur, [row["id"]]).get(row["id"], [])
    data = talent_public(row, media)
    data["selected_work"] = selected_work_for(cur, row["id"], house_id)
    data["gallery"] = [m for m in data["media"] if m["role"] == "gallery"]
    return data


def item_detail(cur, house_id, row):
    return (work_detail if row["kind"] == "work" else talent_detail)(cur, house_id, row)


def studio_item(cur, row):
    """A studio projection: the caller's own house's record, as stored."""
    media = _media_rows(cur, [row["id"]]).get(row["id"], [])
    return {
        "id": row["id"],
        "kind": row["kind"],
        "slug": row["slug"],
        "title": row["title"],
        "position": row["position"],
        "discipline": row["discipline"],
        "variant": row["variant"],
        "published": row["published"],
        "published_at": row["published_at"].isoformat() if row["published_at"] else None,
        "public_path": ("/works/" if row["kind"] == "work" else "/talents/") + row["slug"],
        "media": [media_public(m) for m in media],
    }


def owned_item(cur, house_id, item_id):
    """A record of another house is answered exactly as a missing one: None."""
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return None
    cur.execute("SELECT * FROM items WHERE id=%s AND house_id=%s",
                (item_id, house_id))
    return cur.fetchone()


def public_ordinal_of(cur, house_id, item_id):
    rows = published_items(cur, house_id, "work")
    ids = [r["id"] for r in rows]
    return ordinal(ids.index(item_id) + 1) if item_id in ids else None


def media_visible(cur, media_id, account):
    """A generated still answers while its record is published; while the record
    is unlisted it is not found to anyone but that record's own house producer."""
    if not isinstance(media_id, str) or not len(media_id) == 32:
        return None
    cur.execute(
        """SELECT m.*, i.published, i.house_id
           FROM media m JOIN items i ON i.id = m.item_id
           WHERE m.id = %s""", (media_id,))
    row = cur.fetchone()
    if not row:
        return None
    if row["published"]:
        return row
    if (account and account["role"] == "producer"
            and account["house_id"] == row["house_id"]):
        return row
    return None
