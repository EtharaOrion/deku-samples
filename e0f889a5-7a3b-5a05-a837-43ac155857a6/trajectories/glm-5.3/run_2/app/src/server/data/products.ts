export type SeedProduct = {
  handle: string; title: string; subtitle: string; kind: 'camera'|'accessory'|'spare'|'protection';
  status: 'active'|'discontinued'; support_until?: string; position: number;
  variants: { sku: string; title: string; option_value: string; price_minor: number; available: number; policy?: 'deny'|'continue' }[];
  blocks: { kind: 'lede'|'spec_group'|'in_the_box'|'compatibility'|'support_note'; position: number; payload: any }[];
};

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    handle: 'flagship', title: 'Vela A1', subtitle: 'Our full-frame workshop camera.', kind: 'camera',
    status: 'active', support_until: '2032-06-01', position: 1,
    variants: [
      { sku: 'VELA-A1-GRAPHITE', title: 'Vela A1 · Graphite', option_value: 'Graphite', price_minor: 89900, available: 4 },
      { sku: 'VELA-A1-SAND', title: 'Vela A1 · Sand', option_value: 'Sand', price_minor: 89900, available: 6 },
      { sku: 'VELA-A1-YELLOW', title: 'Vela A1 · Yellow', option_value: 'Yellow', price_minor: 89900, available: 1 }
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'The camera we set out to build. A full-frame sensor, a fixed prime lens and a body that can be repaired rather than replaced.' } },
      { kind: 'spec_group', position: 2, payload: { title: 'Body', rows: [['Sensor', 'Full-frame 36 x 24 mm CMOS'], ['Lens', '35 mm f/2, fixed'], ['Body', 'Magnesium, 740 g']] } },
      { kind: 'spec_group', position: 3, payload: { title: 'Capture', rows: [['Stills', 'Raw and JPEG'], ['Video', '4K at 30 fps'], ['Storage', 'CFexpress Type B']] } },
      { kind: 'in_the_box', position: 4, payload: { items: ['Vela A1 body', 'Lens cap', 'Strap', 'USB-C cable', 'Warranty card'] } },
      { kind: 'compatibility', position: 5, payload: { os: 'macOS 13.0 or later', app: 'Arranger 2.0.0' } },
      { kind: 'support_note', position: 6, payload: { text: 'We will support this camera until June 1, 2032.' } }
    ]
  },
  {
    handle: 'compact', title: 'Vela Cricket', subtitle: 'The one we set out to carry.', kind: 'camera',
    status: 'active', position: 2,
    variants: [
      { sku: 'VELA-CRICKET-GRAPHITE', title: 'Vela Cricket · Graphite', option_value: 'Graphite', price_minor: 29900, available: 12 },
      { sku: 'VELA-CRICKET-YELLOW', title: 'Vela Cricket · Yellow', option_value: 'Yellow', price_minor: 29900, available: 0 }
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'A camera small enough to be there when the picture happens. The same sensor family as the A1, the same firmware, a body you can hold in one hand.' } },
      { kind: 'spec_group', position: 2, payload: { title: 'Body', rows: [['Sensor', 'APS-C 23.6 x 15.7 mm CMOS'], ['Lens', '28 mm f/2.8, fixed'], ['Body', 'Aluminium, 340 g']] } },
      { kind: 'spec_group', position: 3, payload: { title: 'Capture', rows: [['Stills', 'Raw and JPEG'], ['Video', '4K at 24 fps'], ['Storage', 'SD UHS-II']] } },
      { kind: 'in_the_box', position: 4, payload: { items: ['Vela Cricket body', 'Wrist strap', 'USB-C cable', 'Warranty card'] } },
      { kind: 'compatibility', position: 5, payload: { os: 'macOS 13.0 or later', app: 'Arranger 1.4.0' } }
    ]
  },
  {
    handle: 'mount', title: 'Monitor Mount', subtitle: 'A clamp and a VESA plate.', kind: 'accessory',
    status: 'discontinued', support_until: '2029-09-01', position: 3,
    variants: [
      { sku: 'VELA-MOUNT-CLAMP', title: 'Monitor Mount · Clamp', option_value: 'Clamp', price_minor: 4900, available: 0 },
      { sku: 'VELA-MOUNT-VESA', title: 'Monitor Mount · VESA', option_value: 'VESA', price_minor: 4900, available: 0 }
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'A mount for the workshop bench. We no longer sell it; we still support it.' } },
      { kind: 'spec_group', position: 2, payload: { title: 'Fit', rows: [['Clamp', 'Tables 18 to 45 mm'], ['VESA', '75 x 75 and 100 x 100']] } },
      { kind: 'in_the_box', position: 3, payload: { items: ['Mount', 'Hardware kit', 'Hex key'] } },
      { kind: 'compatibility', position: 4, payload: { os: 'Not applicable', app: 'Not applicable' } },
      { kind: 'support_note', position: 5, payload: { text: 'We no longer sell this. We will support it until September 1, 2029.' } }
    ]
  },
  {
    handle: 'case', title: 'Travel Case', subtitle: 'Fitted, padded, unremarkable.', kind: 'accessory',
    status: 'active', position: 4,
    variants: [
      { sku: 'VELA-CASE-STD', title: 'Travel Case · Standard', option_value: 'Standard', price_minor: 7900, available: 15 }
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'A fitted case for either camera, with room for a cable and a card. It closes with a zip and it does not try to be anything else.' } },
      { kind: 'spec_group', position: 2, payload: { title: 'Fit', rows: [['Inside', '290 x 150 x 70 mm'], ['Fits', 'Vela A1 or Vela Cricket'], ['Material', 'Recycled nylon, closed-cell foam']] } },
      { kind: 'in_the_box', position: 3, payload: { items: ['Travel case'] } },
      { kind: 'compatibility', position: 4, payload: { os: 'Not applicable', app: 'Not applicable' } }
    ]
  },
  {
    handle: 'cable', title: 'Replacement Cable', subtitle: 'USB-C, one metre or two.', kind: 'spare',
    status: 'active', position: 5,
    variants: [
      { sku: 'VELA-CABLE-1M', title: 'Replacement Cable · 1 m', option_value: '1 m', price_minor: 1900, available: 30 },
      { sku: 'VELA-CABLE-2M', title: 'Replacement Cable · 2 m', option_value: '2 m', price_minor: 2400, available: 30 }
    ],
    blocks: [
      { kind: 'lede', position: 1, payload: { text: 'The cable that ships with the cameras, sold on its own because cables get left behind.' } },
      { kind: 'spec_group', position: 2, payload: { title: 'Detail', rows: [['Length', '1 m or 2 m'], ['Connectors', 'USB-C to USB-C'], ['Power', '100 W']] } },
      { kind: 'compatibility', position: 3, payload: { os: 'Not applicable', app: 'Not applicable' } }
    ]
  },
  {
    handle: 'protection', title: 'Shipment protection', subtitle: 'Covers loss, theft and damage in transit.', kind: 'protection',
    status: 'active', position: 99,
    variants: [
      { sku: 'VELA-PROTECT-1', title: 'Shipment protection · Tier 1', option_value: 'Standard', price_minor: 98, available: 9999 },
      { sku: 'VELA-PROTECT-2', title: 'Shipment protection · Tier 2', option_value: 'Standard', price_minor: 298, available: 9999 },
      { sku: 'VELA-PROTECT-3', title: 'Shipment protection · Tier 3', option_value: 'Standard', price_minor: 598, available: 9999 },
      { sku: 'VELA-PROTECT-4', title: 'Shipment protection · Tier 4', option_value: 'Standard', price_minor: 1198, available: 9999 }
    ],
    blocks: []
  }
];
