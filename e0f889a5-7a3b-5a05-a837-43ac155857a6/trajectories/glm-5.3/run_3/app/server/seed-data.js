export const SEED_PASSWORD = 'deku-demo-pw-2026';

export const seedCustomers = [
  { email: 'customer@example.com', name: 'Iris Vantaa' },
  { email: 'customer2@example.com', name: 'Rune Halden' }
];

export const seedProducts = [
  {
    handle: 'flagship', title: 'Vela A1', subtitle: 'The full-frame camera we wanted on the table.', kind: 'camera', status: 'active', support_until: '2032-06-01', position: 10,
    variants: [
      { sku: 'VELA-A1-GRAPHITE', option_value: 'Graphite', price_minor: 89900, available: 4 },
      { sku: 'VELA-A1-SAND', option_value: 'Sand', price_minor: 89900, available: 6 },
      { sku: 'VELA-A1-YELLOW', option_value: 'Yellow', price_minor: 89900, available: 1 }
    ],
    blocks: [
      { kind: 'lede', position: 10, payload: { text: 'The Vela A1 is a full-frame camera built around one sensor and two controls. It exists because a camera should disappear into the hand that holds it.' } },
      { kind: 'spec_group', position: 20, payload: { title: 'Specifications', rows: [['Sensor', '35 mm full frame, 24 megapixels'], ['Lens mount', 'Vela M bayonet'], ['Shutter', '1/8000 s to 60 s'], ['Weight', '612 g with battery'], ['Body', 'Machined aluminium, graphite, sand or yellow']] } },
      { kind: 'in_the_box', position: 30, payload: { items: ['Vela A1 body', 'Battery BP-1', 'Charger with cable', 'Shoulder strap', 'Warranty card'] } },
      { kind: 'compatibility', position: 40, payload: { os: 'macOS 13.0 or later', app: 'Arranger 2.0.0 or later' } }
    ]
  },
  {
    handle: 'compact', title: 'Vela Cricket', subtitle: 'The small one that goes everywhere.', kind: 'camera', status: 'active', support_until: null, position: 20,
    variants: [
      { sku: 'VELA-CRICKET-GRAPHITE', option_value: 'Graphite', price_minor: 29900, available: 12 },
      { sku: 'VELA-CRICKET-YELLOW', option_value: 'Yellow', price_minor: 29900, available: 0 }
    ],
    blocks: [
      { kind: 'lede', position: 10, payload: { text: 'Vela Cricket is the camera you carry when you did not plan to carry a camera. It shares the A1 mount and its colour science, and it fits in a coat pocket.' } },
      { kind: 'spec_group', position: 20, payload: { title: 'Specifications', rows: [['Sensor', 'APS-C, 20 megapixels'], ['Lens mount', 'Vela M bayonet'], ['Shutter', '1/4000 s to 30 s'], ['Weight', '318 g with battery'], ['Body', 'Machined aluminium, graphite or yellow']] } },
      { kind: 'in_the_box', position: 30, payload: { items: ['Vela Cricket body', 'Battery BP-2', 'USB-C cable, 1 m', 'Wrist strap', 'Warranty card'] } },
      { kind: 'compatibility', position: 40, payload: { os: 'macOS 13.0 or later', app: 'Arranger 1.4.0 or later' } }
    ]
  },
  {
    handle: 'mount', title: 'Monitor Mount', subtitle: 'Puts the camera where your monitor already is.', kind: 'accessory', status: 'discontinued', support_until: '2029-09-01', position: 30,
    variants: [
      { sku: 'VELA-MOUNT-CLAMP', option_value: 'Clamp', price_minor: 4900, available: 0 },
      { sku: 'VELA-MOUNT-VESA', option_value: 'VESA', price_minor: 4900, available: 0 }
    ],
    blocks: [
      { kind: 'lede', position: 10, payload: { text: 'A machined mount that holds a Vela camera to a monitor arm or a VESA plate. We no longer sell it. We still support it.' } },
      { kind: 'spec_group', position: 20, payload: { title: 'Specifications', rows: [['Material', 'Anodised aluminium'], ['Load', '1.2 kg'], ['Fits', 'Monitor arms 10 to 40 mm, VESA 75 and 100']] } },
      { kind: 'in_the_box', position: 30, payload: { items: ['Monitor Mount', 'Hex key', 'Two M4 screws'] } },
      { kind: 'compatibility', position: 40, payload: { os: 'Not applicable', app: 'Not applicable' } },
      { kind: 'support_note', position: 50, payload: { until: '2029-09-01', note: 'We no longer sell this. We will support it until September 1, 2029.' } }
    ]
  },
  {
    handle: 'case', title: 'Travel Case', subtitle: 'Cut foam, room for two bodies.', kind: 'accessory', status: 'active', support_until: null, position: 40,
    variants: [ { sku: 'VELA-CASE-STD', option_value: 'Standard', price_minor: 7900, available: 15 } ],
    blocks: [
      { kind: 'lede', position: 10, payload: { text: 'A hard travel case with two layers of cut foam. It holds two camera bodies, three lenses and the usual cables.' } },
      { kind: 'spec_group', position: 20, payload: { title: 'Specifications', rows: [['Outside', '420 by 320 by 160 mm'], ['Inside', '390 by 290 by 140 mm'], ['Material', 'Recycled polypropylene shell, charcoal foam']] } },
      { kind: 'in_the_box', position: 30, payload: { items: ['Travel Case', 'Two foam layers', 'Shoulder strap'] } },
      { kind: 'compatibility', position: 40, payload: { os: 'Not applicable', app: 'Not applicable' } }
    ]
  },
  {
    handle: 'cable', title: 'Replacement Cable', subtitle: 'USB-C to USB-C, in two lengths.', kind: 'spare', status: 'active', support_until: null, position: 50,
    variants: [
      { sku: 'VELA-CABLE-1M', option_value: '1 m', price_minor: 1900, available: 30 },
      { sku: 'VELA-CABLE-2M', option_value: '2 m', price_minor: 2400, available: 30 }
    ],
    blocks: [
      { kind: 'lede', position: 10, payload: { text: 'The cable that ships in the box, sold on its own. It carries data and power, and it is braided.' } },
      { kind: 'spec_group', position: 20, payload: { title: 'Specifications', rows: [['Connector', 'USB-C to USB-C'], ['Power', '60 W'], ['Cable', 'Braided, 4 mm']] } },
      { kind: 'in_the_box', position: 30, payload: { items: ['One cable'] } },
      { kind: 'compatibility', position: 40, payload: { os: 'Not applicable', app: 'Not applicable' } }
    ]
  },
  {
    handle: 'protection', title: 'Shipment protection', subtitle: 'Covers loss, theft and damage in transit.', kind: 'protection', status: 'active', support_until: null, position: 60,
    variants: [
      { sku: 'VELA-PROTECT-1', option_value: 'Orders under $100', price_minor: 98, available: 0, floor: 1, ceil: 9999 },
      { sku: 'VELA-PROTECT-2', option_value: 'Orders $100 to $499', price_minor: 298, available: 0, floor: 10000, ceil: 49999 },
      { sku: 'VELA-PROTECT-3', option_value: 'Orders $500 to $999', price_minor: 598, available: 0, floor: 50000, ceil: 99999 },
      { sku: 'VELA-PROTECT-4', option_value: 'Orders $1000 and above', price_minor: 1198, available: 0, floor: 100000, ceil: 2147483647 }
    ],
    blocks: []
  }
];

