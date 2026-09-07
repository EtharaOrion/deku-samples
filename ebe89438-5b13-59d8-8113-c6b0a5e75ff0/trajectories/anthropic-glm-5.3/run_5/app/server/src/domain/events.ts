import type { Tx } from '../db.js';
import { toRfc3339 } from '../time.js';

export type EventRow = {
  id: string;
  calendar_id: string;
  title: string;
  slug: string;
  category: string;
  city: string;
  time_zone: string;
  cover_seed: string;
  theme_hex: string;
  description: string;
  starts_at: Date;
  ends_at: Date;
  capacity: number;
  approval_required: boolean;
  waitlist_enabled: boolean;
  state: 'draft' | 'published' | 'registration_closed' | 'cancelled';
  published_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  created_at: Date;
  updated_at: Date;
  calendar_name?: string;
  calendar_slug?: string;
  owner_account_id?: string;
};

export const EVENT_LIST_FIELDS = `
  e.id, e.calendar_id, e.title, e.slug, e.category, e.city, e.time_zone, e.cover_seed,
  e.theme_hex, e.description, e.starts_at, e.ends_at, e.capacity, e.approval_required,
  e.waitlist_enabled, e.state, e.published_at, e.cancelled_at, e.cancel_reason,
  e.created_at, e.updated_at,
  c.name AS calendar_name, c.slug AS calendar_slug, c.owner_account_id
`;

export function serializeEvent(e: EventRow, confirmedCount: number) {
  return {
    id: e.id,
    calendar_id: e.calendar_id,
    calendar_name: e.calendar_name ?? null,
    calendar_slug: e.calendar_slug ?? null,
    title: e.title,
    slug: e.slug,
    category: e.category,
    city: e.city,
    time_zone: e.time_zone,
    cover_seed: e.cover_seed,
    theme_hex: e.theme_hex,
    description: e.description,
    starts_at: toRfc3339(e.starts_at),
    ends_at: toRfc3339(e.ends_at),
    capacity: e.capacity,
    approval_required: e.approval_required,
    waitlist_enabled: e.waitlist_enabled,
    state: e.state,
    published_at: e.published_at ? toRfc3339(e.published_at) : null,
    cancelled_at: e.cancelled_at ? toRfc3339(e.cancelled_at) : null,
    cancel_reason: e.cancel_reason,
    ended: new Date(e.ends_at).getTime() < Date.now(),
    confirmed_count: confirmedCount,
    remaining: Math.max(0, e.capacity - confirmedCount),
    created_at: toRfc3339(e.created_at),
    updated_at: toRfc3339(e.updated_at),
  };
}

export async function confirmedCountFor(client: Tx, eventId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM registrations WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
    [eventId],
  );
  return rows[0].n as number;
}

export async function loadEventBySlug(client: Tx, slug: string): Promise<EventRow | null> {
  const { rows } = await client.query(
    `SELECT ${EVENT_LIST_FIELDS} FROM events e JOIN calendars c ON c.id = e.calendar_id WHERE e.slug = $1`,
    [slug],
  );
  return (rows[0] as EventRow) ?? null;
}

export async function loadEventById(client: Tx, id: string): Promise<EventRow | null> {
  const { rows } = await client.query(
    `SELECT ${EVENT_LIST_FIELDS} FROM events e JOIN calendars c ON c.id = e.calendar_id WHERE e.id = $1`,
    [id],
  );
  return (rows[0] as EventRow) ?? null;
}
