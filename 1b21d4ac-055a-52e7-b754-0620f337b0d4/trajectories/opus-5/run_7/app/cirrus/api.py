"""The JSON API under /api. Authorization lives here, on every studio endpoint, reads included."""
from __future__ import annotations

import datetime as dt
import re

import psycopg
from flask import Blueprint, Response, current_app, jsonify, request

from . import auth, db, media as media_gen, repo, security

bp = Blueprint("api", __name__, url_prefix="/api")

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
KINDS = ("work", "talent")
DISCIPLINES = ("director", "photographer", "stylist")
VARIANTS = ("left", "right", "centre")
MEDIA_ROLES = ("poster", "reel", "gallery")
PREVIEW_TTL_MINUTES = 15


def fail(status: int, reason: str):
    """A refusal in the client-error range carrying a reason a person can read."""
    return jsonify({"error": reason, "status": status}), status


def not_found():
    """A foreign record is answered exactly as a missing one, so nothing is confirmed."""
    return fail(404, "Not found.")


def body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def public_read(payload, house_id: int):
    """A cacheable public read. Its validator moves when a record is published or unlisted,
    so publishing revalidates every cached read at once."""
    resp = jsonify(payload)
    resp.headers["Cache-Control"] = "public, max-age=60, must-revalidate"
    resp.set_etag(f'{request.path}:{repo.publish_version(house_id)}')
    return resp.make_conditional(request)


def served_house():
    house = repo.house_by_slug(current_app.config["HOUSE_SLUG"])
    if not house:
        raise RuntimeError("served house missing from the database")
    return house


