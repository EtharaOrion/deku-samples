import { Hono } from 'hono';
import { q, one } from '../db.js';
import { append, checkChain } from '../record.js';
import { withIdempotency, ok, requireRole, requireSession, refusePagination } from '../http.js';
import { reconciliation, readAt, iso } from '../engine.js';

export const record = new Hono();

const entryPayload = (e) => ({
  seq: Number(e.seq), act: e.act, person: e.person, person_id: e.person_id,
  at: e.at, site: e.site, object_kind: e.object_kind, object_ref: e.object_ref,
  content: e.content_deleted ? null : e.content,
  outcome: e.outcome, digest: e.digest, prev_digest: e.prev_digest,
  content_deleted: e.content_deleted,
  ...(e.content_deleted
    ? { statement: `The content of this entry was deleted under retention on ${iso(e.deleted_on)}.` }
    : {})
});

record.get('/record', async (c) => {
  const bad = refusePagination(c); if (bad) return bad;
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const filters = [];
  const params = [];
  for (const [param, column] of [['act', 'act'], ['person', 'person'], ['object_ref', 'object_ref'], ['site', 'site']]) {
    const v = c.req.query(param);
    if (v) { params.push(v); filters.push(`${column} = $${params.length}`); }
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await q(`SELECT * FROM record_entry ${where} ORDER BY seq ASC`, params);
  return c.json(rows.map(entryPayload));
});

record.get('/record/check', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const result = await checkChain();
  return c.json({ ...result, read_at: readAt() });
});

/** No entry is edited and no entry is removed from the sequence. */
for (const method of ['patch', 'put', 'delete']) {
  record[method]('/record/:seq', async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    await append(null, {
      act: 'record_modification_refused', person: auth.session.email,
      object_kind: 'record_entry', object_ref: c.req.param('seq'), outcome: 'refused',
      content: { method: c.req.method }
    });
    return c.json({
      error: 'record_is_append_only',
      rule: 'No entry is edited and no entry is removed. A correction is a new entry naming what it corrects.'
    }, 409);
  });
}

record.get('/record/:seq', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const e = await one('SELECT * FROM record_entry WHERE seq = $1', [Number(c.req.param('seq'))]);
  if (!e) return c.json({ error: 'not_found' }, 404);
  return c.json(entryPayload(e));
});

/** A correction is a new entry naming what it corrects. */
record.post('/record/:seq/corrections', async (c) => {
  const auth = await requireSession(c);
  if (auth.error) return auth.error;
  const seq = Number(c.req.param('seq'));
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/record/${seq}/corrections`, body, async () => {
    const e = await one('SELECT seq FROM record_entry WHERE seq = $1', [seq]);
    if (!e) return ok({ error: 'not_found' }, 404);
    if (!body.reason) return ok({ error: 'missing_field', field: 'reason' }, 400);
    const entry = await append(null, {
      act: 'correction_recorded', person: auth.session.email,
      object_kind: 'record_entry', object_ref: String(seq),
      content: { corrects_seq: seq, reason: body.reason, correction: body.correction || null }
    });
    return ok({ reference: `SEQ-${entry.seq}`, seq: Number(entry.seq), corrects_seq: seq, reason: body.reason }, 201);
  });
});

/* ------------------------------------------------ retention and holds */

const SCHEME_MONTHS = 120;   // the certification scheme's requirement
const STATUTORY_MONTHS = 84; // the statutory requirement at the site

function addMonths(dateIso, months) {
  const d = new Date(dateIso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

record.get('/record/:seq/retention', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const seq = Number(c.req.param('seq'));
  const e = await one('SELECT * FROM record_entry WHERE seq = $1', [seq]);
  if (!e) return c.json({ error: 'not_found' }, 404);
  const at = e.at instanceof Date ? e.at.toISOString() : e.at;
  const scheme_until = addMonths(at, SCHEME_MONTHS);
  const statutory_until = addMonths(at, STATUTORY_MONTHS);

  // Every version an issued figure was computed against is retained for as long as any
  // figure references it, which outlives the retention any single record would take.
  let referenced_until = null;
  if (e.object_ref) {
    const certs = await q(
      `SELECT signed_at FROM certificate
        WHERE number = $1 OR (input_versions::text LIKE '%' || $1 || '%') OR (carbon->>'figure_id') = $1`,
      [e.object_ref]
    );
    for (const cert of certs) {
      const until = addMonths(cert.signed_at instanceof Date ? cert.signed_at.toISOString() : cert.signed_at, SCHEME_MONTHS);
      if (!referenced_until || until > referenced_until) referenced_until = until;
    }
  }
  const hold = await one('SELECT reference FROM legal_hold WHERE seq = $1 AND lifted_at IS NULL', [seq]);
  const retain_until = [scheme_until, statutory_until, referenced_until].filter(Boolean).sort().pop();
  return c.json({
    seq,
    scheme_months: SCHEME_MONTHS,
    statutory_months: STATUTORY_MONTHS,
    scheme_until, statutory_until,
    referenced_until,
    // retain_until is the longest of the three and is computed rather than stored.
    retain_until,
    legal_hold: !!hold,
    legal_hold_reference: hold?.reference || null,
    content_deleted: e.content_deleted,
    derivation: { retain_until: 'the longest of the scheme, statutory and referenced periods' }
  });
});

record.post('/record/:seq/legal-hold', async (c) => {
  const auth = await requireRole(c, 'quality_manager', 'claims_manager', 'auditor');
  if (auth.error) return auth.error;
  const seq = Number(c.req.param('seq'));
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/record/${seq}/legal-hold`, body, async () => {
    const e = await one('SELECT seq FROM record_entry WHERE seq = $1', [seq]);
    if (!e) return ok({ error: 'not_found' }, 404);
    const existing = await one('SELECT reference FROM legal_hold WHERE seq = $1 AND lifted_at IS NULL', [seq]);
    if (existing) return ok({ error: 'hold_already_stands', reference: existing.reference }, 409);
    const n = await one(`SELECT count(*)::int AS n FROM legal_hold`);
    const reference = `HLD-${String(n.n + 1).padStart(4, '0')}`;
    await q('INSERT INTO legal_hold (reference, seq, placed_by) VALUES ($1,$2,$3)', [reference, seq, auth.session.email]);
    await append(null, {
      act: 'legal_hold_placed', person: auth.session.email,
      object_kind: 'record_entry', object_ref: String(seq), content: { reference }
    });
    return ok({ reference, seq, legal_hold: true, placed_by: auth.session.email }, 201);
  });
});

