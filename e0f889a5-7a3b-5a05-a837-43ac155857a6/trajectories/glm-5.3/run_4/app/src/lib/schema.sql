-- Vela storefront schema. All timestamps UTC.

CREATE TABLE IF NOT EXISTS customer (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  last_seen_release_build INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_email_lower ON customer (lower(email));

CREATE TABLE IF NOT EXISTS product (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  handle        TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  subtitle      TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL CHECK (kind IN ('camera','accessory','spare','protection')),
  status        TEXT NOT NULL CHECK (status IN ('active','discontinued')),
  support_until DATE,
  position      INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS variant (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id       BIGINT NOT NULL REFERENCES product(id),
  sku              TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  option_value     TEXT NOT NULL,
  price_minor      INT NOT NULL CHECK (price_minor >= 0),
  currency         TEXT NOT NULL DEFAULT 'usd',
  position         INT NOT NULL DEFAULT 0,
  inventory_policy TEXT NOT NULL DEFAULT 'deny' CHECK (inventory_policy IN ('deny','continue'))
);

CREATE TABLE IF NOT EXISTS inventory_level (
  variant_id BIGINT PRIMARY KEY REFERENCES variant(id),
  available  INT NOT NULL DEFAULT 0 CHECK (available >= 0),
  committed  INT NOT NULL DEFAULT 0 CHECK (committed >= 0)
);

CREATE TABLE IF NOT EXISTS product_block (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES product(id),
  kind       TEXT NOT NULL CHECK (kind IN ('lede','spec_group','in_the_box','compatibility','support_note')),
  position   INT NOT NULL DEFAULT 0,
  payload    JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS cart (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token              TEXT NOT NULL UNIQUE,
  customer_id        BIGINT REFERENCES customer(id),
  email              TEXT,
  shipping_method    TEXT,
  shipping_address   JSONB,
  marketing_consent  BOOLEAN NOT NULL DEFAULT FALSE,
  protection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days'
);

CREATE TABLE IF NOT EXISTS cart_line (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cart_id           BIGINT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  variant_id        BIGINT NOT NULL REFERENCES variant(id),
  quantity          INT NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_minor  INT NOT NULL,
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE IF NOT EXISTS "order" (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number                  TEXT NOT NULL UNIQUE,
  customer_id             BIGINT REFERENCES customer(id),
  email                   TEXT NOT NULL,
  subtotal_minor          INT NOT NULL,
  shipping_minor          INT NOT NULL DEFAULT 0,
  tax_minor               INT NOT NULL DEFAULT 0,
  total_minor             INT NOT NULL,
  currency                TEXT NOT NULL DEFAULT 'usd',
  status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  payment_status          TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','invoiced')),
  fulfilment_status       TEXT NOT NULL DEFAULT 'unfulfilled' CHECK (fulfilment_status IN ('unfulfilled','fulfilled')),
  shipping_method         TEXT,
  shipping_address        JSONB,
  access_token_hash       TEXT,
  killbill_external_key   TEXT,
  killbill_invoice_amount NUMERIC(12,2),
  placed_at               TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_line (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id          BIGINT NOT NULL REFERENCES "order"(id),
  variant_id        BIGINT NOT NULL REFERENCES variant(id),
  title_snapshot   TEXT NOT NULL,
  sku_snapshot      TEXT NOT NULL,
  quantity          INT NOT NULL,
  unit_price_minor  INT NOT NULL,
  total_minor       INT NOT NULL
);

CREATE TABLE IF NOT EXISTS device (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  serial               TEXT NOT NULL UNIQUE,
  product_id           BIGINT NOT NULL REFERENCES product(id),
  variant_id           BIGINT NOT NULL REFERENCES variant(id),
  status               TEXT NOT NULL CHECK (status IN ('manufactured','sold','registered','blocked')),
  blocked_reason       TEXT,
  firmware_version     TEXT,
  firmware_reported_at TIMESTAMPTZ,
  nickname             TEXT,
  order_id             BIGINT REFERENCES "order"(id),
  warranty_until       DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS device_serial_lower ON device (lower(serial));

CREATE TABLE IF NOT EXISTS device_ownership (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id   BIGINT NOT NULL REFERENCES device(id),
  customer_id BIGINT REFERENCES customer(id),
  order_id    BIGINT REFERENCES "order"(id),
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  method      TEXT NOT NULL CHECK (method IN ('order','manual','support')),
  UNIQUE (device_id, customer_id, claimed_at)
);
-- At most one live owner per device.
CREATE UNIQUE INDEX IF NOT EXISTS device_ownership_one_live
  ON device_ownership (device_id) WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS app_release (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version      TEXT NOT NULL UNIQUE,
  build        INT NOT NULL UNIQUE,
  released_on  DATE NOT NULL,
  channel      TEXT NOT NULL DEFAULT 'general' CHECK (channel IN ('internal','beta','general','yanked')),
  artifact_name TEXT NOT NULL,
  size_bytes   BIGINT NOT NULL,
  sha256       TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  notes        JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS firmware (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id      BIGINT NOT NULL REFERENCES product(id),
  version         TEXT NOT NULL,
  build           INT NOT NULL,
  min_firmware    TEXT,
  min_app_version TEXT NOT NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('internal','beta','general','yanked')),
  size_bytes      BIGINT NOT NULL,
  sha256          TEXT NOT NULL,
  artifact_name   TEXT NOT NULL DEFAULT '',
  released_on     DATE NOT NULL,
  UNIQUE (product_id, build)
);

CREATE TABLE IF NOT EXISTS flash_session (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id        BIGINT NOT NULL REFERENCES device(id),
  firmware_id      BIGINT NOT NULL REFERENCES firmware(id),
  state            TEXT NOT NULL DEFAULT 'started' CHECK (state IN ('started','succeeded','failed')),
  reported_version TEXT,
  failure_reason   TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS flash_session_one_started
  ON flash_session (device_id) WHERE state = 'started';

CREATE TABLE IF NOT EXISTS idempotency_key (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope        TEXT NOT NULL,
  key_text     TEXT NOT NULL,
  response     JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, key_text)
);

CREATE TABLE IF NOT EXISTS auth_token (
  token_hash  TEXT PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customer(id),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_email_idx ON "order" (lower(email));
CREATE INDEX IF NOT EXISTS order_customer_idx ON "order" (customer_id);
CREATE INDEX IF NOT EXISTS app_release_build_idx ON app_release (build DESC);
CREATE INDEX IF NOT EXISTS cart_token_idx ON cart (token);
CREATE INDEX IF NOT EXISTS cart_line_cart_idx ON cart_line (cart_id);
