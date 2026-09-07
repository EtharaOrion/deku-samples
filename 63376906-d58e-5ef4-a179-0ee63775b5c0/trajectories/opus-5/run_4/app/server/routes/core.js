import { Hono } from 'hono';
import { q, one } from '../db.js';
import { verifyPassword, issueSession, requireSession, requireRole, refuseAuditorWrites } from '../auth.js';
import { appendEntry } from '../record.js';
import { withIdempotency } from '../idempotency.js';
import { isoDate, fail, daysBetween } from '../util.js';
import { shapeApproval, partyNameOn, readAt } from '../engine.js';

export const core = new Hono();

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

core.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body;
  if (!email || !password) return c.json({ error: 'email_and_password_required' }, 400);
  const claims = await verifyPassword(email, password);
  if (!claims) {
    return c.json(
      { error: 'invalid_credentials', message: 'That email and password were not accepted.' },
      401
    );
  }
  const session = await issueSession(email);
  if (!session) return c.json({ error: 'no_account', message: 'Signup is closed.' }, 403);
  await appendEntry(null, {
    act: 'sign_in', person: email, object_kind: 'account', object_ref: email,
    content: { at: new Date().toISOString() },
  });
  return c.json(session, 200);
});

core.get('/auth/me', (c) => {
  const s = requireSession(c);
  return c.json({
    email: s.email,
    name: s.name,
    roles: s.roles,
    sites: s.sites,
    grant_ends_on: s.grant_ends_on,
    expires_at: new Date(s.exp * 1000).toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Sites and capacity
// ---------------------------------------------------------------------------

core.get('/sites', async (c) => {
  const rows = await q('SELECT * FROM site ORDER BY reference ASC');
  return c.json(
    rows.map((s) => ({
      reference: s.reference, name: s.name, confidence: s.confidence,
      certification_state: s.certification_state,
    }))
  );
});

core.get('/sites/:reference', async (c) => {
  const s = await one('SELECT * FROM site WHERE reference = $1', [c.req.param('reference')]);
  if (!s) return c.json({ error: 'not_found' }, 404);
  const certs = await q(
    'SELECT * FROM site_certification WHERE site = $1 ORDER BY effective_from ASC',
    [s.reference]
  );
  return c.json({
    reference: s.reference, name: s.name, confidence: s.confidence,
    certification_state: s.certification_state,
    nameplate_kg: Number(s.nameplate_kg), contracted_kg: Number(s.contracted_kg),
    uncommitted_kg: Number(s.nameplate_kg) - Number(s.contracted_kg),
    basis: s.basis, last_revised: isoDate(s.last_revised),
    certification_periods: certs.map((x) => ({
      reference: x.reference, state: x.state, grade: x.grade,
      effective_from: isoDate(x.effective_from), effective_to: isoDate(x.effective_to),
      reason: x.reason,
    })),
  });
});

core.get('/sites/:reference/capacity', async (c) => {
  const s = await one('SELECT * FROM site WHERE reference = $1', [c.req.param('reference')]);
  if (!s) return c.json({ error: 'not_found' }, 404);
  return c.json({
    reference: s.reference,
    nameplate_kg: Number(s.nameplate_kg),
    basis: s.basis,
    contracted_kg: Number(s.contracted_kg),
    // Computed, and allowed to be negative.
    uncommitted_kg: Number(s.nameplate_kg) - Number(s.contracted_kg),
    confidence: s.confidence,
    last_revised: isoDate(s.last_revised),
    derivation: { uncommitted_kg: 'nameplate_kg minus contracted_kg' },
  });
});

core.post('/sites/:reference/certification', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'quality_manager');
  const site = c.req.param('reference');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { state, effective_from, grade, reason } = body;
    if (!['suspended', 'lifted', 'certified'].includes(state)) {
      return { status: 400, body: { error: 'state_not_permitted', permitted: ['suspended', 'lifted', 'certified'] } };
    }
    if (!effective_from) return { status: 400, body: { error: 'effective_from_required' } };
    const reference = `CERTP-${site}-${Date.now().toString(36).toUpperCase()}`;
    await one(
      `INSERT INTO site_certification (reference, site, grade, state, effective_from, reason, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING reference`,
      [reference, site, grade || null, state, effective_from, reason || null, s.email]
    );

    // A suspension may reach backwards. Every certificate signed inside the
    // window is enumerated and individually resolved.
    let certificates_in_window = [];
    if (state === 'suspended') {
      const rows = await q(
        `SELECT * FROM certificate WHERE site = $1 AND signed_at >= $2::date
         ${grade ? 'AND grade = $3' : ''} ORDER BY number ASC`,
        grade ? [site, effective_from, grade] : [site, effective_from]
      );
      certificates_in_window = rows.map((r) => ({
        number: r.number, version: r.version, signed_at: r.signed_at, state: r.state,
        recipient: r.recipient, recipient_name: r.recipient_name,
        resolutions_available: ['reissued', 'withdrawn', 'unaffected'],
        resolution: null,
      }));
      await one('UPDATE site SET certification_state = $1 WHERE reference = $2 RETURNING reference', ['suspended', site]);
    } else if (state === 'lifted' || state === 'certified') {
      await one(
        `UPDATE site_certification SET effective_to = $1 WHERE site = $2 AND state = 'suspended' AND effective_to IS NULL RETURNING reference`,
        [effective_from, site]
      );
      await one('UPDATE site SET certification_state = $1 WHERE reference = $2 RETURNING reference', ['certified', site]);
    }

    await appendEntry(null, {
      act: state === 'suspended' ? 'certification_suspended' : 'certification_lifted',
      person: s.email, site, object_kind: 'site_certification', object_ref: reference,
      content: { state, effective_from, grade: grade || null, reason: reason || null,
        certificates_in_window: certificates_in_window.map((x) => x.number) },
    });

    return {
      status: 201,
      body: {
        reference, site, state, grade: grade || null, effective_from,
        reason: reason || null,
        certificates_in_window,
        issuing_blocked: state === 'suspended',
        blocking_condition: state === 'suspended'
          ? `The certification for ${site}${grade ? ' grade ' + grade : ''} is suspended from ${effective_from}.`
          : null,
        note: state !== 'suspended'
          ? 'Lifting a suspension restores issuing from the moment it takes effect. It does not reinstate a withdrawn certificate: a withdrawal is a fact about a document, and the remedy is a new certificate.'
          : null,
      },
    };
  });
});

