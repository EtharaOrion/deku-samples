import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { q, one } from './db/index.js';
import { migrate } from './db/migrate.js';

const PASSWORD = process.env.SEED_PASSWORD || 'deku-demo-pw-2026';

async function ensureCustomer(email, name) {
  const existing = await one('SELECT id FROM customer WHERE lower(email)=lower($1)', [email]);
  if (existing) return existing.id;
  const r = await one(
    'INSERT INTO customer (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id',
    [email, name, bcrypt.hashSync(PASSWORD, 10)]
  );
  return r.id;
}

async function ensureProduct(p) {
  let row = await one('SELECT id FROM product WHERE handle=$1', [p.handle]);
  if (!row) {
    row = await one(
      'INSERT INTO product (handle,title,subtitle,kind,status,support_until,position) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until || null, p.position]
    );
  }
  const pid = row.id;
  for (const [i, b] of (p.blocks || []).entries()) {
    await q(
      'INSERT INTO product_block (product_id,kind,position,payload) SELECT $1,$2,$3,$4 WHERE NOT EXISTS (SELECT 1 FROM product_block WHERE product_id=$1 AND position=$3 AND kind=$2)',
      [pid, b.kind, i, JSON.stringify(b.payload)]
    );
  }
  for (const [i, v] of p.variants.entries()) {
    const vr = await one('SELECT id FROM variant WHERE sku=$1', [v.sku]);
    let vid;
    if (!vr) {
      const ins = await one(
        'INSERT INTO variant (product_id,sku,title,option_value,price_minor,currency,position,inventory_policy) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [pid, v.sku, v.title, v.option_value, v.price_minor, 'USD', i, v.inventory_policy || 'deny']
      );
      vid = ins.id;
    } else {
      vid = vr.id;
    }
    await q(
      'INSERT INTO inventory_level (variant_id, available, committed) VALUES ($1,$2,0) ON CONFLICT (variant_id) DO UPDATE SET available = EXCLUDED.available',
      [vid, v.available]
    );
  }
  return pid;
}


const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const PRODUCTS = [
  {
    handle: 'flagship', title: 'Vela A1', subtitle: 'The full-frame camera we wanted on our own desks.', kind: 'camera', status: 'active', support_until: '2032-06-01', position: 1,
    variants: [
      { sku: 'VELA-A1-GRAPHITE', title: 'Graphite', option_value: 'Graphite', price_minor: 89900, available: 4 },
      { sku: 'VELA-A1-SAND', title: 'Sand', option_value: 'Sand', price_minor: 89900, available: 6 },
      { sku: 'VELA-A1-YELLOW', title: 'Yellow', option_value: 'Yellow', price_minor: 89900, available: 1 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'Vela A1 is the camera we build when nothing has to be compromised. A full-frame sensor behind a fixed 35mm lens, one dial for everything, and a body that survives a decade of work.' } },
      { kind: 'spec_group', payload: { title: 'Body', rows: [['Sensor','Full-frame 24 megapixel'],['Lens','35mm f/2, fixed'],['Weight','612 g'],['Body','Milled aluminium, graphite, sand or yellow']] } },
      { kind: 'spec_group', payload: { title: 'Electronics', rows: [['Battery','740 shots per charge'],['Storage','One SD card, UHS-II'],['Firmware','Field-writable over USB or Arranger']] } },
      { kind: 'in_the_box', payload: { items: ['Vela A1 body','Lens cap','Battery','USB-C cable','Woven strap','Printed short guide'] } },
      { kind: 'compatibility', payload: { os: 'macOS 12.0 or later', app: 'Arranger 2.0.0 or later' } },
    ],
  },
  {
    handle: 'compact', title: 'Vela Cricket', subtitle: 'The small one that goes everywhere.', kind: 'camera', status: 'active', position: 2,
    variants: [
      { sku: 'VELA-CRICKET-GRAPHITE', title: 'Graphite', option_value: 'Graphite', price_minor: 29900, available: 12 },
      { sku: 'VELA-CRICKET-YELLOW', title: 'Yellow', option_value: 'Yellow', price_minor: 29900, available: 0 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'Vela Cricket carries the same sensor as Vela A1 in a body that fits a jacket pocket. One battery, one card, one dial.' } },
      { kind: 'spec_group', payload: { title: 'Body', rows: [['Sensor','Full-frame 24 megapixel'],['Lens','28mm f/2.8, fixed'],['Weight','298 g'],['Body','Milled aluminium, graphite or yellow']] } },
      { kind: 'in_the_box', payload: { items: ['Vela Cricket body','Battery','USB-C cable','Woven strap'] } },
      { kind: 'compatibility', payload: { os: 'macOS 12.0 or later', app: 'Arranger 1.4.0 or later' } },
    ],
  },
  {
    handle: 'mount', title: 'Monitor Mount', subtitle: 'A clamp and a VESA plate for the desk.', kind: 'accessory', status: 'discontinued', support_until: '2029-09-01', position: 3,
    variants: [
      { sku: 'VELA-MOUNT-CLAMP', title: 'Clamp', option_value: 'Clamp', price_minor: 4900, available: 0 },
      { sku: 'VELA-MOUNT-VESA', title: 'VESA', option_value: 'VESA', price_minor: 4900, available: 0 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'Monitor Mount held a camera to a desk edge or a monitor arm. We no longer sell it.' } },
      { kind: 'support_note', payload: { text: 'We no longer sell this. We will support it until September 1, 2029.' } },
      { kind: 'in_the_box', payload: { items: ['Mount','Hex key','Two bolts'] } },
    ],
  },
  {
    handle: 'case', title: 'Travel Case', subtitle: 'Cut foam, one zip, no logos.', kind: 'accessory', status: 'active', position: 4,
    variants: [{ sku: 'VELA-CASE-STD', title: 'Standard', option_value: 'Standard', price_minor: 7900, available: 15 }],
    blocks: [
      { kind: 'lede', payload: { text: 'A hard case with cut foam for one camera, one battery and one cable.' } },
      { kind: 'spec_group', payload: { title: 'Size', rows: [['Outside','280 by 190 by 90 mm'],['Inside','260 by 170 by 70 mm'],['Weight','410 g']] } },
      { kind: 'in_the_box', payload: { items: ['Case','Foam insert'] } },
    ],
  },
  {
    handle: 'cable', title: 'Replacement Cable', subtitle: 'The one you lost.', kind: 'spare', status: 'active', position: 5,
    variants: [
      { sku: 'VELA-CABLE-1M', title: '1 m', option_value: '1 m', price_minor: 1900, available: 30 },
      { sku: 'VELA-CABLE-2M', title: '2 m', option_value: '2 m', price_minor: 2400, available: 30 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'A braided USB-C cable, in one metre and two.' } },
      { kind: 'compatibility', payload: { os: 'Any', app: 'Not required' } },
    ],
  },
];

