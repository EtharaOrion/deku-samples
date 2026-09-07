import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { CATEGORIES, EMAIL_RE, KEBAB_RE, RESERVED_PATHS } from './constants.js';
import { makeMailer } from './mailer.js';
import type { MailJob } from './mail.js';
import {
  approvedSubject, cancelledSubject, declinedSubject, eventBody, fmtDay, fmtTime,
  pendingSubject, queue, waitlistedSubject, flushMail, confirmedSubject,
} from './mail.js';
import { migrate } from './schema.js';
import { seed } from './seed.js';
import { checkRootSlug, deriveTheme, themeFromSeed } from './slug.js';
import { confirmedCount, promoteHead, promoteByRaise, waitlistBody } from './regwork.js';
import {
  ApiError, asDate, errResponse, isIanaZone, jsonOk, logger, newId, newTicketCode, slugify, toBool, toInt,
  toRfc3339Utc, utcNowRfc3339, withTransaction,
} from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBROOT = process.env.WEBROOT_DIR
  ? process.env.WEBROOT_DIR
  : (fs.existsSync(path.join(__dirname, '../web')) ? path.join(__dirname, '../web') : path.join(__dirname, '../../web'));
const PORT = parseInt(process.env.PORT || '4173', 10);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
const mailer = makeMailer();

type Ctx = { Variables: { account?: Account } };
type Account = { id: string; email: string; display_name: string; handle: string; role: string };

const app = new Hono<Ctx>();

/* Every thrown ApiError and every unexpected fault lands here, once. */
app.onError((err, c) => {
  const r = errResponse(err);
  if (r) return r as never;
  return c.text('Something went wrong on our side. Please try again.', 500);
});

/* ------------------------------------------------------------------ helpers */

function nowStr() { return utcNowRfc3339(); }

async function auth(c: any): Promise<Account | null> {
  const h = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  if (!m) return null;
  const r = await pool.query(
    'SELECT a.id, a.email, a.display_name, a.handle, a.role FROM auth_tokens t JOIN accounts a ON a.id = t.account_id WHERE t.token = $1',
    [m[1]],
  );
  return (r.rows[0] as Account) ?? null;
}

function requireAuth(c: any): Account {
  const a = c.get('account');
  if (!a) throw new ApiError(401, 'Please sign in to continue.');
  return a;
}

function requireHost(c: any): Account {
  const a = requireAuth(c);
  if (a.role !== 'host') throw new ApiError(403, 'Only a host can do that.');
  return a;
}

app.use('/api/*', async (c, next) => {
  try {
    const a = await auth(c);
    if (a) c.set('account', a);
  } catch { /* ignore */ }
  await next();
});

function accountOut(a: Account) {
  return { id: a.id, email: a.email, display_name: a.display_name, handle: a.handle, role: a.role };
}

function eventRowOut(r: any) {
  const confirmed = Number(r.confirmed_count ?? 0);
  return {
    id: r.id, slug: r.slug, title: r.title, category: r.category, city: r.city, time_zone: r.time_zone,
    cover_seed: r.cover_seed, theme_hex: r.theme_hex, description: r.description ?? '',
    starts_at: toRfc3339Utc(new Date(r.starts_at)), ends_at: toRfc3339Utc(new Date(r.ends_at)),
    capacity: r.capacity, approval_required: !!r.approval_required, waitlist_enabled: !!r.waitlist_enabled,
    state: r.state, published_at: r.published_at ? toRfc3339Utc(new Date(r.published_at)) : null,
    cancelled_at: r.cancelled_at ? toRfc3339Utc(new Date(r.cancelled_at)) : null,
    cancel_reason: r.cancel_reason ?? null,
    calendar_slug: r.calendar_slug, calendar_name: r.calendar_name, owner_handle: r.owner_handle,
    is_public_calendar: r.is_public_calendar === undefined ? undefined : !!r.is_public_calendar,
    confirmed_count: confirmed, remaining: Math.max(0, Number(r.capacity) - confirmed),
    is_past: new Date(r.ends_at).getTime() < Date.now(),
    theme: deriveTheme(r.theme_hex),
  };
}

const EVENT_SELECT = `SELECT e.*, c.slug AS calendar_slug, c.name AS calendar_name, c.owner_account_id AS owner_id,
    c.is_public AS is_public_calendar, a.handle AS owner_handle,
    (SELECT count(*)::int FROM registrations r WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in')) AS confirmed_count
  FROM events e JOIN calendars c ON c.id = e.calendar_id JOIN accounts a ON a.id = c.owner_account_id`;

/* ------------------------------------------------------------- rate limiting */

async function rateLimit(bucket: string, limit: number, windowSec: number): Promise<void> {
  await withTransaction(pool, async (c) => {
    await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [bucket]);
    const r = await c.query('SELECT window_start, count FROM rate_limits WHERE bucket = $1 FOR UPDATE', [bucket]);
    const now = Date.now();
    if (!r.rows[0]) {
      await c.query('INSERT INTO rate_limits (bucket, window_start, count) VALUES ($1,$2,1)', [bucket, toRfc3339Utc(new Date(now))]);
      return;
    }
    const start = new Date(r.rows[0].window_start).getTime();
    if (now - start >= windowSec * 1000) {
      await c.query('UPDATE rate_limits SET window_start = $2, count = 1 WHERE bucket = $1', [bucket, toRfc3339Utc(new Date(now))]);
      return;
    }
    const count = r.rows[0].count + 1;
    await c.query('UPDATE rate_limits SET count = $2 WHERE bucket = $1', [bucket, count]);
    if (count > limit) {
      throw new ApiError(429, `Too many requests. The limit is ${limit} requests per minute. Please wait a moment and try again.`);
    }
  });
}

/* ------------------------------------------------------------------ health */

app.get('/api/health', async (c) => {
  await pool.query('SELECT 1');
  return c.json({ status: 'ok', time: nowStr() });
});

/* -------------------------------------------------------------------- auth */

