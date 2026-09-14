import { Hono } from 'hono';
import { q, tx } from '../db.js';
import { requireSession } from '../auth.js';
import { idempotent, readBody, refuse, recordTx, requireKeys } from '../lib/http.js';
import { sendMail } from '../lib/mail.js';
import { nowIso, floorDiv } from '../lib/util.js';
import { lotAllocated } from '../lib/engine.js';

const commercial = new Hono();
commercial.use('*', requireSession());

// ---- specifications ----
commercial.get('/specifications/:grade/versions/:version', async (c) => {
  const r = await q('SELECT * FROM specification WHERE id = $1 AND version = $2',
    ['SPEC-' + c.req.param('grade'), Number(c.req.param('version'))]);
  if (!r.rows.length) return c.json({ error: 'not_found' }, 404);
  const s = r.rows[0];
  return c.json({
    id: s.id, grade: c.req.param('grade'), version: s.version, issued_on: s.issued_on,
    rows: s.rows, virgin_reference: s.virgin_reference, superseded: s.superseded
  });
});

commercial.post('/specifications/:grade/versions/:version/issue', async (c) => {
  const user = c.get('user');
  if (user.role !== 'quality_manager') refuse(403, 'forbidden', { message: 'A quality manager issues a specification version.' });
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['customer']);
    return await tx(async (client) => {
      await client.query('INSERT INTO spec_issue (spec_id, spec_version, customer, issued_on) VALUES ($1,$2,$3,$4)',
        ['SPEC-' + c.req.param('grade'), Number(c.req.param('version')), body.customer, nowIso().slice(0, 10)]);
      await recordTx(client, { user, act: 'specification_issued', object: 'SPEC-' + c.req.param('grade') + ' v' + c.req.param('version'), payload: { customer: body.customer } });
      return { reference: 'SPEC-' + c.req.param('grade') + ' v' + c.req.param('version'), customer: body.customer };
    });
  });
});

commercial.get('/customers/:reference', async (c) => {
  const cu = (await q('SELECT * FROM customer WHERE reference = $1', [c.req.param('reference')])).rows[0];
  if (!cu) return c.json({ error: 'not_found' }, 404);
  const conf = await q('SELECT * FROM conformance WHERE customer = $1', [cu.reference]);
  return c.json({
    reference: cu.reference, contact: cu.contact, holds_specification_version: cu.holds,
    application: cu.application, industry: cu.industry,
    conformance: conf.rows.map((x) => ({ spec_id: x.spec_id, spec_version: x.spec_version, application: x.application, trials: x.trials, outcome: x.outcome }))
  });
});

// ---- change notices ----
commercial.post('/change-notices', async (c) => {
  const user = c.get('user');
  if (!['quality_manager', 'claims_manager'].includes(user.role)) refuse(403, 'forbidden');
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['change']);
    return await tx(async (client) => {
      const r = await client.query('INSERT INTO ref_seq (kind, n) VALUES ($1, 1) ON CONFLICT (kind) DO UPDATE SET n = ref_seq.n + 1 RETURNING n', ['cn']);
      const ref = 'CN-' + String(r.rows[0].n).padStart(3, '0');
      // derive rather than assert
      const specs = (await client.query('SELECT DISTINCT id, version FROM specification WHERE superseded = false')).rows
        .map((x) => x.id + ' v' + x.version);
      const customers = (await client.query('SELECT reference, industry FROM customer')).rows;
      const automotive = customers.filter((x) => x.industry === 'automotive');
      const qualifications = automotive.length;
      if (automotive.length && body.qualification_relevant) {
        refuse(409, 'qualification_relevant_blocks', {
          customers: automotive.map((x) => x.reference),
          message: 'A change touching a qualification-relevant parameter for a customer in the automotive industry blocks rather than warns.'
        });
      }
      await client.query(
        `INSERT INTO change_notice (reference, proposed_by, raised_on, change, change_type, parameter, old_value, new_value, specifications_affected, customers_affected, qualifications_affected, notice_period_days, state)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'proposed')`,
        [ref, user.email, nowIso().slice(0, 10), body.change, body.change_type || 'process',
         body.parameter || null, body.old_value || null, body.new_value || null,
         JSON.stringify(specs), JSON.stringify(customers.map((x) => x.reference)), qualifications, Number(body.notice_period_days || 30)]
      );
      await recordTx(client, { user, act: 'change_notice_raised', object: ref, payload: { change: body.change } });
      return { reference: ref, specifications_affected: specs, customers_affected: customers.map((x) => x.reference), qualifications_affected: qualifications, notice_period_days: Number(body.notice_period_days || 30) };
    });
  });
});

commercial.post('/change-notices/:reference/notify', async (c) => {
  const user = c.get('user');
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['customer']);
    const cn = (await q('SELECT * FROM change_notice WHERE reference = $1', [c.req.param('reference')])).rows[0];
    if (!cn) refuse(404, 'not_found');
    const cu = (await q('SELECT * FROM customer WHERE reference = $1', [body.customer])).rows[0];
    if (!cu) refuse(404, 'not_found');
    return await tx(async (client) => {
      const notified = [...(cn.notified || []), cu.reference];
      await client.query('UPDATE change_notice SET notified = $2 WHERE reference = $1', [cn.reference, JSON.stringify(notified)]);
      await recordTx(client, { user, act: 'change_notice_notified', object: cn.reference, payload: { customer: cu.reference } });
      try {
        await sendMail(cu.contact, 'Change notice ' + cn.reference + ' requires acknowledgement',
          'Change notice ' + cn.reference + ' requires acknowledgement.\n\nChange: ' + cn.change + '\nSpecifications affected: ' + (cn.specifications_affected || []).join(', ') + '\nNotice period: ' + cn.notice_period_days + ' days');
      } catch (e) { /* the notification act is still recorded */ }
      return { reference: cn.reference, customer: cu.reference, notified: true };
    });
  });
});

