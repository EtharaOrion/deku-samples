export const LETTER_TITLE = "the table";
export const LETTER_DATE = "June 1, 2026";

export type Half = "left" | "right";

export type LetterParagraph = {
  text: string;
  half: Half;
  closing?: boolean;
};

/** The halves are authored, not computed: paragraphs four, five and six are the
 *  argument about mass-market electronics and sit on one side together. */
export const LETTER: LetterParagraph[] = [
  { text: "In our office, there is a table.", half: "left" },
  {
    text: "On the table sits all that we've ever made. There, hundreds of shapes, ideas, and fully built products all sit happily. Most of what is on our happy table, you have not yet seen.",
    half: "right",
  },
  {
    text: "The first items on the table were cameras. With a small team and factory we built webcams and sold many of them. In this process we learned that our joy comes from creating top electronics for demanding customers.",
    half: "left",
  },
  {
    text: "In some ways, it has never been a better time for electronics enthusiasts. Shopping from the same shelf, we access the same set of decent products for cheap.",
    half: "right",
  },
  {
    text: "In other ways, it is a worse time. Mass-market electronics have little differentiation. They are built to make the largest group just happy enough to buy.",
    half: "right",
  },
  {
    text: "Our customer is more demanding. They occupy the golden decile: the ten percent of people who want something of extreme difference that makes them maximum happy.",
    half: "right",
  },
  {
    text: "Today we announced that you can call us Vela Electronics Inc. We produce electronics for the few who demand a different look, feel, and function in every product. We know this customer; we are this customer.",
    half: "left",
  },
  { text: "To achieve our dreams, our company has 3 wishes:", half: "right" },
  {
    text: "First, we wish to work with the fewest and best. Our team of designers and engineers will remain small and the world's top, building electronics based only on the special feeling in our stomachs.",
    half: "left",
  },
  {
    text: "This wish extends to investors. We announced today we have sold stock in the company to our friends: the most interesting AI lab, a multinational electronics company, and storied capital institutions are now partners. Their guidance is a great aid to our business, though we have retained full creative control.",
    half: "right",
  },
  {
    text: "Our second wish is to empty our table. For too long, we have hidden in the laboratory. We hope our small team is prolific and releases many products. We do not believe in \u201cthe next big thing\u201d, we believe in many ideas giving shape over time.",
    half: "left",
  },
  {
    text: "To keep our table clear and our small team free, old products must make way for new. When a line grows old, we will sell the last of it, and then let it rest. Our cameras are old and will soon leave the shelf. But they will not leave you, we will service and support them for many years.",
    half: "left",
  },
  {
    text: "Finally, we wish to surprise. Little is expected of a small company like ours. What a gift that is. To be underestimated is to be free.",
    half: "right",
  },
  {
    text: "We will spend our freedom well: one hundred years from now, people may not remember our company. They will remember how a small thing on a table once made them feel.",
    half: "left",
  },
  {
    text: "The table is now set, our next product may even be resting on it.",
    half: "right",
  },
  { text: "See you soon.", half: "left", closing: true },
];

export const FOOTER_ENTRIES = [
  { label: "Shop", href: "/shop" },
  { label: "Support", href: null },
  { label: "Terms", href: null },
  { label: "Privacy", href: null },
  { label: "Jobs", href: null },
  { label: "Contact", href: null },
];
