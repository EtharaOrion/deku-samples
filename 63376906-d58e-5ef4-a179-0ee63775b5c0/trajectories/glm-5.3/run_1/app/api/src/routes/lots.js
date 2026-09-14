import { Hono } from 'hono';
import { q, one, client } from '../db.js';
import { requireAuth, requireRole, bad, notFound, conflict, forbidden, reqField, intField, enumField, rememberIdempotency, refusePagination } from '../lib/http.js';
import { entry, entryTop } from '../record.js';
import { genealogyFor } from '../engine/domain.js';
import { blendContent, contentBp, floorDiv, floorMulDiv } from '../engine/int.js';

const r = new Hono();
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const iso = (d) => (d instanceof Date ? d.toISOString() : d);

async function attachedCredit(lot) {
  const row = await one(`SELECT coalesce(sum(mass_g),0)::bigint m FROM credit_movements WHERE lot=$1 AND kind='allocation'`, [lot]);
  return Number(row.m);
}

async function serializeLot(l) {
  const attached = await attachedCredit(l.reference);
  const byCat = await q(`SELECT category, coalesce(sum(mass_g),0)::bigint m FROM credit_movements WHERE lot=$1 AND kind='allocation' GROUP BY category`, [l.reference]);
  const split = {};
  for (const c of byCat) split[c.category] = Number(c.m);
  return {
    reference: l.reference, site: l.site, grade: l.grade, mass_g: Number(l.mass_g),
    disposition: l.disposition, claim_type: l.claim_type, produced_by: l.produced_by,
    credit_attached_g: attached, content_bp: attached > 0 ? contentBp(attached, Number(l.mass_g)) : null,
    category_split: split,
    event_at: iso(l.event_at), recorded_at: iso(l.recorded_at), effective_on: isoD(l.effective_on),
    derivation: attached > 0 ? { content_bp: `credit_attached_g ${attached} * 10000 / lot_mass_g ${l.mass_g}, floored` } : null
  };
}

r.get('/api/lots', async (c) => {
  refusePagination(c);
  await requireAuth(c);
  const rows = await q('SELECT * FROM lots ORDER BY reference');
  return c.json(await Promise.all(rows.map(serializeLot)));
});

r.get('/api/lots/:ref', async (c) => {
  await requireAuth(c);
  const l = await one('SELECT * FROM lots WHERE reference = $1', [c.req.param('ref')]);
  if (!l) throw notFound('lot_not_found');
  return c.json(await serializeLot(l));
});

// A graph and not a tree; runnable backwards; the same facts as a nested list.
r.get('/api/lots/:ref/genealogy', async (c) => {
  refusePagination(c);
  await requireAuth(c);
  const g = await genealogyFor(c.req.param('ref'));
  if (!g) throw notFound('lot_not_found');
  return c.json(g);
});

// A yield figure answers for plant operations, quality and the claims manager, and refuses a collector and a converter.
r.get('/api/lots/:ref/yield', async (c) => {
  const u = await requireAuth(c);
  if (!['plant_operator', 'quality_manager', 'claims_manager', 'auditor'].includes(u.role)) {
    throw forbidden('yield_not_available_to_role', { role: u.role });
  }
  const l = await one('SELECT * FROM lots WHERE reference = $1', [c.req.param('ref')]);
  if (!l) throw notFound('lot_not_found');
  const run = await one('SELECT * FROM runs WHERE reference = $1', [l.produced_by]);
  if (!run) throw notFound('run_not_found');
  const inputs = await q('SELECT coalesce(sum(mass_g),0)::bigint m FROM consumptions WHERE run=$1', [run.reference]);
  const massIn = Number(inputs[0].m);
  return c.json({
    lot: l.reference, run: run.reference,
    mass_in_g: massIn, lot_mass_g: Number(l.mass_g),
    losses_g: run.losses_g === null ? null : Number(run.losses_g),
    derivation: { note: 'yield appears on no certificate and in no verification answer' }
  });
});

