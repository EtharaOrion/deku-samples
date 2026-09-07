from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor

from _shapes import items
from appclient import api_base, client, login, seeded_password
from conftest import (
    API_DISCIPLINES,
    API_HEALTH,
    API_LOGIN,
    API_MEDIA,
    API_PREVIEW,
    API_SIGNUP,
    API_STUDIO_CREDITS,
    API_STUDIO_ITEM,
    API_STUDIO_ITEMS,
    API_STUDIO_MEDIA,
    API_STUDIO_ORDER,
    API_STUDIO_PREVIEW_TOKENS,
    API_STUDIO_PUBLISH,
    API_STUDIO_SLUG,
    API_TALENTS,
    API_TALENT_DETAIL,
    API_WORKS,
    API_WORK_DETAIL,
    CREDIT_ROLE_DIRECTOR,
    DISCIPLINE_DIRECTOR,
    DISCIPLINE_PHOTOGRAPHER,
    DISCIPLINE_STYLIST,
    ENV_APP_PUBLIC_PORT,
    FIELD_ALT,
    FIELD_EXPIRES_AT,
    FIELD_MEDIA_ID,
    FIELD_ORDINAL,
    FIELD_PUBLISHED,
    FIELD_PUBLISHED_AT,
    FIELD_TOKEN,
    HOUSE_CIRRUS,
    HOUSE_MERIDIAN,
    KIND_TALENT,
    KIND_WORK,
    NAME_NOOR_VASQUEZ,
    NAME_SABLE_ITO,
    ORDINAL_AFTER_UNLIST,
    ORDINAL_FIRST,
    ORDINAL_LAST,
    OTHER_PRODUCER_EMAIL,
    PRODUCER_EMAIL,
    PUBLISHED_TALENTS,
    PUBLISHED_WORKS,
    SEEDED_PASSWORD_DEFAULT,
    TALENT_CAMILLE_FERRAND,
    TALENT_NOOR_VASQUEZ,
    TALENT_RIVES,
    TALENT_SABLE_ITO,
    TITLE_THE_QUIET_ROOM,
    TOKEN_HEX_LENGTH,
    VARIANT_LEFT,
    VIEWER_EMAIL,
    WORK_FOUNDRY,
    WORK_THE_HALO,
    WORK_THE_QUIET_ROOM,
    WORK_THE_RADIANT,
    probe_suffix,
    rel,
    settle,
)

REJECTED = (400, 401, 403, 404, 409, 422)
DENIED = (401, 403, 404)
HEX_DIGITS = set("0123456789abcdef")


def _fail(label, response):
    return (
        f"{label}: got status {response.status_code}, body "
        f"{response.text[:400]!r} from {response.request.method} "
        f"{response.request.url}"
    )


def _slugs(payload) -> list[str]:
    return [str(row.get("slug", "")) for row in items(payload)]


def _ordinals(payload) -> list[str]:
    return [str(row.get(FIELD_ORDINAL, "")) for row in items(payload)]


def _is_lower_hex(value: str, length: int) -> bool:
    return len(value) == length and all(ch in HEX_DIGITS for ch in value)


def _attach_poster(session, item_id, alt: str = "A probe still."):
    suffix = probe_suffix()
    return session.post(
        rel(API_STUDIO_MEDIA).format(id=item_id),
        json={"role": "poster", "seed": suffix, "width": 598, "height": 320,
              FIELD_ALT: alt},
    )


def _publish(session, item_id, published: bool):
    return session.post(
        rel(API_STUDIO_PUBLISH).format(id=item_id), json={FIELD_PUBLISHED: published})


def _mint_token(session, item_id):
    return session.post(rel(API_STUDIO_PREVIEW_TOKENS), json={"item_id": item_id})


def _item_id(payload) -> str:
    value = payload.get("id")
    assert value is not None, f"the studio returned a record with no id, {payload!r}"
    return str(value)


def test_health_endpoint_reports_ready(anon_client):
    """cov: C-DC-06, C-TR-25"""
    response = anon_client.get(rel(API_HEALTH))
    assert response.status_code == 200, _fail(
        f"{API_HEALTH} did not report the app ready", response)


def test_deployment_surface_answers_where_the_environment_names_it(anon_client):
    """cov: C-DC-01, C-DC-02, C-DC-03, C-DC-04, C-DC-05, C-DC-07, C-DC-08, C-DC-09, C-DC-10, C-DC-11, C-DC-12, C-DC-13, C-DC-14, C-DC-15, C-TR-18, C-TR-19, C-TR-20, C-TR-21, C-TR-26"""
    base = api_base()
    assert base.endswith("/api"), (
        f"the API base resolved to {base!r}, the brief serves the HTTP API on the "
        f"app origin under the /api prefix")
    port = os.environ.get(ENV_APP_PUBLIC_PORT, "")
    assert port, (
        f"{ENV_APP_PUBLIC_PORT} is not set in the environment, so the app address "
        f"cannot be read from it as the brief requires")
    response = anon_client.get(rel(API_HEALTH))
    assert response.status_code == 200, _fail(
        "the app was not reachable at the address the environment names", response)


def test_login_returns_bearer_token(anon_client):
    """cov: C-CF-01, C-CF-03, C-CF-04, C-DC-17, C-TR-22, C-RL-27"""
    response = anon_client.post(
        rel(API_LOGIN),
        json={"email": PRODUCER_EMAIL, "password": SEEDED_PASSWORD_DEFAULT},
    )
    assert response.status_code in (200, 201), _fail(
        "login with the seeded producer credentials", response)
    token = response.json().get("access_token")
    assert isinstance(token, str) and token, (
        f"login returned no usable access_token, body {response.text[:400]!r}")

    with client(token) as authed:
        probe = authed.get(rel(API_STUDIO_ITEMS))
        assert probe.status_code == 200, _fail(
            f"the token returned by login did not authorise GET "
            f"{API_STUDIO_ITEMS}", probe)


