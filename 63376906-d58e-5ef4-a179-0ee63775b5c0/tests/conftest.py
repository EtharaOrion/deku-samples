"""Fixtures, pinned literals and stores for the mass-balance-attestation graders.

Every value a grader asserts against is pinned here and appears verbatim in
instruction.md (G6). Nothing here probes the app to decide what to assert: the
expectations come from the brief, not from the implementation.

Masses are integer grams, proportions are integer basis points where 10000 is one
hundred per cent, carbon is integer milligrams of carbon dioxide equivalent per
kilogram, and energy is integer kilowatt hours. Every seeded answer is therefore
derived by exact integer arithmetic and no assertion compares floats.
"""

from __future__ import annotations

import os
import time
import uuid

import pytest

import appclient
import capabilities

SEED_PASSWORD = "deku-demo-pw-2026"

PLANT_EMAIL = "plant@example.com"
ANALYST_EMAIL = "analyst@example.com"
QUALITY_EMAIL = "quality@example.com"
CLAIMS_EMAIL = "claims@example.com"
SIGNER_EMAIL = "signer@example.com"
SIGNER2_EMAIL = "signer2@example.com"
AUDITOR_EMAIL = "auditor@example.com"

SEEDED_EMAILS = [
    PLANT_EMAIL,
    ANALYST_EMAIL,
    QUALITY_EMAIL,
    CLAIMS_EMAIL,
    SIGNER_EMAIL,
    SIGNER2_EMAIL,
    AUDITOR_EMAIL,
]

ROLE_OF = {
    PLANT_EMAIL: "plant_operator",
    ANALYST_EMAIL: "lab_analyst",
    QUALITY_EMAIL: "quality_manager",
    CLAIMS_EMAIL: "claims_manager",
    SIGNER_EMAIL: "certificate_signer",
    SIGNER2_EMAIL: "certificate_signer",
    AUDITOR_EMAIL: "auditor",
}

GRANT_ENDS = "2027-06-30"

STATUS_OK = (200, 201)
STATUS_DENIED = (401, 403)
STATUS_REFUSED = (400, 403, 404, 409, 422)
STATUS_CONFLICT = (409, 422)
STATUS_NOT_VISIBLE = (401, 403, 404)

BASIS_POINTS_FULL = 10000

SITE_PILOT = "SITE-PILOT"
SITE_DEMO = "SITE-DEMO"
SITE_COMM = "SITE-COMM"
SITES = (SITE_PILOT, SITE_DEMO, SITE_COMM)

CONFIDENCE_COMMISSIONED = "commissioned"
CONFIDENCE_PLANNED = "planned"
CONFIDENCES = ("commissioned", "under_construction", "consented", "planned")

NAMEPLATE = {SITE_PILOT: 40000, SITE_DEMO: 400000, SITE_COMM: 25000000}
CONTRACTED = {SITE_PILOT: 24000, SITE_DEMO: 320000, SITE_COMM: 26000000}
CAPACITY_BASIS = "8000 hours per year, 0.90 availability, 0.80 yield"
CAPACITY_REVISED = "2026-06-30"

COL_ALDER = "COL-ALDER"
COL_BRINE = "COL-BRINE"
COL_CINDER = "COL-CINDER"
COLLECTORS = (COL_ALDER, COL_BRINE, COL_CINDER)
COLLECTOR_COUNTRY = {COL_ALDER: "PT", COL_BRINE: "NL", COL_CINDER: "FR"}
COLLECTOR_REGISTRATION = {
    COL_ALDER: "WCR-PT-4471",
    COL_BRINE: "WCR-NL-2208",
    COL_CINDER: "WCR-FR-6613",
}
APPROVAL_STATES = ("approved", "conditional", "suspended", "lapsed")
CINDER_CONDITION_CLOSES = "2026-10-31"

DEVICE_GOOD = "WB-DEMO-01"
DEVICE_LAPSED = "WB-DEMO-02"
DEVICE_CALIBRATED = {DEVICE_GOOD: "2026-05-01", DEVICE_LAPSED: "2025-02-01"}
FLAG_LAPSED_CALIBRATION = "lapsed_calibration"

POST_CONSUMER = "post_consumer"
PRE_CONSUMER = "pre_consumer"
CATEGORIES = (POST_CONSUMER, PRE_CONSUMER)

