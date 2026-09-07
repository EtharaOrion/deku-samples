import { Hono } from 'hono';
import { all, one, query, tx } from '../db.js';
import {
  asDate, idempotent, recordAct, refuse, refusePagination, refuseAuditorWrites,
  requireFields, requireIntegerFields, requireRole, requireSession, refuseComputedInput,
} from '../http.js';
import { balancePeriodView, summariseMovements, lotClaim } from '../engine.js';
import { carryForward, factorFromWindow, contentBp } from '../units.js';

const app = new Hono();

app.get('/balance-periods', async (c) => {
  refusePagination(c);
  const session = requireSession(c);
  if (session.roles.includes('collector') || session.roles.includes('converter')) {
    refuse(403, 'not_permitted', { message: 'A collector never sees the ledger.' });
  }
  const rows = await all('select * from balance_period order by id asc');
  return c.json(await Promise.all(rows.map(balancePeriodView)));
});

app.get('/balance-periods/:id', async (c) => {
  requireSession(c);
  const p = await one('select * from balance_period where id = $1', [c.req.param('id')]);
  if (!p) refuse(404, 'not_found', { message: 'No such balance period.' });
  return c.json(await balancePeriodView(p));
});

// An allocation that would breach the available credit is refused rather than
// warned about, and two racing for the same remainder produce one success and
// one refusal.
app.post('/balance-periods/:id/allocations', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['lot', 'category']);
  requireIntegerFields(body, ['mass_g']);
  if (!['post_consumer', 'pre_consumer'].includes(body.category)) {
    refuse(400, 'unknown_category', { message: 'category is post_consumer or pre_consumer. The two are never netted.' });
  }
  if (body.mass_g <= 0) refuse(400, 'mass_must_be_positive', { message: 'mass_g is a positive integer number of grams.' });

  const period = await one('select * from balance_period where id = $1', [id]);
  if (!period) refuse(404, 'not_found', { message: 'No such balance period.' });
  if (period.state === 'closed') {
    refuse(409, 'period_closed', { message: 'This period is closed. Corrections require a restatement.', period: id });
  }
  const lot = await one('select * from lot where reference = $1', [body.lot]);
  if (!lot) refuse(404, 'not_found', { message: 'No such lot.', field: 'lot' });

  const result = await idempotent(c, `POST /api/balance-periods/${id}/allocations`, body, async () => {
    const outcome = await tx(async (client) => {
      // One lock per period and category: the margin is read and the movement
      // written inside it, so two allocations racing take turns.
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`${id}:${body.category}`]);
      const { rows } = await client.query(
        'select * from credit_movement where period = $1 and category = $2',
        [id, body.category],
      );
      const summary = summariseMovements(rows)[body.category];
      const available = summary.credits_available_g;
      if (body.mass_g > available) {
        return { refused: true, available_g: available, requested_g: body.mass_g };
      }
      await client.query(
        `insert into credit_movement (period,category,direction,mass_g,source_kind,source_reference,lot,derivation,effective_on)
         values ($1,$2,'out',$3,'allocation',$4,$5,$6,$7)`,
        [id, body.category, body.mass_g, 'allocation', body.lot,
          JSON.stringify({ decided_by: session.email, available_before_g: available, formula: 'credit attached to a lot leaves the ledger as a movement' }),
          asDate(body.effective_on || new Date())],
      );
      return { refused: false, available_before_g: available };
    });

    if (outcome.refused) {
      // A refused allocation is an entry, with the margin at the instant.
      await recordAct({
        act: 'allocation_refused', actor: session.email, site: period.site,
        object_kind: 'balance_period', object_reference: id, refused: true,
        content: { lot: body.lot, category: body.category, available_g: outcome.available_g, requested_g: outcome.requested_g },
      });
      return {
        status: 409,
        body: {
          error: 'insufficient_credit',
          message: `This allocation is refused. Available: ${outcome.available_g} g. Requested: ${outcome.requested_g} g.`,
          period: id,
          lot: body.lot,
          category: body.category,
          available_g: outcome.available_g,
          requested_g: outcome.requested_g,
        },
      };
    }
    const claim = await lotClaim(body.lot);
    await recordAct({
      act: 'claim_allocated', actor: session.email, site: period.site,
      object_kind: 'lot', object_reference: body.lot,
      content: { period: id, category: body.category, mass_g: body.mass_g, content_bp: claim.content_bp },
    });
    const view = await balancePeriodView(await one('select * from balance_period where id = $1', [id]));
    return {
      status: 201,
      body: {
        reference: `ALO-${id}-${body.lot}-${body.category}-${body.mass_g}`,
        period: id,
        lot: body.lot,
        category: body.category,
        mass_g: body.mass_g,
        content_bp: claim.content_bp,
        claim_type: claim.claim_type,
        credits_available_g: view[body.category].credits_available_g,
        derivation: { content_bp: 'credit_attached_g * 10000 / lot_mass_g, floored' },
      },
    };
  });
  return c.json(result.body, result.status);
});

