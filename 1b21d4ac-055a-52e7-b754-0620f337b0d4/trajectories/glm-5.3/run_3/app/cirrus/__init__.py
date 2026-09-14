"""App factory: schema, seed, blueprints, logging, one stdout line per request."""
import logging
import os
import sys
import time

from flask import Flask, g, jsonify, request

from . import db, seed

log = logging.getLogger("cirrus")


def _app_dir():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def create_app() -> Flask:
    app = Flask(
        "cirrus",
        static_folder=os.path.join(_app_dir(), "static"),
        static_url_path="/static",
        template_folder=os.path.join(_app_dir(), "templates"),
    )
    app.url_map.strict_slashes = False
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 31536000
    app.config["MAX_CONTENT_LENGTH"] = 1_000_000
    app.jinja_env.auto_reload = False

    from .app import api
    from .pages import pages

    app.register_blueprint(api)
    app.register_blueprint(pages)

    @app.errorhandler(404)
    @app.errorhandler(405)
    def _not_found(err):
        from flask import request, render_template
        if request.path.startswith("/api/"):
            return jsonify({"error": "Not found"}), 404
        return render_template("404.html", title="Cirrus",
                               description="A production house for picture and its makers.",
                               share_image="/share.jpg", account=None, house=None,
                               route_name="entry"), 404

    @app.errorhandler(400)
    @app.errorhandler(401)
    @app.errorhandler(403)
    def _refused(err):
        from flask import request, render_template
        if request.path.startswith("/api/"):
            return jsonify({"error": err.description or "That request was refused"}), err.code
        return render_template("404.html", title="Cirrus",
                               description="A production house for picture and its makers.",
                               share_image="/share.jpg", account=None, house=None,
                               route_name="entry"), 404

    @app.errorhandler(Exception)
    def _boom(err):
        from werkzeug.exceptions import HTTPException
        from flask import request, render_template
        if isinstance(err, HTTPException):
            if request.path.startswith("/api/"):
                return jsonify({"error": err.description or "Error"}), err.code
            if err.code in (400, 401, 403, 404, 405):
                return _refused(err)
            return err
        import traceback
        traceback.print_exc()
        if request.path.startswith("/api/"):
            return jsonify({"error": "The server could not answer that"}), 500
        return render_template("404.html", title="Cirrus",
                               description="A production house for picture and its makers.",
                               share_image="/share.jpg", account=None, house=None,
                               route_name="entry"), 500

    @app.before_request
    def _start():
        g._t0 = time.perf_counter()

    @app.after_request
    def _line(resp):
        try:
            dur = (time.perf_counter() - getattr(g, "_t0", time.perf_counter())) * 1000
            sys.stdout.write("%s %s %s %.1fms\n" % (request.method, request.path, resp.status_code, dur))
            sys.stdout.flush()
        except Exception:
            pass
        return resp

    return app


def prepare():
    """Schema and seed once per process, before serving."""
    db.init_schema()
    seed.seed()


_app = None


def get_app():
    global _app
    if _app is None:
        logging.basicConfig(level=logging.INFO, format="%(message)s")
        _app = create_app()
    return _app
