import { Hono } from 'hono';
import { q, one, pool, tx, snapshot } from '../lib/db.js';
import { refuse, noPaging, withIdempotency, nextRef, recordRefusal } from '../lib/http.js';
import { requireSession, requireRole } from './middleware.js';
import { appendEntry } from '../lib/record.js';
import { requireInt, mulDiv, floorDiv, dayOf } from '../lib/num.js';
import { balancePeriodView, summariseMovements, lotClaim } from '../engine/ledger.js';

const r = new Hono();

// A scoped read runs inside one snapshot, so a period closing mid-read is
// either wholly before the moment named or wholly after it. It is never half of
// the period before the close and half after.
r.get('/balance-periods', async (c) => {
  noPaging(c);
  requireSession(c);
  const { out, at } = await snapshot(async (runner, seen) => {
    const rows = await runner.q('select id from balance_period order by id');
    const views = [];
    for (const x of rows) views.push(await balancePeriodView(x.id, runner));
    return { out: views, at: seen };
  });
  return c.json(out.map((v) => ({ ...v, read_at: at })));
});

r.get('/balance-periods/:id', async (c) => {
  noPaging(c);
  requireSession(c);
  const { v, at } = await snapshot(async (runner, seen) => ({ v: await balancePeriodView(c.req.param('id'), runner), at: seen }));
  if (!v) throw refuse(404, 'not_found', 'No such balance period.');
  return c.json({ ...v, read_at: at });
});

// No claim percentage is ever accepted from a person, on any route, in any form.
r.post('/balance-periods/:id/allocations', async (c) => {
  const s = await requireRole(c, 'allocation_made', 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /balance-periods/${id}/allocations`, body, async () => {
    for (const k of ['content_bp', 'percentage', 'recycled_content_bp']) {
      if (Object.prototype.hasOwnProperty.call(body, k)) throw refuse(400, 'computed_figure_not_accepted', `'${k}' is computed from the ledger and no route accepts one.`, { field: k });
    }
    const { lot, category, mass_g } = body;
    requireInt(mass_g, 'mass_g');
    if (!['post_consumer', 'pre_consumer'].includes(category)) throw refuse(400, 'invalid_category', "category is one of 'post_consumer', 'pre_consumer'. The two categories are never netted.");
    if (mass_g <= 0) throw refuse(400, 'mass_must_be_positive', 'An allocation attaches a positive mass of claim.');
    const period = await one('select * from balance_period where id = $1', [id]);
    if (!period) throw refuse(404, 'not_found', 'No such balance period.');
    if (period.state === 'closed') throw refuse(409, 'period_closed', 'This period is closed. Corrections require a restatement.', { period: id });
    const l = await one('select * from lot where reference = $1', [lot]);
    if (!l) throw refuse(404, 'lot_not_found', 'No such lot.');

    // Two allocations racing for the same remainder produce one success and one
    // refusal. The row lock serialises them against the period.
    return tx(async (client) => {
      await client.query('select id from balance_period where id = $1 for update', [id]);
      const { rows } = await client.query('select * from credit_movement where period = $1', [id]);
      const sums = summariseMovements(rows);
      const available = sums[category].credits_available_g;
      if (mass_g > available) {
        await recordRefusal(s, 'allocation_refused', 'balance_period', id, { lot, category, requested_g: mass_g, available_g: available, margin_at_instant_g: available });
        throw refuse(409, 'insufficient_credit', `This allocation is refused. Available: ${available} g. Requested: ${mass_g} g.`, { available_g: available, requested_g: mass_g, category, lot, period: id });
      }
      const reference = `CRM-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e4)}`;
      const on = body.effective_on || new Date().toISOString().slice(0, 10);
      await client.query(
        'insert into credit_movement (reference, period, category, direction, mass_g, source_kind, source_ref, lot, origin_site, fresh_credit, derivation, event_at, effective_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,$12,$13)',
        [reference, id, category, 'out', mass_g, 'allocation', reference, lot, period.site, JSON.stringify({ rule: 'credit attached to a lot leaves the ledger', available_before_g: available, requested_g: mass_g }), new Date().toISOString(), on, s.email],
      );
      await appendEntry(client, { act: 'allocation_made', person: s.email, person_id: s.person_id, site: period.site, object_kind: 'allocation', object_ref: reference, content: { lot, category, mass_g, period: id, available_before_g: available } });
      const after = available - mass_g;
      const claim = await lotClaim(lot);
      return {
        status: 201,
        body: {
          reference,
          lot,
          category,
          mass_g,
          period: id,
          credits_available_g: after,
          lot_content_bp: floorDiv(BigInt(claim.credit_attached_g + 0) * 10000n, l.mass_g),
          claim_type: l.claim_type,
          derivation: { content_bp: 'credit_attached_g * 10000 / lot_mass_g, floored', available_after_g: after },
        },
      };
    });
  });
  return c.json(out.body, out.status);
});

r.post('/balance-periods/:id/transfers', async (c) => {
  const s = await requireRole(c, 'transfer_recorded', 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /balance-periods/${id}/transfers`, body, async () => {
    const { from_period, category, mass_g, moved_on } = body;
    requireInt(mass_g, 'mass_g');
    const to = await one('select * from balance_period where id = $1', [id]);
    const from = await one('select * from balance_period where id = $1', [from_period]);
    if (!to || !from) throw refuse(404, 'not_found', 'Both periods must exist.');
    if (to.state === 'closed' || from.state === 'closed') throw refuse(409, 'period_closed', 'A closed period refuses every further write.');
    const rows = await q('select * from credit_movement where period = $1', [from_period]);
    const avail = summariseMovements(rows)[category].credits_available_g;
    if (mass_g > avail) throw refuse(409, 'insufficient_credit', `This transfer is refused. Available: ${avail} g. Requested: ${mass_g} g.`, { available_g: avail, requested_g: mass_g });
    const reference = await nextRef('TRF-', 'transfer');
    const on = moved_on || new Date().toISOString().slice(0, 10);
    await pool.query('insert into transfer (reference, from_period, to_period, category, mass_g, moved_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7)', [reference, from_period, id, category, mass_g, on, s.email]);
    await pool.query('insert into credit_movement (reference, period, category, direction, mass_g, source_kind, source_ref, origin_site, fresh_credit, movement, derivation, event_at, effective_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10,$11,$12,$13)', [`${reference}-OUT`, from_period, category, 'transfer_out', mass_g, 'transfer', reference, from.site, reference, JSON.stringify({ rule: 'a transfer moves credit between periods and creates none' }), new Date().toISOString(), on, s.email]);
    await pool.query('insert into credit_movement (reference, period, category, direction, mass_g, source_kind, source_ref, origin_site, fresh_credit, movement, derivation, event_at, effective_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10,$11,$12,$13)', [`${reference}-IN`, id, category, 'transfer_in', mass_g, 'transfer', reference, from.site, reference, JSON.stringify({ rule: 'inbound credit; it is never a fresh credit' }), new Date().toISOString(), on, s.email]);
    await appendEntry(null, { act: 'transfer_recorded', person: s.email, person_id: s.person_id, site: to.site, object_kind: 'transfer', object_ref: reference, content: { from_period, to_period: id, category, mass_g, moved_on: on } });
    const view = await balancePeriodView(id);
    return { status: 201, body: { reference, from_period, to_period: id, category, mass_g, moved_on: on, inbound_credits: view.inbound_credits, note: 'It is never a fresh credit, and the total credit across the two periods is unchanged by the journey.' } };
  });
  return c.json(out.body, out.status);
});

