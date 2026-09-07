export type Role = 'host' | 'guest';

export type EventState = 'draft' | 'published' | 'registration_closed' | 'cancelled';

export type RegistrationStatus =
  | 'pending_approval'
  | 'confirmed'
  | 'waitlisted'
  | 'declined'
  | 'cancelled_by_guest'
  | 'cancelled_by_host'
  | 'checked_in';

export interface Account {
  id: string;
  email: string;
  display_name: string;
  handle: string;
  role: Role;
}

export interface EventTheme {
  key: string;
  hue: number;
  ground: string;
  sunk: string;
  ink: string;
  inkRgb: string;
  secondary: string;
  hairline: string;
  panel: string;
  degraded: boolean;
}

export interface EventSummary {
  id: string;
  slug: string;
  title: string;
  category: string;
  city: string;
  time_zone: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  confirmed_count: number;
  remaining: number | null;
  state: EventState;
  theme_hex: string;
  cover_seed: string;
  calendar_slug: string | null;
  calendar_name: string | null;
  calendar_is_public: boolean | null;
  has_ended: boolean;
}

export interface MyRegistrationOnEvent {
  id: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
}

export interface EventDetail extends EventSummary {
  description: string;
  approval_required: boolean;
  waitlist_enabled: boolean;
  cancel_reason: string | null;
  cancelled_at: string | null;
  published_at: string | null;
  is_owner: boolean;
  theme: EventTheme;
  my_registration: MyRegistrationOnEvent | null;
  promoted_count?: number;
}

export interface Registration {
  id: string;
  event_id: string;
  account_id: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  created_at: string;
  event_slug?: string;
  title?: string;
  starts_at?: string;
  ends_at?: string;
  time_zone?: string;
  city?: string;
  theme_hex?: string;
  cover_seed?: string;
  event_state?: EventState;
  moved_to_waitlist?: boolean;
  already_checked_in?: boolean;
}

export interface GuestRow {
  id: string;
  account_id: string;
  email: string;
  display_name: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  created_at: string;
}

export interface Calendar {
  id: string;
  owner_account_id: string;
  name: string;
  slug: string;
  category: string;
  city: string;
  is_public: boolean;
  published_count: number;
  event_count: number;
}

export interface CalendarPage {
  id: string;
  name: string;
  slug: string;
  category: string;
  city: string;
  is_public: boolean;
  owner_name: string;
  owner_handle: string;
  events: EventSummary[];
}

export interface CategoryPage {
  category: string;
  event_count: number;
  calendar_count: number;
  events: EventSummary[];
  calendars: Calendar[];
}

export interface ProfilePage {
  id: string;
  display_name: string;
  handle: string;
  role: Role;
  created_at: string;
  calendars: Calendar[];
}

export interface TicketView {
  id: string;
  status: RegistrationStatus;
  ticket_code: string;
  checked_in_at: string | null;
  event_slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  city: string;
  theme_hex: string;
  cover_seed: string;
  event_state: EventState;
  display_name: string;
  theme: EventTheme;
}

export interface ResolveResult {
  kind: 'system' | 'category' | 'event' | 'calendar' | 'account';
  slug: string;
}

export interface ApiRefusal {
  message: string;
  field: string | null;
  status: number;
}

export const CATEGORIES = [
  'family',
  'books',
  'games',
  'tech',
  'food-and-drink',
  'ai',
  'running',
  'arts-and-culture',
  'climate',
  'fitness',
  'wellness',
  'crypto',
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  family: 'Family',
  books: 'Books',
  games: 'Games',
  tech: 'Tech',
  'food-and-drink': 'Food and Drink',
  ai: 'AI',
  running: 'Running',
  'arts-and-culture': 'Arts and Culture',
  climate: 'Climate',
  fitness: 'Fitness',
  wellness: 'Wellness',
  crypto: 'Crypto',
};

export const CATEGORY_HUES: Record<string, string> = {
  family: '#f31a7c',
  books: '#ab46dd',
  games: '#146aeb',
  tech: '#007aff',
  'food-and-drink': '#d69712',
  ai: '#ab46dd',
  running: '#3cbd2c',
  'arts-and-culture': '#f31a7c',
  climate: '#28cd41',
  fitness: '#146aeb',
  wellness: '#3cbd2c',
  crypto: '#d69712',
};

export const CATEGORY_BLURB: Record<string, string> = {
  family: 'Afternoons that work for grown-ups and small people at the same time.',
  books: 'Reading nights, swaps and long conversations about one short novel.',
  games: 'Board nights, tournaments and the kind of evening that runs late.',
  tech: 'Talks, demos and workshops from people building things nearby.',
  'food-and-drink': 'Tastings, suppers and markets worth crossing town for.',
  ai: 'Study groups and demo nights for people teaching machines to notice.',
  running: 'Club runs, track sessions and easy loops at every pace.',
  'arts-and-culture': 'Openings, readings and evenings in rooms full of work.',
  climate: 'Repair cafés, clean-ups and the practical end of a large problem.',
  fitness: 'Classes, circuits and mornings that start before the coffee.',
  wellness: 'Slow rooms, breathing, and an hour that is only yours.',
  crypto: 'Meetups for people arguing about ledgers in good faith.',
};

export function statusLabel(status: RegistrationStatus): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmed';
    case 'checked_in':
      return 'Checked In';
    case 'waitlisted':
      return 'Waitlisted';
    case 'pending_approval':
      return 'Pending Approval';
    case 'declined':
      return 'Declined';
    case 'cancelled_by_guest':
      return 'Cancelled';
    case 'cancelled_by_host':
      return 'Cancelled By Host';
  }
}

export function statusTone(status: RegistrationStatus): string {
  switch (status) {
    case 'confirmed':
    case 'checked_in':
      return 'pill-success';
    case 'waitlisted':
    case 'pending_approval':
      return 'pill-warning';
    case 'declined':
    case 'cancelled_by_guest':
    case 'cancelled_by_host':
      return 'pill-danger';
  }
}

export function eventStateLabel(state: EventState): string {
  switch (state) {
    case 'draft':
      return 'Draft';
    case 'published':
      return 'Published';
    case 'registration_closed':
      return 'Registration Closed';
    case 'cancelled':
      return 'Cancelled';
  }
}

export function eventStateTone(state: EventState): string {
  switch (state) {
    case 'published':
      return 'pill-success';
    case 'registration_closed':
      return 'pill-warning';
    case 'cancelled':
      return 'pill-danger';
    case 'draft':
      return 'pill-neutral';
  }
}
