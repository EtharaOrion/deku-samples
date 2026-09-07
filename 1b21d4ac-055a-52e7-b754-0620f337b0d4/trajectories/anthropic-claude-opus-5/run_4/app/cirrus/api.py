"""The JSON API under /api.

Anything returning a collection returns it as a JSON array at the top level.
Refusals answer in the client-error range, carry a reason a person can read, and
leave the store exactly as they found it.
"""
from flask import Blueprint, Response, g, jsonify, make_response, request

from . import db, media as media_gen, repo, security
from .auth import account_public, current_account, error, not_found, require_producer
from .repo import Conflict, Invalid

api = Blueprint("api", __name__, url_prefix="/api")

PUBLIC_CACHE = "public, max-age=30, stale-while-revalidate=120"


def _public_json(payload, status=200):
    resp = make_response(jsonify(payload), status)
    resp.headers["Cache-Control"] = PUBLIC_CACHE
    return resp


def _no_store(resp):
    resp.headers["Cache-Control"] = "no-store, private"
    return resp


def body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


# ----------------------------------------------------------------------- health

@api.get("/health")
def health():
    """200 once the roster can be read."""
    try:
        house = repo.public_house()
        if not house:
            return error(503, "The house is not seeded yet.")
        db.query_one(
            """SELECT count(*) AS n FROM items
               WHERE house_id = %s AND kind = 'talent' AND published""", (house["id"],))
        return jsonify({"status": "ok", "house": house["slug"]})
    except Exception as exc:  # pragma: no cover
        return jsonify({"status": "unavailable", "detail": str(exc)}), 503


# ------------------------------------------------------------------------- auth

@api.post("/auth/signup")
def signup():
    data = body()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if "@" not in email or len(email) < 3:
        return error(400, "Enter an email address.")
    if len(password) < 8:
        return error(400, "A password needs at least 8 characters.")
    existing = db.query_one("SELECT id FROM accounts WHERE email = %s", (email,))
    if existing:
        return error(409, "That address already has an account.")
    # Signup is open and always issues a viewer with no house. Neither role nor
    # house is read from the request body.
    row = db.execute(
        """INSERT INTO accounts (email, password_hash, role, house_id)
           VALUES (%s,%s,'viewer',NULL) RETURNING id, email, role, house_id""",
        (email, security.hash_password(password)))[0]
    token = security.mint_token(row["id"])
    resp = make_response(jsonify({
        "account": {"id": row["id"], "email": row["email"], "role": "viewer", "house": None},
        "token": token}), 201)
    resp.set_cookie(security.SESSION_COOKIE, token, httponly=True, samesite="Lax",
                    secure=request.is_secure, max_age=security.TOKEN_TTL_SECONDS)
    return _no_store(resp)


@api.post("/auth/login")
def login():
    data = body()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    row = db.query_one(
        """SELECT a.*, h.slug AS house_slug FROM accounts a
           LEFT JOIN houses h ON h.id = a.house_id WHERE a.email = %s""", (email,))
    if not row or not security.verify_password(password, row["password_hash"]):
        return error(401, "That email and password do not match.")
    token = security.mint_token(row["id"])
    resp = make_response(jsonify({"token": token, "account": account_public(row)}))
    resp.set_cookie(security.SESSION_COOKIE, token, httponly=True, samesite="Lax",
                    secure=request.is_secure, max_age=security.TOKEN_TTL_SECONDS)
    return _no_store(resp)


@api.post("/auth/logout")
def logout():
    resp = make_response(jsonify({"ok": True}))
    resp.delete_cookie(security.SESSION_COOKIE)
    return _no_store(resp)


@api.get("/auth/me")
def me():
    account = current_account()
    if not account:
        return _no_store(make_response(jsonify({"account": None}), 200))
    return _no_store(make_response(jsonify({"account": account_public(account)}), 200))


# ----------------------------------------------------------------- public reads

@api.get("/works")
def works():
    house = repo.public_house()
    return _public_json(repo.published_works(house["id"]))


@api.get("/works/<slug>")
def work(slug):
    house = repo.public_house()
    detail = repo.work_detail(house["id"], slug)
    if not detail:
        target = repo.resolve_redirect(house["id"], "work", slug)
        if target:
            detail = repo.work_detail(house["id"], target)
        if not detail:
            return not_found()
    return _public_json(detail)


@api.get("/talents")
def talents():
    house = repo.public_house()
    discipline = request.args.get("discipline") or None
    return _public_json(repo.published_talents(house["id"], discipline))


@api.get("/talents/<slug>")
def talent(slug):
    house = repo.public_house()
    detail = repo.talent_detail(house["id"], slug)
    if not detail:
        target = repo.resolve_redirect(house["id"], "talent", slug)
        if target:
            detail = repo.talent_detail(house["id"], target)
        if not detail:
            return not_found()
    return _public_json(detail)


