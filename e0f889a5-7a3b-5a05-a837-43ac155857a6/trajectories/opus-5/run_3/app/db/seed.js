import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getPool, tx } from '../src/lib/db.js';
import { hashPassword } from '../src/lib/auth.js';
import { logEvent } from '../src/lib/log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Benchmark fixture data, not a secret. The exact literal must work at login.
export const SEED_PASSWORD = 'deku-demo-pw-2026';

/** A deterministic lowercase hexadecimal digest of sixty-four characters. */
function digest(seed) {
  return crypto.createHash('sha256').update(`vela:${seed}`).digest('hex');
}

const PRODUCTS = [
  {
    handle: 'flagship', title: 'Vela A1', kind: 'camera', status: 'active',
    subtitle: 'The full-frame body the studio was built around.',
    support_until: '2032-06-01', position: 1,
    variants: [
      { sku: 'VELA-A1-GRAPHITE', option: 'Graphite', price: 89900, available: 4 },
      { sku: 'VELA-A1-SAND', option: 'Sand', price: 89900, available: 6 },
      { sku: 'VELA-A1-YELLOW', option: 'Yellow', price: 89900, available: 1 },
    ],
  },
  {
    handle: 'compact', title: 'Vela Cricket', kind: 'camera', status: 'active',
    subtitle: 'A pocket body that keeps the A1 colour science.',
    support_until: null, position: 2,
    variants: [
      { sku: 'VELA-CRICKET-GRAPHITE', option: 'Graphite', price: 29900, available: 12 },
      { sku: 'VELA-CRICKET-YELLOW', option: 'Yellow', price: 29900, available: 0 },
    ],
  },
  {
    handle: 'mount', title: 'Monitor Mount', kind: 'accessory', status: 'discontinued',
    subtitle: 'Holds a reference monitor above the body.',
    support_until: '2029-09-01', position: 3,
    variants: [
      { sku: 'VELA-MOUNT-CLAMP', option: 'Clamp', price: 4900, available: 0 },
      { sku: 'VELA-MOUNT-VESA', option: 'VESA', price: 4900, available: 0 },
    ],
  },
  {
    handle: 'case', title: 'Travel Case', kind: 'accessory', status: 'active',
    subtitle: 'A moulded shell for a body and three lenses.',
    support_until: null, position: 4,
    variants: [{ sku: 'VELA-CASE-STD', option: 'Standard', price: 7900, available: 15 }],
  },
  {
    handle: 'cable', title: 'Replacement Cable', kind: 'spare', status: 'active',
    subtitle: 'The braided cable that ships in the box.',
    support_until: null, position: 5,
    variants: [
      { sku: 'VELA-CABLE-1M', option: '1 m', price: 1900, available: 30 },
      { sku: 'VELA-CABLE-2M', option: '2 m', price: 2400, available: 30 },
    ],
  },
  {
    // Never listed in the catalogue and never taxed.
    handle: 'protection', title: 'Shipment protection', kind: 'protection', status: 'active',
    subtitle: 'Covers loss, theft and damage in transit.',
    support_until: null, position: 99,
    variants: [
      { sku: 'VELA-PROTECT-1', option: 'Rung 1', price: 98, available: 1000000 },
      { sku: 'VELA-PROTECT-2', option: 'Rung 2', price: 298, available: 1000000 },
      { sku: 'VELA-PROTECT-3', option: 'Rung 3', price: 598, available: 1000000 },
      { sku: 'VELA-PROTECT-4', option: 'Rung 4', price: 1198, available: 1000000 },
    ],
  },
];

