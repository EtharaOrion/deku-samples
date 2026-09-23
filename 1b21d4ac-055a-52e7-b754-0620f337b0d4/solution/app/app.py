"""WSGI entry point.

    python -m gunicorn --bind 0.0.0.0:${APP_PUBLIC_PORT} app:app
"""

from __future__ import annotations

from cirrus import create_app

app = create_app()


if __name__ == "__main__":  # pragma: no cover - development convenience only
    import os

    app.run(host="0.0.0.0", port=int(os.environ.get("APP_PUBLIC_PORT", "4173")))
