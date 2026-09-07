import { Hono } from 'hono';
import { q, pool } from '../lib/db.js';
import {
  requireSession, requireAct, withIdempotency, refuse, refusePagination,
  requireFields, requireIntegers, rejectComputedInputs, nextReference, today,
} from '../lib/http.js';
import { appendEntry } from '../lib/records.js';
import { genealogyOf } from '../engine/genealogy.js';
import { lotClaim } from '../engine/ledger.js';
import { carbonFor } from '../engine/carbon.js';
import { blendedContentBp, floorDiv, contentBp } from '../engine/arithmetic.js';
import { iso, batchView } from '../engine/feedstock.js';

const r = new Hono();

async function lotView(lot) {
  const [claim, overrides, deviations, tests] = await Promise.all([
    lotClaim(lot.reference),
    q('SELECT * FROM override_record WHERE lot = $1', [lot.reference]),
    q('SELECT * FROM deviation'),
    q("SELECT * FROM test_result WHERE subject_kind = 'lot' AND subject_ref = $1", [lot.reference]),
  ]);
  const touching = deviations.filter((d) => (d.lots || []).includes(lot.reference));
  const gen = await genealogyOf(lot.reference);
  const flags = gen ? [...new Set(gen.nodes.flatMap((n) => n.flags))] : [];
  return {
    reference: lot.reference,
    grade: lot.grade,
    site: lot.site,
    mass_g: Number(lot.mass_g),
    disposition: lot.disposition,
    disposition_by: lot.disposition_by,
    disposition_at: lot.disposition_at,
    // content_bp is returned at the same weight as claim_type; neither appears alone
    claim_type: lot.claim_type,
    content_bp: claim.content_bp,
    credit_attached_g: claim.credit_attached_g,
    category_split: claim.category_split,
    specification_version: `SPEC-${lot.grade} v${lot.specification_version}`,
    produced_on: iso(lot.produced_on),
    output_ref: lot.output_ref,
    blended_from: lot.blended_from,
    sites_named: lot.sites_named || [lot.site],
    flags,
    flagged: flags.length > 0,
    overrides: overrides.map((o) => ({
      reference: o.reference, separation: o.separation, reason: o.reason,
      authorised_by: o.authorised_by, reviewed: o.reviewed, reviewed_by: o.reviewed_by,
      created_on: iso(o.created_on),
      statement: `Separation overridden by ${o.authorised_by} on ${iso(o.created_on)}. This cannot be removed.`,
    })),
    unreviewed_override_count: overrides.filter((o) => !o.reviewed).length,
    deviations: touching.map((d) => ({ reference: d.reference, state: d.state, outcome: d.outcome, detail: d.detail })),
    open_deviation: touching.some((d) => d.state === 'open'),
    test_results: tests.map((t) => ({
      reference: t.reference, property: t.property, method: t.method, instrument: t.instrument,
      analyst: t.analyst, value: t.value, unit: t.unit, uncertainty_bp: Number(t.uncertainty_bp),
      method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release, entered_by: t.entered_by,
    })),
    derivation: claim.derivation,
  };
}

r.get('/lots', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const rows = await q('SELECT * FROM lot ORDER BY reference ASC');
  return c.json(await Promise.all(rows.map(lotView)));
});

r.get('/lots/:reference', async (c) => {
  await requireSession(c);
  const lot = (await q('SELECT * FROM lot WHERE reference = $1', [c.req.param('reference')]))[0];
  if (!lot) refuse(404, 'not_found', { error: 'not_found', message: 'No such lot.' });
  return c.json(await lotView(lot));
});

r.get('/lots/:reference/genealogy', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const g = await genealogyOf(c.req.param('reference'));
  if (!g) refuse(404, 'not_found', { error: 'not_found', message: 'No such lot.' });
  return c.json(g);
});

