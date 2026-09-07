import { query, one, tx, nextCounter } from '../db.js';
import {
  refuse, requireSession, requireRole, refuseAuditorWrite, withIdempotency,
  refusePagination, todayISO, dateOnly, momentISO,
} from '../lib/http.js';
import { appendEntry, checkChain, ZERO_DIGEST } from '../lib/record.js';
import * as engine from '../engine.js';

const SCHEME_MONTHS = 120;
const STATUTORY_MONTHS = 84;

function entryPayload(e) {
  return {
    seq: Number(e.seq),
    act: e.act,
    person: e.person,
    site: e.site,
    object_kind: e.object_kind,
    object_ref: e.object_ref,
    outcome: e.outcome,
    content: e.content_deleted ? null : e.content,
    content_deleted: e.content_deleted,
    deleted_note: e.content_deleted
      ? `This entry's content was deleted under retention on ${dateOnly(e.deleted_on)}. Its position and its digest survive.`
      : null,
    digest: e.digest,
    prev_digest: e.prev_digest,
    event_at: momentISO(e.event_at),
    recorded_at: momentISO(e.recorded_at),
    effective_on: dateOnly(e.effective_on),
    corrects: e.corrects === null ? null : Number(e.corrects),
  };
}

function addMonths(iso, months) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export default function register(api) {
  api.get('/record', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM record_entry ORDER BY seq');
    return c.json(rows.map(entryPayload));
  });

  api.get('/record/check', async (c) => {
    requireSession(c);
    const rows = await query('SELECT * FROM record_entry ORDER BY seq');
    const result = checkChain(rows);
    return c.json({
      ...result,
      entries: rows.length,
      first_prev_digest: rows[0] ? rows[0].prev_digest : ZERO_DIGEST,
      read_at: new Date().toISOString(),
    });
  });

  // Every attempt to modify or remove an entry is refused.
  for (const method of ['patch', 'put', 'delete']) {
    api[method]('/record/:seq', async (c) => {
      const s = requireSession(c);
      await tx((client) => appendEntry(client, {
        act: 'record_modification_refused', person: s.email, object_kind: 'record_entry',
        object_ref: c.req.param('seq'), outcome: 'refused',
        content: { method: method.toUpperCase(), rule: 'no entry is edited and no entry is removed from the sequence' },
      }));
      throw refuse(405, 'record_is_append_only',
        'No entry is edited and no entry is removed from the sequence. A correction is a new entry naming what it corrects.');
    });
  }

  api.post('/record/:seq/correction', async (c) => {
    const s = requireSession(c);
    refuseAuditorWrite(s);
    const seq = Number(c.req.param('seq'));
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /record/${seq}/correction`, body, async () => {
      const target = await one('SELECT * FROM record_entry WHERE seq = $1', [seq]);
      if (!target) throw refuse(404, 'no_such_entry', 'No such record entry.');
      if (!body.detail) throw refuse(400, 'detail_required', 'A correction names what it corrects.');
      const result = await tx((client) => appendEntry(client, {
        act: 'correction_recorded', person: s.email, object_kind: 'record_entry',
        object_ref: String(seq), corrects: seq,
        content: { corrects: seq, detail: body.detail },
      }));
      return { status: 201, body: { reference: String(result.seq), ...result, corrects: seq, detail: body.detail } };
    });
  });

  api.get('/record/:seq/retention', async (c) => {
    requireSession(c);
    const seq = Number(c.req.param('seq'));
    const e = await one('SELECT * FROM record_entry WHERE seq = $1', [seq]);
    if (!e) throw refuse(404, 'no_such_entry', 'No such record entry.');
    const from = dateOnly(e.effective_on);
    const schemeUntil = addMonths(from, SCHEME_MONTHS);
    const statutoryUntil = addMonths(from, STATUTORY_MONTHS);
    // Every version an issued figure was computed against is retained for as
    // long as any figure references it.
    let referencedUntil = null;
    if (e.object_kind === 'certificate') {
      const cert = await one('SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC LIMIT 1', [e.object_ref]);
      if (cert) referencedUntil = addMonths(dateOnly(cert.issued_on), SCHEME_MONTHS + 60);
    }
    const hold = await one('SELECT * FROM legal_hold WHERE seq = $1 AND active = true', [seq]);
    const candidates = [schemeUntil, statutoryUntil, referencedUntil].filter(Boolean).sort();
    const retainUntil = candidates[candidates.length - 1];
    return c.json({
      seq,
      scheme_months: SCHEME_MONTHS,
      statutory_months: STATUTORY_MONTHS,
      scheme_until: schemeUntil,
      statutory_until: statutoryUntil,
      referenced_until: referencedUntil,
      retain_until: retainUntil,
      legal_hold: !!hold,
      legal_hold_reference: hold ? hold.reference : null,
      content_deleted: e.content_deleted,
      derivation: { rule: 'retain_until is the longest of the three and is computed rather than stored' },
    });
  });

  api.post('/record/:seq/legal-hold', async (c) => {
    const s = requireRole(c, 'quality_manager', 'claims_manager', 'auditor');
    const seq = Number(c.req.param('seq'));
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /record/${seq}/legal-hold`, body, async () => {
      const e = await one('SELECT * FROM record_entry WHERE seq = $1', [seq]);
      if (!e) throw refuse(404, 'no_such_entry', 'No such record entry.');
      const existing = await one('SELECT * FROM legal_hold WHERE seq = $1 AND active = true', [seq]);
      if (existing) return { status: 200, body: { reference: existing.reference, seq, legal_hold: true } };
      const reference = await tx(async (client) => {
        const r = await nextCounter(client, 'legal_hold', 4, 'HLD-');
        await client.query(
          'INSERT INTO legal_hold (reference,seq,placed_by,active) VALUES ($1,$2,$3,true)',
          [r, seq, s.email]
        );
        await appendEntry(client, {
          act: 'legal_hold_placed', person: s.email, object_kind: 'record_entry', object_ref: String(seq),
          content: { hold: r, seq, reason: body.reason || null },
        });
        return r;
      });
      return { status: 201, body: { reference, seq, legal_hold: true, placed_by: s.email } };
    });
  });

  api.delete('/record/:seq/legal-hold', async (c) => {
    const s = requireRole(c, 'quality_manager', 'claims_manager', 'auditor');
    const seq = Number(c.req.param('seq'));
    const existing = await one('SELECT * FROM legal_hold WHERE seq = $1 AND active = true', [seq]);
    if (!existing) throw refuse(404, 'no_hold', 'No hold stands on this entry.');
    await tx(async (client) => {
      await client.query(
        'UPDATE legal_hold SET active = false, lifted_by = $2, lifted_at = now() WHERE reference = $1',
        [existing.reference, s.email]
      );
      await appendEntry(client, {
        act: 'legal_hold_lifted', person: s.email, object_kind: 'record_entry', object_ref: String(seq),
        content: { hold: existing.reference, seq },
      });
    });
    return c.json({ reference: existing.reference, seq, legal_hold: false, lifted_by: s.email });
  });

  // The entry's position and its digest survive.
  api.post('/record/:seq/expire', async (c) => {
    const s = requireRole(c, 'quality_manager', 'claims_manager');
    const seq = Number(c.req.param('seq'));
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /record/${seq}/expire`, body, async () => {
      const e = await one('SELECT * FROM record_entry WHERE seq = $1', [seq]);
      if (!e) throw refuse(404, 'no_such_entry', 'No such record entry.');
      const hold = await one('SELECT * FROM legal_hold WHERE seq = $1 AND active = true', [seq]);
      if (hold) {
        throw refuse(409, 'legal_hold_stands', 'A record under hold refuses deletion.', { legal_hold: hold.reference });
      }
      const from = dateOnly(e.effective_on);
      const retainUntil = [addMonths(from, SCHEME_MONTHS), addMonths(from, STATUTORY_MONTHS)].sort().pop();
      if (retainUntil > todayISO()) {
        throw refuse(409, 'retention_has_not_passed',
          `This entry is retained until ${retainUntil}.`, { retain_until: retainUntil });
      }
      // The one fact never deleted is that a certificate existed.
      const deletedOn = todayISO();
      await tx(async (client) => {
        await client.query(
          'UPDATE record_entry SET content = NULL, content_deleted = true, deleted_on = $2 WHERE seq = $1',
          [seq, deletedOn]
        );
        await appendEntry(client, {
          act: 'record_content_expired', person: s.email, object_kind: 'record_entry', object_ref: String(seq),
          content: { seq, deleted_on: deletedOn, retain_until: retainUntil },
        });
      });
      const after = await one('SELECT * FROM record_entry WHERE seq = $1', [seq]);
      return { status: 200, body: entryPayload(after) };
    });
  });

  // ---- The nine record queries -------------------------------------------

  const QUERIES = {
    lots_from_batch: async (params) => {
      const batch = params.batch || 'BATCH-1001';
      const impact = await engine.batchImpact(batch);
      return impact ? impact.lots : [];
    },
    certificates_on_period: async (params) => {
      const period = params.period;
      const rows = period
        ? await query('SELECT * FROM certificate WHERE period = $1 ORDER BY number, version', [period])
        : await query('SELECT * FROM certificate ORDER BY number, version');
      return rows.map((x) => ({
        certificate: x.number, version: x.version, period: x.period, state: x.state,
        recipient: x.recipient, recipient_name: x.recipient_name, issued_on: dateOnly(x.issued_on),
      }));
    },
    certificates_under_method_version: async (params) => {
      const rows = await query('SELECT * FROM certificate ORDER BY number, version');
      const wanted = params.method_version;
      return rows
        .filter((x) => !wanted || (x.input_versions || {}).carbon_method === wanted)
        .map((x) => ({
          certificate: x.number, version: x.version, state: x.state,
          method_version: (x.input_versions || {}).carbon_method,
          carbon_value_mg_per_kg: (x.carbon || {}).value_mg_per_kg,
          boundary: (x.carbon || {}).boundary,
          uncertainty_bp: (x.carbon || {}).uncertainty_bp,
        }));
    },
    lots_released_under_unreviewed_override: async () => {
      const rows = await query(
        `SELECT l.reference AS lot, l.site, l.disposition, o.reference AS override, o.separation,
                o.authorised_by, o.reason
           FROM lot l JOIN override o ON o.lot = l.reference
          WHERE o.reviewed = false AND l.disposition = 'released' ORDER BY l.reference`
      );
      return rows;
    },
    allocations_in_final_fortnight: async () => {
      const rows = await query(
        `SELECT m.*, p.period_to FROM credit_movement m
           JOIN balance_period p ON p.id = m.period
          WHERE m.movement = 'allocation'
            AND m.effective_on > p.period_to - INTERVAL '14 days'
            AND m.effective_on <= p.period_to
          ORDER BY m.reference`
      );
      return rows.map((m) => ({
        movement: m.reference, period: m.period, lot: m.lot, category: m.category,
        mass_g: Number(m.mass_g), effective_on: dateOnly(m.effective_on),
        period_to: dateOnly(m.period_to), recorded_by: m.recorded_by,
      }));
    },
    refused_allocations: async () => {
      const rows = await query(
        "SELECT * FROM record_entry WHERE act = 'allocation_refused' ORDER BY seq"
      );
      return rows.map((e) => ({
        seq: Number(e.seq), person: e.person, lot: e.object_ref,
        requested_g: (e.content || {}).requested_g,
        available_g: (e.content || {}).available_g,
        margin_at_instant_g: (e.content || {}).margin_at_instant_g,
        event_at: momentISO(e.event_at),
      }));
    },
    collector_declaration_departures: async () => {
      const rows = await query(
        "SELECT * FROM finding WHERE kind = 'declaration_departure' ORDER BY reference"
      );
      return rows.map((f) => ({
        finding: f.reference, collector: f.collector, batch: f.batch,
        departure_bp: f.departure_bp, detail: f.detail, raised_on: dateOnly(f.raised_on),
        due_on: dateOnly(f.due_on), state: f.state,
      }));
    },
    acts_by_person: async (params) => {
      const person = params.person;
      const rows = person
        ? await query('SELECT * FROM record_entry WHERE person = $1 ORDER BY seq', [person])
        : await query('SELECT * FROM record_entry WHERE person IS NOT NULL ORDER BY seq');
      return rows.map(entryPayload);
    },
    exports_by_auditor: async (params) => {
      const who = params.auditor;
      const rows = who
        ? await query('SELECT * FROM export WHERE requested_by = $1 ORDER BY reference', [who])
        : await query('SELECT * FROM export ORDER BY reference');
      // The last of those includes the reads that returned nothing.
      return rows.map((e) => ({
        reference: e.reference, requested_by: e.requested_by, requested_at: momentISO(e.requested_at),
        scope: e.scope, entry_count: e.entry_count, returned_nothing: e.entry_count === 0,
      }));
    },
  };

  api.get('/record/queries/:name', async (c) => {
    refusePagination(c);
    requireSession(c);
    const name = c.req.param('name');
    const fn = QUERIES[name];
    if (!fn) {
      throw refuse(404, 'no_such_query',
        `The record answers nine questions: ${Object.keys(QUERIES).join(', ')}.`);
    }
    const params = Object.fromEntries(new URL(c.req.url).searchParams.entries());
    const rows = await fn(params);
    return c.json(rows);
  });

  // ---- Exports ------------------------------------------------------------

  api.post('/exports', async (c) => {
    const s = requireSession(c);
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, 'POST /exports', body, async () => {
      const scope = {
        period: body.period || null,
        sites: body.sites || [],
        grades: body.grades || [],
        certificates: body.certificates || [],
        lots: body.lots || [],
      };
      // The scope is recorded before the read.
      const reference = await tx(async (client) => {
        const r = await nextCounter(client, 'export', 4, 'EXP-');
        await client.query(
          'INSERT INTO export (reference,scope,requested_by,entry_count,payload) VALUES ($1,$2,$3,0,$4)',
          [r, JSON.stringify(scope), s.email, JSON.stringify({ pending: true })]
        );
        await appendEntry(client, {
          act: 'export_scope_recorded', person: s.email, object_kind: 'export', object_ref: r,
          content: { scope },
        });
        return r;
      });

      const readAt = new Date().toISOString();
      const entries = await query(
        `SELECT * FROM record_entry
          WHERE ($1::text[] = '{}' OR site = ANY($1::text[]))
          ORDER BY seq`,
        [scope.sites]
      );
      const certificates = scope.certificates.length
        ? await query('SELECT * FROM certificate WHERE number = ANY($1::text[]) ORDER BY number, version', [scope.certificates])
        : await query('SELECT * FROM certificate ORDER BY number, version');
      const lots = [];
      for (const lr of scope.lots) {
        const g = await engine.genealogy(lr);
        if (g) lots.push(g);
      }
      const payload = {
        reference,
        scope,
        read_at: readAt,
        requested_by: s.email,
        entries: entries.map(entryPayload),
        anchor_references: entries.map((e) => ({ seq: Number(e.seq), digest: e.digest, prev_digest: e.prev_digest })),
        certificates: certificates.map((x) => ({
          number: x.number, version: x.version, state: x.state, content_bp: Number(x.content_bp),
          claim_type: x.claim_type, carbon: x.carbon, input_versions: x.input_versions,
          document: x.document,
        })),
        genealogies: lots,
        chain: checkChain(entries),
        derivations: {
          content_bp: 'credit_attached_g * 10000 / lot_mass_g, floored',
          dry_mass_g: 'net_g * (10000 - moisture_bp) / 10000, floored',
          credit_granted_g: 'dry_mass_consumed_g * factor_bp / 10000, floored',
        },
        self_contained: true,
        note: 'The export carries the digests and the anchor references of the entries in its scope, so a reader can establish its integrity after it has left this system.',
      };
      await tx(async (client) => {
        await client.query(
          'UPDATE export SET entry_count = $2, payload = $3 WHERE reference = $1',
          [reference, entries.length, JSON.stringify(payload)]
        );
        // An export that returns nothing is recorded too.
        await appendEntry(client, {
          act: 'export_taken', person: s.email, object_kind: 'export', object_ref: reference,
          content: { scope, entry_count: entries.length, returned_nothing: entries.length === 0, read_at: readAt },
        });
      });
      return { status: 201, body: payload };
    });
  });

  api.get('/exports', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM export ORDER BY reference');
    return c.json(rows.map((e) => ({
      reference: e.reference, scope: e.scope, requested_by: e.requested_by,
      requested_at: momentISO(e.requested_at), entry_count: e.entry_count,
      returned_nothing: e.entry_count === 0,
    })));
  });

  api.get('/exports/:reference', async (c) => {
    requireSession(c);
    const e = await one('SELECT * FROM export WHERE reference = $1', [c.req.param('reference')]);
    if (!e) throw refuse(404, 'no_such_export', 'No such export.');
    return c.json(e.payload);
  });

  // An auditor annotates.
  api.post('/annotations', async (c) => {
    const s = requireSession(c);
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, 'POST /annotations', body, async () => {
      const { subject_kind, subject_ref, note } = body;
      if (!subject_ref || !note) throw refuse(400, 'fields_required', 'subject_ref and note are required.');
      const reference = await tx(async (client) => {
        const r = await nextCounter(client, 'annotation', 4, 'ANN-');
        await client.query(
          'INSERT INTO annotation (reference,subject_kind,subject_ref,note,author) VALUES ($1,$2,$3,$4,$5)',
          [r, subject_kind || 'unknown', subject_ref, note, s.email]
        );
        await appendEntry(client, {
          act: 'annotation_recorded', person: s.email, object_kind: subject_kind || 'unknown',
          object_ref: subject_ref, content: { note },
        });
        return r;
      });
      return { status: 201, body: { reference, subject_kind, subject_ref, note, author: s.email } };
    });
  });

  api.get('/annotations', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM annotation ORDER BY reference');
    return c.json(rows.map((a) => ({
      reference: a.reference, subject_kind: a.subject_kind, subject_ref: a.subject_ref,
      note: a.note, author: a.author, recorded_at: momentISO(a.recorded_at),
    })));
  });
}
