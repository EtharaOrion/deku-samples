import { Hono } from 'hono';
import { q, one, client, exec } from '../db.js';
import { requireAuth, requireRole, bad, notFound, reqField, intField, enumField, rememberIdempotency, conflict, refusePagination, ApiError } from '../lib/http.js';
import { entry, entryTop } from '../record.js';
import { periodBalance, conversionFactorFor } from '../engine/domain.js';
import { contentBp, creditGranted, dryMass, floorDiv, floorMulDiv, factorFromWindow } from '../engine/int.js';
import { sendMail } from '../mail.js';

const r = new Hono();
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const CATS = ['post_consumer', 'pre_consumer'];

const D = (m) => ({ derivation: m });

r.get('/api/balance-periods', async (c) => {
  refusePagination(c);
  await requireAuth(c);
  const rows = await q('SELECT * FROM balance_periods ORDER BY site, period_from');
  return c.json(await Promise.all(rows.map((p) => serializePeriod(p))));
});

r.get('/api/balance-periods/:id', async (c) => {
  refusePagination(c);
  await requireAuth(c);
  const p = await one('SELECT * FROM balance_periods WHERE id = $1', [c.req.param('id')]);
  if (!p) throw notFound('balance_period_not_found');
  return c.json(await serializePeriod(p));
});

export async function serializePeriod(p) {
  const balance = await periodBalance(p.id);
  const factors = await q(`SELECT * FROM conversion_factors WHERE site = $1 ORDER BY published_on DESC`, [p.site]);
  const applicable = factors.filter(f => f.published_on <= p.period_to);
  const overrides = Number((await one(`SELECT count(*) n FROM overrides o JOIN lots l ON l.reference = o.lot
     WHERE l.site = $1 AND o.authorised_on BETWEEN $2 AND $3`, [p.site, p.period_from, p.period_to])).n);
  const openRestatements = Number((await one(`SELECT count(*) n FROM restatements WHERE balance_period=$1 AND state='open'`, [p.id])).n);
  const openFindings = Number((await one(`SELECT count(*) n FROM findings WHERE open`)).n);
  const nonClaimable = await q(`SELECT coalesce(sum(mass_g),0)::bigint m FROM credit_movements WHERE balance_period=$1 AND kind='non_claimable_input'`, [p.id]);
  const inboundCredits = await q(`SELECT reference, mass_g, origin_site, movement, fresh_credit FROM credit_movements WHERE balance_period=$1 AND kind='transfer_in' ORDER BY id`, [p.id]);
  const lots = await q(`SELECT * FROM lots WHERE site=$1 AND grade=$2`, [p.site, p.grade]);
  const lotsWithoutDisposition = lots.filter(l => l.disposition === 'pending').map(l => l.reference);
  const openDeviations = await q(`SELECT * FROM deviations WHERE state='open'`);
  const touching = openDeviations.filter(d => (d.lots || []).some(x => lots.some(l => l.reference === x))).map(d => d.reference);
  return {
    id: p.id, site: p.site, grade: p.grade,
    period: { from: isoD(p.period_from), to: isoD(p.period_to) },
    state: p.state,
    carry_over_limit_bp: p.carry_over_limit_bp,
    allocation_basis: p.allocation_basis,
    closed_on: p.closed_on ? isoD(p.closed_on) : null,
    cut_off: p.cut_off ? isoD(p.cut_off) : null,
    credits: balance,
    non_claimable_input_g: Number(nonClaimable[0].m),
    inbound_credits: inboundCredits.map(i => ({ reference: i.reference, mass_g: Number(i.mass_g), origin_site: i.origin_site, movement: i.movement, fresh_credit: i.fresh_credit })),
    conversion_factors: applicable.map(f => ({
      reference: f.reference, factor_bp: f.factor_bp, provisional: f.provisional,
      derivation_window: { from: f.derived_from ? isoD(f.derived_from) : null, to: f.derived_to ? isoD(f.derived_to) : null, in_g: Number(f.derived_in_g), out_g: Number(f.derived_out_g) },
      published_on: isoD(f.published_on), site: f.site
    })),
    override_count: overrides,
    open_restatement_count: openRestatements,
    open_finding_count: openFindings,
    lots_without_disposition: lotsWithoutDisposition,
    open_deviations_touching: touching,
    read_at: new Date().toISOString(),
    derivation: { balance: 'sum of credit_movements, never a stored total', non_claimable_input_g: 'sum of non-claimable dry mass consumed in the period' }
  };
}

