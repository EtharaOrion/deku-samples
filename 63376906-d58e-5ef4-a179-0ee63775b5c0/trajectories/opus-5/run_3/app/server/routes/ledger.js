import { Hono } from 'hono';
import { rq, rq1, tx } from '../db/pool.js';
import { appendEntry } from '../lib/record.js';
import {
  idempotent, refuse, requireRole, requireSession, refuseAuditorWrite,
  refuseComputedInputs, refusePaging, recordRefusal
} from '../lib/http.js';
import { requireNonNegativeInteger, contentBp, factorFromWindow, carryOver, blendedContentBp, weakerClaimType, weakerCertificationState } from '../engine/units.js';
import { periodDetail, closeBlockers, carryOverAtClose, lotClaim, CATEGORIES } from '../engine/ledger.js';
import { nextRef } from './operations.js';

export const ledger = new Hono();

ledger.get('/balance-periods', async (c) => {
  refusePaging(c);
  const rows = await rq('SELECT id FROM balance_period ORDER BY id');
  const out = [];
  for (const r of rows) out.push(await periodDetail(r.id));
  return c.json(out);
});

ledger.get('/balance-periods/:id', async (c) => {
  const d = await periodDetail(c.req.param('id'));
  if (!d) throw refuse(404, 'no_such_period', `No balance period is recorded at ${c.req.param('id')}.`);
  return c.json(d);
});

/** Credits attached never exceed credits available. An allocation that would
 *  breach that is refused rather than warned about, and two allocations racing
 *  for the same remainder produce one success and one refusal.
 *
 *  The row lock on the period is what makes the race deterministic: the second
 *  transaction waits, then reads a balance that already includes the first. */
