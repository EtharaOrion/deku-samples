import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { pool, withTransaction } from '../lib/db.mjs';
import { hashPassword } from '../lib/auth.mjs';

const SEED_PASSWORD = 'deku-demo-pw-2026';

const PRODUCTS = [
  {
    handle: 'flagship', title: 'Vela A1', kind: 'camera', status: 'active',
    support_until: '2032-06-01', position: 1,
    subtitle: 'The full-frame body, built to be repaired.',
    variants: [
      { sku: 'VELA-A1-GRAPHITE', option_value: 'Graphite', price_minor: 89900, available: 4, position: 1 },
      { sku: 'VELA-A1-SAND', option_value: 'Sand', price_minor: 89900, available: 6, position: 2 },
      { sku: 'VELA-A1-YELLOW', option_value: 'Yellow', price_minor: 89900, available: 1, position: 3 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'The A1 is the camera we make when nobody is asking us to hit a price. A magnesium chassis, a sensor we specified rather than selected, and a back panel held on by eight screws you are allowed to remove.' } },
      { kind: 'spec_group', payload: { title: 'Sensor and optics', rows: [
        { label: 'Sensor', value: '36.0 x 24.0 mm CMOS' },
        { label: 'Resolution', value: '61.0 MP' },
        { label: 'Mount', value: 'Vela V-mount' },
        { label: 'Shutter', value: '1/8000 s to 30 s' },
      ] } },
      { kind: 'spec_group', payload: { title: 'Body', rows: [
        { label: 'Mass', value: '712 g with battery' },
        { label: 'Dimensions', value: '138.0 x 97.0 x 78.0 mm' },
        { label: 'Weather sealing', value: 'IP53' },
        { label: 'Storage', value: '2 x CFexpress Type B' },
      ] } },
      { kind: 'in_the_box', payload: { items: ['Vela A1 body', 'Battery, 2200 mAh', 'Braided USB-C cable, 1 m', 'Strap', 'Printed teardown guide'] } },
      { kind: 'compatibility', payload: { minimum_os: 'macOS 13.0', minimum_app: '2.0.0', text: 'Arranger reads and writes the A1 over USB-C.' } },
    ],
  },
  {
    handle: 'compact', title: 'Vela Cricket', kind: 'camera', status: 'active',
    support_until: null, position: 2,
    subtitle: 'The small one. Same sensor pipeline, one hand.',
    variants: [
      { sku: 'VELA-CRICKET-GRAPHITE', option_value: 'Graphite', price_minor: 29900, available: 12, position: 1 },
      { sku: 'VELA-CRICKET-YELLOW', option_value: 'Yellow', price_minor: 29900, available: 0, position: 2 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'The Cricket is what we carry. It fits in a coat pocket, it starts in under a second, and it runs the same colour pipeline as the A1 because there was never a good reason for it not to.' } },
      { kind: 'spec_group', payload: { title: 'Sensor and optics', rows: [
        { label: 'Sensor', value: '23.5 x 15.6 mm CMOS' },
        { label: 'Resolution', value: '26.1 MP' },
        { label: 'Lens', value: '27 mm equivalent, f/2.8' },
        { label: 'Shutter', value: '1/4000 s to 30 s' },
      ] } },
      { kind: 'spec_group', payload: { title: 'Body', rows: [
        { label: 'Mass', value: '332 g with battery' },
        { label: 'Dimensions', value: '112.0 x 64.0 x 45.0 mm' },
        { label: 'Weather sealing', value: 'None' },
        { label: 'Storage', value: '1 x SD UHS-II' },
      ] } },
      { kind: 'in_the_box', payload: { items: ['Vela Cricket body', 'Battery, 1250 mAh', 'Braided USB-C cable, 1 m', 'Wrist strap'] } },
      { kind: 'compatibility', payload: { minimum_os: 'macOS 13.0', minimum_app: '1.4.0', text: 'Arranger reads and writes the Cricket over USB-C.' } },
    ],
  },
  {
    handle: 'mount', title: 'Monitor Mount', kind: 'accessory', status: 'discontinued',
    support_until: '2029-09-01', position: 3,
    subtitle: 'Holds a monitor on the hot shoe or a desk edge.',
    variants: [
      { sku: 'VELA-MOUNT-CLAMP', option_value: 'Clamp', price_minor: 4900, available: 0, position: 1 },
      { sku: 'VELA-MOUNT-VESA', option_value: 'VESA', price_minor: 4900, available: 0, position: 2 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'We stopped making the mount when the supplier of the ball joint stopped making the ball joint. We will keep spares on the shelf until the support date below.' } },
      { kind: 'spec_group', payload: { title: 'Mechanical', rows: [
        { label: 'Load', value: '2.0 kg' },
        { label: 'Thread', value: '1/4 in - 20' },
        { label: 'Mass', value: '184 g' },
      ] } },
      { kind: 'in_the_box', payload: { items: ['Mount', 'Hex key, 3 mm'] } },
      { kind: 'support_note', payload: { text: 'We no longer sell this. We will support it until September 1, 2029.' } },
    ],
  },
  {
    handle: 'case', title: 'Travel Case', kind: 'accessory', status: 'active',
    support_until: null, position: 4,
    subtitle: 'A body, two lenses and the cable, in one shell.',
    variants: [
      { sku: 'VELA-CASE-STD', option_value: 'Standard', price_minor: 7900, available: 15, position: 1 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'A moulded shell with a foam insert we cut ourselves. It takes an A1 with a lens attached, a second lens, two batteries and the cable.' } },
      { kind: 'spec_group', payload: { title: 'Case', rows: [
        { label: 'External', value: '310.0 x 220.0 x 120.0 mm' },
        { label: 'Internal', value: '286.0 x 196.0 x 98.0 mm' },
        { label: 'Mass', value: '840 g' },
      ] } },
      { kind: 'in_the_box', payload: { items: ['Case', 'Cut foam insert', 'Shoulder strap'] } },
    ],
  },
  {
    handle: 'cable', title: 'Replacement Cable', kind: 'spare', status: 'active',
    support_until: null, position: 5,
    subtitle: 'The braided USB-C cable, on its own.',
    variants: [
      { sku: 'VELA-CABLE-1M', option_value: '1 m', price_minor: 1900, available: 30, position: 1 },
      { sku: 'VELA-CABLE-2M', option_value: '2 m', price_minor: 2400, available: 30, position: 2 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'The same cable that ships in the box. It carries data and eighteen watts, and the braid is there because the first one we shipped was not.' } },
      { kind: 'spec_group', payload: { title: 'Cable', rows: [
        { label: 'Connector', value: 'USB-C to USB-C' },
        { label: 'Data', value: '10 Gbit/s' },
        { label: 'Power', value: '18 W' },
      ] } },
      { kind: 'in_the_box', payload: { items: ['Cable', 'Reusable tie'] } },
    ],
  },
  {
    handle: 'protection', title: 'Shipment protection', kind: 'protection', status: 'active',
    support_until: null, position: 99,
    subtitle: 'Cover against loss, theft and damage in transit.',
    variants: [
      { sku: 'VELA-PROTECT-1', option_value: 'Rung 1', price_minor: 98, available: 1000000, position: 1 },
      { sku: 'VELA-PROTECT-2', option_value: 'Rung 2', price_minor: 298, available: 1000000, position: 2 },
      { sku: 'VELA-PROTECT-3', option_value: 'Rung 3', price_minor: 598, available: 1000000, position: 3 },
      { sku: 'VELA-PROTECT-4', option_value: 'Rung 4', price_minor: 1198, available: 1000000, position: 4 },
    ],
    blocks: [],
  },
];

