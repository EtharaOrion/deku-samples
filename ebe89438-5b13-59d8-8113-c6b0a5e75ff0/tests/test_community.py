from __future__ import annotations

import concurrent.futures
import re

from appclient import client
from conftest import (
    BERLIN_ZONE,
    CANCELLED_SUBJECT_SUFFIX,
    CLOSED_STATE,
    CONFIRMED_SUBJECT_PREFIX,
    CSV_HEADER,
    GUEST2_EMAIL,
    GUEST3_EMAIL,
    GUEST_EMAIL,
    HOST2_CALENDAR_SLUG,
    HOST_CALENDAR_SLUG,
    HOST_EMAIL,
    HOST_HANDLE,
    LISBON_ZONE,
    PROMOTED_SUBJECT_PREFIX,
    SEEDED_APPROVAL_EVENT,
    SEEDED_BROWSER_EVENT,
    SEEDED_CANCELLED_EVENT,
    SEEDED_CANCEL_REASON,
    SEEDED_CLOSED_EVENT,
    SEEDED_DRAFT_EVENT,
    SEEDED_EMPTY_EVENT,
    SEEDED_RACE_EVENT,
    TICKET_PREFIX,
    WAITLIST_SUBJECT_PREFIX,
    create_event,
    new_calendar_payload,
    poll_message,
    probe_email,
    probe_slug,
    register,
    set_event,
    settle,
    signup,
)
from _shapes import items

TICKET_RE = re.compile(r"^TKT-[A-Z0-9]{8}$")


def test_registration_confirms_and_issues_ticket(host_client, db):
    slug = probe_slug("probe-open-seat")
    create_event(host_client, "Probe Open Seat", slug, capacity=2)
    token = signup(probe_email())
    response = register(token, slug)
    assert response.status_code in (200, 201), (
        f"POST /api/registrations for {slug!r} returned {response.status_code}: "
        f"{response.text[:400]}"
    )
    body = response.json()
    assert body.get("status") == "confirmed", (
        f"POST /api/registrations for {slug!r} returned status "
        f"{body.get('status')!r}, expected 'confirmed': {response.text[:300]}"
    )
    assert TICKET_RE.match(str(body.get("ticket_code") or "")), (
        f"POST /api/registrations for {slug!r} returned ticket_code "
        f"{body.get('ticket_code')!r}, which is not {TICKET_PREFIX} plus 8 uppercase "
        f"letters or digits: {response.text[:300]}"
    )


def test_last_seat_race_confirms_exactly_one_row(host_client, db):
    slug = probe_slug("probe-last-seat")
    create_event(host_client, "Probe Last Seat", slug, capacity=1)
    tokens = [signup(probe_email()), signup(probe_email())]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda t: register(t, slug), tokens))
    statuses = []
    for response in results:
        assert response.status_code in (200, 201, 409, 422), (
            f"POST /api/registrations racing for {slug!r} returned "
            f"{response.status_code}: {response.text[:300]}"
        )
        if response.status_code in (200, 201):
            statuses.append(str(response.json().get("status")))
        else:
            statuses.append("refused")
    event = db.event_by_slug(slug)
    assert event is not None, f"event {slug!r} is missing from the database after create"
    held = db.confirmed_count(event["id"])
    assert held == 1, (
        f"event {slug!r} has capacity 1 but the database holds {held} registrations in "
        f"confirmed or checked_in after two simultaneous requests; the observed API "
        f"statuses were {statuses}"
    )
    assert sorted(statuses) == ["confirmed", "waitlisted"], (
        f"two simultaneous registrations on {slug!r} produced {statuses}, expected one "
        f"confirmed and one waitlisted"
    )


def test_repeat_registration_stores_one_row(host_client, db):
    slug = probe_slug("probe-repeat")
    create_event(host_client, "Probe Repeat", slug, capacity=5)
    email = probe_email()
    token = signup(email)
    first = register(token, slug)
    assert first.status_code in (200, 201), (
        f"first POST /api/registrations for {slug!r} returned {first.status_code}: "
        f"{first.text[:300]}"
    )
    second = register(token, slug)
    assert second.status_code in (200, 201, 409, 422), (
        f"repeat POST /api/registrations for {slug!r} returned {second.status_code}: "
        f"{second.text[:300]}"
    )
    event = db.event_by_slug(slug)
    account = db.account_by_email(email)
    assert account is not None, f"account {email!r} is missing from the database"
    rows = db.count_registrations(event["id"], account_id=account["id"])
    assert rows == 1, (
        f"account {email!r} holds {rows} registration rows on {slug!r} after two "
        f"submissions; the brief allows exactly one in any status"
    )


def test_approval_queue_confirms_pending_registration(host_client, db):
    slug = probe_slug("probe-approval")
    create_event(host_client, "Probe Approval", slug, capacity=3,
                 approval_required=True)
    email = probe_email()
    token = signup(email)
    response = register(token, slug)
    assert response.status_code in (200, 201), (
        f"POST /api/registrations for the approval event {slug!r} returned "
        f"{response.status_code}: {response.text[:300]}"
    )
    registration_id = response.json().get("id")
    assert str(response.json().get("status")) == "pending_approval", (
        f"POST /api/registrations for {slug!r} returned status "
        f"{response.json().get('status')!r}, expected 'pending_approval': "
        f"{response.text[:300]}"
    )
    event = db.event_by_slug(slug)
    assert db.confirmed_count(event["id"]) == 0, (
        f"a pending_approval registration on {slug!r} is holding a seat; the brief "
        f"says it holds none"
    )
    approved = host_client.post(f"/registrations/{registration_id}/approve")
    assert approved.status_code in (200, 201), (
        f"POST /api/registrations/{registration_id}/approve returned "
        f"{approved.status_code}: {approved.text[:300]}"
    )
    assert str(approved.json().get("status")) == "confirmed", (
        f"approving registration {registration_id} on {slug!r} left status "
        f"{approved.json().get('status')!r}, expected 'confirmed'"
    )


def test_declined_registration_holds_no_seat(host_client, db):
    slug = probe_slug("probe-decline")
    create_event(host_client, "Probe Decline", slug, capacity=3,
                 approval_required=True)
    token = signup(probe_email())
    created = register(token, slug)
    registration_id = created.json().get("id")
    declined = host_client.post(f"/registrations/{registration_id}/decline")
    assert declined.status_code in (200, 201), (
        f"POST /api/registrations/{registration_id}/decline returned "
        f"{declined.status_code}: {declined.text[:300]}"
    )
    assert str(declined.json().get("status")) == "declined", (
        f"declining registration {registration_id} on {slug!r} left status "
        f"{declined.json().get('status')!r}, expected 'declined'"
    )
    event = db.event_by_slug(slug)
    assert db.confirmed_count(event["id"]) == 0, (
        f"a declined registration on {slug!r} is still holding a seat"
    )


