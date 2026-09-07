"""Fixtures, pinned literals and domain stores for the Vela Electronics Storefront.

Every literal below is pinned in instruction.md. Nothing here defines a test.
"""

from __future__ import annotations

import os
import time
import uuid
from typing import Any

import httpx
import pytest

import appclient
import capabilities

PASSWORD = "deku-demo-pw-2026"

CUSTOMER_EMAIL = "customer@example.com"
CUSTOMER2_EMAIL = "customer2@example.com"

CURRENCY = "usd"
INVOICE_CURRENCY = "USD"

SKU_A1_GRAPHITE = "VELA-A1-GRAPHITE"
SKU_A1_SAND = "VELA-A1-SAND"
SKU_A1_YELLOW = "VELA-A1-YELLOW"
SKU_CRICKET_GRAPHITE = "VELA-CRICKET-GRAPHITE"
SKU_CRICKET_YELLOW = "VELA-CRICKET-YELLOW"
SKU_MOUNT_CLAMP = "VELA-MOUNT-CLAMP"
SKU_MOUNT_VESA = "VELA-MOUNT-VESA"
SKU_CASE = "VELA-CASE-STD"
SKU_CABLE_1M = "VELA-CABLE-1M"
SKU_CABLE_2M = "VELA-CABLE-2M"
SKU_PROTECT_2 = "VELA-PROTECT-2"

PRICE_A1_MINOR = 89900
PRICE_CRICKET_MINOR = 29900
PRICE_MOUNT_MINOR = 4900
PRICE_CASE_MINOR = 7900
PRICE_CABLE_1M_MINOR = 1900
PRICE_CABLE_2M_MINOR = 2400
PRICE_PROTECT_2_MINOR = 298

STOCK_A1_GRAPHITE = 4
STOCK_A1_SAND = 6
STOCK_A1_YELLOW = 1
STOCK_CRICKET_GRAPHITE = 12
STOCK_CRICKET_YELLOW = 0
STOCK_CASE = 15
STOCK_CABLE = 30

HANDLE_FLAGSHIP = "flagship"
HANDLE_COMPACT = "compact"
HANDLE_MOUNT = "mount"
HANDLE_CASE = "case"
HANDLE_CABLE = "cable"

TITLE_A1 = "Vela A1"
TITLE_CRICKET = "Vela Cricket"
TITLE_MOUNT = "Monitor Mount"
TITLE_CASE = "Travel Case"
TITLE_CABLE = "Replacement Cable"

SUPPORT_UNTIL_FLAGSHIP = "2032-06-01"
SUPPORT_UNTIL_MOUNT = "2029-09-01"

STATUS_ACTIVE = "active"
STATUS_DISCONTINUED = "discontinued"

SHIPPING_STANDARD = "Standard"
SHIPPING_EXPRESS = "Express"
SHIPPING_STANDARD_MINOR = 0
SHIPPING_EXPRESS_MINOR = 2500

JOURNEY_SUBTOTAL_MINOR = 37800
JOURNEY_TAX_MINOR = 3780
JOURNEY_TOTAL_MINOR = 41580
JOURNEY_INVOICE_DECIMAL = "415.80"

SEEDED_ORDER_NUMBER = "VE-2026-0001"
SEEDED_ORDER_TOTAL_MINOR = 32890
FIRST_NEW_ORDER_NUMBER = "VE-2026-0002"

ORDER_STATUS_PENDING = "pending"
ORDER_STATUS_CONFIRMED = "confirmed"
ORDER_STATUS_CANCELLED = "cancelled"
PAYMENT_STATUS_UNPAID = "unpaid"
PAYMENT_STATUS_INVOICED = "invoiced"

SERIAL_OWNED_BY_CUSTOMER = "VC2609PVDA7Q"
SERIAL_OWNED_BY_CUSTOMER2 = "VA2609NRWB2Z"
SERIAL_UNOWNED = "VA2609KTMHX4"
SERIAL_BLOCKED = "VC2609WJ3DKT"
SERIAL_UNKNOWN = "VA2609QQQQQ9"
SERIAL_MALFORMED = "VA2609KOTMH4"
SERIAL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

DEVICE_STATUS_MANUFACTURED = "manufactured"
DEVICE_STATUS_SOLD = "sold"
DEVICE_STATUS_REGISTERED = "registered"
DEVICE_STATUS_BLOCKED = "blocked"

