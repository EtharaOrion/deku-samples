"""Entry point.

The container's entrypoint applies the schema and the seed once, before any worker
starts, and sets CIRRUS_SKIP_BOOTSTRAP so the workers do not repeat it. Bootstrapping
here is still safe, because every step is idempotent and held under one advisory
lock, and it keeps `python wsgi.py` a complete way to run the app on its own.
"""
import os

from cirrus.app import app, bootstrap

if os.environ.get("CIRRUS_SKIP_BOOTSTRAP") != "1":
    bootstrap()

if __name__ == "__main__":  # pragma: no cover
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "4173")))
