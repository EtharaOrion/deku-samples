import type { Client } from './db.js';
import { newTicketCode } from './domain.js';
import type { PendingMail } from './mailer.js';

export type EventRow = {
  id: number;
  slug: string;
  title: string;
  city: string;
  time_zone: string;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
  approval_required: boolean;
  waitlist_enabled: boolean;
  state: string;
  calendar_id: number;
  owner_account_id: number;
  cancel_reason: string | null;
};

export type RegRow = {
  id: number;
  event_id: number;
  account_id: number;
  status: string;
  waitlist_position: number | null;
  seat_no: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  created_at: string;
};

/**
 * Serialises every seat-changing operation on one event. The unique index on
 * (event_id, seat_no) and the capacity trigger remain the real guarantee; this
 * lock only keeps well-behaved requests from having to retry.
 */
export async function lockEvent(c: Client, eventId: number) {
  await c.query('SELECT pg_advisory_xact_lock($1, $2)', [981_237, eventId]);
}

export async function loadEventForUpdate(c: Client, slug: string): Promise<EventRow | null> {
  const r = await c.query<EventRow>(
    `SELECT e.*, cal.owner_account_id
       FROM events e JOIN calendars cal ON cal.id = e.calendar_id
      WHERE e.slug = $1`,
    [slug],
  );
  return r.rows[0] ?? null;
}

export async function confirmedCount(c: Client, eventId: number): Promise<number> {
  const r = await c.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM registrations
      WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
    [eventId],
  );
  return Number(r.rows[0].n);
}

/** Lowest seat number in 1..capacity that nobody holds, or null when full. */
export async function freeSeat(c: Client, eventId: number, capacity: number | null): Promise<number | null> {
  if (!capacity || capacity < 1) return null;
  const r = await c.query<{ s: number }>(
    `SELECT s FROM generate_series(1, $2::int) AS s
      WHERE NOT EXISTS (
        SELECT 1 FROM registrations WHERE event_id = $1 AND seat_no = s
      )
      ORDER BY s LIMIT 1`,
    [eventId, capacity],
  );
  return r.rows[0]?.s ?? null;
}

export async function nextWaitlistPosition(c: Client, eventId: number): Promise<number> {
  const r = await c.query<{ p: number | null }>(
    `SELECT max(waitlist_position) AS p FROM registrations
      WHERE event_id = $1 AND status = 'waitlisted'`,
    [eventId],
  );
  return (r.rows[0]?.p ?? 0) + 1;
}

/** Positions become 1..n in their existing order, with no gaps and no repeats. */
export async function renumberWaitlist(c: Client, eventId: number) {
  await c.query(
    `UPDATE registrations SET waitlist_position = waitlist_position + 1000000
      WHERE event_id = $1 AND status = 'waitlisted'`,
    [eventId],
  );
  await c.query(
    `WITH ranked AS (
       SELECT id, row_number() OVER (ORDER BY waitlist_position, created_at, id) AS rn
         FROM registrations WHERE event_id = $1 AND status = 'waitlisted'
     )
     UPDATE registrations r
        SET waitlist_position = ranked.rn, updated_at = now()
       FROM ranked WHERE r.id = ranked.id`,
    [eventId],
  );
}

async function issueTicket(c: Client): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = newTicketCode();
    const r = await c.query('SELECT 1 FROM registrations WHERE ticket_code = $1', [code]);
    if (r.rowCount === 0) return code;
  }
  throw new Error('could not mint a unique ticket code');
}

export async function setConfirmed(c: Client, regId: number, seatNo: number): Promise<RegRow> {
  const code = await issueTicket(c);
  const r = await c.query<RegRow>(
    `UPDATE registrations
        SET status = 'confirmed', seat_no = $2, ticket_code = $3,
            waitlist_position = NULL, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [regId, seatNo, code],
  );
  return r.rows[0];
}

export async function setWaitlisted(c: Client, regId: number, position: number): Promise<RegRow> {
  const r = await c.query<RegRow>(
    `UPDATE registrations
        SET status = 'waitlisted', waitlist_position = $2, seat_no = NULL,
            ticket_code = NULL, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [regId, position],
  );
  return r.rows[0];
}

export async function setPlain(c: Client, regId: number, status: string): Promise<RegRow> {
  const r = await c.query<RegRow>(
    `UPDATE registrations
        SET status = $2, seat_no = NULL, ticket_code = NULL,
            waitlist_position = NULL, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [regId, status],
  );
  return r.rows[0];
}

export function mailBase(ev: EventRow, recipient: string, displayName: string, regId: number | null) {
  return {
    recipient,
    displayName,
    registrationId: regId,
    eventId: ev.id,
    eventTitle: ev.title,
    eventSlug: ev.slug,
    startsAt: ev.starts_at,
    timeZone: ev.time_zone,
    city: ev.city,
  };
}

/**
 * Fills seats that just became available from the head of the waiting list.
 * Used when a seat is freed and when capacity is raised.
 */
export async function promoteFromWaitlist(
  c: Client,
  ev: EventRow,
  maxToPromote: number,
): Promise<{ promoted: RegRow[]; mails: PendingMail[] }> {
  const promoted: RegRow[] = [];
  const mails: PendingMail[] = [];
  for (let i = 0; i < maxToPromote; i++) {
    const seat = await freeSeat(c, ev.id, ev.capacity);
    if (seat === null) break;
    const head = await c.query<RegRow & { email: string; display_name: string }>(
      `SELECT r.*, a.email, a.display_name
         FROM registrations r JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1 AND r.status = 'waitlisted'
        ORDER BY r.waitlist_position ASC LIMIT 1`,
      [ev.id],
    );
    const row = head.rows[0];
    if (!row) break;
    const updated = await setConfirmed(c, row.id, seat);
    promoted.push(updated);
    mails.push({
      kind: 'promoted',
      ...mailBase(ev, row.email, row.display_name, row.id),
      ticketCode: updated.ticket_code,
    });
  }
  if (promoted.length) await renumberWaitlist(c, ev.id);
  return { promoted, mails };
}
