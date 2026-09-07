from __future__ import annotations

import os
import time

import pytest
from appclient import client, login, seeded_password
from capabilities import Backend, make_backend

PRODUCER_EMAIL = "producer@example.com"
OTHER_PRODUCER_EMAIL = "producer.meridian@example.com"
VIEWER_EMAIL = "viewer@example.com"
SEEDED_PASSWORD_DEFAULT = "deku-demo-pw-2026"

ROLE_PRODUCER = "producer"
ROLE_VIEWER = "viewer"

HOUSE_CIRRUS = "cirrus"
HOUSE_MERIDIAN = "meridian"

PAGE_ENTRY = "/"
PAGE_WORKS = "/works"
PAGE_WORKS_SLASH = "/works/"
PAGE_WORK_DETAIL = "/works/the-halo"
PAGE_TALENTS = "/talents"
PAGE_TALENTS_SLASH = "/talents/"
PAGE_TALENT_DETAIL = "/talents/rives"
PAGE_ABOUT = "/about"
PAGE_SIGNUP = "/signup"
PAGE_STUDIO_LOGIN = "/studio/login"
PAGE_STUDIO = "/studio"
PAGE_STUDIO_NEW_TALENT = "/studio/talents/new"
PAGE_STUDIO_NEW_WORK = "/studio/works/new"
PAGE_STUDIO_ITEM = "/studio/items/{id}"
PAGE_STUDIO_PUBLISHED = "/studio/items/{id}/published"
PAGE_PREVIEW = "/preview/{token}"

API_HEALTH = "/api/health"
API_LOGIN = "/api/auth/login"
API_SIGNUP = "/api/auth/signup"
API_WORKS = "/api/works"
API_WORK_DETAIL = "/api/works/{slug}"
API_TALENTS = "/api/talents"
API_TALENT_DETAIL = "/api/talents/{slug}"
API_DISCIPLINES = "/api/disciplines"
API_MEDIA = "/api/media/{media_id}"
API_PREVIEW = "/api/preview/{token}"
API_STUDIO_ITEMS = "/api/studio/items"
API_STUDIO_ITEM = "/api/studio/items/{id}"
API_STUDIO_PUBLISH = "/api/studio/items/{id}/publish"
API_STUDIO_MEDIA = "/api/studio/items/{id}/media"
API_STUDIO_CREDITS = "/api/studio/items/{id}/credits"
API_STUDIO_SLUG = "/api/studio/items/{id}/slug"
API_STUDIO_ORDER = "/api/studio/works/order"
API_STUDIO_PREVIEW_TOKENS = "/api/studio/preview-tokens"

WORK_THE_HALO = "the-halo"
WORK_SONDER = "sonder"
WORK_BINARY = "binary"
WORK_COMMON_GROUND = "common-ground"
WORK_NVE = "nve"
WORK_THE_ABSOLUTE_SHELTER = "the-absolute-shelter"
WORK_MAISON_DE_LUMIERE = "maison-de-lumiere"
WORK_LORIS = "loris"
WORK_MDL_SERIE_EXTREME = "mdl-serie-extreme"
WORK_AK = "ak"
WORK_LORIS_SHOOT_STUDIO = "loris-shoot-studio"
WORK_THE_RADIANT = "the-radiant"
WORK_THE_QUIET_ROOM = "the-quiet-room"
WORK_FOUNDRY = "foundry"

TALENT_RIVES = "rives"
TALENT_HALCYON = "halcyon"
TALENT_CAMILLE_FERRAND = "camille-ferrand"
TALENT_NOOR_VASQUEZ = "noor-vasquez"
TALENT_SABLE_ITO = "sable-ito"

TITLE_THE_HALO = "The Halo"
TITLE_SONDER = "Sonder"
TITLE_LORIS = "LORIS"
TITLE_THE_QUIET_ROOM = "The Quiet Room"
TITLE_THE_RADIANT = "The Radiant"
NAME_RIVES = "Rives"
NAME_HALCYON = "Halcyon"
NAME_CAMILLE_FERRAND = "Camille Ferrand"
NAME_NOOR_VASQUEZ = "Noor Vasquez"
NAME_SABLE_ITO = "Sable Ito"

