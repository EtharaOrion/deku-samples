import { Hono } from 'hono';
import type { Context } from 'hono';
import { pool, tx } from './db.js';
import {
  CATEGORIES, RESERVED_PATHS, deriveTheme, hashString, hashPassword, isEmail,
  isKebab, isReservedName, isValidTimeZone, issueToken, rfc3339, themeFromSeed,
  verifyPassword,
} from './core.js';
import {
  Account, currentAccount, fail, notFound, optBool, optInt, optStr, rateLimit,
  readJson, requireAccount, requireHost, str,
} from './http.js';
import {
  EventRow, HOLDS_PLACE, Promotion, RegRow, RuleError, confirmedCount, lockEvent,
  nextFreeSeat, promoteFromWaitlist, releaseRegistration, renumberWaitlist,
  seatRegistration, waitlistRegistration,
} from './registrations.js';
import { sendMail, subjectFor } from './mail.js';
import { env, log } from './env.js';

export const api = new Hono();

const PUBLIC_URL = () => env.publicUrl || '';

// ------------------------------------------------------------- serialisers
function eventPublic(row: any, confirmed: number) {
  const capacity: number | null = row.capacity;
  const remaining = capacity === null ? null : Math.max(0, capacity - confirmed);
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    category: row.category,
    city: row.city,
    time_zone: row.time_zone,
    starts_at: rfc3339(row.starts_at),
    ends_at: rfc3339(row.ends_at),
    capacity,
    confirmed_count: confirmed,
    remaining,
    state: row.state,
    theme_hex: row.theme_hex,
    cover_seed: row.cover_seed,
    theme: deriveTheme(row.theme_hex),
    has_ended: row.ends_at ? new Date(row.ends_at).getTime() < Date.now() : false,
    calendar_slug: row.calendar_slug,
    calendar_name: row.calendar_name,
    calendar_is_public: row.calendar_is_public,
  };
}

function eventDetail(row: any, confirmed: number) {
  return {
    ...eventPublic(row, confirmed),
    description: row.description,
    approval_required: row.approval_required,
    waitlist_enabled: row.waitlist_enabled,
    published_at: rfc3339(row.published_at),
    cancelled_at: rfc3339(row.cancelled_at),
    cancel_reason: row.cancel_reason,
    created_at: rfc3339(row.created_at),
    updated_at: rfc3339(row.updated_at),
  };
}

function regPublic(r: RegRow | any) {
  return {
    id: Number(r.id),
    event_id: Number(r.event_id),
    account_id: Number(r.account_id),
    status: r.status,
    waitlist_position: r.waitlist_position ?? null,
    ticket_code: r.ticket_code ?? null,
    checked_in_at: rfc3339(r.checked_in_at ?? null),
    created_at: rfc3339(r.created_at ?? null),
  };
}

const EVENT_SELECT = `
  SELECT e.*, c.slug AS calendar_slug, c.name AS calendar_name,
         c.is_public AS calendar_is_public, c.owner_account_id
    FROM events e JOIN calendars c ON c.id = e.calendar_id
`;

async function loadEvent(slug: string): Promise<any | null> {
  const r = await pool.query(`${EVENT_SELECT} WHERE e.slug = $1`, [slug]);
  return r.rowCount ? r.rows[0] : null;
}

async function loadEventFor(c: Context, slug: string, acct: Account | null) {
  const ev = await loadEvent(slug);
  if (!ev) return null;
  // A draft event returns, to everyone but its host, the not-found response.
  if (ev.state === 'draft' && (!acct || Number(ev.owner_account_id) !== acct.id)) return null;
  return ev;
}

/** Ownership, not role, is the scope: one host cannot touch another's event. */
function assertOwner(ev: any, acct: Account) {
  if (!ev || Number(ev.owner_account_id) !== acct.id) throw new RuleError('not found', 404);
}

// ------------------------------------------------------------------ health
api.get('/health', async (c) => {
  try {
    await pool.query('SELECT 1');
    return c.json({ status: 'ok', time: rfc3339(new Date()) });
  } catch {
    return c.json({ status: 'degraded' }, 503);
  }
});

// -------------------------------------------------------------------- auth
api.post('/auth/signup', async (c) => {
  const body = await readJson(c);
  const email = str(body, 'email', { max: 254 }).toLowerCase();
  if (!isEmail(email)) throw new RuleError('Enter a valid email address.', 400, 'email');
  const name = str(body, 'name', { max: 120 });
  const password = str(body, 'password', { min: 8, max: 200 });
  rateLimit(`signup:${email}`);

  const exists = await pool.query('SELECT 1 FROM accounts WHERE email = $1', [email]);
  if (exists.rowCount) {
    throw new RuleError('That email already has an account. Sign in instead.', 409, 'email');
  }

  // Handles share the root namespace with calendar and event slugs.
  const base = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'guest').slice(0, 60);
  let handle = base;
  for (let i = 0; i < 200; i++) {
    const taken = await namespaceTaken(handle);
    if (!taken) break;
    handle = `${base}-${i + 2}`;
  }

  const r = await pool.query(
    `INSERT INTO accounts (email, password_hash, display_name, handle, role)
     VALUES ($1,$2,$3,$4,'guest')
     RETURNING id, email, display_name, handle, role, created_at`,
    [email, hashPassword(password), name, handle],
  );
  const a = r.rows[0];
  const { token, expiresAt } = issueToken(Number(a.id));
  log('info', 'account created', { account_id: Number(a.id) });
  return c.json({
    id: Number(a.id), email: a.email, display_name: a.display_name,
    handle: a.handle, role: a.role, created_at: rfc3339(a.created_at),
    access_token: token, token_type: 'bearer', expires_at: rfc3339(expiresAt),
  }, 201);
});

