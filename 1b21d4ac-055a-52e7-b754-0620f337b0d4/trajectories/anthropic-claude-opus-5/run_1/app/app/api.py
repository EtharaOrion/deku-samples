"""The JSON API under /api.

Authorization is enforced here on every studio endpoint, reads included. A
producer asking for a record of a house that is not theirs is answered exactly
as a producer asking for a record that does not exist, so the answer never
confirms that the record is real.
"""
import functools

import psycopg2
from flask import Blueprint, Response, jsonify, request

from . import auth, config, db, media as media_gen, repo

bp = Blueprint("api", __name__, url_prefix="/api")

NOT_FOUND = "That record is not here."


def fail(status, reason):
    """Refusals answer in the client-error range and carry a readable reason."""
    return jsonify({"error": reason}), status


def json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def require_producer(fn):
    """Bearer auth on every /api/studio/ endpoint, reads included.

    Neither `role` nor the house is read from a request body: both come from
    the account row addressed by the token.
    """
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        account = auth.current_account()
        if not account:
            return fail(401, "Sign in as a producer to use the studio.")
        if account["role"] != "producer" or not account["house_id"]:
            return fail(403, "Only a producer may use the studio.")
        return fn(account, *args, **kwargs)
    return wrapper


def scoped_item(account, item_id):
    return repo.studio_item(account["house_id"], item_id)


# --------------------------------------------------------------------------
# health and auth
# --------------------------------------------------------------------------

@bp.get("/health")
def health():
    try:
        house = repo.served_house()
        if not house:
            return jsonify({"status": "starting"}), 503
        repo.talents_list(house["id"])
    except Exception as exc:  # pragma: no cover - readiness probe
        return jsonify({"status": "unready", "error": str(exc)}), 503
    return jsonify({"status": "ok", "house": house["slug"]}), 200


@bp.post("/auth/signup")
def signup():
    body = json_body()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    if "@" not in email or "." not in email.split("@")[-1]:
        return fail(400, "Enter an email address.")
    if len(password) < 8:
        return fail(400, "A password needs at least 8 characters.")
    # Signup is open and always issues a viewer with no house.
    try:
        with db.write() as cur:
            cur.execute(
                "INSERT INTO accounts (email, password_hash, role, house_id) "
                "VALUES (%s, %s, 'viewer', NULL) RETURNING id, email, role, house_id",
                (email, auth.hash_password(password)),
            )
            row = cur.fetchone()
    except psycopg2.errors.UniqueViolation:
        return fail(409, "That email address already has an account.")
    token = auth.issue_token(row["id"])
    return jsonify({
        "account": {"id": row["id"], "email": row["email"], "role": "viewer",
                    "house": None},
        "token": token,
    }), 201


@bp.post("/auth/login")
def login():
    body = json_body()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    row = db.query_one(
        "SELECT a.*, h.slug AS house_slug FROM accounts a "
        "LEFT JOIN houses h ON h.id = a.house_id WHERE lower(a.email) = %s",
        (email,),
    )
    if not row or not auth.verify_password(password, row["password_hash"]):
        return fail(401, "That email and password do not match.")
    return jsonify({
        "token": auth.issue_token(row["id"]),
        "account": {"id": row["id"], "email": row["email"], "role": row["role"],
                    "house": row["house_slug"]},
    }), 200


@bp.get("/auth/me")
def me():
    account = auth.current_account()
    if not account:
        return fail(401, "No session.")
    return jsonify({"id": account["id"], "email": account["email"],
                    "role": account["role"], "house": account["house_slug"]}), 200


# --------------------------------------------------------------------------
# public reads: the served house's published records only
# --------------------------------------------------------------------------

def _public_cache(resp):
    resp.headers["Cache-Control"] = "public, max-age=0, must-revalidate"
    return resp


@bp.get("/works")
def works():
    house = repo.served_house()
    return _public_cache(jsonify(repo.works_list(house["id"])))


@bp.get("/works/<slug>")
def work(slug):
    house = repo.served_house()
    row, _redirect = repo.resolve_slug(house["id"], "work", slug)
    if not row or not row["published"]:
        return fail(404, NOT_FOUND)
    return _public_cache(jsonify(repo.work_detail(house["id"], row)))


