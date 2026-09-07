import { hashPassword } from './password.mjs';
import { hashToken } from './tokens.mjs';

export const SEED_PASSWORD = 'deku-demo-pw-2026';

const PRODUCTS = [
  {
    handle: 'flagship', title: 'Vela A1', subtitle: 'The full-frame body, built to be opened.',
    kind: 'camera', status: 'active', support_until: '2032-06-01', position: 1,
    variants: [
      { sku: 'VELA-A1-GRAPHITE', option: 'Graphite', price: 89900, available: 4 },
      { sku: 'VELA-A1-SAND', option: 'Sand', price: 89900, available: 6 },
      { sku: 'VELA-A1-YELLOW', option: 'Yellow', price: 89900, available: 1 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'The A1 is the camera we set out to make first and finished last. A 61 megapixel full-frame sensor, a shutter rated to 500,000 actuations, and a back plate that comes off with a driver you already own. Every part inside it has a number, and every number is on our site.' } },
      { kind: 'spec_group', payload: { title: 'Sensor and image', rows: [
        ['Sensor', '61 MP full-frame CMOS'], ['Pixel pitch', '3.76 µm'], ['ISO range', '64 to 25,600'],
        ['Shutter', 'Mechanical, 1/8000 to 30 s'], ['Burst', '9 fps mechanical'], ['Card slots', '2 × CFexpress Type B'] ] } },
      { kind: 'spec_group', payload: { title: 'Body', rows: [
        ['Dimensions', '128 × 97 × 74 mm'], ['Weight', '682 g with battery'], ['Mount', 'Vela V-mount'],
        ['Sealing', 'IP53'], ['Battery', 'VB-2, 2280 mAh'], ['Frames per charge', '740'] ] } },
      { kind: 'in_the_box', payload: { items: ['Vela A1 body', 'VB-2 battery', 'USB-C cable, 1 m', 'Body cap', 'Strap lugs and strap', 'Printed teardown card'] } },
      { kind: 'compatibility', payload: { min_os: 'macOS 13.0', min_app: '2.0.0', text: 'Arranger 2.0.0 or later on macOS 13.0 or later.' } },
    ],
  },
  {
    handle: 'compact', title: 'Vela Cricket', subtitle: 'A small camera that does not apologise for it.',
    kind: 'camera', status: 'active', support_until: null, position: 2,
    variants: [
      { sku: 'VELA-CRICKET-GRAPHITE', option: 'Graphite', price: 29900, available: 12 },
      { sku: 'VELA-CRICKET-YELLOW', option: 'Yellow', price: 29900, available: 0 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'The Cricket is 244 grams and fits in a coat pocket. It takes the same lenses as the A1 and writes the same raw files. We built it because the camera you have with you is the one that gets used.' } },
      { kind: 'spec_group', payload: { title: 'Sensor and image', rows: [
        ['Sensor', '26 MP APS-C CMOS'], ['Pixel pitch', '3.9 µm'], ['ISO range', '160 to 12,800'],
        ['Shutter', 'Mechanical, 1/4000 to 30 s'], ['Burst', '7 fps mechanical'], ['Card slots', '1 × SD UHS-II'] ] } },
      { kind: 'spec_group', payload: { title: 'Body', rows: [
        ['Dimensions', '112 × 66 × 38 mm'], ['Weight', '244 g with battery'], ['Mount', 'Vela V-mount'],
        ['Sealing', 'IP52'], ['Battery', 'VB-1, 1250 mAh'], ['Frames per charge', '410'] ] } },
      { kind: 'in_the_box', payload: { items: ['Vela Cricket body', 'VB-1 battery', 'USB-C cable, 1 m', 'Body cap', 'Wrist strap'] } },
      { kind: 'compatibility', payload: { min_os: 'macOS 13.0', min_app: '1.4.0', text: 'Arranger 1.4.0 or later on macOS 13.0 or later.' } },
    ],
  },
  {
    handle: 'mount', title: 'Monitor Mount', subtitle: 'Clamps a monitor to the body cage.',
    kind: 'accessory', status: 'discontinued', support_until: '2029-09-01', position: 3,
    variants: [
      { sku: 'VELA-MOUNT-CLAMP', option: 'Clamp', price: 4900, available: 0 },
      { sku: 'VELA-MOUNT-VESA', option: 'VESA', price: 4900, available: 0 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'An aluminium arm that holds a field monitor off the cage. We stopped making it when the cage changed shape, and we keep the spares.' } },
      { kind: 'spec_group', payload: { title: 'Mechanical', rows: [
        ['Material', '6061 aluminium'], ['Weight', '186 g'], ['Load', '1.2 kg'], ['Thread', '1/4-20 and 3/8-16'] ] } },
      { kind: 'in_the_box', payload: { items: ['Mount arm', 'Two thumbscrews', 'Hex key'] } },
      { kind: 'support_note', payload: { text: 'We no longer sell this. We will support it until September 1, 2029.' } },
    ],
  },
  {
    handle: 'case', title: 'Travel Case', subtitle: 'Hard shell for a body and three lenses.',
    kind: 'accessory', status: 'active', support_until: null, position: 4,
    variants: [{ sku: 'VELA-CASE-STD', option: 'Standard', price: 7900, available: 15 }],
    blocks: [
      { kind: 'lede', payload: { text: 'A moulded shell with a foam insert cut for one body and three lenses. It takes a hard knock and it fits under an aircraft seat.' } },
      { kind: 'spec_group', payload: { title: 'Mechanical', rows: [
        ['External', '420 × 310 × 160 mm'], ['Internal', '395 × 290 × 145 mm'], ['Weight', '1,840 g'], ['Rating', 'IP67 closed'] ] } },
      { kind: 'in_the_box', payload: { items: ['Case', 'Cut foam insert', 'Shoulder strap'] } },
    ],
  },
  {
    handle: 'cable', title: 'Replacement Cable', subtitle: 'USB-C to USB-C, the one in the box.',
    kind: 'spare', status: 'active', support_until: null, position: 5,
    variants: [
      { sku: 'VELA-CABLE-1M', option: '1 m', price: 1900, available: 30 },
      { sku: 'VELA-CABLE-2M', option: '2 m', price: 2400, available: 30 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'The same cable that ships with every camera. 10 Gbit/s, 60 W, braided jacket.' } },
      { kind: 'spec_group', payload: { title: 'Electrical', rows: [
        ['Data', 'USB 3.2 Gen 2, 10 Gbit/s'], ['Power', '60 W, 20 V at 3 A'], ['Jacket', 'Braided nylon'] ] } },
      { kind: 'in_the_box', payload: { items: ['One cable', 'One cable tie'] } },
    ],
  },
  {
    handle: 'protection', title: 'Shipment protection', subtitle: 'Covers loss, theft and damage in transit.',
    kind: 'protection', status: 'active', support_until: null, position: 99,
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
    version: '2.0.0', build: 2000, released_on: '2024-12-11', artifact_name: 'arranger-2.0.0.dmg',
    size_bytes: 154876459, sha256: '9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2',
    description: 'A rebuilt library, a new tethering engine and support for the Vela A1.',
    notes: {
      'Newly Added': ['Support for the Vela A1 and its 61 megapixel raw files.', 'A rewritten library that opens a catalogue of 200,000 frames in under two seconds.', 'Tethered capture over USB-C with live histogram.'],
      Improvements: ['Import is about three times faster on Apple silicon.', 'The develop panel keeps its scroll position between frames.', 'Colour profiles are read from the camera rather than guessed.'],
      'Bug Fixes': ['Fixed a crash when a card was removed during import.', 'Fixed star ratings not writing to sidecar files for CR3 frames.', 'Fixed the histogram going blank after a display change.'],
      'Known Issues': ['Tethering to the Cricket over a hub is unreliable on some third-party hubs.'],
    },
  },
  {
    version: '1.4.4', build: 1440, released_on: '2024-06-26', artifact_name: 'arranger-1.4.4.dmg',
    size_bytes: 160301059, sha256: 'c7e4a1b93f60d2854ae0b17c6d3f92845ba1c0e7d69f34a2b850c1de73f6a904',
    description: 'Fixes for import and a firmware channel correction.',
    notes: {
      Improvements: ['Import writes its progress to the window title so it reads from a distance.'],
      'Bug Fixes': ['Fixed firmware updates being offered on the wrong channel.', 'Fixed a hang when the catalogue lived on a network volume.'],
      'Known Issues': ['Very large exports can report a stale estimate for the last few frames.'],
    },
  },
  {
    version: '1.4.3', build: 1430, released_on: '2024-05-20', artifact_name: 'arranger-1.4.3.dmg',
    size_bytes: 158220144, sha256: '4b1d90ac5f8e27306da4c9b1e5f80273ac6d194b8e05f7a3c2d60e91a7c4d3b8',
    description: 'A maintenance release for the Cricket.',
    notes: {
      Improvements: ['Cricket previews render at full width on a narrow window.'],
      'Bug Fixes': ['Fixed the export panel forgetting its last folder.', 'Fixed a mis-drawn focus ring on the develop sliders.'],
    },
  },
  {
    version: '1.4.2', build: 1420, released_on: '2024-05-20', artifact_name: 'arranger-1.4.2.dmg',
    size_bytes: 157903622, sha256: '2f6c08b4e91d7a35c0bd2e847f19a6d305c8b7e214f9d0a63b58e2c471da96f0',
    description: 'Small fixes across import and develop.',
    notes: {
      'Bug Fixes': ['Fixed a rare stall when importing from two cards at once.'],
      'Known Issues': ['The develop histogram is off by one stop for monochrome frames.'],
    },
  },
];

