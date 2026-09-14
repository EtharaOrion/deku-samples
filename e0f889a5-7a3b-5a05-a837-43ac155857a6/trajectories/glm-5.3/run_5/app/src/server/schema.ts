// Generated from schema.sql. Do not edit by hand; edit schema.sql and run npm run gen:schema.
export const SCHEMA_SQL = `-- Vela storefront schema. All timestamps UTC.

CREATE TABLE IF NOT EXISTS customer (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL,
  email_folded  TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  handle        TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  subtitle      TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('camera','accessory','spare','protection')),
  status        TEXT NOT NULL CHECK (status IN ('active','discontinued')),
  support_until DATE,
  position      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS variant (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id       BIGINT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  sku              TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  option_value     TEXT NOT NULL,
  price_minor      BIGINT NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  position         INTEGER NOT NULL DEFAULT 0,
  inventory_policy TEXT NOT NULL DEFAULT 'deny' CHECK (inventory_policy IN ('deny','continue'))
);

CREATE TABLE IF NOT EXISTS inventory_level (
  variant_id BIGINT PRIMARY KEY REFERENCES variant(id) ON DELETE CASCADE,
  available  INTEGER NOT NULL DEFAULT 0 CHECK (available >= 0),
  committed  INTEGER NOT NULL DEFAULT 0 CHECK (committed >= 0)
);

CREATE TABLE IF NOT EXISTS product_block (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('lede','spec_group','in_the_box','compatibility','support_note')),
  position   INTEGER NOT NULL DEFAULT 0,
  payload    JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS cart (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,
  customer_id BIGINT REFERENCES customer(id) ON DELETE SET NULL,
  email       TEXT,
  shipping_address JSONB,
  shipping_method TEXT,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  protection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE TABLE IF NOT EXISTS cart_line (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cart_id          BIGINT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  variant_id       BIGINT NOT NULL REFERENCES variant(id) ON DELETE CASCADE,
  quantity         INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_minor BIGINT NOT NULL,
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE IF NOT EXISTS "order" (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  customer_id BIGINT REFERENCES customer(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  subtotal_minor BIGINT NOT NULL,
  shipping_minor BIGINT NOT NULL DEFAULT 0,
  tax_minor BIGINT NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','invoiced')),
  fulfilment_status TEXT NOT NULL DEFAULT 'unfulfilled' CHECK (fulfilment_status IN ('unfulfilled','fulfilled')),
  shipping_method TEXT,
  shipping_address JSONB,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  protection_minor BIGINT NOT NULL DEFAULT 0,
  discount_minor BIGINT NOT NULL DEFAULT 0,
  access_token_hash TEXT NOT NULL,
  killbill_external_key TEXT,
  killbill_invoice_amount NUMERIC(12,2),
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_line (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  variant_id BIGINT NOT NULL REFERENCES variant(id),
  title_snapshot TEXT NOT NULL,
  sku_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_minor BIGINT NOT NULL,
  total_minor BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS device (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  serial TEXT NOT NULL UNIQUE,
  serial_folded TEXT NOT NULL UNIQUE,
  product_id BIGINT NOT NULL REFERENCES product(id),
  variant_id BIGINT NOT NULL REFERENCES variant(id),
  status TEXT NOT NULL CHECK (status IN ('manufactured','sold','registered','blocked')),
  blocked_reason TEXT,
  firmware_version TEXT,
  firmware_reported_at TIMESTAMPTZ,
  nickname TEXT,
  order_id BIGINT REFERENCES "order"(id) ON DELETE SET NULL,
  warranty_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_ownership (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id BIGINT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  customer_id BIGINT REFERENCES customer(id) ON DELETE SET NULL,
  order_id BIGINT REFERENCES "order"(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  method TEXT NOT NULL CHECK (method IN ('order','manual','support'))
);

CREATE TABLE IF NOT EXISTS app_release (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  build INTEGER NOT NULL UNIQUE,
  released_on DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'general',
  artifact_name TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  description TEXT,
  notes JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS firmware (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  build INTEGER NOT NULL,
  min_firmware TEXT,
  min_app_version TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('internal','beta','general','yanked')),
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  released_on DATE NOT NULL,
  UNIQUE (product_id, build)
);

CREATE TABLE IF NOT EXISTS flash_session (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id BIGINT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  firmware_id BIGINT NOT NULL REFERENCES firmware(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'started' CHECK (state IN ('started','succeeded','failed')),
  reported_version TEXT,
  failure_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS idempotency_key (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  order_id BIGINT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Serials allocated to a camera line of an order, written at confirmation.
CREATE TABLE IF NOT EXISTS device_serial (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  order_line_id BIGINT NOT NULL REFERENCES order_line(id) ON DELETE CASCADE,
  variant_id BIGINT NOT NULL REFERENCES variant(id),
  serial TEXT NOT NULL UNIQUE
);

-- At most one live ownership row per device, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS device_ownership_live_uidx
  ON device_ownership (device_id) WHERE released_at IS NULL;

-- At most one started flash session per device, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS flash_session_started_uidx
  ON flash_session (device_id) WHERE state = 'started';

-- Order numbers are allocated in sequence: VE-<year>-<four digits>.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;
`;
