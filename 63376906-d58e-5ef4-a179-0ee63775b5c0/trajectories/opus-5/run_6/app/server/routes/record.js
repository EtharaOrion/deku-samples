import { Hono } from 'hono';
import { q, pool } from '../lib/db.js';
import {
  requireSession, requireAct, withIdempotency, refuse, refusePagination,
  requireFields, nextReference, today,
} from '../lib/http.js';
import { appendEntry, recomputeChainCheck } from '../lib/records.js';
import { iso } from '../engine/feedstock.js';

const r = new Hono();

function entryView(e) {
  return {
    seq: Number(e.seq),
    at: e.at,
    person: e.person,
    site: e.site,
    object_kind: e.object_kind,
    object_ref: e.object_ref,
    action: e.action,
    content: e.content_deleted ? null : e.content,
    content_deleted: e.content_deleted,
    deleted_statement: e.content_deleted
      ? `The content of this entry was deleted under retention on ${iso(e.deleted_on)}. Its position and its digest survive, so the chain still verifies.`
      : null,
    digest: e.digest,
    prev_digest: e.prev_digest,
  };
}

r.get('/record', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const url = new URL(c.req.url);
  const filters = [];
  const params = [];
  for (const [key, column] of [['object_ref', 'object_ref'], ['person', 'person'], ['site', 'site'], ['object_kind', 'object_kind'], ['action', 'action']]) {
    const v = url.searchParams.get(key);
    if (v) { params.push(v); filters.push(`${column} = $${params.length}`); }
  }
  const rows = await q(
    `SELECT * FROM record_entry ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''} ORDER BY seq ASC`, params);
  return c.json(rows.map(entryView));
});

r.get('/record/check', async (c) => {
  await requireSession(c);
  const result = await recomputeChainCheck();
  return c.json({ ...result, read_at: new Date().toISOString() });
});

// The nine questions the record exists to answer, each a complete set.
r.get('/record/queries/:name', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const name = c.req.param('name');
  const url = new URL(c.req.url);
  const body = await runQuery(name, url.searchParams);
  if (body === null) {
    refuse(404, 'unknown_query', {
      error: 'unknown_query',
      message: 'The record answers nine questions.',
      queries: QUERIES,
    });
  }
  return c.json({ query: name, complete: true, read_at: new Date().toISOString(), ...body });
});

const QUERIES = [
  'lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
  'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight',
  'refused_allocations', 'collector_declaration_departures', 'acts_by_person', 'exports_by_auditor',
];

