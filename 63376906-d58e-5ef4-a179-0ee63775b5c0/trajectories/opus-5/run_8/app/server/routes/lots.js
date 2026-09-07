import { Hono } from 'hono';
import { all, one, query } from '../db.js';
import {
  asDate, idempotent, recordAct, refuse, refusePagination, refuseAuditorWrites,
  requireFields, requireRole, requireSession, refuseComputedInput,
} from '../http.js';
import { genealogy, lotClaim, lotYield, byproductShare, batchView } from '../engine.js';
import { carbonFigureFor } from '../carbon.js';
import { weightedContentBp } from '../units.js';

const app = new Hono();

export async function lotView(l) {
  const claim = await lotClaim(l.reference);
  const deviations = await all('select * from deviation where $1 = any(lots)', [l.reference]);
  const overrides = await all('select * from override where lot = $1', [l.reference]);
  const tests = await all('select * from test_result where subject_reference = $1 order by reference asc', [l.reference]);
  // A lapsed calibration and a missing custody link are repeated on every lot
  // the batch reaches.
  const gen = await genealogy(l.reference);
  const flags = [];
  for (const n of gen?.nodes || []) for (const f of n.flags) if (!flags.includes(f)) flags.push(f);
  if (l.provisional_factor && !flags.includes('provisional_factor')) flags.push('provisional_factor');
  return {
    reference: l.reference,
    grade: l.grade,
    site: l.site,
    sites: l.sites,
    mass_g: l.mass_g,
    disposition: l.disposition,
    disposition_by: l.disposition_by,
    disposition_at: l.disposition_at,
    claim_type: l.claim_type,
    content_bp: claim.content_bp,
    credit_attached_g: claim.credit_attached_g,
    category_split: claim.category_split,
    specification_version: l.specification_version,
    provisional_factor: l.provisional_factor,
    blended_from: l.blended_from,
    flags,
    deviations: deviations.map((d) => ({ reference: d.reference, state: d.state, outcome: d.outcome })),
    overrides: overrides.map((o) => ({
      reference: o.reference, separation: o.separation, reason: o.reason,
      authorised_by: o.authorised_by, created_on: asDate(o.created_on), reviewed: o.reviewed,
    })),
    test_results: tests.map((t) => ({
      reference: t.reference, property: t.property, method: t.method, value: t.value,
      unit: t.unit, uncertainty_bp: t.uncertainty_bp, entered_by: t.entered_by,
      method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release,
    })),
    effective_on: asDate(l.effective_on),
    derivation: claim.derivation,
  };
}

app.get('/lots', async (c) => {
  refusePagination(c);
  const session = requireSession(c);
  if (session.roles.includes('collector')) {
    refuse(403, 'not_permitted', { message: 'A collector never sees a lot.' });
  }
  const rows = await all('select * from lot order by reference asc');
  return c.json(await Promise.all(rows.map(lotView)));
});

app.get('/lots/:reference', async (c) => {
  const session = requireSession(c);
  if (session.roles.includes('collector')) refuse(403, 'not_permitted', { message: 'A collector never sees a lot.' });
  const l = await one('select * from lot where reference = $1', [c.req.param('reference')]);
  if (!l) refuse(404, 'not_found', { message: 'No such lot.' });
  return c.json(await lotView(l));
});

app.get('/lots/:reference/genealogy', async (c) => {
  const session = requireSession(c);
  if (session.roles.includes('collector') || session.roles.includes('converter')) {
    refuse(403, 'not_permitted', { message: 'A converter never sees a genealogy.' });
  }
  refusePagination(c);
  const out = await genealogy(c.req.param('reference'));
  if (!out) refuse(404, 'not_found', { message: 'No such lot.' });
  return c.json(out);
});

// A yield figure answers for plant operations, quality and the claims manager,
// and refuses a collector and a converter.
app.get('/lots/:reference/yield', async (c) => {
  const session = requireRole(c, 'plant_operator', 'quality_manager', 'claims_manager', 'auditor');
  void session;
  const out = await lotYield(c.req.param('reference'));
  if (!out) refuse(404, 'not_found', { message: 'No such lot.' });
  return c.json(out);
});

app.get('/lots/:reference/carbon', async (c) => {
  requireSession(c);
  const ref = c.req.param('reference');
  const lot = await one('select * from lot where reference = $1', [ref]);
  if (!lot) refuse(404, 'not_found', { message: 'No such lot.' });
  let figure;
  try {
    figure = await carbonFigureFor(ref, { internal: true });
  } catch (e) {
    if (e.status === 409) return c.json(e.body, 409);
    throw e;
  }
  if (!figure) refuse(404, 'no_carbon_figure', { message: 'No carbon figure has been computed for this lot.', lot: ref });
  return c.json(figure);
});

