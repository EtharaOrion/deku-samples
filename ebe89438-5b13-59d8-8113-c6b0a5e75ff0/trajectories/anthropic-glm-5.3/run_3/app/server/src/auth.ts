import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from './config.ts';
import type { Tx } from './db.ts';
import { query } from './db.ts';

export type Account = {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  handle: string;
  role: 'host' | 'guest';
  created_at: string;
};

/** scrypt with per-account salt, stored as `scrypt$N$salt$hash`. */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  const N = 16384;
  const hash = scryptSync(pw, salt, 64, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex');
  return `scrypt$${N}$${salt}$${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const salt = parts[2];
  const expected = Buffer.from(parts[3], 'hex');
  const got = scryptSync(pw, salt, expected.length, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export type AuthCtx = { account: Account };

const b64u = (b: Buffer) => b.toString('base64url');
const unb64u = (s: string) => Buffer.from(s, 'base64url');

function sign(payload: string): string {
  return b64u(createHmac('sha256', config.authSecret).update(payload).digest());
}

export function issueToken(accountId: number, ttlSeconds: number): string {
  const body = JSON.stringify({ sub: accountId, exp: Math.floor(Date.now() / 1000) + ttlSeconds, jti: randomBytes(8).toString('hex') });
  const p = b64u(Buffer.from(body));
  return `${p}.${sign(p)}`;
}

export function parseToken(token: string): { sub: number; exp: number } | null {
  const idx = token.lastIndexOf('.');
  if (idx < 1) return null;
  const p = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expect = sign(p);
  const a = unb64u(sig);
  const b = unb64u(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(unb64u(p).toString('utf8'));
    if (typeof obj.sub !== 'number' || typeof obj.exp !== 'number') return null;
    return obj;
  } catch {
    return null;
  }
}

export function tokenExpired(t: { exp: number }): boolean {
  return t.exp * 1000 <= Date.now();
}

export async function accountById(id: number): Promise<Account | null> {
  const rows = await query<Account>('select * from accounts where id = $1', [id]);
  return rows[0] ?? null;
}

export async function createAccount(
  tx: Tx,
  data: { email: string; password: string; display_name: string; handle: string; role: 'host' | 'guest' }
): Promise<Account> {
  const rows = await tx
    .query(`insert into accounts (email, password_hash, display_name, handle, role)
            values ($1, $2, $3, $4, $5) returning *`,
      [data.email, hashPassword(data.password), data.display_name, data.handle, data.role]);
  return rows.rows[0];
}
