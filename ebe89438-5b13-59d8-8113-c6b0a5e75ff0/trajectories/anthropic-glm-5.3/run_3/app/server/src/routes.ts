import { Hono } from 'hono';
import { pool, withTx } from './db.ts';
import { ApiError, bad, forbidden, notFound, unauthorized } from './errors.ts';
import { accountById, createAccount, hashPassword, issueToken, parseToken, tokenExpired, verifyPassword, type Account } from './auth.ts';
import { config } from './config.ts';
import { CATEGORIES, RESERVED_PATHS } from './seed.ts';
import { limited, requireAuth, requireRole } from './middleware.ts';
import { rateLimit as rateLimitCheck } from './ratelimit.ts';
import { tooMany } from './errors.ts';
import { logger } from './log.ts';
import {
  applyCapacityChange, assertSlugAvailable, calendarOf, canSeeEvent, cancelEvent,
  confirmedCount, eventJson, getEventBySlug, publishReady, slugTaken, themeFromSeed,
} from './events.ts';
import { renumberWaitlist } from './registrations.ts';
import { mailBody, subject } from './registrations.ts';
import { sendAndLog } from './mail.ts';
import {
  approveRegistration, cancelRegistration, checkInTicket, declineRegistration,
  registerForEvent,
} from './regops.ts';
import {
  isEmail, isHandle, isSlug, needBool, needInt, needString, optBool, optCategory,
  optString, parseInstant, toZulu,
} from './validate.ts';

export const api = new Hono<{ Variables: { account?: Account } }>();

api.onError((err, c) => {
  if (err instanceof ApiError) return c.json(err.body, err.status as any);
  logger.error('api unhandled', { path: c.req.path, message: (err as any)?.message });
  return c.json({ message: 'Something went wrong on our side. Please try again.' }, 500);
});

function me(c: any): Account | undefined {
  return c.get('account') as Account | undefined;
}

/* ---------------------------------- health --------------------------------- */

api.get('/health', async (c) => {
  try {
    await pool.query('select 1');
    return c.json({ status: 'ok', ready: true, time: toZulu(new Date()) });
  } catch {
    return c.json({ status: 'starting', ready: false }, 503);
  }
});

/* ----------------------------------- auth ---------------------------------- */

api.post('/auth/signup', limited('signup'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = needString(body, 'email', { max: 254 }).toLowerCase();
  if (!isEmail(email)) throw bad('Enter a valid email address.', { field: 'email' });
  const password = needString(body, 'password', { min: 8, max: 200 });
  const name = needString(body, 'name', { max: 120 });

  const handleBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'guest';
  const created = await withTx(async (tx) => {
    const dupe = await tx.query('select 1 from accounts where lower(email) = lower($1)', [email]);
    if (dupe.rowCount) throw bad('An account with that email already exists. Sign in instead.', { field: 'email' });
    let handle = handleBase;
    for (let i = 0; ; i++) {
      const taken = await slugTaken(tx, i === 0 ? handleBase : `${handleBase}-${i + 1}`);
      if (!taken) { handle = i === 0 ? handleBase : `${handleBase}-${i + 1}`; break; }
    }
    if ((RESERVED_PATHS as readonly string[]).includes(handle) || (CATEGORIES as readonly string[]).includes(handle)) {
      handle = `${handle}-1`;
    }
    return createAccount(tx, { email, password, display_name: name, handle, role: 'guest' });
  });
  logger.info('account created', { id: created.id, role: created.role });
  const token = issueToken(created.id, config.tokenTtlSeconds);
  return c.json({
    id: created.id, email: created.email, display_name: created.display_name,
    handle: created.handle, role: created.role, access_token: token,
    token_type: 'bearer', expires_in: config.tokenTtlSeconds,
  }, 201);
});

