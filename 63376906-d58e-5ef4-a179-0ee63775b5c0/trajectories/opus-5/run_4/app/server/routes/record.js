import { Hono } from 'hono';
import { q, one, pool } from '../db.js';
import { requireSession, requireRole, refuseAuditorWrites } from '../auth.js';
import { appendEntry, checkChain, shapeEntry } from '../record.js';
import { withIdempotency } from '../idempotency.js';
import { isoDate, isoStamp, ref, addMonths, monthsBetween } from '../util.js';
import { refusePaging } from './intake.js';

export const record = new Hono();

const SCHEME_MONTHS = 120;   // the certification scheme's requirement
const STATUTORY_MONTHS = 84; // the statutory requirement at the site

record.get('/record', async (c) => {
  requireSession(c);
  const bad = refusePaging(c);
  if (bad) return c.json(bad, 400);
  const rows = await q('SELECT * FROM record_entry ORDER BY seq ASC');
  return c.json(rows.map(shapeEntry));
});

record.get('/record/check', async (c) => {
  requireSession(c);
  const r = await checkChain();
  return c.json({ ...r, read_at: new Date().toISOString() });
});

// The nine questions the record exists to answer. Each is a complete set.
const QUERIES = {
  async lots_from_batch(params) {
    const batch = params.get('batch');
    const rows = await q(
      `SELECT DISTINCT l.reference, l.mass_g, l.disposition, l.site, l.grade, c.input_ref AS batch
       FROM consumption c JOIN run r ON r.reference = c.run JOIN lot l ON l.produced_by = r.reference
       WHERE c.input_kind = 'batch' ${batch ? 'AND c.input_ref = $1' : ''}`,
      batch ? [batch] : []
    );
    // Four hops: a batch reaches a lot through intermediates too.
    const { impact } = await import('../engine.js');
    const out = [];
    const batches = batch ? [{ reference: batch }] : await q('SELECT reference FROM batch');
    for (const b of batches) {
      const im = await impact(b.reference);
      if (!im) continue;
      for (const l of im.lots) {
        out.push({ batch: b.reference, lot: l.reference, mass_g: l.mass_g, disposition: l.disposition });
      }
    }
    return out;
  },
  async certificates_on_period(params) {
    const period = params.get('period');
    const rows = await q(
      `SELECT number, version, site, grade, recipient, recipient_name, state, period, signed_at
       FROM certificate ${period ? 'WHERE period = $1' : ''} ORDER BY number ASC`,
      period ? [period] : []
    );
    return rows.map((r) => ({ ...r, signed_at: isoStamp(r.signed_at) }));
  },
  async certificates_under_method_version(params) {
    const mv = params.get('method_version');
    const rows = await q(
      `SELECT number, version, site, state, recipient_name, carbon->>'method_version' AS method_version
       FROM certificate ${mv ? "WHERE carbon->>'method_version' = $1" : ''} ORDER BY number ASC`,
      mv ? [mv] : []
    );
    return rows;
  },
  async lots_released_under_unreviewed_override() {
    const rows = await q(
      `SELECT l.reference AS lot, l.site, l.disposition, o.reference AS override, o.separation,
              o.authorised_by, o.authorised_on, o.reviewed
       FROM lot l JOIN override o ON o.lot = l.reference
       WHERE o.reviewed = false AND l.disposition = 'released' ORDER BY l.reference ASC`
    );
    return rows.map((r) => ({ ...r, authorised_on: isoDate(r.authorised_on) }));
  },
  async allocations_in_final_fortnight() {
    const rows = await q(
      `SELECT cm.reference, cm.period, cm.lot, cm.category, cm.mass_g, cm.effective_on,
              bp.period_to, bp.state
       FROM credit_movement cm JOIN balance_period bp ON bp.id = cm.period
       WHERE cm.direction = 'out' AND cm.effective_on >= bp.period_to - INTERVAL '14 days'
         AND cm.effective_on <= bp.period_to
       ORDER BY cm.effective_on ASC`
    );
    return rows.map((r) => ({
      reference: r.reference, period: r.period, lot: r.lot, category: r.category,
      mass_g: Number(r.mass_g), effective_on: isoDate(r.effective_on),
      period_to: isoDate(r.period_to), period_state: r.state,
    }));
  },
  async refused_allocations() {
    const rows = await q('SELECT * FROM refused_allocation ORDER BY refused_at ASC');
    return rows.map((r) => ({
      reference: r.reference, period: r.period, lot: r.lot, category: r.category,
      requested_g: Number(r.requested_g), available_g: Number(r.available_g),
      margin_at_instant_g: Number(r.available_g),
      refused_at: isoStamp(r.refused_at), refused_for: r.refused_for,
    }));
  },
  async collector_declaration_departures() {
    const rows = await q(
      "SELECT * FROM finding WHERE kind = 'declaration_departure' ORDER BY raised_on ASC"
    );
    return rows.map((r) => ({
      reference: r.reference, collector: r.collector, batch: r.batch,
      departure_bp: r.departure_bp, detail: r.detail, raised_on: isoDate(r.raised_on),
      due_on: isoDate(r.due_on), state: r.state,
    }));
  },
  async acts_by_person(params) {
    const person = params.get('person');
    const rows = await q(
      `SELECT seq, act, person, site, object_kind, object_ref, at, outcome FROM record_entry
       ${person ? 'WHERE person = $1' : ''} ORDER BY seq ASC`,
      person ? [person] : []
    );
    return rows.map((r) => ({ ...r, seq: Number(r.seq), at: isoStamp(r.at) }));
  },
  async exports_by_auditor(params) {
    const person = params.get('person');
    const rows = await q(
      `SELECT * FROM export ${person ? 'WHERE requested_by = $1' : ''} ORDER BY requested_at ASC`,
      person ? [person] : []
    );
    // Includes the reads that returned nothing.
    return rows.map((r) => ({
      reference: r.reference, scope: r.scope, requested_by: r.requested_by,
      requested_at: isoStamp(r.requested_at), entry_count: r.entry_count,
      returned_nothing: r.entry_count === 0,
    }));
  },
};

