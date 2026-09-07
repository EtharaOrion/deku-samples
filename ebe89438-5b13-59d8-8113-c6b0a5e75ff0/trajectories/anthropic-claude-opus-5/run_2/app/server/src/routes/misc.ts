import { Hono } from 'hono';
import { pool, tx } from '../db.js';
import { registrationPublic } from '../domain.js';
import {
  AppContext,
  handleError,
  notFound,
  readJson,
  requireAccount,
  requireHost,
} from '../http.js';
import { checkNamespaceFree, resolveSlug } from '../namespace.js';
import { CATEGORIES, FieldError, log, toUtcIso } from '../util.js';

export const miscRoutes = new Hono();

/* ------------------------------------------------------------------ health */

miscRoutes.get('/health', async (c: AppContext) => {
  try {
    await pool.query('SELECT 1');
    return c.json({ status: 'ok', time: new Date().toISOString() });
  } catch {
    return c.json({ status: 'degraded' }, 503);
  }
});

/* ----------------------------------------------------------------- resolve */

miscRoutes.get('/resolve/:slug', async (c: AppContext) => {
  try {
    const resolved = await resolveSlug(String(c.req.param('slug')));
    if (!resolved.kind) return notFound(c);
    return c.json(resolved);
  } catch (err) {
    return handleError(err, c);
  }
});

miscRoutes.get('/categories', (c: AppContext) => c.json(CATEGORIES));

/* --------------------------------------------------------------- calendars */

miscRoutes.get('/calendars', async (c: AppContext) => {
  try {
    const account = await requireAccount(c);
    const { rows } = await pool.query(
      `SELECT cal.*,
              (SELECT count(*)::int FROM events e
                WHERE e.calendar_id = cal.id AND e.state = 'published') AS published_count,
              (SELECT count(*)::int FROM events e WHERE e.calendar_id = cal.id) AS event_count
         FROM calendars cal
        WHERE cal.owner_account_id = $1
        ORDER BY cal.created_at ASC`,
      [account.id],
    );
    return c.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        owner_account_id: r.owner_account_id,
        name: r.name,
        slug: r.slug,
        category: r.category,
        city: r.city,
        is_public: r.is_public,
        published_count: r.published_count,
        event_count: r.event_count,
        created_at: toUtcIso(r.created_at as Date),
      })),
    );
  } catch (err) {
    return handleError(err, c);
  }
});

/** A guest is refused calendar creation. */
miscRoutes.post('/calendars', async (c: AppContext) => {
  try {
    const account = await requireHost(c);
    const body = await readJson(c);
    const name = String(body.name ?? '').trim();
    const slug = String(body.slug ?? '').trim().toLowerCase();
    const category = String(body.category ?? '').trim().toLowerCase();
    const city = String(body.city ?? '').trim();
    const isPublic = body.is_public === undefined ? true : Boolean(body.is_public);

    if (!name) throw new FieldError('name', 'Give the calendar a name.');
    if (!slug) throw new FieldError('slug', 'Choose the address this calendar lives at.');
    if (!(CATEGORIES as readonly string[]).includes(category)) {
      throw new FieldError('category', 'Choose one of the twelve categories.');
    }
    if (!city) throw new FieldError('city', 'Name the city this calendar is based in.');

    const created = await tx(async (client) => {
      const check = await checkNamespaceFree(slug, client);
      if (!check.ok) {
        throw new FieldError(
          'slug',
          check.reason === 'shape'
            ? 'Use lowercase letters, numbers and single hyphens.'
            : 'That address is already taken.',
          409,
        );
      }
      const { rows } = await client.query(
        `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [account.id, name, slug, category, city, isPublic],
      );
      return rows[0];
    });

    log('info', 'calendar_created', { calendar_id: created.id, slug: created.slug });
    return c.json(
      {
        id: created.id,
        owner_account_id: created.owner_account_id,
        name: created.name,
        slug: created.slug,
        category: created.category,
        city: created.city,
        is_public: created.is_public,
        published_count: 0,
        event_count: 0,
        created_at: toUtcIso(created.created_at),
      },
      201,
    );
  } catch (err) {
    return handleError(err, c);
  }
});

/** A calendar at its own address, with the events anyone may see on it. */
miscRoutes.get('/calendars/:slug/public', async (c: AppContext) => {
  try {
    const { rows } = await pool.query(
      `SELECT cal.*, a.display_name AS owner_name, a.handle AS owner_handle
         FROM calendars cal JOIN accounts a ON a.id = cal.owner_account_id
        WHERE cal.slug = $1`,
      [String(c.req.param('slug'))],
    );
    const cal = rows[0];
    if (!cal) return notFound(c);
    const { rows: events } = await pool.query(
      `SELECT e.*, (SELECT count(*)::int FROM registrations r
                     WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in')
                   ) AS confirmed_count
         FROM events e
        WHERE e.calendar_id = $1 AND e.state IN ('published','registration_closed')
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
      events: events.map((e: Record<string, unknown>) => ({
        slug: e.slug,
        title: e.title,
        category: e.category,
        city: e.city,
        time_zone: e.time_zone,
        starts_at: toUtcIso(e.starts_at as Date),
        ends_at: toUtcIso(e.ends_at as Date),
        capacity: e.capacity,
        confirmed_count: e.confirmed_count,
        remaining:
          e.capacity === null
            ? null
            : Math.max(0, (e.capacity as number) - (e.confirmed_count as number)),
        state: e.state,
        theme_hex: e.theme_hex,
        cover_seed: e.cover_seed,
      })),
    });
  } catch (err) {
    return handleError(err, c);
  }
});

/** A public profile at an account handle. */
miscRoutes.get('/accounts/:handle/public', async (c: AppContext) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, display_name, handle, role, created_at FROM accounts WHERE handle = $1',
      [String(c.req.param('handle'))],
    );
    const acc = rows[0];
    if (!acc) return notFound(c);
    const { rows: cals } = await pool.query(
      `SELECT name, slug, category, city FROM calendars
        WHERE owner_account_id = $1 AND is_public = true ORDER BY created_at ASC`,
      [acc.id],
    );
    return c.json({
      display_name: acc.display_name,
      handle: acc.handle,
      role: acc.role,
      created_at: toUtcIso(acc.created_at),
      calendars: cals,
    });
  } catch (err) {
    return handleError(err, c);
  }
});

