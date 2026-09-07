import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { waitForDb, rq1 } from './db/pool.js';
import { migrate, seed } from './db/seed.js';
import { attachSession, requireSession, Refusal, refuse } from './lib/http.js';
import { passwordGrant, issueToken, sessionFor } from './lib/auth.js';

import { publicRoutes } from './routes/public.js';
import { operations } from './routes/operations.js';
import { ledger } from './routes/ledger.js';
import { quality } from './routes/quality.js';
import { certificates } from './routes/certificates.js';
import { record } from './routes/record.js';
import { integrations } from './routes/integrations.js';
import { commercial } from './routes/commercial.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(here, '..', 'client', 'dist');

const app = new Hono();

let ready = false;

// GET /api/health returns 200 once the app is ready and needs no session.
app.get('/api/health', (c) => {
  if (!ready) return c.json({ status: 'starting' }, 503);
  return c.json({ status: 'ok', ready: true });
});

const api = new Hono();
api.use('*', attachSession);

api.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.email || !body.password) {
    throw refuse(400, 'missing_credentials', 'Sign in with an email address and a password.');
  }
  // Sign-in exchanges the email and password at keycloak. There is no signup,
  // no password reset and no self-service account creation.
  const kc = await passwordGrant(body.email, body.password);
  if (!kc) throw refuse(401, 'authentication_failed', 'That email address and password were not accepted.');
  const session = await sessionFor(kc.email, kc.roles);
  if (!session) throw refuse(403, 'no_grant', 'That account has no grant in this system.');
  if (session.grant_expired) {
    throw refuse(403, 'grant_ended',
      `That account's grant ended on ${session.grant_ends_on}. Nothing renews silently.`);
  }
  // The app returns its own access_token rather than passing keycloak's through.
  const token = issueToken({ email: session.email, roles: session.roles, sites: session.sites });
  return c.json({ ...token, email: session.email, name: session.name, roles: session.roles, sites: session.sites });
});

api.get('/auth/me', (c) => {
  const s = requireSession(c);
  return c.json({
    email: s.email, name: s.name, roles: s.roles, sites: s.sites,
    identifier: s.identifier, grant_ends_on: s.grant_ends_on
  });
});

api.route('/', publicRoutes);
api.route('/', operations);
api.route('/', ledger);
api.route('/', quality);
api.route('/', certificates);
api.route('/', record);
api.route('/', integrations);
api.route('/', commercial);

// A refusal is an ordinary answer with a shape the client renders as an inline
// banner naming what was refused and what would change it.
api.onError((err, c) => {
  if (err instanceof Refusal) return c.json(err.body, err.status);
  if (err && err.status && err.body) return c.json(err.body, err.status);
  if (err?.code === '23505') {
    return c.json({ error: 'already_exists', detail: 'That record already exists under this reference.' }, 409);
  }
  if (err?.code === '23514' || String(err?.message || '').includes('append_only')) {
    return c.json({ error: 'immutable', detail: String(err.message || 'This record is immutable.') }, 409);
  }
  console.error('[api]', c.req.method, c.req.path, err);
  return c.json({ error: 'internal_error', detail: 'The request could not be completed.' }, 500);
});

api.notFound((c) => c.json({ error: 'no_such_route', detail: `No API route answers ${c.req.method} ${c.req.path}.` }, 404));

app.route('/api', api);

// ------------------------------------------------------- the built client

const INDEX_PATH = path.join(clientDist, 'index.html');
let indexHtml = null;
function readIndex() {
  if (indexHtml === null) {
    indexHtml = fs.existsSync(INDEX_PATH) ? fs.readFileSync(INDEX_PATH, 'utf8')
      : '<!doctype html><title>Ravel</title><p>The client build is missing.</p>';
  }
  return indexHtml;
}

app.use('/assets/*', serveStatic({
  root: path.relative(process.cwd(), clientDist) || '.',
  onFound: (_p, c) => {
    // Hashed asset filenames, so a long cache is safe.
    c.header('cache-control', 'public, max-age=31536000, immutable');
  }
}));
app.use('/fonts/*', serveStatic({
  root: path.relative(process.cwd(), clientDist) || '.',
  onFound: (_p, c) => c.header('cache-control', 'public, max-age=31536000, immutable')
}));
app.get('/favicon.svg', serveStatic({ path: path.relative(process.cwd(), path.join(clientDist, 'favicon.svg')) }));
app.get('/robots.txt', (c) => {
  // /verify/{number} is excluded from indexing because a certificate's
  // recipient is a customer relationship.
  return c.text('User-agent: *\nDisallow: /verify/\nDisallow: /console/\nDisallow: /login\nAllow: /\n');
});

// The single-page application answers every other route.
app.get('*', (c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'no_such_route', detail: `No API route answers ${c.req.path}.` }, 404);
  }
  return c.html(readIndex());
});

const port = 4173; // the container-internal port named in the deployment contract

async function start() {
  await waitForDb();
  await migrate();
  const s = await seed();
  console.log(`[ravel] database ready, seeded: ${s.seeded}`);
  ready = true;
}

// Bind 0.0.0.0, never loopback: a loopback-only listener is unreachable from
// outside the container.
const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[ravel] listening on 0.0.0.0:${info.port}`);
});

start().catch((e) => {
  console.error('[ravel] failed to start', e);
  process.exit(1);
});

// Node runs as PID 1 in the container, so it handles the stop signals itself:
// in-flight requests finish and the pools close rather than being cut off.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[ravel] ${signal} received, closing`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  });
}

process.on('unhandledRejection', (e) => console.error('[ravel] unhandled rejection', e));
