import { Hono } from 'hono';
import type { Context } from 'hono';
import { query, tx, type Client, type Runner } from './db.js';
import { log } from './log.js';
import {
  accountFromToken,
  hashPassword,
  issueToken,
  verifyPassword,
  type Account,
} from './auth.js';
import {
  CATEGORIES,
  deriveFreeSlug,
  namespaceRefusal,
  resolveSlug,
} from './namespace.js';
import { sendMail, type MailContext, type Transition } from './mail.js';
import {
  confirmedCount,
  fillFreedSeats,
  findRegistration,
  issueTicketCode,
  lockEvent,
  lowestFreeSeat,
  nextWaitlistPosition,
  promoteHeadOfWaitlist,
  registerForEvent,
  renumberWaitlist,
  type EventRow,
  type RegistrationRow,
} from './registrations.js';
import { eventDetail, eventSummary, iso, registrationView } from './serialize.js';
import { themeHexFromSeed } from './theme.js';
import {
  isValidTimeZone,
  optionalInstant,
  parseBool,
  parseCapacity,
  parseInstant,
  Refusal,
  refuse,
  requireEmail,
  requirePassword,
  requireString,
  provided,
  str,
} from './validate.js';

type Vars = { account?: Account; tokenExpired?: boolean };

export const api = new Hono<{ Variables: Vars }>();

const PUBLIC_URL = () => process.env.APP_PUBLIC_URL || 'http://localhost:4173';

const NOT_FOUND_BODY = {
  message: 'Looks like you discovered a page that doesn\u2019t exist or you don\u2019t have access to.',
};

function fail(c: Context, err: unknown) {
  if (err instanceof Refusal) {
    return c.json(
      { message: err.message, ...(err.field ? { field: err.field } : {}), ...(err.extra || {}) },
      err.status as any
    );
  }
  log.error('unhandled_route_error', {
    message: (err as any)?.message,
    stack: (err as any)?.stack?.split('\n').slice(0, 4).join(' | '),
  });
  return c.json({ message: 'Something went wrong on our side. Please try again.' }, 500);
}

/* ------------------------------------------------------------------ auth --- */

api.use('*', async (c, next) => {
  const header = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (m) {
    const { account, expired } = await accountFromToken(m[1]);
    if (account) c.set('account', account);
    if (expired) c.set('tokenExpired', true);
  }
  await next();
});

/** A request without a valid bearer token is denied, not served. */
function requireAccount(c: Context<{ Variables: Vars }>): Account {
  const account = c.get('account');
  if (!account) {
    throw refuse(401, c.get('tokenExpired') ? 'Your session has expired. Sign in again.' : 'Sign in to continue.');
  }
  return account;
}

function requireHost(c: Context<{ Variables: Vars }>): Account {
  const account = requireAccount(c);
  // A guest reaching a host-only surface meets the ordinary not-found response,
  // because wording that differed would confirm the record exists.
  if (account.role !== 'host') throw refuse(404, NOT_FOUND_BODY.message);
  return account;
}

/* ------------------------------------------------------------ rate limit --- */

/**
 * Registration and login accept at most 10 requests per minute per account.
 * A fixed window per identity; the limit is stated in the response body.
 */
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE || 10);
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw refuse(
      429,
      `Too many attempts. This endpoint accepts at most ${RATE_LIMIT} requests per minute per account. Try again in ${retryAfter} seconds.`,
      undefined,
      { limit: RATE_LIMIT, window_seconds: 60, retry_after_seconds: retryAfter }
    );
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}, 120_000).unref?.();

async function readJson(c: Context): Promise<any> {
  try {
    const body = await c.req.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

/* ---------------------------------------------------------------- health --- */

api.get('/health', async (c) => {
  try {
    await query('SELECT 1');
    return c.json({ status: 'ok', time: new Date().toISOString() });
  } catch (err: any) {
    return c.json({ status: 'degraded', message: err?.message }, 503);
  }
});

/* ------------------------------------------------------------------ auth --- */

api.post('/auth/signup', async (c) => {
  try {
    const body = await readJson(c);
    const email = requireEmail(body);
    const password = requirePassword(body);
    const name = requireString(body, 'name', { max: 120, label: 'Name' });
    rateLimit(`signup:${email}`);

    const existing = await query('SELECT 1 FROM accounts WHERE email = $1', [email]);
    if (existing.rowCount) throw refuse(409, 'An account with that email already exists. Sign in instead.', 'email');

    // Signup is open and always creates a guest.
    const base =
      name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'guest';
    let handle = base;
    for (let i = 0; i < 500; i++) {
      if (!(await namespaceRefusal(handle, 'handle'))) break;
      handle = `${base}-${i + 2}`;
    }

    const created = await query<Account>(
      `INSERT INTO accounts (email, password_hash, display_name, handle, role)
       VALUES ($1,$2,$3,$4,'guest')
       RETURNING id::text, email, display_name, handle, role`,
      [email, hashPassword(password), name, handle]
    );
    const account = created.rows[0];
    const { token, expires_in } = issueToken(account.id);
    log.info('account_created', { account_id: account.id, email });
    return c.json({ ...account, access_token: token, token_type: 'bearer', expires_in }, 201);
  } catch (err) {
    return fail(c, err);
  }
});

api.post('/auth/login', async (c) => {
  try {
    const body = await readJson(c);
    const email = str(body?.email).toLowerCase();
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email) throw refuse(400, 'Enter a valid email address.', 'email');
    if (!password) throw refuse(400, 'Enter your password.', 'password');
    rateLimit(`login:${email}`);

    const res = await query<Account & { password_hash: string }>(
      'SELECT id::text, email, display_name, handle, role, password_hash FROM accounts WHERE email = $1',
      [email]
    );
    const row = res.rows[0];
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw refuse(401, 'That email and password do not match an account. Check them and try again.');
    }
    const { token, expires_in } = issueToken(row.id);
    log.info('login_ok', { account_id: row.id });
    return c.json({
      access_token: token,
      token_type: 'bearer',
      expires_in,
      account: {
        id: row.id,
        email: row.email,
        display_name: row.display_name,
        handle: row.handle,
        role: row.role,
      },
    });
  } catch (err) {
    return fail(c, err);
  }
});