def test_cancel_promotes_head_of_waiting_list(host_client, db):
    slug = probe_slug("probe-promote")
    create_event(host_client, "Probe Promote", slug, capacity=1)
    first_email, second_email = probe_email(), probe_email()
    first_token, second_token = signup(first_email), signup(second_email)
    first = register(first_token, slug)
    assert str(first.json().get("status")) == "confirmed", (
        f"the first registration on {slug!r} returned status "
        f"{first.json().get('status')!r}, expected 'confirmed'"
    )
    second = register(second_token, slug)
    assert str(second.json().get("status")) == "waitlisted", (
        f"the second registration on {slug!r} returned status "
        f"{second.json().get('status')!r}, expected 'waitlisted'"
    )
    registration_id = first.json().get("id")
    with client(first_token) as c:
        cancelled = c.post(f"/registrations/{registration_id}/cancel")
    assert cancelled.status_code in (200, 201), (
        f"POST /api/registrations/{registration_id}/cancel returned "
        f"{cancelled.status_code}: {cancelled.text[:300]}"
    )
    event = db.event_by_slug(slug)
    account = db.account_by_email(second_email)
    promoted = db.registration_for(event["id"], account["id"])
    assert promoted is not None, (
        f"the waitlisted registration for {second_email!r} on {slug!r} is missing"
    )
    assert str(promoted.get("status")) == "confirmed", (
        f"after the seat was freed on {slug!r} the head of the waiting list holds "
        f"status {promoted.get('status')!r}, expected 'confirmed'"
    )


def test_check_in_records_one_arrival(host_client, db):
    slug = probe_slug("probe-door")
    create_event(host_client, "Probe Door", slug, capacity=2)
    token = signup(probe_email())
    created = register(token, slug)
    ticket = str(created.json().get("ticket_code"))
    first = host_client.post(f"/tickets/{ticket}/check-in")
    assert first.status_code in (200, 201), (
        f"POST /api/tickets/{ticket}/check-in returned {first.status_code}: "
        f"{first.text[:300]}"
    )
    assert str(first.json().get("status")) == "checked_in", (
        f"checking {ticket} in left status {first.json().get('status')!r}, expected "
        f"'checked_in'"
    )
    second = host_client.post(f"/tickets/{ticket}/check-in")
    assert second.status_code in (200, 201, 409, 422), (
        f"a second POST /api/tickets/{ticket}/check-in returned "
        f"{second.status_code}: {second.text[:300]}"
    )
    event = db.event_by_slug(slug)
    arrivals = db.count_registrations(event["id"], status="checked_in")
    assert arrivals == 1, (
        f"ticket {ticket} was checked in twice and {slug!r} now records {arrivals} "
        f"arrivals; the brief allows one"
    )


def test_event_cancel_requires_reason_and_is_one_way(host_client, db):
    slug = probe_slug("probe-callitoff")
    create_event(host_client, "Probe Call It Off", slug, capacity=4)
    empty = host_client.post(f"/events/{slug}/cancel", json={"reason": ""})
    assert empty.status_code in (400, 409, 422), (
        f"cancelling {slug!r} with an empty reason returned {empty.status_code}, "
        f"expected a client error: {empty.text[:300]}"
    )
    reason = "The route is closed for resurfacing."
    cancelled = host_client.post(f"/events/{slug}/cancel", json={"reason": reason})
    assert cancelled.status_code in (200, 201), (
        f"POST /api/events/{slug}/cancel returned {cancelled.status_code}: "
        f"{cancelled.text[:300]}"
    )
    assert cancelled.json().get("cancel_reason") == reason, (
        f"cancelling {slug!r} stored cancel_reason "
        f"{cancelled.json().get('cancel_reason')!r}, expected {reason!r}"
    )
    republish = host_client.patch(f"/events/{slug}", json={"state": "published"})
    assert republish.status_code in (400, 403, 409, 422), (
        f"republishing the cancelled event {slug!r} returned "
        f"{republish.status_code}, expected a client error: {republish.text[:300]}"
    )
    event = db.event_by_slug(slug)
    assert str(event.get("state")) == "cancelled", (
        f"event {slug!r} holds state {event.get('state')!r} after a refused "
        f"republish, expected 'cancelled'"
    )


def test_reserved_slug_is_refused(host_client):
    response = host_client.post(
        "/events",
        json={
            "calendar_slug": HOST_CALENDAR_SLUG,
            "title": "Probe Reserved Slug",
            "slug": "discover",
            "category": "running",
            "city": "Berlin",
            "description": "A probe naming a reserved root path.",
            "starts_at": "2027-10-01T18:00:00Z",
            "ends_at": "2027-10-01T20:00:00Z",
            "capacity": 5,
            "approval_required": False,
            "waitlist_enabled": False,
        },
    )
    assert response.status_code in (400, 409, 422), (
        f"POST /api/events with the reserved slug 'discover' returned "
        f"{response.status_code}, expected a client error: {response.text[:300]}"
    )


def test_capacity_below_confirmed_count_is_refused(host_client):
    slug = probe_slug("probe-shrink")
    create_event(host_client, "Probe Shrink", slug, capacity=3)
    token = signup(probe_email())
    register(token, slug)
    response = host_client.patch(f"/events/{slug}", json={"capacity": 0})
    assert response.status_code in (400, 409, 422), (
        f"PATCH /api/events/{slug} lowering capacity below the confirmed count "
        f"returned {response.status_code}, expected a client error: "
        f"{response.text[:300]}"
    )


def test_seeded_accounts_and_calendars_are_stored(db):
    for email in (GUEST_EMAIL, GUEST2_EMAIL, GUEST3_EMAIL):
        account = db.account_by_email(email)
        assert account is not None, (
            f"seeded account {email!r} is missing from the accounts table"
        )
        assert str(account.get("role")) == "guest", (
            f"seeded account {email!r} holds role {account.get('role')!r}, "
            f"expected 'guest'"
        )
    for slug in (HOST_CALENDAR_SLUG, HOST2_CALENDAR_SLUG):
        calendar = db.calendar_by_slug(slug)
        assert calendar is not None, (
            f"seeded calendar {slug!r} is missing from the calendars table"
        )


