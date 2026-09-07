import { Hono } from 'hono';
import type { Context } from 'hono';
import { pool, query, withTx } from './db.js';
import { env, log } from './env.js';
import {
  CATEGORIES,
  HttpError,
  RESERVED_PATHS,
  badRequest,
  csvCell,
  forbidden,
  hashPassword,
  isEmail,
  isIanaZone,
  isKebab,
  isoZ,
  kebab,
  notFound,
  parseInstant,
  signToken,
  themeFromSeed,
  unauthorized,
  verifyPassword,
  verifyToken,
} from './util.js';
import { mailRegistration, sendMail, subjectFor, bodyFor } from './mail.js';
import type { MailTask } from './logic.js';
import {
  approveRegistration,
  cancelOwnRegistration,
  checkInTicket,
  confirmedCount,
  declineRegistration,
  eventBrief,
  lockEventBySlug,
  promoteFromWaitlist,
  registerForEvent,
  assertOwner,
} from './logic.js';
import type { EventRow } from './logic.js';
import { deriveTheme } from './theme.js';

type Account = { id: string; email: string; display_name: string; handle: string; role: 'host' | 'guest' };
type Vars = { account?: Account };

export const api = new Hono<{ Variables: Vars }>();

async function flushMail(tasks: MailTask[]) {
  for (const t of tasks) {
    try {
      await mailRegistration(t.kind, t.event, t.recipient, t.registrationId, t.extra);
    } catch (e) {
      log('error', 'mail task failed', { kind: t.kind, to: t.recipient.email, err: String(e) });
    }
  }
}

