"""Reads.

Four values a visitor meets are never stored: a work's displayed ordinal, the
roster's discipline set, a talent's selected work and a work's neighbours.  All
four are computed here, at read time, from the published set.
"""

from __future__ import annotations

from . import db, media as media_gen
from .config import served_house, slug_of

DISCIPLINES = ("director", "photographer", "stylist")
VARIANTS = ("left", "right", "centre")
KINDS = ("work", "talent")
MEDIA_ROLES = ("poster", "reel", "gallery")

# Intrinsic sizes the work index reserves space from, by variant.
VARIANT_SIZE = {
    "left": (598, 320),
    "right": (300, 300),
    "centre": (1006, 617),
}


def ordinal_of(index: int) -> str:
    return f"{index + 1:03d}"


def house_by_slug(slug: str) -> dict | None:
    return db.one("SELECT * FROM houses WHERE slug = %s", (slug_of(slug),))


def house_by_id(house_id: int) -> dict | None:
    return db.one("SELECT * FROM houses WHERE id = %s", (house_id,))


def public_house() -> dict | None:
    return house_by_slug(served_house())


def published_items(house_id: int, kind: str) -> list[dict]:
    """The published set of one kind, in stored order.  This order is the ordinal."""
    return db.query(
        "SELECT * FROM items WHERE house_id = %s AND kind = %s AND published = TRUE"
        " ORDER BY position ASC, id ASC",
        (house_id, kind),
    )


def house_items(house_id: int, kind: str | None = None) -> list[dict]:
    if kind:
        return db.query(
            "SELECT * FROM items WHERE house_id = %s AND kind = %s"
            " ORDER BY position ASC, id ASC",
            (house_id, kind),
        )
    return db.query(
        "SELECT * FROM items WHERE house_id = %s ORDER BY kind ASC, position ASC, id ASC",
        (house_id,),
    )


def item_by_id(item_id: int) -> dict | None:
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return None
    return db.one("SELECT * FROM items WHERE id = %s", (item_id,))


def item_in_house(item_id: int, house_id: int) -> dict | None:
    """A record of another house is answered exactly as a record that is not there."""
    item = item_by_id(item_id)
    if item is None or item["house_id"] != house_id:
        return None
    return item


def published_item_by_slug(house_id: int, kind: str, slug: str) -> dict | None:
    return db.one(
        "SELECT * FROM items WHERE house_id = %s AND kind = %s AND slug = %s"
        " AND published = TRUE",
        (house_id, kind, slug_of(slug)),
    )


def redirect_target(house_id: int, kind: str, slug: str) -> dict | None:
    row = db.one(
        "SELECT item_id FROM slug_redirects WHERE house_id = %s AND kind = %s"
        " AND old_slug = %s",
        (house_id, kind, slug_of(slug)),
    )
    if row is None:
        return None
    return item_by_id(row["item_id"])


def media_for(item_id: int) -> list[dict]:
    return db.query(
        "SELECT * FROM media WHERE item_id = %s ORDER BY position ASC, id ASC",
        (item_id,),
    )


def media_by_id(media_id: str) -> dict | None:
    if not isinstance(media_id, str) or len(media_id) != 32:
        return None
    return db.one("SELECT * FROM media WHERE id = %s", (media_id.lower(),))


def poster_of(rows: list[dict]) -> dict | None:
    for row in rows:
        if row["role"] == "poster":
            return row
    return None


def credits_for(item_id: int) -> list[dict]:
    return db.query(
        "SELECT * FROM credits WHERE item_id = %s ORDER BY position ASC, id ASC",
        (item_id,),
    )


def credits_naming(talent_item_id: int) -> list[dict]:
    return db.query(
        "SELECT * FROM credits WHERE talent_item_id = %s ORDER BY position ASC, id ASC",
        (talent_item_id,),
    )


def discipline_set(house_id: int) -> list[str]:
    """Derived from published talent in first-appearance order, never authored."""
    seen: list[str] = []
    for talent in published_items(house_id, "talent"):
        name = talent.get("discipline")
        if name and name not in seen:
            seen.append(name)
    return seen


# -- serialisation -----------------------------------------------------------


def _media_payload(rows: list[dict]) -> list[dict]:
    return [media_gen.descriptor(row) for row in rows]


def _stub(item: dict, ordinal: str | None = None) -> dict:
    return {
        "id": item["id"],
        "slug": item["slug"],
        "title": item["title"],
        "kind": item["kind"],
        "ordinal": ordinal,
        "variant": item.get("variant"),
        "discipline": item.get("discipline"),
    }


def work_summary(item: dict, ordinal: str) -> dict:
    rows = media_for(item["id"])
    poster = poster_of(rows)
    width, height = VARIANT_SIZE.get(item.get("variant") or "left", (598, 320))
    return {
        "id": item["id"],
        "kind": "work",
        "slug": item["slug"],
        "title": item["title"],
        "ordinal": ordinal,
        "variant": item.get("variant") or "left",
        "published": bool(item["published"]),
        "published_at": _stamp(item["published_at"]),
        "width": poster["width"] if poster else width,
        "height": poster["height"] if poster else height,
        "poster": media_gen.descriptor(poster) if poster else None,
        "href": f"/works/{item['slug']}",
    }


def work_detail(item: dict, ordinal: str, ring: list[dict]) -> dict:
    rows = media_for(item["id"])
    payload = work_summary(item, ordinal)
    payload["media"] = _media_payload(rows)
    payload["reel"] = next(
        (media_gen.descriptor(row) for row in rows if row["role"] == "reel"), None
    )
    payload["stills"] = [
        media_gen.descriptor(row) for row in rows if row["role"] in ("poster", "gallery")
    ]
    payload["credits"] = [_credit_payload(row) for row in credits_for(item["id"])]

    payload["next"], payload["previous"] = _neighbours(item, ring)
    return payload


