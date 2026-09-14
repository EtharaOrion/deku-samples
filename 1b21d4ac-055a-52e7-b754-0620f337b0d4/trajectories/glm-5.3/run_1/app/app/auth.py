"""Password hashing, bearer tokens and authorization helpers."""
import hashlib
import hmac
import secrets

from flask import g, request

from .queries import house_by_id

TOKEN_TTL_SECONDS = 604800


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return f"pbkdf2_sha256$120000${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt_hex, dk_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(rounds)
        )
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


def mint_token() -> str:
    return secrets.token_hex(16)


def issue_token(conn, account_id) -> str:
    token = mint_token()
    with conn.cursor() as cur:
        cur.execute("DELETE FROM bearer_tokens WHERE account_id = %s", (account_id,))
        cur.execute(
            "INSERT INTO bearer_tokens (token, account_id, expires_at) "
            "VALUES (%s, %s, now() + make_interval(secs => %s))",
            (token, account_id, TOKEN_TTL_SECONDS),
        )
    return token


def bearer_from_request():
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def _load(conn):
    if not getattr(g, "_auth_loaded", False):
        g._auth_loaded = True
        g._account = None
        g._house = None
        token = bearer_from_request()
        if token:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT a.* FROM bearer_tokens t
                       JOIN accounts a ON a.id = t.account_id
                       WHERE t.token = %s AND t.expires_at > now()""",
                    (token,),
                )
                r = cur.fetchone()
                if r is not None:
                    g._account = dict(r)
    return g._account


def current_account(conn):
    return _load(conn)


def current_house(conn):
    acc = _load(conn)
    if acc is None or acc["house_id"] is None:
        return None
    if not getattr(g, "_house_loaded", False):
        g._house_loaded = True
        g._house = house_by_id(conn, acc["house_id"])
    return g._house


def is_producer(conn):
    acc = _load(conn)
    return acc is not None and acc["role"] == "producer" and acc["house_id"] is not None
