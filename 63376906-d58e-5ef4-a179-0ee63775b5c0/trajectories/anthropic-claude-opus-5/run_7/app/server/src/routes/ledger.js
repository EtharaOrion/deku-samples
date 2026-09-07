import { Hono } from 'hono';
import { q, one, tx, pool } from '../db.js';
import { append } from '../record.js';
import { withIdempotency, ok, requireRole, requireSession, refusePagination } from '../http.js';
import { requireInteger, factorBp, carryOverCeiling, contentBp } from '../units.js';
import { periodView, lotClaim, carryOver, iso, readAt } from '../engine.js';

export const ledger = new Hono();

/* ------------------------------------------------------- balance periods */

ledger.get('/balance-periods', async (c) => {
  const bad = refusePagination(c); if (bad) return bad;
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT id FROM balance_period ORDER BY id');
  const out = [];
  for (const r of rows) out.push(await periodView(r.id));
  return c.json(out);
});

ledger.get('/balance-periods/:id', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const v = await periodView(c.req.param('id'));
  if (!v) return c.json({ error: 'not_found' }, 404);
  return c.json(v);
});

/**
 * Allocating claim to a lot. Credits attached never exceed credits available: an allocation
 * that would breach that is refused rather than warned about, and two allocations racing for
 * the same remainder produce one success and one refusal.
 */
