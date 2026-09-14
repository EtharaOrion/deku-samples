import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore, refusePagination } from '../lib/idem.js';
import { floorDiv } from '../lib/units.js';

export async function register({ app, pool }) {
  app.get('/api/restatements', async (c) => {
    refusePagination(c.req.query());
    requireSession(c);
    const rows = (await pool.query(`SELECT * FROM restatements ORDER BY reference`)).rows;
    return c.json(rows);
  });

  app.post('/api/balance-periods/:id/restatements', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('claims_manager')) throw new HttpError(403, 'claims_manager_required');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    if (!body.reason) throw new HttpError(400, 'reason_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `balance:${id}:restatements`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const bp = (await client.query(`SELECT * FROM balance_periods WHERE id=$1`, [id])).rows[0];
      if (!bp) throw new HttpError(404, 'balance_period_not_found');
      const n = (await client.query(`SELECT count(*)::int AS n FROM restatements`)).rows[0].n + 1;
      const ref = `RST-${String(n).padStart(4, '0')}`;
      // enumerate every certificate issued from the period
      const certs = (await client.query(`SELECT * FROM certificates WHERE period=$1 ORDER BY number`, [id])).rows;
      const affected = certs.map((x) => x.number);
      let contentMovements = null;
      if (body.revised_factor_bp != null) {
        // recompute the content each certificate would carry under the revised factor
        const factor = await client.query(`SELECT * FROM conversion_factors WHERE site=$1 AND NOT provisional ORDER BY published_on DESC LIMIT 1`, [bp.site]);
        const f = factor.rows[0];
        contentMovements = certs.map((cert) => {
          const oldBp = cert.content_bp;
          const ratio = f && f.factor_bp ? floorDiv(Number(body.revised_factor_bp) * 10000, f.factor_bp) : 10000;
          const corrected = floorDiv(oldBp * ratio, 10000);
          return { certificate: cert.number, content_bp: oldBp, corrected_content_bp: corrected };
        });
      }
      await client.query(
        `INSERT INTO restatements (reference,period,reason,opened_by,opened_on,revised_factor_bp,affected_certificates,content_movements,state)
         VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,'open')`,
        [ref, id, body.reason, s.email, body.revised_factor_bp != null ? Number(body.revised_factor_bp) : null,
         JSON.stringify(affected), contentMovements ? JSON.stringify(contentMovements) : null]);
      await record(client, { kind: 'restatement_opened', object_ref: ref, actor: s.email, site: bp.site, content: { period: id, reason: body.reason, affected_certificates: affected } });
      const response = { reference: ref, period: id, reason: body.reason, affected_certificates: affected, content_movements: contentMovements, state: 'open' };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.post('/api/restatements/:reference/resolutions', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('claims_manager')) throw new HttpError(403, 'claims_manager_required');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    if (!body.certificate || !body.outcome || !body.reason) throw new HttpError(400, 'certificate_outcome_reason_required');
    if (!['reissued','withdrawn','unaffected'].includes(body.outcome)) throw new HttpError(400, 'invalid_outcome');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `restatements:${ref}:resolutions`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const rs = (await client.query(`SELECT * FROM restatements WHERE reference=$1 FOR UPDATE`, [ref])).rows[0];
      if (!rs) throw new HttpError(404, 'restatement_not_found');
      if (!(rs.affected_certificates || []).includes(body.certificate)) {
        throw new HttpError(409, 'certificate_not_in_restatement', {
          message: 'That certificate is not enumerated by this restatement.',
          affected_certificates: rs.affected_certificates
        });
      }
      const existing = (await client.query(`SELECT id FROM resolutions WHERE restatement=$1 AND certificate=$2`, [ref, body.certificate])).rows;
      if (existing.length) throw new HttpError(409, 'already_resolved', {
        message: 'Each affected certificate takes exactly one resolution in a restatement.'
      });
      const ins = await client.query(
        `INSERT INTO resolutions (restatement,certificate,outcome,reason,recorded_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [ref, body.certificate, body.outcome, body.reason, s.email]);
      await record(client, { kind: 'resolution_recorded', object_ref: ref, actor: s.email, content: { certificate: body.certificate, outcome: body.outcome } });
      const response = { id: ins.rows[0].id, restatement: ref, certificate: body.certificate, outcome: body.outcome };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });
}
