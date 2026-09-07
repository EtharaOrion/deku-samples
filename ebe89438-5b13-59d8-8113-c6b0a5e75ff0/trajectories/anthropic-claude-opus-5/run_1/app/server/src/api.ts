import { Hono } from 'hono';
import { z } from 'zod';
import { attachCaller, requireCaller, requireHost } from './auth.js';
import { query, tx } from './db.js';
import { env, log } from './env.js';
import {
  CATEGORIES,
  hashPassword,
  isKebab,
  newCoverSeed,
  signToken,
  slugify,
  themeHexFromSeed,
  verifyPassword,
} from './domain.js';
import { AppError, badRequest, conflict, notFound, tooMany, unauthorized } from './errors.js';
import { hit, LIMIT } from './ratelimit.js';
import { isValidZone } from './timefmt.js';
import { namespaceConflict, resolveSlug } from './services/namespace.js';
import {
  cancelEvent,
  EVENT_FROM,
  EVENT_SELECT,
  registrationsCsv,
  toEventView,
  updateEvent,
} from './services/events.js';
import {
  approveRegistration,
  cancelOwnRegistration,
  checkInTicket,
  declineRegistration,
  registerForEvent,
} from './services/registrations.js';

export const api = new Hono();

api.use('*', attachCaller);

/* ---------------- health ---------------- */

api.get('/health', async (c) => {
  try {
    await query('SELECT 1');
    return c.json({ status: 'ok', ready: true });
  } catch (e) {
    return c.json({ status: 'unavailable', ready: false }, 503);
  }
});

/* ---------------- validation helpers ---------------- */

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (!r.success) {
    const issue = r.error.issues[0];
    const field = issue.path.join('.') || undefined;
    throw badRequest(issue.message, field);
  }
  return r.data;
}

async function jsonBody(c: any): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

const emailField = z
  .string({ message: 'Enter a valid email address.' })
  .trim()
  .min(3, 'Enter a valid email address.')
  .max(254, 'Enter a valid email address.')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.')
  .transform((s) => s.toLowerCase());

const passwordField = z
  .string({ message: 'Enter a password of at least 8 characters.' })
  .min(8, 'Enter a password of at least 8 characters.')
  .max(200, 'That password is too long.');

const rfc3339 = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/,
    'Give the time as an instant in UTC ending in Z.'
  );

/* ---------------- auth ---------------- */

