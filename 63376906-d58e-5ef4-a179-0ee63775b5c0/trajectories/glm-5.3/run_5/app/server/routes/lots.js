import { Hono } from 'hono';
import { currentSession, hasRole } from '../lib/auth.js';
import { withIdempotency } from '../lib/idempotency.js';
import { appendEntry } from '../lib/record.js';
import { computeContentBp, computeShareBp } from '../lib/units.js';

const r = new Hono();

async function lotView(db, lot) {
  const credits = (await db.query(
    `SELECT * FROM credit_movement WHERE direction='out' AND kind='allocation' AND derivation->>'lot'=$1`,
    [lot.reference])).rows;
  const attached = {};
  for (const m of credits) attached[m.category] = (attached[m.category] || 0) + m.mass_g;
  const attachedTotal = Object.values(attached).reduce((s, v) => s + v, 0);
  const content_bp = computeContentBp(attachedTotal, lot.mass_g);
  const deviations = (await db.query('SELECT * FROM deviation')).rows
    .filter((d) => (d.affects_lots || []).includes(lot.reference));
  const overrides = (await db.query('SELECT * FROM override WHERE lot=$1', [lot.reference])).rows;
  const tests = (await db.query('SELECT * FROM test_result WHERE lot=$1 ORDER BY id', [lot.reference])).rows;
  const flags = [];
  if (deviations.some((d) => d.state === 'open')) flags.push('open_deviation');
  if (overrides.some((o) => !o.reviewed)) flags.push('unreviewed_override');
  if (lot.provisional_factor) flags.push('provisional_factor');
  return {
    reference: lot.reference,
    grade: lot.grade,
    site: lot.site,
    mass_g: lot.mass_g,
    disposition: lot.disposition,
    claim_type: lot.claim_type,
    content_bp,
    credit_attached_g: attachedTotal,
    category_split: attached,
    produced_by_run: lot.produced_by_run,
    provisional_factor: lot.provisional_factor,
    flags,
    deviations: deviations.map((d) => ({ reference: d.reference, state: d.state })),
    overrides: overrides.map((o) => ({
      reference: o.reference, separation: o.separation, reviewed: o.reviewed,
      authorised_by: o.authorised_by, authorised_on: o.authorised_on
    })),
    test_results: tests.map((t) => ({
      property: t.property, method: t.method, value: t.value, unit: t.unit,
      method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release
    }))
  };
}

r.get('/lots', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM lot ORDER BY reference')).rows;
  const out = [];
  for (const lot of rows) out.push(await lotView(db, lot));
  return c.json(out);
});

r.get('/lots/:reference', async (c) => {
  const db = c.get('db');
  const lot = (await db.query('SELECT * FROM lot WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!lot) return c.json({ error: 'not_found' }, 404);
  return c.json(await lotView(db, lot));
});

// Genealogy: graph and text equivalent, complete set.
r.get('/lots/:reference/genealogy', async (c) => {
  const db = c.get('db');
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (c.req.query(p) !== undefined) {
      return Response.json({ error: 'pagination_refused', message: 'This traversal answers the complete set.' }, { status: 400 });
    }
  }
  const { genealogyForLot } = await import('../lib/engine.js');
  const g = await genealogyForLot(db, c.req.param('reference'));
  if (!g) return c.json({ error: 'not_found' }, 404);
  return c.json({ ...g, read_at: new Date().toISOString() });
});

// Yield: plant operations, quality and claims. Refuses a collector and a converter.
r.get('/lots/:reference/yield', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'plant_operator', 'quality_manager', 'claims_manager', 'auditor', 'lab_analyst')) {
    return Response.json({ error: 'forbidden', reason: 'yield_not_for_this_reader' }, { status: 403 });
  }
  const lot = (await db.query('SELECT * FROM lot WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!lot) return c.json({ error: 'not_found' }, 404);
  const run = (await db.query('SELECT * FROM run WHERE reference=$1', [lot.produced_by_run])).rows[0];
  const consumptions = (await db.query('SELECT * FROM consumption WHERE run=$1', [run.reference])).rows;
  const outputs = (await db.query('SELECT * FROM output WHERE run=$1', [run.reference])).rows;
  const massIn = consumptions.reduce((s2, c2) => s2 + c2.mass_g, 0);
  const massOut = outputs.reduce((s2, o) => s2 + o.mass_g, 0);
  return c.json({
    lot: lot.reference,
    run: run.reference,
    mass_in_g: massIn,
    mass_out_g: massOut,
    losses_g: run.losses_g,
    yield_bp: computeShareBp(lot.mass_g, massIn),
    derivation: 'lot mass divided by run mass in, floored'
  });
});

