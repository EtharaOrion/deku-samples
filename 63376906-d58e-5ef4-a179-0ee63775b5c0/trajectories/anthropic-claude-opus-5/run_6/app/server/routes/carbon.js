import { Hono } from 'hono';
import { q, pool } from '../lib/db.js';
import {
  requireSession, requireAct, withIdempotency, refuse, refusePagination,
  requireFields, requireIntegers, rejectComputedInputs, nextReference, today,
} from '../lib/http.js';
import { appendEntry } from '../lib/records.js';
import { carbonFor, methodVersionView } from '../engine/carbon.js';
import { iso } from '../engine/feedstock.js';

const r = new Hono();

r.get('/carbon-methods', async (c) => {
  await requireSession(c);
  const methods = await q('SELECT * FROM carbon_method ORDER BY id ASC');
  const versions = await q('SELECT * FROM carbon_method_version ORDER BY method_id ASC, version ASC');
  return c.json(methods.map((m) => ({
    id: m.id,
    name: m.name,
    polymer: m.polymer,
    versions: versions.filter((v) => v.method_id === m.id).map(methodVersionView),
    current_version: versions.filter((v) => v.method_id === m.id && !v.superseded)[0]?.version ?? null,
  })));
});

r.get('/carbon-methods/:id/versions/:version', async (c) => {
  await requireSession(c);
  const mv = (await q('SELECT * FROM carbon_method_version WHERE method_id = $1 AND version = $2',
    [c.req.param('id'), Number(c.req.param('version'))]))[0];
  if (!mv) refuse(404, 'not_found', { error: 'not_found', message: 'No such method version.' });
  return c.json(methodVersionView(mv));
});

// Publishing a version is refused for anybody but a quality manager.
r.post('/carbon-methods/:id/versions', async (c) => {
  const actor = await requireAct(c, 'carbon.publish');
  const body = await c.req.json().catch(() => ({}));
  const methodId = c.req.param('id');
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['standard', 'functional_unit', 'boundary', 'allocation_basis', 'reviewer']);
    const method = (await q('SELECT * FROM carbon_method WHERE id = $1', [methodId]))[0];
    if (!method) refuse(404, 'not_found', { error: 'not_found', message: 'No such carbon method.' });
    const prior = (await q('SELECT * FROM carbon_method_version WHERE method_id = $1 ORDER BY version DESC LIMIT 1', [methodId]))[0];
    const version = prior ? prior.version + 1 : 1;
    // a new version supersedes rather than overwrites; the predecessor stays readable
    if (prior) await pool.query('UPDATE carbon_method_version SET superseded = true WHERE method_id = $1 AND version = $2', [methodId, prior.version]);
    await pool.query(
      `INSERT INTO carbon_method_version (method_id, version, standard, functional_unit, boundary, allocation_basis, reviewer, published_on, published_by, data_quality_rules, emission_factors, primary_threshold_bp, superseded)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false)`,
      [methodId, version, body.standard, body.functional_unit, body.boundary, body.allocation_basis,
        body.reviewer, body.published_on || today(), actor.email,
        JSON.stringify(body.data_quality_rules || []), JSON.stringify(body.emission_factors || []),
        body.primary_threshold_bp ?? 5000]);
    await appendEntry(null, {
      person: actor.email, object_kind: 'carbon_method_version', object_ref: `${methodId} v${version}`,
      action: 'published', content: { standard: body.standard, boundary: body.boundary, supersedes: prior?.version ?? null },
    });
    // a computation in flight completes under the version it started with
    return {
      status: 201,
      body: {
        reference: `${methodId} v${version}`, method_id: methodId, version,
        standard: body.standard, boundary: body.boundary, allocation_basis: body.allocation_basis,
        published_by: actor.email, published_on: body.published_on || today(),
        supersedes: prior ? `${methodId} v${prior.version}` : null,
        note: 'A computation already in flight completes under the version it started with and records that version. This version applies from the next computation.',
      },
    };
  });
  return c.json(out.body, out.status);
});

r.get('/carbon-figures', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const rows = await q('SELECT * FROM carbon_figure ORDER BY id ASC');
  return c.json(rows.map((f) => ({
    id: f.id, lot: f.lot, figure_version: f.figure_version,
    value_mg_per_kg: Number(f.value_mg_per_kg),
    boundary: f.boundary,
    method_version: `${f.method_id} v${f.method_version}`,
    uncertainty_bp: Number(f.uncertainty_bp),
    primary_share_bp: Number(f.primary_share_bp),
    comparator: f.comparator,
    breakdown: f.breakdown,
    energy_location_mg_per_kg: Number(f.energy.energy_location_mg_per_kg),
    energy_market_mg_per_kg: Number(f.energy.energy_market_mg_per_kg),
    cache_valid: f.cache_valid,
    superseded_by: f.superseded_by,
    input_versions: f.input_versions,
    computed_at: f.computed_at,
  })));
});

