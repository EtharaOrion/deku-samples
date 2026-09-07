import type { PoolClient } from 'pg';
import { CATEGORIES, isValidZone, shortId } from './config.js';
import { bad } from './http.js';
import { themeKeyForSeed } from './theme.js';
import { sendMail } from './mail.js';
import { lockEvent, seatCount, promoteFromWaitlist, mailPromoted } from './registrations.js';
import type { Body } from './validate.js';
import { bool, int, instant, str } from './validate.js';

export type EventState = 'draft' | 'published' | 'registration_closed' | 'cancelled';
export const EVENT_STATES: EventState[] = ['draft', 'published', 'registration_closed', 'cancelled'];

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
  starts_at: Date;
  ends_at: Date;
  capacity: number;
  approval_required: boolean;
  waitlist_enabled: boolean;
  state: EventState;
  published_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export function slugify(v: string): string {
  return v.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
}

export async function uniqueEventSlug(tx: PoolClient, base: string): Promise<string> {
  const { isSlugFree } = await import('./namespace.js');
  let candidate = base || 'event';
  for (let i = 0; i < 60; i++) {
    if (await isSlugFree(candidate, tx)) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${shortId(4)}`;
}

export interface DraftInput {
  calendar_slug: string;
  title: string;
  category: string;
  city: string;
  time_zone: string;
  cover_seed?: string;
  starts_at?: string;
  ends_at?: string;
  capacity?: number;
  approval_required: boolean;
  waitlist_enabled: boolean;
  description?: string;
}

export function parseDraft(b: Body): DraftInput {
  const title = str(b, 'title', { max: 120 }) ?? '';
  const category = str(b, 'category');
  if (category !== undefined && !(CATEGORIES as readonly string[]).includes(category)) {
    throw bad('Choose one of the twelve categories.', { category: 'Choose a listed category.' });
  }
  const city = str(b, 'city', { max: 80 });
  const zone = str(b, 'time_zone') ?? 'UTC';
  if (zone && !isValidZone(zone)) {
    throw bad('Give the time zone as an IANA name, like Europe/Berlin.', { time_zone: 'Use an IANA zone name.' });
  }
  const starts = instant(b, 'starts_at', false);
  const ends = instant(b, 'ends_at', false);
  if (starts && ends && starts >= ends) {
    throw bad('The end has to come after the start.', { ends_at: 'Pick a time after the start.' });
  }
  const capacity = int(b, 'capacity', { min: 1, max: 500 });
  return {
    calendar_slug: str(b, 'calendar_slug') ?? '',
    title,
    category: category ?? '',
    city: city ?? '',
    time_zone: zone,
    cover_seed: str(b, 'cover_seed'),
    starts_at: starts,
    ends_at: ends,
    capacity,
    approval_required: bool(b, 'approval_required', false) ?? false,
    waitlist_enabled: bool(b, 'waitlist_enabled', false) ?? false,
    description: str(b, 'description', { max: 4000 }),
  };
}

export function draftIsComplete(d: DraftInput): boolean {
  return Boolean(d.title && d.category && d.city && d.starts_at && d.ends_at && d.capacity);
}

export async function createEvent(tx: PoolClient, ownerId: string, input: DraftInput): Promise<EventRow> {
  const cal = await tx.query<{ id: string; owner_account_id: string; category: string; city: string }>(
    `SELECT id, owner_account_id, category, city FROM calendars WHERE slug = $1`, [input.calendar_slug],
  );
  const calendar = cal.rows[0];
  if (!calendar) throw bad('Pick one of your calendars for this event.', { calendar_slug: 'Choose a calendar.' });
  if (calendar.owner_account_id !== ownerId) {
    throw bad('That calendar belongs to another host.', { calendar_slug: 'Choose one of your own calendars.' });
  }
  const complete = draftIsComplete(input);
  const coverSeed = input.cover_seed || shortId(8);
  const slug = await uniqueEventSlug(tx, slugify(input.title || 'event'));
  const themeHex = themeKeyForSeed(coverSeed);
  const res = await tx.query<EventRow>(
    `INSERT INTO events (id, calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex, description,
        starts_at, ends_at, capacity, approval_required, waitlist_enabled, state, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [shortId(16), calendar.id, input.title, slug, input.category || calendar.category, input.city || calendar.city,
     input.time_zone || 'UTC', coverSeed, themeHex, input.description ?? '',
     input.starts_at ?? null, input.ends_at ?? null, input.capacity ?? 0,
     input.approval_required, input.waitlist_enabled, complete ? 'published' : 'draft', complete ? new Date() : null],
  );
  return res.rows[0];
}

export interface EditInput {
  title?: string;
  description?: string;
  city?: string;
  capacity?: number;
  starts_at?: string;
  ends_at?: string;
  time_zone?: string;
  category?: string;
  approval_required?: boolean;
  waitlist_enabled?: boolean;
  state?: EventState;
}

export function parseEdit(b: Body): EditInput {
  const out: EditInput = {};
  const title = str(b, 'title', { max: 120 });
  if (title !== undefined) out.title = title;
  const description = str(b, 'description', { max: 4000 });
  if (description !== undefined) out.description = description;
  const city = str(b, 'city', { max: 80 });
  if (city !== undefined) out.city = city;
  const category = str(b, 'category');
  if (category !== undefined) {
    if (!(CATEGORIES as readonly string[]).includes(category)) throw bad('Choose one of the twelve categories.', { category: 'Choose a listed category.' });
    out.category = category;
  }
  const zone = str(b, 'time_zone');
  if (zone !== undefined) {
    if (!isValidZone(zone)) throw bad('Give the time zone as an IANA name, like Europe/Berlin.', { time_zone: 'Use an IANA zone name.' });
    out.time_zone = zone;
  }
  const cap = int(b, 'capacity', { min: 1, max: 500 });
  if (cap !== undefined) out.capacity = cap;
  const sa = instant(b, 'starts_at', false);
  if (sa !== undefined) out.starts_at = sa;
  const ea = instant(b, 'ends_at', false);
  if (ea !== undefined) out.ends_at = ea;
  const ar = bool(b, 'approval_required');
  if (ar !== undefined) out.approval_required = ar;
  const we = bool(b, 'waitlist_enabled');
  if (we !== undefined) out.waitlist_enabled = we;
  const state = str(b, 'state');
  if (state !== undefined) {
    if (!EVENT_STATES.includes(state as EventState)) {
      throw bad('That event state does not exist.', { state: 'Choose a real state.' });
    }
    out.state = state as EventState;
  }
  return out;
}

export interface MailTarget { email: string; display_name: string; registration_id: string }
export interface EditOutcome { event: EventRow; movedFromWaitlist: number; detailMailCount: number }

export async function editEvent(tx: PoolClient, original: EventRow, edit: EditInput): Promise<EditOutcome> {
  if (original.state === 'cancelled') {
    throw bad('A cancelled event cannot be edited. Create a new event instead.');
  }
  if (edit.state === 'cancelled') {
    throw bad('Use the cancel action to call an event off, so the reason reaches every guest.');
  }
  if (edit.state === 'draft' && original.state !== 'draft') {
    throw bad('A published event cannot go back to draft.');
  }
  if (edit.state === 'registration_closed' && original.state === 'draft') {
    throw bad('Publish the event before closing registration.');
  }

  const beforeCapacity = original.capacity;
  if (edit.capacity !== undefined) {
    await lockEvent(tx, original.id);
    const seats = await seatCount(tx, original.id);
    if (edit.capacity < seats) {
      throw bad(`You already have ${seats} guests confirmed.`, { capacity: `You already have ${seats} guests confirmed.` });
    }
  }

  const detailChanged =
    (edit.starts_at !== undefined && edit.starts_at !== original.starts_at.toISOString()) ||
    (edit.ends_at !== undefined && edit.ends_at !== original.ends_at.toISOString()) ||
    (edit.city !== undefined && edit.city !== original.city);

  const publishNow = edit.state === 'published' && original.state === 'draft';
  const closeNow = edit.state === 'registration_closed' && original.state === 'published';
  const reopenNow = edit.state === 'published' && original.state === 'registration_closed';

  const sets: string[] = [];
  const vals: unknown[] = [];
  const push = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (edit.title !== undefined) push('title', edit.title);
  if (edit.description !== undefined) push('description', edit.description);
  if (edit.city !== undefined) push('city', edit.city);
  if (edit.category !== undefined) push('category', edit.category);
  if (edit.time_zone !== undefined) push('time_zone', edit.time_zone);
  if (edit.starts_at !== undefined) push('starts_at', new Date(edit.starts_at));
  if (edit.ends_at !== undefined) push('ends_at', new Date(edit.ends_at));
  if (edit.capacity !== undefined) push('capacity', edit.capacity);
  if (edit.approval_required !== undefined) push('approval_required', edit.approval_required);
  if (edit.waitlist_enabled !== undefined) push('waitlist_enabled', edit.waitlist_enabled);
  if (publishNow || closeNow || reopenNow) {
    push('state', publishNow || reopenNow ? 'published' : 'registration_closed');
    if (publishNow) push('published_at', new Date());
  }
  if (sets.length === 0) return { event: original, movedFromWaitlist: 0, detailMailCount: 0 };
  push('updated_at', new Date());
  const res = await tx.query<EventRow>(
    `UPDATE events SET ${sets.join(', ')} WHERE id = $${vals.length + 1} RETURNING *`,
    [...vals, original.id],
  );
  const ev = res.rows[0];

  let moved = 0;
  if (edit.capacity !== undefined && edit.capacity > beforeCapacity) {
    const promos = await promoteFromWaitlist(tx, ev);
    await mailPromoted(tx, ev, promos);
    moved = promos.length;
  }

  let mailed = 0;
  if (detailChanged) {
    const holders = await tx.query<MailTarget>(
      `SELECT a.email, a.display_name, r.id AS registration_id
         FROM registrations r JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in')`,
      [ev.id],
    );
    for (const t of holders.rows) {
      await sendMail(tx, 'details', ev, t.email, t.display_name, { registrationId: t.registration_id, eventId: ev.id });
    }
    mailed = holders.rows.length;
  }
  return { event: ev, movedFromWaitlist: moved, detailMailCount: mailed };
}

export async function cancelEvent(tx: PoolClient, ev: EventRow, reason: string): Promise<{ event: EventRow; mailed: number }> {
  if (ev.state === 'cancelled') throw bad('This event is already cancelled.');
  await lockEvent(tx, ev.id);
  const res = await tx.query<EventRow>(
    `UPDATE events SET state = 'cancelled', cancelled_at = now(), cancel_reason = $2, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [ev.id, reason],
  );
  const updated = res.rows[0];
  const holders = await tx.query<MailTarget>(
    `SELECT a.email, a.display_name, r.id AS registration_id
       FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1 AND r.status IN ('pending_approval','confirmed','waitlisted','checked_in')`,
    [ev.id],
  );
  for (const h of holders.rows) {
    await sendMail(tx, 'cancelled', updated, h.email, h.display_name, {
      reason, registrationId: h.registration_id, eventId: updated.id,
    });
  }
  return { event: updated, mailed: holders.rows.length };
}
