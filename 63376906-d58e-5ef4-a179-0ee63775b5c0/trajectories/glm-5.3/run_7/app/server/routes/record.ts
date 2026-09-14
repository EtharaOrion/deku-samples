// The record, its queries, exports, retention, legal holds, reconciliation, inbound.
import { Hono } from 'hono';
import { db } from '../dbindex.ts';
import { requireSession, requireRole, deny, readJson, requireFields, noPaginationShared, rememberIdempotent } from '../middleware.js';
import { record, checkChain } from '../engine/record.js';
import { digestOf } from '../engine/record.js';
import { createHash } from 'node:crypto';

export const recordRoutes = new Hono();

recordRoutes.get('/record', async (c) => {
  await requireSession(c);
  noPaginationShared(c);
  const rows = (await db.query('SELECT * FROM record_entries ORDER BY seq')).rows;
  return c.json(rows.map(entryView));
});

function entryView(e: any) {
  return {
    seq: Number(e.seq),
    recorded_at: e.recorded_at,
    event_at: e.event_at,
    effective_on: e.effective_on,
    person: e.person,
    site: e.site,
    object_kind: e.object_kind,
    object_reference: e.object_reference,
    act: e.act,
    detail: e.content_deleted_on ? { content_deleted_on: e.content_deleted_on, note: 'Content deleted under retention; position and digest survive.' } : e.detail,
    digest: e.digest,
    prev_digest: e.prev_digest,
    legal_hold: e.legal_hold,
    content_deleted_on: e.content_deleted_on || null
  };
}

recordRoutes.get('/record/check', async (c) => {
  await requireSession(c);
  const result = await checkChain(db);
  return c.json({ holds: result.holds, first_failure: result.first_failure, entries: result.entries });
});

recordRoutes.patch('/record/:seq', async (c) => {
  const s = await requireSession(c);
  deny('entry_immutable', 'No entry is edited and no entry is removed from the sequence.', 405);
});

recordRoutes.delete('/record/:seq', async (c) => {
  await requireSession(c);
  deny('entry_immutable', 'No entry is edited and no entry is removed from the sequence.', 405);
});

// ---- queries -----------------------------------------------------------

const QUERIES = [
  'lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
  'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight', 'refused_allocations',
  'collector_declaration_departures', 'acts_by_person', 'exports_by_auditor'
];