const RELEASES = [
  {
    version: '2.0.0', build: 2000, released_on: '2024-12-11', artifact_name: 'arranger-2.0.0.dmg',
    size_bytes: 154876459,
    sha256: '9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2',
    description: 'A rebuilt library, a new tethering path and support for the A1.',
    notes: {
      'Newly Added': [
        { text: 'The library is now a single window with a sidebar you can hide.' },
        { text: 'Tethered capture for the Vela A1 over USB-C.' },
        { text: 'Firmware writing from inside the application, so the browser installer is a fallback rather than the path.' },
      ],
      Improvements: [
        { text: 'Imports run about twice as fast on a folder of ten thousand frames.', issue: 'ARR-2201' },
        { text: 'The colour pipeline is the same on both cameras.' },
      ],
      'Bug Fixes': [
        { text: 'Renaming a folder no longer detaches its previews.', issue: 'ARR-2188' },
        { text: 'The application no longer holds a card open after ejecting it.', issue: 'ARR-2190' },
      ],
      'Known Issues': [
        { text: 'Tethered capture drops on some third-party USB-C hubs.', issue: 'ARR-2215' },
      ],
    },
  },
  {
    version: '1.4.4', build: 1440, released_on: '2024-06-26', artifact_name: 'arranger-1.4.4.dmg',
    size_bytes: 160301059,
    sha256: '4b7d1e6a90c3f582ad14be07c9f36d2e85a0b4c17d9e6382f5a0c1d4b7e39082',
    description: 'A maintenance release before the two point zero work landed.',
    notes: {
      Improvements: [{ text: 'Previews are generated in the background and no longer block an import.' }],
      'Bug Fixes': [
        { text: 'Fixed a hang when a card was removed mid-import.', issue: 'ARR-1907' },
        { text: 'The window position is remembered across restarts.', issue: 'ARR-1912' },
      ],
    },
  },
  {
    version: '1.4.3', build: 1430, released_on: '2024-05-20', artifact_name: 'arranger-1.4.3.dmg',
    size_bytes: 158220144,
    sha256: 'c1a8f30d5b7e2946af08d3c6b25e97f14a0d8b3c62e5947f0a1d8c3b6e29f745',
    description: 'Firmware 7.2 support for the Cricket.',
    notes: {
      'Newly Added': [{ text: 'Writes Cricket firmware 7.2.' }],
      Improvements: [{ text: 'The import dialog states the card size and the free space on it.' }],
      'Bug Fixes': [{ text: 'Corrected a mismatch between the histogram and the exported frame.', issue: 'ARR-1880' }],
      'Known Issues': [{ text: 'A card formatted on a phone is not always recognised.', issue: 'ARR-1884' }],
    },
  },
  {
    version: '1.4.2', build: 1420, released_on: '2024-05-20', artifact_name: 'arranger-1.4.2.dmg',
    size_bytes: 157903622,
    sha256: 'e70b4c19d8a3f625c0b9d47a1e83f560c2a9b8d3e07f4162a5c8b90d3e6f7142',
    description: 'A same-day fix for the release before it.',
    notes: {
      'Bug Fixes': [
        { text: 'The application no longer writes a preview cache it never reads.', issue: 'ARR-1871' },
        { text: 'Fixed the date shown on an imported frame from a camera set to a non-UTC clock.', issue: 'ARR-1875' },
      ],
    },
  },
];

