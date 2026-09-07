export type Role = 'host' | 'guest';

export type Account = {
  id: string;
  email: string;
  display_name: string;
  handle: string;
  role: Role;
  access_token?: string;
};

export type EventState = 'draft' | 'published' | 'registration_closed' | 'cancelled';

export type CommunityEvent = {
  id: string;
  calendar_id: string;
  calendar_name: string | null;
  calendar_slug: string | null;
  title: string;
  slug: string;
  category: string;
  city: string;
  time_zone: string;
  cover_seed: string;
  theme_hex: string;
  description: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  approval_required: boolean;
  waitlist_enabled: boolean;
  state: EventState;
  cancel_reason: string | null;
  ended: boolean;
  confirmed_count: number;
  remaining: number;
  owner_account_id?: string;
};

export type RegistrationStatus =
  | 'pending_approval'
  | 'confirmed'
  | 'waitlisted'
  | 'declined'
  | 'cancelled_by_guest'
  | 'cancelled_by_host'
  | 'checked_in';

export type Registration = {
  id: string;
  event_id: string;
  event_slug: string | null;
  title: string | null;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  starts_at?: string;
  ends_at?: string;
  time_zone?: string;
  city?: string;
  event_state?: EventState;
  theme_hex?: string;
  cover_seed?: string;
  capacity?: number;
};

export type GuestListRow = {
  id: string;
  account_id: string;
  email: string;
  display_name: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at?: string | null;
};

export type Calendar = {
  id: string;
  owner_account_id: string;
  name: string;
  slug: string;
  category: string;
  city: string;
  is_public: boolean;
  published_count?: number;
};

export type Ticket = {
  id: string;
  event_slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  city: string;
  status: RegistrationStatus;
  ticket_code: string;
  checked_in_at: string | null;
  theme_hex: string;
  cover_seed: string;
  display_name: string;
  waitlist_position: number | null;
};

export type ApiError = { message: string; field?: string | null };
