import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, tx } from './pool.js';
import { appendEntry } from '../lib/record.js';
import { dryMassG, creditG, contentBp } from '../engine/units.js';
import { renderDocument, statementsFor, VERIFY_BASE } from '../engine/certificate.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const PEOPLE = [
  ['PSN-0001', 'plant@example.com', 'Ines Bekele', ['plant_operator'], ['SITE-DEMO', 'SITE-PILOT']],
  ['PSN-0002', 'analyst@example.com', 'Tomas Vlach', ['lab_analyst'], ['SITE-DEMO', 'SITE-PILOT']],
  ['PSN-0003', 'quality@example.com', 'Marit Solheim', ['quality_manager'], ['SITE-DEMO', 'SITE-PILOT']],
  ['PSN-0004', 'claims@example.com', 'Osei Danquah', ['claims_manager'], ['SITE-DEMO', 'SITE-PILOT']],
  ['PSN-0005', 'signer@example.com', 'Hana Ferreira', ['certificate_signer'], ['SITE-DEMO', 'SITE-PILOT']],
  ['PSN-0006', 'signer2@example.com', 'Pavel Ostrowski', ['certificate_signer'], ['SITE-PILOT']],
  ['PSN-0007', 'auditor@example.com', 'Ruth Lindqvist', ['auditor'], ['SITE-DEMO', 'SITE-PILOT']]
];

export async function migrate() {
  const sql = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  await pool.query(sql);
  await pool.query(
    `INSERT INTO schema_migration (name) VALUES ('0001_initial') ON CONFLICT DO NOTHING`
  );
}

async function alreadySeeded() {
  const r = await pool.query("SELECT 1 FROM site WHERE reference = 'SITE-DEMO'");
  return r.rows.length > 0;
}