commercial.post('/change-notices/:reference/release', async (c) => {
  const user = c.get('user');
  return idempotent(c, async () => {
    const cn = (await q('SELECT * FROM change_notice WHERE reference = $1', [c.req.param('reference')])).rows[0];
    if (!cn) refuse(404, 'not_found');
    const owed = (cn.customers_affected || []).filter((x) => !(cn.notified || []).includes(x) && !(cn.waivers || []).includes(x));
    if (owed.length) {
      refuse(409, 'notice_owed', { customers: owed, message: 'Release is refused until every customer owed notice has been notified or has waived it in a recorded act.' });
    }
    return await tx(async (client) => {
      await client.query('UPDATE change_notice SET state = $2 WHERE reference = $1', [cn.reference, 'released']);
      await recordTx(client, { user, act: 'change_notice_released', object: cn.reference, payload: {} });
      return { reference: cn.reference, state: 'released' };
    });
  });
});

commercial.get('/change-notices', async (c) => {
  const r = await q('SELECT * FROM change_notice ORDER BY reference');
  return c.json(r.rows.map((x) => ({
    reference: x.reference, change: x.change, state: x.state, raised_on: x.raised_on,
    specifications_affected: x.specifications_affected, customers_affected: x.customers_affected,
    qualifications_affected: x.qualifications_affected, notice_period_days: x.notice_period_days,
    notified: x.notified, waivers: x.waivers
  })));
});

// ---- contracts and the offtake floor ----
commercial.get('/contracts/:id/projection', async (c) => {
  const ct = (await q('SELECT * FROM contract WHERE id = $1', [c.req.param('id')])).rows[0];
  if (!ct) return c.json({ error: 'not_found' }, 404);
  const allocations = (await q('SELECT * FROM allocation WHERE contract = $1', [ct.id])).rows;
  let deliveredKg = 0, runningMass = 0, deliveredMass = 0;
  for (const a of allocations) {
    const alloc = await lotAllocated(a.lot);
    runningMass += (alloc.post_consumer + alloc.pre_consumer);
    deliveredMass += Number(a.mass_g);
  }
  deliveredKg = floorDiv(deliveredMass, 1000);
  const runningContentBp = deliveredMass > 0 ? floorDiv(runningMass * 10000, deliveredMass) : 0;
  const committedMass = Number(ct.committed_kg) * 1000;
  const remainingMass = Math.max(0, committedMass - deliveredMass);
  const requiredRemainingBp = remainingMass > 0 ? floorDiv(Math.max(0, Number(ct.committed_kg) * 1000 * Number(ct.floor_bp) - runningMass) * 10000, remainingMass) : 0;
  const site = (await q('SELECT * FROM site WHERE reference = $1', [ct.site])).rows[0];
  const unreachable = requiredRemainingBp > 10000;
  return c.json({
    contract: ct.id, delivered_kg: deliveredKg, committed_kg: Number(ct.committed_kg),
    running_content_bp: runningContentBp, floor_bp: Number(ct.floor_bp),
    required_remaining_bp: requiredRemainingBp,
    state: unreachable ? 'unreachable' : 'on_track',
    state_word: unreachable ? 'unreachable' : 'on_track',
    unreachable_on: unreachable ? (ct.unreachable_on || nowIso().slice(0, 10)) : ct.unreachable_on,
    unreachable_allocation: ct.unreachable_allocation || null,
    shortfall_consequence: ct.shortfall_consequence,
    planned_site_flag: site && site.confidence === 'planned',
    flag_dismissible: false,
    derivation: {
      running_content_bp: 'floor(allocated claim mass * 10000 / delivered mass)',
      required_remaining_bp: 'floor((committed mass * floor - running claim) * 10000 / remaining mass)'
    }
  });
});

commercial.post('/contracts/:id/allocations', async (c) => {
  const user = c.get('user');
  if (!['claims_manager', 'quality_manager'].includes(user.role)) refuse(403, 'forbidden');
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['lot', 'mass_g', 'decided_by']);
    const ct = (await q('SELECT * FROM contract WHERE id = $1', [c.req.param('id')])).rows[0];
    if (!ct) refuse(404, 'not_found');
    const existing = (await q('SELECT * FROM allocation WHERE lot = $1', [body.lot])).rows;
    if (existing.length) {
      refuse(409, 'already_allocated', { message: 'A claim already allocated to one contract is refused a second attachment.' });
    }
    return await tx(async (client) => {
      await client.query('INSERT INTO allocation (contract, lot, mass_g, decided_by, favoured_over, allocated_on) VALUES ($1,$2,$3,$4,$5,$6)',
        [ct.id, body.lot, Number(body.mass_g), body.decided_by, JSON.stringify(body.favoured_over || []), nowIso().slice(0, 10)]);
      await recordTx(client, { user, act: 'contract_allocation_recorded', object: ct.id, payload: { lot: body.lot, decided_by: body.decided_by, favoured_over: body.favoured_over || [] } });
      return { reference: ct.id + '/' + body.lot, decided_by: body.decided_by, favoured_over: body.favoured_over || [] };
    });
  });
});

export default commercial;
