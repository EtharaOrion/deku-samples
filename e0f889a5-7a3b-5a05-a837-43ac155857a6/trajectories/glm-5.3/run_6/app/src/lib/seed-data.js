// Seed data. Idempotent: every insert uses a natural key and ON CONFLICT DO
// NOTHING, so restarting the app never duplicates rows.
import { createHash } from 'node:crypto';
import { db } from './db.js';
import { hashPassword } from './tokens.js';
import { SCHEMA_SQL } from './schema.js';

export const SEED_PASSWORD = 'deku-demo-pw-2026';

function sha256hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

const CUSTOMERS = [
  { email: 'customer@example.com', name: 'Iris Vantaa' },
  { email: 'customer2@example.com', name: 'Rune Halden' }
];

const PRODUCTS = [
  {
    handle: 'flagship', title: 'Vela A1', subtitle: 'The camera we could not stop building.', kind: 'camera',
    status: 'active', supportUntil: '2032-06-01', position: 1,
    variants: [
      { sku: 'VELA-A1-GRAPHITE', title: 'Vela A1', optionValue: 'Graphite', priceMinor: 89900, position: 1, available: 4 },
      { sku: 'VELA-A1-SAND', title: 'Vela A1', optionValue: 'Sand', priceMinor: 89900, position: 2, available: 6 },
      { sku: 'VELA-A1-YELLOW', title: 'Vela A1', optionValue: 'Yellow', priceMinor: 89900, position: 3, available: 1 }
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'A body the size of a paperback, a shutter you can hear across a room, and a sensor we had cut three times before it was right. The A1 is the camera we carry when the picture matters more than the kit.' } },
      { kind: 'spec_group', position: 2, payload: { title: 'Body', rows: [['Sensor', 'APS-C, 26 megapixels'], ['Shutter', 'Mechanical, 1/4000 to 30 s'], ['Weight', '412 g with battery'], ['Body', 'Milled aluminium']] } },
      { kind: 'spec_group', position: 3, payload: { title: 'Film and sound', rows: [['Film', '4K at 24 frames a second'], ['Sound', 'Two microphones, wind covered'], ['Battery', 'About 420 frames']] } },
      { kind: 'in_the_box', position: 4, payload: { items: ['Vela A1 body', 'Battery', 'USB-C cable, 1 m', 'Wrist strap', 'Printed short guide'] } },
      { kind: 'compatibility', position: 5, payload: { operatingSystem: 'macOS 12.0 or later', appVersion: 'Arranger 1.4.0 or later', note: 'Windows support arrives with Arranger 2.1.' } }
    ]
  },
  {
    handle: 'compact', title: 'Vela Cricket', subtitle: 'Small, quick, and hard to leave at home.', kind: 'camera',
    status: 'active', supportUntil: null, position: 2,
    variants: [
      { sku: 'VELA-CRICKET-GRAPHITE', title: 'Vela Cricket', optionValue: 'Graphite', priceMinor: 29900, position: 1, available: 12 },
      { sku: 'VELA-CRICKET-YELLOW', title: 'Vela Cricket', optionValue: 'Yellow', priceMinor: 29900, position: 2, available: 0 }
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'The Cricket fits in a coat pocket and starts before you have raised it. It is the camera for the walk you did not plan to take. Same sensor family as the A1, same colour, half the weight.' } },
      { kind: 'spec_group', position: 2, payload: { title: 'Body', rows: [['Sensor', 'APS-C, 20 megapixels'], ['Shutter', 'Mechanical, 1/2000 to 30 s'], ['Weight', '238 g with battery'], ['Body', 'Milled aluminium']] } },
      { kind: 'spec_group', position: 3, payload: { title: 'Film and sound', rows: [['Film', '1440p at 30 frames a second'], ['Sound', 'One microphone, wind covered'], ['Battery', 'About 300 frames']] } },
      { kind: 'in_the_box', position: 4, payload: { items: ['Vela Cricket body', 'Battery', 'USB-C cable, 1 m', 'Wrist strap', 'Printed short guide'] } },
      { kind: 'compatibility', position: 5, payload: { operatingSystem: 'macOS 13.0 or later', appVersion: 'Arranger 1.4.0 or later', note: 'The Cricket needs Arranger 1.4.0 or later for firmware 7.0 and above.' } }
    ]
  },
  {
    handle: 'mount', title: 'Monitor Mount', subtitle: 'Clamps to a desk, holds a screen steady.', kind: 'accessory',
    status: 'discontinued', supportUntil: '2029-09-01', position: 3,
    variants: [
      { sku: 'VELA-MOUNT-CLAMP', title: 'Monitor Mount', optionValue: 'Clamp', priceMinor: 4900, position: 1, available: 0 },
      { sku: 'VELA-MOUNT-VESA', title: 'Monitor Mount', optionValue: 'VESA', priceMinor: 4900, position: 2, available: 0 }
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'A steel mount for the table you already own. We made it for our own benches before we sold it.' } },
      { kind: 'spec_group', position: 2, payload: { title: 'Fit', rows: [['Clamp range', '10 to 60 mm'], ['VESA', '75 and 100 mm'], ['Weight held', 'Up to 9 kg'], ['Material', 'Powder coated steel']] } },
      { kind: 'in_the_box', position: 3, payload: { items: ['Mount arm', 'Clamp and VESA plate', 'Hex key', 'Screws'] } },
      { kind: 'compatibility', position: 4, payload: { operatingSystem: 'None needed', appVersion: 'None needed' } },
      { kind: 'support_note', position: 5, payload: { text: 'We no longer sell this. We will support it until September 1, 2029.' } }
    ]
  },
  {
    handle: 'case', title: 'Travel Case', subtitle: 'Cut foam, a hard shell, room for two.', kind: 'accessory',
    status: 'active', supportUntil: null, position: 4,
    variants: [
      { sku: 'VELA-CASE-STD', title: 'Travel Case', optionValue: 'Standard', priceMinor: 7900, position: 1, available: 15 }
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'A case that survives a hold. The foam is cut for an A1 and a Cricket, or two Crickets, with room for batteries and cards.' } },
      { kind: 'spec_group', position: 2, payload: { title: 'Size', rows: [['Outside', '340 by 240 by 140 mm'], ['Inside', '320 by 220 by 110 mm'], ['Weight', '1.1 kg empty']] } },
      { kind: 'in_the_box', position: 3, payload: { items: ['Case', 'Two foam layers', 'One half-size tray'] } },
      { kind: 'compatibility', position: 4, payload: { operatingSystem: 'None needed', appVersion: 'None needed' } }
    ]
  },
  {
    handle: 'cable', title: 'Replacement Cable', subtitle: 'The one you lost, in two lengths.', kind: 'spare',
    status: 'active', supportUntil: null, position: 5,
    variants: [
      { sku: 'VELA-CABLE-1M', title: 'Replacement Cable', optionValue: '1 m', priceMinor: 1900, position: 1, available: 30 },
      { sku: 'VELA-CABLE-2M', title: 'Replacement Cable', optionValue: '2 m', priceMinor: 2400, position: 2, available: 30 }
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'A braided USB-C cable that charges the camera and moves film off it. It carries data, which the cheap ones do not.' } },
      { kind: 'spec_group', position: 2, payload: { title: 'Cable', rows: [['Length', '1 m or 2 m'], ['Connector', 'USB-C both ends'], ['Data', 'USB 2, 480 Mbit a second']] } },
      { kind: 'in_the_box', position: 3, payload: { items: ['One cable'] } },
      { kind: 'compatibility', position: 4, payload: { operatingSystem: 'None needed', appVersion: 'None needed' } }
    ]
  },
  {
    handle: 'shipment-protection', title: 'Shipment protection', subtitle: 'Cover for loss, theft and damage.', kind: 'protection',
    status: 'active', supportUntil: null, position: 99,
    variants: [
      { sku: 'VELA-PROTECT-1', title: 'Shipment protection', optionValue: 'Under $100', priceMinor: 98, position: 1, available: 9999, coversFrom: 1, coversTo: 9999 },
      { sku: 'VELA-PROTECT-2', title: 'Shipment protection', optionValue: '$100 to $500', priceMinor: 298, position: 2, available: 9999, coversFrom: 10000, coversTo: 49999 },
      { sku: 'VELA-PROTECT-3', title: 'Shipment protection', optionValue: '$500 to $1,000', priceMinor: 598, position: 3, available: 9999, coversFrom: 50000, coversTo: 99999 },
      { sku: 'VELA-PROTECT-4', title: 'Shipment protection', optionValue: '$1,000 and above', priceMinor: 1198, position: 4, available: 9999, coversFrom: 100000, coversTo: null }
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'Cover against loss, theft and damage while the parcel travels. Excluded from tax and from shipping weight.' } }
    ]
  }
];

