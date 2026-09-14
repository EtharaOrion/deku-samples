import { query, one, withTransaction } from '../src/lib/db.js';
import { hashPassword } from '../src/lib/ids.js';

const SEED_PASSWORD = 'deku-demo-pw-2026';

export async function seed() {
  await ensureSchema();
  await seedCustomers();
  await seedProducts();
  await seedOrder();
  await seedDevices();
  await seedReleases();
  await seedFirmware();
}

async function ensureSchema() {
  const fs = await import('node:fs/promises');
  const sql = await fs.readFile(new URL('../src/lib/schema.sql', import.meta.url), 'utf8');
  await query(sql);
}

async function seedCustomers() {
  const hash = hashPassword(SEED_PASSWORD);
  for (const [email, name] of [
    ['customer@example.com', 'Iris Vantaa'],
    ['customer2@example.com', 'Rune Halden'],
  ]) {
    await query(
      `INSERT INTO customer (email, name, password_hash)
       VALUES ($1,$2,$3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`,
      [email, name, hash]
    );
  }
}

async function seedProducts() {
  const products = [
    {
      handle: 'flagship', title: 'Vela A1', subtitle: 'The full frame workshop camera.',
      kind: 'camera', status: 'active', support_until: '2032-06-01', position: 1,
      variants: [
        { sku: 'VELA-A1-GRAPHITE', title: 'Graphite', option_value: 'Graphite', price_minor: 89900, available: 4 },
        { sku: 'VELA-A1-SAND', title: 'Sand', option_value: 'Sand', price_minor: 89900, available: 6 },
        { sku: 'VELA-A1-YELLOW', title: 'Yellow', option_value: 'Yellow', price_minor: 89900, available: 1 },
      ],
      blocks: [
        { kind: 'lede', position: 1, payload: { text: 'The Vela A1 is the camera we wanted on our own bench. A full frame sensor, a body milled from one billet, and nothing on it that does not help you take the picture.' } },
        { kind: 'spec_group', position: 2, payload: { heading: 'Body', rows: [['Sensor', 'Full frame, 24 megapixels'], ['Weight', '612 g'], ['Body', 'Milled aluminium, one billet'], ['Mount', 'Vela K']] } },
        { kind: 'spec_group', position: 3, payload: { heading: 'Recording', rows: [['Video', '5.7K at 30 fps'], ['Bit depth', '12 bit'], ['Codec', 'Vela RAW']] } },
        { kind: 'in_the_box', position: 4, payload: { items: ['Vela A1 body', 'Body cap', 'Strap lugs', 'USB-C cable, 1 m', 'Warranty card'] } },
        { kind: 'compatibility', position: 5, payload: { os: 'macOS 13.0 or later', app: 'Arranger 2.0.0' } },
      ],
    },
    {
      handle: 'compact', title: 'Vela Cricket', subtitle: 'The small one that goes everywhere.',
      kind: 'camera', status: 'active', support_until: null, position: 2,
      variants: [
        { sku: 'VELA-CRICKET-GRAPHITE', title: 'Graphite', option_value: 'Graphite', price_minor: 29900, available: 12 },
        { sku: 'VELA-CRICKET-YELLOW', title: 'Yellow', option_value: 'Yellow', price_minor: 29900, available: 0 },
      ],
      blocks: [
        { kind: 'lede', position: 1, payload: { text: 'Vela Cricket is a small camera with the same colour science as the A1. It fits in a coat pocket and it does not ask for attention.' } },
        { kind: 'spec_group', position: 2, payload: { heading: 'Body', rows: [['Sensor', 'Super 35, 18 megapixels'], ['Weight', '341 g'], ['Body', 'Milled aluminium'], ['Mount', 'Vela K']] } },
        { kind: 'spec_group', position: 3, payload: { heading: 'Recording', rows: [['Video', '4K at 60 fps'], ['Bit depth', '10 bit'], ['Codec', 'Vela RAW Lite']] } },
        { kind: 'in_the_box', position: 4, payload: { items: ['Vela Cricket body', 'Body cap', 'USB-C cable, 1 m', 'Warranty card'] } },
        { kind: 'compatibility', position: 5, payload: { os: 'macOS 13.0 or later', app: 'Arranger 1.4.0' } },
      ],
    },
    {
      handle: 'mount', title: 'Monitor Mount', subtitle: 'A clamp and a VESA plate for the bench.',
      kind: 'accessory', status: 'discontinued', support_until: '2029-09-01', position: 3,
      variants: [
        { sku: 'VELA-MOUNT-CLAMP', title: 'Clamp', option_value: 'Clamp', price_minor: 4900, available: 0 },
        { sku: 'VELA-MOUNT-VESA', title: 'VESA', option_value: 'VESA', price_minor: 4900, available: 0 },
      ],
      blocks: [
        { kind: 'lede', position: 1, payload: { text: 'A mount for a bench monitor, made while we still made it.' } },
        { kind: 'support_note', position: 2, payload: { until: '2029-09-01' } },
      ],
    },
    {
      handle: 'case', title: 'Travel Case', subtitle: 'Cut foam, a hard shell, room for two.',
      kind: 'accessory', status: 'active', support_until: null, position: 4,
      variants: [{ sku: 'VELA-CASE-STD', title: 'Standard', option_value: 'Standard', price_minor: 7900, available: 15 }],
      blocks: [
        { kind: 'lede', position: 1, payload: { text: 'A hard case with cut foam for a body, two lenses and a cable. It goes in the hold and it comes back.' } },
        { kind: 'spec_group', position: 2, payload: { heading: 'Size', rows: [['Outside', '340 x 250 x 140 mm'], ['Inside', '310 x 220 x 110 mm'], ['Weight', '1.4 kg empty']] } },
        { kind: 'in_the_box', position: 3, payload: { items: ['Travel Case', 'Foam set', 'Shoulder strap'] } },
        { kind: 'compatibility', position: 4, payload: { os: null, app: null } },
      ],
    },
    {
      handle: 'cable', title: 'Replacement Cable', subtitle: 'USB-C to USB-C, one or two metres.',
      kind: 'spare', status: 'active', support_until: null, position: 5,
      variants: [
        { sku: 'VELA-CABLE-1M', title: '1 m', option_value: '1 m', price_minor: 1900, available: 30 },
        { sku: 'VELA-CABLE-2M', title: '2 m', option_value: '2 m', price_minor: 2400, available: 30 },
      ],
      blocks: [
        { kind: 'lede', position: 1, payload: { text: 'The same cable that ships in the box. braided, with a right angle on the camera end.' } },
        { kind: 'compatibility', position: 2, payload: { os: null, app: null } },
      ],
    },
    {
      handle: 'protection', title: 'Shipment protection', subtitle: '', kind: 'protection', status: 'active',
      support_until: null, position: 99,
      variants: [
        { sku: 'VELA-PROTECT-1', title: 'Up to $99.99', option_value: 'Standard', price_minor: 98, available: 9999 },
        { sku: 'VELA-PROTECT-2', title: '$100 to $499.99', option_value: 'Standard', price_minor: 298, available: 9999 },
        { sku: 'VELA-PROTECT-3', title: '$500 to $999.99', option_value: 'Standard', price_minor: 598, available: 9999 },
        { sku: 'VELA-PROTECT-4', title: '$1000 and above', option_value: 'Standard', price_minor: 1198, available: 9999 },
      ],
    },
  ];

  for (const p of products) {
    const row = await query(
      `INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (handle) DO UPDATE SET title=EXCLUDED.title, subtitle=EXCLUDED.subtitle,
         kind=EXCLUDED.kind, status=EXCLUDED.status, support_until=EXCLUDED.support_until,
         position=EXCLUDED.position
       RETURNING id`,
      [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position]
    );
    const productId = row.rows[0].id;
    for (const [i, v] of p.variants.entries()) {
      const vr = await query(
        `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
         VALUES ($1,$2,$3,$4,$5,'usd',$6,$7)
         ON CONFLICT (sku) DO UPDATE SET title=EXCLUDED.title, option_value=EXCLUDED.option_value,
           price_minor=EXCLUDED.price_minor, position=EXCLUDED.position, product_id=EXCLUDED.product_id
         RETURNING id`,
        [productId, v.sku, v.title, v.option_value, v.price_minor, i + 1, 'deny']
      );
      const variantId = vr.rows[0].id;
      await query(
        `INSERT INTO inventory_level (variant_id, available, committed) VALUES ($1,$2,0)
         ON CONFLICT (variant_id) DO UPDATE SET available = EXCLUDED.available WHERE inventory_level.committed = 0`,
        [variantId, v.available]
      );
    }
    for (const b of p.blocks || []) {
      const exists = await one(
        `SELECT id FROM product_block WHERE product_id=$1 AND kind=$2 AND position=$3`,
        [productId, b.kind, b.position]
      );
      if (!exists) {
        await query(
          `INSERT INTO product_block (product_id, kind, position, payload) VALUES ($1,$2,$3,$4)`,
          [productId, b.kind, b.position, JSON.stringify(b.payload)]
        );
      }
    }
  }
}

