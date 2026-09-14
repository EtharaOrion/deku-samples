import { Hono } from 'hono';
import { q, one, client } from '../db.js';
import { requireAuth, requireRole, bad, notFound, conflict, forbidden, reqField, intField, enumField, rememberIdempotency, refusePagination } from '../lib/http.js';
import { entry } from '../record.js';
import { byproductShareBp, floorMulDiv } from '../engine/int.js';

const r = new Hono();
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

r.get('/api/carbon-methods', async (c) => {
  refusePagination(c);
  await requireAuth(c);
  const rows = await q('SELECT * FROM carbon_methods ORDER BY id, version');
  return c.json(rows.map(serializeMethod));
});

r.get('/api/carbon-methods/:id/versions/:version', async (c) => {
  await requireAuth(c);
  const m = await one('SELECT * FROM carbon_methods WHERE id = $1 AND version = $2', [c.req.param('id'), Number(c.req.param('version'))]);
  if (!m) throw notFound('carbon_method_not_found');
  return c.json(serializeMethod(m));
});

function serializeMethod(m) {
  return {
    id: m.id, version: m.version, standard: m.standard, functional_unit: m.functional_unit,
    boundary: m.boundary, allocation_basis: m.allocation_basis, reviewer: m.reviewer,
    published_on: isoD(m.published_on), superseded: m.superseded,
    primary_share_threshold_bp: m.primary_share_threshold_bp,
    data_quality: m.data_quality,
    emission_factors: m.emission_factors.map(f => ({ ...f, source: f.source, year: f.year }))
  };
}

