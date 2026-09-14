import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/server/db.ts
import pg from "pg";
async function q(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}
async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] ?? null;
}
var Pool, pool;
var init_db = __esm({
  "src/server/db.ts"() {
    "use strict";
    ({ Pool } = pg);
    pool = global.__velaPool ?? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 12,
      idleTimeoutMillis: 3e4
    });
    pg.types.setTypeParser(1700, (v) => v === null ? null : Number(v));
    pg.types.setTypeParser(20, (v) => v === null ? null : Number(v));
    pg.types.setTypeParser(1082, (v) => v);
    if (!global.__velaPool) global.__velaPool = pool;
  }
});

// src/server/log.ts
function logEvent(event, fields = {}) {
  process.stdout.write(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), event, ...fields }) + "\n");
}
var init_log = __esm({
  "src/server/log.ts"() {
    "use strict";
  }
});

// src/server/schema.ts
var schema_exports = {};
__export(schema_exports, {
  SCHEMA_SQL: () => SCHEMA_SQL
});
var SCHEMA_SQL;
var init_schema = __esm({
  "src/server/schema.ts"() {
    "use strict";
    SCHEMA_SQL = `-- Vela storefront schema. All timestamps UTC.

CREATE TABLE IF NOT EXISTS customer (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL,
  email_folded  TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  handle        TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  subtitle      TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('camera','accessory','spare','protection')),
  status        TEXT NOT NULL CHECK (status IN ('active','discontinued')),
  support_until DATE,
  position      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS variant (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id       BIGINT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  sku              TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  option_value     TEXT NOT NULL,
  price_minor      BIGINT NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  position         INTEGER NOT NULL DEFAULT 0,
  inventory_policy TEXT NOT NULL DEFAULT 'deny' CHECK (inventory_policy IN ('deny','continue'))
);

CREATE TABLE IF NOT EXISTS inventory_level (
  variant_id BIGINT PRIMARY KEY REFERENCES variant(id) ON DELETE CASCADE,
  available  INTEGER NOT NULL DEFAULT 0 CHECK (available >= 0),
  committed  INTEGER NOT NULL DEFAULT 0 CHECK (committed >= 0)
);

CREATE TABLE IF NOT EXISTS product_block (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('lede','spec_group','in_the_box','compatibility','support_note')),
  position   INTEGER NOT NULL DEFAULT 0,
  payload    JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS cart (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,
  customer_id BIGINT REFERENCES customer(id) ON DELETE SET NULL,
  email       TEXT,
  shipping_address JSONB,
  shipping_method TEXT,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  protection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE TABLE IF NOT EXISTS cart_line (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cart_id          BIGINT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  variant_id       BIGINT NOT NULL REFERENCES variant(id) ON DELETE CASCADE,
  quantity         INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_minor BIGINT NOT NULL,
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE IF NOT EXISTS "order" (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  customer_id BIGINT REFERENCES customer(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  subtotal_minor BIGINT NOT NULL,
  shipping_minor BIGINT NOT NULL DEFAULT 0,
  tax_minor BIGINT NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','invoiced')),
  fulfilment_status TEXT NOT NULL DEFAULT 'unfulfilled' CHECK (fulfilment_status IN ('unfulfilled','fulfilled')),
  shipping_method TEXT,
  shipping_address JSONB,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  protection_minor BIGINT NOT NULL DEFAULT 0,
  discount_minor BIGINT NOT NULL DEFAULT 0,
  access_token_hash TEXT NOT NULL,
  killbill_external_key TEXT,
  killbill_invoice_amount NUMERIC(12,2),
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_line (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  variant_id BIGINT NOT NULL REFERENCES variant(id),
  title_snapshot TEXT NOT NULL,
  sku_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_minor BIGINT NOT NULL,
  total_minor BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS device (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  serial TEXT NOT NULL UNIQUE,
  serial_folded TEXT NOT NULL UNIQUE,
  product_id BIGINT NOT NULL REFERENCES product(id),
  variant_id BIGINT NOT NULL REFERENCES variant(id),
  status TEXT NOT NULL CHECK (status IN ('manufactured','sold','registered','blocked')),
  blocked_reason TEXT,
  firmware_version TEXT,
  firmware_reported_at TIMESTAMPTZ,
  nickname TEXT,
  order_id BIGINT REFERENCES "order"(id) ON DELETE SET NULL,
  warranty_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_ownership (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id BIGINT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  customer_id BIGINT REFERENCES customer(id) ON DELETE SET NULL,
  order_id BIGINT REFERENCES "order"(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  method TEXT NOT NULL CHECK (method IN ('order','manual','support'))
);

CREATE TABLE IF NOT EXISTS app_release (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  build INTEGER NOT NULL UNIQUE,
  released_on DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'general',
  artifact_name TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  description TEXT,
  notes JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS firmware (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  build INTEGER NOT NULL,
  min_firmware TEXT,
  min_app_version TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('internal','beta','general','yanked')),
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  released_on DATE NOT NULL,
  UNIQUE (product_id, build)
);

CREATE TABLE IF NOT EXISTS flash_session (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id BIGINT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  firmware_id BIGINT NOT NULL REFERENCES firmware(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'started' CHECK (state IN ('started','succeeded','failed')),
  reported_version TEXT,
  failure_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS idempotency_key (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  order_id BIGINT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Serials allocated to a camera line of an order, written at confirmation.
CREATE TABLE IF NOT EXISTS device_serial (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  order_line_id BIGINT NOT NULL REFERENCES order_line(id) ON DELETE CASCADE,
  variant_id BIGINT NOT NULL REFERENCES variant(id),
  serial TEXT NOT NULL UNIQUE
);

-- At most one live ownership row per device, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS device_ownership_live_uidx
  ON device_ownership (device_id) WHERE released_at IS NULL;

-- At most one started flash session per device, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS flash_session_started_uidx
  ON flash_session (device_id) WHERE state = 'started';

-- Order numbers are allocated in sequence: VE-<year>-<four digits>.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;
`;
  }
});

