import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { hashPassword, sha256 } from './passwords.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const SEED_PASSWORD = 'deku-demo-pw-2026';

function digestFor(label) {
  return crypto.createHash('sha256').update(`vela::${label}`).digest('hex');
}

const PRODUCTS = [
  {
    handle: 'flagship',
    title: 'Vela A1',
    subtitle: 'The full-frame body the workshop was built around.',
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
          text: 'The A1 is the camera we make when nothing has to be left out. A 42 megapixel sensor, a shutter rated for 400,000 frames, and a body milled from one block of aluminium so the mount never moves relative to the sensor.',
        },
      },
      {
        kind: 'spec_group',
        payload: {
          title: 'Sensor and image',
          rows: [
            ['Sensor', '42.2 MP full frame CMOS'],
            ['Pixel pitch', '5.94 µm'],
            ['Dynamic range', '14.8 stops'],
            ['Base sensitivity', 'ISO 64'],
            ['Shutter life', '400000 frames'],
          ],
        },
      },
      {
        kind: 'spec_group',
        payload: {
          title: 'Body',
          rows: [
            ['Mass with battery', '712 g'],
            ['Dimensions', '134 x 96 x 72 mm'],
            ['Sealing', 'IP53'],
            ['Storage', 'Two CFexpress B slots'],
            ['Battery', 'VB-90, 2250 frames'],
          ],
        },
      },
      {
        kind: 'in_the_box',
        payload: {
          items: ['Vela A1 body', 'VB-90 battery', 'Braided 2 m cable', 'Strap lugs and strap', 'Printed serial card'],
        },
      },
      {
        kind: 'compatibility',
        payload: { min_os: 'macOS 13.0', min_app: 'Arranger 2.0.0', note: 'Firmware 2.4 and later.' },
      },
    ],
  },
  {
    handle: 'compact',
    title: 'Vela Cricket',
    subtitle: 'The small one. Same colour science, one hand.',
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
          text: 'The Cricket carries the same colour science as the A1 in a body you forget you are holding. One dial, one button, a fixed 28 mm lens, and a battery that lasts a weekend.',
        },
      },
      {
        kind: 'spec_group',
        payload: {
          title: 'Sensor and image',
          rows: [
            ['Sensor', '26.1 MP APS-C CMOS'],
            ['Lens', '28 mm equivalent, f/2.8'],
            ['Dynamic range', '13.1 stops'],
            ['Base sensitivity', 'ISO 100'],
            ['Shutter life', '200000 frames'],
          ],
        },
      },
      {
        kind: 'spec_group',
        payload: {
          title: 'Body',
          rows: [
            ['Mass with battery', '319 g'],
            ['Dimensions', '112 x 64 x 38 mm'],
            ['Sealing', 'IP52'],
            ['Storage', 'One SD UHS-II slot'],
            ['Battery', 'VB-40, 940 frames'],
          ],
        },
      },
      { kind: 'in_the_box', payload: { items: ['Vela Cricket body', 'VB-40 battery', 'Braided 1 m cable', 'Wrist strap'] } },
      {
        kind: 'compatibility',
        payload: { min_os: 'macOS 13.0', min_app: 'Arranger 1.4.0', note: 'Firmware 6.11 and later.' },
      },
    ],
  },
  {
    handle: 'mount',
    title: 'Monitor Mount',
    subtitle: 'Holds a reference monitor over the table.',
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
          text: 'A steel arm that puts a reference monitor where your eyes already are. We stopped making it when our supplier stopped making the ball joint.',
        },
      },
      {
        kind: 'spec_group',
        payload: {
          title: 'Mechanical',
          rows: [
            ['Load', '4.5 kg'],
            ['Reach', '420 mm'],
            ['Thread', '1/4 in and 3/8 in'],
            ['Mass', '890 g'],
          ],
        },
      },
      { kind: 'in_the_box', payload: { items: ['Arm', 'Clamp or VESA plate', 'Hex keys'] } },
      { kind: 'compatibility', payload: { min_os: 'Not applicable', min_app: 'Not applicable' } },
    ],
  },
  {
    handle: 'case',
    title: 'Travel Case',
    subtitle: 'A body, two lenses and the cables, closed.',
    kind: 'accessory',
    status: 'active',
    support_until: null,
    position: 4,
    variants: [{ sku: 'VELA-CASE-STD', option: 'Standard', price: 7900, available: 15 }],
    blocks: [
      {
        kind: 'lede',
        payload: {
          text: 'Moulded foam in a shell that survives an overhead bin. Cut for a body, two lenses, four batteries and the cables you actually carry.',
        },
      },
      {
        kind: 'spec_group',
        payload: {
          title: 'Case',
          rows: [
            ['External', '360 x 240 x 130 mm'],
            ['Mass empty', '1140 g'],
            ['Shell', 'Injection moulded copolymer'],
            ['Sealing', 'IP67 closed'],
          ],
        },
      },
      { kind: 'in_the_box', payload: { items: ['Case', 'Cut foam insert', 'Shoulder strap'] } },
      { kind: 'compatibility', payload: { min_os: 'Not applicable', min_app: 'Not applicable' } },
    ],
  },
  {
    handle: 'cable',
    title: 'Replacement Cable',
    subtitle: 'The braided cable, on its own.',
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
        payload: {
          text: 'The cable that ships in the box, sold on its own, because cables are lost more often than cameras are.',
        },
      },
      {
        kind: 'spec_group',
        payload: {
          title: 'Cable',
          rows: [
            ['Connector', 'USB-C to USB-C'],
            ['Data rate', '10 Gbit/s'],
            ['Power', '100 W'],
            ['Jacket', 'Braided nylon'],
          ],
        },
      },
      { kind: 'in_the_box', payload: { items: ['One cable'] } },
      { kind: 'compatibility', payload: { min_os: 'macOS 13.0', min_app: 'Arranger 1.4.0' } },
    ],
  },
  {
    handle: 'protection',
    title: 'Shipment protection',
    subtitle: 'Cover against loss, theft and damage in transit.',
    kind: 'protection',
    status: 'active',
    support_until: null,
    position: 99,
    variants: [
      { sku: 'VELA-PROTECT-1', option: 'Tier 1', price: 98, available: 1000000 },
      { sku: 'VELA-PROTECT-2', option: 'Tier 2', price: 298, available: 1000000 },
      { sku: 'VELA-PROTECT-3', option: 'Tier 3', price: 598, available: 1000000 },
      { sku: 'VELA-PROTECT-4', option: 'Tier 4', price: 1198, available: 1000000 },
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
    description: 'A rebuilt library, a faster importer and a new firmware pane.',
    notes: {
      'Newly Added': [
        { text: 'A firmware pane that reads the camera and offers only images it can accept.', issue: 'AR-1841' },
        { text: 'Sessions, which group a shoot across several cards.', issue: 'AR-1802' },
        { text: 'Export presets that travel with a project file.', issue: 'AR-1866' },
      ],
      Improvements: [
        { text: 'The importer reads a full card about twice as fast as 1.4.4.', issue: 'AR-1877' },
        { text: 'The library opens without blocking on thumbnails.', issue: 'AR-1880' },
      ],
      'Bug Fixes': [
        { text: 'Ratings applied during an import are no longer lost when the card is removed early.', issue: 'AR-1893' },
      ],
      'Known Issues': [
        { text: 'A Cricket on firmware below 6.11 is not recognised until it is updated.', issue: 'AR-1901' },
      ],
    },
  },
  {
    version: '1.4.4',
    build: 1440,
    released_on: '2024-06-26',
    artifact_name: 'arranger-1.4.4.dmg',
    size_bytes: 160301059,
    sha256: digestFor('arranger-1.4.4'),
    description: 'The last release on the 1.4 line.',
    notes: {
      Improvements: [{ text: 'Card reads recover from a dropped connection without restarting the import.', issue: 'AR-1712' }],
      'Bug Fixes': [
        { text: 'A project opened from an external disk no longer loses its previews when the disk sleeps.', issue: 'AR-1720' },
        { text: 'The histogram redraws when the display profile changes.', issue: 'AR-1729' },
      ],
      'Known Issues': [{ text: 'Batch export to a network volume can stall on the last file.', issue: 'AR-1733' }],
    },
  },
  {
    version: '1.4.3',
    build: 1430,
    released_on: '2024-05-20',
    artifact_name: 'arranger-1.4.3.dmg',
    size_bytes: 158220144,
    sha256: digestFor('arranger-1.4.3'),
    description: 'Firmware handling for the Cricket, and a quieter importer.',
    notes: {
      'Newly Added': [{ text: 'Cricket firmware 7.0 can be written from the application.', issue: 'AR-1688' }],
      Improvements: [{ text: 'The importer no longer wakes the display to report progress.', issue: 'AR-1691' }],
      'Bug Fixes': [{ text: 'Serial numbers read from an A1 are shown unformatted, as they are engraved.', issue: 'AR-1695' }],
    },
  },
  {
    version: '1.4.2',
    build: 1420,
    released_on: '2024-05-20',
    artifact_name: 'arranger-1.4.2.dmg',
    size_bytes: 157903622,
    sha256: digestFor('arranger-1.4.2'),
    description: 'A correctness release.',
    notes: {
      'Bug Fixes': [
        { text: 'Two cameras plugged in together are no longer merged into one device row.', issue: 'AR-1660' },
        { text: 'An interrupted firmware write reports the version the camera is actually running.', issue: 'AR-1663' },
      ],
    },
  },
];

