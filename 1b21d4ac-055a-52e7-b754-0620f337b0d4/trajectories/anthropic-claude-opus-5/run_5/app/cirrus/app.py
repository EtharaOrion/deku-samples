"""Cirrus: a server-rendered Flask app with a JSON API under /api."""
from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from functools import wraps

from flask import (
    Flask,
    Response,
    g,
    jsonify,
    make_response,
    redirect,
    render_template,
    request,
    url_for,
)

from . import auth, db, media as media_gen, repo

SERVED_HOUSE = os.environ.get("SERVED_HOUSE_SLUG", "cirrus")
PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "")
TOKEN_COOKIE = "cirrus_session"

SITE_DESCRIPTION = "A production house for picture and its makers."

app = Flask(__name__, template_folder="templates", static_folder="static")
app.url_map.strict_slashes = False
app.config["JSON_SORT_KEYS"] = False


# ---------------------------------------------------------------- plumbing

@app.before_request
def _start_timer():
    g._t0 = time.time()


@app.after_request
def _log_line(response: Response):
    took = (time.time() - getattr(g, "_t0", time.time())) * 1000
    sys.stdout.write(
        f'{datetime.now(timezone.utc).isoformat()} "{request.method} {request.path}" '
        f"{response.status_code} {took:.1f}ms\n"
    )
    sys.stdout.flush()
    return response


def served_house() -> dict:
    house = getattr(g, "_house", None)
    if house is None:
        house = repo.house_by_slug(SERVED_HOUSE)
        g._house = house
    return house


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return request.cookies.get(TOKEN_COOKIE)


def current_account() -> dict | None:
    if "_account" not in g.__dict__:
        g._account = auth.account_for_token(bearer_token())
    return g._account


def error(status: int, reason: str):
    """A refusal in the client-error range, carrying a reason a person can read."""
    return jsonify({"error": reason}), status


def not_found_json():
    return error(404, "That record is not here.")


