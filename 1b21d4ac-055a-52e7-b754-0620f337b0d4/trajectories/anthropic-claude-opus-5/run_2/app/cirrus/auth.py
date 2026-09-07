"""Who is calling. Neither the role nor the house is ever read from a body."""
from __future__ import annotations

from functools import wraps

from flask import g, jsonify, request

from .db import query_one
from .security import COOKIE_NAME, read_token


def account_from_request():
    if "account" in g:
        return g.account
    token = None
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
    if not token:
        token = request.cookies.get(COOKIE_NAME)
    account = None
    payload = read_token(token)
    if payload:
        account = query_one(
            "SELECT a.*, h.slug AS house_slug FROM accounts a "
            "LEFT JOIN houses h ON h.id = a.house_id WHERE a.id = %s",
            (payload["sub"],),
        )
    g.account = account
    return account


def current_producer():
    """The signed-in producer, or None. The house comes from the row itself."""
    account = account_from_request()
    if account and account["role"] == "producer" and account["house_id"]:
        return account
    return None


def error(status: int, message: str):
    return jsonify({"error": message}), status


def not_found_json():
    # A foreign record and a missing record are answered identically, so the
    # answer never confirms that the record is real.
    return error(404, "Not found.")


def require_producer(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        producer = current_producer()
        if not producer:
            account = account_from_request()
            if account is None:
                return error(401, "Sign in as a producer to use the studio.")
            return error(403, "This account may not use the studio.")
        g.producer = producer
        return fn(*args, **kwargs)

    return wrapper
