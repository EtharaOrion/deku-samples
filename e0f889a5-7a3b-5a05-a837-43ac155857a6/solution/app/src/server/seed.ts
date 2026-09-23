import { hashPassword } from "./auth";
import { pool, transaction, type Tx } from "./db";
import { SCHEMA } from "./schema";
import { NOTE_GROUPS } from "../components/lib/types";

export const SEEDED_PASSWORD = "deku-demo-pw-2026";

type VariantSeed = {
  sku: string;
  title: string;
  option: string;
  priceMinor: number;
  available: number;
  position: number;
};

type ProductSeed = {
  handle: string;
  title: string;
  subtitle: string;
  kind: "camera" | "accessory" | "spare" | "protection";
  status: "active" | "discontinued";
  supportUntil: string | null;
  position: number;
  variants: VariantSeed[];
  blocks: { kind: string; position: number; payload: unknown }[];
};

type NoteSeed = {
  added?: string[];
  improvements?: string[];
  fixes?: string[];
  known?: string[];
};

function releaseNotes(input: NoteSeed): Record<string, string[]> {
  const values = [
    input.added ?? [],
    input.improvements ?? [],
    input.fixes ?? [],
    input.known ?? [],
  ];
  return Object.fromEntries(
    NOTE_GROUPS.flatMap((group, index) =>
      values[index]?.length ? [[group, values[index]]] : [],
    ),
  );
}

