import { Hono } from 'hono';
import { q, one, pool } from '../lib/db.js';
import { refuse, noPaging, withIdempotency, nextRef } from '../lib/http.js';
import { requireSession, requireRole } from './middleware.js';
import { appendEntry } from '../lib/record.js';
import { requireInt, dayOf } from '../lib/num.js';
import { carbonForLot } from '../engine/carbon.js';

const r = new Hono();

r.get('/carbon-methods', async (c) => {
  noPaging(c);
  requireSession(c);
  const methods = await q('select * from carbon_method order by id');
  const versions = await q('select * from carbon_method_version order by id, version');
  return c.json(
    methods.map((m) => ({
      id: m.id,
      name: m.name,
      standard: m.standard,
      functional_unit: m.functional_unit,
      versions: versions
        .filter((v) => v.id === m.id)
        .map((v) => ({
          version: v.version,
          boundary: v.boundary,
          allocation_basis: v.allocation_basis,
          reviewer: v.reviewer,
          published_on: dayOf(v.published_on),
          published_by: v.published_by,
          data_quality_rules: v.data_quality_rules,
          emission_factors: v.emission_factors,
          primary_threshold_bp: v.primary_threshold_bp,
          superseded: v.superseded,
        })),
    })),
  );
});

r.get('/carbon-methods/:id/versions/:version', async (c) => {
  requireSession(c);
  const m = await one('select * from carbon_method where id = $1', [c.req.param('id')]);
  const v = await one('select * from carbon_method_version where id = $1 and version = $2', [c.req.param('id'), Number(c.req.param('version'))]);
  if (!m || !v) throw refuse(404, 'not_found', 'No such carbon method version.');
  return c.json({
    id: m.id,
    version: v.version,
    standard: m.standard,
    functional_unit: m.functional_unit,
    boundary: v.boundary,
    allocation_basis: v.allocation_basis,
    reviewer: v.reviewer,
    published_on: dayOf(v.published_on),
    published_by: v.published_by,
    data_quality_rules: v.data_quality_rules,
    emission_factors: v.emission_factors,
    primary_threshold_bp: v.primary_threshold_bp,
    superseded: v.superseded,
    immutable: true,
    note: 'A method version is immutable once a figure has been computed against it, and a new version supersedes rather than overwrites.',
  });
});

r.post('/carbon-methods/:id/versions', async (c) => {
  const s = await requireRole(c, 'carbon_method_version_published', 'quality_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /carbon-methods/${id}/versions`, body, async () => {
    const { boundary, allocation_basis, reviewer, data_quality_rules = {}, emission_factors = [], primary_threshold_bp = 5000 } = body;
    if (!boundary || !allocation_basis || !reviewer) throw refuse(400, 'fields_required', 'A method version names its boundary, its allocation basis and its reviewer.');
    const m = await one('select * from carbon_method where id = $1', [id]);
    if (!m) throw refuse(404, 'not_found', 'No such carbon method.');
    const prev = await one('select * from carbon_method_version where id = $1 order by version desc limit 1', [id]);
    const version = prev ? prev.version + 1 : 1;
    await pool.query('insert into carbon_method_version (id, version, boundary, allocation_basis, reviewer, published_on, published_by, data_quality_rules, emission_factors, primary_threshold_bp) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [id, version, boundary, allocation_basis, reviewer, new Date().toISOString().slice(0, 10), s.email, JSON.stringify(data_quality_rules), JSON.stringify(emission_factors), primary_threshold_bp]);
    if (prev) await pool.query('update carbon_method_version set superseded = true where id = $1 and version = $2', [id, prev.version]);
    // A cached figure whose emission factor is superseded answers cache_valid
    // false from that moment and is not silently recomputed.
    if (prev) await pool.query('update carbon_figure set cache_valid = false where method_id = $1 and method_version = $2', [id, prev.version]);
    await appendEntry(null, { act: 'carbon_method_version_published', person: s.email, person_id: s.person_id, object_kind: 'carbon_method_version', object_ref: `${id} v${version}`, content: { boundary, allocation_basis, reviewer, supersedes: prev ? prev.version : null, note: 'A computation in flight completes under the version it started with; the new version applies from the next computation.' } });
    return { status: 201, body: { reference: `${id} v${version}`, id, version, boundary, allocation_basis, reviewer, supersedes: prev ? prev.version : null, note: 'A computation in flight completes under the version it started with and records that version; the new version applies from the next computation.' } };
  });
  return c.json(out.body, out.status);
});

