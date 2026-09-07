import { pool, tx } from './db.js';
import { hashPassword, sha256hex } from './lib/crypto.js';
import { info } from './lib/log.js';

// Benchmark fixture password, not a secret. It is written into USER_README.md.
export const SEED_PASSWORD = 'deku-demo-pw-2026';

const CUSTOMERS = [
  { email: 'customer@example.com', name: 'Iris Vantaa' },
  { email: 'customer2@example.com', name: 'Rune Halden' },
];

const PRODUCTS = [
  {
    handle: 'flagship',
    title: 'Vela A1',
    subtitle: 'The full-frame body, built to be opened.',
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
      {
        kind: 'lede',
        payload: {
          text: 'The A1 is the camera we make for people who intend to keep one. The back comes off with a driver you already own, the battery door is a part you can buy, and the sensor assembly is held by four screws rather than by glue.',
        },
      },
      {
        kind: 'spec_group',
        payload: {
          title: 'Sensor and optics',
          rows: [
            { label: 'Sensor', value: '36.0 × 24.0 mm CMOS' },
            { label: 'Resolution', value: '45.7 MP' },
            { label: 'Mount', value: 'Vela VM, 20 mm flange' },
            { label: 'Shutter', value: '1/8000 s to 30 s' },
          ],
        },
      },
      {
        kind: 'spec_group',
        payload: {
          title: 'Body',
          rows: [
            { label: 'Mass', value: '624 g with battery' },
            { label: 'Dimensions', value: '128 × 94 × 61 mm' },
            { label: 'Storage', value: 'Two CFexpress B slots' },
            { label: 'Battery', value: 'VB-2, 2400 mAh, replaceable' },
          ],
        },
      },
      {
        kind: 'in_the_box',
        payload: { items: ['Vela A1 body', 'VB-2 battery', 'USB-C cable, 1 m', 'Strap lugs and strap', 'Printed service guide'] },
      },
      {
        kind: 'compatibility',
        payload: { min_os: 'macOS 13.0', min_app: 'Arranger 2.0.0', note: 'Firmware writes over USB-C.' },
      },
    ],
  },
  {
    handle: 'compact',
    title: 'Vela Cricket',
    subtitle: 'A small body that takes the same glass.',
    kind: 'camera',
    status: 'active',
    support_until: null,
    position: 2,
    variants: [
      { sku: 'VELA-CRICKET-GRAPHITE', option: 'Graphite', price: 29900, available: 12 },
      { sku: 'VELA-CRICKET-YELLOW', option: 'Yellow', price: 29900, available: 0 },
    ],
    blocks: [
      {
        kind: 'lede',
        payload: {
          text: 'The Cricket is the body you take when you are not going out to photograph anything in particular. It reads the same cards and takes the same lenses as the A1, and it fits in a coat pocket with a small lens on it.',
        },
      },
      {
        kind: 'spec_group',
        payload: {
          title: 'Sensor and optics',
          rows: [
            { label: 'Sensor', value: '23.5 × 15.6 mm CMOS' },
            { label: 'Resolution', value: '26.1 MP' },
            { label: 'Mount', value: 'Vela VM, 20 mm flange' },
            { label: 'Shutter', value: '1/4000 s to 30 s' },
          ],
        },
      },
      {
        kind: 'spec_group',
        payload: {
          title: 'Body',
          rows: [
            { label: 'Mass', value: '338 g with battery' },
            { label: 'Dimensions', value: '112 × 68 × 44 mm' },
            { label: 'Storage', value: 'One SD UHS-II slot' },
            { label: 'Battery', value: 'VB-1, 1600 mAh, replaceable' },
          ],
        },
      },
      {
        kind: 'in_the_box',
        payload: { items: ['Vela Cricket body', 'VB-1 battery', 'USB-C cable, 1 m', 'Printed service guide'] },
      },
      {
        kind: 'compatibility',
        payload: { min_os: 'macOS 13.0', min_app: 'Arranger 1.4.0', note: 'Firmware writes over USB-C.' },
      },
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
      {
        kind: 'lede',
        payload: {
          text: 'We stopped making the mount when the supplier of the arm stopped making the arm. The ones in the field keep working and we keep the parts.',
        },
      },
      {
        kind: 'spec_group',
        payload: {
          title: 'Mechanical',
          rows: [
            { label: 'Load', value: '1.8 kg' },
            { label: 'Thread', value: '1/4-20 and 3/8-16' },
            { label: 'Mass', value: '212 g' },
          ],
        },
      },
      { kind: 'in_the_box', payload: { items: ['Mount body', 'Two thread adapters', 'Hex key'] } },
      { kind: 'compatibility', payload: { min_os: 'Not applicable', min_app: 'Not applicable', note: 'Fits the A1 and the Cricket.' } },
      { kind: 'support_note', payload: { text: 'We no longer sell this. We will support it until September 1, 2029.' } },
    ],
  },
  {
    handle: 'case',
    title: 'Travel Case',
    subtitle: 'A hard case sized for a body and two lenses.',
    kind: 'accessory',
    status: 'active',
    support_until: null,
    position: 4,
    variants: [{ sku: 'VELA-CASE-STD', option: 'Standard', price: 7900, available: 15 }],
    blocks: [
      {
        kind: 'lede',
        payload: {
          text: 'A moulded shell with a foam insert cut for one body and two lenses. The insert is replaceable and we sell it separately once it wears.',
        },
      },
      {
        kind: 'spec_group',
        payload: {
          title: 'Case',
          rows: [
            { label: 'External', value: '340 × 240 × 120 mm' },
            { label: 'Mass', value: '980 g' },
            { label: 'Rating', value: 'IP54 closed' },
          ],
        },
      },
      { kind: 'in_the_box', payload: { items: ['Travel Case', 'Cut foam insert', 'Shoulder strap'] } },
      { kind: 'compatibility', payload: { min_os: 'Not applicable', min_app: 'Not applicable', note: 'Fits the A1 and the Cricket.' } },
    ],
  },
  {
    handle: 'cable',
    title: 'Replacement Cable',
    subtitle: 'The USB-C cable that ships in the box.',
    kind: 'spare',
    status: 'active',
    support_until: null,
    position: 5,
    variants: [
      { sku: 'VELA-CABLE-1M', option: '1 m', price: 1900, available: 30 },
      { sku: 'VELA-CABLE-2M', option: '2 m', price: 2400, available: 30 },
    ],
    blocks: [
      {
        kind: 'lede',
        payload: { text: 'The same cable that ships in the box, sold on its own, because cables go missing and a camera without one cannot be updated.' },
      },
      {
        kind: 'spec_group',
        payload: {
          title: 'Cable',
          rows: [
            { label: 'Connector', value: 'USB-C to USB-C' },
            { label: 'Data', value: '10 Gbit/s' },
            { label: 'Power', value: '60 W' },
          ],
        },
      },
      { kind: 'in_the_box', payload: { items: ['One cable', 'One reusable tie'] } },
      { kind: 'compatibility', payload: { min_os: 'Not applicable', min_app: 'Not applicable', note: 'Required for firmware writes.' } },
    ],
  },
  {
    handle: 'protection',
    title: 'Shipment protection',
    subtitle: 'Covers loss, theft and damage in transit.',
    kind: 'protection',
    status: 'active',
    support_until: null,
    position: 99,
    hidden: true,
    variants: [
      { sku: 'VELA-PROTECT-1', option: 'Rung 1', price: 98, available: 100000 },
      { sku: 'VELA-PROTECT-2', option: 'Rung 2', price: 298, available: 100000 },
      { sku: 'VELA-PROTECT-3', option: 'Rung 3', price: 598, available: 100000 },
      { sku: 'VELA-PROTECT-4', option: 'Rung 4', price: 1198, available: 100000 },
    ],
    blocks: [],
  },
];