api.post('/auth/login', async (c) => {
  const body = await readJson(c);
  const email = str(body, 'email', { max: 254 }).toLowerCase();
  const password = str(body, 'password', { max: 200 });
  rateLimit(`login:${email}`);

  const r = await pool.query(
    'SELECT id, email, password_hash, display_name, handle, role FROM accounts WHERE email = $1',
    [email],
  );
  if (!r.rowCount || !verifyPassword(password, r.rows[0].password_hash)) {
    throw new RuleError('That email and password do not match an account. Check them and try again.', 401);
  }
  const a = r.rows[0];
  const { token, expiresAt } = issueToken(Number(a.id));
  return c.json({
    access_token: token, token_type: 'bearer', expires_at: rfc3339(expiresAt),
    account: {
      id: Number(a.id), email: a.email, display_name: a.display_name,
      handle: a.handle, role: a.role,
    },
  });
});

// ---------------------------------------------------------------- accounts
api.get('/accounts/me', async (c) => {
  const acct = await requireAccount(c);
  return c.json({
    id: acct.id, email: acct.email, display_name: acct.display_name,
    handle: acct.handle, role: acct.role,
  });
});

async function namespaceTaken(slug: string, exceptAccountId?: number): Promise<boolean> {
  if (isReservedName(slug)) return true;
  const q = await pool.query(
    `SELECT 1 FROM accounts WHERE handle = $1 AND ($2::bigint IS NULL OR id <> $2)
     UNION ALL SELECT 1 FROM calendars WHERE slug = $1
     UNION ALL SELECT 1 FROM events WHERE slug = $1 LIMIT 1`,
    [slug, exceptAccountId ?? null],
  );
  return (q.rowCount ?? 0) > 0;
}

/** Edits the caller alone; the body carries no account identifier. */
api.patch('/accounts/me', async (c) => {
  const acct = await requireAccount(c);
  const body = await readJson(c);
  const displayName = optStr(body, 'display_name', 120);
  const handle = optStr(body, 'handle', 80);

  if (displayName !== undefined && displayName === '') {
    throw new RuleError('Add your name so hosts know who is coming.', 400, 'display_name');
  }
  if (handle !== undefined) {
    const h = handle.toLowerCase();
    if (!isKebab(h)) {
      throw new RuleError('A handle uses lowercase letters, numbers and hyphens.', 400, 'handle');
    }
    if (h !== acct.handle && (await namespaceTaken(h, acct.id))) {
      throw new RuleError('That handle is already taken.', 409, 'handle');
    }
  }

  const r = await pool.query(
    `UPDATE accounts
        SET display_name = COALESCE($2, display_name),
            handle = COALESCE($3, handle)
      WHERE id = $1
      RETURNING id, email, display_name, handle, role`,
    [acct.id, displayName ?? null, handle ? handle.toLowerCase() : null],
  );
  const a = r.rows[0];
  return c.json({
    id: Number(a.id), email: a.email, display_name: a.display_name,
    handle: a.handle, role: a.role,
  });
});

// ----------------------------------------------------------------- resolve
api.get('/resolve/:slug', async (c) => {
  const slug = c.req.param('slug').toLowerCase();
  if (RESERVED_PATHS.includes(slug)) return c.json({ kind: 'system', slug });
  if (CATEGORIES.includes(slug)) return c.json({ kind: 'category', slug });
  const ev = await pool.query('SELECT slug FROM events WHERE slug = $1', [slug]);
  if (ev.rowCount) return c.json({ kind: 'event', slug });
  const cal = await pool.query('SELECT slug FROM calendars WHERE slug = $1', [slug]);
  if (cal.rowCount) return c.json({ kind: 'calendar', slug });
  const acct = await pool.query('SELECT handle FROM accounts WHERE handle = $1', [slug]);
  if (acct.rowCount) return c.json({ kind: 'account', slug });
  return notFound(c);
});

// -------------------------------------------------------------- categories
api.get('/categories', async (c) => {
  const r = await pool.query(
    `SELECT category,
            count(*) FILTER (WHERE state IN ('published','registration_closed')) AS events
       FROM events GROUP BY category`,
  );
  const counts = new Map(r.rows.map((row: any) => [row.category, Number(row.events)]));
  const cal = await pool.query('SELECT category, count(*) AS n FROM calendars GROUP BY category');
  const calCounts = new Map(cal.rows.map((row: any) => [row.category, Number(row.n)]));
  return c.json(CATEGORIES.map((name) => ({
    slug: name,
    event_count: counts.get(name) ?? 0,
    calendar_count: calCounts.get(name) ?? 0,
  })));
});

