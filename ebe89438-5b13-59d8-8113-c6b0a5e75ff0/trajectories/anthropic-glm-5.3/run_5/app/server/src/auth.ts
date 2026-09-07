import type { Context, Next } from 'hono';
import { pool } from './db.js';
import { hashPassword, verifyPassword } from './crypto.js';

export type AuthAccount = {
  id: string;
  email: string;
  display_name: string;
  handle: string;
  role: 'host' | 'guest';
};

declare module 'hono' {
  interface ContextVariableMap {
    account: AuthAccount;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function bearerToken(c: Context): string | null {
  const h = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

export async function currentAccount(c: Context): Promise<AuthAccount | null> {
  const token = bearerToken(c);
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT a.id, a.email, a.display_name, a.handle, a.role
       FROM auth_tokens t JOIN accounts a ON a.id = t.account_id
      WHERE t.token = $1 AND t.expires_at > now()`,
    [token],
  );
  return rows[0] ? (rows[0] as AuthAccount) : null;
}

export async function requireAuth(c: Context, next: Next) {
  const account = await currentAccount(c);
  if (!account) {
    return c.json({ message: 'Sign in to continue. Open /login to authenticate.' }, 401);
  }
  c.set('account', account);
  await next();
}

export async function requireHost(c: Context, next: Next) {
  await requireAuth(c, next);
}

export function isHost(a: AuthAccount | null): boolean {
  return a?.role === 'host';
}

export function badRequest(c: Context, field: string, message: string) {
  return c.json({ message, field }, 400);
}

export function unauthorized(c: Context, message = 'You need to be signed in for this.') {
  return c.json({ message }, 401);
}

export function forbidden(c: Context, message = 'You cannot do that.') {
  return c.json({ message }, 403);
}

export function notFound(c: Context, message = 'Not found.') {
  return c.json({ message }, 404);
}

export function isValidEmail(v: unknown): v is string {
  return typeof v === 'string' && EMAIL_RE.test(v) && v.length <= 254;
}

export async function authenticate(email: unknown, password: unknown): Promise<AuthAccount | null> {
  if (!isValidEmail(email) || typeof password !== 'string' || password.length < 8) return null;
  const { rows } = await pool.query(
    `SELECT id, email, display_name, handle, role, password_hash FROM accounts WHERE lower(email) = lower($1)`,
    [email],
  );
  const row = rows[0];
  if (!row) return null;
  const ok = await verifyPassword(String(password), row.password_hash);
  return ok ? (row as AuthAccount) : null;
}

export async function issueToken(accountId: string): Promise<string> {
  const token = cryptoToken();
  const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await pool.query(
    `INSERT INTO auth_tokens (token, account_id, expires_at) VALUES ($1, $2, $3)`,
    [token, accountId, expires],
  );
  return token;
}

export function cryptoToken(): string {
  const buf = new Uint8Array(32);
  (globalThis as any).crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashFor(password: string): Promise<string> {
  return hashPassword(password);
}
