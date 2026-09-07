import { Hono } from 'hono';
import { q, one, pool, snapshot } from '../lib/db.js';
import { dayOf } from '../lib/num.js';
import { refuse, noPaging, withIdempotency, nextRef } from '../lib/http.js';
import { requireSession, requireRole } from './middleware.js';
import { appendEntry, checkChain } from '../lib/record.js';

const r = new Hono();

function shapeEntry(x) {
  return {
    seq: Number(x.seq),
    reference: x.reference,
    act: x.act,
    person: x.person,
    person_id: x.person_id,
    moment: x.moment,
    site: x.site,
    object_kind: x.object_kind,
    object_ref: x.object_ref,
    outcome: x.outcome,
    content: x.content_deleted ? null : x.content,
    content_deleted: x.content_deleted,
    deleted_note: x.content_deleted ? `The content of this entry was deleted under retention on ${x.deleted_on ? dayOf(x.deleted_on) : 'an unrecorded date'}. Its position and its digest survive, so the chain still verifies.` : null,
    digest: x.digest,
    prev_digest: x.prev_digest,
  };
}

r.get('/record', async (c) => {
  noPaging(c);
  requireSession(c);
  const url = new URL(c.req.url);
  const act = url.searchParams.get('act');
  const object_ref = url.searchParams.get('object_ref');
  const person = url.searchParams.get('person');
  const rows = await snapshot(async (runner) => runner.q('select * from record_entry order by seq asc'));
  const filtered = rows.filter((x) => (!act || x.act === act) && (!object_ref || x.object_ref === object_ref) && (!person || x.person === person));
  return c.json(filtered.map(shapeEntry));
});

r.get('/record/check', async (c) => {
  requireSession(c);
  const { out, at } = await snapshot(async (runner, seen) => ({ out: await checkChain(runner), at: seen }));
  return c.json({ ...out, read_at: at, note: 'A gap in the sequence and a digest that does not verify are both reportable conditions.' });
});

// No entry is edited and no entry is removed from the sequence.
for (const method of ['patch', 'put', 'delete']) {
  r[method]('/record/:seq', async (c) => {
    const s = requireSession(c);
    await appendEntry(null, { act: 'record_modification_refused', person: s?.email || null, person_id: s?.person_id || null, object_kind: 'record_entry', object_ref: c.req.param('seq'), outcome: 'refused', content: { method: c.req.method, detail: 'Every attempt to modify or remove an entry is refused.' } });
    throw refuse(409, 'record_is_append_only', 'No entry is edited and no entry is removed from the sequence. A correction is a new entry naming what it corrects. This attempt is itself an entry.');
  });
}

r.post('/record/corrections', async (c) => {
  const s = await requireRole(c, 'record_correction', 'quality_manager', 'claims_manager', 'plant_operator');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, 'POST /record/corrections', body, async () => {
    const { corrects_seq, detail } = body;
    if (!corrects_seq || !detail) throw refuse(400, 'fields_required', 'A correction names the entry it corrects and states what is corrected.');
    const target = await one('select * from record_entry where seq = $1', [corrects_seq]);
    if (!target) throw refuse(404, 'not_found', 'No such entry.');
    const e = await appendEntry(null, { act: 'record_correction', person: s.email, person_id: s.person_id, object_kind: 'record_entry', object_ref: String(corrects_seq), content: { corrects_seq, detail, note: 'A correction is a new entry naming what it corrects.' } });
    return { status: 201, body: { reference: e.reference, seq: Number(e.seq), corrects_seq, detail, digest: e.digest } };
  });
  return c.json(out.body, out.status);
});

const SCHEME_MONTHS = 120;
const STATUTORY_MONTHS = 84;