// ------------------------------------------------------------------ events
api.get('/events', async (c) => {
  const q = c.req.query();
  const category = (q.category ?? '').trim();
  const city = (q.city ?? '').trim();
  const term = (q.q ?? '').trim(); // whitespace-only q is treated as absent
  let limit = Number(q.limit ?? 20);
  let offset = Number(q.offset ?? 0);
  if (!Number.isFinite(limit) || limit <= 0) limit = 20;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  limit = Math.min(Math.floor(limit), 100);
  offset = Math.floor(offset);

  // The three filters combine as one condition: each narrows, none widens.
  const where: string[] = [`e.state IN ('published','registration_closed')`];
  const params: any[] = [];
  if (category) {
    params.push(category.toLowerCase());
    where.push(`lower(e.category) = $${params.length}`);
  }
  if (city) {
    params.push(city.toLowerCase());
    where.push(`lower(e.city) = $${params.length}`);
  }
  if (term) {
    params.push(`%${term.toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(
      `(lower(e.title) LIKE ${p} OR lower(e.description) LIKE ${p} OR lower(cal.name) LIKE ${p})`,
    );
  }
  const whereSql = where.join(' AND ');

  const totalRes = await pool.query(
    `SELECT count(*)::int AS n FROM events e JOIN calendars cal ON cal.id = e.calendar_id
      WHERE ${whereSql}`,
    params,
  );
  const total = totalRes.rows[0].n as number;

  const rows = await pool.query(
    `SELECT e.*, cal.slug AS calendar_slug, cal.name AS calendar_name,
            cal.is_public AS calendar_is_public,
            (SELECT count(*)::int FROM registrations r
              WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in')) AS confirmed_count
       FROM events e JOIN calendars cal ON cal.id = e.calendar_id
      WHERE ${whereSql}
      ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  c.header('X-Total-Count', String(total));
  c.header('Access-Control-Expose-Headers', 'X-Total-Count');
  return c.json(rows.rows.map((r: any) => eventPublic(r, Number(r.confirmed_count))));
});

api.get('/events/:slug', async (c) => {
  const acct = await currentAccount(c);
  const ev = await loadEventFor(c, c.req.param('slug'), acct);
  if (!ev) return notFound(c);
  const confirmed = await confirmedCount(pool, Number(ev.id));
  const out: any = eventDetail(ev, confirmed);
  if (acct) {
    const mine = await pool.query(
      'SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2',
      [ev.id, acct.id],
    );
    out.my_registration = mine.rowCount ? regPublic(mine.rows[0]) : null;
    out.is_owner = Number(ev.owner_account_id) === acct.id;
  } else {
    out.my_registration = null;
    out.is_owner = false;
  }
  return c.json(out);
});

api.post('/events', async (c) => {
  const acct = await requireHost(c);
  const body = await readJson(c);
  const calendarSlug = str(body, 'calendar_slug', { max: 80 });
  const cal = await pool.query(
    'SELECT * FROM calendars WHERE slug = $1', [calendarSlug.toLowerCase()],
  );
  if (!cal.rowCount) throw new RuleError('That calendar does not exist.', 404, 'calendar_slug');
  if (Number(cal.rows[0].owner_account_id) !== acct.id) throw new RuleError('not found', 404);

  const title = str(body, 'title', { max: 160 });
  const category = optStr(body, 'category', 60)?.toLowerCase();
  const city = optStr(body, 'city', 120);
  const description = optStr(body, 'description', 5000) ?? '';
  const timeZone = optStr(body, 'time_zone', 60) || 'UTC';
  if (!isValidTimeZone(timeZone)) {
    throw new RuleError('Provide a valid IANA time zone, such as Europe/Berlin.', 400, 'time_zone');
  }
  if (category && !CATEGORIES.includes(category)) {
    throw new RuleError('Choose one of the twelve categories.', 400, 'category');
  }
  const capacity = optInt(body, 'capacity');
  if (capacity !== undefined && (capacity < 1 || capacity > 500)) {
    throw new RuleError('Capacity runs from 1 to 500.', 400, 'capacity');
  }
  const startsAt = parseInstant(body.starts_at, 'starts_at');
  const endsAt = parseInstant(body.ends_at, 'ends_at');
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new RuleError('The end time must come after the start time.', 400, 'ends_at');
  }

  let slug = (optStr(body, 'slug', 80) || title).toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'event';
  const requested = optStr(body, 'slug', 80);
  if (requested) {
    if (!isKebab(slug)) throw new RuleError('An address uses lowercase letters, numbers and hyphens.', 400, 'slug');
    if (await namespaceTaken(slug)) throw new RuleError('That address is already taken.', 409, 'slug');
  } else {
    const base = slug;
    for (let i = 0; i < 500; i++) {
      if (!(await namespaceTaken(slug))) break;
      slug = `${base}-${i + 2}`;
    }
  }

  // Publishing needs every field; a submission missing any is stored as draft.
  const complete = Boolean(title && category && city && startsAt && endsAt && capacity !== undefined);
  const state = complete ? 'published' : 'draft';
  const coverSeed = optStr(body, 'cover_seed', 80) || `${slug}-${Date.now().toString(36)}`;
  const themeHex = (optStr(body, 'theme_hex', 7) || themeFromSeed(coverSeed)).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(themeHex)) {
    throw new RuleError('A theme colour looks like #rrggbb.', 400, 'theme_hex');
  }

  const r = await pool.query(
    `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed,
                         theme_hex, description, starts_at, ends_at, capacity,
                         approval_required, waitlist_enabled, state, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      cal.rows[0].id, title, slug, category ?? cal.rows[0].category, city ?? cal.rows[0].city,
      timeZone, coverSeed, themeHex, description, startsAt, endsAt, capacity ?? null,
      optBool(body, 'approval_required') ?? false,
      optBool(body, 'waitlist_enabled') ?? true,
      state, state === 'published' ? new Date() : null,
    ],
  );
  const ev = await loadEvent(r.rows[0].slug);
  log('info', 'event created', { slug, state });
  return c.json(eventDetail(ev, 0), 201);
});

function parseInstant(v: any, field: string): Date | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw new RuleError(`${field} must be an RFC 3339 instant in UTC.`, 400, field);
  // Every timestamp crossing the API is an instant in UTC with a trailing Z.
  if (!/Z$/.test(v.trim())) {
    throw new RuleError(`${field} must be an instant in UTC ending in Z.`, 400, field);
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new RuleError(`${field} is not a valid instant.`, 400, field);
  return d;
}

api.patch('/events/:slug', async (c) => {
  const acct = await requireAccount(c);
  const ev = await loadEvent(c.req.param('slug'));
  if (!ev) return notFound(c);
  assertOwner(ev, acct);
  const body = await readJson(c);

  const out = await tx(async (client) => {
    await lockEvent(client, Number(ev.id));
    const fresh = (await client.query(`${EVENT_SELECT} WHERE e.id = $1`, [ev.id])).rows[0];
    if (fresh.state === 'cancelled') {
      throw new RuleError('A cancelled event cannot be changed.', 409, 'state');
    }

    const sets: string[] = [];
    const params: any[] = [];
    const push = (frag: string, value: any) => {
      params.push(value);
      sets.push(`${frag} = $${params.length}`);
    };

    const title = optStr(body, 'title', 160);
    if (title !== undefined) {
      if (!title) throw new RuleError('Give the event a name.', 400, 'title');
      push('title', title);
    }
    const description = optStr(body, 'description', 5000);
    if (description !== undefined) push('description', description);
    const city = optStr(body, 'city', 120);
    if (city !== undefined) push('city', city);
    const category = optStr(body, 'category', 60);
    if (category !== undefined) {
      const cat = category.toLowerCase();
      if (!CATEGORIES.includes(cat)) throw new RuleError('Choose one of the twelve categories.', 400, 'category');
      push('category', cat);
    }
    const timeZone = optStr(body, 'time_zone', 60);
    if (timeZone !== undefined) {
      if (!isValidTimeZone(timeZone)) {
        throw new RuleError('Provide a valid IANA time zone.', 400, 'time_zone');
      }
      push('time_zone', timeZone);
    }
    const approval = optBool(body, 'approval_required');
    if (approval !== undefined) push('approval_required', approval);
    const waitlist = optBool(body, 'waitlist_enabled');
    if (waitlist !== undefined) push('waitlist_enabled', waitlist);

    const startsAt = body.starts_at !== undefined ? parseInstant(body.starts_at, 'starts_at') : undefined;
    const endsAt = body.ends_at !== undefined ? parseInstant(body.ends_at, 'ends_at') : undefined;
    const finalStart = startsAt !== undefined ? startsAt : fresh.starts_at;
    const finalEnd = endsAt !== undefined ? endsAt : fresh.ends_at;
    if (finalStart && finalEnd && new Date(finalEnd).getTime() <= new Date(finalStart).getTime()) {
      throw new RuleError('The end time must come after the start time.', 400, 'ends_at');
    }
    if (startsAt !== undefined) push('starts_at', startsAt);
    if (endsAt !== undefined) push('ends_at', endsAt);

    const confirmed = await confirmedCount(client, Number(ev.id));
    let promoted: Promotion[] = [];
    const capacity = optInt(body, 'capacity');
    if (capacity !== undefined) {
      if (capacity < 1 || capacity > 500) {
        throw new RuleError('Capacity runs from 1 to 500.', 400, 'capacity');
      }
      if (capacity < confirmed) {
        throw new RuleError(`You already have ${confirmed} guests confirmed.`, 409, 'capacity');
      }
      push('capacity', capacity);
    }

    // State transitions: published <-> registration_closed only.
    const state = optStr(body, 'state', 40);
    if (state !== undefined) {
      const from = fresh.state;
      const to = state;
      const allowed =
        (from === 'published' && to === 'registration_closed') ||
        (from === 'registration_closed' && to === 'published') ||
        (from === 'draft' && to === 'published') ||
        from === to;
      if (!allowed) {
        throw new RuleError(`An event cannot move from ${from} to ${to}.`, 409, 'state');
      }
      if (to === 'published' && from === 'draft') {
        const t = title ?? fresh.title;
        const cat = (category ?? fresh.category);
        const ci = city ?? fresh.city;
        const st = finalStart;
        const en = finalEnd;
        const cap = capacity ?? fresh.capacity;
        if (!t || !cat || !ci || !st || !en || cap === null) {
          throw new RuleError(
            'Publishing needs a title, a category, a city, a start, an end and a capacity.',
            400, 'state',
          );
        }
        push('published_at', new Date());
      }
      push('state', to);
    }

    if (sets.length === 0) {
      const cur = (await client.query(`${EVENT_SELECT} WHERE e.id = $1`, [ev.id])).rows[0];
      return { row: cur, promoted, confirmed, notified: [] as any[] };
    }

    params.push(ev.id);
    await client.query(
      `UPDATE events SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
      params,
    );

    const updated = (await client.query(`${EVENT_SELECT} WHERE e.id = $1`, [ev.id])).rows[0];

    // Raising capacity fills the seats that just appeared, in this request.
    if (capacity !== undefined && capacity > (fresh.capacity ?? 0)) {
      const free = capacity - confirmed;
      if (free > 0) {
        promoted = await promoteFromWaitlist(client, updated as EventRow, free);
      }
    }

    // Changing time or place with confirmed guests mails every one of them.
    const movedTime = startsAt !== undefined || endsAt !== undefined;
    const movedPlace = city !== undefined;
    let notified: any[] = [];
    if ((movedTime || movedPlace) && updated.state !== 'draft') {
      const guests = await client.query(
        `SELECT r.id, a.email, a.display_name FROM registrations r
           JOIN accounts a ON a.id = r.account_id
          WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in')`,
        [ev.id],
      );
      notified = guests.rows;
    }
    return { row: updated, promoted, confirmed, notified };
  });

  // Mail is sent from the request that causes the transition.
  for (const p of out.promoted) {
    await sendMail({
      to: p.email, transition: 'promoted', eventId: Number(ev.id),
      registrationId: Number(p.registration.id),
      ctx: {
        title: out.row.title, displayName: p.display_name,
        ticketCode: p.registration.ticket_code,
        ticketUrl: ticketUrl(p.registration.ticket_code),
      },
    });
  }
  for (const g of out.notified) {
    await sendMail({
      to: g.email, transition: 'event_updated', eventId: Number(ev.id),
      registrationId: Number(g.id),
      ctx: {
        title: out.row.title, displayName: g.display_name,
        details: describeWhen(out.row),
        eventUrl: eventUrl(out.row.slug),
      },
    });
  }

  const confirmedNow = await confirmedCount(pool, Number(ev.id));
  const res: any = eventDetail(out.row, confirmedNow);
  res.promoted_count = out.promoted.length;
  return c.json(res);
});

