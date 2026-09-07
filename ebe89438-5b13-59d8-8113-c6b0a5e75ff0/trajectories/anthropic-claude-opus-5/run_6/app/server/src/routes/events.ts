import { Hono } from 'hono';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requireAccount } from '../auth.js';
import { AppError, denied, notFound } from '../errors.js';
import { CATEGORIES, slugify, themeFromSeed, STATUS_ORDER } from '../domain.js';
import { claimName } from '../namespace.js';
import { categoryEnum, parseBody, readJson, rfc3339, timeZoneField, toIso } from '../shape.js';
import { EVENT_SELECT, serializeEvent, serializeRegistration } from '../serialize.js';
import {
  EventRow, loadEventForUpdate, lockEvent, mailBase, promoteFromWaitlist, confirmedCount,
} from '../registrations.js';
import { PendingMail, sendMails } from '../mailer.js';

export const eventRoutes = new Hono();

const DISCOVERABLE = `('published','registration_closed')`;

/** GET /api/events - the events open to discovery, filtered and paged. */
eventRoutes.get('/', async (c) => {
  const url = new URL(c.req.url);
  const category = (url.searchParams.get('category') || '').trim().toLowerCase();
  const city = (url.searchParams.get('city') || '').trim();
  const qRaw = url.searchParams.get('q') || '';
  const q = qRaw.trim();

  const limitRaw = url.searchParams.get('limit');
  const offsetRaw = url.searchParams.get('offset');
  let limit = limitRaw === null ? 20 : Number(limitRaw);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  limit = Math.min(Math.trunc(limit), 100);
  let offset = offsetRaw === null ? 0 : Number(offsetRaw);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  offset = Math.trunc(offset);

  // The three filters combine as one condition: each narrows what the others left.
  const where: string[] = [`e.state IN ${DISCOVERABLE}`];
  const params: any[] = [];
  if (category && (CATEGORIES as readonly string[]).includes(category)) {
    params.push(category);
    where.push(`e.category = $${params.length}`);
  }
  if (city) {
    params.push(city);
    where.push(`e.city ILIKE $${params.length}`);
  }
  if (q) {
    params.push(`%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`);
    const p = `$${params.length}`;
    where.push(`(e.title ILIKE ${p} ESCAPE '\\' OR e.description ILIKE ${p} ESCAPE '\\' OR cal.name ILIKE ${p} ESCAPE '\\')`);
  }
  const whereSql = where.join(' AND ');

  const total = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM events e JOIN calendars cal ON cal.id = e.calendar_id WHERE ${whereSql}`,
    params,
  );

  const rows = await query(
    `${EVENT_SELECT} WHERE ${whereSql}
      ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  c.header('X-Total-Count', total.rows[0].n);
  c.header('Access-Control-Expose-Headers', 'X-Total-Count');
  return c.json(rows.rows.map((e) => serializeEvent(e)));
});

