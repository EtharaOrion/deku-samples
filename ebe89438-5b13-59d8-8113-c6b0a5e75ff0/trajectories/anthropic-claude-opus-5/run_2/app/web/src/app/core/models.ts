export type Role = 'host' | 'guest';

export type RegistrationStatus =
  | 'pending_approval'
  | 'confirmed'
  | 'waitlisted'
  | 'declined'
  | 'cancelled_by_guest'
  | 'cancelled_by_host'
  | 'checked_in';

export type EventState =
  | 'draft'
  | 'published'
  | 'registration_closed'
  | 'cancelled';

export interface Account {
  id: string;
  email: string;
  display_name: string;
  handle: string;
  role: Role;
}

export interface EventSummary {
  id?: string;
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

export interface MyRegistrationBrief {
  id: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at?: string | null;
}

export interface EventDetail extends EventSummary {
  description: string;
  approval_required: boolean;
  waitlist_enabled: boolean;
  published_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  calendar_name?: string;
  calendar_slug?: string;
  calendar_is_public?: boolean;
  is_owner?: boolean;
  my_registration?: MyRegistrationBrief | null;
  promoted_count?: number;
}

export interface Registration {
  id: string;
  event_id?: string;
  account_id?: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
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
}

export interface MyRegistration {
  id: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  event_slug: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  time_zone: string;
  city: string;
  theme_hex: string;
  cover_seed: string;
  event_state: EventState;
  has_ended: boolean;
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
  created_at: string;
}

export interface PublicCalendar {
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

export interface PublicProfile {
  display_name: string;
  handle: string;
  role: Role;
  created_at: string;
  calendars: { name: string; slug: string; category: string; city: string }[];
}

export interface CategorySummary {
  category: string;
  event_count: number;
  calendar_count: number;
  calendars: {
    name: string;
    slug: string;
    category: string;
    city: string;
    is_public: boolean;
    published_count: number;
  }[];
}

export interface Ticket {
  id: string;
  event_slug: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  time_zone: string;
  city: string;
  status: RegistrationStatus;
  ticket_code: string;
  checked_in_at: string | null;
  theme_hex: string;
  cover_seed: string;
  display_name: string;
  event_state: EventState;
}

export interface EventTheme {
  key: string;
  ground: string;
  sunk: string;
  ink: string;
  ink_secondary: string;
  hairline: string;
  panel: string;
  too_pale: boolean;
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
  family: 'Afternoons that work for every age in the house, from toddlers to grandparents.',
  books: 'Reading nights, swaps and slow arguments about the last chapter.',
  games: 'Board games on long tables and tournaments that run late.',
  tech: 'Talks, demos and workshops from people building things this month.',
  'food-and-drink': 'Suppers, tastings and the kind of cooking best done in company.',
  ai: 'Reading groups and build nights for people teaching machines to notice things.',
  running: 'Club runs, track sessions and long weekend miles at every pace.',
  'arts-and-culture': 'Openings, life drawing and evenings that end in a gallery.',
  climate: 'Repair cafes, planting days and the practical end of a warming world.',
  fitness: 'Strength sessions, circuits and mornings that start before work does.',
  wellness: 'Breathwork, yoga and hours deliberately set aside for quiet.',
  crypto: 'Meetups for people who read the whitepaper and had questions.',
};

export const STATUS_WORDS: Record<RegistrationStatus, string> = {
  pending_approval: 'Pending Approval',
  confirmed: 'Confirmed',
  waitlisted: 'Waitlisted',
  declined: 'Declined',
  cancelled_by_guest: 'Cancelled',
  cancelled_by_host: 'Cancelled By Host',
  checked_in: 'Checked In',
};

export type PillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const STATUS_TONES: Record<RegistrationStatus, PillTone> = {
  pending_approval: 'warning',
  confirmed: 'success',
  waitlisted: 'warning',
  declined: 'danger',
  cancelled_by_guest: 'danger',
  cancelled_by_host: 'danger',
  checked_in: 'success',
};

export const EVENT_STATE_WORDS: Record<EventState, string> = {
  draft: 'Draft',
  published: 'Published',
  registration_closed: 'Registration Closed',
  cancelled: 'Cancelled',
};

export const EVENT_STATE_TONES: Record<EventState, PillTone> = {
  draft: 'neutral',
  published: 'success',
  registration_closed: 'warning',
  cancelled: 'danger',
};