app.post('/balance-periods/:id/transfers', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['to_period', 'category']);
  requireIntegerFields(body, ['mass_g']);
  const from = await one('select * from balance_period where id = $1', [id]);
  const to = await one('select * from balance_period where id = $1', [body.to_period]);
  if (!from || !to) refuse(404, 'not_found', { message: 'No such balance period.' });
  if (from.state === 'closed' || to.state === 'closed') {
    refuse(409, 'period_closed', { message: 'This period is closed. Corrections require a restatement.' });
  }
  const result = await idempotent(c, `POST /api/balance-periods/${id}/transfers`, body, async () => {
    const reference = await tx(async (client) => {
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`${id}:${body.category}`]);
      const { rows } = await client.query('select * from credit_movement where period = $1 and category = $2', [id, body.category]);
      const available = summariseMovements(rows)[body.category].credits_available_g;
      if (body.mass_g > available) {
        const e = new Error('insufficient_credit');
        e.status = 409;
        e.body = { error: 'insufficient_credit', message: `This transfer is refused. Available: ${available} g. Requested: ${body.mass_g} g.`, available_g: available, requested_g: body.mass_g };
        throw e;
      }
      const r = await client.query("select reference from transfer order by reference desc limit 1");
      const n = r.rows[0] ? Number(r.rows[0].reference.split('-')[1]) + 1 : 1;
      const ref = `TRF-${String(n).padStart(4, '0')}`;
      const movedOn = asDate(body.moved_on || new Date());
      await client.query(
        'insert into transfer (reference,from_period,to_period,category,mass_g,moved_on,created_by) values ($1,$2,$3,$4,$5,$6,$7)',
        [ref, id, body.to_period, body.category, body.mass_g, movedOn, session.email],
      );
      await client.query(
        `insert into credit_movement (period,category,direction,mass_g,source_kind,source_reference,derivation,effective_on)
         values ($1,$2,'out',$3,'transfer_out',$4,$5,$6)`,
        [id, body.category, body.mass_g, ref, JSON.stringify({ transfer: ref, to: body.to_period }), movedOn],
      );
      // It is never a fresh credit: the total across the two periods is
      // unchanged by the journey.
      await client.query(
        `insert into credit_movement (period,category,direction,mass_g,source_kind,source_reference,origin_site,movement_reference,fresh_credit,derivation,effective_on)
         values ($1,$2,'inbound',$3,'transfer_in',$4,$5,$4,false,$6,$7)`,
        [body.to_period, body.category, body.mass_g, ref, from.site, JSON.stringify({ transfer: ref, from: id }), movedOn],
      );
      return ref;
    });
    await recordAct({
      act: 'transfer_recorded', actor: session.email, site: from.site,
      object_kind: 'transfer', object_reference: reference,
      content: { from: id, to: body.to_period, category: body.category, mass_g: body.mass_g, fresh_credit: false },
    });
    const receiving = await balancePeriodView(await one('select * from balance_period where id = $1', [body.to_period]));
    return {
      status: 201,
      body: {
        reference,
        from_period: id,
        to_period: body.to_period,
        category: body.category,
        mass_g: body.mass_g,
        fresh_credit: false,
        inbound_credits: receiving.inbound_credits,
      },
    };
  });
  return c.json(result.body, result.status);
});

