import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool, tx } from './db.js';
import { hashPassword, sha256, opaqueToken } from './auth.js';
import { logLine } from './log.js';
import {
  SEED_PASSWORD, customers, products, shippingMethods, releases, firmware, devices, seedOrder,
} from '../db/seed-data.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = await readFile(path.join(here, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
  logLine({ level: 'info', msg: 'schema applied' });
}

// Seeding is idempotent: restarting the app must not duplicate rows.
export async function seed() {
  await tx(async (c) => {
    // A single advisory lock so two containers starting at once do not race the seed.
    await c.query('SELECT pg_advisory_xact_lock($1)', [815234911]);

    const pwHash = await hashPassword(SEED_PASSWORD);
    const customerIds = new Map();
    for (const cu of customers) {
      const r = await c.query(
        `INSERT INTO customer (email, name, password_hash)
         VALUES ($1,$2,$3)
         ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [cu.email, cu.name, pwHash]
      );
      customerIds.set(cu.email, r.rows[0].id);
    }

    const productIds = new Map();
    const variantIds = new Map();
    for (const p of products) {
      const r = await c.query(
        `INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (handle) DO UPDATE SET
           title=EXCLUDED.title, subtitle=EXCLUDED.subtitle, kind=EXCLUDED.kind,
           status=EXCLUDED.status, support_until=EXCLUDED.support_until, position=EXCLUDED.position
         RETURNING id`,
        [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position]
      );
      const pid = r.rows[0].id;
      productIds.set(p.handle, pid);

      let vpos = 0;
      for (const v of p.variants) {
        vpos += 1;
        const vr = await c.query(
          `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
           VALUES ($1,$2,$3,$4,$5,'usd',$6,'deny')
           ON CONFLICT (sku) DO UPDATE SET
             product_id=EXCLUDED.product_id, title=EXCLUDED.title, option_value=EXCLUDED.option_value,
             price_minor=EXCLUDED.price_minor, position=EXCLUDED.position
           RETURNING id`,
          [pid, v.sku, v.option_value, v.option_value, v.price_minor, vpos]
        );
        const vid = vr.rows[0].id;
        variantIds.set(v.sku, vid);
        await c.query(
          `INSERT INTO inventory_level (variant_id, available, committed)
           VALUES ($1,$2,0)
           ON CONFLICT (variant_id) DO NOTHING`,
          [vid, v.available]
        );
      }

      await c.query('DELETE FROM product_block WHERE product_id = $1', [pid]);
      let bpos = 0;
      for (const b of p.blocks) {
        bpos += 1;
        await c.query(
          'INSERT INTO product_block (product_id, kind, position, payload) VALUES ($1,$2,$3,$4)',
          [pid, b.kind, bpos, JSON.stringify(b.payload)]
        );
      }
    }

    for (const s of shippingMethods) {
      await c.query(
        `INSERT INTO shipping_method (zone, country, code, label, price_minor, window_text, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (zone, code) DO UPDATE SET
           label=EXCLUDED.label, price_minor=EXCLUDED.price_minor,
           window_text=EXCLUDED.window_text, position=EXCLUDED.position`,
        [s.zone, s.country, s.code, s.label, s.price_minor, s.window_text, s.position]
      );
    }

    for (const r of releases) {
      await c.query(
        `INSERT INTO app_release (version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (version) DO UPDATE SET
           build=EXCLUDED.build, released_on=EXCLUDED.released_on, channel=EXCLUDED.channel,
           artifact_name=EXCLUDED.artifact_name, size_bytes=EXCLUDED.size_bytes, sha256=EXCLUDED.sha256,
           description=EXCLUDED.description, notes=EXCLUDED.notes`,
        [r.version, r.build, r.released_on, r.channel, r.artifact_name, r.size_bytes, r.sha256, r.description, JSON.stringify(r.notes)]
      );
    }

    for (const f of firmware) {
      const pid = productIds.get(f.product);
      await c.query(
        `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (product_id, build) DO UPDATE SET
           version=EXCLUDED.version, min_firmware=EXCLUDED.min_firmware, min_app_version=EXCLUDED.min_app_version,
           channel=EXCLUDED.channel, size_bytes=EXCLUDED.size_bytes, sha256=EXCLUDED.sha256, released_on=EXCLUDED.released_on`,
        [pid, f.version, f.build, f.min_firmware, f.min_app_version, f.channel, f.size_bytes, f.sha256, f.released_on]
      );
    }

    // The seeded order. Its number holds the counter at 1 so the first placed order is 0002.
    const year = Number(seedOrder.number.split('-')[1]);
    let seededOrderId = null;
    const existingOrder = await c.query('SELECT id FROM "order" WHERE number = $1', [seedOrder.number]);
    if (existingOrder.rows.length) {
      seededOrderId = existingOrder.rows[0].id;
    } else {
      const orderToken = opaqueToken();
      const or = await c.query(
        `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, discount_minor,
                              total_minor, currency, status, payment_status, fulfilment_status, shipping_method,
                              shipping_address, access_token_hash, killbill_external_key, placed_at)
         VALUES ($1,$2,$3,$4,$5,$6,0,$7,'usd',$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id`,
        [
          seedOrder.number, customerIds.get(seedOrder.email), seedOrder.email,
          seedOrder.subtotal_minor, seedOrder.shipping_minor, seedOrder.tax_minor, seedOrder.total_minor,
          seedOrder.status, seedOrder.payment_status, seedOrder.fulfilment_status, seedOrder.shipping_method,
          JSON.stringify(seedOrder.shipping_address), sha256(orderToken), seedOrder.email, seedOrder.placed_at,
        ]
      );
      seededOrderId = or.rows[0].id;
      let lpos = 0;
      for (const l of seedOrder.lines) {
        lpos += 1;
        const vid = variantIds.get(l.sku);
        const prod = products.find((p) => p.variants.some((v) => v.sku === l.sku));
        const variant = prod.variants.find((v) => v.sku === l.sku);
        await c.query(
          `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [seededOrderId, vid, `${prod.title} — ${variant.option_value}`, l.sku, l.quantity, l.unit_price_minor, l.unit_price_minor * l.quantity, lpos]
        );
      }
    }

    await c.query(
      `INSERT INTO order_counter (year, last_value) VALUES ($1,1)
       ON CONFLICT (year) DO UPDATE SET last_value = GREATEST(order_counter.last_value, 1)`,
      [year]
    );

    for (const d of devices) {
      const pid = productIds.get(d.product);
      const vid = variantIds.get(d.sku);
      const orderId = d.order === seedOrder.number ? seededOrderId : null;
      const dr = await c.query(
        `INSERT INTO device (serial, product_id, variant_id, status, blocked_reason, firmware_version,
                             firmware_reported_at, nickname, order_id, warranty_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (upper(serial)) DO NOTHING
         RETURNING id`,
        [
          d.serial, pid, vid, d.status, d.blocked_reason ?? null, d.firmware_version ?? null,
          d.firmware_version ? new Date('2026-02-02T09:00:00Z') : null, d.nickname ?? null, orderId, d.warranty_until ?? null,
        ]
      );
      let deviceId = dr.rows[0]?.id;
      if (!deviceId) {
        const ex = await c.query('SELECT id FROM device WHERE upper(serial) = upper($1)', [d.serial]);
        deviceId = ex.rows[0].id;
      }
      if (d.owner) {
        await c.query(
          `INSERT INTO device_ownership (device_id, customer_id, order_id, method)
           SELECT $1,$2,$3,$4
           WHERE NOT EXISTS (SELECT 1 FROM device_ownership WHERE device_id = $1 AND released_at IS NULL)`,
          [deviceId, customerIds.get(d.owner), orderId, orderId ? 'order' : 'manual']
        );
      }
    }
  });
  logLine({ level: 'info', msg: 'seed applied' });
}