export async function seed() {
  if (await alreadySeeded()) return { seeded: false };

  await tx(async (client) => {
    const acts = [];
    const q = (sql, args) => client.query(sql, args);
    // Every seeded act becomes an entry, in the order the acts happened.
    const act = (a) => acts.push(a);

    // ------------------------------------------------------------- sites
    const BASIS = '8000 hours per year, 0.90 availability, 0.80 yield';
    for (const [ref, name, conf, nameplate, contracted, certState] of [
      ['SITE-PILOT', 'Pilot', 'commissioned', 40000, 24000, 'certified'],
      ['SITE-DEMO', 'Demonstration', 'commissioned', 400000, 320000, 'certified'],
      ['SITE-COMM', 'Commercial', 'planned', 25000000, 26000000, 'not_certified']
    ]) {
      await q(`INSERT INTO site (reference,name,confidence,nameplate_kg,contracted_kg,certification_state,capacity_basis,last_revised)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'2026-06-30')`,
        [ref, name, conf, nameplate, contracted, certState, BASIS]);
      await q('INSERT INTO certificate_sequence (site, last_number) VALUES ($1, 0)', [ref]);
    }
    await q(`INSERT INTO site_certification (reference,site,state,scheme,effective_from,recorded_by)
             VALUES ('SC-PILOT-1','SITE-PILOT','certified','RCS-2026','2026-01-01','quality@example.com'),
                    ('SC-DEMO-1','SITE-DEMO','certified','RCS-2026','2026-01-01','quality@example.com')`);

    // ------------------------------------------------------------ people
    for (const [id, email, name, roles, sites] of PEOPLE) {
      await q(`INSERT INTO person_directory (identifier,email,name,roles,sites,grant_ends_on)
               VALUES ($1,$2,$3,$4,$5,'2027-06-30')`,
        [id, email, name, JSON.stringify(roles), JSON.stringify(sites)]);
      act({ act: 'access_grant', person: email, object_kind: 'person', object_ref: id,
        content: { roles, sites, grant_ends_on: '2027-06-30' }, event_at: '2026-01-01T08:00:00Z', effective_on: '2026-01-01' });
    }

    // ------------------------------------------- parties and their names
    const parties = [
      ['COL-ALDER', 'collector', 'Alder Reclaim', 'WCR-PT-4471', '2026-01-01'],
      ['COL-BRINE', 'collector', 'Brine Textile Recovery', 'WCR-NL-2208', '2026-01-01'],
      ['COL-BRINE', 'collector', 'Brine Circular Materials', 'WCR-NL-2208', '2026-08-01'],
      ['COL-CINDER', 'collector', 'Cinder Industrial Offcuts', 'WCR-FR-6613', '2026-01-01'],
      ['CUS-HELIOS', 'converter', 'Helios Technical Textiles', 'VAT-PT-88120', '2026-01-01'],
      ['CUS-VANTA', 'converter', 'Vanta Safety Systems', 'VAT-DE-55031', '2026-01-01'],
      ['PRD-RAVEL', 'producer', 'Ravel Materials SAS', 'REG-RAVEL-0042', '2026-01-01']
    ];
    for (const [ref, kind, name, ident, from] of parties) {
      await q(`INSERT INTO party_version (reference,kind,name,identifier,effective_from) VALUES ($1,$2,$3,$4,$5)`,
        [ref, kind, name, ident, from]);
    }
    await q(`UPDATE party_version SET superseded_on = '2026-08-01'
             WHERE reference = 'COL-BRINE' AND effective_from = '2026-01-01'`);
    act({ act: 'party_version_recorded', person: 'quality@example.com', object_kind: 'party', object_ref: 'COL-BRINE',
      content: { name: 'Brine Circular Materials', effective_from: '2026-08-01', supersedes: 'Brine Textile Recovery' },
      event_at: '2026-08-01T09:00:00Z', effective_on: '2026-08-01' });

    // -------------------------------------------------------- collectors
    for (const [ref, country, reg, expiry, types, streams] of [
      ['COL-ALDER', 'PT', 'WCR-PT-4471', '2027-03-31', ['municipal_bring_bank', 'textile_bank'], ['post_consumer_apparel', 'carpet']],
      ['COL-BRINE', 'NL', 'WCR-NL-2208', '2027-01-31', ['sorting_facility'], ['post_consumer_apparel']],
      ['COL-CINDER', 'FR', 'WCR-FR-6613', '2026-12-31', ['converter_site'], ['pre_consumer_offcuts', 'coated_offcuts']]
    ]) {
      await q(`INSERT INTO collector (reference,country,registration,registration_expiry,collection_site_types,declared_streams,scheme_status)
               VALUES ($1,$2,$3,$4,$5,$6,'in_scheme')`,
        [ref, country, reg, expiry, JSON.stringify(types), JSON.stringify(streams)]);
    }

    for (const [ref, col, state, from, to, cond, closes] of [
      ['AP-ALDER-1', 'COL-ALDER', 'approved', '2026-01-01', '2026-12-31', null, null],
      ['AP-BRINE-1', 'COL-BRINE', 'approved', '2026-01-01', '2026-06-30', null, null],
      ['AP-CINDER-1', 'COL-CINDER', 'conditional', '2026-01-01', '2026-12-31',
        'Sampling plan for coated streams to be agreed', '2026-10-31']
    ]) {
      await q(`INSERT INTO approval_period (reference,collector,state,valid_from,valid_to,condition,condition_closes_on,recorded_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'quality@example.com')`, [ref, col, state, from, to, cond, closes]);
      act({ act: 'collector_approved', person: 'quality@example.com', object_kind: 'collector', object_ref: col,
        content: { approval_period: ref, state, valid_from: from, valid_to: to, condition: cond },
        event_at: `${from}T09:00:00Z`, effective_on: from });
    }

    // --------------------------------------------------- weighing devices
    for (const [ref, site, cal] of [
      ['WB-DEMO-01', 'SITE-DEMO', '2026-05-01'],
      ['WB-DEMO-02', 'SITE-DEMO', '2025-02-01']
    ]) {
      await q('INSERT INTO weighing_device (reference,site,calibrated_on) VALUES ($1,$2,$3)', [ref, site, cal]);
    }

    // ------------------------------------------------------------ recipes
    for (const [ref, type, ver, sp, tol] of [
      ['RCP-DISS-2', 'dissolution', 2, { temperature_c: 165, pressure_bar: 3 }, { temperature_c: [160, 170], pressure_bar: [2, 4] }],
      ['RCP-DEPO-4', 'depolymerisation', 4, { temperature_c: 240, pressure_bar: 6 }, { temperature_c: [230, 250], pressure_bar: [5, 7] }],
      ['RCP-PURI-1', 'purification', 1, { temperature_c: 90, pressure_bar: 1 }, { temperature_c: [85, 95], pressure_bar: [1, 2] }],
      ['RCP-REPO-3', 'repolymerisation', 3, { temperature_c: 255, pressure_bar: 8 }, { temperature_c: [250, 260], pressure_bar: [7, 9] }]
    ]) {
      await q(`INSERT INTO recipe_version (reference,run_type,version,set_points,tolerances,reagents,residence_minutes,released_by,released_on)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'quality@example.com','2026-01-05')`,
        [ref, type, ver, JSON.stringify(sp), JSON.stringify(tol),
          JSON.stringify([{ reagent: 'bio-solvent A', ratio_bp: 3000 }]), 180]);
    }

    // ------------------------------------------------------------ batches
    const batches = [
      { ref: 'BATCH-1001', col: 'COL-ALDER', cat: 'post_consumer', on: '2026-02-10', net: 500000, moist: 1000, dev: 'WB-DEMO-01',
        comp: { polymer: 'PA6', fraction_bp: 9200, basis: 'sampled', measured_fraction_bp: 9200 },
        cont: { non_nylon_bp: 500, elastane_bp: 400, coatings: 'none', colour_load: 'mixed', foreign_matter: 'trace' }, custody: 'full' },
      { ref: 'BATCH-1002', col: 'COL-ALDER', cat: 'pre_consumer', on: '2026-02-12', net: 300000, moist: 0, dev: 'WB-DEMO-01',
        comp: { polymer: 'PA6', fraction_bp: 9800, basis: 'sampled', measured_fraction_bp: 9800 },
        cont: { non_nylon_bp: 100, elastane_bp: 0, coatings: 'none', colour_load: 'natural', foreign_matter: 'none' }, custody: 'full' },
      { ref: 'BATCH-1003', col: 'COL-BRINE', cat: 'post_consumer', on: '2026-07-05', net: 200000, moist: 500, dev: 'WB-DEMO-01',
        comp: { polymer: 'PA6', fraction_bp: 8900, basis: 'sampled', measured_fraction_bp: 8900 },
        cont: { non_nylon_bp: 900, elastane_bp: 300, coatings: 'light', colour_load: 'mixed', foreign_matter: 'trace' }, custody: 'full' },
      { ref: 'BATCH-1004', col: 'COL-CINDER', cat: 'pre_consumer', on: '2026-02-20', net: 120000, moist: 0, dev: 'WB-DEMO-02',
        comp: { polymer: 'PA6', fraction_bp: 9900, basis: 'declared', measured_fraction_bp: 9100 },
        cont: { non_nylon_bp: 800, elastane_bp: 0, coatings: 'coated', colour_load: 'natural', foreign_matter: 'none' }, custody: 'full' },
      { ref: 'BATCH-1005', col: 'COL-ALDER', cat: 'post_consumer', on: '2026-03-02', net: 100000, moist: 0, dev: 'WB-DEMO-01',
        comp: { polymer: 'PA6', fraction_bp: 9100, basis: 'declared', measured_fraction_bp: null },
        cont: { non_nylon_bp: 600, elastane_bp: 200, coatings: 'none', colour_load: 'mixed', foreign_matter: 'trace' },
        custody: 'missing_transport' }
    ];

    const CUSTODY_KINDS = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
    for (const b of batches) {
      const gross = b.net + 15000;
      await q(`INSERT INTO batch (reference,collector,site,grade,category,gross_g,tare_g,net_g,moisture_bp,moisture_method,
                 device,received_on,composition,contamination,accepted_g,event_at,effective_on,recorded_by)
               VALUES ($1,$2,'SITE-DEMO','N6',$3,$4,15000,$5,$6,'ISO 15512',$7,$8,$9,$10,$5,$11,$8,'plant@example.com')`,
        [b.ref, b.col, b.cat, gross, b.net, b.moist, b.dev, b.on,
          JSON.stringify(b.comp), JSON.stringify(b.cont), `${b.on}T07:30:00Z`]);

      await q(`INSERT INTO weighing (reference,batch,device,gross_g,tare_g,net_g,calibrated_on,calibration_state,weighed_at)
               SELECT $1,$2,$3,$4,15000,$5,d.calibrated_on,
                      CASE WHEN d.calibrated_on > ($6::date - interval '12 months') THEN 'valid' ELSE 'lapsed' END,
                      $7 FROM weighing_device d WHERE d.reference = $3`,
        [`WGH-${b.ref.slice(6)}`, b.ref, b.dev, gross, b.net, b.on, `${b.on}T07:15:00Z`]);

      const kinds = b.custody === 'missing_transport'
        ? CUSTODY_KINDS.filter((k) => k !== 'transport') : CUSTODY_KINDS;
      let ord = 0;
      for (const k of kinds) {
        await q(`INSERT INTO custody_link (batch,kind,party,link_date,ordinal) VALUES ($1,$2,$3,$4,$5)`,
          [b.ref, k, k === 'transport' ? 'Meridian Haulage' : (k === 'collector' ? b.col : 'Ravel Materials SAS'), b.on, ord++]);
      }

      const dry = dryMassG(b.net, b.moist);
      act({ act: 'batch_booked_in', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'batch', object_ref: b.ref,
        content: { collector: b.col, category: b.cat, net_g: b.net, moisture_bp: b.moist, dry_mass_g: dry, device: b.dev },
        event_at: `${b.on}T07:30:00Z`, effective_on: b.on });
      act({ act: 'weighing_recorded', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'batch', object_ref: b.ref,
        content: { device: b.dev, net_g: b.net, calibration_state: b.dev === 'WB-DEMO-02' ? 'lapsed' : 'valid' },
        event_at: `${b.on}T07:15:00Z`, effective_on: b.on });
    }

    // A measured composition departing from the declaration by more than 500
    // basis points stands as a finding against the collector, not the plant.
    await q(`INSERT INTO finding (reference,collector,batch,kind,detail,departure_bp,raised_on,due_on,state)
             VALUES ('FND-0001','COL-CINDER','BATCH-1004','declaration_departure',
               'Declared PA6 fraction 9900 bp, measured 9100 bp on BATCH-1004: a departure of 800 basis points beyond the 500 basis point tolerance.',
               800,'2026-02-22','2026-05-22','open')`);
    act({ act: 'finding_raised', person: 'quality@example.com', object_kind: 'collector', object_ref: 'COL-CINDER',
      content: { finding: 'FND-0001', batch: 'BATCH-1004', departure_bp: 800 },
      event_at: '2026-02-22T10:00:00Z', effective_on: '2026-02-22' });

    // ------------------------------------------------ runs and their rows
    const runs = [
      ['RUN-D-0001', 'dissolution', 'RCP-DISS-2', '2026-03-04', { temperature_c: 165, pressure_bar: 3 }],
      ['RUN-D-0002', 'dissolution', 'RCP-DISS-2', '2026-03-05', { temperature_c: 172, pressure_bar: 3 }],
      ['RUN-D-0003', 'dissolution', 'RCP-DISS-2', '2026-03-06', { temperature_c: 166, pressure_bar: 3 }],
      ['RUN-Y-0001', 'depolymerisation', 'RCP-DEPO-4', '2026-03-08', { temperature_c: 240, pressure_bar: 6 }],
      ['RUN-U-0001', 'purification', 'RCP-PURI-1', '2026-03-10', { temperature_c: 90, pressure_bar: 1 }],
      ['RUN-R-0001', 'repolymerisation', 'RCP-REPO-3', '2026-03-12', { temperature_c: 255, pressure_bar: 8 }]
    ];
    // A run is opened, consumes, produces and is then closed, in that order.
    // The immutability trigger refuses any other sequence, which is the point.
    for (const [ref, type, recipe, day, actual] of runs) {
      await q(`INSERT INTO run (reference,run_type,site,equipment,recipe_version,operator,started_at,state,
                 actual_set_points,event_at,effective_on,recorded_by)
               VALUES ($1,$2,'SITE-DEMO',$3,$4,'Ines Bekele',$5,'open',$6,$5,$7,'plant@example.com')`,
        [ref, type, `EQ-${type.slice(0, 4).toUpperCase()}-01`, recipe, `${day}T06:00:00Z`,
          JSON.stringify(actual), day]);
      act({ act: 'run_started', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'run', object_ref: ref,
        content: { run_type: type, recipe_version: recipe }, event_at: `${day}T06:00:00Z`, effective_on: day });
    }

    const consumptions = [
      ['CSP-0001', 'RUN-D-0001', 'batch', 'BATCH-1001', 300000, '2026-03-04'],
      ['CSP-0002', 'RUN-D-0001', 'batch', 'BATCH-1002', 300000, '2026-03-04'],
      ['CSP-0003', 'RUN-D-0002', 'batch', 'BATCH-1003', 190000, '2026-03-05'],
      ['CSP-0004', 'RUN-D-0002', 'batch', 'BATCH-1004', 120000, '2026-03-05'],
      ['CSP-0005', 'RUN-D-0003', 'batch', 'BATCH-1001', 150000, '2026-03-06'],
      ['CSP-0006', 'RUN-Y-0001', 'output', 'OUT-D-0001', 480000, '2026-03-08'],
      ['CSP-0007', 'RUN-Y-0001', 'output', 'OUT-D-0002', 250000, '2026-03-08'],
      ['CSP-0008', 'RUN-Y-0001', 'output', 'OUT-D-0003', 120000, '2026-03-08'],
      ['CSP-0009', 'RUN-U-0001', 'output', 'OUT-Y-0001', 800000, '2026-03-10'],
      ['CSP-0010', 'RUN-R-0001', 'output', 'OUT-U-0001', 720000, '2026-03-12']
    ];
    const outputs = [
      ['OUT-D-0001', 'RUN-D-0001', 'intermediate', 480000, null, '2026-03-04'],
      ['OUT-D-0002', 'RUN-D-0002', 'intermediate', 250000, null, '2026-03-05'],
      ['OUT-D-0003', 'RUN-D-0003', 'intermediate', 120000, null, '2026-03-06'],
      ['OUT-Y-0001', 'RUN-Y-0001', 'intermediate', 800000, null, '2026-03-08'],
      ['OUT-U-0001', 'RUN-U-0001', 'intermediate', 720000, null, '2026-03-10'],
      ['OUT-U-0002', 'RUN-U-0001', 'byproduct', 40000, 'sold', '2026-03-10'],
      ['LOT-N6-0001', 'RUN-R-0001', 'lot', 400000, null, '2026-03-12'],
      ['LOT-N6-0002', 'RUN-R-0001', 'lot', 300000, null, '2026-03-12']
    ];
    for (const [ref, run, kind, mass, disp, day] of outputs) {
      await q(`INSERT INTO output (reference,run,kind,mass_g,disposition,allocation_basis,event_at,effective_on,recorded_by)
               VALUES ($1,$2,$3,$4,$5,'mass',$6,$7,'plant@example.com')`,
        [ref, run, kind, mass, disp, `${day}T17:00:00Z`, day]);
      act({ act: 'output_recorded', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'output', object_ref: ref,
        content: { run, kind, mass_g: mass, disposition: disp }, event_at: `${day}T17:00:00Z`, effective_on: day });
    }
    for (const [ref, run, kind, inputRef, mass, day] of consumptions) {
      await q(`INSERT INTO consumption (reference,run,input_kind,input_ref,mass_g,event_at,effective_on,recorded_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'plant@example.com')`,
        [ref, run, kind, inputRef, mass, `${day}T08:00:00Z`, day]);
      act({ act: 'consumption_recorded', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'consumption', object_ref: ref,
        content: { run, input: inputRef, mass_g: mass }, event_at: `${day}T08:00:00Z`, effective_on: day });
    }

    // Losses are computed as mass in minus mass out, never accepted from a caller.
    for (const [ref, , , day] of runs.map((r) => [r[0], r[1], r[2], r[3]])) {
      const inG = consumptions.filter((c) => c[1] === ref).reduce((s, c) => s + c[4], 0);
      const outG = outputs.filter((o) => o[1] === ref).reduce((s, o) => s + o[3], 0);
      await q(`UPDATE run SET state = 'closed', closed_at = $1, losses_g = $2 WHERE reference = $3`,
        [`${day}T18:00:00Z`, inG - outG, ref]);
      act({ act: 'run_closed', person: 'plant@example.com', site: 'SITE-DEMO', object_kind: 'run', object_ref: ref,
        content: { mass_in_g: inG, mass_out_g: outG, losses_g: inG - outG }, event_at: `${day}T18:00:00Z`, effective_on: day });
    }

    // --------------------------------------------------------------- lots
    for (const [ref, grade, site, mass, disp, outRef, period] of [
      ['LOT-N6-0001', 'N6', 'SITE-DEMO', 400000, 'released', 'LOT-N6-0001', 'BP-DEMO-N6-2026H1'],
      ['LOT-N6-0002', 'N6', 'SITE-DEMO', 300000, 'quarantined', 'LOT-N6-0002', 'BP-DEMO-N6-2026H1'],
      ['LOT-N6-0003', 'N6', 'SITE-PILOT', 200000, 'released', null, 'BP-PILOT-N6-2026H1']
    ]) {
      await q(`INSERT INTO lot (reference,output_ref,grade,site,mass_g,disposition,claim_type,specification_version,
                 balance_period,event_at,effective_on,recorded_by)
               VALUES ($1,$2,$3,$4,$5,$6,'mass_balance',3,$7,'2026-03-12T18:30:00Z','2026-03-12','plant@example.com')`,
        [ref, outRef, grade, site, mass, disp, period]);
      act({ act: 'lot_dispositioned', person: 'quality@example.com', site, object_kind: 'lot', object_ref: ref,
        content: { disposition: disp }, event_at: '2026-03-16T11:00:00Z', effective_on: '2026-03-16' });
      await q(`INSERT INTO disposition_act (lot,disposition,decided_by,decided_at,reason)
               VALUES ($1,$2,'quality@example.com','2026-03-16T11:00:00Z','Seeded disposition')`, [ref, disp]);
    }

    // ------------------------------------------------------ test results
    await q(`INSERT INTO test_result (reference,subject_kind,subject_ref,property,method,instrument,analyst,value,unit,
               uncertainty_bp,entered_by,event_at,effective_on)
             VALUES
              ('TST-0001','lot','LOT-N6-0001','relative_viscosity','ISO 307','VISC-02','Tomas Vlach','2.43','ratio',150,'analyst@example.com','2026-03-14T09:00:00Z','2026-03-14'),
              ('TST-0002','lot','LOT-N6-0001','moisture','ISO 15512','KF-01','Tomas Vlach','0.04','percent',200,'analyst@example.com','2026-03-14T09:20:00Z','2026-03-14'),
              ('TST-0003','lot','LOT-N6-0003','relative_viscosity','ISO 307','VISC-02','Tomas Vlach','2.41','ratio',150,'analyst@example.com','2026-02-26T09:00:00Z','2026-02-26'),
              ('TST-0004','lot','LOT-N6-0002','relative_viscosity','ISO 307','VISC-02','Tomas Vlach','2.28','ratio',150,'analyst@example.com','2026-03-14T10:00:00Z','2026-03-14')`);
    for (const t of ['TST-0001', 'TST-0002', 'TST-0003', 'TST-0004']) {
      act({ act: 'test_result_entered', person: 'analyst@example.com', object_kind: 'test_result', object_ref: t,
        content: { entered_by: 'analyst@example.com' }, event_at: '2026-03-14T09:00:00Z', effective_on: '2026-03-14' });
    }

    // ------------------------------------------- deviations and overrides
    await q(`INSERT INTO deviation (reference,state,title,detail,runs,lots,outcome,raised_by,event_at,effective_on,closed_at,closed_by)
             VALUES
              ('DEV-0001','open','Purification residence time short of recipe',
               'RUN-U-0001 held residence for 150 minutes against a recipe residence of 180 minutes. LOT-N6-0002 is held pending resolution.',
               '["RUN-U-0001"]','["LOT-N6-0002"]',NULL,'quality@example.com','2026-03-11T08:00:00Z','2026-03-11',NULL,NULL),
              ('DEV-0002','closed','Dissolution temperature above recipe tolerance',
               'RUN-D-0002 recorded 172 C against a recipe tolerance of 160 to 170 C.',
               '["RUN-D-0002"]','[]','cause_not_established','quality@example.com','2026-03-05T19:00:00Z','2026-03-05','2026-03-20T14:00:00Z','quality@example.com')`);
    act({ act: 'deviation_raised', person: 'quality@example.com', object_kind: 'deviation', object_ref: 'DEV-0002',
      content: { runs: ['RUN-D-0002'] }, event_at: '2026-03-05T19:00:00Z', effective_on: '2026-03-05' });
    act({ act: 'deviation_closed', person: 'quality@example.com', object_kind: 'deviation', object_ref: 'DEV-0002',
      content: { outcome: 'cause_not_established' }, event_at: '2026-03-20T14:00:00Z', effective_on: '2026-03-20' });
    act({ act: 'deviation_raised', person: 'quality@example.com', object_kind: 'deviation', object_ref: 'DEV-0001',
      content: { runs: ['RUN-U-0001'], lots: ['LOT-N6-0002'] }, event_at: '2026-03-11T08:00:00Z', effective_on: '2026-03-11' });

    await q(`INSERT INTO separation_override (reference,separation,reason,lot,authorised_by,reviewed,recorded_by,event_at,effective_on)
             VALUES ('OVR-0001','analyst_not_dispositioner',
               'Night shift analyst dispositioned the lot because no second qualified person was on site',
               'LOT-N6-0001','quality@example.com',false,'quality@example.com','2026-03-18T02:15:00Z','2026-03-18')`);
    act({ act: 'override_recorded', person: 'quality@example.com', object_kind: 'override', object_ref: 'OVR-0001',
      content: { separation: 'analyst_not_dispositioner', lot: 'LOT-N6-0001', authorised_by: 'quality@example.com' },
      event_at: '2026-03-18T02:15:00Z', effective_on: '2026-03-18' });

    // ------------------------------------------------- conversion factors
    await q(`INSERT INTO conversion_factor (reference,site,version,factor_bp,derived_from,derived_to,derived_in_g,derived_out_g,provisional,published_by,published_on)
             VALUES
              ('CF-DEMO-1','SITE-DEMO',1,8000,'2026-01-01','2026-03-31',1000000,800000,false,'claims@example.com','2026-01-05'),
              ('CF-PILOT-1','SITE-PILOT',1,7500,NULL,NULL,0,0,true,'claims@example.com','2026-01-05')`);
    for (const f of ['CF-DEMO-1', 'CF-PILOT-1']) {
      act({ act: 'conversion_factor_published', person: 'claims@example.com', object_kind: 'conversion_factor', object_ref: f,
        content: { provisional: f === 'CF-PILOT-1' }, event_at: '2026-01-05T10:00:00Z', effective_on: '2026-01-05' });
    }

    // ----------------------------------------------------- balance periods
    await q(`INSERT INTO balance_period (id,site,grade,period_from,period_to,state,carry_over_limit_bp,allocation_basis,closed_on,closed_by,cut_off,metered_kwh)
             VALUES
              ('BP-DEMO-N6-2025H2','SITE-DEMO','N6','2025-07-01','2025-12-31','closed',2000,'mass','2026-01-15','claims@example.com','2026-01-10',0),
              ('BP-DEMO-N6-2026H1','SITE-DEMO','N6','2026-01-01','2026-06-30','open',2000,'mass',NULL,NULL,NULL,300000),
              ('BP-PILOT-N6-2026H1','SITE-PILOT','N6','2026-01-01','2026-06-30','open',2000,'mass',NULL,NULL,NULL,60000)`);
    act({ act: 'period_closed', person: 'claims@example.com', site: 'SITE-DEMO', object_kind: 'balance_period',
      object_ref: 'BP-DEMO-N6-2025H2', content: { closed_on: '2026-01-15', cut_off: '2026-01-10' },
      event_at: '2026-01-15T16:00:00Z', effective_on: '2026-01-15' });

    // Credits enter when a claimable batch is consumed: dry mass times the
    // site's conversion factor, floored. A non-claimable batch grants nothing.
    let mv = 0;
    const nextMv = () => `CM-${String(++mv).padStart(4, '0')}`;
    const creditRows = [
      ['CSP-0001', 'BATCH-1001', 'post_consumer', 300000, true, '2026-03-04'],
      ['CSP-0002', 'BATCH-1002', 'pre_consumer', 300000, true, '2026-03-04'],
      ['CSP-0003', 'BATCH-1003', 'post_consumer', 190000, false, '2026-03-05'],
      ['CSP-0004', 'BATCH-1004', 'pre_consumer', 120000, true, '2026-03-05'],
      ['CSP-0005', 'BATCH-1001', 'post_consumer', 150000, true, '2026-03-06']
    ];
    for (const [csp, batch, cat, mass, claimable, day] of creditRows) {
      const credit = claimable ? creditG(mass, 8000) : 0;
      if (credit === 0) continue;
      const ref = nextMv();
      await q(`INSERT INTO credit_movement (reference,balance_period,direction,category,mass_g,movement,source_kind,source_ref,
                 factor_ref,fresh_credit,derivation,event_at,effective_on,recorded_by)
               VALUES ($1,'BP-DEMO-N6-2026H1','in',$2,$3,'consumption','consumption',$4,'CF-DEMO-1',true,$5,$6,$7,'plant@example.com')`,
        [ref, cat, credit, csp,
          JSON.stringify({ batch, dry_mass_consumed_g: mass, factor_bp: 8000,
            formula: `dry_mass_consumed_g ${mass} * factor_bp 8000 / 10000, floored = ${credit}` }),
          `${day}T08:00:00Z`, day]);
    }

    // The pilot period, which is where LOT-N6-0003 drew its claim from.
    await q(`INSERT INTO credit_movement (reference,balance_period,direction,category,mass_g,movement,source_kind,source_ref,
               factor_ref,fresh_credit,derivation,event_at,effective_on,recorded_by)
             VALUES ($1,'BP-PILOT-N6-2026H1','in','post_consumer',250000,'consumption','consumption','CSP-P-0001','CF-PILOT-1',true,$2,'2026-02-18T08:00:00Z','2026-02-18','plant@example.com')`,
      [nextMv(), JSON.stringify({ dry_mass_consumed_g: 333333, factor_bp: 7500, note: 'provisional factor' })]);
    await q(`INSERT INTO credit_movement (reference,balance_period,direction,category,mass_g,movement,lot,source_kind,source_ref,
               fresh_credit,derivation,event_at,effective_on,recorded_by)
             VALUES ($1,'BP-PILOT-N6-2026H1','out','post_consumer',150000,'allocation','LOT-N6-0003','lot','LOT-N6-0003',true,$2,'2026-02-25T10:00:00Z','2026-02-25','claims@example.com')`,
      [nextMv(), JSON.stringify({ lot_mass_g: 200000, content_bp: contentBp(150000, 200000) })]);

    // TRF-0001: material moved between sites during commissioning. It is never
    // a fresh credit and the total across the two periods is unchanged.
    await q(`INSERT INTO transfer (reference,from_period,to_period,category,mass_g,moved_on,recorded_by)
             VALUES ('TRF-0001','BP-PILOT-N6-2026H1','BP-DEMO-N6-2026H1','post_consumer',50000,'2026-05-12','claims@example.com')`);
    await q(`INSERT INTO credit_movement (reference,balance_period,direction,category,mass_g,movement,source_kind,source_ref,
               origin_site,fresh_credit,derivation,event_at,effective_on,recorded_by)
             VALUES ($1,'BP-PILOT-N6-2026H1','out','post_consumer',50000,'transfer_out','transfer','TRF-0001','SITE-PILOT',false,$2,'2026-05-12T09:00:00Z','2026-05-12','claims@example.com')`,
      [nextMv(), JSON.stringify({ transfer: 'TRF-0001', to: 'BP-DEMO-N6-2026H1' })]);
    await q(`INSERT INTO credit_movement (reference,balance_period,direction,category,mass_g,movement,source_kind,source_ref,
               origin_site,fresh_credit,derivation,event_at,effective_on,recorded_by)
             VALUES ($1,'BP-DEMO-N6-2026H1','in','post_consumer',50000,'transfer_in','transfer','TRF-0001','SITE-PILOT',false,$2,'2026-05-12T09:00:00Z','2026-05-12','claims@example.com')`,
      [nextMv(), JSON.stringify({ transfer: 'TRF-0001', from: 'BP-PILOT-N6-2026H1', fresh_credit: false })]);
    act({ act: 'transfer_recorded', person: 'claims@example.com', object_kind: 'transfer', object_ref: 'TRF-0001',
      content: { from: 'BP-PILOT-N6-2026H1', to: 'BP-DEMO-N6-2026H1', mass_g: 50000, fresh_credit: false },
      event_at: '2026-05-12T09:00:00Z', effective_on: '2026-05-12' });

    // ------------------------------------------------------------- carbon
    await q(`INSERT INTO carbon_method (id,name,standard,functional_unit,primary_threshold_bp)
             VALUES ('CM-PA6','PA6 product carbon footprint','ISO 14067','1 kg of pellet',5000)`);
    const factors = [
      { factor: 'grid electricity, EU-27', source: 'EcoBase 2025', year: 2025, value_g_per_kwh: 231 },
      { factor: 'process steam', source: 'EcoBase 2025', year: 2025, value_g_per_kwh: 198 },
      { factor: 'bio-solvent A', source: 'Supplier declaration', year: 2026, value_g_per_kg: 1420 },
      { factor: 'road freight, 40 t', source: 'EcoBase 2025', year: 2025, value_g_per_tkm: 92 }
    ];
    await q(`INSERT INTO carbon_method_version (method,version,boundary,allocation_basis,reviewer,published_on,published_by,data_quality_rules,emission_factors,superseded_by)
             VALUES ('CM-PA6',1,'cradle-to-gate','mass','Ilse Grootveld','2025-09-14','quality@example.com',$1,$2,2)`,
      [JSON.stringify(['Primary data for every process step inside the gate',
        'Secondary data permitted for outbound transport only']), JSON.stringify(factors.slice(0, 3))]);
    await q(`INSERT INTO carbon_method_version (method,version,boundary,allocation_basis,reviewer,published_on,published_by,data_quality_rules,emission_factors)
             VALUES ('CM-PA6',2,'cradle-to-gate','mass','Ilse Grootveld','2026-01-20','quality@example.com',$1,$2)`,
      [JSON.stringify([
        'Primary data for every process step inside the gate',
        'Supplier-specific factors for reagents where the supplier publishes one',
        'Secondary data permitted for outbound transport and residues',
        'A figure below 5000 basis points of primary data is reported as default-led'
      ]), JSON.stringify(factors)]);
    act({ act: 'method_version_published', person: 'quality@example.com', object_kind: 'carbon_method', object_ref: 'CM-PA6',
      content: { version: 2, supersedes: 1, reviewer: 'Ilse Grootveld' }, event_at: '2026-01-20T12:00:00Z', effective_on: '2026-01-20' });

    const breakdown = [
      { line: 'collection_and_transport', mg_per_kg: 310000, tag: 'primary' },
      { line: 'process_energy', mg_per_kg: 1850000, tag: 'primary' },
      { line: 'reagents', mg_per_kg: 1180000, tag: 'supplier_specific' },
      { line: 'water_and_effluent', mg_per_kg: 240000, tag: 'primary' },
      { line: 'waste_and_residues', mg_per_kg: 330000, tag: 'secondary' },
      { line: 'outbound_transport', mg_per_kg: 410000, tag: 'secondary' },
      { line: 'byproduct_credit', mg_per_kg: -60000, tag: 'primary' }
    ];
    const comparator = { material: 'virgin PA6', dataset: 'EcoBase 2025', dataset_year: 2025, region: 'EU-27', value_mg_per_kg: 5850000 };
    const inputVersions = {
      carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1 v1', specification: 'SPEC-N6 v3',
      recipe_versions: ['RCP-DISS-2', 'RCP-DEPO-4', 'RCP-PURI-1', 'RCP-REPO-3'],
      emission_factor_set: 'EcoBase 2025'
    };
    await q(`INSERT INTO carbon_figure (id,lot,version,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,
               boundary,comparator,breakdown,energy_location_mg_per_kg,energy_market_mg_per_kg,input_versions,computed_by)
             VALUES ('CF-LOT-0001','LOT-N6-0001',1,'CM-PA6',2,4260000,1200,6500,'cradle-to-gate',$1,$2,1850000,620000,$3,'claims@example.com')`,
      [JSON.stringify(comparator), JSON.stringify(breakdown), JSON.stringify(inputVersions)]);

    const pilotBreakdown = [
      { line: 'collection_and_transport', mg_per_kg: 335000, tag: 'primary' },
      { line: 'process_energy', mg_per_kg: 2010000, tag: 'primary' },
      { line: 'reagents', mg_per_kg: 1240000, tag: 'supplier_specific' },
      { line: 'water_and_effluent', mg_per_kg: 265000, tag: 'primary' },
      { line: 'waste_and_residues', mg_per_kg: 360000, tag: 'secondary' },
      { line: 'outbound_transport', mg_per_kg: 430000, tag: 'secondary' }
    ];
    await q(`INSERT INTO carbon_figure (id,lot,version,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,
               boundary,comparator,breakdown,energy_location_mg_per_kg,energy_market_mg_per_kg,input_versions,computed_by)
             VALUES ('CF-LOT-0003','LOT-N6-0003',1,'CM-PA6',2,4640000,1800,4200,'cradle-to-gate',$1,$2,2010000,780000,$3,'claims@example.com')`,
      [JSON.stringify(comparator), JSON.stringify(pilotBreakdown),
        JSON.stringify({ ...inputVersions, conversion_factor: 'CF-PILOT-1 v1 (provisional)' })]);
    await q(`INSERT INTO carbon_figure (id,lot,version,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,
               boundary,comparator,breakdown,energy_location_mg_per_kg,energy_market_mg_per_kg,input_versions,computed_by)
             VALUES ('CF-LOT-0002','LOT-N6-0002',1,'CM-PA6',2,4310000,1300,6300,'cradle-to-gate',$1,$2,1880000,640000,$3,'claims@example.com')`,
      [JSON.stringify(comparator), JSON.stringify(breakdown), JSON.stringify(inputVersions)]);
    act({ act: 'figure_computed', person: 'claims@example.com', object_kind: 'carbon_figure', object_ref: 'CF-LOT-0001',
      content: { lot: 'LOT-N6-0001', value_mg_per_kg: 4260000, method_version: 'CM-PA6 v2' },
      event_at: '2026-03-20T09:00:00Z', effective_on: '2026-03-20' });

    await q(`INSERT INTO energy_instrument (reference,quantity_kwh,vintage,region,state,applied_to,applied_at)
             VALUES ('EAC-2026-0007',250000,2026,'EU-27','retired','BP-DEMO-N6-2026H1','2026-04-02T10:00:00Z'),
                    ('EAC-2025-0031',100000,2025,'EU-27','held',NULL,NULL)`);

    // -------------------------------------- specifications and customers
    const specProps = [
      { property: 'relative_viscosity', method: 'ISO 307', limit: '2.40', unit: 'ratio', basis: 'guaranteed' },
      { property: 'moisture', method: 'ISO 15512', limit: '0.10', unit: 'percent', basis: 'guaranteed' },
      { property: 'yellowness_index', method: 'ASTM E313', limit: '8.0', unit: 'index', basis: 'typical' },
      { property: 'ash_content', method: 'ISO 3451-1', limit: '0.30', unit: 'percent', basis: 'informational' }
    ];
    const virginRef = {
      reference: 'virgin PA6 at relative viscosity 2.42', source: 'EcoBase 2025', date: '2025-11-30'
    };
    await q(`INSERT INTO specification (grade,version,issued_on,properties,virgin_reference,superseded_by)
             VALUES ('SPEC-N6',2,'2025-08-01',$1,$2,3)`,
      [JSON.stringify(specProps.slice(0, 3)), JSON.stringify(virginRef)]);
    await q(`INSERT INTO specification (grade,version,issued_on,properties,virgin_reference)
             VALUES ('SPEC-N6',3,'2026-02-01',$1,$2)`,
      [JSON.stringify(specProps), JSON.stringify(virginRef)]);

    await q(`INSERT INTO customer (reference,contact,application,industry,language,holds_specification_version)
             VALUES ('CUS-HELIOS','helios@example.com','technical apparel yarn','textiles','en',3),
                    ('CUS-VANTA','vanta@example.com','airbag fabric','automotive','en',2)`);
    await q(`INSERT INTO specification_issue (grade,version,customer,issued_on,issued_by)
             VALUES ('SPEC-N6',3,'CUS-HELIOS','2026-02-01','quality@example.com'),
                    ('SPEC-N6',2,'CUS-VANTA','2025-08-01','quality@example.com')`);
    await q(`INSERT INTO conformance (customer,application,specification_version,trials,outcome,recorded_on)
             VALUES ('CUS-HELIOS','technical apparel yarn',3,$1,'qualified','2026-02-14'),
                    ('CUS-VANTA','airbag fabric',2,$2,'qualified','2025-10-08')`,
      [JSON.stringify([{ trial: 'spinning trial 1', date: '2026-02-05', outcome: 'pass' },
        { trial: 'spinning trial 2', date: '2026-02-11', outcome: 'pass' }]),
      JSON.stringify([{ trial: 'weave trial', date: '2025-09-20', outcome: 'pass' },
        { trial: 'deployment trial', date: '2025-10-02', outcome: 'pass' }])]);
    act({ act: 'specification_issued', person: 'quality@example.com', object_kind: 'specification', object_ref: 'SPEC-N6 v3',
      content: { customer: 'CUS-HELIOS' }, event_at: '2026-02-01T10:00:00Z', effective_on: '2026-02-01' });

    // ---------------------------------------------------------- contracts
    await q(`INSERT INTO contract (id,recipient,site,period,committed_kg,floor_bp,shortfall_consequence,signed_on)
             VALUES
              ('CON-HELIOS-1','CUS-HELIOS','SITE-DEMO','2026-H1',200,5000,'a pro-rata reduction in the following period''s commitment','2026-01-12'),
              ('CON-VANTA-1','CUS-VANTA','SITE-COMM','2029-H1',1000,3000,'a make-good volume in the following period','2026-02-20')`);

    // ------------------------------------------------------- certificates
    const pilotClaimBp = contentBp(150000, 200000);
    const pilotCarbon = {
      value_mg_per_kg: 4640000, boundary: 'cradle-to-gate', method_version: 'CM-PA6 v2', uncertainty_bp: 1800,
      breakdown: pilotBreakdown,
      energy: { energy_location_mg_per_kg: 2010000, energy_market_mg_per_kg: 780000, metered_kwh: 60000, retired_kwh: 0, unmatched_kwh: 60000 },
      comparison: {
        comparator_name: 'virgin PA6 (EcoBase 2025 2025, EU-27)', comparator_mg_per_kg: 5850000,
        direction: 'lower', difference_mg_per_kg: 1210000,
        statement: 'Lower than virgin PA6 from EcoBase 2025 2025 (EU-27).'
      }
    };
    const conditionsAtSigning = [
      { condition: 'The lot is released', satisfied: true, blocking_reference: null },
      { condition: 'No deviation touching the lot is open', satisfied: true, blocking_reference: null },
      { condition: 'No override on the lot is unreviewed', satisfied: true, blocking_reference: null },
      { condition: 'The bookkeeping period is closed', satisfied: true, blocking_reference: null },
      { condition: 'The balance invariant holds with the allocation applied', satisfied: true, blocking_reference: null },
      { condition: 'The carbon figure exists with all four components', satisfied: true, blocking_reference: null },
      { condition: 'The signer holds signing scope for the site on the date of signing', satisfied: true, blocking_reference: null },
      { condition: 'The signer did not enter the data', satisfied: true, blocking_reference: null }
    ];

    const certs = [
      { number: 'CERT-PILOT-000001', recipient: 'CUS-HELIOS', recipientName: 'Helios Technical Textiles',
        contact: 'helios@example.com', signedAt: '2026-03-02T14:20:00Z', issuedOn: '2026-03-02', state: 'withdrawn',
        withdrawnOn: '2026-04-18', withdrawalReason: 'A collector category was corrected after acceptance', language: 'en' },
      { number: 'CERT-PILOT-000002', recipient: 'CUS-VANTA', recipientName: 'Vanta Safety Systems',
        contact: 'vanta@example.com', signedAt: '2026-03-20T11:05:00Z', issuedOn: '2026-03-20', state: 'issued',
        withdrawnOn: null, withdrawalReason: null, language: 'en' }
    ];

    for (const c of certs) {
      const split = { post_consumer: 150000, pre_consumer: 0 };
      const st = statementsFor({ claimType: 'mass_balance', contentBp: pilotClaimBp, categorySplit: split, language: c.language });
      const testRows = [{ property: 'relative_viscosity', method: 'ISO 307', value: '2.41', unit: 'ratio', reference: 'TST-0003' }];
      const shaped = {
        number: c.number, version: 1, site: 'SITE-PILOT', recipient: c.recipient, recipient_name: c.recipientName,
        grade: 'N6', lots: [{ reference: 'LOT-N6-0003', mass_g: 200000 }], specification_version: 3,
        claim_type: 'mass_balance', content_bp: pilotClaimBp, category_split: split, period: 'BP-PILOT-N6-2026H1',
        carbon: pilotCarbon, primary_share_bp: 4200, scheme: 'RCS-2026', registration: 'REG-RAVEL-0042',
        test_results: testRows, permitted_statement: st.permitted_statement, prohibited_statement: st.prohibited_statement,
        signer: 'signer2@example.com', signer_name: 'Pavel Ostrowski', signed_at: c.signedAt, issued_on: c.issuedOn,
        verification_url: `${VERIFY_BASE}/${c.number}`, state: c.state, provisional_factor: true,
        withdrawn_on: c.withdrawnOn, withdrawal_reason: c.withdrawalReason
      };
      // The document is rendered once, at signing, and its bytes never move.
      const document = renderDocument(shaped);
      await q(`INSERT INTO certificate (number,version,site,recipient,recipient_name,grade,lots,specification_version,
                 claim_type,content_bp,category_split,period,carbon,primary_share_bp,scheme,registration,test_results,
                 permitted_statement,prohibited_statement,signer,signer_name,signed_at,issued_on,verification_url,state,
                 provisional_factor,conditions_at_signing,input_versions,document,withdrawn_on,withdrawn_by,withdrawal_reason,deviations,language)
               VALUES ($1,1,'SITE-PILOT',$2,$3,'N6',$4,3,'mass_balance',$5,$6,'BP-PILOT-N6-2026H1',$7,4200,'RCS-2026','REG-RAVEL-0042',$8,
                 $9,$10,'signer2@example.com','Pavel Ostrowski',$11,$12,$13,$14,true,$15,$16,$17,$18,$19,$20,'[]',$21)`,
        [c.number, c.recipient, c.recipientName, JSON.stringify([{ reference: 'LOT-N6-0003', mass_g: 200000 }]),
          pilotClaimBp, JSON.stringify(split), JSON.stringify(pilotCarbon), JSON.stringify(testRows),
          st.permitted_statement, st.prohibited_statement, c.signedAt, c.issuedOn, `${VERIFY_BASE}/${c.number}`,
          c.state, JSON.stringify(conditionsAtSigning),
          JSON.stringify({ ...inputVersions, conversion_factor: 'CF-PILOT-1 v1 (provisional)' }), document,
          c.withdrawnOn, c.withdrawnOn ? 'signer2@example.com' : null, c.withdrawalReason, c.language]);

      act({ act: 'certificate_signed', person: 'signer2@example.com', site: 'SITE-PILOT', object_kind: 'certificate',
        object_ref: c.number, content: { lot: 'LOT-N6-0003', recipient: c.recipient, content_bp: pilotClaimBp, claim_type: 'mass_balance' },
        event_at: c.signedAt, effective_on: c.issuedOn, anchor_ref: c.number });
      if (c.withdrawnOn) {
        act({ act: 'certificate_withdrawn', person: 'signer2@example.com', site: 'SITE-PILOT', object_kind: 'certificate',
          object_ref: c.number, content: { reason: c.withdrawalReason, withdrawn_on: c.withdrawnOn },
          event_at: `${c.withdrawnOn}T10:00:00Z`, effective_on: c.withdrawnOn, anchor_ref: c.number });
      }
    }
    await q("UPDATE certificate_sequence SET last_number = 2 WHERE site = 'SITE-PILOT'");

    // ---------------------------------------------------------- inbound
    const inbound = [
      ['INB-0001', 'weighbridge', '2026-02-20T06:14:00Z', {
        ticket: 'WB2-88213', device: 'WB-DEMO-02', batch: 'BATCH-1004', gross_kg: 135, tare_kg: 15, net_kg: 120,
        calibration: { calibrated_on: '2025-02-01', state: 'lapsed' }, operator: 'I.BEKELE'
      }],
      ['INB-0002', 'control_system', '2026-03-04T22:41:00Z', {
        run: 'RUN-D-0001', recipe: 'RCP-DISS-2',
        achieved: { temperature_c: 165, pressure_bar: 3, residence_min: 182 },
        sampled_at: '2026-03-04T18:00:00Z', tag_source: 'DCS-LINE-1'
      }],
      ['INB-0003', 'laboratory', '2026-03-06T09:02:00Z', {
        lot: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ISO 307',
        value: 2.43, unit: 'ratio', instrument: 'VISC-02', analyst: 'T.VLACH'
      }]
    ];
    for (const [ref, source, at, payload] of inbound) {
      // payload_verbatim keeps the bytes exactly as they arrived, because a
      // disagreement with a supplier is settled by what came in.
      const verbatim = JSON.stringify(payload);
      await q(`INSERT INTO inbound_record (reference,source,received_at,payload,payload_verbatim) VALUES ($1,$2,$3,$4,$5)`,
        [ref, source, at, verbatim, verbatim]);
      act({ act: 'inbound_record_received', object_kind: 'inbound_record', object_ref: ref,
        content: { source, received_at: at }, event_at: at, effective_on: at.slice(0, 10) });
    }

    // ------------------------------------------------------- public site
    await q(`INSERT INTO statistic (key,value,source,year,geography) VALUES
      ('textiles_recycled','Less than 1 per cent of textiles are recycled into new materials','Textile Flow Monitor',2024,'Global'),
      ('plastics_emissions','1.8 gigatonnes of carbon dioxide equivalent a year from plastics production','Global Materials Emissions Panel',2023,'Global'),
      ('textile_incineration','More than 8 per cent of textile waste is incinerated each year','Textile Flow Monitor',2024,'EU-27')`);

    await q(`INSERT INTO position (reference,title,location,department,contract_type,closes_on)
             VALUES ('POS-0001','Process Engineer','Lyon, France','Operations','Permanent','2026-11-30')`);

    await q(`INSERT INTO news_item (reference,title,tag,outlet,published_on,link,language) VALUES
      ('NWS-0001','Series A closes at 40 million euros','funding','Materials Weekly','2026-01-22','https://example.com/news/series-a','en'),
      ('NWS-0002','Offtake agreement signed for demonstration output','partnership','Fibre Report','2026-03-11','https://example.com/news/offtake','en'),
      ('NWS-0003','Depolymerisation yield published','technical','Chimie Circulaire','2026-05-06','https://example.com/news/rendement','fr')`);

    await q(`INSERT INTO claim_substantiation (reference,claim,route,first_published,evidence,evidence_expires_on,method_version,approver,review_on,state) VALUES
      ('CLM-0001','Low-carbon, virgin-quality recycled polymers','/','2026-01-10',
        'Carbon figure CF-LOT-0001 at 4260000 mg CO2e per kg against a virgin PA6 comparator of 5850000 mg CO2e per kg, EcoBase 2025, EU-27.',
        '2027-01-20','CM-PA6 v2','quality@example.com','2026-12-01','published'),
      ('CLM-0002','Recycled Nylon 6 and 6,6 at virgin quality','/product','2026-01-10',
        'Specification SPEC-N6 version 3 guaranteed limits, tested on every lot, against virgin PA6 at relative viscosity 2.42.',
        '2027-02-01','SPEC-N6 v3','quality@example.com','2026-11-15','published'),
      ('CLM-0003','Low temperature and pressure process','/technology','2026-01-10',
        'Recipe versions RCP-DISS-2 and RCP-PURI-1 hold dissolution at 165 C and 3 bar and purification at 90 C and 1 bar.',
        '2026-09-30','RCP-DISS-2','quality@example.com','2026-08-15','published')`);

    // --------------------------------------------------- the seeded record
    for (const a of acts) {
      await appendEntry(client, a);
    }

    // The legal hold stands on the record entry for the signing of the first
    // pilot certificate.
    const signSeq = await q(
      `SELECT seq FROM record_entry WHERE act = 'certificate_signed' AND object_ref = 'CERT-PILOT-000001' LIMIT 1`
    );
    if (signSeq.rows.length) {
      await q(`INSERT INTO legal_hold (reference,record_seq,reason,placed_by,placed_at)
               VALUES ('HLD-0001',$1,'Scheme audit of the withdrawn pilot certificate','auditor@example.com','2026-04-20T09:00:00Z')`,
        [signSeq.rows[0].seq]);
      await appendEntry(client, {
        act: 'legal_hold_placed', person: 'auditor@example.com', object_kind: 'record_entry',
        object_ref: String(signSeq.rows[0].seq), content: { hold: 'HLD-0001', reason: 'Scheme audit of the withdrawn pilot certificate' },
        event_at: '2026-04-20T09:00:00Z', effective_on: '2026-04-20'
      });
    }
  });

  return { seeded: true };
}