async function uniqueHandleFrom(name: string, email: string): Promise<string> {
  const base = slugify(name) || slugify(email.split('@')[0]) || 'guest';
  let candidate = base.length >= 2 ? base : `${base}-guest`;
  for (let i = 0; i < 200; i++) {
    if (!(await namespaceConflict(null, candidate))) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

api.post('/auth/signup', async (c) => {
  const body = parse(
    z.object({
      email: emailField,
      password: passwordField,
      name: z
        .string({ message: 'Add your name so hosts know who is coming.' })
        .trim()
        .min(1, 'Add your name so hosts know who is coming.')
        .max(120, 'That name is too long.'),
    }),
    await jsonBody(c)
  );

  const gate = hit(`signup:${body.email}`);
  if (!gate.ok)
    throw tooMany(`Too many attempts. This endpoint accepts ${LIMIT} requests per minute.`, {
      limit: LIMIT,
      window_seconds: 60,
      retry_after_seconds: gate.retryAfter,
    });

  const exists = await query('SELECT 1 FROM accounts WHERE email = $1', [body.email]);
  if (exists.rowCount)
    throw conflict('An account already uses that email address. Sign in instead.', 'email');

  const handle = await uniqueHandleFrom(body.name, body.email);
  const r = await query<{ id: string; email: string; display_name: string; handle: string; role: string }>(
    `INSERT INTO accounts (email, password_hash, display_name, handle, role)
     VALUES ($1, $2, $3, $4, 'guest')
     RETURNING id, email, display_name, handle, role`,
    [body.email, hashPassword(body.password), body.name.trim(), handle]
  );
  const account = r.rows[0];
  const { token, expiresAt } = signToken({ sub: account.id }, env.jwtSecret);
  log('info', 'account.created', { account_id: account.id });
  return c.json({ ...account, access_token: token, token_type: 'bearer', expires_at: expiresAt }, 201);
});

api.post('/auth/login', async (c) => {
  const body = parse(
    z.object({ email: emailField, password: z.string().min(1, 'Enter your password.') }),
    await jsonBody(c)
  );
  const gate = hit(`login:${body.email}`);
  if (!gate.ok)
    throw tooMany(`Too many attempts. This endpoint accepts ${LIMIT} requests per minute.`, {
      limit: LIMIT,
      window_seconds: 60,
      retry_after_seconds: gate.retryAfter,
    });

  const r = await query<any>(
    'SELECT id, email, password_hash, display_name, handle, role FROM accounts WHERE email = $1',
    [body.email]
  );
  if (!r.rowCount || !verifyPassword(body.password, r.rows[0].password_hash))
    throw unauthorized('That email and password do not match an account. Check them and try again.');
  const a = r.rows[0];
  const { token, expiresAt } = signToken({ sub: a.id }, env.jwtSecret);
  return c.json({
    access_token: token,
    token_type: 'bearer',
    expires_at: expiresAt,
    account: { id: a.id, email: a.email, display_name: a.display_name, handle: a.handle, role: a.role },
  });
});

/* ---------------- resolve ---------------- */

api.get('/resolve/:slug', async (c) => {
  const out = await resolveSlug(c.req.param('slug'));
  if (!out.kind) throw notFound('Nothing lives at that address.');
  // A draft event is invisible to everyone but its host.
  if (out.kind === 'event') {
    const ev = await query<{ state: string; owner: string }>(
      `SELECT e.state, c.owner_account_id AS owner FROM events e
         JOIN calendars c ON c.id = e.calendar_id WHERE e.slug = $1`,
      [out.slug]
    );
    const caller = c.get('caller');
    if (ev.rows[0].state === 'draft' && ev.rows[0].owner !== caller?.id)
      throw notFound('Nothing lives at that address.');
  }
  return c.json(out);
});

api.get('/categories', (c) =>
  c.json(CATEGORIES.map((name) => ({ name })))
);

/* ---------------- events ---------------- */

api.get('/events', async (c) => {
  const q = c.req.query();
  const category = (q.category || '').trim().toLowerCase();
  const city = (q.city || '').trim();
  const term = (q.q || '').trim();
  const limit = Math.min(100, Math.max(1, Number.parseInt(q.limit || '20', 10) || 20));
  const offset = Math.max(0, Number.parseInt(q.offset || '0', 10) || 0);

  if (category && !(CATEGORIES as readonly string[]).includes(category))
    throw badRequest('That is not one of the twelve categories.', 'category');

  const where: string[] = [`e.state IN ('published','registration_closed')`];
  const params: unknown[] = [];
  if (category) {
    params.push(category);
    where.push(`e.category = $${params.length}`);
  }
  if (city) {
    params.push(city);
    where.push(`lower(e.city) = lower($${params.length})`);
  }
  if (term) {
    params.push(`%${term.replace(/[%_\\]/g, (m) => '\\' + m)}%`);
    const p = `$${params.length}`;
    where.push(
      `(e.title ILIKE ${p} ESCAPE '\\' OR e.description ILIKE ${p} ESCAPE '\\' OR c.name ILIKE ${p} ESCAPE '\\')`
    );
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const total = await query<{ n: string }>(
    `SELECT count(*)::text AS n ${EVENT_FROM} ${whereSql}`,
    params
  );
  const rows = await query(
    `SELECT ${EVENT_SELECT} ${EVENT_FROM} ${whereSql}
      ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  c.header('X-Total-Count', total.rows[0].n);
  c.header('Access-Control-Expose-Headers', 'X-Total-Count');
  return c.json(rows.rows.map((r) => toEventView(r)));
});

async function readableEvent(c: any, slug: string) {
  const r = await query(`SELECT ${EVENT_SELECT} ${EVENT_FROM} WHERE e.slug = $1`, [slug]);
  if (!r.rowCount) throw notFound('That event does not exist.');
  const row: any = r.rows[0];
  const caller = c.get('caller');
  const isOwner = !!caller && caller.id === row.owner_account_id;
  // A draft event answers everyone but its host exactly as a slug that never
  // existed answers.
  if (row.state === 'draft' && !isOwner) throw notFound('That event does not exist.');
  return { row, isOwner, caller };
}

api.get('/events/:slug', async (c) => {
  const { row, isOwner, caller } = await readableEvent(c, c.req.param('slug'));
  const view: any = toEventView(row, { detail: true });
  view.is_owner = isOwner;
  if (caller) {
    const mine = await query(
      `SELECT id, status, waitlist_position, ticket_code, checked_in_at
         FROM registrations WHERE event_id = $1 AND account_id = $2`,
      [row.id, caller.id]
    );
    view.my_registration = mine.rowCount ? mine.rows[0] : null;
  } else {
    view.my_registration = null;
  }
  return c.json(view);
});

const eventBody = z.object({
  calendar_slug: z.string().min(1, 'Choose the calendar this event belongs to.'),
  title: z.string().trim().max(160, 'That name is too long.').optional().default(''),
  category: z.string().trim().optional().default(''),
  city: z.string().trim().max(120, 'That city name is too long.').optional().default(''),
  time_zone: z.string().trim().optional().default('UTC'),
  starts_at: z.union([rfc3339, z.literal('')]).optional(),
  ends_at: z.union([rfc3339, z.literal('')]).optional(),
  capacity: z.union([z.number().int(), z.null()]).optional(),
  approval_required: z.boolean().optional().default(false),
  waitlist_enabled: z.boolean().optional().default(true),
  description: z.string().max(4000, 'That description is too long.').optional().default(''),
  slug: z.string().trim().optional(),
});

api.post('/events', async (c) => {
  const caller = requireHost(c);
  const body = parse(eventBody, await jsonBody(c));

  const cal = await query<{ id: string; owner_account_id: string; category: string; city: string }>(
    'SELECT id, owner_account_id, category, city FROM calendars WHERE slug = $1',
    [body.calendar_slug]
  );
  if (!cal.rowCount) throw badRequest('That calendar does not exist.', 'calendar_slug');
  if (cal.rows[0].owner_account_id !== caller.id)
    throw notFound('That calendar does not exist.');

  const category = body.category || cal.rows[0].category;
  if (category && !(CATEGORIES as readonly string[]).includes(category))
    throw badRequest('That is not one of the twelve categories.', 'category');
  if (body.time_zone && !isValidZone(body.time_zone))
    throw badRequest('That is not an IANA time zone name.', 'time_zone');
  if (body.capacity !== undefined && body.capacity !== null) {
    if (!Number.isInteger(body.capacity) || body.capacity < 1 || body.capacity > 500)
      throw badRequest('Capacity runs from 1 to 500.', 'capacity');
  }
  const startsAt = body.starts_at || null;
  const endsAt = body.ends_at || null;
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt))
    throw badRequest('The event has to end after it starts.', 'ends_at');

  // Publishing needs the whole set; anything missing is stored as a draft.
  const complete = !!(body.title && category && body.city && startsAt && endsAt && body.capacity);
  const state = complete ? 'published' : 'draft';

  const requested = (body.slug || slugify(body.title) || `event-${Date.now().toString(36)}`)
    .toLowerCase();
  if (!isKebab(requested))
    throw badRequest('An address is lower-case words joined by hyphens.', 'slug');
  const clash = await namespaceConflict(null, requested);
  if (clash) throw conflict('That address is already taken.', 'slug');

  const seed = newCoverSeed();
  const theme = themeHexFromSeed(seed);
  const r = await query(
    `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed,
        theme_hex, description, starts_at, ends_at, capacity, approval_required,
        waitlist_enabled, state, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id, slug, state, theme_hex, cover_seed, title, category, city, time_zone,
               starts_at, ends_at, capacity, approval_required, waitlist_enabled, description`,
    [
      cal.rows[0].id,
      body.title || 'Untitled event',
      requested,
      category || cal.rows[0].category,
      body.city || '',
      body.time_zone || 'UTC',
      seed,
      theme,
      body.description || '',
      startsAt,
      endsAt,
      body.capacity ?? null,
      body.approval_required ?? false,
      body.waitlist_enabled ?? true,
      state,
      state === 'published' ? new Date().toISOString() : null,
    ]
  );
  log('info', 'event.created', { slug: requested, state });
  return c.json({ ...r.rows[0], confirmed_count: 0, remaining: r.rows[0].capacity }, 201);
});

api.patch('/events/:slug', async (c) => {
  const caller = requireHost(c);
  const raw: any = await jsonBody(c);
  const patch = parse(
    z.object({
      title: z.string().trim().max(160).optional(),
      description: z.string().max(4000).optional(),
      city: z.string().trim().max(120).optional(),
      category: z.enum(CATEGORIES).optional(),
      time_zone: z.string().trim().optional(),
      starts_at: rfc3339.optional(),
      ends_at: rfc3339.optional(),
      capacity: z.number().int().optional(),
      approval_required: z.boolean().optional(),
      waitlist_enabled: z.boolean().optional(),
      state: z.enum(['draft', 'published', 'registration_closed', 'cancelled']).optional(),
    }),
    raw
  );
  if (patch.state === 'cancelled')
    throw badRequest('Calling an event off needs a reason; use the cancel endpoint.', 'state');
  if (patch.time_zone && !isValidZone(patch.time_zone))
    throw badRequest('That is not an IANA time zone name.', 'time_zone');

  const { event, promoted } = await updateEvent(c.req.param('slug'), caller.id, patch as any);
  const r = await query(`SELECT ${EVENT_SELECT} ${EVENT_FROM} WHERE e.id = $1`, [event.id]);
  const view: any = toEventView(r.rows[0], { detail: true });
  view.promoted_from_waitlist = promoted;
  view.is_owner = true;
  return c.json(view);
});

api.post('/events/:slug/cancel', async (c) => {
  const caller = requireHost(c);
  const body = parse(
    z.object({
      reason: z
        .string({ message: 'Say why the event is off so guests understand.' })
        .trim()
        .min(1, 'Say why the event is off so guests understand.')
        .max(1000, 'That reason is too long.'),
    }),
    await jsonBody(c)
  );
  const ev = await cancelEvent(c.req.param('slug'), caller.id, body.reason);
  const r = await query(`SELECT ${EVENT_SELECT} ${EVENT_FROM} WHERE e.id = $1`, [ev.id]);
  const view: any = toEventView(r.rows[0], { detail: true });
  view.is_owner = true;
  return c.json(view);
});

async function ownedEvent(c: any, slug: string) {
  const caller = requireCaller(c);
  const r = await query<any>(
    `SELECT e.id, e.slug, e.title, c.owner_account_id FROM events e
       JOIN calendars c ON c.id = e.calendar_id WHERE e.slug = $1`,
    [slug]
  );
  // A guest, another host and a stranger all meet the same refusal.
  if (!r.rowCount || r.rows[0].owner_account_id !== caller.id)
    throw notFound('That event does not exist.');
  return r.rows[0];
}

api.get('/events/:slug/registrations', async (c) => {
  const ev = await ownedEvent(c, c.req.param('slug'));
  const rows = await query(
    `SELECT r.id, r.account_id, a.email, a.display_name, r.status, r.waitlist_position,
            r.ticket_code, r.checked_in_at, r.created_at
       FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1
      ORDER BY r.status ASC, r.waitlist_position ASC NULLS LAST, a.email ASC`,
    [ev.id]
  );
  return c.json(rows.rows);
});

api.get('/events/:slug/registrations.csv', async (c) => {
  const ev = await ownedEvent(c, c.req.param('slug'));
  const csv = await registrationsCsv(ev.id);
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${ev.slug}.csv"`);
  return c.body(csv);
});

/* ---------------- registrations ---------------- */

api.post('/registrations', async (c) => {
  const caller = requireCaller(c);
  const body = parse(
    z.object({ event_slug: z.string().min(1, 'Name the event you want to join.') }),
    await jsonBody(c)
  );
  const gate = hit(`register:${caller.id}`);
  if (!gate.ok)
    throw tooMany(`Too many attempts. This endpoint accepts ${LIMIT} requests per minute.`, {
      limit: LIMIT,
      window_seconds: 60,
      retry_after_seconds: gate.retryAfter,
    });

  const reg = await registerForEvent(body.event_slug, caller);
  return c.json(
    {
      id: reg.id,
      event_id: reg.event_id,
      account_id: reg.account_id,
      status: reg.status,
      waitlist_position: reg.waitlist_position,
      ticket_code: reg.ticket_code,
    },
    201
  );
});

api.get('/registrations/me', async (c) => {
  const caller = requireCaller(c);
  const rows = await query(
    `SELECT r.id, r.status, r.waitlist_position, r.ticket_code, r.checked_in_at, r.created_at,
            e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city,
            e.theme_hex, e.cover_seed, e.state AS event_state, e.cancel_reason
       FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE r.account_id = $1
      ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC`,
    [caller.id]
  );
  return c.json(rows.rows);
});

api.post('/registrations/:id/cancel', async (c) => {
  const caller = requireCaller(c);
  const reg = await cancelOwnRegistration(c.req.param('id'), caller.id);
  return c.json({
    id: reg.id,
    status: reg.status,
    waitlist_position: reg.waitlist_position,
    ticket_code: reg.ticket_code,
  });
});

api.post('/registrations/:id/approve', async (c) => {
  const caller = requireHost(c);
  const out = await approveRegistration(c.req.param('id'), caller.id);
  return c.json({
    id: out.registration.id,
    status: out.registration.status,
    waitlist_position: out.registration.waitlist_position,
    ticket_code: out.registration.ticket_code,
    moved_to_waitlist: out.waitlisted,
  });
});

api.post('/registrations/:id/decline', async (c) => {
  const caller = requireHost(c);
  const reg = await declineRegistration(c.req.param('id'), caller.id);
  return c.json({ id: reg.id, status: reg.status, waitlist_position: null, ticket_code: null });
});

/* ---------------- tickets ---------------- */

api.post('/tickets/:code/check-in', async (c) => {
  const caller = requireHost(c);
  const out = await checkInTicket(c.req.param('code').toUpperCase(), caller.id);
  return c.json({
    id: out.registration.id,
    status: out.registration.status,
    ticket_code: out.registration.ticket_code,
    checked_in_at: out.registration.checked_in_at,
    already_checked_in: out.alreadyCheckedIn,
  });
});

api.get('/tickets/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const r = await query<any>(
    `SELECT r.id, r.status, r.ticket_code, r.checked_in_at, r.waitlist_position,
            e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city,
            e.theme_hex, e.cover_seed, e.state AS event_state,
            a.display_name AS guest_display_name
       FROM registrations r JOIN events e ON e.id = r.event_id
       JOIN accounts a ON a.id = r.account_id
      WHERE r.ticket_code = $1`,
    [code]
  );
  // The code itself is the credential; it carries the ticket and nothing else.
  if (!r.rowCount) throw notFound('No ticket carries that code.');
  return c.json(r.rows[0]);
});

/* ---------------- calendars ---------------- */

api.get('/calendars', async (c) => {
  const caller = requireCaller(c);
  const rows = await query(
    `SELECT c.id, c.name, c.slug, c.category, c.city, c.is_public, c.created_at,
            c.owner_account_id,
            (SELECT count(*) FROM events e WHERE e.calendar_id = c.id
               AND e.state IN ('published','registration_closed'))::int AS published_event_count,
            (SELECT count(*) FROM events e WHERE e.calendar_id = c.id)::int AS event_count
       FROM calendars c WHERE c.owner_account_id = $1 ORDER BY c.created_at ASC`,
    [caller.id]
  );
  return c.json(rows.rows);
});

api.post('/calendars', async (c) => {
  const caller = requireHost(c);
  const body = parse(
    z.object({
      name: z.string().trim().min(1, 'Give the calendar a name.').max(120, 'That name is too long.'),
      slug: z.string().trim().min(1, 'Give the calendar an address.').max(64),
      category: z.enum(CATEGORIES, { message: 'Choose one of the twelve categories.' }),
      city: z.string().trim().min(1, 'Say which city this calendar is in.').max(120),
      is_public: z.boolean().optional().default(true),
    }),
    await jsonBody(c)
  );
  const slug = body.slug.toLowerCase();
  if (!isKebab(slug))
    throw badRequest('An address is lower-case words joined by hyphens.', 'slug');
  if (await namespaceConflict(null, slug))
    throw conflict('That address is already taken.', 'slug');

  const r = await query(
    `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, owner_account_id, name, slug, category, city, is_public, created_at`,
    [caller.id, body.name, slug, body.category, body.city, body.is_public]
  );
  return c.json({ ...r.rows[0], published_event_count: 0, event_count: 0 }, 201);
});

api.get('/calendars/:slug', async (c) => {
  const caller = c.get('caller');
  const r = await query<any>(
    `SELECT c.id, c.name, c.slug, c.category, c.city, c.is_public, c.created_at,
            c.owner_account_id, a.handle AS owner_handle, a.display_name AS owner_display_name
       FROM calendars c JOIN accounts a ON a.id = c.owner_account_id WHERE c.slug = $1`,
    [c.req.param('slug')]
  );
  if (!r.rowCount) throw notFound('Nothing lives at that address.');
  const cal = r.rows[0];
  const isOwner = caller?.id === cal.owner_account_id;
  const states = isOwner
    ? ['draft', 'published', 'registration_closed', 'cancelled']
    : ['published', 'registration_closed', 'cancelled'];
  const events = await query(
    `SELECT ${EVENT_SELECT} ${EVENT_FROM} WHERE e.calendar_id = $1 AND e.state = ANY($2)
      ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC`,
    [cal.id, states]
  );
  return c.json({ ...cal, is_owner: isOwner, events: events.rows.map((x) => toEventView(x)) });
});

/* ---------------- accounts ---------------- */

api.get('/accounts/me', async (c) => {
  const caller = requireCaller(c);
  return c.json(caller);
});

api.patch('/accounts/me', async (c) => {
  const caller = requireCaller(c);
  const body = parse(
    z.object({
      display_name: z.string().trim().min(1, 'Add your name so hosts know who is coming.').max(120).optional(),
      handle: z.string().trim().max(64).optional(),
    }),
    await jsonBody(c)
  );
  const next: Record<string, unknown> = {};
  if (body.display_name !== undefined) next.display_name = body.display_name;
  if (body.handle !== undefined) {
    const handle = body.handle.toLowerCase();
    if (handle !== caller.handle) {
      if (!isKebab(handle))
        throw badRequest('A handle is lower-case words joined by hyphens.', 'handle');
      const clash = await namespaceConflict(null, handle, { table: 'accounts', id: caller.id });
      if (clash) throw conflict('That handle is already taken.', 'handle');
      next.handle = handle;
    }
  }
  if (!Object.keys(next).length) return c.json(caller);
  const keys = Object.keys(next);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const r = await query(
    `UPDATE accounts SET ${sets} WHERE id = $1
     RETURNING id, email, display_name, handle, role`,
    [caller.id, ...keys.map((k) => next[k])]
  );
  return c.json(r.rows[0]);
});

api.get('/accounts/:handle', async (c) => {
  const r = await query<any>(
    'SELECT id, display_name, handle, role, created_at FROM accounts WHERE handle = $1',
    [c.req.param('handle')]
  );
  if (!r.rowCount) throw notFound('Nothing lives at that address.');
  const account = r.rows[0];
  const calendars = await query(
    `SELECT c.name, c.slug, c.category, c.city, c.is_public,
            (SELECT count(*) FROM events e WHERE e.calendar_id = c.id
               AND e.state IN ('published','registration_closed'))::int AS published_event_count
       FROM calendars c WHERE c.owner_account_id = $1 AND c.is_public = true
       ORDER BY c.created_at ASC`,
    [account.id]
  );
  return c.json({ ...account, calendars: calendars.rows });
});

/* ---------------- category page data ---------------- */

api.get('/categories/:name', async (c) => {
  const name = c.req.param('name').toLowerCase();
  if (!(CATEGORIES as readonly string[]).includes(name))
    throw notFound('That is not one of the twelve categories.');
  const events = await query(
    `SELECT ${EVENT_SELECT} ${EVENT_FROM}
      WHERE e.category = $1 AND e.state IN ('published','registration_closed')
      ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC LIMIT 24`,
    [name]
  );
  const calendars = await query(
    `SELECT c.name, c.slug, c.category, c.city, c.is_public,
            (SELECT count(*) FROM events e WHERE e.calendar_id = c.id
               AND e.state IN ('published','registration_closed'))::int AS published_event_count
       FROM calendars c WHERE c.category = $1 AND c.is_public = true ORDER BY c.created_at ASC`,
    [name]
  );
  return c.json({
    name,
    event_count: events.rowCount,
    calendar_count: calendars.rowCount,
    events: events.rows.map((r) => toEventView(r)),
    calendars: calendars.rows,
  });
});

/* ---------------- landing data ---------------- */

api.get('/landing', async (c) => {
  const events = await query(
    `SELECT ${EVENT_SELECT} ${EVENT_FROM} WHERE e.state IN ('published','registration_closed')
      ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC LIMIT 22`,
    []
  );
  const calendars = await query(
    `SELECT c.name, c.slug, c.category, c.city, c.is_public,
            (SELECT count(*) FROM events e WHERE e.calendar_id = c.id
               AND e.state IN ('published','registration_closed'))::int AS published_event_count
       FROM calendars c WHERE c.is_public = true ORDER BY c.created_at ASC LIMIT 12`,
    []
  );
  return c.json({
    events: events.rows.map((r) => toEventView(r)),
    calendars: calendars.rows,
  });
});

/* ---------------- errors ---------------- */

api.notFound((c) => c.json({ message: 'Nothing lives at that address.' }, 404));

api.onError((err, c) => {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = { message: err.message };
    if (err.field) body.field = err.field;
    if (err.extra) Object.assign(body, err.extra);
    return c.json(body, err.status as any);
  }
  log('error', 'request.failed', {
    path: c.req.path,
    method: c.req.method,
    err: (err as Error).message,
  });
  return c.json({ message: 'Something went wrong on our side. Try that again in a moment.' }, 500);
});
