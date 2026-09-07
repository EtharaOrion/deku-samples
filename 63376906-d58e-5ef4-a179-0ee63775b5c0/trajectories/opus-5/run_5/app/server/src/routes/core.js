import { Hono } from 'hono';
import { q, one, pool, snapshot } from '../lib/db.js';
import { keycloakPassword, issueToken, grantFor, personIdFor } from '../lib/auth.js';
import { dayOf } from '../lib/num.js';
import { refuse, noPaging, readAt, withIdempotency } from '../lib/http.js';
import { requireSession, requireRole } from './middleware.js';
import { appendEntry } from '../lib/record.js';

const r = new Hono();

r.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body || {};
  if (!email || !password) throw refuse(400, 'credentials_required', 'Sign-in exchanges an email and a password.');
  const identity = await keycloakPassword(email, password);
  if (!identity) throw refuse(401, 'authentication_failed', 'The email and password were not accepted. Signup is closed and the seeded accounts are the only accounts.');
  const grant = await grantFor(identity.email);
  const person_id = await personIdFor(identity.email);
  const claims = {
    email: identity.email,
    name: identity.name,
    person_id,
    roles: identity.roles,
    sites: grant ? grant.sites || [] : [],
    grant_ends_on: grant ? dayOf(grant.ends_on) : null,
  };
  const access_token = issueToken(claims);
  return c.json({ access_token, token_type: 'Bearer', expires_in: 12 * 60 * 60, email: claims.email, name: claims.name, roles: claims.roles, sites: claims.sites });
});

r.get('/auth/me', (c) => {
  const s = requireSession(c);
  return c.json({ email: s.email, name: s.name, roles: s.roles || [], sites: s.sites || [], grant_ends_on: s.grant_ends_on || null, expires_at: new Date(s.exp * 1000).toISOString() });
});

// The three sites and their capacity are published on the technology route, so
// they answer without a session. A capacity figure never answers without its
// confidence.
r.get('/sites', async (c) => {
  noPaging(c);
  const rows = await q('select * from site order by reference');
  return c.json(
    rows.map((s) => ({
      reference: s.reference,
      name: s.name,
      confidence: s.confidence,
      certification_state: s.certification_state,
    })),
  );
});

r.get('/sites/:reference/capacity', async (c) => {
  const s = await one('select * from site where reference = $1', [c.req.param('reference')]);
  if (!s) throw refuse(404, 'not_found', 'No such site.');
  return c.json({
    site: s.reference,
    nameplate_kg: Number(s.nameplate_kg),
    basis: s.capacity_basis,
    contracted_kg: Number(s.contracted_kg),
    uncommitted_kg: Number(s.nameplate_kg) - Number(s.contracted_kg),
    confidence: s.confidence,
    last_revised: dayOf(s.last_revised),
    derivation: { uncommitted_kg: 'nameplate_kg minus contracted_kg, computed, and allowed to be negative' },
  });
});

r.get('/sites/:reference/certification', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from site_certification where site = $1 order by effective_from asc', [c.req.param('reference')]);
  return c.json(
    rows.map((x) => ({
      reference: x.reference,
      site: x.site,
      state: x.state,
      grade: x.grade,
      effective_from: dayOf(x.effective_from),
      effective_to: x.effective_to ? dayOf(x.effective_to) : null,
      scheme: x.scheme,
      reason: x.reason,
      recorded_at: x.recorded_at,
    })),
  );
});