const RELEASES = [
  {
    version: '2.0.0', build: 2000, releasedOn: '2024-12-11', channel: 'general',
    artifactName: 'arranger-2.0.0.dmg', sizeBytes: 154876459,
    sha256: '9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2',
    description: 'A new film room, and a faster import.',
    notes: {
      'Newly Added': [
        'The film room plays straight from the card.',
        'Albums can hold two thousand pictures without slowing.',
        'Firmware updates work over a cable again.'
      ],
      Improvements: [
        'Import reads a card about a third faster than 1.4.4.',
        'Scrolling a long album no longer drops frames.'
      ],
      'Bug Fixes': [
        'Fixed a crash when a picture had no date at all. (VELA-2201)',
        'Fixed the sidebar forgetting its width. (VELA-2244)'
      ],
      'Known Issues': [
        'On macOS 13 the film room needs one restart after the first import.'
      ]
    }
  },
  {
    version: '1.4.4', build: 1440, releasedOn: '2024-06-26', channel: 'general',
    artifactName: 'arranger-1.4.4.dmg', sizeBytes: 160301059,
    sha256: sha256hex('arranger-1.4.4.dmg'),
    description: 'Small fixes after 1.4.3.',
    notes: {
      'Newly Added': [
        'A card can be ejected from the import screen.'
      ],
      Improvements: [
        'Album covers pick a sharper frame.'
      ],
      'Bug Fixes': [
        'Fixed a hang when a card was pulled out mid import. (VELA-1902)',
        'Fixed the wrong serial shown for a second camera. (VELA-1930)'
      ],
      'Known Issues': []
    }
  },
  {
    version: '1.4.3', build: 1430, releasedOn: '2024-05-20', channel: 'general',
    artifactName: 'arranger-1.4.3.dmg', sizeBytes: 158220144,
    sha256: sha256hex('arranger-1.4.3.dmg'),
    description: 'Firmware 7.0 support and a steadier import.',
    notes: {
      'Newly Added': [
        'Support for Cricket firmware 7.0.',
        'A register of the cameras on this account.'
      ],
      Improvements: [
        'Import keeps its place if the laptop sleeps.',
        'The installer writes the version the camera reports back.'
      ],
      'Bug Fixes': [
        'Fixed a wrong count on the film room badge. (VELA-1712)',
        'Fixed pasting a serial with spaces. (VELA-1755)'
      ],
      'Known Issues': [
        'A camera below firmware 6.11 still needs Arranger 1.0.0 to move.'
      ]
    }
  },
  {
    version: '1.4.2', build: 1420, releasedOn: '2024-05-20', channel: 'general',
    artifactName: 'arranger-1.4.2.dmg', sizeBytes: 157903622,
    sha256: sha256hex('arranger-1.4.2.dmg'),
    description: 'The first release of the register.',
    notes: {
      'Newly Added': [
        'The register lists every camera this account owns.'
      ],
      Improvements: [
        'Opening a second window no longer locks the library.'
      ],
      'Bug Fixes': [
        'Fixed a crash on import of a card over 64 GB. (VELA-1601)',
        'Fixed sorting an album by camera. (VELA-1640)'
      ],
      'Known Issues': []
    }
  }
];

