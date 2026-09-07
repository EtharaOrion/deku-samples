import { createHash } from 'node:crypto';
import type { Tx } from './db.ts';
import { bad, notFound } from './errors.ts';
import { sendAndLog } from './mail.ts';
import { CATEGORIES, RESERVED_PATHS } from './seed.ts';
import { mailBody, promoteWaitlist, subject } from './registrations.ts';
import { isSlug, parseInstant, toZulu } from './validate.ts';
import { allocateTicket } from './regops.ts';

const PALETTE = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

/** theme_hex derived once at creation from cover_seed. */
export function themeFromSeed(seed: string): string {
  const h = createHash('sha256').update(seed).digest();
  const a = h[0] % PALETTE.length;
  let b = (a + 1 + (h[1] % (PALETTE.length - 1))) % PALETTE.length;
  // Blend two neighbouring palette entries toward a mid hue, then snap to the
  // palette entry whose hue is nearest, so themes stay saturated and readable.
  const mix = (x: string, y: string, t: number) => {
    const px = parseInt(x.slice(1), 16), py = parseInt(y.slice(1), 16);
    const r = Math.round(((px >> 16) & 255) * (1 - t) + ((py >> 16) & 255) * t);
    const g = Math.round(((px >> 8) & 255) * (1 - t) + ((py >> 8) & 255) * t);
    const bl = Math.round((px & 255) * (1 - t) + (py & 255) * t);
    return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
  };
  return mix(PALETTE[a], PALETTE[b], (h[2] % 100) / 100);
}

export async function slugTaken(tx: Tx, slug: string): Promise<boolean> {
  const r = await tx.query(
    `select 1 where exists(select 1 from events where lower(slug) = lower($1))
             or exists(select 1 from calendars where lower(slug) = lower($1))
             or exists(select 1 from accounts where lower(handle) = lower($1))`,
    [slug]
  );
  return r.rowCount !== null && r.rowCount > 0;
}

export function assertSlugAvailable(tx: Tx, slug: string, kind: 'event' | 'calendar' | 'handle'): Promise<void> {
  const label = kind === 'handle' ? 'handle' : 'address';
  if (!isSlug(slug)) {
    return Promise.reject(bad(`Use lowercase letters, numbers and hyphens only.`, { field: label }));
  }
  const lower = slug.toLowerCase();
  if ((RESERVED_PATHS as readonly string[]).includes(lower)) {
    return Promise.reject(bad(`That ${label} is reserved. Pick another.`, { field: label }));
  }
  if ((CATEGORIES as readonly string[]).includes(lower)) {
    return Promise.reject(bad(`That ${label} is a category name. Pick another.`, { field: label }));
  }
  return slugTaken(tx, slug).then((taken) => {
    if (taken) {
      throw bad(kind === 'handle' ? `That handle is already taken.` : `That address is already taken.`, { field: label });
    }
  });
}

/** Publish gate: everything present, or the submission stays a draft. */
export function publishReady(b: {
  title?: unknown; category?: unknown; city?: unknown;
  starts_at?: unknown; ends_at?: unknown; capacity?: unknown;
}): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (typeof b.title !== 'string' || !b.title.trim()) missing.push('title');
  if (typeof b.category !== 'string' || !(CATEGORIES as readonly string[]).includes(b.category)) missing.push('category');
  if (typeof b.city !== 'string' || !b.city.trim()) missing.push('city');
  if (typeof b.starts_at !== 'string' || !b.starts_at) missing.push('starts_at');
  if (typeof b.ends_at !== 'string' || !b.ends_at) missing.push('ends_at');
  if (typeof b.capacity !== 'number' || !Number.isInteger(b.capacity) || b.capacity < 1 || b.capacity > 500) missing.push('capacity');
  return { ok: missing.length === 0, missing };
}

export type EventJson = Record<string, unknown>;

