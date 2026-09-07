"""Reads and writes. Ordinals, disciplines, selected work and neighbours are derived here."""
from __future__ import annotations

import datetime as dt

from . import db


# --------------------------------------------------------------------------- houses


def house_by_slug(slug: str):
    return db.query_one("SELECT * FROM houses WHERE slug = %s", (slug,))


def account_by_email(email: str):
    return db.query_one("SELECT * FROM accounts WHERE email = %s", (email.lower(),))


def account_by_id(account_id: int):
    return db.query_one("SELECT * FROM accounts WHERE id = %s", (account_id,))


def create_viewer(email: str, password_hash: str):
    return db.execute(
        "INSERT INTO accounts (email, password_hash, role, house_id) "
        "VALUES (%s,%s,'viewer',NULL) RETURNING id, email, role, house_id, created_at",
        (email.lower(), password_hash),
    )


# --------------------------------------------------------------------------- items


def _media_for(item_ids: list[int]) -> dict[int, list[dict]]:
    if not item_ids:
        return {}
    rows = db.query(
        "SELECT * FROM media WHERE item_id = ANY(%s) ORDER BY item_id, role, position, id",
        (item_ids,),
    )
    out: dict[int, list[dict]] = {}
    for r in rows:
        out.setdefault(r["item_id"], []).append(r)
    return out


def _shape_media(m: dict) -> dict:
    return {
        "media_id": m["id"],
        "role": m["role"],
        "position": m["position"],
        "width": m["width"],
        "height": m["height"],
        "alt": m["alt"],
        "url": f"/api/media/{m['id']}",
    }


def published_items(house_id: int, kind: str) -> list[dict]:
    return db.query(
        "SELECT * FROM items WHERE house_id=%s AND kind=%s AND published "
        "ORDER BY position, id",
        (house_id, kind),
    )


def shape_item(item: dict, media: list[dict] | None = None, ordinal: int | None = None) -> dict:
    out = {
        "id": item["id"],
        "kind": item["kind"],
        "slug": item["slug"],
        "title": item["title"],
        "position": item["position"],
        "published": item["published"],
        "published_at": iso(item["published_at"]),
        "created_at": iso(item["created_at"]),
    }
    if item["kind"] == "work":
        out["variant"] = item["variant"]
        if ordinal is not None:
            out["ordinal"] = ordinal
            out["ordinal_label"] = f"{ordinal:03d}"
        out["href"] = f"/works/{item['slug']}"
    else:
        out["discipline"] = item["discipline"]
        out["href"] = f"/talents/{item['slug']}"
    if media is not None:
        shaped = [_shape_media(m) for m in media]
        out["media"] = shaped
        posters = [m for m in shaped if m["role"] == "poster"]
        reels = [m for m in shaped if m["role"] == "reel"]
        out["poster"] = posters[0] if posters else None
        out["reel"] = reels[0] if reels else None
        out["gallery"] = [m for m in shaped if m["role"] == "gallery"]
    return out


def iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        return value.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value)


def works_index(house_id: int) -> list[dict]:
    """The published works of a house, in stored order, with contiguous ordinals from 001."""
    items = published_items(house_id, "work")
    media = _media_for([i["id"] for i in items])
    return [
        shape_item(item, media.get(item["id"], []), ordinal=n)
        for n, item in enumerate(items, start=1)
    ]


def talents_roster(house_id: int, discipline: str | None = None) -> list[dict]:
    items = published_items(house_id, "talent")
    if discipline:
        items = [i for i in items if i["discipline"] == discipline]
    media = _media_for([i["id"] for i in items])
    return [shape_item(item, media.get(item["id"], [])) for item in items]


def disciplines(house_id: int) -> list[str]:
    """Derived from the published talent set, in first appearance order. Never authored."""
    out: list[str] = []
    for item in published_items(house_id, "talent"):
        d = item["discipline"]
        if d and d not in out:
            out.append(d)
    return out


def item_by_slug(house_id: int, kind: str, slug: str):
    return db.query_one(
        "SELECT * FROM items WHERE house_id=%s AND kind=%s AND lower(slug)=lower(%s)",
        (house_id, kind, slug),
    )


