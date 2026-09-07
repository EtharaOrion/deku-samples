import { pool } from './db.js';
import { appendEntry } from './record.js';
import { dryMass, creditGranted } from './units.js';

const CAPACITY_BASIS = '8000 hours per year, 0.90 availability, 0.80 yield';
const SCHEME = 'RCS-2026';
const REGISTRATION = 'REG-RAVEL-0042';
const VERIFY_BASE = 'https://ravel.example.com/verify';

const q = (c, text, params) => c.query(text, params);

export async function seedIfEmpty() {
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock(818232)');
    const { rows } = await client.query('select count(*)::int as n from site');
    if (rows[0].n > 0) return { seeded: false };
    await client.query('BEGIN');
    await seed(client);
    await client.query('COMMIT');
    return { seeded: true };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* gone */ }
    throw e;
  } finally {
    await client.query('select pg_advisory_unlock(818232)');
    client.release();
  }
}

async function seed(c) {
  // ---- people -------------------------------------------------------------
  const people = [
    ['PER-001', 'plant@example.com', 'Ines Bekele', 'plant_operator', ['SITE-DEMO', 'SITE-PILOT']],
    ['PER-002', 'analyst@example.com', 'Tomas Vlach', 'lab_analyst', ['SITE-DEMO', 'SITE-PILOT']],
    ['PER-003', 'quality@example.com', 'Marit Solheim', 'quality_manager', ['SITE-DEMO', 'SITE-PILOT']],
    ['PER-004', 'claims@example.com', 'Osei Danquah', 'claims_manager', ['SITE-DEMO', 'SITE-PILOT']],
    ['PER-005', 'signer@example.com', 'Hana Ferreira', 'certificate_signer', ['SITE-DEMO', 'SITE-PILOT']],
    ['PER-006', 'signer2@example.com', 'Pavel Ostrowski', 'certificate_signer', ['SITE-PILOT']],
    ['PER-007', 'auditor@example.com', 'Ruth Lindqvist', 'auditor', ['SITE-DEMO', 'SITE-PILOT']],
  ];
  for (const [id, email, name, role, sites] of people) {
    await q(c, `insert into person (identifier, email, name, role, sites, grant_ends_on)
      values ($1,$2,$3,$4,$5,'2027-06-30')`, [id, email, name, role, sites]);
  }

  // ---- sites --------------------------------------------------------------
  const sites = [
    ['SITE-PILOT', 'Pilot', 'commissioned', 40000, 24000, 'certified'],
    ['SITE-DEMO', 'Demonstration', 'commissioned', 400000, 320000, 'certified'],
    ['SITE-COMM', 'Commercial', 'planned', 25000000, 26000000, 'not_certified'],
  ];
  for (const [ref, name, conf, np, ct, cs] of sites) {
    await q(c, `insert into site (reference,name,confidence,nameplate_kg,contracted_kg,certification_state,capacity_basis,last_revised)
      values ($1,$2,$3,$4,$5,$6,$7,'2026-06-30')`, [ref, name, conf, np, ct, cs, CAPACITY_BASIS]);
    await q(c, `insert into site_certification (site, state, effective_from, recorded_by)
      values ($1,$2,'2026-01-01','system')`, [ref, cs === 'certified' ? 'certified' : 'not_certified']);
    await q(c, 'insert into certificate_sequence (site,last_number) values ($1,0)', [ref]);
  }

  // ---- parties ------------------------------------------------------------
  const collectors = [
    ['COL-ALDER', 'Alder Reclaim', 'PT', 'WCR-PT-4471', '2027-03-31'],
    ['COL-BRINE', 'Brine Textile Recovery', 'NL', 'WCR-NL-2208', '2027-01-31'],
    ['COL-CINDER', 'Cinder Industrial Offcuts', 'FR', 'WCR-FR-6613', '2026-12-31'],
  ];
  const streams = {
    'COL-ALDER': ['post-consumer apparel', 'discarded fishing net'],
    'COL-BRINE': ['post-consumer apparel', 'mixed household textile'],
    'COL-CINDER': ['pre-consumer industrial offcut', 'coated technical fabric'],
  };
  const siteTypes = {
    'COL-ALDER': ['municipal collection point', 'port reception facility'],
    'COL-BRINE': ['municipal collection point', 'charity sorting hall'],
    'COL-CINDER': ['converter works', 'coating line'],
  };
  for (const [ref, name, country, reg, exp] of collectors) {
    await q(c, `insert into collector (reference,name,country,registration,registration_expiry,site_types,declared_streams,scheme_status)
      values ($1,$2,$3,$4,$5,$6,$7,'registered')`,
      [ref, name, country, reg, exp, JSON.stringify(siteTypes[ref]), JSON.stringify(streams[ref])]);
    await q(c, `insert into party_version (reference,kind,name,effective_from) values ($1,'collector',$2,'2026-01-01')`, [ref, name]);
  }
  // COL-BRINE was renamed. A record written before the rename keeps the old name.
  await q(c, `insert into party_version (reference,kind,name,effective_from) values ('COL-BRINE','collector','Brine Circular Materials','2026-08-01')`);
  await q(c, `update party_version set superseded_by = (select id from party_version where reference='COL-BRINE' and effective_from='2026-08-01')
    where reference='COL-BRINE' and effective_from='2026-01-01'`);

  for (const [ref, name] of [['CUS-HELIOS', 'Helios Technical Textiles'], ['CUS-VANTA', 'Vanta Safety Systems']]) {
    await q(c, `insert into party_version (reference,kind,name,effective_from) values ($1,'customer',$2,'2026-01-01')`, [ref, name]);
  }
  await q(c, `insert into party_version (reference,kind,name,effective_from) values ('PRODUCER','producer','Ravel Materials SAS','2026-01-01')`);

  const approvals = [
    ['COL-ALDER', 'approved', '2026-01-01', '2026-12-31', null, null],
    ['COL-BRINE', 'approved', '2026-01-01', '2026-06-30', null, null],
    ['COL-CINDER', 'conditional', '2026-01-01', '2026-12-31', 'Sampling plan for coated streams to be agreed', '2026-10-31'],
  ];
  for (const [col, state, from, to, cond, closes] of approvals) {
    await q(c, `insert into approval_period (collector,state,valid_from,valid_to,condition,condition_closes_on,recorded_by)
      values ($1,$2,$3,$4,$5,$6,'quality@example.com')`, [col, state, from, to, cond, closes]);
  }

  // ---- weighing devices ---------------------------------------------------
  await q(c, `insert into weighing_device (reference,site,calibrated_on) values
    ('WB-DEMO-01','SITE-DEMO','2026-05-01'), ('WB-DEMO-02','SITE-DEMO','2025-02-01')`);

  // ---- batches ------------------------------------------------------------
  const batches = [
    { ref: 'BATCH-1001', col: 'COL-ALDER', cat: 'post_consumer', on: '2026-02-10', net: 500000, moist: 1000, dev: 'WB-DEMO-01',
      comp: { polymer: 'PA6', fraction_bp: 9200, basis: 'sampled', measured_fraction_bp: 9200 },
      cont: { non_nylon_bp: 500, elastane_bp: 400, coatings: 'none observed', colour_load: 'mixed', foreign_matter: 'zips and buttons removed at sorting' }, full: true },
    { ref: 'BATCH-1002', col: 'COL-ALDER', cat: 'pre_consumer', on: '2026-02-12', net: 300000, moist: 0, dev: 'WB-DEMO-01',
      comp: { polymer: 'PA6', fraction_bp: 9600, basis: 'sampled', measured_fraction_bp: 9600 },
      cont: { non_nylon_bp: 300, elastane_bp: 100, coatings: 'none observed', colour_load: 'natural', foreign_matter: 'none' }, full: true },
    { ref: 'BATCH-1003', col: 'COL-BRINE', cat: 'post_consumer', on: '2026-07-05', net: 200000, moist: 500, dev: 'WB-DEMO-01',
      comp: { polymer: 'PA6', fraction_bp: 8800, basis: 'sampled', measured_fraction_bp: 8800 },
      cont: { non_nylon_bp: 900, elastane_bp: 600, coatings: 'light water repellent', colour_load: 'mixed', foreign_matter: 'trim residue' }, full: true },
    { ref: 'BATCH-1004', col: 'COL-CINDER', cat: 'pre_consumer', on: '2026-02-20', net: 120000, moist: 0, dev: 'WB-DEMO-02',
      comp: { polymer: 'PA6', fraction_bp: 9900, basis: 'declared', measured_fraction_bp: 9100 },
      cont: { non_nylon_bp: 400, elastane_bp: 0, coatings: 'polyurethane coated selvedge', colour_load: 'natural', foreign_matter: 'none' }, full: true },
    { ref: 'BATCH-1005', col: 'COL-ALDER', cat: 'post_consumer', on: '2026-03-02', net: 100000, moist: 0, dev: 'WB-DEMO-01',
      comp: { polymer: 'PA6', fraction_bp: 9100, basis: 'declared' },
      cont: { non_nylon_bp: 700, elastane_bp: 300, coatings: 'none observed', colour_load: 'mixed', foreign_matter: 'none' }, full: false },
  ];
  for (const b of batches) {
    const tare = 20000;
    await q(c, `insert into batch (reference,collector,site,grade,category,gross_g,tare_g,net_g,moisture_bp,moisture_method,device,received_on,composition,contamination,accepted_g,event_at,effective_on,created_by)
      values ($1,$2,'SITE-DEMO','N6',$3,$4,$5,$6,$7,'ISO 15512',$8,$9,$10,$11,$6,$12,$9,'plant@example.com')`,
      [b.ref, b.col, b.cat, b.net + tare, tare, b.net, b.moist, b.dev, b.on,
        JSON.stringify(b.comp), JSON.stringify(b.cont), `${b.on}T08:00:00Z`]);
    const kinds = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
    let ordinal = 0;
    for (const kind of kinds) {
      if (!b.full && kind === 'transport') continue;
      await q(c, `insert into custody_link (batch,ordinal,kind,link_date,party) values ($1,$2,$3,$4,$5)`,
        [b.ref, ordinal++, kind, b.on, kind === 'collection_site' || kind === 'collector' || kind === 'transport' ? b.col : 'SITE-DEMO']);
    }
    await q(c, `insert into weighing (reference,batch,device,gross_g,tare_g,net_g,calibration_state,weighed_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [`WGH-${b.ref.slice(-4)}`, b.ref, b.dev, b.net + tare, tare, b.net,
        b.dev === 'WB-DEMO-02' ? 'lapsed' : 'in_calibration', `${b.on}T07:45:00Z`]);
  }

  // A measured composition 800 basis points from the declaration stands as a
  // finding against the collector, not against the plant.
  await q(c, `insert into finding (reference,collector,kind,detail,raised_on,due_on,state,batch)
    values ('FND-0001','COL-CINDER','declaration_departure',
    'Declared PA6 fraction 9900 bp, measured 9100 bp on BATCH-1004: a departure of 800 basis points beyond the 500 basis point tolerance.',
    '2026-02-21','2026-05-21','open','BATCH-1004')`);

  // ---- recipes ------------------------------------------------------------
  const recipes = [
    ['RCP-DISS-2', 'dissolution', 2, { temperature_c: 165, pressure_bar: 3 }, { temperature_c: [160, 170], pressure_bar: [2, 4] }, 180],
    ['RCP-DEPO-4', 'depolymerisation', 4, { temperature_c: 240, pressure_bar: 6 }, { temperature_c: [230, 250], pressure_bar: [5, 7] }, 240],
    ['RCP-PURI-1', 'purification', 1, { temperature_c: 120, pressure_bar: 1 }, { temperature_c: [110, 130], pressure_bar: [1, 2] }, 120],
    ['RCP-REPO-3', 'repolymerisation', 3, { temperature_c: 255, pressure_bar: 8 }, { temperature_c: [245, 265], pressure_bar: [7, 9] }, 300],
  ];
  for (const [ref, type, ver, sp, tol, rt] of recipes) {
    await q(c, `insert into recipe_version (reference,run_type,version,set_points,tolerances,reagents,residence_time_min,released_by,published_on)
      values ($1,$2,$3,$4,$5,$6,$7,'quality@example.com','2026-01-05')`,
      [ref, type, ver, JSON.stringify(sp), JSON.stringify(tol),
        JSON.stringify([{ reagent: 'green solvent blend', ratio_bp: 4000 }]), rt]);
  }

  // ---- runs, consumptions, outputs ---------------------------------------
  const runs = [
    ['RUN-D-0001', 'dissolution', 'RCP-DISS-2', 'EQ-DISS-A', '2026-03-04', 120000, { temperature_c: 165, pressure_bar: 3 }, true],
    ['RUN-D-0002', 'dissolution', 'RCP-DISS-2', 'EQ-DISS-A', '2026-03-05', 60000, { temperature_c: 172, pressure_bar: 3 }, false],
    ['RUN-D-0003', 'dissolution', 'RCP-DISS-2', 'EQ-DISS-B', '2026-03-06', 30000, { temperature_c: 164, pressure_bar: 3 }, true],
    ['RUN-Y-0001', 'depolymerisation', 'RCP-DEPO-4', 'EQ-DEPO-A', '2026-03-09', 50000, { temperature_c: 241, pressure_bar: 6 }, true],
    ['RUN-U-0001', 'purification', 'RCP-PURI-1', 'EQ-PURI-A', '2026-03-11', 40000, { temperature_c: 121, pressure_bar: 1 }, true],
    ['RUN-R-0001', 'repolymerisation', 'RCP-REPO-3', 'EQ-REPO-A', '2026-03-13', 20000, { temperature_c: 256, pressure_bar: 8 }, true],
  ];
  for (const [ref, type, recipe, equip, day, losses, actual, ok] of runs) {
    await q(c, `insert into run (reference,run_type,site,equipment,recipe_version,operator,started_at,closed_at,state,losses_g,actual_set_points,within_tolerance,event_at,effective_on,created_by)
      values ($1,$2,'SITE-DEMO',$3,$4,'plant@example.com',$5,$6,'closed',$7,$8,$9,$5,$10,'plant@example.com')`,
      [ref, type, equip, recipe, `${day}T06:00:00Z`, `${day}T18:00:00Z`, losses, JSON.stringify(actual), ok, day]);
  }
  const consumptions = [
    ['CSM-0001', 'RUN-D-0001', 'batch', 'BATCH-1001', 300000, '2026-03-04'],
    ['CSM-0002', 'RUN-D-0001', 'batch', 'BATCH-1002', 300000, '2026-03-04'],
    ['CSM-0003', 'RUN-D-0002', 'batch', 'BATCH-1003', 190000, '2026-03-05'],
    ['CSM-0004', 'RUN-D-0002', 'batch', 'BATCH-1004', 120000, '2026-03-05'],
    ['CSM-0005', 'RUN-D-0003', 'batch', 'BATCH-1001', 150000, '2026-03-06'],
    ['CSM-0006', 'RUN-Y-0001', 'output', 'OUT-D-0001', 480000, '2026-03-09'],
    ['CSM-0007', 'RUN-Y-0001', 'output', 'OUT-D-0002', 250000, '2026-03-09'],
    ['CSM-0008', 'RUN-Y-0001', 'output', 'OUT-D-0003', 120000, '2026-03-09'],
    ['CSM-0009', 'RUN-U-0001', 'output', 'OUT-Y-0001', 800000, '2026-03-11'],
    ['CSM-0010', 'RUN-R-0001', 'output', 'OUT-U-0001', 720000, '2026-03-13'],
  ];
  // Consumed dry mass: a batch consumption carries the moisture of its batch;
  // an intermediate is already dry.
  const moistureByBatch = Object.fromEntries(batches.map((b) => [b.ref, b.moist]));
  for (const [ref, run, kind, input, mass, day] of consumptions) {
    const dry = kind === 'batch' ? dryMass(mass, moistureByBatch[input]) : mass;
    await q(c, `insert into consumption (reference,run,input_kind,input_reference,mass_g,dry_mass_g,event_at,effective_on,created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,'plant@example.com')`,
      [ref, run, kind, input, mass, dry, `${day}T09:00:00Z`, day]);
  }
  const outputs = [
    ['OUT-D-0001', 'RUN-D-0001', 'intermediate', 480000, null, '2026-03-04'],
    ['OUT-D-0002', 'RUN-D-0002', 'intermediate', 250000, null, '2026-03-05'],
    ['OUT-D-0003', 'RUN-D-0003', 'intermediate', 120000, null, '2026-03-06'],
    ['OUT-Y-0001', 'RUN-Y-0001', 'intermediate', 800000, null, '2026-03-09'],
    ['OUT-U-0001', 'RUN-U-0001', 'intermediate', 720000, null, '2026-03-11'],
    ['OUT-U-0002', 'RUN-U-0001', 'byproduct', 40000, 'sold', '2026-03-11'],
    ['LOT-N6-0001', 'RUN-R-0001', 'lot', 400000, null, '2026-03-13'],
    ['LOT-N6-0002', 'RUN-R-0001', 'lot', 300000, null, '2026-03-13'],
  ];
  for (const [ref, run, kind, mass, disp, day] of outputs) {
    await q(c, `insert into output (reference,run,kind,mass_g,disposition,allocation_basis,event_at,effective_on,created_by)
      values ($1,$2,$3,$4,$5,'mass',$6,$7,'plant@example.com')`,
      [ref, run, kind, mass, disp, `${day}T17:00:00Z`, day]);
  }

  // ---- lots ---------------------------------------------------------------
  await q(c, `insert into lot (reference,grade,site,sites,mass_g,disposition,disposition_by,disposition_at,claim_type,output_reference,specification_version,provisional_factor,event_at,effective_on,created_by) values
    ('LOT-N6-0001','N6','SITE-DEMO','["SITE-DEMO"]',400000,'released','quality@example.com','2026-03-18T10:00:00Z','mass_balance','LOT-N6-0001',3,false,'2026-03-13T17:00:00Z','2026-03-13','plant@example.com'),
    ('LOT-N6-0002','N6','SITE-DEMO','["SITE-DEMO"]',300000,'quarantined','quality@example.com','2026-03-15T10:00:00Z','mass_balance','LOT-N6-0002',3,false,'2026-03-13T17:00:00Z','2026-03-13','plant@example.com'),
    ('LOT-N6-0003','N6','SITE-PILOT','["SITE-PILOT"]',200000,'released','quality@example.com','2026-02-24T10:00:00Z','mass_balance',null,3,true,'2026-02-20T17:00:00Z','2026-02-20','plant@example.com')`);

  // ---- test results -------------------------------------------------------
  await q(c, `insert into test_result (reference,subject_kind,subject_reference,property,method,instrument,analyst,value,unit,uncertainty_bp,entered_by,event_at,effective_on) values
    ('TST-0001','lot','LOT-N6-0001','relative_viscosity','ISO 307','VIS-02','analyst@example.com','2.44','ratio',80,'analyst@example.com','2026-03-14T09:00:00Z','2026-03-14'),
    ('TST-0002','lot','LOT-N6-0001','moisture','ISO 15512','KF-01','analyst@example.com','0.06','percent',120,'analyst@example.com','2026-03-14T09:20:00Z','2026-03-14'),
    ('TST-0003','lot','LOT-N6-0003','relative_viscosity','ISO 307','VIS-02','analyst@example.com','2.41','ratio',80,'analyst@example.com','2026-02-22T09:00:00Z','2026-02-22'),
    ('TST-0004','lot','LOT-N6-0003','moisture','ISO 15512','KF-01','analyst@example.com','0.08','percent',120,'analyst@example.com','2026-02-22T09:20:00Z','2026-02-22'),
    ('TST-0005','lot','LOT-N6-0002','relative_viscosity','ISO 307','VIS-02','analyst@example.com','2.31','ratio',80,'analyst@example.com','2026-03-14T10:00:00Z','2026-03-14')`);

  // ---- deviations and the override ---------------------------------------
  await q(c, `insert into deviation (reference,state,runs,lots,detail,outcome,raised_by,raised_on,closed_by,closed_on) values
    ('DEV-0001','open','{RUN-U-0001}','{LOT-N6-0002}','Purification column differential pressure drifted above the recipe band for part of the run.',null,'quality@example.com','2026-03-12',null,null),
    ('DEV-0002','closed','{RUN-D-0002}','{}','Dissolution temperature reached 172 C against a recipe band of 160 to 170 C.','cause_not_established','quality@example.com','2026-03-05','quality@example.com','2026-03-20')`);
  await q(c, `insert into override (reference,separation,reason,lot,authorised_by,created_by,created_on,reviewed) values
    ('OVR-0001','analyst_not_dispositioner','Night shift analyst dispositioned the lot because no second qualified person was on site','LOT-N6-0001','quality@example.com','quality@example.com','2026-03-18',false)`);

  // ---- conversion factors -------------------------------------------------
  await q(c, `insert into conversion_factor (reference,site,version,factor_bp,derived_from,derived_to,derived_in_g,derived_out_g,provisional,published_by,published_at) values
    ('CF-DEMO-1','SITE-DEMO',1,8000,'2026-01-01','2026-03-31',1000000,800000,false,'claims@example.com','2026-01-05T10:00:00Z'),
    ('CF-PILOT-1','SITE-PILOT',1,7500,null,null,0,0,true,'claims@example.com','2026-01-05T10:05:00Z')`);

  // ---- balance periods ----------------------------------------------------
  await q(c, `insert into balance_period (id,site,grade,period_from,period_to,state,carry_over_limit_bp,allocation_basis,metered_kwh,closed_on,cut_off,closed_by,carried_forward,expired) values
    ('BP-DEMO-N6-2025H2','SITE-DEMO','N6','2025-07-01','2025-12-31','closed',2000,'mass',0,'2026-01-15','2026-01-10','claims@example.com','{"post_consumer":0,"pre_consumer":0}','{"post_consumer":0,"pre_consumer":0}'),
    ('BP-DEMO-N6-2026H1','SITE-DEMO','N6','2026-01-01','2026-06-30','open',2000,'mass',300000,null,null,null,null,null),
    ('BP-PILOT-N6-2026H1','SITE-PILOT','N6','2026-01-01','2026-06-30','open',2000,'mass',60000,null,null,null,null,null)`);

  // Credits enter when a claimable batch is consumed: dry mass times the
  // site's factor. A non-claimable batch enters as non-claimable input.
  const creditRows = [
    ['BATCH-1001', 'post_consumer', 450000, true],
    ['BATCH-1002', 'pre_consumer', 300000, true],
    ['BATCH-1003', 'non_claimable', 190000, false],
    ['BATCH-1004', 'pre_consumer', 120000, true],
  ];
  for (const [batch, cat, dry, claimable] of creditRows) {
    if (claimable) {
      const credit = creditGranted(dry, 8000);
      await q(c, `insert into credit_movement (period,category,direction,mass_g,source_kind,source_reference,derivation,effective_on)
        values ('BP-DEMO-N6-2026H1',$1,'in',$2,'consumption',$3,$4,'2026-03-05')`,
        [cat, credit, batch, JSON.stringify({
          formula: 'dry_mass_consumed_g * factor_bp / 10000, floored',
          dry_mass_consumed_g: dry, factor_bp: 8000, factor: 'CF-DEMO-1',
        })]);
    } else {
      // Non-claimable input is recorded as a movement of no direction: it is
      // input the period saw and credit it never granted.
      await q(c, `insert into credit_movement (period,category,direction,mass_g,source_kind,source_reference,derivation,effective_on)
        values ('BP-DEMO-N6-2026H1','post_consumer','none',$1,'non_claimable_consumption',$2,$3,'2026-03-05')`,
        [dry, batch, JSON.stringify({ reason: 'collector_approval_lapsed', dry_mass_consumed_g: dry, credit_granted_g: 0 })]);
    }
  }
  // The pilot ledger opened on commissioning credit rather than on runs of its own.
  await q(c, `insert into credit_movement (period,category,direction,mass_g,source_kind,source_reference,derivation,effective_on)
    values ('BP-PILOT-N6-2026H1','post_consumer','in',250000,'consumption','COMMISSIONING-PILOT',$1,'2026-01-02')`,
    [JSON.stringify({ formula: 'dry_mass_consumed_g * factor_bp / 10000, floored', dry_mass_consumed_g: 333333, factor_bp: 7500, factor: 'CF-PILOT-1' })]);
  // TRF-0001: 50000 g moved from the pilot ledger to the demonstration ledger.
  await q(c, `insert into transfer (reference,from_period,to_period,category,mass_g,moved_on,created_by)
    values ('TRF-0001','BP-PILOT-N6-2026H1','BP-DEMO-N6-2026H1','post_consumer',50000,'2026-05-12','claims@example.com')`);
  await q(c, `insert into credit_movement (period,category,direction,mass_g,source_kind,source_reference,derivation,effective_on)
    values ('BP-PILOT-N6-2026H1','post_consumer','out',50000,'transfer_out','TRF-0001','{"transfer":"TRF-0001","to":"BP-DEMO-N6-2026H1"}','2026-05-12')`);
  await q(c, `insert into credit_movement (period,category,direction,mass_g,source_kind,source_reference,origin_site,movement_reference,fresh_credit,derivation,effective_on)
    values ('BP-DEMO-N6-2026H1','post_consumer','inbound',50000,'transfer_in','TRF-0001','SITE-PILOT','TRF-0001',false,'{"transfer":"TRF-0001","from":"BP-PILOT-N6-2026H1"}','2026-05-12')`);

  // ---- carbon -------------------------------------------------------------
  await q(c, `insert into carbon_method (id,name,standard,functional_unit) values ('CM-PA6','Polyamide 6 product carbon footprint','ISO 14067','1 kg of pellet')`);
  const factors2 = [
    { name: 'grid electricity EU-27', source: 'EcoBase 2025', year: 2025, value_mg_per_kg: 410000 },
    { name: 'process steam', source: 'EcoBase 2025', year: 2025, value_mg_per_kg: 180000 },
    { name: 'road freight', source: 'Transport Emissions Register', year: 2024, value_mg_per_kg: 62000 },
    { name: 'green solvent blend', source: 'Supplier declaration', year: 2026, value_mg_per_kg: 240000 },
  ];
  await q(c, `insert into carbon_method_version (method,version,standard,functional_unit,boundary,allocation_basis,reviewer,published_on,published_by,data_quality_rules,emission_factors,primary_threshold_bp,superseded)
    values ('CM-PA6',1,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2025-09-14','quality@example.com',$1,$2,5000,true)`,
    [JSON.stringify(['Primary data required for process energy', 'Supplier-specific factors preferred for reagents']),
      JSON.stringify(factors2.slice(0, 3))]);
  await q(c, `insert into carbon_method_version (method,version,standard,functional_unit,boundary,allocation_basis,reviewer,published_on,published_by,data_quality_rules,emission_factors,primary_threshold_bp,superseded)
    values ('CM-PA6',2,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2026-01-20','quality@example.com',$1,$2,5000,false)`,
    [JSON.stringify([
      'Primary data required for process energy',
      'Supplier-specific factors preferred for reagents',
      'Secondary data permitted for outbound transport and residues',
      'A figure below 5000 basis points of primary data is reported as default-led']),
      JSON.stringify(factors2)]);

  const breakdown = [
    { line: 'collection_and_transport', mg_per_kg: 310000, tag: 'primary' },
    { line: 'process_energy', mg_per_kg: 1850000, tag: 'primary' },
    { line: 'reagents', mg_per_kg: 1180000, tag: 'supplier_specific' },
    { line: 'water_and_effluent', mg_per_kg: 240000, tag: 'primary' },
    { line: 'waste_and_residues', mg_per_kg: 330000, tag: 'secondary' },
    { line: 'outbound_transport', mg_per_kg: 410000, tag: 'secondary' },
    { line: 'byproduct_credit', mg_per_kg: -60000, tag: 'primary' },
  ];
  const comparator = { material: 'virgin PA6', dataset: 'EcoBase 2025', dataset_year: 2025, region: 'EU-27', value_mg_per_kg: 5850000 };
  const energy = { energy_location_mg_per_kg: 1850000, energy_market_mg_per_kg: 620000, metered_kwh: 300000 };
  await q(c, `insert into carbon_figure (id,lot,version,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,boundary,allocation_basis,comparator,breakdown,energy,input_versions,computed_at,computed_by)
    values ('CFG-0001','LOT-N6-0001',1,'CM-PA6',2,4260000,1200,6500,'cradle-to-gate','mass',$1,$2,$3,$4,'2026-03-14T12:00:00Z','claims@example.com')`,
    [JSON.stringify(comparator), JSON.stringify(breakdown), JSON.stringify(energy),
      JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1 v1', specification: 'SPEC-N6 v3', recipes: ['RCP-DISS-2', 'RCP-DEPO-4', 'RCP-PURI-1', 'RCP-REPO-3'] })]);

  const pilotBreakdown = [
    { line: 'collection_and_transport', mg_per_kg: 340000, tag: 'primary' },
    { line: 'process_energy', mg_per_kg: 2010000, tag: 'primary' },
    { line: 'reagents', mg_per_kg: 1240000, tag: 'supplier_specific' },
    { line: 'water_and_effluent', mg_per_kg: 260000, tag: 'primary' },
    { line: 'waste_and_residues', mg_per_kg: 360000, tag: 'secondary' },
    { line: 'outbound_transport', mg_per_kg: 430000, tag: 'secondary' },
  ];
  await q(c, `insert into carbon_figure (id,lot,version,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,boundary,allocation_basis,comparator,breakdown,energy,input_versions,computed_at,computed_by)
    values ('CFG-0002','LOT-N6-0003',1,'CM-PA6',2,4640000,1500,5600,'cradle-to-gate','mass',$1,$2,$3,$4,'2026-02-23T12:00:00Z','claims@example.com')`,
    [JSON.stringify(comparator), JSON.stringify(pilotBreakdown),
      JSON.stringify({ energy_location_mg_per_kg: 2010000, energy_market_mg_per_kg: 760000, metered_kwh: 60000 }),
      JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-PILOT-1 v1', specification: 'SPEC-N6 v3' })]);
  await q(c, `insert into carbon_figure (id,lot,version,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,boundary,allocation_basis,comparator,breakdown,energy,input_versions,computed_at,computed_by)
    values ('CFG-0003','LOT-N6-0002',1,'CM-PA6',2,4410000,1300,6100,'cradle-to-gate','mass',$1,$2,$3,$4,'2026-03-14T12:10:00Z','claims@example.com')`,
    [JSON.stringify(comparator), JSON.stringify(breakdown.map((b) => ({ ...b, mg_per_kg: b.line === 'process_energy' ? 2000000 : b.mg_per_kg }))),
      JSON.stringify({ energy_location_mg_per_kg: 2000000, energy_market_mg_per_kg: 680000, metered_kwh: 300000 }),
      JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1 v1' })]);
  await q(c, `update carbon_figure set value_mg_per_kg = (select sum((l->>'mg_per_kg')::bigint) from jsonb_array_elements(breakdown) l) where id in ('CFG-0002','CFG-0003')`);

  await q(c, `insert into energy_instrument (reference,quantity_kwh,vintage,region,state,retired_against,retired_at) values
    ('EAC-2026-0007',250000,2026,'EU-27','retired','BP-DEMO-N6-2026H1','2026-06-01T09:00:00Z'),
    ('EAC-2025-0031',100000,2025,'EU-27','held',null,null)`);

  // ---- specifications and customers --------------------------------------
  const specProps = [
    { property: 'relative_viscosity', method: 'ISO 307', limit: '2.40', unit: 'ratio', basis: 'guaranteed' },
    { property: 'moisture', method: 'ISO 15512', limit: '0.10', unit: 'percent', basis: 'guaranteed' },
    { property: 'yellowness_index', method: 'ASTM E313', limit: '8.0', unit: 'index', basis: 'typical' },
    { property: 'ash_content', method: 'ISO 3451-1', limit: '0.30', unit: 'percent', basis: 'informational' },
  ];
  const virgin = { reference: 'virgin PA6 at relative viscosity 2.42', source: 'EcoBase 2025', date: '2025-11-30' };
  await q(c, `insert into specification (grade,version,issued_on,properties,virgin_reference,superseded) values
    ('N6',2,'2025-06-01',$1,$2,true), ('N6',3,'2026-02-01',$3,$4,false)`,
    [JSON.stringify(specProps.slice(0, 3)), JSON.stringify(virgin), JSON.stringify(specProps), JSON.stringify(virgin)]);
  await q(c, `insert into customer (reference,name,contact,holds_specification_version,application,industry,language) values
    ('CUS-HELIOS','Helios Technical Textiles','helios@example.com',3,'technical apparel yarn','textiles','en'),
    ('CUS-VANTA','Vanta Safety Systems','vanta@example.com',2,'airbag fabric','automotive','en')`);
  await q(c, `insert into specification_issue (grade,version,customer,issued_on,issued_by) values
    ('N6',3,'CUS-HELIOS','2026-02-01','quality@example.com'), ('N6',2,'CUS-VANTA','2025-06-05','quality@example.com')`);
  await q(c, `insert into conformance (customer,application,specification_version,trials,started_on,completed_on,outcome) values
    ('CUS-HELIOS','technical apparel yarn',3,$1,'2026-02-10','2026-03-01','passed'),
    ('CUS-VANTA','airbag fabric',2,$2,'2025-07-01','2025-10-15','passed')`,
    [JSON.stringify([{ trial: 'spinning trial', run_on: '2026-02-14', outcome: 'passed' }, { trial: 'dye uptake', run_on: '2026-02-20', outcome: 'passed' }]),
      JSON.stringify([{ trial: 'weave trial', run_on: '2025-08-02', outcome: 'passed' }, { trial: 'ageing 1000 h', run_on: '2025-09-30', outcome: 'passed' }])]);

  // ---- contracts ----------------------------------------------------------
  await q(c, `insert into contract (id,recipient,site,period,committed_kg,floor_bp,delivered_kg,shortfall_consequence) values
    ('CON-HELIOS-1','CUS-HELIOS','SITE-DEMO','2026-H1',200,5000,0,'a replacement volume at the contracted price in the following quarter'),
    ('CON-VANTA-1','CUS-VANTA','SITE-COMM','2029-H1',1000,3000,0,'a make-good volume in the following period')`);

  // ---- certificates -------------------------------------------------------
  await seedCertificates(c);

  // ---- inbound records ----------------------------------------------------
  const inbound = [
    ['INB-0001', 'weighbridge', '2026-02-20T06:14:00Z', { ticket: 'WB2-88213', device: 'WB-DEMO-02', batch: 'BATCH-1004', gross_g: 140000, tare_g: 20000, net_g: 120000, calibration_state: 'lapsed', calibrated_on: '2025-02-01' }],
    ['INB-0002', 'control_system', '2026-03-04T22:41:00Z', { run: 'RUN-D-0001', temperature_c: 165, pressure_bar: 3, residence_time_min: 182, recorded_by: 'DCS-01' }],
    ['INB-0003', 'laboratory', '2026-03-06T09:02:00Z', { lot: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ISO 307', value: '2.44', unit: 'ratio', instrument: 'VIS-02' }],
  ];
  for (const [ref, source, at, payload] of inbound) {
    const verbatim = JSON.stringify(payload);
    await q(c, `insert into inbound_record (reference,source,received_at,payload,payload_verbatim,recorded_at) values ($1,$2,$3,$4,$5,$3)`,
      [ref, source, at, verbatim, verbatim]);
  }

  // ---- public site --------------------------------------------------------
  await q(c, `insert into statistic (key,value,source,year,geography) values
    ('textiles_recycled','Less than 1 per cent of textiles are recycled into new materials','Textile Flow Monitor',2024,'Global'),
    ('plastics_emissions','1.8 gigatonnes of carbon dioxide equivalent a year from plastics production','Global Materials Emissions Panel',2023,'Global'),
    ('textile_incineration','More than 8 per cent of textile waste is incinerated each year','Textile Flow Monitor',2024,'EU-27')`);
  await q(c, `insert into position (reference,title,location,department,contract_type,closes_on) values
    ('POS-0001','Process Engineer','Lyon, France','Operations','Permanent','2026-11-30')`);
  await q(c, `insert into news_item (reference,title,tag,outlet,published_on,link,language,summary) values
    ('NEW-0001','Series A closes at 40 million euros','funding','Materials Weekly','2026-01-22','https://example.com/news/series-a','en','The round funds the demonstration plant and the first commercial line.'),
    ('NEW-0002','Offtake agreement signed for demonstration output','partnership','Fibre Report','2026-03-11','https://example.com/news/offtake','en','A multi-year offtake covering the demonstration plant''s nylon 6 output.'),
    ('NEW-0003','Depolymerisation yield published','technical','Chimie Circulaire','2026-05-06','https://example.com/news/rendement','fr','Le rendement de dépolymérisation est publié avec sa méthode et ses bornes.')`);
  await q(c, `insert into claim_substantiation (reference,claim,route,first_published_on,evidence,evidence_expires_on,method_version,approver,review_on,state) values
    ('CLM-0001','Low-carbon, virgin-quality recycled Nylon 6','/product','2026-01-20','Carbon figure CFG-0001 computed against CM-PA6 v2 with an uncertainty of 1200 basis points','2027-01-20','CM-PA6 v2','quality@example.com','2026-12-01','published'),
    ('CLM-0002','Less than 1 per cent of textiles are recycled into new materials','/about','2026-01-20','Textile Flow Monitor 2024, Global','2026-09-30','n/a','quality@example.com','2026-10-15','published'),
    ('CLM-0003','Low temperature and pressure process','/technology','2026-01-20','Recipe versions RCP-DISS-2 and RCP-PURI-1 with released set points','2027-06-30','n/a','quality@example.com','2027-01-15','published')`);

  await q(c, `insert into legal_hold (reference,seq,placed_by) values ('HLD-0001',0,'auditor@example.com')`);

  await seedRecord(c);
}

function certificateDocument(cert) {
  const pct = (bp) => `${Math.floor(bp / 100)}.${String(bp % 100).padStart(2, '0')} per cent`;
  const lines = [];
  lines.push('RAVEL MATERIALS SAS');
  lines.push('RECYCLED CONTENT AND CARBON CERTIFICATE');
  lines.push('');
  if (cert.state === 'withdrawn' && cert.withdrawal) {
    lines.push('STATE');
    lines.push(`withdrawn. This certificate was withdrawn on ${cert.withdrawal.withdrawn_on}. Reason: ${cert.withdrawal.reason}.`);
    lines.push('');
  }
  lines.push('CERTIFICATE');
  lines.push(`Number: ${cert.number}`);
  lines.push(`Version: ${cert.version}`);
  lines.push(`Issued on: ${cert.issued_on}`);
  lines.push(`Site: ${cert.site}`);
  lines.push(`Scheme: ${cert.scheme}`);
  lines.push(`Producer registration: ${cert.registration}`);
  lines.push('');
  lines.push('CLAIM TYPE');
  lines.push(cert.claim_type);
  lines.push('');
  lines.push('RECYCLED CONTENT');
  lines.push(`${pct(cert.content_bp)} (${cert.content_bp} basis points), claim type ${cert.claim_type}`);
  lines.push(`Post-consumer: ${cert.category_split.post_consumer} g`);
  lines.push(`Pre-consumer: ${cert.category_split.pre_consumer} g`);
  lines.push('');
  lines.push('MATERIAL');
  lines.push(`Grade: ${cert.grade}`);
  lines.push(`Specification version: ${cert.specification_version}`);
  for (const l of cert.lots) lines.push(`Lot ${l.reference}: ${l.mass_g} g`);
  lines.push(`Bookkeeping period: ${cert.period}`);
  lines.push('');
  lines.push('CARBON');
  lines.push(`Value: ${cert.carbon.value_mg_per_kg} mg CO2e per kg`);
  lines.push(`Boundary: ${cert.carbon.boundary}`);
  lines.push(`Method version: ${cert.carbon.method_version_label}`);
  lines.push(`Uncertainty: ${cert.carbon.uncertainty_bp} basis points`);
  lines.push(`Primary data share: ${cert.primary_share_bp} basis points`);
  lines.push(`Comparator: ${cert.carbon.comparator.material}, ${cert.carbon.comparator.dataset}, ${cert.carbon.comparator.dataset_year}, ${cert.carbon.comparator.region}`);
  lines.push('The breakdown is attached to this certificate as a separate schedule.');
  if (cert.provisional_factor) {
    lines.push('');
    lines.push('This certificate rests on a provisional conversion factor.');
  }
  lines.push('');
  lines.push('TEST RESULTS');
  for (const t of cert.test_results) lines.push(`${t.property}: ${t.value} ${t.unit} by ${t.method}`);
  lines.push('');
  lines.push('RECIPIENT');
  lines.push(cert.recipient_name);
  lines.push('');
  lines.push('PERMITTED STATEMENT');
  lines.push(cert.permitted_statement);
  lines.push('');
  lines.push('PROHIBITED STATEMENT');
  lines.push(cert.prohibited_statement);
  lines.push('');
  lines.push('SIGNATURE');
  lines.push(`Signed by: ${cert.signer_name} (${cert.signer})`);
  lines.push(`Signed at: ${cert.signed_at}`);
  lines.push('');
  lines.push('VERIFICATION');
  lines.push(`Verify this certificate at ravel.example.com/verify/${cert.number}.`);
  return lines.join('\n');
}

export { certificateDocument };

async function seedCertificates(c) {
  const carbon = {
    value_mg_per_kg: 4640000,
    boundary: 'cradle-to-gate',
    method_version: 2,
    method_version_label: 'CM-PA6 v2',
    uncertainty_bp: 1500,
    comparator: { material: 'virgin PA6', dataset: 'EcoBase 2025', dataset_year: 2025, region: 'EU-27', value_mg_per_kg: 5850000 },
    allocation_basis: 'mass',
  };
  const tests = [
    { property: 'relative_viscosity', method: 'ISO 307', value: '2.41', unit: 'ratio' },
    { property: 'moisture', method: 'ISO 15512', value: '0.08', unit: 'percent' },
  ];
  const conditions = [
    { condition: 'lot_released', satisfied: true, blocking_reference: null },
    { condition: 'no_open_deviation', satisfied: true, blocking_reference: null },
    { condition: 'no_unreviewed_override', satisfied: true, blocking_reference: null },
    { condition: 'period_closed', satisfied: true, blocking_reference: null },
    { condition: 'balance_invariant_holds', satisfied: true, blocking_reference: null },
    { condition: 'carbon_figure_complete', satisfied: true, blocking_reference: null },
    { condition: 'signer_holds_scope', satisfied: true, blocking_reference: null },
    { condition: 'signer_did_not_enter_data', satisfied: true, blocking_reference: null },
  ];
  const base = {
    version: 1,
    site: 'SITE-PILOT',
    lots: [{ reference: 'LOT-N6-0003', mass_g: 200000 }],
    grade: 'N6',
    specification_version: 3,
    claim_type: 'mass_balance',
    content_bp: 7500,
    category_split: { post_consumer: 150000, pre_consumer: 0 },
    period: 'BP-PILOT-N6-2026H1',
    carbon,
    primary_share_bp: 5600,
    scheme: 'RCS-2026',
    registration: 'REG-RAVEL-0042',
    test_results: tests,
    signer: 'signer2@example.com',
    signer_name: 'Pavel Ostrowski',
    provisional_factor: true,
  };
  const permitted = (contentBp) =>
    `This material is claimed by mass balance. It is not physically segregated. The recipient may state that ${Math.floor(contentBp / 100)}.${String(contentBp % 100).padStart(2, '0')} per cent recycled content, of which the post-consumer and pre-consumer split is stated on this certificate, has been allocated to this delivery under ${SCHEME}.`;
  const prohibited = 'You may not state that this material physically contains recycled content.';

  const certs = [
    { number: 'CERT-PILOT-000001', recipient: 'CUS-HELIOS', recipient_name: 'Helios Technical Textiles', state: 'withdrawn', issued_on: '2026-03-02', signed_at: '2026-03-02T11:00:00Z',
      withdrawal: { reason: 'A collector category was corrected after acceptance', withdrawn_by: 'signer2@example.com', withdrawn_on: '2026-04-18' } },
    { number: 'CERT-PILOT-000002', recipient: 'CUS-VANTA', recipient_name: 'Vanta Safety Systems', state: 'issued', issued_on: '2026-03-05', signed_at: '2026-03-05T11:00:00Z', withdrawal: null },
  ];
  for (const meta of certs) {
    const cert = { ...base, ...meta, permitted_statement: permitted(base.content_bp), prohibited_statement: prohibited, verification_url: `${VERIFY_BASE}/${meta.number}`, conditions };
    const document = certificateDocument(cert);
    await q(c, `insert into certificate (number,version,site,lots,grade,specification_version,claim_type,content_bp,category_split,period,carbon,primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,signer,signer_name,signed_at,verification_url,state,provisional_factor,recipient,recipient_name,recipient_language,conditions,document,withdrawal,issued_on)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,'en',$26,$27,$28,$29)`,
      [cert.number, cert.version, cert.site, JSON.stringify(cert.lots), cert.grade, cert.specification_version, cert.claim_type,
        cert.content_bp, JSON.stringify(cert.category_split), cert.period, JSON.stringify(cert.carbon), cert.primary_share_bp,
        cert.scheme, cert.registration, JSON.stringify(cert.test_results), cert.permitted_statement, cert.prohibited_statement,
        cert.signer, cert.signer_name, cert.signed_at, cert.verification_url, cert.state, cert.provisional_factor,
        cert.recipient, cert.recipient_name, JSON.stringify(cert.conditions), document,
        cert.withdrawal ? JSON.stringify(cert.withdrawal) : null, cert.issued_on]);
  }
  await q(c, "update certificate_sequence set last_number = 2 where site = 'SITE-PILOT'");
  // The pilot ledger paid for both certificates.
  await q(c, `insert into credit_movement (period,category,direction,mass_g,source_kind,source_reference,lot,derivation,effective_on)
    values ('BP-PILOT-N6-2026H1','pre_consumer','out',150000,'allocation','ALO-SEED-1','LOT-N6-0003',$1,'2026-02-24')`,
    [JSON.stringify({ note: 'claim attached to LOT-N6-0003 at the pilot site', factor: 'CF-PILOT-1' })]);
}

async function seedRecord(c) {
  // One entry per seeded act, in the order the acts happened.
  const acts = [];
  const push = (act, actor, site, kind, ref, content, when) =>
    acts.push({ act, actor, site, object_kind: kind, object_reference: ref, content, occurred_at: when });

  push('site_registered', 'system', 'SITE-PILOT', 'site', 'SITE-PILOT', { nameplate_kg: 40000 }, '2026-01-01T08:00:00Z');
  push('site_registered', 'system', 'SITE-DEMO', 'site', 'SITE-DEMO', { nameplate_kg: 400000 }, '2026-01-01T08:01:00Z');
  push('site_registered', 'system', 'SITE-COMM', 'site', 'SITE-COMM', { nameplate_kg: 25000000, confidence: 'planned' }, '2026-01-01T08:02:00Z');
  for (const [i, [email, name, role]] of [
    ['plant@example.com', 'Ines Bekele', 'plant_operator'],
    ['analyst@example.com', 'Tomas Vlach', 'lab_analyst'],
    ['quality@example.com', 'Marit Solheim', 'quality_manager'],
    ['claims@example.com', 'Osei Danquah', 'claims_manager'],
    ['signer@example.com', 'Hana Ferreira', 'certificate_signer'],
    ['signer2@example.com', 'Pavel Ostrowski', 'certificate_signer'],
    ['auditor@example.com', 'Ruth Lindqvist', 'auditor'],
  ].entries()) {
    push('access_granted', 'system', null, 'person', email, { name, role, ends_on: '2027-06-30' }, `2026-01-01T09:0${i}:00Z`);
  }
  push('collector_approved', 'quality@example.com', null, 'collector', 'COL-ALDER', { state: 'approved', valid_from: '2026-01-01', valid_to: '2026-12-31' }, '2026-01-02T10:00:00Z');
  push('collector_approved', 'quality@example.com', null, 'collector', 'COL-BRINE', { state: 'approved', valid_from: '2026-01-01', valid_to: '2026-06-30' }, '2026-01-02T10:05:00Z');
  push('collector_approved', 'quality@example.com', null, 'collector', 'COL-CINDER', { state: 'conditional', valid_from: '2026-01-01', valid_to: '2026-12-31', condition: 'Sampling plan for coated streams to be agreed' }, '2026-01-02T10:10:00Z');
  push('conversion_factor_published', 'claims@example.com', 'SITE-DEMO', 'conversion_factor', 'CF-DEMO-1', { factor_bp: 8000 }, '2026-01-05T10:00:00Z');
  push('conversion_factor_published', 'claims@example.com', 'SITE-PILOT', 'conversion_factor', 'CF-PILOT-1', { factor_bp: 7500, provisional: true }, '2026-01-05T10:05:00Z');
  push('period_closed', 'claims@example.com', 'SITE-DEMO', 'balance_period', 'BP-DEMO-N6-2025H2', { closed_on: '2026-01-15', cut_off: '2026-01-10' }, '2026-01-15T16:00:00Z');
  push('method_version_published', 'quality@example.com', null, 'carbon_method', 'CM-PA6', { version: 2, reviewer: 'Ilse Grootveld' }, '2026-01-20T09:00:00Z');
  push('specification_issued', 'quality@example.com', null, 'specification', 'SPEC-N6', { version: 3, issued_on: '2026-02-01' }, '2026-02-01T09:00:00Z');
  for (const [ref, day, net, dev] of [
    ['BATCH-1001', '2026-02-10', 500000, 'WB-DEMO-01'],
    ['BATCH-1002', '2026-02-12', 300000, 'WB-DEMO-01'],
  ]) {
    push('weighing_recorded', 'plant@example.com', 'SITE-DEMO', 'weighing', `WGH-${ref.slice(-4)}`, { device: dev, net_g: net, calibration_state: 'in_calibration' }, `${day}T07:45:00Z`);
    push('batch_booked_in', 'plant@example.com', 'SITE-DEMO', 'batch', ref, { net_g: net, device: dev }, `${day}T08:00:00Z`);
  }
  push('weighing_recorded', 'plant@example.com', 'SITE-DEMO', 'weighing', 'WGH-1004', { device: 'WB-DEMO-02', net_g: 120000, calibration_state: 'lapsed' }, '2026-02-20T07:45:00Z');
  push('batch_booked_in', 'plant@example.com', 'SITE-DEMO', 'batch', 'BATCH-1004', { net_g: 120000, device: 'WB-DEMO-02', flags: ['lapsed_calibration'] }, '2026-02-20T08:00:00Z');
  push('inbound_payload_received', 'weighbridge', 'SITE-DEMO', 'inbound_record', 'INB-0001', { source: 'weighbridge' }, '2026-02-20T06:14:00Z');
  push('finding_raised', 'quality@example.com', 'SITE-DEMO', 'finding', 'FND-0001', { collector: 'COL-CINDER', departure_bp: 800 }, '2026-02-21T09:00:00Z');
  push('test_result_entered', 'analyst@example.com', 'SITE-PILOT', 'test_result', 'TST-0003', { lot: 'LOT-N6-0003', property: 'relative_viscosity' }, '2026-02-22T09:00:00Z');
  push('test_result_entered', 'analyst@example.com', 'SITE-PILOT', 'test_result', 'TST-0004', { lot: 'LOT-N6-0003', property: 'moisture' }, '2026-02-22T09:20:00Z');
  push('lot_dispositioned', 'quality@example.com', 'SITE-PILOT', 'lot', 'LOT-N6-0003', { disposition: 'released' }, '2026-02-24T10:00:00Z');
  push('certificate_signed', 'signer2@example.com', 'SITE-PILOT', 'certificate', 'CERT-PILOT-000001', { recipient: 'CUS-HELIOS', content_bp: 7500, claim_type: 'mass_balance' }, '2026-03-02T11:00:00Z');
  push('batch_booked_in', 'plant@example.com', 'SITE-DEMO', 'batch', 'BATCH-1005', { net_g: 100000, claimable: false, claimable_reason: 'custody_link_missing' }, '2026-03-02T08:00:00Z');
  push('certificate_signed', 'signer2@example.com', 'SITE-PILOT', 'certificate', 'CERT-PILOT-000002', { recipient: 'CUS-VANTA', content_bp: 7500, claim_type: 'mass_balance' }, '2026-03-05T11:00:00Z');
  for (const [ref, day] of [['RUN-D-0001', '2026-03-04'], ['RUN-D-0002', '2026-03-05'], ['RUN-D-0003', '2026-03-06'], ['RUN-Y-0001', '2026-03-09'], ['RUN-U-0001', '2026-03-11'], ['RUN-R-0001', '2026-03-13']]) {
    push('run_started', 'plant@example.com', 'SITE-DEMO', 'run', ref, { started_at: `${day}T06:00:00Z` }, `${day}T06:00:00Z`);
    push('run_closed', 'plant@example.com', 'SITE-DEMO', 'run', ref, { closed_at: `${day}T18:00:00Z` }, `${day}T18:00:00Z`);
  }
  push('inbound_payload_received', 'control_system', 'SITE-DEMO', 'inbound_record', 'INB-0002', { source: 'control_system' }, '2026-03-04T22:41:00Z');
  push('deviation_raised', 'quality@example.com', 'SITE-DEMO', 'deviation', 'DEV-0002', { runs: ['RUN-D-0002'] }, '2026-03-05T12:00:00Z');
  push('inbound_payload_received', 'laboratory', 'SITE-DEMO', 'inbound_record', 'INB-0003', { source: 'laboratory' }, '2026-03-06T09:02:00Z');
  push('deviation_raised', 'quality@example.com', 'SITE-DEMO', 'deviation', 'DEV-0001', { runs: ['RUN-U-0001'], lots: ['LOT-N6-0002'] }, '2026-03-12T09:00:00Z');
  push('test_result_entered', 'analyst@example.com', 'SITE-DEMO', 'test_result', 'TST-0001', { lot: 'LOT-N6-0001', property: 'relative_viscosity' }, '2026-03-14T09:00:00Z');
  push('test_result_entered', 'analyst@example.com', 'SITE-DEMO', 'test_result', 'TST-0002', { lot: 'LOT-N6-0001', property: 'moisture' }, '2026-03-14T09:20:00Z');
  push('test_result_entered', 'analyst@example.com', 'SITE-DEMO', 'test_result', 'TST-0005', { lot: 'LOT-N6-0002', property: 'relative_viscosity' }, '2026-03-14T10:00:00Z');
  push('carbon_figure_computed', 'claims@example.com', 'SITE-DEMO', 'carbon_figure', 'CFG-0001', { lot: 'LOT-N6-0001', method_version: 'CM-PA6 v2' }, '2026-03-14T12:00:00Z');
  push('lot_dispositioned', 'quality@example.com', 'SITE-DEMO', 'lot', 'LOT-N6-0002', { disposition: 'quarantined' }, '2026-03-15T10:00:00Z');
  push('separation_overridden', 'quality@example.com', 'SITE-DEMO', 'override', 'OVR-0001', { separation: 'analyst_not_dispositioner', lot: 'LOT-N6-0001' }, '2026-03-18T09:00:00Z');
  push('lot_dispositioned', 'quality@example.com', 'SITE-DEMO', 'lot', 'LOT-N6-0001', { disposition: 'released' }, '2026-03-18T10:00:00Z');
  push('deviation_closed', 'quality@example.com', 'SITE-DEMO', 'deviation', 'DEV-0002', { outcome: 'cause_not_established' }, '2026-03-20T09:00:00Z');
  push('certificate_withdrawn', 'signer2@example.com', 'SITE-PILOT', 'certificate', 'CERT-PILOT-000001', { reason: 'A collector category was corrected after acceptance' }, '2026-04-18T09:00:00Z');
  push('transfer_recorded', 'claims@example.com', 'SITE-DEMO', 'transfer', 'TRF-0001', { from: 'BP-PILOT-N6-2026H1', to: 'BP-DEMO-N6-2026H1', mass_g: 50000 }, '2026-05-12T09:00:00Z');
  push('energy_instrument_retired', 'claims@example.com', 'SITE-DEMO', 'energy_instrument', 'EAC-2026-0007', { period: 'BP-DEMO-N6-2026H1', quantity_kwh: 250000 }, '2026-06-01T09:00:00Z');
  push('party_version_recorded', 'quality@example.com', null, 'party', 'COL-BRINE', { name: 'Brine Circular Materials', effective_from: '2026-08-01' }, '2026-08-01T09:00:00Z');

  let signingSeq = null;
  for (const a of acts) {
    const r = await appendEntry(c, a);
    if (a.act === 'certificate_signed' && a.object_reference === 'CERT-PILOT-000001') signingSeq = r.seq;
  }
  const holdEntry = await appendEntry(c, {
    act: 'legal_hold_placed', actor: 'auditor@example.com', site: 'SITE-PILOT',
    object_kind: 'record_entry', object_reference: String(signingSeq),
    content: { reference: 'HLD-0001', seq: signingSeq }, occurred_at: '2026-08-15T09:00:00Z',
  });
  void holdEntry;
  await q(c, 'update legal_hold set seq = $1 where reference = $2', [signingSeq, 'HLD-0001']);
}
