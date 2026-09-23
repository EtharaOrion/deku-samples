// Published copy, declared once. The public pages and the console read from here.

export const SITE_NAME = 'Ravel';

export const HOME = {
  headline: "Tomorrow's materials. Made from today's waste.",
  intro: 'Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.',
  loopLine: 'Nylon that goes on and on and on',
  technologyHeading: 'The power of green chemistry',
  closingHeading: "We're closing the loop",
  eyebrow: 'Recycled polyamide',
  loopBody:
    'A nylon chain can be taken apart and rebuilt without losing what makes it nylon. We dissolve the polymer, break it back to its monomer, purify that monomer and build the chain again, so the material leaves as pellet rather than as heat.',
  chemistryBody:
    'Green chemistry is a set of constraints rather than a slogan: mild set points, reagents chosen for recovery, and a boundary drawn wide enough that the answer is uncomfortable. Every stage below runs under a released recipe and is weighed in and out.',
  closingBody:
    'Closing the loop is an accounting claim before it is an environmental one. Waste enters as a weighed batch from an approved collector, becomes a credit in a balance period, and leaves as a certificate naming the lot, the claim type and the carbon figure that produced it. Losses are not hidden in the middle: they reduce what can be claimed at the end, and the plant diagram below states the mass at every stage.',
  feedstockCaption:
    'What arrives is mixed and contaminated, and is weighed and categorised before anything is claimed against it.',
  pelletsCaption:
    'Recycled granulate beside conventional granulate, photographed at the same scale under the same light.',
};

export const PRODUCT = {
  headline: 'Same material. Better origin.',
  intro:
    'We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise.',
  featureHeading: 'Nylon in any form',
  gradesHeading: 'Two grades, and what each one cannot do yet',
  gradesIntro:
    'Each grade below states its limitation before it states its claim, because a customer who finds the limitation later stops believing the claim.',
  industriesHeading: 'Where it goes',
  featuresHeading: 'What the material does',
  featuresIntro:
    'Three things the material does that a specification sheet alone will not tell you.',
  specificationHeading: 'The specification we ship against',
  grades: [
    {
      grade: 'Nylon 6',
      limitation:
        'Recycled Nylon 6 came almost entirely from one source, discarded fishing nets, and we still take only nylon-rich streams. A garment below roughly ninety per cent polyamide goes to a partner rather than to us, because our dissolution step cannot pay for the separation.',
      claim:
        'Within that limit the grade is a drop-in: released against the current specification, tested by the same methods, and sold with its recycled content stated as a mass-balance claim.',
    },
    {
      grade: 'Nylon 6,6',
      limitation:
        'Nylon 6,6 had no recycling solution at all, and we do not have one in production either. The 6,6 chain does not open under the depolymerisation recipe we run today, so nothing we ship is recycled 6,6.',
      claim:
        'What we sell today under this heading is virgin 6,6 bought in and stated as virgin. The recipe work is running at pilot scale, and we will publish a grade when a released lot exists rather than before.',
    },
  ],
  industries: [
    'textiles and apparel',
    'automotive',
    'electrical and electronics',
    'consumer goods',
    'industrial',
    'construction',
  ],
  features: [
    {
      heading: 'Nylon in any form',
      body:
        'Fibre, film, offcut, moulding or net: the dissolution step reads the polymer rather than the shape, so a fishing net and a carpet backing enter the same vessel and leave as the same intermediate.',
    },
    {
      heading: 'Released against one specification',
      body:
        'Every lot is tested against the guaranteed properties below on the same methods and released by somebody other than the analyst who ran the test, or the lot stays quarantined.',
    },
    {
      heading: 'A claim you can check',
      body:
        'Each certificate carries a number, and the number resolves on the public register for as long as the certificate exists, including after it has been withdrawn.',
    },
  ],
  virginReferenceLabel: 'Virgin reference',
  propertyColumns: ['Property', 'Method', 'Limit', 'Unit', 'Basis'],
};

