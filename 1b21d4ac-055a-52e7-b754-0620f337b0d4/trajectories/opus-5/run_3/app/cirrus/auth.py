"""Sessions the app owns: hashed passwords and signed bearer tokens.

Tokens are stateless and HMAC-signed, so no eighth table is needed. The signing
key is taken from the environment when present and otherwise derived from the
backing service address, so every worker of one deployment agrees on it.
"""
import base64
import hashlib
import hmac
import os
import time

from flask import g, request
from werkzeug.security import check_password_hash, generate_password_hash

from . import db

TOKEN_TTL_SECONDS = 12 * 60 * 60


def _key():
    secret = os.environ.get("SECRET_KEY")
    if secret:
        return secret.encode()
    return hashlib.sha256(
        ("cirrus-session-key/" + os.environ.get("DATABASE_URL", "")).encode()
    ).digest()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def mint_token(account_id: int, ttl: int = TOKEN_TTL_SECONDS) -> str:
    payload = f"{account_id}.{int(time.time()) + ttl}".encode()
    body = _b64(payload)
    sig = _b64(hmac.new(_key(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_token(token: str):
    """Return the account row for a valid unexpired token, else None."""
    if not token or token.count(".") != 1:
        return None
    body, sig = token.split(".")
    try:
        expected = _b64(hmac.new(_key(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        account_id_s, expires_s = _unb64(body).decode().split(".")
        if int(expires_s) < time.time():
            return None
        account_id = int(account_id_s)
    except Exception:
        return None
    return db.query_one(
        """SELECT a.id, a.email, a.role, a.house_id, h.slug AS house_slug
             FROM accounts a LEFT JOIN houses h ON h.id = a.house_id
            WHERE a.id = %s""",
        (account_id,),
    )


def hash_password(raw: str) -> str:
    return generate_password_hash(raw)


def verify_password(hashed: str, raw: str) -> bool:
    return check_password_hash(hashed, raw)


def authenticate(email: str, password: str):
    row = db.query_one(
        """SELECT a.id, a.email, a.password_hash, a.role, a.house_id, h.slug AS house_slug
             FROM accounts a LEFT JOIN houses h ON h.id = a.house_id
            WHERE lower(a.email) = lower(%s)""",
        (email,),
    )
    if not row or not verify_password(row["password_hash"], password):
        return None
    row.pop("password_hash", None)
    return row


def bearer_from_request():
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    # The server-rendered studio carries the same token in a cookie so that a
    # plain document request is authenticated too. It is still the same token.
    return request.cookies.get("cirrus_token") or ""


def current_account():
    if "account" not in g:
        g.account = read_token(bearer_from_request())
    return g.account
