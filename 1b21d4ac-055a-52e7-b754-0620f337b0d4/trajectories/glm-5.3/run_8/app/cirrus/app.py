"""Cirrus: server-rendered Flask app, Jinja templates, Alpine.js in place.

The server owns the data, the authorization and the generated pixels. The
browser owns motion and nothing else.
"""
from __future__ import annotations

import logging
import os
import sys
import time
from pathlib import Path

from flask import (
    Flask,
    Response,
    jsonify,
    make_response,
    redirect,
    render_template,
    request,
    send_file,
    url_for,
)
from werkzeug.exceptions import HTTPException

from . import auth, media, repo, share

from .db import init_db, new_hex_token, utcnow

BASE = Path(__file__).resolve().parent
SERVED_HOUSE = os.environ.get("CIRRUS_HOUSE", "cirrus")
PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "")
PUBLIC_PORT = os.environ.get("APP_PUBLIC_PORT", "")


def create_app() -> Flask:
    app = Flask(
        "cirrus",
        static_folder=str(BASE / "static"),
        template_folder=str(BASE / "templates"),
    )
    app.config["JSON_SORT_KEYS"] = False
    app.config["TEMPLATES_AUTO_RELOAD"] = os.environ.get("CIRRUS_DEBUG") == "1"
    app.jinja_env.trim_blocks = True

    app.jinja_env.lstrip_blocks = True

    app.json.sort_keys = False

    db = init_db(os.environ["DATABASE_URL"])

    # ------------------------------------------------------------- logging
    log = logging.getLogger("cirrus.request")
    log.setLevel(logging.INFO)
    if not log.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(message)s"))
        log.addHandler(handler)
    log.propagate = False

    _req_start: dict = {}

    @app.before_request
    def _mark_start():
        _req_start["t"] = time.time()

    @app.after_request
    def cache_policy(resp: Response):
        if request.path.startswith("/api/studio/") or request.path.startswith("/preview/") \
                or request.path.startswith("/api/preview/") or request.path.startswith("/api/auth/"):
            resp.headers.setdefault("Cache-Control", "private, no-store")
        return resp

    @app.after_request
    def one_line_per_request(resp: Response):
        dt = (time.time() - _req_start.get("t", time.time())) * 1000
        log.info(
            "%s %s -> %s %.1fms",
            request.method,
            request.path,
            resp.status_code,
            dt,
        )
        return resp


    # ------------------------------------------------------- template state
    def house():
        row = db.one("SELECT * FROM houses WHERE slug = %s", (SERVED_HOUSE,))
        return row

    @app.context_processor
    def ctx():
        h = house()
        return {
            "house": h,
            "nav": (
                ("WORKS", "/works"),
                ("TALENTS", "/talents"),
                ("CONTACT", f"mailto:{h['contact_email']}" if h else "#"),
                ("ABOUT", "/about"),
            ),
            "route_key": _route_key(request.path),
        }

    def _route_key(path: str) -> str:
        if path == "/" or path == "":
            return "entry"
        if path.startswith("/works"):
            return "works"
        if path.startswith("/talents"):
            return "talents"
        if path.startswith("/about"):
            return "about"
        return "entry"

    # ------------------------------------------------------------------ api
    class ApiError(Exception):
        def __init__(self, message: str, status: int = 400):
            super().__init__(message)
            self.message = message
            self.status = status

    @app.errorhandler(ApiError)
    def api_error(err: ApiError):
        return jsonify({"error": err.message}), err.status

    @app.errorhandler(repo.NotFound)
    def not_found(err):
        if request.path.startswith("/api/"):
            return jsonify({"error": "not found"}), 404
        return render_template("not_found.html", noindex=True), 404

    @app.errorhandler(repo.Conflict)
    def conflict(err):
        return jsonify({"error": str(err)}), 409

    @app.errorhandler(repo.BadRequest)
    def bad_request(err):
        if request.path.startswith("/api/"):
            return jsonify({"error": str(err)}), 400
        return render_template("not_found.html", noindex=True), 404

    @app.errorhandler(404)
    def http_404(err):
        if request.path.startswith("/api/"):
            return jsonify({"error": "not found"}), 404
        return render_template("not_found.html", noindex=True), 404

    @app.errorhandler(405)
    def http_405(err):
        return jsonify({"error": "method not allowed"}), 405

    @app.errorhandler(Exception)
    def unhandled(err):  # pragma: no cover - defensive
        if isinstance(err, HTTPException):
            if request.path.startswith("/api/"):
                return jsonify({"error": err.description or err.name}), err.code
            if err.code == 404:
                return render_template("not_found.html", noindex=True), 404
            return err
        app.logger.exception("unhandled")
        return jsonify({"error": "something went wrong"}), 500

    # ----------------------------------------------------------------- auth


    def current_account():
        header = request.headers.get("Authorization", "")
        token = header[7:].strip() if header.lower().startswith("bearer ") else ""
        if not token:
            # the studio pages are documents and cannot carry a bearer header;
            # the same opaque token rides an httpOnly cookie for them only
            token = (request.cookies.get("cirrus_session") or "").strip()
        if not token or len(token) > 512:
            return None
        row = db.one(
            """SELECT a.id, a.email, a.role, a.house_id, h.slug AS house_slug
               FROM accounts a LEFT JOIN houses h ON h.id = a.house_id
               WHERE a.token_hash = %s AND a.token_expires_at > %s""",
            (auth.token_lookup_hash(token), utcnow()),
        )
        return row


    def require_producer():
        account = current_account()
        if not account or account["role"] != "producer":
            raise ApiError("sign in as a producer to use the studio", 401)
        return account

    def own_house_id(account) -> str:
        return account["house_id"]

    @app.post("/api/auth/signup")
    def signup():
        body = request.get_json(silent=True) or {}
        email = (body.get("email") or "").strip().lower()
        password = body.get("password") or ""
        if "@" not in email or "." not in email.split("@")[-1] or len(email) > 320:
            raise ApiError("a real email address is required", 400)
        if len(password) < 8:
            raise ApiError("a password of at least eight characters is required", 400)
        existing = db.one("SELECT id FROM accounts WHERE email = %s", (email,))
        if existing:
            raise ApiError("that email is already registered", 409)
        token = auth.new_token()
        expires = utcnow().replace(microsecond=0)
        from datetime import timedelta

        expires = expires + timedelta(days=30)
        try:
            row = db.one(
                """INSERT INTO accounts (email, password_hash, role, house_id,
                                         token_hash, token_expires_at)
                   VALUES (%s, %s, 'viewer', NULL, %s, %s)
                   RETURNING id, email, role, created_at""",
                (email, auth.hash_password(password),
                 auth.token_lookup_hash(token), expires),
            )
        except repo.UniqueViolation:
            raise ApiError("that email is already registered", 409)
        resp = jsonify(
            {
                "account": {
                    "id": row["id"],
                    "email": row["email"],
                    "role": row["role"],
                    "created_at": repo._iso(row["created_at"]),
                },
                "token": token,
                "expires_at": repo._iso(expires),
            }
        )
        resp.status_code = 201
        resp.set_cookie(
            "cirrus_session", token, max_age=30 * 86400, httponly=True,
            samesite="Lax", path="/",
        )
        return resp

    @app.post("/api/auth/login")
    def login():
        body = request.get_json(silent=True) or {}
        email = (body.get("email") or "").strip().lower()
        password = body.get("password") or ""
        row = db.one("SELECT * FROM accounts WHERE email = %s", (email,))
        if not row or not auth.verify_password(row["password_hash"], password):
            raise ApiError("that email and password do not match", 401)
        if auth.needs_rehash(row["password_hash"]):
            db.run(
                "UPDATE accounts SET password_hash = %s WHERE id = %s",
                (auth.hash_password(password), row["id"]),
            )
        token = auth.new_token()
        from datetime import timedelta

        expires = utcnow().replace(microsecond=0) + timedelta(days=30)
        db.run(
            "UPDATE accounts SET token_hash = %s, token_expires_at = %s WHERE id = %s",
            (auth.token_lookup_hash(token), expires, row["id"]),
        )
        resp = jsonify(
            {
                "token": token,
                "expires_at": repo._iso(expires),
                "account": {
                    "id": row["id"],
                    "email": row["email"],
                    "role": row["role"],
                    "house_id": row["house_id"],
                },
            }
        )
        resp.set_cookie(
            "cirrus_session", token, max_age=30 * 86400, httponly=True,
            samesite="Lax", path="/",
        )
        return resp


    @app.post("/api/auth/logout")
    def logout():
        account = current_account()
        if account:
            db.run(
                "UPDATE accounts SET token_hash = NULL, token_expires_at = NULL WHERE id = %s",
                (account["id"],),
            )
        resp = jsonify({"ok": True})
        resp.delete_cookie("cirrus_session", path="/")
        return resp


    @app.get("/api/auth/me")
    def me():
        account = current_account()
        if not account:
            raise ApiError("not signed in", 401)
        return jsonify(
            {
                "id": account["id"],
                "email": account["email"],
                "role": account["role"],
                "house_id": account["house_id"],
            }
        )

    # --------------------------------------------------------- public reads

    @app.get("/api/health")
    def health():
        db.healthy()
        return jsonify({"ok": True, "house": SERVED_HOUSE})

    @app.post("/api/analytics/pageview")
    def analytics_pageview():
        """Counts page views and nothing else. Nothing is stored, nothing is
        written to a visitor's machine, and a loader that never arrives fails
        quietly."""
        log.info("pageview %s", request.headers.get("Referer", "-"))
        return "", 204

    @app.get("/api/works")
    def api_works():
        h = house()
        resp = jsonify(repo.public_works(db, h["id"]))
        resp.headers["Cache-Control"] = "public, max-age=15, stale-while-revalidate=30"
        return resp

    @app.get("/api/works/<slug>")
    def api_work(slug):
        h = house()
        target = repo.redirect_target(db, h["id"], "work", slug)
        if target and target["slug"] != slug:
            return redirect(f"/api/works/{target['slug']}", code=308)
        work = repo.public_work(db, h["id"], slug)
        if not work:
            raise ApiError("not found", 404)
        return jsonify(work)

    @app.get("/api/talents")
    def api_talents():
        h = house()
        discipline = request.args.get("discipline")
        resp = jsonify(repo.public_talents(db, h["id"], discipline))
        resp.headers["Cache-Control"] = "public, max-age=15, stale-while-revalidate=30"
        return resp

    @app.get("/api/talents/<slug>")
    def api_talent(slug):
        h = house()
        target = repo.redirect_target(db, h["id"], "talent", slug)
        if target and target["slug"] != slug:
            return redirect(f"/api/talents/{target['slug']}", code=308)
        talent = repo.public_talent(db, h["id"], slug)
        if not talent:
            raise ApiError("not found", 404)
        return jsonify(talent)

    @app.get("/api/disciplines")
    def api_disciplines():
        h = house()
        resp = jsonify(repo.derived_disciplines(db, h["id"]))
        resp.headers["Cache-Control"] = "public, max-age=15, stale-while-revalidate=30"
        return resp

    @app.get("/api/media/<media_id>")
    def api_media(media_id):
        media_id = (media_id or "").lower()
        if len(media_id) != 32 or any(c not in "0123456789abcdef" for c in media_id):
            raise ApiError("not found", 404)
        row = db.one(
            """SELECT m.id, m.seed, m.width, m.height, m.alt, m.item_id,
                      i.published AS item_published, i.house_id AS item_house
               FROM media m JOIN items i ON i.id = m.item_id
               WHERE m.id = %s""",
            (media_id,),
        )
        if not row:
            raise ApiError("not found", 404)
        if not row["item_published"]:
            # Unlisted pixels answer to the record's own house producer only,
            # however the caller got the address.
            account = current_account()
            if not account or account["role"] != "producer" or account["house_id"] != row["item_house"]:
                raise ApiError("not found", 404)
        png = media.still(row["seed"], row["width"], row["height"])
        resp = make_response(png, 200)
        resp.headers["Content-Type"] = "image/png"
        # the answer varies with the caller, so no shared cache may hold it
        resp.headers["Vary"] = "Authorization, Cookie"
        resp.headers["Cache-Control"] = (
            "private, max-age=60" if row["item_published"] else "private, no-store"
        )
        return resp


    @app.get("/api/preview/<token>")
    def api_preview(token):
        token = (token or "").lower()
        row = repo.resolve_preview_token(db, token)
        if not row:
            raise ApiError("not found", 404)
        account = current_account()
        if not account or account["role"] != "producer" or account["house_id"] != row["house_id"]:
            raise ApiError("not found", 404)
        return jsonify(repo.studio_item(db, row["house_id"], row["item_id"]))

    # --------------------------------------------------------------- studio

    @app.get("/api/studio/items")
    def studio_items():
        account = require_producer()
        kind = request.args.get("kind")
        if kind and kind not in ("work", "talent"):
            raise ApiError("kind must be work or talent", 400)
        return jsonify(repo.studio_items(db, account["house_id"], kind))

    @app.get("/api/studio/items/<item_id>")
    def studio_item(item_id):
        account = require_producer()
        return jsonify(repo.studio_item(db, account["house_id"], item_id))

    @app.post("/api/studio/items")
    def studio_create():
        account = require_producer()
        body = request.get_json(silent=True) or {}
        item = repo.create_item(db, account["house_id"], body)
        return jsonify(item), 201

    @app.patch("/api/studio/items/<item_id>")
    def studio_update(item_id):
        account = require_producer()
        body = request.get_json(silent=True) or {}
        return jsonify(repo.update_item(db, account["house_id"], item_id, body))

    @app.post("/api/studio/items/<item_id>/publish")
    def studio_publish(item_id):
        account = require_producer()
        body = request.get_json(silent=True) or {}
        published = body.get("published")
        if not isinstance(published, bool):
            raise ApiError("published must be true or false", 400)
        return jsonify(repo.set_published(db, account["house_id"], item_id, published))

    @app.post("/api/studio/items/<item_id>/media")
    def studio_media(item_id):
        account = require_producer()
        body = request.get_json(silent=True) or {}
        return jsonify(repo.add_media(db, account["house_id"], item_id, body)), 201

    @app.post("/api/studio/items/<item_id>/credits")
    def studio_credit(item_id):
        account = require_producer()
        body = request.get_json(silent=True) or {}
        return jsonify(repo.add_credit(db, account["house_id"], item_id, body)), 201

    @app.post("/api/studio/items/<item_id>/slug")
    def studio_slug(item_id):
        account = require_producer()
        body = request.get_json(silent=True) or {}
        slug = (body.get("slug") or "").strip()
        if not slug:
            raise ApiError("a slug is required", 400)
        return jsonify(repo.rename_slug(db, account["house_id"], item_id, slug))

    @app.post("/api/studio/works/order")
    def studio_order():
        account = require_producer()
        body = request.get_json(silent=True) or {}
        ordered = body.get("ordered_ids") or []
        return jsonify(repo.reorder_works(db, account["house_id"], ordered))

    @app.post("/api/studio/preview-tokens")
    def studio_preview_token():
        account = require_producer()
        body = request.get_json(silent=True) or {}
        item_id = (body.get("item_id") or "").strip()
        if not item_id:
            raise ApiError("item_id is required", 400)
        return (
            jsonify(repo.mint_preview_token(db, account["house_id"], item_id, account["id"])),
            201,
        )

    # ---------------------------------------------------------- page routes

    def _page(template: str, **kwargs):
        return render_template(template, **kwargs)

    @app.get("/")
    def page_entry():
        h = house()
        works = repo.public_works(db, h["id"])
        return _page("entry.html", works=works, title="Cirrus", route="entry")

    @app.get("/works")
    @app.get("/works/")
    def page_works():
        h = house()
        works = repo.public_works(db, h["id"])
        return _page("works.html", works=works, title="Cirrus - Works", route="works")

    @app.get("/works/<slug>")
    def page_work(slug):
        h = house()
        target = repo.redirect_target(db, h["id"], "work", slug)
        if target and target["slug"] != slug:
            return redirect(f"/works/{target['slug']}", code=301)
        work = repo.public_work(db, h["id"], slug)
        if not work:
            return render_template("not_found.html", noindex=True), 404
        return _page(
            "work.html", work=work, title=f"Cirrus - {work['title']}", route="work"
        )

    @app.get("/talents")
    @app.get("/talents/")
    def page_talents():
        h = house()
        talents = repo.public_talents(db, h["id"])
        disciplines = repo.derived_disciplines(db, h["id"])
        return _page(
            "talents.html",
            talents=talents,
            disciplines=disciplines,
            title="Cirrus - Talents",
            route="talents",
        )

    @app.get("/talents/<slug>")
    def page_talent(slug):
        h = house()
        target = repo.redirect_target(db, h["id"], "talent", slug)
        if target and target["slug"] != slug:
            return redirect(f"/talents/{target['slug']}", code=301)
        talent = repo.public_talent(db, h["id"], slug)
        if not talent:
            return render_template("not_found.html", noindex=True), 404
        return _page(
            "talent.html",
            talent=talent,
            disciplines=repo.derived_disciplines(db, h["id"]),
            title=f"Cirrus - {talent['title']}",
            route="talent",
        )

    @app.get("/about")
    def page_about():
        return _page("about.html", title="Cirrus - About", route="about")

    @app.get("/signup")
    def page_signup():
        return _page("signup.html", title="Cirrus - Sign up", route="entry")

    @app.get("/studio/login")
    def page_login():
        return _page("studio_login.html", title="Cirrus - Studio", route="entry")

    def studio_guard():
        """Nobody: to the sign-in page. A viewer: refused, to the entry route."""
        account = current_account()
        if not account:
            return redirect("/studio/login", code=302)
        if account["role"] != "producer":
            return redirect("/", code=302)
        return account

    @app.get("/studio")
    def page_studio():
        account = studio_guard()
        if not isinstance(account, dict):
            return account
        items = repo.studio_items(db, account["house_id"])
        return _page("studio.html", items=items, account=account,
                     title="Cirrus - Studio", route="studio")

    @app.get("/studio/talents/new")
    def page_studio_new_talent():
        account = studio_guard()
        if not isinstance(account, dict):
            return account
        return _page("studio_form.html", kind="talent", item=None,
                     talents=[], title="Cirrus - New talent", route="studio")

    @app.get("/studio/works/new")
    def page_studio_new_work():
        account = studio_guard()
        if not isinstance(account, dict):
            return account
        return _page("studio_form.html", kind="work", item=None,
                     talents=[], title="Cirrus - New work", route="studio")

    @app.get("/studio/items/<item_id>")
    def page_studio_item(item_id):
        account = studio_guard()
        if not isinstance(account, dict):
            return account
        try:
            item = repo.studio_item(db, account["house_id"], item_id)
        except repo.NotFound:
            return render_template("not_found.html", noindex=True), 404
        talents = repo.studio_items(db, account["house_id"], "talent")
        return _page("studio_form.html", kind=item["kind"], item=item, talents=talents,
                     title=f"Cirrus - {item['title']}", route="studio")

    @app.get("/studio/items/<item_id>/published")
    def page_studio_published(item_id):
        account = studio_guard()
        if not isinstance(account, dict):
            return account
        try:
            item = repo.studio_item(db, account["house_id"], item_id)
        except repo.NotFound:
            return render_template("not_found.html", noindex=True), 404
        return _page("studio_published.html", item=item, account=account,
                     title=f"Cirrus - {item['title']} is live", route="studio")

    @app.get("/preview/<token>")
    def page_preview(token):
        token = (token or "").lower()
        row = repo.resolve_preview_token(db, token)
        if not row:
            return render_template("not_found.html", noindex=True), 404
        account = current_account()
        if not account or account["role"] != "producer" or account["house_id"] != row["house_id"]:
            return render_template("not_found.html", noindex=True), 404
        item = repo.studio_item(db, row["house_id"], row["item_id"])
        template = "work.html" if item["kind"] == "work" else "talent.html"
        if item["kind"] == "work":
            item["next"] = item["previous"] = None
            return _page(template, work=item, preview=True, noindex=True,
                         title="Cirrus - Preview", route="work")
        return _page(template, talent=item, preview=True, noindex=True,
                     disciplines=repo.derived_disciplines(db, row["house_id"]),
                     title="Cirrus - Preview", route="talent")

    @app.get("/share-image")
    def share_image_route():
        png = share.share_image()
        resp = make_response(png, 200)
        resp.headers["Content-Type"] = "image/png"
        resp.headers["Cache-Control"] = "public, max-age=86400"
        return resp


    return app