export const seedDevices = [
  { serial: 'VC2609PVDA7Q', product: 'compact', variant: 'VELA-CRICKET-GRAPHITE', status: 'registered', owner: 'customer@example.com', order: 'VE-2026-0001', firmware: '7.0', nickname: null, warranty: '2028-09-05' },
  { serial: 'VA2609NRWB2Z', product: 'flagship', variant: 'VELA-A1-SAND', status: 'registered', owner: 'customer2@example.com', order: null, firmware: '2.4', nickname: null, warranty: '2028-09-05' },
  { serial: 'VA2609KTMHX4', product: 'flagship', variant: 'VELA-A1-GRAPHITE', status: 'sold', owner: null, order: null, firmware: null, nickname: null, warranty: '2027-09-05' },
  { serial: 'VC2609WJ3DKT', product: 'compact', variant: 'VELA-CRICKET-YELLOW', status: 'blocked', blocked_reason: 'reported_stolen', owner: null, order: null, firmware: null, nickname: null, warranty: null }
];

export const seedOrder1 = {
  number: 'VE-2026-0001', email: 'customer@example.com', customer: 'customer@example.com',
  sku: 'VELA-CRICKET-GRAPHITE', quantity: 1, unit_price_minor: 29900,
  shipping_method: 'Standard', status: 'confirmed', payment_status: 'invoiced', fulfilment_status: 'fulfilled', placed_at: '2026-08-14T11:20:00Z',
  address: { name: 'Iris Vantaa', line1: '18 Dock Street', line2: '', city: 'Portland', region: 'ME', postal_code: '04101', country: 'US', phone: '' }
};