def test_seeded_events_are_stored_at_their_boundaries(db):
    race = db.event_by_slug(SEEDED_RACE_EVENT)
    assert race is not None, f"seeded event {SEEDED_RACE_EVENT!r} is missing"
    assert int(race.get("capacity")) == 3, (
        f"seeded event {SEEDED_RACE_EVENT!r} holds capacity {race.get('capacity')!r}, "
        f"expected 3"
    )
    assert db.confirmed_count(race["id"]) == 2, (
        f"seeded event {SEEDED_RACE_EVENT!r} holds "
        f"{db.confirmed_count(race['id'])} confirmed registrations, expected 2 so "
        f"exactly one seat is free"
    )
    browser_event = db.event_by_slug(SEEDED_BROWSER_EVENT)
    assert browser_event is not None, (
        f"seeded event {SEEDED_BROWSER_EVENT!r} is missing"
    )
    assert int(browser_event.get("capacity")) == 2, (
        f"seeded event {SEEDED_BROWSER_EVENT!r} holds capacity "
        f"{browser_event.get('capacity')!r}, expected 2"
    )
    empty = db.event_by_slug(SEEDED_EMPTY_EVENT)
    assert empty is not None, f"seeded event {SEEDED_EMPTY_EVENT!r} is missing"
    assert db.registrations_for(empty["id"]) == [], (
        f"seeded event {SEEDED_EMPTY_EVENT!r} carries registrations; the brief seeds "
        f"none so an empty guest list can be seen"
    )


def test_seeded_cancelled_event_stores_its_reason(db):
    event = db.event_by_slug(SEEDED_CANCELLED_EVENT)
    assert event is not None, f"seeded event {SEEDED_CANCELLED_EVENT!r} is missing"
    assert str(event.get("state")) == "cancelled", (
        f"seeded event {SEEDED_CANCELLED_EVENT!r} holds state "
        f"{event.get('state')!r}, expected 'cancelled'"
    )
    assert event.get("cancel_reason") == SEEDED_CANCEL_REASON, (
        f"seeded event {SEEDED_CANCELLED_EVENT!r} holds cancel_reason "
        f"{event.get('cancel_reason')!r}, expected {SEEDED_CANCEL_REASON!r}"
    )
    assert str(event.get("theme_hex") or "").startswith("#"), (
        f"seeded event {SEEDED_CANCELLED_EVENT!r} holds theme_hex "
        f"{event.get('theme_hex')!r}, which is not a hex colour"
    )


def test_waitlist_positions_stay_contiguous(host_client, db):
    slug = probe_slug("probe-queue")
    create_event(host_client, "Probe Queue", slug, capacity=1)
    tokens = [signup(probe_email()) for _ in range(3)]
    for token in tokens:
        register(token, slug)
    event = db.event_by_slug(slug)
    positions = db.waitlist_positions(event["id"])
    assert positions == list(range(1, len(positions) + 1)), (
        f"waiting-list positions on {slug!r} are {positions}; the brief requires the "
        f"integers 1 upward with no gaps and no ties"
    )


def test_ticket_code_row_is_unique(host_client, db):
    slug = probe_slug("probe-ticket")
    create_event(host_client, "Probe Ticket", slug, capacity=3)
    tokens = [signup(probe_email()) for _ in range(2)]
    codes = []
    for token in tokens:
        response = register(token, slug)
        codes.append(str(response.json().get("ticket_code")))
    assert len(set(codes)) == len(codes), (
        f"two registrations on {slug!r} were issued the same ticket code: {codes}"
    )
    for code in codes:
        held = db.count_by_ticket(code)
        assert held == 1, (
            f"ticket code {code!r} is stored on {held} registration rows, expected 1"
        )


def test_confirmed_count_reconciles_with_stored_rows(host_client, db, anon_client):
    slug = probe_slug("probe-reconcile")
    create_event(host_client, "Probe Reconcile", slug, capacity=4)
    for _ in range(2):
        register(signup(probe_email()), slug)
    response = anon_client.get(f"/events/{slug}")
    assert response.status_code == 200, (
        f"GET /api/events/{slug} returned {response.status_code}: "
        f"{response.text[:300]}"
    )
    body = response.json()
    event = db.event_by_slug(slug)
    stored = db.confirmed_count(event["id"])
    assert int(body.get("confirmed_count")) == stored, (
        f"GET /api/events/{slug} reports confirmed_count "
        f"{body.get('confirmed_count')!r} but the database holds {stored} rows in "
        f"confirmed or checked_in"
    )
    assert int(body.get("remaining")) == int(body.get("capacity")) - stored, (
        f"GET /api/events/{slug} reports remaining {body.get('remaining')!r} against "
        f"capacity {body.get('capacity')!r} and {stored} held seats"
    )


def test_guest_is_denied_the_guest_list(guest_client, db):
    response = guest_client.get(f"/events/{SEEDED_APPROVAL_EVENT}/registrations")
    assert response.status_code in (401, 403, 404), (
        f"GET /api/events/{SEEDED_APPROVAL_EVENT}/registrations with a guest token "
        f"returned {response.status_code}, expected a denial: {response.text[:300]}"
    )


def test_guest_is_denied_the_approval_endpoint(host_client, guest_client, db):
    slug = probe_slug("probe-denied-approve")
    create_event(host_client, "Probe Denied Approve", slug, capacity=3,
                 approval_required=True)
    created = register(signup(probe_email()), slug)
    registration_id = created.json().get("id")
    response = guest_client.post(f"/registrations/{registration_id}/approve")
    assert response.status_code in (401, 403, 404), (
        f"POST /api/registrations/{registration_id}/approve with a guest token "
        f"returned {response.status_code}, expected a denial: {response.text[:300]}"
    )
    event = db.event_by_slug(slug)
    assert db.confirmed_count(event["id"]) == 0, (
        f"the refused approval on {slug!r} still moved a registration into a seat"
    )


def test_other_host_cannot_cancel_a_foreign_event(host_client, host2_client, db):
    slug = probe_slug("probe-foreign")
    create_event(host_client, "Probe Foreign", slug, capacity=3)
    response = host2_client.post(f"/events/{slug}/cancel",
                                 json={"reason": "Not mine to call off."})
    assert response.status_code in (401, 403, 404), (
        f"POST /api/events/{slug}/cancel from the other host returned "
        f"{response.status_code}, expected a denial: {response.text[:300]}"
    )
    event = db.event_by_slug(slug)
    assert str(event.get("state")) == "published", (
        f"event {slug!r} holds state {event.get('state')!r} after a refused "
        f"cancellation by another host, expected 'published'"
    )


def test_anonymous_registration_is_denied(anon_client, db):
    response = anon_client.post("/registrations",
                                json={"event_slug": SEEDED_EMPTY_EVENT})
    assert response.status_code in (401, 403), (
        f"POST /api/registrations with no bearer token returned "
        f"{response.status_code}, expected a denial: {response.text[:300]}"
    )
    event = db.event_by_slug(SEEDED_EMPTY_EVENT)
    assert db.registrations_for(event["id"]) == [], (
        f"the anonymous registration attempt wrote a row on {SEEDED_EMPTY_EVENT!r}"
    )


def test_draft_event_is_hidden_from_a_guest(guest_client, anon_client):
    for name, http in (("guest", guest_client), ("anonymous", anon_client)):
        response = http.get(f"/events/{SEEDED_DRAFT_EVENT}")
        assert response.status_code == 404, (
            f"GET /api/events/{SEEDED_DRAFT_EVENT} as {name} returned "
            f"{response.status_code}, expected the same 404 a slug that never "
            f"existed returns: {response.text[:300]}"
        )
    missing = anon_client.get("/events/no-such-event-anywhere")
    assert missing.status_code == 404, (
        f"GET /api/events/no-such-event-anywhere returned {missing.status_code}, "
        f"expected 404"
    )


