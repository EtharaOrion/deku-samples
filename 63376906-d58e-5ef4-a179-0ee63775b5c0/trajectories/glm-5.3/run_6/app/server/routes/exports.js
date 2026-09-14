import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record, entryView } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore, refusePagination } from '../lib/idem.js';
import { sha256 } from '../lib/record.js';
import { balanceView } from '../lib/ledger.js';
import { genealogyFor } from '../lib/engine.js';

export async function register({ app, pool }) {
  app.post('/api/exports', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('auditor')) throw new HttpError(403, 'auditor_required');
    const body = await c.req.json().catch(() => ({}));
    if (!body.scope) throw new HttpError(400, 'scope_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, 'exports', body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const scope = body.scope;
      // read the scope
      const collected = { period: null, sites: [], grades: [], certificates: [], record_entries: [], genealogies: [] };
      if (scope.period) {
        const bp = (await client.query(`SELECT * FROM balance_periods WHERE id=$1`, [scope.period])).rows[0];
        if (bp) collected.period = await balanceView(client, bp, new Date().toISOString());
      }
      if (Array.isArray(scope.sites)) {
        for (const ref of scope.sites) {
          const site = (await client.query(`SELECT * FROM sites WHERE reference=$1`, [ref])).rows[0];
          if (site) collected.sites.push({ reference: site.reference, name: site.name, confidence: site.confidence });
        }
      }
      if (Array.isArray(scope.certificates)) {
        for (const num of scope.certificates) {
          const cert = (await client.query(`SELECT * FROM certificates WHERE number=$1`, [num])).rows[0];
          if (cert) collected.certificates.push({ number: cert.number, state: cert.state, lot: cert.lot, content_bp: cert.content_bp });
        }
      }
      if (Array.isArray(scope.lots)) {
        for (const lot of scope.lots) {
          const g = await genealogyFor(client, lot);
          if (g) collected.genealogies.push({ lot, nodes: g.nodes, edges: g.edges });
        }
      }
      // anchors: the digests of the record entries in scope
      const entries = (await client.query(`SELECT * FROM record_entries ORDER BY seq`)).rows;
      const anchors = entries.filter((e) => {
        if (scope.period && e.kind === 'period_closed' && e.object_ref === scope.period) return true;
        if (Array.isArray(scope.certificates) && e.object_ref && scope.certificates.includes(e.object_ref)) return true;
        return false;
      }).map((e) => ({ seq: Number(e.seq), digest: e.digest, kind: e.kind, object_ref: e.object_ref }));
      const n = (await client.query(`SELECT count(*)::int AS n FROM exports`)).rows[0].n + 1;
      const ref = `EXP-${String(n).padStart(4, '0')}`;
      const digest = sha256(JSON.stringify(collected));
      const empty = !collected.period && !collected.sites.length && !collected.certificates.length && !collected.genealogies.length;
      const doc = { reference: ref, exported_by: s.email, exported_at: new Date().toISOString(), scope, digest, empty };
      await client.query(`INSERT INTO exports (reference,scope,body,digest,exported_by,empty) VALUES ($1,$2,$3,$4,$5,$6)`,
        [ref, JSON.stringify(scope), JSON.stringify({ ...collected, anchors }), digest, s.email, empty]);
      // the export is itself an entry
      await record(client, { kind: 'export', object_ref: ref, actor: s.email, content: { scope, digest, empty } });
      const response = { ...doc, body: { ...collected, anchors }, anchors, self_contained: true };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.get('/api/exports', async (c) => {
    refusePagination(c.req.query());
    const s = requireSession(c);
    const rows = (await pool.query(`SELECT * FROM exports ORDER BY exported_at DESC`)).rows;
    return c.json(rows.map((x) => ({ reference: x.reference, scope: x.scope, digest: x.digest, exported_by: x.exported_by, exported_at: x.exported_at, empty: x.empty })));
  });
}
