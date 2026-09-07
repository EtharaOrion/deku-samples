// Seeding is idempotent: restarting the app must not duplicate rows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tx } from './db.mjs';
import { hashPassword, sha256, randomToken } from './auth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Benchmark fixture data, not a secret. The literal must work at login.
export const SEED_PASSWORD = 'deku-demo-pw-2026';

export async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await tx(async (c) => {
    await c.query(sql);
  });
}

const PRODUCTS = [
  {
    handle: 'flagship',
    title: 'Vela A1',
    subtitle: 'The full-frame body, built to be repaired.',
    kind: 'camera',
    status: 'active',
    support_until: '2032-06-01',
    position: 1,
    variants: [
      { sku: 'VELA-A1-GRAPHITE', option: 'Graphite', price: 89900, available: 4 },
      { sku: 'VELA-A1-SAND', option: 'Sand', price: 89900, available: 6 },
      { sku: 'VELA-A1-YELLOW', option: 'Yellow', price: 89900, available: 1 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'The A1 is the camera we build for people who keep a camera. The shutter is rated to 400,000 actuations, the battery door is a part you can buy, and the sensor assembly comes out with four screws and a Torx driver you already own.' } },
      { kind: 'spec_group', payload: { title: 'Sensor and image', rows: [['Sensor', '36 x 24 mm CMOS'], ['Resolution', '61 MP'], ['Readout', '14 bit'], ['ISO range', '64 to 51200'], ['Shutter', '1/8000 s to 30 min']] } },
      { kind: 'spec_group', payload: { title: 'Body', rows: [['Weight', '612 g with battery'], ['Dimensions', '128 x 96 x 74 mm'], ['Mount', 'Vela V'], ['Storage', 'Dual CFexpress B'], ['Sealing', 'IP53']] } },
      { kind: 'in_the_box', payload: { items: ['Vela A1 body', 'Body cap', 'Battery VB-2', 'USB-C cable, 1 m', 'Strap', 'Printed teardown guide'] } },
      { kind: 'compatibility', payload: { min_os: 'macOS 13.0', min_app: '2.0.0', text: 'Arranger 2.0.0 or later reads A1 files. Firmware updates need macOS 13.0 or later.' } },
    ],
  },
  {
    handle: 'compact',
    title: 'Vela Cricket',
    subtitle: 'A pocket body with the same shutter discipline.',
    kind: 'camera',
    status: 'active',
    support_until: null,
    position: 2,
    variants: [
      { sku: 'VELA-CRICKET-GRAPHITE', option: 'Graphite', price: 29900, available: 12 },
      { sku: 'VELA-CRICKET-YELLOW', option: 'Yellow', price: 29900, available: 0 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'The Cricket is the camera that goes in a coat pocket and comes back with the picture. One dial, one ring, a fixed 28 mm lens and a battery that lasts a weekend.' } },
      { kind: 'spec_group', payload: { title: 'Sensor and image', rows: [['Sensor', '23.5 x 15.6 mm CMOS'], ['Resolution', '26 MP'], ['Readout', '14 bit'], ['ISO range', '160 to 25600'], ['Lens', '28 mm equivalent, f/2.8']] } },
      { kind: 'spec_group', payload: { title: 'Body', rows: [['Weight', '312 g with battery'], ['Dimensions', '112 x 64 x 38 mm'], ['Storage', 'Single SD UHS-II'], ['Sealing', 'IP52']] } },
      { kind: 'in_the_box', payload: { items: ['Vela Cricket body', 'Battery VB-1', 'USB-C cable, 1 m', 'Wrist strap'] } },
      { kind: 'compatibility', payload: { min_os: 'macOS 13.0', min_app: '1.4.0', text: 'Arranger 1.4.0 or later reads Cricket files. Firmware 6.11 or later is required before 7.2.' } },
    ],
  },
  {
    handle: 'mount',
    title: 'Monitor Mount',
    subtitle: 'Holds a reference monitor over the body.',
    kind: 'accessory',
    status: 'discontinued',
    support_until: '2029-09-01',
    position: 3,
    variants: [
      { sku: 'VELA-MOUNT-CLAMP', option: 'Clamp', price: 4900, available: 0 },
      { sku: 'VELA-MOUNT-VESA', option: 'VESA', price: 4900, available: 0 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'An arm and a plate. We stopped making it when the monitors it was cut for went out of production.' } },
      { kind: 'spec_group', payload: { title: 'Mechanical', rows: [['Load', '2.4 kg'], ['Thread', '1/4-20 and 3/8-16'], ['Material', 'Cast aluminium']] } },
      { kind: 'in_the_box', payload: { items: ['Arm', 'Plate', 'Hex key'] } },
      { kind: 'support_note', payload: { text: 'We no longer sell this. We will support it until September 1, 2029.' } },
    ],
  },
  {
    handle: 'case',
    title: 'Travel Case',
    subtitle: 'A hard shell sized for a body and two lenses.',
    kind: 'accessory',
    status: 'active',
    support_until: null,
    position: 4,
    variants: [{ sku: 'VELA-CASE-STD', option: 'Standard', price: 7900, available: 15 }],
    blocks: [
      { kind: 'lede', payload: { text: 'Closed-cell foam in a shell that has been dropped down a stairwell more than once in testing. The insert is cut for an A1 or a Cricket and two lenses.' } },
      { kind: 'spec_group', payload: { title: 'Case', rows: [['External', '340 x 250 x 140 mm'], ['Weight', '1.1 kg'], ['Rating', 'IP67 closed']] } },
      { kind: 'in_the_box', payload: { items: ['Case', 'Cut foam insert', 'Shoulder strap'] } },
    ],
  },
  {
    handle: 'cable',
    title: 'Replacement Cable',
    subtitle: 'USB-C to USB-C, the one that ships in the box.',
    kind: 'spare',
    status: 'active',
    support_until: null,
    position: 5,
    variants: [
      { sku: 'VELA-CABLE-1M', option: '1 m', price: 1900, available: 30 },
      { sku: 'VELA-CABLE-2M', option: '2 m', price: 2400, available: 30 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'The same cable that ships in the box. It carries data at 10 Gbit/s and 60 W of power, which is what firmware writes need.' } },
      { kind: 'spec_group', payload: { title: 'Cable', rows: [['Data', '10 Gbit/s'], ['Power', '60 W'], ['Jacket', 'Braided nylon']] } },
      { kind: 'in_the_box', payload: { items: ['Cable', 'Cable tie'] } },
    ],
  },
  {
    // Shipment protection is never listed in the catalogue and never taxed.
    handle: 'protection',
    title: 'Shipment protection',
    subtitle: 'Covers loss, theft and damage in transit.',
    kind: 'protection',
    status: 'active',
    support_until: null,
    position: 99,
    variants: [
      { sku: 'VELA-PROTECT-1', option: 'Up to $99.99', price: 98, available: 1000000 },
      { sku: 'VELA-PROTECT-2', option: 'Up to $499.99', price: 298, available: 1000000 },
      { sku: 'VELA-PROTECT-3', option: 'Up to $999.99', price: 598, available: 1000000 },
      { sku: 'VELA-PROTECT-4', option: '$1000 and above', price: 1198, available: 1000000 },
    ],
    blocks: [],
  },
];