r.get('/lots/:reference/carbon', async (c) => {
  await requireSession(c);
  const body = await carbonFor(c.req.param('reference'), { internal: true });
  if (!body) refuse(404, 'not_found', { error: 'not_found', message: 'No carbon figure exists for this lot.' });
  if (body.mismatch) {
    refuse(409, 'allocation_basis_mismatch', {
      error: 'allocation_basis_mismatch',
      message: `The period's allocation basis is ${body.period_allocation_basis} and the carbon method's is ${body.method_allocation_basis}. The allocation basis is held once per period and applies to both.`,
      ...body,
    });
  }
  return c.json(body);
});

// A yield figure appears on no certificate and in no verification answer.
r.get('/lots/:reference/yield', async (c) => {
  const actor = await requireSession(c);
  const entitled = (actor.roles || []).some((role) => ['plant_operator', 'quality_manager', 'claims_manager', 'lab_analyst', 'auditor'].includes(role));
  if (!entitled) {
    refuse(403, 'not_entitled', { error: 'not_entitled', message: 'A yield figure answers for plant operations, quality and the claims manager. It is refused to a collector and to a converter.' });
  }
  const lot = (await q('SELECT * FROM lot WHERE reference = $1', [c.req.param('reference')]))[0];
  if (!lot) refuse(404, 'not_found', { error: 'not_found', message: 'No such lot.' });
  const g = await genealogyOf(lot.reference);
  const batchMass = g.nodes.filter((n) => n.kind === 'batch').reduce((s, n) => s + n.mass_g, 0);
  const runs = g.nodes.filter((n) => n.kind === 'run');
  const losses = runs.reduce((s, n) => s + (n.losses_g || 0), 0);
  return c.json({
    lot: lot.reference,
    input_mass_g: batchMass,
    lot_mass_g: Number(lot.mass_g),
    losses_g: losses,
    yield_bp: batchMass ? floorDiv(Number(lot.mass_g) * 10000, batchMass) : 0,
    per_run: runs.map((n) => ({ run: n.reference, run_type: n.run_type, losses_g: n.losses_g })),
    derivation: `lot_mass_g ${lot.mass_g} * 10000 / input_mass_g ${batchMass}, floored. Losses reduce the claim.`,
    note: 'A yield figure appears on no certificate, in no certificate document and in no verification answer.',
  });
});

// A lot disposition is refused when the caller entered a test result on that lot,
// when a deviation touching the lot is open, or when the caller is not a quality manager.
r.post('/lots/:reference/disposition', async (c) => {
  const actor = await requireAct(c, 'lot.disposition');
  const body = await c.req.json().catch(() => ({}));
  const reference = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['disposition']);
    if (!['pending', 'released', 'quarantined', 'rejected'].includes(body.disposition)) {
      refuse(400, 'unknown_disposition', { error: 'unknown_disposition', message: 'A disposition is one of pending, released, quarantined, rejected.' });
    }
    const lot = (await q('SELECT * FROM lot WHERE reference = $1', [reference]))[0];
    if (!lot) refuse(404, 'not_found', { error: 'not_found', message: 'No such lot.' });

    const entered = await q(
      `SELECT reference FROM test_result WHERE subject_kind = 'lot' AND subject_ref = $1 AND lower(entered_by) = lower($2)`,
      [reference, actor.email]);
    const overrides = await q('SELECT * FROM override_record WHERE lot = $1 AND separation = $2 AND reviewed = true', [reference, 'analyst_not_dispositioner']);
    if (entered.length && !overrides.length) {
      await appendEntry(null, {
        person: actor.email, site: lot.site, object_kind: 'lot', object_ref: reference,
        action: 'disposition_refused',
        content: { separation: 'analyst_not_dispositioner', test_result: entered[0].reference, attempted: body.disposition },
      });
      refuse(403, 'separation_analyst_not_dispositioner', {
        error: 'separation_analyst_not_dispositioner',
        message: 'Whoever entered a test result does not disposition that lot.',
        separation: 'analyst_not_dispositioner',
        blocking_reference: entered[0].reference,
        resolution: 'A second person dispositions the lot, or an override names the separation, its reason and its authoriser.',
      });
    }
    const deviations = await q("SELECT * FROM deviation WHERE state = 'open'");
    const open = deviations.find((d) => (d.lots || []).includes(reference));
    if (open) {
      await appendEntry(null, {
        person: actor.email, site: lot.site, object_kind: 'lot', object_ref: reference,
        action: 'disposition_refused', content: { reason: 'open_deviation', deviation: open.reference, attempted: body.disposition },
      });
      refuse(409, 'open_deviation', {
        error: 'open_deviation',
        message: `Deviation ${open.reference} touching this lot is open.`,
        blocking_reference: open.reference,
      });
    }
    await pool.query(
      'UPDATE lot SET disposition = $1, disposition_by = $2, disposition_at = now() WHERE reference = $3',
      [body.disposition, actor.email, reference]);
    await appendEntry(null, {
      person: actor.email, site: lot.site, object_kind: 'lot', object_ref: reference,
      action: `disposition_${body.disposition}`, content: { disposition: body.disposition, previous: lot.disposition },
    });
    const updated = (await q('SELECT * FROM lot WHERE reference = $1', [reference]))[0];
    return { status: 201, body: { reference, ...(await lotView(updated)) } };
  });
  return c.json(out.body, out.status);
});

