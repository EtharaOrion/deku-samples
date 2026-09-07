"""Password hashing and the app's own bearer tokens.

Role and house are never read from a request body: they are loaded from the
accounts row the token resolves to.
"""
import hashlib
import hmac
import os
import secrets
import time

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

from . import db

_ph = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)

TOKEN_TTL_SECONDS = int(os.environ.get("TOKEN_TTL_SECONDS", str(12 * 3600)))
SESSION_COOKIE = "cirrus_session"


def _secret():
    s = os.environ.get("SECRET_KEY")
    if s:
        return s.encode()
    # Stable per-database secret so tokens survive a restart without a mounted key.
    row = db.query_one("SELECT current_database() AS d, "
                       "(SELECT min(created_at)::text FROM houses) AS c")
    basis = f"{db.database_url()}|{row['d'] if row else ''}|{row['c'] if row else ''}"
    return hashlib.sha256(basis.encode()).digest()


_secret_cache = None


def secret():
    global _secret_cache
    if _secret_cache is None:
        _secret_cache = _secret()
    return _secret_cache


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        _ph.verify(password_hash, password)
        return True
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def mint_token(account_id: int) -> str:
    """A signed opaque bearer token: account id, expiry and an HMAC over both."""
    exp = int(time.time()) + TOKEN_TTL_SECONDS
    nonce = secrets.token_hex(8)
    payload = f"{account_id}.{exp}.{nonce}"
    sig = hmac.new(secret(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{payload}.{sig}"


def parse_token(token: str):
    if not token or token.count(".") != 3:
        return None
    account_id, exp, nonce, sig = token.split(".")
    payload = f"{account_id}.{exp}.{nonce}"
    expect = hmac.new(secret(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(sig, expect):
        return None
    try:
        if int(exp) < time.time():
            return None
        return int(account_id)
    except ValueError:
        return None


def account_for_token(token: str):
    account_id = parse_token(token)
    if account_id is None:
        return None
    return db.query_one(
        """SELECT a.id, a.email, a.role, a.house_id, h.slug AS house_slug
           FROM accounts a LEFT JOIN houses h ON h.id = a.house_id
           WHERE a.id = %s""", (account_id,))


def new_media_id() -> str:
    return secrets.token_hex(16)


def new_preview_token() -> str:
    return secrets.token_hex(16)