function addMonths(iso, months) {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

r.get('/record/:seq/retention', async (c) => {
  requireSession(c);
  const seq = Number(c.req.param('seq'));
  const x = await one('select * from record_entry where seq = $1', [seq]);
  if (!x) throw refuse(404, 'not_found', 'No such entry.');
  const from = new Date(x.moment).toISOString();
  const scheme_until = addMonths(from, SCHEME_MONTHS);
  const statutory_until = addMonths(from, STATUTORY_MONTHS);
  // Every version an issued figure was computed against is retained for as long
  // as any figure references it, which outlives any single record's retention.
  let referenced_until = null;
  if (x.object_kind === 'certificate' || (x.content && x.content.number)) {
    const number = x.object_ref || x.content?.number;
    const cert = await one('select * from certificate where number = $1 order by version desc limit 1', [number]);
    if (cert) referenced_until = addMonths(new Date(cert.signed_at).toISOString(), 180);
  }
  const hold = await one('select * from legal_hold where seq = $1 and active = true', [seq]);
  const candidates = [scheme_until, statutory_until, referenced_until].filter(Boolean);
  const retain_until = candidates.sort().pop();
  return c.json({
    seq,
    scheme_months: SCHEME_MONTHS,
    statutory_months: STATUTORY_MONTHS,
    scheme_until,
    statutory_until,
    referenced_until,
    retain_until,
    legal_hold: !!hold,
    legal_hold_reference: hold ? hold.reference : null,
    content_deleted: x.content_deleted,
    derivation: { retain_until: 'the longest of the scheme requirement, the statutory requirement and any figure still referencing the record; computed rather than stored from a date somebody typed' },
  });
});

r.post('/record/:seq/legal-hold', async (c) => {
  const s = await requireRole(c, 'legal_hold_placed', 'quality_manager', 'claims_manager');
  const seq = Number(c.req.param('seq'));
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /record/${seq}/legal-hold`, body, async () => {
    const x = await one('select * from record_entry where seq = $1', [seq]);
    if (!x) throw refuse(404, 'not_found', 'No such entry.');
    const existing = await one('select * from legal_hold where seq = $1 and active = true', [seq]);
    if (existing) throw refuse(409, 'already_held', `A hold already stands on this entry: ${existing.reference}.`);
    const reference = await nextRef('HLD-', 'legal_hold');
    await pool.query('insert into legal_hold (reference, seq, placed_by, active) values ($1,$2,$3,true)', [reference, seq, s.email]);
    await appendEntry(null, { act: 'legal_hold_placed', person: s.email, person_id: s.person_id, object_kind: 'record_entry', object_ref: String(seq), content: { hold: reference, reason: body.reason || null } });
    return { status: 201, body: { reference, seq, legal_hold: true, placed_by: s.email } };
  });
  return c.json(out.body, out.status);
});

r.delete('/record/:seq/legal-hold', async (c) => {
  const s = await requireRole(c, 'legal_hold_lifted', 'quality_manager', 'claims_manager');
  const seq = Number(c.req.param('seq'));
  const hold = await one('select * from legal_hold where seq = $1 and active = true', [seq]);
  if (!hold) throw refuse(404, 'no_hold', 'No hold stands on this entry.');
  await pool.query('update legal_hold set active = false, lifted_by = $1, lifted_at = $2 where reference = $3', [s.email, new Date().toISOString(), hold.reference]);
  await appendEntry(null, { act: 'legal_hold_lifted', person: s.email, person_id: s.person_id, object_kind: 'record_entry', object_ref: String(seq), content: { hold: hold.reference } });
  return c.json({ reference: hold.reference, seq, legal_hold: false, lifted_by: s.email });
});

r.post('/record/:seq/expire', async (c) => {
  const s = await requireRole(c, 'record_content_expired', 'quality_manager', 'claims_manager');
  const seq = Number(c.req.param('seq'));
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /record/${seq}/expire`, body, async () => {
    const x = await one('select * from record_entry where seq = $1', [seq]);
    if (!x) throw refuse(404, 'not_found', 'No such entry.');
    const hold = await one('select * from legal_hold where seq = $1 and active = true', [seq]);
    if (hold) throw refuse(409, 'under_legal_hold', `A record under hold refuses deletion. Hold ${hold.reference} stands on this entry.`, { legal_hold: hold.reference });
    const from = new Date(x.moment).toISOString();
    const retain_until = [addMonths(from, SCHEME_MONTHS), addMonths(from, STATUTORY_MONTHS)].sort().pop();
    const today = new Date().toISOString().slice(0, 10);
    if (retain_until > today) throw refuse(409, 'retention_has_not_passed', `The content is deleted once retain_until has passed. This entry is retained until ${retain_until}.`, { retain_until });
    if (x.object_kind === 'certificate') throw refuse(409, 'certificate_existence_never_deleted', 'The one fact never deleted is that a certificate existed: a withdrawn certificate resolves at its address after every other retention has run out.');
    // The entry's position and its digest survive, so the chain still verifies.
    await pool.query('update record_entry set content_deleted = true, deleted_on = $1 where seq = $2', [today, seq]);
    await appendEntry(null, { act: 'record_content_expired', person: s.email, person_id: s.person_id, object_kind: 'record_entry', object_ref: String(seq), content: { seq, deleted_on: today, note: "The entry's position and its digest survive." } });
    return { status: 200, body: { seq, content_deleted: true, deleted_on: today, digest: x.digest, prev_digest: x.prev_digest, note: 'The entry states that its content was deleted under retention on a date. The chain still verifies.' } };
  });
  return c.json(out.body, out.status);
});