ledger.post('/balance-periods/:id/allocations', async (c) => {
  const auth = await requireRole(c, 'claims_manager');
  if (auth.error) return auth.error;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/balance-periods/${id}/allocations`, body, async () => {
    // No claim percentage is ever accepted from a person, on any route, in any form.
    for (const forbidden of ['content_bp', 'percentage', 'recycled_content_bp', 'content', 'percent']) {
      if (body[forbidden] !== undefined) {
        return ok({
          error: 'percentage_not_accepted', field: forbidden,
          rule: 'No claim percentage is ever accepted from a person, on any route, in any form. Every percentage is computed.'
        }, 400);
      }
    }
    let mass;
    try { mass = requireInteger(body.mass_g, 'mass_g'); } catch (err) { return ok(err.body, 400); }
    const cats = ['post_consumer', 'pre_consumer'];
    if (!cats.includes(body.category)) return ok({ error: 'unknown_category', accepted: cats }, 400);
    if (!body.lot) return ok({ error: 'missing_field', field: 'lot' }, 400);
    if (mass <= 0) return ok({ error: 'mass_must_be_positive', mass_g: mass }, 400);

    const result = await tx(async (client) => {
      // Serialise the read of the remainder against its write, so two allocations racing for
      // the same remaining credits produce exactly one success and exactly one refusal.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`allocation:${id}:${body.category}`]);

      const p = (await client.query('SELECT * FROM balance_period WHERE id = $1', [id])).rows[0];
      if (!p) return { status: 404, body: { error: 'not_found' } };
      if (p.state === 'closed') {
        return { status: 409, body: { error: 'period_closed', period: id, rule: 'This period is closed. Corrections require a restatement.' } };
      }
      const lot = (await client.query('SELECT * FROM lot WHERE reference = $1', [body.lot])).rows[0];
      if (!lot) return { status: 404, body: { error: 'unknown_lot', lot: body.lot } };

      const rows = (await client.query(
        `SELECT direction, category, mass_g FROM credit_movement WHERE period = $1 AND category = $2`,
        [id, body.category]
      )).rows;
      const inG = rows.filter((m) => m.direction === 'in').reduce((s, m) => s + Number(m.mass_g), 0);
      const outG = rows.filter((m) => m.direction === 'out').reduce((s, m) => s + Number(m.mass_g), 0);
      const available = inG - outG;

      if (mass > available) {
        // The available figure is the margin at the instant of refusal, and no credit moves.
        return {
          status: 409,
          refusal: { available_g: available, requested_g: mass },
          body: {
            error: 'insufficient_credits',
            available_g: available,
            requested_g: mass,
            category: body.category,
            period: id,
            lot: body.lot,
            message: `This allocation is refused. Available: ${available} g. Requested: ${mass} g.`,
            rule: 'Credits attached never exceed credits available. The two categories are never netted.'
          }
        };
      }
      const effective_on = body.effective_on || new Date().toISOString().slice(0, 10);
      const mv = (await client.query(
        `INSERT INTO credit_movement (period, direction, category, mass_g, lot, source_kind, source_ref,
           fresh_credit, derivation, event_at, effective_on, created_by)
         VALUES ($1,'out',$2,$3,$4,'allocation',$4,true,$5,now(),$6,$7) RETURNING id`,
        [id, body.category, mass, body.lot,
          JSON.stringify({
            lot: body.lot, category: body.category, mass_g: mass,
            available_before_g: available,
            rule: `content_bp = credit_attached_g * 10000 / lot_mass_g ${lot.mass_g}, floored`
          }), effective_on, auth.session.email]
      )).rows[0];

      const after = (await client.query(
        `SELECT direction, mass_g FROM credit_movement WHERE period = $1 AND category = $2`, [id, body.category]
      )).rows;
      const availableAfter = after.filter((m) => m.direction === 'in').reduce((s, m) => s + Number(m.mass_g), 0)
        - after.filter((m) => m.direction === 'out').reduce((s, m) => s + Number(m.mass_g), 0);

      const attachedRows = (await client.query(
        `SELECT category, mass_g FROM credit_movement WHERE lot = $1 AND direction = 'out'`, [body.lot]
      )).rows;
      const attached = attachedRows.reduce((s, m) => s + Number(m.mass_g), 0);
      const split = { post_consumer: 0, pre_consumer: 0 };
      for (const r of attachedRows) split[r.category] = (split[r.category] || 0) + Number(r.mass_g);

      return {
        status: 201,
        body: {
          reference: `MOV-${mv.id}`,
          period: id, lot: body.lot, category: body.category, mass_g: mass,
          credit_attached_g: attached,
          // Every percentage is computed and no route accepts one.
          content_bp: contentBp(attached, Number(lot.mass_g)),
          claim_type: lot.claim_type,
          category_split: split,
          credits_available_g: availableAfter,
          effective_on,
          derivation: { content_bp: `credit_attached_g ${attached} * 10000 / lot_mass_g ${lot.mass_g}, floored` }
        }
      };
    });

    if (result.refusal) {
      // A refused allocation is an entry, with the margin at the instant.
      await append(null, {
        act: 'allocation_refused', person: auth.session.email, object_kind: 'balance_period', object_ref: id,
        outcome: 'refused',
        content: { lot: body.lot, category: body.category, ...result.refusal }
      });
    } else if (result.status === 201) {
      await append(null, {
        act: 'claim_allocated', person: auth.session.email, object_kind: 'lot', object_ref: body.lot,
        content: { period: id, category: body.category, mass_g: mass, content_bp: result.body.content_bp }
      });
    }
    return ok(result.body, result.status);
  });
});

/** A transfer lands as an inbound credit naming its origin, never a fresh credit. */
ledger.post('/balance-periods/:id/transfers', async (c) => {
  const auth = await requireRole(c, 'claims_manager');
  if (auth.error) return auth.error;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/balance-periods/${id}/transfers`, body, async () => {
    let mass;
    try { mass = requireInteger(body.mass_g, 'mass_g'); } catch (err) { return ok(err.body, 400); }
    const from = body.from_period;
    if (!from) return ok({ error: 'missing_field', field: 'from_period' }, 400);
    const cats = ['post_consumer', 'pre_consumer'];
    if (!cats.includes(body.category)) return ok({ error: 'unknown_category', accepted: cats }, 400);
    const to = await one('SELECT * FROM balance_period WHERE id = $1', [id]);
    const src = await one('SELECT * FROM balance_period WHERE id = $1', [from]);
    if (!to || !src) return ok({ error: 'not_found' }, 404);
    if (to.state === 'closed' || src.state === 'closed') {
      return ok({ error: 'period_closed', rule: 'A closed period refuses every further write.' }, 409);
    }
    const n = await one(`SELECT count(*)::int AS n FROM transfer`);
    const reference = `TRF-${String(n.n + 1).padStart(4, '0')}`;
    const movedOn = body.moved_on || new Date().toISOString().slice(0, 10);
    await q(
      `INSERT INTO transfer (reference, from_period, to_period, category, mass_g, moved_on, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [reference, from, id, body.category, mass, movedOn, auth.session.email]
    );
    const derivation = JSON.stringify({ transfer: reference, rule: 'inbound credit, never a fresh credit; total credit across the two periods is unchanged' });
    await q(
      `INSERT INTO credit_movement (period, direction, category, mass_g, source_kind, source_ref, movement, origin_site, fresh_credit, derivation, event_at, effective_on, created_by)
       VALUES ($1,'transfer_in',$2,$3,'transfer',$4,$4,$5,false,$6,now(),$7,$8)`,
      [id, body.category, mass, reference, src.site, derivation, movedOn, auth.session.email]
    );
    await q(
      `INSERT INTO credit_movement (period, direction, category, mass_g, source_kind, source_ref, movement, origin_site, fresh_credit, derivation, event_at, effective_on, created_by)
       VALUES ($1,'transfer_out',$2,$3,'transfer',$4,$4,$5,false,$6,now(),$7,$8)`,
      [from, body.category, mass, reference, src.site, derivation, movedOn, auth.session.email]
    );
    await append(null, {
      act: 'transfer_recorded', person: auth.session.email, object_kind: 'transfer', object_ref: reference,
      content: { from, to: id, mass_g: mass, category: body.category }
    });
    const view = await periodView(id);
    return ok({
      reference, from_period: from, to_period: id, category: body.category, mass_g: mass,
      moved_on: movedOn,
      inbound_credits: view.inbound_credits,
      note: 'The total credit across the two periods is unchanged by the journey.'
    }, 201);
  });
});

/** Closing settles the carry-over and is refused for the publisher of the method it applies. */
ledger.post('/balance-periods/:id/close', async (c) => {
  const auth = await requireRole(c, 'claims_manager');
  if (auth.error) return auth.error;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/balance-periods/${id}/close`, body, async () => {
    const p = await one('SELECT * FROM balance_period WHERE id = $1', [id]);
    if (!p) return ok({ error: 'not_found' }, 404);
    if (p.state === 'closed') {
      await append(null, {
        act: 'period_reopen_refused', person: auth.session.email, object_kind: 'balance_period',
        object_ref: id, outcome: 'refused', content: {}
      });
      return ok({
        error: 'period_already_closed', period: id, closed_on: iso(p.closed_on),
        rule: 'A closed period refuses every further write and refuses to reopen.'
      }, 409);
    }

    const blockers = [];
    const lots = await q(
      `SELECT reference, disposition FROM lot WHERE site = $1 AND grade = $2 AND produced_on BETWEEN $3 AND $4`,
      [p.site, p.grade, iso(p.period_from), iso(p.period_to)]
    );
    for (const l of lots) {
      if (l.disposition === 'pending') blockers.push({ condition: 'lot_without_disposition', reference: l.reference });
    }
    for (const l of lots) {
      const devs = await q(`SELECT reference FROM deviation WHERE state = 'open' AND lots ? $1`, [l.reference]);
      for (const d of devs) blockers.push({ condition: 'open_deviation', reference: d.reference });
    }
    const view = await periodView(id);
    for (const [cat, v] of Object.entries(view.credits_available_g)) {
      if (v < 0) blockers.push({ condition: 'balance_does_not_reconcile', reference: `${id}:${cat}` });
    }
    // The person who published the carbon method version applying to this period does not
    // close it.
    const method = await one(`SELECT id, version, published_by FROM carbon_method WHERE superseded = false ORDER BY version DESC LIMIT 1`);
    if (method && method.published_by === auth.session.email) {
      blockers.push({ condition: 'method_publisher_not_period_closer', reference: `${method.id} v${method.version}` });
    }
    if (blockers.length) {
      await append(null, {
        act: 'period_close_refused', person: auth.session.email, object_kind: 'balance_period',
        object_ref: id, outcome: 'refused', content: { blockers }
      });
      return ok({ error: 'close_refused', period: id, blockers, rule: 'A close is refused while any lot lacks a disposition, any deviation touching it is open, or the balance does not reconcile.' }, 409);
    }

    const settled = await carryOver(p, view.credits_in_g, view.credits_available_g);
    const closedOn = body.closed_on || new Date().toISOString().slice(0, 10);
    const cutOff = body.cut_off || closedOn;
    await q(
      `UPDATE balance_period SET state = 'closed', closed_on = $2, cut_off = $3, closed_by = $4 WHERE id = $1`,
      [id, closedOn, cutOff, auth.session.email]
    );
    // The remainder expires; neither is absorbed silently.
    for (const cat of ['post_consumer', 'pre_consumer']) {
      if (settled.expired_g[cat] > 0) {
        await q(
          `INSERT INTO credit_movement (period, direction, category, mass_g, source_kind, source_ref, fresh_credit, derivation, event_at, effective_on, created_by)
           VALUES ($1,'out',$2,$3,'expiry',$1,false,$4,now(),$5,$6)`,
          [id, cat, settled.expired_g[cat],
            JSON.stringify({ rule: `credit above ${p.carry_over_limit_bp} basis points of credit in expires at the close`, carried_forward_g: settled.carried_forward_g[cat] }),
            closedOn, auth.session.email]
        );
      }
    }
    await append(null, {
      act: 'balance_period_closed', person: auth.session.email, site: p.site,
      object_kind: 'balance_period', object_ref: id,
      content: { closed_on: closedOn, cut_off: cutOff, ...settled }
    });
    return ok({
      id, state: 'closed', closed_on: closedOn, cut_off: cutOff,
      carried_forward_g: settled.carried_forward_g,
      expired_g: settled.expired_g,
      derivation: {
        carried_forward_g: `credit available at the close, capped at credits_in_g * ${p.carry_over_limit_bp} / 10000, floored`,
        expired_g: 'the remainder above the cap'
      }
    }, 201);
  });
});

/* ---------------------------------------------------------- restatements */

ledger.get('/restatements', async (c) => {
  const bad = refusePagination(c); if (bad) return bad;
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT * FROM restatement ORDER BY opened_at ASC');
  const out = [];
  for (const r of rows) {
    const res = await q('SELECT certificate, outcome, reason, recorded_by, recorded_at FROM resolution WHERE restatement = $1', [r.reference]);
    out.push({
      reference: r.reference, period: r.period, reason: r.reason, state: r.state,
      certificates: r.certificates, content_movements: r.content_movements,
      resolutions: res, opened_by: r.opened_by, opened_at: r.opened_at
    });
  }
  return c.json(out);
});

ledger.post('/balance-periods/:id/restatements', async (c) => {
  const auth = await requireRole(c, 'claims_manager');
  if (auth.error) return auth.error;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/balance-periods/${id}/restatements`, body, async () => {
    const p = await one('SELECT * FROM balance_period WHERE id = $1', [id]);
    if (!p) return ok({ error: 'not_found' }, 404);
    if (!body.reason) return ok({ error: 'missing_field', field: 'reason' }, 400);
    const n = await one(`SELECT count(*)::int AS n FROM restatement`);
    const reference = `RST-${String(n.n + 1).padStart(4, '0')}`;
    // Enumerates every certificate issued from the period.
    const certs = await q(
      `SELECT number, version, content_bp, category_split, lots, recipient_name, state FROM certificate WHERE period = $1 ORDER BY number`,
      [id]
    );

    // Where the restatement revises a conversion factor it also answers content_movements.
    const content_movements = [];
    if (body.revised_factor_bp !== undefined || body.revised_factor) {
      const current = await one(
        `SELECT * FROM conversion_factor WHERE site = $1 ORDER BY published_on DESC LIMIT 1`, [p.site]
      );
      const revisedBp = body.revised_factor_bp !== undefined
        ? Number(body.revised_factor_bp)
        : (await one('SELECT factor_bp FROM conversion_factor WHERE reference = $1', [body.revised_factor]))?.factor_bp;
      for (const cert of certs) {
        const lotMass = (cert.lots || []).reduce((s, l) => s + l.mass_g, 0);
        const attached = Object.values(cert.category_split || {}).reduce((s, v) => s + v, 0);
        // The credit the revised factor would have produced, then the content it implies.
        const revisedCredit = current?.factor_bp
          ? Math.floor(attached * revisedBp / current.factor_bp)
          : attached;
        content_movements.push({
          certificate: cert.number,
          content_bp: cert.content_bp,
          corrected_content_bp: contentBp(revisedCredit, lotMass)
        });
      }
    }

    await q(
      `INSERT INTO restatement (reference, period, reason, revised_factor, certificates, content_movements, opened_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [reference, id, body.reason, body.revised_factor || null,
        JSON.stringify(certs.map((x) => x.number)), JSON.stringify(content_movements), auth.session.email]
    );
    await append(null, {
      act: 'restatement_opened', person: auth.session.email, site: p.site,
      object_kind: 'restatement', object_ref: reference,
      content: { period: id, reason: body.reason, certificates: certs.map((x) => x.number) }
    });
    return ok({
      reference, period: id, reason: body.reason, state: 'open',
      certificates: certs.map((x) => ({
        number: x.number, version: x.version, state: x.state,
        recipient_name: x.recipient_name, content_bp: x.content_bp
      })),
      content_movements,
      complete: true,
      note: 'Each affected certificate takes exactly one resolution, recorded one at a time.'
    }, 201);
  });
});

