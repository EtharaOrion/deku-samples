// Idempotent seed and schema apply. Restarting the app must not duplicate rows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, withTransaction } from './lib/db.js';
import { hashPassword } from './lib/auth.js';
import { SEED_PASSWORD, LETTER, RELEASES, FIRMWARE, PRODUCTS, DEVICES } from './seed-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SCHEMA_SQL = `-- Vela storefront schema. Fourteen tables. All timestamps UTC (timestamptz).

CREATE TABLE IF NOT EXISTS customer (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_email_key ON customer (lower(email));

CREATE TABLE IF NOT EXISTS product (
  id            BIGSERIAL PRIMARY KEY,
  handle        TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  subtitle      TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL CHECK (kind IN ('camera','accessory','spare','protection')),
  status        TEXT NOT NULL CHECK (status IN ('active','discontinued')),
  support_until DATE,
  position      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS variant (
  id               BIGSERIAL PRIMARY KEY,
  product_id       BIGINT NOT NULL REFERENCES product(id) ON DELETE RESTRICT,
  sku              TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  option_value     TEXT NOT NULL DEFAULT '',
  price_minor      BIGINT NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  position         INTEGER NOT NULL DEFAULT 0,
  inventory_policy TEXT NOT NULL DEFAULT 'deny' CHECK (inventory_policy IN ('deny','continue'))
);

CREATE TABLE IF NOT EXISTS inventory_level (
  variant_id BIGINT PRIMARY KEY REFERENCES variant(id) ON DELETE RESTRICT,
  available  INTEGER NOT NULL DEFAULT 0 CHECK (available >= 0),
  committed  INTEGER NOT NULL DEFAULT 0 CHECK (committed >= 0)
);

CREATE TABLE IF NOT EXISTS product_block (
  id         BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('lede','spec_group','in_the_box','compatibility','support_note')),
  position   INTEGER NOT NULL DEFAULT 0,
  payload    JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS cart (
  id               BIGSERIAL PRIMARY KEY,
  token            TEXT NOT NULL UNIQUE,
  customer_id      BIGINT REFERENCES customer(id) ON DELETE SET NULL,
  email            TEXT,
  shipping_method  TEXT,
  shipping_address JSONB,
  protection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE TABLE IF NOT EXISTS cart_line (
  id               BIGSERIAL PRIMARY KEY,
  cart_id          BIGINT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  variant_id       BIGINT NOT NULL REFERENCES variant(id) ON DELETE RESTRICT,
  quantity         INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_minor BIGINT NOT NULL,
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE IF NOT EXISTS "order" (
  id                      BIGSERIAL PRIMARY KEY,
  number                  TEXT NOT NULL UNIQUE,
  customer_id             BIGINT REFERENCES customer(id) ON DELETE SET NULL,
  email                   TEXT NOT NULL,
  subtotal_minor          BIGINT NOT NULL,
  shipping_minor          BIGINT NOT NULL DEFAULT 0,
  tax_minor               BIGINT NOT NULL DEFAULT 0,
  discount_minor          BIGINT NOT NULL DEFAULT 0,
  total_minor             BIGINT NOT NULL,
  currency                TEXT NOT NULL DEFAULT 'USD',
  status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  payment_status          TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','invoiced')),
  fulfilment_status       TEXT NOT NULL DEFAULT 'unfulfilled' CHECK (fulfilment_status IN ('unfulfilled','fulfilled')),
  shipping_method         TEXT,
  shipping_address        JSONB,
  access_token_hash       TEXT NOT NULL,
  killbill_external_key   TEXT,
  killbill_invoice_amount NUMERIC(18,2),
  idempotency_key         TEXT UNIQUE,
  placed_at               TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_line (
  id               BIGSERIAL PRIMARY KEY,
  order_id         BIGINT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  variant_id       BIGINT NOT NULL REFERENCES variant(id) ON DELETE RESTRICT,
  title_snapshot  TEXT NOT NULL,
  sku_snapshot    TEXT NOT NULL,
  quantity         INTEGER NOT NULL,
  unit_price_minor BIGINT NOT NULL,
  total_minor      BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS device (
  id                   BIGSERIAL PRIMARY KEY,
  firmware_channel     TEXT,
  serial               TEXT NOT NULL,
  product_id           BIGINT NOT NULL REFERENCES product(id) ON DELETE RESTRICT,
  variant_id           BIGINT NOT NULL REFERENCES variant(id) ON DELETE RESTRICT,
  status               TEXT NOT NULL CHECK (status IN ('manufactured','sold','registered','blocked')),
  blocked_reason       TEXT,
  firmware_version     TEXT,
  firmware_reported_at TIMESTAMPTZ,
  nickname             TEXT,
  order_id             BIGINT REFERENCES "order"(id) ON DELETE SET NULL,
  warranty_until       DATE
);
CREATE UNIQUE INDEX IF NOT EXISTS device_serial_key ON device (upper(serial));

CREATE TABLE IF NOT EXISTS device_ownership (
  id          BIGSERIAL PRIMARY KEY,
  device_id   BIGINT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  customer_id BIGINT REFERENCES customer(id) ON DELETE SET NULL,
  order_id    BIGINT REFERENCES "order"(id) ON DELETE SET NULL,
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  method      TEXT NOT NULL CHECK (method IN ('order','manual','support'))
);
CREATE UNIQUE INDEX IF NOT EXISTS device_ownership_one_live ON device_ownership (device_id) WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS app_release (
  id           BIGSERIAL PRIMARY KEY,
  version      TEXT NOT NULL UNIQUE,
  build        BIGINT NOT NULL UNIQUE,
  released_on  DATE NOT NULL,
  channel      TEXT NOT NULL DEFAULT 'general',
  artifact_name TEXT NOT NULL,
  size_bytes   BIGINT NOT NULL,
  sha256       TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  notes        JSONB NOT NULL DEFAULT '{"Newly Added":[],"Improvements":[],"Bug Fixes":[],"Known Issues":[]}'::jsonb
);

CREATE TABLE IF NOT EXISTS firmware (
  id              BIGSERIAL PRIMARY KEY,
  product_id      BIGINT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  version         TEXT NOT NULL,
  build           BIGINT NOT NULL,
  min_firmware    TEXT,
  min_app_version TEXT NOT NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('internal','beta','general','yanked')),
  size_bytes      BIGINT NOT NULL,
  sha256          TEXT NOT NULL,
  released_on     DATE NOT NULL,
  UNIQUE (product_id, build)
);

CREATE TABLE IF NOT EXISTS flash_session (
  id               BIGSERIAL PRIMARY KEY,
  device_id        BIGINT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  firmware_id      BIGINT NOT NULL REFERENCES firmware(id) ON DELETE RESTRICT,
  state            TEXT NOT NULL CHECK (state IN ('started','succeeded','failed')),
  reported_version TEXT,
  failure_reason   TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ
);

-- At most one started session per device.
CREATE UNIQUE INDEX IF NOT EXISTS flash_session_one_started
  ON flash_session (device_id) WHERE state = 'started';

-- Auth tokens: bearer tokens with an expiry. Money stays out of this table.
CREATE TABLE IF NOT EXISTS auth_token (
  id           BIGSERIAL PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  customer_id  BIGINT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_token_customer_idx ON auth_token (customer_id);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export async function applySchema() {
  await q(SCHEMA_SQL);
}

export async function seed() {
  await withTransaction(async (client) => {
    // customers
    const pass = hashPassword(SEED_PASSWORD);
    for (const [email, name] of [
      ['customer@example.com', 'Iris Vantaa'],
      ['customer2@example.com', 'Rune Halden'],
    ]) {
      await client.query(
        `INSERT INTO customer (email, name, password_hash, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT DO NOTHING`,
        [email, name, pass]
      );
    }

    const cust = {};
    for (const row of (await client.query('SELECT id, email FROM customer')).rows) {
      cust[row.email] = row.id;
    }

    // products, variants, inventory, blocks
    for (const p of PRODUCTS) {
      const res = await client.query(
        `INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (handle) DO UPDATE SET title = EXCLUDED.title, subtitle = EXCLUDED.subtitle,
           kind = EXCLUDED.kind, status = EXCLUDED.status, support_until = EXCLUDED.support_until,
           position = EXCLUDED.position
         RETURNING id`,
        [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position]
      );
      const productId = res.rows[0].id;
      let vpos = 1;
      for (const v of p.variants) {
        const vr = await client.query(
          `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
           VALUES ($1,$2,$3,$4,$5,'USD',$6,$7)
           ON CONFLICT (sku) DO UPDATE SET product_id = EXCLUDED.product_id, title = EXCLUDED.title,
             option_value = EXCLUDED.option_value, price_minor = EXCLUDED.price_minor, position = EXCLUDED.position
           RETURNING id`,
          [productId, v.sku, v.title, v.option_value, v.price_minor, vpos++, 'deny']
        );
        await client.query(
          `INSERT INTO inventory_level (variant_id, available, committed)
           VALUES ($1, $2, 0)
           ON CONFLICT (variant_id) DO NOTHING`,
          [vr.rows[0].id, v.available]
        );
      }
      await client.query('DELETE FROM product_block WHERE product_id = $1', [productId]);
      let bpos = 1;
      for (const b of p.blocks) {
        await client.query(
          `INSERT INTO product_block (product_id, kind, position, payload) VALUES ($1,$2,$3,$4)`,
          [productId, b.kind, bpos++, JSON.stringify(b.payload)]
        );
      }
    }

    const variantBySku = {};
    for (const row of (await client.query('SELECT id, sku FROM variant')).rows) {
      variantBySku[row.sku] = row.id;
    }
    const productByHandle = {};
    for (const row of (await client.query('SELECT id, handle FROM product')).rows) {
      productByHandle[row.handle] = row.id;
    }

    // the seeded order VE-2026-0001
    const orderNo = 'VE-2026-0001';
    const hasOrder = await client.query('SELECT id FROM "order" WHERE number = $1', [orderNo]);
    if (hasOrder.rowCount === 0) {
      const subtotal = 29900;
      const tax = Math.trunc((subtotal * 10) / 100);
      const total = subtotal + tax;
      const or = await client.query(
        `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor,
            discount_minor, total_minor, currency, status, payment_status, fulfilment_status,
            shipping_method, shipping_address, access_token_hash, placed_at)
         VALUES ($1,$2,$3,$4,0,$5,0,$6,'USD','confirmed','invoiced','fulfilled','standard',$7,$8, now())
         RETURNING id`,
        [
          orderNo,
          cust['customer@example.com'],
          'customer@example.com',
          subtotal,
          tax,
          total,
          JSON.stringify({ name: 'Iris Vantaa', line1: '14 Quay Street', city: 'Portland', region: 'OR', postal_code: '97204', country: 'US' }),
          'seeded-order-access-token',
        ]
      );
      const orderId = or.rows[0].id;
      await client.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
         VALUES ($1,$2,$3,$4,1,$5,$5)`,
        [orderId, variantBySku['VELA-CRICKET-GRAPHITE'], 'Vela Cricket — Graphite', 'VELA-CRICKET-GRAPHITE', 29900]
      );
      // its stock was committed once
      await client.query(
        `UPDATE inventory_level SET available = available - 1, committed = committed + 1 WHERE variant_id = $1`,
        [variantBySku['VELA-CRICKET-GRAPHITE']]
      );
    }

    // devices and ownership
    for (const d of DEVICES) {
      const res = await client.query(
        `INSERT INTO device (serial, product_id, variant_id, status, blocked_reason, firmware_version,
             firmware_reported_at, nickname, order_id, warranty_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          d.serial,
          productByHandle[d.product],
          variantBySku[d.variant],
          d.status,
          d.blocked_reason || null,
          d.firmware,
          d.firmware ? new Date() : null,
          null,
          null,
          d.warranty,
        ]
      );
      let deviceId = res.rows[0]?.id;
      if (!deviceId) {
        const again = await client.query('SELECT id FROM device WHERE upper(serial) = upper($1)', [d.serial]);
        deviceId = again.rows[0]?.id;
      }
      const orderId = d.order
        ? (await client.query('SELECT id FROM "order" WHERE number = $1', [d.order])).rows[0]?.id || null
        : null;
      if (d.owner) {
        await client.query(
          `INSERT INTO device_ownership (device_id, customer_id, order_id, method)
           SELECT $1, $2, $3, $4
           WHERE NOT EXISTS (SELECT 1 FROM device_ownership WHERE device_id = $1 AND released_at IS NULL)`,
          [deviceId, cust[d.owner], orderId, d.method || 'manual']
        );
        await client.query('UPDATE device SET status = $2 WHERE id = $1', [deviceId, 'registered']);
      }
      await client.query('UPDATE device SET order_id = $2 WHERE id = $1', [deviceId, orderId]);
    }

    // app releases
    for (const r of RELEASES) {
      await client.query(
        `INSERT INTO app_release (version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (version) DO NOTHING`,
        [r.version, r.build, r.released_on, r.channel, r.artifact_name, r.size_bytes, r.sha256, r.description, JSON.stringify(r.notes)]
      );
    }

    // firmware
    for (const f of FIRMWARE) {
      await client.query(
        `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (product_id, build) DO NOTHING`,
        [productByHandle[f.product], f.version, f.build, f.min_firmware, f.min_app_version, f.channel, f.size_bytes, fakeSha(f.build, f.product), f.released_on]
      );
    }

    await client.query(
      `INSERT INTO meta (key, value) VALUES ('seeded_at', now()::text)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
    );
  });
}

function fakeSha(build, product) {
  let s = `${product}-${build}-vela-firmware`;
  while (s.length < 64) s += s;
  return s.slice(0, 64).replace(/[^0-9a-f]/g, '0').padEnd(64, '0');
}
