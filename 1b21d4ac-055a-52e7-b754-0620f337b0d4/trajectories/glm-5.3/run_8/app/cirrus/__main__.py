"""WSGI entry point and dev runner."""
from __future__ import annotations

import os

from .app import create_app

app = create_app()


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "4173")),
        threaded=True,
        use_reloader=False,
    )
