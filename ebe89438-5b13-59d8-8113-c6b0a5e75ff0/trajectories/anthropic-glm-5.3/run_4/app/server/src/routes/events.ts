import { Hono, type Context } from 'hono';
import { pool } from '../main.js';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import {
  CATEGORIES, RESERVED_PATHS,
} from '../constants.js';
import {
  type Account, type Calendar, type EventRow, type Registration,
  query, seatCount, eventBySlug, calendarById, calendarBySlug, rootNamespaceTaken,
  stateTransitionAllowed, validEventState, isSeatStatus,
} from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { eventJson, registrationJson } from '../serialize.js';
import { slugify, newId, hash32, log, isKebabCase } from '../util.js';
import { cancelEvent, eventHolders, promoteWaitlist, type AfterMail } from '../registration.js';
import { sendTransitionMail } from '../mail.js';
import { rateLimit } from './auth.js';

const THEME_SOURCE = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

function themeForSeed(seed: string): string {
  const h = hash32(seed);
  const idx = [0, 1, 2].map((i) => (h >>> (i * 8)) % THEME_SOURCE.length);
  void idx;
  return THEME_SOURCE[h % THEME_SOURCE.length];
}

const IANA_RE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/;

export const eventRoutes = new Hono();

/* ---------------- discovery ---------------- */

eventRoutes.get('/', async (c) => {
  const category = (c.req.query('category') || '').trim().toLowerCase();
  const city = (c.req.query('city') || '').trim();
  const q = (c.req.query('q') || '').trim();
  let limit = Number(c.req.query('limit') ?? '20');
  let offset = Number(c.req.query('offset') ?? '0');
  if (!Number.isFinite(limit) || limit <= 0) limit = 20;
  limit = Math.min(Math.trunc(limit), 100);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  offset = Math.trunc(offset);

  const where: string[] = [`e.state in ('published','registration_closed')`];
  const values: unknown[] = [];
  if (category) {
    values.push(category);
    where.push(`e.category = $${values.length}`);
  }
  if (city) {
    values.push(city);
    where.push(`lower(e.city) = lower($${values.length})`);
  }
  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    const p = `$${values.length}`;
    where.push(`(lower(e.title) like ${p} or lower(e.description) like ${p} or lower(c.name) like ${p})`);
  }

  const joins = `from events e join calendars c on c.id = e.calendar_id`;
  const totalRows = await query<{ n: number }>(pool,
    `select count(*)::int as n ${joins} where ${where.join(' and ')}`, values);
  const total = totalRows[0].n;

  const rows = await query<EventRow & { cal_name: string; cal_slug: string; seats: number }>(pool,
    `select e.*, c.name as cal_name, c.slug as cal_slug,
       (select count(*)::int from registrations r where r.event_id = e.id and r.status in ('confirmed','checked_in')) as seats
     ${joins}
     where ${where.join(' and ')}
     order by e.starts_at asc, e.slug asc
     limit ${limit} offset ${offset}`, values);

  const calendarsById = new Map<string, Calendar>();
  for (const r of rows) {
    if (!calendarsById.has(r.calendar_id)) {
      const cal = await calendarById(pool, r.calendar_id);
      if (cal) calendarsById.set(cal.id, cal);
    }
  }

  c.header('X-Total-Count', String(total));
  return c.json(rows.map((r) => {
    const cal = calendarsById.get(r.calendar_id);
    return eventJson(r, r.seats, cal);
  }));
});

/* ---------------- one event ---------------- */

eventRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const ev = await eventBySlug(pool, slug);
  if (!ev) return c.json({ message: 'Not found.' }, 404);
  const cal = await calendarById(pool, ev.calendar_id);
  const acc = c.get('account');
  const isOwner = !!(acc && cal && acc.id === cal.owner_account_id);
  if (ev.state === 'draft' && !isOwner) return c.json({ message: 'Not found.' }, 404);

  const seats = await seatCount(pool, ev.id);
  const json = eventJson(ev, seats, cal) as Record<string, unknown>;

  const viewer = c.get('account');
  if (viewer) {
    const mine = await query<Registration>(pool,
      `select * from registrations where event_id = $1 and account_id = $2 limit 1`, [ev.id, viewer.id]);
    json.my_registration = mine[0] ? registrationJson(mine[0], viewer) : null;
  } else {
    json.my_registration = null;
  }
  return c.json(json);
});

/* ---------------- create ---------------- */

type EventBody = {
  calendar_slug?: string; title?: string; category?: string; city?: string;
  time_zone?: string; starts_at?: string; ends_at?: string; capacity?: number;
  approval_required?: boolean; waitlist_enabled?: boolean; description?: string;
  state?: string;
};