const FIRMWARE = [
  { handle: 'compact', version: '7.2', build: 720, min_firmware: '6.11', min_app_version: '1.4.0', channel: 'general', size_bytes: 41894102, released_on: '2024-12-04' },
  { handle: 'compact', version: '7.0', build: 700, min_firmware: '6.11', min_app_version: '1.4.0', channel: 'general', size_bytes: 41220980, released_on: '2024-05-14' },
  { handle: 'compact', version: '6.11', build: 611, min_firmware: null, min_app_version: '1.0.0', channel: 'general', size_bytes: 39880114, released_on: '2023-11-02' },
  { handle: 'flagship', version: '2.4', build: 240, min_firmware: '2.0', min_app_version: '2.0.0', channel: 'general', size_bytes: 58210447, released_on: '2024-12-09' },
];

const DEVICES = [
  {
    serial: 'VC2609PVDA7Q',
    handle: 'compact',
    sku: 'VELA-CRICKET-GRAPHITE',
    status: 'registered',
    owner: 'customer@example.com',
    from_order: 'VE-2026-0001',
    firmware: '7.0',
    warranty_until: '2028-02-14',
    nickname: 'Pocket',
  },
  {
    serial: 'VA2609NRWB2Z',
    handle: 'flagship',
    sku: 'VELA-A1-SAND',
    status: 'registered',
    owner: 'customer2@example.com',
    from_order: null,
    firmware: '2.4',
    warranty_until: '2025-03-01',
    nickname: null,
  },
  {
    serial: 'VA2609KTMHX4',
    handle: 'flagship',
    sku: 'VELA-A1-GRAPHITE',
    status: 'sold',
    owner: null,
    from_order: null,
    firmware: null,
    warranty_until: '2028-06-30',
    nickname: null,
  },
  {
    serial: 'VC2609WJ3DKT',
    handle: 'compact',
    sku: 'VELA-CRICKET-YELLOW',
    status: 'blocked',
    blocked_reason: 'reported_stolen',
    owner: null,
    from_order: null,
    firmware: null,
    warranty_until: null,
    nickname: null,
  },
];