/* -------------------------------------------------------------- accounts --- */

api.get('/accounts/me', async (c) => {
  try {
    const account = requireAccount(c);
    return c.json(account);
  } catch (err) {
    return fail(c, err);
  }
});

/** Edits the caller alone and carries no account identifier. */
api.patch('/accounts/me', async (c) => {
  try {
    const account = requireAccount(c);
    const body = await readJson(c);
    const updates: string[] = [];
    const params: any[] = [account.id];

    if (body.display_name !== undefined) {
      const name = requireString(body, 'display_name', { max: 120, label: 'Display name' });
      params.push(name);
      updates.push(`display_name = $${params.length}`);
    }
    if (body.handle !== undefined) {
      const handle = str(body.handle).toLowerCase();
      const refusal = await namespaceRefusal(handle, 'handle', { excludeAccountId: account.id });
      // The account keeps the handle it had when a change is refused.
      if (refusal) throw refuse(409, refusal, 'handle');
      params.push(handle);
      updates.push(`handle = $${params.length}`);
    }
    if (!updates.length) return c.json(account);

    const res = await query<Account>(
      `UPDATE accounts SET ${updates.join(', ')} WHERE id = $1
       RETURNING id::text, email, display_name, handle, role`,
      params
    );
    return c.json(res.rows[0]);
  } catch (err) {
    return fail(c, err);
  }
});

/* --------------------------------------------------------------- resolve --- */

api.get('/resolve/:slug', async (c) => {
  try {
    const found = await resolveSlug(c.req.param('slug'));
    if (!found) return c.json(NOT_FOUND_BODY, 404);
    return c.json(found);
  } catch (err) {
    return fail(c, err);
  }
});

api.get('/categories', async (c) => {
  try {
    const res = await query<{ category: string; events: string; calendars: string }>(
      `SELECT cat AS category,
              (SELECT count(*) FROM events e
                WHERE e.category = cat AND e.state IN ('published','registration_closed'))::text AS events,
              (SELECT count(*) FROM calendars cl WHERE cl.category = cat)::text AS calendars
         FROM unnest($1::text[]) AS cat`,
      [CATEGORIES]
    );
    return c.json(
      res.rows.map((r) => ({
        slug: r.category,
        event_count: Number(r.events),
        calendar_count: Number(r.calendars),
      }))
    );
  } catch (err) {
    return fail(c, err);
  }
});

/* ---------------------------------------------------------------- events --- */

const EVENT_SELECT = `
  SELECT e.id::text, e.calendar_id::text, e.title, e.slug, e.category, e.city, e.time_zone,
         e.cover_seed, e.theme_hex, e.description, e.location, e.starts_at, e.ends_at,
         e.capacity, e.approval_required, e.waitlist_enabled, e.state, e.published_at,
         e.cancelled_at, e.cancel_reason, e.created_at, e.updated_at,
         cal.owner_account_id::text AS owner_account_id, cal.name AS calendar_name,
         cal.slug AS calendar_slug, cal.is_public AS calendar_is_public,
         (SELECT count(*) FROM registrations r
           WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in'))::int AS confirmed_count
    FROM events e JOIN calendars cal ON cal.id = e.calendar_id`;

async function loadEvent(slug: string, runner: Runner = { query }) {
  const res = await runner.query(`${EVENT_SELECT} WHERE e.slug = $1`, [slug]);
  return (res.rowCount ? res.rows[0] : null) as (EventRow & { confirmed_count: number }) | null;
}

/**
 * The list carries the events open to discovery: published and
 * registration_closed. A draft and a cancelled event never appear, whatever
 * the filters say.
 */