const FIRMWARE = [
  { handle: 'compact', version: '7.2', build: 720, min_firmware: '6.11', min_app_version: '1.4.0', channel: 'general', size_bytes: 24117248, sha256: 'a1c9e4b70d825f36194ac0be7d2f8531c64b09ae73d15c802b6e4a97d130fc5a', released_on: '2024-11-04' },
  { handle: 'compact', version: '7.0', build: 700, min_firmware: '6.11', min_app_version: '1.4.0', channel: 'general', size_bytes: 23985152, sha256: 'b73f10d9ae5c284617fb0925d4e8a3c105f7b62e9d84a071c3e5f2b806da9147', released_on: '2024-06-18' },
  { handle: 'compact', version: '6.11', build: 611, min_firmware: null, min_app_version: '1.0.0', channel: 'general', size_bytes: 23461888, sha256: 'e08a6f3b1d29c745082be6a13f9d05c7248b1e93a7f640d5c81b3e29d70fa465', released_on: '2023-12-02' },
  { handle: 'flagship', version: '2.4', build: 240, min_firmware: '2.0', min_app_version: '2.0.0', channel: 'general', size_bytes: 41156608, sha256: 'd52b98e0c71a4f36085de2b91c7a06f4381e5da9b207c68f4a1d093e5b7c2081', released_on: '2024-12-11' },
];

