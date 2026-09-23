"""Cirrus - the application factory."""

from __future__ import annotations

import sys
import time
from typing import Any

from flask import Flask, Response, g, jsonify, render_template, request
from werkzeug.exceptions import HTTPException

from . import api_public, api_studio, config, db, repo, seed, views
from .api_studio import Refused
from .auth import Denied

__all__ = ["create_app"]


def _wants_json() -> bool:
    return request.path.startswith("/api")


def _client_error(status: int, reason: str, code: str):
    if _wants_json():
        return jsonify({"error": code, "reason": reason}), status
    house = repo.public_house()
    if house is None:
        return Response(reason, status=status, mimetype="text/plain")
    body = render_template(
        "not_found.html",
        **views._chrome(house, "not-found", title="Cirrus", reason=reason),
    )
    response = Response(body, status=status, mimetype="text/html")
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


def bootstrap() -> None:
    """Schema and seed, run once and idempotently, safe across workers."""
    db.wait_for_database()
    with db.connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT pg_advisory_lock(%s)", (db.BOOTSTRAP_LOCK,))
        try:
            db.ensure_schema()
            seed.run()
        finally:
            cur.execute("SELECT pg_advisory_unlock(%s)", (db.BOOTSTRAP_LOCK,))


def create_app() -> Flask:
    app = Flask(__name__, template_folder="../templates", static_folder="../static")
    app.config.update(
        SECRET_KEY=config.secret_key(),
        JSON_SORT_KEYS=False,
        TRAP_HTTP_EXCEPTIONS=False,
        MAX_CONTENT_LENGTH=1024 * 512,
        SEND_FILE_MAX_AGE_DEFAULT=31536000,
    )

    app.register_blueprint(api_public.bp)
    app.register_blueprint(api_studio.bp)
    app.register_blueprint(views.bp)

    @app.before_request
    def _mark_start() -> None:
        g.started_at = time.perf_counter()

    @app.after_request
    def _log_one_line(response: Response) -> Response:
        elapsed = (time.perf_counter() - getattr(g, "started_at", time.perf_counter())) * 1000
        sys.stdout.write(
            f'{request.remote_addr or "-"} "{request.method} {request.full_path.rstrip("?")} '
            f'{request.environ.get("SERVER_PROTOCOL", "HTTP/1.1")}" '
            f"{response.status_code} {response.calculate_content_length() or 0} {elapsed:.1f}ms\n"
        )
        sys.stdout.flush()
        return response

    @app.errorhandler(Denied)
    def _denied(error: Denied):
        return _client_error(error.status, error.reason, "denied")

    @app.errorhandler(Refused)
    def _refused(error: Refused):
        return _client_error(error.status, error.reason, "refused")

    @app.errorhandler(HTTPException)
    def _http(error: HTTPException):
        status = error.code or 500
        if status >= 500:
            return _client_error(status, "The house is not answering.", "unavailable")
        # The path is never echoed back.
        reason = "No record at that address." if status == 404 else (error.description or "")
        return _client_error(status, reason, "not_found" if status == 404 else "refused")

    @app.errorhandler(Exception)
    def _unhandled(error: Exception):  # pragma: no cover - last resort
        app.logger.exception("unhandled", exc_info=error)
        return _client_error(500, "The house is not answering.", "unavailable")

    @app.context_processor
    def _inject() -> dict[str, Any]:
        return {"static_version": config.STATIC_VERSION}

    with app.app_context():
        try:
            bootstrap()
        except Exception:  # pragma: no cover - health stays 503 until it settles
            app.logger.exception("bootstrap failed")

    return app