api.get('/events', async (c) => {
  try {
    const url = new URL(c.req.url);
    const category = str(url.searchParams.get('category'));
    const city = str(url.searchParams.get('city'));
    const qRaw = url.searchParams.get('q');
    const q = str(qRaw); // a q of only whitespace is treated as absent

    let limit = Number(url.searchParams.get('limit') ?? 20);
    if (!Number.isFinite(limit) || limit <= 0) limit = 20;
    limit = Math.min(Math.floor(limit), 100);
    let offset = Number(url.searchParams.get('offset') ?? 0);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;
    offset = Math.floor(offset);

    const where: string[] = [`e.state IN ('published','registration_closed')`];
    const params: any[] = [];

    if (category) {
      params.push(category.toLowerCase());
      where.push(`e.category = $${params.length}`);
    }
    if (city) {
      params.push(city);
      where.push(`e.city ILIKE $${params.length}`);
    }
    // q narrows what category and city already selected rather than widening it.
    if (q) {
      params.push(`%${q.replace(/[%_\\]/g, (ch) => '\\' + ch)}%`);
      const p = `$${params.length}`;
      where.push(
        `(e.title ILIKE ${p} ESCAPE '\\' OR e.description ILIKE ${p} ESCAPE '\\' OR cal.name ILIKE ${p} ESCAPE '\\')`
      );
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const totalRes = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM events e JOIN calendars cal ON cal.id = e.calendar_id ${whereSql}`,
      params
    );
    const total = Number(totalRes.rows[0].n);

    params.push(limit, offset);
    // Ranking is fixed: soonest starts_at first, ties broken by slug ascending.
    const rows = await query(
      `${EVENT_SELECT} ${whereSql}
        ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    c.header('X-Total-Count', String(total));
    c.header('Access-Control-Expose-Headers', 'X-Total-Count');
    return c.json(rows.rows.map((e: any) => eventSummary(e)));
  } catch (err) {
    return fail(c, err);
  }
});

/** A draft event returns, to everyone but its host, the not-found response. */
api.get('/events/:slug', async (c) => {
  try {
    const account = c.get('account');
    const event = await loadEvent(c.req.param('slug'));
    if (!event) return c.json(NOT_FOUND_BODY, 404);
    const isOwner = !!account && String(event.owner_account_id) === account.id;
    if (event.state === 'draft' && !isOwner) return c.json(NOT_FOUND_BODY, 404);

    let mine: any = null;
    if (account) {
      const r = await query<RegistrationRow>(
        `SELECT id::text, event_id::text, account_id::text, status, seat_no, waitlist_position,
                ticket_code, checked_in_at, created_at, updated_at
           FROM registrations WHERE event_id = $1 AND account_id = $2`,
        [event.id, account.id]
      );
      if (r.rowCount) mine = registrationView(r.rows[0]);
    }
    return c.json(eventDetail(event, { is_owner: isOwner, my_registration: mine }));
  } catch (err) {
    return fail(c, err);
  }
});

async function ownedEvent(c: Context<{ Variables: Vars }>, slug: string) {
  const account = requireHost(c);
  const event = await loadEvent(slug);
  // Scope is by ownership of the calendar, not by role.
  if (!event || String(event.owner_account_id) !== account.id) throw refuse(404, NOT_FOUND_BODY.message);
  return { account, event };
}

api.post('/events', async (c) => {
  try {
    const account = requireHost(c);
    const body = await readJson(c);
    const calendarSlug = requireString(body, 'calendar_slug', { label: 'Calendar' });
    const cal = await query<{ id: string; category: string; city: string }>(
      'SELECT id::text, category, city FROM calendars WHERE slug = $1 AND owner_account_id = $2',
      [calendarSlug, account.id]
    );
    if (!cal.rowCount) throw refuse(404, NOT_FOUND_BODY.message);

    const title = requireString(body, 'title', { max: 200, label: 'Title' });
    const category = str(body.category).toLowerCase() || cal.rows[0].category;
    const city = str(body.city);
    const timeZone = str(body.time_zone) || 'UTC';
    if (!isValidTimeZone(timeZone)) throw refuse(400, 'That is not a known time zone name.', 'time_zone');

    const startsAt = optionalInstant(body.starts_at, 'starts_at');
    const endsAt = optionalInstant(body.ends_at, 'ends_at');
    const description = str(body.description).slice(0, 8000);
    const location = str(body.location).slice(0, 400);

    let capacity: number | null = null;
    if (provided(body.capacity)) {
      capacity = parseCapacity(body.capacity);
    }

    if (category && !CATEGORIES.includes(category)) throw refuse(400, 'Choose one of the twelve categories.', 'category');
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      throw refuse(400, 'The end time comes after the start time.', 'ends_at');
    }

    let slug: string;
    if (provided(body.slug)) {
      slug = str(body.slug).toLowerCase();
      const refusal = await namespaceRefusal(slug, 'event');
      if (refusal) throw refuse(409, refusal, 'slug');
    } else {
      slug = await deriveFreeSlug(title);
    }

    // Publishing needs a title, category, city, starts_at, ends_at after it, and
    // a capacity from 1 to 500; a submission missing any is stored as a draft.
    const complete =
      !!title && !!category && !!city && !!startsAt && !!endsAt && capacity !== null &&
      new Date(endsAt) > new Date(startsAt);
    const wantsDraft = str(body.state).toLowerCase() === 'draft';
    const state = complete && !wantsDraft ? 'published' : 'draft';

    const coverSeed = str(body.cover_seed) || `${slug}-${Date.now().toString(36)}`;
    const themeHex = /^#[0-9a-fA-F]{6}$/.test(str(body.theme_hex))
      ? str(body.theme_hex).toLowerCase()
      : themeHexFromSeed(coverSeed);

    const created = await query(
      `INSERT INTO events
         (calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex, description,
          location, starts_at, ends_at, capacity, approval_required, waitlist_enabled, state, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               CASE WHEN $16 = 'published' THEN now() ELSE NULL END)
       RETURNING id::text, slug`,
      [
        cal.rows[0].id,
        title,
        slug,
        category,
        city,
        timeZone,
        coverSeed,
        themeHex,
        description,
        location,
        startsAt,
        endsAt,
        capacity,
        parseBool(body.approval_required, false),
        parseBool(body.waitlist_enabled, true),
        state,
      ]
    );
    const event = await loadEvent(created.rows[0].slug);
    log.info('event_created', { slug: created.rows[0].slug, state });
    return c.json(eventDetail(event!, { is_owner: true }), 201);
  } catch (err) {
    return fail(c, err);
  }
});