def redirect_for(house_id: int, kind: str, old_slug: str):
    row = db.query_one(
        """SELECT i.slug AS slug FROM slug_redirects r JOIN items i ON i.id = r.item_id
           WHERE r.house_id=%s AND r.kind=%s AND lower(r.old_slug)=lower(%s)""",
        (house_id, kind, old_slug),
    )
    return row["slug"] if row else None


def item_media(item_id: int) -> list[dict]:
    return db.query(
        "SELECT * FROM media WHERE item_id=%s ORDER BY role, position, id", (item_id,)
    )


def credits_for(item_id: int, house_id: int) -> list[dict]:
    rows = db.query(
        """SELECT c.*, t.slug AS talent_slug, t.title AS talent_title, t.published AS talent_published
           FROM credits c LEFT JOIN items t ON t.id = c.talent_item_id AND t.house_id = %s
           WHERE c.item_id=%s ORDER BY c.position, c.id""",
        (house_id, item_id),
    )
    out = []
    for r in rows:
        linked = bool(r["talent_slug"]) and bool(r["talent_published"])
        out.append(
            {
                "id": r["id"],
                "position": r["position"],
                "role": r["role"],
                "name": r["name"],
                "talent_id": r["talent_item_id"],
                "talent_slug": r["talent_slug"] if linked else None,
                "href": f"/talents/{r['talent_slug']}" if linked else None,
            }
        )
    return out


def selected_work_for_talent(house_id: int, talent_id: int) -> list[dict]:
    """Read from credits, never stored on the talent, and only published works."""
    index = works_index(house_id)
    by_id = {w["id"]: w for w in index}
    rows = db.query(
        """SELECT DISTINCT c.item_id AS work_id, c.role AS role
           FROM credits c WHERE c.talent_item_id = %s""",
        (talent_id,),
    )
    roles = {r["work_id"]: r["role"] for r in rows}
    out = []
    for w in index:
        if w["id"] in roles:
            entry = dict(by_id[w["id"]])
            entry["credited_as"] = roles[w["id"]]
            out.append(entry)
    return out


def neighbours(house_id: int, work_id: int) -> dict:
    """Neighbours follow the ordinal and wrap at both ends."""
    index = works_index(house_id)
    if not index:
        return {"previous": None, "next": None}
    pos = next((n for n, w in enumerate(index) if w["id"] == work_id), None)
    if pos is None:
        return {"previous": None, "next": None}
    prev = index[(pos - 1) % len(index)]
    nxt = index[(pos + 1) % len(index)]
    brief = lambda w: {
        "slug": w["slug"],
        "title": w["title"],
        "ordinal": w["ordinal"],
        "ordinal_label": w["ordinal_label"],
        "href": w["href"],
    }
    return {"previous": brief(prev), "next": brief(nxt)}


def work_detail(house_id: int, item: dict) -> dict:
    index = works_index(house_id)
    ordinal = next((w["ordinal"] for w in index if w["id"] == item["id"]), None)
    shaped = shape_item(item, item_media(item["id"]), ordinal=ordinal)
    shaped["credits"] = credits_for(item["id"], house_id)
    shaped["neighbours"] = neighbours(house_id, item["id"]) if item["published"] else {
        "previous": None,
        "next": None,
    }
    return shaped


def talent_detail(house_id: int, item: dict) -> dict:
    shaped = shape_item(item, item_media(item["id"]))
    shaped["selected_work"] = selected_work_for_talent(house_id, item["id"])
    shaped["disciplines"] = disciplines(house_id)
    return shaped


def publish_version(house_id: int) -> str:
    """A validator for the house's published state. Publishing or unlisting moves it, which
    is what revalidates every cached public read at once."""
    row = db.query_one(
        """SELECT count(*) AS n,
                  COALESCE(MAX(published_at), TIMESTAMPTZ 'epoch') AS latest,
                  COALESCE(SUM(position), 0) AS order_sum
           FROM items WHERE house_id = %s AND published""",
        (house_id,),
    )
    return f'{row["n"]}-{row["order_sum"]}-{row["latest"].timestamp():.0f}'


def media_row(media_id: str):
    return db.query_one(
        """SELECT m.*, i.house_id AS house_id, i.published AS item_published, i.id AS owner_id
           FROM media m JOIN items i ON i.id = m.item_id WHERE m.id = %s""",
        (media_id,),
    )