def api_producer_required(fn):
    """Bearer auth on every /api/studio/ endpoint, reads included."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        account = current_account()
        if not account:
            return error(401, "Sign in as a producer to use the studio.")
        if account["role"] != "producer" or not account["house_id"]:
            return error(403, "Only a producer of a house may use the studio.")
        g.account = account
        return fn(*args, **kwargs)

    return wrapper


def public_cache(response: Response) -> Response:
    """Public reads may be cached; a publish or unlist changes the body and so the ETag."""
    response.headers.setdefault("Cache-Control", "public, max-age=0, must-revalidate")
    response.add_etag()
    return response.make_conditional(request)


def json_array(payload: list, status: int = 200) -> Response:
    response = make_response(app.response_class(
        json.dumps(payload, default=str), status=status, mimetype="application/json"
    ))
    return response


# ---------------------------------------------------------------- health

@app.get("/api/health")
def health():
    try:
        house = served_house()
        if not house:
            return error(503, "The house is not seeded yet.")
        repo.published_items(house["id"], "talent")
    except Exception as exc:  # pragma: no cover
        return jsonify({"status": "unavailable", "detail": str(exc)}), 503
    return jsonify({"status": "ok", "house": house["slug"]})


# ---------------------------------------------------------------- auth API

@app.post("/api/auth/signup")
def api_signup():
    body = request.get_json(silent=True) or request.form or {}
    email = (body.get("email") or "").strip()
    password = body.get("password") or ""
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return error(400, "That does not look like an email address.")
    if len(password) < 8:
        return error(400, "A password needs at least eight characters.")
    if db.query_one("SELECT id FROM accounts WHERE lower(email)=lower(%s)", (email,)):
        return error(409, "That address already has an account.")
    account = auth.create_viewer(email, password)
    token, expires = auth.issue_token(account["id"])
    response = make_response(
        jsonify(
            {
                "account": {
                    "id": account["id"],
                    "email": account["email"],
                    "role": account["role"],
                    "house": None,
                },
                "token": token,
                "expires_at": repo.iso(expires),
            }
        ),
        201,
    )
    _set_cookie(response, token, expires)
    return response


@app.post("/api/auth/login")
def api_login():
    body = request.get_json(silent=True) or request.form or {}
    account = auth.authenticate((body.get("email") or ""), body.get("password") or "")
    if not account:
        return error(401, "That address and password do not match.")
    token, expires = auth.issue_token(account["id"])
    house = repo.house_by_id(account["house_id"]) if account["house_id"] else None
    response = make_response(
        jsonify(
            {
                "token": token,
                "expires_at": repo.iso(expires),
                "account": {
                    "id": account["id"],
                    "email": account["email"],
                    "role": account["role"],
                    "house": house["slug"] if house else None,
                },
            }
        )
    )
    _set_cookie(response, token, expires)
    return response


@app.post("/api/auth/logout")
def api_logout():
    token = bearer_token()
    if token:
        auth.revoke_token(token)
    response = make_response(jsonify({"ok": True}))
    response.delete_cookie(TOKEN_COOKIE, path="/")
    return response


@app.get("/api/auth/me")
def api_me():
    account = current_account()
    if not account:
        return error(401, "No session.")
    house = repo.house_by_id(account["house_id"]) if account["house_id"] else None
    return jsonify(
        {
            "id": account["id"],
            "email": account["email"],
            "role": account["role"],
            "house": house["slug"] if house else None,
        }
    )


def _set_cookie(response: Response, token: str, expires):
    response.set_cookie(
        TOKEN_COOKIE,
        token,
        httponly=True,
        samesite="Lax",
        secure=request.is_secure,
        path="/",
        max_age=7 * 24 * 3600,
    )


# ---------------------------------------------------------------- public API

@app.get("/api/works")
def api_works():
    house = served_house()
    return public_cache(json_array(repo.list_works(house["id"])))


@app.get("/api/works/<slug>")
def api_work(slug):
    house = served_house()
    item, redirect_to = repo.resolve_slug(house["id"], "work", slug)
    if not item or not item["published"]:
        return not_found_json()
    payload = repo.work_detail(house["id"], item)
    if redirect_to:
        payload["redirected_from"] = slug
    return public_cache(make_response(jsonify(payload)))


@app.get("/api/talents")
def api_talents():
    house = served_house()
    discipline = (request.args.get("discipline") or "").strip().lower() or None
    if discipline and discipline not in repo.DISCIPLINES:
        return error(400, "That is not a discipline this house uses.")
    return public_cache(json_array(repo.list_talents(house["id"], discipline)))


@app.get("/api/talents/<slug>")
def api_talent(slug):
    house = served_house()
    item, redirect_to = repo.resolve_slug(house["id"], "talent", slug)
    if not item or not item["published"]:
        return not_found_json()
    payload = repo.talent_detail(house["id"], item)
    if redirect_to:
        payload["redirected_from"] = slug
    return public_cache(make_response(jsonify(payload)))


@app.get("/api/disciplines")
def api_disciplines():
    house = served_house()
    return public_cache(json_array(repo.disciplines(house["id"])))


@app.get("/api/media/<media_id>")
def api_media(media_id):
    """Rendered while its record is published; otherwise not found to anyone but its
    own house's producer, however the caller got the id."""
    row = repo.media_row(media_id)
    if not row:
        return not_found_json()
    visible = row["published"] and row["house_id"] == served_house()["id"]
    private = False
    if not visible:
        account = current_account()
        if (
            account
            and account["role"] == "producer"
            and account["house_id"] == row["house_id"]
        ):
            visible = True
            private = True
    if not visible:
        return not_found_json()
    svg = media_gen.still_svg(row["seed"], row["width"], row["height"])
    response = app.response_class(svg, mimetype="image/svg+xml")
    if private:
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
    else:
        response.headers["Cache-Control"] = "public, max-age=86400"
    return response


@app.get("/api/share-image.svg")
def api_share_image():
    house = served_house()
    response = app.response_class(
        media_gen.share_svg(house["name"] if house else "cirrus"), mimetype="image/svg+xml"
    )
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response


