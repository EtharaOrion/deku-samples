import { Hono } from 'hono';
import { q, tx } from '../db.js';
import { requireSession } from '../auth.js';
import { idempotent, readBody, refuse, recordTx, requireKeys, readAt } from '../lib/http.js';
import { nowIso } from '../lib/util.js';

const carbon = new Hono();

carbon.get('/methods', async (c) => {
  const r = await q('SELECT * FROM carbon_method ORDER BY id, version');
  return c.json(r.rows.map(methodView));
});

carbon.get('/methods/:id/versions/:version', async (c) => {
  const r = await q('SELECT * FROM carbon_method WHERE id = $1 AND version = $2', [c.req.param('id'), Number(c.req.param('version'))]);
  if (!r.rows.length) return c.json({ error: 'not_found' }, 404);
  return c.json(methodView(r.rows[0]));
});

function methodView(m) {
  return {
    id: m.id, version: m.version, standard: m.standard, functional_unit: m.functional_unit,
    boundary: m.boundary, allocation_basis: m.allocation_basis, reviewer: m.reviewer,
    published_on: m.published_on, published_by: m.published_by,
    data_quality: m.data_quality, emission_factors: m.emission_factors,
    primary_threshold_bp: m.primary_threshold_bp, superseded: m.superseded, superseded_on: m.superseded_on
  };
}

carbon.post('/methods', async (c) => {
  const user = c.get('user');
  if (!c.get('user')) return c.json({ error: 'unauthorized' }, 401);
  if (user.role !== 'quality_manager') {
    refuse(403, 'forbidden', { message: 'Publishing a carbon method version is refused for anybody but a quality manager.' });
  }
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['id', 'standard', 'functional_unit', 'boundary', 'allocation_basis', 'reviewer']);
    return await tx(async (client) => {
      const prev = await client.query('SELECT * FROM carbon_method WHERE id = $1 ORDER BY version DESC LIMIT 1', [body.id]);
      const version = prev.rows.length ? prev.rows[0].version + 1 : 1;
      if (prev.rows.length) {
        // a version already computed against is superseded, never overwritten
        await client.query('UPDATE carbon_method SET superseded = true, superseded_on = $2 WHERE id = $1 AND version = $3', [body.id, nowIso().slice(0, 10), prev.rows[0].version]);
      }
      await client.query(
        `INSERT INTO carbon_method (id, version, standard, functional_unit, boundary, allocation_basis, reviewer, published_on, data_quality, emission_factors, primary_threshold_bp, superseded, published_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,$12)`,
        [body.id, version, body.standard, body.functional_unit, body.boundary, body.allocation_basis,
         body.reviewer, nowIso().slice(0, 10), JSON.stringify(body.data_quality || {}),
         JSON.stringify(body.emission_factors || []), Number(body.primary_threshold_bp || 5000), user.email]
      );
      await recordTx(client, { user, act: 'carbon_method_published', object: body.id + ' v' + version, payload: { version } });
      return { reference: body.id + ' v' + version, id: body.id, version };
    });
  });
});

carbon.get('/figures/:id/recompute', async (c) => {
  return c.json({ error: 'use_post' }, 405);
});

carbon.post('/figures/:id/recompute', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  if (!['claims_manager', 'quality_manager'].includes(user.role)) refuse(403, 'forbidden');
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['reason']);
    const fig = (await q('SELECT * FROM carbon_figure WHERE id = $1', [Number(c.req.param('id'))])).rows[0];
    if (!fig) refuse(404, 'not_found');
    const lot = (await q('SELECT * FROM lot WHERE reference = $1', [fig.lot])).rows[0];
    const period = (await q('SELECT * FROM balance_period WHERE site = $1 AND $2 BETWEEN period_from AND period_to', [lot.site, nowIso().slice(0, 10)])).rows[0];
    if (period && period.state === 'closed') {
      const open = (await q('SELECT * FROM restatement WHERE balance_period = $1 AND closed = false', [period.id])).rows;
      if (!open.length) {
        refuse(409, 'period_closed', { message: 'A recomputation against a closed period is refused unless a restatement is open.' });
      }
    }
    return await tx(async (client) => {
      const nextVersion = ((await client.query('SELECT COALESCE(MAX(version),0)+1 AS v FROM carbon_figure WHERE lot = $1', [fig.lot])).rows[0].v);
      // a cached figure whose emission factor was superseded is not silently recomputed; a recomputation is the recorded act
      const certs = (await client.query('SELECT number FROM certificate')).rows.map((x) => x.number);
      await client.query('UPDATE carbon_figure SET superseded = true, superseded_by = $2, cache_valid = false WHERE id = $1', [fig.id, nextVersion]);
      await client.query(
        `INSERT INTO carbon_figure (lot, version, value_mg_per_kg, uncertainty_bp, primary_share_bp, method_id, method_version, boundary, breakdown, energy_location_mg_per_kg, energy_market_mg_per_kg, comparator, input_versions, superseded, recomputed_by, recomputed_on, recomputed_reason, computed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,$14,$15,$16,$17)`,
        [fig.lot, nextVersion, fig.value_mg_per_kg, fig.uncertainty_bp, fig.primary_share_bp,
         fig.method_id, fig.method_version, fig.boundary, JSON.stringify(fig.breakdown),
         fig.energy_location_mg_per_kg, fig.energy_market_mg_per_kg, JSON.stringify(fig.comparator),
         JSON.stringify(fig.input_versions), user.email, nowIso().slice(0, 10), body.reason, nowIso().slice(0, 10)]
      );
      await recordTx(client, { user, act: 'carbon_figure_recomputed', object: fig.lot, payload: { from_version: fig.version, to_version: nextVersion, reason: body.reason } });
      return { reference: fig.lot + ' figure v' + nextVersion, version: nextVersion, reason: body.reason };
    });
  });
});

export default carbon;