function describeWhen(row: any): string {
  const when = rfc3339(row.starts_at);
  return `It now starts at ${when} (${row.time_zone})${row.city ? ` in ${row.city}` : ''}.`;
}

function eventUrl(slug: string): string {
  const base = PUBLIC_URL();
  return base ? `${base}/${slug}` : `/${slug}`;
}

function ticketUrl(code: string | null | undefined): string | undefined {
  if (!code) return undefined;
  const base = PUBLIC_URL();
  return base ? `${base}/t/${code}` : `/t/${code}`;
}

api.post('/events/:slug/cancel', async (c) => {
  const acct = await requireAccount(c);
  const ev = await loadEvent(c.req.param('slug'));
  if (!ev) return notFound(c);
  assertOwner(ev, acct);
  const body = await readJson(c);
  const reason = (optStr(body, 'reason', 2000) ?? optStr(body, 'cancel_reason', 2000) ?? '').trim();
  if (!reason) throw new RuleError('Give a reason so your guests know what happened.', 400, 'reason');
  if (ev.state === 'cancelled') throw new RuleError('This event is already cancelled.', 409, 'state');

  const result = await tx(async (client) => {
    await lockEvent(client, Number(ev.id));
    const guests = await client.query(
      `SELECT r.id, a.email, a.display_name FROM registrations r
         JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1 AND r.status IN ('pending_approval','confirmed','waitlisted','checked_in')`,
      [ev.id],
    );
    await client.query(
      `UPDATE events SET state = 'cancelled', cancelled_at = now(),
              cancel_reason = $2, updated_at = now()
        WHERE id = $1`,
      [ev.id, reason],
    );
    const row = (await client.query(`${EVENT_SELECT} WHERE e.id = $1`, [ev.id])).rows[0];
    return { row, guests: guests.rows };
  });

  // Every guest still holding a place gets the host's own words, unedited.
  for (const g of result.guests) {
    await sendMail({
      to: g.email, transition: 'event_cancelled', eventId: Number(ev.id),
      registrationId: Number(g.id),
      ctx: { title: result.row.title, displayName: g.display_name, cancelReason: reason },
    });
  }
  log('info', 'event cancelled', { slug: ev.slug, notified: result.guests.length });
  return c.json(eventDetail(result.row, await confirmedCount(pool, Number(ev.id))));
});