app.post('/api/auth/signup', async (c) => {
  return errResponse(await (async () => {
    const b = await readJson(c);
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!email) throw new ApiError(400, 'Enter a valid email address.', 'email');
    if (!EMAIL_RE.test(email)) throw new ApiError(400, 'Enter a valid email address.', 'email');
    if (!password || password.length < 6) throw new ApiError(400, 'Use a password of at least 6 characters.', 'password');
    if (!name) throw new ApiError(400, 'Add your name so hosts know who is coming.', 'name');
    const created = await withTransaction(pool, async (t) => {
      await t.query('SELECT pg_advisory_xact_lock(918273)');
      const ex = await t.query('SELECT id FROM accounts WHERE email = $1', [email]);
      if (ex.rows[0]) throw new ApiError(409, 'An account with that email already exists. Sign in instead.', 'email');
      let handle = slugify(name);
      if (!handle || handle.length < 3) handle = 'guest';
      let candidate = handle;
      for (let i = 0; ; i++) {
        const code = await checkRootSlug(t, candidate);
        if (!code) { handle = candidate; break; }
        candidate = `${handle}-${i + 2}`;
      }
      const id = newId('acc');
      const hash = await bcrypt.hash(password, 10);
      await t.query(
        'INSERT INTO accounts (id, email, password_hash, display_name, handle, role, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, email, hash, name, handle, 'guest', nowStr()],
      );
      return { id, handle };
    });
    logger({ msg: 'account_created', email });
    return jsonOk({ id: created.id, email, display_name: name, handle: created.handle, role: 'guest' }, 201);
  })());
});

app.post('/api/auth/login', async (c) => {
  return errResponse(await (async () => {
    const b = await readJson(c);
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!email || !EMAIL_RE.test(email)) throw new ApiError(400, 'Enter a valid email address.', 'email');
    if (!password) throw new ApiError(400, 'Enter your password.', 'password');
    await rateLimit(`login:${email}`, 10, 60);
    const r = await pool.query('SELECT * FROM accounts WHERE email = $1', [email]);
    const row = r.rows[0];
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      throw new ApiError(401, 'That email and password did not match. Check them and try again.');
    }
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('INSERT INTO auth_tokens (token, account_id, created_at) VALUES ($1,$2,$3)', [token, row.id, nowStr()]);
    logger({ msg: 'login', email });
    return jsonOk({
      access_token: token,
      account: { id: row.id, email: row.email, display_name: row.display_name, handle: row.handle, role: row.role },
    });
  })());
});

app.post('/api/auth/logout', async (c) => {
  return errResponse(await (async () => {
    const a = c.get('account');
    const h = c.req.header('authorization') || '';
    const m = /^Bearer\s+(.+)$/i.exec(h.trim());
    if (m) await pool.query('DELETE FROM auth_tokens WHERE token = $1', [m[1]]);
    if (a) logger({ msg: 'logout', email: a.email });
    return jsonOk({ ok: true });
  })());
});

app.get('/api/accounts/me', async (c) => {
  return errResponse(await (async () => {
    const a = requireAuth(c);
    return jsonOk(accountOut(a));
  })());
});

app.patch('/api/accounts/me', async (c) => {
  return errResponse(await (async () => {
    const a = requireAuth(c);
    const b = await readJson(c);
    const name = typeof b.display_name === 'string' ? b.display_name.trim() : undefined;
    const handle = typeof b.handle === 'string' ? b.handle.trim().toLowerCase() : undefined;
    if (name !== undefined && !name) throw new ApiError(400, 'Add your name so hosts know who is coming.', 'display_name');
    if (handle !== undefined && (!KEBAB_RE.test(handle) || handle.length < 3 || handle.length > 40)) {
      throw new ApiError(400, 'Use lower case letters, numbers and single hyphens.', 'handle');
    }
    await withTransaction(pool, async (t) => {
      await t.query('SELECT pg_advisory_xact_lock(918273)');
      if (handle !== undefined && handle !== a.handle) {
        const code = await checkRootSlug(t, handle, { table: 'accounts', col: 'handle', id: a.id });
        if (code) {
          const msg = code === 'taken' ? 'That handle is already taken.' :
            code === 'category' ? 'That handle is a category name. Choose another.' :
            'That handle is a reserved address. Choose another.';
          throw new ApiError(409, msg, 'handle');
        }
      }
      const newName = name ?? a.display_name;
      const newHandle = handle ?? a.handle;
      await t.query('UPDATE accounts SET display_name = $2, handle = $3 WHERE id = $1', [a.id, newName, newHandle]);
    });
    const r = await pool.query('SELECT id, email, display_name, handle, role FROM accounts WHERE id = $1', [a.id]);
    return jsonOk(accountOut(r.rows[0]));
  })());
});

/* ------------------------------------------------------------- root resolve */

app.get('/api/resolve/:slug', async (c) => {
  return errResponse(await (async () => {
    const slug = (c.req.param('slug') || '').toLowerCase();
    if ((RESERVED_PATHS as readonly string[]).includes(slug)) return jsonOk({ kind: 'system', slug });
    if ((CATEGORIES as readonly string[]).includes(slug)) return jsonOk({ kind: 'category', slug });
    const r = await pool.query(
      `SELECT 'event' AS kind FROM events WHERE slug = $1
       UNION ALL SELECT 'calendar' FROM calendars WHERE slug = $1
       UNION ALL SELECT 'account' FROM accounts WHERE handle = $1 LIMIT 1`, [slug]);
    if (r.rows[0]) return jsonOk({ kind: r.rows[0].kind, slug });
    return jsonOk({ kind: 'not_found', slug });
  })());
});

/* ----------------------------------------------------------------- events */

function parseFilters(c: any) {
  const category = (c.req.query('category') || '').trim().toLowerCase();
  const city = (c.req.query('city') || '').trim();
  const q0 = (c.req.query('q') || '');
  const q = q0.trim().length ? q0.trim() : null;
  let limit = toInt(c.req.query('limit')) ?? 20;
  let offset = toInt(c.req.query('offset')) ?? 0;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;
  if (offset < 0) offset = 0;
  return { category, city, q, limit, offset };
}

app.get('/api/events', async (c) => {
  return errResponse(await (async () => {
    const f = parseFilters(c);
    const where: string[] = [`e.state IN ('published','registration_closed')`];
    const vals: unknown[] = [];
    if (f.category && (CATEGORIES as readonly string[]).includes(f.category)) {
      vals.push(f.category); where.push(`e.category = $${vals.length}`);
    }
    if (f.city) {
      vals.push(f.city); where.push(`e.city ILIKE $${vals.length}`);
    }
    if (f.q) {
      vals.push(`%${f.q}%`); const p = `$${vals.length}`;
      where.push(`(e.title ILIKE ${p} OR e.description ILIKE ${p} OR c.name ILIKE ${p})`);
    }
    const whereSql = where.join(' AND ');
    const countR = await pool.query(
      `SELECT count(*)::int AS n FROM events e JOIN calendars c ON c.id = e.calendar_id WHERE ${whereSql}`, vals);
    const rows = await pool.query(
      `${EVENT_SELECT} WHERE ${whereSql} ORDER BY e.starts_at ASC, e.slug ASC LIMIT ${f.limit} OFFSET ${f.offset}`, vals);
    const body = rows.rows.map(eventRowOut);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'X-Total-Count': String(countR.rows[0].n) },
    });
  })());
});