api.patch('/events/:slug', async (c) => {
  try {
    const { event } = await ownedEvent(c, c.req.param('slug'));
    const body = await readJson(c);

    // A cancellation is the one edit that cannot be undone.
    if (event.state === 'cancelled') {
      throw refuse(409, 'This event has been cancelled and cannot be changed.', 'state');
    }

    const sets: string[] = [];
    const params: any[] = [event.id];
    const push = (sql: string, value: any) => {
      params.push(value);
      sets.push(`${sql} = $${params.length}`);
    };

    if (body.title !== undefined) push('title', requireString(body, 'title', { max: 200, label: 'Title' }));
    if (body.description !== undefined) push('description', str(body.description).slice(0, 8000));
    if (body.location !== undefined) push('location', str(body.location).slice(0, 400));
    if (body.city !== undefined) push('city', str(body.city));
    if (body.category !== undefined) {
      const category = str(body.category).toLowerCase();
      if (!CATEGORIES.includes(category)) throw refuse(400, 'Choose one of the twelve categories.', 'category');
      push('category', category);
    }
    if (body.time_zone !== undefined) {
      const tz = str(body.time_zone);
      if (!isValidTimeZone(tz)) throw refuse(400, 'That is not a known time zone name.', 'time_zone');
      push('time_zone', tz);
    }
    if (body.approval_required !== undefined) push('approval_required', parseBool(body.approval_required));
    if (body.waitlist_enabled !== undefined) push('waitlist_enabled', parseBool(body.waitlist_enabled));

    const startsAt = body.starts_at !== undefined ? parseInstant(body.starts_at, 'starts_at') : null;
    const endsAt = body.ends_at !== undefined ? parseInstant(body.ends_at, 'ends_at') : null;
    const nextStart = startsAt ?? event.starts_at;
    const nextEnd = endsAt ?? event.ends_at;
    if (nextStart && nextEnd && new Date(nextEnd) <= new Date(nextStart)) {
      throw refuse(400, 'The end time comes after the start time.', 'ends_at');
    }
    if (startsAt) push('starts_at', startsAt);
    if (endsAt) push('ends_at', endsAt);

    let nextCapacity: number | null = null;
    if (provided(body.capacity)) {
      nextCapacity = parseCapacity(body.capacity);
      const seated = Number(event.confirmed_count);
      // Lowering capacity below the current confirmed count is rejected.
      if (nextCapacity < seated) {
        throw refuse(409, `You already have ${seated} guests confirmed.`, 'capacity', {
          confirmed_count: seated,
        });
      }
      push('capacity', nextCapacity);
    }

    let nextState: string | null = null;
    if (body.state !== undefined) {
      const wanted = str(body.state).toLowerCase();
      const from = event.state;
      const allowed =
        (from === 'draft' && wanted === 'published') ||
        (from === 'published' && wanted === 'registration_closed') ||
        (from === 'registration_closed' && wanted === 'published') ||
        wanted === from;
      if (!allowed) {
        if (wanted === 'cancelled') {
          throw refuse(400, 'Call the event off with a reason instead.', 'state');
        }
        // Republishing a cancelled event, or returning a published one to
        // draft, is rejected. registration_closed is reachable from published
        // alone, never from draft and never from cancelled.
        throw refuse(409, `An event in ${from} cannot move to ${wanted}.`, 'state');
      }
      if (wanted !== from) {
        if (wanted === 'published' && from === 'draft') {
          const title = body.title !== undefined ? str(body.title) : event.title;
          const city = body.city !== undefined ? str(body.city) : event.city;
          const cap = nextCapacity ?? event.capacity;
          if (!title || !city || !nextStart || !nextEnd || cap === null) {
            throw refuse(
              400,
              'Publishing needs a title, a category, a city, a start, an end after it, and a capacity.',
              'state'
            );
          }
        }
        nextState = wanted;
        push('state', wanted);
        if (wanted === 'published' && !event.published_at) sets.push('published_at = now()');
      }
    }

    if (!sets.length) return c.json(eventDetail(event, { is_owner: true }));
    sets.push('updated_at = now()');

    const timesOrPlaceChanged =
      (startsAt && startsAt !== iso(event.starts_at)) ||
      (endsAt && endsAt !== iso(event.ends_at)) ||
      (body.location !== undefined && str(body.location) !== event.location);

    const outcome = await tx(async (client) => {
      await lockEvent(client, event.id);
      await client.query(`UPDATE events SET ${sets.join(', ')} WHERE id = $1`, params);
      const fresh = (await loadEvent(event.slug, client))!;

      // Raising capacity fills the seats that just appeared, in the same request.
      let promoted: Array<{ row: RegistrationRow; email: string; display_name: string }> = [];
      if (nextCapacity !== null && event.capacity !== null && nextCapacity > event.capacity) {
        promoted = await fillFreedSeats(client, fresh);
      }

      // Changing the times or the location of an event that already has
      // confirmed guests is allowed and every one of those guests is mailed.
      let notifyGuests: Array<{ id: string; email: string; display_name: string; ticket_code: string | null }> = [];
      if (timesOrPlaceChanged) {
        const res = await client.query(
          `SELECT r.id::text, a.email, a.display_name, r.ticket_code
             FROM registrations r JOIN accounts a ON a.id = r.account_id
            WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in')`,
          [event.id]
        );
        notifyGuests = res.rows as any;
      }
      return { fresh, promoted, notifyGuests };
    });

    const ctxBase = {
      title: outcome.fresh.title,
      eventSlug: outcome.fresh.slug,
      startsAt: iso(outcome.fresh.starts_at),
      timeZone: outcome.fresh.time_zone,
      location: outcome.fresh.location,
      publicUrl: PUBLIC_URL(),
    };

    for (const p of outcome.promoted) {
      await sendMail({
        to: p.email,
        transition: 'promoted',
        registrationId: p.row.id,
        eventId: outcome.fresh.id,
        ctx: { ...ctxBase, displayName: p.display_name, ticketCode: p.row.ticket_code } as MailContext,
      });
    }
    for (const g of outcome.notifyGuests) {
      await sendMail({
        to: g.email,
        transition: 'event_updated',
        registrationId: g.id,
        eventId: outcome.fresh.id,
        ctx: { ...ctxBase, displayName: g.display_name, ticketCode: g.ticket_code } as MailContext,
      });
    }

    log.info('event_updated', {
      slug: outcome.fresh.slug,
      state: nextState || outcome.fresh.state,
      promoted: outcome.promoted.length,
    });
    return c.json(
      eventDetail(outcome.fresh, {
        is_owner: true,
        promoted_count: outcome.promoted.length,
      })
    );
  } catch (err) {
    return fail(c, err);
  }
});

