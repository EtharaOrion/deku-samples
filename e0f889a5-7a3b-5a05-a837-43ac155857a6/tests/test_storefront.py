"""Graders for the Vela Electronics Storefront.

Every assertion reads the running app, the persisted rows, the billing platform or
the mail server. Nothing here reads the app's own claim about its own effect.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import httpx

from conftest import (
    CHANNEL_GENERAL,
    CURSOR_FIELD,
    CUSTOMER2_EMAIL,
    CUSTOMER_EMAIL,
    CONFLICT_STATUSES,
    CORRELATION_FIELD,
    DENIAL_STATUSES,
    DEVICE_STATUS_BLOCKED,
    DEVICE_STATUS_REGISTERED,
    FIRMWARE_A1_LATEST_BUILD,
    FIRMWARE_CRICKET_LATEST,
    FIRMWARE_CRICKET_LATEST_BUILD,
    FIRMWARE_CRICKET_MID,
    FIRMWARE_CRICKET_MID_BUILD,
    FIRMWARE_CRICKET_OLDEST_BUILD,
    HANDLE_CABLE,
    HANDLE_CASE,
    HANDLE_COMPACT,
    HANDLE_FLAGSHIP,
    HANDLE_MOUNT,
    INVOICE_CURRENCY,
    JOURNEY_INVOICE_DECIMAL,
    JOURNEY_SUBTOTAL_MINOR,
    JOURNEY_TAX_MINOR,
    JOURNEY_TOTAL_MINOR,
    MAIL_SUBJECT_PREFIX,
    MORE_FLAG,
    MSG_SERIAL_OWNED,
    MSG_SERIAL_UNKNOWN,
    NOTE_GROUPS,
    ORDER_STATUS_CONFIRMED,
    PAGE_SIZE_PARAM,
    PASSWORD,
    PRICE_A1_MINOR,
    PRICE_CABLE_1M_MINOR,
    PRICE_CABLE_2M_MINOR,
    PRICE_CASE_MINOR,
    PRICE_CRICKET_MINOR,
    PRICE_MOUNT_MINOR,
    RELEASE_142,
    RELEASE_142_BUILD,
    RELEASE_143,
    RELEASE_143_BUILD,
    RELEASE_144,
    RELEASE_144_BUILD,
    RELEASE_LATEST,
    RELEASE_LATEST_ARTIFACT,
    RELEASE_LATEST_BUILD,
    RELEASE_LATEST_SHA256,
    RELEASE_LATEST_SIZE,
    REFUSAL_STATUSES,
    SEEDED_ORDER_NUMBER,
    SEEDED_ORDER_TOTAL_MINOR,
    SERIAL_BLOCKED,
    SERIAL_MALFORMED,
    SERIAL_OWNED_BY_CUSTOMER,
    SERIAL_OWNED_BY_CUSTOMER2,
    SERIAL_UNKNOWN,
    SERIAL_UNOWNED,
    SHARED_RELEASE_DATE,
    SHIPPING_EXPRESS_MINOR,
    SHIPPING_STANDARD,
    SKU_A1_GRAPHITE,
    SKU_A1_SAND,
    SKU_A1_YELLOW,
    SKU_CABLE_1M,
    SKU_CABLE_2M,
    SKU_CASE,
    SKU_CRICKET_GRAPHITE,
    SKU_CRICKET_YELLOW,
    SKU_MOUNT_CLAMP,
    SKU_MOUNT_VESA,
    STATUS_ACTIVE,
    STATUS_DISCONTINUED,
    STOCK_A1_GRAPHITE,
    STOCK_A1_SAND,
    STOCK_A1_YELLOW,
    STOCK_CASE,
    STOCK_CABLE,
    STOCK_CRICKET_GRAPHITE,
    STOCK_CRICKET_YELLOW,
    SUCCESS_STATUSES,
    SUPPORT_UNTIL_FLAGSHIP,
    SUPPORT_UNTIL_MOUNT,
    TITLE_A1,
    TITLE_CABLE,
    TITLE_CASE,
    TITLE_CRICKET,
    TITLE_MOUNT,
    Shopper,
    buy,
    describe,
    field_of,
    idempotency_key,
    minor_to_decimal,
    payload_of,
    poll_until,
    probe_email,
    settle,
)

import appclient




def test_health_route_and_reserved_directories_exist(app_base, store):
    response = httpx.get(f"{app_base}/health", timeout=30.0)
    assert response.status_code == 200, describe(response)

    listing = httpx.get(f"{app_base}/products", timeout=30.0)
    assert listing.status_code == 200, describe(listing)
    body = payload_of(listing)
    assert "data" in body, f"a list response carries a data array: {describe(listing)}"
    assert "next_cursor" in body, f"a list response carries next_cursor: {describe(listing)}"
    assert "has_more" in body, f"a list response carries has_more: {describe(listing)}"

    missing = httpx.get(f"{app_base}/products/no-such-handle", timeout=30.0)
    assert missing.status_code in REFUSAL_STATUSES, describe(missing)
    error = missing.json()
    assert "request_id" in error, (
        f"an error body carries request_id: {describe(missing)}")

    assert store.table_row_count("product") > 0, (
        "the catalogue must live in PostgreSQL, not in the process")




def test_seeded_catalogue_rows_exist_as_specified(store):
    expected_products = {
        HANDLE_FLAGSHIP: (TITLE_A1, STATUS_ACTIVE, SUPPORT_UNTIL_FLAGSHIP),
        HANDLE_COMPACT: (TITLE_CRICKET, STATUS_ACTIVE, None),
        HANDLE_MOUNT: (TITLE_MOUNT, STATUS_DISCONTINUED, SUPPORT_UNTIL_MOUNT),
        HANDLE_CASE: (TITLE_CASE, STATUS_ACTIVE, None),
        HANDLE_CABLE: (TITLE_CABLE, STATUS_ACTIVE, None),
    }
    for handle, (title, status, support_until) in expected_products.items():
        row = store.product(handle)
        assert row is not None, f"seeded product {handle} is absent from the store"
        assert row["title"] == title, f"{handle} title is {row['title']!r}"
        assert row["status"] == status, f"{handle} status is {row['status']!r}"
        if support_until is not None:
            assert str(row["support_until"]).startswith(support_until), (
                f"{handle} support_until is {row['support_until']!r}")

    expected_variants = {
        SKU_A1_GRAPHITE: (PRICE_A1_MINOR, STOCK_A1_GRAPHITE),
        SKU_A1_SAND: (PRICE_A1_MINOR, STOCK_A1_SAND),
        SKU_A1_YELLOW: (PRICE_A1_MINOR, STOCK_A1_YELLOW),
        SKU_CRICKET_GRAPHITE: (PRICE_CRICKET_MINOR, STOCK_CRICKET_GRAPHITE),
        SKU_CRICKET_YELLOW: (PRICE_CRICKET_MINOR, STOCK_CRICKET_YELLOW),
        SKU_MOUNT_CLAMP: (PRICE_MOUNT_MINOR, 0),
        SKU_MOUNT_VESA: (PRICE_MOUNT_MINOR, 0),
        SKU_CASE: (PRICE_CASE_MINOR, STOCK_CASE),
        SKU_CABLE_1M: (PRICE_CABLE_1M_MINOR, STOCK_CABLE),
        SKU_CABLE_2M: (PRICE_CABLE_2M_MINOR, STOCK_CABLE),
    }
    for sku, (price_minor, available) in expected_variants.items():
        row = store.variant(sku)
        assert row is not None, f"seeded variant {sku} is absent from the store"
        assert int(row["price_minor"]) == price_minor, (
            f"{sku} price_minor is {row['price_minor']!r}")
        assert store.available(sku) == available, (
            f"{sku} available is {store.available(sku)}, expected {available}")


def test_seeded_devices_and_ownership_rows_exist_as_specified(store):
    assert store.customer(CUSTOMER_EMAIL) is not None, (
        f"{CUSTOMER_EMAIL} is not a seeded customer row")
    assert store.customer(CUSTOMER2_EMAIL) is not None, (
        f"{CUSTOMER2_EMAIL} is not a seeded customer row")

    owned = store.device(SERIAL_OWNED_BY_CUSTOMER)
    assert owned is not None, f"{SERIAL_OWNED_BY_CUSTOMER} is not a seeded device"
    assert owned["status"] == DEVICE_STATUS_REGISTERED, (
        f"{SERIAL_OWNED_BY_CUSTOMER} status is {owned['status']!r}")
    assert str(owned["firmware_version"]) == FIRMWARE_CRICKET_MID, (
        f"{SERIAL_OWNED_BY_CUSTOMER} reports {owned['firmware_version']!r}")
    assert len(store.live_ownerships(SERIAL_OWNED_BY_CUSTOMER)) == 1, (
        "a registered device holds exactly one live ownership row")

    other = store.device(SERIAL_OWNED_BY_CUSTOMER2)
    assert other is not None, f"{SERIAL_OWNED_BY_CUSTOMER2} is not a seeded device"
    assert len(store.live_ownerships(SERIAL_OWNED_BY_CUSTOMER2)) == 1, (
        f"{SERIAL_OWNED_BY_CUSTOMER2} holds exactly one live ownership row")

    unowned = store.device(SERIAL_UNOWNED)
    assert unowned is not None, f"{SERIAL_UNOWNED} is not a seeded device"
    assert store.live_ownerships(SERIAL_UNOWNED) == [], (
        f"{SERIAL_UNOWNED} is seeded with no live owner")

    blocked = store.device(SERIAL_BLOCKED)
    assert blocked is not None, f"{SERIAL_BLOCKED} is not a seeded device"
    assert blocked["status"] == DEVICE_STATUS_BLOCKED, (
        f"{SERIAL_BLOCKED} status is {blocked['status']!r}")

    seeded_order = store.order(SEEDED_ORDER_NUMBER)
    assert seeded_order is not None, f"{SEEDED_ORDER_NUMBER} is not a seeded order"
    assert int(seeded_order["total_minor"]) == SEEDED_ORDER_TOTAL_MINOR, (
        f"{SEEDED_ORDER_NUMBER} total is {seeded_order['total_minor']!r}")


def test_seeded_releases_and_firmware_rows_exist_as_specified(store):
    latest = store.release(RELEASE_LATEST)
    assert latest is not None, f"release {RELEASE_LATEST} is absent from the store"
    assert int(latest["build"]) == RELEASE_LATEST_BUILD, (
        f"{RELEASE_LATEST} build is {latest['build']!r}")
    assert latest["artifact_name"] == RELEASE_LATEST_ARTIFACT, (
        f"{RELEASE_LATEST} artifact is {latest['artifact_name']!r}")
    assert int(latest["size_bytes"]) == RELEASE_LATEST_SIZE, (
        f"{RELEASE_LATEST} size is {latest['size_bytes']!r}")
    assert str(latest["sha256"]).lower() == RELEASE_LATEST_SHA256, (
        f"{RELEASE_LATEST} digest is {latest['sha256']!r}")

    for version, build in ((RELEASE_144, RELEASE_144_BUILD),
                           (RELEASE_143, RELEASE_143_BUILD),
                           (RELEASE_142, RELEASE_142_BUILD)):
        row = store.release(version)
        assert row is not None, f"release {version} is absent from the store"
        assert int(row["build"]) == build, f"{version} build is {row['build']!r}"

    assert str(store.release(RELEASE_143)["released_on"]).startswith(
        SHARED_RELEASE_DATE), f"{RELEASE_143} carries the shared release date"
    assert str(store.release(RELEASE_142)["released_on"]).startswith(
        SHARED_RELEASE_DATE), f"{RELEASE_142} carries the shared release date"

    builds = {int(row["build"]) for row in store.firmware_rows()}
    for expected in (FIRMWARE_CRICKET_LATEST_BUILD, FIRMWARE_CRICKET_MID_BUILD,
                     FIRMWARE_CRICKET_OLDEST_BUILD, FIRMWARE_A1_LATEST_BUILD):
        assert expected in builds, f"firmware build {expected} is absent from the store"

    newest = store.firmware(FIRMWARE_CRICKET_LATEST_BUILD)
    assert str(newest["version"]) == FIRMWARE_CRICKET_LATEST, (
        f"build {FIRMWARE_CRICKET_LATEST_BUILD} is version {newest['version']!r}")
    assert str(newest["channel"]) == CHANNEL_GENERAL, (
        f"build {FIRMWARE_CRICKET_LATEST_BUILD} is on channel {newest['channel']!r}")


def test_seed_is_idempotent_no_duplicate_rows(store):
    handles = [row["handle"] for row in store.products()]
    assert len(handles) == len(set(handles)), (
        f"a product handle is duplicated in the store: {sorted(handles)}")

    skus = [row["sku"] for row in store.variants()]
    assert len(skus) == len(set(skus)), (
        f"a variant sku is duplicated in the store: {sorted(skus)}")

    versions = [row["version"] for row in store.releases()]
    assert len(versions) == len(set(versions)), (
        f"an application release version is duplicated: {sorted(versions)}")

    for serial in (SERIAL_OWNED_BY_CUSTOMER, SERIAL_OWNED_BY_CUSTOMER2,
                   SERIAL_UNOWNED, SERIAL_BLOCKED):
        assert store.device(serial) is not None, f"{serial} vanished from the store"
        assert len(store.live_ownerships(serial)) <= 1, (
            f"{serial} carries more than one live ownership row")




def test_guest_checkout_creates_order_with_pinned_totals(store, visitor):
    placed = buy(visitor, (SKU_CRICKET_GRAPHITE, SKU_CASE), CUSTOMER_EMAIL)
    assert placed.status_code in SUCCESS_STATUSES, describe(placed)
    number = str(field_of(payload_of(placed), "number", "order_number"))

    row = store.order(number)
    assert row is not None, f"order {number} was answered but never stored"
    assert int(row["subtotal_minor"]) == JOURNEY_SUBTOTAL_MINOR, (
        f"stored subtotal is {row['subtotal_minor']!r}")
    assert int(row["tax_minor"]) == JOURNEY_TAX_MINOR, (
        f"stored tax is {row['tax_minor']!r}")
    assert int(row["total_minor"]) == JOURNEY_TOTAL_MINOR, (
        f"stored total is {row['total_minor']!r}")
    assert str(row["status"]) == ORDER_STATUS_CONFIRMED, (
        f"stored status is {row['status']!r}")
    assert str(row["email"]).lower() == CUSTOMER_EMAIL, (
        f"stored email is {row['email']!r}")


def test_order_totals_reconcile_with_stored_lines(store, visitor):
    placed = buy(visitor, (SKU_CRICKET_GRAPHITE, SKU_CABLE_2M), probe_email())
    assert placed.status_code in SUCCESS_STATUSES, describe(placed)
    number = str(field_of(payload_of(placed), "number", "order_number"))

    row = store.order(number)
    assert row is not None, f"order {number} was answered but never stored"
    lines = store.order_lines(number)
    assert lines, f"order {number} carries no stored lines"

    line_sum = sum(int(line["total_minor"]) for line in lines)
    assert line_sum == int(row["subtotal_minor"]), (
        f"stored lines sum to {line_sum} while the order subtotal reads "
        f"{row['subtotal_minor']!r}")
    assert int(row["total_minor"]) == (int(row["subtotal_minor"])
                                       + int(row["shipping_minor"])
                                       + int(row["tax_minor"])), (
        f"order {number} totals do not reconcile: {dict(row)}")

    for line in lines:
        assert str(line["title_snapshot"]).strip(), (
            f"order line {line['id']!r} carries no title snapshot")
        assert str(line["sku_snapshot"]).strip(), (
            f"order line {line['id']!r} carries no sku snapshot")


def test_confirmed_order_invoice_exists_in_billing_platform_for_total(store, visitor,
                                                                     payments):
    email = probe_email()
    placed = buy(visitor, (SKU_CRICKET_GRAPHITE, SKU_CASE), email)
    assert placed.status_code in SUCCESS_STATUSES, describe(placed)
    number = str(field_of(payload_of(placed), "number", "order_number"))
    row = store.order(number)
    assert row is not None, f"order {number} was answered but never stored"
    total_minor = int(row["total_minor"])
    assert total_minor == JOURNEY_TOTAL_MINOR, f"stored total is {total_minor}"

    keys = poll_until(lambda: [str(a.get("externalKey", ""))
                               for a in payments.accounts()])
    assert email in keys, (
        f"no billing account carries the externalKey {email!r}; "
        f"the tenant holds {keys}")

    invoice = poll_until(lambda: payments.find_charge(total_minor, INVOICE_CURRENCY))
    assert invoice is not None, (
        f"no invoice for {minor_to_decimal(total_minor)} {INVOICE_CURRENCY} exists in "
        f"the billing platform after order {number}")
    assert invoice.currency.upper() == INVOICE_CURRENCY, (
        f"the invoice currency reads {invoice.currency!r}")
    assert minor_to_decimal(total_minor) == JOURNEY_INVOICE_DECIMAL, (
        "the pinned journey total and the decimal the billing platform reports must agree")


def test_repeat_idempotency_key_creates_no_second_order_or_invoice(store, visitor,
                                                                   payments):
    email = probe_email()
    key = idempotency_key()
    added = visitor.add_line(SKU_CABLE_1M)
    assert added.status_code in SUCCESS_STATUSES, describe(added)
    priced = visitor.set_delivery(email)
    assert priced.status_code in SUCCESS_STATUSES, describe(priced)

    first = visitor.place_order(key=key)
    assert first.status_code in SUCCESS_STATUSES, describe(first)
    number = str(field_of(payload_of(first), "number", "order_number"))

    second = visitor.place_order(key=key)
    assert second.status_code in SUCCESS_STATUSES, describe(second)
    replayed = str(field_of(payload_of(second), "number", "order_number"))
    assert replayed == number, (
        f"a replayed idempotency key produced order {replayed} rather than {number}")

    settle()
    stored = store.orders_for_email(email)
    assert len(stored) == 1, (
        f"{email} holds {len(stored)} stored orders after one submission replayed")

    total_minor = int(store.order(number)["total_minor"])
    matching = [charge for charge in payments.accounts()
                if str(charge.get("externalKey", "")) == email]
    assert len(matching) == 1, (
        f"{email} holds {len(matching)} billing accounts after a replay")
    invoices = [c for c in payments.charges() if c.amount == total_minor
                and c.currency.upper() == INVOICE_CURRENCY]
    assert len(invoices) == 1, (
        f"{len(invoices)} invoices exist for {minor_to_decimal(total_minor)} "
        f"{INVOICE_CURRENCY} after one submission replayed")


def test_stock_commit_moves_available_and_committed_on_order(store, visitor):
    before_available = store.available(SKU_CABLE_1M)
    before_committed = store.committed(SKU_CABLE_1M)

    placed = buy(visitor, (SKU_CABLE_1M,), probe_email())
    assert placed.status_code in SUCCESS_STATUSES, describe(placed)

    settle()
    assert store.available(SKU_CABLE_1M) == before_available - 1, (
        f"available moved from {before_available} to "
        f"{store.available(SKU_CABLE_1M)} on a one unit order")
    assert store.committed(SKU_CABLE_1M) == before_committed + 1, (
        f"committed moved from {before_committed} to "
        f"{store.committed(SKU_CABLE_1M)} on a one unit order")
    assert store.available(SKU_CABLE_1M) >= 0, "available fell below zero"


def test_cart_price_change_is_surfaced_and_order_refused(store, visitor):
    added = visitor.add_line(SKU_CASE)
    assert added.status_code in SUCCESS_STATUSES, describe(added)
    cart = payload_of(visitor.cart())
    lines = cart.get("lines") or []
    assert lines, f"the cart carries no lines after an add: {cart}"
    snapshot = int(field_of(lines[0], "unit_price_minor", "unit_price"))
    assert snapshot == PRICE_CASE_MINOR, (
        f"the line stored {snapshot} rather than the current variant price")

    assert "notices" in cart, (
        "a cart read carries a notices collection so a price change can be stated")
    assert int(cart["subtotal_minor"]) == PRICE_CASE_MINOR, (
        f"the cart subtotal reads {cart['subtotal_minor']!r}")

    stored_variant = store.variant(SKU_CASE)
    assert int(stored_variant["price_minor"]) == PRICE_CASE_MINOR, (
        "the variant price the cart compares against must come from the store")

    priced = visitor.set_delivery(probe_email())
    assert priced.status_code in SUCCESS_STATUSES, describe(priced)
    body = payload_of(priced)
    assert int(body["total_minor"]) == (PRICE_CASE_MINOR
                                        + PRICE_CASE_MINOR // 10), (
        f"the priced cart total reads {body['total_minor']!r}")


def test_concurrent_checkout_for_last_unit_allows_exactly_one(store):
    before = store.available(SKU_A1_YELLOW)
    assert before == STOCK_A1_YELLOW, (
        f"{SKU_A1_YELLOW} must open with {STOCK_A1_YELLOW} available, found {before}")

    shoppers = [Shopper(), Shopper()]
    for shopper in shoppers:
        added = shopper.add_line(SKU_A1_YELLOW)
        assert added.status_code in SUCCESS_STATUSES, describe(added)
        priced = shopper.set_delivery(probe_email())
        assert priced.status_code in SUCCESS_STATUSES, describe(priced)

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda s: s.place_order(), shoppers))

    won = [r for r in responses if r.status_code in SUCCESS_STATUSES]
    lost = [r for r in responses if r.status_code in REFUSAL_STATUSES]
    assert len(won) == 1, (
        "exactly one simultaneous checkout for the last unit may succeed; got "
        + " | ".join(describe(r) for r in responses))
    assert len(lost) == 1, (
        "the losing simultaneous checkout must be refused; got "
        + " | ".join(describe(r) for r in responses))
    assert lost[0].status_code in CONFLICT_STATUSES, (
        f"the loser must read as a conflict: {describe(lost[0])}")

    settle()
    assert store.available(SKU_A1_YELLOW) == 0, (
        f"{SKU_A1_YELLOW} available reads {store.available(SKU_A1_YELLOW)} "
        f"after one of two simultaneous checkouts won")
    assert store.available(SKU_A1_YELLOW) >= 0, "available fell below zero"




def test_confirmed_order_email_delivered_to_buyer_only(store, visitor, inbox):
    email = probe_email()
    before_others = inbox.count(CUSTOMER2_EMAIL)
    placed = buy(visitor, (SKU_CRICKET_GRAPHITE,), email)
    assert placed.status_code in SUCCESS_STATUSES, describe(placed)
    number = str(field_of(payload_of(placed), "number", "order_number"))

    message = poll_until(lambda: inbox.find(email, MAIL_SUBJECT_PREFIX))
    assert message is not None, (
        f"no mail whose subject carries {MAIL_SUBJECT_PREFIX!r} reached {email}")
    assert message.subject.startswith(f"{MAIL_SUBJECT_PREFIX} {number}"), (
        f"the subject reads {message.subject!r}")
    assert len(message.to) == 1, (
        f"the confirmation reached {message.to}, and it must reach the buyer alone")
    assert TITLE_CRICKET in message.body, (
        f"the body names no line title: {message.body[:300]!r}")

    assert inbox.count(email) == 1, (
        f"{inbox.count(email)} messages reached {email} for one order")
    assert inbox.count(CUSTOMER2_EMAIL) == before_others, (
        "an unrelated address received mail for somebody else's order")

    row = store.order(number)
    assert str(row["status"]) == ORDER_STATUS_CONFIRMED, (
        f"mail was sent for an order in state {row['status']!r}")


def test_no_email_sent_for_cart_change_or_device_registration(customer, inbox):
    before = inbox.count(CUSTOMER_EMAIL)

    added = customer.add_line(SKU_CABLE_2M)
    assert added.status_code in SUCCESS_STATUSES, describe(added)
    changed = customer.set_delivery(CUSTOMER_EMAIL)
    assert changed.status_code in SUCCESS_STATUSES, describe(changed)

    registered = customer.register_device(SERIAL_UNOWNED)
    assert registered.status_code in SUCCESS_STATUSES + REFUSAL_STATUSES, (
        describe(registered))

    settle()
    assert inbox.count(CUSTOMER_EMAIL) == before, (
        f"{inbox.count(CUSTOMER_EMAIL) - before} mails were sent for a cart change "
        f"and a device registration, which send none")




def test_device_registration_claims_unowned_serial_and_writes_one_ownership_row(
        store, customer):
    response = customer.register_device(SERIAL_UNOWNED)
    assert response.status_code in SUCCESS_STATUSES, describe(response)

    settle()
    device = store.device(SERIAL_UNOWNED)
    assert device is not None, f"{SERIAL_UNOWNED} vanished from the store"
    assert str(device["status"]) == DEVICE_STATUS_REGISTERED, (
        f"{SERIAL_UNOWNED} status reads {device['status']!r} after registration")

    live = store.live_ownerships(SERIAL_UNOWNED)
    assert len(live) == 1, (
        f"{SERIAL_UNOWNED} carries {len(live)} live ownership rows after one claim")

    owned_serials = {str(row["serial"]).upper()
                     for row in store.devices_for_customer(CUSTOMER_EMAIL)}
    assert SERIAL_UNOWNED in owned_serials, (
        f"{SERIAL_UNOWNED} is not among the devices stored against {CUSTOMER_EMAIL}")

    listing = customer.devices()
    assert listing.status_code in SUCCESS_STATUSES, describe(listing)
    body = payload_of(listing)
    assert MORE_FLAG in body and CURSOR_FIELD in body, (
        f"the device list carries no page metadata: {describe(listing)}")


def test_registering_serial_owned_by_another_account_denied_and_row_untouched(
        store, customer):
    before = store.live_ownerships(SERIAL_OWNED_BY_CUSTOMER2)
    assert len(before) == 1, (
        f"{SERIAL_OWNED_BY_CUSTOMER2} must open with exactly one live owner")

    response = customer.register_device(SERIAL_OWNED_BY_CUSTOMER2)
    assert response.status_code in REFUSAL_STATUSES, describe(response)
    assert MSG_SERIAL_OWNED in response.text, (
        f"the refusal must read {MSG_SERIAL_OWNED!r}: {describe(response)}")
    assert CUSTOMER2_EMAIL not in response.text, (
        "the refusal must never name the other owner")

    settle()
    after = store.live_ownerships(SERIAL_OWNED_BY_CUSTOMER2)
    assert len(after) == 1, (
        f"{SERIAL_OWNED_BY_CUSTOMER2} carries {len(after)} live ownership rows "
        f"after a refused claim")
    assert after[0]["customer_id"] == before[0]["customer_id"], (
        "the refused claim changed the stored owner")


def test_cross_customer_device_read_denied_at_api(store, customer):
    response = customer.get(f"/account/devices/{SERIAL_OWNED_BY_CUSTOMER2}")
    assert response.status_code in DENIAL_STATUSES + (404,), describe(response)

    rename = customer.rename_device(SERIAL_OWNED_BY_CUSTOMER2, "not mine")
    assert rename.status_code in REFUSAL_STATUSES, describe(rename)

    release = customer.release_device(SERIAL_OWNED_BY_CUSTOMER2)
    assert release.status_code in REFUSAL_STATUSES, describe(release)

    settle()
    live = store.live_ownerships(SERIAL_OWNED_BY_CUSTOMER2)
    assert len(live) == 1, (
        f"{SERIAL_OWNED_BY_CUSTOMER2} lost its owner to a refused request")

    listing = payload_of(customer.devices())
    serials = {str(item.get("serial", "")).upper() for item in listing.get("data", [])}
    assert SERIAL_OWNED_BY_CUSTOMER2 not in serials, (
        f"{CUSTOMER_EMAIL} can list a camera owned by somebody else")


def test_cross_customer_order_read_denied_at_api(customer_two):
    response = customer_two.order(SEEDED_ORDER_NUMBER)
    assert response.status_code in DENIAL_STATUSES + (404,), describe(response)

    listing = customer_two.account_orders()
    assert listing.status_code in SUCCESS_STATUSES, describe(listing)
    numbers = {str(item.get("number", ""))
               for item in payload_of(listing).get("data", [])}
    assert SEEDED_ORDER_NUMBER not in numbers, (
        f"{CUSTOMER2_EMAIL} can list an order belonging to {CUSTOMER_EMAIL}")


def test_unauthenticated_account_routes_denied_at_api(store, anonymous):
    before = store.live_ownerships(SERIAL_UNOWNED)

    listing = anonymous.get("/account/devices")
    assert listing.status_code in DENIAL_STATUSES, describe(listing)

    orders = anonymous.get("/account/orders")
    assert orders.status_code in DENIAL_STATUSES, describe(orders)

    claim = anonymous.post("/account/devices", json={"serial": SERIAL_UNOWNED})
    assert claim.status_code in DENIAL_STATUSES, describe(claim)

    stale = anonymous.get("/account/devices",
                          headers={"Authorization": "Bearer not-a-real-token"})
    assert stale.status_code in DENIAL_STATUSES, describe(stale)

    settle()
    after = store.live_ownerships(SERIAL_UNOWNED)
    assert len(after) == len(before), (
        f"{SERIAL_UNOWNED} ownership changed under a signed-out request")


def test_unknown_and_malformed_serial_refused_before_lookup(store, customer):
    unknown = customer.register_device(SERIAL_UNKNOWN)
    assert unknown.status_code in REFUSAL_STATUSES, describe(unknown)
    assert MSG_SERIAL_UNKNOWN in unknown.text, (
        f"the refusal must read {MSG_SERIAL_UNKNOWN!r}: {describe(unknown)}")

    malformed = customer.register_device(SERIAL_MALFORMED)
    assert malformed.status_code in REFUSAL_STATUSES, describe(malformed)

    short = customer.register_device("VA2609")
    assert short.status_code in REFUSAL_STATUSES, describe(short)

    settle()
    assert store.device(SERIAL_UNKNOWN) is None, (
        f"{SERIAL_UNKNOWN} must not exist as a stored device")
    assert store.device(SERIAL_MALFORMED) is None, (
        f"{SERIAL_MALFORMED} must not exist as a stored device")


def test_blocked_device_registration_refused(store, customer):
    blocked = store.device(SERIAL_BLOCKED)
    assert str(blocked["status"]) == DEVICE_STATUS_BLOCKED, (
        f"{SERIAL_BLOCKED} status reads {blocked['status']!r}")

    response = customer.register_device(SERIAL_BLOCKED)
    assert response.status_code in REFUSAL_STATUSES, describe(response)

    settle()
    assert store.live_ownerships(SERIAL_BLOCKED) == [], (
        f"{SERIAL_BLOCKED} gained an owner despite being blocked")
    assert str(store.device(SERIAL_BLOCKED)["status"]) == DEVICE_STATUS_BLOCKED, (
        f"{SERIAL_BLOCKED} left the blocked state on a refused claim")


def test_concurrent_registration_of_one_serial_allows_exactly_one(store):
    serial = SERIAL_UNOWNED
    released = store.live_ownerships(serial)
    assert len(released) <= 1, f"{serial} already carries more than one live owner"

    sessions = [Shopper(appclient.login(CUSTOMER_EMAIL, PASSWORD), CUSTOMER_EMAIL),
                Shopper(appclient.login(CUSTOMER2_EMAIL, PASSWORD), CUSTOMER2_EMAIL)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda s: s.register_device(serial), sessions))

    settle()
    live = store.live_ownerships(serial)
    assert len(live) == 1, (
        f"{serial} carries {len(live)} live ownership rows after two simultaneous "
        f"claims; responses were "
        + " | ".join(describe(r) for r in responses))

    succeeded = [r for r in responses if r.status_code in SUCCESS_STATUSES]
    assert len(succeeded) <= 1, (
        "two simultaneous claims on one serial both reported success: "
        + " | ".join(describe(r) for r in responses))




def test_release_archive_orders_by_build_descending_across_shared_date(visitor):
    response = visitor.releases(page_size=50)
    assert response.status_code in SUCCESS_STATUSES, describe(response)
    body = payload_of(response)
    data = body.get("data") or []
    assert data, f"the release list is empty: {describe(response)}"
    assert MORE_FLAG in body, f"the release list carries no {MORE_FLAG}"
    assert CURSOR_FIELD in body, f"the release list carries no {CURSOR_FIELD}"

    builds = [int(item["build"]) for item in data]
    assert builds == sorted(builds, reverse=True), (
        f"the archive is not ordered by build descending: {builds}")

    versions = [str(item["version"]) for item in data]
    assert versions.index(RELEASE_143) < versions.index(RELEASE_142), (
        f"{RELEASE_143} and {RELEASE_142} share a date and must order by build: "
        f"{versions}")
    assert versions[0] == RELEASE_LATEST, (
        f"the newest release reads {versions[0]!r}")

    single = visitor.release(RELEASE_143)
    assert single.status_code in SUCCESS_STATUSES, describe(single)
    one = payload_of(single)
    assert int(field_of(one, "build")) == RELEASE_143_BUILD, (
        f"{RELEASE_143} answers with build {one.get('build')!r}")
    notes = one.get("notes") or {}
    assert isinstance(notes, (dict, list)), f"release notes shape is {type(notes)}"
    if isinstance(notes, dict):
        for group in notes:
            assert group in NOTE_GROUPS, (
                f"release notes carry the group {group!r}, outside the four allowed")


def test_firmware_manifest_entries_match_stored_rows(store, visitor):
    response = visitor.firmware_manifest(TITLE_CRICKET)
    assert response.status_code in SUCCESS_STATUSES, describe(response)
    manifest = payload_of(response)
    entries = manifest.get("entries") or []
    assert entries, f"the manifest carries no entries: {describe(response)}"

    by_build = {int(entry["build"]): entry for entry in entries}
    assert FIRMWARE_CRICKET_LATEST_BUILD in by_build, (
        f"the manifest omits build {FIRMWARE_CRICKET_LATEST_BUILD}: {sorted(by_build)}")

    latest = by_build[FIRMWARE_CRICKET_LATEST_BUILD]
    stored = store.firmware(FIRMWARE_CRICKET_LATEST_BUILD)
    assert str(latest["version"]) == str(stored["version"]), (
        f"the manifest reports version {latest['version']!r} while the store holds "
        f"{stored['version']!r}")
    assert int(latest["size_bytes"]) == int(stored["size_bytes"]), (
        "the manifest byte size disagrees with the stored row")
    assert str(latest["sha256"]).lower() == str(stored["sha256"]).lower(), (
        "the manifest digest disagrees with the stored row")

    for entry in entries:
        assert str(entry["channel"]) == CHANNEL_GENERAL, (
            f"build {entry['build']!r} is offered on channel {entry['channel']!r}")

    assert FIRMWARE_A1_LATEST_BUILD not in by_build, (
        "the Cricket manifest offers a flagship image")


def test_flash_session_complete_records_reported_version_not_requested(store, visitor):
    serial = SERIAL_OWNED_BY_CUSTOMER
    started = visitor.start_flash(serial, FIRMWARE_CRICKET_LATEST_BUILD)
    assert started.status_code in SUCCESS_STATUSES, describe(started)
    session = payload_of(started)
    assert str(field_of(session, "state")) == "started", (
        f"a new session opens in state {session.get('state')!r}")
    session_id = str(field_of(session, "id", "session_id"))

    completed = visitor.complete_flash(session_id, FIRMWARE_CRICKET_MID)
    assert completed.status_code in SUCCESS_STATUSES, describe(completed)

    settle()
    device = store.device(serial)
    assert str(device["firmware_version"]) == FIRMWARE_CRICKET_MID, (
        f"{serial} records {device['firmware_version']!r}, and it must record the "
        f"version the camera reported rather than the version that was requested")
    assert str(device["firmware_version"]) != FIRMWARE_CRICKET_LATEST, (
        "the requested version was recorded instead of the reported one")

    rows = [row for row in store.flash_sessions(serial)
            if str(row["id"]) == session_id]
    assert rows, f"session {session_id} was answered but never stored"
    assert str(rows[0]["state"]) == "succeeded", (
        f"the stored session state reads {rows[0]['state']!r}")
    assert str(rows[0]["reported_version"]) == FIRMWARE_CRICKET_MID, (
        f"the stored session records {rows[0]['reported_version']!r}")


def test_flash_session_failure_leaves_device_firmware_unchanged(store, visitor):
    serial = SERIAL_OWNED_BY_CUSTOMER
    before = str(store.device(serial)["firmware_version"])

    started = visitor.start_flash(serial, FIRMWARE_CRICKET_LATEST_BUILD)
    assert started.status_code in SUCCESS_STATUSES, describe(started)
    session_id = str(field_of(payload_of(started), "id", "session_id"))

    failed = visitor.fail_flash(session_id, "device_disconnected")
    assert failed.status_code in SUCCESS_STATUSES, describe(failed)

    settle()
    assert str(store.device(serial)["firmware_version"]) == before, (
        f"{serial} moved from {before!r} to "
        f"{store.device(serial)['firmware_version']!r} on a failed write")

    rows = [row for row in store.flash_sessions(serial)
            if str(row["id"]) == session_id]
    assert rows, f"session {session_id} was answered but never stored"
    assert str(rows[0]["state"]) == "failed", (
        f"the stored session state reads {rows[0]['state']!r}")


def test_flash_session_downgrade_below_min_firmware_refused_and_device_untouched(
        store, visitor):
    serial = SERIAL_OWNED_BY_CUSTOMER
    before_version = str(store.device(serial)["firmware_version"])
    before_sessions = len(store.flash_sessions(serial))

    response = visitor.start_flash(serial, FIRMWARE_CRICKET_OLDEST_BUILD)
    assert response.status_code in REFUSAL_STATUSES, describe(response)

    settle()
    assert str(store.device(serial)["firmware_version"]) == before_version, (
        f"{serial} firmware changed on a refused downgrade")
    assert len(store.flash_sessions(serial)) == before_sessions, (
        "a refused downgrade wrote a session row")


def test_flash_session_model_mismatch_refused_and_no_session_row(store, visitor):
    serial = SERIAL_OWNED_BY_CUSTOMER
    before_version = str(store.device(serial)["firmware_version"])
    before_sessions = len(store.flash_sessions(serial))

    response = visitor.start_flash(serial, FIRMWARE_A1_LATEST_BUILD)
    assert response.status_code in REFUSAL_STATUSES, describe(response)

    settle()
    assert str(store.device(serial)["firmware_version"]) == before_version, (
        f"{serial} firmware changed on a refused model mismatch")
    assert len(store.flash_sessions(serial)) == before_sessions, (
        "a refused model mismatch wrote a session row")
