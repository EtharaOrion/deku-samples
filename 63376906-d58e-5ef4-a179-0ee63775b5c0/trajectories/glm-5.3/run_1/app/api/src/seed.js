import { q, one, exec } from './db.js';
import { entry } from './record.js';
import { dryMass, creditGranted } from './engine/int.js';

const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const ts = (s) => `${s}T09:00:00Z`;

export default async function seed() {
  // base rows; the rest follow below in seedAll
  await exec(`INSERT INTO meta (k, v) VALUES ('schema_version', '1') ON CONFLICT DO NOTHING`);

  const users = [
    ['plant@example.com', 'Ines Bekele', 'plant_operator', ['SITE-DEMO', 'SITE-PILOT']],
    ['analyst@example.com', 'Tomas Vlach', 'lab_analyst', ['SITE-DEMO', 'SITE-PILOT']],
    ['quality@example.com', 'Marit Solheim', 'quality_manager', ['SITE-DEMO', 'SITE-PILOT']],
    ['claims@example.com', 'Osei Danquah', 'claims_manager', ['SITE-DEMO', 'SITE-PILOT']],
    ['signer@example.com', 'Hana Ferreira', 'certificate_signer', ['SITE-DEMO', 'SITE-PILOT']],
    ['signer2@example.com', 'Pavel Ostrowski', 'certificate_signer', ['SITE-PILOT']],
    ['auditor@example.com', 'Ruth Lindqvist', 'auditor', ['SITE-DEMO', 'SITE-PILOT']]
  ];
  for (const [email, name, role, sites] of users) {
    await exec(`INSERT INTO users (email, name, role, sites, grant_ends_on) VALUES ($1,$2,$3,$4,'2027-06-30')`,
      [email, name, role, sites]);
  }

  const sites = [
    ['SITE-PILOT', 'Pilot', 'commissioned', 'certified', 40000, 24000],
    ['SITE-DEMO', 'Demonstration', 'commissioned', 'certified', 400000, 320000],
    ['SITE-COMM', 'Commercial', 'planned', 'not_certified', 25000000, 26000000]
  ];
  for (const [reference, name, confidence, cs, np, ct] of sites) {
    await exec(`INSERT INTO sites VALUES ($1,$2,$3,$4,$5,$6,'8000 hours per year, 0.90 availability, 0.80 yield','2026-06-30')`,
      [reference, name, confidence, cs, np, ct]);
  }

  await exec(`INSERT INTO site_certifications (site, state, valid_from, valid_to) VALUES ('SITE-PILOT','certified','2026-01-01','2026-12-31'),('SITE-DEMO','certified','2026-01-01','2026-12-31')`);

  const parties = [
    ['COL-ALDER', 'collector', 'Alder Reclaim'],
    ['COL-BRINE', 'collector', 'Brine Circular Materials'],
    ['COL-CINDER', 'collector', 'Cinder Industrial Offcuts'],
    ['CUS-HELIOS', 'customer', 'Helios Textiles'],
    ['CUS-VANTA', 'customer', 'Vanta Automotive'],
    ['RAVEL', 'producer', 'Ravel Materials SAS']
  ];
  for (const p of parties) await exec(`INSERT INTO parties VALUES ($1,$2,$3)`, p);
  for (const [party, name, from] of [['COL-ALDER', 'Alder Reclaim', '2026-01-01'],
    ['COL-BRINE', 'Brine Textile Recovery', '2026-01-01'], ['COL-BRINE', 'Brine Circular Materials', '2026-08-01'],
    ['COL-CINDER', 'Cinder Industrial Offcuts', '2026-01-01'],
    ['CUS-HELIOS', 'Helios Textiles', '2026-01-01'], ['CUS-VANTA', 'Vanta Automotive', '2026-01-01'],
    ['RAVEL', 'Ravel Materials SAS', '2026-01-01']]) {
    await exec(`INSERT INTO party_versions (party, name, effective_from) VALUES ($1,$2,$3)`, [party, name, from]);
  }

  const collectors = [
    ['COL-ALDER', 'Alder Reclaim', 'PT', 'WCR-PT-4471', '2027-03-31', ['kerbside', 'dropoff'], ['nets', 'textiles']],
    ['COL-BRINE', 'Brine Textile Recovery', 'NL', 'WCR-NL-2208', '2027-01-31', ['industrial'], ['offcuts']],
    ['COL-CINDER', 'Cinder Industrial Offcuts', 'FR', 'WCR-FR-6613', '2026-12-31', ['factory'], ['offcuts', 'coated']]
  ];
  for (const [reference, name, country, reg, exp, st, streams] of collectors) {
    await exec(`INSERT INTO collectors VALUES ($1,$2,$3,$4,$5,$6,$7,'member')`,
      [reference, reference, country, reg, exp, st, streams]);
  }
  await exec(`INSERT INTO approval_periods (collector, state, valid_from, valid_to) VALUES ('COL-ALDER','approved','2026-01-01','2026-12-31'),('COL-BRINE','approved','2026-01-01','2026-06-30')`);
  await exec(`INSERT INTO approval_periods (collector, state, valid_from, valid_to, condition, condition_closes_on) VALUES ('COL-CINDER','conditional','2026-01-01','2026-12-31','Sampling plan for coated streams to be agreed','2026-10-31')`);
  await exec(`INSERT INTO findings (collector, raised_on, detail, open) VALUES ('COL-CINDER','2026-02-20','Measured PA6 content 9100 basis points against a declaration of 9900, a departure of 800 basis points', true)`);

  await exec(`INSERT INTO weighing_devices VALUES ('WB-DEMO-01','SITE-DEMO','2026-05-01'),('WB-DEMO-02','SITE-DEMO','2025-02-01')`);
  await exec(`INSERT INTO recipes VALUES ('RCP-DISS-2','dissolution','{"temperature":[160,170],"pressure":[2,4]}','quality@example.com'),
    ('RCP-DEPO-4','depolymerisation','{"temperature":[250,270],"pressure":[5,8]}','quality@example.com'),
    ('RCP-PURI-1','purification','{"temperature":[200,220],"pressure":[3,5]}','quality@example.com'),
    ('RCP-REPO-3','repolymerisation','{"temperature":[240,260],"pressure":[6,9]}','quality@example.com')`);
  await seedAll();
}

