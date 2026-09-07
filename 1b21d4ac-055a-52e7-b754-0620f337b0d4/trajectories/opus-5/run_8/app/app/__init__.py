import logging
import os
import sys
import time

from flask import Flask, g, request


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.url_map.strict_slashes = False

    from .api import bp as api_bp
    from .views import bp as site_bp

    app.register_blueprint(api_bp)
    app.register_blueprint(site_bp)

    logger = logging.getLogger("cirrus.access")
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    logger.propagate = False

    @app.before_request
    def _start_timer():
        g._started = time.time()

    @app.after_request
    def _log(response):
        # one request line on stdout
        ms = (time.time() - getattr(g, "_started", time.time())) * 1000
        logger.info('%s %s %s %d %.1fms',
                    request.remote_addr or "-", request.method,
                    request.full_path.rstrip("?"), response.status_code, ms)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        return response

    @app.errorhandler(500)
    def _server_error(err):  # pragma: no cover
        app.logger.exception("unhandled: %s", err)
        if request.path.startswith("/api/"):
            return {"error": "Something went wrong."}, 500
        return "Something went wrong.", 500

    return app


def run_seed():
    from .db import seed
    attempts = int(os.environ.get("SEED_ATTEMPTS", "30"))
    for i in range(attempts):
        try:
            seed()
            print("seed: ready", flush=True)
            return
        except Exception as exc:
            print("seed: waiting for database (%s)" % exc, flush=True)
            time.sleep(2)
    raise SystemExit("seed: database never became available")
