import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore, refusePagination } from '../lib/idem.js';
import { mailChangeNotice } from '../lib/mail.js';

export async function register({ app, pool }) {
  app.get('/api/change-notices', async (c) => {
    refusePagination(c.req.query());
    requireSession(c);
    const rows = (await pool.query(`SELECT * FROM change_notices ORDER BY reference`)).rows;
    return c.json(rows.map((x) => ({
      reference: x.reference, change: x.change, kind: x.kind, subject_ref: x.subject_ref,
      proposed_by: x.proposed_by, proposed_on: x.proposed_on, notice_period_days: x.notice_period_days,
      specifications_affected: x.specifications_affected, customers_affected: x.customers_affected,
      qualifications_affected: x.qualifications_affected, blocked: x.blocked, state: x.state,
      acknowledged_by: x.acknowledged
    })));
  });

  app.post('/api/change-notices', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('quality_manager')) throw new HttpError(403, 'quality_manager_required');
    const body = await c.req.json().catch(() => ({}));
    if (!body.change) throw new HttpError(400, 'change_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, 'change-notices', body);
      if (guard.replay) return c.json(guard.response, guard.status);
      // derive, rather than assert, the affected sets
      const specs = (await client.query(`SELECT DISTINCT grade, version FROM specifications WHERE current`)).rows;
      const specRefs = specs.map((x) => `SPEC-${x.grade} v${x.version}`);
      const customers = (await client.query(`SELECT DISTINCT customer, grade, version FROM spec_issues`)).rows;
      const autoCustomers = (await client.query(`SELECT DISTINCT customer FROM conformances WHERE outcome IN ('in_trial','passed')`)).rows;
      const custRefs = [...new Set([...customers.map((x) => x.customer), ...autoCustomers.map((x) => x.customer)])];
      // qualification-relevant change for an automotive customer blocks
      const autoRows = (await client.query(`
        SELECT p.reference FROM parties p WHERE p.kind='customer' AND p.industry='automotive'`)).rows;
      const autoRefs = autoRows.map((x) => x.reference);
      const touchesQualification = body.qualification_relevant !== false;
      const blocked = touchesQualification && autoRefs.length > 0;
      const n = (await client.query(`SELECT count(*)::int AS n FROM change_notices`)).rows[0].n + 1;
      const ref = `CHG-${String(n).padStart(4, '0')}`;
      const noticePeriod = Number(body.notice_period_days || 30);
      await client.query(
        `INSERT INTO change_notices (reference,change,kind,subject_ref,proposed_by,notice_period_days,specifications_affected,customers_affected,qualifications_affected,blocked,state,acknowledged)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'proposed','[]'::jsonb)`,
        [ref, body.change, body.kind || 'recipe_revision', body.subject_ref || null, s.email, noticePeriod,
         JSON.stringify(specRefs), JSON.stringify(custRefs), JSON.stringify(autoRefs), blocked]);
      await record(client, { kind: 'change_notice_raised', object_ref: ref, actor: s.email, content: { change: body.change, specifications_affected: specRefs, customers_affected: custRefs, qualifications_affected: autoRefs, blocked } });
      const response = {
        reference: ref, change: body.change,
        specifications_affected: specRefs, customers_affected: custRefs, qualifications_affected: autoRefs,
        notice_period_days: noticePeriod, blocked, state: 'proposed'
      };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.post('/api/change-notices/:reference/notify', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('quality_manager')) throw new HttpError(403, 'quality_manager_required');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    if (!body.customer) throw new HttpError(400, 'customer_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `change:${ref}:notify`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const cn = (await client.query(`SELECT * FROM change_notices WHERE reference=$1 FOR UPDATE`, [ref])).rows[0];
      if (!cn) throw new HttpError(404, 'change_notice_not_found');
      const ack = cn.acknowledged || [];
      if (!ack.includes(body.customer)) ack.push(body.customer);
      await client.query(`UPDATE change_notices SET acknowledged=$1, state='notified' WHERE reference=$2`, [JSON.stringify(ack), ref]);
      const cust = (await client.query(`SELECT * FROM parties WHERE reference=$1`, [body.customer])).rows[0];
      await record(client, { kind: 'change_notice_notified', object_ref: ref, actor: s.email, content: { customer: body.customer, notified_through: 'mailpit' } });
      const response = { reference: ref, customer: body.customer, notified: true, contact: cust ? cust.contact : null };
      await idemStore(client, guard, 201, response);
      // mail is part of the act
      try {
        if (cust && cust.contact) {
          await mailChangeNotice(cust.contact, ref, cn.change, cn.specifications_affected, cn.notice_period_days);
        }
      } catch (e) { console.error('mail failed', e.message); }
      return c.json(response, 201);
    });
  });

  app.post('/api/change-notices/:reference/release', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('quality_manager')) throw new HttpError(403, 'quality_manager_required');
    const ref = c.req.param('reference');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `change:${ref}:release`, {});
      if (guard.replay) return c.json(guard.response, guard.status);
      const cn = (await client.query(`SELECT * FROM change_notices WHERE reference=$1 FOR UPDATE`, [ref])).rows[0];
      if (!cn) throw new HttpError(404, 'change_notice_not_found');
      const owed = cn.customers_affected || [];
      const acked = cn.acknowledged || [];
      const missing = owed.filter((x) => !acked.includes(x));
      if (missing.length) throw new HttpError(409, 'notice_owed', {
        message: 'Release is refused until every customer owed notice has been notified or has waived it in a recorded act.',
        customers_owed_notice: missing
      });
      if (cn.blocked) throw new HttpError(409, 'qualification_blocked', {
        message: 'A change touching a qualification-relevant parameter for a customer in the automotive industry blocks rather than warns.',
        qualifications_affected: cn.qualifications_affected
      });
      await client.query(`UPDATE change_notices SET state='released' WHERE reference=$1`, [ref]);
      await record(client, { kind: 'change_notice_released', object_ref: ref, actor: s.email, content: { notice_period_days: cn.notice_period_days } });
      const response = { reference: ref, state: 'released' };
      await idemStore(client, guard, 200, response);
      return c.json(response);
    });
  });
}