APP_NAME = "Arranger"
MIN_MACOS = "13.0"
RELEASE_LATEST = "2.0.0"
RELEASE_LATEST_BUILD = 2000
RELEASE_LATEST_DATE = "2024-12-11"
RELEASE_LATEST_ARTIFACT = "arranger-2.0.0.dmg"
RELEASE_LATEST_SIZE = 154876459
RELEASE_LATEST_SHA256 = (
    "9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2")
RELEASE_144 = "1.4.4"
RELEASE_144_BUILD = 1440
RELEASE_144_DATE = "2024-06-26"
RELEASE_143 = "1.4.3"
RELEASE_143_BUILD = 1430
RELEASE_142 = "1.4.2"
RELEASE_142_BUILD = 1420
SHARED_RELEASE_DATE = "2024-05-20"
NOTE_GROUPS = ("Newly Added", "Improvements", "Bug Fixes", "Known Issues")

FIRMWARE_CRICKET_LATEST = "7.2"
FIRMWARE_CRICKET_LATEST_BUILD = 720
FIRMWARE_CRICKET_MID = "7.0"
FIRMWARE_CRICKET_MID_BUILD = 700
FIRMWARE_CRICKET_OLDEST = "6.11"
FIRMWARE_CRICKET_OLDEST_BUILD = 611
FIRMWARE_A1_LATEST = "2.4"
FIRMWARE_A1_LATEST_BUILD = 240
FIRMWARE_A1_MIN = "2.0"
CHANNEL_GENERAL = "general"

FLASH_STARTED = "started"
FLASH_SUCCEEDED = "succeeded"
FLASH_FAILED = "failed"

MAIL_SUBJECT_PREFIX = "Order confirmed:"
MSG_SERIAL_UNKNOWN = "We do not recognise that serial number."
MSG_SERIAL_OWNED = "That camera is registered to someone else."

PAGE_SIZE_PARAM = "page_size"
PAGE_SIZE_DEFAULT = 20
PAGE_SIZE_MAX = 100
CURSOR_FIELD = "next_cursor"
MORE_FLAG = "has_more"
CORRELATION_FIELD = "request_id"

SUCCESS_STATUSES = (200, 201, 202)
REFUSAL_STATUSES = (400, 401, 403, 404, 409, 422)
DENIAL_STATUSES = (401, 403)
NOT_FOUND_STATUSES = (404,)
CONFLICT_STATUSES = (409, 422)

SETTLE_SECONDS = 0.4
POLL_BUDGET_SECONDS = 25.0


def settle(seconds: float = SETTLE_SECONDS) -> None:
    """The one sanctioned pause, for an effect the app writes just after replying."""
    time.sleep(seconds)


def poll_until(predicate, budget: float = POLL_BUDGET_SECONDS):
    """Bounded polling on a monotonic clock. Returns the last value the predicate saw."""
    deadline = time.monotonic() + budget
    value = predicate()
    while not value and time.monotonic() < deadline:
        settle()
        value = predicate()
    return value


def unique_suffix() -> str:
    return uuid.UUID(bytes=os.urandom(16), version=4).hex[:10]


def idempotency_key() -> str:
    return f"probe-{unique_suffix()}"


def probe_email() -> str:
    return f"probe-{unique_suffix()}@example.com"


def describe(response: httpx.Response) -> str:
    return (f"{response.request.method} {response.request.url} -> "
            f"{response.status_code} :: {response.text[:400]}")


def minor_to_decimal(minor: int) -> str:
    return f"{minor // 100}.{minor % 100:02d}"


US_ADDRESS = {
    "name": "Iris Vantaa",
    "line1": "18 Harbour Row",
    "line2": "",
    "city": "Portland",
    "region": "OR",
    "postal_code": "97205",
    "country": "US",
}