r.get('/people/:person_id', async (c) => {
  requireSession(c);
  const p = await one('select * from person_directory where person_id = $1', [c.req.param('person_id')]);
  if (!p) throw refuse(404, 'not_found', 'No such person.');
  return c.json({ person_id: p.person_id, email: p.email, name: p.name, retention_months: p.retention_months, note: 'A person inside the record is referenced by an identifier, and the identifier resolves to a name through a separate store with its own retention.' });
});

/* ------------------------------------------------------------ nine queries */

const QUERIES = [
  'lots_from_batch',
  'certificates_on_period',
  'certificates_under_method_version',
  'lots_released_under_unreviewed_override',
  'allocations_in_final_fortnight',
  'refused_allocations',
  'collector_declaration_departures',
  'acts_by_person',
  'exports_by_auditor',
];

r.get('/record/queries', async (c) => {
  noPaging(c);
  requireSession(c);
  return c.json(QUERIES.map((name) => ({ name, address: `/api/record/queries/${name}` })));
});

r.get('/record/queries/:name', async (c) => {
  noPaging(c);
  requireSession(c);
  const name = c.req.param('name');
  if (!QUERIES.includes(name)) throw refuse(404, 'no_such_query', `The record answers nine questions: ${QUERIES.join(', ')}.`);
  const url = new URL(c.req.url);
  // Each of the nine answers a complete set from one state, and names it.
  return snapshot(async (runner, read_at) => {
  let results = [];
  switch (name) {
    case 'lots_from_batch': {
      const batch = url.searchParams.get('batch');
      const { impactOfBatch } = await import('../engine/genealogy.js');
      const batches = batch ? [batch] : (await runner.q('select reference from batch order by reference')).map((x) => x.reference);
      for (const b of batches) {
        const imp = await impactOfBatch(b, runner);
        if (imp) results.push({ batch: b, lots: imp.lots, certificates: imp.certificates, recipients: imp.recipients });
      }
      break;
    }
    case 'certificates_on_period': {
      const period = url.searchParams.get('period');
      const rows = period ? await runner.q('select * from certificate where period = $1 order by number', [period]) : await runner.q('select * from certificate order by number');
      results = rows.map((x) => ({ number: x.number, version: x.version, period: x.period, state: x.state, recipient: x.recipient, recipient_name: x.recipient_name, content_bp: x.content_bp, claim_type: x.claim_type, signed_on: dayOf(x.signed_on) }));
      break;
    }
    case 'certificates_under_method_version': {
      const mv = url.searchParams.get('method_version');
      const rows = await runner.q('select * from certificate order by number');
      results = rows
        .filter((x) => (mv ? (x.input_versions || {}).carbon_method === mv || x.carbon?.method_version === mv : true))
        .map((x) => ({ number: x.number, version: x.version, method_version: x.carbon?.method_version || (x.input_versions || {}).carbon_method, state: x.state, recipient: x.recipient, signed_on: dayOf(x.signed_on) }));
      break;
    }
    case 'lots_released_under_unreviewed_override': {
      const rows = await runner.q("select l.*, o.reference as override_ref, o.separation, o.authorised_by, o.effective_on as override_on from lot l join override_record o on o.lot = l.reference where o.reviewed = false and l.disposition = 'released' order by l.reference");
      results = rows.map((x) => ({ lot: x.reference, site: x.site, disposition: x.disposition, override: x.override_ref, separation: x.separation, authorised_by: x.authorised_by, override_effective_on: dayOf(x.override_on) }));
      break;
    }
    case 'allocations_in_final_fortnight': {
      const periods = await runner.q('select * from balance_period');
      const movements = await runner.q("select * from credit_movement where direction = 'out' order by seq");
      results = movements
        .filter((m) => {
          const p = periods.find((x) => x.id === m.period);
          if (!p) return false;
          const end = Date.parse(String(p.period_to));
          const eff = Date.parse(String(m.effective_on));
          return end - eff <= 14 * 86400000 && eff <= end;
        })
        .map((m) => ({ reference: m.reference, period: m.period, lot: m.lot, category: m.category, mass_g: Number(m.mass_g), effective_on: dayOf(m.effective_on), recorded_by: m.recorded_by }));
      break;
    }
    case 'refused_allocations': {
      const rows = await runner.q("select * from record_entry where act = 'allocation_refused' order by seq");
      results = rows.map((x) => ({ seq: Number(x.seq), moment: x.moment, person: x.person, period: x.object_ref, lot: x.content?.lot, category: x.content?.category, requested_g: x.content?.requested_g, available_g: x.content?.available_g, margin_at_instant_g: x.content?.margin_at_instant_g ?? x.content?.available_g }));
      break;
    }
    case 'collector_declaration_departures': {
      const rows = await runner.q("select * from finding where kind = 'declaration_departure' order by reference");
      results = rows.map((x) => ({ reference: x.reference, collector: x.collector, batch: x.batch, departure_bp: x.departure_bp, detail: x.detail, raised_on: dayOf(x.raised_on), state: x.state }));
      break;
    }
    case 'acts_by_person': {
      const person = url.searchParams.get('person');
      const rows = person ? await runner.q('select * from record_entry where person = $1 order by seq', [person]) : await runner.q('select * from record_entry where person is not null order by seq');
      results = rows.map((x) => ({ seq: Number(x.seq), act: x.act, person: x.person, person_id: x.person_id, moment: x.moment, object_kind: x.object_kind, object_ref: x.object_ref, outcome: x.outcome }));
      break;
    }
    case 'exports_by_auditor': {
      const rows = await runner.q('select * from export_record order by requested_at');
      // The last of those includes the reads that returned nothing.
      results = rows.map((x) => ({ reference: x.reference, requested_by: x.requested_by, requested_at: x.requested_at, scope: x.scope, entry_count: x.entry_count, returned_nothing: x.entry_count === 0 }));
      break;
    }
    default:
      break;
  }
  return c.json({ query: name, results, count: results.length, complete: true, read_at, note: 'This answer is a complete set by contract and refuses a page, a limit, an offset or a cursor.' });
  });
});

