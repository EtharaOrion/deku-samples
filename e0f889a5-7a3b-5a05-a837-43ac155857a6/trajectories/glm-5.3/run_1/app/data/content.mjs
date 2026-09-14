// Static content. The letter is original writing for this project.
export const LETTER = {
  title: 'the table',
  dateline: 'June 1, 2026',
  paragraphs: [
    'This letter is written at a workbench, on a Thursday, with the parts of two cameras laid out on it in the order they go together.',
    'The table is the whole company in one view. There is a vice, a light, a loupe, a soldering iron that has cooled, and a stack of printed notes nobody has filed.',
    'We build cameras because we use them. Not the other way round.',
    'Everything we make is sold from this one page, made in runs we can count, and supported by the people who drew the circuit.',
    'A camera is a tool that has to keep working long after the receipt is lost.',
    'The software is free. It always will be.',
    'We will not ask you to make an account to download it.',
    'When something breaks we will tell you what broke, in plain words, and what we are doing about it.',
    'The mass market electronics trade works differently. It works in volumes we do not understand, on margins we do not want, and on a schedule set by a season rather than by a working thing.',
    'It treats a product as a launch. We treat a product as a responsibility that starts on the day it ships and does not end when the model is replaced.',
    'It sells a camera as a subscription to a service. We sell a camera as an object you own, that writes to a card you own, in a format any reader can open.',
    'That is not a small difference of degree. It is the difference between a thing you keep and a thing you rent without noticing.',
    'So we will stay small on purpose, and slow on purpose, and we will keep the workshop table within reach of the people who answer the mail.',
    'If a part of one of our cameras can be repaired, we will repair it. If it cannot be repaired, we will say so and sell you the part that can replace it.',
    'Sixteen paragraphs is a long letter. Thank you for reading it.',
    'The table is clear now. The next run starts on Monday.',
  ],
  closing: 'See you soon.',
};

export const FOOTER_LINKS = [
  { label: 'Shop', href: '/shop' },
  { label: 'Support' },
  { label: 'Terms' },
  { label: 'Privacy' },
  { label: 'Jobs' },
  { label: 'Contact' },
];

export const PRODUCT_BLOCKS = {
  flagship: [
    { kind: 'lede', position: 1, payload: { text: 'Our full frame body, built in short runs, with a mount we will still be making parts for in a decade.' } },
    { kind: 'spec_group', position: 2, payload: { heading: 'Body', rows: [['Sensor', 'Full frame, 61 megapixel'], ['Mount', 'Vela K, steel'], ['Weight', '740 g'], ['Weather sealing', 'Sealed at six points'], ['Battery', 'NP-V, 620 shots']] } },
    { kind: 'spec_group', position: 3, payload: { heading: 'Capture', rows: [['Still resolution', '9504 x 6336'], ['Video', '6K open gate, 10 bit'], ['Frame rate', 'Up to 30 fps electronic'], ['Stabilisation', 'Five axis, sensor shift']] } },
    { kind: 'in_the_box', position: 4, payload: { items: ['Vela A1 body', 'NP-V battery', 'Charger with cable', 'Strap, woven', 'Arranger on a card'] } },
    { kind: 'compatibility', position: 5, payload: { os: 'macOS 13.0 or later', app: 'Arranger 2.0.0 or later' } },
    { kind: 'support_note', position: 6, payload: { text: 'We will support this camera until June 1, 2032. Parts and firmware continue after that date where the part exists.' } },
  ],
  compact: [
    { kind: 'lede', position: 1, payload: { text: 'A small camera for the days you would not carry a big one. Same mount, same files, same colour.' } },
    { kind: 'spec_group', position: 2, payload: { heading: 'Body', rows: [['Sensor', 'APS-C, 26 megapixel'], ['Mount', 'Vela K, steel'], ['Weight', '312 g'], ['Weather sealing', 'Sealed at three points'], ['Battery', 'NP-V, 420 shots']] } },
    { kind: 'spec_group', position: 3, payload: { heading: 'Capture', rows: [['Still resolution', '6272 x 4160'], ['Video', '4K, 10 bit'], ['Frame rate', 'Up to 20 fps electronic'], ['Stabilisation', 'In lens only']] } },
    { kind: 'in_the_box', position: 4, payload: { items: ['Vela Cricket body', 'NP-V battery', 'Charger with cable', 'Arranger on a card'] } },
    { kind: 'compatibility', position: 5, payload: { os: 'macOS 13.0 or later', app: 'Arranger 1.4.0 or later' } },
  ],
  mount: [
    { kind: 'lede', position: 1, payload: { text: 'A clamp and a VESA plate for holding a monitor where a tripod cannot.' } },
    { kind: 'spec_group', position: 2, payload: { heading: 'Fit', rows: [['Clamp range', '10 to 40 mm'], ['Load', '2.5 kg'], ['Material', 'Anodised aluminium'], ['Thread', '1/4 in and 3/8 in']] } },
    { kind: 'in_the_box', position: 3, payload: { items: ['Mount', 'Two bolts', 'Hex key'] } },
    { kind: 'support_note', position: 4, payload: { text: 'We no longer sell this. We will support it until September 1, 2029.' } },
  ],
  case: [
    { kind: 'lede', position: 1, payload: { text: 'A fitted case for one camera, two lenses and the small parts that go missing.' } },
    { kind: 'spec_group', position: 2, payload: { heading: 'Size', rows: [['Outside', '300 x 200 x 130 mm'], ['Inside', '270 x 170 x 110 mm'], ['Weight', '680 g'], ['Material', 'Coated canvas, closed cell foam']] } },
    { kind: 'in_the_box', position: 3, payload: { items: ['Case', 'Divider set', 'Shoulder strap'] } },
    { kind: 'compatibility', position: 4, payload: { os: 'n/a', app: 'n/a' } },
  ],
  cable: [
    { kind: 'lede', position: 1, payload: { text: 'The cable that ships with the cameras, sold on its own because cables are the first thing to go.' } },
    { kind: 'spec_group', position: 2, payload: { heading: 'Spec', rows: [['Connector', 'USB-C both ends'], ['Length', '1 m or 2 m'], ['Data', 'USB 2, 480 Mbit/s'], ['Power', '60 W']] } },
    { kind: 'in_the_box', position: 3, payload: { items: ['One cable'] } },
    { kind: 'compatibility', position: 4, payload: { os: 'n/a', app: 'n/a' } },
  ],
};