async function loadEventBySlug(slug: string) {
  const r = await pool.query(`${EVENT_SELECT} WHERE e.slug = $1`, [slug]);
  return r.rows[0] ?? null;
}

app.get('/api/events/:slug', async (c) => {
  return errResponse(await (async () => {
    const row = await loadEventBySlug(c.req.param('slug'));
    if (!row) throw new ApiError(404, 'Page Not Found');
    const account = c.get('account');
    const isOwner = !!account && account.id === row.owner_id;
    if (row.state === 'draft' && !isOwner) throw new ApiError(404, 'Page Not Found');
    return jsonOk({ ...eventRowOut(row), is_owner: isOwner });
  })());
});

function validateEventBody(b: Record<string, unknown>, opts: { creating: boolean; existing?: any }) {
  const out: Record<string, unknown> = {};
  const errs: Array<[string, string]> = [];
  const has = (k: string) => b[k] !== undefined;
  const title = typeof b.title === 'string' ? b.title.trim() : undefined;
  if (has('title')) {
    if (!title) errs.push(['title', 'Give the event a name.']);
    else if (title.length > 140) errs.push(['title', 'Keep the name under 140 characters.']);
    else out.title = title;
  } else if (opts.creating) errs.push(['title', 'Give the event a name.']);

  const category = typeof b.category === 'string' ? b.category.trim().toLowerCase() : undefined;
  if (has('category')) {
    if (!(CATEGORIES as readonly string[]).includes(category as never)) errs.push(['category', 'Choose one of the twelve categories.']);
    else out.category = category;
  } else if (opts.creating) errs.push(['category', 'Choose one of the twelve categories.']);

  const city = typeof b.city === 'string' ? b.city.trim() : undefined;
  if (has('city')) {
    if (!city) errs.push(['city', 'Say where the event is held.']);
    else out.city = city;
  } else if (opts.creating) errs.push(['city', 'Say where the event is held.']);

  const tz = typeof b.time_zone === 'string' ? b.time_zone.trim() : undefined;
  if (has('time_zone')) {
    if (!isIanaZone(tz)) errs.push(['time_zone', 'Use an IANA zone name such as Europe/Berlin.']);
    else out.time_zone = tz;
  }

  const sd = has('starts_at') ? asDate(b.starts_at) : opts.creating ? null : (opts.existing ? new Date(opts.existing.starts_at) : null);
  const ed = has('ends_at') ? asDate(b.ends_at) : opts.creating ? null : (opts.existing ? new Date(opts.existing.ends_at) : null);
  if (has('starts_at')) {
    if (!sd) errs.push(['starts_at', 'Use a date and time with a zone, such as 2026-05-21T19:00:00Z.']);
    else out.starts_at = sd;
  } else if (opts.creating) errs.push(['starts_at', 'Use a date and time with a zone, such as 2026-05-21T19:00:00Z.']);
  if (has('ends_at')) {
    if (!ed) errs.push(['ends_at', 'Use a date and time with a zone, such as 2026-05-21T19:00:00Z.']);
    else out.ends_at = ed;
  } else if (opts.creating) errs.push(['ends_at', 'Use a date and time with a zone, such as 2026-05-21T19:00:00Z.']);
  if (sd && ed && ed.getTime() <= sd.getTime()) errs.push(['ends_at', 'The end must come after the start.']);

  const cap = has('capacity') ? toInt(b.capacity) : undefined;
  if (has('capacity')) {
    if (cap === null || cap === undefined || cap < 1 || cap > 500) errs.push(['capacity', 'Set a capacity from 1 to 500.']);
    else out.capacity = cap as number;
  } else if (opts.creating) errs.push(['capacity', 'Set a capacity from 1 to 500.']);

  const appr = toBool(b.approval_required, false);
  if (b.approval_required !== undefined) {
    if (appr === null) errs.push(['approval_required', 'Set approval on or off.']);
    else out.approval_required = appr;
  }
  const wl = toBool(b.waitlist_enabled, false);
  if (b.waitlist_enabled !== undefined) {
    if (wl === null) errs.push(['waitlist_enabled', 'Set the waiting list on or off.']);
    else out.waitlist_enabled = wl;
  }
  if (has('description')) {
    const d = b.description;
    if (typeof d !== 'string') errs.push(['description', 'Write the description as text.']);
    else out.description = d.trim();
  }
  return { out, errs };
}

app.post('/api/events', async (c) => {
  return errResponse(await (async () => {
    const a = requireHost(c);
    const b = await readJson(c);
    const calSlug = typeof b.calendar_slug === 'string' ? b.calendar_slug.trim() : '';
    if (!calSlug) throw new ApiError(400, 'Choose a calendar for the event.', 'calendar_slug');
    const { out, errs } = validateEventBody(b, { creating: true });
    if (errs.length) {
      throw new ApiError(400, errs[0][1], errs[0][0]);
    }
    const created = await withTransaction(pool, async (t) => {
      await t.query('SELECT pg_advisory_xact_lock(918273)');
      const cal = await t.query('SELECT * FROM calendars WHERE slug = $1 FOR UPDATE', [calSlug]);
      if (!cal.rows[0] || cal.rows[0].owner_account_id !== a.id) {
        throw new ApiError(403, 'That calendar is not yours. Choose one of your own.', 'calendar_slug');
      }
      const complete = !!out.title && !!out.category && !!out.city && !!out.starts_at && !!out.ends_at && out.capacity !== undefined;
      const state = complete ? 'published' : 'draft';
      let slug = slugify(String(out.title));
      if (!slug) slug = 'event';
      let finalSlug = slug, n = 1;
      while (await checkRootSlug(t, finalSlug)) {
        finalSlug = `${slug}-${++n}`;
      }
      const id = newId('evt');
      const coverSeed = finalSlug;
      const theme = themeFromSeed(coverSeed);
      await t.query(
        `INSERT INTO events (id, calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex, description,
           starts_at, ends_at, capacity, approval_required, waitlist_enabled, state, published_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)`,
        [id, cal.rows[0].id, out.title, finalSlug, out.category, out.city, out.time_zone ?? 'UTC', coverSeed, theme,
         out.description ?? '', out.starts_at, out.ends_at, out.capacity, !!out.approval_required, !!out.waitlist_enabled,
         state, state === 'published' ? nowStr() : null, nowStr()],
      );
      return { id, slug: finalSlug, theme_hex: theme, state };
    });
    logger({ msg: 'event_created', slug: created.slug, by: a.email });
    return jsonOk(created, 201);
  })());
});