async function currentAccount(c: Context<{ Variables: Vars }>): Promise<Account | null> {
  const header = c.req.header('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  const payload = verifyToken(m[1]);
  if (!payload) return null;
  const r = await query<Account>('SELECT id, email, display_name, handle, role FROM accounts WHERE id = $1', [payload.sub]);
  return r.rowCount ? r.rows[0] : null;
}

api.use('*', async (c, next) => {
  const acc = await currentAccount(c);
  if (acc) c.set('account', acc);
  await next();
});

function requireAuth(c: Context<{ Variables: Vars }>): Account {
  const acc = c.get('account');
  if (!acc) throw unauthorized();
  return acc;
}

function requireHost(c: Context<{ Variables: Vars }>): Account {
  const acc = requireAuth(c);
  if (acc.role !== 'host') throw notFound();
  return acc;
}

async function rateLimit(bucket: string, limit = 10) {
  await query("DELETE FROM auth_rate_limits WHERE hit_at < now() - interval '5 minutes'");
  const r = await query<{ n: string }>(
    "SELECT count(*)::int AS n FROM auth_rate_limits WHERE bucket = $1 AND hit_at > now() - interval '1 minute'",
    [bucket],
  );
  if (Number(r.rows[0].n) >= limit) {
    throw new HttpError(429, `Too many attempts. The rate limit is ${limit} requests per minute; wait a minute and try again.`);
  }
  await query('INSERT INTO auth_rate_limits (bucket) VALUES ($1)', [bucket]);
}

function body(c: Context): Promise<any> {
  return c.req.json().catch(() => {
    throw badRequest('The request body must be JSON.');
  });
}

function str(v: unknown, field: string, opts: { max?: number; min?: number; optional?: boolean } = {}): string {
  if (v === undefined || v === null) {
    if (opts.optional) return '';
    throw badRequest(`${field} is required.`, field);
  }
  if (typeof v !== 'string') throw badRequest(`${field} must be text.`, field);
  const t = v.trim();
  if (!opts.optional && t.length < (opts.min ?? 1)) throw badRequest(`${field} is required.`, field);
  if (opts.max && t.length > opts.max) throw badRequest(`${field} must be at most ${opts.max} characters.`, field);
  return t;
}

// ---------- health ----------

api.get('/health', async (c) => {
  try {
    await query('SELECT 1');
    return c.json({ status: 'ok', time: new Date().toISOString() });
  } catch {
    return c.json({ status: 'degraded' }, 503);
  }
});

// ---------- auth ----------

api.post('/auth/signup', async (c) => {
  const b = await body(c);
  const email = str(b.email, 'email', { max: 200 }).toLowerCase();
  if (!isEmail(email)) throw badRequest('Enter a valid email address.', 'email');
  const name = str(b.name, 'name', { max: 120 });
  if (name.length < 2) throw badRequest('Add your name so hosts know who is coming.', 'name');
  const password = str(b.password, 'password', { max: 200 });
  if (password.length < 8) throw badRequest('Use a password of at least 8 characters.', 'password');
  await rateLimit(`signup:${email}`);

  const exists = await query('SELECT 1 FROM accounts WHERE email = $1', [email]);
  if (exists.rowCount) throw badRequest('An account with that email already exists. Sign in instead.', 'email');

  let base = kebab(name) || 'guest';
  if (base.length < 2) base = `guest-${base}`;
  let handle = base;
  for (let i = 0; i < 200; i++) {
    if (!(await namespaceTaken(handle))) break;
    handle = `${base}-${i + 2}`;
  }
  const r = await query<Account>(
    `INSERT INTO accounts (email, password_hash, display_name, handle, role)
     VALUES ($1,$2,$3,$4,'guest') RETURNING id, email, display_name, handle, role`,
    [email, hashPassword(password), name, handle],
  );
  const acc = r.rows[0];
  log('info', 'account created', { id: acc.id, email: acc.email });
  return c.json({ ...acc, access_token: signToken(acc.id), token_type: 'bearer' }, 201);
});

api.post('/auth/login', async (c) => {
  const b = await body(c);
  const email = str(b.email, 'email', { max: 200 }).toLowerCase();
  const password = str(b.password, 'password', { max: 200 });
  await rateLimit(`login:${email}`);
  const r = await query<Account & { password_hash: string }>(
    'SELECT id, email, display_name, handle, role, password_hash FROM accounts WHERE email = $1',
    [email],
  );
  if (!r.rowCount || !verifyPassword(password, r.rows[0].password_hash)) {
    throw new HttpError(401, 'That email and password do not match an account. Check them and try again.');
  }
  const { password_hash, ...acc } = r.rows[0];
  return c.json({ access_token: signToken(acc.id), token_type: 'bearer', account: acc });
});

// ---------- namespace ----------

async function namespaceTaken(slug: string): Promise<boolean> {
  if (RESERVED_PATHS.includes(slug) || CATEGORIES.includes(slug)) return true;
  const r = await query(
    `SELECT 1 FROM events WHERE slug = $1
     UNION ALL SELECT 1 FROM calendars WHERE slug = $1
     UNION ALL SELECT 1 FROM accounts WHERE handle = $1 LIMIT 1`,
    [slug],
  );
  return (r.rowCount ?? 0) > 0;
}

api.get('/resolve/:slug', async (c) => {
  const slug = c.req.param('slug').toLowerCase();
  if (RESERVED_PATHS.includes(slug)) return c.json({ kind: 'system', slug });
  if (CATEGORIES.includes(slug)) return c.json({ kind: 'category', slug });
  const ev = await query('SELECT 1 FROM events WHERE slug = $1', [slug]);
  if (ev.rowCount) return c.json({ kind: 'event', slug });
  const cal = await query('SELECT 1 FROM calendars WHERE slug = $1', [slug]);
  if (cal.rowCount) return c.json({ kind: 'calendar', slug });
  const acc = await query('SELECT 1 FROM accounts WHERE handle = $1', [slug]);
  if (acc.rowCount) return c.json({ kind: 'account', slug });
  throw notFound();
});

// ---------- events ----------

function shapeEvent(row: any, extra: Record<string, unknown> = {}) {
  const confirmed = Number(row.confirmed_count ?? 0);
  const capacity = row.capacity === null ? null : Number(row.capacity);
  return {
    id: String(row.id),
    slug: row.slug,
    title: row.title,
    category: row.category,
    city: row.city,
    time_zone: row.time_zone,
    starts_at: isoZ(row.starts_at),
    ends_at: isoZ(row.ends_at),
    capacity,
    confirmed_count: confirmed,
    remaining: capacity === null ? null : Math.max(0, capacity - confirmed),
    state: row.state,
    theme_hex: row.theme_hex,
    cover_seed: row.cover_seed,
    calendar_slug: row.calendar_slug ?? null,
    calendar_name: row.calendar_name ?? null,
    calendar_is_public: row.calendar_is_public ?? null,
    has_ended: row.ends_at ? new Date(row.ends_at).getTime() < Date.now() : false,
    ...extra,
  };
}

const EVENT_SELECT = `
  SELECT e.*, cal.slug AS calendar_slug, cal.name AS calendar_name, cal.is_public AS calendar_is_public,
         cal.owner_account_id,
         (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in'))::int AS confirmed_count
    FROM events e JOIN calendars cal ON cal.id = e.calendar_id`;

api.get('/events', async (c) => {
  const q = c.req.query();
  const category = (q.category ?? '').trim().toLowerCase();
  const city = (q.city ?? '').trim();
  const term = (q.q ?? '').trim();
  let limit = q.limit === undefined ? 20 : Number(q.limit);
  let offset = q.offset === undefined ? 0 : Number(q.offset);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  const where: string[] = ["e.state IN ('published','registration_closed')"];
  const params: any[] = [];
  if (category && category !== 'all') {
    params.push(category);
    where.push(`lower(e.category) = $${params.length}`);
  }
  if (city) {
    params.push(`%${city.toLowerCase()}%`);
    where.push(`lower(e.city) LIKE $${params.length}`);
  }
  if (term) {
    params.push(`%${term.toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(`(lower(e.title) LIKE ${p} OR lower(e.description) LIKE ${p} OR lower(cal.name) LIKE ${p})`);
  }
  const whereSql = 'WHERE ' + where.join(' AND ');
  const total = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM events e JOIN calendars cal ON cal.id = e.calendar_id ${whereSql}`,
    params,
  );
  const rows = await query(
    `${EVENT_SELECT} ${whereSql} ORDER BY e.starts_at ASC, e.slug ASC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  c.header('X-Total-Count', String(total.rows[0].n));
  c.header('Access-Control-Expose-Headers', 'X-Total-Count');
  return c.json(rows.rows.map((r) => shapeEvent(r)));
});

async function loadEvent(slug: string) {
  const r = await query(`${EVENT_SELECT} WHERE e.slug = $1`, [slug]);
  if (!r.rowCount) throw notFound();
  return r.rows[0];
}

api.get('/events/:slug', async (c) => {
  const row = await loadEvent(c.req.param('slug'));
  const acc = c.get('account');
  const isOwner = !!acc && String(row.owner_account_id) === acc.id;
  if (row.state === 'draft' && !isOwner) throw notFound();
  let mine: any = null;
  if (acc) {
    const r = await query(
      'SELECT id, status, waitlist_position, ticket_code, checked_in_at FROM registrations WHERE event_id = $1 AND account_id = $2',
      [row.id, acc.id],
    );
    if (r.rowCount) {
      mine = {
        id: String(r.rows[0].id),
        status: r.rows[0].status,
        waitlist_position: r.rows[0].waitlist_position,
        ticket_code: r.rows[0].ticket_code,
        checked_in_at: isoZ(r.rows[0].checked_in_at),
      };
    }
  }
  return c.json(
    shapeEvent(row, {
      description: row.description,
      approval_required: row.approval_required,
      waitlist_enabled: row.waitlist_enabled,
      cancel_reason: row.cancel_reason,
      cancelled_at: isoZ(row.cancelled_at),
      published_at: isoZ(row.published_at),
      is_owner: isOwner,
      theme: deriveTheme(row.theme_hex),
      my_registration: mine,
    }),
  );
});

async function ownedCalendar(slug: string, accountId: string) {
  const r = await query<{ id: string; owner_account_id: string; category: string; city: string }>(
    'SELECT id, owner_account_id, category, city FROM calendars WHERE slug = $1',
    [slug],
  );
  if (!r.rowCount) throw badRequest('That calendar does not exist.', 'calendar_slug');
  if (r.rows[0].owner_account_id !== accountId) throw notFound();
  return r.rows[0];
}

function validateCategory(v: string, field = 'category'): string {
  const cat = v.toLowerCase();
  if (!CATEGORIES.includes(cat)) throw badRequest(`${field} must be one of the twelve categories.`, field);
  return cat;
}

api.post('/events', async (c) => {
  const acc = requireHost(c);
  const b = await body(c);
  const calendarSlug = str(b.calendar_slug, 'calendar_slug');
  const cal = await ownedCalendar(calendarSlug, acc.id);
  const title = str(b.title, 'title', { max: 160 });

  const category = b.category ? validateCategory(String(b.category)) : cal.category;
  const city = b.city ? str(b.city, 'city', { max: 120 }) : cal.city;
  const timeZone = b.time_zone ? str(b.time_zone, 'time_zone', { max: 80 }) : 'UTC';
  if (!isIanaZone(timeZone)) throw badRequest('time_zone must be an IANA zone name such as Europe/Berlin.', 'time_zone');
  const description = str(b.description, 'description', { optional: true, max: 4000 });

  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  if (b.starts_at) startsAt = parseInstant(b.starts_at, 'starts_at');
  if (b.ends_at) endsAt = parseInstant(b.ends_at, 'ends_at');
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime())
    throw badRequest('ends_at must come after starts_at.', 'ends_at');

  let capacity: number | null = null;
  if (b.capacity !== undefined && b.capacity !== null && b.capacity !== '') {
    capacity = Number(b.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500)
      throw badRequest('capacity must be a whole number from 1 to 500.', 'capacity');
  }

  let slug = b.slug ? kebab(String(b.slug)) : kebab(title);
  if (!slug || !isKebab(slug)) throw badRequest('The address must be kebab-case letters, digits and hyphens.', 'slug');
  if (await namespaceTaken(slug)) {
    if (b.slug) throw badRequest('That address is already taken.', 'slug');
    let candidate = slug;
    for (let i = 2; i < 500; i++) {
      candidate = `${slug}-${i}`;
      if (!(await namespaceTaken(candidate))) break;
    }
    slug = candidate;
  }

  const complete = !!(title && category && city && startsAt && endsAt && capacity);
  const state = complete ? 'published' : 'draft';
  const coverSeed = str(b.cover_seed, 'cover_seed', { optional: true, max: 80 }) || slug;
  const themeHex = themeFromSeed(coverSeed);

  const r = await query(
    `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex, description,
       starts_at, ends_at, capacity, approval_required, waitlist_enabled, state, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [
      cal.id,
      title,
      slug,
      category,
      city,
      timeZone,
      coverSeed,
      themeHex,
      description,
      startsAt,
      endsAt,
      capacity,
      b.approval_required === true,
      b.waitlist_enabled !== false,
      state,
      state === 'published' ? new Date() : null,
    ],
  );
  log('info', 'event created', { slug, state, host: acc.email });
  const row = await loadEvent(slug);
  return c.json(shapeEvent(row, { description: row.description, approval_required: row.approval_required, id: String(r.rows[0].id) }), 201);
});

api.patch('/events/:slug', async (c) => {
  const acc = requireHost(c);
  const b = await body(c);
  const slug = c.req.param('slug');

  const result = await withTx(async (client) => {
    const ev = await lockEventBySlug(client, slug);
    await assertOwner(client, ev, acc.id);
    const patch: Record<string, any> = {};
    const mails: MailTask[] = [];
    let detailsChanged = false;

    if (b.title !== undefined) patch.title = str(b.title, 'title', { max: 160 });
    if (b.description !== undefined) patch.description = str(b.description, 'description', { optional: true, max: 4000 });
    if (b.category !== undefined) patch.category = validateCategory(String(b.category));
    if (b.city !== undefined) {
      patch.city = str(b.city, 'city', { max: 120 });
      if (patch.city !== ev.city) detailsChanged = true;
    }
    if (b.time_zone !== undefined) {
      patch.time_zone = str(b.time_zone, 'time_zone', { max: 80 });
      if (!isIanaZone(patch.time_zone)) throw badRequest('time_zone must be an IANA zone name.', 'time_zone');
    }
    if (b.approval_required !== undefined) patch.approval_required = b.approval_required === true;
    if (b.waitlist_enabled !== undefined) patch.waitlist_enabled = b.waitlist_enabled === true;
    if (b.starts_at !== undefined) {
      patch.starts_at = parseInstant(b.starts_at, 'starts_at');
      if (!ev.starts_at || patch.starts_at.getTime() !== ev.starts_at.getTime()) detailsChanged = true;
    }
    if (b.ends_at !== undefined) {
      patch.ends_at = parseInstant(b.ends_at, 'ends_at');
      if (!ev.ends_at || patch.ends_at.getTime() !== ev.ends_at.getTime()) detailsChanged = true;
    }
    const nextStart = patch.starts_at ?? ev.starts_at;
    const nextEnd = patch.ends_at ?? ev.ends_at;
    if (nextStart && nextEnd && nextEnd.getTime() <= nextStart.getTime())
      throw badRequest('ends_at must come after starts_at.', 'ends_at');

    const held = await confirmedCount(client, ev.id);
    let raisedBy = 0;
    if (b.capacity !== undefined && b.capacity !== null) {
      const cap = Number(b.capacity);
      if (!Number.isInteger(cap) || cap < 1 || cap > 500)
        throw badRequest('capacity must be a whole number from 1 to 500.', 'capacity');
      if (cap < held) throw badRequest(`You already have ${held} guests confirmed.`, 'capacity');
      if (ev.capacity !== null && cap > ev.capacity) raisedBy = cap - ev.capacity;
      patch.capacity = cap;
    }

    if (b.state !== undefined) {
      const next = String(b.state);
      if (!['draft', 'published', 'registration_closed', 'cancelled'].includes(next))
        throw badRequest('state must be draft, published, registration_closed or cancelled.', 'state');
      if (next === 'cancelled') throw badRequest('Cancel an event through its cancel action with a reason.', 'state');
      if (ev.state === 'cancelled') throw badRequest('A cancelled event cannot move to another state.', 'state');
      if (next === 'draft' && ev.state !== 'draft')
        throw badRequest('A published event cannot be returned to draft.', 'state');
      if (next === 'registration_closed' && ev.state !== 'published' && ev.state !== 'registration_closed')
        throw badRequest('Registration can only be closed on a published event.', 'state');
      if (next === 'published' && ev.state === 'draft') {
        const title = patch.title ?? ev.title;
        const category = patch.category ?? ev.category;
        const city = patch.city ?? ev.city;
        const capacity = patch.capacity ?? ev.capacity;
        if (!title || !category || !city || !nextStart || !nextEnd || !capacity)
          throw badRequest('A published event needs a title, a category, a city, a start, an end and a capacity.', 'state');
        patch.published_at = new Date();
      }
      patch.state = next;
    }

    const keys = Object.keys(patch);
    if (keys.length) {
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      await client.query(`UPDATE events SET ${sets}, updated_at = now() WHERE id = $1`, [ev.id, ...keys.map((k) => patch[k])]);
    }

    const after = await lockEventBySlug(client, slug);
    let promoted: MailTask[] = [];
    if (raisedBy > 0 && after.state !== 'cancelled') {
      promoted = await promoteFromWaitlist(client, after, raisedBy);
      mails.push(...promoted);
    }
    if (detailsChanged) {
      const guests = await client.query<{ id: string; email: string; display_name: string }>(
        `SELECT r.id, a.email, a.display_name FROM registrations r JOIN accounts a ON a.id = r.account_id
          WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in')`,
        [ev.id],
      );
      for (const g of guests.rows) {
        mails.push({
          kind: 'event_updated',
          event: eventBrief(after),
          recipient: { email: g.email, display_name: g.display_name },
          registrationId: g.id,
          extra: {},
        });
      }
    }
    return { mails, promotedCount: promoted.length };
  });

  await flushMail(result.mails);
  const row = await loadEvent(slug);
  return c.json(
    shapeEvent(row, {
      description: row.description,
      approval_required: row.approval_required,
      waitlist_enabled: row.waitlist_enabled,
      promoted_count: result.promotedCount,
    }),
  );
});

api.post('/events/:slug/cancel', async (c) => {
  const acc = requireHost(c);
  const b = await body(c);
  const reason = str(b.reason ?? b.cancel_reason, 'reason', { max: 1000 });
  if (!reason) throw badRequest('A cancellation needs a reason for the guests.', 'reason');
  const slug = c.req.param('slug');

  const mails = await withTx(async (client) => {
    const ev = await lockEventBySlug(client, slug);
    await assertOwner(client, ev, acc.id);
    if (ev.state === 'cancelled') throw badRequest('This event has already been cancelled.', 'state');
    await client.query(
      `UPDATE events SET state = 'cancelled', cancelled_at = now(), cancel_reason = $2, updated_at = now() WHERE id = $1`,
      [ev.id, reason],
    );
    const guests = await client.query<{ id: string; email: string; display_name: string }>(
      `SELECT r.id, a.email, a.display_name FROM registrations r JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in','waitlisted','pending_approval')`,
      [ev.id],
    );
    const tasks: MailTask[] = guests.rows.map((g) => ({
      kind: 'event_cancelled' as const,
      event: eventBrief(ev),
      recipient: { email: g.email, display_name: g.display_name },
      registrationId: g.id,
      extra: { reason },
    }));
    return tasks;
  });
  await flushMail(mails);
  log('info', 'event cancelled', { slug, notified: mails.length });
  const row = await loadEvent(slug);
  return c.json(shapeEvent(row, { description: row.description, cancel_reason: row.cancel_reason, cancelled_at: isoZ(row.cancelled_at) }));
});

// ---------- guest list ----------

async function guestList(slug: string, accountId: string) {
  const row = await loadEvent(slug);
  if (String(row.owner_account_id) !== accountId) throw notFound();
  const r = await query(
    `SELECT r.id, r.account_id, a.email, a.display_name, r.status, r.waitlist_position, r.ticket_code, r.checked_in_at, r.created_at
       FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1
      ORDER BY r.status ASC, r.waitlist_position ASC NULLS LAST, a.email ASC`,
    [row.id],
  );
  return { row, rows: r.rows };
}

api.get('/events/:slug/registrations.csv', async (c) => {
  const acc = requireHost(c);
  const { row, rows } = await guestList(c.req.param('slug'), acc.id);
  const lines = ['email,display_name,status,waitlist_position,ticket_code'];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.email),
        csvCell(r.display_name),
        csvCell(r.status),
        csvCell(r.waitlist_position === null ? '' : String(r.waitlist_position)),
        csvCell(r.ticket_code ?? ''),
      ].join(','),
    );
  }
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${row.slug}.csv"`);
  return c.body(lines.join('\n') + '\n');
});

