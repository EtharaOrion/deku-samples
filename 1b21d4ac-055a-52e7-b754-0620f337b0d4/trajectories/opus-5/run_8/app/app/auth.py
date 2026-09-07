"""The app's own sessions: hashed passwords and signed bearer tokens."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from flask import g, request

from .db import connection

TOKEN_TTL = 12 * 60 * 60
COOKIE_NAME = "cirrus_session"

_ITERATIONS = 120_000


def _secret() -> bytes:
    explicit = os.environ.get("APP_SECRET")
    if explicit:
        return explicit.encode()
    # stable across workers and restarts without a literal in the source
    return hashlib.sha256(
        ("cirrus-session/" + os.environ.get("DATABASE_URL", "")).encode()
    ).digest()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return "pbkdf2_sha256$%d$%s$%s" % (
        _ITERATIONS, salt.hex(), dk.hex())


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, dk_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(txt: str) -> bytes:
    return base64.urlsafe_b64decode(txt + "=" * (-len(txt) % 4))


def mint_token(account_id: int) -> str:
    payload = json.dumps(
        {"sub": account_id, "exp": int(time.time()) + TOKEN_TTL,
         "jti": secrets.token_hex(8)},
        separators=(",", ":")).encode()
    body = _b64(payload)
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return body + "." + sig


def read_token(token: str):
    if not token or token.count(".") != 1:
        return None
    body, sig = token.split(".")
    expected = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        data = json.loads(_unb64(body))
    except Exception:
        return None
    if int(data.get("exp", 0)) < time.time():
        return None
    return data


def account_by_id(account_id: int):
    with connection(commit=False) as cur:
        cur.execute(
            """SELECT a.id, a.email, a.role, a.house_id, h.slug AS house_slug
               FROM accounts a LEFT JOIN houses h ON h.id = a.house_id
               WHERE a.id = %s""", (account_id,))
        return cur.fetchone()


def account_by_email(email: str):
    with connection(commit=False) as cur:
        cur.execute(
            """SELECT a.id, a.email, a.role, a.house_id, a.password_hash,
                      h.slug AS house_slug
               FROM accounts a LEFT JOIN houses h ON h.id = a.house_id
               WHERE lower(a.email) = lower(%s)""", (email,))
        return cur.fetchone()


def bearer_account():
    """The account named by the Authorization header, or None."""
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    data = read_token(header[7:].strip())
    if not data:
        return None
    return account_by_id(data["sub"])


def cookie_account():
    """The account named by the session cookie, or None."""
    raw = request.cookies.get(COOKIE_NAME)
    if not raw:
        return None
    data = read_token(raw)
    if not data:
        return None
    return account_by_id(data["sub"])


def current_account():
    """Either carrier: the header is what the studio API uses, the cookie is what
    a document request and an <img> can send."""
    if "account" not in g:
        g.account = bearer_account() or cookie_account()
    return g.account
