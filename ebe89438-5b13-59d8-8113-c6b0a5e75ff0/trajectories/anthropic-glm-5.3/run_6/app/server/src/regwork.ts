import type { PoolClient } from 'pg';
import { ApiError, newId, newTicketCode, utcNowRfc3339 } from './util.js';
import {
  approvedSubject, cancelledSubject, confirmedSubject, declinedSubject, fmtDay, fmtTime,
  queue, seatSubject, waitlistedSubject, type MailJob,
} from './mail.js';

type Ev = {
  id: string; slug: string; title: string; city: string; time_zone: string; starts_at: string;
  capacity: number; approval_required: boolean; waitlist_enabled: boolean; state: string;
};

export async function getEventForUpdate(c: PoolClient, slug: string): Promise<Ev | null> {
  const r = await c.query(
    'SELECT id, slug, title, city, time_zone, starts_at::text AS starts_at, capacity, approval_required, waitlist_enabled, state FROM events WHERE slug = $1 FOR UPDATE',
    [slug],
  );
  return (r.rows[0] as Ev) ?? null;
}

export async function confirmedCount(c: PoolClient, eventId: string): Promise<number> {
  const r = await c.query(
    `SELECT count(*)::int AS n FROM registrations WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
    [eventId],
  );
  return r.rows[0].n;
}

export function waitlistBody(ev: Ev, position: number): string {
  return `${ev.title}\n${fmtDay(ev.starts_at, ev.time_zone)} at ${fmtTime(ev.starts_at, ev.time_zone)} (${ev.time_zone})\n${ev.city}\nYou are number ${position} on the waiting list. We will let you know if a seat opens up.`;
}

export function seatBody(ev: Ev, code: string): string {
  return `${ev.title}\n${fmtDay(ev.starts_at, ev.time_zone)} at ${fmtTime(ev.starts_at, ev.time_zone)} (${ev.time_zone})\n${ev.city}\nA seat opened up and it is yours. Your ticket code is ${code}.`;
}

/**
 * Promote waitlist position 1 if a seat is free. Caller holds the event row lock.
 * Returns the promotion, if one happened.
 */
export async function promoteHead(
  c: PoolClient,
  ev: Ev,
  jobs: MailJob[],
): Promise<{ id: string; ticket_code: string; email: string } | null> {
  const free = ev.capacity - (await confirmedCount(c, ev.id));
  if (free <= 0) return null;
  const head = await c.query(
    `SELECT r.id, a.email FROM registrations r JOIN accounts a ON a.id = r.account_id
     WHERE r.event_id = $1 AND r.status = 'waitlisted' ORDER BY r.waitlist_position ASC, r.created_at ASC LIMIT 1 FOR UPDATE OF r`,
    [ev.id],
  );
  if (!head.rows[0]) return null;
  const row = head.rows[0];
  const code = newTicketCode();
  await c.query(`UPDATE registrations SET status='confirmed', waitlist_position=NULL, ticket_code=$2, updated_at=$3 WHERE id=$1`, [row.id, code, utcNowRfc3339()]);
  await renumberWaitlist(c, ev.id);
  queue(jobs, row.email, seatSubject(ev.title), seatBody(ev, code), ev.id, row.id);
  return { id: row.id, ticket_code: code, email: row.email };
}

export async function renumberWaitlist(c: PoolClient, eventId: string): Promise<void> {
  await c.query(
    `WITH ordered AS (
       SELECT id, row_number() OVER (ORDER BY waitlist_position ASC NULLS LAST, created_at ASC) AS rn
       FROM registrations WHERE event_id = $1 AND status = 'waitlisted'
     )
     UPDATE registrations r SET waitlist_position = o.rn, updated_at = $2 FROM ordered o WHERE r.id = o.id`,
    [eventId, utcNowRfc3339()],
  );
}

export async function issueUniqueTicket(c: PoolClient, regId: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = newTicketCode();
    try {
      const u = await c.query(`UPDATE registrations SET ticket_code = $2 WHERE id = $1 RETURNING ticket_code`, [regId, code]);
      if (u.rows[0]) return u.rows[0].ticket_code;
    } catch (e: any) {
      if (e && e.code === '23505') continue;
      throw e;
    }
  }
  throw new ApiError(500, 'Could not issue a ticket code. Please try again.');
}

/** Take as many waiting guests as the new free seats allow. */
export async function promoteByRaise(
  c: PoolClient,
  ev: Ev,
  oldCapacity: number,
  newCapacity: number,
  jobs: MailJob[],
): Promise<number> {
  if (newCapacity <= oldCapacity) return 0;
  let moved = 0;
  // promoteHead re-counts confirmed each turn and stops when full or empty
  for (let i = 0; i < newCapacity - oldCapacity; i++) {
    const p = await promoteHead(c, ev, jobs);
    if (!p) break;
    moved++;
  }
  await renumberWaitlist(c, ev.id);
  return moved;
}

