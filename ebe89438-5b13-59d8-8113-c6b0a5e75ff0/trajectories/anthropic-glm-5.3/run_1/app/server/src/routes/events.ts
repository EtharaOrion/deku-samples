import { Hono } from 'hono';
import { db } from '../db/client.js';
import { id as newId, ticketCode } from '../lib/util.js';
import { checkNamespace, CATEGORIES, isCategory } from '../lib/namespace.js';
import { authAccount } from '../lib/auth.js';
import { sendMail, eventCancelledMail, rescheduleMail } from '../mail/mailer.js';
import { promoteHeadOfWaitlist, renumberWaitlist } from '../lib/registration.js';
import { z } from 'zod';

export const eventRoutes = new Hono();

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function rfc(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const eventSelect = `
  SELECT e.*, c.name AS calendar_name, c.slug AS calendar_slug, c.owner_account_id,
         (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in'))::int AS confirmed_count
    FROM events e JOIN calendars c ON c.id = e.calendar_id`;

function shapeEvent(e: any) {
  return {
    id: e.id, slug: e.slug, title: e.title, category: e.category, city: e.city,
    time_zone: e.time_zone, cover_seed: e.cover_seed, theme_hex: e.theme_hex,
    description: e.description,
    starts_at: rfc(new Date(e.starts_at)), ends_at: rfc(new Date(e.ends_at)),
    capacity: e.capacity, confirmed_count: e.confirmed_count,
    remaining: Math.max(0, e.capacity - e.confirmed_count),
    state: e.state, approval_required: e.approval_required, waitlist_enabled: e.waitlist_enabled,
    published_at: e.published_at ? rfc(new Date(e.published_at)) : null,
    cancelled_at: e.cancelled_at ? rfc(new Date(e.cancelled_at)) : null,
    cancel_reason: e.cancel_reason ?? null,
    calendar: { name: e.calendar_name, slug: e.calendar_slug, owner_account_id: e.owner_account_id },
    has_ended: new Date(e.ends_at).getTime() < Date.now(),
  };
}

async function findEvent(slug: string) {
  const { rows } = await db.query(`${eventSelect} WHERE lower(e.slug) = $1`, [slug.toLowerCase()]);
  return rows[0] ?? null;
}

/** --- discovery list --- */
eventRoutes.get('/', async (c) => {
  const q = (p: string) => {
    const v = c.req.query(p);
    if (v === undefined || v === null) return undefined;
    if (typeof v !== 'string') return undefined;
    if (p === 'q' && v.trim() === '') return undefined;
    return v.trim();
  };
  const category = q('category'); const city = q('city'); const term = q('q');
  let limit = Number(c.req.query('limit') ?? 20);
  let offset = Number(c.req.query('offset') ?? 0);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  limit = Math.min(Math.floor(limit), 100);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  offset = Math.floor(offset);

  const where: string[] = [`e.state IN ('published','registration_closed')`];
  const params: any[] = [];
  if (category) { params.push(category); where.push(`e.category = $${params.length}`); }
  if (city) { params.push(city); where.push(`e.city ILIKE $${params.length}`); }
  if (term) { params.push(`%${term}%`); where.push(`(e.title ILIKE $${params.length} OR e.description ILIKE $${params.length} OR c.name ILIKE $${params.length})`); }
  const whereSql = where.join(' AND ');
  const total = await db.query(`SELECT count(*)::int AS n FROM events e JOIN calendars c ON c.id = e.calendar_id WHERE ${whereSql}`, params);
  const { rows } = await db.query(
    `${eventSelect} WHERE ${whereSql} ORDER BY e.starts_at ASC, e.slug ASC LIMIT ${limit} OFFSET ${offset}`, params
  );
  c.header('X-Total-Count', String(total.rows[0].n));
  return c.json(rows.map(shapeEvent));
});

/** --- one event --- */
eventRoutes.get('/:slug', async (c) => {
  const ev = await findEvent(c.req.param('slug'));
  if (!ev) return c.json({ message: `Page Not Found` }, 404);
  if (ev.state === 'draft') {
    const account = await authAccount(c);
    const owner = account && account.id === ev.owner_account_id;
    if (!owner) return c.json({ message: `Page Not Found` }, 404);
  }
  const account = await authAccount(c);
  const out: any = shapeEvent(ev);
  if (account) {
    const { rows } = await db.query(
      `SELECT id, status, waitlist_position, ticket_code, event_id FROM registrations WHERE event_id = $1 AND account_id = $2`,
      [ev.id, account.id]
    );
    out.my_registration = rows[0] ?? null;
  } else out.my_registration = null;
  const cal = await db.query(
    `SELECT (SELECT count(*) FROM events e2 WHERE e2.calendar_id = c.id AND e2.state IN ('published','registration_closed'))::int AS published_count FROM calendars c WHERE c.id = $1`,
    [ev.calendar_id]
  );
  out.calendar.published_count = cal.rows[0]?.published_count ?? 0;
  return c.json(out);
});

/** --- create --- */
const createSchema = z.object({
  calendar_slug: z.string().min(1),
  title: z.string().optional(),
  category: z.string().optional(),
  city: z.string().optional(),
  time_zone: z.string().optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  capacity: z.union([z.number(), z.string()]).optional(),
  approval_required: z.boolean().optional(),
  waitlist_enabled: z.boolean().optional(),
  description: z.string().optional(),
});

function tzValid(tz: string | undefined): boolean {
  if (!tz) return true;
  try { new Date(new Date().toLocaleString('en-US', { timeZone: tz })); return true; } catch { return false; }
}

eventRoutes.post('/', async (c) => {
  const account = await authAccount(c);
  if (!account) return c.json({ message: `Sign in to create an event.` }, 401);
  if (account.role !== 'host') return c.json({ message: `Only a host can create an event.` }, 403);
  const body = await c.req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json({ field: String(issue.path[0] ?? 'title'), message: `Check the ${String(issue.path[0] ?? 'title')} field.` }, 400);
  }
  const d = parsed.data;
  const { rows: calRows } = await db.query(`SELECT * FROM calendars WHERE lower(slug) = $1`, [d.calendar_slug.toLowerCase()]);
  const cal = calRows[0];
  if (!cal || cal.owner_account_id !== account.id) {
    return c.json({ field: 'calendar_slug', message: `Choose one of your own calendars for this event.` }, 403);
  }
  const tz = d.time_zone && tzValid(d.time_zone) ? d.time_zone : 'UTC';
  const capacity = d.capacity === undefined ? NaN : Number(d.capacity);
  const startsOk = RFC3339.test(d.starts_at ?? '');
  const endsOk = RFC3339.test(d.ends_at ?? '');
  const catOk = isCategory(d.category ?? cal.category);
  const complete = startsOk && endsOk && catOk && Number.isFinite(capacity) && capacity >= 1
    && capacity <= 500 && !!(d.title && d.title.trim()) && !!(d.city && d.city.trim())
    && !!(d.ends_at && d.starts_at && new Date(d.ends_at).getTime() > new Date(d.starts_at).getTime());
  const starts = startsOk && d.starts_at ? new Date(d.starts_at) : null;
  const ends = endsOk && d.ends_at ? new Date(d.ends_at) : null;
  if (starts && ends && ends <= starts) {
    return c.json({ field: 'ends_at', message: `The end has to come after the start.` }, 400);
  }
  const titleText = (d.title && d.title.trim()) ? d.title.trim() : 'Untitled event';
  const cityText = (d.city && d.city.trim()) ? d.city.trim() : 'Place to be confirmed';
  const base = titleText.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'event';
  let slug = base; let n = 1;
  while (!(await checkNamespace(slug, 'event')).ok) {
    slug = `${base}-${n++}`;
    if (n > 200) return c.json({ field: 'title', message: `Try a different title; that address is taken.` }, 409);
  }
  const seed = newId();
  const { rows: themeRows } = await db.query(
    `SELECT ('#' || substring(md5($1) from 1 for 6)) AS theme_hex`,
    [seed]
  );
  let theme_hex = themeRows[0].theme_hex;
  const state = complete ? 'published' : 'draft';
  const eid = newId();
  await db.query(
    `INSERT INTO events (id, calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex, description,
       starts_at, ends_at, capacity, approval_required, waitlist_enabled, state, published_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now(), now())`,
    [eid, cal.id, titleText, slug, (d.category && isCategory(d.category)) ? d.category : cal.category, cityText, tz, seed, theme_hex, d.description ?? '',
     starts ?? new Date(Date.now() + 7 * 86400000), ends ?? new Date(Date.now() + 7 * 86400000 + 3600000),
     Number.isFinite(capacity) && capacity >= 1 && capacity <= 500 ? Math.floor(capacity) : 20,
     !!d.approval_required, !!d.waitlist_enabled, state, state === 'published' ? new Date() : null]
  );
  const ev = await findEvent(slug);
  return c.json(shapeEvent(ev), 201);
});

