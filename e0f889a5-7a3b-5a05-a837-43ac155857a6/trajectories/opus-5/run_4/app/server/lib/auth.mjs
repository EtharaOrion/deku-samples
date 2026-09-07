import { query } from './db.mjs';
import { hashPassword, verifyPassword } from './password.mjs';
import { hashToken, newOpaqueToken, TOKEN_TTL_HOURS } from './tokens.mjs';
import { badRequest, conflict, unauthorized } from './errors.mjs';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function publicCustomer(row) {
  return { id: String(row.id), email: row.email, name: row.name };
}

async function issueToken(customerId) {
  const token = newOpaqueToken(32);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600 * 1000);
  await query(
    `INSERT INTO auth_token (customer_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
    [customerId, hashToken(token), expiresAt]);
  return { token, expiresAt };
}

export async function signup({ email, password, name }) {
  const address = String(email || '').trim();
  if (!EMAIL_RE.test(address)) throw badRequest('email_invalid', 'That did not work. Check the email address.');
  if (String(password || '').length < 8) {
    throw badRequest('password_too_short', 'A password needs at least eight characters.');
  }
  const person = String(name || '').trim();
  if (!person) throw badRequest('name_required', 'Name is required.');

  const passwordHash = await hashPassword(String(password));
  let rows;
  try {
    ({ rows } = await query(
      `INSERT INTO customer (email, name, password_hash, status) VALUES ($1,$2,$3,'active') RETURNING *`,
      [address, person, passwordHash]));
  } catch (err) {
    // Signup refuses a registered address; uniqueness is the store's rule.
    if (err && err.code === '23505') {
      throw conflict('email_taken', 'That address already has an account. Sign in instead.');
    }
    throw err;
  }
  const { token, expiresAt } = await issueToken(rows[0].id);
  return { access_token: token, expires_at: expiresAt.toISOString(), customer: publicCustomer(rows[0]) };
}

export async function login({ email, password }) {
  const address = String(email || '').trim();
  const { rows } = await query(`SELECT * FROM customer WHERE lower(email) = lower($1)`, [address]);
  const row = rows[0];
  // The same refusal either way, so this never reports who has an account.
  const ok = row ? await verifyPassword(String(password || ''), row.password_hash) : false;
  if (!row || !ok || row.status !== 'active') {
    throw unauthorized('That email and password do not match an account.', 'invalid_credentials');
  }
  const { token, expiresAt } = await issueToken(row.id);
  return { access_token: token, expires_at: expiresAt.toISOString(), customer: publicCustomer(row) };
}

/** An expired or absent token is rejected and mutates nothing. */
export async function customerForToken(token) {
  if (!token) return null;
  const { rows } = await query(
    `SELECT c.* FROM auth_token t JOIN customer c ON c.id = t.customer_id
      WHERE t.token_hash = $1 AND t.expires_at > now() AND c.status = 'active'`,
    [hashToken(token)]);
  return rows[0] || null;
}

export async function signOut(token) {
  if (!token) return;
  await query(`DELETE FROM auth_token WHERE token_hash = $1`, [hashToken(token)]);
}

export { publicCustomer };