ledger.post('/balance-periods/:id/allocations', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);

  const massG = requireNonNegativeInteger(body.mass_g, 'mass_g');
  if (!CATEGORIES.includes(body.category)) {
    throw refuse(400, 'unknown_category', 'A category is post_consumer or pre_consumer. The two are never netted.');
  }
  if (!body.lot) throw refuse(400, 'missing_field', 'An allocation names the lot it attaches claim to.');

  const result = await idempotent(c, `POST /api/balance-periods/${id}/allocations`, body, async () => tx(async (client) => {
    const p = await client.query('SELECT * FROM balance_period WHERE id = $1 FOR UPDATE', [id]);
    if (!p.rows.length) throw refuse(404, 'no_such_period', `No balance period is recorded at ${id}.`);
    const period = p.rows[0];
    if (period.state === 'closed') {
      throw refuse(409, 'period_closed', 'This period is closed. Corrections require a restatement.', { balance_period: id });
    }

    const lot = await client.query('SELECT * FROM lot WHERE reference = $1', [body.lot]);
    if (!lot.rows.length) throw refuse(404, 'no_such_lot', `No lot is recorded at ${body.lot}.`);
    if (lot.rows[0].site !== period.site) {
      throw refuse(409, 'lot_outside_period_site',
        `${body.lot} was produced at ${lot.rows[0].site} and ${id} keeps the ledger for ${period.site}.`);
    }

    // The balance is the sum of its movements, read inside the lock, so the
    // margin below is the margin at this instant and not a cached total.
    const sums = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'in' AND fresh_credit THEN mass_g ELSE 0 END), 0) AS in_g,
              COALESCE(SUM(CASE WHEN direction = 'out' THEN mass_g ELSE 0 END), 0) AS out_g
         FROM credit_movement WHERE balance_period = $1 AND category = $2`, [id, body.category]
    );
    const availableG = Number(sums.rows[0].in_g) - Number(sums.rows[0].out_g);

    if (massG > availableG) {
      // A refused allocation is an entry, with the margin at the instant.
      await recordRefusal({
        act: 'allocation_refused', person: session.email, site: period.site,
        object_kind: 'balance_period', object_ref: id, outcome: 'refused',
        content: { lot: body.lot, category: body.category, requested_g: massG, available_g: availableG,
          margin_at_refusal_g: availableG }
      });
      throw refuse(409, 'insufficient_credit',
        `This allocation is refused. Available: ${availableG} g. Requested: ${massG} g.`,
        { available_g: availableG, requested_g: massG, category: body.category, lot: body.lot, balance_period: id });
    }

    const mn = await client.query('SELECT count(*)::int AS n FROM credit_movement');
    const mref = `CM-${String(mn.rows[0].n + 1).padStart(4, '0')}`;
    const newAttached = await client.query(
      `SELECT COALESCE(SUM(mass_g),0) AS g FROM credit_movement
        WHERE lot = $1 AND direction = 'out' AND movement = 'allocation'`, [body.lot]
    );
    const attachedAfter = Number(newAttached.rows[0].g) + massG;
    const lotMass = Number(lot.rows[0].mass_g);

    await client.query(
      `INSERT INTO credit_movement (reference,balance_period,direction,category,mass_g,movement,lot,source_kind,source_ref,
         fresh_credit,derivation,decided_by,favoured_over,event_at,effective_on,recorded_by)
       VALUES ($1,$2,'out',$3,$4,'allocation',$5,'lot',$5,true,$6,$7,$8,now(),$9,$10)`,
      [mref, id, body.category, massG, body.lot,
        JSON.stringify({ lot_mass_g: lotMass, credit_attached_g: attachedAfter,
          content_bp: contentBp(attachedAfter, lotMass),
          formula: `credit_attached_g ${attachedAfter} * 10000 / lot_mass_g ${lotMass}, floored` }),
        body.decided_by || session.email, JSON.stringify(body.favoured_over || []),
        String(period.period_to).slice(0, 10), session.email]
    );

    await appendEntry(client, {
      act: 'claim_allocated', person: session.email, site: period.site,
      object_kind: 'lot', object_ref: body.lot,
      content: { balance_period: id, category: body.category, mass_g: massG, movement: mref,
        content_bp_after: contentBp(attachedAfter, lotMass) }
    });

    const after = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'in' AND fresh_credit THEN mass_g ELSE 0 END), 0)
              - COALESCE(SUM(CASE WHEN direction = 'out' THEN mass_g ELSE 0 END), 0) AS g
         FROM credit_movement WHERE balance_period = $1 AND category = $2`, [id, body.category]
    );

    return {
      status: 201,
      body: {
        reference: mref,
        balance_period: id,
        lot: body.lot,
        category: body.category,
        mass_g: massG,
        credit_attached_g: attachedAfter,
        // Every percentage is computed and no route accepts one.
        content_bp: contentBp(attachedAfter, lotMass),
        claim_type: lot.rows[0].claim_type,
        credits_available_g: Number(after.rows[0].g),
        derivation: {
          content_bp: `credit_attached_g ${attachedAfter} * 10000 / lot_mass_g ${lotMass}, floored`,
          credits_available_g: 'the sum of this period\'s movements in this category, after this allocation'
        }
      }
    };
  }));
  return c.json(result.body, result.status);
});

