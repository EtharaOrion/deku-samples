import type { PoolClient } from 'pg';

/** Anything that can run queries: the pool or a checked-out transaction client. */
export interface Client {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}
import { log } from './util.js';
import { HttpError, notFound } from './errors.js';
import { CATEGORIES, RESERVED_PATHS, EVENT_STATES } from './constants.js';
import type { EventState } from './constants.js';


export type Account = {
  id: string; email: string; password_hash: string; display_name: string;
  handle: string; role: 'host' | 'guest'; created_at: Date;
};

export type Calendar = {
  id: string; owner_account_id: string; name: string; slug: string;
  category: string; city: string; is_public: boolean; created_at: Date;
};

export type EventRow = {
  id: string; calendar_id: string; title: string; slug: string; category: string;
  city: string; city_detail: string | null; time_zone: string; cover_seed: string; theme_hex: string;
  description: string; starts_at: Date; ends_at: Date; capacity: number;
  approval_required: boolean; waitlist_enabled: boolean; state: EventState;
  published_at: Date | null; cancelled_at: Date | null; cancel_reason: string | null;
  created_at: Date; updated_at: Date;
};

export type Registration = {
  id: string; event_id: string; account_id: string; status: string;
  waitlist_position: number | null; ticket_code: string | null;
  checked_in_at: Date | null; created_at: Date; updated_at: Date;
};

export const SEAT_FILTER = `status in ('confirmed','checked_in')`;

export async function query<T = Record<string, unknown>>(client: Client, text: string, values: unknown[] = []): Promise<T[]> {
  const started = Date.now();
  const res = await client.query(text, values);
  const ms = Date.now() - started;
  if (ms > 250) log({ level: 'warn', msg: 'slow query', ms, text: text.slice(0, 140) });
  return res.rows as T[];
}

export async function countRows(client: Client, table: string, where: string, values: unknown[] = []): Promise<number> {
  const rows = await query<{ n: number }>(client, `select count(*)::int as n from ${table} where ${where}`, values);
  return rows[0].n;
}

export async function seatCount(client: Client, eventId: string): Promise<number> {
  return countRows(client, 'registrations', `event_id = $1 and ${SEAT_FILTER}`, [eventId]);
}

export async function nextWaitlistPos(client: Client, eventId: string): Promise<number> {
  const rows = await query<{ n: number }>(client,
    `select coalesce(max(waitlist_position), 0)::int + 1 as n from registrations where event_id = $1 and status = 'waitlisted'`, [eventId]);
  return rows[0].n;
}

export async function renumberWaitlist(client: Client, eventId: string): Promise<void> {
  await query(client,
    `with ordered as (
       select id, row_number() over (order by waitlist_position asc nulls last, created_at asc) as rn
       from registrations where event_id = $1 and status = 'waitlisted'
     )
     update registrations r set waitlist_position = o.rn, updated_at = now()
     from ordered o where r.id = o.id and r.waitlist_position is distinct from o.rn`, [eventId]);
}

export async function waitlistHead(client: Client, eventId: string): Promise<Registration | undefined> {
  const rows = await query<Registration>(client,
    `select * from registrations where event_id = $1 and status = 'waitlisted'
     order by waitlist_position asc nulls last, created_at asc limit 1`, [eventId]);
  return rows[0];
}

export async function waitlistedCount(client: Client, eventId: string): Promise<number> {
  return countRows(client, 'registrations', `event_id = $1 and status = 'waitlisted'`, [eventId]);
}

export async function eventBySlug(client: Client, slug: string): Promise<EventRow | undefined> {
  const rows = await query<EventRow>(client, `select * from events where slug = $1`, [slug]);
  return rows[0];
}

export async function lockEvent(client: Client, slug: string): Promise<EventRow | undefined> {
  const rows = await query<EventRow>(client, `select * from events where slug = $1 for update`, [slug]);
  return rows[0];
}

export async function calendarBySlug(client: Client, slug: string): Promise<Calendar | undefined> {
  const rows = await query<Calendar>(client, `select * from calendars where slug = $1`, [slug]);
  return rows[0];
}

export async function calendarById(client: Client, id: string): Promise<Calendar | undefined> {
  const rows = await query<Calendar>(client, `select * from calendars where id = $1`, [id]);
  return rows[0];
}

export async function accountByEmail(client: Client, email: string): Promise<Account | undefined> {
  const rows = await query<Account>(client, `select * from accounts where email = $1`, [email.toLowerCase()]);
  return rows[0];
}

export async function accountById(client: Client, id: string): Promise<Account | undefined> {
  const rows = await query<Account>(client, `select * from accounts where id = $1`, [id]);
  return rows[0];
}

export async function registrationById(client: Client, id: string): Promise<Registration | undefined> {
  const rows = await query<Registration>(client, `select * from registrations where id = $1`, [id]);
  return rows[0];
}

export async function registrationByTicket(client: Client, code: string): Promise<Registration | undefined> {
  const rows = await query<Registration>(client, `select * from registrations where ticket_code = $1`, [code]);
  return rows[0];
}

export async function oneRegistration(client: Client, eventId: string, accountId: string): Promise<Registration | undefined> {
  const rows = await query<Registration>(client,
    `select * from registrations where event_id = $1 and account_id = $2 limit 1`, [eventId, accountId]);
  return rows[0];
}

/** Returns what occupies a root-namespace name, or null when it is free. */
export async function rootNamespaceTaken(client: Client, candidate: string): Promise<string | null> {
  if ((RESERVED_PATHS as readonly string[]).includes(candidate)) return 'reserved';
  if ((CATEGORIES as readonly string[]).includes(candidate)) return 'category';
  const rows = await query<{ e: string | null; c: string | null; a: string | null }>(client,
    `select
       (select slug from events where slug = $1 limit 1) as e,
       (select slug from calendars where slug = $1 limit 1) as c,
       (select handle from accounts where handle = $1 limit 1) as a`, [candidate]);
  const r = rows[0];
  if (r.e) return 'event';
  if (r.c) return 'calendar';
  if (r.a) return 'account';
  return null;
}

export function isSeatStatus(s: string): boolean {
  return s === 'confirmed' || s === 'checked_in';
}

export function holdsTicket(s: string): boolean {
  return s === 'confirmed' || s === 'checked_in';
}

export function validEventState(s: string): s is EventState {
  return (EVENT_STATES as readonly string[]).includes(s);
}

export function stateTransitionAllowed(from: EventState, to: EventState): boolean {
  if (from === to) return true;
  if (from === 'draft') return to === 'published';
  if (from === 'published') return to === 'registration_closed';
  if (from === 'registration_closed') return to === 'published';
  return false;
}

export async function requireEvent(client: Client, slug: string): Promise<EventRow> {
  const ev = await eventBySlug(client, slug);
  if (!ev) throw notFound('Not found.');
  return ev;
}

export function statusWord(s: string): string {
  switch (s) {
    case 'pending_approval': return 'Pending approval';
    case 'confirmed': return 'Confirmed';
    case 'waitlisted': return 'Waitlisted';
    case 'declined': return 'Declined';
    case 'cancelled_by_guest': return 'Cancelled by you';
    case 'cancelled_by_host': return 'Cancelled by host';
    case 'checked_in': return 'Checked in';
    default: return s;
  }
}