api.get('/events/:slug/registrations', async (c) => {
  const acc = requireHost(c);
  const { rows } = await guestList(c.req.param('slug'), acc.id);
  return c.json(
    rows.map((r: any) => ({
      id: String(r.id),
      account_id: String(r.account_id),
      email: r.email,
      display_name: r.display_name,
      status: r.status,
      waitlist_position: r.waitlist_position,
      ticket_code: r.ticket_code,
      checked_in_at: isoZ(r.checked_in_at),
      created_at: isoZ(r.created_at),
    })),
  );
});

// ---------- registrations ----------

function shapeRegistration(r: any, extra: Record<string, unknown> = {}) {
  return {
    id: String(r.id),
    event_id: String(r.event_id),
    account_id: String(r.account_id),
    status: r.status,
    waitlist_position: r.waitlist_position,
    ticket_code: r.ticket_code,
    checked_in_at: isoZ(r.checked_in_at),
    created_at: isoZ(r.created_at),
    ...extra,
  };
}

api.post('/registrations', async (c) => {
  const acc = requireAuth(c);
  const b = await body(c);
  const slug = str(b.event_slug, 'event_slug');
  await rateLimit(`registration:${acc.id}`);
  const outcome = await registerForEvent(acc.id, slug);
  await flushMail(outcome.mails);
  log('info', 'registration', { slug, account: acc.email, status: outcome.registration.status });
  return c.json(shapeRegistration(outcome.registration, { event_slug: slug }), 201);
});