const RELEASES = [
  {
    version: '2.0.0', build: 2000, released_on: '2024-12-11', artifact_name: 'arranger-2.0.0.dmg',
    size_bytes: 154876459,
    sha256: '9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2',
    description: 'A new catalogue engine and support for the Vela A1.',
    notes: {
      'Newly Added': ['Support for the Vela A1 and its 61 MP files.', 'A catalogue that opens a library of 500,000 frames in under two seconds.', 'Tethered capture over USB-C for both bodies.'],
      Improvements: ['Import is about four times faster on Apple silicon.', 'The develop panel keeps its scroll position between images.', 'Firmware writes now report the version read back from the camera.'],
      'Bug Fixes': ['Fixed a crash when a card was removed during import.', 'Fixed white balance drift on files from firmware 6.11.', 'Fixed the export panel forgetting its last folder.'],
      'Known Issues': ['Tethered capture drops on some third-party USB hubs.', 'The A1 grid view is slower than the Cricket grid view.'],
    },
  },
  {
    version: '1.4.4', build: 1440, released_on: '2024-06-26', artifact_name: 'arranger-1.4.4.dmg',
    size_bytes: 160301059,
    sha256: 'c41d8f2b7e05a9364f18cd7be2a05f9317c6be40d38a25f7c1e094b6d5230aa8',
    description: 'A maintenance release for the Cricket.',
    notes: {
      Improvements: ['Card reads recover from a bad sector rather than stopping.', 'The histogram redraws at 60 frames a second on older machines.'],
      'Bug Fixes': ['Fixed a hang when two cards were mounted at once.', 'Fixed the serial number reading blank on a fresh Cricket.'],
      'Known Issues': ['Firmware 7.0 must be installed before 7.2.'],
    },
  },
  {
    version: '1.4.3', build: 1430, released_on: '2024-05-20', artifact_name: 'arranger-1.4.3.dmg',
    size_bytes: 158220144,
    sha256: '5b7e1a90c2f4d63819ae05b7c3d21f4e60a89d5c7b0e34f21a6d98c4e5730bb1',
    description: 'Firmware 7.0 support.',
    notes: {
      'Newly Added': ['Firmware 7.0 for the Vela Cricket can be installed from the app.'],
      Improvements: ['The import sheet remembers the last folder used.'],
      'Bug Fixes': ['Fixed a rare crash on quit with a tethered camera attached.'],
    },
  },
  {
    version: '1.4.2', build: 1420, released_on: '2024-05-20', artifact_name: 'arranger-1.4.2.dmg',
    size_bytes: 157903622,
    sha256: 'e0a4c37d61b8925fa0d3e7c4128b6f95a71d0c8e34b295f6d7a10c48be26d3f7',
    description: 'A small fix for card detection.',
    notes: {
      'Bug Fixes': ['Fixed cards mounting read-only after a failed eject.'],
      'Known Issues': ['A camera on firmware below 6.11 is not detected.'],
    },
  },
];