app.patch('/api/events/:slug', async (c) => {
  return errResponse(await (async () => {
    const a = requireHost(c);
    const b = await readJson(c);
    const jobs: MailJob[] = [];
    const result = await withTransaction(pool, async (t) => {
      await t.query('SELECT pg_advisory_xact_lock(918273)');
      const ev = await getEventBySlugForUpdate(t, c.req.param('slug'));
      if (!ev) throw new ApiError(404, 'Page Not Found');
      if (ev.owner_account_id !== a.id) throw new ApiError(404, 'Page Not Found');
      if (ev.state === 'cancelled') throw new ApiError(409, 'A cancelled event cannot be edited. Create a new event instead.');

      const nextState = typeof b.state === 'string' ? b.state : undefined;
      if (nextState !== undefined && !['draft', 'published', 'registration_closed', 'cancelled'].includes(nextState)) {
        throw new ApiError(400, 'That is not a state an event can be set to.', 'state');
      }
      if (nextState === 'cancelled') throw new ApiError(400, 'To cancel an event use the cancel action and give a reason.', 'state');
      if (nextState === 'draft' && ev.state !== 'draft') throw new ApiError(409, 'A published event cannot go back to draft.', 'state');
      if (nextState === 'registration_closed' && ev.state !== 'published') {
        throw new ApiError(409, 'Only a published event can close registration.', 'state');
      }

      const { out, errs } = validateEventBody(b, { creating: false, existing: ev });
      if (errs.length) throw new ApiError(400, errs[0][1], errs[0][0]);
      if (nextState === 'published' && ev.state === 'draft') {
        const merged = { title: out.title ?? ev.title, category: out.category ?? ev.category, city: out.city ?? ev.city,
          starts_at: out.starts_at ?? new Date(ev.starts_at), ends_at: out.ends_at ?? new Date(ev.ends_at),
          capacity: (out.capacity as number) ?? ev.capacity };
        const missing = (!merged.title || !merged.category || !merged.city || !merged.starts_at || !merged.ends_at || merged.capacity === undefined)
          ? 'Publishing needs a name, a category, a city, a start, an end and a capacity.' : null;
        if (missing) throw new ApiError(400, missing, 'state');
      }

      const oldStart = new Date(ev.starts_at).getTime();
      const oldEnd = new Date(ev.ends_at).getTime();
      const oldCity = ev.city;
      const newStart = (out.starts_at as Date) ?? new Date(ev.starts_at);
      const newEnd = (out.ends_at as Date) ?? new Date(ev.ends_at);
      const newCity = (out.city as string) ?? ev.city;
      const timeOrPlaceChanged = newStart.getTime() !== oldStart || newEnd.getTime() !== oldEnd || newCity !== oldCity;

      let moved = 0;
      const newCap = out.capacity as number | undefined;
      if (newCap !== undefined && newCap !== ev.capacity) {
        const cc = await confirmedCount(t, ev.id);
        if (newCap < cc) {
          throw new ApiError(409, `You already have ${cc} guests confirmed.`, 'capacity');
        }
        if (newCap > ev.capacity && ev.state !== 'registration_closed') {
          moved = await promoteByRaise(t, { ...ev, capacity: newCap }, ev.capacity, newCap, jobs);
        }
      }

      const sets: string[] = ['updated_at = $1'];
      const vals: unknown[] = [nowStr()];
      const push = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
      if (out.title !== undefined) push('title', out.title);
      if (out.description !== undefined) push('description', out.description);
      if (out.city !== undefined) push('city', out.city);
      if (out.category !== undefined) push('category', out.category);
      if (out.time_zone !== undefined) push('time_zone', out.time_zone);
      if (out.starts_at !== undefined) push('starts_at', out.starts_at);
      if (out.ends_at !== undefined) push('ends_at', out.ends_at);
      if (newCap !== undefined) push('capacity', newCap);
      if (out.approval_required !== undefined) push('approval_required', out.approval_required);
      if (out.waitlist_enabled !== undefined) push('waitlist_enabled', out.waitlist_enabled);
      if (nextState === 'published' && ev.state === 'draft') push('published_at', nowStr());
      if (nextState) push('state', nextState);

      const u = await t.query(`UPDATE events SET ${sets.join(', ')} WHERE id = $${vals.length + 1} RETURNING id`, [...vals, ev.id]);
      if (!u.rows[0]) throw new ApiError(500, 'The event could not be updated. Please try again.');

      if (timeOrPlaceChanged) {
        const held = await t.query(
          `SELECT r.id, a.email, r.ticket_code FROM registrations r JOIN accounts a ON a.id = r.account_id
           WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in')`, [ev.id]);
        for (const row of held.rows) {
          queue(jobs, row.email,
            `${ev.title} has new details`,
            `${out.title ?? ev.title}\n${fmtDay(newStart.toISOString(), ev.time_zone)} at ${fmtTime(newStart.toISOString(), ev.time_zone)} (${ev.time_zone})\n${newCity}\nThe host changed the time or the place of this event. Your place is still held${row.ticket_code ? `, and your ticket code is still ${row.ticket_code}` : ''}.`,
            ev.id, row.id);
        }
      }
      return { ev, moved };
    });
    await flushMail(pool, mailer, jobs);
    const row = await loadEventBySlug(result.ev.slug);
    return jsonOk({ ...eventRowOut(row), moved_to_seats: result.moved });
  })());
});

async function getEventBySlugForUpdate(t: any, slug: string) {
  const r = await t.query(
    `SELECT e.*, c.slug AS calendar_slug, c.name AS calendar_name, c.owner_account_id, a.handle AS owner_handle, c.is_public AS is_public_calendar,
      (SELECT count(*)::int FROM registrations r WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in')) AS confirmed_count
     FROM events e JOIN calendars c ON c.id = e.calendar_id JOIN accounts a ON a.id = c.owner_account_id WHERE e.slug = $1 FOR UPDATE OF e`,
    [slug]);
  return r.rows[0] ?? null;
}