const CATALOGUE: ProductSeed[] = [
  {
    handle: "flagship",
    title: "Vela A1",
    subtitle: "The full frame camera for the desk you already have.",
    kind: "camera",
    status: "active",
    supportUntil: "2032-06-01",
    position: 1,
    variants: [
      { sku: "VELA-A1-GRAPHITE", title: "Vela A1 Graphite", option: "Graphite", priceMinor: 89900, available: 4, position: 1 },
      { sku: "VELA-A1-SAND", title: "Vela A1 Sand", option: "Sand", priceMinor: 89900, available: 6, position: 2 },
      { sku: "VELA-A1-YELLOW", title: "Vela A1 Yellow", option: "Yellow", priceMinor: 89900, available: 1, position: 3 },
    ],
    blocks: [
      {
        kind: "lede",
        position: 1,
        payload: {
          text: "The A1 is the camera we built for ourselves first. A full frame sensor, a fixed 28mm lens and a body milled from one billet, so there is nothing inside it to work loose. It sits on the monitor you already own and it looks at you straight.",
        },
      },
      {
        kind: "spec_group",
        position: 2,
        payload: {
          title: "Sensor and optics",
          rows: [
            ["Sensor", "35.9 x 23.9 mm full frame"],
            ["Resolution", "4096 x 2160 at 60 fps"],
            ["Lens", "28 mm equivalent, f/1.8"],
            ["Aperture range", "f/1.8 to f/16"],
          ],
        },
      },
      {
        kind: "spec_group",
        position: 3,
        payload: {
          title: "Body",
          rows: [
            ["Material", "6061 aluminium"],
            ["Mass", "412 g"],
            ["Dimensions", "116 x 64 x 58 mm"],
            ["Connection", "USB-C, 10 Gbit/s"],
          ],
        },
      },
      {
        kind: "in_the_box",
        position: 4,
        payload: { items: ["Vela A1", "Monitor mount", "1 m USB-C cable", "Lens cap", "Printed setup card"] },
      },
      {
        kind: "compatibility",
        position: 5,
        payload: { min_os: "macOS 13.0", min_app: "2.0.0", note: "Arranger 2.0.0 or later is required to change any setting on the A1." },
      },
    ],
  },
  {
    handle: "compact",
    title: "Vela Cricket",
    subtitle: "The small one. Same colour science, half the desk.",
    kind: "camera",
    status: "active",
    supportUntil: null,
    position: 2,
    variants: [
      { sku: "VELA-CRICKET-GRAPHITE", title: "Vela Cricket Graphite", option: "Graphite", priceMinor: 29900, available: 12, position: 1 },
      { sku: "VELA-CRICKET-YELLOW", title: "Vela Cricket Yellow", option: "Yellow", priceMinor: 29900, available: 0, position: 2 },
    ],
    blocks: [
      {
        kind: "lede",
        position: 1,
        payload: {
          text: "The Cricket carries the colour science of the A1 in a body you can close your hand around. It reads the room the way the larger camera does and it asks for a third of the desk.",
        },
      },
      {
        kind: "spec_group",
        position: 2,
        payload: {
          title: "Sensor and optics",
          rows: [
            ["Sensor", "23.5 x 15.6 mm"],
            ["Resolution", "3840 x 2160 at 30 fps"],
            ["Lens", "24 mm equivalent, f/2.0"],
            ["Aperture range", "f/2.0 to f/11"],
          ],
        },
      },
      {
        kind: "spec_group",
        position: 3,
        payload: {
          title: "Body",
          rows: [
            ["Material", "6061 aluminium"],
            ["Mass", "184 g"],
            ["Dimensions", "72 x 44 x 41 mm"],
            ["Connection", "USB-C, 10 Gbit/s"],
          ],
        },
      },
      {
        kind: "in_the_box",
        position: 4,
        payload: { items: ["Vela Cricket", "Monitor mount", "1 m USB-C cable", "Printed setup card"] },
      },
      {
        kind: "compatibility",
        position: 5,
        payload: { min_os: "macOS 13.0", min_app: "1.4.0", note: "Arranger 1.4.0 or later reads the Cricket." },
      },
    ],
  },
  {
    handle: "mount",
    title: "Monitor Mount",
    subtitle: "The clamp and the plate we shipped until 2026.",
    kind: "accessory",
    status: "discontinued",
    supportUntil: "2029-09-01",
    position: 3,
    variants: [
      { sku: "VELA-MOUNT-CLAMP", title: "Monitor Mount Clamp", option: "Clamp", priceMinor: 4900, available: 0, position: 1 },
      { sku: "VELA-MOUNT-VESA", title: "Monitor Mount VESA", option: "VESA", priceMinor: 4900, available: 0, position: 2 },
    ],
    blocks: [
      {
        kind: "lede",
        position: 1,
        payload: {
          text: "Both cameras now ship with the mount in the box, so we no longer sell it on its own. The clamp fits a panel up to 22 mm and the plate fits a 75 mm or 100 mm VESA pattern.",
        },
      },
      {
        kind: "spec_group",
        position: 2,
        payload: {
          title: "Fit",
          rows: [
            ["Clamp range", "6 to 22 mm"],
            ["VESA pattern", "75 x 75 mm, 100 x 100 mm"],
            ["Thread", "1/4 inch 20 UNC"],
            ["Mass", "96 g"],
          ],
        },
      },
      { kind: "in_the_box", position: 3, payload: { items: ["Monitor mount", "Hex key"] } },
      {
        kind: "support_note",
        position: 4,
        payload: { text: "We no longer sell this. We will support it until September 1, 2029." },
      },
    ],
  },
  {
    handle: "case",
    title: "Travel Case",
    subtitle: "A hard shell sized for one camera and one cable.",
    kind: "accessory",
    status: "active",
    supportUntil: null,
    position: 4,
    variants: [
      { sku: "VELA-CASE-STD", title: "Travel Case", option: "Standard", priceMinor: 7900, available: 15, position: 1 },
    ],
    blocks: [
      {
        kind: "lede",
        position: 1,
        payload: {
          text: "A moulded shell with a cut foam insert that holds either camera, the mount and a cable. It takes the weight of a laptop bag on top of it and gives nothing back.",
        },
      },
      {
        kind: "spec_group",
        position: 2,
        payload: {
          title: "Case",
          rows: [
            ["External", "228 x 168 x 92 mm"],
            ["Internal", "206 x 148 x 74 mm"],
            ["Mass", "430 g"],
            ["Shell", "Polypropylene"],
          ],
        },
      },
      { kind: "in_the_box", position: 3, payload: { items: ["Travel case", "Cut foam insert"] } },
      { kind: "compatibility", position: 4, payload: { min_os: "Not applicable", min_app: "Not applicable", note: "Fits the Vela A1 and the Vela Cricket." } },
    ],
  },
  {
    handle: "cable",
    title: "Replacement Cable",
    subtitle: "The same braided USB-C cable that ships in the box.",
    kind: "spare",
    status: "active",
    supportUntil: null,
    position: 5,
    variants: [
      { sku: "VELA-CABLE-1M", title: "Replacement Cable 1 m", option: "1 m", priceMinor: 1900, available: 30, position: 1 },
      { sku: "VELA-CABLE-2M", title: "Replacement Cable 2 m", option: "2 m", priceMinor: 2400, available: 30, position: 2 },
    ],
    blocks: [
      {
        kind: "lede",
        position: 1,
        payload: {
          text: "Braided, 10 Gbit/s, and rated for 10000 bends. It is the cable that comes in the box, sold on its own because cables go missing.",
        },
      },
      {
        kind: "spec_group",
        position: 2,
        payload: {
          title: "Cable",
          rows: [
            ["Standard", "USB-C to USB-C"],
            ["Data rate", "10 Gbit/s"],
            ["Power", "60 W"],
            ["Bend rating", "10000 cycles"],
          ],
        },
      },
      { kind: "in_the_box", position: 3, payload: { items: ["One braided cable", "One cable tie"] } },
    ],
  },
  {
    handle: "protection",
    title: "Shipment protection",
    subtitle: "Cover against loss, theft and damage in transit.",
    kind: "protection",
    status: "active",
    supportUntil: null,
    position: 99,
    variants: [
      { sku: "VELA-PROTECT-1", title: "Shipment protection", option: "Tier 1", priceMinor: 98, available: 1000000, position: 1 },
      { sku: "VELA-PROTECT-2", title: "Shipment protection", option: "Tier 2", priceMinor: 298, available: 1000000, position: 2 },
      { sku: "VELA-PROTECT-3", title: "Shipment protection", option: "Tier 3", priceMinor: 598, available: 1000000, position: 3 },
      { sku: "VELA-PROTECT-4", title: "Shipment protection", option: "Tier 4", priceMinor: 1198, available: 1000000, position: 4 },
    ],
    blocks: [],
  },
];