/* ------------------------------------------------------------------ export */

r.post('/exports', async (c) => {
  const s = requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, 'POST /exports', body, async () => {
    const scope = { period: body.period || null, sites: body.sites || [], grades: body.grades || [], certificates: body.certificates || [], lots: body.lots || [] };
    const reference = await nextRef('EXP-', 'export_record');
    // The scope is recorded before the read.
    await appendEntry(null, { act: 'export_scope_recorded', person: s.email, person_id: s.person_id, object_kind: 'export', object_ref: reference, content: { scope } });
    // An export is an integrity artefact. Every part of it — the entries, their
    // digests, the certificates, the lots, the traversals and the chain check —
    // is read from one snapshot, so a reader cannot be handed a chain check that
    // does not match the entries printed beside it.
    return snapshot(async (runner, seen) => {
    const entries = await runner.q('select * from record_entry order by seq asc');
    // A named site scope is a scope: an entry outside it is outside the export,
    // and an entry with no site is a global act that only an unscoped export
    // reaches.
    const inScope = entries.filter((x) => {
      if (scope.sites.length && x.site !== null && !scope.sites.includes(x.site)) return false;
      if (scope.sites.length && x.site === null) return false;
      if (scope.certificates.length && x.object_kind === 'certificate' && !scope.certificates.includes(x.object_ref)) return false;
      if (scope.period && x.content && x.content.period && x.content.period !== scope.period) return false;
      return true;
    });
    const certs = await runner.q('select * from certificate order by number');
    const certsInScope = certs.filter((x) => (!scope.sites.length || scope.sites.includes(x.site)) && (!scope.certificates.length || scope.certificates.includes(x.number)) && (!scope.grades.length || scope.grades.includes(x.grade)));
    const lots = await runner.q('select * from lot order by reference');
    const lotsInScope = lots.filter((x) => (!scope.sites.length || scope.sites.includes(x.site)) && (!scope.lots.length || scope.lots.includes(x.reference)));
    const genealogies = [];
    for (const l of lotsInScope) {
      const { genealogyOfLot } = await import('../engine/genealogy.js');
      const g = await genealogyOfLot(l.reference, runner).catch(() => null);
      if (g) genealogies.push(g);
    }
    const payload = {
      reference,
      scope,
      requested_by: s.email,
      requested_at: seen,
      read_at: seen,
      entries: inScope.map(shapeEntry),
      digests: inScope.map((x) => ({ seq: Number(x.seq), digest: x.digest, prev_digest: x.prev_digest })),
      anchor_references: inScope.map((x) => x.reference),
      chain: await checkChain(runner),
      certificates: certsInScope.map((x) => ({ number: x.number, version: x.version, state: x.state, content_bp: x.content_bp, claim_type: x.claim_type, carbon: x.carbon, signed_on: dayOf(x.signed_on), input_versions: x.input_versions, document: x.document })),
      lots: lotsInScope.map((x) => ({ reference: x.reference, grade: x.grade, site: x.site, mass_g: Number(x.mass_g), disposition: x.disposition, claim_type: x.claim_type })),
      genealogies,
      derivations: { note: 'Every figure in this export carries its derivation and the versions it was computed against.' },
      integrity: { note: 'The digests and the anchor references let a reader establish integrity after this export has left the system, without asking the producer to confirm anything.' },
      empty: inScope.length === 0,
    };
    return { status: 201, body: payload };
    }).then(async (res) => {
      // The export is itself an entry, and an export that returned nothing is
      // recorded too. Both writes land after the snapshot has closed, so they
      // never appear inside the artefact that describes the state before them.
      await pool.query('insert into export_record (reference, scope, requested_by, entry_count, payload) values ($1,$2,$3,$4,$5)', [reference, JSON.stringify(scope), s.email, res.body.entries.length, JSON.stringify({ counts: { entries: res.body.entries.length, certificates: res.body.certificates.length, lots: res.body.lots.length } })]);
      await appendEntry(null, { act: 'export_taken', person: s.email, person_id: s.person_id, object_kind: 'export', object_ref: reference, content: { scope, entry_count: res.body.entries.length, returned_nothing: res.body.entries.length === 0 } });
      return res;
    });
  });
  return c.json(out.body, out.status);
});

