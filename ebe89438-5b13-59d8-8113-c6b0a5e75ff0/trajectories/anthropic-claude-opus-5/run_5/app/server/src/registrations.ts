import type { PoolClient } from 'pg';
import { makeTicketCode } from './crypto.js';
import { ApiError, badRequest, conflict } from './http.js';
import { sendMailSafely, type MailKind } from './mail.js';
import { log } from './log.js';

export type RegistrationStatus =
  | 'pending_approval'
  | 'confirmed'
  | 'waitlisted'
  | 'declined'
  | 'cancelled_by_guest'
  | 'cancelled_by_host'
  | 'checked_in';

export interface RegistrationRow {
  id: number;
  event_id: number;
  account_id: number;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: number;
  calendar_id: number;
  title: string;
  slug: string;
  category: string | null;
  city: string | null;
  time_zone: string;
  cover_seed: string;
  theme_hex: string;
  description: string;
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
}

export const SEAT_STATUSES = ['confirmed', 'checked_in'] as const;

let savepointCounter = 0;

/**
 * Runs one statement inside a savepoint so that a database-level refusal can be
 * caught without aborting the surrounding transaction, and so that a refused
 * write leaves nothing behind.
 */
async function attempt<T>(client: PoolClient, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: any }> {
  const name = `sp_${++savepointCounter}`;
  await client.query(`SAVEPOINT ${name}`);
  try {
    const value = await fn();
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return { ok: true, value };
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return { ok: false, error };
  }
}

/** Pending mail, collected inside the transaction and sent once it commits. */
export interface PendingMail {
  kind: MailKind;
  to: string;
  eventTitle: string;
  eventId: number;
  registrationId: number | null;
  lines: string[];
}

export async function flushMail(mails: PendingMail[]): Promise<void> {
  for (const m of mails) {
    await sendMailSafely(m);
  }
}

/**
 * Locks the event row, which is what serialises two guests reaching for the
 * same last seat. The database trigger is the second, authoritative guard.
 */
export async function lockEvent(client: PoolClient, eventId: number): Promise<EventRow> {
  const r = await client.query<EventRow>(`SELECT * FROM events WHERE id = $1 FOR UPDATE`, [eventId]);
  if (!r.rows[0]) throw new ApiError(404, 'That event does not exist.');
  return r.rows[0];
}

export async function confirmedCount(client: PoolClient, eventId: number): Promise<number> {
  const r = await client.query<{ n: number }>(
    `SELECT count(*)::bigint AS n FROM registrations
      WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
    [eventId],
  );
  return r.rows[0].n;
}

async function nextWaitlistPosition(client: PoolClient, eventId: number): Promise<number> {
  const r = await client.query<{ n: number | null }>(
    `SELECT max(waitlist_position) AS n FROM registrations
      WHERE event_id = $1 AND status = 'waitlisted'`,
    [eventId],
  );
  return (r.rows[0].n ?? 0) + 1;
}

/** Positions are always the integers 1..n with no gaps and no repeats. */
export async function renumberWaitlist(client: PoolClient, eventId: number): Promise<void> {
  await client.query(
    `UPDATE registrations r
        SET waitlist_position = ranked.rn, updated_at = now()
       FROM (
         SELECT id, row_number() OVER (ORDER BY waitlist_position, created_at, id) AS rn
           FROM registrations
          WHERE event_id = $1 AND status = 'waitlisted'
       ) ranked
      WHERE r.id = ranked.id AND r.waitlist_position IS DISTINCT FROM ranked.rn`,
    [eventId],
  );
}

async function issueTicket(client: PoolClient, registrationId: number, status: 'confirmed' | 'checked_in'): Promise<RegistrationRow> {
  for (let i = 0; i < 6; i++) {
    const code = makeTicketCode();
    const out = await attempt(client, async () => {
      const r = await client.query<RegistrationRow>(
        `UPDATE registrations
            SET status = $2, ticket_code = $3, waitlist_position = NULL, updated_at = now()
          WHERE id = $1
        RETURNING *`,
        [registrationId, status, code],
      );
      return r.rows[0];
    });
    if (out.ok) return out.value;
    if (out.error?.constraint === 'registrations_ticket_code_key') continue;
    throw out.error;
  }
  throw new ApiError(500, 'Could not issue a ticket code.');
}

function capacityViolation(e: any): boolean {
  return e?.message?.includes('event_capacity_exceeded') || e?.constraint === 'registrations_capacity';
}

export interface Guest {
  id: number;
  email: string;
  display_name: string;
}

function eventLines(eventTitle: string, body: string, guestName: string): string[] {
  return [`Hello ${guestName},`, body, `— the host of ${eventTitle}`];
}

function when(ev: EventRow): string {
  if (!ev.starts_at) return 'a date still to be announced';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: ev.time_zone,
    }).format(new Date(ev.starts_at)) + ` (${ev.time_zone})`;
  } catch {
    return new Date(ev.starts_at).toISOString();
  }
}

export function mailForTransition(
  kind: MailKind,
  ev: EventRow,
  guest: Guest,
  registrationId: number | null,
  detail?: string,
): PendingMail {
  const place = ev.city ? ` in ${ev.city}` : '';
  const bodies: Record<MailKind, string> = {
    registration_confirmed: `You have a seat at ${ev.title}${place} on ${when(ev)}. ${detail ?? ''}`.trim(),
    registration_pending: `Your request to join ${ev.title}${place} on ${when(ev)} has reached the host, who reads every request before confirming a seat. We will write again the moment there is an answer.`,
    approved: `The host has confirmed your seat at ${ev.title}${place} on ${when(ev)}. ${detail ?? ''}`.trim(),
    declined: `The host is not able to offer you a seat at ${ev.title}${place} on ${when(ev)} this time. Other events on this calendar may still have room.`,
    waitlisted: `${ev.title}${place} on ${when(ev)} is full, so you are on the waiting list. ${detail ?? ''}`.trim(),
    waitlist_promoted: `A seat opened up at ${ev.title}${place} on ${when(ev)} and it is yours. ${detail ?? ''}`.trim(),
    event_cancelled: `${ev.title}${place} on ${when(ev)} has been called off by its host. The host's own words: ${detail ?? ''}`,
    event_updated: `Details of ${ev.title}${place} have changed. It now runs on ${when(ev)}${ev.city ? ` in ${ev.city}` : ''}. Your place is unchanged.`,
  };
  return {
    kind,
    to: guest.email,
    eventTitle: ev.title,
    eventId: ev.id,
    registrationId,
    lines: eventLines(ev.title, bodies[kind], guest.display_name),
  };
}

