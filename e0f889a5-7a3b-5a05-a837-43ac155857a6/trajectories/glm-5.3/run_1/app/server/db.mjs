import pg from 'pg';

const schemas = new Set();

/** Proxied pg.Pool: rewrites thrown errors so the message names what was violated. */
export function makePool(url) {
  const pool = new pg.Pool({ connectionString: url, max: 20, idleTimeoutMillis: 30000 });
  const q = async (...args) => {
    try {
      return await pool.query(...args);
    } catch (e) {
      throw rewriteError(e);
    }
  };
  q.query = q;
  q.connect = (...a) => pool.connect(...a);
  q._pool = pool;
  q.on = (...a) => pool.on(...a);
  q.end = (...a) => pool.end(...a);
  return q;
}

export function rewriteError(e) {
  if (!e || !e.code) return e;
  const c = String(e.code);
  if (c === '23505' || c === '23P01') {
    let res = 'conflict: that value is already taken';
    let field = null;
    try {
      if (e.detail) {
        const m = /Key \(([^)]+)\)=\(([^)]*)\)/.exec(e.detail);
        if (m) {
          field = m[1].split(',')[0].trim();
          res = `conflict: ${field} ${m[2]} is already taken`;
        }
      }
    } catch {}
    const err = new Error(res);
    err.code = 'CONFLICT';
    err.pgCode = c;
    err.status = 409;
    err.field = field;
    return err;
  }
  if (c === '23514') {
    const err = new Error(`out of state: ${e.constraint || 'check'}`);
    err.code = 'OUT_OF_STATE'; err.status = 409; err.field = e.constraint; return err;
  }
  if (c === '23503') {
    const err = new Error(`missing reference: ${e.constraint || 'foreign key'}`);
    err.code = 'BAD_REFERENCE'; err.status = 400; err.field = e.constraint; return err;
  }
  if (c === '40001') { const err = new Error('conflict: serialized, retry'); err.code = 'RETRY'; err.status = 409; return err; }
  if (c === '40P01') { const err = new Error('conflict: deadlock, retry'); err.code = 'RETRY'; err.status = 409; return err; }
  return e;
}

