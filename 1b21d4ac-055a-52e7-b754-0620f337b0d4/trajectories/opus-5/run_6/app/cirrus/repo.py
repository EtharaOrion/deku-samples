"""Reads and writes. Every derived value is computed here at read time, never stored."""
import secrets
from datetime import datetime, timedelta, timezone

import psycopg2

from . import db

PREVIEW_TTL_MINUTES = 15
DISCIPLINES = ("director", "photographer", "stylist")
VARIANTS = ("left", "right", "centre")
KINDS = ("work", "talent")
MEDIA_ROLES = ("poster", "reel", "gallery")


class Conflict(Exception):
    """A rejection a person can read; the store is left exactly as it was found."""

    def __init__(self, message, status=409):
        super().__init__(message)
        self.message = message
        self.status = status


class Invalid(Conflict):
    def __init__(self, message):
        super().__init__(message, status=422)


# ---------------------------------------------------------------- houses

def house_by_slug(slug):
    return db.query("SELECT * FROM houses WHERE slug = %s", (slug,), one=True)


def house_by_id(house_id):
    return db.query("SELECT * FROM houses WHERE id = %s", (house_id,), one=True)


# ---------------------------------------------------------------- media

def media_for_items(item_ids):
    if not item_ids:
        return {}
    rows = db.query(
        """SELECT id, item_id, role, position, seed, width, height, alt
           FROM media WHERE item_id = ANY(%s) ORDER BY role, position, id""",
        (list(item_ids),),
    )
    out = {}
    for r in rows:
        out.setdefault(r["item_id"], []).append(r)
    return out


def media_payload(rows):
    return [
        {
            "media_id": r["id"],
            "role": r["role"],
            "position": r["position"],
            "width": r["width"],
            "height": r["height"],
            "alt": r["alt"],
            "url": f"/api/media/{r['id']}",
        }
        for r in rows
    ]


def split_media(rows):
    poster = next((m for m in rows if m["role"] == "poster"), None)
    reel = next((m for m in rows if m["role"] == "reel"), None)
    gallery = [m for m in rows if m["role"] == "gallery"]
    return poster, reel, gallery


def media_row(media_id):
    return db.query(
        """SELECT m.*, i.published, i.house_id, i.id AS item_id
           FROM media m JOIN items i ON i.id = m.item_id WHERE m.id = %s""",
        (media_id,),
        one=True,
    )


# ---------------------------------------------------------------- public reads

def ordinal(index):
    return f"{index + 1:03d}"


def published_works(house_id):
    rows = db.query(
        """SELECT * FROM items
           WHERE house_id=%s AND kind='work' AND published
           ORDER BY position, id""",
        (house_id,),
    )
    for i, r in enumerate(rows):
        r["ordinal"] = ordinal(i)
    return rows


def published_talents(house_id, discipline=None):
    rows = db.query(
        """SELECT * FROM items
           WHERE house_id=%s AND kind='talent' AND published
           ORDER BY position, id""",
        (house_id,),
    )
    for i, r in enumerate(rows):
        r["ordinal"] = ordinal(i)
    if discipline:
        rows = [r for r in rows if r["discipline"] == discipline]
    return rows


def disciplines(house_id):
    """Derived from published talent in first appearance order, never authored."""
    seen = []
    for row in published_talents(house_id):
        if row["discipline"] and row["discipline"] not in seen:
            seen.append(row["discipline"])
    return seen


def resolve_slug(house_id, kind, slug):
    """Returns (item, redirect_to_slug_or_None) honouring the permanent redirect rows."""
    slug = (slug or "").lower()
    item = db.query(
        "SELECT * FROM items WHERE house_id=%s AND kind=%s AND lower(slug)=%s",
        (house_id, kind, slug),
        one=True,
    )
    if item:
        return item, None
    red = db.query(
        """SELECT i.* FROM slug_redirects r JOIN items i ON i.id = r.item_id
           WHERE r.house_id=%s AND r.kind=%s AND lower(r.old_slug)=%s""",
        (house_id, kind, slug),
        one=True,
    )
    if red:
        return red, red["slug"]
    return None, None


def item_public(house_id, kind, slug):
    item, redirect = resolve_slug(house_id, kind, slug)
    if not item or not item["published"]:
        return None, redirect if item else None
    return item, redirect


