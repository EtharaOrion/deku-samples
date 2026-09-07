/**
 * The letter. Sixteen paragraphs, a dateline and a closing line.
 * `side` drives the narrow layout only: each paragraph is a half width block and
 * the blocks alternate in a pattern that follows the argument rather than a rule.
 * The three consecutive paragraphs about mass market electronics are pulled to
 * one side together.
 */
export interface Paragraph {
  text: string;
  side: 'start' | 'end';
}

export const LETTER_TITLE = 'the table';
export const LETTER_DATELINE = 'June 1, 2026';
export const LETTER_CLOSING = 'See you soon.';

export const LETTER: Paragraph[] = [
  {
    side: 'start',
    text: 'This company began at a kitchen table with a camera in pieces on it. The shutter had failed after four years, which is roughly when they fail, and the manufacturer would not sell me the part. They offered me a discount on a new one instead.',
  },
  {
    side: 'end',
    text: 'I took the body apart to see what a shutter costs. It is a stamped steel blade, two magnets and a flexible circuit. It is not a precious thing. The cost was never the part. The cost was that nobody had decided I should be allowed to have it.',
  },
  {
    side: 'start',
    text: 'So the first decision was made for us before we had a product: every part we can sell you, we will sell you, and the underside of every camera has screws rather than glue.',
  },
  {
    side: 'end',
    text: 'We make two cameras. The A1 is the one we build when nobody is asking us to hit a price, and the Cricket is the one we carry. They share a sensor pipeline, a mount, a cable and a battery, because two cameras that share nothing are two companies.',
  },
  // The three consecutive paragraphs about mass market electronics, together.
  {
    side: 'end',
    text: 'Most electronics are not designed to be owned. They are designed to be replaced, on a schedule that was set before the first unit shipped, by a company that has already costed the replacement.',
  },
  {
    side: 'end',
    text: 'The mechanism is rarely dramatic. A battery is glued in. A screw is a shape no one sells a driver for. A firmware update quietly drops a format. Support ends on a date nobody published. None of it is malice and all of it is a decision.',
  },
  {
    side: 'end',
    text: 'The result is a market where the honest thing, a machine that lasts fifteen years and can be fixed in the fourteenth, is the thing nobody is incentivised to build. We would like to be a small piece of evidence that it can be built anyway.',
  },
  {
    side: 'start',
    text: 'Everything we sell has a support date on it, and the date is published on the day the product goes on sale, not on the day we stop caring. When we discontinued the monitor mount we did not delete its page. It is still there with its date on it.',
  },
  {
    side: 'end',
    text: 'A camera outlives the order that bought it. That sounds obvious, and almost no shop is built that way. A serial number is a record in its own right here: you can register a camera you bought secondhand, and you can hand it on when you sell it.',
  },
  {
    side: 'start',
    text: 'The software is free and always will be. Arranger reads your cards, writes firmware and does not have an account system, because a photograph on your own disk is not something you should have to log in to reach.',
  },
  {
    side: 'end',
    text: 'We keep every release note we have ever written, including the ones about our own mistakes. Version 1.4.2 exists because 1.4.3 broke an import path on the same day, and both of them are still listed, in build order, with the reason.',
  },
  {
    side: 'start',
    text: 'When a camera stops talking to the application there is a page on this site that writes firmware directly from the browser. It works on a camera that is registered to somebody else, and on one whose warranty ran out years ago, because a repair is not a privilege.',
  },
  {
    side: 'end',
    text: 'We sell directly. There is no reseller margin, no distributor and no retail partner asking for a colourway that will move units. It means we are slower and smaller. It also means the price on the page is the price, and we answer for it.',
  },
  {
    side: 'start',
    text: 'We are eleven people. Four of us build, three write software, two answer mail, and two do everything else. The workshop is one room with the table this letter is named after in the middle of it, and most days it looks like the picture behind these words.',
  },
  {
    side: 'end',
    text: 'If you are reading this deciding whether to spend nine hundred dollars with a company you had not heard of last week: buy the small one first. It is the honest introduction, it does the same thing, and if we are wrong about all of this you are out three hundred rather than nine.',
  },
  {
    side: 'start',
    text: 'Thank you for reading this far. There is a shop through the footer below, and a firmware installer, and every release we have shipped. If you already own one of our cameras and something is wrong with it, that is the part of this we care about most.',
  },
];
