"""Reads and writes over the seven tables.

Every derived value the brief names -- the displayed ordinal, the discipline set,
a talent's selected work and a work's neighbours -- is computed here at read time
and never stored.
"""
import re
import secrets
from datetime import datetime, timedelta, timezone

import psycopg

from . import db

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DISCIPLINES = ("director", "photographer", "stylist")
VARIANTS = ("left", "right", "centre")
KINDS = ("work", "talent")
MEDIA_ROLES = ("poster", "reel", "gallery")

PREVIEW_TTL = timedelta(minutes=15)


class Refused(Exception):
    """A client error carrying a reason a person can read."""

    def __init__(self, message, status=400, field=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.field = field


class NotFound(Refused):
    def __init__(self, message="That record is not here."):
        super().__init__(message, status=404)


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    return str(value)


# ---------------------------------------------------------------- houses ----

def house_by_slug(slug):
    return db.query_one("SELECT * FROM houses WHERE slug=%s", (slug,))


# ---------------------------------------------------------------- media -----

def media_for(item_ids):
    if not item_ids:
        return {}
    rows = db.query(
        """SELECT * FROM media WHERE item_id = ANY(%s)
           ORDER BY item_id,
                    CASE role WHEN 'poster' THEN 0 WHEN 'reel' THEN 1 ELSE 2 END,
                    position, id""",
        (list(item_ids),),
    )
    out = {}
    for r in rows:
        out.setdefault(r["item_id"], []).append(r)
    return out


def media_json(row):
    return {
        "media_id": row["id"],
        "role": row["role"],
        "position": row["position"],
        "width": row["width"],
        "height": row["height"],
        "alt": row["alt"],
        "url": f"/api/media/{row['id']}",
    }


def poster_of(medias):
    for m in medias:
        if m["role"] == "poster":
            return m
    return None


def reel_of(medias):
    for m in medias:
        if m["role"] == "reel":
            return m
    return None


# ---------------------------------------------------------------- items -----

def published_items(house_id, kind):
    return db.query(
        """SELECT * FROM items
            WHERE house_id=%s AND kind=%s AND published = TRUE
            ORDER BY position, id""",
        (house_id, kind),
    )


def ordinal_string(index_zero_based: int) -> str:
    """Contiguous from 001, zero padded to three digits."""
    return f"{index_zero_based + 1:03d}"


def works_index(house_id):
    """The published works with their read-time ordinals and posters."""
    rows = published_items(house_id, "work")
    medias = media_for([r["id"] for r in rows])
    out = []
    for i, r in enumerate(rows):
        out.append(work_json(r, medias.get(r["id"], []), ordinal=ordinal_string(i)))
    return out


def work_json(row, medias, ordinal=None, credits=None, neighbours=None):
    poster = poster_of(medias)
    reel = reel_of(medias)
    data = {
        "id": row["id"],
        "kind": "work",
        "slug": row["slug"],
        "title": row["title"],
        "variant": row["variant"],
        "ordinal": ordinal,
        "published": row["published"],
        "published_at": iso(row["published_at"]),
        "href": f"/works/{row['slug']}",
        "poster": media_json(poster) if poster else None,
        "reel": media_json(reel) if reel else None,
        "media": [media_json(m) for m in medias],
    }
    if credits is not None:
        data["credits"] = credits
    if neighbours is not None:
        data["neighbours"] = neighbours
    return data


def talent_json(row, medias, selected_work=None):
    poster = poster_of(medias)
    reel = reel_of(medias)
    data = {
        "id": row["id"],
        "kind": "talent",
        "slug": row["slug"],
        "title": row["title"],
        "name": row["title"],
        "discipline": row["discipline"],
        "published": row["published"],
        "published_at": iso(row["published_at"]),
        "href": f"/talents/{row['slug']}",
        "poster": media_json(poster) if poster else None,
        "reel": media_json(reel) if reel else None,
        "media": [media_json(m) for m in medias],
    }
    if selected_work is not None:
        data["selected_work"] = selected_work
    return data


def talents_roster(house_id, discipline=None):
    rows = published_items(house_id, "talent")
    if discipline:
        rows = [r for r in rows if r["discipline"] == discipline]
    medias = media_for([r["id"] for r in rows])
    return [talent_json(r, medias.get(r["id"], [])) for r in rows]


def disciplines(house_id):
    """Derived from published talent in first appearance order, never authored."""
    rows = published_items(house_id, "talent")
    seen = []
    for r in rows:
        if r["discipline"] and r["discipline"] not in seen:
            seen.append(r["discipline"])
    return seen


def resolve_public_slug(house_id, kind, slug):
    """A published record at its slug, or at a slug it used to carry.

    Returns (item_row, canonical_slug_or_None). A redirect answer carries the
    canonical slug so the caller can send a permanent redirect.
    """
    row = db.query_one(
        """SELECT * FROM items
            WHERE house_id=%s AND kind=%s AND lower(slug)=lower(%s) AND published=TRUE""",
        (house_id, kind, slug),
    )
    if row:
        return row, None
    red = db.query_one(
        """SELECT i.* FROM slug_redirects r JOIN items i ON i.id = r.item_id
            WHERE r.house_id=%s AND r.kind=%s AND lower(r.old_slug)=lower(%s)
              AND i.published = TRUE""",
        (house_id, kind, slug),
    )
    if red:
        return red, red["slug"]
    return None, None


def credits_for_work(work_id, house_id):
    rows = db.query(
        """SELECT c.*, t.slug AS talent_slug, t.published AS talent_published,
                  t.house_id AS talent_house_id
             FROM credits c LEFT JOIN items t ON t.id = c.talent_item_id
            WHERE c.item_id = %s ORDER BY c.position, c.id""",
        (work_id,),
    )
    out = []
    for r in rows:
        linked = bool(
            r["talent_slug"] and r["talent_published"] and r["talent_house_id"] == house_id
        )
        out.append({
            "id": r["id"],
            "role": r["role"],
            "name": r["name"],
            "talent_id": r["talent_item_id"],
            "talent_slug": r["talent_slug"] if linked else None,
            "href": f"/talents/{r['talent_slug']}" if linked else None,
        })
    return out


def selected_work_for_talent(talent_id, house_id):
    """Read from credits, never stored on the talent."""
    rows = db.query(
        """SELECT DISTINCT w.id FROM credits c JOIN items w ON w.id = c.item_id
            WHERE c.talent_item_id = %s AND w.kind='work' AND w.published = TRUE
              AND w.house_id = %s""",
        (talent_id, house_id),
    )
    wanted = {r["id"] for r in rows}
    if not wanted:
        return []
    index = works_index(house_id)
    return [w for w in index if w["id"] in wanted]


def work_detail(house_id, slug):
    row, canonical = resolve_public_slug(house_id, "work", slug)
    if not row:
        return None, None
    index = published_items(house_id, "work")
    ids = [r["id"] for r in index]
    try:
        pos = ids.index(row["id"])
    except ValueError:
        return None, None
    medias = media_for([row["id"]]).get(row["id"], [])
    total = len(index)
    prev_row = index[(pos - 1) % total]
    next_row = index[(pos + 1) % total]
    neighbours = {
        "previous": {
            "slug": prev_row["slug"], "title": prev_row["title"],
            "ordinal": ordinal_string(ids.index(prev_row["id"])),
            "href": f"/works/{prev_row['slug']}",
        },
        "next": {
            "slug": next_row["slug"], "title": next_row["title"],
            "ordinal": ordinal_string(ids.index(next_row["id"])),
            "href": f"/works/{next_row['slug']}",
        },
    }
    data = work_json(
        row, medias, ordinal=ordinal_string(pos),
        credits=credits_for_work(row["id"], house_id), neighbours=neighbours,
    )
    return data, canonical


def talent_detail(house_id, slug):
    row, canonical = resolve_public_slug(house_id, "talent", slug)
    if not row:
        return None, None
    medias = media_for([row["id"]]).get(row["id"], [])
    data = talent_json(row, medias,
                       selected_work=selected_work_for_talent(row["id"], house_id))
    return data, canonical


# ------------------------------------------------------------ media reads ---

def media_row_visible(media_id, account=None):
    """A media row is readable while its record is published; while the record is
    unlisted it is not found to anyone but that record's own house producer,
    however the caller got the id."""
    if not isinstance(media_id, str) or not re.fullmatch(r"[0-9a-f]{32}", media_id):
        return None
    row = db.query_one(
        """SELECT m.*, i.published, i.house_id FROM media m
             JOIN items i ON i.id = m.item_id WHERE m.id = %s""",
        (media_id,),
    )
    if not row:
        return None
    if row["published"]:
        return row
    if account and account["role"] == "producer" and account["house_id"] == row["house_id"]:
        return row
    return None


# ---------------------------------------------------------------- studio ----

def studio_item(account, item_id):
    """One record of the caller's own house.

    A record of another house is answered exactly as a missing one, so the
    answer never confirms that the record is real.
    """
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        raise NotFound()
    row = db.query_one(
        "SELECT * FROM items WHERE id=%s AND house_id=%s", (item_id, account["house_id"])
    )
    if not row:
        raise NotFound()
    return row


def studio_item_json(row, medias=None, credits=None):
    medias = medias if medias is not None else media_for([row["id"]]).get(row["id"], [])
    data = {
        "id": row["id"],
        "kind": row["kind"],
        "slug": row["slug"],
        "title": row["title"],
        "position": row["position"],
        "discipline": row["discipline"],
        "variant": row["variant"],
        "published": row["published"],
        "published_at": iso(row["published_at"]),
        "created_at": iso(row["created_at"]),
        "media": [media_json(m) for m in medias],
        "public_path": (f"/works/{row['slug']}" if row["kind"] == "work"
                        else f"/talents/{row['slug']}"),
    }
    if row["kind"] == "work":
        data["credits"] = credits if credits is not None else credits_for_work(
            row["id"], row["house_id"])
    return data


def studio_items(account, kind=None):
    if kind and kind not in KINDS:
        raise Refused("kind must be 'work' or 'talent'.", 400, "kind")
    rows = db.query(
        """SELECT * FROM items WHERE house_id=%s AND (%s::text IS NULL OR kind = %s)
            ORDER BY kind, position, id""",
        (account["house_id"], kind, kind),
    )
    medias = media_for([r["id"] for r in rows])
    return [studio_item_json(r, medias.get(r["id"], [])) for r in rows]


def _validate_new(payload):
    kind = (payload.get("kind") or "").strip().lower()
    if kind not in KINDS:
        raise Refused("Kind must be 'work' or 'talent'.", 400, "kind")
    title = (payload.get("title") or "").strip()
    if not title:
        raise Refused("A title is required.", 400, "title")
    slug = slugify(payload.get("slug") or title)
    if not slug or not SLUG_RE.match(slug):
        raise Refused("A slug must be lowercase kebab case, like 'noor-vasquez'.",
                      400, "slug")
    discipline = (payload.get("discipline") or "").strip().lower() or None
    variant = (payload.get("variant") or "").strip().lower() or None
    if kind == "talent":
        if discipline not in DISCIPLINES:
            raise Refused("A talent needs a discipline: director, photographer or stylist.",
                          400, "discipline")
        variant = None
    else:
        if variant not in VARIANTS:
            raise Refused("A work needs a variant: left, right or centre.", 400, "variant")
        discipline = None
    return kind, slug, title, discipline, variant


def create_item(account, payload):
    kind, slug, title, discipline, variant = _validate_new(payload)
    conn = db.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT COALESCE(MAX(position), -1) + 1 AS p FROM items
                    WHERE house_id=%s AND kind=%s""",
                (account["house_id"], kind),
            )
            position = cur.fetchone()["p"]
            cur.execute(
                """INSERT INTO items (house_id, kind, slug, title, position, discipline,
                                      variant, published, published_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,FALSE,NULL) RETURNING *""",
                (account["house_id"], kind, slug, title, position, discipline, variant),
            )
            row = cur.fetchone()
        conn.commit()
    except psycopg.errors.UniqueViolation:
        # The database decides the winner of two simultaneous creates; the loser
        # leaves no partial record.
        conn.rollback()
        raise Refused(f"The slug '{slug}' is already taken for a {kind} in this house.",
                      409, "slug")
    except Exception:
        conn.rollback()
        raise
    return row


EDITABLE = {"title", "discipline", "variant", "position"}


def update_item(account, item_id, payload):
    row = studio_item(account, item_id)
    sets, params = [], []
    if "title" in payload:
        title = (payload.get("title") or "").strip()
        if not title:
            raise Refused("A title is required.", 400, "title")
        sets.append("title = %s")
        params.append(title)
    if "discipline" in payload and row["kind"] == "talent":
        d = (payload.get("discipline") or "").strip().lower()
        if d not in DISCIPLINES:
            raise Refused("A talent needs a discipline: director, photographer or stylist.",
                          400, "discipline")
        sets.append("discipline = %s")
        params.append(d)
    if "variant" in payload and row["kind"] == "work":
        v = (payload.get("variant") or "").strip().lower()
        if v not in VARIANTS:
            raise Refused("A work needs a variant: left, right or centre.", 400, "variant")
        sets.append("variant = %s")
        params.append(v)
    if not sets:
        return row
    params.extend([row["id"], account["house_id"]])
    return db.execute(
        f"UPDATE items SET {', '.join(sets)} WHERE id=%s AND house_id=%s RETURNING *",
        tuple(params), returning=True,
    )


def set_published(account, item_id, published: bool):
    row = studio_item(account, item_id)
    if published:
        poster = db.query_one(
            "SELECT * FROM media WHERE item_id=%s AND role='poster' ORDER BY position, id",
            (row["id"],),
        )
        if poster is None:
            raise Refused("This record needs a poster before it can be published.",
                          400, "poster")
        if not (poster["alt"] or "").strip():
            raise Refused(
                "The poster needs a written alternative before this record can be published.",
                400, "alt")
    return db.execute(
        """UPDATE items SET published = %s,
                  published_at = CASE WHEN %s THEN now() ELSE NULL END
            WHERE id = %s AND house_id = %s RETURNING *""",
        (published, published, row["id"], account["house_id"]), returning=True,
    )


def add_media(account, item_id, payload):
    row = studio_item(account, item_id)
    role = (payload.get("role") or "poster").strip().lower()
    if role not in MEDIA_ROLES:
        raise Refused("A media role is poster, reel or gallery.", 400, "role")
    alt = (payload.get("alt") or "").strip()
    if not alt:
        raise Refused("A written alternative is required on every media row.", 400, "alt")
    seed = (payload.get("seed") or "").strip() or secrets.token_hex(8)
    try:
        width = int(payload.get("width") or 0)
        height = int(payload.get("height") or 0)
    except (TypeError, ValueError):
        raise Refused("Width and height must be whole numbers.", 400, "width")
    if width <= 0 or height <= 0:
        raise Refused("Width and height must be greater than zero.", 400, "width")
    pos = db.query_one(
        "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM media WHERE item_id=%s AND role=%s",
        (row["id"], role),
    )["p"]
    return db.execute(
        """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
        (db.new_hex_id(), row["id"], role, pos, seed, width, height, alt),
        returning=True,
    )


