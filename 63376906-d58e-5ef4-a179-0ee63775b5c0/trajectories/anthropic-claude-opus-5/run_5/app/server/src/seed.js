import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, q, one } from './lib/db.js';
import { appendEntry } from './lib/record.js';
import { dryMass, creditFor } from './lib/num.js';
import { statementsFor, renderDocument } from './engine/certificate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, '../../db');

export async function migrate() {
  await pool.query(`create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())`);
  const files = fs.readdirSync(DB_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const done = await one('select version from schema_migrations where version = $1', [f]);
    if (done) continue;
    const sql = fs.readFileSync(path.join(DB_DIR, f), 'utf8');
    await pool.query(sql);
    await pool.query('insert into schema_migrations (version) values ($1) on conflict do nothing', [f]);
    console.log(`[migrate] applied ${f}`);
  }
}

const T = (d) => `${d}T00:00:00Z`;

async function ins(table, row) {
  const keys = Object.keys(row);
  const vals = keys.map((k) => {
    const v = row[k];
    return v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v;
  });
  const ph = keys.map((_, i) => `$${i + 1}`).join(',');
  await pool.query(`insert into ${table} (${keys.join(',')}) values (${ph}) on conflict do nothing`, vals);
}

let recordMoment = Date.parse('2026-01-05T08:00:00Z');
async function act(entry) {
  recordMoment += 60000;
  return appendEntry(null, { ...entry, moment: new Date(recordMoment).toISOString() });
}