def test_wrong_password_returns_no_token(anon_client):
    """cov: C-CF-02, C-TR-23, C-TR-24"""
    response = anon_client.post(
        rel(API_LOGIN),
        json={"email": PRODUCER_EMAIL, "password": "not-the-seeded-password"},
    )
    assert response.status_code in REJECTED, _fail(
        "login with a wrong password was not rejected as a client error", response)
    assert "access_token" not in response.text, (
        f"login with a wrong password still returned an access_token, body "
        f"{response.text[:400]!r}")


def test_signup_creates_viewer_with_no_house(anon_client):
    """cov: C-CF-05, C-CF-06, C-RL-06, C-RL-07, C-RL-25, C-RL-26, C-DM-12, C-DC-16"""
    email = f"probe-{probe_suffix()}@example.com"
    response = anon_client.post(
        rel(API_SIGNUP), json={"email": email, "password": SEEDED_PASSWORD_DEFAULT,
                               "role": "producer", "house": HOUSE_CIRRUS})
    assert response.status_code in (200, 201), _fail(
        "signup with a fresh address", response)
    body = response.json()
    assert body.get("role") == "viewer", (
        f"signup created role {body.get('role')!r} while the request body asked for "
        f"producer, the brief pins viewer whatever the body carries, body "
        f"{response.text[:400]!r}")

    token = login(email, SEEDED_PASSWORD_DEFAULT)
    with client(token) as fresh:
        refused = fresh.get(rel(API_STUDIO_ITEMS))
        assert refused.status_code in DENIED, _fail(
            "an account created through signup reached a studio endpoint, so signup "
            "conferred more than the viewer role", refused)


def test_seeded_corpus_matches_the_pinned_counts(roster):
    """cov: C-DM-01, C-DM-02, C-DM-03, C-DM-04, C-DM-05, C-DM-06, C-DM-07, C-DM-08, C-DM-09, C-DM-13, C-DM-47, C-DM-48, C-DM-49, C-DM-50, C-DM-51, C-DM-52, C-DM-53, C-DM-54, C-DM-55, C-DM-56, C-DM-57, C-DM-58, C-DM-59, C-DM-60, C-DM-61, C-DM-62, C-DM-63, C-DM-64, C-DM-65, C-DM-66, C-DM-67, C-DM-68, C-DM-69, C-DM-70, C-DM-71, C-DM-72, C-DM-73, C-RL-28, C-RL-29"""
    for slug in (HOUSE_CIRRUS, HOUSE_MERIDIAN):
        assert roster.house_by_slug(slug) is not None, (
            f"the seeded house {slug!r} reached no row in the houses table")

    for email in (PRODUCER_EMAIL, OTHER_PRODUCER_EMAIL, VIEWER_EMAIL):
        assert roster.account_by_email(email) is not None, (
            f"the seeded account {email!r} reached no row in the accounts table")

    published = roster.item_count(kind=KIND_WORK, published=True)
    assert published == PUBLISHED_WORKS + 1, (
        f"the items table holds {published} published works across both houses, the "
        f"brief seeds {PUBLISHED_WORKS} in cirrus plus one in meridian")

    draft_work = roster.item_by_slug(WORK_THE_QUIET_ROOM)
    assert draft_work is not None, (
        f"the seeded unlisted work {WORK_THE_QUIET_ROOM!r} reached no row")
    assert not draft_work.get(FIELD_PUBLISHED), (
        f"the seeded work {WORK_THE_QUIET_ROOM!r} is published, the brief seeds "
        f"{TITLE_THE_QUIET_ROOM} unlisted")

    draft_talent = roster.item_by_slug(TALENT_NOOR_VASQUEZ)
    assert draft_talent is not None, (
        f"the seeded unlisted talent {TALENT_NOOR_VASQUEZ!r} reached no row")
    assert not draft_talent.get(FIELD_PUBLISHED), (
        f"the seeded talent {TALENT_NOOR_VASQUEZ!r} is published, the brief seeds "
        f"{NAME_NOOR_VASQUEZ} unlisted")

    for slug in (WORK_THE_QUIET_ROOM, TALENT_NOOR_VASQUEZ):
        row = roster.item_by_slug(slug)
        assert roster.media_rows(item_id=row.get("id")), (
            f"the seeded unlisted record {slug!r} carries no media row, the brief "
            f"seeds one poster on each so an unreachable address exists to ask for")

    other = roster.item_by_slug(TALENT_SABLE_ITO)
    assert other is not None, (
        f"the seeded meridian talent {TALENT_SABLE_ITO!r} reached no row, so the "
        f"ownership boundary has nothing on the other side to ask for")


def test_work_index_returns_twelve_published_works(anon_client):
    """cov: C-UF-27, C-DC-18, C-RL-01, C-CF-07"""
    response = anon_client.get(rel(API_WORKS))
    assert response.status_code == 200, _fail(
        f"the public work index at GET {API_WORKS}", response)
    rows = items(response.json())
    assert len(rows) == PUBLISHED_WORKS, (
        f"GET {API_WORKS} returned {len(rows)} works, the brief pins "
        f"{PUBLISHED_WORKS} published in the served house, payload "
        f"{response.text[:400]!r}")