const FIRMWARE = [
  { handle: 'compact', version: '7.2', build: 720, min_firmware: '6.11', min_app_version: '1.4.0', channel: 'general', size_bytes: 41250816, sha256: '2c9f70b184de35a6c0f19b47d8e25a3f6704bc19e83d5a27f4106bd93ec8f15a', released_on: '2024-11-04' },
  { handle: 'compact', version: '7.0', build: 700, min_firmware: '6.11', min_app_version: '1.4.0', channel: 'general', size_bytes: 40912128, sha256: 'a71e4c05d92b8f3617ac0e54b28d7f0193c6a85de401f2b7c93d06ea58147bc3', released_on: '2024-05-14' },
  { handle: 'compact', version: '6.11', build: 611, min_firmware: null, min_app_version: '1.0.0', channel: 'general', size_bytes: 39845376, sha256: 'd38b06f1a95c724e0b7d3f8615ca20e947b1c5d80a63f492e7c018ba54d3970e', released_on: '2023-10-02' },
  { handle: 'flagship', version: '2.4', build: 240, min_firmware: '2.0', min_app_version: '2.0.0', channel: 'general', size_bytes: 58720256, sha256: 'b6045e93c81a7d2f50be3c917da5460827efb1d04a95c6237e8014fd9b3a2c56', released_on: '2024-12-11' },
];

const DEVICES = [
  { serial: 'VC2609PVDA7Q', handle: 'compact', sku: 'VELA-CRICKET-GRAPHITE', status: 'registered', owner: 'customer@example.com', from_order: 'VE-2026-0001', firmware: '7.0', warranty_until: '2027-02-14' },
  { serial: 'VA2609NRWB2Z', handle: 'flagship', sku: 'VELA-A1-SAND', status: 'registered', owner: 'customer2@example.com', from_order: null, firmware: '2.4', warranty_until: '2027-06-30' },
  { serial: 'VA2609KTMHX4', handle: 'flagship', sku: 'VELA-A1-GRAPHITE', status: 'sold', owner: null, from_order: null, firmware: null, warranty_until: '2028-01-20' },
  { serial: 'VC2609WJ3DKT', handle: 'compact', sku: 'VELA-CRICKET-YELLOW', status: 'blocked', owner: null, from_order: null, firmware: null, warranty_until: null, blocked_reason: 'reported_stolen' },
];