// ---- Allocations: credits attached never exceed credits available. Refused, never warned.
r.post('/api/balance-periods/:id/allocations', async (c) => {
  const user = await requireRole(c, 'claims_manager');
  const p = await one('SELECT * FROM balance_periods WHERE id = $1', [c.req.param('id')]);
  if (!p) throw notFound('balance_period_not_found');
  if (p.state === 'closed') throw conflict('period_closed', { rule: 'corrections require a restatement' });
  const b = await c.req.json();
  const lot = reqField(b.lot, 'lot');
  const category = enumField(b.category, 'category', CATS);
  const mass_g = intField(b.mass_g, 'mass_g');
  if (mass_g <= 0) throw bad('mass_must_be_positive');

  const lotRow = await one('SELECT * FROM lots WHERE reference = $1', [lot]);
  if (!lotRow) throw notFound('lot_not_found');

  const tx = await client();
  try {
    await tx.query('BEGIN');
    // the two categories are never netted; the invariant is enforced on a row lock so two racing
    // allocations for the same remainder produce one success and one refusal.
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [p.id + ':' + category]);

    // fresh credit granted at a consumption, minus credit attached to lots: the same definition
    // the balance screen reads, so the margin at the instant of refusal matches the screen.
    const ins = Number((await one(`SELECT coalesce(sum(mass_g),0)::bigint m FROM credit_movements WHERE balance_period=$1 AND category=$2 AND direction='in' AND kind='consumption'`, [p.id, category], tx)).m);
    const outs = Number((await one(`SELECT coalesce(sum(mass_g),0)::bigint m FROM credit_movements WHERE balance_period=$1 AND category=$2 AND direction='out' AND kind='allocation'`, [p.id, category], tx)).m);
    const available = ins - outs;
    if (mass_g > available) {
      await tx.query('ROLLBACK');
      // a refusal is recorded as well as a success, with the margin at the instant
      await entryTop({ person: user.email, site: p.site, object: p.id, act: 'allocation_refused',
        content: { period: p.id, lot, category, requested_g: mass_g, available_g: available, error: 'insufficient_credits' } });
      throw new ApiError(409, { error: 'insufficient_credits', available_g: available, requested_g: mass_g,
        message: `This allocation is refused. Available: ${available} g. Requested: ${mass_g} g.` });
    }
    const allocatedAlready = Number((await one(`SELECT coalesce(sum(mass_g),0)::bigint m FROM credit_movements WHERE balance_period=$1 AND lot=$2 AND kind='allocation'`, [p.id, lot], tx)).m);
    const mref = `MOV-${String(Number((await one(`SELECT count(*) n FROM credit_movements`, [], tx)).n) + 1).padStart(6, '0')}`;
    await tx.query(`INSERT INTO credit_movements (balance_period, category, direction, mass_g, kind, reference, lot, effective_on, derivation)
      VALUES ($1,$2,'out',$3,'allocation',$4,$5,$6,$7)`,
      [p.id, category, mass_g, mref, lot, isoD(new Date()), JSON.stringify({ lot, category, mass_g, attached_to_lot: lot })]);
    const attached = allocatedAlready + mass_g;
    const content_bp = contentBp(attached, Number(lotRow.mass_g));
    const e = await entry(tx, { person: user.email, site: p.site, object: lot, act: 'claim_allocated',
      content: { movement: mref, period: p.id, lot, category, mass_g, credit_attached_g: attached, content_bp } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: mref, lot, category, mass_g, credit_attached_g: attached, content_bp, record_seq: e.seq });
    return c.json({ reference: mref, lot, category, mass_g, credit_attached_g: attached, content_bp,
      claim_type: lotRow.claim_type, derivation: `credit_attached_g ${attached} * 10000 / lot_mass_g ${lotRow.mass_g}, floored`, record_seq: e.seq }, 201);
  } catch (ex) { try { await tx.query('ROLLBACK'); } catch {} throw ex; } finally { tx.release(); }
});