/** --- edit (including publish, close, reopen, capacity changes) --- */
const patchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  city: z.string().trim().min(1).optional(),
  capacity: z.union([z.number(), z.string()]).optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  time_zone: z.string().optional(),
  category: z.string().optional(),
  state: z.enum(['draft', 'published', 'registration_closed', 'cancelled']).optional(),
  approval_required: z.boolean().optional(),
  waitlist_enabled: z.boolean().optional(),
  reason: z.string().optional(),
});

eventRoutes.patch('/:slug', async (c) => {
  const account = await authAccount(c);
  if (!account) return c.json({ message: `Sign in to edit this event.` }, 401);
  const ev = await findEvent(c.req.param('slug'));
  if (!ev || ev.owner_account_id !== account.id) return c.json({ message: `Page Not Found` }, 404);

  const body = await c.req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json({ field: String(issue.path[0] ?? 'title'), message: `Check the ${String(issue.path[0] ?? 'title')} field.` }, 400);
  }
  const d = parsed.data;

  // state transitions
  if (d.state && d.state !== ev.state) {
    if (ev.state === 'cancelled') {
      return c.json({ field: 'state', message: `A cancelled event cannot be changed. Create a new event instead.` }, 400);
    }
    if (d.state === 'draft' && ev.state === 'published') {
      return c.json({ field: 'state', message: `A published event cannot go back to draft.` }, 400);
    }
    if (d.state === 'draft' && ev.state === 'registration_closed') {
      return c.json({ field: 'state', message: `Registration-closed event cannot go back to draft.` }, 400);
    }
    if (d.state === 'registration_closed' && ev.state !== 'published') {
      return c.json({ field: 'state', message: `Only a published event can close registration.` }, 400);
    }
  }

  const mail: { to: string; subject: string; text: string; registrationId?: string; eventId?: string }[] = [];
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    await tx.query(`SELECT id FROM events WHERE id = $1 FOR UPDATE`, [ev.id]);

    const sets: string[] = [`updated_at = now()`];
    const params: any[] = [];
    const push = (col: string, v: any) => { params.push(v); sets.push(`${col} = $${params.length}`); };

    let newCapacity = ev.capacity;
    if (d.capacity !== undefined) {
      const n = Number(d.capacity);
      if (!Number.isFinite(n) || n < 1 || n > 500) {
        await tx.query('ROLLBACK');
        return c.json({ field: 'capacity', message: `Capacity is a number from 1 to 500.` }, 400);
      }
      newCapacity = Math.floor(n);
    }

    if (d.starts_at !== undefined || d.ends_at !== undefined || d.time_zone !== undefined) {
      const st = d.starts_at !== undefined ? (RFC3339.test(d.starts_at) ? new Date(d.starts_at) : null) : new Date(ev.starts_at);
      const en = d.ends_at !== undefined ? (RFC3339.test(d.ends_at) ? new Date(d.ends_at) : null) : new Date(ev.ends_at);
      if (!st || !en || en <= st) {
        await tx.query('ROLLBACK');
        return c.json({ field: 'ends_at', message: `Give a start, an end after it, in UTC with a Z.` }, 400);
      }
      push('starts_at', st); push('ends_at', en);
      if (d.time_zone !== undefined) {
        if (!tzValid(d.time_zone)) { await tx.query('ROLLBACK'); return c.json({ field: 'time_zone', message: `That time zone is not recognised.` }, 400); }
        push('time_zone', d.time_zone);
      }
    } else if (d.time_zone !== undefined) {
      if (!tzValid(d.time_zone)) { await tx.query('ROLLBACK'); return c.json({ field: 'time_zone', message: `That time zone is not recognised.` }, 400); }
      push('time_zone', d.time_zone);
    }

    if (d.title !== undefined) push('title', d.title);
    if (d.description !== undefined) push('description', d.description);
    if (d.city !== undefined) push('city', d.city);
    if (d.category !== undefined && isCategory(d.category)) push('category', d.category);
    if (d.approval_required !== undefined) push('approval_required', d.approval_required);
    if (d.waitlist_enabled !== undefined) push('waitlist_enabled', d.waitlist_enabled);

    let publishedNow = false;
    if (d.state === 'published' && ev.state !== 'published') {
      publishedNow = true; push('state', 'published'); push('published_at', new Date());
    } else if (d.state === 'registration_closed') {
      push('state', 'registration_closed');
    }

    // capacity is applied last so the trigger and the promotion share one lock
    if (d.capacity !== undefined) {
      const cc = await tx.query(`SELECT count(*)::int AS n FROM registrations WHERE event_id=$1 AND status IN ('confirmed','checked_in')`, [ev.id]);
      const confirmedSeats = Number(cc.rows[0]?.n ?? 0);
      if (newCapacity < confirmedSeats) {
        await tx.query('ROLLBACK');
        return c.json({ field: 'capacity', message: `You already have ${confirmedSeats} guests confirmed.` }, 400);
      }
      push('capacity', newCapacity);
    }

    await tx.query(`UPDATE events SET ${sets.join(', ')} WHERE id = $${params.length + 1}`, [...params, ev.id]);

    // publishing a draft checks completeness once the row is whole
    if (publishedNow) {
      const { rows: check } = await tx.query(`SELECT title, category, city, starts_at, ends_at, capacity FROM events WHERE id=$1`, [ev.id]);
      const r = check[0];
      const complete = r.title && r.city && r.starts_at && r.ends_at && r.ends_at > r.starts_at;
      if (!complete) {
        await tx.query('ROLLBACK');
        return c.json({ field: 'title', message: `Add a title, a place, a start and an end before publishing.` }, 400);
      }
    }

    // raising capacity moves the waiting list in this same request
    let promoted = 0;
    if (newCapacity > ev.capacity) {
      let guard = 0;
      while (guard++ < 500) {
        const seats = await tx.query(`SELECT count(*)::int AS n FROM registrations WHERE event_id=$1 AND status IN ('confirmed','checked_in')`, [ev.id]);
        const waiting = await tx.query(`SELECT id FROM registrations WHERE event_id=$1 AND status='waitlisted' ORDER BY waitlist_position LIMIT 1`, [ev.id]);
        if (Number(seats.rows[0]?.n ?? 0) >= newCapacity || !waiting.rows[0]) break;
        await promoteFromWaitlistTx(tx, ev.id, mail);
        promoted++;
      }
    }

    // time or place change: every confirmed guest is mailed
    if (d.starts_at !== undefined || d.ends_at !== undefined || d.city !== undefined) {
      const guests = await tx.query(
        `SELECT r.id AS rid, a.email FROM registrations r JOIN accounts a ON a.id = r.account_id
          WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in')`, [ev.id]);
      for (const g of guests.rows) {
        const fresh = (await tx.query(`SELECT title, starts_at, time_zone, city FROM events WHERE id=$1`, [ev.id])).rows[0];
        mail.push({ to: g.email, ...rescheduleMail({ title: fresh.title, starts_at: rfc(new Date(fresh.starts_at)), time_zone: fresh.time_zone, city: fresh.city }), registrationId: g.rid, eventId: ev.id });
      }
    }

    await tx.query('COMMIT');
  } catch (e) {
    await tx.query('ROLLBACK');
    throw e;
  } finally {
    tx.release();
  }
  await flushMailSafe(mail);
  const fresh = await findEvent(ev.slug);
  const out = shapeEvent(fresh);
  (out as any).promoted_count = promotedCount(mail);
  return c.json(out);
});