const RELEASES = [
  {
    version: "2.0.0",
    build: 2000,
    released_on: "2024-12-11",
    artifact_name: "arranger-2.0.0.dmg",
    size_bytes: 154876459,
    sha256: "9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2",
    description: "The rewrite. Arranger now reads both cameras from one window.",
    notes: releaseNotes({
      added: [
        "One window that lists every camera on the machine, whichever model it is.",
        "A scene can be saved per camera and recalled from the menu bar.",
        "Firmware is offered from inside the application rather than from the website.",
      ],
      improvements: [
        "Start up is about four times quicker on a machine with two cameras attached.",
        "Colour adjustments are applied on the camera rather than on the host.",
        "The preview holds 60 fps while a recording is running.",
      ],
      fixes: [
        "A camera unplugged during a firmware read no longer leaves the window blank. VE-1184",
        "The aperture slider no longer resets when the display is changed. VE-1207",
      ],
      known: [
        "An external capture card connected at the same time can delay the first preview by a few seconds. VE-1233",
      ],
    }),
  },
  {
    version: "1.4.4",
    build: 1440,
    released_on: "2024-06-26",
    artifact_name: "arranger-1.4.4.dmg",
    size_bytes: 160301059,
    sha256: "3c71d4f0a9b25e8c61f0d7a4382be95c1d6f0a37e8b425c9d0f31a6e7c482bd5",
    description: "The last release of the 1.4 line.",
    notes: releaseNotes({
      added: ["A menu bar item that reports which camera is live."],
      improvements: [
        "Firmware downloads resume after a dropped connection.",
        "The preview window remembers its position between launches.",
      ],
      fixes: [
        "Recovered from a stall when two cameras shared one hub. VE-1102",
        "The exposure lock no longer releases when the lid is closed. VE-1118",
      ],
    }),
  },
  {
    version: "1.4.3",
    build: 1430,
    released_on: "2024-05-20",
    artifact_name: "arranger-1.4.3.dmg",
    size_bytes: 158220144,
    sha256: "a1c7e5920d3f84b6712c0ae54d93f6b8072ce41d95a6b3820f7d1c4e6a09b783",
    description: "A maintenance release for the Cricket.",
    notes: releaseNotes({
      added: ["A per camera nickname that appears in the window title."],
      improvements: ["Cricket firmware writes complete about twenty seconds quicker."],
      fixes: [
        "A Cricket on firmware 6.11 is now offered the 7.0 image. VE-1074",
        "The white balance picker no longer drifts after a sleep. VE-1081",
      ],
      known: ["A Cricket behind an unpowered hub can report the wrong serial. VE-1090"],
    }),
  },
  {
    version: "1.4.2",
    build: 1420,
    released_on: "2024-05-20",
    artifact_name: "arranger-1.4.2.dmg",
    size_bytes: 157903622,
    sha256: "5e0b9a37c26d148f0b3a7e92c5d804f1a63e8b70d295c4f18ae0632b9d7c1450",
    description: "A same day fix for the 1.4.1 preview stall.",
    notes: releaseNotes({
      improvements: ["The preview recovers on its own after a display is unplugged."],
      fixes: ["The preview no longer stalls when the machine wakes from sleep. VE-1066"],
    }),
  },
];

