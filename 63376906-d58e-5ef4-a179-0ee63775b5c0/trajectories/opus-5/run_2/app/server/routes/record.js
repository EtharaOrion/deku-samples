import { q, one, pool } from '../lib/db.js';
import {
  refuse, requireSession, requireRole, idempotent, record, refuseParams,
  refuseComputedInput, refuseAuditorWrite, nextReference,
} from '../lib/http.js';
import { checkChain } from '../lib/record.js';
import { iso, addMonths, reconciliation } from '../lib/engine.js';

const QUERY_NAMES = [
  'lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
  'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight',
  'refused_allocations', 'collector_declaration_departures', 'acts_by_person', 'exports_by_auditor',
];

export default function mount(app) {
  /* ------------------------------------------------------------ record */
  app.get('/record', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT * FROM record_entry ORDER BY seq ASC');
    return c.json(rows.map(shapeEntry));
  });

  app.get('/record/check', async (c) => {
    requireSession(c);
    const r = await checkChain();
    return c.json({ ...r, read_at: new Date().toISOString() });
  });

  /* ---------------------------------------------------- record queries */
  app.get('/record/queries/:name', async (c) => {
    refuseParams(c);
    requireSession(c);
    const name = c.req.param('name');
    if (!QUERY_NAMES.includes(name)) {
      refuse(404, 'no_such_query', { message: `The record answers ${QUERY_NAMES.join(', ')}.`, permitted: QUERY_NAMES });
    }
    const answer = await runQuery(name, c);
    return c.json({ query: name, complete: true, read_at: new Date().toISOString(), ...answer });
  });

  /* --------------------------------------------------------- retention */
  app.get('/record/:seq/retention', async (c) => {
    requireSession(c);
    const seq = Number(c.req.param('seq'));
    const e = await one('SELECT * FROM record_entry WHERE seq = $1', [seq]);
    if (!e) refuse(404, 'no_such_entry', { message: 'There is no such record entry.' });
    const from = iso(e.ts);
    const scheme_until = addMonths(from, e.scheme_months);
    const statutory_until = addMonths(from, e.statutory_months);
    // Every version an issued figure was computed against is retained for as
    // long as any figure references it.
    let referenced_until = null;
    const refs = await referencingFigures(e);
    if (refs.length) referenced_until = addMonths(from, 240);
    const candidates = [scheme_until, statutory_until, referenced_until].filter(Boolean).sort();
    const retain_until = candidates[candidates.length - 1];
    const hold = await one('SELECT * FROM legal_hold WHERE seq = $1 AND lifted_at IS NULL', [seq]);
    return c.json({
      seq,
      scheme_months: e.scheme_months,
      statutory_months: e.statutory_months,
      scheme_until,
      statutory_until,
      referenced_until,
      retain_until,
      legal_hold: !!hold,
      legal_hold_reference: hold?.reference || null,
      content_deleted: e.content_deleted,
      deleted_on: iso(e.deleted_on),
      referenced_by: refs,
      derivation: { retain_until: 'the longest of the scheme requirement, the statutory requirement and any figure still referencing the record, computed rather than stored' },
    });
  });

  app.post('/record/:seq/legal-hold', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'quality_manager', 'claims_manager');
    const seq = Number(c.req.param('seq'));
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const e = await one('SELECT * FROM record_entry WHERE seq = $1', [seq]);
    if (!e) refuse(404, 'no_such_entry', { message: 'There is no such record entry.' });
    const result = await idempotent(c, body, async () => {
      const reference = await nextReference('HLD');
      await pool.query(
        'INSERT INTO legal_hold (reference, seq, placed_by) VALUES ($1,$2,$3)', [reference, seq, s.identifier]);
      await record(c, {
        action: 'legal_hold_placed', object_kind: 'legal_hold', object_ref: reference,
        content: { seq, reason: body.reason || null },
      });
      return { status: 201, body: { reference, seq, legal_hold: true, placed_by: s.identifier } };
    });
    return c.json(result.body, result.status);
  });

  app.delete('/record/:seq/legal-hold', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'quality_manager', 'claims_manager');
    const seq = Number(c.req.param('seq'));
    const hold = await one('SELECT * FROM legal_hold WHERE seq = $1 AND lifted_at IS NULL', [seq]);
    if (!hold) refuse(404, 'no_hold_stands', { message: 'No legal hold stands on this entry.' });
    await pool.query('UPDATE legal_hold SET lifted_at = now(), lifted_by = $1 WHERE reference = $2',
      [s.identifier, hold.reference]);
    await record(c, {
      action: 'legal_hold_lifted', object_kind: 'legal_hold', object_ref: hold.reference, content: { seq },
    });
    return c.json({ reference: hold.reference, seq, legal_hold: false, lifted_by: s.identifier });
  });

  // The entry's position and its digest survive, so the chain still verifies.
  app.post('/record/:seq/expire', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'quality_manager', 'claims_manager');
    const seq = Number(c.req.param('seq'));
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const e = await one('SELECT * FROM record_entry WHERE seq = $1', [seq]);
    if (!e) refuse(404, 'no_such_entry', { message: 'There is no such record entry.' });
    const hold = await one('SELECT * FROM legal_hold WHERE seq = $1 AND lifted_at IS NULL', [seq]);
    if (hold) {
      await record(c, {
        action: 'retention_expiry_refused', object_kind: 'record_entry', object_ref: String(seq),
        outcome: 'refused', content: { reason: 'legal_hold_stands', hold: hold.reference },
      });
      refuse(409, 'legal_hold_stands', {
        message: 'A record under hold refuses deletion.', legal_hold: hold.reference,
      });
    }
    // The one fact never deleted is that a certificate existed.
    if (e.object_kind === 'certificate' && ['certificate_signed', 'certificate_withdrawn'].includes(e.action)) {
      const stillThere = await one('SELECT number FROM certificate WHERE number = $1', [e.object_ref]);
      if (stillThere) {
        refuse(409, 'certificate_existence_is_never_deleted', {
          message: 'The one fact never deleted is that a certificate existed. A withdrawn certificate resolves at its address after every other retention has run out.',
          certificate: e.object_ref,
        });
      }
    }
    const from = iso(e.ts);
    const retain_until = [addMonths(from, e.scheme_months), addMonths(from, e.statutory_months)].sort().pop();
    const today = iso(new Date());
    if (retain_until > today && !body.force_after_retention) {
      refuse(409, 'retention_has_not_passed', {
        message: `This entry's content is deleted once ${retain_until} has passed.`,
        retain_until, today,
      });
    }
    const result = await idempotent(c, body, async () => {
      await pool.query(
        `UPDATE record_entry SET content_deleted = true, deleted_on = $1, content = '{}'::jsonb WHERE seq = $2`,
        [today, seq]);
      await record(c, {
        action: 'record_content_expired', object_kind: 'record_entry', object_ref: String(seq),
        content: { seq, deleted_on: today, retain_until },
      });
      const after = await one('SELECT * FROM record_entry WHERE seq = $1', [seq]);
      return {
        status: 200,
        body: {
          seq, content_deleted: true, deleted_on: today,
          digest: after.digest, prev_digest: after.prev_digest,
          statement: `The content of this entry was deleted under retention on ${today}. Its position and its digest survive so the chain still verifies.`,
        },
      };
    });
    return c.json(result.body, result.status);
  });

  /* ----------------------------------------------------------- exports */
  app.get('/exports', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT * FROM export ORDER BY created_at ASC');
    return c.json(rows.map((e) => ({
      reference: e.reference, actor: e.actor, scope: e.scope,
      scope_recorded_at: e.scope_recorded_at, entry_count: e.entry_count, created_at: e.created_at,
    })));
  });

  // The scope is recorded before the read, and the export is itself an entry.
  app.post('/exports', async (c) => {
    const s = requireSession(c);
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const result = await idempotent(c, body, async () => {
      const reference = await nextReference('EXP');
      const scope = {
        period: body.period || null, sites: body.sites || null,
        grades: body.grades || null, certificates: body.certificates || null,
        lots: body.lots || null,
      };
      await pool.query(
        'INSERT INTO export (reference, actor, scope) VALUES ($1,$2,$3)',
        [reference, s.identifier, JSON.stringify(scope)]);
      await record(c, {
        action: 'export_scope_recorded', object_kind: 'export', object_ref: reference,
        content: { scope },
      });

      const read_at = new Date().toISOString();
      let entries = await q('SELECT * FROM record_entry ORDER BY seq ASC');
      if (scope.sites) entries = entries.filter((e) => !e.site || scope.sites.includes(e.site));
      if (scope.certificates) {
        entries = entries.filter((e) => e.object_kind !== 'certificate' || scope.certificates.includes(e.object_ref));
      }
      let certificates = await q('SELECT * FROM certificate ORDER BY number');
      if (scope.sites) certificates = certificates.filter((x) => scope.sites.includes(x.site));
      if (scope.certificates) certificates = certificates.filter((x) => scope.certificates.includes(x.number));
      if (scope.grades) certificates = certificates.filter((x) => scope.grades.includes(x.grade));
      if (scope.period) certificates = certificates.filter((x) => x.period === scope.period);

      const chain = await checkChain();
      const payload = {
        reference,
        exported_by: s.identifier,
        exported_at: read_at,
        read_at,
        scope,
        // The export carries the digests and the anchor references of the
        // entries in its scope, so a reader can establish its integrity after it
        // has left this system.
        anchor: {
          first_seq: entries[0] ? Number(entries[0].seq) : null,
          first_digest: entries[0] ? entries[0].digest : null,
          last_seq: entries.length ? Number(entries[entries.length - 1].seq) : null,
          last_digest: entries.length ? entries[entries.length - 1].digest : null,
          chain_holds: chain.holds,
        },
        entries: entries.map(shapeEntry),
        certificates: certificates.map((x) => ({
          number: x.number, version: x.version, site: x.site, grade: x.grade,
          claim_type: x.claim_type, content_bp: x.content_bp, state: x.state,
          carbon: x.carbon, signed_at: x.signed_at, conditions_at_signing: x.conditions,
          input_versions: x.input_versions,
        })),
        derivations: {
          content_bp: 'credit_attached_g * 10000 / lot_mass_g, floored',
          dry_mass_g: 'net_g * (10000 - moisture_bp) / 10000, floored',
          credit_granted_g: 'dry_mass_consumed_g * factor_bp / 10000, floored',
        },
        empty: entries.length === 0 && certificates.length === 0,
      };
      await pool.query(
        'UPDATE export SET result = $1, entry_count = $2 WHERE reference = $3',
        [JSON.stringify({ entry_count: entries.length, certificate_count: certificates.length }), entries.length, reference]);
      // An export that returns nothing is recorded too.
      await record(c, {
        action: 'export_produced', object_kind: 'export', object_ref: reference,
        content: { scope, entry_count: entries.length, certificate_count: certificates.length, empty: payload.empty },
      });
      return { status: 201, body: payload };
    });
    return c.json(result.body, result.status);
  });

  /* ----------------------------------------------------------- inbound */
  app.get('/inbound', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT * FROM inbound_record ORDER BY received_at ASC');
    return c.json(rows.map((r) => ({
      reference: r.reference, source: r.source, received_at: r.received_at,
      // The bytes exactly as they arrived rather than the shape the app parsed
      // them into: a disagreement with a supplier is settled by what came in.
      payload_verbatim: r.payload_verbatim,
      recorded_at: r.recorded_at,
    })));
  });

  app.post('/inbound/:source', async (c) => {
    const source = c.req.param('source');
    const permitted = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];
    if (!permitted.includes(source)) {
      refuse(400, 'value_not_permitted', { message: `source is one of ${permitted.join(', ')}.`, permitted });
    }
    const raw = await c.req.text();
    let body;
    try { body = JSON.parse(raw || '{}'); } catch {
      refuse(400, 'payload_not_json', { message: 'The record did not parse as JSON.' });
    }
    if (!body.payload) refuse(400, 'field_required', { message: 'payload is required.', field: 'payload' });
    if (!body.received_at) refuse(400, 'field_required', { message: 'received_at is required.', field: 'received_at' });

    const result = await idempotent(c, body, async () => {
      const reference = await nextReference('INB');
      const verbatim = typeof body.payload === 'string' ? body.payload : JSON.stringify(body.payload);
      await pool.query(
        `INSERT INTO inbound_record (reference, source, received_at, payload, payload_verbatim)
         VALUES ($1,$2,$3,$4,$5)`,
        [reference, source, new Date(body.received_at).toISOString(),
          typeof body.payload === 'string' ? JSON.stringify({ raw: body.payload }) : JSON.stringify(body.payload),
          verbatim]);
      await record(c, {
        actor: c.get('session')?.identifier || `inbound:${source}`,
        action: 'inbound_record_received', object_kind: 'inbound_record', object_ref: reference,
        content: { source, received_at: body.received_at, payload_verbatim: verbatim },
      });
      return {
        status: 201,
        body: { reference, source, received_at: new Date(body.received_at).toISOString(), payload_verbatim: verbatim },
      };
    });
    return c.json(result.body, result.status);
  });

  /* ---------------------------------------------------- reconciliation */
  app.get('/reconciliation', async (c) => {
    refuseParams(c);
    requireSession(c);
    return c.json(await reconciliation());
  });
}