const FIRMWARE = [
  { handle: 'compact', version: '7.2', build: 720, min_firmware: '6.11', min_app_version: '1.4.0', channel: 'general', size_bytes: 24118400, sha256: 'a3f5c8e1b60d947f2a8c4e0b1d7f3956c2a8e40b71d95f3c8a2e6b0d4f719c53', released_on: '2024-05-20' },
  { handle: 'compact', version: '7.0', build: 700, min_firmware: '6.11', min_app_version: '1.4.0', channel: 'general', size_bytes: 23985152, sha256: 'b8d2074e6a1c395f8b0d2e74a6c19f350b8e2d47a0c6f931e5b8d02a4c7f6913', released_on: '2024-02-14' },
  { handle: 'compact', version: '6.11', build: 611, min_firmware: null, min_app_version: '1.0.0', channel: 'general', size_bytes: 23760896, sha256: 'd4e90b26c8a3f157e0b4d29a6c83f150d7b2e94a0c6f83b15e2d90a4c76f8b31', released_on: '2023-11-02' },
  { handle: 'flagship', version: '2.4', build: 240, min_firmware: '2.0', min_app_version: '2.0.0', channel: 'general', size_bytes: 41287680, sha256: 'f19c3a70b5d82e46a0c9f13d75b8e024a6c3f80b19d5e72a4c0b8f36d91a7e25', released_on: '2024-12-11' },
];