def credits_for_work(work_id):
    rows = db.query(
        """SELECT c.id, c.position, c.role, c.name, c.talent_item_id,
                  t.slug AS talent_slug, t.published AS talent_published
           FROM credits c LEFT JOIN items t ON t.id = c.talent_item_id
           WHERE c.item_id=%s ORDER BY c.position, c.id""",
        (work_id,),
    )
    out = []
    for r in rows:
        linked = bool(r["talent_item_id"]) and bool(r["talent_published"])
        out.append(
            {
                "id": r["id"],
                "role": r["role"],
                "name": r["name"],
                "talent_slug": r["talent_slug"] if linked else None,
            }
        )
    return out


def selected_work_for_talent(house_id, talent_id):
    """A talent's selected work is read from credits and never stored on the talent."""
    works = published_works(house_id)
    by_id = {w["id"]: w for w in works}
    rows = db.query(
        """SELECT DISTINCT item_id FROM credits WHERE talent_item_id = %s""",
        (talent_id,),
    )
    picked = [by_id[r["item_id"]] for r in rows if r["item_id"] in by_id]
    picked.sort(key=lambda w: w["ordinal"])
    return picked


def neighbours(works, index):
    """Neighbours follow the ordinal and wrap at both ends."""
    if not works:
        return None, None
    prev = works[(index - 1) % len(works)]
    nxt = works[(index + 1) % len(works)]
    return prev, nxt


def work_view(house_id, item):
    works = published_works(house_id)
    index = next((i for i, w in enumerate(works) if w["id"] == item["id"]), None)
    if index is None:
        works = works + [dict(item, ordinal=ordinal(len(works)))]
        index = len(works) - 1
    row = works[index]
    prev, nxt = neighbours(works, index)
    media = media_for_items([item["id"]]).get(item["id"], [])
    poster, reel, gallery = split_media(media)
    return {
        "id": item["id"],
        "kind": "work",
        "slug": item["slug"],
        "title": item["title"],
        "variant": item["variant"],
        "ordinal": row["ordinal"],
        "published": item["published"],
        "published_at": item["published_at"],
        "poster": media_payload([poster])[0] if poster else None,
        "reel": media_payload([reel])[0] if reel else None,
        "gallery": media_payload(gallery),
        "media": media_payload(media),
        "credits": credits_for_work(item["id"]),
        "next": {"slug": nxt["slug"], "title": nxt["title"], "ordinal": nxt["ordinal"]}
        if nxt else None,
        "previous": {"slug": prev["slug"], "title": prev["title"], "ordinal": prev["ordinal"]}
        if prev else None,
    }


def talent_view(house_id, item):
    media = media_for_items([item["id"]]).get(item["id"], [])
    poster, reel, gallery = split_media(media)
    selected = selected_work_for_talent(house_id, item["id"])
    works_media = media_for_items([w["id"] for w in selected])
    selected_payload = []
    for w in selected:
        p, _, _ = split_media(works_media.get(w["id"], []))
        selected_payload.append(
            {
                "slug": w["slug"],
                "title": w["title"],
                "ordinal": w["ordinal"],
                "variant": w["variant"],
                "poster": media_payload([p])[0] if p else None,
            }
        )
    return {
        "id": item["id"],
        "kind": "talent",
        "slug": item["slug"],
        "title": item["title"],
        "discipline": item["discipline"],
        "published": item["published"],
        "published_at": item["published_at"],
        "poster": media_payload([poster])[0] if poster else None,
        "reel": media_payload([reel])[0] if reel else None,
        "gallery": media_payload(gallery),
        "media": media_payload(media),
        "selected_work": selected_payload,
    }


def works_index(house_id):
    works = published_works(house_id)
    media = media_for_items([w["id"] for w in works])
    out = []
    for w in works:
        poster, reel, _ = split_media(media.get(w["id"], []))
        out.append(
            {
                "id": w["id"],
                "slug": w["slug"],
                "title": w["title"],
                "ordinal": w["ordinal"],
                "variant": w["variant"],
                "poster": media_payload([poster])[0] if poster else None,
                "reel": media_payload([reel])[0] if reel else None,
            }
        )
    return out


