import { Hono } from 'hono';
import { currentSession, hasRole } from '../lib/auth.js';
import { withIdempotency } from '../lib/idempotency.js';
import { appendEntry } from '../lib/record.js';
import { computeFactorBp, floorDiv, today } from '../lib/units.js';
import { nextReference } from '../db.js';

const r = new Hono();

function ledgerView(t) {
  return {
    post_consumer: { credits_in_g: t.post_consumer.credits_in_g, credits_out_g: t.post_consumer.credits_out_g, credits_available_g: t.post_consumer.credits_available_g },
    pre_consumer: { credits_in_g: t.pre_consumer.credits_in_g, credits_out_g: t.pre_consumer.credits_out_g, credits_available_g: t.pre_consumer.credits_available_g },
    non_claimable: { credits_in_g: t.non_claimable.credits_in_g, credits_out_g: t.non_claimable.credits_out_g, credits_available_g: t.non_claimable.credits_available_g }
  };
}

r.get('/balance-periods', async (c) => {
  const db = c.get('db');
  const { ledgerForPeriod } = await import('../lib/engine.js');
  const rows = (await db.query('SELECT * FROM balance_period ORDER BY period_start')).rows;
  const out = [];
  for (const p of rows) {
    const l = await ledgerForPeriod(db, p.id);
    out.push(await periodOut(db, p, l));
  }
  return c.json(out);
});

async function periodOut(db, p, l) {
  return {
    id: p.id,
    site: p.site,
    grade: p.grade,
    period: { start: p.period_start, end: p.period_end },
    state: p.state,
    credits: ledgerView(l.totals),
    non_claimable_input_g: l.non_claimable_input_g,
    conversion_factors: l.conversion_factors,
    carry_over_limit_bp: p.carry_over_limit_bp,
    allocation_basis: p.allocation_basis,
    override_count: l.override_count,
    open_restatement_count: l.open_restatement_count,
    open_finding_count: l.open_finding_count,
    closed_on: p.closed_on,
    cut_off: p.cut_off,
    carried_forward_g: p.carried_forward || null,
    expired_g: p.expired || null,
    derivation: {
      note: 'A balance is the sum of its movements and is never held as a total.',
      movements: l.movements.map((m) => ({ id: m.id, category: m.category, direction: m.direction, kind: m.kind, mass_g: m.mass_g, effective_on: m.effective_on, derivation: m.derivation }))
    },
    read_at: new Date().toISOString()
  };
}

r.get('/balance-periods/:id', async (c) => {
  const db = c.get('db');
  const { ledgerForPeriod } = await import('../lib/engine.js');
  const p = (await db.query('SELECT * FROM balance_period WHERE id=$1', [c.req.param('id')])).rows[0];
  if (!p) return c.json({ error: 'not_found' }, 404);
  const l = await ledgerForPeriod(db, p.id);
  const transfers = (await db.query('SELECT * FROM transfer WHERE destination_period=$1', [p.id])).rows;
  return c.json({
    ...(await periodOut(db, p, l)),
    inbound_credits: transfers.map((t) => ({
      reference: t.reference, mass_g: t.mass_g, origin_site: t.origin_site,
      movement: t.reference, fresh_credit: false, category: t.category
    }))
  });
});

