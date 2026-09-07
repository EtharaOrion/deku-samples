import { Hono } from 'hono';
import type { Context } from 'hono';
import { CATEGORIES, CATEGORY_META, RESERVED_PATHS, pool, shortId, TICKET_CODE_RE } from './config.js';
import { log } from './config.js';
import { bad, forbidden, notFound, tooMany, unauthorized, HttpError } from './http.js';
import {
  accountFromToken, bearer, createAccount, login as loginAccount, logoutToken, kebab, type Account,
} from './auth.js';
import { classify, resolveRoot } from './namespace.js';
import { withTransaction } from './db.js';
import { themeFromHex } from './theme.js';
import {
  cancelEvent as cancelEventRow, createEvent, editEvent, parseDraft, parseEdit, type EventRow,
} from './events.js';
import {
  assertRegistrationOpen, clearTicket, getEventLiteBySlug, lockEvent, mailPromoted, mintTicket,
  nextWaitlistPosition, promoteFromWaitlist, renumberWaitlist, seatCount, sendMail,
} from './registrations.js';
import * as v from './validate.js';

// ---------- rate limiting: 10 per minute per account ----------
const buckets = new Map<string, number[]>();
function hitRateLimit(key: string, perMinute = 10): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const arr = (buckets.get(key) ?? []).filter((t) => t > windowStart);
  if (arr.length >= perMinute) {
    buckets.set(key, arr);
    return true;
  }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 20_000) {
    for (const [k, times] of buckets) if (times.every((t) => t <= windowStart)) buckets.delete(k);
  }
  return false;
}

type Vars = { account: Account | null; token?: string };
const api = new Hono<{ Variables: Vars }>();

api.use('*', async (c, next) => {
  const account = await accountFromToken(bearer(c));
  c.set('account', account);
  c.set('token', account ? bearer(c) : undefined);
  await next();
});

function account(c: Context): Account {
  const acct = c.get('account');
  if (!acct) throw unauthorized();
  return acct;
}

// ---------- serializers ----------
interface EventJoinRow extends EventRow {
  calendar_name: string;
  calendar_slug: string;
  calendar_public: boolean;
  owner_account_id: string;
  owner_display_name: string;
  owner_handle: string;
  owner_email: string;
  confirmed: number;
  waitlisted: number;
  pending: number;
  arrived: number;
}

const EVENT_SELECT = `
  SELECT e.*, c.name AS calendar_name, c.slug AS calendar_slug, c.is_public AS calendar_public,
         c.owner_account_id AS owner_account_id, a.display_name AS owner_display_name,
         a.handle AS owner_handle, a.email AS owner_email,
         (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in'))::int AS confirmed,
         (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'waitlisted')::int AS waitlisted,
         (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'pending_approval')::int AS pending,
         (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'checked_in')::int AS arrived
  FROM events e
  JOIN calendars c ON c.id = e.calendar_id
  JOIN accounts a ON a.id = c.owner_account_id`;

function iso(d: Date | null): string | null {
  return d ? new Date(d).toISOString() : null;
}

function themeTokens(hex: string) {
  const t = themeFromHex(hex);
  return {
    key: t.key, ground: t.ground, ground_sunk: t.groundSunk, ink: t.ink,
    ink_secondary: t.inkSecondary, hairline: t.hairline, panel: t.panel, pale: t.pale,
  };
}

function serializeEvent(r: EventJoinRow, opts: { detailed?: boolean } = {}) {
  const base = {
    id: r.id,
    slug: r.slug,
    title: r.title,
    category: r.category,
    city: r.city,
    time_zone: r.time_zone,
    starts_at: iso(r.starts_at),
    ends_at: iso(r.ends_at),
    capacity: r.capacity,
    confirmed_count: r.confirmed,
    remaining: Math.max(0, r.capacity - r.confirmed),
    state: r.state,
    theme_hex: r.theme_hex,
    theme: themeTokens(r.theme_hex),
    cover_seed: r.cover_seed,
    waitlist_enabled: r.waitlist_enabled,
    approval_required: r.approval_required,
    cancelled_at: iso(r.cancelled_at),
    cancel_reason: r.cancel_reason,
    published_at: iso(r.published_at),
    calendar: {
      slug: r.calendar_slug,
      name: r.calendar_name,
      category: r.category,
      city: r.city,
      is_public: r.calendar_public,
      owner: { handle: r.owner_handle, display_name: r.owner_display_name },
    },
    owner_handle: r.owner_handle,
    is_owner: false,
  };
  if (!opts.detailed) return base;
  return { ...base, description: r.description, waitlist_count: r.waitlisted, pending_count: r.pending, arrived_count: r.arrived };
}

