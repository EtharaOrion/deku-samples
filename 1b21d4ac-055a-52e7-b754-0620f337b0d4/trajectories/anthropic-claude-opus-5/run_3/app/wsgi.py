"""WSGI entrypoint. The schema and the seed are applied by the image itself."""
import os

from cirrus import create_app
from cirrus.db import init_db

# The entrypoint applies the schema and the seed once before the workers come
# up and then sets this flag, so each worker importing this module skips the
# work. Running this file directly still prepares its own database. The seed is
# idempotent and advisory-locked either way.
if os.environ.get("CIRRUS_SKIP_INIT") != "1":
    init_db()

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "4173")))
