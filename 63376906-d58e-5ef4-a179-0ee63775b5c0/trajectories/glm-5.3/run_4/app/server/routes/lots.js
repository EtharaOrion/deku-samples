import { Hono } from 'hono';
import { q, tx } from '../db.js';
import { requireSession } from '../auth.js';
import { idempotent, readBody, refuse, recordTx, requireKeys, intOr, refusePagination, readAt } from '../lib/http.js';
import { loadGraph, lotGenealogy, batchImpact, lotAllocated, lotFlagsDownstream } from '../lib/engine.js';
import { nowIso, floorDiv } from '../lib/util.js';

const lots = new Hono();
lots.use('*', requireSession());

function lotView(l, allocated, flags) {
  const content = allocated
    ? { attached_g: allocated.post_consumer + allocated.pre_consumer, content_bp: floorDiv((allocated.post_consumer + allocated.pre_consumer) * 10000, Number(l.mass_g)) }
    : { attached_g: 0, content_bp: 0 };
  return {
    reference: l.reference, run: l.run, site: l.site, grade: l.grade, mass_g: Number(l.mass_g),
    disposition: l.disposition, claim_type: l.claim_type, specification_version: l.specification_version,
    provisional_factor: l.provisional_factor,
    attached_claim_g: content.attached_g,
    content_bp: content.content_bp,
    flags: flags || [],
    disposition_word: l.disposition,
    derivation: { content_bp: `floor(attached_claim_g ${content.attached_g} * 10000 / mass_g ${l.mass_g})` }
  };
}

lots.get('/', async (c) => {
  const r = await q('SELECT * FROM lot ORDER BY reference');
  const G = await loadGraph();
  const out = [];
  for (const l of r.rows) {
    const alloc = await lotAllocated(l.reference);
    out.push(lotView(l, alloc, []));
  }
  return c.json(out);
});

lots.get('/:reference', async (c) => {
  const r = await q('SELECT * FROM lot WHERE reference = $1', [c.req.param('reference')]);
  if (!r.rows.length) return c.json({ error: 'not_found' }, 404);
  const alloc = await lotAllocated(r.rows[0].reference);
  return c.json(lotView(r.rows[0], alloc));
});

lots.get('/:reference/genealogy', async (c) => {
  refusePagination(c);
  const user = c.get('user');
  if (user.role === 'plant_operator' || user.role === 'lab_analyst') { /* readable */ }
  const G = await loadGraph();
  const g = lotGenealogy(c.req.param('reference'), G);
  if (!g) return c.json({ error: 'not_found' }, 404);
  return c.json({ ...g, read_at: readAt() });
});

lots.get('/:reference/impact', async (c) => {
  refusePagination(c);
  const imp = await batchImpact(c.req.param('reference'));
  if (!imp) return c.json({ error: 'not_found' }, 404);
  return c.json({ ...imp, read_at: readAt() });
});

lots.get('/:reference/yield', async (c) => {
  const user = c.get('user');
  if (!['plant_operator', 'quality_manager', 'claims_manager', 'lab_analyst', 'auditor'].includes(user.role)) {
    refuse(403, 'forbidden', { message: 'A yield figure answers for plant operations, quality and the claims manager, and refuses a collector and a converter.' });
  }
  const r = await q('SELECT * FROM lot WHERE reference = $1', [c.req.param('reference')]);
  if (!r.rows.length) return c.json({ error: 'not_found' }, 404);
  const lot = r.rows[0];
  const cons = await q('SELECT SUM(mass_g)::bigint AS m FROM consumption WHERE run = $1', [lot.run]);
  const massIn = Number(cons.rows[0].m || 0);
  if (massIn === 0) return c.json({ lot: lot.reference, mass_in_g: 0, mass_out_g: Number(lot.mass_g), yield_bp: 0 });
  return c.json({
    lot: lot.reference, run: lot.run,
    mass_in_g: massIn, mass_out_g: Number(lot.mass_g),
    yield_bp: floorDiv(Number(lot.mass_g) * 10000, massIn),
    derivation: { yield_bp: `floor(mass_out_g ${lot.mass_g} * 10000 / mass_in_g ${massIn})`, rule: 'Losses reduce the claim.' }
  });
});

