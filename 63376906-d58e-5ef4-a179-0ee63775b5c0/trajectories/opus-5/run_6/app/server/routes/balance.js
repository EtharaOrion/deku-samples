import { Hono } from 'hono';
import { q, pool } from '../lib/db.js';
import {
  requireSession, requireAct, withIdempotency, refuse, refusePagination,
  requireFields, requireIntegers, rejectComputedInputs, nextReference, today,
} from '../lib/http.js';
import { appendEntry } from '../lib/records.js';
import { periodView, lotClaim, CATEGORIES } from '../engine/ledger.js';
import { contentBp, factorFromWindow, carryOver } from '../engine/arithmetic.js';
import { iso } from '../engine/feedstock.js';

const r = new Hono();

r.get('/balance-periods', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const rows = await q('SELECT * FROM balance_period ORDER BY id ASC');
  return c.json(await Promise.all(rows.map(periodView)));
});

r.get('/balance-periods/:id', async (c) => {
  await requireSession(c);
  const row = (await q('SELECT * FROM balance_period WHERE id = $1', [c.req.param('id')]))[0];
  if (!row) refuse(404, 'not_found', { error: 'not_found', message: 'No such balance period.' });
  const view = await periodView(row);
  const lots = await q('SELECT * FROM lot WHERE site = $1 AND grade = $2 ORDER BY reference ASC', [row.site, row.grade]);
  view.lots = await Promise.all(lots.map(async (l) => {
    const claim = await lotClaim(l.reference);
    return {
      reference: l.reference, mass_g: Number(l.mass_g), disposition: l.disposition,
      claim_type: l.claim_type, content_bp: claim.content_bp,
      credit_attached_g: claim.credit_attached_g, category_split: claim.category_split,
    };
  }));
  return c.json(view);
});