@app.get("/favicon.ico")
def favicon():
    house = served_house()
    letter = (house["name"][0] if house else "c").lower()
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        f'<rect width="32" height="32" fill="{media_gen.DARK}"/>'
        f'<text x="16" y="23" text-anchor="middle" fill="{media_gen.LIGHT}" '
        'font-family="Times New Roman, serif" font-size="22">' + letter + "</text></svg>"
    )
    response = app.response_class(svg, mimetype="image/svg+xml")
    response.headers["Cache-Control"] = "public, max-age=604800"
    return response


@app.get("/static/grain.png")
def grain_png():
    response = app.response_class(media_gen.grain_tile_png(), mimetype="image/png")
    response.headers["Cache-Control"] = "public, max-age=604800"
    return response


@app.post("/api/analytics/view")
def api_analytics_view():
    """Counts page views and nothing else, and writes nothing to a visitor's machine."""
    body = request.get_json(silent=True) or {}
    path = str(body.get("path") or "")[:200]
    sys.stdout.write(f"pageview {path}\n")
    sys.stdout.flush()
    return "", 204


@app.get("/api/preview/<token>")
def api_preview(token):
    account = current_account()
    if not account or account["role"] != "producer" or not account["house_id"]:
        return not_found_json()
    item = repo.preview_item(token, account["house_id"])
    if not item:
        return not_found_json()
    payload = repo.item_detail_any(item["house_id"], item)
    response = make_response(jsonify(payload))
    response.headers["Cache-Control"] = "no-store, private"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


# ---------------------------------------------------------------- studio API

@app.get("/api/studio/items")
@api_producer_required
def studio_items():
    kind = (request.args.get("kind") or "").strip().lower() or None
    if kind and kind not in repo.KINDS:
        return error(400, "A kind is either work or talent.")
    return json_array(repo.studio_items(g.account["house_id"], kind))


@app.get("/api/studio/items/<item_id>")
@api_producer_required
def studio_item(item_id):
    item = repo.owned_item(g.account["house_id"], item_id)
    if not item:
        return not_found_json()
    payload = repo.studio_payload(
        item, repo.media_for_items([item["id"]]).get(item["id"], [])
    )
    if item["kind"] == "work":
        payload["credits"] = repo.credits_for(item["house_id"], item["id"])
    else:
        payload["selected_work"] = repo.selected_work_for_talent(item["house_id"], item["id"])
    return jsonify(payload)


@app.post("/api/studio/items")
@api_producer_required
def studio_create():
    body = request.get_json(silent=True) or request.form or {}
    try:
        item = repo.create_item(
            g.account["house_id"],
            (body.get("kind") or "").strip().lower(),
            body.get("slug") or "",
            body.get("title") or "",
            body.get("discipline"),
            body.get("variant"),
        )
    except repo.Conflict as exc:
        return error(409, str(exc))
    except repo.Invalid as exc:
        return error(400, str(exc))
    return jsonify(repo.studio_payload(item, [])), 201


@app.patch("/api/studio/items/<item_id>")
@api_producer_required
def studio_update(item_id):
    item = repo.owned_item(g.account["house_id"], item_id)
    if not item:
        return not_found_json()
    body = request.get_json(silent=True) or request.form or {}
    try:
        updated = repo.update_item(g.account["house_id"], item, dict(body))
    except repo.Invalid as exc:
        return error(400, str(exc))
    return jsonify(
        repo.studio_payload(updated, repo.media_for_items([item["id"]]).get(item["id"], []))
    )


@app.post("/api/studio/items/<item_id>/publish")
@api_producer_required
def studio_publish(item_id):
    item = repo.owned_item(g.account["house_id"], item_id)
    if not item:
        return not_found_json()
    body = request.get_json(silent=True) or request.form or {}
    published = body.get("published")
    if isinstance(published, str):
        published = published.lower() in ("1", "true", "yes", "on")
    if published is None:
        published = True
    try:
        updated = repo.set_published(g.account["house_id"], item, bool(published))
    except repo.Invalid as exc:
        return error(422, str(exc))
    payload = repo.studio_payload(
        updated, repo.media_for_items([item["id"]]).get(item["id"], [])
    )
    if updated["published"] and updated["kind"] == "work":
        works = repo.published_items(updated["house_id"], "work")
        ids = [w["id"] for w in works]
        if updated["id"] in ids:
            payload["ordinal"] = repo.ordinal_string(ids.index(updated["id"]))
    return jsonify(payload)


