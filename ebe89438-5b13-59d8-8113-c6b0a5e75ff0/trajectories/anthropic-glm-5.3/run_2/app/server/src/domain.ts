import { CATEGORIES, isSlugReserved } from './config.js';
export { isSlugReserved };
import type { Txn } from './db.js';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const MAIL_SUBJECTS = {
  confirmed: (t: string) => `You're going to ${t}`,
  pending: (t: string) => `Your request to join ${t}`,
  approved: (t: string) => `You're in: ${t}`,
  declined: (t: string) => `About your request to join ${t}`,
  waitlisted: (t: string) => `You're on the waiting list for ${t}`,
  promoted: (t: string) => `A spot opened up for ${t}`,
  eventCancelled: (t: string) => `${t} has been cancelled`,
} as const;

export function slugify(v: string): string {
  return v.toLowerCase().trim()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function isValidSlug(v: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) && v.length >= 1 && v.length <= 64;
}

/** Throws unless `v` is free in the root namespace and not reserved. */
export async function assertSlugFree(tx: Txn, v: string, message: string): Promise<void> {
  if (isSlugReserved(v)) {
    throw new ApiError(409, 'slug_reserved', `That address is reserved. Try another.`, { slug: `That address is reserved. Try another.` });
  }
  if (!isValidSlug(v)) {
    throw new ApiError(400, 'bad_slug', message, { slug: message });
  }
  const rows = await tx.query<{ value: string }>(
    `SELECT value FROM root_namespace WHERE value = $1`, [v]);
  if (rows.length) {
    throw new ApiError(409, 'slug_taken', `That address is already taken.`, { slug: `That address is already taken.` });
  }
}



export function assertKebabHandle(v: string): void {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)) {
    throw new ApiError(400, 'bad_handle', `A handle is lower-case letters, numbers and dashes.`, { handle: `Use lower-case letters, numbers and dashes.` });
  }
}

export function assertRfc3339Z(value: string, field: string, label: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) {
    throw new ApiError(400, `bad_${field}`, `Times are UTC instants ending in Z.`, { [field]: `${label} must be a UTC time written with a trailing Z.` });
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    throw new ApiError(400, `bad_${field}`, `Times are UTC instants ending in Z.`, { [field]: `${label} must be a UTC time written with a trailing Z.` });
  }
  return d;
}

export function assertAfter(end: Date, start: Date): void {
  if (end.getTime() <= start.getTime()) {
    throw new ApiError(400, 'bad_ends_at', `The end must come after the start.`, { ends_at: `The end must come after the start.` });
  }
}

export function assertCapacity(capacity: unknown): number {
  const n = Number(capacity);
  if (!Number.isInteger(n) || n < 1 || n > 500) {
    throw new ApiError(400, 'bad_capacity', `Capacity is a whole number from 1 to 500.`, { capacity: `Capacity is a whole number from 1 to 500.` });
  }
  return n;
}

export function assertTimeZone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw new ApiError(400, 'bad_time_zone', `Give an IANA time zone name.`, { time_zone: `Choose a time zone like Europe/Berlin.` });
  }
  return tz;
}

export function isSeat(s: string): boolean {
  return s === 'confirmed' || s === 'checked_in';
}

/** Waiting-list positions on an event are the integers 1..n with no gaps. */
export async function renumberWaitlist(tx: Txn, eventId: string): Promise<void> {
  await tx.query(
    `WITH ordered AS (
       SELECT id, row_number() OVER (ORDER BY waitlist_position ASC NULLS LAST, created_at ASC, id ASC) AS rn
         FROM registrations
        WHERE event_id = $1 AND status = 'waitlisted'
     )
     UPDATE registrations r SET waitlist_position = o.rn, updated_at = now()
      FROM ordered o WHERE r.id = o.id AND r.waitlist_position IS DISTINCT FROM o.rn`,
    [eventId],
  );
}

export async function nextWaitlistPosition(tx: Txn, eventId: string): Promise<number> {
  const rows = await tx.query<{ m: number }>(
    `SELECT coalesce(max(waitlist_position), 0)::int AS m
       FROM registrations WHERE event_id = $1 AND status = 'waitlisted'`, [eventId]);
  return Number(rows[0].m) + 1;
}

export async function seatCount(tx: Txn, eventId: string): Promise<number> {
  const rows = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM registrations
      WHERE event_id = $1 AND status IN ('confirmed','checked_in')`, [eventId]);
  return Number(rows[0].n);
}

export interface EventRow {
  id: string; calendar_id: string; title: string; slug: string; category: string;
  city: string; time_zone: string; cover_seed: string; theme_hex: string;
  description: string | null; starts_at: string; ends_at: string; capacity: number;
  approval_required: boolean; waitlist_enabled: boolean; state: string;
  published_at: string | null; cancelled_at: string | null; cancel_reason: string | null;
  created_at: string; updated_at: string;
}

export function isoOrNull(v: unknown): string | null {
  return v == null ? null : (v instanceof Date ? v.toISOString() : new Date(v as string).toISOString());
}

export function iso(v: unknown): string {
  return isoOrNull(v) as string;
}
