// Idempotent seed. Restarting the app must not duplicate rows.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { fileURLToPath } from 'node:url';
import { q, withTransaction } from './lib/db.js';
import { hashPassword } from './lib/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SEED_PASSWORD = 'deku-demo-pw-2026';

export const LETTER = {
  title: 'the table',
  dateline: 'June 1, 2026',
  paragraphs: [
    'This letter is written at a workbench in a workshop that smells of cutting fluid and warm dust. The bench is oak, older than the company, and it has held every camera we have ever shipped.',
    'We are Vela. We design two cameras, we have them built, and we sell them ourselves. That is the whole of the business and it fits on one table.',
    'A camera is a machine for keeping a promise. You were there. The light was exactly this. The face you love looked like this, on this ordinary evening, and nobody thought to hold a camera up because nobody needed to.',
    'The phones we all carry are extraordinary and they have taken most of the photographs in the world. They are always with us because they do everything else too. A thing that does everything is a thing you never look at.',
    'Our cameras do one thing. They take a picture, they write it to a card, and they hand it over. No account, no subscription, no feed, no cloud, no notification, no suggestion.',
    'The Vela A1 is the larger of the two. It has a sensor we had made for us, a body milled from one block, and a shutter rated to four hundred thousand cycles. It is heavy on purpose, because a heavy camera held against your face does not shake.',
    'The Vela Cricket is the smaller. It fits in a coat pocket with the lens retracted, it turns on in half a second, and it survives being dropped down stairs. We know because we did it, on film, with the first one off the line.',
    'Both cameras speak to the same free application, Arranger, which runs on any Mac made in the last decade. Arranger copies your photographs off the card, files them by the day they were taken, and never asks you for anything else.',
    'We will repair either camera for five years after we stop selling it, and we will keep the firmware current for as long as the parts exist. A camera outlives the order that bought it, and a serial number is a record in its own right.',
    'The mass market for cameras went away and it is not coming back. What remains is smaller and stranger and better: people who want a thing that works, that can be repaired, that will still be working in ten years without anybody asking it to.',
    'That is not nostalgia. Nostalgia is for what you already lost. This is a purchase, and a repair, and a firmware file you download on purpose, and a company you can write to and get an answer from a person.',
    'We are eleven people. Six of us design and build and test. Two answer mail. One keeps the books. Two sweep, ship, and photograph everything for the archive. There is no marketing department because there is nobody to put in it.',
    'Everything we ship is on this page. If a thing is not on this page we do not sell it. When we stop selling a thing we say so, and we say until when we will fix it.',
    'You do not need an account to buy a camera here. You can check out with an email address and nothing else. The account exists for the cameras you own, so you can find them again when you need the firmware.',
    'Thank you for reading this far. Most people do not, and most letters are not worth it. If you take one thing from this table, take the promise: we made a machine that keeps one, and we stand behind it.',
    'The workshop is quiet now. The bench is swept. Tomorrow there will be swarf on it again, and the day after, and the day after that.',
  ],
  closing: 'See you soon.',
  signed: 'Iris Vantaa, Vela',
};

