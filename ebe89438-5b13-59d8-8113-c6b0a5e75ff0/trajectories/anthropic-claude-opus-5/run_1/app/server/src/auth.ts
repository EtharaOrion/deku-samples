import type { Context, Next } from 'hono';
import { query } from './db.js';
import { env } from './env.js';
import { verifyToken } from './domain.js';
import { forbidden, unauthorized } from './errors.js';

export interface Caller {
  id: string;
  email: string;
  display_name: string;
  handle: string;
  role: 'host' | 'guest';
}

declare module 'hono' {
  interface ContextVariableMap {
    caller: Caller | null;
  }
}

export async function callerFrom(c: Context): Promise<Caller | null> {
  const header = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  const payload = verifyToken(m[1], env.jwtSecret);
  if (!payload?.sub) return null;
  const r = await query<Caller>(
    'SELECT id, email, display_name, handle, role FROM accounts WHERE id = $1',
    [payload.sub]
  );
  return r.rowCount ? r.rows[0] : null;
}

/** Attaches the caller when a valid token is present; never refuses. */
export async function attachCaller(c: Context, next: Next) {
  c.set('caller', await callerFrom(c));
  await next();
}

export function requireCaller(c: Context): Caller {
  const caller = c.get('caller');
  if (!caller) throw unauthorized('Sign in to continue.');
  return caller;
}

export function requireHost(c: Context): Caller {
  const caller = requireCaller(c);
  if (caller.role !== 'host') throw forbidden('Only a host can do that.');
  return caller;
}