function shapeEntry(e) {
  return {
    seq: Number(e.seq),
    ts: e.ts,
    actor: e.actor,
    site: e.site,
    action: e.action,
    object_kind: e.object_kind,
    object_ref: e.object_ref,
    outcome: e.outcome,
    content: e.content_deleted ? null : e.content,
    content_deleted: e.content_deleted,
    deleted_on: iso(e.deleted_on),
    statement: e.content_deleted
      ? `The content of this entry was deleted under retention on ${iso(e.deleted_on)}.`
      : null,
    digest: e.digest,
    prev_digest: e.prev_digest,
  };
}

async function referencingFigures(e) {
  const out = [];
  if (e.object_kind === 'certificate' && e.object_ref) {
    const certs = await q('SELECT number, version FROM certificate WHERE number = $1', [e.object_ref]);
    for (const x of certs) out.push(`certificate ${x.number} v${x.version}`);
  }
  return out;
}

async function runQuery(name, c) {
  switch (name) {
    case 'lots_from_batch': {
      const batch = c.req.query('batch');
      const { batchImpact } = await import('../lib/engine.js');
      if (batch) {
        const r = await batchImpact(batch);
        return { batch, lots: r ? r.lots : [], certificates: r ? r.certificates : [], recipients: r ? r.recipients : [] };
      }
      const batches = await q('SELECT reference FROM batch ORDER BY reference');
      const results = [];
      for (const b of batches) {
        const r = await batchImpact(b.reference);
        results.push({ batch: b.reference, lots: r.lots, certificates: r.certificates, recipients: r.recipients });
      }
      return { results };
    }
    case 'certificates_on_period': {
      const period = c.req.query('period');
      const rows = period
        ? await q('SELECT * FROM certificate WHERE period = $1 ORDER BY number', [period])
        : await q('SELECT * FROM certificate ORDER BY period, number');
      return {
        period: period || null,
        results: rows.map((x) => ({
          number: x.number, version: x.version, period: x.period, state: x.state,
          site: x.site, recipient: x.recipient, recipient_name: x.recipient_name,
          content_bp: x.content_bp, claim_type: x.claim_type,
        })),
      };
    }
    case 'certificates_under_method_version': {
      const mv = c.req.query('method_version');
      const rows = await q('SELECT * FROM certificate ORDER BY number');
      const filtered = mv ? rows.filter((x) => x.carbon?.method_version === mv) : rows;
      return {
        method_version: mv || null,
        results: filtered.map((x) => ({
          number: x.number, version: x.version, method_version: x.carbon?.method_version,
          value_mg_per_kg: x.carbon?.value_mg_per_kg, boundary: x.carbon?.boundary,
          uncertainty_bp: x.carbon?.uncertainty_bp, state: x.state,
        })),
      };
    }
    case 'lots_released_under_unreviewed_override': {
      const rows = await q(
        `SELECT l.reference, l.site, l.grade, l.disposition, o.reference AS override, o.separation,
                o.authorised_by, o.reviewed
         FROM lot l JOIN separation_override o ON o.lot = l.reference
         WHERE o.reviewed = false AND l.disposition = 'released' ORDER BY l.reference`);
      return {
        results: rows.map((r) => ({
          lot: r.reference, site: r.site, grade: r.grade, disposition: r.disposition,
          override: r.override, separation: r.separation, authorised_by: r.authorised_by, reviewed: false,
        })),
      };
    }
    case 'allocations_in_final_fortnight': {
      const rows = await q(
        `SELECT m.*, p.period_to FROM credit_movement m JOIN balance_period p ON p.id = m.period_id
         WHERE m.source_kind = 'allocation' AND m.effective_on > p.period_to - INTERVAL '14 days'
         ORDER BY m.id`);
      return {
        results: rows.map((r) => ({
          reference: r.reference, period: r.period_id, lot: r.lot, category: r.category,
          mass_g: Number(r.mass_g), effective_on: iso(r.effective_on), created_by: r.created_by,
          period_to: iso(r.period_to),
        })),
      };
    }
    case 'refused_allocations': {
      const rows = await q(
        `SELECT * FROM record_entry WHERE action = 'allocation_refused' ORDER BY seq`);
      return {
        results: rows.map((r) => ({
          seq: Number(r.seq), ts: r.ts, actor: r.actor, period: r.object_ref,
          lot: r.content?.lot, category: r.content?.category,
          requested_g: r.content?.requested_g, available_g: r.content?.available_g,
          margin_at_instant_g: r.content?.margin_at_instant_g,
        })),
      };
    }
    case 'collector_declaration_departures': {
      const rows = await q(
        `SELECT * FROM collector_finding WHERE kind = 'declaration_departure' ORDER BY raised_on`);
      return {
        results: rows.map((r) => ({
          reference: r.id, collector: r.collector, batch: r.batch, departure_bp: r.departure_bp,
          detail: r.detail, raised_on: iso(r.raised_on), state: r.state,
        })),
      };
    }
    case 'acts_by_person': {
      const person = c.req.query('person');
      const rows = person
        ? await q('SELECT * FROM record_entry WHERE actor = $1 ORDER BY seq', [person])
        : await q('SELECT * FROM record_entry ORDER BY seq');
      return { person: person || null, results: rows.map(shapeEntry) };
    }
    case 'exports_by_auditor': {
      const auditors = await q(`SELECT identifier FROM person WHERE role = 'auditor'`);
      const ids = auditors.map((a) => a.identifier);
      const rows = await q('SELECT * FROM export WHERE actor = ANY($1) ORDER BY created_at', [ids]);
      return {
        // The last of those includes the reads that returned nothing.
        results: rows.map((e) => ({
          reference: e.reference, actor: e.actor, scope: e.scope,
          scope_recorded_at: e.scope_recorded_at, entry_count: e.entry_count,
          returned_nothing: e.entry_count === 0, created_at: e.created_at,
        })),
      };
    }
    default:
      return { results: [] };
  }
}
