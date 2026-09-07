import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { env } from './env.js';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = await scryptAsync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function issueToken(accountId: number, ttlSeconds = TOKEN_TTL_SECONDS): { token: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = b64url(JSON.stringify({ sub: accountId, exp }));
  const sig = createHmac('sha256', env.authSecret).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function readToken(token: string): { accountId: number } | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', env.authSecret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof parsed.sub !== 'number' || typeof parsed.exp !== 'number') return null;
    if (parsed.exp * 1000 < Date.now()) return null;
    return { accountId: parsed.sub };
  } catch {
    return null;
  }
}

const TICKET_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function makeTicketCode(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (const byte of bytes) out += TICKET_ALPHABET[byte % TICKET_ALPHABET.length];
  return `TKT-${out}`;
}
