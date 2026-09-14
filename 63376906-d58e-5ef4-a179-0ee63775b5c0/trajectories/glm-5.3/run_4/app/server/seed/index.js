// Applies schema then seeds the exact rows the brief fixes, then writes one
// record entry per seeded act in the order the acts happened.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { q, tx } from '../db.js';
import * as D from './data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZERO = '0'.repeat(64);
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const J = (v) => JSON.stringify(v);

export function schemaSql() {
  return fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
}

async function ensureSchema() {
  await q(schemaSql());
}

// record entry helper inside a transaction
function makeEntries(c) {
  return async function entry(fields) {
    const body = J({
      event_at: fields.event_at || '',
      effective_on: fields.effective_on || '',
      person: fields.person || 'system',
      site: fields.site || null,
      object: fields.object || null,
      act: fields.act,
      payload: fields.payload || {},
      kind: fields.kind || 'act',
      refused: false,
      outcome: fields.outcome || null,
      corrects: fields.corrects === null ? undefined : (fields.corrects || null)
    });
    const prevRow = await c.query('SELECT digest FROM record_entry ORDER BY seq DESC LIMIT 1');
    const prev = prevRow.rows.length ? prevRow.rows[0].digest : ZERO;
    const digest = sha(prev + '|' + body);
    const r = await c.query(
      `INSERT INTO record_entry (event_at, effective_on, person, site, object, act, payload, digest, prev_digest, kind, refused, outcome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11) RETURNING seq, digest, prev_digest`,
      [fields.event_at || '', fields.effective_on || '', fields.person || 'system', fields.site || null,
       fields.object || null, fields.act, body, digest, prev, fields.kind || 'act', fields.outcome || null]
    );
    return r.rows[0];
  };
}


