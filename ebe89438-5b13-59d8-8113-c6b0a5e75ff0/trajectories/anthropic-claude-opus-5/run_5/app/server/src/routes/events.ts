import { Hono } from 'hono';
import { query, tx } from '../db.js';
import {
  ApiError,
  badRequest,
  bool,
  conflict,
  instant,
  int,
  isValidTimeZone,
  notFound,
  readBody,
  requireAccount,
  requireHost,
  str,
  type Account,
  type Vars,
} from '../http.js';
import { CATEGORIES, CATEGORY_SET, slugify, themeHexFromSeed } from '../domain.js';
import { EVENT_FROM, EVENT_SELECT, serializeEvent, type EventJoined } from '../serialize.js';
import { namespaceRefusal } from './accounts.js';
import {
  fillSeatsAfterRaise,
  flushMail,
  lockEvent,
  mailForTransition,
  releaseSeatAndPromote,
  renumberWaitlist,
  type PendingMail,
} from '../registrations.js';
import { log } from '../log.js';

export const eventRoutes = new Hono<{ Variables: Vars }>();

const DISCOVERABLE = `('published','registration_closed')`;

async function countsFor(eventIds: number[]): Promise<Map<number, { confirmed: number; waitlisted: number }>> {
  const out = new Map<number, { confirmed: number; waitlisted: number }>();
  for (const id of eventIds) out.set(id, { confirmed: 0, waitlisted: 0 });
  if (eventIds.length === 0) return out;
  // confirmed_count is counted on read from the registrations table, never stored.
  const r = await query<{ event_id: number; confirmed: number; waitlisted: number }>(
    `SELECT event_id,
            count(*) FILTER (WHERE status IN ('confirmed','checked_in'))::bigint AS confirmed,
            count(*) FILTER (WHERE status = 'waitlisted')::bigint AS waitlisted
       FROM registrations WHERE event_id = ANY($1::bigint[]) GROUP BY event_id`,
    [eventIds],
  );
  for (const row of r.rows) out.set(Number(row.event_id), { confirmed: row.confirmed, waitlisted: row.waitlisted });
  return out;
}

export async function loadEventBySlug(slug: string): Promise<EventJoined | null> {
  const r = await query<EventJoined>(`SELECT ${EVENT_SELECT} ${EVENT_FROM} WHERE e.slug = $1`, [slug]);
  return r.rows[0] ?? null;
}

export async function eventPayload(e: EventJoined) {
  const counts = await countsFor([e.id]);
  return serializeEvent(e, counts.get(e.id)!);
}

function ownsEvent(account: Account | undefined, e: EventJoined): boolean {
  return !!account && Number(e.owner_account_id) === account.id;
}