app.post('/balance-periods/:id/close', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  const period = await one('select * from balance_period where id = $1', [id]);
  if (!period) refuse(404, 'not_found', { message: 'No such balance period.' });
  if (period.state === 'closed') {
    refuse(409, 'period_closed', {
      message: 'A closed period refuses every further write and refuses to reopen.',
      period: id, closed_on: asDate(period.closed_on), cut_off: asDate(period.cut_off),
    });
  }
  // The person who published the carbon method version applying to this period
  // does not close it.
  const methodVersions = await all('select * from carbon_method_version where superseded = false');
  if (methodVersions.some((m) => m.published_by === session.email)) {
    await recordAct({
      act: 'period_close_refused', actor: session.email, site: period.site,
      object_kind: 'balance_period', object_reference: id, refused: true,
      content: { reason: 'separation_publisher_not_closer' },
    });
    refuse(403, 'separation_publisher_not_closer', {
      message: 'Whoever published the carbon method version does not close the period applying it.',
      separation: 'publisher_not_closer',
      method_versions: methodVersions.map((m) => `${m.method} v${m.version}`),
    });
  }

  const lots = await all('select * from lot where site = $1 and grade = $2', [period.site, period.grade]);
  const pending = lots.filter((l) => l.disposition === 'pending');
  const openDeviations = await all(
    "select * from deviation where state = 'open' and (lots && $1 or cardinality(lots) = 0 and cardinality(runs) > 0)",
    [lots.map((l) => l.reference)],
  );
  const touching = openDeviations.filter((d) => d.lots.some((x) => lots.some((l) => l.reference === x)));
  const movements = await all('select * from credit_movement where period = $1', [id]);
  const summary = summariseMovements(movements);
  const reconciles = summary.post_consumer.credits_available_g >= 0 && summary.pre_consumer.credits_available_g >= 0;

  const blocking = [];
  if (pending.length) blocking.push({ condition: 'every_lot_dispositioned', lots: pending.map((l) => l.reference) });
  if (touching.length) blocking.push({ condition: 'no_open_deviation', deviations: touching.map((d) => d.reference) });
  if (!reconciles) blocking.push({ condition: 'balance_reconciles', detail: 'credits out exceed credits in for a category' });
  if (blocking.length) {
    await recordAct({
      act: 'period_close_refused', actor: session.email, site: period.site,
      object_kind: 'balance_period', object_reference: id, refused: true, content: { blocking },
    });
    return c.json({
      error: 'close_refused',
      message: 'This period cannot close while the conditions below stand.',
      period: id,
      blocking,
    }, 409);
  }

  const result = await idempotent(c, `POST /api/balance-periods/${id}/close`, body, async () => {
    const closedOn = asDate(body.closed_on || new Date());
    const cutOff = asDate(body.cut_off || closedOn);
    // Closing settles the carry-over: credit above the limit expires and is
    // never absorbed silently.
    const carried = {};
    const expired = {};
    for (const cat of ['post_consumer', 'pre_consumer']) {
      const s = summary[cat];
      const out = carryForward(s.credits_available_g, s.credits_in_g, period.carry_over_limit_bp);
      carried[cat] = out.carried_forward_g;
      expired[cat] = out.expired_g;
    }
    await query(
      "update balance_period set state = 'closed', closed_on = $1, cut_off = $2, closed_by = $3, carried_forward = $4, expired = $5 where id = $6",
      [closedOn, cutOff, session.email, JSON.stringify(carried), JSON.stringify(expired), id],
    );
    await recordAct({
      act: 'period_closed', actor: session.email, site: period.site,
      object_kind: 'balance_period', object_reference: id,
      content: { closed_on: closedOn, cut_off: cutOff, carried_forward_g: carried, expired_g: expired },
    });
    return {
      status: 200,
      body: {
        reference: id, period: id, state: 'closed', closed_on: closedOn, cut_off: cutOff,
        carried_forward_g: carried, expired_g: expired,
        derivation: { carry_over: 'credit still available at the close, capped at carry_over_limit_bp of the credit that entered the period, floored' },
      },
    };
  });
  return c.json(result.body, result.status);
});