// ---------------------------------------------------------- host guest list
const GUEST_LIST_SQL = `
  SELECT r.id, r.account_id, a.email, a.display_name, r.status,
         r.waitlist_position, r.ticket_code, r.checked_in_at, r.created_at
    FROM registrations r JOIN accounts a ON a.id = r.account_id
   WHERE r.event_id = $1
   ORDER BY r.status ASC, r.waitlist_position ASC NULLS LAST, a.email ASC
`;

api.get('/events/:slug/registrations', async (c) => {
  const acct = await requireAccount(c);
  const ev = await loadEvent(c.req.param('slug'));
  if (!ev) return notFound(c);
  assertOwner(ev, acct);
  const rows = await pool.query(GUEST_LIST_SQL, [ev.id]);
  return c.json(rows.rows.map((r: any) => ({
    id: Number(r.id),
    account_id: Number(r.account_id),
    email: r.email,
    display_name: r.display_name,
    status: r.status,
    waitlist_position: r.waitlist_position ?? null,
    ticket_code: r.ticket_code ?? null,
    checked_in_at: rfc3339(r.checked_in_at),
  })));
});

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

api.get('/events/:slug/registrations.csv', async (c) => {
  const acct = await requireAccount(c);
  const ev = await loadEvent(c.req.param('slug'));
  if (!ev) return notFound(c);
  assertOwner(ev, acct);
  const rows = await pool.query(GUEST_LIST_SQL, [ev.id]);
  const lines = ['email,display_name,status,waitlist_position,ticket_code'];
  for (const r of rows.rows) {
    lines.push([
      csvCell(r.email), csvCell(r.display_name), csvCell(r.status),
      csvCell(r.waitlist_position), csvCell(r.ticket_code),
    ].join(','));
  }
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${ev.slug}.csv"`);
  return c.body(lines.join('\n') + '\n');
});

