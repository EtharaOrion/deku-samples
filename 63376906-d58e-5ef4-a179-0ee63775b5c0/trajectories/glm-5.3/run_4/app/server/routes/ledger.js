import { Hono } from 'hono';
import { q, tx, pool } from '../db.js';
import { requireSession } from '../auth.js';
import { idempotent, readBody, refuse, recordTx, requireKeys, intOr } from '../lib/http.js';
import { periodCredits, creditFigure, lotAllocated } from '../lib/engine.js';
import { nowIso, floorDiv, sha256 } from '../lib/util.js';

const ledger = new Hono();
ledger.use('*', requireSession());

function derivationFor(movements) {
  return movements.map((m) => ({
    movement_id: m.id, kind: m.kind, category: m.category, direction: m.direction,
    mass_g: Number(m.mass_g), lot: m.lot, batch: m.consumed_batch, transfer: m.transfer,
    basis: m.derivation || {}, effective_on: m.effective_on
  }));
}

async function periodView(bp) {
  const { movements, factor_bp, factor_reference, credits } = await periodCredits(bp.id);
  const overrides = await q('SELECT COUNT(*)::int AS n FROM override WHERE lot IN (SELECT reference FROM lot WHERE site = $1)', [bp.site]);
  const restatements = await q('SELECT COUNT(*)::int AS n FROM restatement WHERE balance_period = $1 AND closed = false', [bp.id]);
  const findings = await q('SELECT COUNT(*)::int AS n FROM finding WHERE open = true');
  const nonClaim = movements.filter((m) => m.kind === 'non_claimable_input').reduce((s, m) => s + Number(m.mass_g), 0);
  const inbound = movements
    .filter((m) => m.kind === 'transfer_in')
    .map((m) => ({
      reference: m.transfer, mass_g: Number(m.mass_g), origin_site: (m.derivation || {}).origin_site || null,
      movement: m.transfer, fresh_credit: false
    }));
  const transferOut = movements
    .filter((m) => m.kind === 'transfer_out')
    .reduce((s, m) => s + Number(m.mass_g), 0);
  const inboundTotal = inbound.reduce((s, x) => s + x.mass_g, 0);
  const availableWithTransfers = {};
  for (const cat of ['post_consumer', 'pre_consumer']) {
    const fig = creditFigure(credits, cat);
    const tIn = movements.filter((m) => m.kind === 'transfer_in' && m.category === cat).reduce((s, m) => s + Number(m.mass_g), 0);
    const tOut = movements.filter((m) => m.kind === 'transfer_out' && m.category === cat).reduce((s, m) => s + Number(m.mass_g), 0);
    availableWithTransfers[cat] = {
      ...fig,
      credits_available_g: fig.credits_available_g + tIn - tOut
    };
  }
  return {
    id: bp.id, site: bp.site, grade: bp.grade, period: { from: bp.period_from, to: bp.period_to },
    state: bp.state, state_word: bp.state, closed_on: bp.closed_on, cut_off: bp.cut_off,
    carry_over_limit_bp: bp.carry_over_limit_bp,
    post_consumer: availableWithTransfers.post_consumer,
    pre_consumer: availableWithTransfers.pre_consumer,
    inbound_credits: inbound,
    transferred_out_g: transferOut,
    conversion_factors: factor_reference ? [{ reference: factor_reference, factor_bp, derivation_window: { from: null, to: null } }] : [],
    allocation_basis: bp.allocation_basis,
    override_count: overrides.rows[0].n,
    open_restatement_count: restatements.rows[0].n,
    open_finding_count: findings.rows[0].n,
    non_claimable_input_g: nonClaim,
    carried_forward_g: bp.carried_forward || { post_consumer: 0, pre_consumer: 0 },
    expired_g: bp.expired || { post_consumer: 0, pre_consumer: 0 },
    balance_is_sum_of_movements: true,
    derivation: derivationFor(movements)
  };
}

ledger.get('/', async (c) => {
  const r = await q('SELECT * FROM balance_period ORDER BY id');
  return c.json(await Promise.all(r.rows.map(periodView)));
});