lots.post('/:reference/disposition', async (c) => {
  const user = c.get('user');
  if (user.role !== 'quality_manager') {
    refuse(403, 'forbidden', { message: 'A quality manager sets a lot disposition.' });
  }
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['disposition']);
    if (!['pending', 'released', 'quarantined', 'rejected'].includes(body.disposition)) refuse(400, 'unknown_disposition');
    const r = await q('SELECT * FROM lot WHERE reference = $1', [c.req.param('reference')]);
    if (!r.rows.length) refuse(404, 'not_found');
    const lot = r.rows[0];
    // separation: the analyst who entered a test result on this lot does not disposition it
    const tr = await q('SELECT COUNT(*)::int AS n FROM test_result WHERE lot = $1 AND analyst = $2', [lot.reference, user.email]);
    if (tr.rows[0].n > 0) {
      refuse(403, 'separation_refused', { separation: 'analyst_not_dispositioner', message: 'Whoever entered a test result does not disposition that lot.' });
    }
    const dev = await q(`SELECT reference FROM deviation WHERE state = 'open' AND lots @> $1::jsonb`, [JSON.stringify([lot.reference])]);
    if (dev.rows.length) {
      refuse(409, 'open_deviation', { deviation: dev.rows[0].reference, message: 'A deviation touching the lot is open.' });
    }
    return await tx(async (client) => {
      await client.query('UPDATE lot SET disposition = $2 WHERE reference = $1', [lot.reference, body.disposition]);
      await recordTx(client, { user, act: 'disposition_set', object: lot.reference, site: lot.site, payload: { disposition: body.disposition } });
      return { reference: lot.reference, disposition: body.disposition };
    });
  });
});

lots.post('/:reference/blend', async (c) => {
  const user = c.get('user');
  if (!['claims_manager', 'quality_manager'].includes(user.role)) refuse(403, 'forbidden', { message: 'A claims manager blends.' });
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['with_lot']);
    const a = (await q('SELECT * FROM lot WHERE reference = $1', [c.req.param('reference')])).rows[0];
    const b = (await q('SELECT * FROM lot WHERE reference = $1', [body.with_lot])).rows[0];
    if (!a || !b) refuse(404, 'not_found');
    const allocA = await lotAllocated(a.reference);
    const allocB = await lotAllocated(b.reference);
    const contentA = floorDiv((allocA.post_consumer + allocA.pre_consumer) * 10000, Number(a.mass_g));
    const contentB = floorDiv((allocB.post_consumer + allocB.pre_consumer) * 10000, Number(b.mass_g));
    const mass = Number(a.mass_g) + Number(b.mass_g);
    const blended = floorDiv(Number(a.mass_g) * contentA + Number(b.mass_g) * contentB, mass);
    const sites = [...new Set([a.site, b.site])];
    const weaker = (t1, t2) => (t1 === 'mass_balance' || t2 === 'mass_balance' ? 'mass_balance' : 'controlled_blending');
    const provisional = a.provisional_factor || b.provisional_factor;
    return await tx(async (client) => {
      const r = await client.query('INSERT INTO ref_seq (kind, n) VALUES ($1, 1) ON CONFLICT (kind) DO UPDATE SET n = ref_seq.n + 1 RETURNING n', ['lot']);
      const newRef = 'LOT-BLEND-' + String(r.rows[0].n).padStart(4, '0');
      await client.query(
        `INSERT INTO lot (reference, run, site, grade, mass_g, disposition, claim_type, specification_version, provisional_factor, created_by)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9)`,
        [newRef, a.run, sites.join('+'), a.grade, mass, weaker(a.claim_type, b.claim_type), a.specification_version, provisional, user.email]
      );
      await recordTx(client, {
        user, act: 'lot_blended', object: newRef, site: a.site,
        payload: { from: [a.reference, b.reference], mass_g: mass, content_bp: blended, sites }
      });
      return {
        reference: newRef, mass_g: mass, content_bp: blended,
        claim_type: weaker(a.claim_type, b.claim_type), sites,
        provisional_factor: provisional,
        derivation: {
          content_bp: `floor(mass_a ${a.mass_g} * content_a ${contentA} + mass_b ${b.mass_g} * content_b ${contentB} / (mass_a + mass_b))`,
          rule: 'The resulting claim is computed by mass and takes the weaker of the two claim types.'
        }
      };
    });
  });
});

export default lots;
