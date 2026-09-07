import { Hono } from 'hono';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { CATEGORIES, RESERVED_PATHS, isCategory, isReservedPath } from '../categories.js';
import { isKebabCase, slugify } from '../slugs.js';
import { toRfc3339 } from '../time.js';

export const calendarRoutes = new Hono();

calendarRoutes.get('/', requireAuth, async (c) => {
  const account = c.get('account');
  const { rows } = await pool.query(
    `SELECT c.*, (SELECT count(*)::int FROM events e WHERE e.calendar_id = c.id AND e.state IN ('published','registration_closed')) AS published_count
       FROM calendars c WHERE c.owner_account_id = $1 ORDER BY c.created_at ASC`,
    [account.id],
  );
  return c.json(
    rows.map((r) => ({
      id: r.id,
      owner_account_id: r.owner_account_id,
      name: r.name,
      slug: r.slug,
      category: r.category,
      city: r.city,
      is_public: r.is_public,
      published_count: r.published_count,
      created_at: toRfc3339(r.created_at),
    })),
  );
});

calendarRoutes.post('/', requireAuth, async (c) => {
  const account = c.get('account');
  if (account.role !== 'host') {
    return c.json({ message: 'A guest account cannot create a calendar.', field: 'slug' }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const category = typeof body.category === 'string' ? body.category : '';
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const isPublic = body.is_public === undefined ? true : Boolean(body.is_public);

  if (!name) return c.json({ message: 'Give the calendar a name.', field: 'name' }, 400);
  if (!slug || !isKebabCase(slug)) return c.json({ message: 'The address is lower case letters, numbers and single hyphens.', field: 'slug' }, 400);
  if (isReservedPath(slug) || isCategory(slug)) {
    return c.json({ message: 'That address is not available. Choose another.', field: 'slug' }, 409);
  }
  if (!isCategory(category)) return c.json({ message: 'Pick one of the twelve categories.', field: 'category' }, 400);
  if (!city) return c.json({ message: 'Say where the calendar is based.', field: 'city' }, 400);

  const taken = await pool.query(
    `SELECT 1 WHERE EXISTS(SELECT 1 FROM calendars WHERE slug = $1)
        OR EXISTS(SELECT 1 FROM events WHERE slug = $1)
        OR EXISTS(SELECT 1 FROM accounts WHERE handle = $1)`,
    [slug],
  );
  if (taken.rowCount && taken.rowCount > 0) {
    return c.json({ message: 'That address is already taken.', field: 'slug' }, 409);
  }

  const { rows } = await pool.query(
    `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [account.id, name, slug, category, city, isPublic],
  );
  return c.json(
    {
      id: rows[0].id,
      owner_account_id: rows[0].owner_account_id,
      name: rows[0].name,
      slug: rows[0].slug,
      category: rows[0].category,
      city: rows[0].city,
      is_public: rows[0].is_public,
      created_at: toRfc3339(rows[0].created_at),
    },
    201,
  );
});