async function seedRows() {
  const marker = await q(`SELECT to_regclass('public.seed_marker') AS t`);
  if (marker.rows[0].t) {
    const done = await q('SELECT * FROM seed_marker');
    if (done.rows.length) return false;
  }
  await q(`CREATE TABLE IF NOT EXISTS seed_marker (id int PRIMARY KEY DEFAULT 1, seeded_at timestamptz DEFAULT now())`);
  await tx(async (c) => {
    const entry = makeEntries(c);

    for (const s of D.SITES) {
      await c.query(
        `INSERT INTO site (reference, name, confidence, certification_state, nameplate_kg, contracted_kg, capacity_basis, last_revised)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [s.reference, s.name, s.confidence, s.certification_state, s.nameplate_kg, s.contracted_kg, D.CAPACITY_BASIS, D.LAST_REVISED]
      );
      await c.query(
        `INSERT INTO certification_period (site, state, valid_from, valid_to, recorded_on, recorded_by)
         VALUES ($1,$2,$3,$4,'2026-01-05','system')`,
        [s.reference, s.certification_state === 'certified' ? 'certified' : 'not_certified', '2026-01-01', null]
      );
    }

    for (const u of D.USERS) {
      await c.query(`INSERT INTO app_user (email, name, role, sites, grant_ends) VALUES ($1,$2,$3,$4,$5)`,
        [u.email, u.name, u.role, J(u.sites), u.grant_ends]);
      await c.query(`INSERT INTO access_grant (email, sites, valid_to, granted_on, granted_by) VALUES ($1,$2,$3,'2026-01-02','system')`,
        [u.email, J(u.sites), u.grant_ends]);
      await entry({ person: 'system', act: 'access_grant', object: u.email, site: u.sites[0], event_at: '2026-01-02T09:00:00Z', effective_on: '2026-01-02', payload: { email: u.email, role: u.role, sites: u.sites, valid_to: u.grant_ends } });
    }

    for (const col of D.COLLECTORS) {
      await c.query(`INSERT INTO collector (reference, country, registration, registration_expiry, site_types, streams, scheme_status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [col.reference, col.country, col.registration, col.registration_expiry, J(col.site_types), J(col.streams), col.scheme_status]);
    }
    for (const a of D.APPROVALS) {
      await c.query(`INSERT INTO approval_period (collector, state, valid_from, valid_to, condition, condition_closes_on) VALUES ($1,$2,$3,$4,$5,$6)`,
        [a.collector, a.state, a.valid_from, a.valid_to, a.condition, a.condition_closes_on]);
      await entry({ person: 'quality@example.com', act: 'collector_approved', object: a.collector, event_at: a.valid_from + 'T09:00:00Z', effective_on: a.valid_from, payload: { state: a.state, valid_from: a.valid_from, valid_to: a.valid_to, condition: a.condition } });
    }
    for (const p of D.PARTY_VERSIONS) {
      await c.query(`INSERT INTO party_version (reference, name, effective_from) VALUES ($1,$2,$3)`, [p.reference, p.name, p.effective_from]);
    }
    for (const d of D.DEVICES) {
      await c.query(`INSERT INTO device (reference, site, calibrated_on) VALUES ($1,$2,$3)`, [d.reference, d.site, d.calibrated_on]);
    }

    const finding = await c.query(
      `INSERT INTO finding (collector, raised_on, detail, basis, state, open) VALUES ($1,$2,$3,$4,'open',true) RETURNING id`,
      ['COL-CINDER', '2026-02-22', 'Measured PA6 fraction 9100 basis points against declared 9900, a departure of 800 basis points beyond the 500 basis point tolerance.', 'sampled_composition']
    );
    const findingId = finding.rows[0].id;
    await entry({ person: 'quality@example.com', act: 'finding_raised', object: 'COL-CINDER', event_at: '2026-02-22T10:00:00Z', effective_on: '2026-02-22', payload: { basis: 'sampled_composition', departure_bp: 800 } });

    for (const b of D.BATCHES) {
      await c.query(
        `INSERT INTO batch (reference, collector, collector_name, site, grade, category, gross_g, tare_g, net_g, moisture_bp, moisture_method, device, received_on, composition, contamination, custody, accepted_g, rejected_g, delivered_g, claimable_from, finding_id, created_by, accepted)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,0,$18,$19,$20,'plant@example.com',true)`,
        [b.reference, b.collector, collectorNameAt(b.collector, b.received_on), b.site, b.grade, b.category,
         b.gross_g, b.tare_g, b.net_g, b.moisture_bp, b.moisture_method, b.device, b.received_on,
         J(b.composition), J(b.contamination), J(b.custody), b.net_g, b.net_g, b.claimable_from || null,
         b.reference === 'BATCH-1004' ? findingId : null]
      );
      await c.query(
        `INSERT INTO weighing (reference, site, device, calibrated_on, net_g, recorded_on)
         VALUES ($1,$2,$3,(SELECT calibrated_on FROM device WHERE reference=$3),$4,$5)`,
        ['W-' + b.reference, b.site, b.device, b.net_g, b.received_on]
      );
      await entry({
        person: 'plant@example.com', act: 'batch_booked_in', object: b.reference, site: b.site,
        event_at: b.received_on + 'T08:00:00Z', effective_on: b.received_on,
        payload: { collector: b.collector, category: b.category, net_g: b.net_g, moisture_bp: b.moisture_bp, device: b.device }
      });
    }

    for (const r of D.RECIPES) {
      await c.query(`INSERT INTO recipe (version, run_type, set_points, reagents, residence_time_minutes, released_by, released_on) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [r.version, r.run_type, J(r.set_points), J(r.reagents), r.residence_time_minutes, r.released_by, r.released_on]);
    }
    for (const r of D.RUNS) {
      await c.query(
        `INSERT INTO run (reference, run_type, site, equipment, recipe_version, operator, started_at, closed_at, losses_g, closed, within_tolerance, set_points, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'plant@example.com')`,
        [r.reference, r.run_type, r.site, r.equipment, r.recipe_version, r.operator, r.started_at, r.closed_at, r.losses_g, r.closed, r.within_tolerance, J(r.set_points)]
      );
      await entry({ person: 'plant@example.com', act: 'run_started', object: r.reference, site: r.site, event_at: r.started_at, effective_on: r.started_at.slice(0, 10), payload: { run_type: r.run_type, recipe_version: r.recipe_version } });
    }
    for (const cm of D.CONSUMPTIONS) {
      await c.query(`INSERT INTO consumption (run, batch, mass_g, effective_on) VALUES ($1,$2,$3,$4)`, [cm.run, cm.batch, cm.mass_g, cm.effective_on]);
      await entry({ person: 'plant@example.com', act: 'consumption_recorded', object: cm.run, site: 'SITE-DEMO', event_at: cm.effective_on + 'T08:00:00Z', effective_on: cm.effective_on, payload: { batch: cm.batch, mass_g: cm.mass_g } });
    }
    for (const o of D.OUTPUTS) {
      await c.query(`INSERT INTO output (reference, run, kind, mass_g, disposition, lot, created_by) VALUES ($1,$2,$3,$4,$5,$6,'plant@example.com')`,
        [o.reference, o.run, o.kind, o.mass_g, o.disposition || null, o.lot || null]);
      await entry({ person: 'plant@example.com', act: 'output_recorded', object: o.run, site: 'SITE-DEMO', event_at: '2026-03-06T12:00:00Z', effective_on: '2026-03-06', payload: { output: o.reference, kind: o.kind, mass_g: o.mass_g } });
    }
    for (const l of D.LOTS) {
      await c.query(
        `INSERT INTO lot (reference, run, site, grade, mass_g, disposition, claim_type, specification_version, provisional_factor, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'plant@example.com')`,
        [l.reference, l.run, l.site, l.grade, l.mass_g, l.disposition, l.claim_type, l.specification_version, l.provisional_factor]
      );
      await entry({ person: 'plant@example.com', act: 'lot_recorded', object: l.reference, site: l.site, event_at: '2026-03-07T09:00:00Z', effective_on: '2026-03-07', payload: { mass_g: l.mass_g, grade: l.grade } });
    }
    for (const r of D.RUNS) {
      await entry({ person: 'plant@example.com', act: 'run_closed', object: r.reference, site: r.site, event_at: r.closed_at, effective_on: r.closed_at.slice(0, 10), payload: { losses_g: r.losses_g } });
    }

    for (const t of D.TEST_RESULTS) {
      const cfg = { lot: t.lot || null, batch: t.batch || null };
      const r = await c.query(
        `INSERT INTO test_result (lot, batch, property, method, instrument, analyst, value, unit, uncertainty_bp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [cfg.lot, cfg.batch, t.property, t.method, t.instrument, t.analyst, t.value, t.unit, t.uncertainty_bp]
      );
      await entry({ person: t.analyst, act: 'test_result_entered', object: cfg.lot || cfg.batch, site: 'SITE-DEMO', event_at: '2026-03-07T10:00:00Z', effective_on: '2026-03-07', payload: { property: t.property, method: t.method, value: t.value, test_result_id: r.rows[0].id } });
    }
    for (const d of D.DEVIATIONS) {
      await c.query(`INSERT INTO deviation (reference, runs, lots, raised_by, raised_at, description, state, outcome) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [d.reference, J(d.runs), J(d.lots), d.raised_by, d.raised_at, d.description, d.state, d.outcome]);
      await entry({ person: d.raised_by, act: d.state === 'open' ? 'deviation_raised' : 'deviation_closed', object: d.reference, site: 'SITE-DEMO', event_at: d.raised_at + 'T09:00:00Z', effective_on: d.raised_at, payload: { state: d.state, runs: d.runs, lots: d.lots, outcome: d.outcome } });
    }
    for (const o of D.OVERRIDES) {
      await c.query(`INSERT INTO override (reference, lot, separation, reason, authorised_by, authorised_on, reviewed) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [o.reference, o.lot, o.separation, o.reason, o.authorised_by, o.authorised_on, o.reviewed]);
      await entry({ person: o.authorised_by, act: 'override_authorised', object: o.reference, site: 'SITE-DEMO', event_at: o.authorised_on + 'T09:00:00Z', effective_on: o.authorised_on, payload: { separation: o.separation, lot: o.lot, reason: o.reason } });
    }

    for (const f of D.FACTORS) {
      await c.query(`INSERT INTO conversion_factor (reference, site, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [f.reference, f.site, f.factor_bp, f.derived_from, f.derived_to, f.derived_in_g, f.derived_out_g, f.provisional, f.published_by, f.published_on]);
      await entry({ person: f.published_by, act: 'conversion_factor_published', object: f.reference, site: f.site, event_at: f.published_on + 'T09:00:00Z', effective_on: f.published_on, payload: { factor_bp: f.factor_bp, provisional: f.provisional } });
    }

    for (const bp of D.BALANCE_PERIODS) {
      await c.query(`INSERT INTO balance_period (id, site, grade, period_from, period_to, state, carry_over_limit_bp, closed_on, cut_off, allocation_basis) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [bp.id, bp.site, bp.grade, bp.period_from, bp.period_to, bp.state, bp.carry_over_limit_bp, bp.closed_on, bp.cut_off, bp.allocation_basis]);
    }
    await entry({ person: 'claims@example.com', act: 'balance_period_closed', object: 'BP-DEMO-N6-2025H2', site: 'SITE-DEMO', event_at: '2026-01-15T10:00:00Z', effective_on: '2026-01-15', payload: { cut_off: '2026-01-10' } });

    const factorBySite = {};
    for (const f of D.FACTORS) factorBySite[f.site] = f;
    const batchByRef = {};
    for (const b of D.BATCHES) batchByRef[b.reference] = b;
    for (const cm of D.CONSUMPTIONS) {
      const b = batchByRef[cm.batch];
      if (!b) continue;
      const period = periodFor(b.site, cm.effective_on);
      if (!period) continue;
      const res = claimableAtSeed(b);
      const factor = factorBySite[b.site];
      const dry = cm.mass_g;
      let credit = 0;
      if (res.claimable && factor) {
        credit = Math.floor((dry * factor.factor_bp) / 10000);
      }
      const isClaimable = res.claimable;
      if (isClaimable) {
        await c.query(
          `INSERT INTO credit_movement (balance_period, category, direction, mass_g, lot, kind, derivation, effective_on, consumed_batch)
           VALUES ($1,$2,'in',$3,null,'consumption',$4,$5,$6)`,
          [period, b.category, credit, J({ batch: b.reference, dry_mass_g: dry, factor_bp: factor ? factor.factor_bp : 0, claimable: true }), cm.effective_on, b.reference]
        );
      } else {
        await c.query(
          `INSERT INTO credit_movement (balance_period, category, direction, mass_g, lot, kind, derivation, effective_on, consumed_batch)
           VALUES ($1,$2,'in',0,null,'consumption',$3,$4,$5)`,
          [period, b.category, J({ batch: b.reference, dry_mass_g: dry, factor_bp: factor ? factor.factor_bp : 0, claimable: false, reason: res.reason }), cm.effective_on, b.reference]
        );
        await c.query(
          `INSERT INTO credit_movement (balance_period, category, direction, mass_g, lot, kind, derivation, effective_on, consumed_batch)
           VALUES ($1,$2,'in',$3,null,'non_claimable_input',$4,$5,$6)`,
          [period, b.category, dry, J({ batch: b.reference, non_claimable_input_g: dry }), cm.effective_on, b.reference]
        );
      }
    }

    for (const t of D.TRANSFERS) {
      await c.query(`INSERT INTO transfer (reference, from_period, to_period, mass_g, category, moved_on) VALUES ($1,$2,$3,$4,$5,$6)`,
        [t.reference, t.from_period, t.to_period, t.mass_g, t.category, t.moved_on]);
      await c.query(`INSERT INTO credit_movement (balance_period, category, direction, mass_g, lot, kind, derivation, effective_on, transfer) VALUES ($1,$2,'in',$3,null,'transfer_in',$4,$5,$6)`,
        [t.to_period, t.category, t.mass_g, J({ origin_site: 'SITE-PILOT', movement: t.reference, fresh_credit: false }), t.moved_on, t.reference]);
      await c.query(`INSERT INTO credit_movement (balance_period, category, direction, mass_g, lot, kind, derivation, effective_on, transfer) VALUES ($1,$2,'out',$3,null,'transfer_out',$4,$5,$6)`,
        [t.from_period, t.category, t.mass_g, J({ destination_period: t.to_period, movement: t.reference }), t.moved_on, t.reference]);
      await entry({ person: 'claims@example.com', act: 'transfer_recorded', object: t.reference, site: 'SITE-DEMO', event_at: t.moved_on + 'T09:00:00Z', effective_on: t.moved_on, payload: { mass_g: t.mass_g, from: t.from_period, to: t.to_period } });
    }

    for (const m of D.CARBON_METHODS) {
      await c.query(
        `INSERT INTO carbon_method (id, version, standard, functional_unit, boundary, allocation_basis, reviewer, published_on, data_quality, emission_factors, primary_threshold_bp, superseded, superseded_on, published_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [m.id, m.version, m.standard, m.functional_unit, m.boundary, m.allocation_basis, m.reviewer, m.published_on, J(m.data_quality), J(m.emission_factors), m.primary_threshold_bp, m.superseded, m.superseded_on, m.published_by]
      );
      await entry({ person: m.published_by, act: 'carbon_method_published', object: m.id + ' v' + m.version, site: 'SITE-DEMO', event_at: m.published_on + 'T09:00:00Z', effective_on: m.published_on, payload: { version: m.version, standard: m.standard, boundary: m.boundary } });
    }
    for (const f of D.CARBON_FIGURES) {
      await c.query(
        `INSERT INTO carbon_figure (lot, version, value_mg_per_kg, uncertainty_bp, primary_share_bp, method_id, method_version, boundary, breakdown, energy_location_mg_per_kg, energy_market_mg_per_kg, comparator, input_versions, computed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [f.lot, f.version, f.value_mg_per_kg, f.uncertainty_bp, f.primary_share_bp, f.method_id, f.method_version, f.boundary, J(f.breakdown), f.energy_location_mg_per_kg, f.energy_market_mg_per_kg, J(f.comparator), J(f.input_versions), f.computed_at]
      );
      await entry({ person: 'claims@example.com', act: 'carbon_figure_computed', object: f.lot, site: 'SITE-DEMO', event_at: f.computed_at + 'T09:00:00Z', effective_on: f.computed_at, payload: { value_mg_per_kg: f.value_mg_per_kg, method_version: f.method_id + ' v' + f.method_version } });
    }
    for (const e of D.ENERGY_INSTRUMENTS) {
      await c.query(`INSERT INTO energy_instrument (reference, quantity_kwh, vintage, region, state) VALUES ($1,$2,$3,$4,$5)`,
        [e.reference, e.quantity_kwh, e.vintage, e.region, e.state]);
    }
    for (const r of D.ENERGY_RETIREMENTS) {
      await c.query(`INSERT INTO energy_retirement (instrument, balance_period, retired_kwh, retired_on, retired_by, consumption_vintage, consumption_region) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [r.instrument, r.balance_period, r.retired_kwh, r.retired_on, r.retired_by, r.consumption_vintage, r.consumption_region]);
      await entry({ person: r.retired_by, act: 'energy_retired', object: r.instrument, site: 'SITE-DEMO', event_at: r.retired_on + 'T09:00:00Z', effective_on: r.retired_on, payload: { retired_kwh: r.retired_kwh, balance_period: r.balance_period } });
    }

    for (const s of D.SPECIFICATIONS) {
      await c.query(`INSERT INTO specification (id, version, issued_on, rows, virgin_reference, superseded) VALUES ($1,$2,$3,$4,$5,$6)`,
        [s.id, s.version, s.issued_on, J(s.rows), J(s.virgin_reference), s.superseded]);
    }
    for (const cu of D.CUSTOMERS) {
      await c.query(`INSERT INTO customer (reference, contact, holds, application, industry) VALUES ($1,$2,$3,$4,$5)`,
        [cu.reference, cu.contact, J(cu.holds), cu.application, cu.industry]);
    }
    for (const cn of D.CONFORMANCES) {
      await c.query(`INSERT INTO conformance (customer, spec_id, spec_version, application, trials, outcome) VALUES ($1,$2,$3,$4,$5,$6)`,
        [cn.customer, cn.spec_id, cn.spec_version, cn.application, J(cn.trials), cn.outcome]);
    }
    await entry({ person: 'quality@example.com', act: 'specification_issued', object: 'SPEC-N6 v3', site: 'SITE-DEMO', event_at: '2026-02-01T09:00:00Z', effective_on: '2026-02-01', payload: { version: 3, issued_to: ['CUS-HELIOS'] } });
    await c.query(`INSERT INTO spec_issue (spec_id, spec_version, customer, issued_on) VALUES ('SPEC-N6',3,'CUS-HELIOS','2026-02-01')`);

    for (const ct of D.CONTRACTS) {
      await c.query(`INSERT INTO contract (id, recipient, site, period, committed_kg, floor_bp, delivered_kg, shortfall_consequence) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [ct.id, ct.recipient, ct.site, ct.period, ct.committed_kg, ct.floor_bp, ct.delivered_kg, ct.shortfall_consequence]);
    }

    for (const cert of D.CERTIFICATES) {
      const cf = D.CARBON_FIGURES[0];
      const carbon = {
        value_mg_per_kg: 4260000, boundary: cf.boundary, method_version: 'CM-PA6 v2', uncertainty_bp: 1200,
        comparator: cf.comparator, breakdown: cf.breakdown, primary_share_bp: 6500,
        energy_location_mg_per_kg: cf.energy_location_mg_per_kg, energy_market_mg_per_kg: cf.energy_market_mg_per_kg,
        default_led: false
      };
      await c.query(
        `INSERT INTO certificate (number, version, site, lots, grade, specification_version, claim_type, content_bp, category_split, balance_period, carbon, primary_share_bp, scheme, registration, test_results, permitted_statement, prohibited_statement, signer, signed_at, verification_url, state, provisional_factor, conditions, figure_versions, recipient, recipient_name, withdrawn_on, withdrawn_by, withdrawal_reason, notified_recipients, void_statements, derived_certificates, batch_traversal)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)`,
        [cert.number, cert.version, cert.site, J(cert.lots), cert.grade, cert.specification_version, cert.claim_type,
         cert.content_bp, J(cert.category_split), cert.balance_period, J(carbon), cert.primary_share_bp, cert.scheme,
         cert.registration, J(D.TEST_RESULTS.filter((t) => t.lot === cert.lots[0].reference)),
         permittedStatement(cert.claim_type, cert.content_bp, cert.category_split),
         prohibitedStatement(cert.claim_type),
         cert.signer, cert.signed_at, 'https://ravel.example.com/verify/' + cert.number, cert.state, cert.provisional_factor,
         J(eightConditions(true)), J({ carbon_method: 'CM-PA6 v2', conversion_factor: cert.provisional_factor ? 'CF-PILOT-1' : 'CF-DEMO-1', specification: 'SPEC-N6 v3', emission_factor_set: 'EcoBase 2025' }),
         cert.recipient, cert.recipient_name, cert.withdrawn_on, cert.withdrawn_by, cert.withdrawal_reason,
         J(cert.notified_recipients || []), J(cert.void_statements || []), J(cert.derived_certificates || []),
         J(cert.batch_traversal || {})]
      );
      await entry({ person: cert.signer, act: 'certificate_signed', object: cert.number, site: cert.site, event_at: cert.signed_at, effective_on: cert.signed_at.slice(0, 10), payload: { number: cert.number, claim_type: cert.claim_type, content_bp: cert.content_bp, recipient: cert.recipient } });
      if (cert.state === 'withdrawn') {
        await entry({ person: cert.withdrawn_by, act: 'certificate_withdrawn', object: cert.number, site: cert.site, event_at: cert.withdrawn_on + 'T11:00:00Z', effective_on: cert.withdrawn_on, payload: { reason: cert.withdrawal_reason, notified: ['CUS-HELIOS'] } });
      }
    }

    for (const ib of D.INBOUND) {
      const verbatim = JSON.stringify(ib.payload);
      await c.query(`INSERT INTO inbound_record (source, received_at, payload_verbatim, payload, reference) VALUES ($1,$2,$3,$4,$5)`,
        [ib.source, ib.received_at, verbatim, J(ib.payload), 'IB-' + ib.source.toUpperCase().slice(0, 3) + '-000' + (D.INBOUND.indexOf(ib) + 1)]);
    }
    await entry({ person: 'system', act: 'inbound_record_received', object: 'weighbridge', event_at: '2026-02-20T06:14:00Z', effective_on: '2026-02-20', payload: { source: 'weighbridge' } });
    await entry({ person: 'system', act: 'inbound_record_received', object: 'control_system', event_at: '2026-03-04T22:41:00Z', effective_on: '2026-03-04', payload: { source: 'control_system' } });
    await entry({ person: 'system', act: 'inbound_record_received', object: 'laboratory', event_at: '2026-03-06T09:02:00Z', effective_on: '2026-03-06', payload: { source: 'laboratory' } });

    for (const s of D.STATISTICS) {
      await c.query(`INSERT INTO statistic (key, value, source, year, geography) VALUES ($1,$2,$3,$4,$5)`, [s.key, s.value, s.source, s.year, s.geography]);
    }
    for (const p of D.POSITIONS) {
      await c.query(`INSERT INTO position (title, location, department, contract_type, closes_on) VALUES ($1,$2,$3,$4,$5)`, [p.title, p.location, p.department, p.contract_type, p.closes_on]);
    }
    for (const n of D.NEWS) {
      await c.query(`INSERT INTO news_item (title, tag, outlet, dated, link, language) VALUES ($1,$2,$3,$4,$5,$6)`, [n.title, n.tag, n.outlet, n.dated, n.link, n.language]);
    }
    for (const cs of D.CLAIM_SUBSTANTIATIONS) {
      await c.query(`INSERT INTO claim_substantiation (claim, route, first_published, evidence, method_version, approver, review_on) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [cs.claim, cs.route, cs.first_published, J(cs.evidence), cs.method_version, cs.approver, cs.review_on]);
    }

    const holdSeq = (await c.query(`SELECT seq FROM record_entry WHERE act='certificate_signed' AND object='CERT-PILOT-000001' LIMIT 1`)).rows[0].seq;
    await c.query(`INSERT INTO legal_hold (reference, seq, placed_on, placed_by, note) VALUES ($1,$2,$3,$4,$5)`,
      ['HLD-0001', holdSeq, '2026-05-01', 'auditor@example.com', 'Regulatory review of the withdrawn certificate.']);
    await c.query(`UPDATE record_entry SET legal_hold = true WHERE seq = $1`, [holdSeq]);
    await entry({ person: 'auditor@example.com', act: 'legal_hold_placed', object: String(holdSeq), event_at: '2026-05-01T09:00:00Z', effective_on: '2026-05-01', payload: { reference: 'HLD-0001' } });
    await c.query('INSERT INTO seed_marker (id) VALUES (1) ON CONFLICT DO NOTHING');
  });
  return true;
}

function collectorNameAt(ref, date) {
  const versions = D.PARTY_VERSIONS.filter((p) => p.reference === ref).sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  let name = ref;
  for (const v of versions) if (v.effective_from <= date) name = v.name;
  return name;
}

function periodFor(site, on) {
  const bp = D.BALANCE_PERIODS.find((p) => p.site === site && p.period_from <= on && on <= p.period_to);
  return bp ? bp.id : null;
}

function claimableAtSeed(b) {
  const kinds = (b.custody || []).map((k) => k.kind);
  const missing = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'].filter((k) => !kinds.includes(k));
  const approval = D.APPROVALS.find((a) => a.collector === b.collector && a.valid_from <= b.received_on && b.received_on <= a.valid_to);
  const okApproval = approval && ['approved', 'conditional'].includes(approval.state);
  if (!okApproval) return { claimable: false, reason: 'collector_approval_lapsed' };
  if (missing.length) return { claimable: false, reason: 'custody_link_missing:' + missing[0] };
  return { claimable: true, reason: null };
}

function permittedStatement(claimType, contentBp) {
  const pctv = String(contentBp / 100).replace(/\.?0+$/, '');
  if (claimType === 'mass_balance') {
    return 'This material is claimed by mass balance and carries ' + pctv + ' per cent recycled content allocated to it. It is not physically segregated.';
  }
  if (claimType === 'physically_segregated') {
    return 'This material contains ' + pctv + ' per cent physically segregated recycled content.';
  }
  return 'This material carries ' + pctv + ' per cent recycled content allocated by controlled blending.';
}

function prohibitedStatement(claimType) {
  if (claimType === 'mass_balance') {
    return 'You may not state that this material physically contains recycled content.';
  }
  return 'You may not state a recycled-content percentage other than the one this certificate carries.';
}

function eightConditions(satisfied) {
  return [
    ['lot_released', 'The lot is released'],
    ['no_open_deviation', 'No deviation touching the lot is open'],
    ['no_unreviewed_override', 'No override on the lot is unreviewed'],
    ['period_closed', 'The bookkeeping period is closed'],
    ['balance_invariant_holds', 'The balance invariant holds with the allocation applied'],
    ['carbon_complete', 'The carbon figure exists with all four components'],
    ['signer_scope', 'The signer holds signing scope for that site on the date of signing'],
    ['signer_did_not_enter_data', 'The signer did not enter the data']
  ].map((c) => ({ condition: c[0], label: c[1], satisfied, blocking_reference: satisfied ? null : 'record' }));
}

export async function runSeed() {
  await ensureSchema();
  const did = await seedRows();
  return did;
}
