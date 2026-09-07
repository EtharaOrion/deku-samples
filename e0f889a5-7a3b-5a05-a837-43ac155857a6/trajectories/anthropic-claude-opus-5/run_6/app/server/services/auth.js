import { one, query } from '../db.js';
import { hashPassword, verifyPassword, randomToken, sha256 } from '../passwords.js';
import { badRequest, conflict, unauthorized } from '../errors.js';

const TOKEN_TTL_HOURS = Number(process.env.TOKEN_TTL_HOURS || 72);

export function publicCustomer(row) {
  if (!row) return null;
  return { id: String(row.id), email: row.email, name: row.name, status: row.status };
}

async function issueToken(customerId) {
  const token = randomToken(32);
  await query(
    `INSERT INTO auth_token (customer_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3 || ' hours')::interval)`,
    [customerId, sha256(token), String(TOKEN_TTL_HOURS)],
  );
  return token;
}

export async function signup({ email, password, name }) {
  const clean = String(email || '').trim();
  if (!clean || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw badRequest('invalid_email', 'Email is required.');
  if (!password || String(password).length < 8) {
    throw badRequest('invalid_password', 'Password must be at least 8 characters.');
  }
  if (!String(name || '').trim()) throw badRequest('invalid_name', 'Name is required.');

  const existing = await one('SELECT id FROM customer WHERE lower(email) = lower($1)', [clean]);
  if (existing) throw conflict('email_taken', 'That address already has an account. Sign in instead.');

  let row;
  try {
    row = await one(
      `INSERT INTO customer (email, name, password_hash, status) VALUES ($1, $2, $3, 'active')
       RETURNING id, email, name, status`,
      [clean, String(name).trim(), hashPassword(String(password))],
    );
  } catch (err) {
    if (err.code === '23505') throw conflict('email_taken', 'That address already has an account. Sign in instead.');
    throw err;
  }
  const token = await issueToken(row.id);
  return { access_token: token, customer: publicCustomer(row) };
}

export async function login({ email, password }) {
  const row = await one(
    'SELECT id, email, name, status, password_hash FROM customer WHERE lower(email) = lower($1)',
    [String(email || '').trim()],
  );
  if (!row || row.status !== 'active' || !verifyPassword(String(password || ''), row.password_hash)) {
    throw unauthorized('That email and password do not match.');
  }
  const token = await issueToken(row.id);
  return { access_token: token, customer: publicCustomer(row) };
}

export async function customerForToken(token) {
  if (!token) return null;
  const row = await one(
    `SELECT c.id, c.email, c.name, c.status
       FROM auth_token t JOIN customer c ON c.id = t.customer_id
      WHERE t.token_hash = $1 AND t.expires_at > now()`,
    [sha256(String(token))],
  );
  if (!row || row.status !== 'active') return null;
  return row;
}

export async function revokeToken(token) {
  if (!token) return;
  await query('DELETE FROM auth_token WHERE token_hash = $1', [sha256(String(token))]);
}