export const RELEASE_NOTES = {
  '2.0.0': {
    description: 'Arranger 2.0.0 is the release that ends support for Intel Macs and starts the Vela A1 tether.',
    notes: [
      { group: 'Newly Added', items: ['Tethered capture for Vela A1 over USB-C.', 'A firmware installer that works without the app open.'] },
      { group: 'Improvements', items: ['Card import is about twice as fast on a folder of two thousand raw files.', 'The library window remembers its column widths between runs.'] },
      { group: 'Bug Fixes', items: ['Fixed a crash when a card was pulled during import.', 'Fixed the shutter count reading one high on Cricket bodies from the first run.'] },
      { group: 'Known Issues', items: ['Import from a card reader behind a hub can stall on some hubs.'] },
    ],
  },
  '1.4.4': {
    description: 'Arranger 1.4.4 is a maintenance release.',
    notes: [
      { group: 'Improvements', items: ['Faster thumbnail decoding for Cricket files.', 'The export dialog no longer resets the file name when the format changes.'] },
      { group: 'Bug Fixes', items: ['Fixed a rounding error in the exposure readout.', 'Fixed a crash when opening a library made in Arranger 1.1.'] },
    ],
  },
  '1.4.3': {
    description: 'Arranger 1.4.3 adds the Cricket yellow body profile and fixes the mount dialog.',
    notes: [
      { group: 'Newly Added', items: ['Colour profile for the Cricket yellow body.'] },
      { group: 'Improvements', items: ['The mount dialog opens about half a second sooner.', 'Serial numbers copy with one keystroke.'] },
      { group: 'Bug Fixes', items: ['Fixed the mount dialog locking the library.', 'Fixed the export queue stopping after ten items.'] },
      { group: 'Known Issues', items: ['The yellow body profile reads slightly warm under tungsten light.'] },
    ],
  },
  '1.4.2': {
    description: 'Arranger 1.4.2 is a small release that ships a cable fix.',
    notes: [
      { group: 'Bug Fixes', items: ['Fixed the app failing to see a camera on a two metre cable.', 'Fixed the version check reading the build as a date.'] },
      { group: 'Known Issues', items: ['A library on a network volume can report a false write error.'] },
    ],
  },
};

// Deterministic 64 hex digests (SHA-256 of a stable string) - placeholder content only.
import { createHash } from 'node:crypto';
export function digestFor(seed) {
  return createHash('sha256').update(`vela:${seed}`).digest('hex');
}
export const KB_DIGEST_200 = '9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2';