// Blending: the resulting claim is computed by mass and takes the weaker of the two.
const CLAIM_STRENGTH = { physically_segregated: 3, controlled_blending: 2, mass_balance: 1 };

r.post('/lots/:reference/blend', async (c) => {
  const actor = await requireAct(c, 'lot.blend');
  const body = await c.req.json().catch(() => ({}));
  const a = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    rejectComputedInputs(body);
    requireFields(body, ['with_lot']);
    const lotA = (await q('SELECT * FROM lot WHERE reference = $1', [a]))[0];
    const lotB = (await q('SELECT * FROM lot WHERE reference = $1', [body.with_lot]))[0];
    if (!lotA || !lotB) refuse(404, 'not_found', { error: 'not_found', message: 'No such lot.' });
    const claimA = await lotClaim(lotA.reference);
    const claimB = await lotClaim(lotB.reference);
    const massA = Number(lotA.mass_g);
    const massB = Number(lotB.mass_g);
    const blended = blendedContentBp(massA, claimA.content_bp, massB, claimB.content_bp);
    const claimType = CLAIM_STRENGTH[lotA.claim_type] <= CLAIM_STRENGTH[lotB.claim_type] ? lotA.claim_type : lotB.claim_type;
    const sites = [...new Set([lotA.site, lotB.site])];
    const factors = await q('SELECT * FROM conversion_factor WHERE site = ANY($1) AND superseded = false', [sites]);
    const provisional = factors.some((f) => f.provisional);
    const siteRows = await q('SELECT * FROM site WHERE reference = ANY($1)', [sites]);
    const weakerCertification = siteRows.some((s) => s.certification_state !== 'certified') ? 'not_certified' : 'certified';

    const reference = await nextLotRefFor(lotA.grade);
    const split = {};
    for (const [k, v] of Object.entries(claimA.category_split)) split[k] = (split[k] || 0) + v;
    for (const [k, v] of Object.entries(claimB.category_split)) split[k] = (split[k] || 0) + v;

    await pool.query(
      `INSERT INTO lot (reference, grade, site, mass_g, disposition, claim_type, specification_version, blended_from, sites_named, produced_on)
       VALUES ($1,$2,$3,$4,'pending',$5,3,$6,$7,$8)`,
      [reference, lotA.grade, lotA.site, massA + massB, claimType,
        JSON.stringify([lotA.reference, lotB.reference]), JSON.stringify(sites), today()]);
    for (const [cat, mass] of Object.entries(split)) {
      if (!mass) continue;
      const period = (await q('SELECT * FROM balance_period WHERE site = $1 AND grade = $2 ORDER BY period_from DESC LIMIT 1', [lotA.site, lotA.grade]))[0];
      if (period) {
        await pool.query(
          `INSERT INTO credit_movement (period_id, category, direction, kind, mass_g, ref, lot, derivation, effective_on, event_at, recorded_by)
           VALUES ($1,$2,'note','blend_carried',$3,$4,$4,$5,$6,now(),$7)`,
          [period.id, cat, mass, reference,
            JSON.stringify({ blend_of: [lotA.reference, lotB.reference], note: 'claim carried into the blended lot, not a fresh credit' }),
            today(), actor.email]);
      }
    }

    await appendEntry(null, {
      person: actor.email, site: lotA.site, object_kind: 'lot', object_ref: reference,
      action: 'blended',
      content: { from: [lotA.reference, lotB.reference], mass_g: massA + massB, content_bp: blended, claim_type: claimType, sites_named: sites },
    });

    return {
      status: 201,
      body: {
        reference,
        mass_g: massA + massB,
        content_bp: blended,
        claim_type: claimType,
        category_split: split,
        sites_named: sites,
        certification_scope: weakerCertification,
        provisional_factor: provisional,
        blended_from: [
          { lot: lotA.reference, mass_g: massA, content_bp: claimA.content_bp, claim_type: lotA.claim_type, site: lotA.site },
          { lot: lotB.reference, mass_g: massB, content_bp: claimB.content_bp, claim_type: lotB.claim_type, site: lotB.site },
        ],
        derivation: `(mass_a ${massA} * content_a ${claimA.content_bp} + mass_b ${massB} * content_b ${claimB.content_bp}) / (${massA} + ${massB}), floored. The claim takes the weaker of the two claim types and the weaker certification scope. Any non-claimable material in a blend dilutes the computed percentage.`,
      },
    };
  });
  return c.json(out.body, out.status);
});

