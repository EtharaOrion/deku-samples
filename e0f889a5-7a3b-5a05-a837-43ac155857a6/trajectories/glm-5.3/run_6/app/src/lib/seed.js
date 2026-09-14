import { db } from './db.js';
import { SCHEMA_SQL } from './schema.js';
import { hashPassword } from './tokens.js';
import { CUSTOMERS, PRODUCTS, RELEASES, FIRMWARE, DEVICES, SEED_ORDER } from './seed-data.js';
import { createHash } from 'node:crypto';
import { minorToDecimalString } from './money.js';
import { logEvent, logError } from './log.js';

export async function migrate() {
  const sql = db();
  await sql.unsafe(SCHEMA_SQL);
  logEvent('migrate.complete');
}

export async function seed() {
  const sql = db();
  const passwordHash = hashPassword(process.env.SEED_PASSWORD || 'deku-demo-pw-2026');

  // Customers
  for (const c of CUSTOMERS) {
    await sql`
      INSERT INTO customer (email, name, password_hash, status)
      VALUES (${c.email}, ${c.name}, ${passwordHash}, 'active')
      ON CONFLICT DO NOTHING
    `;
  }

  // Products, variants, inventory, blocks
  for (const p of PRODUCTS) {
    const [product] = await sql`
      INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
      VALUES (${p.handle}, ${p.title}, ${p.subtitle}, ${p.kind}, ${p.status},
              ${p.supportUntil || null}, ${p.position})
      ON CONFLICT (handle) DO NOTHING
      RETURNING id
    `;
    if (!product) continue;
    for (const v of p.variants) {
      const [variant] = await sql`
        INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
        VALUES (${product.id}, ${v.sku}, ${v.title}, ${v.optionValue}, ${v.priceMinor}, 'usd', ${v.position}, 'deny')
        ON CONFLICT (sku) DO NOTHING
        RETURNING id
      `;
      if (variant) {
        await sql`
          INSERT INTO inventory_level (variant_id, available, committed)
          VALUES (${variant.id}, ${v.available}, 0)
          ON CONFLICT DO NOTHING
        `;
      }
    }
    for (const b of p.blocks) {
      await sql`
        INSERT INTO product_block (product_id, kind, position, payload)
        VALUES (${product.id}, ${b.kind}, ${b.position}, ${sql.json(b.payload)})
      `;
    }
  }

  // Application releases
  for (const r of RELEASES) {
    await sql`
      INSERT INTO app_release (version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes)
      VALUES (${r.version}, ${r.build}, ${r.releasedOn}, ${r.channel}, ${r.artifactName},
              ${r.sizeBytes}, ${r.sha256}, ${r.description}, ${sql.json(r.notes)})
      ON CONFLICT (version) DO NOTHING
    `;
  }

  // Firmware
  for (const f of FIRMWARE) {
    const [product] = await sql`SELECT id FROM product WHERE handle = ${f.handle}`;
    if (!product) continue;
    const digest = createHash('sha256').update(`${f.handle}-firmware-${f.version}-${f.build}`).digest('hex');
    await sql`
      INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
      VALUES (${product.id}, ${f.version}, ${f.build}, ${f.minFirmware}, ${f.minAppVersion},
              ${f.channel}, ${f.sizeBytes}, ${digest}, ${f.releasedOn})
      ON CONFLICT (product_id, build) DO NOTHING
    `;
  }

  // Seed order, then devices and their ownership links
  const [seedCustomer] = await sql`SELECT id FROM customer WHERE lower(email) = ${SEED_ORDER.customerEmail.toLowerCase()}`;
  const [cricketVariant] = await sql`SELECT id, title FROM variant WHERE sku = ${SEED_ORDER.sku}`;
  const subtotal = SEED_ORDER.unitPriceMinor * SEED_ORDER.quantity;
  const total = subtotal + 0 + SEED_ORDER.taxMinor;
  const accessToken = 'seed-order-access-token';
  const accessTokenHash = createHash('sha256').update(accessToken).digest('hex');

  const [order] = await sql`
    INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, total_minor,
      currency, status, payment_status, fulfilment_status, shipping_method, shipping_address,
      access_token_hash, placed_at)
    VALUES (${SEED_ORDER.number}, ${seedCustomer ? seedCustomer.id : null}, ${SEED_ORDER.email},
      ${subtotal}, 0, ${SEED_ORDER.taxMinor}, ${total}, 'usd', ${SEED_ORDER.status},
      ${SEED_ORDER.paymentStatus}, ${SEED_ORDER.fulfilmentStatus}, ${SEED_ORDER.shippingMethod},
      ${sql.json(SEED_ORDER.shippingAddress)}, ${accessTokenHash}, ${SEED_ORDER.placedAt})
    ON CONFLICT (number) DO NOTHING
    RETURNING id
  `;
  if (order) {
    await sql`
      INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
      VALUES (${order.id}, ${cricketVariant.id}, ${cricketVariant.title}, ${SEED_ORDER.sku},
        ${SEED_ORDER.quantity}, ${SEED_ORDER.unitPriceMinor}, ${subtotal})
    `;
  }

  for (const d of DEVICES) {
    const [product] = await sql`SELECT id FROM product WHERE handle = ${d.handle}`;
    const [variant] = await sql`SELECT id FROM variant WHERE sku = ${d.sku}`;
    const [orderRow] = d.orderNumber
      ? await sql`SELECT id FROM "order" WHERE number = ${d.orderNumber}`
      : [null];
    const [customer] = d.ownerEmail
      ? await sql`SELECT id FROM customer WHERE lower(email) = ${d.ownerEmail.toLowerCase()}`
      : [null];
    const [device] = await sql`
      INSERT INTO device (serial, product_id, variant_id, status, blocked_reason, firmware_version,
        firmware_reported_at, nickname, order_id, warranty_until)
      VALUES (${d.serial}, ${product.id}, ${variant.id}, ${d.status}, ${d.blockedReason || null},
        ${d.firmwareVersion}, ${d.firmwareReportedAt}, ${d.nickname}, ${orderRow ? orderRow.id : null},
        ${d.warrantyUntil})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (device && customer) {
      await sql`
        INSERT INTO device_ownership (device_id, customer_id, order_id, method)
        VALUES (${device.id}, ${customer.id}, ${orderRow ? orderRow.id : null}, ${d.method})
        ON CONFLICT DO NOTHING
      `;
    }
  }

  // The seeded order is a real order: it holds an invoice in the billing
  // platform like any other confirmed order. This runs only when the order row
  // is created, and a failure here never blocks startup.
  if (order) {
    try {
      const { ensureAccount, raiseInvoice, externalKeyForEmail } = await import('./billing.js');
      const key = externalKeyForEmail(SEED_ORDER.email);
      const account = await ensureAccount({
        externalKey: key,
        name: SEED_ORDER.shippingAddress.name,
        email: SEED_ORDER.email.toLowerCase()
      });
      const { hasInvoiceForOrder } = await import('./billing.js');
      const alreadyInvoiced = await hasInvoiceForOrder(account.accountId, SEED_ORDER.number);
      const invoiceAmount = alreadyInvoiced
        ? minorToDecimalString(total)
        : (
            await raiseInvoice({
              accountId: account.accountId,
              orderNumber: SEED_ORDER.number,
              amountMinor: total,
              currency: 'USD'
            })
          ).amount;
      if (alreadyInvoiced) {
        logEvent('seed.invoice_skipped', { order: SEED_ORDER.number });
      }
      await sql`
        UPDATE "order"
        SET killbill_external_key = ${key}, killbill_invoice_amount = ${invoiceAmount}
        WHERE id = ${order.id} AND killbill_external_key IS NULL
      `;
    } catch (err) {
      logError('seed.invoice_failed', { error: err.message });
    }
  }

  logEvent('seed.complete');
}

let migrated = false;
export async function ensureReady() {
  if (migrated) return;
  await migrate();
  await seed();
  migrated = true;
}
