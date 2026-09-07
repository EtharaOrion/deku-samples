"""The JSON API under /api.

Authorization is server-side on every /api/studio/ endpoint, reads included.
A record of another house is answered exactly as a record that does not exist.
"""
from flask import Blueprint, Response, g, jsonify, request

from . import auth, db, media as media_gen, models
from .models import NotFound, Refused

bp = Blueprint("api", __name__, url_prefix="/api")


def refuse(message, status=400):
    return jsonify({"error": message}), status


@bp.errorhandler(Refused)
def _handle_refused(exc):
    return jsonify({"error": exc.message}), exc.status


def _body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


# --------------------------------------------------------------------------
# health and auth
# --------------------------------------------------------------------------

@bp.get("/health")
def health():
    try:
        house = models.served_house()
        models.published_items(house["id"], "talent")
    except Exception:
        return jsonify({"status": "starting"}), 503
    return jsonify({"status": "ok"}), 200


@bp.post("/auth/signup")
def signup():
    data = _body()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if "@" not in email or len(email) < 5:
        return refuse("Enter an email address.")
    if len(password) < 8:
        return refuse("A password needs at least 8 characters.")
    existing = db.query("SELECT id FROM accounts WHERE email = %s", (email,), one=True)
    if existing:
        return refuse("That address already has an account.", 409)
    # Signup always issues a viewer with no house; neither is read from the body.
    account = db.query(
        "INSERT INTO accounts (email, password_hash, role, house_id) "
        "VALUES (%s, %s, 'viewer', NULL) RETURNING id, email, role, house_id",
        (email, auth.hash_password(password)),
        one=True,
        commit=True,
    )
    return jsonify({"account": account, "token": auth.mint_token(account["id"])}), 201


@bp.post("/auth/login")
def login():
    data = _body()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    account = db.query(
        "SELECT id, email, password_hash, role, house_id FROM accounts WHERE lower(email) = %s",
        (email,),
        one=True,
    )
    if account is None or not auth.verify_password(password, account["password_hash"]):
        return refuse("That address and password do not match.", 401)
    house = None
    if account["house_id"]:
        house = db.query(
            "SELECT slug, name FROM houses WHERE id = %s", (account["house_id"],), one=True
        )
    return jsonify(
        {
            "token": auth.mint_token(account["id"]),
            "account": {
                "id": account["id"],
                "email": account["email"],
                "role": account["role"],
                "house": house["slug"] if house else None,
            },
        }
    ), 200


@bp.get("/auth/me")
def me():
    account = auth.current_account()
    if account is None:
        return refuse("Authentication required.", 401)
    return jsonify(account), 200


# --------------------------------------------------------------------------
# public reads: the served house's published records only
# --------------------------------------------------------------------------

@bp.get("/works")
def works():
    house = models.served_house()
    return jsonify(models.works_index(house["id"])), 200


@bp.get("/works/<slug>")
def work(slug):
    house = models.served_house()
    detail, redirect = models.work_detail(house["id"], slug)
    if redirect:
        return jsonify({"redirect": "/api/works/%s" % redirect, "slug": redirect}), 301
    return jsonify(detail), 200


@bp.get("/talents")
def talents():
    house = models.served_house()
    discipline = (request.args.get("discipline") or "").strip().lower() or None
    if discipline and discipline not in models.DISCIPLINES:
        return jsonify([]), 200
    return jsonify(models.talents_index(house["id"], discipline)), 200


@bp.get("/talents/<slug>")
def talent(slug):
    house = models.served_house()
    detail, redirect = models.talent_detail(house["id"], slug)
    if redirect:
        return jsonify({"redirect": "/api/talents/%s" % redirect, "slug": redirect}), 301
    return jsonify(detail), 200


@bp.get("/disciplines")
def disciplines():
    house = models.served_house()
    return jsonify(models.disciplines_of(house["id"])), 200


@bp.get("/media/<media_id>")
def media(media_id):
    account = auth.current_account()
    row, is_public = models.media_for_request(media_id, account)
    svg = media_gen.render_svg(row["seed"], row["width"], row["height"], row["alt"])
    resp = Response(svg, mimetype="image/svg+xml")
    if is_public:
        resp.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    else:
        resp.headers["Cache-Control"] = "private, no-store"
    return resp


@bp.get("/preview/<token>")
def preview(token):
    account = auth.current_account()
    item = models.resolve_preview(token, account)
    resp = jsonify(models.preview_payload(item))
    resp.headers["Cache-Control"] = "private, no-store"
    resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    return resp, 200


# --------------------------------------------------------------------------
# studio: bearer auth on every endpoint, reads included
# --------------------------------------------------------------------------

@bp.get("/studio/items")
@auth.producer_required
def studio_items():
    kind = (request.args.get("kind") or "").strip().lower() or None
    return jsonify(models.studio_items(g.house_id, kind)), 200


@bp.get("/studio/items/<item_id>")
@auth.producer_required
def studio_item(item_id):
    row = models.studio_item(g.house_id, item_id)
    return jsonify(models.studio_item_json(row)), 200


@bp.post("/studio/items")
@auth.producer_required
def studio_create():
    row = models.create_item(g.house_id, _body())
    return jsonify(models.studio_item_json(row)), 201


@bp.patch("/studio/items/<item_id>")
@auth.producer_required
def studio_update(item_id):
    row = models.update_item(g.house_id, item_id, _body())
    return jsonify(models.studio_item_json(row)), 200


@bp.post("/studio/items/<item_id>/publish")
@auth.producer_required
def studio_publish(item_id):
    data = _body()
    published = data.get("published")
    if not isinstance(published, bool):
        return refuse("Say whether this record is published, true or false.")
    row = models.set_published(g.house_id, item_id, published)
    return jsonify(models.studio_item_json(row)), 200


@bp.post("/studio/items/<item_id>/media")
@auth.producer_required
def studio_media(item_id):
    row = models.add_media(g.house_id, item_id, _body())
    return jsonify(
        {
            "media_id": row["id"],
            "role": row["role"],
            "width": row["width"],
            "height": row["height"],
            "alt": row["alt"],
            "url": "/api/media/%s" % row["id"],
        }
    ), 201


@bp.post("/studio/items/<item_id>/credits")
@auth.producer_required
def studio_credits(item_id):
    row = models.add_credit(g.house_id, item_id, _body())
    return jsonify(
        {
            "id": row["id"],
            "role": row["role"],
            "name": row["name"],
            "talent_id": row["talent_item_id"],
            "position": row["position"],
        }
    ), 201


@bp.post("/studio/items/<item_id>/slug")
@auth.producer_required
def studio_slug(item_id):
    row = models.change_slug(g.house_id, item_id, (_body().get("slug") or ""))
    return jsonify(models.studio_item_json(row)), 200


@bp.post("/studio/works/order")
@auth.producer_required
def studio_order():
    rows = models.reorder_works(g.house_id, _body().get("ordered_ids"))
    return jsonify(rows), 200


@bp.post("/studio/preview-tokens")
@auth.producer_required
def studio_preview_tokens():
    account = auth.current_account()
    out = models.mint_preview_token(g.house_id, account["id"], _body().get("item_id"))
    return jsonify(out), 201
