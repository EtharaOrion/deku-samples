import { Hono } from 'hono';
import { currentSession, hasRole } from '../lib/auth.js';
import { withIdempotency } from '../lib/idempotency.js';
import { appendEntry } from '../lib/record.js';

const r = new Hono();

function methodView(m) {
  return {
    reference: m.reference,
    version: m.version,
    standard: m.standard,
    functional_unit: m.functional_unit,
    boundary: m.boundary,
    allocation_basis: m.allocation_basis,
    reviewer: m.reviewer,
    published_on: m.published_on,
    data_quality: m.data_quality,
    emission_factors: m.emission_factors,
    primary_share_threshold_bp: m.primary_share_threshold_bp,
    superseded: m.superseded
  };
}

r.get('/carbon-methods', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM carbon_method WHERE reference != \'RCP-RECIPE\' ORDER BY reference, version')).rows;
  return c.json(rows.map(methodView));
});

r.get('/carbon-methods/:id/versions/:version', async (c) => {
  const db = c.get('db');
  const m = (await db.query('SELECT * FROM carbon_method WHERE reference=$1 AND version=$2',
    [c.req.param('id'), Number(c.req.param('version'))])).rows[0];
  if (!m) return c.json({ error: 'not_found' }, 404);
  return c.json(methodView(m));
});

// Publishing a version is refused for anybody but a quality manager.
r.post('/carbon-methods/:id/versions', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted', message: 'Only a quality manager publishes a carbon method version.' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    const id = c.req.param('id');
    const latest = (await db.query(
      'SELECT * FROM carbon_method WHERE reference=$1 ORDER BY version DESC LIMIT 1', [id])).rows[0];
    const version = latest ? latest.version + 1 : 1;
    // The version in force is superseded by publication, never overwritten.
    if (latest) {
      const figures = await db.query('SELECT count(*)::int AS n FROM carbon_figure WHERE method=$1 AND method_version=$2', [id, latest.version]);
      void figures;
      await db.query('UPDATE carbon_method SET superseded=true WHERE reference=$1 AND version=$2', [id, latest.version]);
    }
    const ins = await db.query(
      `INSERT INTO carbon_method (reference,version,standard,functional_unit,boundary,allocation_basis,reviewer,published_on,data_quality,emission_factors,primary_share_threshold_bp,superseded,published_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,$12) RETURNING version`,
      [id, version, body.standard || (latest ? latest.standard : 'ISO 14067'),
        body.functional_unit || (latest ? latest.functional_unit : '1 kg of pellet'),
        body.boundary || (latest ? latest.boundary : 'cradle-to-gate'),
        body.allocation_basis || (latest ? latest.allocation_basis : 'mass'),
        body.reviewer || (latest ? latest.reviewer : s.name),
        body.published_on || new Date().toISOString().slice(0, 10),
        JSON.stringify(body.data_quality || (latest ? latest.data_quality : {})),
        JSON.stringify(body.emission_factors || (latest ? latest.emission_factors : [])),
        Number.isInteger(body.primary_share_threshold_bp) ? body.primary_share_threshold_bp : 5000,
        s.email]);
    await appendEntry(db, {
      kind: 'carbon_method_published', object_ref: `${id}:${ins.rows[0].version}`, person: s.email, site: null,
      content: { reference: id, version: ins.rows[0].version, supersedes: latest ? latest.version : null }
    });
    return Response.json({ reference: id, version: ins.rows[0].version }, { status: 201 });
  });
});

function figureView(f, { internal = true } = {}) {
  const out = {
    lot: f.lot,
    value_mg_per_kg: f.value_mg_per_kg,
    boundary: f.boundary || 'cradle-to-gate',
    method_version: `${f.method} version ${f.method_version}`,
    uncertainty_bp: f.uncertainty_bp,
    comparator: f.comparator,
    primary_share_bp: f.primary_share_bp,
    default_led: f.primary_share_bp < 5000,
    cache_valid: f.cache_valid,
    figure_version: f.figure_version,
    energy_location_mg_per_kg: f.energy_location_mg_per_kg,
    energy_market_mg_per_kg: f.energy_market_mg_per_kg,
    metered_kwh: f.metered_kwh,
    retired_kwh: f.retired_kwh,
    unmatched_kwh: f.unmatched_kwh
  };
  if (internal) out.breakdown = f.breakdown;
  return out;
}