async function runQuery(name, params) {
  switch (name) {
    case 'lots_from_batch': {
      const batch = params.get('batch');
      const { impactOf } = await import('../engine/genealogy.js');
      const batches = batch ? [batch] : (await q('SELECT reference FROM batch')).map((x) => x.reference);
      const results = [];
      for (const b of batches) {
        const impact = await impactOf(b);
        if (impact) results.push({ batch: b, lots: impact.lots, certificates: impact.certificates, recipients: impact.recipients });
      }
      return { results };
    }
    case 'certificates_on_period': {
      const period = params.get('period');
      const rows = await q('SELECT * FROM certificate ORDER BY number ASC');
      const filtered = period ? rows.filter((x) => x.payload?.period === period) : rows;
      return {
        results: filtered.map((x) => ({
          number: x.number, period: x.payload?.period, state: x.state, site: x.site,
          recipient: x.recipient, recipient_name: x.payload?.recipient_name, signed_at: x.signed_at,
        })),
      };
    }
    case 'certificates_under_method_version': {
      const mv = params.get('method_version');
      const rows = await q('SELECT * FROM certificate ORDER BY number ASC');
      const filtered = mv ? rows.filter((x) => x.payload?.carbon?.method_version === mv) : rows;
      return {
        results: filtered.map((x) => ({
          number: x.number, method_version: x.payload?.carbon?.method_version,
          state: x.state, value_mg_per_kg: x.payload?.carbon?.value_mg_per_kg,
          boundary: x.payload?.carbon?.boundary, uncertainty_bp: x.payload?.carbon?.uncertainty_bp,
        })),
      };
    }
    case 'lots_released_under_unreviewed_override': {
      const overrides = await q('SELECT * FROM override_record WHERE reviewed = false');
      const lots = await q('SELECT * FROM lot');
      const results = overrides
        .map((o) => ({ override: o, lot: lots.find((l) => l.reference === o.lot) }))
        .filter((x) => x.lot && x.lot.disposition === 'released')
        .map(({ override, lot }) => ({
          lot: lot.reference, disposition: lot.disposition, site: lot.site,
          override: override.reference, separation: override.separation,
          authorised_by: override.authorised_by, created_on: iso(override.created_on), reviewed: false,
        }));
      return { results };
    }
    case 'allocations_in_final_fortnight': {
      const periods = await q('SELECT * FROM balance_period');
      const movements = await q("SELECT * FROM credit_movement WHERE kind = 'allocation' ORDER BY id ASC");
      const results = [];
      for (const m of movements) {
        const p = periods.find((x) => x.id === m.period_id);
        if (!p) continue;
        const end = new Date(p.period_to);
        const start = new Date(end);
        start.setDate(start.getDate() - 14);
        const eff = new Date(m.effective_on);
        if (eff >= start && eff <= end) {
          results.push({
            allocation: m.ref, period: m.period_id, lot: m.lot, category: m.category,
            mass_g: Number(m.mass_g), effective_on: iso(m.effective_on),
            period_to: iso(p.period_to), recorded_by: m.recorded_by,
          });
        }
      }
      return { results, window: 'the final fourteen days of each period' };
    }
    case 'refused_allocations': {
      const rows = await q(
        `SELECT * FROM record_entry WHERE object_kind = 'allocation' AND action = 'refused' ORDER BY seq ASC`);
      return {
        results: rows.map((e) => ({
          seq: Number(e.seq), at: e.at, person: e.person, period: e.object_ref,
          lot: e.content?.lot, category: e.content?.category,
          available_g: e.content?.available_g ?? null, requested_g: e.content?.requested_g ?? null,
          margin_at_instant_g: e.content?.margin_at_instant_g ?? e.content?.available_g ?? null,
          reason: e.content?.reason,
        })),
      };
    }
    case 'collector_declaration_departures': {
      const findings = await q("SELECT * FROM finding WHERE kind = 'declaration_departure' ORDER BY reference ASC");
      const batches = await q('SELECT * FROM batch');
      return {
        results: findings.map((f) => {
          const b = batches.find((x) => x.reference === f.batch);
          const declared = b?.composition?.fraction_bp ?? null;
          const measured = b?.composition?.measured_fraction_bp ?? null;
          return {
            finding: f.reference, collector: f.collector, batch: f.batch,
            declared_fraction_bp: declared, measured_fraction_bp: measured,
            departure_bp: declared !== null && measured !== null ? Math.abs(declared - measured) : null,
            tolerance_bp: 500, raised_on: iso(f.raised_on), state: f.state, detail: f.detail,
          };
        }),
      };
    }
    case 'acts_by_person': {
      const person = params.get('person');
      const rows = person
        ? await q('SELECT * FROM record_entry WHERE lower(person) = lower($1) ORDER BY seq ASC', [person])
        : await q('SELECT * FROM record_entry ORDER BY seq ASC');
      return { person: person || null, results: rows.map(entryView) };
    }
    case 'exports_by_auditor': {
      const rows = await q('SELECT * FROM export_record ORDER BY reference ASC');
      // this one includes the reads that returned nothing
      return {
        results: rows.map((x) => ({
          reference: x.reference, produced_by: x.produced_by, produced_at: x.produced_at,
          scope: x.scope, entry_count: x.entry_count, returned_nothing: x.entry_count === 0,
        })),
        note: 'This answer includes the reads that returned nothing.',
      };
    }
    default:
      return null;
  }
}