app.post('/api/events/:slug/cancel', async (c) => {
  return errResponse(await (async () => {
    const a = requireHost(c);
    const b = await readJson(c);
    const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
    if (!reason) throw new ApiError(400, 'Add a reason so guests know what happened.', 'reason');
    const jobs: MailJob[] = [];
    await withTransaction(pool, async (t) => {
      const ev = await getEventBySlugForUpdate(t, c.req.param('slug'));
      if (!ev) throw new ApiError(404, 'Page Not Found');
      if (ev.owner_account_id !== a.id) throw new ApiError(404, 'Page Not Found');
      if (ev.state === 'cancelled') throw new ApiError(409, 'This event is already cancelled.');
      await t.query(`UPDATE events SET state='cancelled', cancelled_at=$2, cancel_reason=$3, updated_at=$2 WHERE id=$1`, [ev.id, nowStr(), reason]);
      const held = await t.query(
        `SELECT r.id, a.email FROM registrations r JOIN accounts a ON a.id = r.account_id
         WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in','waitlisted','pending_approval')`, [ev.id]);
      for (const row of held.rows) {
        queue(jobs, row.email, cancelledSubject(ev.title),
          `${ev.title}\n${reason}\n\nThe host called this event off. You do not need to do anything; your place is released.`, ev.id, row.id);
      }
    });
    await flushMail(pool, mailer, jobs);
    const row = await loadEventBySlug(c.req.param('slug'));
    return jsonOk(eventRowOut(row));
  })());
});

/* ---------------------------------------------------- guest lists and CSV */

async function hostEventOr404(c: any, slug: string) {
  const a = requireHost(c);
  const ev = await loadEventBySlug(slug);
  if (!ev) throw new ApiError(404, 'Page Not Found');
  if (ev.owner_id !== a.id) throw new ApiError(404, 'Page Not Found');
  return ev;
}