def test_unlisted_work_absent_from_the_public_index(anon_client):
    """cov: C-CF-13, C-CF-14, C-OV-16"""
    response = anon_client.get(rel(API_WORKS))
    assert response.status_code == 200, _fail(
        f"the public work index at GET {API_WORKS}", response)
    assert WORK_THE_QUIET_ROOM not in _slugs(response.json()), (
        f"the unlisted work {WORK_THE_QUIET_ROOM!r} appears in the public index, "
        f"payload {response.text[:400]!r}")
    assert TITLE_THE_QUIET_ROOM not in response.text, (
        f"the unlisted title {TITLE_THE_QUIET_ROOM!r} appears in the public index "
        f"payload, payload {response.text[:400]!r}")


def test_unlisted_talent_absent_from_the_roster(anon_client):
    """cov: C-CF-08, C-CF-11, C-CF-12, C-UF-28"""
    response = anon_client.get(rel(API_TALENTS))
    assert response.status_code == 200, _fail(
        f"the public roster at GET {API_TALENTS}", response)
    rows = items(response.json())
    assert len(rows) == PUBLISHED_TALENTS, (
        f"GET {API_TALENTS} returned {len(rows)} talents, the brief pins "
        f"{PUBLISHED_TALENTS} published in the served house")
    assert TALENT_NOOR_VASQUEZ not in _slugs(response.json()), (
        f"the unlisted talent {TALENT_NOOR_VASQUEZ!r} appears on the public roster")
    assert NAME_NOOR_VASQUEZ not in response.text, (
        f"the unlisted name {NAME_NOOR_VASQUEZ!r} appears in the roster payload")


def test_unlisted_talent_detail_is_not_found(anon_client):
    """cov: C-CF-15, C-RL-04"""
    response = anon_client.get(
        rel(API_TALENT_DETAIL).format(slug=TALENT_NOOR_VASQUEZ))
    assert response.status_code == 404, _fail(
        f"GET {API_TALENT_DETAIL} for the unlisted talent "
        f"{TALENT_NOOR_VASQUEZ!r} was reachable", response)
    assert NAME_NOOR_VASQUEZ not in response.text, (
        f"the not-found answer for {TALENT_NOOR_VASQUEZ!r} still carried the name "
        f"{NAME_NOOR_VASQUEZ!r}, payload {response.text[:400]!r}")


def test_published_talent_detail_answers_anonymous(anon_client):
    """cov: C-CF-16, C-DC-21"""
    response = anon_client.get(rel(API_TALENT_DETAIL).format(slug=TALENT_RIVES))
    assert response.status_code == 200, _fail(
        f"GET {API_TALENT_DETAIL} for the published talent {TALENT_RIVES!r}",
        response)


def test_another_house_is_absent_from_every_public_read(anon_client):
    """cov: C-CF-09, C-CF-10, C-DM-09, C-CN-01"""
    talents = anon_client.get(rel(API_TALENTS))
    works = anon_client.get(rel(API_WORKS))
    assert TALENT_SABLE_ITO not in _slugs(talents.json()), (
        f"the meridian talent {TALENT_SABLE_ITO!r} appears on the cirrus roster")
    assert NAME_SABLE_ITO not in talents.text, (
        f"the meridian name {NAME_SABLE_ITO!r} appears in the cirrus roster payload")
    assert WORK_FOUNDRY not in _slugs(works.json()), (
        f"the meridian work {WORK_FOUNDRY!r} appears in the cirrus index")
    detail = anon_client.get(rel(API_TALENT_DETAIL).format(slug=TALENT_SABLE_ITO))
    assert detail.status_code == 404, _fail(
        f"a meridian record was reachable on the cirrus public site", detail)


def test_discipline_set_is_derived_in_first_appearance_order(anon_client):
    """cov: C-CF-56, C-CF-57, C-UF-29, C-DC-22, C-DM-44"""
    response = anon_client.get(rel(API_DISCIPLINES))
    assert response.status_code == 200, _fail(
        f"the derived discipline set at GET {API_DISCIPLINES}", response)
    disciplines = [str(row) if not isinstance(row, dict) else str(row.get("name", ""))
                   for row in items(response.json())]
    assert disciplines == [DISCIPLINE_DIRECTOR, DISCIPLINE_PHOTOGRAPHER], (
        f"GET {API_DISCIPLINES} returned {disciplines!r}, the brief derives the set "
        f"from published talent in first appearance order, which seeds as director "
        f"then photographer")
    assert DISCIPLINE_STYLIST not in disciplines, (
        f"the discipline of the unlisted talent reached the filter set, so the set "
        f"is authored rather than derived from published talent")


def test_ordinals_are_contiguous_and_zero_padded(anon_client):
    """cov: C-CF-48, C-CF-49, C-CF-50, C-DM-21, C-DM-22, C-DM-43"""
    response = anon_client.get(rel(API_WORKS))
    assert response.status_code == 200, _fail(
        f"the public work index at GET {API_WORKS}", response)
    ordinals = _ordinals(response.json())
    expected = ["%03d" % n for n in range(1, PUBLISHED_WORKS + 1)]
    assert ordinals == expected, (
        f"GET {API_WORKS} carried ordinals {ordinals!r}, the brief derives them "
        f"contiguous from {ORDINAL_FIRST} to {ORDINAL_LAST}, zero padded to three "
        f"digits")


