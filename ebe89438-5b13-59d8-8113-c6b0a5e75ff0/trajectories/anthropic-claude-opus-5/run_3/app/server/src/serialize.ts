import type { EventRow, RegistrationRow } from './registrations.js';
import { deriveTheme } from './theme.js';

export function iso(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const d = typeof v === 'string' ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type EventView = Record<string, unknown>;

export function eventSummary(
  e: EventRow & { confirmed_count?: number | string },
  extra: Record<string, unknown> = {}
): EventView {
  const confirmed = Number(e.confirmed_count ?? 0);
  const capacity = e.capacity ?? null;
  return {
    id: String(e.id),
    slug: e.slug,
    title: e.title,
    category: e.category,
    city: e.city,
    time_zone: e.time_zone,
    starts_at: iso(e.starts_at),
    ends_at: iso(e.ends_at),
    capacity,
    confirmed_count: confirmed,
    remaining: capacity === null ? null : Math.max(0, capacity - confirmed),
    state: e.state,
    theme_hex: e.theme_hex,
    cover_seed: e.cover_seed,
    has_ended: e.ends_at ? new Date(e.ends_at).getTime() < Date.now() : false,
    ...extra,
  };
}

export function eventDetail(
  e: EventRow & { confirmed_count?: number | string },
  extra: Record<string, unknown> = {}
): EventView {
  return eventSummary(e, {
    description: e.description,
    location: e.location,
    approval_required: e.approval_required,
    waitlist_enabled: e.waitlist_enabled,
    published_at: iso(e.published_at),
    cancelled_at: iso(e.cancelled_at),
    cancel_reason: e.cancel_reason,
    created_at: iso(e.created_at),
    updated_at: iso(e.updated_at),
    calendar: e.calendar_slug
      ? {
          slug: e.calendar_slug,
          name: e.calendar_name,
          is_public: e.calendar_is_public ?? true,
        }
      : undefined,
    theme: deriveTheme(e.theme_hex),
    ...extra,
  });
}

export function registrationView(r: RegistrationRow, extra: Record<string, unknown> = {}) {
  return {
    id: String(r.id),
    event_id: String(r.event_id),
    account_id: String(r.account_id),
    status: r.status,
    waitlist_position: r.waitlist_position,
    ticket_code: r.ticket_code,
    checked_in_at: iso(r.checked_in_at),
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
    ...extra,
  };
}
