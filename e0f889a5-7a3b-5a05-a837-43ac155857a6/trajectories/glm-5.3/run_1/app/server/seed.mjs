import bcrypt from 'bcryptjs';
import { ensureSchema } from './db.mjs';
import { newId, sha256, utcDate } from './env.mjs';
import * as kb from './killbill.mjs';
import { PRODUCT_BLOCKS, RELEASE_NOTES, digestFor, KB_DIGEST_200 } from '../data/content.mjs';

export const SEED_PASSWORD = 'deku-demo-pw-2026';

/** One invoice for one order, raised once: the account is reused and the
 *  invoice is only created when the order does not already hold one. */
async function raiseInvoice({ email, number, totalMinor }) {
  const account = await kb.ensureAccount({
    name: email,
    externalKey: email,
    email,
    currency: 'USD',
    country: 'US',
  });
  const already = await kb.findInvoiceByDescription(account.accountId, `Vela order ${number}`, totalMinor);
  if (already) return already;
  return kb.createInvoice({
    accountId: account.accountId,
    description: `Vela order ${number}`,
    totalMinor,
    currency: 'USD',
  });
}

const CUSTOMERS = [
  { email: 'customer@example.com', name: 'Iris Vantaa' },
  { email: 'customer2@example.com', name: 'Rune Halden' },
];

const PRODUCTS = [
  {
    handle: 'flagship', title: 'Vela A1', subtitle: 'The full frame body.', kind: 'camera', status: 'active',
    support_until: '2032-06-01', position: 1,
    variants: [
      { sku: 'VELA-A1-GRAPHITE', option_value: 'Graphite', price_minor: 89900, available: 4 },
      { sku: 'VELA-A1-SAND', option_value: 'Sand', price_minor: 89900, available: 6 },
      { sku: 'VELA-A1-YELLOW', option_value: 'Yellow', price_minor: 89900, available: 1 },
    ],
  },
  {
    handle: 'compact', title: 'Vela Cricket', subtitle: 'The small one for the days you would not carry a big one.', kind: 'camera', status: 'active',
    support_until: null, position: 2,
    variants: [
      { sku: 'VELA-CRICKET-GRAPHITE', option_value: 'Graphite', price_minor: 29900, available: 12 },
      { sku: 'VELA-CRICKET-YELLOW', option_value: 'Yellow', price_minor: 29900, available: 0 },
    ],
  },
  {
    handle: 'mount', title: 'Monitor Mount', subtitle: 'A clamp and a plate.', kind: 'accessory', status: 'discontinued',
    support_until: '2029-09-01', position: 3,
    variants: [
      { sku: 'VELA-MOUNT-CLAMP', option_value: 'Clamp', price_minor: 4900, available: 0 },
      { sku: 'VELA-MOUNT-VESA', option_value: 'VESA', price_minor: 4900, available: 0 },
    ],
  },
  {
    handle: 'case', title: 'Travel Case', subtitle: 'Fitted for one camera and two lenses.', kind: 'accessory', status: 'active',
    support_until: null, position: 4,
    variants: [{ sku: 'VELA-CASE-STD', option_value: 'Standard', price_minor: 7900, available: 15 }],
  },
  {
    handle: 'cable', title: 'Replacement Cable', subtitle: 'The one that ships with the cameras.', kind: 'spare', status: 'active',
    support_until: null, position: 5,
    variants: [
      { sku: 'VELA-CABLE-1M', option_value: '1 m', price_minor: 1900, available: 30 },
      { sku: 'VELA-CABLE-2M', option_value: '2 m', price_minor: 2400, available: 30 },
    ],
  },
];

