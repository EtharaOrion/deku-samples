"""Sessions the app owns: hashed passwords and opaque bearer tokens held in Postgres."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from . import db

TOKEN_TTL = timedelta(days=7)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_token_table():
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(%s)", (db.BOOTSTRAP_LOCK,))
            cur.execute(
                """CREATE TABLE IF NOT EXISTS auth_tokens (
                       id          BIGSERIAL PRIMARY KEY,
                       token_hash  TEXT NOT NULL UNIQUE,
                       account_id  BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                       expires_at  TIMESTAMPTZ NOT NULL,
                       created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
                   )"""
            )


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_token(account_id: int) -> tuple[str, datetime]:
    token = secrets.token_hex(32)
    expires = _now() + TOKEN_TTL
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO auth_tokens (token_hash, account_id, expires_at) VALUES (%s,%s,%s)",
                (_hash_token(token), account_id, expires),
            )
    return token, expires


def revoke_token(token: str) -> None:
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM auth_tokens WHERE token_hash = %s", (_hash_token(token),))


def account_for_token(token: str | None) -> dict | None:
    if not token:
        return None
    row = db.query_one(
        """SELECT a.id, a.email, a.role, a.house_id, t.expires_at
             FROM auth_tokens t JOIN accounts a ON a.id = t.account_id
            WHERE t.token_hash = %s AND t.expires_at > now()""",
        (_hash_token(token),),
    )
    return row


def authenticate(email: str, password: str) -> dict | None:
    if not email or not password:
        return None
    row = db.query_one("SELECT * FROM accounts WHERE lower(email) = lower(%s)", (email.strip(),))
    if not row:
        # keep the timing similar whether or not the address exists
        check_password_hash(generate_password_hash("x"), password)
        return None
    if not check_password_hash(row["password_hash"], password):
        return None
    return row


def create_viewer(email: str, password: str) -> dict:
    """Signup always issues a viewer with no house; role and house are never read from a body."""
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO accounts (email, password_hash, role, house_id)
                   VALUES (%s,%s,'viewer',NULL) RETURNING id, email, role, house_id, created_at""",
                (email.strip().lower(), generate_password_hash(password)),
            )
            return cur.fetchone()
