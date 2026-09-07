export type Role = 'host' | 'guest';

export type Account = {
  id: string;
  email: string;
  display_name: string;
  handle: string;
  role: Role;
};

export type EventState = 'draft' | 'published' | 'registration_closed' | 'cancelled';

export type RegistrationStatus =
  | 'pending_approval'
  | 'confirmed'
  | 'waitlisted'
  | 'declined'
  | 'cancelled_by_guest'
  | 'cancelled_by_host'
  | 'checked_in';

export type ThemeTokens = {
  theme_hex: string;
  ground: string;
  ground_sunk: string;
  ink: string;
  ink_secondary: string;
  hairline: string;
  panel: string;
  accent: string;
  too_pale: boolean;
};

export type EventSummary = {
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
  has_ended: boolean;
};

export type Registration = {
  id: string;
  event_id: string;
  account_id: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  created_at: string;
  updated_at: string;
  event?: EventSummary & { location?: string };
  promoted_registration_id?: string | null;
  moved_to_waitlist?: boolean;
  already_checked_in?: boolean;
  title?: string;
  event_slug?: string;
};

export type EventDetail = EventSummary & {
  description: string;
  location: string;
  approval_required: boolean;
  waitlist_enabled: boolean;
  published_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  calendar?: { slug: string; name: string; is_public: boolean };
  theme: ThemeTokens;
  is_owner: boolean;
  my_registration: Registration | null;
  promoted_count?: number;
  notified_count?: number;
};

export type GuestRow = {
  id: string;
  account_id: string;
  email: string;
  display_name: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
};

export type Calendar = {
  id: string;
  name: string;
  slug: string;
  category: string;
  city: string;
  is_public: boolean;
  owner_account_id: string;
  created_at?: string;
  published_count?: number;
  event_count?: number;
};

export type Ticket = {
  id: string;
  status: RegistrationStatus;
  ticket_code: string;
  checked_in_at: string | null;
  event_slug: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  time_zone: string;
  city: string;
  location: string;
  theme_hex: string;
  cover_seed: string;
  event_state: EventState;
};

export type CategoryCount = {
  slug: string;
  event_count: number;
  calendar_count: number;
};

export type ResolveResult = {
  kind: 'system' | 'category' | 'event' | 'calendar' | 'account';
  slug: string;
};

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

export const CATEGORY_BLURBS: Record<string, string> = {
  family: 'Afternoons that work for every age in the house, from toddlers to grandparents.',
  books: 'Reading nights, swaps and launches for people who finish what they start.',
  games: 'Board nights, tournaments and long campaigns around one table.',
  tech: 'Talks, demos and workshops from the people actually building the thing.',
  'food-and-drink': 'Tastings, suppers and markets, always with something worth queueing for.',
  ai: 'Reading groups and build nights for the models and the people prompting them.',
  running: 'Club runs, track sessions and time trials at every pace you can hold.',
  'arts-and-culture': 'Openings, readings and studio nights across the city.',
  climate: 'Repair cafes, clean-ups and the talks that turn worry into a plan.',
  fitness: 'Classes and training sessions that meet you where your week left you.',
  wellness: 'Slow mornings, breath work and the quiet end of the calendar.',
  crypto: 'Meetups for the protocol curious, minus the price talk.',
};

/** Registration state is carried as words in a pill, never by colour alone. */
export const STATUS_WORDS: Record<RegistrationStatus, string> = {
  pending_approval: 'Pending Approval',
  confirmed: 'Confirmed',
  waitlisted: 'Waitlisted',
  declined: 'Declined',
  cancelled_by_guest: 'Cancelled',
  cancelled_by_host: 'Cancelled by Host',
  checked_in: 'Checked In',
};

export const STATUS_TONE: Record<RegistrationStatus, 'success' | 'warning' | 'danger' | 'info'> = {
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