// GET /api/events - the events open to discovery.
eventRoutes.get('/', async (c) => {
  const url = new URL(c.req.url);
  const category = (url.searchParams.get('category') || '').trim().toLowerCase();
  const city = (url.searchParams.get('city') || '').trim();
  const qRaw = url.searchParams.get('q') || '';
  const q = qRaw.trim();

  const limitRaw = url.searchParams.get('limit');
  const offsetRaw = url.searchParams.get('offset');
  let limit = limitRaw === null || limitRaw === '' ? 20 : Number(limitRaw);
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;
  let offset = offsetRaw === null || offsetRaw === '' ? 0 : Number(offsetRaw);
  if (!Number.isFinite(offset) || !Number.isInteger(offset) || offset < 0) offset = 0;

  const params: unknown[] = [];
  const where: string[] = [`e.state IN ${DISCOVERABLE}`];
  if (category && category !== 'all') {
    params.push(category);
    where.push(`e.category = $${params.length}`);
  }
  if (city) {
    params.push(city.toLowerCase());
    where.push(`lower(e.city) = $${params.length}`);
  }
  if (q) {
    // Narrows what category and city already selected; the city is never q's job.
    params.push(`%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`);
    const p = `$${params.length}`;
    where.push(`(e.title ILIKE ${p} OR e.description ILIKE ${p} OR c.name ILIKE ${p})`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const totalR = await query<{ n: number }>(
    `SELECT count(*)::bigint AS n ${EVENT_FROM} ${whereSql}`,
    params,
  );
  const total = totalR.rows[0].n;

  const rows = await query<EventJoined>(
    `SELECT ${EVENT_SELECT} ${EVENT_FROM} ${whereSql}
      ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  const counts = await countsFor(rows.rows.map((r) => r.id));
  c.header('X-Total-Count', String(total));
  c.header('Access-Control-Expose-Headers', 'X-Total-Count');
  return c.json(rows.rows.map((r) => serializeEvent(r, counts.get(r.id)!)));
});

eventRoutes.get('/:slug', async (c) => {
  const account = c.get('account');
  const e = await loadEventBySlug(c.req.param('slug'));
  // A draft returns, to everyone but its host, the response a slug that never
  // existed returns.
  if (!e || (e.state === 'draft' && !ownsEvent(account, e))) throw notFound();
  const payload = await eventPayload(e);
  const mine = account
    ? await query(
        `SELECT id, status, waitlist_position, ticket_code, checked_in_at
           FROM registrations WHERE event_id = $1 AND account_id = $2`,
        [e.id, account.id],
      )
    : null;
  return c.json({
    ...payload,
    is_owner: ownsEvent(account, e),
    my_registration: mine?.rows[0] ?? null,
  });
});

async function uniqueEventSlug(title: string): Promise<string> {
  const base = slugify(title) || 'event';
  for (let i = 0; i < 500; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await namespaceRefusal(candidate, 'slug'))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

eventRoutes.post('/', async (c) => {
  const account = requireHost(c);
  const body = await readBody(c);

  const calendarSlug = str(body, 'calendar_slug', { required: true, max: 80 })!;
  const cal = await query<{ id: number; owner_account_id: number; category: string; city: string }>(
    `SELECT id, owner_account_id, category, city FROM calendars WHERE slug = $1`,
    [calendarSlug],
  );
  const calendar = cal.rows[0];
  // Scope is by ownership of the calendar, not by role.
  if (!calendar || Number(calendar.owner_account_id) !== account.id) throw notFound();

  const title = str(body, 'title', { max: 200 });
  const category = str(body, 'category', { max: 40 })?.toLowerCase();
  const city = str(body, 'city', { max: 120 });
  const timeZone = str(body, 'time_zone', { max: 60 }) || 'UTC';
  const startsAt = instant(body, 'starts_at');
  const endsAt = instant(body, 'ends_at');
  const capacity = int(body, 'capacity', 1, 500);
  const approvalRequired = bool(body, 'approval_required') ?? false;
  const waitlistEnabled = bool(body, 'waitlist_enabled') ?? true;
  const description = str(body, 'description', { max: 4000 }) || '';
  const requestedSlug = str(body, 'slug', { max: 80 })?.toLowerCase();

  if (category && !CATEGORY_SET.has(category)) {
    throw badRequest(`Choose one of the twelve categories: ${CATEGORIES.join(', ')}.`, 'category');
  }
  if (!isValidTimeZone(timeZone)) throw badRequest('Choose a real IANA time zone, such as Europe/Berlin.', 'time_zone');
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw badRequest('The end must come after the start.', 'ends_at');
  }

  // A submission missing any publishing requirement is stored as a draft.
  const complete = !!(title && category && city && startsAt && endsAt && capacity);
  const state = complete ? 'published' : 'draft';

  let slug: string;
  if (requestedSlug) {
    const refusal = await namespaceRefusal(requestedSlug, 'slug');
    if (refusal) throw conflict(refusal, 'slug');
    slug = requestedSlug;
  } else {
    slug = await uniqueEventSlug(title || 'untitled event');
  }

  const coverSeed = `${slug}-${Date.now().toString(36)}`;
  const themeHex = str(body, 'theme_hex', { max: 7 })?.toLowerCase();
  const theme = themeHex && /^#[0-9a-f]{6}$/.test(themeHex) ? themeHex : themeHexFromSeed(coverSeed);

  try {
    const r = await query<EventJoined>(
      `WITH ins AS (
         INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex,
                             description, starts_at, ends_at, capacity, approval_required, waitlist_enabled,
                             state, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *
       )
       SELECT ins.*, c.slug AS calendar_slug, c.name AS calendar_name, c.is_public AS calendar_is_public,
              c.owner_account_id
         FROM ins JOIN calendars c ON c.id = ins.calendar_id`,
      [
        calendar.id,
        title || 'Untitled event',
        slug,
        category ?? null,
        city ?? null,
        timeZone,
        coverSeed,
        theme,
        description,
        startsAt ?? null,
        endsAt ?? null,
        capacity ?? null,
        approvalRequired,
        waitlistEnabled,
        state,
        state === 'published' ? new Date().toISOString() : null,
      ],
    );
    log.info('event created', { slug, state, account_id: account.id });
    return c.json(await eventPayload(r.rows[0]), 201);
  } catch (e: any) {
    if (e?.constraint === 'events_slug_key') throw conflict('That address is already taken.', 'slug');
    throw e;
  }
});

eventRoutes.patch('/:slug', async (c) => {
  const account = requireHost(c);
  const body = await readBody(c);
  const slug = c.req.param('slug');

  const before = await loadEventBySlug(slug);
  if (!before || Number(before.owner_account_id) !== account.id) throw notFound();

  const title = str(body, 'title', { max: 200 });
  const category = str(body, 'category', { max: 40 })?.toLowerCase();
  const city = str(body, 'city', { max: 120 });
  const timeZone = str(body, 'time_zone', { max: 60 });
  const startsAt = instant(body, 'starts_at');
  const endsAt = instant(body, 'ends_at');
  const capacity = int(body, 'capacity', 1, 500);
  const approvalRequired = bool(body, 'approval_required');
  const waitlistEnabled = bool(body, 'waitlist_enabled');
  const description = body?.description === undefined ? undefined : String(body.description).slice(0, 4000);
  const nextState = str(body, 'state', { max: 30 });

  if (category && !CATEGORY_SET.has(category)) {
    throw badRequest(`Choose one of the twelve categories: ${CATEGORIES.join(', ')}.`, 'category');
  }
  if (timeZone && !isValidTimeZone(timeZone)) {
    throw badRequest('Choose a real IANA time zone, such as Europe/Berlin.', 'time_zone');
  }

  const mails: PendingMail[] = [];
  const result = await tx(async (client) => {
    const ev = await lockEvent(client, before.id);

    if (ev.state === 'cancelled') {
      // A cancellation is the one edit that cannot be undone.
      throw badRequest('This event has been cancelled, and a cancellation cannot be undone.', 'state');
    }

    let state = ev.state;
    if (nextState !== undefined && nextState !== ev.state) {
      const allowed: Record<string, string[]> = {
        draft: ['published'],
        published: ['registration_closed'],
        registration_closed: ['published'],
        cancelled: [],
      };
      if (!allowed[ev.state].includes(nextState)) {
        throw badRequest(`An event in ${ev.state} cannot move to ${nextState}.`, 'state');
      }
      state = nextState as typeof state;
    }

    const finalStarts = startsAt ?? ev.starts_at;
    const finalEnds = endsAt ?? ev.ends_at;
    if (finalStarts && finalEnds && new Date(finalEnds) <= new Date(finalStarts)) {
      throw badRequest('The end must come after the start.', 'ends_at');
    }

    const seatCount = (
      await client.query<{ n: number }>(
        `SELECT count(*)::bigint AS n FROM registrations
          WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
        [ev.id],
      )
    ).rows[0].n;

    if (capacity !== undefined && capacity < seatCount) {
      throw badRequest(`You already have ${seatCount} guests confirmed.`, 'capacity');
    }

    if (state === 'published' && ev.state === 'draft') {
      const t = title ?? ev.title;
      const cat = category ?? ev.category;
      const ci = city ?? ev.city;
      const cap = capacity ?? ev.capacity;
      if (!t || !cat || !ci || !finalStarts || !finalEnds || !cap) {
        throw badRequest('Publishing needs a title, a category, a city, a start, an end after it and a capacity.', 'state');
      }
    }

    const updated = await client.query<EventJoined>(
      `WITH upd AS (
        UPDATE events SET
          title = COALESCE($2, title),
          category = COALESCE($3, category),
          city = COALESCE($4, city),
          time_zone = COALESCE($5, time_zone),
          starts_at = COALESCE($6, starts_at),
          ends_at = COALESCE($7, ends_at),
          capacity = COALESCE($8, capacity),
          approval_required = COALESCE($9, approval_required),
          waitlist_enabled = COALESCE($10, waitlist_enabled),
          description = COALESCE($11, description),
          state = $12,
          published_at = CASE WHEN $12 <> 'draft' AND published_at IS NULL THEN now() ELSE published_at END,
          updated_at = now()
        WHERE id = $1
        RETURNING *
      )
      SELECT upd.*, c.slug AS calendar_slug, c.name AS calendar_name, c.is_public AS calendar_is_public,
             c.owner_account_id
        FROM upd JOIN calendars c ON c.id = upd.calendar_id`,
      [
        ev.id,
        title ?? null,
        category ?? null,
        city ?? null,
        timeZone ?? null,
        startsAt ?? null,
        endsAt ?? null,
        capacity ?? null,
        approvalRequired ?? null,
        waitlistEnabled ?? null,
        description ?? null,
        state,
      ],
    );
    const after = updated.rows[0];

    let moved = 0;
    if (capacity !== undefined && capacity > (ev.capacity ?? 0)) {
      const filled = await fillSeatsAfterRaise(client, after);
      moved = filled.moved;
      mails.push(...filled.mails);
    }

    // Times or location changed on an event that already has confirmed guests:
    // every one of those guests is mailed.
    const timesOrPlaceChanged =
      (startsAt && startsAt !== ev.starts_at) ||
      (endsAt && endsAt !== ev.ends_at) ||
      (city && city !== ev.city);
    if (timesOrPlaceChanged && seatCount > 0) {
      const guests = await client.query<{ id: number; email: string; display_name: string; registration_id: number }>(
        `SELECT a.id, a.email, a.display_name, r.id AS registration_id
           FROM registrations r JOIN accounts a ON a.id = r.account_id
          WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in')`,
        [ev.id],
      );
      for (const g of guests.rows) {
        mails.push(mailForTransition('event_updated', after, g, g.registration_id));
      }
    }

    return { after, moved };
  });

  await flushMail(mails);
  const payload = await eventPayload(result.after);
  return c.json({ ...payload, promoted_from_waitlist: result.moved });
});