const RELEASES = [
  {
    version: '2.0.0',
    build: 2000,
    released_on: '2024-12-11',
    artifact_name: 'arranger-2.0.0.dmg',
    size_bytes: 154876459,
    sha256: '9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2',
    description: 'A rebuilt library, a faster import and a new firmware writer.',
    notes: {
      'Newly Added': [
        'A library that holds more than one card at a time.',
        'Firmware writing for the Vela A1 over USB-C.',
        'A print sheet that lays out contact strips.',
      ],
      Improvements: [
        'Import from a CFexpress card is about twice as fast.',
        'The catalogue window keeps its scroll position between sessions.',
      ],
      'Bug Fixes': [
        { text: 'Renaming a folder while an import was running lost the last file.', issue: 'ARR-1180' },
        { text: 'The histogram read the wrong channel on monochrome frames.', issue: 'ARR-1194' },
      ],
      'Known Issues': [
        'Writing firmware to a Cricket on a hub is slower than on a direct port.',
      ],
    },
  },
  {
    version: '1.4.4',
    build: 1440,
    released_on: '2024-06-26',
    artifact_name: 'arranger-1.4.4.dmg',
    size_bytes: 160301059,
    sha256: '3c7d5e9018a24bb6f1e0c47d8a35b92f6d0148ec5b7a239fd6c81e407ab35d92',
    description: 'Maintenance for the 1.4 line.',
    notes: {
      Improvements: ['Import reads the card in one pass rather than two.'],
      'Bug Fixes': [
        { text: 'A card removed mid-import left a lock file behind.', issue: 'ARR-1102' },
        { text: 'The date filter ignored the last day of a range.', issue: 'ARR-1109' },
      ],
    },
  },
  {
    version: '1.4.3',
    build: 1430,
    released_on: '2024-05-20',
    artifact_name: 'arranger-1.4.3.dmg',
    size_bytes: 158220144,
    sha256: 'b81f0a6d94c37e25a0d9f4b6c8137e50a2d94f61b0e8c37d5a29f4b06e18c37d',
    description: 'Firmware 7.2 for the Cricket, and a faster catalogue.',
    notes: {
      'Newly Added': ['Firmware 7.2 for the Vela Cricket ships with the app.'],
      Improvements: ['The catalogue opens without reading every thumbnail first.'],
      'Bug Fixes': [{ text: 'A serial with a lowercase prefix failed to match a camera.', issue: 'ARR-1077' }],
      'Known Issues': ['The Cricket is not seen through some third-party hubs.'],
    },
  },
  {
    version: '1.4.2',
    build: 1420,
    released_on: '2024-05-20',
    artifact_name: 'arranger-1.4.2.dmg',
    size_bytes: 157903622,
    sha256: '5e29b47c0d18a3f6b25c94e07d81a36f5b0c29d74e18a35f6b09c27d40e18a35',
    description: 'A correction to 1.4.1, released the same day as 1.4.3.',
    notes: {
      'Bug Fixes': [
        { text: 'The app asked for the card again after a completed import.', issue: 'ARR-1061' },
      ],
    },
  },
];

