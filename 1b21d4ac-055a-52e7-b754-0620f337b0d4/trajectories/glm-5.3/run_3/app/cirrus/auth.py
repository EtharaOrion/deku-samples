"""Password hashing (scrypt), bearer tokens (itsdangerous HMAC), current-account lookup."""
import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timezone

from flask import g, request

from . import db

TOKEN_TTL_DAYS = 30


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return "scrypt$%s$%s" % (salt.hex(), base64.b64encode(dk).decode())


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, salt_hex, b64 = stored.split("$")
        if algo != "scrypt":
            return False
        salt = bytes.fromhex(salt_hex)
        want = base64.b64decode(b64)
        dk = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
        return hmac.compare_digest(want, dk)
    except Exception:
        return False


# --- bearer tokens -----------------------------------------------------------
# Stateless HMAC-signed tokens: payload = account_id.expiry.signature.
# No server-side session store is needed and nothing is bought in.

def _sig(payload: bytes) -> bytes:
    key = os.environ.get("CIRRUS_SECRET_KEY") or os.environ.get("SECRET_KEY") or _fallback_key()
    return hmac.new(key.encode(), payload, hashlib.sha256).digest()[:24]


_FALLBACK = None
_FALLBACK_LOCK = None


def _fallback_key():
    """Dev convenience only: a stable per-process key when none is configured."""
    global _FALLBACK
    if _FALLBACK is None:
        _FALLBACK = secrets.token_hex(32)
    return _FALLBACK


def mint_token(account_id: str) -> str:
    exp = int(datetime.now(timezone.utc).timestamp()) + TOKEN_TTL_DAYS * 86400
    payload = ("%s.%d" % (account_id, exp)).encode()
    sig = _sig(payload)
    return "%s.%s" % (payload.decode(), sig.hex())


def parse_token(token: str):
    """Return account_id or None."""
    if not token:
        return None
    parts = token.split(".")
    if len(parts) != 3:
        return None
    account_id, exp_hex, sig_hex = parts
    try:
        exp = int(exp_hex)
    except ValueError:
        return None
    payload = ("%s.%s" % (account_id, exp)).encode()
    if not hmac.compare_digest(_sig(payload).hex(), sig_hex):
        return None
    if datetime.now(timezone.utc).timestamp() > exp:
        return None
    return account_id


def current_account():
    """Resolve the bearer token on the request to an account row (or None).

    The token is accepted from the Authorization header or the cirrus_token
    cookie (the cookie is what the browser studio pages use).
    """
    if getattr(g, "_account_loaded", False):
        return g.account
    g._account_loaded = True
    g.account = None
    g.house = None
    token = None
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
    if not token:
        token = request.cookies.get("cirrus_token")
    account_id = parse_token(token) if token else None
    if account_id:
        row = db.pool.query_one(
            """
            SELECT a.id, a.email, a.role, a.house_id, h.slug AS house_slug, h.name AS house_name
            FROM accounts a LEFT JOIN houses h ON h.id = a.house_id
            WHERE a.id = %s
            """,
            (account_id,),
        )
        if row:
            g.account = row
    return g.account