def test_full_event_without_a_waiting_list_is_refused(host_client, db):
    slug = probe_slug("probe-nolist")
    create_event(host_client, "Probe No List", slug, capacity=1,
                 waitlist_enabled=False)
    register(signup(probe_email()), slug)
    response = register(signup(probe_email()), slug)
    assert response.status_code in (400, 409, 422), (
        f"POST /api/registrations for the full event {slug!r} returned "
        f"{response.status_code}, expected a client error naming the reason: "
        f"{response.text[:300]}"
    )
    event = db.event_by_slug(slug)
    assert db.confirmed_count(event["id"]) == 1, (
        f"event {slug!r} holds {db.confirmed_count(event['id'])} seats after a "
        f"refused registration, expected 1"
    )


def test_empty_guest_list_returns_an_empty_array(host2_client):
    response = host2_client.get(f"/events/{SEEDED_EMPTY_EVENT}/registrations")
    assert response.status_code == 200, (
        f"GET /api/events/{SEEDED_EMPTY_EVENT}/registrations as the owning host "
        f"returned {response.status_code}: {response.text[:300]}"
    )
    body = response.json()
    assert isinstance(body, list), (
        f"GET /api/events/{SEEDED_EMPTY_EVENT}/registrations returned "
        f"{type(body).__name__}, expected a top-level JSON array"
    )
    assert body == [], (
        f"GET /api/events/{SEEDED_EMPTY_EVENT}/registrations returned {len(body)} "
        f"rows, expected none"
    )


def test_event_with_a_bad_end_time_is_refused(host_client):
    response = host_client.post(
        "/events",
        json={
            "calendar_slug": HOST_CALENDAR_SLUG,
            "title": "Probe Backwards",
            "slug": probe_slug("probe-backwards"),
            "category": "running",
            "city": "Berlin",
            "description": "A probe whose end precedes its start.",
            "starts_at": "2027-11-01T20:00:00Z",
            "ends_at": "2027-11-01T18:00:00Z",
            "capacity": 5,
            "approval_required": False,
            "waitlist_enabled": False,
        },
    )
    assert response.status_code in (400, 409, 422), (
        f"POST /api/events with an end before its start returned "
        f"{response.status_code}, expected a client error: {response.text[:300]}"
    )


def test_discovery_filters_by_category_and_city(anon_client):
    response = anon_client.get("/events", params={"category": "books",
                                                  "city": "Lisbon"})
    assert response.status_code == 200, (
        f"GET /api/events with category books and city Lisbon returned "
        f"{response.status_code}: {response.text[:300]}"
    )
    rows = items(response.json())
    assert rows, (
        "GET /api/events filtered to category books and city Lisbon returned no "
        "rows; the seeded Northside Reading Nights calendar publishes one"
    )
    for row in rows:
        assert str(row.get("category")) == "books", (
            f"a filtered row carries category {row.get('category')!r}, expected 'books'"
        )
        assert str(row.get("city")) == "Lisbon", (
            f"a filtered row carries city {row.get('city')!r}, expected 'Lisbon'"
        )


def test_page_size_limit_is_enforced(anon_client):
    response = anon_client.get("/events", params={"limit": 1})
    assert response.status_code == 200, (
        f"GET /api/events with limit 1 returned {response.status_code}: "
        f"{response.text[:300]}"
    )
    rows = items(response.json())
    assert len(rows) <= 1, (
        f"GET /api/events with limit 1 returned {len(rows)} rows"
    )
    oversized = anon_client.get("/events", params={"limit": 5000})
    assert oversized.status_code in (200, 400, 422), (
        f"GET /api/events with limit 5000 returned {oversized.status_code}: "
        f"{oversized.text[:300]}"
    )
    if oversized.status_code == 200:
        assert len(items(oversized.json())) <= 100, (
            "GET /api/events with limit 5000 returned more than the maximum page "
            "size of 100 rows"
        )


def test_confirmation_email_reaches_the_registrant(host_client, inbox):
    slug = probe_slug("probe-mail-confirm")
    title = "Probe Mail Confirm"
    create_event(host_client, title, slug, capacity=2)
    email = probe_email()
    register(signup(email), slug)
    message = poll_message(inbox, email, CONFIRMED_SUBJECT_PREFIX)
    assert message is not None, (
        f"no message with a subject beginning {CONFIRMED_SUBJECT_PREFIX!r} reached "
        f"{email!r} after a confirmed registration on {slug!r}"
    )
    assert message.subject.startswith(CONFIRMED_SUBJECT_PREFIX + title), (
        f"the confirmation to {email!r} carries subject {message.subject!r}, "
        f"expected {CONFIRMED_SUBJECT_PREFIX + title!r}"
    )
    assert inbox.count(email) == 1, (
        f"{inbox.count(email)} messages reached {email!r} for one registration, "
        f"expected exactly one"
    )


def test_waiting_list_mail_names_the_waiting_list(host_client, inbox):
    slug = probe_slug("probe-mail-wait")
    title = "Probe Mail Wait"
    create_event(host_client, title, slug, capacity=1)
    register(signup(probe_email()), slug)
    waiting = probe_email()
    register(signup(waiting), slug)
    message = poll_message(inbox, waiting, WAITLIST_SUBJECT_PREFIX)
    assert message is not None, (
        f"no message with a subject beginning {WAITLIST_SUBJECT_PREFIX!r} reached "
        f"{waiting!r} after a waitlisted registration on {slug!r}"
    )
    assert message.subject.startswith(WAITLIST_SUBJECT_PREFIX + title), (
        f"the waiting-list mail to {waiting!r} carries subject {message.subject!r}, "
        f"expected {WAITLIST_SUBJECT_PREFIX + title!r}"
    )


def test_promotion_mail_follows_a_freed_seat(host_client, inbox, db):
    slug = probe_slug("probe-mail-promote")
    title = "Probe Mail Promote"
    create_event(host_client, title, slug, capacity=1)
    holder_email = probe_email()
    holder = signup(holder_email)
    held = register(holder, slug)
    waiting = probe_email()
    register(signup(waiting), slug)
    with client(holder) as c:
        c.post(f"/registrations/{held.json().get('id')}/cancel")
    message = poll_message(inbox, waiting, PROMOTED_SUBJECT_PREFIX)
    assert message is not None, (
        f"no message with a subject beginning {PROMOTED_SUBJECT_PREFIX!r} reached "
        f"{waiting!r} after the seat on {slug!r} was freed"
    )
    assert message.subject.startswith(PROMOTED_SUBJECT_PREFIX + title), (
        f"the promotion mail to {waiting!r} carries subject {message.subject!r}, "
        f"expected {PROMOTED_SUBJECT_PREFIX + title!r}"
    )