// src/server/migrate.ts
async function migrate() {
  const { SCHEMA_SQL: SCHEMA_SQL2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
  await pool.query(SCHEMA_SQL2);
  logEvent("db.migrated");
}
async function waitForDatabase(retries = 40, delayMs = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
var init_migrate = __esm({
  "src/server/migrate.ts"() {
    "use strict";
    init_db();
    init_log();
  }
});

// src/server/auth.ts
import { createHmac, timingSafeEqual, randomBytes, createHash } from "node:crypto";
async function fallbackHash(password) {
  const { pbkdf2 } = await import("node:crypto");
  const salt = randomBytes(16);
  const dk = pbkdf2(password, salt, 12e4, 32, "sha256");
  return `${FALLBACK_PREFIX}${salt.toString("hex")}$${dk.toString("hex")}`;
}
async function hashPassword(password) {
  if (argon) return argon.hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  return fallbackHash(password);
}
function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}
var argon, FALLBACK_PREFIX, TOKEN_TTL_SECONDS;
var init_auth = __esm({
  async "src/server/auth.ts"() {
    "use strict";
    argon = null;
    try {
      const mod = await import("@node-rs/argon2");
      if (typeof mod.hash === "function" && typeof mod.verify === "function") argon = mod;
    } catch {
      argon = null;
    }
    FALLBACK_PREFIX = "pbkdf2$";
    TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
  }
});

// src/server/seed-data.ts
var SEED_PASSWORD, PRODUCTS, RELEASES, FIRMWARE, DEVICES;
var init_seed_data = __esm({
  async "src/server/seed-data.ts"() {
    "use strict";
    init_db();
    await init_auth();
    init_log();
    SEED_PASSWORD = "deku-demo-pw-2026";
    PRODUCTS = [
      {
        handle: "flagship",
        title: "Vela A1",
        subtitle: "The full-frame body we reach for when the light is going.",
        kind: "camera",
        status: "active",
        support_until: "2032-06-01",
        position: 1,
        variants: [
          { sku: "VELA-A1-GRAPHITE", title: "Graphite", option_value: "Graphite", price_minor: 89900, available: 4 },
          { sku: "VELA-A1-SAND", title: "Sand", option_value: "Sand", price_minor: 89900, available: 6 },
          { sku: "VELA-A1-YELLOW", title: "Yellow", option_value: "Yellow", price_minor: 89900, available: 1 }
        ],
        blocks: [
          { kind: "lede", text: "A full-frame body with a machined top plate, a replaceable gasket in every door, and a strap lug cut from the same billet as the plate it sits in." },
          { kind: "spec_group", title: "Body", rows: [["Sensor", "36 \xD7 24 mm full frame"], ["Mount", "Vela K"], ["Weight", "742 g"], ["Body", "Machined aluminium"]] },
          { kind: "spec_group", title: "Capture", rows: [["Frames per second", "8"], ["Shutter", "Focal plane, 1/8000"], ["Buffer", "94 raw frames"]] },
          { kind: "in_the_box", items: ["Vela A1 body", "Battery", "Charger", "Strap", "Repair manual"] },
          { kind: "compatibility", min_os: "macOS 13.0", min_app: "2.0.0" }
        ]
      },
      {
        handle: "compact",
        title: "Vela Cricket",
        subtitle: "The one that lives in a coat pocket and gets used anyway.",
        kind: "camera",
        status: "active",
        position: 2,
        variants: [
          { sku: "VELA-CRICKET-GRAPHITE", title: "Graphite", option_value: "Graphite", price_minor: 29900, available: 12 },
          { sku: "VELA-CRICKET-YELLOW", title: "Yellow", option_value: "Yellow", price_minor: 29900, available: 0 }
        ],
        blocks: [
          { kind: "lede", text: "The same sensor as the A1 in a body small enough to forget. Fixed lens, replaceable battery, no menus you cannot learn in an afternoon." },
          { kind: "spec_group", title: "Body", rows: [["Sensor", "36 \xD7 24 mm full frame"], ["Lens", "35 mm f/2"], ["Weight", "398 g"], ["Body", "Machined aluminium"]] },
          { kind: "spec_group", title: "Capture", rows: [["Frames per second", "6"], ["Shutter", "Leaf, 1/2000"], ["Buffer", "48 raw frames"]] },
          { kind: "in_the_box", items: ["Cricket body", "Battery", "Charger", "Wrist strap", "Repair manual"] },
          { kind: "compatibility", min_os: "macOS 13.0", min_app: "1.4.0" }
        ]
      },
      {
        handle: "mount",
        title: "Monitor Mount",
        subtitle: "Clamps the Cricket to a desk arm or a monitor.",
        kind: "accessory",
        status: "discontinued",
        support_until: "2029-09-01",
        position: 3,
        variants: [
          { sku: "VELA-MOUNT-CLAMP", title: "Clamp", option_value: "Clamp", price_minor: 4900, available: 0 },
          { sku: "VELA-MOUNT-VESA", title: "VESA", option_value: "VESA", price_minor: 4900, available: 0 }
        ],
        blocks: [
          { kind: "lede", text: "Holds a Cricket at eye level. We no longer sell it; we still support it." },
          { kind: "spec_group", title: "Fit", rows: [["Load", "Up to 600 g"], ["Clamp range", "12 to 45 mm"], ["Weight", "184 g"]] },
          { kind: "in_the_box", items: ["Mount", "Two screws", "Hex key"] },
          { kind: "compatibility", min_os: "\u2014", min_app: "\u2014" },
          { kind: "support_note", support_until: "2029-09-01", text: "We no longer sell this. We will support it until September 1, 2029." }
        ]
      },
      {
        handle: "case",
        title: "Travel Case",
        subtitle: "A hard case for one camera, one lens and the cable.",
        kind: "accessory",
        status: "active",
        position: 4,
        variants: [{ sku: "VELA-CASE-STD", title: "Standard", option_value: "Standard", price_minor: 7900, available: 15 }],
        blocks: [
          { kind: "lede", text: "Cut foam, a pressure valve, and a hinge rated to more openings than the camera will see." },
          { kind: "spec_group", title: "Fit", rows: [["Inside", "240 \xD7 160 \xD7 90 mm"], ["Weight", "410 g"], ["Material", "Glass-filled nylon"]] },
          { kind: "in_the_box", items: ["Case", "Two foam layers"] },
          { kind: "compatibility", min_os: "\u2014", min_app: "\u2014" }
        ]
      },
      {
        handle: "cable",
        title: "Replacement Cable",
        subtitle: "The one that breaks first, sold on its own.",
        kind: "spare",
        status: "active",
        position: 5,
        variants: [
          { sku: "VELA-CABLE-1M", title: "1 m", option_value: "1 m", price_minor: 1900, available: 30 },
          { sku: "VELA-CABLE-2M", title: "2 m", option_value: "2 m", price_minor: 2400, available: 30 }
        ],
        blocks: [
          { kind: "lede", text: "USB-C to USB-C, 100 W, braided. The same cable that ships with every camera." },
          { kind: "spec_group", title: "Spec", rows: [["Length", "1 m or 2 m"], ["Power", "100 W"], ["Data", "USB 2"]] },
          { kind: "in_the_box", items: ["One cable"] },
          { kind: "compatibility", min_os: "\u2014", min_app: "\u2014" }
        ]
      },
      {
        handle: "shipment-protection",
        title: "Shipment protection",
        subtitle: "Covers loss, theft and damage in transit.",
        kind: "protection",
        status: "active",
        position: 99,
        variants: [
          { sku: "VELA-PROTECT-1", title: "Up to $99.99", option_value: "Up to $99.99", price_minor: 98, available: 9999, inventory_policy: "continue" },
          { sku: "VELA-PROTECT-2", title: "$100 to $499.99", option_value: "$100 to $499.99", price_minor: 298, available: 9999, inventory_policy: "continue" },
          { sku: "VELA-PROTECT-3", title: "$500 to $999.99", option_value: "$500 to $999.99", price_minor: 598, available: 9999, inventory_policy: "continue" },
          { sku: "VELA-PROTECT-4", title: "$1000 and above", option_value: "$1000 and above", price_minor: 1198, available: 9999, inventory_policy: "continue" }
        ],
        blocks: []
      }
    ];
    RELEASES = [
      {
        version: "2.0.0",
        build: 2e3,
        released_on: "2024-12-11",
        artifact_name: "arranger-2.0.0.dmg",
        size_bytes: 154876459,
        sha256: "9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2",
        description: "A new library that reads a camera over the wire without a catalog.",
        notes: [
          { group: "Newly Added", items: ["A library view that groups by camera rather than by folder (VELA-1180)", "Direct import from a card reader (VELA-1204)"] },
          { group: "Improvements", items: ["Thumbnails render about twice as fast on large cards (VELA-1099)"] },
          { group: "Bug Fixes", items: ["Fixed a crash when a card was removed mid import (VELA-1188)"] },
          { group: "Known Issues", items: ["Cards above 2 TB report the wrong free space (VELA-1210)"] }
        ]
      },
      {
        version: "1.4.4",
        build: 1440,
        released_on: "2024-06-26",
        artifact_name: "arranger-1.4.4.dmg",
        size_bytes: 160301059,
        description: "A maintenance release ahead of the summer.",
        notes: [
          { group: "Improvements", items: ["Firmware files are checked against their digest before a write (VELA-1002)"] },
          { group: "Bug Fixes", items: ["Fixed the window reopening off screen on some laptops (VELA-1011)", "Fixed a wrong date on files copied twice in one minute (VELA-1014)"] },
          { group: "Known Issues", items: ["The progress figure pauses at 90 percent on Cricket 7.0 (VELA-1019)"] }
        ]
      },
      {
        version: "1.4.3",
        build: 1430,
        released_on: "2024-05-20",
        artifact_name: "arranger-1.4.3.dmg",
        size_bytes: 158220144,
        description: "Support for Cricket firmware 7.2 and a quieter install.",
        notes: [
          { group: "Newly Added", items: ["Support for Cricket firmware 7.2 (VELA-0977)", "A checksum report after an import (VELA-0981)"] },
          { group: "Improvements", items: ["The write progress reads the camera rather than a clock (VELA-0955)"] },
          { group: "Bug Fixes", items: ["Fixed the register row losing a serial on a slow line (VELA-0962)"] },
          { group: "Known Issues", items: ["Import stops if the camera sleeps before the last file (VELA-0988)"] }
        ]
      },
      {
        version: "1.4.2",
        build: 1420,
        released_on: "2024-05-20",
        artifact_name: "arranger-1.4.2.dmg",
        size_bytes: 157903622,
        description: "Small fixes only.",
        notes: [
          { group: "Bug Fixes", items: ["Fixed a wrong count on the summary line (VELA-0930)", "Fixed the export sheet forgetting its folder (VELA-0933)"] },
          { group: "Known Issues", items: ["Arranger 1.4.2 cannot update to 2.0.0 directly (VELA-1204)"] }
        ]
      }
    ];
    FIRMWARE = [
      { product_handle: "compact", version: "7.2", build: 720, channel: "general", min_firmware: "6.11", min_app_version: "1.4.0", size_bytes: 24117248, released_on: "2024-05-20" },
      { product_handle: "compact", version: "7.0", build: 700, channel: "general", min_firmware: "6.11", min_app_version: "1.4.0", size_bytes: 23904448, released_on: "2024-03-02" },
      { product_handle: "compact", version: "6.11", build: 611, channel: "general", min_firmware: null, min_app_version: "1.0.0", size_bytes: 22880768, released_on: "2023-11-14" },
      { product_handle: "flagship", version: "2.4", build: 240, channel: "general", min_firmware: "2.0", min_app_version: "2.0.0", size_bytes: 31201280, released_on: "2024-04-08" }
    ];
    DEVICES = [
      {
        serial: "VC2609PVDA7Q",
        product_handle: "compact",
        variant_sku: "VELA-CRICKET-GRAPHITE",
        status: "registered",
        firmware_version: "7.0",
        owner_email: "customer@example.com",
        order_number: "VE-2026-0001",
        nickname: "Everyday",
        warranty_until: "2027-09-06"
      },
      {
        serial: "VA2609NRWB2Z",
        product_handle: "flagship",
        variant_sku: "VELA-A1-SAND",
        status: "registered",
        firmware_version: "2.4",
        owner_email: "customer2@example.com",
        warranty_until: "2028-06-01"
      },
      {
        serial: "VA2609KTMHX4",
        product_handle: "flagship",
        variant_sku: "VELA-A1-GRAPHITE",
        status: "sold",
        warranty_until: "2027-06-01"
      },
      {
        serial: "VC2609WJ3DKT",
        product_handle: "compact",
        variant_sku: "VELA-CRICKET-YELLOW",
        status: "blocked",
        blocked_reason: "reported_stolen"
      }
    ];
  }
});

// src/server/seed.ts
async function seed() {
  const pw = await hashPassword(SEED_PASSWORD);
  for (const [email, name] of [["customer@example.com", "Iris Vantaa"], ["customer2@example.com", "Rune Halden"]]) {
    await q(
      `INSERT INTO customer (email, email_folded, name, password_hash, status)
       VALUES ($1,$2,$3,$4,'active')
       ON CONFLICT (email_folded) DO UPDATE SET name = EXCLUDED.name`,
      [email, email.toLowerCase(), name, pw]
    );
  }
  const customerId = async (email) => (await one(`SELECT id FROM customer WHERE email_folded = $1`, [email])).id;
  const c1 = await customerId("customer@example.com");
  const c2 = await customerId("customer2@example.com");
  for (const p of PRODUCTS) {
    const row = await one(
      `INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (handle) DO UPDATE SET title=EXCLUDED.title, subtitle=EXCLUDED.subtitle, kind=EXCLUDED.kind,
         status=EXCLUDED.status, support_until=EXCLUDED.support_until, position=EXCLUDED.position
       RETURNING id`,
      [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until ?? null, p.position]
    );
    const productId2 = row.id;
    for (const [i, v] of p.variants.entries()) {
      const vr = await one(
        `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
         VALUES ($1,$2,$3,$4,$5,'USD',$6,$7)
         ON CONFLICT (sku) DO UPDATE SET product_id=EXCLUDED.product_id, title=EXCLUDED.title,
           option_value=EXCLUDED.option_value, price_minor=EXCLUDED.price_minor, position=EXCLUDED.position,
           inventory_policy=EXCLUDED.inventory_policy
         RETURNING id`,
        [productId2, v.sku, v.title, v.option_value, v.price_minor, i + 1, v.inventory_policy ?? "deny"]
      );
      await q(
        `INSERT INTO inventory_level (variant_id, available, committed) VALUES ($1,$2,0)
         ON CONFLICT (variant_id) DO NOTHING`,
        [vr.id, v.available]
      );
    }
    await q(`DELETE FROM product_block WHERE product_id = $1`, [productId2]);
    for (const [i, b] of p.blocks.entries()) {
      await q(
        `INSERT INTO product_block (product_id, kind, position, payload) VALUES ($1,$2,$3,$4)`,
        [productId2, b.kind, i + 1, JSON.stringify(b)]
      );
    }
  }
  const productId = async (handle) => (await one(`SELECT id FROM product WHERE handle = $1`, [handle])).id;
  const variantId = async (sku) => (await one(`SELECT id FROM variant WHERE sku = $1`, [sku])).id;
  for (const r of RELEASES) {
    await q(
      `INSERT INTO app_release (version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes)
       VALUES ($1,$2,$3,'general',$4,$5,$6,$7,$8)
       ON CONFLICT (build) DO UPDATE SET version=EXCLUDED.version, released_on=EXCLUDED.released_on,
         artifact_name=EXCLUDED.artifact_name, size_bytes=EXCLUDED.size_bytes, sha256=EXCLUDED.sha256,
         description=EXCLUDED.description, notes=EXCLUDED.notes`,
      [
        r.version,
        r.build,
        r.released_on,
        r.artifact_name,
        r.size_bytes,
        r.sha256 ?? sha256Hex(`vela-arranger-${r.artifact_name}`),
        r.description,
        JSON.stringify(r.notes)
      ]
    );
  }
  for (const f of FIRMWARE) {
    await q(
      `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (product_id, build) DO UPDATE SET version=EXCLUDED.version, min_firmware=EXCLUDED.min_firmware,
         min_app_version=EXCLUDED.min_app_version, channel=EXCLUDED.channel, size_bytes=EXCLUDED.size_bytes,
         sha256=EXCLUDED.sha256, released_on=EXCLUDED.released_on`,
      [
        await productId(f.product_handle),
        f.version,
        f.build,
        f.min_firmware,
        f.min_app_version,
        f.channel,
        f.size_bytes,
        sha256Hex(`vela-firmware-${f.product_handle}-${f.build}`),
        f.released_on
      ]
    );
  }
  const existingOrder = await one(`SELECT id FROM "order" WHERE number = 'VE-2026-0001'`);
  if (!existingOrder) {
    const subtotal = 29900, tax = 2990, total = 32890;
    const accessToken = sha256Hex("seed-order-0001-access");
    const order = await one(
      `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, total_minor,
          currency, status, payment_status, fulfilment_status, shipping_method, shipping_address,
          marketing_consent, protection_minor, discount_minor, access_token_hash, placed_at)
       VALUES ('VE-2026-0001',$1,'customer@example.com',$2,0,$3,$4,'USD','confirmed','invoiced','fulfilled',
          'Standard',$5,false,0,0,$6, now() - interval '4 days')
       RETURNING id`,
      [c1, subtotal, tax, total, JSON.stringify({
        name: "Iris Vantaa",
        line1: "12 Meridian Row",
        line2: "",
        city: "Portland",
        region: "OR",
        postal_code: "97205",
        country: "US",
        phone: ""
      }), accessToken]
    );
    const cricketVariant = await variantId("VELA-CRICKET-GRAPHITE");
    const line = await one(
      `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
       VALUES ($1,$2,'Vela Cricket \u2014 Graphite','VELA-CRICKET-GRAPHITE',1,$3,$3) RETURNING id`,
      [order.id, cricketVariant, 29900]
    );
    await q(
      `INSERT INTO device_serial (order_id, order_line_id, variant_id, serial)
             VALUES ($1,$2,$3,'VC2609PVDA7Q') ON CONFLICT (serial) DO NOTHING`,
      [order.id, line.id, cricketVariant]
    );
    await q(`UPDATE inventory_level SET available = 12, committed = 1 WHERE variant_id = $1`, [cricketVariant]);
  }
  for (const d of DEVICES) {
    const pid = await productId(d.product_handle);
    const vid = await variantId(d.variant_sku);
    await q(
      `INSERT INTO device (serial, serial_folded, product_id, variant_id, status, blocked_reason,
                           firmware_version, firmware_reported_at, nickname, order_id, warranty_until)
       VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (serial_folded) DO UPDATE SET status=EXCLUDED.status, blocked_reason=EXCLUDED.blocked_reason,
         firmware_version=EXCLUDED.firmware_version, nickname=EXCLUDED.nickname, warranty_until=EXCLUDED.warranty_until`,
      [
        d.serial.toUpperCase(),
        pid,
        vid,
        d.status,
        d.blocked_reason ?? null,
        d.firmware_version ?? null,
        d.firmware_version ? (/* @__PURE__ */ new Date()).toISOString() : null,
        d.nickname ?? null,
        null,
        d.warranty_until ?? null
      ]
    );
    const dev = await one(
      `SELECT d.id, o.customer_id AS owner FROM device d
        LEFT JOIN device_ownership o ON o.device_id = d.id AND o.released_at IS NULL
       WHERE d.serial_folded = $1`,
      [d.serial.toUpperCase()]
    );
    if (d.owner_email) {
      const cid = d.owner_email === "customer@example.com" ? c1 : c2;
      if (!dev.owner) {
        await q(`INSERT INTO device_ownership (device_id, customer_id, method) VALUES ($1,$2,'order') ON CONFLICT DO NOTHING`, [dev.id, cid]);
      }
    }
  }
  const maxSeq = await one(
    `SELECT MAX((regexp_replace(number, '^VE-[0-9]{4}-', ''))::int) AS n
       FROM "order" WHERE number ~ '^VE-[0-9]{4}-[0-9]{4}$'`
  );
  await q(`SELECT setval('order_number_seq', $1, true)`, [Math.max(Number(maxSeq?.n ?? 0), 1)]);
  logEvent("seed.done", {});
}
var init_seed = __esm({
  async "src/server/seed.ts"() {
    "use strict";
    init_db();
    await init_auth();
    init_log();
    await init_seed_data();
  }
});

// src/container.ts
var container_exports = {};
__export(container_exports, {
  createHandler: () => createHandler
});
import * as http from "node:http";
async function createHandler() {
  const started = Date.now();
  await waitForDatabase();
  await migrate();
  await seed();
  logEvent("app.ready", { ms: Date.now() - started });
  const { handler } = await import("./entry.mjs");
  const port = Number(process.env.PORT || process.env.APP_PUBLIC_PORT || 4173);
  const server = http.createServer(handler);
  server.listen(port, "0.0.0.0", () => {
    logEvent("app.listening", { port, host: "0.0.0.0" });
  });
  const shutdown = (signal) => {
    logEvent("app.stopping", { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3e3).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
var init_container = __esm({
  async "src/container.ts"() {
    "use strict";
    init_migrate();
    await init_seed();
    init_log();
  }
});

// src/entrypoint.ts
process.env.ASTRO_NODE_AUTOSTART = "disabled";
var { createHandler: createHandler2 } = await init_container().then(() => container_exports);
await createHandler2();
