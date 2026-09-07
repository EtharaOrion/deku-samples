import { Hono } from 'hono';
import { all, one, query } from '../db.js';
import {
  asDate, idempotent, recordAct, refuse, refusePagination, refuseAuditorWrites,
  requireFields, requireSession, requireRole,
} from '../http.js';
import { checkChain } from '../record.js';

const app = new Hono();

const entryOut = (e) => ({
  seq: Number(e.seq),
  act: e.act,
  actor: e.actor,
  site: e.site,
  object_kind: e.object_kind,
  object_reference: e.object_reference,
  content: e.content_deleted ? null : e.content,
  refused: e.refused,
  occurred_at: e.occurred_at,
  digest: e.digest,
  prev_digest: e.prev_digest,
  content_deleted: e.content_deleted,
  content_deleted_on: asDate(e.content_deleted_on),
  statement: e.content_deleted
    ? `This entry's content was deleted under retention on ${asDate(e.content_deleted_on)}. Its position and its digest survive.`
    : null,
});

app.get('/record', async (c) => {
  refusePagination(c);
  requireSession(c);
  const url = new URL(c.req.url);
  const actor = url.searchParams.get('actor');
  const object = url.searchParams.get('object');
  const act = url.searchParams.get('act');
  let rows = await all('select * from record_entry order by seq asc');
  if (actor) rows = rows.filter((r) => r.actor === actor);
  if (object) rows = rows.filter((r) => r.object_reference === object);
  if (act) rows = rows.filter((r) => r.act === act);
  return c.json(rows.map(entryOut));
});

app.get('/record/check', async (c) => {
  requireSession(c);
  return c.json(await checkChain());
});

// Nine questions the record exists to answer, each a complete set.
const QUERIES = {
  lots_from_batch: async (params) => {
    const { batchImpact } = await import('../engine.js');
    const batch = params.get('batch') || 'BATCH-1001';
    const impact = await batchImpact(batch);
    return impact ? impact.lots.map((l) => ({ batch, ...l })) : [];
  },
  certificates_on_period: async (params) => {
    const period = params.get('period');
    const rows = period
      ? await all('select * from certificate where period = $1 order by number asc', [period])
      : await all('select * from certificate order by number asc');
    return rows.map((x) => ({ number: x.number, period: x.period, state: x.state, recipient_name: x.recipient_name, issued_on: asDate(x.issued_on) }));
  },
  certificates_under_method_version: async (params) => {
    const version = params.get('method_version');
    const rows = await all('select * from certificate order by number asc');
    return rows
      .filter((x) => !version || String(x.carbon?.method_version) === String(version))
      .map((x) => ({ number: x.number, method_version: x.carbon?.method_version, method_version_label: x.carbon?.method_version_label, state: x.state }));
  },
  lots_released_under_unreviewed_override: async () => {
    const rows = await all(
      "select l.reference, l.site, l.disposition, o.reference as override, o.separation, o.authorised_by, o.created_on from lot l join override o on o.lot = l.reference where o.reviewed = false and l.disposition = 'released' order by l.reference asc",
    );
    return rows.map((r) => ({
      lot: r.reference, site: r.site, disposition: r.disposition,
      override: r.override, separation: r.separation, authorised_by: r.authorised_by,
      created_on: asDate(r.created_on),
    }));
  },
  allocations_in_final_fortnight: async () => {
    const periods = await all('select * from balance_period');
    const out = [];
    for (const p of periods) {
      const cutoff = new Date(p.period_to);
      cutoff.setDate(cutoff.getDate() - 14);
      const movements = await all(
        "select * from credit_movement where period = $1 and direction = 'out' and effective_on >= $2 and effective_on <= $3 order by id asc",
        [p.id, cutoff.toISOString().slice(0, 10), asDate(p.period_to)],
      );
      for (const m of movements) {
        out.push({ period: p.id, movement: m.id, lot: m.lot, category: m.category, mass_g: m.mass_g, effective_on: asDate(m.effective_on) });
      }
    }
    return out;
  },
  refused_allocations: async () => {
    const rows = await all("select * from record_entry where act = 'allocation_refused' order by seq asc");
    return rows.map((r) => ({
      seq: Number(r.seq), actor: r.actor, period: r.object_reference,
      lot: r.content?.lot, category: r.content?.category,
      available_g: r.content?.available_g, requested_g: r.content?.requested_g,
      occurred_at: r.occurred_at,
    }));
  },
  collector_declaration_departures: async () => {
    const rows = await all("select * from finding where kind = 'declaration_departure' order by reference asc");
    return rows.map((f) => ({
      reference: f.reference, collector: f.collector, batch: f.batch, detail: f.detail,
      raised_on: asDate(f.raised_on), due_on: asDate(f.due_on), state: f.state,
    }));
  },
  acts_by_person: async (params) => {
    const person = params.get('person');
    const rows = person
      ? await all('select * from record_entry where actor = $1 order by seq asc', [person])
      : await all('select * from record_entry order by seq asc');
    return rows.map(entryOut);
  },
  exports_by_auditor: async (params) => {
    const auditor = params.get('auditor');
    const rows = auditor
      ? await all('select * from export where created_by = $1 order by created_at asc', [auditor])
      : await all('select * from export order by created_at asc');
    // The last of these includes the reads that returned nothing.
    return rows.map((e) => ({
      reference: e.reference, created_by: e.created_by, created_at: e.created_at,
      scope: e.scope, empty: e.empty,
      entries: (e.payload?.entries || []).length,
    }));
  },
};

