import { Hono } from 'hono';
import { pool, withTxn } from './db.js';
import { ApiError, assertKebabHandle, isSlugReserved } from './domain.js';
import type { AuthAccount } from './auth.js';

type Vars = { account?: AuthAccount };
const app = new Hono<{ Variables: Vars }>();

app.get('/me', async c => {
  const account = c.get('account')!;
  const { rows } = await pool.query(
    `SELECT id, email, display_name, handle, role, created_at FROM accounts WHERE id = $1`, [account.id]);
  return c.json(rows[0]);
});

app.patch('/me', async c => {
  const account = c.get('account')!;
  const body = await c.req.json().catch(() => ({} as any));
  const b = body ?? {};
  const displayName = b.display_name !== undefined ? String(b.display_name).trim() : undefined;
  if (displayName !== undefined && !displayName) {
    throw new ApiError(400, 'bad_display_name', `Add your name so hosts know who is coming.`, { display_name: `Add your name so hosts know who is coming.` });
  }
  let handle = b.handle !== undefined ? String(b.handle).trim().toLowerCase() : undefined;
  if (handle !== undefined) {
    assertKebabHandle(handle);
    if (isSlugReserved(handle)) {
      throw new ApiError(409, 'handle_taken', `That handle is already taken.`, { handle: `That handle is already taken.` });
    }
  }
  return withTxn(async tx => {
    if (handle !== undefined && handle !== account.handle) {
      const clash = await tx.query(`SELECT 1 FROM root_namespace WHERE value = $1`, [handle]);
      if (clash.length) {
        throw new ApiError(409, 'handle_taken', `That handle is already taken.`, { handle: `That handle is already taken.` });
      }
    }
    const [row] = await tx.query(
      `UPDATE accounts SET display_name = COALESCE($2, display_name), handle = COALESCE($3, handle)
        WHERE id = $1 RETURNING id, email, display_name, handle, role, created_at`,
      [account.id, displayName ?? null, handle ?? null]);
    return c.json(row);
  });
});

export default app;
