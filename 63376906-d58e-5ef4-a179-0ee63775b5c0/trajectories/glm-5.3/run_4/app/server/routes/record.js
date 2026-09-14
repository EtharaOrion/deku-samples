import { Hono } from 'hono';
import { q, tx } from '../db.js';
import { requireSession } from '../auth.js';
import { refuse, readBody, recordTx, refusePagination, readAt } from '../lib/http.js';
import { sha256, nowIso } from '../lib/util.js';

const record = new Hono();
record.use('*', requireSession());

const QUERIES = [
  'lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
  'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight', 'refused_allocations',
  'collector_declaration_departures', 'acts_by_person', 'exports_by_auditor'
];

record.get('/', async (c) => {
  refusePagination(c);
  const res = await q('SELECT * FROM record_entry ORDER BY seq');
  return c.json(res.rows.map((r) => ({
    seq: Number(r.seq), digest: r.digest, prev_digest: r.prev_digest,
    recorded_at: r.recorded_at, event_at: r.event_at, effective_on: r.effective_on,
    person: r.person, site: r.site, object: r.object, act: r.act,
    payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload, kind: r.kind, corrects: r.corrects === null ? null : Number(r.corrects),
    refused: r.refused, legal_hold: r.legal_hold,
    content_deleted_on: r.content_deleted_on
  })));
});

record.get('/check', async (c) => {
  const res = await q('SELECT seq, digest, prev_digest, payload, event_at, effective_on, person, site, object, act, kind, refused, outcome, corrects FROM record_entry ORDER BY seq');
  let holds = true;
  let firstFailure = null;
  let expectedPrev = '0'.repeat(64);
  let expectedSeq = 1;
  for (const r of res.rows) {
    if (Number(r.seq) !== expectedSeq) {
      holds = false; firstFailure = Number(r.seq); break;
    }
    if (r.prev_digest !== expectedPrev) {
      holds = false; firstFailure = Number(r.seq); break;
    }
    const body = r.payload;
    const digest = sha256(r.prev_digest + '|' + body);
    if (digest !== r.digest) {
      holds = false; firstFailure = Number(r.seq); break;
    }
    expectedPrev = r.digest;
    expectedSeq += 1;
  }
  return c.json({ holds, first_failure: firstFailure, entries: res.rows.length, checked_at: readAt() });
});

