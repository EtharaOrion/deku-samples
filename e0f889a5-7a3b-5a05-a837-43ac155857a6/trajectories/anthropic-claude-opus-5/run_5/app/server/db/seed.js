import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pool, tx } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';
import { sha256 } from '../lib/auth.js';
import { log } from '../lib/log.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// Benchmark fixture data, not a secret. The exact literal must work at login.
export const SEED_PASSWORD = 'deku-demo-pw-2026';

const digest = (s) => createHash('sha256').update(s).digest('hex');

const PRODUCTS = [
  {
    handle: 'flagship',
    title: 'Vela A1',
    subtitle: 'The full-frame body we build for people who print.',
    kind: 'camera',
    status: 'active',
    support_until: '2032-06-01',
    position: 1,
    variants: [
      { sku: 'VELA-A1-GRAPHITE', option_value: 'Graphite', price_minor: 89900, available: 4, position: 1 },
      { sku: 'VELA-A1-SAND', option_value: 'Sand', price_minor: 89900, available: 6, position: 2 },
      { sku: 'VELA-A1-YELLOW', option_value: 'Yellow', price_minor: 89900, available: 1, position: 3 },
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'The A1 is the body we make for the photograph that gets printed and hung. A 42 megapixel sensor, a shutter rated to 500,000 actuations, and a magnesium chassis we machine rather than cast. It is heavier than it needs to be because the weight is where the rigidity comes from.' } },
      { kind: 'spec_group', position: 2, payload: { title: 'Sensor and imaging', rows: [
        { label: 'Sensor', value: '42.2 MP full frame CMOS' },
        { label: 'Pixel pitch', value: '5.31 µm' },
        { label: 'ISO range', value: '64 to 25600' },
        { label: 'Dynamic range', value: '14.8 EV' },
        { label: 'Shutter', value: '1/8000 s to 30 s' },
      ] } },
      { kind: 'spec_group', position: 3, payload: { title: 'Body', rows: [
        { label: 'Weight', value: '682 g' },
        { label: 'Dimensions', value: '128 x 96 x 74 mm' },
        { label: 'Weather sealing', value: 'IP53' },
        { label: 'Storage', value: 'Dual CFexpress Type B' },
        { label: 'Battery', value: '2280 mAh, 540 frames' },
      ] } },
      { kind: 'in_the_box', position: 4, payload: { items: ['Vela A1 body', 'Battery VB-2', 'Charger VC-1', 'USB-C cable, 1 m', 'Strap', 'Body cap'] } },
      { kind: 'compatibility', position: 5, payload: { min_os: 'macOS 13.0', min_app_version: '2.0.0', text: 'Arranger reads the A1 over USB-C. Firmware 2.4 and later.' } },
    ],
  },
  {
    handle: 'compact',
    title: 'Vela Cricket',
    subtitle: 'A small camera that goes in a coat pocket.',
    kind: 'camera',
    status: 'active',
    support_until: null,
    position: 2,
    variants: [
      { sku: 'VELA-CRICKET-GRAPHITE', option_value: 'Graphite', price_minor: 29900, available: 12, position: 1 },
      { sku: 'VELA-CRICKET-YELLOW', option_value: 'Yellow', price_minor: 29900, available: 0, position: 2 },
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'The Cricket is the camera you carry on the days you were not planning to photograph anything. A fixed 28 mm lens, a 26 megapixel sensor and a body that fits in a coat pocket without a bag around it.' } },
      { kind: 'spec_group', position: 2, payload: { title: 'Sensor and imaging', rows: [
        { label: 'Sensor', value: '26.1 MP APS-C CMOS' },
        { label: 'Lens', value: '28 mm equivalent, f/2.8' },
        { label: 'ISO range', value: '160 to 12800' },
        { label: 'Dynamic range', value: '13.2 EV' },
        { label: 'Shutter', value: '1/4000 s to 30 s' },
      ] } },
      { kind: 'spec_group', position: 3, payload: { title: 'Body', rows: [
        { label: 'Weight', value: '312 g' },
        { label: 'Dimensions', value: '112 x 64 x 41 mm' },
        { label: 'Weather sealing', value: 'None' },
        { label: 'Storage', value: 'Single SD UHS-II' },
        { label: 'Battery', value: '1150 mAh, 320 frames' },
      ] } },
      { kind: 'in_the_box', position: 4, payload: { items: ['Vela Cricket body', 'Battery VB-1', 'USB-C cable, 1 m', 'Wrist strap'] } },
      { kind: 'compatibility', position: 5, payload: { min_os: 'macOS 13.0', min_app_version: '1.4.0', text: 'Arranger reads the Cricket over USB-C. Firmware 6.11 and later.' } },
    ],
  },
  {
    handle: 'mount',
    title: 'Monitor Mount',
    subtitle: 'Holds a reference monitor off the back of either body.',
    kind: 'accessory',
    status: 'discontinued',
    support_until: '2029-09-01',
    position: 3,
    variants: [
      { sku: 'VELA-MOUNT-CLAMP', option_value: 'Clamp', price_minor: 4900, available: 0, position: 1 },
      { sku: 'VELA-MOUNT-VESA', option_value: 'VESA', price_minor: 4900, available: 0, position: 2 },
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'An aluminium arm that puts a reference monitor where you can see it. We stopped making it when the monitor it was cut for went out of production.' } },
      { kind: 'spec_group', position: 2, payload: { title: 'Mechanical', rows: [
        { label: 'Material', value: '6061 aluminium' },
        { label: 'Load', value: '1.4 kg' },
        { label: 'Thread', value: '1/4-20 and 3/8-16' },
        { label: 'Weight', value: '186 g' },
      ] } },
      { kind: 'in_the_box', position: 3, payload: { items: ['Mount arm', 'Hex key, 3 mm', 'Spare thumbscrew'] } },
      { kind: 'support_note', position: 4, payload: { text: 'We no longer sell this. We will support it until September 1, 2029.' } },
    ],
  },
  {
    handle: 'case',
    title: 'Travel Case',
    subtitle: 'A hard case sized for one body and two lenses.',
    kind: 'accessory',
    status: 'active',
    support_until: null,
    position: 4,
    variants: [
      { sku: 'VELA-CASE-STD', option_value: 'Standard', price_minor: 7900, available: 15, position: 1 },
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'A moulded case with a foam insert cut for one body and two lenses. It survives being checked onto an aeroplane, which we tested by checking it onto aeroplanes.' } },
      { kind: 'spec_group', position: 2, payload: { title: 'Case', rows: [
        { label: 'External', value: '340 x 250 x 130 mm' },
        { label: 'Internal', value: '310 x 220 x 110 mm' },
        { label: 'Weight', value: '1.24 kg' },
        { label: 'Rating', value: 'IP67 closed' },
      ] } },
      { kind: 'in_the_box', position: 3, payload: { items: ['Travel case', 'Cut foam insert', 'Shoulder strap'] } },
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
      { sku: 'VELA-CABLE-1M', option_value: '1 m', price_minor: 1900, available: 30, position: 1 },
      { sku: 'VELA-CABLE-2M', option_value: '2 m', price_minor: 2400, available: 30, position: 2 },
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'The same cable that ships in the box, sold on its own because cables are lost more often than cameras are.' } },
      { kind: 'spec_group', position: 2, payload: { title: 'Cable', rows: [
        { label: 'Connector', value: 'USB-C to USB-C' },
        { label: 'Data', value: 'USB 3.2 Gen 2, 10 Gbps' },
        { label: 'Power', value: '100 W' },
        { label: 'Jacket', value: 'Braided nylon' },
      ] } },
      { kind: 'in_the_box', position: 3, payload: { items: ['One cable', 'One cable tie'] } },
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
    version: '2.0.0', build: 2000, released_on: '2024-12-11',
    artifact_name: 'arranger-2.0.0.dmg', size_bytes: 154876459,
    sha256: '9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2',
    description: 'A rebuilt import pipeline and a new catalogue format.',
    notes: {
      'Newly Added': [
        'A catalogue format that holds edits and originals in one file.',
        'Tethered capture for the Vela A1 over USB-C.',
        'A comparison view that puts two frames side by side at the same zoom.',
      ],
      Improvements: [
        'Import is about four times faster on libraries above ten thousand frames.',
        'The histogram now reads from the working colour space.',
        'Keyboard shortcuts are listed in one place and can be changed.',
      ],
      'Bug Fixes': [
        'Fixed a crash when a card was removed during import.',
        'Fixed the export dialog forgetting the last folder used.',
      ],
      'Known Issues': [
        'Tethered capture drops on some third-party USB-C hubs.',
      ],
    },
  },
  {
    version: '1.4.4', build: 1440, released_on: '2024-06-26',
    artifact_name: 'arranger-1.4.4.dmg', size_bytes: 160301059,
    sha256: digest('arranger-1.4.4'),
    description: 'A maintenance release for the 1.4 line.',
    notes: {
      Improvements: [
        'Thumbnail generation uses less memory on large libraries.',
      ],
      'Bug Fixes': [
        'Fixed a hang when the catalogue sat on a network volume.',
        'Fixed the Cricket firmware check reporting a version behind the camera.',
      ],
    },
  },
  {
    version: '1.4.3', build: 1430, released_on: '2024-05-20',
    artifact_name: 'arranger-1.4.3.dmg', size_bytes: 158220144,
    sha256: digest('arranger-1.4.3'),
    description: 'Firmware handling for the Cricket 7.0 line.',
    notes: {
      'Newly Added': [
        'Firmware 7.0 for the Vela Cricket can be installed from the app.',
      ],
      Improvements: [
        'The device panel names the camera rather than the port it is on.',
      ],
      'Bug Fixes': [
        'Fixed an export writing the wrong colour profile on 16-bit TIFF.',
      ],
      'Known Issues': [
        'A camera in mass storage mode is not detected until it is unplugged and plugged back in.',
      ],
    },
  },
  {
    version: '1.4.2', build: 1420, released_on: '2024-05-20',
    artifact_name: 'arranger-1.4.2.dmg', size_bytes: 157903622,
    sha256: digest('arranger-1.4.2'),
    description: 'A small fix release.',
    notes: {
      'Bug Fixes': [
        'Fixed the import dialog opening behind the main window.',
        'Fixed a rounding error in the crop tool at high zoom.',
      ],
    },
  },
];