// Allocation: available margin at the instant of refusal, one success under a race.
r.post('/balance-periods/:id/allocations', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'claims_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted', message: 'Only a claims manager allocates claim.' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    if (!body.lot || !['post_consumer', 'pre_consumer'].includes(body.category) || !Number.isInteger(body.mass_g)) {
      return Response.json({ error: 'invalid_request', message: 'lot, category and integer mass_g are required' }, { status: 400 });
    }
    const lot = (await db.query('SELECT * FROM lot WHERE reference=$1', [body.lot])).rows[0];
    if (!lot) return Response.json({ error: 'unknown_lot' }, { status: 400 });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [884001]);
      const p = (await client.query('SELECT * FROM balance_period WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!p) { await client.query('ROLLBACK'); return Response.json({ error: 'not_found' }, { status: 404 }); }
      if (p.state === 'closed') {
        await client.query('ROLLBACK');
        await appendEntry(db, {
          kind: 'allocation_refused', object_ref: body.lot, person: s.email, site: p.site,
          content: { period: id, lot: body.lot, reason: 'period_closed' }
        });
        return Response.json({ error: 'period_closed', message: 'This period is closed. Corrections require a restatement.' }, { status: 409 });
      }
      const movements = (await client.query('SELECT * FROM credit_movement WHERE period=$1', [id])).rows;
      const ins = movements.filter((m) => m.direction === 'in' && ['consumption', 'carry_over', 'transfer'].includes(m.kind) && m.category === body.category).reduce((s2, m) => s2 + m.mass_g, 0);
      const outs = movements.filter((m) => m.direction === 'out' && m.kind === 'allocation' && m.category === body.category).reduce((s2, m) => s2 + m.mass_g, 0);
      const available = ins - outs;
      if (body.mass_g > available) {
        await client.query('ROLLBACK');
        await appendEntry(db, {
          kind: 'allocation_refused', object_ref: body.lot, person: s.email, site: p.site,
          content: {
            period: id, lot: body.lot, category: body.category,
            requested_g: body.mass_g, available_g: available,
            note: 'the available figure is the margin at the instant of refusal'
          }
        });
        return Response.json({
          error: 'allocation_refused',
          message: `This allocation is refused. Available: ${available} g. Requested: ${body.mass_g} g.`,
          available_g: available,
          requested_g: body.mass_g
        }, { status: 409 });
      }
      const already = movements.filter((m) => m.direction === 'out' && m.kind === 'allocation' && (m.derivation || {}).lot === body.lot && m.category === body.category);
      void already;
      await client.query(
        `INSERT INTO credit_movement (period,category,direction,kind,mass_g,derivation,effective_on,recorded_at)
         VALUES ($1,$2,'out','allocation',$3,$4,$5,now())`,
        [id, body.category, body.mass_g,
          JSON.stringify({ lot: body.lot, note: 'credits attached to a lot leave the ledger' }),
          today()]);
      await client.query('COMMIT');
      const attached = (await db.query(
        `SELECT coalesce(sum(mass_g),0)::int AS g FROM credit_movement WHERE direction='out' AND kind='allocation' AND derivation->>'lot'=$1`,
        [body.lot])).rows[0].g;
      const content_bp = floorDiv(attached * 10000, lot.mass_g);
      await appendEntry(db, {
        kind: 'allocation_recorded', object_ref: body.lot, person: s.email, site: p.site,
        content: { period: id, lot: body.lot, category: body.category, mass_g: body.mass_g, content_bp_after: content_bp }
      });
      return Response.json({
        lot: body.lot,
        category: body.category,
        mass_g: body.mass_g,
        credit_attached_g: attached,
        content_bp,
        claim_type: lot.claim_type,
        derivation: { formula: 'credit_attached_g * 10000 / lot_mass_g, floored', lot_mass_g: lot.mass_g }
      }, { status: 201 });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  });
});