eventRoutes.post('/:slug/cancel', async (c) => {
  const account = requireHost(c);
  const body = await readBody(c);
  const reason = str(body, 'reason', { max: 1000 });
  if (!reason) throw badRequest('Type a reason so your guests know what happened.', 'reason');

  const before = await loadEventBySlug(c.req.param('slug'));
  if (!before || Number(before.owner_account_id) !== account.id) throw notFound();

  const mails: PendingMail[] = [];
  const after = await tx(async (client) => {
    const ev = await lockEvent(client, before.id);
    if (ev.state === 'cancelled') throw badRequest('This event has already been cancelled.', 'state');

    const holders = await client.query<{ id: number; email: string; display_name: string; registration_id: number }>(
      `SELECT a.id, a.email, a.display_name, r.id AS registration_id
         FROM registrations r JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in','waitlisted','pending_approval')`,
      [ev.id],
    );

    const updated = await client.query<EventJoined>(
      `WITH upd AS (
        UPDATE events SET state = 'cancelled', cancelled_at = now(), cancel_reason = $2, updated_at = now()
        WHERE id = $1 RETURNING *
      )
      SELECT upd.*, c.slug AS calendar_slug, c.name AS calendar_name, c.is_public AS calendar_is_public,
             c.owner_account_id
        FROM upd JOIN calendars c ON c.id = upd.calendar_id`,
      [ev.id, reason],
    );

    for (const h of holders.rows) {
      // The host's own words, carried word for word.
      mails.push(mailForTransition('event_cancelled', updated.rows[0], h, h.registration_id, reason));
    }
    return updated.rows[0];
  });

  await flushMail(mails);
  log.info('event cancelled', { slug: after.slug, notified: mails.length });
  const payload = await eventPayload(after);
  return c.json({ ...payload, cancel_reason: after.cancel_reason });
});

