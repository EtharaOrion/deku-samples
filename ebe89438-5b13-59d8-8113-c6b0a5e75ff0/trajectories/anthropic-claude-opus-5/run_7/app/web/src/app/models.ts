export type Role = 'host' | 'guest';

export type EventState = 'draft' | 'published' | 'registration_closed' | 'cancelled';

export type RegStatus =
  | 'pending_approval' | 'confirmed' | 'waitlisted' | 'declined'
  | 'cancelled_by_guest' | 'cancelled_by_host' | 'checked_in';

export interface EventTheme {
  key: string;
  ground: string;
  groundSunk: string;
  ink: string;
  inkSecondary: string;
  hairline: string;
  panel: string;
  tooPale: boolean;
}

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
  time_zone: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  confirmed_count: number;
  remaining: number | null;
  state: EventState;
  theme_hex: string;
  cover_seed: string;
  theme: EventTheme;
  has_ended: boolean;
  calendar_slug: string;
  calendar_name: string;
  calendar_is_public: boolean;
}

export interface EventDetail extends EventSummary {
  description: string;
  approval_required: boolean;
  waitlist_enabled: boolean;
  published_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  my_registration: Registration | null;
  is_owner: boolean;
  promoted_count?: number;
}

export interface Registration {
  id: number;
  event_id: number;
  account_id: number;
  status: RegStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  created_at: string | null;
  moved_to_waitlist?: boolean;
}

export interface MyRegistration extends Registration {
  event_slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  theme_hex: string;
  cover_seed: string;
  city: string;
  event_state: EventState;
  has_ended: boolean;
}

export interface GuestRow {
  id: number;
  account_id: number;
  email: string;
  display_name: string;
  status: RegStatus;
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
  published_count: number;
  created_at: string;
}

export interface CalendarPage extends Omit<Calendar, 'published_count' | 'created_at' | 'owner_account_id'> {
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
  status: RegStatus;
  ticket_code: string;
  checked_in_at: string | null;
  display_name: string;
  theme_hex: string;
  theme: EventTheme;
  cover_seed: string;
  event_state: EventState;
  calendar_name: string;
}

export interface CategoryCount {
  slug: string;
  event_count: number;
  calendar_count: number;
}

export interface PagedEvents {
  items: EventSummary[];
  total: number;
}

export const CATEGORIES = [
  'family', 'books', 'games', 'tech', 'food-and-drink', 'ai', 'running',
  'arts-and-culture', 'climate', 'fitness', 'wellness', 'crypto',
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  family: 'Family', books: 'Books', games: 'Games', tech: 'Tech',
  'food-and-drink': 'Food and Drink', ai: 'AI', running: 'Running',
  'arts-and-culture': 'Arts and Culture', climate: 'Climate',
  fitness: 'Fitness', wellness: 'Wellness', crypto: 'Crypto',
};

/** One sentence per category, for the category masthead. */
export const CATEGORY_BLURBS: Record<string, string> = {
  family: 'Afternoons and mornings built for every age at once.',
  books: 'Reading nights, swaps and long conversations about one chapter.',
  games: 'Board nights, tournaments and the kind of table that fills quickly.',
  tech: 'Talks, demos and workshops from people building things nearby.',
  'food-and-drink': 'Tastings, suppers and the shared table that follows them.',
  ai: 'Reading groups and build nights for people teaching machines to think.',
  running: 'Club runs, track sessions and the long slow miles at the weekend.',
  'arts-and-culture': 'Openings, readings and evenings spent looking properly.',
  climate: 'Repair cafés, planting days and the practical end of the problem.',
  fitness: 'Sessions that leave you tired in the way you were hoping for.',
  wellness: 'Quiet rooms, slow breathing and the hour you keep for yourself.',
  crypto: 'Meetups for people arguing about ledgers in good faith.',
};

/** The status word shown in a pill, and the hue role it carries. */
export function statusWord(status: RegStatus): string {
  switch (status) {
    case 'pending_approval': return 'Pending Approval';
    case 'confirmed': return 'Confirmed';
    case 'waitlisted': return 'Waitlisted';
    case 'declined': return 'Declined';
    case 'cancelled_by_guest': return 'Cancelled';
    case 'cancelled_by_host': return 'Cancelled By Host';
    case 'checked_in': return 'Checked In';
  }
}

export function statusPillClass(status: RegStatus): string {
  switch (status) {
    case 'confirmed':
    case 'checked_in': return 'pill pill-success';
    case 'pending_approval':
    case 'waitlisted': return 'pill pill-warning';
    case 'declined':
    case 'cancelled_by_guest':
    case 'cancelled_by_host': return 'pill pill-danger';
  }
}

export function eventStateWord(state: EventState): string {
  switch (state) {
    case 'draft': return 'Draft';
    case 'published': return 'Published';
    case 'registration_closed': return 'Registration Closed';
    case 'cancelled': return 'Cancelled';
  }
}

export function eventStatePillClass(state: EventState): string {
  switch (state) {
    case 'published': return 'pill pill-success';
    case 'registration_closed': return 'pill pill-warning';
    case 'cancelled': return 'pill pill-danger';
    case 'draft': return 'pill';
  }
}