@bp.get("/talents")
def talents():
    house = repo.served_house()
    discipline = request.args.get("discipline") or None
    if discipline and discipline not in repo.DISCIPLINES:
        return fail(400, "That is not a discipline this house uses.")
    return _public_cache(jsonify(repo.talents_list(house["id"], discipline)))


@bp.get("/talents/<slug>")
def talent(slug):
    house = repo.served_house()
    row, _redirect = repo.resolve_slug(house["id"], "talent", slug)
    if not row or not row["published"]:
        return fail(404, NOT_FOUND)
    return _public_cache(jsonify(repo.talent_detail(house["id"], row)))


@bp.get("/disciplines")
def disciplines():
    house = repo.served_house()
    return _public_cache(jsonify(repo.disciplines(house["id"])))


@bp.get("/media/<media_id>")
def media(media_id):
    """Rendered while its record is published; while unlisted it is not found to
    anyone but that record's own house producer, however the caller got the id."""
    row = db.query_one(
        "SELECT m.*, i.published, i.house_id FROM media m "
        "JOIN items i ON i.id = m.item_id WHERE m.id = %s",
        (media_id,),
    )
    if not row:
        return fail(404, "That image is not here.")
    if not row["published"]:
        account = auth.current_account()
        allowed = bool(
            account
            and account["role"] == "producer"
            and account["house_id"] == row["house_id"]
        )
        if not allowed:
            return fail(404, "That image is not here.")
    svg = media_gen.still_svg(row["seed"], row["width"], row["height"])
    resp = Response(svg, mimetype="image/svg+xml")
    if row["published"]:
        resp.headers["Cache-Control"] = "public, max-age=3600"
    else:
        resp.headers["Cache-Control"] = "private, no-store"
    return resp


@bp.get("/preview/<token>")
def preview(token):
    """One unlisted record in full, for its own house's producer."""
    account = auth.current_account()
    row = repo.preview_row(token)
    if not row or not account or account["role"] != "producer" \
            or account["house_id"] != row["house_id"]:
        return fail(404, NOT_FOUND)
    item = repo.studio_item(account["house_id"], row["item_id"])
    if not item:
        return fail(404, NOT_FOUND)
    data = repo.item_detail(account["house_id"], item)
    data["preview"] = True
    resp = jsonify(data)
    resp.headers["Cache-Control"] = "private, no-store"
    resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    return resp


# --------------------------------------------------------------------------
# studio
# --------------------------------------------------------------------------

@bp.get("/studio/items")
@require_producer
def studio_items(account):
    kind = request.args.get("kind") or None
    if kind and kind not in repo.KINDS:
        return fail(400, "A record is a work or a talent.")
    return jsonify(repo.studio_items(account["house_id"], kind))


@bp.get("/studio/items/<item_id>")
@require_producer
def studio_item(account, item_id):
    row = scoped_item(account, item_id)
    if not row:
        return fail(404, NOT_FOUND)
    return jsonify(repo.studio_item_public(row))


@bp.post("/studio/items")
@require_producer
def create_item(account):
    body = json_body()
    kind = (body.get("kind") or "").strip()
    title = (body.get("title") or "").strip()
    slug = repo.slugify(body.get("slug") or title)
    discipline = (body.get("discipline") or "").strip() or None
    variant = (body.get("variant") or "").strip() or None

    if kind not in repo.KINDS:
        return fail(400, "A record is a work or a talent.")
    if not title:
        return fail(400, "A record needs a title.")
    if not repo.is_valid_slug(slug):
        return fail(400, "A slug is lowercase words joined by hyphens.")
    if kind == "talent":
        if discipline not in repo.DISCIPLINES:
            return fail(400, "Choose a discipline: director, photographer or stylist.")
        variant = None
    else:
        if variant not in repo.VARIANTS:
            return fail(400, "Choose a width: left, right or centre.")
        discipline = None

    try:
        with db.write() as cur:
            cur.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM items "
                "WHERE house_id = %s AND kind = %s",
                (account["house_id"], kind),
            )
            position = cur.fetchone()["p"]
            # A record is created unlisted, published_at null. The unique index
            # decides the race; the loser leaves no partial record because the
            # whole request is one transaction.
            cur.execute(
                """INSERT INTO items (house_id, kind, slug, title, position, discipline,
                                      variant, published, published_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE, NULL) RETURNING *""",
                (account["house_id"], kind, slug, title, position, discipline, variant),
            )
            row = dict(cur.fetchone())
    except psycopg2.errors.UniqueViolation:
        return fail(409, "That slug is already used by another record of this kind.")
    return jsonify(repo.studio_item_public(row)), 201


