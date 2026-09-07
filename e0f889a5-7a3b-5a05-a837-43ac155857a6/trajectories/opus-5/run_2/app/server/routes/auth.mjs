import { Hono } from 'hono';
import { query } from '../lib/db.mjs';
import { hashPassword, verifyPassword, issueToken, revokeToken, bearerFrom, customerForToken } from '../lib/auth.mjs';
import { badRequest, conflict, unauthorized } from '../lib/errors.mjs';

const app = new Hono();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicCustomer = (c) => ({ id: c.id, email: c.email, name: c.name });

app.post('/signup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || '').trim();
  const password = String(body.password || '');
  const name = String(body.name || '').trim();

  if (!email) throw badRequest('email_required', 'Email is required.');
  if (!EMAIL_RE.test(email)) throw badRequest('email_invalid', 'That did not work. Enter an email address.');
  if (!name) throw badRequest('name_required', 'Name is required.');
  if (password.length < 8) throw badRequest('password_too_short', 'Password is required, and must be at least 8 characters.');

  const existing = await query('SELECT id FROM customer WHERE lower(email) = lower($1)', [email]);
  if (existing.rowCount > 0) {
    throw conflict('email_taken', 'That address already has an account. Sign in instead.', { resource: 'customer.email' });
  }

  const passwordHash = await hashPassword(password);
  let created;
  try {
    const { rows } = await query(
      'INSERT INTO customer (email, name, password_hash, status) VALUES ($1,$2,$3,\'active\') RETURNING id, email, name',
      [email, name, passwordHash],
    );
    created = rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw conflict('email_taken', 'That address already has an account. Sign in instead.', { resource: 'customer.email' });
    }
    throw err;
  }

  const token = await issueToken(created.id);
  return c.json({ ...token, customer: publicCustomer(created) }, 201);
});

app.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || '').trim();
  const password = String(body.password || '');
  if (!email || !password) throw badRequest('credentials_required', 'Email and password are required.');

  const { rows } = await query(
    'SELECT id, email, name, password_hash, status FROM customer WHERE lower(email) = lower($1)',
    [email],
  );
  const found = rows[0];
  const ok = found ? await verifyPassword(found.password_hash, password) : false;
  if (!found || !ok || found.status !== 'active') {
    throw unauthorized('That did not work. Check the address and the password.');
  }

  const token = await issueToken(found.id);
  return c.json({ ...token, customer: publicCustomer(found) });
});

app.get('/me', async (c) => {
  const customer = await customerForToken(bearerFrom(c));
  if (!customer) throw unauthorized('Sign in to continue.');
  return c.json({ customer: publicCustomer(customer) });
});

app.post('/logout', async (c) => {
  await revokeToken(bearerFrom(c));
  return c.json({ ok: true });
});

export default app;