ledger.get('/:id', async (c) => {
  const r = await q('SELECT * FROM balance_period WHERE id = $1', [c.req.param('id')]);
  if (!r.rows.length) return c.json({ error: 'not_found' }, 404);
  return c.json(await periodView(r.rows[0]));
});

// Allocations: the invariant is enforced inside a transaction with a row lock so
// two racing allocations for the same remainder produce one success and one refusal.
ledger.post('/:id/allocations', async (c) => {
  const user = c.get('user');
  if (user.role !== 'claims_manager') {
    refuse(403, 'forbidden', { message: 'A claims manager allocates claim to a lot.' });
  }
  // An allocation is one act: the idempotency key is checked before any credit moves.
  const rawBody = await c.req.raw.clone().text().catch(() => '');
  const key = c.req.header('idempotency-key');
  if (!key) refuse(400, 'idempotency_key_required', { message: 'A write without an Idempotency-Key is refused, so a retry can never be indistinguishable from a second act.' });
  const bodyHash = sha256(rawBody);
  const existing = await q('SELECT * FROM idempotency WHERE key=$1 AND route=$2', [key, c.req.path]);
  if (existing.rows.length) {
    const row = existing.rows[0];
    if (row.body_hash !== bodyHash) {
      refuse(409, 'idempotency_key_reuse', { message: 'A key is a promise about one act, not a licence to replace it.' });
    }
    return c.json(row.response, row.status);
  }
  const body = JSON.parse(rawBody || '{}');
  requireKeys(body, ['lot', 'category', 'mass_g']);
  if (!['post_consumer', 'pre_consumer'].includes(body.category)) refuse(400, 'unknown_category');
  const requested = intOr(body.mass_g);
  if (requested <= 0) refuse(400, 'mass_must_be_positive');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // serialize against other allocations on this period
    await client.query('SELECT * FROM balance_period WHERE id = $1 FOR UPDATE', [c.req.param('id')]);
    const bp = (await client.query('SELECT * FROM balance_period WHERE id = $1', [c.req.param('id')])).rows[0];
    if (!bp) { await client.query('ROLLBACK'); refuse(404, 'not_found'); }
    if (bp.state === 'closed') {
      await client.query('ROLLBACK');
      refuse(409, 'period_closed', { message: 'A closed period refuses every further write. Corrections require a restatement.' });
    }
    const { movements, factor_bp, credits } = await periodCredits(c.req.param('id'));
    const tIn = movements.filter((m) => m.kind === 'transfer_in' && m.category === body.category).reduce((s, m) => s + Number(m.mass_g), 0);
    const tOut = movements.filter((m) => m.kind === 'transfer_out' && m.category === body.category).reduce((s, m) => s + Number(m.mass_g), 0);
    const avail = creditFigure(credits, body.category).credits_available_g + tIn - tOut;
    if (requested > avail) {
      await client.query('ROLLBACK');
      await recordTx(null, {
        user, act: 'allocation_refused', object: c.req.param('id'), site: bp.site, refused: true,
        payload: { available_g: avail, requested_g: requested, lot: body.lot, category: body.category, message: 'This allocation is refused. Credits attached never exceed credits available.' }
      });
      refuse(409, 'insufficient_credits', {
        available_g: avail, requested_g: requested,
        message: 'This allocation is refused. Available: ' + avail + ' g. Requested: ' + requested + ' g.'
      });
    }
    await client.query(
      `INSERT INTO credit_movement (balance_period, category, direction, mass_g, lot, kind, derivation, effective_on)
       VALUES ($1,$2,'out',$3,$4,'allocation',$5,$6)`,
      [c.req.param('id'), body.category, requested, body.lot,
       JSON.stringify({ by: user.email, available_before_g: avail, requested_g: requested }), nowIso().slice(0, 10)]
    );
    await appendEntryOn(client, {
      person: user.email, act: 'claim_allocated', object: body.lot, site: bp.site,
      payload: { mass_g: requested, category: body.category, balance_period: c.req.param('id'), available_before_g: avail }
    });
    await client.query('COMMIT');
    const result = { reference: body.lot, lot: body.lot, mass_g: requested, category: body.category, available_after_g: avail - requested };
    await q('INSERT INTO idempotency (key, route, body_hash, status, response) VALUES ($1,$2,$3,201,$4) ON CONFLICT DO NOTHING',
      [key, c.req.path, bodyHash, JSON.stringify(result)]);
    return c.json(result, 201);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
});

