"""The JSON API under /api.

Authorization is enforced here, server-side, on every /api/studio/ endpoint,
reads included. Nothing reads `role` or the house from a request body.
"""
import functools

from flask import Blueprint, current_app, g, jsonify, request

from . import auth, db, generator, repo
from .repo import NotFound, Refused

api = Blueprint("api", __name__, url_prefix="/api")


def refuse(message, status=400, field=None):
    payload = {"error": message, "reason": message}
    if field:
        payload["field"] = field
    return jsonify(payload), status


@api.errorhandler(Refused)
def _refused(exc):
    return refuse(exc.message, exc.status, exc.field)


def body():
    data = request.get_json(silent=True)
    if data is None:
        data = request.form.to_dict() if request.form else {}
    if not isinstance(data, dict):
        raise Refused("Send a JSON object.", 400)
    return data


def require_producer(fn):
    """Bearer auth on every studio endpoint, reads included."""

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        account = auth.current_account()
        if not account:
            return refuse("Sign in as a producer to use the studio.", 401)
        if account["role"] != "producer" or not account["house_id"]:
            return refuse("Only a producer may use the studio.", 403)
        g.producer = account
        return fn(*args, **kwargs)

    return wrapper


def served_house():
    return current_app.served_house()


def public_cache(response, seconds=60):
    house = served_house()
    version = db.query_one(
        """SELECT count(*) AS n, COALESCE(max(published_at), to_timestamp(0)) AS t
             FROM items WHERE house_id=%s AND published = TRUE""",
        (house["id"],),
    )
    response.headers["Cache-Control"] = f"public, max-age={seconds}, must-revalidate"
    response.headers["ETag"] = f'W/"{version["n"]}-{int(version["t"].timestamp())}"'
    return response


# ------------------------------------------------------------------ health --

@api.get("/health")
def health():
    house = served_house()
    repo.talents_roster(house["id"])
    return jsonify({"status": "ok", "house": house["slug"]})


# -------------------------------------------------------------------- auth --

@api.post("/auth/signup")
def signup():
    data = body()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if "@" not in email or "." not in email.split("@")[-1]:
        return refuse("That does not look like an email address.", 400, "email")
    if len(password) < 8:
        return refuse("A password needs at least 8 characters.", 400, "password")
    if db.query_one("SELECT id FROM accounts WHERE lower(email)=lower(%s)", (email,)):
        return refuse("An account with that address already exists.", 409, "email")
    # Signup is open and always issues a viewer with no house. Neither role nor
    # house is read from the request body.
    row = db.execute(
        """INSERT INTO accounts (email, password_hash, role, house_id)
           VALUES (%s,%s,'viewer',NULL) RETURNING id, email, role, house_id, created_at""",
        (email, auth.hash_password(password)), returning=True,
    )
    return jsonify({
        "account": {"id": row["id"], "email": row["email"], "role": row["role"],
                    "house_id": row["house_id"]},
        "token": auth.mint_token(row["id"]),
        "token_type": "bearer",
    }), 201


@api.post("/auth/login")
def login():
    data = body()
    account = auth.authenticate((data.get("email") or "").strip(),
                                data.get("password") or "")
    if not account:
        return refuse("That address and password do not match.", 401)
    return jsonify({
        "token": auth.mint_token(account["id"]),
        "token_type": "bearer",
        "account": {"id": account["id"], "email": account["email"],
                    "role": account["role"], "house": account["house_slug"]},
    })


@api.get("/auth/me")
def me():
    account = auth.current_account()
    if not account:
        return refuse("No session.", 401)
    return jsonify({"id": account["id"], "email": account["email"],
                    "role": account["role"], "house": account["house_slug"]})


# ------------------------------------------------------------------ public --

@api.get("/works")
def works():
    house = served_house()
    return public_cache(jsonify(repo.works_index(house["id"])))


@api.get("/works/<slug>")
def work(slug):
    house = served_house()
    data, canonical = repo.work_detail(house["id"], slug)
    if not data:
        return refuse("That work is not here.", 404)
    return public_cache(jsonify(data))


@api.get("/talents")
def talents():
    house = served_house()
    discipline = (request.args.get("discipline") or "").strip().lower() or None
    if discipline and discipline not in repo.DISCIPLINES:
        return refuse("That is not a discipline this house uses.", 400, "discipline")
    return public_cache(jsonify(repo.talents_roster(house["id"], discipline)))


