"""Password hashing and bearer tokens. The app's own sessions, nothing bought in."""
import base64
import hashlib
import hmac
import os
import secrets
import time

_ITERATIONS = 120_000
TOKEN_TTL_SECONDS = int(os.environ.get("AUTH_TOKEN_TTL", str(12 * 3600)))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        _ITERATIONS, base64.b64encode(salt).decode(), base64.b64encode(dk).decode()
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_b64, dk_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), base64.b64decode(salt_b64), int(iters)
        )
        return hmac.compare_digest(dk, base64.b64decode(dk_b64))
    except Exception:
        return False


def _secret() -> bytes:
    return os.environ.get("APP_SECRET_KEY", "cirrus-local-signing-key").encode()


def mint_token(account_id: int, ttl: int = TOKEN_TTL_SECONDS) -> tuple[str, int]:
    """Stateless signed bearer token: id.expiry.nonce.signature."""
    expires_at = int(time.time()) + ttl
    nonce = secrets.token_hex(8)
    body = f"{account_id}.{expires_at}.{nonce}"
    sig = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{body}.{sig}", expires_at


def read_token(token: str) -> int | None:
    """Return the account id if the token is intact and unexpired, else None."""
    if not token or token.count(".") != 3:
        return None
    account_id, expires_at, nonce, sig = token.split(".")
    body = f"{account_id}.{expires_at}.{nonce}"
    expected = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(expected, sig):
        return None
    try:
        if int(expires_at) < time.time():
            return None
        return int(account_id)
    except ValueError:
        return None


def hex_token(length: int = 32) -> str:
    return secrets.token_hex(length // 2)