api.post('/auth/login', limited('login'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = needString(body, 'email', { max: 254 }).toLowerCase();
  const password = needString(body, 'password', { max: 200 });
  const r = await pool.query('select * from accounts where lower(email) = lower($1)', [email]);
  const acct = r.rows[0];
  if (!acct || !verifyPassword(password, acct.password_hash)) {
    throw unauthorized('That email and password do not match. Check both and try again.');
  }
  const token = issueToken(acct.id, config.tokenTtlSeconds);
  return c.json({
    id: acct.id, email: acct.email, display_name: acct.display_name, handle: acct.handle,
    role: acct.role, access_token: token, token_type: 'bearer', expires_in: config.tokenTtlSeconds,
  });
});

api.get('/accounts/me', requireAuth, async (c) => {
  const a = me(c)!;
  return c.json(accountJson(a));
});

api.patch('/accounts/me', requireAuth, async (c) => {
  const a = me(c)!;
  const body = await c.req.json().catch(() => ({}));
  const displayName = optString(body, 'display_name', { max: 120 });
  const handle = optString(body, 'handle', { max: 64 });
  const updated = await withTx(async (tx) => {
    if (handle !== undefined) {
      if (!isHandle(handle)) throw bad('Use lowercase letters, numbers and hyphens only.', { field: 'handle' });
      if (handle !== a.handle) await assertSlugAvailable(tx, handle, 'handle');
    }
    if (displayName === undefined && handle === undefined) {
      throw bad('Change something before saving.', { field: 'display_name' });
    }
    const r = await tx.query(
      `update accounts set display_name = coalesce($2, display_name), handle = coalesce($3, handle)
        where id = $1 returning *`,
      [a.id, displayName ?? null, handle ?? null]
    );
    return r.rows[0];
  });
  return c.json(accountJson(updated));
});

function accountJson(a: any) {
  return { id: a.id, email: a.email, display_name: a.display_name, handle: a.handle, role: a.role, created_at: toZulu(a.created_at) };
}

/* --------------------------------- resolve --------------------------------- */

api.get('/resolve/:slug', async (c) => {
  const slug = c.req.param('slug').toLowerCase();
  if ((RESERVED_PATHS as readonly string[]).includes(slug)) return c.json({ kind: 'system', slug });
  if ((CATEGORIES as readonly string[]).includes(slug)) return c.json({ kind: 'category', slug });
  const e = await pool.query('select 1 from events where lower(slug) = lower($1)', [slug]);
  if (e.rowCount) return c.json({ kind: 'event', slug });
  const cal = await pool.query('select 1 from calendars where lower(slug) = lower($1)', [slug]);
  if (cal.rowCount) return c.json({ kind: 'calendar', slug });
  const a = await pool.query('select 1 from accounts where lower(handle) = lower($1)', [slug]);
  if (a.rowCount) return c.json({ kind: 'account', slug });
  throw notFound('We could not find that page.');
});

/* ---------------------------------- events --------------------------------- */

function discoveryWhere(): { sql: string; params: any[] } {
  return { sql: `state in ('published','registration_closed')`, params: [] };
}