export async function seed() {
  await tx(async (c) => {
    // Serialise seeding so two starting replicas cannot both write the fixtures.
    await c.query('SELECT pg_advisory_xact_lock(760124)');

    const pwHash = hashPassword(SEED_PASSWORD);
    for (const [email, name] of [
      ['customer@example.com', 'Iris Vantaa'],
      ['customer2@example.com', 'Rune Halden'],
    ]) {
      await c.query(
        `INSERT INTO customer (email, name, password_hash, status)
         VALUES ($1,$2,$3,'active')
         ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`,
        [email, name, pwHash],
      );
    }

    for (const p of PRODUCTS) {
      const { rows: [prod] } = await c.query(
        `INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (handle) DO UPDATE SET title=EXCLUDED.title, subtitle=EXCLUDED.subtitle,
           kind=EXCLUDED.kind, status=EXCLUDED.status, support_until=EXCLUDED.support_until,
           position=EXCLUDED.position
         RETURNING id`,
        [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position],
      );

      let vpos = 0;
      for (const v of p.variants) {
        vpos += 1;
        const { rows: [variant] } = await c.query(
          `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
           VALUES ($1,$2,$3,$4,$5,'usd',$6,'deny')
           ON CONFLICT (sku) DO UPDATE SET product_id=EXCLUDED.product_id, title=EXCLUDED.title,
             option_value=EXCLUDED.option_value, price_minor=EXCLUDED.price_minor, position=EXCLUDED.position
           RETURNING id`,
          [prod.id, v.sku, v.option, v.option, v.price, vpos],
        );
        // Stock is authoritative in the database; only insert it the first time so a
        // restart never resurrects stock that orders have since committed.
        await c.query(
          `INSERT INTO inventory_level (variant_id, available, committed)
           VALUES ($1,$2,0) ON CONFLICT (variant_id) DO NOTHING`,
          [variant.id, v.available],
        );
      }

      await c.query('DELETE FROM product_block WHERE product_id = $1', [prod.id]);
      let bpos = 0;
      for (const b of p.blocks) {
        bpos += 1;
        await c.query('INSERT INTO product_block (product_id, kind, position, payload) VALUES ($1,$2,$3,$4)', [
          prod.id, b.kind, bpos, JSON.stringify(b.payload),
        ]);
      }
    }

    // Delivery: one zone, two methods, none preselected.
    const { rows: [zone] } = await c.query(
      `INSERT INTO shipping_zone (code, country) VALUES ('us-domestic','US')
       ON CONFLICT (code) DO UPDATE SET country=EXCLUDED.country RETURNING id`,
    );
    for (const m of [
      { code: 'Standard', title: 'Standard', price: 0, window: 'Arrives in 5 to 7 days', pos: 1 },
      { code: 'Express', title: 'Express', price: 2500, window: 'Arrives in 2 days', pos: 2 },
    ]) {
      await c.query(
        `INSERT INTO shipping_method (zone_id, code, title, price_minor, window_text, position)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (zone_id, code) DO UPDATE SET title=EXCLUDED.title,
           price_minor=EXCLUDED.price_minor, window_text=EXCLUDED.window_text, position=EXCLUDED.position`,
        [zone.id, m.code, m.title, m.price, m.window, m.pos],
      );
    }

    for (const r of RELEASES) {
      await c.query(
        `INSERT INTO app_release (version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes)
         VALUES ($1,$2,$3,'general',$4,$5,$6,$7,$8)
         ON CONFLICT (version) DO UPDATE SET build=EXCLUDED.build, released_on=EXCLUDED.released_on,
           artifact_name=EXCLUDED.artifact_name, size_bytes=EXCLUDED.size_bytes, sha256=EXCLUDED.sha256,
           description=EXCLUDED.description, notes=EXCLUDED.notes`,
        [r.version, r.build, r.released_on, r.artifact_name, r.size_bytes, r.sha256, r.description, JSON.stringify(r.notes)],
      );
    }

    for (const f of FIRMWARE) {
      const { rows: [prod] } = await c.query('SELECT id FROM product WHERE handle = $1', [f.handle]);
      await c.query(
        `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (product_id, build) DO UPDATE SET version=EXCLUDED.version,
           min_firmware=EXCLUDED.min_firmware, min_app_version=EXCLUDED.min_app_version,
           channel=EXCLUDED.channel, size_bytes=EXCLUDED.size_bytes, sha256=EXCLUDED.sha256,
           released_on=EXCLUDED.released_on`,
        [prod.id, f.version, f.build, f.min_firmware, f.min_app_version, f.channel, f.size_bytes, f.sha256, f.released_on],
      );
    }

    await seedOrderAndDevices(c);
  });
}