const BLOCKS = {
  flagship: [
    { kind: 'lede', payload: { text: 'The A1 is the body we make for people who photograph for a living. One sensor, one mount, one menu that does not move between firmware versions. It is heavy because the parts inside it are metal, and it is repairable because we sell the parts.' } },
    { kind: 'spec_group', payload: { title: 'Sensor and image', rows: [['Sensor', '36 x 24 mm CMOS'], ['Resolution', '61 MP'], ['Readout', '14 bit'], ['ISO range', '64 to 25600'], ['Shutter', '1/8000 to 30 s']] } },
    { kind: 'spec_group', payload: { title: 'Body', rows: [['Weight', '648 g'], ['Dimensions', '128 x 97 x 71 mm'], ['Sealing', 'IP52'], ['Storage', 'Dual CFexpress B'], ['Battery', 'VB-90, 540 frames']] } },
    { kind: 'in_the_box', payload: { items: ['Vela A1 body', 'VB-90 battery', 'Braided 2 m cable', 'Strap', 'Body cap'] } },
    { kind: 'compatibility', payload: { min_os: 'macOS 13.0', min_app: 'Arranger 2.0.0', text: 'Arranger reads the A1 over the braided cable. Firmware 2.4 requires Arranger 2.0.0 or later.' } },
  ],
  compact: [
    { kind: 'lede', payload: { text: 'The Cricket is the A1 colour science in a body that fits a coat pocket. It has one dial and one button, and it writes the same raw file the A1 writes, so a job shot on both cuts together without a correction pass.' } },
    { kind: 'spec_group', payload: { title: 'Sensor and image', rows: [['Sensor', '23.5 x 15.6 mm CMOS'], ['Resolution', '26 MP'], ['Readout', '14 bit'], ['ISO range', '160 to 12800'], ['Shutter', '1/4000 to 30 s']] } },
    { kind: 'spec_group', payload: { title: 'Body', rows: [['Weight', '312 g'], ['Dimensions', '112 x 68 x 46 mm'], ['Sealing', 'None'], ['Storage', 'Single SD UHS-II'], ['Battery', 'VB-40, 320 frames']] } },
    { kind: 'in_the_box', payload: { items: ['Vela Cricket body', 'VB-40 battery', 'Braided 1 m cable', 'Wrist strap'] } },
    { kind: 'compatibility', payload: { min_os: 'macOS 13.0', min_app: 'Arranger 1.4.0', text: 'Arranger reads the Cricket over the braided cable. Firmware 7.2 requires Arranger 1.4.0 or later.' } },
  ],
  mount: [
    { kind: 'lede', payload: { text: 'A clamp that holds a reference monitor above the body without a cage. We no longer build it, and the parts we hold are for the people who already own one.' } },
    { kind: 'spec_group', payload: { title: 'Mount', rows: [['Load', '2.1 kg'], ['Thread', '1/4-20 and 3/8-16'], ['Weight', '184 g'], ['Material', '6061 aluminium']] } },
    { kind: 'in_the_box', payload: { items: ['Mount arm', 'Clamp jaw', 'Hex key'] } },
    { kind: 'support_note', payload: { text: 'We no longer sell this. We will support it until September 1, 2029.' } },
  ],
  case: [
    { kind: 'lede', payload: { text: 'A moulded shell that takes a body and three lenses, cut from a single block of foam so nothing shifts in a hold.' } },
    { kind: 'spec_group', payload: { title: 'Case', rows: [['Internal', '390 x 270 x 140 mm'], ['Weight', '1.9 kg'], ['Rating', 'IP67'], ['Foam', 'Cut for A1 and Cricket']] } },
    { kind: 'in_the_box', payload: { items: ['Travel case', 'Cut foam insert', 'Two keys'] } },
    { kind: 'compatibility', payload: { min_os: 'Not applicable', min_app: 'Not applicable', text: 'Fits the Vela A1 and the Vela Cricket with lenses attached.' } },
  ],
  cable: [
    { kind: 'lede', payload: { text: 'The braided cable that ships in the box, sold on its own because it is the part that goes missing first.' } },
    { kind: 'spec_group', payload: { title: 'Cable', rows: [['Connector', 'USB-C to USB-C'], ['Data', '10 Gbit/s'], ['Power', '100 W'], ['Jacket', 'Braided nylon']] } },
    { kind: 'in_the_box', payload: { items: ['One braided cable', 'Cable tie'] } },
    { kind: 'compatibility', payload: { min_os: 'macOS 13.0', min_app: 'Arranger 1.4.0', text: 'Carries data and power for the A1 and the Cricket.' } },
  ],
};

const RELEASES = [
  {
    version: '2.0.0', build: 2000, released_on: '2024-12-11',
    artifact_name: 'arranger-2.0.0.dmg', size_bytes: 154876459,
    sha256: '9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2',
    description: 'A rebuilt library and a faster read from both bodies.',
    notes: {
      'Newly Added': ['A rebuilt library that opens a folder of 40,000 frames without a wait.', 'Direct read from the Vela A1 over the braided cable.', 'Per-camera colour profiles that follow the body rather than the machine.'],
      Improvements: ['Import is about twice as fast on Apple silicon.', 'The catalogue window remembers the sort you left it in.'],
      'Bug Fixes': ['Fixed a hang when a card was removed during import.', 'Fixed a mismatch between the histogram and the exported frame.'],
      'Known Issues': ['Tethered capture from the Cricket needs firmware 7.0 or later.'],
    },
  },
  {
    version: '1.4.4', build: 1440, released_on: '2024-06-26',
    artifact_name: 'arranger-1.4.4.dmg', size_bytes: 160301059,
    sha256: digest('release-1.4.4'),
    description: 'A maintenance release for the 1.4 line.',
    notes: {
      Improvements: ['The import queue reports the remaining count rather than a bar.'],
      'Bug Fixes': ['Fixed a crash when a card was unmounted mid-write.', 'Fixed a stall reading a Cricket on firmware 6.11.'],
    },
  },
  {
    version: '1.4.3', build: 1430, released_on: '2024-05-20',
    artifact_name: 'arranger-1.4.3.dmg', size_bytes: 158220144,
    sha256: digest('release-1.4.3'),
    description: 'Firmware 7.0 support for the Vela Cricket.',
    notes: {
      'Newly Added': ['Support for Vela Cricket firmware 7.0.'],
      Improvements: ['Reduced memory use when a folder holds more than 10,000 frames.'],
      'Bug Fixes': ['Fixed a mismatch in the reported frame count after a failed import.'],
      'Known Issues': ['A folder on a network volume can take a minute to appear.'],
    },
  },
  {
    version: '1.4.2', build: 1420, released_on: '2024-05-20',
    artifact_name: 'arranger-1.4.2.dmg', size_bytes: 157903622,
    sha256: digest('release-1.4.2'),
    description: 'A correction to the 1.4.1 export path.',
    notes: {
      'Bug Fixes': ['Fixed an export that wrote the wrong colour profile on a second run.'],
      'Known Issues': ['Export presets from 1.3 need to be saved again.'],
    },
  },
];