api.get('/events', async (c) => {
  const q = c.req.query();
  const limitRaw = Number(q.limit ?? 20);
  const offsetRaw = Number(q.offset ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 20;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;

  const conds: string[] = [`e.state in ('published','registration_closed')`];
  const params: any[] = [];
  if (q.category && (CATEGORIES as readonly string[]).includes(q.category)) {
    params.push(q.category);
    conds.push(`e.category = $${params.length}`);
  }
  if (q.city && q.city.trim()) {
    params.push(`%${q.city.trim()}%`);
    conds.push(`e.city ilike $${params.length}`);
  }
  const term = (q.q ?? '').trim();
  if (term) {
    params.push(`%${term}%`);
    conds.push(`(e.title ilike $${params.length} or e.description ilike $${params.length} or c.name ilike $${params.length})`);
  }
  const where = conds.join(' and ');
  const total = await pool.query(
    `select count(*)::int as n from events e join calendars c on c.id = e.calendar_id where ${where}`,
    params
  );
  const rows = await pool.query(
    `select e.*, c.name as calendar_name,
            (select count(*)::int from registrations r where r.event_id = e.id and r.status in ('confirmed','checked_in')) as confirmed_count
       from events e join calendars c on c.id = e.calendar_id
      where ${where}
      order by e.starts_at asc, e.slug asc
      limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, limit, offset]
  );
  const items = rows.rows.map((e: any) => ({
    ...eventJson(e),
    calendar_name: e.calendar_name,
    confirmed_count: e.confirmed_count,
    remaining: Math.max(0, e.capacity - e.confirmed_count),
  }));
  return c.json(items, 200, { 'X-Total-Count': String(total.rows[0].n) });
});

/** Public event reads may carry a bearer token; resolve it when present. */
async function optionalAccount(c: any): Promise<Account | null> {
  const already = me(c);
  if (already) return already;
  const h = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const parsed = parseToken(m[1]);
  if (!parsed || tokenExpired(parsed)) return null;
  return accountById(parsed.sub);
}

async function loadVisibleEvent(c: any, slug: string) {
  const ev = await getEventBySlug(pool, slug);
  if (!ev) throw notFound('We could not find that page.');
  const cal = await calendarOf(pool, ev.calendar_id);
  const viewer = await optionalAccount(c);
  if (!canSeeEvent(ev, viewer, cal)) throw notFound('We could not find that page.');
  return { ev, cal, viewer };
}

api.get('/events/:slug', async (c) => {
  const { ev, cal } = await loadVisibleEvent(c, c.req.param('slug'));
  const cc = await confirmedCount(pool, ev.id);
  const mine = me(c) ? await pool.query(
    'select * from registrations where event_id = $1 and account_id = $2', [ev.id, me(c)!.id]
  ) : null;
  const owner = await pool.query('select id, display_name, handle from accounts where id = $1', [cal.owner_account_id]);
  return c.json({
    ...eventJson(ev),
    calendar: {
      slug: cal.slug, name: cal.name, category: cal.category, city: cal.city,
      is_public: cal.is_public, owner: owner.rows[0] ?? null,
    },
    confirmed_count: cc,
    remaining: Math.max(0, ev.capacity - cc),
    my_registration: mine?.rows[0]
      ? {
          id: mine.rows[0].id, status: mine.rows[0].status,
          waitlist_position: mine.rows[0].waitlist_position,
          ticket_code: mine.rows[0].ticket_code,
          checked_in_at: mine.rows[0].checked_in_at ? toZulu(mine.rows[0].checked_in_at) : null,
        }
      : null,
  });
});

api.post('/events', requireAuth, requireRole('host'), async (c) => {
  const a = me(c)!;
  const body = await c.req.json().catch(() => ({}));
  const calendarSlug = needString(body, 'calendar_slug', { max: 64 });
  const title = optString(body, 'title', { max: 160 });
  const category = optCategory(body, 'category');
  const city = optString(body, 'city', { max: 120 });
  const tz = optString(body, 'time_zone', { max: 64 }) ?? 'UTC';
  const capacity = body?.capacity === undefined || body?.capacity === null ? undefined : needInt(body, 'capacity', { min: 1, max: 500 });
  const approval = optBool(body, 'approval_required') ?? false;
  const waitlist = optBool(body, 'waitlist_enabled') ?? false;
  const description = optString(body, 'description', { max: 4000 }) ?? '';

  let starts: Date | undefined;
  let ends: Date | undefined;
  if (body?.starts_at) starts = parseInstant(body.starts_at, 'the start time');
  if (body?.ends_at) ends = parseInstant(body.ends_at, 'the end time');
  if (starts && ends && ends <= starts) throw bad('The end time has to come after the start time.', { field: 'ends_at' });

  const created = await withTx(async (tx) => {
    const cal = await tx.query('select * from calendars where slug = $1 for update', [calendarSlug]);
    if (!cal.rows[0]) throw bad('Pick one of your calendars.', { field: 'calendar_slug' });
    if (cal.rows[0].owner_account_id !== a.id) throw bad('Pick one of your calendars.', { field: 'calendar_slug' });
    const ready = publishReady({ title, category, city, starts_at: body?.starts_at, ends_at: body?.ends_at, capacity });
    const slugBase = (title ?? 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event';
    let slug = slugBase;
    for (let i = 1; ; i++) {
      if (!(await slugTaken(tx, slug))) break;
      slug = `${slugBase}-${i + 1}`;
    }
    if ((RESERVED_PATHS as readonly string[]).includes(slug) || (CATEGORIES as readonly string[]).includes(slug)) {
      slug = `${slug}-1`;
    }
    const r = await tx.query(
      `insert into events (calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex,
                           description, starts_at, ends_at, capacity, approval_required, waitlist_enabled,
                           state, published_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`,
      [cal.rows[0].id, title ?? '', slug, category ?? '', city ?? '', tz, slug,
       themeFromSeed(slug), description,
       starts?.toISOString() ?? new Date(Date.now() + 7 * 86400_000).toISOString(),
       ends?.toISOString() ?? new Date(Date.now() + 7 * 86400_000 + 3600_000).toISOString(),
       capacity ?? 1, approval, waitlist, ready.ok ? 'published' : 'draft', ready.ok ? new Date().toISOString() : null]
    );
    return r.rows[0];
  });
  logger.info('event created', { id: created.id, slug: created.slug, state: created.state });
  return c.json(eventJson(created), 201);
});

api.patch('/events/:slug', requireAuth, requireRole('host'), async (c) => {
  const a = me(c)!;
  const slug = c.req.param('slug');
  const body = await c.req.json().catch(() => ({}));
  const updated = await withTx(async (tx) => {
    const ev = await tx.query('select * from events where slug = $1 for update', [slug]);
    const e = ev.rows[0];
    if (!e) throw notFound('We could not find that page.');
    const cal = await tx.query('select * from calendars where id = $1', [e.calendar_id]);
    if (cal.rows[0].owner_account_id !== a.id) throw notFound('We could not find that page.');

    // Start from the stored row so an absent field keeps its current value.
    const next: Record<string, any> = {
      title: e.title, category: e.category, city: e.city, time_zone: e.time_zone,
      description: e.description, approval_required: e.approval_required,
      waitlist_enabled: e.waitlist_enabled,
    };
    if (body?.title !== undefined) next.title = needString(body, 'title', { max: 160 });
    if (body?.category !== undefined) next.category = optCategory(body, 'category') ?? e.category;
    if (body?.city !== undefined) next.city = needString(body, 'city', { max: 120 });
    if (body?.time_zone !== undefined) next.time_zone = optString(body, 'time_zone', { max: 64 }) ?? e.time_zone;
    if (body?.description !== undefined) next.description = optString(body, 'description', { max: 4000 }) ?? '';
    if (body?.approval_required !== undefined) next.approval_required = needBool(body, 'approval_required');
    if (body?.waitlist_enabled !== undefined) next.waitlist_enabled = needBool(body, 'waitlist_enabled');

    let starts = new Date(e.starts_at);
    let ends = new Date(e.ends_at);
    if (body?.starts_at !== undefined) starts = parseInstant(body.starts_at, 'the start time');
    if (body?.ends_at !== undefined) ends = parseInstant(body.ends_at, 'the end time');
    if (ends <= starts) throw bad('The end time has to come after the start time.', { field: 'ends_at' });

    // State transitions.
    if (body?.state !== undefined) {
      const target = needString(body, 'state');
      if (!['draft', 'published', 'registration_closed', 'cancelled'].includes(target)) {
        throw bad('That is not a state an event can be in.', { field: 'state' });
      }
      if (e.state === 'cancelled') throw bad('A cancelled event cannot be republished.', { field: 'state' });
      if (target === 'draft') throw bad('A published event cannot go back to draft.', { field: 'state' });
      if (target === 'cancelled') throw bad('Use the cancel action to call an event off.', { field: 'state' });
      if (target === 'registration_closed' && e.state !== 'published') {
        throw bad('Only a published event can close registration.', { field: 'state' });
      }
      if (target === 'published') {
        if (e.state === 'draft') {
          const ready = publishReady({ title: next.title, category: next.category, city: next.city, starts_at: 'x', ends_at: 'x', capacity: e.capacity });
          if (!ready.ok) throw bad('Add a title, category, city, times and a capacity before publishing.', { field: 'state' });
        }
        next.state = 'published';
        if (e.state === 'draft') next.published_at = new Date().toISOString();
      } else {
        next.state = target;
      }
    }

    // Capacity: lowering below confirmed count is refused; raising fills the list.
    let moved = 0;
    if (body?.capacity !== undefined) {
      const newCap = needInt(body, 'capacity', { min: 1, max: 500 });
      const res = await applyCapacityChange(tx, e, newCap);
      moved = res.moved;
    }

    const r = await tx.query(
      `update events set title=$2, category=$3, city=$4, time_zone=$5, description=$6,
              approval_required=$7, waitlist_enabled=$8, starts_at=$9, ends_at=$10,
              state=coalesce($11, state), published_at=coalesce($12, published_at), updated_at=now()
        where id=$1 returning *`,
      [e.id, next.title, next.category, next.city, next.time_zone, next.description,
       next.approval_required, next.waitlist_enabled,
       starts.toISOString(), ends.toISOString(), next.state ?? null, next.published_at ?? null]
    );
    const out = r.rows[0];

    // Guests holding a seat are told when the time or the place changes.
    if (out.state !== 'cancelled' && (starts.getTime() !== new Date(e.starts_at).getTime() || ends.getTime() !== new Date(e.ends_at).getTime())) {
      const holders = await tx.query(
        `select r.id, a.email from registrations r join accounts a on a.id = r.account_id
          where r.event_id = $1 and r.status in ('confirmed','checked_in')`, [e.id]
      );
      for (const row of holders.rows) {
        await sendAndLog(tx, {
          registration_id: row.id, event_id: e.id, recipient: row.email,
          subject: subject('time_changed', e.title),
          body: mailBody('time_changed', out, `It now starts ${toZulu(out.starts_at)} (${out.time_zone})`),
        });
      }
    }
    return { event: out, moved };
  });
  if (updated.moved > 0) logger.info('capacity raised, waiting list moved', { slug, moved: updated.moved });
  return c.json({ ...eventJson(updated.event), moved_from_waitlist: updated.moved });
});

api.post('/events/:slug/cancel', requireAuth, requireRole('host'), async (c) => {
  const a = me(c)!;
  const slug = c.req.param('slug');
  const body = await c.req.json().catch(() => ({}));
  const reason = needString(body, 'reason', { max: 2000 });
  const result = await withTx(async (tx) => {
    const ev = await tx.query('select * from events where slug = $1 for update', [slug]);
    const e = ev.rows[0];
    if (!e) throw notFound('We could not find that page.');
    const cal = await tx.query('select * from calendars where id = $1', [e.calendar_id]);
    if (cal.rows[0].owner_account_id !== a.id) throw notFound('We could not find that page.');
    if (e.state === 'cancelled') throw bad('This event is already cancelled.', { field: 'state' });
    const mailed = await cancelEvent(tx, e, reason);
    return { event: (await tx.query('select * from events where id = $1', [e.id])).rows[0], mailed };
  });
  logger.info('event cancelled', { slug, mailed: result.mailed });
  return c.json(eventJson(result.event));
});

/* ------------------------------- registrations ------------------------------ */

api.post('/registrations', requireAuth, async (c) => {
  const a = me(c)!;
  const body = await c.req.json().catch(() => ({}));
  const eventSlug = needString(body, 'event_slug', { max: 64 });

  const rl = rateLimitCheck(`register:${a.id}`);
  if (!rl.ok) throw tooMany(`That is a lot of attempts at once. Wait ${rl.retryAfter} seconds and try again.`, { field: 'rate_limit', limit: 10, window_seconds: 60, retry_after: rl.retryAfter });

  const out = await withTx(async (tx) => {
    const ev = await tx.query('select * from events where slug = $1 for update', [eventSlug]);
    const e = ev.rows[0];
    if (!e) throw notFound('We could not find that page.');
    if (e.state === 'draft') throw notFound('We could not find that page.');
    return registerForEvent(tx, e, a.id, { email: a.email, display_name: a.display_name });
  });
  logger.info('registration', { event: eventSlug, account: a.id, status: out.registration.status });
  return c.json(regJson(out.registration, e2title(out)), 201);
});

function e2title(o: any) { return o?.event?.title ?? o?.title ?? ''; }

function regJson(r: any, title = '') {
  return {
    id: r.id, event_id: r.event_id, account_id: r.account_id, status: r.status,
    waitlist_position: r.waitlist_position, ticket_code: r.ticket_code,
    checked_in_at: r.checked_in_at ? toZulu(r.checked_in_at) : null,
    created_at: toZulu(r.created_at), updated_at: toZulu(r.updated_at),
    event_title: title || undefined,
  };
}

api.get('/registrations/me', requireAuth, async (c) => {
  const a = me(c)!;
  const rows = await pool.query(
    `select r.*, e.title, e.slug as event_slug, e.starts_at, e.ends_at, e.time_zone, e.city, e.category,
            e.theme_hex, e.cover_seed, e.state as event_state, e.capacity
       from registrations r join events e on e.id = r.event_id
      where r.account_id = $1
      order by e.starts_at asc`,
    [a.id]
  );
  return c.json(rows.rows.map((r: any) => ({
    ...regJson(r, r.title),
    event_title: r.title, event_slug: r.event_slug, starts_at: toZulu(r.starts_at),
    ends_at: toZulu(r.ends_at), time_zone: r.time_zone, city: r.city, category: r.category,
    theme_hex: r.theme_hex, cover_seed: r.cover_seed, event_state: r.event_state, capacity: r.capacity,
  })));
});

async function ownRegistration(c: any, id: number, accountId: number) {
  const r = await pool.query('select * from registrations where id = $1', [id]);
  const reg = r.rows[0];
  if (!reg) throw notFound('We could not find that page.');
  return { reg };
}

api.post('/registrations/:id/cancel', requireAuth, async (c) => {
  const a = me(c)!;
  const id = Number(c.req.param('id'));
  const out = await withTx(async (tx) => {
    const r = await tx.query('select * from registrations where id = $1 for update', [id]);
    const reg = r.rows[0];
    if (!reg) throw notFound('We could not find that page.');
    if (reg.account_id !== a.id) throw notFound('We could not find that page.');
    if (['cancelled_by_guest', 'cancelled_by_host', 'declined'].includes(reg.status)) {
      return { registration: reg, promoted: 0 };
    }
    const ev = await tx.query('select * from events where id = $1 for update', [reg.event_id]);
    return cancelRegistration(tx, ev.rows[0], reg, 'guest');
  });
  logger.info('registration cancelled by guest', { id, promoted: out.promoted });
  return c.json(regJson(out.registration));
});

/* Host-only: the approval queue and the door. */

async function hostEvent(c: any, slug: string, tx: any) {
  const a = me(c)!;
  const ev = await tx.query('select * from events where slug = $1 for update', [slug]);
  const e = ev.rows[0];
  if (!e) throw notFound('We could not find that page.');
  const cal = await tx.query('select * from calendars where id = $1', [e.calendar_id]);
  if (!cal.rows[0] || cal.rows[0].owner_account_id !== a.id) throw notFound('We could not find that page.');
  return e;
}

api.get('/events/:slug/registrations', requireAuth, requireRole('host'), async (c) => {
  const slug = c.req.param('slug');
  const e = await (async () => {
    const ev = await pool.query('select * from events where slug = $1', [slug]);
    if (!ev.rows[0]) throw notFound('We could not find that page.');
    const cal = await pool.query('select * from calendars where id = $1', [ev.rows[0].calendar_id]);
    if (!cal.rows[0] || cal.rows[0].owner_account_id !== me(c)!.id) throw notFound('We could not find that page.');
    return ev.rows[0];
  })();
  const rows = await pool.query(
    `select r.id, r.account_id, r.status, r.waitlist_position, r.ticket_code, r.checked_in_at,
            a.email, a.display_name
       from registrations r join accounts a on a.id = r.account_id
      where r.event_id = $1
      order by r.status asc, r.waitlist_position asc nulls last, a.email asc`,
    [e.id]
  );
  return c.json(rows.rows.map((r: any) => ({
    id: r.id, account_id: r.account_id, email: r.email, display_name: r.display_name,
    status: r.status, waitlist_position: r.waitlist_position, ticket_code: r.ticket_code,
    checked_in_at: r.checked_in_at ? toZulu(r.checked_in_at) : null,
  })));
});

api.get('/events/:slug/registrations.csv', requireAuth, requireRole('host'), async (c) => {
  const slug = c.req.param('slug');
  const e = await (async () => {
    const ev = await pool.query('select * from events where slug = $1', [slug]);
    if (!ev.rows[0]) throw notFound('We could not find that page.');
    const cal = await pool.query('select * from calendars where id = $1', [ev.rows[0].calendar_id]);
    if (!cal.rows[0] || cal.rows[0].owner_account_id !== me(c)!.id) throw notFound('We could not find that page.');
    return ev.rows[0];
  })();
  const rows = await pool.query(
    `select r.status, r.waitlist_position, r.ticket_code, a.email, a.display_name
       from registrations r join accounts a on a.id = r.account_id
      where r.event_id = $1
      order by r.status asc, r.waitlist_position asc nulls last, a.email asc`,
    [e.id]
  );
  const esc = (v: string | null | undefined) => {
    const s = v ?? '';
    return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = ['email,display_name,status,waitlist_position,ticket_code'];
  for (const r of rows.rows) {
    lines.push([esc(r.email), esc(r.display_name), esc(r.status), esc(r.waitlist_position == null ? '' : String(r.waitlist_position)), esc(r.ticket_code)].join(','));
  }
  return c.body(lines.join('\n') + '\n', 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${slug}.csv"`,
  });
});

api.post('/registrations/:id/approve', requireAuth, requireRole('host'), async (c) => {
  const a = me(c)!;
  const id = Number(c.req.param('id'));
  const out = await withTx(async (tx) => {
    const r = await tx.query('select * from registrations where id = $1 for update', [id]);
    const reg = r.rows[0];
    if (!reg) throw notFound('We could not find that page.');
    const ev = await tx.query('select * from events where id = $1 for update', [reg.event_id]);
    const e = ev.rows[0];
    const cal = await tx.query('select * from calendars where id = $1', [e.calendar_id]);
    if (!cal.rows[0] || cal.rows[0].owner_account_id !== a.id) throw notFound('We could not find that page.');
    const guest = await tx.query('select email, display_name from accounts where id = $1', [reg.account_id]);
    const res = await approveRegistration(tx, e, reg, guest.rows[0]);
    return res;
  });
  logger.info('registration approved', { id, status: out.registration.status });
  return c.json({ ...regJson(out.registration), notice: out.notice });
});

api.post('/registrations/:id/decline', requireAuth, requireRole('host'), async (c) => {
  const a = me(c)!;
  const id = Number(c.req.param('id'));
  const out = await withTx(async (tx) => {
    const r = await tx.query('select * from registrations where id = $1 for update', [id]);
    const reg = r.rows[0];
    if (!reg) throw notFound('We could not find that page.');
    const ev = await tx.query('select * from events where id = $1 for update', [reg.event_id]);
    const e = ev.rows[0];
    const cal = await tx.query('select * from calendars where id = $1', [e.calendar_id]);
    if (!cal.rows[0] || cal.rows[0].owner_account_id !== a.id) throw notFound('We could not find that page.');
    const guest = await tx.query('select email, display_name from accounts where id = $1', [reg.account_id]);
    return declineRegistration(tx, e, reg, guest.rows[0]);
  });
  logger.info('registration declined', { id });
  return c.json(regJson(out));
});

api.post('/registrations/:id/cancel-by-host', requireAuth, requireRole('host'), async (c) => {
  const a = me(c)!;
  const id = Number(c.req.param('id'));
  const out = await withTx(async (tx) => {
    const r = await tx.query('select * from registrations where id = $1 for update', [id]);
    const reg = r.rows[0];
    if (!reg) throw notFound('We could not find that page.');
    const ev = await tx.query('select * from events where id = $1 for update', [reg.event_id]);
    const e = ev.rows[0];
    const cal = await tx.query('select * from calendars where id = $1', [e.calendar_id]);
    if (!cal.rows[0] || cal.rows[0].owner_account_id !== a.id) throw notFound('We could not find that page.');
    if (['cancelled_by_guest', 'cancelled_by_host', 'declined'].includes(reg.status)) {
      return { registration: reg, promoted: 0 };
    }
    return cancelRegistration(tx, e, reg, 'host');
  });
  return c.json(regJson(out.registration));
});

/* ---------------------------------- tickets -------------------------------- */

api.get('/tickets/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const r = await pool.query(
    `select r.*, e.title, e.slug as event_slug, e.starts_at, e.ends_at, e.time_zone, e.city, e.theme_hex, e.cover_seed, e.state as event_state
       from registrations r join events e on e.id = r.event_id
      where upper(r.ticket_code) = $1`,
    [code]
  );
  const row = r.rows[0];
  if (!row) throw notFound('We could not find that page.');
  if (row.status !== 'confirmed' && row.status !== 'checked_in') throw notFound('We could not find that page.');
  return c.json({
    id: row.id, status: row.status, ticket_code: row.ticket_code,
    checked_in_at: row.checked_in_at ? toZulu(row.checked_in_at) : null,
    event_slug: row.event_slug, title: row.title, starts_at: toZulu(row.starts_at),
    ends_at: toZulu(row.ends_at), time_zone: row.time_zone, city: row.city,
    theme_hex: row.theme_hex, cover_seed: row.cover_seed, event_state: row.event_state,
  });
});