def test_work_neighbours_wrap_at_both_ends(anon_client):
    """cov: C-UF-30, C-UF-31, C-DC-19, C-DM-46"""
    last = anon_client.get(rel(API_WORK_DETAIL).format(slug=WORK_THE_RADIANT))
    assert last.status_code == 200, _fail(
        f"GET {API_WORK_DETAIL} for the last work {WORK_THE_RADIANT!r}", last)
    body = last.json()
    following = body.get("next") or {}
    assert str(following.get("slug", "")) == WORK_THE_HALO, (
        f"the work after {WORK_THE_RADIANT!r} is {following.get('slug')!r}, the "
        f"brief wraps {ORDINAL_LAST} to {ORDINAL_FIRST}")

    first = anon_client.get(rel(API_WORK_DETAIL).format(slug=WORK_THE_HALO))
    assert first.status_code == 200, _fail(
        f"GET {API_WORK_DETAIL} for the first work {WORK_THE_HALO!r}", first)
    preceding = first.json().get("previous") or {}
    assert str(preceding.get("slug", "")) == WORK_THE_RADIANT, (
        f"the work before {WORK_THE_HALO!r} is {preceding.get('slug')!r}, the brief "
        f"wraps {ORDINAL_FIRST} back to {ORDINAL_LAST}")


def test_list_endpoints_return_top_level_arrays(anon_client):
    """cov: C-TR-33, C-DC-20, C-DC-25"""
    for route in (API_WORKS, API_TALENTS, API_DISCIPLINES):
        response = anon_client.get(rel(route))
        assert response.status_code == 200, _fail(f"GET {route}", response)
        assert isinstance(response.json(), list), (
            f"GET {route} answered with {type(response.json()).__name__}, the brief "
            f"pins a top-level JSON array for a list endpoint")


def test_trailing_slash_resolves_to_the_same_surface(anon_client):
    """cov: C-UF-02, C-UF-03, C-UF-05, C-UF-06, C-UF-33, C-UF-34"""
    for bare, slashed in (("/works", "/works/"), ("/talents", "/talents/")):
        plain = anon_client.get(bare, follow_redirects=True)
        slash = anon_client.get(slashed, follow_redirects=True)
        assert plain.status_code == 200, _fail(f"GET {bare}", plain)
        assert slash.status_code == 200, _fail(f"GET {slashed}", slash)


def test_talent_selected_work_is_derived_from_credits(anon_client, roster):
    """cov: C-CF-60, C-CF-61, C-CF-62, C-CF-63, C-DM-31, C-DM-45"""
    response = anon_client.get(
        rel(API_TALENT_DETAIL).format(slug=TALENT_CAMILLE_FERRAND))
    assert response.status_code == 200, _fail(
        f"GET {API_TALENT_DETAIL} for {TALENT_CAMILLE_FERRAND!r}", response)
    selected = [str(row.get("slug", ""))
                for row in items(response.json().get("selected_work", []))]
    assert selected, (
        f"the talent {TALENT_CAMILLE_FERRAND!r} carried no selected work, the brief "
        f"derives it from the credits that name them")

    talent = roster.item_by_slug(TALENT_CAMILLE_FERRAND)
    credited = roster.credit_rows(talent_item_id=talent.get("id"))
    assert len(credited) == len(selected), (
        f"the talent route listed {len(selected)} works while the credits table "
        f"names {len(credited)}, so the list is stored rather than derived")


def test_media_of_a_published_record_renders(anon_client, roster):
    """cov: C-CF-29, C-DC-23, C-DM-23, C-DM-28"""
    published = roster.item_by_slug(TALENT_RIVES)
    poster = roster.media_rows(item_id=published.get("id"))
    assert poster, (
        f"the published talent {TALENT_RIVES!r} carries no media row")
    media_id = str(poster[0].get("id"))
    response = anon_client.get(rel(API_MEDIA).format(media_id=media_id))
    assert response.status_code == 200, _fail(
        f"GET {API_MEDIA} for a published record's poster", response)
    assert response.content, (
        f"GET {API_MEDIA} for a published record answered with an empty body")


def test_media_of_an_unlisted_record_is_not_found(anon_client, roster):
    """cov: C-CF-30, C-RL-05, C-OV-17"""
    draft = roster.item_by_slug(TALENT_NOOR_VASQUEZ)
    poster = roster.media_rows(item_id=draft.get("id"))
    assert poster, (
        f"the unlisted talent {TALENT_NOOR_VASQUEZ!r} carries no media row, so the "
        f"address this check reads cannot be built")
    media_id = str(poster[0].get("id"))
    response = anon_client.get(rel(API_MEDIA).format(media_id=media_id))
    assert response.status_code == 404, _fail(
        f"GET {API_MEDIA} served the poster of an unlisted record to a caller who "
        f"held its id", response)


def test_media_ids_are_unguessable_lowercase_hex(roster):
    """cov: C-DM-24, C-DM-25, C-DM-26"""
    rows = roster.media_rows()
    assert rows, "the media table holds no rows at all"
    for row in rows[:20]:
        value = str(row.get("id"))
        assert _is_lower_hex(value, TOKEN_HEX_LENGTH), (
            f"the media id {value!r} is not {TOKEN_HEX_LENGTH} characters of "
            f"lowercase hex, so the address is guessable")


def test_same_media_id_returns_the_same_image(anon_client, roster):
    """cov: C-DC-42"""
    published = roster.item_by_slug(TALENT_RIVES)
    poster = roster.media_rows(item_id=published.get("id"))
    media_id = str(poster[0].get("id"))
    route = rel(API_MEDIA).format(media_id=media_id)
    first = anon_client.get(route)
    second = anon_client.get(route)
    assert first.status_code == 200 and second.status_code == 200, _fail(
        f"GET {API_MEDIA} twice for one published poster", second)
    assert first.content == second.content, (
        f"two requests for media id {media_id!r} returned different bytes, the "
        f"brief draws a still from its stored seed so the same row is stable")


