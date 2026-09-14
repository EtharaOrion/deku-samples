"""Passwords are hashed with PBKDF2; bearer tokens are signed and stateless."""
import hashlib
import hmac
import secrets

ITERATIONS = 120_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt}${dk.hex()}"


def check_password(stored: str, password: str) -> bool:
    try:
        _algo, iters, salt, digest = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iters))
        return hmac.compare_digest(dk.hex(), digest)
    except Exception:
        return False


def _account_key(password_hash: str) -> bytes:
    return hashlib.sha256(("cirrus:" + password_hash).encode()).digest()


def mint_token(account_id: int, password_hash: str) -> str:
    """A 32 character lowercase hex bearer token, deterministic for an account."""
    sig = hmac.new(_account_key(str(password_hash)),
                   f"acct:{int(account_id)}".encode(), hashlib.sha256).hexdigest()
    return f"{int(account_id) & 0xffffffff:08x}{sig[:24]}"


def _verify(conn, token: str):
    if not token or len(token) != 32 or any(c not in "0123456789abcdef" for c in token):
        return None
    try:
        account_id = int(token[:8], 16)
    except ValueError:
        return None
    row = conn.execute(
        "select id,email,password_hash,role,house_id from accounts where id=%s", (account_id,)).fetchone()
    if not row:
        return None
    d = dict(zip("id email password_hash role house_id".split(), row))
    expected = mint_token(d["id"], d["password_hash"])
    if not hmac.compare_digest(expected, token):
        return None
    d.pop("password_hash")
    return d


def account_by_email(conn, email: str):
    row = conn.execute(
        "select id,email,password_hash,role,house_id from accounts where email=%s", (email,)).fetchone()
    if not row:
        return None
    return dict(zip("id email password_hash role house_id".split(), row))


def account_from_request(req):
    header = req.headers.get("Authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else req.cookies.get("cirrus_token", "")
    if not token:
        return None
    return _verify(req.pg, token)


def create_viewer(conn, email: str, password: str):
    from auth import hash_password, mint_token  # local import keeps the module flat
    existing = conn.execute("select 1 from accounts where email=%s", (email,)).fetchone()
    if existing:
        return None, "That email already has an account."
    row = conn.execute(
        "insert into accounts (email,password_hash,role,house_id) values (%s,%s,'viewer',null)"
        " returning id,password_hash", (email, hash_password(password))).fetchone()
    return mint_token(row[0], str(row[1])), None