def add_credit(account, item_id, payload):
    row = studio_item(account, item_id)
    if row["kind"] != "work":
        raise Refused("Credits belong to a work.", 400, "kind")
    role = (payload.get("role") or "").strip()
    name = (payload.get("name") or "").strip()
    if not role:
        raise Refused("A credit needs a role.", 400, "role")
    if not name:
        raise Refused("A credit needs a name.", 400, "name")
    talent_id = payload.get("talent_id") or payload.get("talent_item_id") or None
    if talent_id:
        try:
            talent_id = int(talent_id)
        except (TypeError, ValueError):
            raise NotFound()
        # A talent of another house is answered exactly as a missing one.
        linked = db.query_one(
            "SELECT id FROM items WHERE id=%s AND house_id=%s AND kind='talent'",
            (talent_id, account["house_id"]),
        )
        if not linked:
            raise NotFound()
    else:
        talent_id = None
    pos = db.query_one(
        "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM credits WHERE item_id=%s",
        (row["id"],),
    )["p"]
    return db.execute(
        """INSERT INTO credits (item_id, position, role, name, talent_item_id)
           VALUES (%s,%s,%s,%s,%s) RETURNING *""",
        (row["id"], pos, role, name, talent_id), returning=True,
    )


def change_slug(account, item_id, new_slug):
    row = studio_item(account, item_id)
    slug = slugify(new_slug)
    if not slug or not SLUG_RE.match(slug):
        raise Refused("A slug must be lowercase kebab case, like 'noor-vasquez'.",
                      400, "slug")
    if slug == row["slug"]:
        return row
    conn = db.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE items SET slug=%s WHERE id=%s AND house_id=%s RETURNING *",
                (slug, row["id"], account["house_id"]),
            )
            updated = cur.fetchone()
            cur.execute(
                """INSERT INTO slug_redirects (house_id, kind, old_slug, item_id)
                   VALUES (%s,%s,%s,%s)
                   ON CONFLICT DO NOTHING""",
                (account["house_id"], row["kind"], row["slug"], row["id"]),
            )
            # A slug coming back into use must stop redirecting to itself.
            cur.execute(
                """DELETE FROM slug_redirects
                    WHERE house_id=%s AND kind=%s AND lower(old_slug)=lower(%s)""",
                (account["house_id"], row["kind"], slug),
            )
        conn.commit()
    except psycopg.errors.UniqueViolation:
        conn.rollback()
        raise Refused(f"The slug '{slug}' is already taken for a {row['kind']} in this house.",
                      409, "slug")
    except Exception:
        conn.rollback()
        raise
    return updated


