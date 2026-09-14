import bcrypt from 'bcryptjs';
import { q, one } from './db.js';
import { sha256, randomToken, ApiError } from './util.js';

const TOKEN_TTL_HOURS = 24 * 7;

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

export async function issueToken(customerId) {
  const token = randomToken(32);
  await q(`INSERT INTO auth_token (customer_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '${TOKEN_TTL_HOURS} hours')`,
    [customerId, sha256(token)]);
  return token;
}

export async function customerFromToken(token, { required = true } = {}) {
  if (!token) {
    if (required) throw new ApiError(401, 'unauthorized', 'Sign in to continue.');
    return null;
  }
  const row = await one(
    `SELECT c.id, c.email, c.name, c.status, t.expires_at
       FROM auth_token t JOIN customer c ON c.id = t.customer_id
      WHERE t.token_hash = $1`, [sha256(token)]);
  if (!row) {
    if (required) throw new ApiError(401, 'unauthorized', 'Sign in to continue.');
    return null;
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await q(`DELETE FROM auth_token WHERE token_hash = $1`, [sha256(token)]);
    if (required) throw new ApiError(401, 'token_expired', 'Your session has ended. Sign in again.');
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, status: row.status };
}

export async function loginCustomer(email, password) {
  const row = await one(`SELECT id, email, name, status, password_hash FROM customer WHERE lower(email) = lower($1)`, [email || '']);
  if (!row) return null;
  const ok = await verifyPassword(password || '', row.password_hash);
  if (!ok) return null;
  return { id: row.id, email: row.email, name: row.name, status: row.status };
}
