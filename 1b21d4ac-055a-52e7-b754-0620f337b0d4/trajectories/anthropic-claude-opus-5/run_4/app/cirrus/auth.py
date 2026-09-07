"""Request-level identity. The server decides who may see a record; the page's
drawn controls decide nothing."""
import functools

from flask import g, jsonify, request

from . import db, security
from .security import SESSION_COOKIE


def current_account():
    """Resolve the caller once per request from the bearer header, falling back to
    the session cookie the server-rendered studio pages carry."""
    if "account" in g:
        return g.account
    token = None
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
    if not token:
        token = request.cookies.get(SESSION_COOKIE)
    g.account = security.account_for_token(token) if token else None
    return g.account


def error(status, message):
    return jsonify({"error": message}), status


def not_found():
    """One answer for a record that does not exist and for a record of another
    house, so the answer never confirms that the record is real."""
    return error(404, "Not found.")


def require_producer(fn):
    """Bearer auth on every /api/studio/ endpoint, reads included."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        account = current_account()
        if not account:
            return error(401, "Sign in to use the studio.")
        if account["role"] != "producer" or not account["house_id"]:
            return error(403, "A producer account is required.")
        g.house_id = account["house_id"]
        return fn(*args, **kwargs)
    return wrapper


def account_public(account):
    return {
        "id": account["id"],
        "email": account["email"],
        "role": account["role"],
        "house": account.get("house_slug"),
    }
