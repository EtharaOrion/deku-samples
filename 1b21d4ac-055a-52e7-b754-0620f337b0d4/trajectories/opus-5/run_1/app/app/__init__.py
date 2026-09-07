import logging
import sys
import time

from flask import Flask, g, render_template, request

from . import api, config, db, seed, views


def _configure_logging():
    """One request line on stdout."""
    root = logging.getLogger("cirrus")
    if not root.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(message)s"))
        root.addHandler(handler)
        root.setLevel(logging.INFO)
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    return root


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config["JSON_SORT_KEYS"] = False
    app.url_map.strict_slashes = False
    log = _configure_logging()

    app.register_blueprint(api.bp)
    app.register_blueprint(views.bp)

    @app.before_request
    def _start_timer():
        g._t0 = time.time()

    @app.after_request
    def _log_request(response):
        ms = (time.time() - getattr(g, "_t0", time.time())) * 1000
        log.info(
            '%s %s %s %.1fms',
            request.method, request.full_path.rstrip("?"), response.status_code, ms,
        )
        return response

    @app.errorhandler(404)
    def _not_found(_e):
        """A real not-found status on the site's own surface, without echoing the path."""
        if request.path.startswith("/api/"):
            from flask import jsonify
            return jsonify({"error": "That address is not here."}), 404
        try:
            ctx = views.base_context("", "Cirrus", "entry")
        except Exception:
            ctx = {"house": None, "route": "", "centre_mark": "entry",
                   "page_title": "Cirrus", "description": views.DESCRIPTION,
                   "account": None, "share_image": "/share.svg"}
        return render_template("not_found.html", **ctx), 404

    @app.errorhandler(405)
    def _method(_e):
        from flask import jsonify
        if request.path.startswith("/api/"):
            return jsonify({"error": "That method is not allowed here."}), 405
        return render_template("not_found.html", **views.base_context(
            "", "Cirrus", "entry")), 404

    @app.errorhandler(500)
    def _server_error(e):  # pragma: no cover
        log.exception("unhandled error: %s", e)
        from flask import jsonify
        if request.path.startswith("/api/"):
            return jsonify({"error": "Something went wrong here."}), 500
        return render_template("not_found.html", **views.base_context(
            "", "Cirrus", "entry")), 500

    with app.app_context():
        _bootstrap(log)

    return app


def _bootstrap(log, attempts: int = 30):
    """Schema and seed applied by the image itself, run once and idempotently."""
    last = None
    for i in range(attempts):
        try:
            db.init_schema()
            seed.run()
            log.info("cirrus: schema and seed ready")
            return
        except Exception as exc:  # pragma: no cover
            last = exc
            log.info("cirrus: waiting for database (%s/%s): %s", i + 1, attempts, exc)
            time.sleep(2)
    raise RuntimeError("could not prepare the database: %s" % last)