api.post('/events/:slug/cancel', async (c) => {
  try {
    const { event } = await ownedEvent(c, c.req.param('slug'));
    const body = await readJson(c);
    const reason = str(body.reason ?? body.cancel_reason);
    // Cancelling needs a non-empty cancel_reason.
    if (!reason) throw refuse(400, 'Give the guests a reason before you call this off.', 'reason');
    if (event.state === 'cancelled') throw refuse(409, 'This event has already been cancelled.', 'state');

    const outcome = await tx(async (client) => {
      await lockEvent(client, event.id);
      await client.query(
        `UPDATE events SET state = 'cancelled', cancelled_at = now(), cancel_reason = $2, updated_at = now()
          WHERE id = $1`,
        [event.id, reason]
      );
      // Every guest still holding a place.
      const holders = await client.query(
        `SELECT r.id::text, a.email, a.display_name
           FROM registrations r JOIN accounts a ON a.id = r.account_id
          WHERE r.event_id = $1
            AND r.status IN ('confirmed','checked_in','waitlisted','pending_approval')`,
        [event.id]
      );
      const fresh = (await loadEvent(event.slug, client))!;
      return { fresh, holders: holders.rows as any[] };
    });

    for (const h of outcome.holders) {
      await sendMail({
        to: h.email,
        transition: 'event_cancelled',
        registrationId: h.id,
        eventId: outcome.fresh.id,
        ctx: {
          title: outcome.fresh.title,
          eventSlug: outcome.fresh.slug,
          displayName: h.display_name,
          startsAt: iso(outcome.fresh.starts_at),
          timeZone: outcome.fresh.time_zone,
          location: outcome.fresh.location,
          cancelReason: reason, // carried word for word
          publicUrl: PUBLIC_URL(),
        },
      });
    }

    log.info('event_cancelled', { slug: outcome.fresh.slug, notified: outcome.holders.length });
    return c.json(eventDetail(outcome.fresh, { is_owner: true, notified_count: outcome.holders.length }));
  } catch (err) {
    return fail(c, err);
  }
});

/* --------------------------------------------------------- registrations --- */

async function guestList(eventId: string) {
  const res = await query(
    `SELECT r.id::text, r.account_id::text, a.email, a.display_name, r.status,
            r.waitlist_position, r.ticket_code, r.checked_in_at, r.created_at
       FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1
      ORDER BY r.status ASC, r.waitlist_position ASC NULLS LAST, a.email ASC`,
    [eventId]
  );
  return res.rows;
}

api.get('/events/:slug/registrations', async (c) => {
  try {
    const { event } = await ownedEvent(c, c.req.param('slug'));
    const rows = await guestList(event.id);
    return c.json(
      rows.map((r: any) => ({
        id: r.id,
        account_id: r.account_id,
        email: r.email,
        display_name: r.display_name,
        status: r.status,
        waitlist_position: r.waitlist_position,
        ticket_code: r.ticket_code,
        checked_in_at: iso(r.checked_in_at),
      }))
    );
  } catch (err) {
    return fail(c, err);
  }
});

/** A value carrying a comma or a quotation mark is wrapped, inner quotes doubled. */
function csvCell(value: unknown) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

api.get('/events/:slug/registrations.csv', async (c) => {
  try {
    const { event } = await ownedEvent(c, c.req.param('slug'));
    const rows = await guestList(event.id);
    const lines = ['email,display_name,status,waitlist_position,ticket_code'];
    for (const r of rows as any[]) {
      lines.push(
        [r.email, r.display_name, r.status, r.waitlist_position ?? '', r.ticket_code ?? '']
          .map(csvCell)
          .join(',')
      );
    }
    return new Response(lines.join('\n') + '\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${event.slug}.csv"`,
      },
    });
  } catch (err) {
    return fail(c, err);
  }
});

api.get('/registrations/me', async (c) => {
  try {
    const account = requireAccount(c);
    const res = await query(
      `SELECT r.id::text, r.event_id::text, r.account_id::text, r.status, r.seat_no,
              r.waitlist_position, r.ticket_code, r.checked_in_at, r.created_at, r.updated_at,
              e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city,
              e.theme_hex, e.cover_seed, e.state AS event_state, e.location
         FROM registrations r JOIN events e ON e.id = r.event_id
        WHERE r.account_id = $1
        ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC`,
      [account.id]
    );
    return c.json(
      res.rows.map((r: any) =>
        registrationView(r, {
          event: {
            slug: r.event_slug,
            title: r.title,
            starts_at: iso(r.starts_at),
            ends_at: iso(r.ends_at),
            time_zone: r.time_zone,
            city: r.city,
            location: r.location,
            theme_hex: r.theme_hex,
            cover_seed: r.cover_seed,
            state: r.event_state,
            has_ended: r.ends_at ? new Date(r.ends_at).getTime() < Date.now() : false,
          },
        })
      )
    );
  } catch (err) {
    return fail(c, err);
  }
});