record.get('/queries/:name', async (c) => {
  refusePagination(c);
  const name = c.req.param('name');
  if (!QUERIES.includes(name)) return c.json({ error: 'unknown_query', available: QUERIES }, 404);
  const args = c.req.query();
  let rows = [];
  switch (name) {
    case 'lots_from_batch': {
      if (!args.batch) return c.json({ error: 'batch_required' }, 400);
      const { loadGraph } = await import('../lib/engine.js');
      const G = await loadGraph();
      const seen = new Set();
      const lots = [];
      const walk = (ref) => {
        for (const cons of G.consumptionsByInput.get(ref) || []) {
          for (const o of G.outputsByRun.get(cons.run) || []) {
            if (o.kind === 'lot') { if (!seen.has(o.lot)) { seen.add(o.lot); lots.push({ lot: o.lot, mass_g: Number(o.mass_g) }); } }
            else if (o.kind === 'intermediate') walk(o.reference);
          }
        }
      };
      walk(args.batch);
      rows = lots;
      break;
    }
    case 'certificates_on_period': {
      const r = args.period
        ? await q('SELECT * FROM certificate WHERE balance_period = $1 ORDER BY number', [args.period])
        : await q('SELECT * FROM certificate ORDER BY number');
      rows = r.rows.map((x) => ({ number: x.number, state: x.state, period: x.balance_period }));
      break;
    }
    case 'certificates_under_method_version': {
      const r = await q('SELECT * FROM certificate ORDER BY number');
      rows = r.rows
        .filter((x) => !args.method_version || ((x.figure_versions || {}).carbon_method === args.method_version))
        .map((x) => ({ number: x.number, method_version: (x.figure_versions || {}).carbon_method }));
      break;
    }
    case 'lots_released_under_unreviewed_override': {
      const r = await q('SELECT o.lot, o.reference FROM override o WHERE o.reviewed = false');
      const out = [];
      for (const x of r.rows) {
        const l = await q('SELECT reference, disposition FROM lot WHERE reference = $1 AND disposition = $2', [x.lot, 'released']);
        if (l.rows.length) out.push({ lot: x.lot, override: x.reference, disposition: 'released' });
      }
      rows = out;
      break;
    }
    case 'allocations_in_final_fortnight': {
      const r = await q(`SELECT * FROM record_entry WHERE act = 'claim_allocated'`);
      rows = r.rows.map((x) => ({ seq: Number(x.seq), lot: (x.payload || {}).object || x.object, effective_on: x.effective_on }));
      break;
    }
    case 'refused_allocations': {
      const r = await q(`SELECT * FROM record_entry WHERE act = 'allocation_refused' ORDER BY seq DESC`);
      rows = r.rows.map((x) => {
        const p = typeof x.payload === 'string' ? JSON.parse(x.payload) : x.payload;
        return { seq: Number(x.seq), lot: p.lot, available_g: p.available_g, requested_g: p.requested_g };
      });
      break;
    }
    case 'collector_declaration_departures': {
      const r = await q('SELECT * FROM finding ORDER BY raised_on');
      rows = r.rows.map((f) => ({ collector: f.collector, raised_on: f.raised_on, detail: f.detail, basis: f.basis }));
      break;
    }
    case 'acts_by_person': {
      if (!args.person) return c.json({ error: 'person_required' }, 400);
      const r = await q('SELECT * FROM record_entry WHERE person = $1 ORDER BY seq', [args.person]);
      rows = r.rows.map((x) => ({ seq: Number(x.seq), act: x.act, object: x.object, effective_on: x.effective_on }));
      break;
    }
    case 'exports_by_auditor': {
      const r = await q('SELECT * FROM export_record ORDER BY exported_on DESC');
      rows = r.rows.map((x) => ({ reference: x.reference, exported_by: x.exported_by, exported_on: x.exported_on, empty: x.empty }));
      break;
    }
  }
  await recordTx(null, { person: (c.get('user') || {}).email, act: 'record_query_run', object: name, payload: { name, args: Object.keys(args) } });
  return c.json(rows);
});

record.get('/:seq/retention', async (c) => {
  const seq = Number(c.req.param('seq'));
  const e = (await q('SELECT * FROM record_entry WHERE seq = $1', [seq])).rows[0];
  if (!e) return c.json({ error: 'not_found' }, 404);
  const scheme = 120, statutory = 84;
  const base = new Date((e.event_at || String(e.recorded_at)).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(base.getTime())) return c.json({ error: 'no_event_date' }, 409);
  const monthsLater = (m) => new Date(base.getTime() + m * 30.4375 * 86400000).toISOString().slice(0, 10);
  const schemeUntil = monthsLater(scheme);
  const statutoryUntil = monthsLater(statutory);
  // referenced_until: any figure that still references this record
  let referencedUntil = null;
  if (['certificate_signed', 'carbon_figure_computed', 'carbon_method_published'].includes(e.act)) {
    referencedUntil = 'retained while any figure references it';
  }
  const hold = (await q('SELECT * FROM legal_hold WHERE seq = $1', [seq])).rows;
  const candidates = [schemeUntil, statutoryUntil].sort();
  return c.json({
    seq, scheme_months: scheme, statutory_months: statutory,
    referenced_until: referencedUntil,
    retain_until: candidates[1],
    retain_until_basis: 'the longest of the three',
    legal_hold: hold.length > 0 || e.legal_hold,
    holds: hold.map((h) => h.reference)
  });
});

