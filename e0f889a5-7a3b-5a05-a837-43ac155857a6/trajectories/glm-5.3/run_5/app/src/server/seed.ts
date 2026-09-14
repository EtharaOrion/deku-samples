import { q, one } from './db.js';
import { hashPassword, sha256Hex } from './auth.js';
import { logEvent } from './log.js';
import { PRODUCTS, RELEASES, FIRMWARE, DEVICES, SEED_PASSWORD } from './seed-data.js';

/** Seeding is idempotent: restarting the app must not duplicate rows. */
export async function seed(): Promise<void> {
  // Customers
  const pw = await hashPassword(SEED_PASSWORD);
  for (const [email, name] of [['customer@example.com', 'Iris Vantaa'], ['customer2@example.com', 'Rune Halden']] as const) {
    await q(
      `INSERT INTO customer (email, email_folded, name, password_hash, status)
       VALUES ($1,$2,$3,$4,'active')
       ON CONFLICT (email_folded) DO UPDATE SET name = EXCLUDED.name`,
      [email, email.toLowerCase(), name, pw]);
  }
  const customerId = async (email: string) =>
    (await one<{ id: number }>(`SELECT id FROM customer WHERE email_folded = $1`, [email]))!.id;
  const c1 = await customerId('customer@example.com');
  const c2 = await customerId('customer2@example.com');

  // Products, variants, inventory and typed blocks
  for (const p of PRODUCTS) {
    const row = await one<{ id: number }>(
      `INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (handle) DO UPDATE SET title=EXCLUDED.title, subtitle=EXCLUDED.subtitle, kind=EXCLUDED.kind,
         status=EXCLUDED.status, support_until=EXCLUDED.support_until, position=EXCLUDED.position
       RETURNING id`,
      [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until ?? null, p.position]);
    const productId = row!.id;

    for (const [i, v] of p.variants.entries()) {
      const vr = await one<{ id: number }>(
        `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
         VALUES ($1,$2,$3,$4,$5,'USD',$6,$7)
         ON CONFLICT (sku) DO UPDATE SET product_id=EXCLUDED.product_id, title=EXCLUDED.title,
           option_value=EXCLUDED.option_value, price_minor=EXCLUDED.price_minor, position=EXCLUDED.position,
           inventory_policy=EXCLUDED.inventory_policy
         RETURNING id`,
        [productId, v.sku, v.title, v.option_value, v.price_minor, i + 1, v.inventory_policy ?? 'deny']);
      await q(
        `INSERT INTO inventory_level (variant_id, available, committed) VALUES ($1,$2,0)
         ON CONFLICT (variant_id) DO NOTHING`,
        [vr!.id, v.available]);
    }

    await q(`DELETE FROM product_block WHERE product_id = $1`, [productId]);
    for (const [i, b] of p.blocks.entries()) {
      await q(`INSERT INTO product_block (product_id, kind, position, payload) VALUES ($1,$2,$3,$4)`,
        [productId, b.kind, i + 1, JSON.stringify(b)]);
    }
  }

  const productId = async (handle: string) =>
    (await one<{ id: number }>(`SELECT id FROM product WHERE handle = $1`, [handle]))!.id;
  const variantId = async (sku: string) =>
    (await one<{ id: number }>(`SELECT id FROM variant WHERE sku = $1`, [sku]))!.id;

  // Application releases, ordered by build, never by release date
  for (const r of RELEASES) {
    await q(
      `INSERT INTO app_release (version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes)
       VALUES ($1,$2,$3,'general',$4,$5,$6,$7,$8)
       ON CONFLICT (build) DO UPDATE SET version=EXCLUDED.version, released_on=EXCLUDED.released_on,
         artifact_name=EXCLUDED.artifact_name, size_bytes=EXCLUDED.size_bytes, sha256=EXCLUDED.sha256,
         description=EXCLUDED.description, notes=EXCLUDED.notes`,
      [r.version, r.build, r.released_on, r.artifact_name, r.size_bytes,
       r.sha256 ?? sha256Hex(`vela-arranger-${r.artifact_name}`), r.description, JSON.stringify(r.notes)]);
  }

  // Firmware
  for (const f of FIRMWARE) {
    await q(
      `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (product_id, build) DO UPDATE SET version=EXCLUDED.version, min_firmware=EXCLUDED.min_firmware,
         min_app_version=EXCLUDED.min_app_version, channel=EXCLUDED.channel, size_bytes=EXCLUDED.size_bytes,
         sha256=EXCLUDED.sha256, released_on=EXCLUDED.released_on`,
      [await productId(f.product_handle), f.version, f.build, f.min_firmware, f.min_app_version, f.channel,
       f.size_bytes, sha256Hex(`vela-firmware-${f.product_handle}-${f.build}`), f.released_on]);
  }

  // Seeded order VE-2026-0001 for customer@example.com: confirmed and fulfilled
  const existingOrder = await one<{ id: number }>(`SELECT id FROM "order" WHERE number = 'VE-2026-0001'`);
  if (!existingOrder) {
    const subtotal = 29900, tax = 2990, total = 32890;
    const accessToken = sha256Hex('seed-order-0001-access');
    const order = await one<{ id: number }>(
      `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, total_minor,
          currency, status, payment_status, fulfilment_status, shipping_method, shipping_address,
          marketing_consent, protection_minor, discount_minor, access_token_hash, placed_at)
       VALUES ('VE-2026-0001',$1,'customer@example.com',$2,0,$3,$4,'USD','confirmed','invoiced','fulfilled',
          'Standard',$5,false,0,0,$6, now() - interval '4 days')
       RETURNING id`,
      [c1, subtotal, tax, total, JSON.stringify({
        name: 'Iris Vantaa', line1: '12 Meridian Row', line2: '', city: 'Portland', region: 'OR',
        postal_code: '97205', country: 'US', phone: '',
      }), accessToken]);
    const cricketVariant = await variantId('VELA-CRICKET-GRAPHITE');
    const line = await one<{ id: number }>(
      `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
       VALUES ($1,$2,'Vela Cricket — Graphite','VELA-CRICKET-GRAPHITE',1,$3,$3) RETURNING id`,
      [order!.id, cricketVariant, 29900]);
    // The serial allocated to that camera line
    await q(`INSERT INTO device_serial (order_id, order_line_id, variant_id, serial)
             VALUES ($1,$2,$3,'VC2609PVDA7Q') ON CONFLICT (serial) DO NOTHING`,
      [order!.id, line!.id, cricketVariant]);
    // Stock reflects the sale
    await q(`UPDATE inventory_level SET available = 12, committed = 1 WHERE variant_id = $1`, [cricketVariant]);
  }

  // Devices and their ownership
  for (const d of DEVICES) {
    const pid = await productId(d.product_handle);
    const vid = await variantId(d.variant_sku);
    await q(
      `INSERT INTO device (serial, serial_folded, product_id, variant_id, status, blocked_reason,
                           firmware_version, firmware_reported_at, nickname, order_id, warranty_until)
       VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (serial_folded) DO UPDATE SET status=EXCLUDED.status, blocked_reason=EXCLUDED.blocked_reason,
         firmware_version=EXCLUDED.firmware_version, nickname=EXCLUDED.nickname, warranty_until=EXCLUDED.warranty_until`,
      [d.serial.toUpperCase(), pid, vid, d.status, d.blocked_reason ?? null, d.firmware_version ?? null,
       d.firmware_version ? new Date().toISOString() : null, d.nickname ?? null, null, d.warranty_until ?? null]);

    const dev = (await one<{ id: number; owner: number | null }>(
      `SELECT d.id, o.customer_id AS owner FROM device d
        LEFT JOIN device_ownership o ON o.device_id = d.id AND o.released_at IS NULL
       WHERE d.serial_folded = $1`, [d.serial.toUpperCase()]))!;

    if (d.owner_email) {
      const cid = d.owner_email === 'customer@example.com' ? c1 : c2;
      if (!dev.owner) {
        await q(`INSERT INTO device_ownership (device_id, customer_id, method) VALUES ($1,$2,'order') ON CONFLICT DO NOTHING`, [dev.id, cid]);
      }
    }
    // A restart must never undo an ownership acquired at runtime, so the seed
    // only ever adds the ownership a device is meant to have.
  }

  // Order numbers continue after the seeded order.
  const maxSeq = await one<{ n: number | null }>(
    `SELECT MAX((regexp_replace(number, '^VE-[0-9]{4}-', ''))::int) AS n
       FROM "order" WHERE number ~ '^VE-[0-9]{4}-[0-9]{4}$'`);
  await q(`SELECT setval('order_number_seq', $1, true)`, [Math.max(Number(maxSeq?.n ?? 0), 1)]);

  logEvent('seed.done', {});
}
