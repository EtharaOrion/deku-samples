"""Who is calling. Never read from a request body: only a signed bearer token."""
from __future__ import annotations

from flask import g, request

from . import repo, security

COOKIE_NAME = "cirrus_session"


def _token_from_request() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    cookie = request.cookies.get(COOKIE_NAME)
    return cookie.strip() if cookie else None


def current_account():
    """The account behind this request, or None. Cached per request."""
    if "cirrus_account" in g:
        return g.cirrus_account
    account = None
    token = _token_from_request()
    if token:
        account_id = security.read_token(token)
        if account_id is not None:
            account = repo.account_by_id(account_id)
    g.cirrus_account = account
    return account


def is_producer(account) -> bool:
    return bool(account and account["role"] == "producer" and account["house_id"])


def producer_of(account, house_id: int) -> bool:
    return is_producer(account) and account["house_id"] == house_id


def public_account(account) -> dict:
    return {
        "id": account["id"],
        "email": account["email"],
        "role": account["role"],
        "house_id": account["house_id"],
    }