api.post('/registrations', async (c) => {
  try {
    const account = requireAccount(c);
    const body = await readJson(c);
    const slug = requireString(body, 'event_slug', { label: 'Event' });
    rateLimit(`register:${account.id}`);

    const event = await loadEvent(slug);
    if (!event) return c.json(NOT_FOUND_BODY, 404);
    if (event.state === 'draft') return c.json(NOT_FOUND_BODY, 404);
    if (event.state === 'cancelled') {
      throw refuse(409, 'This event has been cancelled, so registration is not open.');
    }
    // An event in registration_closed accepts no new registration.
    if (event.state === 'registration_closed') {
      throw refuse(409, 'Registration is closed. The host has stopped taking registrations for this event.');
    }

    const outcome = await tx(async (client) => {
      const fresh = (await loadEvent(event.slug, client))!;
      if (fresh.state !== 'published') {
        throw refuse(409, 'Registration is closed. The host has stopped taking registrations for this event.');
      }
      return registerForEvent(client, fresh, account.id);
    });

    if (outcome.transition) {
      await sendMail({
        to: account.email,
        transition: outcome.transition,
        registrationId: outcome.row.id,
        eventId: event.id,
        ctx: {
          title: event.title,
          eventSlug: event.slug,
          displayName: account.display_name,
          ticketCode: outcome.row.ticket_code,
          waitlistPosition: outcome.row.waitlist_position,
          startsAt: iso(event.starts_at),
          timeZone: event.time_zone,
          location: event.location,
          publicUrl: PUBLIC_URL(),
        },
      });
    }

    log.info('registration_written', {
      event: event.slug,
      account_id: account.id,
      status: outcome.row.status,
    });
    return c.json(
      registrationView(outcome.row, { event_slug: event.slug, title: event.title }),
      outcome.transition ? 201 : 200
    );
  } catch (err) {
    return fail(c, err);
  }
});

/** Cancelling a confirmed registration frees the seat in that same request. */
api.post('/registrations/:id/cancel', async (c) => {
  try {
    const account = requireAccount(c);
    const id = c.req.param('id');

    const outcome = await tx(async (client) => {
      const owned = await client.query(
        `SELECT r.id::text, r.event_id::text, r.status, e.slug
           FROM registrations r JOIN events e ON e.id = r.event_id
          WHERE r.id = $1 AND r.account_id = $2`,
        [id, account.id]
      );
      if (!owned.rowCount) throw refuse(404, NOT_FOUND_BODY.message);
      const eventSlug = owned.rows[0].slug;
      const event = (await loadEvent(eventSlug, client))!;
      await lockEvent(client, event.id);

      const reg = await findRegistration(client, event.id, account.id);
      if (!reg) throw refuse(404, NOT_FOUND_BODY.message);
      if (['cancelled_by_guest', 'cancelled_by_host', 'declined'].includes(reg.status)) {
        return { row: reg, promoted: null, event };
      }
      const heldSeat = reg.seat_no !== null;

      const updated = await client.query<RegistrationRow>(
        `UPDATE registrations
            SET status = 'cancelled_by_guest', seat_no = NULL, waitlist_position = NULL,
                ticket_code = NULL, checked_in_at = NULL, updated_at = now()
          WHERE id = $1
          RETURNING id::text, event_id::text, account_id::text, status, seat_no,
                    waitlist_position, ticket_code, checked_in_at, created_at, updated_at`,
        [reg.id]
      );
      await renumberWaitlist(client, event.id);

      // A seat freed while registration is closed promotes nobody.
      let promoted = null;
      if (heldSeat && event.state === 'published') {
        promoted = await promoteHeadOfWaitlist(client, event);
      }
      return { row: updated.rows[0], promoted, event };
    });

    // A guest cancelling their own registration sends no mail.
    if (outcome.promoted) {
      await sendMail({
        to: outcome.promoted.email,
        transition: 'promoted',
        registrationId: outcome.promoted.row.id,
        eventId: outcome.event.id,
        ctx: {
          title: outcome.event.title,
          eventSlug: outcome.event.slug,
          displayName: outcome.promoted.display_name,
          ticketCode: outcome.promoted.row.ticket_code,
          startsAt: iso(outcome.event.starts_at),
          timeZone: outcome.event.time_zone,
          location: outcome.event.location,
          publicUrl: PUBLIC_URL(),
        },
      });
    }

    log.info('registration_cancelled', {
      registration_id: outcome.row.id,
      promoted: outcome.promoted ? outcome.promoted.row.id : null,
    });
    return c.json(registrationView(outcome.row, { promoted_registration_id: outcome.promoted?.row.id ?? null }));
  } catch (err) {
    return fail(c, err);
  }
});

async function hostOwnedRegistration(c: Context<{ Variables: Vars }>, id: string, client?: Client) {
  const account = requireHost(c);
  const runner: Runner = client ?? { query };
  const res = await runner.query(
    `SELECT r.id::text, r.event_id::text, r.account_id::text, r.status, r.seat_no,
            r.waitlist_position, r.ticket_code, r.checked_in_at, r.created_at, r.updated_at,
            e.slug AS event_slug, cal.owner_account_id::text AS owner_account_id,
            a.email, a.display_name
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       JOIN calendars cal ON cal.id = e.calendar_id
       JOIN accounts a ON a.id = r.account_id
      WHERE r.id = $1`,
    [id]
  );
  if (!res.rowCount || String(res.rows[0].owner_account_id) !== account.id) {
    throw refuse(404, NOT_FOUND_BODY.message);
  }
  return res.rows[0] as any;
}