export async function seedBatches() {
  const cust = (batch, kinds) => {
    const byKind = {
      collection_site: ['collection_site', 'Alder Reclaim depot'],
      collector: ['collector', 'Alder Reclaim'],
      transport: ['transport', 'Nordic Freight'],
      arrival: ['arrival', 'Ravel Demonstration'],
      weighing: ['weighing', 'Ravel weighbridge'],
      acceptance: ['acceptance', 'Ravel Demonstration']
    };
    for (const k of kinds) {
      const [kind, party] = byKind[k];
      exec(`INSERT INTO custodies (batch, kind, occurred_on, party, late) VALUES ($1,$2,'2026-02-10',$3,false)`, [batch, kind, party]);
    }
  };
  const batches = [
    ['BATCH-1001', 'COL-ALDER', 'post_consumer', '2026-02-10', 500000, 1000, 'WB-DEMO-01', true, null,
      { polymer: 'PA6', fraction_bp: 9200, basis: 'sampled' }, { non_nylon_bp: 300, elastane_bp: 400, coatings: 'none', colour_load: 'medium', foreign_matter: 'low' },
      ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance']],
    ['BATCH-1002', 'COL-ALDER', 'pre_consumer', '2026-02-12', 300000, 0, 'WB-DEMO-01', true, null,
      { polymer: 'PA6', fraction_bp: 9800, basis: 'declared' }, { non_nylon_bp: 100, elastane_bp: 0, coatings: 'none', colour_load: 'low', foreign_matter: 'none' },
      ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance']],
    ['BATCH-1003', 'COL-BRINE', 'post_consumer', '2026-07-05', 200000, 500, 'WB-DEMO-01', false, 'collector_approval_lapsed',
      { polymer: 'PA6', fraction_bp: 9500, basis: 'declared' }, { non_nylon_bp: 200, elastane_bp: 100, coatings: 'none', colour_load: 'low', foreign_matter: 'low' },
      ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance']],
    ['BATCH-1004', 'COL-CINDER', 'pre_consumer', '2026-02-20', 120000, 0, 'WB-DEMO-02', true, null,
      { polymer: 'PA6', fraction_bp: 9900, basis: 'declared', measured_fraction_bp: 9100 }, { non_nylon_bp: 100, elastane_bp: 0, coatings: 'some', colour_load: 'low', foreign_matter: 'none' },
      ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance']],
    ['BATCH-1005', 'COL-ALDER', 'post_consumer', '2026-03-02', 100000, 0, 'WB-DEMO-01', false, 'custody_link_missing:transport',
      { polymer: 'PA6', fraction_bp: 9300, basis: 'declared' }, { non_nylon_bp: 300, elastane_bp: 200, coatings: 'none', colour_load: 'medium', foreign_matter: 'low' },
      ['collection_site', 'collector', 'arrival', 'weighing', 'acceptance']]
  ];
  for (const [ref, collector, category, received_on, net, moist, device, claimable, reason, comp, cont, kinds] of batches) {
    const gross = net + 15000;
    await exec(`INSERT INTO batches (reference, collector, site, grade, category, gross_g, tare_g, net_g, moisture_bp, moisture_method, device, received_on,
        accepted_g, rejected_g, claimable, claimable_reason, composition, contamination, event_at, recorded_at, effective_on)
      VALUES ($1,$2,'SITE-DEMO','N6',$3,$4,15000,$5,$6,'ISO 15512',$7,$8,$9,0,$10,$11,$12,$13,$14,$14,$8)`,
      [ref, collector, category, gross, net, moist, device, received_on, net, claimable, reason || null,
       JSON.stringify(comp), JSON.stringify(cont), ts(received_on)]);
    for (const k of kinds) {
      const parties = { collection_site: 'Alder depot', collector, transport: 'Nordic Freight', arrival: 'Ravel Demonstration', weighing: 'Ravel weighbridge', acceptance: 'Ravel Demonstration' };
      await exec(`INSERT INTO custodies (batch, kind, occurred_on, party, late) VALUES ($1,$2,$3,$4,false)`, [ref, k, received_on, parties[k]]);
    }
  }
}

export async function seedRuns() {
  const runs = [
    ['RUN-D-0001', 'dissolution', 'RCP-DISS-2', '2026-03-01', 'DISS-01', { temperature: 165, pressure: 3 }, true, 120000],
    ['RUN-D-0002', 'dissolution', 'RCP-DISS-2', '2026-03-02', 'DISS-02', { temperature: 168, pressure: 3 }, true, 60000],
    ['RUN-D-0003', 'dissolution', 'RCP-DISS-2', '2026-03-03', 'DISS-01', { temperature: 162, pressure: 2 }, true, 30000],
    ['RUN-Y-0001', 'depolymerisation', 'RCP-DEPO-4', '2026-03-10', 'DEPO-01', { temperature: 260, pressure: 6 }, true, 50000],
    ['RUN-U-0001', 'purification', 'RCP-PURI-1', '2026-03-15', 'PUR-01', { temperature: 210, pressure: 4 }, true, 40000],
    ['RUN-R-0001', 'repolymerisation', 'RCP-REPO-3', '2026-03-20', 'REPO-01', { temperature: 250, pressure: 7 }, true, 20000]
  ];
  for (const [ref, type, recipe, started, equip, achieved, within, losses] of runs) {
    await exec(`INSERT INTO runs (reference, run_type, site, equipment, recipe_version, operator, started_at, closed_at, closed, losses_g, achieved, within_tolerance, event_at, recorded_at, effective_on)
      VALUES ($1,$2,'SITE-DEMO',$3,$4,'plant@example.com',$5,$6,true,$7,$8,$9,$5,$6,$10)`,
      [ref, type, equip, recipe, ts(started), started + 'T18:00:00Z', losses, JSON.stringify(achieved), within, started]);
  }
  const cons = [
    ['RUN-D-0001', 'BATCH-1001', null, 300000, '2026-03-01'],
    ['RUN-D-0001', 'BATCH-1002', null, 300000, '2026-03-01'],
    ['RUN-D-0002', 'BATCH-1003', null, 190000, '2026-03-02'],
    ['RUN-D-0002', 'BATCH-1004', null, 120000, '2026-03-02'],
    ['RUN-D-0003', 'BATCH-1001', null, 150000, '2026-03-03'],
    ['RUN-Y-0001', null, 'OUT-D-0001', 480000, '2026-03-10'],
    ['RUN-Y-0001', null, 'OUT-D-0002', 250000, '2026-03-10'],
    ['RUN-Y-0001', null, 'OUT-D-0003', 120000, '2026-03-10'],
    ['RUN-U-0001', null, 'OUT-Y-0001', 800000, '2026-03-15'],
    ['RUN-R-0001', null, 'OUT-U-0001', 720000, '2026-03-20']
  ];
  for (const [run, batch, io, mass, eff] of cons) {
    await exec(`INSERT INTO consumptions (run, batch, input_output, mass_g, effective_on) VALUES ($1,$2,$3,$4,$5)`,
      [run, batch, io, mass, eff]);
  }
  const outs = [
    ['OUT-D-0001', 'RUN-D-0001', 'intermediate', 480000, null],
    ['OUT-D-0002', 'RUN-D-0002', 'intermediate', 250000, null],
    ['OUT-D-0003', 'RUN-D-0003', 'intermediate', 120000, null],
    ['OUT-Y-0001', 'RUN-Y-0001', 'intermediate', 800000, null],
    ['OUT-U-0001', 'RUN-U-0001', 'intermediate', 720000, null],
    ['OUT-U-0002', 'RUN-U-0001', 'byproduct', 40000, 'sold'],
    ['LOT-N6-0001', 'RUN-R-0001', 'lot', 400000, null],
    ['LOT-N6-0002', 'RUN-R-0001', 'lot', 300000, null]
  ];
  for (const [ref, run, kind, mass, disp] of outs) {
    await exec(`INSERT INTO outputs (reference, run, kind, mass_g, disposition, grade, site, event_at, recorded_at, effective_on)
      VALUES ($1,$2,$3,$4,$5,'N6','SITE-DEMO',now(),now(),'2026-03-20')`, [ref, run, kind, mass, disp]);
  }
  const lots = [
    ['LOT-N6-0001', 'SITE-DEMO', 400000, 'released', 'RUN-R-0001'],
    ['LOT-N6-0002', 'SITE-DEMO', 300000, 'quarantined', 'RUN-R-0001'],
    ['LOT-N6-0003', 'SITE-PILOT', 200000, 'released', null]
  ];
  for (const [ref, site, mass, disp, by] of lots) {
    await exec(`INSERT INTO lots (reference, site, grade, mass_g, disposition, claim_type, produced_by, event_at, recorded_at, effective_on)
      VALUES ($1,$2,'N6',$3,$4,'mass_balance',$5,now(),now(),'2026-03-20')`, [ref, site, mass, disp, by]);
  }
}

export async function seedLedgerAndArtifacts() {
  await exec(`INSERT INTO deviations (reference, state, runs, lots, outcome, raised_on, closed_on) VALUES
    ('DEV-0001','open',ARRAY['RUN-U-0001'],ARRAY['LOT-N6-0002'],null,'2026-03-16',null),
    ('DEV-0002','closed',ARRAY['RUN-D-0002'],ARRAY[]::text[],'cause_not_established','2026-03-05','2026-04-01')`);
  await exec(`INSERT INTO overrides (reference, separation, reason, lot, authorised_by, authorised_on) VALUES
    ('OVR-0001','analyst_not_dispositioner','Night shift analyst dispositioned the lot because no second qualified person was on site','LOT-N6-0001','quality@example.com','2026-03-18')`);

  await exec(`INSERT INTO balance_periods (id, site, grade, period_from, period_to, state, carry_over_limit_bp, allocation_basis, closed_on, cut_off, carbon_method, carbon_method_version) VALUES
    ('BP-DEMO-N6-2025H2','SITE-DEMO','N6','2025-07-01','2025-12-31','closed',2000,'mass','2026-01-15','2026-01-10','CM-PA6',1),
    ('BP-DEMO-N6-2026H1','SITE-DEMO','N6','2026-01-01','2026-06-30','open',2000,'mass',null,null,'CM-PA6',2),
    ('BP-PILOT-N6-2026H1','SITE-PILOT','N6','2026-01-01','2026-06-30','open',2000,'mass',null,null,'CM-PA6',2)`);

  await exec(`INSERT INTO conversion_factors (reference, site, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on) VALUES
    ('CF-DEMO-1','SITE-DEMO',8000,'2026-01-01','2026-03-31',1000000,800000,false,'claims@example.com','2026-01-05'),
    ('CF-PILOT-1','SITE-PILOT',7500,null,null,0,0,true,'claims@example.com','2026-01-05')`);

  const credits = [
    ['BP-DEMO-N6-2026H1', 'post_consumer', 360000, 'BATCH-1001', 'consumption'],
    ['BP-DEMO-N6-2026H1', 'pre_consumer', 240000, 'BATCH-1002', 'consumption'],
    ['BP-DEMO-N6-2026H1', 'pre_consumer', 96000, 'BATCH-1004', 'consumption']
  ];
  for (const [period, category, mass, ref, kind] of credits) {
    await exec(`INSERT INTO credit_movements (balance_period, category, direction, mass_g, kind, reference, effective_on, derivation, fresh_credit)
      VALUES ($1,$2,'in',$3,$4,$5,'2026-03-02',$6,true)`,
      [period, category, mass, kind, ref, JSON.stringify({ batch: ref, factor_reference: 'CF-DEMO-1', factor_bp: 8000, note: 'dry mass consumed times conversion factor, floored' })]);
  }
  await exec(`INSERT INTO credit_movements (balance_period, category, direction, mass_g, kind, reference, effective_on, derivation, fresh_credit)
    VALUES ('BP-DEMO-N6-2026H1','post_consumer','in',190000,'non_claimable_input','BATCH-1003','2026-03-02',$1,false)`,
    [JSON.stringify({ batch: 'BATCH-1003', note: 'collector approval lapsed on receipt date; processed but not claimed' })]);

  await exec(`INSERT INTO transfers (reference, from_period, to_period, mass_g, category, origin_site, effective_on) VALUES
    ('TRF-0001','BP-PILOT-N6-2026H1','BP-DEMO-N6-2026H1',50000,'post_consumer','SITE-PILOT','2026-05-12')`);
  await exec(`INSERT INTO credit_movements (balance_period, category, direction, mass_g, kind, reference, origin_site, movement, fresh_credit, effective_on) VALUES
    ('BP-PILOT-N6-2026H1','post_consumer','out',50000,'transfer_out','TRF-0001','SITE-PILOT','TRF-0001',false,'2026-05-12'),
    ('BP-DEMO-N6-2026H1','post_consumer','in',50000,'transfer_in','TRF-0001','SITE-PILOT','TRF-0001',false,'2026-05-12')`);

  await exec(`INSERT INTO carbon_methods (id, version, standard, functional_unit, boundary, allocation_basis, reviewer, published_on, primary_share_threshold_bp, data_quality, emission_factors, superseded) VALUES
    ('CM-PA6',1,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','quality@example.com','2025-11-10',5000,
     '{"sampling":"quarterly","verification":"annual"}','[{"line":"process_energy","source":"EcoBase 2025","year":2025}]',true),
    ('CM-PA6',2,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2026-01-20',5000,
     '{"sampling":"quarterly","verification":"annual","threshold_rule":"primary_share_bp below 5000 answers default_led true"}',
     '[{"line":"collection_and_transport","source":"Primary metering 2025","year":2025},{"line":"process_energy","source":"Primary metering 2025","year":2025},{"line":"reagents","source":"Supplier EPD","year":2025},{"line":"water_and_effluent","source":"Primary metering 2025","year":2025},{"line":"waste_and_residues","source":"EcoBase 2025","year":2025},{"line":"outbound_transport","source":"EcoBase 2025","year":2025},{"line":"byproduct_credit","source":"Primary metering 2025","year":2025}]',false)`);

  const breakdown = [
    ['collection_and_transport', 310000, 'primary'],
    ['process_energy', 1850000, 'primary'],
    ['reagents', 1180000, 'supplier_specific'],
    ['water_and_effluent', 240000, 'primary'],
    ['waste_and_residues', 330000, 'secondary'],
    ['outbound_transport', 410000, 'secondary'],
    ['byproduct_credit', -60000, 'primary']
  ];
  await exec(`INSERT INTO carbon_figures (lot, version, value_mg_per_kg, boundary, method_version, uncertainty_bp, primary_share_bp, breakdown, comparator,
      energy_location_mg_per_kg, energy_market_mg_per_kg, energy, computed_on, computed_by, input_versions, version_inputs) VALUES
    ('LOT-N6-0001',1,4260000,'cradle-to-gate',2,1200,6500,$1,$2,1850000,620000,$3,'2026-04-02','quality@example.com',$4,$5)`,
    [JSON.stringify(breakdown.map(([line, mg, tag]) => ({ line, mg_per_kg: mg, tag }))),
     JSON.stringify({ material: 'virgin PA6', dataset: 'EcoBase 2025', dataset_year: 2025, region: 'EU-27' }),
     JSON.stringify({ metered_kwh: 300000, retired_kwh: 250000, unmatched_kwh: 50000, location_mg_per_kg: 1850000, market_mg_per_kg: 620000 }),
     JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1', emission_factors: 'EcoBase 2025 + primary metering 2025' }),
     JSON.stringify({ carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1' })]);

  await exec(`INSERT INTO energy_instruments VALUES ('EAC-2026-0007',250000,2026,'EU-27','retired'),('EAC-2025-0031',100000,2025,'EU-27','held')`);
  await exec(`INSERT INTO energy_retirements (instrument, balance_period, retired_kwh, retired_on) VALUES ('EAC-2026-0007','BP-DEMO-N6-2026H1',250000,'2026-04-02')`);
}

export async function seedCommercial() {
  const specRows = [
    { property: 'relative_viscosity', method: 'ISO 307', limit: '2.40', unit: 'ratio', basis: 'guaranteed' },
    { property: 'moisture', method: 'ISO 15512', limit: '0.10', unit: 'percent', basis: 'guaranteed' },
    { property: 'yellowness_index', method: 'ASTM E313', limit: '8.0', unit: 'index', basis: 'typical' },
    { property: 'ash_content', method: 'ISO 3451-1', limit: '0.30', unit: 'percent', basis: 'informational' }
  ];
  const vr = { reference: 'virgin PA6 at relative viscosity 2.42', source: 'EcoBase 2025', dated: '2025-11-30' };
  await exec(`INSERT INTO specifications (id, version, issued_on, superseded, rows, virgin_reference) VALUES
    ('SPEC-N6',2,'2025-08-01',true,$1,$2),('SPEC-N6',3,'2026-02-01',false,$1,$2)`,
    [JSON.stringify(specRows), JSON.stringify(vr)]);

  await exec(`INSERT INTO customers (reference, party, contact, language) VALUES
    ('CUS-HELIOS','Helios Textiles','helios@example.com','en'),('CUS-VANTA','Vanta Automotive','vanta@example.com','en')`);
  await exec(`INSERT INTO specification_issues (specification, version, customer, issued_on) VALUES
    ('SPEC-N6',3,'CUS-HELIOS','2026-02-01'),('SPEC-N6',2,'CUS-VANTA','2025-08-01')`);
  await exec(`INSERT INTO conformances (customer, application, industry, specification, specification_version, trials, outcome) VALUES
    ('CUS-HELIOS','technical apparel yarn','textiles','SPEC-N6',3,'[{"trial":"yarn spinning","date":"2026-02-20","outcome":"passed"},{"trial":"dye uptake","date":"2026-03-01","outcome":"passed"}]','qualified'),
    ('CUS-VANTA','airbag fabric','automotive','SPEC-N6',2,'[{"trial":"tensile","date":"2025-09-15","outcome":"passed"}]','qualification_pending')`);

  await exec(`INSERT INTO contracts (id, recipient, site, period, committed_kg, floor_bp, delivered_kg, shortfall_consequence) VALUES
    ('CON-HELIOS-1','CUS-HELIOS','SITE-DEMO','2026-H1',200,5000,0,'a make-good volume in the following period'),
    ('CON-VANTA-1','CUS-VANTA','SITE-COMM','2029-H1',1000,3000,0,'a make-good volume in the following period')`);

  await exec(`INSERT INTO test_results (subject, property, method, instrument, analyst, value, unit, uncertainty_bp, method_mismatch, usable_for_release) VALUES
    ('LOT-N6-0001','relative_viscosity','ISO 307','VISC-02','analyst@example.com',2.46,'ratio',150,false,true),
    ('LOT-N6-0001','moisture','ISO 15512','KF-01','analyst@example.com',0.08,'percent',200,false,true),
    ('LOT-N6-0003','relative_viscosity','ISO 307','VISC-02','analyst@example.com',2.44,'ratio',150,false,true)`);

  await exec(`INSERT INTO certificate_sequences (site, next_number) VALUES ('SITE-PILOT',3),('SITE-DEMO',1)`);
}

export async function seedCertificates() {
  const conditions = [
    { condition: 'lot_released', satisfied: true, blocking_reference: null },
    { condition: 'no_open_deviation', satisfied: true, blocking_reference: null },
    { condition: 'no_unreviewed_override', satisfied: true, blocking_reference: null },
    { condition: 'period_closed', satisfied: true, blocking_reference: null },
    { condition: 'balance_invariant_holds', satisfied: true, blocking_reference: null },
    { condition: 'carbon_figure_complete', satisfied: true, blocking_reference: null },
    { condition: 'signer_scope_covers_site', satisfied: true, blocking_reference: null },
    { condition: 'signer_did_not_enter_data', satisfied: true, blocking_reference: null }
  ];
  const cert = (number, recipient, state, signedOn, provisional, contentBp) => [
    number, 1, 'SITE-PILOT', recipient, 'BP-PILOT-N6-2026H1', 'N6', 'SPEC-N6', 3, 'mass_balance', contentBp,
    JSON.stringify({ post_consumer: contentBp * 200 }), JSON.stringify([{ lot: 'LOT-N6-0003', mass_g: 200000 }]),
    'RCS-2026', 'REG-RAVEL-0042', JSON.stringify([{ property: 'relative_viscosity', method: 'ISO 307', value: 2.44, unit: 'ratio', uncertainty_bp: 150 }]),
    `This material is claimed by mass balance. It is not physically segregated.`,
    `You may not state that this material physically contains recycled content.`,
    'signer2@example.com', `${signedOn}T14:00:00Z`, `https://ravel.example.com/verify/${number}`, state, provisional,
    JSON.stringify(conditions), null, 6000
  ];
  const rows = [
    cert('CERT-PILOT-000001', 'CUS-HELIOS', 'withdrawn', '2026-03-02', true, 7500),
    cert('CERT-PILOT-000002', 'CUS-VANTA', 'issued', '2026-03-04', true, 7500)
  ];
  for (const r of rows) {
    await exec(`INSERT INTO certificates (number, version, site, recipient, period, grade, specification, specification_version, claim_type, content_bp,
        category_split, lots, scheme, registration, test_results, permitted_statement, prohibited_statement, signer, signed_at, verification_url, state,
        provisional_factor, conditions, carbon, primary_share_bp)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`, r);
  }
  await exec(`UPDATE certificates SET derived_resolutions=$1 WHERE number='CERT-PILOT-000001'`,
    [JSON.stringify({ withdrawn_on: '2026-04-18', withdrawn_by: 'signer2@example.com',
      withdrawal_reason: 'A collector category was corrected after acceptance',
      notified_recipients: [{ recipient: 'CUS-HELIOS', name: 'Helios Textiles', address: 'helios@example.com' }],
      void_statements: ['This material is claimed by mass balance. It is not physically segregated.',
        'You may not state that this material physically contains recycled content.'],
      derived_certificates: [], batch_traversal: [{ batch: 'BATCH-1001', certificates: [] }] })]);
}

export async function seedPublicAndInbound() {
  await exec(`INSERT INTO statistics (key, value, source, year, geography) VALUES
    ('textiles_recycled','Less than 1 per cent of textiles are recycled into new materials','Textile Flow Monitor',2024,'Global'),
    ('plastics_emissions','1.8 gigatonnes of carbon dioxide equivalent a year from plastics production','Global Materials Emissions Panel',2023,'Global'),
    ('textile_incineration','More than 8 per cent of textile waste is incinerated each year','Textile Flow Monitor',2024,'EU-27')`);
  await exec(`INSERT INTO positions (title, location, department, contract_type, closes_on) VALUES
    ('Process Engineer','Lyon, France','Operations','Permanent','2026-11-30')`);
  await exec(`INSERT INTO news_items (title, tag, outlet, date, link, language, coverage) VALUES
    ('Series A closes at 40 million euros','funding','Materials Weekly','2026-01-22','https://ravel.example.com/news/series-a','en','Series A coverage'),
    ('Offtake agreement signed for demonstration output','partnership','Fibre Report','2026-03-11','https://ravel.example.com/news/offtake','en','Offtake coverage'),
    ('Depolymerisation yield published','technical','Chimie Circulaire','2026-05-06','https://ravel.example.com/news/yield','fr','Publication technique')`);
  await exec(`INSERT INTO claim_substantiations (claim, route, first_published_on, evidence, method_version, approver, review_on) VALUES
    ('Virgin-quality recycled Nylon 6','/product','2026-01-15',$1,'CM-PA6 v2','quality@example.com','2026-12-31'),
    ('Low-carbon polymer production','/technology','2026-01-15',$2,'CM-PA6 v2','quality@example.com','2026-12-31')`,
    [JSON.stringify({ specification: 'SPEC-N6 v3', test_results: ['LOT-N6-0001 relative viscosity'], expires_on: '2026-12-31' }),
     JSON.stringify({ carbon_figure: 'LOT-N6-0001', comparator: 'virgin PA6, EcoBase 2025', expires_on: '2027-06-30' })]);

  await exec(`INSERT INTO inbound_records (reference, source, received_at, payload_verbatim, parsed) VALUES
    ('INB-0001','weighbridge','2026-02-20T06:14:00Z','{"device":"WB-DEMO-02","ticket":"WB-2026-0417","gross_g":135000,"tare_g":15000,"net_g":120000,"calibration":"lapsed"}','{"device":"WB-DEMO-02","net_g":120000}'),
    ('INB-0002','control_system','2026-03-04T22:41:00Z','{"run":"RUN-D-0001","temperature":165,"pressure":3,"residence_min":42}','{"run":"RUN-D-0001","temperature":165,"pressure":3}'),
    ('INB-0003','laboratory','2026-03-06T09:02:00Z','{"lot":"LOT-N6-0001","property":"relative_viscosity","method":"ISO 307","value":2.46,"uncertainty_bp":150}','{"lot":"LOT-N6-0001","value":2.46}')`);
}

export async function seedRecordChain() {
  const acts = [
    ['quality@example.com', 'SITE-DEMO', null, 'collector_approval_added', { collector: 'COL-ALDER', state: 'approved' }],
    ['quality@example.com', 'SITE-DEMO', null, 'collector_approval_added', { collector: 'COL-BRINE', state: 'approved' }],
    ['quality@example.com', 'SITE-DEMO', null, 'collector_approval_added', { collector: 'COL-CINDER', state: 'conditional', condition: 'Sampling plan for coated streams to be agreed' }],
    ['claims@example.com', 'SITE-DEMO', 'CF-DEMO-1', 'conversion_factor_published', { reference: 'CF-DEMO-1', factor_bp: 8000, derived_in_g: 1000000, derived_out_g: 800000 }],
    ['quality@example.com', 'SITE-DEMO', 'CM-PA6', 'carbon_method_version_published', { id: 'CM-PA6', version: 2, reviewer: 'Ilse Grootveld' }],
    ['plant@example.com', 'SITE-DEMO', 'BATCH-1001', 'batch_booked_in', { reference: 'BATCH-1001', category: 'post_consumer', net_g: 500000 }],
    ['plant@example.com', 'SITE-DEMO', 'BATCH-1002', 'batch_booked_in', { reference: 'BATCH-1002', category: 'pre_consumer', net_g: 300000 }],
    ['plant@example.com', 'SITE-DEMO', 'BATCH-1005', 'batch_booked_in', { reference: 'BATCH-1005', category: 'post_consumer', net_g: 100000, custody_links: 5 }],
    ['plant@example.com', 'SITE-DEMO', 'BATCH-1004', 'batch_booked_in', { reference: 'BATCH-1004', category: 'pre_consumer', net_g: 120000 }],
    ['quality@example.com', 'SITE-DEMO', 'COL-CINDER', 'finding_raised', { collector: 'COL-CINDER', detail: 'departure of 800 basis points' }],
    ['plant@example.com', 'SITE-DEMO', 'RUN-D-0001', 'run_started', { reference: 'RUN-D-0001', run_type: 'dissolution' }],
    ['plant@example.com', 'SITE-DEMO', 'RUN-D-0001', 'consumption_recorded', { run: 'RUN-D-0001', batch: 'BATCH-1001', mass_g: 300000, credit: { credit_g: 360000, category: 'post_consumer' } }],
    ['plant@example.com', 'SITE-DEMO', 'RUN-D-0001', 'consumption_recorded', { run: 'RUN-D-0001', batch: 'BATCH-1002', mass_g: 300000, credit: { credit_g: 240000, category: 'pre_consumer' } }],
    ['plant@example.com', 'SITE-DEMO', 'RUN-D-0001', 'run_closed', { run: 'RUN-D-0001', losses_g: 120000 }],
    ['plant@example.com', 'SITE-DEMO', 'RUN-R-0001', 'run_closed', { run: 'RUN-R-0001', losses_g: 20000 }],
    ['analyst@example.com', 'SITE-DEMO', 'LOT-N6-0001', 'test_result_recorded', { subject: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ISO 307', value: 2.46 }],
    ['quality@example.com', 'SITE-DEMO', 'LOT-N6-0002', 'deviation_raised', { reference: 'DEV-0001', lots: ['LOT-N6-0002'] }],
    ['quality@example.com', 'SITE-DEMO', 'OVR-0001', 'override_recorded', { reference: 'OVR-0001', separation: 'analyst_not_dispositioner', lot: 'LOT-N6-0001', authorised_by: 'quality@example.com' }],
    ['quality@example.com', 'SITE-DEMO', 'LOT-N6-0001', 'lot_disposition_set', { lot: 'LOT-N6-0001', disposition: 'released' }],
    ['signer2@example.com', 'SITE-PILOT', 'CERT-PILOT-000001', 'certificate_signed', { number: 'CERT-PILOT-000001', lot: 'LOT-N6-0003', recipient: 'CUS-HELIOS', content_bp: 7500 }],
    ['signer2@example.com', 'SITE-PILOT', 'CERT-PILOT-000002', 'certificate_signed', { number: 'CERT-PILOT-000002', lot: 'LOT-N6-0003', recipient: 'CUS-VANTA', content_bp: 7500 }],
    ['signer2@example.com', 'SITE-PILOT', 'CERT-PILOT-000001', 'certificate_withdrawn', { number: 'CERT-PILOT-000001', reason: 'A collector category was corrected after acceptance' }]
  ];
  for (const [person, site, object, act, content] of acts) {
    await entry(null, { person, site, object, act, content });
  }
  // the seeded legal hold stands on the signing of CERT-PILOT-000001
  const signing = await one(`SELECT seq FROM record_entries WHERE object='CERT-PILOT-000001' AND act='certificate_signed'`);
  if (signing) {
    await exec(`INSERT INTO legal_holds (seq, placed_on, placed_by) VALUES ($1,'2026-04-20','auditor@example.com')`, [Number(signing.seq)]);
    await entry(null, { person: 'auditor@example.com', site: 'SITE-PILOT', object: `HLD-0001`, act: 'legal_hold_placed', content: { hold_id: 1, seq: Number(signing.seq) } });
  }
}

export async function seedAll() {
  await seedBatches();
  await seedRuns();
  await seedLedgerAndArtifacts();
  await seedCommercial();
  await seedCertificates();
  await seedPublicAndInbound();
  await seedRecordChain();
}

seed.seedAll = seedAll;