r.post('/balance-periods/:id/close', async (c) => {
  const s = requireSession(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /balance-periods/${id}/close`, body, async () => {
    if (!(s.roles || []).includes('claims_manager')) {
      await recordRefusal(s, 'period_close_refused', 'balance_period', id, { reason: 'not_a_claims_manager' });
      throw refuse(403, 'role_not_permitted', 'A balance period is closed by a claims manager. A quality manager may not close one.');
    }
    const period = await one('select * from balance_period where id = $1', [id]);
    if (!period) throw refuse(404, 'not_found', 'No such balance period.');
    if (period.state === 'closed') {
      await recordRefusal(s, 'period_reopen_refused', 'balance_period', id, { detail: 'A closed period refuses every further write and refuses to reopen.' });
      throw refuse(409, 'period_closed', 'A closed period refuses every further write and refuses to reopen. Corrections require a restatement.', { closed_on: dayOf(period.closed_on), cut_off: period.cut_off ? dayOf(period.cut_off) : null });
    }
    // Closing a balance period is refused for the person who published the
    // carbon method version it applies.
    const mvs = await q('select * from carbon_method_version where superseded = false');
    const publishedByCaller = mvs.find((m) => m.published_by === s.email);
    if (publishedByCaller) {
      await recordRefusal(s, 'period_close_refused', 'balance_period', id, { separation: 'publisher_not_closer', method_version: `${publishedByCaller.id} v${publishedByCaller.version}` });
      throw refuse(409, 'separation_publisher_not_closer', `${s.email} published carbon method version ${publishedByCaller.id} v${publishedByCaller.version} and therefore does not close the period applying it.`, { separation: 'publisher_not_closer', blocking_reference: `${publishedByCaller.id} v${publishedByCaller.version}` });
    }
    const blocking = [];
    const lots = await q('select * from lot where site = $1 and grade = $2 and produced_on between $3 and $4', [period.site, period.grade, period.period_from, period.period_to]);
    for (const l of lots) if (l.disposition === 'pending') blocking.push({ condition: 'lot_without_disposition', reference: l.reference });
    const devs = await q("select * from deviation where state = 'open'");
    const lotRefs = new Set(lots.map((l) => l.reference));
    for (const d of devs) if ((d.lots || []).some((x) => lotRefs.has(x))) blocking.push({ condition: 'open_deviation', reference: d.reference });
    const rows = await q('select * from credit_movement where period = $1', [id]);
    const sums = summariseMovements(rows);
    for (const cat of ['post_consumer', 'pre_consumer']) {
      if (sums[cat].credits_available_g < 0) blocking.push({ condition: 'balance_does_not_reconcile', reference: cat, available_g: sums[cat].credits_available_g });
    }
    if (blocking.length) {
      await recordRefusal(s, 'period_close_refused', 'balance_period', id, { blocking });
      throw refuse(409, 'close_refused', 'This period cannot be closed while these stand.', { blocking });
    }
    const carried_forward = {};
    const expired = {};
    const on = body.closed_on || new Date().toISOString().slice(0, 10);
    const cut_off = body.cut_off || on;
    const nextPeriod = await one('select * from balance_period where site = $1 and grade = $2 and period_from > $3 order by period_from asc limit 1', [period.site, period.grade, period.period_to]);
    for (const cat of ['post_consumer', 'pre_consumer']) {
      const avail = sums[cat].credits_available_g;
      const limit = mulDiv(sums[cat].credits_in_g, period.carry_over_limit_bp, 10000);
      const carry = Math.max(0, Math.min(avail, limit));
      const exp = Math.max(0, avail - carry);
      carried_forward[cat] = carry;
      expired[cat] = exp;
      if (carry > 0) {
        await pool.query('insert into credit_movement (reference, period, category, direction, mass_g, source_kind, source_ref, origin_site, fresh_credit, derivation, event_at, effective_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10,$11,$12)', [`CRM-CO-${id}-${cat}`, id, cat, 'carry_out', carry, 'carry_over', id, period.site, JSON.stringify({ rule: 'credit still available at the close carries forward only up to carry_over_limit_bp of the credit that entered the period', limit_g: limit, available_g: avail }), new Date().toISOString(), on, s.email]);
        if (nextPeriod) {
          await pool.query('insert into credit_movement (reference, period, category, direction, mass_g, source_kind, source_ref, origin_site, fresh_credit, derivation, event_at, effective_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10,$11,$12)', [`CRM-CI-${nextPeriod.id}-${cat}`, nextPeriod.id, cat, 'carry_in', carry, 'carry_over', id, period.site, JSON.stringify({ rule: 'carried forward from the period before', from_period: id }), new Date().toISOString(), dayOf(nextPeriod.period_from), s.email]);
        }
      }
      if (exp > 0) {
        await pool.query('insert into credit_movement (reference, period, category, direction, mass_g, source_kind, source_ref, origin_site, fresh_credit, derivation, event_at, effective_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10,$11,$12)', [`CRM-EX-${id}-${cat}`, id, cat, 'expiry', exp, 'carry_over', id, period.site, JSON.stringify({ rule: 'the remainder expires; neither is absorbed silently', limit_g: limit, available_g: avail }), new Date().toISOString(), on, s.email]);
      }
    }
    await pool.query("update balance_period set state = 'closed', closed_on = $1, closed_by = $2, cut_off = $3, carried_forward = $4, expired = $5 where id = $6", [on, s.email, cut_off, JSON.stringify(carried_forward), JSON.stringify(expired), id]);
    await appendEntry(null, { act: 'balance_period_closed', person: s.email, person_id: s.person_id, site: period.site, object_kind: 'balance_period', object_ref: id, content: { closed_on: on, cut_off, carried_forward, expired } });
    return {
      status: 200,
      body: {
        id,
        state: 'closed',
        closed_on: on,
        closed_by: s.email,
        cut_off,
        carried_forward_g: carried_forward,
        expired_g: expired,
        carry_over_limit_bp: period.carry_over_limit_bp,
        derivation: { carry_over: 'credit still available at the close carries forward only up to carry_over_limit_bp of the credit that entered the period; the remainder expires', note: `The cut_off is the date after which a late event-time record no longer enters this period.` },
      },
    };
  });
  return c.json(out.body, out.status);
});

/* ------------------------------------------------------------ restatements */

r.get('/restatements', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from restatement order by reference');
  const res = await q('select * from resolution');
  return c.json(rows.map((x) => ({ reference: x.reference, period: x.period, reason: x.reason, state: x.state, opened_by: x.opened_by, opened_at: x.opened_at, certificates: x.certificates, content_movements: x.content_movements, trigger_kind: x.trigger_kind, resolutions: res.filter((y) => y.restatement === x.reference).map((y) => ({ reference: y.reference, certificate: y.certificate, outcome: y.outcome, reason: y.reason, recorded_by: y.recorded_by })) })));
});

r.post('/balance-periods/:id/restatements', async (c) => {
  const s = await requireRole(c, 'restatement_opened', 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /balance-periods/${id}/restatements`, body, async () => {
    const { reason, revised_conversion_factor = null } = body;
    if (!reason) throw refuse(400, 'reason_required', 'A restatement carries a reason.');
    const period = await one('select * from balance_period where id = $1', [id]);
    if (!period) throw refuse(404, 'not_found', 'No such balance period.');
    const certs = await q('select * from certificate where period = $1 order by number, version', [id]);
    const reference = await nextRef('RST-', 'restatement');
    let content_movements = null;
    if (revised_conversion_factor) {
      const cf = await one('select * from conversion_factor where reference = $1', [revised_conversion_factor]);
      if (!cf) throw refuse(404, 'conversion_factor_not_found', 'No such conversion factor.');
      const oldCf = await one('select * from conversion_factor where site = $1 and reference <> $2 order by published_on desc limit 1', [period.site, revised_conversion_factor]);
      content_movements = certs.map((x) => {
        const oldBp = oldCf ? oldCf.factor_bp : 10000;
        const corrected = oldBp ? floorDiv(BigInt(x.content_bp) * BigInt(cf.factor_bp), oldBp) : x.content_bp;
        return { certificate: x.number, content_bp: x.content_bp, corrected_content_bp: corrected };
      });
    }
    await pool.query('insert into restatement (reference, period, reason, opened_by, certificates, content_movements, trigger_kind) values ($1,$2,$3,$4,$5,$6,$7)', [reference, id, reason, s.email, JSON.stringify(certs.map((x) => x.number)), content_movements ? JSON.stringify(content_movements) : null, revised_conversion_factor ? 'conversion_factor_revision' : 'manual']);
    await appendEntry(null, { act: 'restatement_opened', person: s.email, person_id: s.person_id, site: period.site, object_kind: 'restatement', object_ref: reference, content: { period: id, reason, certificates: certs.map((x) => x.number) } });
    return {
      status: 201,
      body: {
        reference,
        period: id,
        reason,
        state: 'open',
        certificates: certs.map((x) => ({ number: x.number, version: x.version, state: x.state, recipient: x.recipient, recipient_name: x.recipient_name, content_bp: x.content_bp, claim_type: x.claim_type })),
        content_movements,
        complete: true,
        note: 'Each affected certificate takes exactly one resolution in reissued, withdrawn or unaffected, each with its own stated reason.',
      },
    };
  });
  return c.json(out.body, out.status);
});

