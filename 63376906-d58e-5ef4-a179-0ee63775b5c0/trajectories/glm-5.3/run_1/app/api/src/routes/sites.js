import { Hono } from 'hono';
import { q, one, exec, client } from '../db.js';
import { requireAuth, requireRole, bad, notFound, conflict, forbidden, reqField, enumField, rememberIdempotency } from '../lib/http.js';
import { entry } from '../record.js';

const r = new Hono();
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

r.get('/api/sites', async (c) => {
  const rows = await q('SELECT * FROM sites ORDER BY reference');
  return c.json(rows.map(s => ({
    reference: s.reference, name: s.name, confidence: s.confidence,
    certification_state: s.certification_state,
    capacity: null
  })));
});

r.get('/api/sites/:ref/capacity', async (c) => {
  const s = await one('SELECT * FROM sites WHERE reference = $1', [c.req.param('ref')]);
  if (!s) throw notFound('site_not_found');
  return c.json({
    nameplate_kg: Number(s.nameplate_kg),
    basis: s.capacity_basis,
    contracted_kg: Number(s.contracted_kg),
    uncommitted_kg: Number(s.nameplate_kg) - Number(s.contracted_kg),
    confidence: s.confidence,
    last_revised: isoD(s.last_revised),
    derivation: { uncommitted_kg: 'nameplate_kg minus contracted_kg, computed' }
  });
});

r.get('/api/sites/:ref/certification', async (c) => {
  await requireAuth(c);
  const s = await one('SELECT * FROM sites WHERE reference = $1', [c.req.param('ref')]);
  if (!s) throw notFound('site_not_found');
  const periods = await q('SELECT site, state, valid_from, valid_to, effective_from, lifted, lifted_from FROM site_certifications WHERE site = $1 ORDER BY valid_from', [s.reference]);
  return c.json({
    reference: s.reference, certification_state: s.certification_state,
    periods: periods.map(p => ({
      state: p.state, valid_from: isoD(p.valid_from), valid_to: isoD(p.valid_to),
      effective_from: p.effective_from ? isoD(p.effective_from) : null,
      lifted: p.lifted, lifted_from: p.lifted_from ? isoD(p.lifted_from) : null
    }))
  });
});

// A suspension reaches backwards: it may be recorded with an effective date before today.
r.post('/api/sites/:ref/certification', async (c) => {
  const user = await requireRole(c, 'quality_manager');
  const s = await one('SELECT * FROM sites WHERE reference = $1', [c.req.param('ref')]);
  if (!s) throw notFound('site_not_found');
  const b = await c.req.json();
  const state = enumField(b.state, 'state', ['certified', 'suspended', 'not_certified']);
  const valid_from = reqField(b.valid_from, 'valid_from');
  const valid_to = reqField(b.valid_to, 'valid_to');
  const effective_from = b.effective_from || valid_from;
  const tx = await client();
  let certificates_in_window = [];
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO site_certifications (site, state, valid_from, valid_to, effective_from) VALUES ($1,$2,$3,$4,$5)`,
      [s.reference, state, valid_from, valid_to, effective_from]);
    await tx.query(`UPDATE sites SET certification_state=$2 WHERE reference=$1`, [s.reference, state]);
    if (state === 'suspended') {
      const certs = await q(`SELECT * FROM certificates WHERE site=$1 AND signed_at::date BETWEEN $2 AND $3 ORDER BY number`,
        [s.reference, effective_from, valid_to]);
      certificates_in_window = certs.map(x => ({
        number: x.number, state: x.state, resolution: 'to_be_resolved',
        outcomes_available: ['reissued', 'withdrawn', 'unaffected']
      }));
    }
    const e = await entry(tx, { person: user.email, site: s.reference, object: s.reference, act: 'site_certification_recorded',
      content: { site: s.reference, state, valid_from, valid_to, effective_from, certificates_in_window } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: s.reference, site: s.reference, state, effective_from, certificates_in_window, record_seq: e.seq });
    return c.json({ reference: s.reference, site: s.reference, state, valid_from, valid_to, effective_from,
      certificates_in_window, issuing_stopped: state === 'suspended', record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

export default r;
