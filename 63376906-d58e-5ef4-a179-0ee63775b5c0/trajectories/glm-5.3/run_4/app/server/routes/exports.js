import { Hono } from 'hono';
import { q, tx } from '../db.js';
import { requireSession } from '../auth.js';
import { idempotent, readBody, refuse, recordTx, requireKeys, readAt } from '../lib/http.js';
import { nowIso } from '../lib/util.js';

const exports = new Hono();
exports.use('*', requireSession());

exports.post('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'auditor') refuse(403, 'forbidden', { message: 'An auditor exports.' });
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['scope']);
    const scope = body.scope || {};
    return await tx(async (client) => {
      const r = await client.query('INSERT INTO ref_seq (kind, n) VALUES ($1, 1) ON CONFLICT (kind) DO UPDATE SET n = ref_seq.n + 1 RETURNING n', ['exp']);
      const ref = 'EXP-' + String(r.rows[0].n).padStart(3, '0');
      const batches = scope.sites && scope.sites.length
        ? (await client.query('SELECT * FROM batch WHERE site = ANY($1)', [scope.sites])).rows
        : (await client.query('SELECT * FROM batch')).rows;
      const certs = scope.certificates && scope.certificates.length
        ? (await client.query('SELECT * FROM certificate WHERE number = ANY($1)', [scope.certificates])).rows
        : (scope.certificates ? [] : (await client.query('SELECT * FROM certificate')).rows);
      const periods = scope.period
        ? (await client.query('SELECT * FROM balance_period WHERE id = $1', [scope.period])).rows
        : (await client.query('SELECT * FROM balance_period')).rows;
      const anchors = (await client.query('SELECT seq, digest FROM record_entry ORDER BY seq')).rows;
      const bundle = {
        exported_at: readAt(), exported_by: user.email, scope,
        batches: batches.map((b) => ({ reference: b.reference, category: b.category, net_g: Number(b.net_g) })),
        certificates: certs.map((x) => ({ number: x.number, state: x.state, content_bp: x.content_bp, claim_type: x.claim_type })),
        balance_periods: periods.map((p) => ({ id: p.id, state: p.state })),
        derivations: { note: 'Every figure carries the records it came from.' },
        anchor_references: anchors.map((a) => ({ seq: Number(a.seq), digest: a.digest })),
        empty: batches.length === 0 && certs.length === 0 && periods.length === 0
      };
      await client.query('INSERT INTO export_record (reference, scope, bundle, exported_by, exported_on, empty) VALUES ($1,$2,$3,$4,$5,$6)',
        [ref, JSON.stringify(scope), JSON.stringify(bundle), user.email, nowIso().slice(0, 10), bundle.empty]);
      await recordTx(client, { user, act: 'export_recorded', object: ref, payload: { scope, empty: bundle.empty } });
      return { reference: ref, ...bundle };
    });
  });
});

exports.get('/', async (c) => {
  const r = await q('SELECT * FROM export_record ORDER BY exported_on DESC');
  return c.json(r.rows.map((x) => ({ reference: x.reference, exported_by: x.exported_by, exported_on: x.exported_on, empty: x.empty, scope: x.scope })));
});

export default exports;
