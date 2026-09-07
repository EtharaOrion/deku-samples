import crypto from 'node:crypto';
import type { Context, Next } from 'hono';
import { env } from './env.js';
import { query } from './db.js';

export type Account = {
  id: number;
  email: string;
  display_name: string;
  handle: string;
  role: 'host' | 'guest';
};

function b64url(b: Buffer | string) {
  return Buffer.from(b).toString('base64url');
}

export function issueToken(accountId: number, ttl = env.tokenTtlSeconds): { token: string; expires_in: number; expires_at: string } {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const payload = b64url(JSON.stringify({ sub: accountId, exp }));
  const sig = crypto.createHmac('sha256', env.authSecret).update(payload).digest('base64url');
  return {
    token: `${payload}.${sig}`,
    expires_in: ttl,
    expires_at: new Date(exp * 1000).toISOString(),
  };
}

export function readToken(token: string): { sub: number; exp: number } | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', env.authSecret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof parsed.sub !== 'number' || typeof parsed.exp !== 'number') return null;
    if (parsed.exp * 1000 < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function loadAccount(id: number): Promise<Account | null> {
  const r = await query<Account>(
    'SELECT id, email, display_name, handle, role FROM accounts WHERE id = $1',
    [id],
  );
  return r.rows[0] ?? null;
}

declare module 'hono' {
  interface ContextVariableMap {
    account: Account | null;
  }
}

/** Attaches the caller when a valid bearer token is present; never rejects. */
export async function attachAccount(c: Context, next: Next) {
  const header = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  let account: Account | null = null;
  if (m) {
    const claims = readToken(m[1].trim());
    if (claims) account = await loadAccount(claims.sub);
  }
  c.set('account', account);
  await next();
}

export function requireAccount(c: Context): Account {
  const a = c.get('account');
  if (!a) {
    const err: any = new Error('Sign in to continue.');
    err.status = 401;
    err.code = 'unauthenticated';
    throw err;
  }
  return a;
}
