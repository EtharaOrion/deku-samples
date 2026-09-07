import type { Client } from './db.js';
import { newTicketCode } from './auth.js';
import { refuse } from './validate.js';
import type { Transition } from './mail.js';

export const SEATED = ['confirmed', 'checked_in'] as const;

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
  location: string;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
  approval_required: boolean;
  waitlist_enabled: boolean;
  state: 'draft' | 'published' | 'registration_closed' | 'cancelled';
  published_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  owner_account_id?: string;
  calendar_name?: string;
  calendar_slug?: string;
  calendar_is_public?: boolean;
};

export type RegistrationRow = {
  id: string;
  event_id: string;
  account_id: string;
  status: string;
  seat_no: number | null;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A pending mail, gathered inside the transaction and sent once it commits. */
export type PendingMail = {
  to: string;
  transition: Transition;
  registrationId: string | null;
  eventId: string;
  displayName: string;
  ticketCode?: string | null;
  waitlistPosition?: number | null;
};

/**
 * Serialises registration activity on one event so racing requests queue rather
 * than collide. This is a throughput measure, not the guarantee: the guarantee
 * is the unique index on (event_id, seat_no) and the capacity trigger, which
 * hold even if this lock were removed.
 */
export async function lockEvent(client: Client, eventId: string) {
  await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [eventId]);
}

export async function confirmedCount(client: Client, eventId: string): Promise<number> {
  const res = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM registrations
      WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
    [eventId]
  );
  return Number(res.rows[0].n);
}

/** The lowest seat number in 1..capacity that nobody holds, or null when full. */
export async function lowestFreeSeat(
  client: Client,
  eventId: string,
  capacity: number
): Promise<number | null> {
  const res = await client.query<{ seat: number }>(
    `SELECT s.seat FROM generate_series(1, $2::int) AS s(seat)
      WHERE NOT EXISTS (
        SELECT 1 FROM registrations r
         WHERE r.event_id = $1 AND r.seat_no = s.seat
      )
      ORDER BY s.seat LIMIT 1`,
    [eventId, capacity]
  );
  return res.rowCount ? res.rows[0].seat : null;
}

export async function nextWaitlistPosition(client: Client, eventId: string): Promise<number> {
  const res = await client.query<{ next: number }>(
    `SELECT COALESCE(MAX(waitlist_position), 0) + 1 AS next
       FROM registrations WHERE event_id = $1 AND status = 'waitlisted'`,
    [eventId]
  );
  return res.rows[0].next;
}

/** Waiting-list positions are the integers 1..n with no gaps and no repeats. */
export async function renumberWaitlist(client: Client, eventId: string) {
  await client.query('SET CONSTRAINTS reg_event_waitpos_uniq DEFERRED');
  await client.query(
    `UPDATE registrations r
        SET waitlist_position = ranked.rn, updated_at = now()
       FROM (
         SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_position ASC, created_at ASC, id ASC) AS rn
           FROM registrations
          WHERE event_id = $1 AND status = 'waitlisted'
       ) ranked
      WHERE r.id = ranked.id AND r.waitlist_position IS DISTINCT FROM ranked.rn`,
    [eventId]
  );
}

/** A ticket code unique app-wide; retried on the vanishingly rare collision. */
export async function issueTicketCode(client: Client): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = newTicketCode();
    const res = await client.query('SELECT 1 FROM registrations WHERE ticket_code = $1', [code]);
    if (!res.rowCount) return code;
  }
  throw refuse(500, 'Could not issue a ticket code. Please try again.');
}

export async function findRegistration(
  client: Client,
  eventId: string,
  accountId: string
): Promise<RegistrationRow | null> {
  const res = await client.query<RegistrationRow>(
    `SELECT id::text, event_id::text, account_id::text, status, seat_no, waitlist_position,
            ticket_code, checked_in_at, created_at, updated_at
       FROM registrations WHERE event_id = $1 AND account_id = $2 FOR UPDATE`,
    [eventId, accountId]
  );
  return res.rowCount ? res.rows[0] : null;
}

type Outcome = { row: RegistrationRow; transition: Transition | null };

async function writeRegistration(
  client: Client,
  existingId: string | null,
  fields: {
    eventId: string;
    accountId: string;
    status: string;
    seat_no: number | null;
    waitlist_position: number | null;
    ticket_code: string | null;
    checked_in_at?: string | null;
  }
): Promise<RegistrationRow> {
  const cols = `id::text, event_id::text, account_id::text, status, seat_no, waitlist_position,
                ticket_code, checked_in_at, created_at, updated_at`;
  if (existingId) {
    const res = await client.query<RegistrationRow>(
      `UPDATE registrations
          SET status = $2, seat_no = $3, waitlist_position = $4, ticket_code = $5,
              checked_in_at = $6, updated_at = now()
        WHERE id = $1 RETURNING ${cols}`,
      [
        existingId,
        fields.status,
        fields.seat_no,
        fields.waitlist_position,
        fields.ticket_code,
        fields.checked_in_at ?? null,
      ]
    );
    return res.rows[0];
  }
  const res = await client.query<RegistrationRow>(
    `INSERT INTO registrations
       (event_id, account_id, status, seat_no, waitlist_position, ticket_code)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${cols}`,
    [
      fields.eventId,
      fields.accountId,
      fields.status,
      fields.seat_no,
      fields.waitlist_position,
      fields.ticket_code,
    ]
  );
  return res.rows[0];
}