ledger.post('/balance-periods/:id/transfers', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);
  const massG = requireNonNegativeInteger(body.mass_g, 'mass_g');
  if (!body.to_period) throw refuse(400, 'missing_field', 'A transfer names the period it moves credit to.');
  if (!CATEGORIES.includes(body.category)) throw refuse(400, 'unknown_category', 'A category is post_consumer or pre_consumer.');

  const result = await idempotent(c, `POST /api/balance-periods/${id}/transfers`, body, async () => tx(async (client) => {
    const from = await client.query('SELECT * FROM balance_period WHERE id = $1 FOR UPDATE', [id]);
    const to = await client.query('SELECT * FROM balance_period WHERE id = $1 FOR UPDATE', [body.to_period]);
    if (!from.rows.length || !to.rows.length) throw refuse(404, 'no_such_period', 'Both periods must exist.');
    if (from.rows[0].state === 'closed' || to.rows[0].state === 'closed') {
      throw refuse(409, 'period_closed', 'This period is closed. Corrections require a restatement.');
    }
    const avail = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'in' AND fresh_credit THEN mass_g ELSE 0 END),0)
              - COALESCE(SUM(CASE WHEN direction = 'out' THEN mass_g ELSE 0 END),0) AS g
         FROM credit_movement WHERE balance_period = $1 AND category = $2`, [id, body.category]
    );
    const availableG = Number(avail.rows[0].g);
    if (massG > availableG) {
      throw refuse(409, 'insufficient_credit',
        `This transfer is refused. Available: ${availableG} g. Requested: ${massG} g.`,
        { available_g: availableG, requested_g: massG });
    }

    const tref = await nextRef(client, 'transfer', 'reference', 'TRF-');
    await client.query(
      `INSERT INTO transfer (reference,from_period,to_period,category,mass_g,moved_on,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [tref, id, body.to_period, body.category, massG, body.moved_on || new Date().toISOString().slice(0, 10), session.email]
    );
    const mn = await client.query('SELECT count(*)::int AS n FROM credit_movement');
    const outRef = `CM-${String(mn.rows[0].n + 1).padStart(4, '0')}`;
    const inRef = `CM-${String(mn.rows[0].n + 2).padStart(4, '0')}`;
    const movedOn = body.moved_on || new Date().toISOString().slice(0, 10);
    await client.query(
      `INSERT INTO credit_movement (reference,balance_period,direction,category,mass_g,movement,source_kind,source_ref,
         origin_site,fresh_credit,derivation,event_at,effective_on,recorded_by)
       VALUES ($1,$2,'out',$3,$4,'transfer_out','transfer',$5,$6,false,$7,now(),$8,$9)`,
      [outRef, id, body.category, massG, tref, from.rows[0].site,
        JSON.stringify({ transfer: tref, to: body.to_period }), movedOn, session.email]
    );
    // It is never a fresh credit, and the total credit across the two periods
    // is unchanged by the journey.
    await client.query(
      `INSERT INTO credit_movement (reference,balance_period,direction,category,mass_g,movement,source_kind,source_ref,
         origin_site,fresh_credit,derivation,event_at,effective_on,recorded_by)
       VALUES ($1,$2,'in',$3,$4,'transfer_in','transfer',$5,$6,false,$7,now(),$8,$9)`,
      [inRef, body.to_period, body.category, massG, tref, from.rows[0].site,
        JSON.stringify({ transfer: tref, from: id, fresh_credit: false }), movedOn, session.email]
    );
    await appendEntry(client, {
      act: 'transfer_recorded', person: session.email, object_kind: 'transfer', object_ref: tref,
      content: { from: id, to: body.to_period, mass_g: massG, category: body.category, fresh_credit: false },
      effective_on: movedOn
    });

    const receiving = await periodDetail(body.to_period);
    return {
      status: 201,
      body: {
        reference: tref, from_period: id, to_period: body.to_period,
        category: body.category, mass_g: massG, moved_on: movedOn,
        fresh_credit: false,
        inbound_credits: receiving.inbound_credits,
        note: 'Transferred credit is inbound credit naming its origin, never a fresh credit. The total credit across the two periods is unchanged by the journey.'
      }
    };
  }));
  return c.json(result.body, result.status);
});

