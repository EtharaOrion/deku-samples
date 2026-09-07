import { Hono } from 'hono';
import { q, one } from '../db.js';
import { requireSession, requireRole, refuseAuditorWrites } from '../auth.js';
import { appendEntry } from '../record.js';
import { withIdempotency } from '../idempotency.js';
import { isoDate, isoStamp, isInt, ref } from '../util.js';
import { lotCarbon, periodForSite } from '../engine.js';

export const carbon = new Hono();

function shapeMethodVersion(v, method) {
  return {
    method: v.method,
    version: v.version,
    standard: v.standard,
    functional_unit: v.functional_unit,
    boundary: v.boundary,
    allocation_basis: v.allocation_basis,
    reviewer: v.reviewer,
    published_on: isoDate(v.published_on),
    published_by: v.published_by,
    data_quality_rules: v.data_quality_rules,
    emission_factors: v.emission_factors,
    superseded: v.superseded,
    primary_threshold_bp: method ? method.primary_threshold_bp : 5000,
  };
}

carbon.get('/carbon-methods', async (c) => {
  requireSession(c);
  const methods = await q('SELECT * FROM carbon_method ORDER BY id ASC');
  const out = [];
  for (const m of methods) {
    const versions = await q(
      'SELECT * FROM carbon_method_version WHERE method = $1 ORDER BY version ASC',
      [m.id]
    );
    out.push({
      id: m.id, name: m.name, primary_threshold_bp: m.primary_threshold_bp,
      versions: versions.map((v) => shapeMethodVersion(v, m)),
      current_version: versions.filter((v) => !v.superseded).map((v) => v.version).pop() ?? null,
    });
  }
  return c.json(out);
});

carbon.get('/carbon-methods/:id/versions/:version', async (c) => {
  requireSession(c);
  const m = await one('SELECT * FROM carbon_method WHERE id = $1', [c.req.param('id')]);
  const v = await one(
    'SELECT * FROM carbon_method_version WHERE method = $1 AND version = $2',
    [c.req.param('id'), Number(c.req.param('version'))]
  );
  if (!v) return c.json({ error: 'not_found' }, 404);
  return c.json(shapeMethodVersion(v, m));
});

carbon.post('/carbon-methods/:id/versions', async (c) => {
  refuseAuditorWrites(c);
  // Publishing a version is refused for anybody but a quality manager. A claims
  // manager may not alter a carbon method.
  requireRole(c, 'quality_manager');
  const id = c.req.param('id');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { standard, functional_unit, boundary, allocation_basis, reviewer, data_quality_rules, emission_factors } = body;
    if (!standard || !functional_unit || !boundary || !allocation_basis || !reviewer) {
      return { status: 400, body: { error: 'field_required', message: 'standard, functional_unit, boundary, allocation_basis and reviewer are all required.' } };
    }
    const m = await one('SELECT * FROM carbon_method WHERE id = $1', [id]);
    if (!m) return { status: 404, body: { error: 'not_found' } };
    const prior = await one(
      'SELECT * FROM carbon_method_version WHERE method = $1 ORDER BY version DESC LIMIT 1',
      [id]
    );
    const version = prior ? prior.version + 1 : 1;
    await one(
      `INSERT INTO carbon_method_version (method,version,standard,functional_unit,boundary,allocation_basis,reviewer,published_on,published_by,data_quality_rules,emission_factors,superseded)
       VALUES ($1,$2,$3,$4,$5,$6,$7,current_date,$8,$9,$10,false) RETURNING id`,
      [id, version, standard, functional_unit, boundary, allocation_basis, reviewer, s.email,
       JSON.stringify(data_quality_rules || []), JSON.stringify(emission_factors || [])]
    );
    // A new version supersedes rather than overwrites. A computation in flight
    // completes under the version it started with.
    if (prior) {
      await one('UPDATE carbon_method_version SET superseded = true WHERE method = $1 AND version = $2 RETURNING id', [id, prior.version]);
    }
    await appendEntry(null, {
      act: 'carbon_method_version_published', person: s.email, object_kind: 'carbon_method_version',
      object_ref: `${id} v${version}`,
      content: { method: id, version, standard, boundary, allocation_basis, supersedes: prior ? prior.version : null },
    });
    const v = await one('SELECT * FROM carbon_method_version WHERE method = $1 AND version = $2', [id, version]);
    return {
      status: 201,
      body: {
        reference: `${id} v${version}`, ...shapeMethodVersion(v, m),
        supersedes: prior ? prior.version : null,
        note: 'A computation already in flight completes under the version it started with. This version applies from the next computation.',
      },
    };
  });
});