export const TECHNOLOGY = {
  headline: 'The power of green chemistry',
  commercialRow: 'Commercial Plant (2030+)',
  commercialCapacity: '>25,000 tonnes per year',
  pilotRow: 'Pilot (2026)',
  pilotCapacity: '40 tonnes per year',
  demoRow: 'Demonstration (2026)',
  demoCapacity: '400 tonnes per year',
  intro:
    'Four stages take a mixed, weighed batch to a released pellet. Each one runs under a released recipe, is weighed in and weighed out, and reports the mass it did not pass on.',
  stagesHeading: 'Four stages',
  stagesIntro:
    'Each stage is a run type in the operational record. A run opens against a released recipe, records what it consumed and what it produced, and reports the difference as a loss rather than absorbing it.',
  capacityHeading: 'Capacity',
  capacityUnit: 'tonnes per year',
  capacityBasisLine: (basis: string) =>
    `Basis, and what a year means here: ${basis}. Availability and yield are already inside these figures, so they are deliverable tonnes rather than nameplate.`,
  attributesHeading: 'Five things this process is, and the evidence for three of them',
  stages: [
    {
      label: 'Dissolution',
      body:
        'The batch is taken into a solvent so that polyamide separates from dye, elastane, coating and dirt. The recipe releases at 165 °C and 3 bar and the run is refused if the achieved set point leaves the released window.',
    },
    {
      label: 'Depolymerisation',
      body:
        'The dissolved chain is cut back to its monomer over a catalyst at 210 °C and 1 bar. This is the step that makes the claim a material claim rather than a grinding claim: what leaves is monomer, not shortened polymer.',
    },
    {
      label: 'Purification',
      body:
        'The monomer is polished over activated carbon at 95 °C and 1 bar until it meets the inbound limit for repolymerisation. The fraction that cannot be polished leaves as a weighed byproduct with a stated disposition.',
    },
    {
      label: 'Repolymerisation',
      body:
        'The purified monomer is built back into chain at 255 °C under a chain regulator, and comes off as lot-numbered pellet at the viscosity the specification names.',
    },
  ],
  attributes: [
    {
      heading: 'Green chemicals & reagents',
      evidence:
        'The released recipes name every reagent: solvent S-12 and antioxidant AO-3 at dissolution, catalyst K-7 at depolymerisation, activated carbon at purification and chain regulator CR-1 at repolymerisation. No reagent enters a run that the recipe version does not name.',
    },
    {
      heading: 'Low temperature & pressure',
      evidence:
        'Dissolution runs at a set point of 165 °C and 3 bar under recipe RCP-DISS-2, and the hottest of the four stages is repolymerisation at 255 °C and 1 bar. Nothing in the process runs above 3 bar.',
    },
    {
      heading: 'Low carbon impact',
      evidence:
        'The current figure for LOT-N6-0001 is 4.26 kg CO2e per kg of pellet, cradle-to-gate, under carbon method version 2 with an uncertainty of 12.00 per cent. That is lower than the EcoBase 2025 virgin PA6 comparator for EU-27, which is the comparator the figure was computed against.',
    },
    {
      heading: 'Weighed at every boundary',
      evidence: null,
    },
    {
      heading: 'Claimed by mass balance, never by assertion',
      evidence: null,
    },
  ],
  diagramHeading: 'Mass in and mass out, by stage',
  diagramIntro:
    'The diagram is generated from the four run types and the masses recorded against them, so it changes when a stage changes.',
};

export const ABOUT = {
  factsHeading: 'The hard facts',
  factsIntro:
    'Three published figures, each carrying the source it came from, the year it describes and the geography it covers, so a reader can check it rather than take it.',
  headline: 'A materials company that publishes its own arithmetic',
  intro:
    'Ravel is a chemical recycling company in Lyon. We run a pilot line and a demonstration line, and we publish the figures those lines produce rather than the figures a brochure would prefer.',
  companyHeading: 'The company',
  companyBody:
    'Ravel Materials SAS was incorporated in France and operates two sites today, with a third consented. Everything the public pages state about capacity, recycled content and carbon is read from the operational record that the plant writes, through one arithmetic layer that no screen can write to.',
  sourceLabel: 'Source',
};

export const CAREERS = {
  whyHeading: 'Why this problem matters',
  headline: 'Work here',
  whyBody:
    'Nylon is the material a fishing net, an airbag and a carpet all have in common, and almost none of it comes back. Solving that is a chemistry problem, a logistics problem and an accounting problem at once, and the accounting is the part most people skip.',
  openHeading: 'Open positions',
  count: (n: number) =>
    n === 1 ? 'There is 1 open position.' : `There are ${n} open positions.`,
  closesLabel: 'Closes',
  applyLine: (title: string) => `Write to careers@example.com with ${title} in the subject line.`,
  empty: 'There are no open positions today.',
};

export const NEWS = {
  headline: 'News',
  intro:
    'Coverage of Ravel, listed once per event with the outlet that carried it. The tag is one of four terms: funding, partnership, technical or recognition.',
  frenchNote: 'Published in French',
  outletLabel: 'Outlet',
  empty: 'There is no coverage on the register yet.',
};

export const CONTACT = {
  headline: 'Contact',
  intro:
    'Four kinds of enquiry reach four different desks. Choosing the right one is the difference between an answer this week and an answer that never arrives.',
  routingHeading: 'Where each enquiry goes',
  formHeading: 'Send an enquiry',
  typePlaceholder: 'Choose a type',
  typeLabels: {
    waste_supply: 'Supplying waste',
    polymer_purchase: 'Buying polymer',
    partnership: 'Partnership',
    press: 'Press',
  } as Record<string, string>,
  destinationColumn: 'Goes to',
  responseColumn: 'Answered within',
  responseDays: (days: number) => (days === 1 ? '1 working day' : `${days} working days`),
  success: (reference: string, destination: string, days: number) =>
    `Your enquiry ${reference} was sent to ${destination}. You will hear back within ${days} ${days === 1 ? 'day' : 'days'}.`,
  failure: (detail: string, destination: string) =>
    `This enquiry was not sent: ${detail}. Nothing was recorded, so nothing was lost. Write to ${destination} directly and the same desk will answer.`,
  failureWord: 'Not sent',
  sendLabel: 'Send enquiry',
  sendingLabel: 'Sending …',
};

