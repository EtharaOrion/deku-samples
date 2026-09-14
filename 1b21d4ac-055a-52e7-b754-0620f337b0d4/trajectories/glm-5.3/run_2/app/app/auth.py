"""Passwords and bearer tokens. Tokens are random, signed with the app secret,
so they verify without a database round trip on the hot path and cannot be forged."""
import base64
import hashlib
import hmac
import secrets

from .config import Config


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return "pbkdf2$120000$%s$%s" % (salt.hex(), dk.hex())


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt_hex, dk_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


def mint_token(raw: str) -> str:
    sig = hmac.new(Config.SECRET_KEY.encode(), raw.encode(), hashlib.sha256).digest()[:10]
    return raw + "." + base64.urlsafe_b64encode(sig).decode().rstrip("=")


def sign_token(raw: str) -> str:
    return mint_token(raw)


def verify_token(token: str):
    """Returns the raw id inside the token, or None."""
    if not token or "." not in token:
        return None
    raw, sig = token.rsplit(".", 1)
    expect = base64.urlsafe_b64encode(
        hmac.new(Config.SECRET_KEY.encode(), raw.encode(), hashlib.sha256).digest()[:10]
    ).decode().rstrip("=")
    if not hmac.compare_digest(sig, expect):
        return None
    return raw