app.get('/record/queries/:name', async (c) => {
  refusePagination(c);
  requireSession(c);
  const name = c.req.param('name');
  const fn = QUERIES[name];
  if (!fn) {
    refuse(404, 'unknown_query', {
      message: 'The record answers nine questions.',
      available: Object.keys(QUERIES),
    });
  }
  const url = new URL(c.req.url);
  const rows = await fn(url.searchParams);
  return c.json(rows);
});

// A modification and a removal are both refused.
const refuseMutation = (c) => {
  refuse(405, 'record_is_append_only', {
    message: 'No entry is edited and no entry is removed. A correction is a new entry naming what it corrects.',
  });
};
app.patch('/record/:seq', (c) => refuseMutation(c));
app.put('/record/:seq', (c) => refuseMutation(c));
app.delete('/record/:seq', (c) => refuseMutation(c));

app.get('/record/:seq', async (c) => {
  requireSession(c);
  const e = await one('select * from record_entry where seq = $1', [Number(c.req.param('seq'))]);
  if (!e) refuse(404, 'not_found', { message: 'No such record entry.' });
  return c.json(entryOut(e));
});

// retain_until is the longest of the three and is computed, never typed.
const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

app.get('/record/:seq/retention', async (c) => {
  requireSession(c);
  const seq = Number(c.req.param('seq'));
  const e = await one('select * from record_entry where seq = $1', [seq]);
  if (!e) refuse(404, 'not_found', { message: 'No such record entry.' });
  const hold = await one('select * from legal_hold where seq = $1 and lifted_at is null', [seq]);
  const occurred = new Date(e.occurred_at).toISOString().slice(0, 10);
  const scheme_until = addMonths(occurred, e.scheme_months);
  const statutory_until = addMonths(occurred, e.statutory_months);
  // Every version an issued figure was computed against is retained for as
  // long as any figure references it.
  let referenced_until = null;
  if (e.object_reference) {
    const referencing = await all(
      "select number, issued_on from certificate where number = $1 or lots @> $2::jsonb or period = $1",
      [e.object_reference, JSON.stringify([{ reference: e.object_reference }])],
    );
    if (referencing.length) {
      referenced_until = referencing
        .map((x) => addMonths(asDate(x.issued_on), 120))
        .sort()
        .at(-1);
    }
  }
  const candidates = [scheme_until, statutory_until, referenced_until].filter(Boolean);
  const retain_until = candidates.sort().at(-1);
  return c.json({
    seq,
    scheme_months: e.scheme_months,
    statutory_months: e.statutory_months,
    scheme_until,
    statutory_until,
    referenced_until,
    retain_until,
    legal_hold: !!hold,
    content_deleted: e.content_deleted,
    derivation: { retain_until: 'the longest of the scheme, statutory and referenced dates, computed' },
  });
});

