import { Hono } from 'hono';
import { one, query } from '../lib/db.mjs';
import { hashPassword, verifyPassword, issueToken, requireAuth, bearerFrom, revokeToken } from '../lib/auth.mjs';
import { badRequest, conflict, unauthorized } from '../lib/errors.mjs';

const app = new Hono();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function body(c) {
  try { return (await c.req.json()) || {}; } catch { return {}; }
}

app.post('/signup', async (c) => {
  const { email, password, name } = await body(c);
  if (!email || !EMAIL_RE.test(String(email))) throw badRequest('email_required', 'Email is required.');
  if (!password || String(password).length < 8) {
    throw badRequest('password_too_short', 'Password must be at least 8 characters.');
  }
  if (!name || !String(name).trim()) throw badRequest('name_required', 'Name is required.');

  const existing = await one('SELECT id FROM customer WHERE lower(email) = lower($1)', [email]);
  // Signup refuses a registered address.
  if (existing) throw conflict('email_taken', 'That email address already has an account.', { resource: String(email).toLowerCase() });

  let customer;
  try {
    customer = await one(
      `INSERT INTO customer (email, name, password_hash, status) VALUES ($1,$2,$3,'active')
       RETURNING id, email, name`,
      [String(email).trim(), String(name).trim(), hashPassword(String(password))],
    );
  } catch (err) {
    if (err && err.code === '23505') {
      throw conflict('email_taken', 'That email address already has an account.', { resource: String(email).toLowerCase() });
    }
    throw err;
  }

  const { token, expiresAt } = await issueToken(customer.id);
  return c.json({
    access_token: token,
    expires_at: expiresAt.toISOString(),
    customer: { id: Number(customer.id), email: customer.email, name: customer.name },
  }, 201);
});

app.post('/login', async (c) => {
  const { email, password } = await body(c);
  if (!email || !password) throw badRequest('credentials_required', 'Email and password are required.');

  const customer = await one(
    `SELECT id, email, name, password_hash, status FROM customer WHERE lower(email) = lower($1)`,
    [String(email)],
  );
  // The same refusal whether the address is unknown or the password is wrong.
  if (!customer || customer.status !== 'active' || !verifyPassword(String(password), customer.password_hash)) {
    throw unauthorized('That email and password do not match.');
  }

  const { token, expiresAt } = await issueToken(customer.id);
  return c.json({
    access_token: token,
    expires_at: expiresAt.toISOString(),
    customer: { id: Number(customer.id), email: customer.email, name: customer.name },
  });
});

app.get('/me', requireAuth, (c) => {
  const customer = c.get('customer');
  return c.json({ customer: { id: Number(customer.id), email: customer.email, name: customer.name } });
});

app.post('/logout', async (c) => {
  await revokeToken(bearerFrom(c));
  return c.json({ ok: true });
});

export default app;
