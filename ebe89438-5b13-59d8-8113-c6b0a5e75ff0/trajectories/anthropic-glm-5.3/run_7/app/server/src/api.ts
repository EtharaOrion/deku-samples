import { Hono } from 'hono';
import { Pool } from 'pg';
import { randomToken, EMAIL_RE, KEBAB_RE, RESERVED_PATHS, CATEGORIES, slugify, themeHexFromSeed, nowIso, HEX_RE, IANA_RE } from './constants.js';
import { hashPassword, verifyPassword } from './password.js';
import { withTransaction } from './db.js';
import { RuleError, register, cancelByGuest, decide, checkIn, cancelEvent, promoteIfRoom, loadEvent, type MailOutbox } from './registrations.js';
import { sendMail } from './mail.js';
import { log } from './log.js';

export type Env = { Variables: { db: Pool; accountId?: string; account?: any } };

const bad = (c: any, err: RuleError) => c.json({ message: err.message, code: err.code, ...(err.field ? { field: err.field } : {}) }, err.status as any);

const seatCountSql = `(SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in'))`;

const EVENT_CARD = `
  e.slug, e.title, e.category, e.city, e.time_zone, e.starts_at, e.ends_at, e.capacity,
  ${seatCountSql} AS confirmed_count, e.state, e.theme_hex, e.waitlist_enabled,
  (e.capacity - ${seatCountSql}) AS remaining, e.description, e.approval_required`;

function serializeEvent(r: any) {
  return {
    slug: r.slug, title: r.title, category: r.category, city: r.city,
    time_zone: r.time_zone,
    starts_at: iso(r.starts_at), ends_at: iso(r.ends_at),
    capacity: Number(r.capacity), confirmed_count: Number(r.confirmed_count),
    remaining: Number(r.remaining), state: r.state, theme_hex: r.theme_hex,
    description: r.description ?? '', approval_required: r.approval_required,
    waitlist_enabled: r.waitlist_enabled,
    calendar_slug: r.calendar_slug ?? undefined,
    calendar_name: r.calendar_name ?? undefined,
    cancel_reason: r.cancel_reason ?? undefined,
    is_public: r.is_public ?? undefined,
    cover_seed: (r as any).cover_seed ?? undefined,
    published_at: (r as any).published_at ? iso((r as any).published_at) : undefined,
    cancelled_at: (r as any).cancelled_at ? iso((r as any).cancelled_at) : undefined,
    id: (r as any).id,
  };
}