const DEVICES = [
  { serial: 'VC2609PVDA7Q', handle: 'compact', sku: 'VELA-CRICKET-GRAPHITE', status: 'registered', owner: 'customer@example.com', from_order: 'VE-2026-0001', firmware_version: '7.0', warranty_until: '2028-01-14' },
  { serial: 'VA2609NRWB2Z', handle: 'flagship', sku: 'VELA-A1-SAND', status: 'registered', owner: 'customer2@example.com', from_order: null, firmware_version: '2.4', warranty_until: '2028-03-02' },
  { serial: 'VA2609KTMHX4', handle: 'flagship', sku: 'VELA-A1-GRAPHITE', status: 'sold', owner: null, from_order: null, firmware_version: null, warranty_until: '2028-06-30' },
  { serial: 'VC2609WJ3DKT', handle: 'compact', sku: 'VELA-CRICKET-YELLOW', status: 'blocked', blocked_reason: 'reported_stolen', owner: null, from_order: null, firmware_version: null, warranty_until: null },
];

const DELIVERY = [
  { zone: 'us-domestic', country: 'US', code: 'standard', label: 'Standard', price_minor: 0, window_label: '5 to 7 days', position: 1 },
  { zone: 'us-domestic', country: 'US', code: 'express', label: 'Express', price_minor: 2500, window_label: '2 days', position: 2 },
];