def test_event_cancellation_mail_carries_the_host_reason(host_client, inbox):
    slug = probe_slug("probe-mail-callitoff")
    title = "Probe Mail Call It Off"
    create_event(host_client, title, slug, capacity=3)
    guest = probe_email()
    register(signup(guest), slug)
    reason = "The hall flooded and cannot be dried in time."
    response = host_client.post(f"/events/{slug}/cancel", json={"reason": reason})
    assert response.status_code in (200, 201), (
        f"POST /api/events/{slug}/cancel returned {response.status_code}: "
        f"{response.text[:300]}"
    )
    message = poll_message(inbox, guest, CANCELLED_SUBJECT_SUFFIX)
    assert message is not None, (
        f"no cancellation message reached {guest!r} after {slug!r} was called off"
    )
    assert message.subject == title + CANCELLED_SUBJECT_SUFFIX, (
        f"the cancellation mail to {guest!r} carries subject {message.subject!r}, "
        f"expected {title + CANCELLED_SUBJECT_SUFFIX!r}"
    )
    assert reason in message.body, (
        f"the cancellation mail to {guest!r} does not carry the host reason "
        f"{reason!r} word for word; the body was {message.body[:300]!r}"
    )


def test_guest_cancellation_sends_no_confirmation_mail(host_client, inbox):
    slug = probe_slug("probe-mail-silent")
    create_event(host_client, "Probe Mail Silent", slug, capacity=3)
    guest = probe_email()
    token = signup(guest)
    created = register(token, slug)
    before = inbox.count(guest)
    with client(token) as c:
        cancelled = c.post(f"/registrations/{created.json().get('id')}/cancel")
    assert cancelled.status_code in (200, 201), (
        f"POST /api/registrations/{created.json().get('id')}/cancel returned "
        f"{cancelled.status_code}: {cancelled.text[:300]}"
    )
    settle()
    after = inbox.count(guest)
    assert after == before, (
        f"cancelling their own registration sent {after - before} further message(s) "
        f"to {guest!r}; the brief sends none"
    )


def test_health_endpoint_answers_on_the_app_origin(anon_client):
    response = anon_client.get("/health")
    assert response.status_code == 200, (
        f"GET /api/health returned {response.status_code}, so the app is not "
        f"reachable and ready on the origin the environment publishes: "
        f"{response.text[:300]}"
    )


def test_seeded_password_signs_every_account_in(anon_client, db):
    for email in ("host@example.com", "host2@example.com", "guest@example.com",
                  "guest2@example.com", "guest3@example.com"):
        response = anon_client.post("/auth/login",
                                    json={"email": email, "password": "deku-demo-pw-2026"})
        assert response.status_code == 200, (
            f"POST /api/auth/login for {email!r} with the documented password "
            f"returned {response.status_code}: {response.text[:300]}"
        )
        assert response.json().get("access_token"), (
            f"POST /api/auth/login for {email!r} returned no access_token: "
            f"{response.text[:300]}"
        )
    fresh = probe_email()
    created = anon_client.post("/auth/signup",
                               json={"email": fresh, "password": "probe-pw-1",
                                     "name": "Probe Signup"})
    assert created.status_code in (200, 201), (
        f"POST /api/auth/signup for {fresh!r} returned {created.status_code}: "
        f"{created.text[:300]}"
    )
    assert str(created.json().get("role")) == "guest", (
        f"POST /api/auth/signup for {fresh!r} returned role "
        f"{created.json().get('role')!r}, expected 'guest'"
    )


def test_registration_row_stores_status_and_position(host_client, db):
    slug = probe_slug("probe-rowshape")
    create_event(host_client, "Probe Row Shape", slug, capacity=1)
    holder = signup(probe_email())
    register(holder, slug)
    waiting_email = probe_email()
    register(signup(waiting_email), slug)
    event = db.event_by_slug(slug)
    account = db.account_by_email(waiting_email)
    row = db.registration_for(event["id"], account["id"])
    assert row is not None, (
        f"the waitlisted registration for {waiting_email!r} on {slug!r} is missing "
        f"from the registrations table"
    )
    assert str(row.get("status")) == "waitlisted", (
        f"the stored registration for {waiting_email!r} carries status "
        f"{row.get('status')!r}, expected 'waitlisted'"
    )
    assert int(row.get("waitlist_position")) == 1, (
        f"the stored registration for {waiting_email!r} carries waitlist_position "
        f"{row.get('waitlist_position')!r}, expected 1"
    )
    confirmed = [r for r in db.registrations_for(event["id"])
                 if str(r.get("status")) == "confirmed"]
    assert len(confirmed) == 1, (
        f"event {slug!r} holds {len(confirmed)} confirmed rows, expected 1"
    )
    assert confirmed[0].get("waitlist_position") is None, (
        f"the confirmed registration on {slug!r} carries waitlist_position "
        f"{confirmed[0].get('waitlist_position')!r}, expected null"
    )


def test_email_log_row_follows_a_real_send(host_client, db, inbox):
    slug = probe_slug("probe-audit")
    title = "Probe Audit"
    create_event(host_client, title, slug, capacity=2)
    guest = probe_email()
    before = db.count_email_log(guest)
    register(signup(guest), slug)
    message = poll_message(inbox, guest, CONFIRMED_SUBJECT_PREFIX)
    assert message is not None, (
        f"no confirmation reached {guest!r} after registering on {slug!r}"
    )
    after = db.count_email_log(guest)
    assert after == before + 1, (
        f"the email_log table holds {after} rows for {guest!r} after one delivered "
        f"message, expected {before + 1}"
    )


def test_rate_limit_refuses_a_login_burst(anon_client):
    email = probe_email()
    signup(email)
    codes = []
    for _ in range(14):
        response = anon_client.post("/auth/login",
                                    json={"email": email, "password": "wrong-pw"})
        codes.append(response.status_code)
    assert 429 in codes or any(c in (400, 422) for c in codes), (
        f"fourteen failed logins for {email!r} in one minute returned {codes}; the "
        f"brief refuses a burst over ten per minute as a client error"
    )


def test_root_slug_resolution_names_its_source(anon_client):
    for slug, kind in ((SEEDED_RACE_EVENT, "event"),
                       (HOST_CALENDAR_SLUG, "calendar"),
                       ("running", "category"),
                       ("discover", "system")):
        response = anon_client.get(f"/resolve/{slug}")
        assert response.status_code == 200, (
            f"GET /api/resolve/{slug} returned {response.status_code}: "
            f"{response.text[:300]}"
        )
        assert str(response.json().get("kind")) == kind, (
            f"GET /api/resolve/{slug} reports kind {response.json().get('kind')!r}, "
            f"expected {kind!r}"
        )