def reorder_works(account, ordered_ids):
    if not isinstance(ordered_ids, list) or not ordered_ids:
        raise Refused("Send the works' identifiers in their new order.", 400, "ordered_ids")
    try:
        ids = [int(i) for i in ordered_ids]
    except (TypeError, ValueError):
        raise NotFound()
    rows = db.query(
        "SELECT id FROM items WHERE id = ANY(%s) AND house_id=%s AND kind='work'",
        (ids, account["house_id"]),
    )
    if len(rows) != len(set(ids)):
        raise NotFound()
    conn = db.get_conn()
    try:
        with conn.cursor() as cur:
            for pos, item_id in enumerate(ids):
                cur.execute(
                    "UPDATE items SET position=%s WHERE id=%s AND house_id=%s",
                    (pos, item_id, account["house_id"]),
                )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return studio_items(account, "work")


def mint_preview_token(account, item_id):
    row = studio_item(account, item_id)
    token = db.new_hex_id()
    created = db.execute(
        """INSERT INTO preview_tokens (token, item_id, expires_at, created_by)
           VALUES (%s,%s, now() + interval '15 minutes', %s)
           RETURNING token, expires_at""",
        (token, row["id"], account["id"]), returning=True,
    )
    return {"token": created["token"].strip(), "expires_at": iso(created["expires_at"]),
            "item_id": row["id"], "preview_path": f"/preview/{created['token'].strip()}"}


def resolve_preview(account, token):
    """One record by its token, for its own house's producer only."""
    if not account or account["role"] != "producer":
        raise NotFound()
    if not isinstance(token, str) or not re.fullmatch(r"[0-9a-f]{32}", token):
        raise NotFound()
    row = db.query_one(
        """SELECT i.*, p.expires_at FROM preview_tokens p JOIN items i ON i.id = p.item_id
            WHERE p.token = %s AND p.expires_at > now() AND i.house_id = %s""",
        (token, account["house_id"]),
    )
    if not row:
        raise NotFound()
    return row
