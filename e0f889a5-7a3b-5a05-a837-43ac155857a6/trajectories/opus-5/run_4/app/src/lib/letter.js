// The letter is one document: a two word lowercase title, a dateline, sixteen
// paragraphs and a closing line. `side` drives the narrow-viewport layout,
// where each paragraph is a half width block and the blocks alternate in a
// pattern that follows the argument rather than a rule. The three consecutive
// paragraphs about mass market electronics are pulled to one side together.
export const TITLE = 'the table';
export const DATELINE = 'June 1, 2026';
export const CLOSING = 'See you soon.';

export const PARAGRAPHS = [
  { side: 'start', text: 'This is written at the table where we build the cameras. It is a door on two trestles, and it has been in three rooms in four years. There are burns on it from a soldering iron that has since died, and a rectangle at one end that is cleaner than the rest, because a jig sat there for eleven months.' },
  { side: 'end', text: 'We make two cameras. One is large and one is small, and they take the same lenses and write the same files. That is the whole line. We have been asked, more than once, when the third is coming, and the answer is that it is not coming until there is a reason for it that we can say out loud in one sentence.' },
  { side: 'start', text: 'We started because a camera we both liked was discontinued, and the company that made it would not sell us the part that had failed. The part was a flexible cable worth about four dollars. The camera was worth rather more than that, and it went in a drawer, where it still is.' },
  { side: 'end', text: 'So the first decision was made for us: every part in our cameras has a number, and every number is on our site, and if you want to buy that part we will sell it to you. We will sell it to you in year eight as readily as in year one. There is no clever version of this. It is a spreadsheet and a shelf.' },
  { side: 'start', text: 'The second decision took longer. We decided the software would be free, and that it would keep working on a machine we no longer sell a camera for. The application is called Arranger. It is not a subscription. It does not have an account. It reads your files off a card and puts them where you tell it to.' },
  { side: 'end', text: 'The third decision is the one people argue with. The back comes off. Ten screws, a driver you already own, and a diagram we publish. Inside there is a board, a shutter assembly and a sensor module, and all three are replaceable without a jig. It costs us margin and it costs us a certain kind of thinness.' },
  { side: 'start', text: 'Most of what is sold as consumer electronics is not built this way, and it is worth being precise about why rather than simply disapproving.' },
  { side: 'start', text: 'A device that cannot be opened is cheaper to assemble, because glue is faster than screws and a robot can apply it. It is cheaper to support, because there is only one repair and it is a replacement. And it is better for the next quarter, because a device that dies at four years is a device that is bought again at four years.' },
  { side: 'start', text: 'None of that is a conspiracy. It is a series of individually reasonable decisions made by people with targets, and the result is a landfill. We are not better people. We simply have a smaller company and a longer horizon, and that lets us make the other choice.' },
  { side: 'end', text: 'What that costs you is real, and we would rather state it than let you discover it. Our cameras are heavier than they could be. They are more expensive than a similar sensor in a sealed body. We ship slowly, and when a batch is late it is late by weeks, not days, because there is no second factory to move it to.' },
  { side: 'start', text: 'What it buys you is that the camera is still a camera in ten years. The firmware is signed and published, and the installer runs in a browser for the case where the application cannot see the camera at all, which happens, usually at the worst time.' },
  { side: 'end', text: 'We keep a record of every serial number we have made, who it went to if they told us, and what firmware it last reported. That record is yours to move. When you sell a camera you release it, and the next person registers it, and neither of you has to ask us for permission.' },
  { side: 'start', text: 'People ask what happens if we stop. It is a fair question to ask a company of this size. The answer is that the repair documentation and the firmware images are published under a licence that survives us, and the last thing we would do is put the remaining stock of parts somewhere they can be bought.' },
  { side: 'end', text: 'We are eleven people. Four of us are on the hardware, three on the software, two on support, and two on everything else, which is mostly boxes and invoices and the phone. The table sits in the middle of a room in a building that used to press sheet metal.' },
  { side: 'start', text: 'If you write to us, one of those eleven answers. It may take two days. It will not be a form, and it will not ask you to restart the camera unless restarting the camera is genuinely the thing to do.' },
  { side: 'end', text: 'That is the company. Two cameras, a free application, a shelf of parts and a table with a burn on it. If that sounds like the right way to buy a camera, we would like to build one for you.' },
];

// The three consecutive paragraphs about mass market electronics, pulled to one
// side together, are indices 6, 7 and 8 above.
export const MASS_MARKET_RANGE = [6, 8];