async function guestList(eventId: number) {
  const r = await query(
    `SELECT r.id, r.account_id, a.email, a.display_name, r.status, r.waitlist_position, r.ticket_code,
            r.checked_in_at, r.created_at
       FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1
      ORDER BY r.status ASC, r.waitlist_position ASC NULLS LAST, a.email ASC`,
    [eventId],
  );
  return r.rows;
}

async function requireOwnedEvent(c: any): Promise<EventJoined> {
  const account = requireHost(c);
  const e = await loadEventBySlug(c.req.param('slug'));
  if (!e || Number(e.owner_account_id) !== account.id) throw notFound();
  return e;
}

eventRoutes.get('/:slug/registrations', async (c) => {
  const e = await requireOwnedEvent(c);
  return c.json(await guestList(e.id));
});

function csvCell(value: unknown): string {
  const v = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

eventRoutes.get('/:slug/registrations.csv', async (c) => {
  const e = await requireOwnedEvent(c);
  const rows = await guestList(e.id);
  const lines = ['email,display_name,status,waitlist_position,ticket_code'];
  for (const r of rows) {
    lines.push(
      [r.email, r.display_name, r.status, r.waitlist_position ?? '', r.ticket_code ?? '']
        .map(csvCell)
        .join(','),
    );
  }
  return new Response(lines.join('\n') + '\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${e.slug}.csv"`,
    },
  });
});
