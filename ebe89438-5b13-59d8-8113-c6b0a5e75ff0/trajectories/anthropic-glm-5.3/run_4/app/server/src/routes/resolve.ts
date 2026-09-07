import { Hono } from 'hono';
import { pool } from '../main.js';
import { CATEGORIES, RESERVED_PATHS } from '../constants.js';
import { query } from '../db.js';

export const resolveRoutes = new Hono();

resolveRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug').toLowerCase();
  if ((RESERVED_PATHS as readonly string[]).includes(slug)) return c.json({ kind: 'system', slug });
  if ((CATEGORIES as readonly string[]).includes(slug)) return c.json({ kind: 'category', slug });
  const rows = await query<{ slug: string }>(pool,
    `select slug from events where slug = $1
     union all select slug from calendars where slug = $1
     union all select handle as slug from accounts where handle = $1`, [slug]);
  if (rows.length === 0) return c.json({ message: 'Not found.' }, 404);
  const ev = await query(pool, `select 1 from events where slug = $1`, [slug]);
  if (ev.length > 0) return c.json({ kind: 'event', slug });
  const cal = await query(pool, `select 1 from calendars where slug = $1`, [slug]);
  if (cal.length > 0) return c.json({ kind: 'calendar', slug });
  return c.json({ kind: 'account', slug });
});
