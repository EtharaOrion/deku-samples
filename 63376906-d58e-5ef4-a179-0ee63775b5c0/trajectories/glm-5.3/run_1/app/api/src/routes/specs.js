import { Hono } from 'hono';
import { q, one, client } from '../db.js';
import { requireAuth, requireRole, bad, notFound, conflict, forbidden, reqField, intField, enumField, rememberIdempotency, refusePagination } from '../lib/http.js';
import { entry } from '../record.js';
import { sendMail } from '../mail.js';

const r = new Hono();
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

r.get('/api/specifications/:grade/versions/:version', async (c) => {
  await requireAuth(c);
  const s = await one('SELECT * FROM specifications WHERE id = $1 AND version = $2',
    ['SPEC-' + c.req.param('grade'), Number(c.req.param('version'))]);
  if (!s) throw notFound('specification_not_found');
  return c.json(serializeSpec(s));
});

function serializeSpec(s) {
  return {
    id: s.id, grade: s.id.replace('SPEC-', ''), version: s.version, issued_on: isoD(s.issued_on),
    superseded: s.superseded,
    rows: s.rows, virgin_reference: s.virgin_reference
  };
}

r.post('/api/specifications/:grade/versions/:version/issue', async (c) => {
  const user = await requireRole(c, 'quality_manager');
  const s = await one('SELECT * FROM specifications WHERE id=$1 AND version=$2',
    ['SPEC-' + c.req.param('grade'), Number(c.req.param('version'))]);
  if (!s) throw notFound('specification_not_found');
  const b = await c.req.json();
  const customer = reqField(b.customer, 'customer');
  const cust = await one('SELECT * FROM customers WHERE reference=$1', [customer]);
  if (!cust) throw notFound('customer_not_found');
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO specification_issues (specification, version, customer, issued_on) VALUES ($1,$2,$3,$4)`,
      [s.id, s.version, customer, isoD(new Date())]);
    const e = await entry(tx, { person: user.email, site: null, object: `${s.id} v${s.version}`, act: 'specification_issued',
      content: { specification: s.id, version: s.version, customer } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: `${s.id}-v${s.version}-${customer}`, specification: s.id, version: s.version, customer, record_seq: e.seq });
    return c.json({ reference: `${s.id}-v${s.version}-${customer}`, specification: s.id, version: s.version, customer, record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

r.get('/api/customers/:ref', async (c) => {
  await requireAuth(c);
  const cust = await one('SELECT * FROM customers WHERE reference=$1', [c.req.param('ref')]);
  if (!cust) throw notFound('customer_not_found');
  const holds = await q('SELECT specification, version FROM specification_issues WHERE customer=$1', [cust.reference]);
  const conf = await q('SELECT * FROM conformances WHERE customer=$1', [cust.reference]);
  return c.json({
    reference: cust.reference, name: cust.party, contact: cust.contact, language: cust.language,
    holds_specification_version: holds.map(h => ({ specification: h.specification, version: Number(h.version) })),
    conformances: conf.map(x => ({
      application: x.application, industry: x.industry, specification: x.specification,
      specification_version: Number(x.specification_version), trials: x.trials, outcome: x.outcome
    }))
  });
});

// ---- Change control. Derive rather than assert.
r.post('/api/change-notices', async (c) => {
  const user = await requireRole(c, 'quality_manager');
  const b = await c.req.json();
  const change = reqField(b.change, 'change');
  const specRef = b.specification || null;
  const specVersion = b.version || null;
  const affected = [];
  const customers = [];
  if (specRef) {
    affected.push({ specification: specRef, version: specVersion });
    const holders = await q('SELECT DISTINCT customer FROM specification_issues WHERE specification=$1', [specRef]);
    for (const h of holders) {
      const cust = await one('SELECT * FROM customers WHERE reference=$1', [h.customer]);
      customers.push({ customer: h.customer, industry: cust?.industry || null });
    }
  }
  const qualificationRelevant = !!b.qualification_relevant;
  const automotive = customers.filter(x => x.industry === 'automotive');
  if (qualificationRelevant && automotive.length) {
    throw conflict('change_blocked_qualification_relevant', {
      rule: 'a change touching a qualification-relevant parameter for a customer in the automotive industry blocks rather than warns',
      customers: automotive.map(x => x.customer)
    });
  }
  const noticePeriod = 30;
  const ref = `CHG-${String(Number((await one('SELECT count(*) n FROM change_notices')).n) + 1).padStart(4, '0')}`;
  const derived = {
    specifications_affected: affected,
    customers_affected: customers.map(x => x.customer),
    qualifications_affected: qualificationRelevant ? customers.map(x => x.customer) : [],
    notice_period_days: noticePeriod
  };
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO change_notices (reference, change, specification, specification_version, qualification_relevant, derived, raised_on, state)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'proposed')`,
      [ref, change, specRef, specVersion, qualificationRelevant, JSON.stringify(derived), isoD(new Date())]);
    const e = await entry(tx, { person: user.email, site: null, object: ref, act: 'change_notice_raised',
      content: { reference: ref, change, derived } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: ref, ...derived, record_seq: e.seq });
    return c.json({ reference: ref, change, ...derived, state: 'proposed', record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

r.post('/api/change-notices/:ref/notify', async (c) => {
  const user = await requireRole(c, 'quality_manager');
  const n = await one('SELECT * FROM change_notices WHERE reference=$1', [c.req.param('ref')]);
  if (!n) throw notFound('change_notice_not_found');
  const b = await c.req.json();
  const customer = reqField(b.customer, 'customer');
  const cust = await one('SELECT * FROM customers WHERE reference=$1', [customer]);
  if (!cust) throw notFound('customer_not_found');
  const derived = typeof n.derived === 'string' ? JSON.parse(n.derived) : n.derived;
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO change_notice_acknowledgements (notice, customer) VALUES ($1,$2)`, [n.reference, customer]);
    const e = await entry(tx, { person: user.email, site: null, object: n.reference, act: 'change_notice_notified',
      content: { reference: n.reference, customer } });
    await tx.query('COMMIT');
    if (cust.contact) {
      await sendMail(cust.contact, `Change notice ${n.reference} requires acknowledgement`,
        `Change notice ${n.reference} requires acknowledgement.\n\nThe change: ${n.change}\nSpecifications affected: ${(derived.specifications_affected || []).map(s => `${s.specification} v${s.version}`).join(', ')}\nNotice period: ${derived.notice_period_days} days.\n`);
    }
    await rememberIdempotency(c, 201, { reference: n.reference, customer, record_seq: e.seq });
    return c.json({ reference: n.reference, customer, notified: true, record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

r.post('/api/change-notices/:ref/release', async (c) => {
  const user = await requireRole(c, 'quality_manager');
  const n = await one('SELECT * FROM change_notices WHERE reference=$1', [c.req.param('ref')]);
  if (!n) throw notFound('change_notice_not_found');
  const derived = typeof n.derived === 'string' ? JSON.parse(n.derived) : n.derived;
  const owed = derived.customers_affected || [];
  const acks = await q('SELECT customer, waived FROM change_notice_acknowledgements WHERE notice=$1', [n.reference]);
  const outstanding = owed.filter(x => !acks.some(a => a.customer === x));
  if (outstanding.length) {
    throw conflict('release_refused_owed_notice', { customers_not_notified: outstanding, rule: 'every customer owed notice has been notified or has waived it in a recorded act' });
  }
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`UPDATE change_notices SET state='released', released_on=$2 WHERE reference=$1`, [n.reference, isoD(new Date())]);
    const e = await entry(tx, { person: user.email, site: null, object: n.reference, act: 'change_notice_released', content: { reference: n.reference } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: n.reference, state: 'released', record_seq: e.seq });
    return c.json({ reference: n.reference, state: 'released', record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

export default r;