// Publishing is refused for anybody but a quality manager. Supersede, never overwrite.
r.post('/api/carbon-methods', async (c) => {
  const user = await requireRole(c, 'quality_manager');
  const b = await c.req.json();
  const id = reqField(b.id, 'id');
  const existing = await q('SELECT version FROM carbon_methods WHERE id=$1', [id]);
  const version = existing.length ? Math.max(...existing.map(x => x.version)) + 1 : 1;
  const tx = await client();
  try {
    await tx.query('BEGIN');
    if (existing.length) {
      const used = await one(`SELECT 1 FROM carbon_figures WHERE method_version = ANY($1) LIMIT 1`, [[Math.max(...existing.map(x => x.version))]], tx);
      if (used) await tx.query(`UPDATE carbon_methods SET superseded = true WHERE id=$1`, [id]);
    }
    const row = await one(`INSERT INTO carbon_methods (id, version, standard, functional_unit, boundary, allocation_basis, reviewer, published_on, primary_share_threshold_bp, data_quality, emission_factors)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [id, version, reqField(b.standard, 'standard'), reqField(b.functional_unit, 'functional_unit'),
       reqField(b.boundary, 'boundary'), reqField(b.allocation_basis, 'allocation_basis'),
       user.email, isoD(new Date()), intField(b.primary_share_threshold_bp ?? 5000, 'primary_share_threshold_bp'),
       JSON.stringify(b.data_quality || {}), JSON.stringify(b.emission_factors || [])], tx);
    const e = await entry(tx, { person: user.email, site: null, object: id, act: 'carbon_method_version_published',
      content: { id, version, standard: b.standard, boundary: b.boundary, superseded_versions: existing.length } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: id, version, record_seq: e.seq });
    return c.json({ ...serializeMethod(row), record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

// No route returns a carbon value without boundary, method version and uncertainty.
r.get('/api/lots/:ref/carbon', async (c) => {
  await requireAuth(c);
  const l = await one('SELECT * FROM lots WHERE reference = $1', [c.req.param('ref')]);
  if (!l) throw notFound('lot_not_found');
  const f = await one(`SELECT * FROM carbon_figures WHERE lot=$1 AND superseded=false ORDER BY version DESC LIMIT 1`, [l.reference]);
  if (!f) throw notFound('carbon_figure_not_found');
  const method = await one('SELECT * FROM carbon_methods WHERE id=$1 AND version=$2', ['CM-PA6', f.method_version]);
  const period = await one(`SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 AND state='closed' ORDER BY period_to DESC LIMIT 1`, [l.site, l.grade]);
  const openPeriod = await one(`SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 AND state='open' ORDER BY period_from DESC LIMIT 1`, [l.site, l.grade]);
  if (period && method && period.allocation_basis !== method.allocation_basis) {
    throw conflict('allocation_basis_mismatch', { ledger_basis: period.allocation_basis, method_basis: method.allocation_basis });
  }
  return c.json(serializeFigure(f, method));
});

function serializeFigure(f, method) {
  const value = Number(f.value_mg_per_kg);
  return {
    lot: f.lot, version: f.version,
    value_mg_per_kg: value,
    boundary: f.boundary,
    method_version: `${method ? method.id : 'CM-PA6'} v${f.method_version}`,
    uncertainty_bp: f.uncertainty_bp,
    primary_share_bp: f.primary_share_bp,
    default_led: f.primary_share_bp < (method?.primary_share_threshold_bp ?? 5000),
    comparator: f.comparator,
    breakdown: f.breakdown,
    energy: f.energy,
    energy_location_mg_per_kg: f.energy_location_mg_per_kg === null ? null : Number(f.energy_location_mg_per_kg),
    energy_market_mg_per_kg: f.energy_market_mg_per_kg === null ? null : Number(f.energy_market_mg_per_kg),
    cache_valid: f.cache_valid,
    input_versions: f.input_versions,
    versions: f.version_inputs,
    computed_on: isoD(f.computed_on), computed_by: f.computed_by,
    derivation: { breakdown_sums_to_value: f.breakdown.reduce((s, x) => s + Number(x.mg_per_kg), 0) === value }
  };
}

r.get('/api/carbon-figures/:id/recompute', async (c) => {
  await requireAuth(c);
  throw bad('use_post');
});

// A recomputation is a recorded act. Against a closed period it is refused unless a restatement is open.
r.post('/api/carbon-figures/:id/recompute', async (c) => {
  const user = await requireRole(c, 'quality_manager');
  const f = await one('SELECT * FROM carbon_figures WHERE id = $1', [Number(c.req.param('id'))]);
  if (!f) throw notFound('carbon_figure_not_found');
  const b = await c.req.json().catch(() => ({}));
  const reason = reqField(b.reason, 'reason');
  const l = await one('SELECT * FROM lots WHERE reference=$1', [f.lot]);
  const period = await one(`SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 ORDER BY period_from DESC LIMIT 1`, [l.site, l.grade]);
  if (period?.state === 'closed') {
    const rst = await one(`SELECT * FROM restatements WHERE balance_period=$1 AND state='open'`, [period.id]);
    if (!rst) throw conflict('recompute_refused_closed_period', { period: period.id, remedy: 'open a restatement first' });
  }
  const version = Number((await one(`SELECT coalesce(max(version),0) v FROM carbon_figures WHERE lot=$1`, [f.lot])).v) + 1;
  const affected = await q(`SELECT number, version, content_bp FROM certificates WHERE lots @> $2::jsonb ORDER BY number`,
    [f.lot, JSON.stringify([{ lot: f.lot }])]);
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`UPDATE carbon_figures SET superseded=true WHERE id=$1`, [f.id]);
    const row = await one(`INSERT INTO carbon_figures (lot, version, value_mg_per_kg, boundary, method_version, uncertainty_bp, primary_share_bp, breakdown, comparator, energy_location_mg_per_kg, energy_market_mg_per_kg, energy, computed_on, computed_by, input_versions, version_inputs)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [f.lot, version, f.value_mg_per_kg, f.boundary, f.method_version, f.uncertainty_bp, f.primary_share_bp,
       JSON.stringify(f.breakdown), JSON.stringify(f.comparator), f.energy_location_mg_per_kg, f.energy_market_mg_per_kg,
       JSON.stringify(f.energy), isoD(new Date()), user.email, JSON.stringify(f.input_versions), JSON.stringify(f.version_inputs)], tx);
    const e = await entry(tx, { person: user.email, site: l.site, object: f.lot, act: 'carbon_figure_recomputed',
      content: { superseded_figure_id: f.id, new_figure_id: Number(row.id), lot: f.lot, version, reason, certificates_carrying_superseded_figure: affected.map(x => x.number) } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: `CF-${Number(row.id)}`, lot: f.lot, version,
      certificates_carrying_superseded_figure: affected.map(x => x.number), record_seq: e.seq });
    return c.json({ reference: `CF-${Number(row.id)}`, lot: f.lot, version, reason,
      certificates_carrying_superseded_figure: affected.map(x => ({ number: x.number, version: x.version })), record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

// Energy instruments: refused when held, when vintage or region mismatch, or when retired exceeds metered.
r.post('/api/energy-instruments/:ref/retire', async (c) => {
  const user = await requireRole(c, 'quality_manager', 'claims_manager');
  const inst = await one('SELECT * FROM energy_instruments WHERE reference = $1', [c.req.param('ref')]);
  if (!inst) throw notFound('instrument_not_found');
  const b = await c.req.json();
  const periodId = reqField(b.period, 'period');
  const period = await one('SELECT * FROM balance_periods WHERE id=$1', [periodId]);
  if (!period) throw notFound('period_not_found');
  if (inst.state !== 'retired') throw conflict('instrument_not_retired', { state: inst.state });
  if (Number(inst.vintage) !== Number(b.vintage ?? inst.vintage)) throw conflict('vintage_mismatch', { instrument_vintage: inst.vintage, consumption_vintage: b.vintage });
  if (inst.region !== (b.region ?? inst.region)) throw conflict('region_mismatch', { instrument_region: inst.region, consumption_region: b.region });
  const metered = Number(b.metered_kwh ?? 300000);
  const already = Number((await one(`SELECT coalesce(sum(retired_kwh),0)::bigint m FROM energy_retirements WHERE balance_period=$1`, [period.id])).m);
  if (already + Number(inst.quantity_kwh) > metered) {
    throw conflict('retirement_exceeds_metered', { metered_kwh: metered, already_retired_kwh: already, instrument_kwh: Number(inst.quantity_kwh) });
  }
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO energy_retirements (instrument, balance_period, retired_kwh, retired_on) VALUES ($1,$2,$3,$4)`,
      [inst.reference, period.id, Number(inst.quantity_kwh), isoD(new Date())]);
    const e = await entry(tx, { person: user.email, site: period.site, object: inst.reference, act: 'energy_instrument_retired',
      content: { instrument: inst.reference, period: period.id, retired_kwh: Number(inst.quantity_kwh), metered_kwh: metered, unmatched_kwh: metered - already - Number(inst.quantity_kwh) } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: inst.reference, retired_kwh: Number(inst.quantity_kwh),
      metered_kwh: metered, retired_total_kwh: already + Number(inst.quantity_kwh), unmatched_kwh: metered - already - Number(inst.quantity_kwh), record_seq: e.seq });
    return c.json({ reference: inst.reference, retired_kwh: Number(inst.quantity_kwh), metered_kwh: metered,
      retired_kwh_total: already + Number(inst.quantity_kwh), unmatched_kwh: metered - already - Number(inst.quantity_kwh), record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

export default r;
