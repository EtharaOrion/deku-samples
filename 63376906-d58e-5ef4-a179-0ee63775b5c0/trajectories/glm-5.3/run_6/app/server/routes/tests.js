import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore } from '../lib/idem.js';

export async function register({ app, pool }) {
  app.post('/api/test-results', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('lab_analyst')) throw new HttpError(403, 'lab_analyst_required');
    const body = await c.req.json().catch(() => ({}));
    if (!body.subject || !body.property || !body.method || !body.instrument || body.value == null || !body.unit || body.uncertainty_bp == null) {
      throw new HttpError(400, 'missing_fields');
    }
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, 'test-results', body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const spec = (await client.query(`SELECT * FROM specifications WHERE grade='N6' AND current ORDER BY version DESC LIMIT 1`)).rows[0];
      const row = spec ? (spec.rows || []).find((r) => r.property === body.property) : null;
      const methodMismatch = row ? row.method !== body.method : false;
      const r = await client.query(
        `INSERT INTO test_results (subject,property,method,instrument,analyst,value,unit,uncertainty_bp,method_mismatch,usable_for_release)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [body.subject, body.property, body.method, body.instrument, s.email, Number(body.value), body.unit,
         Number(body.uncertainty_bp), methodMismatch, !methodMismatch]);
      await record(client, { kind: 'test_result', object_ref: body.subject, actor: s.email, content: { property: body.property, method: body.method, value: Number(body.value), unit: body.unit, uncertainty_bp: Number(body.uncertainty_bp) } });
      const response = {
        id: r.rows[0].id, subject: body.subject, property: body.property, method: body.method,
        instrument: body.instrument, analyst: s.email, value: Number(body.value), unit: body.unit,
        uncertainty_bp: Number(body.uncertainty_bp),
        method_mismatch: methodMismatch, usable_for_release: !methodMismatch,
        specification_method: row ? row.method : null
      };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.post('/api/lots/:reference/disposition', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('quality_manager')) throw new HttpError(403, 'quality_manager_required');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    if (!['pending','released','quarantined','rejected'].includes(body.disposition)) throw new HttpError(400, 'invalid_disposition');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `lots:${ref}:disposition`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const lot = (await client.query(`SELECT * FROM lots WHERE reference=$1 FOR UPDATE`, [ref])).rows[0];
      if (!lot) throw new HttpError(404, 'lot_not_found');
      // separation: whoever entered a test result does not disposition that lot
      const tr = (await client.query(`SELECT count(*)::int AS n FROM test_results WHERE analyst=$1 AND subject=$2`, [s.email, ref])).rows[0].n;
      if (tr > 0) throw new HttpError(403, 'analyst_not_dispositioner', {
        message: 'Whoever entered a test result on this lot may not set its disposition. An override records the separation if it was broken.'
      });
      const openDev = (await client.query(`SELECT reference, subjects FROM deviations WHERE state='open'`)).rows
        .filter((d) => Array.isArray(d.subjects) && d.subjects.includes(ref));
      if (openDev.length) throw new HttpError(409, 'open_deviation', {
        message: 'A deviation touching this lot is open.',
        deviations: openDev.map((d) => d.reference)
      });
      await client.query(`UPDATE lots SET disposition=$1, disposition_by=$2, disposition_on=CURRENT_DATE WHERE reference=$3`,
        [body.disposition, s.email, ref]);
      await record(client, { kind: 'disposition_set', object_ref: ref, actor: s.email, content: { disposition: body.disposition } });
      const response = { reference: ref, disposition: body.disposition, set_by: s.email };
      await idemStore(client, guard, 200, response);
      return c.json(response);
    });
  });
}