app.post('/record/:seq/legal-hold', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const seq = Number(c.req.param('seq'));
  const body = await c.req.json().catch(() => ({}));
  const e = await one('select * from record_entry where seq = $1', [seq]);
  if (!e) refuse(404, 'not_found', { message: 'No such record entry.' });
  const result = await idempotent(c, `POST /api/record/${seq}/legal-hold`, body, async () => {
    const { rows } = await query("select reference from legal_hold order by reference desc limit 1");
    const n = rows[0] ? Number(rows[0].reference.split('-')[1]) + 1 : 1;
    const reference = `HLD-${String(n).padStart(4, '0')}`;
    await query('insert into legal_hold (reference,seq,placed_by) values ($1,$2,$3)', [reference, seq, session.email]);
    await recordAct({
      act: 'legal_hold_placed', actor: session.email, site: e.site,
      object_kind: 'record_entry', object_reference: String(seq),
      content: { reference, reason: body.reason || null },
    });
    return { status: 201, body: { reference, seq, legal_hold: true, placed_by: session.email } };
  });
  return c.json(result.body, result.status);
});

app.delete('/record/:seq/legal-hold', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const seq = Number(c.req.param('seq'));
  const hold = await one('select * from legal_hold where seq = $1 and lifted_at is null', [seq]);
  if (!hold) refuse(404, 'not_found', { message: 'No hold stands on that entry.' });
  await query('update legal_hold set lifted_by = $1, lifted_at = now() where reference = $2', [session.email, hold.reference]);
  const entry = await recordAct({
    act: 'legal_hold_lifted', actor: session.email, site: null,
    object_kind: 'record_entry', object_reference: String(seq),
    content: { reference: hold.reference },
  });
  return c.json({ reference: hold.reference, seq, legal_hold: false, lifted_by: session.email, entry: Number(entry.seq) });
});

app.post('/record/:seq/expire', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const seq = Number(c.req.param('seq'));
  const body = await c.req.json().catch(() => ({}));
  const e = await one('select * from record_entry where seq = $1', [seq]);
  if (!e) refuse(404, 'not_found', { message: 'No such record entry.' });
  const hold = await one('select * from legal_hold where seq = $1 and lifted_at is null', [seq]);
  if (hold) {
    await recordAct({
      act: 'retention_expiry_refused', actor: session.email, site: e.site,
      object_kind: 'record_entry', object_reference: String(seq), refused: true,
      content: { reason: 'legal_hold', hold: hold.reference },
    });
    refuse(409, 'legal_hold_stands', {
      message: 'A record under hold refuses deletion.',
      seq, legal_hold: hold.reference,
    });
  }
  const occurred = new Date(e.occurred_at).toISOString().slice(0, 10);
  const retain_until = [addMonths(occurred, e.scheme_months), addMonths(occurred, e.statutory_months)].sort().at(-1);
  const today = new Date().toISOString().slice(0, 10);
  if (retain_until > today) {
    refuse(409, 'retention_not_reached', {
      message: 'The content is deleted once retain_until has passed and no hold stands.',
      seq, retain_until, today,
    });
  }
  // The one fact never deleted is that a certificate existed.
  if (e.object_kind === 'certificate') {
    refuse(409, 'certificate_existence_is_never_deleted', {
      message: 'A withdrawn certificate resolves at its address after every other retention has run out.',
      seq, certificate: e.object_reference,
    });
  }
  const result = await idempotent(c, `POST /api/record/${seq}/expire`, body, async () => {
    // The position and the digest survive, so the chain still verifies.
    await query(
      'update record_entry set content = null, content_deleted = true, content_deleted_on = $1 where seq = $2',
      [today, seq],
    );
    await recordAct({
      act: 'retention_expired', actor: session.email, site: e.site,
      object_kind: 'record_entry', object_reference: String(seq),
      content: { deleted_on: today, retain_until },
    });
    const row = await one('select * from record_entry where seq = $1', [seq]);
    return { status: 200, body: { reference: String(seq), ...entryOut(row) } };
  });
  return c.json(result.body, result.status);
});

