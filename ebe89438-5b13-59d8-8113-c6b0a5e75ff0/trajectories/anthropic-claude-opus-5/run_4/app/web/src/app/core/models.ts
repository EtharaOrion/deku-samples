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
  id: number;
  email: string;
  display_name: string;
  handle: string;
  role: Role;
}

export interface EventSummary {
  id: number;
  slug: string;
  title: string;
  category: string;
  city: string;
  location: string;
  time_zone: string;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
  confirmed_count: number;
  remaining: number | null;
  state: EventState;
  theme_hex: string;
  cover_seed: string;
  has_ended: boolean;
  calendar_slug?: string;
  calendar_name?: string;
  calendar_is_public?: boolean;
}

export interface EventDetail extends EventSummary {
  description: string;
  approval_required: boolean;
  waitlist_enabled: boolean;
  published_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  is_owner: boolean;
  my_registration: Registration | null;
  promoted_from_waitlist?: number;
}

export interface Registration {
  id: number;
  event_id: number;
  account_id: number;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  created_at: string;
  updated_at: string;
  message?: string;
  event_slug?: string;
  title?: string;
  starts_at?: string;
  ends_at?: string;
  time_zone?: string;
  city?: string;
  location?: string;
  theme_hex?: string;
  cover_seed?: string;
  event_state?: EventState;
  cancel_reason?: string | null;
  already_checked_in?: boolean;
}

export interface GuestRow {
  id: number;
  account_id: number;
  email: string;
  display_name: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
}

export interface Calendar {
  id: number;
  owner_account_id: number;
  name: string;
  slug: string;
  category: string;
  city: string;
  is_public: boolean;
  created_at: string;
  published_event_count?: number;
}

export interface CalendarPage extends Calendar {
  owner_name: string;
  owner_handle: string;
  events: EventSummary[];
}

export interface Ticket {
  id: number;
  event_slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  city: string;
  location: string;
  theme_hex: string;
  cover_seed: string;
  status: RegistrationStatus;
  ticket_code: string;
  checked_in_at: string | null;
  display_name: string;
  event_state: EventState;
}

export interface CategoryPage {
  slug: string;
  name: string;
  event_count: number;
  calendar_count: number;
  calendars: Calendar[];
}

export interface Profile {
  display_name: string;
  handle: string;
  role: Role;
  created_at: string;
  calendars: Calendar[];
}

export interface ApiRefusal {
  message: string;
  field?: string;
  limit?: number;
  confirmed_count?: number;
  state?: string;
  reason?: string;
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

export type CategoryName = (typeof CATEGORIES)[number];

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
  tech: '#48484a',
  'food-and-drink': '#d69712',
  ai: '#ab46dd',
  running: '#3cbd2c',
  'arts-and-culture': '#f31a7c',
  climate: '#3cbd2c',
  fitness: '#146aeb',
  wellness: '#ab46dd',
  crypto: '#d69712',
};

export const CATEGORY_BLURBS: Record<string, string> = {
  family: 'Afternoons that work for every age in the house, from the toddler to the grandparent.',
  books: 'Reading nights, launches and swaps, for people who finish books and people who do not.',
  games: 'Board nights, tournaments and long campaigns around one table.',
  tech: 'Talks, workshops and demo nights from the people building the thing.',
  'food-and-drink': 'Suppers, tastings and markets, where the point is the table.',
  ai: 'Reading groups, model nights and hands-on sessions with the tools of the moment.',
  running: 'Club runs, track sessions and time trials at every pace, in every weather.',
  'arts-and-culture': 'Openings, readings and rehearsals in rooms worth being in.',
  climate: 'Repair cafes, clean-ups and evenings about the work of the next decade.',
  fitness: 'Training that is easier with company, from the first session to the hundredth.',
  wellness: 'Slow mornings, breathing rooms and evenings that ask nothing of you.',
  crypto: 'Meetups and workshops for people building on open ledgers.',
};

export const STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending_approval: 'Awaiting Approval',
  confirmed: 'Confirmed',
  waitlisted: 'Waiting List',
  declined: 'Declined',
  cancelled_by_guest: 'Cancelled',
  cancelled_by_host: 'Cancelled By Host',
  checked_in: 'Checked In',
};

export const STATUS_TONE: Record<RegistrationStatus, string> = {
  pending_approval: 'pill-warning',
  confirmed: 'pill-success',
  waitlisted: 'pill-warning',
  declined: 'pill-danger',
  cancelled_by_guest: 'pill-danger',
  cancelled_by_host: 'pill-danger',
  checked_in: 'pill-success',
};

export const EVENT_STATE_LABELS: Record<EventState, string> = {
  draft: 'Draft',
  published: 'Published',
  registration_closed: 'Registration Closed',
  cancelled: 'Cancelled',
};

export const EVENT_STATE_TONE: Record<EventState, string> = {
  draft: 'pill-neutral',
  published: 'pill-success',
  registration_closed: 'pill-warning',
  cancelled: 'pill-danger',
};
