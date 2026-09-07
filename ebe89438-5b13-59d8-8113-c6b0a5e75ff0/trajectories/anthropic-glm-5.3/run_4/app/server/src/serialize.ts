import type { Context } from 'hono';
import { config } from './config.js';
import type { Account, Calendar, EventRow, Registration } from './db.js';

export function isoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export function accountJson(a: Account) {
  return {
    id: a.id,
    email: a.email,
    display_name: a.display_name,
    handle: a.handle,
    role: a.role,
    created_at: isoOrNull(a.created_at),
  };
}

export function calendarJson(c: Calendar) {
  return {
    id: c.id,
    owner_account_id: c.owner_account_id,
    name: c.name,
    slug: c.slug,
    category: c.category,
    city: c.city,
    is_public: c.is_public,
    created_at: isoOrNull(c.created_at),
  };
}

export type EventJson = ReturnType<typeof eventJson>;

export function eventJson(e: EventRow, seats: number, calendar?: Calendar) {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    category: e.category,
    city: e.city,
    time_zone: e.time_zone,
    cover_seed: e.cover_seed,
    theme_hex: e.theme_hex,
    description: e.description,
    starts_at: e.starts_at.toISOString(),
    ends_at: e.ends_at.toISOString(),
    capacity: e.capacity,
    approval_required: e.approval_required,
    waitlist_enabled: e.waitlist_enabled,
    state: e.state,
    published_at: isoOrNull(e.published_at),
    cancelled_at: isoOrNull(e.cancelled_at),
    cancel_reason: e.cancel_reason,
    confirmed_count: seats,
    remaining: Math.max(0, e.capacity - seats),
    calendar: calendar
      ? { slug: calendar.slug, name: calendar.name, category: calendar.category, city: calendar.city, owner_account_id: calendar.owner_account_id }
      : undefined,
    has_ended: e.ends_at.getTime() < Date.now(),
    created_at: isoOrNull(e.created_at),
    updated_at: isoOrNull(e.updated_at),
  };
}

export function registrationJson(r: Registration, account?: Pick<Account, 'email' | 'display_name'>) {
  return {
    id: r.id,
    event_id: r.event_id,
    account_id: r.account_id,
    status: r.status,
    waitlist_position: r.waitlist_position,
    ticket_code: r.ticket_code,
    checked_in_at: isoOrNull(r.checked_in_at),
    created_at: isoOrNull(r.created_at),
    email: account?.email,
    display_name: account?.display_name,
  };
}

export function publicUrl(c: Context, path = ''): string {
  const base = config.publicUrl || `${new URL(c.req.url).origin}`;
  return `${base.replace(/\/$/, '')}${path}`;
}

