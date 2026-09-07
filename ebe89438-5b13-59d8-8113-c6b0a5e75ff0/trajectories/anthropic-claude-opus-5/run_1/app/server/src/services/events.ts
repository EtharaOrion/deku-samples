import { query, tx } from '../db.js';
import { SUBJECTS } from '../domain.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { sendMailSafe, type MailInput } from '../mail.js';
import { formatInZone } from '../timefmt.js';
import {
  assertOwnsEvent,
  eventWhen,
  lockEvent,
  promoteFromWaitlist,
  promotionMail,
  renumberWaitlist,
  rethrowWriteConflict,
  seatedCount,
  type EventRow,
} from './registrations.js';

export interface EventView {
  id: string;
  slug: string;
  title: string;
  category: string;
  city: string;
  time_zone: string;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
  confirmed_count: number;
  remaining: number | null;
  state: string;
  theme_hex: string;
  cover_seed: string;
  description?: string;
  approval_required?: boolean;
  waitlist_enabled?: boolean;
  waitlist_count?: number;
  pending_count?: number;
  checked_in_count?: number;
  has_ended?: boolean;
  cancel_reason?: string | null;
  published_at?: string | null;
  cancelled_at?: string | null;
  calendar?: { name: string; slug: string; is_public: boolean; owner_handle?: string };
}

export const EVENT_SELECT = `
  e.id, e.slug, e.title, e.category, e.city, e.time_zone, e.starts_at, e.ends_at,
  e.capacity, e.state, e.theme_hex, e.cover_seed, e.description, e.approval_required,
  e.waitlist_enabled, e.cancel_reason, e.published_at, e.cancelled_at, e.calendar_id,
  (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in'))::int AS confirmed_count,
  (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'waitlisted')::int AS waitlist_count,
  (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'pending_approval')::int AS pending_count,
  (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'checked_in')::int AS checked_in_count,
  c.name AS calendar_name, c.slug AS calendar_slug, c.is_public AS calendar_is_public,
  c.owner_account_id AS owner_account_id,
  o.handle AS owner_handle, o.display_name AS owner_display_name
`;

export const EVENT_FROM = `
  FROM events e
  JOIN calendars c ON c.id = e.calendar_id
  JOIN accounts o ON o.id = c.owner_account_id
`;

export function toEventView(row: any, opts: { detail?: boolean } = {}): EventView {
  const confirmed = Number(row.confirmed_count ?? 0);
  const view: EventView = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    city: row.city,
    time_zone: row.time_zone,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    capacity: row.capacity,
    confirmed_count: confirmed,
    remaining: row.capacity === null ? null : Math.max(0, row.capacity - confirmed),
    state: row.state,
    theme_hex: row.theme_hex,
    cover_seed: row.cover_seed,
    has_ended: row.ends_at ? new Date(row.ends_at).getTime() < Date.now() : false,
  };
  if (opts.detail) {
    view.description = row.description ?? '';
    view.approval_required = row.approval_required;
    view.waitlist_enabled = row.waitlist_enabled;
    view.waitlist_count = Number(row.waitlist_count ?? 0);
    view.pending_count = Number(row.pending_count ?? 0);
    view.checked_in_count = Number(row.checked_in_count ?? 0);
    view.cancel_reason = row.cancel_reason ?? null;
    view.published_at = row.published_at ?? null;
    view.cancelled_at = row.cancelled_at ?? null;
    view.calendar = {
      name: row.calendar_name,
      slug: row.calendar_slug,
      is_public: row.calendar_is_public,
      owner_handle: row.owner_handle,
    };
  }
  return view;
}

/* ------------------------------------------------------------------ */
/* Cancel an event                                                     */
/* ------------------------------------------------------------------ */