/** GET /api/events/{slug} - a draft is not-found to everyone but its host. */
eventRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const r = await query(`${EVENT_SELECT} WHERE e.slug = $1`, [slug]);
  const e = r.rows[0];
  if (!e) throw notFound();
  const account = c.get('account');
  const isOwner = !!account && Number(e.owner_account_id) === account.id;
  if (e.state === 'draft' && !isOwner) throw notFound();

  const wl = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM registrations WHERE event_id = $1 AND status = 'waitlisted'`,
    [e.id],
  );
  e.waitlist_count = wl.rows[0].n;

  const payload: any = serializeEvent(e, { owner: isOwner });
  if (account) {
    const mine = await query(
      'SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2',
      [e.id, account.id],
    );
    payload.my_registration = mine.rows[0] ? serializeRegistration(mine.rows[0]) : null;
  } else {
    payload.my_registration = null;
  }
  return c.json(payload);
});

const createSchema = z.object({
  calendar_slug: z.string().trim().min(1, 'Choose which calendar this event belongs to.'),
  title: z.string().trim().max(200).optional().default(''),
  category: z.union([categoryEnum, z.literal('')]).optional(),
  city: z.string().trim().max(120).optional().default(''),
  time_zone: timeZoneField.optional().default('UTC'),
  starts_at: z.union([rfc3339, z.literal(''), z.null()]).optional(),
  ends_at: z.union([rfc3339, z.literal(''), z.null()]).optional(),
  capacity: z.union([z.number().int(), z.null()]).optional(),
  approval_required: z.boolean().optional().default(false),
  waitlist_enabled: z.boolean().optional().default(true),
  description: z.string().max(4000).optional().default(''),
  slug: z.string().trim().optional(),
});

async function freeSlugFrom(base: string): Promise<string> {
  const root = slugify(base);
  for (let i = 0; i < 2000; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const r = await query('SELECT 1 FROM namespace_reservations WHERE slug = $1', [candidate]);
    if (r.rowCount === 0 && !(CATEGORIES as readonly string[]).includes(candidate)) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** POST /api/events - complete submissions publish; incomplete ones are stored as draft. */
eventRoutes.post('/', async (c) => {
  const account = requireAccount(c);
  if (account.role !== 'host') throw denied();
  const body = parseBody(createSchema, await readJson(c));

  const cal = await query(
    'SELECT * FROM calendars WHERE slug = $1',
    [body.calendar_slug.toLowerCase()],
  );
  const calendar = cal.rows[0];
  if (!calendar) throw new AppError(422, 'calendar_slug: No calendar of yours has that address.', { field: 'calendar_slug' });
  if (Number(calendar.owner_account_id) !== account.id) throw denied();

  const capacity = body.capacity ?? null;
  if (capacity !== null && (capacity < 1 || capacity > 500)) {
    throw new AppError(422, 'capacity: Choose a capacity between 1 and 500.', { field: 'capacity' });
  }
  const startsAt = body.starts_at ? toIso(body.starts_at) : null;
  const endsAt = body.ends_at ? toIso(body.ends_at) : null;
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw new AppError(422, 'ends_at: The end must come after the start.', { field: 'ends_at' });
  }

  const title = body.title.trim();
  const category = body.category || calendar.category;
  const city = body.city.trim() || calendar.city;
  // Publishing needs all of these; anything missing is stored as a draft.
  const complete = !!(title && category && city && startsAt && endsAt && capacity !== null);
  const state = complete ? 'published' : 'draft';

  const slug = body.slug
    ? body.slug.toLowerCase()
    : await freeSlugFrom(title || `${calendar.slug}-event`);

  const coverSeed = `${slug}-${Date.now().toString(36)}`;
  const themeHex = themeFromSeed(coverSeed);

  const created = await tx(async (client) => {
    await claimName(client, slug, 'event', 'That address is already taken.');
    const r = await client.query(
      `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex,
                           description, starts_at, ends_at, capacity, approval_required,
                           waitlist_enabled, state, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        calendar.id, title || 'Untitled event', slug, category, city, body.time_zone, coverSeed,
        themeHex, body.description, startsAt, endsAt, capacity, body.approval_required,
        body.waitlist_enabled, state, complete ? new Date().toISOString() : null,
      ],
    );
    return r.rows[0];
  });

  const full = await query(`${EVENT_SELECT} WHERE e.id = $1`, [created.id]);
  return c.json(serializeEvent(full.rows[0], { owner: true }), 201);
});

const patchSchema = createSchema.partial().extend({
  state: z.enum(['draft', 'published', 'registration_closed', 'cancelled']).optional(),
});

