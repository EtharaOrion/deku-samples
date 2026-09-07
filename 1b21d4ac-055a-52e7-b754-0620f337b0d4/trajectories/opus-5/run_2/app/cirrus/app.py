"""Application factory. One request line on stdout, schema and seed applied by
the image itself at start-up."""
from __future__ import annotations

import logging
import os
import sys
import time

from flask import Flask, g, request

from . import db
from .api import bp as api_bp
from .views import bp as views_bp

log = logging.getLogger("cirrus.access")


def create_app() -> Flask:
    app = Flask(__name__, template_folder="templates", static_folder="static",
                static_url_path="/static")
    app.url_map.strict_slashes = False
    app.config["JSON_SORT_KEYS"] = False

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    log.handlers = [handler]
    log.setLevel(logging.INFO)
    log.propagate = False

    app.register_blueprint(api_bp)
    app.register_blueprint(views_bp)

    @app.before_request
    def _start_timer():
        g._t0 = time.time()

    @app.after_request
    def _log_line(response):
        duration = (time.time() - getattr(g, "_t0", time.time())) * 1000
        log.info('%s %s %s %.1fms', request.method, request.full_path.rstrip("?"),
                 response.status_code, duration)
        return response

    app.teardown_appcontext(db.close_conn)

    db.ensure_ready()
    return app


app = create_app()


if __name__ == "__main__":  # pragma: no cover
    port = int(os.environ.get("PORT") or 4173)
    app.run(host="0.0.0.0", port=port)
