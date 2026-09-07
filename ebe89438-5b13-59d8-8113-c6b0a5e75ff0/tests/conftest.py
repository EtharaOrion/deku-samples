from __future__ import annotations

import os
import time

import pytest
from appclient import client, login, seeded_password
from capabilities import Backend, Inbox, make_backend, make_inbox

SETTLE_SECONDS = 2.0


def settle(seconds: float = SETTLE_SECONDS) -> None:
    time.sleep(seconds)


HOST_EMAIL = "host@example.com"
HOST2_EMAIL = "host2@example.com"
GUEST_EMAIL = "guest@example.com"
GUEST2_EMAIL = "guest2@example.com"
GUEST3_EMAIL = "guest3@example.com"
SEEDED_PASSWORD = "deku-demo-pw-2026"

HOST_CALENDAR_SLUG = "riverside-run-club"
HOST2_CALENDAR_SLUG = "northside-reading-nights"
SEEDED_RACE_EVENT = "thursday-night-5k"
SEEDED_BROWSER_EVENT = "riverside-track-session"
SEEDED_APPROVAL_EVENT = "sunrise-long-run"
SEEDED_DRAFT_EVENT = "harbour-loop-recovery-jog"
SEEDED_EMPTY_EVENT = "winter-reading-night"
SEEDED_CANCELLED_EVENT = "autumn-book-swap"
SEEDED_CLOSED_EVENT = "riverside-winter-time-trial"
SEEDED_CANCEL_REASON = "The venue lost its lease."

HOST_HANDLE = "priya-raman"
BERLIN_ZONE = "Europe/Berlin"
LISBON_ZONE = "Europe/Lisbon"
CSV_HEADER = "email,display_name,status,waitlist_position,ticket_code"
CLOSED_STATE = "registration_closed"

TICKET_PREFIX = "TKT-"
CONFIRMED_SUBJECT_PREFIX = "You're going to "
WAITLIST_SUBJECT_PREFIX = "You're on the waiting list for "
PROMOTED_SUBJECT_PREFIX = "A spot opened up for "
APPROVED_SUBJECT_PREFIX = "You're in: "
CANCELLED_SUBJECT_SUFFIX = " has been cancelled"

RESERVED_PATHS = ("api", "app", "login", "signup", "home", "calendars", "create",
                  "discover", "settings", "event", "t")
CATEGORY_NAMES = ("family", "books", "games", "tech", "food-and-drink", "ai",
                  "running", "arts-and-culture", "climate", "fitness", "wellness",
                  "crypto")


@pytest.fixture(scope="session")
def anon_client():
    with client() as c:
        yield c


@pytest.fixture(scope="session")
def host_token() -> str:
    return login(HOST_EMAIL, seeded_password("SEED_HOST_PASSWORD", SEEDED_PASSWORD))


@pytest.fixture(scope="session")
def host_client(host_token: str):
    with client(host_token) as c:
        yield c


@pytest.fixture(scope="session")
def host2_token() -> str:
    return login(HOST2_EMAIL, seeded_password("SEED_HOST2_PASSWORD", SEEDED_PASSWORD))


@pytest.fixture(scope="session")
def host2_client(host2_token: str):
    with client(host2_token) as c:
        yield c


@pytest.fixture(scope="session")
def guest_token() -> str:
    return login(GUEST_EMAIL, seeded_password("SEED_GUEST_PASSWORD", SEEDED_PASSWORD))


@pytest.fixture(scope="session")
def guest_client(guest_token: str):
    with client(guest_token) as c:
        yield c


