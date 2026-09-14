import { requireSession } from '../lib/session.js';
import { withTx } from '../lib/tx.js';
import { record } from '../lib/record.js';
import { refusePagination } from '../lib/idem.js';
import { sha256 } from '../lib/record.js';

export async function register({ app, pool }) {
  app.get('/api/reconciliation', async (c) => {
    refusePagination(c.req.query());
    const s = requireSession(c);
    const read_at = new Date().toISOString();
    return withTx(pool, async (client) => {
      // 1 mass balance residual across every closed run
      const runs = (await client.query(`SELECT * FROM runs`)).rows;
      let residual = 0;
      for (const r of runs) {
        const ins = (await client.query(`SELECT COALESCE(SUM(mass_g),0)::int AS s FROM consumptions WHERE run=$1`, [r.reference])).rows[0].s;
        const outs = (await client.query(`SELECT COALESCE(SUM(mass_g),0)::int AS s FROM outputs WHERE run=$1`, [r.reference])).rows[0].s;
        if (r.closed_at) residual += (ins - outs) - (r.losses_g || 0);
      }
      // 2 credit margin: total in minus total out across open periods
      const periods = (await client.query(`SELECT * FROM balance_periods WHERE state='open'`)).rows;
      let margin = 0;
      for (const p of periods) {
        const inSum = (await client.query(`SELECT COALESCE(SUM(mass_g),0)::int AS s FROM credit_movements WHERE period=$1 AND direction='in'`, [p.id])).rows[0].s;
        const outSum = (await client.query(`SELECT COALESCE(SUM(mass_g),0)::int AS s FROM credit_movements WHERE period=$1 AND direction='out'`, [p.id])).rows[0].s;
        margin += inSum - outSum;
      }
      const openRuns = runs.filter((r) => !r.closed_at).length;
      // batches with a broken custody chain
      const batches = (await client.query(`SELECT * FROM batches`)).rows;
      const kinds = ['collection_site','collector','transport','arrival','weighing','acceptance'];
      const broken = batches.filter((b) => {
        const present = new Set((b.custody || []).map((l) => l.kind));
        return kinds.some((k) => !present.has(k));
      }).length;
      // certificates whose carbon figure is superseded
      const superseded = (await client.query(`
        SELECT count(*)::int AS n FROM certificates c
        JOIN carbon_figures f ON f.id = c.carbon_figure
        WHERE f.superseded_by IS NOT NULL`)).rows[0].n;
      // integration ages, one entry per source, null when never sent
      const ages = {};
      for (const src of ['weighbridge','control_system','laboratory','customer_reporting']) {
        const r = (await client.query(`SELECT received_at FROM inbound_records WHERE source=$1 ORDER BY received_at DESC LIMIT 1`, [src])).rows[0];
        ages[src] = r ? Math.max(0, Math.round((Date.now() - new Date(r.received_at).getTime()) / 3600000)) : null;
      }
      return c.json({
        mass_balance_residual_g: residual,
        credit_margin_g: margin,
        consumptions_on_open_runs: openRuns,
        batches_with_broken_custody: broken,
        certificates_with_superseded_figures: superseded,
        integration_ages: ages,
        read_at,
        derivation: {
          mass_balance_residual_g: 'sum over closed runs of (mass in - mass out - recorded losses)',
          credit_margin_g: 'credits in minus credits out across open periods',
          batches_with_broken_custody: 'batches whose custody list omits one of the six link kinds'
        }
      });
    });
  });
}
