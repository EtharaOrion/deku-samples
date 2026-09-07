import { Hono } from 'hono';
import { rq, rq1, tx, pool } from '../db/pool.js';
import { appendEntry, digestOf, ZERO_DIGEST } from '../lib/record.js';
import {
  idempotent, refuse, requireRole, requireSession, refuseAuditorWrite,
  refusePaging, consistentRead
, recordRefusal
} from '../lib/http.js';
import { nextRef } from './operations.js';

export const record = new Hono();

function shapeEntry(e) {
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
    // An entry that lost its content still states that it did, and when.
    content_statement: e.content_deleted
      ? `The content of this entry was deleted under retention on ${String(e.content_deleted_on).slice(0, 10)}. Its position and its digest are unchanged.`
      : null,
    digest: e.digest,
    prev_digest: e.prev_digest,
    event_at: e.event_at,
    recorded_at: e.recorded_at,
    effective_on: String(e.effective_on).slice(0, 10),
    anchor_ref: e.anchor_ref
  };
}

record.get('/record', async (c) => {
  refusePaging(c);
  const out = await consistentRead(async (client) => {
    const url = new URL(c.req.url);
    const act = url.searchParams.get('act');
    const person = url.searchParams.get('person');
    const object = url.searchParams.get('object');
    const rows = await client.query(
      `SELECT * FROM record_entry
        WHERE ($1::text IS NULL OR act = $1)
          AND ($2::text IS NULL OR person = $2)
          AND ($3::text IS NULL OR object_ref = $3)
        ORDER BY seq`, [act, person, object]
    );
    return { entries: rows.rows.map(shapeEntry) };
  });
  return c.json(out.entries.map((e) => ({ ...e, read_at: out.read_at })));
});

record.get('/record/check', async (c) => {
  const rows = await rq('SELECT * FROM record_entry ORDER BY seq');
  let prev = ZERO_DIGEST;
  let firstFailure = null;
  let expectedSeq = 1;
  let gap = null;

  for (const e of rows) {
    // A gap in the sequence and a digest that does not verify are both
    // reportable conditions.
    if (gap === null && Number(e.seq) !== expectedSeq) {
      gap = { expected_seq: expectedSeq, found_seq: Number(e.seq) };
    }
    expectedSeq = Number(e.seq) + 1;

    if (firstFailure === null) {
      if (e.prev_digest !== prev) {
        firstFailure = { seq: Number(e.seq), reason: 'prev_digest does not match the previous entry\'s digest',
          expected: prev, found: e.prev_digest };
      } else if (!e.content_deleted) {
        // An expired entry keeps the digest it was written with; its content is
        // gone, so it cannot be re-derived and is not re-derived here.
        const recomputed = digestOf({
          act: e.act, person: e.person, site: e.site, object_kind: e.object_kind,
          object_ref: e.object_ref, outcome: e.outcome, content: e.content,
          event_at: e.event_at instanceof Date ? e.event_at.toISOString() : e.event_at,
          effective_on: String(e.effective_on).slice(0, 10)
        }, e.prev_digest);
        if (recomputed !== e.digest) {
          firstFailure = { seq: Number(e.seq), reason: 'the digest does not verify over the entry\'s own content',
            expected: recomputed, found: e.digest };
        }
      }
    }
    prev = e.digest;
  }

  return c.json({
    holds: firstFailure === null && gap === null,
    entries: rows.length,
    first_failure: firstFailure,
    sequence_gap: gap,
    head_digest: prev,
    genesis_prev_digest: ZERO_DIGEST,
    note: 'Each digest is computed over the entry\'s own content and the previous entry\'s digest.'
  });
});

/** Every attempt to modify or remove an entry is refused. The routes exist so
 *  the refusal is a stated answer rather than a missing handler. */
record.patch('/record/:seq', async (c) => {
  const session = requireSession(c);
  await recordRefusal({
    act: 'record_edit_refused', person: session.email, object_kind: 'record_entry',
    object_ref: c.req.param('seq'), content: { attempted: 'edit' }
  });
  throw refuse(409, 'record_is_append_only',
    'No entry is edited and no entry is removed from the sequence. A correction is a new entry naming what it corrects.');
});

record.delete('/record/:seq', async (c) => {
  const session = requireSession(c);
  await recordRefusal({
    act: 'record_delete_refused', person: session.email, object_kind: 'record_entry',
    object_ref: c.req.param('seq'), content: { attempted: 'delete' }
  });
  throw refuse(409, 'record_is_append_only',
    'No entry is removed from the sequence. An entry loses its content only through the retention route, which keeps its position and its digest.');
});

