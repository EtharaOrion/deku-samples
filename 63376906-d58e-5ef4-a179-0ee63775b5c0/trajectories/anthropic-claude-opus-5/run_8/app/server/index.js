import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate, waitForDatabase } from './db.js';
import { seedIfEmpty } from './seed.js';
import { Refusal, refuse, requireSession, sessionFrom } from './http.js';
import { issueAppToken, keycloakPassword, sessionFromIdentity, SESSION_HOURS } from './auth.js';

import publicRoutes from './routes/public.js';
import operationsRoutes from './routes/operations.js';
import lotsRoutes from './routes/lots.js';
import ledgerRoutes from './routes/ledger.js';
import certificateRoutes from './routes/certificates.js';
import recordRoutes from './routes/record.js';
import miscRoutes from './routes/misc.js';

const here = dirname(fileURLToPath(import.meta.url));
const clientDir = join(here, '..', 'dist');

const app = new Hono();
const api = new Hono();

let ready = false;

api.use('*', async (c, next) => {
  c.set('session', await sessionFrom(c));
  await next();
});

api.get('/health', (c) => (ready ? c.json({ status: 'ok', ready: true }) : c.json({ status: 'starting', ready: false }, 503)));

api.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.email || !body.password) {
    refuse(400, 'credentials_required', { message: 'Sign in with an email and a password.' });
  }
  const identity = await keycloakPassword(body.email, body.password);
  if (!identity) {
    refuse(401, 'sign_in_failed', { message: 'That email and password were not accepted.' });
  }
  const session = await sessionFromIdentity(identity);
  // The app returns its own token; it never accepts an identity a caller asserts.
  const access_token = await issueAppToken(session);
  return c.json({
    access_token,
    token_type: 'Bearer',
    expires_in: SESSION_HOURS * 3600,
    email: session.email,
    name: session.name,
    roles: session.roles,
    sites: session.sites,
  });
});

api.get('/auth/me', async (c) => {
  const s = requireSession(c);
  return c.json({
    email: s.email,
    name: s.name,
    roles: s.roles,
    sites: s.sites,
    grant_ends_on: s.grant_ends_on,
  });
});

api.route('/', publicRoutes);
api.route('/', operationsRoutes);
api.route('/', lotsRoutes);
api.route('/', ledgerRoutes);
api.route('/', certificateRoutes);
api.route('/', recordRoutes);
api.route('/', miscRoutes);

api.onError((err, c) => {
  if (err instanceof Refusal) return c.json(err.body, err.status);
  if (err.status && err.body) return c.json(err.body, err.status);
  console.error('[api]', err);
  return c.json({ error: 'internal_error', message: 'The request could not be completed.' }, 500);
});

api.notFound((c) => c.json({ error: 'not_found', message: 'No such route.', path: c.req.path }, 404));

app.route('/api', api);

// Fingerprinted assets are immutable; the shell is not.
app.use('/assets/*', serveStatic({
  root: './dist',
  onFound: (_p, c) => c.header('cache-control', 'public, max-age=31536000, immutable'),
}));
app.use('/fonts/*', serveStatic({
  root: './dist',
  onFound: (_p, c) => c.header('cache-control', 'public, max-age=31536000, immutable'),
}));
app.use('/*', serveStatic({ root: './dist' }));

// The client is a single-page application: every other route resolves to it.
app.get('*', async (c) => {
  try {
    const html = await readFile(join(clientDir, 'index.html'), 'utf8');
    return c.html(html);
  } catch {
    return c.text('The client build is missing.', 500);
  }
});

const port = 4173;

async function start() {
  await waitForDatabase();
  await migrate();
  await seedIfEmpty();
  await stat(join(clientDir, 'index.html')).catch(() => {
    console.warn('[app] dist/index.html is missing; the API will serve without a client.');
  });
  ready = true;
  console.log(`[app] listening on 0.0.0.0:${port}`);
}

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
start().catch((e) => {
  console.error('[app] failed to start', e);
  process.exit(1);
});
