import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore } from '../lib/idem.js';
import { weightedBp } from '../lib/units.js';
import { contentOfLot } from '../lib/ledger.js';

export async function register({ app, pool }) {
  app.post('/api/lots/:reference/blend', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('claims_manager')) throw new HttpError(403, 'claims_manager_required');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    if (!body.with_lot) throw new HttpError(400, 'with_lot_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `lots:${ref}:blend`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const a = (await client.query(`SELECT * FROM lots WHERE reference=$1`, [ref])).rows[0];
      const b = (await client.query(`SELECT * FROM lots WHERE reference=$1`, [body.with_lot])).rows[0];
      if (!a || !b) throw new HttpError(404, 'lot_not_found');
      const ca = await contentOfLot(client, ref);
      const cb = await contentOfLot(client, body.with_lot);
      const total = a.mass_g + b.mass_g;
      const blended = weightedBp(a.mass_g, ca.content_bp, b.mass_g, cb.content_bp);
      // weaker of the two claim types; both sites named when they differ
      const order = ['physically_segregated','controlled_blending','mass_balance'];
      const claimType = order.indexOf(a.claim_type) >= order.indexOf(b.claim_type) ? a.claim_type : b.claim_type;
      const sites = a.site === b.site ? [a.site] : [a.site, b.site];
      // provisional factor flag of the weaker of the two
      const fa = (await client.query(`SELECT * FROM conversion_factors WHERE site=$1 ORDER BY provisional ASC, published_on DESC LIMIT 1`, [a.site])).rows[0];
      const fb = (await client.query(`SELECT * FROM conversion_factors WHERE site=$1 ORDER BY provisional ASC, published_on DESC LIMIT 1`, [b.site])).rows[0];
      const provisional = !!(fa && fa.provisional) || !!(fb && fb.provisional);
      const grade = a.grade;
      const n = (await client.query(`SELECT count(*)::int AS n FROM lots WHERE grade=$1`, [grade])).rows[0].n + 1;
      const newRef = `LOT-${grade}-${String(n).padStart(4, '0')}`;
      await client.query(
        `INSERT INTO lots (reference,site,grade,mass_g,disposition,claim_type,produced_by,flags,created_by)
         VALUES ($1,$2,$3,$4,'pending',$5,NULL,$6,$7)`,
        [newRef, sites[0], grade, total, claimType,
         JSON.stringify([`blended:${ref}`, `blended:${body.with_lot}`, ...(provisional ? ['provisional_factor'] : [])]), s.email]);
      await record(client, { kind: 'lot_blended', object_ref: newRef, actor: s.email, site: sites[0], content: { from: [ref, body.with_lot], masses: [a.mass_g, b.mass_g], content_bp: blended } });
      const response = {
        reference: newRef, mass_g: total, content_bp: blended,
        claim_type: claimType, sites, provisional_factor: provisional,
        inputs: [
          { lot: ref, mass_g: a.mass_g, content_bp: ca.content_bp },
          { lot: body.with_lot, mass_g: b.mass_g, content_bp: cb.content_bp }
        ],
        derivation: {
          content_bp: '(mass_a * content_a + mass_b * content_b) / (mass_a + mass_b), floored'
        }
      };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  // byproduct shares
  app.get('/api/outputs/:reference/byproduct-share', async (c) => {
    const s = requireSession(c);
    const ref = c.req.param('reference');
    const o = (await pool.query(`SELECT * FROM outputs WHERE reference=$1`, [ref])).rows[0];
    if (!o) throw new HttpError(404, 'output_not_found');
    if (o.kind !== 'byproduct') throw new HttpError(409, 'not_a_byproduct');
    const totalOut = (await pool.query(`SELECT COALESCE(SUM(mass_g),0)::int AS s FROM outputs WHERE run=$1`, [o.run])).rows[0].s;
    const share = Math.floor(o.mass_g * 10000 / totalOut);
    // claim and emissions share of the run's inputs
    const cons = (await pool.query(`SELECT * FROM consumptions WHERE run=$1 AND input_kind='batch'`, [o.run])).rows;
    let claim = 0;
    for (const cs of cons) {
      const m = (await pool.query(`SELECT COALESCE(SUM(mass_g),0)::int AS s FROM credit_movements WHERE movement_ref=$1 AND direction='in' AND kind='consumption'`, [cs.input_ref])).rows[0].s;
      claim += Math.floor(m * cs.mass_g / (cs.mass_g || 1));
    }
    const period = (await pool.query(`SELECT period FROM runs WHERE reference=$1`, [o.run])).rows[0];
    const fig = period ? (await pool.query(`SELECT * FROM carbon_figures WHERE period=$1 AND superseded_by IS NULL LIMIT 1`, [period.period])).rows[0] : null;
    return c.json({
      output: ref, kind: 'byproduct', disposition: o.disposition,
      mass_g: o.mass_g, total_output_mass_g: totalOut,
      share_bp: share,
      claim_share_g: Math.floor(claim * share / 10000),
      emissions_share_mg: fig ? Math.floor(fig.value_mg_per_kg * share / 10000) : null,
      allocation_basis: 'mass',
      derivation: {
        share_bp: 'byproduct_mass_g * 10000 / total_output_mass_g, floored, on the period allocation basis of mass'
      }
    });
  });
}