export async function cancelEvent(
  slug: string,
  hostAccountId: string,
  reason: string
): Promise<EventRow> {
  const out = await tx(async (c) => {
    const found = await c.query<{ id: string }>('SELECT id FROM events WHERE slug = $1', [slug]);
    if (!found.rowCount) throw notFound('That event does not exist.');
    const ev = await lockEvent(c, found.rows[0].id);
    await assertOwnsEvent(c, ev, hostAccountId);
    if (ev.state === 'cancelled')
      throw badRequest('This event has already been called off.', 'state');

    const upd = await c.query<EventRow>(
      `UPDATE events SET state = 'cancelled', cancelled_at = now(), cancel_reason = $2,
              updated_at = now() WHERE id = $1 RETURNING *`,
      [ev.id, reason]
    );

    // Everyone still holding a place hears, carrying the reason word for word.
    const holders = await c.query<{ email: string; display_name: string; id: string }>(
      `SELECT r.id, a.email, a.display_name FROM registrations r
         JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1
          AND r.status IN ('confirmed','checked_in','waitlisted','pending_approval')`,
      [ev.id]
    );
    await c.query(
      `UPDATE registrations SET status = 'cancelled_by_host', ticket_code = NULL,
              waitlist_position = NULL, updated_at = now()
        WHERE event_id = $1
          AND status IN ('confirmed','checked_in','waitlisted','pending_approval')`,
      [ev.id]
    );

    const when = eventWhen(ev);
    const mails: MailInput[] = holders.rows.map((h) => ({
      to: h.email,
      subject: SUBJECTS.cancelled(ev.title),
      eventId: ev.id,
      registrationId: h.id,
      lines: [
        `Hello ${h.display_name},`,
        `${ev.title}, which was to be held ${when} (${ev.time_zone}) in ${ev.city}, has been called off by its host.`,
        `The host's reason: ${reason}`,
        `Your place at ${ev.title} has been released and there is nothing you need to do.`,
      ],
    }));
    return { event: upd.rows[0], mails };
  });

  for (const m of out.mails) await sendMailSafe(m);
  return out.event;
}

/* ------------------------------------------------------------------ */
/* Edit an event                                                       */
/* ------------------------------------------------------------------ */

export interface EventPatch {
  title?: string;
  description?: string;
  city?: string;
  category?: string;
  time_zone?: string;
  starts_at?: string;
  ends_at?: string;
  capacity?: number;
  approval_required?: boolean;
  waitlist_enabled?: boolean;
  state?: string;
}

export interface EditResult {
  event: EventRow;
  promoted: number;
}

const EDITABLE_STATES = ['draft', 'published', 'registration_closed'];