async function seedOrder() {
  const customer = await one(`SELECT id FROM customer WHERE email = 'customer@example.com'`);
  const variant = await one(
    `SELECT v.*, p.id AS product_id, p.title AS product_title
     FROM variant v JOIN product p ON p.id = v.product_id
     WHERE v.sku = 'VELA-CRICKET-GRAPHITE'`
  );
  const existing = await one(`SELECT id FROM "order" WHERE number = 'VE-2026-0001'`);
  if (existing) return;
  const subtotal = 29900, tax = 2990, total = 32890;
  const r = await query(
    `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, total_minor,
      currency, status, payment_status, fulfilment_status, shipping_method, shipping_address, placed_at)
     VALUES ('VE-2026-0001',$1,'customer@example.com',$2,0,$3,$4,'usd','confirmed','unpaid','fulfilled','Standard',$5, now())
     ON CONFLICT (number) DO NOTHING RETURNING *`,
    [customer.id, subtotal, tax, total, JSON.stringify({
      name: 'Iris Vantaa', line1: '18 Foundry Row', line2: '', city: 'Portland',
      region: 'OR', postal_code: '97209', country: 'US', phone: '',
    })]
  );
  if (!r.rows[0]) return;
  const order = r.rows[0];
  await query(
    `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
     VALUES ($1,$2,'Vela Cricket','VELA-CRICKET-GRAPHITE',1,29900,29900)`,
    [order.id, variant.id]
  );
}