BATCH_1001 = "BATCH-1001"
BATCH_1002 = "BATCH-1002"
BATCH_1003 = "BATCH-1003"
BATCH_1004 = "BATCH-1004"
BATCH_1005 = "BATCH-1005"

SEEDED_BATCHES = {
    BATCH_1001: {"collector": COL_ALDER, "category": POST_CONSUMER,
                 "received_on": "2026-02-10", "net_g": 500000, "moisture_bp": 1000,
                 "device": DEVICE_GOOD, "dry_mass_g": 450000, "claimable": True},
    BATCH_1002: {"collector": COL_ALDER, "category": PRE_CONSUMER,
                 "received_on": "2026-02-12", "net_g": 300000, "moisture_bp": 0,
                 "device": DEVICE_GOOD, "dry_mass_g": 300000, "claimable": True},
    BATCH_1003: {"collector": COL_BRINE, "category": POST_CONSUMER,
                 "received_on": "2026-07-05", "net_g": 200000, "moisture_bp": 500,
                 "device": DEVICE_GOOD, "dry_mass_g": 190000, "claimable": False},
    BATCH_1004: {"collector": COL_CINDER, "category": PRE_CONSUMER,
                 "received_on": "2026-02-20", "net_g": 120000, "moisture_bp": 0,
                 "device": DEVICE_LAPSED, "dry_mass_g": 120000, "claimable": True},
    BATCH_1005: {"collector": COL_ALDER, "category": POST_CONSUMER,
                 "received_on": "2026-03-02", "net_g": 100000, "moisture_bp": 0,
                 "device": DEVICE_GOOD, "dry_mass_g": 100000, "claimable": False},
}

CUSTODY_KINDS = ("collection_site", "collector", "transport", "arrival", "weighing",
                 "acceptance")
MISSING_LINK_ON_1005 = "transport"

COMPOSITION_BASES = ("declared", "sampled", "assayed")
BATCH_1001_POLYMER = "PA6"
BATCH_1001_FRACTION_BP = 9200
BATCH_1004_DECLARED_BP = 9900
BATCH_1004_MEASURED_BP = 9100
DECLARATION_TOLERANCE_BP = 500

RUN_TYPES = ("dissolution", "depolymerisation", "purification", "repolymerisation")
RUN_D1 = "RUN-D-0001"
RUN_D2 = "RUN-D-0002"
RUN_D3 = "RUN-D-0003"
RUN_Y1 = "RUN-Y-0001"
RUN_U1 = "RUN-U-0001"
RUN_R1 = "RUN-R-0001"

RECIPE_DISS = "RCP-DISS-2"
RECIPE_DEPO = "RCP-DEPO-4"
RECIPE_PURI = "RCP-PURI-1"
RECIPE_REPO = "RCP-REPO-3"

SEEDED_RUNS = {
    RUN_D1: {"run_type": "dissolution", "recipe_version": RECIPE_DISS,
             "consumes": {BATCH_1001: 300000, BATCH_1002: 300000}, "losses_g": 120000},
    RUN_D2: {"run_type": "dissolution", "recipe_version": RECIPE_DISS,
             "consumes": {BATCH_1003: 190000, BATCH_1004: 120000}, "losses_g": 60000},
    RUN_D3: {"run_type": "dissolution", "recipe_version": RECIPE_DISS,
             "consumes": {BATCH_1001: 150000}, "losses_g": 30000},
    RUN_Y1: {"run_type": "depolymerisation", "recipe_version": RECIPE_DEPO,
             "consumes": {"OUT-D-0001": 480000, "OUT-D-0002": 250000,
                          "OUT-D-0003": 120000}, "losses_g": 50000},
    RUN_U1: {"run_type": "purification", "recipe_version": RECIPE_PURI,
             "consumes": {"OUT-Y-0001": 800000}, "losses_g": 40000},
    RUN_R1: {"run_type": "repolymerisation", "recipe_version": RECIPE_REPO,
             "consumes": {"OUT-U-0001": 720000}, "losses_g": 20000},
}

