import { Hono } from 'hono';
import { currentSession, hasRole } from '../lib/auth.js';
import { withIdempotency } from '../lib/idempotency.js';
import { appendEntry, checkChain, entryView } from '../lib/record.js';
import { addMonths, today } from '../lib/units.js';
import { nextReference } from '../db.js';

const r = new Hono();

const QUERY_NAMES = [
  'lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
  'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight', 'refused_allocations',
  'collector_declaration_departures', 'acts_by_person', 'exports_by_auditor'
];

r.get('/record', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM record_entry ORDER BY seq')).rows;
  const holds = (await db.query('SELECT * FROM legal_hold')).rows;
  return c.json(rows.map((row) => ({
    ...entryView(row),
    legal_hold: holds.some((h) => h.seq === Number(row.seq))
  })));
});

r.get('/record/check', async (c) => {
  const db = c.get('db');
  const result = await checkChain(db);
  return c.json(result);
});

// Nine questions, each a complete set.
r.get('/record/queries/:name', async (c) => {
  const db = c.get('db');
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (c.req.query(p) !== undefined) {
      return Response.json({ error: 'pagination_refused', message: 'These queries answer complete sets.' }, { status: 400 });
    }
  }
  const name = c.req.param('name');
  if (!QUERY_NAMES.includes(name)) {
    return c.json({ error: 'unknown_query', known: QUERY_NAMES }, { status: 404 });
  }
  let answer = [];
  if (name === 'lots_from_batch') {
    const { impactForBatch } = await import('../lib/engine.js');
    const batches = (await db.query('SELECT reference FROM batch ORDER BY reference')).rows;
    answer = [];
    for (const b of batches) {
      const imp = await impactForBatch(db, b.reference);
      answer.push({ batch: b.reference, lots: imp.lots, certificates: imp.certificates, recipients: imp.recipients });
    }
  } else if (name === 'certificates_on_period') {
    const rows = (await db.query('SELECT number, period, state FROM certificate ORDER BY number')).rows;
    const byPeriod = {};
    for (const row of rows) {
      const k = row.period || 'none';
      (byPeriod[k] = byPeriod[k] || []).push({ number: row.number, state: row.state });
    }
    answer = Object.entries(byPeriod).map(([period, certificates]) => ({ period, certificates }));
  } else if (name === 'certificates_under_method_version') {
    const rows = (await db.query('SELECT number, carbon FROM certificate ORDER BY number')).rows;
    const byMethod = {};
    for (const row of rows) {
      const k = `${row.carbon.method} version ${row.carbon.method_version}`;
      (byMethod[k] = byMethod[k] || []).push(row.number);
    }
    answer = Object.entries(byMethod).map(([method_version, certificates]) => ({ method_version, certificates }));
  } else if (name === 'lots_released_under_unreviewed_override') {
    const rows = (await db.query('SELECT o.lot, o.reference FROM override o WHERE o.reviewed=false')).rows;
    const out = [];
    for (const row of rows) {
      const lot = (await db.query('SELECT * FROM lot WHERE reference=$1', [row.lot])).rows[0];
      out.push({ lot: row.lot, override: row.reference, disposition: lot ? lot.disposition : null, released: lot && lot.disposition === 'released' });
    }
    answer = out.filter((x) => x.released);
  } else if (name === 'allocations_in_final_fortnight') {
    const rows = (await db.query(
      `SELECT * FROM credit_movement WHERE kind='allocation' ORDER BY id`)).rows;
    const periods = (await db.query('SELECT * FROM balance_period')).rows;
    answer = rows.filter((m) => {
      const p = periods.find((x) => x.id === m.period);
      if (!p) return false;
      const end = new Date(p.period_end).getTime();
      const eff = new Date(m.effective_on).getTime();
      return end - eff <= 14 * 24 * 3600 * 1000;
    }).map((m) => ({ id: m.id, period: m.period, lot: m.derivation?.lot, mass_g: m.mass_g, effective_on: m.effective_on }));
  } else if (name === 'refused_allocations') {
    const rows = (await db.query(
      `SELECT * FROM record_entry WHERE kind='allocation_refused' ORDER BY seq`)).rows;
    answer = rows.map((row) => ({ seq: Number(row.seq), ...row.content }));
  } else if (name === 'collector_declaration_departures') {
    const rows = (await db.query('SELECT * FROM finding WHERE kind=\'declaration_departure\'')).rows;
    answer = rows.map((f) => ({ collector: f.collector, batch: f.batch, detail: f.detail, opened_on: f.opened_on, state: f.state }));
  } else if (name === 'acts_by_person') {
    const rows = (await db.query('SELECT person, count(*)::int AS n FROM record_entry GROUP BY person ORDER BY person')).rows;
    answer = rows.map((x) => ({ person: x.person, acts: x.n }));
  } else if (name === 'exports_by_auditor') {
    const rows = (await db.query('SELECT * FROM export_record ORDER BY reference')).rows;
    const byAuditor = {};
    for (const row of rows) {
      (byAuditor[row.produced_by] = byAuditor[row.produced_by] || []).push({
        reference: row.reference, scope: row.scope, produced_on: row.produced_on, empty: !row.content || row.content.result_count === 0
      });
    }
    answer = Object.entries(byAuditor).map(([auditor, exports]) => ({ auditor, exports }));
  }
  return c.json({ query: name, complete_set: true, answer });
});