// An allocation that would breach the available credit is refused rather than
// warned about; two racing allocations produce one success and one refusal.
r.post('/balance-periods/:id/allocations', async (c) => {
  const actor = await requireAct(c, 'balance.allocate');
  const body = await c.req.json().catch(() => ({}));
  const id = c.req.param('id');
  const out = await withIdempotency(c, body, async () => {
    rejectComputedInputs(body);
    requireFields(body, ['lot', 'category', 'mass_g']);
    requireIntegers(body, ['mass_g']);
    if (!CATEGORIES.includes(body.category)) {
      refuse(400, 'unknown_category', { error: 'unknown_category', message: 'A category is one of post_consumer, pre_consumer. The two are never netted.' });
    }
    if (body.mass_g <= 0) {
      refuse(400, 'mass_must_be_positive', { error: 'mass_must_be_positive', message: 'An allocation attaches a positive mass of claim.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // serialise every allocation against the same period: two allocations racing
      // for the same remainder produce one success and one refusal
      const periodRows = await client.query('SELECT * FROM balance_period WHERE id = $1 FOR UPDATE', [id]);
      const period = periodRows.rows[0];
      if (!period) {
        await client.query('ROLLBACK');
        refuse(404, 'not_found', { error: 'not_found', message: 'No such balance period.' });
      }
      if (period.state === 'closed') {
        await client.query('ROLLBACK');
        await appendEntry(null, {
          person: actor.email, site: period.site, object_kind: 'allocation', object_ref: id,
          action: 'refused', content: { reason: 'period_closed', lot: body.lot, requested_g: body.mass_g },
        });
        refuse(409, 'period_closed', {
          error: 'period_closed',
          message: 'This period is closed. Corrections require a restatement.',
          period: id,
        });
      }
      const lot = (await client.query('SELECT * FROM lot WHERE reference = $1', [body.lot])).rows[0];
      if (!lot) {
        await client.query('ROLLBACK');
        refuse(404, 'not_found', { error: 'not_found', message: 'No such lot.' });
      }

      const sums = await client.query(
        `SELECT direction, sum(mass_g)::bigint AS total FROM credit_movement
          WHERE period_id = $1 AND category = $2 GROUP BY direction`, [id, body.category]);
      let creditsIn = 0;
      let creditsOut = 0;
      for (const row of sums.rows) {
        if (row.direction === 'in') creditsIn += Number(row.total);
        else if (row.direction === 'out') creditsOut += Number(row.total);
      }
      const available = creditsIn - creditsOut;

      if (body.mass_g > available) {
        await client.query('ROLLBACK');
        // a refused allocation is an entry, with the margin at the instant of refusal
        await appendEntry(null, {
          person: actor.email, site: period.site, object_kind: 'allocation', object_ref: id,
          action: 'refused',
          content: { reason: 'insufficient_credit', lot: body.lot, category: body.category, available_g: available, requested_g: body.mass_g, margin_at_instant_g: available },
        });
        refuse(409, 'insufficient_credit', {
          error: 'insufficient_credit',
          message: `This allocation is refused. Available: ${available} g. Requested: ${body.mass_g} g.`,
          available_g: available,
          requested_g: body.mass_g,
          category: body.category,
          lot: body.lot,
          period: id,
        });
      }

      const reference = await nextAllocationRef(client);
      await client.query(
        `INSERT INTO credit_movement (period_id, category, direction, kind, mass_g, ref, lot, derivation, effective_on, event_at, recorded_by)
         VALUES ($1,$2,'out','allocation',$3,$4,$5,$6,$7,now(),$8)`,
        [id, body.category, body.mass_g, reference, body.lot,
          JSON.stringify({ lot: body.lot, lot_mass_g: Number(lot.mass_g), available_before_g: available, formula: 'content_bp = credit_attached_g * 10000 / lot_mass_g, floored' }),
          body.effective_on || today(), actor.email]);
      await client.query('COMMIT');

      const claim = await lotClaim(body.lot);
      await appendEntry(null, {
        person: actor.email, site: period.site, object_kind: 'allocation', object_ref: reference,
        action: 'allocated',
        content: { lot: body.lot, category: body.category, mass_g: body.mass_g, content_bp: claim.content_bp, available_after_g: available - body.mass_g },
      });

      return {
        status: 201,
        body: {
          reference, period: id, lot: body.lot, category: body.category, mass_g: body.mass_g,
          content_bp: claim.content_bp, claim_type: lot.claim_type,
          credit_attached_g: claim.credit_attached_g, category_split: claim.category_split,
          available_after_g: available - body.mass_g,
          derivation: claim.derivation,
        },
      };
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
      throw e;
    } finally {
      client.release();
    }
  });
  return c.json(out.body, out.status);
});

async function nextAllocationRef(client) {
  const rows = await client.query("SELECT ref FROM credit_movement WHERE ref LIKE 'ALO-%' ORDER BY ref DESC LIMIT 1");
  const n = rows.rows[0] ? Number(String(rows.rows[0].ref).split('-').pop()) : 0;
  return `ALO-${String((Number.isFinite(n) ? n : 0) + 1).padStart(4, '0')}`;
}

// A transfer is never a fresh credit; the total across the two periods is unchanged.
r.post('/balance-periods/:id/transfers', async (c) => {
  const actor = await requireAct(c, 'balance.transfer');
  const body = await c.req.json().catch(() => ({}));
  const id = c.req.param('id');
  const out = await withIdempotency(c, body, async () => {
    rejectComputedInputs(body);
    requireFields(body, ['to_period', 'category', 'mass_g']);
    requireIntegers(body, ['mass_g']);
    const from = (await q('SELECT * FROM balance_period WHERE id = $1', [id]))[0];
    const to = (await q('SELECT * FROM balance_period WHERE id = $1', [body.to_period]))[0];
    if (!from || !to) refuse(404, 'not_found', { error: 'not_found', message: 'No such balance period.' });
    if (from.state === 'closed' || to.state === 'closed') {
      refuse(409, 'period_closed', { error: 'period_closed', message: 'This period is closed. Corrections require a restatement.' });
    }
    const reference = await nextReference('TRF', 'transfer');
    const movedOn = body.moved_on || today();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO transfer (reference, from_period, to_period, category, mass_g, moved_on, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [reference, id, body.to_period, body.category, body.mass_g, movedOn, actor.email]);
      await client.query(
        `INSERT INTO credit_movement (period_id, category, direction, kind, mass_g, ref, origin_site, fresh_credit, derivation, effective_on, event_at, recorded_by)
         VALUES ($1,$2,'out','transfer_out',$3,$4,$5,false,$6,$7,now(),$8)`,
        [id, body.category, body.mass_g, reference, from.site,
          JSON.stringify({ transfer: reference, to_period: body.to_period }), movedOn, actor.email]);
      await client.query(
        `INSERT INTO credit_movement (period_id, category, direction, kind, mass_g, ref, origin_site, fresh_credit, derivation, effective_on, event_at, recorded_by)
         VALUES ($1,$2,'inbound','transfer_in',$3,$4,$5,false,$6,$7,now(),$8)`,
        [body.to_period, body.category, body.mass_g, reference, from.site,
          JSON.stringify({ transfer: reference, from_period: id, fresh_credit: false }), movedOn, actor.email]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    await appendEntry(null, {
      person: actor.email, site: from.site, object_kind: 'transfer', object_ref: reference, action: 'recorded',
      content: { from_period: id, to_period: body.to_period, category: body.category, mass_g: body.mass_g, origin_site: from.site, fresh_credit: false },
    });
    const receiving = await periodView((await q('SELECT * FROM balance_period WHERE id = $1', [body.to_period]))[0]);
    return {
      status: 201,
      body: {
        reference, from_period: id, to_period: body.to_period, category: body.category, mass_g: body.mass_g,
        moved_on: movedOn,
        inbound_credits: receiving.categories[body.category].inbound_credits,
        note: 'It is never a fresh credit, and the total credit across the two periods is unchanged by the journey.',
      },
    };
  });
  return c.json(out.body, out.status);
});

// Closing settles the carry-over, and is refused for the person who published the
// carbon method version it applies.
r.post('/balance-periods/:id/close', async (c) => {
  const actor = await requireAct(c, 'balance.close');
  const body = await c.req.json().catch(() => ({}));
  const id = c.req.param('id');
  const out = await withIdempotency(c, body, async () => {
    const period = (await q('SELECT * FROM balance_period WHERE id = $1', [id]))[0];
    if (!period) refuse(404, 'not_found', { error: 'not_found', message: 'No such balance period.' });
    if (period.state === 'closed') {
      await appendEntry(null, {
        person: actor.email, site: period.site, object_kind: 'balance_period', object_ref: id,
        action: 'close_refused', content: { reason: 'already_closed' },
      });
      refuse(409, 'period_closed', {
        error: 'period_closed',
        message: 'A closed period refuses every further write and refuses to reopen. Corrections require a restatement.',
        closed_on: iso(period.closed_on), cut_off: iso(period.cut_off),
      });
    }

    const blocking = [];
    const lots = await q('SELECT * FROM lot WHERE site = $1 AND grade = $2', [period.site, period.grade]);
    const undisposed = lots.filter((l) => l.disposition === 'pending');
    if (undisposed.length) blocking.push({ condition: 'lot_without_disposition', references: undisposed.map((l) => l.reference) });
    const deviations = await q("SELECT * FROM deviation WHERE state = 'open'");
    const lotRefs = lots.map((l) => l.reference);
    const openDev = deviations.filter((d) => (d.lots || []).some((x) => lotRefs.includes(x)));
    if (openDev.length) blocking.push({ condition: 'open_deviation', references: openDev.map((d) => d.reference) });

    const view = await periodView(period);
    for (const cat of CATEGORIES) {
      if (view.categories[cat].credits_available_g < 0) {
        blocking.push({ condition: 'balance_does_not_reconcile', references: [cat] });
      }
    }

    // the separation: whoever published a carbon method version does not close the
    // period applying it
    const figures = await q('SELECT DISTINCT method_id, method_version FROM carbon_figure WHERE lot = ANY($1)', [lotRefs]);
    for (const f of figures) {
      const mv = (await q('SELECT * FROM carbon_method_version WHERE method_id = $1 AND version = $2', [f.method_id, f.method_version]))[0];
      if (mv && String(mv.published_by).toLowerCase() === String(actor.email).toLowerCase()) {
        blocking.push({ condition: 'method_publisher_not_period_closer', references: [`${f.method_id} v${f.method_version}`] });
      }
    }

    if (blocking.length) {
      await appendEntry(null, {
        person: actor.email, site: period.site, object_kind: 'balance_period', object_ref: id,
        action: 'close_refused', content: { blocking },
      });
      refuse(409, 'close_refused', {
        error: 'close_refused',
        message: 'A period is not closed while any lot lacks a disposition, any deviation touching it is open, or the balance does not reconcile.',
        blocking,
        period: id,
      });
    }

    const closedOn = body.closed_on || today();
    const cutOff = body.cut_off || closedOn;
    const settlement = {};
    for (const cat of CATEGORIES) {
      const t = view.categories[cat];
      const co = carryOver(t.credits_in_g, t.credits_available_g, Number(period.carry_over_limit_bp));
      settlement[cat] = {
        credits_in_g: t.credits_in_g,
        credits_available_g: t.credits_available_g,
        carried_forward_g: co.carried_forward_g,
        expired_g: co.expired_g,
        carry_over_cap_g: co.cap_g,
        derivation: `credit still available carries forward only up to carry_over_limit_bp ${period.carry_over_limit_bp} of credits_in_g ${t.credits_in_g}: cap ${co.cap_g} g. The remainder expires.`,
      };
      if (co.expired_g > 0) {
        await pool.query(
          `INSERT INTO credit_movement (period_id, category, direction, kind, mass_g, ref, derivation, effective_on, event_at, recorded_by)
           VALUES ($1,$2,'note','expired',$3,$4,$5,$6,now(),$7)`,
          [id, cat, co.expired_g, `EXP-${id}-${cat}`, JSON.stringify(settlement[cat]), closedOn, actor.email]);
      }
    }

    await pool.query(
      `UPDATE balance_period SET state = 'closed', closed_on = $1, closed_by = $2, cut_off = $3 WHERE id = $4`,
      [closedOn, actor.email, cutOff, id]);
    await appendEntry(null, {
      person: actor.email, site: period.site, object_kind: 'balance_period', object_ref: id,
      action: 'closed', content: { closed_on: closedOn, cut_off: cutOff, settlement },
    });

    return {
      status: 201,
      body: {
        reference: id, period: id, state: 'closed', closed_on: closedOn, closed_by: actor.email,
        cut_off: cutOff, settlement,
        note: `A closed period refuses every further write and refuses to reopen. A late event-time record with an effective date after ${cutOff} no longer enters it.`,
      },
    };
  });
  return c.json(out.body, out.status);
});

// ---- restatements --------------------------------------------------------
r.get('/restatements', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const rows = await q('SELECT * FROM restatement ORDER BY reference ASC');
  const resolutions = await q('SELECT * FROM resolution');
  return c.json(rows.map((x) => ({
    reference: x.reference, period: x.period_id, reason: x.reason, state: x.state,
    certificates: x.certificates, content_movements: x.content_movements,
    opened_by: x.opened_by, opened_at: x.opened_at,
    resolutions: resolutions.filter((y) => y.restatement === x.reference).map((y) => ({
      certificate: y.certificate, outcome: y.outcome, reason: y.reason, recorded_by: y.recorded_by, recorded_at: y.recorded_at,
    })),
  })));
});

r.post('/balance-periods/:id/restatements', async (c) => {
  const actor = await requireAct(c, 'restatement.open');
  const body = await c.req.json().catch(() => ({}));
  const id = c.req.param('id');
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['reason']);
    const period = (await q('SELECT * FROM balance_period WHERE id = $1', [id]))[0];
    if (!period) refuse(404, 'not_found', { error: 'not_found', message: 'No such balance period.' });
    const reference = await nextReference('RST', 'restatement');

    // enumerates every certificate issued from the period, a complete set
    const certs = await q('SELECT * FROM certificate WHERE site = $1', [period.site]);
    const inPeriod = certs.filter((x) => x.payload?.period === id || x.site === period.site);

    let movements = [];
    if (body.revised_factor_bp !== undefined) {
      requireIntegers(body, ['revised_factor_bp']);
      const current = (await q('SELECT * FROM conversion_factor WHERE site = $1 AND superseded = false ORDER BY version DESC LIMIT 1', [period.site]))[0];
      movements = inPeriod.map((x) => {
        const currentBp = Number(x.payload?.content_bp || 0);
        const corrected = current && Number(current.factor_bp)
          ? Math.floor((currentBp * body.revised_factor_bp) / Number(current.factor_bp))
          : currentBp;
        return {
          certificate: x.number,
          content_bp: currentBp,
          corrected_content_bp: corrected,
          moved_bp: corrected - currentBp,
          derivation: `content_bp ${currentBp} restated under a revised factor of ${body.revised_factor_bp} bp against ${current?.factor_bp} bp, floored`,
        };
      });
    }

    await pool.query(
      `INSERT INTO restatement (reference, period_id, reason, state, certificates, content_movements, opened_by)
       VALUES ($1,$2,$3,'open',$4,$5,$6)`,
      [reference, id, body.reason, JSON.stringify(inPeriod.map((x) => x.number)), JSON.stringify(movements), actor.email]);
    await appendEntry(null, {
      person: actor.email, site: period.site, object_kind: 'restatement', object_ref: reference,
      action: 'opened', content: { period: id, reason: body.reason, certificates: inPeriod.map((x) => x.number) },
    });

    return {
      status: 201,
      body: {
        reference, period: id, reason: body.reason, state: 'open', complete: true,
        certificates: inPeriod.map((x) => ({
          number: x.number, state: x.state, recipient: x.recipient,
          recipient_name: x.payload?.recipient_name, signed_at: x.signed_at, resolution: null,
        })),
        content_movements: movements,
        note: 'Each affected certificate takes exactly one resolution in reissued, withdrawn, unaffected, each with its own stated reason.',
      },
    };
  });
  return c.json(out.body, out.status);
});