const FIRMWARE = [
  { handle: 'compact', version: '7.2', build: 720, min_firmware: '6.11', min_app_version: '1.4.0', channel: 'general', size_bytes: 18446920, released_on: '2024-11-04' },
  { handle: 'compact', version: '7.0', build: 700, min_firmware: '6.11', min_app_version: '1.4.0', channel: 'general', size_bytes: 18220144, released_on: '2024-05-14' },
  { handle: 'compact', version: '6.11', build: 611, min_firmware: null, min_app_version: '1.0.0', channel: 'general', size_bytes: 17903622, released_on: '2023-11-22' },
  { handle: 'flagship', version: '2.4', build: 240, min_firmware: '2.0', min_app_version: '2.0.0', channel: 'general', size_bytes: 24118090, released_on: '2024-12-11' },
];

const DEVICES = [
  { serial: 'VC2609PVDA7Q', handle: 'compact', sku: 'VELA-CRICKET-GRAPHITE', status: 'registered', owner: 'customer@example.com', from_order: 'VE-2026-0001', firmware_version: '7.0', warranty_until: '2028-02-14' },
  { serial: 'VA2609NRWB2Z', handle: 'flagship', sku: 'VELA-A1-SAND', status: 'registered', owner: 'customer2@example.com', from_order: null, firmware_version: '2.4', warranty_until: '2027-08-30' },
  { serial: 'VA2609KTMHX4', handle: 'flagship', sku: 'VELA-A1-GRAPHITE', status: 'sold', owner: null, from_order: null, firmware_version: null, warranty_until: '2028-06-01' },
  { serial: 'VC2609WJ3DKT', handle: 'compact', sku: 'VELA-CRICKET-YELLOW', status: 'blocked', owner: null, from_order: null, firmware_version: null, warranty_until: null, blocked_reason: 'reported_stolen' },
];

