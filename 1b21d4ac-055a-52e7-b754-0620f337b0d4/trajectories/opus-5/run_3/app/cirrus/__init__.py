"""Cirrus: the public site of a production house, and its private studio."""
import os
import sys
import time

from flask import Flask, g, request

from . import auth, db, repo
from .api import api
from .pages import pages

SERVED_HOUSE_SLUG = os.environ.get("APP_HOUSE_SLUG", "cirrus")


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config["JSON_SORT_KEYS"] = False
    app.url_map.strict_slashes = False

    def served_house():
        if "served_house" not in g:
            row = repo.house_by_slug(SERVED_HOUSE_SLUG)
            if row is None:
                raise RuntimeError(f"House '{SERVED_HOUSE_SLUG}' is not seeded")
            g.served_house = row
        return g.served_house

    app.served_house = served_house

    app.register_blueprint(api)
    app.register_blueprint(pages)

    @app.before_request
    def _start_timer():
        g._started = time.time()

    @app.after_request
    def _log(response):
        # One request line on stdout.
        ms = (time.time() - getattr(g, "_started", time.time())) * 1000
        sys.stdout.write(
            f'{request.method} {request.full_path.rstrip("?")} '
            f"{response.status_code} {ms:.1f}ms\n"
        )
        sys.stdout.flush()
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        return response

    @app.teardown_request
    def _teardown(exc):
        db.close_conn(exc)

    @app.errorhandler(repo.Refused)
    def _refused(exc):
        if request.path.startswith("/api/"):
            payload = {"error": exc.message, "reason": exc.message}
            if exc.field:
                payload["field"] = exc.field
            return payload, exc.status
        from .pages import not_found
        return not_found()

    @app.context_processor
    def _inject():
        return {"static_v": os.environ.get("BUILD_ID", "1")}

    return app