class Shopper:
    """One browsing session: an opaque cart plus an optional signed-in customer."""

    def __init__(self, token: str | None = None, email: str | None = None) -> None:
        self.token = token
        self.email = email
        self._cookies = httpx.Cookies()

    def _client(self) -> httpx.Client:
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        return httpx.Client(base_url=appclient.api_base(), timeout=30.0,
                            headers=headers, cookies=self._cookies)

    def request(self, method: str, path: str, body: dict | None = None,
                params: dict | None = None,
                headers: dict | None = None) -> httpx.Response:
        with self._client() as client:
            response = client.request(method, path, json=body, params=params,
                                      headers=headers or {})
        self._cookies.update(response.cookies)
        return response

    def get(self, path: str, **params: Any) -> httpx.Response:
        return self.request("GET", path,
                            params={k: v for k, v in params.items() if v is not None})

    def post(self, path: str, body: dict | None = None,
             key: str | None = None) -> httpx.Response:
        headers = {"Idempotency-Key": key} if key else {}
        return self.request("POST", path, body=body, headers=headers)

    def patch(self, path: str, body: dict | None = None) -> httpx.Response:
        return self.request("PATCH", path, body=body)

    def delete(self, path: str) -> httpx.Response:
        return self.request("DELETE", path)

    def products(self, **params: Any) -> httpx.Response:
        return self.get("/products", **params)

    def product(self, handle: str, variant: str | None = None) -> httpx.Response:
        return self.get(f"/products/{handle}", variant=variant)

    def cart(self) -> httpx.Response:
        return self.get("/cart")

    def add_line(self, sku: str, quantity: int = 1) -> httpx.Response:
        return self.post("/cart/lines", {"sku": sku, "quantity": quantity})

    def set_delivery(self, email: str, method: str = SHIPPING_STANDARD,
                     address: dict | None = None) -> httpx.Response:
        return self.post("/cart/delivery", {
            "email": email,
            "shipping_address": address or US_ADDRESS,
            "shipping_method": method,
        })

    def place_order(self, key: str | None = None) -> httpx.Response:
        return self.post("/orders", None, key=key or idempotency_key())

    def order(self, number: str, access_token: str | None = None) -> httpx.Response:
        return self.get(f"/orders/{number}", access_token=access_token)

    def account_orders(self, **params: Any) -> httpx.Response:
        return self.get("/account/orders", **params)

    def devices(self, **params: Any) -> httpx.Response:
        return self.get("/account/devices", **params)

    def register_device(self, serial: str) -> httpx.Response:
        return self.post("/account/devices", {"serial": serial})

    def rename_device(self, serial: str, nickname: str) -> httpx.Response:
        return self.patch(f"/account/devices/{serial}", {"nickname": nickname})

    def release_device(self, serial: str) -> httpx.Response:
        return self.delete(f"/account/devices/{serial}")

    def releases(self, **params: Any) -> httpx.Response:
        return self.get("/releases", **params)

    def release(self, version: str) -> httpx.Response:
        return self.get(f"/releases/{version}")

    def firmware_manifest(self, model: str) -> httpx.Response:
        return self.get("/firmware/manifest", model=model)

    def start_flash(self, serial: str, target_build: int) -> httpx.Response:
        return self.post("/flash-sessions",
                         {"serial": serial, "target_build": target_build})

    def complete_flash(self, session_id: str, reported_version: str) -> httpx.Response:
        return self.post(f"/flash-sessions/{session_id}/complete",
                         {"reported_version": reported_version})

    def fail_flash(self, session_id: str, reason: str) -> httpx.Response:
        return self.post(f"/flash-sessions/{session_id}/fail", {"reason": reason})