export function eventJson(e: any, extra: Record<string, unknown> = {}): EventJson {
  const out: EventJson = {
    id: e.id,
    calendar_id: e.calendar_id,
    slug: e.slug,
    title: e.title,
    category: e.category,
    city: e.city,
    time_zone: e.time_zone,
    cover_seed: e.cover_seed,
    theme_hex: e.theme_hex,
    description: e.description,
    starts_at: toZulu(e.starts_at),
    ends_at: toZulu(e.ends_at),
    capacity: e.capacity,
    approval_required: e.approval_required,
    waitlist_enabled: e.waitlist_enabled,
    state: e.state,
    published_at: e.published_at ? toZulu(e.published_at) : null,
    cancelled_at: e.cancelled_at ? toZulu(e.cancelled_at) : null,
    cancel_reason: e.cancel_reason ?? null,
    created_at: toZulu(e.created_at),
    updated_at: toZulu(e.updated_at),
    ended: new Date(e.ends_at).getTime() < Date.now(),
    ...extra,
  };
  return out;
}

export async function confirmedCount(tx: Tx | import('./db.ts').Pool, eventId: number): Promise<number> {
  const r = await (tx as any).query(
    `select count(*)::int as n from registrations where event_id = $1 and status in ('confirmed','checked_in')`,
    [eventId]
  );
  return r.rows[0].n;
}

export async function getEventBySlug(anyPool: any, slug: string): Promise<any | null> {
  const r = await anyPool.query('select * from events where slug = $1', [slug]);
  return r.rows[0] ?? null;
}

/** The three-way gate every reader of an event passes. */
export function canSeeEvent(event: any, viewer: { id: number; role: string } | null, calendar: { owner_account_id: number } | null): boolean {
  if (!event) return false;
  if (event.state === 'published' || event.state === 'registration_closed') return true;
  if (event.state === 'cancelled') return true;
  // Draft: the host alone, and only via the owning calendar.
  if (!viewer || !calendar) return false;
  return viewer.role === 'host' && calendar.owner_account_id === viewer.id;
}

export async function calendarOf(anyPool: any, calendarId: number) {
  const r = await anyPool.query('select * from calendars where id = $1', [calendarId]);
  return r.rows[0] ?? null;
}

export function draftNotFound(): never {
  throw notFound('We could not find that page.');
}

/** Raise capacity, filling seats from the waiting list in the same request. */
export async function applyCapacityChange(
  tx: Tx,
  event: any,
  newCapacity: number
): Promise<{ moved: number }> {
  if (newCapacity < event.capacity) {
    const held = await confirmedCount(tx, event.id);
    if (newCapacity < held) {
      throw bad(`You already have ${held} guests confirmed.`, { field: 'capacity' });
    }
  }
  await tx.query('update events set capacity = $2, updated_at = now() where id = $1', [event.id, newCapacity]);
  let moved = 0;
  if (newCapacity > event.capacity) {
    const res = await promoteWaitlist(tx, event.id, newCapacity, () => ({
      registration_id: null, event_id: event.id, recipient: '', subject: '', body: '',
    }));
    moved = res.promoted.length;
    if (moved > 0) {
      const ids = res.promoted.map((p) => p.registration_id);
      const promos = await tx.query(
        `select r.id, a.email from registrations r join accounts a on a.id = r.account_id where r.id = any($1::bigint[])`,
        [ids]
      );
      for (const row of promos.rows) {
        await sendAndLog(tx, {
          registration_id: row.id, event_id: event.id, recipient: row.email,
          subject: subject('seat_from_waitlist', event.title),
          body: mailBody('seat_from_waitlist', event, undefined),
        });
      }
    }
  }
  return { moved };
}

/** Cancel an event: mail every guest still holding a place, reason verbatim. */
export async function cancelEvent(tx: Tx, event: any, reason: string): Promise<number> {
  await tx.query(
    `update events set state = 'cancelled', cancelled_at = now(), cancel_reason = $2, updated_at = now() where id = $1`,
    [event.id, reason]
  );
  const holders = await tx.query(
    `select r.id, a.email from registrations r join accounts a on a.id = r.account_id
      where r.event_id = $1 and r.status in ('pending_approval','confirmed','waitlisted','checked_in')`,
    [event.id]
  );
  for (const row of holders.rows) {
    await sendAndLog(tx, {
      registration_id: row.id, event_id: event.id, recipient: row.email,
      subject: subject('cancelled_event', event.title),
      body: mailBody('cancelled_event', event, reason),
    });
  }
  return holders.rows.length;
}