export const RELEASES = [
  {
    version: '2.0.0', build: 2000, released_on: '2024-12-11', channel: 'general',
    artifact_name: 'arranger-2.0.0.dmg', size_bytes: 154876459,
    sha256: '9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2',
    description: 'Arranger 2.0 reads the card faster and files by the day the photograph was taken.',
    notes: {
      'Newly Added': [
        'Native support for Apple silicon Macs [ARR-2841]',
        'A repair library that rebuilds a damaged index from the card itself [ARR-2805]',
      ],
      'Improvements': [
        'Copying a full 256 GB card now finishes in about eleven minutes [ARR-2766]',
        'The file list scrolls smoothly with two hundred thousand photographs [ARR-2790]',
      ],
      'Bug Fixes': [
        'Fixed a crash when a card was removed during a copy [ARR-2833]',
        'Fixed the day boundary for photographs taken before 1970 [ARR-2771]',
      ],
      'Known Issues': [
        'The first launch on a new Mac verifies the app for up to thirty seconds [ARR-2850]',
      ],
    },
  },
  {
    version: '1.4.4', build: 1440, released_on: '2024-06-26', channel: 'general',
    artifact_name: 'arranger-1.4.4.dmg', size_bytes: 160301059,
    sha256: 'a1c7e39c54d0b7e1f4a2d8c6b0597f31e2a4c8d0b6f7e5a3c9d1e0f2a4b6c8d0',
    description: 'A maintenance release that keeps 1.4 working on the current macOS.',
    notes: {
      'Newly Added': [],
      'Improvements': [
        'Faster card detection when a reader holds two cards [ARR-2651]',
      ],
      'Bug Fixes': [
        'Fixed a hang when a photograph had no capture date at all [ARR-2670]',
        'Fixed the week grouping for years that begin on a Thursday [ARR-2612]',
      ],
      'Known Issues': [],
    },
  },
  {
    version: '1.4.3', build: 1430, released_on: '2024-05-20', channel: 'general',
    artifact_name: 'arranger-1.4.3.dmg', size_bytes: 158220144,
    sha256: 'b2d8f40e65a1c8f2d5a3e9c7b1608a4f3b5c7d9e1a0f2c4b6d8e0a2c4e6f8a0c',
    description: 'The release that added the card health read-out.',
    notes: {
      'Newly Added': [
        'A card health read-out that reports wear before the card fails [ARR-2588]',
        'An option to verify a copy by reading it back [ARR-2600]',
      ],
      'Improvements': [
        'Copying stops cleanly when the Mac goes to sleep [ARR-2590]',
      ],
      'Bug Fixes': [
        'Fixed the thumbnail cache growing without limit [ARR-2602]',
      ],
      'Known Issues': [
        'Verifying a copy reads the card a second time, which takes as long again [ARR-2610]',
      ],
    },
  },
  {
    version: '1.4.2', build: 1420, released_on: '2024-05-20', channel: 'general',
    artifact_name: 'arranger-1.4.2.dmg', size_bytes: 157903622,
    sha256: 'c3e9051f76b2d9c6e4a8b1f0c9d7a5e3b1c9d7f0a2b4c6d8e0f2a4b6c8d0e1f2',
    description: 'A fix for the week grouping, released the same day as 1.4.3.',
    notes: {
      'Newly Added': [],
      'Improvements': [],
      'Bug Fixes': [
        'Fixed a crash when a card had been formatted in a camera from another maker [ARR-2612]',
        'Fixed the week grouping for years that begin on a Thursday [ARR-2608]',
      ],
      'Known Issues': [],
    },
  },
];

export const FIRMWARE = [
  { product: 'compact', version: '7.2', build: 720, channel: 'general', min_firmware: '6.11', min_app_version: '1.4.0', size_bytes: 48210944, released_on: '2024-12-10' },
  { product: 'compact', version: '7.0', build: 700, channel: 'general', min_firmware: '6.11', min_app_version: '1.4.0', size_bytes: 47900160, released_on: '2024-06-20' },
  { product: 'compact', version: '6.11', build: 611, channel: 'general', min_firmware: null, min_app_version: '1.0.0', size_bytes: 45298483, released_on: '2023-11-02' },
  { product: 'flagship', version: '2.4', build: 240, channel: 'general', min_firmware: '2.0', min_app_version: '2.0.0', size_bytes: 54525952, released_on: '2024-12-10' },
];

