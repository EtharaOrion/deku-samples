"""Email/password accounts, hashed, exchanged for the app's own bearer tokens."""
import base64
import hashlib
import hmac
import json
import os
import time

from werkzeug.security import check_password_hash, generate_password_hash

from . import db

TOKEN_TTL = 60 * 60 * 8  # eight hours
COOKIE_NAME = "cirrus_token"


def _secret():
    raw = os.environ.get("SECRET_KEY")
    if raw:
        return raw.encode()
    # Stable across workers and restarts of one deployment, never written in source.
    base = (os.environ.get("DATABASE_URL", "") + "|" + os.environ.get("APP_PUBLIC_URL", ""))
    return hashlib.sha256(("cirrus-session-key|" + base).encode()).digest()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def mint_token(account_id: int) -> str:
    payload = json.dumps({"sub": int(account_id), "exp": int(time.time()) + TOKEN_TTL}).encode()
    body = _b64(payload)
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_token(token: str):
    if not token or token.count(".") != 1:
        return None
    body, sig = token.split(".")
    try:
        expected = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_unb64(body))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < time.time():
        return None
    return payload


def account_for_token(token: str):
    payload = read_token(token)
    if not payload:
        return None
    return db.query(
        """SELECT a.id, a.email, a.role, a.house_id, h.slug AS house_slug
           FROM accounts a LEFT JOIN houses h ON h.id = a.house_id
           WHERE a.id = %s""",
        (payload["sub"],),
        one=True,
    )


def authenticate(email: str, password: str):
    if not email or not password:
        return None
    row = db.query("SELECT * FROM accounts WHERE lower(email) = lower(%s)", (email.strip(),),
                   one=True)
    if not row or not check_password_hash(row["password_hash"], password):
        return None
    return row


def create_viewer(email: str, password: str):
    """Signup is open and always issues a viewer with no house."""
    return db.execute(
        """INSERT INTO accounts (email, password_hash, role, house_id)
           VALUES (%s, %s, 'viewer', NULL)
           RETURNING id, email, role, house_id, created_at""",
        (email.strip().lower(), generate_password_hash(password)),
        returning=True,
    )