api.get('/registrations/me', async (c) => {
  const acc = requireAuth(c);
  const r = await query(
    `SELECT r.*, e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city, e.theme_hex, e.cover_seed, e.state AS event_state
       FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE r.account_id = $1 ORDER BY e.starts_at ASC`,
    [acc.id],
  );
  return c.json(
    r.rows.map((row: any) =>
      shapeRegistration(row, {
        event_slug: row.event_slug,
        title: row.title,
        starts_at: isoZ(row.starts_at),
        ends_at: isoZ(row.ends_at),
        time_zone: row.time_zone,
        city: row.city,
        theme_hex: row.theme_hex,
        cover_seed: row.cover_seed,
        event_state: row.event_state,
      }),
    ),
  );
});

api.post('/registrations/:id/cancel', async (c) => {
  const acc = requireAuth(c);
  const outcome = await cancelOwnRegistration(acc.id, c.req.param('id'));
  await flushMail(outcome.mails);
  return c.json(shapeRegistration(outcome.registration));
});

api.post('/registrations/:id/approve', async (c) => {
  const acc = requireHost(c);
  const outcome = await approveRegistration(acc.id, c.req.param('id'));
  await flushMail(outcome.mails);
  return c.json(shapeRegistration(outcome.registration, { moved_to_waitlist: outcome.waitlisted }));
});

