import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore } from '../lib/idem.js';
import { methodLatest, methodView, carbonFigureView, currentFigureFor } from '../lib/carbon.js';

export async function register({ app, pool }) {
  app.get('/api/carbon-methods', async (c) => {
    requireSession(c);
    const rows = await pool.query(`SELECT * FROM carbon_methods ORDER BY id, version DESC`);
    const out = [];
    for (const m of rows.rows) out.push(await methodView(pool, m));
    return c.json(out);
  });

  app.get('/api/carbon-methods/:id/versions/:version', async (c) => {
    requireSession(c);
    const m = (await pool.query(`SELECT * FROM carbon_methods WHERE id=$1 AND version=$2`,
      [c.req.param('id'), Number(c.req.param('version'))])).rows[0];
    if (!m) throw new HttpError(404, 'method_not_found');
    return c.json(await methodView(pool, m));
  });

  app.post('/api/carbon-methods/:id/versions', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('quality_manager')) throw new HttpError(403, 'quality_manager_required');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `carbon-methods:${id}:versions`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const prior = (await client.query(`SELECT * FROM carbon_methods WHERE id=$1 ORDER BY version DESC LIMIT 1`, [id])).rows[0];
      if (!prior) throw new HttpError(404, 'method_not_found');
      const version = prior.version + 1;
      await client.query(`UPDATE carbon_methods SET superseded_by=$1 WHERE id=$2 AND version=$3`, [version, id, prior.version]);
      await client.query(
        `INSERT INTO carbon_methods (id,version,standard,functional_unit,boundary,allocation_basis,reviewer,published_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE)`,
        [id, version, body.standard || prior.standard, body.functional_unit || prior.functional_unit,
         body.boundary || prior.boundary, body.allocation_basis || prior.allocation_basis, body.reviewer || prior.reviewer]);
      if (Array.isArray(body.emission_factors)) {
        for (const f of body.emission_factors) {
          await client.query(`INSERT INTO emission_factors (method_id,method_version,line,mg_per_kg,tag,source,year)
            VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [id, version, f.line, Number(f.mg_per_kg), f.tag || 'secondary', f.source || 'unspecified', Number(f.year || 2026)]);
        }
      }
      if (body.energy) {
        await client.query(`INSERT INTO energy_lines VALUES ($1,$2,$3,$4)`,
          [id, version, Number(body.energy.energy_location_mg_per_kg), Number(body.energy.energy_market_mg_per_kg)]);
      }
      await record(client, { kind: 'carbon_method_published', object_ref: `${id}:v${version}`, actor: s.email, content: { id, version, supersedes: prior.version } });
      const response = { id, version, supersedes: prior.version };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.post('/api/carbon-figures/:id/recompute', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('quality_manager')) throw new HttpError(403, 'quality_manager_required');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    if (!body.reason) throw new HttpError(400, 'reason_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `carbon-figures:${id}:recompute`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const fig = (await client.query(`SELECT * FROM carbon_figures WHERE id=$1 ORDER BY version DESC`, [id])).rows[0];
      if (!fig) throw new HttpError(404, 'figure_not_found');
      const period = (await client.query(`SELECT * FROM balance_periods WHERE id=$1`, [fig.period])).rows[0];
      if (period && period.state === 'closed') {
        const rs = (await client.query(`SELECT * FROM restatements WHERE period=$1 AND state='open'`, [fig.period])).rows;
        if (!rs.length) throw new HttpError(409, 'closed_period_restatement_required', {
          message: 'A recomputation against a closed period is refused unless a restatement is open.'
        });
      }
      const method = (await client.query(`SELECT * FROM carbon_methods WHERE id=$1 ORDER BY version DESC LIMIT 1`, [fig.method_id])).rows[0];
      const factors = (await client.query(`SELECT * FROM emission_factors WHERE method_id=$1 AND method_version=$2 ORDER BY id`, [method.id, method.version])).rows;
      const total = factors.reduce((a, f) => a + f.mg_per_kg, 0);
      const newVersion = fig.version + 1;
      const newId = `${fig.id.split('#')[0]}#v${newVersion}`;
      await client.query(`UPDATE carbon_figures SET superseded_by=$1 WHERE id=$2 AND version=$3`, [newId, fig.id, fig.version]);
      await client.query(
        `INSERT INTO carbon_figures (id,lot,value_mg_per_kg,uncertainty_bp,primary_share_bp,boundary,method_id,method_version,comparator,breakdown,input_versions,cache_valid,version,superseded_by,recomputed_by,recomputed_on,recompute_reason,period)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$9,null,$12,CURRENT_DATE,$13,$14)`,
        [newId, fig.lot, total, fig.uncertainty_bp, fig.primary_share_bp, method.boundary, method.id, method.version,
         JSON.stringify(fig.comparator), JSON.stringify(factors.map((f) => ({ line: f.line, mg_per_kg: f.mg_per_kg, tag: f.tag }))),
         JSON.stringify({ carbon_method: `${method.id} v${method.version}`, emission_factors: factors.map((f) => ({ line: f.line, source: f.source, year: f.year, mg_per_kg: f.mg_per_kg })), recomputed_from: fig.id }),
         s.email, body.reason, fig.period]);
      // enumerate certificates carrying the superseded figure
      const certs = (await client.query(`SELECT number FROM certificates WHERE carbon_figure=$1`, [fig.id])).rows;
      await record(client, { kind: 'figure_recomputed', object_ref: newId, actor: s.email, content: { superseded: fig.id, reason: body.reason, certificates: certs.map((x) => x.number) } });
      const response = {
        figure: newId, superseded: fig.id, value_mg_per_kg: total,
        recomputed_by: s.email, reason: body.reason,
        certificates_carrying_superseded: certs.map((x) => x.number)
      };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });
}
