import { Hono } from 'hono';
import { q, one, client } from '../db.js';
import { requireAuth, requireRole, bad, notFound, conflict, reqField, enumField, rememberIdempotency, refusePagination, forbidden } from '../lib/http.js';
import { entry } from '../record.js';
import { sendMail } from '../mail.js';

const r = new Hono();
const iso = (d) => (d instanceof Date ? d.toISOString() : d);

const SOURCES = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];

// The four sources reach the app the same way. The app opens no outbound connection to any of them.
r.post('/api/inbound/:source', async (c) => {
  const user = await requireAuth(c);
  const source = enumField(c.req.param('source'), 'source', SOURCES);
  const b = await c.req.json();
  const received_at = reqField(b.received_at, 'received_at');
  const payload = b.payload;
  if (payload === undefined) throw bad('missing_field', { field: 'payload' });
  const verbatim = JSON.stringify(payload);
  const ref = `INB-${String(Number((await one('SELECT count(*) n FROM inbound_records')).n) + 1).padStart(4, '0')}`;
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO inbound_records (reference, source, received_at, payload_verbatim, parsed)
      VALUES ($1,$2,$3,$4,$5)`, [ref, source, received_at, verbatim, JSON.stringify(payload)]);
    const e = await entry(tx, { person: user.email, site: null, object: ref, act: 'inbound_record_stored',
      content: { reference: ref, source, received_at, payload_verbatim: verbatim } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: ref, source, received_at, record_seq: e.seq });
    return c.json({ reference: ref, source, received_at, record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

// payload_verbatim is the bytes exactly as they arrived, not the shape the app parsed them into.
r.get('/api/inbound', async (c) => {
  refusePagination(c);
  await requireAuth(c);
  const rows = await q('SELECT reference, source, received_at, payload_verbatim FROM inbound_records ORDER BY reference');
  return c.json(rows.map(x => ({
    reference: x.reference, source: x.source,
    received_at: x.received_at ? iso(x.received_at) : null,
    payload_verbatim: x.payload_verbatim
  })));
});

r.get('/api/reconciliation', async (c) => {
  refusePagination(c);
  await requireAuth(c);
  const now = Date.now();
  const ages = {};
  for (const s of SOURCES) {
    const row = await one(`SELECT received_at FROM inbound_records WHERE source=$1 ORDER BY received_at DESC NULLS LAST LIMIT 1`, [s]);
    ages[s] = row?.received_at ? Math.round((now - new Date(row.received_at).getTime()) / 3600000) : null;
  }
  const massIn = await q(`SELECT coalesce(sum(mass_g),0)::bigint m FROM consumptions`);
  const massOut = await q(`SELECT coalesce(sum(mass_g),0)::bigint m FROM outputs`);
  const lotsMass = await q(`SELECT coalesce(sum(mass_g),0)::bigint m FROM lots`);
  const creditIn = Number((await one(`SELECT coalesce(sum(mass_g),0)::bigint m FROM credit_movements WHERE direction='in' AND fresh_credit`)).m);
  const creditOut = Number((await one(`SELECT coalesce(sum(mass_g),0)::bigint m FROM credit_movements WHERE direction='out' AND kind='allocation'`)).m);
  const openRuns = Number((await one(`SELECT count(*) n FROM runs WHERE closed=false`)).n);
  const brokenCustody = Number((await one(`SELECT count(*) n FROM batches b WHERE NOT EXISTS (SELECT 1 FROM custodies c WHERE c.batch=b.reference AND c.kind='transport')`)).n);
  const supersededFigures = Number((await one(`SELECT count(*) n FROM certificates x WHERE EXISTS (SELECT 1 FROM carbon_figures f WHERE f.lot = (x.lots->0->>'lot') AND f.superseded=false AND f.id <> (SELECT max(id) FROM carbon_figures cf WHERE cf.lot=f.lot))`)).n);
  return c.json({
    mass_balance_residual_g: Number(massIn[0].m) - Number(massOut[0].m),
    credit_margin_g: creditIn - creditOut,
    consumptions_on_open_runs: openRuns,
    batches_with_broken_custody: brokenCustody,
    certificates_with_superseded_figures: supersededFigures,
    integration_ages: ages,
    read_at: new Date().toISOString(),
    derivation: {
      mass_balance_residual_g: 'total mass consumed minus total mass produced',
      credit_margin_g: 'fresh credits in minus credits attached to lots',
      integration_ages: 'age in hours of the most recent record from each source; never sent reads null'
    }
  });
});

export default r;