async function appendEntryOn(client, fields) {
  const last = await client.query('SELECT digest FROM record_entry ORDER BY seq DESC LIMIT 1');
  const prev = last.rows.length ? last.rows[0].digest : '0'.repeat(64);
  const crypto = await import('node:crypto');
  const body = JSON.stringify({
    event_at: '', effective_on: '', person: fields.person || 'system', site: fields.site || null,
    object: fields.object || null, act: fields.act, payload: fields.payload || {}, kind: 'act',
    refused: false, outcome: null, corrects: null
  });
  const digest = crypto.createHash('sha256').update(prev + '|' + body).digest('hex');
  await client.query(
    `INSERT INTO record_entry (person, site, object, act, payload, digest, prev_digest) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [fields.person || 'system', fields.site || null, fields.object || null, fields.act, body, digest, prev]
  );
}

ledger.post('/:id/transfers', async (c) => {
  const user = c.get('user');
  if (user.role !== 'claims_manager') refuse(403, 'forbidden', { message: 'A claims manager moves material between sites.' });
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['to_period', 'mass_g', 'category']);
    const from = (await q('SELECT * FROM balance_period WHERE id = $1', [c.req.param('id')])).rows[0];
    const to = (await q('SELECT * FROM balance_period WHERE id = $1', [body.to_period])).rows[0];
    if (!from || !to) refuse(404, 'not_found');
    if (from.state === 'closed' || to.state === 'closed') refuse(409, 'period_closed');
    const ref = await tx(async (client) => {
      const r = await client.query('INSERT INTO ref_seq (kind, n) VALUES ($1, 1) ON CONFLICT (kind) DO UPDATE SET n = ref_seq.n + 1 RETURNING n', ['trf']);
      const tref = 'TRF-' + String(r.rows[0].n).padStart(4, '0');
      await client.query(`INSERT INTO transfer (reference, from_period, to_period, mass_g, category, moved_on) VALUES ($1,$2,$3,$4,$5,$6)`,
        [tref, from.id, to.id, intOr(body.mass_g), body.category, nowIso().slice(0, 10)]);
      await client.query(`INSERT INTO credit_movement (balance_period, category, direction, mass_g, kind, derivation, effective_on, transfer) VALUES ($1,$2,'out',$3,'transfer_out',$4,$5,$6)`,
        [from.id, body.category, intOr(body.mass_g), JSON.stringify({ destination_period: to.id, movement: tref }), nowIso().slice(0, 10), tref]);
      await client.query(`INSERT INTO credit_movement (balance_period, category, direction, mass_g, kind, derivation, effective_on, transfer) VALUES ($1,$2,'in',$3,'transfer_in',$4,$5,$6)`,
        [to.id, body.category, intOr(body.mass_g), JSON.stringify({ origin_site: from.site, movement: tref, fresh_credit: false }), nowIso().slice(0, 10), tref]);
      await appendEntryOn(client, { person: user.email, act: 'transfer_recorded', object: tref, site: from.site, payload: { mass_g: intOr(body.mass_g), from: from.id, to: to.id } });
      return tref;
    });
    return { reference: ref };
  });
});

ledger.post('/:id/close', async (c) => {
  const user = c.get('user');
  if (user.role !== 'claims_manager') {
    refuse(403, 'forbidden', { message: 'A claims manager closes a balance period.' });
  }
  const bp = (await q('SELECT * FROM balance_period WHERE id = $1', [c.req.param('id')])).rows[0];
  if (!bp) refuse(404, 'not_found');
  if (bp.state === 'closed') refuse(409, 'already_closed', { message: 'A closed period refuses every further write and refuses to reopen.' });
  // separation: whoever published the carbon method version in force does not close the period
  const method = await q(`SELECT * FROM carbon_method WHERE superseded = false ORDER BY version DESC LIMIT 1`);
  if (method.rows.length && method.rows[0].published_by === user.email) {
    refuse(403, 'separation_refused', { separation: 'publisher_not_closer', message: 'Whoever published a carbon method version does not close the period applying it.' });
  }
  // every lot in the period must carry a disposition
  const pending = await q(`SELECT reference FROM lot WHERE site = $1 AND disposition = 'pending'`, [bp.site]);
  if (pending.rows.length) {
    refuse(409, 'lot_lacks_disposition', { lots: pending.rows.map((r) => r.reference), message: 'A lot in the period lacks a disposition.' });
  }
  const openDev = await q(`SELECT reference FROM deviation WHERE state = 'open'`);
  if (openDev.rows.length) {
    const lotsTouched = openDev.rows.map((r) => r.reference);
    refuse(409, 'open_deviation', { deviations: lotsTouched, message: 'A deviation touching the period is open.' });
  }
  const { credits } = await periodCredits(bp.id);
  for (const cat of ['post_consumer', 'pre_consumer']) {
    const fig = creditFigure(credits, cat);
    if (fig.credits_available_g < 0) refuse(409, 'balance_does_not_reconcile', { category: cat, ...fig });
  }
  // carry-over settlement
  const carried = {}, expired = {};
  for (const cat of ['post_consumer', 'pre_consumer']) {
    const fig = creditFigure(credits, cat);
    const limit = floorDiv(fig.credits_in_g * bp.carry_over_limit_bp, 10000);
    carried[cat] = Math.min(fig.credits_available_g, limit);
    expired[cat] = Math.max(fig.credits_available_g - limit, 0);
  }
  return await tx(async (client) => {
    await client.query('UPDATE balance_period SET state = $2, closed_on = $3, cut_off = $4, carried_forward = $5, expired = $6, closed_by = $7 WHERE id = $1',
      [bp.id, 'closed', nowIso().slice(0, 10), nowIso().slice(0, 10), JSON.stringify(carried), JSON.stringify(expired), user.email]);
    await appendEntryOn(client, { person: user.email, act: 'balance_period_closed', object: bp.id, site: bp.site, payload: { carried_forward_g: carried, expired_g: expired } });
    return { reference: bp.id, state: 'closed', closed_on: nowIso().slice(0, 10), carried_forward_g: carried, expired_g: expired };
  });
});

ledger.post('/:id/restatements', async (c) => {
  const user = c.get('user');
  if (user.role !== 'claims_manager') refuse(403, 'forbidden', { message: 'A claims manager opens a restatement.' });
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['reason']);
    const bp = (await q('SELECT * FROM balance_period WHERE id = $1', [c.req.param('id')])).rows[0];
    if (!bp) refuse(404, 'not_found');
    const certs = (await q('SELECT * FROM certificate WHERE balance_period = $1', [bp.id])).rows;
    let contentMovements = null;
    if (body.revised_factor_bp) {
      const factor = (await q(`SELECT * FROM conversion_factor WHERE site = $1 AND provisional = false ORDER BY published_on DESC LIMIT 1`, [bp.site])).rows[0];
      const revisedFactor = body.revised_factor_bp;
      contentMovements = certs.map((cert) => {
        const lotMass = (cert.lots || []).reduce((s, l) => s + Number(l.mass_g), 0);
        const corrected = floorDiv(Number(cert.content_bp) * revisedFactor, factor ? factor.factor_bp : 8000);
        return { certificate: cert.number, content_bp: cert.content_bp, corrected_content_bp: corrected };
      });
    }
    return await tx(async (client) => {
      const r = await client.query('INSERT INTO ref_seq (kind, n) VALUES ($1, 1) ON CONFLICT (kind) DO UPDATE SET n = ref_seq.n + 1 RETURNING n', ['rst']);
      const ref = 'RST-' + String(r.rows[0].n).padStart(3, '0');
      await client.query(`INSERT INTO restatement (reference, balance_period, reason, opened_on, opened_by, revised_factor_bp, content_movements) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ref, bp.id, body.reason, nowIso(), user.email, body.revised_factor_bp || null, contentMovements ? JSON.stringify(contentMovements) : null]);
      await appendEntryOn(client, { person: user.email, act: 'restatement_opened', object: ref, site: bp.site, payload: { reason: body.reason, certificates: certs.map((x) => x.number) } });
      return { reference: ref, certificates: certs.map((x) => x.number), content_movements: contentMovements };
    });
  });
});

export default ledger;