export const seedReleases = [
  {
    version: '2.0.0', build: 2000, released_on: '2024-12-11', artifact_name: 'arranger-2.0.0.dmg', size_bytes: 154876459, channel: 'general',
    sha256: '9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2',
    description: 'Arranger 2.0 adds the new library and reads every archive Arranger has ever written.',
    notes: {
      'Newly Added': ['A new library view that groups by camera and by year.', 'Support for Vela A1 colour profiles.', 'A firmware panel that lists every image your camera can accept.'],
      'Improvements': ['Imports finish in about half the time.', 'The map view loads tiles on demand.'],
      'Bug Fixes': ['Fixed a crash when a card was removed during import.', 'Fixed the sort order of the release notes archive.'],
      'Known Issues': ['On some MacBook Air models the fan runs during a long import. It stops when the import ends.']
    }
  },
  {
    version: '1.4.4', build: 1440, released_on: '2024-06-26', artifact_name: 'arranger-1.4.4.dmg', size_bytes: 160301059, channel: 'general',
    sha256: '5d1c02f9b46e0a7d3c8f19e4b7a2d6053e8c1f4a9b0d7e2c5f8a3b6d9e0c2f4a',
    description: 'A maintenance release ahead of the 2.0 work.',
    notes: {
      'Improvements': ['Faster thumbnail generation for Cricket files.'],
      'Bug Fixes': ['Fixed a hang when a library lived on a network volume.', 'Fixed the date shown on imported files from time zones east of UTC.'],
      'Known Issues': ['The map view still loads all tiles at once.']
    }
  },
  {
    version: '1.4.3', build: 1430, released_on: '2024-05-20', artifact_name: 'arranger-1.4.3.dmg', size_bytes: 158220144, channel: 'general',
    sha256: '3e7a1d94c05b6f8e2d7a3c1f9b4e6d8a0c2f5b7e9d1a4c6f8b0e2d5a7c9e1f3b',
    description: 'The release that made tethering reliable.',
    notes: {
      'Newly Added': ['Tethered capture for Vela Cricket.', 'A warning when a firmware update needs a newer Arranger.'],
      'Improvements': ['The import sheet remembers its last destination.'],
      'Bug Fixes': ['Fixed the exposure readout when the camera was set to half stops.'],
      'Known Issues': ['Tethering drops on some USB-C hubs that also carry a display.']
    }
  },
  {
    version: '1.4.2', build: 1420, released_on: '2024-05-20', artifact_name: 'arranger-1.4.2.dmg', size_bytes: 157903622, channel: 'general',
    sha256: 'a9f2b4e6d8c0a2f4b6e8d0c2a4f6b8e0d2c4a6f8b0e2d4c6a8f0b2e4d6c8a0f2',
    description: 'A small release with one important fix.',
    notes: {
      'Improvements': ['Reading a card is about a third faster.'],
      'Bug Fixes': ['Fixed a case where a Cricket wrote a file Arranger could not open.'],
      'Known Issues': ['The film strip can flicker while a long import runs.']
    }
  }
];

export const seedFirmware = [
  { product: 'compact', version: '7.2', build: 720, channel: 'general', min_firmware: '6.11', min_app_version: '1.4.0', size_bytes: 24576000, sha256: 'b4d6f8a0c2e4d6f8a0c2e4d6f8a0c2e4d6f8a0c2e4d6f8a0c2e4d6f8a0c2e4d6', released_on: '2026-07-02' },
  { product: 'compact', version: '7.0', build: 700, channel: 'general', min_firmware: '6.11', min_app_version: '1.4.0', size_bytes: 24514000, sha256: 'c5d7f8a0c2e4d6f8a0c2e4d6f8a0c2e4d6f8a0c2e4d6f8a0c2e4d6f8a0c2e4d7', released_on: '2026-03-15' },
  { product: 'compact', version: '6.11', build: 611, channel: 'general', min_firmware: null, min_app_version: '1.0.0', size_bytes: 24120000, sha256: 'd6e8f8a0c2e4d6f8a0c2e4d6f8a0c2e4d6f8a0c2e4d6f8a0c2e4d6f8a0c2e4d8', released_on: '2025-11-04' },
  { product: 'flagship', version: '2.4', build: 240, channel: 'general', min_firmware: '2.0', min_app_version: '2.0.0', size_bytes: 38912000, sha256: 'e7f9f8a0c2e4d6f8a0c2e4d6f8a0c2e4d6f8a0c2e4d6f8a0c2e4d6f8a0c2e4d9', released_on: '2026-02-11' }
];