async function seedDevices() {
  const devices = [
    { serial: 'VC2609PVDA7Q', handle: 'compact', sku: 'VELA-CRICKET-GRAPHITE', status: 'registered', owner: 'customer@example.com', order: 'VE-2026-0001', firmware: '7.0', reported: true, warranty: '2028-06-01', nickname: null },
    { serial: 'VA2609NRWB2Z', handle: 'flagship', sku: 'VELA-A1-SAND', status: 'registered', owner: 'customer2@example.com', order: null, firmware: '2.4', reported: true, warranty: '2028-06-01', nickname: null },
    { serial: 'VA2609KTMHX4', handle: 'flagship', sku: 'VELA-A1-GRAPHITE', status: 'sold', owner: null, order: null, firmware: null, reported: false, warranty: null, nickname: null },
    { serial: 'VC2609WJ3DKT', handle: 'compact', sku: 'VELA-CRICKET-YELLOW', status: 'blocked', owner: null, order: null, firmware: null, reported: false, warranty: null, nickname: null, blocked_reason: 'reported_stolen' },
  ];
  for (const d of devices) {
    const variant = await one(
      `SELECT v.*, p.id AS product_id FROM variant v JOIN product p ON p.id = v.product_id WHERE v.sku = $1 AND p.handle = $2`,
      [d.sku, d.handle]
    );
    const order = d.order ? await one(`SELECT id FROM "order" WHERE number = $1`, [d.order]) : null;
    const owner = d.owner ? await one(`SELECT id FROM customer WHERE email = $1`, [d.owner]) : null;
    const r = await query(
      `INSERT INTO device (serial, product_id, variant_id, status, blocked_reason, firmware_version,
        firmware_reported_at, nickname, order_id, warranty_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (serial) DO UPDATE SET status=EXCLUDED.status, blocked_reason=EXCLUDED.blocked_reason,
         firmware_version=EXCLUDED.firmware_version, nickname=EXCLUDED.nickname,
         order_id=EXCLUDED.order_id, warranty_until=EXCLUDED.warranty_until
       RETURNING id`,
      [d.serial, variant.product_id, variant.id, d.status, d.blocked_reason || null, d.firmware,
       d.reported ? new Date() : null, d.nickname, order ? order.id : null, d.warranty]
    );
    const deviceId = r.rows[0].id;
    if (d.owner && !await one(`SELECT id FROM device_ownership WHERE device_id=$1 AND customer_id=$2 AND released_at IS NULL`, [deviceId, owner.id])) {
      await query(
        `INSERT INTO device_ownership (device_id, customer_id, order_id, method, claimed_at)
         VALUES ($1,$2,$3,'order', now()) ON CONFLICT DO NOTHING`,
        [deviceId, owner.id, order ? order.id : null]
      );
    }
    if (!d.owner) {
      await query(`UPDATE device_ownership SET released_at = now() WHERE device_id=$1 AND released_at IS NULL`, [deviceId]);
    }
  }
}

