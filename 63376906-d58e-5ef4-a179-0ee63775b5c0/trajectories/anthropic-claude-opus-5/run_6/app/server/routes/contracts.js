import { Hono } from 'hono';
import { q, pool } from '../lib/db.js';
import {
  requireSession, requireAct, withIdempotency, refuse, refusePagination,
  requireFields, requireIntegers, rejectComputedInputs, nextReference, today,
} from '../lib/http.js';
import { appendEntry } from '../lib/records.js';
import { sendMail } from '../lib/mail.js';
import { requiredRemainingBp, isUnreachable, runningContent, floorDiv } from '../engine/arithmetic.js';
import { lotClaim } from '../engine/ledger.js';
import { iso } from '../engine/feedstock.js';

const r = new Hono();

async function projection(contract) {
  const allocations = await q('SELECT * FROM contract_allocation WHERE contract = $1 ORDER BY reference ASC', [contract.id]);
  const deliveries = allocations.map((a) => ({ mass_kg: floorDiv(Number(a.mass_g), 1000), content_bp: Number(a.content_bp) }));
  const delivered = Number(contract.delivered_kg) + deliveries.reduce((s, d) => s + d.mass_kg, 0);
  const running = runningContent(deliveries);
  const required = requiredRemainingBp(Number(contract.committed_kg), delivered, running, Number(contract.floor_bp));
  const unreachable = isUnreachable(required);
  const site = (await q('SELECT * FROM site WHERE reference = $1', [contract.site]))[0];
  const plannedSite = site?.confidence === 'planned';
  return {
    contract: contract.id,
    recipient: contract.recipient,
    site: contract.site,
    period: contract.period,
    delivered_kg: delivered,
    committed_kg: Number(contract.committed_kg),
    running_content_bp: running,
    floor_bp: Number(contract.floor_bp),
    required_remaining_bp: required,
    state: unreachable ? 'unreachable' : 'on_track',
    // an unreachable floor is reported and never refused
    unreachable_on: unreachable ? (iso(contract.unreachable_on) || today()) : null,
    unreachable_allocation: unreachable ? (contract.unreachable_allocation || allocations[allocations.length - 1]?.reference || null) : null,
    shortfall_consequence: contract.shortfall_consequence,
    planned_site_flag: plannedSite,
    flag_dismissible: false,
    site_confidence: site?.confidence || null,
    planned_statement: plannedSite ? `The supplying site ${contract.site} carries a confidence of planned.` : null,
    allocations: allocations.map((a) => ({
      reference: a.reference, lot: a.lot, mass_g: Number(a.mass_g), content_bp: Number(a.content_bp),
      decided_by: a.decided_by, favoured_over: a.favoured_over,
    })),
    derivation: required === null
      ? 'The committed volume is delivered; there is no remaining volume to average over.'
      : `(committed_kg ${contract.committed_kg} * floor_bp ${contract.floor_bp} - delivered_kg ${delivered} * running_content_bp ${running}) / remaining ${Number(contract.committed_kg) - delivered}, floored`,
    read_at: new Date().toISOString(),
  };
}

r.get('/contracts', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const rows = await q('SELECT * FROM contract ORDER BY id ASC');
  return c.json(await Promise.all(rows.map(projection)));
});

r.get('/contracts/:id/projection', async (c) => {
  await requireSession(c);
  const row = (await q('SELECT * FROM contract WHERE id = $1', [c.req.param('id')]))[0];
  if (!row) refuse(404, 'not_found', { error: 'not_found', message: 'No such contract.' });
  return c.json(await projection(row));
});