def test_created_record_is_unlisted_with_no_published_at(new_talent, roster):
    """cov: C-CF-17, C-CF-18, C-RL-11, C-RL-12, C-DC-27"""
    created = new_talent()
    assert not created.get(FIELD_PUBLISHED), (
        f"a record created in the studio came back published, payload {created!r}")
    assert created.get(FIELD_PUBLISHED_AT) is None, (
        f"a record created in the studio carried {FIELD_PUBLISHED_AT} "
        f"{created.get(FIELD_PUBLISHED_AT)!r}, the brief creates it null")
    row = roster.item_by_id(created.get("id"))
    assert row is not None and not row.get(FIELD_PUBLISHED), (
        f"the stored row for the created record does not read as unlisted, {row!r}")


def test_publishing_stamps_published_at_and_reveals_the_record(
        producer_client, anon_client, new_talent):
    """cov: C-CF-19, C-RL-18, C-DC-29, C-DC-30, C-DM-15, C-RL-14"""
    created = new_talent(discipline=DISCIPLINE_DIRECTOR)
    item_id = _item_id(created)
    attached = _attach_poster(producer_client, item_id)
    assert attached.status_code in (200, 201), _fail(
        f"attaching a poster at POST {API_STUDIO_MEDIA}", attached)

    hidden = anon_client.get(
        rel(API_TALENT_DETAIL).format(slug=created.get("slug")))
    assert hidden.status_code == 404, _fail(
        "an unlisted talent was reachable at its own address before publishing",
        hidden)

    published = _publish(producer_client, item_id, True)
    assert published.status_code in (200, 201), _fail(
        f"publishing at POST {API_STUDIO_PUBLISH}", published)
    body = published.json()
    assert body.get(FIELD_PUBLISHED) is True, (
        f"publishing returned {FIELD_PUBLISHED} {body.get(FIELD_PUBLISHED)!r}")
    assert body.get(FIELD_PUBLISHED_AT), (
        f"publishing left {FIELD_PUBLISHED_AT} empty, payload {published.text[:400]!r}")

    seen = settle(lambda: anon_client.get(
        rel(API_TALENT_DETAIL).format(slug=created.get("slug"))).status_code == 200)
    assert seen, (
        f"the published talent {created.get('slug')!r} never became reachable at its "
        f"own address")


def test_unlisting_removes_the_record_from_every_public_read(
        producer_client, anon_client, new_talent):
    """cov: C-CF-20, C-CF-21, C-RL-19"""
    created = new_talent()
    item_id = _item_id(created)
    _attach_poster(producer_client, item_id)
    _publish(producer_client, item_id, True)
    assert settle(lambda: anon_client.get(
        rel(API_TALENT_DETAIL).format(slug=created.get("slug"))).status_code == 200)

    unlisted = _publish(producer_client, item_id, False)
    assert unlisted.status_code in (200, 201), _fail(
        f"unlisting at POST {API_STUDIO_PUBLISH}", unlisted)
    assert unlisted.json().get(FIELD_PUBLISHED_AT) is None, (
        f"unlisting left {FIELD_PUBLISHED_AT} set, payload {unlisted.text[:400]!r}")

    gone = settle(lambda: anon_client.get(
        rel(API_TALENT_DETAIL).format(slug=created.get("slug"))).status_code == 404)
    assert gone, (
        f"the unlisted talent {created.get('slug')!r} stayed reachable at its own "
        f"address")
    roster_read = anon_client.get(rel(API_TALENTS))
    assert created.get("slug") not in _slugs(roster_read.json()), (
        f"the unlisted talent {created.get('slug')!r} stayed on the public roster")


def test_publishing_without_an_alt_is_refused(producer_client, roster, new_talent):
    """cov: C-CF-22, C-CF-23, C-DM-27"""
    created = new_talent()
    item_id = _item_id(created)
    _attach_poster(producer_client, item_id, alt="")

    refused = _publish(producer_client, item_id, True)
    assert refused.status_code in REJECTED, _fail(
        "publishing a record whose poster carries an empty alt was allowed", refused)
    row = roster.item_by_id(created.get("id"))
    assert not row.get(FIELD_PUBLISHED), (
        f"the refused publish still flipped the stored row, {row!r}")


def test_publishing_a_new_discipline_adds_it_to_the_filter(
        producer_client, anon_client, new_talent):
    """cov: C-CF-58, C-CF-59, C-DM-16"""
    before = anon_client.get(rel(API_DISCIPLINES))
    assert DISCIPLINE_STYLIST not in before.text, (
        f"the filter set already carried {DISCIPLINE_STYLIST!r} before any stylist "
        f"was published")

    created = new_talent(discipline=DISCIPLINE_STYLIST)
    item_id = _item_id(created)
    _attach_poster(producer_client, item_id)
    published = _publish(producer_client, item_id, True)
    assert published.status_code in (200, 201), _fail(
        "publishing a stylist", published)

    grew = settle(lambda: DISCIPLINE_STYLIST in anon_client.get(
        rel(API_DISCIPLINES)).text)
    assert grew, (
        f"publishing a stylist did not add {DISCIPLINE_STYLIST!r} to the filter set, "
        f"so the set is authored rather than derived")

    _publish(producer_client, item_id, False)
    shrank = settle(lambda: DISCIPLINE_STYLIST not in anon_client.get(
        rel(API_DISCIPLINES)).text)
    assert shrank, (
        f"unlisting the only stylist left {DISCIPLINE_STYLIST!r} in the filter set")