async function seedOrderAndDevices(c) {
  const { rows: [iris] } = await c.query("SELECT id, email FROM customer WHERE lower(email) = 'customer@example.com'");
  const { rows: [existingOrder] } = await c.query(`SELECT id FROM "order" WHERE number = 'VE-2026-0001'`);

  let orderId = existingOrder?.id;
  if (!orderId) {
    const { rows: [variant] } = await c.query("SELECT id, sku, price_minor FROM variant WHERE sku = 'VELA-CRICKET-GRAPHITE'");
    const subtotal = 29900, shipping = 0, tax = 2990, total = 32890;
    const { rows: [order] } = await c.query(
      `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor,
         discount_minor, total_minor, currency, status, payment_status, fulfilment_status,
         shipping_method, shipping_address, access_token_hash, killbill_external_key,
         killbill_invoice_amount, placed_at)
       VALUES ('VE-2026-0001',$1,$2,$3,0,$4,0,$5,'usd','confirmed','invoiced','fulfilled','Standard',$6,$7,$8,$9,
         timestamptz '2026-02-14 15:04:00+00')
       RETURNING id`,
      [
        iris.id, iris.email, subtotal, tax, total,
        JSON.stringify({
          name: 'Iris Vantaa', line1: '44 Kaivokatu', line2: '', city: 'Portland',
          region: 'OR', postal_code: '97209', country: 'US', phone: '',
        }),
        sha256(randomToken(32)),
        'customer@example.com',
        '328.90',
      ],
    );
    orderId = order.id;
    await c.query(
      `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position)
       VALUES ($1,$2,'Vela Cricket — Graphite',$3,1,$4,$4,1)`,
      [orderId, variant.id, variant.sku, subtotal],
    );
    await c.query(
      `UPDATE "order" SET killbill_external_key = 'customer@example.com' WHERE id = $1`, [orderId],
    );
  }

  // The order counter must sit above every seeded order number.
  await c.query(
    `INSERT INTO order_counter (year, last_value) VALUES (2026, 1)
     ON CONFLICT (year) DO UPDATE SET last_value = GREATEST(order_counter.last_value, 1)`,
  );

  for (const d of DEVICES) {
    const { rows: [prod] } = await c.query('SELECT id FROM product WHERE handle = $1', [d.handle]);
    const { rows: [variant] } = await c.query('SELECT id FROM variant WHERE sku = $1', [d.sku]);
    const fromOrderId = d.from_order === 'VE-2026-0001' ? orderId : null;
    const { rows: [dev] } = await c.query(
      `INSERT INTO device (serial, product_id, variant_id, status, blocked_reason, firmware_version,
         firmware_reported_at, order_id, warranty_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (upper(serial)) DO UPDATE SET product_id=EXCLUDED.product_id,
         variant_id=EXCLUDED.variant_id, blocked_reason=EXCLUDED.blocked_reason,
         warranty_until=EXCLUDED.warranty_until
       RETURNING id`,
      [
        d.serial, prod.id, variant.id, d.status, d.blocked_reason || null, d.firmware,
        d.firmware ? new Date('2026-08-01T09:00:00Z') : null, fromOrderId, d.warranty_until,
      ],
    );

    if (d.owner) {
      const { rows: [owner] } = await c.query('SELECT id FROM customer WHERE lower(email) = lower($1)', [d.owner]);
      // One live ownership row per device; the partial unique index holds the rest.
      await c.query(
        `INSERT INTO device_ownership (device_id, customer_id, order_id, method, claimed_at)
         SELECT $1,$2,$3,$4, timestamptz '2026-02-20 10:00:00+00'
         WHERE NOT EXISTS (SELECT 1 FROM device_ownership WHERE device_id = $1 AND released_at IS NULL)`,
        [dev.id, owner.id, fromOrderId, fromOrderId ? 'order' : 'manual'],
      );
    }
  }
}
