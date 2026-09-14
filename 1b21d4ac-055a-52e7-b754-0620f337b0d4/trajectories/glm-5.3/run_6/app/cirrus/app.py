"""Cirrus: the public site and private studio of a Paris production house.

Server-rendered Flask + Jinja, enhanced in place by Alpine.js. PostgreSQL is
the only backing store; every pixel is generated from a stored seed.
"""
import datetime as dt
import functools
import json
import logging
import os
import re
import secrets
import sys
import threading
import time

from flask import (
    Flask,
    abort,
    g,
    jsonify,
    make_response,
    redirect,
    render_template,
    request,
    send_file,
    url_for,
)

from . import auth, db, media, queries, seed as seed_module, serialisers
from . import api_public, api_studio, pages

ROOT = os.path.dirname(os.path.abspath(__file__))

log = logging.getLogger("cirrus")
if not log.handlers:
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(logging.Formatter("%(asctime)s %(message)s", "%Y-%m-%dT%H:%M:%S"))
    log.addHandler(h)
    log.setLevel(logging.INFO)
logging.getLogger("werkzeug").setLevel(logging.ERROR)


SERVED_HOUSE = os.environ.get("SERVED_HOUSE", "cirrus")


class Cirrus(Flask):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.ready = False


def create_app():
    app = Cirrus(__name__, template_folder="templates", static_folder="static")
    app.config["JSON_SORT_KEYS"] = False
    app.jinja_env.trim_blocks = True
    app.jinja_env.lstrip_blocks = True
    app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))

    @app.before_request
    def _begin():
        g.t0 = time.perf_counter()

    @app.after_request
    def _finish(response):
        try:
            ms = (time.perf_counter() - g.t0) * 1000
            log.info(
                "%s %s %s %d %.1fms",
                request.remote_addr or "-",
                request.method,
                request.path,
                response.status_code,
                ms,
            )
        except Exception:
            pass
        return response

    app.register_blueprint(api_public.bp)
    app.register_blueprint(api_studio.bp)
    app.register_blueprint(pages.bp)

    def _error_house():
        try:
            with db.tx(readonly=True) as cur:
                row = db.one(
                    cur, "select * from houses where slug = %s", (SERVED_HOUSE,)
                )
                return row
        except Exception:
            return None

    @app.errorhandler(404)
    def _nf(e):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Not found"}), 404
        return (
            render_template(
                "not_found.html",
                meta={"title": "Cirrus", "route": "notfound"},
                house=_error_house(),
            ),
            404,
        )

    @app.errorhandler(405)
    def _mna(e):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Method not allowed"}), 405
        return (
            render_template(
                "not_found.html",
                meta={"title": "Cirrus", "route": "notfound"},
                house=_error_house(),
            ),
            405,
        )

    @app.errorhandler(500)
    def _ise(e):
        log.exception("internal error %s", request.path)
        if request.path.startswith("/api/"):
            return jsonify({"error": "Server error"}), 500
        return (
            render_template(
                "not_found.html",
                meta={"title": "Cirrus", "route": "notfound"},
                house=_error_house(),
            ),
            500,
        )

    @app.after_request
    def _cache(response):
        path = request.path
        if path.startswith("/static/") or path.startswith("/fonts/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif path.startswith("/preview"):
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Robots-Tag"] = "noindex, nofollow"
        elif path.startswith("/studio"):
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Robots-Tag"] = "noindex, nofollow"
        return response

    return app


def boot(app):
    """Apply the schema and seed once, idempotently, then mark the app ready."""
    with db.connection() as conn:
        cur = conn.cursor()
        try:
            # One worker at a time applies the schema and the seed.
            cur.execute("select pg_advisory_lock(918273645)")
            cur.execute(open(os.path.join(ROOT, "schema.sql")).read())
            conn.commit()
            with db.tx() as c:
                seed_module.run(c)
            app.ready = True
            log.info("boot: schema applied, seed complete")
        except Exception:
            conn.rollback()
            raise
        finally:
            try:
                cur.execute("select pg_advisory_unlock(918273645)")
                conn.commit()
            except Exception:
                pass
            cur.close()
