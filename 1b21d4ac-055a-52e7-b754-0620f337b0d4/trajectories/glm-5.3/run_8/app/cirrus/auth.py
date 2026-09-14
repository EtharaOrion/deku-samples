"""Email + password authentication: scrypt hashes, opaque bearer tokens.

Tokens live in PostgreSQL (a bearer token is a row), never in a second store,
and never carry the role or the house: those are read from the account.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os


from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

_hasher = PasswordHasher()

# The pepper for the bearer-token lookup hash. Set CIRRUS_TOKEN_SECRET to
# rotate it per deployment; the default keeps a leaked database row from being
# replayable, because tokens are stored only as an HMAC digest of themselves.
# It is a constant in code (never a per-worker file) so every worker computes
# the same digest.
_FALLBACK_PEPPER = "cirrus-token-pepper-3f9a1c7e52b84d06af1d"


def _secret() -> str:
    return os.environ.get("CIRRUS_TOKEN_SECRET") or _FALLBACK_PEPPER



def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(stored: str, password: str) -> bool:
    try:
        return _hasher.verify(stored, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError, ValueError):
        return False


def needs_rehash(stored: str) -> bool:
    try:
        return _hasher.check_needs_rehash(stored)
    except Exception:
        return False


# ------------------------------------------------------------------- tokens

def new_token() -> str:
    """Opaque bearer token: 32 lowercase hex characters."""
    return secrets.token_hex(16)


def token_lookup_hash(token: str) -> str:
    """The accounts table stores a hash of the bearer token, never the token."""
    digest = hmac.new(_secret().encode(), token.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")