// Transfers: inbound credit naming its origin, never a fresh credit.
r.post('/balance-periods/:id/transfers', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'claims_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    if (!body.origin_period || !Number.isInteger(body.mass_g) || !['post_consumer', 'pre_consumer'].includes(body.category)) {
      return Response.json({ error: 'invalid_request', message: 'origin_period, category and integer mass_g are required' }, { status: 400 });
    }
    const dest = (await db.query('SELECT * FROM balance_period WHERE id=$1', [id])).rows[0];
    const origin = (await db.query('SELECT * FROM balance_period WHERE id=$1', [body.origin_period])).rows[0];
    if (!dest || !origin) return Response.json({ error: 'not_found' }, { status: 404 });
    const reference = await nextReference(db, 'TRF-', 4);
    await db.query(
      `INSERT INTO transfer (reference,mass_g,category,origin_period,destination_period,origin_site,moved_on,recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
      [reference, body.mass_g, body.category, origin.id, dest.id, origin.site, today()]);
    await db.query(
      `INSERT INTO credit_movement (period,category,direction,kind,mass_g,derivation,effective_on,recorded_at)
       VALUES ($1,$2,'in','transfer',$3,$4,$5,now())`,
      [dest.id, body.category, body.mass_g,
        JSON.stringify({ transfer: reference, origin_site: origin.site, origin_period: origin.id, fresh_credit: false }), today()]);
    await db.query(
      `INSERT INTO credit_movement (period,category,direction,kind,mass_g,derivation,effective_on,recorded_at)
       VALUES ($1,$2,'out','transfer',$3,$4,$5,now())`,
      [origin.id, body.category, body.mass_g,
        JSON.stringify({ transfer: reference, destination_period: dest.id, fresh_credit: false }), today()]);
    await appendEntry(db, {
      kind: 'transfer_recorded', object_ref: reference, person: s.email, site: dest.site,
      content: { reference, mass_g: body.mass_g, origin_site: origin.site, fresh_credit: false }
    });
    const transfers = (await db.query('SELECT * FROM transfer WHERE destination_period=$1', [dest.id])).rows;
    return Response.json({
      reference,
      inbound_credits: transfers.map((t) => ({
        reference: t.reference, mass_g: t.mass_g, origin_site: t.origin_site,
        movement: t.reference, fresh_credit: false, category: t.category
      }))
    }, { status: 201 });
  });
});

// Close: refuses while a lot lacks a disposition, a deviation is open, or the
// balance does not reconcile. Refused for the method publisher.
r.post('/balance-periods/:id/close', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'claims_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const id = c.req.param('id');
    const p = (await db.query('SELECT * FROM balance_period WHERE id=$1', [id])).rows[0];
    if (!p) return Response.json({ error: 'not_found' }, { status: 404 });
    if (p.state === 'closed') {
      return Response.json({ error: 'period_closed', message: 'A closed period refuses every further write and refuses to reopen.' }, { status: 409 });
    }
    // Whoever published the carbon method version does not close the period applying it.
    if (p.carbon_method) {
      const m = (await db.query('SELECT * FROM carbon_method WHERE reference=$1 AND version=$2',
        [p.carbon_method, p.carbon_method_version])).rows[0];
      if (m && m.published_by === s.email) {
        return Response.json({
          error: 'separation_refused', separation: 'method_publisher_not_period_closer',
          message: 'Whoever published a carbon method version does not close the period applying it.'
        }, { status: 403 });
      }
    }
    const lots = (await db.query('SELECT * FROM lot WHERE site=$1 AND grade=$2', [p.site, p.grade])).rows;
    const pending = lots.filter((l) => l.disposition === 'pending').map((l) => l.reference);
    const open = (await db.query("SELECT * FROM deviation WHERE state='open'")).rows
      .filter((d) => lots.some((l) => (d.affects_lots || []).includes(l.reference)))
      .map((d) => d.reference);
    const movements = (await db.query('SELECT * FROM credit_movement WHERE period=$1', [id])).rows;
    let reconciles = true;
    for (const cat of ['post_consumer', 'pre_consumer']) {
      const ins = movements.filter((m) => m.direction === 'in' && ['consumption', 'carry_over', 'transfer'].includes(m.kind) && m.category === cat).reduce((s2, m) => s2 + m.mass_g, 0);
      const outs = movements.filter((m) => m.direction === 'out' && m.category === cat).reduce((s2, m) => s2 + m.mass_g, 0);
      if (outs > ins) reconciles = false;
    }
    if (pending.length || open.length || !reconciles) {
      return Response.json({
        error: 'close_refused',
        lots_without_disposition: pending,
        open_deviations: open,
        balance_reconciles: reconciles
      }, { status: 409 });
    }
    const cutOff = today();
    const carried = {};
    const expired = {};
    for (const cat of ['post_consumer', 'pre_consumer']) {
      const ins = movements.filter((m) => m.direction === 'in' && m.category === cat).reduce((s2, m) => s2 + m.mass_g, 0);
      const outs = movements.filter((m) => m.direction === 'out' && m.category === cat).reduce((s2, m) => s2 + m.mass_g, 0);
      const available = ins - outs;
      const limit = floorDiv(ins * p.carry_over_limit_bp, 10000);
      carried[cat] = Math.min(available, limit);
      expired[cat] = available - Math.min(available, limit);
    }
    await db.query(
      `UPDATE balance_period SET state='closed', closed_on=$1, cut_off=$2, closed_by=$3, carried_forward=$4, expired=$5 WHERE id=$6`,
      [cutOff, cutOff, s.email, JSON.stringify(carried), JSON.stringify(expired), id]);
    await appendEntry(db, {
      kind: 'period_closed', object_ref: id, person: s.email, site: p.site,
      content: { id, closed_on: cutOff, cut_off: cutOff, carried_forward_g: carried, expired_g: expired }
    });
    return Response.json({
      id, state: 'closed', closed_on: cutOff, cut_off: cutOff,
      carried_forward_g: carried, expired_g: expired,
      derivation: 'carry-over is limited to carry_over_limit_bp of the credit that entered, floored; the remainder expires'
    }, { status: 201 });
  });
});

// Restatements: enumerate every certificate from the period.
r.post('/balance-periods/:id/restatements', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'claims_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const id = c.req.param('id');
    const p = (await db.query('SELECT * FROM balance_period WHERE id=$1', [id])).rows[0];
    if (!p) return Response.json({ error: 'not_found' }, { status: 404 });
    const body = await c.req.json().catch(() => ({}));
    if (!body.reason) return Response.json({ error: 'invalid_request', message: 'reason is required' }, { status: 400 });
    const certs = (await db.query('SELECT number, period, content_bp, lots FROM certificate WHERE period=$1', [id])).rows;
    const reference = await nextReference(db, 'RST-', 4);
    const movements = [];
    const revisedFactor = body.revised_factor_bp;
    if (Number.isInteger(revisedFactor) && Number.isInteger(body.original_factor_bp)) {
      for (const cert of certs) {
        const lotsArr = typeof cert.lots === 'string' ? JSON.parse(cert.lots) : cert.lots;
        const lotMass = lotsArr.reduce((s2, l) => s2 + (l.mass_g || 0), 0);
        const attached = Math.floor(lotMass * cert.content_bp / 10000);
        const correctedAttached = Math.floor(attached * revisedFactor / body.original_factor_bp);
        const corrected_bp = lotMass > 0 ? floorDiv(correctedAttached * 10000, lotMass) : 0;
        movements.push({
          certificate: cert.number,
          content_bp: cert.content_bp,
          corrected_content_bp: corrected_bp
        });
      }
    }
    await db.query(
      `INSERT INTO restatement (reference,period,reason,content_movements,opened_by,opened_on,state)
       VALUES ($1,$2,$3,$4,$5,$6,'open')`,
      [reference, id, body.reason, JSON.stringify(movements), s.email, today()]);
    await appendEntry(db, {
      kind: 'restatement_opened', object_ref: reference, person: s.email, site: p.site,
      content: { reference, period: id, reason: body.reason, certificates: certs.map((x) => x.number) }
    });
    return Response.json({
      reference,
      period: id,
      certificates: certs.map((x) => x.number),
      content_movements: movements
    }, { status: 201 });
  });
});

r.get('/restatements', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM restatement ORDER BY reference')).rows;
  const resolutions = (await db.query('SELECT * FROM resolution ORDER BY id')).rows;
  return c.json(rows.map((rst) => ({
    reference: rst.reference, period: rst.period, reason: rst.reason, state: rst.state,
    content_movements: rst.content_movements,
    resolutions: resolutions.filter((x) => x.restatement === rst.reference).map((x) => ({
      certificate: x.certificate, outcome: x.outcome, reason: x.reason, resolved_by: x.resolved_by, resolved_on: x.resolved_on
    }))
  })));
});

// One resolution per certificate per restatement, one certificate at a time.
r.post('/restatements/:reference/resolutions', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'claims_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const ref = c.req.param('reference');
    const rst = (await db.query('SELECT * FROM restatement WHERE reference=$1', [ref])).rows[0];
    if (!rst) return Response.json({ error: 'not_found' }, { status: 404 });
    if (rst.state !== 'open') return Response.json({ error: 'restatement_closed' }, { status: 409 });
    const body = await c.req.json().catch(() => ({}));
    if (!['reissued', 'withdrawn', 'unaffected'].includes(body.outcome)) {
      return Response.json({ error: 'invalid_outcome' }, { status: 400 });
    }
    if (!body.certificate || !body.reason) {
      return Response.json({ error: 'invalid_request', message: 'certificate, outcome and reason are required' }, { status: 400 });
    }
    const dup = await db.query('SELECT * FROM resolution WHERE restatement=$1 AND certificate=$2', [ref, body.certificate]);
    if (dup.rows.length) {
      return Response.json({
        error: 'already_resolved',
        message: 'Each affected certificate takes exactly one resolution in a restatement.'
      }, { status: 409 });
    }
    await db.query(
      `INSERT INTO resolution (restatement,certificate,outcome,reason,resolved_by,resolved_on)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ref, body.certificate, body.outcome, body.reason, s.email, today()]);
    if (body.outcome === 'withdrawn') {
      await db.query(`UPDATE certificate SET state='withdrawn' WHERE number=$1`, [body.certificate]);
    }
    if (body.outcome === 'reissued') {
      const existing = (await db.query('SELECT * FROM certificate WHERE number=$1', [body.certificate])).rows[0];
      if (existing) {
        const newVersion = existing.version + 1;
        const newNumber = `${existing.number.replace(/-\d+$/, '')}-R${newVersion}`;
        await db.query(
          `INSERT INTO certificate (number,version,site,lots,grade,specification_version,claim_type,content_bp,category_split,period,carbon,
             primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,signer,signed_at,verification_url,state,
             provisional_factor,conditions,input_versions,document,derived_from,recipient)
           SELECT $1,$2,site,lots,grade,specification_version,claim_type,content_bp,category_split,period,carbon,
             primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,signer,signed_at,
             replace(verification_url,$3,$4),state,provisional_factor,conditions,input_versions,document,$5,recipient
           FROM certificate WHERE number=$6`,
          [newNumber, newVersion, existing.number, newNumber, existing.number, existing.number]);
      }
    }
    await appendEntry(db, {
      kind: 'restatement_resolution_recorded', object_ref: `${ref}:${body.certificate}`, person: s.email, site: null,
      content: { restatement: ref, certificate: body.certificate, outcome: body.outcome }
    });
    return Response.json({ restatement: ref, certificate: body.certificate, outcome: body.outcome }, { status: 201 });
  });
});

