"""Configuration, all of it read from the environment."""
import hashlib
import os


def _derived_key() -> str:
    """A stable key for signing bearer tokens when none is provided. Derived
    from the backing service address so every worker agrees without a literal
    secret in the source."""
    base = os.environ.get("DATABASE_URL", "cirrus-local")
    return hashlib.sha256(f"{base}|cirrus-sessions|v1".encode()).hexdigest()


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY") or _derived_key()
    DATABASE_URL = os.environ.get("DATABASE_URL") or "postgresql://deku_app:deku-local-dev@postgres:5432/deku"
    SERVED_HOUSE_SLUG = "cirrus"
    PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "http://localhost:4173")
    PUBLIC_PORT = os.environ.get("APP_PUBLIC_PORT", "4173")
    PREVIEW_TOKEN_TTL = 15 * 60
    TEMPLATES_AUTO_RELOAD = True
    STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