@bp.patch("/studio/items/<item_id>")
@require_producer
def update_item(account, item_id):
    row = scoped_item(account, item_id)
    if not row:
        return fail(404, NOT_FOUND)
    body = json_body()
    fields, params = [], []
    if "title" in body:
        title = (body.get("title") or "").strip()
        if not title:
            return fail(400, "A record needs a title.")
        fields.append("title = %s")
        params.append(title)
    if "discipline" in body and row["kind"] == "talent":
        d = (body.get("discipline") or "").strip()
        if d not in repo.DISCIPLINES:
            return fail(400, "Choose a discipline: director, photographer or stylist.")
        fields.append("discipline = %s")
        params.append(d)
    if "variant" in body and row["kind"] == "work":
        v = (body.get("variant") or "").strip()
        if v not in repo.VARIANTS:
            return fail(400, "Choose a width: left, right or centre.")
        fields.append("variant = %s")
        params.append(v)
    if not fields:
        return fail(400, "Nothing to change.")
    params.extend([row["id"], account["house_id"]])
    with db.write() as cur:
        cur.execute(
            "UPDATE items SET " + ", ".join(fields) +
            " WHERE id = %s AND house_id = %s RETURNING *", params,
        )
        updated = dict(cur.fetchone())
    return jsonify(repo.studio_item_public(updated))


@bp.post("/studio/items/<item_id>/publish")
@require_producer
def publish_item(account, item_id):
    row = scoped_item(account, item_id)
    if not row:
        return fail(404, NOT_FOUND)
    body = json_body()
    published = body.get("published")
    if not isinstance(published, bool):
        return fail(400, "Say whether the record is published: true or false.")
    if published:
        # Publishing a record whose poster alt is empty is refused and nothing changes.
        poster = db.query_one(
            "SELECT * FROM media WHERE item_id = %s AND role = 'poster' "
            "ORDER BY position, id LIMIT 1",
            (row["id"],),
        )
        if not poster:
            return fail(422, "Attach a poster before publishing this record.")
        if not (poster["alt"] or "").strip():
            return fail(422, "The poster needs a written alternative before publishing.")
    with db.write() as cur:
        cur.execute(
            "UPDATE items SET published = %s, "
            "published_at = CASE WHEN %s THEN now() ELSE NULL END "
            "WHERE id = %s AND house_id = %s RETURNING *",
            (published, published, row["id"], account["house_id"]),
        )
        updated = dict(cur.fetchone())
    return jsonify(repo.studio_item_public(updated))


@bp.post("/studio/items/<item_id>/media")
@require_producer
def add_media(account, item_id):
    row = scoped_item(account, item_id)
    if not row:
        return fail(404, NOT_FOUND)
    body = json_body()
    role = (body.get("role") or "poster").strip()
    alt = (body.get("alt") or "").strip()
    if role not in repo.MEDIA_ROLES:
        return fail(400, "A media role is poster, reel or gallery.")
    try:
        width = int(body.get("width") or 0)
        height = int(body.get("height") or 0)
    except (TypeError, ValueError):
        return fail(400, "Width and height are whole numbers of pixels.")
    if width < 1 or height < 1 or width > 8000 or height > 8000:
        return fail(400, "Width and height are whole numbers of pixels.")
    if not alt:
        return fail(400, "Every image needs a written alternative.")
    seed = (body.get("seed") or "").strip() or repo.hex_token()
    media_id = repo.hex_token()
    with db.write() as cur:
        cur.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM media "
            "WHERE item_id = %s AND role = %s",
            (row["id"], role),
        )
        position = cur.fetchone()["p"]
        cur.execute(
            "INSERT INTO media (id, item_id, role, position, seed, width, height, alt) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
            (media_id, row["id"], role, position, seed, width, height, alt),
        )
        created = dict(cur.fetchone())
    return jsonify({"media_id": created["id"], "role": created["role"],
                    "width": created["width"], "height": created["height"],
                    "alt": created["alt"], "seed": created["seed"],
                    "url": "/api/media/" + created["id"]}), 201


