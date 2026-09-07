import { Hono } from 'hono';
import { q, one, pool } from '../db.js';
import { requireSession, requireRole, refuseAuditorWrites } from '../auth.js';
import { appendEntry } from '../record.js';
import { withIdempotency } from '../idempotency.js';
import { isoDate, isoStamp, isInt, ref, fdiv } from '../util.js';
import { ledger, lotContent, readAt, deviationsTouchingLot } from '../engine.js';
import { refusePaging } from './intake.js';

export const ledgerRoutes = new Hono();

const LEDGER_LOCK = 552211;

ledgerRoutes.get('/balance-periods', async (c) => {
  requireSession(c);
  const bad = refusePaging(c);
  if (bad) return c.json(bad, 400);
  const rows = await q('SELECT id FROM balance_period ORDER BY id ASC');
  const out = [];
  for (const r of rows) out.push(await ledger(r.id));
  return c.json(out.map((x) => ({ ...x, read_at: new Date().toISOString() })));
});

ledgerRoutes.get('/balance-periods/:id', async (c) => {
  requireSession(c);
  // A scoped read sees one consistent state and names the moment it saw.
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const at = (await client.query('SELECT now() AS n')).rows[0].n;
    const l = await ledger(c.req.param('id'));
    await client.query('COMMIT');
    if (!l) return c.json({ error: 'not_found' }, 404);
    return c.json({ ...l, read_at: new Date(at).toISOString() });
  } finally {
    client.release();
  }
});

