import { query, one, tx, nextCounter } from '../db.js';
import {
  refuse, requireSession, requireRole, refuseAuditorWrite, withIdempotency,
  refusePagination, recordRefusal, todayISO, dateOnly, momentISO,
} from '../lib/http.js';
import { appendEntry } from '../lib/record.js';
import { requireInteger, floorDiv, contentBp } from '../lib/num.js';
import * as engine from '../engine.js';

const CATEGORIES = ['post_consumer', 'pre_consumer'];

async function periodPayload(p) {
  const { figures } = await engine.balanceFigures(p.id);
  const factors = await query(
    'SELECT * FROM conversion_factor WHERE site = $1 ORDER BY version', [p.site]
  );
  const overrides = await query(
    `SELECT o.reference FROM override o JOIN lot l ON l.reference = o.lot WHERE l.period = $1`, [p.id]
  );
  const restatements = await query(
    "SELECT reference FROM restatement WHERE period = $1 AND state = 'open'", [p.id]
  );
  const findings = await query(
    `SELECT reference FROM finding WHERE state = 'open' AND due_on < CURRENT_DATE`
  );
  const nonClaimable = await query(
    `SELECT c.input_ref, c.mass_g FROM consumption c
       JOIN run r ON r.reference = c.run
      WHERE c.input_kind = 'batch' AND r.site = $1
        AND c.effective_on BETWEEN $2 AND $3`,
    [p.site, dateOnly(p.period_from), dateOnly(p.period_to)]
  );
  let nonClaimableG = 0;
  const nonClaimableDetail = [];
  for (const row of nonClaimable) {
    const b = await engine.batchByReference(row.input_ref);
    if (b && !b.claimable) {
      nonClaimableG += Number(row.mass_g);
      nonClaimableDetail.push({ batch: row.input_ref, mass_g: Number(row.mass_g), reason: b.claimable_reason });
    }
  }
  const inbound = (await query(
    "SELECT * FROM credit_movement WHERE period = $1 AND fresh_credit = false AND direction = 'in' ORDER BY reference", [p.id]
  )).map((m) => ({
    reference: m.reference, mass_g: Number(m.mass_g), origin_site: m.origin_site,
    movement: m.movement, category: m.category, fresh_credit: false,
  }));
  const lots = await query('SELECT reference, disposition, mass_g FROM lot WHERE period = $1 ORDER BY reference', [p.id]);

  return {
    id: p.id,
    site: p.site,
    grade: p.grade,
    period: { from: dateOnly(p.period_from), to: dateOnly(p.period_to) },
    state: p.state,
    allocation_basis: p.allocation_basis,
    post_consumer: figures.post_consumer,
    pre_consumer: figures.pre_consumer,
    conversion_factors: factors.map((f) => ({
      reference: f.reference, version: f.version, factor_bp: f.factor_bp,
      derived_from: dateOnly(f.derived_from), derived_to: dateOnly(f.derived_to),
      derived_in_g: Number(f.derived_in_g), derived_out_g: Number(f.derived_out_g),
      provisional: f.provisional,
      derivation_window: f.provisional
        ? 'provisional: no derivation window'
        : `${dateOnly(f.derived_from)} to ${dateOnly(f.derived_to)}`,
    })),
    carry_over_limit_bp: p.carry_over_limit_bp,
    override_count: overrides.length,
    open_restatement_count: restatements.length,
    open_finding_count: findings.length,
    non_claimable_input_g: nonClaimableG,
    non_claimable_derivation: nonClaimableDetail,
    inbound_credits: inbound,
    lots: lots.map((l) => ({ reference: l.reference, disposition: l.disposition, mass_g: Number(l.mass_g) })),
    closed_on: dateOnly(p.closed_on),
    cut_off: dateOnly(p.cut_off),
    carried_forward: p.carried_forward,
    expired: p.expired,
    read_at: new Date().toISOString(),
  };
}