@bp.post("/studio/items/<item_id>/credits")
@require_producer
def add_credit(account, item_id):
    row = scoped_item(account, item_id)
    if not row:
        return fail(404, NOT_FOUND)
    if row["kind"] != "work":
        return fail(400, "Credits belong to a work.")
    body = json_body()
    role = (body.get("role") or "").strip()
    name = (body.get("name") or "").strip()
    if not role or not name:
        return fail(400, "A credit needs a role and a name.")
    talent_id = body.get("talent_id")
    if talent_id not in (None, ""):
        talent = repo.studio_item(account["house_id"], talent_id)
        if not talent or talent["kind"] != "talent":
            return fail(404, NOT_FOUND)
        talent_id = talent["id"]
    else:
        talent_id = None
    with db.write() as cur:
        cur.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM credits WHERE item_id = %s",
            (row["id"],),
        )
        position = cur.fetchone()["p"]
        cur.execute(
            "INSERT INTO credits (item_id, position, role, name, talent_item_id) "
            "VALUES (%s, %s, %s, %s, %s) RETURNING *",
            (row["id"], position, role, name, talent_id),
        )
        created = dict(cur.fetchone())
    return jsonify({"id": created["id"], "role": created["role"],
                    "name": created["name"], "talent_id": created["talent_item_id"],
                    "position": created["position"]}), 201


@bp.post("/studio/items/<item_id>/slug")
@require_producer
def change_slug(account, item_id):
    """The old slug is left redirecting forever."""
    row = scoped_item(account, item_id)
    if not row:
        return fail(404, NOT_FOUND)
    body = json_body()
    new_slug = repo.slugify(body.get("slug") or "")
    if not repo.is_valid_slug(new_slug):
        return fail(400, "A slug is lowercase words joined by hyphens.")
    if new_slug == row["slug"].lower():
        return fail(400, "That is already this record's slug.")
    old_slug = row["slug"]
    try:
        with db.write() as cur:
            cur.execute(
                "UPDATE items SET slug = %s WHERE id = %s AND house_id = %s RETURNING *",
                (new_slug, row["id"], account["house_id"]),
            )
            updated = dict(cur.fetchone())
            cur.execute(
                """INSERT INTO slug_redirects (house_id, kind, old_slug, item_id)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (house_id, kind, lower(old_slug))
                   DO UPDATE SET item_id = EXCLUDED.item_id""",
                (account["house_id"], row["kind"], old_slug, row["id"]),
            )
    except psycopg2.errors.UniqueViolation:
        return fail(409, "That slug is already used by another record of this kind.")
    return jsonify(repo.studio_item_public(updated))


@bp.post("/studio/works/order")
@require_producer
def reorder(account):
    body = json_body()
    ordered = body.get("ordered_ids")
    if not isinstance(ordered, list) or not ordered:
        return fail(400, "Send the works in their new order.")
    try:
        ordered = [int(i) for i in ordered]
    except (TypeError, ValueError):
        return fail(400, "Send the works in their new order.")
    rows = db.query(
        "SELECT id FROM items WHERE house_id = %s AND kind = 'work'",
        (account["house_id"],),
    )
    own = {r["id"] for r in rows}
    if set(ordered) != own or len(ordered) != len(set(ordered)):
        # Naming a record that is not this house's is answered as missing.
        return fail(404, NOT_FOUND)
    with db.write() as cur:
        for position, iid in enumerate(ordered):
            cur.execute(
                "UPDATE items SET position = %s WHERE id = %s AND house_id = %s",
                (position, iid, account["house_id"]),
            )
    return jsonify(repo.studio_items(account["house_id"], "work"))


@bp.post("/studio/preview-tokens")
@require_producer
def preview_tokens(account):
    body = json_body()
    row = scoped_item(account, body.get("item_id"))
    if not row:
        return fail(404, NOT_FOUND)
    return jsonify(repo.mint_preview_token(row["id"], account["id"])), 201
