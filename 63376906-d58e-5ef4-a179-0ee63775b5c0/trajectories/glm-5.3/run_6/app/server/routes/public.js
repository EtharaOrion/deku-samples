import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';

export async function register({ app, pool }) {
  app.get('/api/statistics', async (c) => {
    const r = await pool.query(`SELECT key, value, source, year, geography FROM statistics ORDER BY key`);
    return c.json(r.rows);
  });
  app.get('/api/positions', async (c) => {
    const r = await pool.query(`SELECT id, title, location, department, contract_type, closes_on FROM positions ORDER BY id`);
    return c.json(r.rows);
  });
  app.get('/api/news', async (c) => {
    const r = await pool.query(`SELECT id, tag, title, outlet, published_on, link, language FROM news_items ORDER BY published_on DESC`);
    return c.json(r.rows.map((x) => ({ ...x, coverage: { outlet: x.outlet, language: x.language, link: x.link } })));
  });
  app.get('/api/claim-register', async (c) => {
    const s = c.get('session');
    if (!s) {
      const rows = (await pool.query(`SELECT * FROM claim_substantiations WHERE NOT withdrawn ORDER BY id`)).rows;
      return c.json(rows.map((x) => ({
        claim: x.claim, route: x.route, first_published_on: x.first_published_on,
        evidence: x.evidence, method_version: x.method_version, approver: x.approver, review_on: x.review_on,
        evidence_expires_before_review: false
      })));
    }
    const rows = (await pool.query(`SELECT * FROM claim_substantiations ORDER BY id`)).rows;
    return c.json(rows.map((x) => ({
      claim: x.claim, route: x.route, first_published_on: x.first_published_on,
      evidence: x.evidence, method_version: x.method_version, approver: x.approver, review_on: x.review_on,
      withdrawn: x.withdrawn,
      evidence_expires_before_review: false
    })));
  });
}