/** One resolution per certificate per restatement. No route resolves more than one at a time. */
ledger.post('/restatements/:reference/resolutions', async (c) => {
  const auth = await requireRole(c, 'claims_manager', 'quality_manager');
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/restatements/${reference}/resolutions`, body, async () => {
    const r = await one('SELECT * FROM restatement WHERE reference = $1', [reference]);
    if (!r) return ok({ error: 'not_found' }, 404);
    if (Array.isArray(body.certificates) || Array.isArray(body.certificate)) {
      return ok({ error: 'one_certificate_at_a_time', rule: 'No route resolves more than one certificate at a time.' }, 400);
    }
    const outcomes = ['reissued', 'withdrawn', 'unaffected'];
    if (!outcomes.includes(body.outcome)) return ok({ error: 'unknown_outcome', accepted: outcomes }, 400);
    if (!body.certificate) return ok({ error: 'missing_field', field: 'certificate' }, 400);
    if (!body.reason) return ok({ error: 'missing_field', field: 'reason', rule: 'Each resolution carries its own stated reason.' }, 400);
    const existing = await one(
      'SELECT id FROM resolution WHERE restatement = $1 AND certificate = $2', [reference, body.certificate]
    );
    if (existing) {
      return ok({
        error: 'already_resolved', certificate: body.certificate, restatement: reference,
        rule: 'A restatement holds exactly one resolution per affected certificate.'
      }, 409);
    }
    const row = await one(
      `INSERT INTO resolution (restatement, certificate, outcome, reason, recorded_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [reference, body.certificate, body.outcome, body.reason, auth.session.email]
    );
    const resolved = await q('SELECT certificate FROM resolution WHERE restatement = $1', [reference]);
    const outstanding = (r.certificates || []).filter((n) => !resolved.find((x) => x.certificate === n));
    if (!outstanding.length) {
      await q(`UPDATE restatement SET state = 'resolved' WHERE reference = $1`, [reference]);
    }
    await append(null, {
      act: 'restatement_resolved', person: auth.session.email, object_kind: 'restatement', object_ref: reference,
      content: { certificate: body.certificate, outcome: body.outcome, reason: body.reason }
    });
    return ok({
      reference: `RES-${row.id}`, restatement: reference, certificate: body.certificate,
      outcome: body.outcome, reason: body.reason,
      outstanding_certificates: outstanding,
      state: outstanding.length ? 'open' : 'resolved'
    }, 201);
  });
});