const DEVICES = [
  { serial: 'VC2609PVDA7Q', handle: 'compact', sku: 'VELA-CRICKET-GRAPHITE', status: 'registered', owner: 'customer@example.com', firmware: '7.0', order_number: 'VE-2026-0001', warranty_until: '2028-02-14' },
  { serial: 'VA2609NRWB2Z', handle: 'flagship', sku: 'VELA-A1-SAND', status: 'registered', owner: 'customer2@example.com', firmware: '2.4', order_number: null, warranty_until: '2028-03-02' },
  { serial: 'VA2609KTMHX4', handle: 'flagship', sku: 'VELA-A1-GRAPHITE', status: 'sold', owner: null, firmware: null, order_number: null, warranty_until: '2028-05-19' },
  { serial: 'VC2609WJ3DKT', handle: 'compact', sku: 'VELA-CRICKET-YELLOW', status: 'blocked', owner: null, firmware: null, order_number: null, warranty_until: null, blocked_reason: 'reported_stolen' },
];

async function one(client, sql, params) {
  const { rows } = await client.query(sql, params);
  return rows[0];
}

export async function seed(client) {
  const passwordHash = await hashPassword(SEED_PASSWORD);

  // Customers. Existing rows keep their password hash rather than being churned.
  const customers = {};
  for (const c of [
    { email: 'customer@example.com', name: 'Iris Vantaa' },
    { email: 'customer2@example.com', name: 'Rune Halden' },
  ]) {
    const row = await one(client,
      `INSERT INTO customer (email, name, password_hash, status)
       VALUES ($1,$2,$3,'active')
       ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`, [c.email, c.name, passwordHash]);
    customers[c.email] = row.id;
  }

  // Products, variants, inventory, blocks.
  const variantIds = {};
  const productIds = {};
  for (const p of PRODUCTS) {
    const prod = await one(client,
      `INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (handle) DO UPDATE SET
         title=EXCLUDED.title, subtitle=EXCLUDED.subtitle, kind=EXCLUDED.kind,
         status=EXCLUDED.status, support_until=EXCLUDED.support_until, position=EXCLUDED.position
       RETURNING id`,
      [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position]);
    productIds[p.handle] = prod.id;

    let vpos = 1;
    for (const v of p.variants) {
      const variant = await one(client,
        `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
         VALUES ($1,$2,$3,$4,$5,'usd',$6,'deny')
         ON CONFLICT (sku) DO UPDATE SET
           product_id=EXCLUDED.product_id, title=EXCLUDED.title, option_value=EXCLUDED.option_value,
           price_minor=EXCLUDED.price_minor, position=EXCLUDED.position
         RETURNING id`,
        [prod.id, v.sku, v.option, v.option, v.price, vpos]);
      variantIds[v.sku] = variant.id;
      // Inventory is only ever set on first insert; a restart must not undo the
      // stock movement of orders that have already been placed.
      await client.query(
        `INSERT INTO inventory_level (variant_id, available, committed)
         VALUES ($1,$2,0) ON CONFLICT (variant_id) DO NOTHING`,
        [variant.id, v.available]);
      vpos += 1;
    }

    await client.query('DELETE FROM product_block WHERE product_id = $1', [prod.id]);
    let bpos = 1;
    for (const b of p.blocks) {
      await client.query(
        `INSERT INTO product_block (product_id, kind, position, payload) VALUES ($1,$2,$3,$4)`,
        [prod.id, b.kind, bpos, JSON.stringify(b.payload)]);
      bpos += 1;
    }
  }

  // Delivery.
  const zone = await one(client,
    `INSERT INTO shipping_zone (code, country) VALUES ('us-domestic','US')
     ON CONFLICT (code) DO UPDATE SET country=EXCLUDED.country RETURNING id`, []);
  for (const m of [
    { code: 'standard', title: 'Standard', price: 0, window: 'Arrives in 5 to 7 days', position: 1 },
    { code: 'express', title: 'Express', price: 2500, window: 'Arrives in 2 days', position: 2 },
  ]) {
    await client.query(
      `INSERT INTO shipping_method (zone_id, code, title, price_minor, window_text, position)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (zone_id, code) DO UPDATE SET
         title=EXCLUDED.title, price_minor=EXCLUDED.price_minor,
         window_text=EXCLUDED.window_text, position=EXCLUDED.position`,
      [zone.id, m.code, m.title, m.price, m.window, m.position]);
  }

  // Releases.
  for (const r of RELEASES) {
    await client.query(
      `INSERT INTO app_release (version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes)
       VALUES ($1,$2,$3,'general',$4,$5,$6,$7,$8)
       ON CONFLICT (version) DO UPDATE SET
         build=EXCLUDED.build, released_on=EXCLUDED.released_on, artifact_name=EXCLUDED.artifact_name,
         size_bytes=EXCLUDED.size_bytes, sha256=EXCLUDED.sha256, description=EXCLUDED.description, notes=EXCLUDED.notes`,
      [r.version, r.build, r.released_on, r.artifact_name, r.size_bytes, r.sha256, r.description, JSON.stringify(r.notes)]);
  }

  // Firmware.
  for (const f of FIRMWARE) {
    await client.query(
      `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (product_id, build) DO UPDATE SET
         version=EXCLUDED.version, min_firmware=EXCLUDED.min_firmware, min_app_version=EXCLUDED.min_app_version,
         channel=EXCLUDED.channel, size_bytes=EXCLUDED.size_bytes, sha256=EXCLUDED.sha256, released_on=EXCLUDED.released_on`,
      [productIds[f.handle], f.version, f.build, f.min_firmware, f.min_app_version, f.channel, f.size_bytes, f.sha256, f.released_on]);
  }

  // The seeded order VE-2026-0001.
  const existingOrder = await one(client, `SELECT id FROM "order" WHERE number = 'VE-2026-0001'`, []);
  let seededOrderId = existingOrder && existingOrder.id;
  if (!seededOrderId) {
    const accessToken = 'seed-order-token-ve-2026-0001';
    const row = await one(client,
      `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, discount_minor,
                            total_minor, currency, status, payment_status, fulfilment_status, shipping_method,
                            shipping_address, access_token_hash, killbill_external_key, killbill_invoice_amount, placed_at)
       VALUES ('VE-2026-0001',$1,'customer@example.com',29900,0,2990,0,32890,'usd','confirmed','invoiced','fulfilled','standard',
               $2,$3,'customer@example.com',328.90, timestamptz '2026-02-14 10:12:00+00')
       RETURNING id`,
      [customers['customer@example.com'],
       JSON.stringify({ name: 'Iris Vantaa', line1: '14 Harbour Lane', line2: '', city: 'Portland', region: 'OR', postal_code: '97209', country: 'US', phone: '' }),
       hashToken(accessToken)]);
    seededOrderId = row.id;
    await client.query(
      `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, option_snapshot, quantity, unit_price_minor, total_minor, position)
       VALUES ($1,$2,'Vela Cricket','VELA-CRICKET-GRAPHITE','Graphite',1,29900,29900,1)`,
      [seededOrderId, variantIds['VELA-CRICKET-GRAPHITE']]);
  }

  // The order-number counter must sit above the seeded order so the next order
  // placed is VE-2026-0002.
  await client.query(
    `INSERT INTO order_number_seq (year, last_number) VALUES (2026, 1)
     ON CONFLICT (year) DO NOTHING`, []);

  // Devices and their ownership.
  for (const d of DEVICES) {
    const dev = await one(client,
      `INSERT INTO device (serial, product_id, variant_id, status, blocked_reason, firmware_version,
                           firmware_reported_at, order_id, warranty_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (upper(serial)) DO UPDATE SET status = device.status
       RETURNING id, (xmax = 0) AS inserted`,
      [d.serial, productIds[d.handle], variantIds[d.sku], d.status, d.blocked_reason || null,
       d.firmware, d.firmware ? new Date('2026-08-20T09:00:00Z') : null,
       d.order_number ? seededOrderId : null, d.warranty_until]);

    if (dev.inserted && d.owner) {
      await client.query(
        `INSERT INTO device_ownership (device_id, customer_id, order_id, method)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT DO NOTHING`,
        [dev.id, customers[d.owner], d.order_number ? seededOrderId : null, d.order_number ? 'order' : 'manual']);
    }
  }
}
