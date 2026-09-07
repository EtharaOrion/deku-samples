import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { one, query } from './db.js';
import { unauthorized, badRequest, conflict } from './errors.js';

const TOKEN_TTL_MS = Number(process.env.AUTH_TOKEN_TTL_MS || 1000 * 60 * 60 * 12);

export async function hashPassword(plain) {
  return argonHash(plain);
}

export async function verifyPassword(hash, plain) {
  try {
    return await argonVerify(hash, plain);
  } catch {
    return false;
  }
}

export function opaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

export function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function issueToken(customerId) {
  const token = opaqueToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await query('INSERT INTO auth_token (customer_id, token_hash, expires_at) VALUES ($1,$2,$3)', [
    customerId, sha256(token), expiresAt,
  ]);
  return { token, expiresAt };
}

export async function customerFromToken(token) {
  if (!token) return null;
  const row = await one(
    `SELECT c.id, c.email, c.name, c.status, t.expires_at
       FROM auth_token t JOIN customer c ON c.id = t.customer_id
      WHERE t.token_hash = $1`,
    [sha256(token)]
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  if (row.status !== 'active') return null;
  return { id: row.id, email: row.email, name: row.name };
}

export function bearerFrom(headerValue) {
  if (!headerValue) return null;
  const m = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return m ? m[1].trim() : null;
}

const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

export function normaliseEmail(raw) {
  const e = String(raw ?? '').trim().toLowerCase();
  if (!e) throw badRequest('email_required', 'Email is required.');
  if (e.length > 254 || !EMAIL_RE.test(e)) throw badRequest('email_invalid', 'That did not work. Check the email address.');
  return e;
}

export async function signup({ email, password, name }) {
  const e = normaliseEmail(email);
  const pw = String(password ?? '');
  if (pw.length < 8) throw badRequest('password_too_short', 'Password must be at least 8 characters.');
  const n = String(name ?? '').trim();
  if (!n) throw badRequest('name_required', 'Name is required.');
  const existing = await one('SELECT id FROM customer WHERE lower(email) = $1', [e]);
  if (existing) throw conflict('email_taken', 'That address already has an account. Sign in instead.', { resource: 'customer' });
  let row;
  try {
    row = await one(
      'INSERT INTO customer (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id, email, name',
      [e, n, await hashPassword(pw)]
    );
  } catch (err) {
    if (err && err.code === '23505') {
      throw conflict('email_taken', 'That address already has an account. Sign in instead.', { resource: 'customer' });
    }
    throw err;
  }
  const { token } = await issueToken(row.id);
  return { access_token: token, customer: { id: String(row.id), email: row.email, name: row.name } };
}

export async function login({ email, password }) {
  const e = String(email ?? '').trim().toLowerCase();
  const pw = String(password ?? '');
  const row = await one('SELECT id, email, name, password_hash, status FROM customer WHERE lower(email) = $1', [e]);
  if (!row || row.status !== 'active' || !(await verifyPassword(row.password_hash, pw))) {
    throw unauthorized('That email and password do not match an account.');
  }
  const { token } = await issueToken(row.id);
  return { access_token: token, customer: { id: String(row.id), email: row.email, name: row.name } };
}

export async function revokeToken(token) {
  if (!token) return;
  await query('DELETE FROM auth_token WHERE token_hash = $1', [sha256(token)]);
}
