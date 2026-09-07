import type { EventRow, RegistrationRow } from './domain.js';
import { iso } from './util.js';

export interface EventPublic {
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
  state: string;
  theme_hex: string;
  cover_seed: string;
  has_ended: boolean;
  calendar_slug?: string;
  calendar_name?: string;
  is_public?: boolean;
}

export function eventJson(
  e: EventRow & { calendar_slug?: string; calendar_name?: string; is_public?: boolean },
  confirmed: number,
  opts: { full?: boolean } = {},
) {
  const remaining = e.capacity === null ? null : Math.max(0, e.capacity - confirmed);
  const base: Record<string, unknown> = {
    id: e.id,
    slug: e.slug,
    title: e.title,
    category: e.category,
    city: e.city,
    location: e.location,
    time_zone: e.time_zone,
    starts_at: iso(e.starts_at),
    ends_at: iso(e.ends_at),
    capacity: e.capacity,
    confirmed_count: confirmed,
    remaining,
    state: e.state,
    theme_hex: e.theme_hex,
    cover_seed: e.cover_seed,
    has_ended: e.ends_at ? e.ends_at.getTime() < Date.now() : false,
    calendar_slug: e.calendar_slug,
    calendar_name: e.calendar_name,
    calendar_is_public: e.is_public,
  };
  if (opts.full) {
    base['description'] = e.description;
    base['approval_required'] = e.approval_required;
    base['waitlist_enabled'] = e.waitlist_enabled;
    base['published_at'] = iso(e.published_at);
    base['cancelled_at'] = iso(e.cancelled_at);
    base['cancel_reason'] = e.cancel_reason;
    base['created_at'] = iso(e.created_at);
    base['updated_at'] = iso(e.updated_at);
  }
  return base;
}

export function registrationJson(r: RegistrationRow, extra: Record<string, unknown> = {}) {
  return {
    id: r.id,
    event_id: r.event_id,
    account_id: r.account_id,
    status: r.status,
    waitlist_position: r.waitlist_position,
    ticket_code: r.ticket_code,
    checked_in_at: iso(r.checked_in_at),
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
    ...extra,
  };
}
