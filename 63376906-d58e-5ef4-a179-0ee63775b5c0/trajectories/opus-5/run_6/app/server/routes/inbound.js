import { Hono } from 'hono';
import { q, pool } from '../lib/db.js';
import {
  requireSession, requireAct, withIdempotency, refuse, refusePagination,
  requireFields, nextReference,
} from '../lib/http.js';
import { appendEntry } from '../lib/records.js';
import { batchViews } from '../engine/feedstock.js';
import { periodView, CATEGORIES } from '../engine/ledger.js';

const r = new Hono();

const SOURCES = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];

// Four sources send records into this system and none of them is called out to.
r.post('/inbound/:source', async (c) => {
  const actor = await requireAct(c, 'inbound.post');
  const source = c.req.param('source');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, body, async () => {
    if (!SOURCES.includes(source)) {
      refuse(400, 'unknown_source', { error: 'unknown_source', message: `A source is one of ${SOURCES.join(', ')}.` });
    }
    requireFields(body, ['received_at', 'payload']);
    const reference = await nextReference('INB', 'inbound_record');
    // payload_verbatim is the bytes exactly as they arrived, not the shape the app
    // parsed them into: a disagreement with a supplier is settled by what came in
    const verbatim = typeof body.payload === 'string' ? body.payload : JSON.stringify(body.payload);
    await pool.query(
      'INSERT INTO inbound_record (reference, source, received_at, payload_verbatim, payload) VALUES ($1,$2,$3,$4,$5)',
      [reference, source, body.received_at, verbatim, safeJson(verbatim)]);
    await appendEntry(null, {
      person: actor.email, object_kind: 'inbound_record', object_ref: reference, action: 'received',
      content: { source, received_at: body.received_at, payload_verbatim: verbatim },
    });
    return {
      status: 201,
      body: {
        reference, source, received_at: body.received_at, payload_verbatim: verbatim,
        note: 'The app opens no outbound connection to any of the four. It stores what arrives, reconciles it against what the operator recorded, and shows the disagreement rather than resolving it.',
      },
    };
  });
  return c.json(out.body, out.status);
});

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

r.get('/inbound', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const rows = await q('SELECT * FROM inbound_record ORDER BY received_at ASC');
  return c.json(rows.map((x) => ({
    reference: x.reference,
    source: x.source,
    received_at: x.received_at,
    payload_verbatim: x.payload_verbatim,
    recorded_at: x.recorded_at,
  })));
});

// Six figures rather than six verdicts. None is a badge and none is styled as passing.
r.get('/reconciliation', async (c) => {
  await requireSession(c);
  const [runs, consumptions, outputs, batches, periods, inbound, certs, figures] = await Promise.all([
    q('SELECT * FROM run'),
    q('SELECT * FROM consumption'),
    q('SELECT * FROM output'),
    q('SELECT * FROM batch'),
    q('SELECT * FROM balance_period'),
    q('SELECT * FROM inbound_record'),
    q('SELECT * FROM certificate'),
    q('SELECT * FROM carbon_figure'),
  ]);

  const massIn = consumptions.filter((x) => x.input_kind === 'batch').reduce((s, x) => s + Number(x.mass_g), 0);
  const massOutLots = outputs.filter((o) => o.kind === 'lot' || o.kind === 'byproduct').reduce((s, o) => s + Number(o.mass_g), 0);
  const losses = runs.filter((x) => x.losses_g !== null).reduce((s, x) => s + Number(x.losses_g), 0);
  const massBalanceResidual = massIn - massOutLots - losses;

  let creditMargin = 0;
  const perPeriod = [];
  for (const p of periods) {
    const view = await periodView(p);
    let margin = 0;
    for (const cat of CATEGORIES) margin += view.categories[cat].credits_available_g;
    creditMargin += margin;
    perPeriod.push({ period: p.id, site: p.site, state: p.state, credit_margin_g: margin });
  }

  const openRuns = runs.filter((x) => x.state === 'open').map((x) => x.reference);
  const consumptionsOnOpenRuns = consumptions.filter((x) => openRuns.includes(x.run)).length;

  const views = await batchViews(batches);
  const brokenCustody = views.filter((b) => !b.custody_complete);

  const supersededIds = new Set(figures.filter((f) => f.superseded_by).map((f) => f.id));
  const supersededLots = new Set(figures.filter((f) => f.superseded_by).map((f) => f.lot));
  const certsWithSuperseded = certs.filter((x) => (x.payload?.lots || []).some((l) => supersededLots.has(l.reference)));

  const now = Date.now();
  // a source that has never sent reports null rather than zero
  const integrationAges = SOURCES.map((source) => {
    const rows = inbound.filter((x) => x.source === source);
    if (!rows.length) return { source, age_hours: null, last_received_at: null, note: 'This source has never sent.' };
    const latest = rows.map((x) => new Date(x.received_at).getTime()).sort((a, b) => a - b).pop();
    return { source, age_hours: Math.floor((now - latest) / 3600000), last_received_at: new Date(latest).toISOString() };
  });

  return c.json({
    mass_balance_residual_g: massBalanceResidual,
    credit_margin_g: creditMargin,
    consumptions_on_open_runs: consumptionsOnOpenRuns,
    batches_with_broken_custody: brokenCustody.length,
    certificates_with_superseded_figures: certsWithSuperseded.length,
    integration_ages: integrationAges,
    detail: {
      mass_balance: { mass_in_g: massIn, mass_out_g: massOutLots, losses_g: losses, derivation: 'mass in minus mass out minus losses, over closed runs' },
      credit_margin: perPeriod,
      open_runs: openRuns,
      batches_with_broken_custody: brokenCustody.map((b) => ({ reference: b.reference, missing: b.custody_missing })),
      certificates_with_superseded_figures: certsWithSuperseded.map((x) => x.number),
      superseded_figures: [...supersededIds],
    },
    read_at: new Date().toISOString(),
    note: 'Six figures rather than six verdicts. It is a screen of numbers expected to be non-zero.',
  });
});

export default r;
