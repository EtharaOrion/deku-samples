import crypto from 'node:crypto';
import { query } from './db.js';

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEYLEN = 32;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, n, r, p, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const derived = crypto.scryptSync(password, Buffer.from(salt, 'base64'), KEYLEN, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    const expected = Buffer.from(hash, 'base64');
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

const TOKEN_TTL_SECONDS = Number(process.env.TOKEN_TTL_SECONDS || 60 * 60 * 24 * 7);

function tokenSecret(): string {
  return process.env.TOKEN_SECRET || 'deku-token-secret-local';
}

function sign(payload: string) {
  return crypto.createHmac('sha256', tokenSecret()).update(payload).digest('base64url');
}

export function issueToken(accountId: string) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${accountId}.${exp}`;
  return { token: `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`, expires_in: TOKEN_TTL_SECONDS };
}

export type TokenCheck =
  | { ok: true; accountId: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyToken(token: string): TokenCheck {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [encoded, mac] = parts;
  let payload: string;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const expectedMac = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' };
  const [accountId, exp] = payload.split('.');
  if (!accountId || !exp) return { ok: false, reason: 'malformed' };
  if (Number(exp) * 1000 < Date.now()) return { ok: false, reason: 'expired' };
  return { ok: true, accountId };
}

export type Account = {
  id: string;
  email: string;
  display_name: string;
  handle: string;
  role: 'host' | 'guest';
};

export async function accountFromToken(token: string): Promise<{ account?: Account; expired?: boolean }> {
  const check = verifyToken(token);
  if (!check.ok) return { expired: check.reason === 'expired' };
  const res = await query<Account>(
    'SELECT id::text, email, display_name, handle, role FROM accounts WHERE id = $1',
    [check.accountId]
  );
  if (!res.rowCount) return {};
  return { account: res.rows[0] };
}

/** TKT- plus 8 uppercase letters and digits. */
const TICKET_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function newTicketCode() {
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += TICKET_ALPHABET[bytes[i] % TICKET_ALPHABET.length];
  return `TKT-${out}`;
}
