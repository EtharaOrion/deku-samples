"""Entrypoint: prepare (schema + seed), then serve on 0.0.0.0:${PORT:-4173}."""
import os

from cirrus import create_app, prepare

port = int(os.environ.get("APP_PUBLIC_PORT") or os.environ.get("PORT") or 4173)

prepare()
app = create_app()

if __name__ == "__main__":
    from werkzeug.serving import run_simple

    run_simple("0.0.0.0", port, app, threaded=True, use_reloader=False)