// Retention: the longest of three periods, computed.
r.get('/record/:seq/retention', async (c) => {
  const db = c.get('db');
  const seq = Number(c.req.param('seq'));
  const row = (await db.query('SELECT * FROM record_entry WHERE seq=$1', [seq])).rows[0];
  if (!row) return c.json({ error: 'not_found' }, 404);
  const hold = (await db.query('SELECT * FROM legal_hold WHERE seq=$1', [seq])).rows[0];
  const base = new Date(row.moment).toISOString().slice(0, 10);
  const scheme_until = addMonths(base, 120);
  const statutory_until = addMonths(base, 84);
  // Referenced-until: versions stay retained while any figure references them.
  let referenced_until = scheme_until;
  if (row.kind === 'carbon_method_published' || row.kind === 'conversion_factor_published') {
    referenced_until = '2999-12-31';
  }
  const candidates = [scheme_until, statutory_until, referenced_until];
  const retain_until = candidates.slice().sort().pop();
  return c.json({
    seq,
    scheme_months: 120,
    statutory_months: 84,
    referenced_until,
    retain_until,
    legal_hold: Boolean(hold)
  });
});

r.post('/record/:seq/legal-hold', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'auditor', 'quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const seq = Number(c.req.param('seq'));
    const row = (await db.query('SELECT * FROM record_entry WHERE seq=$1', [seq])).rows[0];
    if (!row) return Response.json({ error: 'not_found' }, { status: 404 });
    const body = await c.req.json().catch(() => ({}));
    const existing = (await db.query('SELECT * FROM legal_hold WHERE seq=$1', [seq])).rows[0];
    if (existing) return Response.json({ reference: existing.reference, legal_hold: true }, { status: 200 });
    const reference = await nextReference(db, 'HLD-', 4);
    await db.query(
      `INSERT INTO legal_hold (reference,seq,placed_by,placed_on,reason) VALUES ($1,$2,$3,$4,$5)`,
      [reference, seq, s.email, today(), body.reason || '']);
    await appendEntry(db, {
      kind: 'legal_hold_placed', object_ref: reference, person: s.email, site: row.site,
      content: { reference, seq, reason: body.reason || '' }
    });
    return Response.json({ reference, seq, legal_hold: true }, { status: 201 });
  });
});

r.delete('/record/:seq/legal-hold', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'auditor', 'quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  const seq = Number(c.req.param('seq'));
  const existing = (await db.query('SELECT * FROM legal_hold WHERE seq=$1', [seq])).rows[0];
  if (!existing) return Response.json({ error: 'no_hold' }, { status: 404 });
  await db.query('DELETE FROM legal_hold WHERE seq=$1', [seq]);
  await appendEntry(db, {
    kind: 'legal_hold_lifted', object_ref: existing.reference, person: s.email, site: null,
    content: { reference: existing.reference, seq }
  });
  return c.json({ seq, legal_hold: false });
});