recordRoutes.get('/record/queries/:name', async (c) => {
  const s = await requireSession(c);
  noPaginationShared(c);
  const name = c.req.param('name');
  if (!QUERIES.includes(name)) deny('unknown_query', `The nine questions are: ${QUERIES.join(', ')}.`, 404);
  let rows: any[] = [];
  switch (name) {
    case 'lots_from_batch': {
      const batch = c.req.query('batch');
      if (!batch) deny('batch_required', 'Pass ?batch=BATCH-1001', 400);
      const g = await import('../engine/genealogy.js');
      const impact = await g.batchImpact(db, batch);
      rows = impact.lots;
      break;
    }
    case 'certificates_on_period': {
      const period = c.req.query('period');
      rows = (await db.query('SELECT * FROM certificates WHERE period=$1 ORDER BY number', [period || null])).rows.map(certSummary);
      break;
    }
    case 'certificates_under_method_version': {
      const v = c.req.query('method_version');
      rows = (await db.query(
        `SELECT c.* FROM certificates c JOIN carbon_figures f ON f.id=c.carbon_figure
         WHERE $1 = (f.method_id || ' v' || f.method_version) ORDER BY c.number`, [v || null]
      )).rows.map(certSummary);
      break;
    }
    case 'lots_released_under_unreviewed_override': {
      rows = (await db.query(
        `SELECT l.reference, l.disposition, l.site, o.reference AS override, o.authorised_by, o.authorised_on
         FROM lots l JOIN overrides o ON o.lot=l.reference
         WHERE o.reviewed=false AND l.disposition='released' ORDER BY l.reference`
      )).rows;
      break;
    }
    case 'allocations_in_final_fortnight': {
      const period = c.req.query('period');
      const p = (await db.query('SELECT * FROM balance_periods WHERE id=$1', [period || ''])).rows[0];
      if (!p) deny('period_required', 'Pass ?period=BP-DEMO-N6-2026H1', 400);
      const to = new Date(p.period_to);
      const from = new Date(p.period_to);
      from.setUTCDate(from.getUTCDate() - 14);
      rows = (await db.query(
        `SELECT reference, lot, category, mass_g, recorded_at FROM credit_movements
         WHERE period=$1 AND direction='out' AND recorded_at::date BETWEEN $2 AND $3 ORDER BY recorded_at`,
        [p.id, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)]
      )).rows.map((r: any) => ({ ...r, mass_g: Number(r.mass_g) }));
      break;
    }
    case 'refused_allocations': {
      rows = (await db.query(
        `SELECT seq, recorded_at, person, detail FROM record_entries WHERE act='allocation_refused' ORDER BY seq`
      )).rows.map((r: any) => ({ seq: Number(r.seq), recorded_at: r.recorded_at, person: r.person, ...r.detail }));
      break;
    }
    case 'collector_declaration_departures': {
      rows = (await db.query('SELECT * FROM findings ORDER BY opened_on')).rows.map((f: any) => ({
        reference: f.reference, collector: f.collector, batch: f.batch, description: f.description, departure_bp: f.departure_bp, state: f.state, opened_on: f.opened_on
      }));
      break;
    }
    case 'acts_by_person': {
      const person = c.req.query('person');
      rows = (await db.query('SELECT * FROM record_entries WHERE person=$1 ORDER BY seq', [person || null])).rows.map(entryView);
      break;
    }
    case 'exports_by_auditor': {
      const auditor = c.req.query('auditor') || s.email;
      rows = (await db.query('SELECT * FROM exports WHERE performed_by=$1 ORDER BY performed_at', [auditor])).rows.map((e: any) => ({
        reference: e.reference, scope: e.scope, performed_by: e.performed_by, performed_at: e.performed_at, result_count: e.result_count, digest: e.digest
      }));
      break;
    }
  }
  return c.json(rows);
});

function certSummary(x: any) {
  return {
    number: x.number, version: x.version, site: x.site, grade: x.grade, period: x.period,
    claim_type: x.claim_type, content_bp: Number(x.content_bp), state: x.state, recipient: x.recipient,
    lots: x.lots, signer: x.signer, signed_at: x.signed_at
  };
}

// ---- exports -----------------------------------------------------------

