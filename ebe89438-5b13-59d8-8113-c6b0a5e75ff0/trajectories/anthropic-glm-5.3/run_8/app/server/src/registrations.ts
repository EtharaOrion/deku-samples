import type { PoolClient } from 'pg';
import { newTicketCode, shortId } from './config.js';
import { bad, full as fullErr } from './http.js';
import { sendMail, type MailKind } from './mail.js';

export type RegStatus =
  | 'pending_approval' | 'confirmed' | 'waitlisted' | 'declined'
  | 'cancelled_by_guest' | 'cancelled_by_host' | 'checked_in';

export const SEAT_STATUSES: RegStatus[] = ['confirmed', 'checked_in'];

export interface RegRow {
  id: string;
  event_id: string;
  account_id: string;
  status: RegStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface GuestFacts {
  id: string;
  email: string;
  display_name: string;
}

export interface EventLite {
  id: string;
  slug: string;
  title: string;
  city: string;
  starts_at: Date;
  time_zone: string;
  capacity: number;
  waitlist_enabled: boolean;
  approval_required: boolean;
  state: 'draft' | 'published' | 'registration_closed' | 'cancelled';
}

export class DbConflict extends Error {
  kind: 'unique_reg' | 'waitlist_taken' | 'event_full';
  constructor(kind: 'unique_reg' | 'waitlist_taken' | 'event_full', message: string) {
    super(message);
    this.kind = kind;
  }
}

export function isDbError(err: unknown, constraintHint?: string): boolean {
  const e = err as { code?: string; message?: string };
  if (e?.code === '23505' || e?.code === '23P01' || e?.code === '23514') return true;
  if (e?.message?.includes('GATHER_EVENT_FULL')) return true;
  if (constraintHint && e?.message?.includes(constraintHint)) return true;
  return false;
}

export function newRegId(): string {
  return `rg${shortId(14)}`;
}

export async function lockEvent(tx: PoolClient, eventId: string): Promise<void> {
  await tx.query(`SELECT 1 FROM events WHERE id = $1 FOR UPDATE`, [eventId]);
}

export async function seatCount(tx: PoolClient, eventId: string): Promise<number> {
  const res = await tx.query<{ n: string }>(
    `SELECT count(*)::int AS n FROM registrations WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
    [eventId],
  );
  return Number(res.rows[0]?.n ?? 0);
}

export async function confirmedCount(tx: PoolClient, eventId: string): Promise<number> {
  return seatCount(tx, eventId);
}

/** Mints a code the database has not handed out yet. */
export async function mintTicket(tx: PoolClient): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = newTicketCode();
    const res = await tx.query(`SELECT 1 FROM registrations WHERE ticket_code = $1`, [code]);
    if ((res.rowCount ?? 0) === 0) return code;
  }
  throw new Error('could not mint a ticket code');
}

/** Attaches a fresh code to a registration that now holds a seat. */
export async function issueTicket(tx: PoolClient, regId: string): Promise<string> {
  const held = await tx.query<{ ticket_code: string }>(`SELECT ticket_code FROM registrations WHERE id = $1`, [regId]);
  if (held.rows[0]?.ticket_code) return held.rows[0].ticket_code;
  const code = await mintTicket(tx);
  await tx.query(`UPDATE registrations SET ticket_code = $1 WHERE id = $2 AND ticket_code IS NULL`, [code, regId]);
  return code;
}

export async function clearTicket(tx: PoolClient, regId: string): Promise<void> {
  await tx.query(`UPDATE registrations SET ticket_code = NULL WHERE id = $1`, [regId]);
}

export async function nextWaitlistPosition(tx: PoolClient, eventId: string): Promise<number> {
  const res = await tx.query<{ max: number | null }>(
    `SELECT max(waitlist_position) AS max FROM registrations WHERE event_id = $1 AND status = 'waitlisted'`,
    [eventId],
  );
  return (res.rows[0]?.max ?? 0) + 1;
}

export async function renumberWaitlist(tx: PoolClient, eventId: string): Promise<void> {
  await tx.query(
    `WITH ordered AS (
       SELECT id, row_number() OVER (ORDER BY waitlist_position ASC NULLS LAST, created_at ASC, id ASC) AS rn
       FROM registrations WHERE event_id = $1 AND status = 'waitlisted'
     )
     UPDATE registrations r SET waitlist_position = ordered.rn, updated_at = now()
     FROM ordered WHERE r.id = ordered.id AND r.waitlist_position IS DISTINCT FROM ordered.rn`,
    [eventId],
  );
}

/** Fills seats freed by a raise or a cancellation from the head of the waiting list. */
export interface Promotion { regId: string; accountId: string; position: number; ticketCode: string; guest: GuestFacts }

export async function promoteFromWaitlist(
  tx: PoolClient,
  ev: EventLite,
): Promise<Promotion[]> {
  const out: Promotion[] = [];
  for (let guard = 0; guard < 5000; guard++) {
    const seats = await seatCount(tx, ev.id);
    if (seats >= ev.capacity) break;
    const head = await tx.query<RegRow & GuestFacts>(
      `SELECT r.*, a.email, a.display_name FROM registrations r
         JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1 AND r.status = 'waitlisted'
        ORDER BY r.waitlist_position ASC NULLS LAST, r.created_at ASC LIMIT 1 FOR UPDATE`,
      [ev.id],
    );
    const row = head.rows[0];
    if (!row) break;
    const ticketCode = await mintTicket(tx);
    await tx.query(
      `UPDATE registrations SET status = 'confirmed', waitlist_position = NULL, ticket_code = $2, updated_at = now() WHERE id = $1`,
      [row.id, ticketCode],
    );
    out.push({ regId: row.id, accountId: row.account_id, position: row.waitlist_position ?? 1, ticketCode, guest: { id: row.account_id, email: row.email, display_name: row.display_name } });
  }
  await renumberWaitlist(tx, ev.id);
  return out;
}

export async function mailPromoted(tx: PoolClient, ev: EventLite, promos: Promotion[]): Promise<void> {
  for (const p of promos) {
    await sendMail(tx, 'promoted', ev, p.guest.email, p.guest.display_name, {
      ticketCode: p.ticketCode, registrationId: p.regId, eventId: ev.id,
    });
  }
}

/** Frees a seat and, unless registration is closed, promotes the head of the list. */
export async function releaseSeatAndPromote(tx: PoolClient, ev: EventLite, regId: string, closedBlocksPromotion: boolean): Promise<Promotion[]> {
  await clearTicket(tx, regId);
  if (closedBlocksPromotion) {
    await renumberWaitlist(tx, ev.id);
    return [];
  }
  return promoteFromWaitlist(tx, ev);
}

export async function getEventLiteBySlug(tx: PoolClient, slug: string): Promise<(EventLite & { calendar_slug: string; owner_account_id: string }) | null> {
  const res = await tx.query<EventLite & { calendar_slug: string; owner_account_id: string }>(
    `SELECT e.id, e.slug, e.title, e.city, e.starts_at, e.time_zone, e.capacity,
            e.waitlist_enabled, e.approval_required, e.state, c.slug AS calendar_slug,
            c.owner_account_id AS owner_account_id
       FROM events e JOIN calendars c ON c.id = e.calendar_id
      WHERE e.slug = $1`,
    [slug],
  );
  return res.rows[0] ?? null;
}

export function assertRegistrationOpen(ev: EventLite): void {
  if (ev.state === 'cancelled') throw bad('This event has been called off, so registration is closed.');
  if (ev.state === 'registration_closed') throw bad('Registration is closed for this event.');
  if (ev.state === 'draft') throw bad('This event is not open for registration yet.');
}

export function mailKindForNewRegistration(ev: EventLite, status: RegStatus): MailKind {
  if (status === 'pending_approval') return 'awaiting';
  if (status === 'confirmed') return 'confirmed';
  return 'waitlisted';
}

export { sendMail };
