const protectionRungs = [
  { sku: 'VELA-PROTECT-1', min: 1, max: 9999, price_minor: 98 },
  { sku: 'VELA-PROTECT-2', min: 10000, max: 49999, price_minor: 298 },
  { sku: 'VELA-PROTECT-3', min: 50000, max: 99999, price_minor: 598 },
  { sku: 'VELA-PROTECT-4', min: 100000, max: Infinity, price_minor: 1198 },
];

const letter = {
  title: 'the table',
  dateline: 'June 1, 2026',
  closing: 'See you soon.',
  paragraphs: [
    'This letter is written at the table the cameras are built on. It is a door blank on two trestles, it is covered in solder marks and lens tissue, and there is a groove worn into the near edge where forearms have rested for six years.',
    'We make two cameras. One is large and one is small. They take the same lenses, the same battery and the same cable, and either of them can be opened with one driver. That is the whole of the range and we intend to keep it that way.',
    'A camera is a tool that should get better the longer you hold it. Ours are built so the parts that wear out are the parts you can reach. The shutter unit comes out in four screws. The battery door is a part number, not a warranty case.',
    'We sell them ourselves, direct, from this table. There is no distributor, no dealer margin and no seasonal refresh. When we have a body ready we put it on the shop page, and when we do not, the page says so.',
    'The software is free and it always will be. Arranger reads the cards, develops the frames and writes the firmware. It carries no account, no subscription and no telemetry, and every release we have ever shipped stays on the downloads page.',
    'Most consumer electronics are designed backwards. The date the product stops being supported is chosen before the date it ships, and the enclosure is glued shut so that the date can be enforced.',
    'That is not an accident of engineering. It is the plan. A device that cannot be opened is a device that must be replaced, and a device that must be replaced is a recurring revenue line on somebody else\'s spreadsheet.',
    'We have both worked inside companies that did this, and we left. Not out of principle at first, but out of boredom. It is dull work, designing a thing to fail, and it is dull to be the person who defends it.',
    'So the A1 has a support date printed on the page and we intend to be here past it. The Cricket has no date at all, because we have not found the end of it yet.',
    'A serial number is a real thing to us. It outlives the order that bought it and it outlives the person who bought it. You can register one, rename it, and hand it to somebody else, and none of that touches the receipt.',
    'When a camera cannot be seen by the application, there is a page in a browser that will still talk to it. It is not the first thing we offer, because it is the harder path, but it exists and it is not hidden.',
    'We answer our own mail. There is no ticket number, no tier and nobody reading from a script. If you write to us about a camera you bought in 2021, one of the two of us will read it.',
    'The prices are what the parts and the labour cost, plus enough to keep the table. They do not move for a sale, they do not move at the end of a quarter, and we do not run a discount you have to be quick to catch.',
    'We keep no stock we cannot ship. When the page says four of a colour are left, there are four of them behind us on a shelf, and when the last one goes the page says sold out until the next batch is built.',
    'This is a small business and it is meant to stay one. We are not raising money, we are not hiring a growth team, and we are not planning a third camera until one of the first two stops being enough.',
    'If you have read this far you probably want the shop, and the footer below will take you there. Thank you for reading a letter instead of a landing page.',
  ],
  // three consecutive paragraphs about mass-market electronics, pulled to one side together
  pulledTogether: [5, 6, 7],
};

export { letter as l, protectionRungs as p };