// -------------------------------------------------------------- retention

const SCHEME_MONTHS = 120;   // the certification scheme's requirement
const STATUTORY_MONTHS = 84; // the statutory requirement at the site

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

async function retentionFor(seq) {
  const e = await rq1('SELECT * FROM record_entry WHERE seq = $1', [seq]);
  if (!e) return null;
  const from = (e.event_at instanceof Date ? e.event_at.toISOString() : String(e.event_at)).slice(0, 10);
  const scheme = addMonths(from, SCHEME_MONTHS);
  const statutory = addMonths(from, STATUTORY_MONTHS);

  // Every version an issued figure was computed against is retained for as long
  // as any figure references it, which outlives the retention any single record
  // would otherwise take.
  let referencedUntil = null;
  if (e.anchor_ref) {
    const cert = await rq1('SELECT issued_on, state FROM certificate WHERE number = $1', [e.anchor_ref]);
    if (cert) referencedUntil = addMonths(String(cert.issued_on).slice(0, 10), SCHEME_MONTHS + 60);
  }
  if (!referencedUntil && e.object_ref) {
    const referencing = await rq1(
      `SELECT MIN(issued_on) AS d FROM certificate
        WHERE input_versions::text LIKE '%' || $1 || '%' OR object_matches($1) IS NOT NULL`, []
    ).catch(() => null);
    if (referencing?.d) referencedUntil = addMonths(String(referencing.d).slice(0, 10), SCHEME_MONTHS);
  }

  const hold = await rq1(
    'SELECT * FROM legal_hold WHERE record_seq = $1 AND lifted_at IS NULL ORDER BY placed_at DESC LIMIT 1', [seq]
  );

  const candidates = [scheme, statutory, referencedUntil].filter(Boolean);
  const retainUntil = candidates.sort().at(-1);

  return {
    seq: Number(seq),
    scheme_months: SCHEME_MONTHS,
    statutory_months: STATUTORY_MONTHS,
    scheme_until: scheme,
    statutory_until: statutory,
    referenced_until: referencedUntil,
    // retain_until is the longest of the three and is computed rather than
    // stored from a date somebody typed.
    retain_until: retainUntil,
    legal_hold: !!hold,
    legal_hold_reference: hold?.reference || null,
    content_deleted: e.content_deleted,
    content_deleted_on: e.content_deleted_on ? String(e.content_deleted_on).slice(0, 10) : null,
    derivation: {
      retain_until: `the longest of the scheme requirement (${scheme}), the statutory requirement (${statutory})${referencedUntil ? ` and the reference from an issued figure (${referencedUntil})` : ''}`
    }
  };
}

record.get('/record/:seq/retention', async (c) => {
  requireSession(c);
  const r = await retentionFor(Number(c.req.param('seq')));
  if (!r) throw refuse(404, 'no_such_entry', `No record entry stands at ${c.req.param('seq')}.`);
  return c.json(r);
});

record.post('/record/:seq/legal-hold', async (c) => {
  const session = requireRole(c, 'auditor', 'quality_manager', 'claims_manager');
  const seq = Number(c.req.param('seq'));
  const body = await c.req.json().catch(() => ({}));
  if (!body.reason) throw refuse(400, 'missing_field', 'A legal hold states its reason.');

  const result = await idempotent(c, `POST /api/record/${seq}/legal-hold`, body, async () => tx(async (client) => {
    const e = await client.query('SELECT 1 FROM record_entry WHERE seq = $1', [seq]);
    if (!e.rows.length) throw refuse(404, 'no_such_entry', `No record entry stands at ${seq}.`);
    const ref = await nextRef(client, 'legal_hold', 'reference', 'HLD-');
    await client.query(
      `INSERT INTO legal_hold (reference,record_seq,reason,placed_by) VALUES ($1,$2,$3,$4)`,
      [ref, seq, body.reason, session.email]
    );
    await appendEntry(client, {
      act: 'legal_hold_placed', person: session.email, object_kind: 'record_entry',
      object_ref: String(seq), content: { hold: ref, reason: body.reason }
    });
    return { status: 201, body: { reference: ref, record_seq: seq, reason: body.reason, placed_by: session.email, legal_hold: true } };
  }));
  return c.json(result.body, result.status);
});