class Store:
    """Domain reads over the persisted rows the brief pins by name."""

    def __init__(self, backend: Any) -> None:
        self.backend = backend

    def query(self, sql: str, params: tuple = ()) -> list[dict]:
        return self.backend.query(sql, params)

    def customer(self, email: str) -> dict | None:
        rows = self.query('SELECT * FROM customer WHERE lower(email) = lower(%s)',
                          (email,))
        return rows[0] if rows else None

    def product(self, handle: str) -> dict | None:
        rows = self.query('SELECT * FROM product WHERE handle = %s', (handle,))
        return rows[0] if rows else None

    def products(self) -> list[dict]:
        return self.query('SELECT * FROM product')

    def variant(self, sku: str) -> dict | None:
        rows = self.query('SELECT * FROM variant WHERE sku = %s', (sku,))
        return rows[0] if rows else None

    def variants(self) -> list[dict]:
        return self.query('SELECT * FROM variant')

    def inventory(self, sku: str) -> dict | None:
        rows = self.query(
            'SELECT i.* FROM inventory_level i JOIN variant v ON v.id = i.variant_id '
            'WHERE v.sku = %s', (sku,))
        return rows[0] if rows else None

    def available(self, sku: str) -> int:
        row = self.inventory(sku)
        return int(row["available"]) if row else -1

    def committed(self, sku: str) -> int:
        row = self.inventory(sku)
        return int(row["committed"]) if row else -1

    def order(self, number: str) -> dict | None:
        rows = self.query('SELECT * FROM "order" WHERE number = %s', (number,))
        return rows[0] if rows else None

    def orders_for_email(self, email: str) -> list[dict]:
        return self.query('SELECT * FROM "order" WHERE lower(email) = lower(%s)',
                          (email,))

    def order_lines(self, number: str) -> list[dict]:
        return self.query(
            'SELECT l.* FROM order_line l JOIN "order" o ON o.id = l.order_id '
            'WHERE o.number = %s', (number,))

    def device(self, serial: str) -> dict | None:
        rows = self.query('SELECT * FROM device WHERE upper(serial) = upper(%s)',
                          (serial,))
        return rows[0] if rows else None

    def live_ownerships(self, serial: str) -> list[dict]:
        return self.query(
            'SELECT o.* FROM device_ownership o JOIN device d ON d.id = o.device_id '
            'WHERE upper(d.serial) = upper(%s) AND o.released_at IS NULL', (serial,))

    def ownerships(self, serial: str) -> list[dict]:
        return self.query(
            'SELECT o.* FROM device_ownership o JOIN device d ON d.id = o.device_id '
            'WHERE upper(d.serial) = upper(%s)', (serial,))

    def devices_for_customer(self, email: str) -> list[dict]:
        return self.query(
            'SELECT d.* FROM device d JOIN device_ownership o ON o.device_id = d.id '
            'JOIN customer c ON c.id = o.customer_id '
            'WHERE lower(c.email) = lower(%s) AND o.released_at IS NULL', (email,))

    def releases(self) -> list[dict]:
        return self.query('SELECT * FROM app_release')

    def release(self, version: str) -> dict | None:
        rows = self.query('SELECT * FROM app_release WHERE version = %s', (version,))
        return rows[0] if rows else None

    def firmware_rows(self) -> list[dict]:
        return self.query('SELECT * FROM firmware')

    def firmware(self, build: int) -> dict | None:
        rows = self.query('SELECT * FROM firmware WHERE build = %s', (build,))
        return rows[0] if rows else None

    def flash_sessions(self, serial: str) -> list[dict]:
        return self.query(
            'SELECT s.* FROM flash_session s JOIN device d ON d.id = s.device_id '
            'WHERE upper(d.serial) = upper(%s)', (serial,))

    def table_row_count(self, table: str) -> int:
        rows = self.query(f'SELECT count(*) AS n FROM "{table}"')
        return int(rows[0]["n"]) if rows else 0


@pytest.fixture(scope="session")
def store() -> Store:
    return Store(capabilities.make_backend())


@pytest.fixture(scope="session")
def inbox():
    return capabilities.make_inbox()


@pytest.fixture(scope="session")
def payments():
    return capabilities.make_payments()


@pytest.fixture(scope="session")
def app_base() -> str:
    return appclient.api_base()


@pytest.fixture()
def visitor() -> Shopper:
    return Shopper()


@pytest.fixture()
def customer() -> Shopper:
    return Shopper(appclient.login(CUSTOMER_EMAIL, PASSWORD), CUSTOMER_EMAIL)


@pytest.fixture()
def customer_two() -> Shopper:
    return Shopper(appclient.login(CUSTOMER2_EMAIL, PASSWORD), CUSTOMER2_EMAIL)


@pytest.fixture()
def anonymous() -> httpx.Client:
    return httpx.Client(base_url=appclient.api_base(), timeout=30.0)


def payload_of(response: httpx.Response) -> dict:
    body = response.json()
    assert isinstance(body, dict), f"expected a JSON object: {describe(response)}"
    return body


def field_of(payload: dict, *names: str) -> Any:
    for name in names:
        if name in payload and payload[name] not in (None, ""):
            return payload[name]
    for value in payload.values():
        if isinstance(value, dict):
            for name in names:
                if name in value and value[name] not in (None, ""):
                    return value[name]
    raise AssertionError(
        f"none of {names} present in the payload: {str(payload)[:400]}")


def buy(shopper: Shopper, skus: tuple, email: str,
        method: str = SHIPPING_STANDARD, key: str | None = None) -> httpx.Response:
    """Fill a cart, price it for delivery and place the order."""
    for sku in skus:
        added = shopper.add_line(sku)
        assert added.status_code in SUCCESS_STATUSES, describe(added)
    priced = shopper.set_delivery(email, method)
    assert priced.status_code in SUCCESS_STATUSES, describe(priced)
    return shopper.place_order(key=key)