/** PATCH /api/events/{slug} - ordinary edits, including the state moves that are allowed. */
eventRoutes.patch('/:slug', async (c) => {
  const account = requireAccount(c);
  const slug = c.req.param('slug');
  const body = parseBody(patchSchema, await readJson(c));

  const result = await tx(async (client) => {
    const ev = await loadEventForUpdate(client, slug);
    if (!ev) throw notFound();
    if (Number(ev.owner_account_id) !== account.id) {
      // A host who does not own it, and a guest, meet the same not-found page.
      throw account.role === 'host' ? denied() : notFound();
    }
    await lockEvent(client, ev.id);

    if (body.state !== undefined) {
      const from = ev.state, to = body.state;
      if (to === 'cancelled') {
        throw new AppError(422, 'state: Call the event off at its own endpoint, with a reason.', { field: 'state' });
      }
      if (from === 'cancelled') {
        throw new AppError(409, 'A cancelled event cannot move to another state.', { code: 'refused' });
      }
      if (to === 'draft' && from !== 'draft') {
        throw new AppError(409, 'A published event cannot be returned to draft.', { code: 'refused' });
      }
      if (to === 'registration_closed' && from !== 'published' && from !== 'registration_closed') {
        throw new AppError(409, 'Only a published event can stop taking registrations.', { code: 'refused' });
      }
    }

    const sets: string[] = [];
    const params: any[] = [];
    const push = (col: string, val: any) => { params.push(val); sets.push(`${col} = $${params.length}`); };

    let mailNotes: string[] = [];
    const nextStarts = body.starts_at !== undefined ? (body.starts_at ? toIso(body.starts_at) : null) : ev.starts_at;
    const nextEnds = body.ends_at !== undefined ? (body.ends_at ? toIso(body.ends_at) : null) : ev.ends_at;
    if (nextStarts && nextEnds && new Date(nextEnds) <= new Date(nextStarts)) {
      throw new AppError(422, 'ends_at: The end must come after the start.', { field: 'ends_at' });
    }

    if (body.title !== undefined) push('title', body.title.trim() || ev.title);
    if (body.description !== undefined) push('description', body.description);
    if (body.category !== undefined && body.category) push('category', body.category);
    if (body.time_zone !== undefined) push('time_zone', body.time_zone);
    if (body.approval_required !== undefined) push('approval_required', body.approval_required);
    if (body.waitlist_enabled !== undefined) push('waitlist_enabled', body.waitlist_enabled);

    const taken = await confirmedCount(client, ev.id);
    const timeChanged = (body.starts_at !== undefined && toIso(nextStarts as any) !== toIso(ev.starts_at)) ||
      (body.ends_at !== undefined && toIso(nextEnds as any) !== toIso(ev.ends_at));
    const cityChanged = body.city !== undefined && body.city.trim() && body.city.trim() !== ev.city;

    if (body.starts_at !== undefined) push('starts_at', nextStarts);
    if (body.ends_at !== undefined) push('ends_at', nextEnds);
    if (cityChanged) push('city', body.city!.trim());
    if (timeChanged) mailNotes.push('The time of this event has changed.');
    if (cityChanged) mailNotes.push('The location of this event has changed.');

    let promotedCount = 0;
    let mails: PendingMail[] = [];

    if (body.capacity !== undefined && body.capacity !== null) {
      const cap = body.capacity;
      if (cap < 1 || cap > 500) {
        throw new AppError(422, 'capacity: Choose a capacity between 1 and 500.', { field: 'capacity' });
      }
      if (cap < taken) {
        throw new AppError(409, `You already have ${taken} guests confirmed.`, {
          field: 'capacity', code: 'capacity_below_confirmed', extra: { confirmed_count: taken },
        });
      }
      push('capacity', cap);
    }
    if (body.state !== undefined) {
      push('state', body.state);
      if (body.state === 'published' && ev.state === 'draft') push('published_at', new Date().toISOString());
    }

    if (sets.length === 0) {
      const cur = await client.query(`${EVENT_SELECT} WHERE e.id = $1`, [ev.id]);
      return { row: cur.rows[0], mails: [] as PendingMail[], promoted: 0 };
    }

    params.push(ev.id);
    const upd = await client.query(
      `UPDATE events SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
      params,
    );
    const after: EventRow = { ...upd.rows[0], owner_account_id: ev.owner_account_id };

    // Raising capacity fills the seats that just appeared, in this same request.
    if (body.capacity !== undefined && body.capacity !== null && ev.capacity !== null && body.capacity > ev.capacity) {
      const room = body.capacity - taken;
      if (room > 0) {
        const out = await promoteFromWaitlist(client, after, room);
        promotedCount = out.promoted.length;
        mails = mails.concat(out.mails);
      }
    }

    // Guests holding a place are told when the time or the place moves.
    if ((timeChanged || cityChanged) && taken > 0) {
      const holders = await client.query(
        `SELECT r.id, a.email, a.display_name FROM registrations r
           JOIN accounts a ON a.id = r.account_id
          WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in')`,
        [ev.id],
      );
      for (const h of holders.rows) {
        mails.push({
          kind: 'event_updated',
          ...mailBase(after, h.email, h.display_name, Number(h.id)),
          note: mailNotes.join(' '),
        });
      }
    }

    const cur = await client.query(`${EVENT_SELECT} WHERE e.id = $1`, [ev.id]);
    return { row: cur.rows[0], mails, promoted: promotedCount };
  });

  await sendMails(result.mails);
  const payload: any = serializeEvent(result.row, { owner: true });
  payload.promoted_count = result.promoted;
  return c.json(payload);
});

const cancelSchema = z.object({
  reason: z.string().trim().min(1, 'Type why the event is called off.').max(1000),
});