@app.post("/api/studio/items/<item_id>/media")
@api_producer_required
def studio_media(item_id):
    item = repo.owned_item(g.account["house_id"], item_id)
    if not item:
        return not_found_json()
    body = request.get_json(silent=True) or request.form or {}
    try:
        row = repo.add_media(
            g.account["house_id"], item,
            body.get("role") or "poster", body.get("seed") or "",
            body.get("width"), body.get("height"), body.get("alt") or "",
        )
    except repo.Invalid as exc:
        return error(400, str(exc))
    return jsonify(
        {"media_id": row["id"], "role": row["role"], "width": row["width"],
         "height": row["height"], "alt": row["alt"], "url": f"/api/media/{row['id']}"}
    ), 201


@app.post("/api/studio/items/<item_id>/credits")
@api_producer_required
def studio_credits(item_id):
    item = repo.owned_item(g.account["house_id"], item_id)
    if not item:
        return not_found_json()
    body = request.get_json(silent=True) or request.form or {}
    try:
        row = repo.add_credit(
            g.account["house_id"], item, body.get("role") or "", body.get("name") or "",
            body.get("talent_id"),
        )
    except repo.Invalid as exc:
        return error(400, str(exc))
    return jsonify(
        {"id": row["id"], "item_id": row["item_id"], "position": row["position"],
         "role": row["role"], "name": row["name"], "talent_id": row["talent_item_id"]}
    ), 201


@app.post("/api/studio/items/<item_id>/slug")
@api_producer_required
def studio_slug(item_id):
    item = repo.owned_item(g.account["house_id"], item_id)
    if not item:
        return not_found_json()
    body = request.get_json(silent=True) or request.form or {}
    try:
        updated = repo.change_slug(g.account["house_id"], item, body.get("slug") or "")
    except repo.Conflict as exc:
        return error(409, str(exc))
    except repo.Invalid as exc:
        return error(400, str(exc))
    payload = repo.studio_payload(
        updated, repo.media_for_items([item["id"]]).get(item["id"], [])
    )
    payload["previous_slug"] = item["slug"]
    return jsonify(payload)


@app.post("/api/studio/works/order")
@api_producer_required
def studio_order():
    body = request.get_json(silent=True) or request.form or {}
    ordered = body.get("ordered_ids")
    if isinstance(ordered, str):
        try:
            ordered = json.loads(ordered)
        except ValueError:
            ordered = None
    try:
        result = repo.reorder_works(g.account["house_id"], ordered)
    except repo.Invalid as exc:
        return error(400, str(exc))
    if not result:
        return not_found_json()
    return json_array(result)


@app.post("/api/studio/preview-tokens")
@api_producer_required
def studio_preview_tokens():
    body = request.get_json(silent=True) or request.form or {}
    item = repo.owned_item(g.account["house_id"], body.get("item_id"))
    if not item:
        return not_found_json()
    payload = repo.mint_preview_token(g.account["house_id"], item, g.account["id"])
    response = make_response(jsonify(payload), 201)
    response.headers["Cache-Control"] = "no-store, private"
    return response


@app.route("/api/studio/<path:rest>", methods=["GET", "POST", "PATCH", "PUT", "DELETE"])
def studio_catch_all(rest):
    """No studio address answers without a producer session, even an unknown one."""
    account = current_account()
    if not account:
        return error(401, "Sign in as a producer to use the studio.")
    if account["role"] != "producer" or not account["house_id"]:
        return error(403, "Only a producer of a house may use the studio.")
    return not_found_json()


# ---------------------------------------------------------------- page helpers

ROUTE_MARKS = {"entry": "entry", "works": "works", "talents": "talents", "about": "about"}


