import { Hono } from 'hono';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requireAccount } from '../auth.js';
import { AppError, denied, notFound } from '../errors.js';
import { categoryEnum, parseBody, readJson, toIso } from '../shape.js';
import { serializeAccount, serializeCalendar } from '../serialize.js';
import { claimName, resolveSlug } from '../namespace.js';
import { isKebab, isReserved } from '../domain.js';
import { lockEvent } from '../registrations.js';

export const ticketRoutes = new Hono();
export const calendarRoutes = new Hono();
export const accountRoutes = new Hono();
export const resolveRoutes = new Hono();

/** The code itself is the credential, so any caller presenting a real one is answered. */
ticketRoutes.get('/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const r = await query(
    `SELECT r.*, e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone,
            e.city, e.theme_hex, e.cover_seed, e.state AS event_state, e.description,
            cal.name AS calendar_name
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       JOIN calendars cal ON cal.id = e.calendar_id
      WHERE r.ticket_code = $1`,
    [code],
  );
  const t = r.rows[0];
  if (!t) throw notFound();
  return c.json({
    id: Number(t.id),
    status: t.status,
    ticket_code: t.ticket_code,
    checked_in_at: toIso(t.checked_in_at),
    event_slug: t.event_slug,
    title: t.title,
    starts_at: toIso(t.starts_at),
    ends_at: toIso(t.ends_at),
    time_zone: t.time_zone,
    city: t.city,
    theme_hex: t.theme_hex,
    cover_seed: t.cover_seed,
    event_state: t.event_state,
    calendar_name: t.calendar_name,
  });
});