recordRoutes.post('/exports', async (c) => {
  const s = await requireRole(c, ['auditor']);
  const body = await readJson(c);
  requireFields(body, ['scope']);

  const scope = body.scope;
  const payload: any = { scope, generated_at: new Date().toISOString(), entries: [], derivations: [] };

  if (scope.period) {
    const mv = (await db.query('SELECT * FROM credit_movements WHERE period=$1 ORDER BY recorded_at', [scope.period])).rows;
    payload.ledger = mv.map((m: any) => ({ reference: m.reference, category: m.category, direction: m.direction, mass_g: Number(m.mass_g), lot: m.lot, effective_on: m.effective_on, digest_anchor: null }));
  }
  if (scope.lots) {
    const nodes = {};
    payload.genealogy = {};
    for (const lot of scope.lots) {
      const g = await import('../engine/genealogy.js');
      payload.genealogy[lot] = await g.upstreamGraph(db, lot);
    }
  }
  if (scope.certificates) {
    payload.certificates = [];
    for (const n of scope.certificates) {
      const cert = (await db.query('SELECT * FROM certificates WHERE number=$1 ORDER BY version DESC LIMIT 1', [n])).rows[0];
      if (cert) payload.certificates.push(certSummary(cert));
    }
  }
  if (scope.sites) payload.sites = (await db.query('SELECT * FROM sites WHERE reference = ANY($1)', [scope.sites])).rows;

  const entries = (await db.query('SELECT seq, digest FROM record_entries ORDER BY seq')).rows;
  payload.record_anchor = { entries: entries.length, last_digest: entries.length ? entries[entries.length - 1].digest : null, digests: entries.map((e: any) => ({ seq: Number(e.seq), digest: e.digest })) };
  payload.digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM exports")).rows[0].n;
  const ref = 'EXP-' + String(n).padStart(4, '0');
  const resultCount = (payload.ledger?.length || 0) + (payload.certificates?.length || 0) + Object.keys(payload.genealogy || {}).length;
  await db.query(`INSERT INTO exports (reference,scope,performed_by,result_count,digest) VALUES ($1,$2,$3,$4,$5)`,
    [ref, JSON.stringify(scope), s.email, resultCount, payload.digest]);

  await record(db, { person: s.email, act: 'export_performed', object_kind: 'export', object_reference: ref, detail: { scope, result_count: resultCount } });
  await rememberIdempotent(c, 201, { reference: ref });
  return c.json({ reference: ref, ...payload }, 201);
});

recordRoutes.get('/exports', async (c) => {
  await requireSession(c);
  const rows = (await db.query('SELECT * FROM exports ORDER BY performed_at')).rows;
  return c.json(rows.map((e: any) => ({ reference: e.reference, scope: e.scope, performed_by: e.performed_by, performed_at: e.performed_at, result_count: e.result_count, digest: e.digest })));
});

// ---- retention and legal hold -----------------------------------------

const SCHEME_MONTHS = 120;
const STATUTORY_MONTHS = 84;

