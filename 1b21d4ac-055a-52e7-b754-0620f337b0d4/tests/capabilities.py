"""The service surfaces a check is allowed to observe.

A check names a capability -- the store, the inbox, the billing platform -- and
never the product behind it. Swapping Postgres, Mailpit or Kill Bill for another
provider is a change here and nowhere else.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from decimal import Decimal

import httpx

TIMEOUT_SECONDS = 30.0
MINOR_UNITS = Decimal(100)

DB_VARS = ("DB_ADMIN_URL", "DATABASE_URL")
INBOX_VAR = "EMAIL_INBOX_API_URL"
PAYMENTS_URL_VAR = "PAYMENTS_API_URL"

INBOX_PAGE = 500
PAYMENTS_PAGE = 500


class InfrastructureUnavailable(RuntimeError):
    """A service the checks must observe is absent or unreachable.

    Distinct from a failed assertion: this is the harness lacking what it needs,
    not the app being wrong.
    """


class Backend:
    """Read-only record access, in the four shapes the checks actually use."""

    def query(self, sql: str, params=None) -> list[dict]:
        raise NotImplementedError

    def rows(self, table: str, **where) -> list[dict]:
        raise NotImplementedError

    def one(self, table: str, **where) -> dict | None:
        found = self.rows(table, **where)
        return found[0] if found else None

    def count(self, table: str, **where) -> int:
        return len(self.rows(table, **where))


class PostgresBackend(Backend):
    """Postgres behind the capability contract.

    A connection is opened per call rather than pooled. Grading is not
    throughput-bound, and a per-call connection cannot go stale between a
    session-scoped fixture and the check that uses it an hour later.
    """

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    def _connect(self):
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:  # pragma: no cover - image misbuild
            raise InfrastructureUnavailable(
                "psycopg is not installed in the verifier image; the database "
                "cannot be read") from exc
        try:
            return psycopg.connect(self._dsn, row_factory=dict_row,
                                   connect_timeout=int(TIMEOUT_SECONDS))
        except Exception as exc:
            raise InfrastructureUnavailable(
                "could not reach the database at %s: %s"
                % (_redact(self._dsn), exc)) from exc

    def query(self, sql: str, params=None) -> list[dict]:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(sql, params)
            if cursor.description is None:
                return []
            return [dict(row) for row in cursor.fetchall()]

    def rows(self, table: str, **where) -> list[dict]:
        from psycopg import sql as pgsql

        statement = pgsql.SQL("SELECT * FROM {}").format(pgsql.Identifier(table))
        values: list = []
        if where:
            clauses = []
            for column, value in where.items():
                clauses.append(pgsql.SQL("{} = %s").format(pgsql.Identifier(column)))
                values.append(value)
            statement = statement + pgsql.SQL(" WHERE ") + pgsql.SQL(" AND ").join(clauses)

        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(statement, values or None)
            return [dict(row) for row in cursor.fetchall()]

    def count(self, table: str, **where) -> int:
        from psycopg import sql as pgsql

        statement = pgsql.SQL("SELECT count(*) AS n FROM {}").format(
            pgsql.Identifier(table))
        values: list = []
        if where:
            clauses = []
            for column, value in where.items():
                clauses.append(pgsql.SQL("{} = %s").format(pgsql.Identifier(column)))
                values.append(value)
            statement = statement + pgsql.SQL(" WHERE ") + pgsql.SQL(" AND ").join(clauses)

        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(statement, values or None)
            found = cursor.fetchone()
            return int(found["n"]) if found else 0


def _redact(dsn: str) -> str:
    """The DSN with its password removed, safe to put in a failure message."""
    if "@" not in dsn:
        return dsn
    head, _, tail = dsn.rpartition("@")
    scheme, _, credentials = head.partition("://")
    user = credentials.split(":", 1)[0]
    return "%s://%s:***@%s" % (scheme, user, tail)


def make_backend() -> Backend:
    for variable in DB_VARS:
        dsn = os.environ.get(variable)
        if dsn:
            return PostgresBackend(dsn)
    raise InfrastructureUnavailable(
        "none of %s is set; the grading session cannot read the database it is "
        "meant to observe" % ", ".join(DB_VARS))


@dataclass(frozen=True)
class Message:
    subject: str
    to: list[str] = field(default_factory=list)
    body: str = ""


class MailpitInbox:
    """Delivered mail, read through Mailpit's message API."""

    def __init__(self, base_url: str) -> None:
        self._base = base_url.rstrip("/")

    def _get(self, path: str, **params):
        try:
            response = httpx.get(self._base + path, params=params or None,
                                 timeout=TIMEOUT_SECONDS)
        except httpx.HTTPError as exc:
            raise InfrastructureUnavailable(
                "could not reach the inbox at %s: %s" % (self._base, exc)) from exc
        if response.status_code != 200:
            raise InfrastructureUnavailable(
                "the inbox at %s answered %s for %s"
                % (self._base, response.status_code, path))
        return response.json()

    def _messages(self) -> list[dict]:
        payload = self._get("/api/v1/messages", limit=INBOX_PAGE)
        if isinstance(payload, dict):
            return list(payload.get("messages") or [])
        return list(payload or [])

    @staticmethod
    def _recipients(message: dict) -> list[str]:
        addresses = []
        for entry in message.get("To") or []:
            if isinstance(entry, dict):
                address = entry.get("Address") or entry.get("address")
            else:
                address = entry
            if address:
                addresses.append(str(address))
        return addresses

    def count(self, address: str | None = None) -> int:
        messages = self._messages()
        if address is None:
            return len(messages)
        wanted = address.lower()
        return sum(1 for message in messages
                   if wanted in [one.lower() for one in self._recipients(message)])

    def find(self, address: str, subject_prefix: str = "") -> Message | None:
        wanted = address.lower()
        for message in self._messages():
            recipients = self._recipients(message)
            if wanted not in [one.lower() for one in recipients]:
                continue
            subject = str(message.get("Subject") or "")
            if subject_prefix and not subject.startswith(subject_prefix):
                continue
            return Message(subject=subject, to=recipients,
                           body=self._body(message.get("ID")))
        return None

    def _body(self, message_id) -> str:
        if not message_id:
            return ""
        payload = self._get("/api/v1/message/%s" % message_id)
        return str(payload.get("Text") or payload.get("HTML") or "")