// retain_until is the longest of the three and is computed rather than stored.
r.get('/record/:seq/retention', async (c) => {
  await requireSession(c);
  const seq = Number(c.req.param('seq'));
  const e = (await q('SELECT * FROM record_entry WHERE seq = $1', [seq]))[0];
  if (!e) refuse(404, 'not_found', { error: 'not_found', message: 'No such record entry.' });
  const hold = (await q('SELECT * FROM legal_hold WHERE seq = $1 AND lifted_at IS NULL', [seq]))[0];
  const at = new Date(e.at);
  const schemeUntil = addMonths(at, Number(e.scheme_months));
  const statutoryUntil = addMonths(at, Number(e.statutory_months));
  const referencedUntil = await referencedUntilFor(e);
  const candidates = [schemeUntil, statutoryUntil, referencedUntil].filter(Boolean);
  const retainUntil = candidates.sort()[candidates.length - 1];
  return c.json({
    seq,
    scheme_months: Number(e.scheme_months),
    statutory_months: Number(e.statutory_months),
    scheme_until: schemeUntil,
    statutory_until: statutoryUntil,
    referenced_until: referencedUntil,
    retain_until: retainUntil,
    legal_hold: !!hold,
    legal_hold_reference: hold?.reference || null,
    content_deleted: e.content_deleted,
    derivation: 'retain_until is the longest of the scheme requirement, the statutory requirement and the date any figure still references this record. It is computed rather than stored from a date somebody typed.',
  });
});

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

// Every version an issued figure was computed against is retained for as long as
// any figure references it.
async function referencedUntilFor(entry) {
  if (!entry.object_ref) return null;
  const certs = await q('SELECT * FROM certificate');
  const referencing = certs.filter((x) => x.number === entry.object_ref
    || JSON.stringify(x.payload?.input_versions || {}).includes(entry.object_ref));
  if (!referencing.length) return null;
  const latest = referencing
    .map((x) => new Date(x.signed_at))
    .sort((a, b) => a - b)
    .pop();
  return addMonths(latest, 120);
}

r.post('/record/:seq/legal-hold', async (c) => {
  const actor = await requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  const seq = Number(c.req.param('seq'));
  const out = await withIdempotency(c, body, async () => {
    const e = (await q('SELECT * FROM record_entry WHERE seq = $1', [seq]))[0];
    if (!e) refuse(404, 'not_found', { error: 'not_found', message: 'No such record entry.' });
    const existing = (await q('SELECT * FROM legal_hold WHERE seq = $1 AND lifted_at IS NULL', [seq]))[0];
    if (existing) {
      return { status: 200, body: { reference: existing.reference, seq, legal_hold: true, placed_by: existing.placed_by } };
    }
    const reference = await nextReference('HLD', 'legal_hold');
    await pool.query('INSERT INTO legal_hold (reference, seq, placed_by) VALUES ($1,$2,$3)', [reference, seq, actor.email]);
    await appendEntry(null, {
      person: actor.email, object_kind: 'legal_hold', object_ref: reference, action: 'placed',
      content: { seq, reason: body.reason || null },
    });
    return { status: 201, body: { reference, seq, legal_hold: true, placed_by: actor.email, note: 'A record under hold refuses deletion.' } };
  });
  return c.json(out.body, out.status);
});

r.delete('/record/:seq/legal-hold', async (c) => {
  const actor = await requireSession(c);
  const seq = Number(c.req.param('seq'));
  const hold = (await q('SELECT * FROM legal_hold WHERE seq = $1 AND lifted_at IS NULL', [seq]))[0];
  if (!hold) refuse(404, 'not_found', { error: 'not_found', message: 'No hold stands on this entry.' });
  await pool.query('UPDATE legal_hold SET lifted_by = $1, lifted_at = now() WHERE reference = $2', [actor.email, hold.reference]);
  await appendEntry(null, {
    person: actor.email, object_kind: 'legal_hold', object_ref: hold.reference, action: 'lifted', content: { seq },
  });
  return c.json({ reference: hold.reference, seq, legal_hold: false, lifted_by: actor.email });
});

