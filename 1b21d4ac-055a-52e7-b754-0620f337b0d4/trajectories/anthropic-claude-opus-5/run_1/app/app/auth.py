"""The app's own sessions: a hashed password and a signed bearer token.

Nothing is bought in from a third party. `role` and the house are read from the
accounts table on every request and never from a request body.
"""
import base64
import hashlib
import hmac
import json
import os
import time

from flask import g, request

from . import config, db

_PBKDF2_ROUNDS = 120_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ROUNDS)
    return "pbkdf2_sha256${}${}${}".format(
        _PBKDF2_ROUNDS, base64.b64encode(salt).decode(), base64.b64encode(dk).decode()
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt_b64, dk_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            base64.b64decode(salt_b64),
            int(rounds),
        )
        return hmac.compare_digest(dk, base64.b64decode(dk_b64))
    except Exception:
        return False


def _b64u(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64u_dec(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def issue_token(account_id: int, ttl: int = None) -> str:
    payload = {
        "sub": int(account_id),
        "exp": int(time.time()) + int(ttl or config.TOKEN_TTL_SECONDS),
        "iat": int(time.time()),
    }
    body = _b64u(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64u(hmac.new(config.secret_key(), body.encode(), hashlib.sha256).digest())
    return body + "." + sig


def read_token(token: str):
    """Return the account row for a valid token, else None."""
    if not token or "." not in token:
        return None
    body, _, sig = token.partition(".")
    expected = _b64u(hmac.new(config.secret_key(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(_b64u_dec(body))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < time.time():
        return None
    return db.query_one(
        "SELECT a.id, a.email, a.role, a.house_id, h.slug AS house_slug "
        "FROM accounts a LEFT JOIN houses h ON h.id = a.house_id WHERE a.id = %s",
        (payload.get("sub"),),
    )


def bearer_from_request():
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    # The server-rendered studio carries the same token in a cookie so a
    # document request can be authorised identically to an API call.
    return request.cookies.get("cirrus_token", "")


def current_account():
    if "account" not in g:
        g.account = read_token(bearer_from_request())
    return g.account
