import { Hono } from 'hono';
import { login, authenticate, ctxUser } from '../auth.js';
import { q } from '../db.js';
import { nowIso } from '../lib/util.js';

const auth = new Hono();

auth.post('/login', async (c) => {
  let body = {};
  try { body = await c.req.json(); } catch {}
  if (!body.email || !body.password) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  const session = await login(body.email, body.password);
  if (!session) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  return c.json({ access_token: session.access_token, token_type: session.token_type, expires_in: session.expires_in });
});

auth.get('/me', async (c) => {
  const token = ctxUser(c);
  const user = token ? await authenticate(token) : null;
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ email: user.email, name: user.name, roles: [user.role], sites: user.sites, grant_ends: user.grant_ends || null });
});

auth.post('/logout', async (c) => {
  const token = ctxUser(c);
  if (token) await q('DELETE FROM sessions WHERE jti = $1', [token]);
  return c.json({ ok: true });
});

export default auth;
