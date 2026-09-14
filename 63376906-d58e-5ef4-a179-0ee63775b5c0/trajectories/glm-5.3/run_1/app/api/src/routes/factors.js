import { Hono } from 'hono';
import { q, one, client } from '../db.js';
import { requireAuth, requireRole, bad, notFound, conflict, forbidden, reqField, intField, rememberIdempotency } from '../lib/http.js';
import { entry } from '../record.js';
import { factorFromWindow } from '../engine/int.js';

const r = new Hono();
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

// The factor is the arithmetic of a stated window rather than a number somebody chose.
r.post('/api/conversion-factors', async (c) => {
  const user = await requireRole(c, 'claims_manager');
  const b = await c.req.json();
  const site = reqField(b.site, 'site');
  const factor_bp = intField(b.factor_bp, 'factor_bp');
  const derived_in_g = intField(b.derived_in_g, 'derived_in_g');
  const derived_out_g = intField(b.derived_out_g, 'derived_out_g');
  const provisional = derived_in_g === 0;
  if (!provisional) {
    const expected = factorFromWindow(derived_out_g, derived_in_g);
    if (factor_bp !== expected) {
      throw conflict('factor_does_not_reconcile', {
        rule: 'factor_bp equals derived_out_g * 10000 / derived_in_g, floored',
        factor_bp, derived_in_g, derived_out_g, expected_factor_bp: expected
      });
    }
  }
  const ref = reqField(b.reference, 'reference');
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO conversion_factors (reference, site, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [ref, site, factor_bp, b.derived_from || null, b.derived_to || null, derived_in_g, derived_out_g, provisional, user.email, isoD(new Date())]);
    const e = await entry(tx, { person: user.email, site, object: ref, act: 'conversion_factor_published',
      content: { reference: ref, site, factor_bp, derived_in_g, derived_out_g, provisional,
        derivation: provisional ? 'provisional: no loss history of its own' : `derived_out_g ${derived_out_g} * 10000 / derived_in_g ${derived_in_g}, floored` } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: ref, factor_bp, provisional, record_seq: e.seq });
    return c.json({ reference: ref, site, factor_bp, provisional, derived_in_g, derived_out_g,
      derivation: provisional ? 'provisional: no window of its own' : `derived_out_g ${derived_out_g} * 10000 / derived_in_g ${derived_in_g}, floored`, record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

export default r;