def _neighbours(item: dict, ring: list[dict]) -> tuple[dict | None, dict | None]:
    """Neighbours follow the ordinal and wrap at both ends."""
    if not ring:
        return None, None
    index = next((i for i, row in enumerate(ring) if row["id"] == item["id"]), None)
    if index is None:
        return None, None
    after = (index + 1) % len(ring)
    before = (index - 1) % len(ring)
    return (
        _stub(ring[after], ordinal_of(after)),
        _stub(ring[before], ordinal_of(before)),
    )


def _credit_payload(row: dict) -> dict:
    payload = {
        "id": row["id"],
        "role": row["role"],
        "name": row["name"],
        "talent_id": row["talent_item_id"],
        "href": None,
    }
    if row["talent_item_id"]:
        talent = item_by_id(row["talent_item_id"])
        if talent and talent["published"]:
            payload["href"] = f"/talents/{talent['slug']}"
            payload["talent_slug"] = talent["slug"]
    return payload


def talent_summary(item: dict, index: int | None = None) -> dict:
    rows = media_for(item["id"])
    poster = poster_of(rows)
    return {
        "id": item["id"],
        "kind": "talent",
        "slug": item["slug"],
        "title": item["title"],
        "name": item["title"],
        "discipline": item.get("discipline"),
        "ordinal": ordinal_of(index) if index is not None else None,
        "published": bool(item["published"]),
        "published_at": _stamp(item["published_at"]),
        "width": poster["width"] if poster else 246,
        "height": poster["height"] if poster else 308,
        "poster": media_gen.descriptor(poster) if poster else None,
        "href": f"/talents/{item['slug']}",
    }


def talent_detail(item: dict, index: int | None = None) -> dict:
    rows = media_for(item["id"])
    payload = talent_summary(item, index)
    payload["media"] = _media_payload(rows)
    payload["reel"] = next(
        (media_gen.descriptor(row) for row in rows if row["role"] == "reel"), None
    )
    payload["selected_work"] = selected_work(item)
    return payload


def selected_work(talent: dict) -> list[dict]:
    """Read from credits, never stored on the talent.

    Reuses the work index entry shape so the route can draw it with the same
    component, colour return included.
    """
    ring = published_items(talent["house_id"], "work")
    order = {row["id"]: index for index, row in enumerate(ring)}
    entries: list[dict] = []
    for credit in credits_naming(talent["id"]):
        index = order.get(credit["item_id"])
        if index is None:
            continue
        entry = work_summary(ring[index], ordinal_of(index))
        entry["credited_as"] = credit["role"]
        entries.append(entry)
    return entries


def _stamp(value) -> str | None:
    if value is None:
        return None
    return value.isoformat()


# -- composed public reads ---------------------------------------------------


def public_works(house: dict) -> list[dict]:
    ring = published_items(house["id"], "work")
    return [work_summary(row, ordinal_of(index)) for index, row in enumerate(ring)]


def public_work(house: dict, slug: str) -> dict | None:
    ring = published_items(house["id"], "work")
    index = next((i for i, row in enumerate(ring) if row["slug"] == slug_of(slug)), None)
    if index is None:
        return None
    return work_detail(ring[index], ordinal_of(index), ring)


def public_talents(house: dict, discipline: str | None = None) -> list[dict]:
    ring = published_items(house["id"], "talent")
    rows = [talent_summary(row, index) for index, row in enumerate(ring)]
    if discipline:
        wanted = str(discipline).lower()
        rows = [row for row in rows if row["discipline"] == wanted]
    return rows


def public_talent(house: dict, slug: str) -> dict | None:
    ring = published_items(house["id"], "talent")
    index = next((i for i, row in enumerate(ring) if row["slug"] == slug_of(slug)), None)
    if index is None:
        return None
    return talent_detail(ring[index], index)


def studio_payload(item: dict) -> dict:
    """A record as its own house's producer sees it, published or not."""
    rows = media_for(item["id"])
    poster = poster_of(rows)
    ordinal = None
    if item["published"]:
        ring = published_items(item["house_id"], item["kind"])
        index = next((i for i, row in enumerate(ring) if row["id"] == item["id"]), None)
        if index is not None:
            ordinal = ordinal_of(index)
    return {
        "id": item["id"],
        "house_id": item["house_id"],
        "kind": item["kind"],
        "slug": item["slug"],
        "title": item["title"],
        "position": item["position"],
        "discipline": item.get("discipline"),
        "variant": item.get("variant"),
        "published": bool(item["published"]),
        "published_at": _stamp(item["published_at"]),
        "created_at": _stamp(item["created_at"]),
        "ordinal": ordinal,
        "href": f"/{'works' if item['kind'] == 'work' else 'talents'}/{item['slug']}",
        "poster": media_gen.descriptor(poster) if poster else None,
        "media": _media_payload(rows),
        "credits": [_credit_payload(row) for row in credits_for(item["id"])],
    }


def preview_payload(item: dict) -> dict:
    """An unlisted record in full, for its own house's producer."""
    if item["kind"] == "work":
        ring = published_items(item["house_id"], "work")
        payload = work_detail(item, None, ring + [item])
    else:
        payload = talent_detail(item, None)
    payload["preview"] = True
    payload["published"] = bool(item["published"])
    payload["published_at"] = _stamp(item["published_at"])
    return payload