def test_search_term_narrows_the_event_list(anon_client):
    response = anon_client.get("/events", params={"q": "track"})
    assert response.status_code == 200, (
        f"GET /api/events with a search term returned {response.status_code}: "
        f"{response.text[:300]}"
    )
    slugs = [str(row.get("slug")) for row in items(response.json())]
    assert SEEDED_BROWSER_EVENT in slugs, (
        f"GET /api/events with the term 'track' returned {slugs}; the seeded event "
        f"{SEEDED_BROWSER_EVENT!r} carries that word in its title"
    )
    narrowed = anon_client.get("/events", params={"q": "track",
                                                  "category": "books"})
    assert narrowed.status_code == 200, (
        f"GET /api/events with a term and a category returned "
        f"{narrowed.status_code}: {narrowed.text[:300]}"
    )
    assert items(narrowed.json()) == [], (
        "GET /api/events with the term 'track' and category 'books' returned rows; "
        "the term narrows the category rather than widening it"
    )
    by_city = anon_client.get("/events", params={"q": "Berlin"})
    assert by_city.status_code == 200, (
        f"GET /api/events with a city name as the term returned "
        f"{by_city.status_code}: {by_city.text[:300]}"
    )
    assert SEEDED_EMPTY_EVENT not in [str(row.get("slug"))
                                      for row in items(by_city.json())], (
        f"GET /api/events with the term 'Berlin' returned {SEEDED_EMPTY_EVENT!r}, "
        f"which is held in another city; the city is the job of the city filter"
    )


def test_event_list_reports_a_total_count_header(anon_client):
    response = anon_client.get("/events", params={"limit": 1})
    assert response.status_code == 200, (
        f"GET /api/events with a page size of 1 returned {response.status_code}: "
        f"{response.text[:300]}"
    )
    total = response.headers.get("X-Total-Count")
    assert total is not None, (
        "GET /api/events returned no X-Total-Count header; the brief requires it on "
        "every response from that endpoint"
    )
    assert str(total).isdigit(), (
        f"X-Total-Count reads {total!r}, which is not a whole number"
    )
    rows = items(response.json())
    assert len(rows) <= 1, (
        f"GET /api/events with a page size of 1 returned {len(rows)} rows"
    )
    assert int(total) >= len(rows), (
        f"X-Total-Count reads {total} while the page holds {len(rows)} rows; the "
        f"header counts the matches before paging"
    )
    empty = anon_client.get("/events", params={"category": "crypto",
                                               "city": "Reykjavik"})
    assert empty.headers.get("X-Total-Count") == "0", (
        f"GET /api/events for a filter matching nothing reports X-Total-Count "
        f"{empty.headers.get('X-Total-Count')!r}, expected '0'"
    )
    assert items(empty.json()) == [], (
        "GET /api/events for a filter matching nothing returned rows"
    )


def test_event_payload_carries_its_time_zone(anon_client, db):
    response = anon_client.get("/events")
    assert response.status_code == 200, (
        f"GET /api/events returned {response.status_code}: {response.text[:300]}"
    )
    for row in items(response.json()):
        assert str(row.get("time_zone") or "").strip(), (
            f"the row for {row.get('slug')!r} carries time_zone "
            f"{row.get('time_zone')!r}; every event names the zone it is held in"
        )
    race = db.event_by_slug(SEEDED_RACE_EVENT)
    assert race is not None, f"seeded event {SEEDED_RACE_EVENT!r} is missing"
    assert str(race.get("time_zone")) == BERLIN_ZONE, (
        f"seeded event {SEEDED_RACE_EVENT!r} stores time_zone "
        f"{race.get('time_zone')!r}, expected {BERLIN_ZONE!r}"
    )
    empty = db.event_by_slug(SEEDED_EMPTY_EVENT)
    assert empty is not None, f"seeded event {SEEDED_EMPTY_EVENT!r} is missing"
    assert str(empty.get("time_zone")) == LISBON_ZONE, (
        f"seeded event {SEEDED_EMPTY_EVENT!r} stores time_zone "
        f"{empty.get('time_zone')!r}, expected {LISBON_ZONE!r}"
    )


def test_seeded_closed_event_is_stored_closed(db):
    closed = db.event_by_slug(SEEDED_CLOSED_EVENT)
    assert closed is not None, (
        f"seeded event {SEEDED_CLOSED_EVENT!r} is missing; the seed carries it so "
        f"the closed panel state is reachable on the first run"
    )
    assert str(closed.get("state")) == CLOSED_STATE, (
        f"seeded event {SEEDED_CLOSED_EVENT!r} is stored in state "
        f"{closed.get('state')!r}, expected {CLOSED_STATE!r}"
    )
    assert int(closed.get("capacity")) == 8, (
        f"seeded event {SEEDED_CLOSED_EVENT!r} holds capacity "
        f"{closed.get('capacity')!r}, expected 8"
    )
    assert db.registrations_for(closed["id"]) == [], (
        f"seeded event {SEEDED_CLOSED_EVENT!r} carries registrations; the seed "
        f"gives it none"
    )


def test_guest_list_export_carries_the_pinned_header(host_client, db):
    slug = probe_slug("probe-export")
    create_event(host_client, "Probe Export", slug, capacity=4)
    email = probe_email()
    register(signup(email), slug)
    response = host_client.get(f"/events/{slug}/registrations.csv")
    assert response.status_code == 200, (
        f"GET /api/events/{slug}/registrations.csv returned {response.status_code}: "
        f"{response.text[:300]}"
    )
    lines = [line for line in response.text.replace("\r\n", "\n").split("\n") if line]
    assert lines, (
        f"the exported guest list for {slug!r} is empty; it opens with a header line"
    )
    assert lines[0].strip() == CSV_HEADER, (
        f"the exported guest list for {slug!r} opens with {lines[0]!r}, expected "
        f"{CSV_HEADER!r}"
    )
    assert len(lines) >= 2, (
        f"the exported guest list for {slug!r} holds {len(lines)} lines; one "
        f"registration exists so a data line follows the header"
    )
    assert email in response.text, (
        f"the exported guest list for {slug!r} does not name {email!r}, which holds "
        f"a registration on it"
    )


def test_guest_is_denied_the_guest_list_export(guest_client):
    response = guest_client.get(f"/events/{SEEDED_APPROVAL_EVENT}/registrations.csv")
    assert response.status_code in (401, 403, 404), (
        f"a guest session reading the exported guest list for "
        f"{SEEDED_APPROVAL_EVENT!r} was answered {response.status_code}; the export "
        f"belongs to the owning host alone"
    )


