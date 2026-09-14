import { Hono } from 'hono';
import { q, tx } from '../db.js';
import { requireSession } from '../auth.js';
import { idempotent, readBody, refuse, recordTx, requireKeys, refusePagination, readAt } from '../lib/http.js';
import { sendMail } from '../lib/mail.js';
import { nowIso, floorDiv } from '../lib/util.js';
import { loadGraph, batchFlags, CUSTODY_KINDS } from '../lib/engine.js';

const misc = new Hono();

// ---- inbound sources ----
misc.post('/inbound/:source', async (c) => {
  const source = c.req.param('source');
  if (!['weighbridge', 'control_system', 'laboratory', 'customer_reporting'].includes(source)) {
    refuse(400, 'unknown_source');
  }
  return idempotent(c, async () => {
    const raw = await c.req.raw.clone().text();
    const body = await readBody(c);
    const verbatim = raw;
    const ref = await (async () => {
      const r = await q('INSERT INTO ref_seq (kind, n) VALUES ($1, 1) ON CONFLICT (kind) DO UPDATE SET n = ref_seq.n + 1 RETURNING n', ['ib']);
      return 'IB-' + String(r.rows[0].n).padStart(4, '0');
    })();
    await tx(async (client) => {
      await client.query('INSERT INTO inbound_record (source, received_at, payload_verbatim, payload, reference) VALUES ($1,$2,$3,$4,$5)',
        [source, body.received_at || nowIso(), verbatim, JSON.stringify(body.payload || body), ref]);
      await recordTx(client, { person: 'system', act: 'inbound_record_received', object: ref, payload: { source, reference: ref } });
    });
    return { reference: ref };
  });
});

misc.get('/inbound', async (c) => {
  const r = await q('SELECT * FROM inbound_record ORDER BY id');
  return c.json(r.rows.map((x) => ({ reference: x.reference, source: x.source, received_at: x.received_at, payload_verbatim: x.payload_verbatim })));
});

// ---- reconciliation: six figures, no verdicts ----
misc.get('/reconciliation', async (c) => {
  const G = await loadGraph();
  const consTotal = (await q('SELECT COALESCE(SUM(mass_g),0)::bigint AS m FROM consumption')).rows[0].m;
  const outTotal = (await q('SELECT COALESCE(SUM(mass_g),0)::bigint AS m FROM output')).rows[0].m;
  const lotsTotal = (await q('SELECT COALESCE(SUM(mass_g),0)::bigint AS m FROM lot')).rows[0].m;
  const openRuns = (await q('SELECT COUNT(*)::int AS n FROM run WHERE closed = false')).rows[0].n;
  const brokenCustody = [];
  for (const b of G.batches) {
    const kinds = (b.custody || []).map((k) => k.kind);
    if (CUSTODY_KINDS.some((k) => !kinds.includes(k))) brokenCustody.push(b.reference);
  }
  const supersededFigs = (await q(`SELECT COUNT(*)::int AS n FROM certificate c JOIN carbon_figure f ON f.lot = (c.lots->0->>'reference') WHERE f.superseded = true`)).rows[0].n;
  const inbound = await q('SELECT source, MAX(received_at) AS latest FROM inbound_record GROUP BY source');
  const ages = {};
  for (const src of ['weighbridge', 'control_system', 'laboratory', 'customer_reporting']) {
    const row = inbound.rows.find((r) => r.source === src);
    if (!row || !row.latest) { ages[src] = null; continue; }
    const hours = (Date.now() - new Date(row.latest).getTime()) / 3600000;
    ages[src] = Math.max(0, Math.round(hours * 10) / 10);
  }
  return c.json({
    mass_balance_residual_g: Number(consTotal) - Number(outTotal),
    credit_margin_g: 0,
    consumptions_on_open_runs: openRuns,
    batches_with_broken_custody: brokenCustody,
    certificates_with_superseded_figures: supersededFigs,
    integration_ages: ages,
    read_at: readAt()
  });
});

// ---- enquiries (public) ----
const ENQ = {
  waste_supply: { destination: 'feedstock@example.com', response_days: 3 },
  polymer_purchase: { destination: 'sales@example.com', response_days: 2 },
  partnership: { destination: 'partners@example.com', response_days: 5 },
  press: { destination: 'press@example.com', response_days: 1 }
};

misc.post('/enquiries', async (c) => {
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['type', 'email']);
    const cfg = ENQ[body.type];
    if (!cfg) refuse(400, 'unknown_enquiry_type', { available: Object.keys(ENQ) });
    const ref = await (async () => {
      const r = await q('INSERT INTO ref_seq (kind, n) VALUES ($1, 1) ON CONFLICT (kind) DO UPDATE SET n = ref_seq.n + 1 RETURNING n', ['enq']);
      return 'ENQ-' + String(r.rows[0].n).padStart(4, '0');
    })();
    const deadline = body.type === 'press'
      ? new Date(Date.now() + cfg.response_days * 86400000).toISOString().slice(0, 10)
      : null;
    await tx(async (client) => {
      await client.query('INSERT INTO enquiry (reference, type, name, email, message, destination, response_days, created_on, deadline) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [ref, body.type, body.name || '', body.email, body.message || '', cfg.destination, cfg.response_days, nowIso().slice(0, 10), deadline]);
      if (body.type === 'waste_supply') {
        await client.query('INSERT INTO enquiry_record (reference, kind, detail) VALUES ($1,$2,$3)', [ref, 'collector_record', JSON.stringify({ email: body.email })]);
      }
      if (body.type === 'polymer_purchase') {
        await client.query('INSERT INTO enquiry_record (reference, kind, detail) VALUES ($1,$2,$3)', [ref, 'conformance_record', JSON.stringify({ email: body.email })]);
      }
      await recordTx(client, { person: body.email, act: 'enquiry_received', object: ref, payload: { type: body.type, destination: cfg.destination } });
    });
    try {
      await sendMail(body.email, 'Enquiry ' + ref + ' received',
        'Enquiry ' + ref + ' received.\n\nDestination: ' + cfg.destination + '\nStated response time: ' + cfg.response_days + ' working days.');
    } catch (e) { /* the enquiry is recorded even if mail fails */ }
    return { reference: ref, destination: cfg.destination, response_days: cfg.response_days };
  });
});

// ---- health ----
misc.get('/health', async (c) => {
  try {
    await q('SELECT 1');
    return c.json({ status: 'ok', ready: true });
  } catch {
    return c.json({ status: 'degraded', ready: false }, 503);
  }
});

export default misc;