function iso(d: Date | string): string {
  return (d instanceof Date ? d : new Date(d)).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/* ---------------------------------------------------------------------- */

export function apiRoutes(pool: Pool) {
  const api = new Hono<Env>();

  /* ------------------------------- health ------------------------------- */
  api.get('/health', async (c) => {
    try {
      const { rows } = await pool.query('SELECT 1 AS ok');
      if (!rows.length) throw new Error('no rows');
      return c.json({ status: 'ok', time: nowIso() });
    } catch (e) {
      return c.json({ status: 'unavailable' }, 503);
    }
  });

  /* -------------------------------- auth -------------------------------- */
  api.post('/auth/signup', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new RuleError('A request body is required.', 400);
    const email = String((body as any).email ?? '').trim().toLowerCase();
    const password = String((body as any).password ?? '');
    const name = String((body as any).name ?? '').trim();
    if (!EMAIL_RE.test(email)) throw new RuleError('Enter a valid email address.', 400, 'invalid', 'email');
    if (password.length < 8) throw new RuleError('Use a password of at least 8 characters.', 400, 'invalid', 'password');
    if (!name) throw new RuleError('Add your name so hosts know who is coming.', 400, 'invalid', 'name');

    const existing = await pool.query('SELECT id FROM accounts WHERE email = $1', [email]);
    if (existing.rowCount) throw new RuleError('An account with this email already exists.', 409, 'taken', 'email');

    let handle = slugify(name);
    if (!handle || handle.length < 2) handle = 'member-' + randomToken(3).toLowerCase();
    handle = await uniqueHandle(pool, handle);

    const { rows } = await pool.query(
      `INSERT INTO accounts (email, password_hash, display_name, handle, role)
       VALUES ($1,$2,$3,$4,'guest') RETURNING id, email, display_name, handle, role, created_at`,
      [email, hashPassword(password), name, handle],
    );
    const a = rows[0];
    const token = await issueToken(pool, a.id);
    log.info('account_created', { id: a.id, handle: a.handle });
    return c.json({ id: a.id, email: a.email, display_name: a.display_name, handle: a.handle, role: a.role, access_token: token, created_at: iso(a.created_at) }, 201);
  });

  api.post('/auth/login', rateLimit('login'), async (c) => {
    const body = await c.req.json().catch(() => null);
    const email = String((body as any)?.email ?? '').trim().toLowerCase();
    const password = String((body as any)?.password ?? '');
    if (!EMAIL_RE.test(email)) throw new RuleError('Enter a valid email address.', 400, 'invalid', 'email');
    if (!password) throw new RuleError('Enter your password.', 400, 'invalid', 'password');
    const { rows } = await pool.query('SELECT * FROM accounts WHERE email = $1', [email]);
    const a = rows[0];
    if (!a || !verifyPassword(password, a.password_hash)) {
      throw new RuleError('That email and password do not match an account.', 401, 'credentials');
    }
    const token = await issueToken(pool, a.id);
    return c.json({
      access_token: token, id: a.id, email: a.email, display_name: a.display_name,
      handle: a.handle, role: a.role,
    });
  });

  /* ------------------------------ namespace ----------------------------- */
  api.get('/resolve/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (RESERVED_PATHS.has(slug)) return c.json({ kind: 'system', slug });
    if ((CATEGORIES as readonly string[]).includes(slug)) return c.json({ kind: 'category', slug });
    const ev = await pool.query('SELECT slug FROM events WHERE slug = $1', [slug]);
    if (ev.rowCount) return c.json({ kind: 'event', slug });
    const cal = await pool.query('SELECT slug FROM calendars WHERE slug = $1', [slug]);
    if (cal.rowCount) return c.json({ kind: 'calendar', slug });
    const acct = await pool.query('SELECT handle FROM accounts WHERE handle = $1', [slug]);
    if (acct.rowCount) return c.json({ kind: 'account', slug });
    return c.json({ kind: 'not_found', slug }, 404);
  });

  /* ------------------------------- events ------------------------------- */
  api.get('/events', async (c) => {
    const q = c.req.query();
    const where: string[] = [`e.state IN ('published','registration_closed')`];
    const params: unknown[] = [];
    const push = (v: string) => { params.push(v); return '$' + params.length; };

    if (q.category) {
      if (!(CATEGORIES as readonly string[]).includes(q.category)) {
        return c.json([], 200, { 'X-Total-Count': '0' });
      }
      where.push(`e.category = ${push(q.category)}`);
    }
    if (q.city) where.push(`e.city ILIKE ${push(q.city)}`);
    const term = (q.q ?? '').trim();
    if (term) {
      const like = push(`%${term.replace(/[%_]/g, (m) => '\\' + m)}%`);
      where.push(`(e.title ILIKE ${like} OR COALESCE(e.description,'') ILIKE ${like} OR cal.name ILIKE ${like})`);
    }

    let limit = Number(q.limit ?? 20);
    let offset = Number(q.offset ?? 0);
    if (!Number.isFinite(limit) || limit <= 0) limit = 20;
    if (limit > 100) limit = 100;
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    const counted = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM events e JOIN calendars cal ON cal.id = e.calendar_id WHERE ${where.join(' AND ')}`,
      params,
    );
    const total = Number(counted.rows[0].n);

    const { rows } = await pool.query(
      `SELECT ${EVENT_CARD}, cal.slug AS calendar_slug, cal.name AS calendar_name
       FROM events e JOIN calendars cal ON cal.id = e.calendar_id
       WHERE ${where.join(' AND ')}
       ORDER BY e.starts_at ASC, e.slug ASC
       LIMIT ${Math.trunc(limit)} OFFSET ${Math.trunc(offset)}`,
      params,
    );
    return c.json(rows.map(serializeEvent), 200, { 'X-Total-Count': String(total) });
  });

  api.get('/events/:slug', async (c) => {
    const slug = c.req.param('slug');
    const account = await optionalAccount(pool, c);
    const { rows } = await pool.query(
      `SELECT ${EVENT_CARD}, cal.slug AS calendar_slug, cal.name AS calendar_name, cal.is_public,
              e.cancel_reason, e.cover_seed, e.starts_at AS starts_at
       FROM events e JOIN calendars cal ON cal.id = e.calendar_id WHERE e.slug = $1`, [slug]);
    if (!rows.length) throw new RuleError('Not found.', 404, 'not_found');
    const e = rows[0];
    if (e.state === 'draft') {
      const owns = account && await ownsCalendar(pool, account.id, e.calendar_slug);
      if (!owns) throw new RuleError('Not found.', 404, 'not_found');
    }
    const out = serializeEvent(e);
    out.cover_seed = e.cover_seed;
    return c.json(out);
  });

  api.post('/events', requireAuth, requireHost, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const b = body as Record<string, unknown>;
    const account = c.get('account');

    const cal = await pool.query(
      'SELECT * FROM calendars WHERE slug = $1 AND owner_account_id = $2',
      [String(b.calendar_slug ?? ''), account.id],
    );
    if (!cal.rowCount) throw new RuleError('Pick one of your calendars for this event.', 400, 'invalid', 'calendar_slug');

    const title = String(b.title ?? '').trim();
    const category = String(b.category ?? cal.rows[0].category);
    const city = String(b.city ?? cal.rows[0].city);
    const tzRaw = String(b.time_zone ?? 'UTC');
    const capacityRaw = Number(b.capacity ?? 0);
    const approval = b.approval_required === true || b.approval_required === 'true';
    const waitlist = b.waitlist_enabled === true || b.waitlist_enabled === 'true';
    const description = b.description == null ? '' : String(b.description);

    let tzOk = true;
    try { new Intl.DateTimeFormat('en-GB', { timeZone: tzRaw }); } catch { tzOk = false; }
    const tz = tzOk ? tzRaw : 'UTC';

    // A time that is present but not a UTC instant is refused outright; a
    // time that is simply absent falls through to a draft.
    for (const [field, value] of [['starts_at', b.starts_at], ['ends_at', b.ends_at]] as const) {
      if (value !== undefined && value !== null && String(value).trim() !== '' && !tryInstant(value)) {
        throw new RuleError('Times are UTC instants written as RFC 3339 with a Z.', 400, 'invalid', field);
      }
    }
    const startsRaw = tryInstant(b.starts_at);
    const endsRaw = tryInstant(b.ends_at);
    const capOk = Number.isInteger(capacityRaw) && capacityRaw >= 1 && capacityRaw <= 500;
    const windowOk = Boolean(startsRaw && endsRaw && endsRaw > startsRaw);
    const fieldsOk = Boolean(title && category && city && tzOk && windowOk && capOk)
      && (CATEGORIES as readonly string[]).includes(category);

    // A submission missing any of the publishing requirements is stored as a
    // draft, with placeholders holding the row's shape until it is completed.
    const complete = fieldsOk;
    const state = complete ? 'published' : 'draft';
    const starts = startsRaw ?? new Date(Date.now() + 86400000);
    const ends = windowOk ? (endsRaw as Date) : new Date(starts.getTime() + 7200000);
    const capacity = capOk ? capacityRaw : 20;

    if (!title && !description && b.title === undefined) {
      throw new RuleError('Give the event a name.', 400, 'invalid', 'title');
    }
    if (!title) throw new RuleError('Give the event a name.', 400, 'invalid', 'title');

    let slug = slugify(title);
    if (!slug) slug = 'event-' + randomToken(3).toLowerCase();
    slug = await uniqueEventSlug(pool, slug);

    const coverSeed = slug + '-' + randomToken(4).toLowerCase();
    const theme = themeHexFromSeed(coverSeed);

    const { rows } = await pool.query(
      `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex,
        description, starts_at, ends_at, capacity, approval_required, waitlist_enabled, state, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [cal.rows[0].id, title, slug, category, city, tz, coverSeed, theme, description,
        starts, ends, capacity, approval, waitlist, state, state === 'published' ? new Date() : null],
    );
    log.info('event_created', { slug, state });
    return c.json(fullEvent(rows[0]), 201);
  });

  api.patch('/events/:slug', requireAuth, async (c) => {
    const slug = c.req.param('slug');
    const account = c.get('account');
    const body = await c.req.json().catch(() => ({}));
    const b = body as Record<string, unknown>;

    const result = await withTransaction(pool, async (db) => {
      const cur = await db.query(
        `SELECT e.*, cal.slug AS calendar_slug FROM events e JOIN calendars cal ON cal.id = e.calendar_id WHERE e.slug = $1 FOR UPDATE`,
        [slug]);
      if (!cur.rowCount) throw new RuleError('Not found.', 404, 'not_found');
      if (!await ownsCalendarDb(db, account.id, cur.rows[0].calendar_slug)) {
        throw new RuleError('Not found.', 404, 'not_found');
      }
      const e = cur.rows[0];

      if (b.state !== undefined && b.state !== e.state) {
        const to = String(b.state);
        if (e.state === 'cancelled') throw new RuleError('A cancelled event cannot be republished.', 400, 'bad_transition');
        if (to === 'draft') throw new RuleError('A published event cannot go back to draft.', 400, 'bad_transition');
        if (to === 'registration_closed' && e.state !== 'published') throw new RuleError('Registration closes only from published.', 400, 'bad_transition');
        if (to === 'published' && e.state !== 'registration_closed' && e.state !== 'draft') {
          throw new RuleError('This event is already published.', 400, 'bad_transition');
        }
      }

      const next: Record<string, unknown> = {};
      const mails: MailOutbox[] = [];

      if (b.title !== undefined) {
        const t = String(b.title).trim();
        if (!t) throw new RuleError('Give the event a name.', 400, 'invalid', 'title');
        next.title = t;
      }
      if (b.description !== undefined) next.description = String(b.description);
      if (b.city !== undefined) {
        const city = String(b.city).trim();
        if (!city) throw new RuleError('Say which city the event happens in.', 400, 'invalid', 'city');
        next.city = city;
      }
      if (b.category !== undefined) {
        const cat = String(b.category);
        if (!(CATEGORIES as readonly string[]).includes(cat)) throw new RuleError('Pick one of the twelve categories.', 400, 'invalid', 'category');
        next.category = cat;
      }
      if (b.time_zone !== undefined) {
        const tz = String(b.time_zone);
        try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); } catch { throw new RuleError('Use an IANA zone name such as Europe/Berlin.', 400, 'invalid', 'time_zone'); }
        next.time_zone = tz;
      }

      const timeChanged = b.starts_at !== undefined || b.ends_at !== undefined;
      let starts = e.starts_at, ends = e.ends_at;
      if (b.starts_at !== undefined) starts = parseInstant(b.starts_at, 'starts_at');
      if (b.ends_at !== undefined) ends = parseInstant(b.ends_at, 'ends_at');
      if (!(new Date(ends) > new Date(starts))) throw new RuleError('The end has to come after the start.', 400, 'invalid', 'ends_at');
      next.starts_at = starts;
      next.ends_at = ends;

      if (b.capacity !== undefined) {
        const cap = Number(b.capacity);
        if (!Number.isInteger(cap) || cap < 1 || cap > 500) throw new RuleError('Capacity is a whole number from 1 to 500.', 400, 'invalid', 'capacity');
        const { rows: held } = await db.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM registrations WHERE event_id = $1 AND status IN ('confirmed','checked_in')`, [e.id]);
        const confirmed = Number(held[0].n);
        if (cap < confirmed) {
          throw new RuleError(`You already have ${confirmed} guests confirmed.`, 400, 'invalid', 'capacity');
        }
        next.capacity = cap;
      }

      if (b.approval_required !== undefined) next.approval_required = truthy(b.approval_required);
      if (b.waitlist_enabled !== undefined) next.waitlist_enabled = truthy(b.waitlist_enabled);

      const before: any = { starts_at: new Date(e.starts_at), ends_at: new Date(e.ends_at), city: e.city };
      if (b.state !== undefined) next.state = String(b.state);
      if (next.state === 'published' && e.state === 'draft') {
        const merged = { ...e, ...next } as any;
        const missing: string[] = [];
        if (!String(merged.title ?? '').trim()) missing.push('title');
        if (!(CATEGORIES as readonly string[]).includes(String(merged.category))) missing.push('category');
        if (!String(merged.city ?? '').trim()) missing.push('city');
        if (!(new Date(merged.ends_at) > new Date(merged.starts_at))) missing.push('ends_at');
        if (missing.length) {
          throw new RuleError(`Add ${missing.join(', ')} before publishing.`, 400, 'invalid', missing[0]);
        }
      }
      if (next.state === 'published' && !e.published_at) next.published_at = new Date();

      const sets = Object.keys(next).map((k, i) => `"${toSnake(k)}" = $${i + 2}`).join(', ');
      const values = Object.values(next);
      const { rows } = await db.query(
        `UPDATE events SET ${sets} WHERE id = $1 RETURNING *`, [e.id, ...values]);
      const updated = rows[0];

      // Times or place moved on an event that already holds guests: tell them.
      const timeOrPlaceChanged = before.starts_at.getTime() !== new Date(updated.starts_at).getTime()
        || before.ends_at.getTime() !== new Date(updated.ends_at).getTime()
        || String(before.city) !== String(updated.city);
      if (timeOrPlaceChanged && !timeChanged && false) { /* unreachable guard */ }
      if (timeOrPlaceChanged) {
        const holders = await db.query(
          `SELECT r.id, a.email FROM registrations r JOIN accounts a ON a.id = r.account_id
           WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in','waitlisted','pending_approval')`, [e.id]);
        for (const h of holders.rows) {
          mails.push({
            registrationId: h.id, eventId: e.id, to: h.email,
            subject: `Details changed for ${updated.title}`,
            body: `${updated.title} now runs ${iso(updated.starts_at)} to ${iso(updated.ends_at)} in ${updated.city} (${updated.time_zone}).\n\nYour place is unchanged.`,
          });
        }
      }

      // A raise fills seats from the waiting list in the same request.
      let moved = 0;
      if (next.capacity !== undefined && Number(next.capacity) > Number(e.capacity)) {
        const ev2 = { ...updated, starts_at: new Date(updated.starts_at), ends_at: new Date(updated.ends_at) };
        const before2 = await countSeats(db, e.id);
        await promoteIfRoom(db, ev2 as any, mails);
        moved = (await countSeats(db, e.id)) - before2;
      }
      return { updated, mails, moved };
    });

    for (const m of result.mails) await sendMail(pool, { ...m, recipient: m.to });
    log.info('event_updated', { slug, moved: result.moved });
    return c.json({ ...fullEvent(result.updated), moved_to_seats: result.moved });
  });

  api.post('/events/:slug/cancel', requireAuth, async (c) => {
    const slug = c.req.param('slug');
    const account = c.get('account');
    const body = await c.req.json().catch(() => ({}));
    const reason = String((body as any)?.reason ?? '').trim();
    if (!reason) throw new RuleError('Give a reason so guests know what happened.', 400, 'invalid', 'reason');

    const result = await withTransaction(pool, async (db) => {
      const ev = await loadEvent(db, slug);
      if (!ev) throw new RuleError('Not found.', 404, 'not_found');
      const { rows: calRows } = await db.query<{ slug: string }>(
        'SELECT c.slug FROM calendars c JOIN events e ON e.calendar_id = c.id WHERE e.id = $1', [ev.id]);
      if (!await ownsCalendarDb(db, account.id, calRows[0].slug)) throw new RuleError('Not found.', 404, 'not_found');
      if (ev.state === 'cancelled') throw new RuleError('This event is already cancelled.', 400, 'already_cancelled');
      return cancelEvent(db, ev, reason);
    });
    for (const m of result.mails) await sendMail(pool, { ...m, recipient: m.to });
    const { rows } = await pool.query(`SELECT * FROM events WHERE slug = $1`, [slug]);
    return c.json(fullEvent(rows[0]));
  });

  /* ---------------------------- registrations --------------------------- */
  api.get('/events/:slug/registrations', requireAuth, async (c) => {
    const slug = c.req.param('slug');
    const account = c.get('account');
    const ev = await pool.query(
      `SELECT e.id, c.slug AS cal_slug FROM events e JOIN calendars c ON c.id = e.calendar_id WHERE e.slug = $1`, [slug]);
    if (!ev.rowCount || !await ownsCalendar(pool, account.id, ev.rows[0].cal_slug)) {
      throw new RuleError('Not found.', 404, 'not_found');
    }
    const { rows } = await pool.query(
      `SELECT r.id, r.account_id, r.status, r.waitlist_position, r.ticket_code,
              a.email, a.display_name, r.checked_in_at
       FROM registrations r JOIN accounts a ON a.id = r.account_id
       WHERE r.event_id = $1
       ORDER BY r.status ASC, r.waitlist_position ASC NULLS LAST, a.email ASC`, [ev.rows[0].id]);
    return c.json(rows.map((r: any) => ({
      id: r.id, account_id: r.account_id, email: r.email, display_name: r.display_name,
      status: r.status, waitlist_position: r.waitlist_position, ticket_code: r.ticket_code,
      checked_in_at: r.checked_in_at ? iso(r.checked_in_at) : null,
    })));
  });

  api.get('/events/:slug/registrations.csv', requireAuth, async (c) => {
    const slug = c.req.param('slug');
    const account = c.get('account');
    const ev = await pool.query(
      `SELECT e.id, c.slug AS cal_slug FROM events e JOIN calendars c ON c.id = e.calendar_id WHERE e.slug = $1`, [slug]);
    if (!ev.rowCount || !await ownsCalendar(pool, account.id, ev.rows[0].cal_slug)) {
      throw new RuleError('Not found.', 404, 'not_found');
    }
    const { rows } = await pool.query(
      `SELECT a.email, a.display_name, r.status, r.waitlist_position, r.ticket_code
       FROM registrations r JOIN accounts a ON a.id = r.account_id
       WHERE r.event_id = $1
       ORDER BY r.status ASC, r.waitlist_position ASC NULLS LAST, a.email ASC`, [ev.rows[0].id]);
    const lines = ['email,display_name,status,waitlist_position,ticket_code'];
    for (const r of rows) {
      lines.push([r.email, r.display_name, r.status, r.waitlist_position ?? '', r.ticket_code ?? ''].map(csvCell).join(','));
    }
    return c.body(lines.join('\r\n') + '\r\n', 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-guests.csv"`,
    });
  });

  api.post('/registrations', requireAuth, rateLimit('register'), async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const slug = String((body as any)?.event_slug ?? '');
    const account = c.get('account');
    const out = await withTransaction(pool, async (db) => {
      const ev = await loadEvent(db, slug);
      if (!ev) throw new RuleError('Not found.', 404, 'not_found');
      if (ev.state === 'draft') throw new RuleError('Not found.', 404, 'not_found');
      const { reg, mails } = await register(db, ev as any, account.id, account.email);
      return { reg, mails };
    });
    for (const m of out.mails) await sendMail(pool, { ...m, recipient: m.to });
    log.info('registration_created', { slug, status: out.reg.status });
    return c.json({ id: out.reg.id, status: out.reg.status, waitlist_position: out.reg.waitlist_position, ticket_code: out.reg.ticket_code }, 201);
  });

  api.get('/registrations/me', requireAuth, async (c) => {
    const account = c.get('account');
    const { rows } = await pool.query(
      `SELECT r.id, r.status, r.waitlist_position, r.ticket_code, r.created_at, e.slug AS event_slug,
              e.title, e.starts_at, e.ends_at, e.time_zone, e.city, e.theme_hex, e.cover_seed,
              e.state AS event_state, e.capacity, ${seatCountSql} AS confirmed_count
       FROM registrations r JOIN events e ON e.id = r.event_id
       WHERE r.account_id = $1 ORDER BY e.starts_at ASC`, [account.id]);
    return c.json(rows.map((r: any) => ({
      id: r.id, status: r.status, waitlist_position: r.waitlist_position, ticket_code: r.ticket_code,
      event_slug: r.event_slug, title: r.title, starts_at: iso(r.starts_at), ends_at: iso(r.ends_at),
      time_zone: r.time_zone, city: r.city, theme_hex: r.theme_hex, cover_seed: r.cover_seed,
      event_state: r.event_state, capacity: Number(r.capacity), confirmed_count: Number(r.confirmed_count),
    })));
  });

  api.post('/registrations/:id/cancel', requireAuth, async (c) => {
    const id = c.req.param('id');
    const account = c.get('account');
    const out = await withTransaction(pool, async (db) => {
      const { rows } = await db.query(
        `SELECT r.*, e.slug AS eslug FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.id = $1`, [id]);
      if (!rows.length || rows[0].account_id !== account.id) throw new RuleError('Not found.', 404, 'not_found');
      const reg = rows[0];
      if (['cancelled_by_guest', 'cancelled_by_host', 'declined'].includes(reg.status)) {
        return { reg, mails: [] as MailOutbox[], already: true };
      }
      const ev = await loadEvent(db, reg.eslug);
      const res = await cancelByGuest(db, ev as any, reg as any, account.email);
      return { reg: res.reg, mails: res.mails, already: false };
    });
    for (const m of out.mails) await sendMail(pool, { ...m, recipient: m.to });
    const { rows } = await pool.query(`SELECT id, status, waitlist_position, ticket_code FROM registrations WHERE id = $1`, [id]);
    return c.json(rows[0]);
  });

  api.post('/registrations/:id/approve', requireAuth, async (c) => decideRoute(c, 'approve'));
  api.post('/registrations/:id/decline', requireAuth, async (c) => decideRoute(c, 'decline'));

  /* ------------------------------- tickets ------------------------------ */
  api.get('/tickets/:code', async (c) => {
    const code = c.req.param('code').toUpperCase();
    const { rows } = await pool.query(
      `SELECT r.id, r.status, r.ticket_code, r.checked_in_at, e.slug AS event_slug, e.title,
              e.starts_at, e.ends_at, e.time_zone, e.city, e.theme_hex, e.cover_seed, e.capacity
       FROM registrations r JOIN events e ON e.id = r.event_id
       WHERE r.ticket_code = $1 AND r.status IN ('confirmed','checked_in')`, [code]);
    if (!rows.length) throw new RuleError('Not found.', 404, 'not_found');
    const r = rows[0];
    return c.json({
      id: r.id, status: r.status, ticket_code: r.ticket_code,
      checked_in_at: r.checked_in_at ? iso(r.checked_in_at) : null,
      event_slug: r.event_slug, title: r.title, starts_at: iso(r.starts_at), ends_at: iso(r.ends_at),
      time_zone: r.time_zone, city: r.city, theme_hex: r.theme_hex, cover_seed: r.cover_seed,
      capacity: Number(r.capacity),
    });
  });

  api.post('/tickets/:code/check-in', requireAuth, async (c) => {
    const code = c.req.param('code').toUpperCase();
    const account = c.get('account');
    const out = await withTransaction(pool, async (db) => {
      const { rows } = await db.query(
        `SELECT r.*, e.slug AS eslug FROM registrations r JOIN events e ON e.id = r.event_id
         WHERE r.ticket_code = $1 AND r.status IN ('confirmed','checked_in')`, [code]);
      if (!rows.length) throw new RuleError('Not found.', 404, 'not_found');
      const reg = rows[0];
      const { rows: calRows } = await db.query(
        'SELECT c.slug FROM calendars c JOIN events e ON e.calendar_id = c.id WHERE e.id = $1', [reg.event_id]);
      if (!await ownsCalendarDb(db, account.id, calRows[0].slug)) throw new RuleError('Not found.', 404, 'not_found');
      const ev = await loadEvent(db, reg.eslug);
      return checkIn(db, ev as any, reg as any);
    });
    const { rows } = await pool.query(
      `SELECT id, status, ticket_code, waitlist_position, checked_in_at FROM registrations WHERE id = $1`, [out.reg.id]);
    return c.json({
      id: rows[0].id, status: rows[0].status, ticket_code: rows[0].ticket_code,
      checked_in_at: rows[0].checked_in_at ? iso(rows[0].checked_in_at) : null,
      already_checked_in_at: out.alreadyAt ? iso(out.alreadyAt) : null,
    });
  });

  /* ------------------------------ calendars ----------------------------- */
  api.get('/calendars', requireAuth, async (c) => {
    const account = c.get('account');
    const { rows } = await pool.query(
      `SELECT c.*, (SELECT count(*) FROM events e WHERE e.calendar_id = c.id AND e.state IN ('published','registration_closed'))::int AS published_events
       FROM calendars c WHERE c.owner_account_id = $1 ORDER BY c.created_at ASC`, [account.id]);
    return c.json(rows.map((r: any) => ({
      id: r.id, name: r.name, slug: r.slug, category: r.category, city: r.city,
      is_public: r.is_public, owner_account_id: r.owner_account_id, created_at: iso(r.created_at),
      published_events: Number(r.published_events),
    })));
  });

  api.post('/calendars', requireAuth, requireHost, async (c) => {
    const account = c.get('account');
    const body = await c.req.json().catch(() => ({}));
    const b = body as Record<string, unknown>;
    const name = String(b.name ?? '').trim();
    const slugIn = String(b.slug ?? '').trim();
    const category = String(b.category ?? '');
    const city = String(b.city ?? '').trim();
    const isPublic = b.is_public !== false;
    if (!name) throw new RuleError('Give the calendar a name.', 400, 'invalid', 'name');
    if (!slugIn || !KEBAB_RE.test(slugIn)) throw new RuleError('Use lower-case letters, numbers and single dashes.', 400, 'invalid', 'slug');
    if (!(CATEGORIES as readonly string[]).includes(category)) throw new RuleError('Pick one of the twelve categories.', 400, 'invalid', 'category');
    if (!city) throw new RuleError('Say which city the calendar lives in.', 400, 'invalid', 'city');
    await assertSlugFree(pool, slugIn);
    const { rows } = await pool.query(
      `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [account.id, name, slugIn, category, city, isPublic]);
    log.info('calendar_created', { slug: slugIn });
    return c.json({
      id: rows[0].id, name: rows[0].name, slug: rows[0].slug, category: rows[0].category,
      city: rows[0].city, is_public: rows[0].is_public, owner_account_id: rows[0].owner_account_id,
      created_at: iso(rows[0].created_at), published_events: 0,
    }, 201);
  });

  /* ------------------------------- account ------------------------------ */
  api.get('/accounts/me', requireAuth, async (c) => {
    const account = c.get('account');
    return c.json({
      id: account.id, email: account.email, display_name: account.display_name,
      handle: account.handle, role: account.role,
    });
  });

  api.patch('/accounts/me', requireAuth, async (c) => {
    const account = c.get('account');
    const body = await c.req.json().catch(() => ({}));
    const b = body as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    if (b.display_name !== undefined) {
      const n = String(b.display_name).trim();
      if (!n) throw new RuleError('Add your name so hosts know who is coming.', 400, 'invalid', 'display_name');
      next.display_name = n;
    }
    if (b.handle !== undefined) {
      const h = String(b.handle).trim();
      if (!KEBAB_RE.test(h)) throw new RuleError('Use lower-case letters, numbers and single dashes.', 400, 'invalid', 'handle');
      if (h !== account.handle) {
        if (RESERVED_PATHS.has(h)) throw new RuleError('That address is reserved. Try another.', 400, 'reserved', 'handle');
        if ((CATEGORIES as readonly string[]).includes(h)) throw new RuleError('That address is a category name. Try another.', 400, 'reserved', 'handle');
        const [ev, cal, acct] = await Promise.all([
          pool.query('SELECT 1 FROM events WHERE slug = $1', [h]),
          pool.query('SELECT 1 FROM calendars WHERE slug = $1', [h]),
          pool.query('SELECT 1 FROM accounts WHERE handle = $1 AND id <> $2', [h, account.id]),
        ]);
        if (ev.rowCount || cal.rowCount || acct.rowCount) {
          throw new RuleError('That handle is already taken.', 400, 'taken', 'handle');
        }
      }
      next.handle = h;
    }
    if (!Object.keys(next).length) throw new RuleError('Nothing to change yet.', 400, 'invalid', 'body');
    const sets = Object.keys(next).map((k, i) => `"${toSnake(k)}" = $${i + 2}`).join(', ');
    const { rows } = await pool.query(`UPDATE accounts SET ${sets} WHERE id = $1 RETURNING *`, [account.id, ...Object.values(next)]);
    const a = rows[0];
    return c.json({ id: a.id, email: a.email, display_name: a.display_name, handle: a.handle, role: a.role });
  });

  api.get('/accounts/:handle', async (c) => {
    const handle = c.req.param('handle');
    const { rows } = await pool.query(
      `SELECT display_name, handle, role FROM accounts WHERE handle = $1`, [handle]);
    if (!rows.length) throw new RuleError('Not found.', 404, 'not_found');
    return c.json(rows[0]);
  });

  api.get('/accounts/:handle/calendars', async (c) => {
    const handle = c.req.param('handle');
    const { rows } = await pool.query(
      `SELECT c.slug, c.name, c.city, c.category, c.is_public
       FROM calendars c JOIN accounts a ON a.id = c.owner_account_id
       WHERE a.handle = $1 AND c.is_public = true ORDER BY c.created_at ASC`, [handle]);
    return c.json(rows);
  });

  api.get('/calendars/:slug', async (c) => {
    const slug = c.req.param('slug');
    const { rows } = await pool.query(
      `SELECT slug, name, city, category, is_public FROM calendars WHERE slug = $1`, [slug]);
    if (!rows.length) throw new RuleError('Not found.', 404, 'not_found');
    const cal = rows[0];
    if (!cal.is_public) {
      const account = await optionalAccount(pool, c);
      const owns = account && await ownsCalendar(pool, account.id, slug);
      if (!owns) throw new RuleError('Not found.', 404, 'not_found');
    }
    return c.json(cal);
  });

  api.onError((err, c) => {
    if (err instanceof RuleError) return bad(c, err);
    log.error('unhandled', { path: c.req.path, message: err.message, stack: err.stack?.split('\n').slice(0, 3) });
    return c.json({ message: 'Something went wrong on our side. Try again in a moment.', code: 'server' }, 500);
  });

  return api;

    /* ------------------------------ helpers ------------------------------- */
  async function decideRoute(ctx: any, kind: 'approve' | 'decline'): Promise<any> {
    const id = ctx.req.param('id');
    const out = await withTransaction(pool, async (db) => {
      const { rows } = await db.query(
        `SELECT r.*, e.slug AS eslug FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.id = $1`, [id]);
      if (!rows.length) throw new RuleError('Not found.', 404, 'not_found');
      const reg = rows[0];
      const { rows: calRows } = await db.query(
        'SELECT c.slug FROM calendars c JOIN events e ON e.calendar_id = c.id WHERE e.id = $1', [reg.event_id]);
      if (!await ownsCalendarDb(db, ctx.get('account').id, calRows[0].slug)) throw new RuleError('Not found.', 404, 'not_found');
      const ev = await loadEvent(db, reg.eslug);
      const email = await regEmail(db, reg.account_id);
      return decide(db, ev as any, reg as any, email, kind);
    });
    for (const m of out.mails) await sendMail(pool, { ...m, recipient: m.to });
    const { rows } = await pool.query(
      `SELECT id, status, ticket_code, waitlist_position FROM registrations WHERE id = $1`, [id]);
    return ctx.json(rows[0]);
  }
}

/* ------------------------------ middleware ------------------------------ */

async function accountFromRequest(pool: Pool, authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT a.* FROM tokens t JOIN accounts a ON a.id = t.account_id WHERE t.token_hash = $1 AND t.expires_at > now()`,
    [sha(token)]);
  return rows[0] ?? null;
}

function sha(s: string) {
  return createHashSha(s);
}

function createHashSha(s: string): string {
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(s).digest('hex');
}

async function issueToken(pool: Pool, accountId: string): Promise<string> {
  const token = randomToken(32);
  const days = Number(process.env.TOKEN_DAYS || 30);
  await pool.query(
    `INSERT INTO tokens (account_id, token_hash, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [accountId, sha(token), String(days)]);
  return token;
}

export async function optionalAccount(pool: Pool, c: any) {
  return accountFromRequest(pool, c.req.header('authorization'));
}

function requireAuth(c: any, next: any) {
  return (async () => {
    const db = c.get('db') as Pool;
    const account = await accountFromRequest(db, c.req.header('authorization'));
    if (!account) return c.json({ message: 'Sign in to continue.', code: 'unauthorized' }, 401);
    c.set('account', account);
    return next();
  })();
}

function requireHost(c: any, next: any) {
  const account = c.get('account');
  if (!account || account.role !== 'host') return c.json({ message: 'Not found.', code: 'not_found' }, 404);
  return next();
}

const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(kind: 'register' | 'login') {
  return async (c: any, next: any) => {
    void kind;
    const db = c.get('db') as Pool;
    const body = await c.req.json().catch(() => ({}));
    const key = String((body as any)?.email ?? c.req.header('authorization') ?? 'anon');
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + 60000 });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > 10) {
      return c.json({ message: 'Too many attempts. Wait a minute and try again.', code: 'rate_limited', limit: '10 requests per minute' }, 429);
    }
    return next();
  };
}

/* -------------------------------- shared -------------------------------- */

async function uniqueHandle(pool: Pool, base: string): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    if (RESERVED_PATHS.has(candidate) || (CATEGORIES as readonly string[]).includes(candidate)) {
      candidate = `${base}-${i + 2}`;
      continue;
    }
    const clash = await Promise.all([
      pool.query('SELECT 1 FROM accounts WHERE handle = $1', [candidate]),
      pool.query('SELECT 1 FROM calendars WHERE slug = $1', [candidate]),
      pool.query('SELECT 1 FROM events WHERE slug = $1', [candidate]),
    ]);
    if (!clash.some((r) => r.rowCount)) return candidate;
    candidate = `${base}-${randomToken(2).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4) || (i + 2)}`;
  }
  return base + '-' + Date.now().toString(36);
}

async function uniqueEventSlug(pool: Pool, base: string): Promise<string> {
  let candidate = base;
  for (let i = 2; i < 60; i++) {
    if (RESERVED_PATHS.has(candidate) || (CATEGORIES as readonly string[]).includes(candidate)) {
      candidate = `${base}-${i}`;
      continue;
    }
    const [a, b, c] = await Promise.all([
      pool.query('SELECT 1 FROM events WHERE slug = $1', [candidate]),
      pool.query('SELECT 1 FROM calendars WHERE slug = $1', [candidate]),
      pool.query('SELECT 1 FROM accounts WHERE handle = $1', [candidate]),
    ]);
    if (!a.rowCount && !b.rowCount && !c.rowCount) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function assertSlugFree(pool: Pool, slug: string, exceptAccountId?: string) {
  if (RESERVED_PATHS.has(slug)) throw new RuleError('That address is reserved. Try another.', 400, 'reserved', 'slug');
  if ((CATEGORIES as readonly string[]).includes(slug)) throw new RuleError('That address is a category name. Try another.', 400, 'reserved', 'slug');
  const [ev, cal, acct] = await Promise.all([
    pool.query('SELECT 1 FROM events WHERE slug = $1', [slug]),
    pool.query('SELECT 1 FROM calendars WHERE slug = $1', [slug]),
    pool.query('SELECT 1 FROM accounts WHERE handle = $1', [slug]),
  ]);
  if (ev.rowCount || cal.rowCount) throw new RuleError('That address is already taken.', 400, 'taken', 'slug');
  if (acct.rowCount && !exceptAccountId) throw new RuleError('That address is already taken.', 400, 'taken', 'slug');
}

async function ownsCalendar(pool: Pool, accountId: string, calendarSlug: string) {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM calendars WHERE slug = $1 AND owner_account_id = $2', [calendarSlug, accountId]);
  return Boolean(rowCount);
}

async function ownsCalendarDb(db: any, accountId: string, calendarSlug: string) {
  const { rowCount } = await db.query(
    'SELECT 1 FROM calendars WHERE slug = $1 AND owner_account_id = $2', [calendarSlug, accountId]);
  return Boolean(rowCount);
}

async function countSeats(db: any, eventId: string) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM registrations WHERE event_id = $1 AND status IN ('confirmed','checked_in')`, [eventId]);
  return Number(rows[0].n);
}

