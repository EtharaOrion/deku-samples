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

export interface EventTheme {
  key: string;
  ground: string;
  sunk: string;
  ink: string;
  inkSecondary: string;
  hairline: string;
  panel: string;
  themed: boolean;
}

export interface EventSummary {
  id: number;
  slug: string;
  title: string;
  category: string | null;
  city: string | null;
  time_zone: string;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
  confirmed_count: number;
  remaining: number | null;
  state: EventState;
  theme_hex: string;
  cover_seed: string;
  description: string;
  approval_required: boolean;
  waitlist_enabled: boolean;
  waitlist_count: number;
  has_ended: boolean;
  cancel_reason: string | null;
  published_at: string | null;
  calendar_slug: string;
  calendar_name: string;
  calendar_is_public: boolean;
  theme: EventTheme;
}

export interface MyRegistration {
  id: number;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
}

export interface EventDetail extends EventSummary {
  is_owner: boolean;
  my_registration: MyRegistration | null;
  promoted_from_waitlist?: number;
}

export interface Registration extends MyRegistration {
  event_id: number;
  account_id: number;
  event_slug?: string;
  moved_to_waitlist?: boolean;
  already_checked_in?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MyRegistrationRow extends Registration {
  event_slug: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  time_zone: string;
  city: string | null;
  event_state: EventState;
  theme_hex: string;
  cover_seed: string;
  capacity: number | null;
  cancel_reason: string | null;
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
  created_at: string;
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
  event_count?: number;
}

export interface CalendarPage extends Calendar {
  owner_name: string;
  owner_handle: string;
  is_owner: boolean;
  events: EventSummary[];
}

export interface CategoryPage {
  name: string;
  event_count: number;
  calendar_count: number;
  calendars: Array<Calendar & { published_event_count: number }>;
}

export interface TicketView {
  id: number;
  status: RegistrationStatus;
  ticket_code: string;
  checked_in_at: string | null;
  waitlist_position: number | null;
  event_slug: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  time_zone: string;
  city: string | null;
  theme_hex: string;
  cover_seed: string;
  event_state: EventState;
  cancel_reason: string | null;
  calendar_name: string;
  guest_name: string;
}

export interface AccountPage {
  id: number;
  display_name: string;
  handle: string;
  role: Role;
  created_at: string;
  calendars: Calendar[];
}

export interface LandingData {
  events: Array<
    Pick<
      EventSummary,
      'slug' | 'title' | 'category' | 'city' | 'time_zone' | 'starts_at' | 'theme_hex' | 'cover_seed' | 'state'
    >
  >;
  calendars: Array<Calendar & { published_event_count: number }>;
}

export interface ApiRefusal {
  message: string;
  field?: string;
  rate_limit?: number;
  retry_after_seconds?: number;
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

export type Category = (typeof CATEGORIES)[number];

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
  family: 'Afternoons that work for every age in the house, from park picnics to museum mornings.',
  books: 'Reading nights, launch parties and the long arguments about endings that follow them.',
  games: 'Board nights, tournaments and the kind of evening where somebody explains the rules twice.',
  tech: 'Meetups, demo nights and workshops for people who like to watch the thing actually run.',
  'food-and-drink': 'Suppers, tastings and market walks, hosted by people who cook for the room.',
  ai: 'Paper readings, build nights and honest conversations about what the models can and cannot do.',
  running: 'Club runs, track sessions and long weekend routes, at every pace and every distance.',
  'arts-and-culture': 'Openings, life drawing and gallery walks that end around somebody else kitchen table.',
  climate: 'Repair cafes, river cleanups and the local planning meetings that quietly decide things.',
  fitness: 'Circuits, lifting sessions and morning classes that ask nothing but that you turn up.',
  wellness: 'Sitting practice, breath work and the slow evenings that give a week its shape.',
  crypto: 'Protocol talks, builder nights and the meetups where the whiteboard fills up fast.',
};

export const RESERVED_PATHS = [
  'api',
  'app',
  'login',
  'signup',
  'home',
  'calendars',
  'create',
  'discover',
  'settings',
  'event',
  't',
] as const;

export const STATUS_WORDS: Record<RegistrationStatus, string> = {
  pending_approval: 'Pending',
  confirmed: 'Confirmed',
  waitlisted: 'Waitlisted',
  declined: 'Declined',
  cancelled_by_guest: 'Cancelled',
  cancelled_by_host: 'Cancelled',
  checked_in: 'Checked In',
};

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'pink';

export const STATUS_TONES: Record<RegistrationStatus, StatusTone> = {
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

export const EVENT_STATE_TONES: Record<EventState, StatusTone> = {
  draft: 'neutral',
  published: 'success',
  registration_closed: 'info',
  cancelled: 'danger',
};