app.post('/lots/:reference/disposition', async (c) => {
  refuseAuditorWrites(c);
  const session = requireSession(c);
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['disposition']);
  if (!['pending', 'released', 'quarantined', 'rejected'].includes(body.disposition)) {
    refuse(400, 'unknown_disposition', { message: 'disposition is one of pending, released, quarantined, rejected.' });
  }
  const lot = await one('select * from lot where reference = $1', [ref]);
  if (!lot) refuse(404, 'not_found', { message: 'No such lot.' });

  const deny = async (error, extra) => {
    await recordAct({
      act: 'lot_disposition_refused', actor: session.email, site: lot.site,
      object_kind: 'lot', object_reference: ref, refused: true,
      content: { reason: error, requested: body.disposition, ...extra },
    });
    refuse(403, error, extra);
  };

  if (!session.roles.includes('quality_manager')) {
    await deny('not_permitted', {
      message: 'A lot disposition is set by a quality manager. A plant operator and a laboratory analyst may not set one.',
      role_held: session.roles,
    });
  }
  // Whoever entered a test result does not disposition that lot.
  const own = await one(
    'select * from test_result where subject_reference = $1 and entered_by = $2 limit 1',
    [ref, session.email],
  );
  if (own) {
    await deny('separation_analyst_not_dispositioner', {
      message: 'Whoever entered a test result on this lot does not disposition it. An override names the separation, its reason and its authoriser.',
      separation: 'analyst_not_dispositioner',
      blocking_reference: own.reference,
    });
  }
  const open = await one("select * from deviation where $1 = any(lots) and state = 'open' limit 1", [ref]);
  if (open) {
    await deny('open_deviation', {
      message: 'A deviation touching this lot is open.',
      blocking_reference: open.reference,
    });
  }

  const result = await idempotent(c, `POST /api/lots/${ref}/disposition`, body, async () => {
    await query(
      'update lot set disposition = $1, disposition_by = $2, disposition_at = now() where reference = $3',
      [body.disposition, session.email, ref],
    );
    await recordAct({
      act: 'lot_dispositioned', actor: session.email, site: lot.site,
      object_kind: 'lot', object_reference: ref, content: { disposition: body.disposition },
    });
    const l = await one('select * from lot where reference = $1', [ref]);
    return { status: 200, body: { reference: ref, ...(await lotView(l)) } };
  });
  return c.json(result.body, result.status);
});

// Blending: the claim is computed by mass and takes the weaker of the two.
const CLAIM_STRENGTH = { physically_segregated: 3, controlled_blending: 2, mass_balance: 1 };
app.post('/lots/:reference/blend', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'plant_operator', 'quality_manager', 'claims_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['with']);
  const a = await one('select * from lot where reference = $1', [ref]);
  const b = await one('select * from lot where reference = $1', [body.with]);
  if (!a || !b) refuse(404, 'not_found', { message: 'No such lot.', field: 'with' });

  const result = await idempotent(c, `POST /api/lots/${ref}/blend`, body, async () => {
    const claimA = await lotClaim(a.reference);
    const claimB = await lotClaim(b.reference);
    const mass = a.mass_g + b.mass_g;
    const content = weightedContentBp(a.mass_g, claimA.content_bp, b.mass_g, claimB.content_bp);
    const claim_type = CLAIM_STRENGTH[a.claim_type] <= CLAIM_STRENGTH[b.claim_type] ? a.claim_type : b.claim_type;
    const sites = [...new Set([...(a.sites || [a.site]), ...(b.sites || [b.site])])];
    const { rows } = await query("select reference from lot where reference like 'LOT-N6-%' order by reference desc limit 1");
    const n = rows[0] ? Number(rows[0].reference.split('-')[2]) + 1 : 1;
    const reference = `LOT-N6-${String(n).padStart(4, '0')}`;
    const provisional = a.provisional_factor || b.provisional_factor;
    // Where the two sites differ the blend names both and takes the weaker
    // certification scope.
    const siteRows = await all('select * from site where reference = any($1)', [sites]);
    const weakest = siteRows.reduce((w, s) => (s.certification_state === 'certified' ? w : s.reference), sites[0]);
    await query(
      `insert into lot (reference,grade,site,sites,mass_g,claim_type,specification_version,blended_from,blend_content_bp,provisional_factor,event_at,effective_on,created_by,disposition)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11,$12,'pending')`,
      [reference, a.grade, a.site, JSON.stringify(sites), mass, claim_type, a.specification_version,
        JSON.stringify([
          { lot: a.reference, mass_g: a.mass_g, content_bp: claimA.content_bp, site: a.site },
          { lot: b.reference, mass_g: b.mass_g, content_bp: claimB.content_bp, site: b.site },
        ]),
        content, provisional, new Date().toISOString().slice(0, 10), session.email],
    );
    await recordAct({
      act: 'lots_blended', actor: session.email, site: a.site,
      object_kind: 'lot', object_reference: reference,
      content: { from: [a.reference, b.reference], mass_g: mass, content_bp: content, claim_type, sites },
    });
    return {
      status: 201,
      body: {
        reference,
        mass_g: mass,
        content_bp: content,
        claim_type,
        sites,
        weaker_certification_scope: weakest,
        provisional_factor: provisional,
        blended_from: [
          { lot: a.reference, mass_g: a.mass_g, content_bp: claimA.content_bp, site: a.site },
          { lot: b.reference, mass_g: b.mass_g, content_bp: claimB.content_bp, site: b.site },
        ],
        derivation: { content_bp: '(mass_a * content_a + mass_b * content_b) / (mass_a + mass_b), floored' },
      },
    };
  });
  return c.json(result.body, result.status);
});

app.get('/outputs/:reference/share', async (c) => {
  requireSession(c);
  const out = await byproductShare(c.req.param('reference'));
  if (!out) refuse(404, 'not_found', { message: 'No such output.' });
  return c.json(out);
});

app.get('/outputs', async (c) => {
  requireSession(c);
  const rows = await all('select * from output order by reference asc');
  return c.json(rows.map((o) => ({
    reference: o.reference, run: o.run, kind: o.kind, mass_g: o.mass_g,
    disposition: o.disposition, effective_on: asDate(o.effective_on),
  })));
});

app.get('/batches-summary', async (c) => {
  requireSession(c);
  const rows = await all('select * from batch order by received_on asc');
  return c.json(await Promise.all(rows.map(batchView)));
});

export default app;
