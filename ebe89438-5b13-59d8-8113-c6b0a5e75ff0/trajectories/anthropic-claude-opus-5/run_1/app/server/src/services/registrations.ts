import type { Client } from '../db.js';
import { query, tx } from '../db.js';
import { randomTicketCode, SUBJECTS } from '../domain.js';
import { AppError, badRequest, conflict, notFound } from '../errors.js';
import { sendMailSafe, type MailInput } from '../mail.js';
import { formatInZone } from '../timefmt.js';

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
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
  approval_required: boolean;
  waitlist_enabled: boolean;
  state: string;
  published_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegistrationRow {
  id: string;
  event_id: string;
  account_id: string;
  status: string;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  created_at: string;
  updated_at: string;
}

export const SEATED = ['confirmed', 'checked_in'];

export async function lockEvent(c: Client, eventId: string): Promise<EventRow> {
  const r = await c.query<EventRow>('SELECT * FROM events WHERE id = $1 FOR UPDATE', [eventId]);
  if (!r.rowCount) throw notFound('That event does not exist.');
  return r.rows[0];
}

export async function seatedCount(c: Client, eventId: string): Promise<number> {
  const r = await c.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM registrations
      WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
    [eventId]
  );
  return Number(r.rows[0].n);
}

async function uniqueTicketCode(c: Client): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = randomTicketCode();
    const r = await c.query('SELECT 1 FROM registrations WHERE ticket_code = $1', [code]);
    if (!r.rowCount) return code;
  }
  throw new AppError(500, 'Could not issue a ticket code.');
}

/** Positions become 1..n with no gaps and no repeats. */
export async function renumberWaitlist(c: Client, eventId: string): Promise<void> {
  await c.query(
    `WITH ordered AS (
       SELECT id, row_number() OVER (ORDER BY waitlist_position, created_at, id) AS rn
         FROM registrations
        WHERE event_id = $1 AND status = 'waitlisted'
     )
     UPDATE registrations r
        SET waitlist_position = ordered.rn, updated_at = now()
       FROM ordered
      WHERE r.id = ordered.id AND r.waitlist_position IS DISTINCT FROM ordered.rn`,
    [eventId]
  );
}

export interface Promotion {
  registration: RegistrationRow;
  email: string;
  display_name: string;
}

