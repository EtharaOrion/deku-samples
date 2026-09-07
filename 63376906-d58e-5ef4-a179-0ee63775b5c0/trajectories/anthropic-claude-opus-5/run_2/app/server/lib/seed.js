import { pool, one, q } from './db.js';
import { appendEntry } from './record.js';
import { dryMassG, creditGrantedG, contentBp } from './arith.js';
import { statementsFor } from './engine.js';
import { renderDocument } from './document.js';

const P = {
  plant: 'PSN-0001', analyst: 'PSN-0002', quality: 'PSN-0003', claims: 'PSN-0004',
  signer: 'PSN-0005', signer2: 'PSN-0006', auditor: 'PSN-0007',
};

const SCHEME = 'RCS-2026';
const REGISTRATION = 'REG-RAVEL-0042';
const VERIFY_BASE = 'https://ravel.example.com/verify';

async function ins(sql, params) { await pool.query(sql, params); }

const acts = [];
const act = (e) => acts.push(e);

// The seed runs once. An advisory lock serialises two containers starting at the
// same moment, so the second waits and then finds the work already done.
export async function seedIfEmpty() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(8712340001)');
    const done = await one("SELECT value FROM app_meta WHERE key = 'seeded'");
    if (done) return false;
    await seed();
    await pool.query(
      "INSERT INTO app_meta (key, value) VALUES ('seeded', now()::text) ON CONFLICT (key) DO NOTHING");
    return true;
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(8712340001)'); } catch {}
    client.release();
  }
}