OUTPUT_KINDS = ("intermediate", "lot", "byproduct")
BYPRODUCT_DISPOSITIONS = ("sold", "disposed")
SEEDED_OUTPUTS = {
    "OUT-D-0001": {"run": RUN_D1, "kind": "intermediate", "mass_g": 480000},
    "OUT-D-0002": {"run": RUN_D2, "kind": "intermediate", "mass_g": 250000},
    "OUT-D-0003": {"run": RUN_D3, "kind": "intermediate", "mass_g": 120000},
    "OUT-Y-0001": {"run": RUN_Y1, "kind": "intermediate", "mass_g": 800000},
    "OUT-U-0001": {"run": RUN_U1, "kind": "intermediate", "mass_g": 720000},
    "OUT-U-0002": {"run": RUN_U1, "kind": "byproduct", "mass_g": 40000},
    "LOT-N6-0001": {"run": RUN_R1, "kind": "lot", "mass_g": 400000},
    "LOT-N6-0002": {"run": RUN_R1, "kind": "lot", "mass_g": 300000},
}
BYPRODUCT_SOLD = "OUT-U-0002"

LOT_1 = "LOT-N6-0001"
LOT_2 = "LOT-N6-0002"
LOT_3 = "LOT-N6-0003"
GRADE_N6 = "N6"
DISPOSITIONS = ("pending", "released", "quarantined", "rejected")
SEEDED_LOTS = {
    LOT_1: {"grade": GRADE_N6, "site": SITE_DEMO, "mass_g": 400000,
            "disposition": "released"},
    LOT_2: {"grade": GRADE_N6, "site": SITE_DEMO, "mass_g": 300000,
            "disposition": "quarantined"},
    LOT_3: {"grade": GRADE_N6, "site": SITE_PILOT, "mass_g": 200000,
            "disposition": "released"},
}

DEVIATION_OPEN = "DEV-0001"
DEVIATION_CLOSED = "DEV-0002"
DEVIATION_OUTCOMES = ("root_cause_found", "cause_not_established")

OVERRIDE = "OVR-0001"
OVERRIDE_SEPARATION = "analyst_not_dispositioner"
OVERRIDE_AUTHORISED_ON = "2026-03-18"
OVERRIDE_REASON_FLOOR = 40

FACTOR_DEMO = "CF-DEMO-1"
FACTOR_PILOT = "CF-PILOT-1"
FACTOR_DEMO_BP = 8000
FACTOR_PILOT_BP = 7500
FACTOR_DEMO_FROM = "2026-01-01"
FACTOR_DEMO_TO = "2026-03-31"

PERIOD_CLOSED = "BP-DEMO-N6-2025H2"
PERIOD_OPEN = "BP-DEMO-N6-2026H1"
PERIOD_PILOT = "BP-PILOT-N6-2026H1"
CARRY_OVER_LIMIT_BP = 2000
PERIOD_CLOSED_ON = "2026-01-15"
PERIOD_CUT_OFF = "2026-01-10"

CREDIT_POST_IN_G = 360000
CREDIT_PRE_IN_G = 336000
NON_CLAIMABLE_INPUT_G = 190000
OVERRIDE_COUNT = 1
CONTENT_AFTER_FULL_ALLOCATION_BP = 9000

METHOD = "CM-PA6"
METHOD_VERSION = "2"
METHOD_STANDARD = "ISO 14067"
METHOD_FUNCTIONAL_UNIT = "1 kg of pellet"
METHOD_BOUNDARY = "cradle-to-gate"
METHOD_REVIEWER = "Ilse Grootveld"
METHOD_PUBLISHED_ON = "2026-01-20"

CARBON_VALUE = 4260000
CARBON_UNCERTAINTY_BP = 1200
CARBON_PRIMARY_SHARE_BP = 6500
PRIMARY_THRESHOLD_BP = 5000
COMPARATOR_MATERIAL = "virgin PA6"
COMPARATOR_DATASET = "EcoBase 2025"
COMPARATOR_REGION = "EU-27"
DATA_TAGS = ("primary", "supplier_specific", "secondary")
CARBON_BREAKDOWN = {
    "collection_and_transport": 310000,
    "process_energy": 1850000,
    "reagents": 1180000,
    "water_and_effluent": 240000,
    "waste_and_residues": 330000,
    "outbound_transport": 410000,
    "byproduct_credit": -60000,
}
ENERGY_LOCATION = 1850000
ENERGY_MARKET = 620000
METERED_KWH = 300000
INSTRUMENT_RETIRED = "EAC-2026-0007"
INSTRUMENT_HELD = "EAC-2025-0031"
INSTRUMENT_RETIRED_KWH = 250000
UNMATCHED_KWH = 50000

ALLOCATION_BASES = ("mass", "energy", "economic")
ALLOCATION_BASIS = "mass"