ledgerRoutes.post('/balance-periods/:id/allocations', async (c) => {
  refuseAuditorWrites(c);
  // Allocating claim is the claims manager's act.
  requireRole(c, 'claims_manager');
  const periodId = c.req.param('id');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { lot, category, mass_g } = body;
    for (const forbidden of ['content_bp', 'percentage', 'recycled_content_bp']) {
      if (body[forbidden] !== undefined) {
        return {
          status: 400,
          body: { error: 'computed_figure_not_accepted', field: forbidden,
            message: 'Every percentage is computed and no route accepts one.' },
        };
      }
    }
    if (!['post_consumer', 'pre_consumer'].includes(category)) {
      return { status: 400, body: { error: 'category_not_permitted', permitted: ['post_consumer', 'pre_consumer'] } };
    }
    if (!isInt(mass_g) || mass_g <= 0) {
      return { status: 400, body: { error: 'integer_required', field: 'mass_g' } };
    }
    const p = await one('SELECT * FROM balance_period WHERE id = $1', [periodId]);
    if (!p) return { status: 404, body: { error: 'not_found' } };
    if (p.state === 'closed') {
      return {
        status: 409,
        body: { error: 'period_closed', message: 'This period is closed. Corrections require a restatement.' },
      };
    }
    const l = await one('SELECT * FROM lot WHERE reference = $1', [lot]);
    if (!l) return { status: 404, body: { error: 'lot_not_found', lot } };

    // Two allocations racing for the same remainder produce one success and one
    // refusal: the margin is read and the movement written under one lock.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [LEDGER_LOCK, hash32(periodId + category)]);
      const rows = (await client.query(
        'SELECT direction, mass_g FROM credit_movement WHERE period = $1 AND category = $2',
        [periodId, category]
      )).rows;
      let inG = 0;
      let outG = 0;
      for (const m of rows) {
        if (m.direction === 'in' || m.direction === 'carry_in') inG += Number(m.mass_g);
        else if (m.direction === 'inbound_transfer') continue;
        else outG += Number(m.mass_g);
      }
      const available = inG - outG;
      if (mass_g > available) {
        // The available figure is the margin at the instant of refusal.
        const rref = ref('RFA');
        await client.query(
          `INSERT INTO refused_allocation (reference,period,lot,category,requested_g,available_g,refused_for)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [rref, periodId, lot, category, mass_g, available, s.email]
        );
        await appendEntry(client, {
          act: 'allocation_refused', person: s.email, site: p.site, object_kind: 'balance_period',
          object_ref: periodId, outcome: 'refused',
          content: { lot, category, requested_g: mass_g, available_g: available,
            margin_at_instant_g: available },
        });
        await client.query('COMMIT');
        return {
          status: 409,
          body: {
            error: 'allocation_exceeds_available_credit',
            reference: rref,
            available_g: available,
            requested_g: mass_g,
            category,
            lot,
            period: periodId,
            message: `This allocation is refused. Available: ${available} g. Requested: ${mass_g} g.`,
          },
        };
      }
      const cm = ref('CM');
      await client.query(
        `INSERT INTO credit_movement (reference,period,direction,category,mass_g,lot,derivation,event_at,effective_on,recorded_by)
         VALUES ($1,$2,'out',$3,$4,$5,$6,now(),$7,$8)`,
        [cm, periodId, category, mass_g, lot,
         JSON.stringify({
           note: 'claim attached to a lot', available_before_g: available,
           available_after_g: available - mass_g,
         }),
         isoDate(p.period_to) >= new Date().toISOString().slice(0, 10)
           ? new Date().toISOString().slice(0, 10)
           : isoDate(p.period_to),
         s.email]
      );
      await appendEntry(client, {
        act: 'claim_allocated', person: s.email, site: p.site, object_kind: 'lot', object_ref: lot,
        content: { period: periodId, category, mass_g, movement: cm,
          available_before_g: available, available_after_g: available - mass_g },
      });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    const content = await lotContent(lot);
    const led = await ledger(periodId);
    return {
      status: 201,
      body: {
        reference: lot, lot, category, mass_g, period: periodId,
        content_bp: content.content_bp,
        claim_type: l.claim_type,
        credit_attached_g: content.credit_attached_g,
        category_split: content.category_split,
        credits_available_g: led[category].credits_available_g,
        derivation: content.derivation,
      },
    };
  });
});

function hash32(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

ledgerRoutes.post('/balance-periods/:id/transfers', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'claims_manager');
  const toPeriod = c.req.param('id');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { from_period, category, mass_g, moved_on } = body;
    if (!isInt(mass_g) || mass_g <= 0) return { status: 400, body: { error: 'integer_required', field: 'mass_g' } };
    if (!['post_consumer', 'pre_consumer'].includes(category)) {
      return { status: 400, body: { error: 'category_not_permitted', permitted: ['post_consumer', 'pre_consumer'] } };
    }
    const to = await one('SELECT * FROM balance_period WHERE id = $1', [toPeriod]);
    const from = await one('SELECT * FROM balance_period WHERE id = $1', [from_period]);
    if (!to || !from) return { status: 404, body: { error: 'period_not_found' } };
    if (to.state === 'closed' || from.state === 'closed') {
      return { status: 409, body: { error: 'period_closed', message: 'This period is closed. Corrections require a restatement.' } };
    }
    const reference = ref('TRF');
    const on = moved_on || new Date().toISOString().slice(0, 10);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO transfer (reference,from_period,to_period,category,mass_g,moved_on,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [reference, from_period, toPeriod, category, mass_g, on, s.email]
      );
      // The total credit across the two periods is unchanged by the journey.
      await client.query(
        `INSERT INTO credit_movement (reference,period,direction,category,mass_g,origin_site,movement,fresh_credit,derivation,event_at,effective_on,recorded_by)
         VALUES ($1,$2,'outbound_transfer',$3,$4,$5,$6,false,$7,now(),$8,$9)`,
        [ref('CM'), from_period, category, mass_g, from.site, reference,
         JSON.stringify({ note: `credit left this period on ${reference}` }), on, s.email]
      );
      await client.query(
        `INSERT INTO credit_movement (reference,period,direction,category,mass_g,origin_site,movement,fresh_credit,derivation,event_at,effective_on,recorded_by)
         VALUES ($1,$2,'inbound_transfer',$3,$4,$5,$6,false,$7,now(),$8,$9)`,
        [ref('CM'), toPeriod, category, mass_g, from.site, reference,
         JSON.stringify({ note: `credit arrived from ${from.site} on ${reference}; never a fresh credit` }), on, s.email]
      );
      await appendEntry(client, {
        act: 'transfer_recorded', person: s.email, site: to.site, object_kind: 'transfer',
        object_ref: reference,
        content: { from: from_period, to: toPeriod, category, mass_g, origin_site: from.site },
      });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    const led = await ledger(toPeriod);
    return {
      status: 201,
      body: {
        reference, from_period, to_period: toPeriod, category, mass_g, moved_on: on,
        origin_site: from.site, fresh_credit: false,
        inbound_credits: led.inbound_credits,
      },
    };
  });
});

ledgerRoutes.post('/balance-periods/:id/close', async (c) => {
  refuseAuditorWrites(c);
  // Closing a period is the claims manager's act and never the quality
  // manager's: whoever published a carbon method version does not close the
  // period applying it.
  requireRole(c, 'claims_manager');
  const periodId = c.req.param('id');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const p = await one('SELECT * FROM balance_period WHERE id = $1', [periodId]);
    if (!p) return { status: 404, body: { error: 'not_found' } };
    if (p.state === 'closed') {
      await appendEntry(null, {
        act: 'period_reopen_refused', person: s.email, site: p.site, object_kind: 'balance_period',
        object_ref: periodId, outcome: 'refused', content: { closed_on: isoDate(p.closed_on) },
      });
      return {
        status: 409,
        body: {
          error: 'period_already_closed', closed_on: isoDate(p.closed_on), cut_off: isoDate(p.cut_off),
          message: 'A closed period refuses every further write and refuses to reopen.',
        },
      };
    }

    // Whoever published the carbon method version applying to this period does
    // not close it.
    const mv = await one(
      'SELECT * FROM carbon_method_version WHERE superseded = false ORDER BY published_on DESC LIMIT 1'
    );
    if (mv && mv.published_by === s.email) {
      await appendEntry(null, {
        act: 'period_close_refused', person: s.email, site: p.site, object_kind: 'balance_period',
        object_ref: periodId, outcome: 'refused',
        content: { separation: 'method_publisher_not_period_closer', method_version: `${mv.method} v${mv.version}` },
      });
      return {
        status: 403,
        body: {
          error: 'separation_broken', separation: 'method_publisher_not_period_closer',
          blocking_reference: `${mv.method} v${mv.version}`,
          message: 'Whoever published a carbon method version does not close the period applying it.',
        },
      };
    }

    const lots = await q('SELECT * FROM lot WHERE site = $1 AND grade = $2', [p.site, p.grade]);
    const inPeriod = lots.filter(
      (l) => isoDate(l.effective_on) >= isoDate(p.period_from) && isoDate(l.effective_on) <= isoDate(p.period_to)
    );
    const undecided = inPeriod.filter((l) => l.disposition === 'pending');
    const openDevs = [];
    for (const l of inPeriod) {
      const d = await deviationsTouchingLot(l.reference, true);
      for (const x of d) if (!openDevs.some((y) => y.reference === x.reference)) openDevs.push(x);
    }
    const led = await ledger(periodId);
    const reconciles =
      led.post_consumer.credits_available_g >= 0 && led.pre_consumer.credits_available_g >= 0;

    if (undecided.length || openDevs.length || !reconciles) {
      const reasons = [];
      if (undecided.length) reasons.push({ reason: 'lot_without_disposition', references: undecided.map((l) => l.reference) });
      if (openDevs.length) reasons.push({ reason: 'deviation_open', references: openDevs.map((d) => d.reference) });
      if (!reconciles) reasons.push({ reason: 'balance_does_not_reconcile', references: [periodId] });
      await appendEntry(null, {
        act: 'period_close_refused', person: s.email, site: p.site, object_kind: 'balance_period',
        object_ref: periodId, outcome: 'refused', content: { reasons },
      });
      return { status: 409, body: { error: 'period_cannot_close', reasons, period: periodId } };
    }

    // Closing settles the carry-over. Credit still available carries forward
    // only up to carry_over_limit_bp of the credit that entered.
    const carried = {};
    const expired = {};
    for (const cat of ['post_consumer', 'pre_consumer']) {
      const inG = led[cat].credits_in_g;
      const avail = led[cat].credits_available_g;
      const cap = fdiv(inG * p.carry_over_limit_bp, 10000);
      const carry = Math.min(avail, cap);
      carried[cat] = carry;
      expired[cat] = avail - carry;
    }

    const closedOn = body.closed_on || new Date().toISOString().slice(0, 10);
    const cutOff = body.cut_off || closedOn;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const cat of ['post_consumer', 'pre_consumer']) {
        if (carried[cat] > 0) {
          await client.query(
            `INSERT INTO credit_movement (reference,period,direction,category,mass_g,derivation,event_at,effective_on,recorded_by)
             VALUES ($1,$2,'carry_forward',$3,$4,$5,now(),$6,$7)`,
            [ref('CM'), periodId, cat, carried[cat],
             JSON.stringify({ note: 'carried forward at close', limit_bp: p.carry_over_limit_bp,
               formula: `min(available, credits_in_g * ${p.carry_over_limit_bp} / 10000 floored)` }),
             closedOn, s.email]
          );
        }
        if (expired[cat] > 0) {
          await client.query(
            `INSERT INTO credit_movement (reference,period,direction,category,mass_g,derivation,event_at,effective_on,recorded_by)
             VALUES ($1,$2,'expiry',$3,$4,$5,now(),$6,$7)`,
            [ref('CM'), periodId, cat, expired[cat],
             JSON.stringify({ note: 'expired at close; never absorbed silently' }), closedOn, s.email]
          );
        }
      }
      await client.query(
        `UPDATE balance_period SET state='closed', closed_on=$1, cut_off=$2, closed_by=$3,
           carried_forward=$4, expired=$5 WHERE id=$6`,
        [closedOn, cutOff, s.email, JSON.stringify(carried), JSON.stringify(expired), periodId]
      );
      await appendEntry(client, {
        act: 'balance_period_closed', person: s.email, site: p.site, object_kind: 'balance_period',
        object_ref: periodId,
        content: { closed_on: closedOn, cut_off: cutOff, carried_forward_g: carried, expired_g: expired },
      });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    return {
      status: 201,
      body: {
        reference: periodId, id: periodId, state: 'closed', closed_on: closedOn, cut_off: cutOff,
        carried_forward_g: carried, expired_g: expired,
        carry_over_limit_bp: p.carry_over_limit_bp,
        note: `A late event-time record effective after ${cutOff} no longer enters this period.`,
      },
    };
  });
});

// ---------------------------------------------------------------------------
// Restatements
// ---------------------------------------------------------------------------

ledgerRoutes.get('/restatements', async (c) => {
  requireSession(c);
  const rows = await q('SELECT * FROM restatement ORDER BY opened_at ASC');
  const out = [];
  for (const r of rows) out.push(await shapeRestatement(r));
  return c.json(out);
});

ledgerRoutes.get('/restatements/:reference', async (c) => {
  requireSession(c);
  const r = await one('SELECT * FROM restatement WHERE reference = $1', [c.req.param('reference')]);
  if (!r) return c.json({ error: 'not_found' }, 404);
  return c.json(await shapeRestatement(r));
});

async function shapeRestatement(r) {
  const res = await q('SELECT * FROM resolution WHERE restatement = $1 ORDER BY recorded_at ASC', [r.reference]);
  return {
    reference: r.reference, period: r.period, reason: r.reason, state: r.state,
    revised_factor: r.revised_factor, opened_by: r.opened_by, opened_at: isoStamp(r.opened_at),
    certificates: r.certificates,
    content_movements: r.content_movements,
    resolutions: res.map((x) => ({
      reference: x.reference, certificate: x.certificate, outcome: x.outcome,
      reason: x.reason, recorded_by: x.recorded_by, recorded_at: isoStamp(x.recorded_at),
    })),
    unresolved: (r.certificates || []).filter((n) => !res.some((x) => x.certificate === n)),
    complete: true,
  };
}

ledgerRoutes.post('/balance-periods/:id/restatements', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'claims_manager');
  const periodId = c.req.param('id');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const p = await one('SELECT * FROM balance_period WHERE id = $1', [periodId]);
    if (!p) return { status: 404, body: { error: 'not_found' } };
    const { reason, revised_factor } = body;
    if (!reason) return { status: 400, body: { error: 'reason_required' } };
    const certs = await q('SELECT * FROM certificate WHERE period = $1 ORDER BY number ASC', [periodId]);

    // Where the restatement revises a conversion factor it answers the figure
    // that moved for every affected certificate.
    let movements = [];
    if (revised_factor) {
      const nf = await one('SELECT * FROM conversion_factor WHERE reference = $1', [revised_factor]);
      const old = await one(
        'SELECT * FROM conversion_factor WHERE site = $1 ORDER BY version ASC LIMIT 1',
        [p.site]
      );
      for (const cert of certs) {
        const corrected = nf && old && old.factor_bp
          ? fdiv(cert.content_bp * nf.factor_bp, old.factor_bp)
          : cert.content_bp;
        movements.push({
          certificate: cert.number, content_bp: cert.content_bp, corrected_content_bp: corrected,
          claim_type: cert.claim_type, recipient_name: cert.recipient_name,
        });
      }
    }
    const reference = ref('RST');
    await one(
      `INSERT INTO restatement (reference,period,reason,revised_factor,opened_by,certificates,content_movements)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING reference`,
      [reference, periodId, reason, revised_factor || null, s.email,
       JSON.stringify(certs.map((x) => x.number)), JSON.stringify(movements)]
    );
    await appendEntry(null, {
      act: 'restatement_opened', person: s.email, site: p.site, object_kind: 'restatement',
      object_ref: reference,
      content: { period: periodId, reason, certificates: certs.map((x) => x.number) },
    });
    const r = await one('SELECT * FROM restatement WHERE reference = $1', [reference]);
    return { status: 201, body: await shapeRestatement(r) };
  });
});

ledgerRoutes.post('/restatements/:reference/resolutions', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'claims_manager', 'quality_manager');
  const restatement = c.req.param('reference');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { certificate, outcome, reason } = body;
    if (!['reissued', 'withdrawn', 'unaffected'].includes(outcome)) {
      return { status: 400, body: { error: 'outcome_not_permitted', permitted: ['reissued', 'withdrawn', 'unaffected'] } };
    }
    if (!certificate || !reason) {
      return { status: 400, body: { error: 'certificate_and_reason_required', message: 'Each affected certificate takes exactly one resolution, with its own stated reason.' } };
    }
    const r = await one('SELECT * FROM restatement WHERE reference = $1', [restatement]);
    if (!r) return { status: 404, body: { error: 'not_found' } };
    // No route resolves more than one certificate at a time, and a second
    // resolution against the same certificate in the same restatement is refused.
    const prior = await one(
      'SELECT * FROM resolution WHERE restatement = $1 AND certificate = $2',
      [restatement, certificate]
    );
    if (prior) {
      return {
        status: 409,
        body: {
          error: 'certificate_already_resolved', certificate, outcome: prior.outcome,
          reference: prior.reference,
          message: 'A restatement holds exactly one resolution per affected certificate.',
        },
      };
    }
    const reference = ref('RES');
    await one(
      `INSERT INTO resolution (reference,restatement,certificate,outcome,reason,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING reference`,
      [reference, restatement, certificate, outcome, reason, s.email]
    );
    await appendEntry(null, {
      act: 'restatement_resolved', person: s.email, object_kind: 'resolution', object_ref: reference,
      content: { restatement, certificate, outcome, reason },
    });
    const updated = await one('SELECT * FROM restatement WHERE reference = $1', [restatement]);
    const shaped = await shapeRestatement(updated);
    if (shaped.unresolved.length === 0) {
      await one("UPDATE restatement SET state='resolved' WHERE reference=$1 RETURNING reference", [restatement]);
    }
    return { status: 201, body: { reference, restatement, certificate, outcome, reason, unresolved: shaped.unresolved } };
  });
});

// ---------------------------------------------------------------------------
// Conversion factors
// ---------------------------------------------------------------------------

ledgerRoutes.get('/conversion-factors', async (c) => {
  requireSession(c);
  const rows = await q('SELECT * FROM conversion_factor ORDER BY site ASC, version ASC');
  return c.json(rows.map((f) => ({
    reference: f.reference, site: f.site, version: f.version, factor_bp: f.factor_bp,
    derived_from: isoDate(f.derived_from), derived_to: isoDate(f.derived_to),
    derived_in_g: Number(f.derived_in_g), derived_out_g: Number(f.derived_out_g),
    provisional: f.provisional, superseded_by: f.superseded_by,
    published_by: f.published_by, published_on: isoDate(f.published_on),
    derivation: f.derived_in_g
      ? `derived_out_g ${f.derived_out_g} * 10000 / derived_in_g ${f.derived_in_g}, floored`
      : 'provisional: no derivation window',
  })));
});

ledgerRoutes.post('/conversion-factors', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'claims_manager');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { site, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional } = body;
    for (const [k, v] of Object.entries({ factor_bp, derived_in_g, derived_out_g })) {
      if (!isInt(v)) return { status: 400, body: { error: 'integer_required', field: k } };
    }
    const st = await one('SELECT reference FROM site WHERE reference = $1', [site]);
    if (!st) return { status: 404, body: { error: 'site_not_found', site } };

    const isProvisional = derived_in_g === 0;
    if (!isProvisional) {
      const expected = fdiv(derived_out_g * 10000, derived_in_g);
      if (factor_bp !== expected) {
        // A factor is always the arithmetic of a stated window rather than a
        // number somebody chose.
        await appendEntry(null, {
          act: 'conversion_factor_refused', person: s.email, site, object_kind: 'conversion_factor',
          object_ref: site, outcome: 'refused',
          content: { factor_bp, expected_factor_bp: expected, derived_in_g, derived_out_g },
        });
        return {
          status: 409,
          body: {
            error: 'factor_does_not_reconcile', factor_bp, expected_factor_bp: expected,
            derived_in_g, derived_out_g,
            message: `A factor is the arithmetic of its window: derived_out_g ${derived_out_g} * 10000 / derived_in_g ${derived_in_g}, floored, is ${expected}.`,
          },
        };
      }
    }
    const prior = await one(
      'SELECT * FROM conversion_factor WHERE site = $1 ORDER BY version DESC LIMIT 1',
      [site]
    );
    const version = prior ? prior.version + 1 : 1;
    const reference = `CF-${site.replace('SITE-', '')}-${version}`;
    await one(
      `INSERT INTO conversion_factor (reference,site,version,factor_bp,derived_from,derived_to,derived_in_g,derived_out_g,provisional,published_by,published_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,current_date) RETURNING reference`,
      [reference, site, version, factor_bp, derived_from || null, derived_to || null,
       derived_in_g, derived_out_g, isProvisional || !!provisional, s.email]
    );
    // A version supersedes rather than overwrites.
    if (prior) {
      await one('UPDATE conversion_factor SET superseded_by = $1 WHERE reference = $2 RETURNING reference', [reference, prior.reference]);
    }
    await appendEntry(null, {
      act: 'conversion_factor_published', person: s.email, site, object_kind: 'conversion_factor',
      object_ref: reference,
      content: { factor_bp, derived_in_g, derived_out_g, version, supersedes: prior ? prior.reference : null },
    });
    return {
      status: 201,
      body: {
        reference, site, version, factor_bp, derived_from: derived_from || null,
        derived_to: derived_to || null, derived_in_g, derived_out_g,
        provisional: isProvisional || !!provisional,
        supersedes: prior ? prior.reference : null,
        derivation: isProvisional
          ? 'provisional: no derivation window, and every certificate resting on it says so'
          : `derived_out_g ${derived_out_g} * 10000 / derived_in_g ${derived_in_g}, floored`,
      },
    };
  });
});

ledgerRoutes.get('/refused-allocations', async (c) => {
  requireSession(c);
  const rows = await q('SELECT * FROM refused_allocation ORDER BY refused_at ASC');
  return c.json(rows.map((r) => ({
    reference: r.reference, period: r.period, lot: r.lot, category: r.category,
    requested_g: Number(r.requested_g), available_g: Number(r.available_g),
    refused_at: isoStamp(r.refused_at), refused_for: r.refused_for,
    margin_at_instant_g: Number(r.available_g),
  })));
});
