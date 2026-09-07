-- Vela storefront schema. Applied on every boot; every statement is idempotent.

CREATE TABLE IF NOT EXISTS customer (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL,
  name          text NOT NULL,
  password_hash text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_email_key ON customer (lower(email));

CREATE TABLE IF NOT EXISTS auth_token (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES customer (id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS product (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  handle        text NOT NULL UNIQUE,
  title         text NOT NULL,
  subtitle      text NOT NULL DEFAULT '',
  kind          text NOT NULL CHECK (kind IN ('camera', 'accessory', 'spare', 'protection')),
  status        text NOT NULL CHECK (status IN ('active', 'discontinued')),
  support_until date,
  position      integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS variant (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id       bigint NOT NULL REFERENCES product (id),
  sku              text NOT NULL UNIQUE,
  title            text NOT NULL,
  option_value     text NOT NULL,
  price_minor      integer NOT NULL CHECK (price_minor >= 0),
  currency         text NOT NULL DEFAULT 'usd',
  position         integer NOT NULL DEFAULT 0,
  inventory_policy text NOT NULL DEFAULT 'deny' CHECK (inventory_policy IN ('deny', 'continue'))
);

CREATE TABLE IF NOT EXISTS inventory_level (
  variant_id bigint PRIMARY KEY REFERENCES variant (id),
  available  integer NOT NULL DEFAULT 0 CHECK (available >= 0),
  committed  integer NOT NULL DEFAULT 0 CHECK (committed >= 0)
);

CREATE TABLE IF NOT EXISTS product_block (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id bigint NOT NULL REFERENCES product (id),
  kind       text NOT NULL CHECK (kind IN ('lede', 'spec_group', 'in_the_box', 'compatibility', 'support_note')),
  position   integer NOT NULL DEFAULT 0,
  payload    jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS product_block_slot ON product_block (product_id, kind, position);

CREATE TABLE IF NOT EXISTS cart (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token             text NOT NULL UNIQUE,
  customer_id       bigint REFERENCES customer (id),
  email             text,
  marketing_consent boolean NOT NULL DEFAULT false,
  shipping_address  jsonb,
  shipping_method   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '30 days'
);

CREATE TABLE IF NOT EXISTS cart_line (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cart_id          bigint NOT NULL REFERENCES cart (id) ON DELETE CASCADE,
  variant_id       bigint NOT NULL REFERENCES variant (id),
  quantity         integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_minor integer NOT NULL CHECK (unit_price_minor >= 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE IF NOT EXISTS "order" (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number                  text NOT NULL UNIQUE,
  customer_id             bigint REFERENCES customer (id),
  email                   text NOT NULL,
  subtotal_minor          integer NOT NULL,
  shipping_minor          integer NOT NULL DEFAULT 0,
  tax_minor               integer NOT NULL DEFAULT 0,
  discount_minor          integer NOT NULL DEFAULT 0,
  total_minor             integer NOT NULL,
  currency                text NOT NULL DEFAULT 'usd',
  status                  text NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  payment_status          text NOT NULL CHECK (payment_status IN ('unpaid', 'invoiced')),
  fulfilment_status       text NOT NULL CHECK (fulfilment_status IN ('unfulfilled', 'fulfilled')),
  shipping_method         text NOT NULL,
  shipping_address        jsonb NOT NULL,
  access_token_hash       text NOT NULL,
  killbill_external_key   text,
  killbill_invoice_amount numeric(12, 2),
  killbill_invoice_id     text,
  placed_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_total_consistent
    CHECK (total_minor = subtotal_minor + shipping_minor + tax_minor - discount_minor)
);

CREATE TABLE IF NOT EXISTS order_line (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         bigint NOT NULL REFERENCES "order" (id) ON DELETE CASCADE,
  variant_id       bigint NOT NULL REFERENCES variant (id),
  title_snapshot   text NOT NULL,
  sku_snapshot     text NOT NULL,
  quantity         integer NOT NULL CHECK (quantity > 0),
  unit_price_minor integer NOT NULL,
  total_minor      integer NOT NULL,
  position         integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_number_counter (
  year        integer PRIMARY KEY,
  last_number integer NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_key (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key          text NOT NULL,
  scope        text NOT NULL,
  order_id     bigint REFERENCES "order" (id),
  access_token text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, key)
);

CREATE TABLE IF NOT EXISTS device (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  serial              text NOT NULL,
  product_id          bigint NOT NULL REFERENCES product (id),
  variant_id          bigint NOT NULL REFERENCES variant (id),
  status              text NOT NULL CHECK (status IN ('manufactured', 'sold', 'registered', 'blocked')),
  blocked_reason      text,
  firmware_version    text,
  firmware_reported_at timestamptz,
  nickname            text,
  order_id            bigint REFERENCES "order" (id),
  warranty_until      date
);
CREATE UNIQUE INDEX IF NOT EXISTS device_serial_key ON device (upper(serial));

CREATE TABLE IF NOT EXISTS device_ownership (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id   bigint NOT NULL REFERENCES device (id),
  customer_id bigint REFERENCES customer (id),
  order_id    bigint REFERENCES "order" (id),
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  method      text NOT NULL CHECK (method IN ('order', 'manual', 'support'))
);
-- At most one live owner per device, enforced by the store rather than by app code.
CREATE UNIQUE INDEX IF NOT EXISTS device_ownership_one_live
  ON device_ownership (device_id) WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS app_release (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id      bigint NOT NULL REFERENCES product (id),
  version         text NOT NULL,
  build           integer NOT NULL,
  min_firmware    text,
  min_app_version text NOT NULL,
  channel         text NOT NULL CHECK (channel IN ('internal', 'beta', 'general', 'yanked')),
  size_bytes      bigint NOT NULL,
  sha256          text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  released_on     date NOT NULL,
  UNIQUE (product_id, build)
);

CREATE TABLE IF NOT EXISTS flash_session (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id        bigint NOT NULL REFERENCES device (id),
  firmware_id      bigint NOT NULL REFERENCES firmware (id),
  state            text NOT NULL CHECK (state IN ('started', 'succeeded', 'failed')),
  reported_version text,
  failure_reason   text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz
);
-- At most one started session per device at any time.
CREATE UNIQUE INDEX IF NOT EXISTS flash_session_one_started
  ON flash_session (device_id) WHERE state = 'started';

CREATE TABLE IF NOT EXISTS delivery_zone (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code    text NOT NULL UNIQUE,
  country text NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_method (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zone_id        bigint NOT NULL REFERENCES delivery_zone (id),
  code           text NOT NULL,
  title          text NOT NULL,
  price_minor    integer NOT NULL,
  window_label   text NOT NULL,
  position       integer NOT NULL DEFAULT 0,
  UNIQUE (zone_id, code)
);

CREATE INDEX IF NOT EXISTS order_customer_idx ON "order" (customer_id, placed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS device_ownership_customer_idx ON device_ownership (customer_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS cart_line_cart_idx ON cart_line (cart_id);
CREATE INDEX IF NOT EXISTS order_line_order_idx ON order_line (order_id);
