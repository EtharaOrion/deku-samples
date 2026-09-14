import type { Context } from 'hono';
import {
  authenticate, createCustomer, customerByEmail, customerForToken, issueToken, bearerFrom, lastSeenReleaseBuild,
} from '../auth.ts';
import { hashPassword, sha256Hex } from '../crypto.ts';
import { q } from '../db/pool.ts';
import { clientError, ApiEnv } from './util.ts';
import type { Hono } from 'hono';

export async function requireCustomer(c: Context): Promise<any | null> {
  const token = bearerFrom(c.req.header('authorization'));
  const customer = await customerForToken(token);
  return customer;
}

export function customerView(customer: any) {
  return { id: String(customer.id), email: customer.email, name: customer.name, status: customer.status, created_at: new Date(customer.created_at).toISOString() };
}

export function registerAuthRoutes(app: Hono<ApiEnv>) {
  app.post('/api/auth/signup', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const name = String(body.name || '').trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return clientError(c, 400, 'invalid_email', 'That email address does not look right.');
    if (password.length < 8) return clientError(c, 400, 'weak_password', 'A password needs at least eight characters.');
    if (!name) return clientError(c, 400, 'missing_name', 'Name is required.');
    const existing = await customerByEmail(email);
    if (existing) return clientError(c, 409, 'email_taken', 'That email address is already registered.');
    const passwordHash = await hashPassword(password);
    const customer = await createCustomer({ email, password, name, passwordHash });
    const token = await issueToken(customer.id);
    return c.json({ access_token: token.token, customer: customerView(customer) }, 201);
  });

  app.post('/api/auth/login', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const customer = await authenticate(email, password);
    if (!customer) return clientError(c, 401, 'invalid_credentials', 'That did not work. Check the email and the password.');
    const token = await issueToken(customer.id);
    return c.json({ access_token: token.token, customer: customerView(customer) });
  });

  app.get('/api/auth/me', async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, 'unauthorized', 'You need to sign in first.');
    return c.json({ customer: customerView(customer), last_seen_release_build: await lastSeenReleaseBuild(customer.id) });
  });

  app.post('/api/auth/logout', async (c) => {
    const token = bearerFrom(c.req.header('authorization'));
    if (token) {
      await q(`DELETE FROM auth_token WHERE token_hash = $1`, [sha256Hex(token)]);
    }
    return c.json({ ok: true });
  });
}
