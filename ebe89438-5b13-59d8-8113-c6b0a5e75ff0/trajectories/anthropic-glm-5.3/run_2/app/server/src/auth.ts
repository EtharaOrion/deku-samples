import { randomBytes } from 'node:crypto';
import type { Context, Next } from 'hono';
import { pool } from './db.js';
import { ApiError } from './domain.js';

export interface AuthAccount {
  id: string; email: string; display_name: string; handle: string; role: string;
}

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Fixed-window limiter: 10 requests per minute per key. */
export function rateLimit(key: string, limit = 10, windowMs = 60_000): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new ApiError(429, 'rate_limited', `Too many attempts. The limit is ${limit} requests per minute; try again in a moment.`, undefined);
  }
}

export function bearer(c: Context): string | null {
  const h = c.req.header('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

export async function accountFromToken(c: Context): Promise<AuthAccount | null> {
  const token = bearer(c);
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT id, email, display_name, handle, role FROM accounts WHERE id = $1`, [token]);
  return (rows[0] as AuthAccount) ?? null;
}

export async function requireAuth(c: Context, next: Next): Promise<void> {
  const account = await accountFromToken(c);
  if (!account) {
    throw new ApiError(401, 'unauthorized', `Sign in to continue.`);
  }
  c.set('account', account);
  await next();
}

export async function requireHost(c: Context, next: Next): Promise<void> {
  const account = await accountFromToken(c);
  if (!account) throw new ApiError(401, 'unauthorized', `Sign in to continue.`);
  if (account.role !== 'host') {
    throw new ApiError(403, 'forbidden', `Only the host of this calendar may do that.`);
  }
  c.set('account', account);
  await next();
}

export function newToken(): string {
  return randomBytes(24).toString('hex');
}
