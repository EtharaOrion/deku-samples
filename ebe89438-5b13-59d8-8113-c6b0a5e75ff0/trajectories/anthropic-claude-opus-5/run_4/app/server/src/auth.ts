import type { Context, Next } from 'hono';
import { env } from './env.js';
import { query } from './db.js';
import { verifyToken } from './util.js';
import { unauthorized, forbidden } from './errors.js';

export interface Account {
  id: number;
  email: string;
  display_name: string;
  handle: string;
  role: 'host' | 'guest';
}

export type Vars = { account: Account | null };

export async function loadAccount(c: Context<{ Variables: Vars }>, next: Next) {
  const header = c.req.header('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  let account: Account | null = null;
  if (m) {
    const payload = verifyToken(env.secret, m[1]!);
    if (payload) {
      const r = await query<Account>(
        'SELECT id, email, display_name, handle, role FROM accounts WHERE id = $1',
        [payload.sub],
      );
      account = r.rows[0] ?? null;
    }
  }
  c.set('account', account);
  await next();
}

export function requireAccount(c: Context<{ Variables: Vars }>): Account {
  const a = c.get('account');
  if (!a) throw unauthorized('Sign in to continue.');
  return a;
}

export function requireHost(c: Context<{ Variables: Vars }>): Account {
  const a = requireAccount(c);
  if (a.role !== 'host') throw forbidden('Only a host can do that.');
  return a;
}