def page_context(**kwargs) -> dict:
    house = served_house()
    account = current_account()
    ctx = {
        "house": house,
        "account": account,
        "site_description": SITE_DESCRIPTION,
        "share_image": (PUBLIC_URL.rstrip("/") + "/api/share-image.svg") if PUBLIC_URL
        else "/api/share-image.svg",
        "mark": "entry",
        "ground": "light",
        "page_title": "Cirrus",
        "route_name": "entry",
        "indexable": True,
        "session_token": bearer_token() if account else None,
    }
    ctx.update(kwargs)
    return ctx


def render_page(template: str, status: int = 200, **kwargs):
    response = make_response(render_template(template, **page_context(**kwargs)), status)
    return response


def producer_page_guard():
    """A visitor lands on the sign-in route; a viewer is refused and sees the entry route."""
    account = current_account()
    if not account:
        return redirect("/studio/login?next=" + request.path)
    if account["role"] != "producer" or not account["house_id"]:
        return redirect("/")
    return None


# ---------------------------------------------------------------- public pages

@app.get("/")
def page_entry():
    house = served_house()
    works = repo.list_works(house["id"])
    return render_page(
        "entry.html", works=works, mark="entry", ground="dark", route_name="entry",
        page_title="Cirrus",
    )


@app.get("/works")
def page_works():
    house = served_house()
    works = repo.list_works(house["id"])
    return render_page(
        "works.html", works=works, mark="works", route_name="works",
        page_title="Cirrus - Works",
    )


@app.get("/works/<slug>")
def page_work(slug):
    house = served_house()
    item, redirect_to = repo.resolve_slug(house["id"], "work", slug)
    if not item or not item["published"]:
        return render_not_found()
    if redirect_to and redirect_to != slug:
        return redirect(f"/works/{redirect_to}", code=301)
    work = repo.work_detail(house["id"], item)
    return render_page(
        "work_detail.html", work=work, mark="works", route_name="works",
        page_title=f"Cirrus - {work['title']}",
    )


@app.get("/talents")
def page_talents():
    house = served_house()
    talents = repo.list_talents(house["id"])
    return render_page(
        "talents.html", talents=talents, disciplines=repo.disciplines(house["id"]),
        mark="talents", route_name="talents", page_title="Cirrus - Talents",
    )


@app.get("/talents/<slug>")
def page_talent(slug):
    house = served_house()
    item, redirect_to = repo.resolve_slug(house["id"], "talent", slug)
    if not item or not item["published"]:
        return render_not_found()
    if redirect_to and redirect_to != slug:
        return redirect(f"/talents/{redirect_to}", code=301)
    talent = repo.talent_detail(house["id"], item)
    return render_page(
        "talent_detail.html", talent=talent, mark="talents", route_name="talents",
        page_title=f"Cirrus - {talent['title']}",
    )


@app.get("/about")
def page_about():
    return render_page("about.html", mark="about", route_name="about",
                       page_title="Cirrus - About")


@app.get("/signup")
def page_signup():
    return render_page("signup.html", mark="entry", route_name="signup",
                       page_title="Cirrus - Sign up")


@app.get("/studio/login")
def page_login():
    return render_page("login.html", mark="entry", route_name="studio",
                       page_title="Cirrus - Studio", indexable=False)


# ---------------------------------------------------------------- preview page

@app.get("/preview/<token>")
def page_preview(token):
    account = current_account()
    if not account or account["role"] != "producer" or not account["house_id"]:
        return render_not_found()
    item = repo.preview_item(token, account["house_id"])
    if not item:
        return render_not_found()
    record = repo.item_detail_any(item["house_id"], item)
    response = render_page(
        "preview.html", record=record, kind=item["kind"], token=token,
        mark="works" if item["kind"] == "work" else "talents",
        route_name="preview", page_title="Cirrus - Preview", indexable=False,
    )
    response.headers["Cache-Control"] = "no-store, private, max-age=0"
    response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive"
    return response


# ---------------------------------------------------------------- studio pages