api.post('/registrations/:id/decline', async (c) => {
  const acc = requireHost(c);
  const outcome = await declineRegistration(acc.id, c.req.param('id'));
  await flushMail(outcome.mails);
  return c.json(shapeRegistration(outcome.registration));
});

// ---------- tickets ----------

api.get('/tickets/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const r = await query(
    `SELECT r.*, e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city, e.theme_hex, e.cover_seed, e.state AS event_state,
            a.display_name
       FROM registrations r JOIN events e ON e.id = r.event_id JOIN accounts a ON a.id = r.account_id
      WHERE r.ticket_code = $1`,
    [code],
  );
  if (!r.rowCount) throw notFound();
  const row = r.rows[0];
  return c.json({
    id: String(row.id),
    status: row.status,
    ticket_code: row.ticket_code,
    checked_in_at: isoZ(row.checked_in_at),
    event_slug: row.event_slug,
    title: row.title,
    starts_at: isoZ(row.starts_at),
    ends_at: isoZ(row.ends_at),
    time_zone: row.time_zone,
    city: row.city,
    theme_hex: row.theme_hex,
    cover_seed: row.cover_seed,
    event_state: row.event_state,
    display_name: row.display_name,
    theme: deriveTheme(row.theme_hex),
  });
});

api.post('/tickets/:code/check-in', async (c) => {
  const acc = requireHost(c);
  const out = await checkInTicket(acc.id, c.req.param('code').toUpperCase());
  return c.json(shapeRegistration(out.registration, { already_checked_in: out.alreadyIn }));
});