def make_inbox() -> MailpitInbox:
    base = os.environ.get(INBOX_VAR)
    if not base:
        raise InfrastructureUnavailable(
            "%s is not set; delivered mail cannot be read" % INBOX_VAR)
    return MailpitInbox(base)


@dataclass(frozen=True)
class Charge:
    """One invoice, with its amount in minor units.

    The billing platform reports a decimal; the checks compare against the minor
    units the order stored, so the conversion happens once, here.
    """
    amount: int
    currency: str


class KillbillPayments:
    """The billing platform, read through Kill Bill's admin API."""

    def __init__(self, base_url: str, api_key: str, api_secret: str,
                 admin_user: str, admin_password: str) -> None:
        self._base = base_url.rstrip("/")
        self._headers = {"X-Killbill-ApiKey": api_key,
                         "X-Killbill-ApiSecret": api_secret}
        self._auth = (admin_user, admin_password)

    def _get(self, path: str, **params) -> list[dict]:
        try:
            response = httpx.get(self._base + path, params=params or None,
                                 headers=self._headers, auth=self._auth,
                                 timeout=TIMEOUT_SECONDS)
        except httpx.HTTPError as exc:
            raise InfrastructureUnavailable(
                "could not reach the billing platform at %s: %s"
                % (self._base, exc)) from exc
        if response.status_code == 404:
            return []
        if response.status_code != 200:
            raise InfrastructureUnavailable(
                "the billing platform at %s answered %s for %s"
                % (self._base, response.status_code, path))
        payload = response.json()
        return list(payload or []) if isinstance(payload, list) else []

    def accounts(self) -> list[dict]:
        return self._get("/1.0/kb/accounts/pagination", limit=PAYMENTS_PAGE)

    def charges(self) -> list[Charge]:
        """Every invoice on the platform, with its real total.

        Read per account rather than from /invoices/pagination: that endpoint
        reports amount 0.00 for an externally charged invoice even with
        withItems=true, so a charge raised for 415.80 reads back as nothing and
        a correct app fails. The components have to be asked for by name.
        """
        found = []
        for account in self.accounts():
            account_id = account.get("accountId")
            if not account_id:
                continue
            invoices = self._get("/1.0/kb/accounts/%s/invoices" % account_id,
                                 includeInvoiceComponents="true")
            for invoice in invoices:
                amount = invoice.get("amount")
                if amount is None:
                    continue
                found.append(Charge(amount=_to_minor(amount),
                                    currency=str(invoice.get("currency") or "")))
        return found

    def find_charge(self, amount_minor: int, currency: str) -> Charge | None:
        wanted = str(currency).upper()
        for charge in self.charges():
            if charge.amount == int(amount_minor) and charge.currency.upper() == wanted:
                return charge
        return None


def _to_minor(amount) -> int:
    return int((Decimal(str(amount)) * MINOR_UNITS).to_integral_value())


def make_payments() -> KillbillPayments:
    base = os.environ.get(PAYMENTS_URL_VAR)
    if not base:
        raise InfrastructureUnavailable(
            "%s is not set; the billing platform cannot be read" % PAYMENTS_URL_VAR)
    return KillbillPayments(
        base,
        os.environ.get("PAYMENTS_API_KEY", ""),
        os.environ.get("PAYMENTS_API_SECRET", ""),
        os.environ.get("PAYMENTS_ADMIN_USER", ""),
        os.environ.get("PAYMENTS_ADMIN_PASSWORD", ""))
