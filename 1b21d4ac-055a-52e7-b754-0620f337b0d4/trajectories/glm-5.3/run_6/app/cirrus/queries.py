"""Derived reads: ordinals, the discipline set, a talent's selected work and a
work's neighbours. None of these are stored; every one is computed at read time
from the published set of the served house."""
from . import db

ORDINAL_PAD = 3


def ordinal(index: int) -> str:
    return str(index + 1).zfill(ORDINAL_PAD)


def published_works(cur, house_id):
    rows = db.all_(
        cur,
        """select id, slug, title, position, variant, published, published_at, discipline
             from items where house_id = %s and kind = 'work' and published
            order by position, id""",
        (house_id,),
    )
    for i, row in enumerate(rows):
        row["ordinal"] = ordinal(i)
    return rows


def published_talents(cur, house_id, discipline=None):
    sql = """select id, slug, title, position, discipline, published, published_at
               from items where house_id = %s and kind = 'talent' and published"""
    args = [house_id]
    if discipline:
        sql += " and discipline = %s"
        args.append(discipline)
    sql += " order by position, id"
    rows = db.all_(cur, sql, args)
    for i, row in enumerate(rows):
        row["ordinal"] = ordinal(i)
    return rows


def discipline_set(cur, house_id):
    """The roster's filter set in first appearance order, never authored."""
    rows = db.all_(
        cur,
        """select discipline, min(position) as first_pos, min(id) as first_id
             from items
            where house_id = %s and kind = 'talent' and published and discipline is not null
            group by discipline order by first_pos, first_id""",
        (house_id,),
    )
    return [r["discipline"] for r in rows]


def item_media(cur, item_id):
    return db.all_(
        cur,
        """select id, role, position, seed, width, height, alt
             from media where item_id = %s
            order by (case role when 'poster' then 0 when 'reel' then 1 else 2 end),
                     position, id""",
        (item_id,),
    )


def item_credits(cur, item_id):
    return db.all_(
        cur,
        """select c.id, c.position, c.role, c.name, c.talent_item_id,
                  t.slug as talent_slug, t.title as talent_title, t.published as talent_published
             from credits c
             left join items t on t.id = c.talent_item_id
            where c.item_id = %s
            order by c.position, c.id""",
        (item_id,),
    )


def talent_selected_work(cur, talent_item_id, house_id):
    """A talent's selected work is read from credits, never stored on the talent."""
    return db.all_(
        cur,
        """select distinct w.id, w.slug, w.title, w.variant, w.position, w.published
             from credits c
             join items w on w.id = c.item_id
            where c.talent_item_id = %s and w.house_id = %s
              and w.kind = 'work' and w.published
            order by w.position, w.id""",
        (talent_item_id, house_id),
    )


def work_neighbours(cur, house_id, item_id):
    works = published_works(cur, house_id)
    if not works:
        return {"previous": None, "next": None}
    ids = [w["id"] for w in works]
    try:
        i = ids.index(item_id)
    except ValueError:
        return {"previous": None, "next": None}
    prev = works[(i - 1) % len(works)]
    nxt = works[(i + 1) % len(works)]
    return {
        "previous": {"slug": prev["slug"], "title": prev["title"], "ordinal": prev["ordinal"]},
        "next": {"slug": nxt["slug"], "title": nxt["title"], "ordinal": nxt["ordinal"]},
    }