// ----------------------------------------------------------- registrations
api.post('/registrations', async (c) => {
  const acct = await requireAccount(c);
  const body = await readJson(c);
  const slug = str(body, 'event_slug', { max: 80 });
  rateLimit(`register:${acct.id}`);

  const evRow = await loadEvent(slug);
  if (!evRow) return notFound(c);
  if (evRow.state === 'draft' && Number(evRow.owner_account_id) !== acct.id) return notFound(c);
  if (evRow.state === 'cancelled') {
    throw new RuleError('This event has been cancelled.', 409, 'state');
  }
  if (evRow.state === 'registration_closed') {
    throw new RuleError('Registration is closed for this event.', 409, 'state');
  }
  if (evRow.state !== 'published') {
    throw new RuleError('This event is not open for registration.', 409, 'state');
  }

  const outcome = await tx(async (client) => {
    await lockEvent(client, Number(evRow.id));
    const ev = (await client.query(`${EVENT_SELECT} WHERE e.id = $1 FOR SHARE OF e`, [evRow.id])).rows[0];
    const capacity: number = ev.capacity;

    // At most one registration per event per account, in any status: a repeat
    // submission updates the row it already has and never adds a second.
    const existing = await client.query(
      'SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2 FOR UPDATE',
      [ev.id, acct.id],
    );
    let regId: number;
    if (existing.rowCount) {
      const cur = existing.rows[0] as RegRow;
      if (HOLDS_PLACE.includes(cur.status)) {
        return { reg: cur, transition: null as any, repeat: true };
      }
      regId = Number(cur.id);
      await client.query(
        `UPDATE registrations SET status = 'pending_approval', seat_no = NULL,
                event_capacity = NULL, ticket_code = NULL, waitlist_position = NULL,
                checked_in_at = NULL, updated_at = now()
          WHERE id = $1`,
        [regId],
      );
    } else {
      const ins = await client.query(
        `INSERT INTO registrations (event_id, account_id, status)
         VALUES ($1, $2, 'pending_approval')
         ON CONFLICT (event_id, account_id) DO NOTHING
         RETURNING id`,
        [ev.id, acct.id],
      );
      if (!ins.rowCount) {
        const again = await client.query(
          'SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2',
          [ev.id, acct.id],
        );
        return { reg: again.rows[0] as RegRow, transition: null as any, repeat: true };
      }
      regId = Number(ins.rows[0].id);
    }

    // With approval on, the registration starts pending and holds no seat.
    if (ev.approval_required) {
      const r = await client.query('SELECT * FROM registrations WHERE id = $1', [regId]);
      return { reg: r.rows[0] as RegRow, transition: 'pending' as const, repeat: false };
    }

    const seat = await nextFreeSeat(client, Number(ev.id), capacity);
    if (seat !== null) {
      const reg = await seatRegistration(client, regId, Number(ev.id), capacity);
      return { reg, transition: 'confirmed' as const, repeat: false };
    }
    if (ev.waitlist_enabled) {
      const reg = await waitlistRegistration(client, regId, Number(ev.id));
      return { reg, transition: 'waitlisted' as const, repeat: false };
    }
    // Full with no waiting list: rejected, and the transaction leaves no row.
    throw new RuleError('This event is full.', 409, 'capacity');
  });

  if (outcome.transition) {
    await sendMail({
      to: acct.email,
      transition: outcome.transition,
      eventId: Number(evRow.id),
      registrationId: Number(outcome.reg.id),
      ctx: {
        title: evRow.title,
        displayName: acct.display_name,
        ticketCode: outcome.reg.ticket_code,
        waitlistPosition: outcome.reg.waitlist_position,
        ticketUrl: ticketUrl(outcome.reg.ticket_code),
        eventUrl: eventUrl(evRow.slug),
      },
    });
  }
  return c.json(regPublic(outcome.reg), outcome.repeat ? 200 : 201);
});

api.get('/registrations/me', async (c) => {
  const acct = await requireAccount(c);
  const rows = await pool.query(
    `SELECT r.*, e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone,
            e.theme_hex, e.cover_seed, e.city, e.state AS event_state, e.capacity
       FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE r.account_id = $1
      ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC`,
    [acct.id],
  );
  return c.json(rows.rows.map((r: any) => ({
    ...regPublic(r),
    event_slug: r.event_slug,
    title: r.title,
    starts_at: rfc3339(r.starts_at),
    ends_at: rfc3339(r.ends_at),
    time_zone: r.time_zone,
    theme_hex: r.theme_hex,
    cover_seed: r.cover_seed,
    city: r.city,
    event_state: r.event_state,
    has_ended: r.ends_at ? new Date(r.ends_at).getTime() < Date.now() : false,
  })));
});

/** A guest cancels their own registration: the seat is freed in this same
 *  request and the head of the waiting list takes it. Sends the guest no mail. */
