// App-implemented auth: email and password exchanged for a bearer token,
// passwords hashed with bcrypt, tokens expiring.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { q } from './db.js';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain, hash) {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function newToken() {
  const raw = crypto.randomBytes(32).toString('base64url');
  const hash = hashToken(raw);
  return { raw, hash };
}

export function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function createTokenFor(customerId) {
  const { raw, hash } = newToken();
  await q(
    `INSERT INTO auth_token (token_hash, customer_id, expires_at)
     VALUES ($1, $2, now() + interval '${TOKEN_TTL_MS} milliseconds')`,
    [hash, customerId]
  );
  return raw;
}

export async function customerForToken(raw) {
  raw = await raw;
  if (!raw) return { expired: false, customer: null };
  const hash = hashToken(raw);
  const rows = await q(
    `SELECT c.id, c.email, c.name, c.status, c.created_at, t.expires_at
       FROM auth_token t
       JOIN customer c ON c.id = t.customer_id
      WHERE t.token_hash = $1`,
    [hash]
  );
  if (!rows.length) return { expired: false, customer: null };
  const row = rows[0];
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { expired: true, customer: null };
  }
  return { expired: false, customer: row };
}

export async function bearerFromRequest(req) {
  const h = req.headers.get('authorization') || '';
  if (!h.toLowerCase().startsWith('bearer ')) return null;
  return h.slice(7).trim();
}

export function publicCustomer(c) {
  return { id: c.id, email: c.email, name: c.name, status: c.status, created_at: c.created_at };
}
