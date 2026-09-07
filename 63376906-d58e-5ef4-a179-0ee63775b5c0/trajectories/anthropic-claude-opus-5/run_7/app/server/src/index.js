import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate, waitForDatabase, q, one, pool } from './db.js';
import { seed } from './seed.js';
import { verifyPassword, issueSession, readSession, SESSION_SECONDS } from './auth.js';
import { append } from './record.js';
import { requireSession, refusePagination } from './http.js';
import { publicRoutes } from './routes/public.js';
import { operations } from './routes/operations.js';
import { ledger } from './routes/ledger.js';
import { carbon } from './routes/carbon.js';
import { certificates } from './routes/certificates.js';
import { record } from './routes/record.js';
import { readAt, iso } from './engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = join(__dirname, '..', 'public');

const app = new Hono();
const api = new Hono();

let ready = false;

/* ------------------------------------------------------------- health */

api.get('/health', (c) => (ready ? c.json({ status: 'ok', ready: true }) : c.json({ status: 'starting', ready: false }, 503)));

/* --------------------------------------------------------------- auth */

api.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.email || !body.password) {
    return c.json({ error: 'missing_credentials', required: ['email', 'password'] }, 400);
  }
  const check = await verifyPassword(body.email, body.password);
  if (!check.ok) {
    return c.json({
      error: check.reason === 'auth_unavailable' ? 'authentication_unavailable' : 'invalid_credentials',
      message: check.reason === 'auth_unavailable'
        ? 'The identity service could not be reached. Nothing was signed in.'
        : 'That email and password were not accepted. There is no signup and no password reset.'
    }, check.reason === 'auth_unavailable' ? 503 : 401);
  }
  const session = await issueSession(check.email);
  if (!session) return c.json({ error: 'no_such_account' }, 401);
  await append(null, {
    act: 'session_issued', person: check.email, object_kind: 'session', object_ref: check.email,
    content: { expires_in: SESSION_SECONDS }
  });
  return c.json(session);
});

api.get('/auth/me', async (c) => {
  const got = await requireSession(c);
  if (got.error) return got.error;
  const grants = await q('SELECT site, ends_on FROM access_grant WHERE email = $1 ORDER BY site', [got.session.email]);
  return c.json({
    email: got.session.email,
    name: got.session.name,
    roles: got.session.roles,
    sites: got.session.sites,
    // A grant is scoped to a site and carries an end date; nothing renews silently.
    grants: grants.map((g) => ({ site: g.site, ends_on: iso(g.ends_on) }))
  });
});

/* ------------------------------------------------- public verification */

// Public, unauthenticated and rate limited. It returns ten fields and nothing else, and
// the route cannot be used to enumerate the customer list.
const verifyHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const window = 60000;
  const cap = 60;
  const hits = (verifyHits.get(ip) || []).filter((t) => now - t < window);
  hits.push(now);
  verifyHits.set(ip, hits);
  if (verifyHits.size > 5000) verifyHits.clear();
  return hits.length > cap;
}

api.get('/verify/:number', async (c) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'local';
  if (rateLimited(ip)) {
    return c.json({ error: 'rate_limited', message: 'Too many verification requests. Try again shortly.' }, 429);
  }
  const number = c.req.param('number');
  const row = await one(
    `SELECT number, state, signed_at, withdrawal, site, grade, claim_type, recipient_name
       FROM certificate WHERE number = $1 ORDER BY version DESC LIMIT 1`, [number]
  );
  if (!row) {
    // An unknown number returns 200 with found false rather than an error.
    return c.json({
      found: false, number, state: null, issued_on: null, withdrawn_on: null,
      withdrawal_reason: null, site: null, grade: null, claim_type: null, recipient_name: null
    });
  }
  return c.json({
    found: true,
    number: row.number,
    state: row.state,
    issued_on: iso(row.signed_at),
    withdrawn_on: row.withdrawal?.withdrawn_on || null,
    withdrawal_reason: row.withdrawal?.reason || null,
    site: row.site,
    grade: row.grade,
    claim_type: row.claim_type,
    recipient_name: row.recipient_name
  });
});

/* ------------------------------------------------------------- mounted */

api.route('/', publicRoutes);
api.route('/', operations);
api.route('/', ledger);
api.route('/', carbon);
api.route('/', certificates);
api.route('/', record);

/* ------------------------------------------------------ collector view */

