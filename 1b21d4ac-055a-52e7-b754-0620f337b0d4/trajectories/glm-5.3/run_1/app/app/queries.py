"""Read queries. Derived values (ordinal, discipline set, selected work, neighbours)
are computed here at read time and are never stored."""
from psycopg.rows import dict_row


def row(cur):
    r = cur.fetchone()
    return r if r is None else dict(r)


def rows(cur):
    return [dict(r) for r in cur.fetchall()]


def house_by_slug(conn, slug):
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM houses WHERE slug = %s", (slug,))
        return row(cur)


def house_by_id(conn, house_id):
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM houses WHERE id = %s", (house_id,))
        return row(cur)


def published_items(conn, house_id, kind):
    with conn.cursor() as cur:
        cur.execute(
            """SELECT * FROM items
               WHERE house_id = %s AND kind = %s AND published
               ORDER BY position, created_at""",
            (house_id, kind),
        )
        return rows(cur)


def item_by_slug(conn, house_id, kind, slug):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM items WHERE house_id = %s AND kind = %s AND lower(slug) = lower(%s)",
            (house_id, kind, slug),
        )
        return row(cur)


def item_by_id(conn, item_id):
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM items WHERE id = %s", (item_id,))
        return row(cur)


def item_media(conn, item_id):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM media WHERE item_id = %s ORDER BY position, created_at", (item_id,)
        )
        return rows(cur)


def item_credits(conn, item_id):
    with conn.cursor() as cur:
        cur.execute(
            """SELECT c.*, i.slug AS talent_slug, i.title AS talent_title,
                      i.published AS talent_published
               FROM credits c
               LEFT JOIN items i ON i.id = c.talent_item_id
               WHERE c.item_id = %s
               ORDER BY c.position, c.created_at""",
            (item_id,),
        )
        return rows(cur)


def media_with_item(conn, media_id):
    with conn.cursor() as cur:
        cur.execute(
            """SELECT m.*, i.house_id AS item_house_id, i.kind AS item_kind,
                      i.slug AS item_slug, i.published AS item_published
               FROM media m JOIN items i ON i.id = m.item_id
               WHERE m.id = %s""",
            (media_id,),
        )
        return row(cur)


def works_for_talent(conn, talent_id):
    """A talent's selected work, read from credits. Never stored on the talent."""
    with conn.cursor() as cur:
        cur.execute(
            """SELECT DISTINCT w.* FROM credits c
               JOIN items w ON w.id = c.item_id
               WHERE c.talent_item_id = %s AND w.published AND w.kind = 'work'
               ORDER BY w.position, w.created_at""",
            (talent_id,),
        )
        return rows(cur)


def discipline_set(conn, house_id):
    """Derived discipline set of published talent, in first appearance order."""
    with conn.cursor() as cur:
        cur.execute(
            """SELECT DISTINCT ON (discipline) discipline, position, created_at
               FROM items
               WHERE house_id = %s AND kind = 'talent' AND published AND discipline IS NOT NULL
               ORDER BY discipline, position, created_at""",
            (house_id,),
        )
        found = rows(cur)
    found.sort(key=lambda r: (r["position"], r["created_at"]))
    return [r["discipline"] for r in found]


def slug_redirect(conn, house_id, kind, slug):
    with conn.cursor() as cur:
        cur.execute(
            """SELECT r.* FROM slug_redirects r
               JOIN items i ON i.id = r.item_id
               WHERE r.house_id = %s AND r.kind = %s AND lower(r.old_slug) = lower(%s)
                 AND i.published AND i.house_id = %s""",
            (house_id, kind, slug, house_id),
        )
        return row(cur)


def ordinal_of(item, published_list):
    for i, candidate in enumerate(published_list):
        if candidate["id"] == item["id"]:
            return i + 1
    return None


def neighbours(item, published_list):
    ids = [c["id"] for c in published_list]
    if item["id"] not in ids:
        return (None, None)
    idx = ids.index(item["id"])
    n = len(ids)
    prev_i = (idx - 1) % n if n else 0
    next_i = (idx + 1) % n if n else 0
    prev = published_list[prev_i] if n else None
    nxt = published_list[next_i] if n else None
    return (prev, nxt)