// One resolution per certificate; no route resolves more than one at a time.
r.post('/restatements/:reference/resolutions', async (c) => {
  const actor = await requireAct(c, 'restatement.resolve');
  const body = await c.req.json().catch(() => ({}));
  const reference = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['certificate', 'outcome', 'reason']);
    if (Array.isArray(body.certificate)) {
      refuse(400, 'one_certificate_at_a_time', { error: 'one_certificate_at_a_time', message: 'No route resolves more than one certificate at a time.' });
    }
    if (!['reissued', 'withdrawn', 'unaffected'].includes(body.outcome)) {
      refuse(400, 'unknown_outcome', { error: 'unknown_outcome', message: 'An outcome is one of reissued, withdrawn, unaffected.' });
    }
    const rst = (await q('SELECT * FROM restatement WHERE reference = $1', [reference]))[0];
    if (!rst) refuse(404, 'not_found', { error: 'not_found', message: 'No such restatement.' });
    const existing = (await q('SELECT * FROM resolution WHERE restatement = $1 AND certificate = $2', [reference, body.certificate]))[0];
    if (existing) {
      refuse(409, 'already_resolved', {
        error: 'already_resolved',
        message: 'Each affected certificate takes exactly one resolution in a restatement.',
        certificate: body.certificate, outcome: existing.outcome,
      });
    }
    const ins = await pool.query(
      'INSERT INTO resolution (restatement, certificate, outcome, reason, recorded_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [reference, body.certificate, body.outcome, body.reason, actor.email]);
    const resRef = `RES-${String(ins.rows[0].id).padStart(4, '0')}`;
    const all = await q('SELECT * FROM resolution WHERE restatement = $1', [reference]);
    const remaining = (rst.certificates || []).filter((x) => !all.some((y) => y.certificate === x));
    if (!remaining.length) {
      await pool.query("UPDATE restatement SET state = 'resolved' WHERE reference = $1", [reference]);
    }
    await appendEntry(null, {
      person: actor.email, object_kind: 'restatement', object_ref: reference, action: 'resolved_certificate',
      content: { certificate: body.certificate, outcome: body.outcome, reason: body.reason },
    });
    return {
      status: 201,
      body: {
        reference: resRef, restatement: reference, certificate: body.certificate,
        outcome: body.outcome, reason: body.reason, recorded_by: actor.email,
        remaining_certificates: remaining,
        restatement_state: remaining.length ? 'open' : 'resolved',
      },
    };
  });
  return c.json(out.body, out.status);
});

