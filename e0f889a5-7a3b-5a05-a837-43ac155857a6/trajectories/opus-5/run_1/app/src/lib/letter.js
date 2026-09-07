// The letter is the subject of the front page. Sixteen paragraphs, a dateline
// and one closing line. `side` drives the narrow-viewport layout: each block is
// a half width block and the blocks alternate in a pattern that follows the
// argument rather than a rule. The three consecutive paragraphs about mass
// market electronics (10, 11, 12) are pulled to one side together.
export const LETTER_TITLE = 'the table';
export const LETTER_DATELINE = 'June 1, 2026';
export const LETTER_CLOSING = 'See you soon.';

export const LETTER_PARAGRAPHS = [
  { side: 'start', text: 'This company began at a kitchen table with a camera in pieces on it. The camera was fifteen years old, it had stopped seeing, and the shop that had sold it said the part it needed had not been made for eight years and could not be had at any price.' },
  { side: 'end', text: 'The part was a ribbon cable. It cost, when we eventually found one, about the price of a sandwich. What had failed was not the camera. What had failed was the arrangement around the camera, which had quietly decided that the camera was finished.' },
  { side: 'start', text: 'We put it back together on that table. It worked for another nine years, and it is on a shelf in the workshop now, still working, which is why the film behind these words is a table with tools on it rather than a photograph of a mountain.' },
  { side: 'end', text: 'We make two cameras. The A1 is the larger one and the Cricket is the smaller one, and they take the same lenses and read the same cards, because a person who buys the second one should not have to abandon what they bought the first time.' },
  { side: 'start', text: 'Both open with a driver you already own. There is no glue holding the sensor in. The battery door is a part with a number, and you can buy it from us without explaining yourself, and it will still be a part with a number in ten years.' },
  { side: 'end', text: 'We sell them ourselves, directly, because every layer between the person who made a thing and the person who uses it is a layer that has an opinion about how long it should last, and none of those opinions have ever been generous.' },
  { side: 'start', text: 'The software is free and it is not a subscription. It is called Arranger, it runs on your own machine, and it reads your cards into folders you can see and open with anything else. Your photographs are not a hostage we hold in order to keep billing you.' },
  { side: 'end', text: 'We keep every version of it we have ever shipped, with the notes we wrote at the time, including the notes about the things we broke. That archive is on this site. It is not flattering, and it is the most honest document we publish.' },
  { side: 'start', text: 'When a camera cannot be reached by the application at all, there is a page on this site that writes new software to it directly from your browser. It is the least elegant thing we have built and it has rescued more cameras than anything else we have built.' },
  { side: 'start', text: 'The mass market electronics business has settled on a shape, and the shape is this: sell the object at a thin margin, then rent the person back their own use of it, and make the next object incompatible so that the decision is made for them.' },
  { side: 'start', text: 'The reason it is shaped that way is that it works. It produces a larger number at the end of the year than the alternative does. We are not going to pretend we have found a clever way to beat that number, because we have not.' },
  { side: 'start', text: 'What we have found is that a smaller number, earned from people who intend to keep the thing they bought, is a number we can live behind. It is a smaller company than the other kind. It is a company we are willing to run.' },
  { side: 'end', text: 'So we publish the service manual. We sell the screws. We answer the question about the eight year old body with the same seriousness as the question about the one that shipped last week, because the person asking is the same person.' },
  { side: 'start', text: 'A serial number, to us, is a record in its own right. It outlives the order that bought it. You can register one, hand it on to someone else when you sell the camera, and the next owner gets a camera with a history rather than an orphan.' },
  { side: 'end', text: 'None of this is a moral position. It is a preference about what kind of object is worth making, held by a small number of people who would rather make that kind, and who would rather you did not have to sit at a kitchen table to keep one alive.' },
  { side: 'start', text: 'If you buy one, we will still be here when it breaks. That is the whole promise, and it is the only one on this page.' },
];
