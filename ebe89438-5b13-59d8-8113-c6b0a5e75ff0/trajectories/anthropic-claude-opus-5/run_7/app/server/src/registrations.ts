import type pg from 'pg';
import { newTicketCode } from './core.js';

export const HOLDS_PLACE = ['pending_approval', 'confirmed', 'waitlisted', 'checked_in'];

export class RuleError extends Error {
  status: number;
  field?: string;
  constructor(message: string, status = 400, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

/**
 * Serialises seat arithmetic for one event inside the current transaction.
 * The database constraints are what make over-booking impossible; this lock
 * only keeps the common path from having to retry.
 */
export async function lockEvent(c: pg.PoolClient, eventId: number): Promise<void> {
  await c.query('SELECT pg_advisory_xact_lock($1, $2)', [4242, eventId]);
}

export async function confirmedCount(c: pg.PoolClient | pg.Pool, eventId: number): Promise<number> {
  const r = await c.query(
    `SELECT count(*)::int AS n FROM registrations
      WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
    [eventId],
  );
  return r.rows[0].n as number;
}

/** Lowest free seat number on the event, or null when every seat is taken. */
export async function nextFreeSeat(
  c: pg.PoolClient,
  eventId: number,
  capacity: number,
): Promise<number | null> {
  const r = await c.query(
    `SELECT s FROM generate_series(1, $2) AS s
      WHERE NOT EXISTS (
        SELECT 1 FROM registrations r
         WHERE r.event_id = $1 AND r.seat_no = s
      )
      ORDER BY s LIMIT 1`,
    [eventId, capacity],
  );
  return r.rows.length ? (r.rows[0].s as number) : null;
}

export async function nextWaitlistPosition(c: pg.PoolClient, eventId: number): Promise<number> {
  const r = await c.query(
    `SELECT COALESCE(MAX(waitlist_position), 0) + 1 AS p FROM registrations
      WHERE event_id = $1 AND status = 'waitlisted'`,
    [eventId],
  );
  return r.rows[0].p as number;
}

/**
 * Renumbers an event's waiting list to 1..n with no gaps and no repeats.
 *
 * Two passes, because (event_id, waitlist_position) is unique through a
 * partial index that cannot be deferred. The parking pass shifts every row
 * far above the occupied range instead of negating it, so the positions stay
 * within the `waitlist_position >= 1` check while they are parked, and the
 * parked range never overlaps the final one.
 */
const WAITLIST_PARK_OFFSET = 1_000_000;

export async function renumberWaitlist(c: pg.PoolClient, eventId: number): Promise<void> {
  await c.query(
    `UPDATE registrations SET waitlist_position = waitlist_position + $2
      WHERE event_id = $1 AND status = 'waitlisted' AND waitlist_position < $2`,
    [eventId, WAITLIST_PARK_OFFSET],
  );
  await c.query(
    `UPDATE registrations r SET waitlist_position = ranked.rn, updated_at = now()
       FROM (
         SELECT id, row_number() OVER (ORDER BY waitlist_position ASC, created_at ASC, id ASC) AS rn
           FROM registrations
          WHERE event_id = $1 AND status = 'waitlisted'
       ) ranked
      WHERE r.id = ranked.id AND r.waitlist_position IS DISTINCT FROM ranked.rn`,
    [eventId],
  );
}

async function uniqueTicketCode(c: pg.PoolClient): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = newTicketCode();
    const r = await c.query('SELECT 1 FROM registrations WHERE ticket_code = $1', [code]);
    if (r.rowCount === 0) return code;
  }
  throw new RuleError('Could not issue a ticket code. Please try again.', 503);
}

export interface EventRow {
  id: number;
  slug: string;
  title: string;
  capacity: number | null;
  state: string;
  approval_required: boolean;
  waitlist_enabled: boolean;
  time_zone: string;
  starts_at: Date | null;
  calendar_id: number;
}

export interface RegRow {
  id: number;
  event_id: number;
  account_id: number;
  status: string;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: Date | null;
  seat_no: number | null;
}

/** Gives the registration a seat: a seat number, a ticket, no waitlist place. */
export async function seatRegistration(
  c: pg.PoolClient,
  regId: number,
  eventId: number,
  capacity: number,
  status: 'confirmed' | 'checked_in' = 'confirmed',
): Promise<RegRow> {
  const seat = await nextFreeSeat(c, eventId, capacity);
  if (seat === null) throw new RuleError('This event is full.', 409);
  const code = await uniqueTicketCode(c);
  const r = await c.query(
    `UPDATE registrations
        SET status = $3, seat_no = $4, event_capacity = $5, ticket_code = $6,
            waitlist_position = NULL, updated_at = now()
      WHERE id = $1 AND event_id = $2
      RETURNING *`,
    [regId, eventId, status, seat, capacity, code],
  );
  return r.rows[0] as RegRow;
}

export async function waitlistRegistration(
  c: pg.PoolClient,
  regId: number,
  eventId: number,
): Promise<RegRow> {
  const pos = await nextWaitlistPosition(c, eventId);
  const r = await c.query(
    `UPDATE registrations
        SET status = 'waitlisted', waitlist_position = $3, seat_no = NULL,
            event_capacity = NULL, ticket_code = NULL, updated_at = now()
      WHERE id = $1 AND event_id = $2
      RETURNING *`,
    [regId, eventId, pos],
  );
  return r.rows[0] as RegRow;
}

/** Releases any seat and ticket the registration holds and sets a new status. */
export async function releaseRegistration(
  c: pg.PoolClient,
  regId: number,
  status: 'cancelled_by_guest' | 'cancelled_by_host' | 'declined',
): Promise<RegRow> {
  const r = await c.query(
    `UPDATE registrations
        SET status = $2, seat_no = NULL, event_capacity = NULL, ticket_code = NULL,
            waitlist_position = NULL, checked_in_at = NULL, updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [regId, status],
  );
  return r.rows[0] as RegRow;
}

export interface Promotion {
  registration: RegRow;
  email: string;
  display_name: string;
}

/**
 * Fills free seats from the head of the waiting list, lowest position first,
 * until the seats or the list run out. Returns the guests promoted so each can
 * be mailed by the caller inside the same request.
 */
export async function promoteFromWaitlist(
  c: pg.PoolClient,
  ev: EventRow,
  maxToPromote = 1,
): Promise<Promotion[]> {
  if (ev.capacity === null) return [];
  const promoted: Promotion[] = [];
  for (let i = 0; i < maxToPromote; i++) {
    const seat = await nextFreeSeat(c, ev.id, ev.capacity);
    if (seat === null) break;
    const head = await c.query(
      `SELECT r.id, a.email, a.display_name
         FROM registrations r JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1 AND r.status = 'waitlisted'
        ORDER BY r.waitlist_position ASC, r.created_at ASC, r.id ASC
        LIMIT 1`,
      [ev.id],
    );
    if (head.rowCount === 0) break;
    const row = head.rows[0];
    const reg = await seatRegistration(c, row.id as number, ev.id, ev.capacity);
    promoted.push({ registration: reg, email: row.email, display_name: row.display_name });
  }
  if (promoted.length) await renumberWaitlist(c, ev.id);
  return promoted;
}
