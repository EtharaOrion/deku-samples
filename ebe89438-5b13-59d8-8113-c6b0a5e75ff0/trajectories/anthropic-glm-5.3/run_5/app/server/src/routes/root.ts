import { Hono } from 'hono';
import { pool } from '../db.js';
import { RESERVED_PATHS, isCategory, isReservedPath } from '../categories.js';

export const rootRoutes = new Hono();

/**
 * One lookup with fixed precedence: reserved system paths, then the twelve
 * category names, then events.slug, then calendars.slug, then accounts.handle.
 */
rootRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug').toLowerCase();
  if (isReservedPath(slug)) return c.json({ kind: 'system', slug });
  if (isCategory(slug)) return c.json({ kind: 'category', slug });
  const { rows } = await pool.query(
    `SELECT kind, slug FROM (
       SELECT 'event'::text AS kind, e.slug AS slug FROM events e WHERE e.slug = $1
       UNION ALL
       SELECT 'calendar'::text, c.slug FROM calendars c WHERE c.slug = $1
       UNION ALL
       SELECT 'account'::text, a.handle FROM accounts a WHERE a.handle = $1
     ) lookup LIMIT 1`,
    [slug],
  );
  if (rows[0]) return c.json({ kind: rows[0].kind, slug: rows[0].slug });
  return c.json({ kind: 'none', slug }, 404);
});

rootRoutes.get('/:slug/events', async (c) => {
  const slug = c.req.param('slug');
  const { rows } = await pool.query(
    `SELECT e.id, e.title, e.slug, e.category, e.city, e.time_zone, e.cover_seed, e.theme_hex, e.starts_at, e.ends_at, e.capacity, e.state
       FROM events e JOIN calendars c ON c.id = e.calendar_id
      WHERE c.slug = $1 AND e.state IN ('published','registration_closed')
      ORDER BY e.starts_at ASC, e.slug ASC`,
    [slug],
  );
  return c.json(rows);
});
