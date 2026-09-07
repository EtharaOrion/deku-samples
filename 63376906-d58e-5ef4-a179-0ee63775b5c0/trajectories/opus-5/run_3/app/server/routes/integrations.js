import { Hono } from 'hono';
import { rq, rq1, tx } from '../db/pool.js';
import { appendEntry } from '../lib/record.js';
import { idempotent, refuse, requireSession, refusePaging, consistentRead } from '../lib/http.js';
import { lotGenealogy, batchImpact } from '../engine/genealogy.js';
import { nextRef } from './operations.js';

export const integrations = new Hono();

const SOURCES = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];

/** Four sources send records into this system and none of them is called out
 *  to. Every one of them reaches the app the same way. */
integrations.post('/inbound/:source', async (c) => {
  const source = c.req.param('source');
  if (!SOURCES.includes(source)) {
    throw refuse(400, 'unknown_source', `An inbound source is one of ${SOURCES.join(', ')}.`, { received: source });
  }
  // The bytes exactly as they arrived, before anything parses them.
  const raw = await c.req.text();
  let body;
  try { body = JSON.parse(raw || '{}'); } catch {
    throw refuse(400, 'malformed_payload', 'An inbound record carries a JSON body with received_at and payload.');
  }
  if (!body.payload) throw refuse(400, 'missing_field', 'An inbound record carries a payload.');

  const result = await idempotent(c, `POST /api/inbound/${source}`, body, async () => tx(async (client) => {
    const ref = await nextRef(client, 'inbound_record', 'reference', 'INB-');
    const verbatim = typeof body.payload === 'string' ? body.payload : JSON.stringify(body.payload);
    await client.query(
      `INSERT INTO inbound_record (reference,source,received_at,payload,payload_verbatim) VALUES ($1,$2,$3,$4,$5)`,
      [ref, source, body.received_at || new Date().toISOString(),
        typeof body.payload === 'string' ? JSON.stringify({ raw: body.payload }) : JSON.stringify(body.payload),
        verbatim]
    );
    await appendEntry(client, {
      act: 'inbound_record_received', object_kind: 'inbound_record', object_ref: ref,
      content: { source, received_at: body.received_at || null },
      event_at: body.received_at || new Date().toISOString()
    });
    return {
      status: 201,
      body: {
        reference: ref, source,
        received_at: body.received_at || new Date().toISOString(),
        payload_verbatim: verbatim,
        note: 'The app opens no outbound connection to any source. It stores what arrives, reconciles it against what the operator recorded, and shows the disagreement rather than resolving it.'
      }
    };
  }));
  return c.json(result.body, result.status);
});

integrations.get('/inbound', async (c) => {
  refusePaging(c);
  const url = new URL(c.req.url);
  const source = url.searchParams.get('source');
  const rows = await rq(
    `SELECT * FROM inbound_record WHERE ($1::text IS NULL OR source = $1) ORDER BY received_at DESC, reference DESC`,
    [source]
  );
  return c.json(rows.map((r) => ({
    reference: r.reference,
    source: r.source,
    received_at: r.received_at,
    // The bytes exactly as they arrived rather than the shape the app parsed
    // them into: a disagreement with a supplier is settled by what came in.
    payload_verbatim: r.payload_verbatim,
    payload: r.payload
  })));
});

async function integrationAges() {
  const rows = await rq(
    `SELECT source, MAX(received_at) AS latest FROM inbound_record GROUP BY source`
  );
  const bySource = new Map(rows.map((r) => [r.source, r.latest]));
  const now = Date.now();
  return SOURCES.map((s) => {
    const latest = bySource.get(s);
    return {
      source: s,
      last_received_at: latest || null,
      // A source that has never sent reports null rather than zero, because a
      // source that stops sending is detected by an age and not by an error.
      age_hours: latest ? Math.floor((now - new Date(latest).getTime()) / 3600000) : null
    };
  });
}

/** Six figures rather than six verdicts. None is a badge and none is styled as
 *  passing. */
