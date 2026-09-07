import type { Client } from './db.js';
import { withTx, query } from './db.js';
import { HttpError, badRequest, newTicketCode, notFound } from './util.js';
import type { EventBrief, MailKind } from './mail.js';

export interface EventRow {
  id: string;
  calendar_id: string;
  title: string;
  slug: string;
  category: string | null;
  city: string | null;
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
  id: string;
  event_id: string;
  account_id: string;
  status: string;
  waitlist_position: number | null;
  seat_no: number | null;
  ticket_code: string | null;
  checked_in_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Recipient {
  email: string;
  display_name: string;
}

export interface MailTask {
  kind: MailKind;
  event: EventBrief;
  recipient: Recipient;
  registrationId: string | null;
  extra: { ticket?: string | null; position?: number | null; reason?: string };
}

export function eventBrief(ev: EventRow): EventBrief {
  return { id: ev.id, title: ev.title, slug: ev.slug, starts_at: ev.starts_at, time_zone: ev.time_zone, city: ev.city };
}

export async function lockEventBySlug(c: Client, slug: string): Promise<EventRow> {
  const r = await c.query<EventRow>('SELECT * FROM events WHERE slug = $1 FOR UPDATE', [slug]);
  if (!r.rowCount) throw notFound();
  return r.rows[0];
}

export async function lockEventById(c: Client, id: string): Promise<EventRow> {
  const r = await c.query<EventRow>('SELECT * FROM events WHERE id = $1 FOR UPDATE', [id]);
  if (!r.rowCount) throw notFound();
  return r.rows[0];
}

export async function confirmedCount(c: Client | null, eventId: string): Promise<number> {
  const runner = c ?? { query };
  const r = await (runner as any).query(
    "SELECT count(*)::int AS n FROM registrations WHERE event_id = $1 AND status IN ('confirmed','checked_in')",
    [eventId],
  );
  return r.rows[0].n as number;
}

async function nextFreeSeat(c: Client, eventId: string, capacity: number): Promise<number | null> {
  const r = await c.query<{ seat: number | null }>(
    `SELECT min(s)::int AS seat FROM generate_series(1, $2) s
      WHERE NOT EXISTS (SELECT 1 FROM registrations r WHERE r.event_id = $1 AND r.seat_no = s)`,
    [eventId, capacity],
  );
  return r.rows[0].seat ?? null;
}

async function nextWaitlistPosition(c: Client, eventId: string): Promise<number> {
  const r = await c.query<{ n: number | null }>(
    'SELECT max(waitlist_position)::int AS n FROM registrations WHERE event_id = $1',
    [eventId],
  );
  return (r.rows[0].n ?? 0) + 1;
}

async function uniqueTicket(c: Client): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = newTicketCode();
    const r = await c.query('SELECT 1 FROM registrations WHERE ticket_code = $1', [code]);
    if (!r.rowCount) return code;
  }
  throw new HttpError(500, 'could not allocate a ticket code');
}

/** Renumber waitlist positions to 1..n with no gaps, preserving order. */
async function renumberWaitlist(c: Client, eventId: string): Promise<void> {
  // Two phases, because the partial unique index on (event_id, waitlist_position)
  // is checked row by row: park the numbers above any live value, then bring them down.
  const OFFSET = 1_000_000;
  await c.query(
    `WITH ordered AS (
       SELECT id, row_number() OVER (ORDER BY waitlist_position, created_at, id) AS rn
         FROM registrations WHERE event_id = $1 AND status = 'waitlisted'
     )
     UPDATE registrations r SET waitlist_position = ${OFFSET} + o.rn, updated_at = now()
       FROM ordered o WHERE r.id = o.id`,
    [eventId],
  );
  await c.query(
    `UPDATE registrations SET waitlist_position = waitlist_position - ${OFFSET}
       WHERE event_id = $1 AND status = 'waitlisted' AND waitlist_position > ${OFFSET}`,
    [eventId],
  );
}

async function recipientOf(c: Client, accountId: string): Promise<Recipient> {
  const r = await c.query<Recipient>('SELECT email, display_name FROM accounts WHERE id = $1', [accountId]);
  return r.rows[0];
}

/** Promote as many waitlisted registrations as there are free seats. Returns mail tasks. */
export async function promoteFromWaitlist(c: Client, ev: EventRow, maxToPromote = Number.MAX_SAFE_INTEGER): Promise<MailTask[]> {
  const tasks: MailTask[] = [];
  if (!ev.capacity) return tasks;
  let promoted = 0;
  while (promoted < maxToPromote) {
    const seat = await nextFreeSeat(c, ev.id, ev.capacity);
    if (seat === null) break;
    const head = await c.query<RegistrationRow>(
      `SELECT * FROM registrations WHERE event_id = $1 AND status = 'waitlisted'
        ORDER BY waitlist_position ASC LIMIT 1 FOR UPDATE`,
      [ev.id],
    );
    if (!head.rowCount) break;
    const reg = head.rows[0];
    const code = await uniqueTicket(c);
    await c.query(
      `UPDATE registrations SET status = 'confirmed', seat_no = $2, ticket_code = $3,
         waitlist_position = NULL, updated_at = now() WHERE id = $1`,
      [reg.id, seat, code],
    );
    tasks.push({
      kind: 'promoted',
      event: eventBrief(ev),
      recipient: await recipientOf(c, reg.account_id),
      registrationId: reg.id,
      extra: { ticket: code },
    });
    promoted++;
  }
  if (promoted > 0) await renumberWaitlist(c, ev.id);
  return tasks;
}

