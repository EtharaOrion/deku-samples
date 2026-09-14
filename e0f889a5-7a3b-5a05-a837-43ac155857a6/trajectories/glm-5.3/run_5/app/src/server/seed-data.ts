import { pool, q, one, tx } from './db.js';
import { hashPassword, sha256Hex } from './auth.js';
import { logEvent } from './log.js';

export const SEED_PASSWORD = 'deku-demo-pw-2026';

function sha256OfHex(seed: string): string {
  return sha256Hex(seed);
}

function digestFor(seed: string): string {
  // A lowercase hexadecimal digest of sixty-four characters, derived deterministically.
  return sha256OfHex(seed);
}

export type VariantSeed = {
  sku: string; title: string; option_value: string; price_minor: number; available: number;
  inventory_policy?: 'deny' | 'continue';
};

type BlockSeed =
  | { kind: 'lede'; text: string }
  | { kind: 'spec_group'; title: string; rows: Array<[string, string]> }
  | { kind: 'in_the_box'; items: string[] }
  | { kind: 'compatibility'; min_os: string; min_app: string; note?: string }
  | { kind: 'support_note'; support_until: string; text: string };

export type ProductSeed = {
  handle: string; title: string; subtitle: string; kind: 'camera' | 'accessory' | 'spare' | 'protection';
  status: 'active' | 'discontinued'; support_until?: string; position: number;
  variants: VariantSeed[]; blocks: BlockSeed[];
};