const FIRMWARE = [
  { handle: 'compact', version: '7.2', build: 720, min_firmware: '6.11', min_app_version: '1.4.0', channel: 'general', size_bytes: 24117248, released_on: '2024-06-04' },
  { handle: 'compact', version: '7.0', build: 700, min_firmware: '6.11', min_app_version: '1.4.0', channel: 'general', size_bytes: 23068672, released_on: '2024-05-02' },
  { handle: 'compact', version: '6.11', build: 611, min_firmware: null, min_app_version: '1.0.0', channel: 'general', size_bytes: 22020096, released_on: '2023-11-14' },
  { handle: 'flagship', version: '2.4', build: 240, min_firmware: '2.0', min_app_version: '2.0.0', channel: 'general', size_bytes: 41943040, released_on: '2024-12-11' },
];

const DEVICES = [
  { serial: 'VC2609PVDA7Q', handle: 'compact', sku: 'VELA-CRICKET-GRAPHITE', status: 'registered', owner: 'customer@example.com', firmware: '7.0', fromOrder: true, warranty_until: '2028-01-14' },
  { serial: 'VA2609NRWB2Z', handle: 'flagship', sku: 'VELA-A1-SAND', status: 'registered', owner: 'customer2@example.com', firmware: '2.4', fromOrder: false, warranty_until: '2027-03-02' },
  { serial: 'VA2609KTMHX4', handle: 'flagship', sku: 'VELA-A1-GRAPHITE', status: 'sold', owner: null, firmware: null, fromOrder: false, warranty_until: '2028-06-30' },
  { serial: 'VC2609WJ3DKT', handle: 'compact', sku: 'VELA-CRICKET-YELLOW', status: 'blocked', owner: null, firmware: null, fromOrder: false, blocked_reason: 'reported_stolen', warranty_until: null },
];

export async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await getPool().query(sql);
  logEvent('schema applied');
}

