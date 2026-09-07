"""The Flask application: the JSON API, the Jinja pages, and one request line on stdout."""
from __future__ import annotations

import os
import sys
import time

from flask import Flask, g, request

from . import api, db, pages, seed


def create_app() -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config["HOUSE_SLUG"] = os.environ.get("APP_HOUSE_SLUG", "cirrus")
    app.config["PUBLIC_URL"] = os.environ.get("APP_PUBLIC_URL", "")
    app.config["JSON_SORT_KEYS"] = False
    app.url_map.strict_slashes = False

    app.register_blueprint(api.bp)
    app.register_blueprint(pages.bp)

    @app.before_request
    def _start_timer():
        g._started = time.time()

    @app.after_request
    def _log(response):
        started = getattr(g, "_started", None)
        ms = (time.time() - started) * 1000 if started else 0.0
        print(
            f'{request.remote_addr or "-"} "{request.method} {request.full_path.rstrip("?")} '
            f'{request.environ.get("SERVER_PROTOCOL", "HTTP/1.1")}" {response.status_code} '
            f"{ms:.1f}ms",
            file=sys.stdout,
            flush=True,
        )
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        return response

    return app


def bootstrap() -> None:
    db.wait_for_db(float(os.environ.get("DB_WAIT_SECONDS", "90")))
    seed.run()


app = create_app()