SPEC = "SPEC-N6"
SPEC_VERSION = "3"
SPEC_PRIOR_VERSION = "2"
SPEC_ISSUED_ON = "2026-02-01"
SPEC_BASES = ("guaranteed", "typical", "informational")
SPEC_ROWS = {
    "relative_viscosity": {"method": "ISO 307", "limit": "2.40", "unit": "ratio",
                           "basis": "guaranteed"},
    "moisture": {"method": "ISO 15512", "limit": "0.10", "unit": "percent",
                 "basis": "guaranteed"},
    "yellowness_index": {"method": "ASTM E313", "limit": "8.0", "unit": "index",
                         "basis": "typical"},
    "ash_content": {"method": "ISO 3451-1", "limit": "0.30", "unit": "percent",
                    "basis": "informational"},
}
VIRGIN_REFERENCE = "virgin PA6 at relative viscosity 2.42"

CUS_HELIOS = "CUS-HELIOS"
CUS_VANTA = "CUS-VANTA"
CUSTOMER_EMAIL = {CUS_HELIOS: "helios@example.com", CUS_VANTA: "vanta@example.com"}
CUSTOMER_HOLDS = {CUS_HELIOS: SPEC_VERSION, CUS_VANTA: SPEC_PRIOR_VERSION}
VANTA_APPLICATION = "airbag fabric"
VANTA_INDUSTRY = "automotive"

CONTRACT_HELIOS = "CON-HELIOS-1"
CONTRACT_VANTA = "CON-VANTA-1"
CONTRACT_HELIOS_COMMITTED_KG = 200
CONTRACT_HELIOS_FLOOR_BP = 5000
CONTRACT_VANTA_CONSEQUENCE = "a make-good volume in the following period"
PROJECTION_STATES = ("on_track", "unreachable")

CLAIM_TYPES = ("physically_segregated", "controlled_blending", "mass_balance")
CLAIM_MASS_BALANCE = "mass_balance"

CERT_WITHDRAWN = "CERT-PILOT-000001"
CERT_ISSUED = "CERT-PILOT-000002"
CERT_FIRST_DEMO = "CERT-DEMO-000001"
CERT_UNKNOWN = "CERT-DEMO-999999"
CERT_WITHDRAWN_ON = "2026-04-18"
CERT_WITHDRAWN_REASON = "A collector category was corrected after acceptance"
SCHEME = "RCS-2026"
REGISTRATION = "REG-RAVEL-0042"
HOST = "ravel.example.com"

RESOLUTION_OUTCOMES = ("reissued", "withdrawn", "unaffected")

ZERO_DIGEST = "0" * 64

STAT_TEXTILES = "textiles_recycled"
STAT_EMISSIONS = "plastics_emissions"
STAT_INCINERATION = "textile_incineration"
STAT_SOURCE = {STAT_TEXTILES: "Textile Flow Monitor",
               STAT_EMISSIONS: "Global Materials Emissions Panel",
               STAT_INCINERATION: "Textile Flow Monitor"}
STAT_YEAR = {STAT_TEXTILES: "2024", STAT_EMISSIONS: "2023",
             STAT_INCINERATION: "2024"}
STAT_GEOGRAPHY = {STAT_TEXTILES: "Global", STAT_EMISSIONS: "Global",
                  STAT_INCINERATION: "EU-27"}

POSITION_TITLE = "Process Engineer"
POSITION_LOCATION = "Lyon, France"
POSITION_CLOSES = "2026-11-30"
POSITION_COUNT = 1
NEWS_TAGS = ("funding", "partnership", "technical", "recognition")
NEWS_COUNT = 3
NEWS_FRENCH_LANGUAGE = "fr"

ENQUIRY_TYPES = ("waste_supply", "polymer_purchase", "partnership", "press")
ENQUIRY_DESTINATION = {
    "waste_supply": "feedstock@example.com",
    "polymer_purchase": "sales@example.com",
    "partnership": "partners@example.com",
    "press": "press@example.com",
}
ENQUIRY_RESPONSE_DAYS = {"waste_supply": 3, "polymer_purchase": 2,
                         "partnership": 5, "press": 1}

CONTROLLER = "Ravel Materials SAS"
PRIVACY_ADDRESS = "privacy@example.com"
DISCLOSURE_ADDRESS = "security@example.com"
RECORD_RETENTION_MONTHS = 180

