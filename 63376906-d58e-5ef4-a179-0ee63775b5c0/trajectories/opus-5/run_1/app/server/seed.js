// The exact rows the product seeds on first start.
import { pool, tx } from './db.js';
import { appendEntry } from './lib/record.js';
import { dryMass, creditGranted } from './lib/num.js';
import { statementsFor } from './engine.js';

const SCHEME = 'RCS-2026';
const REGISTRATION = 'REG-RAVEL-0042';
const VERIFY_BASE = 'https://ravel.example.com/verify';

async function alreadySeeded() {
  const r = await pool.query("SELECT 1 FROM site WHERE reference = 'SITE-DEMO'");
  return r.rowCount > 0;
}

const j = (v) => JSON.stringify(v);

export async function seed() {
  if (await alreadySeeded()) return { seeded: false };

  await tx(async (c) => {
    const entry = (e) => appendEntry(c, e);
    const ins = (text, params) => c.query(text, params);

    // ---- Sites ------------------------------------------------------------
    const basis = '8000 hours per year, 0.90 availability, 0.80 yield';
    for (const s of [
      ['SITE-PILOT', 'Pilot', 'commissioned', 40000, 24000, 'certified'],
      ['SITE-DEMO', 'Demonstration', 'commissioned', 400000, 320000, 'certified'],
      ['SITE-COMM', 'Commercial', 'planned', 25000000, 26000000, 'not_certified'],
    ]) {
      await ins(
        `INSERT INTO site (reference,name,confidence,nameplate_kg,contracted_kg,certification_state,capacity_basis,last_revised)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'2026-06-30')`,
        [...s, basis]
      );
    }
    await ins(
      `INSERT INTO certification_period (reference,site,grade,state,effective_from,effective_to)
       VALUES ('CERTP-PILOT-1','SITE-PILOT',NULL,'certified','2026-01-01',NULL),
              ('CERTP-DEMO-1','SITE-DEMO',NULL,'certified','2026-01-01',NULL)`
    );

    // ---- Accounts (the record's own copy; keycloak holds the credentials) --
    const accounts = [
      ['plant@example.com', 'Ines Bekele', 'plant_operator', ['SITE-DEMO', 'SITE-PILOT']],
      ['analyst@example.com', 'Tomas Vlach', 'lab_analyst', ['SITE-DEMO', 'SITE-PILOT']],
      ['quality@example.com', 'Marit Solheim', 'quality_manager', ['SITE-DEMO', 'SITE-PILOT']],
      ['claims@example.com', 'Osei Danquah', 'claims_manager', ['SITE-DEMO', 'SITE-PILOT']],
      ['signer@example.com', 'Hana Ferreira', 'certificate_signer', ['SITE-DEMO', 'SITE-PILOT']],
      ['signer2@example.com', 'Pavel Ostrowski', 'certificate_signer', ['SITE-PILOT']],
      ['auditor@example.com', 'Ruth Lindqvist', 'auditor', ['SITE-DEMO', 'SITE-PILOT']],
    ];
    for (const [email, name, role, sites] of accounts) {
      await ins(
        `INSERT INTO account (email,name,role,sites,grant_ends_on) VALUES ($1,$2,$3,$4,'2027-06-30')`,
        [email, name, role, j(sites)]
      );
      await entry({
        act: 'access_grant_recorded', person: 'quality@example.com', object_kind: 'account',
        object_ref: email, event_at: '2026-01-01T08:00:00Z',
        content: { email, role, sites, grant_ends_on: '2027-06-30' },
      });
    }

    // ---- Collectors and their approval periods ----------------------------
    const collectors = [
      ['COL-ALDER', 'Alder Reclaim', 'PT', 'WCR-PT-4471', '2027-03-31'],
      ['COL-BRINE', 'Brine Textile Recovery', 'NL', 'WCR-NL-2208', '2027-01-31'],
      ['COL-CINDER', 'Cinder Industrial Offcuts', 'FR', 'WCR-FR-6613', '2026-12-31'],
    ];
    for (const [ref, name, country, reg, expiry] of collectors) {
      await ins(
        `INSERT INTO collector (reference,name,country,registration,registration_expiry,site_types,declared_streams,scheme_status,declared_polymer,declared_fraction_bp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'in_good_standing',$8,$9)`,
        [ref, name, country, reg, expiry,
          j(ref === 'COL-CINDER' ? ['industrial_site'] : ['civic_amenity', 'commercial_collection']),
          j(ref === 'COL-CINDER' ? ['pre_consumer_offcuts'] : ['post_consumer_textiles', 'post_consumer_carpet']),
          'PA6', ref === 'COL-CINDER' ? 9900 : 9200]
      );
      await ins('INSERT INTO party (reference,kind) VALUES ($1,$2)', [ref, 'collector']);
      await ins(
        'INSERT INTO party_version (reference,name,effective_from) VALUES ($1,$2,$3)',
        [ref, name, '2026-01-01']
      );
    }
    // A collector is acquired: the name changes from an effective date.
    await ins(
      'INSERT INTO party_version (reference,name,effective_from) VALUES ($1,$2,$3)',
      ['COL-BRINE', 'Brine Circular Materials', '2026-08-01']
    );
    await entry({
      act: 'party_version_recorded', person: 'quality@example.com', object_kind: 'party',
      object_ref: 'COL-BRINE', event_at: '2026-08-01T09:00:00Z',
      content: { name: 'Brine Circular Materials', effective_from: '2026-08-01' },
    });

    const approvals = [
      ['APR-ALDER-1', 'COL-ALDER', 'approved', '2026-01-01', '2026-12-31', null, null],
      ['APR-BRINE-1', 'COL-BRINE', 'approved', '2026-01-01', '2026-06-30', null, null],
      ['APR-CINDER-1', 'COL-CINDER', 'conditional', '2026-01-01', '2026-12-31',
        'Sampling plan for coated streams to be agreed', '2026-10-31'],
    ];
    for (const a of approvals) {
      await ins(
        `INSERT INTO approval_period (reference,collector,state,valid_from,valid_to,condition,condition_closes_on,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'quality@example.com')`,
        a
      );
      await entry({
        act: 'collector_approved', person: 'quality@example.com', object_kind: 'collector',
        object_ref: a[1], event_at: a[3] + 'T09:00:00Z',
        content: { state: a[2], valid_from: a[3], valid_to: a[4], condition: a[5] },
      });
    }

    // ---- Weighing devices -------------------------------------------------
    await ins(
      `INSERT INTO weighing_device (reference,site,calibrated_on) VALUES
        ('WB-DEMO-01','SITE-DEMO','2026-05-01'),('WB-DEMO-02','SITE-DEMO','2025-02-01')`
    );

    // ---- Batches ----------------------------------------------------------
    const batches = [
      { ref: 'BATCH-1001', col: 'COL-ALDER', cat: 'post_consumer', on: '2026-02-10', net: 500000, moist: 1000, dev: 'WB-DEMO-01' },
      { ref: 'BATCH-1002', col: 'COL-ALDER', cat: 'pre_consumer', on: '2026-02-12', net: 300000, moist: 0, dev: 'WB-DEMO-01' },
      { ref: 'BATCH-1003', col: 'COL-BRINE', cat: 'post_consumer', on: '2026-07-05', net: 200000, moist: 500, dev: 'WB-DEMO-01' },
      { ref: 'BATCH-1004', col: 'COL-CINDER', cat: 'pre_consumer', on: '2026-02-20', net: 120000, moist: 0, dev: 'WB-DEMO-02' },
      { ref: 'BATCH-1005', col: 'COL-ALDER', cat: 'post_consumer', on: '2026-03-02', net: 100000, moist: 0, dev: 'WB-DEMO-01' },
    ];
    const compositions = {
      'BATCH-1001': { polymer: 'PA6', fraction_bp: 9200, basis: 'sampled', measured_fraction_bp: 9200 },
      'BATCH-1002': { polymer: 'PA6', fraction_bp: 9400, basis: 'sampled', measured_fraction_bp: 9400 },
      'BATCH-1003': { polymer: 'PA6', fraction_bp: 8900, basis: 'declared', measured_fraction_bp: null },
      'BATCH-1004': { polymer: 'PA6', fraction_bp: 9900, basis: 'declared', measured_fraction_bp: 9100 },
      'BATCH-1005': { polymer: 'PA6', fraction_bp: 9000, basis: 'declared', measured_fraction_bp: null },
    };
    const contaminations = {
      'BATCH-1001': { non_nylon_bp: 800, elastane_bp: 400, coatings: 'none observed', colour_load: 'mixed dark', foreign_matter: 'buttons and zips removed at source' },
      'BATCH-1002': { non_nylon_bp: 600, elastane_bp: 200, coatings: 'none observed', colour_load: 'undyed', foreign_matter: 'none observed' },
      'BATCH-1003': { non_nylon_bp: 1100, elastane_bp: 700, coatings: 'polyurethane on part of the stream', colour_load: 'mixed', foreign_matter: 'trim' },
      'BATCH-1004': { non_nylon_bp: 100, elastane_bp: 0, coatings: 'none', colour_load: 'natural', foreign_matter: 'none' },
      'BATCH-1005': { non_nylon_bp: 1000, elastane_bp: 500, coatings: 'none observed', colour_load: 'mixed', foreign_matter: 'none observed' },
    };
    for (const b of batches) {
      await ins(
        `INSERT INTO batch (reference,collector,site,grade,category,gross_g,tare_g,net_g,moisture_bp,moisture_method,device,received_on,composition,contamination,accepted_g,event_at,effective_on,recorded_by)
         VALUES ($1,$2,'SITE-DEMO','N6',$3,$4,$5,$6,$7,'ISO 15512',$8,$9,$10,$11,$6,$12,$9,'plant@example.com')`,
        [b.ref, b.col, b.cat, b.net + 20000, 20000, b.net, b.moist, b.dev, b.on,
          j(compositions[b.ref]), j(contaminations[b.ref]), b.on + 'T07:30:00Z']
      );
      await ins(
        `INSERT INTO weighing (reference,batch,device,gross_g,tare_g,net_g,calibration_state,weighed_at)
         VALUES ($1,$2,$3,$4,20000,$5,$6,$7)`,
        ['WGH-' + b.ref.slice(6), b.ref, b.dev, b.net + 20000, b.net,
          b.dev === 'WB-DEMO-02' ? 'lapsed' : 'in_calibration', b.on + 'T07:25:00Z']
      );
      // BATCH-1005 is the one batch whose custody list omits a link: transport.
      const kinds = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance']
        .filter((k) => !(b.ref === 'BATCH-1005' && k === 'transport'));
      let ordinal = 0;
      for (const kind of kinds) {
        await ins(
          'INSERT INTO custody_link (batch,kind,link_date,party,ordinal) VALUES ($1,$2,$3,$4,$5)',
          [b.ref, kind, b.on, kind === 'collector' ? b.col : kind === 'transport' ? 'Haulier of record' : 'SITE-DEMO', ordinal++]
        );
      }
      await entry({
        act: 'batch_booked_in', person: 'plant@example.com', site: 'SITE-DEMO',
        object_kind: 'batch', object_ref: b.ref, event_at: b.on + 'T07:30:00Z',
        content: { collector: b.col, category: b.cat, net_g: b.net, moisture_bp: b.moist, device: b.dev, received_on: b.on },
      });
      await entry({
        act: 'weighing_recorded', person: 'plant@example.com', site: 'SITE-DEMO',
        object_kind: 'weighing', object_ref: 'WGH-' + b.ref.slice(6), event_at: b.on + 'T07:25:00Z',
        content: { batch: b.ref, device: b.dev, net_g: b.net, calibration_state: b.dev === 'WB-DEMO-02' ? 'lapsed' : 'in_calibration' },
      });
    }

    // A measured composition departing from the declaration by more than 500 bp
    // is a finding against the collector, not against the plant.
    await ins(
      `INSERT INTO finding (reference,collector,batch,kind,detail,departure_bp,raised_on,due_on,state)
       VALUES ('FND-0001','COL-CINDER','BATCH-1004','declaration_departure',
               'Declared PA6 fraction 9900 bp, measured 9100 bp on BATCH-1004: a departure of 800 basis points.',
               800,'2026-02-22','2026-04-30','open')`
    );
    await entry({
      act: 'finding_raised', person: 'quality@example.com', object_kind: 'collector',
      object_ref: 'COL-CINDER', event_at: '2026-02-22T10:00:00Z',
      content: { finding: 'FND-0001', departure_bp: 800, batch: 'BATCH-1004' },
    });

    // ---- Recipes ----------------------------------------------------------
    const recipes = [
      ['RCP-DISS-2', 'dissolution', 2, { temperature_c: 165, pressure_bar: 3 }, { temperature_c: { min: 160, max: 170 }, pressure_bar: { min: 2, max: 4 } }, 120],
      ['RCP-DEPO-4', 'depolymerisation', 4, { temperature_c: 240, pressure_bar: 6 }, { temperature_c: { min: 230, max: 250 }, pressure_bar: { min: 5, max: 7 } }, 240],
      ['RCP-PURI-1', 'purification', 1, { temperature_c: 90, pressure_bar: 1 }, { temperature_c: { min: 85, max: 95 }, pressure_bar: { min: 1, max: 2 } }, 90],
      ['RCP-REPO-3', 'repolymerisation', 3, { temperature_c: 255, pressure_bar: 8 }, { temperature_c: { min: 245, max: 265 }, pressure_bar: { min: 7, max: 9 } }, 300],
    ];
    for (const [ref, type, version, sp, tol, res] of recipes) {
      await ins(
        `INSERT INTO recipe_version (reference,run_type,version,set_points,tolerances,reagents,residence_min,released_by,released_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'quality@example.com','2026-01-05')`,
        [ref, type, version, j(sp), j(tol), j([{ reagent: 'green solvent', ratio_bp: 4000 }]), res]
      );
    }

    // ---- Runs, consumptions and outputs -----------------------------------
    const runs = [
      { ref: 'RUN-D-0001', type: 'dissolution', recipe: 'RCP-DISS-2', at: '2026-03-04T06:00:00Z', losses: 120000, actual: { temperature_c: 165, pressure_bar: 3 } },
      { ref: 'RUN-D-0002', type: 'dissolution', recipe: 'RCP-DISS-2', at: '2026-03-05T06:00:00Z', losses: 60000, actual: { temperature_c: 172, pressure_bar: 3 } },
      { ref: 'RUN-D-0003', type: 'dissolution', recipe: 'RCP-DISS-2', at: '2026-03-06T06:00:00Z', losses: 30000, actual: { temperature_c: 164, pressure_bar: 3 } },
      { ref: 'RUN-Y-0001', type: 'depolymerisation', recipe: 'RCP-DEPO-4', at: '2026-03-09T06:00:00Z', losses: 50000, actual: { temperature_c: 241, pressure_bar: 6 } },
      { ref: 'RUN-U-0001', type: 'purification', recipe: 'RCP-PURI-1', at: '2026-03-12T06:00:00Z', losses: 40000, actual: { temperature_c: 90, pressure_bar: 1 } },
      { ref: 'RUN-R-0001', type: 'repolymerisation', recipe: 'RCP-REPO-3', at: '2026-03-16T06:00:00Z', losses: 20000, actual: { temperature_c: 255, pressure_bar: 8 } },
    ];
    for (const r of runs) {
      await ins(
        `INSERT INTO run (reference,run_type,site,equipment,recipe_version,operator,started_at,closed_at,state,losses_g,actual_set_points,event_at,effective_on,recorded_by)
         VALUES ($1,$2,'SITE-DEMO',$3,$4,'plant@example.com',$5,$6,'closed',$7,$8,$5,$9,'plant@example.com')`,
        [r.ref, r.type, 'EQ-' + r.type.slice(0, 4).toUpperCase() + '-1', r.recipe, r.at,
          r.at.replace('06:00', '18:00'), r.losses, j(r.actual), r.at.slice(0, 10)]
      );
      await entry({
        act: 'run_started', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'run',
        object_ref: r.ref, event_at: r.at, content: { run_type: r.type, recipe_version: r.recipe },
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
    const runAt = Object.fromEntries(runs.map((r) => [r.ref, r.at]));
    for (const [ref, run, kind, inputRef, mass] of consumptions) {
      await ins(
        `INSERT INTO consumption (reference,run,input_kind,input_ref,mass_g,event_at,effective_on,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'plant@example.com')`,
        [ref, run, kind, inputRef, mass, runAt[run], runAt[run].slice(0, 10)]
      );
      await entry({
        act: 'consumption_recorded', person: 'plant@example.com', site: 'SITE-DEMO',
        object_kind: 'consumption', object_ref: ref, event_at: runAt[run],
        content: { run, input_kind: kind, input: inputRef, mass_g: mass },
      });
    }
    for (const [ref, run, kind, mass, disposition] of outputs) {
      await ins(
        `INSERT INTO output (reference,run,kind,mass_g,disposition,event_at,effective_on,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'plant@example.com')`,
        [ref, run, kind, mass, disposition, runAt[run], runAt[run].slice(0, 10)]
      );
    }
    for (const r of runs) {
      await entry({
        act: 'run_closed', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'run',
        object_ref: r.ref, event_at: r.at.replace('06:00', '18:00'),
        content: { losses_g: r.losses, rule: 'mass in minus mass out' },
      });
    }

    // ---- Lots -------------------------------------------------------------
    const lots = [
      ['LOT-N6-0001', 'N6', 'SITE-DEMO', 400000, 'released', 'mass_balance', 'RUN-R-0001', 'BP-DEMO-N6-2026H1', 'analyst@example.com', false],
      ['LOT-N6-0002', 'N6', 'SITE-DEMO', 300000, 'quarantined', 'mass_balance', 'RUN-R-0001', 'BP-DEMO-N6-2026H1', 'quality@example.com', false],
      ['LOT-N6-0003', 'N6', 'SITE-PILOT', 200000, 'released', 'mass_balance', null, 'BP-PILOT-N6-2026H1', 'quality@example.com', true],
    ];
    for (const [ref, grade, site, mass, disp, claim, run, period, by, provisional] of lots) {
      await ins(
        `INSERT INTO lot (reference,grade,site,mass_g,disposition,claim_type,produced_by,output_ref,period,provisional_factor,dispositioned_by,dispositioned_at,sites_named,event_at,effective_on,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$1,$8,$9,$10,$11,$12,$11,$13,'plant@example.com')`,
        [ref, grade, site, mass, disp, claim, run, period, provisional, by,
          site === 'SITE-PILOT' ? '2026-02-20T10:00:00Z' : '2026-03-17T10:00:00Z',
          j([site]), site === 'SITE-PILOT' ? '2026-02-20' : '2026-03-17']
      );
      await entry({
        act: 'lot_dispositioned', person: by, site, object_kind: 'lot', object_ref: ref,
        event_at: site === 'SITE-PILOT' ? '2026-02-20T10:00:00Z' : '2026-03-17T10:00:00Z',
        content: { disposition: disp, claim_type: claim },
      });
    }

    // ---- Test results -----------------------------------------------------
    const tests = [
      ['TST-0001', 'lot', 'LOT-N6-0001', 'relative_viscosity', 'ISO 307', 'VIS-2', '2.43', 'ratio', 200],
      ['TST-0002', 'lot', 'LOT-N6-0001', 'moisture', 'ISO 15512', 'KF-1', '0.06', 'percent', 150],
      ['TST-0003', 'lot', 'LOT-N6-0003', 'relative_viscosity', 'ISO 307', 'VIS-2', '2.41', 'ratio', 200],
      ['TST-0004', 'lot', 'LOT-N6-0003', 'moisture', 'ISO 15512', 'KF-1', '0.08', 'percent', 150],
      ['TST-0005', 'lot', 'LOT-N6-0002', 'relative_viscosity', 'ISO 307', 'VIS-2', '2.31', 'ratio', 200],
    ];
    for (const [ref, kind, subject, property, method, instrument, value, unit, unc] of tests) {
      await ins(
        `INSERT INTO test_result (reference,subject_kind,subject_ref,property,method,instrument,analyst,value,unit,uncertainty_bp,entered_by,event_at,effective_on)
         VALUES ($1,$2,$3,$4,$5,$6,'Tomas Vlach',$7,$8,$9,'analyst@example.com','2026-03-06T09:02:00Z','2026-03-06')`,
        [ref, kind, subject, property, method, instrument, value, unit, unc]
      );
      await entry({
        act: 'test_result_entered', person: 'analyst@example.com', object_kind: 'test_result',
        object_ref: ref, event_at: '2026-03-06T09:02:00Z',
        content: { subject: subject, property, method, value, unit, uncertainty_bp: unc },
      });
    }

    // ---- Deviations and overrides -----------------------------------------
    await ins(
      `INSERT INTO deviation (reference,state,runs,lots,detail,raised_by,raised_at,event_at,effective_on)
       VALUES ('DEV-0001','open',$1,$2,'Purification residence time ran short against the recipe and the lot is held pending investigation.','quality@example.com','2026-03-13T08:00:00Z','2026-03-13T08:00:00Z','2026-03-13')`,
      [j(['RUN-U-0001']), j(['LOT-N6-0002'])]
    );
    await ins(
      `INSERT INTO deviation (reference,state,runs,lots,detail,outcome,raised_by,raised_at,closed_by,closed_at,event_at,effective_on)
       VALUES ('DEV-0002','closed',$1,'[]','Dissolution temperature reached 172 C against a recipe band of 160 to 170 C.','cause_not_established','quality@example.com','2026-03-05T19:00:00Z','quality@example.com','2026-03-20T11:00:00Z','2026-03-05T19:00:00Z','2026-03-05')`,
      [j(['RUN-D-0002'])]
    );
    await entry({
      act: 'deviation_raised', person: 'quality@example.com', site: 'SITE-DEMO',
      object_kind: 'deviation', object_ref: 'DEV-0001', event_at: '2026-03-13T08:00:00Z',
      content: { runs: ['RUN-U-0001'], lots: ['LOT-N6-0002'] },
    });
    await entry({
      act: 'deviation_raised', person: 'quality@example.com', site: 'SITE-DEMO',
      object_kind: 'deviation', object_ref: 'DEV-0002', event_at: '2026-03-05T19:00:00Z',
      content: { runs: ['RUN-D-0002'] },
    });
    await entry({
      act: 'deviation_closed', person: 'quality@example.com', site: 'SITE-DEMO',
      object_kind: 'deviation', object_ref: 'DEV-0002', event_at: '2026-03-20T11:00:00Z',
      content: { outcome: 'cause_not_established' },
    });

    await ins(
      `INSERT INTO override (reference,separation,reason,lot,authorised_by,recorded_by,reviewed,event_at,effective_on)
       VALUES ('OVR-0001','analyst_not_dispositioner',
               'Night shift analyst dispositioned the lot because no second qualified person was on site',
               'LOT-N6-0001','quality@example.com','quality@example.com',false,'2026-03-18T02:10:00Z','2026-03-18')`
    );
    await entry({
      act: 'override_recorded', person: 'quality@example.com', site: 'SITE-DEMO',
      object_kind: 'override', object_ref: 'OVR-0001', event_at: '2026-03-18T02:10:00Z',
      content: { separation: 'analyst_not_dispositioner', lot: 'LOT-N6-0001', authorised_by: 'quality@example.com' },
    });

    // ---- Conversion factors ----------------------------------------------
    await ins(
      `INSERT INTO conversion_factor (reference,site,version,factor_bp,derived_from,derived_to,derived_in_g,derived_out_g,provisional,published_by,published_on)
       VALUES ('CF-DEMO-1','SITE-DEMO',1,8000,'2026-01-01','2026-03-31',1000000,800000,false,'claims@example.com','2026-01-05'),
              ('CF-PILOT-1','SITE-PILOT',1,7500,NULL,NULL,0,0,true,'claims@example.com','2026-01-05')`
    );
    for (const ref of ['CF-DEMO-1', 'CF-PILOT-1']) {
      await entry({
        act: 'conversion_factor_published', person: 'claims@example.com', object_kind: 'conversion_factor',
        object_ref: ref, event_at: '2026-01-05T09:00:00Z',
        content: { factor_bp: ref === 'CF-DEMO-1' ? 8000 : 7500, provisional: ref === 'CF-PILOT-1' },
      });
    }

    // ---- Balance periods --------------------------------------------------
    await ins(
      `INSERT INTO balance_period (id,site,grade,period_from,period_to,state,carry_over_limit_bp,allocation_basis,closed_on,closed_by,cut_off)
       VALUES ('BP-DEMO-N6-2025H2','SITE-DEMO','N6','2025-07-01','2025-12-31','closed',2000,'mass','2026-01-15','claims@example.com','2026-01-10'),
              ('BP-DEMO-N6-2026H1','SITE-DEMO','N6','2026-01-01','2026-06-30','open',2000,'mass',NULL,NULL,NULL),
              ('BP-PILOT-N6-2026H1','SITE-PILOT','N6','2026-01-01','2026-06-30','open',2000,'mass',NULL,NULL,NULL)`
    );
    await entry({
      act: 'balance_period_closed', person: 'claims@example.com', site: 'SITE-DEMO',
      object_kind: 'balance_period', object_ref: 'BP-DEMO-N6-2025H2', event_at: '2026-01-15T16:00:00Z',
      content: { closed_on: '2026-01-15', cut_off: '2026-01-10' },
    });

    // Credits enter when a claimable batch is consumed: dry mass times the factor.
    const batchByRef = Object.fromEntries(batches.map((b) => [b.ref, b]));
    const claimableBatch = { 'BATCH-1001': true, 'BATCH-1002': true, 'BATCH-1003': false, 'BATCH-1004': true, 'BATCH-1005': false };
    let mv = 0;
    for (const [conRef, run, kind, inputRef, mass] of consumptions) {
      if (kind !== 'batch') continue;
      const b = batchByRef[inputRef];
      const dry = dryMass(mass, 0); // consumption masses are recorded as dry mass at the draw
      const claimable = claimableBatch[inputRef];
      const credit = claimable ? creditGranted(dry, 8000) : 0;
      if (!credit) continue;
      mv += 1;
      await ins(
        `INSERT INTO credit_movement (reference,period,direction,movement,category,mass_g,batch,consumption,fresh_credit,factor_version,derivation,event_at,effective_on,recorded_by)
         VALUES ($1,'BP-DEMO-N6-2026H1','in','consumption',$2,$3,$4,$5,true,'CF-DEMO-1',$6,$7,$8,'plant@example.com')`,
        ['CRM-' + String(mv).padStart(4, '0'), b.cat, credit, inputRef, conRef,
          j({ rule: 'dry_mass_consumed_g * factor_bp / 10000, floored', dry_mass_consumed_g: dry, factor_bp: 8000, factor: 'CF-DEMO-1', consumption: conRef }),
          runAt[run], runAt[run].slice(0, 10)]
      );
    }
    // The pilot's opening position at commissioning.
    await ins(
      `INSERT INTO credit_movement (reference,period,direction,movement,category,mass_g,fresh_credit,factor_version,derivation,event_at,effective_on,recorded_by)
       VALUES ('CRM-PILOT-01','BP-PILOT-N6-2026H1','in','opening','post_consumer',200000,true,'CF-PILOT-1',$1,'2026-01-02T09:00:00Z','2026-01-02','claims@example.com')`,
      [j({ rule: 'opening credit position recorded at commissioning of SITE-PILOT', factor: 'CF-PILOT-1', provisional: true })]
    );
    await ins(
      `INSERT INTO credit_movement (reference,period,direction,movement,category,mass_g,lot,fresh_credit,factor_version,derivation,event_at,effective_on,recorded_by)
       VALUES ('CRM-PILOT-02','BP-PILOT-N6-2026H1','out','allocation','post_consumer',150000,'LOT-N6-0003',true,'CF-PILOT-1',$1,'2026-02-21T09:00:00Z','2026-02-21','claims@example.com')`,
      [j({ rule: 'claim attached to a lot', lot: 'LOT-N6-0003', mass_g: 150000 })]
    );
    await entry({
      act: 'claim_allocated', person: 'claims@example.com', site: 'SITE-PILOT',
      object_kind: 'lot', object_ref: 'LOT-N6-0003', event_at: '2026-02-21T09:00:00Z',
      content: { period: 'BP-PILOT-N6-2026H1', category: 'post_consumer', mass_g: 150000 },
    });

    // ---- Inter-site transfer ---------------------------------------------
    await ins(
      `INSERT INTO transfer (reference,from_period,to_period,category,mass_g,moved_on,recorded_by)
       VALUES ('TRF-0001','BP-PILOT-N6-2026H1','BP-DEMO-N6-2026H1','post_consumer',50000,'2026-05-12','claims@example.com')`
    );
    await ins(
      `INSERT INTO credit_movement (reference,period,direction,movement,category,mass_g,origin_site,fresh_credit,derivation,event_at,effective_on,recorded_by)
       VALUES ('CRM-TRF-OUT','BP-PILOT-N6-2026H1','out','transfer_out','post_consumer',50000,'SITE-PILOT',false,$1,'2026-05-12T10:00:00Z','2026-05-12','claims@example.com'),
              ('CRM-TRF-IN','BP-DEMO-N6-2026H1','in','transfer_in','post_consumer',50000,'SITE-PILOT',false,$2,'2026-05-12T10:00:00Z','2026-05-12','claims@example.com')`,
      [j({ rule: 'material moved between sites during commissioning', transfer: 'TRF-0001', to: 'BP-DEMO-N6-2026H1' }),
       j({ rule: 'inbound credit, never a fresh credit', transfer: 'TRF-0001', origin_site: 'SITE-PILOT' })]
    );
    await entry({
      act: 'transfer_recorded', person: 'claims@example.com', object_kind: 'transfer',
      object_ref: 'TRF-0001', event_at: '2026-05-12T10:00:00Z',
      content: { from: 'BP-PILOT-N6-2026H1', to: 'BP-DEMO-N6-2026H1', mass_g: 50000, fresh_credit: false },
    });

    // ---- Carbon -----------------------------------------------------------
    const factors = [
      { factor: 'grid_electricity_eu27', source: 'EcoBase 2025', year: 2025 },
      { factor: 'process_steam', source: 'EcoBase 2025', year: 2025 },
      { factor: 'green_solvent', source: 'Supplier declaration', year: 2026 },
      { factor: 'road_freight', source: 'EcoBase 2025', year: 2025 },
    ];
    const rules = [
      'Primary data is used for every process under the operator\'s control.',
      'A supplier-specific factor is used where the supplier publishes one with a stated year.',
      'A secondary factor names its dataset and its year.',
    ];
    await ins(
      `INSERT INTO carbon_method (id,version,standard,functional_unit,boundary,allocation_basis,reviewer,published_on,published_by,data_quality_rules,emission_factors,primary_threshold_bp,superseded)
       VALUES ('CM-PA6',1,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2025-09-14','quality@example.com',$1,$2,5000,true),
              ('CM-PA6',2,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2026-01-20','quality@example.com',$1,$2,5000,false)`,
      [j(rules), j(factors)]
    );
    await entry({
      act: 'carbon_method_version_published', person: 'quality@example.com',
      object_kind: 'carbon_method', object_ref: 'CM-PA6 v2', event_at: '2026-01-20T09:00:00Z',
      content: { standard: 'ISO 14067', boundary: 'cradle-to-gate', reviewer: 'Ilse Grootveld' },
    });

    const breakdown1 = [
      { line: 'collection_and_transport', mg_per_kg: 310000, tag: 'primary' },
      { line: 'process_energy', mg_per_kg: 1850000, tag: 'primary' },
      { line: 'reagents', mg_per_kg: 1180000, tag: 'supplier_specific' },
      { line: 'water_and_effluent', mg_per_kg: 240000, tag: 'primary' },
      { line: 'waste_and_residues', mg_per_kg: 330000, tag: 'secondary' },
      { line: 'outbound_transport', mg_per_kg: 410000, tag: 'secondary' },
      { line: 'byproduct_credit', mg_per_kg: -60000, tag: 'primary' },
    ];
    const comparator = { material: 'virgin PA6', dataset: 'EcoBase 2025', dataset_year: 2025, region: 'EU-27', value_mg_per_kg: 7100000 };
    const energy1 = { energy_location_mg_per_kg: 1850000, energy_market_mg_per_kg: 620000, metered_kwh: 300000 };
    await ins(
      `INSERT INTO carbon_figure (id,lot,version,method_id,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,boundary,comparator,breakdown,energy,input_versions,computed_at)
       VALUES ('CFG-0001','LOT-N6-0001',1,'CM-PA6',2,4260000,1200,6500,'cradle-to-gate',$1,$2,$3,$4,'2026-03-18T12:00:00Z')`,
      [j(comparator), j(breakdown1), j(energy1),
       j({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1', recipe_versions: ['RCP-DISS-2', 'RCP-DEPO-4', 'RCP-PURI-1', 'RCP-REPO-3'], emission_factor_set: 'EcoBase 2025' })]
    );
    const breakdown3 = [
      { line: 'collection_and_transport', mg_per_kg: 350000, tag: 'primary' },
      { line: 'process_energy', mg_per_kg: 2010000, tag: 'primary' },
      { line: 'reagents', mg_per_kg: 1240000, tag: 'supplier_specific' },
      { line: 'water_and_effluent', mg_per_kg: 260000, tag: 'primary' },
      { line: 'waste_and_residues', mg_per_kg: 360000, tag: 'secondary' },
      { line: 'outbound_transport', mg_per_kg: 430000, tag: 'secondary' },
      { line: 'byproduct_credit', mg_per_kg: -40000, tag: 'primary' },
    ];
    await ins(
      `INSERT INTO carbon_figure (id,lot,version,method_id,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,boundary,comparator,breakdown,energy,input_versions,computed_at)
       VALUES ('CFG-0002','LOT-N6-0003',1,'CM-PA6',2,4610000,1400,6100,'cradle-to-gate',$1,$2,$3,$4,'2026-02-25T12:00:00Z')`,
      [j(comparator), j(breakdown3), j({ energy_location_mg_per_kg: 2010000, energy_market_mg_per_kg: 700000, metered_kwh: 40000 }),
       j({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-PILOT-1', emission_factor_set: 'EcoBase 2025' })]
    );
    await ins(
      `INSERT INTO carbon_figure (id,lot,version,method_id,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,boundary,comparator,breakdown,energy,input_versions,computed_at)
       VALUES ('CFG-0003','LOT-N6-0002',1,'CM-PA6',2,4380000,1300,6300,'cradle-to-gate',$1,$2,$3,$4,'2026-03-18T12:00:00Z')`,
      [j(comparator), j(breakdown1), j(energy1), j({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1' })]
    );

    await ins(
      `INSERT INTO energy_instrument (reference,quantity_kwh,vintage,region,state,applied_to)
       VALUES ('EAC-2026-0007',250000,2026,'EU-27','retired','BP-DEMO-N6-2026H1'),
              ('EAC-2025-0031',100000,2025,'EU-27','held',NULL)`
    );

    // ---- Specifications, customers, conformance ---------------------------
    const specRows = [
      { property: 'relative_viscosity', method: 'ISO 307', limit: '2.40', unit: 'ratio', basis: 'guaranteed' },
      { property: 'moisture', method: 'ISO 15512', limit: '0.10', unit: 'percent', basis: 'guaranteed' },
      { property: 'yellowness_index', method: 'ASTM E313', limit: '8.0', unit: 'index', basis: 'typical' },
      { property: 'ash_content', method: 'ISO 3451-1', limit: '0.30', unit: 'percent', basis: 'informational' },
    ];
    const virgin = { reference: 'virgin PA6 at relative viscosity 2.42', source: 'EcoBase 2025', dated: '2025-11-30' };
    await ins(
      `INSERT INTO specification (grade,version,issued_on,rows,virgin_reference,superseded)
       VALUES ('SPEC-N6',2,'2025-09-01',$1,$2,true),('SPEC-N6',3,'2026-02-01',$1,$2,false)`,
      [j(specRows), j(virgin)]
    );
    await ins(
      `INSERT INTO customer (reference,name,contact,holds_grade,holds_version,application,industry,language)
       VALUES ('CUS-HELIOS','Helios Yarns','helios@example.com','SPEC-N6',3,'technical apparel yarn','textiles','en'),
              ('CUS-VANTA','Vanta Safety Systems','vanta@example.com','SPEC-N6',2,'airbag fabric','automotive','fr')`
    );
    for (const [ref, name] of [['CUS-HELIOS', 'Helios Yarns'], ['CUS-VANTA', 'Vanta Safety Systems']]) {
      await ins('INSERT INTO party (reference,kind) VALUES ($1,$2)', [ref, 'customer']);
      await ins('INSERT INTO party_version (reference,name,effective_from) VALUES ($1,$2,$3)', [ref, name, '2026-01-01']);
    }
    await ins(
      `INSERT INTO conformance (reference,customer,application,specification_grade,specification_version,trials,outcome,dated)
       VALUES ('CNF-0001','CUS-HELIOS','technical apparel yarn','SPEC-N6',3,$1,'qualified','2026-02-20'),
              ('CNF-0002','CUS-VANTA','airbag fabric','SPEC-N6',2,$2,'qualified','2025-11-12')`,
      [j([{ trial: 'spinning trial', dated: '2026-02-10', outcome: 'passed' }]),
       j([{ trial: 'weave and deployment trial', dated: '2025-10-30', outcome: 'passed' }])]
    );
    await ins(
      `INSERT INTO specification_issue (reference,grade,version,customer,issued_by)
       VALUES ('SPI-0001','SPEC-N6',3,'CUS-HELIOS','quality@example.com'),
              ('SPI-0002','SPEC-N6',2,'CUS-VANTA','quality@example.com')`
    );
    await entry({
      act: 'specification_issued', person: 'quality@example.com', object_kind: 'specification',
      object_ref: 'SPEC-N6 v3', event_at: '2026-02-01T09:00:00Z',
      content: { customer: 'CUS-HELIOS', version: 3 },
    });

    // ---- Contracts --------------------------------------------------------
    await ins(
      `INSERT INTO contract (id,recipient,site,period,committed_kg,floor_bp,delivered_kg,shortfall_consequence)
       VALUES ('CON-HELIOS-1','CUS-HELIOS','SITE-DEMO','2026-H1',200,5000,0,'a replacement volume in the following quarter'),
              ('CON-VANTA-1','CUS-VANTA','SITE-COMM','2029-H1',1000,3000,0,'a make-good volume in the following period')`
    );

    // ---- Certificates -----------------------------------------------------
    const conditionsAtSigning = [
      ['lot_released', 'The lot was released.'],
      ['no_open_deviation', 'No deviation touching the lot was open.'],
      ['no_unreviewed_override', 'No override on the lot was unreviewed.'],
      ['period_closed', 'The bookkeeping position for the period was settled for this lot.'],
      ['balance_invariant_holds', 'Attached credit 150000 g against available credit.'],
      ['carbon_figure_complete', 'CM-PA6 v2, cradle-to-gate, 4610000 mg/kg, uncertainty 1400 bp.'],
      ['signer_holds_scope', 'Pavel Ostrowski held signing scope for SITE-PILOT.'],
      ['signer_did_not_enter_data', 'The signer entered none of this lot\'s data.'],
    ].map(([condition, detail]) => ({ condition, satisfied: true, blocking_reference: null, detail }));

    const carbonOnCert = {
      value_mg_per_kg: 4610000, boundary: 'cradle-to-gate', method_version: 'CM-PA6 v2',
      uncertainty_bp: 1400, comparator: comparator, primary_share_bp: 6100,
      energy_location_mg_per_kg: 2010000, energy_market_mg_per_kg: 700000,
    };
    const certTests = [
      { property: 'relative_viscosity', method: 'ISO 307', value: '2.41', unit: 'ratio', uncertainty_bp: 200 },
      { property: 'moisture', method: 'ISO 15512', value: '0.08', unit: 'percent', uncertainty_bp: 150 },
    ];

    const certs = [
      { number: 'CERT-PILOT-000001', recipient: 'CUS-HELIOS', recipientName: 'Helios Yarns', language: 'en',
        signedAt: '2026-03-02T11:00:00Z', issuedOn: '2026-03-02', state: 'withdrawn',
        withdrawnOn: '2026-04-18', reason: 'A collector category was corrected after acceptance' },
      { number: 'CERT-PILOT-000002', recipient: 'CUS-VANTA', recipientName: 'Vanta Safety Systems', language: 'fr',
        signedAt: '2026-03-20T11:00:00Z', issuedOn: '2026-03-20', state: 'issued' },
    ];
    for (const cert of certs) {
      const split = { post_consumer_bp: 7500, pre_consumer_bp: 0 };
      const st = statementsFor('mass_balance', 7500, split, cert.language);
      const doc = renderDocument({
        number: cert.number, version: 1, site: 'SITE-PILOT', grade: 'N6',
        lots: [{ reference: 'LOT-N6-0003', mass_g: 200000 }],
        claim_type: 'mass_balance', content_bp: 7500,
        category_split: { post_consumer_g: 150000, pre_consumer_g: 0 },
        period: 'BP-PILOT-N6-2026H1', carbon: carbonOnCert, primary_share_bp: 6100,
        scheme: SCHEME, registration: REGISTRATION, specification_version: 3,
        test_results: certTests, permitted_statement: st.permitted_statement,
        prohibited_statement: st.prohibited_statement, recipient_name: cert.recipientName,
        signer_name: 'Pavel Ostrowski', signed_at: cert.signedAt, issued_on: cert.issuedOn,
        verification_url: `${VERIFY_BASE}/${cert.number}`, provisional_factor: true,
        state: cert.state, withdrawal_reason: cert.reason || null, withdrawn_on: cert.withdrawnOn || null,
      });
      await ins(
        `INSERT INTO certificate (number,version,site,lots,grade,specification_version,claim_type,content_bp,category_split,period,carbon,primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,recipient,recipient_name,language,signer,signer_name,signed_at,issued_on,verification_url,state,provisional_factor,conditions,input_versions,document,withdrawal_reason,withdrawn_by,withdrawn_on,carbon_figure)
         VALUES ($1,1,'SITE-PILOT',$2,'N6',3,'mass_balance',7500,$3,'BP-PILOT-N6-2026H1',$4,6100,$5,$6,$7,$8,$9,$10,$11,$12,'signer2@example.com','Pavel Ostrowski',$13,$14,$15,$16,true,$17,$18,$19,$20,$21,$22,'CFG-0002')`,
        [cert.number, j([{ reference: 'LOT-N6-0003', mass_g: 200000 }]),
          j({ post_consumer_g: 150000, pre_consumer_g: 0, post_consumer_bp: 7500, pre_consumer_bp: 0 }),
          j(carbonOnCert), SCHEME, REGISTRATION, j(certTests), st.permitted_statement, st.prohibited_statement,
          cert.recipient, cert.recipientName, cert.language, cert.signedAt, cert.issuedOn,
          `${VERIFY_BASE}/${cert.number}`, cert.state, j(conditionsAtSigning),
          j({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-PILOT-1', specification: 'SPEC-N6 v3', carbon_figure: 'CFG-0002' }),
          doc, cert.reason || null, cert.reason ? 'signer2@example.com' : null, cert.withdrawnOn || null]
      );
      const signEntry = await entry({
        act: 'certificate_signed', person: 'signer2@example.com', site: 'SITE-PILOT',
        object_kind: 'certificate', object_ref: cert.number, event_at: cert.signedAt,
        content: { recipient: cert.recipient, claim_type: 'mass_balance', content_bp: 7500, conditions: conditionsAtSigning },
      });
      if (cert.number === 'CERT-PILOT-000001') {
        await ins(
          'INSERT INTO legal_hold (reference,seq,placed_by,placed_at,active) VALUES ($1,$2,$3,$4,true)',
          ['HLD-0001', signEntry.seq, 'quality@example.com', '2026-04-20T09:00:00Z']
        );
        await entry({
          act: 'legal_hold_placed', person: 'quality@example.com', object_kind: 'record_entry',
          object_ref: String(signEntry.seq), event_at: '2026-04-20T09:00:00Z',
          content: { hold: 'HLD-0001', seq: signEntry.seq },
        });
      }
      if (cert.state === 'withdrawn') {
        await entry({
          act: 'certificate_withdrawn', person: 'signer2@example.com', site: 'SITE-PILOT',
          object_kind: 'certificate', object_ref: cert.number, event_at: cert.withdrawnOn + 'T10:00:00Z',
          content: { reason: cert.reason, notified_recipients: [cert.recipientName] },
        });
        await ins(
          `INSERT INTO notification (reference,kind,recipient,recipient_name,subject,body,sent_at,about)
           VALUES ('NTF-SEED-1','certificate_withdrawn','helios@example.com','Helios Yarns',$1,$2,'2026-04-18T10:00:00Z','CERT-PILOT-000001')`,
          [`Certificate ${cert.number} withdrawn`,
            `Certificate ${cert.number} was withdrawn on 2026-04-18. Reason: ${cert.reason}.`]
        );
      }
    }
    await ins(
      `INSERT INTO certificate_sequence (site,last) VALUES ('SITE-PILOT',2),('SITE-DEMO',0),('SITE-COMM',0)`
    );

    // ---- Inbound records --------------------------------------------------
    const inbound = [
      ['INB-0001', 'weighbridge', '2026-02-20T06:14:00Z',
        { ticket: 'WB2-88431', device: 'WB-DEMO-02', batch: 'BATCH-1004', gross_g: 140000, tare_g: 20000, net_g: 120000, calibration: { calibrated_on: '2025-02-01', state: 'lapsed' } }],
      ['INB-0002', 'control_system', '2026-03-04T22:41:00Z',
        { run: 'RUN-D-0001', achieved: { temperature_c: 165, pressure_bar: 3 }, residence_min: 121, logged_by: 'DCS-1' }],
      ['INB-0003', 'laboratory', '2026-03-06T09:02:00Z',
        { subject: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ISO 307', value: '2.43', unit: 'ratio', instrument: 'VIS-2' }],
    ];
    for (const [ref, source, at, payload] of inbound) {
      const verbatim = JSON.stringify(payload);
      await ins(
        `INSERT INTO inbound_record (reference,source,received_at,payload_verbatim,payload) VALUES ($1,$2,$3,$4,$5)`,
        [ref, source, at, verbatim, verbatim]
      );
      await entry({
        act: 'inbound_record_received', object_kind: 'inbound_record', object_ref: ref, event_at: at,
        content: { source, payload_verbatim: verbatim },
      });
    }

    // ---- The public site --------------------------------------------------
    await ins(
      `INSERT INTO statistic (key,value,source,year,geography) VALUES
        ('textiles_recycled','Less than 1 per cent of textiles are recycled into new materials','Textile Flow Monitor',2024,'Global'),
        ('plastics_emissions','1.8 gigatonnes of carbon dioxide equivalent a year from plastics production','Global Materials Emissions Panel',2023,'Global'),
        ('textile_incineration','More than 8 per cent of textile waste is incinerated each year','Textile Flow Monitor',2024,'EU-27')`
    );
    await ins(
      `INSERT INTO position (reference,title,location,department,contract_type,closes_on)
       VALUES ('POS-0001','Process Engineer','Lyon, France','Operations','Permanent','2026-11-30')`
    );
    await ins(
      `INSERT INTO news_item (reference,title,tag,outlet,dated,link,language) VALUES
        ('NWS-0001','Series A closes at 40 million euros','funding','Materials Weekly','2026-01-22','https://example.com/news/series-a','en'),
        ('NWS-0002','Offtake agreement signed for demonstration output','partnership','Fibre Report','2026-03-11','https://example.com/news/offtake','en'),
        ('NWS-0003','Depolymerisation yield published','technical','Chimie Circulaire','2026-05-06','https://example.com/news/rendement','fr')`
    );
    await ins(
      `INSERT INTO claim_substantiation (reference,claim,route,first_published,evidence,evidence_expires,method_version,approver,review_date,state) VALUES
        ('CLS-0001','Low-carbon, virgin-quality recycled polymers','/product','2026-01-20','Carbon figure CFG-0001 computed under CM-PA6 v2 against comparator virgin PA6, EcoBase 2025, EU-27','2027-01-20','CM-PA6 v2','quality@example.com','2026-12-31','published'),
        ('CLS-0002','Low temperature and pressure process','/technology','2026-01-20','Recipe versions RCP-DISS-2 and RCP-REPO-3 with recorded set points and tolerances','2027-01-20','RCP-DISS-2','quality@example.com','2026-12-31','published'),
        ('CLS-0003','Green chemicals and reagents','/technology','2026-01-20','Reagent register with supplier declarations dated 2026','2026-09-30','CM-PA6 v2','quality@example.com','2026-12-31','published')`
    );

    await entry({
      act: 'seed_completed', person: 'system', object_kind: 'system', object_ref: 'seed',
      event_at: new Date().toISOString(), content: { note: 'The seeded record opens with one entry per seeded act.' },
    });

    // Counters start above the seeded references, so a new record never
    // collides with one the seed already took.
    const counters = {
      batch: 1005, weighing: 1005, consumption: 10, credit_movement: 20,
      run_dissolution: 3, run_depolymerisation: 1, run_purification: 1, run_repolymerisation: 1,
      output_dissolution: 3, output_depolymerisation: 1, output_purification: 2,
      lot_N6: 3, test_result: 5, deviation: 2, override: 1, finding: 1,
      approval_period: 3, legal_hold: 1, transfer: 1, carbon_figure: 3,
      specification_issue: 2, conformance: 2, certification_period: 2,
      restatement: 0, resolution: 0, export: 0, enquiry: 0, annotation: 0,
      allocation: 0, change_notice: 0, inbound_record: 3,
    };
    for (const [name, value] of Object.entries(counters)) {
      await ins(
        `INSERT INTO counter (name, value) VALUES ($1,$2)
         ON CONFLICT (name) DO UPDATE SET value = GREATEST(counter.value, $2)`,
        [name, value]
      );
    }
  });

  return { seeded: true };
}

// A certificate document is plain text, byte-stable for a version.
export function renderDocument(cert) {
  const L = [];
  const rule = '='.repeat(72);
  L.push(rule);
  L.push(`RAVEL RECYCLED CONTENT CERTIFICATE`);
  L.push(rule);
  L.push('');
  if (cert.state === 'withdrawn') {
    L.push('WITHDRAWN');
    L.push(`This certificate was withdrawn on ${cert.withdrawn_on}. Reason: ${cert.withdrawal_reason}.`);
    L.push('');
  }
  L.push(`Certificate number   ${cert.number}`);
  L.push(`Version              ${cert.version}`);
  L.push(`Issued on            ${cert.issued_on}`);
  L.push(`Site                 ${cert.site}`);
  L.push(`Grade                ${cert.grade}`);
  L.push(`Recipient            ${cert.recipient_name}`);
  L.push('');
  L.push('CLAIM');
  L.push('-'.repeat(72));
  L.push(`Claim type           ${cert.claim_type}`);
  L.push(`Recycled content     ${cert.content_bp} basis points (${bpText(cert.content_bp)})`);
  L.push(`Post-consumer        ${cert.category_split.post_consumer_g} g`);
  L.push(`Pre-consumer         ${cert.category_split.pre_consumer_g} g`);
  L.push(`Bookkeeping period   ${cert.period}`);
  if (cert.provisional_factor) {
    L.push('Conversion factor    provisional: this certificate rests on a provisional conversion factor.');
  }
  L.push('');
  L.push('LOTS');
  L.push('-'.repeat(72));
  for (const lot of cert.lots) L.push(`${lot.reference}   ${lot.mass_g} g`);
  L.push('');
  L.push('CARBON');
  L.push('-'.repeat(72));
  L.push(`Value                ${cert.carbon.value_mg_per_kg} mg CO2e per kg`);
  L.push(`Boundary             ${cert.carbon.boundary}`);
  L.push(`Method version       ${cert.carbon.method_version}`);
  L.push(`Uncertainty          ${cert.carbon.uncertainty_bp} basis points`);
  L.push(`Primary data share   ${cert.primary_share_bp} basis points`);
  L.push(`Energy, location     ${cert.carbon.energy_location_mg_per_kg} mg CO2e per kg`);
  L.push(`Energy, market       ${cert.carbon.energy_market_mg_per_kg} mg CO2e per kg`);
  if (cert.carbon.comparator) {
    const cmp = cert.carbon.comparator;
    L.push(`Comparator           ${cmp.material}, ${cmp.dataset}, ${cmp.dataset_year}, ${cmp.region}`);
    if (cmp.value_mg_per_kg) {
      const rel = cert.carbon.value_mg_per_kg < cmp.value_mg_per_kg ? 'lower than' : 'not lower than';
      L.push(`                     This figure is ${rel} ${cmp.material} (${cmp.dataset}, ${cmp.dataset_year}, ${cmp.region}).`);
    }
  }
  L.push('');
  L.push('TESTS');
  L.push('-'.repeat(72));
  for (const t of cert.test_results) {
    L.push(`${t.property}   ${t.value} ${t.unit}   ${t.method}   uncertainty ${t.uncertainty_bp} bp`);
  }
  L.push('');
  L.push('PERMITTED STATEMENT');
  L.push('-'.repeat(72));
  L.push(wrap(cert.permitted_statement));
  L.push('');
  L.push('PROHIBITED STATEMENT');
  L.push('-'.repeat(72));
  L.push(wrap(cert.prohibited_statement));
  L.push('');
  L.push('SCHEME');
  L.push('-'.repeat(72));
  L.push(`Scheme               ${cert.scheme}`);
  L.push(`Registration         ${cert.registration}`);
  L.push(`Specification        SPEC-${cert.grade} version ${cert.specification_version}`);
  L.push('');
  L.push('SIGNATURE');
  L.push('-'.repeat(72));
  L.push(`Signed by            ${cert.signer_name}`);
  L.push(`Signed at            ${cert.signed_at}`);
  L.push('');
  L.push(`Verify this certificate at ravel.example.com/verify/${cert.number}.`);
  L.push(rule);
  return L.join('\n') + '\n';
}

function bpText(bp) {
  const whole = Math.floor(Number(bp) / 100);
  const frac = Number(bp) % 100;
  return frac === 0 ? `${whole} per cent` : `${whole}.${String(frac).padStart(2, '0')} per cent`;
}

function wrap(text, width = 72) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}
