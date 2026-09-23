"""Environment-derived settings.

The house address and the port it answers on are read from the environment and
are never written into source. PostgreSQL is the single backing service.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

#: Password every seeded account carries. Benchmark fixture data, not a secret.
SEED_PASSWORD = "deku-demo-pw-2026"

#: Minutes a minted preview token stays good for.
PREVIEW_TOKEN_MINUTES = 15

#: Length, in characters, of every minted lowercase-hex token.
TOKEN_HEX_LENGTH = 32

#: Hours a bearer token stays good for before a producer is returned to login.
SESSION_HOURS = 12

#: Name of the cookie carrying a browser session for the server-rendered studio.
SESSION_COOKIE = "cirrus_session"

#: Cache-busting suffix on the stylesheet and script. Derived from the newest
#: file in the static tree so an edited stylesheet is never hidden behind the
#: year-long cache lifetime the served assets carry.
STATIC_VERSION = str(
    max(
        (int(path.stat().st_mtime) for path in (Path(__file__).resolve().parent.parent / "static").rglob("*") if path.is_file()),
        default=0,
    )
)


def now_utc() -> datetime:
    """The house's one clock. Every instant stored or compared begins here."""
    return datetime.now(timezone.utc)


def slug_of(value: object) -> str:
    """The one boundary a slug crosses, before it is stored or compared."""
    return str(value or "").strip().lower()


def database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not set; PostgreSQL is required")
    return url


def public_url() -> str:
    return os.environ.get("APP_PUBLIC_URL", "").strip().rstrip("/")


def public_port() -> str:
    return os.environ.get("APP_PUBLIC_PORT", "").strip()


def served_house() -> str:
    """The one house this deployment publishes."""
    return slug_of(os.environ.get("SERVED_HOUSE", "")) or "cirrus"


def secret_key() -> str:
    key = os.environ.get("SECRET_KEY", "").strip()
    if key:
        return key
    # Deterministic within a deployment so every gunicorn worker signs alike.
    return "cirrus::" + database_url()


def seed_password(role: str) -> str:
    var = "SEED_PRODUCER_PASSWORD" if role == "producer" else "SEED_VIEWER_PASSWORD"
    return os.environ.get(var, SEED_PASSWORD)
