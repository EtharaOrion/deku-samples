import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore } from '../lib/idem.js';

export async function register({ app, pool }) {
  app.get('/api/specifications/:grade/versions/:version', async (c) => {
    requireSession(c);
    const row = (await pool.query(`SELECT * FROM specifications WHERE grade=$1 AND version=$2`,
      [c.req.param('grade'), Number(c.req.param('version'))])).rows[0];
    if (!row) throw new HttpError(404, 'specification_not_found');
    return c.json({
      grade: row.grade, version: row.version, issued_on: row.issued_on,
      virgin_reference: { reference: row.virgin_reference, source: row.virgin_source, date: row.virgin_date },
      rows: row.rows,
      guaranteed_properties: row.rows.filter((r) => r.basis === 'guaranteed').map((r) => r.property)
    });
  });

  app.post('/api/specifications/:grade/versions/:version/issue', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('quality_manager')) throw new HttpError(403, 'quality_manager_required');
    const grade = c.req.param('grade');
    const version = Number(c.req.param('version'));
    const body = await c.req.json().catch(() => ({}));
    if (!body.customer) throw new HttpError(400, 'customer_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `spec:${grade}:${version}:issue`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const spec = (await client.query(`SELECT * FROM specifications WHERE grade=$1 AND version=$2`, [grade, version])).rows[0];
      if (!spec) throw new HttpError(404, 'specification_not_found');
      await client.query(`INSERT INTO spec_issues (grade,version,customer,issued_on) VALUES ($1,$2,$3,CURRENT_DATE)`, [grade, version, body.customer]);
      await record(client, { kind: 'specification_issued', object_ref: `SPEC-${grade}:v${version}`, actor: s.email, content: { customer: body.customer } });
      const response = { grade, version, customer: body.customer, issued_on: new Date().toISOString().slice(0, 10) };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });
}
