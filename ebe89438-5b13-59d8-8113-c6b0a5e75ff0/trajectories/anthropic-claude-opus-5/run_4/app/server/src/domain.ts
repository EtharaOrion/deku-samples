import type { Client } from './db.js';
import { newTicketCode } from './util.js';
import type { MailInput } from './mail.js';

export interface EventRow {
  id: number;
  calendar_id: number;
  title: string;
  slug: string;
  category: string;
  city: string;
  location: string;
  time_zone: string;
  cover_seed: string;
  theme_hex: string;
  description: string;
  starts_at: Date | null;
  ends_at: Date | null;
  capacity: number | null;
  approval_required: boolean;
  waitlist_enabled: boolean;
  state: 'draft' | 'published' | 'registration_closed' | 'cancelled';
  published_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RegistrationRow {
  id: number;
  event_id: number;
  account_id: number;
  status:
    | 'pending_approval'
    | 'confirmed'
    | 'waitlisted'
    | 'declined'
    | 'cancelled_by_guest'
    | 'cancelled_by_host'
    | 'checked_in';
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export const SEAT_STATUSES = ['confirmed', 'checked_in'] as const;

/** Locks the event row so seat arithmetic in this transaction is serialised. */
export async function lockEvent(c: Client, eventId: number): Promise<void> {
  await c.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [eventId]);
}

export async function confirmedCount(c: Client, eventId: number): Promise<number> {
  const r = await c.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM registrations
      WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
    [eventId],
  );
  return Number(r.rows[0]!.n);
}

export async function nextWaitlistPosition(c: Client, eventId: number): Promise<number> {
  const r = await c.query<{ n: number | null }>(
    `SELECT max(waitlist_position) AS n FROM registrations
      WHERE event_id = $1 AND status = 'waitlisted'`,
    [eventId],
  );
  return (r.rows[0]?.n ?? 0) + 1;
}

/** Issues a ticket code that no registration anywhere already holds. */
export async function issueTicketCode(c: Client): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = newTicketCode();
    const r = await c.query('SELECT 1 FROM registrations WHERE ticket_code = $1', [code]);
    if (r.rowCount === 0) return code;
  }
  throw new Error('could not issue a unique ticket code');
}

/** Renumbers a waiting list to 1..n with no gaps and no repeats. */
export async function renumberWaitlist(c: Client, eventId: number): Promise<void> {
  await c.query('SET CONSTRAINTS registrations_waitlist_unique DEFERRED');
  await c.query(
    `WITH ordered AS (
       SELECT id, row_number() OVER (ORDER BY waitlist_position, created_at, id) AS pos
         FROM registrations
        WHERE event_id = $1 AND status = 'waitlisted'
     )
     UPDATE registrations r SET waitlist_position = o.pos, updated_at = now()
       FROM ordered o
      WHERE r.id = o.id AND r.waitlist_position IS DISTINCT FROM o.pos`,
    [eventId],
  );
}

export interface Promotion {
  registration: RegistrationRow;
  email: string;
  display_name: string;
}

/**
 * Fills up to `seats` free seats from the head of the waiting list, in the same
 * transaction as whatever freed them. Returns the rows promoted so the caller
 * can mail each one.
 */
export async function promoteFromWaitlist(
  c: Client,
  event: EventRow,
  maxToPromote: number,
): Promise<Promotion[]> {
  if (maxToPromote <= 0 || event.capacity === null) return [];
  const promoted: Promotion[] = [];
  for (let i = 0; i < maxToPromote; i++) {
    const taken = await confirmedCount(c, event.id);
    if (event.capacity !== null && taken >= event.capacity) break;
    const head = await c.query<RegistrationRow & { email: string; display_name: string }>(
      `SELECT r.*, a.email, a.display_name
         FROM registrations r JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1 AND r.status = 'waitlisted'
        ORDER BY r.waitlist_position ASC
        LIMIT 1
        FOR UPDATE OF r`,
      [event.id],
    );
    if (head.rowCount === 0) break;
    const row = head.rows[0]!;
    const code = await issueTicketCode(c);
    const updated = await c.query<RegistrationRow>(
      `UPDATE registrations
          SET status = 'confirmed', waitlist_position = NULL, ticket_code = $2, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [row.id, code],
    );
    promoted.push({ registration: updated.rows[0]!, email: row.email, display_name: row.display_name });
  }
  if (promoted.length) await renumberWaitlist(c, event.id);
  return promoted;
}

export function promotionMail(event: EventRow, p: Promotion): MailInput {
  return {
    kind: 'waitlist_promoted',
    to: p.email,
    displayName: p.display_name,
    eventTitle: event.title,
    eventSlug: event.slug,
    eventId: event.id,
    registrationId: p.registration.id,
    ticketCode: p.registration.ticket_code,
  };
}

export function isFullError(err: any): boolean {
  return err?.code === '23514' || (err?.code === '23514' ) || /is full/.test(String(err?.message ?? ''));
}