const FIRMWARE = [
  { handle: "compact", version: "7.2", build: 720, min_firmware: "6.11", min_app_version: "1.4.0", channel: "general", size_bytes: 18446200, sha256: "c0a7f1e4d98b2653f4a1c8d70e2b9463a5f8c1d20e7b34a6f9c8d1e0b2a34567", released_on: "2024-11-04" },
  { handle: "compact", version: "7.0", build: 700, min_firmware: "6.11", min_app_version: "1.4.0", channel: "general", size_bytes: 18310442, sha256: "7b2d5c8e1f0a49b36d2e7c40a8f1b95d3e6c0a27b4d9f18e5c3a0b7d2e9f4061", released_on: "2024-05-02" },
  { handle: "compact", version: "6.11", build: 611, min_firmware: null, min_app_version: "1.0.0", channel: "general", size_bytes: 17984120, sha256: "2f6a0d91c4e8b3705a1d6f28c9b0e473d5a2c8f10b6e94d3a7c0f1b8e25d6039", released_on: "2023-11-15" },
  { handle: "flagship", version: "2.4", build: 240, min_firmware: "2.0", min_app_version: "2.0.0", channel: "general", size_bytes: 24117248, sha256: "8d3c1b60f9a247e5c0b8d1a36f4e92b70c5a8d13e6f0b294a7c1d8e30b5a2671", released_on: "2024-12-01" },
];

const DEVICES = [
  { serial: "VC2609PVDA7Q", handle: "compact", sku: "VELA-CRICKET-GRAPHITE", status: "registered", owner: "customer@example.com", firmware: "7.0", order_number: "VE-2026-0001", warranty_until: "2028-02-11", blocked_reason: null as string | null, nickname: "Desk camera" },
  { serial: "VA2609NRWB2Z", handle: "flagship", sku: "VELA-A1-SAND", status: "registered", owner: "customer2@example.com", firmware: "2.4", order_number: null, warranty_until: "2028-04-02", blocked_reason: null as string | null, nickname: null as string | null },
  { serial: "VA2609KTMHX4", handle: "flagship", sku: "VELA-A1-GRAPHITE", status: "sold", owner: null, firmware: null as string | null, order_number: null, warranty_until: "2028-06-30", blocked_reason: null as string | null, nickname: null as string | null },
  { serial: "VC2609WJ3DKT", handle: "compact", sku: "VELA-CRICKET-YELLOW", status: "blocked", owner: null, firmware: null as string | null, order_number: null, warranty_until: null as string | null, blocked_reason: "reported_stolen", nickname: null as string | null },
];

async function idOf(tx: Tx, sql: string, params: unknown[]): Promise<number | null> {
  const row = await tx.one<{ id: number }>(sql, params);
  return row ? Number(row.id) : null;
}

async function seedCatalogue(tx: Tx): Promise<void> {
  for (const product of CATALOGUE) {
    await tx.query(
      `INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (handle) DO UPDATE SET
         title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, kind = EXCLUDED.kind,
         status = EXCLUDED.status, support_until = EXCLUDED.support_until,
         position = EXCLUDED.position`,
      [product.handle, product.title, product.subtitle, product.kind, product.status, product.supportUntil, product.position],
    );
    const productId = await idOf(tx, "SELECT id FROM product WHERE handle = $1", [product.handle]);
    if (productId === null) continue;

    for (const variant of product.variants) {
      await tx.query(
        `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
         VALUES ($1,$2,$3,$4,$5,'usd',$6,$7)
         ON CONFLICT (sku) DO UPDATE SET
           product_id = EXCLUDED.product_id, title = EXCLUDED.title,
           option_value = EXCLUDED.option_value, price_minor = EXCLUDED.price_minor,
           position = EXCLUDED.position`,
        [productId, variant.sku, variant.title, variant.option, variant.priceMinor, variant.position, product.kind === "protection" ? "continue" : "deny"],
      );
      const variantId = await idOf(tx, "SELECT id FROM variant WHERE sku = $1", [variant.sku]);
      // Stock is live state, so a restart leaves whatever the store already holds.
      await tx.query(
        `INSERT INTO inventory_level (variant_id, available, committed) VALUES ($1,$2,0)
         ON CONFLICT (variant_id) DO NOTHING`,
        [variantId, variant.available],
      );
    }

    for (const block of product.blocks) {
      await tx.query(
        `INSERT INTO product_block (product_id, kind, position, payload)
         VALUES ($1,$2,$3,$4::jsonb)
         ON CONFLICT (product_id, kind, position) DO UPDATE SET payload = EXCLUDED.payload`,
        [productId, block.kind, block.position, JSON.stringify(block.payload)],
      );
    }
  }
}

