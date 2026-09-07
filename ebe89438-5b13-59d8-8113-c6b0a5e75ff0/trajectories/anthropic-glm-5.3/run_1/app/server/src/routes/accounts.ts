import { Hono } from 'hono';
import { db } from '../db/client.js';
import { authAccount } from '../lib/auth.js';
import { checkNamespace } from '../lib/namespace.js';
import { z } from 'zod';

export const accountRoutes = new Hono();

function shape(a: any) {
  return { id: a.id, email: a.email, display_name: a.display_name, handle: a.handle, role: a.role };
}

accountRoutes.get('/me', async (c) => {
  const account = await authAccount(c);
  if (!account) return c.json({ message: `Sign in to see your account.` }, 401);
  const { rows } = await db.query(`SELECT * FROM accounts WHERE id=$1`, [account.id]);
  return c.json(shape(rows[0]));
});

const patchSchema = z.object({
  display_name: z.string().trim().min(1).optional(),
  handle: z.string().trim().min(1).optional(),
});

accountRoutes.patch('/me', async (c) => {
  const account = await authAccount(c);
  if (!account) return c.json({ message: `Sign in to change your profile.` }, 401);
  const body = await c.req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json({ field: String(issue.path[0] ?? 'display_name'), message: `Check the ${String(issue.path[0] ?? 'display_name')} field.` }, 400);
  }
  const d = parsed.data;
  const current = (await db.query(`SELECT * FROM accounts WHERE id=$1`, [account.id])).rows[0];

  if (d.handle !== undefined && d.handle.toLowerCase() !== current.handle.toLowerCase()) {
    const verdict = await checkNamespace(d.handle, 'handle', account.id);
    if (!verdict.ok) return c.json({ field: 'handle', message: verdict.message }, 409);
  }
  const next = {
    display_name: d.display_name ?? current.display_name,
    handle: d.handle !== undefined ? d.handle.toLowerCase() : current.handle,
  };
  await db.query(`UPDATE accounts SET display_name=$2, handle=$3 WHERE id=$1`, [account.id, next.display_name, next.handle]);
  const { rows } = await db.query(`SELECT * FROM accounts WHERE id=$1`, [account.id]);
  return c.json(shape(rows[0]));
});

/** a public profile by handle */
accountRoutes.get('/:handle', async (c) => {
  const { rows } = await db.query(
    `SELECT a.id, a.handle, a.display_name, a.role,
            (SELECT count(*) FROM calendars c WHERE c.owner_account_id=a.id AND c.is_public)::int AS public_calendars
       FROM accounts a WHERE lower(a.handle)=$1`,
    [c.req.param('handle').toLowerCase()]
  );
  if (!rows[0]) return c.json({ message: `Page Not Found` }, 404);
  const cals = await db.query(
    `SELECT c.* FROM calendars c WHERE c.owner_account_id=$1 AND c.is_public ORDER BY c.created_at`,
    [rows[0].id]
  );
  return c.json({ ...rows[0], calendars: cals.rows });
});
