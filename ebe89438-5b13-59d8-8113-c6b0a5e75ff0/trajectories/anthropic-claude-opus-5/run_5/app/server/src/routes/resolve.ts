import { Hono } from 'hono';
import { query } from '../db.js';
import { notFound, type Vars } from '../http.js';
import { CATEGORY_SET, RESERVED_SET } from '../domain.js';

export type ResolvedKind = 'system' | 'category' | 'event' | 'calendar' | 'account';

/**
 * One lookup with fixed precedence: reserved system paths, then the twelve
 * category names, then event slugs, then calendar slugs, then account handles.
 */
export async function resolveSlug(slug: string): Promise<{ kind: ResolvedKind; slug: string } | null> {
  const s = slug.toLowerCase();
  if (RESERVED_SET.has(s)) return { kind: 'system', slug: s };
  if (CATEGORY_SET.has(s)) return { kind: 'category', slug: s };

  const ev = await query(`SELECT slug FROM events WHERE slug = $1`, [s]);
  if (ev.rows[0]) return { kind: 'event', slug: s };

  const cal = await query(`SELECT slug FROM calendars WHERE slug = $1`, [s]);
  if (cal.rows[0]) return { kind: 'calendar', slug: s };

  const acc = await query(`SELECT handle FROM accounts WHERE handle = $1`, [s]);
  if (acc.rows[0]) return { kind: 'account', slug: s };

  return null;
}

export const resolveRoutes = new Hono<{ Variables: Vars }>();

resolveRoutes.get('/:slug', async (c) => {
  const found = await resolveSlug(c.req.param('slug'));
  if (!found) throw notFound();
  return c.json(found);
});

export const publicRoutes = new Hono<{ Variables: Vars }>();

// A calendar at its own address, with the events anyone may see.
publicRoutes.get('/calendars/:slug', async (c) => {
  const account = c.get('account');
  const r = await query(
    `SELECT c.id, c.name, c.slug, c.category, c.city, c.is_public, c.created_at,
            a.display_name AS owner_name, a.handle AS owner_handle, c.owner_account_id
       FROM calendars c JOIN accounts a ON a.id = c.owner_account_id
      WHERE c.slug = $1`,
    [c.req.param('slug')],
  );
  const cal = r.rows[0];
  if (!cal) throw notFound();
  const isOwner = !!account && Number(cal.owner_account_id) === account.id;
  const events = await query(
    `SELECT e.slug, e.title, e.category, e.city, e.time_zone, e.starts_at, e.ends_at, e.capacity,
            e.state, e.theme_hex, e.cover_seed, e.description,
            (SELECT count(*)::bigint FROM registrations r WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in')) AS confirmed_count
       FROM events e
      WHERE e.calendar_id = $1 AND ($2::boolean OR e.state <> 'draft')
      ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC`,
    [cal.id, isOwner],
  );
  return c.json({ ...cal, is_owner: isOwner, events: events.rows });
});

publicRoutes.get('/accounts/handle/:handle', async (c) => {
  const r = await query(
    `SELECT id, display_name, handle, role, created_at FROM accounts WHERE handle = $1`,
    [c.req.param('handle')],
  );
  const acc = r.rows[0];
  if (!acc) throw notFound();
  const calendars = await query(
    `SELECT slug, name, category, city, is_public FROM calendars
      WHERE owner_account_id = $1 AND is_public = true ORDER BY created_at ASC`,
    [acc.id],
  );
  return c.json({ ...acc, calendars: calendars.rows });
});

// A category at its own address: its counts, its calendars and its events.
publicRoutes.get('/categories/:name', async (c) => {
  const name = c.req.param('name').toLowerCase();
  if (!CATEGORY_SET.has(name)) throw notFound();
  const counts = await query<{ events: number; calendars: number }>(
    `SELECT
       (SELECT count(*)::bigint FROM events WHERE category = $1 AND state IN ('published','registration_closed')) AS events,
       (SELECT count(*)::bigint FROM calendars WHERE category = $1 AND is_public = true) AS calendars`,
    [name],
  );
  const calendars = await query(
    `SELECT c.slug, c.name, c.category, c.city, c.is_public,
            (SELECT count(*)::bigint FROM events e WHERE e.calendar_id = c.id AND e.state IN ('published','registration_closed')) AS published_event_count
       FROM calendars c WHERE c.category = $1 AND c.is_public = true ORDER BY c.created_at ASC`,
    [name],
  );
  return c.json({
    name,
    event_count: counts.rows[0].events,
    calendar_count: counts.rows[0].calendars,
    calendars: calendars.rows,
  });
});

// The landing wall: a handful of published events and the public calendars.
publicRoutes.get('/landing', async (c) => {
  const events = await query(
    `SELECT e.slug, e.title, e.category, e.city, e.time_zone, e.starts_at, e.theme_hex, e.cover_seed, e.state
       FROM events e
      WHERE e.state IN ('published','registration_closed')
      ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC
      LIMIT 22`,
  );
  const calendars = await query(
    `SELECT c.slug, c.name, c.category, c.city,
            (SELECT count(*)::bigint FROM events e WHERE e.calendar_id = c.id AND e.state IN ('published','registration_closed')) AS published_event_count
       FROM calendars c WHERE c.is_public = true ORDER BY c.created_at ASC LIMIT 8`,
  );
  return c.json({ events: events.rows, calendars: calendars.rows });
});