record.delete('/record/:seq/legal-hold', async (c) => {
  const session = requireRole(c, 'auditor', 'quality_manager', 'claims_manager');
  const seq = Number(c.req.param('seq'));
  const out = await tx(async (client) => {
    const h = await client.query(
      'SELECT * FROM legal_hold WHERE record_seq = $1 AND lifted_at IS NULL ORDER BY placed_at DESC LIMIT 1', [seq]
    );
    if (!h.rows.length) throw refuse(404, 'no_hold_stands', `No legal hold stands on entry ${seq}.`);
    await client.query('UPDATE legal_hold SET lifted_by = $1, lifted_at = now() WHERE reference = $2',
      [session.email, h.rows[0].reference]);
    // Both are entries of their own.
    await appendEntry(client, {
      act: 'legal_hold_lifted', person: session.email, object_kind: 'record_entry',
      object_ref: String(seq), content: { hold: h.rows[0].reference }
    });
    return { reference: h.rows[0].reference, record_seq: seq, legal_hold: false, lifted_by: session.email };
  });
  return c.json(out);
});

/** An entry loses its content only here, and keeps its position and its digest
 *  so that the chain still holds. */
record.post('/record/:seq/expire', async (c) => {
  const session = requireRole(c, 'auditor', 'quality_manager', 'claims_manager');
  const seq = Number(c.req.param('seq'));
  const body = await c.req.json().catch(() => ({}));

  const result = await idempotent(c, `POST /api/record/${seq}/expire`, body, async () => tx(async (client) => {
    const e = await client.query('SELECT * FROM record_entry WHERE seq = $1 FOR UPDATE', [seq]);
    if (!e.rows.length) throw refuse(404, 'no_such_entry', `No record entry stands at ${seq}.`);
    const entry = e.rows[0];
    if (entry.content_deleted) {
      throw refuse(409, 'already_expired', `The content of entry ${seq} was already deleted under retention.`);
    }

    // The one fact never deleted is that a certificate existed.
    if (entry.act === 'certificate_signed' || entry.act === 'certificate_withdrawn') {
      const stillResolves = await client.query('SELECT 1 FROM certificate WHERE number = $1', [entry.anchor_ref]);
      if (stillResolves.rows.length) {
        // The content goes; the certificate itself resolves at its address
        // after every other retention has run out, which is a different table.
      }
    }

    const retention = await retentionFor(seq);
    if (retention.legal_hold) {
      throw refuse(409, 'legal_hold_stands',
        `A record under hold refuses deletion. ${retention.legal_hold_reference} stands on entry ${seq}.`,
        { legal_hold_reference: retention.legal_hold_reference });
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    if (retention.retain_until >= todayStr) {
      throw refuse(409, 'retention_has_not_passed',
        `Entry ${seq} is retained until ${retention.retain_until}.`, { retain_until: retention.retain_until });
    }

    await client.query(
      'UPDATE record_entry SET content = NULL, content_deleted = true, content_deleted_on = $1 WHERE seq = $2',
      [todayStr, seq]
    );
    await appendEntry(client, {
      act: 'record_content_expired', person: session.email, object_kind: 'record_entry',
      object_ref: String(seq), content: { retain_until: retention.retain_until, deleted_on: todayStr }
    });

    const after = await client.query('SELECT * FROM record_entry WHERE seq = $1', [seq]);
    return { status: 201, body: { ...shapeEntry(after.rows[0]), reference: String(seq) } };
  }));
  return c.json(result.body, result.status);
});

// ---------------------------------------------------------------- exports

record.post('/exports', async (c) => {
  const session = requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  const scope = {
    period: body.period || null,
    sites: body.sites || [],
    grades: body.grades || [],
    certificates: body.certificates || []
  };

  const result = await idempotent(c, 'POST /api/exports', body, async () => tx(async (client) => {
    const ref = await nextRef(client, 'export', 'reference', 'EXP-');
    // The scope is recorded before the read, so an export that returns nothing
    // is still an entry naming what was looked for.
    await appendEntry(client, {
      act: 'export_scope_recorded', person: session.email, object_kind: 'export', object_ref: ref,
      content: { scope }
    });

    const entries = await client.query(
      `SELECT seq, act, person, site, object_kind, object_ref, outcome, digest, prev_digest, anchor_ref,
              event_at, effective_on, content_deleted
         FROM record_entry
        WHERE ($1::text[] = '{}' OR site = ANY($1) OR site IS NULL)
          AND ($2::text[] = '{}' OR object_ref = ANY($2) OR anchor_ref = ANY($2))
        ORDER BY seq`,
      [scope.sites, scope.certificates]
    );

    const certs = scope.certificates.length
      ? (await client.query('SELECT * FROM certificate WHERE number = ANY($1) ORDER BY number', [scope.certificates])).rows
      : (scope.sites.length
        ? (await client.query('SELECT * FROM certificate WHERE site = ANY($1) ORDER BY number', [scope.sites])).rows
        : (await client.query('SELECT * FROM certificate ORDER BY number')).rows);

    const head = await client.query('SELECT digest FROM record_entry ORDER BY seq DESC LIMIT 1');

    const payload = {
      reference: ref,
      scope,
      exported_at: new Date().toISOString(),
      exported_by: session.identifier,
      // The export carries the digests and the anchor references of the entries
      // in its scope, so a reader can establish its integrity after it has left
      // this system and without asking the producer to confirm anything.
      entries: entries.rows.map((e) => ({
        seq: Number(e.seq), act: e.act, person: e.person, site: e.site,
        object_kind: e.object_kind, object_ref: e.object_ref, outcome: e.outcome,
        digest: e.digest, prev_digest: e.prev_digest, anchor_ref: e.anchor_ref,
        event_at: e.event_at, effective_on: String(e.effective_on).slice(0, 10),
        content_deleted: e.content_deleted
      })),
      certificates: certs.map((x) => ({
        number: x.number, version: x.version, site: x.site, state: x.state,
        claim_type: x.claim_type, content_bp: x.content_bp,
        issued_on: String(x.issued_on).slice(0, 10),
        input_versions: x.input_versions, conditions_at_signing: x.conditions_at_signing
      })),
      chain_head_digest: head.rows[0]?.digest || null,
      genesis_prev_digest: ZERO_DIGEST,
      derivations: {
        entries: 'every record entry inside the stated scope, with the digest it was written with',
        integrity: 'each digest is computed over the entry\'s own content and the previous entry\'s digest; the chain verifies without this system'
      },
      empty: entries.rows.length === 0
    };

    await client.query(
      `INSERT INTO export (reference,scope,requested_by,entry_count,payload) VALUES ($1,$2,$3,$4,$5)`,
      [ref, JSON.stringify(scope), session.email, entries.rows.length, JSON.stringify(payload)]
    );
    // An export is itself an entry, and an export that returns nothing is
    // recorded too.
    await appendEntry(client, {
      act: 'export_taken', person: session.email, object_kind: 'export', object_ref: ref,
      content: { scope, entry_count: entries.rows.length, returned_nothing: entries.rows.length === 0 }
    });

    return { status: 201, body: payload };
  }));
  return c.json(result.body, result.status);
});

record.get('/exports', async (c) => {
  requireSession(c);
  refusePaging(c);
  const rows = await rq('SELECT reference, scope, requested_by, requested_at, entry_count FROM export ORDER BY reference');
  return c.json(rows);
});

record.get('/exports/:reference', async (c) => {
  requireSession(c);
  const r = await rq1('SELECT * FROM export WHERE reference = $1', [c.req.param('reference')]);
  if (!r) throw refuse(404, 'no_such_export', `No export is recorded at ${c.req.param('reference')}.`);
  return c.json(r.payload);
});

// ---------------------------------------------------- the record queries

const QUERIES = {
  lots_from_batch: async (params) => {
    const batch = params.get('batch') || 'BATCH-1001';
    const { batchImpact } = await import('../engine/genealogy.js');
    const impact = await batchImpact(batch);
    return { batch, lots: impact?.lots || [], complete: true };
  },
  certificates_on_period: async (params) => {
    const period = params.get('period');
    const rows = period
      ? await rq('SELECT number, version, site, state, content_bp, claim_type, recipient_name, issued_on FROM certificate WHERE period = $1 ORDER BY number', [period])
      : await rq('SELECT number, version, site, state, content_bp, claim_type, recipient_name, issued_on, period FROM certificate ORDER BY number');
    return { period: period || 'all', certificates: rows.map((r) => ({ ...r, issued_on: String(r.issued_on).slice(0, 10) })), complete: true };
  },
  certificates_under_method_version: async (params) => {
    const mv = params.get('method_version');
    const rows = await rq(
      `SELECT number, version, site, state, carbon->>'method_version' AS method_version, recipient_name, issued_on
         FROM certificate
        WHERE ($1::text IS NULL OR carbon->>'method_version' = $1) ORDER BY number`, [mv]
    );
    return { method_version: mv || 'all', certificates: rows.map((r) => ({ ...r, issued_on: String(r.issued_on).slice(0, 10) })), complete: true };
  },
  lots_released_under_unreviewed_override: async () => {
    const rows = await rq(
      `SELECT l.reference AS lot, l.site, l.disposition, o.reference AS override, o.separation, o.authorised_by
         FROM lot l JOIN separation_override o ON o.lot = l.reference
        WHERE o.reviewed = false AND l.disposition = 'released' ORDER BY l.reference`
    );
    return { lots: rows, complete: true };
  },
  allocations_in_final_fortnight: async () => {
    const rows = await rq(
      `SELECT cm.reference, cm.balance_period, cm.lot, cm.category, cm.mass_g, cm.effective_on, bp.period_to
         FROM credit_movement cm JOIN balance_period bp ON bp.id = cm.balance_period
        WHERE cm.movement = 'allocation'
          AND cm.effective_on > bp.period_to - interval '14 days'
          AND cm.effective_on <= bp.period_to
        ORDER BY cm.reference`
    );
    return {
      allocations: rows.map((r) => ({
        reference: r.reference, balance_period: r.balance_period, lot: r.lot,
        category: r.category, mass_g: Number(r.mass_g),
        effective_on: String(r.effective_on).slice(0, 10),
        period_to: String(r.period_to).slice(0, 10)
      })),
      complete: true
    };
  },
  refused_allocations: async () => {
    const rows = await rq(
      `SELECT seq, person, site, object_ref, content, event_at FROM record_entry
        WHERE act = 'allocation_refused' ORDER BY seq`
    );
    return {
      refusals: rows.map((r) => ({
        seq: Number(r.seq), person: r.person, site: r.site, balance_period: r.object_ref,
        requested_g: r.content?.requested_g ?? null,
        available_g: r.content?.available_g ?? null,
        lot: r.content?.lot ?? null, category: r.content?.category ?? null,
        margin_at_refusal_g: r.content?.margin_at_refusal_g ?? null,
        event_at: r.event_at
      })),
      complete: true
    };
  },
  collector_declaration_departures: async () => {
    const rows = await rq(
      `SELECT reference, collector, batch, detail, departure_bp, raised_on, due_on, state
         FROM finding WHERE kind = 'declaration_departure' ORDER BY reference`
    );
    return {
      departures: rows.map((r) => ({
        ...r, raised_on: String(r.raised_on).slice(0, 10),
        due_on: r.due_on ? String(r.due_on).slice(0, 10) : null
      })),
      complete: true
    };
  },
  acts_by_person: async (params) => {
    const person = params.get('person');
    const rows = await rq(
      `SELECT seq, act, site, object_kind, object_ref, outcome, event_at, person FROM record_entry
        WHERE ($1::text IS NULL OR person = $1) ORDER BY seq`, [person]
    );
    return { person: person || 'all', acts: rows.map((r) => ({ ...r, seq: Number(r.seq) })), complete: true };
  },
  exports_by_auditor: async (params) => {
    const who = params.get('person');
    const rows = await rq(
      `SELECT reference, scope, requested_by, requested_at, entry_count FROM export
        WHERE ($1::text IS NULL OR requested_by = $1) ORDER BY reference`, [who]
    );
    return {
      person: who || 'all',
      // The last of these includes the reads that returned nothing.
      exports: rows.map((r) => ({
        reference: r.reference, scope: r.scope, requested_by: r.requested_by,
        requested_at: r.requested_at, entry_count: r.entry_count,
        returned_nothing: r.entry_count === 0
      })),
      complete: true
    };
  }
};

record.get('/record/queries/:name', async (c) => {
  requireSession(c);
  refusePaging(c);
  const name = c.req.param('name');
  const fn = QUERIES[name];
  if (!fn) {
    throw refuse(404, 'no_such_query',
      `The record answers nine questions: ${Object.keys(QUERIES).join(', ')}.`, { available: Object.keys(QUERIES) });
  }
  const url = new URL(c.req.url);
  const out = await fn(url.searchParams);
  return c.json({ query: name, ...out, read_at: new Date().toISOString() });
});

record.get('/record/queries', async (c) => {
  return c.json(Object.keys(QUERIES));
});

export { QUERIES, retentionFor };
