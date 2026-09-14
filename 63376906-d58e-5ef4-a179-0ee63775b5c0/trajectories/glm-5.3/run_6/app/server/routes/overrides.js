import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore, refusePagination } from '../lib/idem.js';

export async function register({ app, pool }) {
  app.get('/api/overrides', async (c) => {
    refusePagination(c.req.query());
    requireSession(c);
    const rows = (await pool.query(`SELECT * FROM overrides ORDER BY reference`)).rows;
    return c.json(rows.map((o) => ({
      reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot,
      authorised_by: o.authorised_by, authorised_on: o.authorised_on,
      reviewed: o.reviewed, reviewed_by: o.reviewed_by, reviewed_at: o.reviewed_at
    })));
  });

  app.post('/api/overrides', async (c) => {
    const s = requireSession(c);
    if (!s.roles.some((r) => ['quality_manager','claims_manager'].includes(r))) throw new HttpError(403, 'forbidden_role');
    const body = await c.req.json().catch(() => ({}));
    if (!body.separation || !body.reason || !body.lot || !body.authorised_by) throw new HttpError(400, 'missing_fields');
    if (String(body.reason).trim().length < 40) throw new HttpError(400, 'reason_too_short', {
      message: 'An override reason must be at least forty characters.',
      minimum_characters: 40
    });
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, 'overrides', body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const n = (await client.query(`SELECT count(*)::int AS n FROM overrides`)).rows[0].n + 1;
      const ref = `OVR-${String(n).padStart(4, '0')}`;
      await client.query(
        `INSERT INTO overrides (reference,separation,reason,lot,authorised_by,authorised_on,reviewed)
         VALUES ($1,$2,$3,$4,$5,$6,false)`,
        [ref, body.separation, body.reason, body.lot, body.authorised_by, body.authorised_on || new Date().toISOString().slice(0, 10)]);
      await record(client, { kind: 'override_recorded', object_ref: ref, actor: s.email, content: { separation: body.separation, lot: body.lot, authorised_by: body.authorised_by } });
      const response = { reference: ref, separation: body.separation, lot: body.lot, reviewed: false };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.post('/api/overrides/:reference/review', async (c) => {
    const s = requireSession(c);
    if (!s.roles.some((r) => ['quality_manager','claims_manager'].includes(r))) throw new HttpError(403, 'forbidden_role');
    const ref = c.req.param('reference');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `overrides:${ref}:review`, {});
      if (guard.replay) return c.json(guard.response, guard.status);
      const o = (await client.query(`SELECT * FROM overrides WHERE reference=$1 FOR UPDATE`, [ref])).rows[0];
      if (!o) throw new HttpError(404, 'override_not_found');
      if (o.authorised_by === s.email) {
        throw new HttpError(403, 'reviewer_must_not_be_authoriser', {
          message: 'A review is refused for the person who authorised the override.'
        });
      }
      if (o.reviewed) throw new HttpError(409, 'already_reviewed');
      await client.query(`UPDATE overrides SET reviewed=true, reviewed_by=$1, reviewed_at=now() WHERE reference=$2`, [s.email, ref]);
      await record(client, { kind: 'override_reviewed', object_ref: ref, actor: s.email, content: { override: ref } });
      const response = { reference: ref, reviewed: true, reviewed_by: s.email };
      await idemStore(client, guard, 200, response);
      return c.json(response);
    });
  });
}
