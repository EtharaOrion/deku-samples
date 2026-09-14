import { pool, q } from './db/pool.ts';
import { hashPassword } from './crypto.ts';
import { SEED_PRODUCTS } from './data/products.ts';
import { SEED_RELEASES, versionOrd } from './data/releases.ts';
import { SEED_FIRMWARE, SEED_DEVICES, digestFor } from './data/devices.ts';

export const SEED_PASSWORD = 'deku-demo-pw-2026';

export async function migrateAndSeed(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  const { rows } = await pool.query('SELECT value FROM app_meta WHERE key = $1', ['seed_version']);
  if (rows.length > 0) {
    const seeded = String(rows[0].value);
    if (seeded === '2') return;
  }

  const { SCHEMA_SQL } = await import('./db/schema_sql.ts');
  await pool.query(SCHEMA_SQL);

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const passwordHash = await hashPassword(SEED_PASSWORD);

    for (const customer of [
      { email: 'customer@example.com', name: 'Iris Vantaa' },
      { email: 'customer2@example.com', name: 'Rune Halden' }
    ]) {
      await c.query(
        `INSERT INTO customer (email, name, password_hash, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT DO NOTHING`,
        [customer.email, customer.name, passwordHash]
      );
    }

    const customerIds: Record<string, string> = {};
    {
      const res = await c.query('SELECT id, lower(email) AS email FROM customer');
      for (const row of res.rows) customerIds[row.email] = String(row.id);
    }

    const productIdByHandle: Record<string, string> = {};
    const variantIdBySku: Record<string, string> = {};

    for (const p of SEED_PRODUCTS) {
      const existing = await c.query('SELECT id FROM product WHERE handle = $1', [p.handle]);
      let productId: string;
      if (existing.rows.length === 0) {
        const inserted = await c.query(
          `INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until ?? null, p.position]
        );
        productId = String(inserted.rows[0].id);
      } else {
        productId = String(existing.rows[0].id);
        await c.query(
          `UPDATE product SET title = $2, subtitle = $3, kind = $4, status = $5, support_until = $6, position = $7 WHERE id = $1`,
          [productId, p.title, p.subtitle, p.kind, p.status, p.support_until ?? null, p.position]
        );
        await c.query('DELETE FROM product_block WHERE product_id = $1', [productId]);
      }
      productIdByHandle[p.handle] = productId;

      for (const [index, v] of p.variants.entries()) {
        const existingVariant = await c.query('SELECT id FROM variant WHERE sku = $1', [v.sku]);
        let variantId: string;
        if (existingVariant.rows.length === 0) {
          const inserted = await c.query(
            `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
             VALUES ($1, $2, $3, $4, $5, 'USD', $6, $7) RETURNING id`,
            [productId, v.sku, v.title, v.option_value, v.price_minor, index + 1, v.policy ?? 'deny']
          );
          variantId = String(inserted.rows[0].id);
          await c.query(
            `INSERT INTO inventory_level (variant_id, available, committed) VALUES ($1, $2, 0) ON CONFLICT (variant_id) DO NOTHING`,
            [variantId, v.available]
          );
        } else {
          variantId = String(existingVariant.rows[0].id);
          await c.query('UPDATE variant SET title = $2, option_value = $3, price_minor = $4, position = $5 WHERE id = $1',
            [variantId, v.title, v.option_value, v.price_minor, index + 1]);
        }
        variantIdBySku[v.sku] = variantId;
      }

      for (const b of p.blocks) {
        await c.query(
          `INSERT INTO product_block (product_id, kind, position, payload) VALUES ($1, $2, $3, $4)`,
          [productId, b.kind, b.position, JSON.stringify(b.payload)]
        );
      }
    }

    // Order number sequence.
    await c.query(
      `INSERT INTO order_number_seq (year, next_number) VALUES (2026, 2)
       ON CONFLICT (year) DO UPDATE SET next_number = GREATEST(order_number_seq.next_number, 2)`
    );

    // Seeded order VE-2026-0001.
    const existingOrder = await c.query(`SELECT id FROM order_row WHERE number = 'VE-2026-0001'`);
    let orderId: string | null = null;
    if (existingOrder.rows.length === 0) {
      const inserted = await c.query(
        `INSERT INTO order_row
           (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, discount_minor, total_minor,
            currency, status, payment_status, fulfilment_status, shipping_method, shipping_address,
            access_token_hash, placed_at, created_at)
         VALUES ('VE-2026-0001', $1, $2, 29900, 0, 2990, 0, 32890, 'USD', 'confirmed', 'invoiced', 'fulfilled',
                 'Standard', $3, $4, now() - interval '21 days', now() - interval '21 days')
         RETURNING id`,
        [
          customerIds['customer@example.com'],
          'customer@example.com',
          JSON.stringify({ name: 'Iris Vantaa', line1: '4 Alder Row', line2: '', city: 'Portland', region: 'OR', postal_code: '97209', country: 'US', phone: '' }),
          'seed-order-0001-access'
        ]
      );
      orderId = String(inserted.rows[0].id);
      await c.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
         VALUES ($1, $2, 'Vela Cricket', 'VELA-CRICKET-GRAPHITE', 1, 29900, 29900)`,
        [orderId, variantIdBySku['VELA-CRICKET-GRAPHITE']]
      );
    } else {
      orderId = String(existingOrder.rows[0].id);
    }

    for (const d of SEED_DEVICES) {
      const productId = productIdByHandle[d.handle];
      const variantId = variantIdBySku[d.variant_sku];
      const existing = await c.query('SELECT id FROM device WHERE upper(serial) = upper($1)', [d.serial]);
      let deviceId: string;
      if (existing.rows.length === 0) {
        const inserted = await c.query(
          `INSERT INTO device (serial, product_id, variant_id, status, blocked_reason, firmware_version, firmware_reported_at, nickname, order_id, warranty_until)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [
            d.serial, productId, variantId, d.status, (d as any).blocked_reason ?? null,
            d.firmware_version, d.firmware_reported_at, d.nickname,
            d.order_number === 'VE-2026-0001' ? orderId : null, d.warranty_until
          ]
        );
        deviceId = String(inserted.rows[0].id);
      } else {
        deviceId = String(existing.rows[0].id);
      }
      if (d.owner_email) {
        const live = await c.query(
          `SELECT id FROM device_ownership WHERE device_id = $1 AND released_at IS NULL`,
          [deviceId]
        );
        if (live.rows.length === 0) {
          await c.query(
            `INSERT INTO device_ownership (device_id, customer_id, order_id, claimed_at, released_at, method)
             VALUES ($1, $2, $3, now() - interval '21 days', NULL, $4)`,
            [deviceId, customerIds[d.owner_email], d.order_number === 'VE-2026-0001' ? orderId : null, d.method]
          );
        }
      }
    }

    for (const r of SEED_RELEASES) {
      await c.query(
        `INSERT INTO app_release (version, version_ord, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes)
         VALUES ($1, $2, $3, $4, 'general', $5, $6, $7, $8, $9)
         ON CONFLICT (version) DO UPDATE SET
           version_ord = EXCLUDED.version_ord, build = EXCLUDED.build, released_on = EXCLUDED.released_on,
           artifact_name = EXCLUDED.artifact_name, size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256,
           description = EXCLUDED.description, notes = EXCLUDED.notes`,
        [r.version, versionOrd(r.version), r.build, r.released_on, r.artifact_name, r.size_bytes, r.sha256, r.description, JSON.stringify(r.notes)]
      );
    }

    for (const f of SEED_FIRMWARE) {
      await c.query(
        `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (product_id, build) DO UPDATE SET
           version = EXCLUDED.version, min_firmware = EXCLUDED.min_firmware, min_app_version = EXCLUDED.min_app_version,
           channel = EXCLUDED.channel, size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256, released_on = EXCLUDED.released_on`,
        [
          productIdByHandle[f.handle], f.version, f.build, f.min_firmware, f.min_app_version,
          f.channel, f.size_bytes, digestFor('firmware', `${f.handle}:${f.build}`), f.released_on
        ]
      );
    }

    await c.query(`INSERT INTO app_meta (key, value) VALUES ('seed_version', '2')
                   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
}

export async function waitForDatabase(retries = 30, delayMs = 1000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('database unreachable');
}