// The entry's position and its digest survive, so the chain still verifies.
r.post('/record/:seq/expire', async (c) => {
  const actor = await requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  const seq = Number(c.req.param('seq'));
  const out = await withIdempotency(c, body, async () => {
    const e = (await q('SELECT * FROM record_entry WHERE seq = $1', [seq]))[0];
    if (!e) refuse(404, 'not_found', { error: 'not_found', message: 'No such record entry.' });
    const hold = (await q('SELECT * FROM legal_hold WHERE seq = $1 AND lifted_at IS NULL', [seq]))[0];
    if (hold) {
      refuse(409, 'legal_hold', {
        error: 'legal_hold',
        message: 'A record under hold refuses deletion.',
        legal_hold_reference: hold.reference, placed_by: hold.placed_by,
      });
    }
    // the one fact never deleted is that a certificate existed
    if (e.object_kind === 'certificate' && e.action === 'signed') {
      refuse(409, 'certificate_existence_never_deleted', {
        error: 'certificate_existence_never_deleted',
        message: 'The one fact never deleted is that a certificate existed. A withdrawn certificate resolves at its address after every other retention has run out.',
        certificate: e.object_ref,
      });
    }
    const at = new Date(e.at);
    const schemeUntil = addMonths(at, Number(e.scheme_months));
    const statutoryUntil = addMonths(at, Number(e.statutory_months));
    const referencedUntil = await referencedUntilFor(e);
    const retainUntil = [schemeUntil, statutoryUntil, referencedUntil].filter(Boolean).sort().pop();
    if (retainUntil > today()) {
      refuse(409, 'retention_not_expired', {
        error: 'retention_not_expired',
        message: 'An entry loses its content only once retain_until has passed.',
        retain_until: retainUntil, today: today(),
      });
    }
    if (e.content_deleted) {
      return { status: 200, body: { seq, content_deleted: true, deleted_on: iso(e.deleted_on) } };
    }
    await pool.query('UPDATE record_entry SET content = NULL, content_deleted = true, deleted_on = $1 WHERE seq = $2',
      [today(), seq]);
    await appendEntry(null, {
      person: actor.email, object_kind: 'record_entry', object_ref: String(seq), action: 'content_expired',
      content: { seq, retain_until: retainUntil },
    });
    const check = await recomputeChainCheck();
    return {
      status: 201,
      body: {
        reference: String(seq), seq, content_deleted: true, deleted_on: today(),
        digest: e.digest, prev_digest: e.prev_digest,
        statement: `The content of this entry was deleted under retention on ${today()}. Its position and its digest survive, so the chain still verifies.`,
        chain_holds: check.holds,
      },
    };
  });
  return c.json(out.body, out.status);
});

// Every attempt to modify or remove an entry is refused.
for (const method of ['patch', 'put', 'delete']) {
  r[method]('/record/:seq', async (c) => {
    const actor = await requireSession(c).catch(() => null);
    await appendEntry(null, {
      person: actor?.email || null, object_kind: 'record_entry', object_ref: c.req.param('seq'),
      action: 'modification_refused', content: { method: c.req.method },
    });
    refuse(409, 'record_immutable', {
      error: 'record_immutable',
      message: 'No entry is edited and no entry is removed from the sequence. A correction is a new entry naming what it corrects.',
    });
  });
}

