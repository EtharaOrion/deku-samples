import { Hono } from 'hono';
import { q, one, client, exec } from '../db.js';
import { requireAuth, requireRole, bad, notFound, conflict, forbidden, reqField, rememberIdempotency, refusePagination, ApiError } from '../lib/http.js';
import { entry, entryTop, digestOf, ZERO_DIGEST } from '../record.js';
import { cfg } from '../config.js';

const r = new Hono();
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const iso = (d) => (d instanceof Date ? d.toISOString() : d);

// ---- The append-only record.
r.get('/api/record', async (c) => {
  refusePagination(c);
  await requireAuth(c);
  const rows = await q('SELECT * FROM record_entries ORDER BY seq');
  return c.json(rows.map(e => ({
    seq: Number(e.seq), recorded_at: iso(e.recorded_at), person: e.person, site: e.site,
    object: e.object, act: e.act, content: e.content, digest: e.digest, prev_digest: e.prev_digest,
    correction_of: e.correction_of, deleted_on: e.deleted_on ? isoD(e.deleted_on) : null
  })));
});

// No entry is edited and none removed. A correction is a new entry naming what it corrects.
r.patch('/api/record/:seq', async (c) => { await requireAuth(c); throw forbidden('record_immutable', { rule: 'no entry is edited' }); });
r.put('/api/record/:seq', async (c) => { await requireAuth(c); throw forbidden('record_immutable', { rule: 'no entry is edited' }); });
r.delete('/api/record/:seq', async (c) => { await requireAuth(c); throw forbidden('record_immutable', { rule: 'no entry is removed' }); });

r.post('/api/record/:seq/corrections', async (c) => {
  const user = await requireAuth(c);
  const target = await one('SELECT * FROM record_entries WHERE seq=$1', [Number(c.req.param('seq'))]);
  if (!target) throw notFound('entry_not_found');
  const b = await c.req.json();
  const e = await entryTop({ person: user.email, site: target.site, object: target.object,
    act: 'correction', correction_of: Number(target.seq), content: { corrects: Number(target.seq), note: reqField(b.note, 'note') } });
  await rememberIdempotency(c, 201, { reference: `COR-${e.seq}`, seq: e.seq, corrects: Number(target.seq), record_seq: e.seq });
  return c.json({ reference: `COR-${e.seq}`, seq: e.seq, corrects: Number(target.seq), record_seq: e.seq }, 201);
});

r.get('/api/record/check', async (c) => {
  await requireAuth(c);
  const rows = await q('SELECT * FROM record_entries ORDER BY seq');
  let expected = 0, prev = ZERO_DIGEST, holds = true, first_failure = null, gap = null;
  for (const e of rows) {
    expected++;
    const seq = Number(e.seq);
    if (seq !== expected) { holds = false; gap = { expected: expected, found: seq }; break; }
    const c2 = typeof e.content === 'string' ? JSON.parse(e.content) : e.content;
    if (digestOf({ content: c2, prev }) !== e.digest || e.prev_digest !== prev) {
      holds = false; first_failure = { seq, reason: 'digest_does_not_verify' }; break;
    }
    prev = e.digest;
  }
  return c.json({ holds, first_failure, gap, entries: rows.length, read_at: new Date().toISOString() });
});

// ---- Retention, legal hold, deletion of content.
const addMonths = (d, m) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + m); return x; };

r.get('/api/record/:seq/retention', async (c) => {
  await requireAuth(c);
  const e = await one('SELECT * FROM record_entries WHERE seq=$1', [Number(c.req.param('seq'))]);
  if (!e) throw notFound('entry_not_found');
  const hold = await one('SELECT * FROM legal_holds WHERE seq=$1 AND lifted_on IS NULL', [Number(e.seq)]);
  const schemeUntil = addMonths(e.recorded_at, cfg.schemeMonths);
  const statutoryUntil = addMonths(e.recorded_at, cfg.statutoryMonths);
  const referencedUntil = await referencedUntilFor(e);
  const retainUntil = [schemeUntil, statutoryUntil, referencedUntil].sort((a, b) => b - a)[0];
  return c.json({
    seq: Number(e.seq),
    scheme_months: cfg.schemeMonths, statutory_months: cfg.statutoryMonths,
    scheme_until: isoD(schemeUntil), statutory_until: isoD(statutoryUntil),
    referenced_until: isoD(referencedUntil),
    referenced_until_reason: 'computed: any figure that still references the record',
    retain_until: isoD(retainUntil),
    legal_hold: !!hold,
    derivation: 'retain_until is the longest of the three, computed rather than stored'
  });
});