api.post('/registrations/:id/cancel', async (c) => {
  const acct = await requireAccount(c);
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return notFound(c);

  const owned = await pool.query(
    `SELECT r.*, e.slug FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE r.id = $1`, [id],
  );
  if (!owned.rowCount) return notFound(c);
  if (Number(owned.rows[0].account_id) !== acct.id) return notFound(c);

  const out = await tx(async (client) => {
    const eventId = Number(owned.rows[0].event_id);
    await lockEvent(client, eventId);
    const cur = (await client.query('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [id])).rows[0];
    const ev = (await client.query(`${EVENT_SELECT} WHERE e.id = $1`, [eventId])).rows[0];
    if (!HOLDS_PLACE.includes(cur.status)) {
      return { reg: cur, promoted: [] as Promotion[], ev };
    }
    const wasSeated = cur.seat_no !== null;
    const reg = await releaseRegistration(client, id, 'cancelled_by_guest');
    await renumberWaitlist(client, eventId);
    let promoted: Promotion[] = [];
    // While registration is closed a freed seat promotes nobody.
    if (wasSeated && ev.state === 'published') {
      promoted = await promoteFromWaitlist(client, ev as EventRow, 1);
    }
    return { reg, promoted, ev };
  });

  for (const p of out.promoted) {
    await sendMail({
      to: p.email, transition: 'promoted', eventId: Number(out.ev.id),
      registrationId: Number(p.registration.id),
      ctx: {
        title: out.ev.title, displayName: p.display_name,
        ticketCode: p.registration.ticket_code,
        ticketUrl: ticketUrl(p.registration.ticket_code),
      },
    });
  }
  return c.json(regPublic(out.reg));
});

async function hostRegistrationScope(c: Context, id: number) {
  const acct = await requireAccount(c);
  const r = await pool.query(
    `SELECT r.*, e.id AS event_id, e.slug, e.title, e.capacity, e.state, e.waitlist_enabled,
            e.time_zone, e.starts_at, e.calendar_id, cal.owner_account_id
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       JOIN calendars cal ON cal.id = e.calendar_id
      WHERE r.id = $1`,
    [id],
  );
  if (!r.rowCount) throw new RuleError('not found', 404);
  const row = r.rows[0];
  if (Number(row.owner_account_id) !== acct.id) throw new RuleError('not found', 404);
  return { acct, row };
}

api.post('/registrations/:id/approve', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return notFound(c);
  const { row } = await hostRegistrationScope(c, id);
  if (row.status !== 'pending_approval') {
    throw new RuleError('That request is no longer awaiting a decision.', 409, 'status');
  }

  const out = await tx(async (client) => {
    await lockEvent(client, Number(row.event_id));
    const cur = (await client.query('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (cur.status !== 'pending_approval') {
      throw new RuleError('That request is no longer awaiting a decision.', 409, 'status');
    }
    const ev = (await client.query(`${EVENT_SELECT} WHERE e.id = $1`, [row.event_id])).rows[0];
    const seat = await nextFreeSeat(client, Number(ev.id), ev.capacity);
    if (seat !== null) {
      const reg = await seatRegistration(client, id, Number(ev.id), ev.capacity);
      return { reg, transition: 'approved' as const, ev, waitlisted: false };
    }
    if (ev.waitlist_enabled) {
      // Approving into a full event moves the row to the waiting list and says so.
      const reg = await waitlistRegistration(client, id, Number(ev.id));
      return { reg, transition: 'waitlisted' as const, ev, waitlisted: true };
    }
    throw new RuleError('This event is full and its waiting list is off.', 409, 'capacity');
  });

  const guest = await pool.query('SELECT email, display_name FROM accounts WHERE id = $1', [row.account_id]);
  await sendMail({
    to: guest.rows[0].email,
    transition: out.transition,
    eventId: Number(out.ev.id),
    registrationId: Number(out.reg.id),
    ctx: {
      title: out.ev.title, displayName: guest.rows[0].display_name,
      ticketCode: out.reg.ticket_code, waitlistPosition: out.reg.waitlist_position,
      ticketUrl: ticketUrl(out.reg.ticket_code), eventUrl: eventUrl(out.ev.slug),
    },
  });
  return c.json({ ...regPublic(out.reg), moved_to_waitlist: out.waitlisted });
});

api.post('/registrations/:id/decline', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return notFound(c);
  const { row } = await hostRegistrationScope(c, id);
  if (row.status !== 'pending_approval') {
    throw new RuleError('That request is no longer awaiting a decision.', 409, 'status');
  }
  const reg = await tx(async (client) => {
    await lockEvent(client, Number(row.event_id));
    return releaseRegistration(client, id, 'declined');
  });
  const guest = await pool.query('SELECT email, display_name FROM accounts WHERE id = $1', [row.account_id]);
  await sendMail({
    to: guest.rows[0].email, transition: 'declined', eventId: Number(row.event_id),
    registrationId: Number(reg.id),
    ctx: { title: row.title, displayName: guest.rows[0].display_name },
  });
  return c.json(regPublic(reg));
});

// ----------------------------------------------------------------- tickets
/** The code itself is the credential, so any caller presenting a real code is
 *  answered. It carries the ticket, never the guest list. */
api.get('/tickets/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const r = await pool.query(
    `SELECT r.id, r.status, r.ticket_code, r.checked_in_at, r.waitlist_position,
            a.display_name,
            e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone,
            e.city, e.theme_hex, e.cover_seed, e.state AS event_state, e.cancel_reason,
            cal.name AS calendar_name
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       JOIN calendars cal ON cal.id = e.calendar_id
       JOIN accounts a ON a.id = r.account_id
      WHERE r.ticket_code = $1`,
    [code],
  );
  if (!r.rowCount) return notFound(c);
  const t = r.rows[0];
  return c.json({
    id: Number(t.id),
    event_slug: t.event_slug,
    title: t.title,
    starts_at: rfc3339(t.starts_at),
    ends_at: rfc3339(t.ends_at),
    time_zone: t.time_zone,
    city: t.city,
    status: t.status,
    ticket_code: t.ticket_code,
    checked_in_at: rfc3339(t.checked_in_at),
    display_name: t.display_name,
    theme_hex: t.theme_hex,
    theme: deriveTheme(t.theme_hex),
    cover_seed: t.cover_seed,
    event_state: t.event_state,
    calendar_name: t.calendar_name,
  });
});

/** The owning host checks a ticket in. A second check-in of the same code
 *  records one arrival, not two. */
