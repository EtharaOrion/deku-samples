"""Cirrus: a server-rendered Flask app. Jinja renders the document, Alpine enhances it."""
import os
import re
import sys
import time
from functools import wraps

from flask import (Flask, g, jsonify, make_response, redirect, render_template, request,
                   url_for)

from . import auth, db, media as media_gen, repo

HOUSE_SLUG = os.environ.get("HOUSE_SLUG", "cirrus")
DESCRIPTION = "A production house for picture and its makers."

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.url_map.strict_slashes = False
app.config["JSON_SORT_KEYS"] = False


# ------------------------------------------------------------------ logging

@app.before_request
def _start_timer():
    g._t0 = time.monotonic()


@app.after_request
def _log(response):
    ms = (time.monotonic() - getattr(g, "_t0", time.monotonic())) * 1000
    sys.stdout.write(
        f'{request.method} {request.path} {response.status_code} {ms:.1f}ms\n'
    )
    sys.stdout.flush()
    return response


# ------------------------------------------------------------------ helpers

def served_house():
    if not hasattr(g, "_house"):
        g._house = repo.house_by_slug(HOUSE_SLUG)
    return g._house


def current_account():
    if hasattr(g, "_account"):
        return g._account
    token = None
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        token = header[7:].strip()
    if not token:
        token = request.cookies.get(auth.COOKIE_NAME)
    g._account = auth.account_for_token(token) if token else None
    return g._account


def bearer_token():
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:].strip()
    return request.cookies.get(auth.COOKIE_NAME)


def error(message, status=400):
    """Refusals answer in the client-error range and carry a reason a person can read."""
    return jsonify({"error": message}), status


def not_found_json():
    return error("That record is not here.", 404)