const PROTECTION = {
  handle: 'shipment-protection', title: 'Shipment protection', subtitle: 'Loss, theft and damage cover for one shipment.', kind: 'protection', status: 'active', position: 99,
  variants: [
    { sku: 'VELA-PROTECT-1', title: 'Standard', option_value: 'Standard', price_minor: 98, available: 0, inventory_policy: 'continue' },
    { sku: 'VELA-PROTECT-2', title: 'Standard', option_value: 'Standard', price_minor: 298, available: 0, inventory_policy: 'continue' },
    { sku: 'VELA-PROTECT-3', title: 'Standard', option_value: 'Standard', price_minor: 598, available: 0, inventory_policy: 'continue' },
    { sku: 'VELA-PROTECT-4', title: 'Standard', option_value: 'Standard', price_minor: 1198, available: 0, inventory_policy: 'continue' },
  ],
  blocks: [],
};

const RELEASES = [
  { version: '2.0.0', build: 2000, released_on: '2024-12-11', artifact_name: 'arranger-2.0.0.dmg', size_bytes: 154876459, sha256: '9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2',
    description: 'Arranger 2.0 is a rewrite of the library and the tether.',
    notes: {
      'Newly Added': ['A rewritten library that reads a card in one pass.','Direct firmware writes over USB, in the app.','A machine-readable log of every import, under Help.','Bundles: one import can hold several cards.'],
      'Improvements': ['Opens a card of ten thousand frames in under a second.','Keyboard shortcuts for every panel.','The dark ground is now the default, as it should have been.'],
      'Bug Fixes': ['Fixed a crash when a card was unplugged mid-read.','Fixed frame numbering after a skipped file.','Fixed the sort arrows pointing the wrong way.'],
      'Known Issues': ['The first launch on macOS 13 asks for disk access twice.','Reporting a serial with a lowercase letter in it fails; use capitals.'],
    } },
  { version: '1.4.4', build: 1440, released_on: '2024-06-26', artifact_name: 'arranger-1.4.4.dmg', size_bytes: 160301059, sha256: sha256('arranger-1.4.4.dmg'),
    description: 'A maintenance release for the library.',
    notes: {
      'Newly Added': ['A warning when a card is nearly full.'],
      'Improvements': ['Copy operations report their speed.','Sorting by capture time is now stable.'],
      'Bug Fixes': ['Fixed a memory leak in the thumbnail cache.','Fixed the month view skipping February 29.','Fixed a freeze when two cards were plugged in at once.'],
      'Known Issues': ['Firmware writes above 7.1 need Arranger 2.0.'],
    } },
  { version: '1.4.3', build: 1430, released_on: '2024-05-20', artifact_name: 'arranger-1.4.3.dmg', size_bytes: 158220144, sha256: sha256('arranger-1.4.3.dmg'),
    description: 'The release that made the library fast.',
    notes: {
      'Newly Added': ['Batch rename with a preview.','A histogram on the import screen.'],
      'Improvements': ['Imports run in parallel where the card allows.','The window remembers its size between launches.'],
      'Bug Fixes': ['Fixed the crop tool drifting one pixel.','Fixed a wrong count on the badge after a partial import.'],
      'Known Issues': ['The histogram is wrong for monochrome frames.','Leaving a card in overnight can put the machine to sleep mid-import.'],
    } },
  { version: '1.4.2', build: 1420, released_on: '2024-05-20', artifact_name: 'arranger-1.4.2.dmg', size_bytes: 157903622, sha256: sha256('arranger-1.4.2.dmg'),
    description: 'A quiet fix for a loud bug.',
    notes: {
      'Newly Added': ['A preference for the default import folder.'],
      'Improvements': ['Startup is faster on machines with many drives.'],
      'Bug Fixes': ['Fixed a data loss bug when an import was cancelled at the wrong moment.','Fixed the toolbar labels clipping in German.'],
      'Known Issues': ['The import log writes timestamps in local time; they should be UTC.'],
    } },
];