def test_unlisting_a_work_keeps_ordinals_contiguous(
        producer_client, anon_client, new_work):
    """cov: C-CF-51, C-DM-42, C-RL-16"""
    created = new_work()
    item_id = _item_id(created)
    _attach_poster(producer_client, item_id)
    _publish(producer_client, item_id, True)
    assert settle(lambda: created.get("slug") in _slugs(
        anon_client.get(rel(API_WORKS)).json()))

    grown = _ordinals(anon_client.get(rel(API_WORKS)).json())
    assert grown == ["%03d" % n for n in range(1, len(grown) + 1)], (
        f"publishing a work left the ordinals at {grown!r} rather than contiguous")

    _publish(producer_client, item_id, False)
    settled = settle(lambda: created.get("slug") not in _slugs(
        anon_client.get(rel(API_WORKS)).json()))
    assert settled, "the unlisted work stayed in the public index"
    after = _ordinals(anon_client.get(rel(API_WORKS)).json())
    assert after == ["%03d" % n for n in range(1, len(after) + 1)], (
        f"unlisting a work left a gap in the ordinals, {after!r}")
    assert after[-1] == ORDINAL_LAST, (
        f"the index ends at ordinal {after[-1]!r} rather than {ORDINAL_LAST!r} after "
        f"the probe record was withdrawn")
    assert ORDINAL_AFTER_UNLIST in after, (
        f"the ordinal sequence {after!r} does not reach {ORDINAL_AFTER_UNLIST!r}")


def test_preview_token_opens_its_own_record(producer_client, new_talent):
    """cov: C-CF-31, C-CF-32, C-CF-33, C-CF-34, C-CF-35, C-DM-32, C-DM-33, C-DC-24, C-DC-34, C-RL-17"""
    created = new_talent()
    item_id = _item_id(created)
    minted = _mint_token(producer_client, item_id)
    assert minted.status_code in (200, 201), _fail(
        f"minting a preview token at POST {API_STUDIO_PREVIEW_TOKENS}", minted)
    body = minted.json()
    token = str(body.get(FIELD_TOKEN, ""))
    assert _is_lower_hex(token, TOKEN_HEX_LENGTH), (
        f"the minted token {token!r} is not {TOKEN_HEX_LENGTH} characters of "
        f"lowercase hex")
    assert body.get(FIELD_EXPIRES_AT), (
        f"the minted token carried no {FIELD_EXPIRES_AT}, payload "
        f"{minted.text[:400]!r}")

    opened = producer_client.get(rel(API_PREVIEW).format(token=token))
    assert opened.status_code == 200, _fail(
        f"GET {API_PREVIEW} with the token minted for that very record", opened)
    assert str(opened.json().get("slug", "")) == created.get("slug"), (
        f"the preview answered with a different record, payload "
        f"{opened.text[:400]!r}")


def test_preview_token_does_not_open_another_record(
        producer_client, new_talent, new_work):
    """cov: C-CF-36, C-DM-34"""
    one = new_talent()
    other = new_work()
    token = str(_mint_token(producer_client, _item_id(one)).json().get(FIELD_TOKEN))

    opened = producer_client.get(rel(API_PREVIEW).format(token=token))
    assert opened.status_code == 200, _fail(
        "the token did not open the record it was minted for", opened)
    assert str(other.get("slug")) not in opened.text, (
        f"a token minted for {one.get('slug')!r} carried the record "
        f"{other.get('slug')!r} in its answer")


def test_preview_route_without_a_session_reveals_nothing(
        producer_client, anon_client, viewer_client, new_talent):
    """cov: C-RL-08, C-TR-36, C-TR-37"""
    created = new_talent()
    token = str(_mint_token(producer_client, _item_id(created))
                .json().get(FIELD_TOKEN))

    for session, label in ((anon_client, "a caller with no session"),
                           (viewer_client, "a viewer session")):
        response = session.get(rel(API_PREVIEW).format(token=token))
        assert response.status_code in DENIED, _fail(
            f"the preview route served an unlisted record to {label}", response)
        assert str(created.get("slug")) not in response.text, (
            f"the refused preview still named the record {created.get('slug')!r} to "
            f"{label}, payload {response.text[:400]!r}")


def test_cross_house_studio_read_is_not_found(other_producer_client, roster):
    """cov: C-CF-40, C-RL-22, C-OV-18, C-DC-26"""
    target = roster.item_by_slug(WORK_THE_HALO)
    assert target is not None, (
        f"the seeded cirrus work {WORK_THE_HALO!r} reached no row")
    item_id = str(target.get("id"))

    listed = other_producer_client.get(rel(API_STUDIO_ITEMS))
    assert listed.status_code == 200, _fail(
        f"the meridian producer's own studio list at GET {API_STUDIO_ITEMS}", listed)
    assert WORK_THE_HALO not in _slugs(listed.json()), (
        f"the meridian producer's studio list carried the cirrus record "
        f"{WORK_THE_HALO!r}")

    read = other_producer_client.get(rel(API_STUDIO_ITEM).format(id=item_id))
    assert read.status_code == 404, _fail(
        f"the meridian producer read the cirrus record {WORK_THE_HALO!r} at GET "
        f"{API_STUDIO_ITEM}", read)
    assert WORK_THE_HALO not in read.text, (
        f"the refusal still named the cirrus record, payload {read.text[:400]!r}")