// A suspension that reaches backwards.
r.post('/sites/:reference/certification', async (c) => {
  const s = await requireRole(c, 'site_certification_recorded', 'quality_manager');
  const site = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const route = `POST /sites/${site}/certification`;
  const out = await withIdempotency(c, route, body, async () => {
    const { state, effective_from, effective_to = null, grade = null, reason = null } = body;
    if (!['certified', 'suspended', 'not_certified'].includes(state)) throw refuse(400, 'invalid_state', "state is one of 'certified', 'suspended', 'not_certified'.");
    if (!effective_from) throw refuse(400, 'effective_from_required', 'A certification period carries an effective_from, which may precede the date it was recorded.');
    const reference = `CERTP-${site.replace('SITE-', '')}-${Date.now().toString(36).toUpperCase()}`;
    await pool.query(
      'insert into site_certification (reference, site, state, grade, effective_from, effective_to, scheme, reason, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [reference, site, state, grade, effective_from, effective_to, 'RCS-2026', reason, s.email],
    );
    // Every certificate signed inside the window, each individually resolved.
    const certs = await q(
      `select * from certificate where site = $1 and signed_on >= $2 ${effective_to ? 'and signed_on <= $3' : ''} order by number`,
      effective_to ? [site, effective_from, effective_to] : [site, effective_from],
    );
    const inWindow = certs.filter((x) => (grade ? x.grade === grade : true));
    let restatementRef = null;
    if (state === 'suspended' && inWindow.length) {
      restatementRef = `RST-${Date.now().toString(36).toUpperCase()}`;
      await pool.query(
        'insert into restatement (reference, period, reason, opened_by, certificates, trigger_kind) values ($1,$2,$3,$4,$5,$6)',
        [restatementRef, null, `Certification suspended at ${site} from ${effective_from}${reason ? `: ${reason}` : ''}`, s.email, JSON.stringify(inWindow.map((x) => x.number)), 'certification_suspension'],
      );
    }
    if (state !== 'suspended') {
      await pool.query("update site set certification_state = $1 where reference = $2", [state === 'certified' ? 'certified' : 'not_certified', site]);
    } else {
      await pool.query("update site set certification_state = 'suspended' where reference = $1", [site]);
    }
    await appendEntry(null, { act: state === 'suspended' ? 'site_certification_suspended' : 'site_certification_recorded', person: s.email, person_id: s.person_id, site, object_kind: 'site_certification', object_ref: reference, content: { state, effective_from, effective_to, grade, reason, certificates_in_window: inWindow.map((x) => x.number) } });
    return {
      status: 201,
      body: {
        reference,
        site,
        state,
        grade,
        effective_from,
        effective_to,
        reason,
        certificates_in_window: inWindow.map((x) => ({
          number: x.number,
          version: x.version,
          signed_on: dayOf(x.signed_on),
          recipient: x.recipient,
          recipient_name: x.recipient_name,
          state: x.state,
          resolutions_available: ['reissued', 'withdrawn', 'unaffected'],
        })),
        restatement: restatementRef,
        issuing_blocked: state === 'suspended',
        blocking_condition:
          state === 'suspended'
            ? `Certification at ${site}${grade ? ` for grade ${grade}` : ''} is suspended from ${effective_from}. Issuing stops for the affected site and grade.`
            : null,
        note:
          state !== 'suspended'
            ? 'Lifting a suspension restores issuing from the moment the lift takes effect. It does not reinstate a withdrawn certificate: a withdrawal is a fact about a document, and the remedy is a new certificate.'
            : null,
      },
    };
  });
  return c.json(out.body, out.status);
});

r.get('/collectors', async (c) => {
  noPaging(c);
  requireSession(c);
  const cols = await q('select * from collector order by reference');
  const approvals = await q('select * from approval_period order by collector, valid_from');
  const findings = await q('select * from finding order by reference');
  return c.json(cols.map((col) => shapeCollector(col, approvals, findings)));
});

r.get('/collectors/:reference', async (c) => {
  requireSession(c);
  const col = await one('select * from collector where reference = $1', [c.req.param('reference')]);
  if (!col) throw refuse(404, 'not_found', 'No such collector.');
  const approvals = await q('select * from approval_period where collector = $1 order by valid_from', [col.reference]);
  const findings = await q('select * from finding where collector = $1', [col.reference]);
  return c.json(shapeCollector(col, approvals, findings));
});

