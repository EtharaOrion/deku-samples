// Ravel seed data: the exact rows the brief specifies.
// The record chain is appended as the seed's own acts, in the order they happen.
import crypto from 'node:crypto';
import { computeDryMass, computeCredit, sha256, canonicalJson } from './lib/units.js';

export async function seedWithClient(db) {
  async function q(text, params = []) {
    return db.query(text, params);
  }

  // ---------- record chain helper ----------
  let seqCounter = 0;
  const entrySpecs = [];
  let recordTail = null;
  function record(kind, object_ref, person, moment, site, content) {
    seqCounter += 1;
    entrySpecs.push({ seq: seqCounter, kind, object_ref, person, moment, site, content });
  }
  function digestOf(entry, prev) {
    const payload = canonicalJson({
      seq: entry.seq, kind: entry.kind, object: entry.object_ref, person: entry.person,
      moment: entry.moment instanceof Date ? entry.moment.toISOString() : entry.moment,
      site: entry.site ?? null, content: entry.content
    });
    return sha256(prev + '\n' + payload);
  }

  // ---------- sites ----------
  const sites = [
    ['SITE-PILOT', 'Pilot', 'commissioned', 'certified', 40000, 24000],
    ['SITE-DEMO', 'Demonstration', 'commissioned', 'certified', 400000, 320000],
    ['SITE-COMM', 'Commercial', 'planned', 'not_certified', 25000000, 26000000]
  ];
  for (const [reference, name, confidence, cert, nameplate, contracted] of sites) {
    await q(`INSERT INTO site (reference,name,confidence,certification_state,nameplate_kg,contracted_kg,capacity_basis,last_revised)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [reference, name, confidence, cert, nameplate, contracted,
        '8000 hours per year, 0.90 availability, 0.80 yield', '2026-06-30']);
    record('site_registered', reference, 'quality@example.com', T(2025, 11, 3), reference, { reference, name, confidence });
  }
  for (const s of ['SITE-PILOT', 'SITE-DEMO']) {
    await q(`INSERT INTO site_certification (site,state,valid_from,valid_to,recorded_on,recorded_by)
             VALUES ($1,'certified','2026-01-01','2026-12-31','2025-12-15','quality@example.com')`, [s]);
  }

  // ---------- party versions ----------
  const pv = [
    ['COL-ALDER', 'Alder Reclaim', '2026-01-01'],
    ['COL-BRINE', 'Brine Textile Recovery', '2026-01-01'],
    ['COL-BRINE', 'Brine Circular Materials', '2026-08-01'],
    ['COL-CINDER', 'Cinder Industrial Offcuts', '2026-01-01'],
    ['CUS-HELIOS', 'Helios Fabrics', '2026-01-01'],
    ['CUS-VANTA', 'Vanta Technical Textiles', '2026-01-01'],
    ['RAVEL', 'Ravel Materials SAS', '2025-01-01']
  ];
  for (const [ref, name, from] of pv) await q(
    `INSERT INTO party_version (party_ref,name,effective_from) VALUES ($1,$2,$3)`, [ref, name, from]);

  // ---------- collectors ----------
  const collectors = [
    ['COL-ALDER', 'Alder Reclaim', 'PT', 'WCR-PT-4471', '2027-03-31',
      ['kerbside', 'retail_take_back'], ['post_consumer_nets', 'post_consumer_textiles'],
      { scheme: 'GRS', state: 'valid' }],
    ['COL-BRINE', 'Brine Textile Recovery', 'NL', 'WCR-NL-2208', '2027-01-31',
      ['industrial_site'], ['pre_consumer_offcuts'],
      { scheme: 'GRS', state: 'valid' }],
    ['COL-CINDER', 'Cinder Industrial Offcuts', 'FR', 'WCR-FR-6613', '2026-12-31',
      ['factory'], ['pre_consumer_offcuts', 'coated_offcuts'],
      { scheme: 'GRS', state: 'conditional' }]
  ];
  for (const [reference, name, country, reg, regExp, siteTypes, streams, scheme] of collectors) {
    await q(`INSERT INTO collector (reference,name,country,registration,registration_expiry,site_types,streams,scheme_status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [reference, name, country, reg, regExp, JSON.stringify(siteTypes), JSON.stringify(streams), JSON.stringify(scheme)]);
    record('collector_registered', reference, 'quality@example.com', T(2025, 12, 1), null, { reference, name });
  }

  const approvals = [
    ['COL-ALDER', 'approved', '2026-01-01', '2026-12-31', null, null],
    ['COL-BRINE', 'approved', '2026-01-01', '2026-06-30', null, null],
    ['COL-CINDER', 'conditional', '2026-01-01', '2026-12-31',
      'Sampling plan for coated streams to be agreed', '2026-10-31']
  ];
  for (const [collector, state, from, to, condition, closes] of approvals) {
    const r = await q(`INSERT INTO approval_period (collector,state,valid_from,valid_to,condition,condition_closes_on)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [collector, state, from, to, condition, closes]);
    record('collector_approval_added', `${collector}:${r.rows[0].id}`, 'quality@example.com', T(2025, 12, 20), null,
      { collector, state, valid_from: from, valid_to: to, condition });
  }

  // ---------- weighing devices ----------
  const devices = [
    ['WB-DEMO-01', 'SITE-DEMO', '2026-05-01'],
    ['WB-DEMO-02', 'SITE-DEMO', '2025-02-01']
  ];
  for (const [reference, site, calibrated] of devices) {
    await q(`INSERT INTO weighing_device (reference,site,calibrated_on) VALUES ($1,$2,$3)`, [reference, site, calibrated]);
    record('weighing_device_registered', reference, 'plant@example.com', T(2026, 1, 15), site,
      { reference, site, calibrated_on: calibrated });
  }

  // ---------- batches ----------
  const CUSTODY_FULL = (coll) => [
    { kind: 'collection_site', date: null, party: coll },
    { kind: 'collector', date: null, party: coll },
    { kind: 'transport', date: null, party: 'Haulier Nord' },
    { kind: 'arrival', date: null, party: 'Ravel Materials SAS' },
    { kind: 'weighing', date: null, party: 'WB-DEMO-01' },
    { kind: 'acceptance', date: null, party: 'plant@example.com' }
  ];
  const batches = [
    {
      reference: 'BATCH-1001', collector: 'COL-ALDER', site: 'SITE-DEMO', grade: 'N6', category: 'post_consumer',
      received_on: '2026-02-10', net_g: 500000, gross_g: 512000, tare_g: 12000, moisture_bp: 1000,
      device: 'WB-DEMO-01', dry: 450000, composition: [
        { polymer: 'PA6', fraction_bp: 9200, basis: 'sampled', measured_fraction_bp: 9150 }],
      contamination: { non_nylon_bp: 500, elastane_bp: 400, coatings: 'none', colour_load: 'medium', foreign_matter: 'traces' },
      custody: CUSTODY_FULL('COL-ALDER').map((l, i) => ({ ...l, date: i < 3 ? '2026-02-09' : '2026-02-10' })),
      moment: T(2026, 2, 10, 8, 12)
    },
    {
      reference: 'BATCH-1002', collector: 'COL-ALDER', site: 'SITE-DEMO', grade: 'N6', category: 'pre_consumer',
      received_on: '2026-02-12', net_g: 300000, gross_g: 309000, tare_g: 9000, moisture_bp: 0,
      device: 'WB-DEMO-01', dry: 300000, composition: [{ polymer: 'PA6', fraction_bp: 9500, basis: 'sampled' }],
      contamination: { non_nylon_bp: 200, elastane_bp: 100, coatings: 'none', colour_load: 'low', foreign_matter: 'none' },
      custody: CUSTODY_FULL('COL-ALDER').map((l, i) => ({ ...l, date: i < 3 ? '2026-02-11' : '2026-02-12' })),
      moment: T(2026, 2, 12, 7, 40)
    },
    {
      reference: 'BATCH-1003', collector: 'COL-BRINE', site: 'SITE-DEMO', grade: 'N6', category: 'post_consumer',
      received_on: '2026-07-05', net_g: 200000, gross_g: 206000, tare_g: 6000, moisture_bp: 500,
      device: 'WB-DEMO-01', dry: 190000, composition: [{ polymer: 'PA6', fraction_bp: 8800, basis: 'declared' }],
      contamination: { non_nylon_bp: 900, elastane_bp: 300, coatings: 'none', colour_load: 'low', foreign_matter: 'none' },
      custody: CUSTODY_FULL('COL-BRINE').map((l, i) => ({ ...l, date: i < 3 ? '2026-07-04' : '2026-07-05' })),
      collector_name: 'Brine Textile Recovery',
      moment: T(2026, 7, 5, 6, 55)
    },
    {
      reference: 'BATCH-1004', collector: 'COL-CINDER', site: 'SITE-DEMO', grade: 'N6', category: 'pre_consumer',
      received_on: '2026-02-20', net_g: 120000, gross_g: 124000, tare_g: 4000, moisture_bp: 0,
      device: 'WB-DEMO-02', dry: 120000, composition: [
        { polymer: 'PA6', fraction_bp: 9900, basis: 'declared', measured_fraction_bp: 9100 }],
      contamination: { non_nylon_bp: 700, elastane_bp: 0, coatings: 'present', colour_load: 'medium', foreign_matter: 'traces' },
      custody: CUSTODY_FULL('COL-CINDER').map((l, i) => ({ ...l, date: i < 3 ? '2026-02-19' : '2026-02-20' })),
      moment: T(2026, 2, 20, 6, 14)
    },
    {
      reference: 'BATCH-1005', collector: 'COL-ALDER', site: 'SITE-DEMO', grade: 'N6', category: 'post_consumer',
      received_on: '2026-03-02', net_g: 100000, gross_g: 103000, tare_g: 3000, moisture_bp: 0,
      device: 'WB-DEMO-01', dry: 100000, composition: [{ polymer: 'PA6', fraction_bp: 9000, basis: 'declared' }],
      contamination: { non_nylon_bp: 600, elastane_bp: 200, coatings: 'none', colour_load: 'low', foreign_matter: 'none' },
      custody: [
        { kind: 'collection_site', date: '2026-03-01', party: 'COL-ALDER' },
        { kind: 'collector', date: '2026-03-01', party: 'COL-ALDER' },
        { kind: 'arrival', date: '2026-03-02', party: 'Ravel Materials SAS' },
        { kind: 'weighing', date: '2026-03-02', party: 'WB-DEMO-01' },
        { kind: 'acceptance', date: '2026-03-02', party: 'plant@example.com' }
      ],
      moment: T(2026, 3, 2, 8, 5)
    }
  ];
  for (const b of batches) {
    const name = b.collector_name || (await q('SELECT name FROM collector WHERE reference=$1', [b.collector])).rows[0].name;
    await q(`INSERT INTO batch (reference,collector,site,grade,category,gross_g,tare_g,net_g,moisture_bp,moisture_method,device,
              received_on,composition,contamination,custody,accepted_g,rejected_g,rejected_destination,collector_name,recorded_at,entered_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,null,$17,$18,$19)`,
      [b.reference, b.collector, b.site, b.grade, b.category, b.gross_g, b.tare_g, b.net_g, b.moisture_bp,
        b.moisture_method || 'ISO 15512', b.device, b.received_on, JSON.stringify(b.composition),
        JSON.stringify(b.contamination), JSON.stringify(b.custody), b.net_g, name, b.moment, 'plant@example.com']);
    record('batch_booked', b.reference, 'plant@example.com', b.moment, b.site,
      { reference: b.reference, collector: b.collector, category: b.category, net_g: b.net_g, moisture_bp: b.moisture_bp });
    record('weighing_recorded', b.reference, 'plant@example.com', b.moment, b.site,
      { batch: b.reference, device: b.device, net_g: b.net_g, calibration_lapsed: b.device === 'WB-DEMO-02' });
  }

  // finding on COL-CINDER from the BATCH-1004 composition departure
  const f = await q(`INSERT INTO finding (collector,batch,kind,detail,opened_on,closes_by,state)
    VALUES ('COL-CINDER','BATCH-1004','declaration_departure',
    'Measured PA6 content of 9100 bp departs from the declared 9900 bp by 800 bp, beyond the 500 bp tolerance','2026-03-01','2026-09-30','open')
    RETURNING id`);
  record('finding_raised', `FND-${String(f.rows[0].id).padStart(4, '0')}`, 'analyst@example.com', T(2026, 3, 1), 'SITE-DEMO',
    { collector: 'COL-CINDER', batch: 'BATCH-1004', kind: 'declaration_departure', departure_bp: 800 });

  // ---------- recipes ----------
  const recipes = {
    'RCP-DISS-2': { stage: 'dissolution', set_points: { temperature_c: 165, pressure_bar: 3 }, tolerances: { temperature_c: [160, 170], pressure_bar: [2, 4] }, reagents: [{ name: 'methanol', ratio_bp: 1200 }], residence_time_min: 90, released_by: 'quality@example.com', released_on: '2026-01-05' },
    'RCP-DEPO-4': { stage: 'depolymerisation', set_points: { temperature_c: 240, pressure_bar: 8 }, tolerances: { temperature_c: [235, 245], pressure_bar: [7, 9] }, reagents: [{ name: 'sodium hydroxide', ratio_bp: 400 }], residence_time_min: 150, released_by: 'quality@example.com', released_on: '2026-01-05' },
    'RCP-PURI-1': { stage: 'purification', set_points: { temperature_c: 180, pressure_bar: 5 }, tolerances: { temperature_c: [175, 185], pressure_bar: [4, 6] }, reagents: [{ name: 'activated carbon', ratio_bp: 200 }], residence_time_min: 60, released_by: 'quality@example.com', released_on: '2026-01-06' },
    'RCP-REPO-3': { stage: 'repolymerisation', set_points: { temperature_c: 260, pressure_bar: 12 }, tolerances: { temperature_c: [255, 265], pressure_bar: [11, 13] }, reagents: [{ name: 'caprolactam catalyst', ratio_bp: 50 }], residence_time_min: 240, released_by: 'quality@example.com', released_on: '2026-01-06' }
  };
  await q(`INSERT INTO carbon_method (reference,version,standard,functional_unit,boundary,allocation_basis,reviewer,published_on,data_quality,emission_factors,primary_share_threshold_bp,superseded,published_by)
           VALUES ('RCP-RECIPE',0,'internal','recipe','internal','mass','recipe board','2026-01-06','{}','[]',0,false,'quality@example.com')`)
    .catch(() => {});
  globalThis.__ravel_recipes = recipes;

  // ---------- runs, consumptions, outputs ----------
  const runRows = [
    { reference: 'RUN-D-0001', run_type: 'dissolution', recipe: 'RCP-DISS-2', started: T(2026, 3, 1, 6, 0), closed: T(2026, 3, 1, 22, 0), losses: 120000, consumes: [['batch', 'BATCH-1001', 300000], ['batch', 'BATCH-1002', 300000]], actual: { temperature_c: 165, pressure_bar: 3 } },
    { reference: 'RUN-D-0002', run_type: 'dissolution', recipe: 'RCP-DISS-2', started: T(2026, 3, 2, 6, 0), closed: T(2026, 3, 2, 20, 0), losses: 60000, consumes: [['batch', 'BATCH-1003', 190000], ['batch', 'BATCH-1004', 120000]], actual: { temperature_c: 164, pressure_bar: 3 } },
    { reference: 'RUN-D-0003', run_type: 'dissolution', recipe: 'RCP-DISS-2', started: T(2026, 3, 3, 6, 0), closed: T(2026, 3, 3, 18, 0), losses: 30000, consumes: [['batch', 'BATCH-1001', 150000]], actual: { temperature_c: 166, pressure_bar: 3 } },
    { reference: 'RUN-Y-0001', run_type: 'depolymerisation', recipe: 'RCP-DEPO-4', started: T(2026, 3, 4, 6, 0), closed: T(2026, 3, 4, 23, 0), losses: 50000, consumes: [['intermediate', 'OUT-D-0001', 480000], ['intermediate', 'OUT-D-0002', 250000], ['intermediate', 'OUT-D-0003', 120000]], actual: { temperature_c: 241, pressure_bar: 8 } },
    { reference: 'RUN-U-0001', run_type: 'purification', recipe: 'RCP-PURI-1', started: T(2026, 3, 5, 6, 0), closed: T(2026, 3, 5, 20, 0), losses: 40000, consumes: [['intermediate', 'OUT-Y-0001', 800000]], actual: { temperature_c: 181, pressure_bar: 5 } },
    { reference: 'RUN-R-0001', run_type: 'repolymerisation', recipe: 'RCP-REPO-3', started: T(2026, 3, 6, 6, 0), closed: T(2026, 3, 6, 23, 30), losses: 20000, consumes: [['intermediate', 'OUT-U-0001', 720000]], actual: { temperature_c: 261, pressure_bar: 12 } }
  ];
  const outputRows = [
    { reference: 'OUT-D-0001', run: 'RUN-D-0001', kind: 'intermediate', mass_g: 480000, lot: null, disposition: null },
    { reference: 'OUT-D-0002', run: 'RUN-D-0002', kind: 'intermediate', mass_g: 250000, lot: null, disposition: null },
    { reference: 'OUT-D-0003', run: 'RUN-D-0003', kind: 'intermediate', mass_g: 120000, lot: null, disposition: null },
    { reference: 'OUT-Y-0001', run: 'RUN-Y-0001', kind: 'intermediate', mass_g: 800000, lot: null, disposition: null },
    { reference: 'OUT-U-0001', run: 'RUN-U-0001', kind: 'intermediate', mass_g: 720000, lot: null, disposition: null },
    { reference: 'OUT-U-0002', run: 'RUN-U-0001', kind: 'byproduct', mass_g: 40000, lot: null, disposition: 'sold' },
    { reference: 'LOT-N6-0001', run: 'RUN-R-0001', kind: 'lot', mass_g: 400000, lot: 'LOT-N6-0001', disposition: null },
    { reference: 'LOT-N6-0002', run: 'RUN-R-0001', kind: 'lot', mass_g: 300000, lot: 'LOT-N6-0002', disposition: null }
  ];
  const runDate = (d) => d.toISOString().slice(0, 10);

  for (const r of runRows) {
    await q(`INSERT INTO run (reference,run_type,site,equipment,recipe_version,operator,started_at,closed_at,losses_g,actual_parameters,recorded_at,entered_by)
             VALUES ($1,$2,'SITE-DEMO',$3,$4,$5,$6,$7,$8,$9,$10,'plant@example.com')`,
      [r.reference, r.run_type, `EQ-${r.reference.slice(4)}`, r.recipe, 'Ines Bekele', r.started, r.closed, r.losses,
        JSON.stringify(r.actual), r.started]);
    record('run_started', r.reference, 'plant@example.com', r.started, 'SITE-DEMO',
      { reference: r.reference, run_type: r.run_type, recipe_version: r.recipe });
    for (const [kind, ref, mass] of r.consumes) {
      await q(`INSERT INTO consumption (run,input_kind,input_ref,mass_g,effective_on,recorded_at)
               VALUES ($1,$2,$3,$4,$5,$6)`,
        [r.reference, kind, ref, mass, runDate(r.started), r.started]);
    }    for (const o of outputRows.filter((o) => o.run === r.reference)) {
      await q(`INSERT INTO output (reference,run,kind,mass_g,disposition,lot,recorded_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [o.reference, o.run, o.kind, o.mass_g, o.disposition, o.lot, r.closed]);
    }
    await q(`UPDATE run SET losses_g=$1 WHERE reference=$2`, [r.losses, r.reference]);
    record('run_closed', r.reference, 'plant@example.com', r.closed, 'SITE-DEMO',
      { reference: r.reference, losses_g: r.losses });
  }

  // ---------- lots ----------
  const lots = [
    { reference: 'LOT-N6-0001', grade: 'N6', site: 'SITE-DEMO', mass_g: 400000, disposition: 'released', claim_type: 'mass_balance', provisional: false, run: 'RUN-R-0001', moment: T(2026, 3, 6, 23, 45) },
    { reference: 'LOT-N6-0002', grade: 'N6', site: 'SITE-DEMO', mass_g: 300000, disposition: 'quarantined', claim_type: 'mass_balance', provisional: false, run: 'RUN-R-0001', moment: T(2026, 3, 6, 23, 46) },
    { reference: 'LOT-N6-0003', grade: 'N6', site: 'SITE-PILOT', mass_g: 200000, disposition: 'released', claim_type: 'mass_balance', provisional: true, run: 'RUN-R-PILOT-1', moment: T(2026, 2, 25, 18, 0) }
  ];
  for (const l of lots) {
    await q(`INSERT INTO lot (reference,grade,site,mass_g,disposition,claim_type,produced_by_run,provisional_factor,recorded_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [l.reference, l.grade, l.site, l.mass_g, l.disposition, l.claim_type, l.run, l.provisional, l.moment]);
    record('lot_recorded', l.reference, 'plant@example.com', l.moment, l.site,
      { reference: l.reference, grade: l.grade, mass_g: l.mass_g });
  }

  // ---------- deviations ----------
  await q(`INSERT INTO deviation (reference,state,affects_runs,affects_lots,outcome,raised_by,raised_on,description)
           VALUES ('DEV-0001','open','["RUN-U-0001"]','["LOT-N6-0002"]',null,'quality@example.com',$1,'Colour specification excursion during purification'),
           ('DEV-0002','closed','["RUN-D-0002"]','[]','cause_not_established','quality@example.com',$2,'Dissolution pressure excursion with no established cause')`,
    [T(2026, 3, 5, 21, 0), T(2026, 3, 2, 21, 0)]);
  await q(`UPDATE deviation SET closed_at=$1 WHERE reference='DEV-0002'`, [T(2026, 3, 9, 10, 0)]);
  record('deviation_raised', 'DEV-0002', 'quality@example.com', T(2026, 3, 2, 21, 0), 'SITE-DEMO',
    { reference: 'DEV-0002', affects_runs: ['RUN-D-0002'] });
  record('deviation_closed', 'DEV-0002', 'quality@example.com', T(2026, 3, 9, 10, 0), 'SITE-DEMO',
    { reference: 'DEV-0002', outcome: 'cause_not_established' });
  record('deviation_raised', 'DEV-0001', 'quality@example.com', T(2026, 3, 5, 21, 0), 'SITE-DEMO',
    { reference: 'DEV-0001', affects_runs: ['RUN-U-0001'], affects_lots: ['LOT-N6-0002'] });

  // ---------- override ----------
  await q(`INSERT INTO override (reference,separation,reason,lot,authorised_by,authorised_on,reviewed)
           VALUES ('OVR-0001','analyst_not_dispositioner',$1,'LOT-N6-0001','quality@example.com','2026-03-18',false)`,
    ['Night shift analyst dispositioned the lot because no second qualified person was on site']);
  record('override_authorised', 'OVR-0001', 'quality@example.com', T(2026, 3, 18, 2, 30), 'SITE-DEMO',
    { reference: 'OVR-0001', separation: 'analyst_not_dispositioner', lot: 'LOT-N6-0001' });

  // ---------- conversion factors ----------
  await q(`INSERT INTO conversion_factor (reference,site,factor_bp,derived_from,derived_to,derived_in_g,derived_out_g,provisional,published_by,published_on)
           VALUES ('CF-DEMO-1','SITE-DEMO',8000,'2026-01-01','2026-03-31',1000000,800000,false,'claims@example.com','2026-04-02'),
                  ('CF-PILOT-1','SITE-PILOT',7500,null,null,0,0,true,'claims@example.com','2026-01-10')`);
  record('conversion_factor_published', 'CF-DEMO-1', 'claims@example.com', T(2026, 4, 2), 'SITE-DEMO',
    { reference: 'CF-DEMO-1', factor_bp: 8000, derived_in_g: 1000000, derived_out_g: 800000 });
  record('conversion_factor_published', 'CF-PILOT-1', 'claims@example.com', T(2026, 1, 10), 'SITE-PILOT',
    { reference: 'CF-PILOT-1', factor_bp: 7500, provisional: true });

  // ---------- balance periods ----------
  const periods = [
    ['BP-DEMO-N6-2025H2', 'SITE-DEMO', 'N6', '2025-07-01', '2025-12-31', 'closed', 2000, 'mass', 'CM-PA6', 1, '2026-01-15', '2026-01-10', 'claims@example.com'],
    ['BP-DEMO-N6-2026H1', 'SITE-DEMO', 'N6', '2026-01-01', '2026-06-30', 'open', 2000, 'mass', 'CM-PA6', 2, null, null, null],
    ['BP-PILOT-N6-2026H1', 'SITE-PILOT', 'N6', '2026-01-01', '2026-06-30', 'open', 2000, 'mass', 'CM-PA6', 2, null, null, null]
  ];
  for (const p of periods) {
    await q(`INSERT INTO balance_period (id,site,grade,period_start,period_end,state,carry_over_limit_bp,allocation_basis,carbon_method,carbon_method_version,closed_on,cut_off,closed_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, p);
    record('balance_period_opened', p[0], 'claims@example.com', T(Number(p[3].slice(0, 4)), Number(p[3].slice(5, 7)), 1), p[1],
      { id: p[0], site: p[1], grade: p[3], state: p[5] });
  }

  // ---------- carbon methods ----------
  const dq = { primary_share_threshold_bp: 5000, uncertainty_limit_bp: 3000, min_data_age_years: 1 };
  const ef = [
    { line: 'collection_and_transport', source: 'EcoBase', year: 2025 },
    { line: 'process_energy', source: 'EcoBase', year: 2025 },
    { line: 'reagents', source: 'Supplier EPD', year: 2024 },
    { line: 'water_and_effluent', source: 'EcoBase', year: 2025 },
    { line: 'waste_and_residues', source: 'EcoBase', year: 2024 },
    { line: 'outbound_transport', source: 'EcoBase', year: 2024 },
    { line: 'byproduct_credit', source: 'Calculated', year: 2026 }
  ];
  await q(`INSERT INTO carbon_method (reference,version,standard,functional_unit,boundary,allocation_basis,reviewer,published_on,data_quality,emission_factors,primary_share_threshold_bp,superseded,published_by)
           VALUES ('CM-PA6',1,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2025-07-01',$1,$2,5000,true,'quality@example.com'),
                  ('CM-PA6',2,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2026-01-20',$1,$2,5000,false,'quality@example.com')`,
    [JSON.stringify(dq), JSON.stringify(ef)]);
  record('carbon_method_published', 'CM-PA6:1', 'quality@example.com', T(2025, 7, 1), null,
    { reference: 'CM-PA6', version: 1, superseded_by: 2 });
  record('carbon_method_published', 'CM-PA6:2', 'quality@example.com', T(2026, 1, 20), null,
    { reference: 'CM-PA6', version: 2 });

  // ---------- carbon figures ----------
  const breakdown = [
    { line: 'collection_and_transport', mg_per_kg: 310000, tag: 'primary' },
    { line: 'process_energy', mg_per_kg: 1850000, tag: 'primary' },
    { line: 'reagents', mg_per_kg: 1180000, tag: 'supplier_specific' },
    { line: 'water_and_effluent', mg_per_kg: 240000, tag: 'primary' },
    { line: 'waste_and_residues', mg_per_kg: 330000, tag: 'secondary' },
    { line: 'outbound_transport', mg_per_kg: 410000, tag: 'secondary' },
    { line: 'byproduct_credit', mg_per_kg: -60000, tag: 'primary' }
  ];
  const comparator = { material: 'virgin PA6', dataset: 'EcoBase 2025', dataset_year: 2025, region: 'EU-27', value_mg_per_kg: 8900000 };
  for (const lot of ['LOT-N6-0001', 'LOT-N6-0002']) {
    await q(`INSERT INTO carbon_figure (lot,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,comparator,breakdown,boundary,
              energy_location_mg_per_kg,energy_market_mg_per_kg,metered_kwh,retired_kwh,unmatched_kwh,figure_version,cache_valid,input_versions,computed_at)
             VALUES ($1,'CM-PA6',2,4260000,1200,6500,$2,$3,'cradle-to-gate',1850000,620000,300000,250000,50000,1,true,$4,$5)`,
      [lot, JSON.stringify(comparator), JSON.stringify(breakdown),
        JSON.stringify({ method: 'CM-PA6', method_version: 2, emission_factors: 'EcoBase 2025', instruments: ['EAC-2026-0007'] }),
        T(2026, 3, 20, 11, 0)]);
  }
  await q(`INSERT INTO carbon_figure (lot,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,comparator,breakdown,boundary,
            energy_location_mg_per_kg,energy_market_mg_per_kg,metered_kwh,retired_kwh,unmatched_kwh,figure_version,cache_valid,input_versions,computed_at)
           VALUES ('LOT-N6-0003','CM-PA6',2,5120000,1500,5800,$1,$2,'cradle-to-gate',2050000,910000,140000,120000,20000,1,true,$3,$4)`,
    [JSON.stringify(comparator), JSON.stringify([
      { line: 'collection_and_transport', mg_per_kg: 380000, tag: 'primary' },
      { line: 'process_energy', mg_per_kg: 2050000, tag: 'primary' },
      { line: 'reagents', mg_per_kg: 1420000, tag: 'supplier_specific' },
      { line: 'water_and_effluent', mg_per_kg: 270000, tag: 'primary' },
      { line: 'waste_and_residues', mg_per_kg: 390000, tag: 'secondary' },
      { line: 'outbound_transport', mg_per_kg: 480000, tag: 'secondary' },
      { line: 'byproduct_credit', mg_per_kg: 130000, tag: 'primary' }
    ]), JSON.stringify({ method: 'CM-PA6', method_version: 2, emission_factors: 'EcoBase 2025', instruments: [] }),
      T(2026, 3, 1, 10, 0)]);
  record('carbon_figure_computed', 'LOT-N6-0001', 'quality@example.com', T(2026, 3, 20, 11, 0), 'SITE-DEMO',
    { lot: 'LOT-N6-0001', method: 'CM-PA6', method_version: 2, value_mg_per_kg: 4260000 });

  // ---------- energy instruments ----------
  await q(`INSERT INTO energy_instrument (reference,quantity_kwh,vintage,region,state,applied_period,retired_on)
           VALUES ('EAC-2026-0007',250000,2026,'EU-27','retired','BP-DEMO-N6-2026H1','2026-04-10'),
                  ('EAC-2025-0031',100000,2025,'EU-27','held',null,null)`);
  record('energy_instrument_retired', 'EAC-2026-0007', 'claims@example.com', T(2026, 4, 10), 'SITE-DEMO',
    { reference: 'EAC-2026-0007', quantity_kwh: 250000, applied_period: 'BP-DEMO-N6-2026H1' });

  // ---------- specifications ----------
  const specRows = [
    { property: 'relative_viscosity', method: 'ISO 307', limit: '2.40', unit: 'ratio', basis: 'guaranteed' },
    { property: 'moisture', method: 'ISO 15512', limit: '0.10', unit: 'percent', basis: 'guaranteed' },
    { property: 'yellowness_index', method: 'ASTM E313', limit: '8.0', unit: 'index', basis: 'typical' },
    { property: 'ash_content', method: 'ISO 3451-1', limit: '0.30', unit: 'percent', basis: 'informational' }
  ];
  const virginRef = { reference: 'virgin PA6 at relative viscosity 2.42', source: 'EcoBase 2025', dated: '2025-11-30' };
  await q(`INSERT INTO specification (grade,version,rows,virgin_reference,issued_on,state)
           VALUES ('N6',2,$1,$2,'2025-08-01','superseded'),
                  ('N6',3,$1,$2,'2026-02-01','current')`,
    [JSON.stringify(specRows), JSON.stringify(virginRef)]);
  record('specification_issued', 'SPEC-N6:3', 'quality@example.com', T(2026, 2, 1), null,
    { grade: 'N6', version: 3, issued_on: '2026-02-01' });

  // ---------- customers & conformance ----------
  await q(`INSERT INTO customer (reference,contact,holds_spec,application,industry)
           VALUES ('CUS-HELIOS','helios@example.com','{"grade":"N6","version":3}','technical apparel yarn','textiles'),
                  ('CUS-VANTA','vanta@example.com','{"grade":"N6","version":2}','airbag fabric','automotive')`);
  await q(`INSERT INTO conformance (customer,application,spec_grade,spec_version,trials,outcome)
           VALUES ('CUS-HELIOS','technical apparel yarn','N6',3,$1,'passed'),
                  ('CUS-VANTA','airbag fabric','N6',2,$2,'in_progress')`,
    [JSON.stringify([{ trial: 'spinning trial', on: '2026-02-20', outcome: 'passed' }, { trial: 'dyeing trial', on: '2026-03-01', outcome: 'passed' }]),
      JSON.stringify([{ trial: 'warp knitting', on: '2026-02-15', outcome: 'pending' }])]);
  record('specification_version_issued_to_customer', 'SPEC-N6:3:CUS-HELIOS', 'quality@example.com', T(2026, 2, 2), null,
    { grade: 'N6', version: 3, customer: 'CUS-HELIOS' });

  // ---------- contracts ----------
  await q(`INSERT INTO contract (id,recipient,site,period,committed_kg,floor_bp,delivered_kg,shortfall_consequence,unreachable_on)
           VALUES ('CON-HELIOS-1','CUS-HELIOS','SITE-DEMO','2026-H1',200,5000,0,'a credit against the following period',null),
                  ('CON-VANTA-1','CUS-VANTA','SITE-COMM','2029-H1',1000,3000,0,'a make-good volume in the following period',null)`);

  // ---------- certificates ----------
  async function signCertificate(spec) {
    const c = spec;
    await q(`INSERT INTO certificate (number,version,site,lots,grade,specification_version,claim_type,content_bp,category_split,period,carbon,
              primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,signer,signed_at,verification_url,state,
              provisional_factor,conditions,input_versions,document,derived_from,recipient)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
      [c.number, c.version, c.site, JSON.stringify(c.lots), c.grade, c.specification_version, c.claim_type, c.content_bp,
        JSON.stringify(c.category_split), c.period, JSON.stringify(c.carbon), c.primary_share_bp, c.scheme, c.registration,
        JSON.stringify(c.test_results), JSON.stringify(c.permitted_statement), JSON.stringify(c.prohibited_statement),
        c.signer, c.signed_at, c.verification_url, c.state, c.provisional_factor, JSON.stringify(c.conditions),
        JSON.stringify(c.input_versions), c.document, c.derived_from ?? null, c.recipient]);
  }

  const langEn = (claimType, contentBp, split) => ({
    language: 'en',
    text: `This certificate confirms that the material described carries ${contentBp / 100} per cent recycled content by mass balance` +
      `, comprising ${(split.post_consumer_g || 0)} grams of post-consumer and ${(split.pre_consumer_g || 0)} grams of pre-consumer input.` +
      ` This material is claimed by mass balance. It is not physically segregated.`
  });
  const langProhibit = {
    language: 'en',
    text: 'You may not state that this material physically contains recycled content.'
  };

  const cert1Conditions = [
    { condition: 'lot_released', satisfied: true, blocking_reference: null },
    { condition: 'no_open_deviation', satisfied: true, blocking_reference: null },
    { condition: 'no_unreviewed_override', satisfied: true, blocking_reference: null },
    { condition: 'period_closed', satisfied: true, blocking_reference: null },
    { condition: 'balance_invariant_holds', satisfied: true, blocking_reference: null },
    { condition: 'carbon_figure_complete', satisfied: true, blocking_reference: null },
    { condition: 'signer_scope_covers_site', satisfied: true, blocking_reference: null },
    { condition: 'signer_did_not_enter_data', satisfied: true, blocking_reference: null }
  ];
  const cert2Conditions = cert1Conditions.map((c) => ({ ...c }));
  const docFor = (c) => [
    `RAVEL MATERIALS SAS - RECYCLED CONTENT CERTIFICATE`,
    ``,
    `Certificate number: ${c.number}`,
    `Version: ${c.version}`,
    `Site: ${c.site}`,
    `Grade: ${c.grade}`,
    `Specification: SPEC-${c.grade} version ${c.specification_version}`,
    `Lot: ${c.lots.map((l) => `${l.reference} ${l.mass_g} g`).join(', ')}`,
    `Claim type: ${c.claim_type}`,
    `Recycled content: ${c.content_bp / 100} per cent (${c.content_bp} basis points)`,
    `Category split: post-consumer ${c.category_split.post_consumer_g} g, pre-consumer ${c.category_split.pre_consumer_g} g`,
    `Balance period: ${c.period}`,
    `Carbon footprint: ${c.carbon.value_mg_per_kg} mg CO2e per kg`,
    `Carbon boundary: ${c.carbon.boundary}`,
    `Carbon method version: ${c.carbon.method} version ${c.carbon.method_version}`,
    `Carbon uncertainty: ${c.carbon.uncertainty_bp} basis points`,
    `Scheme: ${c.scheme}`,
    `Producer registration: ${c.registration}`,
    `Signer: ${c.signer}`,
    `Signed at: ${c.signed_at.toISOString()}`,
    `Verification: ${c.verification_url}`,
    ``,
    `PERMITTED STATEMENT`,
    `${c.permitted_statement.text}`,
    ``,
    `PROHIBITED STATEMENT`,
    `${c.prohibited_statement.text}`,
    ``,
    c.state === 'withdrawn'
      ? `This certificate was withdrawn on ${c.withdrawn_on_iso}. Reason: ${c.withdrawal_reason}.`
      : `Issued under the Ravel mass-balance system. Losses reduce the claim.`
  ].join('\n');

  const cert1 = {
    number: 'CERT-PILOT-000001', version: 1, site: 'SITE-PILOT',
    lots: [{ reference: 'LOT-N6-0003', mass_g: 200000 }],
    grade: 'N6', specification_version: 3, claim_type: 'mass_balance', content_bp: 7500,
    category_split: { post_consumer_g: 150000, pre_consumer_g: 0 },
    period: 'BP-PILOT-N6-2026H1',
    carbon: { value_mg_per_kg: 5120000, boundary: 'cradle-to-gate', method: 'CM-PA6', method_version: 2, uncertainty_bp: 1500 },
    primary_share_bp: 5800, scheme: 'RCS-2026', registration: 'REG-RAVEL-0042',
    test_results: [],
    permitted_statement: langEn('mass_balance', 7500, { post_consumer_g: 150000, pre_consumer_g: 0 }),
    prohibited_statement: langProhibit,
    signer: 'signer2@example.com', signed_at: T(2026, 3, 2, 14, 0),
    verification_url: 'https://ravel.example.com/verify/CERT-PILOT-000001',
    state: 'withdrawn', provisional_factor: true,
    conditions: cert1Conditions,
    input_versions: {
      specification: 'SPEC-N6:3', conversion_factor: 'CF-PILOT-1', carbon_method: 'CM-PA6:2',
      carbon_figure: 'LOT-N6-0003:v1', test_results: [], recipes: [], site_certification: 'certified:2026'
    },
    document: '', recipient: 'CUS-HELIOS',
    withdrawn_on_iso: '2026-04-18', withdrawal_reason: 'A collector category was corrected after acceptance'
  };
  cert1.document = docFor(cert1);
  await signCertificate(cert1);
  record('certificate_signed', cert1.number, 'signer2@example.com', cert1.signed_at, 'SITE-PILOT',
    { number: cert1.number, lot: 'LOT-N6-0003', claim_type: 'mass_balance', content_bp: 7500 });

  const cert2 = {
    number: 'CERT-PILOT-000002', version: 1, site: 'SITE-PILOT',
    lots: [{ reference: 'LOT-N6-0003', mass_g: 200000 }],
    grade: 'N6', specification_version: 3, claim_type: 'mass_balance', content_bp: 7500,
    category_split: { post_consumer_g: 150000, pre_consumer_g: 0 },
    period: 'BP-PILOT-N6-2026H1',
    carbon: { value_mg_per_kg: 5120000, boundary: 'cradle-to-gate', method: 'CM-PA6', method_version: 2, uncertainty_bp: 1500 },
    primary_share_bp: 5800, scheme: 'RCS-2026', registration: 'REG-RAVEL-0042',
    test_results: [],
    permitted_statement: langEn('mass_balance', 7500, { post_consumer_g: 150000, pre_consumer_g: 0 }),
    prohibited_statement: langProhibit,
    signer: 'signer2@example.com', signed_at: T(2026, 3, 12, 10, 30),
    verification_url: 'https://ravel.example.com/verify/CERT-PILOT-000002',
    state: 'issued', provisional_factor: true,
    conditions: cert2Conditions,
    input_versions: {
      specification: 'SPEC-N6:3', conversion_factor: 'CF-PILOT-1', carbon_method: 'CM-PA6:2',
      carbon_figure: 'LOT-N6-0003:v1', test_results: [], recipes: [], site_certification: 'certified:2026'
    },
    document: '', recipient: 'CUS-VANTA'
  };
  cert2.document = docFor(cert2);
  await signCertificate(cert2);
  record('certificate_signed', cert2.number, 'signer2@example.com', cert2.signed_at, 'SITE-PILOT',
    { number: cert2.number, lot: 'LOT-N6-0003', claim_type: 'mass_balance', content_bp: 7500 });

  // withdrawal of CERT-PILOT-000001
  await q(`INSERT INTO withdrawal (number,reason,withdrawn_by,withdrawn_on,notified_recipients,void_statements,derived_certificates,batch_traversal)
           VALUES ('CERT-PILOT-000001','A collector category was corrected after acceptance','quality@example.com','2026-04-18',$1,$2,'[]',$3)`,
    [JSON.stringify([{ reference: 'CUS-HELIOS', name: 'Helios Fabrics', contact: 'helios@example.com' }]),
      JSON.stringify([
        'This material contains 75.00 per cent recycled content.',
        'This material physically contains recycled content.',
        'This material is physically segregated recycled nylon.'
      ]),
      JSON.stringify({ batch_traversals: [], recipients: ['CUS-HELIOS'] })]);
  record('certificate_withdrawn', 'CERT-PILOT-000001', 'quality@example.com', T(2026, 4, 18, 9, 0), 'SITE-PILOT',
    { number: 'CERT-PILOT-000001', reason: 'A collector category was corrected after acceptance', notified: ['CUS-HELIOS'] });

  // ---------- legal hold ----------
  const signSeq = entrySpecs.find((e) => e.kind === 'certificate_signed' && e.object_ref === 'CERT-PILOT-000001');
  const holdSeq = signSeq ? signSeq.seq : entrySpecs.length;
  await q(`INSERT INTO legal_hold (reference,seq,placed_by,placed_on,reason)
           VALUES ('HLD-0001',$1,'auditor@example.com','2026-05-02','Certificate under market-surveillance review')`, [holdSeq]);

  // ---------- credits granted at consumption ----------
  const creditRows = [
    ['BATCH-1001', 'post_consumer', 450000, 360000, '2026-03-01'],
    ['BATCH-1002', 'pre_consumer', 300000, 240000, '2026-03-01'],
    ['BATCH-1003', 'non_claimable', 190000, 0, '2026-03-02'],
    ['BATCH-1004', 'pre_consumer', 120000, 96000, '2026-03-02']
  ];
  const consumes = await q(`SELECT c.run, c.input_ref, c.mass_g, c.effective_on, c.recorded_at, r.site FROM consumption c JOIN run r ON r.reference=c.run WHERE c.input_kind='batch'`);
  for (const c of consumes.rows) {
    const b = await q('SELECT * FROM batch WHERE reference=$1', [c.input_ref]);
    const dry = computeDryMass(b.rows[0].net_g, b.rows[0].moisture_bp);
    const period = await q(`SELECT id FROM balance_period WHERE site=$1 AND grade='N6' AND $2 BETWEEN period_start AND period_end`,
      [c.site, c.effective_on]);
    if (!period.rows.length) continue;
    const claimable = await isClaimableAtReceipt(db, b.rows[0]);
    const cf = await q(`SELECT factor_bp FROM conversion_factor WHERE site=$1 ORDER BY (provisional), published_on DESC LIMIT 1`, [c.site]);
    const factor = cf.rows[0] ? cf.rows[0].factor_bp : 8000;
    const credit = claimable ? Math.floor(c.mass_g * factor / 10000) : 0;
    const category = claimable ? b.rows[0].category : 'non_claimable';
    await q(`INSERT INTO credit_movement (period,category,direction,kind,mass_g,derivation,effective_on,recorded_at)
             VALUES ($1,$2,'in','consumption',$3,$4,$5,$6)`,
      [period.rows[0].id, category, credit,
        JSON.stringify({ batch: c.input_ref, run: c.run, dry_mass_consumed_g: c.mass_g, factor_bp: factor, note: 'dry mass consumed times conversion factor, floored' }),
        c.effective_on, c.recorded_at]);
    if (!claimable) {
      await q(`INSERT INTO credit_movement (period,category,direction,kind,mass_g,derivation,effective_on,recorded_at)
               VALUES ($1,'non_claimable','in','non_claimable_input',$2,$3,$4,$5)`,
        [period.rows[0].id, c.mass_g,
          JSON.stringify({ batch: c.input_ref, run: c.run, note: 'non-claimable input tracked, no credit granted' }),
          c.effective_on, c.recorded_at]);
    }
    void dry;
    record('credit_granted', `${period.rows[0].id}:${c.input_ref}`, 'system', c.recorded_at, c.site,
      { period: period.rows[0].id, batch: c.input_ref, category, mass_g: credit });
  }

  // transfer TRF-0001
  await q(`INSERT INTO transfer (reference,mass_g,category,origin_period,destination_period,origin_site,moved_on,recorded_at)
           VALUES ('TRF-0001',50000,'post_consumer','BP-PILOT-N6-2026H1','BP-DEMO-N6-2026H1','SITE-PILOT','2026-05-12',$1)`,
    [T(2026, 5, 12, 10, 0)]);
  // The transfer is registered against both periods and is answered as an
  // inbound credit naming its origin; it is never a fresh credit and the total
  // credit across the two periods is unchanged by the journey.
  record('transfer_recorded', 'TRF-0001', 'claims@example.com', T(2026, 5, 12, 10, 0), 'SITE-DEMO',
    { reference: 'TRF-0001', mass_g: 50000, origin_site: 'SITE-PILOT' });

  // ---------- inbound records ----------
  const inbound = [
    ['INB-0001', 'weighbridge', T(2026, 2, 20, 6, 14), { ticket: 'WB-DEMO-02-0214', device: 'WB-DEMO-02', batch: 'BATCH-1004', gross_g: 124000, tare_g: 4000, net_g: 120000, calibration: 'lapsed', unit: 'g' }],
    ['INB-0002', 'control_system', T(2026, 3, 4, 22, 41), { run: 'RUN-D-0001', achieved: { temperature_c: 165, pressure_bar: 3 }, recipe: 'RCP-DISS-2', tolerance: 'within' }],
    ['INB-0003', 'laboratory', T(2026, 3, 6, 9, 2), { lot: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ISO 307', value: '2.46', unit: 'ratio', analyst: 'Tomas Vlach' }]
  ];
  for (const [reference, source, received_at, payload] of inbound) {
    await q(`INSERT INTO inbound_record (reference,source,received_at,payload_verbatim)
             VALUES ($1,$2,$3,$4)`, [reference, source, received_at, JSON.stringify(payload)]);
    record('inbound_record_received', reference, 'system', received_at, null, { reference, source });
  }

  // ---------- statistics / positions / news ----------
  const stats = [
    ['textiles_recycled', 'Less than 1 per cent of textiles are recycled into new materials', 'Textile Flow Monitor', 2024, 'Global'],
    ['plastics_emissions', '1.8 gigatonnes of carbon dioxide equivalent a year from plastics production', 'Global Materials Emissions Panel', 2023, 'Global'],
    ['textile_incineration', 'More than 8 per cent of textile waste is incinerated each year', 'Textile Flow Monitor', 2024, 'EU-27']
  ];
  for (const s of stats) await q(`INSERT INTO statistic (key,value,source,year,geography) VALUES ($1,$2,$3,$4,$5)`, s);

  await q(`INSERT INTO position (title,location,department,contract_type,closes_on)
           VALUES ('Process Engineer','Lyon, France','Operations','Permanent','2026-11-30')`);

  const news = [
    ['Series A closes at 40 million euros', 'funding', 'Materials Weekly', '2026-01-22', '/news/series-a', 'en'],
    ['Offtake agreement signed for demonstration output', 'partnership', 'Fibre Report', '2026-03-11', '/news/offtake-agreement', 'en'],
    ['Depolymerisation yield published', 'technical', 'Chimie Circulaire', '2026-05-06', '/news/depolymerisation-yield', 'fr']
  ];
  for (const n of news) await q(`INSERT INTO news_item (title,tag,outlet,published_on,link,language) VALUES ($1,$2,$3,$4,$5,$6)`, n);

  await q(`INSERT INTO claim_substantiation (claim,route,first_published_on,evidence,method_version,approver,review_on)
           VALUES ($1,'/technology','2026-01-15',$2,'CM-PA6:2','quality@example.com','2027-01-15'),
                  ($3,'/product','2026-01-15',$4,'CF-DEMO-1','claims@example.com','2027-01-15')`,
    ['Low carbon impact',
      JSON.stringify([{ kind: 'carbon figure', reference: 'LOT-N6-0001', value_mg_per_kg: 4260000 }, { kind: 'comparator', reference: 'virgin PA6, EcoBase 2025, EU-27' }]),
      'Recycled content by mass balance',
      JSON.stringify([{ kind: 'balance period', reference: 'BP-DEMO-N6-2026H1' }, { kind: 'conversion factor', reference: 'CF-DEMO-1' }])]);

  // ---------- app accounts ----------
  const accounts = [
    ['plant@example.com', 'Ines Bekele', ['plant_operator'], ['SITE-DEMO', 'SITE-PILOT']],
    ['analyst@example.com', 'Tomas Vlach', ['lab_analyst'], ['SITE-DEMO', 'SITE-PILOT']],
    ['quality@example.com', 'Marit Solheim', ['quality_manager'], ['SITE-DEMO', 'SITE-PILOT']],
    ['claims@example.com', 'Osei Danquah', ['claims_manager'], ['SITE-DEMO', 'SITE-PILOT']],
    ['signer@example.com', 'Hana Ferreira', ['certificate_signer'], ['SITE-DEMO', 'SITE-PILOT']],
    ['signer2@example.com', 'Pavel Ostrowski', ['certificate_signer'], ['SITE-PILOT']],
    ['auditor@example.com', 'Ruth Lindqvist', ['auditor'], ['SITE-DEMO', 'SITE-PILOT']]
  ];
  for (const a of accounts) {
    await q(`INSERT INTO app_account (email,name,roles,sites,grant_end) VALUES ($1,$2,$3,$4,'2027-06-30')`,
      [a[0], a[1], JSON.stringify(a[2]), JSON.stringify(a[3])]);
  }

  // ---------- person identities ----------
  const people = [
    ['plant@example.com', 'Ines Bekele', 'plant@example.com'],
    ['analyst@example.com', 'Tomas Vlach', 'analyst@example.com'],
    ['quality@example.com', 'Marit Solheim', 'quality@example.com'],
    ['claims@example.com', 'Osei Danquah', 'claims@example.com'],
    ['signer@example.com', 'Hana Ferreira', 'signer@example.com'],
    ['signer2@example.com', 'Pavel Ostrowski', 'signer2@example.com'],
    ['auditor@example.com', 'Ruth Lindqvist', 'auditor@example.com'],
    ['system', 'Ravel system', 'system@ravel.example.com']
  ];
  for (const p of people) await q(`INSERT INTO person_identity (person_id,name,email) VALUES ($1,$2,$3)`, p);

  // ---------- write the record chain ----------
  for (const e of entrySpecs) {
    const prev = recordTail ?? '0'.repeat(64);
    const digest = digestOf(e, prev);
    await q(`INSERT INTO record_entry (seq,digest,prev_digest,person,moment,site,object_ref,kind,content)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (seq) DO NOTHING`,
      [e.seq, digest, prev ?? '0'.repeat(64), e.person, e.moment, e.site ?? null, e.object_ref, e.kind, JSON.stringify(e.content)]);
    recordTail = digest;
  }

  // Reference allocators start beyond every seeded reference.
  const refSources = [
    ['BATCH-', 'batch', 'reference'],
    ['DEV-', 'deviation', 'reference'],
    ['OVR-', 'override', 'reference'],
    ['TRF-', 'transfer', 'reference'],
    ['RST-', 'restatement', 'reference'],
    ['INB-', 'inbound_record', 'reference'],
    ['HLD-', 'legal_hold', 'reference'],
    ['ENQ-', 'enquiry', 'reference'],
    ['EXP-', 'export_record', 'reference'],
    ['CHN-', 'change_notice', 'reference'],
    ['CERT-PILOT-', 'certificate', 'number'],
    ['CERT-DEMO-', 'certificate', 'number'],
    ['CF-', 'conversion_factor', 'reference']
  ];
  for (const [prefix, table, col] of refSources) {
    const rows = await q(`SELECT ${col} AS ref FROM ${table}`);
    let max = 0;
    for (const row of rows.rows) {
      const m = String(row.ref).match(new RegExp('^' + prefix.replace(/[-]/g, '\\-') + '(\\d+)$'));
      if (m) max = Math.max(max, Number(m[1]));
    }
    if (max > 0) {
      await q(`INSERT INTO app_reference (prefix,last_n) VALUES ($1,$2)
               ON CONFLICT (prefix) DO UPDATE SET last_n = GREATEST(app_reference.last_n, EXCLUDED.last_n)`,
        [prefix, max]);
    }
  }

  // Explicit seq values written above do not advance the sequence.
  await q(`SELECT setval(pg_get_serial_sequence('record_entry','seq'), (SELECT coalesce(max(seq),1) FROM record_entry))`);
  return { seeded: true, entries: entrySpecs.length };
}

const T = (y, m, d, h = 9, mi = 0) => new Date(Date.UTC(y, m - 1, d, h, mi, 0));

async function isClaimableAtReceipt(db, batch) {
  const custody = Array.isArray(batch.custody) ? batch.custody : [];
  if (batch.claimable_from) return true;
  const r = await db.query(
    `SELECT state FROM approval_period WHERE collector=$1 AND $2 BETWEEN valid_from AND valid_to ORDER BY valid_from DESC LIMIT 1`,
    [batch.collector, batch.received_on]);
  if (!r.rows.length) return false;
  const s = r.rows[0].state;
  if (s !== 'approved' && s !== 'conditional') return false;
  const kinds = new Set(custody.map((l) => l.kind));
  const required = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
  return required.every((k) => kinds.has(k));
}