const FIRMWARE = [
  { handle: 'compact', version: '7.2', build: 720, channel: 'general', minFirmware: '6.11', minAppVersion: '1.4.0', sizeBytes: 24117248, releasedOn: '2024-06-26' },
  { handle: 'compact', version: '7.0', build: 700, channel: 'general', minFirmware: '6.11', minAppVersion: '1.4.0', sizeBytes: 23984128, releasedOn: '2024-05-20' },
  { handle: 'compact', version: '6.11', build: 611, channel: 'general', minFirmware: null, minAppVersion: '1.0.0', sizeBytes: 23552000, releasedOn: '2024-02-08' },
  { handle: 'flagship', version: '2.4', build: 240, channel: 'general', minFirmware: '2.0', minAppVersion: '2.0.0', sizeBytes: 26214400, releasedOn: '2024-04-14' }
];

const DEVICES = [
  {
    serial: 'VC2609PVDA7Q', handle: 'compact', sku: 'VELA-CRICKET-GRAPHITE', status: 'registered',
    firmwareVersion: '7.0', firmwareReportedAt: '2026-08-14T10:12:00Z', nickname: 'The pocket one',
    ownerEmail: 'customer@example.com', method: 'order', orderNumber: 'VE-2026-0001',
    warrantyUntil: '2027-08-14'
  },
  {
    serial: 'VA2609NRWB2Z', handle: 'flagship', sku: 'VELA-A1-SAND', status: 'registered',
    firmwareVersion: '2.4', firmwareReportedAt: '2026-08-02T09:30:00Z', nickname: null,
    ownerEmail: 'customer2@example.com', method: 'manual', orderNumber: null,
    warrantyUntil: '2026-09-01'
  },
  {
    serial: 'VA2609KTMHX4', handle: 'flagship', sku: 'VELA-A1-GRAPHITE', status: 'sold',
    firmwareVersion: null, firmwareReportedAt: null, nickname: null,
    ownerEmail: null, method: null, orderNumber: null, warrantyUntil: '2027-06-01'
  },
  {
    serial: 'VC2609WJ3DKT', handle: 'compact', sku: 'VELA-CRICKET-YELLOW', status: 'blocked',
    blockedReason: 'reported_stolen', firmwareVersion: null, firmwareReportedAt: null, nickname: null,
    ownerEmail: null, method: null, orderNumber: null, warrantyUntil: null
  }
];

const SEED_ORDER = {
  number: 'VE-2026-0001',
  customerEmail: 'customer@example.com',
  email: 'customer@example.com',
  sku: 'VELA-CRICKET-GRAPHITE',
  quantity: 1,
  unitPriceMinor: 29900,
  taxMinor: 2990,
  status: 'confirmed',
  paymentStatus: 'invoiced',
  fulfilmentStatus: 'fulfilled',
  shippingMethod: 'Standard',
  placedAt: '2026-08-14T10:05:00Z',
  shippingAddress: {
    name: 'Iris Vantaa', line1: '14 Harbour Row', line2: '', city: 'Portland',
    region: 'ME', postalCode: '04101', country: 'US', phone: ''
  }
};

export { CUSTOMERS, PRODUCTS, RELEASES, FIRMWARE, DEVICES, SEED_ORDER };