export async function migrate() {
  const sql = await readFile(join(HERE, 'schema.sql'), 'utf8');
  await pool.query(sql);
  log({ level: 'info', msg: 'schema applied' });
}

/** Seeding is idempotent: restarting the app must not duplicate rows. */
export async function seed() {
  const passwordHash = await hashPassword(SEED_PASSWORD);

  await tx(async (db) => {
    // Customers
    for (const [email, name] of [
      ['customer@example.com', 'Iris Vantaa'],
      ['customer2@example.com', 'Rune Halden'],
    ]) {
      await db.query(
        `INSERT INTO customer (email, name, password_hash, status)
         VALUES ($1,$2,$3,'active')
         ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`,
        [email, name, passwordHash],
      );
    }

    // Products, variants, inventory, blocks
    for (const p of PRODUCTS) {
      const { rows: [prod] } = await db.query(
        `INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (handle) DO UPDATE SET
           title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, kind = EXCLUDED.kind,
           status = EXCLUDED.status, support_until = EXCLUDED.support_until, position = EXCLUDED.position
         RETURNING id`,
        [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position],
      );

      for (const v of p.variants) {
        const { rows: [variant] } = await db.query(
          `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
           VALUES ($1,$2,$3,$4,$5,'usd',$6,'deny')
           ON CONFLICT (sku) DO UPDATE SET
             product_id = EXCLUDED.product_id, title = EXCLUDED.title,
             option_value = EXCLUDED.option_value, price_minor = EXCLUDED.price_minor,
             position = EXCLUDED.position
           RETURNING id`,
          [prod.id, v.sku, `${p.title} ${v.option_value}`, v.option_value, v.price_minor, v.position],
        );
        // Inventory is only seeded once; a restart must not undo real commitments.
        await db.query(
          `INSERT INTO inventory_level (variant_id, available, committed)
           VALUES ($1,$2,0) ON CONFLICT (variant_id) DO NOTHING`,
          [variant.id, v.available],
        );
      }

      await db.query(`DELETE FROM product_block WHERE product_id = $1`, [prod.id]);
      for (const b of p.blocks) {
        await db.query(
          `INSERT INTO product_block (product_id, kind, position, payload) VALUES ($1,$2,$3,$4)`,
          [prod.id, b.kind, b.position, JSON.stringify(b.payload)],
        );
      }
    }

    // Releases
    for (const r of RELEASES) {
      await db.query(
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
      const { rows: [prod] } = await db.query(`SELECT id FROM product WHERE handle = $1`, [f.handle]);
      await db.query(
        `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (product_id, build) DO UPDATE SET
           version = EXCLUDED.version, min_firmware = EXCLUDED.min_firmware,
           min_app_version = EXCLUDED.min_app_version, channel = EXCLUDED.channel,
           size_bytes = EXCLUDED.size_bytes, released_on = EXCLUDED.released_on`,
        [prod.id, f.version, f.build, f.min_firmware, f.min_app_version, f.channel, f.size_bytes, digest(`fw-${f.handle}-${f.version}`), f.released_on],
      );
    }

    // The seeded order VE-2026-0001
    const { rows: [iris] } = await db.query(`SELECT id FROM customer WHERE lower(email) = 'customer@example.com'`);
    const { rows: [cricketGraphite] } = await db.query(`SELECT id, price_minor FROM variant WHERE sku = 'VELA-CRICKET-GRAPHITE'`);

    const { rows: existingOrder } = await db.query(`SELECT id FROM "order" WHERE number = 'VE-2026-0001'`);
    let orderId = existingOrder[0]?.id ?? null;
    if (!orderId) {
      const { rows: [order] } = await db.query(
        `INSERT INTO "order"
           (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, discount_minor,
            total_minor, currency, status, payment_status, fulfilment_status, shipping_method,
            shipping_address, access_token_hash, killbill_external_key, killbill_invoice_amount, placed_at)
         VALUES ('VE-2026-0001',$1,'customer@example.com',29900,0,2990,0,32890,'usd','confirmed','invoiced','fulfilled','Standard',
                 $2,$3,'customer@example.com',328.90,'2026-02-14T10:12:00Z')
         RETURNING id`,
        [
          iris.id,
          JSON.stringify({
            name: 'Iris Vantaa', line1: '18 Kaisaniemi Street', line2: '',
            city: 'Portland', region: 'OR', postal_code: '97209', country: 'US', phone: '',
          }),
          sha256('seed-order-VE-2026-0001'),
        ],
      );
      orderId = order.id;
      await db.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position)
         VALUES ($1,$2,'Vela Cricket Graphite','VELA-CRICKET-GRAPHITE',1,29900,29900,1)`,
        [orderId, cricketGraphite.id],
      );
    }
    await db.query(
      `INSERT INTO order_number_seq (year, last_value) VALUES (2026, 1)
       ON CONFLICT (year) DO NOTHING`,
    );

    // Devices and their ownership
    for (const d of DEVICES) {
      const { rows: [prod] } = await db.query(`SELECT id FROM product WHERE handle = $1`, [d.handle]);
      const { rows: [variant] } = await db.query(`SELECT id FROM variant WHERE sku = $1`, [d.sku]);
      const fromOrderId = d.from_order === 'VE-2026-0001' ? orderId : null;
      const { rows: [device] } = await db.query(
        `INSERT INTO device (serial, product_id, variant_id, status, blocked_reason, firmware_version,
                             firmware_reported_at, nickname, order_id, warranty_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9)
         ON CONFLICT (upper(serial)) DO UPDATE SET
           product_id = EXCLUDED.product_id, variant_id = EXCLUDED.variant_id,
           blocked_reason = EXCLUDED.blocked_reason, warranty_until = EXCLUDED.warranty_until
         RETURNING id`,
        [
          d.serial, prod.id, variant.id, d.status, d.blocked_reason ?? null,
          d.firmware_version, d.firmware_version ? new Date('2026-03-02T09:41:00Z') : null,
          fromOrderId, d.warranty_until,
        ],
      );

      if (d.owner) {
        const { rows: [owner] } = await db.query(`SELECT id FROM customer WHERE lower(email) = $1`, [d.owner]);
        // One live ownership row per device; the partial unique index is the guard.
        await db.query(
          `INSERT INTO device_ownership (device_id, customer_id, order_id, method, claimed_at)
           SELECT $1,$2,$3,$4,now()
           WHERE NOT EXISTS (
             SELECT 1 FROM device_ownership WHERE device_id = $1 AND released_at IS NULL
           )`,
          [device.id, owner.id, fromOrderId, fromOrderId ? 'order' : 'manual'],
        );
      }
    }
  });

  log({ level: 'info', msg: 'seed complete' });
}

export async function migrateAndSeed() {
  await migrate();
  await seed();
}