// ---------- calendars ----------

api.get('/calendars', async (c) => {
  const acc = requireAuth(c);
  const r = await query(
    `SELECT cal.*, (SELECT count(*) FROM events e WHERE e.calendar_id = cal.id AND e.state IN ('published','registration_closed'))::int AS published_count,
            (SELECT count(*) FROM events e WHERE e.calendar_id = cal.id)::int AS event_count
       FROM calendars cal WHERE cal.owner_account_id = $1 ORDER BY cal.created_at ASC`,
    [acc.id],
  );
  return c.json(
    r.rows.map((row: any) => ({
      id: String(row.id),
      owner_account_id: String(row.owner_account_id),
      name: row.name,
      slug: row.slug,
      category: row.category,
      city: row.city,
      is_public: row.is_public,
      published_count: row.published_count,
      event_count: row.event_count,
      created_at: isoZ(row.created_at),
    })),
  );
});

api.post('/calendars', async (c) => {
  const acc = requireHost(c);
  const b = await body(c);
  const name = str(b.name, 'name', { max: 120 });
  const slug = kebab(str(b.slug, 'slug', { max: 64 }));
  if (!isKebab(slug)) throw badRequest('The address must be kebab-case letters, digits and hyphens.', 'slug');
  if (await namespaceTaken(slug)) throw badRequest('That address is already taken.', 'slug');
  const category = validateCategory(str(b.category, 'category'));
  const city = str(b.city, 'city', { max: 120 });
  const r = await query(
    `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, slug, owner_account_id, name, category, city, is_public`,
    [acc.id, name, slug, category, city, b.is_public !== false],
  );
  const row = r.rows[0];
  return c.json({ ...row, id: String(row.id), owner_account_id: String(row.owner_account_id), published_count: 0, event_count: 0 }, 201);
});