/** The host approves a pending request to confirmed, or waitlisted when full. */
api.post('/registrations/:id/approve', async (c) => {
  try {
    await hostOwnedRegistration(c, c.req.param('id'));
    const id = c.req.param('id');

    const outcome = await tx(async (client) => {
      const reg = await hostOwnedRegistration(c, id, client);
      const event = (await loadEvent(reg.event_slug, client))!;
      await lockEvent(client, event.id);

      const current = await findRegistration(client, event.id, reg.account_id);
      if (!current) throw refuse(404, NOT_FOUND_BODY.message);
      if (current.status !== 'pending_approval') {
        throw refuse(409, 'That request is no longer awaiting a decision.');
      }

      const capacity = event.capacity ?? 0;
      const seat = capacity > 0 ? await lowestFreeSeat(client, event.id, capacity) : null;

      if (seat !== null) {
        const ticket = await issueTicketCode(client);
        const updated = await client.query<RegistrationRow>(
          `UPDATE registrations
              SET status = 'confirmed', seat_no = $2, waitlist_position = NULL,
                  ticket_code = $3, updated_at = now()
            WHERE id = $1
            RETURNING id::text, event_id::text, account_id::text, status, seat_no,
                      waitlist_position, ticket_code, checked_in_at, created_at, updated_at`,
          [current.id, seat, ticket]
        );
        return { row: updated.rows[0], transition: 'approved' as Transition, reg, event, waitlisted: false };
      }

      if (!event.waitlist_enabled) {
        throw refuse(409, 'This event is full and the waiting list is closed.');
      }
      // Approving a request into a full event moves that row to the waiting list.
      const position = await nextWaitlistPosition(client, event.id);
      const updated = await client.query<RegistrationRow>(
        `UPDATE registrations
            SET status = 'waitlisted', seat_no = NULL, waitlist_position = $2,
                ticket_code = NULL, updated_at = now()
          WHERE id = $1
          RETURNING id::text, event_id::text, account_id::text, status, seat_no,
                    waitlist_position, ticket_code, checked_in_at, created_at, updated_at`,
        [current.id, position]
      );
      return { row: updated.rows[0], transition: 'waitlisted' as Transition, reg, event, waitlisted: true };
    });

    await sendMail({
      to: outcome.reg.email,
      transition: outcome.transition,
      registrationId: outcome.row.id,
      eventId: outcome.event.id,
      ctx: {
        title: outcome.event.title,
        eventSlug: outcome.event.slug,
        displayName: outcome.reg.display_name,
        ticketCode: outcome.row.ticket_code,
        waitlistPosition: outcome.row.waitlist_position,
        startsAt: iso(outcome.event.starts_at),
        timeZone: outcome.event.time_zone,
        location: outcome.event.location,
        publicUrl: PUBLIC_URL(),
      },
    });

    return c.json(registrationView(outcome.row, { moved_to_waitlist: outcome.waitlisted }));
  } catch (err) {
    return fail(c, err);
  }
});

api.post('/registrations/:id/decline', async (c) => {
  try {
    const id = c.req.param('id');
    await hostOwnedRegistration(c, id);

    const outcome = await tx(async (client) => {
      const reg = await hostOwnedRegistration(c, id, client);
      const event = (await loadEvent(reg.event_slug, client))!;
      await lockEvent(client, event.id);
      const current = await findRegistration(client, event.id, reg.account_id);
      if (!current) throw refuse(404, NOT_FOUND_BODY.message);
      if (current.status !== 'pending_approval') {
        throw refuse(409, 'That request is no longer awaiting a decision.');
      }
      const updated = await client.query<RegistrationRow>(
        `UPDATE registrations
            SET status = 'declined', seat_no = NULL, waitlist_position = NULL,
                ticket_code = NULL, updated_at = now()
          WHERE id = $1
          RETURNING id::text, event_id::text, account_id::text, status, seat_no,
                    waitlist_position, ticket_code, checked_in_at, created_at, updated_at`,
        [current.id]
      );
      return { row: updated.rows[0], reg, event };
    });

    await sendMail({
      to: outcome.reg.email,
      transition: 'declined',
      registrationId: outcome.row.id,
      eventId: outcome.event.id,
      ctx: {
        title: outcome.event.title,
        eventSlug: outcome.event.slug,
        displayName: outcome.reg.display_name,
        startsAt: iso(outcome.event.starts_at),
        timeZone: outcome.event.time_zone,
        location: outcome.event.location,
        publicUrl: PUBLIC_URL(),
      },
    });

    return c.json(registrationView(outcome.row));
  } catch (err) {
    return fail(c, err);
  }
});

/* --------------------------------------------------------------- tickets --- */

/** Anyone presenting a real code, signed in or not. The code is the credential. */
api.get('/tickets/:code', async (c) => {
  try {
    const code = c.req.param('code');
    const res = await query(
      `SELECT r.id::text, r.status, r.ticket_code, r.checked_in_at, r.waitlist_position,
              e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city,
              e.location, e.theme_hex, e.cover_seed, e.state AS event_state
         FROM registrations r JOIN events e ON e.id = r.event_id
        WHERE r.ticket_code = $1`,
      [code]
    );
    if (!res.rowCount) return c.json(NOT_FOUND_BODY, 404);
    const r: any = res.rows[0];
    // It carries the ticket, never the guest list and never another guest.
    return c.json({
      id: r.id,
      status: r.status,
      ticket_code: r.ticket_code,
      checked_in_at: iso(r.checked_in_at),
      event_slug: r.event_slug,
      title: r.title,
      starts_at: iso(r.starts_at),
      ends_at: iso(r.ends_at),
      time_zone: r.time_zone,
      city: r.city,
      location: r.location,
      theme_hex: r.theme_hex,
      cover_seed: r.cover_seed,
      event_state: r.event_state,
    });
  } catch (err) {
    return fail(c, err);
  }
});