export const PRODUCTS: ProductSeed[] = [
  {
    handle: 'flagship', title: 'Vela A1', subtitle: 'The full-frame body we reach for when the light is going.',
    kind: 'camera', status: 'active', support_until: '2032-06-01', position: 1,
    variants: [
      { sku: 'VELA-A1-GRAPHITE', title: 'Graphite', option_value: 'Graphite', price_minor: 89900, available: 4 },
      { sku: 'VELA-A1-SAND', title: 'Sand', option_value: 'Sand', price_minor: 89900, available: 6 },
      { sku: 'VELA-A1-YELLOW', title: 'Yellow', option_value: 'Yellow', price_minor: 89900, available: 1 },
    ],
    blocks: [
      { kind: 'lede', text: 'A full-frame body with a machined top plate, a replaceable gasket in every door, and a strap lug cut from the same billet as the plate it sits in.' },
      { kind: 'spec_group', title: 'Body', rows: [['Sensor', '36 × 24 mm full frame'], ['Mount', 'Vela K'], ['Weight', '742 g'], ['Body', 'Machined aluminium']] },
      { kind: 'spec_group', title: 'Capture', rows: [['Frames per second', '8'], ['Shutter', 'Focal plane, 1/8000'], ['Buffer', '94 raw frames']] },
      { kind: 'in_the_box', items: ['Vela A1 body', 'Battery', 'Charger', 'Strap', 'Repair manual'] },
      { kind: 'compatibility', min_os: 'macOS 13.0', min_app: '2.0.0' },
    ],
  },
  {
    handle: 'compact', title: 'Vela Cricket', subtitle: 'The one that lives in a coat pocket and gets used anyway.',
    kind: 'camera', status: 'active', position: 2,
    variants: [
      { sku: 'VELA-CRICKET-GRAPHITE', title: 'Graphite', option_value: 'Graphite', price_minor: 29900, available: 12 },
      { sku: 'VELA-CRICKET-YELLOW', title: 'Yellow', option_value: 'Yellow', price_minor: 29900, available: 0 },
    ],
    blocks: [
      { kind: 'lede', text: 'The same sensor as the A1 in a body small enough to forget. Fixed lens, replaceable battery, no menus you cannot learn in an afternoon.' },
      { kind: 'spec_group', title: 'Body', rows: [['Sensor', '36 × 24 mm full frame'], ['Lens', '35 mm f/2'], ['Weight', '398 g'], ['Body', 'Machined aluminium']] },
      { kind: 'spec_group', title: 'Capture', rows: [['Frames per second', '6'], ['Shutter', 'Leaf, 1/2000'], ['Buffer', '48 raw frames']] },
      { kind: 'in_the_box', items: ['Cricket body', 'Battery', 'Charger', 'Wrist strap', 'Repair manual'] },
      { kind: 'compatibility', min_os: 'macOS 13.0', min_app: '1.4.0' },
    ],
  },
  {
    handle: 'mount', title: 'Monitor Mount', subtitle: 'Clamps the Cricket to a desk arm or a monitor.',
    kind: 'accessory', status: 'discontinued', support_until: '2029-09-01', position: 3,
    variants: [
      { sku: 'VELA-MOUNT-CLAMP', title: 'Clamp', option_value: 'Clamp', price_minor: 4900, available: 0 },
      { sku: 'VELA-MOUNT-VESA', title: 'VESA', option_value: 'VESA', price_minor: 4900, available: 0 },
    ],
    blocks: [
      { kind: 'lede', text: 'Holds a Cricket at eye level. We no longer sell it; we still support it.' },
      { kind: 'spec_group', title: 'Fit', rows: [['Load', 'Up to 600 g'], ['Clamp range', '12 to 45 mm'], ['Weight', '184 g']] },
      { kind: 'in_the_box', items: ['Mount', 'Two screws', 'Hex key'] },
      { kind: 'compatibility', min_os: '—', min_app: '—' },
      { kind: 'support_note', support_until: '2029-09-01', text: 'We no longer sell this. We will support it until September 1, 2029.' },
    ],
  },
  {
    handle: 'case', title: 'Travel Case', subtitle: 'A hard case for one camera, one lens and the cable.',
    kind: 'accessory', status: 'active', position: 4,
    variants: [{ sku: 'VELA-CASE-STD', title: 'Standard', option_value: 'Standard', price_minor: 7900, available: 15 }],
    blocks: [
      { kind: 'lede', text: 'Cut foam, a pressure valve, and a hinge rated to more openings than the camera will see.' },
      { kind: 'spec_group', title: 'Fit', rows: [['Inside', '240 × 160 × 90 mm'], ['Weight', '410 g'], ['Material', 'Glass-filled nylon']] },
      { kind: 'in_the_box', items: ['Case', 'Two foam layers'] },
      { kind: 'compatibility', min_os: '—', min_app: '—' },
    ],
  },
  {
    handle: 'cable', title: 'Replacement Cable', subtitle: 'The one that breaks first, sold on its own.',
    kind: 'spare', status: 'active', position: 5,
    variants: [
      { sku: 'VELA-CABLE-1M', title: '1 m', option_value: '1 m', price_minor: 1900, available: 30 },
      { sku: 'VELA-CABLE-2M', title: '2 m', option_value: '2 m', price_minor: 2400, available: 30 },
    ],
    blocks: [
      { kind: 'lede', text: 'USB-C to USB-C, 100 W, braided. The same cable that ships with every camera.' },
      { kind: 'spec_group', title: 'Spec', rows: [['Length', '1 m or 2 m'], ['Power', '100 W'], ['Data', 'USB 2'] ] },
      { kind: 'in_the_box', items: ['One cable'] },
      { kind: 'compatibility', min_os: '—', min_app: '—' },
    ],
  },
  {
    handle: 'shipment-protection', title: 'Shipment protection', subtitle: 'Covers loss, theft and damage in transit.',
    kind: 'protection', status: 'active', position: 99,
    variants: [
      { sku: 'VELA-PROTECT-1', title: 'Up to $99.99', option_value: 'Up to $99.99', price_minor: 98, available: 9999, inventory_policy: 'continue' },
      { sku: 'VELA-PROTECT-2', title: '$100 to $499.99', option_value: '$100 to $499.99', price_minor: 298, available: 9999, inventory_policy: 'continue' },
      { sku: 'VELA-PROTECT-3', title: '$500 to $999.99', option_value: '$500 to $999.99', price_minor: 598, available: 9999, inventory_policy: 'continue' },
      { sku: 'VELA-PROTECT-4', title: '$1000 and above', option_value: '$1000 and above', price_minor: 1198, available: 9999, inventory_policy: 'continue' },
    ],
    blocks: [],
  },
];

export type ReleaseSeed = {
  version: string; build: number; released_on: string; artifact_name: string; size_bytes: number;
  sha256?: string; description: string;
  notes: Array<{ group: string; items: string[] }>;
};