carbon.get('/carbon-figures', async (c) => {
  requireSession(c);
  const rows = await q('SELECT * FROM carbon_figure ORDER BY computed_at ASC');
  const out = [];
  for (const f of rows) {
    const shaped = await lotCarbon(f.lot);
    out.push({
      id: f.id, lot: f.lot, figure_version: f.figure_version,
      value_mg_per_kg: Number(f.value_mg_per_kg), boundary: f.boundary,
      method_version: `${f.method} v${f.method_version}`, uncertainty_bp: f.uncertainty_bp,
      primary_share_bp: f.primary_share_bp,
      breakdown: f.breakdown,
      energy_location_mg_per_kg: Number((f.energy || {}).energy_location_mg_per_kg ?? 0),
      energy_market_mg_per_kg: Number((f.energy || {}).energy_market_mg_per_kg ?? 0),
      cache_valid: f.cache_valid, superseded_by: f.superseded_by,
      input_versions: f.input_versions, computed_at: isoStamp(f.computed_at),
    });
  }
  return c.json(out);
});

carbon.post('/carbon-figures/:id/recompute', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'quality_manager', 'claims_manager');
  const id = c.req.param('id');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const f = await one('SELECT * FROM carbon_figure WHERE id = $1', [id]);
    if (!f) return { status: 404, body: { error: 'not_found' } };
    const { reason } = body;
    if (!reason) return { status: 400, body: { error: 'reason_required', message: 'A figure is never silently recomputed.' } };

    const lot = await one('SELECT * FROM lot WHERE reference = $1', [f.lot]);
    const period = await periodForSite(lot.site, isoDate(lot.effective_on));
    if (period && period.state === 'closed') {
      const openR = await one(
        "SELECT * FROM restatement WHERE period = $1 AND state = 'open' LIMIT 1",
        [period.id]
      );
      if (!openR) {
        return {
          status: 409,
          body: {
            error: 'period_closed_without_restatement', period: period.id,
            message: 'A recomputation against a closed period is refused unless a restatement is open.',
          },
        };
      }
    }

    const mv = await one(
      'SELECT * FROM carbon_method_version WHERE method = $1 AND superseded = false ORDER BY version DESC LIMIT 1',
      [f.method]
    );
    const newId = ref('CFG');
    const version = f.figure_version + 1;
    await one(
      `INSERT INTO carbon_figure (id,lot,figure_version,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,boundary,comparator,breakdown,energy,input_versions,computed_by,reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [newId, f.lot, version, f.method, mv ? mv.version : f.method_version,
       f.value_mg_per_kg, f.uncertainty_bp, f.primary_share_bp,
       mv ? mv.boundary : f.boundary,
       JSON.stringify(f.comparator), JSON.stringify(f.breakdown), JSON.stringify(f.energy),
       JSON.stringify({ ...(f.input_versions || {}), carbon_method: `${f.method} v${mv ? mv.version : f.method_version}` }),
       s.email, reason]
    );
    // A new figure version alongside the old, never in place of it.
    await one('UPDATE carbon_figure SET superseded_by = $1 WHERE id = $2 RETURNING id', [newId, id]);

    const certs = await q(
      `SELECT number, version, recipient, recipient_name, state FROM certificate
       WHERE input_versions->>'carbon_figure' = $1 OR carbon->>'method_version' = $2
       ORDER BY number ASC`,
      [id, `${f.method} v${f.method_version}`]
    );
    await appendEntry(null, {
      act: 'carbon_figure_recomputed', person: s.email, site: lot.site,
      object_kind: 'carbon_figure', object_ref: newId,
      content: { supersedes: id, lot: f.lot, reason, certificates: certs.map((x) => x.number) },
    });
    return {
      status: 201,
      body: {
        reference: newId, id: newId, supersedes: id, lot: f.lot, figure_version: version,
        method_version: `${f.method} v${mv ? mv.version : f.method_version}`,
        value_mg_per_kg: Number(f.value_mg_per_kg), boundary: mv ? mv.boundary : f.boundary,
        uncertainty_bp: f.uncertainty_bp, primary_share_bp: f.primary_share_bp,
        recomputed_by: s.email, recomputed_on: new Date().toISOString().slice(0, 10), reason,
        certificates_carrying_superseded_figure: certs.map((x) => ({
          number: x.number, version: x.version, recipient_name: x.recipient_name, state: x.state,
        })),
        complete: true,
      },
    };
  });
});

carbon.get('/energy-instruments', async (c) => {
  requireSession(c);
  const rows = await q('SELECT * FROM energy_instrument ORDER BY reference ASC');
  return c.json(rows.map((i) => ({
    reference: i.reference, quantity_kwh: Number(i.quantity_kwh), vintage: i.vintage,
    region: i.region, state: i.state, applied_to: i.applied_to,
  })));
});

carbon.post('/energy-instruments/:reference/retire', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'claims_manager', 'quality_manager');
  const reference = c.req.param('reference');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const i = await one('SELECT * FROM energy_instrument WHERE reference = $1', [reference]);
    if (!i) return { status: 404, body: { error: 'not_found' } };
    const { period, consumption_region, consumption_year } = body;
    const p = await one('SELECT * FROM balance_period WHERE id = $1', [period]);
    if (!p) return { status: 404, body: { error: 'period_not_found', period } };

    const reasons = [];
    if (i.state !== 'retired') reasons.push({ reason: 'instrument_not_retired', state: i.state });
    const year = consumption_year || Number(isoDate(p.period_from).slice(0, 4));
    if (i.vintage !== year) reasons.push({ reason: 'vintage_mismatch', vintage: i.vintage, consumption_year: year });
    const region = consumption_region || 'EU-27';
    if (i.region !== region) reasons.push({ reason: 'region_mismatch', region: i.region, consumption_region: region });

    const fig = await one(
      `SELECT * FROM carbon_figure WHERE lot IN (SELECT reference FROM lot WHERE site = $1)
       AND superseded_by IS NULL ORDER BY computed_at DESC LIMIT 1`,
      [p.site]
    );
    const metered = fig ? Number((fig.energy || {}).metered_kwh || 0) : 0;
    const already = await q(
      "SELECT quantity_kwh FROM energy_instrument WHERE applied_to = $1 AND reference <> $2",
      [period, reference]
    );
    const applied = already.reduce((sum, x) => sum + Number(x.quantity_kwh), 0);
    if (applied + Number(i.quantity_kwh) > metered) {
      reasons.push({ reason: 'exceeds_metered_consumption', metered_kwh: metered, would_be_kwh: applied + Number(i.quantity_kwh) });
    }

    if (reasons.length) {
      await appendEntry(null, {
        act: 'energy_instrument_refused', person: s.email, site: p.site,
        object_kind: 'energy_instrument', object_ref: reference, outcome: 'refused',
        content: { period, reasons },
      });
      return { status: 409, body: { error: 'instrument_refused', reasons, reference, period } };
    }
    await one('UPDATE energy_instrument SET applied_to = $1 WHERE reference = $2 RETURNING reference', [period, reference]);
    await appendEntry(null, {
      act: 'energy_instrument_retired', person: s.email, site: p.site,
      object_kind: 'energy_instrument', object_ref: reference,
      content: { period, quantity_kwh: Number(i.quantity_kwh), vintage: i.vintage, region: i.region },
    });
    return {
      status: 201,
      body: {
        reference, period, quantity_kwh: Number(i.quantity_kwh), vintage: i.vintage,
        region: i.region, state: i.state,
        metered_kwh: metered, retired_kwh: applied + Number(i.quantity_kwh),
        unmatched_kwh: metered - applied - Number(i.quantity_kwh),
      },
    };
  });
});
