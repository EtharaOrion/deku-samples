import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore, refusePagination } from '../lib/idem.js';

export async function register({ app, pool }) {
  app.get('/api/deviations', async (c) => {
    refusePagination(c.req.query());
    requireSession(c);
    const rows = (await pool.query(`SELECT * FROM deviations ORDER BY reference`)).rows;
    return c.json(rows.map((d) => ({
      reference: d.reference, state: d.state, subjects: d.subjects,
      description: d.description, raised_by: d.raised_by, outcome: d.outcome, closed_at: d.closed_at
    })));
  });

  app.post('/api/deviations', async (c) => {
    const s = requireSession(c);
    if (!s.roles.some((r) => ['plant_operator','quality_manager','lab_analyst'].includes(r))) {
      throw new HttpError(403, 'forbidden_role');
    }
    const body = await c.req.json().catch(() => ({}));
    if (!Array.isArray(body.subjects) || !body.subjects.length) throw new HttpError(400, 'subjects_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, 'deviations', body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const n = (await client.query(`SELECT count(*)::int AS n FROM deviations`)).rows[0].n + 1;
      const ref = `DEV-${String(n).padStart(4, '0')}`;
      await client.query(`INSERT INTO deviations (reference,state,subjects,description,raised_by,recorded_at) VALUES ($1,'open',$2,$3,$4,now())`,
        [ref, JSON.stringify(body.subjects), body.description || null, s.email]);
      await record(client, { kind: 'deviation_raised', object_ref: ref, actor: s.email, content: { subjects: body.subjects, description: body.description || null } });
      const response = { reference: ref, state: 'open', subjects: body.subjects };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.post('/api/deviations/:reference/close', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('quality_manager')) throw new HttpError(403, 'quality_manager_required');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    if (!['root_cause_found','cause_not_established'].includes(body.outcome)) throw new HttpError(400, 'invalid_outcome');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `deviations:${ref}:close`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const d = (await client.query(`SELECT * FROM deviations WHERE reference=$1`, [ref])).rows[0];
      if (!d) throw new HttpError(404, 'deviation_not_found');
      if (d.state === 'closed') throw new HttpError(409, 'already_closed');
      await client.query(`UPDATE deviations SET state='closed', outcome=$1, closed_at=now() WHERE reference=$2`, [body.outcome, ref]);
      await record(client, { kind: 'deviation_closed', object_ref: ref, actor: s.email, content: { outcome: body.outcome } });
      const response = { reference: ref, state: 'closed', outcome: body.outcome };
      await idemStore(client, guard, 200, response);
      return c.json(response);
    });
  });
}