REFERENCE_DARK = "#301f00"
REFERENCE_GROUND = "#f9f5f1"
REFERENCE_ACCENT = "#2a4b22"
REFERENCE_EDITORIAL = "#b68ecb"
REFERENCE_GREY = "#898d8f"
REFERENCE_PALETTE = (REFERENCE_DARK, REFERENCE_GROUND, REFERENCE_ACCENT,
                     REFERENCE_EDITORIAL, REFERENCE_GREY)
BANNED_COLOURS = ("#2d62ff", "#dd23bb", "#fcf8d8", "#cef5ca", "#114e0b",
                  "#f8e4e4", "#3b0b0b", "#5e5515", "#0000")
MAX_COLOUR_LITERALS = 8
COLOUR_ROLES = ("ink", "ground", "paper", "muted", "accent", "highlight")

TYPE_SCALE = {
    "h1": ("5rem", "6rem"),
    "h2": ("4rem", "4.5rem"),
    "h3": ("3rem", "3.5rem"),
    "h4": ("1.625rem", "1.8125rem"),
    "body-big": ("1.375rem", "1.8125rem"),
    "body-regular": ("1.125rem", "1.5rem"),
    "body-small": ("1rem", "1.5rem"),
    "eyebrow": ("0.875rem", "1.125rem"),
}
ABSENT_DISPLAY_STEPS = ("12.75rem", "8.875rem")

BUDGET_PUBLIC = 220000
BUDGET_CONSOLE = 320000
BUDGET_BALANCE = 360000
BUDGET_FONTS = 140000

HOME_HEADLINE = "Tomorrow's materials. Made from today's waste."
PRODUCT_HEADLINE = "Same material. Better origin."
TECH_HEADLINE = "The power of green chemistry"
LOOP_HEADLINE = "We're closing the loop"
FEEDSTOCK_HEADING = "Nylon in any form"
CAPACITY_COMMERCIAL = ">25,000 tonnes per year"
LOSSES_LINE = "Losses reduce the claim."
CLOSED_PERIOD_LINE = "This period is closed. Corrections require a restatement."

PUBLIC_ROUTES = ("/", "/product", "/technology", "/about", "/careers", "/news",
                 "/contact", "/privacy")
WIZARD_ROUTES = ("/console/certificates/new/lot",
                 "/console/certificates/new/claim",
                 "/console/certificates/new/recipient",
                 "/console/certificates/new/review")
CONSOLE_ROUTES = ("/console", "/console/intake", "/console/certificates",
                  "/console/reconciliation", "/console/record")

DATABASE_VAR = "DATABASE_URL"
AUTH_ISSUER_VAR = "AUTH_ISSUER_URL"
AUTH_CLIENT_ID_VAR = "AUTH_CLIENT_ID"
AUTH_CLIENT_SECRET_VAR = "AUTH_CLIENT_SECRET"
SMTP_HOST_VAR = "SMTP_HOST"
SMTP_PORT_VAR = "SMTP_PORT"
HEALTH_PATH = "/health"
CONTAINER_PORT = "4173"

SUBJECT_ISSUED = "Certificate {number} issued"
SUBJECT_WITHDRAWN = "Certificate {number} withdrawn"
SUBJECT_CHANGE = "Change notice {reference} requires acknowledgement"
SUBJECT_ENQUIRY = "Enquiry {reference} received"

SOURCE_WEIGHBRIDGE = "weighbridge"
SOURCE_CONTROL = "control_system"
SOURCE_LABORATORY = "laboratory"
SOURCE_CUSTOMER = "customer_reporting"
INBOUND_SOURCES = (SOURCE_WEIGHBRIDGE, SOURCE_CONTROL, SOURCE_LABORATORY,
                   SOURCE_CUSTOMER)
SEEDED_INBOUND = {
    SOURCE_WEIGHBRIDGE: "2026-02-20T06:14:00Z",
    SOURCE_CONTROL: "2026-03-04T22:41:00Z",
    SOURCE_LABORATORY: "2026-03-06T09:02:00Z",
}

QUERY_EXPORTS = "exports_by_auditor"
RECORD_QUERIES = (
    "lots_from_batch",
    "certificates_on_period",
    "certificates_under_method_version",
    "lots_released_under_unreviewed_override",
    "allocations_in_final_fortnight",
    "refused_allocations",
    "collector_declaration_departures",
    "acts_by_person",
    QUERY_EXPORTS,
)