app.post('/balance-periods/:id/restatements', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['reason']);
  const period = await one('select * from balance_period where id = $1', [id]);
  if (!period) refuse(404, 'not_found', { message: 'No such balance period.' });

  const result = await idempotent(c, `POST /api/balance-periods/${id}/restatements`, body, async () => {
    const { rows } = await query("select reference from restatement order by reference desc limit 1");
    const n = rows[0] ? Number(rows[0].reference.split('-')[1]) + 1 : 1;
    const reference = `RST-${String(n).padStart(4, '0')}`;
    const certs = await all('select * from certificate where period = $1 order by number asc', [id]);
    const certificates = certs.map((x) => ({
      certificate: x.number, version: x.version, state: x.state,
      recipient: x.recipient, recipient_name: x.recipient_name, content_bp: x.content_bp,
    }));
    // Where the restatement revises a conversion factor it answers the figure
    // that moved, per certificate.
    let movements = [];
    if (body.revised_factor_bp !== undefined && body.revised_factor_bp !== null) {
      if (!Number.isInteger(body.revised_factor_bp)) {
        const e = new Error('integer_required');
        e.status = 400;
        e.body = { error: 'integer_required', message: 'revised_factor_bp is an integer number of basis points.', field: 'revised_factor_bp' };
        throw e;
      }
      const current = await one(
        'select * from conversion_factor where site = $1 and superseded_by is null order by published_at desc limit 1',
        [period.site],
      );
      movements = certs.map((x) => {
        const lotMass = (x.lots || []).reduce((s, l) => s + l.mass_g, 0);
        const credit = Math.floor((x.content_bp * lotMass) / 10000);
        const corrected = contentBp(
          Math.floor((credit * body.revised_factor_bp) / (current?.factor_bp || body.revised_factor_bp)),
          lotMass,
        );
        return {
          certificate: x.number,
          content_bp: x.content_bp,
          corrected_content_bp: corrected,
          recipient_name: x.recipient_name,
        };
      });
    }
    await query(
      'insert into restatement (reference,period,reason,opened_by,certificates,content_movements) values ($1,$2,$3,$4,$5,$6)',
      [reference, id, body.reason, session.email, JSON.stringify(certificates), JSON.stringify(movements)],
    );
    await recordAct({
      act: 'restatement_opened', actor: session.email, site: period.site,
      object_kind: 'restatement', object_reference: reference,
      content: { period: id, reason: body.reason, certificates: certificates.map((x) => x.certificate) },
    });
    return {
      status: 201,
      body: {
        reference, period: id, reason: body.reason, state: 'open',
        certificates, content_movements: movements, complete: true,
      },
    };
  });
  return c.json(result.body, result.status);
});

app.get('/restatements', async (c) => {
  refusePagination(c);
  requireSession(c);
  const rows = await all('select * from restatement order by reference asc');
  const out = [];
  for (const r of rows) {
    const resolutions = await all('select * from resolution where restatement = $1 order by id asc', [r.reference]);
    out.push({
      reference: r.reference, period: r.period, reason: r.reason, state: r.state,
      opened_by: r.opened_by, opened_at: r.opened_at,
      certificates: r.certificates, content_movements: r.content_movements,
      resolutions: resolutions.map((x) => ({ certificate: x.certificate, outcome: x.outcome, reason: x.reason, recorded_by: x.recorded_by })),
    });
  }
  return c.json(out);
});