@api.get("/talents/<slug>")
def talent(slug):
    house = served_house()
    data, canonical = repo.talent_detail(house["id"], slug)
    if not data:
        return refuse("That talent is not here.", 404)
    return public_cache(jsonify(data))


@api.get("/disciplines")
def disciplines():
    house = served_house()
    return public_cache(jsonify(repo.disciplines(house["id"])))


@api.get("/media/<media_id>")
def media(media_id):
    row = repo.media_row_visible(media_id, auth.current_account())
    if not row:
        return refuse("That image is not here.", 404)
    svg = generator.still_svg(row["seed"], row["width"], row["height"])
    response = current_app.response_class(svg, mimetype="image/svg+xml")
    if row["published"]:
        response.headers["Cache-Control"] = "public, max-age=3600"
    else:
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


@api.get("/media/<media_id>/recipe")
def media_recipe(media_id):
    row = repo.media_row_visible(media_id, auth.current_account())
    if not row:
        return refuse("That image is not here.", 404)
    data = generator.recipe(row["seed"])
    data.update({"width": row["width"], "height": row["height"], "alt": row["alt"]})
    return jsonify(data)


@api.get("/preview/<token>")
def preview(token):
    account = auth.current_account()
    try:
        row = repo.resolve_preview(account, token)
    except NotFound as exc:
        return refuse(exc.message, 404)
    house = served_house()
    medias = repo.media_for([row["id"]]).get(row["id"], [])
    if row["kind"] == "work":
        data = repo.work_json(row, medias, ordinal=None,
                              credits=repo.credits_for_work(row["id"], row["house_id"]))
    else:
        data = repo.talent_json(
            row, medias, selected_work=repo.selected_work_for_talent(row["id"], house["id"]))
    data["preview"] = True
    response = jsonify(data)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


# ------------------------------------------------------------------ studio --

@api.get("/studio/items")
@require_producer
def studio_items():
    kind = (request.args.get("kind") or "").strip().lower() or None
    return jsonify(repo.studio_items(g.producer, kind))


@api.get("/studio/items/<item_id>")
@require_producer
def studio_item(item_id):
    row = repo.studio_item(g.producer, item_id)
    return jsonify(repo.studio_item_json(row))


@api.post("/studio/items")
@require_producer
def studio_create():
    row = repo.create_item(g.producer, body())
    return jsonify(repo.studio_item_json(row)), 201


@api.patch("/studio/items/<item_id>")
@require_producer
def studio_update(item_id):
    row = repo.update_item(g.producer, item_id, body())
    return jsonify(repo.studio_item_json(row))


@api.post("/studio/items/<item_id>/publish")
@require_producer
def studio_publish(item_id):
    data = body()
    published = data.get("published")
    if isinstance(published, str):
        published = published.strip().lower() in ("1", "true", "yes", "on")
    if published is None:
        published = True
    row = repo.set_published(g.producer, item_id, bool(published))
    return jsonify(repo.studio_item_json(row))


@api.post("/studio/items/<item_id>/media")
@require_producer
def studio_media(item_id):
    row = repo.add_media(g.producer, item_id, body())
    return jsonify({"media_id": row["id"], "role": row["role"], "width": row["width"],
                    "height": row["height"], "alt": row["alt"],
                    "url": f"/api/media/{row['id']}"}), 201


@api.post("/studio/items/<item_id>/credits")
@require_producer
def studio_credit(item_id):
    row = repo.add_credit(g.producer, item_id, body())
    return jsonify({"id": row["id"], "item_id": row["item_id"], "role": row["role"],
                    "name": row["name"], "position": row["position"],
                    "talent_id": row["talent_item_id"]}), 201


@api.post("/studio/items/<item_id>/slug")
@require_producer
def studio_slug(item_id):
    row = repo.change_slug(g.producer, item_id, body().get("slug"))
    return jsonify(repo.studio_item_json(row))


@api.post("/studio/works/order")
@require_producer
def studio_order():
    data = body()
    return jsonify(repo.reorder_works(g.producer, data.get("ordered_ids")))


@api.post("/studio/preview-tokens")
@require_producer
def studio_preview_token():
    data = body()
    item_id = data.get("item_id") or data.get("id")
    minted = repo.mint_preview_token(g.producer, item_id)
    response = jsonify(minted)
    response.headers["Cache-Control"] = "private, no-store"
    return response, 201
