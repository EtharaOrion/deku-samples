import type { Context, MiddlewareHandler } from 'hono';
import { readToken } from './crypto.js';
import { query } from './db.js';

export interface Account {
  id: number;
  email: string;
  display_name: string;
  handle: string;
  role: 'host' | 'guest';
  created_at: string;
}

export type Vars = { account?: Account };

export class ApiError extends Error {
  status: number;
  field?: string;
  extra?: Record<string, unknown>;

  constructor(status: number, message: string, field?: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.field = field;
    this.extra = extra;
  }
}

export const notFound = (message = 'Looks like you discovered a page that doesn\'t exist or you don\'t have access to.') =>
  new ApiError(404, message);

export const badRequest = (message: string, field?: string) => new ApiError(400, message, field);
export const conflict = (message: string, field?: string) => new ApiError(409, message, field);
export const unauthorized = (message = 'Sign in to continue.') => new ApiError(401, message);

export function errorBody(e: ApiError) {
  return {
    message: e.message,
    ...(e.field ? { field: e.field } : {}),
    ...(e.extra ?? {}),
  };
}

export async function loadAccount(id: number): Promise<Account | null> {
  const r = await query<Account>(
    `SELECT id, email, display_name, handle, role, created_at FROM accounts WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

/** Attaches the caller when a valid bearer token is present; never rejects. */
export const optionalAuth: MiddlewareHandler<{ Variables: Vars }> = async (c, next) => {
  const header = c.req.header('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match) {
    const claims = readToken(match[1].trim());
    if (claims) {
      const account = await loadAccount(claims.accountId);
      if (account) c.set('account', account);
    }
  }
  await next();
};

export function requireAccount(c: Context<{ Variables: Vars }>): Account {
  const account = c.get('account');
  if (!account) throw unauthorized();
  return account;
}

export function requireHost(c: Context<{ Variables: Vars }>): Account {
  const account = requireAccount(c);
  // A guest reaching a host-only surface meets the not-found response, so no
  // wording confirms the record exists.
  if (account.role !== 'host') throw notFound();
  return account;
}

export function readBody(c: Context): Promise<any> {
  return c.req.json().catch(() => {
    throw badRequest('Send a JSON body.');
  });
}

export function str(body: any, field: string, opts: { required?: boolean; max?: number; min?: number } = {}): string | undefined {
  const raw = body?.[field];
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    if (opts.required) throw badRequest(`Add a ${field.replace(/_/g, ' ')}.`, field);
    return undefined;
  }
  if (typeof raw !== 'string') throw badRequest(`${field} must be text.`, field);
  const v = raw.trim();
  if (opts.min && v.length < opts.min) throw badRequest(`${field} is too short.`, field);
  if (opts.max && v.length > opts.max) throw badRequest(`${field} is too long.`, field);
  return v;
}

export function bool(body: any, field: string): boolean | undefined {
  const raw = body?.[field];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'boolean') throw badRequest(`${field} must be true or false.`, field);
  return raw;
}

export function int(body: any, field: string, min: number, max: number): number | undefined {
  const raw = body?.[field];
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(n)) throw badRequest(`${field} must be a whole number.`, field);
  if (n < min || n > max) throw badRequest(`${field} must be between ${min} and ${max}.`, field);
  return n;
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}(:\d{2})?(\.\d+)?([Zz])$/;

export function instant(body: any, field: string): string | undefined {
  const raw = body?.[field];
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || !RFC3339.test(raw)) {
    throw badRequest('Give the time as an instant in UTC ending in Z.', field);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw badRequest('That is not a real time.', field);
  return d.toISOString();
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