export async function updateEvent(
  slug: string,
  hostAccountId: string,
  patch: EventPatch
): Promise<EditResult> {
  const out = await tx(async (c) => {
    const found = await c.query<{ id: string }>('SELECT id FROM events WHERE slug = $1', [slug]);
    if (!found.rowCount) throw notFound('That event does not exist.');
    const ev = await lockEvent(c, found.rows[0].id);
    await assertOwnsEvent(c, ev, hostAccountId);

    if (ev.state === 'cancelled')
      throw badRequest('A cancelled event cannot be changed again.', 'state');

    const next: Record<string, unknown> = {};
    const seated = await seatedCount(c, ev.id);

    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw badRequest('Give the event a name.', 'title');
      next.title = patch.title.trim();
    }
    if (patch.description !== undefined) next.description = patch.description;
    if (patch.city !== undefined) next.city = patch.city.trim();
    if (patch.category !== undefined) next.category = patch.category;
    if (patch.time_zone !== undefined) next.time_zone = patch.time_zone;
    if (patch.starts_at !== undefined) next.starts_at = patch.starts_at;
    if (patch.ends_at !== undefined) next.ends_at = patch.ends_at;
    if (patch.approval_required !== undefined) next.approval_required = patch.approval_required;
    if (patch.waitlist_enabled !== undefined) next.waitlist_enabled = patch.waitlist_enabled;

    if (patch.capacity !== undefined) {
      if (!Number.isInteger(patch.capacity) || patch.capacity < 1 || patch.capacity > 500)
        throw badRequest('Capacity runs from 1 to 500.', 'capacity');
      if (patch.capacity < seated)
        throw badRequest(`You already have ${seated} guests confirmed.`, 'capacity', {
          confirmed_count: seated,
        });
      next.capacity = patch.capacity;
    }

    let nextState = ev.state;
    if (patch.state !== undefined && patch.state !== ev.state) {
      nextState = applyStateChange(ev.state, patch.state);
      next.state = nextState;
      if (nextState === 'published' && !ev.published_at) next.published_at = new Date().toISOString();
    }

    const startsAt = (next.starts_at ?? ev.starts_at) as string | null;
    const endsAt = (next.ends_at ?? ev.ends_at) as string | null;
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt))
      throw badRequest('The event has to end after it starts.', 'ends_at');

    // Publishing needs the full set; anything missing keeps it a draft.
    const effectiveState = (next.state ?? ev.state) as string;
    if (effectiveState !== 'draft') {
      const title = (next.title ?? ev.title) as string;
      const category = (next.category ?? ev.category) as string;
      const city = (next.city ?? ev.city) as string;
      const capacity = (next.capacity ?? ev.capacity) as number | null;
      if (!title || !category || !city || !startsAt || !endsAt || !capacity) {
        if (patch.state && patch.state !== 'draft')
          throw badRequest(
            'A published event needs a name, a category, a city, a start, an end and a capacity.',
            'state'
          );
        next.state = 'draft';
      }
    }

    const keys = Object.keys(next);
    let updated = ev;
    if (keys.length) {
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const r = await c.query<EventRow>(
        `UPDATE events SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`,
        [ev.id, ...keys.map((k) => next[k])]
      );
      updated = r.rows[0];
    }

    const mails: MailInput[] = [];
    let promoted = 0;

    // Raising capacity fills the seats that just appeared, in this request.
    if (
      patch.capacity !== undefined &&
      ev.capacity !== null &&
      patch.capacity > ev.capacity &&
      updated.state !== 'cancelled'
    ) {
      const free = patch.capacity - (await seatedCount(c, ev.id));
      const moved = await promoteFromWaitlist(c, updated, Math.max(0, free));
      promoted = moved.length;
      for (const p of moved) mails.push(promotionMail(updated, p));
    }
    await renumberWaitlist(c, ev.id);

    // Moving the time or the place of an event that already has confirmed
    // guests mails every one of them.
    const movedTime =
      (patch.starts_at !== undefined && patch.starts_at !== ev.starts_at) ||
      (patch.ends_at !== undefined && patch.ends_at !== ev.ends_at) ||
      (patch.city !== undefined && patch.city.trim() !== ev.city);
    if (movedTime && seated > 0) {
      const holders = await c.query<{ id: string; email: string; display_name: string }>(
        `SELECT r.id, a.email, a.display_name FROM registrations r
           JOIN accounts a ON a.id = r.account_id
          WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in')`,
        [ev.id]
      );
      for (const h of holders.rows) {
        mails.push({
          to: h.email,
          subject: SUBJECTS.updated(updated.title),
          eventId: ev.id,
          registrationId: h.id,
          lines: [
            `Hello ${h.display_name},`,
            `The host has changed the details of ${updated.title}, where you hold a place.`,
            `When: ${formatInZone(updated.starts_at, updated.time_zone)} (${updated.time_zone}).`,
            `Where: ${updated.city}.`,
            `Your place at ${updated.title} is unchanged.`,
          ],
        });
      }
    }

    return { event: updated, promoted, mails };
  }).catch(rethrowWriteConflict);

  for (const m of out.mails) await sendMailSafe(m);
  return { event: out.event, promoted: out.promoted };
}

function applyStateChange(from: string, to: string): string {
  if (!EDITABLE_STATES.includes(to))
    throw badRequest('An event moves between draft, published and registration closed only.', 'state');
  if (from === 'cancelled') throw badRequest('A cancelled event cannot be revived.', 'state');
  if (from === 'published' && to === 'draft')
    throw badRequest('A published event cannot go back to a draft.', 'state');
  if (from === 'registration_closed' && to === 'draft')
    throw badRequest('A published event cannot go back to a draft.', 'state');
  if (from === 'draft' && to === 'registration_closed')
    throw badRequest('Registration closes on a published event only.', 'state');
  return to;
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

function csvCell(v: string | number | null): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function registrationsCsv(eventId: string): Promise<string> {
  const rows = await query<{
    email: string;
    display_name: string;
    status: string;
    waitlist_position: number | null;
    ticket_code: string | null;
  }>(
    `SELECT a.email, a.display_name, r.status, r.waitlist_position, r.ticket_code
       FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1
      ORDER BY r.status ASC, r.waitlist_position ASC NULLS LAST, a.email ASC`,
    [eventId]
  );
  const lines = ['email,display_name,status,waitlist_position,ticket_code'];
  for (const r of rows.rows) {
    lines.push(
      [
        csvCell(r.email),
        csvCell(r.display_name),
        csvCell(r.status),
        csvCell(r.waitlist_position),
        csvCell(r.ticket_code),
      ].join(',')
    );
  }
  return lines.join('\n') + '\n';
}

export { conflict };