async function seedCustomers(tx: Tx): Promise<void> {
  const people = [
    { email: "customer@example.com", name: "Iris Vantaa" },
    { email: "customer2@example.com", name: "Rune Halden" },
  ];
  for (const person of people) {
    const existing = await tx.one("SELECT id FROM customer WHERE lower(email) = lower($1)", [person.email]);
    if (existing) continue;
    const passwordHash = await hashPassword(SEEDED_PASSWORD);
    await tx.query(
      `INSERT INTO customer (email, name, password_hash, status) VALUES ($1,$2,$3,'active')
       ON CONFLICT DO NOTHING`,
      [person.email, person.name, passwordHash],
    );
  }
}

async function seedOrder(tx: Tx): Promise<void> {
  const existing = await tx.one("SELECT id FROM \"order\" WHERE number = $1", ["VE-2026-0001"]);
  if (existing) return;

  const customer = await tx.one<{ id: number }>(
    "SELECT id FROM customer WHERE lower(email) = lower($1)",
    ["customer@example.com"],
  );
  const variant = await tx.one<{ id: number; title: string; option_value: string }>(
    "SELECT id, title, option_value FROM variant WHERE sku = $1",
    ["VELA-CRICKET-GRAPHITE"],
  );
  if (!customer || !variant) return;

  const order = await tx.one<{ id: number }>(
    `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor,
                          discount_minor, total_minor, currency, status, payment_status,
                          fulfilment_status, shipping_method, shipping_address,
                          killbill_external_key, killbill_invoice_amount, placed_at)
     VALUES ($1,$2,$3,29900,0,2990,0,32890,'usd','confirmed','invoiced','fulfilled','Standard',
             $4::jsonb,$3,'328.90', timestamptz '2026-02-11 09:20:00+00')
     ON CONFLICT (number) DO NOTHING
     RETURNING id`,
    [
      "VE-2026-0001",
      customer.id,
      "customer@example.com",
      JSON.stringify({
        name: "Iris Vantaa",
        line1: "18 Harbour Row",
        line2: "",
        city: "Portland",
        region: "OR",
        postal_code: "97205",
        country: "US",
      }),
    ],
  );
  if (!order) return;

  await tx.query(
    `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, option_snapshot,
                             quantity, unit_price_minor, total_minor, taxable, position)
     VALUES ($1,$2,'Vela Cricket','VELA-CRICKET-GRAPHITE','Graphite',1,29900,29900,true,1)`,
    [order.id, variant.id],
  );
}