const FIRMWARE = [
  { product: 'compact', version: '7.2', build: 720, channel: 'general', min_firmware: '6.11', min_app_version: '1.4.0', released_on: '2026-02-10', size_bytes: 24_117_248 },
  { product: 'compact', version: '7.0', build: 700, channel: 'general', min_firmware: '6.11', min_app_version: '1.4.0', released_on: '2025-11-04', size_bytes: 23_984_128 },
  { product: 'compact', version: '6.11', build: 611, channel: 'general', min_firmware: null, min_app_version: '1.0.0', released_on: '2025-06-30', size_bytes: 23_552_000 },
  { product: 'flagship', version: '2.4', build: 240, channel: 'general', min_firmware: '2.0', min_app_version: '2.0.0', released_on: '2026-01-20', size_bytes: 31_004_160 },
];

const DEVICES = [
  { serial: 'VC2609PVDA7Q', product: 'compact', sku: 'VELA-CRICKET-GRAPHITE', status: 'registered', firmware_version: '7.0', firmware_reported_at: '2026-03-02T10:00:00Z', owner: 'customer@example.com', via_order: 'VE-2026-0001', method: 'order', warranty_until: '2028-09-01' },
  { serial: 'VA2609NRWB2Z', product: 'flagship', sku: 'VELA-A1-SAND', status: 'registered', firmware_version: '2.4', firmware_reported_at: '2026-03-05T09:00:00Z', owner: 'customer2@example.com', method: 'manual', warranty_until: '2028-08-01' },
  { serial: 'VA2609KTMHX4', product: 'flagship', sku: 'VELA-A1-GRAPHITE', status: 'sold', firmware_version: null, firmware_reported_at: null, owner: null, method: 'order', warranty_until: '2029-06-01' },
  { serial: 'VC2609WJ3DKT', product: 'compact', sku: 'VELA-CRICKET-YELLOW', status: 'blocked', blocked_reason: 'reported_stolen', firmware_version: null, firmware_reported_at: null, owner: null, method: null, warranty_until: null },
];