// Each affected certificate takes exactly one resolution. No route resolves
// more than one certificate at a time.
app.post('/restatements/:reference/resolutions', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'claims_manager', 'quality_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['certificate', 'outcome', 'reason']);
  if (Array.isArray(body.certificate)) {
    refuse(400, 'one_certificate_at_a_time', { message: 'A resolution covering several certificates at once cannot be recorded.' });
  }
  if (!['reissued', 'withdrawn', 'unaffected'].includes(body.outcome)) {
    refuse(400, 'unknown_outcome', { message: 'outcome is one of reissued, withdrawn, unaffected.' });
  }
  const r = await one('select * from restatement where reference = $1', [ref]);
  if (!r) refuse(404, 'not_found', { message: 'No such restatement.' });
  const existing = await one('select * from resolution where restatement = $1 and certificate = $2', [ref, body.certificate]);
  if (existing) {
    refuse(409, 'already_resolved', {
      message: 'Each affected certificate takes exactly one resolution in a restatement.',
      certificate: body.certificate, outcome: existing.outcome,
    });
  }
  const result = await idempotent(c, `POST /api/restatements/${ref}/resolutions`, body, async () => {
    await query(
      'insert into resolution (restatement,certificate,outcome,reason,recorded_by) values ($1,$2,$3,$4,$5)',
      [ref, body.certificate, body.outcome, body.reason, session.email],
    );
    const resolutions = await all('select * from resolution where restatement = $1', [ref]);
    const affected = (r.certificates || []).length;
    if (affected && resolutions.length >= affected) {
      await query("update restatement set state = 'resolved' where reference = $1", [ref]);
    }
    await recordAct({
      act: 'restatement_resolved', actor: session.email, site: null,
      object_kind: 'restatement', object_reference: ref,
      content: { certificate: body.certificate, outcome: body.outcome, reason: body.reason },
    });
    return {
      status: 201,
      body: {
        reference: `RES-${ref}-${body.certificate}`,
        restatement: ref, certificate: body.certificate, outcome: body.outcome, reason: body.reason,
        resolved: resolutions.length, affected,
      },
    };
  });
  return c.json(result.body, result.status);
});

// A factor is the arithmetic of a stated window rather than a number somebody
// chose.
app.post('/conversion-factors', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'claims_manager');
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['site']);
  requireIntegerFields(body, ['factor_bp', 'derived_in_g', 'derived_out_g']);
  const site = await one('select * from site where reference = $1', [body.site]);
  if (!site) refuse(404, 'not_found', { message: 'No such site.', field: 'site' });
  const provisional = body.derived_in_g === 0;
  if (!provisional) {
    const expected = factorFromWindow(body.derived_in_g, body.derived_out_g);
    if (expected !== body.factor_bp) {
      refuse(409, 'factor_does_not_reconcile', {
        message: 'A factor is the arithmetic of its own window. Publishing one nobody can stand behind is refused.',
        factor_bp: body.factor_bp,
        expected_factor_bp: expected,
        derivation: 'derived_out_g * 10000 / derived_in_g, floored',
      });
    }
  }
  const result = await idempotent(c, 'POST /api/conversion-factors', body, async () => {
    const { rows } = await query("select * from conversion_factor where site = $1 order by version desc limit 1", [body.site]);
    const prior = rows[0];
    const version = prior ? prior.version + 1 : 1;
    const reference = `CF-${body.site.replace('SITE-', '')}-${version}`;
    await query(
      `insert into conversion_factor (reference,site,version,factor_bp,derived_from,derived_to,derived_in_g,derived_out_g,provisional,published_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [reference, body.site, version, body.factor_bp, body.derived_from || null, body.derived_to || null,
        body.derived_in_g, body.derived_out_g, provisional, session.email],
    );
    // A version supersedes rather than overwrites.
    if (prior) await query('update conversion_factor set superseded_by = $1 where reference = $2', [reference, prior.reference]);
    await recordAct({
      act: 'conversion_factor_published', actor: session.email, site: body.site,
      object_kind: 'conversion_factor', object_reference: reference,
      content: { factor_bp: body.factor_bp, provisional, supersedes: prior?.reference || null },
    });
    return {
      status: 201,
      body: {
        reference, site: body.site, version, factor_bp: body.factor_bp, provisional,
        derived_from: body.derived_from || null, derived_to: body.derived_to || null,
        derived_in_g: body.derived_in_g, derived_out_g: body.derived_out_g,
        supersedes: prior?.reference || null,
      },
    };
  });
  return c.json(result.body, result.status);
});

app.get('/conversion-factors', async (c) => {
  requireSession(c);
  const rows = await all('select * from conversion_factor order by site asc, version asc');
  return c.json(rows.map((f) => ({
    reference: f.reference, site: f.site, version: f.version, factor_bp: f.factor_bp,
    derived_from: asDate(f.derived_from), derived_to: asDate(f.derived_to),
    derived_in_g: f.derived_in_g, derived_out_g: f.derived_out_g,
    provisional: f.provisional, superseded_by: f.superseded_by, published_by: f.published_by,
  })));
});

export default app;
