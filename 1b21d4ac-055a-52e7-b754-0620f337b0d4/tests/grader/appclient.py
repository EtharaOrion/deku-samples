from __future__ import annotations

import contextlib
import os

import httpx

DEFAULT_APP_URL = "http://localhost:4173"
TIMEOUT_SECONDS = 30.0

LOGIN_ROUTE = "/auth/login"
TOKEN_FIELDS = ("access_token", "token", "accessToken", "jwt", "session_token")


def app_url() -> str:
    return os.environ.get("APP_PUBLIC_URL", DEFAULT_APP_URL).rstrip("/")


def api_base() -> str:
    return app_url() + "/api"


def seeded_password(variable: str, default: str) -> str:
    return os.environ.get(variable) or default


@contextlib.contextmanager
def client(token: str | None = None):
    headers = {"Authorization": "Bearer %s" % token} if token else {}
    with httpx.Client(base_url=api_base(), headers=headers,
                      timeout=TIMEOUT_SECONDS) as session:
        yield session


def login(email: str, password: str) -> str:
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