function csvEscape(v: string | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const REG_SELECT = `SELECT r.id, r.account_id, a.email, a.display_name, r.status, r.waitlist_position, r.ticket_code, r.checked_in_at, r.created_at, r.updated_at
  FROM registrations r JOIN accounts a ON a.id = r.account_id`;

app.get('/api/events/:slug/registrations', async (c) => {
  return errResponse(await (async () => {
    const ev = await hostEventOr404(c, c.req.param('slug'));
    const r = await pool.query(`${REG_SELECT} WHERE r.event_id = $1 ORDER BY r.status ASC, r.waitlist_position ASC NULLS LAST, a.email ASC`, [ev.id]);
    return jsonOk(r.rows.map(regOut));
  })());
});

app.get('/api/events/:slug/registrations.csv', async (c) => {
  return errResponse(await (async () => {
    const ev = await hostEventOr404(c, c.req.param('slug'));
    const r = await pool.query(`${REG_SELECT} WHERE r.event_id = $1 ORDER BY r.status ASC, r.waitlist_position ASC NULLS LAST, a.email ASC`, [ev.id]);
    const lines = ['email,display_name,status,waitlist_position,ticket_code'];
    for (const row of r.rows) {
      lines.push([csvEscape(row.email), csvEscape(row.display_name), csvEscape(row.status), csvEscape(row.waitlist_position ?? ''), csvEscape(row.ticket_code ?? '')].join(','));
    }
    return new Response(lines.join('\n'), {
      status: 200,
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${ev.slug}.csv"` },
    });
  })());
});

function regOut(r: any) {
  return {
    id: r.id, account_id: r.account_id, email: r.email, display_name: r.display_name, status: r.status,
    waitlist_position: r.waitlist_position ?? null, ticket_code: r.ticket_code ?? null,
    event_id: r.event_id ?? null, event_slug: r.event_slug ?? null, title: r.title ?? null,
    starts_at: r.starts_at ? toRfc3339Utc(new Date(r.starts_at)) : null,
    ends_at: r.ends_at ? toRfc3339Utc(new Date(r.ends_at)) : null,
    time_zone: r.time_zone ?? null, city: r.city ?? null,
    checked_in_at: r.checked_in_at ? toRfc3339Utc(new Date(r.checked_in_at)) : null,
    created_at: r.created_at ? toRfc3339Utc(new Date(r.created_at)) : null,
    updated_at: r.updated_at ? toRfc3339Utc(new Date(r.updated_at)) : null,
    is_past: r.ends_at ? new Date(r.ends_at).getTime() < Date.now() : false,
  };
}

/* ------------------------------------------------------------ registration */

app.post('/api/registrations', async (c) => {
  return errResponse(await (async () => {
    const a = requireAuth(c);
    const b = await readJson(c);
    const slug = typeof b.event_slug === 'string' ? b.event_slug.trim() : '';
    if (!slug) throw new ApiError(400, 'Choose an event to register for.', 'event_slug');
    await rateLimit(`reg:${a.id}`, 10, 60);
    const jobs: MailJob[] = [];
    const out = await withTransaction(pool, async (t) => {
      const ev = await getEventBySlugForUpdate(t, slug);
      if (!ev || ev.state === 'draft') throw new ApiError(404, 'Page Not Found');
      if (ev.owner_account_id === a.id) throw new ApiError(409, 'You host this event, so you cannot register for it.');
      const existing = await t.query('SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2 FOR UPDATE', [ev.id, a.id]);

      const finish = async (status: string, pos: number | null, code: string | null) => {
        if (existing.rows[0]) {
          const u = await t.query(
            `UPDATE registrations SET status=$2, waitlist_position=$3, ticket_code=$4, updated_at=$5 WHERE id=$1 RETURNING *`,
            [existing.rows[0].id, status, pos, code, nowStr()]);
          return u.rows[0];
        }
        const id = newId('reg');
        const ins = await t.query(
          `INSERT INTO registrations (id, event_id, account_id, status, waitlist_position, ticket_code, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`, [id, ev.id, a.id, status, pos, code, nowStr()]);
        return ins.rows[0];
      };

      const wantSeat = async (free: number) => {
        if (free > 0) {
          const code = newTicketCode();
          const row = await finish('confirmed', null, code);
          queue(jobs, a.email, confirmedSubject(ev.title), eventBody(ev.title, toRfc3339Utc(new Date(ev.starts_at)), ev.time_zone, ev.city, `Your place is held. Your ticket code is ${code}.`), ev.id, row.id);
          return row;
        }
        if (ev.waitlist_enabled) {
          const n = await t.query(`SELECT count(*)::int AS n FROM registrations WHERE event_id=$1 AND status='waitlisted'`, [ev.id]);
          const pos: number = n.rows[0].n + 1;
          const row = await finish('waitlisted', pos, null);
          queue(jobs, a.email, waitlistedSubject(ev.title), waitlistBody({ id: ev.id, slug: ev.slug, title: ev.title, city: ev.city, time_zone: ev.time_zone, starts_at: ev.starts_at, capacity: ev.capacity, approval_required: ev.approval_required, waitlist_enabled: ev.waitlist_enabled, state: ev.state }, pos), ev.id, row.id);
          return row;
        }
        throw new ApiError(409, 'This event just filled up.', 'event_slug');
      };

      const ex0 = existing.rows[0];
      if (ev.state === 'cancelled') throw new ApiError(409, 'This event has been cancelled and takes no registrations.', 'event_slug');
      if (ev.state === 'registration_closed') throw new ApiError(409, 'Registration Is Closed. The host has stopped taking registrations for this event.', 'event_slug');
      const free = ev.capacity - (await confirmedCount(t, ev.id));

      if (!ex0) {
        if (ev.approval_required) {
          const row = await finish('pending_approval', null, null);
          queue(jobs, a.email, pendingSubject(ev.title), eventBody(ev.title, toRfc3339Utc(new Date(ev.starts_at)), ev.time_zone, ev.city, 'The host looks at every request by hand and will confirm your place soon.'), ev.id, row.id);
          return row;
        }
        return wantSeat(free);
      }

      const st = ex0.status;
      if (st === 'pending_approval') {
        return ex0;
      }
      if (st === 'confirmed' || st === 'checked_in') {
        return ex0;
      }
      if (st === 'waitlisted') {
        return ex0;
      }
      if (st === 'declined') {
        if (ev.approval_required) {
          const row = await finish('pending_approval', null, null);
          queue(jobs, a.email, pendingSubject(ev.title), eventBody(ev.title, toRfc3339Utc(new Date(ev.starts_at)), ev.time_zone, ev.city, 'The host looks at every request by hand and will confirm your place soon.'), ev.id, row.id);
          return row;
        }
        return wantSeat(free);
      }
      // cancelled_by_guest / cancelled_by_host: try again
      if (ev.approval_required) {
        const row = await finish('pending_approval', null, null);
        queue(jobs, a.email, pendingSubject(ev.title), eventBody(ev.title, toRfc3339Utc(new Date(ev.starts_at)), ev.time_zone, ev.city, 'The host looks at every request by hand and will confirm your place soon.'), ev.id, row.id);
        return row;
      }
      return wantSeat(free);
    });
    await flushMail(pool, mailer, jobs);
    return jsonOk(regOut(out), 201);
  })());
});

app.get('/api/registrations/me', async (c) => {
  return errResponse(await (async () => {
    const a = requireAuth(c);
    const r = await pool.query(
      `SELECT r.*, e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city, e.category, e.theme_hex, e.cover_seed, e.capacity
       FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.account_id = $1
       ORDER BY (r.status IN ('confirmed','checked_in','waitlisted','pending_approval')) DESC, e.starts_at ASC`, [a.id]);
    return jsonOk(r.rows.map(regOut));
  })());
});

app.post('/api/registrations/:id/cancel', async (c) => {
  return errResponse(await (async () => {
    const a = requireAuth(c);
    const id = c.req.param('id');
    const jobs: MailJob[] = [];
    const res = await withTransaction(pool, async (t) => {
      const r = await t.query(
        `SELECT r.*, e.slug AS event_slug, e.title, e.capacity, e.state, e.waitlist_enabled, e.time_zone, e.city, e.starts_at, c.owner_account_id
         FROM registrations r JOIN events e ON e.id = r.event_id JOIN calendars c ON c.id = e.calendar_id
         WHERE r.id = $1 FOR UPDATE OF r`, [id]);
      const row = r.rows[0];
      if (!row) throw new ApiError(404, 'Page Not Found');
      if (row.account_id !== a.id) throw new ApiError(404, 'Page Not Found');
      if (row.status === 'cancelled_by_guest' || row.status === 'cancelled_by_host') return row;
      if (row.status === 'declined') return row;
      const wasSeat = row.status === 'confirmed' || row.status === 'checked_in';
      await t.query(`UPDATE registrations SET status='cancelled_by_guest', waitlist_position=NULL, ticket_code=NULL, updated_at=$2 WHERE id=$1`, [id, nowStr()]);
      if (wasSeat && row.state !== 'registration_closed' && row.state !== 'cancelled') {
        const ev = { id: row.event_id, slug: row.event_slug, title: row.title, city: row.city, time_zone: row.time_zone, starts_at: row.starts_at, capacity: row.capacity, approval_required: false, waitlist_enabled: row.waitlist_enabled, state: row.state };
        await promoteHead(t, ev as never, jobs);
      }
      const after = await t.query(`SELECT r.*, e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.id = $1`, [id]);
      return after.rows[0];
    });
    await flushMail(pool, mailer, jobs);
    return jsonOk(regOut(res));
  })());
});

app.post('/api/registrations/:id/approve', async (c) => {
  return errResponse(await (async () => {
    const jobs: MailJob[] = [];
    const res = await withTransaction(pool, async (t) => {
      const a = requireHost(c);
      const id = c.req.param('id');
      const r = await t.query(
        `SELECT r.*, e.id AS ev_id, e.slug AS event_slug, e.title, e.capacity, e.state, e.waitlist_enabled, e.approval_required, e.time_zone, e.city, e.starts_at, c.owner_account_id
         FROM registrations r JOIN events e ON e.id = r.event_id JOIN calendars c ON c.id = e.calendar_id
         WHERE r.id = $1 FOR UPDATE OF r`, [id]);
      const row = r.rows[0];
      if (!row || row.owner_account_id !== a.id) throw new ApiError(404, 'Page Not Found');
      if (row.status !== 'pending_approval') return row;
      const ev = { id: row.ev_id, slug: row.event_slug, title: row.title, city: row.city, time_zone: row.time_zone, starts_at: row.starts_at, capacity: row.capacity, approval_required: row.approval_required, waitlist_enabled: row.waitlist_enabled, state: row.state };
      const email = await t.query('SELECT email FROM accounts WHERE id = $1', [row.account_id]);
      const to = email.rows[0].email;
      const free = row.capacity - (await confirmedCount(t, row.ev_id));
      let newStatus: string, pos: number | null = null, code: string | null = null;
      if (free > 0) {
        newStatus = 'confirmed'; code = newTicketCode();
        queue(jobs, to, approvedSubject(row.title), eventBody(row.title, toRfc3339Utc(new Date(row.starts_at)), row.time_zone, row.city, `Your request was approved. Your ticket code is ${code}.`), row.ev_id, row.id);
      } else if (row.waitlist_enabled) {
        const n = await t.query(`SELECT count(*)::int AS n FROM registrations WHERE event_id=$1 AND status='waitlisted'`, [row.ev_id]);
        newStatus = 'waitlisted'; pos = Number(n.rows[0].n) + 1;
        queue(jobs, to, waitlistedSubject(row.title), waitlistBody(ev, pos), row.ev_id, row.id);
      } else {
        throw new ApiError(409, 'This event just filled up.', 'status');
      }
      const u = await t.query(`UPDATE registrations SET status=$2, waitlist_position=$3, ticket_code=$4, updated_at=$5 WHERE id=$1 RETURNING *`, [id, newStatus, pos, code, nowStr()]);
      return u.rows[0];
    });
    await flushMail(pool, mailer, jobs);
    return jsonOk(regOut(res));
  })());
});

app.post('/api/registrations/:id/decline', async (c) => {
  return errResponse(await (async () => {
    const jobs: MailJob[] = [];
    const res = await withTransaction(pool, async (t) => {
      const a = requireHost(c);
      const id = c.req.param('id');
      const r = await t.query(
        `SELECT r.*, e.id AS ev_id, e.slug AS event_slug, e.title, e.starts_at, e.time_zone, e.city, c.owner_account_id
         FROM registrations r JOIN events e ON e.id = r.event_id JOIN calendars c ON c.id = e.calendar_id
         WHERE r.id = $1 FOR UPDATE OF r`, [id]);
      const row = r.rows[0];
      if (!row || row.owner_account_id !== a.id) throw new ApiError(404, 'Page Not Found');
      if (row.status !== 'pending_approval') return row;
      await t.query(`UPDATE registrations SET status='declined', waitlist_position=NULL, ticket_code=NULL, updated_at=$2 WHERE id=$1`, [id, nowStr()]);
      const email = await t.query('SELECT email FROM accounts WHERE id = $1', [row.account_id]);
      queue(jobs, email.rows[0].email, declinedSubject(row.title), eventBody(row.title, toRfc3339Utc(new Date(row.starts_at)), row.time_zone, row.city, 'The host is not able to take this request. You are welcome to look for another evening.'), row.ev_id, row.id);
      const after = await t.query(`SELECT r.*, e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.id = $1`, [id]);
      return after.rows[0];
    });
    await flushMail(pool, mailer, jobs);
    return jsonOk(regOut(res));
  })());
});

/* ---------------------------------------------------------------- tickets */

app.post('/api/tickets/:code/check-in', async (c) => {
  return errResponse(await (async () => {
    const jobs: MailJob[] = [];
    const res = await withTransaction(pool, async (t) => {
      const a = requireHost(c);
      const code = c.req.param('code').toUpperCase();
      const r = await t.query(
        `SELECT r.*, e.id AS ev_id, e.slug AS event_slug, e.title, e.starts_at, e.time_zone, e.city, c.owner_account_id
         FROM registrations r JOIN events e ON e.id = r.event_id JOIN calendars c ON c.id = e.calendar_id
         WHERE UPPER(r.ticket_code) = $1 FOR UPDATE OF r`, [code]);
      const row = r.rows[0];
      if (!row || row.owner_account_id !== a.id) throw new ApiError(404, 'Page Not Found');
      if (row.status === 'checked_in') return { already: true, row };
      if (row.status !== 'confirmed') throw new ApiError(409, 'That ticket does not hold a seat.', 'ticket_code');
      const u = await t.query(`UPDATE registrations SET status='checked_in', checked_in_at=$2, updated_at=$2 WHERE id=$1 RETURNING *`, [row.id, nowStr()]);
      return { already: false, row: u.rows[0] };
    });
    await flushMail(pool, mailer, jobs);
    const out = await pool.query(`SELECT r.*, e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.id = $1`, [res.row.id]);
    return jsonOk({ ...regOut(out.rows[0]), already_checked_in: res.already });
  })());
});

app.get('/api/tickets/:code', async (c) => {
  return errResponse(await (async () => {
    const code = c.req.param('code').toUpperCase();
    const r = await pool.query(
      `SELECT r.id, r.status, r.ticket_code, r.checked_in_at, r.waitlist_position, e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city, e.theme_hex, e.cover_seed
       FROM registrations r JOIN events e ON e.id = r.event_id WHERE UPPER(r.ticket_code) = $1`, [code]);
    if (!r.rows[0]) throw new ApiError(404, 'Page Not Found');
    const row = r.rows[0];
    return jsonOk({
      id: row.id, status: row.status, ticket_code: row.ticket_code, checked_in_at: row.checked_in_at ? toRfc3339Utc(new Date(row.checked_in_at)) : null,
      event_slug: row.event_slug, title: row.title, starts_at: toRfc3339Utc(new Date(row.starts_at)), ends_at: toRfc3339Utc(new Date(row.ends_at)),
      time_zone: row.time_zone, city: row.city, theme: deriveTheme(row.theme_hex), cover_seed: row.cover_seed, description: '',
    });
  })());
});

/* -------------------------------------------------------------- calendars */

app.get('/api/calendars', async (c) => {
  return errResponse(await (async () => {
    const a = requireAuth(c);
    const r = await pool.query(
      `SELECT c.*, (SELECT count(*)::int FROM events e WHERE e.calendar_id = c.id AND e.state IN ('published','registration_closed')) AS published_events
       FROM calendars c WHERE c.owner_account_id = $1 ORDER BY c.created_at ASC`, [a.id]);
    return jsonOk(r.rows.map((row) => ({
      id: row.id, owner_account_id: row.owner_account_id, name: row.name, slug: row.slug, category: row.category,
      city: row.city, is_public: row.is_public, created_at: toRfc3339Utc(new Date(row.created_at)), published_events: row.published_events,
    })));
  })());
});

app.get('/api/calendars/public', async (c) => {
  return errResponse(await (async () => {
    const r = await pool.query(
      `SELECT c.*, a.handle AS owner_handle, (SELECT count(*)::int FROM events e WHERE e.calendar_id = c.id AND e.state IN ('published','registration_closed')) AS published_events
       FROM calendars c JOIN accounts a ON a.id = c.owner_account_id WHERE c.is_public = TRUE ORDER BY c.created_at ASC LIMIT 24`);
    return jsonOk(r.rows);
  })());
});

app.get('/api/calendars/by-category/:category', async (c) => {
  return errResponse(await (async () => {
    const cat = (c.req.param('category') || '').toLowerCase();
    const r = await pool.query(
      `SELECT c.*, a.handle AS owner_handle,
        (SELECT count(*)::int FROM events e WHERE e.calendar_id = c.id AND e.state IN ('published','registration_closed')) AS published_events,
        (SELECT count(*)::int FROM events e WHERE e.calendar_id = c.id AND e.state IN ('published','registration_closed')) AS event_count
       FROM calendars c JOIN accounts a ON a.id = c.owner_account_id WHERE c.category = $1 AND c.is_public = TRUE
       ORDER BY published_events DESC, c.created_at ASC`, [cat]);
    return jsonOk(r.rows.map((row) => ({
      id: row.id, name: row.name, slug: row.slug, category: row.category, city: row.city, is_public: row.is_public,
      owner_handle: row.owner_handle, published_events: row.published_events, event_count: row.event_count,
    })));
  })());
});

app.post('/api/calendars', async (c) => {
  return errResponse(await (async () => {
    const a = requireHost(c);
    const b = await readJson(c);
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const slug = typeof b.slug === 'string' ? b.slug.trim().toLowerCase() : '';
    const category = typeof b.category === 'string' ? b.category.trim().toLowerCase() : '';
    const city = typeof b.city === 'string' ? b.city.trim() : '';
    const isPublic = toBool(b.is_public, true);
    if (!name) throw new ApiError(400, 'Give the calendar a name.', 'name');
    if (!slug || !KEBAB_RE.test(slug)) throw new ApiError(400, 'Use lower case letters, numbers and single hyphens.', 'slug');
    if (!(CATEGORIES as readonly string[]).includes(category)) throw new ApiError(400, 'Choose one of the twelve categories.', 'category');
    if (!city) throw new ApiError(400, 'Say where the calendar is based.', 'city');
    if (isPublic === null) throw new ApiError(400, 'Say whether the calendar is public.', 'is_public');
    const id = await withTransaction(pool, async (t) => {
      await t.query('SELECT pg_advisory_xact_lock(918273)');
      const code = await checkRootSlug(t, slug);
      if (code) {
        const msg = code === 'taken' ? 'That address is already taken.' :
          code === 'category' ? 'That address is a category name. Choose another.' :
          'That address is reserved. Choose another.';
        throw new ApiError(409, msg, 'slug');
      }
      const id = newId('cal');
      await t.query(
        'INSERT INTO calendars (id, owner_account_id, name, slug, category, city, is_public, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, a.id, name, slug, category, city, isPublic, nowStr()]);
      return id;
    });
    return jsonOk({ id, slug, owner_account_id: a.id, name, category, city, is_public: isPublic }, 201);
  })());
});

app.get('/api/calendars/:slug', async (c) => {
  return errResponse(await (async () => {
    const slug = c.req.param('slug');
    const r = await pool.query(
      `SELECT c.*, a.display_name AS owner_name, a.handle AS owner_handle,
        (SELECT count(*)::int FROM events e WHERE e.calendar_id = c.id AND e.state IN ('published','registration_closed')) AS published_events
       FROM calendars c JOIN accounts a ON a.id = c.owner_account_id WHERE c.slug = $1`, [slug]);
    if (!r.rows[0]) throw new ApiError(404, 'Page Not Found');
    const row = r.rows[0];
    const events = await pool.query(
      `${EVENT_SELECT} WHERE e.calendar_id = $1 AND e.state IN ('published','registration_closed') ORDER BY e.starts_at ASC`,
      [row.id]);
    return jsonOk({
      id: row.id, name: row.name, slug: row.slug, category: row.category, city: row.city, is_public: row.is_public,
      owner_name: row.owner_name, owner_handle: row.owner_handle, published_events: row.published_events,
      events: events.rows.map(eventRowOut),
    });
  })());
});

/* ------------------------------------------------------------------ static */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

const INDEX_HTML = fs.existsSync(path.join(WEBROOT, 'index.html')) ? fs.readFileSync(path.join(WEBROOT, 'index.html'), 'utf8') : '<!doctype html><title>App</title>';

const PATH_CACHE: Map<string, { body: string | null }> = new Map();

/**
 * The shell document for an event address already carries that event's theme,
 * so the first paint is in the event's colours rather than a default palette.
 */
async function themedShell(slug: string): Promise<string> {
  try {
    const r = await pool.query(
      `SELECT e.state, e.theme_hex, e.slug FROM events e
       WHERE e.slug = $1 AND e.state IN ('published','registration_closed','cancelled')`,
      [slug],
    );
    const row = r.rows[0];
    if (!row || row.state === 'draft') return INDEX_HTML;
    const t = deriveTheme(row.theme_hex);
    return INDEX_HTML.replace(
      '</head>',
      `<style id="event-theme">:root{--arrival-theme:${t.ground};--arrival-ink:${t.ink}}` +
      `html{background:${t.ground}}body{background:${t.ground};color:${t.ink}}</style>` +
      `<meta name="theme-color" content="${t.ground}"></head>`,
    );
  } catch {
    return INDEX_HTML;
  }
}

app.get('*', async (c) => {
  const raw = decodeURIComponent(new URL(c.req.url).pathname);
  let p = raw.split('?')[0];
  if (p.endsWith('/')) p = p.slice(0, -1);
  const file = path.normalize(path.join(WEBROOT, p));
  if (file.startsWith(WEBROOT) && p && fs.existsSync(file) && fs.statSync(file).isFile()) {
    const ext = path.extname(file).toLowerCase();
    return new Response(fs.readFileSync(file), { headers: { 'content-type': MIME[ext] || 'application/octet-stream' } });
  }
  // a real static file always wins; only then does the event shell get themed
  const segs = p.split('/').filter(Boolean);
  if (segs.length === 1) {
    const slug = segs[0].toLowerCase();
    const known = (RESERVED_PATHS as readonly string[]).includes(slug) || (CATEGORIES as readonly string[]).includes(slug);
    if (!known) {
      const body = await themedShell(slug);
      return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
  }
  return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
});

async function readJson(c: any): Promise<Record<string, unknown>> {
  try {
    const j = await c.req.json();
    return (j && typeof j === 'object') ? j : {};
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------- start */

async function main() {
  let tries = 0;
  for (;;) {
    try {
      await migrate(pool);
      break;
    } catch (e) {
      tries++;
      if (tries > 30) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  await seed(pool);
  logger({ msg: 'ready', webroot: WEBROOT, port: PORT });
  const server = serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
    logger({ msg: 'listening', address: info.address, port: info.port });
  });
  process.on('SIGTERM', () => { server.close(); process.exit(0); });
  process.on('SIGINT', () => { server.close(); process.exit(0); });
}

main().catch((e) => {
  logger({ level: 'error', msg: 'fatal', error: String(e && e.stack ? e.stack : e) });
  process.exit(1);
});
