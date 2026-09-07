import { Hono } from 'hono';
import { db } from '../db/client.js';
import { authAccount } from '../lib/auth.js';
import { id as newId } from '../lib/util.js';
import { checkNamespace, CATEGORIES, isCategory } from '../lib/namespace.js';
import { z } from 'zod';

export const calendarRoutes = new Hono();

calendarRoutes.get('/', async (c) => {
  const account = await authAccount(c);
  if (!account) return c.json({ message: `Sign in to see your calendars.` }, 401);
  const { rows } = await db.query(
    `SELECT c.*,
            (SELECT count(*) FROM events e WHERE e.calendar_id = c.id AND e.state IN ('published','registration_closed'))::int AS published_count
       FROM calendars c WHERE c.owner_account_id = $1 ORDER BY c.created_at ASC`,
    [account.id]
  );
  return c.json(rows);
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  category: z.string(),
  city: z.string().trim().min(1),
  is_public: z.boolean().optional(),
});

calendarRoutes.post('/', async (c) => {
  const account = await authAccount(c);
  if (!account) return c.json({ message: `Sign in to create a calendar.` }, 401);
  if (account.role !== 'host') return c.json({ message: `Only a host can create a calendar.` }, 403);
  const body = await c.req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json({ field: String(issue.path[0] ?? 'name'), message: `Check the ${String(issue.path[0] ?? 'name')} field.` }, 400);
  }
  const d = parsed.data;
  if (!isCategory(d.category)) {
    return c.json({ field: 'category', message: `Pick one of the twelve categories.` }, 400);
  }
  const verdict = await checkNamespace(d.slug, 'calendar');
  if (!verdict.ok) return c.json({ field: 'slug', message: verdict.message }, 409);
  const cid = newId();
  await db.query(
    `INSERT INTO calendars (id, owner_account_id, name, slug, category, city, is_public, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())`,
    [cid, account.id, d.name, d.slug.toLowerCase(), d.category, d.city, d.is_public ?? true]
  );
  const { rows } = await db.query(`SELECT * FROM calendars WHERE id=$1`, [cid]);
  return c.json({ ...rows[0], published_count: 0 }, 201);
});

/** one calendar by slug, with its events */
calendarRoutes.get('/:slug', async (c) => {
  const account = await authAccount(c);
  const { rows } = await db.query(
    `SELECT c.*, a.handle AS owner_handle, a.display_name AS owner_name,
            (SELECT count(*) FROM events e WHERE e.calendar_id=c.id AND e.state IN ('published','registration_closed'))::int AS published_count
       FROM calendars c JOIN accounts a ON a.id=c.owner_account_id WHERE lower(c.slug)=$1`,
    [c.req.param('slug').toLowerCase()]
  );
  const cal = rows[0];
  if (!cal) return c.json({ message: `Page Not Found` }, 404);
  const isOwner = account?.id === cal.owner_account_id;
  if (!cal.is_public && !isOwner) return c.json({ message: `Page Not Found` }, 404);
  const { rows: evs } = await db.query(
    `SELECT e.* FROM events e WHERE e.calendar_id=$1 AND e.state IN ('published','registration_closed') ORDER BY e.starts_at ASC`,
    [cal.id]
  );
  const shaped = evs.map((e: any) => ({
    slug: e.slug, title: e.title, category: e.category, city: e.city, time_zone: e.time_zone,
    starts_at: new Date(e.starts_at).toISOString(), ends_at: new Date(e.ends_at).toISOString(),
    capacity: e.capacity, theme_hex: e.theme_hex, cover_seed: e.cover_seed, state: e.state,
  }));
  return c.json({ ...cal, events: shaped });
});