function shapeCollector(col, approvals, findings) {
  const today = new Date().toISOString().slice(0, 10);
  const mine = approvals.filter((a) => a.collector === col.reference);
  return {
    reference: col.reference,
    name: col.name,
    country: col.country,
    registration: col.registration,
    registration_expiry: dayOf(col.registration_expiry),
    collection_site_types: col.collection_site_types,
    declared_streams: col.declared_streams,
    scheme_status: col.scheme_status,
    findings: findings
      .filter((f) => f.collector === col.reference)
      .map((f) => ({ reference: f.reference, kind: f.kind, detail: f.detail, raised_on: dayOf(f.raised_on), due_on: f.due_on ? dayOf(f.due_on) : null, state: f.state, batch: f.batch, departure_bp: f.departure_bp })),
    approval_periods: mine.map((a) => {
      const to = dayOf(a.valid_to);
      const daysLeft = Math.round((Date.parse(to) - Date.parse(today)) / 86400000);
      return {
        reference: a.reference,
        state: a.state,
        valid_from: dayOf(a.valid_from),
        valid_to: to,
        ...(a.state === 'conditional' ? { condition: a.condition, condition_closes_on: a.condition_closes_on ? dayOf(a.condition_closes_on) : null } : {}),
        expiring: daysLeft >= 0 && daysLeft <= 14,
        expired: daysLeft < 0,
      };
    }),
  };
}

r.post('/collectors/:reference/approvals', async (c) => {
  const s = await requireRole(c, 'collector_approval_added', 'quality_manager');
  const collector = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /collectors/${collector}/approvals`, body, async () => {
    const { state, valid_from, valid_to, condition = null, condition_closes_on = null } = body;
    if (!['approved', 'conditional', 'suspended', 'lapsed'].includes(state)) throw refuse(400, 'invalid_state', "state is one of 'approved', 'conditional', 'suspended', 'lapsed'.");
    if (!valid_from || !valid_to) throw refuse(400, 'period_required', 'An approval period carries a valid_from and a valid_to.');
    if (state === 'conditional' && (!condition || !condition_closes_on)) throw refuse(400, 'condition_required', 'A conditional approval names its condition and the date it must be closed by.');
    const col = await one('select * from collector where reference = $1', [collector]);
    if (!col) throw refuse(404, 'not_found', 'No such collector.');
    const reference = `APR-${collector.replace('COL-', '')}-${Date.now().toString(36).toUpperCase()}`;
    await pool.query(
      'insert into approval_period (reference, collector, state, valid_from, valid_to, condition, condition_closes_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [reference, collector, state, valid_from, valid_to, condition, condition_closes_on, s.email],
    );
    await appendEntry(null, { act: `collector_${state}`, person: s.email, person_id: s.person_id, object_kind: 'approval_period', object_ref: reference, content: { collector, state, valid_from, valid_to, condition } });
    return { status: 201, body: { reference, collector, state, valid_from, valid_to, condition, condition_closes_on } };
  });
  return c.json(out.body, out.status);
});

r.get('/parties/:reference/versions', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from party_version where reference = $1 order by effective_from asc', [c.req.param('reference')]);
  if (!rows.length) throw refuse(404, 'not_found', 'No such party.');
  return c.json(
    rows.map((x, i) => ({
      reference: x.reference,
      party_kind: x.party_kind,
      name: x.name,
      effective_from: dayOf(x.effective_from),
      superseded: i < rows.length - 1,
      superseded_from: i < rows.length - 1 ? String(rows[i + 1].effective_from).slice(0, 10) : null,
      recorded_at: x.recorded_at,
    })),
  );
});

r.post('/parties/:reference/versions', async (c) => {
  const s = await requireRole(c, 'party_version_recorded', 'quality_manager', 'claims_manager');
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /parties/${reference}/versions`, body, async () => {
    const { name, effective_from, party_kind = 'collector' } = body;
    if (!name || !effective_from) throw refuse(400, 'name_and_date_required', 'A party version records a new name from an effective date.');
    const prev = await one('select * from party_version where reference = $1 order by effective_from desc limit 1', [reference]);
    const ins = await pool.query(
      'insert into party_version (reference, party_kind, name, effective_from) values ($1,$2,$3,$4) returning id',
      [reference, prev ? prev.party_kind : party_kind, name, effective_from],
    );
    if (prev) await pool.query('update party_version set superseded_by = $1 where id = $2', [ins.rows[0].id, prev.id]);
    await appendEntry(null, { act: 'party_version_recorded', person: s.email, person_id: s.person_id, object_kind: 'party_version', object_ref: reference, content: { name, effective_from, supersedes: prev ? prev.name : null } });
    return { status: 201, body: { reference, name, effective_from, supersedes: prev ? { name: prev.name, effective_from: dayOf(prev.effective_from) } : null, note: 'The previous version is superseded rather than rewritten.' } };
  });
  return c.json(out.body, out.status);
});