export const LOGIN = {
  headline: 'Sign in',
  intro:
    'The console is for Ravel staff and for auditors holding a grant. There is no signup, no password reset and no self-service account creation.',
  asideHeading: 'The operational record',
  asideBody:
    'Everything this console writes becomes an entry in an append-only record with a digest chain. Nothing is edited and nothing is removed.',
  emailLabel: 'Email',
  passwordLabel: 'Password',
  submitLabel: 'Sign in',
  submittingLabel: 'Signing in …',
  refusalWord: 'Refused',
  missingEmail: 'the email field was empty',
  missingPassword: 'the password field was empty',
  refusal: (detail: string) => `Sign-in was refused: ${detail}.`,
};

export const VERIFY = {
  headline: 'Certificate register',
  intro: 'A certificate number resolves here for as long as the certificate exists.',
  notFound: (number: string) => `No certificate with number ${number} is on the register.`,
  found: 'This number is on the register.',
  noForwarding:
    'This register states what this number says. It does not forward a reader to a replacement certificate.',
  numberLabel: 'Certificate number',
  stateLabel: 'State',
  issuedLabel: 'Issued on',
  siteLabel: 'Site',
  gradeLabel: 'Grade',
  claimTypeLabel: 'Claim type',
  recipientLabel: 'Recipient',
};

export const STATEMENTS = {
  massBalanceClaim: 'This material is claimed by mass balance. It is not physically segregated.',
  massBalanceProhibited: 'You may not state that this material physically contains recycled content.',
  withdrawn: (date: string, reason: string) => `This certificate was withdrawn on ${date}. Reason: ${reason}.`,
  nonClaimable: (missing: string) => `This batch cannot be claimed: ${missing}.`,
  collectorLapsed: (date: string) =>
    `This collector's approval lapsed on ${date}. Material received after that date is processed but not claimed.`,
  losses: 'Losses reduce the claim.',
  allocationRefused: (available_g: number, requested_g: number) =>
    `This allocation is refused. Available: ${available_g} g. Requested: ${requested_g} g.`,
  basisRefused: (lot: string, in_force: string, requested: string) =>
    `This allocation is refused. ${lot} already carries ${in_force} credit, and a lot resolves against one claim basis. Allocate ${requested} credit to a lot that carries none.`,
  overridden: (person: string, date: string) => `Separation overridden by ${person} on ${date}. This cannot be removed.`,
  periodClosed: 'This period is closed. Corrections require a restatement.',
  verifyRateLimited: 'Verification is limited to a few requests per minute. Try again shortly.',
  changeNotice: (n: number) => `This change may invalidate ${n} customer qualifications.`,
  verify: (number: string) => `Verify this certificate at ravel.example.com/verify/${number}.`,
};

export const PRIVACY = {
  headline: 'Privacy',
  controller: 'Ravel Materials SAS',
  postalAddress: '12 quai du Commerce, 69009 Lyon, France',
  privacyAddress: 'privacy@example.com',
  disclosureAddress: 'security@example.com',
  controllerHeading: 'Who holds this data',
  controllerBody: (controller: string, address: string) =>
    `${controller} is the controller of the personal data described on this page. Its registered address is ${address}.`,
  rightsHeading: 'Asking for a copy, a correction or an erasure',
  rightsBody: (address: string) =>
    `Write to ${address}. Say which of the purposes below your request concerns, and we will answer within one month.`,
  retentionHeading: 'How long each purpose is kept',
  retentionColumns: ['Purpose', 'Months'],
  recordHeading: 'The one thing we will not erase',
  recordBody:
    'The operational record names individuals. It records who booked a batch, who released a lot, who authorised an override and who signed a certificate. That record is retained under a legal and scheme obligation and is not erased on request, because a claim that cannot be traced to the person who made it is not a claim. A former employee\'s contact detail is erased on request; their acts in the record are not.',
  disclosureHeading: 'Reporting a vulnerability',
  disclosureBody: (address: string) =>
    `Write to ${address}. We will acknowledge within one working day and will not pursue a good-faith reporter.`,
  retention: [
    { purpose: 'Enquiries through the contact form', months: 24 },
    { purpose: 'Waste-supply enquiries and collector correspondence', months: 36 },
    { purpose: 'Polymer purchase enquiries and customer correspondence', months: 36 },
    { purpose: 'Press enquiries', months: 12 },
    { purpose: 'Accounts and the acts recorded against them', months: 120 },
    { purpose: 'The record', months: 180 },
  ],
};

export const VERIFY_HOST = 'ravel.example.com';
