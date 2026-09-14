import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore } from '../lib/idem.js';

const nextRef = (prefix, n) => `${prefix}-${String(n).padStart(4, '0')}`;

export async function register({ app, pool }) {
  app.get('/api/collectors', async (c) => {
    const s = c.get('session');
    const rows = (await pool.query(`
      SELECT p.reference, p.current_name, p.country, p.registration, p.registration_expiry,
             e.site_types, e.streams, e.scheme_status
      FROM parties p LEFT JOIN collectors_extra e ON e.reference = p.reference
      WHERE p.kind='collector' ORDER BY p.reference`)).rows;
    const out = [];
    for (const r of rows) {
      const periods = (await pool.query(
        `SELECT state, valid_from, valid_to, condition, condition_closes_on FROM approval_periods WHERE collector=$1 ORDER BY valid_from`, [r.reference])).rows;
      const findings = (await pool.query(`SELECT id, opened_on, detail, closed FROM collector_findings WHERE collector=$1 ORDER BY id DESC`, [r.reference])).rows;
      const last = periods[periods.length - 1];
      const expiringSoon = last && last.valid_to && (new Date(last.valid_to) - new Date()) / 86400000 <= 14 && (new Date(last.valid_to) - new Date()) >= 0;
      out.push({
        reference: r.reference, name: r.current_name, country: r.country,
        registration: r.registration, registration_expiry: r.registration_expiry,
        collection_site_types: r.site_types || [], declared_streams: r.streams || [],
        scheme_status: r.scheme_status,
        findings: findings.map((f) => ({ id: f.id, opened_on: f.opened_on, closed: f.closed, detail: f.detail })),
        approval_periods: periods.map((p) => ({
          state: p.state, valid_from: p.valid_from, valid_to: p.valid_to,
          condition: p.condition || null, condition_closes_on: p.condition_closes_on || null,
          expiring: !!expiringSoon && p === last
        }))
      });
    }
    // collector self-view
    if (s && !s.roles.some((r) => ['plant_operator','lab_analyst','quality_manager','claims_manager','certificate_signer','auditor'].includes(r))) {
      return c.json([]);
    }
    return c.json(out);
  });

  app.get('/api/collectors/:reference', async (c) => {
    const ref = c.req.param('reference');
    const r = (await pool.query(`
      SELECT p.reference, p.current_name, p.country, p.registration, p.registration_expiry,
             e.site_types, e.streams, e.scheme_status
      FROM parties p LEFT JOIN collectors_extra e ON e.reference = p.reference
      WHERE p.reference=$1 AND p.kind='collector'`, [ref])).rows[0];
    if (!r) throw new HttpError(404, 'collector_not_found');
    const periods = (await pool.query(`SELECT state, valid_from, valid_to, condition, condition_closes_on FROM approval_periods WHERE collector=$1 ORDER BY valid_from`, [ref])).rows;
    const findings = (await pool.query(`SELECT id, opened_on, detail, closed FROM collector_findings WHERE collector=$1 ORDER BY id DESC`, [ref])).rows;
    const last = periods[periods.length - 1];
    const expiring = last && (new Date(last.valid_to) - new Date()) / 86400000 <= 14;
    return c.json({
      reference: r.reference, name: r.current_name, country: r.country,
      registration: r.registration, registration_expiry: r.registration_expiry,
      collection_site_types: r.site_types || [], declared_streams: r.streams || [],
      scheme_status: r.scheme_status,
      findings: findings.map((f) => ({ id: f.id, opened_on: f.opened_on, closed: f.closed, detail: f.detail })),
      approval_periods: periods.map((p) => ({
        state: p.state, valid_from: p.valid_from, valid_to: p.valid_to,
        condition: p.condition || null, condition_closes_on: p.condition_closes_on || null,
        expiring: !!expiring && p === last
      }))
    });
  });

  app.post('/api/collectors/:reference/approvals', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('quality_manager')) throw new HttpError(403, 'quality_manager_required');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    const { state, valid_from, valid_to } = body;
    if (!['approved','conditional','suspended','lapsed'].includes(state)) throw new HttpError(400, 'invalid_state');
    if (!valid_from || !valid_to) throw new HttpError(400, 'valid_from_and_valid_to_required');
    if (state === 'conditional' && !body.condition) throw new HttpError(400, 'condition_required_for_conditional');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `collectors:${ref}:approvals`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const ins = await client.query(
        `INSERT INTO approval_periods (collector,state,valid_from,valid_to,condition,condition_closes_on)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [ref, state, valid_from, valid_to, body.condition || null, body.condition_closes_on || null]);
      await record(client, { kind: 'collector_approved', object_ref: ref, actor: s.email, content: { state, valid_from, valid_to, condition: body.condition || null, condition_closes_on: body.condition_closes_on || null } });
      const response = { reference: ref, id: ins.rows[0].id, state, valid_from, valid_to, condition: body.condition || null, condition_closes_on: body.condition_closes_on || null };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });
}
