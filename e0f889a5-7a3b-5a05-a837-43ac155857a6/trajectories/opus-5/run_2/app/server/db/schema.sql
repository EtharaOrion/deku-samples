-- Vela storefront schema. All timestamps UTC. Money is integer minor units.
-- gen_random_uuid() is built into PostgreSQL 13 and later, so no extension is
-- needed and the app user is not required to hold CREATE EXTENSION.

CREATE TABLE IF NOT EXISTS customer (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  name          text NOT NULL,
  password_hash text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_email_lower_key ON customer (lower(email));

CREATE TABLE IF NOT EXISTS product (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle        text NOT NULL UNIQUE,
  title         text NOT NULL,
  subtitle      text NOT NULL DEFAULT '',
  kind          text NOT NULL CHECK (kind IN ('camera','accessory','spare','protection')),
  status        text NOT NULL CHECK (status IN ('active','discontinued')),
  support_until date,
  position      integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS variant (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL REFERENCES product(id),
  sku              text NOT NULL UNIQUE,
  title            text NOT NULL,
  option_value     text NOT NULL,
  price_minor      integer NOT NULL CHECK (price_minor >= 0),
  currency         text NOT NULL DEFAULT 'usd',
  position         integer NOT NULL DEFAULT 0,
  inventory_policy text NOT NULL DEFAULT 'deny' CHECK (inventory_policy IN ('deny','continue'))
);
CREATE INDEX IF NOT EXISTS variant_product_idx ON variant (product_id, position);

CREATE TABLE IF NOT EXISTS inventory_level (
  variant_id uuid PRIMARY KEY REFERENCES variant(id),
  available  integer NOT NULL DEFAULT 0 CHECK (available >= 0),
  committed  integer NOT NULL DEFAULT 0 CHECK (committed >= 0)
);

CREATE TABLE IF NOT EXISTS product_block (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES product(id),
  kind       text NOT NULL CHECK (kind IN ('lede','spec_group','in_the_box','compatibility','support_note')),
  position   integer NOT NULL DEFAULT 0,
  payload    jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS product_block_product_idx ON product_block (product_id, position);

CREATE TABLE IF NOT EXISTS cart (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text NOT NULL UNIQUE,
  customer_id uuid REFERENCES customer(id),
  email       text,
  protection_enabled boolean NOT NULL DEFAULT false,
  shipping_method text,
  shipping_address jsonb,
  marketing_consent boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE TABLE IF NOT EXISTS cart_line (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id          uuid NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  variant_id       uuid NOT NULL REFERENCES variant(id),
  quantity         integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_minor integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE IF NOT EXISTS "order" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number              text NOT NULL UNIQUE,
  customer_id         uuid REFERENCES customer(id),
  email               text NOT NULL,
  subtotal_minor      integer NOT NULL,
  shipping_minor      integer NOT NULL DEFAULT 0,
  tax_minor           integer NOT NULL DEFAULT 0,
  discount_minor      integer NOT NULL DEFAULT 0,
  total_minor         integer NOT NULL,
  currency            text NOT NULL DEFAULT 'usd',
  status              text NOT NULL CHECK (status IN ('pending','confirmed','cancelled')),
  payment_status      text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','invoiced')),
  fulfilment_status   text NOT NULL DEFAULT 'unfulfilled' CHECK (fulfilment_status IN ('unfulfilled','fulfilled')),
  shipping_method     text NOT NULL,
  shipping_address    jsonb NOT NULL,
  access_token_hash   text NOT NULL,
  killbill_external_key   text,
  killbill_invoice_amount numeric(12,2),
  killbill_invoice_id text,
  idempotency_key     text,
  placed_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_total_consistent
    CHECK (total_minor = subtotal_minor + shipping_minor + tax_minor - discount_minor)
);
CREATE UNIQUE INDEX IF NOT EXISTS order_idempotency_key_uq ON "order" (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_customer_idx ON "order" (customer_id, placed_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS order_line (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  variant_id       uuid NOT NULL REFERENCES variant(id) ON DELETE RESTRICT,
  title_snapshot   text NOT NULL,
  sku_snapshot     text NOT NULL,
  quantity         integer NOT NULL CHECK (quantity > 0),
  unit_price_minor integer NOT NULL,
  total_minor      integer NOT NULL,
  position         integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS order_line_order_idx ON order_line (order_id, position);

CREATE TABLE IF NOT EXISTS device (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial              text NOT NULL,
  product_id          uuid NOT NULL REFERENCES product(id),
  variant_id          uuid NOT NULL REFERENCES variant(id),
  status              text NOT NULL CHECK (status IN ('manufactured','sold','registered','blocked')),
  blocked_reason      text,
  firmware_version    text,
  firmware_reported_at timestamptz,
  nickname            text,
  order_id            uuid REFERENCES "order"(id),
  warranty_until      date,
  opted_channels      text[] NOT NULL DEFAULT ARRAY['general']::text[]
);
CREATE UNIQUE INDEX IF NOT EXISTS device_serial_upper_key ON device (upper(serial));

CREATE TABLE IF NOT EXISTS device_ownership (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   uuid NOT NULL REFERENCES device(id),
  customer_id uuid REFERENCES customer(id),
  order_id    uuid REFERENCES "order"(id),
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  method      text NOT NULL CHECK (method IN ('order','manual','support'))
);
-- At most one live owner per device, enforced by the store rather than app code.
CREATE UNIQUE INDEX IF NOT EXISTS device_ownership_one_live
  ON device_ownership (device_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS device_ownership_customer_idx ON device_ownership (customer_id) WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS app_release (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version       text NOT NULL UNIQUE,
  build         integer NOT NULL UNIQUE,
  released_on   date NOT NULL,
  channel       text NOT NULL DEFAULT 'general',
  artifact_name text NOT NULL,
  size_bytes    bigint NOT NULL,
  sha256        text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  description   text NOT NULL DEFAULT '',
  notes         jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS firmware (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES product(id),
  version         text NOT NULL,
  build           integer NOT NULL,
  min_firmware    text,
  min_app_version text NOT NULL,
  channel         text NOT NULL CHECK (channel IN ('internal','beta','general','yanked')),
  size_bytes      bigint NOT NULL,
  sha256          text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  released_on     date NOT NULL,
  UNIQUE (product_id, build)
);

CREATE TABLE IF NOT EXISTS flash_session (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id        uuid NOT NULL REFERENCES device(id),
  firmware_id      uuid NOT NULL REFERENCES firmware(id),
  state            text NOT NULL CHECK (state IN ('started','succeeded','failed')),
  reported_version text,
  failure_reason   text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz
);
-- At most one started session per device at any time.
CREATE UNIQUE INDEX IF NOT EXISTS flash_session_one_started
  ON flash_session (device_id) WHERE state = 'started';

-- Supporting tables (auth tokens, order numbering, delivery zones).
CREATE TABLE IF NOT EXISTS auth_token (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  issued_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS order_sequence (
  year integer PRIMARY KEY,
  last_value integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS delivery_method (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone      text NOT NULL,
  country   text NOT NULL,
  code      text NOT NULL UNIQUE,
  label     text NOT NULL,
  price_minor integer NOT NULL,
  window_label text NOT NULL,
  position  integer NOT NULL DEFAULT 0
);