const PROTECTION = {
  handle: 'protection', title: 'Shipment protection', subtitle: 'Cover against loss, theft and damage.', kind: 'protection', status: 'active',
  support_until: null, position: 90,
  variants: [
    { sku: 'VELA-PROTECT-1', option_value: 'Under $100', price_minor: 98, available: 9999 },
    { sku: 'VELA-PROTECT-2', option_value: 'Under $500', price_minor: 298, available: 9999 },
    { sku: 'VELA-PROTECT-3', option_value: 'Under $1000', price_minor: 598, available: 9999 },
    { sku: 'VELA-PROTECT-4', option_value: 'Over $1000', price_minor: 1198, available: 9999 },
  ],
};

const RELEASES = [
  { version: '2.0.0', build: 2000, released_on: '2024-12-11', artifact_name: 'arranger-2.0.0.dmg', size_bytes: 154876459, sha256: KB_DIGEST_200 },
  { version: '1.4.4', build: 1440, released_on: '2024-06-26', artifact_name: 'arranger-1.4.4.dmg', size_bytes: 160301059, sha256: digestFor('1.4.4') },
  { version: '1.4.3', build: 1430, released_on: '2024-05-20', artifact_name: 'arranger-1.4.3.dmg', size_bytes: 158220144, sha256: digestFor('1.4.3') },
  { version: '1.4.2', build: 1420, released_on: '2024-05-20', artifact_name: 'arranger-1.4.2.dmg', size_bytes: 157903622, sha256: digestFor('1.4.2') },
];

const FIRMWARE = [
  { product: 'compact', version: '7.2', build: 720, channel: 'general', min_firmware: '6.11', min_app_version: '1.4.0', size_bytes: 18375632, released_on: '2026-05-14' },
  { product: 'compact', version: '7.0', build: 700, channel: 'general', min_firmware: '6.11', min_app_version: '1.4.0', size_bytes: 18224117, released_on: '2026-03-02' },
  { product: 'compact', version: '6.11', build: 611, channel: 'general', min_firmware: null, min_app_version: '1.0.0', size_bytes: 17912045, released_on: '2025-11-18' },
  { product: 'flagship', version: '2.4', build: 240, channel: 'general', min_firmware: '2.0', min_app_version: '2.0.0', size_bytes: 21458601, released_on: '2026-04-08' },
];

const DEVICES = [
  { serial: 'VC2609PVDA7Q', product: 'compact', variant: 'VELA-CRICKET-GRAPHITE', status: 'registered', owner: 'customer@example.com', order: 'VE-2026-0001', firmware_version: '7.0', firmware_reported_at: '2026-05-20T10:00:00Z', nickname: null, warranty_until: null },
  { serial: 'VA2609NRWB2Z', product: 'flagship', variant: 'VELA-A1-SAND', status: 'registered', owner: 'customer2@example.com', order: null, firmware_version: '2.4', firmware_reported_at: '2026-05-01T09:00:00Z', nickname: null, warranty_until: null },
  { serial: 'VA2609KTMHX4', product: 'flagship', variant: 'VELA-A1-GRAPHITE', status: 'sold', owner: null, order: null, firmware_version: null, firmware_reported_at: null, nickname: null, warranty_until: null },
  { serial: 'VC2609WJ3DKT', product: 'compact', variant: 'VELA-CRICKET-YELLOW', status: 'blocked', owner: null, order: null, firmware_version: null, firmware_reported_at: null, nickname: null, warranty_until: null, blocked_reason: 'reported_stolen' },
];

async function upsert(db, sql, params) {
  return db.query(sql, params);
}