r.post('/restatements/:reference/resolutions', async (c) => {
  const s = await requireRole(c, 'restatement_resolved', 'claims_manager', 'quality_manager');
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /restatements/${reference}/resolutions`, body, async () => {
    const rst = await one('select * from restatement where reference = $1', [reference]);
    if (!rst) throw refuse(404, 'not_found', 'No such restatement.');
    const { certificate, outcome, reason } = body;
    if (Array.isArray(certificate)) throw refuse(400, 'one_certificate_at_a_time', 'No route resolves more than one certificate at a time.');
    if (!certificate) throw refuse(400, 'certificate_required', 'A resolution names one certificate.');
    if (!['reissued', 'withdrawn', 'unaffected'].includes(outcome)) throw refuse(400, 'invalid_outcome', "outcome is one of 'reissued', 'withdrawn', 'unaffected'.");
    if (!reason) throw refuse(400, 'reason_required', 'Each resolution carries its own stated reason.');
    const existing = await one('select * from resolution where restatement = $1 and certificate = $2', [reference, certificate]);
    if (existing) {
      await recordRefusal(s, 'resolution_refused', 'restatement', reference, { certificate, reason: 'already_resolved' });
      throw refuse(409, 'certificate_already_resolved', `${certificate} already carries resolution ${existing.reference} in this restatement, with the outcome '${existing.outcome}'. A restatement holds exactly one resolution per affected certificate.`, { existing_resolution: existing.reference, existing_outcome: existing.outcome });
    }
    const ref = await nextRef('RES-', 'resolution');
    await pool.query('insert into resolution (reference, restatement, certificate, outcome, reason, recorded_by) values ($1,$2,$3,$4,$5,$6)', [ref, reference, certificate, outcome, reason, s.email]);
    const all = await q('select * from resolution where restatement = $1', [reference]);
    const enumerated = rst.certificates || [];
    if (enumerated.length && all.length >= enumerated.length) await pool.query("update restatement set state = 'resolved' where reference = $1", [reference]);
    await appendEntry(null, { act: 'restatement_resolved', person: s.email, person_id: s.person_id, object_kind: 'resolution', object_ref: ref, content: { restatement: reference, certificate, outcome, reason } });
    return { status: 201, body: { reference: ref, restatement: reference, certificate, outcome, reason, resolved_count: all.length, certificates_in_restatement: enumerated.length } };
  });
  return c.json(out.body, out.status);
});

/* ------------------------------------------------------ conversion factors */

r.get('/conversion-factors', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from conversion_factor order by site, version');
  return c.json(rows.map((x) => ({ reference: x.reference, site: x.site, version: x.version, factor_bp: x.factor_bp, derived_from: x.derived_from ? dayOf(x.derived_from) : null, derived_to: x.derived_to ? dayOf(x.derived_to) : null, derived_in_g: Number(x.derived_in_g), derived_out_g: Number(x.derived_out_g), provisional: x.provisional, published_by: x.published_by, published_on: dayOf(x.published_on), superseded_by: x.superseded_by })));
});

r.post('/conversion-factors', async (c) => {
  const s = await requireRole(c, 'conversion_factor_published', 'claims_manager');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, 'POST /conversion-factors', body, async () => {
    const { site, factor_bp, derived_from = null, derived_to = null, derived_in_g = 0, derived_out_g = 0, provisional = false } = body;
    requireInt(factor_bp, 'factor_bp');
    requireInt(derived_in_g, 'derived_in_g');
    requireInt(derived_out_g, 'derived_out_g');
    const st = await one('select * from site where reference = $1', [site]);
    if (!st) throw refuse(404, 'site_not_found', 'No such site.');
    if (derived_in_g === 0) {
      if (!provisional) throw refuse(400, 'provisional_required', 'A factor with no derivation window declares itself provisional, and every certificate resting on it says so.');
    } else {
      const expected = mulDiv(derived_out_g, 10000, derived_in_g);
      if (expected !== factor_bp) {
        await recordRefusal(s, 'conversion_factor_refused', 'conversion_factor', site, { factor_bp, expected });
        throw refuse(409, 'factor_does_not_reconcile', `A factor is always the arithmetic of a stated window rather than a number somebody chose. derived_out_g * 10000 / derived_in_g floored is ${expected}, and the factor offered is ${factor_bp}.`, { expected_factor_bp: expected, offered_factor_bp: factor_bp, derived_in_g, derived_out_g });
      }
    }
    const prev = await one('select * from conversion_factor where site = $1 order by version desc limit 1', [site]);
    const version = prev ? prev.version + 1 : 1;
    const reference = `CF-${site.replace('SITE-', '')}-${version}`;
    await pool.query('insert into conversion_factor (reference, site, version, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [reference, site, version, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, !!provisional, s.email, new Date().toISOString().slice(0, 10)]);
    if (prev) await pool.query('update conversion_factor set superseded_by = $1 where reference = $2', [reference, prev.reference]);
    await appendEntry(null, { act: 'conversion_factor_published', person: s.email, person_id: s.person_id, site, object_kind: 'conversion_factor', object_ref: reference, content: { factor_bp, derived_in_g, derived_out_g, provisional: !!provisional, supersedes: prev ? prev.reference : null } });
    return { status: 201, body: { reference, site, version, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional: !!provisional, supersedes: prev ? prev.reference : null, derivation: { factor_bp: 'derived_out_g * 10000 / derived_in_g, floored' } } };
  });
  return c.json(out.body, out.status);
});

/* ---------------------------------------------------- byproducts and yield */

r.get('/outputs/:reference/share', async (c) => {
  requireSession(c);
  const { byproductShare } = await import('../engine/carbon.js');
  const out = await byproductShare(c.req.param('reference'));
  if (!out) throw refuse(404, 'not_found', 'No such byproduct output.');
  return c.json(out);
});

export default r;
