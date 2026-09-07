import type { Context } from 'hono';
import { pool } from './db.js';
import { readToken } from './core.js';
import { RuleError } from './registrations.js';

export interface Account {
  id: number;
  email: string;
  display_name: string;
  handle: string;
  role: 'host' | 'guest';
}

export const NOT_FOUND = {
  message: 'Looks like you discovered a page that doesn\u2019t exist or you don\u2019t have access to.',
};

/** The single not-found answer, used for absent records and for records the
 *  caller may not see, so wording never confirms a private record exists. */
export function notFound(c: Context) {
  return c.json(NOT_FOUND, 404);
}

export function fail(c: Context, message: string, status = 400, field?: string) {
  return c.json(field ? { message, field } : { message }, status as 400);
}

export async function currentAccount(c: Context): Promise<Account | null> {
  const header = c.req.header('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  const id = readToken(m[1].trim());
  if (id === null) return null;
  const r = await pool.query(
    'SELECT id, email, display_name, handle, role FROM accounts WHERE id = $1',
    [id],
  );
  return r.rowCount ? (r.rows[0] as Account) : null;
}

/** Every protected endpoint goes through here: no token means denied. */
export async function requireAccount(c: Context): Promise<Account> {
  const acct = await currentAccount(c);
  if (!acct) throw new RuleError('Sign in to continue.', 401);
  return acct;
}

export async function requireHost(c: Context): Promise<Account> {
  const acct = await requireAccount(c);
  if (acct.role !== 'host') throw new RuleError('not found', 404);
  return acct;
}

// --------------------------------------------------------------- rate limit
const buckets = new Map<string, number[]>();

/** At most `limit` requests per minute per key; over that is a client error. */
export function rateLimit(key: string, limit = 10, windowMs = 60_000): void {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    throw new RuleError(
      `Too many requests. The limit is ${limit} requests per minute. Please wait a moment and try again.`,
      429,
    );
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
}

// --------------------------------------------------------------- validation
export function str(body: any, field: string, opts: { max?: number; min?: number } = {}): string {
  const v = body?.[field];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new RuleError(`Provide a value for ${field}.`, 400, field);
  }
  const t = v.trim();
  if (opts.max && t.length > opts.max) {
    throw new RuleError(`${field} must be at most ${opts.max} characters.`, 400, field);
  }
  if (opts.min && t.length < opts.min) {
    throw new RuleError(`${field} must be at least ${opts.min} characters.`, 400, field);
  }
  return t;
}

export function optStr(body: any, field: string, max = 5000): string | undefined {
  const v = body?.[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new RuleError(`${field} must be text.`, 400, field);
  if (v.length > max) throw new RuleError(`${field} must be at most ${max} characters.`, 400, field);
  return v.trim();
}

export function optBool(body: any, field: string): boolean | undefined {
  const v = body?.[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'boolean') throw new RuleError(`${field} must be true or false.`, 400, field);
  return v;
}

export function optInt(body: any, field: string): number | undefined {
  const v = body?.[field];
  if (v === undefined || v === null) return undefined;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n)) {
    throw new RuleError(`${field} must be a whole number.`, 400, field);
  }
  return n;
}

export async function readJson(c: Context): Promise<any> {
  try {
    const body = await c.req.json();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new RuleError('Send a JSON object.', 400);
    }
    return body;
  } catch (e) {
    if (e instanceof RuleError) throw e;
    throw new RuleError('Send a JSON object.', 400);
  }
}