/* ------------------------------------------------------ conversion factors */

ledger.get('/conversion-factors', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT * FROM conversion_factor ORDER BY published_on ASC');
  return c.json(rows.map((f) => ({
    reference: f.reference, site: f.site, version: f.version, factor_bp: f.factor_bp,
    derived_from: iso(f.derived_from), derived_to: iso(f.derived_to),
    derived_in_g: f.derived_in_g, derived_out_g: f.derived_out_g,
    provisional: f.provisional, published_on: iso(f.published_on), superseded_by: f.superseded_by,
    derivation: f.provisional
      ? { factor_bp: 'provisional: no derivation window' }
      : { factor_bp: `derived_out_g ${f.derived_out_g} * 10000 / derived_in_g ${f.derived_in_g}, floored` }
  })));
});

/** A factor is always the arithmetic of a stated window rather than a number somebody chose. */
ledger.post('/conversion-factors', async (c) => {
  const auth = await requireRole(c, 'claims_manager');
  if (auth.error) return auth.error;
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, 'POST /api/conversion-factors', body, async () => {
    for (const f of ['factor_bp', 'derived_in_g', 'derived_out_g']) {
      try { requireInteger(body[f], f); } catch (err) { return ok(err.body, 400); }
    }
    if (!body.site) return ok({ error: 'missing_field', field: 'site' }, 400);
    const provisional = body.derived_in_g === 0;
    if (!provisional) {
      const expected = factorBp(body.derived_out_g, body.derived_in_g);
      if (body.factor_bp !== expected) {
        return ok({
          error: 'factor_does_not_reconcile',
          factor_bp: body.factor_bp, expected_factor_bp: expected,
          derived_in_g: body.derived_in_g, derived_out_g: body.derived_out_g,
          rule: 'A factor is refused unless factor_bp equals derived_out_g * 10000 / derived_in_g, floored.'
        }, 409);
      }
      if (!body.derived_from || !body.derived_to) {
        return ok({ error: 'window_required', rule: 'A derived factor states the window it came from.' }, 400);
      }
    }
    const prev = await one(
      `SELECT reference, version FROM conversion_factor WHERE site = $1 AND superseded_by IS NULL ORDER BY version DESC LIMIT 1`,
      [body.site]
    );
    const version = (prev?.version || 0) + 1;
    const reference = body.reference || `CF-${body.site.replace('SITE-', '')}-${version}`;
    await q(
      `INSERT INTO conversion_factor (reference, site, version, factor_bp, derived_from, derived_to,
        derived_in_g, derived_out_g, provisional, published_by, published_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_DATE)`,
      [reference, body.site, version, body.factor_bp, body.derived_from || null, body.derived_to || null,
        body.derived_in_g, body.derived_out_g, provisional, auth.session.email]
    );
    // A version supersedes rather than overwrites.
    if (prev) await q('UPDATE conversion_factor SET superseded_by = $2 WHERE reference = $1', [prev.reference, reference]);
    await append(null, {
      act: 'conversion_factor_published', person: auth.session.email, site: body.site,
      object_kind: 'conversion_factor', object_ref: reference,
      content: { factor_bp: body.factor_bp, derived_in_g: body.derived_in_g, derived_out_g: body.derived_out_g, provisional }
    });
    return ok({
      reference, site: body.site, version, factor_bp: body.factor_bp,
      derived_from: body.derived_from || null, derived_to: body.derived_to || null,
      derived_in_g: body.derived_in_g, derived_out_g: body.derived_out_g,
      provisional, supersedes: prev?.reference || null,
      note: provisional ? 'This factor is provisional and every certificate resting on it says so.' : null
    }, 201);
  });
});

