// Sign-in exchanges the email and password at keycloak and returns the app's own token.
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { db } from '../dbindex.ts';
import { requireSession, readJson, requireFields, rateLimit } from '../middleware.js';

export const authRoutes = new Hono();

const ISSUER = process.env.AUTH_ISSUER_URL || '';
const CLIENT_ID = process.env.AUTH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET || '';

type KcRole = { email: string; name: string; role: string; sites: string[] };

export async function tokenFromKeycloak(email: string, password: string): Promise<any> {
  const endpoint = ISSUER.replace(/\/$/, '') + '/protocol/openid-connect/token';
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username: email,
    password
  });
  const res = await fetch(endpoint, { method: 'POST', body });
  if (!res.ok) return null;
  return res.json();
}

authRoutes.post('/auth/login', async (c) => {
  const ok = await rateLimit(c, 'login:' + c.req.header('x-forwarded-for'), 30, 300);
  if (!ok) return c.json({ error: 'rate_limited', message: 'Too many sign-in attempts.' }, 429);
  const body = await readJson(c);
  requireFields(body, ['email', 'password']);
  const kc = await tokenFromKeycloak(body.email, body.password);
  if (!kc) return c.json({ error: 'invalid_credentials', message: 'The email and password were not accepted.' }, 401);

  const grant = (await db.query('SELECT * FROM grants WHERE email=$1', [body.email])).rows[0];
  if (!grant) return c.json({ error: 'no_grant', message: 'No grant stands for this account.' }, 403);

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 12 * 3600 * 1000);
  await db.query('INSERT INTO sessions (token,email,expires_at) VALUES ($1,$2,$3)', [token, body.email, expires.toISOString()]);
  return c.json({ access_token: token, token_type: 'Bearer', expires_at: expires.toISOString() });
});

authRoutes.post('/auth/logout', async (c) => {
  const s = await requireSession(c);
  const token = (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '');
  await db.query('DELETE FROM sessions WHERE token=$1', [token]);
  return c.json({ ok: true });
});

authRoutes.get('/auth/me', async (c) => {
  const s = await requireSession(c);
  return c.json({ email: s.email, name: s.name, roles: [s.role], sites: s.sites, grant_ends_on: s.ends_on });
});

// Re-authentication for a signing act: the password travels again.
export async function verifyPasswordAgain(email: string, password: string): Promise<boolean> {
  const kc = await tokenFromKeycloak(email, password);
  return !!kc;
}