KIND_WORK = "work"
KIND_TALENT = "talent"
DISCIPLINE_DIRECTOR = "director"
DISCIPLINE_PHOTOGRAPHER = "photographer"
DISCIPLINE_STYLIST = "stylist"
VARIANT_LEFT = "left"
VARIANT_RIGHT = "right"
VARIANT_CENTRE = "centre"
MEDIA_POSTER = "poster"
MEDIA_REEL = "reel"
MEDIA_GALLERY = "gallery"

CREDIT_ROLE_DIRECTOR = "Director"
CREDIT_ROLE_PHOTOGRAPHER = "Photographer"

FIELD_PUBLISHED = "published"
FIELD_PUBLISHED_AT = "published_at"
FIELD_DISCIPLINE = "discipline"
FIELD_VARIANT = "variant"
FIELD_ORDINAL = "ordinal"
FIELD_SEED = "seed"
FIELD_WIDTH = "width"
FIELD_HEIGHT = "height"
FIELD_ALT = "alt"
FIELD_MEDIA_ID = "media_id"
FIELD_EXPIRES_AT = "expires_at"
FIELD_TOKEN = "token"
FIELD_OLD_SLUG = "old_slug"

TABLE_HOUSES = "houses"
TABLE_ACCOUNTS = "accounts"
TABLE_ITEMS = "items"
TABLE_MEDIA = "media"
TABLE_CREDITS = "credits"
TABLE_PREVIEW_TOKENS = "preview_tokens"
TABLE_SLUG_REDIRECTS = "slug_redirects"

ENV_DATABASE_URL = "DATABASE_URL"
ENV_APP_PUBLIC_URL = "APP_PUBLIC_URL"
ENV_APP_PUBLIC_PORT = "APP_PUBLIC_PORT"

PREVIEW_TOKEN_MINUTES = 15
TOKEN_HEX_LENGTH = 32
PUBLISHED_WORKS = 12
PUBLISHED_TALENTS = 3
ORDINAL_FIRST = "001"
ORDINAL_LAST = "012"
ORDINAL_AFTER_UNLIST = "011"
SEED_STILL_WIDTHS = (598, 300, 1006)

SETTLE_SECONDS = 0.25
SETTLE_ATTEMPTS = 40


def settle(predicate, attempts: int = SETTLE_ATTEMPTS, delay: float = SETTLE_SECONDS):
    """The one sanctioned wait. Polls `predicate` until it returns a truthy value.

    Returns the truthy value, or the last falsy one when the budget runs out, so a
    caller always asserts on a real observation rather than on a timeout.
    """
    outcome = None
    for _ in range(attempts):
        outcome = predicate()
        if outcome:
            return outcome
        time.sleep(delay)
    return outcome


def probe_suffix() -> str:
    """A per-call unique token so two identical runs never collide."""
    return os.urandom(6).hex()


def rel(route: str) -> str:
    """The path a session built on the API base takes, from a brief route.

    The brief pins routes with their `/api` prefix and the ledger carries them in
    that form. The session the harness hands a check is already rooted at the API
    base, so the prefix is removed here rather than in every call.
    """
    return route[4:] if route.startswith("/api") else route


@pytest.fixture(scope="session")
def anon_client():
    with client() as c:
        yield c


@pytest.fixture(scope="session")
def producer_token() -> str:
    return login(PRODUCER_EMAIL,
                 seeded_password("SEED_PRODUCER_PASSWORD", SEEDED_PASSWORD_DEFAULT))


@pytest.fixture(scope="session")
def other_producer_token() -> str:
    return login(OTHER_PRODUCER_EMAIL,
                 seeded_password("SEED_PRODUCER_PASSWORD", SEEDED_PASSWORD_DEFAULT))