async function seed() {
  /* ------------------------------------------------------------- people */
  const people = [
    [P.plant, 'plant@example.com', 'Ines Bekele', 'plant_operator', ['SITE-DEMO', 'SITE-PILOT']],
    [P.analyst, 'analyst@example.com', 'Tomas Vlach', 'lab_analyst', ['SITE-DEMO', 'SITE-PILOT']],
    [P.quality, 'quality@example.com', 'Marit Solheim', 'quality_manager', ['SITE-DEMO', 'SITE-PILOT']],
    [P.claims, 'claims@example.com', 'Osei Danquah', 'claims_manager', ['SITE-DEMO', 'SITE-PILOT']],
    [P.signer, 'signer@example.com', 'Hana Ferreira', 'certificate_signer', ['SITE-DEMO', 'SITE-PILOT']],
    [P.signer2, 'signer2@example.com', 'Pavel Ostrowski', 'certificate_signer', ['SITE-PILOT']],
    [P.auditor, 'auditor@example.com', 'Ruth Lindqvist', 'auditor', ['SITE-DEMO', 'SITE-PILOT']],
  ];
  for (const [identifier, email, name, role, sites] of people) {
    await ins(
      `INSERT INTO person (identifier, email, name, role, sites, grant_ends_on)
       VALUES ($1,$2,$3,$4,$5,'2027-06-30') ON CONFLICT (identifier) DO NOTHING`,
      [identifier, email, name, role, sites]);
    act({ actor: 'system', action: 'access_grant_recorded', object_kind: 'person', object_ref: identifier,
      content: { email, role, sites, grant_ends_on: '2027-06-30' } });
  }

  /* -------------------------------------------------------------- sites */
  const basis = '8000 hours per year, 0.90 availability, 0.80 yield';
  const sites = [
    ['SITE-PILOT', 'Pilot', 'commissioned', 40000, 24000, 'certified'],
    ['SITE-DEMO', 'Demonstration', 'commissioned', 400000, 320000, 'certified'],
    ['SITE-COMM', 'Commercial', 'planned', 25000000, 26000000, 'not_certified'],
  ];
  for (const [reference, name, confidence, nameplate, contracted, cert] of sites) {
    await ins(
      `INSERT INTO site (reference, name, confidence, nameplate_kg, contracted_kg, certification_state, basis, last_revised)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'2026-06-30') ON CONFLICT (reference) DO NOTHING`,
      [reference, name, confidence, nameplate, contracted, cert, basis]);
    await ins(
      `INSERT INTO site_certification (id, site, state, effective_from, recorded_by)
       VALUES ($1,$2,$3,'2026-01-01',$4) ON CONFLICT (id) DO NOTHING`,
      [`CRT-${reference}`, reference, cert === 'certified' ? 'certified' : 'not_certified', P.quality]);
    await ins(
      `INSERT INTO party_version (id, party_reference, kind, name, effective_from)
       VALUES ($1,$2,'site',$3,'2026-01-01') ON CONFLICT (id) DO NOTHING`,
      [`PV-${reference}-1`, reference, name]);
  }
  await ins(
    `INSERT INTO cert_sequence (site, next_number) VALUES ('SITE-DEMO',1),('SITE-PILOT',1),('SITE-COMM',1)
     ON CONFLICT (site) DO NOTHING`);

  await ins(
    `INSERT INTO party_version (id, party_reference, kind, name, effective_from)
     VALUES ('PV-PRODUCER-1','PRODUCER','producer','Ravel Materials SAS','2026-01-01')
     ON CONFLICT (id) DO NOTHING`);

  /* --------------------------------------------------------- collectors */
  const collectors = [
    ['COL-ALDER', 'Alder Reclaim', 'PT', 'WCR-PT-4471', '2027-03-31'],
    ['COL-BRINE', 'Brine Textile Recovery', 'NL', 'WCR-NL-2208', '2027-01-31'],
    ['COL-CINDER', 'Cinder Industrial Offcuts', 'FR', 'WCR-FR-6613', '2026-12-31'],
  ];
  for (const [reference, name, country, registration, expiry] of collectors) {
    await ins(
      `INSERT INTO collector (reference, country, registration, registration_expiry, collection_site_types, declared_streams, scheme_status)
       VALUES ($1,$2,$3,$4,$5,$6,'in_good_standing') ON CONFLICT (reference) DO NOTHING`,
      [reference, country, registration, expiry,
        ['municipal_collection_point', 'commercial_premises'],
        reference === 'COL-CINDER' ? ['industrial_offcuts'] : ['post_consumer_textiles', 'mixed_polyamide']]);
    if (reference !== 'COL-BRINE') {
      await ins(
        `INSERT INTO party_version (id, party_reference, kind, name, effective_from)
         VALUES ($1,$2,'collector',$3,'2026-01-01') ON CONFLICT (id) DO NOTHING`,
        [`PV-${reference}-1`, reference, name]);
    }
    act({ actor: P.quality, action: 'collector_recorded', object_kind: 'collector', object_ref: reference,
      content: { name, country, registration } });
  }
  // A collector is acquired: the names it held, by date.
  await ins(
    `INSERT INTO party_version (id, party_reference, kind, name, effective_from, superseded_by)
     VALUES ('PV-COL-BRINE-1','COL-BRINE','collector','Brine Textile Recovery','2026-01-01','PV-COL-BRINE-2')
     ON CONFLICT (id) DO NOTHING`);
  await ins(
    `INSERT INTO party_version (id, party_reference, kind, name, effective_from)
     VALUES ('PV-COL-BRINE-2','COL-BRINE','collector','Brine Circular Materials','2026-08-01')
     ON CONFLICT (id) DO NOTHING`);

  const approvals = [
    ['AP-ALDER-1', 'COL-ALDER', 'approved', '2026-01-01', '2026-12-31', null, null],
    ['AP-BRINE-1', 'COL-BRINE', 'approved', '2026-01-01', '2026-06-30', null, null],
    ['AP-CINDER-1', 'COL-CINDER', 'conditional', '2026-01-01', '2026-12-31',
      'Sampling plan for coated streams to be agreed', '2026-10-31'],
  ];
  for (const [id, collector, state, from, to, condition, closes] of approvals) {
    await ins(
      `INSERT INTO approval_period (id, collector, state, valid_from, valid_to, condition, condition_closes_on, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [id, collector, state, from, to, condition, closes, P.quality]);
    act({ actor: P.quality, action: `collector_${state}`, object_kind: 'approval_period', object_ref: id,
      content: { collector, state, valid_from: from, valid_to: to, condition } });
  }

  /* ---------------------------------------------------- weighing devices */
  for (const [reference, site, cal] of [['WB-DEMO-01', 'SITE-DEMO', '2026-05-01'], ['WB-DEMO-02', 'SITE-DEMO', '2025-02-01']]) {
    await ins(
      `INSERT INTO weighing_device (reference, site, calibrated_on) VALUES ($1,$2,$3)
       ON CONFLICT (reference) DO NOTHING`, [reference, site, cal]);
  }

  /* ------------------------------------------------------------ batches */
  const batches = [
    { reference: 'BATCH-1001', collector: 'COL-ALDER', category: 'post_consumer', received_on: '2026-02-10',
      net_g: 500000, moisture_bp: 1000, device: 'WB-DEMO-01',
      composition: { polymer: 'PA6', fraction_bp: 9200, basis: 'sampled', measured_fraction_bp: 9200 },
      contamination: { non_nylon_bp: 500, elastane_bp: 400, coatings: 'none observed', colour_load: 'mixed dark', foreign_matter: 'zips and clips removed at source' } },
    { reference: 'BATCH-1002', collector: 'COL-ALDER', category: 'pre_consumer', received_on: '2026-02-12',
      net_g: 300000, moisture_bp: 0, device: 'WB-DEMO-01',
      composition: { polymer: 'PA6', fraction_bp: 9600, basis: 'sampled', measured_fraction_bp: 9600 },
      contamination: { non_nylon_bp: 300, elastane_bp: 100, coatings: 'none', colour_load: 'undyed', foreign_matter: 'none' } },
    { reference: 'BATCH-1003', collector: 'COL-BRINE', category: 'post_consumer', received_on: '2026-07-05',
      net_g: 200000, moisture_bp: 500, device: 'WB-DEMO-01',
      composition: { polymer: 'PA6', fraction_bp: 8800, basis: 'sampled', measured_fraction_bp: 8800 },
      contamination: { non_nylon_bp: 900, elastane_bp: 600, coatings: 'light coating observed', colour_load: 'mixed', foreign_matter: 'trace' } },
    { reference: 'BATCH-1004', collector: 'COL-CINDER', category: 'pre_consumer', received_on: '2026-02-20',
      net_g: 120000, moisture_bp: 0, device: 'WB-DEMO-02',
      composition: { polymer: 'PA6', fraction_bp: 9900, basis: 'declared', measured_fraction_bp: 9100 },
      contamination: { non_nylon_bp: 200, elastane_bp: 0, coatings: 'coated offcuts', colour_load: 'single colour', foreign_matter: 'none' } },
    { reference: 'BATCH-1005', collector: 'COL-ALDER', category: 'post_consumer', received_on: '2026-03-02',
      net_g: 100000, moisture_bp: 0, device: 'WB-DEMO-01',
      composition: { polymer: 'PA6', fraction_bp: 9000, basis: 'declared' },
      contamination: { non_nylon_bp: 700, elastane_bp: 300, coatings: 'none', colour_load: 'mixed', foreign_matter: 'trace' } },
  ];
  const CUSTODY = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
  for (const b of batches) {
    const gross = b.net_g + 20000;
    await ins(
      `INSERT INTO batch (reference, collector, site, grade, category, gross_g, tare_g, net_g, moisture_bp,
        moisture_method, device, received_on, composition, contamination, accepted_g, event_at, effective_on, created_by, closed)
       VALUES ($1,$2,'SITE-DEMO','N6',$3,$4,20000,$5,$6,'ISO 15512 oven loss',$7,$8,$9,$10,$5,$11,$8,$12,true)
       ON CONFLICT (reference) DO NOTHING`,
      [b.reference, b.collector, b.category, gross, b.net_g, b.moisture_bp, b.device, b.received_on,
        JSON.stringify(b.composition), JSON.stringify(b.contamination), b.received_on + 'T08:00:00Z', P.plant]);

    const kinds = b.reference === 'BATCH-1005' ? CUSTODY.filter((k) => k !== 'transport') : CUSTODY;
    let ordinal = 0;
    for (const kind of kinds) {
      await ins(
        `INSERT INTO custody_link (id, batch, ordinal, kind, link_date, party)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [`CUS-${b.reference}-${kind}`, b.reference, ordinal++, kind, b.received_on,
          kind === 'transport' ? 'Haulier of record' : (kind === 'acceptance' || kind === 'weighing' ? 'Ravel Materials SAS' : b.collector)]);
    }
    const device = await one('SELECT * FROM weighing_device WHERE reference = $1', [b.device]);
    const lapsed = (new Date(b.received_on) - new Date(device.calibrated_on.toISOString().slice(0, 10))) / 86400000 > 365;
    await ins(
      `INSERT INTO weighing (reference, batch, device, gross_g, tare_g, net_g, calibration_state, weighed_at)
       VALUES ($1,$2,$3,$4,20000,$5,$6,$7) ON CONFLICT (reference) DO NOTHING`,
      [`WGH-${b.reference}`, b.reference, b.device, gross, b.net_g,
        lapsed ? 'lapsed' : 'in_calibration', b.received_on + 'T08:00:00Z']);
    act({ actor: P.plant, site: 'SITE-DEMO', action: 'batch_booked_in', object_kind: 'batch', object_ref: b.reference,
      content: { collector: b.collector, category: b.category, net_g: b.net_g, received_on: b.received_on } });
    act({ actor: P.plant, site: 'SITE-DEMO', action: 'weighing_recorded', object_kind: 'weighing', object_ref: `WGH-${b.reference}`,
      content: { batch: b.reference, device: b.device, net_g: b.net_g, calibration_state: lapsed ? 'lapsed' : 'in_calibration' } });
  }

  // A measured composition departing from the declaration by more than 500 basis
  // points stands as a finding against the collector.
  await ins(
    `INSERT INTO collector_finding (id, collector, kind, detail, raised_on, due_on, state, batch, departure_bp)
     VALUES ('FND-0001','COL-CINDER','declaration_departure',
       'Declared PA6 fraction of 9900 basis points measured at 9100 basis points on BATCH-1004, a departure of 800 basis points.',
       '2026-02-24','2026-05-24','open','BATCH-1004',800)
     ON CONFLICT (id) DO NOTHING`);
  act({ actor: P.quality, action: 'collector_finding_raised', object_kind: 'collector_finding', object_ref: 'FND-0001',
    content: { collector: 'COL-CINDER', batch: 'BATCH-1004', departure_bp: 800 } });

  /* ------------------------------------------------------------ recipes */
  const recipes = [
    ['RCP-DISS-2', 'dissolution', 2, { temperature_c: 165, pressure_bar: 3 }, { temperature_c: { min: 160, max: 170 }, pressure_bar: { min: 2, max: 4 } }, 90],
    ['RCP-DEPO-4', 'depolymerisation', 4, { temperature_c: 240, pressure_bar: 6 }, { temperature_c: { min: 230, max: 250 }, pressure_bar: { min: 5, max: 8 } }, 180],
    ['RCP-PURI-1', 'purification', 1, { temperature_c: 120, pressure_bar: 1 }, { temperature_c: { min: 110, max: 130 }, pressure_bar: { min: 1, max: 2 } }, 60],
    ['RCP-REPO-3', 'repolymerisation', 3, { temperature_c: 255, pressure_bar: 4 }, { temperature_c: { min: 245, max: 265 }, pressure_bar: { min: 3, max: 6 } }, 240],
  ];
  for (const [reference, run_type, version, sp, tol, res] of recipes) {
    await ins(
      `INSERT INTO recipe_version (reference, run_type, version, set_points, tolerances, reagents, residence_minutes, released_by, released_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'2026-01-05') ON CONFLICT (reference) DO NOTHING`,
      [reference, run_type, version, JSON.stringify(sp), JSON.stringify(tol),
        JSON.stringify([{ reagent: 'green solvent A', ratio_bp: 3000 }]), res, P.quality]);
  }

  /* --------------------------------------------------------------- runs */
  const runs = [
    { reference: 'RUN-D-0001', run_type: 'dissolution', recipe: 'RCP-DISS-2', started: '2026-03-04T06:00:00Z',
      consumes: [['batch', 'BATCH-1001', 300000], ['batch', 'BATCH-1002', 300000]], losses: 120000,
      actual: { temperature_c: 165, pressure_bar: 3 } },
    { reference: 'RUN-D-0002', run_type: 'dissolution', recipe: 'RCP-DISS-2', started: '2026-03-05T06:00:00Z',
      consumes: [['batch', 'BATCH-1003', 190000], ['batch', 'BATCH-1004', 120000]], losses: 60000,
      actual: { temperature_c: 172, pressure_bar: 3 } },
    { reference: 'RUN-D-0003', run_type: 'dissolution', recipe: 'RCP-DISS-2', started: '2026-03-06T06:00:00Z',
      consumes: [['batch', 'BATCH-1001', 150000]], losses: 30000, actual: { temperature_c: 164, pressure_bar: 3 } },
    { reference: 'RUN-Y-0001', run_type: 'depolymerisation', recipe: 'RCP-DEPO-4', started: '2026-03-08T06:00:00Z',
      consumes: [['output', 'OUT-D-0001', 480000], ['output', 'OUT-D-0002', 250000], ['output', 'OUT-D-0003', 120000]],
      losses: 50000, actual: { temperature_c: 241, pressure_bar: 6 } },
    { reference: 'RUN-U-0001', run_type: 'purification', recipe: 'RCP-PURI-1', started: '2026-03-10T06:00:00Z',
      consumes: [['output', 'OUT-Y-0001', 800000]], losses: 40000, actual: { temperature_c: 121, pressure_bar: 1 } },
    { reference: 'RUN-R-0001', run_type: 'repolymerisation', recipe: 'RCP-REPO-3', started: '2026-03-12T06:00:00Z',
      consumes: [['output', 'OUT-U-0001', 720000]], losses: 20000, actual: { temperature_c: 256, pressure_bar: 4 } },
  ];
  const outputs = [
    ['OUT-D-0001', 'RUN-D-0001', 'intermediate', 480000, null],
    ['OUT-D-0002', 'RUN-D-0002', 'intermediate', 250000, null],
    ['OUT-D-0003', 'RUN-D-0003', 'intermediate', 120000, null],
    ['OUT-Y-0001', 'RUN-Y-0001', 'intermediate', 800000, null],
    ['OUT-U-0001', 'RUN-U-0001', 'intermediate', 720000, null],
    ['OUT-U-0002', 'RUN-U-0001', 'byproduct', 40000, 'sold'],
    ['LOT-N6-0001', 'RUN-R-0001', 'lot', 400000, null],
    ['LOT-N6-0002', 'RUN-R-0001', 'lot', 300000, null],
  ];

  const DEMO_PERIOD = 'BP-DEMO-N6-2026H1';
  const PILOT_PERIOD = 'BP-PILOT-N6-2026H1';

  /* ---------------------------------------------------- balance periods */
  const periods = [
    ['BP-DEMO-N6-2025H2', 'SITE-DEMO', 'N6', '2025-07-01', '2025-12-31', 'closed', '2026-01-15', '2026-01-10'],
    [DEMO_PERIOD, 'SITE-DEMO', 'N6', '2026-01-01', '2026-06-30', 'open', null, null],
    [PILOT_PERIOD, 'SITE-PILOT', 'N6', '2026-01-01', '2026-06-30', 'open', null, null],
  ];
  for (const [id, site, grade, from, to, state, closed_on, cut_off] of periods) {
    await ins(
      `INSERT INTO balance_period (id, site, grade, period_from, period_to, state, carry_over_limit_bp, allocation_basis, closed_on, closed_by, cut_off)
       VALUES ($1,$2,$3,$4,$5,$6,2000,'mass',$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [id, site, grade, from, to, state, closed_on, closed_on ? P.claims : null, cut_off]);
  }

  /* ------------------------------------------------- conversion factors */
  await ins(
    `INSERT INTO conversion_factor (reference, site, version, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on)
     VALUES ('CF-DEMO-1','SITE-DEMO',1,8000,'2026-01-01','2026-03-31',1000000,800000,false,$1,'2026-04-02')
     ON CONFLICT (reference) DO NOTHING`, [P.claims]);
  await ins(
    `INSERT INTO conversion_factor (reference, site, version, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on)
     VALUES ('CF-PILOT-1','SITE-PILOT',1,7500,NULL,NULL,0,0,true,$1,'2026-01-10')
     ON CONFLICT (reference) DO NOTHING`, [P.claims]);
  act({ actor: P.claims, site: 'SITE-DEMO', action: 'conversion_factor_published', object_kind: 'conversion_factor', object_ref: 'CF-DEMO-1',
    content: { factor_bp: 8000, derived_in_g: 1000000, derived_out_g: 800000 } });
  act({ actor: P.claims, site: 'SITE-PILOT', action: 'conversion_factor_published', object_kind: 'conversion_factor', object_ref: 'CF-PILOT-1',
    content: { factor_bp: 7500, provisional: true } });

  /* ------------------------------- runs, consumptions, credit movements */
  let movementSeq = 0;
  const nextMovement = () => `MOV-${String(++movementSeq).padStart(4, '0')}`;

  for (const r of runs) {
    const recipe = recipes.find((x) => x[0] === r.recipe);
    const tol = recipe[4];
    let within = true;
    for (const k of Object.keys(tol)) {
      const v = r.actual[k];
      if (v < tol[k].min || v > tol[k].max) within = false;
    }
    const startDate = r.started.slice(0, 10);
    await ins(
      `INSERT INTO run (reference, run_type, site, equipment, recipe_version, operator, started_at, closed_at, state,
        losses_g, actual_set_points, within_tolerance, event_at, effective_on, created_by)
       VALUES ($1,$2,'SITE-DEMO',$3,$4,$5,$6,$7,'closed',$8,$9,$10,$6,$11,$12)
       ON CONFLICT (reference) DO NOTHING`,
      [r.reference, r.run_type, `EQ-${r.run_type.slice(0, 4).toUpperCase()}-1`, r.recipe, P.plant,
        r.started, r.started.replace('T06', 'T18'), r.losses, JSON.stringify(r.actual), within, startDate, P.plant]);
    act({ actor: P.plant, site: 'SITE-DEMO', action: 'run_started', object_kind: 'run', object_ref: r.reference,
      content: { run_type: r.run_type, recipe_version: r.recipe, started_at: r.started } });

    let ci = 0;
    for (const [kind, ref, mass] of r.consumes) {
      const consRef = `CON-${r.reference.slice(4)}-${++ci}`;
      let dry = mass, credit = 0, category = null, claimable = false, factorVersion = null;
      if (kind === 'batch') {
        const b = batches.find((x) => x.reference === ref);
        const bRow = await one('SELECT * FROM batch WHERE reference = $1', [ref]);
        // The consumption is recorded on dry mass; it never exceeds the batch's own dry mass.
        dry = Math.min(mass, dryMassG(bRow.net_g, bRow.moisture_bp));
        const approval = await one(
          `SELECT * FROM approval_period WHERE collector = $1 AND valid_from <= $2 AND valid_to >= $2`,
          [b.collector, b.received_on]);
        const custody = await q('SELECT kind FROM custody_link WHERE batch = $1', [ref]);
        const custodyOk = new Set(custody.map((x) => x.kind)).size === 6;
        claimable = !!approval && ['approved', 'conditional'].includes(approval.state) && custodyOk;
        category = claimable ? b.category : 'non_claimable';
        factorVersion = 'CF-DEMO-1';
        credit = claimable ? creditGrantedG(dry, 8000) : 0;
      }
      await ins(
        `INSERT INTO consumption (reference, run, input_kind, input_ref, mass_g, dry_mass_consumed_g, credit_granted_g,
          category, claimable, factor_version, event_at, effective_on, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (reference) DO NOTHING`,
        [consRef, r.reference, kind, ref, mass, dry, credit, category, claimable, factorVersion,
          r.started, startDate, P.plant]);
      act({ actor: P.plant, site: 'SITE-DEMO', action: 'consumption_recorded', object_kind: 'consumption', object_ref: consRef,
        content: { run: r.reference, input: ref, mass_g: mass, dry_mass_consumed_g: dry, credit_granted_g: credit } });

      if (kind === 'batch') {
        // Credits enter when a claimable batch is consumed. Non-claimable input is
        // recorded too, at zero credit, so the period can name it.
        const ref2 = nextMovement();
        await ins(
          `INSERT INTO credit_movement (reference, period_id, category, direction, mass_g, source_kind, source_ref, effective_on, created_by, derivation, fresh_credit)
           VALUES ($1,$2,$3,'in',$4,'consumption',$5,$6,$7,$8,true) ON CONFLICT (reference) DO NOTHING`,
          [ref2, DEMO_PERIOD, category, claimable ? credit : dry, consRef, startDate, P.plant,
            JSON.stringify({
              consumption: consRef, batch: ref,
              dry_mass_consumed_g: dry,
              factor: 'CF-DEMO-1', factor_bp: 8000,
              rule: claimable
                ? 'dry_mass_consumed_g * factor_bp / 10000, floored'
                : 'non-claimable input is recorded as mass and grants no credit',
            })]);
      }
    }
  }
  for (const [reference, run, kind, mass, disposition] of outputs) {
    const r = runs.find((x) => x.reference === run);
    await ins(
      `INSERT INTO output (reference, run, kind, mass_g, disposition, allocation_basis, event_at, effective_on, created_by)
       VALUES ($1,$2,$3,$4,$5,'mass',$6,$7,$8) ON CONFLICT (reference) DO NOTHING`,
      [reference, run, kind, mass, disposition, r.started, r.started.slice(0, 10), P.plant]);
    act({ actor: P.plant, site: 'SITE-DEMO', action: 'output_recorded', object_kind: 'output', object_ref: reference,
      content: { run, kind, mass_g: mass, disposition } });
  }
  for (const r of runs) {
    act({ actor: P.plant, site: 'SITE-DEMO', action: 'run_closed', object_kind: 'run', object_ref: r.reference,
      content: { losses_g: r.losses, rule: 'mass in minus mass out' } });
  }

  /* --------------------------------------------------------------- lots */
  const lots = [
    ['LOT-N6-0001', 'N6', 'SITE-DEMO', 400000, 'released', 'mass_balance', 'LOT-N6-0001', 'RUN-R-0001', DEMO_PERIOD],
    ['LOT-N6-0002', 'N6', 'SITE-DEMO', 300000, 'quarantined', 'mass_balance', 'LOT-N6-0002', 'RUN-R-0001', DEMO_PERIOD],
    ['LOT-N6-0003', 'N6', 'SITE-PILOT', 200000, 'released', 'mass_balance', null, null, PILOT_PERIOD],
  ];
  for (const [reference, grade, site, mass, disp, claim, outRef, runRef, period] of lots) {
    await ins(
      `INSERT INTO lot (reference, grade, site, mass_g, disposition, disposition_by, disposition_at, claim_type,
        output_ref, run_ref, specification_version, period_id, event_at, effective_on)
       VALUES ($1,$2,$3,$4,$5,$6,'2026-03-16T10:00:00Z',$7,$8,$9,3,$10,'2026-03-14T06:00:00Z','2026-03-14')
       ON CONFLICT (reference) DO NOTHING`,
      [reference, grade, site, mass, disp, P.quality, claim, outRef, runRef, period]);
    act({ actor: P.quality, site, action: 'lot_disposition_set', object_kind: 'lot', object_ref: reference,
      content: { disposition: disp, claim_type: claim } });
  }

  /* ------------------------------------------- deviations and overrides */
  await ins(
    `INSERT INTO deviation (reference, state, detail, runs, lots, raised_by, event_at, effective_on)
     VALUES ('DEV-0001','open','Purification residence time ran short against RCP-PURI-1 and the lot is held pending investigation.',
       ARRAY['RUN-U-0001'], ARRAY['LOT-N6-0002'], $1,'2026-03-11T09:00:00Z','2026-03-11')
     ON CONFLICT (reference) DO NOTHING`, [P.quality]);
  await ins(
    `INSERT INTO deviation (reference, state, detail, runs, lots, outcome, raised_by, closed_by, closed_at, event_at, effective_on)
     VALUES ('DEV-0002','closed','Dissolution temperature reached 172 degrees against a recipe allowing 160 to 170.',
       ARRAY['RUN-D-0002'], ARRAY[]::text[], 'cause_not_established', $1, $1, '2026-03-20T09:00:00Z','2026-03-05T09:00:00Z','2026-03-05')
     ON CONFLICT (reference) DO NOTHING`, [P.quality]);
  act({ actor: P.quality, site: 'SITE-DEMO', action: 'deviation_raised', object_kind: 'deviation', object_ref: 'DEV-0001',
    content: { runs: ['RUN-U-0001'], lots: ['LOT-N6-0002'] } });
  act({ actor: P.quality, site: 'SITE-DEMO', action: 'deviation_raised', object_kind: 'deviation', object_ref: 'DEV-0002',
    content: { runs: ['RUN-D-0002'] } });
  act({ actor: P.quality, site: 'SITE-DEMO', action: 'deviation_closed', object_kind: 'deviation', object_ref: 'DEV-0002',
    content: { outcome: 'cause_not_established' } });

  await ins(
    `INSERT INTO separation_override (reference, separation, reason, lot, authorised_by, created_by, reviewed, event_at, effective_on)
     VALUES ('OVR-0001','analyst_not_dispositioner',
       'Night shift analyst dispositioned the lot because no second qualified person was on site',
       'LOT-N6-0001', $1, $1, false, '2026-03-18T02:00:00Z','2026-03-18')
     ON CONFLICT (reference) DO NOTHING`, [P.quality]);
  act({ actor: P.quality, site: 'SITE-DEMO', action: 'override_recorded', object_kind: 'override', object_ref: 'OVR-0001',
    content: { separation: 'analyst_not_dispositioner', lot: 'LOT-N6-0001', authorised_by: P.quality } });

  /* ------------------------------------------------------- test results */
  const tests = [
    ['TST-0001', 'lot', 'LOT-N6-0001', 'relative_viscosity', 'ISO 307', 'VIS-3', '2.43', 'ratio', 200],
    ['TST-0002', 'lot', 'LOT-N6-0001', 'moisture', 'ISO 15512', 'KF-2', '0.06', 'percent', 300],
    ['TST-0003', 'lot', 'LOT-N6-0003', 'relative_viscosity', 'ISO 307', 'VIS-3', '2.41', 'ratio', 200],
    ['TST-0004', 'lot', 'LOT-N6-0003', 'moisture', 'ISO 15512', 'KF-2', '0.08', 'percent', 300],
    ['TST-0005', 'lot', 'LOT-N6-0002', 'relative_viscosity', 'ISO 307', 'VIS-3', '2.31', 'ratio', 200],
  ];
  for (const [reference, kind, subject, property, method, instrument, value, unit, unc] of tests) {
    await ins(
      `INSERT INTO test_result (reference, subject_kind, subject_ref, property, method, instrument, analyst,
        value, unit, uncertainty_bp, entered_by, event_at, effective_on)
       VALUES ($1,$2,$3,$4,$5,$6,'Tomas Vlach',$7,$8,$9,$10,'2026-03-15T09:00:00Z','2026-03-15')
       ON CONFLICT (reference) DO NOTHING`,
      [reference, kind, subject, property, method, instrument, value, unit, unc, P.analyst]);
    act({ actor: P.analyst, action: 'test_result_recorded', object_kind: 'test_result', object_ref: reference,
      content: { subject, property, method, value, unit } });
  }

  /* ------------------------------------------------- credits at PILOT */
  // The pilot site opened its period with commissioning material of its own.
  await ins(
    `INSERT INTO credit_movement (reference, period_id, category, direction, mass_g, source_kind, source_ref, effective_on, created_by, derivation, fresh_credit)
     VALUES ('MOV-P001',$1,'post_consumer','in',250000,'consumption','CON-PILOT-COMMISSIONING','2026-02-01',$2,$3,true)
     ON CONFLICT (reference) DO NOTHING`,
    [PILOT_PERIOD, P.plant, JSON.stringify({
      note: 'Commissioning feedstock consumed at SITE-PILOT',
      dry_mass_consumed_g: 333333, factor: 'CF-PILOT-1', factor_bp: 7500,
      rule: 'dry_mass_consumed_g * factor_bp / 10000, floored',
    })]);
  // LOT-N6-0003 carries 150000 g of claim on 200000 g, which is 7500 basis points.
  await ins(
    `INSERT INTO credit_movement (reference, period_id, category, direction, mass_g, source_kind, source_ref, lot, effective_on, created_by, derivation, fresh_credit)
     VALUES ('MOV-P002',$1,'post_consumer','out',150000,'allocation','ALO-P002','LOT-N6-0003','2026-02-25',$2,$3,true)
     ON CONFLICT (reference) DO NOTHING`,
    [PILOT_PERIOD, P.claims, JSON.stringify({ lot: 'LOT-N6-0003', rule: 'claim attached to a lot leaves the ledger' })]);
  act({ actor: P.claims, site: 'SITE-PILOT', action: 'allocation_attached', object_kind: 'credit_movement', object_ref: 'MOV-P002',
    content: { lot: 'LOT-N6-0003', category: 'post_consumer', mass_g: 150000 } });

  /* ---------------------------------------------------------- transfer */
  await ins(
    `INSERT INTO transfer (reference, from_period, to_period, category, mass_g, moved_on, created_by)
     VALUES ('TRF-0001',$1,$2,'post_consumer',50000,'2026-05-12',$3) ON CONFLICT (reference) DO NOTHING`,
    [PILOT_PERIOD, DEMO_PERIOD, P.claims]);
  await ins(
    `INSERT INTO credit_movement (reference, period_id, category, direction, mass_g, source_kind, source_ref, movement_ref, origin_site, effective_on, created_by, derivation, fresh_credit)
     VALUES ('MOV-P003',$1,'post_consumer','out',50000,'transfer_out','TRF-0001','TRF-0001','SITE-PILOT','2026-05-12',$2,$3,false)
     ON CONFLICT (reference) DO NOTHING`,
    [PILOT_PERIOD, P.claims, JSON.stringify({ transfer: 'TRF-0001', to: DEMO_PERIOD })]);
  await ins(
    `INSERT INTO credit_movement (reference, period_id, category, direction, mass_g, source_kind, source_ref, movement_ref, origin_site, effective_on, created_by, derivation, fresh_credit)
     VALUES ('MOV-D101',$1,'post_consumer','in',50000,'transfer_in','TRF-0001','TRF-0001','SITE-PILOT','2026-05-12',$2,$3,false)
     ON CONFLICT (reference) DO NOTHING`,
    [DEMO_PERIOD, P.claims, JSON.stringify({
      transfer: 'TRF-0001', from: PILOT_PERIOD, origin_site: 'SITE-PILOT',
      rule: 'material moved between sites during commissioning is never a fresh credit',
    })]);
  act({ actor: P.claims, action: 'transfer_recorded', object_kind: 'transfer', object_ref: 'TRF-0001',
    content: { from: PILOT_PERIOD, to: DEMO_PERIOD, mass_g: 50000, fresh_credit: false } });

  /* ------------------------------------------------------------ carbon */
  const factorsV1 = [
    { name: 'grid electricity EU-27', source: 'EcoBase 2024', year: 2024, mg_per_kg: 1900000 },
    { name: 'green solvent A', source: 'Supplier declaration', year: 2024, mg_per_kg: 1240000 },
  ];
  const factorsV2 = [
    { name: 'grid electricity EU-27', source: 'EcoBase 2025', year: 2025, mg_per_kg: 1850000 },
    { name: 'green solvent A', source: 'Supplier declaration', year: 2025, mg_per_kg: 1180000 },
    { name: 'road freight', source: 'EcoBase 2025', year: 2025, mg_per_kg: 310000 },
  ];
  await ins(
    `INSERT INTO carbon_method (id, version, standard, functional_unit, boundary, allocation_basis, reviewer,
      published_on, published_by, data_quality_rules, emission_factors, primary_threshold_bp, superseded)
     VALUES ('CM-PA6',1,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2025-09-15',$1,$2,$3,5000,true)
     ON CONFLICT (id, version) DO NOTHING`,
    [P.quality, JSON.stringify(['primary data for every process under operational control',
      'supplier-specific factors where a supplier declaration exists', 'secondary data named with its dataset and year']),
      JSON.stringify(factorsV1)]);
  await ins(
    `INSERT INTO carbon_method (id, version, standard, functional_unit, boundary, allocation_basis, reviewer,
      published_on, published_by, data_quality_rules, emission_factors, primary_threshold_bp, superseded)
     VALUES ('CM-PA6',2,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2026-01-20',$1,$2,$3,5000,false)
     ON CONFLICT (id, version) DO NOTHING`,
    [P.quality, JSON.stringify(['primary data for every process under operational control',
      'supplier-specific factors where a supplier declaration exists', 'secondary data named with its dataset and year']),
      JSON.stringify(factorsV2)]);
  act({ actor: P.quality, action: 'carbon_method_published', object_kind: 'carbon_method', object_ref: 'CM-PA6 v1',
    content: { version: 1, standard: 'ISO 14067' } });
  act({ actor: P.quality, action: 'carbon_method_published', object_kind: 'carbon_method', object_ref: 'CM-PA6 v2',
    content: { version: 2, standard: 'ISO 14067', supersedes: 1 } });

  const breakdown1 = [
    { line: 'collection_and_transport', mg_per_kg: 310000, tag: 'primary' },
    { line: 'process_energy', mg_per_kg: 1850000, tag: 'primary' },
    { line: 'reagents', mg_per_kg: 1180000, tag: 'supplier_specific' },
    { line: 'water_and_effluent', mg_per_kg: 240000, tag: 'primary' },
    { line: 'waste_and_residues', mg_per_kg: 330000, tag: 'secondary' },
    { line: 'outbound_transport', mg_per_kg: 410000, tag: 'secondary' },
    { line: 'byproduct_credit', mg_per_kg: -60000, tag: 'primary' },
  ];
  // The comparator is another material's figure from another dataset. It is
  // named distinctly so no bare value_mg_per_kg crosses the wire, and it carries
  // the boundary that makes the comparison like-for-like.
  const comparator = {
    material: 'virgin PA6', dataset: 'EcoBase 2025', dataset_year: 2025, region: 'EU-27',
    comparator_mg_per_kg: 7900000, boundary: 'cradle-to-gate',
  };
  const energy1 = { energy_location_mg_per_kg: 1850000, energy_market_mg_per_kg: 620000, metered_kwh: 300000 };
  await ins(
    `INSERT INTO carbon_figure (id, lot, method_id, method_version, version, value_mg_per_kg, uncertainty_bp,
      primary_share_bp, boundary, comparator, breakdown, energy, input_versions, computed_by, computed_at)
     VALUES ('CFG-0001','LOT-N6-0001','CM-PA6',2,1,4260000,1200,6500,'cradle-to-gate',$1,$2,$3,$4,$5,'2026-03-16T12:00:00Z')
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(comparator), JSON.stringify(breakdown1), JSON.stringify(energy1),
      JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1', specification: 'SPEC-N6 v3', recipe_versions: ['RCP-DISS-2', 'RCP-DEPO-4', 'RCP-PURI-1', 'RCP-REPO-3'] }),
      P.quality]);

  const breakdown3 = [
    { line: 'collection_and_transport', mg_per_kg: 340000, tag: 'primary' },
    { line: 'process_energy', mg_per_kg: 1960000, tag: 'primary' },
    { line: 'reagents', mg_per_kg: 1210000, tag: 'supplier_specific' },
    { line: 'water_and_effluent', mg_per_kg: 250000, tag: 'primary' },
    { line: 'waste_and_residues', mg_per_kg: 350000, tag: 'secondary' },
    { line: 'outbound_transport', mg_per_kg: 330000, tag: 'secondary' },
    { line: 'byproduct_credit', mg_per_kg: -60000, tag: 'primary' },
  ];
  const energy3 = { energy_location_mg_per_kg: 1960000, energy_market_mg_per_kg: 710000, metered_kwh: 90000 };
  await ins(
    `INSERT INTO carbon_figure (id, lot, method_id, method_version, version, value_mg_per_kg, uncertainty_bp,
      primary_share_bp, boundary, comparator, breakdown, energy, input_versions, computed_by, computed_at)
     VALUES ('CFG-0003','LOT-N6-0003','CM-PA6',2,1,4380000,1500,5200,'cradle-to-gate',$1,$2,$3,$4,$5,'2026-02-26T12:00:00Z')
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(comparator), JSON.stringify(breakdown3), JSON.stringify(energy3),
      JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-PILOT-1', specification: 'SPEC-N6 v3' }),
      P.quality]);
  const breakdown2 = breakdown1.map((b) => ({ ...b }));
  await ins(
    `INSERT INTO carbon_figure (id, lot, method_id, method_version, version, value_mg_per_kg, uncertainty_bp,
      primary_share_bp, boundary, comparator, breakdown, energy, input_versions, computed_by, computed_at)
     VALUES ('CFG-0002','LOT-N6-0002','CM-PA6',2,1,4260000,1200,6500,'cradle-to-gate',$1,$2,$3,$4,$5,'2026-03-16T12:00:00Z')
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(comparator), JSON.stringify(breakdown2), JSON.stringify(energy1),
      JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1', specification: 'SPEC-N6 v3' }), P.quality]);
  for (const id of ['CFG-0001', 'CFG-0002', 'CFG-0003']) {
    act({ actor: P.quality, action: 'carbon_figure_computed', object_kind: 'carbon_figure', object_ref: id,
      content: { method_version: 'CM-PA6 v2' } });
  }

  await ins(
    `INSERT INTO energy_instrument (reference, quantity_kwh, vintage, region, state, applied_period)
     VALUES ('EAC-2026-0007',250000,2026,'EU-27','retired',$1) ON CONFLICT (reference) DO NOTHING`, [DEMO_PERIOD]);
  await ins(
    `INSERT INTO energy_instrument (reference, quantity_kwh, vintage, region, state, applied_period)
     VALUES ('EAC-2025-0031',100000,2025,'EU-27','held',NULL) ON CONFLICT (reference) DO NOTHING`);

  /* ------------------------------------------- specifications, customers */
  const specProps = [
    { property: 'relative_viscosity', method: 'ISO 307', limit: '2.40', unit: 'ratio', basis: 'guaranteed' },
    { property: 'moisture', method: 'ISO 15512', limit: '0.10', unit: 'percent', basis: 'guaranteed' },
    { property: 'yellowness_index', method: 'ASTM E313', limit: '8.0', unit: 'index', basis: 'typical' },
    { property: 'ash_content', method: 'ISO 3451-1', limit: '0.30', unit: 'percent', basis: 'informational' },
  ];
  const virgin = { reference: 'virgin PA6 at relative viscosity 2.42', source: 'EcoBase 2025', date: '2025-11-30' };
  await ins(
    `INSERT INTO specification (grade, version, issued_on, properties, virgin_reference, superseded)
     VALUES ('SPEC-N6',2,'2025-06-01',$1,$2,true) ON CONFLICT (grade, version) DO NOTHING`,
    [JSON.stringify(specProps), JSON.stringify(virgin)]);
  await ins(
    `INSERT INTO specification (grade, version, issued_on, properties, virgin_reference, superseded)
     VALUES ('SPEC-N6',3,'2026-02-01',$1,$2,false) ON CONFLICT (grade, version) DO NOTHING`,
    [JSON.stringify(specProps), JSON.stringify(virgin)]);
  act({ actor: P.quality, action: 'specification_issued', object_kind: 'specification', object_ref: 'SPEC-N6 v3',
    content: { issued_on: '2026-02-01' } });

  await ins(
    `INSERT INTO customer (reference, contact, holds_specification_grade, holds_specification_version, application, industry, language)
     VALUES ('CUS-HELIOS','helios@example.com','SPEC-N6',3,'technical apparel yarn','textiles','en')
     ON CONFLICT (reference) DO NOTHING`);
  await ins(
    `INSERT INTO customer (reference, contact, holds_specification_grade, holds_specification_version, application, industry, language)
     VALUES ('CUS-VANTA','vanta@example.com','SPEC-N6',2,'airbag fabric','automotive','en')
     ON CONFLICT (reference) DO NOTHING`);
  for (const [ref, name] of [['CUS-HELIOS', 'Helios Textiles'], ['CUS-VANTA', 'Vanta Safety Systems']]) {
    await ins(
      `INSERT INTO party_version (id, party_reference, kind, name, effective_from)
       VALUES ($1,$2,'customer',$3,'2026-01-01') ON CONFLICT (id) DO NOTHING`, [`PV-${ref}-1`, ref, name]);
  }
  await ins(
    `INSERT INTO specification_issue (id, grade, version, customer, issued_on, issued_by)
     VALUES ('SPI-0001','SPEC-N6',3,'CUS-HELIOS','2026-02-03',$1),
            ('SPI-0002','SPEC-N6',2,'CUS-VANTA','2025-06-10',$1)
     ON CONFLICT (id) DO NOTHING`, [P.quality]);
  await ins(
    `INSERT INTO conformance (id, customer, application, specification_version, trials, outcome, opened_on, completed_on)
     VALUES ('CNF-0001','CUS-HELIOS','technical apparel yarn',3,$1,'passed','2026-02-05','2026-03-01'),
            ('CNF-0002','CUS-VANTA','airbag fabric',2,$2,'in_progress','2025-06-20',NULL)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify([{ trial: 'spinning trial', date: '2026-02-20', outcome: 'passed' }]),
      JSON.stringify([{ trial: 'weave trial', date: '2025-09-02', outcome: 'passed' },
        { trial: 'ageing trial', date: '2026-01-14', outcome: 'in_progress' }])]);

  /* ---------------------------------------------------------- contracts */
  await ins(
    `INSERT INTO contract (id, recipient, site, period, committed_kg, floor_bp, delivered_kg, shortfall_consequence)
     VALUES ('CON-HELIOS-1','CUS-HELIOS','SITE-DEMO','2026-H1',200,5000,0,'a price adjustment in the following invoice period')
     ON CONFLICT (id) DO NOTHING`);
  await ins(
    `INSERT INTO contract (id, recipient, site, period, committed_kg, floor_bp, delivered_kg, shortfall_consequence)
     VALUES ('CON-VANTA-1','CUS-VANTA','SITE-COMM','2029-H1',1000,3000,0,'a make-good volume in the following period')
     ON CONFLICT (id) DO NOTHING`);

  /* ------------------------------------------------------- certificates */
  const lot3 = await one('SELECT * FROM lot WHERE reference = $1', ['LOT-N6-0003']);
  const claim3 = { post_consumer: 150000, pre_consumer: 0 };
  const content3 = contentBp(150000, 200000);
  const carbon3 = {
    figure_id: 'CFG-0003', value_mg_per_kg: 4380000, boundary: 'cradle-to-gate',
    method_version: 'CM-PA6 v2', uncertainty_bp: 1500, primary_share_bp: 5200,
    comparator, breakdown: breakdown3,
    energy_location_mg_per_kg: 1960000, energy_market_mg_per_kg: 710000,
    metered_kwh: 90000, retired_kwh: 0, unmatched_kwh: 90000,
  };
  const certTests = [
    { property: 'relative_viscosity', method: 'ISO 307', value: '2.41', unit: 'ratio', uncertainty_bp: 200 },
    { property: 'moisture', method: 'ISO 15512', value: '0.08', unit: 'percent', uncertainty_bp: 300 },
  ];
  const seededCerts = [
    { number: 'CERT-PILOT-000001', recipient: 'CUS-HELIOS', recipient_name: 'Helios Textiles',
      signed_at: '2026-03-02T11:00:00Z', state: 'withdrawn',
      withdrawal: { reason: 'A collector category was corrected after acceptance', withdrawn_on: '2026-04-18', withdrawn_by: P.signer2 } },
    { number: 'CERT-PILOT-000002', recipient: 'CUS-VANTA', recipient_name: 'Vanta Safety Systems',
      signed_at: '2026-03-02T11:05:00Z', state: 'issued', withdrawal: null },
  ];
  for (const cert of seededCerts) {
    const statements = statementsFor('mass_balance', content3, claim3, 'en');
    const conditions = [
      { condition: 'lot_released', satisfied: true, blocking_reference: null, detail: 'the lot disposition is released' },
      { condition: 'no_open_deviation', satisfied: true, blocking_reference: null, detail: 'no deviation touching this lot is open' },
      { condition: 'no_unreviewed_override', satisfied: true, blocking_reference: null, detail: 'every override on this lot is reviewed' },
      { condition: 'bookkeeping_period_closed', satisfied: true, blocking_reference: null, detail: `the bookkeeping for ${PILOT_PERIOD} is settled` },
      { condition: 'balance_invariant_holds', satisfied: true, blocking_reference: null, detail: 'post-consumer available 50000 g, pre-consumer available 0 g' },
      { condition: 'carbon_figure_complete', satisfied: true, blocking_reference: null, detail: '4380000 mg/kg, cradle-to-gate, CM-PA6 v2, uncertainty 1500 bp' },
      { condition: 'signer_holds_scope', satisfied: true, blocking_reference: null, detail: 'signer2@example.com holds SITE-PILOT and the lot is at SITE-PILOT' },
      { condition: 'signer_did_not_enter_data', satisfied: true, blocking_reference: null, detail: "the signer entered none of this lot's data" },
    ];
    const body = {
      number: cert.number, version: 1, site: 'SITE-PILOT',
      lots: [{ reference: 'LOT-N6-0003', mass_g: 200000 }],
      grade: 'N6', specification_version: 3, claim_type: 'mass_balance', content_bp: content3,
      category_split: claim3, period: PILOT_PERIOD, carbon: carbon3, primary_share_bp: 5200,
      scheme: SCHEME, registration: REGISTRATION, test_results: certTests,
      permitted_statement: statements.permitted_statement,
      prohibited_statement: statements.prohibited_statement,
      permitted_statement_recipient_language: statements.permitted_statement_recipient_language,
      signer: 'signer2@example.com', signer_name: 'Pavel Ostrowski', signed_at: cert.signed_at,
      recipient: cert.recipient, recipient_name: cert.recipient_name,
      verification_url: `${VERIFY_BASE}/${cert.number}`,
      state: cert.state, provisional_factor: true, withdrawal: cert.withdrawal,
    };
    const document = renderDocument(body);
    await ins(
      `INSERT INTO certificate (number, version, site, recipient, recipient_name, lots, grade, specification_version,
        claim_type, content_bp, category_split, period, carbon, primary_share_bp, scheme, registration, test_results,
        permitted_statement, prohibited_statement, signer, signer_name, signed_at, verification_url, state,
        provisional_factor, conditions, input_versions, document, withdrawal, language)
       VALUES ($1,1,'SITE-PILOT',$2,$3,$4,'N6',3,'mass_balance',$5,$6,$7,$8,5200,$9,$10,$11,$12,$13,'signer2@example.com',
         'Pavel Ostrowski',$14,$15,$16,true,$17,$18,$19,$20,'en')
       ON CONFLICT (number, version) DO NOTHING`,
      [cert.number, cert.recipient, cert.recipient_name, JSON.stringify([{ reference: 'LOT-N6-0003', mass_g: 200000 }]),
        content3, JSON.stringify(claim3), PILOT_PERIOD, JSON.stringify(carbon3), SCHEME, REGISTRATION,
        JSON.stringify(certTests), statements.permitted_statement, statements.prohibited_statement,
        cert.signed_at, `${VERIFY_BASE}/${cert.number}`, cert.state, JSON.stringify(conditions),
        JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-PILOT-1', specification: 'SPEC-N6 v3', carbon_figure: 'CFG-0003' }),
        document, cert.withdrawal ? JSON.stringify(cert.withdrawal) : null]);
    act({ actor: P.signer2, site: 'SITE-PILOT', action: 'certificate_signed', object_kind: 'certificate', object_ref: cert.number,
      content: { lot: 'LOT-N6-0003', recipient: cert.recipient, content_bp: content3, claim_type: 'mass_balance', conditions } });
  }
  await ins(`UPDATE cert_sequence SET next_number = 3 WHERE site = 'SITE-PILOT'`);
  act({ actor: P.signer2, site: 'SITE-PILOT', action: 'certificate_withdrawn', object_kind: 'certificate', object_ref: 'CERT-PILOT-000001',
    content: { reason: 'A collector category was corrected after acceptance', withdrawn_on: '2026-04-18' } });

  /* ---------------------------------------------------- inbound records */
  const inbound = [
    ['INB-0001', 'weighbridge', '2026-02-20T06:14:00Z',
      { ticket: 'WBT-77120', device: 'WB-DEMO-02', batch: 'BATCH-1004', gross_g: 140000, tare_g: 20000, net_g: 120000, calibration: 'last calibrated 2025-02-01' }],
    ['INB-0002', 'control_system', '2026-03-04T22:41:00Z',
      { run: 'RUN-D-0001', temperature_c: 165, pressure_bar: 3, residence_minutes: 92, recipe: 'RCP-DISS-2' }],
    ['INB-0003', 'laboratory', '2026-03-06T09:02:00Z',
      { lot: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ISO 307', value: '2.43', unit: 'ratio', instrument: 'VIS-3' }],
  ];
  for (const [reference, source, received_at, payload] of inbound) {
    const verbatim = JSON.stringify(payload);
    await ins(
      `INSERT INTO inbound_record (reference, source, received_at, payload, payload_verbatim)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (reference) DO NOTHING`,
      [reference, source, received_at, verbatim, verbatim]);
    act({ actor: 'system', action: 'inbound_record_received', object_kind: 'inbound_record', object_ref: reference,
      content: { source, received_at, payload_verbatim: verbatim } });
  }

  /* ------------------------------------------------------- public site */
  await ins(
    `INSERT INTO statistic (key, value, source, year, geography) VALUES
     ('textiles_recycled','Less than 1 per cent of textiles are recycled into new materials','Textile Flow Monitor',2024,'Global'),
     ('plastics_emissions','1.8 gigatonnes of carbon dioxide equivalent a year from plastics production','Global Materials Emissions Panel',2023,'Global'),
     ('textile_incineration','More than 8 per cent of textile waste is incinerated each year','Textile Flow Monitor',2024,'EU-27')
     ON CONFLICT (key) DO NOTHING`);
  await ins(
    `INSERT INTO position (reference, title, location, department, contract_type, closes_on)
     VALUES ('POS-0001','Process Engineer','Lyon, France','Operations','Permanent','2026-11-30')
     ON CONFLICT (reference) DO NOTHING`);
  await ins(
    `INSERT INTO news_item (reference, title, tag, outlet, published_on, link, language, coverage) VALUES
     ('NEWS-0001','Series A closes at 40 million euros','funding','Materials Weekly','2026-01-22','https://example.com/news/series-a','en',$1),
     ('NEWS-0002','Offtake agreement signed for demonstration output','partnership','Fibre Report','2026-03-11','https://example.com/news/offtake','en',$2),
     ('NEWS-0003','Depolymerisation yield published','technical','Chimie Circulaire','2026-05-06','https://example.com/news/yield','fr',$3)
     ON CONFLICT (reference) DO NOTHING`,
    [JSON.stringify([{ outlet: 'Materials Weekly', link: 'https://example.com/news/series-a', language: 'en' }]),
      JSON.stringify([{ outlet: 'Fibre Report', link: 'https://example.com/news/offtake', language: 'en' }]),
      JSON.stringify([{ outlet: 'Chimie Circulaire', link: 'https://example.com/news/yield', language: 'fr' }])]);
  await ins(
    `INSERT INTO claim_substantiation (reference, claim, route, first_published_on, evidence, evidence_expires_on, method_version, approver, review_on, state) VALUES
     ('CLM-0001','Low-carbon, virgin-quality recycled polymers','/','2026-01-10','Lot carbon figures computed under CM-PA6 v2 against the EcoBase 2025 virgin PA6 comparator','2027-01-20','CM-PA6 v2','Marit Solheim','2026-12-31','published'),
     ('CLM-0002','Low temperature and pressure process','/technology','2026-01-10','Recipe versions RCP-DISS-2 and RCP-PURI-1 with released set points and recorded actuals','2027-01-05','RCP-DISS-2','Marit Solheim','2026-11-30','published'),
     ('CLM-0003','Green chemicals and reagents','/technology','2026-01-10','Supplier declarations for green solvent A held on file and used as supplier-specific factors','2026-09-30','CM-PA6 v2','Marit Solheim','2026-12-31','published')
     ON CONFLICT (reference) DO NOTHING`);

  /* ------------------------------------------- reference counters */
  // The seeded rows took references of their own. The counters start beyond
  // them so a reference is never issued twice.
  const counters = {
    BATCH: 1005, MOV: 200, RUN: 0, CON: 0, OUT: 0, 'LOT-N6': 3, TST: 5, DEV: 2,
    OVR: 1, FND: 1, INB: 3, TRF: 1, RST: 0, RES: 0, CFG: 3, EXP: 0, ENQ: 0,
    HLD: 1, AP: 1, PV: 0, SPI: 2, CNF: 2, CHG: 0, ACK: 0, CAL: 0, CRTP: 0, 'COL-ENQ': 0,
  };
  for (const [prefix, value] of Object.entries(counters)) {
    await ins(
      `INSERT INTO app_meta (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2`,
      ['seq:' + prefix, String(value)]);
  }

  /* -------------------------------------------------------- the record */
  for (const e of acts) await appendEntry(null, e);

  // The seeded legal hold stands on the signing of CERT-PILOT-000001.
  const signingEntry = await one(
    `SELECT seq FROM record_entry WHERE action = 'certificate_signed' AND object_ref = 'CERT-PILOT-000001' LIMIT 1`);
  if (signingEntry) {
    await ins(
      `INSERT INTO legal_hold (reference, seq, placed_by) VALUES ('HLD-0001',$1,$2)
       ON CONFLICT (reference) DO NOTHING`, [signingEntry.seq, P.quality]);
    await appendEntry(null, {
      actor: P.quality, action: 'legal_hold_placed', object_kind: 'legal_hold', object_ref: 'HLD-0001',
      content: { seq: Number(signingEntry.seq), certificate: 'CERT-PILOT-000001' },
    });
  }
}