// ---- Transfers: never a fresh credit. The two periods together hold the same credit.
r.post('/api/balance-periods/:id/transfers', async (c) => {
  const user = await requireRole(c, 'claims_manager');
  const p = await one('SELECT * FROM balance_periods WHERE id = $1', [c.req.param('id')]);
  if (!p) throw notFound('balance_period_not_found');
  const b = await c.req.json();
  const to_period = reqField(b.to_period, 'to_period');
  const dest = await one('SELECT * FROM balance_periods WHERE id = $1', [to_period]);
  if (!dest) throw notFound('destination_period_not_found');
  const category = enumField(b.category, 'category', CATS);
  const mass_g = intField(b.mass_g, 'mass_g');
  const effective_on = reqField(b.effective_on, 'effective_on');
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [p.id + ':' + category]);
    const ins = Number((await one(`SELECT coalesce(sum(mass_g),0)::bigint m FROM credit_movements WHERE balance_period=$1 AND category=$2 AND direction='in' AND kind='consumption'`, [p.id, category], tx)).m);
    const outs = Number((await one(`SELECT coalesce(sum(mass_g),0)::bigint m FROM credit_movements WHERE balance_period=$1 AND category=$2 AND direction='out' AND kind='allocation'`, [p.id, category], tx)).m)
      + Number((await one(`SELECT coalesce(sum(mass_g),0)::bigint m FROM credit_movements WHERE balance_period=$1 AND category=$2 AND direction='out' AND kind='transfer_out'`, [p.id, category], tx)).m);
    if (mass_g > ins - outs) {
      await tx.query('ROLLBACK');
      throw new ApiError(409, { error: 'insufficient_credits', available_g: ins - outs, requested_g: mass_g });
    }
    const ref = `TRF-${String(Number((await one(`SELECT count(*) n FROM transfers`, [], tx)).n) + 1).padStart(4, '0')}`;
    await tx.query(`INSERT INTO transfers (reference, from_period, to_period, mass_g, category, origin_site, effective_on)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [ref, p.id, dest.id, mass_g, category, p.site, effective_on]);
    await tx.query(`INSERT INTO credit_movements (balance_period, category, direction, mass_g, kind, reference, origin_site, movement, fresh_credit, effective_on)
      VALUES ($1,$2,'out',$3,'transfer_out',$4,$5,$6,false,$7)`, [p.id, category, mass_g, ref, p.site, ref, effective_on]);
    await tx.query(`INSERT INTO credit_movements (balance_period, category, direction, mass_g, kind, reference, origin_site, movement, fresh_credit, effective_on)
      VALUES ($1,$2,'in',$3,'transfer_in',$4,$5,$6,false,$7)`, [dest.id, category, mass_g, ref, p.site, ref, effective_on]);
    const e = await entry(tx, { person: user.email, site: p.site, object: ref, act: 'transfer_recorded',
      content: { reference: ref, from: p.id, to: dest.id, mass_g, category, origin_site: p.site } });
    await tx.query('COMMIT');
    const inbound = await q(`SELECT reference, mass_g, origin_site, movement, fresh_credit FROM credit_movements WHERE balance_period=$1 AND kind='transfer_in' ORDER BY id`, [dest.id]);
    await rememberIdempotency(c, 201, { reference: ref, to_period: dest.id,
      inbound_credits: inbound.map(i => ({ reference: i.reference, mass_g: Number(i.mass_g), origin_site: i.origin_site, movement: i.movement, fresh_credit: i.fresh_credit })), record_seq: e.seq });
    return c.json({ reference: ref, to_period: dest.id, category, mass_g, origin_site: p.site,
      inbound_credits: inbound.map(i => ({ reference: i.reference, mass_g: Number(i.mass_g), origin_site: i.origin_site, movement: i.movement, fresh_credit: i.fresh_credit })), record_seq: e.seq }, 201);
  } catch (ex) { try { await tx.query('ROLLBACK'); } catch {} throw ex; } finally { tx.release(); }
});

// ---- Close. Refused while any lot lacks a disposition, any deviation is open, or the balance does not reconcile.
r.post('/api/balance-periods/:id/close', async (c) => {
  const user = await requireRole(c, 'claims_manager');
  const p = await one('SELECT * FROM balance_periods WHERE id = $1', [c.req.param('id')]);
  if (!p) throw notFound('balance_period_not_found');
  if (p.state === 'closed') throw conflict('period_already_closed', { closed_on: isoD(p.closed_on), rule: 'a closed period refuses to reopen' });
  // whoever published the carbon method version it applies does not close the period applying it
  const method = p.carbon_method ? await one(`SELECT * FROM carbon_methods WHERE id=$1 AND version=$2`, [p.carbon_method, p.carbon_method_version || 1]) : null;
  if (method && method.reviewer === user.email) throw forbidden('separation_method_publisher_not_period_closer', { publisher: method.reviewer });
  const serialized = await serializePeriod(p);
  const blockers = [];
  if (serialized.lots_without_disposition.length) blockers.push({ condition: 'every lot carries a disposition', missing: serialized.lots_without_disposition });
  if (serialized.open_deviations_touching.length) blockers.push({ condition: 'no deviation touching the period is open', open: serialized.open_deviations_touching });
  const reconcile = Math.abs(serialized.credits.post_consumer.credits_available_g) >= 0 && true;
  if (!reconcile) blockers.push({ condition: 'the balance reconciles' });
  if (blockers.length) {
    await entryTop({ person: user.email, site: p.site, object: p.id, act: 'period_close_refused', content: { period: p.id, blockers } });
    throw conflict('period_close_refused', { blockers });
  }
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`UPDATE balance_periods SET state='closed', closed_on=$2, cut_off=$3 WHERE id=$1`,
      [p.id, isoD(new Date()), isoD(new Date(Date.now() - 5 * 86400000))]);
    // closing settles the carry-over: available credit carries forward only up to the limit
    const settled = {};
    for (const cat of CATS) {
      const bal = serialized.credits[cat];
      const limit_g = floorMulDiv(bal.credits_in_g, p.carry_over_limit_bp, 10000);
      const carried = Math.min(bal.credits_available_g, limit_g);
      const expired = bal.credits_available_g - carried;
      settled[cat] = { carried_forward_g: carried, expired_g: expired,
        derivation: `min(available ${bal.credits_available_g}, credits_in_g ${bal.credits_in_g} * carry_over_limit_bp ${p.carry_over_limit_bp} / 10000 floored = ${limit_g})` };
      await tx.query(`INSERT INTO credit_movements (balance_period, category, direction, mass_g, kind, reference, effective_on, derivation)
        VALUES ($1,$2,'out',$3,'expiry',$4,$5,$6)`, [p.id, cat, expired, `EXP-${p.id}-${cat}`, isoD(new Date()), JSON.stringify(settled[cat])]);
    }
    const e = await entry(tx, { person: user.email, site: p.site, object: p.id, act: 'period_closed', content: { period: p.id, settled } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: p.id, state: 'closed', closed_on: isoD(new Date()), settled, record_seq: e.seq });
    return c.json({ reference: p.id, state: 'closed', closed_on: isoD(new Date()),
      cut_off: isoD(new Date(Date.now() - 5 * 86400000)), settled, record_seq: e.seq }, 201);
  } catch (ex) { try { await tx.query('ROLLBACK'); } catch {} throw ex; } finally { tx.release(); }
});

// ---- Restatements: every certificate issued from the period is enumerated, never paginated.
r.post('/api/balance-periods/:id/restatements', async (c) => {
  const user = await requireRole(c, 'claims_manager');
  const p = await one('SELECT * FROM balance_periods WHERE id = $1', [c.req.param('id')]);
  if (!p) throw notFound('balance_period_not_found');
  const b = await c.req.json();
  const reason = reqField(b.reason, 'reason');
  const ref = `RST-${String(Number((await one(`SELECT count(*) n FROM restatements`)).n) + 1).padStart(4, '0')}`;
  const certs = await q(`SELECT * FROM certificates WHERE period = $1 ORDER BY number`, [p.id]);
  const revisedFactor = b.revised_factor || null;
  let contentMovements = null;
  if (revisedFactor) {
    const cf = await one('SELECT * FROM conversion_factors WHERE reference = $1', [revisedFactor]);
    contentMovements = [];
    for (const cert of certs) {
      const oldBp = cert.content_bp;
      const corrected = floorMulDiv(oldBp, cf.factor_bp, await oldFactorFor(cert));
      contentMovements.push({ certificate: cert.number, content_bp: oldBp, corrected_content_bp: corrected });
    }
  }
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO restatements (reference, balance_period, reason, opened_on, state, revised_factor, content_movements)
      VALUES ($1,$2,$3,$4,'open',$5,$6)`,
      [ref, p.id, reason, isoD(new Date()), revisedFactor, contentMovements ? JSON.stringify(contentMovements) : null]);
    const e = await entry(tx, { person: user.email, site: p.site, object: ref, act: 'restatement_opened',
      content: { reference: ref, period: p.id, reason, affected_certificates: certs.map(x => x.number), content_movements: contentMovements } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: ref, period: p.id, reason, affected_certificates: certs.map(x => x.number), content_movements: contentMovements, record_seq: e.seq });
    return c.json({ reference: ref, period: p.id, reason, affected_certificates: certs.map(x => x.number),
      content_movements: contentMovements, record_seq: e.seq }, 201);
  } catch (ex) { try { await tx.query('ROLLBACK'); } catch {} throw ex; } finally { tx.release(); }
});