def talents_index(house_id, discipline=None):
    talents = published_talents(house_id, discipline)
    media = media_for_items([t["id"] for t in talents])
    out = []
    for t in talents:
        poster, reel, _ = split_media(media.get(t["id"], []))
        out.append(
            {
                "id": t["id"],
                "slug": t["slug"],
                "title": t["title"],
                "discipline": t["discipline"],
                "poster": media_payload([poster])[0] if poster else None,
                "reel": media_payload([reel])[0] if reel else None,
            }
        )
    return out


def entry_cluster(house_id):
    """Roughly twenty stills, authored positions, stable overlap order."""
    works = works_index(house_id)
    if not works:
        return []
    spots = [
        (14.0, 22.0, 210, 3), (30.0, 12.0, 180, 1), (46.5, 20.0, 300, 5),
        (63.0, 13.0, 165, 2), (79.0, 24.0, 195, 4), (8.5, 47.0, 240, 2),
        (24.0, 41.0, 260, 6), (37.0, 58.0, 285, 7), (55.0, 45.0, 330, 8),
        (70.0, 55.0, 250, 6), (86.0, 46.0, 180, 3), (17.0, 72.0, 200, 4),
        (33.0, 80.0, 175, 2), (49.0, 84.0, 230, 5), (65.0, 76.0, 265, 6),
        (81.0, 82.0, 155, 1), (27.5, 30.0, 150, 9), (58.0, 27.5, 165, 9),
        (43.0, 68.0, 190, 7), (72.0, 36.0, 175, 5),
    ]
    out = []
    for i, (left, top, size, depth) in enumerate(spots):
        w = works[i % len(works)]
        out.append(dict(w, cluster_left=left, cluster_top=top, cluster_size=size,
                        cluster_depth=depth, cluster_key=f"c{i}"))
    return out


# ---------------------------------------------------------------- studio writes

def _now():
    return datetime.now(timezone.utc)


def owned_item(house_id, item_id):
    """A foreign record is answered exactly as a missing one: this returns None for both."""
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return None
    return db.query("SELECT * FROM items WHERE id=%s AND house_id=%s", (item_id, house_id),
                    one=True)


def studio_item_payload(house_id, item):
    media = media_for_items([item["id"]]).get(item["id"], [])
    poster, reel, gallery = split_media(media)
    payload = {
        "id": item["id"],
        "kind": item["kind"],
        "slug": item["slug"],
        "title": item["title"],
        "position": item["position"],
        "discipline": item["discipline"],
        "variant": item["variant"],
        "published": item["published"],
        "published_at": item["published_at"].isoformat() if item["published_at"] else None,
        "created_at": item["created_at"].isoformat() if item.get("created_at") else None,
        "public_path": ("/works/" if item["kind"] == "work" else "/talents/") + item["slug"],
        "media": media_payload(media),
        "poster": media_payload([poster])[0] if poster else None,
        "reel": media_payload([reel])[0] if reel else None,
        "gallery": media_payload(gallery),
        "credits": credits_for_work(item["id"]) if item["kind"] == "work" else [],
    }
    if item["kind"] == "work" and item["published"]:
        works = published_works(house_id)
        idx = next((i for i, w in enumerate(works) if w["id"] == item["id"]), None)
        payload["ordinal"] = ordinal(idx) if idx is not None else None
    else:
        payload["ordinal"] = None
    return payload


def studio_items(house_id, kind=None):
    if kind:
        if kind not in KINDS:
            raise Invalid("kind must be 'work' or 'talent'")
        rows = db.query(
            "SELECT * FROM items WHERE house_id=%s AND kind=%s ORDER BY kind, position, id",
            (house_id, kind),
        )
    else:
        rows = db.query(
            "SELECT * FROM items WHERE house_id=%s ORDER BY kind, position, id", (house_id,)
        )
    return [studio_item_payload(house_id, r) for r in rows]


def normalise_slug(raw):
    import re

    slug = (raw or "").strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    return slug