export async function ensureSchema(db) {
  const k = 'schema';
  if (schemas.has(k)) return;
  await db.query(`
  CREATE TABLE IF NOT EXISTS customer (
    id bigserial PRIMARY KEY,
    email text NOT NULL,
    name text NOT NULL,
    password_hash text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS product (
    id bigserial PRIMARY KEY,
    handle text NOT NULL,
    title text NOT NULL,
    subtitle text,
    kind text NOT NULL CHECK (kind IN ('camera','accessory','spare','protection')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','discontinued')),
    support_until date,
    position integer NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS variant (
    id bigserial PRIMARY KEY,
    product_id bigint NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    sku text NOT NULL,
    title text NOT NULL,
    option_value text NOT NULL,
    price_minor bigint NOT NULL CHECK (price_minor >= 0),
    currency text NOT NULL DEFAULT 'USD',
    position integer NOT NULL DEFAULT 0,
    inventory_policy text NOT NULL DEFAULT 'deny' CHECK (inventory_policy IN ('deny','continue'))
  );
  CREATE TABLE IF NOT EXISTS inventory_level (
    variant_id bigint PRIMARY KEY REFERENCES variant(id) ON DELETE CASCADE,
    available integer NOT NULL DEFAULT 0 CHECK (available >= 0),
    committed integer NOT NULL DEFAULT 0 CHECK (committed >= 0)
  );
  CREATE TABLE IF NOT EXISTS product_block (
    id bigserial PRIMARY KEY,
    product_id bigint NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('lede','spec_group','in_the_box','compatibility','support_note')),
    position integer NOT NULL DEFAULT 0,
    payload jsonb NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cart (
    id bigserial PRIMARY KEY,
    token text NOT NULL,
    customer_id bigint REFERENCES customer(id) ON DELETE SET NULL,
    email text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
    shipping_method text,
    shipping_address jsonb,
    marketing_consent boolean NOT NULL DEFAULT false,
    protection_enabled boolean NOT NULL DEFAULT false
  );
  CREATE TABLE IF NOT EXISTS cart_line (
    id bigserial PRIMARY KEY,
    cart_id bigint NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
    variant_id bigint NOT NULL REFERENCES variant(id) ON DELETE CASCADE,
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
    unit_price_minor bigint NOT NULL,
    UNIQUE (cart_id, variant_id)
  );
  CREATE TABLE IF NOT EXISTS orders (
    id bigserial PRIMARY KEY,
    number text NOT NULL,
    customer_id bigint REFERENCES customer(id) ON DELETE SET NULL,
    email text NOT NULL,
    subtotal_minor bigint NOT NULL DEFAULT 0,
    shipping_minor bigint NOT NULL DEFAULT 0,
    tax_minor bigint NOT NULL DEFAULT 0,
    total_minor bigint NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'USD',
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
    payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','invoiced')),
    fulfilment_status text NOT NULL DEFAULT 'unfulfilled' CHECK (fulfilment_status IN ('unfulfilled','fulfilled')),
    shipping_method text,
    shipping_address jsonb,
    access_token_hash text UNIQUE,
    killbill_external_key text,
    killbill_invoice_amount numeric(12,2),
    idempotency_key text UNIQUE,
    placed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS order_line (
    id bigserial PRIMARY KEY,
    order_id bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id bigint NOT NULL REFERENCES variant(id) ON DELETE RESTRICT,
    title_snapshot text NOT NULL,
    sku_snapshot text NOT NULL,
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
    unit_price_minor bigint NOT NULL,
    total_minor bigint NOT NULL,
    serials text[] NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS device (
    id bigserial PRIMARY KEY,
    serial text NOT NULL,
    product_id bigint NOT NULL REFERENCES product(id),
    variant_id bigint NOT NULL REFERENCES variant(id),
    status text NOT NULL DEFAULT 'manufactured' CHECK (status IN ('manufactured','sold','registered','blocked')),
    blocked_reason text,
    firmware_version text,
    firmware_reported_at timestamptz,
    nickname text,
    order_id bigint REFERENCES orders(id) ON DELETE SET NULL,
    warranty_until date,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS device_ownership (
    id bigserial PRIMARY KEY,
    device_id bigint NOT NULL REFERENCES device(id) ON DELETE CASCADE,
    customer_id bigint REFERENCES customer(id) ON DELETE SET NULL,
    order_id bigint REFERENCES orders(id) ON DELETE SET NULL,
    claimed_at timestamptz NOT NULL DEFAULT now(),
    released_at timestamptz,
    method text NOT NULL CHECK (method IN ('order','manual','support'))
  );
  CREATE TABLE IF NOT EXISTS app_release (
    id bigserial PRIMARY KEY,
    version text NOT NULL,
    build integer UNIQUE NOT NULL,
    released_on date NOT NULL,
    channel text NOT NULL DEFAULT 'general' CHECK (channel IN ('general','beta','internal')),
    artifact_name text NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 text NOT NULL,
    description text,
    notes jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS firmware (
    id bigserial PRIMARY KEY,
    product_id bigint NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    version text NOT NULL,
    build integer NOT NULL,
    min_firmware text,
    min_app_version text NOT NULL,
    channel text NOT NULL CHECK (channel IN ('internal','beta','general','yanked')),
    size_bytes bigint NOT NULL,
    sha256 text NOT NULL,
    released_on date NOT NULL,
    UNIQUE (product_id, build)
  );
  CREATE TABLE IF NOT EXISTS flash_session (
    id bigserial PRIMARY KEY,
    device_id bigint NOT NULL REFERENCES device(id) ON DELETE CASCADE,
    firmware_id bigint NOT NULL REFERENCES firmware(id),
    state text NOT NULL DEFAULT 'started' CHECK (state IN ('started','succeeded','failed')),
    reported_version text,
    failure_reason text,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz
  );
  CREATE UNIQUE INDEX IF NOT EXISTS customer_email_ci ON customer (LOWER(email));
  CREATE UNIQUE INDEX IF NOT EXISTS product_handle_ci ON product (LOWER(handle));
  CREATE UNIQUE INDEX IF NOT EXISTS variant_sku_ci ON variant (LOWER(sku));
  CREATE UNIQUE INDEX IF NOT EXISTS cart_token_ci ON cart (LOWER(token));
  CREATE UNIQUE INDEX IF NOT EXISTS orders_number_ci ON orders (LOWER(number));
  CREATE UNIQUE INDEX IF NOT EXISTS device_serial_ci ON device (LOWER(serial));
  CREATE UNIQUE INDEX IF NOT EXISTS app_release_version_ci ON app_release (LOWER(version));
  CREATE UNIQUE INDEX IF NOT EXISTS device_ownership_live ON device_ownership (device_id) WHERE released_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS device_one_started_session ON flash_session (device_id) WHERE state = 'started';
  `);
  schemas.add(k);
}

export async function inTx(db, fn) {
  const client = await db._pool.connect();
  const t = {
    query: async (...a) => {
      try { return await client.query(...a); } catch (e) { throw rewriteError(e); }
    },
  };
  try {
    await client.query('BEGIN');
    const out = await fn(t);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export const money = {
  toMinor: (s) => {
    const m = /^-?\d+/.exec(String(s).trim());
    return m ? parseInt(m[0], 10) : 0;
  },
};
