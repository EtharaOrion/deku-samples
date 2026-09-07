import { one, query } from '../db.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { hashPassword, randomToken, sha256hex, verifyPassword } from '../lib/crypto.js';

const TOKEN_TTL_HOURS = Number(process.env.AUTH_TOKEN_TTL_HOURS || 72);

const shape = (row) => ({ id: Number(row.id), email: row.email, name: row.name, status: row.status });

async function issueToken(customerId) {
  const token = randomToken(32);
  const row = await one(
    `INSERT INTO auth_token (customer_id, token_hash, expires_at)
     VALUES ($1,$2, now() + ($3 || ' hours')::interval)
     RETURNING expires_at`,
    [customerId, sha256hex(token), String(TOKEN_TTL_HOURS)],
  );
  return { access_token: token, expires_at: row.expires_at.toISOString() };
}

export async function signup({ email, password, name }) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) throw badRequest('email_required', 'Email is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw badRequest('email_invalid', 'That did not work. Check the email address.');
  const pw = String(password || '');
  if (pw.length < 8) throw badRequest('password_too_short', 'A password of at least eight characters is required.');
  const who = String(name || '').trim();
  if (!who) throw badRequest('name_required', 'Name is required.');

  const existing = await one('SELECT id FROM customer WHERE lower(email) = $1', [value]);
  // Signup refuses a registered address.
  if (existing) throw conflict('email_taken', 'That address already has an account. Sign in instead.', { email: value });

  const hash = await hashPassword(pw);
  let row;
  try {
    row = await one(
      `INSERT INTO customer (email, name, password_hash, status) VALUES ($1,$2,$3,'active') RETURNING *`,
      [value, who, hash],
    );
  } catch (err) {
    if (err && err.code === '23505') throw conflict('email_taken', 'That address already has an account. Sign in instead.', { email: value });
    throw err;
  }
  const token = await issueToken(row.id);
  return { ...token, customer: shape(row) };
}

export async function login({ email, password }) {
  const value = String(email || '').trim().toLowerCase();
  const row = await one('SELECT * FROM customer WHERE lower(email) = $1', [value]);
  const ok = row ? await verifyPassword(String(password || ''), row.password_hash) : false;
  if (!row || !ok || row.status !== 'active') {
    throw unauthorized('That email and password do not match an account.', 'invalid_credentials');
  }
  const token = await issueToken(row.id);
  return { ...token, customer: shape(row) };
}

// An expired or absent token is rejected and mutates nothing.
export async function customerForToken(token) {
  if (!token) return null;
  const row = await one(
    `SELECT c.* FROM auth_token t JOIN customer c ON c.id = t.customer_id
     WHERE t.token_hash = $1 AND t.expires_at > now() AND c.status = 'active'`,
    [sha256hex(token)],
  );
  return row ? shape(row) : null;
}

export async function signOut(token) {
  if (!token) return;
  await query('DELETE FROM auth_token WHERE token_hash = $1', [sha256hex(token)]);
}

export async function purgeExpiredTokens() {
  await query('DELETE FROM auth_token WHERE expires_at < now() - interval \'7 days\'').catch(() => {});
}