def create_item(house_id, data):
    kind = (data.get("kind") or "").strip()
    if kind not in KINDS:
        raise Invalid("kind must be 'work' or 'talent'")
    title = (data.get("title") or "").strip()
    if not title:
        raise Invalid("title is required")
    slug = normalise_slug(data.get("slug") or title)
    if not slug:
        raise Invalid("slug must contain at least one letter or number")
    discipline = (data.get("discipline") or "").strip() or None
    variant = (data.get("variant") or "").strip() or None
    if kind == "talent":
        variant = None
        if discipline not in DISCIPLINES:
            raise Invalid("discipline must be director, photographer or stylist")
    else:
        discipline = None
        variant = variant or "left"
        if variant not in VARIANTS:
            raise Invalid("variant must be left, right or centre")
    try:
        return db.execute(
            """INSERT INTO items (house_id, kind, slug, title, position, discipline, variant,
                                  published, published_at)
               VALUES (%s,%s,%s,%s,
                       COALESCE((SELECT MAX(position) + 1 FROM items
                                 WHERE house_id=%s AND kind=%s), 0),
                       %s,%s,FALSE,NULL)
               RETURNING *""",
            (house_id, kind, slug, title, house_id, kind, discipline, variant),
            returning=True,
        )
    except psycopg2.errors.UniqueViolation:
        # The database holds this, so two simultaneous creates cannot both land.
        raise Conflict(f"the slug '{slug}' is already used by another {kind} in this house")
    except psycopg2.IntegrityError as exc:
        raise Invalid(f"the record was rejected: {exc.diag.message_primary or 'invalid values'}")


def update_item(house_id, item, data):
    fields, args = [], []
    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            raise Invalid("title is required")
        fields.append("title = %s")
        args.append(title)
    if "discipline" in data and item["kind"] == "talent":
        discipline = (data.get("discipline") or "").strip()
        if discipline not in DISCIPLINES:
            raise Invalid("discipline must be director, photographer or stylist")
        fields.append("discipline = %s")
        args.append(discipline)
    if "variant" in data and item["kind"] == "work":
        variant = (data.get("variant") or "").strip()
        if variant not in VARIANTS:
            raise Invalid("variant must be left, right or centre")
        fields.append("variant = %s")
        args.append(variant)
    if not fields:
        return db.query("SELECT * FROM items WHERE id=%s", (item["id"],), one=True)
    args.extend([item["id"], house_id])
    return db.execute(
        f"UPDATE items SET {', '.join(fields)} WHERE id=%s AND house_id=%s RETURNING *",
        tuple(args),
        returning=True,
    )


def poster_alt_ok(item_id):
    poster = db.query(
        "SELECT alt FROM media WHERE item_id=%s AND role='poster' ORDER BY position, id LIMIT 1",
        (item_id,),
        one=True,
    )
    return bool(poster and (poster["alt"] or "").strip())


def set_published(house_id, item, published):
    if published:
        if not poster_alt_ok(item["id"]):
            raise Invalid(
                "this record cannot be published: its poster needs a written alternative"
            )
        return db.execute(
            """UPDATE items SET published = TRUE, published_at = now()
               WHERE id=%s AND house_id=%s RETURNING *""",
            (item["id"], house_id),
            returning=True,
        )
    return db.execute(
        """UPDATE items SET published = FALSE, published_at = NULL
           WHERE id=%s AND house_id=%s RETURNING *""",
        (item["id"], house_id),
        returning=True,
    )


def add_media(house_id, item, data):
    role = (data.get("role") or "poster").strip()
    if role not in MEDIA_ROLES:
        raise Invalid("role must be poster, reel or gallery")
    alt = (data.get("alt") or "").strip()
    if not alt:
        raise Invalid("a written alternative is required on every media row")
    seed = (data.get("seed") or "").strip() or secrets.token_hex(8)
    try:
        width = int(data.get("width") or 598)
        height = int(data.get("height") or 320)
    except (TypeError, ValueError):
        raise Invalid("width and height must be whole numbers")
    if width <= 0 or height <= 0 or width > 8000 or height > 8000:
        raise Invalid("width and height must be between 1 and 8000")
    media_id = secrets.token_hex(16)
    row = db.execute(
        """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
           VALUES (%s,%s,%s,
                   COALESCE((SELECT MAX(position) + 1 FROM media WHERE item_id=%s AND role=%s), 0),
                   %s,%s,%s,%s)
           RETURNING id, role, position, seed, width, height, alt""",
        (media_id, item["id"], role, item["id"], role, seed, width, height, alt),
        returning=True,
    )
    return {
        "media_id": row["id"],
        "role": row["role"],
        "width": row["width"],
        "height": row["height"],
        "alt": row["alt"],
        "seed": row["seed"],
        "url": f"/api/media/{row['id']}",
    }