// Conversion factors: the factor must be the arithmetic of its stated window.
r.post('/conversion-factors', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'claims_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted', message: 'Only a claims manager publishes a conversion factor.' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    const { site, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g } = body;
    if (!site || !Number.isInteger(factor_bp)) {
      return Response.json({ error: 'invalid_request', message: 'site and integer factor_bp are required' }, { status: 400 });
    }
    const provisional = derived_in_g === 0;
    if (!provisional) {
      if (!Number.isInteger(derived_in_g) || !Number.isInteger(derived_out_g) || !derived_from || !derived_to) {
        return Response.json({ error: 'invalid_request', message: 'a derived factor carries its window and both masses' }, { status: 400 });
      }
      const expected = computeFactorBp(derived_in_g, derived_out_g);
      if (expected !== factor_bp) {
        return Response.json({
          error: 'factor_does_not_reconcile',
          message: `factor_bp must equal derived_out_g * 10000 / derived_in_g, floored, which is ${expected}.`,
          factor_bp, expected_factor_bp: expected
        }, { status: 400 });
      }
    }
    const count = (await db.query('SELECT count(*)::int AS n FROM conversion_factor')).rows[0].n;
    const reference = `CF-${site.replace('SITE-', '')}-${count + 1}`;
    await db.query(
      `INSERT INTO conversion_factor (reference,site,factor_bp,derived_from,derived_to,derived_in_g,derived_out_g,provisional,published_by,published_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [reference, site, factor_bp, derived_from || null, derived_to || null,
        Number.isInteger(derived_in_g) ? derived_in_g : 0, Number.isInteger(derived_out_g) ? derived_out_g : 0,
        provisional, s.email, today()]);
    await appendEntry(db, {
      kind: 'conversion_factor_published', object_ref: reference, person: s.email, site,
      content: { reference, factor_bp, derived_in_g: derived_in_g ?? 0, derived_out_g: derived_out_g ?? 0, provisional }
    });
    return Response.json({ reference, factor_bp, provisional }, { status: 201 });
  });
});

r.get('/conversion-factors', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM conversion_factor ORDER BY reference')).rows;
  return c.json(rows.map((f) => ({
    reference: f.reference, site: f.site, factor_bp: f.factor_bp,
    derivation_window: { from: f.derived_from, to: f.derived_to },
    derived_in_g: f.derived_in_g, derived_out_g: f.derived_out_g,
    provisional: f.provisional, published_by: f.published_by, published_on: f.published_on
  })));
});

export default r;