export const RELEASES: ReleaseSeed[] = [
  {
    version: '2.0.0', build: 2000, released_on: '2024-12-11', artifact_name: 'arranger-2.0.0.dmg',
    size_bytes: 154876459, sha256: '9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2',
    description: 'A new library that reads a camera over the wire without a catalog.',
    notes: [
      { group: 'Newly Added', items: ['A library view that groups by camera rather than by folder (VELA-1180)', 'Direct import from a card reader (VELA-1204)'] },
      { group: 'Improvements', items: ['Thumbnails render about twice as fast on large cards (VELA-1099)'] },
      { group: 'Bug Fixes', items: ['Fixed a crash when a card was removed mid import (VELA-1188)'] },
      { group: 'Known Issues', items: ['Cards above 2 TB report the wrong free space (VELA-1210)'] },
    ],
  },
  {
    version: '1.4.4', build: 1440, released_on: '2024-06-26', artifact_name: 'arranger-1.4.4.dmg',
    size_bytes: 160301059, description: 'A maintenance release ahead of the summer.',
    notes: [
      { group: 'Improvements', items: ['Firmware files are checked against their digest before a write (VELA-1002)'] },
      { group: 'Bug Fixes', items: ['Fixed the window reopening off screen on some laptops (VELA-1011)', 'Fixed a wrong date on files copied twice in one minute (VELA-1014)'] },
      { group: 'Known Issues', items: ['The progress figure pauses at 90 percent on Cricket 7.0 (VELA-1019)'] },
    ],
  },
  {
    version: '1.4.3', build: 1430, released_on: '2024-05-20', artifact_name: 'arranger-1.4.3.dmg',
    size_bytes: 158220144, description: 'Support for Cricket firmware 7.2 and a quieter install.',
    notes: [
      { group: 'Newly Added', items: ['Support for Cricket firmware 7.2 (VELA-0977)', 'A checksum report after an import (VELA-0981)'] },
      { group: 'Improvements', items: ['The write progress reads the camera rather than a clock (VELA-0955)'] },
      { group: 'Bug Fixes', items: ['Fixed the register row losing a serial on a slow line (VELA-0962)'] },
      { group: 'Known Issues', items: ['Import stops if the camera sleeps before the last file (VELA-0988)'] },
    ],
  },
  {
    version: '1.4.2', build: 1420, released_on: '2024-05-20', artifact_name: 'arranger-1.4.2.dmg',
    size_bytes: 157903622, description: 'Small fixes only.',
    notes: [
      { group: 'Bug Fixes', items: ['Fixed a wrong count on the summary line (VELA-0930)', 'Fixed the export sheet forgetting its folder (VELA-0933)'] },
      { group: 'Known Issues', items: ['Arranger 1.4.2 cannot update to 2.0.0 directly (VELA-1204)'] },
    ],
  },
];

export type FirmwareSeed = {
  product_handle: string; version: string; build: number; channel: 'internal' | 'beta' | 'general' | 'yanked';
  min_firmware: string | null; min_app_version: string; size_bytes: number; released_on: string;
};

export const FIRMWARE: FirmwareSeed[] = [
  { product_handle: 'compact', version: '7.2', build: 720, channel: 'general', min_firmware: '6.11', min_app_version: '1.4.0', size_bytes: 24_117_248, released_on: '2024-05-20' },
  { product_handle: 'compact', version: '7.0', build: 700, channel: 'general', min_firmware: '6.11', min_app_version: '1.4.0', size_bytes: 23_904_448, released_on: '2024-03-02' },
  { product_handle: 'compact', version: '6.11', build: 611, channel: 'general', min_firmware: null, min_app_version: '1.0.0', size_bytes: 22_880_768, released_on: '2023-11-14' },
  { product_handle: 'flagship', version: '2.4', build: 240, channel: 'general', min_firmware: '2.0', min_app_version: '2.0.0', size_bytes: 31_201_280, released_on: '2024-04-08' },
];

export type DeviceSeed = {
  serial: string; product_handle: string; variant_sku: string; status: 'manufactured' | 'sold' | 'registered' | 'blocked';
  blocked_reason?: string; firmware_version?: string; owner_email?: string; order_number?: string; nickname?: string;
  warranty_until?: string;
};

export const DEVICES: DeviceSeed[] = [
  { serial: 'VC2609PVDA7Q', product_handle: 'compact', variant_sku: 'VELA-CRICKET-GRAPHITE', status: 'registered',
    firmware_version: '7.0', owner_email: 'customer@example.com', order_number: 'VE-2026-0001', nickname: 'Everyday',
    warranty_until: '2027-09-06' },
  { serial: 'VA2609NRWB2Z', product_handle: 'flagship', variant_sku: 'VELA-A1-SAND', status: 'registered',
    firmware_version: '2.4', owner_email: 'customer2@example.com', warranty_until: '2028-06-01' },
  { serial: 'VA2609KTMHX4', product_handle: 'flagship', variant_sku: 'VELA-A1-GRAPHITE', status: 'sold',
    warranty_until: '2027-06-01' },
  { serial: 'VC2609WJ3DKT', product_handle: 'compact', variant_sku: 'VELA-CRICKET-YELLOW', status: 'blocked',
    blocked_reason: 'reported_stolen' },
];
