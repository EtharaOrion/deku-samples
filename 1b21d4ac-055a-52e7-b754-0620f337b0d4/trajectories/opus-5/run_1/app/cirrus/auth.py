"""Passwords, bearer tokens and the house-scoping guard.

Neither role nor house is ever read from a request body: both come from the
account row addressed by the bearer token.
"""
import binascii
import functools
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from flask import g, request

from . import db

TOKEN_TTL = timedelta(hours=12)
_PBKDF_ROUNDS = 120_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF_ROUNDS)
    return "pbkdf2_sha256$%d$%s$%s" % (
        _PBKDF_ROUNDS,
        binascii.hexlify(salt).decode(),
        binascii.hexlify(dk).decode(),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt_hex, dk_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            binascii.unhexlify(salt_hex),
            int(rounds),
        )
        return hmac.compare_digest(binascii.hexlify(dk).decode(), dk_hex)
    except Exception:
        return False


def _secret() -> bytes:
    return (os.environ.get("SECRET_KEY") or "cirrus-session-key").encode("utf-8")


def mint_token(account_id: int) -> str:
    """Stateless signed bearer token: id.expiry.nonce.signature."""
    expires = int((datetime.now(timezone.utc) + TOKEN_TTL).timestamp())
    nonce = secrets.token_hex(8)
    body = "%d.%d.%s" % (account_id, expires, nonce)
    sig = hmac.new(_secret(), body.encode("utf-8"), hashlib.sha256).hexdigest()
    return "%s.%s" % (body, sig)


def account_from_token(token: str):
    if not token:
        return None
    parts = token.split(".")
    if len(parts) != 4:
        return None
    account_id, expires, nonce, sig = parts
    body = "%s.%s.%s" % (account_id, expires, nonce)
    expected = hmac.new(_secret(), body.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    try:
        if int(expires) < int(datetime.now(timezone.utc).timestamp()):
            return None
        account_id = int(account_id)
    except ValueError:
        return None
    return db.query(
        "SELECT id, email, role, house_id FROM accounts WHERE id = %s",
        (account_id,),
        one=True,
    )


def bearer_from_request():
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    # The server-rendered studio pages carry the same token in a cookie so a
    # document request can be authorised too. It is still the app's own token.
    return request.cookies.get("cirrus_token", "")


def current_account():
    if "account" not in g:
        g.account = account_from_token(bearer_from_request())
    return g.account


def producer_required(view):
    """Every /api/studio/ endpoint, reads included, passes through here."""

    @functools.wraps(view)
    def wrapper(*args, **kwargs):
        account = current_account()
        if account is None:
            return {"error": "Authentication required."}, 401
        if account["role"] != "producer" or account["house_id"] is None:
            return {"error": "This account may not use the studio."}, 403
        g.house_id = account["house_id"]
        return view(*args, **kwargs)

    return wrapper