/** The owning host checks a ticket in. A second check-in records one arrival. */
api.post('/tickets/:code/check-in', async (c) => {
  try {
    const account = requireHost(c);
    const code = c.req.param('code');

    const outcome = await tx(async (client) => {
      const res = await client.query(
        `SELECT r.id::text, r.status, r.checked_in_at, r.seat_no, r.ticket_code,
                e.slug AS event_slug, e.title, cal.owner_account_id::text AS owner_account_id
           FROM registrations r
           JOIN events e ON e.id = r.event_id
           JOIN calendars cal ON cal.id = e.calendar_id
          WHERE r.ticket_code = $1 FOR UPDATE OF r`,
        [code]
      );
      if (!res.rowCount || String(res.rows[0].owner_account_id) !== account.id) {
        throw refuse(404, NOT_FOUND_BODY.message);
      }
      const reg: any = res.rows[0];

      if (reg.status === 'checked_in') {
        // A code already checked in answers with the arrival time, not a second arrival.
        const already = await client.query<RegistrationRow>(
          `SELECT id::text, event_id::text, account_id::text, status, seat_no, waitlist_position,
                  ticket_code, checked_in_at, created_at, updated_at
             FROM registrations WHERE id = $1`,
          [reg.id]
        );
        return { row: already.rows[0], already: true, title: reg.title, slug: reg.event_slug };
      }
      if (reg.status !== 'confirmed') {
        throw refuse(409, 'That ticket does not hold a seat, so it cannot be checked in.');
      }

      const updated = await client.query<RegistrationRow>(
        `UPDATE registrations
            SET status = 'checked_in', checked_in_at = now(), updated_at = now()
          WHERE id = $1
          RETURNING id::text, event_id::text, account_id::text, status, seat_no,
                    waitlist_position, ticket_code, checked_in_at, created_at, updated_at`,
        [reg.id]
      );
      return { row: updated.rows[0], already: false, title: reg.title, slug: reg.event_slug };
    });

    log.info('ticket_checked_in', { code, already: outcome.already });
    return c.json(
      registrationView(outcome.row, {
        already_checked_in: outcome.already,
        title: outcome.title,
        event_slug: outcome.slug,
      })
    );
  } catch (err) {
    return fail(c, err);
  }
});

/* ------------------------------------------------------------- calendars --- */

api.get('/calendars', async (c) => {
  try {
    const account = requireAccount(c);
    const res = await query(
      `SELECT c.id::text, c.name, c.slug, c.category, c.city, c.is_public,
              c.owner_account_id::text, c.created_at,
              (SELECT count(*) FROM events e
                WHERE e.calendar_id = c.id AND e.state IN ('published','registration_closed'))::int AS published_count,
              (SELECT count(*) FROM events e WHERE e.calendar_id = c.id)::int AS event_count
         FROM calendars c WHERE c.owner_account_id = $1 ORDER BY c.created_at ASC`,
      [account.id]
    );
    return c.json(res.rows.map((r: any) => ({ ...r, created_at: iso(r.created_at) })));
  } catch (err) {
    return fail(c, err);
  }
});

api.get('/calendars/:slug', async (c) => {
  try {
    const account = c.get('account');
    const res = await query(
      `SELECT c.id::text, c.name, c.slug, c.category, c.city, c.is_public,
              c.owner_account_id::text, a.display_name AS owner_name, a.handle AS owner_handle
         FROM calendars c JOIN accounts a ON a.id = c.owner_account_id
        WHERE c.slug = $1`,
      [c.req.param('slug')]
    );
    if (!res.rowCount) return c.json(NOT_FOUND_BODY, 404);
    const cal: any = res.rows[0];
    const events = await query(
      `${EVENT_SELECT} WHERE cal.slug = $1 AND e.state IN ('published','registration_closed')
        ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC LIMIT 100`,
      [cal.slug]
    );
    return c.json({
      ...cal,
      is_owner: !!account && account.id === String(cal.owner_account_id),
      events: events.rows.map((e: any) => eventSummary(e)),
    });
  } catch (err) {
    return fail(c, err);
  }
});

api.post('/calendars', async (c) => {
  try {
    // A guest is refused calendar creation.
    const account = requireHost(c);
    const body = await readJson(c);
    const name = requireString(body, 'name', { max: 160, label: 'Name' });
    const slug = str(body.slug).toLowerCase();
    if (!slug) throw refuse(400, 'Give the calendar an address.', 'slug');
    const refusal = await namespaceRefusal(slug, 'calendar');
    if (refusal) throw refuse(409, refusal, 'slug');
    const category = str(body.category).toLowerCase();
    if (!CATEGORIES.includes(category)) throw refuse(400, 'Choose one of the twelve categories.', 'category');
    const city = requireString(body, 'city', { max: 120, label: 'City' });

    const res = await query(
      `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id::text, name, slug, category, city, is_public, owner_account_id::text, created_at`,
      [account.id, name, slug, category, city, parseBool(body.is_public, true)]
    );
    log.info('calendar_created', { slug, owner: account.id });
    return c.json({ ...res.rows[0], created_at: iso(res.rows[0].created_at) }, 201);
  } catch (err) {
    return fail(c, err);
  }
});

/* --------------------------------------------------------------- profile --- */

api.get('/accounts/:handle/profile', async (c) => {
  try {
    const res = await query(
      `SELECT a.id::text, a.display_name, a.handle, a.role FROM accounts a WHERE a.handle = $1`,
      [c.req.param('handle')]
    );
    if (!res.rowCount) return c.json(NOT_FOUND_BODY, 404);
    const acc: any = res.rows[0];
    const cals = await query(
      `SELECT c.name, c.slug, c.category, c.city, c.is_public
         FROM calendars c WHERE c.owner_account_id = $1 AND c.is_public = true
        ORDER BY c.created_at ASC`,
      [acc.id]
    );
    return c.json({ ...acc, calendars: cals.rows });
  } catch (err) {
    return fail(c, err);
  }
});

api.all('*', (c) => c.json(NOT_FOUND_BODY, 404));