api.get('/calendars/:slug', async (c) => {
  const r = await query(
    `SELECT cal.*, a.display_name AS owner_name, a.handle AS owner_handle FROM calendars cal
       JOIN accounts a ON a.id = cal.owner_account_id WHERE cal.slug = $1`,
    [c.req.param('slug')],
  );
  if (!r.rowCount) throw notFound();
  const cal = r.rows[0];
  const ev = await query(
    `${EVENT_SELECT} WHERE e.calendar_id = $1 AND e.state IN ('published','registration_closed') ORDER BY e.starts_at ASC`,
    [cal.id],
  );
  return c.json({
    id: String(cal.id),
    name: cal.name,
    slug: cal.slug,
    category: cal.category,
    city: cal.city,
    is_public: cal.is_public,
    owner_name: cal.owner_name,
    owner_handle: cal.owner_handle,
    events: ev.rows.map((e) => shapeEvent(e)),
  });
});

// ---------- categories & profiles ----------

api.get('/categories/:name', async (c) => {
  const name = c.req.param('name').toLowerCase();
  if (!CATEGORIES.includes(name)) throw notFound();
  const events = await query(
    `${EVENT_SELECT} WHERE e.state IN ('published','registration_closed') AND lower(e.category) = $1 ORDER BY e.starts_at ASC, e.slug ASC LIMIT 60`,
    [name],
  );
  const cals = await query(
    `SELECT cal.id, cal.name, cal.slug, cal.category, cal.city, cal.is_public,
            (SELECT count(*) FROM events e WHERE e.calendar_id = cal.id AND e.state IN ('published','registration_closed'))::int AS published_count
       FROM calendars cal WHERE cal.category = $1 ORDER BY cal.name ASC`,
    [name],
  );
  return c.json({
    category: name,
    event_count: events.rowCount,
    calendar_count: cals.rowCount,
    events: events.rows.map((e) => shapeEvent(e)),
    calendars: cals.rows.map((r: any) => ({ ...r, id: String(r.id) })),
  });
});