// A figure is never silently recomputed: a recomputation is the recorded act.
r.post('/carbon-figures/:id/recompute', async (c) => {
  const actor = await requireAct(c, 'carbon.recompute');
  const body = await c.req.json().catch(() => ({}));
  const id = c.req.param('id');
  const out = await withIdempotency(c, body, async () => {
    rejectComputedInputs(body);
    requireFields(body, ['reason']);
    const figure = (await q('SELECT * FROM carbon_figure WHERE id = $1', [id]))[0];
    if (!figure) refuse(404, 'not_found', { error: 'not_found', message: 'No such carbon figure.' });
    const lot = (await q('SELECT * FROM lot WHERE reference = $1', [figure.lot]))[0];
    const period = (await q(
      'SELECT * FROM balance_period WHERE site = $1 AND grade = $2 ORDER BY period_from DESC LIMIT 1',
      [lot.site, lot.grade]))[0];
    if (period && period.state === 'closed') {
      const open = await q("SELECT * FROM restatement WHERE period_id = $1 AND state = 'open'", [period.id]);
      if (!open.length) {
        refuse(409, 'period_closed', {
          error: 'period_closed',
          message: 'This period is closed. Corrections require a restatement. A recomputation against a closed period is refused unless a restatement is open.',
          period: period.id,
        });
      }
    }
    const mv = (await q(
      'SELECT * FROM carbon_method_version WHERE method_id = $1 AND superseded = false ORDER BY version DESC LIMIT 1',
      [figure.method_id]))[0];
    // the breakdown is recomputed line by line from the versioned inputs
    const breakdown = figure.breakdown;
    const value = breakdown.reduce((s, l) => s + Number(l.mg_per_kg), 0);
    const newId = await nextReference('CFG', 'carbon_figure', 'id');
    await pool.query(
      `INSERT INTO carbon_figure (id, lot, figure_version, value_mg_per_kg, uncertainty_bp, primary_share_bp, method_id, method_version, boundary, comparator, breakdown, energy, input_versions, cache_valid, reason, computed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14,$15)`,
      [newId, figure.lot, Number(figure.figure_version) + 1, value, Number(figure.uncertainty_bp),
        Number(figure.primary_share_bp), figure.method_id, mv?.version ?? figure.method_version,
        mv?.boundary ?? figure.boundary, JSON.stringify(figure.comparator), JSON.stringify(breakdown),
        JSON.stringify(figure.energy),
        JSON.stringify({ ...figure.input_versions, carbon_method: `${figure.method_id} v${mv?.version ?? figure.method_version}` }),
        body.reason, actor.email]);
    // the old figure stays alongside the new one
    await pool.query('UPDATE carbon_figure SET superseded_by = $1, cache_valid = false WHERE id = $2', [newId, id]);

    const certs = await q('SELECT * FROM certificate');
    const carrying = certs.filter((x) => (x.payload?.lots || []).some((l) => l.reference === figure.lot));

    await appendEntry(null, {
      person: actor.email, site: lot.site, object_kind: 'carbon_figure', object_ref: newId,
      action: 'recomputed',
      content: { supersedes: id, lot: figure.lot, reason: body.reason, value_mg_per_kg: value, method_version: `${figure.method_id} v${mv?.version ?? figure.method_version}`, certificates: carrying.map((x) => x.number) },
    });

    return {
      status: 201,
      body: {
        reference: newId, id: newId, supersedes: id, lot: figure.lot,
        figure_version: Number(figure.figure_version) + 1,
        value_mg_per_kg: value,
        boundary: mv?.boundary ?? figure.boundary,
        method_version: `${figure.method_id} v${mv?.version ?? figure.method_version}`,
        uncertainty_bp: Number(figure.uncertainty_bp),
        breakdown,
        reason: body.reason, recomputed_by: actor.email, recomputed_on: today(),
        certificates_carrying_superseded_figure: carrying.map((x) => ({ number: x.number, state: x.state, recipient: x.recipient })),
        complete: true,
      },
    };
  });
  return c.json(out.body, out.status);
});

// ---- energy --------------------------------------------------------------
r.get('/energy-instruments', async (c) => {
  await requireSession(c);
  const rows = await q('SELECT * FROM energy_instrument ORDER BY reference ASC');
  return c.json(rows.map((i) => ({
    reference: i.reference, quantity_kwh: Number(i.quantity_kwh), vintage: i.vintage,
    region: i.region, state: i.state, applied_period: i.applied_period,
  })));
});