async function seedDevices(tx: Tx): Promise<void> {
  for (const device of DEVICES) {
    const existing = await tx.one("SELECT id FROM device WHERE upper(serial) = upper($1)", [device.serial]);
    if (existing) continue;

    const productId = await idOf(tx, "SELECT id FROM product WHERE handle = $1", [device.handle]);
    const variantId = await idOf(tx, "SELECT id FROM variant WHERE sku = $1", [device.sku]);
    const orderId = device.order_number
      ? await idOf(tx, 'SELECT id FROM "order" WHERE number = $1', [device.order_number])
      : null;

    const row = await tx.one<{ id: number }>(
      `INSERT INTO device (serial, product_id, variant_id, status, blocked_reason, firmware_version,
                           firmware_reported_at, nickname, order_id, warranty_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        device.serial,
        productId,
        variantId,
        device.status,
        device.blocked_reason,
        device.firmware,
        device.firmware ? new Date("2026-02-14T10:00:00Z") : null,
        device.nickname,
        orderId,
        device.warranty_until,
      ],
    );
    if (!row) continue;

    if (device.owner) {
      const customerId = await idOf(tx, "SELECT id FROM customer WHERE lower(email) = lower($1)", [device.owner]);
      await tx.query(
        `INSERT INTO device_ownership (device_id, customer_id, order_id, claimed_at, method)
         VALUES ($1,$2,$3, timestamptz '2026-02-14 10:00:00+00', $4)
         ON CONFLICT DO NOTHING`,
        [row.id, customerId, orderId, orderId ? "order" : "manual"],
      );
    }
  }
}

async function seedReleases(tx: Tx): Promise<void> {
  for (const release of RELEASES) {
    await tx.query(
      `INSERT INTO app_release (version, build, released_on, channel, artifact_name, size_bytes,
                                sha256, description, notes)
       VALUES ($1,$2,$3,'general',$4,$5,$6,$7,$8::jsonb)
       ON CONFLICT (version) DO UPDATE SET
         build = EXCLUDED.build, released_on = EXCLUDED.released_on,
         artifact_name = EXCLUDED.artifact_name, size_bytes = EXCLUDED.size_bytes,
         sha256 = EXCLUDED.sha256, description = EXCLUDED.description, notes = EXCLUDED.notes`,
      [release.version, release.build, release.released_on, release.artifact_name, release.size_bytes, release.sha256, release.description, JSON.stringify(release.notes)],
    );
  }
}

async function seedFirmware(tx: Tx): Promise<void> {
  for (const image of FIRMWARE) {
    const productId = await idOf(tx, "SELECT id FROM product WHERE handle = $1", [image.handle]);
    if (productId === null) continue;
    await tx.query(
      `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel,
                             size_bytes, sha256, released_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (product_id, build) DO UPDATE SET
         version = EXCLUDED.version, min_firmware = EXCLUDED.min_firmware,
         min_app_version = EXCLUDED.min_app_version, channel = EXCLUDED.channel,
         size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256,
         released_on = EXCLUDED.released_on`,
      [productId, image.version, image.build, image.min_firmware, image.min_app_version, image.channel, image.size_bytes, image.sha256, image.released_on],
    );
  }
}

/** Rune Halden's cart holds one Travel Case added when it cost $74.00. The
 *  price has since moved to $79.00, so every read of that cart states the change
 *  as a notice rather than applying it silently. The cart is seeded once: a
 *  customer who already holds any cart, open or ordered, is left alone. */
async function seedCart(tx: Tx): Promise<void> {
  const customerId = await idOf(tx, "SELECT id FROM customer WHERE lower(email) = lower($1)", [
    "customer2@example.com",
  ]);
  const variantId = await idOf(tx, "SELECT id FROM variant WHERE sku = $1", ["VELA-CASE-STD"]);
  if (customerId === null || variantId === null) return;
  const held = await tx.one("SELECT id FROM cart WHERE customer_id = $1 LIMIT 1", [customerId]);
  if (held) return;

  const cart = await tx.one<{ id: number }>(
    `INSERT INTO cart (token, customer_id, expires_at)
     VALUES (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), $1,
             now() + interval '3650 days')
     RETURNING id`,
    [customerId],
  );
  if (!cart) return;
  await tx.query(
    `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor)
     VALUES ($1,$2,1,7400)
     ON CONFLICT (cart_id, variant_id) DO NOTHING`,
    [cart.id, variantId],
  );
}

let readyPromise: Promise<void> | null = null;

async function migrateAndSeed(): Promise<void> {
  // One boot at a time writes the schema, so two processes cannot race it.
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [847123091]);
    try {
      await client.query(SCHEMA);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [847123091]);
    }
  } finally {
    client.release();
  }

  await transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1)", [847123092]);
    await seedCustomers(tx);
    await seedCatalogue(tx);
    await seedOrder(tx);
    await seedDevices(tx);
    await seedReleases(tx);
    await seedFirmware(tx);
    await seedCart(tx);
  });
}

/** Resolved once the schema exists and the seed has been written. Health does
 *  not answer 200 before this settles. */
export function ready(): Promise<void> {
  if (!readyPromise) {
    readyPromise = migrateAndSeed().catch((error) => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}
