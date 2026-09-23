/** The route table and the shape of the data each route is rendered from. */

const PUBLIC_ROUTE_IDS = [
  'home',
  'product',
  'technology',
  'about',
  'careers',
  'news',
  'contact',
  'privacy',
] as const;

export type PublicRouteId = (typeof PUBLIC_ROUTE_IDS)[number];
export type RouteId = PublicRouteId | 'verify' | 'login' | 'console';

interface NavEntry {
  id: PublicRouteId;
  path: string;
  label: string;
}

export const NAV: readonly NavEntry[] = [
  { id: 'home', path: '/', label: 'Home' },
  { id: 'product', path: '/product', label: 'Product' },
  { id: 'technology', path: '/technology', label: 'Technology' },
  { id: 'about', path: '/about', label: 'About' },
  { id: 'careers', path: '/careers', label: 'Careers' },
  { id: 'news', path: '/news', label: 'News' },
  { id: 'contact', path: '/contact', label: 'Contact' },
];

/** One stage of the plant, generated from a run type and the masses recorded against it. */
export interface StageFlow {
  run_type: string;
  label: string;
  in_g: number;
  out_g: number;
  byproduct_g: number;
}

export interface SpecificationProperty {
  property: string;
  method: string;
  limit: string;
  unit: string;
  basis: string;
}

export interface SpecificationView {
  grade: string;
  version: string;
  issued_on: string;
  properties: SpecificationProperty[];
  virgin_reference: { reference: string; source: string; date: string };
}

export interface ClaimView {
  reference: string;
  claim: string;
  grade: string;
  claim_type: string;
  scheme: string;
  evidence: string;
  content_bp: number | null;
}

export interface StatisticView {
  key: string;
  value: string;
  source: string;
  year: string;
  geography: string;
}

export interface PositionView {
  reference: string;
  title: string;
  location: string;
  department: string;
  contract_type: string;
  closes_on: string;
  summary: string;
}

export interface NewsView {
  reference: string;
  title: string;
  tag: string;
  outlet: string;
  date: string;
  link: string;
  language: string;
}

export interface RoutingView {
  type: string;
  destination: string;
  response_days: number;
}

export interface CapacityView {
  site: string;
  line: string;
  statement: string;
  nameplate_kg: number;
  contracted_kg: number;
  confidence: string;
}

export interface VerifyView {
  found: boolean;
  number: string;
  state: string | null;
  issued_on: string | null;
  withdrawn_on: string | null;
  withdrawal_reason: string | null;
  site: string | null;
  grade: string | null;
  claim_type: string | null;
  recipient_name: string | null;
}

export interface Identity {
  email: string;
  name: string;
  roles: string[];
  sites: string[];
}

export type PageState =
  | { route: 'home'; data: { stages: StageFlow[] } }
  | { route: 'product'; data: { specification: SpecificationView | null; claims: ClaimView[] } }
  | {
      route: 'technology';
      data: { stages: StageFlow[]; capacity: CapacityView[]; capacity_basis: string };
    }
  | { route: 'about'; data: { statistics: StatisticView[] } }
  | { route: 'careers'; data: { positions: PositionView[] } }
  | { route: 'news'; data: { items: NewsView[] } }
  | { route: 'contact'; data: { routing: RoutingView[] } }
  | { route: 'privacy'; data: Record<string, never> }
  | { route: 'verify'; data: { answer: VerifyView } }
  | { route: 'login'; data: Record<string, never> }
  | { route: 'console'; data: { identity: Identity | null } };

const PUBLIC_PATHS: Record<PublicRouteId, string> = {
  home: '/',
  product: '/product',
  technology: '/technology',
  about: '/about',
  careers: '/careers',
  news: '/news',
  contact: '/contact',
  privacy: '/privacy',
};

const EMPTY_STATE: Record<RouteId, PageState> = {
  home: { route: 'home', data: { stages: [] } },
  product: { route: 'product', data: { specification: null, claims: [] } },
  technology: { route: 'technology', data: { stages: [], capacity: [], capacity_basis: '' } },
  about: { route: 'about', data: { statistics: [] } },
  careers: { route: 'careers', data: { positions: [] } },
  news: { route: 'news', data: { items: [] } },
  contact: { route: 'contact', data: { routing: [] } },
  privacy: { route: 'privacy', data: {} },
  login: { route: 'login', data: {} },
  console: { route: 'console', data: { identity: null } },
  verify: {
    route: 'verify',
    data: {
      answer: {
        found: false,
        number: '',
        state: null,
        issued_on: null,
        withdrawn_on: null,
        withdrawal_reason: null,
        site: null,
        grade: null,
        claim_type: null,
        recipient_name: null,
      },
    },
  },
};

function emptyState(route: RouteId): PageState {
  return EMPTY_STATE[route];
}

export function fallbackStateForPath(pathname: string): PageState {
  if (pathname.startsWith('/console')) return emptyState('console');
  if (pathname === '/login') return emptyState('login');
  if (pathname.startsWith('/verify/')) {
    const state = emptyState('verify');
    if (state.route === 'verify') {
      return {
        route: 'verify',
        data: { answer: { ...state.data.answer, number: decodeURIComponent(pathname.slice(8)) } },
      };
    }
  }
  for (const id of PUBLIC_ROUTE_IDS) {
    if (PUBLIC_PATHS[id] === pathname) return emptyState(id);
  }
  return emptyState('home');
}
