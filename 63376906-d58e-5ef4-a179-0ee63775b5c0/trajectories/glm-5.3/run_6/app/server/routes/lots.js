import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore, refusePagination } from '../lib/idem.js';
import { genealogyFor } from '../lib/engine.js';
import { contentOfLot } from '../lib/ledger.js';
import { carbonFigureView, currentFigureFor } from '../lib/carbon.js';
import { floorDiv } from '../lib/units.js';

export async function register({ app, pool }) {
  app.get('/api/lots', async (c) => {
    refusePagination(c.req.query());
    requireSession(c);
    const rows = (await pool.query(`SELECT * FROM lots ORDER BY reference`)).rows;
    const out = [];
    for (const l of rows) {
      const content = await contentOfLot(pool, l.reference);
      out.push({
        reference: l.reference, site: l.site, grade: l.grade, mass_g: l.mass_g,
        disposition: l.disposition, claim_type: l.claim_type, produced_by: l.produced_by,
        flags: l.flags || [], content_bp: content.content_bp,
        credit_attached_g: content.attached.post_consumer + content.attached.pre_consumer,
        credit_attached: content.attached
      });
    }
    return c.json(out);
  });

  app.get('/api/lots/:reference', async (c) => {
    requireSession(c);
    const ref = c.req.param('reference');
    const l = (await pool.query(`SELECT * FROM lots WHERE reference=$1`, [ref])).rows[0];
    if (!l) throw new HttpError(404, 'lot_not_found');
    const content = await contentOfLot(pool, ref);
    const dev = (await pool.query(`SELECT reference, state, subjects FROM deviations`)).rows
      .filter((d) => Array.isArray(d.subjects) && d.subjects.includes(ref));
    const ovr = (await pool.query(`SELECT * FROM overrides WHERE lot=$1`, [ref])).rows;
    const tests = (await pool.query(`SELECT * FROM test_results WHERE subject=$1 ORDER BY id`, [ref])).rows;
    const run = l.produced_by ? (await pool.query(`SELECT reference, run_type, losses_g FROM runs WHERE reference=$1`, [l.produced_by])).rows[0] : null;
    return c.json({
      reference: l.reference, site: l.site, grade: l.grade, mass_g: l.mass_g,
      disposition: l.disposition, claim_type: l.claim_type, produced_by: l.produced_by,
      flags: l.flags || [],
      content_bp: content.content_bp,
      credit_attached: content.attached,
      deviations: dev.map((d) => ({ reference: d.reference, state: d.state })),
      overrides: ovr.map((o) => ({ reference: o.reference, separation: o.separation, reviewed: o.reviewed, authorised_by: o.authorised_by, authorised_on: o.authorised_on })),
      test_results: tests.map((t) => ({
        property: t.property, method: t.method, instrument: t.instrument, analyst: t.analyst,
        value: t.value, unit: t.unit, uncertainty_bp: t.uncertainty_bp,
        method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release
      })),
      run: run || null,
      derivation: { content_bp: 'credit_attached_g * 10000 / lot_mass_g, floored', inputs: 'credit_movements for this lot, direction out' }
    });
  });

  app.get('/api/lots/:reference/genealogy', async (c) => {
    refusePagination(c.req.query());
    requireSession(c);
    const g = await genealogyFor(pool, c.req.param('reference'));
    if (!g) throw new HttpError(404, 'lot_not_found');
    return c.json(g);
  });

  app.get('/api/lots/:reference/carbon', async (c) => {
    requireSession(c);
    const ref = c.req.param('reference');
    const fig = await currentFigureFor(pool, ref);
    if (!fig) throw new HttpError(404, 'carbon_figure_not_found');
    return c.json(await carbonFigureView(pool, fig, { includeBreakdown: true }));
  });

  app.get('/api/lots/:reference/yield', async (c) => {
    const s = requireSession(c);
    if (s.roles.includes('auditor') === false) { /* auditors may read */ }
    const ref = c.req.param('reference');
    const l = (await pool.query(`SELECT * FROM lots WHERE reference=$1`, [ref])).rows[0];
    if (!l) throw new HttpError(404, 'lot_not_found');
    const g = await genealogyFor(pool, ref);
    const batchMass = g.nodes.filter((n) => n.kind === 'batch').reduce((a, n) => a + n.mass_g, 0);
    const intermediate = g.nodes.filter((n) => n.kind === 'intermediate');
    const runLosses = g.nodes.filter((n) => n.kind === 'run').length;
    const runs = (await pool.query(`
      WITH RECURSIVE r AS (
        SELECT reference FROM runs WHERE reference=$1
        UNION
        SELECT c.run FROM consumptions c JOIN r ON c.input_ref IN (SELECT reference FROM outputs WHERE run = r.reference) WHERE c.input_kind='intermediate'
      ) SELECT * FROM r`, [l.produced_by])).rows;
    let massIn = 0;
    for (const rr of runs) {
      const m = (await pool.query(`SELECT COALESCE(SUM(mass_g),0)::int AS s FROM consumptions WHERE run=$1 AND input_kind='batch'`, [rr.reference])).rows[0].s;
      massIn += m;
    }
    const yieldBp = massIn > 0 ? floorDiv(l.mass_g * 10000, massIn) : 0;
    const events = (await pool.query(`SELECT * FROM test_results WHERE subject=$1 ORDER BY id DESC LIMIT 5`, [ref])).rows;
    return c.json({
      lot: ref, mass_g: l.mass_g, batch_mass_in_g: massIn, yield_bp: yieldBp,
      derivation: {
        description: 'lot mass over the total batch dry mass consumed on every run the lot descends from, floored',
        runs: runs.map((x) => x.reference)
      },
      note: 'A yield figure appears on no certificate and in no verification answer.'
    });
  });
}
