/**
 * The rows this product seeds on first start. They match the brief's tables
 * exactly. Seeding runs once: it is guarded by the presence of the sites.
 */
import { pool, one, q } from './db.js';
import { appendEntry } from './record.js';
import { dryMass, creditGranted, contentBp } from './util.js';
import { buildDocument } from './document.js';

const BASIS = '8000 hours per year, 0.90 availability, 0.80 yield';
const SCHEME = 'RCS-2026';
const REGISTRATION = 'REG-RAVEL-0042';
const VERIFY_BASE = 'https://ravel.example.com/verify';

async function seeded() {
  const r = await one("SELECT count(*)::int AS n FROM site");
  return r && r.n > 0;
}

export async function seed() {
  if (await seeded()) return { seeded: false };
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await run(c);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  return { seeded: true };
}

const SYSTEM = 'system@ravel.example.com';

async function entry(c, e) {
  return appendEntry(c, e);
}

async function run(c) {
  // ---- sites -------------------------------------------------------------
  const sites = [
    ['SITE-PILOT', 'Pilot', 'commissioned', 40000, 24000, 'certified'],
    ['SITE-DEMO', 'Demonstration', 'commissioned', 400000, 320000, 'certified'],
    ['SITE-COMM', 'Commercial', 'planned', 25000000, 26000000, 'not_certified'],
  ];
  for (const [reference, name, confidence, nameplate, contracted, cert] of sites) {
    await c.query(
      `INSERT INTO site (reference,name,confidence,nameplate_kg,contracted_kg,certification_state,basis,last_revised)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'2026-06-30')`,
      [reference, name, confidence, nameplate, contracted, cert, BASIS]
    );
    await c.query(
      'INSERT INTO certificate_sequence (site, next) VALUES ($1, 1) ON CONFLICT DO NOTHING',
      [reference]
    );
    await entry(c, {
      act: 'site_recorded', person: SYSTEM, site: reference, object_kind: 'site',
      object_ref: reference, at: '2026-01-01T08:00:00Z',
      content: { name, confidence, nameplate_kg: nameplate, contracted_kg: contracted },
    });
  }
  for (const [ref, , , , , state] of sites) {
    await c.query(
      `INSERT INTO site_certification (reference, site, grade, state, effective_from, reason, recorded_by)
       VALUES ($1,$2,NULL,$3,'2026-01-01',$4,$5)`,
      [`CERTP-${ref}`, ref, state === 'certified' ? 'certified' : 'not_certified',
       state === 'certified' ? 'Scheme certification in force' : 'Site not yet certified', SYSTEM]
    );
  }

  // ---- accounts ----------------------------------------------------------
  const users = [
    ['plant@example.com', 'Ines Bekele', 'plant_operator', ['SITE-DEMO', 'SITE-PILOT']],
    ['analyst@example.com', 'Tomas Vlach', 'lab_analyst', ['SITE-DEMO', 'SITE-PILOT']],
    ['quality@example.com', 'Marit Solheim', 'quality_manager', ['SITE-DEMO', 'SITE-PILOT']],
    ['claims@example.com', 'Osei Danquah', 'claims_manager', ['SITE-DEMO', 'SITE-PILOT']],
    ['signer@example.com', 'Hana Ferreira', 'certificate_signer', ['SITE-DEMO', 'SITE-PILOT']],
    ['signer2@example.com', 'Pavel Ostrowski', 'certificate_signer', ['SITE-PILOT']],
    ['auditor@example.com', 'Ruth Lindqvist', 'auditor', ['SITE-DEMO', 'SITE-PILOT']],
  ];
  for (const [email, name, role, us] of users) {
    await c.query(
      `INSERT INTO app_user (email,name,role,sites,grant_ends_on) VALUES ($1,$2,$3,$4,'2027-06-30')`,
      [email, name, role, JSON.stringify(us)]
    );
    await entry(c, {
      act: 'access_grant', person: SYSTEM, object_kind: 'account', object_ref: email,
      at: '2026-01-01T08:05:00Z',
      content: { name, role, sites: us, grant_ends_on: '2027-06-30' },
    });
  }

  // ---- producer and scheme parties ---------------------------------------
  await c.query(
    `INSERT INTO party_version (reference,kind,name,effective_from) VALUES
     ('PRODUCER','producer','Ravel Materials SAS','2026-01-01'),
     ('SCHEME','scheme','RCS-2026','2026-01-01')`
  );

  // ---- collectors --------------------------------------------------------
  const collectors = [
    ['COL-ALDER', 'Alder Reclaim', 'PT', 'WCR-PT-4471', '2027-03-31',
     ['post_consumer_textile_bank', 'municipal_depot'], ['mixed_apparel', 'carpet'], 'member'],
    ['COL-BRINE', 'Brine Textile Recovery', 'NL', 'WCR-NL-2208', '2027-01-31',
     ['fishing_net_landing', 'port_reception'], ['fishing_net', 'mixed_apparel'], 'member'],
    ['COL-CINDER', 'Cinder Industrial Offcuts', 'FR', 'WCR-FR-6613', '2026-12-31',
     ['converter_floor', 'cutting_room'], ['pre_consumer_offcut'], 'applicant'],
  ];
  for (const [reference, name, country, reg, exp, types, streams, status] of collectors) {
    await c.query(
      `INSERT INTO collector (reference,name,country,registration,registration_expiry,collection_site_types,declared_streams,scheme_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [reference, name, country, reg, exp, JSON.stringify(types), JSON.stringify(streams), status]
    );
    await entry(c, {
      act: 'collector_recorded', person: SYSTEM, object_kind: 'collector', object_ref: reference,
      at: '2026-01-01T09:00:00Z', content: { name, country, registration: reg },
    });
  }

  const approvals = [
    ['AP-ALDER-1', 'COL-ALDER', 'approved', '2026-01-01', '2026-12-31', null, null],
    ['AP-BRINE-1', 'COL-BRINE', 'approved', '2026-01-01', '2026-06-30', null, null],
    ['AP-CINDER-1', 'COL-CINDER', 'conditional', '2026-01-01', '2026-12-31',
     'Sampling plan for coated streams to be agreed', '2026-10-31'],
  ];
  for (const a of approvals) {
    await c.query(
      `INSERT INTO approval_period (reference,collector,state,valid_from,valid_to,condition,condition_closes_on,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [...a, 'quality@example.com']
    );
    await entry(c, {
      act: 'collector_approved', person: 'quality@example.com', object_kind: 'approval_period',
      object_ref: a[0], at: '2026-01-01T09:30:00Z',
      content: { collector: a[1], state: a[2], valid_from: a[3], valid_to: a[4] },
    });
  }

  // ---- party versions ----------------------------------------------------
  await c.query(
    `INSERT INTO party_version (reference,kind,name,effective_from) VALUES
     ('COL-ALDER','collector','Alder Reclaim','2026-01-01'),
     ('COL-CINDER','collector','Cinder Industrial Offcuts','2026-01-01'),
     ('COL-BRINE','collector','Brine Textile Recovery','2026-01-01'),
     ('COL-BRINE','collector','Brine Circular Materials','2026-08-01'),
     ('CUS-HELIOS','customer','Helios Technical Textiles','2026-01-01'),
     ('CUS-VANTA','customer','Vanta Restraint Systems','2026-01-01')`
  );
  await entry(c, {
    act: 'party_version_recorded', person: SYSTEM, object_kind: 'party', object_ref: 'COL-BRINE',
    at: '2026-08-01T00:00:00Z',
    content: { name: 'Brine Circular Materials', effective_from: '2026-08-01', supersedes: 'Brine Textile Recovery' },
  });

  // ---- weighing devices --------------------------------------------------
  for (const [reference, site, cal] of [
    ['WB-DEMO-01', 'SITE-DEMO', '2026-05-01'],
    ['WB-DEMO-02', 'SITE-DEMO', '2025-02-01'],
  ]) {
    await c.query(
      'INSERT INTO weighing_device (reference,site,calibrated_on) VALUES ($1,$2,$3)',
      [reference, site, cal]
    );
  }

  // ---- batches -----------------------------------------------------------
  const batches = [
    {
      reference: 'BATCH-1001', collector: 'COL-ALDER', category: 'post_consumer',
      received_on: '2026-02-10', net_g: 500000, moisture_bp: 1000, device: 'WB-DEMO-01',
      composition: { polymer: 'PA6', fraction_bp: 9200, basis: 'sampled', measured_fraction_bp: 9200 },
      contamination: { non_nylon_bp: 500, elastane_bp: 400, coatings: 'none observed', colour_load: 'mixed dark', foreign_matter: 'buttons and zips removed at source' },
      custodyAll: true,
    },
    {
      reference: 'BATCH-1002', collector: 'COL-ALDER', category: 'pre_consumer',
      received_on: '2026-02-12', net_g: 300000, moisture_bp: 0, device: 'WB-DEMO-01',
      composition: { polymer: 'PA6', fraction_bp: 9600, basis: 'sampled', measured_fraction_bp: 9600 },
      contamination: { non_nylon_bp: 300, elastane_bp: 100, coatings: 'none', colour_load: 'undyed', foreign_matter: 'none' },
      custodyAll: true,
    },
    {
      reference: 'BATCH-1003', collector: 'COL-BRINE', category: 'post_consumer',
      received_on: '2026-07-05', net_g: 200000, moisture_bp: 500, device: 'WB-DEMO-01',
      composition: { polymer: 'PA6', fraction_bp: 8800, basis: 'declared', measured_fraction_bp: 8700 },
      contamination: { non_nylon_bp: 900, elastane_bp: 200, coatings: 'marine biofouling', colour_load: 'green and blue', foreign_matter: 'rope and lead line' },
      custodyAll: true,
    },
    {
      reference: 'BATCH-1004', collector: 'COL-CINDER', category: 'pre_consumer',
      received_on: '2026-02-20', net_g: 120000, moisture_bp: 0, device: 'WB-DEMO-02',
      composition: { polymer: 'PA6', fraction_bp: 9900, basis: 'declared', measured_fraction_bp: 9100 },
      contamination: { non_nylon_bp: 400, elastane_bp: 0, coatings: 'PU coated selvedge', colour_load: 'undyed', foreign_matter: 'none' },
      custodyAll: true,
    },
    {
      reference: 'BATCH-1005', collector: 'COL-ALDER', category: 'post_consumer',
      received_on: '2026-03-02', net_g: 100000, moisture_bp: 0, device: 'WB-DEMO-01',
      composition: { polymer: 'PA6', fraction_bp: 9100, basis: 'sampled', measured_fraction_bp: 9100 },
      contamination: { non_nylon_bp: 700, elastane_bp: 300, coatings: 'none', colour_load: 'mixed', foreign_matter: 'none' },
      custodyAll: false,
    },
  ];
  const CUSTODY_KINDS = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
  for (const b of batches) {
    const gross = b.net_g + 20000;
    await c.query(
      `INSERT INTO batch (reference,collector,site,grade,category,gross_g,tare_g,net_g,moisture_bp,moisture_method,device,received_on,composition,contamination,event_at,effective_on,recorded_by)
       VALUES ($1,$2,'SITE-DEMO','N6',$3,$4,20000,$5,$6,'ISO 15512 oven',$7,$8,$9,$10,$11,$12,'plant@example.com')`,
      [b.reference, b.collector, b.category, gross, b.net_g, b.moisture_bp, b.device,
       b.received_on, JSON.stringify(b.composition), JSON.stringify(b.contamination),
       b.received_on + 'T07:30:00Z', b.received_on]
    );
    const kinds = b.custodyAll ? CUSTODY_KINDS : CUSTODY_KINDS.filter((k) => k !== 'transport');
    let i = 0;
    for (const kind of kinds) {
      await c.query(
        `INSERT INTO custody_link (batch,ordinal,kind,link_date,party) VALUES ($1,$2,$3,$4,$5)`,
        [b.reference, i++, kind, b.received_on,
         kind === 'collection_site' || kind === 'collector' ? b.collector
           : kind === 'transport' ? 'Transporteur Sud SARL' : 'SITE-DEMO']
      );
    }
    await c.query(
      `INSERT INTO weighing (reference,batch,device,gross_g,tare_g,net_g,calibration_state,weighed_at)
       VALUES ($1,$2,$3,$4,20000,$5,$6,$7)`,
      [`WGH-${b.reference}`, b.reference, b.device, gross, b.net_g,
       b.device === 'WB-DEMO-02' ? 'lapsed' : 'in_calibration', b.received_on + 'T07:25:00Z']
    );
    await entry(c, {
      act: 'batch_booked_in', person: 'plant@example.com', site: 'SITE-DEMO',
      object_kind: 'batch', object_ref: b.reference, at: b.received_on + 'T07:30:00Z',
      content: {
        collector: b.collector, category: b.category, net_g: b.net_g,
        moisture_bp: b.moisture_bp, device: b.device, received_on: b.received_on,
        dry_mass_g: dryMass(b.net_g, b.moisture_bp),
      },
    });
    await entry(c, {
      act: 'weighing_recorded', person: 'plant@example.com', site: 'SITE-DEMO',
      object_kind: 'weighing', object_ref: `WGH-${b.reference}`, at: b.received_on + 'T07:25:00Z',
      content: { batch: b.reference, device: b.device, net_g: b.net_g,
        calibration_state: b.device === 'WB-DEMO-02' ? 'lapsed' : 'in_calibration' },
    });
  }

  // A measured composition departing from the declaration by more than 500 bp
  // stands as a finding against the collector.
  await c.query(
    `INSERT INTO finding (reference,collector,batch,kind,detail,departure_bp,raised_on,due_on,state)
     VALUES ('FND-0001','COL-CINDER','BATCH-1004','declaration_departure',
       'Declared PA6 fraction 9900 bp against a measured 9100 bp, a departure of 800 basis points.',
       800,'2026-02-22','2026-04-30','open')`
  );
  await entry(c, {
    act: 'finding_raised', person: 'quality@example.com', object_kind: 'finding',
    object_ref: 'FND-0001', at: '2026-02-22T10:00:00Z',
    content: { collector: 'COL-CINDER', batch: 'BATCH-1004', departure_bp: 800 },
  });

  // ---- recipe versions ---------------------------------------------------
  const recipes = [
    ['RCP-DISS-2', 'dissolution', 2, { temperature_c: 165, pressure_bar: 3 },
     { temperature_c: [160, 170], pressure_bar: [2, 4] },
     [{ reagent: 'bio-derived solvent blend', ratio_bp: 4000 }], 90],
    ['RCP-DEPO-4', 'depolymerisation', 4, { temperature_c: 240, pressure_bar: 6 },
     { temperature_c: [235, 245], pressure_bar: [5, 7] },
     [{ reagent: 'water', ratio_bp: 2500 }], 180],
    ['RCP-PURI-1', 'purification', 1, { temperature_c: 120, pressure_bar: 1 },
     { temperature_c: [110, 130], pressure_bar: [1, 2] },
     [{ reagent: 'activated carbon', ratio_bp: 200 }], 60],
    ['RCP-REPO-3', 'repolymerisation', 3, { temperature_c: 255, pressure_bar: 8 },
     { temperature_c: [250, 260], pressure_bar: [7, 9] },
     [{ reagent: 'chain regulator', ratio_bp: 50 }], 240],
  ];
  for (const [reference, type, version, sp, tol, reagents, res] of recipes) {
    await c.query(
      `INSERT INTO recipe_version (reference,run_type,version,set_points,tolerances,reagents,residence_min,released_by,released_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'quality@example.com','2026-01-05')`,
      [reference, type, version, JSON.stringify(sp), JSON.stringify(tol), JSON.stringify(reagents), res]
    );
  }

  // ---- runs, consumptions, outputs --------------------------------------
  const runs = [
    ['RUN-D-0001', 'dissolution', 'RCP-DISS-2', 'DISS-01', '2026-03-04T06:00:00Z', '2026-03-04T14:00:00Z',
     { temperature_c: 165, pressure_bar: 3 }],
    ['RUN-D-0002', 'dissolution', 'RCP-DISS-2', 'DISS-01', '2026-03-05T06:00:00Z', '2026-03-05T14:00:00Z',
     { temperature_c: 172, pressure_bar: 3 }],
    ['RUN-D-0003', 'dissolution', 'RCP-DISS-2', 'DISS-02', '2026-03-06T06:00:00Z', '2026-03-06T14:00:00Z',
     { temperature_c: 163, pressure_bar: 3 }],
    ['RUN-Y-0001', 'depolymerisation', 'RCP-DEPO-4', 'DEPO-01', '2026-03-08T06:00:00Z', '2026-03-08T18:00:00Z',
     { temperature_c: 240, pressure_bar: 6 }],
    ['RUN-U-0001', 'purification', 'RCP-PURI-1', 'PURI-01', '2026-03-10T06:00:00Z', '2026-03-10T16:00:00Z',
     { temperature_c: 120, pressure_bar: 1 }],
    ['RUN-R-0001', 'repolymerisation', 'RCP-REPO-3', 'REPO-01', '2026-03-12T06:00:00Z', '2026-03-12T20:00:00Z',
     { temperature_c: 255, pressure_bar: 8 }],
  ];
  const losses = {
    'RUN-D-0001': 120000, 'RUN-D-0002': 60000, 'RUN-D-0003': 30000,
    'RUN-Y-0001': 50000, 'RUN-U-0001': 40000, 'RUN-R-0001': 20000,
  };
  for (const [reference, type, recipe, equip, started, closed, actual] of runs) {
    await c.query(
      `INSERT INTO run (reference,run_type,site,equipment,recipe_version,operator,started_at,closed_at,state,actual_set_points,losses_g,event_at,effective_on,recorded_by)
       VALUES ($1,$2,'SITE-DEMO',$3,$4,'plant@example.com',$5,$6,'closed',$7,$8,$5,$9,'plant@example.com')`,
      [reference, type, equip, recipe, started, closed, JSON.stringify(actual),
       losses[reference], started.slice(0, 10)]
    );
    await entry(c, {
      act: 'run_started', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'run',
      object_ref: reference, at: started,
      content: { run_type: type, recipe_version: recipe, equipment: equip },
    });
  }

  const consumptions = [
    ['CON-0001', 'RUN-D-0001', 'batch', 'BATCH-1001', 300000],
    ['CON-0002', 'RUN-D-0001', 'batch', 'BATCH-1002', 300000],
    ['CON-0003', 'RUN-D-0002', 'batch', 'BATCH-1003', 190000],
    ['CON-0004', 'RUN-D-0002', 'batch', 'BATCH-1004', 120000],
    ['CON-0005', 'RUN-D-0003', 'batch', 'BATCH-1001', 150000],
    ['CON-0006', 'RUN-Y-0001', 'output', 'OUT-D-0001', 480000],
    ['CON-0007', 'RUN-Y-0001', 'output', 'OUT-D-0002', 250000],
    ['CON-0008', 'RUN-Y-0001', 'output', 'OUT-D-0003', 120000],
    ['CON-0009', 'RUN-U-0001', 'output', 'OUT-Y-0001', 800000],
    ['CON-0010', 'RUN-R-0001', 'output', 'OUT-U-0001', 720000],
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
  const runDate = Object.fromEntries(runs.map((r) => [r[0], r[4]]));
  for (const [reference, runRef, kind, inputRef, mass] of consumptions) {
    await c.query(
      `INSERT INTO consumption (reference,run,input_kind,input_ref,mass_g,event_at,effective_on,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'plant@example.com')`,
      [reference, runRef, kind, inputRef, mass, runDate[runRef], runDate[runRef].slice(0, 10)]
    );
    await entry(c, {
      act: 'consumption_recorded', person: 'plant@example.com', site: 'SITE-DEMO',
      object_kind: 'consumption', object_ref: reference, at: runDate[runRef],
      content: { run: runRef, input_kind: kind, input: inputRef, mass_g: mass },
    });
  }
  for (const [reference, runRef, kind, mass, disp] of outputs) {
    await c.query(
      `INSERT INTO output (reference,run,kind,mass_g,disposition,event_at,effective_on,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'plant@example.com')`,
      [reference, runRef, kind, mass, disp, runDate[runRef], runDate[runRef].slice(0, 10)]
    );
    await entry(c, {
      act: 'output_recorded', person: 'plant@example.com', site: 'SITE-DEMO',
      object_kind: 'output', object_ref: reference, at: runDate[runRef],
      content: { run: runRef, kind, mass_g: mass, disposition: disp },
    });
  }
  for (const [reference, , , , , closed] of runs) {
    await entry(c, {
      act: 'run_closed', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'run',
      object_ref: reference, at: closed,
      content: { losses_g: losses[reference], derivation: 'mass in minus mass out' },
    });
  }

  // ---- lots --------------------------------------------------------------
  const lots = [
    ['LOT-N6-0001', 'N6', 'SITE-DEMO', 400000, 'released', 'mass_balance', 'RUN-R-0001', 'LOT-N6-0001', '2026-03-12'],
    ['LOT-N6-0002', 'N6', 'SITE-DEMO', 300000, 'quarantined', 'mass_balance', 'RUN-R-0001', 'LOT-N6-0002', '2026-03-12'],
    ['LOT-N6-0003', 'N6', 'SITE-PILOT', 200000, 'released', 'mass_balance', null, null, '2026-02-25'],
  ];
  for (const [reference, grade, site, mass, disp, claim, run, out, on] of lots) {
    await c.query(
      `INSERT INTO lot (reference,grade,site,mass_g,disposition,claim_type,produced_by,output_ref,sites_named,event_at,effective_on,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'plant@example.com')`,
      [reference, grade, site, mass, disp, claim, run, out, JSON.stringify([site]),
       on + 'T20:00:00Z', on]
    );
    await entry(c, {
      act: 'lot_produced', person: 'plant@example.com', site, object_kind: 'lot',
      object_ref: reference, at: on + 'T20:00:00Z',
      content: { grade, mass_g: mass, claim_type: claim, produced_by: run },
    });
  }

  // ---- test results ------------------------------------------------------
  const tests = [
    ['TST-0001', 'lot', 'LOT-N6-0001', 'relative_viscosity', 'ISO 307', 'VISCO-2', '2.43', 'ratio', 150],
    ['TST-0002', 'lot', 'LOT-N6-0001', 'moisture', 'ISO 15512', 'KF-1', '0.06', 'percent', 200],
    ['TST-0003', 'lot', 'LOT-N6-0001', 'yellowness_index', 'ASTM E313', 'COLR-1', '5.2', 'index', 300],
    ['TST-0004', 'lot', 'LOT-N6-0003', 'relative_viscosity', 'ISO 307', 'VISCO-2', '2.41', 'ratio', 150],
    ['TST-0005', 'lot', 'LOT-N6-0003', 'moisture', 'ISO 15512', 'KF-1', '0.08', 'percent', 200],
    ['TST-0006', 'lot', 'LOT-N6-0002', 'relative_viscosity', 'ISO 307', 'VISCO-2', '2.31', 'ratio', 150],
  ];
  for (const [reference, kind, subject, property, method, instrument, value, unit, unc] of tests) {
    await c.query(
      `INSERT INTO test_result (reference,subject_kind,subject_ref,property,method,instrument,analyst,value,unit,uncertainty_bp,entered_by,event_at,effective_on)
       VALUES ($1,$2,$3,$4,$5,$6,'Tomas Vlach',$7,$8,$9,'analyst@example.com','2026-03-14T09:00:00Z','2026-03-14')`,
      [reference, kind, subject, property, method, instrument, value, unit, unc]
    );
    await entry(c, {
      act: 'test_result_entered', person: 'analyst@example.com', site: 'SITE-DEMO',
      object_kind: 'test_result', object_ref: reference, at: '2026-03-14T09:00:00Z',
      content: { subject, property, method, value, unit, uncertainty_bp: unc },
    });
  }

  // ---- dispositions ------------------------------------------------------
  for (const [ref, lot, disp] of [
    ['DSP-0001', 'LOT-N6-0001', 'released'],
    ['DSP-0002', 'LOT-N6-0002', 'quarantined'],
    ['DSP-0003', 'LOT-N6-0003', 'released'],
  ]) {
    await c.query(
      `INSERT INTO disposition_act (reference,lot,disposition,reason,decided_by,decided_at)
       VALUES ($1,$2,$3,$4,'quality@example.com','2026-03-18T11:00:00Z')`,
      [ref, lot, disp, disp === 'released' ? 'All guaranteed limits met' : 'Held pending DEV-0001']
    );
    await entry(c, {
      act: 'lot_dispositioned', person: 'quality@example.com', object_kind: 'lot',
      object_ref: lot, at: '2026-03-18T11:00:00Z', content: { disposition: disp },
    });
  }

  // ---- deviations --------------------------------------------------------
  await c.query(
    `INSERT INTO deviation (reference,title,detail,state,outcome,raised_by,raised_at)
     VALUES ('DEV-0001','Purification residence time short of recipe',
       'RUN-U-0001 held for 48 minutes against a recipe residence of 60 minutes. LOT-N6-0002 is held pending investigation.',
       'open',NULL,'quality@example.com','2026-03-11T08:00:00Z')`
  );
  await c.query(
    `INSERT INTO deviation_link (deviation,kind,ref) VALUES
     ('DEV-0001','run','RUN-U-0001'),('DEV-0001','lot','LOT-N6-0002')`
  );
  await c.query(
    `INSERT INTO deviation (reference,title,detail,state,outcome,raised_by,raised_at,closed_by,closed_at,close_reason)
     VALUES ('DEV-0002','Dissolution temperature above recipe tolerance',
       'RUN-D-0002 ran at 172 C against a tolerance of 160 to 170 C.',
       'closed','cause_not_established','quality@example.com','2026-03-05T15:00:00Z',
       'quality@example.com','2026-03-20T15:00:00Z','No assignable cause found after review of the control system record.')`
  );
  await c.query(
    `INSERT INTO deviation_link (deviation,kind,ref) VALUES ('DEV-0002','run','RUN-D-0002')`
  );
  await entry(c, {
    act: 'deviation_raised', person: 'quality@example.com', site: 'SITE-DEMO',
    object_kind: 'deviation', object_ref: 'DEV-0001', at: '2026-03-11T08:00:00Z',
    content: { affects: ['RUN-U-0001', 'LOT-N6-0002'] },
  });
  await entry(c, {
    act: 'deviation_raised', person: 'quality@example.com', site: 'SITE-DEMO',
    object_kind: 'deviation', object_ref: 'DEV-0002', at: '2026-03-05T15:00:00Z',
    content: { affects: ['RUN-D-0002'] },
  });
  await entry(c, {
    act: 'deviation_closed', person: 'quality@example.com', site: 'SITE-DEMO',
    object_kind: 'deviation', object_ref: 'DEV-0002', at: '2026-03-20T15:00:00Z',
    content: { outcome: 'cause_not_established' },
  });

  // ---- override ----------------------------------------------------------
  await c.query(
    `INSERT INTO override (reference,separation,reason,lot,authorised_by,recorded_by,authorised_on,recorded_at,reviewed)
     VALUES ('OVR-0001','analyst_not_dispositioner',
       'Night shift analyst dispositioned the lot because no second qualified person was on site',
       'LOT-N6-0001','quality@example.com','quality@example.com','2026-03-18','2026-03-18T12:00:00Z',false)`
  );
  await entry(c, {
    act: 'override_recorded', person: 'quality@example.com', site: 'SITE-DEMO',
    object_kind: 'override', object_ref: 'OVR-0001', at: '2026-03-18T12:00:00Z',
    content: {
      separation: 'analyst_not_dispositioner', lot: 'LOT-N6-0001',
      authorised_by: 'quality@example.com',
      reason: 'Night shift analyst dispositioned the lot because no second qualified person was on site',
    },
  });

  // ---- conversion factors ------------------------------------------------
  await c.query(
    `INSERT INTO conversion_factor (reference,site,version,factor_bp,derived_from,derived_to,derived_in_g,derived_out_g,provisional,published_by,published_on)
     VALUES ('CF-DEMO-1','SITE-DEMO',1,8000,'2026-01-01','2026-03-31',1000000,800000,false,'claims@example.com','2026-04-01'),
            ('CF-PILOT-1','SITE-PILOT',1,7500,NULL,NULL,0,0,true,'claims@example.com','2026-01-05')`
  );
  for (const r of ['CF-DEMO-1', 'CF-PILOT-1']) {
    await entry(c, {
      act: 'conversion_factor_published', person: 'claims@example.com',
      object_kind: 'conversion_factor', object_ref: r, at: '2026-04-01T09:00:00Z',
      content: { reference: r },
    });
  }

  // ---- balance periods ---------------------------------------------------
  const periods = [
    ['BP-DEMO-N6-2025H2', 'SITE-DEMO', 'N6', '2025-07-01', '2025-12-31', 'closed', 2000, '2026-01-15', '2026-01-10'],
    ['BP-DEMO-N6-2026H1', 'SITE-DEMO', 'N6', '2026-01-01', '2026-06-30', 'open', 2000, null, null],
    ['BP-PILOT-N6-2026H1', 'SITE-PILOT', 'N6', '2026-01-01', '2026-06-30', 'open', 2000, null, null],
  ];
  for (const [id, site, grade, from, to, state, limit, closedOn, cutOff] of periods) {
    await c.query(
      `INSERT INTO balance_period (id,site,grade,period_from,period_to,state,carry_over_limit_bp,allocation_basis,closed_on,cut_off,closed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'mass',$8,$9,$10)`,
      [id, site, grade, from, to, state, limit, closedOn, cutOff, closedOn ? 'claims@example.com' : null]
    );
  }
  await entry(c, {
    act: 'balance_period_closed', person: 'claims@example.com', site: 'SITE-DEMO',
    object_kind: 'balance_period', object_ref: 'BP-DEMO-N6-2025H2', at: '2026-01-15T17:00:00Z',
    content: { closed_on: '2026-01-15', cut_off: '2026-01-10' },
  });

  // ---- credit movements --------------------------------------------------
  // A credit enters when a claimable batch is consumed: dry mass times the
  // site's conversion factor, floored.
  // A consumption records the dry mass drawn from a batch, because every figure
  // in this product is computed on dry mass. The four consumptions off
  // BATCH-1001 sum to its dry mass of 450000 g exactly.
  const credits = [
    ['CM-0001', 'BATCH-1001', 'CON-0001', 'post_consumer', 300000, '2026-03-04'],
    ['CM-0002', 'BATCH-1002', 'CON-0002', 'pre_consumer', 300000, '2026-03-04'],
    ['CM-0003', 'BATCH-1004', 'CON-0004', 'pre_consumer', 120000, '2026-03-05'],
    ['CM-0004', 'BATCH-1001', 'CON-0005', 'post_consumer', 150000, '2026-03-06'],
  ];
  for (const [reference, batch, cons, category, dry, on] of credits) {
    const credit = creditGranted(dry, 8000);
    await c.query(
      `INSERT INTO credit_movement (reference,period,direction,category,mass_g,batch,consumption,factor_version,derivation,event_at,effective_on,recorded_by)
       VALUES ($1,'BP-DEMO-N6-2026H1','in',$2,$3,$4,$5,'CF-DEMO-1 v1',$6,$7,$8,'plant@example.com')`,
      [reference, category, credit, batch, cons,
       JSON.stringify({
         dry_mass_consumed_g: dry, factor_bp: 8000, factor_version: 'CF-DEMO-1 v1',
         formula: `dry_mass_consumed_g ${dry} * factor_bp 8000 / 10000, floored = ${credit}`,
       }),
       on + 'T06:00:00Z', on]
    );
  }

  // ---- inter-site transfer ----------------------------------------------
  await c.query(
    `INSERT INTO transfer (reference,from_period,to_period,category,mass_g,moved_on,recorded_by)
     VALUES ('TRF-0001','BP-PILOT-N6-2026H1','BP-DEMO-N6-2026H1','post_consumer',50000,'2026-05-12','claims@example.com')`
  );
  await c.query(
    `INSERT INTO credit_movement (reference,period,direction,category,mass_g,origin_site,movement,fresh_credit,derivation,event_at,effective_on,recorded_by)
     VALUES ('CM-TRF-OUT','BP-PILOT-N6-2026H1','outbound_transfer','post_consumer',50000,'SITE-PILOT','TRF-0001',false,
       '{"note":"credit left this period on TRF-0001"}','2026-05-12T09:00:00Z','2026-05-12','claims@example.com'),
            ('CM-TRF-IN','BP-DEMO-N6-2026H1','inbound_transfer','post_consumer',50000,'SITE-PILOT','TRF-0001',false,
       '{"note":"credit arrived from SITE-PILOT on TRF-0001; never a fresh credit"}','2026-05-12T09:00:00Z','2026-05-12','claims@example.com')`
  );
  await entry(c, {
    act: 'transfer_recorded', person: 'claims@example.com', object_kind: 'transfer',
    object_ref: 'TRF-0001', at: '2026-05-12T09:00:00Z',
    content: { from: 'BP-PILOT-N6-2026H1', to: 'BP-DEMO-N6-2026H1', mass_g: 50000, origin_site: 'SITE-PILOT' },
  });

  // Credit for LOT-N6-0003 at SITE-PILOT so its certificates carry a claim.
  await c.query(
    `INSERT INTO credit_movement (reference,period,direction,category,mass_g,batch,factor_version,derivation,event_at,effective_on,recorded_by)
     VALUES ('CM-P-0001','BP-PILOT-N6-2026H1','in','post_consumer',200000,NULL,'CF-PILOT-1 v1',
       '{"note":"commissioning feed at SITE-PILOT under the provisional factor","factor_bp":7500}',
       '2026-02-20T06:00:00Z','2026-02-20','plant@example.com')`
  );
  await c.query(
    `INSERT INTO credit_movement (reference,period,direction,category,mass_g,lot,factor_version,derivation,event_at,effective_on,recorded_by)
     VALUES ('CM-P-0002','BP-PILOT-N6-2026H1','out','post_consumer',150000,'LOT-N6-0003','CF-PILOT-1 v1',
       '{"note":"claim attached to LOT-N6-0003"}','2026-02-26T09:00:00Z','2026-02-26','claims@example.com')`
  );

  // ---- carbon ------------------------------------------------------------
  await c.query(
    `INSERT INTO carbon_method (id,name,primary_threshold_bp) VALUES ('CM-PA6','Polyamide 6 chemical recycling',5000)`
  );
  const factors2025 = [
    { factor: 'grid electricity EU-27', source: 'EcoBase 2025', year: 2025, value_mg_per_kwh: 240000 },
    { factor: 'process steam', source: 'EcoBase 2025', year: 2025, value_mg_per_kg: 210000 },
    { factor: 'road freight', source: 'EcoBase 2025', year: 2025, value_mg_per_tkm: 105000 },
    { factor: 'bio-derived solvent', source: 'Supplier declaration', year: 2025, value_mg_per_kg: 1420000 },
  ];
  await c.query(
    `INSERT INTO carbon_method_version (method,version,standard,functional_unit,boundary,allocation_basis,reviewer,published_on,published_by,data_quality_rules,emission_factors,superseded)
     VALUES ('CM-PA6',1,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2025-09-14','quality@example.com',$1,$2,true),
            ('CM-PA6',2,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2026-01-20','quality@example.com',$1,$2,false)`,
    [
      JSON.stringify([
        { rule: 'primary data for every on-site energy line', threshold_bp: 5000 },
        { rule: 'supplier-specific factors for reagents where a declaration exists' },
        { rule: 'secondary data permitted for outbound transport and residues' },
      ]),
      JSON.stringify(factors2025),
    ]
  );
  for (const v of [1, 2]) {
    await entry(c, {
      act: 'carbon_method_version_published', person: 'quality@example.com',
      object_kind: 'carbon_method_version', object_ref: `CM-PA6 v${v}`,
      at: v === 1 ? '2025-09-14T10:00:00Z' : '2026-01-20T10:00:00Z',
      content: { method: 'CM-PA6', version: v, standard: 'ISO 14067', boundary: 'cradle-to-gate' },
    });
  }

  const breakdown = [
    { line: 'collection_and_transport', mg_per_kg: 310000, tag: 'primary' },
    { line: 'process_energy', mg_per_kg: 1850000, tag: 'primary' },
    { line: 'reagents', mg_per_kg: 1180000, tag: 'supplier_specific' },
    { line: 'water_and_effluent', mg_per_kg: 240000, tag: 'primary' },
    { line: 'waste_and_residues', mg_per_kg: 330000, tag: 'secondary' },
    { line: 'outbound_transport', mg_per_kg: 410000, tag: 'secondary' },
    { line: 'byproduct_credit', mg_per_kg: -60000, tag: 'primary' },
  ];
  const comparator = {
    material: 'virgin PA6', dataset: 'EcoBase 2025', dataset_year: 2025,
    region: 'EU-27', value_mg_per_kg: 5800000,
  };
  const energy = {
    energy_location_mg_per_kg: 1850000, energy_market_mg_per_kg: 620000, metered_kwh: 300000,
  };
  await c.query(
    `INSERT INTO carbon_figure (id,lot,figure_version,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,boundary,comparator,breakdown,energy,input_versions,computed_by,computed_at)
     VALUES ('CFG-0001','LOT-N6-0001',1,'CM-PA6',2,4260000,1200,6500,'cradle-to-gate',$1,$2,$3,$4,'claims@example.com','2026-03-15T10:00:00Z')`,
    [
      JSON.stringify(comparator), JSON.stringify(breakdown), JSON.stringify(energy),
      JSON.stringify({
        carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1 v1',
        recipe_versions: ['RCP-DISS-2', 'RCP-DEPO-4', 'RCP-PURI-1', 'RCP-REPO-3'],
        specification: 'SPEC-N6 v3', emission_factor_set: 'EcoBase 2025',
      }),
    ]
  );
  const pilotBreakdown = [
    { line: 'collection_and_transport', mg_per_kg: 340000, tag: 'primary' },
    { line: 'process_energy', mg_per_kg: 2010000, tag: 'primary' },
    { line: 'reagents', mg_per_kg: 1240000, tag: 'supplier_specific' },
    { line: 'water_and_effluent', mg_per_kg: 260000, tag: 'primary' },
    { line: 'waste_and_residues', mg_per_kg: 360000, tag: 'secondary' },
    { line: 'outbound_transport', mg_per_kg: 430000, tag: 'secondary' },
  ];
  await c.query(
    `INSERT INTO carbon_figure (id,lot,figure_version,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,boundary,comparator,breakdown,energy,input_versions,computed_by,computed_at)
     VALUES ('CFG-0002','LOT-N6-0003',1,'CM-PA6',2,4640000,1500,5800,'cradle-to-gate',$1,$2,$3,$4,'claims@example.com','2026-02-27T10:00:00Z')`,
    [
      JSON.stringify(comparator), JSON.stringify(pilotBreakdown),
      JSON.stringify({ energy_location_mg_per_kg: 2010000, energy_market_mg_per_kg: 780000, metered_kwh: 140000 }),
      JSON.stringify({
        carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-PILOT-1 v1',
        specification: 'SPEC-N6 v3', emission_factor_set: 'EcoBase 2025',
      }),
    ]
  );
  await c.query(
    `INSERT INTO carbon_figure (id,lot,figure_version,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,boundary,comparator,breakdown,energy,input_versions,computed_by,computed_at)
     VALUES ('CFG-0003','LOT-N6-0002',1,'CM-PA6',2,4310000,1300,6400,'cradle-to-gate',$1,$2,$3,$4,'claims@example.com','2026-03-15T10:05:00Z')`,
    [
      JSON.stringify(comparator), JSON.stringify(breakdown), JSON.stringify(energy),
      JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1 v1', specification: 'SPEC-N6 v3', emission_factor_set: 'EcoBase 2025' }),
    ]
  );

  await c.query(
    `INSERT INTO energy_instrument (reference,quantity_kwh,vintage,region,state,applied_to) VALUES
     ('EAC-2026-0007',250000,2026,'EU-27','retired','BP-DEMO-N6-2026H1'),
     ('EAC-2025-0031',100000,2025,'EU-27','held',NULL)`
  );
  await entry(c, {
    act: 'energy_instrument_retired', person: 'claims@example.com',
    object_kind: 'energy_instrument', object_ref: 'EAC-2026-0007', at: '2026-04-02T10:00:00Z',
    content: { applied_to: 'BP-DEMO-N6-2026H1', quantity_kwh: 250000, vintage: 2026, region: 'EU-27' },
  });

  // ---- specifications ----------------------------------------------------
  const specProps = [
    { property: 'relative_viscosity', method: 'ISO 307', limit: '2.40', unit: 'ratio', basis: 'guaranteed' },
    { property: 'moisture', method: 'ISO 15512', limit: '0.10', unit: 'percent', basis: 'guaranteed' },
    { property: 'yellowness_index', method: 'ASTM E313', limit: '8.0', unit: 'index', basis: 'typical' },
    { property: 'ash_content', method: 'ISO 3451-1', limit: '0.30', unit: 'percent', basis: 'informational' },
  ];
  const virgin = {
    reference: 'virgin PA6 at relative viscosity 2.42',
    source: 'EcoBase 2025', date: '2025-11-30',
  };
  await c.query(
    `INSERT INTO specification (grade,version,issued_on,superseded,properties,virgin_reference) VALUES
     ('N6',2,'2025-08-01',true,$1,$2),('N6',3,'2026-02-01',false,$1,$2)`,
    [JSON.stringify(specProps), JSON.stringify(virgin)]
  );

  await c.query(
    `INSERT INTO customer (reference,name,contact,spec_grade,spec_version,application,industry,language) VALUES
     ('CUS-HELIOS','Helios Technical Textiles','helios@example.com','N6',3,'technical apparel yarn','textiles','en'),
     ('CUS-VANTA','Vanta Restraint Systems','vanta@example.com','N6',2,'airbag fabric','automotive','en')`
  );
  await c.query(
    `INSERT INTO specification_issue (reference,grade,version,customer,issued_by,issued_at) VALUES
     ('SPI-0001','N6',3,'CUS-HELIOS','quality@example.com','2026-02-01T10:00:00Z'),
     ('SPI-0002','N6',2,'CUS-VANTA','quality@example.com','2025-08-01T10:00:00Z')`
  );
  for (const r of ['SPI-0001', 'SPI-0002']) {
    await entry(c, {
      act: 'specification_issued', person: 'quality@example.com',
      object_kind: 'specification_issue', object_ref: r, at: '2026-02-01T10:00:00Z',
      content: { grade: 'N6' },
    });
  }
  await c.query(
    `INSERT INTO conformance (reference,customer,application,spec_grade,spec_version,trials,outcome) VALUES
     ('CNF-0001','CUS-HELIOS','technical apparel yarn','N6',3,$1,'qualified'),
     ('CNF-0002','CUS-VANTA','airbag fabric','N6',2,$2,'qualified')`,
    [
      JSON.stringify([
        { trial: 'spin trial 1', date: '2026-02-10', outcome: 'pass' },
        { trial: 'dye uptake', date: '2026-02-18', outcome: 'pass' },
      ]),
      JSON.stringify([
        { trial: 'weave trial', date: '2025-09-05', outcome: 'pass' },
        { trial: 'deployment cycle', date: '2025-10-02', outcome: 'pass' },
        { trial: 'ageing 1000 h', date: '2025-11-20', outcome: 'pass' },
      ]),
    ]
  );

  // ---- contracts ---------------------------------------------------------
  await c.query(
    `INSERT INTO contract (id,recipient,site,period,committed_kg,floor_bp,delivered_kg,shortfall_consequence) VALUES
     ('CON-HELIOS-1','CUS-HELIOS','SITE-DEMO','2026-H1',200,5000,0,'a shortfall is made good in the following period at the same floor'),
     ('CON-VANTA-1','CUS-VANTA','SITE-COMM','2029-H1',1000,3000,0,'a make-good volume in the following period')`
  );

  // ---- certificates ------------------------------------------------------
  const pilotContent = contentBp(150000, 200000);
  const certCarbon = {
    value_mg_per_kg: 4640000, boundary: 'cradle-to-gate', method_version: 'CM-PA6 v2',
    uncertainty_bp: 1500, primary_share_bp: 5800,
    comparator, breakdown: pilotBreakdown,
    energy_location_mg_per_kg: 2010000, energy_market_mg_per_kg: 780000,
    metered_kwh: 140000, retired_kwh: 0, unmatched_kwh: 140000,
  };
  const certs = [
    {
      number: 'CERT-PILOT-000001', recipient: 'CUS-HELIOS', signed_at: '2026-03-02T11:00:00Z',
      state: 'withdrawn', withdrawn_on: '2026-04-18',
      withdrawal_reason: 'A collector category was corrected after acceptance',
    },
    {
      number: 'CERT-PILOT-000002', recipient: 'CUS-VANTA', signed_at: '2026-03-20T11:00:00Z',
      state: 'issued', withdrawn_on: null, withdrawal_reason: null,
    },
  ];
  for (const cert of certs) {
    const recipientName = cert.recipient === 'CUS-HELIOS'
      ? 'Helios Technical Textiles' : 'Vanta Restraint Systems';
    const conditions = [
      { condition: 'lot_released', satisfied: true, blocking_reference: null, detail: 'LOT-N6-0003 is released.' },
      { condition: 'no_open_deviation', satisfied: true, blocking_reference: null, detail: 'No deviation touching this lot is open.' },
      { condition: 'no_unreviewed_override', satisfied: true, blocking_reference: null, detail: 'No override on this lot is unreviewed.' },
      { condition: 'period_closed', satisfied: true, blocking_reference: null, detail: 'The bookkeeping period was closed at the moment of signing.' },
      { condition: 'balance_invariant_holds', satisfied: true, blocking_reference: null, detail: 'Credits attached do not exceed credits available.' },
      { condition: 'carbon_figure_complete', satisfied: true, blocking_reference: 'CFG-0002', detail: '4640000 mg CO2e/kg on cradle-to-gate under CM-PA6 v2, uncertainty 1500 bp.' },
      { condition: 'signer_holds_scope', satisfied: true, blocking_reference: null, detail: 'signer2@example.com holds signing scope for SITE-PILOT.' },
      { condition: 'signer_did_not_enter_data', satisfied: true, blocking_reference: null, detail: 'signer2@example.com entered no data on this lot.' },
    ];
    const permitted = permittedStatement('mass_balance', pilotContent, { post_consumer: 150000, pre_consumer: 0 });
    const prohibited = prohibitedStatement('mass_balance');
    const body = {
      number: cert.number, version: 1, site: 'SITE-PILOT', grade: 'N6',
      recipient: cert.recipient, recipient_name: recipientName,
      lots: [{ reference: 'LOT-N6-0003', mass_g: 200000 }],
      specification_version: 3, claim_type: 'mass_balance', content_bp: pilotContent,
      category_split: { post_consumer: 150000, pre_consumer: 0 },
      period: 'BP-PILOT-N6-2026H1', carbon: certCarbon, primary_share_bp: 5800,
      scheme: SCHEME, registration: REGISTRATION,
      test_results: [
        { property: 'relative_viscosity', method: 'ISO 307', value: '2.41', unit: 'ratio', uncertainty_bp: 150 },
        { property: 'moisture', method: 'ISO 15512', value: '0.08', unit: 'percent', uncertainty_bp: 200 },
      ],
      permitted_statement: permitted, prohibited_statement: prohibited,
      signer: 'signer2@example.com', signer_name: 'Pavel Ostrowski',
      signed_at: cert.signed_at, state: cert.state, provisional_factor: true,
      verification_url: `${VERIFY_BASE}/${cert.number}`,
      withdrawn_on: cert.withdrawn_on, withdrawal_reason: cert.withdrawal_reason,
      withdrawn_by: cert.state === 'withdrawn' ? 'signer2@example.com' : null,
      language: 'en',
    };
    const doc = buildDocument(body);
    await c.query(
      `INSERT INTO certificate (number,version,site,grade,recipient,recipient_name,lots,specification_version,claim_type,content_bp,category_split,period,carbon,primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,signer,signer_name,signed_at,state,provisional_factor,conditions,input_versions,withdrawn_on,withdrawn_by,withdrawal_reason,document,language)
       VALUES ($1,1,'SITE-PILOT','N6',$2,$3,$4,3,'mass_balance',$5,$6,'BP-PILOT-N6-2026H1',$7,5800,$8,$9,$10,$11,$12,'signer2@example.com','Pavel Ostrowski',$13,$14,true,$15,$16,$17,$18,$19,$20,'en')`,
      [
        cert.number, cert.recipient, recipientName,
        JSON.stringify([{ reference: 'LOT-N6-0003', mass_g: 200000 }]),
        pilotContent, JSON.stringify({ post_consumer: 150000, pre_consumer: 0 }),
        JSON.stringify(certCarbon), SCHEME, REGISTRATION,
        JSON.stringify(body.test_results), permitted, prohibited,
        cert.signed_at, cert.state, JSON.stringify(conditions),
        JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-PILOT-1 v1', specification: 'SPEC-N6 v3', carbon_figure: 'CFG-0002' }),
        cert.withdrawn_on, cert.state === 'withdrawn' ? 'signer2@example.com' : null,
        cert.withdrawal_reason, doc,
      ]
    );
    await entry(c, {
      act: 'certificate_signed', person: 'signer2@example.com', site: 'SITE-PILOT',
      object_kind: 'certificate', object_ref: cert.number, at: cert.signed_at,
      content: {
        number: cert.number, lot: 'LOT-N6-0003', recipient: cert.recipient,
        claim_type: 'mass_balance', content_bp: pilotContent, conditions,
      },
    });
    if (cert.state === 'withdrawn') {
      await entry(c, {
        act: 'certificate_withdrawn', person: 'signer2@example.com', site: 'SITE-PILOT',
        object_kind: 'certificate', object_ref: cert.number, at: '2026-04-18T14:00:00Z',
        content: { reason: cert.withdrawal_reason, withdrawn_on: '2026-04-18' },
      });
    }
  }
  await c.query("UPDATE certificate_sequence SET next = 3 WHERE site = 'SITE-PILOT'");

  // A legal hold on the record entry for the signing of CERT-PILOT-000001.
  const signingEntry = await c.query(
    "SELECT seq FROM record_entry WHERE act = 'certificate_signed' AND object_ref = 'CERT-PILOT-000001'"
  );
  if (signingEntry.rows.length) {
    await c.query(
      `INSERT INTO legal_hold (reference,seq,placed_by,placed_at,active)
       VALUES ('HLD-0001',$1,'auditor@example.com','2026-04-20T09:00:00Z',true)`,
      [signingEntry.rows[0].seq]
    );
    await entry(c, {
      act: 'legal_hold_placed', person: 'auditor@example.com', object_kind: 'legal_hold',
      object_ref: 'HLD-0001', at: '2026-04-20T09:00:00Z',
      content: { seq: Number(signingEntry.rows[0].seq) },
    });
  }

  // ---- inbound records ---------------------------------------------------
  const inbound = [
    ['INB-0001', 'weighbridge', '2026-02-20T06:14:00Z',
     '{"ticket":"WB-DEMO-02/2026/0417","device":"WB-DEMO-02","batch":"BATCH-1004","gross_kg":140.0,"tare_kg":20.0,"net_kg":120.0,"calibration":{"last":"2025-02-01","state":"lapsed"},"operator":"I.Bekele"}'],
    ['INB-0002', 'control_system', '2026-03-04T22:41:00Z',
     '{"run":"RUN-D-0001","recipe":"RCP-DISS-2","achieved":{"temperature_c":165,"pressure_bar":3,"residence_min":92},"samples":288,"source":"DCS historian export"}'],
    ['INB-0003', 'laboratory', '2026-03-06T09:02:00Z',
     '{"subject":"LOT-N6-0001","property":"relative_viscosity","method":"ISO 307","instrument":"VISCO-2","result":2.43,"unit":"ratio","uncertainty_pct":1.5,"analyst":"T.Vlach"}'],
  ];
  for (const [reference, source, at, verbatim] of inbound) {
    await c.query(
      `INSERT INTO inbound_record (reference,source,received_at,payload_verbatim,payload)
       VALUES ($1,$2,$3,$4,$5)`,
      [reference, source, at, verbatim, verbatim]
    );
    await entry(c, {
      act: 'inbound_record_stored', person: SYSTEM, object_kind: 'inbound_record',
      object_ref: reference, at,
      content: { source, payload_verbatim: verbatim },
    });
  }

  // ---- public site data --------------------------------------------------
  await c.query(
    `INSERT INTO statistic (key,value,source,year,geography) VALUES
     ('textiles_recycled','Less than 1 per cent of textiles are recycled into new materials','Textile Flow Monitor',2024,'Global'),
     ('plastics_emissions','1.8 gigatonnes of carbon dioxide equivalent a year from plastics production','Global Materials Emissions Panel',2023,'Global'),
     ('textile_incineration','More than 8 per cent of textile waste is incinerated each year','Textile Flow Monitor',2024,'EU-27')`
  );
  await c.query(
    `INSERT INTO position (reference,title,location,department,contract_type,closes_on) VALUES
     ('POS-0001','Process Engineer','Lyon, France','Operations','Permanent','2026-11-30')`
  );
  await c.query(
    `INSERT INTO news_item (reference,title,tag,outlet,item_date,link,language,summary) VALUES
     ('NWS-0001','Series A closes at 40 million euros','funding','Materials Weekly','2026-01-22','https://example.com/news/series-a','en','The round funds the demonstration plant and the first commercial line.'),
     ('NWS-0002','Offtake agreement signed for demonstration output','partnership','Fibre Report','2026-03-11','https://example.com/news/offtake','en','A first offtake covering the demonstration plant''s 2026 output.'),
     ('NWS-0003','Depolymerisation yield published','technical','Chimie Circulaire','2026-05-06','https://example.com/news/rendement','fr','Les rendements de dépolymérisation sont publiés avec leur méthode.')`
  );
  await c.query(
    `INSERT INTO claim_substantiation (reference,claim,route,first_published,evidence,evidence_expires_on,method_version,approver,review_date,state) VALUES
     ('CLM-0001','Low-carbon, virgin-quality recycled polymers','/','2026-01-10','Carbon figure CFG-0001 against comparator virgin PA6, EcoBase 2025, EU-27','2027-01-20','CM-PA6 v2','Marit Solheim','2026-12-31','published'),
     ('CLM-0002','Recycled Nylon 6 at a mass-balance claim under RCS-2026','/product','2026-01-10','Balance period BP-DEMO-N6-2026H1 credit movements and conversion factor CF-DEMO-1','2026-09-30','CM-PA6 v2','Osei Danquah','2026-11-30','published'),
     ('CLM-0003','Low temperature and pressure process','/technology','2026-01-10','Recipe versions RCP-DISS-2 and RCP-PURI-1 set points against published thresholds','2027-01-05','CM-PA6 v2','Marit Solheim','2026-12-31','published')`
  );

  await entry(c, {
    act: 'seed_completed', person: SYSTEM, at: new Date().toISOString(),
    content: { note: 'Seeded records match the published tables.' },
  });
}

export function permittedStatement(claimType, content_bp, split, language = 'en') {
  const pct = (content_bp / 100).toFixed(2);
  const post = split?.post_consumer || 0;
  const pre = split?.pre_consumer || 0;
  if (claimType === 'mass_balance') {
    return `You may state that this material carries ${pct} per cent recycled content by mass balance under RCS-2026, of which ${post} g is post-consumer and ${pre} g is pre-consumer. This material is claimed by mass balance. It is not physically segregated.`;
  }
  if (claimType === 'controlled_blending') {
    return `You may state that this material carries ${pct} per cent recycled content by controlled blending under RCS-2026, of which ${post} g is post-consumer and ${pre} g is pre-consumer.`;
  }
  return `You may state that this material is physically segregated recycled material at ${pct} per cent recycled content under RCS-2026, of which ${post} g is post-consumer and ${pre} g is pre-consumer.`;
}

export function prohibitedStatement(claimType, language = 'en') {
  if (claimType === 'mass_balance') {
    return 'You may not state that this material physically contains recycled content. You may not describe it as physically segregated, and you may not apply this claim to any volume beyond the mass stated on this certificate.';
  }
  if (claimType === 'controlled_blending') {
    return 'You may not state a recycled content higher than the percentage on this certificate, and you may not apply this claim to any volume beyond the mass stated here.';
  }
  return 'You may not apply this claim to any volume beyond the mass stated on this certificate.';
}