function promotedCount(mail: any[]) { return mail.filter((m) => m.subject.startsWith(`A spot opened up`)).length; }

async function promoteFromWaitlistTx(tx: any, eventId: string, mail: any[]) {
  const { rows } = await tx.query(
    `SELECT r.id, a.email FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1 AND r.status = 'waitlisted' ORDER BY r.waitlist_position ASC LIMIT 1`, [eventId]);
  if (!rows[0]) return;
  const code = ticketCode();
  await tx.query(`UPDATE registrations SET status='confirmed', ticket_code=$2, waitlist_position=NULL, updated_at=now() WHERE id=$1`, [rows[0].id, code]);
  const ev = (await tx.query(`SELECT title, slug FROM events WHERE id=$1`, [eventId])).rows[0];
  mail.push({ to: rows[0].email, subject: `A spot opened up for ${ev.title}`, text: `A seat opened up at ${ev.title} and it is yours. Your ticket code is ${code}.`, registrationId: rows[0].id, eventId });
  await renumberWaitlist(tx, eventId);
}

async function flushMailSafe(mail: any[]) {
  for (const m of mail) {
    try { await sendMail({ to: m.to, subject: m.subject, text: m.text, registrationId: m.registrationId, eventId: m.eventId }); } catch (e) { console.error(JSON.stringify({ level: 'error', msg: 'mail_failed', to: m.to })); }
  }
}