def producer_required(fn):
    """Authorization on every studio endpoint, reads included, enforced server-side."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        account = current_account()
        if not account:
            return error("Sign in as a producer to use the studio.", 401)
        if account["role"] != "producer" or not account["house_id"]:
            return error("This account may not use the studio.", 403)
        g.producer = account
        return fn(*args, **kwargs)

    return wrapper


def json_body():
    data = request.get_json(silent=True)
    if isinstance(data, dict):
        return data
    return request.form.to_dict() if request.form else {}


def public_cache(response, seconds=30):
    response.headers["Cache-Control"] = f"public, max-age={seconds}, must-revalidate"
    return response


def no_store(response):
    response.headers["Cache-Control"] = "no-store, private"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


@app.template_filter("split_chars")
def split_chars(text):
    """Per-character addressing whose accessible name stays the whole word.

    The characters are hidden from assistive technology and from selection; the element
    that carries them carries the word itself as its accessible name.
    """
    from markupsafe import Markup, escape

    text = str(text or "")
    parts = "".join(
        f'<span class="ch" style="--ch:{i}">'
        f'{"&nbsp;" if ch == " " else escape(ch)}</span>'
        for i, ch in enumerate(text)
    )
    return Markup(f'<span class="split" aria-hidden="true">{parts}</span>')


@app.context_processor
def _template_globals():
    house = served_house()
    account = current_account()
    return {
        "house": house,
        "account": account,
        "description": DESCRIPTION,
        "public_url": os.environ.get("APP_PUBLIC_URL", ""),
        "is_producer": bool(account and account["role"] == "producer" and account["house_id"]),
        "session_token": bearer_token() if account else None,
        "disciplines": repo.disciplines(house["id"]) if house else [],
    }


# ------------------------------------------------------------------ health

@app.get("/api/health")
def health():
    try:
        house = served_house()
        repo.published_talents(house["id"])
    except Exception as exc:  # pragma: no cover
        return jsonify({"status": "starting", "detail": str(exc)}), 503
    return jsonify({"status": "ok", "house": house["slug"]}), 200


# ------------------------------------------------------------------ auth API

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@app.post("/api/auth/signup")
def api_signup():
    data = json_body()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    if not EMAIL_RE.match(email):
        return error("Enter an email address the house can reply to.", 422)
    if len(password) < 8:
        return error("A password needs at least eight characters.", 422)
    if db.query("SELECT id FROM accounts WHERE lower(email)=lower(%s)", (email,), one=True):
        return error("An account already exists for that address.", 409)
    account = auth.create_viewer(email, password)
    token = auth.mint_token(account["id"])
    response = jsonify(
        {
            "account": {"id": account["id"], "email": account["email"], "role": "viewer",
                        "house_id": None},
            "token": token,
        }
    )
    response.set_cookie(auth.COOKIE_NAME, token, httponly=True, samesite="Lax",
                        max_age=auth.TOKEN_TTL, path="/")
    return response, 201


@app.post("/api/auth/login")
def api_login():
    data = json_body()
    account = auth.authenticate(data.get("email"), data.get("password"))
    if not account:
        return error("That address and password do not match an account.", 401)
    token = auth.mint_token(account["id"])
    house = repo.house_by_id(account["house_id"]) if account["house_id"] else None
    response = jsonify(
        {
            "token": token,
            "account": {"id": account["id"], "email": account["email"], "role": account["role"],
                        "house": house["slug"] if house else None},
        }
    )
    response.set_cookie(auth.COOKIE_NAME, token, httponly=True, samesite="Lax",
                        max_age=auth.TOKEN_TTL, path="/")
    return response


@app.post("/api/auth/logout")
def api_logout():
    response = jsonify({"ok": True})
    response.delete_cookie(auth.COOKIE_NAME, path="/")
    return response


@app.get("/api/auth/me")
def api_me():
    account = current_account()
    if not account:
        return error("No session.", 401)
    return jsonify({"id": account["id"], "email": account["email"], "role": account["role"],
                    "house": account["house_slug"]})


# ------------------------------------------------------------------ public API

@app.get("/api/works")
def api_works():
    house = served_house()
    return public_cache(make_response(jsonify(repo.works_index(house["id"]))))


@app.get("/api/works/<slug>")
def api_work(slug):
    house = served_house()
    item, redirect_to = repo.item_public(house["id"], "work", slug)
    if not item:
        if redirect_to:
            return redirect(f"/api/works/{redirect_to}", code=301)
        return not_found_json()
    if redirect_to:
        return redirect(f"/api/works/{redirect_to}", code=301)
    return public_cache(make_response(jsonify(repo.work_view(house["id"], item))))


@app.get("/api/talents")
def api_talents():
    house = served_house()
    discipline = request.args.get("discipline") or None
    if discipline and discipline not in repo.DISCIPLINES:
        return error("That discipline is not one this house uses.", 422)
    return public_cache(make_response(jsonify(repo.talents_index(house["id"], discipline))))


@app.get("/api/talents/<slug>")
def api_talent(slug):
    house = served_house()
    item, redirect_to = repo.item_public(house["id"], "talent", slug)
    if not item or redirect_to:
        if redirect_to:
            return redirect(f"/api/talents/{redirect_to}", code=301)
        return not_found_json()
    return public_cache(make_response(jsonify(repo.talent_view(house["id"], item))))


@app.get("/api/disciplines")
def api_disciplines():
    house = served_house()
    return public_cache(make_response(jsonify(repo.disciplines(house["id"]))))


@app.get("/api/media/<media_id>")
def api_media(media_id):
    """Rendered while its record is published; while unlisted, found only by its own producer."""
    if not re.fullmatch(r"[0-9a-f]{32}", media_id or ""):
        return not_found_json()
    row = repo.media_row(media_id)
    if not row:
        return not_found_json()
    if not row["published"]:
        account = current_account()
        allowed = bool(
            account
            and account["role"] == "producer"
            and account["house_id"] == row["house_id"]
        )
        if not allowed:
            return not_found_json()
    svg = media_gen.still_svg(row["seed"], row["width"], row["height"])
    response = make_response(svg)
    response.headers["Content-Type"] = "image/svg+xml"
    if row["published"]:
        public_cache(response, 300)
    else:
        no_store(response)
    return response


@app.get("/api/media/<media_id>/meta")
def api_media_meta(media_id):
    row = repo.media_row(media_id)
    if not row:
        return not_found_json()
    if not row["published"]:
        account = current_account()
        if not (account and account["role"] == "producer"
                and account["house_id"] == row["house_id"]):
            return not_found_json()
    return jsonify({"media_id": row["id"], "role": row["role"], "width": row["width"],
                    "height": row["height"], "alt": row["alt"], "seed": row["seed"]})


@app.get("/static/share.svg")
def share_image():
    response = make_response(media_gen.share_image(served_house()["name"]))
    response.headers["Content-Type"] = "image/svg+xml"
    return public_cache(response, 3600)


@app.get("/static/grain.svg")
def grain_image():
    response = make_response(media_gen.grain_tile())
    response.headers["Content-Type"] = "image/svg+xml"
    return public_cache(response, 3600)


@app.get("/api/preview/<token>")
def api_preview(token):
    account = current_account()
    if not account or account["role"] != "producer" or not account["house_id"]:
        return not_found_json()
    row = repo.resolve_preview(token, account["house_id"])
    if not row:
        return not_found_json()
    view = (repo.work_view(row["house_id"], row) if row["kind"] == "work"
            else repo.talent_view(row["house_id"], row))
    return no_store(make_response(jsonify(view)))


# ------------------------------------------------------------------ studio API

@app.get("/api/studio/items")
@producer_required
def api_studio_items():
    kind = request.args.get("kind") or None
    try:
        items = repo.studio_items(g.producer["house_id"], kind)
    except repo.Conflict as exc:
        return error(exc.message, exc.status)
    return no_store(make_response(jsonify(items)))


@app.get("/api/studio/items/<item_id>")
@producer_required
def api_studio_item(item_id):
    item = repo.owned_item(g.producer["house_id"], item_id)
    if not item:
        return not_found_json()
    return no_store(
        make_response(jsonify(repo.studio_item_payload(g.producer["house_id"], item)))
    )


@app.post("/api/studio/items")
@producer_required
def api_studio_create():
    try:
        item = repo.create_item(g.producer["house_id"], json_body())
    except repo.Conflict as exc:
        return error(exc.message, exc.status)
    return jsonify(repo.studio_item_payload(g.producer["house_id"], item)), 201


@app.patch("/api/studio/items/<item_id>")
@producer_required
def api_studio_update(item_id):
    item = repo.owned_item(g.producer["house_id"], item_id)
    if not item:
        return not_found_json()
    try:
        updated = repo.update_item(g.producer["house_id"], item, json_body())
    except repo.Conflict as exc:
        return error(exc.message, exc.status)
    return jsonify(repo.studio_item_payload(g.producer["house_id"], updated))


@app.post("/api/studio/items/<item_id>/publish")
@producer_required
def api_studio_publish(item_id):
    item = repo.owned_item(g.producer["house_id"], item_id)
    if not item:
        return not_found_json()
    data = json_body()
    published = data.get("published")
    if isinstance(published, str):
        published = published.lower() in ("1", "true", "yes", "on")
    if published is None:
        published = True
    try:
        updated = repo.set_published(g.producer["house_id"], item, bool(published))
    except repo.Conflict as exc:
        return error(exc.message, exc.status)
    return jsonify(repo.studio_item_payload(g.producer["house_id"], updated))


@app.post("/api/studio/items/<item_id>/media")
@producer_required
def api_studio_media(item_id):
    item = repo.owned_item(g.producer["house_id"], item_id)
    if not item:
        return not_found_json()
    try:
        created = repo.add_media(g.producer["house_id"], item, json_body())
    except repo.Conflict as exc:
        return error(exc.message, exc.status)
    return jsonify(created), 201


@app.post("/api/studio/items/<item_id>/credits")
@producer_required
def api_studio_credits(item_id):
    item = repo.owned_item(g.producer["house_id"], item_id)
    if not item:
        return not_found_json()
    try:
        created = repo.add_credit(g.producer["house_id"], item, json_body())
    except repo.Conflict as exc:
        return error(exc.message, exc.status)
    return jsonify(created), 201


@app.post("/api/studio/items/<item_id>/slug")
@producer_required
def api_studio_slug(item_id):
    item = repo.owned_item(g.producer["house_id"], item_id)
    if not item:
        return not_found_json()
    try:
        updated = repo.change_slug(g.producer["house_id"], item, json_body().get("slug"))
    except repo.Conflict as exc:
        return error(exc.message, exc.status)
    return jsonify(repo.studio_item_payload(g.producer["house_id"], updated))


@app.post("/api/studio/works/order")
@producer_required
def api_studio_order():
    data = json_body()
    try:
        result = repo.reorder_works(g.producer["house_id"], data.get("ordered_ids"))
    except repo.Conflict as exc:
        return error(exc.message, exc.status)
    if result is None:
        return not_found_json()
    return jsonify(result)


@app.post("/api/studio/preview-tokens")
@producer_required
def api_studio_preview_token():
    data = json_body()
    item = repo.owned_item(g.producer["house_id"], data.get("item_id"))
    if not item:
        return not_found_json()
    return jsonify(repo.mint_preview_token(g.producer["house_id"], item, g.producer["id"])), 201


# ------------------------------------------------------------------ pages

def page(template, **ctx):
    ctx.setdefault("route", "home")
    return render_template(template, **ctx)


def render_not_found():
    response = make_response(render_template("not_found.html", route="notfound",
                                             page_title="Cirrus"), 404)
    response.headers["X-Robots-Tag"] = "noindex"
    return response


@app.get("/")
def route_home():
    house = served_house()
    return page("home.html", route="home", page_title="Cirrus",
                cluster=repo.entry_cluster(house["id"]))


@app.get("/works")
def route_works():
    house = served_house()
    return page("works.html", route="works", page_title="Cirrus - Works",
                works=repo.works_index(house["id"]))


@app.get("/works/<slug>")
def route_work(slug):
    house = served_house()
    item, redirect_to = repo.resolve_slug(house["id"], "work", slug)
    if item and redirect_to:
        return redirect(f"/works/{redirect_to}", code=301)
    if not item or not item["published"]:
        return render_not_found()
    view = repo.work_view(house["id"], item)
    return page("work_detail.html", route="works", page_title=f"Cirrus - {view['title']}",
                work=view)


@app.get("/talents")
def route_talents():
    house = served_house()
    return page("talents.html", route="talents", page_title="Cirrus - Talents",
                talents=repo.talents_index(house["id"]))


@app.get("/talents/<slug>")
def route_talent(slug):
    house = served_house()
    item, redirect_to = repo.resolve_slug(house["id"], "talent", slug)
    if item and redirect_to:
        return redirect(f"/talents/{redirect_to}", code=301)
    if not item or not item["published"]:
        return render_not_found()
    view = repo.talent_view(house["id"], item)
    return page("talent_detail.html", route="talents", page_title=f"Cirrus - {view['title']}",
                talent=view)


@app.get("/about")
def route_about():
    return page("about.html", route="about", page_title="Cirrus - About")


@app.get("/signup")
def route_signup():
    return page("signup.html", route="signup", page_title="Cirrus - Sign up")


@app.get("/studio/login")
def route_studio_login():
    return page("studio_login.html", route="studio", page_title="Cirrus - Studio")


@app.get("/preview/<token>")
def route_preview(token):
    account = current_account()
    if not account or account["role"] != "producer" or not account["house_id"]:
        return render_not_found()
    row = repo.resolve_preview(token, account["house_id"])
    if not row:
        return render_not_found()
    view = (repo.work_view(row["house_id"], row) if row["kind"] == "work"
            else repo.talent_view(row["house_id"], row))
    response = make_response(
        render_template("preview.html", route="preview", page_title="Cirrus - Preview",
                        record=view, kind=row["kind"], token=token)
    )
    return no_store(response)


def studio_guard():
    """A visitor lands on the login route; a signed-in viewer is refused and sees the entry."""
    account = current_account()
    if not account:
        return redirect(f"/studio/login?next={request.path}")
    if account["role"] != "producer" or not account["house_id"]:
        return redirect("/")
    return None


@app.get("/studio")
def route_studio():
    guard = studio_guard()
    if guard:
        return guard
    items = repo.studio_items(g._account["house_id"])
    return no_store(make_response(page("studio.html", route="studio",
                                       page_title="Cirrus - Studio", items=items)))


@app.get("/studio/<kind>/new")
def route_studio_new(kind):
    if kind not in ("talents", "works"):
        return render_not_found()
    guard = studio_guard()
    if guard:
        return guard
    return no_store(make_response(page(
        "studio_form.html", route="studio",
        page_title=f"Cirrus - New {'talent' if kind == 'talents' else 'work'}",
        mode="new", kind="talent" if kind == "talents" else "work", item=None,
        talents=repo.studio_items(g._account["house_id"], "talent"))))


@app.get("/studio/items/<item_id>")
def route_studio_item(item_id):
    guard = studio_guard()
    if guard:
        return guard
    item = repo.owned_item(g._account["house_id"], item_id)
    if not item:
        return render_not_found()
    payload = repo.studio_item_payload(g._account["house_id"], item)
    return no_store(make_response(page(
        "studio_form.html", route="studio", page_title=f"Cirrus - {payload['title']}",
        mode="edit", kind=item["kind"], item=payload,
        talents=repo.studio_items(g._account["house_id"], "talent"))))


@app.get("/studio/items/<item_id>/published")
def route_studio_published(item_id):
    guard = studio_guard()
    if guard:
        return guard
    item = repo.owned_item(g._account["house_id"], item_id)
    if not item:
        return render_not_found()
    payload = repo.studio_item_payload(g._account["house_id"], item)
    return no_store(make_response(page("studio_published.html", route="studio",
                                       page_title="Cirrus - Published", item=payload)))


@app.post("/api/analytics/view")
def api_analytics():
    """Page views and nothing else; nothing is written to a visitor's machine."""
    path = ""
    data = request.get_json(silent=True)
    if isinstance(data, dict):
        path = str(data.get("path", ""))[:200]
    sys.stdout.write(f"pageview {path}\n")
    sys.stdout.flush()
    return ("", 204)


@app.get("/robots.txt")
def robots():
    body = "User-agent: *\nDisallow: /preview/\nDisallow: /studio\nDisallow: /api/studio/\n"
    response = make_response(body)
    response.headers["Content-Type"] = "text/plain"
    return response


@app.errorhandler(404)
def handle_404(_exc):
    if request.path.startswith("/api/"):
        return not_found_json()
    return render_not_found()


@app.errorhandler(405)
def handle_405(_exc):
    if request.path.startswith("/api/"):
        return error("That method is not allowed here.", 405)
    return render_not_found()


def create_app():
    return app
