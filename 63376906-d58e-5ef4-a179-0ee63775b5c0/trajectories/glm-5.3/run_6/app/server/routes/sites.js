import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';

export async function register({ app, pool }) {
  app.get('/api/sites', (c) => {
    const rows = pool.query(`SELECT * FROM sites ORDER BY name`);
    return rows.then((r) => c.json(r.rows.map((s) => ({
      reference: s.reference, name: s.name, confidence: s.confidence,
      certification_state: s.certification_state
    }))));
  });

  app.get('/api/sites/:reference/capacity', (c) => {
    const ref = c.req.param('reference');
    return pool.query(`SELECT * FROM sites WHERE reference=$1`, [ref]).then((r) => {
      if (!r.rows.length) throw new HttpError(404, 'site_not_found');
      const s = r.rows[0];
      return c.json({
        reference: s.reference,
        name: s.name,
        nameplate_kg: s.nameplate_kg,
        basis: s.capacity_basis,
        contracted_kg: s.contracted_kg,
        uncommitted_kg: s.nameplate_kg - s.contracted_kg,
        confidence: s.confidence,
        certification_state: s.certification_state,
        last_revised: s.last_revised,
        derivation: { uncommitted_kg: 'nameplate_kg minus contracted_kg, computed' }
      });
    });
  });
}