/** --- cancel an event --- */
eventRoutes.post('/:slug/cancel', async (c) => {
  const account = await authAccount(c);
  if (!account) return c.json({ message: `Sign in to cancel this event.` }, 401);
  const ev = await findEvent(c.req.param('slug'));
  if (!ev || ev.owner_account_id !== account.id) return c.json({ message: `Page Not Found` }, 404);
  const body = await c.req.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason) return c.json({ field: 'reason', message: `Tell your guests why the event is off, in a sentence.` }, 400);
  if (ev.state === 'cancelled') {
    return c.json({ field: 'reason', message: `This event is already cancelled.` }, 400);
  }
  const mail: any[] = [];
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    await tx.query(`SELECT id FROM events WHERE id = $1 FOR UPDATE`, [ev.id]);
    await tx.query(
      `UPDATE events SET state='cancelled', cancelled_at=now(), cancel_reason=$2, updated_at=now() WHERE id=$1`,
      [ev.id, reason]
    );
    const { rows: guests } = await tx.query(
      `SELECT r.id AS rid, a.email FROM registrations r JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in','waitlisted','pending_approval')`, [ev.id]);
    for (const g of guests) {
      mail.push({ to: g.email, subject: `${ev.title} has been cancelled`, text: `${ev.title} has been cancelled by the host.\n\nThe host's words:\n${reason}`, registrationId: g.rid, eventId: ev.id });
    }
    await tx.query('COMMIT');
  } catch (e) { await tx.query('ROLLBACK'); throw e; } finally { tx.release(); }
  await flushMailSafe(mail);
  const fresh = await findEvent(ev.slug);
  return c.json(shapeEvent(fresh));
});