def test_capacity_raise_promotes_the_waiting_list(host_client, db):
    slug = probe_slug("probe-raise")
    create_event(host_client, "Probe Raise", slug, capacity=1)
    holder, first_waiter, second_waiter = probe_email(), probe_email(), probe_email()
    register(signup(holder), slug)
    register(signup(first_waiter), slug)
    register(signup(second_waiter), slug)
    event = db.event_by_slug(slug)
    assert db.confirmed_count(event["id"]) == 1, (
        f"event {slug!r} holds {db.confirmed_count(event['id'])} confirmed "
        f"registrations before the raise, expected 1"
    )
    response = set_event(host_client, slug, capacity=2)
    assert response.status_code in (200, 201), (
        f"PATCH /api/events/{slug} raising capacity returned {response.status_code}: "
        f"{response.text[:300]}"
    )
    settle()
    assert db.confirmed_count(event["id"]) == 2, (
        f"event {slug!r} holds {db.confirmed_count(event['id'])} confirmed "
        f"registrations after capacity rose to 2; the head of the waiting list takes "
        f"the seat that appeared"
    )
    promoted = db.registration_for(event["id"], db.account_by_email(first_waiter)["id"])
    assert str(promoted.get("status")) == "confirmed", (
        f"the registration at waiting-list position 1 on {slug!r} holds status "
        f"{promoted.get('status')!r} after the raise, expected 'confirmed'"
    )
    assert TICKET_RE.match(str(promoted.get("ticket_code") or "")), (
        f"the promoted registration on {slug!r} carries ticket_code "
        f"{promoted.get('ticket_code')!r}, which is not {TICKET_PREFIX} plus 8 "
        f"uppercase letters or digits"
    )
    still_waiting = db.registration_for(event["id"],
                                        db.account_by_email(second_waiter)["id"])
    assert str(still_waiting.get("status")) == "waitlisted", (
        f"the registration at waiting-list position 2 on {slug!r} holds status "
        f"{still_waiting.get('status')!r} after one seat appeared, expected "
        f"'waitlisted'"
    )
    assert db.waitlist_positions(event["id"]) == [1], (
        f"event {slug!r} holds waiting-list positions "
        f"{db.waitlist_positions(event['id'])} after the raise, expected [1] with no "
        f"gap left by the promotion"
    )


def test_capacity_raise_mail_reaches_the_promoted_guest(host_client, db, inbox):
    slug = probe_slug("probe-raise-mail")
    title = "Probe Raise Mail"
    create_event(host_client, title, slug, capacity=1)
    holder, waiter = probe_email(), probe_email()
    register(signup(holder), slug)
    register(signup(waiter), slug)
    response = set_event(host_client, slug, capacity=2)
    assert response.status_code in (200, 201), (
        f"PATCH /api/events/{slug} raising capacity returned {response.status_code}: "
        f"{response.text[:300]}"
    )
    message = poll_message(inbox, waiter, PROMOTED_SUBJECT_PREFIX)
    assert message is not None, (
        f"no message with a subject beginning {PROMOTED_SUBJECT_PREFIX!r} reached "
        f"{waiter!r} after the capacity of {slug!r} rose and the seat was taken"
    )
    assert message.subject.startswith(PROMOTED_SUBJECT_PREFIX + title), (
        f"the promotion message to {waiter!r} carries subject {message.subject!r}, "
        f"expected {PROMOTED_SUBJECT_PREFIX + title!r}"
    )


def test_capacity_raise_with_nobody_waiting_sends_no_mail(host_client, db, inbox):
    slug = probe_slug("probe-raise-quiet")
    create_event(host_client, "Probe Raise Quiet", slug, capacity=3)
    holder = probe_email()
    register(signup(holder), slug)
    settle()
    before = inbox.count(holder)
    response = set_event(host_client, slug, capacity=9)
    assert response.status_code in (200, 201), (
        f"PATCH /api/events/{slug} raising capacity returned {response.status_code}: "
        f"{response.text[:300]}"
    )
    settle()
    assert inbox.count(holder) == before, (
        f"{inbox.count(holder) - before} further messages reached {holder!r} after a "
        f"capacity raise on {slug!r} with nobody waiting; that raise moves nobody so "
        f"it mails nobody"
    )


def test_closed_registration_refuses_a_new_registration(host_client, db):
    slug = probe_slug("probe-closed")
    create_event(host_client, "Probe Closed", slug, capacity=5)
    response = set_event(host_client, slug, state=CLOSED_STATE)
    assert response.status_code in (200, 201), (
        f"PATCH /api/events/{slug} moving a published event to {CLOSED_STATE} "
        f"returned {response.status_code}: {response.text[:300]}"
    )
    event = db.event_by_slug(slug)
    assert str(event.get("state")) == CLOSED_STATE, (
        f"event {slug!r} is stored in state {event.get('state')!r} after the move, "
        f"expected {CLOSED_STATE!r}"
    )
    refused = register(signup(probe_email()), slug)
    assert refused.status_code in (400, 403, 409, 422), (
        f"registering on the closed event {slug!r} was answered "
        f"{refused.status_code}: {refused.text[:300]}"
    )
    assert db.count_registrations(event["id"]) == 0, (
        f"event {slug!r} holds {db.count_registrations(event['id'])} registration "
        f"rows after a refused registration on a closed event, expected none"
    )
    reopened = set_event(host_client, slug, state="published")
    assert reopened.status_code in (200, 201), (
        f"PATCH /api/events/{slug} reopening registration returned "
        f"{reopened.status_code}: {reopened.text[:300]}"
    )
    accepted = register(signup(probe_email()), slug)
    assert accepted.status_code in (200, 201), (
        f"registering on {slug!r} after registration reopened was answered "
        f"{accepted.status_code}: {accepted.text[:300]}"
    )


def test_closed_event_keeps_held_registrations_and_the_door(host_client, db, inbox):
    slug = probe_slug("probe-closed-door")
    create_event(host_client, "Probe Closed Door", slug, capacity=3)
    email = probe_email()
    held = register(signup(email), slug)
    ticket = str(held.json().get("ticket_code") or "")
    assert TICKET_RE.match(ticket), (
        f"the registration on {slug!r} carries ticket_code {ticket!r}, which is not "
        f"{TICKET_PREFIX} plus 8 uppercase letters or digits"
    )
    settle()
    before = inbox.count(email)
    response = set_event(host_client, slug, state=CLOSED_STATE)
    assert response.status_code in (200, 201), (
        f"PATCH /api/events/{slug} closing registration returned "
        f"{response.status_code}: {response.text[:300]}"
    )
    settle()
    event = db.event_by_slug(slug)
    account = db.account_by_email(email)
    row = db.registration_for(event["id"], account["id"])
    assert str(row.get("status")) == "confirmed", (
        f"the registration held on {slug!r} reads status {row.get('status')!r} once "
        f"registration closed, expected the seat it already held"
    )
    assert str(row.get("ticket_code")) == ticket, (
        f"the registration held on {slug!r} reads ticket_code "
        f"{row.get('ticket_code')!r} once registration closed, expected {ticket!r}"
    )
    assert inbox.count(email) == before, (
        f"{inbox.count(email) - before} further messages reached {email!r} after "
        f"registration on {slug!r} closed; closing registration mails nobody"
    )
    door = host_client.post(f"/tickets/{ticket}/check-in")
    assert door.status_code in (200, 201), (
        f"POST /api/tickets/{ticket}/check-in on the closed event {slug!r} returned "
        f"{door.status_code}: {door.text[:300]}"
    )
    arrived = db.registration_for(event["id"], account["id"])
    assert str(arrived.get("status")) == "checked_in", (
        f"the registration on the closed event {slug!r} reads status "
        f"{arrived.get('status')!r} after a check-in, expected 'checked_in'"
    )