async function regEmail(db: any, accountId: string) {
  const { rows } = await db.query('SELECT email FROM accounts WHERE id = $1', [accountId]);
  return rows[0].email;
}

function truthy(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function tryInstant(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(v.trim())) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseInstant(v: unknown, field: string): Date {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(v.trim())) {
    throw new RuleError('Times are UTC instants written as RFC 3339 with a Z.', 400, 'invalid', field);
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new RuleError('Times are UTC instants written as RFC 3339 with a Z.', 400, 'invalid', field);
  return d;
}

function toSnake(k: string): string {
  return k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function fullEvent(r: any) {
  return {
    id: r.id, slug: r.slug, title: r.title, category: r.category, city: r.city,
    time_zone: r.time_zone, starts_at: iso(r.starts_at), ends_at: iso(r.ends_at),
    capacity: Number(r.capacity), state: r.state, theme_hex: r.theme_hex,
    cover_seed: r.cover_seed, description: r.description ?? '',
    approval_required: r.approval_required, waitlist_enabled: r.waitlist_enabled,
    cancel_reason: r.cancel_reason ?? null,
    published_at: r.published_at ? iso(r.published_at) : null,
    cancelled_at: r.cancelled_at ? iso(r.cancelled_at) : null,
    created_at: iso(r.created_at), updated_at: iso(r.updated_at),
  };
}
