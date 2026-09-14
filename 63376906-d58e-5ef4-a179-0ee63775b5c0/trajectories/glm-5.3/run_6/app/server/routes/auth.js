import { passwordGrant, sessionFromDb, HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';

export async function register({ app, pool }) {
  app.post('/api/auth/login', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.email || !body.password) throw new HttpError(400, 'email_and_password_required');
    const t = await passwordGrant(body.email, body.password);
    await withTx(pool, async (client) => {
      await record(client, { kind: 'sign_in', object_ref: body.email, actor: body.email, content: { at: new Date().toISOString() } });
    });
    return c.json({ access_token: t.access_token, token_type: t.token_type || 'Bearer', expires_in: t.expires_in });
  });

  app.get('/api/auth/me', (c) => {
    const s = c.get('session');
    if (!s) throw new HttpError(401, 'session_required');
    return c.json({ email: s.email, name: s.name, roles: s.roles, sites: s.sites });
  });
}
