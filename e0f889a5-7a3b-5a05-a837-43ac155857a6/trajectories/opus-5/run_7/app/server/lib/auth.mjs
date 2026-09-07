import crypto from 'node:crypto';
import { one, query } from './db.mjs';
import { unauthorized } from './errors.mjs';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const TOKEN_TTL_MS = Number(process.env.TOKEN_TTL_HOURS || 72) * 3600 * 1000;

/** scrypt, a modern memory-hard password hash. Stored as scrypt$N$r$p$salt$hash. */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const saltBuf = Buffer.from(salt, 'base64');
    const expected = Buffer.from(hash, 'base64');
    const dk = crypto.scryptSync(password, saltBuf, expected.length, { N: Number(N), r: Number(r), p: Number(p) });
    return crypto.timingSafeEqual(dk, expected);
  } catch {
    return false;
  }
}

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export async function issueToken(customerId) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await query('INSERT INTO auth_token (token_hash, customer_id, expires_at) VALUES ($1,$2,$3)', [
    sha256(token), customerId, expiresAt,
  ]);
  return { token, expiresAt };
}

/** Resolve a bearer token to a customer, or null. Expired tokens resolve to null. */
export async function customerForToken(token) {
  if (!token) return null;
  return one(
    `SELECT c.id, c.email, c.name, c.status
       FROM auth_token t JOIN customer c ON c.id = t.customer_id
      WHERE t.token_hash = $1 AND t.expires_at > now() AND c.status = 'active'`,
    [sha256(token)],
  );
}

export function bearerFrom(c) {
  const h = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

/** Attach the customer if a valid token is present; never throws. */
export async function optionalAuth(c, next) {
  const token = bearerFrom(c);
  c.set('customer', token ? await customerForToken(token) : null);
  await next();
}

/** Server-side authorization for every account route. Hiding a button is not authorization. */
export async function requireAuth(c, next) {
  const token = bearerFrom(c);
  const customer = token ? await customerForToken(token) : null;
  if (!customer) throw unauthorized('Your session has expired. Sign in again.');
  c.set('customer', customer);
  await next();
}

export async function revokeToken(token) {
  if (!token) return;
  await query('DELETE FROM auth_token WHERE token_hash = $1', [sha256(token)]);
}
