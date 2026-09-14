CREATE TABLE IF NOT EXISTS customer (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_email_ci ON customer (lower(email));

CREATE TABLE IF NOT EXISTS product (
  id BIGSERIAL PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('camera','accessory','spare','protection')),
  status TEXT NOT NULL CHECK (status IN ('active','discontinued')),
  support_until DATE,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS variant (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES product(id),
  sku TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  option_value TEXT NOT NULL,
  price_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  position INTEGER NOT NULL DEFAULT 0,
  inventory_policy TEXT NOT NULL DEFAULT 'deny' CHECK (inventory_policy IN ('deny','continue'))
);

CREATE TABLE IF NOT EXISTS inventory_level (
  variant_id BIGINT PRIMARY KEY REFERENCES variant(id),
  available INTEGER NOT NULL DEFAULT 0,
  committed INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT inv_nonneg CHECK (available >= 0)
);

CREATE TABLE IF NOT EXISTS product_block (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES product(id),
  kind TEXT NOT NULL CHECK (kind IN ('lede','spec_group','in_the_box','compatibility','support_note')),
  position INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS cart (
  id BIGSERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  customer_id BIGINT REFERENCES customer(id),
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days',
  shipping_method TEXT,
  shipping_address JSONB,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  protection_enabled BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS cart_line (
  id BIGSERIAL PRIMARY KEY,
  cart_id BIGINT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  variant_id BIGINT NOT NULL REFERENCES variant(id),
  quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 10),
  unit_price_minor BIGINT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
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
  shipping_method TEXT NOT NULL,
  shipping_address JSONB NOT NULL,
  access_token_hash TEXT NOT NULL,
  access_token TEXT,
  killbill_external_key TEXT,
  killbill_invoice_amount NUMERIC(12,2),
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS order_line (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id BIGINT NOT NULL REFERENCES variant(id),
  title_snapshot TEXT NOT NULL,
  sku_snapshot TEXT NOT NULL,
  option_snapshot TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL,
  unit_price_minor BIGINT NOT NULL,
  total_minor BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS device (
  id BIGSERIAL PRIMARY KEY,
  serial TEXT NOT NULL UNIQUE,
  product_id BIGINT NOT NULL REFERENCES product(id),
  variant_id BIGINT NOT NULL REFERENCES variant(id),
  status TEXT NOT NULL CHECK (status IN ('manufactured','sold','registered','blocked')),
  blocked_reason TEXT,
  firmware_version TEXT,
  firmware_reported_at TIMESTAMPTZ,
  nickname TEXT,
  order_id BIGINT REFERENCES orders(id),
  warranty_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS device_serial_ci ON device (upper(serial));

CREATE TABLE IF NOT EXISTS device_ownership (
  id BIGSERIAL PRIMARY KEY,
  device_id BIGINT NOT NULL REFERENCES device(id),
  customer_id BIGINT REFERENCES customer(id),
  order_id BIGINT REFERENCES orders(id),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  method TEXT NOT NULL CHECK (method IN ('order','manual','support'))
);

CREATE TABLE IF NOT EXISTS app_release (
  id BIGSERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  build INTEGER NOT NULL UNIQUE,
  released_on DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'general',
  artifact_name TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  notes JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS firmware (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES product(id),
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
  id BIGSERIAL PRIMARY KEY,
  device_id BIGINT NOT NULL REFERENCES device(id),
  firmware_id BIGINT NOT NULL REFERENCES firmware(id),
  state TEXT NOT NULL DEFAULT 'started' CHECK (state IN ('started','succeeded','failed')),
  reported_version TEXT,
  failure_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auth_token (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single live owner per device, enforced by the database under concurrency.
CREATE UNIQUE INDEX IF NOT EXISTS device_ownership_one_live
  ON device_ownership (device_id) WHERE released_at IS NULL;

-- At most one started flash session per device.
CREATE UNIQUE INDEX IF NOT EXISTS flash_session_one_started
  ON flash_session (device_id) WHERE state = 'started';

CREATE TABLE IF NOT EXISTS order_sequence (
  year INTEGER PRIMARY KEY,
  last_seq INTEGER NOT NULL
);

-- Devices allocated to an order line, keyed uniquely so an allocation can be replayed.
CREATE TABLE IF NOT EXISTS order_line_serial (
  order_line_id BIGINT NOT NULL REFERENCES order_line(id) ON DELETE CASCADE,
  serial TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS shipping_rate (
  zone TEXT NOT NULL,
  method TEXT NOT NULL,
  label TEXT NOT NULL,
  price_minor BIGINT NOT NULL,
  min_days INTEGER NOT NULL,
  max_days INTEGER NOT NULL,
  PRIMARY KEY (zone, method)
);