// Disposition: refused for the analyst who tested the lot, for an open deviation, and for anybody but a quality manager.
r.post('/api/lots/:ref/disposition', async (c) => {
  const user = await requireRole(c, 'quality_manager');
  const l = await one('SELECT * FROM lots WHERE reference = $1', [c.req.param('ref')]);
  if (!l) throw notFound('lot_not_found');
  const b = await c.req.json();
  const disposition = enumField(b.disposition, 'disposition', ['pending', 'released', 'quarantined', 'rejected']);
  const entered = await one(`SELECT 1 FROM test_results WHERE subject=$1 AND analyst=$2 LIMIT 1`, [l.reference, user.email]);
  if (entered) throw forbidden('analyst_not_dispositioner', { rule: 'whoever entered a test result does not disposition that lot' });
  const dev = await q(`SELECT * FROM deviations WHERE state='open'`);
  const touching = dev.filter(d => (d.lots || []).includes(l.reference));
  if (touching.length) throw conflict('open_deviation_touching_lot', { deviations: touching.map(d => d.reference) });
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`UPDATE lots SET disposition=$2 WHERE reference=$1`, [l.reference, disposition]);
    const e = await entry(tx, { person: user.email, site: l.site, object: l.reference, act: 'lot_disposition_set',
      content: { lot: l.reference, disposition } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: l.reference, disposition, record_seq: e.seq });
    return c.json({ reference: l.reference, disposition, record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

// Blending: mass-weighted, the weaker claim type, the weaker certification scope, non-claimable dilutes.
r.post('/api/lots/:ref/blend', async (c) => {
  const user = await requireRole(c, 'claims_manager', 'quality_manager');
  const a = await one('SELECT * FROM lots WHERE reference = $1', [c.req.param('ref')]);
  if (!a) throw notFound('lot_not_found');
  const b = await c.req.json();
  const other = await one('SELECT * FROM lots WHERE reference = $1', [reqField(b.with, 'with')]);
  if (!other) throw notFound('lot_not_found');
  const newRef = reqField(b.reference, 'reference');
  const sa = await serializeLot(a), sb = await serializeLot(other);
  const mass = Number(a.mass_g) + Number(other.mass_g);
  const ca = sa.content_bp ?? 0, cb = sb.content_bp ?? 0;
  const blended = blendContent(Number(a.mass_g), ca, Number(other.mass_g), cb);
  const sites = [...new Set([a.site, other.site])];
  const weaker = { physically_segregated: 3, controlled_blending: 2, mass_balance: 1 };
  const claim_type = weaker[sa.claim_type] <= weaker[sb.claim_type] ? sa.claim_type : sb.claim_type;
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO lots (reference, site, grade, mass_g, disposition, claim_type, produced_by, event_at, recorded_at, effective_on)
      VALUES ($1,$2,$3,$4,'pending',$5,$6,now(),now(),$7)`,
      [newRef, sites[0], a.grade, mass, claim_type, null, isoD(new Date())]);
    const e = await entry(tx, { person: user.email, site: sites[0], object: newRef, act: 'lot_blended',
      content: { reference: newRef, lots: [a.reference, other.reference], mass_g: mass, content_bp: blended, claim_type, sites,
        derivation: `(mass_a ${a.mass_g} * content_a ${ca} + mass_b ${other.mass_g} * content_b ${cb}) / (mass_a + mass_b), floored` } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: newRef, mass_g: mass, content_bp: blended, claim_type,
      sites: sites.length > 1 ? sites : sites[0], blended_from: [a.reference, other.reference], record_seq: e.seq });
    return c.json({ reference: newRef, mass_g: mass, content_bp: blended, claim_type,
      sites: sites.length > 1 ? sites : sites[0], blended_from: [a.reference, other.reference],
      derivation: `(mass_a ${a.mass_g} * content_a ${ca} + mass_b ${other.mass_g} * content_b ${cb}) / (mass_a + mass_b), floored`,
      record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

export default r;
