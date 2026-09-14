"""Query helpers shared by page routes."""
from . import db, reads


def page_works():
    house = reads.house_id()
    rows = reads.published_works(house)
    out = []
    for w in rows:
        media = reads.media_for(w["id"], roles=["poster"])
        out.append({
            "id": w["id"], "slug": w["slug"], "title": w["title"],
            "variant": w["variant"] or "left", "ordinal": w["ordinal"],
            "poster": media[0] if media else None,
        })
    return out


def page_work(slug):
    house = reads.house_id()
    item_id, _ = reads.resolve_slug(house, "work", slug)
    if not item_id:
        return None
    current = db.query("SELECT * FROM items WHERE id=%s", (item_id,), one=True)
    w = reads.work_by_slug(house, current["slug"])
    if not w:
        return None
    media = reads.media_for(item_id)
    return {
        "id": item_id, "slug": w["slug"], "title": w["title"],
        "variant": w["variant"] or "left", "ordinal": w["ordinal"],
        "reel": first_of(media, "reel"), "poster": first_of(media, "poster"),
        "gallery": [m for m in media if m["role"] == "gallery"],
        "credits": reads.credits_for(item_id),
        "next": w.get("next"), "prev": w.get("prev"),
    }


def first_of(media, role):
    for m in media:
        if m["role"] == role:
            return m
    return None


def page_talents():
    house = reads.house_id()
    rows = reads.published_talents(house)
    out = []
    for t in rows:
        media = reads.media_for(t["id"], roles=["poster"])
        out.append({
            "id": t["id"], "slug": t["slug"], "title": t["title"],
            "discipline": t["discipline"],
            "poster": media[0] if media else None,
        })
    return out


def page_talent(slug):
    house = reads.house_id()
    t = reads.talent_by_slug(house, slug)
    if not t:
        return None
    media = reads.media_for(t["id"])
    works = reads.selected_works(house, t["id"])
    works_out = []
    for w in works:
        m = reads.media_for(w["id"], roles=["poster"])
        ord_rows = reads.published_works(house)
        ordinal = next((r["ordinal"] for r in ord_rows if r["id"] == w["id"]), None)
        works_out.append({
            "slug": w["slug"], "title": w["title"], "variant": w["variant"] or "left",
            "ordinal": ordinal, "poster": m[0] if m else None,
        })
    return {
        "id": t["id"], "slug": t["slug"], "title": t["title"],
        "discipline": t["discipline"],
        "poster": first_of(media, "poster"), "reel": first_of(media, "reel"),
        "selected": works_out,
    }