r.get('/lots/:reference/carbon', async (c) => {
  const db = c.get('db');
  const lot = (await db.query('SELECT * FROM lot WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!lot) return c.json({ error: 'not_found' }, 404);
  const f = (await db.query(
    'SELECT * FROM carbon_figure WHERE lot=$1 AND superseded=false ORDER BY id DESC LIMIT 1', [lot.reference])).rows[0];
  if (!f) return c.json({ error: 'no_carbon_figure' }, 404);
  const method = (await db.query('SELECT * FROM carbon_method WHERE reference=$1 AND version=$2', [f.method, f.method_version])).rows[0];
  // The allocation basis is held once per period and applies to both.
  const period = (await db.query(
    'SELECT * FROM balance_period WHERE site=$1 AND grade=$2 AND state=\'open\' ORDER BY period_start DESC LIMIT 1',
    [lot.site, lot.grade])).rows[0];
  if (method && period && method.allocation_basis !== period.allocation_basis) {
    return Response.json({
      error: 'allocation_basis_mismatch',
      message: 'The period and the carbon method disagree on the allocation basis.',
      period_basis: period.allocation_basis,
      method_basis: method.allocation_basis
    }, { status: 409 });
  }
  const s = await currentSession(c);
  const internal = !s ? false : true;
  const view = figureView(f, { internal });
  view.input_versions = f.input_versions;
  return c.json(view);
});

r.post('/carbon-figures/:id/recompute', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'quality_manager', 'claims_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const id = Number(c.req.param('id'));
    const f = (await db.query('SELECT * FROM carbon_figure WHERE id=$1', [id])).rows[0];
    if (!f) return Response.json({ error: 'not_found' }, { status: 404 });
    const lot = (await db.query('SELECT * FROM lot WHERE reference=$1', [f.lot])).rows[0];
    const period = (await db.query(
      'SELECT * FROM balance_period WHERE site=$1 AND grade=$2 ORDER BY period_start DESC LIMIT 1',
      [lot.site, lot.grade])).rows[0];
    if (period && period.state === 'closed') {
      const open = await db.query("SELECT * FROM restatement WHERE period=$1 AND state='open'", [period.id]);
      if (!open.rows.length) {
        return Response.json({
          error: 'period_closed',
          message: 'A recomputation against a closed period is refused unless a restatement is open.'
        }, { status: 409 });
      }
    }
    const body = await c.req.json().catch(() => ({}));
    const newVersion = f.figure_version + 1;
    await db.query('UPDATE carbon_figure SET superseded=true WHERE id=$1', [id]);
    const ins = await db.query(
      `INSERT INTO carbon_figure (lot,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,comparator,breakdown,
        energy_location_mg_per_kg,energy_market_mg_per_kg,metered_kwh,retired_kwh,unmatched_kwh,figure_version,cache_valid,input_versions,
        recomputed_by,recomputed_on,recompute_reason,superseded,computed_at)
       SELECT lot,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,comparator,breakdown,
        energy_location_mg_per_kg,energy_market_mg_per_kg,metered_kwh,retired_kwh,unmatched_kwh,$1,true,input_versions,
        $2,$3,$4,false,now() FROM carbon_figure WHERE id=$5 RETURNING id`,
      [newVersion, s.email, new Date().toISOString().slice(0, 10), body.reason || '', id]);
    const certs = (await db.query('SELECT number FROM certificate WHERE carbon->>\'method\'=$1', [f.method])).rows;
    await appendEntry(db, {
      kind: 'carbon_figure_recomputed', object_ref: `${f.lot}:v${newVersion}`, person: s.email, site: lot.site,
      content: { figure: id, new_figure_id: ins.rows[0].id, lot: f.lot, reason: body.reason || '', certificates_with_superseded_figure: certs.map((x) => x.number) }
    });
    return Response.json({
      figure_id: ins.rows[0].id,
      figure_version: newVersion,
      certificates_with_superseded_figure: certs.map((x) => x.number),
      recomputed_by: s.email,
      recomputed_on: new Date().toISOString().slice(0, 10)
    }, { status: 201 });
  });
});

r.get('/energy-instruments', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM energy_instrument ORDER BY reference')).rows;
  return c.json(rows.map((e) => ({
    reference: e.reference, quantity_kwh: e.quantity_kwh, vintage: e.vintage, region: e.region,
    state: e.state, applied_period: e.applied_period, retired_on: e.retired_on
  })));
});

// Retiring an instrument against a period: state, vintage, region and quantity.
r.post('/energy-instruments/:reference/retire', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'claims_manager', 'quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    const e = (await db.query('SELECT * FROM energy_instrument WHERE reference=$1', [c.req.param('reference')])).rows[0];
    if (!e) return Response.json({ error: 'not_found' }, { status: 404 });
    if (!body.period) return Response.json({ error: 'invalid_request', message: 'period is required' }, { status: 400 });
    const p = (await db.query('SELECT * FROM balance_period WHERE id=$1', [body.period])).rows[0];
    if (!p) return Response.json({ error: 'unknown_period' }, { status: 400 });
    if (e.state !== 'retired') {
      return Response.json({
        error: 'instrument_not_retired',
        message: 'The instrument is held rather than retired.'
      }, { status: 409 });
    }
    if (Number(body.vintage) !== e.vintage) {
      return Response.json({
        error: 'vintage_mismatch',
        message: `The instrument's vintage ${e.vintage} does not match the consumption.`
      }, { status: 409 });
    }
    if (body.region && body.region !== e.region) {
      return Response.json({ error: 'region_mismatch', message: `The instrument's region ${e.region} does not match the consumption.` }, { status: 409 });
    }
    const metered = 300000;
    const already = (await db.query(
      'SELECT coalesce(sum(quantity_kwh),0)::int AS k FROM energy_instrument WHERE applied_period=$1', [body.period])).rows[0].k;
    if (already + e.quantity_kwh > metered) {
      return Response.json({
        error: 'retired_quantity_exceeds_metered',
        message: 'The retired quantity would exceed the metered consumption.',
        metered_kwh: metered, already_retired_kwh: already, instrument_kwh: e.quantity_kwh
      }, { status: 409 });
    }
    await db.query('UPDATE energy_instrument SET applied_period=$1 WHERE reference=$2', [body.period, e.reference]);
    await appendEntry(db, {
      kind: 'energy_instrument_retired', object_ref: e.reference, person: s.email, site: p.site,
      content: { reference: e.reference, quantity_kwh: e.quantity_kwh, applied_period: body.period }
    });
    return Response.json({
      reference: e.reference,
      applied_period: body.period,
      metered_kwh: metered,
      retired_kwh: already + e.quantity_kwh,
      unmatched_kwh: metered - already - e.quantity_kwh
    }, { status: 201 });
  });
});

export default r;
