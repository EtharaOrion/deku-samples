import { Hono } from 'hono';
import { pool, withTxn } from './db.js';
import { ApiError, assertSlugFree, slugify } from './domain.js';
import { CATEGORIES } from './config.js';
import type { AuthAccount } from './auth.js';

type Vars = { account?: AuthAccount };
const app = new Hono<{ Variables: Vars }>();

app.get('/', async c => {
  const account = c.get('account')!;
  const { rows } = await pool.query(
    `SELECT c.*, (SELECT count(*)::int FROM events e WHERE e.calendar_id = c.id AND e.state = 'published') AS published_count
       FROM calendars c WHERE c.owner_account_id = $1 ORDER BY c.created_at ASC`, [account.id]);
  return c.json(rows);
});

app.post('/', async c => {
  const account = c.get('account')!;
  if (account.role !== 'host') {
    throw new ApiError(403, 'forbidden', `A guest account cannot create a calendar.`);
  }
  const body = await c.req.json().catch(() => ({} as any));
  const b = body ?? {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) throw new ApiError(400, 'bad_name', `Give the calendar a name.`, { name: `Give the calendar a name.` });
  const category = typeof b.category === 'string' ? b.category : '';
  if (!(CATEGORIES as readonly string[]).includes(category)) {
    throw new ApiError(400, 'bad_category', `Choose one of the twelve categories.`, { category: `Choose a category.` });
  }
  const city = typeof b.city === 'string' ? b.city.trim() : '';
  if (!city) throw new ApiError(400, 'bad_city', `Say where the calendar is based.`, { city: `Say where it is based.` });
  const isPublic = b.is_public === true;
  let slug = slugify(typeof b.slug === 'string' && b.slug.trim() ? b.slug : name);
  return withTxn(async tx => {
    if (!slug) throw new ApiError(400, 'bad_slug', `That address will not work.`, { slug: `That address will not work.` });
    await assertSlugFree(tx, slug, `That address will not work.`);
    const [row] = await tx.query(
      `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [account.id, name, slug, category, city, isPublic]);
    return c.json(row, 201);
  });
});

export default app;
