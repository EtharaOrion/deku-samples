import type { Context, Next } from 'hono';
import { createHash } from 'crypto';
import { apiToken, hashPassword, pool, shortId, verifyPassword } from './config.js';
import { bad, forbidden, unauthorized } from './http.js';

export interface Account {
  id: string;
  email: string;
  display_name: string;
  handle: string;
  role: 'host' | 'guest';
}

interface TokenRow { account_id: string; expires_at: Date }

const TOKEN_DAYS = 30;

export async function createAccount(emailAddr: string, passwordPlain: string, displayName: string, role: 'host' | 'guest'): Promise<Account> {
  const existing = await pool.query<Account & { id: string }>(
    `SELECT id FROM accounts WHERE email = $1`, [emailAddr],
  );
  if (existing.rowCount && existing.rowCount > 0) throw bad('That email already has an account. Sign in instead.', { email: 'That email already has an account.' });
  const handleBase = kebab(displayName);
  const handle = await freeHandle(handleBase);
  const row = await pool.query<Account>(
    `INSERT INTO accounts (id, email, password_hash, display_name, handle, role)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, email, display_name, handle, role`,
    [shortId(16), emailAddr, hashPassword(passwordPlain), displayName, handle, role],
  );
  return row.rows[0];
}

export function kebab(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

async function freeHandle(base: string): Promise<string> {
  const { isSlugFree } = await import('./namespace.js');
  let candidate = base || 'guest';
  for (let i = 0; i < 50; i++) {
    if (await isSlugFree(candidate)) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${shortId(4)}`;
}

export async function login(emailAddr: string, passwordPlain: string): Promise<{ account: Account; token: string }> {
  const row = await pool.query<Account & { password_hash: string }>(
    `SELECT id, email, display_name, handle, role, password_hash FROM accounts WHERE email = $1`,
    [emailAddr],
  );
  const acct = row.rows[0];
  if (!acct || !verifyPassword(passwordPlain, acct.password_hash)) {
    throw unauthorized('That email and password do not match. Check them and try again.');
  }
  const token = apiToken();
  await pool.query(
    `INSERT INTO auth_tokens (token_hash, account_id, expires_at) VALUES ($1,$2, now() + interval '${TOKEN_DAYS} days')`,
    [tokenHash(token), acct.id],
  );
  const { password_hash: _drop, ...account } = acct;
  void _drop;
  return { account, token };
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function accountFromToken(token: string | undefined): Promise<Account | null> {
  if (!token) return null;
  const row = await pool.query<TokenRow>(
    `SELECT account_id, expires_at FROM auth_tokens WHERE token_hash = $1`,
    [tokenHash(token)],
  );
  const t = row.rows[0];
  if (!t) return null;
  if (new Date(t.expires_at).getTime() < Date.now()) {
    await pool.query(`DELETE FROM auth_tokens WHERE token_hash = $1`, [tokenHash(token)]);
    return null;
  }
  const acct = await pool.query<Account>(
    `SELECT id, email, display_name, handle, role FROM accounts WHERE id = $1`, [t.account_id],
  );
  return acct.rows[0] ?? null;
}

export function bearer(c: Context): string | undefined {
  const header = c.req.header('authorization');
  if (!header) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : undefined;
}

export async function optionalAuth(c: Context, next: Next): Promise<Response> {
  const account = await accountFromToken(bearer(c));
  c.set('account', account);
  c.set('token', account ? bearer(c) : undefined);
  await next();
  return c.res;
}

export async function requireAuth(c: Context, next: Next): Promise<Response> {
  const account = await accountFromToken(bearer(c));
  if (!account) throw unauthorized();
  c.set('account', account);
  c.set('token', bearer(c));
  await next();
  return c.res;
}

export async function requireHost(c: Context, next: Next): Promise<Response> {
  const account = await accountFromToken(bearer(c));
  if (!account) throw unauthorized();
  if (account.role !== 'host') throw forbidden('Only a host of a calendar may do that.');
  c.set('account', account);
  c.set('token', bearer(c));
  await next();
  return c.res;
}

export async function logoutToken(token: string | undefined): Promise<void> {
  if (!token) return;
  await pool.query(`DELETE FROM auth_tokens WHERE token_hash = $1`, [tokenHash(token)]);
}