record.post('/:seq/legal-hold', async (c) => {
  const user = c.get('user');
  if (user.role !== 'auditor' && user.role !== 'quality_manager') {
    return c.json({ error: 'forbidden' }, 403);
  }
  const seq = Number(c.req.param('seq'));
  const body = await readBody(c);
  const e = (await q('SELECT * FROM record_entry WHERE seq = $1', [seq])).rows[0];
  if (!e) return c.json({ error: 'not_found' }, 404);
  const existing = (await q('SELECT * FROM legal_hold WHERE seq = $1', [seq])).rows;
  if (existing.length) return c.json({ reference: existing[0].reference, legal_hold: true });
  const ref = 'HLD-' + String(((await q('SELECT COUNT(*)::int AS n FROM legal_hold')).rows[0].n) + 1).padStart(4, '0');
  await tx(async (client) => {
    await client.query('INSERT INTO legal_hold (reference, seq, placed_on, placed_by, note) VALUES ($1,$2,$3,$4,$5)',
      [ref, seq, nowIso().slice(0, 10), user.email, body.note || '']);
    await client.query('UPDATE record_entry SET legal_hold = true WHERE seq = $1', [seq]);
    await recordTx(client, { user, act: 'legal_hold_placed', object: String(seq), payload: { reference: ref } });
  });
  return c.json({ reference: ref, legal_hold: true }, 201);
});

record.delete('/:seq/legal-hold', async (c) => {
  const user = c.get('user');
  if (user.role !== 'auditor' && user.role !== 'quality_manager') return c.json({ error: 'forbidden' }, 403);
  const seq = Number(c.req.param('seq'));
  const r = (await q('SELECT * FROM legal_hold WHERE seq = $1', [seq])).rows[0];
  if (!r) return c.json({ error: 'not_found' }, 404);
  await tx(async (client) => {
    await client.query('DELETE FROM legal_hold WHERE seq = $1', [seq]);
    await client.query('UPDATE record_entry SET legal_hold = false WHERE seq = $1', [seq]);
    await recordTx(client, { user, act: 'legal_hold_lifted', object: String(seq), payload: { reference: r.reference } });
  });
  return c.json({ reference: r.reference, legal_hold: false });
});

record.post('/:seq/expire', async (c) => {
  const user = c.get('user');
  if (user.role !== 'auditor' && user.role !== 'quality_manager') return c.json({ error: 'forbidden' }, 403);
  const seq = Number(c.req.param('seq'));
  const e = (await q('SELECT * FROM record_entry WHERE seq = $1', [seq])).rows[0];
  if (!e) return c.json({ error: 'not_found' }, 404);
  if (e.legal_hold) {
    return c.json({ error: 'legal_hold', message: 'A record under hold refuses deletion.' }, 409);
  }
  // is retain_until passed?
  const retention = (await q('SELECT * FROM record_entry WHERE seq = $1', [seq])).rows[0];
  const base = new Date((e.event_at || String(e.recorded_at)).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(base.getTime())) return c.json({ error: 'no_event_date' }, 409);
  const retainUntil = new Date(base.getTime() + 120 * 30.4375 * 86400000);
  if (retainUntil > new Date()) {
    return c.json({ error: 'retention_not_elapsed', retain_until: retainUntil.toISOString().slice(0, 10) }, 409);
  }
  await tx(async (client) => {
    await client.query('UPDATE record_entry SET payload = $2, content_deleted_on = $3 WHERE seq = $1',
      [seq, JSON.stringify({ deleted: true, note: 'Content deleted under retention. The entry keeps its position and its digest.' }), nowIso().slice(0, 10)]);
    await recordTx(client, { user, act: 'record_content_expired', object: String(seq), payload: { seq } });
  });
  return c.json({ seq, content_deleted_on: nowIso().slice(0, 10), digest_preserved: true });
});

// The record refuses an edit and a deletion.
record.patch('/:seq', async (c) => refuse(405, 'immutable', { message: 'No entry is edited and no entry is removed from the sequence.' }));
record.put('/:seq', async (c) => refuse(405, 'immutable', { message: 'No entry is edited and no entry is removed from the sequence.' }));
record.delete('/:seq', async (c) => refuse(405, 'immutable', { message: 'No entry is edited and no entry is removed from the sequence.' }));

export default record;
