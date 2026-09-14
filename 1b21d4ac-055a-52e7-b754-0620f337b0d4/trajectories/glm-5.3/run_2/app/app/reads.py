"""Derived reads. Ordinals, the discipline set, neighbours and selected work are
computed here at read time and never stored."""
from . import db

SERVED_HOUSE = "cirrus"


def house_id() -> str:
    row = db.query("SELECT id FROM houses WHERE slug=%s", (SERVED_HOUSE,), one=True)
    return row["id"]


def _ordinal_list(rows):
    out = []
    for i, r in enumerate(rows):
        r = dict(r)
        r["ordinal"] = f"{i + 1:03d}"
        out.append(r)
    return out


def published_works(house):
    rows = db.query(
        """SELECT id, slug, title, variant, published_at, position FROM items
           WHERE house_id=%s AND kind='work' AND published ORDER BY position, created_at""",
        (house,))
    return _ordinal_list(rows)


def published_talents(house, discipline=None):
    sql = """SELECT id, slug, title, discipline, published_at, position FROM items
             WHERE house_id=%s AND kind='talent' AND published"""
    params = [house]
    if discipline:
        sql += " AND discipline=%s"
        params.append(discipline)
    sql += " ORDER BY position, created_at"
    return db.query(sql, tuple(params))


def disciplines(house):
    """First appearance order over published talent."""
    rows = db.query(
        """SELECT DISTINCT ON (discipline) discipline FROM items
           WHERE house_id=%s AND kind='talent' AND published
           ORDER BY discipline, position, created_at""",
        (house,))
    seen = []
    rows2 = db.query(
        """SELECT discipline FROM items WHERE house_id=%s AND kind='talent' AND published
           ORDER BY position, created_at""", (house,))
    for r in rows2:
        if r["discipline"] not in seen:
            seen.append(r["discipline"])
    return seen


def work_by_slug(house, slug):
    rows = published_works(house)
    for i, w in enumerate(rows):
        if w["slug"] == slug.lower():
            w = dict(w)
            w["next"] = rows[(i + 1) % len(rows)] if len(rows) > 1 else None
            w["prev"] = rows[(i - 1) % len(rows)] if len(rows) > 1 else None
            return w
    return None


def talent_by_slug(house, slug):
    rows = published_talents(house)
    for t in rows:
        if t["slug"] == slug.lower():
            return dict(t)
    return None


def media_for(item_id, roles=None):
    sql = "SELECT id, role, position, seed, width, height, alt FROM media WHERE item_id=%s"
    params = [item_id]
    if roles:
        sql += " AND role = ANY(%s)"
        params.append(list(roles))
    sql += " ORDER BY position"
    return db.query(sql, tuple(params))


def credits_for(item_id):
    return db.query(
        """SELECT c.id, c.position, c.role, c.name, c.talent_item_id,
                  t.slug AS talent_slug, t.title AS talent_title
           FROM credits c LEFT JOIN items t ON t.id = c.talent_item_id
           WHERE c.item_id=%s ORDER BY c.position, c.created_at""", (item_id,))


def selected_works(house, talent_id):
    """A talent's selected work, read from credits only."""
    return db.query(
        """SELECT w.id, w.slug, w.title, w.variant, w.published, w.position
           FROM credits c JOIN items w ON w.id = c.item_id
           WHERE c.talent_item_id=%s AND w.house_id=%s AND w.kind='work' AND w.published
           ORDER BY w.position, c.position""", (talent_id, house))


def resolve_slug(house, kind, slug):
    """Published record by slug, following permanent redirects."""
    row = db.query(
        """SELECT i.id FROM items i WHERE i.house_id=%s AND i.kind=%s AND lower(i.slug)=%s
           AND i.published""", (house, kind, slug.lower()), one=True)
    if row:
        return row["id"], None
    red = db.query(
        """SELECT r.item_id FROM slug_redirects r JOIN items i ON i.id = r.item_id
           WHERE r.house_id=%s AND r.kind=%s AND lower(r.old_slug)=%s AND i.published""",
        (house, kind, slug.lower()), one=True)
    if red:
        return red["item_id"], slug
    return None, None
