CREATE TABLE IF NOT EXISTS customer (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_email_ci ON customer (lower(email));

CREATE TABLE IF NOT EXISTS auth_token (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customer(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('camera','accessory','spare','protection')),
  status TEXT NOT NULL CHECK (status IN ('active','discontinued')),
  support_until DATE,
  position INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS variant (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES product(id),
  sku TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  option_value TEXT NOT NULL,
  price_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  position INT NOT NULL DEFAULT 0,
  inventory_policy TEXT NOT NULL DEFAULT 'deny' CHECK (inventory_policy IN ('deny','continue'))
);

CREATE TABLE IF NOT EXISTS inventory_level (
  variant_id BIGINT NOT NULL PRIMARY KEY REFERENCES variant(id),
  available INT NOT NULL DEFAULT 0,
  committed INT NOT NULL DEFAULT 0,
  CONSTRAINT inventory_nonneg CHECK (available >= 0)
);

CREATE TABLE IF NOT EXISTS product_block (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES product(id),
  kind TEXT NOT NULL CHECK (kind IN ('lede','spec_group','in_the_box','compatibility','support_note')),
  position INT NOT NULL DEFAULT 0,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS cart (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  customer_id BIGINT REFERENCES customer(id),
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE TABLE IF NOT EXISTS cart_line (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cart_id BIGINT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  variant_id BIGINT NOT NULL REFERENCES variant(id),
  quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_minor BIGINT NOT NULL,
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE IF NOT EXISTS cart_protection (
  cart_id BIGINT NOT NULL PRIMARY KEY REFERENCES cart(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS delivery_zone (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_method (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zone_id BIGINT NOT NULL REFERENCES delivery_zone(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  price_minor BIGINT NOT NULL,
  min_days INT NOT NULL,
  max_days INT NOT NULL,
  UNIQUE (zone_id, code)
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  customer_id BIGINT REFERENCES customer(id),
  email TEXT NOT NULL,
  subtotal_minor BIGINT NOT NULL,
  shipping_minor BIGINT NOT NULL DEFAULT 0,
  tax_minor BIGINT NOT NULL DEFAULT 0,
  discount_minor BIGINT NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','invoiced')),
  fulfilment_status TEXT NOT NULL DEFAULT 'unfulfilled' CHECK (fulfilment_status IN ('unfulfilled','fulfilled')),
  shipping_method TEXT,
  shipping_address JSONB,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  protection_minor BIGINT NOT NULL DEFAULT 0,
  access_token_hash TEXT NOT NULL,
  killbill_external_key TEXT,
  killbill_invoice_id TEXT,
  killbill_invoice_amount NUMERIC(12,2),
  idempotency_key TEXT UNIQUE,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_email_idx ON orders (lower(email));

CREATE TABLE IF NOT EXISTS order_line (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  variant_id BIGINT NOT NULL REFERENCES variant(id),
  title_snapshot TEXT NOT NULL,
  sku_snapshot TEXT NOT NULL,
  quantity INT NOT NULL,
  unit_price_minor BIGINT NOT NULL,
  total_minor BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS device (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  serial TEXT NOT NULL UNIQUE,
  product_id BIGINT NOT NULL REFERENCES product(id),
  variant_id BIGINT NOT NULL REFERENCES variant(id),
  status TEXT NOT NULL CHECK (status IN ('manufactured','sold','registered','blocked')),
  blocked_reason TEXT,
  firmware_version TEXT,
  firmware_reported_at TIMESTAMPTZ,
  nickname TEXT,
  order_id BIGINT REFERENCES orders(id),
  warranty_until DATE
);
CREATE UNIQUE INDEX IF NOT EXISTS device_serial_ci ON device (upper(serial));

CREATE TABLE IF NOT EXISTS device_ownership (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id BIGINT NOT NULL REFERENCES device(id),
  customer_id BIGINT REFERENCES customer(id),
  order_id BIGINT REFERENCES orders(id),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  method TEXT NOT NULL CHECK (method IN ('order','manual','support'))
);
CREATE UNIQUE INDEX IF NOT EXISTS device_ownership_one_live
  ON device_ownership (device_id) WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS app_release (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  build INT NOT NULL UNIQUE,
  released_on DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'general',
  artifact_name TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  description TEXT,
  notes JSONB
);

CREATE TABLE IF NOT EXISTS firmware (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES product(id),
  version TEXT NOT NULL,
  build INT NOT NULL,
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
  device_id BIGINT NOT NULL REFERENCES device(id),
  firmware_id BIGINT NOT NULL REFERENCES firmware(id),
  state TEXT NOT NULL CHECK (state IN ('started','succeeded','failed')),
  reported_version TEXT,
  failure_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS flash_session_one_started
  ON flash_session (device_id) WHERE state = 'started';

CREATE TABLE IF NOT EXISTS customer_app_seen (
  customer_id BIGINT PRIMARY KEY REFERENCES customer(id),
  build INT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

ALTER TABLE cart ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cart ADD COLUMN IF NOT EXISTS shipping_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE cart ADD COLUMN IF NOT EXISTS shipping_method TEXT;
ALTER TABLE cart ADD COLUMN IF NOT EXISTS shipping_address JSONB;

CREATE TABLE IF NOT EXISTS device_channel_optin (
  device_id BIGINT NOT NULL REFERENCES device(id),
  channel TEXT NOT NULL CHECK (channel IN ('internal','beta','general','yanked')),
  PRIMARY KEY (device_id, channel)
);

ALTER TABLE flash_session ADD COLUMN IF NOT EXISTS progress INT NOT NULL DEFAULT 0;
