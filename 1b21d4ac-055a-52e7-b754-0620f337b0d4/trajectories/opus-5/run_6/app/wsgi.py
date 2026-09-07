"""Gunicorn entry point. The schema and the seed are applied once by the entrypoint."""
from cirrus.app import app

application = app