SCHEME_RETENTION_MONTHS = 120
STATUTORY_RETENTION_MONTHS = 84
LEGAL_HOLD = "HLD-0001"

SEEDED_PARTY_VERSIONS = {
    "Brine Textile Recovery": "2026-01-01",
    "Brine Circular Materials": "2026-08-01",
}
BRINE_NAME_AT_RECEIPT = "Brine Textile Recovery"

TRANSFER = "TRF-0001"
TRANSFER_MASS_G = 50000
TRANSFER_ON = "2026-05-12"

FLOOR_NET_G = 12345
FLOOR_MOISTURE_BP = 5000
FLOOR_DRY_G = 6172
FLOOR_CLAIM_G = 200000
FLOOR_CONTENT_BP = 6666

FACTOR_DEMO_IN_G = 1000000
FACTOR_DEMO_OUT_G = 800000

LOT_3_CONTENT_BP = 7500
BLEND_MASS_G = 600000
BLEND_CONTENT_BP = 8500
RUN_U1_OUTPUT_G = 760000
BYPRODUCT_SHARE_BP = 526

IDEMPOTENCY_REUSE = "idempotency_key_reuse"
PAGINATION_PARAMS = ("page", "limit", "offset", "cursor")

SETTLE_SECONDS = 3.0


def settle() -> None:
    """The one sanctioned wait (G31). Lets an already-issued write land before a
    negative assertion claims the write never will."""
    time.sleep(SETTLE_SECONDS)


def unique_suffix() -> str:
    return uuid.uuid4().hex[:10]


PROBE_DOMAIN = "example.com"


def probe_email() -> str:
    return "probe-%s@%s" % (unique_suffix(), PROBE_DOMAIN)


def api(path: str) -> str:
    return "%s%s" % (appclient.api_base(), path)


def describe(response) -> str:
    return "%s: %s" % (response.status_code, response.text[:300])


def idem() -> dict:
    return {"Idempotency-Key": "probe-%s" % unique_suffix()}


@pytest.fixture(scope="session")
def db():
    dsn = os.environ.get("DB_ADMIN_URL") or os.environ.get(DATABASE_VAR)
    if not dsn:
        raise capabilities.InfrastructureUnavailable(
            "neither DB_ADMIN_URL nor DATABASE_URL is set; the grading session "
            "cannot read the database it is meant to observe")
    return capabilities.PostgresBackend(dsn)


@pytest.fixture(scope="session")
def inbox():
    if not os.environ.get("EMAIL_INBOX_API_URL"):
        raise capabilities.InfrastructureUnavailable(
            "EMAIL_INBOX_API_URL is not set; delivered mail cannot be read")
    return capabilities.make_inbox()


@pytest.fixture()
def anon():
    with appclient.client() as client:
        yield client


@pytest.fixture(scope="session")
def plant_token() -> str:
    return appclient.login(PLANT_EMAIL, SEED_PASSWORD)


@pytest.fixture(scope="session")
def analyst_token() -> str:
    return appclient.login(ANALYST_EMAIL, SEED_PASSWORD)


@pytest.fixture(scope="session")
def quality_token() -> str:
    return appclient.login(QUALITY_EMAIL, SEED_PASSWORD)


@pytest.fixture(scope="session")
def claims_token() -> str:
    return appclient.login(CLAIMS_EMAIL, SEED_PASSWORD)


@pytest.fixture(scope="session")
def signer_token() -> str:
    return appclient.login(SIGNER_EMAIL, SEED_PASSWORD)


@pytest.fixture(scope="session")
def signer2_token() -> str:
    return appclient.login(SIGNER2_EMAIL, SEED_PASSWORD)


@pytest.fixture(scope="session")
def auditor_token() -> str:
    return appclient.login(AUDITOR_EMAIL, SEED_PASSWORD)


@pytest.fixture()
def plant(plant_token):
    with appclient.client(plant_token) as client:
        yield client


@pytest.fixture()
def analyst(analyst_token):
    with appclient.client(analyst_token) as client:
        yield client


@pytest.fixture()
def quality(quality_token):
    with appclient.client(quality_token) as client:
        yield client


@pytest.fixture()
def claims(claims_token):
    with appclient.client(claims_token) as client:
        yield client


@pytest.fixture()
def signer(signer_token):
    with appclient.client(signer_token) as client:
        yield client