async function eventBySlug(slug: string): Promise<EventJoinRow | null> {
  const res = await pool.query<EventJoinRow>(`${EVENT_SELECT} WHERE e.slug = $1`, [slug]);
  return res.rows[0] ?? null;
}

async function canSeeEvent(ev: EventJoinRow, viewer: Account | null): Promise<boolean> {
  if (ev.state === 'draft') return viewer?.id === ev.owner_account_id;
  return true;
}

// ---------- health ----------
api.get('/health', (c) => c.json({ status: 'ok', ready: true, time: new Date().toISOString() }));

// ---------- auth ----------
api.post('/auth/signup', async (c) => {
  const b = await v.body(c.req);
  const emailAddr = v.email(b) as string;
  const passwordPlain = v.password(b);
  const name = v.str(b, 'name', { required: true, min: 2, max: 80, label: 'name' }) as string;
  if (hitRateLimit(`signup:${emailAddr}`, 10)) {
    throw tooMany('That is a lot of sign-ups in one minute. Wait a moment and try again. Limit: 10 per minute.');
  }
  const acct = await createAccount(emailAddr, passwordPlain, name, 'guest');
  const { token } = await loginAccount(emailAddr, passwordPlain);
  log('account_created', { id: acct.id, role: acct.role });
  return c.json({ id: acct.id, email: acct.email, display_name: acct.display_name, handle: acct.handle, role: acct.role, access_token: token }, 201);
});

api.post('/auth/login', async (c) => {
  const b = await v.body(c.req);
  const emailAddr = v.email(b) as string;
  const passwordPlain = typeof b.password === 'string' ? b.password : '';
  if (hitRateLimit(`login:${emailAddr}`, 10)) {
    throw tooMany('Too many sign-in attempts in one minute. Wait a moment and try again. Limit: 10 per minute.');
  }
  const { account: acct, token } = await loginAccount(emailAddr, passwordPlain);
  return c.json({ access_token: token, id: acct.id, email: acct.email, display_name: acct.display_name, handle: acct.handle, role: acct.role });
});

api.post('/auth/logout', async (c) => {
  await logoutToken(c.get('token'));
  return c.json({ ok: true });
});

// ---------- accounts ----------
api.get('/accounts/me', (c) => {
  const acct = account(c);
  return c.json({ id: acct.id, email: acct.email, display_name: acct.display_name, handle: acct.handle, role: acct.role });
});

api.patch('/accounts/me', async (c) => {
  const acct = account(c);
  const b = await v.body(c.req);
  const name = v.str(b, 'display_name', { min: 2, max: 80, label: 'name' });
  const handle = v.str(b, 'handle', { min: 1, max: 60 });
  const { isSlugFree } = await import('./namespace.js');
  if (name === undefined && handle === undefined) throw bad('Change a name or a handle to save.');
  let newHandle = acct.handle;
  if (handle !== undefined && handle !== acct.handle) {
    if (kebab(handle) !== handle) {
      throw bad('Write the handle in kebab-case, like amina-osei.', { handle: 'Use kebab-case.' });
    }
    if (classify(handle) === 'system' || classify(handle) === 'category' || classify(handle) !== 'root') {
      const msg = RESERVED_PATHS.has(handle)
        ? 'That handle is reserved. Choose another.'
        : 'That handle matches a category name. Choose another.';
      throw bad(msg, { handle: 'That handle is not available.' });
    }
    if (!(await isSlugFree(handle))) {
      throw bad('That handle is already taken.', { handle: 'That handle is already taken.' });
    }
    newHandle = handle;
  }
  const res = await pool.query<Account>(
    `UPDATE accounts SET display_name = $2, handle = $3 WHERE id = $1
     RETURNING id, email, display_name, handle, role`,
    [acct.id, name ?? acct.display_name, newHandle],
  );
  return c.json(res.rows[0]);
});