record.get('/record/queries', (c) => {
  requireSession(c);
  return c.json(Object.keys(QUERIES).map((name) => ({ name, route: `/api/record/queries/${name}` })));
});

record.get('/record/queries/:name', async (c) => {
  requireSession(c);
  const bad = refusePaging(c);
  if (bad) return c.json(bad, 400);
  const name = c.req.param('name');
  const fn = QUERIES[name];
  if (!fn) return c.json({ error: 'no_such_query', permitted: Object.keys(QUERIES) }, 404);
  const params = new URL(c.req.url).searchParams;
  const rows = await fn(params);
  return c.json(rows);
});

// ---------------------------------------------------------------------------
// Retention, legal hold, deletion
// ---------------------------------------------------------------------------

async function retentionFor(seq) {
  const e = await one('SELECT * FROM record_entry WHERE seq = $1', [seq]);
  if (!e) return null;
  const from = isoDate(e.at);
  const scheme_until = addMonths(from, SCHEME_MONTHS);
  const statutory_until = addMonths(from, STATUTORY_MONTHS);

  // Any figure that still references the record extends the retention beyond
  // what any single record would otherwise take.
  let referenced_until = null;
  if (e.object_ref) {
    const cert = await one(
      `SELECT number, signed_at FROM certificate
       WHERE number = $1 OR input_versions::text LIKE '%' || $1 || '%'
       ORDER BY signed_at DESC LIMIT 1`,
      [e.object_ref]
    );
    if (cert) referenced_until = addMonths(isoDate(cert.signed_at), SCHEME_MONTHS);
  }
  const candidates = [scheme_until, statutory_until, referenced_until].filter(Boolean);
  const retain_until = candidates.sort().pop();
  const hold = await one('SELECT * FROM legal_hold WHERE seq = $1 AND active = true', [seq]);
  return {
    seq: Number(seq),
    act: e.act,
    at: isoStamp(e.at),
    scheme_months: SCHEME_MONTHS,
    statutory_months: STATUTORY_MONTHS,
    scheme_until,
    statutory_until,
    referenced_until,
    // Computed, never stored from a date somebody typed.
    retain_until,
    legal_hold: !!hold,
    legal_hold_reference: hold ? hold.reference : null,
    content_deleted_on: e.content_deleted_on ? isoDate(e.content_deleted_on) : null,
    derivation: 'retain_until is the longest of scheme_until, statutory_until and referenced_until',
  };
}

record.get('/record/:seq/retention', async (c) => {
  requireSession(c);
  const r = await retentionFor(Number(c.req.param('seq')));
  if (!r) return c.json({ error: 'not_found' }, 404);
  return c.json(r);
});