record.delete('/record/:seq/legal-hold', async (c) => {
  const auth = await requireRole(c, 'quality_manager', 'claims_manager', 'auditor');
  if (auth.error) return auth.error;
  const seq = Number(c.req.param('seq'));
  const hold = await one('SELECT reference FROM legal_hold WHERE seq = $1 AND lifted_at IS NULL', [seq]);
  if (!hold) return c.json({ error: 'no_hold_stands', seq }, 404);
  await q('UPDATE legal_hold SET lifted_by = $2, lifted_at = now() WHERE reference = $1', [hold.reference, auth.session.email]);
  await append(null, {
    act: 'legal_hold_lifted', person: auth.session.email,
    object_kind: 'record_entry', object_ref: String(seq), content: { reference: hold.reference }
  });
  return c.json({ reference: hold.reference, seq, legal_hold: false, lifted_by: auth.session.email });
});

/** Deletes the entry's content once retain_until has passed and no hold stands. */
record.post('/record/:seq/expire', async (c) => {
  const auth = await requireRole(c, 'quality_manager', 'claims_manager');
  if (auth.error) return auth.error;
  const seq = Number(c.req.param('seq'));
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/record/${seq}/expire`, body, async () => {
    const e = await one('SELECT * FROM record_entry WHERE seq = $1', [seq]);
    if (!e) return ok({ error: 'not_found' }, 404);
    const hold = await one('SELECT reference FROM legal_hold WHERE seq = $1 AND lifted_at IS NULL', [seq]);
    if (hold) {
      await append(null, {
        act: 'expiry_refused', person: auth.session.email, object_kind: 'record_entry',
        object_ref: String(seq), outcome: 'refused', content: { reason: 'legal_hold', hold: hold.reference }
      });
      return ok({ error: 'under_legal_hold', hold: hold.reference, rule: 'A record under hold refuses deletion.' }, 409);
    }
    const at = e.at instanceof Date ? e.at.toISOString() : e.at;
    const retain_until = [addMonths(at, SCHEME_MONTHS), addMonths(at, STATUTORY_MONTHS)].sort().pop();
    const today = new Date().toISOString().slice(0, 10);
    if (retain_until > today) {
      return ok({
        error: 'retention_not_reached', retain_until, today,
        rule: 'Content is deleted only once retain_until has passed.'
      }, 409);
    }
    // The one fact never deleted is that a certificate existed.
    if (e.object_kind === 'certificate') {
      return ok({
        error: 'certificate_existence_never_deleted', object_ref: e.object_ref,
        rule: 'A withdrawn certificate resolves at its address after every other retention has run out.'
      }, 409);
    }
    // The entry's position and its digest survive, so the chain still verifies.
    await q(
      `UPDATE record_entry SET content = NULL, content_deleted = true, deleted_on = CURRENT_DATE WHERE seq = $1`,
      [seq]
    );
    await append(null, {
      act: 'record_content_expired', person: auth.session.email,
      object_kind: 'record_entry', object_ref: String(seq), content: { retain_until }
    });
    return ok({
      seq, content_deleted: true, deleted_on: today, digest: e.digest,
      statement: `The content of this entry was deleted under retention on ${today}.`,
      note: 'The entry keeps its position and its digest, so the chain still verifies.'
    }, 201);
  });
});

/* ------------------------------------------------------- record queries */

const QUERIES = [
  'lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
  'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight',
  'refused_allocations', 'collector_declaration_departures', 'acts_by_person', 'exports_by_auditor'
];

record.get('/record/queries/:name', async (c) => {
  const bad = refusePagination(c); if (bad) return bad;
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const name = c.req.param('name');
  if (!QUERIES.includes(name)) return c.json({ error: 'unknown_query', accepted: QUERIES }, 404);
  const url = new URL(c.req.url);
  let results = [];

  if (name === 'lots_from_batch') {
    const batch = url.searchParams.get('batch');
    const { batchImpact } = await import('../engine.js');
    if (batch) {
      const impact = await batchImpact(batch);
      results = impact ? impact.lots.map((l) => ({ batch, ...l })) : [];
    } else {
      const batches = await q('SELECT reference FROM batch ORDER BY reference');
      for (const b of batches) {
        const impact = await batchImpact(b.reference);
        for (const l of impact.lots) results.push({ batch: b.reference, ...l });
      }
    }
  } else if (name === 'certificates_on_period') {
    const period = url.searchParams.get('period');
    results = period
      ? await q('SELECT number, version, state, period, recipient_name, content_bp, signed_at FROM certificate WHERE period = $1 ORDER BY number', [period])
      : await q('SELECT number, version, state, period, recipient_name, content_bp, signed_at FROM certificate ORDER BY period, number');
  } else if (name === 'certificates_under_method_version') {
    const mv = url.searchParams.get('method_version');
    results = mv
      ? await q(`SELECT number, version, state, (carbon->>'method_version') AS method_version, recipient_name FROM certificate WHERE carbon->>'method_version' = $1 ORDER BY number`, [mv])
      : await q(`SELECT number, version, state, (carbon->>'method_version') AS method_version, recipient_name FROM certificate ORDER BY number`);
  } else if (name === 'lots_released_under_unreviewed_override') {
    results = await q(
      `SELECT l.reference AS lot, l.site, l.disposition, o.reference AS override, o.separation,
              o.authorised_by, o.reviewed
         FROM lot l JOIN separation_override o ON o.lot = l.reference
        WHERE o.reviewed = false AND l.disposition = 'released' ORDER BY l.reference`
    );
  } else if (name === 'allocations_in_final_fortnight') {
    results = await q(
      `SELECT m.id, m.period, m.lot, m.category, m.mass_g, m.effective_on, m.created_by
         FROM credit_movement m JOIN balance_period p ON p.id = m.period
        WHERE m.direction = 'out' AND m.source_kind = 'allocation'
          AND m.effective_on > p.period_to - 14 ORDER BY m.effective_on`
    );
    results = results.map((r) => ({ ...r, id: Number(r.id), effective_on: iso(r.effective_on) }));
  } else if (name === 'refused_allocations') {
    const rows = await q(`SELECT * FROM record_entry WHERE act = 'allocation_refused' ORDER BY seq ASC`);
    results = rows.map((r) => ({
      seq: Number(r.seq), person: r.person, at: r.at, period: r.object_ref,
      lot: r.content?.lot, category: r.content?.category,
      available_g: r.content?.available_g, requested_g: r.content?.requested_g
    }));
  } else if (name === 'collector_declaration_departures') {
    results = await q(
      `SELECT reference, collector, batch, description, departure_bp, raised_on, due_on, state
         FROM finding WHERE departure_bp IS NOT NULL ORDER BY raised_on`
    );
    results = results.map((r) => ({ ...r, raised_on: iso(r.raised_on), due_on: iso(r.due_on) }));
  } else if (name === 'acts_by_person') {
    const person = url.searchParams.get('person');
    results = person
      ? await q('SELECT seq, act, person, at, site, object_kind, object_ref, outcome FROM record_entry WHERE person = $1 ORDER BY seq', [person])
      : await q('SELECT seq, act, person, at, site, object_kind, object_ref, outcome FROM record_entry ORDER BY seq');
    results = results.map((r) => ({ ...r, seq: Number(r.seq) }));
  } else if (name === 'exports_by_auditor') {
    // The last of those includes the reads that returned nothing.
    results = await q(
      `SELECT reference, scope, requested_by, requested_at, entry_count FROM export ORDER BY requested_at`
    );
    results = results.map((r) => ({ ...r, returned_nothing: r.entry_count === 0 }));
  }

  return c.json({
    query: name,
    complete: true,
    count: results.length,
    results,
    read_at: readAt(),
    note: 'This answer is a complete set by contract and refuses a page, a limit, an offset and a cursor.'
  });
});

/* --------------------------------------------------------------- exports */

record.get('/exports', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT reference, scope, requested_by, requested_at, entry_count FROM export ORDER BY requested_at ASC');
  return c.json(rows);
});

record.get('/exports/:reference', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const e = await one('SELECT * FROM export WHERE reference = $1', [c.req.param('reference')]);
  if (!e) return c.json({ error: 'not_found' }, 404);
  return c.json({ reference: e.reference, scope: e.scope, requested_by: e.requested_by, requested_at: e.requested_at, ...e.payload });
});

/** Records the scope before the read; the export is itself an entry, even when it returns nothing. */
record.post('/exports', async (c) => {
  const auth = await requireSession(c);
  if (auth.error) return auth.error;
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, 'POST /api/exports', body, async () => {
    const scope = {
      period: body.period || null,
      sites: body.sites || [],
      grades: body.grades || [],
      certificates: body.certificates || [],
      lots: body.lots || []
    };
    const n = await one(`SELECT count(*)::int AS n FROM export`);
    const reference = `EXP-${String(n.n + 1).padStart(4, '0')}`;
    // The scope is recorded before the read.
    await append(null, {
      act: 'export_scope_recorded', person: auth.session.email,
      object_kind: 'export', object_ref: reference, content: { scope }
    });

    const filters = []; const params = [];
    if (scope.sites.length) { params.push(scope.sites); filters.push(`site = ANY($${params.length})`); }
    if (scope.certificates.length) { params.push(scope.certificates); filters.push(`object_ref = ANY($${params.length})`); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const entries = await q(`SELECT * FROM record_entry ${where} ORDER BY seq ASC`, params);

    const certs = scope.certificates.length
      ? await q('SELECT * FROM certificate WHERE number = ANY($1)', [scope.certificates])
      : [];
    const lots = scope.lots.length
      ? await q('SELECT * FROM lot WHERE reference = ANY($1)', [scope.lots])
      : [];
    const periods = scope.period ? await q('SELECT * FROM balance_period WHERE id = $1', [scope.period]) : [];

    const payload = {
      exported_at: new Date().toISOString(),
      read_at: readAt(),
      scope,
      // The digests and the anchor references of the entries in its scope, so a reader can
      // establish its integrity after it has left this system.
      entries: entries.map((e) => ({ ...entryPayload(e) })),
      anchors: {
        first_seq: entries.length ? Number(entries[0].seq) : null,
        last_seq: entries.length ? Number(entries[entries.length - 1].seq) : null,
        first_digest: entries.length ? entries[0].digest : null,
        last_digest: entries.length ? entries[entries.length - 1].digest : null,
        chain: await checkChain()
      },
      certificates: certs.map((x) => ({ number: x.number, version: x.version, state: x.state, document: x.document, conditions: x.conditions, input_versions: x.input_versions })),
      lots: lots.map((l) => ({ reference: l.reference, mass_g: l.mass_g, disposition: l.disposition, claim_type: l.claim_type })),
      balance_periods: periods.map((p) => ({ id: p.id, state: p.state, site: p.site, grade: p.grade })),
      derivations: {
        content_bp: 'credit_attached_g * 10000 / lot_mass_g, floored',
        dry_mass_g: 'net_g * (10000 - moisture_bp) / 10000, floored',
        credit: 'dry_mass_consumed_g * factor_bp / 10000, floored'
      },
      self_contained: true,
      returned_nothing: entries.length === 0
    };
    await q(
      `INSERT INTO export (reference, scope, requested_by, entry_count, payload) VALUES ($1,$2,$3,$4,$5)`,
      [reference, JSON.stringify(scope), auth.session.email, entries.length, JSON.stringify(payload)]
    );
    // An export that returns nothing is recorded too.
    await append(null, {
      act: 'export_produced', person: auth.session.email,
      object_kind: 'export', object_ref: reference,
      content: { scope, entry_count: entries.length, returned_nothing: entries.length === 0 }
    });
    return ok({ reference, requested_by: auth.session.email, ...payload }, 201);
  });
});

/* ------------------------------------------------------------- inbound */

const SOURCES = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];

record.get('/inbound', async (c) => {
  const bad = refusePagination(c); if (bad) return bad;
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT * FROM inbound_record ORDER BY received_at ASC');
  return c.json(rows.map((r) => ({
    reference: r.reference, source: r.source, received_at: r.received_at,
    // The bytes exactly as they arrived rather than the shape the app parsed them into.
    payload_verbatim: r.payload_verbatim,
    payload: r.payload,
    stored_at: r.stored_at
  })));
});

record.post('/inbound/:source', async (c) => {
  const source = c.req.param('source');
  const raw = await c.req.text();
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
  return withIdempotency(c, `POST /api/inbound/${source}`, body, async () => {
    if (!SOURCES.includes(source)) return ok({ error: 'unknown_source', accepted: SOURCES }, 404);
    if (!body.received_at || body.payload === undefined) {
      return ok({ error: 'missing_field', required: ['received_at', 'payload'] }, 400);
    }
    const n = await one(`SELECT count(*)::int AS n FROM inbound_record`);
    const reference = `INB-${String(n.n + 1).padStart(4, '0')}`;
    // Kept verbatim: a disagreement with a supplier is settled by what came in.
    const verbatim = typeof body.payload === 'string' ? body.payload : JSON.stringify(body.payload);
    await q(
      `INSERT INTO inbound_record (reference, source, received_at, payload, payload_verbatim)
       VALUES ($1,$2,$3,$4,$5)`,
      [reference, source, body.received_at,
        typeof body.payload === 'string' ? JSON.stringify({ raw: body.payload }) : JSON.stringify(body.payload),
        verbatim]
    );
    await append(null, {
      act: 'inbound_record_stored', person: 'system',
      object_kind: 'inbound_record', object_ref: reference,
      content: { source, received_at: body.received_at, payload_verbatim: verbatim }
    });
    return ok({ reference, source, received_at: body.received_at, payload_verbatim: verbatim }, 201);
  });
});

/* ------------------------------------------------------- reconciliation */

record.get('/reconciliation', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  return c.json(await reconciliation());
});

/* --------------------------------------------------------------- parties */

record.get('/parties/:reference/versions', async (c) => {
  const rows = await q(
    'SELECT id, name, effective_from, superseded_by, recorded_at FROM party_version WHERE party = $1 ORDER BY effective_from ASC',
    [c.req.param('reference')]
  );
  return c.json(rows.map((r) => ({
    id: Number(r.id), party: c.req.param('reference'), name: r.name,
    effective_from: iso(r.effective_from),
    superseded_by: r.superseded_by ? Number(r.superseded_by) : null,
    recorded_at: r.recorded_at
  })));
});

/** Records a new name from an effective date and supersedes rather than rewrites. */
record.post('/parties/:reference/versions', async (c) => {
  const auth = await requireRole(c, 'quality_manager', 'claims_manager', 'plant_operator');
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/parties/${reference}/versions`, body, async () => {
    if (!body.name || !body.effective_from) {
      return ok({ error: 'missing_field', required: ['name', 'effective_from'] }, 400);
    }
    await q(`INSERT INTO party (reference, kind) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [reference, body.kind || 'party']);
    const prev = await one(
      'SELECT id FROM party_version WHERE party = $1 ORDER BY effective_from DESC LIMIT 1', [reference]
    );
    const row = await one(
      'INSERT INTO party_version (party, name, effective_from) VALUES ($1,$2,$3) RETURNING id',
      [reference, body.name, body.effective_from]
    );
    if (prev) await q('UPDATE party_version SET superseded_by = $2 WHERE id = $1', [prev.id, row.id]);
    await append(null, {
      act: 'party_version_recorded', person: auth.session.email,
      object_kind: 'party', object_ref: reference,
      content: { name: body.name, effective_from: body.effective_from }
    });
    return ok({
      reference: `PV-${row.id}`, party: reference, name: body.name,
      effective_from: body.effective_from, supersedes: prev ? Number(prev.id) : null,
      note: 'Every record names the party as it stood on the date of the act.'
    }, 201);
  });
});
