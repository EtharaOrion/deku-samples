import { q, one, pool } from '../lib/db.js';
import {
  refuse, requireSession, requireRole, idempotent, record, refuseParams,
  refuseComputedInput, requireInteger, requireOneOf, refuseAuditorWrite, nextReference,
} from '../lib/http.js';
import { carbonForLot, iso } from '../lib/engine.js';

export default function mount(app) {
  app.get('/carbon-methods', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT * FROM carbon_method ORDER BY id, version');
    return c.json(rows.map(shape));
  });

  app.get('/carbon-methods/:id/versions/:version', async (c) => {
    requireSession(c);
    const m = await one('SELECT * FROM carbon_method WHERE id = $1 AND version = $2',
      [c.req.param('id'), Number(c.req.param('version'))]);
    if (!m) refuse(404, 'no_such_method_version', { message: 'There is no such carbon method version.' });
    return c.json(shape(m));
  });

  // Publishing a version is refused for anybody but a quality manager, and a new
  // version supersedes rather than overwrites.
  app.post('/carbon-methods/:id/versions', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'quality_manager');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    for (const f of ['standard', 'functional_unit', 'boundary', 'reviewer']) {
      if (!body[f]) refuse(400, 'field_required', { message: `${f} is required.`, field: f });
    }
    const allocation_basis = requireOneOf(body, 'allocation_basis', ['mass', 'energy', 'economic']);

    const result = await idempotent(c, body, async () => {
      const prior = await one('SELECT * FROM carbon_method WHERE id = $1 ORDER BY version DESC LIMIT 1', [id]);
      const version = (prior?.version || 0) + 1;
      await pool.query(
        `INSERT INTO carbon_method (id, version, standard, functional_unit, boundary, allocation_basis, reviewer,
          published_on, published_by, data_quality_rules, emission_factors, primary_threshold_bp, superseded)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false)`,
        [id, version, body.standard, body.functional_unit, body.boundary, allocation_basis, body.reviewer,
          body.published_on || iso(new Date()), s.identifier,
          JSON.stringify(body.data_quality_rules || []), JSON.stringify(body.emission_factors || []),
          body.primary_threshold_bp ?? 5000]);
      if (prior) {
        await pool.query('UPDATE carbon_method SET superseded = true WHERE id = $1 AND version = $2', [id, prior.version]);
        // A cached figure whose emission factor is superseded answers cache_valid false.
        await pool.query(
          `UPDATE carbon_figure SET cache_valid = false WHERE method_id = $1 AND method_version = $2`,
          [id, prior.version]);
      }
      await record(c, {
        action: 'carbon_method_published', object_kind: 'carbon_method', object_ref: `${id} v${version}`,
        content: { version, standard: body.standard, supersedes: prior?.version || null },
      });
      const m = await one('SELECT * FROM carbon_method WHERE id = $1 AND version = $2', [id, version]);
      return {
        status: 201,
        body: {
          reference: `${id} v${version}`, ...shape(m),
          note: 'A computation already in flight completes under the version it started with. This version applies from the next computation.',
        },
      };
    });
    return c.json(result.body, result.status);
  });

  // No route returns a carbon value without its boundary, method version and
  // uncertainty, or one energy figure without the other.
  app.get('/lots/:reference/carbon', async (c) => {
    requireSession(c);
    const v = await carbonForLot(c.req.param('reference'));
    if (!v) refuse(404, 'no_carbon_figure', { message: 'There is no carbon figure for this lot.' });
    if (v.mismatch) {
      refuse(409, 'allocation_basis_mismatch', {
        message: 'The period\'s allocation basis and the carbon method\'s allocation basis disagree.',
        period_allocation_basis: v.period_allocation_basis,
        method_allocation_basis: v.method_allocation_basis,
      });
    }
    return c.json(v);
  });

  app.get('/carbon-figures', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT * FROM carbon_figure ORDER BY id');
    return c.json(rows.map((f) => ({
      id: f.id, lot: f.lot, version: f.version,
      value_mg_per_kg: Number(f.value_mg_per_kg),
      boundary: f.boundary,
      method_version: `${f.method_id} v${f.method_version}`,
      uncertainty_bp: f.uncertainty_bp,
      primary_share_bp: f.primary_share_bp,
      breakdown: f.breakdown,
      comparator: f.comparator,
      energy_location_mg_per_kg: Number(f.energy?.energy_location_mg_per_kg || 0),
      energy_market_mg_per_kg: Number(f.energy?.energy_market_mg_per_kg || 0),
      cache_valid: f.cache_valid,
      superseded_by: f.superseded_by,
      input_versions: f.input_versions,
    })));
  });

  // A figure is never silently recomputed: a recomputation is a recorded act
  // producing a new version alongside the old.
  app.post('/carbon-figures/:id/recompute', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'quality_manager', 'claims_manager');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const fig = await one('SELECT * FROM carbon_figure WHERE id = $1', [id]);
    if (!fig) refuse(404, 'no_such_figure', { message: 'There is no such carbon figure.' });
    if (!body.reason) refuse(400, 'field_required', { message: 'reason is required.', field: 'reason' });

    const lot = await one('SELECT * FROM lot WHERE reference = $1', [fig.lot]);
    const period = lot ? await one('SELECT * FROM balance_period WHERE id = $1', [lot.period_id]) : null;
    if (period && period.state === 'closed') {
      const open = await q(`SELECT reference FROM restatement WHERE period_id = $1 AND state = 'open'`, [period.id]);
      if (!open.length) {
        await record(c, {
          action: 'recompute_refused', object_kind: 'carbon_figure', object_ref: id,
          outcome: 'refused', content: { reason: 'period_closed_without_restatement', period: period.id },
        });
        refuse(409, 'period_closed', {
          message: 'A recomputation against a closed period is refused unless a restatement is open.',
          period: period.id,
        });
      }
    }

    const result = await idempotent(c, body, async () => {
      const method = await one(
        'SELECT * FROM carbon_method WHERE id = $1 ORDER BY version DESC LIMIT 1', [fig.method_id]);
      const newId = await nextReference('CFG');
      // The breakdown is recomputed against the method version in force now; the
      // lines sum to the value by construction.
      const breakdown = (fig.breakdown || []).map((b) => ({ ...b }));
      const value = breakdown.reduce((a, b) => a + Number(b.mg_per_kg), 0);
      await pool.query(
        `INSERT INTO carbon_figure (id, lot, method_id, method_version, version, value_mg_per_kg, uncertainty_bp,
          primary_share_bp, boundary, comparator, breakdown, energy, input_versions, computed_by, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [newId, fig.lot, method.id, method.version, fig.version + 1, value, fig.uncertainty_bp,
          fig.primary_share_bp, method.boundary, JSON.stringify(fig.comparator), JSON.stringify(breakdown),
          JSON.stringify(fig.energy),
          JSON.stringify({ ...fig.input_versions, carbon_method: `${method.id} v${method.version}` }),
          s.identifier, body.reason]);
      await pool.query('UPDATE carbon_figure SET superseded_by = $1 WHERE id = $2', [newId, id]);
      // Every certificate carrying the superseded figure is enumerated.
      const certs = await q(
        `SELECT number, version, recipient, recipient_name, state FROM certificate WHERE carbon->>'figure_id' = $1`, [id]);
      await record(c, {
        action: 'carbon_figure_recomputed', object_kind: 'carbon_figure', object_ref: newId,
        content: {
          supersedes: id, lot: fig.lot, reason: body.reason, person: s.identifier,
          date: iso(new Date()), certificates: certs.map((x) => x.number),
        },
      });
      return {
        status: 201,
        body: {
          reference: newId, supersedes: id, lot: fig.lot, version: fig.version + 1,
          value_mg_per_kg: value, boundary: method.boundary,
          method_version: `${method.id} v${method.version}`, uncertainty_bp: fig.uncertainty_bp,
          primary_share_bp: fig.primary_share_bp, breakdown,
          recomputed_by: s.identifier, recomputed_on: iso(new Date()), reason: body.reason,
          certificates_carrying_superseded_figure: certs.map((x) => ({
            number: x.number, version: x.version, recipient: x.recipient,
            recipient_name: x.recipient_name, state: x.state,
          })),
          complete: true,
        },
      };
    });
    return c.json(result.body, result.status);
  });

  /* ------------------------------------------------ energy instruments */
  app.get('/energy-instruments', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT * FROM energy_instrument ORDER BY reference');
    return c.json(rows.map((i) => ({
      reference: i.reference, quantity_kwh: Number(i.quantity_kwh), vintage: i.vintage,
      region: i.region, state: i.state, applied_period: i.applied_period,
    })));
  });

  app.post('/energy-instruments/:reference/retire', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'quality_manager', 'claims_manager');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const inst = await one('SELECT * FROM energy_instrument WHERE reference = $1', [ref]);
    if (!inst) refuse(404, 'no_such_instrument', { message: 'There is no such energy instrument.' });
    if (!body.period) refuse(400, 'field_required', { message: 'period is required.', field: 'period' });
    const period = await one('SELECT * FROM balance_period WHERE id = $1', [body.period]);
    if (!period) refuse(404, 'no_such_period', { message: 'There is no such balance period.', field: 'period' });

    const refusals = [];
    if (inst.state !== 'retired') refusals.push('the instrument is not retired');
    const consumptionYear = Number(iso(period.period_from).slice(0, 4));
    if (inst.vintage !== consumptionYear) {
      refusals.push(`its vintage ${inst.vintage} does not match the consumption year ${consumptionYear}`);
    }
    const region = body.region || 'EU-27';
    if (inst.region !== region) refusals.push(`its region ${inst.region} does not match the consumption region ${region}`);
    const figures = await q(
      `SELECT f.* FROM carbon_figure f JOIN lot l ON l.reference = f.lot WHERE l.period_id = $1`, [body.period]);
    const metered = figures.reduce((a, f) => Math.max(a, Number(f.energy?.metered_kwh || 0)), 0);
    const alreadyRetired = (await q(
      'SELECT * FROM energy_instrument WHERE applied_period = $1 AND reference <> $2', [body.period, ref]))
      .reduce((a, i) => a + Number(i.quantity_kwh), 0);
    if (alreadyRetired + Number(inst.quantity_kwh) > metered) {
      refusals.push(`the retired quantity ${alreadyRetired + Number(inst.quantity_kwh)} kWh would exceed the metered consumption ${metered} kWh`);
    }
    if (refusals.length) {
      await record(c, {
        action: 'energy_instrument_retirement_refused', object_kind: 'energy_instrument', object_ref: ref,
        outcome: 'refused', content: { period: body.period, reasons: refusals },
      });
      refuse(409, 'instrument_not_applicable', {
        message: `This instrument is refused: ${refusals.join('; ')}.`,
        reasons: refusals,
        instrument: { reference: inst.reference, state: inst.state, vintage: inst.vintage, region: inst.region, quantity_kwh: Number(inst.quantity_kwh) },
        metered_kwh: metered,
      });
    }

    const result = await idempotent(c, body, async () => {
      await pool.query('UPDATE energy_instrument SET applied_period = $1 WHERE reference = $2', [body.period, ref]);
      await record(c, {
        action: 'energy_instrument_applied', object_kind: 'energy_instrument', object_ref: ref, site: period.site,
        content: { period: body.period, quantity_kwh: Number(inst.quantity_kwh) },
      });
      const retired = alreadyRetired + Number(inst.quantity_kwh);
      return {
        status: 200,
        body: {
          reference: ref, period: body.period, quantity_kwh: Number(inst.quantity_kwh),
          vintage: inst.vintage, region: inst.region, state: inst.state,
          metered_kwh: metered, retired_kwh: retired, unmatched_kwh: metered - retired,
        },
      };
    });
    return c.json(result.body, result.status);
  });
}

function shape(m) {
  return {
    id: m.id,
    version: m.version,
    reference: `${m.id} v${m.version}`,
    standard: m.standard,
    functional_unit: m.functional_unit,
    boundary: m.boundary,
    allocation_basis: m.allocation_basis,
    reviewer: m.reviewer,
    published_on: iso(m.published_on),
    published_by: m.published_by,
    data_quality_rules: m.data_quality_rules,
    emission_factors: m.emission_factors,
    primary_threshold_bp: m.primary_threshold_bp,
    superseded: m.superseded,
  };
}