// Byproduct shares on the period's allocation basis.
r.get('/lots/:reference/byproduct-shares', async (c) => {
  const db = c.get('db');
  const lot = (await db.query('SELECT * FROM lot WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!lot) return c.json({ error: 'not_found' }, 404);
  const run = (await db.query('SELECT * FROM run WHERE reference=$1', [lot.produced_by_run])).rows[0];
  const outputs = (await db.query('SELECT * FROM output WHERE run=$1', [run.reference])).rows;
  const totalOutput = outputs.reduce((s, o) => s + o.mass_g, 0);
  const view = await lotView(db, lot);
  const carbonFigure = (await db.query(
    'SELECT * FROM carbon_figure WHERE lot=$1 AND superseded=false ORDER BY id DESC LIMIT 1', [lot.reference])).rows[0];
  const shares = outputs.filter((o) => o.kind === 'byproduct' && o.disposition === 'sold').map((o) => {
    const share_bp = computeShareBp(o.mass_g, totalOutput);
    return {
      output: o.reference,
      disposition: o.disposition,
      mass_g: o.mass_g,
      total_output_mass_g: totalOutput,
      share_bp,
      allocation_basis: 'mass',
      claim_share_g: Math.floor(view.credit_attached_g * share_bp / 10000),
      emissions_share_mg: carbonFigure ? Math.floor(carbonFigure.value_mg_per_kg * share_bp / 10000) : null
    };
  });
  return c.json({
    lot: lot.reference, run: run.reference, allocation_basis: 'mass',
    total_output_mass_g: totalOutput, byproducts: shares,
    derivation: 'byproduct mass times 10000 divided by total output mass, floored'
  });
});

// Blending: computed claim, weaker type, both sites named.
r.post('/lots/:reference/blend', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'plant_operator', 'quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    const other = body.lot;
    if (!other) return Response.json({ error: 'invalid_request', message: 'lot (the other lot) is required' }, { status: 400 });
    const a = (await db.query('SELECT * FROM lot WHERE reference=$1', [c.req.param('reference')])).rows[0];
    const b = (await db.query('SELECT * FROM lot WHERE reference=$1', [other])).rows[0];
    if (!a || !b) return Response.json({ error: 'not_found' }, { status: 404 });
    const va = await lotView(db, a);
    const vb = await lotView(db, b);
    const totalMass = a.mass_g + b.mass_g;
    const blended = Math.floor((a.mass_g * va.content_bp + b.mass_g * vb.content_bp) / totalMass);
    const claimRank = { physically_segregated: 3, controlled_blending: 2, mass_balance: 1 };
    const weaker = claimRank[a.claim_type] <= claimRank[b.claim_type] ? a.claim_type : b.claim_type;
    const sites = a.site === b.site ? [a.site] : [a.site, b.site];
    const provisional = a.provisional_factor || b.provisional_factor;
    const count = (await db.query('SELECT count(*)::int AS n FROM lot')).rows[0].n;
    const reference = `LOT-${a.grade}-${String(count + 1).padStart(4, '0')}`;
    await db.query(
      `INSERT INTO lot (reference,grade,site,mass_g,disposition,claim_type,produced_by_run,provisional_factor,recorded_at)
       VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,now())`,
      [reference, a.grade, sites.join('+'), totalMass, weaker, `BLEND:${a.reference}+${b.reference}`, provisional]);
    await appendEntry(db, {
      kind: 'lot_blended', object_ref: reference, person: s.email, site: a.site,
      content: {
        reference, from: [{ lot: a.reference, mass_g: a.mass_g }, { lot: b.reference, mass_g: b.mass_g }],
        blended_content_bp: blended, weaker_claim_type: weaker, sites, provisional_factor_of_weaker: provisional
      }
    });
    return Response.json({
      reference,
      mass_g: totalMass,
      content_bp: blended,
      claim_type: weaker,
      sites,
      provisional_factor: provisional,
      derivation: {
        formula: '(mass_a * content_a + mass_b * content_b) / (mass_a + mass_b), floored',
        inputs: [
          { lot: a.reference, mass_g: a.mass_g, content_bp: va.content_bp },
          { lot: b.reference, mass_g: b.mass_g, content_bp: vb.content_bp }
        ]
      }
    }, { status: 201 });
  });
});

// Disposition: quality manager only, never against their own test result, never
// over an open deviation.
r.post('/lots/:reference/disposition', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted', message: 'Only a quality manager sets a lot disposition.' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const ref = c.req.param('reference');
    const lot = (await db.query('SELECT * FROM lot WHERE reference=$1', [ref])).rows[0];
    if (!lot) return Response.json({ error: 'not_found' }, { status: 404 });
    const body = await c.req.json().catch(() => ({}));
    if (!['pending', 'released', 'quarantined', 'rejected'].includes(body.disposition)) {
      return Response.json({ error: 'invalid_disposition' }, { status: 400 });
    }
    const own = (await db.query('SELECT count(*)::int AS n FROM test_result WHERE lot=$1 AND analyst=$2', [ref, s.email])).rows[0].n;
    if (own > 0) {
      return Response.json({
        error: 'separation_refused',
        separation: 'analyst_not_dispositioner',
        message: 'Whoever entered a test result does not disposition that lot. Record an override if this separation is genuinely broken.'
      }, { status: 403 });
    }
    const open = (await db.query('SELECT * FROM deviation')).rows
      .filter((d) => d.state === 'open' && (d.affects_lots || []).includes(ref));
    if (open.length) {
      return Response.json({
        error: 'open_deviation',
        message: 'A deviation touching this lot is open.',
        deviations: open.map((d) => d.reference)
      }, { status: 409 });
    }
    await db.query('UPDATE lot SET disposition=$1 WHERE reference=$2', [body.disposition, ref]);
    await appendEntry(db, {
      kind: 'disposition_set', object_ref: ref, person: s.email, site: lot.site,
      content: { lot: ref, disposition: body.disposition }
    });
    const updated = (await db.query('SELECT * FROM lot WHERE reference=$1', [ref])).rows[0];
    return Response.json(await lotView(db, updated), { status: 201 });
  });
});

export default r;
