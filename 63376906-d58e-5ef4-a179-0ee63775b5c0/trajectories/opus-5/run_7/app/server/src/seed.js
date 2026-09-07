// The exact rows the product seeds on first start. Idempotent: a restart adds nothing.
import { pool, q, one } from './db.js';
import { append } from './record.js';
import { dryMass, creditFromDryMass } from './units.js';
import { statements, renderDocument } from './certificate.js';

const SCHEME = 'RCS-2026';
const REGISTRATION = 'REG-RAVEL-0042';
const VERIFY_BASE = 'https://ravel.example.com/verify';

async function alreadySeeded() {
  const r = await one('SELECT count(*)::int AS n FROM site');
  return r && r.n > 0;
}

export async function seed() {
  if (await alreadySeeded()) return { seeded: false };

  const acts = []; // every seeded act becomes a record entry, in the order it happened

  /* ------------------------------------------------------------- sites */
  const sites = [
    ['SITE-PILOT', 'Pilot', 'commissioned', 40000, 24000, 'certified'],
    ['SITE-DEMO', 'Demonstration', 'commissioned', 400000, 320000, 'certified'],
    ['SITE-COMM', 'Commercial', 'planned', 25000000, 26000000, 'not_certified']
  ];
  const BASIS = '8000 hours per year, 0.90 availability, 0.80 yield';
  for (const [reference, name, confidence, nameplate, contracted, certState] of sites) {
    await q(
      `INSERT INTO site (reference, name, confidence, nameplate_kg, contracted_kg, certification_state, basis, last_revised)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'2026-06-30')`,
      [reference, name, confidence, nameplate, contracted, certState, BASIS]
    );
    await q(`INSERT INTO certificate_sequence (site, next_number) VALUES ($1, 1) ON CONFLICT DO NOTHING`, [reference]);
    acts.push({ act: 'site_recorded', person: 'system', site: reference, object_kind: 'site', object_ref: reference, at: '2026-01-01T00:00:00Z', content: { name, confidence } });
  }
  for (const [ref] of sites) {
    await q(`INSERT INTO site_certification (site, state, effective_from, reason, recorded_by)
             VALUES ($1, $2, '2026-01-01', 'Seeded certification state', 'system')`,
      [ref, ref === 'SITE-COMM' ? 'not_certified' : 'certified']);
  }

  /* ------------------------------------------------------------ people */
  const users = [
    ['plant@example.com', 'Ines Bekele', 'plant_operator', ['SITE-DEMO', 'SITE-PILOT']],
    ['analyst@example.com', 'Tomas Vlach', 'lab_analyst', ['SITE-DEMO', 'SITE-PILOT']],
    ['quality@example.com', 'Marit Solheim', 'quality_manager', ['SITE-DEMO', 'SITE-PILOT']],
    ['claims@example.com', 'Osei Danquah', 'claims_manager', ['SITE-DEMO', 'SITE-PILOT']],
    ['signer@example.com', 'Hana Ferreira', 'certificate_signer', ['SITE-DEMO', 'SITE-PILOT']],
    ['signer2@example.com', 'Pavel Ostrowski', 'certificate_signer', ['SITE-PILOT']],
    ['auditor@example.com', 'Ruth Lindqvist', 'auditor', ['SITE-DEMO', 'SITE-PILOT']]
  ];
  let pid = 1;
  for (const [email, name, role, grantSites] of users) {
    const personId = `PER-${String(pid++).padStart(4, '0')}`;
    await q('INSERT INTO app_user (email, name, role, person_id) VALUES ($1,$2,$3,$4)', [email, name, role, personId]);
    for (const s of grantSites) {
      await q(`INSERT INTO access_grant (email, site, ends_on) VALUES ($1,$2,'2027-06-30')`, [email, s]);
      acts.push({ act: 'access_grant_recorded', person: 'system', person_id: personId, site: s, object_kind: 'access_grant', object_ref: email, at: '2026-01-01T00:00:00Z', content: { role, ends_on: '2027-06-30' } });
    }
  }

  /* ---------------------------------------------------------- parties */
  const parties = [
    ['COL-ALDER', 'collector', [['Alder Reclaim', '2026-01-01']]],
    ['COL-BRINE', 'collector', [['Brine Textile Recovery', '2026-01-01'], ['Brine Circular Materials', '2026-08-01']]],
    ['COL-CINDER', 'collector', [['Cinder Industrial Offcuts', '2026-01-01']]],
    ['CUS-HELIOS', 'customer', [['Helios Technical Fibres', '2026-01-01']]],
    ['CUS-VANTA', 'customer', [['Vanta Safety Systems', '2026-01-01']]]
  ];
  for (const [reference, kind, versions] of parties) {
    await q('INSERT INTO party (reference, kind) VALUES ($1,$2)', [reference, kind]);
    let prev = null;
    for (const [name, from] of versions) {
      const row = await one(
        'INSERT INTO party_version (party, name, effective_from) VALUES ($1,$2,$3) RETURNING id',
        [reference, name, from]
      );
      if (prev) await q('UPDATE party_version SET superseded_by = $1 WHERE id = $2', [row.id, prev]);
      prev = row.id;
      acts.push({ act: 'party_version_recorded', person: 'system', object_kind: 'party', object_ref: reference, at: `${from}T00:00:00Z`, content: { name, effective_from: from } });
    }
  }

  /* -------------------------------------------------------- collectors */
  const collectors = [
    ['COL-ALDER', 'PT', 'WCR-PT-4471', '2027-03-31', ['municipal_textile_bank', 'retail_take_back'], ['post_consumer_apparel'], 'member'],
    ['COL-BRINE', 'NL', 'WCR-NL-2208', '2027-01-31', ['sorting_facility'], ['post_consumer_apparel', 'carpet'], 'member'],
    ['COL-CINDER', 'FR', 'WCR-FR-6613', '2026-12-31', ['converter_offcut'], ['pre_consumer_offcut'], 'applicant']
  ];
  for (const [reference, country, registration, expiry, siteTypes, streams, schemeStatus] of collectors) {
    await q(
      `INSERT INTO collector (reference, country, registration, registration_expiry, collection_site_types, declared_streams, scheme_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [reference, country, registration, expiry, JSON.stringify(siteTypes), JSON.stringify(streams), schemeStatus]
    );
  }
  const approvals = [
    ['COL-ALDER', '2026-01-01', '2026-12-31', 'approved', null, null],
    ['COL-BRINE', '2026-01-01', '2026-06-30', 'approved', null, null],
    ['COL-CINDER', '2026-01-01', '2026-12-31', 'conditional', 'Sampling plan for coated streams to be agreed', '2026-10-31']
  ];
  for (const [collector, from, to, state, condition, closes] of approvals) {
    await q(
      `INSERT INTO approval_period (collector, state, valid_from, valid_to, condition, condition_closes_on, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,'quality@example.com')`,
      [collector, state, from, to, condition, closes]
    );
    acts.push({ act: 'collector_approved', person: 'quality@example.com', object_kind: 'collector', object_ref: collector, at: `${from}T09:00:00Z`, content: { state, valid_from: from, valid_to: to, condition } });
  }

  /* ----------------------------------------------------------- devices */
  for (const [reference, site, cal] of [['WB-DEMO-01', 'SITE-DEMO', '2026-05-01'], ['WB-DEMO-02', 'SITE-DEMO', '2025-02-01']]) {
    await q('INSERT INTO device (reference, site, calibrated_on) VALUES ($1,$2,$3)', [reference, site, cal]);
  }

  /* ----------------------------------------------------------- batches */
  const batches = [
    { reference: 'BATCH-1001', collector: 'COL-ALDER', category: 'post_consumer', received_on: '2026-02-10', net_g: 500000, moisture_bp: 1000, device: 'WB-DEMO-01', full: true,
      composition: { polymer: 'PA6', fraction_bp: 9200, basis: 'sampled', measured_fraction_bp: 9200 },
      contamination: { non_nylon_bp: 300, elastane_bp: 400, coatings: 'light', colour_load: 'mixed', foreign_matter: 'buttons and zips' } },
    { reference: 'BATCH-1002', collector: 'COL-ALDER', category: 'pre_consumer', received_on: '2026-02-12', net_g: 300000, moisture_bp: 0, device: 'WB-DEMO-01', full: true,
      composition: { polymer: 'PA6', fraction_bp: 9800, basis: 'sampled', measured_fraction_bp: 9800 },
      contamination: { non_nylon_bp: 100, elastane_bp: 0, coatings: 'none', colour_load: 'natural', foreign_matter: 'none' } },
    { reference: 'BATCH-1003', collector: 'COL-BRINE', category: 'post_consumer', received_on: '2026-07-05', net_g: 200000, moisture_bp: 500, device: 'WB-DEMO-01', full: true,
      composition: { polymer: 'PA6', fraction_bp: 8800, basis: 'sampled', measured_fraction_bp: 8800 },
      contamination: { non_nylon_bp: 700, elastane_bp: 250, coatings: 'coated', colour_load: 'dark', foreign_matter: 'backing' } },
    { reference: 'BATCH-1004', collector: 'COL-CINDER', category: 'pre_consumer', received_on: '2026-02-20', net_g: 120000, moisture_bp: 0, device: 'WB-DEMO-02', full: true,
      composition: { polymer: 'PA6', fraction_bp: 9900, basis: 'declared', measured_fraction_bp: 9100 },
      contamination: { non_nylon_bp: 200, elastane_bp: 0, coatings: 'none', colour_load: 'natural', foreign_matter: 'none' } },
    { reference: 'BATCH-1005', collector: 'COL-ALDER', category: 'post_consumer', received_on: '2026-03-02', net_g: 100000, moisture_bp: 0, device: 'WB-DEMO-01', full: false,
      composition: { polymer: 'PA6', fraction_bp: 9100, basis: 'declared' },
      contamination: { non_nylon_bp: 500, elastane_bp: 300, coatings: 'light', colour_load: 'mixed', foreign_matter: 'labels' } }
  ];
  const CUSTODY_KINDS = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
  for (const b of batches) {
    await q(
      `INSERT INTO batch (reference, collector, site, grade, category, gross_g, tare_g, net_g, moisture_bp,
        moisture_method, device, received_on, composition, contamination, accepted_g, event_at, effective_on, booked_by)
       VALUES ($1,$2,'SITE-DEMO','N6',$3,$4,$5,$6,$7,'ISO 15512',$8,$9,$10,$11,$6,$12,$9,'plant@example.com')`,
      [b.reference, b.collector, b.category, b.net_g + 20000, 20000, b.net_g, b.moisture_bp, b.device,
        b.received_on, JSON.stringify(b.composition), JSON.stringify(b.contamination), `${b.received_on}T08:00:00Z`]
    );
    // BATCH-1005 is the one batch whose custody list omits a link: transport.
    const kinds = b.full ? CUSTODY_KINDS : CUSTODY_KINDS.filter((k) => k !== 'transport');
    kinds.forEach(async (kind, i) => {});
    let ordinal = 0;
    for (const kind of kinds) {
      await q(
        `INSERT INTO custody_link (batch, ordinal, kind, link_date, party) VALUES ($1,$2,$3,$4,$5)`,
        [b.reference, ordinal++, kind, b.received_on, kind === 'collector' || kind === 'collection_site' ? b.collector : kind === 'acceptance' || kind === 'weighing' || kind === 'arrival' ? 'SITE-DEMO' : 'Haulier']
      );
    }
    const dev = await one('SELECT calibrated_on FROM device WHERE reference = $1', [b.device]);
    const received = new Date(b.received_on + 'T00:00:00Z');
    const cal = new Date(dev.calibrated_on.toISOString().slice(0, 10) + 'T00:00:00Z');
    const twelve = new Date(cal); twelve.setUTCMonth(twelve.getUTCMonth() + 12);
    await q(
      `INSERT INTO weighing (reference, batch, device, gross_g, tare_g, net_g, calibration_state, weighed_at)
       VALUES ($1,$2,$3,$4,20000,$5,$6,$7)`,
      [`WGH-${b.reference.slice(6)}`, b.reference, b.device, b.net_g + 20000, b.net_g,
        received > twelve ? 'lapsed' : 'valid', `${b.received_on}T08:00:00Z`]
    );
    acts.push({ act: 'batch_booked_in', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'batch', object_ref: b.reference, at: `${b.received_on}T08:00:00Z`, content: { category: b.category, net_g: b.net_g, dry_mass_g: dryMass(b.net_g, b.moisture_bp) } });
    acts.push({ act: 'weighing_recorded', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'weighing', object_ref: `WGH-${b.reference.slice(6)}`, at: `${b.received_on}T08:05:00Z`, content: { device: b.device, calibration_state: received > twelve ? 'lapsed' : 'valid', net_g: b.net_g } });
  }

  // A measured composition departing from the declaration by more than 500 bp is a finding
  // against the collector, not against the plant.
  await q(
    `INSERT INTO finding (reference, collector, batch, description, departure_bp, raised_on, due_on, state)
     VALUES ('FND-0001','COL-CINDER','BATCH-1004',
       'Measured PA6 fraction departs from the declaration by 800 basis points', 800, '2026-02-22','2026-05-22','open')`
  );
  acts.push({ act: 'finding_raised', person: 'quality@example.com', object_kind: 'finding', object_ref: 'FND-0001', at: '2026-02-22T10:00:00Z', content: { collector: 'COL-CINDER', departure_bp: 800 } });

  /* ---------------------------------------------------- recipe versions */
  const recipes = [
    ['RCP-DISS', 2, 'dissolution', { temperature_c: 165, pressure_bar: 3 }, { temperature_c: [160, 170], pressure_bar: [2, 4] }],
    ['RCP-DEPO', 4, 'depolymerisation', { temperature_c: 240, pressure_bar: 6 }, { temperature_c: [235, 245], pressure_bar: [5, 7] }],
    ['RCP-PURI', 1, 'purification', { temperature_c: 120, pressure_bar: 1 }, { temperature_c: [115, 125], pressure_bar: [1, 2] }],
    ['RCP-REPO', 3, 'repolymerisation', { temperature_c: 255, pressure_bar: 8 }, { temperature_c: [250, 260], pressure_bar: [7, 9] }]
  ];
  for (const [reference, version, runType, setPoints, tolerances] of recipes) {
    await q(
      `INSERT INTO recipe_version (reference, version, run_type, set_points, tolerances, reagents, residence_time_minutes, released_by, released_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'quality@example.com','2026-01-05')`,
      [reference, version, runType, JSON.stringify(setPoints), JSON.stringify(tolerances),
        JSON.stringify([{ reagent: 'green solvent', ratio_bp: 3000 }]), 90]
    );
  }

  /* -------------------------------------------------------------- runs */
  const runs = [
    { reference: 'RUN-D-0001', run_type: 'dissolution', recipe: 'RCP-DISS-2', started: '2026-03-04T06:00:00Z', closed: '2026-03-04T22:00:00Z', losses: 120000, actual: { temperature_c: 165, pressure_bar: 3 }, tol: true,
      consumes: [['batch', 'BATCH-1001', 300000], ['batch', 'BATCH-1002', 300000]], outputs: [['OUT-D-0001', 'intermediate', 480000, null]] },
    { reference: 'RUN-D-0002', run_type: 'dissolution', recipe: 'RCP-DISS-2', started: '2026-03-05T06:00:00Z', closed: '2026-03-05T22:00:00Z', losses: 60000, actual: { temperature_c: 172, pressure_bar: 3 }, tol: false,
      consumes: [['batch', 'BATCH-1003', 190000], ['batch', 'BATCH-1004', 120000]], outputs: [['OUT-D-0002', 'intermediate', 250000, null]] },
    { reference: 'RUN-D-0003', run_type: 'dissolution', recipe: 'RCP-DISS-2', started: '2026-03-06T06:00:00Z', closed: '2026-03-06T18:00:00Z', losses: 30000, actual: { temperature_c: 164, pressure_bar: 3 }, tol: true,
      consumes: [['batch', 'BATCH-1001', 150000]], outputs: [['OUT-D-0003', 'intermediate', 120000, null]] },
    { reference: 'RUN-Y-0001', run_type: 'depolymerisation', recipe: 'RCP-DEPO-4', started: '2026-03-08T06:00:00Z', closed: '2026-03-09T02:00:00Z', losses: 50000, actual: { temperature_c: 241, pressure_bar: 6 }, tol: true,
      consumes: [['output', 'OUT-D-0001', 480000], ['output', 'OUT-D-0002', 250000], ['output', 'OUT-D-0003', 120000]], outputs: [['OUT-Y-0001', 'intermediate', 800000, null]] },
    { reference: 'RUN-U-0001', run_type: 'purification', recipe: 'RCP-PURI-1', started: '2026-03-10T06:00:00Z', closed: '2026-03-10T20:00:00Z', losses: 40000, actual: { temperature_c: 121, pressure_bar: 1 }, tol: true,
      consumes: [['output', 'OUT-Y-0001', 800000]], outputs: [['OUT-U-0001', 'intermediate', 720000, null], ['OUT-U-0002', 'byproduct', 40000, 'sold']] },
    { reference: 'RUN-R-0001', run_type: 'repolymerisation', recipe: 'RCP-REPO-3', started: '2026-03-12T06:00:00Z', closed: '2026-03-13T02:00:00Z', losses: 20000, actual: { temperature_c: 256, pressure_bar: 8 }, tol: true,
      consumes: [['output', 'OUT-U-0001', 720000]], outputs: [['LOT-N6-0001', 'lot', 400000, null], ['LOT-N6-0002', 'lot', 300000, null]] }
  ];
  for (const r of runs) {
    const day = r.started.slice(0, 10);
    await q(
      `INSERT INTO run (reference, run_type, site, equipment, recipe_version, operator, started_at, closed_at,
        state, losses_g, actual_set_points, within_tolerance, event_at, effective_on)
       VALUES ($1,$2,'SITE-DEMO',$3,$4,'plant@example.com',$5,$6,'closed',$7,$8,$9,$5,$10)`,
      [r.reference, r.run_type, `EQ-${r.run_type.slice(0, 4).toUpperCase()}-1`, r.recipe, r.started, r.closed,
        r.losses, JSON.stringify(r.actual), r.tol, day]
    );
    acts.push({ act: 'run_started', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'run', object_ref: r.reference, at: r.started, content: { run_type: r.run_type, recipe_version: r.recipe } });
    let n = 1;
    for (const [kind, ref, mass] of r.consumes) {
      const cref = `CON-${r.reference.slice(4)}-${n++}`;
      await q(
        `INSERT INTO consumption (reference, run, input_kind, input_ref, mass_g, event_at, effective_on, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'plant@example.com')`,
        [cref, r.reference, kind, ref, mass, r.started, day]
      );
      acts.push({ act: 'consumption_recorded', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'consumption', object_ref: cref, at: r.started, content: { run: r.reference, input: ref, mass_g: mass } });
    }
    for (const [oref, kind, mass, disposition] of r.outputs) {
      await q(
        `INSERT INTO output (reference, run, kind, mass_g, disposition, allocation_basis, event_at, effective_on)
         VALUES ($1,$2,$3,$4,$5,'mass',$6,$7)`,
        [oref, r.reference, kind, mass, disposition, r.closed, day]
      );
      acts.push({ act: 'output_recorded', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'output', object_ref: oref, at: r.closed, content: { run: r.reference, kind, mass_g: mass, disposition } });
    }
    acts.push({ act: 'run_closed', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'run', object_ref: r.reference, at: r.closed, content: { losses_g: r.losses, within_tolerance: r.tol } });
  }

  /* --------------------------------------------------------------- lots */
  const lots = [
    ['LOT-N6-0001', 'N6', 'SITE-DEMO', 400000, 'released', 'mass_balance', 'RUN-R-0001', '2026-03-13'],
    ['LOT-N6-0002', 'N6', 'SITE-DEMO', 300000, 'quarantined', 'mass_balance', 'RUN-R-0001', '2026-03-13'],
    ['LOT-N6-0003', 'N6', 'SITE-PILOT', 200000, 'released', 'mass_balance', null, '2026-02-20']
  ];
  for (const [reference, grade, site, mass, disposition, claimType, run, produced] of lots) {
    await q(
      `INSERT INTO lot (reference, grade, site, mass_g, disposition, claim_type, run, specification_version,
        produced_on, dispositioned_by, dispositioned_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,3,$8,'quality@example.com',$9)`,
      [reference, grade, site, mass, disposition, claimType, run, produced, `${produced}T12:00:00Z`]
    );
    acts.push({ act: 'lot_dispositioned', person: 'quality@example.com', site, object_kind: 'lot', object_ref: reference, at: `${produced}T12:00:00Z`, content: { disposition } });
  }

  /* ------------------------------------------------------- test results */
  await q(
    `INSERT INTO test_result (reference, subject_kind, subject_ref, property, method, instrument, analyst, value, unit, uncertainty_bp, entered_by, entered_at)
     VALUES ('TR-0001','lot','LOT-N6-0001','relative_viscosity','ISO 307','VISC-2','analyst@example.com','2.44','ratio',150,'analyst@example.com','2026-03-14T09:00:00Z'),
            ('TR-0002','lot','LOT-N6-0001','moisture','ISO 15512','KF-1','analyst@example.com','0.06','percent',200,'analyst@example.com','2026-03-14T09:20:00Z'),
            ('TR-0003','lot','LOT-N6-0003','relative_viscosity','ISO 307','VISC-2','analyst@example.com','2.41','ratio',150,'analyst@example.com','2026-02-21T09:00:00Z'),
            ('TR-0004','lot','LOT-N6-0003','moisture','ISO 15512','KF-1','analyst@example.com','0.08','percent',200,'analyst@example.com','2026-02-21T09:10:00Z')`
  );
  for (const t of ['TR-0001', 'TR-0002', 'TR-0003', 'TR-0004']) {
    acts.push({ act: 'test_result_entered', person: 'analyst@example.com', object_kind: 'test_result', object_ref: t, at: '2026-03-14T09:00:00Z', content: { entered_by: 'analyst@example.com' } });
  }

  /* --------------------------------------------- deviations and overrides */
  await q(
    `INSERT INTO deviation (reference, state, runs, lots, description, raised_by, raised_at)
     VALUES ('DEV-0001','open','["RUN-U-0001"]','["LOT-N6-0002"]',
       'Purification residence time ran short and the lot is held pending investigation','quality@example.com','2026-03-11T08:00:00Z')`
  );
  await q(
    `INSERT INTO deviation (reference, state, runs, lots, description, outcome, raised_by, raised_at, closed_by, closed_at)
     VALUES ('DEV-0002','closed','["RUN-D-0002"]','[]',
       'Dissolution temperature exceeded the recipe tolerance','cause_not_established','quality@example.com','2026-03-05T23:00:00Z','quality@example.com','2026-03-20T10:00:00Z')`
  );
  acts.push({ act: 'deviation_raised', person: 'quality@example.com', object_kind: 'deviation', object_ref: 'DEV-0001', at: '2026-03-11T08:00:00Z', content: { runs: ['RUN-U-0001'], lots: ['LOT-N6-0002'] } });
  acts.push({ act: 'deviation_raised', person: 'quality@example.com', object_kind: 'deviation', object_ref: 'DEV-0002', at: '2026-03-05T23:00:00Z', content: { runs: ['RUN-D-0002'] } });
  acts.push({ act: 'deviation_closed', person: 'quality@example.com', object_kind: 'deviation', object_ref: 'DEV-0002', at: '2026-03-20T10:00:00Z', content: { outcome: 'cause_not_established' } });

  await q(
    `INSERT INTO separation_override (reference, separation, reason, lot, authorised_by, reviewed, created_by, created_at)
     VALUES ('OVR-0001','analyst_not_dispositioner',
       'Night shift analyst dispositioned the lot because no second qualified person was on site',
       'LOT-N6-0001','quality@example.com',false,'quality@example.com','2026-03-18T22:00:00Z')`
  );
  acts.push({ act: 'override_recorded', person: 'quality@example.com', object_kind: 'override', object_ref: 'OVR-0001', at: '2026-03-18T22:00:00Z', content: { separation: 'analyst_not_dispositioner', lot: 'LOT-N6-0001' } });

  /* ------------------------------------------------- conversion factors */
  await q(
    `INSERT INTO conversion_factor (reference, site, version, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on)
     VALUES ('CF-DEMO-1','SITE-DEMO',1,8000,'2026-01-01','2026-03-31',1000000,800000,false,'claims@example.com','2026-04-01'),
            ('CF-PILOT-1','SITE-PILOT',1,7500,NULL,NULL,0,0,true,'claims@example.com','2026-01-10')`
  );
  acts.push({ act: 'conversion_factor_published', person: 'claims@example.com', site: 'SITE-DEMO', object_kind: 'conversion_factor', object_ref: 'CF-DEMO-1', at: '2026-04-01T09:00:00Z', content: { factor_bp: 8000, derived_in_g: 1000000, derived_out_g: 800000 } });
  acts.push({ act: 'conversion_factor_published', person: 'claims@example.com', site: 'SITE-PILOT', object_kind: 'conversion_factor', object_ref: 'CF-PILOT-1', at: '2026-01-10T09:00:00Z', content: { factor_bp: 7500, provisional: true } });

  /* -------------------------------------------------- balance periods */
  const periods = [
    ['BP-DEMO-N6-2025H2', 'SITE-DEMO', 'N6', '2025-07-01', '2025-12-31', 'closed', 2000, '2026-01-15', '2026-01-10'],
    ['BP-DEMO-N6-2026H1', 'SITE-DEMO', 'N6', '2026-01-01', '2026-06-30', 'open', 2000, null, null],
    ['BP-PILOT-N6-2026H1', 'SITE-PILOT', 'N6', '2026-01-01', '2026-06-30', 'open', 2000, null, null]
  ];
  for (const [id, site, grade, from, to, state, limit, closedOn, cutOff] of periods) {
    await q(
      `INSERT INTO balance_period (id, site, grade, period_from, period_to, state, carry_over_limit_bp, allocation_basis, closed_on, cut_off, closed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'mass',$8,$9,$10)`,
      [id, site, grade, from, to, state, limit, closedOn, cutOff, state === 'closed' ? 'claims@example.com' : null]
    );
  }
  acts.push({ act: 'balance_period_closed', person: 'claims@example.com', site: 'SITE-DEMO', object_kind: 'balance_period', object_ref: 'BP-DEMO-N6-2025H2', at: '2026-01-15T17:00:00Z', content: { closed_on: '2026-01-15', cut_off: '2026-01-10' } });

  // Credits enter when a claimable batch is consumed: dry mass times the site's factor.
  const creditRows = [
    ['BATCH-1001', 'post_consumer', 450000, true, '2026-03-04'],
    ['BATCH-1002', 'pre_consumer', 300000, true, '2026-03-04'],
    ['BATCH-1003', 'non_claimable', 190000, false, '2026-03-05'],
    ['BATCH-1004', 'pre_consumer', 120000, true, '2026-03-05']
  ];
  for (const [batch, category, dry, claimable, on] of creditRows) {
    const credit = claimable ? creditFromDryMass(dry, 8000) : 0;
    await q(
      `INSERT INTO credit_movement (period, direction, category, mass_g, source_kind, source_ref, fresh_credit, derivation, event_at, effective_on, created_by)
       VALUES ('BP-DEMO-N6-2026H1','in',$1,$2,'consumption',$3,true,$4,$5,$6,'plant@example.com')`,
      [category, credit, batch,
        JSON.stringify({ batch, dry_mass_g: dry, factor: 'CF-DEMO-1', factor_bp: 8000, rule: `dry_mass_consumed_g ${dry} * factor_bp 8000 / 10000, floored` }),
        `${on}T06:00:00Z`, on]
    );
  }
  // The pilot period holds the credit behind LOT-N6-0003 at 7500 basis points.
  await q(
    `INSERT INTO credit_movement (period, direction, category, mass_g, source_kind, source_ref, fresh_credit, derivation, event_at, effective_on, created_by)
     VALUES ('BP-PILOT-N6-2026H1','in','post_consumer',250000,'consumption','PILOT-FEED',true,$1,'2026-02-18T06:00:00Z','2026-02-18','plant@example.com')`,
    [JSON.stringify({ dry_mass_g: 333333, factor: 'CF-PILOT-1', factor_bp: 7500, rule: 'dry_mass_consumed_g 333333 * factor_bp 7500 / 10000, floored' })]
  );
  await q(
    `INSERT INTO credit_movement (period, direction, category, mass_g, lot, source_kind, source_ref, fresh_credit, derivation, event_at, effective_on, created_by)
     VALUES ('BP-PILOT-N6-2026H1','out','post_consumer',150000,'LOT-N6-0003','allocation','LOT-N6-0003',true,$1,'2026-02-20T12:00:00Z','2026-02-20','claims@example.com')`,
    [JSON.stringify({ lot: 'LOT-N6-0003', mass_g: 150000, rule: 'content_bp = credit_attached_g 150000 * 10000 / lot_mass_g 200000, floored' })]
  );
  acts.push({ act: 'claim_allocated', person: 'claims@example.com', site: 'SITE-PILOT', object_kind: 'lot', object_ref: 'LOT-N6-0003', at: '2026-02-20T12:00:00Z', content: { mass_g: 150000, category: 'post_consumer' } });

  /* ------------------------------------------------------- the transfer */
  await q(
    `INSERT INTO transfer (reference, from_period, to_period, category, mass_g, moved_on, recorded_by)
     VALUES ('TRF-0001','BP-PILOT-N6-2026H1','BP-DEMO-N6-2026H1','post_consumer',50000,'2026-05-12','claims@example.com')`
  );
  await q(
    `INSERT INTO credit_movement (period, direction, category, mass_g, source_kind, source_ref, movement, origin_site, fresh_credit, derivation, event_at, effective_on, created_by)
     VALUES ('BP-DEMO-N6-2026H1','transfer_in','post_consumer',50000,'transfer','TRF-0001','TRF-0001','SITE-PILOT',false,$1,'2026-05-12T10:00:00Z','2026-05-12','claims@example.com')`,
    [JSON.stringify({ transfer: 'TRF-0001', rule: 'inbound credit, never a fresh credit; total credit across the two periods is unchanged' })]
  );
  await q(
    `INSERT INTO credit_movement (period, direction, category, mass_g, source_kind, source_ref, movement, origin_site, fresh_credit, derivation, event_at, effective_on, created_by)
     VALUES ('BP-PILOT-N6-2026H1','transfer_out','post_consumer',50000,'transfer','TRF-0001','TRF-0001','SITE-PILOT',false,$1,'2026-05-12T10:00:00Z','2026-05-12','claims@example.com')`,
    [JSON.stringify({ transfer: 'TRF-0001', rule: 'credit leaves this period for BP-DEMO-N6-2026H1' })]
  );
  acts.push({ act: 'transfer_recorded', person: 'claims@example.com', object_kind: 'transfer', object_ref: 'TRF-0001', at: '2026-05-12T10:00:00Z', content: { mass_g: 50000, from: 'BP-PILOT-N6-2026H1', to: 'BP-DEMO-N6-2026H1' } });

  /* ------------------------------------------------------------ carbon */
  const factors = [
    { line: 'grid_electricity', source: 'EcoBase 2025', year: 2025, value_mg_per_kwh: 231000 },
    { line: 'process_solvent', source: 'Supplier declaration', year: 2026, value_mg_per_kg: 1180000 },
    { line: 'road_freight', source: 'EcoBase 2025', year: 2025, value_mg_per_tkm: 105000 }
  ];
  const rules = [
    { rule: 'primary_share_threshold_bp', value: 5000 },
    { rule: 'supplier_specific_factors_preferred_over_secondary', value: true }
  ];
  await q(
    `INSERT INTO carbon_method (id, version, standard, functional_unit, boundary, allocation_basis, reviewer, published_on, published_by, data_quality_rules, emission_factors, primary_threshold_bp, superseded)
     VALUES ('CM-PA6',1,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2025-09-01','quality@example.com',$1,$2,5000,true),
            ('CM-PA6',2,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2026-01-20','quality@example.com',$1,$2,5000,false)`,
    [JSON.stringify(rules), JSON.stringify(factors)]
  );
  acts.push({ act: 'carbon_method_published', person: 'quality@example.com', object_kind: 'carbon_method', object_ref: 'CM-PA6 v2', at: '2026-01-20T09:00:00Z', content: { standard: 'ISO 14067', boundary: 'cradle-to-gate' } });

  const breakdown = [
    { line: 'collection_and_transport', mg_per_kg: 310000, tag: 'primary' },
    { line: 'process_energy', mg_per_kg: 1850000, tag: 'primary' },
    { line: 'reagents', mg_per_kg: 1180000, tag: 'supplier_specific' },
    { line: 'water_and_effluent', mg_per_kg: 240000, tag: 'primary' },
    { line: 'waste_and_residues', mg_per_kg: 330000, tag: 'secondary' },
    { line: 'outbound_transport', mg_per_kg: 410000, tag: 'secondary' },
    { line: 'byproduct_credit', mg_per_kg: -60000, tag: 'primary' }
  ];
  const comparator = { material: 'virgin PA6', dataset: 'EcoBase 2025', dataset_year: 2025, region: 'EU-27' };
  const energy = {
    energy_location_mg_per_kg: 1850000, energy_market_mg_per_kg: 620000,
    metered_kwh: 300000, retired_kwh: 250000, unmatched_kwh: 50000
  };
  await q(
    `INSERT INTO carbon_figure (id, lot, version, method_id, method_version, value_mg_per_kg, uncertainty_bp,
       primary_share_bp, boundary, comparator, breakdown, energy, input_versions, computed_by, computed_on)
     VALUES ('CF-LOT-0001','LOT-N6-0001',1,'CM-PA6',2,4260000,1200,6500,'cradle-to-gate',$1,$2,$3,$4,'claims@example.com','2026-03-15')`,
    [JSON.stringify(comparator), JSON.stringify(breakdown), JSON.stringify(energy),
      JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1', specification: 'SPEC-N6 v3', emission_factor_set: 'EcoBase 2025' })]
  );
  const pilotBreakdown = [
    { line: 'collection_and_transport', mg_per_kg: 330000, tag: 'primary' },
    { line: 'process_energy', mg_per_kg: 1980000, tag: 'primary' },
    { line: 'reagents', mg_per_kg: 1210000, tag: 'supplier_specific' },
    { line: 'water_and_effluent', mg_per_kg: 260000, tag: 'primary' },
    { line: 'waste_and_residues', mg_per_kg: 350000, tag: 'secondary' },
    { line: 'outbound_transport', mg_per_kg: 430000, tag: 'secondary' }
  ];
  await q(
    `INSERT INTO carbon_figure (id, lot, version, method_id, method_version, value_mg_per_kg, uncertainty_bp,
       primary_share_bp, boundary, comparator, breakdown, energy, input_versions, computed_by, computed_on)
     VALUES ('CF-LOT-0003','LOT-N6-0003',1,'CM-PA6',2,4560000,1400,5600,'cradle-to-gate',$1,$2,$3,$4,'claims@example.com','2026-02-25')`,
    [JSON.stringify(comparator), JSON.stringify(pilotBreakdown),
      JSON.stringify({ energy_location_mg_per_kg: 1980000, energy_market_mg_per_kg: 740000, metered_kwh: 90000, retired_kwh: 0, unmatched_kwh: 90000 }),
      JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-PILOT-1', specification: 'SPEC-N6 v3', emission_factor_set: 'EcoBase 2025' })]
  );
  acts.push({ act: 'carbon_figure_computed', person: 'claims@example.com', object_kind: 'carbon_figure', object_ref: 'CF-LOT-0001', at: '2026-03-15T11:00:00Z', content: { value_mg_per_kg: 4260000, method_version: 'CM-PA6 v2' } });

  await q(
    `INSERT INTO energy_instrument (reference, quantity_kwh, vintage, region, state, applied_period, applied_at)
     VALUES ('EAC-2026-0007',250000,2026,'EU-27','retired','BP-DEMO-N6-2026H1','2026-04-02T10:00:00Z'),
            ('EAC-2025-0031',100000,2025,'EU-27','held',NULL,NULL)`
  );

  /* ---------------------------------------- specifications and customers */
  const specProps = [
    { property: 'relative_viscosity', method: 'ISO 307', limit: '2.40', unit: 'ratio', basis: 'guaranteed' },
    { property: 'moisture', method: 'ISO 15512', limit: '0.10', unit: 'percent', basis: 'guaranteed' },
    { property: 'yellowness_index', method: 'ASTM E313', limit: '8.0', unit: 'index', basis: 'typical' },
    { property: 'ash_content', method: 'ISO 3451-1', limit: '0.30', unit: 'percent', basis: 'informational' }
  ];
  const virgin = { reference: 'virgin PA6 at relative viscosity 2.42', source: 'EcoBase 2025', date: '2025-11-30' };
  await q(
    `INSERT INTO specification (grade, version, issued_on, properties, virgin_reference, superseded)
     VALUES ('SPEC-N6',2,'2025-08-01',$1,$2,true), ('SPEC-N6',3,'2026-02-01',$1,$2,false)`,
    [JSON.stringify(specProps), JSON.stringify(virgin)]
  );
  await q(
    `INSERT INTO customer (reference, contact, holds_specification_grade, holds_specification_version, application, industry, language)
     VALUES ('CUS-HELIOS','helios@example.com','SPEC-N6',3,'technical apparel yarn','textiles','en'),
            ('CUS-VANTA','vanta@example.com','SPEC-N6',2,'airbag fabric','automotive','en')`
  );
  await q(
    `INSERT INTO specification_issue (grade, version, customer, issued_on, issued_by)
     VALUES ('SPEC-N6',3,'CUS-HELIOS','2026-02-01','quality@example.com'),
            ('SPEC-N6',2,'CUS-VANTA','2025-08-01','quality@example.com')`
  );
  await q(
    `INSERT INTO conformance (customer, application, specification_version, trials, started_on, completed_on, outcome)
     VALUES ('CUS-HELIOS','technical apparel yarn',3,$1,'2026-02-05','2026-03-01','passed'),
            ('CUS-VANTA','airbag fabric',2,$2,'2025-09-01','2025-11-15','passed')`,
    [JSON.stringify([{ trial: 'spinning line trial', date: '2026-02-20', outcome: 'passed' }]),
      JSON.stringify([{ trial: 'weave and deployment trial', date: '2025-10-10', outcome: 'passed' }])]
  );
  acts.push({ act: 'specification_issued', person: 'quality@example.com', object_kind: 'specification', object_ref: 'SPEC-N6 v3', at: '2026-02-01T09:00:00Z', content: { customer: 'CUS-HELIOS' } });

  /* --------------------------------------------------------- contracts */
  await q(
    `INSERT INTO contract (id, recipient, site, period, committed_kg, floor_bp, delivered_kg, shortfall_consequence)
     VALUES ('CON-HELIOS-1','CUS-HELIOS','SITE-DEMO','2026-H1',200,5000,0,'a replacement volume from the following period at the contracted price'),
            ('CON-VANTA-1','CUS-VANTA','SITE-COMM','2029-H1',1000,3000,0,'a make-good volume in the following period')`
  );

  /* ------------------------------------------------------ certificates */
  const helioName = 'Helios Technical Fibres';
  const vantaName = 'Vanta Safety Systems';
  const pilotCarbon = {
    figure_id: 'CF-LOT-0003', value_mg_per_kg: 4560000, boundary: 'cradle-to-gate',
    method_version: 'CM-PA6 v2', uncertainty_bp: 1400, comparator,
    energy_location_mg_per_kg: 1980000, energy_market_mg_per_kg: 740000,
    metered_kwh: 90000, retired_kwh: 0, unmatched_kwh: 90000
  };
  const pilotConditions = [
    ['lot_released', true], ['no_open_deviation', true], ['no_unreviewed_override', true],
    ['period_closed', true], ['balance_invariant_holds', true], ['carbon_figure_complete', true],
    ['signer_holds_scope', true], ['signer_did_not_enter_data', true]
  ].map(([condition, satisfied]) => ({ condition, satisfied, blocking_reference: null, detail: 'Satisfied at the moment of signing.' }));

  const pilotTests = [
    { property: 'relative_viscosity', method: 'ISO 307', value: '2.41', unit: 'ratio', uncertainty_bp: 150 },
    { property: 'moisture', method: 'ISO 15512', value: '0.08', unit: 'percent', uncertainty_bp: 200 }
  ];

  const certs = [
    { number: 'CERT-PILOT-000001', recipient: 'CUS-HELIOS', recipient_name: helioName, signed_at: '2026-03-02T10:00:00Z', state: 'withdrawn',
      withdrawal: { reason: 'A collector category was corrected after acceptance', withdrawn_by: 'signer2@example.com', withdrawn_on: '2026-04-18' } },
    { number: 'CERT-PILOT-000002', recipient: 'CUS-VANTA', recipient_name: vantaName, signed_at: '2026-03-20T10:00:00Z', state: 'issued', withdrawal: null }
  ];
  for (const c of certs) {
    const category_split = { post_consumer: 150000, pre_consumer: 0 };
    const base = {
      number: c.number, version: 1, site: 'SITE-PILOT',
      lots: [{ reference: 'LOT-N6-0003', mass_g: 200000 }],
      recipient: c.recipient, recipient_name: c.recipient_name, grade: 'N6', specification_version: 3,
      claim_type: 'mass_balance', content_bp: 7500, category_split, period: 'BP-PILOT-N6-2026H1',
      carbon: pilotCarbon, primary_share_bp: 5600, scheme: SCHEME, registration: REGISTRATION,
      test_results: pilotTests, signer: 'signer2@example.com', signer_name: 'Pavel Ostrowski',
      signed_at: c.signed_at, verification_url: `${VERIFY_BASE}/${c.number}`, state: c.state,
      provisional_factor: true, withdrawal: c.withdrawal
    };
    const st = statements({ claim_type: 'mass_balance', content_bp: 7500, category_split, grade: 'N6', language: 'en' });
    const full = { ...base, ...st };
    const document = renderDocument(full);
    await q(
      `INSERT INTO certificate (number, version, site, lots, recipient, recipient_name, grade, specification_version,
        claim_type, content_bp, category_split, period, carbon, primary_share_bp, scheme, registration, test_results,
        permitted_statement, prohibited_statement, signer, signer_name, signed_at, verification_url, state,
        provisional_factor, conditions, input_versions, document, withdrawal)
       VALUES ($1,1,'SITE-PILOT',$2,$3,$4,'N6',3,'mass_balance',7500,$5,'BP-PILOT-N6-2026H1',$6,5600,$7,$8,$9,$10,$11,
         'signer2@example.com','Pavel Ostrowski',$12,$13,$14,true,$15,$16,$17,$18)`,
      [c.number, JSON.stringify(base.lots), c.recipient, c.recipient_name, JSON.stringify(category_split),
        JSON.stringify(pilotCarbon), SCHEME, REGISTRATION, JSON.stringify(pilotTests),
        st.permitted_statement, st.prohibited_statement, c.signed_at, `${VERIFY_BASE}/${c.number}`, c.state,
        JSON.stringify(pilotConditions),
        JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-PILOT-1', specification: 'SPEC-N6 v3', emission_factor_set: 'EcoBase 2025' }),
        document, c.withdrawal ? JSON.stringify(c.withdrawal) : null]
    );
    acts.push({ act: 'certificate_signed', person: 'signer2@example.com', site: 'SITE-PILOT', object_kind: 'certificate', object_ref: c.number, at: c.signed_at, content: { recipient: c.recipient, content_bp: 7500, claim_type: 'mass_balance' } });
    if (c.withdrawal) {
      acts.push({ act: 'certificate_withdrawn', person: 'signer2@example.com', site: 'SITE-PILOT', object_kind: 'certificate', object_ref: c.number, at: `${c.withdrawal.withdrawn_on}T10:00:00Z`, content: { reason: c.withdrawal.reason } });
    }
  }
  await q(`UPDATE certificate_sequence SET next_number = 3 WHERE site = 'SITE-PILOT'`);

  /* --------------------------------------------------- inbound records */
  const inbound = [
    ['INB-0001', 'weighbridge', '2026-02-20T06:14:00Z', { ticket: 'WB-DEMO-02-118829', batch: 'BATCH-1004', device: 'WB-DEMO-02', gross_g: 140000, tare_g: 20000, net_g: 120000, calibration: { calibrated_on: '2025-02-01', state: 'lapsed' } }],
    ['INB-0002', 'control_system', '2026-03-04T22:41:00Z', { run: 'RUN-D-0001', set_points: { temperature_c: 165, pressure_bar: 3 }, achieved: { temperature_c: 165, pressure_bar: 3 }, residence_minutes: 92 }],
    ['INB-0003', 'laboratory', '2026-03-06T09:02:00Z', { lot: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ISO 307', value: '2.44', unit: 'ratio', instrument: 'VISC-2' }]
  ];
  for (const [reference, source, receivedAt, payload] of inbound) {
    const verbatim = JSON.stringify(payload);
    await q(
      `INSERT INTO inbound_record (reference, source, received_at, payload, payload_verbatim) VALUES ($1,$2,$3,$4,$5)`,
      [reference, source, receivedAt, verbatim, verbatim]
    );
    acts.push({ act: 'inbound_record_stored', person: 'system', object_kind: 'inbound_record', object_ref: reference, at: receivedAt, content: { source, payload_verbatim: verbatim } });
  }

  /* ------------------------------------------------------- legal hold */
  // The seeded legal hold stands on the record entry for the signing of CERT-PILOT-000001.

  /* ------------------------------------------------------ public site */
  await q(
    `INSERT INTO position (id, title, location, department, contract_type, closes_on)
     VALUES ('POS-0001','Process Engineer','Lyon, France','Operations','Permanent','2026-11-30')`
  );
  await q(
    `INSERT INTO news_item (id, title, tag, item_date, outlet, link, language, coverage) VALUES
      ('NEWS-0001','Series A closes at 40 million euros','funding','2026-01-22','Materials Weekly','https://example.com/news/series-a','en',$1),
      ('NEWS-0002','Offtake agreement signed for demonstration output','partnership','2026-03-11','Fibre Report','https://example.com/news/offtake','en',$2),
      ('NEWS-0003','Depolymerisation yield published','technical','2026-05-06','Chimie Circulaire','https://example.com/news/rendement','fr',$3)`,
    [JSON.stringify([{ outlet: 'Materials Weekly', link: 'https://example.com/news/series-a', language: 'en' }]),
      JSON.stringify([{ outlet: 'Fibre Report', link: 'https://example.com/news/offtake', language: 'en' }]),
      JSON.stringify([{ outlet: 'Chimie Circulaire', link: 'https://example.com/news/rendement', language: 'fr' }])]
  );
  await q(
    `INSERT INTO statistic (key, value, source, year, geography) VALUES
      ('textiles_recycled','Less than 1 per cent of textiles are recycled into new materials','Textile Flow Monitor',2024,'Global'),
      ('plastics_emissions','1.8 gigatonnes of carbon dioxide equivalent a year from plastics production','Global Materials Emissions Panel',2023,'Global'),
      ('textile_incineration','More than 8 per cent of textile waste is incinerated each year','Textile Flow Monitor',2024,'EU-27')`
  );
  await q(
    `INSERT INTO claim_substantiation (id, claim, route, first_published, evidence, method_version, approver, review_date, evidence_expires_on, state) VALUES
      ('CLM-0001','Low-carbon, virgin-quality recycled polymers','/product','2026-01-15','Carbon figure CF-LOT-0001 against comparator virgin PA6, EcoBase 2025','CM-PA6 v2','quality@example.com','2026-12-31','2027-01-20','published'),
      ('CLM-0002','Low temperature and pressure process','/technology','2026-01-15','Recipe versions RCP-DISS-2 and RCP-REPO-3 with released set points','RCP-DISS-2','quality@example.com','2026-11-30','2027-01-05','published'),
      ('CLM-0003','Green chemicals and reagents','/technology','2026-01-15','Reagent declarations held against the published recipe versions','RCP-DISS-2','quality@example.com','2026-09-30','2026-10-31','published')`
  );

  /* ------------------------------------------------------- the record */
  acts.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  for (const a of acts) await append(null, a);

  const signEntry = await one(
    `SELECT seq FROM record_entry WHERE act = 'certificate_signed' AND object_ref = 'CERT-PILOT-000001' LIMIT 1`
  );
  if (signEntry) {
    await q(
      `INSERT INTO legal_hold (reference, seq, placed_by) VALUES ('HLD-0001',$1,'quality@example.com')`,
      [signEntry.seq]
    );
    await append(null, {
      act: 'legal_hold_placed', person: 'quality@example.com', object_kind: 'record_entry',
      object_ref: String(signEntry.seq), content: { reference: 'HLD-0001' }
    });
  }

  return { seeded: true, entries: acts.length };
}
