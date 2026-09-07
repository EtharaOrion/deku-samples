-- Vela storefront schema. All timestamps UTC. Money is integer minor units.

CREATE TABLE IF NOT EXISTS customer (
  id            bigserial PRIMARY KEY,
  email         text NOT NULL,
  name          text NOT NULL,
  password_hash text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_email_key ON customer (lower(email));

CREATE TABLE IF NOT EXISTS auth_token (
  id          bigserial PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS product (
  id            bigserial PRIMARY KEY,
  handle        text NOT NULL UNIQUE,
  title         text NOT NULL,
  subtitle      text NOT NULL DEFAULT '',
  kind          text NOT NULL CHECK (kind IN ('camera','accessory','spare','protection')),
  status        text NOT NULL CHECK (status IN ('active','discontinued')),
  support_until date,
  position      integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS variant (
  id               bigserial PRIMARY KEY,
  product_id       bigint NOT NULL REFERENCES product(id),
  sku              text NOT NULL UNIQUE,
  title            text NOT NULL,
  option_value     text NOT NULL,
  price_minor      integer NOT NULL CHECK (price_minor >= 0),
  currency         text NOT NULL DEFAULT 'usd',
  position         integer NOT NULL DEFAULT 0,
  inventory_policy text NOT NULL DEFAULT 'deny' CHECK (inventory_policy IN ('deny','continue'))
);

CREATE TABLE IF NOT EXISTS inventory_level (
  variant_id bigint PRIMARY KEY REFERENCES variant(id),
  available  integer NOT NULL DEFAULT 0 CHECK (available >= 0),
  committed  integer NOT NULL DEFAULT 0 CHECK (committed >= 0)
);

CREATE TABLE IF NOT EXISTS product_block (
  id         bigserial PRIMARY KEY,
  product_id bigint NOT NULL REFERENCES product(id),
  kind       text NOT NULL CHECK (kind IN ('lede','spec_group','in_the_box','compatibility','support_note')),
  position   integer NOT NULL DEFAULT 0,
  payload    jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS cart (
  id          bigserial PRIMARY KEY,
  token       text NOT NULL UNIQUE,
  customer_id bigint REFERENCES customer(id),
  email       text,
  contact     jsonb,
  shipping_address jsonb,
  shipping_method  text,
  protection_enabled boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE TABLE IF NOT EXISTS cart_line (
  id               bigserial PRIMARY KEY,
  cart_id          bigint NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  variant_id       bigint NOT NULL REFERENCES variant(id),
  quantity         integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_minor integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE IF NOT EXISTS order_counter (
  year       integer PRIMARY KEY,
  last_value integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "order" (
  id                      bigserial PRIMARY KEY,
  number                  text NOT NULL UNIQUE,
  customer_id             bigint REFERENCES customer(id),
  email                   text NOT NULL,
  subtotal_minor          integer NOT NULL,
  shipping_minor          integer NOT NULL DEFAULT 0,
  tax_minor               integer NOT NULL DEFAULT 0,
  discount_minor          integer NOT NULL DEFAULT 0,
  total_minor             integer NOT NULL,
  currency                text NOT NULL DEFAULT 'usd',
  status                  text NOT NULL CHECK (status IN ('pending','confirmed','cancelled')),
  payment_status          text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','invoiced')),
  fulfilment_status       text NOT NULL DEFAULT 'unfulfilled' CHECK (fulfilment_status IN ('unfulfilled','fulfilled')),
  shipping_method         text NOT NULL,
  shipping_address        jsonb NOT NULL,
  access_token_hash       text NOT NULL,
  killbill_external_key   text,
  killbill_account_id     text,
  killbill_invoice_id     text,
  killbill_invoice_amount numeric(12,2),
  -- Unique per order row, so a retry of this order finds its own charge while a
  -- later database generation reusing the same number never adopts an old one.
  killbill_charge_key     text,
  placed_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_total_balances CHECK (total_minor = subtotal_minor + shipping_minor + tax_minor - discount_minor)
);
CREATE INDEX IF NOT EXISTS order_customer_idx ON "order" (customer_id, id DESC);

CREATE TABLE IF NOT EXISTS order_line (
  id               bigserial PRIMARY KEY,
  order_id         bigint NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  variant_id       bigint NOT NULL REFERENCES variant(id) ON DELETE RESTRICT,
  title_snapshot   text NOT NULL,
  sku_snapshot     text NOT NULL,
  quantity         integer NOT NULL CHECK (quantity > 0),
  unit_price_minor integer NOT NULL,
  total_minor      integer NOT NULL,
  position         integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS device (
  id                  bigserial PRIMARY KEY,
  serial              text NOT NULL,
  product_id          bigint NOT NULL REFERENCES product(id),
  variant_id          bigint NOT NULL REFERENCES variant(id),
  status              text NOT NULL CHECK (status IN ('manufactured','sold','registered','blocked')),
  blocked_reason      text,
  firmware_version    text,
  firmware_reported_at timestamptz,
  nickname            text,
  order_id            bigint REFERENCES "order"(id),
  warranty_until      date,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS device_serial_key ON device (upper(serial));

CREATE TABLE IF NOT EXISTS device_ownership (
  id          bigserial PRIMARY KEY,
  device_id   bigint NOT NULL REFERENCES device(id),
  customer_id bigint REFERENCES customer(id),
  order_id    bigint REFERENCES "order"(id),
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  method      text NOT NULL CHECK (method IN ('order','manual','support'))
);
-- A device has at most one live owner. Enforced by the store, not by app code.
CREATE UNIQUE INDEX IF NOT EXISTS device_ownership_one_live
  ON device_ownership (device_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS device_ownership_customer_idx
  ON device_ownership (customer_id, id DESC) WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS app_release (
  id            bigserial PRIMARY KEY,
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
  id              bigserial PRIMARY KEY,
  product_id      bigint NOT NULL REFERENCES product(id),
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
  id               bigserial PRIMARY KEY,
  device_id        bigint NOT NULL REFERENCES device(id),
  firmware_id      bigint NOT NULL REFERENCES firmware(id),
  state            text NOT NULL CHECK (state IN ('started','succeeded','failed')),
  reported_version text,
  failure_reason   text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz
);
-- At most one session in 'started' per device at any time.
CREATE UNIQUE INDEX IF NOT EXISTS flash_session_one_started
  ON flash_session (device_id) WHERE state = 'started';

CREATE TABLE IF NOT EXISTS shipping_method (
  id          bigserial PRIMARY KEY,
  zone        text NOT NULL,
  country     text NOT NULL,
  code        text NOT NULL,
  label       text NOT NULL,
  price_minor integer NOT NULL,
  window_text text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  UNIQUE (zone, code)
);

CREATE TABLE IF NOT EXISTS idempotency_key (
  key        text PRIMARY KEY,
  scope      text NOT NULL,
  order_id   bigint REFERENCES "order"(id),
  state      text NOT NULL DEFAULT 'in_progress' CHECK (state IN ('in_progress','done')),
  response   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
