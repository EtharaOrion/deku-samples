"""Gunicorn entrypoint."""
from app.main import app  # noqa: E402

__all__ = ["app"]