r.get('/reconciliation', async (c) => {
  noPaging(c);
  requireSession(c);
  // Six figures read from one state. A residual computed from consumptions taken
  // before a run closed and outputs taken after it would be an artefact of the
  // read rather than a fact about the plant.
  return snapshot(async (runner, seen) => {
  const SOURCES = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];
  const inbound = await runner.q('select source, max(received_at) as latest from inbound_record group by source');
  const integration_ages = SOURCES.map((src) => {
    const row = inbound.find((x) => x.source === src);
    return {
      source: src,
      age_hours: row && row.latest ? Math.floor((Date.now() - new Date(row.latest).getTime()) / 3600000) : null,
      last_received_at: row && row.latest ? new Date(row.latest).toISOString() : null,
    };
  });

  const runs = await runner.q('select * from run');
  const cons = await runner.q('select * from consumption');
  const outs = await runner.q('select * from output');
  const massIn = cons.reduce((s, x) => s + Number(x.mass_g), 0);
  const massOut = outs.reduce((s, x) => s + Number(x.mass_g), 0);
  const losses = runs.reduce((s, x) => s + Number(x.losses_g || 0), 0);
  const mass_balance_residual_g = massIn - massOut - losses;

  const { summariseMovements } = await import('../engine/ledger.js');
  const movements = await runner.q('select * from credit_movement');
  const byPeriod = new Map();
  for (const m of movements) {
    if (!byPeriod.has(m.period)) byPeriod.set(m.period, []);
    byPeriod.get(m.period).push(m);
  }
  let credit_margin_g = 0;
  for (const rows of byPeriod.values()) {
    const sums = summariseMovements(rows);
    credit_margin_g += sums.post_consumer.credits_available_g + sums.pre_consumer.credits_available_g;
  }

  const openRuns = new Set(runs.filter((x) => x.state === 'open').map((x) => x.reference));
  const consumptions_on_open_runs = cons.filter((x) => openRuns.has(x.run)).length;

  const { contextFor, batchFacts } = await import('../engine/genealogy.js');
  const ctx = await contextFor(runner);
  const batches_with_broken_custody = ctx.batches.filter((b) => !batchFacts(b, ctx).custody_complete).length;

  const certs = await runner.q('select * from certificate');
  const superseded = await runner.q('select * from carbon_figure where superseded_by is not null');
  const supersededIds = new Set(superseded.map((x) => x.id));
  const certificates_with_superseded_figures = certs.filter((x) => {
    const iv = x.input_versions || {};
    return supersededIds.has(iv.carbon_figure) || (x.carbon && x.carbon.cache_valid === false);
  }).length;

  const history = [];
  for (const p of await runner.q('select * from balance_period order by period_from desc limit 4')) {
    const rows = movements.filter((m) => m.period === p.id);
    const sums = summariseMovements(rows);
    history.push({
      period: p.id,
      from: dayOf(p.period_from),
      to: dayOf(p.period_to),
      state: p.state,
      credit_margin_g: sums.post_consumer.credits_available_g + sums.pre_consumer.credits_available_g,
    });
  }

  return c.json({
    read_at: seen,
    mass_balance_residual_g,
    credit_margin_g,
    consumptions_on_open_runs,
    batches_with_broken_custody,
    certificates_with_superseded_figures,
    integration_ages,
    history,
    derivation: {
      mass_balance_residual_g: 'sum of consumption masses minus sum of output masses minus recorded losses',
      credit_margin_g: 'sum of credits_available_g across every period and category',
      note: 'These are six figures rather than six verdicts. Each is expected to be non-zero.',
    },
  });
  });
});

