import { Hono } from 'hono';
import { env } from './env.js';
import { log } from './log.js';
import { pool, query, tx } from './db.js';
import type { Client } from './db.js';
import { loadAccount, requireAccount, requireHost, type Vars, type Account } from './auth.js';
import { badRequest, conflict, forbidden, HttpError, notFound, tooMany, unauthorized } from './errors.js';
import { take, RATE_LIMIT } from './ratelimit.js';
import {
  CATEGORIES,
  csvCell,
  hashPassword,
  isCategory,
  isHexColor,
  isIanaZone,
  isKebabCase,
  isReserved,
  iso,
  newCoverSeed,
  parseInstant,
  signToken,
  slugify,
  themeFromSeed,
  verifyPassword,
} from './util.js';
import {
  confirmedCount,
  issueTicketCode,
  lockEvent,
  nextWaitlistPosition,
  promoteFromWaitlist,
  promotionMail,
  renumberWaitlist,
  type EventRow,
  type RegistrationRow,
} from './domain.js';
import { sendAll, sendMail, type MailInput } from './mail.js';
import { eventJson, registrationJson } from './serialize.js';

type App = Hono<{ Variables: Vars }>;

const EVENT_SELECT = `
  SELECT e.*, c.slug AS calendar_slug, c.name AS calendar_name, c.is_public, c.owner_account_id
    FROM events e JOIN calendars c ON c.id = e.calendar_id`;

type FullEvent = EventRow & {
  calendar_slug: string;
  calendar_name: string;
  is_public: boolean;
  owner_account_id: number;
};

async function loadEvent(slug: string, c?: Client, forUpdate = false): Promise<FullEvent | null> {
  const sql = `${EVENT_SELECT} WHERE e.slug = $1 ${forUpdate ? 'FOR UPDATE OF e' : ''}`;
  const r = c ? await c.query<FullEvent>(sql, [slug]) : await query<FullEvent>(sql, [slug]);
  return r.rows[0] ?? null;
}

function canSeeEvent(e: FullEvent, account: Account | null): boolean {
  if (e.state !== 'draft') return true;
  return !!account && account.id === e.owner_account_id;
}

function requireOwner(e: FullEvent, account: Account) {
  // A host who does not own the calendar meets the same not-found the world
  // meets, so no refusal ever confirms a record it should not.
  if (e.owner_account_id !== account.id) throw notFound('Not found.');
}

/* ------------------------------------------------------------------ */
/* validation helpers                                                  */
/* ------------------------------------------------------------------ */

async function body(c: any): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json();
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw badRequest('Send a JSON object.');
    return b as Record<string, unknown>;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw badRequest('Send a JSON object.');
  }
}