r.post('/energy-instruments/:reference/retire', async (c) => {
  const actor = await requireAct(c, 'energy.retire');
  const body = await c.req.json().catch(() => ({}));
  const reference = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['period']);
    const inst = (await q('SELECT * FROM energy_instrument WHERE reference = $1', [reference]))[0];
    if (!inst) refuse(404, 'not_found', { error: 'not_found', message: 'No such energy instrument.' });
    const period = (await q('SELECT * FROM balance_period WHERE id = $1', [body.period]))[0];
    if (!period) refuse(404, 'not_found', { error: 'not_found', message: 'No such balance period.' });

    const refusals = [];
    if (inst.state !== 'retired') refusals.push({ condition: 'instrument_not_retired', detail: `The instrument is ${inst.state} rather than retired.` });
    const periodYear = Number(String(period.period_from).slice(0, 4));
    if (Number(inst.vintage) !== periodYear) refusals.push({ condition: 'vintage_mismatch', detail: `The instrument vintage is ${inst.vintage} and the consumption is ${periodYear}.` });
    if (body.region && inst.region !== body.region) refusals.push({ condition: 'region_mismatch', detail: `The instrument region is ${inst.region}.` });
    const applied = await q('SELECT * FROM energy_instrument WHERE applied_period = $1 AND reference <> $2', [body.period, reference]);
    const alreadyRetired = applied.reduce((s, x) => s + Number(x.quantity_kwh), 0);
    if (alreadyRetired + Number(inst.quantity_kwh) > Number(period.metered_kwh)) {
      refusals.push({ condition: 'exceeds_metered_consumption', detail: `Retiring ${inst.quantity_kwh} kWh against ${alreadyRetired} kWh already retired exceeds the metered consumption of ${period.metered_kwh} kWh.` });
    }
    if (refusals.length) {
      await appendEntry(null, {
        person: actor.email, site: period.site, object_kind: 'energy_instrument', object_ref: reference,
        action: 'retire_refused', content: { period: body.period, refusals },
      });
      refuse(409, 'retirement_refused', {
        error: 'retirement_refused',
        message: 'An instrument is refused when it is not retired, when its vintage or its region does not match the consumption, or when the retired quantity would exceed the metered consumption.',
        refusals, instrument: reference, period: body.period,
      });
    }
    await pool.query('UPDATE energy_instrument SET applied_period = $1 WHERE reference = $2', [body.period, reference]);
    await appendEntry(null, {
      person: actor.email, site: period.site, object_kind: 'energy_instrument', object_ref: reference,
      action: 'retired_against_period', content: { period: body.period, quantity_kwh: Number(inst.quantity_kwh) },
    });
    const all = await q('SELECT * FROM energy_instrument WHERE applied_period = $1', [body.period]);
    const retired = all.reduce((s, x) => s + Number(x.quantity_kwh), 0);
    return {
      status: 201,
      body: {
        reference, period: body.period, quantity_kwh: Number(inst.quantity_kwh),
        vintage: inst.vintage, region: inst.region,
        metered_kwh: Number(period.metered_kwh), retired_kwh: retired,
        unmatched_kwh: Number(period.metered_kwh) - retired,
      },
    };
  });
  return c.json(out.body, out.status);
});

r.get('/balance-periods/:id/energy', async (c) => {
  await requireSession(c);
  const period = (await q('SELECT * FROM balance_period WHERE id = $1', [c.req.param('id')]))[0];
  if (!period) refuse(404, 'not_found', { error: 'not_found', message: 'No such balance period.' });
  const lots = await q('SELECT * FROM lot WHERE site = $1 AND grade = $2 LIMIT 1', [period.site, period.grade]);
  const carbon = lots[0] ? await carbonFor(lots[0].reference) : null;
  const instruments = await q('SELECT * FROM energy_instrument WHERE applied_period = $1', [period.id]);
  const retired = instruments.reduce((s, x) => s + Number(x.quantity_kwh), 0);
  // the two energy figures are returned together, never one alone
  return c.json({
    period: period.id,
    energy_location_mg_per_kg: carbon && !carbon.mismatch ? carbon.energy_location_mg_per_kg : 0,
    energy_market_mg_per_kg: carbon && !carbon.mismatch ? carbon.energy_market_mg_per_kg : 0,
    boundary: carbon && !carbon.mismatch ? carbon.boundary : null,
    method_version: carbon && !carbon.mismatch ? carbon.method_version : null,
    uncertainty_bp: carbon && !carbon.mismatch ? carbon.uncertainty_bp : null,
    metered_kwh: Number(period.metered_kwh),
    retired_kwh: retired,
    unmatched_kwh: Number(period.metered_kwh) - retired,
    retired_instruments: instruments.map((i) => ({
      reference: i.reference, quantity_kwh: Number(i.quantity_kwh), vintage: i.vintage, region: i.region, state: i.state,
    })),
  });
});

export default r;