@api.get("/disciplines")
def disciplines():
    house = repo.public_house()
    return _public_json(repo.disciplines(house["id"]))


@api.get("/media/<media_id>")
def media(media_id):
    """Renders while its record is published; while unlisted it is not found to
    anyone but that record's own house producer, however the caller got the id."""
    row = repo.get_media_row(media_id)
    if not repo.media_visible_to(row, current_account()):
        return not_found()
    data = media_gen.render_still(row["seed"], row["width"], row["height"])
    resp = Response(data, mimetype="image/jpeg")
    if row["published"]:
        resp.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=600"
    else:
        resp.headers["Cache-Control"] = "no-store, private"
    resp.headers["Content-Length"] = str(len(data))
    return resp


@api.get("/preview/<token>")
def preview(token):
    account = current_account()
    if not account or account["role"] != "producer" or not account["house_id"]:
        return not_found()
    resolved = repo.resolve_preview(token, account["house_id"])
    if not resolved:
        return not_found()
    return _no_store(make_response(jsonify(resolved), 200))


# ----------------------------------------------------------------------- studio

@api.get("/studio/items")
@require_producer
def studio_items():
    kind = request.args.get("kind") or None
    if kind and kind not in ("work", "talent"):
        return error(400, "Kind must be 'work' or 'talent'.")
    return _no_store(make_response(jsonify(repo.studio_items(g.house_id, kind)), 200))


@api.get("/studio/items/<item_id>")
@require_producer
def studio_item(item_id):
    item = repo.studio_item(g.house_id, item_id)
    if not item:
        return not_found()
    return _no_store(make_response(jsonify(item), 200))


@api.post("/studio/items")
@require_producer
def studio_create():
    data = body()
    try:
        item = repo.create_item(
            g.house_id, data.get("kind"), data.get("slug"), data.get("title"),
            data.get("discipline"), data.get("variant"))
    except Invalid as exc:
        return error(422, str(exc))
    except Conflict as exc:
        return error(409, str(exc))
    return _no_store(make_response(jsonify(item), 201))


@api.patch("/studio/items/<item_id>")
@require_producer
def studio_update(item_id):
    try:
        item = repo.update_item(g.house_id, int(item_id), body())
    except (TypeError, ValueError):
        return not_found()
    except Invalid as exc:
        return error(422, str(exc))
    if not item:
        return not_found()
    return _no_store(make_response(jsonify(item), 200))


@api.post("/studio/items/<item_id>/publish")
@require_producer
def studio_publish(item_id):
    data = body()
    published = data.get("published")
    if not isinstance(published, bool):
        return error(422, "Send published as true or false.")
    try:
        item = repo.set_published(g.house_id, int(item_id), published)
    except (TypeError, ValueError):
        return not_found()
    except Invalid as exc:
        return error(422, str(exc))
    if not item:
        return not_found()
    return _no_store(make_response(jsonify(item), 200))


@api.post("/studio/items/<item_id>/media")
@require_producer
def studio_media(item_id):
    data = body()
    try:
        created = repo.add_media(g.house_id, int(item_id), data.get("role"),
                                 data.get("seed"), data.get("width"),
                                 data.get("height"), data.get("alt"))
    except (TypeError, ValueError):
        return not_found()
    except Invalid as exc:
        return error(422, str(exc))
    if not created:
        return not_found()
    return _no_store(make_response(jsonify(created), 201))


@api.post("/studio/items/<item_id>/credits")
@require_producer
def studio_credits(item_id):
    data = body()
    try:
        created = repo.add_credit(g.house_id, int(item_id), data.get("role"),
                                  data.get("name"), data.get("talent_id"))
    except (TypeError, ValueError):
        return not_found()
    except Invalid as exc:
        return error(422, str(exc))
    if not created:
        return not_found()
    return _no_store(make_response(jsonify(created), 201))


@api.post("/studio/items/<item_id>/slug")
@require_producer
def studio_slug(item_id):
    data = body()
    try:
        item = repo.change_slug(g.house_id, int(item_id), data.get("slug"))
    except (TypeError, ValueError):
        return not_found()
    except Invalid as exc:
        return error(422, str(exc))
    except Conflict as exc:
        return error(409, str(exc))
    if not item:
        return not_found()
    return _no_store(make_response(jsonify(item), 200))


@api.post("/studio/works/order")
@require_producer
def studio_order():
    data = body()
    try:
        items = repo.reorder_works(g.house_id, data.get("ordered_ids"))
    except Invalid as exc:
        return error(422, str(exc))
    if items is None:
        return not_found()
    return _no_store(make_response(jsonify(items), 200))


@api.post("/studio/preview-tokens")
@require_producer
def studio_preview_token():
    data = body()
    item_id = data.get("item_id")
    try:
        minted = repo.mint_preview_token(g.house_id, int(item_id), g.account["id"])
    except (TypeError, ValueError):
        return not_found()
    if not minted:
        return not_found()
    return _no_store(make_response(jsonify(minted), 201))