export const PRODUCTS = [
  {
    handle: 'flagship', title: 'Vela A1', subtitle: 'The larger camera, milled from one block.', kind: 'camera',
    status: 'active', support_until: '2032-06-01', position: 1,
    variants: [
      { sku: 'VELA-A1-GRAPHITE', title: 'Vela A1 — Graphite', option_value: 'Graphite', price_minor: 89900, available: 4 },
      { sku: 'VELA-A1-SAND', title: 'Vela A1 — Sand', option_value: 'Sand', price_minor: 89900, available: 6 },
      { sku: 'VELA-A1-YELLOW', title: 'Vela A1 — Yellow', option_value: 'Yellow', price_minor: 89900, available: 1 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'The A1 is the camera we built first and the one we still reach for. One block of aluminium, a sensor made for us, and a shutter rated to four hundred thousand cycles.' } },
      { kind: 'spec_group', payload: { title: 'Body', rows: [['Mass', '742 g with battery'], ['Body', 'One block, milled aluminium'], ['Sealing', 'Seventeen seals'], ['Shutter', 'Rated 400,000 cycles']] } },
      { kind: 'spec_group', payload: { title: 'Sensor and lens', rows: [['Sensor', '36 x 24 mm, 61 MP'], ['Mount', 'Vela K'], ['Stabilisation', 'Body, 7 stops']] } },
      { kind: 'in_the_box', payload: { items: ['Vela A1 body', 'Battery BP-11', 'Charger with cable', 'Strap, graphite', 'Card, 64 GB'] } },
      { kind: 'compatibility', payload: { os: 'macOS 13.0 or later', app: 'Arranger 2.0.0 or later' } },
      { kind: 'support_note', payload: { until: '2032-06-01' } },
    ],
  },
  {
    handle: 'compact', title: 'Vela Cricket', subtitle: 'The camera that lives in a coat pocket.', kind: 'camera',
    status: 'active', support_until: null, position: 2,
    variants: [
      { sku: 'VELA-CRICKET-GRAPHITE', title: 'Vela Cricket — Graphite', option_value: 'Graphite', price_minor: 29900, available: 12 },
      { sku: 'VELA-CRICKET-YELLOW', title: 'Vela Cricket — Yellow', option_value: 'Yellow', price_minor: 29900, available: 0 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'The Cricket fits in a coat pocket with the lens retracted, turns on in half a second, and survives being dropped down stairs. We know because we did it.' } },
      { kind: 'spec_group', payload: { title: 'Body', rows: [['Mass', '348 g with battery'], ['Body', 'Magnesium shell'], ['Sealing', 'Nine seals'], ['Shutter', 'Rated 200,000 cycles']] } },
      { kind: 'spec_group', payload: { title: 'Sensor and lens', rows: [['Sensor', '23.6 x 15.6 mm, 26 MP'], ['Lens', '28 mm equivalent, f/2.0'], ['Stabilisation', 'Lens, 4 stops']] } },
      { kind: 'in_the_box', payload: { items: ['Vela Cricket body', 'Battery BP-6', 'Charger with cable', 'Wrist strap', 'Card, 32 GB'] } },
      { kind: 'compatibility', payload: { os: 'macOS 13.0 or later', app: 'Arranger 1.4.0 or later' } },
    ],
  },
  {
    handle: 'mount', title: 'Monitor Mount', subtitle: 'Hold the camera on a desk arm.', kind: 'accessory',
    status: 'discontinued', support_until: '2029-09-01', position: 3,
    variants: [
      { sku: 'VELA-MOUNT-CLAMP', title: 'Monitor Mount — Clamp', option_value: 'Clamp', price_minor: 4900, available: 0 },
      { sku: 'VELA-MOUNT-VESA', title: 'Monitor Mount — VESA', option_value: 'VESA', price_minor: 4900, available: 0 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'A mount for holding either camera on a desk arm while it is tethered.' } },
      { kind: 'spec_group', payload: { title: 'Fit', rows: [['Clamp', 'Desks 12 to 60 mm'], ['VESA', '75 x 75 mm and 100 x 100 mm'], ['Load', 'Up to 1.2 kg']] } },
      { kind: 'in_the_box', payload: { items: ['Mount', 'Two thumbscrews'] } },
      { kind: 'compatibility', payload: { os: 'Not applicable', app: 'Not applicable' } },
      { kind: 'support_note', payload: { until: '2029-09-01' } },
    ],
  },
  {
    handle: 'case', title: 'Travel Case', subtitle: 'A fitted case for either camera.', kind: 'accessory',
    status: 'active', support_until: null, position: 4,
    variants: [
      { sku: 'VELA-CASE-STD', title: 'Travel Case — Standard', option_value: 'Standard', price_minor: 7900, available: 15 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'A fitted case in oiled canvas with a wool lining. It takes either camera with a card and a spare battery.' } },
      { kind: 'spec_group', payload: { title: 'Case', rows: [['Outside', '220 x 140 x 90 mm'], ['Mass', '310 g'], ['Material', 'Oiled canvas, wool lining']] } },
      { kind: 'in_the_box', payload: { items: ['Travel case'] } },
      { kind: 'compatibility', payload: { os: 'Not applicable', app: 'Not applicable' } },
    ],
  },
  {
    handle: 'cable', title: 'Replacement Cable', subtitle: 'The charging and transfer cable.', kind: 'spare',
    status: 'active', support_until: null, position: 5,
    variants: [
      { sku: 'VELA-CABLE-1M', title: 'Replacement Cable — 1 m', option_value: '1 m', price_minor: 1900, available: 30 },
      { sku: 'VELA-CABLE-2M', title: 'Replacement Cable — 2 m', option_value: '2 m', price_minor: 2400, available: 30 },
    ],
    blocks: [
      { kind: 'lede', payload: { text: 'The braided cable that ships with both cameras. It charges and it transfers.' } },
      { kind: 'spec_group', payload: { title: 'Cable', rows: [['Length', '1 m or 2 m'], ['Connector', 'USB-C both ends'], ['Transfer', '10 Gbit/s']] } },
      { kind: 'in_the_box', payload: { items: ['One cable'] } },
      { kind: 'compatibility', payload: { os: 'Not applicable', app: 'Not applicable' } },
    ],
  },
  {
    handle: 'protection', title: 'Shipment protection', subtitle: 'Cover against loss, theft and damage in transit.', kind: 'protection',
    status: 'active', support_until: null, position: 99,
    variants: [
      { sku: 'VELA-PROTECT-1', title: 'Shipment protection — tier 1', option_value: 'Tier 1', price_minor: 98, available: 9999 },
      { sku: 'VELA-PROTECT-2', title: 'Shipment protection — tier 2', option_value: 'Tier 2', price_minor: 298, available: 9999 },
      { sku: 'VELA-PROTECT-3', title: 'Shipment protection — tier 3', option_value: 'Tier 3', price_minor: 598, available: 9999 },
      { sku: 'VELA-PROTECT-4', title: 'Shipment protection — tier 4', option_value: 'Tier 4', price_minor: 1198, available: 9999 },
    ],
    blocks: [],
  },
];

export const DEVICES = [
  { serial: 'VC2609PVDA7Q', product: 'compact', variant: 'VELA-CRICKET-GRAPHITE', status: 'registered', owner: 'customer@example.com', firmware: '7.0', order: 'VE-2026-0001', method: 'order', warranty: '2028-06-01' },
  { serial: 'VA2609NRWB2Z', product: 'flagship', variant: 'VELA-A1-SAND', status: 'registered', owner: 'customer2@example.com', firmware: '2.4', order: null, method: 'manual', warranty: '2028-06-01' },
  { serial: 'VA2609KTMHX4', product: 'flagship', variant: 'VELA-A1-GRAPHITE', status: 'sold', owner: null, firmware: null, order: null, method: null, warranty: '2026-06-01' },
  { serial: 'VC2609WJ3DKT', product: 'compact', variant: 'VELA-CRICKET-YELLOW', status: 'blocked', blocked_reason: 'reported_stolen', owner: null, firmware: null, order: null, method: null, warranty: null },
];