/** Takes waiting-list rows in position order until the free seats run out. */
export async function promoteFromWaitlist(
  c: Client,
  ev: EventRow,
  maxSeats: number
): Promise<Promotion[]> {
  if (maxSeats <= 0) return [];
  const waiting = await c.query<RegistrationRow & { email: string; display_name: string }>(
    `SELECT r.*, a.email, a.display_name
       FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1 AND r.status = 'waitlisted'
      ORDER BY r.waitlist_position ASC
      LIMIT $2
      FOR UPDATE OF r`,
    [ev.id, maxSeats]
  );
  const out: Promotion[] = [];
  for (const row of waiting.rows) {
    const code = await uniqueTicketCode(c);
    const upd = await c.query<RegistrationRow>(
      `UPDATE registrations
          SET status = 'confirmed', waitlist_position = NULL, ticket_code = $2, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [row.id, code]
    );
    out.push({ registration: upd.rows[0], email: row.email, display_name: row.display_name });
  }
  if (out.length) await renumberWaitlist(c, ev.id);
  return out;
}

export function eventWhen(ev: EventRow): string {
  return formatInZone(ev.starts_at, ev.time_zone);
}

export function promotionMail(ev: EventRow, p: Promotion): MailInput {
  return {
    to: p.email,
    subject: SUBJECTS.promoted(ev.title),
    eventId: ev.id,
    registrationId: p.registration.id,
    lines: [
      `Hello ${p.display_name},`,
      `A seat has opened up and you now have one at ${ev.title}.`,
      `When: ${eventWhen(ev)} (${ev.time_zone}).`,
      `Where: ${ev.city}.`,
      `Your ticket code is ${p.registration.ticket_code}.`,
      `See you at ${ev.title}.`,
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Register                                                            */
/* ------------------------------------------------------------------ */

interface RegisterResult {
  registration: RegistrationRow;
  event: EventRow;
  mails: MailInput[];
}

export async function registerForEvent(
  eventSlug: string,
  account: { id: string; email: string; display_name: string }
): Promise<RegistrationRow> {
  const result = await tx<RegisterResult>(async (c) => {
    const found = await c.query<{ id: string }>('SELECT id FROM events WHERE slug = $1', [
      eventSlug,
    ]);
    if (!found.rowCount) throw notFound('That event does not exist.');
    // Every seat decision for this event serialises on the event row itself.
    const ev = await lockEvent(c, found.rows[0].id);

    if (ev.state === 'cancelled')
      throw badRequest('This event has been cancelled and is no longer taking registrations.');
    if (ev.state === 'draft') throw notFound('That event does not exist.');
    if (ev.state === 'registration_closed')
      throw badRequest('Registration is closed for this event.', 'event_slug', {
        state: 'registration_closed',
      });

    const existing = await c.query<RegistrationRow>(
      'SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2 FOR UPDATE',
      [ev.id, account.id]
    );

    const mails: MailInput[] = [];
    const live = ['pending_approval', 'confirmed', 'waitlisted', 'checked_in'];
    if (existing.rowCount && live.includes(existing.rows[0].status)) {
      // A repeat submission updates the one row and never adds a second.
      return { registration: existing.rows[0], event: ev, mails };
    }

    const seats = ev.capacity === null ? Infinity : ev.capacity - (await seatedCount(c, ev.id));

    let status: string;
    let ticket: string | null = null;
    let position: number | null = null;

    if (ev.approval_required) {
      status = 'pending_approval';
    } else if (seats > 0) {
      status = 'confirmed';
      ticket = await uniqueTicketCode(c);
    } else if (ev.waitlist_enabled) {
      status = 'waitlisted';
      const m = await c.query<{ n: number | null }>(
        `SELECT max(waitlist_position) AS n FROM registrations
          WHERE event_id = $1 AND status = 'waitlisted'`,
        [ev.id]
      );
      position = (m.rows[0].n ?? 0) + 1;
    } else {
      throw conflict('This event is full and its waiting list is not open.');
    }

    let reg: RegistrationRow;
    if (existing.rowCount) {
      const upd = await c.query<RegistrationRow>(
        `UPDATE registrations
            SET status = $2, ticket_code = $3, waitlist_position = $4,
                checked_in_at = NULL, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [existing.rows[0].id, status, ticket, position]
      );
      reg = upd.rows[0];
    } else {
      const ins = await c.query<RegistrationRow>(
        `INSERT INTO registrations (event_id, account_id, status, ticket_code, waitlist_position)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [ev.id, account.id, status, ticket, position]
      );
      reg = ins.rows[0];
    }

    const when = eventWhen(ev);
    if (status === 'confirmed') {
      mails.push({
        to: account.email,
        subject: SUBJECTS.confirmed(ev.title),
        eventId: ev.id,
        registrationId: reg.id,
        lines: [
          `Hello ${account.display_name},`,
          `You have a seat at ${ev.title}.`,
          `When: ${when} (${ev.time_zone}).`,
          `Where: ${ev.city}.`,
          `Your ticket code is ${reg.ticket_code}.`,
          `Show this code at the door. See you at ${ev.title}.`,
        ],
      });
    } else if (status === 'pending_approval') {
      mails.push({
        to: account.email,
        subject: SUBJECTS.pending(ev.title),
        eventId: ev.id,
        registrationId: reg.id,
        lines: [
          `Hello ${account.display_name},`,
          `Your request to join ${ev.title} has reached the host.`,
          `When: ${when} (${ev.time_zone}).`,
          `Where: ${ev.city}.`,
          `We will write again as soon as the host has decided about ${ev.title}.`,
        ],
      });
    } else {
      mails.push({
        to: account.email,
        subject: SUBJECTS.waitlisted(ev.title),
        eventId: ev.id,
        registrationId: reg.id,
        lines: [
          `Hello ${account.display_name},`,
          `${ev.title} is full, so you are number ${reg.waitlist_position} on the waiting list.`,
          `When: ${when} (${ev.time_zone}).`,
          `Where: ${ev.city}.`,
          `If a seat opens up we will write to you at once.`,
        ],
      });
    }

    return { registration: reg, event: ev, mails };
  }).catch(rethrowWriteConflict);

  for (const m of result.mails) await sendMailSafe(m);
  return result.registration;
}

/** The database refused the write: turn that into the right client answer. */
function rethrowWriteConflict(e: any): never {
  if (e instanceof AppError) throw e;
  const msg = String(e?.message ?? '');
  if (msg.includes('capacity_exceeded')) throw conflict('This event just filled up.');
  if (msg.includes('capacity_below_confirmed'))
    throw badRequest('Capacity cannot go below the guests already confirmed.', 'capacity');
  if (e?.code === '23505' && String(e?.constraint).includes('one_per_account'))
    throw conflict('You already have a registration for this event.');
  throw e;
}

/* ------------------------------------------------------------------ */
/* Cancel by guest                                                     */
/* ------------------------------------------------------------------ */

export async function cancelOwnRegistration(
  registrationId: string,
  accountId: string
): Promise<RegistrationRow> {
  const { reg, mails } = await tx(async (c) => {
    const r = await c.query<RegistrationRow>('SELECT * FROM registrations WHERE id = $1', [
      registrationId,
    ]);
    if (!r.rowCount || r.rows[0].account_id !== accountId)
      throw notFound('That registration does not exist.');
    const ev = await lockEvent(c, r.rows[0].event_id);
    const cur = (
      await c.query<RegistrationRow>('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [
        registrationId,
      ])
    ).rows[0];

    if (cur.status === 'cancelled_by_guest') return { reg: cur, mails: [] as MailInput[] };
    if (cur.status === 'checked_in')
      throw badRequest('You have already been checked in at this event.');

    const wasSeated = SEATED.includes(cur.status);
    const upd = await c.query<RegistrationRow>(
      `UPDATE registrations
          SET status = 'cancelled_by_guest', ticket_code = NULL, waitlist_position = NULL,
              updated_at = now()
        WHERE id = $1 RETURNING *`,
      [registrationId]
    );
    await renumberWaitlist(c, ev.id);

    const mails: MailInput[] = [];
    // Freeing a seat passes it to the head of the waiting list in this same
    // request, unless registration on the event is closed.
    if (wasSeated && ev.state === 'published') {
      const free = ev.capacity === null ? 1 : ev.capacity - (await seatedCount(c, ev.id));
      const promoted = await promoteFromWaitlist(c, ev, Math.max(0, Math.min(free, 1)));
      for (const p of promoted) mails.push(promotionMail(ev, p));
    }
    // A guest cancelling their own registration sends themselves no mail.
    return { reg: upd.rows[0], mails };
  });

  for (const m of mails) await sendMailSafe(m);
  return reg;
}

/* ------------------------------------------------------------------ */
/* Approve / decline                                                   */
/* ------------------------------------------------------------------ */

export async function approveRegistration(
  registrationId: string,
  hostAccountId: string
): Promise<{ registration: RegistrationRow; waitlisted: boolean }> {
  const out = await tx(async (c) => {
    const r = await c.query<RegistrationRow & { email: string; display_name: string }>(
      `SELECT r.*, a.email, a.display_name FROM registrations r
         JOIN accounts a ON a.id = r.account_id WHERE r.id = $1`,
      [registrationId]
    );
    if (!r.rowCount) throw notFound('That registration does not exist.');
    const ev = await lockEvent(c, r.rows[0].event_id);
    await assertOwnsEvent(c, ev, hostAccountId);

    const cur = r.rows[0];
    if (SEATED.includes(cur.status))
      return { registration: cur as RegistrationRow, waitlisted: false, mails: [] as MailInput[] };
    if (cur.status !== 'pending_approval')
      throw badRequest('That request is no longer awaiting a decision.');

    const seats = ev.capacity === null ? Infinity : ev.capacity - (await seatedCount(c, ev.id));
    const mails: MailInput[] = [];
    const when = eventWhen(ev);

    if (seats > 0) {
      const code = await uniqueTicketCode(c);
      const upd = await c.query<RegistrationRow>(
        `UPDATE registrations SET status = 'confirmed', ticket_code = $2,
                waitlist_position = NULL, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [cur.id, code]
      );
      mails.push({
        to: cur.email,
        subject: SUBJECTS.approved(ev.title),
        eventId: ev.id,
        registrationId: cur.id,
        lines: [
          `Hello ${cur.display_name},`,
          `The host has approved your request, so you are in at ${ev.title}.`,
          `When: ${when} (${ev.time_zone}).`,
          `Where: ${ev.city}.`,
          `Your ticket code is ${upd.rows[0].ticket_code}.`,
        ],
      });
      return { registration: upd.rows[0], waitlisted: false, mails };
    }

    const m = await c.query<{ n: number | null }>(
      `SELECT max(waitlist_position) AS n FROM registrations
        WHERE event_id = $1 AND status = 'waitlisted'`,
      [ev.id]
    );
    const position = (m.rows[0].n ?? 0) + 1;
    const upd = await c.query<RegistrationRow>(
      `UPDATE registrations SET status = 'waitlisted', ticket_code = NULL,
              waitlist_position = $2, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [cur.id, position]
    );
    mails.push({
      to: cur.email,
      subject: SUBJECTS.waitlisted(ev.title),
      eventId: ev.id,
      registrationId: cur.id,
      lines: [
        `Hello ${cur.display_name},`,
        `${ev.title} is full, so your approved request has taken waiting-list place ${position}.`,
        `When: ${when} (${ev.time_zone}).`,
        `Where: ${ev.city}.`,
        `If a seat opens up we will write to you at once.`,
      ],
    });
    return { registration: upd.rows[0], waitlisted: true, mails };
  }).catch(rethrowWriteConflict);

  for (const m of out.mails) await sendMailSafe(m);
  return { registration: out.registration, waitlisted: out.waitlisted };
}

export async function declineRegistration(
  registrationId: string,
  hostAccountId: string
): Promise<RegistrationRow> {
  const out = await tx(async (c) => {
    const r = await c.query<RegistrationRow & { email: string; display_name: string }>(
      `SELECT r.*, a.email, a.display_name FROM registrations r
         JOIN accounts a ON a.id = r.account_id WHERE r.id = $1`,
      [registrationId]
    );
    if (!r.rowCount) throw notFound('That registration does not exist.');
    const ev = await lockEvent(c, r.rows[0].event_id);
    await assertOwnsEvent(c, ev, hostAccountId);
    const cur = r.rows[0];
    if (cur.status === 'declined')
      return { registration: cur as RegistrationRow, mails: [] as MailInput[] };
    if (cur.status !== 'pending_approval')
      throw badRequest('That request is no longer awaiting a decision.');

    const upd = await c.query<RegistrationRow>(
      `UPDATE registrations SET status = 'declined', ticket_code = NULL,
              waitlist_position = NULL, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [cur.id]
    );
    const mails: MailInput[] = [
      {
        to: cur.email,
        subject: SUBJECTS.declined(ev.title),
        eventId: ev.id,
        registrationId: cur.id,
        lines: [
          `Hello ${cur.display_name},`,
          `The host was not able to give you a place at ${ev.title} this time.`,
          `You are welcome to ask again if the host opens more seats for ${ev.title}, and there are other events to look through in the meantime.`,
        ],
      },
    ];
    return { registration: upd.rows[0], mails };
  });
  for (const m of out.mails) await sendMailSafe(m);
  return out.registration;
}

