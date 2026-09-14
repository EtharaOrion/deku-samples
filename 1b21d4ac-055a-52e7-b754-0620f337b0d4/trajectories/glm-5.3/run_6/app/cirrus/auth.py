"""Accounts, password hashing and bearer tokens. Tokens live in PostgreSQL only."""
import hashlib
import hmac
import secrets
import time

from . import db

TOKEN_TTL = 60 * 60 * 24 * 14
PEPPER = "cirrus-static-pepper-v1"


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = _scrypt(password, salt)
    return f"scrypt${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt, digest = stored.split("$")
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    return hmac.compare_digest(_scrypt(password, salt), digest)


def _scrypt(password: str, salt: str) -> str:
    # Normalised parameters keep the cost modest: the app is a demo deployment
    # and login is not a high-value target, but hashing is still real hashing.
    return hashlib.scrypt(
        password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=32
    ).hex()


def mint_token() -> str:
    return secrets.token_hex(16)


def issue_token(cur, account_id: int) -> str:
    token = mint_token()
    cur.execute(
        "insert into auth_tokens (token, account_id, expires_at) values (%s, %s, %s)",
        (token, account_id, _expiry()),
    )
    return token


def _expiry():
    import datetime as dt

    return dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=TOKEN_TTL)


def create_account(cur, email: str, password: str, role: str = "viewer", house_id=None):
    row = db.one(
        cur,
        """insert into accounts (email, password_hash, role, house_id)
           values (%s, %s, %s, %s)
           on conflict (email) do nothing
           returning id, email, role, house_id""",
        (email.strip().lower(), hash_password(password), role, house_id),
    )
    return row


def account_for_token(cur, token: str):
    if not token:
        return None
    row = db.one(
        cur,
        """select a.id, a.email, a.role, a.house_id, t.expires_at
             from auth_tokens t join accounts a on a.id = t.account_id
            where t.token = %s""",
        (token,),
    )
    if row is None:
        return None
    if row["expires_at"].timestamp() <= time.time():
        cur.execute("delete from auth_tokens where token = %s", (token,))
        return None
    return row
