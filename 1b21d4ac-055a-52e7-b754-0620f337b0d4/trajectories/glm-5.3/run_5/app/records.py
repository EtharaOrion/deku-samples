"""Read model: every derived value is computed here at read time."""
import psycopg

from db import iso

ITEM_COLUMNS = "id, house_id, kind, slug, title, position, discipline, variant, published, published_at, created_at"


def _item(row, ordinal=None, media=None, credits=None, neighbours=None, selected_work=None):
    item = {
        "id": row[0],
        "house_id": row[1],
        "kind": row[2],
        "slug": row[3],
        "title": row[4],
        "position": row[5],
        "discipline": row[6],
        "variant": row[7],
        "published": row[8],
        "published_at": iso(row[9]),
        "created_at": iso(row[10]),
    }
    if ordinal is not None:
        item["ordinal"] = ordinal
    if media is not None:
        item["media"] = media
    if credits is not None:
        item["credits"] = credits
    if neighbours is not None:
        item["neighbours"] = neighbours
    if selected_work is not None:
        item["selected_work"] = selected_work
    return item


def _media(row):
    return {
        "id": row[0], "item_id": row[1], "role": row[2], "position": row[3],
        "seed": row[4], "width": row[5], "height": row[6], "alt": row[7],
        "url": f"/api/media/{row[0]}",
    }


def _credit(row):
    return {
        "id": row[0], "item_id": row[1], "position": row[2], "role": row[3],
        "name": row[4], "talent_item_id": row[5],
    }


def published_items(conn, house_id, kind, order_by_position=True):
    order = "ORDER BY position, created_at" if order_by_position else ""
    rows = conn.execute(
        f"SELECT {ITEM_COLUMNS} FROM items WHERE house_id=%s AND kind=%s AND published "
        f"{order}", (house_id, kind)).fetchall()
    return rows


def published_works(conn, house_id):
    """Works in ordinal order: ordinals derive from the published set in stored order."""
    rows = published_items(conn, house_id, "work")
    return [_item(row, ordinal=i + 1) for i, row in enumerate(rows)]


def published_talents(conn, house_id, discipline=None):
    rows = published_items(conn, house_id, "talent")
    if discipline:
        rows = [r for r in rows if r[6] == discipline]
    return [_item(row) for row in rows]


def disciplines(conn, house_id):
    """Derived set in first appearance order of the published roster."""
    seen, out = set(), []
    for row in published_items(conn, house_id, "talent"):
        disc = row[6]
        if disc and disc not in seen:
            seen.add(disc)
            out.append(disc)
    return out


def item_by_slug(conn, house_id, kind, slug, published_only=True):
    sql = (f"SELECT {ITEM_COLUMNS} FROM items WHERE house_id=%s AND kind=%s AND "
           f"lower(slug)=lower(%s)")
    if published_only:
        sql += " AND published"
    row = conn.execute(sql, (house_id, kind, slug)).fetchone()
    return row


def work_by_slug(conn, house_id, slug):
    works = published_works(conn, house_id)
    for i, work in enumerate(works):
        if work["slug"].lower() == slug.lower():
            nxt = works[(i + 1) % len(works)] if len(works) > 1 else None
            prv = works[(i - 1) % len(works)] if len(works) > 1 else None
            work["media"] = media_for(conn, work["id"])
            work["credits"] = credits_for(conn, work["id"])
            work["neighbours"] = {
                "next": _brief(conn, nxt) if nxt else None,
                "previous": _brief(conn, prv) if prv else None,
            }
            return work
    return None


def _brief(conn, work):
    return {
        "slug": work["slug"], "title": work["title"], "ordinal": work["ordinal"],
        "poster_url": poster_url(conn, work["id"]),
    }


def talent_by_slug(conn, house_id, slug):
    rows = published_items(conn, house_id, "talent")
    target = None
    for row in rows:
        if row[3].lower() == slug.lower():
            target = row
    if not target:
        return None
    talent = _item(target)
    talent["media"] = media_for(conn, talent["id"])
    talent["selected_work"] = selected_work(conn, house_id, talent["id"])
    return talent


def poster_url(conn, item_id):
    row = conn.execute(
        "SELECT id FROM media WHERE item_id=%s AND role='poster' ORDER BY position LIMIT 1",
        (item_id,)).fetchone()
    return f"/api/media/{row[0]}" if row else None


def media_for(conn, item_id):
    rows = conn.execute(
        "SELECT id, item_id, role, position, seed, width, height, alt FROM media "
        "WHERE item_id=%s ORDER BY position, created_at", (item_id,)).fetchall()
    return [_media(r) for r in rows]


def credits_for(conn, item_id):
    rows = conn.execute(
        "SELECT id, item_id, position, role, name, talent_item_id FROM credits "
        "WHERE item_id=%s ORDER BY position, created_at", (item_id,)).fetchall()
    return [_credit(r) for r in rows]


def selected_work(conn, house_id, talent_item_id):
    """A talent's selected work is read from credits, never stored on the talent."""
    rows = conn.execute(
        "SELECT item_id FROM credits WHERE talent_item_id=%s ORDER BY position, created_at",
        (talent_item_id,)).fetchall()
    ids = [r[0] for r in rows]
    works = published_works(conn, house_id)
    picked = []
    for work in works:
        if work["id"] in ids and work["id"] not in [p["id"] for p in picked]:
            work = dict(work)
            work["poster_url"] = poster_url(conn, work["id"])
            work["poster"] = first_poster(conn, work["id"])
            picked.append(work)
    return picked


def first_poster(conn, item_id):
    row = conn.execute(
        "SELECT id, item_id, role, position, seed, width, height, alt FROM media "
        "WHERE item_id=%s AND role='poster' ORDER BY position LIMIT 1",
        (item_id,)).fetchone()
    return _media(row) if row else None


def media_row(conn, media_id):
    return conn.execute(
        "SELECT m.id, m.item_id, m.role, m.position, m.seed, m.width, m.height, m.alt, "
        "       i.house_id, i.published "
        "FROM media m JOIN items i ON i.id = m.item_id WHERE m.id=%s",
        (media_id,)).fetchone()


def studio_item(conn, item_id):
    row = conn.execute(
        f"SELECT {ITEM_COLUMNS} FROM items WHERE id=%s", (item_id,)).fetchone()
    if not row:
        return None
    item = _item(row)
    item["media"] = media_for(conn, item["id"])
    item["credits"] = credits_for(conn, item["id"])
    item["ordinal"] = None
    return item


def studio_items(conn, house_id, kind=None):
    sql = f"SELECT {ITEM_COLUMNS} FROM items WHERE house_id=%s"
    args = [house_id]
    if kind:
        sql += " AND kind=%s"
        args.append(kind)
    sql += " ORDER BY kind, position, created_at"
    rows = conn.execute(sql, args).fetchall()
    out = []
    for row in rows:
        item = _item(row)
        item["poster_url"] = poster_url(conn, item["id"])
        out.append(item)
    return out


def ordinal_of(conn, house_id, item_id):
    for work in published_works(conn, house_id):
        if work["id"] == item_id:
            return work["ordinal"]
    return None