def slugify(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", (value or "").strip()).strip("-").lower()
    return re.sub(r"-{2,}", "-", value)


# --------------------------------------------------------------------------- auth


@bp.post("/auth/signup")
def signup():
    data = body()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or "@" not in email:
        return fail(400, "A valid email address is required.")
    if len(password) < 8:
        return fail(400, "A password of at least 8 characters is required.")
    if repo.account_by_email(email):
        return fail(409, "An account with that email address already exists.")
    account = repo.create_viewer(email, security.hash_password(password))
    token, expires_at = security.mint_token(account["id"])
    return (
        jsonify(
            {
                "account": {
                    "id": account["id"],
                    "email": account["email"],
                    "role": "viewer",
                    "house_id": None,
                },
                "token": token,
                "expires_at": dt.datetime.fromtimestamp(
                    expires_at, dt.timezone.utc
                ).isoformat().replace("+00:00", "Z"),
            }
        ),
        201,
    )


@bp.post("/auth/login")
def login():
    data = body()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    account = repo.account_by_email(email) if email else None
    if not account or not security.verify_password(password, account["password_hash"]):
        return fail(401, "That email and password do not match an account.")
    token, expires_at = security.mint_token(account["id"])
    return jsonify(
        {
            "token": token,
            "account": auth.public_account(account),
            "expires_at": dt.datetime.fromtimestamp(expires_at, dt.timezone.utc)
            .isoformat()
            .replace("+00:00", "Z"),
        }
    )


@bp.get("/auth/me")
def me():
    account = auth.current_account()
    if not account:
        return fail(401, "No session.")
    return jsonify(auth.public_account(account))


# --------------------------------------------------------------------------- public reads


@bp.get("/health")
def health():
    try:
        house = served_house()
        repo.talents_roster(house["id"])
    except Exception as exc:  # pragma: no cover - unhealthy path
        return jsonify({"status": "unhealthy", "detail": str(exc)}), 503
    return jsonify({"status": "ok", "house": house["slug"]})


@bp.get("/works")
def works():
    house = served_house()
    return public_read(repo.works_index(house["id"]), house["id"])


@bp.get("/works/<slug>")
def work(slug: str):
    house = served_house()
    item = repo.item_by_slug(house["id"], "work", slug)
    if item and not item["published"]:
        return not_found()
    if not item:
        target = repo.redirect_for(house["id"], "work", slug)
        if target:
            item = repo.item_by_slug(house["id"], "work", target)
        if not item or not item["published"]:
            return not_found()
    return public_read(repo.work_detail(house["id"], item), house["id"])


@bp.get("/talents")
def talents():
    house = served_house()
    discipline = request.args.get("discipline")
    if discipline and discipline not in DISCIPLINES:
        return fail(400, "That discipline does not exist.")
    return public_read(repo.talents_roster(house["id"], discipline), house["id"])


@bp.get("/talents/<slug>")
def talent(slug: str):
    house = served_house()
    item = repo.item_by_slug(house["id"], "talent", slug)
    if item and not item["published"]:
        return not_found()
    if not item:
        target = repo.redirect_for(house["id"], "talent", slug)
        if target:
            item = repo.item_by_slug(house["id"], "talent", target)
        if not item or not item["published"]:
            return not_found()
    return public_read(repo.talent_detail(house["id"], item), house["id"])


@bp.get("/disciplines")
def discipline_set():
    house = served_house()
    return public_read(repo.disciplines(house["id"]), house["id"])


@bp.get("/media/<media_id>")
def media_object(media_id: str):
    """Rendered while its record is published; while unlisted, not found to anyone but
    that record's own house producer, however the caller got the id."""
    if not re.fullmatch(r"[0-9a-f]{32}", media_id or ""):
        return not_found()
    row = repo.media_row(media_id)
    if not row:
        return not_found()
    if not row["item_published"]:
        account = auth.current_account()
        if not auth.producer_of(account, row["house_id"]):
            return not_found()
        preview_ok = True
    else:
        preview_ok = False
    svg = media_gen.still_svg(row["seed"], row["width"], row["height"])
    resp = Response(svg, mimetype="image/svg+xml")
    if row["item_published"]:
        resp.headers["Cache-Control"] = "public, max-age=300"
    else:
        resp.headers["Cache-Control"] = "private, no-store"
        resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    resp.headers["X-Media-Preview"] = "1" if preview_ok else "0"
    return resp


# --------------------------------------------------------------------------- preview


def resolve_preview(token: str):
    """(item, house) for a live token belonging to the caller's own house, else (None, None)."""
    if not re.fullmatch(r"[0-9a-f]{32}", token or ""):
        return None, None
    row = db.query_one(
        """SELECT p.*, i.house_id AS house_id FROM preview_tokens p
           JOIN items i ON i.id = p.item_id WHERE p.token = %s""",
        (token,),
    )
    if not row:
        return None, None
    expires = row["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=dt.timezone.utc)
    if expires < dt.datetime.now(dt.timezone.utc):
        return None, None
    account = auth.current_account()
    if not auth.producer_of(account, row["house_id"]):
        return None, None
    item = db.query_one("SELECT * FROM items WHERE id = %s", (row["item_id"],))
    return item, row["house_id"]


@bp.get("/preview/<token>")
def preview(token: str):
    item, house_id = resolve_preview(token)
    if not item:
        return not_found()
    payload = (
        repo.work_detail(house_id, item)
        if item["kind"] == "work"
        else repo.talent_detail(house_id, item)
    )
    payload["preview"] = True
    resp = jsonify(payload)
    resp.headers["Cache-Control"] = "private, no-store"
    resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    return resp


# --------------------------------------------------------------------------- studio


def require_producer():
    """Returns (account, None) or (None, refusal). Reads included, no exceptions."""
    account = auth.current_account()
    if not account:
        return None, fail(401, "Sign in as a producer to use the studio.")
    if not auth.is_producer(account):
        return None, fail(403, "Only a producer may use the studio.")
    return account, None


def own_item(account, item_id):
    """A record of the caller's own house, or None: a foreign record reads as missing."""
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return None
    return db.query_one(
        "SELECT * FROM items WHERE id = %s AND house_id = %s", (item_id, account["house_id"])
    )


def studio_shape(item: dict, house_id: int) -> dict:
    out = repo.shape_item(item, repo.item_media(item["id"]))
    index = repo.works_index(house_id)
    if item["kind"] == "work":
        out["ordinal"] = next((w["ordinal"] for w in index if w["id"] == item["id"]), None)
        out["ordinal_label"] = f"{out['ordinal']:03d}" if out["ordinal"] else None
        out["credits"] = repo.credits_for(item["id"], house_id)
    else:
        out["selected_work"] = repo.selected_work_for_talent(house_id, item["id"])
    out["house_id"] = house_id
    return out


@bp.get("/studio/items")
def studio_items():
    account, refusal = require_producer()
    if refusal:
        return refusal
    kind = request.args.get("kind")
    if kind and kind not in KINDS:
        return fail(400, "kind must be 'work' or 'talent'.")
    sql = "SELECT * FROM items WHERE house_id = %s"
    params: list = [account["house_id"]]
    if kind:
        sql += " AND kind = %s"
        params.append(kind)
    sql += " ORDER BY kind, position, id"
    items = db.query(sql, tuple(params))
    index = repo.works_index(account["house_id"])
    ordinals = {w["id"]: w["ordinal"] for w in index}
    out = []
    for item in items:
        shaped = repo.shape_item(item, repo.item_media(item["id"]))
        if item["kind"] == "work":
            o = ordinals.get(item["id"])
            shaped["ordinal"] = o
            shaped["ordinal_label"] = f"{o:03d}" if o else None
        out.append(shaped)
    return jsonify(out)


@bp.get("/studio/items/<item_id>")
def studio_item(item_id):
    account, refusal = require_producer()
    if refusal:
        return refusal
    item = own_item(account, item_id)
    if not item:
        return not_found()
    return jsonify(studio_shape(item, account["house_id"]))


@bp.post("/studio/items")
def studio_create():
    account, refusal = require_producer()
    if refusal:
        return refusal
    data = body()
    kind = (data.get("kind") or "").strip()
    if kind not in KINDS:
        return fail(400, "kind must be 'work' or 'talent'.")
    title = (data.get("title") or "").strip()
    if not title:
        return fail(400, "A title is required.")
    slug = slugify(data.get("slug") or title)
    if not slug or not SLUG_RE.match(slug):
        return fail(400, "A slug must be lowercase kebab case.")
    discipline = (data.get("discipline") or "").strip() or None
    variant = (data.get("variant") or "").strip() or None
    if kind == "talent":
        if discipline not in DISCIPLINES:
            return fail(400, "A talent needs a discipline of director, photographer or stylist.")
        variant = None
    else:
        if variant not in VARIANTS:
            return fail(400, "A work needs a variant of left, right or centre.")
        discipline = None
    try:
        with db.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM items "
                    "WHERE house_id=%s AND kind=%s",
                    (account["house_id"], kind),
                )
                position = cur.fetchone()["p"]
                cur.execute(
                    """INSERT INTO items (house_id, kind, slug, title, position, discipline,
                                          variant, published, published_at)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,FALSE,NULL) RETURNING *""",
                    (account["house_id"], kind, slug, title, position, discipline, variant),
                )
                item = cur.fetchone()
            conn.commit()
    except psycopg.errors.UniqueViolation:
        # The database holds slug uniqueness, so a losing concurrent create leaves nothing.
        return fail(409, f"The slug '{slug}' is already used by another {kind} in this house.")
    return jsonify(studio_shape(item, account["house_id"])), 201


@bp.patch("/studio/items/<item_id>")
def studio_update(item_id):
    account, refusal = require_producer()
    if refusal:
        return refusal
    item = own_item(account, item_id)
    if not item:
        return not_found()
    data = body()
    sets, params = [], []
    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return fail(400, "A title cannot be empty.")
        sets.append("title = %s")
        params.append(title)
    if "discipline" in data and item["kind"] == "talent":
        discipline = (data.get("discipline") or "").strip()
        if discipline not in DISCIPLINES:
            return fail(400, "A discipline must be director, photographer or stylist.")
        sets.append("discipline = %s")
        params.append(discipline)
    if "variant" in data and item["kind"] == "work":
        variant = (data.get("variant") or "").strip()
        if variant not in VARIANTS:
            return fail(400, "A variant must be left, right or centre.")
        sets.append("variant = %s")
        params.append(variant)
    if not sets:
        return fail(400, "Nothing to change.")
    params += [item["id"], account["house_id"]]
    row = db.execute(
        f"UPDATE items SET {', '.join(sets)} WHERE id = %s AND house_id = %s RETURNING *",
        tuple(params),
    )
    return jsonify(studio_shape(row, account["house_id"]))


@bp.post("/studio/items/<item_id>/publish")
def studio_publish(item_id):
    account, refusal = require_producer()
    if refusal:
        return refusal
    item = own_item(account, item_id)
    if not item:
        return not_found()
    data = body()
    published = data.get("published")
    if not isinstance(published, bool):
        return fail(400, "published must be true or false.")
    if published:
        posters = db.query(
            "SELECT * FROM media WHERE item_id=%s AND role='poster' ORDER BY position, id",
            (item["id"],),
        )
        if not posters:
            return fail(422, "Attach a poster with a written alternative before publishing.")
        if not (posters[0]["alt"] or "").strip():
            return fail(422, "The poster's alt text is empty, so this record cannot be published.")
    row = db.execute(
        """UPDATE items SET published = %s,
               published_at = CASE WHEN %s THEN COALESCE(published_at, (now() AT TIME ZONE 'utc'))
                                   ELSE NULL END
           WHERE id = %s AND house_id = %s RETURNING *""",
        (published, published, item["id"], account["house_id"]),
    )
    return jsonify(studio_shape(row, account["house_id"]))


@bp.post("/studio/items/<item_id>/media")
def studio_media(item_id):
    account, refusal = require_producer()
    if refusal:
        return refusal
    item = own_item(account, item_id)
    if not item:
        return not_found()
    data = body()
    role = (data.get("role") or "poster").strip()
    if role not in MEDIA_ROLES:
        return fail(400, "A media role must be poster, reel or gallery.")
    alt = (data.get("alt") or "").strip()
    if not alt:
        return fail(400, "A written alternative is required on every media row.")
    try:
        width = int(data.get("width") or 0)
        height = int(data.get("height") or 0)
    except (TypeError, ValueError):
        return fail(400, "width and height must be whole numbers.")
    if width <= 0 or height <= 0:
        return fail(400, "width and height must be greater than zero.")
    seed = (data.get("seed") or "").strip() or security.hex_token(16)
    mid = security.hex_token(32)
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM media "
                "WHERE item_id=%s AND role=%s",
                (item["id"], role),
            )
            position = cur.fetchone()["p"]
            cur.execute(
                """INSERT INTO media (id, item_id, role, position, seed, width, height, alt)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
                (mid, item["id"], role, position, seed, width, height, alt),
            )
            row = cur.fetchone()
        conn.commit()
    return (
        jsonify(
            {
                "media_id": row["id"],
                "role": row["role"],
                "width": row["width"],
                "height": row["height"],
                "alt": row["alt"],
                "seed": row["seed"],
                "url": f"/api/media/{row['id']}",
            }
        ),
        201,
    )


@bp.post("/studio/items/<item_id>/credits")
def studio_credits(item_id):
    account, refusal = require_producer()
    if refusal:
        return refusal
    item = own_item(account, item_id)
    if not item:
        return not_found()
    if item["kind"] != "work":
        return fail(400, "Credits belong to a work.")
    data = body()
    role = (data.get("role") or "").strip()
    name = (data.get("name") or "").strip()
    if not role or not name:
        return fail(400, "A credit needs a role and a name.")
    talent_id = data.get("talent_id")
    talent_item_id = None
    if talent_id not in (None, "", 0):
        talent = own_item(account, talent_id)
        if not talent or talent["kind"] != "talent":
            return not_found()
        talent_item_id = talent["id"]
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM credits WHERE item_id=%s",
                (item["id"],),
            )
            position = cur.fetchone()["p"]
            cur.execute(
                """INSERT INTO credits (item_id, position, role, name, talent_item_id)
                   VALUES (%s,%s,%s,%s,%s) RETURNING *""",
                (item["id"], position, role, name, talent_item_id),
            )
            row = cur.fetchone()
        conn.commit()
    return (
        jsonify(
            {
                "id": row["id"],
                "item_id": row["item_id"],
                "position": row["position"],
                "role": row["role"],
                "name": row["name"],
                "talent_id": row["talent_item_id"],
            }
        ),
        201,
    )


@bp.post("/studio/items/<item_id>/slug")
def studio_slug(item_id):
    account, refusal = require_producer()
    if refusal:
        return refusal
    item = own_item(account, item_id)
    if not item:
        return not_found()
    data = body()
    slug = slugify(data.get("slug") or "")
    if not slug or not SLUG_RE.match(slug):
        return fail(400, "A slug must be lowercase kebab case.")
    if slug == item["slug"]:
        return fail(400, "That is already this record's slug.")
    old_slug = item["slug"]
    try:
        with db.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE items SET slug = %s WHERE id = %s AND house_id = %s RETURNING *",
                    (slug, item["id"], account["house_id"]),
                )
                row = cur.fetchone()
                cur.execute(
                    """INSERT INTO slug_redirects (house_id, kind, old_slug, item_id)
                       VALUES (%s,%s,%s,%s)
                       ON CONFLICT (house_id, kind, old_slug) DO UPDATE SET item_id = EXCLUDED.item_id""",
                    (account["house_id"], item["kind"], old_slug, item["id"]),
                )
            conn.commit()
    except psycopg.errors.UniqueViolation:
        return fail(409, f"The slug '{slug}' is already used by another {item['kind']} here.")
    out = studio_shape(row, account["house_id"])
    out["redirect_from"] = old_slug
    return jsonify(out)


@bp.post("/studio/works/order")
def studio_order():
    account, refusal = require_producer()
    if refusal:
        return refusal
    data = body()
    ordered = data.get("ordered_ids")
    if not isinstance(ordered, list) or not ordered:
        return fail(400, "ordered_ids must be a non-empty array of record ids.")
    try:
        ordered_ids = [int(i) for i in ordered]
    except (TypeError, ValueError):
        return fail(400, "ordered_ids must be whole numbers.")
    own = db.query(
        "SELECT id FROM items WHERE house_id=%s AND kind='work'", (account["house_id"],)
    )
    own_ids = {r["id"] for r in own}
    if set(ordered_ids) - own_ids:
        return not_found()
    if len(set(ordered_ids)) != len(ordered_ids):
        return fail(400, "ordered_ids repeats a record.")
    with db.connection() as conn:
        with conn.cursor() as cur:
            for position, iid in enumerate(ordered_ids):
                cur.execute(
                    "UPDATE items SET position = %s WHERE id = %s AND house_id = %s",
                    (position, iid, account["house_id"]),
                )
            rest = [i for i in own_ids if i not in set(ordered_ids)]
            for offset, iid in enumerate(sorted(rest), start=len(ordered_ids)):
                cur.execute(
                    "UPDATE items SET position = %s WHERE id = %s AND house_id = %s",
                    (offset, iid, account["house_id"]),
                )
        conn.commit()
    items = db.query(
        "SELECT * FROM items WHERE house_id=%s AND kind='work' ORDER BY position, id",
        (account["house_id"],),
    )
    index = repo.works_index(account["house_id"])
    ordinals = {w["id"]: w["ordinal"] for w in index}
    out = []
    for item in items:
        shaped = repo.shape_item(item, repo.item_media(item["id"]))
        o = ordinals.get(item["id"])
        shaped["ordinal"] = o
        shaped["ordinal_label"] = f"{o:03d}" if o else None
        out.append(shaped)
    return jsonify(out)


@bp.post("/studio/preview-tokens")
def studio_preview_token():
    account, refusal = require_producer()
    if refusal:
        return refusal
    data = body()
    item = own_item(account, data.get("item_id"))
    if not item:
        return not_found()
    token = security.hex_token(32)
    expires_at = dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=PREVIEW_TTL_MINUTES)
    db.execute(
        """INSERT INTO preview_tokens (token, item_id, expires_at, created_by)
           VALUES (%s,%s,%s,%s) RETURNING id""",
        (token, item["id"], expires_at, account["id"]),
    )
    resp = jsonify(
        {
            "token": token,
            "item_id": item["id"],
            "expires_at": expires_at.isoformat().replace("+00:00", "Z"),
            "url": f"/preview/{token}",
        }
    )
    resp.headers["Cache-Control"] = "private, no-store"
    return resp, 201