function monthsAfter(date: string, months: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

recordRoutes.get('/record/:seq/retention', async (c) => {
  await requireSession(c);
  const seq = Number(c.req.param('seq'));
  const e = (await db.query('SELECT * FROM record_entries WHERE seq=$1', [seq])).rows[0];
  if (!e) deny('entry_not_found', 'No such entry.', 404);

  const base = String(e.recorded_at).slice(0,10);
  const schemeUntil = monthsAfter(base, SCHEME_MONTHS);
  const statutoryUntil = monthsAfter(base, STATUTORY_MONTHS);

  // referenced_until: a figure still referencing this record holds it for as
  // long as any certificate resting on that figure is itself retained.
  let referencedUntil = schemeUntil;
  if (e.object_kind === 'carbon_figure' && e.object_reference) {
    const held = (await db.query(
      `SELECT COALESCE(MAX(until), $2::text) AS u FROM (
         SELECT to_char(COALESCE(withdrawn_on, (signed_at AT TIME ZONE 'UTC')::date + INTERVAL '120 months'), 'YYYY-MM-DD') AS until
         FROM certificates WHERE carbon_figure = $1
       ) t`,
      [e.object_reference, schemeUntil]
    )).rows;
    if (held[0]?.u && String(held[0].u) > referencedUntil) referencedUntil = String(held[0].u);
  }

  const hold = (await db.query('SELECT * FROM legal_holds WHERE seq=$1 AND lifted_on IS NULL', [seq])).rows[0];
  const retainUntil = [schemeUntil, statutoryUntil, referencedUntil].sort().pop();
  return c.json({
    seq,
    scheme_months: SCHEME_MONTHS,
    statutory_months: STATUTORY_MONTHS,
    scheme_until: schemeUntil,
    statutory_until: statutoryUntil,
    referenced_until: referencedUntil,
    retain_until: retainUntil,
    legal_hold: !!hold,
    hold_reference: hold?.reference || null,
    derivation: { retain_until: 'the longest of the scheme, statutory and referencing periods, computed' }
  });
});

recordRoutes.post('/record/:seq/legal-hold', async (c) => {
  const s = await requireRole(c, ['quality_manager', 'claims_manager', 'auditor']);
  const seq = Number(c.req.param('seq'));
  const e = (await db.query('SELECT * FROM record_entries WHERE seq=$1', [seq])).rows[0];
  if (!e) deny('entry_not_found', 'No such entry.', 404);
  const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM legal_holds")).rows[0].n;
  const ref = 'HLD-' + String(n).padStart(4, '0');
  await db.query(`INSERT INTO legal_holds (reference,seq,placed_by,placed_on) VALUES ($1,$2,$3,CURRENT_DATE)`, [ref, seq, s.email]);
  await db.query('UPDATE record_entries SET legal_hold=true WHERE seq=$1', [seq]);
  await record(db, { person: s.email, act: 'legal_hold_placed', object_kind: 'record_entry', object_reference: String(seq), detail: { hold: ref } });
  await rememberIdempotent(c, 201, { reference: ref });
  return c.json({ reference: ref, seq, placed_by: s.email, placed_on: new Date().toISOString().slice(0, 10) }, 201);
});

recordRoutes.delete('/record/:seq/legal-hold', async (c) => {
  const s = await requireRole(c, ['quality_manager', 'claims_manager', 'auditor']);
  const seq = Number(c.req.param('seq'));
  await db.query('UPDATE legal_holds SET lifted_on=CURRENT_DATE WHERE seq=$1 AND lifted_on IS NULL', [seq]);
  await db.query('UPDATE record_entries SET legal_hold=false WHERE seq=$1', [seq]);
  await record(db, { person: s.email, act: 'legal_hold_lifted', object_kind: 'record_entry', object_reference: String(seq), detail: {} });
  return c.json({ seq, legal_hold: false });
});

recordRoutes.post('/record/:seq/expire', async (c) => {
  const s = await requireRole(c, ['quality_manager']);
  const seq = Number(c.req.param('seq'));
  const e = (await db.query('SELECT * FROM record_entries WHERE seq=$1', [seq])).rows[0];
  if (!e) deny('entry_not_found', 'No such entry.', 404);
  const ret = (await db.query('SELECT * FROM legal_holds WHERE seq=$1 AND lifted_on IS NULL', [seq])).rows[0];
  if (ret) deny('legal_hold_stands', 'A record under hold refuses deletion.', 409);

  const base = String(e.recorded_at).slice(0,10);
  const retainUntil = monthsAfter(base, SCHEME_MONTHS);
  const today = new Date().toISOString().slice(0, 10);
  if (today < retainUntil) deny('retention_not_elapsed', `retain_until is ${retainUntil}.`, 409);

  // a certificate's existence is never deleted
  if (e.object_kind === 'certificate') deny('certificate_existence_permanent', 'The one fact never deleted is that a certificate existed.', 409);

  await db.query('UPDATE record_entries SET content_deleted_on=CURRENT_DATE WHERE seq=$1', [seq]);
  await record(db, { person: s.email, act: 'record_content_expired', object_kind: 'record_entry', object_reference: String(seq), detail: { deleted_on: today } });
  return c.json({ seq, content_deleted_on: today, digest: e.digest, prev_digest: e.prev_digest, note: 'The entry keeps its position and its digest so the chain still verifies.' });
});

// ---- inbound -----------------------------------------------------------

const SOURCES = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];