r.get('/lots/:reference/carbon', async (c) => {
  noPaging(c);
  requireSession(c);
  const fig = await carbonForLot(c.req.param('reference'), { internal: true });
  if (!fig) throw refuse(404, 'not_found', 'No carbon figure exists for this lot.');
  return c.json(fig);
});

r.get('/carbon-figures', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from carbon_figure order by id');
  return c.json(rows.map((x) => ({ id: x.id, lot: x.lot, version: x.version, method_version: `${x.method_id} v${x.method_version}`, boundary: x.boundary, value_mg_per_kg: Number(x.value_mg_per_kg), uncertainty_bp: x.uncertainty_bp, primary_share_bp: x.primary_share_bp, cache_valid: x.cache_valid, superseded_by: x.superseded_by, reproducible: x.reproducible, computed_at: x.computed_at, input_versions: x.input_versions })));
});

r.post('/carbon-figures/:id/recompute', async (c) => {
  const s = await requireRole(c, 'carbon_figure_recomputed', 'quality_manager', 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /carbon-figures/${id}/recompute`, body, async () => {
    const fig = await one('select * from carbon_figure where id = $1', [id]);
    if (!fig) throw refuse(404, 'not_found', 'No such carbon figure.');
    const { reason } = body;
    if (!reason) throw refuse(400, 'reason_required', 'A recomputation records a person, a date and a reason. A figure is never silently recomputed.');
    const lot = await one('select * from lot where reference = $1', [fig.lot]);
    const period = lot ? await one('select * from balance_period where site = $1 and grade = $2 and period_from <= $3 and period_to >= $3', [lot.site, lot.grade, lot.produced_on]) : null;
    if (period && period.state === 'closed') {
      const open = await one("select * from restatement where period = $1 and state = 'open'", [period.id]);
      if (!open) throw refuse(409, 'period_closed', 'A recomputation against a closed period is refused unless a restatement is open.', { period: period.id });
    }
    const mv = await one('select * from carbon_method_version where id = $1 and superseded = false order by version desc limit 1', [fig.method_id]);
    const newId = await nextRef('CFG-', 'carbon_figure', 'id');
    const breakdown = fig.breakdown || [];
    const value = breakdown.reduce((x, y) => x + Number(y.mg_per_kg), 0);
    await pool.query(
      'insert into carbon_figure (id, lot, version, method_id, method_version, boundary, value_mg_per_kg, uncertainty_bp, primary_share_bp, comparator, breakdown, energy_location_mg_per_kg, energy_market_mg_per_kg, metered_kwh, input_versions, computed_by, reason) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',
      [newId, fig.lot, fig.version + 1, fig.method_id, mv ? mv.version : fig.method_version, mv ? mv.boundary : fig.boundary, value, fig.uncertainty_bp, fig.primary_share_bp, JSON.stringify(fig.comparator), JSON.stringify(breakdown), fig.energy_location_mg_per_kg, fig.energy_market_mg_per_kg, fig.metered_kwh, JSON.stringify({ ...(fig.input_versions || {}), carbon_method: `${fig.method_id} v${mv ? mv.version : fig.method_version}` }), s.email, reason],
    );
    await pool.query('update carbon_figure set superseded_by = $1 where id = $2', [newId, id]);
    const certs = await q('select * from certificate order by number', []);
    const carrying = certs.filter((x) => (x.input_versions || {}).carbon_figure === id);
    await appendEntry(null, { act: 'carbon_figure_recomputed', person: s.email, person_id: s.person_id, site: lot ? lot.site : null, object_kind: 'carbon_figure', object_ref: newId, content: { supersedes: id, reason, certificates: carrying.map((x) => x.number) } });
    return {
      status: 201,
      body: {
        reference: newId,
        supersedes: id,
        lot: fig.lot,
        version: fig.version + 1,
        value_mg_per_kg: value,
        boundary: mv ? mv.boundary : fig.boundary,
        method_version: `${fig.method_id} v${mv ? mv.version : fig.method_version}`,
        uncertainty_bp: fig.uncertainty_bp,
        recomputed_by: s.email,
        recomputed_on: new Date().toISOString().slice(0, 10),
        reason,
        certificates_carrying_superseded_figure: carrying.map((x) => ({ number: x.number, version: x.version, recipient: x.recipient, state: x.state })),
        complete: true,
      },
    };
  });
  return c.json(out.body, out.status);
});

r.get('/energy-instruments', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from energy_instrument order by reference');
  return c.json(rows.map((x) => ({ reference: x.reference, quantity_kwh: Number(x.quantity_kwh), vintage: x.vintage, region: x.region, state: x.state, applied_to: x.applied_to, applied_at: x.applied_at })));
});

r.post('/energy-instruments/:reference/retire', async (c) => {
  const s = await requireRole(c, 'energy_instrument_applied', 'claims_manager', 'quality_manager');
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /energy-instruments/${reference}/retire`, body, async () => {
    const inst = await one('select * from energy_instrument where reference = $1', [reference]);
    if (!inst) throw refuse(404, 'not_found', 'No such energy instrument.');
    const { period: periodId, region = null, vintage = null } = body;
    const period = await one('select * from balance_period where id = $1', [periodId]);
    if (!period) throw refuse(404, 'period_not_found', 'No such balance period.');
    const refusals = [];
    if (inst.state !== 'retired') refusals.push({ reason: 'instrument_not_retired', detail: `The instrument's state is '${inst.state}' rather than 'retired'.` });
    const consumptionYear = Number(String(period.period_from).slice(0, 4));
    if (inst.vintage !== (vintage ?? consumptionYear)) refusals.push({ reason: 'vintage_mismatch', detail: `The instrument's vintage is ${inst.vintage} and the consumption falls in ${vintage ?? consumptionYear}.` });
    if (region && inst.region !== region) refusals.push({ reason: 'region_mismatch', detail: `The instrument's region is ${inst.region} and the consumption is in ${region}.` });
    const applied = await q("select * from energy_instrument where applied_to = $1 and state = 'retired'", [periodId]);
    const already = applied.filter((x) => x.reference !== reference).reduce((x, y) => x + Number(y.quantity_kwh), 0);
    if (already + Number(inst.quantity_kwh) > Number(period.metered_kwh)) refusals.push({ reason: 'exceeds_metered_consumption', detail: `${already + Number(inst.quantity_kwh)} kWh retired against ${Number(period.metered_kwh)} kWh metered.` });
    if (refusals.length) throw refuse(409, 'retirement_refused', refusals.map((x) => x.detail).join(' '), { refusals });
    await pool.query('update energy_instrument set applied_to = $1, applied_at = $2 where reference = $3', [periodId, new Date().toISOString(), reference]);
    await appendEntry(null, { act: 'energy_instrument_applied', person: s.email, person_id: s.person_id, site: period.site, object_kind: 'energy_instrument', object_ref: reference, content: { period: periodId, quantity_kwh: Number(inst.quantity_kwh) } });
    const totalRetired = already + Number(inst.quantity_kwh);
    return { status: 200, body: { reference, period: periodId, quantity_kwh: Number(inst.quantity_kwh), vintage: inst.vintage, region: inst.region, state: inst.state, metered_kwh: Number(period.metered_kwh), retired_kwh: totalRetired, unmatched_kwh: Number(period.metered_kwh) - totalRetired } };
  });
  return c.json(out.body, out.status);
});

export default r;