def test_handle_change_is_refused_on_a_taken_name(db):
    email = probe_email()
    token = signup(email)
    with client(token) as c:
        me = c.get("/accounts/me")
        assert me.status_code == 200, (
            f"GET /api/accounts/me returned {me.status_code}: {me.text[:300]}"
        )
        body = me.json()
        for field in ("id", "email", "display_name", "handle", "role"):
            assert field in body, (
                f"GET /api/accounts/me returned no {field!r} field: {me.text[:300]}"
            )
        assert str(body.get("role")) == "guest", (
            f"GET /api/accounts/me reports role {body.get('role')!r} for a signed-up "
            f"account, expected 'guest'"
        )
        original = str(body.get("handle"))
        taken = c.patch("/accounts/me", json={"handle": HOST_HANDLE})
        assert taken.status_code in (400, 409, 422), (
            f"PATCH /api/accounts/me claiming the seeded handle {HOST_HANDLE!r} was "
            f"answered {taken.status_code}: {taken.text[:300]}"
        )
        reserved = c.patch("/accounts/me", json={"handle": "discover"})
        assert reserved.status_code in (400, 409, 422), (
            f"PATCH /api/accounts/me claiming the reserved path 'discover' was "
            f"answered {reserved.status_code}: {reserved.text[:300]}"
        )
        after = c.get("/accounts/me").json()
        assert str(after.get("handle")) == original, (
            f"the account handle moved from {original!r} to {after.get('handle')!r} "
            f"across two refused changes; a refused change keeps the stored handle"
        )
        fresh = probe_slug("probe-handle")
        accepted = c.patch("/accounts/me", json={"handle": fresh})
        assert accepted.status_code in (200, 201), (
            f"PATCH /api/accounts/me claiming the free handle {fresh!r} was answered "
            f"{accepted.status_code}: {accepted.text[:300]}"
        )
    stored = db.account_by_email(email)
    assert str(stored.get("handle")) == fresh, (
        f"the database holds handle {stored.get('handle')!r} for {email!r} after an "
        f"accepted change to {fresh!r}"
    )


def test_host_creates_a_calendar_in_the_namespace(host_client, db):
    slug = probe_slug("probe-calendar")
    response = host_client.post("/calendars", json=new_calendar_payload(slug))
    assert response.status_code in (200, 201), (
        f"POST /api/calendars for {slug!r} returned {response.status_code}: "
        f"{response.text[:300]}"
    )
    body = response.json()
    for field in ("id", "slug", "owner_account_id"):
        assert field in body, (
            f"POST /api/calendars returned no {field!r} field: {response.text[:300]}"
        )
    stored = db.calendar_by_slug(slug)
    assert stored is not None, (
        f"calendar {slug!r} is missing from the database after a successful create"
    )
    host = db.account_by_email(HOST_EMAIL)
    assert str(stored.get("owner_account_id")) == str(host["id"]), (
        f"calendar {slug!r} is owned by {stored.get('owner_account_id')!r}, expected "
        f"the account that created it"
    )
    duplicate = host_client.post("/calendars",
                                 json=new_calendar_payload(HOST_CALENDAR_SLUG))
    assert duplicate.status_code in (400, 409, 422), (
        f"POST /api/calendars claiming the seeded slug {HOST_CALENDAR_SLUG!r} was "
        f"answered {duplicate.status_code}: {duplicate.text[:300]}"
    )
    category = host_client.post("/calendars", json=new_calendar_payload("books"))
    assert category.status_code in (400, 409, 422), (
        f"POST /api/calendars claiming the category name 'books' was answered "
        f"{category.status_code}: {category.text[:300]}"
    )


def test_guest_is_denied_calendar_creation(guest_client, db):
    slug = probe_slug("probe-guest-calendar")
    response = guest_client.post("/calendars", json=new_calendar_payload(slug))
    assert response.status_code in (401, 403, 404), (
        f"a guest session creating a calendar was answered {response.status_code}; "
        f"calendars belong to a host"
    )
    assert db.calendar_by_slug(slug) is None, (
        f"calendar {slug!r} reached the database from a guest session; a refused "
        f"request writes nothing"
    )


def test_ticket_address_answers_anyone_presenting_the_code(host_client, db):
    slug = probe_slug("probe-ticket-read")
    create_event(host_client, "Probe Ticket Read", slug, capacity=3)
    email = probe_email()
    token = signup(email)
    ticket = str(register(token, slug).json().get("ticket_code") or "")
    assert TICKET_RE.match(ticket), (
        f"the registration on {slug!r} carries ticket_code {ticket!r}, which is not "
        f"{TICKET_PREFIX} plus 8 uppercase letters or digits"
    )
    with client(token) as holder:
        mine = holder.get(f"/tickets/{ticket}")
        assert mine.status_code == 200, (
            f"the holder reading /api/tickets/{ticket} was answered "
            f"{mine.status_code}: {mine.text[:300]}"
        )
        body = mine.json()
        assert str(body.get("ticket_code")) == ticket, (
            f"the ticket response carries ticket_code {body.get('ticket_code')!r}, "
            f"expected {ticket!r}"
        )
        assert str(body.get("event_slug")) == slug, (
            f"the ticket response carries event_slug {body.get('event_slug')!r}, "
            f"expected {slug!r}"
        )
    owning = host_client.get(f"/tickets/{ticket}")
    assert owning.status_code == 200, (
        f"the owning host reading /api/tickets/{ticket} was answered "
        f"{owning.status_code}: {owning.text[:300]}"
    )
    with client() as anonymous:
        at_the_door = anonymous.get(f"/tickets/{ticket}")
        assert at_the_door.status_code == 200, (
            f"an unauthenticated caller presenting /api/tickets/{ticket} was "
            f"answered {at_the_door.status_code}; a ticket is presented at a door "
            f"without an account"
        )
        assert str(at_the_door.json().get("ticket_code")) == ticket, (
            f"the ticket served to a caller presenting the code carries ticket_code "
            f"{at_the_door.json().get('ticket_code')!r}, expected {ticket!r}"
        )
        invented = anonymous.get(f"/tickets/{TICKET_PREFIX}ZZZZZZZZ")
        assert invented.status_code == 404, (
            f"a ticket address carrying a code that never existed was answered "
            f"{invented.status_code}, expected the not-found response"
        )