export default function register(api) {
  api.get('/balance-periods', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM balance_period ORDER BY id');
    return c.json(await Promise.all(rows.map(periodPayload)));
  });

  api.get('/balance-periods/:id', async (c) => {
    requireSession(c);
    const p = await one('SELECT * FROM balance_period WHERE id = $1', [c.req.param('id')]);
    if (!p) throw refuse(404, 'no_such_period', 'No such balance period.');
    return c.json(await periodPayload(p));
  });

  // Credits attached never exceed credits available.
  api.post('/balance-periods/:id/allocations', async (c) => {
    const s = requireRole(c, 'claims_manager');
    refuseAuditorWrite(s);
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /balance-periods/${id}/allocations`, body, async () => {
      const { lot, category, mass_g } = body;
      requireInteger(mass_g, 'mass_g');
      if (body.content_bp !== undefined || body.percentage !== undefined) {
        throw refuse(400, 'computed_figure_refused', 'No claim percentage is ever accepted from a person, on any route, in any form.');
      }
      if (!CATEGORIES.includes(category)) throw refuse(400, 'category_invalid', 'category is one of post_consumer, pre_consumer.');
      if (Number(mass_g) <= 0) throw refuse(400, 'mass_positive', 'mass_g is a positive integer number of grams.');
      const period = await one('SELECT * FROM balance_period WHERE id = $1', [id]);
      if (!period) throw refuse(404, 'no_such_period', 'No such balance period.');
      if (period.state === 'closed') {
        throw refuse(409, 'period_closed', 'This period is closed. Corrections require a restatement.', { period: id });
      }
      const lotRow = await one('SELECT * FROM lot WHERE reference = $1', [lot]);
      if (!lotRow) throw refuse(404, 'no_such_lot', 'No such lot.');

      // Two allocations racing for the same remainder produce one success and one refusal.
      const outcome = await tx(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['ledger:' + id]);
        const { figures } = await engine.balanceFigures(id, client);
        const available = figures[category].credits_available_g;
        if (Number(mass_g) > available) {
          return { refused: true, available_g: available, requested_g: Number(mass_g) };
        }
        const reference = await nextCounter(client, 'credit_movement', 4, 'CRM-');
        const eventAt = body.event_at || new Date().toISOString();
        const effectiveOn = dateOnly(body.effective_on || eventAt);
        await client.query(
          `INSERT INTO credit_movement (reference,period,direction,movement,category,mass_g,lot,fresh_credit,derivation,event_at,effective_on,recorded_by)
           VALUES ($1,$2,'out','allocation',$3,$4,$5,true,$6,$7,$8,$9)`,
          [reference, id, category, mass_g, lot,
            JSON.stringify({ rule: 'claim attached to a lot', lot, category, mass_g: Number(mass_g), available_before_g: available }),
            eventAt, effectiveOn, s.email]
        );
        await appendEntry(client, {
          act: 'claim_allocated', person: s.email, site: period.site, object_kind: 'lot', object_ref: lot,
          event_at: eventAt,
          content: { period: id, category, mass_g: Number(mass_g), movement: reference, available_before_g: available },
        });
        return { refused: false, reference, available_g: available };
      });

      if (outcome.refused) {
        // A refused allocation is recorded with the margin at the instant.
        await recordRefusal({
          act: 'allocation_refused', person: s.email, site: period.site, object_kind: 'lot', object_ref: lot,
          content: {
            period: id, category, requested_g: outcome.requested_g, available_g: outcome.available_g,
            margin_at_instant_g: outcome.available_g,
          },
        });
        throw refuse(409, 'insufficient_credit',
          `This allocation is refused. Available: ${outcome.available_g} g. Requested: ${outcome.requested_g} g.`,
          { available_g: outcome.available_g, requested_g: outcome.requested_g, category, lot, period: id });
      }
      const content = await engine.lotContent(lot);
      return {
        status: 201,
        body: {
          reference: outcome.reference,
          period: id, lot, category, mass_g: Number(mass_g),
          lot_content_bp: content.content_bp,
          lot_claim_type: content.claim_type,
          lot_category_split: content.category_split,
          content_derivation: content.derivation,
        },
      };
    });
  });

  api.post('/balance-periods/:id/transfers', async (c) => {
    const s = requireRole(c, 'claims_manager');
    refuseAuditorWrite(s);
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /balance-periods/${id}/transfers`, body, async () => {
      const { to_period, category, mass_g, moved_on } = body;
      requireInteger(mass_g, 'mass_g');
      if (!CATEGORIES.includes(category)) throw refuse(400, 'category_invalid', 'category is one of post_consumer, pre_consumer.');
      const from = await one('SELECT * FROM balance_period WHERE id = $1', [id]);
      const to = await one('SELECT * FROM balance_period WHERE id = $1', [to_period]);
      if (!from || !to) throw refuse(404, 'no_such_period', 'No such balance period.');
      if (from.state === 'closed' || to.state === 'closed') throw refuse(409, 'period_closed', 'This period is closed. Corrections require a restatement.');

      const reference = await tx(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['ledger:' + id]);
        const { figures } = await engine.balanceFigures(id, client);
        if (Number(mass_g) > figures[category].credits_available_g) {
          throw refuse(409, 'insufficient_credit',
            `This transfer is refused. Available: ${figures[category].credits_available_g} g. Requested: ${mass_g} g.`,
            { available_g: figures[category].credits_available_g, requested_g: Number(mass_g) });
        }
        const r = await nextCounter(client, 'transfer', 4, 'TRF-');
        const on = moved_on || todayISO();
        await client.query(
          `INSERT INTO transfer (reference,from_period,to_period,category,mass_g,moved_on,recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [r, id, to_period, category, mass_g, on, s.email]
        );
        const outRef = await nextCounter(client, 'credit_movement', 4, 'CRM-');
        const inRef = await nextCounter(client, 'credit_movement', 4, 'CRM-');
        await client.query(
          `INSERT INTO credit_movement (reference,period,direction,movement,category,mass_g,origin_site,fresh_credit,derivation,event_at,effective_on,recorded_by)
           VALUES ($1,$2,'out','transfer_out',$3,$4,$5,false,$6,$7,$8,$9)`,
          [outRef, id, category, mass_g, from.site,
            JSON.stringify({ transfer: r, to: to_period, rule: 'the total credit across the two periods is unchanged by the journey' }),
            on + 'T00:00:00Z', on, s.email]
        );
        await client.query(
          `INSERT INTO credit_movement (reference,period,direction,movement,category,mass_g,origin_site,fresh_credit,derivation,event_at,effective_on,recorded_by)
           VALUES ($1,$2,'in','transfer_in',$3,$4,$5,false,$6,$7,$8,$9)`,
          [inRef, to_period, category, mass_g, from.site,
            JSON.stringify({ transfer: r, from: id, rule: 'inbound credit, never a fresh credit' }),
            on + 'T00:00:00Z', on, s.email]
        );
        await appendEntry(client, {
          act: 'transfer_recorded', person: s.email, site: from.site, object_kind: 'transfer', object_ref: r,
          content: { from: id, to: to_period, category, mass_g: Number(mass_g), fresh_credit: false },
        });
        return r;
      });
      const receiving = await one('SELECT * FROM balance_period WHERE id = $1', [to_period]);
      const payload = await periodPayload(receiving);
      return {
        status: 201,
        body: {
          reference, from_period: id, to_period, category, mass_g: Number(mass_g),
          inbound_credits: payload.inbound_credits,
          note: 'It is never a fresh credit, and the total credit across the two periods is unchanged by the journey.',
        },
      };
    });
  });

  api.post('/balance-periods/:id/close', async (c) => {
    const s = requireSession(c);
    refuseAuditorWrite(s);
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    if (!(s.roles || []).includes('claims_manager')) {
      await recordRefusal({
        act: 'period_close_refused', person: s.email, object_kind: 'balance_period', object_ref: id,
        content: { reason: 'a quality manager may not close a balance period', roles: s.roles },
      });
      throw refuse(403, 'role_not_held', 'Only a claims manager closes a balance period.');
    }
    return withIdempotency(c, `POST /balance-periods/${id}/close`, body, async () => {
      const p = await one('SELECT * FROM balance_period WHERE id = $1', [id]);
      if (!p) throw refuse(404, 'no_such_period', 'No such balance period.');
      if (p.state === 'closed') {
        throw refuse(409, 'period_closed', 'A closed period refuses every further write and refuses to reopen.',
          { closed_on: dateOnly(p.closed_on), cut_off: dateOnly(p.cut_off) });
      }
      // Closing a period is refused for the person who published the version it applies.
      const methodVersions = await query(
        'SELECT id, version, published_by FROM carbon_method WHERE superseded = false'
      );
      const published = methodVersions.find((m) => m.published_by === s.email);
      if (published) {
        await recordRefusal({
          act: 'period_close_refused', person: s.email, object_kind: 'balance_period', object_ref: id,
          content: { separation: 'method_publisher_not_period_closer', method: `${published.id} v${published.version}` },
        });
        throw refuse(403, 'separation_method_publisher_not_period_closer',
          'Whoever published a carbon method version does not close the period applying it.',
          { separation: 'method_publisher_not_period_closer', blocking_reference: `${published.id} v${published.version}` });
      }

      const blockers = [];
      const lots = await query('SELECT reference, disposition FROM lot WHERE period = $1', [id]);
      for (const l of lots) {
        if (l.disposition === 'pending') blockers.push({ reason: 'lot_lacks_disposition', reference: l.reference });
      }
      const openDevs = await query("SELECT reference, lots FROM deviation WHERE state = 'open'");
      const lotRefs = lots.map((l) => l.reference);
      for (const d of openDevs) {
        if ((d.lots || []).some((x) => lotRefs.includes(x))) {
          blockers.push({ reason: 'deviation_open', reference: d.reference });
        }
      }
      const { figures } = await engine.balanceFigures(id);
      for (const cat of CATEGORIES) {
        if (figures[cat].credits_available_g < 0) {
          blockers.push({ reason: 'balance_does_not_reconcile', reference: `${id}:${cat}` });
        }
      }
      if (blockers.length) {
        await recordRefusal({
          act: 'period_close_refused', person: s.email, object_kind: 'balance_period', object_ref: id,
          content: { blockers },
        });
        throw refuse(409, 'close_refused', 'This period cannot be closed yet.', { blockers });
      }

      // Closing settles the carry-over.
      const carried = {};
      const expired = {};
      for (const cat of CATEGORIES) {
        const inG = figures[cat].credits_in_g;
        const availableG = figures[cat].credits_available_g;
        const limitG = floorDiv(inG * p.carry_over_limit_bp, 10000);
        const carriedG = Math.min(availableG, limitG);
        carried[cat + '_g'] = carriedG;
        expired[cat + '_g'] = availableG - carriedG;
      }
      const closedOn = body.closed_on || todayISO();
      const cutOff = body.cut_off || closedOn;
      await tx(async (client) => {
        await client.query(
          `UPDATE balance_period SET state = 'closed', closed_on = $2, closed_by = $3, cut_off = $4,
             carried_forward = $5, expired = $6 WHERE id = $1`,
          [id, closedOn, s.email, cutOff, JSON.stringify(carried), JSON.stringify(expired)]
        );
        for (const cat of CATEGORIES) {
          if (carried[cat + '_g'] > 0) {
            const r = await nextCounter(client, 'credit_movement', 4, 'CRM-');
            await client.query(
              `INSERT INTO credit_movement (reference,period,direction,movement,category,mass_g,fresh_credit,derivation,event_at,effective_on,recorded_by)
               VALUES ($1,$2,'out','carry_forward',$3,$4,false,$5,now(),$6,$7)`,
              [r, id, cat, carried[cat + '_g'],
                JSON.stringify({ rule: 'credit still available carries forward only up to carry_over_limit_bp of the credit that entered', carry_over_limit_bp: p.carry_over_limit_bp }),
                closedOn, s.email]
            );
          }
          if (expired[cat + '_g'] > 0) {
            const r = await nextCounter(client, 'credit_movement', 4, 'CRM-');
            await client.query(
              `INSERT INTO credit_movement (reference,period,direction,movement,category,mass_g,fresh_credit,derivation,event_at,effective_on,recorded_by)
               VALUES ($1,$2,'out','expiry',$3,$4,false,$5,now(),$6,$7)`,
              [r, id, cat, expired[cat + '_g'],
                JSON.stringify({ rule: 'the remainder expires and is never absorbed silently' }), closedOn, s.email]
            );
          }
        }
        await appendEntry(client, {
          act: 'balance_period_closed', person: s.email, site: p.site,
          object_kind: 'balance_period', object_ref: id,
          content: { closed_on: closedOn, cut_off: cutOff, carried_forward: carried, expired },
        });
      });
      return {
        status: 200,
        body: {
          id, state: 'closed', closed_on: closedOn, cut_off: cutOff,
          carried_forward_g: carried, expired_g: expired,
          carry_over_limit_bp: p.carry_over_limit_bp,
          derivation: {
            rule: 'carried forward is the lesser of the credit still available and carry_over_limit_bp of the credit that entered, floored',
          },
          note: 'A closed period refuses every further write and refuses to reopen.',
        },
      };
    });
  });

  api.post('/balance-periods/:id/restatements', async (c) => {
    const s = requireRole(c, 'claims_manager');
    refuseAuditorWrite(s);
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /balance-periods/${id}/restatements`, body, async () => {
      const { reason, revised_factor_bp } = body;
      if (!reason) throw refuse(400, 'reason_required', 'A restatement states its reason.');
      const p = await one('SELECT * FROM balance_period WHERE id = $1', [id]);
      if (!p) throw refuse(404, 'no_such_period', 'No such balance period.');
      const certs = await query('SELECT * FROM certificate WHERE period = $1 ORDER BY number, version', [id]);
      const enumerated = certs.map((x) => ({
        certificate: x.number, version: x.version, state: x.state,
        recipient: x.recipient, recipient_name: x.recipient_name, resolution: null,
      }));
      let contentMovements = [];
      if (revised_factor_bp !== undefined) {
        requireInteger(revised_factor_bp, 'revised_factor_bp');
        const current = await engine.factorInForce(p.site, dateOnly(p.period_to));
        for (const x of certs) {
          const ratio = current && current.factor_bp
            ? floorDiv(Number(x.content_bp) * Number(revised_factor_bp), Number(current.factor_bp))
            : Number(x.content_bp);
          contentMovements.push({
            certificate: x.number,
            content_bp: Number(x.content_bp),
            corrected_content_bp: ratio,
            derivation: { rule: 'content_bp * revised_factor_bp / current_factor_bp, floored', current_factor_bp: current ? current.factor_bp : null, revised_factor_bp: Number(revised_factor_bp) },
          });
        }
      }
      const reference = await tx(async (client) => {
        const r = await nextCounter(client, 'restatement', 4, 'RST-');
        await client.query(
          `INSERT INTO restatement (reference,period,reason,state,certificates,content_movements,opened_by)
           VALUES ($1,$2,$3,'open',$4,$5,$6)`,
          [r, id, reason, JSON.stringify(enumerated), JSON.stringify(contentMovements), s.email]
        );
        await appendEntry(client, {
          act: 'restatement_opened', person: s.email, site: p.site, object_kind: 'restatement', object_ref: r,
          content: { period: id, reason, certificates: enumerated.map((x) => x.certificate) },
        });
        return r;
      });
      return {
        status: 201,
        body: {
          reference, period: id, reason, state: 'open',
          certificates: enumerated,
          content_movements: contentMovements,
          complete: true,
        },
      };
    });
  });

  api.get('/restatements', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM restatement ORDER BY reference');
    const out = [];
    for (const r of rows) {
      const res = await query('SELECT * FROM resolution WHERE restatement = $1 ORDER BY reference', [r.reference]);
      out.push({
        reference: r.reference, period: r.period, reason: r.reason, state: r.state,
        certificates: r.certificates, content_movements: r.content_movements,
        resolutions: res.map((x) => ({ reference: x.reference, certificate: x.certificate, outcome: x.outcome, reason: x.reason })),
        opened_by: r.opened_by, opened_at: momentISO(r.opened_at),
      });
    }
    return c.json(out);
  });

  // Each affected certificate takes exactly one resolution.
  api.post('/restatements/:reference/resolutions', async (c) => {
    const s = requireRole(c, 'claims_manager', 'quality_manager');
    refuseAuditorWrite(s);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /restatements/${ref}/resolutions`, body, async () => {
      const { certificate, outcome, reason } = body;
      if (Array.isArray(certificate)) {
        throw refuse(400, 'one_certificate_at_a_time', 'No route resolves more than one certificate at a time.');
      }
      if (!['reissued', 'withdrawn', 'unaffected'].includes(outcome)) {
        throw refuse(400, 'outcome_invalid', 'outcome is one of reissued, withdrawn, unaffected.');
      }
      if (!reason) throw refuse(400, 'reason_required', 'Each resolution carries its own stated reason.');
      const r = await one('SELECT * FROM restatement WHERE reference = $1', [ref]);
      if (!r) throw refuse(404, 'no_such_restatement', 'No such restatement.');
      const existing = await one(
        'SELECT * FROM resolution WHERE restatement = $1 AND certificate = $2', [ref, certificate]
      );
      if (existing) {
        throw refuse(409, 'certificate_already_resolved',
          'A restatement holds exactly one resolution per affected certificate.',
          { certificate, existing_resolution: existing.reference, existing_outcome: existing.outcome });
      }
      const reference = await tx(async (client) => {
        const res = await nextCounter(client, 'resolution', 4, 'RES-');
        await client.query(
          `INSERT INTO resolution (reference,restatement,certificate,outcome,reason,recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [res, ref, certificate, outcome, reason, s.email]
        );
        const all = await client.query('SELECT certificate FROM resolution WHERE restatement = $1', [ref]);
        const enumerated = (r.certificates || []).map((x) => x.certificate);
        if (enumerated.length && enumerated.every((x) => all.rows.some((y) => y.certificate === x))) {
          await client.query("UPDATE restatement SET state = 'resolved' WHERE reference = $1", [ref]);
        }
        await appendEntry(client, {
          act: 'restatement_resolved', person: s.email, object_kind: 'restatement', object_ref: ref,
          content: { certificate, outcome, reason, resolution: res },
        });
        return res;
      });
      const after = await one('SELECT * FROM restatement WHERE reference = $1', [ref]);
      return { status: 201, body: { reference, restatement: ref, certificate, outcome, reason, restatement_state: after.state } };
    });
  });

  // ---- Conversion factors -------------------------------------------------

  api.get('/conversion-factors', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM conversion_factor ORDER BY site, version');
    return c.json(rows.map((f) => ({
      reference: f.reference, site: f.site, version: f.version, factor_bp: f.factor_bp,
      derived_from: dateOnly(f.derived_from), derived_to: dateOnly(f.derived_to),
      derived_in_g: Number(f.derived_in_g), derived_out_g: Number(f.derived_out_g),
      provisional: f.provisional, published_by: f.published_by, published_on: dateOnly(f.published_on),
      superseded_by: f.superseded_by,
    })));
  });

  api.post('/conversion-factors', async (c) => {
    const s = requireRole(c, 'claims_manager');
    refuseAuditorWrite(s);
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, 'POST /conversion-factors', body, async () => {
      const { site, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g } = body;
      for (const [k, v] of Object.entries({ factor_bp, derived_in_g, derived_out_g })) requireInteger(v, k);
      const siteRow = await one('SELECT * FROM site WHERE reference = $1', [site]);
      if (!siteRow) throw refuse(404, 'no_such_site', 'No such site.');
      const provisional = Number(derived_in_g) === 0;
      if (!provisional) {
        const derived = floorDiv(Number(derived_out_g) * 10000, Number(derived_in_g));
        if (derived !== Number(factor_bp)) {
          throw refuse(409, 'factor_does_not_reconcile',
            'A factor is always the arithmetic of a stated window rather than a number somebody chose.',
            { factor_bp: Number(factor_bp), derived_factor_bp: derived,
              rule: 'derived_out_g * 10000 / derived_in_g, floored' });
        }
        if (!derived_from || !derived_to) throw refuse(400, 'window_required', 'A derived factor states its window.');
      }
      const result = await tx(async (client) => {
        const prev = await client.query(
          'SELECT * FROM conversion_factor WHERE site = $1 ORDER BY version DESC LIMIT 1', [site]
        );
        const version = prev.rows[0] ? prev.rows[0].version + 1 : 1;
        const reference = `CF-${site.replace('SITE-', '')}-${version}`;
        await client.query(
          `INSERT INTO conversion_factor (reference,site,version,factor_bp,derived_from,derived_to,derived_in_g,derived_out_g,provisional,published_by,published_on)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [reference, site, version, factor_bp, derived_from || null, derived_to || null,
            derived_in_g, derived_out_g, provisional, s.email, body.published_on || todayISO()]
        );
        if (prev.rows[0]) {
          await client.query('UPDATE conversion_factor SET superseded_by = $2 WHERE reference = $1',
            [prev.rows[0].reference, reference]);
        }
        await appendEntry(client, {
          act: 'conversion_factor_published', person: s.email, site,
          object_kind: 'conversion_factor', object_ref: reference,
          content: { factor_bp: Number(factor_bp), derived_in_g: Number(derived_in_g), derived_out_g: Number(derived_out_g), provisional },
        });
        return { reference, version };
      });
      return {
        status: 201,
        body: {
          reference: result.reference, site, version: result.version, factor_bp: Number(factor_bp),
          derived_from: derived_from || null, derived_to: derived_to || null,
          derived_in_g: Number(derived_in_g), derived_out_g: Number(derived_out_g),
          provisional,
          note: provisional ? 'A provisional factor: every certificate resting on it says so.' : null,
          derivation: { rule: 'factor_bp equals derived_out_g * 10000 / derived_in_g, floored' },
        },
      };
    });
  });
}