function parseInstant(v: unknown, field: string): Date {
  const s = String(v ?? '');
  if (!s) throw new HttpError(400, `Give the ${field} as a UTC instant ending in Z.`, field);
  if (!/Z$/.test(s)) throw new HttpError(400, `Give the ${field} as a UTC instant ending in Z.`, field);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `Give the ${field} as a UTC instant ending in Z.`, field);
  return d;
}

function parseCapacity(v: unknown, field = 'capacity'): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 500) {
    throw new HttpError(400, 'Set the capacity between 1 and 500.', field);
  }
  return n;
}

eventRoutes.post('/', async (c) => {
  const acc = requireAuth(c);
  if (acc.role !== 'host') return c.json({ message: 'Not found.' }, 404);
  if (!rateLimit('event-create', acc.id, 30)) {
    return c.json({ message: `Too many attempts. The limit is 30 requests per minute; please wait a moment and try again.`, rate_limit: '30 per minute' }, 429);
  }

  const body = (await c.req.json().catch(() => ({}))) as EventBody;
  const cal = body.calendar_slug ? await calendarBySlug(pool, String(body.calendar_slug)) : undefined;
  if (!cal || cal.owner_account_id !== acc.id) {
    return c.json({ message: 'Choose one of your own calendars.', field: 'calendar_slug' }, 400);
  }

  const title = String(body.title ?? '').trim();
  const category = String(body.category ?? '').trim();
  const city = String(body.city ?? '').trim();
  const timeZone = String(body.time_zone ?? 'UTC').trim() || 'UTC';
  const description = String(body.description ?? '').trim();
  const approvalRequired = body.approval_required === true;
  const waitlistEnabled = body.waitlist_enabled !== false;

  const problems: Array<{ field: string; message: string }> = [];
  if (!title) problems.push({ field: 'title', message: 'Give the event a name.' });
  if (!category || !(CATEGORIES as readonly string[]).includes(category)) {
    problems.push({ field: 'category', message: 'Choose one of the twelve categories.' });
  }
  if (!city) problems.push({ field: 'city', message: 'Name the city.' });
  if (!IANA_RE.test(timeZone)) problems.push({ field: 'time_zone', message: 'Give the time zone as an IANA name such as Europe/Berlin.' });

  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  let capacity = 0;
  try {
    startsAt = parseInstant(body.starts_at, 'start');
  } catch (e) {
    problems.push({ field: 'starts_at', message: (e as HttpError).message });
  }
  try {
    endsAt = parseInstant(body.ends_at, 'end');
  } catch (e) {
    problems.push({ field: 'ends_at', message: (e as HttpError).message });
  }
  try {
    capacity = parseCapacity(body.capacity);
  } catch (e) {
    problems.push({ field: 'capacity', message: (e as HttpError).message });
  }
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    problems.push({ field: 'ends_at', message: 'The end must come after the start.' });
  }

  const publishable = problems.length === 0;

  const slugBase = slugify(title) || 'event';
  let slug = slugBase;
  for (let i = 2; i < 300; i++) {
    if (!(await rootNamespaceTaken(pool, slug))) break;
    slug = `${slugBase}-${i}`;
  }

  const safeStart = startsAt ?? new Date(Date.now() + 7 * 86400000);
  const safeEnd = endsAt ?? new Date(safeStart.getTime() + 2 * 3600000);
  const safeCapacity = capacity || 20;

  const state = publishable && body.state === 'published' ? 'published' : 'draft';
  const rows = await query<EventRow>(pool,
    `insert into events (id, calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex,
        description, starts_at, ends_at, capacity, approval_required, waitlist_enabled, state, published_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning *`,
    [
      newId('evt'), cal.id, title || 'Untitled event', slug, category || cal.category, city || cal.city,
      timeZone, slug, themeForSeed(slug), description, safeStart, safeEnd, safeCapacity,
      approvalRequired, waitlistEnabled, state, state === 'published' ? new Date() : null,
    ]);
  log({ level: 'info', msg: 'event created', slug: rows[0].slug, state });
  const seats = await seatCount(pool, rows[0].id);
  const json = eventJson(rows[0], seats, cal) as Record<string, unknown>;
  if (problems.length > 0) json.problems = problems;
  return c.json(json, 201);
});

/* ---------------- patch ---------------- */