/** The owning host checks a ticket in; a second check-in records one arrival, not two. */
ticketRoutes.post('/:code/check-in', async (c) => {
  const account = requireAccount(c);
  const code = c.req.param('code').toUpperCase();

  const out = await tx(async (client) => {
    const r = await client.query(
      `SELECT r.*, e.id AS ev_id, cal.owner_account_id
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         JOIN calendars cal ON cal.id = e.calendar_id
        WHERE r.ticket_code = $1`,
      [code],
    );
    const reg = r.rows[0];
    if (!reg) throw notFound();
    if (Number(reg.owner_account_id) !== account.id) {
      throw account.role === 'host' ? denied() : notFound();
    }
    await lockEvent(client, Number(reg.ev_id));
    const fresh = await client.query('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [reg.id]);
    const cur = fresh.rows[0];
    if (cur.status === 'checked_in') {
      return { reg: cur, already: true };
    }
    if (cur.status !== 'confirmed') {
      throw new AppError(409, 'That ticket does not hold a seat, so it cannot be checked in.', { code: 'not_confirmed' });
    }
    const upd = await client.query(
      `UPDATE registrations SET status = 'checked_in', checked_in_at = now(), updated_at = now()
        WHERE id = $1 RETURNING *`,
      [reg.id],
    );
    return { reg: upd.rows[0], already: false };
  });

  return c.json({
    id: Number(out.reg.id),
    status: out.reg.status,
    ticket_code: out.reg.ticket_code,
    checked_in_at: toIso(out.reg.checked_in_at),
    already_checked_in: out.already,
  });
});

calendarRoutes.get('/', async (c) => {
  const account = requireAccount(c);
  const r = await query(
    `SELECT cal.*, (SELECT count(*) FROM events e
                     WHERE e.calendar_id = cal.id AND e.state IN ('published','registration_closed'))::int
                   AS published_event_count
       FROM calendars cal WHERE cal.owner_account_id = $1 ORDER BY cal.created_at ASC`,
    [account.id],
  );
  return c.json(r.rows.map(serializeCalendar));
});

const calendarSchema = z.object({
  name: z.string().trim().min(1, 'Give the calendar a name.').max(120),
  slug: z.string().trim().min(2, 'Give the calendar an address.').max(64),
  category: categoryEnum,
  city: z.string().trim().min(1, 'Name the city.').max(120),
  is_public: z.boolean().optional().default(true),
});

calendarRoutes.post('/', async (c) => {
  const account = requireAccount(c);
  if (account.role !== 'host') throw denied();
  const body = parseBody(calendarSchema, await readJson(c));
  const slug = body.slug.toLowerCase();
  if (!isKebab(slug)) {
    throw new AppError(422, 'slug: Use lowercase words joined by single hyphens.', { field: 'slug' });
  }

  const created = await tx(async (client) => {
    await claimName(client, slug, 'calendar', 'That address is already taken.');
    const r = await client.query(
      `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [account.id, body.name, slug, body.category, body.city, body.is_public],
    );
    return r.rows[0];
  });
  return c.json(serializeCalendar({ ...created, published_event_count: 0 }), 201);
});

/** A calendar page: the calendar and the events on it that are open to discovery. */
calendarRoutes.get('/:slug/public', async (c) => {
  const slug = c.req.param('slug');
  const r = await query(
    `SELECT cal.*, a.display_name AS owner_name, a.handle AS owner_handle
       FROM calendars cal JOIN accounts a ON a.id = cal.owner_account_id
      WHERE cal.slug = $1`,
    [slug],
  );
  const cal = r.rows[0];
  if (!cal) throw notFound();
  const events = await query(
    `SELECT e.*, (SELECT count(*) FROM registrations r
                   WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in'))::int AS confirmed_count
       FROM events e WHERE e.calendar_id = $1 AND e.state IN ('published','registration_closed')
      ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC`,
    [cal.id],
  );
  return c.json({
    calendar: { ...serializeCalendar(cal), owner_name: cal.owner_name, owner_handle: cal.owner_handle },
    events: events.rows.map((e) => ({
      slug: e.slug, title: e.title, category: e.category, city: e.city,
      time_zone: e.time_zone, starts_at: toIso(e.starts_at), ends_at: toIso(e.ends_at),
      capacity: e.capacity === null ? null : Number(e.capacity),
      confirmed_count: Number(e.confirmed_count),
      remaining: e.capacity === null ? null : Math.max(0, Number(e.capacity) - Number(e.confirmed_count)),
      state: e.state, theme_hex: e.theme_hex, cover_seed: e.cover_seed,
    })),
  });
});

accountRoutes.get('/me', async (c) => {
  const account = requireAccount(c);
  const r = await query('SELECT * FROM accounts WHERE id = $1', [account.id]);
  return c.json(serializeAccount(r.rows[0]));
});

const profileSchema = z.object({
  display_name: z.string().trim().min(1, 'Add your name so hosts know who is coming.').max(120).optional(),
  handle: z.string().trim().min(2).max(64).optional(),
});

/** Edits the caller alone; the body carries no account identifier. */
accountRoutes.patch('/me', async (c) => {
  const account = requireAccount(c);
  const body = parseBody(profileSchema, await readJson(c));

  const updated = await tx(async (client) => {
    const cur = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [account.id]);
    const me = cur.rows[0];
    const sets: string[] = [];
    const params: any[] = [];
    const push = (col: string, v: any) => { params.push(v); sets.push(`${col} = $${params.length}`); };

    if (body.display_name !== undefined) push('display_name', body.display_name);

    if (body.handle !== undefined) {
      const handle = body.handle.toLowerCase();
      if (handle !== me.handle) {
        if (!isKebab(handle)) {
          throw new AppError(422, 'handle: Use lowercase words joined by single hyphens.', { field: 'handle' });
        }
        if (isReserved(handle)) {
          throw new AppError(409, 'That handle is already taken.', { field: 'handle', code: 'handle_taken' });
        }
        const taken = await client.query(
          'SELECT 1 FROM namespace_reservations WHERE slug = $1', [handle],
        );
        if (taken.rowCount) {
          throw new AppError(409, 'That handle is already taken.', { field: 'handle', code: 'handle_taken' });
        }
        await client.query(
          `INSERT INTO namespace_reservations (slug, kind) VALUES ($1,'account')`, [handle],
        );
        push('handle', handle);
      }
    }

    if (!sets.length) return me;
    params.push(account.id);
    const r = await client.query(
      `UPDATE accounts SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params,
    );
    return r.rows[0];
  });

  return c.json(serializeAccount(updated));
});

/** A public profile: the account and the calendars it owns that are public. */
accountRoutes.get('/:handle/public', async (c) => {
  const handle = c.req.param('handle');
  const r = await query(
    'SELECT id, display_name, handle, role, created_at FROM accounts WHERE handle = $1',
    [handle],
  );
  const a = r.rows[0];
  if (!a) throw notFound();
  const cals = await query(
    `SELECT cal.*, (SELECT count(*) FROM events e
                     WHERE e.calendar_id = cal.id AND e.state IN ('published','registration_closed'))::int
                   AS published_event_count
       FROM calendars cal WHERE cal.owner_account_id = $1 AND cal.is_public = true
      ORDER BY cal.created_at ASC`,
    [a.id],
  );
  return c.json({
    account: { id: Number(a.id), display_name: a.display_name, handle: a.handle, role: a.role },
    calendars: cals.rows.map(serializeCalendar),
  });
});

resolveRoutes.get('/:slug', async (c) => {
  const found = await resolveSlug(c.req.param('slug'));
  if (!found) throw notFound();
  return c.json(found);
});

/** The twelve category pages, each with its counts and its calendars. */
export const categoryRoutes = new Hono();

categoryRoutes.get('/:name', async (c) => {
  const name = c.req.param('name').toLowerCase();
  const ev = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM events
      WHERE category = $1 AND state IN ('published','registration_closed')`,
    [name],
  );
  const cals = await query(
    `SELECT cal.*, a.display_name AS owner_name,
            (SELECT count(*) FROM events e
              WHERE e.calendar_id = cal.id AND e.state IN ('published','registration_closed'))::int
            AS published_event_count
       FROM calendars cal JOIN accounts a ON a.id = cal.owner_account_id
      WHERE cal.category = $1 AND cal.is_public = true
      ORDER BY cal.created_at ASC`,
    [name],
  );
  return c.json({
    category: name,
    event_count: Number(ev.rows[0].n),
    calendar_count: cals.rowCount,
    calendars: cals.rows.map((r) => ({ ...serializeCalendar(r), owner_name: r.owner_name })),
  });
});
