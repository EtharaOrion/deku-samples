#!/usr/bin/env python3
"""Cirrus — a production house public site with a private studio."""
import os

from app.factory import create_app

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "4173"))
    app.run(host="0.0.0.0", port=port)