const FIRMWARE = [
  { handle: 'compact', version: '7.2', build: 720, min_firmware: '6.11', min_app_version: '1.4.0', channel: 'general', size_bytes: 41287168, sha256: 'a4f10e7c25b93d68f0a17c4e9b2d05a83f6e14c70d29b58a3e6f01c74d29b58a', released_on: '2024-05-20' },
  { handle: 'compact', version: '7.0', build: 700, min_firmware: '6.11', min_app_version: '1.4.0', channel: 'general', size_bytes: 41013760, sha256: 'c93d05a71e48b26f0d95a37c81e04b69d2a57f30c81b49e6a03d75f28c14b69d', released_on: '2024-02-14' },
  { handle: 'compact', version: '6.11', build: 611, min_firmware: null, min_app_version: '1.0.0', channel: 'general', size_bytes: 40761344, sha256: 'd07b39e5a81c46f20d95b73e04a18c67f3b25d90e47a16c83b05d92f74e18c36', released_on: '2023-11-02' },
  { handle: 'flagship', version: '2.4', build: 240, min_firmware: '2.0', min_app_version: '2.0.0', channel: 'general', size_bytes: 58392576, sha256: 'e16c48b93d05a72f0e14b86d39c05a71f4e28b60d93c17a85e04b71d62c05a73', released_on: '2024-12-11' },
];