export interface RegisterOutcome {
  registration: RegistrationRow;
  mails: PendingMail[];
}

/**
 * One registration attempt, inside one transaction. Two guests arriving at the
 * same instant for one seat are serialised by the row lock; the trigger refuses
 * the loser at the database level even if the lock were bypassed, and the
 * refusal aborts the insert so no partial row survives.
 */
export async function registerForEvent(
  client: PoolClient,
  ev: EventRow,
  guest: Guest,
): Promise<RegisterOutcome> {
  if (ev.state === 'draft') throw new ApiError(404, 'That event does not exist.');
  if (ev.state === 'cancelled') throw badRequest('This event has been cancelled, so it is not taking registrations.');
  if (ev.state === 'registration_closed') {
    throw badRequest('Registration is closed for this event, so no new places can be taken.');
  }

  const existing = await client.query<RegistrationRow>(
    `SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2 FOR UPDATE`,
    [ev.id, guest.id],
  );
  const prior = existing.rows[0];
  if (prior && ['confirmed', 'checked_in', 'waitlisted', 'pending_approval'].includes(prior.status)) {
    // A repeat submission updates the one row rather than adding a second.
    return { registration: prior, mails: [] };
  }

  const mails: PendingMail[] = [];

  const upsert = async (
    status: RegistrationStatus,
    waitlistPosition: number | null,
    ticket: string | null,
  ): Promise<RegistrationRow> => {
    const r = await client.query<RegistrationRow>(
      `INSERT INTO registrations (event_id, account_id, status, waitlist_position, ticket_code)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (event_id, account_id) DO UPDATE
         SET status = EXCLUDED.status,
             waitlist_position = EXCLUDED.waitlist_position,
             ticket_code = EXCLUDED.ticket_code,
             checked_in_at = NULL,
             updated_at = now()
       RETURNING *`,
      [ev.id, guest.id, status, waitlistPosition, ticket],
    );
    return r.rows[0];
  };

  if (ev.approval_required) {
    const reg = await upsert('pending_approval', null, null);
    mails.push(mailForTransition('registration_pending', ev, guest, reg.id));
    return { registration: reg, mails };
  }

  const taken = await confirmedCount(client, ev.id);
  const capacity = ev.capacity ?? Number.MAX_SAFE_INTEGER;

  if (taken < capacity) {
    let refusedByCapacity = false;
    for (let i = 0; i < 6 && !refusedByCapacity; i++) {
      const out = await attempt(client, () => upsert('confirmed', null, makeTicketCode()));
      if (out.ok) {
        const reg = out.value;
        mails.push(
          mailForTransition('registration_confirmed', ev, guest, reg.id, `Your ticket code is ${reg.ticket_code}.`),
        );
        return { registration: reg, mails };
      }
      if (out.error?.constraint === 'registrations_ticket_code_key') continue;
      if (capacityViolation(out.error)) {
        log.warn('capacity guard refused a seat', { event: ev.slug, account: guest.id });
        refusedByCapacity = true;
        break;
      }
      throw out.error;
    }
  }

  if (!ev.waitlist_enabled) {
    throw conflict('This event is full and its host is not keeping a waiting list.');
  }

  const position = await nextWaitlistPosition(client, ev.id);
  const reg = await upsert('waitlisted', position, null);
  mails.push(
    mailForTransition('waitlisted', ev, guest, reg.id, `You are number ${position} on the waiting list.`),
  );
  return { registration: reg, mails };
}

