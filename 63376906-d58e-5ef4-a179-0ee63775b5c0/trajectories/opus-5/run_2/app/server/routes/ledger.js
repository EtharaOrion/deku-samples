import { q, one, pool, tx } from '../lib/db.js';
import {
  refuse, requireSession, requireRole, idempotent, record, refuseParams,
  refuseComputedInput, requireInteger, requireOneOf, refuseAuditorWrite, nextReference,
} from '../lib/http.js';
import { balancePeriodView, lotView, iso, contentBp, summariseMovements } from '../lib/engine.js';
import { factorFromWindow, carryForwardCapG, floorDiv } from '../lib/arith.js';

export default function mount(app) {
  app.get('/balance-periods', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT id FROM balance_period ORDER BY id ASC');
    const out = [];
    for (const r of rows) out.push(await balancePeriodView(r.id));
    return c.json(out);
  });

  app.get('/balance-periods/:id', async (c) => {
    requireSession(c);
    const v = await balancePeriodView(c.req.param('id'));
    if (!v) refuse(404, 'no_such_period', { message: 'There is no such balance period.' });
    return c.json(v);
  });

  /* ------------------------------------------------------- allocations */
  // Credits attached never exceed credits available. An allocation that would
  // breach that is refused rather than warned about, and two allocations racing
  // for the same remainder produce one success and one refusal.
  app.post('/balance-periods/:id/allocations', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'claims_manager');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const period = await one('SELECT * FROM balance_period WHERE id = $1', [id]);
    if (!period) refuse(404, 'no_such_period', { message: 'There is no such balance period.' });
    if (period.state === 'closed') {
      refuse(409, 'period_closed', { message: 'This period is closed. Corrections require a restatement.' });
    }
    const category = requireOneOf(body, 'category', ['post_consumer', 'pre_consumer']);
    const mass_g = requireInteger(body, 'mass_g', { min: 1 });
    if (!body.lot) refuse(400, 'field_required', { message: 'lot is required.', field: 'lot' });
    const lot = await one('SELECT * FROM lot WHERE reference = $1', [body.lot]);
    if (!lot) refuse(404, 'no_such_lot', { message: 'There is no such lot.', field: 'lot' });

    const outcome = await idempotent(c, body, async () => {
      // The row lock serialises two allocations racing for the same remainder.
      return tx(async (client) => {
        await client.query('SELECT id FROM balance_period WHERE id = $1 FOR UPDATE', [id]);
        const movements = (await client.query(
          'SELECT * FROM credit_movement WHERE period_id = $1', [id])).rows;
        const sums = summariseMovements(movements);
        const available = sums[category].credits_available_g;
        if (mass_g > available) {
          return { refused: true, available_g: available, requested_g: mass_g };
        }
        const reference = await nextReference('MOV');
        await client.query(
          `INSERT INTO credit_movement (reference, period_id, category, direction, mass_g, source_kind, source_ref,
            lot, effective_on, created_by, derivation, fresh_credit)
           VALUES ($1,$2,$3,'out',$4,'allocation',$5,$6,$7,$8,$9,true)`,
          [reference, id, category, mass_g, reference, body.lot,
            String(body.effective_on || iso(new Date())).slice(0, 10), s.identifier,
            JSON.stringify({
              lot: body.lot, category, available_before_g: available,
              rule: 'a claim attached to a lot leaves the ledger',
            })]);
        return { refused: false, reference, available_before_g: available };
      }).then(async (r) => {
        if (r.refused) {
          // A refused allocation is recorded with the margin at the instant.
          await record(c, {
            action: 'allocation_refused', object_kind: 'balance_period', object_ref: id, site: period.site,
            outcome: 'refused',
            content: { lot: body.lot, category, requested_g: r.requested_g, available_g: r.available_g, margin_at_instant_g: r.available_g },
          });
          return {
            status: 409,
            body: {
              error: 'insufficient_credits',
              rule: 'insufficient_credits',
              message: `This allocation is refused. Available: ${r.available_g} g. Requested: ${r.requested_g} g.`,
              available_g: r.available_g,
              requested_g: r.requested_g,
              category,
              lot: body.lot,
              period: id,
            },
          };
        }
        await record(c, {
          action: 'allocation_attached', object_kind: 'credit_movement', object_ref: r.reference, site: period.site,
          content: { lot: body.lot, category, mass_g, period: id, available_before_g: r.available_before_g },
        });
        const view = await lotView(body.lot);
        return {
          status: 201,
          body: {
            reference: r.reference, period: id, lot: body.lot, category, mass_g,
            lot_content_bp: view.content_bp, lot_category_split: view.category_split,
            claim_type: view.claim_type,
            derivation: { lot_content_bp: `credit_attached_g ${view.credit_attached_g} * 10000 / lot_mass_g ${view.mass_g}, floored` },
          },
        };
      });
    });
    return c.json(outcome.body, outcome.status);
  });

  /* ---------------------------------------------------------- transfers */
  // A transfer is never a fresh credit and the total credit across the two
  // periods is unchanged by the journey.
  app.post('/balance-periods/:id/transfers', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'claims_manager');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const from = await one('SELECT * FROM balance_period WHERE id = $1', [id]);
    if (!from) refuse(404, 'no_such_period', { message: 'There is no such balance period.' });
    if (from.state === 'closed') refuse(409, 'period_closed', { message: 'This period is closed. Corrections require a restatement.' });
    const to = await one('SELECT * FROM balance_period WHERE id = $1', [body.to_period]);
    if (!to) refuse(400, 'no_such_period', { message: 'There is no such receiving period.', field: 'to_period' });
    const category = requireOneOf(body, 'category', ['post_consumer', 'pre_consumer']);
    const mass_g = requireInteger(body, 'mass_g', { min: 1 });

    const result = await idempotent(c, body, async () => {
      const out = await tx(async (client) => {
        await client.query('SELECT id FROM balance_period WHERE id = $1 FOR UPDATE', [id]);
        const movements = (await client.query('SELECT * FROM credit_movement WHERE period_id = $1', [id])).rows;
        const sums = summariseMovements(movements);
        if (mass_g > sums[category].credits_available_g) {
          return { refused: true, available_g: sums[category].credits_available_g };
        }
        const reference = await nextReference('TRF');
        const moved_on = String(body.moved_on || iso(new Date())).slice(0, 10);
        await client.query(
          `INSERT INTO transfer (reference, from_period, to_period, category, mass_g, moved_on, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [reference, id, to.id, category, mass_g, moved_on, s.identifier]);
        const outRef = await nextReference('MOV');
        await client.query(
          `INSERT INTO credit_movement (reference, period_id, category, direction, mass_g, source_kind, source_ref,
            movement_ref, origin_site, effective_on, created_by, derivation, fresh_credit)
           VALUES ($1,$2,$3,'out',$4,'transfer_out',$5,$5,$6,$7,$8,$9,false)`,
          [outRef, id, category, mass_g, reference, from.site, moved_on, s.identifier,
            JSON.stringify({ transfer: reference, to: to.id })]);
        const inRef = await nextReference('MOV');
        await client.query(
          `INSERT INTO credit_movement (reference, period_id, category, direction, mass_g, source_kind, source_ref,
            movement_ref, origin_site, effective_on, created_by, derivation, fresh_credit)
           VALUES ($1,$2,$3,'in',$4,'transfer_in',$5,$5,$6,$7,$8,$9,false)`,
          [inRef, to.id, category, mass_g, reference, from.site, moved_on, s.identifier,
            JSON.stringify({
              transfer: reference, from: id, origin_site: from.site,
              rule: 'material moved between sites during commissioning is never a fresh credit',
            })]);
        return { refused: false, reference, moved_on };
      });
      if (out.refused) {
        refuse(409, 'insufficient_credits', {
          message: `This transfer is refused. Available: ${out.available_g} g. Requested: ${mass_g} g.`,
          available_g: out.available_g, requested_g: mass_g,
        });
      }
      await record(c, {
        action: 'transfer_recorded', object_kind: 'transfer', object_ref: out.reference, site: from.site,
        content: { from: id, to: to.id, category, mass_g, fresh_credit: false },
      });
      const receiving = await balancePeriodView(to.id);
      return {
        status: 201,
        body: {
          reference: out.reference, from_period: id, to_period: to.id, category, mass_g,
          moved_on: out.moved_on,
          inbound_credits: receiving.inbound_credits,
          note: 'It is never a fresh credit, and the total credit across the two periods is unchanged by the journey.',
        },
      };
    });
    return c.json(result.body, result.status);
  });

  /* -------------------------------------------------------------- close */
  // Closing is refused while any lot lacks a disposition, any deviation touching
  // the period is open, or the balance does not reconcile.
  app.post('/balance-periods/:id/close', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'claims_manager');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const p = await one('SELECT * FROM balance_period WHERE id = $1', [id]);
    if (!p) refuse(404, 'no_such_period', { message: 'There is no such balance period.' });
    if (p.state === 'closed') {
      refuse(409, 'period_closed', {
        message: 'A closed period refuses every further write and refuses to reopen.',
        closed_on: iso(p.closed_on), cut_off: iso(p.cut_off),
      });
    }

    // Whoever published a carbon method version does not close the period applying it.
    const lots = await q('SELECT * FROM lot WHERE period_id = $1', [id]);
    const figures = await q(
      `SELECT DISTINCT method_id, method_version FROM carbon_figure WHERE lot = ANY($1)`,
      [lots.map((l) => l.reference)]);
    for (const f of figures) {
      const m = await one('SELECT * FROM carbon_method WHERE id = $1 AND version = $2', [f.method_id, f.method_version]);
      if (m && m.published_by === s.identifier) {
        await record(c, {
          action: 'period_close_refused', object_kind: 'balance_period', object_ref: id, site: p.site,
          outcome: 'refused', content: { reason: 'publisher_not_closer', method: `${f.method_id} v${f.method_version}` },
        });
        refuse(403, 'separation_publisher_not_closer', {
          message: 'Whoever published a carbon method version does not close the period applying it.',
          separation: 'publisher_not_closer',
          blocking_reference: `${f.method_id} v${f.method_version}`,
        });
      }
    }

    const blocking = [];
    for (const l of lots) {
      if (l.disposition === 'pending') blocking.push({ condition: 'lot_lacks_disposition', reference: l.reference });
    }
    const openDevs = await q(
      `SELECT reference FROM deviation WHERE state = 'open' AND (lots && $1 OR runs && $2)`,
      [lots.map((l) => l.reference), (await q('SELECT reference FROM run WHERE site = $1', [p.site])).map((r) => r.reference)]);
    for (const d of openDevs) blocking.push({ condition: 'deviation_open', reference: d.reference });
    const view = await balancePeriodView(id);
    if (view.post_consumer.credits_available_g < 0 || view.pre_consumer.credits_available_g < 0) {
      blocking.push({ condition: 'balance_does_not_reconcile', reference: id });
    }
    if (blocking.length) {
      await record(c, {
        action: 'period_close_refused', object_kind: 'balance_period', object_ref: id, site: p.site,
        outcome: 'refused', content: { blocking },
      });
      refuse(409, 'period_close_blocked', {
        message: 'This period does not close while a lot lacks a disposition, a deviation touching it is open, or the balance does not reconcile.',
        blocking,
      });
    }

    const result = await idempotent(c, body, async () => {
      const closed_on = String(body.closed_on || iso(new Date())).slice(0, 10);
      const cut_off = String(body.cut_off || closed_on).slice(0, 10);
      const carried = {};
      for (const cat of ['post_consumer', 'pre_consumer']) {
        // Credit still available carries forward only up to carry_over_limit_bp
        // of the credit that entered the period; the remainder expires.
        const cap = carryForwardCapG(view[cat].credits_in_g, p.carry_over_limit_bp);
        const available = Math.max(view[cat].credits_available_g, 0);
        const carriedG = Math.min(cap, available);
        const expiredG = available - carriedG;
        carried[cat] = { carried_forward_g: carriedG, expired_g: expiredG, cap_g: cap };
        if (expiredG > 0) {
          const ref = await nextReference('MOV');
          await pool.query(
            `INSERT INTO credit_movement (reference, period_id, category, direction, mass_g, source_kind, source_ref,
              effective_on, created_by, derivation, fresh_credit)
             VALUES ($1,$2,$3,'out',$4,'expiry',$1,$5,$6,$7,false)`,
            [ref, id, cat, expiredG, closed_on, s.identifier,
              JSON.stringify({ rule: `credit above ${p.carry_over_limit_bp} bp of credits in expires at the close`, cap_g: cap })]);
        }
      }
      await pool.query(
        `UPDATE balance_period SET state = 'closed', closed_on = $1, closed_by = $2, cut_off = $3 WHERE id = $4`,
        [closed_on, s.identifier, cut_off, id]);
      await record(c, {
        action: 'period_closed', object_kind: 'balance_period', object_ref: id, site: p.site,
        content: { closed_on, cut_off, carry_over: carried },
      });
      return {
        status: 200,
        body: {
          id, state: 'closed', closed_on, cut_off,
          carried_forward_g: {
            post_consumer: carried.post_consumer.carried_forward_g,
            pre_consumer: carried.pre_consumer.carried_forward_g,
          },
          expired_g: {
            post_consumer: carried.post_consumer.expired_g,
            pre_consumer: carried.pre_consumer.expired_g,
          },
          carry_over_limit_bp: p.carry_over_limit_bp,
          derivation: { cap: `credits_in_g * ${p.carry_over_limit_bp} / 10000, floored` },
          note: 'A closed period refuses every further write and refuses to reopen. The cut_off is the date after which a late event-time record no longer enters it.',
        },
      };
    });
    return c.json(result.body, result.status);
  });

  /* ------------------------------------------------------- restatements */
  app.get('/restatements', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT * FROM restatement ORDER BY opened_at ASC');
    const out = [];
    for (const r of rows) {
      const res = await q('SELECT * FROM resolution WHERE restatement = $1', [r.reference]);
      out.push({
        reference: r.reference, period: r.period_id, reason: r.reason, state: r.state,
        opened_by: r.opened_by, opened_at: r.opened_at, certificates: r.certificates,
        content_movements: r.content_movements,
        resolutions: res.map((x) => ({ reference: x.id, certificate: x.certificate, outcome: x.outcome, reason: x.reason })),
        complete: true,
      });
    }
    return c.json(out);
  });

  app.get('/restatements/:reference', async (c) => {
    refuseParams(c);
    requireSession(c);
    const r = await one('SELECT * FROM restatement WHERE reference = $1', [c.req.param('reference')]);
    if (!r) refuse(404, 'no_such_restatement', { message: 'There is no such restatement.' });
    const res = await q('SELECT * FROM resolution WHERE restatement = $1', [r.reference]);
    return c.json({
      reference: r.reference, period: r.period_id, reason: r.reason, state: r.state,
      opened_by: r.opened_by, opened_at: r.opened_at, certificates: r.certificates,
      content_movements: r.content_movements,
      resolutions: res.map((x) => ({ reference: x.id, certificate: x.certificate, outcome: x.outcome, reason: x.reason })),
      unresolved: r.certificates.filter((n) => !res.find((x) => x.certificate === n)),
      complete: true,
    });
  });

  // A restatement enumerates every certificate issued from the period.
  app.post('/balance-periods/:id/restatements', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'claims_manager');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const p = await one('SELECT * FROM balance_period WHERE id = $1', [id]);
    if (!p) refuse(404, 'no_such_period', { message: 'There is no such balance period.' });
    if (!body.reason) refuse(400, 'field_required', { message: 'reason is required.', field: 'reason' });

    const result = await idempotent(c, body, async () => {
      const reference = await nextReference('RST');
      const certs = await q('SELECT * FROM certificate WHERE period = $1 ORDER BY number ASC', [id]);
      let content_movements = [];
      let revised = null;
      // Where the restatement revises a conversion factor it answers the figure
      // that moved for each affected certificate.
      if (body.revised_conversion_factor) {
        const cf = await one('SELECT * FROM conversion_factor WHERE reference = $1', [body.revised_conversion_factor]);
        if (!cf) refuse(400, 'no_such_conversion_factor', { message: 'There is no such conversion factor.', field: 'revised_conversion_factor' });
        revised = cf.reference;
        const prior = await one(
          `SELECT * FROM conversion_factor WHERE site = $1 AND version < $2 ORDER BY version DESC LIMIT 1`,
          [cf.site, cf.version]);
        content_movements = certs.map((x) => {
          const priorBp = prior ? prior.factor_bp : cf.factor_bp;
          const corrected = priorBp === 0 ? x.content_bp : floorDiv(x.content_bp * cf.factor_bp, priorBp);
          return {
            certificate: x.number,
            content_bp: x.content_bp,
            corrected_content_bp: corrected,
            claim_type: x.claim_type,
          };
        });
      }
      await pool.query(
        `INSERT INTO restatement (reference, period_id, reason, opened_by, certificates, content_movements, revised_factor)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [reference, id, body.reason, s.identifier, certs.map((x) => x.number),
          JSON.stringify(content_movements), revised]);
      await record(c, {
        action: 'restatement_opened', object_kind: 'restatement', object_ref: reference, site: p.site,
        content: { period: id, reason: body.reason, certificates: certs.map((x) => x.number) },
      });
      return {
        status: 201,
        body: {
          reference, period: id, reason: body.reason, state: 'open',
          certificates: certs.map((x) => ({
            number: x.number, version: x.version, recipient: x.recipient,
            recipient_name: x.recipient_name, state: x.state, content_bp: x.content_bp, claim_type: x.claim_type,
          })),
          content_movements,
          complete: true,
          note: 'Each affected certificate takes exactly one resolution, each with its own stated reason.',
        },
      };
    });
    return c.json(result.body, result.status);
  });

  // No route resolves more than one certificate at a time.
  app.post('/restatements/:reference/resolutions', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'claims_manager', 'quality_manager');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const r = await one('SELECT * FROM restatement WHERE reference = $1', [ref]);
    if (!r) refuse(404, 'no_such_restatement', { message: 'There is no such restatement.' });
    if (Array.isArray(body.certificate) || Array.isArray(body.certificates)) {
      refuse(400, 'one_certificate_at_a_time', {
        message: 'No route resolves more than one certificate at a time.',
      });
    }
    if (!body.certificate) refuse(400, 'field_required', { message: 'certificate is required.', field: 'certificate' });
    const outcome = requireOneOf(body, 'outcome', ['reissued', 'withdrawn', 'unaffected']);
    if (!body.reason) refuse(400, 'field_required', { message: 'Each resolution carries its own stated reason.', field: 'reason' });
    const existing = await one(
      'SELECT * FROM resolution WHERE restatement = $1 AND certificate = $2', [ref, body.certificate]);
    if (existing) {
      refuse(409, 'certificate_already_resolved', {
        message: 'A restatement holds exactly one resolution per affected certificate.',
        certificate: body.certificate, held_outcome: existing.outcome,
      });
    }

    const result = await idempotent(c, body, async () => {
      const id = await nextReference('RES');
      await pool.query(
        `INSERT INTO resolution (id, restatement, certificate, outcome, reason, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, ref, body.certificate, outcome, body.reason, s.identifier]);
      const res = await q('SELECT * FROM resolution WHERE restatement = $1', [ref]);
      const unresolved = r.certificates.filter((n) => !res.find((x) => x.certificate === n));
      if (unresolved.length === 0) {
        await pool.query(`UPDATE restatement SET state = 'resolved' WHERE reference = $1`, [ref]);
      }
      await record(c, {
        action: 'restatement_resolved', object_kind: 'resolution', object_ref: id,
        content: { restatement: ref, certificate: body.certificate, outcome, reason: body.reason },
      });
      return {
        status: 201,
        body: {
          reference: id, restatement: ref, certificate: body.certificate, outcome,
          reason: body.reason, unresolved, state: unresolved.length ? 'open' : 'resolved',
        },
      };
    });
    return c.json(result.body, result.status);
  });

  /* -------------------------------------------------- conversion factors */
  app.get('/conversion-factors', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT * FROM conversion_factor ORDER BY site, version');
    return c.json(rows.map((f) => ({
      reference: f.reference, site: f.site, version: f.version, factor_bp: f.factor_bp,
      derived_from: iso(f.derived_from), derived_to: iso(f.derived_to),
      derived_in_g: Number(f.derived_in_g), derived_out_g: Number(f.derived_out_g),
      provisional: f.provisional, published_by: f.published_by, published_on: iso(f.published_on),
      superseded_by: f.superseded_by,
      derivation: f.provisional
        ? { factor_bp: 'provisional: there is no derivation window, so no site loss history stands behind it' }
        : { factor_bp: `derived_out_g ${Number(f.derived_out_g)} * 10000 / derived_in_g ${Number(f.derived_in_g)}, floored` },
    })));
  });

  // A factor is always the arithmetic of a stated window rather than a number
  // somebody chose.
  app.post('/conversion-factors', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'claims_manager');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const site = await one('SELECT * FROM site WHERE reference = $1', [body.site]);
    if (!site) refuse(400, 'no_such_site', { message: 'There is no such site.', field: 'site' });
    const factor_bp = requireInteger(body, 'factor_bp');
    const derived_in_g = requireInteger(body, 'derived_in_g');
    const derived_out_g = requireInteger(body, 'derived_out_g');
    const provisional = derived_in_g === 0;
    if (!provisional) {
      const expected = factorFromWindow(derived_in_g, derived_out_g);
      if (factor_bp !== expected) {
        await record(c, {
          action: 'conversion_factor_refused', object_kind: 'conversion_factor', object_ref: body.site,
          outcome: 'refused', content: { factor_bp, expected_factor_bp: expected, derived_in_g, derived_out_g },
        });
        refuse(409, 'factor_does_not_reconcile', {
          message: 'A factor whose factor_bp disagrees with derived_out_g * 10000 / derived_in_g, floored, is a factor nobody can stand behind.',
          factor_bp, expected_factor_bp: expected, derived_in_g, derived_out_g,
        });
      }
      if (!body.derived_from || !body.derived_to) {
        refuse(400, 'field_required', { message: 'A derived factor states its window.', field: 'derived_from' });
      }
    }

    const result = await idempotent(c, body, async () => {
      const prior = await one(
        `SELECT * FROM conversion_factor WHERE site = $1 AND superseded_by IS NULL ORDER BY version DESC LIMIT 1`,
        [body.site]);
      const version = (prior?.version || 0) + 1;
      const reference = `CF-${body.site.replace('SITE-', '')}-${version}`;
      await pool.query(
        `INSERT INTO conversion_factor (reference, site, version, factor_bp, derived_from, derived_to,
          derived_in_g, derived_out_g, provisional, published_by, published_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [reference, body.site, version, factor_bp, body.derived_from || null, body.derived_to || null,
          derived_in_g, derived_out_g, provisional, s.identifier, iso(new Date())]);
      // A version supersedes rather than overwrites.
      if (prior) await pool.query('UPDATE conversion_factor SET superseded_by = $1 WHERE reference = $2', [reference, prior.reference]);
      await record(c, {
        action: 'conversion_factor_published', object_kind: 'conversion_factor', object_ref: reference, site: body.site,
        content: { factor_bp, derived_in_g, derived_out_g, provisional, supersedes: prior?.reference || null },
      });
      return {
        status: 201,
        body: {
          reference, site: body.site, version, factor_bp, derived_from: body.derived_from || null,
          derived_to: body.derived_to || null, derived_in_g, derived_out_g, provisional,
          supersedes: prior?.reference || null,
          note: provisional
            ? 'A provisional factor carries derived_in_g of zero, and every certificate resting on it says so.'
            : null,
        },
      };
    });
    return c.json(result.body, result.status);
  });

  /* ---------------------------------------------------------- contracts */
  app.get('/contracts', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT id FROM contract ORDER BY id');
    const { contractProjection } = await import('../lib/engine.js');
    const out = [];
    for (const r of rows) out.push(await contractProjection(r.id));
    return c.json(out);
  });

  app.get('/contracts/:id/projection', async (c) => {
    requireSession(c);
    const { contractProjection } = await import('../lib/engine.js');
    const v = await contractProjection(c.req.param('id'));
    if (!v) refuse(404, 'no_such_contract', { message: 'There is no such contract.' });
    return c.json(v);
  });

  // Where supply is short, an allocation names the person who decided and the
  // contracts that went without.
  app.post('/contracts/:id/allocations', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'claims_manager');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const contract = await one('SELECT * FROM contract WHERE id = $1', [id]);
    if (!contract) refuse(404, 'no_such_contract', { message: 'There is no such contract.' });
    if (!body.lot) refuse(400, 'field_required', { message: 'lot is required.', field: 'lot' });
    const lot = await lotView(body.lot);
    if (!lot) refuse(404, 'no_such_lot', { message: 'There is no such lot.', field: 'lot' });
    // A claim already allocated to one contract is refused a second attachment.
    const already = await one('SELECT * FROM contract_allocation WHERE lot = $1', [body.lot]);
    if (already) {
      await record(c, {
        action: 'contract_allocation_refused', object_kind: 'contract', object_ref: id,
        outcome: 'refused', content: { lot: body.lot, held_by: already.contract },
      });
      refuse(409, 'claim_already_allocated', {
        message: 'A claim already allocated to one contract is refused a second attachment.',
        lot: body.lot, held_by_contract: already.contract,
      });
    }
    const mass_g = requireInteger(body, 'mass_g', { min: 1 });

    const result = await idempotent(c, body, async () => {
      const allocId = await nextReference('CAL');
      await pool.query(
        `INSERT INTO contract_allocation (id, contract, lot, mass_g, content_bp, decided_by, favoured_over)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [allocId, id, body.lot, mass_g, lot.content_bp, body.decided_by || s.identifier, body.favoured_over || []]);
      await record(c, {
        action: 'contract_allocation_recorded', object_kind: 'contract_allocation', object_ref: allocId, site: contract.site,
        content: {
          contract: id, lot: body.lot, mass_g, content_bp: lot.content_bp,
          decided_by: body.decided_by || s.identifier, favoured_over: body.favoured_over || [],
        },
      });
      const { contractProjection } = await import('../lib/engine.js');
      return {
        status: 201,
        body: {
          reference: allocId, contract: id, lot: body.lot, mass_g, content_bp: lot.content_bp,
          claim_type: lot.claim_type,
          decided_by: body.decided_by || s.identifier, favoured_over: body.favoured_over || [],
          projection: await contractProjection(id),
        },
      };
    });
    return c.json(result.body, result.status);
  });
}