// ---------------------------------------------------------------------------
// Parties, and the names they had at the time
// ---------------------------------------------------------------------------

core.get('/parties/:reference/versions', async (c) => {
  const rows = await q(
    'SELECT * FROM party_version WHERE reference = $1 ORDER BY effective_from ASC, id ASC',
    [c.req.param('reference')]
  );
  return c.json(
    rows.map((r, i) => ({
      reference: r.reference, kind: r.kind, name: r.name,
      effective_from: isoDate(r.effective_from),
      superseded_on: rows[i + 1] ? isoDate(rows[i + 1].effective_from) : null,
      current: i === rows.length - 1,
    }))
  );
});

core.post('/parties/:reference/versions', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'quality_manager', 'claims_manager');
  const reference = c.req.param('reference');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { name, effective_from, kind } = body;
    if (!name || !effective_from) {
      return { status: 400, body: { error: 'name_and_effective_from_required' } };
    }
    const prior = await one(
      'SELECT * FROM party_version WHERE reference = $1 ORDER BY effective_from DESC LIMIT 1',
      [reference]
    );
    const row = await one(
      `INSERT INTO party_version (reference, kind, name, effective_from) VALUES ($1,$2,$3,$4) RETURNING id`,
      [reference, kind || (prior ? prior.kind : 'collector'), name, effective_from]
    );
    // Supersedes rather than rewrites: the previous row keeps its own name.
    if (prior) {
      await one('UPDATE party_version SET superseded_by = $1 WHERE id = $2 RETURNING id', [row.id, prior.id]);
    }
    const ref = `PV-${row.id}`;
    await appendEntry(null, {
      act: 'party_version_recorded', person: s.email, object_kind: 'party', object_ref: reference,
      content: { name, effective_from, supersedes: prior ? prior.name : null },
    });
    return {
      status: 201,
      body: { reference: ref, party: reference, name, effective_from, supersedes: prior ? prior.name : null },
    };
  });
});

// ---------------------------------------------------------------------------
// Collectors
// ---------------------------------------------------------------------------

async function shapeCollector(row, asOf) {
  const periods = await q(
    'SELECT * FROM approval_period WHERE collector = $1 ORDER BY valid_from ASC',
    [row.reference]
  );
  const findings = await q(
    'SELECT * FROM finding WHERE collector = $1 ORDER BY raised_on ASC',
    [row.reference]
  );
  const today = asOf || new Date().toISOString().slice(0, 10);
  return {
    reference: row.reference,
    name: row.name,
    country: row.country,
    registration: row.registration,
    registration_expiry: isoDate(row.registration_expiry),
    collection_site_types: row.collection_site_types,
    declared_streams: row.declared_streams,
    scheme_status: row.scheme_status,
    findings: findings.map((f) => ({
      reference: f.reference, kind: f.kind, detail: f.detail, batch: f.batch,
      departure_bp: f.departure_bp, raised_on: isoDate(f.raised_on),
      due_on: isoDate(f.due_on), state: f.state,
      past_due: f.due_on ? isoDate(f.due_on) < today : false,
    })),
    approval_periods: periods.map((p) => shapeApproval(p, today)),
  };
}