record.post('/record/:seq/legal-hold', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'quality_manager', 'claims_manager');
  const seq = Number(c.req.param('seq'));
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const e = await one('SELECT * FROM record_entry WHERE seq = $1', [seq]);
    if (!e) return { status: 404, body: { error: 'not_found' } };
    const reference = ref('HLD');
    await one(
      'INSERT INTO legal_hold (reference,seq,placed_by,active) VALUES ($1,$2,$3,true) RETURNING reference',
      [reference, seq, s.email]
    );
    await appendEntry(null, {
      act: 'legal_hold_placed', person: s.email, object_kind: 'legal_hold', object_ref: reference,
      content: { seq, reason: body.reason || null },
    });
    return { status: 201, body: { reference, seq, legal_hold: true, placed_by: s.email } };
  });
});

record.delete('/record/:seq/legal-hold', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'quality_manager', 'claims_manager');
  const s = requireSession(c);
  const seq = Number(c.req.param('seq'));
  const hold = await one('SELECT * FROM legal_hold WHERE seq = $1 AND active = true', [seq]);
  if (!hold) return c.json({ error: 'no_active_hold', seq }, 404);
  await one(
    'UPDATE legal_hold SET active = false, lifted_by = $1, lifted_at = now() WHERE reference = $2 RETURNING reference',
    [s.email, hold.reference]
  );
  // Both placing and lifting are entries of their own.
  await appendEntry(null, {
    act: 'legal_hold_lifted', person: s.email, object_kind: 'legal_hold', object_ref: hold.reference,
    content: { seq },
  });
  return c.json({ reference: hold.reference, seq, legal_hold: false, lifted_by: s.email });
});

record.post('/record/:seq/expire', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'quality_manager', 'claims_manager');
  const seq = Number(c.req.param('seq'));
  return withIdempotency(c, async () => {
    const s = requireSession(c);
    const r = await retentionFor(seq);
    if (!r) return { status: 404, body: { error: 'not_found' } };
    if (r.legal_hold) {
      return {
        status: 409,
        body: {
          error: 'under_legal_hold', reference: r.legal_hold_reference, seq,
          message: 'A record under hold refuses deletion.',
        },
      };
    }
    const today = new Date().toISOString().slice(0, 10);
    if (r.retain_until > today) {
      return {
        status: 409,
        body: {
          error: 'retention_not_expired', retain_until: r.retain_until, seq,
          message: `This entry's content is retained until ${r.retain_until}.`,
        },
      };
    }
    const e = await one('SELECT * FROM record_entry WHERE seq = $1', [seq]);
    // The one fact never deleted is that a certificate existed.
    if (e.object_kind === 'certificate') {
      return {
        status: 409,
        body: {
          error: 'certificate_existence_never_deleted', seq,
          message: 'A withdrawn certificate resolves at its address after every other retention has run out.',
        },
      };
    }
    // The entry's position and its digest survive, so the chain still verifies.
    await one(
      'UPDATE record_entry SET content = NULL, content_deleted_on = current_date WHERE seq = $1 RETURNING seq',
      [seq]
    );
    await appendEntry(null, {
      act: 'record_content_expired', person: s.email, object_kind: 'record_entry',
      object_ref: String(seq), content: { seq, retain_until: r.retain_until },
    });
    const updated = await one('SELECT * FROM record_entry WHERE seq = $1', [seq]);
    return { status: 201, body: { reference: String(seq), ...shapeEntry(updated) } };
  });
});

// No entry is edited and no entry is removed from the sequence.
record.patch('/record/:seq', async (c) => {
  const s = requireSession(c);
  await appendEntry(null, {
    act: 'record_edit_refused', person: s.email, object_kind: 'record_entry',
    object_ref: c.req.param('seq'), outcome: 'refused', content: { attempted: 'edit' },
  });
  return c.json(
    {
      error: 'record_entry_immutable',
      message: 'No entry is edited. A correction is a new entry naming what it corrects.',
    },
    409
  );
});
record.put('/record/:seq', (c) => c.json({ error: 'record_entry_immutable', message: 'No entry is edited. A correction is a new entry naming what it corrects.' }, 409));
record.delete('/record/:seq', async (c) => {
  const s = requireSession(c);
  await appendEntry(null, {
    act: 'record_delete_refused', person: s.email, object_kind: 'record_entry',
    object_ref: c.req.param('seq'), outcome: 'refused', content: { attempted: 'delete' },
  });
  return c.json(
    {
      error: 'record_entry_not_removable',
      message: 'No entry is removed from the sequence. An entry loses its content only through the retention route, which keeps its position and its digest.',
    },
    409
  );
});