r.get('/exports', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from export_record order by requested_at');
  return c.json(rows.map((x) => ({ reference: x.reference, scope: x.scope, requested_by: x.requested_by, requested_at: x.requested_at, entry_count: x.entry_count, returned_nothing: x.entry_count === 0, summary: x.payload })));
});

r.post('/annotations', async (c) => {
  const s = requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, 'POST /annotations', body, async () => {
    const { object_kind, object_ref, note } = body;
    if (!object_kind || !object_ref || !note) throw refuse(400, 'fields_required', 'An annotation names what it annotates and says something.');
    const reference = await nextRef('ANN-', 'annotation');
    await pool.query('insert into annotation (reference, object_kind, object_ref, note, author) values ($1,$2,$3,$4,$5)', [reference, object_kind, object_ref, note, s.email]);
    await appendEntry(null, { act: 'annotation_recorded', person: s.email, person_id: s.person_id, object_kind, object_ref, content: { note } });
    return { status: 201, body: { reference, object_kind, object_ref, note, author: s.email } };
  });
  return c.json(out.body, out.status);
});

r.get('/annotations', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from annotation order by recorded_at');
  return c.json(rows.map((x) => ({ reference: x.reference, object_kind: x.object_kind, object_ref: x.object_ref, note: x.note, author: x.author, recorded_at: x.recorded_at })));
});

export default r;
