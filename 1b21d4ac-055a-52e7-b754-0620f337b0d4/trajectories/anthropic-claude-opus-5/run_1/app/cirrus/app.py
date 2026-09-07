"""The Flask application: the JSON API and the server-rendered documents."""
import logging
import os
import sys
from datetime import datetime, timezone

from flask import (
    Flask,
    Response,
    abort,
    g,
    jsonify,
    make_response,
    redirect,
    render_template,
    request,
)

from . import api, auth, cluster, db, media as media_gen, models, seed
from .models import NotFound, Refused

DESCRIPTION = "A production house for picture and its makers."


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config["JSON_SORT_KEYS"] = False
    app.url_map.strict_slashes = False  # /works and /works/ resolve alike
    app.register_blueprint(api.bp)

    logger = logging.getLogger("cirrus.access")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
    logger.propagate = False

    @app.before_request
    def _start_timer():
        g.started = datetime.now(timezone.utc)

    @app.after_request
    def _log_line(response):
        started = getattr(g, "started", None)
        ms = 0.0
        if started:
            ms = (datetime.now(timezone.utc) - started).total_seconds() * 1000.0
        # One request line on stdout.
        logger.info(
            '%s %s %s %d %.1fms',
            request.remote_addr or "-",
            request.method,
            request.full_path.rstrip("?") or request.path,
            response.status_code,
            ms,
        )
        return response

    # ------------------------------------------------------------------
    # template context
    # ------------------------------------------------------------------

    @app.context_processor
    def _inject():
        house = models.served_house()
        return {
            "house": house,
            "description": DESCRIPTION,
            "nav_items": [
                {"label": "WORKS", "href": "/works", "route": "works"},
                {"label": "TALENTS", "href": "/talents", "route": "talents"},
                {
                    "label": "CONTACT",
                    "href": "mailto:%s" % house["contact_email"],
                    "route": None,
                },
                {"label": "ABOUT", "href": "/about", "route": "about"},
            ],
            "now_year": datetime.now(timezone.utc).year,
        }

    def page(template, **ctx):
        ctx.setdefault("ground", "light")
        ctx.setdefault("route", "entry")
        ctx.setdefault("page_title", "Cirrus")
        ctx.setdefault("indexable", True)
        return render_template(template, **ctx)

    # ------------------------------------------------------------------
    # public documents
    # ------------------------------------------------------------------

    @app.get("/")
    def entry():
        house = models.served_house()
        works = models.works_index(house["id"])
        return page(
            "entry.html",
            route="entry",
            ground="dark",
            page_title="Cirrus",
            cluster=cluster.layout(works),
            works=works,
        )

    @app.get("/works")
    def works_index():
        house = models.served_house()
        works = models.works_index(house["id"])
        return page(
            "works.html",
            route="works",
            page_title="Cirrus - Works",
            works=works,
        )

    @app.get("/works/<slug>")
    def work_detail(slug):
        house = models.served_house()
        try:
            detail, redirect_slug = models.work_detail(house["id"], slug)
        except NotFound:
            return not_found_page()
        if redirect_slug:
            return redirect("/works/%s" % redirect_slug, code=301)
        return page(
            "work_detail.html",
            route="works",
            page_title="Cirrus - %s" % detail["title"],
            work=detail,
        )

    @app.get("/talents")
    def talents_index():
        house = models.served_house()
        talents = models.talents_index(house["id"])
        disciplines = models.disciplines_of(house["id"])
        return page(
            "talents.html",
            route="talents",
            page_title="Cirrus - Talents",
            talents=talents,
            disciplines=disciplines,
        )

    @app.get("/talents/<slug>")
    def talent_detail(slug):
        house = models.served_house()
        try:
            detail, redirect_slug = models.talent_detail(house["id"], slug)
        except NotFound:
            return not_found_page()
        if redirect_slug:
            return redirect("/talents/%s" % redirect_slug, code=301)
        return page(
            "talent_detail.html",
            route="talents",
            page_title="Cirrus - %s" % detail["title"],
            talent=detail,
        )

    @app.get("/about")
    def about():
        return page("about.html", route="about", page_title="Cirrus - About")

    @app.get("/signup")
    def signup_page():
        return page("signup.html", route="entry", page_title="Cirrus - Sign up", indexable=False)

    @app.get("/studio/login")
    def studio_login():
        nxt = request.args.get("next") or "/studio"
        if not nxt.startswith("/studio") and not nxt.startswith("/preview"):
            nxt = "/studio"
        return page(
            "studio_login.html",
            route="entry",
            page_title="Cirrus - Studio",
            indexable=False,
            next_url=nxt,
        )

    # ------------------------------------------------------------------
    # studio documents: a viewer or a visitor never reaches one
    # ------------------------------------------------------------------

    def require_producer_page():
        """Returns (account, response). A visitor lands on the login route; a
        signed-in viewer is refused and sees the entry route."""
        account = auth.current_account()
        if account is None:
            return None, redirect("/studio/login?next=%s" % request.path, code=302)
        if account["role"] != "producer" or not account["house_id"]:
            return None, redirect("/", code=303)
        return account, None

    @app.get("/studio")
    def studio_home():
        account, response = require_producer_page()
        if response is not None:
            return response
        items = models.studio_items(account["house_id"])
        return page(
            "studio.html",
            route="entry",
            page_title="Cirrus - Studio",
            indexable=False,
            account=account,
            items=items,
        )

    @app.get("/studio/talents/new")
    def studio_new_talent():
        account, response = require_producer_page()
        if response is not None:
            return response
        return page(
            "studio_form.html",
            route="entry",
            page_title="Cirrus - New talent",
            indexable=False,
            account=account,
            kind="talent",
            item=None,
        )

    @app.get("/studio/works/new")
    def studio_new_work():
        account, response = require_producer_page()
        if response is not None:
            return response
        return page(
            "studio_form.html",
            route="entry",
            page_title="Cirrus - New work",
            indexable=False,
            account=account,
            kind="work",
            item=None,
        )

    @app.get("/studio/items/<item_id>")
    def studio_edit(item_id):
        account, response = require_producer_page()
        if response is not None:
            return response
        try:
            row = models.studio_item(account["house_id"], item_id)
        except NotFound:
            return not_found_page()
        talents = [
            t
            for t in models.studio_items(account["house_id"], "talent")
        ]
        return page(
            "studio_form.html",
            route="entry",
            page_title="Cirrus - %s" % row["title"],
            indexable=False,
            account=account,
            kind=row["kind"],
            item=models.studio_item_json(row),
            talents=talents,
        )

    @app.get("/studio/items/<item_id>/published")
    def studio_published(item_id):
        account, response = require_producer_page()
        if response is not None:
            return response
        try:
            row = models.studio_item(account["house_id"], item_id)
        except NotFound:
            return not_found_page()
        detail = models.studio_item_json(row)
        ordinal = None
        if row["kind"] == "work" and row["published"]:
            published = models.published_items(account["house_id"], "work")
            ids = [r["id"] for r in published]
            if row["id"] in ids:
                ordinal = models.ordinal_string(ids.index(row["id"]) + 1)
        return page(
            "studio_published.html",
            route="entry",
            page_title="Cirrus - Published",
            indexable=False,
            account=account,
            item=detail,
            ordinal=ordinal,
        )

    # ------------------------------------------------------------------
    # the preview harness
    # ------------------------------------------------------------------

    @app.get("/preview/<token>")
    def preview(token):
        account = auth.current_account()
        try:
            item = models.resolve_preview(token, account)
        except NotFound:
            if account is None:
                response = make_response(
                    page(
                        "preview_empty.html",
                        route="entry",
                        page_title="Cirrus - Preview",
                        indexable=False,
                    ),
                    404,
                )
            else:
                response = make_response(not_found_page())
            response.headers["Cache-Control"] = "private, no-store, max-age=0"
            response.headers["X-Robots-Tag"] = "noindex, nofollow"
            return response
        payload = models.preview_payload(item)
        template = "work_detail.html" if item["kind"] == "work" else "talent_detail.html"
        ctx = {"work": payload} if item["kind"] == "work" else {"talent": payload}
        html = page(
            template,
            route="works" if item["kind"] == "work" else "talents",
            page_title="Cirrus - Preview",
            indexable=False,
            preview=True,
            **ctx,
        )
        response = make_response(html)
        response.headers["Cache-Control"] = "private, no-store, max-age=0"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        return response

    # ------------------------------------------------------------------
    # generated assets
    # ------------------------------------------------------------------

    @app.get("/share.svg")
    def share_image():
        resp = Response(media_gen.share_image_svg(), mimetype="image/svg+xml")
        resp.headers["Cache-Control"] = "public, max-age=86400"
        return resp

    @app.get("/robots.txt")
    def robots():
        return Response(
            "User-agent: *\nDisallow: /preview/\nDisallow: /studio\nAllow: /\n",
            mimetype="text/plain",
        )

    # ------------------------------------------------------------------
    # errors
    # ------------------------------------------------------------------

    def not_found_page():
        # A real not-found status on the site's own surface, no path echoed.
        html = render_template(
            "not_found.html",
            route="entry",
            ground="light",
            page_title="Cirrus - Not found",
            indexable=False,
        )
        return make_response(html, 404)

    @app.errorhandler(404)
    def _404(_exc):
        if request.path.startswith("/api/"):
            return jsonify({"error": "That record is not here."}), 404
        return not_found_page()

    @app.errorhandler(405)
    def _405(_exc):
        if request.path.startswith("/api/"):
            return jsonify({"error": "That method is not allowed here."}), 405
        return not_found_page()

    @app.errorhandler(Refused)
    def _refused(exc):
        if request.path.startswith("/api/"):
            return jsonify({"error": exc.message}), exc.status
        if exc.status == 404:
            return not_found_page()
        return make_response(exc.message, exc.status)

    @app.after_request
    def _headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        if request.path.startswith("/preview/") or request.path.startswith("/studio"):
            response.headers["Cache-Control"] = "private, no-store, max-age=0"
            response.headers["X-Robots-Tag"] = "noindex, nofollow"
        return response

    return app


def bootstrap():
    """Schema and seed, applied by the image itself, once and idempotently."""
    db.wait_for_db()
    db.init_schema()
    seed.run()


app = create_app()