async function nextLotRefFor(grade) {
  const rows = await q(`SELECT reference FROM lot WHERE reference LIKE $1 ORDER BY reference DESC LIMIT 1`, [`LOT-${grade}-%`]);
  const n = rows[0] ? Number(String(rows[0].reference).split('-').pop()) : 0;
  return `LOT-${grade}-${String(n + 1).padStart(4, '0')}`;
}

// ---- test results --------------------------------------------------------
r.get('/test-results', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const rows = await q('SELECT * FROM test_result ORDER BY reference ASC');
  return c.json(rows.map((t) => ({
    reference: t.reference, subject_kind: t.subject_kind, subject_ref: t.subject_ref,
    property: t.property, method: t.method, instrument: t.instrument, analyst: t.analyst,
    value: t.value, unit: t.unit, uncertainty_bp: Number(t.uncertainty_bp),
    method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release,
    entered_by: t.entered_by, event_at: t.event_at, recorded_at: t.recorded_at, effective_on: iso(t.effective_on),
  })));
});

r.post('/test-results', async (c) => {
  const actor = await requireAct(c, 'test.enter');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['subject_kind', 'subject_ref', 'property', 'instrument', 'value', 'unit']);
    requireIntegers(body, ['uncertainty_bp']);
    if (!body.method) {
      refuse(400, 'method_required', { error: 'method_required', message: 'A result with no method is refused. Every result is recorded against a named method.' });
    }
    const table = body.subject_kind === 'lot' ? 'lot' : 'batch';
    const subject = (await q(`SELECT * FROM ${table} WHERE reference = $1`, [body.subject_ref]))[0];
    if (!subject) refuse(404, 'not_found', { error: 'not_found', message: `No such ${body.subject_kind}.` });

    // A result produced by a method other than the one the specification names is
    // recorded as evidence and never reaches a disposition.
    const spec = (await q('SELECT * FROM specification WHERE grade = $1 AND superseded = false', [subject.grade || 'N6']))[0];
    const specRow = (spec?.properties || []).find((p) => p.property === body.property);
    const mismatch = !!specRow && specRow.method !== body.method;

    const reference = await nextReference('TST', 'test_result');
    await pool.query(
      `INSERT INTO test_result (reference, subject_kind, subject_ref, property, method, instrument, analyst, value, unit,
        uncertainty_bp, method_mismatch, usable_for_release, entered_by, event_at, recorded_at, effective_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),$15)`,
      [reference, body.subject_kind, body.subject_ref, body.property, body.method, body.instrument,
        body.analyst || actor.email, String(body.value), body.unit, body.uncertainty_bp ?? 0,
        mismatch, !mismatch, actor.email,
        body.event_at || new Date().toISOString(), body.effective_on || today()]);
    await appendEntry(null, {
      person: actor.email, site: subject.site || null, object_kind: 'test_result', object_ref: reference,
      action: 'entered',
      content: { subject: body.subject_ref, property: body.property, method: body.method, value: String(body.value), unit: body.unit, method_mismatch: mismatch },
    });
    return {
      status: 201,
      body: {
        reference, subject_kind: body.subject_kind, subject_ref: body.subject_ref,
        property: body.property, method: body.method, value: String(body.value), unit: body.unit,
        uncertainty_bp: body.uncertainty_bp ?? 0,
        method_mismatch: mismatch,
        usable_for_release: !mismatch,
        note: mismatch
          ? `The specification names ${specRow.method} for ${body.property}. This result is kept as evidence and never reaches a disposition.`
          : null,
      },
    };
  });
  return c.json(out.body, out.status);
});