// ---- conversion factors --------------------------------------------------
r.get('/conversion-factors', async (c) => {
  await requireSession(c);
  const rows = await q('SELECT * FROM conversion_factor ORDER BY reference ASC');
  return c.json(rows.map((f) => ({
    reference: f.reference, site: f.site, version: f.version, factor_bp: Number(f.factor_bp),
    derived_from: iso(f.derived_from), derived_to: iso(f.derived_to),
    derived_in_g: Number(f.derived_in_g), derived_out_g: Number(f.derived_out_g),
    provisional: f.provisional, superseded: f.superseded,
    published_by: f.published_by, published_on: iso(f.published_on),
    derivation: f.provisional
      ? 'A provisional factor carries derived_in_g of zero and no window; every certificate resting on it says so.'
      : `derived_out_g ${f.derived_out_g} * 10000 / derived_in_g ${f.derived_in_g}, floored`,
  })));
});

// The factor is refused unless it is the arithmetic of its stated window.
r.post('/conversion-factors', async (c) => {
  const actor = await requireAct(c, 'factor.publish');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['site', 'factor_bp', 'derived_in_g', 'derived_out_g']);
    requireIntegers(body, ['factor_bp', 'derived_in_g', 'derived_out_g']);
    const site = (await q('SELECT * FROM site WHERE reference = $1', [body.site]))[0];
    if (!site) refuse(404, 'not_found', { error: 'not_found', message: 'No such site.' });
    const provisional = body.derived_in_g === 0;
    if (!provisional) {
      const expected = factorFromWindow(body.derived_in_g, body.derived_out_g);
      if (expected !== body.factor_bp) {
        await appendEntry(null, {
          person: actor.email, site: body.site, object_kind: 'conversion_factor', object_ref: body.site,
          action: 'publish_refused',
          content: { factor_bp: body.factor_bp, expected_bp: expected, derived_in_g: body.derived_in_g, derived_out_g: body.derived_out_g },
        });
        refuse(409, 'factor_does_not_reconcile', {
          error: 'factor_does_not_reconcile',
          message: 'A factor is always the arithmetic of a stated window rather than a number somebody chose.',
          factor_bp: body.factor_bp,
          expected_factor_bp: expected,
          derivation: `derived_out_g ${body.derived_out_g} * 10000 / derived_in_g ${body.derived_in_g}, floored`,
        });
      }
      if (!body.derived_from || !body.derived_to) {
        refuse(400, 'window_required', { error: 'window_required', message: 'A derived factor names the window it was derived from.' });
      }
    }
    const prior = (await q('SELECT * FROM conversion_factor WHERE site = $1 ORDER BY version DESC LIMIT 1', [body.site]))[0];
    const version = prior ? prior.version + 1 : 1;
    const reference = `CF-${body.site.replace('SITE-', '')}-${version}`;
    // a versioned definition is superseded by a new version and never overwritten
    if (prior) await pool.query('UPDATE conversion_factor SET superseded = true WHERE reference = $1', [prior.reference]);
    await pool.query(
      `INSERT INTO conversion_factor (reference, site, version, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [reference, body.site, version, body.factor_bp, body.derived_from || null, body.derived_to || null,
        body.derived_in_g, body.derived_out_g, provisional, actor.email, today()]);
    await appendEntry(null, {
      person: actor.email, site: body.site, object_kind: 'conversion_factor', object_ref: reference,
      action: 'published',
      content: { factor_bp: body.factor_bp, derived_in_g: body.derived_in_g, derived_out_g: body.derived_out_g, provisional, supersedes: prior?.reference || null },
    });
    return {
      status: 201,
      body: {
        reference, site: body.site, version, factor_bp: body.factor_bp,
        derived_from: body.derived_from || null, derived_to: body.derived_to || null,
        derived_in_g: body.derived_in_g, derived_out_g: body.derived_out_g,
        provisional, supersedes: prior?.reference || null,
        derivation: provisional
          ? 'A provisional factor carries derived_in_g of zero, declares itself provisional, and every certificate resting on it says so.'
          : `derived_out_g ${body.derived_out_g} * 10000 / derived_in_g ${body.derived_in_g}, floored`,
      },
    };
  });
  return c.json(out.body, out.status);
});

export default r;
