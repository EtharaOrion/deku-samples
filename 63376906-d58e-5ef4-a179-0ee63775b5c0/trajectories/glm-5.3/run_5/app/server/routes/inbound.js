import { Hono } from 'hono';
import { currentSession, hasRole } from '../lib/auth.js';
import { withIdempotency } from '../lib/idempotency.js';
import { appendEntry } from '../lib/record.js';
import { nextReference } from '../db.js';

const r = new Hono();

const SOURCES = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];

r.post('/inbound/:source', async (c) => {
  const db = c.get('db');
  const source = c.req.param('source');
  if (!SOURCES.includes(source)) {
    return Response.json({ error: 'unknown_source', known: SOURCES }, { status: 400 });
  }
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.received_at || body.payload === undefined) {
      return Response.json({ error: 'invalid_request', message: 'received_at and payload are required' }, { status: 400 });
    }
    const reference = await nextReference(db, 'INB-', 4);
    await db.query(
      `INSERT INTO inbound_record (reference,source,received_at,payload_verbatim) VALUES ($1,$2,$3,$4)`,
      [reference, source, body.received_at, JSON.stringify(body.payload)]);
    await appendEntry(db, {
      kind: 'inbound_record_received', object_ref: reference, person: 'system', site: null,
      content: { reference, source, received_at: body.received_at, kept_verbatim: true }
    });
    return Response.json({ reference, source, received_at: body.received_at }, { status: 201 });
  });
});

r.get('/inbound', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM inbound_record ORDER BY received_at')).rows;
  return c.json(rows.map((x) => ({
    reference: x.reference, source: x.source, received_at: x.received_at, payload_verbatim: x.payload_verbatim
  })));
});

// Six figures rather than six verdicts.
r.get('/reconciliation', async (c) => {
  const db = c.get('db');
  const batches = (await db.query('SELECT * FROM batch')).rows;
  const runs = (await db.query('SELECT * FROM run')).rows;
  const consumptions = (await db.query('SELECT * FROM consumption')).rows;
  const outputs = (await db.query('SELECT * FROM output')).rows;
  const certs = (await db.query('SELECT * FROM certificate')).rows;
  const movements = (await db.query('SELECT * FROM credit_movement')).rows;
  const inbound = (await db.query('SELECT source, max(received_at) AS latest FROM inbound_record GROUP BY source')).rows;

  // Mass balance residual: mass booked in minus mass consumed, minus outputs.
  let massIn = 0;
  for (const b of batches) massIn += b.accepted_g;
  let consumed = 0;
  for (const cRow of consumptions) {
    if (cRow.input_kind === 'batch') {
      const b = batches.find((x) => x.reference === cRow.input_ref);
      if (b) consumed += cRow.mass_g;
    } else {
      const o = outputs.find((x) => x.reference === cRow.input_ref);
      if (o) consumed += cRow.mass_g;
    }
  }
  let massOut = 0;
  for (const o of outputs) massOut += o.mass_g;
  const residual = consumed - massOut - runs.reduce((s, run) => s + (run.losses_g || 0), 0);

  let creditMargin = 0;
  for (const m of movements) creditMargin += m.direction === 'in' ? m.mass_g : -m.mass_g;

  const brokenCustody = batches.filter((b) => {
    const kinds = new Set((b.custody || []).map((l) => l.kind));
    return ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'].some((k) => !kinds.has(k));
  }).map((b) => b.reference);

  const supersededFigures = [];
  for (const cert of certs) {
    const lotsArr = cert.lots || [];
    for (const l of lotsArr) {
      const fig = (await db.query(
        'SELECT * FROM carbon_figure WHERE lot=$1 AND superseded=false ORDER BY id DESC LIMIT 1', [l.reference])).rows[0];
      if (fig && cert.carbon && fig.value_mg_per_kg !== cert.carbon.value_mg_per_kg) {
        supersededFigures.push(cert.number);
      }
    }
  }

  const integration_ages = {};
  for (const src of SOURCES) {
    const row = inbound.find((x) => x.source === src);
    integration_ages[src] = row && row.latest
      ? Math.max(0, Math.round((Date.now() - new Date(row.latest).getTime()) / 3600000))
      : null;
  }

  return c.json({
    mass_balance_residual_g: residual,
    credit_margin_g: creditMargin,
    consumptions_on_open_runs: consumptions.filter((cRow) => {
      const run = runs.find((x) => x.reference === cRow.run);
      return run && !run.closed_at;
    }).length,
    batches_with_broken_custody: brokenCustody,
    certificates_with_superseded_figures: [...new Set(supersededFigures)],
    integration_ages,
    read_at: new Date().toISOString()
  });
});

export default r;