recordRoutes.post('/inbound/:source', async (c) => {
  const s = await requireSession(c);
  if (s.role === 'auditor') deny('auditor_is_read_only', 'An auditor writes no record.', 403);
  const source = c.req.param('source');
  if (!SOURCES.includes(source)) deny('invalid_source', 'source is one of weighbridge, control_system, laboratory, customer_reporting.', 400);
  const body = await readJson(c);
  requireFields(body, ['received_at', 'payload']);
  const verbatim = typeof body.payload === 'string' ? body.payload : JSON.stringify(body.payload);

  const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM inbound_records")).rows[0].n;
  const ref = 'INB-' + String(n).padStart(4, '0');
  await db.query(
    `INSERT INTO inbound_records (reference,source,received_at,payload_verbatim,payload) VALUES ($1,$2,$3,$4,$5)`,
    [ref, source, body.received_at, verbatim, typeof body.payload === 'string' ? null : JSON.stringify(body.payload)]
  );
  await record(db, { person: s.email, act: 'inbound_record_kept_verbatim', object_kind: 'inbound_record', object_reference: ref, detail: { source, received_at: body.received_at, bytes: verbatim.length } });
  await rememberIdempotent(c, 201, { reference: ref });
  return c.json({ reference: ref, source, received_at: body.received_at }, 201);
});

recordRoutes.get('/inbound', async (c) => {
  await requireSession(c);
  noPaginationShared(c);
  const rows = (await db.query('SELECT * FROM inbound_records ORDER BY received_at')).rows;
  return c.json(rows.map((r: any) => ({ reference: r.reference, source: r.source, received_at: r.received_at, payload_verbatim: r.payload_verbatim })));
});

// ---- reconciliation ---------------------------------------------------

recordRoutes.get('/reconciliation', async (c) => {
  await requireSession(c);
  const batches = (await db.query('SELECT * FROM batches')).rows;
  const runs = (await db.query('SELECT * FROM runs')).rows;
  const cons = (await db.query('SELECT * FROM consumptions')).rows;
  const outs = (await db.query('SELECT * FROM outputs')).rows;

  let massIn = 0, massOut = 0;
  for (const c2 of cons) massIn += Number(c2.mass_g);
  for (const o of outs) massOut += Number(o.mass_g);
  const residual = massIn - massOut - runs.reduce((a: number, r: any) => a + Number(r.losses_g || 0), 0);

  const periods = (await db.query("SELECT * FROM balance_periods WHERE state='open'")).rows;
  let creditMargin = 0;
  for (const p of periods) {
    const mv = (await db.query('SELECT * FROM credit_movements WHERE period=$1', [p.id])).rows;
    creditMargin += mv.reduce((a: number, m: any) => a + (m.direction === 'in' ? Number(m.mass_g) : -Number(m.mass_g)), 0);
  }

  const openRuns = runs.filter((r: any) => !r.closed_at).length;
  const brokenCustody = batches.filter((b: any) => {
    const kinds = new Set((b.custody as any[]).map((x: any) => x.kind));
    return !['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'].every((k) => kinds.has(k));
  }).length;

  const superseded = (await db.query(
    `SELECT COUNT(*)::int AS n FROM certificates c JOIN carbon_figures f ON f.id=c.carbon_figure WHERE c.state='issued' AND f.cache_valid=false`
  )).rows[0].n;

  const sources = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];
  const integrationAges: any[] = [];
  for (const src of sources) {
    const r = (await db.query('SELECT received_at FROM inbound_records WHERE source=$1 ORDER BY received_at DESC LIMIT 1', [src])).rows[0];
    integrationAges.push({ source: src, age_hours: r ? Math.max(0, Math.round((Date.now() - Date.parse(r.received_at)) / 3600000)) : null, most_recent: r?.received_at || null });
  }

  return c.json({
    mass_balance_residual_g: residual,
    credit_margin_g: creditMargin,
    consumptions_on_open_runs: openRuns,
    batches_with_broken_custody: brokenCustody,
    certificates_with_superseded_figures: superseded,
    integration_ages: integrationAges,
    read_at: new Date().toISOString(),
    derivation: {
      mass_balance_residual_g: 'mass in minus mass out minus recorded losses, across every run',
      credit_margin_g: 'credits in minus credits out across every open period',
      integration_ages: 'age of the most recent record from each source; a source that has never sent reads null'
    }
  });
});