@pytest.fixture(scope="session")
def viewer_token() -> str:
    return login(VIEWER_EMAIL,
                 seeded_password("SEED_VIEWER_PASSWORD", SEEDED_PASSWORD_DEFAULT))


@pytest.fixture(scope="session")
def producer_client(producer_token: str):
    with client(producer_token) as c:
        yield c


@pytest.fixture(scope="session")
def other_producer_client(other_producer_token: str):
    with client(other_producer_token) as c:
        yield c


@pytest.fixture(scope="session")
def viewer_client(viewer_token: str):
    with client(viewer_token) as c:
        yield c


class RosterStore:
    """Domain queries for this task, composed from capability primitives only.

    Nothing here names a framework, an ORM, a migration or a column type. If a
    check needs a shape `count`, `rows` or `one` cannot express, the fix is a small
    method here, never a provider SDK inside a check.
    """

    def __init__(self, backend: Backend) -> None:
        self._backend = backend

    def house_by_slug(self, slug: str) -> dict | None:
        return self._backend.one(TABLE_HOUSES, slug=slug)

    def account_by_email(self, email: str) -> dict | None:
        return self._backend.one(TABLE_ACCOUNTS, email=email)

    def account_count(self, **where) -> int:
        return self._backend.count(TABLE_ACCOUNTS, **where)

    def item_count(self, **where) -> int:
        return self._backend.count(TABLE_ITEMS, **where)

    def item_rows(self, **where) -> list[dict]:
        return self._backend.rows(TABLE_ITEMS, **where)

    def item_by_slug(self, slug: str) -> dict | None:
        return self._backend.one(TABLE_ITEMS, slug=slug)

    def item_by_id(self, item_id) -> dict | None:
        return self._backend.one(TABLE_ITEMS, id=item_id)

    def media_rows(self, **where) -> list[dict]:
        return self._backend.rows(TABLE_MEDIA, **where)

    def media_by_id(self, media_id: str) -> dict | None:
        return self._backend.one(TABLE_MEDIA, id=media_id)

    def credit_rows(self, **where) -> list[dict]:
        return self._backend.rows(TABLE_CREDITS, **where)

    def preview_token_rows(self, **where) -> list[dict]:
        return self._backend.rows(TABLE_PREVIEW_TOKENS, **where)

    def redirect_rows(self, **where) -> list[dict]:
        return self._backend.rows(TABLE_SLUG_REDIRECTS, **where)


@pytest.fixture(scope="session")
def backend() -> Backend:
    return make_backend()


@pytest.fixture(scope="session")
def roster(backend: Backend) -> RosterStore:
    return RosterStore(backend)


@pytest.fixture
def new_talent(producer_client):
    """Creates an unlisted talent the calling check owns, returning its payload."""
    def _make(**overrides):
        suffix = probe_suffix()
        body = {
            "kind": KIND_TALENT,
            "slug": f"probe-talent-{suffix}",
            "title": f"Probe Talent {suffix}",
            "discipline": DISCIPLINE_DIRECTOR,
        }
        body.update(overrides)
        response = producer_client.post(rel(API_STUDIO_ITEMS), json=body)
        assert response.status_code in (200, 201), (
            f"creating an unlisted talent at POST {API_STUDIO_ITEMS} returned "
            f"{response.status_code}, body {response.text[:400]}"
        )
        return response.json()
    return _make


@pytest.fixture
def new_work(producer_client):
    """Creates an unlisted work the calling check owns, returning its payload."""
    def _make(**overrides):
        suffix = probe_suffix()
        body = {
            "kind": KIND_WORK,
            "slug": f"probe-work-{suffix}",
            "title": f"Probe Work {suffix}",
            "variant": VARIANT_LEFT,
        }
        body.update(overrides)
        response = producer_client.post(rel(API_STUDIO_ITEMS), json=body)
        assert response.status_code in (200, 201), (
            f"creating an unlisted work at POST {API_STUDIO_ITEMS} returned "
            f"{response.status_code}, body {response.text[:400]}"
        )
        return response.json()
    return _make