export async function seed() {
  await migrate();
  const cust = {};
  cust.c1 = await ensureCustomer('customer@example.com', 'Iris Vantaa');
  cust.c2 = await ensureCustomer('customer2@example.com', 'Rune Halden');

  const pid = {};
  for (const p of [...PRODUCTS, PROTECTION]) pid[p.handle] = await ensureProduct(p);

  // Delivery
  let zone = await one('SELECT id FROM delivery_zone WHERE code=$1', ['us-domestic']);
  if (!zone) zone = await one("INSERT INTO delivery_zone (code,country) VALUES ('us-domestic','US') RETURNING id");
  for (const m of [
    { code: 'standard', title: 'Standard', price_minor: 0, min_days: 5, max_days: 7 },
    { code: 'express', title: 'Express', price_minor: 2500, min_days: 2, max_days: 2 },
  ]) {
    await q(
      `INSERT INTO delivery_method (zone_id,code,title,price_minor,min_days,max_days)
       SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS (SELECT 1 FROM delivery_method WHERE zone_id=$1 AND code=$2)`,
      [zone.id, m.code, m.title, m.price_minor, m.min_days, m.max_days]
    );
  }

  // Releases
  for (const r of RELEASES) {
    await q(
      `INSERT INTO app_release (version,build,released_on,channel,artifact_name,size_bytes,sha256,description,notes)
       VALUES ($1,$2,$3,'general',$4,$5,$6,$7,$8)
       ON CONFLICT (version) DO NOTHING`,
      [r.version, r.build, r.released_on, r.artifact_name, r.size_bytes, r.sha256, r.description, JSON.stringify(r.notes)]
    );
  }

  // Firmware
  for (const f of FIRMWARE) {
    const art = `vela-${f.product}-firmware-${f.version}.bin`;
    await q(
      `INSERT INTO firmware (product_id,version,build,min_firmware,min_app_version,channel,size_bytes,sha256,released_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (product_id, build) DO NOTHING`,
      [pid[f.product], f.version, f.build, f.min_firmware, f.min_app_version, f.channel, f.size_bytes, sha256(art), f.released_on]
    );
  }

  // Order VE-2026-0001
  let order = await one("SELECT id FROM orders WHERE number='VE-2026-0001'");
  if (!order) {
    const v = await one("SELECT id, price_minor FROM variant WHERE sku='VELA-CRICKET-GRAPHITE'");
    order = await one(
      `INSERT INTO orders (number,customer_id,email,subtotal_minor,shipping_minor,tax_minor,total_minor,currency,status,payment_status,fulfilment_status,shipping_method,shipping_address,access_token_hash)
       VALUES ('VE-2026-0001',$1,'customer@example.com',29900,0,2990,32890,'USD','confirmed','invoiced','fulfilled','standard',$2,$3) RETURNING id`,
      [cust.c1, JSON.stringify({ name: 'Iris Vantaa', line1: '14 Slate Row', city: 'Portland', region: 'OR', postal_code: '97209', country: 'US', phone: '' }), sha256('seed-token-VE-2026-0001')]
    );
    await q(
      `INSERT INTO order_line (order_id,variant_id,title_snapshot,sku_snapshot,quantity,unit_price_minor,total_minor)
       VALUES ($1,$2,'Vela Cricket','VELA-CRICKET-GRAPHITE',1,29900,29900)`,
      [order.id, v.id]
    );
  }

  // Devices and ownership
  for (const d of DEVICES) {
    const prod = await one('SELECT id FROM product WHERE handle=$1', [d.product]);
    const varr = await one('SELECT id FROM variant WHERE sku=$1', [d.sku]);
    let dev = await one('SELECT id FROM device WHERE upper(serial)=upper($1)', [d.serial]);
    if (!dev) {
      dev = await one(
        `INSERT INTO device (serial,product_id,variant_id,status,blocked_reason,firmware_version,firmware_reported_at,nickname,warranty_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [d.serial, prod.id, varr.id, d.status, d.blocked_reason || null, d.firmware_version, d.firmware_reported_at || null, null, d.warranty_until || null]
      );
    }
    if (d.via_order) {
      const o = await one('SELECT id FROM orders WHERE number=$1', [d.via_order]);
      if (o) await q('UPDATE device SET order_id=$1 WHERE id=$2', [o.id, dev.id]);
    }
    if (d.owner) {
      const c = await one('SELECT id FROM customer WHERE lower(email)=lower($1)', [d.owner]);
      const orderId = d.via_order ? (await one('SELECT id FROM orders WHERE number=$1', [d.via_order]))?.id ?? null : null;
      await q(
        `INSERT INTO device_ownership (device_id,customer_id,order_id,method)
         SELECT $1,$2,$3,$4 WHERE NOT EXISTS (SELECT 1 FROM device_ownership WHERE device_id=$1 AND released_at IS NULL)`,
        [dev.id, c.id, orderId, d.method]
      );
    }
  }

  // Set the order number sequence past the seeded order.
  await q(`SELECT setval('order_number_seq', GREATEST((SELECT COALESCE(MAX((regexp_replace(number, '^VE-[0-9]{4}-', ''))::int),0) FROM orders WHERE number ~ '^VE-[0-9]{4}-[0-9]{4}$'), 1))`);

  // App version seen marker for the seeded customers.
  for (const id of [cust.c1, cust.c2]) {
    await q(
      `INSERT INTO customer_app_seen (customer_id, build) VALUES ($1, 1430)
       ON CONFLICT (customer_id) DO NOTHING`,
      [id]
    );
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith('seed.js');
if (isMain) {
  seed()
    .then(() => { console.log(JSON.stringify({ event: 'seed', status: 'ok' })); return import('./db/index.js').then(m => m.pool.end()); })
    .then(() => process.exit(0))
    .catch((e) => { console.error(JSON.stringify({ event: 'seed', status: 'error', error: String(e) })); process.exit(1); });
}
