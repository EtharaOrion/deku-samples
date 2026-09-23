/** A title and a description written for each route, declared once. */

import type { RouteId } from './routes';

interface RouteMeta {
  title: string;
  description: string;
  noindex: boolean;
}

const META: Record<RouteId, RouteMeta> = {
  home: {
    title: 'Ravel — low-carbon recycled nylon, claimed by mass balance',
    description:
      'Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon. Every claim is traced from a weighed batch to a signed certificate.',
    noindex: false,
  },
  product: {
    title: 'Product — recycled Nylon 6 and 6,6 | Ravel',
    description:
      'Two grades and what each one cannot do yet, six industries, the current Nylon 6 specification and the recycled-content claim beside the grade it applies to.',
    noindex: false,
  },
  technology: {
    title: 'Technology — dissolution to repolymerisation | Ravel',
    description:
      'Four process stages with the mass recorded in and out of each, a capacity table with its basis and its definition of a year, and the evidence behind three claims.',
    noindex: false,
  },
  about: {
    title: 'About — the hard facts | Ravel',
    description:
      'Three published statistics, each with its source, its year and its geography beside it, and what Ravel Materials SAS actually operates today.',
    noindex: false,
  },
  careers: {
    title: 'Careers — open positions at Ravel',
    description:
      'Why recycling nylon is a chemistry, logistics and accounting problem at once, and the positions open in Lyon right now.',
    noindex: false,
  },
  news: {
    title: 'News — coverage of Ravel',
    description:
      'Coverage of Ravel listed once per event, each item with its outlet, its date, its link and the language it was published in.',
    noindex: false,
  },
  contact: {
    title: 'Contact — four enquiry desks | Ravel',
    description:
      'Waste supply, polymer purchase, partnership and press each reach a different desk with a stated response time.',
    noindex: false,
  },
  privacy: {
    title: 'Privacy — what Ravel keeps and for how long',
    description:
      'The controller, the address for a rights request, a retention period in months for every purpose, and the one record that is not erased on request.',
    noindex: false,
  },
  verify: {
    title: 'Verify a certificate | Ravel',
    description:
      'A Ravel certificate number resolves here, including after the certificate has been withdrawn.',
    noindex: true,
  },
  login: {
    title: 'Sign in | Ravel',
    description: 'The Ravel console for staff and for auditors holding a grant.',
    noindex: true,
  },
  console: {
    title: 'Console | Ravel',
    description: 'The Ravel operational console.',
    noindex: true,
  },
};

export function metaFor(route: RouteId): RouteMeta {
  return META[route];
}