api.get('/accounts/handle/:handle', async (c) => {
  const r = await query<{ id: string; display_name: string; handle: string; role: string; created_at: Date }>(
    'SELECT id, display_name, handle, role, created_at FROM accounts WHERE handle = $1',
    [c.req.param('handle')],
  );
  if (!r.rowCount) throw notFound();
  const acc = r.rows[0];
  const cals = await query(
    `SELECT cal.id, cal.name, cal.slug, cal.category, cal.city, cal.is_public,
            (SELECT count(*) FROM events e WHERE e.calendar_id = cal.id AND e.state IN ('published','registration_closed'))::int AS published_count
       FROM calendars cal WHERE cal.owner_account_id = $1 AND cal.is_public = true ORDER BY cal.name ASC`,
    [acc.id],
  );
  return c.json({
    id: String(acc.id),
    display_name: acc.display_name,
    handle: acc.handle,
    role: acc.role,
    created_at: isoZ(acc.created_at),
    calendars: cals.rows.map((r2: any) => ({ ...r2, id: String(r2.id) })),
  });
});

api.get('/accounts/me', async (c) => {
  const acc = requireAuth(c);
  return c.json(acc);
});

api.patch('/accounts/me', async (c) => {
  const acc = requireAuth(c);
  const b = await body(c);
  const patch: Record<string, any> = {};
  if (b.display_name !== undefined) {
    const name = str(b.display_name, 'display_name', { max: 120 });
    if (name.length < 2) throw badRequest('Add your name so hosts know who is coming.', 'display_name');
    patch.display_name = name;
  }
  if (b.handle !== undefined) {
    const handle = str(b.handle, 'handle', { max: 64 }).toLowerCase();
    if (!isKebab(handle)) throw badRequest('A handle is lowercase letters, digits and single hyphens.', 'handle');
    if (handle !== acc.handle) {
      if (RESERVED_PATHS.includes(handle) || CATEGORIES.includes(handle) || (await namespaceTaken(handle)))
        throw badRequest('That handle is already taken.', 'handle');
      patch.handle = handle;
    }
  }
  const keys = Object.keys(patch);
  if (!keys.length) return c.json(acc);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const r = await query<Account>(`UPDATE accounts SET ${sets} WHERE id = $1 RETURNING id, email, display_name, handle, role`, [
    acc.id,
    ...keys.map((k) => patch[k]),
  ]);
  return c.json(r.rows[0]);
});

api.all('*', () => {
  throw notFound();
});
