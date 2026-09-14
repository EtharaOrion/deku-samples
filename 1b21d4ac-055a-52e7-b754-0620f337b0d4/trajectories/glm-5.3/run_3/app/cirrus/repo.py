"""Reads and derived values. Ordinals, disciplines, selected work and
neighbours are computed at read time and never stored."""
from . import db

SERVED_HOUSE = "house_cirrus"


def _ordinals(rows):
    out = []
    for i, r in enumerate(rows):
        r = dict(r)
        r["ordinal"] = "%03d" % (i + 1)
        out.append(r)
    return out


def published_works(house_id=SERVED_HOUSE):
    rows = db.pool.query(
        """
        SELECT id, house_id, kind, slug, title, position, discipline, variant,
               published, published_at, created_at
        FROM items
        WHERE house_id = %s AND kind = 'work' AND published
        ORDER BY position ASC, created_at ASC, id ASC
        """,
        (house_id,),
    )
    return _ordinals(rows)


def published_talents(house_id=SERVED_HOUSE, discipline=None):
    rows = db.pool.query(
        """
        SELECT id, house_id, kind, slug, title, position, discipline, variant,
               published, published_at, created_at
        FROM items
        WHERE house_id = %s AND kind = 'talent' AND published
        ORDER BY position ASC, created_at ASC, id ASC
        """,
        (house_id,),
    )
    if discipline:
        rows = [r for r in rows if r["discipline"] == discipline]
    return _ordinals(rows)


def discipline_set(house_id=SERVED_HOUSE):
    """First appearance order over the published roster."""
    rows = db.pool.query(
        """
        SELECT discipline FROM items
        WHERE house_id = %s AND kind = 'talent' AND published AND discipline IS NOT NULL
        ORDER BY position ASC, created_at ASC, id ASC
        """,
        (house_id,),
    )
    seen = []
    for r in rows:
        d = r["discipline"]
        if d not in seen:
            seen.append(d)
    return seen


def work_by_slug(slug: str, house_id=SERVED_HOUSE):
    rows = published_works(house_id)
    for i, r in enumerate(rows):
        if r["slug"] == slug:
            r["prev"] = rows[i - 1]
            r["next"] = rows[(i + 1) % len(rows)]
            return r
    return None


def talent_by_slug(slug: str, house_id=SERVED_HOUSE):
    rows = published_talents(house_id)
    for r in rows:
        if r["slug"] == slug:
            return r
    return None


def media_for(item_id: str):
    return db.pool.query(
        """
        SELECT id, item_id, role, position, seed, width, height, alt, created_at
        FROM media WHERE item_id = %s
        ORDER BY role ASC, position ASC, created_at ASC
        """,
        (item_id,),
    )


def credits_for(item_id: str):
    return db.pool.query(
        """
        SELECT c.id, c.item_id, c.position, c.role, c.name, c.talent_item_id,
               t.slug AS talent_slug, t.title AS talent_title, t.published AS talent_published
        FROM credits c
        LEFT JOIN items t ON t.id = c.talent_item_id
        WHERE c.item_id = %s
        ORDER BY c.position ASC, c.created_at ASC, c.id ASC
        """,
        (item_id,),
    )


def selected_works(talent_item_id: str, house_id=SERVED_HOUSE):
    """A talent's selected work, read from credits, never stored on the talent."""
    rows = db.pool.query(
        """
        SELECT w.id, w.house_id, w.kind, w.slug, w.title, w.position, w.discipline, w.variant,
               w.published, w.published_at, w.created_at
        FROM credits c
        JOIN items w ON w.id = c.item_id
        WHERE c.talent_item_id = %s AND w.kind = 'work' AND w.published AND w.house_id = %s
        ORDER BY w.position ASC, w.created_at ASC
        """,
        (talent_item_id, house_id),
    )
    return _ordinals(rows)


def resolve_slug(house_id: str, kind: str, slug: str):
    """One published record, following one permanent redirect hop."""
    row = db.pool.query_one(
        """
        SELECT id, house_id, kind, slug, title, position, discipline, variant,
               published, published_at, created_at
        FROM items
        WHERE house_id = %s AND kind = %s AND slug = %s AND published
        """,
        (house_id, kind, slug),
    )
    if row:
        return row, None
    red = db.pool.query_one(
        """
        SELECT item_id FROM slug_redirects
        WHERE house_id = %s AND kind = %s AND old_slug = %s
        """,
        (house_id, kind, slug),
    )
    if red:
        row = db.pool.query_one(
            """
            SELECT id, house_id, kind, slug, title, position, discipline, variant,
                   published, published_at, created_at
            FROM items WHERE id = %s AND published
            """,
            (red["item_id"],),
        )
        if row:
            return row, row["slug"]
    return None, None


def item_by_id(item_id: str, house_id: str):
    """One record of that house, whatever its published state."""
    return db.pool.query_one(
        """
        SELECT id, house_id, kind, slug, title, position, discipline, variant,
               published, published_at, created_at
        FROM items WHERE id = %s AND house_id = %s
        """,
        (item_id, house_id),
    )