ledger.post('/balance-periods/:id/close', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);

  const result = await idempotent(c, `POST /api/balance-periods/${id}/close`, body, async () => tx(async (client) => {
    const p = await client.query('SELECT * FROM balance_period WHERE id = $1 FOR UPDATE', [id]);
    if (!p.rows.length) throw refuse(404, 'no_such_period', `No balance period is recorded at ${id}.`);
    if (p.rows[0].state === 'closed') {
      throw refuse(409, 'period_closed', 'A closed period refuses every further write and refuses to reopen.',
        { closed_on: String(p.rows[0].closed_on).slice(0, 10) });
    }

    // Closing a balance period is refused for the person who published the
    // carbon method version it applies: the second separation.
    const applied = await client.query(
      `SELECT DISTINCT cmv.method, cmv.version, cmv.published_by
         FROM carbon_figure cf JOIN lot l ON l.reference = cf.lot
         JOIN carbon_method_version cmv ON cmv.method = cf.method AND cmv.version = cf.method_version
        WHERE l.balance_period = $1`, [id]
    );
    const conflict = applied.rows.find((r) => r.published_by === session.email);
    if (conflict) {
      await appendEntry(client, {
        act: 'period_close_refused', person: session.email, site: p.rows[0].site,
        object_kind: 'balance_period', object_ref: id, outcome: 'refused',
        content: { separation: 'publisher_not_closer', method_version: `${conflict.method} v${conflict.version}` }
      });
      throw refuse(403, 'separation_publisher_not_closer',
        `Whoever published a carbon method version does not close the period applying it. ${session.email} published ${conflict.method} v${conflict.version}.`,
        { separation: 'publisher_not_closer', method_version: `${conflict.method} v${conflict.version}` });
    }

    const blockers = await closeBlockers(id);
    if (blockers.length) {
      await recordRefusal({
        act: 'period_close_refused', person: session.email, site: p.rows[0].site,
        object_kind: 'balance_period', object_ref: id, outcome: 'refused', content: { blockers }
      });
      throw refuse(409, 'close_blocked',
        `${id} cannot be closed: ${blockers.map((b) => b.condition).join('; ')}.`, { blockers });
    }

    // Closing settles the carry-over: credit still available carries forward
    // only up to carry_over_limit_bp of the credit that entered the period, and
    // the remainder expires rather than being absorbed silently.
    const settlement = {};
    const carriedForward = {};
    const expired = {};
    for (const cat of CATEGORIES) {
      const sums = await client.query(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'in' AND fresh_credit THEN mass_g ELSE 0 END),0) AS in_g,
                COALESCE(SUM(CASE WHEN direction = 'out' THEN mass_g ELSE 0 END),0) AS out_g
           FROM credit_movement WHERE balance_period = $1 AND category = $2`, [id, cat]
      );
      const inG = Number(sums.rows[0].in_g);
      const availG = inG - Number(sums.rows[0].out_g);
      const s = carryOver(inG, availG, p.rows[0].carry_over_limit_bp);
      settlement[cat] = { credits_in_g: inG, available_at_close_g: availG, ...s };
      carriedForward[cat] = s.carried_forward_g;
      expired[cat] = s.expired_g;
    }

    const closedOn = body.closed_on || new Date().toISOString().slice(0, 10);
    const cutOff = body.cut_off || closedOn;
    await client.query(
      `UPDATE balance_period SET state = 'closed', closed_on = $1, closed_by = $2, cut_off = $3,
         carried_forward = $4, expired = $5 WHERE id = $6`,
      [closedOn, session.email, cutOff, JSON.stringify(carriedForward), JSON.stringify(expired), id]
    );

    await appendEntry(client, {
      act: 'period_closed', person: session.email, site: p.rows[0].site,
      object_kind: 'balance_period', object_ref: id,
      content: { closed_on: closedOn, cut_off: cutOff, carried_forward_g: carriedForward, expired_g: expired },
      effective_on: closedOn
    });

    return {
      status: 201,
      body: {
        id, state: 'closed', closed_on: closedOn, closed_by: session.email, cut_off: cutOff,
        carried_forward_g: carriedForward, expired_g: expired, settlement,
        note: `A late event-time record effective after ${cutOff} no longer enters this period.`
      }
    };
  }));
  return c.json(result.body, result.status);
});

ledger.get('/balance-periods/:id/carry-over', async (c) => {
  const s = await carryOverAtClose(c.req.param('id'));
  if (!s) throw refuse(404, 'no_such_period', 'No such balance period.');
  return c.json(s);
});

// ------------------------------------------------------------ restatements

ledger.get('/restatements', async (c) => {
  refusePaging(c);
  const rows = await rq('SELECT * FROM restatement ORDER BY reference');
  const out = [];
  for (const r of rows) {
    const res = await rq('SELECT certificate, outcome, reason, recorded_by, recorded_at FROM resolution WHERE restatement = $1', [r.reference]);
    out.push({
      reference: r.reference, balance_period: r.balance_period, reason: r.reason, state: r.state,
      certificates: r.certificates, content_movements: r.content_movements,
      opened_by: r.opened_by, opened_at: r.opened_at,
      effective_on: String(r.effective_on).slice(0, 10),
      resolutions: res,
      unresolved: (r.certificates || []).filter((x) => !res.some((y) => y.certificate === x))
    });
  }
  return c.json(out);
});

ledger.post('/balance-periods/:id/restatements', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);
  if (!body.reason) throw refuse(400, 'missing_field', 'A restatement carries a reason.');

  const result = await idempotent(c, `POST /api/balance-periods/${id}/restatements`, body, async () => tx(async (client) => {
    const p = await client.query('SELECT * FROM balance_period WHERE id = $1', [id]);
    if (!p.rows.length) throw refuse(404, 'no_such_period', `No balance period is recorded at ${id}.`);

    const ref = await nextRef(client, 'restatement', 'reference', 'RST-');
    // A restatement enumerates every certificate issued from the period.
    const certs = await client.query(
      `SELECT number, version, content_bp, claim_type, recipient, recipient_name, state
         FROM certificate WHERE period = $1 ORDER BY number`, [id]
    );

    // Where the restatement revises a conversion factor it also answers
    // content_movements, so the person resolving each certificate is looking at
    // the figure that moved rather than at a list of numbers.
    let contentMovements = null;
    if (body.revised_factor_bp != null) {
      const revised = requireNonNegativeInteger(body.revised_factor_bp, 'revised_factor_bp');
      const current = await client.query(
        'SELECT factor_bp FROM conversion_factor WHERE site = $1 ORDER BY version DESC LIMIT 1', [p.rows[0].site]
      );
      const currentBp = current.rows[0]?.factor_bp || 10000;
      contentMovements = [];
      for (const cert of certs.rows) {
        // The claim moves with the factor: a revised factor grants a different
        // credit at every consumption, so the content follows proportionally
        // and is floored exactly as it was when it was first computed.
        const corrected = Math.floor(cert.content_bp * revised / currentBp);
        contentMovements.push({
          certificate: cert.number,
          content_bp: cert.content_bp,
          corrected_content_bp: corrected,
          moved_by_bp: corrected - cert.content_bp
        });
      }
    }

    await client.query(
      `INSERT INTO restatement (reference,balance_period,reason,state,certificates,content_movements,opened_by,effective_on)
       VALUES ($1,$2,$3,'open',$4,$5,$6,$7)`,
      [ref, id, body.reason, JSON.stringify(certs.rows.map((x) => x.number)),
        contentMovements ? JSON.stringify(contentMovements) : null,
        session.email, body.effective_on || new Date().toISOString().slice(0, 10)]
    );
    await appendEntry(client, {
      act: 'restatement_opened', person: session.email, site: p.rows[0].site,
      object_kind: 'restatement', object_ref: ref,
      content: { balance_period: id, reason: body.reason, certificates: certs.rows.map((x) => x.number) }
    });

    return {
      status: 201,
      body: {
        reference: ref, balance_period: id, reason: body.reason, state: 'open',
        certificates: certs.rows.map((x) => ({
          number: x.number, version: x.version, content_bp: x.content_bp, claim_type: x.claim_type,
          recipient: x.recipient, recipient_name: x.recipient_name, state: x.state
        })),
        content_movements: contentMovements,
        complete: true,
        note: 'Each affected certificate takes exactly one resolution in reissued, withdrawn or unaffected, each with its own stated reason.'
      }
    };
  }));
  return c.json(result.body, result.status);
});

/** No route resolves more than one certificate at a time, and a second
 *  resolution against the same certificate in the same restatement is refused. */
ledger.post('/restatements/:reference/resolutions', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'claims_manager', 'quality_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  if (Array.isArray(body.certificate) || Array.isArray(body.certificates)) {
    throw refuse(400, 'one_certificate_at_a_time',
      'A restatement holds exactly one resolution per affected certificate. No route resolves more than one at a time.');
  }
  if (!['reissued', 'withdrawn', 'unaffected'].includes(body.outcome)) {
    throw refuse(400, 'unknown_outcome', 'A resolution outcome is one of reissued, withdrawn or unaffected.');
  }
  if (!body.certificate || !body.reason) {
    throw refuse(400, 'missing_field', 'A resolution names a certificate and states its own reason.');
  }

  const result = await idempotent(c, `POST /api/restatements/${ref}/resolutions`, body, async () => tx(async (client) => {
    const r = await client.query('SELECT * FROM restatement WHERE reference = $1 FOR UPDATE', [ref]);
    if (!r.rows.length) throw refuse(404, 'no_such_restatement', `No restatement is recorded at ${ref}.`);
    const existing = await client.query(
      'SELECT 1 FROM resolution WHERE restatement = $1 AND certificate = $2', [ref, body.certificate]
    );
    if (existing.rows.length) {
      throw refuse(409, 'already_resolved',
        `${body.certificate} already carries a resolution in ${ref}. Each affected certificate takes exactly one.`);
    }
    await client.query(
      `INSERT INTO resolution (restatement,certificate,outcome,reason,recorded_by) VALUES ($1,$2,$3,$4,$5)`,
      [ref, body.certificate, body.outcome, body.reason, session.email]
    );
    await appendEntry(client, {
      act: 'restatement_resolved', person: session.email, object_kind: 'certificate', object_ref: body.certificate,
      content: { restatement: ref, outcome: body.outcome, reason: body.reason }
    });

    const all = await client.query('SELECT certificate FROM resolution WHERE restatement = $1', [ref]);
    const enumerated = r.rows[0].certificates || [];
    const outstanding = enumerated.filter((x) => !all.rows.some((y) => y.certificate === x));
    if (!outstanding.length && enumerated.length) {
      await client.query("UPDATE restatement SET state = 'resolved' WHERE reference = $1", [ref]);
    }
    return {
      status: 201,
      body: {
        reference: `${ref}:${body.certificate}`, restatement: ref, certificate: body.certificate,
        outcome: body.outcome, reason: body.reason, outstanding_certificates: outstanding,
        restatement_state: outstanding.length ? 'open' : 'resolved'
      }
    };
  }));
  return c.json(result.body, result.status);
});

// -------------------------------------------------------- conversion factors

ledger.get('/conversion-factors', async (c) => {
  const rows = await rq('SELECT * FROM conversion_factor ORDER BY site, version');
  return c.json(rows.map((f) => ({
    reference: f.reference, site: f.site, version: f.version, factor_bp: f.factor_bp,
    derived_from: f.derived_from ? String(f.derived_from).slice(0, 10) : null,
    derived_to: f.derived_to ? String(f.derived_to).slice(0, 10) : null,
    derived_in_g: Number(f.derived_in_g), derived_out_g: Number(f.derived_out_g),
    provisional: f.provisional, superseded_by: f.superseded_by,
    published_by: f.published_by, published_on: String(f.published_on).slice(0, 10),
    derivation: f.provisional
      ? { factor_bp: 'provisional: no derivation window, so the factor is declared rather than derived' }
      : { factor_bp: `derived_out_g ${f.derived_out_g} * 10000 / derived_in_g ${f.derived_in_g}, floored` }
  })));
});

/** A factor is always the arithmetic of a stated window rather than a number
 *  somebody chose, so it is refused unless it equals that arithmetic. */
ledger.post('/conversion-factors', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'claims_manager');
  const body = await c.req.json().catch(() => ({}));
  if (!body.site) throw refuse(400, 'missing_field', 'A conversion factor names its site.');
  const factorBp = requireNonNegativeInteger(body.factor_bp, 'factor_bp');
  const inG = requireNonNegativeInteger(body.derived_in_g, 'derived_in_g');
  const outG = requireNonNegativeInteger(body.derived_out_g, 'derived_out_g');

  const provisional = inG === 0;
  if (!provisional) {
    const expected = factorFromWindow(inG, outG);
    if (expected !== factorBp) {
      throw refuse(409, 'factor_does_not_reconcile',
        `A factor is the arithmetic of its stated window. derived_out_g ${outG} * 10000 / derived_in_g ${inG}, floored, is ${expected}, and ${factorBp} was published.`,
        { expected_factor_bp: expected, submitted_factor_bp: factorBp, derived_in_g: inG, derived_out_g: outG });
    }
    if (!body.derived_from || !body.derived_to) {
      throw refuse(400, 'window_required', 'A derived factor states the window it was derived from.');
    }
  }

  const result = await idempotent(c, 'POST /api/conversion-factors', body, async () => tx(async (client) => {
    const prior = await client.query(
      'SELECT reference, version FROM conversion_factor WHERE site = $1 ORDER BY version DESC LIMIT 1', [body.site]
    );
    const version = (prior.rows[0]?.version || 0) + 1;
    const ref = `CF-${body.site.replace('SITE-', '')}-${version}`;
    await client.query(
      `INSERT INTO conversion_factor (reference,site,version,factor_bp,derived_from,derived_to,derived_in_g,derived_out_g,
         provisional,published_by,published_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [ref, body.site, version, factorBp, body.derived_from || null, body.derived_to || null,
        inG, outG, provisional, session.email, new Date().toISOString().slice(0, 10)]
    );
    // A new version supersedes the previous rather than overwriting it.
    if (prior.rows.length) {
      await client.query('UPDATE conversion_factor SET superseded_by = $1 WHERE reference = $2',
        [ref, prior.rows[0].reference]);
    }
    await appendEntry(client, {
      act: 'conversion_factor_published', person: session.email, site: body.site,
      object_kind: 'conversion_factor', object_ref: ref,
      content: { factor_bp: factorBp, provisional, derived_in_g: inG, derived_out_g: outG }
    });
    return {
      status: 201,
      body: {
        reference: ref, site: body.site, version, factor_bp: factorBp, provisional,
        derived_in_g: inG, derived_out_g: outG,
        derived_from: body.derived_from || null, derived_to: body.derived_to || null,
        supersedes: prior.rows[0]?.reference || null,
        note: provisional ? 'This factor is provisional and every certificate resting on it says so.' : null
      }
    };
  }));
  return c.json(result.body, result.status);
});

