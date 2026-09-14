// The schema, applied with CREATE TABLE IF NOT EXISTS so it is idempotent.
export const SCHEMA_SQL = `-- Vela schema. Applied with CREATE TABLE IF NOT EXISTS so it is idempotent.
CREATE TABLE IF NOT EXISTS customer (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_email_uniq ON customer (lower(email));

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
  committed INTEGER NOT NULL DEFAULT 0
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
  shipping_address JSONB,
  shipping_method TEXT,
  protection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE TABLE IF NOT EXISTS cart_line (
  id BIGSERIAL PRIMARY KEY,
  cart_id BIGINT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  variant_id BIGINT NOT NULL REFERENCES variant(id),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_minor BIGINT NOT NULL,
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE IF NOT EXISTS order_number_seq (
  year INTEGER PRIMARY KEY,
  next_number INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_row (
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
  shipping_method TEXT,
  shipping_address JSONB,
  access_token_hash TEXT NOT NULL,
  killbill_external_key TEXT,
  killbill_invoice_amount NUMERIC(12,2),
  idempotency_key TEXT UNIQUE,
  placed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_line (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES order_row(id) ON DELETE CASCADE,
  variant_id BIGINT NOT NULL REFERENCES variant(id),
  title_snapshot TEXT NOT NULL,
  sku_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_minor BIGINT NOT NULL,
  total_minor BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS device (
  id BIGSERIAL PRIMARY KEY,
  serial TEXT NOT NULL,
  product_id BIGINT NOT NULL REFERENCES product(id),
  variant_id BIGINT NOT NULL REFERENCES variant(id),
  status TEXT NOT NULL CHECK (status IN ('manufactured','sold','registered','blocked')),
  blocked_reason TEXT,
  firmware_version TEXT,
  firmware_reported_at TIMESTAMPTZ,
  nickname TEXT,
  order_id BIGINT REFERENCES order_row(id),
  warranty_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS device_serial_uniq ON device (upper(serial));

CREATE TABLE IF NOT EXISTS device_ownership (
  id BIGSERIAL PRIMARY KEY,
  device_id BIGINT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  customer_id BIGINT REFERENCES customer(id),
  order_id BIGINT REFERENCES order_row(id),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  method TEXT NOT NULL CHECK (method IN ('order','manual','support'))
);
CREATE UNIQUE INDEX IF NOT EXISTS device_ownership_one_live ON device_ownership (device_id) WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS app_release (
  id BIGSERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  version_ord INTEGER NOT NULL,
  build INTEGER NOT NULL UNIQUE,
  released_on DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'general',
  artifact_name TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  description TEXT,
  notes JSONB NOT NULL
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
  device_id BIGINT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  firmware_id BIGINT NOT NULL REFERENCES firmware(id),
  state TEXT NOT NULL DEFAULT 'started' CHECK (state IN ('started','succeeded','failed')),
  reported_version TEXT,
  failure_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS flash_session_one_started ON flash_session (device_id) WHERE state = 'started';

CREATE TABLE IF NOT EXISTS auth_token (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  customer_id BIGINT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
