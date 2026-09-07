import type { Context } from 'hono';
import { accountById, parseToken, tokenExpired } from './auth.ts';
import { unauthorized } from './errors.ts';
import { rateLimit } from './ratelimit.ts';

export type Vars = {
  account?: any;
};

export async function requireAuth(c: Context, next: () => Promise<void>) {
  const h = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) throw unauthorized('Sign in to continue.');
  const parsed = parseToken(m[1]);
  if (!parsed) throw unauthorized('Your session has ended. Sign in again.');
  if (tokenExpired(parsed)) {
    throw unauthorized('Your session has ended. Sign in again.');
  }
  const acct = await accountById(parsed.sub);
  if (!acct) throw unauthorized('Your session has ended. Sign in again.');
  c.set('account', acct);
  await next();
}

export function requireRole(role: 'host' | 'guest') {
  return async (c: Context, next: () => Promise<void>) => {
    const acct = c.get('account');
    if (!acct) throw unauthorized('Sign in to continue.');
    if (acct.role !== role) {
      // A guest probing a host route must meet the same not-found page the
      // route would give a caller with no account at all.
      throw (await import('./errors.ts')).notFound('We could not find that page.');
    }
    await next();
  };
}

/** Registration and login: at most 10 requests per minute per account. */
export function limited(scope: string) {
  return async (c: Context, next: () => Promise<void>) => {
    const body = await c.req.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.toLowerCase() : c.req.header('authorization') || 'anon';
    const key = `${scope}:${email}`;
    const r = rateLimit(key, 10, 60_000);
    if (!r.ok) {
      throw (await import('./errors.ts')).tooMany(
        `That is a lot of attempts at once. Wait ${r.retryAfter} seconds and try again.`,
        { field: 'rate_limit', limit: 10, window_seconds: 60, retry_after: r.retryAfter }
      );
    }
    await next();
  };
}
