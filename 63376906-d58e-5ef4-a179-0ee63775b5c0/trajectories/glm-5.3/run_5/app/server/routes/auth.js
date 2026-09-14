import { Hono } from 'hono';
import { exchangePassword, currentSession, unauthorized } from '../lib/auth.js';

const r = new Hono();

r.post('/login', async (c) => {
  const db = c.get('db');
  const body = await c.req.json().catch(() => ({}));
  if (!body.email || !body.password) {
    return c.json({ error: 'invalid_request', message: 'email and password are required' }, 400);
  }
  const result = await exchangePassword(db, body.email, body.password);
  if (!result) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  return c.json(result, 200);
});

r.get('/me', async (c) => {
  const s = await currentSession(c);
  if (!s) return unauthorized();
  return c.json({ email: s.email, name: s.name, roles: s.roles, sites: s.sites });
});

export default r;
