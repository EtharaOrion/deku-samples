import { Hono } from 'hono';
import { q, one, exec } from '../db.js';
import { bad, forbidden, reqField, rememberIdempotency } from '../lib/http.js';
import { keycloakLogin } from '../auth.js';
import { randomUUID } from 'node:crypto';
import { entryTop } from '../record.js';

const r = new Hono();

// Sign-in exchanges the email and password at keycloak and returns the app's own token.
r.post('/api/auth/login', async (c) => {
  const b = await c.req.json();
  const email = String(reqField(b.email, 'email')).toLowerCase();
  const password = reqField(b.password, 'password');
  const kc = await keycloakLogin(email, password);
  if (!kc) throw bad('invalid_credentials');
  const session = await one('SELECT email, name, role, sites, grant_ends_on FROM users WHERE email = $1', [email]);
  if (!session) throw forbidden('no_account', { note: 'signup is closed; the seven seeded accounts are the only accounts' });
  if (new Date(session.grant_ends_on) < new Date(new Date().toISOString().slice(0, 10))) {
    throw forbidden('grant_expired', { grant_ends_on: session.grant_ends_on });
  }
  const token = randomUUID() + '.' + randomUUID();
  await exec(`INSERT INTO sessions (token, email, issued_at, expires_at) VALUES ($1,$2,now(), now() + interval '12 hours')`, [token, email]);
  await entryTop({ person: email, site: null, object: null, act: 'session_issued', content: { email, hours: 12 } });
  await rememberIdempotency(c, 200, {});
  return c.json({ access_token: token, token_type: 'Bearer', expires_in: 43200, email });
});

r.post('/api/auth/logout', async (c) => {
  const h = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (m) await exec('DELETE FROM sessions WHERE token = $1', [m[1].trim()]);
  await rememberIdempotency(c, 200, {});
  return c.json({ logged_out: true });
});

r.get('/api/auth/me', async (c) => {
  const h = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return c.json({ error: 'authentication_required' }, 401);
  const s = await one(`SELECT u.email, u.name, u.role, u.sites, s.expires_at FROM sessions s JOIN users u ON u.email=s.email WHERE s.token=$1`, [m[1].trim()]);
  if (!s || new Date(s.expires_at) < new Date()) return c.json({ error: 'authentication_required' }, 401);
  return c.json({ email: s.email, name: s.name, roles: [s.role], sites: s.sites, grant_ends_on: s.expires_at });
});

export default r;
