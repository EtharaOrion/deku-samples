"""The Flask app. One request line on stdout, health behind a real read."""
import logging
import os
import sys

from flask import Flask, jsonify, render_template, request

from . import db, pixels, seed
from .config import Config

os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")


def create_app() -> Flask:
    here = os.path.dirname(os.path.abspath(__file__))
    app = Flask(__name__,
                static_folder="/app/static",
                static_url_path="/static",
                template_folder=os.path.join(here, "templates"))
    app.config.from_object(Config)
    app.url_map.strict_slashes = False
    app.jinja_env.trim_blocks = True
    app.jinja_env.lstrip_blocks = True

    logging.basicConfig(
        stream=sys.stdout, level=logging.INFO,
        format="%(message)s")
    app.logger.setLevel(logging.INFO)

    state = {"ready": False}

    def boot():
        if state["ready"]:
            return
        db.init_pool()
        seed.run()
        pixels.preload_grain()
        state["ready"] = True

    from . import routes as routes_mod
    from . import pages_routes as pages_mod

    app.register_blueprint(routes_mod.bp)
    app.register_blueprint(pages_mod.bp)

    @app.before_request
    def _ready():
        boot()

    # gunicorn's access log is the single request line on stdout

    @app.errorhandler(404)
    def not_found(err):
        if request.path.startswith("/api/"):
            return jsonify({"error": "not found"}), 404
        return render_template(
            "not_found.html", route_name="not-found",
            public_url=request.host_url.rstrip("/"), house_name="Cirrus",
            contact_email="prod@example.com"), 404

    @app.errorhandler(405)
    def bad_method(err):
        return jsonify({"error": "not found"}), 404

    @app.errorhandler(500)
    def server_error(err):
        return jsonify({"error": "the studio could not answer that"}), 500

    @app.get("/")
    def _root():
        return pages_mod.index()

    return app


app = create_app()