/** POST /api/events/{slug}/cancel - mails every guest still holding a place. */
eventRoutes.post('/:slug/cancel', async (c) => {
  const account = requireAccount(c);
  const slug = c.req.param('slug');
  const body = parseBody(cancelSchema, await readJson(c));

  const out = await tx(async (client) => {
    const ev = await loadEventForUpdate(client, slug);
    if (!ev) throw notFound();
    if (Number(ev.owner_account_id) !== account.id) {
      throw account.role === 'host' ? denied() : notFound();
    }
    await lockEvent(client, ev.id);
    if (ev.state === 'cancelled') {
      throw new AppError(409, 'This event has already been called off.', { code: 'refused' });
    }
    const upd = await client.query(
      `UPDATE events SET state = 'cancelled', cancelled_at = now(), cancel_reason = $2, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [ev.id, body.reason],
    );
    const after: EventRow = { ...upd.rows[0], owner_account_id: ev.owner_account_id };

    const holders = await client.query(
      `SELECT r.id, a.email, a.display_name FROM registrations r
         JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1
          AND r.status IN ('confirmed','checked_in','waitlisted','pending_approval')`,
      [ev.id],
    );
    const mails: PendingMail[] = holders.rows.map((h: any) => ({
      kind: 'event_cancelled' as const,
      ...mailBase(after, h.email, h.display_name, Number(h.id)),
      cancelReason: body.reason,
    }));

    await client.query(
      `UPDATE registrations
          SET status = 'cancelled_by_host', seat_no = NULL, ticket_code = NULL,
              waitlist_position = NULL, updated_at = now()
        WHERE event_id = $1 AND status IN ('confirmed','checked_in','waitlisted','pending_approval')`,
      [ev.id],
    );

    const cur = await client.query(`${EVENT_SELECT} WHERE e.id = $1`, [ev.id]);
    return { row: cur.rows[0], mails };
  });

  await sendMails(out.mails);
  return c.json(serializeEvent(out.row, { owner: true }));
});

async function ownedEventOr404(slug: string, accountId: number, role: string) {
  const r = await query(`${EVENT_SELECT} WHERE e.slug = $1`, [slug]);
  const e = r.rows[0];
  if (!e) throw notFound();
  if (Number(e.owner_account_id) !== accountId) throw role === 'host' ? denied() : notFound();
  return e;
}

const GUEST_LIST_SQL = `
  SELECT r.id, r.account_id, a.email, a.display_name, r.status,
         r.waitlist_position, r.ticket_code, r.checked_in_at, r.created_at
    FROM registrations r JOIN accounts a ON a.id = r.account_id
   WHERE r.event_id = $1`;

function sortGuests(rows: any[]) {
  return rows.slice().sort((x, y) => {
    if (x.status !== y.status) return x.status < y.status ? -1 : 1;
    const px = x.waitlist_position, py = y.waitlist_position;
    if (px !== py) {
      if (px === null) return 1;
      if (py === null) return -1;
      return px - py;
    }
    return x.email < y.email ? -1 : x.email > y.email ? 1 : 0;
  });
}

eventRoutes.get('/:slug/registrations', async (c) => {
  const account = requireAccount(c);
  const e = await ownedEventOr404(c.req.param('slug'), account.id, account.role);
  const rows = await query(GUEST_LIST_SQL, [e.id]);
  return c.json(sortGuests(rows.rows).map((r) => ({
    id: Number(r.id),
    account_id: Number(r.account_id),
    email: r.email,
    display_name: r.display_name,
    status: r.status,
    waitlist_position: r.waitlist_position === null ? null : Number(r.waitlist_position),
    ticket_code: r.ticket_code,
    checked_in_at: toIso(r.checked_in_at),
  })));
});

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

eventRoutes.get('/:slug/registrations.csv', async (c) => {
  const account = requireAccount(c);
  const slug = c.req.param('slug');
  const e = await ownedEventOr404(slug, account.id, account.role);
  const rows = await query(GUEST_LIST_SQL, [e.id]);
  const lines = ['email,display_name,status,waitlist_position,ticket_code'];
  for (const r of sortGuests(rows.rows)) {
    lines.push([r.email, r.display_name, r.status, r.waitlist_position ?? '', r.ticket_code ?? '']
      .map(csvCell).join(','));
  }
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${slug}.csv"`);
  return c.body(lines.join('\n') + '\n');
});