api.post('/tickets/:code/check-in', async (c) => {
  const acct = await requireAccount(c);
  const code = c.req.param('code').toUpperCase();
  const r = await pool.query(
    `SELECT r.*, e.id AS event_id, e.title, cal.owner_account_id
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       JOIN calendars cal ON cal.id = e.calendar_id
      WHERE r.ticket_code = $1`,
    [code],
  );
  if (!r.rowCount) return notFound(c);
  const row = r.rows[0];
  if (Number(row.owner_account_id) !== acct.id) return notFound(c);

  const out = await tx(async (client) => {
    const cur = (await client.query(
      'SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [row.id],
    )).rows[0];
    if (cur.status === 'checked_in') {
      return { reg: cur, already: true };
    }
    if (cur.status !== 'confirmed') {
      throw new RuleError('That ticket is not a confirmed seat.', 409, 'status');
    }
    const upd = await client.query(
      `UPDATE registrations SET status = 'checked_in', checked_in_at = now(), updated_at = now()
        WHERE id = $1 RETURNING *`,
      [row.id],
    );
    return { reg: upd.rows[0], already: false };
  });
  return c.json({ ...regPublic(out.reg), already_checked_in: out.already });
});

// --------------------------------------------------------------- calendars
api.get('/calendars', async (c) => {
  const acct = await requireAccount(c);
  const rows = await pool.query(
    `SELECT cal.*,
            (SELECT count(*)::int FROM events e
              WHERE e.calendar_id = cal.id AND e.state IN ('published','registration_closed')) AS published_count
       FROM calendars cal WHERE cal.owner_account_id = $1 ORDER BY cal.created_at ASC`,
    [acct.id],
  );
  return c.json(rows.rows.map((r: any) => ({
    id: Number(r.id),
    owner_account_id: Number(r.owner_account_id),
    name: r.name, slug: r.slug, category: r.category, city: r.city,
    is_public: r.is_public, published_count: Number(r.published_count),
    created_at: rfc3339(r.created_at),
  })));
});

api.post('/calendars', async (c) => {
  const acct = await requireHost(c); // a guest is refused calendar creation
  const body = await readJson(c);
  const name = str(body, 'name', { max: 120 });
  const slug = str(body, 'slug', { max: 80 }).toLowerCase();
  const category = str(body, 'category', { max: 60 }).toLowerCase();
  const city = str(body, 'city', { max: 120 });
  const isPublic = optBool(body, 'is_public') ?? true;
  if (!CATEGORIES.includes(category)) {
    throw new RuleError('Choose one of the twelve categories.', 400, 'category');
  }
  if (!isKebab(slug)) {
    throw new RuleError('An address uses lowercase letters, numbers and hyphens.', 400, 'slug');
  }
  if (await namespaceTaken(slug)) {
    throw new RuleError('That address is already taken.', 409, 'slug');
  }
  const r = await pool.query(
    `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [acct.id, name, slug, category, city, isPublic],
  );
  const cal = r.rows[0];
  return c.json({
    id: Number(cal.id), owner_account_id: Number(cal.owner_account_id),
    name: cal.name, slug: cal.slug, category: cal.category, city: cal.city,
    is_public: cal.is_public, published_count: 0, created_at: rfc3339(cal.created_at),
  }, 201);
});

api.get('/calendars/:slug', async (c) => {
  const r = await pool.query(
    `SELECT cal.*, a.display_name AS owner_name, a.handle AS owner_handle
       FROM calendars cal JOIN accounts a ON a.id = cal.owner_account_id
      WHERE cal.slug = $1`,
    [c.req.param('slug')],
  );
  if (!r.rowCount) return notFound(c);
  const cal = r.rows[0];
  const events = await pool.query(
    `SELECT e.*, cal.slug AS calendar_slug, cal.name AS calendar_name,
            cal.is_public AS calendar_is_public,
            (SELECT count(*)::int FROM registrations r
              WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in')) AS confirmed_count
       FROM events e JOIN calendars cal ON cal.id = e.calendar_id
      WHERE e.calendar_id = $1 AND e.state IN ('published','registration_closed')
      ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC`,
    [cal.id],
  );
  return c.json({
    id: Number(cal.id), name: cal.name, slug: cal.slug, category: cal.category,
    city: cal.city, is_public: cal.is_public,
    owner_name: cal.owner_name, owner_handle: cal.owner_handle,
    events: events.rows.map((r: any) => eventPublic(r, Number(r.confirmed_count))),
  });
});

api.get('/accounts/handle/:handle', async (c) => {
  const r = await pool.query(
    'SELECT id, display_name, handle, role, created_at FROM accounts WHERE handle = $1',
    [c.req.param('handle')],
  );
  if (!r.rowCount) return notFound(c);
  const a = r.rows[0];
  const cals = await pool.query(
    `SELECT slug, name, category, city, is_public FROM calendars
      WHERE owner_account_id = $1 AND is_public = true`,
    [a.id],
  );
  return c.json({
    display_name: a.display_name, handle: a.handle, role: a.role,
    created_at: rfc3339(a.created_at),
    calendars: cals.rows,
  });
});

// ------------------------------------------------------------ error shaping
api.notFound((c) => notFound(c));

api.onError((err, c) => {
  if (err instanceof RuleError) {
    if (err.status === 404) return notFound(c);
    return fail(c, err.message, err.status, err.field);
  }
  const pgErr = err as any;
  // A violated database invariant is a business-rule refusal, never a 500.
  if (pgErr?.code === '23505' || pgErr?.code === '23514' || pgErr?.code === '23503') {
    log('warn', 'constraint refused a write', { code: pgErr.code, constraint: pgErr.constraint });
    if (pgErr.constraint === 'registrations_event_account_key') {
      return fail(c, 'You already have a registration for this event.', 409);
    }
    return fail(c, 'This event just filled up. Please try again.', 409);
  }
  log('error', 'unhandled', { err: String(err), stack: (err as Error).stack });
  return c.json({ message: 'Something went wrong on our side. Please try again.' }, 500);
});
