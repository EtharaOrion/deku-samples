import { Hono } from 'hono';
import { cfg } from './config.js';
import { pool, q, one, exec } from './db.js';
import { ApiError, err, rememberIdempotency, currentUser } from './lib/http.js';
import { idempotency } from './lib/http.js';
import { sendMail } from './mail.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../../client/dist');

import sites from './routes/sites.js';
import collectors from './routes/collectors.js';
import parties from './routes/parties.js';
import batches from './routes/batches.js';
import runs from './routes/runs.js';
import tests from './routes/tests.js';
import deviations from './routes/deviations.js';
import overrides from './routes/overrides.js';
import balance from './routes/balance.js';
import factors from './routes/factors.js';
import carbon from './routes/carbon.js';
import certificates from './routes/certificates.js';
import specs from './routes/specs.js';

import contracts from './routes/contracts.js';
import record from './routes/record.js';
import publicContent from './routes/publicContent.js';
import inbound from './routes/inbound.js';
import auth from './routes/auth.js';
import lots from './routes/lots.js';

const app = new Hono();

app.onError((e, c) => {
  if (e instanceof ApiError) return c.json(e.body, e.status);
  if (e?.status && e?.body) return c.json(e.body, e.status);
  console.error('unhandled', e);
  return c.json({ error: 'internal_error' }, 500);
});

app.get('/api/health', async (c) => {
  try {
    await one('SELECT 1');
    return c.json({ status: 'ok', ready: true });
  } catch {
    return c.json({ status: 'starting', ready: false }, 503);
  }
});

app.use('/api/*', async (c, next) => {
  c.set('sendMail', sendMail);
  await next();
});

app.use('/api/*', idempotency);

for (const r of [auth, sites, collectors, parties, batches, runs, lots, tests, deviations, overrides, balance, factors, carbon, certificates, specs, contracts, record, publicContent, inbound]) {
  app.route('/', r);
}

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
export { DIST };