function str(b: Record<string, unknown>, field: string, opts: { max?: number; min?: number } = {}): string {
  const v = b[field];
  if (typeof v !== 'string') throw badRequest(`Provide ${field.replace(/_/g, ' ')}.`, field);
  const t = v.trim();
  if (t.length < (opts.min ?? 1)) throw badRequest(`Provide ${field.replace(/_/g, ' ')}.`, field);
  if (t.length > (opts.max ?? 500)) throw badRequest(`That ${field.replace(/_/g, ' ')} is too long.`, field);
  return t;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function nameIsFree(name: string, c?: Client): Promise<boolean> {
  const sql = 'SELECT 1 FROM namespace_names WHERE name = $1';
  const r = c ? await c.query(sql, [name]) : await query(sql, [name]);
  return r.rowCount === 0;
}

async function assertNamespaceFree(name: string, field: string, takenMessage: string, c?: Client) {
  if (!isKebabCase(name)) throw badRequest('Use lowercase words joined by hyphens.', field);
  if (isReserved(name) || isCategory(name)) throw badRequest(takenMessage, field);
  if (!(await nameIsFree(name, c))) throw badRequest(takenMessage, field);
}

/* ------------------------------------------------------------------ */

export function buildApi(): App {
  const api = new Hono<{ Variables: Vars }>();
  api.use('*', loadAccount);

  /* ---------------- health ---------------- */
  api.get('/health', async (c) => {
    await query('SELECT 1');
    return c.json({ status: 'ok', time: iso(new Date()) });
  });

  /* ---------------- auth ---------------- */
  api.post('/auth/signup', async (c) => {
    const b = await body(c);
    const email = String(b['email'] ?? '').trim().toLowerCase();
    const password = typeof b['password'] === 'string' ? b['password'] : '';
    const name = String(b['name'] ?? '').trim();

    if (!EMAIL_RE.test(email)) throw badRequest('Enter a valid email address.', 'email');
    if (!name) throw badRequest('Add your name so hosts know who is coming.', 'name');
    if (password.length < 8) throw badRequest('Use a password of at least 8 characters.', 'password');

    const limited = take(`signup:${email}`);
    if (limited !== null)
      throw tooMany(`Too many attempts. This endpoint accepts ${RATE_LIMIT} requests per minute; try again in ${limited} seconds.`, {
        limit: RATE_LIMIT,
        window_seconds: 60,
        retry_after_seconds: limited,
      });

    const exists = await query('SELECT 1 FROM accounts WHERE email = $1', [email]);
    if (exists.rowCount) throw conflict('An account with that email already exists. Sign in instead.', 'email');

    let handle = slugify(name) || 'guest';
    if (handle.length < 2) handle = `${handle}-guest`;
    let candidate = handle;
    for (let i = 2; !(await nameIsFree(candidate)) || isReserved(candidate) || isCategory(candidate); i++) {
      candidate = `${handle}-${i}`;
    }

    const r = await query(
      `INSERT INTO accounts (email, password_hash, display_name, handle, role)
       VALUES ($1,$2,$3,$4,'guest') RETURNING id, email, display_name, handle, role, created_at`,
      [email, hashPassword(password), name, candidate],
    );
    const acct = r.rows[0]!;
    log.info('account created', { account_id: acct.id, email });
    const access_token = signToken(env.secret, { sub: acct.id, role: acct.role });
    return c.json(
      {
        id: acct.id,
        email: acct.email,
        display_name: acct.display_name,
        handle: acct.handle,
        role: acct.role,
        created_at: iso(acct.created_at),
        access_token,
        token_type: 'bearer',
      },
      201,
    );
  });

  api.post('/auth/login', async (c) => {
    const b = await body(c);
    const email = String(b['email'] ?? '').trim().toLowerCase();
    const password = typeof b['password'] === 'string' ? b['password'] : '';
    if (!EMAIL_RE.test(email)) throw badRequest('Enter a valid email address.', 'email');
    if (!password) throw badRequest('Enter your password.', 'password');

    const limited = take(`login:${email}`);
    if (limited !== null)
      throw tooMany(`Too many attempts. This endpoint accepts ${RATE_LIMIT} requests per minute; try again in ${limited} seconds.`, {
        limit: RATE_LIMIT,
        window_seconds: 60,
        retry_after_seconds: limited,
      });

    const r = await query('SELECT * FROM accounts WHERE email = $1', [email]);
    const acct = r.rows[0];
    if (!acct || !verifyPassword(password, acct.password_hash))
      throw unauthorized('That email and password do not match. Check them and try again.');

    const access_token = signToken(env.secret, { sub: acct.id, role: acct.role });
    return c.json({
      access_token,
      token_type: 'bearer',
      expires_in: 7 * 24 * 3600,
      account: {
        id: acct.id,
        email: acct.email,
        display_name: acct.display_name,
        handle: acct.handle,
        role: acct.role,
      },
    });
  });

  /* ---------------- accounts ---------------- */
  api.get('/accounts/me', (c) => {
    const a = requireAccount(c);
    return c.json({ id: a.id, email: a.email, display_name: a.display_name, handle: a.handle, role: a.role });
  });

  api.patch('/accounts/me', async (c) => {
    const a = requireAccount(c);
    const b = await body(c);
    const updates: string[] = [];
    const params: unknown[] = [];

    if (b['display_name'] !== undefined) {
      const name = str(b, 'display_name', { max: 120 });
      params.push(name);
      updates.push(`display_name = $${params.length}`);
    }
    if (b['handle'] !== undefined) {
      const handle = String(b['handle'] ?? '').trim().toLowerCase();
      if (handle !== a.handle) {
        if (!isKebabCase(handle)) throw badRequest('Use lowercase words joined by hyphens.', 'handle');
        if (isReserved(handle) || isCategory(handle)) throw badRequest('That handle is already taken.', 'handle');
        if (!(await nameIsFree(handle))) throw badRequest('That handle is already taken.', 'handle');
        params.push(handle);
        updates.push(`handle = $${params.length}`);
      }
    }
    if (!updates.length)
      return c.json({ id: a.id, email: a.email, display_name: a.display_name, handle: a.handle, role: a.role });

    params.push(a.id);
    const r = await query(
      `UPDATE accounts SET ${updates.join(', ')} WHERE id = $${params.length}
       RETURNING id, email, display_name, handle, role`,
      params,
    );
    return c.json(r.rows[0]);
  });

  /* ---------------- resolve ---------------- */
  api.get('/resolve/:slug', async (c) => {
    const slug = c.req.param('slug').toLowerCase();
    if (isReserved(slug)) return c.json({ kind: 'system', slug });
    if (isCategory(slug)) return c.json({ kind: 'category', slug });
    const e = await query('SELECT slug, state FROM events WHERE slug = $1', [slug]);
    if (e.rowCount) {
      const row = e.rows[0]!;
      const account = c.get('account');
      if (row.state === 'draft') {
        const owner = await query(
          `SELECT 1 FROM events e JOIN calendars cal ON cal.id = e.calendar_id
            WHERE e.slug = $1 AND cal.owner_account_id = $2`,
          [slug, account?.id ?? -1],
        );
        if (!owner.rowCount) throw notFound('Not found.');
      }
      return c.json({ kind: 'event', slug });
    }
    const cal = await query('SELECT slug FROM calendars WHERE slug = $1', [slug]);
    if (cal.rowCount) return c.json({ kind: 'calendar', slug });
    const acct = await query('SELECT handle FROM accounts WHERE handle = $1', [slug]);
    if (acct.rowCount) return c.json({ kind: 'account', slug });
    throw notFound('Not found.');
  });

  api.get('/categories', (c) =>
    c.json(CATEGORIES.map((name) => ({ slug: name, name }))),
  );

  /* ---------------- events: discovery ---------------- */
  api.get('/events', async (c) => {
    const q = c.req.query();
    const where: string[] = [`e.state IN ('published','registration_closed')`];
    const params: unknown[] = [];

    const category = (q['category'] ?? '').trim();
    if (category && category !== 'all') {
      if (!isCategory(category)) throw badRequest('That is not one of the twelve categories.', 'category');
      params.push(category);
      where.push(`e.category = $${params.length}`);
    }
    const city = (q['city'] ?? '').trim();
    if (city) {
      params.push(`%${city}%`);
      where.push(`e.city ILIKE $${params.length}`);
    }
    const term = (q['q'] ?? '').trim();
    if (term) {
      params.push(`%${term}%`);
      const p = `$${params.length}`;
      where.push(`(e.title ILIKE ${p} OR e.description ILIKE ${p} OR cal.name ILIKE ${p})`);
    }

    let limit = q['limit'] === undefined ? 20 : Number(q['limit']);
    if (!Number.isFinite(limit) || limit < 1) throw badRequest('limit must be a positive whole number.', 'limit');
    limit = Math.min(Math.floor(limit), 100);
    let offset = q['offset'] === undefined ? 0 : Number(q['offset']);
    if (!Number.isFinite(offset) || offset < 0) throw badRequest('offset must be zero or more.', 'offset');
    offset = Math.floor(offset);

    const whereSql = where.join(' AND ');
    const total = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM events e JOIN calendars cal ON cal.id = e.calendar_id WHERE ${whereSql}`,
      params,
    );

    const rows = await query(
      `SELECT e.*, cal.slug AS calendar_slug, cal.name AS calendar_name, cal.is_public,
              (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in'))::int AS confirmed_count
         FROM events e JOIN calendars cal ON cal.id = e.calendar_id
        WHERE ${whereSql}
        ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    c.header('X-Total-Count', total.rows[0]!.n);
    c.header('Access-Control-Expose-Headers', 'X-Total-Count');
    return c.json(rows.rows.map((r: any) => eventJson(r, r.confirmed_count)));
  });

  /* ---------------- events: one ---------------- */
  api.get('/events/:slug', async (c) => {
    const e = await loadEvent(c.req.param('slug'));
    if (!e) throw notFound('Not found.');
    const account = c.get('account');
    if (!canSeeEvent(e, account)) throw notFound('Not found.');
    const confirmed = Number(
      (
        await query<{ n: string }>(
          `SELECT count(*)::text AS n FROM registrations WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
          [e.id],
        )
      ).rows[0]!.n,
    );
    const out: any = eventJson(e, confirmed, { full: true });
    out.is_owner = !!account && account.id === e.owner_account_id;
    if (account) {
      const mine = await query<RegistrationRow>(
        'SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2',
        [e.id, account.id],
      );
      out.my_registration = mine.rows[0] ? registrationJson(mine.rows[0]) : null;
    } else {
      out.my_registration = null;
    }
    return c.json(out);
  });

  /* ---------------- events: create ---------------- */
  api.post('/events', async (c) => {
    const account = requireHost(c);
    const b = await body(c);

    const calendarSlug = str(b, 'calendar_slug', { max: 64 });
    const cal = await query('SELECT * FROM calendars WHERE slug = $1', [calendarSlug]);
    if (!cal.rowCount) throw badRequest('That calendar does not exist.', 'calendar_slug');
    if (cal.rows[0]!.owner_account_id !== account.id) throw forbidden('That calendar is not yours.');

    const title = str(b, 'title', { max: 160 });

    // Publishing needs every one of these; a submission missing any is a draft.
    const category = typeof b['category'] === 'string' ? b['category'].trim() : '';
    if (category && !isCategory(category)) throw badRequest('That is not one of the twelve categories.', 'category');
    const city = typeof b['city'] === 'string' ? b['city'].trim() : '';
    const startsAt = b['starts_at'] === undefined || b['starts_at'] === null || b['starts_at'] === '' ? null : parseInstant(b['starts_at']);
    if (b['starts_at'] && !startsAt) throw badRequest('Write the start as an instant in UTC ending in Z.', 'starts_at');
    const endsAt = b['ends_at'] === undefined || b['ends_at'] === null || b['ends_at'] === '' ? null : parseInstant(b['ends_at']);
    if (b['ends_at'] && !endsAt) throw badRequest('Write the end as an instant in UTC ending in Z.', 'ends_at');
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime())
      throw badRequest('The end must come after the start.', 'ends_at');

    let capacity: number | null = null;
    if (b['capacity'] !== undefined && b['capacity'] !== null && b['capacity'] !== '') {
      const n = Number(b['capacity']);
      if (!Number.isInteger(n) || n < 1 || n > 500)
        throw badRequest('Capacity is a whole number from 1 to 500.', 'capacity');
      capacity = n;
    }

    const timeZone = typeof b['time_zone'] === 'string' && b['time_zone'].trim() ? b['time_zone'].trim() : 'UTC';
    if (!isIanaZone(timeZone)) throw badRequest('Use an IANA zone name such as Europe/Berlin.', 'time_zone');

    let slug = typeof b['slug'] === 'string' && b['slug'].trim() ? b['slug'].trim().toLowerCase() : slugify(title);
    if (!slug) throw badRequest('That title cannot make an address; type one.', 'slug');
    if (typeof b['slug'] === 'string' && b['slug'].trim()) {
      await assertNamespaceFree(slug, 'slug', 'That address is already taken.');
    } else {
      const root = slug;
      for (let i = 2; !(await nameIsFree(slug)) || isReserved(slug) || isCategory(slug); i++) slug = `${root}-${i}`;
    }

    const coverSeed = typeof b['cover_seed'] === 'string' && b['cover_seed'].trim() ? b['cover_seed'].trim() : newCoverSeed();
    const themeHex =
      typeof b['theme_hex'] === 'string' && isHexColor(b['theme_hex']) ? b['theme_hex'].toLowerCase() : themeFromSeed(coverSeed);

    const complete = !!(title && category && city && startsAt && endsAt && capacity !== null);
    const wantsDraft = b['state'] === 'draft';
    const state = complete && !wantsDraft ? 'published' : 'draft';

    const r = await query<EventRow>(
      `INSERT INTO events (calendar_id, title, slug, category, city, location, time_zone, cover_seed, theme_hex,
                           description, starts_at, ends_at, capacity, approval_required, waitlist_enabled, state, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [
        cal.rows[0]!.id,
        title,
        slug,
        category || cal.rows[0]!.category,
        city || '',
        typeof b['location'] === 'string' ? b['location'].trim() : '',
        timeZone,
        coverSeed,
        themeHex,
        typeof b['description'] === 'string' ? b['description'].trim() : '',
        startsAt,
        endsAt,
        capacity,
        b['approval_required'] === true,
        b['waitlist_enabled'] !== false,
        state,
        state === 'published' ? new Date() : null,
      ],
    );
    log.info('event created', { slug, state, host: account.id });
    const full = await loadEvent(slug);
    return c.json(eventJson(full!, 0, { full: true }), 201);
  });

  /* ---------------- events: edit ---------------- */
  api.patch('/events/:slug', async (c) => {
    const account = requireHost(c);
    const slug = c.req.param('slug');
    const b = await body(c);

    const result = await tx(async (client) => {
      const e = await loadEventForUpdate(client, slug);
      if (!e) throw notFound('Not found.');
      requireOwner(e, account);

      const sets: string[] = [];
      const params: unknown[] = [];
      const push = (col: string, value: unknown) => {
        params.push(value);
        sets.push(`${col} = $${params.length}`);
      };

      let scheduleChanged = false;
      let locationChanged = false;

      if (b['title'] !== undefined) push('title', str(b, 'title', { max: 160 }));
      if (b['description'] !== undefined)
        push('description', typeof b['description'] === 'string' ? b['description'].trim() : '');
      if (b['category'] !== undefined) {
        const cat = String(b['category']).trim();
        if (!isCategory(cat)) throw badRequest('That is not one of the twelve categories.', 'category');
        push('category', cat);
      }
      if (b['city'] !== undefined) {
        const city = String(b['city']).trim();
        if (!city) throw badRequest('Name the city this happens in.', 'city');
        if (city !== e.city) locationChanged = true;
        push('city', city);
      }
      if (b['location'] !== undefined) {
        const loc = typeof b['location'] === 'string' ? b['location'].trim() : '';
        if (loc !== e.location) locationChanged = true;
        push('location', loc);
      }
      if (b['time_zone'] !== undefined) {
        const tz = String(b['time_zone']).trim();
        if (!isIanaZone(tz)) throw badRequest('Use an IANA zone name such as Europe/Berlin.', 'time_zone');
        push('time_zone', tz);
      }
      let newStarts = e.starts_at;
      let newEnds = e.ends_at;
      if (b['starts_at'] !== undefined) {
        const d = parseInstant(b['starts_at']);
        if (!d) throw badRequest('Write the start as an instant in UTC ending in Z.', 'starts_at');
        if (!e.starts_at || d.getTime() !== e.starts_at.getTime()) scheduleChanged = true;
        newStarts = d;
        push('starts_at', d);
      }
      if (b['ends_at'] !== undefined) {
        const d = parseInstant(b['ends_at']);
        if (!d) throw badRequest('Write the end as an instant in UTC ending in Z.', 'ends_at');
        if (!e.ends_at || d.getTime() !== e.ends_at.getTime()) scheduleChanged = true;
        newEnds = d;
        push('ends_at', d);
      }
      if (newStarts && newEnds && newEnds.getTime() <= newStarts.getTime())
        throw badRequest('The end must come after the start.', 'ends_at');

      let raisedBy = 0;
      if (b['capacity'] !== undefined) {
        const n = Number(b['capacity']);
        if (!Number.isInteger(n) || n < 1 || n > 500)
          throw badRequest('Capacity is a whole number from 1 to 500.', 'capacity');
        const taken = await confirmedCount(client, e.id);
        if (n < taken)
          throw badRequest(`You already have ${taken} guests confirmed.`, 'capacity', { confirmed_count: taken });
        if (e.capacity !== null && n > e.capacity) raisedBy = n - e.capacity;
        if (e.capacity === null) raisedBy = n;
        push('capacity', n);
      }
      if (b['approval_required'] !== undefined) push('approval_required', b['approval_required'] === true);

      let waitlistTurnedOff = false;
      if (b['waitlist_enabled'] !== undefined) {
        const on = b['waitlist_enabled'] === true;
        if (!on && e.waitlist_enabled) waitlistTurnedOff = true;
        push('waitlist_enabled', on);
      }

      if (b['state'] !== undefined) {
        const next = String(b['state']);
        if (!['draft', 'published', 'registration_closed', 'cancelled'].includes(next))
          throw badRequest('That is not a state an event can be in.', 'state');
        if (next === 'cancelled') throw badRequest('Cancel an event at its own cancel address, with a reason.', 'state');
        if (e.state === 'cancelled') throw badRequest('A cancelled event moves to no other state.', 'state');
        if (next === 'draft' && e.state !== 'draft')
          throw badRequest('A published event cannot go back to draft.', 'state');
        if (next === 'registration_closed' && e.state === 'draft')
          throw badRequest('Publish the event before closing its registration.', 'state');
        if (next === 'published' && e.state === 'draft') {
          const title = (b['title'] as string) ?? e.title;
          const category = (b['category'] as string) ?? e.category;
          const city = (b['city'] as string) ?? e.city;
          const starts = newStarts;
          const ends = newEnds;
          const cap = b['capacity'] !== undefined ? Number(b['capacity']) : e.capacity;
          const missing: string[] = [];
          if (!title) missing.push('title');
          if (!category) missing.push('category');
          if (!city) missing.push('city');
          if (!starts) missing.push('starts_at');
          if (!ends) missing.push('ends_at');
          if (cap === null) missing.push('capacity');
          if (missing.length)
            throw badRequest(`Fill in ${missing[0]!.replace(/_/g, ' ')} before publishing.`, missing[0]!);
          push('published_at', new Date());
        }
        push('state', next);
      }

      if (!sets.length) return { event: e, mails: [] as MailInput[], promoted: 0 };

      params.push(e.id);
      const updated = await client.query<EventRow>(
        `UPDATE events SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
        params,
      );
      const after = { ...e, ...updated.rows[0]! } as FullEvent;

      const mails: MailInput[] = [];

      // Raising capacity moves the waiting list, in this same request.
      let promoted = 0;
      if (raisedBy > 0 && after.state !== 'cancelled') {
        const list = await promoteFromWaitlist(client, after, raisedBy);
        promoted = list.length;
        for (const p of list) mails.push(promotionMail(after, p));
      }
      if (waitlistTurnedOff) {
        // Nothing is thrown away: existing waiting-list places stay as they are.
      }

      // A change of time or place with confirmed guests mails every one of them.
      if ((scheduleChanged || locationChanged) && after.state !== 'cancelled') {
        const guests = await client.query<{ email: string; display_name: string; id: number }>(
          `SELECT r.id, a.email, a.display_name FROM registrations r JOIN accounts a ON a.id = r.account_id
            WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in')`,
          [e.id],
        );
        for (const g of guests.rows) {
          mails.push({
            kind: 'event_updated',
            to: g.email,
            displayName: g.display_name,
            eventTitle: after.title,
            eventSlug: after.slug,
            eventId: after.id,
            registrationId: g.id,
            extra: [
              scheduleChanged ? `It now runs from ${iso(after.starts_at)} to ${iso(after.ends_at)} (UTC).` : '',
              locationChanged ? `The place is now ${after.location || after.city}.` : '',
            ]
              .filter(Boolean)
              .join(' '),
          });
        }
      }

      return { event: after, mails, promoted };
    });

    await sendAll(result.mails);
    const fresh = await loadEvent(slug);
    const confirmed = await countConfirmed(fresh!.id);
    const out: any = eventJson(fresh!, confirmed, { full: true });
    out.promoted_from_waitlist = result.promoted;
    return c.json(out);
  });

  /* ---------------- events: cancel ---------------- */
  api.post('/events/:slug/cancel', async (c) => {
    const account = requireHost(c);
    const slug = c.req.param('slug');
    const b = await body(c);
    const reason = typeof b['reason'] === 'string' ? b['reason'].trim() : '';
    if (!reason) throw badRequest('Type the reason your guests will read.', 'reason');

    const { event, mails } = await tx(async (client) => {
      const e = await loadEventForUpdate(client, slug);
      if (!e) throw notFound('Not found.');
      requireOwner(e, account);
      if (e.state === 'cancelled') throw badRequest('That event is already cancelled.', 'state');

      const holders = await client.query<{ id: number; email: string; display_name: string }>(
        `SELECT r.id, a.email, a.display_name FROM registrations r JOIN accounts a ON a.id = r.account_id
          WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in','waitlisted','pending_approval')`,
        [e.id],
      );

      const updated = await client.query<EventRow>(
        `UPDATE events SET state = 'cancelled', cancelled_at = now(), cancel_reason = $2, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [e.id, reason],
      );

      const mails: MailInput[] = holders.rows.map((h) => ({
        kind: 'event_cancelled' as const,
        to: h.email,
        displayName: h.display_name,
        eventTitle: e.title,
        eventSlug: e.slug,
        eventId: e.id,
        registrationId: h.id,
        cancelReason: reason,
      }));
      return { event: { ...e, ...updated.rows[0]! }, mails };
    });

    await sendAll(mails);
    log.info('event cancelled', { slug, notified: mails.length });
    const confirmed = await countConfirmed(event.id);
    return c.json({ ...eventJson(event as FullEvent, confirmed, { full: true }), cancel_reason: event.cancel_reason });
  });

  /* ---------------- events: guest list ---------------- */
  api.get('/events/:slug/registrations', async (c) => {
    const rows = await guestList(c, c.req.param('slug'));
    return c.json(rows);
  });

  api.get('/events/:slug/registrations.csv', async (c) => {
    const slug = c.req.param('slug');
    const rows = await guestList(c, slug);
    const lines = ['email,display_name,status,waitlist_position,ticket_code'];
    for (const r of rows) {
      lines.push(
        [r.email, r.display_name, r.status, r.waitlist_position ?? '', r.ticket_code ?? '']
          .map(csvCell)
          .join(','),
      );
    }
    return new Response(lines.join('\n') + '\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slug}.csv"`,
      },
    });
  });

  async function guestList(c: any, slug: string) {
    const account = requireAccount(c);
    const e = await loadEvent(slug);
    if (!e) throw notFound('Not found.');
    if (account.role !== 'host' || e.owner_account_id !== account.id) throw notFound('Not found.');
    const r = await query(
      `SELECT r.id, r.account_id, a.email, a.display_name, r.status, r.waitlist_position, r.ticket_code,
              r.checked_in_at, r.created_at
         FROM registrations r JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1
        ORDER BY r.status ASC, r.waitlist_position ASC NULLS LAST, a.email ASC`,
      [e.id],
    );
    return r.rows.map((x: any) => ({
      id: x.id,
      account_id: x.account_id,
      email: x.email,
      display_name: x.display_name,
      status: x.status,
      waitlist_position: x.waitlist_position,
      ticket_code: x.ticket_code,
      checked_in_at: iso(x.checked_in_at),
    }));
  }

  /* ---------------- registrations ---------------- */
  api.post('/registrations', async (c) => {
    const account = requireAccount(c);
    const b = await body(c);
    const slug = str(b, 'event_slug', { max: 64 });

    const limited = take(`register:${account.id}`);
    if (limited !== null)
      throw tooMany(`Too many attempts. This endpoint accepts ${RATE_LIMIT} requests per minute; try again in ${limited} seconds.`, {
        limit: RATE_LIMIT,
        window_seconds: 60,
        retry_after_seconds: limited,
      });

    const outcome = await registerOnce(slug, account);
    if (outcome.mail) await sendMail(outcome.mail);
    return c.json(registrationJson(outcome.registration, { event_slug: slug, message: outcome.message }), outcome.created ? 201 : 200);
  });

  api.get('/registrations/me', async (c) => {
    const account = requireAccount(c);
    const r = await query(
      `SELECT r.*, e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city, e.location,
              e.theme_hex, e.cover_seed, e.state AS event_state, e.cancel_reason
         FROM registrations r JOIN events e ON e.id = r.event_id
        WHERE r.account_id = $1
        ORDER BY e.starts_at ASC NULLS LAST`,
      [account.id],
    );
    return c.json(
      r.rows.map((x: any) =>
        registrationJson(x, {
          event_slug: x.event_slug,
          title: x.title,
          starts_at: iso(x.starts_at),
          ends_at: iso(x.ends_at),
          time_zone: x.time_zone,
          city: x.city,
          location: x.location,
          theme_hex: x.theme_hex,
          cover_seed: x.cover_seed,
          event_state: x.event_state,
          cancel_reason: x.cancel_reason,
        }),
      ),
    );
  });

  api.post('/registrations/:id/cancel', async (c) => {
    const account = requireAccount(c);
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) throw notFound('Not found.');

    const { registration, mails } = await tx(async (client) => {
      const found = await client.query<RegistrationRow>('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [id]);
      const reg = found.rows[0];
      if (!reg) throw notFound('Not found.');
      if (reg.account_id !== account.id) throw notFound('Not found.');

      const e = (await loadEventById(client, reg.event_id, true))!;
      const heldSeat = reg.status === 'confirmed' || reg.status === 'checked_in';

      const updated = await client.query<RegistrationRow>(
        `UPDATE registrations SET status = 'cancelled_by_guest', waitlist_position = NULL,
                                  ticket_code = NULL, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [id],
      );
      await renumberWaitlist(client, reg.event_id);

      const mails: MailInput[] = [];
      // The freed seat passes to the head of the waiting list at once, unless
      // registration on that event is closed, where nobody is promoted.
      if (heldSeat && e.state === 'published') {
        const list = await promoteFromWaitlist(client, e, 1);
        for (const p of list) mails.push(promotionMail(e, p));
      }
      return { registration: updated.rows[0]!, mails };
    });

    // A guest cancelling their own registration sends that guest no mail;
    // only a promoted waiting-list guest hears anything.
    await sendAll(mails);
    return c.json(registrationJson(registration));
  });

  api.post('/registrations/:id/approve', async (c) => {
    const account = requireHost(c);
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) throw notFound('Not found.');

    const { registration, mail, waitlisted } = await tx(async (client) => {
      const r = await client.query<RegistrationRow & { owner_account_id: number }>(
        `SELECT r.*, cal.owner_account_id FROM registrations r
           JOIN events e ON e.id = r.event_id JOIN calendars cal ON cal.id = e.calendar_id
          WHERE r.id = $1 FOR UPDATE OF r`,
        [id],
      );
      const reg = r.rows[0];
      if (!reg) throw notFound('Not found.');
      if (reg.owner_account_id !== account.id) throw notFound('Not found.');
      const e = (await loadEventById(client, reg.event_id, true))!;
      if (reg.status !== 'pending_approval')
        throw badRequest('Only a request awaiting your decision can be approved.', 'status');
      if (e.state === 'cancelled') throw badRequest('That event has been cancelled.', 'state');

      const taken = await confirmedCount(client, e.id);
      const account_row = await client.query<{ email: string; display_name: string }>(
        'SELECT email, display_name FROM accounts WHERE id = $1',
        [reg.account_id],
      );
      const g = account_row.rows[0]!;

      if (e.capacity !== null && taken < e.capacity) {
        const code = await issueTicketCode(client);
        const up = await client.query<RegistrationRow>(
          `UPDATE registrations SET status = 'confirmed', waitlist_position = NULL, ticket_code = $2, updated_at = now()
            WHERE id = $1 RETURNING *`,
          [id, code],
        );
        return {
          registration: up.rows[0]!,
          waitlisted: false,
          mail: {
            kind: 'approved' as const,
            to: g.email,
            displayName: g.display_name,
            eventTitle: e.title,
            eventSlug: e.slug,
            eventId: e.id,
            registrationId: id,
            ticketCode: code,
          },
        };
      }

      if (!e.waitlist_enabled)
        throw conflict('This event is full and its waiting list is off, so this request cannot be approved.', 'status');

      const pos = await nextWaitlistPosition(client, e.id);
      const up = await client.query<RegistrationRow>(
        `UPDATE registrations SET status = 'waitlisted', waitlist_position = $2, ticket_code = NULL, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [id, pos],
      );
      return {
        registration: up.rows[0]!,
        waitlisted: true,
        mail: {
          kind: 'waitlisted' as const,
          to: g.email,
          displayName: g.display_name,
          eventTitle: e.title,
          eventSlug: e.slug,
          eventId: e.id,
          registrationId: id,
          waitlistPosition: pos,
        },
      };
    });

    await sendMail(mail);
    return c.json(
      registrationJson(registration, {
        message: waitlisted
          ? 'This event just filled up. This guest is on the waiting list.'
          : 'This guest has a seat.',
      }),
    );
  });

  api.post('/registrations/:id/decline', async (c) => {
    const account = requireHost(c);
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) throw notFound('Not found.');

    const { registration, mail } = await tx(async (client) => {
      const r = await client.query<RegistrationRow & { owner_account_id: number }>(
        `SELECT r.*, cal.owner_account_id FROM registrations r
           JOIN events e ON e.id = r.event_id JOIN calendars cal ON cal.id = e.calendar_id
          WHERE r.id = $1 FOR UPDATE OF r`,
        [id],
      );
      const reg = r.rows[0];
      if (!reg) throw notFound('Not found.');
      if (reg.owner_account_id !== account.id) throw notFound('Not found.');
      if (reg.status !== 'pending_approval')
        throw badRequest('Only a request awaiting your decision can be declined.', 'status');
      const e = (await loadEventById(client, reg.event_id, true))!;
      const g = (
        await client.query<{ email: string; display_name: string }>(
          'SELECT email, display_name FROM accounts WHERE id = $1',
          [reg.account_id],
        )
      ).rows[0]!;
      const up = await client.query<RegistrationRow>(
        `UPDATE registrations SET status = 'declined', waitlist_position = NULL, ticket_code = NULL, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [id],
      );
      return {
        registration: up.rows[0]!,
        mail: {
          kind: 'declined' as const,
          to: g.email,
          displayName: g.display_name,
          eventTitle: e.title,
          eventSlug: e.slug,
          eventId: e.id,
          registrationId: id,
        },
      };
    });
    await sendMail(mail);
    return c.json(registrationJson(registration));
  });

  /* ---------------- tickets ---------------- */
  api.get('/tickets/:code', async (c) => {
    const code = c.req.param('code').toUpperCase();
    const r = await query(
      `SELECT r.*, e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city, e.location,
              e.theme_hex, e.cover_seed, e.state AS event_state, a.display_name
         FROM registrations r JOIN events e ON e.id = r.event_id JOIN accounts a ON a.id = r.account_id
        WHERE r.ticket_code = $1`,
      [code],
    );
    const t = r.rows[0];
    if (!t) throw notFound('Not found.');
    return c.json({
      id: t.id,
      event_slug: t.event_slug,
      title: t.title,
      starts_at: iso(t.starts_at),
      ends_at: iso(t.ends_at),
      time_zone: t.time_zone,
      city: t.city,
      location: t.location,
      theme_hex: t.theme_hex,
      cover_seed: t.cover_seed,
      status: t.status,
      ticket_code: t.ticket_code,
      checked_in_at: iso(t.checked_in_at),
      display_name: t.display_name,
      event_state: t.event_state,
    });
  });

  api.post('/tickets/:code/check-in', async (c) => {
    const account = requireHost(c);
    const code = c.req.param('code').toUpperCase();

    const { registration, already } = await tx(async (client) => {
      const r = await client.query<RegistrationRow & { owner_account_id: number; title: string }>(
        `SELECT r.*, cal.owner_account_id, e.title FROM registrations r
           JOIN events e ON e.id = r.event_id JOIN calendars cal ON cal.id = e.calendar_id
          WHERE r.ticket_code = $1 FOR UPDATE OF r`,
        [code],
      );
      const reg = r.rows[0];
      if (!reg) throw notFound('Not found.');
      if (reg.owner_account_id !== account.id) throw notFound('Not found.');

      // A second check-in of the same code records one arrival, not two.
      if (reg.status === 'checked_in') return { registration: reg as RegistrationRow, already: true };
      if (reg.status !== 'confirmed') throw badRequest('That ticket does not hold a seat.', 'status');

      const up = await client.query<RegistrationRow>(
        `UPDATE registrations SET status = 'checked_in', checked_in_at = now(), updated_at = now()
          WHERE id = $1 AND status = 'confirmed' RETURNING *`,
        [reg.id],
      );
      return { registration: up.rows[0] ?? (reg as RegistrationRow), already: false };
    });

    return c.json(
      registrationJson(registration, {
        already_checked_in: already,
        message: already
          ? `Already arrived at ${iso(registration.checked_in_at)}.`
          : 'Checked in.',
      }),
    );
  });

  /* ---------------- calendars ---------------- */
  api.get('/calendars', async (c) => {
    const account = requireAccount(c);
    const r = await query(
      `SELECT cal.*, (SELECT count(*) FROM events e WHERE e.calendar_id = cal.id AND e.state IN ('published','registration_closed'))::int AS published_event_count
         FROM calendars cal WHERE cal.owner_account_id = $1 ORDER BY cal.created_at ASC`,
      [account.id],
    );
    return c.json(r.rows.map((x: any) => ({ ...x, created_at: iso(x.created_at) })));
  });

  api.post('/calendars', async (c) => {
    const account = requireHost(c);
    const b = await body(c);
    const name = str(b, 'name', { max: 120 });
    const slug = String(b['slug'] ?? '').trim().toLowerCase() || slugify(name);
    const category = String(b['category'] ?? '').trim();
    if (!isCategory(category)) throw badRequest('Pick one of the twelve categories.', 'category');
    const city = str(b, 'city', { max: 120 });
    await assertNamespaceFree(slug, 'slug', 'That address is already taken.');

    const r = await query(
      `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [account.id, name, slug, category, city, b['is_public'] !== false],
    );
    const row = r.rows[0]!;
    return c.json({ ...row, created_at: iso(row.created_at), published_event_count: 0 }, 201);
  });

  api.get('/calendars/:slug', async (c) => {
    const slug = c.req.param('slug');
    const r = await query(
      `SELECT cal.*, a.display_name AS owner_name, a.handle AS owner_handle
         FROM calendars cal JOIN accounts a ON a.id = cal.owner_account_id WHERE cal.slug = $1`,
      [slug],
    );
    const cal = r.rows[0];
    if (!cal) throw notFound('Not found.');
    const events = await query(
      `SELECT e.*, cal.slug AS calendar_slug, cal.name AS calendar_name, cal.is_public,
              (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in'))::int AS confirmed_count
         FROM events e JOIN calendars cal ON cal.id = e.calendar_id
        WHERE e.calendar_id = $1 AND e.state IN ('published','registration_closed','cancelled')
        ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC`,
      [cal.id],
    );
    return c.json({
      id: cal.id,
      name: cal.name,
      slug: cal.slug,
      category: cal.category,
      city: cal.city,
      is_public: cal.is_public,
      owner_name: cal.owner_name,
      owner_handle: cal.owner_handle,
      created_at: iso(cal.created_at),
      events: events.rows.map((e: any) => eventJson(e, e.confirmed_count)),
    });
  });

  /* ---------------- accounts by handle ---------------- */
  api.get('/profiles/:handle', async (c) => {
    const handle = c.req.param('handle').toLowerCase();
    const r = await query('SELECT id, display_name, handle, role, created_at FROM accounts WHERE handle = $1', [handle]);
    const a = r.rows[0];
    if (!a) throw notFound('Not found.');
    const cals = await query(
      `SELECT slug, name, category, city, is_public FROM calendars WHERE owner_account_id = $1 AND is_public = true`,
      [a.id],
    );
    return c.json({
      display_name: a.display_name,
      handle: a.handle,
      role: a.role,
      created_at: iso(a.created_at),
      calendars: cals.rows,
    });
  });

  /* ---------------- category summary ---------------- */
  api.get('/categories/:name', async (c) => {
    const name = c.req.param('name').toLowerCase();
    if (!isCategory(name)) throw notFound('Not found.');
    const counts = await query<{ events: string; calendars: string }>(
      `SELECT (SELECT count(*) FROM events WHERE category = $1 AND state IN ('published','registration_closed'))::text AS events,
              (SELECT count(*) FROM calendars WHERE category = $1 AND is_public = true)::text AS calendars`,
      [name],
    );
    const cals = await query(
      `SELECT cal.slug, cal.name, cal.category, cal.city, cal.is_public,
              (SELECT count(*) FROM events e WHERE e.calendar_id = cal.id AND e.state IN ('published','registration_closed'))::int AS published_event_count
         FROM calendars cal WHERE cal.category = $1 AND cal.is_public = true ORDER BY cal.name ASC`,
      [name],
    );
    return c.json({
      slug: name,
      name,
      event_count: Number(counts.rows[0]!.events),
      calendar_count: Number(counts.rows[0]!.calendars),
      calendars: cals.rows,
    });
  });

  /* ---------------- landing summary ---------------- */
  api.get('/landing', async (c) => {
    const events = await query(
      `SELECT e.slug, e.title, e.theme_hex, e.cover_seed, e.category, e.city, e.starts_at, e.time_zone
         FROM events e WHERE e.state IN ('published','registration_closed')
        ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC LIMIT 24`,
    );
    const cals = await query(
      `SELECT cal.slug, cal.name, cal.category, cal.city,
              (SELECT count(*) FROM events e WHERE e.calendar_id = cal.id AND e.state IN ('published','registration_closed'))::int AS published_event_count
         FROM calendars cal WHERE cal.is_public = true ORDER BY cal.name ASC LIMIT 12`,
    );
    return c.json({
      events: events.rows.map((e: any) => ({ ...e, starts_at: iso(e.starts_at) })),
      calendars: cals.rows,
    });
  });

  return api;
}

/* ------------------------------------------------------------------ */
/* the registration transaction                                        */
/* ------------------------------------------------------------------ */

async function loadEventForUpdate(client: Client, slug: string): Promise<FullEvent | null> {
  const r = await client.query<FullEvent>(
    `${EVENT_SELECT} WHERE e.slug = $1 FOR UPDATE OF e`,
    [slug],
  );
  return r.rows[0] ?? null;
}

async function loadEventById(client: Client, id: number, forUpdate = false): Promise<FullEvent | null> {
  const r = await client.query<FullEvent>(
    `${EVENT_SELECT} WHERE e.id = $1 ${forUpdate ? 'FOR UPDATE OF e' : ''}`,
    [id],
  );
  return r.rows[0] ?? null;
}

async function countConfirmed(eventId: number): Promise<number> {
  const r = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM registrations WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
    [eventId],
  );
  return Number(r.rows[0]!.n);
}

interface RegisterOutcome {
  registration: RegistrationRow;
  mail: MailInput | null;
  message: string;
  created: boolean;
}

/**
 * One registration attempt, whole or not at all.
 *
 * The event row is locked before any seat arithmetic, so two guests arriving at
 * the same instant are serialised by PostgreSQL rather than by this process: the
 * second one counts the seat the first one just took. The trigger on the table
 * is the backstop, and it aborts the statement rather than writing a partial row.
 */
export async function registerOnce(slug: string, account: Account): Promise<RegisterOutcome> {
  const result = await tx(async (client) => {
    const e = await loadEventForUpdate(client, slug);
    if (!e) throw notFound('Not found.');
    if (e.state === 'draft') throw notFound('Not found.');
    if (e.state === 'cancelled') throw badRequest('This event has been cancelled.', 'state');
    if (e.state === 'registration_closed')
      throw badRequest('Registration is closed for this event.', 'state', { state: 'registration_closed' });
    if (e.capacity === null) throw badRequest('This event is not open for registration yet.', 'state');

    const existingQ = await client.query<RegistrationRow>(
      'SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2 FOR UPDATE',
      [e.id, account.id],
    );
    const existing = existingQ.rows[0] ?? null;
    if (existing && ['confirmed', 'checked_in', 'waitlisted', 'pending_approval'].includes(existing.status)) {
      return {
        registration: existing,
        mail: null,
        message:
          existing.status === 'waitlisted'
            ? `You are number ${existing.waitlist_position} on the waiting list.`
            : 'You already hold a place at this event.',
        created: false,
      };
    }

    const guest = (
      await client.query<{ email: string; display_name: string }>(
        'SELECT email, display_name FROM accounts WHERE id = $1',
        [account.id],
      )
    ).rows[0]!;

    // A host reviewing every request: a new registration holds no seat.
    if (e.approval_required) {
      const reg = await upsertRegistration(client, e.id, account.id, existing, {
        status: 'pending_approval',
        waitlist_position: null,
        ticket_code: null,
      });
      return {
        registration: reg,
        mail: {
          kind: 'registration_pending' as const,
          to: guest.email,
          displayName: guest.display_name,
          eventTitle: e.title,
          eventSlug: e.slug,
          eventId: e.id,
          registrationId: reg.id,
        },
        message: 'The host reviews every request. You will hear back by email.',
        created: true,
      };
    }

    const taken = await confirmedCount(client, e.id);
    if (taken < e.capacity) {
      const code = await issueTicketCode(client);
      const reg = await upsertRegistration(client, e.id, account.id, existing, {
        status: 'confirmed',
        waitlist_position: null,
        ticket_code: code,
      });
      return {
        registration: reg,
        mail: {
          kind: 'registration_confirmed' as const,
          to: guest.email,
          displayName: guest.display_name,
          eventTitle: e.title,
          eventSlug: e.slug,
          eventId: e.id,
          registrationId: reg.id,
          ticketCode: code,
        },
        message: 'You have a seat.',
        created: true,
      };
    }

    if (!e.waitlist_enabled) throw conflict('This event is full.', 'event_slug', { reason: 'full' });

    const pos = await nextWaitlistPosition(client, e.id);
    const reg = await upsertRegistration(client, e.id, account.id, existing, {
      status: 'waitlisted',
      waitlist_position: pos,
      ticket_code: null,
    });
    return {
      registration: reg,
      mail: {
        kind: 'waitlisted' as const,
        to: guest.email,
        displayName: guest.display_name,
        eventTitle: e.title,
        eventSlug: e.slug,
        eventId: e.id,
        registrationId: reg.id,
        waitlistPosition: pos,
      },
      message: 'This event just filled up. You are on the waiting list.',
      created: true,
    };
  });
  return result as RegisterOutcome;
}

/** At most one registration per event per account: a repeat updates the row. */
async function upsertRegistration(
  client: Client,
  eventId: number,
  accountId: number,
  existing: RegistrationRow | null,
  next: { status: RegistrationRow['status']; waitlist_position: number | null; ticket_code: string | null },
): Promise<RegistrationRow> {
  if (existing) {
    const r = await client.query<RegistrationRow>(
      `UPDATE registrations SET status = $2, waitlist_position = $3, ticket_code = $4, checked_in_at = NULL, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [existing.id, next.status, next.waitlist_position, next.ticket_code],
    );
    return r.rows[0]!;
  }
  const r = await client.query<RegistrationRow>(
    `INSERT INTO registrations (event_id, account_id, status, waitlist_position, ticket_code)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (event_id, account_id) DO UPDATE
       SET status = EXCLUDED.status, waitlist_position = EXCLUDED.waitlist_position,
           ticket_code = EXCLUDED.ticket_code, updated_at = now()
     RETURNING *`,
    [eventId, accountId, next.status, next.waitlist_position, next.ticket_code],
  );
  return r.rows[0]!;
}
