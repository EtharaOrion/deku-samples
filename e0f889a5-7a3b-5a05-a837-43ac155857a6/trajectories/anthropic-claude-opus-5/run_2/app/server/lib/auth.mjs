import crypto from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { query } from './db.mjs';

const TOKEN_TTL_HOURS = Number(process.env.AUTH_TOKEN_TTL_HOURS || 24);

/** Passwords are stored with argon2id, a modern password hash. */
export async function hashPassword(plain) {
  return argonHash(plain, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hashValue, plain) {
  try {
    return await argonVerify(hashValue, plain);
  } catch {
    return false;
  }
}

const digest = (token) => crypto.createHash('sha256').update(token).digest('hex');

export async function issueToken(customerId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600 * 1000);
  await query(
    'INSERT INTO auth_token (customer_id, token_hash, expires_at) VALUES ($1,$2,$3)',
    [customerId, digest(token), expiresAt],
  );
  return { access_token: token, expires_at: expiresAt.toISOString() };
}

/** An expired or absent token is rejected and mutates nothing. */
export async function customerForToken(token) {
  if (!token) return null;
  const { rows } = await query(
    `SELECT c.id, c.email, c.name, c.status
       FROM auth_token t JOIN customer c ON c.id = t.customer_id
      WHERE t.token_hash = $1 AND t.expires_at > now()`,
    [digest(token)],
  );
  const row = rows[0];
  if (!row || row.status !== 'active') return null;
  return row;
}

export async function revokeToken(token) {
  if (!token) return;
  await query('DELETE FROM auth_token WHERE token_hash = $1', [digest(token)]);
}

export function bearerFrom(c) {
  const header = c.req.header('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match) return match[1].trim();
  // The browser surfaces carry the same token in a cookie so server-rendered
  // account routes can be authorised on first paint.
  const cookie = c.req.header('cookie') || '';
  const found = /(?:^|;\s*)vela_session=([^;]+)/.exec(cookie);
  return found ? decodeURIComponent(found[1]) : null;
}

export const hashToken = digest;