// An export records its scope before the read, and is itself an entry.
app.post('/exports', async (c) => {
  const session = requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['scope']);
  const result = await idempotent(c, 'POST /api/exports', body, async () => {
    const { rows } = await query("select reference from export order by reference desc limit 1");
    const n = rows[0] ? Number(rows[0].reference.split('-')[1]) + 1 : 1;
    const reference = `EXP-${String(n).padStart(4, '0')}`;
    const scopeEntry = await recordAct({
      act: 'export_scope_recorded', actor: session.email, site: null,
      object_kind: 'export', object_reference: reference, content: { scope: body.scope },
    });
    const scope = body.scope || {};
    let entries = await all('select * from record_entry order by seq asc');
    if (scope.sites?.length) entries = entries.filter((e) => !e.site || scope.sites.includes(e.site));
    if (scope.period) entries = entries.filter((e) => JSON.stringify(e.content || {}).includes(scope.period) || e.object_reference === scope.period);
    if (scope.certificates?.length) entries = entries.filter((e) => scope.certificates.includes(e.object_reference));
    if (scope.object) entries = entries.filter((e) => e.object_reference === scope.object);
    const certificates = scope.certificates?.length
      ? await all('select * from certificate where number = any($1)', [scope.certificates])
      : [];
    const payload = {
      reference,
      produced_at: new Date().toISOString(),
      produced_by: session.email,
      scope,
      scope_entry_seq: Number(scopeEntry.seq),
      entries: entries.map((e) => ({
        seq: Number(e.seq), act: e.act, actor: e.actor, site: e.site,
        object_kind: e.object_kind, object_reference: e.object_reference,
        occurred_at: e.occurred_at, digest: e.digest, prev_digest: e.prev_digest,
        content: e.content_deleted ? null : e.content, content_deleted: e.content_deleted,
      })),
      anchors: {
        first_seq: entries.length ? Number(entries[0].seq) : null,
        first_prev_digest: entries.length ? entries[0].prev_digest : null,
        last_seq: entries.length ? Number(entries.at(-1).seq) : null,
        last_digest: entries.length ? entries.at(-1).digest : null,
      },
      certificates: certificates.map((x) => ({ number: x.number, version: x.version, state: x.state, content_bp: x.content_bp, claim_type: x.claim_type, document: x.document })),
      derivations: {
        digest: 'sha256 over the entry content and the previous digest',
        integrity: 'a reader recomputes each digest from the entry and the one before it, without asking the producer',
      },
    };
    const empty = entries.length === 0;
    await query(
      'insert into export (reference,scope,created_by,payload,empty) values ($1,$2,$3,$4,$5)',
      [reference, JSON.stringify(scope), session.email, JSON.stringify(payload), empty],
    );
    // An export that returns nothing is recorded too.
    await recordAct({
      act: 'export_produced', actor: session.email, site: null,
      object_kind: 'export', object_reference: reference,
      content: { scope, entries: entries.length, empty },
    });
    return { status: 201, body: { reference, empty, ...payload } };
  });
  return c.json(result.body, result.status);
});

app.get('/exports', async (c) => {
  refusePagination(c);
  requireSession(c);
  const rows = await all('select * from export order by created_at asc');
  return c.json(rows.map((e) => ({
    reference: e.reference, scope: e.scope, created_by: e.created_by,
    created_at: e.created_at, empty: e.empty, entries: (e.payload?.entries || []).length,
  })));
});

app.get('/exports/:reference', async (c) => {
  requireSession(c);
  const e = await one('select * from export where reference = $1', [c.req.param('reference')]);
  if (!e) refuse(404, 'not_found', { message: 'No such export.' });
  return c.json(e.payload);
});

export default app;