integrations.get('/reconciliation', async (c) => {
  requireSession(c);
  const out = await consistentRead(async (client) => {
    // 1. The mass balance residual: mass in minus mass out minus recorded losses
    //    across every closed run. It is expected to be non-zero.
    const residual = await client.query(
      `SELECT COALESCE(SUM(
          (SELECT COALESCE(SUM(mass_g),0) FROM consumption WHERE run = r.reference)
        - (SELECT COALESCE(SUM(mass_g),0) FROM output WHERE run = r.reference)
        - COALESCE(r.losses_g, 0)), 0) AS g
       FROM run r WHERE r.state = 'closed'`
    );

    // 2. The credit margin: what the ledger still holds across every open period.
    const margin = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN cm.direction = 'in' AND cm.fresh_credit THEN cm.mass_g
                                WHEN cm.direction = 'out' THEN -cm.mass_g ELSE 0 END), 0) AS g
         FROM credit_movement cm JOIN balance_period bp ON bp.id = cm.balance_period
        WHERE bp.state = 'open'`
    );

    // 3. Consumptions sitting on runs nobody has closed.
    const openConsumptions = await client.query(
      `SELECT count(*)::int AS n FROM consumption c JOIN run r ON r.reference = c.run WHERE r.state = 'open'`
    );

    // 4. Batches whose custody chain is broken.
    const broken = await client.query(
      `SELECT count(*)::int AS n FROM batch b
        WHERE (SELECT count(DISTINCT kind) FROM custody_link WHERE batch = b.reference) < 6`
    );

    // 5. Certificates carrying a carbon figure that has since been superseded.
    const superseded = await client.query(
      `SELECT count(DISTINCT c.number)::int AS n FROM certificate c
         JOIN jsonb_array_elements(c.lots) l ON true
         JOIN carbon_figure f ON f.lot = l->>'reference'
        WHERE f.superseded_by IS NOT NULL AND c.carbon->>'method_version' = (f.method || ' v' || f.method_version)`
    );

    const history = await client.query(
      `SELECT bp.id, bp.period_from, bp.period_to, bp.state,
              COALESCE(SUM(CASE WHEN cm.direction = 'in' AND cm.fresh_credit THEN cm.mass_g
                                WHEN cm.direction = 'out' THEN -cm.mass_g ELSE 0 END), 0) AS margin_g
         FROM balance_period bp LEFT JOIN credit_movement cm ON cm.balance_period = bp.id
        GROUP BY bp.id, bp.period_from, bp.period_to, bp.state
        ORDER BY bp.period_from DESC LIMIT 4`
    );

    return {
      mass_balance_residual_g: Number(residual.rows[0].g),
      credit_margin_g: Number(margin.rows[0].g),
      consumptions_on_open_runs: openConsumptions.rows[0].n,
      batches_with_broken_custody: broken.rows[0].n,
      certificates_with_superseded_figures: superseded.rows[0].n,
      integration_ages: await integrationAges(),
      // This period against the last three, rather than a status.
      history: history.rows.map((h) => ({
        balance_period: h.id,
        period_from: String(h.period_from).slice(0, 10),
        period_to: String(h.period_to).slice(0, 10),
        state: h.state,
        credit_margin_g: Number(h.margin_g)
      })),
      note: 'These are six figures, not six verdicts. The mass balance residual is expected to be non-zero.'
    };
  });
  return c.json(out);
});

// -------------------------------------------------------------- genealogy

integrations.get('/lots/:reference/genealogy', async (c) => {
  requireSession(c);
  // A complete set by contract: it refuses a page rather than honouring it.
  refusePaging(c);
  const g = await lotGenealogy(c.req.param('reference'));
  if (!g) throw refuse(404, 'no_such_lot', `No lot is recorded at ${c.req.param('reference')}.`);
  return c.json({ ...g, read_at: new Date().toISOString() });
});

integrations.get('/batches/:reference/impact', async (c) => {
  requireSession(c);
  refusePaging(c);
  const i = await batchImpact(c.req.param('reference'));
  if (!i) throw refuse(404, 'no_such_batch', `No batch is recorded at ${c.req.param('reference')}.`);
  return c.json({ ...i, read_at: new Date().toISOString() });
});

integrations.post('/annotations', async (c) => {
  const session = requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  if (!body.object_ref || !body.note) {
    throw refuse(400, 'missing_field', 'An annotation names the object it is against and carries a note.');
  }
  const result = await idempotent(c, 'POST /api/annotations', body, async () => tx(async (client) => {
    const r = await client.query(
      `INSERT INTO annotation (object_kind,object_ref,note,author) VALUES ($1,$2,$3,$4) RETURNING id`,
      [body.object_kind || 'unknown', body.object_ref, body.note, session.email]
    );
    await appendEntry(client, {
      act: 'annotation_added', person: session.email, object_kind: body.object_kind || 'unknown',
      object_ref: body.object_ref, content: { note: body.note }
    });
    return { status: 201, body: { reference: `ANN-${r.rows[0].id}`, object_ref: body.object_ref, note: body.note, author: session.email } };
  }));
  return c.json(result.body, result.status);
});

integrations.get('/annotations', async (c) => {
  requireSession(c);
  const rows = await rq('SELECT * FROM annotation ORDER BY id');
  return c.json(rows.map((a) => ({
    reference: `ANN-${a.id}`, object_kind: a.object_kind, object_ref: a.object_ref,
    note: a.note, author: a.author, recorded_at: a.recorded_at
  })));
});