// The published process diagram, generated from the four run types so it stays
// correct when a stage changes. It carries mass in and mass out per stage and
// nothing that identifies a run, a batch, a collector or a lot.
r.get('/process-stages', async (c) => {
  noPaging(c);
  const ORDER = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];
  const runs = await q('select reference, run_type from run');
  const cons = await q('select run, mass_g from consumption');
  const outs = await q('select run, mass_g from output');
  const typeOf = new Map(runs.map((x) => [x.reference, x.run_type]));
  const agg = Object.fromEntries(ORDER.map((t) => [t, { mass_in_g: 0, mass_out_g: 0, runs: 0 }]));
  for (const x of runs) if (agg[x.run_type]) agg[x.run_type].runs += 1;
  for (const x of cons) {
    const t = typeOf.get(x.run);
    if (agg[t]) agg[t].mass_in_g += Number(x.mass_g);
  }
  for (const x of outs) {
    const t = typeOf.get(x.run);
    if (agg[t]) agg[t].mass_out_g += Number(x.mass_g);
  }
  return c.json(
    ORDER.map((t) => ({
      stage: t,
      order: ORDER.indexOf(t) + 1,
      mass_in_g: agg[t].mass_in_g,
      mass_out_g: agg[t].mass_out_g,
      losses_g: agg[t].mass_in_g - agg[t].mass_out_g,
      runs: agg[t].runs,
      derivation: 'the sum of consumption masses and output masses across every closed run of this type. Losses reduce the claim.',
    })),
  );
});

r.get('/statistics', async (c) => {
  noPaging(c);
  const rows = await q('select * from statistic order by key');
  return c.json(rows.map((x) => ({ key: x.key, value: x.value, source: x.source, year: x.year, geography: x.geography })));
});

r.get('/positions', async (c) => {
  noPaging(c);
  const rows = await q('select * from position_row order by closes_on');
  return c.json(rows.map((x) => ({ reference: x.reference, title: x.title, location: x.location, department: x.department, contract_type: x.contract_type, closes_on: dayOf(x.closes_on) })));
});

r.get('/news', async (c) => {
  noPaging(c);
  const rows = await q('select * from news_item order by dated desc');
  return c.json(rows.map((x) => ({ reference: x.reference, title: x.title, tag: x.tag, outlet: x.outlet, date: dayOf(x.dated), link: x.link, language: x.language, coverage: x.coverage })));
});

r.get('/claim-register', async (c) => {
  noPaging(c);
  const rows = await q('select * from claim_substantiation order by reference');
  const today = new Date().toISOString().slice(0, 10);
  return c.json(
    rows.map((x) => ({
      reference: x.reference,
      claim: x.claim,
      route: x.route,
      first_published: dayOf(x.first_published),
      evidence: x.evidence,
      evidence_expires: x.evidence_expires ? dayOf(x.evidence_expires) : null,
      method_version: x.method_version,
      approver: x.approver,
      review_date: dayOf(x.review_date),
      state: x.state,
      evidence_expired: !!(x.evidence_expires && dayOf(x.evidence_expires) < today),
      evidence_expires_before_review: !!(x.evidence_expires && dayOf(x.evidence_expires) < dayOf(x.review_date)),
    })),
  );
});

export default r;
