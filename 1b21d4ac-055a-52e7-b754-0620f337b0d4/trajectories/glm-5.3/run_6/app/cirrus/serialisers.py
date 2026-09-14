"""Row to JSON shapes, one place per projection."""
from . import queries


def _iso(value):
    return value.isoformat() if value is not None else None


def work_card(row):
    return {
        "id": row["id"],
        "kind": "work",
        "slug": row["slug"],
        "title": row["title"],
        "ordinal": row.get("ordinal"),
        "variant": row.get("variant"),
        "published": row.get("published", False),
        "published_at": _iso(row.get("published_at")),
    }


def talent_card(row, discipline=None):
    return {
        "id": row["id"],
        "kind": "talent",
        "slug": row["slug"],
        "title": row["title"],
        "ordinal": row.get("ordinal"),
        "discipline": row.get("discipline") or discipline,
        "published": row.get("published", False),
        "published_at": _iso(row.get("published_at")),
    }


def media_json(row):
    return {
        "id": row["id"],
        "role": row["role"],
        "position": row["position"],
        "seed": row["seed"],
        "width": row["width"],
        "height": row["height"],
        "alt": row["alt"],
        "url": "/api/media/" + row["id"],
    }


def credit_json(row):
    linked = None
    if row.get("talent_item_id") and row.get("talent_slug") and row.get("talent_published"):
        linked = {"slug": row["talent_slug"], "title": row["talent_title"]}
    elif row.get("talent_item_id") and row.get("talent_slug"):
        linked = {"slug": row["talent_slug"], "title": row["talent_title"]}
    return {
        "id": row["id"],
        "role": row["role"],
        "name": row["name"],
        "talent_id": row.get("talent_item_id"),
        "talent": None
        if not row.get("talent_slug")
        else {"slug": row["talent_slug"], "title": row["talent_title"]},
    }


def work_full(cur, row, house_id):
    media = queries.item_media(cur, row["id"])
    credits = queries.item_credits(cur, row["id"])
    return {
        **work_card(row),
        "media": [media_json(m) for m in media],
        "credits": [credit_json(c) for c in credits],
        "neighbours": queries.work_neighbours(cur, house_id, row["id"]),
    }


def talent_full(cur, row, house_id):
    media = queries.item_media(cur, row["id"])
    selected = queries.talent_selected_work(cur, row["id"], house_id)
    for i, w in enumerate(selected):
        w["ordinal"] = queries.ordinal(i)
    return {
        **talent_card(row),
        "media": [media_json(m) for m in media],
        "selected_work": [work_card(w) for w in selected],
    }


def item_studio(row):
    if row["kind"] == "work":
        return {
            "id": row["id"],
            "kind": "work",
            "slug": row["slug"],
            "title": row["title"],
            "position": row["position"],
            "variant": row["variant"],
            "discipline": None,
            "published": row["published"],
            "published_at": _iso(row["published_at"]),
            "created_at": _iso(row["created_at"]),
        }
    return {
        "id": row["id"],
        "kind": "talent",
        "slug": row["slug"],
        "title": row["title"],
        "position": row["position"],
        "variant": None,
        "discipline": row["discipline"],
        "published": row["published"],
        "published_at": _iso(row["published_at"]),
        "created_at": _iso(row["created_at"]),
    }
