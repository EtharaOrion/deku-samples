"""The HTTP surface every check shares.

One place knows the app's address and how a session carries auth, so a check
names a route and a role and never a host, a port or a header.
"""
from __future__ import annotations

import contextlib
import os

import httpx

DEFAULT_APP_URL = "http://localhost:4173"
TIMEOUT_SECONDS = 30.0

LOGIN_ROUTE = "/auth/login"
TOKEN_FIELDS = ("access_token", "token", "accessToken", "jwt", "session_token")


def app_url() -> str:
    """The origin the app is served on, with no trailing slash."""
    return os.environ.get("APP_PUBLIC_URL", DEFAULT_APP_URL).rstrip("/")


def api_base() -> str:
    """The base every API route hangs off."""
    return app_url() + "/api"


def seeded_password(variable: str, default: str) -> str:
    """The password the seed gave a role, overridable by the environment."""
    return os.environ.get(variable) or default


@contextlib.contextmanager
def client(token: str | None = None):
    """A session rooted at the API base, signed in when a token is given.

    Redirects are NOT followed: the checks assert on status codes, and following
    a 302 would report the destination's 200 and hide the redirect itself.
    """
    headers = {"Authorization": "Bearer %s" % token} if token else {}
    with httpx.Client(base_url=api_base(), headers=headers,
                      timeout=TIMEOUT_SECONDS) as session:
        yield session


def login(email: str, password: str) -> str:
    """Exchanges credentials for a bearer token.

    Raises rather than returning an empty token, so a check fails at the sign-in
    that actually broke instead of at the first authorised call after it.
    """
    with httpx.Client(base_url=api_base(), timeout=TIMEOUT_SECONDS) as session:
        response = session.post(LOGIN_ROUTE,
                                json={"email": email, "password": password})

    if response.status_code not in (200, 201):
        raise AssertionError(
            "signing in as %s at POST /api%s returned %s, body %s"
            % (email, LOGIN_ROUTE, response.status_code, response.text[:400]))

    try:
        body = response.json()
    except ValueError:
        raise AssertionError(
            "signing in as %s answered %s with a body that is not JSON: %s"
            % (email, response.status_code, response.text[:400]))

    if isinstance(body, dict):
        for field in TOKEN_FIELDS:
            value = body.get(field)
            if isinstance(value, str) and value:
                return value

    raise AssertionError(
        "signing in as %s answered %s but carried no bearer token; looked for %s "
        "in %s" % (email, response.status_code, ", ".join(TOKEN_FIELDS),
                   response.text[:400]))