@app.get("/studio")
def page_studio():
    guard = producer_page_guard()
    if guard:
        return guard
    account = current_account()
    items = repo.studio_items(account["house_id"])
    house = repo.house_by_id(account["house_id"])
    return render_page(
        "studio.html", items=items, studio_house=house, mark="entry",
        route_name="studio", page_title="Cirrus - Studio", indexable=False,
    )


@app.get("/studio/<kind>/new")
def page_studio_new(kind):
    if kind not in ("talents", "works"):
        return render_not_found()
    guard = producer_page_guard()
    if guard:
        return guard
    account = current_account()
    return render_page(
        "studio_form.html", form_kind="talent" if kind == "talents" else "work",
        item=None, mark="entry", route_name="studio",
        page_title="Cirrus - Studio", indexable=False,
        studio_house=repo.house_by_id(account["house_id"]),
    )


@app.get("/studio/items/<item_id>")
def page_studio_item(item_id):
    guard = producer_page_guard()
    if guard:
        return guard
    account = current_account()
    item = repo.owned_item(account["house_id"], item_id)
    if not item:
        return render_not_found()
    payload = repo.studio_payload(
        item, repo.media_for_items([item["id"]]).get(item["id"], [])
    )
    if item["kind"] == "work":
        payload["credits"] = repo.credits_for(item["house_id"], item["id"])
    talents = [
        t for t in repo.studio_items(account["house_id"], "talent")
    ]
    return render_page(
        "studio_form.html", form_kind=item["kind"], item=payload, talents=talents,
        mark="entry", route_name="studio", page_title="Cirrus - Studio",
        indexable=False, studio_house=repo.house_by_id(account["house_id"]),
    )


@app.get("/studio/items/<item_id>/published")
def page_studio_published(item_id):
    guard = producer_page_guard()
    if guard:
        return guard
    account = current_account()
    item = repo.owned_item(account["house_id"], item_id)
    if not item:
        return render_not_found()
    payload = repo.studio_payload(
        item, repo.media_for_items([item["id"]]).get(item["id"], [])
    )
    if item["published"] and item["kind"] == "work":
        works = repo.published_items(item["house_id"], "work")
        ids = [w["id"] for w in works]
        if item["id"] in ids:
            payload["ordinal"] = repo.ordinal_string(ids.index(item["id"]))
    return render_page(
        "studio_published.html", item=payload, mark="entry", route_name="studio",
        page_title="Cirrus - Studio", indexable=False,
    )


# ---------------------------------------------------------------- not found

def render_not_found():
    response = render_page(
        "not_found.html", status=404, mark="entry", route_name="not-found",
        page_title="Cirrus", indexable=False,
    )
    return response


@app.errorhandler(404)
def handle_404(_exc):
    if request.path.startswith("/api/"):
        return not_found_json()
    return render_not_found()


@app.errorhandler(405)
def handle_405(_exc):
    if request.path.startswith("/api/"):
        return error(405, "That method is not allowed here.")
    return render_not_found()


@app.errorhandler(500)
def handle_500(exc):  # pragma: no cover
    sys.stdout.write(f"error: {exc}\n")
    sys.stdout.flush()
    if request.path.startswith("/api/"):
        return jsonify({"error": "Something went wrong."}), 500
    return render_page("not_found.html", status=500, mark="entry",
                       route_name="not-found", page_title="Cirrus", indexable=False)


def bootstrap():
    """Apply the schema and the seed, once and idempotently. Every step is held
    under one advisory lock; the retry covers a worker that still loses a catalog
    race, so a lost race delays a worker rather than killing it."""
    last = None
    for attempt in range(5):
        try:
            db.init_db()
            auth.ensure_token_table()
            db.seed()
            return
        except Exception as exc:
            last = exc
            sys.stdout.write(f"bootstrap attempt {attempt + 1} retrying: {exc}\n")
            sys.stdout.flush()
            time.sleep(1 + attempt)
    raise last


if __name__ == "__main__":  # pragma: no cover
    bootstrap()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "4173")))