/**
 * Frees a seat and, in the same request, promotes the head of the waiting list.
 * While registration is closed the seat is freed but nobody is promoted.
 */
export async function releaseSeatAndPromote(
  client: PoolClient,
  ev: EventRow,
): Promise<PendingMail[]> {
  const mails: PendingMail[] = [];
  if (ev.state === 'registration_closed' || ev.state === 'cancelled') return mails;

  const taken = await confirmedCount(client, ev.id);
  const capacity = ev.capacity ?? Number.MAX_SAFE_INTEGER;
  let free = capacity - taken;
  if (free <= 0) return mails;

  const waiting = await client.query<RegistrationRow & { email: string; display_name: string }>(
    `SELECT r.*, a.email, a.display_name
       FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1 AND r.status = 'waitlisted'
      ORDER BY r.waitlist_position ASC, r.created_at ASC, r.id ASC
      FOR UPDATE OF r`,
    [ev.id],
  );

  for (const row of waiting.rows) {
    if (free <= 0) break;
    const out = await attempt(client, () => issueTicket(client, row.id, 'confirmed'));
    if (!out.ok) {
      if (capacityViolation(out.error)) break;
      throw out.error;
    }
    free -= 1;
    mails.push(
      mailForTransition(
        'waitlist_promoted',
        ev,
        { id: row.account_id, email: row.email, display_name: row.display_name },
        out.value.id,
        `Your ticket code is ${out.value.ticket_code}.`,
      ),
    );
  }

  await renumberWaitlist(client, ev.id);
  return mails;
}

export async function cancelOwnRegistration(
  client: PoolClient,
  reg: RegistrationRow,
  ev: EventRow,
): Promise<{ registration: RegistrationRow; mails: PendingMail[] }> {
  if (['cancelled_by_guest', 'cancelled_by_host', 'declined'].includes(reg.status)) {
    return { registration: reg, mails: [] };
  }
  const r = await client.query<RegistrationRow>(
    `UPDATE registrations
        SET status = 'cancelled_by_guest', ticket_code = NULL, waitlist_position = NULL,
            checked_in_at = NULL, updated_at = now()
      WHERE id = $1
    RETURNING *`,
    [reg.id],
  );
  await renumberWaitlist(client, ev.id);
  // A guest cancelling their own registration sends no mail; the promoted head
  // of the waiting list is mailed, because that is a transition of their own.
  const mails = reg.status === 'confirmed' || reg.status === 'checked_in'
    ? await releaseSeatAndPromote(client, ev)
    : [];
  return { registration: r.rows[0], mails };
}

export async function approveRegistration(
  client: PoolClient,
  reg: RegistrationRow,
  ev: EventRow,
  guest: Guest,
): Promise<{ registration: RegistrationRow; mails: PendingMail[]; waitlisted: boolean }> {
  if (reg.status !== 'pending_approval') {
    throw badRequest('That request is no longer waiting for an answer.');
  }
  const taken = await confirmedCount(client, ev.id);
  const capacity = ev.capacity ?? Number.MAX_SAFE_INTEGER;

  if (taken < capacity && ev.state !== 'cancelled') {
    const out = await attempt(client, () => issueTicket(client, reg.id, 'confirmed'));
    if (out.ok) {
      return {
        registration: out.value,
        waitlisted: false,
        mails: [
          mailForTransition('approved', ev, guest, out.value.id, `Your ticket code is ${out.value.ticket_code}.`),
        ],
      };
    }
    if (!capacityViolation(out.error)) throw out.error;
  }

  const position = await nextWaitlistPosition(client, ev.id);
  const r = await client.query<RegistrationRow>(
    `UPDATE registrations
        SET status = 'waitlisted', waitlist_position = $2, ticket_code = NULL, updated_at = now()
      WHERE id = $1
    RETURNING *`,
    [reg.id, position],
  );
  await renumberWaitlist(client, ev.id);
  return {
    registration: r.rows[0],
    waitlisted: true,
    mails: [
      mailForTransition('waitlisted', ev, guest, reg.id, `You are number ${position} on the waiting list.`),
    ],
  };
}

export async function declineRegistration(
  client: PoolClient,
  reg: RegistrationRow,
  ev: EventRow,
  guest: Guest,
): Promise<{ registration: RegistrationRow; mails: PendingMail[] }> {
  if (reg.status !== 'pending_approval') {
    throw badRequest('That request is no longer waiting for an answer.');
  }
  const r = await client.query<RegistrationRow>(
    `UPDATE registrations
        SET status = 'declined', waitlist_position = NULL, ticket_code = NULL, updated_at = now()
      WHERE id = $1
    RETURNING *`,
    [reg.id],
  );
  return { registration: r.rows[0], mails: [mailForTransition('declined', ev, guest, reg.id)] };
}

/** Raising capacity fills the seats that just appeared, in the same request. */
export async function fillSeatsAfterRaise(
  client: PoolClient,
  ev: EventRow,
): Promise<{ moved: number; mails: PendingMail[] }> {
  const mails = await releaseSeatAndPromote(client, ev);
  return { moved: mails.length, mails };
}
