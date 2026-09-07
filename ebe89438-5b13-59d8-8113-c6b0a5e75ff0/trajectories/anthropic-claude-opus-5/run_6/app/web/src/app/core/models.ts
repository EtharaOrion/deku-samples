export type Role = 'host' | 'guest';

export type RegistrationStatus =
  | 'pending_approval' | 'confirmed' | 'waitlisted' | 'declined'
  | 'cancelled_by_guest' | 'cancelled_by_host' | 'checked_in';

export type EventState = 'draft' | 'published' | 'registration_closed' | 'cancelled';

export interface Account {
  id: number; email: string; display_name: string; handle: string; role: Role;
}

export interface EventSummary {
  id?: number;
  slug: string; title: string; category: string; city: string;
  time_zone: string; starts_at: string | null; ends_at: string | null;
  capacity: number | null; confirmed_count: number; remaining: number | null;
  state: EventState; theme_hex: string; cover_seed: string;
  calendar_slug?: string; calendar_name?: string; calendar_is_public?: boolean;
  has_ended?: boolean;
}

export interface EventDetail extends EventSummary {
  description: string;
  approval_required: boolean;
  waitlist_enabled: boolean;
  published_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  waitlist_count?: number;
  is_owner?: boolean;
  my_registration: Registration | null;
  promoted_count?: number;
}

export interface Registration {
  id: number; event_id: number; account_id: number;
  status: RegistrationStatus; waitlist_position: number | null;
  ticket_code: string | null; checked_in_at: string | null; created_at?: string;
  moved_to_waitlist?: boolean;
}

export interface MyRegistration extends Registration {
  event_slug: string; title: string; starts_at: string | null; ends_at: string | null;
  time_zone: string; city: string; theme_hex: string; cover_seed: string;
  event_state: EventState;
}

export interface GuestRow {
  id: number; account_id: number; email: string; display_name: string;
  status: RegistrationStatus; waitlist_position: number | null;
  ticket_code: string | null; checked_in_at: string | null;
}

export interface Calendar {
  id: number; owner_account_id: number; name: string; slug: string;
  category: string; city: string; is_public: boolean;
  published_event_count?: number; owner_name?: string; owner_handle?: string;
}

export interface Ticket {
  id: number; status: RegistrationStatus; ticket_code: string;
  checked_in_at: string | null; event_slug: string; title: string;
  starts_at: string | null; ends_at: string | null; time_zone: string;
  city: string; theme_hex: string; cover_seed: string;
  event_state: EventState; calendar_name: string;
}

export interface ApiRefusal {
  message: string; code: string; field?: string;
  confirmed_count?: number; limit?: number;
}

export const CATEGORIES = [
  'family', 'books', 'games', 'tech', 'food-and-drink', 'ai',
  'running', 'arts-and-culture', 'climate', 'fitness', 'wellness', 'crypto',
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  family: 'Family', books: 'Books', games: 'Games', tech: 'Tech',
  'food-and-drink': 'Food and Drink', ai: 'AI', running: 'Running',
  'arts-and-culture': 'Arts and Culture', climate: 'Climate',
  fitness: 'Fitness', wellness: 'Wellness', crypto: 'Crypto',
};

export const CATEGORY_HUES: Record<string, string> = {
  family: '#f31a7c', books: '#146aeb', games: '#3cbd2c', tech: '#ab46dd',
  'food-and-drink': '#d69712', ai: '#007aff', running: '#28cd41',
  'arts-and-culture': '#ff3b30', climate: '#3cbd2c', fitness: '#146aeb',
  wellness: '#ab46dd', crypto: '#d69712',
};

export const CATEGORY_BLURB: Record<string, string> = {
  family: 'Afternoons that work for every age in the house.',
  books: 'Reading nights, swaps and long arguments about endings.',
  games: 'Board games, card nights and the occasional tournament.',
  tech: 'Talks, demos and the people building the next thing.',
  'food-and-drink': 'Tables laid, dishes shared and recipes handed over.',
  ai: 'Papers, prototypes and plain conversation about machines that learn.',
  running: 'Club runs, track sessions and the long slow miles.',
  'arts-and-culture': 'Openings, readings and rooms full of new work.',
  climate: 'Repair days, plantings and the practical end of the problem.',
  fitness: 'Sessions that leave you better than they found you.',
  wellness: 'Quiet rooms, slow breathing and time set aside.',
  crypto: 'Meetups for people building on open ledgers.',
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

export const STATUS_TONE: Record<RegistrationStatus, string> = {
  pending_approval: 'warning',
  confirmed: 'success',
  waitlisted: 'warning',
  declined: 'danger',
  cancelled_by_guest: 'danger',
  cancelled_by_host: 'danger',
  checked_in: 'success',
};
