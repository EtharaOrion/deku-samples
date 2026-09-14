import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cirrus.app import boot, create_app
from cirrus.media import build_grain_tile, render_share_image

app = create_app()

STATIC_BUILD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cirrus", "static", "build")
build_grain_tile(os.path.join(STATIC_BUILD, "grain.png"))
render_share_image(os.path.join(STATIC_BUILD, "share.png"))

boot(app)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "4173"))
    app.run(host="0.0.0.0", port=port, threaded=True)