/* ------------------------------------------------------------------ */
/* Check in                                                            */
/* ------------------------------------------------------------------ */

export async function checkInTicket(
  ticketCode: string,
  hostAccountId: string
): Promise<{ registration: RegistrationRow; alreadyCheckedIn: boolean }> {
  return tx(async (c) => {
    const r = await c.query<RegistrationRow>(
      'SELECT * FROM registrations WHERE ticket_code = $1 FOR UPDATE',
      [ticketCode]
    );
    if (!r.rowCount) throw notFound('No ticket carries that code.');
    const cur = r.rows[0];
    const ev = (await c.query<EventRow>('SELECT * FROM events WHERE id = $1', [cur.event_id]))
      .rows[0];
    await assertOwnsEvent(c, ev, hostAccountId);

    // A second check-in of the same code records one arrival, not two.
    if (cur.status === 'checked_in') return { registration: cur, alreadyCheckedIn: true };
    if (cur.status !== 'confirmed')
      throw badRequest('That ticket does not hold a seat at this event.');

    const upd = await c.query<RegistrationRow>(
      `UPDATE registrations SET status = 'checked_in', checked_in_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'confirmed' RETURNING *`,
      [cur.id]
    );
    return { registration: upd.rows[0], alreadyCheckedIn: false };
  });
}

/* ------------------------------------------------------------------ */

export async function assertOwnsEvent(c: Client, ev: EventRow, accountId: string): Promise<void> {
  const r = await c.query<{ owner_account_id: string }>(
    'SELECT owner_account_id FROM calendars WHERE id = $1',
    [ev.calendar_id]
  );
  if (!r.rowCount || r.rows[0].owner_account_id !== accountId)
    throw notFound('That event does not exist.');
}

export async function ownsEvent(eventId: string, accountId: string | null): Promise<boolean> {
  if (!accountId) return false;
  const r = await query(
    `SELECT 1 FROM events e JOIN calendars c ON c.id = e.calendar_id
      WHERE e.id = $1 AND c.owner_account_id = $2`,
    [eventId, accountId]
  );
  return !!r.rowCount;
}

export { rethrowWriteConflict };