/** --- guest list (host only, owning host only) --- */
eventRoutes.get('/:slug/registrations', async (c) => {
  const account = await authAccount(c);
  if (!account) return c.json({ message: `Sign in to see the guest list.` }, 401);
  const ev = await findEvent(c.req.param('slug'));
  if (!ev) return c.json({ message: `Page Not Found` }, 404);
  const isOwner = ev.owner_account_id === account.id;
  const isHost = account.role === 'host';
  if (!isOwner || !isHost) return c.json({ message: `Page Not Found` }, 404);
  const { rows } = await db.query(
    `SELECT r.id, r.account_id, a.email, a.display_name, r.status, r.waitlist_position, r.ticket_code
       FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1
      ORDER BY r.status ASC, (r.waitlist_position IS NULL), r.waitlist_position ASC NULLS LAST, a.email ASC`,
    [ev.id]
  );
  return c.json(rows);
});

/** --- CSV export --- */
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

eventRoutes.get('/:slug/registrations.csv', async (c) => {
  const account = await authAccount(c);
  if (!account) return c.json({ message: `Sign in to export the guest list.` }, 401);
  const ev = await findEvent(c.req.param('slug'));
  if (!ev || ev.owner_account_id !== account.id || account.role !== 'host') {
    return c.json({ message: `Page Not Found` }, 404);
  }
  const { rows } = await db.query(
    `SELECT a.email, a.display_name, r.status, r.waitlist_position, r.ticket_code
       FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1
      ORDER BY r.status ASC, (r.waitlist_position IS NULL), r.waitlist_position ASC NULLS LAST, a.email ASC`,
    [ev.id]
  );
  const lines = [`email,display_name,status,waitlist_position,ticket_code`];
  for (const r of rows) lines.push([r.email, r.display_name, r.status, r.waitlist_position, r.ticket_code].map(csvCell).join(','));
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${ev.slug}.csv"`);
  return c.body(lines.join('\n') + '\n');
});
