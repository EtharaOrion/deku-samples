import { PoolClient } from 'pg';
import { ticketCode } from './util.js';
import {
  sendMail, confirmationMail, waitlistMail, pendingMail,
  approvedMail, declinedMail, promotedMail,
} from '../mail/mailer.js';

export interface RegistrationRow {
  id: string; event_id: string; account_id: string; status: string;
  waitlist_position: number | null; ticket_code: string | null;
  checked_in_at: string | null;
  created_at: string; updated_at: string;
}

export interface EventRow {
  id: string; calendar_id: string; title: string; slug: string; category: string; city: string;
  time_zone: string; cover_seed: string; theme_hex: string; description: string;
  starts_at: string; ends_at: string; capacity: number;
  approval_required: boolean; waitlist_enabled: boolean; state: string;
  published_at: string | null; cancelled_at: string | null; cancel_reason: string | null;
}

export const SEAT_STATUSES = `('confirmed','checked_in')`;

/** Locks the event row so two requests cannot decide about the last seat together. */
export async function lockEvent(tx: PoolClient, eventId: string): Promise<EventRow> {
  const { rows } = await tx.query<EventRow>(
    `SELECT * FROM events WHERE id = $1 FOR UPDATE`, [eventId]
  );
  if (!rows[0]) throw new Error('event not found');
  return rows[0];
}

export async function myRegistration(tx: PoolClient, eventId: string, accountId: string): Promise<RegistrationRow | null> {
  const { rows } = await tx.query<RegistrationRow>(
    `SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2`, [eventId, accountId]
  );
  return rows[0] ?? null;
}

export async function confirmedCount(tx: PoolClient, eventId: string): Promise<number> {
  const { rows } = await tx.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM registrations WHERE event_id = $1 AND status IN ('confirmed','checked_in')`, [eventId]
  );
  return Number(rows[0].n);
}

export async function nextWaitlistPosition(tx: PoolClient, eventId: string): Promise<number> {
  const { rows } = await tx.query<{ n: string }>(
    `SELECT coalesce(max(waitlist_position), 0)::text AS n FROM registrations WHERE event_id = $1 AND status = 'waitlisted'`, [eventId]
  );
  return Number(rows[0].n) + 1;
}

export interface MailRef { event: EventRow; account: { email: string; display_name: string } }

/** Sends after the transaction commits, so a rolled-back seat sends nothing. */
export async function flushMail(queue: { to: string; subject: string; text: string; registrationId?: string; eventId?: string }[]) {
  for (const m of queue) {
    await sendMail({ to: m.to, subject: m.subject, text: m.text, registrationId: m.registrationId, eventId: m.eventId });
  }
}

/**
 * The seat-allocating transition. Must run inside a transaction that holds
 * the event row lock. Places the account on the waitlist or confirms them.
 */
export async function placeOnSeatOrWaitlist(
  tx: PoolClient,
  ev: EventRow,
  account: { id: string; email: string; display_name: string },
  registrationId: string,
  mail: { to: string; subject: string; text: string; registrationId?: string; eventId?: string }[]
): Promise<RegistrationRow> {
  const seats = await confirmedCount(tx, ev.id);
  if (seats < ev.capacity) {
    const code = ticketCode();
    await tx.query(
      `UPDATE registrations SET status='confirmed', ticket_code=$2, waitlist_position=NULL, updated_at=now() WHERE id=$1`,
      [registrationId, code]
    );
    mail.push({ to: account.email, ...confirmationMail({ ...ev, ticket_code: code }), registrationId, eventId: ev.id });
    const { rows } = await tx.query<RegistrationRow>(`SELECT * FROM registrations WHERE id=$1`, [registrationId]);
    return rows[0];
  }
  if (ev.waitlist_enabled) {
    const pos = await nextWaitlistPosition(tx, ev.id);
    await tx.query(
      `UPDATE registrations SET status='waitlisted', waitlist_position=$2, ticket_code=NULL, updated_at=now() WHERE id=$1`,
      [registrationId, pos]
    );
    mail.push({ to: account.email, ...waitlistMail(ev, pos), registrationId, eventId: ev.id });
    const { rows } = await tx.query<RegistrationRow>(`SELECT * FROM registrations WHERE id=$1`, [registrationId]);
    return rows[0];
  }
  throw Object.assign(new Error(`This event just filled up.`), { statusCode: 409, full: true });
}

/** Promotes waiting-list position 1 and issues a ticket, after a seat frees. */
export async function promoteHeadOfWaitlist(
  tx: PoolClient,
  ev: EventRow,
  mail: { to: string; subject: string; text: string; registrationId?: string; eventId?: string }[]
): Promise<void> {
  if (ev.state === 'registration_closed') return;
  const seats = await confirmedCount(tx, ev.id);
  if (seats >= ev.capacity) return;
  const { rows } = await tx.query<{ id: string; email: string; display_name: string }>(
    `SELECT r.id, a.email, a.display_name
       FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1 AND r.status = 'waitlisted'
      ORDER BY r.waitlist_position ASC LIMIT 1`,
    [ev.id]
  );
  const head = rows[0];
  if (!head) return;
  const code = ticketCode();
  await tx.query(
    `UPDATE registrations SET status='confirmed', ticket_code=$2, waitlist_position=NULL, updated_at=now() WHERE id=$1`,
    [head.id, code]
  );
  mail.push({ to: head.email, ...promotedMail({ ...ev, ticket_code: code }), registrationId: head.id, eventId: ev.id });
  await renumberWaitlist(tx, ev.id);
}

export async function renumberWaitlist(tx: PoolClient, eventId: string): Promise<void> {
  await tx.query(
    `WITH ordered AS (
       SELECT id, row_number() OVER (ORDER BY waitlist_position ASC) AS rn
         FROM registrations WHERE event_id = $1 AND status = 'waitlisted'
     )
     UPDATE registrations r SET waitlist_position = o.rn FROM ordered o WHERE r.id = o.id AND r.waitlist_position <> o.rn`,
    [eventId]
  );
}