// An export records its scope before the read, and is itself an entry.
r.post('/exports', async (c) => {
  const actor = await requireAct(c, 'export.create');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, body, async () => {
    const scope = {
      period: body.period || null,
      sites: body.sites || [],
      grades: body.grades || [],
      certificates: body.certificates || [],
    };
    const reference = await nextReference('EXP', 'export_record');
    // the scope is recorded before the read
    const scopeEntry = await appendEntry(null, {
      person: actor.email, object_kind: 'export', object_ref: reference, action: 'scope_recorded', content: { scope },
    });

    const filters = [];
    const params = [];
    if (scope.sites.length) { params.push(scope.sites); filters.push(`site = ANY($${params.length})`); }
    const entries = await q(
      `SELECT * FROM record_entry ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''} ORDER BY seq ASC`, params);
    const certs = scope.certificates.length
      ? await q('SELECT * FROM certificate WHERE number = ANY($1)', [scope.certificates])
      : (scope.sites.length ? await q('SELECT * FROM certificate WHERE site = ANY($1)', [scope.sites]) : await q('SELECT * FROM certificate'));
    const periods = scope.period
      ? await q('SELECT * FROM balance_period WHERE id = $1', [scope.period])
      : await q('SELECT * FROM balance_period');

    const bodyOut = {
      reference,
      scope,
      produced_by: actor.email,
      produced_at: new Date().toISOString(),
      read_at: new Date().toISOString(),
      entry_count: entries.length,
      returned_nothing: entries.length === 0,
      anchor: { first_seq: entries[0] ? Number(entries[0].seq) : null, last_seq: entries.length ? Number(entries[entries.length - 1].seq) : null, scope_entry_seq: Number(scopeEntry.seq) },
      // the export carries the digests and anchor references so a reader can
      // establish its integrity after it has left this system
      digests: entries.map((e) => ({ seq: Number(e.seq), digest: e.digest, prev_digest: e.prev_digest })),
      entries: entries.map(entryView),
      certificates: certs.map((x) => ({ number: x.number, state: x.state, site: x.site, signed_at: x.signed_at, document_digest: null, payload: x.payload })),
      balance_periods: periods.map((p) => ({ id: p.id, site: p.site, grade: p.grade, state: p.state })),
      derivations: {
        dry_mass_g: 'net_g * (10000 - moisture_bp) / 10000, floored',
        credit_granted_g: 'dry_mass_consumed_g * factor_bp / 10000, floored',
        content_bp: 'credit_attached_g * 10000 / lot_mass_g, floored',
        share_bp: 'byproduct_mass_g * 10000 / total_output_mass_g, floored',
      },
      self_contained: true,
    };

    await pool.query(
      'INSERT INTO export_record (reference, scope, produced_by, entry_count, digests, body) VALUES ($1,$2,$3,$4,$5,$6)',
      [reference, JSON.stringify(scope), actor.email, entries.length, JSON.stringify(bodyOut.digests), JSON.stringify({ anchor: bodyOut.anchor, entry_count: entries.length })]);
    await appendEntry(null, {
      person: actor.email, object_kind: 'export', object_ref: reference, action: 'exported',
      content: { scope, entry_count: entries.length, returned_nothing: entries.length === 0 },
    });

    return { status: 201, body: bodyOut };
  });
  return c.json(out.body, out.status);
});

r.get('/exports', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const rows = await q('SELECT * FROM export_record ORDER BY reference ASC');
  return c.json(rows.map((x) => ({
    reference: x.reference, scope: x.scope, produced_by: x.produced_by,
    produced_at: x.produced_at, entry_count: x.entry_count, returned_nothing: x.entry_count === 0,
    digests: x.digests,
  })));
});

// An auditor annotates, and writes no operational record.
r.post('/annotations', async (c) => {
  const actor = await requireAct(c, 'annotation.create');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['subject_kind', 'subject_ref', 'note']);
    const reference = await nextReference('ANN', 'auditor_annotation');
    await pool.query(
      'INSERT INTO auditor_annotation (reference, subject_kind, subject_ref, note, author) VALUES ($1,$2,$3,$4,$5)',
      [reference, body.subject_kind, body.subject_ref, body.note, actor.email]);
    await appendEntry(null, {
      person: actor.email, object_kind: 'annotation', object_ref: reference, action: 'annotated',
      content: { subject_kind: body.subject_kind, subject_ref: body.subject_ref, note: body.note },
    });
    return { status: 201, body: { reference, subject_kind: body.subject_kind, subject_ref: body.subject_ref, note: body.note, author: actor.email } };
  });
  return c.json(out.body, out.status);
});

r.get('/annotations', async (c) => {
  await requireSession(c);
  const rows = await q('SELECT * FROM auditor_annotation ORDER BY reference ASC');
  return c.json(rows.map((x) => ({
    reference: x.reference, subject_kind: x.subject_kind, subject_ref: x.subject_ref,
    note: x.note, author: x.author, created_at: x.created_at,
  })));
});

export default r;