// A collector account sees its own batches and nothing else.
api.get('/my/batches', async (c) => {
  const got = await requireSession(c);
  if (got.error) return got.error;
  const collector = c.req.query('collector');
  if (!collector) return c.json({ error: 'missing_field', field: 'collector' }, 400);
  const { decorateBatch, collectorApprovalOn } = await import('./engine.js');
  const rows = await q('SELECT * FROM batch WHERE collector = $1 ORDER BY received_on', [collector]);
  const out = [];
  for (const r of rows) {
    const v = await decorateBatch(r);
    // No lot, no run, no yield, no carbon figure, no other collector.
    out.push({
      reference: v.reference, received_on: v.received_on, category: v.category,
      net_g: v.net_g, dry_mass_g: v.dry_mass_g, accepted_g: v.accepted_g,
      rejected_g: v.rejected_g, rejected_reason: v.rejected_reason,
      rejected_destination: v.rejected_destination,
      claimable: v.claimable, claimable_reason: v.claimable_reason, flags: v.flags
    });
  }
  const approval = await collectorApprovalOn(collector, new Date().toISOString().slice(0, 10));
  return c.json({
    collector,
    approval_state: approval?.state || 'none',
    approval_expires: approval ? iso(approval.valid_to) : null,
    batches: out
  });
});

/* ------------------------------------------------------ queued work */

// Closing a run while the arithmetic is unavailable is queued and reported as queued.
api.get('/queued-work', async (c) => {
  const got = await requireSession(c);
  if (got.error) return got.error;
  const rows = await q('SELECT * FROM queued_work ORDER BY queued_at ASC');
  return c.json(rows.map((r) => ({
    reference: r.reference, kind: r.kind, target: r.target, state: r.state,
    queued_at: r.queued_at, detail: r.detail
  })));
});

api.notFound((c) => c.json({ error: 'not_found', path: new URL(c.req.url).pathname }, 404));

api.onError((err, c) => {
  if (err.status && err.body) return c.json(err.body, err.status);
  console.error('[api]', err);
  return c.json({ error: 'internal_error', message: 'The act was not completed and nothing was changed.' }, 500);
});

app.route('/api', api);

/* ------------------------------------------------- the production build */

const indexPath = join(CLIENT_DIR, 'index.html');
const indexHtml = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '<!doctype html><title>Ravel</title><p>The client build is not present.</p>';

// The single-page application is served for every non-API route from one origin.
app.get('*', async (c) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/')) return c.json({ error: 'not_found', path }, 404);
  if (/\.[a-z0-9]+$/i.test(path)) {
    const file = normalize(join(CLIENT_DIR, decodeURIComponent(path)));
    // A request never reaches outside the built client directory.
    if (!file.startsWith(CLIENT_DIR + sep)) return c.text('Not found', 404);
    if (existsSync(file) && statSync(file).isFile()) {
      const types = {
        '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
        '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
        '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp'
      };
      const ext = path.slice(path.lastIndexOf('.'));
      const body = readFileSync(file);
      return c.body(body, 200, {
        'content-type': types[ext] || 'application/octet-stream',
        'cache-control': path.startsWith('/assets/') || path.startsWith('/fonts/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache'
      });
    }
    return c.text('Not found', 404);
  }
  return c.html(indexHtml);
});

/* --------------------------------------------------------------- start */

const PORT = 4173; // the container-internal port

async function start() {
  await waitForDatabase();
  // Schema and seed are applied together under one lock.
  const result = await migrate(seed);
  console.log(`[ravel] database ready, seed ${result?.seeded ? 'applied' : 'already present'}`);
  ready = true;
}

// Bind 0.0.0.0: a loopback-only listener is unreachable from outside the container.
const server = serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`[ravel] listening on 0.0.0.0:${info.port}`);
});

// The schema and the seed are applied by the app itself, so a database created from
// scratch is brought up to date on start. Until that finishes, /api/health answers 503.
start().catch((err) => {
  console.error('[ravel] startup failed', err);
  process.exit(1);
});

// An unhandled rejection must not leave the process running in a state nobody trusts,
// nor silently take it down mid-write.
process.on('unhandledRejection', (err) => {
  console.error('[ravel] unhandled rejection', err);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[ravel] ${signal} received, closing`);
    server.close(() => {
      pool.end().catch(() => {}).finally(() => process.exit(0));
    });
    // Do not wait forever for a connection that will not drain.
    setTimeout(() => process.exit(0), 8000).unref();
  });
}