// Expiry: content deleted, position and digest survive.
r.post('/record/:seq/expire', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'auditor', 'quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const seq = Number(c.req.param('seq'));
    const row = (await db.query('SELECT * FROM record_entry WHERE seq=$1', [seq])).rows[0];
    if (!row) return Response.json({ error: 'not_found' }, { status: 404 });
    if (row.content_deleted) return Response.json({ error: 'already_expired' }, { status: 409 });
    const hold = (await db.query('SELECT * FROM legal_hold WHERE seq=$1', [seq])).rows[0];
    if (hold) {
      return Response.json({
        error: 'legal_hold_stands',
        message: 'A record under hold refuses deletion.',
        hold: hold.reference
      }, { status: 409 });
    }
    // A certificate's existence is the one fact never deleted.
    if (row.kind === 'certificate_signed' || row.kind === 'certificate_withdrawn') {
      return Response.json({
        error: 'certificate_existence_never_deleted',
        message: 'The one fact never deleted is that a certificate existed.'
      }, { status: 409 });
    }
    const retention = (await db.query('SELECT * FROM record_entry WHERE seq=$1', [seq])).rows[0];
    const base = new Date(retention.moment).toISOString().slice(0, 10);
    const retain_until = [addMonths(base, 120), addMonths(base, 84)].sort().pop();
    if (today() < retain_until) {
      return Response.json({
        error: 'retention_not_elapsed',
        message: 'retain_until has not passed.',
        retain_until
      }, { status: 409 });
    }
    await db.query(
      `UPDATE record_entry SET content_deleted=true, deleted_on=$1, content='{}' WHERE seq=$2`,
      [today(), seq]);
    await appendEntry(db, {
      kind: 'record_content_expired', object_ref: String(seq), person: s.email, site: null,
      content: { seq, deleted_on: today(), statement: 'Content deleted under retention; position and digest survive.' }
    });
    return Response.json({
      seq, content_deleted: true, deleted_on: today(),
      statement: 'The entry keeps its position and its digest; the chain still verifies.'
    }, { status: 201 });
  });
});

// Exports: scope recorded before the read, self-contained, itself an entry.
r.post('/exports', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'auditor')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted', message: 'Only an auditor exports.' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    const scope = {
      period: body.period || null,
      sites: body.sites || [],
      grades: body.grades || [],
      certificates: body.certificates || []
    };
    const reference = await nextReference(db, 'EXP-', 4);
    await db.query(
      `INSERT INTO export_record (reference,scope,produced_by,produced_on,content) VALUES ($1,$2,$3,now(),'{}')`,
      [reference, JSON.stringify(scope), s.email]);
    // Record the scope before the read.
    await appendEntry(db, {
      kind: 'export_recorded', object_ref: reference, person: s.email, site: null,
      content: { reference, scope }
    });
    const entries = (await db.query('SELECT * FROM record_entry ORDER BY seq')).rows;
    const selected = entries.filter((e) => {
      if (scope.sites.length && !scope.sites.includes(e.site)) return false;
      if (e.kind === 'certificate_signed' && scope.certificates.length) {
        return scope.certificates.includes(e.object_ref);
      }
      return true;
    });
    const content = {
      reference,
      scope,
      produced_by: s.email,
      derivations: 'Every figure carries the records it came from.',
      entries: selected.map((e) => ({
        seq: Number(e.seq), digest: e.digest, prev_digest: e.prev_digest, kind: e.kind
      })),
      anchors: selected.length ? [Number(selected[0].seq), Number(selected[selected.length - 1].seq)] : [],
      result_count: selected.length
    };
    await db.query('UPDATE export_record SET content=$1 WHERE reference=$2', [JSON.stringify(content), reference]);
    return Response.json(content, { status: 201 });
  });
});

r.get('/exports', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const rows = (await db.query('SELECT * FROM export_record ORDER BY reference')).rows;
  return c.json(rows.map((x) => ({ reference: x.reference, scope: x.scope, produced_by: x.produced_by, produced_on: x.produced_on })));
});

// Refuse any edit or deletion of an entry.
r.patch('/record/:seq', async (c) => {
  return Response.json({
    error: 'record_immutable',
    message: 'No entry is edited and no entry is removed; a correction is a new entry naming what it corrects.'
  }, { status: 405 });
});
r.delete('/record/:seq', async (c) => {
  return Response.json({
    error: 'record_immutable',
    message: 'No entry is removed. Retention deletes content through its own route, keeping position and digest.'
  }, { status: 405 });
});

export default r;