core.get('/collectors', async (c) => {
  requireSession(c);
  const rows = await q('SELECT * FROM collector ORDER BY reference ASC');
  const out = [];
  for (const r of rows) out.push(await shapeCollector(r));
  return c.json(out);
});

core.get('/collectors/:reference', async (c) => {
  requireSession(c);
  const row = await one('SELECT * FROM collector WHERE reference = $1', [c.req.param('reference')]);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(await shapeCollector(row));
});

core.post('/collectors/:reference/approvals', async (c) => {
  refuseAuditorWrites(c);
  // Approving a collector is the quality manager's act, and never the act of
  // the person who booked in the batch.
  requireRole(c, 'quality_manager');
  const collector = c.req.param('reference');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { state, valid_from, valid_to, condition, condition_closes_on } = body;
    if (!['approved', 'conditional', 'suspended', 'lapsed'].includes(state)) {
      return { status: 400, body: { error: 'state_not_permitted', permitted: ['approved', 'conditional', 'suspended', 'lapsed'] } };
    }
    if (!valid_from || !valid_to) return { status: 400, body: { error: 'valid_from_and_valid_to_required' } };
    if (state === 'conditional' && (!condition || !condition_closes_on)) {
      return { status: 400, body: { error: 'condition_and_close_date_required', message: 'A conditional approval names its condition and the date it must be closed by.' } };
    }
    const exists = await one('SELECT reference FROM collector WHERE reference = $1', [collector]);
    if (!exists) return { status: 404, body: { error: 'not_found' } };
    const reference = `AP-${collector.replace('COL-', '')}-${Date.now().toString(36).toUpperCase()}`;
    await one(
      `INSERT INTO approval_period (reference,collector,state,valid_from,valid_to,condition,condition_closes_on,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING reference`,
      [reference, collector, state, valid_from, valid_to, condition || null, condition_closes_on || null, s.email]
    );
    await appendEntry(null, {
      act: `collector_${state}`, person: s.email, object_kind: 'approval_period',
      object_ref: reference, content: { collector, state, valid_from, valid_to },
    });
    const row = await one('SELECT * FROM approval_period WHERE reference = $1', [reference]);
    return { status: 201, body: { reference, collector, ...shapeApproval(row, new Date().toISOString().slice(0, 10)) } };
  });
});

// ---------------------------------------------------------------------------
// The public site's own data
// ---------------------------------------------------------------------------

core.get('/statistics', async (c) => {
  const rows = await q('SELECT * FROM statistic ORDER BY key ASC');
  // A figure that cannot carry a source, a year and a geography is not published.
  return c.json(
    rows
      .filter((r) => r.source && r.year && r.geography)
      .map((r) => ({ key: r.key, value: r.value, source: r.source, year: r.year, geography: r.geography }))
  );
});

core.get('/positions', async (c) => {
  const rows = await q('SELECT * FROM position ORDER BY closes_on ASC');
  return c.json(
    rows.map((r) => ({
      reference: r.reference, title: r.title, location: r.location, department: r.department,
      contract_type: r.contract_type, closes_on: isoDate(r.closes_on),
    }))
  );
});

core.get('/news', async (c) => {
  const rows = await q('SELECT * FROM news_item ORDER BY item_date DESC');
  return c.json(
    rows.map((r) => ({
      reference: r.reference, title: r.title, tag: r.tag, outlet: r.outlet,
      date: isoDate(r.item_date), link: r.link, language: r.language, summary: r.summary,
    }))
  );
});

core.get('/claim-register', async (c) => {
  const rows = await q('SELECT * FROM claim_substantiation ORDER BY reference ASC');
  const today = new Date().toISOString().slice(0, 10);
  return c.json(
    rows.map((r) => ({
      reference: r.reference, claim: r.claim, route: r.route,
      first_published: isoDate(r.first_published), evidence: r.evidence,
      evidence_expires_on: isoDate(r.evidence_expires_on),
      method_version: r.method_version, approver: r.approver,
      review_date: isoDate(r.review_date), state: r.state,
      // A claim whose evidence expires is reported before its review date.
      evidence_expires_before_review:
        r.evidence_expires_on && r.review_date
          ? isoDate(r.evidence_expires_on) < isoDate(r.review_date)
          : false,
      expired: r.evidence_expires_on ? isoDate(r.evidence_expires_on) < today : false,
    }))
  );
});

core.get('/recipes', async (c) => {
  requireSession(c);
  const rows = await q('SELECT * FROM recipe_version ORDER BY reference ASC');
  return c.json(rows.map((r) => ({
    reference: r.reference, run_type: r.run_type, version: r.version,
    set_points: r.set_points, tolerances: r.tolerances, reagents: r.reagents,
    residence_min: r.residence_min, released_by: r.released_by,
    released_on: isoDate(r.released_on), superseded_by: r.superseded_by,
  })));
});
