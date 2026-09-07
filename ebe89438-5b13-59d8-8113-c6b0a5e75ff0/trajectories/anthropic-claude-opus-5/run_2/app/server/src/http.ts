import type { Context } from 'hono';
import { pool } from './db.js';
import { FieldError, readToken, log } from './util.js';

export interface Account {
  id: string;
  email: string;
  display_name: string;
  handle: string;
  role: 'host' | 'guest';
}

export type AppContext = Context<{ Variables: { account?: Account } }>;

/** A refusal names what happened and what to do next, never the word "error". */
export function refuse(
  c: AppContext,
  status: number,
  message: string,
  field?: string,
  extra: Record<string, unknown> = {},
) {
  return c.json({ message, field: field ?? null, ...extra }, status as 400);
}

export const NOT_FOUND_BODY = {
  message: "Looks like you discovered a page that doesn't exist or you don't have access to.",
  field: null,
};

/** The one response a draft event, a foreign event and a missing slug share. */
export function notFound(c: AppContext) {
  return c.json(NOT_FOUND_BODY, 404);
}

export async function accountFromRequest(
  c: AppContext,
): Promise<{ account?: Account; state: 'valid' | 'expired' | 'invalid' | 'none' }> {
  const header = c.req.header('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return { state: 'none' };
  const parsed = readToken(match[1]);
  if (parsed.state !== 'valid' || !parsed.sub) return { state: parsed.state };
  const { rows } = await pool.query(
    'SELECT id, email, display_name, handle, role FROM accounts WHERE id = $1',
    [parsed.sub],
  );
  if (!rows.length) return { state: 'invalid' };
  return { account: rows[0] as Account, state: 'valid' };
}

/** A request without a valid token is denied, not served. */
export async function requireAccount(c: AppContext): Promise<Account> {
  const { account, state } = await accountFromRequest(c);
  if (!account) {
    throw new FieldError(
      'authorization',
      state === 'expired'
        ? 'Your session has expired. Sign in again to continue.'
        : 'Sign in to continue.',
      401,
    );
  }
  return account;
}

export async function requireHost(c: AppContext): Promise<Account> {
  const account = await requireAccount(c);
  if (account.role !== 'host') {
    // Scope is by ownership, not by role: a guest is told nothing exists here.
    throw new FieldError('role', NOT_FOUND_BODY.message, 404);
  }
  return account;
}

export async function readJson(c: AppContext): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new FieldError('body', 'Send a JSON object.', 400);
    }
    return body as Record<string, unknown>;
  } catch (err) {
    if (err instanceof FieldError) throw err;
    throw new FieldError('body', 'Send a JSON object.', 400);
  }
}

export function handleError(err: unknown, c: AppContext) {
  if (err instanceof FieldError) {
    return c.json({ message: err.message, field: err.field }, err.status as 400);
  }
  log('error', 'unhandled', {
    message: (err as Error)?.message,
    stack: (err as Error)?.stack,
    path: c.req.path,
  });
  return c.json(
    { message: 'Something went wrong on our side. Try again in a moment.', field: null },
    500,
  );
}

/* --------------------------------------------------------------- rate limit */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Registration and login accept at most 10 requests per minute per account. */
export function rateLimit(key: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const found = buckets.get(key);
  if (!found || found.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  found.count += 1;
  if (found.count > limit) {
    throw new FieldError(
      'rate_limit',
      `Too many attempts. This endpoint accepts at most ${limit} requests per minute per account. Try again in ${Math.ceil(
        (found.resetAt - now) / 1000,
      )} seconds.`,
      429,
    );
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 60_000).unref();