export async function seed() {
  const passwordHash = hashPassword(SEED_PASSWORD);

  await tx(async (c) => {
    // Customers. Idempotent on the case-insensitive unique email.
    for (const [email, name] of [
      ['customer@example.com', 'Iris Vantaa'],
      ['customer2@example.com', 'Rune Halden'],
    ]) {
      await c.query(
        `INSERT INTO customer (email, name, password_hash, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`,
        [email, name, passwordHash],
      );
    }

    // Products, variants and stock.
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

      for (const [i, v] of p.variants.entries()) {
        const { rows: vr } = await c.query(
          `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
           VALUES ($1,$2,$3,$4,$5,'usd',$6,'deny')
           ON CONFLICT (sku) DO UPDATE SET
             product_id = EXCLUDED.product_id, title = EXCLUDED.title,
             option_value = EXCLUDED.option_value, price_minor = EXCLUDED.price_minor,
             position = EXCLUDED.position
           RETURNING id`,
          [productId, v.sku, `${p.title} ${v.option}`, v.option, v.price, i + 1],
        );
        // Stock is only set on first insert, so a restart never resets a
        // level that trading has since moved.
        await c.query(
          `INSERT INTO inventory_level (variant_id, available, committed)
           VALUES ($1,$2,0) ON CONFLICT (variant_id) DO NOTHING`,
          [vr[0].id, v.available],
        );
      }

      const blocks = BLOCKS[p.handle];
      if (blocks) {
        const { rows: existing } = await c.query(
          `SELECT count(*)::int AS n FROM product_block WHERE product_id = $1`, [productId],
        );
        if (existing[0].n === 0) {
          for (const [i, b] of blocks.entries()) {
            await c.query(
              `INSERT INTO product_block (product_id, kind, position, payload) VALUES ($1,$2,$3,$4)`,
              [productId, b.kind, i + 1, JSON.stringify(b.payload)],
            );
          }
        }
      }
    }

    // Application releases.
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

    // Firmware.
    for (const f of FIRMWARE) {
      const { rows: pr } = await c.query(`SELECT id FROM product WHERE handle = $1`, [f.handle]);
      await c.query(
        `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (product_id, build) DO UPDATE SET
           version = EXCLUDED.version, min_firmware = EXCLUDED.min_firmware,
           min_app_version = EXCLUDED.min_app_version, channel = EXCLUDED.channel,
           size_bytes = EXCLUDED.size_bytes, released_on = EXCLUDED.released_on`,
        [pr[0].id, f.version, f.build, f.min_firmware, f.min_app_version, f.channel, f.size_bytes, digest(`fw-${f.handle}-${f.version}`), f.released_on],
      );
    }

    // The seeded order VE-2026-0001.
    const { rows: cust } = await c.query(
      `SELECT id, email FROM customer WHERE lower(email) = 'customer@example.com'`,
    );
    const irisId = cust[0].id;
    const { rows: existingOrder } = await c.query(
      `SELECT id FROM "order" WHERE number = 'VE-2026-0001'`,
    );
    let seedOrderId = existingOrder[0]?.id;
    if (!seedOrderId) {
      const { rows: vr } = await c.query(
        `SELECT v.id, v.sku, v.price_minor, p.title FROM variant v JOIN product p ON p.id = v.product_id
         WHERE v.sku = 'VELA-CRICKET-GRAPHITE'`,
      );
      const line = vr[0];
      const subtotal = 29900, tax = 2990, shipping = 0, total = 32890;
      const { rows: or } = await c.query(
        `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor,
            discount_minor, total_minor, currency, status, payment_status, fulfilment_status,
            shipping_method, shipping_address, access_token_hash, killbill_external_key, placed_at)
         VALUES ('VE-2026-0001',$1,'customer@example.com',$2,$3,$4,0,$5,'usd','confirmed','invoiced','fulfilled',
            'Standard',$6,$7,'customer@example.com', now() - interval '210 days')
         RETURNING id`,
        [
          irisId, subtotal, shipping, tax, total,
          JSON.stringify({
            name: 'Iris Vantaa', line1: '18 Harbour Lane', line2: '', city: 'Portland',
            region: 'OR', postal_code: '97209', country: 'US', phone: '',
          }),
          crypto.createHash('sha256').update('seed-order-ve-2026-0001').digest('hex'),
        ],
      );
      seedOrderId = or[0].id;
      await c.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position)
         VALUES ($1,$2,$3,$4,1,$5,$5,1)`,
        [seedOrderId, line.id, `${line.title} Graphite`, line.sku, 29900],
      );
      // The order number sequence continues after the seeded order, so the
      // next order placed is VE-2026-0002.
      await c.query(`SELECT setval('order_number_seq', 1, true)`);
    }

    // Devices and their ownership links.
    for (const d of DEVICES) {
      const { rows: pr } = await c.query(`SELECT id FROM product WHERE handle = $1`, [d.handle]);
      const { rows: vr } = await c.query(`SELECT id FROM variant WHERE sku = $1`, [d.sku]);
      const { rows: dr } = await c.query(
        `INSERT INTO device (serial, product_id, variant_id, status, blocked_reason, firmware_version,
            firmware_reported_at, order_id, warranty_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (upper(serial)) DO UPDATE SET
           product_id = EXCLUDED.product_id, variant_id = EXCLUDED.variant_id
         RETURNING id, (xmax = 0) AS inserted`,
        [
          d.serial, pr[0].id, vr[0].id, d.status, d.blocked_reason ?? null,
          d.firmware ?? null, d.firmware ? new Date(Date.now() - 86400000 * 30) : null,
          d.fromOrder ? seedOrderId : null, d.warranty_until,
        ],
      );
      const deviceId = dr[0].id;
      if (d.owner) {
        const { rows: ow } = await c.query(
          `SELECT id FROM customer WHERE lower(email) = lower($1)`, [d.owner],
        );
        await c.query(
          `INSERT INTO device_ownership (device_id, customer_id, order_id, method)
           SELECT $1,$2,$3,$4
           WHERE NOT EXISTS (
             SELECT 1 FROM device_ownership WHERE device_id = $1 AND released_at IS NULL
           )`,
          [deviceId, ow[0].id, d.fromOrder ? seedOrderId : null, d.fromOrder ? 'order' : 'manual'],
        );
      }
    }
  });

  logEvent('seed complete');
}

export async function migrateAndSeed() {
  await migrate();
  await seed();
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  migrateAndSeed()
    .then(() => getPool().end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
