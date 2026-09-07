import { Hono } from 'hono';
import { pool } from '../main.js';
import { requireAuth } from '../auth.js';
import { calendarById, rootNamespaceTaken, query, type Calendar } from '../db.js';
import { isKebabCase, newId, log } from '../util.js';
import { calendarJson } from '../serialize.js';
import { CATEGORIES } from '../constants.js';

export const calendarRoutes = new Hono();

calendarRoutes.get('/', async (c) => {
  const acc = requireAuth(c);
  const rows = await query<Calendar>(pool,
    `select * from calendars where owner_account_id = $1 order by created_at asc`, [acc.id]);
  return c.json(rows.map(calendarJson));
});

calendarRoutes.post('/', async (c) => {
  const acc = requireAuth(c);
  if (acc.role !== 'host') return c.json({ message: 'Not found.' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  const slug = String(body.slug ?? '').trim().toLowerCase();
  const category = String(body.category ?? '').trim();
  const city = String(body.city ?? '').trim();
  const isPublic = body.is_public === undefined ? true : Boolean(body.is_public);

  if (!name) return c.json({ message: 'Give the calendar a name.', field: 'name' }, 400);
  if (!slug || !isKebabCase(slug)) return c.json({ message: 'The address is lower-case letters, digits and single dashes.', field: 'slug' }, 400);
  if (!category || !(CATEGORIES as readonly string[]).includes(category)) {
    return c.json({ message: 'Choose one of the twelve categories.', field: 'category' }, 400);
  }
  if (!city) return c.json({ message: 'Name the city this calendar lives in.', field: 'city' }, 400);

  const taken = await rootNamespaceTaken(pool, slug);
  if (taken) return c.json({ message: 'That address is already taken.', field: 'slug' }, 409);

  const rows = await query<Calendar>(pool,
    `insert into calendars (id, owner_account_id, name, slug, category, city, is_public)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [newId('cal'), acc.id, name, slug, category, city, isPublic]);
  log({ level: 'info', msg: 'calendar created', slug, owner: acc.id });
  return c.json(calendarJson(rows[0]), 201);
});

calendarRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const cal = await calendarById(pool, slug);
  if (!cal) return c.json({ message: 'Not found.' }, 404);
  const acc = c.get('account');
  const isOwner = acc && acc.id === cal.owner_account_id;
  if (!cal.is_public && !isOwner) return c.json({ message: 'Not found.' }, 404);
  return c.json(calendarJson(cal));
});