/**
 * Takes a seat, a waiting-list place, or a pending slot, in one transaction.
 *
 * Two guests taking the last seat at the same instant produce exactly one
 * confirmed registration: each transaction picks the lowest free seat and
 * writes it, and the unique index on (event_id, seat_no) refuses the second
 * writer outright. The refused transaction rolls back whole, leaving no partial
 * row, and is retried by tx(), where it now sees the seat taken and takes the
 * waiting list instead.
 */
export async function registerForEvent(
  client: Client,
  event: EventRow,
  accountId: string
): Promise<Outcome> {
  await lockEvent(client, event.id);

  const existing = await findRegistration(client, event.id, accountId);

  // A repeat submission updates the row it already has and never adds a second.
  if (existing && ['confirmed', 'checked_in', 'pending_approval', 'waitlisted'].includes(existing.status)) {
    return { row: existing, transition: null };
  }

  const existingId = existing ? existing.id : null;

  if (event.approval_required) {
    const row = await writeRegistration(client, existingId, {
      eventId: event.id,
      accountId,
      status: 'pending_approval',
      seat_no: null,
      waitlist_position: null,
      ticket_code: null,
    });
    return { row, transition: 'pending' };
  }

  const capacity = event.capacity ?? 0;
  const seat = capacity > 0 ? await lowestFreeSeat(client, event.id, capacity) : null;

  if (seat !== null) {
    const ticket = await issueTicketCode(client);
    const row = await writeRegistration(client, existingId, {
      eventId: event.id,
      accountId,
      status: 'confirmed',
      seat_no: seat,
      waitlist_position: null,
      ticket_code: ticket,
    });
    return { row, transition: 'confirmed' };
  }

  if (!event.waitlist_enabled) {
    throw refuse(409, 'This event is full and the waiting list is closed.');
  }

  const position = await nextWaitlistPosition(client, event.id);
  const row = await writeRegistration(client, existingId, {
    eventId: event.id,
    accountId,
    status: 'waitlisted',
    seat_no: null,
    waitlist_position: position,
    ticket_code: null,
  });
  return { row, transition: 'waitlisted' };
}

/** Promotes the head of the waiting list into a free seat, if there is one. */
export async function promoteHeadOfWaitlist(
  client: Client,
  event: EventRow
): Promise<{ row: RegistrationRow; email: string; display_name: string } | null> {
  if (!event.capacity) return null;
  const seat = await lowestFreeSeat(client, event.id, event.capacity);
  if (seat === null) return null;

  const head = await client.query<RegistrationRow & { email: string; display_name: string }>(
    `SELECT r.id::text, r.event_id::text, r.account_id::text, r.status, r.seat_no,
            r.waitlist_position, r.ticket_code, r.checked_in_at, r.created_at, r.updated_at,
            a.email, a.display_name
       FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1 AND r.status = 'waitlisted'
      ORDER BY r.waitlist_position ASC, r.created_at ASC
      LIMIT 1 FOR UPDATE OF r`,
    [event.id]
  );
  if (!head.rowCount) return null;

  const ticket = await issueTicketCode(client);
  const updated = await client.query<RegistrationRow>(
    `UPDATE registrations
        SET status = 'confirmed', seat_no = $2, waitlist_position = NULL,
            ticket_code = $3, updated_at = now()
      WHERE id = $1
      RETURNING id::text, event_id::text, account_id::text, status, seat_no,
                waitlist_position, ticket_code, checked_in_at, created_at, updated_at`,
    [head.rows[0].id, seat, ticket]
  );
  await renumberWaitlist(client, event.id);
  return {
    row: updated.rows[0],
    email: head.rows[0].email,
    display_name: head.rows[0].display_name,
  };
}

/**
 * Raising capacity fills the seats that just appeared in the same request that
 * raised it, taking the waiting list in position order, lowest first.
 */
export async function fillFreedSeats(
  client: Client,
  event: EventRow,
  limit = 500
): Promise<Array<{ row: RegistrationRow; email: string; display_name: string }>> {
  const promoted: Array<{ row: RegistrationRow; email: string; display_name: string }> = [];
  for (let i = 0; i < limit; i++) {
    const next = await promoteHeadOfWaitlist(client, event);
    if (!next) break;
    promoted.push(next);
  }
  return promoted;
}