// ---------- resolve ----------
api.get('/resolve/:slug', async (c) => {
  const slug = c.req.param('slug').toLowerCase();
  const kind = classify(slug);
  if (kind === 'system' || kind === 'category') return c.json({ kind, slug });
  const hit = await resolveRoot(slug);
  if (!hit) throw notFound('Nothing lives at that address.');
  return c.json({ kind: hit.kind, slug });
});

// ---------- categories ----------
api.get('/categories', (c) => c.json(
  CATEGORIES.map((key) => ({ key, label: CATEGORY_META[key].label, blurb: CATEGORY_META[key].blurb, hue: CATEGORY_META[key].hue })),
));

// ---------- events: discovery ----------
api.get('/events', async (c) => {
  const category = (c.req.query('category') || '').trim().toLowerCase();
  const city = (c.req.query('city') || '').trim();
  const q = (c.req.query('q') || '').trim();
  let limit = Number.parseInt(c.req.query('limit') || '', 10);
  let offset = Number.parseInt(c.req.query('offset') || '', 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 20;
  if (limit > 100) limit = 100;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  const where: string[] = [`e.state IN ('published','registration_closed')`];
  const params: unknown[] = [];
  if (category) {
    if (!(CATEGORIES as readonly string[]).includes(category)) {
      c.header('X-Total-Count', '0');
      return c.json([]);
    }
    params.push(category);
    where.push(`e.category = $${params.length}`);
  }
  if (city) {
    params.push(city);
    where.push(`e.city = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(lower(e.title) LIKE $${params.length} OR lower(coalesce(e.description,'')) LIKE $${params.length} OR lower(c.name) LIKE $${params.length})`);
  }
  const whereSql = where.join(' AND ');
  const totalRes = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM events e JOIN calendars c ON c.id = e.calendar_id WHERE ${whereSql}`,
    params,
  );
  const rows = await pool.query<EventJoinRow>(
    `${EVENT_SELECT} WHERE ${whereSql} ORDER BY e.starts_at ASC, e.slug ASC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  c.header('X-Total-Count', String(totalRes.rows[0]?.n ?? 0));
  return c.json(rows.rows.map((r) => serializeEvent(r)));
});

// ---------- events: one ----------
api.get('/events/:slug', async (c) => {
  const slug = c.req.param('slug');
  const viewer = c.get('account');
  const ev = await eventBySlug(slug);
  if (!ev) throw notFound('We could not find that event.');
  if (!(await canSeeEvent(ev, viewer))) throw notFound('We could not find that event.');
  const out = serializeEvent(ev, { detailed: true }) as ReturnType<typeof serializeEvent> & { is_owner: boolean; my_registration?: unknown };
  out.is_owner = viewer?.id === ev.owner_account_id;
  if (viewer) {
    const mine = await pool.query(
      `SELECT id, status, waitlist_position, ticket_code, checked_in_at FROM registrations
        WHERE event_id = $1 AND account_id = $2`,
      [ev.id, viewer.id],
    );
    out.my_registration = mine.rows[0] ?? null;
  }
  return c.json(out);
});

// ---------- events: create ----------
api.post('/events', async (c) => {
  const acct = account(c);
  if (acct.role !== 'host') throw forbidden('Only a host can create an event.');
  const b = await v.body(c.req);
  const input = parseDraft(b);
  if (!input.calendar_slug) throw bad('Pick one of your calendars for this event.', { calendar_slug: 'Choose a calendar.' });
  const created = await withTransaction(async (tx) => createEvent(tx, acct.id, input));
  log('event_created', { slug: created.slug, state: created.state, by: acct.id });
  const ev = await eventBySlug(created.slug);
  return c.json(serializeEvent(ev as EventJoinRow, { detailed: true }), 201);
});

// ---------- events: edit ----------
api.patch('/events/:slug', async (c) => {
  const acct = account(c);
  const slug = c.req.param('slug');
  const ev = await eventBySlug(slug);
  if (!ev) throw notFound('We could not find that event.');
  if (ev.owner_account_id !== acct.id) throw notFound('We could not find that event.');
  const b = await v.body(c.req);
  const edit = parseEdit(b);
  const outcome = await withTransaction(async (tx) => {
    const fresh = (await tx.query<EventRow>(`SELECT * FROM events WHERE id = $1`, [ev.id])).rows[0];
    return editEvent(tx, fresh, edit);
  });
  const after = await eventBySlug(slug);
  return c.json({
    ...serializeEvent(after as EventJoinRow, { detailed: true }),
    moved_from_waitlist: outcome.movedFromWaitlist,
    detail_mail_count: outcome.detailMailCount,
  });
});

// ---------- events: cancel ----------
api.post('/events/:slug/cancel', async (c) => {
  const acct = account(c);
  const slug = c.req.param('slug');
  const ev = await eventBySlug(slug);
  if (!ev) throw notFound('We could not find that event.');
  if (ev.owner_account_id !== acct.id) throw notFound('We could not find that event.');
  const b = await v.body(c.req);
  const reason = v.str(b, 'reason', { required: true, min: 3, max: 500, label: 'reason' }) as string;
  const outcome = await withTransaction(async (tx) => {
    const fresh = (await tx.query<EventRow>(`SELECT * FROM events WHERE id = $1`, [ev.id])).rows[0];
    return cancelEventRow(tx, fresh, reason);
  });
  log('event_cancelled', { slug, reason, mailed: outcome.mailed });
  const after = await eventBySlug(slug);
  return c.json(serializeEvent(after as EventJoinRow, { detailed: true }));
});

// ---------- registrations: guest list + csv ----------
const REG_SELECT = `
  SELECT r.id, r.account_id, a.email, a.display_name, r.status, r.waitlist_position, r.ticket_code,
         r.checked_in_at, r.created_at, r.updated_at
  FROM registrations r JOIN accounts a ON a.id = r.account_id`;

async function ownedEventOr404(slug: string, acct: Account): Promise<EventJoinRow> {
  const ev = await eventBySlug(slug);
  if (!ev) throw notFound('We could not find that event.');
  if (ev.owner_account_id !== acct.id) throw notFound('We could not find that event.');
  return ev;
}

function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const STATUS_ORDER = 'CASE r.status ' +
  `WHEN 'cancelled_by_guest' THEN 1 WHEN 'cancelled_by_host' THEN 2 WHEN 'checked_in' THEN 3 ` +
  `WHEN 'confirmed' THEN 4 WHEN 'declined' THEN 5 WHEN 'pending_approval' THEN 6 WHEN 'waitlisted' THEN 7 END`;

api.get('/events/:slug/registrations', async (c) => {
  const acct = account(c);
  const ev = await ownedEventOr404(c.req.param('slug'), acct);
  const rows = await pool.query(
    `${REG_SELECT} WHERE r.event_id = $1
     ORDER BY ${STATUS_ORDER} ASC, r.waitlist_position ASC NULLS LAST, a.email ASC`,
    [ev.id],
  );
  return c.json(rows.rows);
});

api.get('/events/:slug/registrations.csv', async (c) => {
  const acct = account(c);
  const ev = await ownedEventOr404(c.req.param('slug'), acct);
  const rows = await pool.query<{ email: string; display_name: string; status: string; waitlist_position: number | null; ticket_code: string | null }>(
    `${REG_SELECT} WHERE r.event_id = $1
     ORDER BY ${STATUS_ORDER} ASC, r.waitlist_position ASC NULLS LAST, a.email ASC`,
    [ev.id],
  );
  const lines = ['email,display_name,status,waitlist_position,ticket_code'];
  for (const r of rows.rows) {
    lines.push([csvField(r.email), csvField(r.display_name), csvField(r.status), csvField(r.waitlist_position), csvField(r.ticket_code)].join(','));
  }
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${ev.slug}.csv"`);
  return c.body(lines.join('\r\n') + '\r\n', 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${ev.slug}.csv"` });
});

// ---------- registrations: create or update ----------
function decideTarget(approval: boolean, free: boolean, waitlist: boolean): 'pending_approval' | 'confirmed' | 'waitlisted' | null {
  if (approval) return 'pending_approval';
  if (free) return 'confirmed';
  return waitlist ? 'waitlisted' : null;
}

api.post('/registrations', async (c) => {
  const acct = account(c);
  if (hitRateLimit(`reg:${acct.id}`, 10)) {
    throw tooMany('That is a lot of registrations in one minute. Wait a moment and try again. Limit: 10 per minute.');
  }
  const b = await v.body(c.req);
  const eventSlug = v.str(b, 'event_slug', { required: true, max: 80 }) as string;
  const result = await withTransaction(async (tx) => {
    const ev = await getEventLiteBySlug(tx, eventSlug);
    if (!ev) throw notFound('We could not find that event.');
    assertRegistrationOpen(ev);
    await lockEvent(tx, ev.id);
    const existing = (await tx.query<{ id: string; status: string; waitlist_position: number | null; ticket_code: string | null }>(
      `SELECT id, status, waitlist_position, ticket_code FROM registrations WHERE event_id = $1 AND account_id = $2`,
      [ev.id, acct.id],
    )).rows[0];
    const seats = await seatCount(tx, ev.id);
    const target = decideTarget(ev.approval_required, seats < ev.capacity, ev.waitlist_enabled);
    if (target === null) throw new HttpError(409, 'This event just filled up.', { code: 'event_full' });
    const guest = (await tx.query<{ email: string; display_name: string }>(
      `SELECT email, display_name FROM accounts WHERE id = $1`, [acct.id],
    )).rows[0];

    if (existing) {
      if (['cancelled_by_guest', 'cancelled_by_host', 'declined'].includes(existing.status)) {
        const seatsNow = await seatCount(tx, ev.id);
        const again = decideTarget(ev.approval_required, seatsNow < ev.capacity, ev.waitlist_enabled);
        if (again === null) throw new HttpError(409, 'This event just filled up.', { code: 'event_full' });
        const pos = again === 'waitlisted' ? await nextWaitlistPosition(tx, ev.id) : null;
        const ticket = again === 'confirmed' ? await mintTicket(tx) : null;
        await tx.query(
          `UPDATE registrations SET status = $2, waitlist_position = $3, ticket_code = $4, checked_in_at = NULL, updated_at = now() WHERE id = $1`,
          [existing.id, again, pos, ticket],
        );
        await sendMail(tx, again === 'pending_approval' ? 'awaiting' : again === 'confirmed' ? 'confirmed' : 'waitlisted',
          ev, guest.email, guest.display_name, {
            ticketCode: ticket ?? undefined, position: pos ?? undefined,
            registrationId: existing.id, eventId: ev.id,
          });
        return { id: existing.id, status: again, ticket_code: ticket, waitlist_position: pos };
      }
      return { id: existing.id, status: existing.status, ticket_code: existing.ticket_code, waitlist_position: existing.waitlist_position };
    }

    const regId = `rg${shortId(14)}`;
    const position = target === 'waitlisted' ? await nextWaitlistPosition(tx, ev.id) : null;
    const ticket = target === 'confirmed' ? await mintTicket(tx) : null;
    await tx.query(
      `INSERT INTO registrations (id, event_id, account_id, status, waitlist_position, ticket_code)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [regId, ev.id, acct.id, target, position, ticket],
    );
    await sendMail(tx, target === 'pending_approval' ? 'awaiting' : target === 'confirmed' ? 'confirmed' : 'waitlisted',
      ev, guest.email, guest.display_name, {
        ticketCode: ticket ?? undefined, position: position ?? undefined,
        registrationId: regId, eventId: ev.id,
      });
    return { id: regId, status: target, ticket_code: ticket, waitlist_position: position };
  });
  log('registration_saved', { event: eventSlug, account: acct.id, status: result.status });
  return c.json(result, 201);
});

api.get('/registrations/me', async (c) => {
  const acct = account(c);
  const rows = await pool.query(
    `SELECT r.id, r.event_id, r.account_id, r.status, r.waitlist_position, r.ticket_code, r.checked_in_at,
            e.slug AS event_slug, e.title AS event_title, e.starts_at, e.ends_at, e.time_zone, e.city,
            e.theme_hex, e.cover_seed, e.capacity, e.state AS event_state
       FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE r.account_id = $1
      ORDER BY e.starts_at ASC`,
    [acct.id],
  );
  return c.json(rows.rows.map((r) => ({
    id: r.id,
    event_id: r.event_id,
    account_id: r.account_id,
    status: r.status,
    waitlist_position: r.waitlist_position,
    ticket_code: r.ticket_code,
    checked_in_at: iso(r.checked_in_at),
    event: {
      slug: r.event_slug,
      title: r.event_title,
      starts_at: iso(r.starts_at),
      ends_at: iso(r.ends_at),
      time_zone: r.time_zone,
      city: r.city,
      theme_hex: r.theme_hex,
      theme: themeTokens(r.theme_hex),
      cover_seed: r.cover_seed,
      capacity: r.capacity,
      state: r.event_state,
      ended: r.ends_at ? new Date(r.ends_at).getTime() < Date.now() : false,
    },
  })));
});

interface OwnerRegRow {
  id: string; event_id: string; account_id: string; status: string;
  waitlist_position: number | null; ticket_code: string | null; checked_in_at: Date | null;
  event_slug: string; title: string; starts_at: Date; time_zone: string;
  capacity: number; waitlist_enabled: boolean; event_state: 'draft' | 'published' | 'registration_closed' | 'cancelled';
  owner_account_id: string;
}

async function regForOwner(regId: string, acct: Account, tx: { query: typeof pool.query }): Promise<OwnerRegRow> {
  const res = await tx.query<OwnerRegRow>(
    `SELECT r.*, e.slug AS event_slug, e.title, e.starts_at, e.time_zone, e.capacity, e.waitlist_enabled,
            e.state AS event_state, c.owner_account_id
       FROM registrations r JOIN events e ON e.id = r.event_id JOIN calendars c ON c.id = e.calendar_id
      WHERE r.id = $1`,
    [regId],
  );
  const row = res.rows[0];
  if (!row) throw notFound('We could not find that registration.');
  if (row.owner_account_id !== acct.id) throw notFound('We could not find that registration.');
  return row;
}

function liteFrom(row: OwnerRegRow) {
  return {
    id: row.event_id, slug: row.event_slug, title: row.title, city: '',
    starts_at: row.starts_at, time_zone: row.time_zone, capacity: row.capacity,
    waitlist_enabled: row.waitlist_enabled, approval_required: false, state: row.event_state,
  };
}

api.post('/registrations/:id/cancel', async (c) => {
  const acct = account(c);
  const regId = c.req.param('id');
  const out = await withTransaction(async (tx) => {
    const res = await tx.query<OwnerRegRow & { account_id: string }>(
      `SELECT r.*, e.slug AS event_slug, e.title, e.starts_at, e.time_zone, e.capacity, e.waitlist_enabled,
              e.state AS event_state, c.owner_account_id
         FROM registrations r JOIN events e ON e.id = r.event_id JOIN calendars c ON c.id = e.calendar_id
        WHERE r.id = $1`,
      [regId],
    );
    const row = res.rows[0];
    if (!row) throw notFound('We could not find that registration.');
    if (row.account_id !== acct.id) throw notFound('We could not find that registration.');
    if (!['confirmed', 'waitlisted', 'pending_approval', 'checked_in'].includes(row.status)) {
      return { id: row.id, status: row.status, waitlist_position: row.waitlist_position, ticket_code: row.ticket_code, promoted: 0 };
    }
    await lockEvent(tx, row.event_id);
    await tx.query(
      `UPDATE registrations SET status = 'cancelled_by_guest', waitlist_position = NULL, ticket_code = NULL,
              checked_in_at = NULL, updated_at = now() WHERE id = $1`,
      [regId],
    );
    const promos = row.status === 'confirmed' && row.event_state !== 'registration_closed'
      ? await promoteFromWaitlist(tx, liteFrom(row))
      : [];
    if (promos.length === 0) await renumberWaitlist(tx, row.event_id);
    await mailPromoted(tx, liteFrom(row), promos);
    return { id: row.id, status: 'cancelled_by_guest', waitlist_position: null, ticket_code: null, promoted: promos.length };
  });
  log('registration_cancelled_by_guest', { id: regId, promoted: out.promoted });
  return c.json(out);
});

api.post('/registrations/:id/approve', async (c) => {
  const acct = account(c);
  const regId = c.req.param('id');
  const out = await withTransaction(async (tx) => {
    const row = await regForOwner(regId, acct, tx);
    if (row.status !== 'pending_approval') throw bad('Only a request awaiting the host can be approved.');
    await lockEvent(tx, row.event_id);
    const seats = await seatCount(tx, row.event_id);
    const guest = (await tx.query<{ email: string; display_name: string }>(
      `SELECT email, display_name FROM accounts WHERE id = $1`, [row.account_id],
    )).rows[0];
    let target: 'confirmed' | 'waitlisted';
    if (seats < row.capacity) target = 'confirmed';
    else if (row.waitlist_enabled) target = 'waitlisted';
    else throw new HttpError(409, 'This event just filled up, and the waiting list is off.', { code: 'event_full' });
    const position = target === 'waitlisted' ? await nextWaitlistPosition(tx, row.event_id) : null;
    const ticket = target === 'confirmed' ? await mintTicket(tx) : null;
    await tx.query(
      `UPDATE registrations SET status = $2, waitlist_position = $3, ticket_code = $4, updated_at = now() WHERE id = $1`,
      [regId, target, position, ticket],
    );
    await sendMail(tx, target === 'confirmed' ? 'approved' : 'waitlisted', liteFrom(row), guest.email, guest.display_name, {
      ticketCode: ticket ?? undefined, position: position ?? undefined, registrationId: regId, eventId: row.event_id,
    });
    return { id: regId, status: target, waitlist_position: position, ticket_code: ticket };
  });
  return c.json(out);
});

api.post('/registrations/:id/decline', async (c) => {
  const acct = account(c);
  const regId = c.req.param('id');
  const out = await withTransaction(async (tx) => {
    const row = await regForOwner(regId, acct, tx);
    if (row.status !== 'pending_approval') throw bad('Only a request awaiting the host can be declined.');
    await lockEvent(tx, row.event_id);
    const guest = (await tx.query<{ email: string; display_name: string }>(
      `SELECT email, display_name FROM accounts WHERE id = $1`, [row.account_id],
    )).rows[0];
    await tx.query(
      `UPDATE registrations SET status = 'declined', waitlist_position = NULL, ticket_code = NULL, updated_at = now() WHERE id = $1`,
      [regId],
    );
    await sendMail(tx, 'declined', liteFrom(row), guest.email, guest.display_name, { registrationId: regId, eventId: row.event_id });
    await renumberWaitlist(tx, row.event_id);
    return { id: regId, status: 'declined', waitlist_position: null, ticket_code: null };
  });
  return c.json(out);
});

// ---------- tickets ----------
api.get('/tickets/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();
  if (!TICKET_CODE_RE.test(code)) throw notFound('We could not find that ticket.');
  const res = await pool.query(
    `SELECT r.id, r.status, r.ticket_code, r.checked_in_at, r.waitlist_position,
            e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city, e.theme_hex, e.cover_seed, e.state
       FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE r.ticket_code = $1 AND r.status IN ('confirmed','checked_in')`,
    [code],
  );
  const row = res.rows[0];
  if (!row) throw notFound('We could not find that ticket.');
  return c.json({
    id: row.id,
    ticket_code: row.ticket_code,
    status: row.status,
    checked_in_at: iso(row.checked_in_at),
    event_slug: row.event_slug,
    title: row.title,
    starts_at: iso(row.starts_at),
    ends_at: iso(row.ends_at),
    time_zone: row.time_zone,
    city: row.city,
    theme_hex: row.theme_hex,
    theme: themeTokens(row.theme_hex),
    cover_seed: row.cover_seed,
    event_state: row.state,
  });
});

api.post('/tickets/:code/check-in', async (c) => {
  const acct = account(c);
  const code = c.req.param('code').toUpperCase();
  if (!TICKET_CODE_RE.test(code)) throw notFound('We could not find that ticket.');
  const out = await withTransaction(async (tx) => {
    const res = await tx.query<{ id: string; status: string; ticket_code: string; checked_in_at: Date | null; owner_account_id: string }>(
      `SELECT r.id, r.status, r.ticket_code, r.checked_in_at, c.owner_account_id
         FROM registrations r JOIN events e ON e.id = r.event_id JOIN calendars c ON c.id = e.calendar_id
        WHERE r.ticket_code = $1 AND r.status IN ('confirmed','checked_in')`,
      [code],
    );
    const row = res.rows[0];
    if (!row) throw notFound('We could not find that ticket.');
    if (row.owner_account_id !== acct.id) throw notFound('We could not find that ticket.');
    if (row.status === 'checked_in') {
      return { id: row.id, status: 'checked_in', ticket_code: row.ticket_code, checked_in_at: iso(row.checked_in_at), already_checked_in: true };
    }
    await tx.query(`UPDATE registrations SET status = 'checked_in', checked_in_at = now(), updated_at = now() WHERE id = $1`, [row.id]);
    const fresh = (await tx.query<{ checked_in_at: Date }>(`SELECT checked_in_at FROM registrations WHERE id = $1`, [row.id])).rows[0];
    return { id: row.id, status: 'checked_in', ticket_code: row.ticket_code, checked_in_at: iso(fresh.checked_in_at), already_checked_in: false };
  });
  return c.json(out);
});

// ---------- calendars ----------
api.get('/calendars', async (c) => {
  const acct = account(c);
  const res = await pool.query(
    `SELECT c.*, (SELECT count(*) FROM events e WHERE e.calendar_id = c.id AND e.state IN ('published','registration_closed'))::int AS published_count
       FROM calendars c WHERE c.owner_account_id = $1 ORDER BY c.created_at ASC`,
    [acct.id],
  );
  return c.json(res.rows);
});

api.post('/calendars', async (c) => {
  const acct = account(c);
  if (acct.role !== 'host') throw forbidden('A guest cannot create a calendar. Host accounts are seeded.');
  const b = await v.body(c.req);
  const name = v.str(b, 'name', { required: true, min: 2, max: 80, label: 'name' }) as string;
  const slug = v.str(b, 'slug', { required: true, min: 1, max: 60 }) as string;
  const category = v.str(b, 'category', { required: true }) as string;
  if (!(CATEGORIES as readonly string[]).includes(category)) {
    throw bad('Choose one of the twelve categories.', { category: 'Choose a listed category.' });
  }
  const city = v.str(b, 'city', { required: true, min: 2, max: 80, label: 'city' }) as string;
  const isPublic = v.bool(b, 'is_public', true) ?? true;
  const created = await withTransaction(async (tx) => {
    const { claimSlug } = await import('./namespace.js');
    await claimSlug(slug, 'the calendar address', tx, 'calendars');
    const res = await tx.query(
      `INSERT INTO calendars (id, owner_account_id, name, slug, category, city, is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [shortId(16), acct.id, name, slug, category, city, isPublic],
    );
    return res.rows[0];
  });
  log('calendar_created', { slug: created.slug, by: acct.id });
  return c.json(created, 201);
});

api.get('/calendars/:slug', async (c) => {
  const slug = c.req.param('slug');
  const viewer = c.get('account');
  const res = await pool.query(
    `SELECT c.*, a.handle AS owner_handle, a.display_name AS owner_name,
            (SELECT count(*) FROM events e WHERE e.calendar_id = c.id AND e.state IN ('published','registration_closed'))::int AS published_count
       FROM calendars c JOIN accounts a ON a.id = c.owner_account_id WHERE c.slug = $1`,
    [slug],
  );
  const cal = res.rows[0];
  if (!cal) throw notFound('We could not find that calendar.');
  if (!cal.is_public && cal.owner_account_id !== viewer?.id) throw notFound('We could not find that calendar.');
  const events = await pool.query<EventJoinRow>(
    `${EVENT_SELECT} WHERE e.calendar_id = $1 AND e.state IN ('published','registration_closed')
      ORDER BY e.starts_at ASC, e.slug ASC`,
    [cal.id],
  );
  return c.json({ ...cal, events: events.rows.map((r) => serializeEvent(r)) });
});

api.get('/shelves', async (c) => {
  const cals = await pool.query(
    `SELECT c.slug, c.name, c.category, c.city,
            (SELECT count(*) FROM events e WHERE e.calendar_id = c.id AND e.state IN ('published','registration_closed'))::int AS published_count
       FROM calendars c WHERE c.is_public ORDER BY published_count DESC, c.name ASC LIMIT 6`,
  );
  const evs = await pool.query<EventJoinRow>(
    `${EVENT_SELECT} WHERE e.state IN ('published','registration_closed') ORDER BY e.starts_at ASC, e.slug ASC LIMIT 22`,
  );
  return c.json({ calendars: cals.rows, events: evs.rows.map((r) => serializeEvent(r)) });
});

export default api;
export { hitRateLimit };