class CalendarStore:
    def __init__(self, backend: Backend) -> None:
        self._b = backend

    def account_by_email(self, email: str) -> dict | None:
        return self._b.one("accounts", email=email)

    def calendar_by_slug(self, slug: str) -> dict | None:
        return self._b.one("calendars", slug=slug)

    def calendars_owned_by(self, account_id) -> list[dict]:
        return self._b.rows("calendars", owner_account_id=account_id)

    def event_by_slug(self, slug: str) -> dict | None:
        return self._b.one("events", slug=slug)

    def events_in_state(self, state: str) -> list[dict]:
        return self._b.rows("events", state=state)

    def registrations_for(self, event_id) -> list[dict]:
        return self._b.rows("registrations", event_id=event_id)

    def registration_for(self, event_id, account_id) -> dict | None:
        return self._b.one("registrations", event_id=event_id, account_id=account_id)

    def count_registrations(self, event_id, **where) -> int:
        return self._b.count("registrations", event_id=event_id, **where)

    def count_by_ticket(self, ticket_code: str) -> int:
        return self._b.count("registrations", ticket_code=ticket_code)

    def confirmed_count(self, event_id) -> int:
        held = 0
        for row in self.registrations_for(event_id):
            if str(row.get("status")) in ("confirmed", "checked_in"):
                held += 1
        return held

    def waitlist_positions(self, event_id) -> list[int]:
        out = []
        for row in self.registrations_for(event_id):
            if str(row.get("status")) == "waitlisted":
                out.append(int(row.get("waitlist_position")))
        return sorted(out)

    def count_email_log(self, recipient: str | None = None) -> int:
        if recipient is None:
            return self._b.count("email_log")
        return self._b.count("email_log", recipient=recipient)


@pytest.fixture(scope="session")
def db() -> CalendarStore:
    return CalendarStore(make_backend())


@pytest.fixture(scope="session")
def inbox() -> Inbox:
    return make_inbox()


@pytest.fixture
def unique_email() -> str:
    return f"probe-{os.urandom(6).hex()}@example.com"


def probe_email() -> str:
    return f"probe-{os.urandom(6).hex()}@example.com"


def probe_slug(stem: str) -> str:
    return f"{stem}-{os.urandom(4).hex()}"


def signup(email: str, password: str = "probe-pw-1", name: str = "Probe Guest") -> str:
    with client() as c:
        response = c.post(
            "/auth/signup",
            json={"email": email, "password": password, "name": name},
        )
        assert response.status_code in (200, 201), (
            f"POST /api/auth/signup for {email} returned {response.status_code}: "
            f"{response.text[:400]}"
        )
    return login(email, password)


def new_event_payload(title: str, slug: str, capacity: int = 1,
                      approval_required: bool = False,
                      waitlist_enabled: bool = True,
                      calendar_slug: str = HOST_CALENDAR_SLUG) -> dict:
    return {
        "calendar_slug": calendar_slug,
        "title": title,
        "slug": slug,
        "category": "running",
        "city": "Berlin",
        "description": "Created by a probe for one observation.",
        "time_zone": BERLIN_ZONE,
        "starts_at": "2027-09-15T18:00:00Z",
        "ends_at": "2027-09-15T20:00:00Z",
        "capacity": capacity,
        "approval_required": approval_required,
        "waitlist_enabled": waitlist_enabled,
    }


def create_event(host, title: str, slug: str, **kwargs) -> dict:
    response = host.post("/events", json=new_event_payload(title, slug, **kwargs))
    assert response.status_code in (200, 201), (
        f"POST /api/events for {slug!r} returned {response.status_code}: "
        f"{response.text[:400]}"
    )
    body = response.json()
    assert isinstance(body, dict), (
        f"POST /api/events for {slug!r} returned {type(body).__name__}, not an object: "
        f"{response.text[:200]}"
    )
    return body


def register(token: str, event_slug: str):
    with client(token) as c:
        return c.post("/registrations", json={"event_slug": event_slug})


def set_event(host, slug: str, **fields):
    return host.patch(f"/events/{slug}", json=dict(fields))


def new_calendar_payload(slug: str, name: str = "Probe Calendar") -> dict:
    return {"name": name, "slug": slug, "category": "running",
            "city": "Berlin", "is_public": True}


def poll_message(inbox: Inbox, to: str, subject_contains: str, tries: int = 10):
    for _ in range(tries):
        found = inbox.find(to, subject_contains)
        if found is not None:
            return found
        settle(1.0)
    return None