/* ------------------------------------------------------------------ counts */

miscRoutes.get('/categories/:name/summary', async (c: AppContext) => {
  try {
    const name = String((c.req.param('name'))).toLowerCase();
    if (!(CATEGORIES as readonly string[]).includes(name)) return notFound(c);
    const { rows } = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM events
           WHERE category = $1 AND state IN ('published','registration_closed')) AS event_count,
         (SELECT count(*)::int FROM calendars WHERE category = $1) AS calendar_count`,
      [name],
    );
    const { rows: cals } = await pool.query(
      `SELECT cal.name, cal.slug, cal.category, cal.city, cal.is_public,
              (SELECT count(*)::int FROM events e
                WHERE e.calendar_id = cal.id AND e.state = 'published') AS published_count
         FROM calendars cal WHERE cal.category = $1 ORDER BY cal.created_at ASC`,
      [name],
    );
    return c.json({
      category: name,
      event_count: rows[0].event_count,
      calendar_count: rows[0].calendar_count,
      calendars: cals,
    });
  } catch (err) {
    return handleError(err, c);
  }
});

/* ----------------------------------------------------------------- tickets */

/**
 * Answers every caller presenting a real code, signed in or not: the code
 * itself is the credential. It carries the ticket, never the guest list.
 */
miscRoutes.get('/tickets/:code', async (c: AppContext) => {
  try {
    const code = String((c.req.param('code'))).toUpperCase();
    const { rows } = await pool.query(
      `SELECT r.id, r.status, r.ticket_code, r.checked_in_at, r.waitlist_position,
              e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone,
              e.city, e.theme_hex, e.cover_seed, e.description, e.state AS event_state,
              a.display_name
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         JOIN accounts a ON a.id = r.account_id
        WHERE r.ticket_code = $1`,
      [code],
    );
    const t = rows[0];
    if (!t) return notFound(c);
    return c.json({
      id: t.id,
      event_slug: t.event_slug,
      title: t.title,
      starts_at: toUtcIso(t.starts_at),
      ends_at: toUtcIso(t.ends_at),
      time_zone: t.time_zone,
      city: t.city,
      status: t.status,
      ticket_code: t.ticket_code,
      checked_in_at: toUtcIso(t.checked_in_at),
      theme_hex: t.theme_hex,
      cover_seed: t.cover_seed,
      display_name: t.display_name,
      event_state: t.event_state,
    });
  } catch (err) {
    return handleError(err, c);
  }
});

/** The owning host checks a ticket in; a second check-in records one arrival. */
miscRoutes.post('/tickets/:code/check-in', async (c: AppContext) => {
  try {
    const account = await requireAccount(c);
    const code = String((c.req.param('code'))).toUpperCase();

    const result = await tx(async (client) => {
      const { rows } = await client.query(
        `SELECT r.id, cal.owner_account_id
           FROM registrations r
           JOIN events e ON e.id = r.event_id
           JOIN calendars cal ON cal.id = e.calendar_id
          WHERE r.ticket_code = $1`,
        [code],
      );
      const found = rows[0];
      if (!found || found.owner_account_id !== account.id) return null;

      const { rows: locked } = await client.query(
        'SELECT * FROM registrations WHERE id = $1 FOR UPDATE',
        [found.id],
      );
      const reg = locked[0];
      if (reg.status === 'checked_in') {
        // one arrival, not two
        return { registration: reg, already: true };
      }
      if (reg.status !== 'confirmed') {
        throw new FieldError(
          'ticket_code',
          'That ticket does not hold a seat, so it cannot be checked in.',
          409,
        );
      }
      const { rows: out } = await client.query(
        `UPDATE registrations SET status = 'checked_in', checked_in_at = now(),
              updated_at = now() WHERE id = $1 RETURNING *`,
        [reg.id],
      );
      return { registration: out[0], already: false };
    });

    if (!result) return notFound(c);
    log('info', 'ticket_checked_in', {
      code,
      already: result.already,
    });
    return c.json({
      ...registrationPublic(result.registration),
      already_checked_in: result.already,
    });
  } catch (err) {
    return handleError(err, c);
  }
});
