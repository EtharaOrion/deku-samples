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

export interface MyRegistration {
  id: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at?: string | null;
}

export interface EventSummary {
  id: string;
  slug: string;
  title: string;
  category: string;
  city: string;
  time_zone: string;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
  confirmed_count: number;
  remaining: number | null;
  state: EventState;
  theme_hex: string;
  cover_seed: string;
  has_ended?: boolean;
}

export interface EventDetail extends EventSummary {
  description: string;
  approval_required: boolean;
  waitlist_enabled: boolean;
  waitlist_count: number;
  pending_count: number;
  checked_in_count: number;
  cancel_reason: string | null;
  published_at: string | null;
  cancelled_at: string | null;
  calendar: { name: string; slug: string; is_public: boolean; owner_handle?: string };
  is_owner: boolean;
  my_registration: MyRegistration | null;
  promoted_from_waitlist?: number;
}

export interface Calendar {
  id: string;
  owner_account_id: string;
  name: string;
  slug: string;
  category: string;
  city: string;
  is_public: boolean;
  created_at: string;
  published_event_count: number;
  event_count: number;
}

export interface CalendarSummary {
  name: string;
  slug: string;
  category: string;
  city: string;
  is_public: boolean;
  published_event_count: number;
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

export interface MyRegistrationRow {
  id: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  created_at: string;
  event_slug: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  time_zone: string;
  city: string;
  theme_hex: string;
  cover_seed: string;
  event_state: EventState;
  cancel_reason: string | null;
}

export interface Ticket {
  id: string;
  status: RegistrationStatus;
  ticket_code: string;
  checked_in_at: string | null;
  waitlist_position: number | null;
  event_slug: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  time_zone: string;
  city: string;
  theme_hex: string;
  cover_seed: string;
  event_state: EventState;
  guest_display_name: string;
}

export interface ResolveResult {
  kind: 'system' | 'category' | 'event' | 'calendar' | 'account';
  slug: string;
}

export interface CategoryPage {
  name: string;
  event_count: number;
  calendar_count: number;
  events: EventSummary[];
  calendars: CalendarSummary[];
}

export interface PublicAccount {
  id: string;
  display_name: string;
  handle: string;
  role: Role;
  created_at: string;
  calendars: CalendarSummary[];
}

export interface CalendarPage extends Calendar {
  owner_handle: string;
  owner_display_name: string;
  is_owner: boolean;
  events: EventSummary[];
}

export interface Refusal {
  message: string;
  field?: string;
  status: number;
  [key: string]: unknown;
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

export const CATEGORY_SENTENCES: Record<string, string> = {
  family: 'Afternoons and mornings built for every age at once, from the smallest to the oldest.',
  books: 'Reading nights, swaps and long quiet tables where the first hour belongs to the page.',
  games: 'Board nights, tournaments and the kind of table that fills an evening without noticing.',
  tech: 'Talks, workshops and demo nights from people building the thing they are describing.',
  'food-and-drink': 'Suppers, tastings and market mornings where the point is the table, not the menu.',
  ai: 'Reading groups, paper nights and hands-on sessions around what these machines actually do.',
  running: 'Club runs, track sessions and long weekend routes at every pace, nobody left behind.',
  'arts-and-culture': 'Openings, readings and studio evenings from the people who made the work.',
  climate: 'Repair cafes, planting mornings and the practical end of a very large subject.',
  fitness: 'Sessions, circuits and the sort of hour that is easier with other people in the room.',
  wellness: 'Slow mornings, breath work and the quiet end of looking after yourself.',
  crypto: 'Meetups and workshops for the protocol end of things, without the price talk.',
};

export const CATEGORY_HUES: Record<string, string> = {
  family: '#f31a7c',
  books: '#d69712',
  games: '#ab46dd',
  tech: '#146aeb',
  'food-and-drink': '#d69712',
  ai: '#ab46dd',
  running: '#3cbd2c',
  'arts-and-culture': '#f31a7c',
  climate: '#3cbd2c',
  fitness: '#146aeb',
  wellness: '#ab46dd',
  crypto: '#d69712',
};

export const STATUS_WORDS: Record<RegistrationStatus, string> = {
  pending_approval: 'Awaiting Approval',
  confirmed: 'Confirmed',
  waitlisted: 'Waiting List',
  declined: 'Declined',
  cancelled_by_guest: 'Cancelled',
  cancelled_by_host: 'Cancelled By Host',
  checked_in: 'Checked In',
};

export const STATUS_TONES: Record<RegistrationStatus, string> = {
  pending_approval: 'pill-warning',
  confirmed: 'pill-success',
  waitlisted: 'pill-warning',
  declined: 'pill-danger',
  cancelled_by_guest: 'pill-danger',
  cancelled_by_host: 'pill-danger',
  checked_in: 'pill-success',
};

export const EVENT_STATE_WORDS: Record<EventState, string> = {
  draft: 'Draft',
  published: 'Published',
  registration_closed: 'Registration Closed',
  cancelled: 'Cancelled',
};

export const EVENT_STATE_TONES: Record<EventState, string> = {
  draft: '',
  published: 'pill-success',
  registration_closed: 'pill-info',
  cancelled: 'pill-danger',
};