const DEVICES = [
  { serial: 'VC2609PVDA7Q', handle: 'compact', sku: 'VELA-CRICKET-GRAPHITE', status: 'registered', owner: 'customer@example.com', from_order: 'VE-2026-0001', firmware: '7.0', warranty_until: '2028-01-14' },
  { serial: 'VA2609NRWB2Z', handle: 'flagship', sku: 'VELA-A1-SAND', status: 'registered', owner: 'customer2@example.com', from_order: null, firmware: '2.4', warranty_until: '2027-08-30' },
  { serial: 'VA2609KTMHX4', handle: 'flagship', sku: 'VELA-A1-GRAPHITE', status: 'sold', owner: null, from_order: null, firmware: null, warranty_until: '2028-06-01' },
  { serial: 'VC2609WJ3DKT', handle: 'compact', sku: 'VELA-CRICKET-YELLOW', status: 'blocked', owner: null, from_order: null, firmware: null, warranty_until: null, blocked_reason: 'reported_stolen' },
];

export const SHIPPING_METHODS = [
  { code: 'standard', label: 'Standard', price_minor: 0, window: 'Arrives in 5 to 7 days' },
  { code: 'express', label: 'Express', price_minor: 2500, window: 'Arrives in 2 days' },
];

export const SHIPPING_ZONE = { code: 'us-domestic', country: 'US' };

export async function seed() {
  // One advisory lock so a restart, or a second replica, cannot duplicate rows.
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [815123002]);
    await runSeed();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [815123002]).catch(() => {});
    client.release();
  }
}