eventRoutes.patch('/:slug', async (c) => {
  const acc = requireAuth(c);
  const slug = c.req.param('slug');
  const ev = await eventBySlug(pool, slug);
  if (!ev) return c.json({ message: 'Not found.' }, 404);
  const cal = await calendarById(pool, ev.calendar_id);
  if (!cal || cal.owner_account_id !== acc.id) return c.json({ message: 'Not found.' }, 404);

  const body = (await c.req.json().catch(() => ({}))) as EventBody;

  // Validate everything before the transaction so a refusal writes nothing.
  const fields: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (!t) return c.json({ message: 'Give the event a name.', field: 'title' }, 400);
    fields.title = t;
  }
  if (body.description !== undefined) fields.description = String(body.description).trim();
  if (body.city !== undefined) {
    const ct = String(body.city).trim();
    if (!ct) return c.json({ message: 'Name the city.', field: 'city' }, 400);
    fields.city = ct;
  }
  if (body.category !== undefined) {
    const cat = String(body.category).trim();
    if (!(CATEGORIES as readonly string[]).includes(cat)) {
      return c.json({ message: 'Choose one of the twelve categories.', field: 'category' }, 400);
    }
    fields.category = cat;
  }
  if (body.time_zone !== undefined) {
    const tz = String(body.time_zone).trim();
    if (!IANA_RE.test(tz)) {
      return c.json({ message: 'Give the time zone as an IANA name such as Europe/Berlin.', field: 'time_zone' }, 400);
    }
    fields.time_zone = tz;
  }
  if (body.starts_at !== undefined) fields.starts_at = parseInstant(body.starts_at, 'start');
  if (body.ends_at !== undefined) fields.ends_at = parseInstant(body.ends_at, 'end');
  if (body.capacity !== undefined) fields.capacity = parseCapacity(body.capacity);
  if (body.approval_required !== undefined) fields.approval_required = body.approval_required === true;
  if (body.waitlist_enabled !== undefined) fields.waitlist_enabled = body.waitlist_enabled === true;

  if (ev.state === 'cancelled') {
    return c.json({ message: 'A cancelled event cannot be edited.' }, 400);
  }
  if (body.state !== undefined) {
    const target = String(body.state);
    if (!validEventState(target)) return c.json({ message: 'That is not a state an event can be in.', field: 'state' }, 400);
    if (!stateTransitionAllowed(ev.state, target)) {
      const msg = target === 'draft'
        ? 'A published event cannot return to draft.'
        : 'That state change is not allowed.';
      return c.json({ message: msg, field: 'state' }, 400);
    }
    if (target !== ev.state) {
      fields.state = target;
      if (target === 'published') fields.published_at = new Date();
    }
  }

  if (fields.starts_at && fields.ends_at && new Date(fields.ends_at as string).getTime() <= new Date(fields.starts_at as string).getTime()) {
    return c.json({ message: 'The end must come after the start.', field: 'ends_at' }, 400);
  }

  const timeOrPlaceChanged = fields.starts_at !== undefined || fields.ends_at !== undefined || fields.city !== undefined;
  const capacityRaised = fields.capacity !== undefined && (fields.capacity as number) > ev.capacity;

  const client = await pool.connect();
  let updated: EventRow;
  let after: AfterMail = [];
  let promotedCount = 0;
  try {
    await client.query('begin');
    const locked = (await client.query('select * from events where id = $1 for update', [ev.id])).rows[0] as EventRow;
    if (!locked) throw notFound('Not found.');

    const seatsNow = await seatCount(client, locked.id);
    const prospectiveCap = fields.capacity !== undefined ? (fields.capacity as number) : locked.capacity;
    if (prospectiveCap < seatsNow) {
      await client.query('rollback');
      return c.json({ message: `You already have ${seatsNow} guests confirmed.`, field: 'capacity' }, 400);
    }

    if (Object.keys(fields).length > 0) {
      const sets = Object.keys(fields).map((col, i) => `"${col}" = $${i + 1}`).join(', ');
      const rows = await query<EventRow>(client,
        `update events set ${sets}, updated_at = now() where id = $${Object.keys(fields).length + 1} returning *`,
        [...Object.values(fields), locked.id]);
      updated = rows[0];
    } else {
      updated = locked;
    }

    if (capacityRaised) {
      const res = await promoteWaitlist(client, updated);
      after = res.after;
      promotedCount = res.promoted.length;
    }

    if (timeOrPlaceChanged && seatsNow > 0) {
      const holders = await eventHolders(client, updated.id);
      for (const h of holders) {
        if (isSeatStatus(h.status)) after.push({ kind: 'updated', recipient: h as unknown as Account });
      }
    }

    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }

  for (const m of after) {
    const reg = m.kind === 'promoted'
      ? (await query<Registration>(pool, `select * from registrations where event_id = $1 and account_id = $2 limit 1`, [updated.id, m.recipient.id]))[0]
      : undefined;
    if (m.kind === 'promoted' && reg && reg.status !== 'confirmed' && reg.status !== 'checked_in') continue;
    await sendTransitionMail(pool, m.kind, {
      event: updated,
      registration: reg,
      recipient: { email: m.recipient.email, display_name: m.recipient.display_name },
    });
  }

  const seats = await seatCount(pool, updated.id);
  const cal2 = await calendarById(pool, updated.calendar_id);
  const json = eventJson(updated, seats, cal2) as Record<string, unknown>;
  if (promotedCount > 0) json.promoted_from_waitlist = promotedCount;
  return c.json(json);
});