def update_media_alt(house_id, item, media_id, alt):
    return db.execute(
        """UPDATE media SET alt=%s WHERE id=%s AND item_id=%s
           RETURNING id, role, width, height, alt""",
        ((alt or "").strip(), media_id, item["id"]),
        returning=True,
    )


def add_credit(house_id, item, data):
    if item["kind"] != "work":
        raise Invalid("credits belong to a work")
    role = (data.get("role") or "").strip()
    name = (data.get("name") or "").strip()
    if not role or not name:
        raise Invalid("a credit needs a role and a name")
    talent_id = data.get("talent_id") or data.get("talent_item_id")
    talent_item_id = None
    if talent_id not in (None, "", "null"):
        talent = owned_item(house_id, talent_id)
        if not talent or talent["kind"] != "talent":
            raise Invalid("that talent is not a record of this house")
        talent_item_id = talent["id"]
    return db.execute(
        """INSERT INTO credits (item_id, position, role, name, talent_item_id)
           VALUES (%s, COALESCE((SELECT MAX(position) + 1 FROM credits WHERE item_id=%s), 0),
                   %s,%s,%s)
           RETURNING id, item_id, position, role, name, talent_item_id""",
        (item["id"], item["id"], role, name, talent_item_id),
        returning=True,
    )


def change_slug(house_id, item, raw_slug):
    """A rename leaves the old address redirecting forever."""
    slug = normalise_slug(raw_slug)
    if not slug:
        raise Invalid("slug must contain at least one letter or number")
    if slug == item["slug"].lower():
        return item
    old = item["slug"]
    try:
        with db.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE items SET slug=%s WHERE id=%s AND house_id=%s",
                    (slug, item["id"], house_id),
                )
                cur.execute(
                    """INSERT INTO slug_redirects (house_id, kind, old_slug, item_id)
                       VALUES (%s,%s,%s,%s)
                       ON CONFLICT (house_id, kind, old_slug) DO UPDATE SET item_id = EXCLUDED.item_id""",
                    (house_id, item["kind"], old, item["id"]),
                )
                cur.execute(
                    "DELETE FROM slug_redirects WHERE house_id=%s AND kind=%s AND old_slug=%s",
                    (house_id, item["kind"], slug),
                )
    except psycopg2.errors.UniqueViolation:
        raise Conflict(f"the slug '{slug}' is already used by another {item['kind']} in this house")
    return db.query("SELECT * FROM items WHERE id=%s", (item["id"],), one=True)


def reorder_works(house_id, ordered_ids):
    if not isinstance(ordered_ids, list) or not ordered_ids:
        raise Invalid("ordered_ids must be a non-empty array of this house's work ids")
    try:
        ids = [int(i) for i in ordered_ids]
    except (TypeError, ValueError):
        raise Invalid("ordered_ids must be whole numbers")
    rows = db.query(
        "SELECT id FROM items WHERE house_id=%s AND kind='work' AND id = ANY(%s)",
        (house_id, ids),
    )
    if len(rows) != len(set(ids)):
        return None  # a foreign or missing id is answered exactly as not found
    with db.connection() as conn:
        with conn.cursor() as cur:
            for pos, item_id in enumerate(ids):
                cur.execute(
                    "UPDATE items SET position=%s WHERE id=%s AND house_id=%s",
                    (pos, item_id, house_id),
                )
    return studio_items(house_id, "work")


def mint_preview_token(house_id, item, account_id):
    token = secrets.token_hex(16)
    expires = _now() + timedelta(minutes=PREVIEW_TTL_MINUTES)
    db.execute(
        """INSERT INTO preview_tokens (token, item_id, expires_at, created_by)
           VALUES (%s,%s,%s,%s)""",
        (token, item["id"], expires, account_id),
    )
    return {"token": token, "expires_at": expires.isoformat(), "item_id": item["id"],
            "url": f"/preview/{token}"}


def resolve_preview(token, house_id):
    """A token resolves only for its own record's house, and only before it expires."""
    if not token or len(token) != 32 or any(c not in "0123456789abcdef" for c in token):
        return None
    row = db.query(
        """SELECT p.token, p.expires_at, i.*
           FROM preview_tokens p JOIN items i ON i.id = p.item_id
           WHERE p.token = %s""",
        (token,),
        one=True,
    )
    if not row:
        return None
    if row["house_id"] != house_id:
        return None
    if row["expires_at"] < _now():
        return None
    return row