api.post('/tickets/:code/check-in', requireAuth, requireRole('host'), async (c) => {
  const a = me(c)!;
  const code = c.req.param('code').toUpperCase();
  const out = await withTx(async (tx) => {
    const r = await tx.query(
      `select r.* from registrations r where upper(r.ticket_code) = $1 for update`, [code]
    );
    const reg = r.rows[0];
    if (!reg) throw notFound('We could not find that ticket.');
    const ev = await tx.query('select * from events where id = $1 for update', [reg.event_id]);
    const e = ev.rows[0];
    const cal = await tx.query('select * from calendars where id = $1', [e.calendar_id]);
    if (!cal.rows[0] || cal.rows[0].owner_account_id !== a.id) throw notFound('We could not find that ticket.');
    return checkInTicket(tx, e, reg);
  });
  logger.info('ticket checked in', { code, already: out.already });
  return c.json({ ...regJson(out.registration), already_checked_in: out.already });
});

/* --------------------------------- calendars ------------------------------- */

api.get('/calendars', requireAuth, async (c) => {
  const a = me(c)!;
  const rows = await pool.query(
    `select c.*,
            (select count(*)::int from events e where e.calendar_id = c.id and e.state in ('published','registration_closed')) as published_events
       from calendars c where c.owner_account_id = $1 order by c.created_at asc`,
    [a.id]
  );
  return c.json(rows.rows.map((r: any) => calendarJson(r)));
});

function calendarJson(c: any) {
  return {
    id: c.id, owner_account_id: c.owner_account_id, name: c.name, slug: c.slug,
    category: c.category, city: c.city, is_public: c.is_public,
    created_at: toZulu(c.created_at), published_events: c.published_events ?? 0,
  };
}

api.post('/calendars', requireAuth, requireRole('host'), async (c) => {
  const a = me(c)!;
  const body = await c.req.json().catch(() => ({}));
  const name = needString(body, 'name', { max: 120 });
  const slug = needString(body, 'slug', { max: 64 });
  const category = optCategory(body, 'category');
  if (!category) throw bad('Pick one of the twelve categories.', { field: 'category' });
  const city = needString(body, 'city', { max: 120 });
  const isPublic = optBool(body, 'is_public') ?? true;
  const created = await withTx(async (tx) => {
    await assertSlugAvailable(tx, slug, 'calendar');
    const r = await tx.query(
      `insert into calendars (owner_account_id, name, slug, category, city, is_public)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [a.id, name, slug, category, city, isPublic]
    );
    return r.rows[0];
  });
  logger.info('calendar created', { slug: created.slug });
  return c.json(calendarJson(created), 201);
});