/* ---------------- cancel ---------------- */

eventRoutes.post('/:slug/cancel', async (c) => {
  const acc = requireAuth(c);
  const slug = c.req.param('slug');
  const ev = await eventBySlug(pool, slug);
  if (!ev) return c.json({ message: 'Not found.' }, 404);
  const cal = await calendarById(pool, ev.calendar_id);
  if (!cal || cal.owner_account_id !== acc.id) return c.json({ message: 'Not found.' }, 404);
  if (ev.state === 'cancelled') return c.json({ message: 'This event is already cancelled.' }, 400);
  if (ev.state === 'draft') return c.json({ message: 'A draft event cannot be cancelled; delete it instead.' }, 400);

  const body = await c.req.json().catch(() => ({}));
  const reason = String(body.reason ?? '').trim();
  if (!reason) return c.json({ message: 'Tell the guests why the event is off.', field: 'reason' }, 400);

  const client = await pool.connect();
  let cancelled: EventRow;
  let after: AfterMail;
  try {
    await client.query('begin');
    const locked = (await client.query('select * from events where id = $1 for update', [ev.id])).rows[0] as EventRow;
    const res = await cancelEvent(client, locked, reason);
    cancelled = res.event;
    after = res.after;
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }

  for (const m of after) {
    await sendTransitionMail(pool, m.kind, {
      event: cancelled,
      recipient: { email: m.recipient.email, display_name: m.recipient.display_name },
    });
  }

  const seats = await seatCount(pool, cancelled.id);
  const cal2 = await calendarById(pool, cancelled.calendar_id);
  log({ level: 'info', msg: 'event cancelled', slug: cancelled.slug, mailed: after.length });
  return c.json(eventJson(cancelled, seats, cal2));
});

/* ---------------- guest list (JSON + CSV) ---------------- */

const GUEST_ORDER = `order by r.status asc, r.waitlist_position asc nulls last, a.email asc`;

eventRoutes.get('/:slug/registrations', async (c) => {
  const guard = await hostOwnsEvent(c, c.req.param('slug'));
  if (!guard.ok) return guard.response;
  const rows = await query<Registration & { email: string; display_name: string }>(pool,
    `select r.*, a.email, a.display_name from registrations r join accounts a on a.id = r.account_id
     where r.event_id = $1 ${GUEST_ORDER}`, [guard.event.id]);
  return c.json(rows.map((r) => registrationJson(r, r)));
});

eventRoutes.get('/:slug/registrations.csv', async (c) => {
  const guard = await hostOwnsEvent(c, c.req.param('slug'));
  if (!guard.ok) return guard.response;
  const rows = await query<Registration & { email: string; display_name: string }>(pool,
    `select r.*, a.email, a.display_name from registrations r join accounts a on a.id = r.account_id
     where r.event_id = $1 ${GUEST_ORDER}`, [guard.event.id]);

  const header = 'email,display_name,status,waitlist_position,ticket_code';
  const lines = [header];
  for (const r of rows) {
    lines.push([r.email, r.display_name, r.status, r.waitlist_position ?? '', r.ticket_code ?? '']
      .map((v) => csvEscape(String(v))).join(','));
  }
  const body = lines.join('\r\n') + '\r\n';
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${guard.event.slug}.csv"`,
    },
  });
});

function csvEscape(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

async function hostOwnsEvent(c: Context, slug: string) {
  const acc = requireAuth(c);
  if (acc.role !== 'host') {
    return { ok: false as const, response: Response.json({ message: 'Not found.' }, { status: 404 }) };
  }
  const ev = await eventBySlug(pool, slug);
  if (!ev) return { ok: false as const, response: Response.json({ message: 'Not found.' }, { status: 404 }) };
  const cal = await calendarById(pool, ev.calendar_id);
  if (!cal || cal.owner_account_id !== acc.id) {
    return { ok: false as const, response: Response.json({ message: 'Not found.' }, { status: 404 }) };
  }
  return { ok: true as const, event: ev, calendar: cal, account: acc };
}

export { themeForSeed };