async function seedReleases() {
  // Sizes and digests are read from the artifacts this app actually serves,
  // except 2.0.0 whose digest is fixed by the brief.
  const files = await readArtifactDigests();
  const releases = [
    {
      version: '2.0.0', build: 2000, released_on: '2024-12-11', artifact: 'arranger-2.0.0.dmg', size: 154876459,
      sha256: '9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2',
      description: 'Arranger 2.0 is a new edition of the library.',
      notes: [
        { group: 'Newly Added', items: ['A new library view that keeps every camera on one page.', 'Firmware updates now run without leaving the library.'] },
        { group: 'Improvements', items: ['Opening a camera with two thousand files takes a third of the time it did.'] },
        { group: 'Bug Fixes', items: ['Renaming a camera in two windows at once no longer forgets one of them.'] },
        { group: 'Known Issues', items: ['On some MacBook Air models the fan runs during a long import.'] },
      ],
    },
    {
      version: '1.4.4', build: 1440, released_on: '2024-06-26', artifact: 'arranger-1.4.4.dmg', size: 160301059,
      sha256: files['arranger-1.4.4.dmg'].sha256,
      description: 'A fix for an import that stopped early.',
      notes: [
        { group: 'Bug Fixes', items: ['An import from a Cricket stopped early when a file name carried a comma.'] },
        { group: 'Known Issues', items: ['The map view does not show a pin for a file with no location.'] },
      ],
    },
    {
      version: '1.4.3', build: 1430, released_on: '2024-05-20', artifact: 'arranger-1.4.3.dmg', size: 158220144,
      sha256: files['arranger-1.4.3.dmg'].sha256,
      description: 'Colour profiles for the Cricket.',
      notes: [
        { group: 'Newly Added', items: ['Colour profiles for Vela Cricket.', 'A written record of which firmware a camera had when it was imported.'] },
        { group: 'Improvements', items: ['The import list no longer jumps when a long name wraps.'] },
        { group: 'Bug Fixes', items: ['The window no longer forgets its size after a restart.'] },
      ],
    },
    {
      version: '1.4.2', build: 1420, released_on: '2024-05-20', artifact: 'arranger-1.4.2.dmg', size: 157903622,
      sha256: files['arranger-1.4.2.dmg'].sha256,
      description: 'A repair for a crash on import.',
      notes: [
        { group: 'Bug Fixes', items: ['Arranger no longer stops when it meets a file it cannot read.'] },
        { group: 'Known Issues', items: ['A Cricket on firmware before 6.11 reports its battery as unknown.'] },
      ],
    },
  ];
  for (const r of releases) {
    await query(
      `INSERT INTO app_release (version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes)
       VALUES ($1,$2,$3,'general',$4,$5,$6,$7,$8)
       ON CONFLICT (version) DO UPDATE SET build=EXCLUDED.build, released_on=EXCLUDED.released_on,
         artifact_name=EXCLUDED.artifact_name, size_bytes=EXCLUDED.size_bytes, sha256=EXCLUDED.sha256,
         description=EXCLUDED.description, notes=EXCLUDED.notes`,
      [r.version, r.build, r.released_on, r.artifact, r.size, r.sha256, r.description, JSON.stringify(r.notes)]
    );
  }
}