/* -------------------------------------------------------------- contracts */

ledger.get('/contracts', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT * FROM contract ORDER BY id');
  const { contractProjection } = await import('../engine.js');
  const out = [];
  for (const r of rows) out.push(await contractProjection(r.id));
  return c.json(out);
});

ledger.get('/contracts/:id/projection', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const { contractProjection } = await import('../engine.js');
  const p = await contractProjection(c.req.param('id'));
  if (!p) return c.json({ error: 'not_found' }, 404);
  return c.json(p);
});

/** A claim already allocated to one contract is refused a second attachment. */
ledger.post('/contracts/:id/allocations', async (c) => {
  const auth = await requireRole(c, 'claims_manager');
  if (auth.error) return auth.error;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/contracts/${id}/allocations`, body, async () => {
    const contract = await one('SELECT * FROM contract WHERE id = $1', [id]);
    if (!contract) return ok({ error: 'not_found' }, 404);
    if (!body.lot) return ok({ error: 'missing_field', field: 'lot' }, 400);
    if (!body.decided_by) {
      return ok({
        error: 'decided_by_required',
        rule: 'An allocation carries the person who decided. It is never an automatic sort by contract value with nobody\'s name on it.'
      }, 400);
    }
    const existing = await one('SELECT contract FROM contract_allocation WHERE lot = $1', [body.lot]);
    if (existing) {
      return ok({
        error: 'lot_already_allocated', lot: body.lot, contract: existing.contract,
        rule: 'A claim already allocated to one contract is refused a second attachment.'
      }, 409);
    }
    const lot = await one('SELECT * FROM lot WHERE reference = $1', [body.lot]);
    if (!lot) return ok({ error: 'unknown_lot', lot: body.lot }, 404);
    const claim = await lotClaim(body.lot);
    const n = await one(`SELECT count(*)::int AS n FROM contract_allocation`);
    const reference = `ALO-${String(n.n + 1).padStart(4, '0')}`;
    await q(
      `INSERT INTO contract_allocation (reference, contract, lot, mass_g, content_bp, decided_by, favoured_over)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [reference, id, body.lot, lot.mass_g, claim.content_bp, body.decided_by,
        JSON.stringify(body.favoured_over || [])]
    );
    const { contractProjection } = await import('../engine.js');
    const projection = await contractProjection(id);
    if (projection.state === 'unreachable' && !contract.unreachable_on) {
      await q(
        `UPDATE contract SET unreachable_on = CURRENT_DATE, unreachable_allocation = $2 WHERE id = $1`,
        [id, reference]
      );
    }
    await append(null, {
      act: 'contract_allocation_recorded', person: auth.session.email,
      object_kind: 'contract', object_ref: id,
      content: { lot: body.lot, decided_by: body.decided_by, favoured_over: body.favoured_over || [] }
    });
    return ok({
      reference, contract: id, lot: body.lot, mass_g: lot.mass_g, content_bp: claim.content_bp,
      claim_type: lot.claim_type,
      decided_by: body.decided_by, favoured_over: body.favoured_over || [],
      projection: await contractProjection(id)
    }, 201);
  });
});
