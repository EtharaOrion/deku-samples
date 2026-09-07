import type { PoolClient } from 'pg';
import { newTicketCode, toUtcIso, FieldError } from './util.js';

export interface EventRow {
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
  starts_at: Date | null;
  ends_at: Date | null;
  capacity: number | null;
  approval_required: boolean;
  waitlist_enabled: boolean;
  state: string;
  published_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export const SEAT_STATUSES = ['confirmed', 'checked_in'];

export const CAPACITY_VIOLATION = 'registrations_capacity';

export function isCapacityViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; message?: string };
  return (
    e?.code === '23514' &&
    (e.constraint === CAPACITY_VIOLATION || /at capacity/.test(e.message || ''))
  );
}

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === '23505' && (!constraint || e.constraint === constraint);
}

/** confirmed_count is derived from the registrations table on read, never stored. */
export async function confirmedCount(
  client: PoolClient,
  eventId: string,
): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM registrations
      WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
    [eventId],
  );
  return rows[0].n as number;
}

/** Issues a ticket code, retrying should the app-wide unique index collide. */
export async function issueTicketCode(client: PoolClient): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = newTicketCode();
    const { rows } = await client.query(
      'SELECT 1 FROM registrations WHERE ticket_code = $1',
      [code],
    );
    if (rows.length === 0) return code;
  }
  throw new Error('could not allocate a ticket code');
}

/** Waiting-list positions on an event are 1..n with no gaps and no repeats. */
export async function renumberWaitlist(client: PoolClient, eventId: string) {
  await client.query(
    `WITH ordered AS (
       SELECT id, row_number() OVER (
                ORDER BY waitlist_position ASC NULLS LAST, created_at ASC, id ASC
              ) AS pos
         FROM registrations
        WHERE event_id = $1 AND status = 'waitlisted'
     )
     UPDATE registrations r
        SET waitlist_position = ordered.pos, updated_at = now()
       FROM ordered
      WHERE r.id = ordered.id AND r.waitlist_position IS DISTINCT FROM ordered.pos`,
    [eventId],
  );
}

export async function nextWaitlistPosition(
  client: PoolClient,
  eventId: string,
): Promise<number> {
  const { rows } = await client.query(
    `SELECT coalesce(max(waitlist_position), 0) + 1 AS pos
       FROM registrations WHERE event_id = $1 AND status = 'waitlisted'`,
    [eventId],
  );
  return rows[0].pos as number;
}

/** Locks the event row: every seat decision on an event is serialised by this. */
export async function lockEvent(
  client: PoolClient,
  eventId: string,
): Promise<EventRow> {
  const { rows } = await client.query(
    'SELECT * FROM events WHERE id = $1 FOR UPDATE',
    [eventId],
  );
  if (!rows.length) throw new FieldError('event_slug', 'That event does not exist.', 404);
  return rows[0] as EventRow;
}

export interface Promotion {
  registration_id: string;
  account_id: string;
  email: string;
  display_name: string;
  ticket_code: string;
}

/**
 * Fills free seats from the head of the waiting list, lowest position first,
 * until the seats or the list run out. Used by both a guest cancelling and a
 * host raising capacity, in the same request that freed the seats.
 */
export async function promoteFromWaitlist(
  client: PoolClient,
  event: EventRow,
  maxToPromote = Number.MAX_SAFE_INTEGER,
): Promise<Promotion[]> {
  if (event.capacity === null) return [];
  const taken = await confirmedCount(client, event.id);
  let free = Math.min(event.capacity - taken, maxToPromote);
  if (free <= 0) return [];

  const { rows: waiting } = await client.query(
    `SELECT r.id, r.account_id, a.email, a.display_name
       FROM registrations r
       JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1 AND r.status = 'waitlisted'
      ORDER BY r.waitlist_position ASC
      LIMIT $2`,
    [event.id, free],
  );

  const promoted: Promotion[] = [];
  for (const row of waiting) {
    const code = await issueTicketCode(client);
    await client.query(
      `UPDATE registrations
          SET status = 'confirmed', waitlist_position = NULL,
              ticket_code = $2, updated_at = now()
        WHERE id = $1`,
      [row.id, code],
    );
    promoted.push({
      registration_id: row.id,
      account_id: row.account_id,
      email: row.email,
      display_name: row.display_name,
      ticket_code: code,
    });
  }
  if (promoted.length) await renumberWaitlist(client, event.id);
  return promoted;
}

/* ------------------------------------------------------------ serialisation */

export function eventPublic(ev: EventRow, confirmed: number) {
  const capacity = ev.capacity;
  const remaining =
    capacity === null ? null : Math.max(0, capacity - confirmed);
  return {
    id: ev.id,
    slug: ev.slug,
    title: ev.title,
    category: ev.category,
    city: ev.city,
    time_zone: ev.time_zone,
    starts_at: toUtcIso(ev.starts_at),
    ends_at: toUtcIso(ev.ends_at),
    capacity,
    confirmed_count: confirmed,
    remaining,
    state: ev.state,
    theme_hex: ev.theme_hex,
    cover_seed: ev.cover_seed,
    has_ended: ev.ends_at ? new Date(ev.ends_at).getTime() < Date.now() : false,
  };
}

export function eventDetail(
  ev: EventRow,
  confirmed: number,
  extra: Record<string, unknown> = {},
) {
  return {
    ...eventPublic(ev, confirmed),
    description: ev.description,
    approval_required: ev.approval_required,
    waitlist_enabled: ev.waitlist_enabled,
    published_at: toUtcIso(ev.published_at),
    cancelled_at: toUtcIso(ev.cancelled_at),
    cancel_reason: ev.cancel_reason,
    created_at: toUtcIso(ev.created_at),
    updated_at: toUtcIso(ev.updated_at),
    ...extra,
  };
}

export function registrationPublic(row: {
  id: string;
  event_id?: string;
  account_id?: string;
  status: string;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}) {
  return {
    id: row.id,
    event_id: row.event_id,
    account_id: row.account_id,
    status: row.status,
    waitlist_position: row.waitlist_position,
    ticket_code: row.ticket_code,
    checked_in_at: row.checked_in_at ? toUtcIso(row.checked_in_at) : null,
    created_at: row.created_at ? toUtcIso(row.created_at) : undefined,
    updated_at: row.updated_at ? toUtcIso(row.updated_at) : undefined,
  };
}