// ------------------------------------------------------------------ blending

/** A blend's claim is computed by mass, takes the weaker of the two claim
 *  types, and where the two sites differ names both and takes the weaker
 *  certification scope. Non-claimable material dilutes the percentage. */
ledger.post('/lots/:reference/blend', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'claims_manager', 'plant_operator');
  const a = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);
  if (!body.with) throw refuse(400, 'missing_field', 'A blend names the second lot with "with".');

  const result = await idempotent(c, `POST /api/lots/${a}/blend`, body, async () => tx(async (client) => {
    const la = await client.query('SELECT * FROM lot WHERE reference = $1', [a]);
    const lb = await client.query('SELECT * FROM lot WHERE reference = $1', [body.with]);
    if (!la.rows.length || !lb.rows.length) throw refuse(404, 'no_such_lot', 'Both lots must exist.');
    const A = la.rows[0];
    const B = lb.rows[0];

    const ca = await lotClaim(a);
    const cb = await lotClaim(body.with);
    const massA = Number(A.mass_g);
    const massB = Number(B.mass_g);
    const blended = blendedContentBp(massA, ca.content_bp, massB, cb.content_bp);
    const claimType = weakerClaimType(A.claim_type, B.claim_type);

    const sa = await client.query('SELECT * FROM site WHERE reference = $1', [A.site]);
    const sb = await client.query('SELECT * FROM site WHERE reference = $1', [B.site]);
    const sites = A.site === B.site ? [A.site] : [A.site, B.site];
    const certScope = weakerCertificationState(sa.rows[0].certification_state, sb.rows[0].certification_state);

    const fa = await client.query(
      'SELECT provisional FROM conversion_factor WHERE site = $1 ORDER BY version DESC LIMIT 1', [A.site]);
    const fb = await client.query(
      'SELECT provisional FROM conversion_factor WHERE site = $1 ORDER BY version DESC LIMIT 1', [B.site]);
    // The blend carries the provisional-factor flag of the weaker of the two.
    const provisional = !!(fa.rows[0]?.provisional || fb.rows[0]?.provisional);

    const n = await client.query('SELECT count(*)::int AS n FROM lot');
    const ref = body.reference || `LOT-N6-${String(n.rows[0].n + 1).padStart(4, '0')}`;
    const effectiveOn = body.effective_on || new Date().toISOString().slice(0, 10);
    await client.query(
      `INSERT INTO lot (reference,output_ref,grade,site,mass_g,disposition,claim_type,specification_version,
         blended_from,blended_sites,balance_period,event_at,effective_on,recorded_by)
       VALUES ($1,NULL,$2,$3,$4,'pending',$5,3,$6,$7,$8,now(),$9,$10)`,
      [ref, A.grade, A.site, massA + massB, claimType,
        JSON.stringify([{ lot: a, mass_g: massA, content_bp: ca.content_bp },
          { lot: body.with, mass_g: massB, content_bp: cb.content_bp }]),
        JSON.stringify(sites), A.balance_period, effectiveOn, session.email]
    );
    await appendEntry(client, {
      act: 'lots_blended', person: session.email, object_kind: 'lot', object_ref: ref,
      content: { from: [a, body.with], mass_g: massA + massB, content_bp: blended, claim_type: claimType, sites },
      effective_on: effectiveOn
    });

    return {
      status: 201,
      body: {
        reference: ref,
        mass_g: massA + massB,
        content_bp: blended,
        claim_type: claimType,
        sites,
        // A lot is never blended across sites unless a blending record names
        // both, and the resulting claim is the weaker of the two.
        certification_scope: certScope,
        provisional_factor: provisional,
        blended_from: [
          { lot: a, mass_g: massA, content_bp: ca.content_bp, claim_type: A.claim_type, site: A.site },
          { lot: body.with, mass_g: massB, content_bp: cb.content_bp, claim_type: B.claim_type, site: B.site }
        ],
        derivation: {
          content_bp: `(mass_a ${massA} * content_a ${ca.content_bp} + mass_b ${massB} * content_b ${cb.content_bp}) / (${massA} + ${massB}), floored`,
          claim_type: `the weaker of ${A.claim_type} and ${B.claim_type}`,
          certification_scope: `the weaker of ${sa.rows[0].certification_state} at ${A.site} and ${sb.rows[0].certification_state} at ${B.site}`
        }
      }
    };
  }));
  return c.json(result.body, result.status);
});