// Where supply is short, an allocation names the person who decided and the
// contracts that went without. It is never an automatic sort by contract value.
r.post('/contracts/:id/allocations', async (c) => {
  const actor = await requireAct(c, 'contract.allocate');
  const body = await c.req.json().catch(() => ({}));
  const id = c.req.param('id');
  const out = await withIdempotency(c, body, async () => {
    rejectComputedInputs(body);
    requireFields(body, ['lot', 'mass_g']);
    requireIntegers(body, ['mass_g']);
    const contract = (await q('SELECT * FROM contract WHERE id = $1', [id]))[0];
    if (!contract) refuse(404, 'not_found', { error: 'not_found', message: 'No such contract.' });
    const lot = (await q('SELECT * FROM lot WHERE reference = $1', [body.lot]))[0];
    if (!lot) refuse(404, 'not_found', { error: 'not_found', message: 'No such lot.' });
    // a claim already allocated to one contract is refused a second attachment
    const already = (await q('SELECT * FROM contract_allocation WHERE lot = $1', [body.lot]))[0];
    if (already) {
      await appendEntry(null, {
        person: actor.email, object_kind: 'contract_allocation', object_ref: id, action: 'refused',
        content: { lot: body.lot, reason: 'claim_already_allocated', existing_contract: already.contract },
      });
      refuse(409, 'claim_already_allocated', {
        error: 'claim_already_allocated',
        message: 'A claim already allocated to one contract is refused a second attachment.',
        lot: body.lot, existing_contract: already.contract, existing_allocation: already.reference,
      });
    }
    const claim = await lotClaim(body.lot);
    const reference = await nextReference('CAL', 'contract_allocation');
    const favouredOver = Array.isArray(body.favoured_over) ? body.favoured_over : [];
    await pool.query(
      `INSERT INTO contract_allocation (reference, contract, lot, mass_g, content_bp, decided_by, favoured_over)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [reference, id, body.lot, body.mass_g, claim.content_bp, body.decided_by || actor.email, JSON.stringify(favouredOver)]);
    const proj = await projection((await q('SELECT * FROM contract WHERE id = $1', [id]))[0]);
    if (proj.state === 'unreachable' && !contract.unreachable_on) {
      await pool.query('UPDATE contract SET unreachable_on = $1, unreachable_allocation = $2 WHERE id = $3',
        [today(), reference, id]);
    }
    await appendEntry(null, {
      person: actor.email, object_kind: 'contract_allocation', object_ref: reference, action: 'allocated',
      content: { contract: id, lot: body.lot, mass_g: body.mass_g, content_bp: claim.content_bp, decided_by: body.decided_by || actor.email, favoured_over: favouredOver },
    });
    return {
      status: 201,
      body: {
        reference, contract: id, lot: body.lot, mass_g: body.mass_g,
        content_bp: claim.content_bp, claim_type: lot.claim_type,
        decided_by: body.decided_by || actor.email, favoured_over: favouredOver,
        projection: proj,
      },
    };
  });
  return c.json(out.body, out.status);
});

// ---- change notices ------------------------------------------------------
r.get('/change-notices', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const rows = await q('SELECT * FROM change_notice ORDER BY reference ASC');
  const acts = await q('SELECT * FROM change_notice_act');
  return c.json(rows.map((x) => ({
    reference: x.reference, title: x.title, detail: x.detail, parameter: x.parameter, grade: x.grade,
    specifications_affected: x.specifications_affected, customers_affected: x.customers_affected,
    qualifications_affected: x.qualifications_affected, notice_period_days: x.notice_period_days,
    blocking: x.blocking, state: x.state, raised_by: x.raised_by, raised_at: x.raised_at, released_at: x.released_at,
    acts: acts.filter((a) => a.notice === x.reference).map((a) => ({ customer: a.customer, act: a.act, recorded_by: a.recorded_by, recorded_at: a.recorded_at })),
  })));
});

const QUALIFICATION_PARAMETERS = ['temperature', 'pressure', 'relative_viscosity', 'moisture', 'recipe', 'reagent'];

r.post('/change-notices', async (c) => {
  const actor = await requireAct(c, 'change_notice.raise');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['title', 'detail', 'parameter', 'grade']);
    const specs = await q('SELECT * FROM specification WHERE grade = $1', [body.grade]);
    const customers = await q('SELECT * FROM customer WHERE holds_grade = $1', [body.grade]);
    const conformances = await q('SELECT * FROM conformance');

    // derived, rather than asserted
    const specsAffected = specs.filter((s) => !s.superseded).map((s) => `SPEC-${s.grade} v${s.version}`);
    const custAffected = customers.map((x) => ({ reference: x.reference, name: x.reference, industry: x.industry, application: x.application, contact: x.contact }));
    const qualAffected = conformances
      .filter((cf) => customers.some((x) => x.reference === cf.customer))
      .map((cf) => ({ customer: cf.customer, application: cf.application, grade: cf.grade, specification_version: `SPEC-${cf.grade} v${cf.spec_version}`, outcome: cf.outcome }));

    const qualificationRelevant = QUALIFICATION_PARAMETERS.some((p) => String(body.parameter).toLowerCase().includes(p));
    const automotive = customers.filter((x) => x.industry === 'automotive');
    // a change touching a qualification-relevant parameter for a customer in the
    // automotive industry blocks rather than warns
    const blocking = qualificationRelevant && automotive.length > 0;
    const noticePeriod = blocking ? 90 : 30;

    const reference = await nextReference('CHN', 'change_notice');
    await pool.query(
      `INSERT INTO change_notice (reference, title, detail, parameter, grade, specifications_affected, customers_affected, qualifications_affected, notice_period_days, blocking, state, raised_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'raised',$11)`,
      [reference, body.title, body.detail, body.parameter, body.grade,
        JSON.stringify(specsAffected), JSON.stringify(custAffected), JSON.stringify(qualAffected),
        noticePeriod, blocking, actor.email]);
    await appendEntry(null, {
      person: actor.email, object_kind: 'change_notice', object_ref: reference, action: 'raised',
      content: { title: body.title, parameter: body.parameter, specifications_affected: specsAffected, customers_affected: custAffected.map((x) => x.reference), blocking },
    });
    return {
      status: 201,
      body: {
        reference, title: body.title, detail: body.detail, parameter: body.parameter, grade: body.grade,
        specifications_affected: specsAffected,
        customers_affected: custAffected,
        qualifications_affected: qualAffected,
        notice_period_days: noticePeriod,
        blocking,
        blocking_statement: blocking
          ? `This change may invalidate ${qualAffected.length} customer qualifications.`
          : null,
        state: 'raised',
      },
    };
  });
  return c.json(out.body, out.status);
});

r.post('/change-notices/:reference/notify', async (c) => {
  const actor = await requireAct(c, 'change_notice.notify');
  const body = await c.req.json().catch(() => ({}));
  const reference = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['customer']);
    const notice = (await q('SELECT * FROM change_notice WHERE reference = $1', [reference]))[0];
    if (!notice) refuse(404, 'not_found', { error: 'not_found', message: 'No such change notice.' });
    const cust = (await q('SELECT * FROM customer WHERE reference = $1', [body.customer]))[0];
    if (!cust) refuse(404, 'not_found', { error: 'not_found', message: 'No such customer.' });
    // one named customer, one mail, one recipient
    await sendMail({
      to: cust.contact,
      subject: `Change notice ${reference} requires acknowledgement`,
      text: [
        `Change notice ${reference}: ${notice.title}`,
        '',
        notice.detail,
        '',
        `Parameter changed: ${notice.parameter}`,
        `Specifications affected: ${(notice.specifications_affected || []).join(', ')}`,
        `Notice period: ${notice.notice_period_days} days`,
        '',
        notice.blocking ? `This change may invalidate ${(notice.qualifications_affected || []).length} customer qualifications and blocks release until it is acknowledged.` : '',
        '',
        'Please acknowledge this notice or record a waiver.',
      ].filter(Boolean).join('\n'),
    });
    await pool.query('INSERT INTO change_notice_act (notice, customer, act, recorded_by) VALUES ($1,$2,$3,$4)',
      [reference, body.customer, 'notified', actor.email]);
    await appendEntry(null, {
      person: actor.email, object_kind: 'change_notice', object_ref: reference, action: 'notified',
      content: { customer: body.customer, address: cust.contact },
    });
    return { status: 201, body: { reference: `${reference}/${body.customer}`, notice: reference, customer: body.customer, act: 'notified', notified_at: new Date().toISOString() } };
  });
  return c.json(out.body, out.status);
});

r.post('/change-notices/:reference/waive', async (c) => {
  const actor = await requireAct(c, 'change_notice.notify');
  const body = await c.req.json().catch(() => ({}));
  const reference = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['customer', 'reason']);
    const notice = (await q('SELECT * FROM change_notice WHERE reference = $1', [reference]))[0];
    if (!notice) refuse(404, 'not_found', { error: 'not_found', message: 'No such change notice.' });
    await pool.query('INSERT INTO change_notice_act (notice, customer, act, recorded_by) VALUES ($1,$2,$3,$4)',
      [reference, body.customer, 'waived', actor.email]);
    await appendEntry(null, {
      person: actor.email, object_kind: 'change_notice', object_ref: reference, action: 'waived',
      content: { customer: body.customer, reason: body.reason },
    });
    return { status: 201, body: { reference: `${reference}/${body.customer}`, notice: reference, customer: body.customer, act: 'waived', reason: body.reason } };
  });
  return c.json(out.body, out.status);
});

// Release is refused until every customer owed notice has been notified or waived.
r.post('/change-notices/:reference/release', async (c) => {
  const actor = await requireAct(c, 'change_notice.release');
  const body = await c.req.json().catch(() => ({}));
  const reference = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    const notice = (await q('SELECT * FROM change_notice WHERE reference = $1', [reference]))[0];
    if (!notice) refuse(404, 'not_found', { error: 'not_found', message: 'No such change notice.' });
    if (notice.state === 'released') {
      refuse(409, 'already_released', { error: 'already_released', message: 'This change notice is already released.', released_at: notice.released_at });
    }
    const acts = await q('SELECT * FROM change_notice_act WHERE notice = $1', [reference]);
    const owed = (notice.customers_affected || []).map((x) => x.reference || x);
    const outstanding = owed.filter((cust) => !acts.some((a) => a.customer === cust && ['notified', 'waived'].includes(a.act)));
    if (outstanding.length) {
      await appendEntry(null, {
        person: actor.email, object_kind: 'change_notice', object_ref: reference, action: 'release_refused',
        content: { outstanding },
      });
      refuse(409, 'notice_outstanding', {
        error: 'notice_outstanding',
        message: 'A release is refused until every customer owed notice has been notified or has waived it in a recorded act.',
        outstanding,
      });
    }
    await pool.query("UPDATE change_notice SET state = 'released', released_at = now() WHERE reference = $1", [reference]);
    await appendEntry(null, {
      person: actor.email, object_kind: 'change_notice', object_ref: reference, action: 'released',
      content: { customers_notified: owed },
    });
    return { status: 201, body: { reference, state: 'released', released_by: actor.email, released_at: new Date().toISOString(), customers_notified: owed } };
  });
  return c.json(out.body, out.status);
});

export default r;
