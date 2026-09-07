"""Gunicorn entrypoint. Schema and seed are applied before the workers serve."""
from cirrus.app import bootstrap, create_app

bootstrap()
app = create_app()
