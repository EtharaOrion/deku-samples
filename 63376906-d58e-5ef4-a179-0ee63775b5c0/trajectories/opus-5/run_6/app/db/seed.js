import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, q } from '../server/lib/db.js';
import { appendEntry } from '../server/lib/records.js';
import { dryMass, creditGranted, shareBp } from '../server/engine/arithmetic.js';
import { renderDocument } from '../server/engine/document.js';
import { statementsFor, formatBp } from '../server/engine/certificate.js';
import { comparisonStatement } from '../server/engine/carbon.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCHEME = 'RCS-2026';
const REGISTRATION = 'REG-RAVEL-0042';
const VERIFY_BASE = 'https://ravel.example.com/verify';

async function record(entry) { return appendEntry(null, entry); }

export async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

export async function seed() {
  const marked = await q('SELECT * FROM seed_marker WHERE id = 1');
  if (marked.length) return { seeded: false };

  // ---- sites ---------------------------------------------------------------
  const basis = '8000 hours per year, 0.90 availability, 0.80 yield';
  const sites = [
    ['SITE-PILOT', 'Pilot', 'commissioned', 40000, 24000, 'certified'],
    ['SITE-DEMO', 'Demonstration', 'commissioned', 400000, 320000, 'certified'],
    ['SITE-COMM', 'Commercial', 'planned', 25000000, 26000000, 'not_certified'],
  ];
  for (const [ref, name, conf, nameplate, contracted, cert] of sites) {
    await pool.query(
      `INSERT INTO site (reference, name, confidence, nameplate_kg, contracted_kg, certification_state, capacity_basis, last_revised)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'2026-06-30')`,
      [ref, name, conf, nameplate, contracted, cert, basis]);
    await pool.query('INSERT INTO certificate_sequence (site, last) VALUES ($1, 0)', [ref]);
    await record({ person: 'system', site: ref, object_kind: 'site', object_ref: ref, action: 'seeded', content: { name, confidence: conf } });
  }
  for (const [ref, , , , , cert] of sites) {
    await pool.query(
      `INSERT INTO site_certification (site, state, grade, effective_from, effective_to, reason, recorded_by)
       VALUES ($1,$2,NULL,'2026-01-01',NULL,$3,'system')`,
      [ref, cert === 'certified' ? 'certified' : 'not_certified', 'Seeded certification state']);
  }

  // ---- people --------------------------------------------------------------
  const people = [
    ['plant@example.com', 'Ines Bekele', ['plant_operator'], ['SITE-DEMO', 'SITE-PILOT']],
    ['analyst@example.com', 'Tomas Vlach', ['lab_analyst'], ['SITE-DEMO', 'SITE-PILOT']],
    ['quality@example.com', 'Marit Solheim', ['quality_manager'], ['SITE-DEMO', 'SITE-PILOT']],
    ['claims@example.com', 'Osei Danquah', ['claims_manager'], ['SITE-DEMO', 'SITE-PILOT']],
    ['signer@example.com', 'Hana Ferreira', ['certificate_signer'], ['SITE-DEMO', 'SITE-PILOT']],
    ['signer2@example.com', 'Pavel Ostrowski', ['certificate_signer'], ['SITE-PILOT']],
    ['auditor@example.com', 'Ruth Lindqvist', ['auditor'], ['SITE-DEMO', 'SITE-PILOT']],
  ];
  for (const [email, name, roles, personSites] of people) {
    const identifier = 'PER-' + email.split('@')[0].toUpperCase();
    await pool.query(
      `INSERT INTO person (identifier, email, name, roles, sites, grant_ends)
       VALUES ($1,$2,$3,$4,$5,'2027-06-30')`,
      [identifier, email, name, JSON.stringify(roles), JSON.stringify(personSites)]);
    await record({ person: 'system', object_kind: 'access_grant', object_ref: identifier, action: 'granted', content: { email, roles, sites: personSites, grant_ends: '2027-06-30' } });
  }

  // ---- parties and collectors ---------------------------------------------
  const collectors = [
    ['COL-ALDER', 'Alder Reclaim', 'PT', 'WCR-PT-4471', '2027-03-31'],
    ['COL-BRINE', 'Brine Textile Recovery', 'NL', 'WCR-NL-2208', '2027-01-31'],
    ['COL-CINDER', 'Cinder Industrial Offcuts', 'FR', 'WCR-FR-6613', '2026-12-31'],
  ];
  for (const [ref, name, country, reg, expiry] of collectors) {
    await pool.query('INSERT INTO party (reference, kind) VALUES ($1, $2)', [ref, 'collector']);
    await pool.query(
      `INSERT INTO party_version (party, name, identifier, effective_from) VALUES ($1,$2,$3,'2026-01-01')`,
      [ref, name, reg]);
    await pool.query(
      `INSERT INTO collector (reference, country, registration, registration_expiry, collection_site_types, declared_streams, scheme_status)
       VALUES ($1,$2,$3,$4,$5,$6,'in_scheme')`,
      [ref, country, reg, expiry,
        JSON.stringify(ref === 'COL-CINDER' ? ['industrial_site', 'converter'] : ['municipal_collection', 'take_back']),
        JSON.stringify(ref === 'COL-CINDER' ? ['pre_consumer_offcuts'] : ['post_consumer_textiles', 'post_consumer_netting'])]);
    await record({ person: 'system', object_kind: 'collector', object_ref: ref, action: 'seeded', content: { name, country, registration: reg } });
  }
  // COL-BRINE is renamed from 2026-08-01; the earlier version is superseded, not rewritten
  await pool.query(
    `INSERT INTO party_version (party, name, identifier, effective_from) VALUES ('COL-BRINE','Brine Circular Materials','WCR-NL-2208','2026-08-01')`);
  await pool.query(
    `UPDATE party_version SET superseded_by = (SELECT id FROM party_version WHERE party='COL-BRINE' AND effective_from='2026-08-01')
      WHERE party='COL-BRINE' AND effective_from='2026-01-01'`);
  await record({ person: 'system', object_kind: 'party_version', object_ref: 'COL-BRINE', action: 'renamed', content: { name: 'Brine Circular Materials', effective_from: '2026-08-01' } });

  const approvals = [
    ['COL-ALDER', 'approved', '2026-01-01', '2026-12-31', null, null],
    ['COL-BRINE', 'approved', '2026-01-01', '2026-06-30', null, null],
    ['COL-CINDER', 'conditional', '2026-01-01', '2026-12-31', 'Sampling plan for coated streams to be agreed', '2026-10-31'],
  ];
  for (const [col, state, from, to, cond, closes] of approvals) {
    await pool.query(
      `INSERT INTO approval_period (collector, state, valid_from, valid_to, condition, condition_closes_on, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,'quality@example.com')`, [col, state, from, to, cond, closes]);
    await record({ person: 'quality@example.com', object_kind: 'collector', object_ref: col, action: `approval_${state}`, content: { valid_from: from, valid_to: to, condition: cond } });
  }

  // ---- weighing devices ----------------------------------------------------
  for (const [ref, site, cal] of [['WB-DEMO-01', 'SITE-DEMO', '2026-05-01'], ['WB-DEMO-02', 'SITE-DEMO', '2025-02-01']]) {
    await pool.query('INSERT INTO weighing_device (reference, site, calibrated_on) VALUES ($1,$2,$3)', [ref, site, cal]);
  }

  // ---- batches -------------------------------------------------------------
  const batches = [
    { ref: 'BATCH-1001', col: 'COL-ALDER', cat: 'post_consumer', on: '2026-02-10', net: 500000, moist: 1000, dev: 'WB-DEMO-01' },
    { ref: 'BATCH-1002', col: 'COL-ALDER', cat: 'pre_consumer', on: '2026-02-12', net: 300000, moist: 0, dev: 'WB-DEMO-01' },
    { ref: 'BATCH-1003', col: 'COL-BRINE', cat: 'post_consumer', on: '2026-07-05', net: 200000, moist: 500, dev: 'WB-DEMO-01' },
    { ref: 'BATCH-1004', col: 'COL-CINDER', cat: 'pre_consumer', on: '2026-02-20', net: 120000, moist: 0, dev: 'WB-DEMO-02' },
    { ref: 'BATCH-1005', col: 'COL-ALDER', cat: 'post_consumer', on: '2026-03-02', net: 100000, moist: 0, dev: 'WB-DEMO-01' },
  ];
  const compositions = {
    'BATCH-1001': { polymer: 'PA6', fraction_bp: 9200, basis: 'sampled' },
    'BATCH-1002': { polymer: 'PA6', fraction_bp: 9600, basis: 'sampled' },
    'BATCH-1003': { polymer: 'PA6', fraction_bp: 8900, basis: 'declared' },
    'BATCH-1004': { polymer: 'PA6', fraction_bp: 9900, basis: 'declared', measured_fraction_bp: 9100 },
    'BATCH-1005': { polymer: 'PA6', fraction_bp: 9300, basis: 'sampled' },
  };
  const contaminations = {
    'BATCH-1001': { non_nylon_bp: 800, elastane_bp: 400, coatings: 'none observed', colour_load: 'mixed dark', foreign_matter: 'metal fasteners removed at intake' },
    'BATCH-1002': { non_nylon_bp: 400, elastane_bp: 100, coatings: 'none observed', colour_load: 'undyed', foreign_matter: 'none observed' },
    'BATCH-1003': { non_nylon_bp: 1100, elastane_bp: 600, coatings: 'light PU coating', colour_load: 'mixed', foreign_matter: 'trim tape' },
    'BATCH-1004': { non_nylon_bp: 100, elastane_bp: 0, coatings: 'coated selvedge', colour_load: 'single colour', foreign_matter: 'none observed' },
    'BATCH-1005': { non_nylon_bp: 700, elastane_bp: 300, coatings: 'none observed', colour_load: 'mixed light', foreign_matter: 'none observed' },
  };
  const CUSTODY_KINDS = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
  for (const b of batches) {
    const eventAt = `${b.on}T07:30:00Z`;
    await pool.query(
      `INSERT INTO batch (reference, collector, site, grade, category, gross_g, tare_g, net_g, moisture_bp, moisture_method,
        device, received_on, composition, contamination, accepted_g, rejected_g, booked_by, event_at, recorded_at, effective_on)
       VALUES ($1,$2,'SITE-DEMO','N6',$3,$4,$5,$6,$7,'ISO 15512',$8,$9,$10,$11,$6,0,'plant@example.com',$12,$12,$9)`,
      [b.ref, b.col, b.cat, b.net + 20000, 20000, b.net, b.moist, b.dev, b.on,
        JSON.stringify(compositions[b.ref]), JSON.stringify(contaminations[b.ref]), eventAt]);
    // BATCH-1005 is the one batch whose custody list omits a link: transport
    const kinds = b.ref === 'BATCH-1005' ? CUSTODY_KINDS.filter((k) => k !== 'transport') : CUSTODY_KINDS;
    let ord = 0;
    for (const kind of kinds) {
      await pool.query(
        'INSERT INTO custody_link (batch, kind, link_date, party, ord) VALUES ($1,$2,$3,$4,$5)',
        [b.ref, kind, b.on, kind === 'collection_site' || kind === 'collector' ? b.col : (kind === 'transport' ? 'Haulier Meridian' : 'SITE-DEMO'), ord++]);
    }
    await pool.query(
      `INSERT INTO weighing (batch, device, gross_g, tare_g, net_g, calibration_state, weighed_at)
       VALUES ($1,$2,$3,20000,$4,$5,$6)`,
      [b.ref, b.dev, b.net + 20000, b.net, b.dev === 'WB-DEMO-02' ? 'lapsed' : 'in_calibration', eventAt]);
    await record({ person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'batch', object_ref: b.ref, action: 'booked_in', at: eventAt, content: { collector: b.col, category: b.cat, net_g: b.net, moisture_bp: b.moist, received_on: b.on, dry_mass_g: dryMass(b.net, b.moist) } });
    await record({ person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'weighing', object_ref: b.ref, action: 'weighed', at: eventAt, content: { device: b.dev, net_g: b.net, calibration_state: b.dev === 'WB-DEMO-02' ? 'lapsed' : 'in_calibration' } });
  }

  // BATCH-1004 departs from the collector's declaration by 800 bp: a finding on the collector
  await pool.query(
    `INSERT INTO finding (reference, collector, kind, detail, raised_on, due_on, state, batch)
     VALUES ('FND-0001','COL-CINDER','declaration_departure',
       'Measured composition 9100 bp against a declared 9900 bp on BATCH-1004: a departure of 800 basis points beyond the 500 basis point tolerance.',
       '2026-02-21','2026-05-21','open','BATCH-1004')`);
  await record({ person: 'quality@example.com', object_kind: 'finding', object_ref: 'FND-0001', action: 'raised', content: { collector: 'COL-CINDER', departure_bp: 800, batch: 'BATCH-1004' } });

  // ---- recipe versions -----------------------------------------------------
  const recipes = [
    ['RCP-DISS-2', 'RCP-DISS', 2, 'dissolution', { temperature_c: 165, pressure_bar: 3 }, { temperature_c: [160, 170], pressure_bar: [2, 4] }, 90],
    ['RCP-DEPO-4', 'RCP-DEPO', 4, 'depolymerisation', { temperature_c: 240, pressure_bar: 6 }, { temperature_c: [235, 250], pressure_bar: [5, 8] }, 180],
    ['RCP-PURI-1', 'RCP-PURI', 1, 'purification', { temperature_c: 120, pressure_bar: 1 }, { temperature_c: [110, 130], pressure_bar: [1, 2] }, 120],
    ['RCP-REPO-3', 'RCP-REPO', 3, 'repolymerisation', { temperature_c: 255, pressure_bar: 2 }, { temperature_c: [250, 262], pressure_bar: [1, 3] }, 240],
  ];
  for (const [ref, recipe, version, runType, setPoints, tolerances, residence] of recipes) {
    await pool.query(
      `INSERT INTO recipe_version (reference, recipe, version, run_type, set_points, tolerances, reagents, residence_min, released_by, released_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'quality@example.com','2026-01-05')`,
      [ref, recipe, version, runType, JSON.stringify(setPoints), JSON.stringify(tolerances),
        JSON.stringify([{ reagent: 'green solvent blend', ratio_bp: 3000 }, { reagent: 'catalyst', ratio_bp: 50 }]), residence]);
  }

  // ---- runs, consumptions, outputs ----------------------------------------
  const runs = [
    { ref: 'RUN-D-0001', type: 'dissolution', recipe: 'RCP-DISS-2', on: '2026-03-04', actual: { temperature_c: 165, pressure_bar: 3 } },
    { ref: 'RUN-D-0002', type: 'dissolution', recipe: 'RCP-DISS-2', on: '2026-03-05', actual: { temperature_c: 172, pressure_bar: 3 } },
    { ref: 'RUN-D-0003', type: 'dissolution', recipe: 'RCP-DISS-2', on: '2026-03-06', actual: { temperature_c: 164, pressure_bar: 3 } },
    { ref: 'RUN-Y-0001', type: 'depolymerisation', recipe: 'RCP-DEPO-4', on: '2026-03-08', actual: { temperature_c: 242, pressure_bar: 6 } },
    { ref: 'RUN-U-0001', type: 'purification', recipe: 'RCP-PURI-1', on: '2026-03-10', actual: { temperature_c: 120, pressure_bar: 1 } },
    { ref: 'RUN-R-0001', type: 'repolymerisation', recipe: 'RCP-REPO-3', on: '2026-03-12', actual: { temperature_c: 256, pressure_bar: 2 } },
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

  let consSeq = 0;
  for (const r of runs) {
    const startedAt = `${r.on}T06:00:00Z`;
    const closedAt = `${r.on}T18:00:00Z`;
    const recipe = recipes.find((x) => x[0] === r.recipe);
    const tol = recipe[5];
    const within = Object.entries(r.actual).every(([k, v]) => !tol[k] || (v >= tol[k][0] && v <= tol[k][1]));
    const inMass = consumptions[r.ref].reduce((s, c) => s + c[2], 0);
    const outMass = outputs[r.ref].reduce((s, o) => s + o[2], 0);
    await pool.query(
      `INSERT INTO run (reference, run_type, site, equipment, recipe_version, operator, started_at, closed_at, state,
        losses_g, actual_set_points, within_tolerance, event_at, recorded_at, effective_on)
       VALUES ($1,$2,'SITE-DEMO',$3,$4,'plant@example.com',$5,$6,'closed',$7,$8,$9,$5,$6,$10)`,
      [r.ref, r.type, `EQ-${r.type.slice(0, 4).toUpperCase()}-1`, r.recipe, startedAt, closedAt,
        inMass - outMass, JSON.stringify(r.actual), within, r.on]);
    await record({ person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'run', object_ref: r.ref, action: 'started', at: startedAt, content: { run_type: r.type, recipe_version: r.recipe } });
    for (const [kind, ref, mass] of consumptions[r.ref]) {
      const cref = `CON-${String(++consSeq).padStart(4, '0')}`;
      await pool.query(
        `INSERT INTO consumption (reference, run, input_kind, input_ref, mass_g, recorded_by, event_at, recorded_at, effective_on)
         VALUES ($1,$2,$3,$4,$5,'plant@example.com',$6,$6,$7)`,
        [cref, r.ref, kind, ref, mass, startedAt, r.on]);
      await record({ person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'consumption', object_ref: cref, action: 'recorded', at: startedAt, content: { run: r.ref, input_kind: kind, input_ref: ref, mass_g: mass } });
    }
    for (const [ref, kind, mass, disp] of outputs[r.ref]) {
      await pool.query(
        `INSERT INTO output (reference, run, kind, mass_g, disposition, allocation_basis, recorded_by, event_at, recorded_at, effective_on)
         VALUES ($1,$2,$3,$4,$5,$6,'plant@example.com',$7,$7,$8)`,
        [ref, r.ref, kind, mass, disp, disp ? 'mass' : null, closedAt, r.on]);
      await record({ person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'output', object_ref: ref, action: 'recorded', at: closedAt, content: { run: r.ref, kind, mass_g: mass, disposition: disp } });
    }
    await record({ person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'run', object_ref: r.ref, action: 'closed', at: closedAt, content: { losses_g: inMass - outMass, mass_in_g: inMass, mass_out_g: outMass, within_tolerance: within, derivation: 'losses_g = mass in minus mass out' } });
  }

  // ---- lots ----------------------------------------------------------------
  const lots = [
    ['LOT-N6-0001', 'N6', 'SITE-DEMO', 400000, 'released', 'mass_balance', 'LOT-N6-0001', '2026-03-12'],
    ['LOT-N6-0002', 'N6', 'SITE-DEMO', 300000, 'quarantined', 'mass_balance', 'LOT-N6-0002', '2026-03-12'],
    ['LOT-N6-0003', 'N6', 'SITE-PILOT', 200000, 'released', 'mass_balance', null, '2026-02-24'],
  ];
  for (const [ref, grade, site, mass, disp, claimType, outputRef, producedOn] of lots) {
    await pool.query(
      `INSERT INTO lot (reference, grade, site, mass_g, disposition, disposition_by, disposition_at, claim_type, output_ref, specification_version, produced_on)
       VALUES ($1,$2,$3,$4,$5,'quality@example.com',$6,$7,$8,3,$9)`,
      [ref, grade, site, mass, disp, `${producedOn}T20:00:00Z`, claimType, outputRef, producedOn]);
    await record({ person: 'quality@example.com', site, object_kind: 'lot', object_ref: ref, action: `disposition_${disp}`, at: `${producedOn}T20:00:00Z`, content: { disposition: disp, mass_g: mass, claim_type: claimType } });
  }

  // ---- test results --------------------------------------------------------
  const tests = [
    ['TST-0001', 'lot', 'LOT-N6-0001', 'relative_viscosity', 'ISO 307', 'VIS-2', '2.43', 'ratio', 150],
    ['TST-0002', 'lot', 'LOT-N6-0001', 'moisture', 'ISO 15512', 'KF-1', '0.04', 'percent', 200],
    ['TST-0003', 'lot', 'LOT-N6-0003', 'relative_viscosity', 'ISO 307', 'VIS-2', '2.41', 'ratio', 150],
    ['TST-0004', 'lot', 'LOT-N6-0003', 'moisture', 'ISO 15512', 'KF-1', '0.06', 'percent', 200],
    ['TST-0005', 'lot', 'LOT-N6-0002', 'relative_viscosity', 'ISO 307', 'VIS-2', '2.31', 'ratio', 150],
    ['TST-0006', 'batch', 'BATCH-1004', 'polymer_fraction', 'FTIR-INTERNAL', 'FTIR-1', '91.00', 'percent', 300],
  ];
  for (const [ref, kind, subject, property, method, instrument, value, unit, unc] of tests) {
    await pool.query(
      `INSERT INTO test_result (reference, subject_kind, subject_ref, property, method, instrument, analyst, value, unit,
        uncertainty_bp, method_mismatch, usable_for_release, entered_by, event_at, recorded_at, effective_on)
       VALUES ($1,$2,$3,$4,$5,$6,'analyst@example.com',$7,$8,$9,false,true,'analyst@example.com','2026-03-13T09:00:00Z','2026-03-13T09:00:00Z','2026-03-13')`,
      [ref, kind, subject, property, method, instrument, value, unit, unc]);
    await record({ person: 'analyst@example.com', site: 'SITE-DEMO', object_kind: 'test_result', object_ref: ref, action: 'entered', at: '2026-03-13T09:00:00Z', content: { subject: subject, property, method, value, unit } });
  }

  // ---- deviations ----------------------------------------------------------
  await pool.query(
    `INSERT INTO deviation (reference, state, outcome, runs, lots, detail, raised_by, raised_at)
     VALUES ('DEV-0001','open',NULL,$1,$2,'Purification column pressure drift observed on RUN-U-0001; the lot it holds is not released until the cause is established.','quality@example.com','2026-03-11T10:00:00Z')`,
    [JSON.stringify(['RUN-U-0001']), JSON.stringify(['LOT-N6-0002'])]);
  await record({ person: 'quality@example.com', site: 'SITE-DEMO', object_kind: 'deviation', object_ref: 'DEV-0001', action: 'raised', at: '2026-03-11T10:00:00Z', content: { runs: ['RUN-U-0001'], lots: ['LOT-N6-0002'] } });
  await pool.query(
    `INSERT INTO deviation (reference, state, outcome, runs, lots, detail, raised_by, raised_at, closed_by, closed_at)
     VALUES ('DEV-0002','closed','cause_not_established',$1,$2,'RUN-D-0002 ran at 172 C against a recipe allowing 160 to 170 C.','quality@example.com','2026-03-05T19:00:00Z','quality@example.com','2026-03-20T11:00:00Z')`,
    [JSON.stringify(['RUN-D-0002']), JSON.stringify([])]);
  await record({ person: 'quality@example.com', site: 'SITE-DEMO', object_kind: 'deviation', object_ref: 'DEV-0002', action: 'raised', at: '2026-03-05T19:00:00Z', content: { runs: ['RUN-D-0002'], reason: 'outside recipe tolerance' } });
  await record({ person: 'quality@example.com', site: 'SITE-DEMO', object_kind: 'deviation', object_ref: 'DEV-0002', action: 'closed', at: '2026-03-20T11:00:00Z', content: { outcome: 'cause_not_established' } });

  // ---- override ------------------------------------------------------------
  await pool.query(
    `INSERT INTO override_record (reference, separation, reason, lot, authorised_by, recorded_by, reviewed, created_on, created_at)
     VALUES ('OVR-0001','analyst_not_dispositioner',
       'Night shift analyst dispositioned the lot because no second qualified person was on site',
       'LOT-N6-0001','quality@example.com','quality@example.com',false,'2026-03-18','2026-03-18T02:10:00Z')`);
  await record({ person: 'quality@example.com', site: 'SITE-DEMO', object_kind: 'override', object_ref: 'OVR-0001', action: 'recorded', at: '2026-03-18T02:10:00Z', content: { separation: 'analyst_not_dispositioner', lot: 'LOT-N6-0001', authorised_by: 'quality@example.com' } });

  // ---- conversion factors --------------------------------------------------
  await pool.query(
    `INSERT INTO conversion_factor (reference, site, version, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on)
     VALUES ('CF-DEMO-1','SITE-DEMO',1,8000,'2026-01-01','2026-03-31',1000000,800000,false,'claims@example.com','2026-04-01')`);
  await pool.query(
    `INSERT INTO conversion_factor (reference, site, version, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on)
     VALUES ('CF-PILOT-1','SITE-PILOT',1,7500,NULL,NULL,0,0,true,'claims@example.com','2026-01-05')`);
  await record({ person: 'claims@example.com', site: 'SITE-DEMO', object_kind: 'conversion_factor', object_ref: 'CF-DEMO-1', action: 'published', content: { factor_bp: 8000, derived_in_g: 1000000, derived_out_g: 800000, derivation: '800000 * 10000 / 1000000, floored' } });
  await record({ person: 'claims@example.com', site: 'SITE-PILOT', object_kind: 'conversion_factor', object_ref: 'CF-PILOT-1', action: 'published', content: { factor_bp: 7500, provisional: true, reason: 'SITE-PILOT has no loss history of its own' } });

  // ---- balance periods -----------------------------------------------------
  await pool.query(
    `INSERT INTO balance_period (id, site, grade, period_from, period_to, state, carry_over_limit_bp, allocation_basis, closed_on, closed_by, cut_off, metered_kwh)
     VALUES ('BP-DEMO-N6-2025H2','SITE-DEMO','N6','2025-07-01','2025-12-31','closed',2000,'mass','2026-01-15','claims@example.com','2026-01-10',0)`);
  await pool.query(
    `INSERT INTO balance_period (id, site, grade, period_from, period_to, state, carry_over_limit_bp, allocation_basis, metered_kwh)
     VALUES ('BP-DEMO-N6-2026H1','SITE-DEMO','N6','2026-01-01','2026-06-30','open',2000,'mass',300000)`);
  await pool.query(
    `INSERT INTO balance_period (id, site, grade, period_from, period_to, state, carry_over_limit_bp, allocation_basis, metered_kwh)
     VALUES ('BP-PILOT-N6-2026H1','SITE-PILOT','N6','2026-01-01','2026-06-30','open',2000,'mass',60000)`);
  await record({ person: 'claims@example.com', site: 'SITE-DEMO', object_kind: 'balance_period', object_ref: 'BP-DEMO-N6-2025H2', action: 'closed', at: '2026-01-15T16:00:00Z', content: { closed_on: '2026-01-15', cut_off: '2026-01-10' } });

  // ---- credit movements: a credit enters when a claimable batch is consumed --
  const batchMeta = {
    'BATCH-1001': { cat: 'post_consumer', claimable: true, dry: 450000, consumed: 450000 },
    'BATCH-1002': { cat: 'pre_consumer', claimable: true, dry: 300000, consumed: 300000 },
    'BATCH-1003': { cat: 'post_consumer', claimable: false, dry: 190000, consumed: 190000 },
    'BATCH-1004': { cat: 'pre_consumer', claimable: true, dry: 120000, consumed: 120000 },
  };
  for (const [ref, meta] of Object.entries(batchMeta)) {
    if (meta.claimable) {
      const credit = creditGranted(meta.consumed, 8000);
      await pool.query(
        `INSERT INTO credit_movement (period_id, category, direction, kind, mass_g, ref, derivation, factor_version, effective_on, event_at, recorded_by)
         VALUES ('BP-DEMO-N6-2026H1',$1,'in','consumption',$2,$3,$4,'CF-DEMO-1','2026-03-04','2026-03-04T06:00:00Z','plant@example.com')`,
        [meta.cat, credit, ref,
          JSON.stringify({ batch: ref, dry_mass_consumed_g: meta.consumed, factor_bp: 8000, formula: `${meta.consumed} * 8000 / 10000, floored`, factor: 'CF-DEMO-1' })]);
    } else {
      await pool.query(
        `INSERT INTO credit_movement (period_id, category, direction, kind, mass_g, ref, derivation, effective_on, event_at, recorded_by)
         VALUES ('BP-DEMO-N6-2026H1',$1,'in','non_claimable_input',0,$2,$3,'2026-03-05','2026-03-05T06:00:00Z','plant@example.com')`,
        [meta.cat, ref,
          JSON.stringify({ batch: ref, dry_mass_consumed_g: meta.consumed, non_claimable_input_g: meta.consumed, reason: 'collector_approval_lapsed', credit_g: 0 })]);
      // the non-claimable mass is carried on the movement so the period can report it
      await pool.query(
        `UPDATE credit_movement SET mass_g = 0 WHERE ref = $1 AND kind = 'non_claimable_input'`, [ref]);
    }
  }
  // a separate movement row carries the non-claimable input mass for reporting
  await pool.query(
    `UPDATE credit_movement SET mass_g = 190000 WHERE kind = 'non_claimable_input' AND ref = 'BATCH-1003'`);
  // and it must not enter credits_in, so it is direction 'in' but kind non_claimable_input:
  // ledgerFor counts by direction, so store it as a neutral movement instead
  await pool.query(
    `UPDATE credit_movement SET direction = 'note' WHERE kind = 'non_claimable_input'`);

  // ---- inter-site transfer -------------------------------------------------
  await pool.query(
    `INSERT INTO transfer (reference, from_period, to_period, category, mass_g, moved_on, recorded_by)
     VALUES ('TRF-0001','BP-PILOT-N6-2026H1','BP-DEMO-N6-2026H1','post_consumer',50000,'2026-05-12','claims@example.com')`);
  await pool.query(
    `INSERT INTO credit_movement (period_id, category, direction, kind, mass_g, ref, origin_site, fresh_credit, derivation, effective_on, event_at, recorded_by)
     VALUES ('BP-PILOT-N6-2026H1','post_consumer','out','transfer_out',50000,'TRF-0001','SITE-PILOT',false,$1,'2026-05-12','2026-05-12T09:00:00Z','claims@example.com')`,
    [JSON.stringify({ transfer: 'TRF-0001', to_period: 'BP-DEMO-N6-2026H1', note: 'the total credit across the two periods is unchanged by the journey' })]);
  await pool.query(
    `INSERT INTO credit_movement (period_id, category, direction, kind, mass_g, ref, origin_site, fresh_credit, derivation, effective_on, event_at, recorded_by)
     VALUES ('BP-DEMO-N6-2026H1','post_consumer','inbound','transfer_in',50000,'TRF-0001','SITE-PILOT',false,$1,'2026-05-12','2026-05-12T09:00:00Z','claims@example.com')`,
    [JSON.stringify({ transfer: 'TRF-0001', from_period: 'BP-PILOT-N6-2026H1', fresh_credit: false, note: 'inbound credit naming its origin, never a fresh credit' })]);
  await record({ person: 'claims@example.com', site: 'SITE-DEMO', object_kind: 'transfer', object_ref: 'TRF-0001', action: 'recorded', at: '2026-05-12T09:00:00Z', content: { from_period: 'BP-PILOT-N6-2026H1', to_period: 'BP-DEMO-N6-2026H1', mass_g: 50000, origin_site: 'SITE-PILOT' } });

  // SITE-PILOT credit in, so LOT-N6-0003 can carry a claim and the transfer nets out
  await pool.query(
    `INSERT INTO credit_movement (period_id, category, direction, kind, mass_g, ref, derivation, factor_version, effective_on, event_at, recorded_by)
     VALUES ('BP-PILOT-N6-2026H1','post_consumer','in','consumption',225000,'PILOT-FEED-01',$1,'CF-PILOT-1','2026-02-20','2026-02-20T06:00:00Z','plant@example.com')`,
    [JSON.stringify({ batch: 'PILOT-FEED-01', dry_mass_consumed_g: 300000, factor_bp: 7500, formula: '300000 * 7500 / 10000, floored', factor: 'CF-PILOT-1', provisional: true })]);

  // ---- carbon --------------------------------------------------------------
  await pool.query(`INSERT INTO carbon_method (id, name, polymer) VALUES ('CM-PA6','Polyamide 6 cradle-to-gate','PA6')`);
  const factorsV1 = [
    { name: 'grid electricity', source: 'EcoBase 2024', year: 2024, value_mg_per_kwh: 280000 },
    { name: 'process steam', source: 'EcoBase 2024', year: 2024, value_mg_per_kg: 92000 },
  ];
  const factorsV2 = [
    { name: 'grid electricity', source: 'EcoBase 2025', year: 2025, value_mg_per_kwh: 262000 },
    { name: 'process steam', source: 'EcoBase 2025', year: 2025, value_mg_per_kg: 88000 },
    { name: 'road freight', source: 'EcoBase 2025', year: 2025, value_mg_per_tkm: 105000 },
    { name: 'green solvent blend', source: 'Supplier declaration', year: 2025, value_mg_per_kg: 1410000 },
  ];
  const dq = [
    'A line tagged primary is metered at the site or invoiced to the site for the period stated.',
    'A line tagged supplier_specific carries a supplier declaration dated inside the period.',
    'A line tagged secondary rests on a published dataset naming its year and region.',
    'A figure whose primary share falls below 5000 basis points is reported as default-led.',
  ];
  await pool.query(
    `INSERT INTO carbon_method_version (method_id, version, standard, functional_unit, boundary, allocation_basis, reviewer, published_on, published_by, data_quality_rules, emission_factors, primary_threshold_bp, superseded)
     VALUES ('CM-PA6',1,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2025-06-10','quality@example.com',$1,$2,5000,true)`,
    [JSON.stringify(dq), JSON.stringify(factorsV1)]);
  await pool.query(
    `INSERT INTO carbon_method_version (method_id, version, standard, functional_unit, boundary, allocation_basis, reviewer, published_on, published_by, data_quality_rules, emission_factors, primary_threshold_bp, superseded)
     VALUES ('CM-PA6',2,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2026-01-20','quality@example.com',$1,$2,5000,false)`,
    [JSON.stringify(dq), JSON.stringify(factorsV2)]);
  await record({ person: 'quality@example.com', object_kind: 'carbon_method_version', object_ref: 'CM-PA6 v1', action: 'published', at: '2025-06-10T12:00:00Z', content: { standard: 'ISO 14067', boundary: 'cradle-to-gate' } });
  await record({ person: 'quality@example.com', object_kind: 'carbon_method_version', object_ref: 'CM-PA6 v2', action: 'published', at: '2026-01-20T12:00:00Z', content: { standard: 'ISO 14067', boundary: 'cradle-to-gate', supersedes: 1 } });

  const breakdown = [
    { line: 'collection_and_transport', mg_per_kg: 310000, tag: 'primary' },
    { line: 'process_energy', mg_per_kg: 1850000, tag: 'primary' },
    { line: 'reagents', mg_per_kg: 1180000, tag: 'supplier_specific' },
    { line: 'water_and_effluent', mg_per_kg: 240000, tag: 'primary' },
    { line: 'waste_and_residues', mg_per_kg: 330000, tag: 'secondary' },
    { line: 'outbound_transport', mg_per_kg: 410000, tag: 'secondary' },
    { line: 'byproduct_credit', mg_per_kg: -60000, tag: 'primary' },
  ];
  // The comparator's own figure is named comparator_mg_per_kg, not value_mg_per_kg:
  // a response carrying value_mg_per_kg without its boundary, method version and
  // uncertainty does not exist anywhere in this API, including inside a nested object.
  const comparator = {
    material: 'virgin PA6', dataset: 'EcoBase 2025', dataset_year: 2025, region: 'EU-27',
    comparator_mg_per_kg: 5850000,
  };
  const energyDemo = { energy_location_mg_per_kg: 1850000, energy_market_mg_per_kg: 620000, metered_kwh: 300000 };
  await pool.query(
    `INSERT INTO carbon_figure (id, lot, figure_version, value_mg_per_kg, uncertainty_bp, primary_share_bp, method_id, method_version, boundary, comparator, breakdown, energy, input_versions, computed_by, computed_at)
     VALUES ('CFG-0001','LOT-N6-0001',1,4260000,1200,6500,'CM-PA6',2,'cradle-to-gate',$1,$2,$3,$4,'quality@example.com','2026-03-14T10:00:00Z')`,
    [JSON.stringify(comparator), JSON.stringify(breakdown), JSON.stringify(energyDemo),
      JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1', specification: 'SPEC-N6 v3', recipe_versions: ['RCP-DISS-2', 'RCP-DEPO-4', 'RCP-PURI-1', 'RCP-REPO-3'], emission_factor_set: 'EcoBase 2025' })]);
  await record({ person: 'quality@example.com', site: 'SITE-DEMO', object_kind: 'carbon_figure', object_ref: 'CFG-0001', action: 'computed', at: '2026-03-14T10:00:00Z', content: { lot: 'LOT-N6-0001', value_mg_per_kg: 4260000, method_version: 'CM-PA6 v2' } });

  const breakdown3 = [
    { line: 'collection_and_transport', mg_per_kg: 340000, tag: 'primary' },
    { line: 'process_energy', mg_per_kg: 2010000, tag: 'primary' },
    { line: 'reagents', mg_per_kg: 1220000, tag: 'supplier_specific' },
    { line: 'water_and_effluent', mg_per_kg: 260000, tag: 'primary' },
    { line: 'waste_and_residues', mg_per_kg: 350000, tag: 'secondary' },
    { line: 'outbound_transport', mg_per_kg: 430000, tag: 'secondary' },
  ];
  const energyPilot = { energy_location_mg_per_kg: 2010000, energy_market_mg_per_kg: 810000, metered_kwh: 60000 };
  await pool.query(
    `INSERT INTO carbon_figure (id, lot, figure_version, value_mg_per_kg, uncertainty_bp, primary_share_bp, method_id, method_version, boundary, comparator, breakdown, energy, input_versions, computed_by, computed_at)
     VALUES ('CFG-0002','LOT-N6-0003',1,4610000,1500,6100,'CM-PA6',2,'cradle-to-gate',$1,$2,$3,$4,'quality@example.com','2026-02-25T10:00:00Z')`,
    [JSON.stringify(comparator), JSON.stringify(breakdown3), JSON.stringify(energyPilot),
      JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-PILOT-1', specification: 'SPEC-N6 v3', emission_factor_set: 'EcoBase 2025' })]);
  await pool.query(
    `INSERT INTO carbon_figure (id, lot, figure_version, value_mg_per_kg, uncertainty_bp, primary_share_bp, method_id, method_version, boundary, comparator, breakdown, energy, input_versions, computed_by, computed_at)
     VALUES ('CFG-0003','LOT-N6-0002',1,4480000,1300,6300,'CM-PA6',2,'cradle-to-gate',$1,$2,$3,$4,'quality@example.com','2026-03-14T10:05:00Z')`,
    [JSON.stringify(comparator), JSON.stringify(breakdown), JSON.stringify(energyDemo),
      JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1', specification: 'SPEC-N6 v3', emission_factor_set: 'EcoBase 2025' })]);

  // ---- energy instruments --------------------------------------------------
  await pool.query(
    `INSERT INTO energy_instrument (reference, quantity_kwh, vintage, region, state, applied_period)
     VALUES ('EAC-2026-0007',250000,2026,'EU-27','retired','BP-DEMO-N6-2026H1')`);
  await pool.query(
    `INSERT INTO energy_instrument (reference, quantity_kwh, vintage, region, state, applied_period)
     VALUES ('EAC-2025-0031',100000,2025,'EU-27','held',NULL)`);
  await record({ person: 'claims@example.com', site: 'SITE-DEMO', object_kind: 'energy_instrument', object_ref: 'EAC-2026-0007', action: 'retired_against_period', content: { period: 'BP-DEMO-N6-2026H1', quantity_kwh: 250000, metered_kwh: 300000, unmatched_kwh: 50000 } });

  // ---- specifications ------------------------------------------------------
  const specProps = [
    { property: 'relative_viscosity', method: 'ISO 307', limit: '2.40', unit: 'ratio', basis: 'guaranteed' },
    { property: 'moisture', method: 'ISO 15512', limit: '0.10', unit: 'percent', basis: 'guaranteed' },
    { property: 'yellowness_index', method: 'ASTM E313', limit: '8.0', unit: 'index', basis: 'typical' },
    { property: 'ash_content', method: 'ISO 3451-1', limit: '0.30', unit: 'percent', basis: 'informational' },
  ];
  const virginRef = { reference: 'virgin PA6 at relative viscosity 2.42', source: 'EcoBase 2025', date: '2025-11-30' };
  await pool.query(
    `INSERT INTO specification (grade, version, issued_on, properties, virgin_reference, superseded)
     VALUES ('N6',2,'2025-09-15',$1,$2,true)`,
    [JSON.stringify(specProps.map((p) => (p.property === 'relative_viscosity' ? { ...p, limit: '2.38' } : p))), JSON.stringify(virginRef)]);
  await pool.query(
    `INSERT INTO specification (grade, version, issued_on, properties, virgin_reference, superseded)
     VALUES ('N6',3,'2026-02-01',$1,$2,false)`,
    [JSON.stringify(specProps), JSON.stringify(virginRef)]);
  await record({ person: 'quality@example.com', object_kind: 'specification', object_ref: 'SPEC-N6 v3', action: 'issued', at: '2026-02-01T09:00:00Z', content: { grade: 'N6', version: 3 } });

  // ---- customers -----------------------------------------------------------
  const customers = [
    ['CUS-HELIOS', 'Helios Technical Textiles', 'helios@example.com', 3, 'technical apparel yarn', 'textiles', 'en'],
    ['CUS-VANTA', 'Vanta Safety Systems', 'vanta@example.com', 2, 'airbag fabric', 'automotive', 'en'],
  ];
  for (const [ref, name, contact, version, application, industry, language] of customers) {
    await pool.query('INSERT INTO party (reference, kind) VALUES ($1, $2)', [ref, 'customer']);
    await pool.query(
      `INSERT INTO party_version (party, name, identifier, effective_from) VALUES ($1,$2,$1,'2026-01-01')`, [ref, name]);
    await pool.query(
      `INSERT INTO customer (reference, contact, holds_grade, holds_specification_version, application, industry, language)
       VALUES ($1,$2,'N6',$3,$4,$5,$6)`, [ref, contact, version, application, industry, language]);
    await pool.query(
      `INSERT INTO specification_issue (grade, version, customer, issued_on, issued_by)
       VALUES ('N6',$1,$2,$3,'quality@example.com')`, [version, ref, version === 3 ? '2026-02-01' : '2025-09-15']);
    await pool.query(
      `INSERT INTO conformance (customer, application, grade, spec_version, trials, outcome, opened_on)
       VALUES ($1,$2,'N6',$3,$4,$5,'2026-01-10')`,
      [ref, application, version,
        JSON.stringify(ref === 'CUS-VANTA'
          ? [{ trial: 'weave trial', date: '2026-02-04', outcome: 'passed' }, { trial: 'deployment trial', date: '2026-02-18', outcome: 'passed' }]
          : [{ trial: 'spinning trial', date: '2026-01-28', outcome: 'passed' }]),
        'qualified']);
  }

  // ---- contracts -----------------------------------------------------------
  await pool.query(
    `INSERT INTO contract (id, recipient, site, period, committed_kg, floor_bp, delivered_kg, shortfall_consequence)
     VALUES ('CON-HELIOS-1','CUS-HELIOS','SITE-DEMO','2026-H1',200,5000,0,'a pro-rata credit against the following quarter''s invoice')`);
  await pool.query(
    `INSERT INTO contract (id, recipient, site, period, committed_kg, floor_bp, delivered_kg, shortfall_consequence)
     VALUES ('CON-VANTA-1','CUS-VANTA','SITE-COMM','2029-H1',1000,3000,0,'a make-good volume in the following period')`);

  // ---- certificates --------------------------------------------------------
  await seedCertificate({
    number: 'CERT-PILOT-000001', seq: 1, site: 'SITE-PILOT', lotRef: 'LOT-N6-0003',
    recipient: 'CUS-HELIOS', recipientName: 'Helios Technical Textiles', signer: 'signer2@example.com',
    signerName: 'Pavel Ostrowski', signedAt: '2026-03-02T11:00:00Z', figureId: 'CFG-0002',
    state: 'withdrawn', withdrawnOn: '2026-04-18', withdrawalReason: 'A collector category was corrected after acceptance',
    contentBpValue: 7500, categorySplit: { post_consumer: 150000 }, language: 'en',
  });
  await seedCertificate({
    number: 'CERT-PILOT-000002', seq: 2, site: 'SITE-PILOT', lotRef: 'LOT-N6-0003',
    recipient: 'CUS-VANTA', recipientName: 'Vanta Safety Systems', signer: 'signer2@example.com',
    signerName: 'Pavel Ostrowski', signedAt: '2026-04-20T11:00:00Z', figureId: 'CFG-0002',
    state: 'issued', contentBpValue: 7500, categorySplit: { post_consumer: 150000 }, language: 'en',
  });
  await pool.query(`UPDATE certificate_sequence SET last = 2 WHERE site = 'SITE-PILOT'`);

  // the credit backing LOT-N6-0003's certificates is attached in the pilot ledger
  await pool.query(
    `INSERT INTO credit_movement (period_id, category, direction, kind, mass_g, ref, lot, derivation, effective_on, event_at, recorded_by)
     VALUES ('BP-PILOT-N6-2026H1','post_consumer','out','allocation',150000,'ALO-PILOT-0001','LOT-N6-0003',$1,'2026-02-25','2026-02-25T09:00:00Z','claims@example.com')`,
    [JSON.stringify({ lot: 'LOT-N6-0003', lot_mass_g: 200000, content_bp: 7500, formula: '150000 * 10000 / 200000, floored' })]);

  // ---- legal hold on the signing entry for CERT-PILOT-000001 ---------------
  const signEntry = (await q(
    `SELECT seq FROM record_entry WHERE object_ref = 'CERT-PILOT-000001' AND action = 'signed' ORDER BY seq ASC LIMIT 1`))[0];
  if (signEntry) {
    await pool.query(
      `INSERT INTO legal_hold (reference, seq, placed_by) VALUES ('HLD-0001',$1,'auditor@example.com')`, [signEntry.seq]);
    await record({ person: 'auditor@example.com', object_kind: 'legal_hold', object_ref: 'HLD-0001', action: 'placed', content: { seq: Number(signEntry.seq), certificate: 'CERT-PILOT-000001' } });
  }

  // ---- inbound records -----------------------------------------------------
  const inbound = [
    ['INB-0001', 'weighbridge', '2026-02-20T06:14:00Z', {
      ticket: 'WB-TICKET-88431', device: 'WB-DEMO-02', batch: 'BATCH-1004',
      gross_g: 140000, tare_g: 20000, net_g: 120000, calibration_state: 'lapsed', calibrated_on: '2025-02-01',
    }],
    ['INB-0002', 'control_system', '2026-03-04T22:41:00Z', {
      run: 'RUN-D-0001', recipe_version: 'RCP-DISS-2',
      actual_set_points: { temperature_c: 165, pressure_bar: 3 }, residence_min: 92,
    }],
    ['INB-0003', 'laboratory', '2026-03-06T09:02:00Z', {
      lot: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ISO 307',
      instrument: 'VIS-2', value: '2.43', unit: 'ratio', uncertainty_bp: 150,
    }],
  ];
  for (const [ref, source, receivedAt, payload] of inbound) {
    const verbatim = JSON.stringify(payload);
    await pool.query(
      `INSERT INTO inbound_record (reference, source, received_at, payload_verbatim, payload)
       VALUES ($1,$2,$3,$4,$5)`, [ref, source, receivedAt, verbatim, verbatim]);
    await record({ person: 'system', object_kind: 'inbound_record', object_ref: ref, action: 'received', at: receivedAt, content: { source, payload_verbatim: verbatim } });
  }

  // ---- public site ---------------------------------------------------------
  const stats = [
    ['textiles_recycled', 'Less than 1 per cent of textiles are recycled into new materials', 'Textile Flow Monitor', 2024, 'Global'],
    ['plastics_emissions', '1.8 gigatonnes of carbon dioxide equivalent a year from plastics production', 'Global Materials Emissions Panel', 2023, 'Global'],
    ['textile_incineration', 'More than 8 per cent of textile waste is incinerated each year', 'Textile Flow Monitor', 2024, 'EU-27'],
  ];
  for (const [key, value, source, year, geography] of stats) {
    await pool.query('INSERT INTO statistic (key, value, source, year, geography) VALUES ($1,$2,$3,$4,$5)', [key, value, source, year, geography]);
  }
  await pool.query(
    `INSERT INTO position (reference, title, location, department, contract_type, closes_on)
     VALUES ('POS-0001','Process Engineer','Lyon, France','Operations','Permanent','2026-11-30')`);
  const news = [
    ['NWS-0001', 'Series A closes at 40 million euros', 'funding', 'Materials Weekly', '2026-01-22', 'https://example.com/news/series-a', 'en'],
    ['NWS-0002', 'Offtake agreement signed for demonstration output', 'partnership', 'Fibre Report', '2026-03-11', 'https://example.com/news/offtake', 'en'],
    ['NWS-0003', 'Depolymerisation yield published', 'technical', 'Chimie Circulaire', '2026-05-06', 'https://example.com/news/rendement', 'fr'],
  ];
  for (const n of news) {
    await pool.query('INSERT INTO news_item (reference, title, tag, outlet, item_date, link, language) VALUES ($1,$2,$3,$4,$5,$6,$7)', n);
  }
  const claims = [
    ['CLM-0001', 'Low-carbon, virgin-quality recycled Nylon 6', '/product', '2026-02-01',
      'Carbon figure CFG-0001 computed under CM-PA6 v2 against comparator virgin PA6, EcoBase 2025, EU-27.',
      '2027-01-20', 'CM-PA6 v2', 'quality@example.com', '2026-12-01', 'published'],
    ['CLM-0002', 'Less than 1 per cent of textiles are recycled into new materials', '/about', '2026-01-15',
      'Textile Flow Monitor 2024, Global.', '2026-12-31', 'CM-PA6 v2', 'quality@example.com', '2026-10-01', 'published'],
    ['CLM-0003', 'Low temperature and pressure process', '/technology', '2026-01-15',
      'Recipe versions RCP-DISS-2 and RCP-REPO-3 with released set points and tolerances.',
      '2026-09-30', 'CM-PA6 v2', 'quality@example.com', '2026-11-01', 'published'],
  ];
  for (const c of claims) {
    await pool.query(
      `INSERT INTO claim_substantiation (reference, claim, route, first_published, evidence, evidence_expires, method_version, approver, review_date, state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, c);
  }

  await pool.query('INSERT INTO seed_marker (id) VALUES (1)');
  return { seeded: true };
}

async function seedCertificate(opts) {
  const lot = (await q('SELECT * FROM lot WHERE reference = $1', [opts.lotRef]))[0];
  const site = (await q('SELECT * FROM site WHERE reference = $1', [opts.site]))[0];
  const figure = (await q('SELECT * FROM carbon_figure WHERE id = $1', [opts.figureId]))[0];
  const spec = (await q("SELECT * FROM specification WHERE grade = 'N6' AND superseded = false"))[0];
  const tests = await q("SELECT * FROM test_result WHERE subject_kind = 'lot' AND subject_ref = $1", [opts.lotRef]);
  const factor = (await q('SELECT * FROM conversion_factor WHERE site = $1 ORDER BY version DESC LIMIT 1', [opts.site]))[0];
  const period = (await q('SELECT * FROM balance_period WHERE site = $1 ORDER BY period_from DESC LIMIT 1', [opts.site]))[0];

  const statements = statementsFor({
    claimType: lot.claim_type, contentBpValue: opts.contentBpValue, categorySplit: opts.categorySplit,
    scheme: SCHEME, number: opts.number, language: opts.language,
  });

  const carbon = {
    value_mg_per_kg: Number(figure.value_mg_per_kg),
    boundary: figure.boundary,
    method_version: `${figure.method_id} v${figure.method_version}`,
    uncertainty_bp: Number(figure.uncertainty_bp),
    comparator: figure.comparator,
    comparison_statement: comparisonStatement(Number(figure.value_mg_per_kg), figure.comparator),
    energy_location_mg_per_kg: Number(figure.energy.energy_location_mg_per_kg),
    energy_market_mg_per_kg: Number(figure.energy.energy_market_mg_per_kg),
    breakdown_attached: figure.breakdown,
  };

  const payload = {
    number: opts.number,
    version: 1,
    site: opts.site,
    site_name: site.name,
    lots: [{ reference: lot.reference, mass_g: Number(lot.mass_g), grade: lot.grade, site: lot.site }],
    grade: lot.grade,
    specification_version: `SPEC-N6 v${spec.version}`,
    claim_type: lot.claim_type,
    content_bp: opts.contentBpValue,
    category_split: opts.categorySplit,
    period: period.id,
    carbon,
    primary_share_bp: Number(figure.primary_share_bp),
    scheme: SCHEME,
    registration: REGISTRATION,
    test_results: tests.map((t) => ({ property: t.property, method: t.method, value: t.value, unit: t.unit, uncertainty_bp: Number(t.uncertainty_bp) })),
    permitted_statement: statements.permitted_statement,
    prohibited_statement: statements.prohibited_statement,
    language: statements.language,
    signer: opts.signer,
    signer_name: opts.signerName,
    signed_at: opts.signedAt,
    recipient: opts.recipient,
    recipient_name: opts.recipientName,
    verification_url: `${VERIFY_BASE}/${opts.number}`,
    state: 'issued',
    provisional_factor: !!factor?.provisional,
    input_versions: figure.input_versions,
  };

  const conditions = [
    'lot_released', 'no_open_deviation', 'no_unreviewed_override', 'period_closed',
    'balance_invariant_holds', 'carbon_figure_complete', 'signer_holds_scope', 'signer_did_not_enter_data',
  ].map((condition) => ({ condition, satisfied: true, blocking_reference: null, detail: null }));

  // the document is rendered once and never re-rendered: an issued artefact is immutable
  const document = renderDocument(payload);

  await pool.query(
    `INSERT INTO certificate (number, seq_number, version, site, recipient, payload, conditions, document, state, signer, signed_at, withdrawn_on, withdrawn_by, withdrawal_reason)
     VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [opts.number, opts.seq, opts.site, opts.recipient, JSON.stringify(payload), JSON.stringify(conditions),
      document, opts.state, opts.signer, opts.signedAt,
      opts.withdrawnOn || null, opts.withdrawnOn ? opts.signer : null, opts.withdrawalReason || null]);

  await record({
    person: opts.signer, site: opts.site, object_kind: 'certificate', object_ref: opts.number,
    action: 'signed', at: opts.signedAt,
    content: { lot: opts.lotRef, recipient: opts.recipient, content_bp: opts.contentBpValue, claim_type: lot.claim_type, conditions },
  });
  if (opts.withdrawnOn) {
    await record({
      person: opts.signer, site: opts.site, object_kind: 'certificate', object_ref: opts.number,
      action: 'withdrawn', at: `${opts.withdrawnOn}T14:00:00Z`,
      content: { reason: opts.withdrawalReason, withdrawn_on: opts.withdrawnOn },
    });
  }
}

export { SCHEME, REGISTRATION, VERIFY_BASE };
