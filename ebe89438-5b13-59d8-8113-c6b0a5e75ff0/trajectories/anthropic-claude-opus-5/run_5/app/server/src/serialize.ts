import type { EventRow, RegistrationRow } from './registrations.js';
import { deriveTheme } from './domain.js';

export interface EventPublic {
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
  state: string;
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
  theme: ReturnType<typeof deriveTheme>;
}

export interface EventJoined extends EventRow {
  calendar_slug: string;
  calendar_name: string;
  calendar_is_public: boolean;
  owner_account_id: number;
  confirmed_count?: number;
  waitlist_count?: number;
}

export function serializeEvent(e: EventJoined, counts: { confirmed: number; waitlisted: number }): EventPublic {
  const capacity = e.capacity;
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    category: e.category,
    city: e.city,
    time_zone: e.time_zone,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    capacity,
    confirmed_count: counts.confirmed,
    remaining: capacity === null ? null : Math.max(0, capacity - counts.confirmed),
    state: e.state,
    theme_hex: e.theme_hex,
    cover_seed: e.cover_seed,
    description: e.description,
    approval_required: e.approval_required,
    waitlist_enabled: e.waitlist_enabled,
    waitlist_count: counts.waitlisted,
    has_ended: e.ends_at ? new Date(e.ends_at).getTime() < Date.now() : false,
    cancel_reason: e.cancel_reason,
    published_at: e.published_at,
    calendar_slug: e.calendar_slug,
    calendar_name: e.calendar_name,
    calendar_is_public: e.calendar_is_public,
    theme: deriveTheme(e.theme_hex),
  };
}

export function serializeRegistration(r: RegistrationRow, extra: Record<string, unknown> = {}) {
  return {
    id: r.id,
    event_id: r.event_id,
    account_id: r.account_id,
    status: r.status,
    waitlist_position: r.waitlist_position,
    ticket_code: r.ticket_code,
    checked_in_at: r.checked_in_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    ...extra,
  };
}

export const EVENT_SELECT = `
  e.*, c.slug AS calendar_slug, c.name AS calendar_name,
  c.is_public AS calendar_is_public, c.owner_account_id AS owner_account_id
`;

export const EVENT_FROM = `FROM events e JOIN calendars c ON c.id = e.calendar_id`;