async function seedFirmware() {
  const products = await query(`SELECT id, handle FROM product`);
  const byHandle = Object.fromEntries(products.rows.map((p) => [p.handle, p.id]));
  const files = await readArtifactDigests();
  const firmware = [
    { handle: 'compact', version: '7.2', build: 720, channel: 'general', min_firmware: '6.11', min_app: '1.4.0', artifact: 'vela-cricket-7.2.fw' },
    { handle: 'compact', version: '7.0', build: 700, channel: 'general', min_firmware: '6.11', min_app: '1.4.0', artifact: 'vela-cricket-7.0.fw' },
    { handle: 'compact', version: '6.11', build: 611, channel: 'general', min_firmware: null, min_app: '1.0.0', artifact: 'vela-cricket-6.11.fw' },
    { handle: 'flagship', version: '2.4', build: 240, channel: 'general', min_firmware: '2.0', min_app: '2.0.0', artifact: 'vela-a1-2.4.fw' },
  ];
  for (const f of firmware) {
    const info = files[f.artifact];
    await query(
      `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on, artifact_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (product_id, build) DO UPDATE SET version=EXCLUDED.version, min_firmware=EXCLUDED.min_firmware,
         min_app_version=EXCLUDED.min_app_version, channel=EXCLUDED.channel, size_bytes=EXCLUDED.size_bytes,
         sha256=EXCLUDED.sha256, released_on=EXCLUDED.released_on, artifact_name=EXCLUDED.artifact_name`,
      [byHandle[f.handle], f.version, f.build, f.min_firmware, f.min_app, f.channel,
       info.size, info.sha256, '2026-01-15', f.artifact]
    );
  }
}

/** Reads the true size and digest of every artifact the app serves. */
async function readArtifactDigests() {
  const { createHash } = await import('node:crypto');
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { resolve, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const HERE = fileURLToPath(import.meta.url);
  const APP_ROOT = resolve(HERE, '..', '..');
  const dir = process.env.ARTIFACT_DIR
    ? resolve(process.env.ARTIFACT_DIR)
    : join(APP_ROOT, '.downloads-cache');
  const out = {};
  try {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      out[name] = {
        size: statSync(full).size,
        sha256: createHash('sha256').update(readFileSync(full)).digest('hex'),
      };
    }
  } catch {
    // No artifacts present; callers fall back to their fixed sizes.
  }
  return out;
}

async function main() {
  await seed();
  console.log(JSON.stringify({ level: 'info', msg: 'seed complete' }));
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(JSON.stringify({ level: 'error', msg: 'seed failed', error: String(err) }));
    process.exit(1);
  });
}
