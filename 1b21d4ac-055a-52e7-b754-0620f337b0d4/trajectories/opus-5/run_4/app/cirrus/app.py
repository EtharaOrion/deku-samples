"""Flask app factory: schema, seed, one request line on stdout, and the routes."""
import os
import sys
import time

from flask import Flask, Response, g, request
from markupsafe import Markup, escape

from . import db, seed as seed_mod
from .api import api
from .media import grain_png, share_image
from .pages import pages


def split_label(text):
    """Addressable per character, with the whole word as the accessible name.

    The characters are hidden from assistive technology and from selection; the
    accessible name of a split label is the word, never its letters.
    """
    chars = []
    for i, ch in enumerate(str(text)):
        glyph = "&nbsp;" if ch == " " else escape(ch)
        chars.append(
            f'<span class="split__char" aria-hidden="true" style="--i:{i}">{glyph}</span>')
    return Markup(
        f'<span class="split" role="text">'
        f'<span class="visually-hidden">{escape(text)}</span>'
        f'<span aria-hidden="true" class="split__chars">{"".join(chars)}</span></span>')


def create_app():
    app = Flask(__name__, template_folder="templates", static_folder="static",
                static_url_path="/static")
    app.config["JSON_SORT_KEYS"] = False
    app.url_map.strict_slashes = False  # /works and /works/ resolve alike

    app.register_blueprint(api)
    app.register_blueprint(pages)

    app.jinja_env.globals["split"] = split_label
    app.jinja_env.globals["ordinal"] = lambda n: f"{n:03d}"

    @app.before_request
    def _start_timer():
        g._t0 = time.perf_counter()

    @app.after_request
    def _log(response):
        ms = (time.perf_counter() - getattr(g, "_t0", time.perf_counter())) * 1000
        # One request line on stdout.
        print(f'{request.remote_addr or "-"} "{request.method} {request.full_path.rstrip("?")}" '
              f'{response.status_code} {ms:.1f}ms', flush=True)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response

    @app.get("/share.png")
    def share():
        resp = Response(share_image(), mimetype="image/png")
        resp.headers["Cache-Control"] = "public, max-age=86400"
        return resp

    @app.get("/grain.png")
    def grain():
        resp = Response(grain_png(), mimetype="image/png")
        resp.headers["Cache-Control"] = "public, max-age=86400, immutable"
        return resp

    @app.get("/favicon.ico")
    def favicon():
        # Inline vector geometry, drawn from the two tokens. No binary ships.
        svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
               '<rect width="32" height="32" fill="#060403"/>'
               '<ellipse cx="16" cy="16" rx="12" ry="5" fill="none" '
               'stroke="#e9eae4" stroke-width="1.5"/></svg>')
        resp = Response(svg, mimetype="image/svg+xml")
        resp.headers["Cache-Control"] = "public, max-age=86400"
        return resp

    @app.get("/robots.txt")
    def robots():
        body = ("User-agent: *\n"
                "Disallow: /preview/\n"
                "Disallow: /studio\n"
                "Disallow: /api/\n")
        return Response(body, mimetype="text/plain")

    return app


def bootstrap():
    """Schema and seed applied by the image itself, run once and idempotently."""
    last = None
    for attempt in range(30):
        try:
            db.init_schema()
            seed_mod.run_seed()
            print("cirrus: schema and seed ready", flush=True)
            # Do not hand the master's sockets to the forked workers.
            db.dispose()
            return
        except Exception as exc:
            last = exc
            print(f"cirrus: waiting for database ({exc.__class__.__name__})", flush=True)
            time.sleep(2)
    raise SystemExit(f"cirrus: database unavailable: {last}")
