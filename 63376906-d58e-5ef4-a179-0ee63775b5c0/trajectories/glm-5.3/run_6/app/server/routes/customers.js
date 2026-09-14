import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';

export async function register({ app, pool }) {
  app.get('/api/customers', async (c) => {
    requireSession(c);
    const rows = (await pool.query(`SELECT * FROM parties WHERE kind='customer' ORDER BY reference`)).rows;
    const out = [];
    for (const p of rows) {
      const holds = (await pool.query(`SELECT grade, version FROM spec_issues WHERE customer=$1 ORDER BY issued_on DESC`, [p.reference])).rows;
      out.push({ reference: p.reference, name: p.current_name, contact: p.contact, holds: holds.map((h) => ({ grade: h.grade, version: h.version })) });
    }
    return c.json(out);
  });

  app.get('/api/customers/:reference', async (c) => {
    requireSession(c);
    const ref = c.req.param('reference');
    const p = (await pool.query(`SELECT * FROM parties WHERE reference=$1`, [ref])).rows[0];
    if (!p) throw new HttpError(404, 'customer_not_found');
    const holds = (await pool.query(`SELECT grade, version FROM spec_issues WHERE customer=$1 ORDER BY issued_on DESC`, [ref])).rows;
    const conf = (await pool.query(`SELECT * FROM conformances WHERE customer=$1 ORDER BY id`, [ref])).rows;
    return c.json({
      reference: ref,
      name: p.current_name,
      contact: p.contact,
      application: p.application,
      industry: p.industry,
      holds_specification_version: holds.map((h) => ({ grade: h.grade, version: h.version })),
      conformance: conf.map((x) => ({ application: x.application, grade: x.grade, version: x.version, trials: x.trials, outcome: x.outcome }))
    });
  });
}
