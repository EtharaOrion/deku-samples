import hashlib
import os

DATABASE_URL = os.environ.get("DATABASE_URL", "")
PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "")
PORT = int(os.environ.get("PORT") or 4173)
HOUSE_SLUG = os.environ.get("APP_HOUSE_SLUG", "cirrus")
TOKEN_TTL_SECONDS = int(os.environ.get("APP_TOKEN_TTL", 60 * 60 * 8))
PREVIEW_TTL_SECONDS = 15 * 60


def secret_key() -> bytes:
    """Stable across restarts, derived from the environment, never written in source."""
    explicit = os.environ.get("SECRET_KEY")
    if explicit:
        return explicit.encode("utf-8")
    material = (DATABASE_URL + "|" + PUBLIC_URL + "|cirrus-session").encode("utf-8")
    return hashlib.sha256(material).digest()
