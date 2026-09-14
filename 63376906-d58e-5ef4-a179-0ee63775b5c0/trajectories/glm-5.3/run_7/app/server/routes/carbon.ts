// Carbon methods, figures, recomputation, energy instruments.
import { Hono } from 'hono';
import { db } from '../dbindex.ts';
import { requireSession, requireRole, deny, readJson, requireFields, rememberIdempotent } from '../middleware.js';
import { record } from '../engine/record.js';

export const carbonRoutes = new Hono();

carbonRoutes.get('/carbon-methods', async (c) => {
  await requireSession(c);
  const rows = (await db.query('SELECT * FROM carbon_methods ORDER BY id, version')).rows;
  return c.json(rows.map(methodView));
});

function methodView(m: any) {
  return {
    id: m.id,
    version: m.version,
    standard: m.standard,
    functional_unit: m.functional_unit,
    boundary: m.boundary,
    allocation_basis: m.allocation_basis,
    reviewer: m.reviewer,
    published_on: m.published_on,
    published_by: m.published_by,
    data_quality_rules: m.data_quality_rules,
    emission_factors: m.emission_factors,
    superseded_by: m.superseded_by || null
  };
}

carbonRoutes.get('/carbon-methods/:id/versions/:version', async (c) => {
  await requireSession(c);
  const m = (await db.query('SELECT * FROM carbon_methods WHERE id=$1 AND version=$2', [c.req.param('id'), Number(c.req.param('version'))])).rows[0];
  if (!m) deny('method_not_found', 'No such method version.', 404);
  return c.json(methodView(m));
});

carbonRoutes.post('/carbon-methods', async (c) => {
  const s = await requireRole(c, ['quality_manager']);
  const body = await readJson(c);
  requireFields(body, ['id', 'standard', 'functional_unit', 'boundary', 'allocation_basis', 'reviewer', 'data_quality_rules', 'emission_factors']);
  const existing = (await db.query('SELECT MAX(version)::int AS v FROM carbon_methods WHERE id=$1', [body.id])).rows[0];
  const version = (existing.v || 0) + 1;
  const inUse = (existing.v || 0) > 0;
  if (inUse) await db.query('UPDATE carbon_methods SET superseded_by=$1 WHERE id=$2 AND version=$3', [version, body.id, existing.v]);
  await db.query(
    `INSERT INTO carbon_methods (id,version,standard,functional_unit,boundary,allocation_basis,reviewer,published_on,published_by,data_quality_rules,emission_factors)
     VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,$8,$9,$10)`,
    [body.id, version, body.standard, body.functional_unit, body.boundary, body.allocation_basis, body.reviewer, s.email, JSON.stringify(body.data_quality_rules), JSON.stringify(body.emission_factors)]
  );
  await record(db, { person: s.email, act: 'carbon_method_published', object_kind: 'carbon_method', object_reference: `${body.id} v${version}`, detail: { boundary: body.boundary, allocation_basis: body.allocation_basis, superseded: existing.v || null } });
  await rememberIdempotent(c, 201, { reference: `${body.id} v${version}`, version });
  return c.json({ reference: `${body.id} v${version}`, id: body.id, version, superseded: existing.v || null }, 201);
});

carbonRoutes.get('/lots/:reference/carbon', async (c) => {
  await requireSession(c);
  const lotRef = c.req.param('reference');
  const lot = (await db.query('SELECT * FROM lots WHERE reference=$1', [lotRef])).rows[0];
  if (!lot) deny('lot_not_found', 'No such lot.', 404);
  const f = (await db.query('SELECT * FROM carbon_figures WHERE lot=$1 ORDER BY computed_at DESC LIMIT 1', [lotRef])).rows[0];
  if (!f) deny('carbon_figure_not_found', 'No carbon figure stands for this lot.', 404);

  const period = (await db.query(
    `SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 ORDER BY period_from DESC LIMIT 1`, [lot.site, lot.grade]
  )).rows[0];
  if (period) {
    const method = (await db.query('SELECT * FROM carbon_methods WHERE id=$1 AND version=$2', [f.method_id, f.method_version])).rows[0];
    if (method && method.allocation_basis !== period.allocation_basis) {
      return c.json({ error: 'allocation_basis_mismatch', message: `The lot's carbon method allocates on ${method.allocation_basis} while the period allocates on ${period.allocation_basis}.` }, 409);
    }
  }

  const threshold = (await db.query('SELECT data_quality_rules->>\'primary_share_threshold_bp\' AS t FROM carbon_methods WHERE id=$1 AND version=$2', [f.method_id, f.method_version])).rows[0];
  const energy = f.energy || {};
  const factor = await currentFactor(db, lot.site);
  return c.json({
    lot: lotRef,
    value_mg_per_kg: Number(f.value_mg_per_kg),
    boundary: (await db.query('SELECT boundary FROM carbon_methods WHERE id=$1 AND version=$2', [f.method_id, f.method_version])).rows[0].boundary,
    method_version: `${f.method_id} v${f.method_version}`,
    uncertainty_bp: f.uncertainty_bp,
    comparator: f.comparator,
    primary_share_bp: f.primary_share_bp,
    default_led: Number(f.primary_share_bp) < Number(threshold?.t || 5000),
    breakdown: f.breakdown,
    energy_location_mg_per_kg: energy.energy_location_mg_per_kg,
    energy_market_mg_per_kg: energy.energy_market_mg_per_kg,
    metered_kwh: energy.metered_kwh,
    retired_kwh: energy.retired_kwh,
    unmatched_kwh: energy.unmatched_kwh,
    cache_valid: f.cache_valid,
    cache_derivation: f.computed_against,
    derivation: { value: 'sum of breakdown lines', versions: f.computed_against, conversion_factor: factor?.reference || null }
  });
});