// ---- deviations ----------------------------------------------------------
r.get('/deviations', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const rows = await q('SELECT * FROM deviation ORDER BY reference ASC');
  return c.json(rows.map((d) => ({
    reference: d.reference, state: d.state, outcome: d.outcome, runs: d.runs, lots: d.lots,
    detail: d.detail, raised_by: d.raised_by, raised_at: d.raised_at, closed_by: d.closed_by, closed_at: d.closed_at,
  })));
});

r.post('/deviations', async (c) => {
  const actor = await requireAct(c, 'deviation.raise');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['detail']);
    const reference = await nextReference('DEV', 'deviation');
    await pool.query(
      `INSERT INTO deviation (reference, state, runs, lots, detail, raised_by) VALUES ($1,'open',$2,$3,$4,$5)`,
      [reference, JSON.stringify(body.runs || []), JSON.stringify(body.lots || []), body.detail, actor.email]);
    await appendEntry(null, {
      person: actor.email, object_kind: 'deviation', object_ref: reference, action: 'raised',
      content: { runs: body.runs || [], lots: body.lots || [], detail: body.detail },
    });
    return { status: 201, body: { reference, state: 'open', runs: body.runs || [], lots: body.lots || [], detail: body.detail, raised_by: actor.email } };
  });
  return c.json(out.body, out.status);
});

r.post('/deviations/:reference/close', async (c) => {
  const actor = await requireAct(c, 'deviation.close');
  const body = await c.req.json().catch(() => ({}));
  const reference = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['outcome']);
    // Both outcomes are honest and neither is hidden.
    if (!['root_cause_found', 'cause_not_established'].includes(body.outcome)) {
      refuse(400, 'unknown_outcome', { error: 'unknown_outcome', message: 'An outcome is one of root_cause_found, cause_not_established. Both are honest outcomes and neither is hidden.' });
    }
    const dev = (await q('SELECT * FROM deviation WHERE reference = $1', [reference]))[0];
    if (!dev) refuse(404, 'not_found', { error: 'not_found', message: 'No such deviation.' });
    if (dev.state === 'closed') {
      refuse(409, 'deviation_closed', { error: 'deviation_closed', message: 'This deviation is already closed.', outcome: dev.outcome });
    }
    await pool.query(
      `UPDATE deviation SET state = 'closed', outcome = $1, closed_by = $2, closed_at = now() WHERE reference = $3`,
      [body.outcome, actor.email, reference]);
    await appendEntry(null, {
      person: actor.email, object_kind: 'deviation', object_ref: reference, action: 'closed',
      content: { outcome: body.outcome, reason: body.reason || null },
    });
    return { status: 201, body: { reference, state: 'closed', outcome: body.outcome, closed_by: actor.email, runs: dev.runs, lots: dev.lots } };
  });
  return c.json(out.body, out.status);
});

// ---- overrides -----------------------------------------------------------
const SEPARATIONS = ['analyst_not_dispositioner', 'method_publisher_not_period_closer', 'signer_not_data_enterer', 'booker_not_collector_approver'];

r.get('/overrides', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const rows = await q('SELECT * FROM override_record ORDER BY reference ASC');
  return c.json(rows.map((o) => ({
    reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot,
    authorised_by: o.authorised_by, reviewed: o.reviewed, reviewed_by: o.reviewed_by,
    reviewed_at: o.reviewed_at, created_on: iso(o.created_on),
    statement: `Separation overridden by ${o.authorised_by} on ${iso(o.created_on)}. This cannot be removed.`,
  })));
});