@pytest.fixture()
def signer2(signer2_token):
    with appclient.client(signer2_token) as client:
        yield client


@pytest.fixture()
def auditor(auditor_token):
    with appclient.client(auditor_token) as client:
        yield client


def get_json(client, path: str, params: dict | None = None):
    response = client.get(api(path), params=params or {})
    assert response.status_code == 200, (
        "GET /api%s params=%r returned %s" % (path, params or {}, describe(response)))
    return response.json()


def as_list(body, path: str) -> list:
    assert isinstance(body, list), (
        "GET /api%s must return a top-level JSON array, got %s"
        % (path, type(body).__name__))
    return body


def as_object(body, path: str) -> dict:
    assert isinstance(body, dict), (
        "GET /api%s must return one JSON object, got %s" % (path, type(body).__name__))
    return body


def index(rows: list, key: str = "reference") -> dict:
    return {str(row.get(key)): row for row in rows}


def field(row: dict, name: str, where: str):
    assert name in row, "%s carries no %r field: %.300r" % (where, name, row)
    return row[name]


def integer(row: dict, name: str, where: str) -> int:
    value = field(row, name, where)
    assert isinstance(value, int) and not isinstance(value, bool), (
        "%s must carry %r as an integer, got %r" % (where, name, value))
    return value


def collection(client, path: str, key: str = "reference") -> dict:
    return index(as_list(get_json(client, path), path), key)


def batches(client) -> dict:
    return collection(client, "/batches")


def lots(client) -> dict:
    return collection(client, "/lots")


def runs(client) -> dict:
    return collection(client, "/runs")


def sites(client) -> dict:
    return collection(client, "/sites")


def collectors(client) -> dict:
    return collection(client, "/collectors")


def certificates(client) -> dict:
    return collection(client, "/certificates", key="number")


def period(client, ident: str = PERIOD_OPEN) -> dict:
    return as_object(get_json(client, "/balance-periods/%s" % ident),
                     "/balance-periods/%s" % ident)


def genealogy(client, lot: str = LOT_1) -> dict:
    path = "/lots/%s/genealogy" % lot
    return as_object(get_json(client, path), path)


def carbon(client, lot: str = LOT_1) -> dict:
    path = "/lots/%s/carbon" % lot
    return as_object(get_json(client, path), path)


def allocate(client, mass_g: int, category: str = POST_CONSUMER, lot: str = LOT_1,
             ident: str = PERIOD_OPEN):
    return client.post(api("/balance-periods/%s/allocations" % ident),
                       json={"lot": lot, "category": category, "mass_g": mass_g},
                       headers=idem())


def preview(client, lot: str = LOT_1, recipient: str = CUS_HELIOS):
    return client.post(api("/certificates/preview"),
                       json={"lot": lot, "recipient": recipient}, headers=idem())


def conditions_of(body) -> list:
    entries = body.get("conditions")
    assert isinstance(entries, list), (
        "the preview must carry a conditions list, got %.300r" % (body,))
    return entries


def wait_for_mail(inbox_backend, address: str, subject_contains: str):
    """Bounded poll for one delivered message. SMTP delivery is asynchronous, so a
    negative assertion made immediately after a write would be about timing."""
    for _ in range(6):
        found = inbox_backend.find(address, subject_contains)
        if found is not None:
            return found
        settle()
    return None


def book_batch(client, category: str = POST_CONSUMER, net_g: int = 100000,
               moisture_bp: int = 0, device: str = DEVICE_GOOD,
               collector: str = COL_ALDER, received_on: str = "2026-03-10",
               headers: dict | None = None):
    payload = {
        "collector": collector,
        "site": SITE_DEMO,
        "category": category,
        "gross_g": net_g + 20000,
        "tare_g": 20000,
        "net_g": net_g,
        "moisture_bp": moisture_bp,
        "moisture_method": "ISO 15512",
        "device": device,
        "received_on": received_on,
        "composition": {"polymer": BATCH_1001_POLYMER,
                        "fraction_bp": BATCH_1001_FRACTION_BP, "basis": "sampled"},
        "contamination": {"non_nylon_bp": 800, "elastane_bp": 400, "coatings": "none",
                          "colour_load": "mixed", "foreign_matter": "none"},
        "custody": [{"kind": k, "on": received_on, "party": collector}
                    for k in CUSTODY_KINDS],
    }
    return client.post(api("/batches"), json=payload, headers=headers or idem())
