"""Gunicorn entry point.

The schema and the seed are applied at container start, once and idempotently.
The entrypoint runs them before the server binds; if this module is imported
some other way, it applies them itself rather than serving an empty database.
"""
import os

from cirrus.app import app, bootstrap

if os.environ.get("CIRRUS_BOOTSTRAPPED") != "1":
    bootstrap()

__all__ = ["app"]