/** Seeding is idempotent: restarting the app must not duplicate rows. */
export async function runMigrations() {
  const sql = await readFile(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8');
  await pool.query(sql);

  /*
   * The subtotal must equal the sum of the order's line totals. A row-level
   * CHECK cannot see other rows, so this is a constraint trigger that fires at
   * the end of the transaction, once every line has been written. It makes the
   * invariant the store's rule rather than the application's promise.
   */
  await pool.query(`
    CREATE OR REPLACE FUNCTION order_subtotal_matches_lines() RETURNS trigger AS $fn$
    DECLARE
      target uuid;
      lines_sum integer;
      stated integer;
    BEGIN
      -- The same check guards both tables, so the order is found either way.
      IF TG_TABLE_NAME = 'order_line' THEN
        target := NEW.order_id;
      ELSE
        target := NEW.id;
      END IF;
      SELECT COALESCE(sum(total_minor), 0) INTO lines_sum
        FROM order_line WHERE order_id = target;
      SELECT subtotal_minor INTO stated FROM "order" WHERE id = target;
      IF stated IS NULL THEN
        RETURN NULL;
      END IF;
      IF stated <> lines_sum THEN
        RAISE EXCEPTION
          'order subtotal % does not equal the sum of its line totals %', stated, lines_sum
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NULL;
    END;
    $fn$ LANGUAGE plpgsql;
  `);

  for (const [name, table] of [
    ['order_subtotal_check', '"order"'],
    ['order_line_subtotal_check', 'order_line'],
  ]) {
    await pool.query(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
    await pool.query(`
      CREATE CONSTRAINT TRIGGER ${name}
        AFTER INSERT OR UPDATE ON ${table}
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION order_subtotal_matches_lines();
    `);
  }
}

export async function runSeed() {
  const passwordHash = await hashPassword(SEED_PASSWORD);

  await withTransaction(async (c) => {
    // A single advisory lock makes concurrent boots safe.
    await c.query('SELECT pg_advisory_xact_lock(861_2026)');

    for (const email of ['customer@example.com', 'customer2@example.com']) {
      const name = email === 'customer@example.com' ? 'Iris Vantaa' : 'Rune Halden';
      await c.query(
        `INSERT INTO customer (email, name, password_hash, status)
         VALUES ($1,$2,$3,'active')
         ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`,
        [email, name, passwordHash],
      );
    }

    for (const p of PRODUCTS) {
      const { rows: [prod] } = await c.query(
        `INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (handle) DO UPDATE SET
           title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, kind = EXCLUDED.kind,
           status = EXCLUDED.status, support_until = EXCLUDED.support_until, position = EXCLUDED.position
         RETURNING id`,
        [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position],
      );
      for (const v of p.variants) {
        const { rows: [variant] } = await c.query(
          `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
           VALUES ($1,$2,$3,$4,$5,'usd',$6,'deny')
           ON CONFLICT (sku) DO UPDATE SET
             product_id = EXCLUDED.product_id, title = EXCLUDED.title,
             option_value = EXCLUDED.option_value, price_minor = EXCLUDED.price_minor,
             position = EXCLUDED.position
           RETURNING id`,
          [prod.id, v.sku, `${p.title} — ${v.option_value}`, v.option_value, v.price_minor, v.position],
        );
        // Inventory is only initialised, never reset, so a restart does not undo real trade.
        await c.query(
          `INSERT INTO inventory_level (variant_id, available, committed)
           VALUES ($1,$2,0) ON CONFLICT (variant_id) DO NOTHING`,
          [variant.id, v.available],
        );
      }
      await c.query('DELETE FROM product_block WHERE product_id = $1', [prod.id]);
      let i = 0;
      for (const b of p.blocks) {
        i += 1;
        await c.query(
          'INSERT INTO product_block (product_id, kind, position, payload) VALUES ($1,$2,$3,$4)',
          [prod.id, b.kind, i, JSON.stringify(b.payload)],
        );
      }
    }

    for (const d of DELIVERY) {
      await c.query(
        `INSERT INTO delivery_method (zone, country, code, label, price_minor, window_label, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (code) DO UPDATE SET
           label = EXCLUDED.label, price_minor = EXCLUDED.price_minor,
           window_label = EXCLUDED.window_label, position = EXCLUDED.position`,
        [d.zone, d.country, d.code, d.label, d.price_minor, d.window_label, d.position],
      );
    }

    for (const r of RELEASES) {
      await c.query(
        `INSERT INTO app_release (version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes)
         VALUES ($1,$2,$3,'general',$4,$5,$6,$7,$8)
         ON CONFLICT (version) DO UPDATE SET
           build = EXCLUDED.build, released_on = EXCLUDED.released_on,
           artifact_name = EXCLUDED.artifact_name, size_bytes = EXCLUDED.size_bytes,
           sha256 = EXCLUDED.sha256, description = EXCLUDED.description, notes = EXCLUDED.notes`,
        [r.version, r.build, r.released_on, r.artifact_name, r.size_bytes, r.sha256, r.description, JSON.stringify(r.notes)],
      );
    }

    for (const f of FIRMWARE) {
      const { rows: [prod] } = await c.query('SELECT id FROM product WHERE handle = $1', [f.handle]);
      await c.query(
        `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (product_id, build) DO UPDATE SET
           version = EXCLUDED.version, min_firmware = EXCLUDED.min_firmware,
           min_app_version = EXCLUDED.min_app_version, channel = EXCLUDED.channel,
           size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256, released_on = EXCLUDED.released_on`,
        [prod.id, f.version, f.build, f.min_firmware, f.min_app_version, f.channel, f.size_bytes, f.sha256, f.released_on],
      );
    }

    // The seeded order VE-2026-0001.
    const { rows: [iris] } = await c.query('SELECT id FROM customer WHERE lower(email) = $1', ['customer@example.com']);
    const { rows: [cricketGraphite] } = await c.query(
      'SELECT v.id, v.sku, v.price_minor, p.title FROM variant v JOIN product p ON p.id = v.product_id WHERE v.sku = $1',
      ['VELA-CRICKET-GRAPHITE'],
    );
    const existingOrder = await c.query('SELECT id FROM "order" WHERE number = $1', ['VE-2026-0001']);
    let seededOrderId = existingOrder.rows[0]?.id;
    if (!seededOrderId) {
      const accessToken = crypto.randomBytes(24).toString('base64url');
      const { rows: [order] } = await c.query(
        `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor,
            discount_minor, total_minor, currency, status, payment_status, fulfilment_status,
            shipping_method, shipping_address, access_token_hash, killbill_external_key,
            killbill_invoice_amount, placed_at)
         VALUES ($1,$2,$3,29900,0,2990,0,32890,'usd','confirmed','invoiced','fulfilled','standard',$4,$5,$6,32890::numeric/100,
            timestamptz '2026-01-14 15:04:00Z')
         RETURNING id`,
        [
          'VE-2026-0001', iris.id, 'customer@example.com',
          JSON.stringify({
            name: 'Iris Vantaa', line1: '44 Harbour Row', line2: '', city: 'Portland',
            region: 'OR', postal_code: '97204', country: 'US', phone: '',
          }),
          crypto.createHash('sha256').update(accessToken).digest('hex'),
          'customer@example.com',
        ],
      );
      seededOrderId = order.id;
      await c.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position)
         VALUES ($1,$2,$3,$4,1,29900,29900,1)`,
        [seededOrderId, cricketGraphite.id, `${cricketGraphite.title} — Graphite`, cricketGraphite.sku],
      );
      await c.query(
        `INSERT INTO order_sequence (year, last_value) VALUES (2026, 1)
         ON CONFLICT (year) DO UPDATE SET last_value = GREATEST(order_sequence.last_value, 1)`,
      );
    }

    for (const d of DEVICES) {
      const { rows: [prod] } = await c.query('SELECT id FROM product WHERE handle = $1', [d.handle]);
      const { rows: [variant] } = await c.query('SELECT id FROM variant WHERE sku = $1', [d.sku]);
      const orderId = d.from_order ? seededOrderId : null;
      const { rows: [device] } = await c.query(
        `INSERT INTO device (serial, product_id, variant_id, status, blocked_reason, firmware_version,
            firmware_reported_at, order_id, warranty_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (upper(serial)) DO UPDATE SET
           product_id = EXCLUDED.product_id, variant_id = EXCLUDED.variant_id
         RETURNING id`,
        [
          d.serial, prod.id, variant.id, d.status, d.blocked_reason || null, d.firmware_version,
          d.firmware_version ? new Date('2026-02-02T09:12:00Z') : null, orderId, d.warranty_until,
        ],
      );
      if (d.owner) {
        const { rows: [owner] } = await c.query('SELECT id FROM customer WHERE lower(email) = $1', [d.owner]);
        const live = await c.query(
          'SELECT id FROM device_ownership WHERE device_id = $1 AND released_at IS NULL',
          [device.id],
        );
        if (live.rowCount === 0) {
          await c.query(
            `INSERT INTO device_ownership (device_id, customer_id, order_id, method)
             VALUES ($1,$2,$3,$4)`,
            [device.id, owner.id, orderId, d.from_order ? 'order' : 'manual'],
          );
        }
      }
    }
  });
}

export async function ensureReady() {
  await runMigrations();
  await runSeed();
}