export async function migrate() {
  const sql = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

export async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // A single advisory lock makes seeding safe even if two containers boot together.
    await client.query('SELECT pg_advisory_xact_lock(884411)');

    const pwHash = hashPassword(SEED_PASSWORD);
    const customers = {};
    for (const [email, name] of [
      ['customer@example.com', 'Iris Vantaa'],
      ['customer2@example.com', 'Rune Halden'],
    ]) {
      const r = await client.query(
        `INSERT INTO customer (email, name, password_hash, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [email, name, pwHash],
      );
      customers[email] = r.rows[0].id;
    }

    const productIds = {};
    const variantIds = {};
    for (const p of PRODUCTS) {
      const r = await client.query(
        `INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (handle) DO UPDATE SET
           title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, kind = EXCLUDED.kind,
           status = EXCLUDED.status, support_until = EXCLUDED.support_until, position = EXCLUDED.position
         RETURNING id`,
        [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position],
      );
      const pid = r.rows[0].id;
      productIds[p.handle] = pid;

      let pos = 0;
      for (const v of p.variants) {
        pos += 1;
        const vr = await client.query(
          `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
           VALUES ($1, $2, $3, $4, $5, 'usd', $6, $7)
           ON CONFLICT (sku) DO UPDATE SET
             product_id = EXCLUDED.product_id, title = EXCLUDED.title, option_value = EXCLUDED.option_value,
             price_minor = EXCLUDED.price_minor, position = EXCLUDED.position
           RETURNING id`,
          [pid, v.sku, `${p.title} ${v.option}`, v.option, v.price, pos, p.kind === 'protection' ? 'continue' : 'deny'],
        );
        const vid = vr.rows[0].id;
        variantIds[v.sku] = vid;
        await client.query(
          `INSERT INTO inventory_level (variant_id, available, committed)
           VALUES ($1, $2, 0)
           ON CONFLICT (variant_id) DO NOTHING`,
          [vid, v.available],
        );
      }

      let bpos = 0;
      for (const b of p.blocks) {
        bpos += 1;
        await client.query(
          `INSERT INTO product_block (product_id, kind, position, payload)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (product_id, kind, position) DO UPDATE SET payload = EXCLUDED.payload`,
          [pid, b.kind, bpos, JSON.stringify(b.payload)],
        );
      }
    }

    const zone = await client.query(
      `INSERT INTO delivery_zone (code, country) VALUES ('us-domestic', 'US')
       ON CONFLICT (code) DO UPDATE SET country = EXCLUDED.country RETURNING id`,
    );
    const zoneId = zone.rows[0].id;
    for (const m of [
      { code: 'standard', title: 'Standard', price: 0, window: 'Arrives in 5 to 7 days', position: 1 },
      { code: 'express', title: 'Express', price: 2500, window: 'Arrives in 2 days', position: 2 },
    ]) {
      await client.query(
        `INSERT INTO delivery_method (zone_id, code, title, price_minor, window_label, position)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (zone_id, code) DO UPDATE SET
           title = EXCLUDED.title, price_minor = EXCLUDED.price_minor,
           window_label = EXCLUDED.window_label, position = EXCLUDED.position`,
        [zoneId, m.code, m.title, m.price, m.window, m.position],
      );
    }

    for (const r of RELEASES) {
      await client.query(
        `INSERT INTO app_release (version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes)
         VALUES ($1, $2, $3, 'general', $4, $5, $6, $7, $8)
         ON CONFLICT (version) DO UPDATE SET
           build = EXCLUDED.build, released_on = EXCLUDED.released_on, artifact_name = EXCLUDED.artifact_name,
           size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256, description = EXCLUDED.description,
           notes = EXCLUDED.notes`,
        [r.version, r.build, r.released_on, r.artifact_name, r.size_bytes, r.sha256, r.description, JSON.stringify(r.notes)],
      );
    }

    for (const f of FIRMWARE) {
      await client.query(
        `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (product_id, build) DO UPDATE SET
           version = EXCLUDED.version, min_firmware = EXCLUDED.min_firmware,
           min_app_version = EXCLUDED.min_app_version, channel = EXCLUDED.channel,
           size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256, released_on = EXCLUDED.released_on`,
        [
          productIds[f.handle],
          f.version,
          f.build,
          f.min_firmware,
          f.min_app_version,
          f.channel,
          f.size_bytes,
          digestFor(`${f.handle}-firmware-${f.version}`),
          f.released_on,
        ],
      );
    }

    // The seeded order, its lines, and the number counter it consumed.
    const existingOrder = await client.query(`SELECT id FROM "order" WHERE number = 'VE-2026-0001'`);
    let orderId;
    if (existingOrder.rows.length) {
      orderId = existingOrder.rows[0].id;
    } else {
      const address = {
        name: 'Iris Vantaa',
        line1: '48 Harbour Row',
        line2: '',
        city: 'Portland',
        region: 'OR',
        postal_code: '97204',
        country: 'US',
        phone: '',
      };
      const ins = await client.query(
        `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, discount_minor,
                              total_minor, currency, status, payment_status, fulfilment_status, shipping_method,
                              shipping_address, access_token_hash, killbill_external_key, killbill_invoice_amount, placed_at)
         VALUES ('VE-2026-0001', $1, 'customer@example.com', 29900, 0, 2990, 0, 32890, 'usd',
                 'confirmed', 'invoiced', 'fulfilled', 'standard', $2, $3, 'customer@example.com', 328.90,
                 timestamptz '2026-02-14 15:04:00+00')
         RETURNING id`,
        [customers['customer@example.com'], JSON.stringify(address), sha256('seed-order-VE-2026-0001')],
      );
      orderId = ins.rows[0].id;
      await client.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position)
         VALUES ($1, $2, 'Vela Cricket — Graphite', 'VELA-CRICKET-GRAPHITE', 1, 29900, 29900, 1)`,
        [orderId, variantIds['VELA-CRICKET-GRAPHITE']],
      );
    }
    await client.query(
      `INSERT INTO order_number_counter (year, last_number) VALUES (2026, 1)
       ON CONFLICT (year) DO NOTHING`,
    );

    for (const d of DEVICES) {
      const dr = await client.query(
        `INSERT INTO device (serial, product_id, variant_id, status, blocked_reason, firmware_version,
                             firmware_reported_at, nickname, order_id, warranty_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (upper(serial)) DO NOTHING
         RETURNING id`,
        [
          d.serial,
          productIds[d.handle],
          variantIds[d.sku],
          d.status,
          d.blocked_reason || null,
          d.firmware,
          d.firmware ? new Date('2026-03-02T09:12:00Z') : null,
          d.nickname,
          d.from_order ? orderId : null,
          d.warranty_until,
        ],
      );
      if (dr.rows.length && d.owner) {
        await client.query(
          `INSERT INTO device_ownership (device_id, customer_id, order_id, claimed_at, method)
           VALUES ($1, $2, $3, timestamptz '2026-02-20 10:00:00+00', $4)
           ON CONFLICT DO NOTHING`,
          [dr.rows[0].id, customers[d.owner], d.from_order ? orderId : null, d.from_order ? 'order' : 'manual'],
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