r.post('/overrides', async (c) => {
  const actor = await requireAct(c, 'override.record');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['separation', 'reason', 'lot', 'authorised_by']);
    if (!SEPARATIONS.includes(body.separation)) {
      refuse(400, 'unknown_separation', { error: 'unknown_separation', message: `An override names one of the four separations: ${SEPARATIONS.join(', ')}.` });
    }
    if (String(body.reason).length < 40) {
      refuse(400, 'reason_too_short', {
        error: 'reason_too_short',
        message: 'An override names a reason of at least forty characters.',
        length: String(body.reason).length, required: 40,
      });
    }
    const lot = (await q('SELECT * FROM lot WHERE reference = $1', [body.lot]))[0];
    if (!lot) refuse(404, 'not_found', { error: 'not_found', message: 'No such lot.' });
    const reference = await nextReference('OVR', 'override_record');
    await pool.query(
      `INSERT INTO override_record (reference, separation, reason, lot, authorised_by, recorded_by, reviewed, created_on)
       VALUES ($1,$2,$3,$4,$5,$6,false,$7)`,
      [reference, body.separation, body.reason, body.lot, body.authorised_by, actor.email, today()]);
    await appendEntry(null, {
      person: actor.email, site: lot.site, object_kind: 'override', object_ref: reference, action: 'recorded',
      content: { separation: body.separation, lot: body.lot, authorised_by: body.authorised_by, reason: body.reason },
    });
    return {
      status: 201,
      body: {
        reference, separation: body.separation, reason: body.reason, lot: body.lot,
        authorised_by: body.authorised_by, reviewed: false, created_on: today(),
        statement: `Separation overridden by ${body.authorised_by} on ${today()}. This cannot be removed.`,
        note: 'It is permanent, shows on the lot for its life, is counted on the balance screen, and blocks signing until a second person reviews it.',
      },
    };
  });
  return c.json(out.body, out.status);
});

// A review is refused for the authoriser and for anybody who is neither a quality
// manager nor a claims manager. A review sets reviewed true and removes nothing.
r.post('/overrides/:reference/review', async (c) => {
  const actor = await requireAct(c, 'override.review');
  const body = await c.req.json().catch(() => ({}));
  const reference = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    const ovr = (await q('SELECT * FROM override_record WHERE reference = $1', [reference]))[0];
    if (!ovr) refuse(404, 'not_found', { error: 'not_found', message: 'No such override.' });
    if (String(ovr.authorised_by).toLowerCase() === String(actor.email).toLowerCase()) {
      await appendEntry(null, {
        person: actor.email, object_kind: 'override', object_ref: reference, action: 'review_refused',
        content: { reason: 'authoriser_cannot_review', authorised_by: ovr.authorised_by },
      });
      refuse(403, 'authoriser_cannot_review', {
        error: 'authoriser_cannot_review',
        message: 'A review is refused for the authoriser. A second person reviews it.',
        authorised_by: ovr.authorised_by,
      });
    }
    if (ovr.reviewed) {
      return { status: 200, body: { reference, reviewed: true, reviewed_by: ovr.reviewed_by, note: 'A review removes nothing.' } };
    }
    await pool.query('UPDATE override_record SET reviewed = true, reviewed_by = $1, reviewed_at = now() WHERE reference = $2',
      [actor.email, reference]);
    await appendEntry(null, {
      person: actor.email, object_kind: 'override', object_ref: reference, action: 'reviewed',
      content: { reviewed_by: actor.email, separation: ovr.separation, lot: ovr.lot },
    });
    return {
      status: 201,
      body: {
        reference, reviewed: true, reviewed_by: actor.email, lot: ovr.lot,
        separation: ovr.separation, reason: ovr.reason, authorised_by: ovr.authorised_by,
        note: 'A review sets reviewed true and removes nothing. The override shows on the lot for its life.',
      },
    };
  });
  return c.json(out.body, out.status);
});

export default r;