async function referencedUntilFor(e) {
  const cert = await one(`SELECT signed_at FROM certificates WHERE number = $1`, [e.object]);
  if (cert) return new Date('2126-01-01T00:00:00Z');
  return addMonths(e.recorded_at, 120);
}

r.post('/api/record/:seq/legal-hold', async (c) => {
  const user = await requireRole(c, 'quality_manager', 'claims_manager', 'auditor');
  const seq = Number(c.req.param('seq'));
  const e = await one('SELECT * FROM record_entries WHERE seq=$1', [seq]);
  if (!e) throw notFound('entry_not_found');
  const tx = await client();
  try {
    await tx.query('BEGIN');
    const row = await one(`INSERT INTO legal_holds (seq, placed_on, placed_by) VALUES ($1,$2,$3) RETURNING id`, [seq, isoD(new Date()), user.email], tx);
    const en = await entry(tx, { person: user.email, site: e.site, object: String(seq), act: 'legal_hold_placed', content: { hold_id: Number(row.id), seq } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: `HLD-${String(Number(row.id)).padStart(4, '0')}`, seq, record_seq: en.seq });
    return c.json({ reference: `HLD-${String(Number(row.id)).padStart(4, '0')}`, seq, legal_hold: true, record_seq: en.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

r.delete('/api/record/:seq/legal-hold', async (c) => {
  const user = await requireRole(c, 'quality_manager', 'claims_manager', 'auditor');
  const seq = Number(c.req.param('seq'));
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`UPDATE legal_holds SET lifted_on=$2 WHERE seq=$1 AND lifted_on IS NULL`, [seq, isoD(new Date())]);
    const en = await entry(tx, { person: user.email, site: null, object: String(seq), act: 'legal_hold_lifted', content: { seq } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: `HLD-LIFT-${seq}`, seq, legal_hold: false, record_seq: en.seq });
    return c.json({ reference: `HLD-LIFT-${seq}`, seq, legal_hold: false, record_seq: en.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

r.post('/api/record/:seq/expire', async (c) => {
  const user = await requireRole(c, 'claims_manager', 'quality_manager');
  const seq = Number(c.req.param('seq'));
  const e = await one('SELECT * FROM record_entries WHERE seq=$1', [seq]);
  if (!e) throw notFound('entry_not_found');
  if (e.deleted_on) throw conflict('entry_already_expired');
  const hold = await one('SELECT * FROM legal_holds WHERE seq=$1 AND lifted_on IS NULL', [seq]);
  if (hold) throw conflict('legal_hold_refuses_deletion', { hold_id: Number(hold.id) });
  const ret = await referencedUntilFor(e);
  const schemeUntil = addMonths(e.recorded_at, cfg.schemeMonths);
  const statutoryUntil = addMonths(e.recorded_at, cfg.statutoryMonths);
  const retainUntil = [schemeUntil, statutoryUntil, ret].sort((a, b) => b - a)[0];
  if (retainUntil > new Date()) throw conflict('retention_not_yet_expired', { retain_until: isoD(retainUntil) });
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`UPDATE record_entries SET content = $2, deleted_on = $3 WHERE seq=$1`,
      [seq, JSON.stringify({ deleted_under_retention: true, deleted_on: isoD(new Date()), note: 'content deleted under retention; position and digest preserved' }), isoD(new Date())]);
    const en = await entry(tx, { person: user.email, site: null, object: String(seq), act: 'record_content_expired', content: { seq } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: `EXP-${seq}`, seq, record_seq: en.seq });
    return c.json({ reference: `EXP-${seq}`, seq, deleted: true, record_seq: en.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

// ---- The nine questions the record answers, each a complete set.
const QUERIES = {
  lots_from_batch: async () => {
    const rows = await q('SELECT * FROM consumptions WHERE batch IS NOT NULL');
    const out = [];
    for (const c of rows) {
      const impact = await (await import('../engine/domain.js')).batchImpact(c.batch);
      out.push({ batch: c.batch, lots: impact.lots.map(l => ({ lot: l.lot, mass_g: l.mass_g })) });
    }
    const seen = new Map();
    for (const o of out) { if (!seen.has(o.batch)) seen.set(o.batch, o); else seen.get(o.batch).lots = o.lots; }
    return [...seen.values()];
  },
  certificates_on_period: async () => {
    const rows = await q('SELECT number, period, state, signed_at FROM certificates ORDER BY number');
    const out = {};
    for (const x of rows) (out[x.period] ||= []).push({ number: x.number, state: x.state, signed_at: iso(x.signed_at) });
    return Object.entries(out).map(([period, certificates]) => ({ period, certificates }));
  },
  certificates_under_method_version: async () => {
    const rows = await q('SELECT number, carbon FROM certificates ORDER BY number');
    const out = {};
    for (const x of rows) {
      const mv = x.carbon?.method_version || 'none';
      (out[mv] ||= []).push(x.number);
    }
    return Object.entries(out).map(([method_version, certificates]) => ({ method_version, certificates }));
  },
  lots_released_under_unreviewed_override: async () => {
    const rows = await q(`SELECT o.lot, o.reference, l.disposition FROM overrides o JOIN lots l ON l.reference=o.lot WHERE o.reviewed=false`);
    return rows.filter(x => x.disposition === 'released').map(x => ({ lot: x.lot, override: x.reference, disposition: x.disposition }));
  },
  allocations_in_final_fortnight: async () => {
    const rows = await q(`SELECT a.*, bp.period_to FROM allocations a JOIN balance_periods bp ON bp.id=a.balance_period ORDER BY a.id`);
    return rows.filter(x => (new Date(x.recorded_at) - new Date(x.period_to)) / 86400000 <= 14)
      .map(x => ({ lot: x.lot, category: x.category, mass_g: Number(x.mass_g), recorded_at: iso(x.recorded_at), period_to: isoD(x.period_to) }));
  },
  refused_allocations: async () => {
    const rows = await q(`SELECT * FROM record_entries WHERE act='allocation_refused' ORDER BY seq`);
    return rows.map(e => ({ seq: Number(e.seq), person: e.person, period: e.content.period, lot: e.content.lot,
      requested_g: e.content.requested_g, available_g: e.content.available_g, margin_at_instant: e.content.available_g }));
  },
  collector_declaration_departures: async () => {
    const rows = await q('SELECT * FROM findings ORDER BY id');
    return rows.map(f => ({ collector: f.collector, raised_on: isoD(f.raised_on), detail: f.detail, open: f.open }));
  },
  acts_by_person: async () => {
    const rows = await q(`SELECT person, count(*) n FROM record_entries GROUP BY person ORDER BY person`);
    return rows.map(x => ({ person: x.person || '(system)', acts: Number(x.n) }));
  },
  exports_by_auditor: async () => {
    const rows = await q(`SELECT * FROM record_entries WHERE act='export' ORDER BY seq`);
    return rows.map(e => ({ seq: Number(e.seq), person: e.person, scope: e.content.scope, returned_something: !!e.content.result?.length }));
  }
};

r.get('/api/record/queries/:name', async (c) => {
  refusePagination(c);
  await requireAuth(c);
  const fn = QUERIES[c.req.param('name')];
  if (!fn) throw notFound('query_not_found', { available: Object.keys(QUERIES) });
  return c.json(await fn());
});

// ---- Exports: the scope is recorded before the read, and an export is itself an entry.
r.post('/api/exports', async (c) => {
  const user = await requireAuth(c);
  const scope = await c.req.json();
  const ref = `EXP-${String(Number((await one('SELECT count(*) n FROM exports')).n) + 1).padStart(4, '0')}`;
  const collected = [];
  if (scope.period) {
    const mv = await q('SELECT * FROM credit_movements WHERE balance_period=$1', [scope.period]);
    collected.push({ kind: 'credit_movements', rows: mv.length, entries: mv.map(m => m.reference) });
  }
  if (Array.isArray(scope.certificates)) {
    const certs = await q('SELECT number FROM certificates WHERE number = ANY($1)', [scope.certificates]);
    collected.push({ kind: 'certificates', rows: certs.length, entries: certs.map(x => x.number) });
  }
  const entries = await q('SELECT seq, digest FROM record_entries ORDER BY seq');
  const anchors = entries.filter(e => collected.some(k => k.entries.includes(e.reference))).map(e => ({ seq: Number(e.seq), digest: e.digest }));
  const payload = { reference: ref, scope, generated_at: new Date().toISOString(), collected, anchors,
    chain_head: entries.length ? entries[entries.length - 1].digest : null, derivations: 'each figure carries the records it came from' };
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO exports (reference, scope, result) VALUES ($1,$2,$3)`, [ref, JSON.stringify(scope), JSON.stringify(payload)]);
    const e = await entry(tx, { person: user.email, site: null, object: ref, act: 'export', content: { reference: ref, scope, collected } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: ref, ...payload, record_seq: e.seq });
    return c.json({ reference: ref, ...payload, record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

export default r;