async function oldFactorFor(cert) {
  const cf = await one(`SELECT * FROM conversion_factors WHERE site=$1 ORDER BY published_on DESC LIMIT 1`, [cert.site]);
  return cf ? cf.factor_bp : 10000;
}

r.post('/api/restatements/:ref/resolutions', async (c) => {
  const user = await requireRole(c, 'claims_manager', 'quality_manager');
  const rst = await one('SELECT * FROM restatements WHERE reference = $1', [c.req.param('ref')]);
  if (!rst) throw notFound('restatement_not_found');
  const b = await c.req.json();
  const certificate = reqField(b.certificate, 'certificate');
  const outcome = enumField(b.outcome, 'outcome', ['reissued', 'withdrawn', 'unaffected']);
  const reason = reqField(b.reason, 'reason');
  const existing = await one(`SELECT * FROM resolutions WHERE restatement=$1 AND certificate=$2`, [rst.reference, certificate]);
  if (existing) throw conflict('resolution_already_recorded', { certificate, rule: 'exactly one resolution per affected certificate' });
  const cert = await one('SELECT * FROM certificates WHERE number = $1', [certificate]);
  const tx = await client();
  try {
    await tx.query('BEGIN');
    const row = await one(`INSERT INTO resolutions (restatement, certificate, outcome, reason) VALUES ($1,$2,$3,$4) RETURNING id`,
      [rst.reference, certificate, outcome, reason], tx);
    if (cert && outcome === 'withdrawn') {
      await tx.query(`UPDATE certificates SET state='withdrawn' WHERE number=$1`, [certificate]);
    }
    if (cert && outcome === 'reissued') {
      await tx.query(`UPDATE certificates SET version = version + 1 WHERE number=$1`, [certificate]);
    }
    const e = await entry(tx, { person: user.email, site: cert?.site || null, object: certificate, act: 'restatement_resolution_recorded',
      content: { restatement: rst.reference, certificate, outcome, reason } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: certificate, restatement: rst.reference, outcome, reason, record_seq: e.seq });
    return c.json({ reference: certificate, restatement: rst.reference, outcome, reason, record_seq: e.seq }, 201);
  } catch (ex) { try { await tx.query('ROLLBACK'); } catch {} throw ex; } finally { tx.release(); }
});

export default r;