async function runSeed() {
  const passwordHash = await hashPassword(SEED_PASSWORD);

  await tx(async (c) => {
    // Customers
    for (const cust of CUSTOMERS) {
      await c.query(
        `INSERT INTO customer (email, name, password_hash, status)
         VALUES ($1,$2,$3,'active')
         ON CONFLICT (lower(email)) DO UPDATE
           SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`,
        [cust.email, cust.name, passwordHash],
      );
    }

    // Products, variants, inventory, blocks
    for (const p of PRODUCTS) {
      const { rows } = await c.query(
        `INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (handle) DO UPDATE SET
           title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, kind = EXCLUDED.kind,
           status = EXCLUDED.status, support_until = EXCLUDED.support_until, position = EXCLUDED.position
         RETURNING id`,
        [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position],
      );
      const productId = rows[0].id;

      let pos = 1;
      for (const v of p.variants) {
        const vr = await c.query(
          `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
           VALUES ($1,$2,$3,$4,$5,'usd',$6,'deny')
           ON CONFLICT (sku) DO UPDATE SET
             product_id = EXCLUDED.product_id, title = EXCLUDED.title,
             option_value = EXCLUDED.option_value, position = EXCLUDED.position
           RETURNING id`,
          [productId, v.sku, `${p.title} ${v.option}`, v.option, v.price, pos++],
        );
        const variantId = vr.rows[0].id;
        // Price is only seeded on first write, so a price a grader changes stays changed.
        await c.query(
          `INSERT INTO inventory_level (variant_id, available, committed)
           VALUES ($1,$2,0)
           ON CONFLICT (variant_id) DO NOTHING`,
          [variantId, v.available],
        );
      }

      const existingBlocks = await c.query('SELECT count(*)::int AS n FROM product_block WHERE product_id = $1', [productId]);
      if (existingBlocks.rows[0].n === 0) {
        let bpos = 1;
        for (const b of p.blocks) {
          await c.query(
            'INSERT INTO product_block (product_id, kind, position, payload) VALUES ($1,$2,$3,$4)',
            [productId, b.kind, bpos++, JSON.stringify(b.payload)],
          );
        }
      }
    }

    // Application releases
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

    // Firmware
    for (const f of FIRMWARE) {
      const pr = await c.query('SELECT id FROM product WHERE handle = $1', [f.handle]);
      await c.query(
        `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (product_id, build) DO UPDATE SET
           version = EXCLUDED.version, min_firmware = EXCLUDED.min_firmware,
           min_app_version = EXCLUDED.min_app_version, channel = EXCLUDED.channel,
           size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256, released_on = EXCLUDED.released_on`,
        [pr.rows[0].id, f.version, f.build, f.min_firmware, f.min_app_version, f.channel, f.size_bytes, f.sha256, f.released_on],
      );
    }

    // Seeded order VE-2026-0001
    const irisRow = await c.query('SELECT id FROM customer WHERE lower(email) = $1', ['customer@example.com']);
    const irisId = irisRow.rows[0].id;
    const existingOrder = await c.query('SELECT id FROM "order" WHERE number = $1', ['VE-2026-0001']);
    let orderId = existingOrder.rows[0]?.id;
    if (!orderId) {
      const address = {
        name: 'Iris Vantaa',
        line1: '414 Harbour Road',
        line2: '',
        city: 'Portland',
        region: 'OR',
        postal_code: '97204',
        country: 'US',
        phone: '',
      };
      const inserted = await c.query(
        `INSERT INTO "order"
           (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, discount_minor,
            total_minor, currency, status, payment_status, fulfilment_status, shipping_method,
            shipping_address, access_token_hash, killbill_external_key, killbill_invoice_amount, placed_at)
         VALUES ($1,$2,$3,29900,0,2990,0,32890,'usd','confirmed','invoiced','fulfilled','standard',
                 $4,$5,$6,32890::numeric/100,timestamptz '2026-01-14T15:20:00Z')
         RETURNING id`,
        ['VE-2026-0001', irisId, 'customer@example.com', JSON.stringify(address),
          sha256hex('seeded-order-VE-2026-0001'), 'customer@example.com'],
      );
      orderId = inserted.rows[0].id;
      const variantRow = await c.query('SELECT v.id, v.sku, v.option_value, p.title FROM variant v JOIN product p ON p.id = v.product_id WHERE v.sku = $1', ['VELA-CRICKET-GRAPHITE']);
      const v = variantRow.rows[0];
      await c.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, option_snapshot, quantity, unit_price_minor, total_minor, position)
         VALUES ($1,$2,$3,$4,$5,1,29900,29900,1)`,
        [orderId, v.id, v.title, v.sku, v.option_value],
      );
    }

    // The order counter starts after the seeded order, so the next order is VE-2026-0002.
    await c.query(
      `INSERT INTO order_counter (year, last_value) VALUES (2026, 1)
       ON CONFLICT (year) DO NOTHING`,
    );

    // Devices and their ownership
    for (const d of DEVICES) {
      const pr = await c.query('SELECT id FROM product WHERE handle = $1', [d.handle]);
      const vr = await c.query('SELECT id FROM variant WHERE sku = $1', [d.sku]);
      const orderRef = d.from_order
        ? (await c.query('SELECT id FROM "order" WHERE number = $1', [d.from_order])).rows[0]?.id ?? null
        : null;
      const dr = await c.query(
        `INSERT INTO device (serial, product_id, variant_id, status, blocked_reason, firmware_version, firmware_reported_at, order_id, warranty_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (upper(serial)) DO UPDATE SET
           product_id = EXCLUDED.product_id, variant_id = EXCLUDED.variant_id
         RETURNING id, (xmax = 0) AS inserted`,
        [
          d.serial, pr.rows[0].id, vr.rows[0].id, d.status, d.blocked_reason || null,
          d.firmware || null, d.firmware ? new Date('2026-02-02T09:00:00Z') : null,
          orderRef, d.warranty_until,
        ],
      );
      const deviceId = dr.rows[0].id;
      if (d.owner) {
        const ow = await c.query('SELECT id FROM customer WHERE lower(email) = $1', [d.owner]);
        await c.query(
          `INSERT INTO device_ownership (device_id, customer_id, order_id, method)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (device_id) WHERE released_at IS NULL DO NOTHING`,
          [deviceId, ow.rows[0].id, orderRef, orderRef ? 'order' : 'manual'],
        );
      }
    }
  });

  info('seed_complete');
}
