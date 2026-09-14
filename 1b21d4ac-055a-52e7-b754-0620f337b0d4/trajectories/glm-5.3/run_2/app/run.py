"""Local runner for the container: one process, foreground, 0.0.0.0."""
import os

from app.main import app

if __name__ == "__main__":
    port = int(os.environ.get("APP_INTERNAL_PORT", "4173"))
    app.run(host="0.0.0.0", port=port, threaded=True, use_reloader=False)
