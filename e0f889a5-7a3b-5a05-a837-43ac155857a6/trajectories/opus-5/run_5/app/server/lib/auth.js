import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { one } from './db.js';
import { unauthorized } from './errors.js';

const scrypt = promisify(_scrypt);

// scrypt is a modern memory-hard password hash and ships with node, so nothing
// outside the named libraries is pulled in for it.
const N = 16384, r = 8, p = 1, KEYLEN = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, n, rr, pp, saltB64, keyB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(password, salt, expected.length, {
      N: Number(n), r: Number(rr), p: Number(pp), maxmem: 64 * 1024 * 1024,
    });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

export const sha256 = (v) => createHash('sha256').update(String(v)).digest('hex');
export const newOpaqueToken = () => randomBytes(32).toString('base64url');

const TOKEN_TTL_MS = Number(process.env.TOKEN_TTL_HOURS || 72) * 3600 * 1000;

export async function issueToken(customerId) {
  const token = newOpaqueToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await one(
    `INSERT INTO auth_token (customer_id, token_hash, expires_at) VALUES ($1,$2,$3) RETURNING id`,
    [customerId, sha256(token), expiresAt],
  );
  return { token, expiresAt };
}

/** Resolve a bearer token to a customer, or null. An expired token resolves to null. */
export async function customerForToken(token) {
  if (!token) return null;
  const row = await one(
    `SELECT c.id, c.email, c.name, c.status, t.expires_at
       FROM auth_token t JOIN customer c ON c.id = t.customer_id
      WHERE t.token_hash = $1 AND t.expires_at > now() AND c.status = 'active'`,
    [sha256(token)],
  );
  return row ?? null;
}

export function bearerFrom(c) {
  const header = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (m) return m[1].trim();
  // The server-rendered pages carry the same token in an http-only cookie so a
  // page load is authenticated by exactly the token the API issued.
  const cookie = c.req.header('cookie') || '';
  const cm = /(?:^|;\s*)vela_token=([^;]+)/.exec(cookie);
  return cm ? decodeURIComponent(cm[1]) : null;
}

/** Middleware: every /api/account route takes a bearer token. */
export async function requireCustomer(c, next) {
  const customer = await customerForToken(bearerFrom(c));
  if (!customer) throw unauthorized('Your session has expired. Sign in to continue.', 'token_expired');
  c.set('customer', customer);
  await next();
}

/** Middleware: attach a customer when a token is present, but never require one. */
export async function optionalCustomer(c, next) {
  const customer = await customerForToken(bearerFrom(c));
  if (customer) c.set('customer', customer);
  await next();
}