export async function seed() {
  const already = await one('select reference from site limit 1');
  if (already) {
    console.log('[seed] already seeded');
    return;
  }
  console.log('[seed] seeding');

  const BASIS = '8000 hours per year, 0.90 availability, 0.80 yield';
  for (const s of [
    { reference: 'SITE-PILOT', name: 'Pilot', confidence: 'commissioned', nameplate_kg: 40000, contracted_kg: 24000, certification_state: 'certified' },
    { reference: 'SITE-DEMO', name: 'Demonstration', confidence: 'commissioned', nameplate_kg: 400000, contracted_kg: 320000, certification_state: 'certified' },
    { reference: 'SITE-COMM', name: 'Commercial', confidence: 'planned', nameplate_kg: 25000000, contracted_kg: 26000000, certification_state: 'not_certified' },
  ]) {
    await ins('site', { ...s, capacity_basis: BASIS, last_revised: '2026-06-30' });
  }
  await ins('site_certification', { reference: 'CERTP-PILOT-1', site: 'SITE-PILOT', state: 'certified', grade: null, effective_from: '2025-01-01', effective_to: null, scheme: 'RCS-2026', reason: null, recorded_by: 'quality@example.com' });
  await ins('site_certification', { reference: 'CERTP-DEMO-1', site: 'SITE-DEMO', state: 'certified', grade: null, effective_from: '2025-01-01', effective_to: null, scheme: 'RCS-2026', reason: null, recorded_by: 'quality@example.com' });
  await ins('site_certification', { reference: 'CERTP-COMM-1', site: 'SITE-COMM', state: 'not_certified', grade: null, effective_from: '2025-01-01', effective_to: null, scheme: null, reason: 'The site is planned and holds no certification.', recorded_by: 'quality@example.com' });

  // Accounts and their grants. Every grant ends on 2027-06-30.
  const accounts = [
    ['plant@example.com', 'Ines Bekele', 'plant_operator', ['SITE-DEMO', 'SITE-PILOT']],
    ['analyst@example.com', 'Tomas Vlach', 'lab_analyst', ['SITE-DEMO', 'SITE-PILOT']],
    ['quality@example.com', 'Marit Solheim', 'quality_manager', ['SITE-DEMO', 'SITE-PILOT']],
    ['claims@example.com', 'Osei Danquah', 'claims_manager', ['SITE-DEMO', 'SITE-PILOT']],
    ['signer@example.com', 'Hana Ferreira', 'certificate_signer', ['SITE-DEMO', 'SITE-PILOT']],
    ['signer2@example.com', 'Pavel Ostrowski', 'certificate_signer', ['SITE-PILOT']],
    ['auditor@example.com', 'Ruth Lindqvist', 'auditor', ['SITE-DEMO', 'SITE-PILOT']],
  ];
  let pn = 0;
  for (const [email, name, role, sites] of accounts) {
    pn += 1;
    const person_id = `PER-${String(pn).padStart(4, '0')}`;
    await ins('person_directory', { person_id, email, name, retention_months: 120 });
    await ins('access_grant', { reference: `GRT-${String(pn).padStart(4, '0')}`, email, role, sites, granted_on: '2026-01-01', ends_on: '2027-06-30' });
    await act({ act: 'access_grant_created', person: 'quality@example.com', object_kind: 'access_grant', object_ref: `GRT-${String(pn).padStart(4, '0')}`, content: { email, role, sites, ends_on: '2027-06-30' } });
  }

  // Parties, and the names they had at the time.
  for (const [reference, kind, name, effective_from] of [
    ['COL-ALDER', 'collector', 'Alder Reclaim', '2026-01-01'],
    ['COL-BRINE', 'collector', 'Brine Textile Recovery', '2026-01-01'],
    ['COL-BRINE', 'collector', 'Brine Circular Materials', '2026-08-01'],
    ['COL-CINDER', 'collector', 'Cinder Industrial Offcuts', '2026-01-01'],
    ['CUS-HELIOS', 'customer', 'Helios Technical Textiles', '2026-01-01'],
    ['CUS-VANTA', 'customer', 'Vanta Safety Systems', '2026-01-01'],
    ['RAVEL', 'producer', 'Ravel Materials SAS', '2025-01-01'],
  ]) {
    await ins('party_version', { reference, party_kind: kind, name, effective_from });
  }
  await pool.query(
    `update party_version p set superseded_by = n.id from party_version n
     where n.reference = p.reference and n.effective_from > p.effective_from and n.id <> p.id and p.superseded_by is null`,
  );

  for (const c of [
    { reference: 'COL-ALDER', name: 'Alder Reclaim', country: 'PT', registration: 'WCR-PT-4471', registration_expiry: '2027-03-31', collection_site_types: ['municipal_bring_bank', 'retail_take_back'], declared_streams: ['post_consumer_apparel', 'carpet'] },
    { reference: 'COL-BRINE', name: 'Brine Textile Recovery', country: 'NL', registration: 'WCR-NL-2208', registration_expiry: '2027-01-31', collection_site_types: ['sorting_facility'], declared_streams: ['post_consumer_apparel'] },
    { reference: 'COL-CINDER', name: 'Cinder Industrial Offcuts', country: 'FR', registration: 'WCR-FR-6613', registration_expiry: '2026-12-31', collection_site_types: ['converter_floor'], declared_streams: ['pre_consumer_offcuts', 'coated_stream'] },
  ]) {
    await ins('collector', { ...c, scheme_status: 'in_scheme' });
  }
  await ins('approval_period', { reference: 'APR-ALDER-1', collector: 'COL-ALDER', state: 'approved', valid_from: '2026-01-01', valid_to: '2026-12-31', recorded_by: 'quality@example.com' });
  await ins('approval_period', { reference: 'APR-BRINE-1', collector: 'COL-BRINE', state: 'approved', valid_from: '2026-01-01', valid_to: '2026-06-30', recorded_by: 'quality@example.com' });
  await ins('approval_period', { reference: 'APR-CINDER-1', collector: 'COL-CINDER', state: 'conditional', valid_from: '2026-01-01', valid_to: '2026-12-31', condition: 'Sampling plan for coated streams to be agreed', condition_closes_on: '2026-10-31', recorded_by: 'quality@example.com' });
  for (const r of ['APR-ALDER-1', 'APR-BRINE-1', 'APR-CINDER-1']) {
    await act({ act: 'collector_approved', person: 'quality@example.com', object_kind: 'approval_period', object_ref: r, content: { approval: r } });
  }

  await ins('weighing_device', { reference: 'WB-DEMO-01', site: 'SITE-DEMO', calibrated_on: '2026-05-01' });
  await ins('weighing_device', { reference: 'WB-DEMO-02', site: 'SITE-DEMO', calibrated_on: '2025-02-01' });

  // Batches. Every custody chain is complete except BATCH-1005, which omits transport.
  const FULL = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
  const batches = [
    { reference: 'BATCH-1001', collector: 'COL-ALDER', category: 'post_consumer', received_on: '2026-02-10', net_g: 500000, moisture_bp: 1000, device: 'WB-DEMO-01', composition: { polymer: 'PA6', fraction_bp: 9200, basis: 'sampled', measured_fraction_bp: 9200 }, contamination: { non_nylon_bp: 800, elastane_bp: 400, coatings: 'none', colour_load: 'mixed', foreign_matter: 'buttons and zips' } },
    { reference: 'BATCH-1002', collector: 'COL-ALDER', category: 'pre_consumer', received_on: '2026-02-12', net_g: 300000, moisture_bp: 0, device: 'WB-DEMO-01', composition: { polymer: 'PA6', fraction_bp: 9600, basis: 'sampled', measured_fraction_bp: 9600 }, contamination: { non_nylon_bp: 400, elastane_bp: 100, coatings: 'none', colour_load: 'undyed', foreign_matter: 'none' } },
    { reference: 'BATCH-1003', collector: 'COL-BRINE', category: 'post_consumer', received_on: '2026-07-05', net_g: 200000, moisture_bp: 500, device: 'WB-DEMO-01', composition: { polymer: 'PA6', fraction_bp: 8900, basis: 'sampled', measured_fraction_bp: 8900 }, contamination: { non_nylon_bp: 1100, elastane_bp: 600, coatings: 'light', colour_load: 'mixed', foreign_matter: 'labels' } },
    { reference: 'BATCH-1004', collector: 'COL-CINDER', category: 'pre_consumer', received_on: '2026-02-20', net_g: 120000, moisture_bp: 0, device: 'WB-DEMO-02', composition: { polymer: 'PA6', fraction_bp: 9900, basis: 'declared', measured_fraction_bp: 9100 }, contamination: { non_nylon_bp: 900, elastane_bp: 0, coatings: 'coated', colour_load: 'undyed', foreign_matter: 'none' } },
    { reference: 'BATCH-1005', collector: 'COL-ALDER', category: 'post_consumer', received_on: '2026-03-02', net_g: 100000, moisture_bp: 0, device: 'WB-DEMO-01', composition: { polymer: 'PA6', fraction_bp: 9000, basis: 'declared' }, contamination: { non_nylon_bp: 1000, elastane_bp: 300, coatings: 'none', colour_load: 'mixed', foreign_matter: 'none' } },
  ];
  for (const b of batches) {
    const tare_g = 20000;
    await ins('batch', {
      reference: b.reference,
      collector: b.collector,
      collector_name: (await nameOnDate(b.collector, b.received_on)) || 'unknown',
      site: 'SITE-DEMO',
      grade: 'N6',
      category: b.category,
      gross_g: b.net_g + tare_g,
      tare_g,
      net_g: b.net_g,
      moisture_bp: b.moisture_bp,
      moisture_method: 'ISO 15512',
      device: b.device,
      received_on: b.received_on,
      composition: b.composition,
      contamination: b.contamination,
      accepted_g: b.net_g,
      rejected_g: 0,
      accepted: true,
      closed: true,
      event_at: T(b.received_on),
      effective_on: b.received_on,
      recorded_by: 'plant@example.com',
    });
    await ins('weighing', {
      reference: `WGH-${b.reference.slice(6)}`,
      batch: b.reference,
      device: b.device,
      gross_g: b.net_g + tare_g,
      tare_g,
      net_g: b.net_g,
      calibration_state: b.device === 'WB-DEMO-02' ? 'lapsed' : 'in_calibration',
      weighed_at: T(b.received_on),
    });
    const kinds = b.reference === 'BATCH-1005' ? FULL.filter((k) => k !== 'transport') : FULL;
    let ord = 0;
    for (const k of kinds) {
      ord += 1;
      await ins('custody_link', { batch: b.reference, ordinal: ord, kind: k, party: k === 'collector' ? b.collector : k === 'transport' ? 'Haulier Sud' : 'SITE-DEMO', link_date: b.received_on, late: false, document: `DOC-${b.reference}-${k}` });
    }
    await act({ act: 'batch_booked_in', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'batch', object_ref: b.reference, content: { net_g: b.net_g, moisture_bp: b.moisture_bp, category: b.category, dry_mass_g: dryMass(b.net_g, b.moisture_bp) } });
    await act({ act: 'weighing_recorded', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'weighing', object_ref: `WGH-${b.reference.slice(6)}`, content: { device: b.device, calibration_state: b.device === 'WB-DEMO-02' ? 'lapsed' : 'in_calibration' } });
  }

  // BATCH-1004 measured 9100 against a declaration of 9900: a departure of 800
  // basis points, which stands as a finding against the collector.
  await ins('finding', { reference: 'FND-0001', collector: 'COL-CINDER', batch: 'BATCH-1004', kind: 'declaration_departure', detail: 'Measured PA6 fraction 9100 bp against a declared 9900 bp, a departure of 800 basis points beyond the 500 basis point tolerance.', raised_on: '2026-02-21', due_on: '2026-10-31', state: 'open', departure_bp: 800 });
  await act({ act: 'finding_raised', person: 'quality@example.com', object_kind: 'finding', object_ref: 'FND-0001', content: { collector: 'COL-CINDER', departure_bp: 800 } });

  // Recipes
  for (const r of [
    { reference: 'RCP-DISS-2', recipe: 'RCP-DISS', version: 2, run_type: 'dissolution', set_points: { temperature_c: 165, pressure_bar: 3 }, tolerances: { temperature_c: [160, 170], pressure_bar: [2, 4] }, reagents: [{ name: 'benign solvent A', ratio_bp: 4000 }], residence_minutes: 90 },
    { reference: 'RCP-DEPO-4', recipe: 'RCP-DEPO', version: 4, run_type: 'depolymerisation', set_points: { temperature_c: 210, pressure_bar: 5 }, tolerances: { temperature_c: [200, 220], pressure_bar: [4, 6] }, reagents: [{ name: 'catalyst B', ratio_bp: 200 }], residence_minutes: 180 },
    { reference: 'RCP-PURI-1', recipe: 'RCP-PURI', version: 1, run_type: 'purification', set_points: { temperature_c: 120, pressure_bar: 1 }, tolerances: { temperature_c: [110, 130], pressure_bar: [1, 2] }, reagents: [], residence_minutes: 240 },
    { reference: 'RCP-REPO-3', recipe: 'RCP-REPO', version: 3, run_type: 'repolymerisation', set_points: { temperature_c: 250, pressure_bar: 8 }, tolerances: { temperature_c: [240, 260], pressure_bar: [7, 9] }, reagents: [{ name: 'chain regulator', ratio_bp: 50 }], residence_minutes: 300 },
  ]) {
    await ins('recipe_version', { ...r, released_by: 'quality@example.com', released_on: '2026-01-05' });
  }

  const runs = [
    { reference: 'RUN-D-0001', run_type: 'dissolution', recipe_version: 'RCP-DISS-2', started: '2026-03-04', actual: { temperature_c: 165, pressure_bar: 3 }, within: true },
    { reference: 'RUN-D-0002', run_type: 'dissolution', recipe_version: 'RCP-DISS-2', started: '2026-03-05', actual: { temperature_c: 172, pressure_bar: 3 }, within: false },
    { reference: 'RUN-D-0003', run_type: 'dissolution', recipe_version: 'RCP-DISS-2', started: '2026-03-06', actual: { temperature_c: 164, pressure_bar: 3 }, within: true },
    { reference: 'RUN-Y-0001', run_type: 'depolymerisation', recipe_version: 'RCP-DEPO-4', started: '2026-03-09', actual: { temperature_c: 210, pressure_bar: 5 }, within: true },
    { reference: 'RUN-U-0001', run_type: 'purification', recipe_version: 'RCP-PURI-1', started: '2026-03-12', actual: { temperature_c: 120, pressure_bar: 1 }, within: true },
    { reference: 'RUN-R-0001', run_type: 'repolymerisation', recipe_version: 'RCP-REPO-3', started: '2026-03-16', actual: { temperature_c: 250, pressure_bar: 8 }, within: true },
  ];
  const consumptions = {
    'RUN-D-0001': [['batch', 'BATCH-1001', 300000], ['batch', 'BATCH-1002', 300000]],
    'RUN-D-0002': [['batch', 'BATCH-1003', 190000], ['batch', 'BATCH-1004', 120000]],
    'RUN-D-0003': [['batch', 'BATCH-1001', 150000]],
    'RUN-Y-0001': [['output', 'OUT-D-0001', 480000], ['output', 'OUT-D-0002', 250000], ['output', 'OUT-D-0003', 120000]],
    'RUN-U-0001': [['output', 'OUT-Y-0001', 800000]],
    'RUN-R-0001': [['output', 'OUT-U-0001', 720000]],
  };
  const outputs = {
    'RUN-D-0001': [['OUT-D-0001', 'intermediate', 480000, null]],
    'RUN-D-0002': [['OUT-D-0002', 'intermediate', 250000, null]],
    'RUN-D-0003': [['OUT-D-0003', 'intermediate', 120000, null]],
    'RUN-Y-0001': [['OUT-Y-0001', 'intermediate', 800000, null]],
    'RUN-U-0001': [['OUT-U-0001', 'intermediate', 720000, null], ['OUT-U-0002', 'byproduct', 40000, 'sold']],
    'RUN-R-0001': [['LOT-N6-0001', 'lot', 400000, null], ['LOT-N6-0002', 'lot', 300000, null]],
  };
  let cSeq = 0;
  for (const r of runs) {
    await ins('run', {
      reference: r.reference,
      run_type: r.run_type,
      site: 'SITE-DEMO',
      equipment: `EQ-${r.run_type.slice(0, 4).toUpperCase()}-1`,
      recipe_version: r.recipe_version,
      operator: 'plant@example.com',
      started_at: `${r.started}T06:00:00Z`,
      closed_at: `${r.started}T18:00:00Z`,
      state: 'closed',
      actual_set_points: r.actual,
      within_tolerance: r.within,
      losses_g: null,
      event_at: `${r.started}T06:00:00Z`,
      effective_on: r.started,
      recorded_by: 'plant@example.com',
    });
    await act({ act: 'run_started', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'run', object_ref: r.reference, content: { run_type: r.run_type, recipe_version: r.recipe_version } });
    let inMass = 0;
    for (const [kind, ref, mass] of consumptions[r.reference]) {
      cSeq += 1;
      const cref = `CNS-${String(cSeq).padStart(4, '0')}`;
      await ins('consumption', { reference: cref, run: r.reference, input_kind: kind, input_ref: ref, mass_g: mass, event_at: `${r.started}T07:00:00Z`, effective_on: r.started, recorded_by: 'plant@example.com' });
      inMass += mass;
      await act({ act: 'consumption_recorded', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'consumption', object_ref: cref, content: { run: r.reference, input: ref, mass_g: mass } });
    }
    let outMass = 0;
    for (const [ref, kind, mass, disp] of outputs[r.reference]) {
      await ins('output', { reference: ref, run: r.reference, kind, mass_g: mass, disposition: disp, event_at: `${r.started}T17:00:00Z`, effective_on: r.started, recorded_by: 'plant@example.com' });
      outMass += mass;
      await act({ act: 'output_recorded', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'output', object_ref: ref, content: { run: r.reference, kind, mass_g: mass } });
    }
    await pool.query('update run set losses_g = $1 where reference = $2', [inMass - outMass, r.reference]);
    await act({ act: 'run_closed', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'run', object_ref: r.reference, content: { losses_g: inMass - outMass, mass_in_g: inMass, mass_out_g: outMass, note: 'Losses reduce the claim.' } });
  }

  await ins('lot', { reference: 'LOT-N6-0001', grade: 'N6', site: 'SITE-DEMO', mass_g: 400000, output_ref: 'LOT-N6-0001', disposition: 'released', disposition_by: 'quality@example.com', disposition_at: '2026-03-18T10:00:00Z', claim_type: 'mass_balance', specification_version: 3, produced_on: '2026-03-16', recorded_by: 'plant@example.com' });
  await ins('lot', { reference: 'LOT-N6-0002', grade: 'N6', site: 'SITE-DEMO', mass_g: 300000, output_ref: 'LOT-N6-0002', disposition: 'quarantined', disposition_by: 'quality@example.com', disposition_at: '2026-03-18T10:05:00Z', claim_type: 'mass_balance', specification_version: 3, produced_on: '2026-03-16', recorded_by: 'plant@example.com' });
  await ins('lot', { reference: 'LOT-N6-0003', grade: 'N6', site: 'SITE-PILOT', mass_g: 200000, output_ref: null, disposition: 'released', disposition_by: 'quality@example.com', disposition_at: '2026-02-25T10:00:00Z', claim_type: 'mass_balance', specification_version: 3, produced_on: '2026-02-20', recorded_by: 'plant@example.com' });
  for (const [l, d] of [['LOT-N6-0001', 'released'], ['LOT-N6-0002', 'quarantined'], ['LOT-N6-0003', 'released']]) {
    await act({ act: 'lot_disposition_set', person: 'quality@example.com', object_kind: 'lot', object_ref: l, content: { disposition: d } });
  }

  await ins('deviation', { reference: 'DEV-0001', state: 'open', runs: ['RUN-U-0001'], lots: ['LOT-N6-0002'], detail: 'Purification residence time ran long and the lot is held until the cause is established.', raised_by: 'quality@example.com', raised_at: '2026-03-14T09:00:00Z', effective_on: '2026-03-14' });
  await ins('deviation', { reference: 'DEV-0002', state: 'closed', runs: ['RUN-D-0002'], lots: [], detail: 'Dissolution temperature reached 172 C against a tolerance of 160 to 170 C.', outcome: 'cause_not_established', raised_by: 'quality@example.com', raised_at: '2026-03-05T20:00:00Z', closed_by: 'quality@example.com', closed_at: '2026-03-20T09:00:00Z', effective_on: '2026-03-05' });
  await act({ act: 'deviation_raised', person: 'quality@example.com', object_kind: 'deviation', object_ref: 'DEV-0001', content: { runs: ['RUN-U-0001'], lots: ['LOT-N6-0002'] } });
  await act({ act: 'deviation_raised', person: 'quality@example.com', object_kind: 'deviation', object_ref: 'DEV-0002', content: { runs: ['RUN-D-0002'] } });
  await act({ act: 'deviation_closed', person: 'quality@example.com', object_kind: 'deviation', object_ref: 'DEV-0002', content: { outcome: 'cause_not_established' } });

  await ins('override_record', {
    reference: 'OVR-0001',
    separation: 'analyst_not_dispositioner',
    reason: 'Night shift analyst dispositioned the lot because no second qualified person was on site',
    lot: 'LOT-N6-0001',
    authorised_by: 'quality@example.com',
    recorded_by: 'quality@example.com',
    reviewed: false,
    event_at: '2026-03-18T02:00:00Z',
    effective_on: '2026-03-18',
  });
  await act({ act: 'override_recorded', person: 'quality@example.com', object_kind: 'override', object_ref: 'OVR-0001', content: { separation: 'analyst_not_dispositioner', lot: 'LOT-N6-0001', authorised_by: 'quality@example.com' } });

  await ins('test_result', { reference: 'TST-0001', subject_kind: 'lot', subject_ref: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ISO 307', instrument: 'VIS-01', analyst: 'analyst@example.com', value: '2.44', unit: 'ratio', uncertainty_bp: 200, entered_by: 'analyst@example.com', event_at: '2026-03-17T09:00:00Z', effective_on: '2026-03-17' });
  await ins('test_result', { reference: 'TST-0002', subject_kind: 'lot', subject_ref: 'LOT-N6-0001', property: 'moisture', method: 'ISO 15512', instrument: 'KF-02', analyst: 'analyst@example.com', value: '0.06', unit: 'percent', uncertainty_bp: 300, entered_by: 'analyst@example.com', event_at: '2026-03-17T09:30:00Z', effective_on: '2026-03-17' });
  await ins('test_result', { reference: 'TST-0003', subject_kind: 'lot', subject_ref: 'LOT-N6-0003', property: 'relative_viscosity', method: 'ISO 307', instrument: 'VIS-01', analyst: 'analyst@example.com', value: '2.43', unit: 'ratio', uncertainty_bp: 200, entered_by: 'analyst@example.com', event_at: '2026-02-22T09:00:00Z', effective_on: '2026-02-22' });
  await ins('test_result', { reference: 'TST-0004', subject_kind: 'lot', subject_ref: 'LOT-N6-0003', property: 'moisture', method: 'ISO 15512', instrument: 'KF-02', analyst: 'analyst@example.com', value: '0.07', unit: 'percent', uncertainty_bp: 300, entered_by: 'analyst@example.com', event_at: '2026-02-22T09:20:00Z', effective_on: '2026-02-22' });
  for (const t of ['TST-0001', 'TST-0002', 'TST-0003', 'TST-0004']) {
    await act({ act: 'test_result_entered', person: 'analyst@example.com', object_kind: 'test_result', object_ref: t, content: { entered_by: 'analyst@example.com' } });
  }

  await ins('conversion_factor', { reference: 'CF-DEMO-1', site: 'SITE-DEMO', version: 1, factor_bp: 8000, derived_from: '2026-01-01', derived_to: '2026-03-31', derived_in_g: 1000000, derived_out_g: 800000, provisional: false, published_by: 'claims@example.com', published_on: '2026-01-02' });
  await ins('conversion_factor', { reference: 'CF-PILOT-1', site: 'SITE-PILOT', version: 1, factor_bp: 7500, derived_from: null, derived_to: null, derived_in_g: 0, derived_out_g: 0, provisional: true, published_by: 'claims@example.com', published_on: '2026-01-02' });
  await act({ act: 'conversion_factor_published', person: 'claims@example.com', site: 'SITE-DEMO', object_kind: 'conversion_factor', object_ref: 'CF-DEMO-1', content: { factor_bp: 8000, derived_in_g: 1000000, derived_out_g: 800000 } });
  await act({ act: 'conversion_factor_published', person: 'claims@example.com', site: 'SITE-PILOT', object_kind: 'conversion_factor', object_ref: 'CF-PILOT-1', content: { factor_bp: 7500, provisional: true } });

  await ins('balance_period', { id: 'BP-DEMO-N6-2025H2', site: 'SITE-DEMO', grade: 'N6', period_from: '2025-07-01', period_to: '2025-12-31', state: 'closed', carry_over_limit_bp: 2000, allocation_basis: 'mass', closed_on: '2026-01-15', closed_by: 'claims@example.com', cut_off: '2026-01-10', metered_kwh: 0, carried_forward: { post_consumer: 0, pre_consumer: 0 }, expired: { post_consumer: 0, pre_consumer: 0 } });
  await ins('balance_period', { id: 'BP-DEMO-N6-2026H1', site: 'SITE-DEMO', grade: 'N6', period_from: '2026-01-01', period_to: '2026-06-30', state: 'open', carry_over_limit_bp: 2000, allocation_basis: 'mass', metered_kwh: 300000 });
  await ins('balance_period', { id: 'BP-PILOT-N6-2026H1', site: 'SITE-PILOT', grade: 'N6', period_from: '2026-01-01', period_to: '2026-06-30', state: 'open', carry_over_limit_bp: 2000, allocation_basis: 'mass', metered_kwh: 0 });
  await act({ act: 'balance_period_closed', person: 'claims@example.com', site: 'SITE-DEMO', object_kind: 'balance_period', object_ref: 'BP-DEMO-N6-2025H2', content: { closed_on: '2026-01-15', cut_off: '2026-01-10' } });

  // Credits enter when a claimable batch is consumed: dry mass times the site's
  // factor. Non-claimable input grants nothing.
  const creditRows = [
    ['CRM-0001', 'BATCH-1001', 'post_consumer', 450000, 'CNS-0001', '2026-03-04'],
    ['CRM-0002', 'BATCH-1002', 'pre_consumer', 300000, 'CNS-0002', '2026-03-04'],
    ['CRM-0003', 'BATCH-1004', 'pre_consumer', 120000, 'CNS-0004', '2026-03-05'],
  ];
  for (const [ref, batch, cat, dry, cns, on] of creditRows) {
    await ins('credit_movement', {
      reference: ref,
      period: 'BP-DEMO-N6-2026H1',
      category: cat,
      direction: 'in',
      mass_g: creditFor(dry, 8000),
      source_kind: 'consumption',
      source_ref: cns,
      lot: null,
      origin_site: 'SITE-DEMO',
      fresh_credit: true,
      derivation: { rule: 'dry_mass_consumed_g * factor_bp / 10000, floored', dry_mass_consumed_g: dry, factor_bp: 8000, factor: 'CF-DEMO-1', batch, consumption: cns },
      event_at: T(on),
      effective_on: on,
      recorded_by: 'plant@example.com',
    });
  }
  // BATCH-1001 also reached RUN-D-0003; its dry mass credit is granted once
  // across the batch's total consumed dry mass. 450000 dry = 300000 + 150000.
  // CRM-0001 above already carries the full 450000 * 8000 / 10000 = 360000.

  // The transfer. TRF-0001 moves 50000 g from PILOT to DEMO. It is never a fresh credit.
  await ins('credit_movement', { reference: 'CRM-PILOT-IN-1', period: 'BP-PILOT-N6-2026H1', category: 'post_consumer', direction: 'in', mass_g: 210000, source_kind: 'consumption', source_ref: 'PILOT-SEED', origin_site: 'SITE-PILOT', fresh_credit: true, derivation: { rule: 'dry_mass_consumed_g * factor_bp / 10000, floored', dry_mass_consumed_g: 280000, factor_bp: 7500, factor: 'CF-PILOT-1' }, event_at: T('2026-02-20'), effective_on: '2026-02-20', recorded_by: 'plant@example.com' });
  await ins('transfer', { reference: 'TRF-0001', from_period: 'BP-PILOT-N6-2026H1', to_period: 'BP-DEMO-N6-2026H1', category: 'post_consumer', mass_g: 50000, moved_on: '2026-05-12', recorded_by: 'claims@example.com' });
  await ins('credit_movement', { reference: 'CRM-TRF-0001-OUT', period: 'BP-PILOT-N6-2026H1', category: 'post_consumer', direction: 'transfer_out', mass_g: 50000, source_kind: 'transfer', source_ref: 'TRF-0001', origin_site: 'SITE-PILOT', fresh_credit: false, movement: 'TRF-0001', derivation: { rule: 'a transfer moves credit between periods and creates none' }, event_at: T('2026-05-12'), effective_on: '2026-05-12', recorded_by: 'claims@example.com' });
  await ins('credit_movement', { reference: 'CRM-TRF-0001-IN', period: 'BP-DEMO-N6-2026H1', category: 'post_consumer', direction: 'transfer_in', mass_g: 50000, source_kind: 'transfer', source_ref: 'TRF-0001', origin_site: 'SITE-PILOT', fresh_credit: false, movement: 'TRF-0001', derivation: { rule: 'inbound credit from SITE-PILOT; it is never a fresh credit' }, event_at: T('2026-05-12'), effective_on: '2026-05-12', recorded_by: 'claims@example.com' });
  await act({ act: 'transfer_recorded', person: 'claims@example.com', object_kind: 'transfer', object_ref: 'TRF-0001', content: { from: 'BP-PILOT-N6-2026H1', to: 'BP-DEMO-N6-2026H1', mass_g: 50000 } });

  // LOT-N6-0003 carries an allocation so its certificates have a claim.
  await ins('credit_movement', { reference: 'CRM-PILOT-OUT-1', period: 'BP-PILOT-N6-2026H1', category: 'post_consumer', direction: 'out', mass_g: 150000, source_kind: 'allocation', source_ref: 'ALO-PILOT-1', lot: 'LOT-N6-0003', origin_site: 'SITE-PILOT', fresh_credit: false, derivation: { rule: 'claim attached to a lot leaves the ledger' }, event_at: T('2026-02-25'), effective_on: '2026-02-25', recorded_by: 'claims@example.com' });
  await act({ act: 'allocation_made', person: 'claims@example.com', site: 'SITE-PILOT', object_kind: 'allocation', object_ref: 'ALO-PILOT-1', content: { lot: 'LOT-N6-0003', category: 'post_consumer', mass_g: 150000 } });

  // Carbon
  await ins('carbon_method', { id: 'CM-PA6', standard: 'ISO 14067', functional_unit: '1 kg of pellet', name: 'PA6 cradle-to-gate carbon method' });
  const factorsV1 = [
    { name: 'grid electricity', source: 'EcoBase 2024', year: 2024, value_mg_per_kg: 1900000 },
    { name: 'process reagents', source: 'Supplier declarations 2024', year: 2024, value_mg_per_kg: 1250000 },
  ];
  const factorsV2 = [
    { name: 'grid electricity', source: 'EcoBase 2025', year: 2025, value_mg_per_kg: 1850000 },
    { name: 'process reagents', source: 'Supplier declarations 2025', year: 2025, value_mg_per_kg: 1180000 },
    { name: 'road freight', source: 'EcoBase 2025', year: 2025, value_mg_per_kg: 410000 },
    { name: 'water and effluent', source: 'EcoBase 2025', year: 2025, value_mg_per_kg: 240000 },
  ];
  await ins('carbon_method_version', { id: 'CM-PA6', version: 1, boundary: 'cradle-to-gate', allocation_basis: 'mass', reviewer: 'Ilse Grootveld', published_on: '2025-06-10', published_by: 'quality@example.com', data_quality_rules: { primary_threshold_bp: 5000, temporal_years: 3, geographic: 'EU-27', technological: 'same process family' }, emission_factors: factorsV1, primary_threshold_bp: 5000, superseded: true });
  await ins('carbon_method_version', { id: 'CM-PA6', version: 2, boundary: 'cradle-to-gate', allocation_basis: 'mass', reviewer: 'Ilse Grootveld', published_on: '2026-01-20', published_by: 'quality@example.com', data_quality_rules: { primary_threshold_bp: 5000, temporal_years: 3, geographic: 'EU-27', technological: 'same process family' }, emission_factors: factorsV2, primary_threshold_bp: 5000, superseded: false });
  await act({ act: 'carbon_method_version_published', person: 'quality@example.com', object_kind: 'carbon_method_version', object_ref: 'CM-PA6 v2', content: { published_on: '2026-01-20', reviewer: 'Ilse Grootveld' } });

  const breakdown = [
    { line: 'collection_and_transport', mg_per_kg: 310000, tag: 'primary' },
    { line: 'process_energy', mg_per_kg: 1850000, tag: 'primary' },
    { line: 'reagents', mg_per_kg: 1180000, tag: 'supplier_specific' },
    { line: 'water_and_effluent', mg_per_kg: 240000, tag: 'primary' },
    { line: 'waste_and_residues', mg_per_kg: 330000, tag: 'secondary' },
    { line: 'outbound_transport', mg_per_kg: 410000, tag: 'secondary' },
    { line: 'byproduct_credit', mg_per_kg: -60000, tag: 'primary' },
  ];
  const comparator = { material: 'virgin PA6', dataset: 'EcoBase 2025', dataset_year: 2025, region: 'EU-27', value_mg_per_kg: 6800000 };
  await ins('carbon_figure', {
    id: 'CFG-0001', lot: 'LOT-N6-0001', version: 1, method_id: 'CM-PA6', method_version: 2, boundary: 'cradle-to-gate',
    value_mg_per_kg: 4260000, uncertainty_bp: 1200, primary_share_bp: 6500, comparator, breakdown,
    energy_location_mg_per_kg: 1850000, energy_market_mg_per_kg: 620000, metered_kwh: 300000,
    input_versions: { carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1', recipe_versions: ['RCP-DISS-2', 'RCP-DEPO-4', 'RCP-PURI-1', 'RCP-REPO-3'], specification: 'SPEC-N6 v3', emission_factor_set: 'EcoBase 2025' },
    computed_by: 'claims@example.com', reason: 'Initial computation for the lot.',
  });
  const bd3 = [
    { line: 'collection_and_transport', mg_per_kg: 330000, tag: 'primary' },
    { line: 'process_energy', mg_per_kg: 1980000, tag: 'primary' },
    { line: 'reagents', mg_per_kg: 1210000, tag: 'supplier_specific' },
    { line: 'water_and_effluent', mg_per_kg: 250000, tag: 'primary' },
    { line: 'waste_and_residues', mg_per_kg: 340000, tag: 'secondary' },
    { line: 'outbound_transport', mg_per_kg: 420000, tag: 'secondary' },
    { line: 'byproduct_credit', mg_per_kg: -40000, tag: 'primary' },
  ];
  await ins('carbon_figure', {
    id: 'CFG-0003', lot: 'LOT-N6-0003', version: 1, method_id: 'CM-PA6', method_version: 2, boundary: 'cradle-to-gate',
    value_mg_per_kg: bd3.reduce((s, l) => s + l.mg_per_kg, 0), uncertainty_bp: 1500, primary_share_bp: 5400, comparator, breakdown: bd3,
    energy_location_mg_per_kg: 1980000, energy_market_mg_per_kg: 710000, metered_kwh: 0,
    input_versions: { carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-PILOT-1', specification: 'SPEC-N6 v3', emission_factor_set: 'EcoBase 2025' },
    computed_by: 'claims@example.com', reason: 'Initial computation for the lot.',
  });
  await act({ act: 'carbon_figure_computed', person: 'claims@example.com', object_kind: 'carbon_figure', object_ref: 'CFG-0001', content: { lot: 'LOT-N6-0001', value_mg_per_kg: 4260000, method_version: 'CM-PA6 v2' } });

  await ins('energy_instrument', { reference: 'EAC-2026-0007', quantity_kwh: 250000, vintage: 2026, region: 'EU-27', state: 'retired', applied_to: 'BP-DEMO-N6-2026H1', applied_at: '2026-06-01T09:00:00Z' });
  await ins('energy_instrument', { reference: 'EAC-2025-0031', quantity_kwh: 100000, vintage: 2025, region: 'EU-27', state: 'held', applied_to: null });

  // Specifications
  const specRows3 = [
    { property: 'relative_viscosity', method: 'ISO 307', limit: '2.40', unit: 'ratio', basis: 'guaranteed' },
    { property: 'moisture', method: 'ISO 15512', limit: '0.10', unit: 'percent', basis: 'guaranteed' },
    { property: 'yellowness_index', method: 'ASTM E313', limit: '8.0', unit: 'index', basis: 'typical' },
    { property: 'ash_content', method: 'ISO 3451-1', limit: '0.30', unit: 'percent', basis: 'informational' },
  ];
  const virgin = { reference: 'virgin PA6 at relative viscosity 2.42', source: 'EcoBase 2025', dated: '2025-11-30' };
  await ins('specification', { grade: 'SPEC-N6', version: 2, issued_on: '2025-09-01', rows_json: specRows3.map((r) => (r.property === 'relative_viscosity' ? { ...r, limit: '2.38' } : r)), virgin_reference: virgin, superseded: true });
  await ins('specification', { grade: 'SPEC-N6', version: 3, issued_on: '2026-02-01', rows_json: specRows3, virgin_reference: virgin, superseded: false });
  await ins('specification_issue', { reference: 'SPI-0001', grade: 'SPEC-N6', version: 3, customer: 'CUS-HELIOS', issued_on: '2026-02-02', recorded_by: 'quality@example.com' });
  await ins('specification_issue', { reference: 'SPI-0002', grade: 'SPEC-N6', version: 2, customer: 'CUS-VANTA', issued_on: '2025-09-05', recorded_by: 'quality@example.com' });
  await act({ act: 'specification_issued', person: 'quality@example.com', object_kind: 'specification_issue', object_ref: 'SPI-0001', content: { customer: 'CUS-HELIOS', version: 3 } });

  await ins('customer', { reference: 'CUS-HELIOS', name: 'Helios Technical Textiles', contact: 'helios@example.com', language: 'en', holds_specification: 'SPEC-N6', holds_specification_version: 3, application: 'technical apparel yarn', industry: 'textiles' });
  await ins('customer', { reference: 'CUS-VANTA', name: 'Vanta Safety Systems', contact: 'vanta@example.com', language: 'fr', holds_specification: 'SPEC-N6', holds_specification_version: 2, application: 'airbag fabric', industry: 'automotive' });
  await ins('conformance', { reference: 'CNF-0001', customer: 'CUS-HELIOS', application: 'technical apparel yarn', spec_grade: 'SPEC-N6', spec_version: 3, trials: [{ trial: 'spinning trial 1', dated: '2026-02-20', outcome: 'passed' }, { trial: 'dye uptake', dated: '2026-03-01', outcome: 'passed' }], outcome: 'qualified', dated: '2026-03-01' });
  await ins('conformance', { reference: 'CNF-0002', customer: 'CUS-VANTA', application: 'airbag fabric', spec_grade: 'SPEC-N6', spec_version: 2, trials: [{ trial: 'weave trial', dated: '2025-10-10', outcome: 'passed' }, { trial: 'ageing 1000 h', dated: '2025-12-02', outcome: 'in_progress' }], outcome: 'qualification_in_progress', dated: '2025-12-02' });

  await ins('contract', { id: 'CON-HELIOS-1', recipient: 'CUS-HELIOS', site: 'SITE-DEMO', period: '2026-H1', committed_kg: 200, floor_bp: 5000, delivered_kg: 0, shortfall_consequence: 'a price adjustment in the following invoice' });
  await ins('contract', { id: 'CON-VANTA-1', recipient: 'CUS-VANTA', site: 'SITE-COMM', period: '2029-H1', committed_kg: 1000, floor_bp: 3000, delivered_kg: 0, shortfall_consequence: 'a make-good volume in the following period' });

  // Certificates on LOT-N6-0003, signed by signer2 who is scoped to SITE-PILOT.
  await ins('cert_sequence', { site: 'SITE-PILOT', last_n: 0 });
  await ins('cert_sequence', { site: 'SITE-DEMO', last_n: 0 });
  await ins('cert_sequence', { site: 'SITE-COMM', last_n: 0 });

  const c3 = await one('select * from carbon_figure where lot = $1', ['LOT-N6-0003']);
  const carbonPayload = {
    value_mg_per_kg: Number(c3.value_mg_per_kg),
    boundary: c3.boundary,
    method_version: 'CM-PA6 v2',
    uncertainty_bp: c3.uncertainty_bp,
    comparator: { ...comparator, relation: 'lower than virgin PA6 from EcoBase 2025' },
    breakdown: c3.breakdown,
    energy_location_mg_per_kg: Number(c3.energy_location_mg_per_kg),
    energy_market_mg_per_kg: Number(c3.energy_market_mg_per_kg),
    metered_kwh: 0,
    retired_kwh: 0,
    unmatched_kwh: 0,
  };
  const content_bp = Math.floor((150000 * 10000) / 200000); // 7500
  const conditionsSnapshot = [
    { condition: 'lot_released', satisfied: true, blocking_reference: null },
    { condition: 'no_open_deviation', satisfied: true, blocking_reference: null },
    { condition: 'no_unreviewed_override', satisfied: true, blocking_reference: null },
    { condition: 'period_closed', satisfied: true, blocking_reference: 'BP-PILOT-N6-2026H1' },
    { condition: 'balance_invariant_holds', satisfied: true, blocking_reference: null },
    { condition: 'carbon_figure_complete', satisfied: true, blocking_reference: 'CFG-0003' },
    { condition: 'signer_holds_scope', satisfied: true, blocking_reference: 'GRT-0006' },
    { condition: 'signer_did_not_enter_data', satisfied: true, blocking_reference: null },
  ];
  for (const spec of [
    { number: 'CERT-PILOT-000001', recipient: 'CUS-HELIOS', recipient_name: 'Helios Technical Textiles', language: 'en', signed_on: '2026-03-02', state: 'withdrawn', withdrawn_on: '2026-04-18', reason: 'A collector category was corrected after acceptance' },
    { number: 'CERT-PILOT-000002', recipient: 'CUS-VANTA', recipient_name: 'Vanta Safety Systems', language: 'fr', signed_on: '2026-03-05', state: 'issued' },
  ]) {
    const st = statementsFor({ claim_type: 'mass_balance', content_bp, category_split: { post_consumer: 150000, pre_consumer: 0 }, language: spec.language });
    const cert = {
      number: spec.number,
      version: 1,
      site: 'SITE-PILOT',
      lots: [{ lot: 'LOT-N6-0003', mass_g: 200000 }],
      grade: 'N6',
      specification: 'SPEC-N6',
      specification_version: 3,
      claim_type: 'mass_balance',
      content_bp,
      category_split: { post_consumer: 150000, pre_consumer: 0 },
      period: 'BP-PILOT-N6-2026H1',
      carbon: carbonPayload,
      primary_share_bp: c3.primary_share_bp,
      scheme: 'RCS-2026',
      registration: 'REG-RAVEL-0042',
      test_results: [
        { property: 'relative_viscosity', method: 'ISO 307', value: '2.43', unit: 'ratio' },
        { property: 'moisture', method: 'ISO 15512', value: '0.07', unit: 'percent' },
      ],
      permitted_statement: st.permitted_statement,
      prohibited_statement: st.prohibited_statement,
      signer: 'signer2@example.com',
      signer_name: 'Pavel Ostrowski',
      signed_at: `${spec.signed_on}T11:00:00Z`,
      signed_on: spec.signed_on,
      verification_url: `https://ravel.example.com/verify/${spec.number}`,
      state: spec.state,
      provisional_factor: true,
      recipient: spec.recipient,
      recipient_name: spec.recipient_name,
      recipient_language: spec.language,
      conditions_at_signing: conditionsSnapshot,
      input_versions: { carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-PILOT-1', specification: 'SPEC-N6 v3', carbon_figure: 'CFG-0003', emission_factor_set: 'EcoBase 2025' },
      withdrawal_reason: spec.reason || null,
      withdrawn_by: spec.state === 'withdrawn' ? 'signer2@example.com' : null,
      withdrawn_on: spec.withdrawn_on || null,
    };
    cert.document = renderDocument(cert);
    await ins('certificate', cert);
    const e = await act({ act: 'certificate_signed', person: 'signer2@example.com', site: 'SITE-PILOT', object_kind: 'certificate', object_ref: spec.number, content: { number: spec.number, lot: 'LOT-N6-0003', content_bp, claim_type: 'mass_balance', conditions: conditionsSnapshot } });
    if (spec.number === 'CERT-PILOT-000001') {
      await ins('legal_hold', { reference: 'HLD-0001', seq: Number(e.seq), placed_by: 'quality@example.com', active: true });
      await act({ act: 'legal_hold_placed', person: 'quality@example.com', object_kind: 'record_entry', object_ref: String(e.seq), content: { hold: 'HLD-0001' } });
      await act({ act: 'certificate_withdrawn', person: 'signer2@example.com', site: 'SITE-PILOT', object_kind: 'certificate', object_ref: spec.number, content: { reason: spec.reason, withdrawn_on: spec.withdrawn_on } });
    }
  }
  await pool.query("update cert_sequence set last_n = 2 where site = 'SITE-PILOT'");

  // Inbound records, payloads kept verbatim.
  const inbound = [
    { reference: 'INB-0001', source: 'weighbridge', received_at: '2026-02-20T06:14:00Z', verbatim: '{"ticket":"WB-DEMO-02/00114","batch":"BATCH-1004","gross_g":140000,"tare_g":20000,"net_g":120000,"calibration":"lapsed","calibrated_on":"2025-02-01","device":"WB-DEMO-02"}' },
    { reference: 'INB-0002', source: 'control_system', received_at: '2026-03-04T22:41:00Z', verbatim: '{"run":"RUN-D-0001","temperature_c":165,"pressure_bar":3,"residence_minutes":92,"recipe":"RCP-DISS-2"}' },
    { reference: 'INB-0003', source: 'laboratory', received_at: '2026-03-06T09:02:00Z', verbatim: '{"lot":"LOT-N6-0001","property":"relative_viscosity","value":"2.44","method":"ISO 307","instrument":"VIS-01","analyst":"analyst@example.com"}' },
  ];
  for (const r of inbound) {
    await ins('inbound_record', { reference: r.reference, source: r.source, received_at: r.received_at, payload: JSON.parse(r.verbatim), payload_verbatim: r.verbatim });
    await act({ act: 'inbound_record_received', object_kind: 'inbound_record', object_ref: r.reference, content: { source: r.source, payload_verbatim: r.verbatim } });
  }

  await ins('position_row', { reference: 'POS-0001', title: 'Process Engineer', location: 'Lyon, France', department: 'Operations', contract_type: 'Permanent', closes_on: '2026-11-30' });
  for (const n of [
    { reference: 'NWS-0001', title: 'Series A closes at 40 million euros', tag: 'funding', outlet: 'Materials Weekly', dated: '2026-01-22', link: 'https://materialsweekly.example.com/ravel-series-a', language: 'en', coverage: [{ outlet: 'Materials Weekly', link: 'https://materialsweekly.example.com/ravel-series-a', language: 'en' }] },
    { reference: 'NWS-0002', title: 'Offtake agreement signed for demonstration output', tag: 'partnership', outlet: 'Fibre Report', dated: '2026-03-11', link: 'https://fibrereport.example.com/ravel-offtake', language: 'en', coverage: [{ outlet: 'Fibre Report', link: 'https://fibrereport.example.com/ravel-offtake', language: 'en' }] },
    { reference: 'NWS-0003', title: 'Depolymerisation yield published', tag: 'technical', outlet: 'Chimie Circulaire', dated: '2026-05-06', link: 'https://chimiecirculaire.example.com/rendement-ravel', language: 'fr', coverage: [{ outlet: 'Chimie Circulaire', link: 'https://chimiecirculaire.example.com/rendement-ravel', language: 'fr' }] },
  ]) {
    await ins('news_item', n);
  }
  for (const s of [
    { key: 'textiles_recycled', value: 'Less than 1 per cent of textiles are recycled into new materials', source: 'Textile Flow Monitor', year: 2024, geography: 'Global' },
    { key: 'plastics_emissions', value: '1.8 gigatonnes of carbon dioxide equivalent a year from plastics production', source: 'Global Materials Emissions Panel', year: 2023, geography: 'Global' },
    { key: 'textile_incineration', value: 'More than 8 per cent of textile waste is incinerated each year', source: 'Textile Flow Monitor', year: 2024, geography: 'EU-27' },
  ]) {
    await ins('statistic', s);
  }
  for (const c of [
    { reference: 'CLS-0001', claim: 'Low-carbon, virgin-quality recycled polymers', route: '/', first_published: '2026-01-10', evidence: 'CM-PA6 v2 figure for LOT-N6-0001 at 4260000 mg CO2e per kg against a virgin PA6 comparator of 6800000 mg CO2e per kg from EcoBase 2025', evidence_expires: '2027-01-20', method_version: 'CM-PA6 v2', approver: 'quality@example.com', review_date: '2026-12-31', state: 'published' },
    { reference: 'CLS-0002', claim: 'Low carbon impact', route: '/technology', first_published: '2026-01-10', evidence: 'CM-PA6 v2 cradle-to-gate figure with a primary data share of 6500 basis points', evidence_expires: '2026-09-30', method_version: 'CM-PA6 v2', approver: 'quality@example.com', review_date: '2026-12-31', state: 'published' },
    { reference: 'CLS-0003', claim: 'Green chemicals and reagents', route: '/technology', first_published: '2026-01-10', evidence: 'RCP-DISS-2 and RCP-DEPO-4 reagent lists, each reagent named with its ratio', evidence_expires: '2027-06-30', method_version: 'CM-PA6 v2', approver: 'quality@example.com', review_date: '2027-01-31', state: 'published' },
    { reference: 'CLS-0004', claim: 'Low temperature and pressure', route: '/technology', first_published: '2026-01-10', evidence: 'Published recipe thresholds: dissolution at 160 to 170 C and 2 to 4 bar', evidence_expires: '2027-06-30', method_version: 'CM-PA6 v2', approver: 'quality@example.com', review_date: '2027-01-31', state: 'published' },
  ]) {
    await ins('claim_substantiation', c);
  }

  await act({ act: 'seed_completed', person: null, object_kind: 'system', object_ref: 'seed', content: { note: 'The seeded record opens with one entry per seeded act, in the order the acts happened.' } });
  console.log('[seed] done');
}

async function nameOnDate(reference, on) {
  const rows = await q('select * from party_version where reference = $1 order by effective_from asc', [reference]);
  const day = String(on).slice(0, 10);
  let name = null;
  for (const r of rows) if (String(r.effective_from).slice(0, 10) <= day) name = r.name;
  return name;
}
