import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore } from '../lib/idem.js';
import { floorDiv } from '../lib/units.js';

export async function register({ app, pool }) {
  app.get('/api/conversion-factors', async (c) => {
    requireSession(c);
    const rows = (await pool.query(`SELECT * FROM conversion_factors ORDER BY site, published_on DESC`)).rows;
    return c.json(rows.map((f) => ({
      reference: f.reference, site: f.site, factor_bp: f.factor_bp,
      derived_from: f.derived_from, derived_to: f.derived_to,
      derived_in_g: f.derived_in_g, derived_out_g: f.derived_out_g,
      provisional: f.provisional, published_by: f.published_by, published_on: f.published_on,
      derivation: f.provisional
        ? { description: 'Provisional: no loss history for this site. derived_in_g is zero.' }
        : { description: 'factor_bp = derived_out_g * 10000 / derived_in_g, floored', in_g: f.derived_in_g, out_g: f.derived_out_g }
    })));
  });

  app.post('/api/conversion-factors', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('claims_manager')) throw new HttpError(403, 'claims_manager_required');
    const body = await c.req.json().catch(() => ({}));
    if (!body.site || body.factor_bp == null) throw new HttpError(400, 'site_and_factor_bp_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, 'conversion-factors', body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const in_g = Number(body.derived_in_g || 0);
      const out_g = Number(body.derived_out_g || 0);
      const provisional = in_g === 0;
      if (!provisional) {
        const expect = floorDiv(out_g * 10000, in_g);
        if (Number(body.factor_bp) !== expect) {
          throw new HttpError(400, 'factor_does_not_reconcile', {
            message: 'The factor must equal derived_out_g * 10000 / derived_in_g, floored.',
            submitted_factor_bp: Number(body.factor_bp),
            computed_factor_bp: expect,
            derived_in_g: in_g, derived_out_g: out_g
          });
        }
        if (!body.derived_from || !body.derived_to) throw new HttpError(400, 'derivation_window_required');
      }
      const siteTag = body.site.replace('SITE-', '');
      const n = (await client.query(`SELECT count(*)::int AS n FROM conversion_factors WHERE site=$1`, [body.site])).rows[0].n + 1;
      const ref = `CF-${siteTag}-${n}`;
      await client.query(
        `INSERT INTO conversion_factors (reference,site,factor_bp,derived_from,derived_to,derived_in_g,derived_out_g,provisional,published_by,published_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_DATE)`,
        [ref, body.site, Number(body.factor_bp), body.derived_from || null, body.derived_to || null, in_g, out_g, provisional, s.email]);
      await record(client, { kind: 'conversion_factor_published', object_ref: ref, actor: s.email, site: body.site, content: { factor_bp: Number(body.factor_bp), derived_in_g: in_g, derived_out_g: out_g, provisional } });
      const response = { reference: ref, site: body.site, factor_bp: Number(body.factor_bp), provisional };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });
}