export interface RegisterOutcome {
  registration: RegistrationRow;
  mails: MailTask[];
  promotedCount?: number;
}

/**
 * Register the account for the event. The event row is locked for the whole
 * transaction, a seat number is allocated from the free set, and the unique
 * (event_id, seat_no) index plus the capacity trigger make the invariant a
 * property of the database rather than of this function.
 */
export async function registerForEvent(accountId: string, slug: string): Promise<RegisterOutcome> {
  return withTx(async (c) => {
    const ev = await lockEventBySlug(c, slug);
    if (ev.state === 'draft') throw notFound();
    if (ev.state === 'cancelled') throw badRequest('This event has been cancelled, so registration is not possible.');
    if (ev.state === 'registration_closed')
      throw badRequest('Registration is closed for this event, so no new registration can be taken.');
    if (!ev.capacity) throw badRequest('This event is not open for registration yet.');
    if (ev.ends_at && ev.ends_at.getTime() < Date.now())
      throw badRequest('This event has already ended, so registration is not possible.');

    const existing = await c.query<RegistrationRow>(
      'SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2 FOR UPDATE',
      [ev.id, accountId],
    );
    const prev = existing.rows[0];
    if (prev && ['confirmed', 'checked_in', 'waitlisted', 'pending_approval'].includes(prev.status)) {
      return { registration: prev, mails: [] };
    }

    const mails: MailTask[] = [];
    const recipient = await recipientOf(c, accountId);

    const write = async (fields: {
      status: string;
      seat_no: number | null;
      ticket_code: string | null;
      waitlist_position: number | null;
    }): Promise<RegistrationRow> => {
      if (prev) {
        const r = await c.query<RegistrationRow>(
          `UPDATE registrations SET status = $2, seat_no = $3, ticket_code = $4, waitlist_position = $5,
             checked_in_at = NULL, updated_at = now() WHERE id = $1 RETURNING *`,
          [prev.id, fields.status, fields.seat_no, fields.ticket_code, fields.waitlist_position],
        );
        return r.rows[0];
      }
      const r = await c.query<RegistrationRow>(
        `INSERT INTO registrations (event_id, account_id, status, seat_no, ticket_code, waitlist_position)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [ev.id, accountId, fields.status, fields.seat_no, fields.ticket_code, fields.waitlist_position],
      );
      return r.rows[0];
    };

    if (ev.approval_required) {
      const reg = await write({ status: 'pending_approval', seat_no: null, ticket_code: null, waitlist_position: null });
      mails.push({ kind: 'pending', event: eventBrief(ev), recipient, registrationId: reg.id, extra: {} });
      return { registration: reg, mails };
    }

    const seat = await nextFreeSeat(c, ev.id, ev.capacity);
    if (seat !== null) {
      const code = await uniqueTicket(c);
      const reg = await write({ status: 'confirmed', seat_no: seat, ticket_code: code, waitlist_position: null });
      mails.push({ kind: 'confirmed', event: eventBrief(ev), recipient, registrationId: reg.id, extra: { ticket: code } });
      return { registration: reg, mails };
    }

    if (!ev.waitlist_enabled) {
      throw badRequest('This event is full and its waiting list is closed.');
    }
    const position = await nextWaitlistPosition(c, ev.id);
    const reg = await write({ status: 'waitlisted', seat_no: null, ticket_code: null, waitlist_position: position });
    mails.push({ kind: 'waitlisted', event: eventBrief(ev), recipient, registrationId: reg.id, extra: { position } });
    return { registration: reg, mails };
  });
}

export async function cancelOwnRegistration(accountId: string, registrationId: string): Promise<RegisterOutcome> {
  return withTx(async (c) => {
    const found = await c.query<RegistrationRow>('SELECT * FROM registrations WHERE id = $1', [registrationId]);
    if (!found.rowCount) throw notFound();
    if (found.rows[0].account_id !== accountId) throw notFound();
    const ev = await lockEventById(c, found.rows[0].event_id);
    const again = await c.query<RegistrationRow>('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [registrationId]);
    const reg = again.rows[0];
    if (['cancelled_by_guest', 'cancelled_by_host'].includes(reg.status)) {
      return { registration: reg, mails: [] };
    }
    const updated = await c.query<RegistrationRow>(
      `UPDATE registrations SET status = 'cancelled_by_guest', seat_no = NULL, ticket_code = NULL,
         waitlist_position = NULL, checked_in_at = NULL, updated_at = now() WHERE id = $1 RETURNING *`,
      [registrationId],
    );
    await renumberWaitlist(c, ev.id);
    let mails: MailTask[] = [];
    if (ev.state === 'published') {
      mails = await promoteFromWaitlist(c, ev);
    }
    return { registration: updated.rows[0], mails };
  });
}

export async function approveRegistration(hostId: string, registrationId: string): Promise<RegisterOutcome & { waitlisted: boolean }> {
  return withTx(async (c) => {
    const found = await c.query<RegistrationRow>('SELECT * FROM registrations WHERE id = $1', [registrationId]);
    if (!found.rowCount) throw notFound();
    const ev = await lockEventById(c, found.rows[0].event_id);
    await assertOwner(c, ev, hostId);
    const reg = (await c.query<RegistrationRow>('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [registrationId])).rows[0];
    if (['confirmed', 'checked_in'].includes(reg.status)) return { registration: reg, mails: [], waitlisted: false };
    if (reg.status !== 'pending_approval' && reg.status !== 'waitlisted')
      throw badRequest('Only a request awaiting approval can be approved.');
    if (ev.state === 'cancelled') throw badRequest('This event has been cancelled.');
    const recipient = await recipientOf(c, reg.account_id);
    const seat = ev.capacity ? await nextFreeSeat(c, ev.id, ev.capacity) : null;
    if (seat !== null) {
      const code = await uniqueTicket(c);
      const updated = await c.query<RegistrationRow>(
        `UPDATE registrations SET status = 'confirmed', seat_no = $2, ticket_code = $3, waitlist_position = NULL,
           updated_at = now() WHERE id = $1 RETURNING *`,
        [reg.id, seat, code],
      );
      await renumberWaitlist(c, ev.id);
      return {
        registration: updated.rows[0],
        mails: [{ kind: 'approved', event: eventBrief(ev), recipient, registrationId: reg.id, extra: { ticket: code } }],
        waitlisted: false,
      };
    }
    if (!ev.waitlist_enabled) throw badRequest('This event is full and its waiting list is closed.');
    if (reg.status === 'waitlisted') return { registration: reg, mails: [], waitlisted: true };
    const position = await nextWaitlistPosition(c, ev.id);
    const updated = await c.query<RegistrationRow>(
      `UPDATE registrations SET status = 'waitlisted', waitlist_position = $2, updated_at = now()
         WHERE id = $1 RETURNING *`,
      [reg.id, position],
    );
    await renumberWaitlist(c, ev.id);
    return {
      registration: updated.rows[0],
      mails: [{ kind: 'waitlisted', event: eventBrief(ev), recipient, registrationId: reg.id, extra: { position } }],
      waitlisted: true,
    };
  });
}

export async function declineRegistration(hostId: string, registrationId: string): Promise<RegisterOutcome> {
  return withTx(async (c) => {
    const found = await c.query<RegistrationRow>('SELECT * FROM registrations WHERE id = $1', [registrationId]);
    if (!found.rowCount) throw notFound();
    const ev = await lockEventById(c, found.rows[0].event_id);
    await assertOwner(c, ev, hostId);
    const reg = (await c.query<RegistrationRow>('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [registrationId])).rows[0];
    if (reg.status === 'declined') return { registration: reg, mails: [] };
    const recipient = await recipientOf(c, reg.account_id);
    const updated = await c.query<RegistrationRow>(
      `UPDATE registrations SET status = 'declined', seat_no = NULL, ticket_code = NULL, waitlist_position = NULL,
         checked_in_at = NULL, updated_at = now() WHERE id = $1 RETURNING *`,
      [reg.id],
    );
    await renumberWaitlist(c, ev.id);
    const mails: MailTask[] = [
      { kind: 'declined', event: eventBrief(ev), recipient, registrationId: reg.id, extra: {} },
    ];
    if (ev.state === 'published' && reg.seat_no !== null) {
      mails.push(...(await promoteFromWaitlist(c, ev)));
    }
    return { registration: updated.rows[0], mails };
  });
}

export async function assertOwner(c: Client, ev: EventRow, accountId: string): Promise<void> {
  const r = await c.query<{ owner_account_id: string }>('SELECT owner_account_id FROM calendars WHERE id = $1', [ev.calendar_id]);
  if (!r.rowCount || r.rows[0].owner_account_id !== accountId) throw notFound();
}

export async function checkInTicket(hostId: string, code: string): Promise<{ registration: RegistrationRow; alreadyIn: boolean }> {
  return withTx(async (c) => {
    const found = await c.query<RegistrationRow>('SELECT * FROM registrations WHERE ticket_code = $1', [code]);
    if (!found.rowCount) throw notFound();
    const ev = await lockEventById(c, found.rows[0].event_id);
    await assertOwner(c, ev, hostId);
    const reg = (await c.query<RegistrationRow>('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [found.rows[0].id])).rows[0];
    if (reg.status === 'checked_in') return { registration: reg, alreadyIn: true };
    if (reg.status !== 'confirmed') throw badRequest('Only a confirmed ticket can be checked in.');
    const updated = await c.query<RegistrationRow>(
      `UPDATE registrations SET status = 'checked_in', checked_in_at = now(), updated_at = now()
         WHERE id = $1 RETURNING *`,
      [reg.id],
    );
    return { registration: updated.rows[0], alreadyIn: false };
  });
}
