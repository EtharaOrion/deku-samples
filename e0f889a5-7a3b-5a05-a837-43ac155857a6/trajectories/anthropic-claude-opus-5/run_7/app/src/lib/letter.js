// The letter is the subject of the front page. Sixteen paragraphs, a dateline and
// one closing line, which is the only place the accent appears on that surface.

export const LETTER_TITLE = 'the table';
export const LETTER_DATELINE = 'June 1, 2026';
export const LETTER_CLOSING = 'See you soon.';

/**
 * side: which half a paragraph takes below 64rem. The three consecutive
 * paragraphs about mass market electronics are pulled to one side together,
 * because the pattern follows the argument rather than a rule.
 */
export const LETTER_PARAGRAPHS = [
  { text: 'This company started at a kitchen table in Portland with two people, a broken camera and a set of jeweller\'s screwdrivers that were the wrong size for every screw in it.', side: 'start' },
  { text: 'The camera was eleven years old. It had stopped seeing. The shutter fired, the card filled with frames, and every frame was the same flat grey. We had both shot with it for years and neither of us had ever opened one.', side: 'end' },
  { text: 'It took an afternoon to get the back off. Inside was a ribbon cable that had worked itself loose from a connector, and a service manual we had to find on a forum because the manufacturer had never published one.', side: 'start' },
  { text: 'We pushed the cable back in. The camera saw again. It is on the shelf above the bench as I write this and it still works.', side: 'end' },

  // The three consecutive paragraphs about mass market electronics, together.
  { text: 'That afternoon is the whole argument for this company, so I want to be exact about what it taught us. It was not that the camera was badly made. It was well made. It was that nobody who made it expected anyone to ever open it.', side: 'start' },
  { text: 'Mass market electronics are designed around a replacement cycle. The glue is chosen so the seam never shows, not so the seam can be parted. The firmware is signed so it cannot be examined. The service manual is a trade secret. None of this is malice; it is what happens when the person who buys the object is not the person the object is designed for.', side: 'start' },
  { text: 'The person it is designed for is the next quarter. And a camera designed for the next quarter is a camera that is finished with you in three years, whatever its shutter is rated to.', side: 'start' },

  { text: 'So we build two cameras. Only two. The A1 is the full-frame body and the Cricket goes in a coat pocket, and between them they are everything we know how to do well.', side: 'end' },
  { text: 'The shutter in the A1 is rated to four hundred thousand actuations. The battery door is a part you can buy from us for eleven dollars. The sensor assembly comes out with four screws and a Torx driver you probably already own, and the manual that tells you which four is on our site, free, with the rest of them.', side: 'start' },
  { text: 'We sell directly. There is no distributor and no reseller, which means when something goes wrong you are talking to the people who specified the part that went wrong.', side: 'end' },
  { text: 'Arranger is the application, it is free, and it stays free. Every release we have ever shipped is in the archive with its notes, including the releases where the notes are mostly things we broke.', side: 'start' },
  { text: 'The firmware is on the same page. If Arranger cannot see your camera there is a page in this site that writes firmware straight from a browser, and it works on a camera that will not boot far enough to talk to anything else.', side: 'end' },

  { text: 'A serial number is a real record here. It is not a warranty condition and it is not a marketing list. It is how we know which camera we are talking about when you write to us, and it is yours to hand to somebody else when you sell the camera on.', side: 'start' },
  { text: 'We will repair a camera that is registered to somebody else, and we will repair one whose warranty ran out four years ago. Ownership and warranty are not conditions of repair. A camera that can be fixed should be fixed.', side: 'end' },
  { text: 'The Monitor Mount is discontinued. We stopped making it when the monitors it was cut for went out of production, and we will support the ones we sold until September 2029, which is on the page for it in plain language rather than in a footnote.', side: 'start' },
  { text: 'That is the company. Two cameras, a free application, the whole archive, and a bench in Portland with somebody at it. If you want the long version, the table above is where it all still happens.', side: 'end' },
];
