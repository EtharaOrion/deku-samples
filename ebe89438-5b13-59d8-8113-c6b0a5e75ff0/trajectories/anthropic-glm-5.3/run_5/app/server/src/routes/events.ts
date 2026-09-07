import { Hono } from 'hono';
import { pool, tx, type Tx } from '../db.js';
import { requireAuth, type AuthAccount } from '../auth.js';
import { CATEGORIES, isCategory } from '../categories.js';
import { isKebabCase, slugify, themeFromSeed, newCoverSeed, isReservedPath } from '../slugs.js';
import { parseInstant, isIanaZone, toRfc3339 } from '../time.js';
import { DomainError } from '../domain/registrations.js';
import { EVENT_LIST_FIELDS, loadEventBySlug, loadEventById, serializeEvent, confirmedCountFor, type EventRow } from '../domain/events.js';
import { cancelEvent, assertOwnsEvent, promoteIntoNewSeats } from '../domain/service/lifecycle.js';
import { queueMail, dispatchMail, type QueuedMail } from '../domain/mail.js';
import type { MailTransition } from '../mailcopy.js';

export const eventRoutes = new Hono();

const DISCOVERABLE = `('published','registration_closed')`;

function domainError(c: any, err: DomainError) {
  return c.json({ message: err.message, field: err.field ?? null }, err.status as 400 | 401 | 403 | 404 | 409 | 500);
}

async function readListParams(c: any) {
  const q = (c.req.query('q') ?? '').trim();
  const category = c.req.query('category') ?? '';
  const city = c.req.query('city') ?? '';
  const rawLimit = Number(c.req.query('limit'));
  const rawOffset = Number(c.req.query('offset'));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 20;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { q, category, city, limit, offset };
}

