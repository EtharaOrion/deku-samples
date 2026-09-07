import { Hono } from 'hono';
import { query } from '../db.js';
import { badRequest, conflict, readBody, requireAccount, requireHost, str, bool, type Vars } from '../http.js';
import { CATEGORIES, CATEGORY_SET, RESERVED_SET, isKebab } from '../domain.js';

export const accountRoutes = new Hono<{ Variables: Vars }>();

/**
 * One root namespace: handles, calendar slugs and event slugs are checked
 * against reserved paths, category names and each other.
 */
export async function namespaceRefusal(
  slug: string,
  kind: 'handle' | 'slug',
  ignore?: { table: 'accounts' | 'calendars' | 'events'; id: number },
): Promise<string | null> {
  const taken = kind === 'handle' ? 'That handle is already taken.' : 'That address is already taken.';
  if (!isKebab(slug)) {
    return kind === 'handle'
      ? 'A handle is lowercase words joined by single hyphens.'
      : 'An address is lowercase words joined by single hyphens.';
  }
  if (RESERVED_SET.has(slug)) return taken;
  if (CATEGORY_SET.has(slug)) return taken;

  const clash = await query<{ src: string; id: number }>(
    `SELECT 'accounts' AS src, id FROM accounts WHERE handle = $1
      UNION ALL SELECT 'calendars', id FROM calendars WHERE slug = $1
      UNION ALL SELECT 'events', id FROM events WHERE slug = $1`,
    [slug],
  );
  for (const row of clash.rows) {
    if (ignore && row.src === ignore.table && Number(row.id) === ignore.id) continue;
    return taken;
  }
  return null;
}

accountRoutes.get('/me', async (c) => {
  const a = requireAccount(c);
  return c.json({ id: a.id, email: a.email, display_name: a.display_name, handle: a.handle, role: a.role });
});

// Edits the caller alone; the body carries no account identifier.
accountRoutes.patch('/me', async (c) => {
  const a = requireAccount(c);
  const body = await readBody(c);
  const displayName = str(body, 'display_name', { max: 120 });
  const handle = str(body, 'handle', { max: 80 })?.toLowerCase();

  if (displayName === undefined && handle === undefined) {
    throw badRequest('Change a name or a handle before saving.', 'display_name');
  }
  if (handle !== undefined && handle !== a.handle) {
    const refusal = await namespaceRefusal(handle, 'handle', { table: 'accounts', id: a.id });
    if (refusal) throw conflict(refusal, 'handle');
  }

  const r = await query(
    `UPDATE accounts
        SET display_name = COALESCE($2, display_name), handle = COALESCE($3, handle)
      WHERE id = $1
    RETURNING id, email, display_name, handle, role`,
    [a.id, displayName ?? null, handle ?? null],
  );
  return c.json(r.rows[0]);
});

export const calendarRoutes = new Hono<{ Variables: Vars }>();

calendarRoutes.get('/', async (c) => {
  const a = requireAccount(c);
  const r = await query(
    `SELECT c.id, c.owner_account_id, c.name, c.slug, c.category, c.city, c.is_public, c.created_at,
            (SELECT count(*)::bigint FROM events e WHERE e.calendar_id = c.id AND e.state IN ('published','registration_closed')) AS published_event_count,
            (SELECT count(*)::bigint FROM events e WHERE e.calendar_id = c.id) AS event_count
       FROM calendars c
      WHERE c.owner_account_id = $1
      ORDER BY c.created_at ASC, c.id ASC`,
    [a.id],
  );
  return c.json(r.rows);
});

calendarRoutes.post('/', async (c) => {
  const a = requireHost(c);
  const body = await readBody(c);
  const name = str(body, 'name', { required: true, max: 120 })!;
  const slug = str(body, 'slug', { required: true, max: 80 })!.toLowerCase();
  const category = str(body, 'category', { required: true, max: 40 })!;
  const city = str(body, 'city', { required: true, max: 120 })!;
  const isPublic = bool(body, 'is_public') ?? true;

  if (!CATEGORY_SET.has(category)) {
    throw badRequest(`Choose one of the twelve categories: ${CATEGORIES.join(', ')}.`, 'category');
  }
  const refusal = await namespaceRefusal(slug, 'slug');
  if (refusal) throw conflict(refusal, 'slug');

  const r = await query(
    `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, owner_account_id, name, slug, category, city, is_public, created_at`,
    [a.id, name, slug, category, city, isPublic],
  );
  return c.json(r.rows[0], 201);
});
