"""JSON shapes for public and studio payloads."""
from datetime import timezone


def _iso(dt):
    if not dt:
        return None
    if hasattr(dt, "isoformat"):
        try:
            return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        except ValueError:
            return dt.isoformat()
    return dt


def media_payload(m):
    return {
        "id": m["id"],
        "role": m["role"],
        "position": m["position"],
        "width": m["width"],
        "height": m["height"],
        "alt": m["alt"],
        "url": "/api/media/%s" % m["id"],
    }


def credit_payload(c):
    out = {
        "id": c["id"],
        "position": c.get("position"),
        "role": c["role"],
        "name": c["name"],
        "talent_id": c.get("talent_item_id"),
    }
    if c.get("talent_slug"):
        out["talent_slug"] = c["talent_slug"]
        out["talent_title"] = c.get("talent_title")
        out["talent_published"] = bool(c.get("talent_published"))
    return out


def base_payload(row):
    out = {
        "id": row["id"],
        "kind": row["kind"],
        "slug": row["slug"],
        "title": row["title"],
        "position": row.get("position"),
        "published": bool(row["published"]),
        "published_at": _iso(row.get("published_at")),
        "created_at": _iso(row.get("created_at")),
    }
    if "ordinal" in row:
        out["ordinal"] = row["ordinal"]
    if row["kind"] == "talent":
        out["discipline"] = row.get("discipline")
    else:
        out["variant"] = row.get("variant")
    return out


def public_payload(row, media_rows=(), credit_rows=()):
    out = base_payload(row)
    out["media"] = [media_payload(m) for m in media_rows]
    out["credits"] = [credit_payload(c) for c in credit_rows]
    return out


def studio_payload(row, media_rows=None, credit_rows=None):
    out = base_payload(row)
    if media_rows is not None:
        out["media"] = [media_payload(m) for m in media_rows]
    if credit_rows is not None:
        out["credits"] = [credit_payload(c) for c in credit_rows]
    return out