eventRoutes.get('/', async (c) => {
  const { q, category, city, limit, offset } = await readListParams(c);
  const params: unknown[] = [];
  const where: string[] = [`e.state IN ${DISCOVERABLE}`];
  if (category && isCategory(category)) {
    params.push(category);
    where.push(`e.category = $${params.length}`);
  }
  if (city) {
    params.push(city);
    where.push(`e.city ILIKE $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    const idx = params.length;
    where.push(`(e.title ILIKE $${idx} OR e.description ILIKE $${idx} OR c.name ILIKE $${idx})`);
  }
  const whereSql = where.join(' AND ');
  const countParams = params.slice();
  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int AS n FROM events e JOIN calendars c ON c.id = e.calendar_id WHERE ${whereSql}`,
    countParams,
  );
  const total = countRows[0].n as number;
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;
  const { rows } = await pool.query(
    `SELECT ${EVENT_LIST_FIELDS} FROM events e JOIN calendars c ON c.id = e.calendar_id
      WHERE ${whereSql}
      ORDER BY e.starts_at ASC, e.slug ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );
  const withCounts = await Promise.all(
    rows.map(async (row) => {
      const n = await confirmedCountFor(pool as unknown as Tx, row.id);
      return serializeEvent(row as EventRow, n);
    }),
  );
  c.header('X-Total-Count', String(total));
  c.header('Access-Control-Expose-Headers', 'X-Total-Count');
  return c.json(withCounts);
});

eventRoutes.get('/:slug', async (c) => {
  const slug = String(c.req.param('slug'));
  const { rows } = await pool.query(
    `SELECT ${EVENT_LIST_FIELDS} FROM events e JOIN calendars c ON c.id = e.calendar_id WHERE e.slug = $1`,
    [slug],
  );
  const row = rows[0] as EventRow | undefined;
  if (!row) return c.json({ message: 'That event does not exist.' }, 404);
  const account = await (await import('../auth.js')).currentAccount(c);
  const isOwner = account?.id === row.owner_account_id;
  if (row.state === 'draft' && !isOwner) {
    return c.json({ message: 'That event does not exist.' }, 404);
  }
  const n = await confirmedCountFor(pool as unknown as Tx, row.id);
  return c.json(serializeEvent(row, n));
});

type CreateBody = {
  calendar_slug?: string;
  title?: string;
  category?: string;
  city?: string;
  time_zone?: string;
  starts_at?: string;
  ends_at?: string;
  capacity?: number | string;
  approval_required?: boolean;
  waitlist_enabled?: boolean;
  description?: string;
  state?: string;
};

function validateEventBody(body: CreateBody, forPatch: boolean): { field: string; message: string }[] {
  const errors: Array<{ field: string; message: string }> = [];
  const check = (cond: boolean, field: string, message: string) => {
    if (!cond) errors.push({ field, message });
  };
  if (!forPatch || body.title !== undefined) {
    check(typeof body.title === 'string' && body.title.trim().length > 0, 'title', 'Give the event a name.');
  }
  if (!forPatch || body.category !== undefined) {
    check(typeof body.category === 'string' && isCategory(body.category), 'category', 'Pick one of the twelve categories.');
  }
  if (!forPatch || body.city !== undefined) {
    check(typeof body.city === 'string' && body.city.trim().length > 0, 'city', 'Say where the event happens.');
  }
  if (!forPatch || body.starts_at !== undefined) {
    check(parseInstant(body.starts_at) !== null, 'starts_at', 'Give a start time that includes a UTC offset or Z.');
  }
  if (!forPatch || body.ends_at !== undefined) {
    check(parseInstant(body.ends_at) !== null, 'ends_at', 'Give an end time that includes a UTC offset or Z.');
  }
  if (!forPatch || body.capacity !== undefined) {
    const cap = Number(body.capacity);
    check(Number.isInteger(cap) && cap >= 1 && cap <= 500, 'capacity', 'Capacity is a whole number from 1 to 500.');
  }
  if (body.time_zone !== undefined) {
    check(isIanaZone(body.time_zone), 'time_zone', 'Use an IANA zone name such as Europe/Berlin.');
  }
  if (parseInstant(body.starts_at) && parseInstant(body.ends_at)) {
    check(parseInstant(body.ends_at)!.getTime() > parseInstant(body.starts_at)!.getTime(), 'ends_at', 'The end has to come after the start.');
  }
  return errors;
}

eventRoutes.post('/', requireAuth, async (c) => {
  const account = c.get('account');
  if (account.role !== 'host') return c.json({ message: 'Only a host can create an event.', field: 'calendar_slug' }, 403);
  const body = (await c.req.json().catch(() => ({}))) as CreateBody;
  const { rows: calRows } = await pool.query(`SELECT * FROM calendars WHERE slug = $1`, [body.calendar_slug ?? '']);
  const calendar = calRows[0];
  if (!calendar || calendar.owner_account_id !== account.id) {
    return c.json({ message: 'Pick one of your own calendars for this event.', field: 'calendar_slug' }, 400);
  }
  const errors = validateEventBody(body, false);
  if (errors.length > 0) return c.json({ message: errors[0].message, field: errors[0].field, errors }, 400);

  const startsAt = parseInstant(body.starts_at)!;
  const endsAt = parseInstant(body.ends_at)!;
  const capacity = Number(body.capacity);
  const timeZone = body.time_zone && isIanaZone(body.time_zone) ? body.time_zone : 'UTC';
  const complete =
    typeof body.title === 'string' && body.title.trim().length > 0 &&
    typeof body.category === 'string' && isCategory(body.category) &&
    typeof body.city === 'string' && body.city.trim().length > 0 &&
    startsAt && endsAt && endsAt > startsAt && Number.isInteger(capacity) && capacity >= 1 && capacity <= 500;

  const wantsPublish = body.state === 'published';
  const state: EventRow['state'] = complete && wantsPublish ? 'published' : 'draft';
  const title = (body.title ?? '').trim();
  const coverSeed = newCoverSeed(title, body.city ?? '');
  const theme = themeFromSeed(coverSeed);
  const base = slugify(title) || 'event';

  let slug = base;
  for (let i = 0; ; i++) {
    const taken = await pool.query(
      `SELECT 1 WHERE EXISTS(SELECT 1 FROM events WHERE slug = $1)
          OR EXISTS(SELECT 1 FROM calendars WHERE slug = $1)
          OR EXISTS(SELECT 1 FROM accounts WHERE handle = $1)`,
      [slug],
    );
    if (taken.rowCount === 0) break;
    slug = `${base}-${i + 2}`;
  }

  const { rows } = await pool.query(
    `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex, description,
        starts_at, ends_at, capacity, approval_required, waitlist_enabled, state, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [
      calendar.id,
      title,
      slug,
      body.category,
      (body.city ?? '').trim(),
      timeZone,
      coverSeed,
      theme,
      typeof body.description === 'string' ? body.description : '',
      startsAt,
      endsAt,
      capacity,
      Boolean(body.approval_required),
      Boolean(body.waitlist_enabled),
      state,
      state === 'published' ? new Date() : null,
    ],
  );
  const fresh = await loadEventById(pool as unknown as Tx, rows[0].id);
  return c.json(serializeEvent(fresh as EventRow, 0), 201);
});

eventRoutes.patch('/:slug', requireAuth, async (c) => {
  const account = c.get('account');
  const slug = String(c.req.param('slug'));
  const body = (await c.req.json().catch(() => ({}))) as CreateBody & { state?: string };

  const queued: QueuedMail[] = [];
  try {
    await tx(async (client) => {
      const event = await loadEventBySlug(client, slug);
      if (!event || event.state === 'draft') throw new DomainError('That event does not exist.', 404);
      await assertOwnsEvent(account, event);
      if (event.state === 'cancelled') {
        throw new DomainError('A cancelled event cannot be edited.', 409, 'state');
      }
      await client.query(`SELECT id FROM events WHERE id = $1 FOR UPDATE`, [event.id]);

      const errors = validateEventBody(body, true);
      if (errors.length > 0) throw new DomainError(errors[0].message, 400, errors[0].field);

      const confirmedBefore = await confirmedCountFor(client, event.id);
      const nextTitle = body.title !== undefined ? body.title.trim() : event.title;
      const nextCategory = body.category !== undefined && isCategory(body.category) ? body.category : event.category;
      const nextCity = body.city !== undefined ? body.city.trim() : event.city;
      const nextDescription = body.description !== undefined ? String(body.description) : event.description;
      const nextStarts = body.starts_at !== undefined ? parseInstant(body.starts_at)! : event.starts_at;
      const nextEnds = body.ends_at !== undefined ? parseInstant(body.ends_at)! : event.ends_at;
      const nextCapacity = body.capacity !== undefined ? Number(body.capacity) : event.capacity;
      const nextApproval = body.approval_required !== undefined ? Boolean(body.approval_required) : event.approval_required;
      const nextWaitlist = body.waitlist_enabled !== undefined ? Boolean(body.waitlist_enabled) : event.waitlist_enabled;
      const nextTimeZone = body.time_zone !== undefined && isIanaZone(body.time_zone) ? body.time_zone : event.time_zone;

      if (nextCapacity < confirmedBefore) {
        throw new DomainError(`You already have ${confirmedBefore} guests confirmed.`, 400, 'capacity');
      }
      if (nextEnds.getTime() <= nextStarts.getTime()) {
        throw new DomainError('The end has to come after the start.', 400, 'ends_at');
      }

      let nextState: string = event.state;
      if (body.state !== undefined) {
        const wanted = String(body.state);
        if (event.state === 'published' && wanted === 'registration_closed') nextState = 'registration_closed';
        else if (event.state === 'registration_closed' && wanted === 'published') nextState = 'published';
        else if (String(event.state) === 'draft' && wanted === 'published') {
          const completeNow =
            Boolean(nextTitle) && Boolean(nextCategory) && Boolean(nextCity) && nextEnds > nextStarts &&
            Number.isInteger(nextCapacity) && nextCapacity >= 1 && nextCapacity <= 500;
          if (!completeNow) throw new DomainError('This event needs a title, category, city, times and a capacity before it can be published.', 400, 'state');
          nextState = 'published';
        } else if (wanted === event.state) {
          nextState = event.state;
        } else {
          throw new DomainError('That state change is not allowed.', 400, 'state');
        }
      }

      const timeOrPlaceChanged =
        nextStarts.getTime() !== new Date(event.starts_at).getTime() ||
        nextEnds.getTime() !== new Date(event.ends_at).getTime() ||
        nextCity !== event.city;

      const { rows } = await client.query(
        `UPDATE events SET title = $2, category = $3, city = $4, description = $5, starts_at = $6, ends_at = $7,
            capacity = $8, approval_required = $9, waitlist_enabled = $10, time_zone = $11, state = $12,
            published_at = coalesce(published_at, CASE WHEN $12 = 'published' THEN now() END), updated_at = now()
         WHERE id = $1 RETURNING *`,
        [
          event.id, nextTitle, nextCategory, nextCity, nextDescription, nextStarts, nextEnds,
          nextCapacity, nextApproval, nextWaitlist, nextTimeZone, nextState,
        ],
      );
      const fresh: EventRow = {
        ...(rows[0] as EventRow),
        calendar_name: event.calendar_name,
        calendar_slug: event.calendar_slug,
        owner_account_id: event.owner_account_id,
      };

      if (nextCapacity > event.capacity) {
        await promoteIntoNewSeats(client, fresh, nextCapacity, queued);
      }

      if (timeOrPlaceChanged && confirmedBefore > 0) {
        const holders = (
          await client.query(
            `SELECT r.id, a.email, a.display_name, r.ticket_code FROM registrations r JOIN accounts a ON a.id = r.account_id
              WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in')`,
            [event.id],
          )
        ).rows;
        for (const h of holders) {
          queued.push(queueMail(fresh, 'details_updated', {
            registrationId: h.id, email: h.email, displayName: h.display_name, ticketCode: h.ticket_code,
          }));
        }
      }
    }, 'SERIALIZABLE');
    await dispatchMail(queued);
    const fresh = await loadEventBySlug(pool as unknown as Tx, slug);
    const n = await confirmedCountFor(pool as unknown as Tx, fresh!.id);
    return c.json(serializeEvent(fresh as EventRow, n));
  } catch (err) {
    if (err instanceof DomainError) return domainError(c, err);
    throw err;
  }
});

eventRoutes.post('/:slug/cancel', requireAuth, async (c) => {
  const account = c.get('account');
  const slug = String(c.req.param('slug'));
  const body = await c.req.json().catch(() => ({}));
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) return c.json({ message: 'Tell your guests why the event is off.', field: 'reason' }, 400);
  try {
    const event = await cancelEvent(account, slug, reason);
    const n = await confirmedCountFor(pool as unknown as Tx, event.id);
    return c.json(serializeEvent(event, n));
  } catch (err) {
    if (err instanceof DomainError) return domainError(c, err);
    throw err;
  }
});

export async function findReservedNames(): Promise<Set<string>> {
  const { rows } = await pool.query(`
    SELECT slug AS v FROM events UNION ALL SELECT slug FROM calendars UNION ALL SELECT handle FROM accounts
  `);
  return new Set(rows.map((r) => r.v as string));
}

export { isReservedPath };
