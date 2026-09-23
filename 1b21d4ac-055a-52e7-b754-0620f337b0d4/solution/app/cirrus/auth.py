"""Accounts, password hashing and bearer tokens.

Sessions are the app's own: an address, a hashed password and a signed bearer
token. Nothing third-party. Neither ``role`` nor house is ever read from a
request body - both are taken from the stored account.
"""

from __future__ import annotations

import hashlib
import re
import secrets
from functools import wraps
from typing import Any, Callable

from flask import g, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

from . import config, db

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Denied(Exception):
    """Raised when a caller may not do the thing they asked for."""

    def __init__(self, status: int, reason: str) -> None:
        super().__init__(reason)
        self.status = status
        self.reason = reason


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(config.secret_key(), salt="cirrus-bearer")


def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return check_password_hash(password_hash, password)
    except Exception:  # noqa: BLE001 - a malformed stored hash is a refusal
        return False


def mint_token(account_id: int) -> str:
    return _serializer().dumps({"sub": int(account_id)})


def hex_token(derived_from: str | None = None) -> str:
    """The one lowercase-hex identifier the house mints, for media and previews.

    Called with nothing it is unguessable. Called with a phrase it is stable, so
    seeding the same corpus twice lands on the same addresses.
    """
    raw = derived_from.encode("utf-8") if derived_from else secrets.token_bytes(64)
    return hashlib.sha256(raw).hexdigest()[: config.TOKEN_HEX_LENGTH]


def account_from_token(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    try:
        payload = _serializer().loads(token, max_age=config.SESSION_HOURS * 3600)
    except (BadSignature, SignatureExpired, Exception):  # noqa: B014
        return None
    if not isinstance(payload, dict):
        return None
    account_id = payload.get("sub")
    if not isinstance(account_id, int):
        return None
    return db.one(
        "SELECT id, email, role, house_id FROM accounts WHERE id = %s",
        (account_id,),
    )


def bearer_from_request() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        candidate = header[7:].strip()
        if candidate:
            return candidate
    return request.cookies.get(config.SESSION_COOKIE) or None


def current_account() -> dict[str, Any] | None:
    if "cirrus_account" not in g:
        g.cirrus_account = account_from_token(bearer_from_request())
    return g.cirrus_account


def current_producer() -> dict[str, Any] | None:
    account = current_account()
    if account and account["role"] == "producer" and account["house_id"] is not None:
        return account
    return None


def require_producer() -> dict[str, Any]:
    """Every ``/api/studio/`` endpoint passes through here, reads included."""
    account = current_account()
    if account is None:
        raise Denied(401, "A bearer token is required.")
    if account["role"] != "producer" or account["house_id"] is None:
        raise Denied(403, "This account may not reach the studio.")
    return account


def producer_only(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        g.producer = require_producer()
        return view(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------------------
# Signup and login
# ---------------------------------------------------------------------------


def create_viewer(email: str, password: str) -> dict[str, Any]:
    """Signup is open and always issues a viewer belonging to no house."""
    email = (email or "").strip().lower()
    if not EMAIL_RE.match(email):
        raise Denied(422, "That is not an email address.")
    if not password or len(password) < 8:
        raise Denied(422, "A password of at least eight characters is required.")
    existing = db.one("SELECT id FROM accounts WHERE email = %s", (email,))
    if existing:
        raise Denied(409, "That address already has an account.")
    row = db.one(
        """
        INSERT INTO accounts (email, password_hash, role, house_id)
        VALUES (%s, %s, 'viewer', NULL)
        RETURNING id, email, role, house_id, created_at
        """,
        (email, hash_password(password)),
    )
    if row is None:  # pragma: no cover - INSERT ... RETURNING always returns
        raise Denied(409, "That address already has an account.")
    return row


def authenticate(email: str, password: str) -> dict[str, Any]:
    email = (email or "").strip().lower()
    row = db.one(
        "SELECT id, email, password_hash, role, house_id FROM accounts WHERE email = %s",
        (email,),
    )
    if row is None or not verify_password(row["password_hash"], password or ""):
        raise Denied(401, "That address and password do not match.")
    return {
        "id": row["id"],
        "email": row["email"],
        "role": row["role"],
        "house_id": row["house_id"],
    }
