import { toIso } from './shape.js';

export const EVENT_SELECT = `
  SELECT e.*, cal.slug AS calendar_slug, cal.name AS calendar_name,
         cal.is_public AS calendar_is_public, cal.owner_account_id,
         (SELECT count(*) FROM registrations r
           WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in'))::int AS confirmed_count
    FROM events e JOIN calendars cal ON cal.id = e.calendar_id`;

export type EventFull = any;

export function serializeEvent(e: EventFull, opts: { detail?: boolean; owner?: boolean } = {}) {
  const capacity = e.capacity === null ? null : Number(e.capacity);
  const confirmed = Number(e.confirmed_count ?? 0);
  const base: Record<string, unknown> = {
    id: Number(e.id),
    slug: e.slug,
    title: e.title,
    category: e.category,
    city: e.city,
    time_zone: e.time_zone,
    starts_at: toIso(e.starts_at),
    ends_at: toIso(e.ends_at),
    capacity,
    confirmed_count: confirmed,
    remaining: capacity === null ? null : Math.max(0, capacity - confirmed),
    state: e.state,
    theme_hex: e.theme_hex,
    cover_seed: e.cover_seed,
    calendar_slug: e.calendar_slug,
    calendar_name: e.calendar_name,
    calendar_is_public: e.calendar_is_public,
    has_ended: e.ends_at ? new Date(toIso(e.ends_at)!).getTime() < Date.now() : false,
  };
  if (opts.detail !== false) {
    base.description = e.description;
    base.approval_required = e.approval_required;
    base.waitlist_enabled = e.waitlist_enabled;
    base.published_at = toIso(e.published_at);
    base.cancelled_at = toIso(e.cancelled_at);
    base.cancel_reason = e.cancel_reason;
    base.waitlist_count = e.waitlist_count === undefined ? undefined : Number(e.waitlist_count);
  }
  if (opts.owner) base.is_owner = true;
  return base;
}

export function serializeRegistration(r: any) {
  return {
    id: Number(r.id),
    event_id: Number(r.event_id),
    account_id: Number(r.account_id),
    status: r.status,
    waitlist_position: r.waitlist_position === null ? null : Number(r.waitlist_position),
    ticket_code: r.ticket_code,
    checked_in_at: toIso(r.checked_in_at),
    created_at: toIso(r.created_at),
  };
}

export function serializeAccount(a: any) {
  return {
    id: Number(a.id),
    email: a.email,
    display_name: a.display_name,
    handle: a.handle,
    role: a.role,
    created_at: toIso(a.created_at),
  };
}

export function serializeCalendar(c: any) {
  return {
    id: Number(c.id),
    owner_account_id: Number(c.owner_account_id),
    name: c.name,
    slug: c.slug,
    category: c.category,
    city: c.city,
    is_public: c.is_public,
    published_event_count: c.published_event_count === undefined ? undefined : Number(c.published_event_count),
    created_at: toIso(c.created_at),
  };
}