def test_cross_house_studio_write_leaves_the_record_unchanged(
        other_producer_client, roster):
    """cov: C-CF-41, C-CF-42, C-CF-43, C-CF-44, C-CF-45, C-CF-46, C-CF-47, C-RL-23, C-RL-24, C-DC-28, C-DC-31, C-RL-15"""
    target = roster.item_by_slug(WORK_THE_HALO)
    item_id = str(target.get("id"))
    before = dict(target)

    attempts = [
        ("edit", other_producer_client.patch(
            rel(API_STUDIO_ITEM).format(id=item_id),
            json={"title": "Taken Over"})),
        ("attach media", other_producer_client.post(
            rel(API_STUDIO_MEDIA).format(id=item_id),
            json={"role": "poster", "seed": probe_suffix(), "width": 598,
                  "height": 320, FIELD_ALT: "A stolen still."})),
        ("attach a credit", other_producer_client.post(
            rel(API_STUDIO_CREDITS).format(id=item_id),
            json={"role": CREDIT_ROLE_DIRECTOR, "name": "Taken Over"})),
        ("publish", other_producer_client.post(
            rel(API_STUDIO_PUBLISH).format(id=item_id),
            json={FIELD_PUBLISHED: True})),
        ("unlist", other_producer_client.post(
            rel(API_STUDIO_PUBLISH).format(id=item_id),
            json={FIELD_PUBLISHED: False})),
        ("reorder", other_producer_client.post(
            rel(API_STUDIO_ORDER), json={"ordered_ids": [item_id]})),
        ("change the slug", other_producer_client.post(
            rel(API_STUDIO_SLUG).format(id=item_id), json={"slug": "taken-over"})),
        ("mint a preview token", other_producer_client.post(
            rel(API_STUDIO_PREVIEW_TOKENS), json={"item_id": item_id})),
    ]
    for label, response in attempts:
        assert response.status_code in DENIED, _fail(
            f"the meridian producer was allowed to {label} a cirrus record",
            response)

    after = roster.item_by_slug(WORK_THE_HALO)
    assert after is not None, (
        f"the cirrus record {WORK_THE_HALO!r} no longer resolves by its own slug "
        f"after a cross-house write attempt")
    for field in ("title", FIELD_PUBLISHED, "slug"):
        assert after.get(field) == before.get(field), (
            f"a cross-house write changed {field!r} from {before.get(field)!r} to "
            f"{after.get(field)!r}")


def test_cross_house_preview_token_is_refused(
        producer_client, other_producer_client, new_talent):
    """cov: C-CF-36, C-DM-34"""
    created = new_talent()
    token = str(_mint_token(producer_client, _item_id(created))
                .json().get(FIELD_TOKEN))
    response = other_producer_client.get(rel(API_PREVIEW).format(token=token))
    assert response.status_code in DENIED, _fail(
        "a cirrus preview token opened for the meridian producer", response)
    assert str(created.get("slug")) not in response.text, (
        f"the refusal still named the cirrus record {created.get('slug')!r}")


def test_viewer_token_is_denied_at_every_studio_endpoint(viewer_client, roster):
    """cov: C-CF-37, C-CF-39, C-RL-09, C-RL-10, C-RL-21, C-DC-35, C-DC-36"""
    target = roster.item_by_slug(WORK_THE_HALO)
    item_id = str(target.get("id"))
    before = dict(target)

    attempts = [
        ("list records", viewer_client.get(rel(API_STUDIO_ITEMS))),
        ("read one record", viewer_client.get(
            rel(API_STUDIO_ITEM).format(id=item_id))),
        ("create a record", viewer_client.post(rel(API_STUDIO_ITEMS), json={
            "kind": KIND_WORK, "slug": f"viewer-probe-{probe_suffix()}",
            "title": "Viewer Escalation Probe", "variant": VARIANT_LEFT})),
        ("publish a record", viewer_client.post(
            rel(API_STUDIO_PUBLISH).format(id=item_id),
            json={FIELD_PUBLISHED: False})),
        ("mint a preview token", viewer_client.post(
            rel(API_STUDIO_PREVIEW_TOKENS), json={"item_id": item_id})),
    ]
    for label, response in attempts:
        assert response.status_code in DENIED, _fail(
            f"a viewer session was allowed to {label}", response)

    after = roster.item_by_slug(WORK_THE_HALO)
    assert after.get(FIELD_PUBLISHED) == before.get(FIELD_PUBLISHED), (
        f"a denied viewer call still changed {FIELD_PUBLISHED} on the record")


def test_anonymous_studio_call_is_denied(anon_client, roster):
    """cov: C-CF-38, C-RL-03, C-RL-20"""
    target = roster.item_by_slug(WORK_THE_HALO)
    item_id = str(target.get("id"))
    for label, response in (
        ("list records", anon_client.get(rel(API_STUDIO_ITEMS))),
        ("publish a record", anon_client.post(
            rel(API_STUDIO_PUBLISH).format(id=item_id),
            json={FIELD_PUBLISHED: False})),
    ):
        assert response.status_code in DENIED, _fail(
            f"a caller with no token was allowed to {label}", response)


def test_slug_survives_a_title_change(producer_client, new_work, roster):
    """cov: C-CF-53, C-CF-54, C-DM-19, C-RL-13"""
    created = new_work()
    item_id = _item_id(created)
    original = created.get("slug")

    renamed = producer_client.patch(
        rel(API_STUDIO_ITEM).format(id=item_id),
        json={"title": f"Renamed {probe_suffix()}"})
    assert renamed.status_code in (200, 201), _fail(
        f"renaming a record at PATCH {API_STUDIO_ITEM}", renamed)
    assert renamed.json().get("slug") == original, (
        f"the slug moved from {original!r} to {renamed.json().get('slug')!r} when "
        f"only the title changed")
    row = roster.item_by_id(created.get("id"))
    assert row.get("slug") == original, (
        f"the stored slug moved with the title, {row.get('slug')!r}")


