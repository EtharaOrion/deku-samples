import type { Context, Next } from 'hono';
import { pool } from './main.js';
import { accountById, type Account } from './db.js';
import { HttpError } from './errors.js';

export type AuthVars = { account?: Account };

declare module 'hono' {
  interface ContextVariableMap {
    account: Account | undefined;
  }
}

export function requireAuth(c: Context): Account {
  const acc = c.get('account');
  if (!acc) throw new HttpError(401, 'Sign in to continue.');
  return acc;
}

export function requireHost(c: Context): Account {
  const acc = requireAuth(c);
  if (acc.role !== 'host') throw new HttpError(404, 'Not found.');
  return acc;
}

/** Attaches the account for a valid bearer token; leaves it unset otherwise. */
export async function authMiddleware(c: Context, next: Next): Promise<void> {
  const header = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (m) {
    const token = m[1].trim();
    const rows = await pool.query(
      `select a.* from auth_tokens t join accounts a on a.id = t.account_id where t.token = $1`,
      [token],
    );
    if (rows.rows.length > 0) {
      c.set('account', rows.rows[0] as Account);
      c.header('X-Auth-Role', (rows.rows[0] as Account).role);
    }
  }
  await next();
}
