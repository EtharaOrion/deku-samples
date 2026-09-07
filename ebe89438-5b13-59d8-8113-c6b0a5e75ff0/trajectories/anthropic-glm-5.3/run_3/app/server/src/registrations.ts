import { randomBytes } from 'node:crypto';
import { config } from './config.ts';
import type { Tx } from './db.ts';
import { bad, notFound } from './errors.ts';
import { toZulu } from './validate.ts';

export type RegStatus =
  | 'pending_approval' | 'confirmed' | 'waitlisted'
  | 'declined' | 'cancelled_by_guest' | 'cancelled_by_host' | 'checked_in';

/** `TKT-` plus 8 uppercase letters and digits. */
export function newTicketCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const raw = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[raw[i] % alphabet.length];
  return `TKT-${out}`;
}

export type MailJob = {
  registration_id: number | null;
  event_id: number | null;
  recipient: string;
  subject: string;
  body: string;
};

export function subject(kind: MailKind, title: string): string {
  switch (kind) {
    case 'confirmed': return `You're going to ${title}`;
    case 'pending': return `Your request to join ${title}`;
    case 'approved': return `You're in: ${title}`;
    case 'declined': return `About your request to join ${title}`;
    case 'waitlisted': return `You're on the waiting list for ${title}`;
    case 'seat_from_waitlist': return `A spot opened up for ${title}`;
    case 'cancelled_event': return `${title} has been cancelled`;
    case 'time_changed': return `New time for ${title}`;
    case 'place_changed': return `New location for ${title}`;
  }
}
export type MailKind =
  | 'confirmed' | 'pending' | 'approved' | 'declined' | 'waitlisted'
  | 'seat_from_waitlist' | 'cancelled_event' | 'time_changed' | 'place_changed';

export type EventRow = {
  id: number; calendar_id: number; title: string; slug: string; category: string;
  city: string; time_zone: string; cover_seed: string; theme_hex: string;
  description: string; starts_at: string; ends_at: string; capacity: number;
  approval_required: boolean; waitlist_enabled: boolean;
  state: 'draft' | 'published' | 'registration_closed' | 'cancelled';
  published_at: string | null; cancelled_at: string | null;
  cancel_reason: string | null; created_at: string; updated_at: string;
};

export async function lockEvent(tx: Tx, slug: string): Promise<EventRow | null> {
  const r = await tx.query('select * from events where slug = $1 for update', [slug]);
  return r.rows[0] ?? null;
}

export async function lockEventById(tx: Tx, id: number): Promise<EventRow | null> {
  const r = await tx.query('select * from events where id = $1 for update', [id]);
  return r.rows[0] ?? null;
}

export function heldSeatsSql(eventId: number): string {
  return `select count(*)::int as n from registrations where event_id = ${eventId} and status in ('confirmed','checked_in')`;
}

export function mailBody(kind: MailKind, e: { title: string; slug: string }, extra?: string): string {
  const url = `${config.publicUrl}/${e.slug}`;
  switch (kind) {
    case 'confirmed':
      return `You have a seat at ${e.title}.\n\nYour ticket and the event details are here:\n${config.publicUrl}/home\n\nIf you can no longer come, please cancel so someone else can take the seat.`;
    case 'pending':
      return `Your request to join ${e.title} has reached the host and is waiting for a decision.\n\nYou hold no seat until the host approves it.\n\nEvent page: ${url}`;
    case 'approved':
      return `The host approved your request. You now hold a seat at ${e.title}.\n\nEvent page: ${url}`;
    case 'declined':
      return `The host could not take your request to join ${e.title} this time.\n\nEvent page: ${url}`;
    case 'waitlisted':
      return `${e.title} is full, so you are on the waiting list.\n\nIf a seat opens you move up automatically and we will write to you.\n\nEvent page: ${url}`;
    case 'seat_from_waitlist':
      return `A seat opened at ${e.title} and it is yours.\n\nEvent page: ${url}`;
    case 'cancelled_event':
      return `${e.title} has been cancelled.\n\nThe host wrote:\n\n${extra ?? ''}\n\nEvent page: ${url}`;
    case 'time_changed':
      return `The time of ${e.title} changed.\n\nIt now starts ${extra}.\n\nEvent page: ${url}`;
    case 'place_changed':
      return `The location of ${e.title} changed.\n\nIt now takes place in ${extra}.\n\nEvent page: ${url}`;
  }
}

/** Renumber the waiting list 1..n with no gaps. */
export async function renumberWaitlist(tx: Tx, eventId: number): Promise<void> {
  await tx.query(
    `with ordered as (
       select id, row_number() over (order by waitlist_position asc, created_at asc, id asc) as rn
       from registrations
       where event_id = $1 and status = 'waitlisted'
     )
     update registrations r set waitlist_position = o.rn, updated_at = now()
     from ordered o where r.id = o.id and r.waitlist_position is distinct from o.rn`,
    [eventId]
  );
}

/**
 * Fill free seats from the waiting list, in waitlist_position order.
 * Returns the registrations promoted, oldest position first.
 */
export async function promoteWaitlist(
  tx: Tx,
  eventId: number,
  capacity: number,
  maker: (id: number, pos: number) => MailJob
): Promise<{ promoted: { registration_id: number; recipient: string; email: string }[]; jobs: MailJob[] }> {
  const seats = await tx.query(
    `select count(*)::int as n from registrations where event_id = $1 and status in ('confirmed','checked_in')`,
    [eventId]
  );
  const free = capacity - seats.rows[0].n;
  if (free <= 0) return { promoted: [], jobs: [] };

  const waiting = await tx.query(
    `select r.id, r.waitlist_position, a.email, a.display_name
       from registrations r join accounts a on a.id = r.account_id
      where r.event_id = $1 and r.status = 'waitlisted'
      order by r.waitlist_position asc, r.created_at asc, r.id asc
      limit $2`,
    [eventId, free]
  );

  const promoted: { registration_id: number; recipient: string; email: string }[] = [];
  const jobs: MailJob[] = [];
  for (const row of waiting.rows) {
    let code: string | null = null;
    for (let attempt = 0; attempt < 8 && !code; attempt++) {
      const candidate = newTicketCode();
      const dupe = await tx.query('select 1 from registrations where ticket_code = $1', [candidate]);
      if (dupe.rowCount === 0) code = candidate;
    }
    if (!code) throw new Error('could not allocate a ticket code');
    await tx.query(
      `update registrations set status = 'confirmed', waitlist_position = null,
              ticket_code = $2, updated_at = now() where id = $1`,
      [row.id, code]
    );
    promoted.push({ registration_id: row.id, recipient: row.display_name, email: row.email });
    jobs.push(maker(row.id, row.waitlist_position));
  }
  await renumberWaitlist(tx, eventId);
  return { promoted, jobs };
}
