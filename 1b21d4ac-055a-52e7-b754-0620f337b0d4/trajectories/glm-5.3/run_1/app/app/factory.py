"""Application factory: wires config, database, routes and error handlers."""
import logging
import os

from flask import Flask, g, jsonify, render_template, request

from .db import Database
from .media import MediaRenderer
from .queries import house_by_slug
from .schema import apply_schema
from .seed import run_seed

SERVED_HOUSE = "cirrus"


def create_app(config=None):
    logging.basicConfig(
        level=logging.INFO,
        format='{"time":"%(asctime)s","level":"%(levelname)s","name":"%(name)s","message":"%(message)s"}',
    )
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    app = Flask(__name__, template_folder=os.path.join(root, "templates"), static_folder=os.path.join(root, "static"))
    app.config.update(
        DATABASE_URL=os.environ.get("DATABASE_URL", ""),
        APP_PUBLIC_URL=os.environ.get("APP_PUBLIC_URL", ""),
        APP_PUBLIC_PORT=os.environ.get("APP_PUBLIC_PORT", "4173"),
    )
    if config:
        app.config.update(config)

    db = Database(app.config["DATABASE_URL"])
    app.extensions["db"] = db
    app.extensions["media"] = MediaRenderer()

    from . import routes

    app.register_blueprint(routes.bp)

    @app.before_request
    def _open_conn():
        g.conn = db.connection()

    @app.teardown_appcontext
    def _close_conn(_close=None):
        conn = g.pop("conn", None)
        if conn is not None:
            conn.close()

    @app.errorhandler(404)
    def _not_found(_e):
        return not_found_response(status=404)

    @app.errorhandler(405)
    def _method(_e):
        return not_found_response(status=404)

    @app.errorhandler(500)
    def _server(_e):
        db.rollback()
        return not_found_response(status=500)

    # Schema and seed run at boot; both are idempotent, and the advisory lock
    # keeps gunicorn's workers from racing each other on first start.
    try:
        conn = db.connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_lock(918273645)")
            apply_schema(conn)
            run_seed(conn)
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_unlock(918273645)")
            conn.commit()
        finally:
            conn.close()
    except Exception as exc:  # pragma: no cover - startup diagnostics
        logging.getLogger("startup").error("schema/seed failed: %s", exc)

    @app.after_request
    def _cache_policy(response):
        """Public reads may be cached; studio and preview never are."""
        path = request.path
        if request.method == "GET":
            if path.startswith("/api/studio/") or path.startswith("/api/auth/") or path.startswith("/api/preview/"):
                response.headers["Cache-Control"] = "private, no-store"
            elif path.startswith("/preview/") or path.startswith("/studio"):
                response.headers["Cache-Control"] = "private, no-store"
                response.headers["X-Robots-Tag"] = "noindex, nofollow"
            elif path.startswith("/api/") or path in ("/", "/works", "/works/", "/talents", "/talents/", "/about") or path.startswith("/works/") or path.startswith("/talents/"):
                response.headers["Cache-Control"] = "public, max-age=15, stale-while-revalidate=30"
        return response

    return app


def not_found_response(status=404):
    """The site's own 404 surface. Never echoes the requested path."""
    if request.path.startswith("/api/") or request.path.startswith("/preview/"):
        return jsonify(error="Not found"), status
    house = None
    try:
        house = house_by_slug(g.conn, SERVED_HOUSE)
    except Exception:
        pass
    return (
        render_template(
            "notfound.html",
            house=house,
            page_title="Cirrus",
            meta_noindex=True,
            meta_description="A production house for picture and its makers.",
            frame_mark="entry",
        ),
        status,
    )