export async function seed(db) {
  await ensureSchema(db);

  // customers
  const hash = await bcrypt.hash(SEED_PASSWORD, 10);
  for (const c of CUSTOMERS) {
    await db.query(
      `INSERT INTO customer (email, name, password_hash, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (LOWER(email)) DO UPDATE SET name = EXCLUDED.name`,
      [c.email, c.name, hash]
    );
  }

  // products + variants + inventory + blocks
  const allProducts = [...PRODUCTS, PROTECTION];
  for (const p of allProducts) {
    const r = await db.query(
      `INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (LOWER(handle)) DO UPDATE SET title=EXCLUDED.title, subtitle=EXCLUDED.subtitle, kind=EXCLUDED.kind,
         status=EXCLUDED.status, support_until=EXCLUDED.support_until, position=EXCLUDED.position
       RETURNING id`,
      [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position]
    );
    const pid = r.rows[0].id;
    for (let i = 0; i < p.variants.length; i++) {
      const v = p.variants[i];
      const vr = await db.query(
        `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
         VALUES ($1,$2,$3,$4,$5,'USD',$6,'deny')
         ON CONFLICT (LOWER(sku)) DO UPDATE SET price_minor=EXCLUDED.price_minor, option_value=EXCLUDED.option_value,
           title=EXCLUDED.title, position=EXCLUDED.position, product_id=EXCLUDED.product_id
         RETURNING id`,
        [pid, v.sku, v.option_value, v.option_value, v.price_minor, i + 1]
      );
      const vid = vr.rows[0].id;
      await db.query(
        `INSERT INTO inventory_level (variant_id, available, committed) VALUES ($1,$2,0)
         ON CONFLICT (variant_id) DO UPDATE SET available = EXCLUDED.available`,
        [vid, v.available]
      );
    }
    const blocks = PRODUCT_BLOCKS[p.handle] || [];
    await db.query(`DELETE FROM product_block WHERE product_id = $1`, [pid]);
    for (const b of blocks) {
      await db.query(
        `INSERT INTO product_block (product_id, kind, position, payload) VALUES ($1,$2,$3,$4)`,
        [pid, b.kind, b.position, JSON.stringify(b.payload)]
      );
    }
  }

  // firmware
  for (const f of FIRMWARE) {
    const pid = (await db.query(`SELECT id FROM product WHERE handle = $1`, [f.product])).rows[0].id;
    await db.query(
      `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (product_id, build) DO UPDATE SET version=EXCLUDED.version, min_firmware=EXCLUDED.min_firmware,
         min_app_version=EXCLUDED.min_app_version, channel=EXCLUDED.channel, size_bytes=EXCLUDED.size_bytes,
         sha256=EXCLUDED.sha256, released_on=EXCLUDED.released_on`,
      [pid, f.version, f.build, f.min_firmware, f.min_app_version, f.channel, f.size_bytes, digestFor(`fw:${f.product}:${f.version}`), f.released_on]
    );
  }

  // app releases
  for (const r of RELEASES) {
    const meta = RELEASE_NOTES[r.version] || {};
    await db.query(
      `INSERT INTO app_release (version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes)
       VALUES ($1,$2,$3,'general',$4,$5,$6,$7,$8)
       ON CONFLICT (build) DO UPDATE SET version=EXCLUDED.version, released_on=EXCLUDED.released_on,
         artifact_name=EXCLUDED.artifact_name, size_bytes=EXCLUDED.size_bytes, sha256=EXCLUDED.sha256,
         description=EXCLUDED.description, notes=EXCLUDED.notes`,
      [r.version, r.build, r.released_on, r.artifact_name, r.size_bytes, r.sha256, meta.description || '', JSON.stringify(meta.notes || [])]
    );
  }

  // devices + ownership
  for (const d of DEVICES) {
    const pid = (await db.query(`SELECT id FROM product WHERE handle=$1`, [d.product])).rows[0].id;
    const vid = (await db.query(`SELECT id FROM variant WHERE sku=$1`, [d.variant])).rows[0].id;
    const dr = await db.query(
      `INSERT INTO device (serial, product_id, variant_id, status, blocked_reason, firmware_version, firmware_reported_at, nickname, warranty_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (LOWER(serial)) DO UPDATE SET status=EXCLUDED.status, blocked_reason=EXCLUDED.blocked_reason,
         product_id=EXCLUDED.product_id, variant_id=EXCLUDED.variant_id
       RETURNING id`,
      [d.serial, pid, vid, d.status, d.blocked_reason || null, d.firmware_version, d.firmware_reported_at, d.nickname, d.warranty_until]
    );
    const did = dr.rows[0].id;
    // release any stale live row, and drop rows seeded by an older run so the
    // ownership history stays exactly as specified after a restart.
    await db.query(`UPDATE device_ownership SET released_at = now() WHERE device_id = $1 AND released_at IS NULL`, [did]);
    await db.query(`DELETE FROM device_ownership WHERE device_id = $1`, [did]);
    if (d.owner) {
      const cid = (await db.query(`SELECT id FROM customer WHERE email=$1`, [d.owner])).rows[0].id;
      let orderId = null;
      if (d.order) {
        const o = await db.query(`SELECT id FROM orders WHERE number=$1`, [d.order]);
        if (o.rows.length) orderId = o.rows[0].id;
      }
      await db.query(
        `INSERT INTO device_ownership (device_id, customer_id, order_id, method) VALUES ($1,$2,$3,$4)`,
        [did, cid, orderId, orderId ? 'order' : 'manual']
      );
    }
  }

  // the seeded order VE-2026-0001
  const existing = await db.query(`SELECT id, killbill_external_key FROM orders WHERE number = 'VE-2026-0001'`);
  if (!existing.rows.length) {
    const cid = (await db.query(`SELECT id FROM customer WHERE email=$1`, ['customer@example.com'])).rows[0].id;
    const vid = (await db.query(`SELECT id FROM variant WHERE sku=$1`, ['VELA-CRICKET-GRAPHITE'])).rows[0].id;
    const subtotal = 29900, tax = 2990, total = 32890;
    const o = await db.query(
      `INSERT INTO orders (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, total_minor, currency,
        status, payment_status, fulfilment_status, shipping_method, shipping_address, access_token_hash, placed_at)
       VALUES ('VE-2026-0001',$1,'customer@example.com',$2,0,$3,$4,'USD','confirmed','unpaid','fulfilled','Standard',$5,$6, now())
       RETURNING id`,
      [cid, subtotal, tax, total, JSON.stringify({ name: 'Iris Vantaa', line1: '12 Harbour Row', line2: '', city: 'Portland', region: 'ME', postal_code: '04101', country: 'US', phone: '' }), sha256(newId(18))]
    );
    await db.query(
      `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, serials)
       VALUES ($1,$2,'Vela Cricket','VELA-CRICKET-GRAPHITE',1,29900,29900, ARRAY['VC2609PVDA7Q']::text[])`,
      [o.rows[0].id, vid]
    );
    // The seeded order is confirmed and invoiced, so the invoice exists in the
    // billing platform itself rather than only in this database.
    try {
      const inv = await raiseInvoice({ email: 'customer@example.com', number: 'VE-2026-0001', totalMinor: total });
      await db.query(
        `UPDATE orders SET payment_status='invoiced', killbill_external_key=$1, killbill_invoice_amount=$2 WHERE id=$3`,
        ['customer@example.com', inv.amount, o.rows[0].id]
      );
    } catch (e) {
      // The order still reads correctly; a later confirmed order will retry billing.
      process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: 'warn', scope: 'seed', message: `seed invoice skipped: ${e.message}` }) + '\n');
    }
  } else if (!existing.rows[0].killbill_external_key) {
    // A database seeded by an older run catches up with billing on restart.
    try {
      const inv = await raiseInvoice({ email: 'customer@example.com', number: 'VE-2026-0001', totalMinor: 32890 });
      await db.query(
        `UPDATE orders SET payment_status='invoiced', killbill_external_key=$1, killbill_invoice_amount=$2 WHERE number='VE-2026-0001'`,
        ['customer@example.com', inv.amount]
      );
    } catch {}
  }

  // sequence for order numbers
  await db.query(
    `SELECT setval('orders_id_seq', GREATEST((SELECT COALESCE(MAX(id),1) FROM orders), 1))`
  );
}

export async function isSeeded(db) {
  try {
    const r = await db.query(`SELECT COUNT(*)::int AS n FROM product`);
    return r.rows[0].n > 0;
  } catch { return false; }
}
