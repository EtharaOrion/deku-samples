// The letter. Sixteen paragraphs, in reading order.
// `side` drives the half-width blocks below 64rem; the three consecutive paragraphs
// about mass market electronics are pulled to one side together.
export const LETTER = {
  title: 'the table',
  dateline: 'June 1, 2026',
  closing: 'See you soon.',
  paragraphs: [
    { side: 'start', text: 'This company is a table in a room above a bakery, and four people who sit around it.' },
    {
      side: 'end',
      text: 'We started because we wanted a camera that did not argue with us. Everything on the market either asked us to hold down two buttons to change one setting, or hid the setting entirely and decided on our behalf.',
    },
    {
      side: 'start',
      text: 'The first Vela was a body milled by a shop three streets away, a sensor we bought at a price that made no sense for the quantity, and firmware written at this table over eleven months.',
    },
    {
      side: 'end',
      text: 'We sold forty of them. Every one went to somebody whose name we knew. Two of those forty cameras are still in service, and one of them has been to the Southern Ocean twice.',
    },
    {
      side: 'start',
      text: 'The A1 came after that, then the Cricket, which is the camera most of you have. The Cricket exists because one of us kept leaving the A1 at home.',
    },
    {
      side: 'end',
      text: 'We make two cameras. We would like to keep it that way. A third would mean a fourth person on the table, and the table is full.',
    },
    {
      side: 'start',
      text: 'Mass market electronics is a business of forgetting. A device is announced, sold for a season, and then quietly removed from the support page eighteen months later.',
    },
    {
      side: 'start',
      text: 'That is not carelessness. It is arithmetic. The cost of keeping a signing key alive, of paying an engineer who remembers how the bootloader works, of testing a new operating system against a product nobody is buying, is real and it never falls.',
    },
    {
      side: 'start',
      text: 'We decided to pay that arithmetic instead of avoiding it. The date on every product page is the date we will still answer for it, and we put it in writing because a promise without a date is not a promise.',
    },
    {
      side: 'end',
      text: 'That is why the Monitor Mount is still on this site with the word discontinued next to it, and a support date of September 1, 2029. We stopped making it. We did not stop standing behind it.',
    },
    {
      side: 'start',
      text: 'It is also why the firmware installer in this site exists. It writes to a camera that the application cannot see, which is the state a camera is in after a write goes wrong or after a battery dies at the wrong second.',
    },
    {
      side: 'end',
      text: 'We do not ask who owns the camera before we repair it. A camera that has been sold three times is still a camera we built, and a warranty that has run out is not a reason to leave somebody holding a brick.',
    },
    {
      side: 'start',
      text: 'A serial number is a record in its own right here. It has one owner at a time, and ownership is a link that is made and released, so selling a camera is a thing you can actually do without writing to us.',
    },
    {
      side: 'end',
      text: 'Arranger is free and it stays free. Every release we have ever shipped is on the downloads page, with its notes, its size and its digest, because the version you need is not always the newest one.',
    },
    {
      side: 'start',
      text: 'We are not going to grow quickly. We would rather answer the mail. If you write to us, one of the four people at this table reads it, and it is usually the person who wrote the part you are asking about.',
    },
    {
      side: 'end',
      text: 'Thank you for buying a camera from a table above a bakery. The bakery opens at six, which is why we are all here by seven.',
    },
  ],
};