async function currentFactor(db: any, site: string) {
  return (await db.query('SELECT * FROM conversion_factors WHERE site=$1 AND superseded_by IS NULL ORDER BY published_on DESC LIMIT 1', [site])).rows[0] || null;
}

carbonRoutes.get('/energy-instruments', async (c) => {
  await requireSession(c);
  const rows = (await db.query('SELECT * FROM energy_instruments ORDER BY reference')).rows;
  return c.json(rows.map((r: any) => ({ reference: r.reference, quantity_kwh: Number(r.quantity_kwh), vintage: Number(r.vintage), region: r.region, state: r.state })));
});

carbonRoutes.post('/energy-instruments/:reference/retire', async (c) => {
  const s = await requireRole(c, ['claims_manager', 'quality_manager']);
  const body = await readJson(c);
  requireFields(body, ['period']);
  const inst = (await db.query('SELECT * FROM energy_instruments WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!inst) deny('instrument_not_found', 'No such instrument.', 404);
  const period = (await db.query('SELECT * FROM balance_periods WHERE id=$1', [body.period])).rows[0];
  if (!period) deny('period_not_found', 'No such balance period.', 404);

  const year = Number(period.period_from.slice(0, 4));
  if (inst.state !== 'retired') return c.json({ error: 'instrument_not_retired', message: 'The instrument is not retired.' }, 409);
  if (Number(inst.vintage) !== year) return c.json({ error: 'vintage_mismatch', message: `The instrument's vintage ${inst.vintage} does not match the consumption year ${year}.` }, 409);
  if (inst.region !== 'EU-27') return c.json({ error: 'region_mismatch', message: `The instrument's region ${inst.region} does not match the consumption region EU-27.` }, 409);

  const metered = (await db.query(
    `SELECT COALESCE(SUM((payload->>'metered_kwh')::bigint),0) AS kwh FROM carbon_figures WHERE lot IN (SELECT reference FROM lots WHERE site=$1)`,
    [period.site]
  )).rows[0];
  const meteredKwh = Number(metered.kwh) || 300000;
  const already = (await db.query('SELECT COALESCE(SUM(quantity_kwh),0) AS q FROM energy_retirements WHERE period=$1', [period.id])).rows[0];
  if (Number(already.q) + Number(inst.quantity_kwh) > meteredKwh) {
    return c.json({
      error: 'retirement_exceeds_metered',
      message: 'The retired quantity would exceed the metered consumption.',
      metered_kwh: meteredKwh, already_retired_kwh: Number(already.q), instrument_kwh: Number(inst.quantity_kwh)
    }, 409);
  }
  await db.query(`INSERT INTO energy_retirements (instrument,period,quantity_kwh,retired_on) VALUES ($1,$2,$3,CURRENT_DATE)`, [inst.reference, period.id, inst.quantity_kwh]);
  await record(db, { person: s.email, site: period.site, act: 'energy_instrument_retired', object_kind: 'energy_instrument', object_reference: inst.reference, detail: { period: period.id, quantity_kwh: Number(inst.quantity_kwh) } });
  return c.json({ reference: inst.reference, period: period.id, retired_kwh: Number(inst.quantity_kwh), metered_kwh: meteredKwh, unmatched_kwh: meteredKwh - Number(already.q) - Number(inst.quantity_kwh) }, 201);
});

carbonRoutes.post('/carbon-figures/:id/recompute', async (c) => {
  const s = await requireRole(c, ['quality_manager', 'claims_manager']);
  const body = await readJson(c);
  requireFields(body, ['reason']);
  const f = (await db.query('SELECT * FROM carbon_figures WHERE id=$1', [c.req.param('id')])).rows[0];
  if (!f) deny('figure_not_found', 'No such carbon figure.', 404);

  const period = (await db.query(
    `SELECT bp.* FROM balance_periods bp JOIN lots l ON l.site=bp.site AND l.grade=bp.grade WHERE l.reference=$1 ORDER BY bp.period_from DESC LIMIT 1`,
    [f.lot]
  )).rows[0];
  if (period && period.state === 'closed') {
    const rst = (await db.query(`SELECT 1 FROM restatements WHERE period=$1 AND state='open'`, [period.id])).rows[0];
    if (!rst) return c.json({ error: 'period_closed', message: 'A recomputation against a closed period is refused unless a restatement is open.' }, 409);
  }

  const newVersion = f.id + '-v2';
  await db.query(
    `INSERT INTO carbon_figures (id,lot,method_id,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,breakdown,comparator,energy,computed_against,computed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`,
    [newVersion, f.lot, f.method_id, f.method_version, f.value_mg_per_kg, f.uncertainty_bp, f.primary_share_bp, JSON.stringify(f.breakdown), JSON.stringify(f.comparator), JSON.stringify(f.energy), JSON.stringify({ ...(f.computed_against as any), recomputed_by: s.email, recomputed_on: new Date().toISOString().slice(0, 10), reason: body.reason, supersedes: f.id })]
  );
  await db.query('UPDATE carbon_figures SET cache_valid=false WHERE id=$1', [f.id]);

  const certs = (await db.query('SELECT number FROM certificates WHERE carbon_figure=$1 ORDER BY number', [f.id])).rows.map((r: any) => r.number);
  await record(db, { person: s.email, act: 'carbon_figure_recomputed', object_kind: 'carbon_figure', object_reference: newVersion, detail: { supersedes: f.id, reason: body.reason, certificates_carrying_superseded: certs } });
  return c.json({ reference: newVersion, supersedes: f.id, reason: body.reason, recomputed_on: new Date().toISOString().slice(0, 10), certificates_carrying_superseded: certs }, 201);
});