record.post('/record/corrections', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'quality_manager', 'claims_manager');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { corrects, detail } = body;
    if (!corrects || !detail) return { status: 400, body: { error: 'corrects_and_detail_required' } };
    const target = await one('SELECT seq FROM record_entry WHERE seq = $1', [Number(corrects)]);
    if (!target) return { status: 404, body: { error: 'no_such_entry', seq: Number(corrects) } };
    // A correction is a new entry naming what it corrects. It edits nothing.
    await appendEntry(null, {
      act: 'correction', person: s.email, object_kind: 'record_entry', object_ref: String(corrects),
      corrects: Number(corrects), content: { detail, corrects: Number(corrects) },
    });
    const saved = await one(
      'SELECT * FROM record_entry WHERE corrects = $1 ORDER BY seq DESC LIMIT 1',
      [Number(corrects)]
    );
    return { status: 201, body: { reference: String(saved.seq), ...shapeEntry(saved) } };
  });
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

record.get('/exports', async (c) => {
  requireSession(c);
  const rows = await q('SELECT * FROM export ORDER BY requested_at ASC');
  return c.json(rows.map((r) => ({
    reference: r.reference, scope: r.scope, requested_by: r.requested_by,
    requested_at: isoStamp(r.requested_at), entry_count: r.entry_count,
    returned_nothing: r.entry_count === 0,
  })));
});

record.get('/exports/:reference', async (c) => {
  requireSession(c);
  const r = await one('SELECT * FROM export WHERE reference = $1', [c.req.param('reference')]);
  if (!r) return c.json({ error: 'not_found' }, 404);
  return c.json({
    reference: r.reference, scope: r.scope, requested_by: r.requested_by,
    requested_at: isoStamp(r.requested_at), entry_count: r.entry_count, ...r.payload,
  });
});

record.post('/exports', async (c) => {
  // An auditor exports; every export is itself an entry.
  const s = requireSession(c);
  return withIdempotency(c, async (body) => {
    const scope = {
      period: body.period || null,
      sites: body.sites || [],
      grades: body.grades || [],
      certificates: body.certificates || [],
      lots: body.lots || [],
      what: body.what || 'record',
    };
    const reference = ref('EXP');
    // The scope is recorded before the read.
    await appendEntry(null, {
      act: 'export_scope_recorded', person: s.email, object_kind: 'export', object_ref: reference,
      content: { scope },
    });

    const entries = await q(
      `SELECT * FROM record_entry
       WHERE ($1::text IS NULL OR site = $1 OR site IS NULL)
       ORDER BY seq ASC`,
      [scope.sites.length === 1 ? scope.sites[0] : null]
    );
    const filtered = entries.filter((e) => {
      if (scope.certificates.length && e.object_kind === 'certificate') {
        return scope.certificates.includes(e.object_ref);
      }
      if (scope.sites.length && e.site) return scope.sites.includes(e.site);
      return true;
    });
    const certs = scope.certificates.length
      ? await q('SELECT * FROM certificate WHERE number = ANY($1::text[]) ORDER BY number ASC', [scope.certificates])
      : await q('SELECT * FROM certificate ORDER BY number ASC');
    const chain = await checkChain();

    const payload = {
      generated_at: new Date().toISOString(),
      read_at: new Date().toISOString(),
      scope,
      // Self-contained: the derivations and the digests travel with it, so a
      // reader can establish its integrity without asking the producer.
      chain_holds: chain.holds,
      head_digest: chain.head_digest || null,
      anchors: filtered.map((e) => ({ seq: Number(e.seq), digest: e.digest, prev_digest: e.prev_digest })),
      entries: filtered.map(shapeEntry),
      certificates: certs.map((x) => ({
        number: x.number, version: x.version, state: x.state, content_bp: x.content_bp,
        claim_type: x.claim_type, carbon: x.carbon, input_versions: x.input_versions,
        signed_at: isoStamp(x.signed_at),
      })),
      derivations: {
        content_bp: 'credit_attached_g * 10000 / lot_mass_g, floored',
        dry_mass_g: 'net_g * (10000 - moisture_bp) / 10000, floored',
        credit_granted_g: 'dry_mass_consumed_g * factor_bp / 10000, floored',
        digest: 'sha256 over the entry content and the previous digest',
      },
    };
    await one(
      'INSERT INTO export (reference,scope,requested_by,entry_count,payload) VALUES ($1,$2,$3,$4,$5) RETURNING reference',
      [reference, JSON.stringify(scope), s.email, filtered.length, JSON.stringify(payload)]
    );
    // An export that returns nothing is recorded too.
    await appendEntry(null, {
      act: 'export_produced', person: s.email, object_kind: 'export', object_ref: reference,
      content: { scope, entry_count: filtered.length, returned_nothing: filtered.length === 0 },
    });
    return { status: 201, body: { reference, entry_count: filtered.length, ...payload } };
  });
});