def test_changed_slug_leaves_a_permanent_redirect(
        producer_client, anon_client, new_work, roster):
    """cov: C-CF-55, C-DM-35, C-DM-36, C-DM-37, C-DM-38, C-DC-32"""
    created = new_work()
    item_id = _item_id(created)
    original = created.get("slug")
    _attach_poster(producer_client, item_id)
    _publish(producer_client, item_id, True)

    moved = f"{original}-moved"
    changed = producer_client.post(
        rel(API_STUDIO_SLUG).format(id=item_id), json={"slug": moved})
    assert changed.status_code in (200, 201), _fail(
        f"changing a slug at POST {API_STUDIO_SLUG}", changed)
    assert changed.json().get("slug") == moved, (
        f"the record did not move to {moved!r}, payload {changed.text[:400]!r}")

    redirects = roster.redirect_rows(old_slug=original)
    assert redirects, (
        f"changing the slug wrote no redirect row for {original!r}")

    followed = anon_client.get(f"/works/{original}", follow_redirects=True)
    assert followed.status_code == 200, _fail(
        f"the old address /works/{original} stopped answering after the slug moved",
        followed)


def test_duplicate_slug_under_concurrency_lands_once(producer_client, roster):
    """cov: C-CF-52, C-DM-18, C-DM-39, C-DM-40, C-DM-41"""
    slug = f"race-{probe_suffix()}"
    body = {"kind": KIND_WORK, "slug": slug, "title": "Slug Race Probe",
            "variant": VARIANT_LEFT}

    def _create():
        return producer_client.post(rel(API_STUDIO_ITEMS), json=body)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [f.result() for f in [pool.submit(_create), pool.submit(_create)]]

    accepted = [r for r in results if r.status_code in (200, 201)]
    refused = [r for r in results if r.status_code in REJECTED]
    assert len(accepted) == 1, (
        f"two simultaneous creates of the slug {slug!r} produced "
        f"{len(accepted)} acceptances, the brief lets exactly one win")
    assert len(refused) == 1, (
        f"the losing create answered {[r.status_code for r in results]!r} rather "
        f"than a client error naming the conflict")
    stored = roster.item_rows(slug=slug)
    assert len(stored) == 1, (
        f"the items table holds {len(stored)} rows at the slug {slug!r}")


def test_uppercase_slug_collides_with_its_lowercase_twin(producer_client):
    """cov: C-DM-20"""
    slug = f"case-{probe_suffix()}"
    first = producer_client.post(rel(API_STUDIO_ITEMS), json={
        "kind": KIND_WORK, "slug": slug, "title": "Case Probe",
        "variant": VARIANT_LEFT})
    assert first.status_code in (200, 201), _fail("creating the first record", first)

    second = producer_client.post(rel(API_STUDIO_ITEMS), json={
        "kind": KIND_WORK, "slug": slug.upper(), "title": "Case Probe Twin",
        "variant": VARIANT_LEFT})
    assert second.status_code in REJECTED, _fail(
        f"saving {slug.upper()!r} against an existing {slug!r} was allowed, the "
        f"brief decides slug uniqueness after lowercasing", second)


def test_seeded_records_survive_a_reread(anon_client, roster):
    """cov: C-DM-74, C-DC-37, C-DC-38, C-DC-39, C-DC-40, C-DC-41"""
    first = roster.item_count(kind=KIND_TALENT)
    second = roster.item_count(kind=KIND_TALENT)
    assert first == second, (
        f"the talent count moved from {first} to {second} between two reads with no "
        f"write in between")
    route = anon_client.get(rel(API_TALENTS))
    assert len(items(route.json())) == PUBLISHED_TALENTS, (
        f"the roster read back a different count from the stored rows")


def test_rejected_request_changes_no_state(producer_client, roster, new_work):
    """cov: C-TR-31, C-TR-32, C-DM-11, C-DM-17"""
    created = new_work()
    item_id = _item_id(created)
    before = roster.item_by_id(created.get("id"))

    refused = producer_client.post(rel(API_STUDIO_ITEMS), json={
        "kind": "sculpture", "slug": f"bad-kind-{probe_suffix()}",
        "title": "Unknown Kind Probe"})
    assert refused.status_code in REJECTED, _fail(
        "a record carrying a kind outside the two the brief names was accepted",
        refused)

    after = roster.item_by_id(created.get("id"))
    assert after.get("slug") == before.get("slug"), (
        f"a rejected create changed an unrelated record, {before!r} became {after!r}")
    still_there = producer_client.get(rel(API_STUDIO_ITEM).format(id=item_id))
    assert still_there.status_code == 200, _fail(
        "the record created before a rejected call stopped resolving", still_there)


def test_role_is_never_read_from_a_request_body(anon_client):
    """cov: C-CF-05, C-CF-06, C-DM-10, C-DM-14, C-DM-30"""
    email = f"escalate-{probe_suffix()}@example.com"
    response = anon_client.post(rel(API_SIGNUP), json={
        "email": email, "password": SEEDED_PASSWORD_DEFAULT,
        "role": "producer", "house_id": 1, "house": HOUSE_MERIDIAN})
    assert response.status_code in (200, 201), _fail(
        "signup carrying an escalation body", response)
    body = response.json()
    assert body.get("role") == "viewer", (
        f"signup honoured the role in the request body, returning "
        f"{body.get('role')!r}")
    assert not body.get("house_id"), (
        f"signup honoured the house in the request body, returning house_id "
        f"{body.get('house_id')!r}")
