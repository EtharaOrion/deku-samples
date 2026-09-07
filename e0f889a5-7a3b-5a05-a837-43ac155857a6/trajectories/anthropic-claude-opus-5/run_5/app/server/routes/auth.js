import { Hono } from 'hono';
import { one } from '../lib/db.js';
import { hashPassword, verifyPassword, issueToken, requireCustomer, bearerFrom, customerForToken, sha256 } from '../lib/auth.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { isUniqueViolation } from '../lib/db.js';

const routes = new Hono();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readCredentials(body) {
  const email = String(body?.email ?? '').trim();
  const password = String(body?.password ?? '');
  if (!email) throw badRequest('email_required', 'Email is required.');
  if (!EMAIL_RE.test(email)) throw badRequest('invalid_email', 'That did not work. Check the email address.');
  if (!password) throw badRequest('password_required', 'Password is required.');
  return { email, password };
}

routes.post('/signup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = readCredentials(body);
  const name = String(body?.name ?? '').trim();
  if (!name) throw badRequest('name_required', 'Name is required.');
  if (password.length < 8) {
    throw badRequest('password_too_short', 'Use a password of at least eight characters.');
  }

  let customer;
  try {
    customer = await one(
      `INSERT INTO customer (email, name, password_hash) VALUES ($1,$2,$3)
       RETURNING id, email, name`,
      [email, name, await hashPassword(password)],
    );
  } catch (err) {
    // Signup refuses a registered address.
    if (isUniqueViolation(err)) {
      throw conflict('email_taken', 'That address already has an account. Sign in instead.');
    }
    throw err;
  }

  const { token, expiresAt } = await issueToken(customer.id);
  setSessionCookie(c, token, expiresAt);
  return c.json({
    access_token: token,
    expires_at: expiresAt.toISOString(),
    customer: { id: Number(customer.id), email: customer.email, name: customer.name },
  }, 201);
});

routes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = readCredentials(body);

  const row = await one(
    `SELECT id, email, name, password_hash, status FROM customer WHERE lower(email) = lower($1)`,
    [email],
  );
  const ok = row && row.status === 'active' && (await verifyPassword(password, row.password_hash));
  if (!ok) throw unauthorized('That email and password do not match.', 'invalid_credentials');

  const { token, expiresAt } = await issueToken(row.id);
  setSessionCookie(c, token, expiresAt);
  return c.json({
    access_token: token,
    expires_at: expiresAt.toISOString(),
    customer: { id: Number(row.id), email: row.email, name: row.name },
  });
});

routes.get('/me', requireCustomer, (c) => {
  const customer = c.get('customer');
  return c.json({ customer: { id: Number(customer.id), email: customer.email, name: customer.name } });
});

routes.post('/logout', async (c) => {
  const token = bearerFrom(c);
  if (token) {
    await one(`DELETE FROM auth_token WHERE token_hash = $1 RETURNING id`, [sha256(token)]).catch(() => null);
  }
  c.header('Set-Cookie', `vela_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return c.json({ ok: true });
});

function setSessionCookie(c, token, expiresAt) {
  const parts = [
    `vela_token=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ];
  c.header('Set-Cookie', parts.join('; '));
}

export default routes;
