import { CUSTODY_KINDS } from '../../../shared/enums.js';
import { CALIBRATION_MONTHS, GRADE_N6, SITE_COMM, SITE_DEMO, SITE_PILOT } from '../constants.js';
import { instant, type Seeder } from './seeder.js';

const PLANT = 'plant@example.com';
const ANALYST = 'analyst@example.com';
const QUALITY = 'quality@example.com';

const CAPACITY_BASIS = '8000 hours per year, 0.90 availability, 0.80 yield';
const CAPACITY_REVISED_ON = '2026-06-30';

const SITES = [
  { reference: SITE_PILOT, name: 'Pilot', confidence: 'commissioned', nameplate_kg: 40000, contracted_kg: 24000, certified_from: '2025-10-01' },
  { reference: SITE_DEMO, name: 'Demonstration', confidence: 'commissioned', nameplate_kg: 400000, contracted_kg: 320000, certified_from: '2025-12-01' },
  { reference: SITE_COMM, name: 'Commercial', confidence: 'planned', nameplate_kg: 25000000, contracted_kg: 26000000, certified_from: null },
];

const COLLECTORS = [
  { reference: 'COL-ALDER', name: 'Alder Reclaim', country: 'PT', registration: 'WCR-PT-4471', registration_expiry: '2027-03-31', collection_site_types: ['municipal textile bank', 'sorting centre'], declared_streams: ['post-consumer nylon apparel', 'fishing nets'] },
  { reference: 'COL-BRINE', name: 'Brine Textile Recovery', country: 'NL', registration: 'WCR-NL-2208', registration_expiry: '2027-01-31', collection_site_types: ['sorting centre'], declared_streams: ['post-consumer nylon apparel'] },
  { reference: 'COL-CINDER', name: 'Cinder Industrial Offcuts', country: 'FR', registration: 'WCR-FR-6613', registration_expiry: '2026-12-31', collection_site_types: ['converter offcut collection'], declared_streams: ['pre-consumer nylon offcuts', 'coated technical fabric'] },
];

const PARTY_VERSIONS = [
  { reference: 'PV-ALDER-1', party: 'COL-ALDER', kind: 'collector', name: 'Alder Reclaim', effective_from: '2026-01-01' },
  { reference: 'PV-BRINE-1', party: 'COL-BRINE', kind: 'collector', name: 'Brine Textile Recovery', effective_from: '2026-01-01' },
  { reference: 'PV-BRINE-2', party: 'COL-BRINE', kind: 'collector', name: 'Brine Circular Materials', effective_from: '2026-08-01' },
  { reference: 'PV-CINDER-1', party: 'COL-CINDER', kind: 'collector', name: 'Cinder Industrial Offcuts', effective_from: '2026-01-01' },
  { reference: 'PV-HELIOS-1', party: 'CUS-HELIOS', kind: 'customer', name: 'Helios Textiles', effective_from: '2025-06-01', email: 'helios@example.com', application: 'technical apparel yarn', industry: 'textiles' },
  { reference: 'PV-VANTA-1', party: 'CUS-VANTA', kind: 'customer', name: 'Vanta Automotive', effective_from: '2025-06-01', email: 'vanta@example.com', application: 'airbag fabric', industry: 'automotive' },
];

const APPROVAL_PERIODS = [
  { reference: 'AP-ALDER-1', collector: 'COL-ALDER', state: 'approved', valid_from: '2026-01-01', valid_to: '2026-12-31', condition: null, condition_closes_on: null },
  { reference: 'AP-BRINE-1', collector: 'COL-BRINE', state: 'approved', valid_from: '2026-01-01', valid_to: '2026-06-30', condition: null, condition_closes_on: null },
  { reference: 'AP-BRINE-2', collector: 'COL-BRINE', state: 'lapsed', valid_from: '2026-07-01', valid_to: null, condition: null, condition_closes_on: null },
  { reference: 'AP-CINDER-1', collector: 'COL-CINDER', state: 'conditional', valid_from: '2026-01-01', valid_to: '2026-12-31', condition: 'Sampling plan for coated streams to be agreed', condition_closes_on: '2026-10-31' },
];

const WEIGHING_DEVICES = [
  { reference: 'WB-DEMO-01', site: SITE_DEMO, calibrated_on: '2026-05-01' },
  { reference: 'WB-DEMO-02', site: SITE_DEMO, calibrated_on: '2025-02-01' },
];

const DECLARED_COMPOSITION = { polymer: 'PA6', fraction_bp: 9200, basis: 'sampled' };
const CONTAMINATION = { non_nylon_bp: 800, elastane_bp: 400, coatings: 'none', colour_load: 'mixed', foreign_matter: 'none' };

const custodyChain = (collector: string, received_on: string, omit: string[] = []) =>
  CUSTODY_KINDS.filter((kind) => !omit.includes(kind)).map((kind) => ({ kind, on: received_on, party: collector }));

const BATCHES = [
  { reference: 'BATCH-1001', collector: 'COL-ALDER', category: 'post_consumer', received_on: '2026-02-10', net_g: 500000, moisture_bp: 1000, device: 'WB-DEMO-01', composition: DECLARED_COMPOSITION, omit: [] as string[] },
  { reference: 'BATCH-1002', collector: 'COL-ALDER', category: 'pre_consumer', received_on: '2026-02-12', net_g: 300000, moisture_bp: 0, device: 'WB-DEMO-01', composition: DECLARED_COMPOSITION, omit: [] as string[] },
  { reference: 'BATCH-1003', collector: 'COL-BRINE', category: 'post_consumer', received_on: '2026-07-05', net_g: 200000, moisture_bp: 500, device: 'WB-DEMO-01', composition: DECLARED_COMPOSITION, omit: [] as string[] },
  { reference: 'BATCH-1004', collector: 'COL-CINDER', category: 'pre_consumer', received_on: '2026-02-20', net_g: 120000, moisture_bp: 0, device: 'WB-DEMO-02', composition: { polymer: 'PA6', fraction_bp: 9900, basis: 'declared', measured_fraction_bp: 9100 }, omit: [] as string[] },
  { reference: 'BATCH-1005', collector: 'COL-ALDER', category: 'post_consumer', received_on: '2026-03-02', net_g: 100000, moisture_bp: 0, device: 'WB-DEMO-01', composition: DECLARED_COMPOSITION, omit: ['transport'] },
];

const TARE_G = 20000;

interface SetPoint {
  target: number;
  min: number;
  max: number;
}

export interface Recipe {
  set_points: Record<string, SetPoint>;
  reagents: string[];
  residence_time_min: number;
  released_by: string;
}

export const RECIPES: Record<string, Recipe> = {
  'RCP-DISS-2': { set_points: { temperature_c: { target: 165, min: 160, max: 170 }, pressure_bar: { target: 3, min: 2, max: 4 } }, reagents: ['solvent S-12', 'antioxidant AO-3'], residence_time_min: 240, released_by: QUALITY },
  'RCP-DEPO-4': { set_points: { temperature_c: { target: 210, min: 200, max: 220 }, pressure_bar: { target: 1, min: 1, max: 2 } }, reagents: ['catalyst K-7'], residence_time_min: 180, released_by: QUALITY },
  'RCP-PURI-1': { set_points: { temperature_c: { target: 95, min: 90, max: 100 }, pressure_bar: { target: 1, min: 1, max: 1 } }, reagents: ['activated carbon'], residence_time_min: 120, released_by: QUALITY },
  'RCP-REPO-3': { set_points: { temperature_c: { target: 255, min: 250, max: 260 }, pressure_bar: { target: 1, min: 1, max: 2 } }, reagents: ['chain regulator CR-1'], residence_time_min: 300, released_by: QUALITY },
};

interface SeedRun {
  reference: string;
  run_type: string;
  equipment: string;
  recipe_version: string;
  day: string;
  set_points_achieved: Record<string, number>;
  consumptions: [string, string, number][];
  outputs: [string, string, number, string | null][];
}

const RUNS: SeedRun[] = [
  { reference: 'RUN-D-0001', run_type: 'dissolution', equipment: 'DISS-1', recipe_version: 'RCP-DISS-2', day: '2026-03-04', set_points_achieved: { temperature_c: 165, pressure_bar: 3 }, consumptions: [['CON-0001', 'BATCH-1001', 300000], ['CON-0002', 'BATCH-1002', 300000]], outputs: [['OUT-D-0001', 'intermediate', 480000, null]] },
  { reference: 'RUN-D-0002', run_type: 'dissolution', equipment: 'DISS-1', recipe_version: 'RCP-DISS-2', day: '2026-03-05', set_points_achieved: { temperature_c: 166, pressure_bar: 3 }, consumptions: [['CON-0003', 'BATCH-1003', 190000], ['CON-0004', 'BATCH-1004', 120000]], outputs: [['OUT-D-0002', 'intermediate', 250000, null]] },
  { reference: 'RUN-D-0003', run_type: 'dissolution', equipment: 'DISS-1', recipe_version: 'RCP-DISS-2', day: '2026-03-06', set_points_achieved: { temperature_c: 164, pressure_bar: 3 }, consumptions: [['CON-0005', 'BATCH-1001', 150000]], outputs: [['OUT-D-0003', 'intermediate', 120000, null]] },
  { reference: 'RUN-Y-0001', run_type: 'depolymerisation', equipment: 'DEPO-1', recipe_version: 'RCP-DEPO-4', day: '2026-03-08', set_points_achieved: { temperature_c: 210, pressure_bar: 1 }, consumptions: [['CON-0006', 'OUT-D-0001', 480000], ['CON-0007', 'OUT-D-0002', 250000], ['CON-0008', 'OUT-D-0003', 120000]], outputs: [['OUT-Y-0001', 'intermediate', 800000, null]] },
  { reference: 'RUN-U-0001', run_type: 'purification', equipment: 'PURI-1', recipe_version: 'RCP-PURI-1', day: '2026-03-10', set_points_achieved: { temperature_c: 95, pressure_bar: 1 }, consumptions: [['CON-0009', 'OUT-Y-0001', 800000]], outputs: [['OUT-U-0001', 'intermediate', 720000, null], ['OUT-U-0002', 'byproduct', 40000, 'sold']] },
  { reference: 'RUN-R-0001', run_type: 'repolymerisation', equipment: 'REPO-1', recipe_version: 'RCP-REPO-3', day: '2026-03-12', set_points_achieved: { temperature_c: 255, pressure_bar: 1 }, consumptions: [['CON-0010', 'OUT-U-0001', 720000]], outputs: [['LOT-N6-0001', 'lot', 400000, null], ['LOT-N6-0002', 'lot', 300000, null]] },
];

const LOTS = [
  { reference: 'LOT-N6-0001', site: SITE_DEMO, mass_g: 400000, output: 'LOT-N6-0001', disposition: 'released', dispositioned_by: ANALYST, dispositioned_on: '2026-03-18', produced_on: '2026-03-12' },
  { reference: 'LOT-N6-0002', site: SITE_DEMO, mass_g: 300000, output: 'LOT-N6-0002', disposition: 'quarantined', dispositioned_by: QUALITY, dispositioned_on: '2026-03-14', produced_on: '2026-03-12' },
  { reference: 'LOT-N6-0003', site: SITE_PILOT, mass_g: 200000, output: null, disposition: 'released', dispositioned_by: QUALITY, dispositioned_on: '2026-02-27', produced_on: '2026-02-20' },
];

const OVERRIDE_REFERENCE = 'OVR-0001';

export async function seedOperations(s: Seeder): Promise<void> {
  for (const site of SITES) {
    const history = site.certified_from
      ? [{ state: 'certified', effective_from: site.certified_from, recorded_on: site.certified_from, reason: 'Initial certification under the scheme' }]
      : [];
    await s.insert('site', {
      reference: site.reference, name: site.name, confidence: site.confidence, nameplate_kg: site.nameplate_kg,
      contracted_kg: site.contracted_kg, capacity_basis: CAPACITY_BASIS, capacity_revised_on: CAPACITY_REVISED_ON, certification_history: history,
    });
    if (site.certified_from) {
      await s.act({ person: QUALITY, at: instant(site.certified_from), act: 'site.certify', object: site.reference, content: history[0] });
    }
  }

  for (const collector of COLLECTORS) {
    const { name: _name, ...row } = collector;
    await s.insert('collector', { ...row, scheme_status: 'registered' });
  }
  for (const version of PARTY_VERSIONS) {
    await s.insert('party_version', { ...version, recorded_by: QUALITY, recorded_at: instant(version.effective_from) });
    await s.act({ person: QUALITY, at: instant(version.effective_from), act: 'party.version', object: version.party, content: version });
  }
  for (const period of APPROVAL_PERIODS) {
    await s.insert('approval_period', { ...period, recorded_by: QUALITY, recorded_at: instant(period.valid_from), effective_on: period.valid_from });
    await s.act({ person: QUALITY, at: instant(period.valid_from), act: 'collector.approve', object: period.collector, content: period });
  }
  for (const device of WEIGHING_DEVICES) {
    await s.insert('weighing', { ...device, calibration_months: CALIBRATION_MONTHS });
  }

  for (const batch of BATCHES) {
    const custody = custodyChain(batch.collector, batch.received_on, batch.omit);
    const row = {
      reference: batch.reference, collector: batch.collector, site: SITE_DEMO, grade: GRADE_N6, category: batch.category,
      gross_g: batch.net_g + TARE_G, tare_g: TARE_G, net_g: batch.net_g, moisture_bp: batch.moisture_bp, moisture_method: 'ISO 15512',
      device: batch.device, received_on: batch.received_on, composition: batch.composition, contamination: CONTAMINATION, custody,
      booked_by: PLANT, event_at: instant(batch.received_on, '08:00:00'), recorded_at: instant(batch.received_on, '08:05:00'), effective_on: batch.received_on,
    };
    await s.insert('batch', row);
    await s.act({ person: PLANT, at: row.recorded_at, act: 'batch.book', object: batch.reference, content: row });
  }

  for (const run of RUNS) {
    const started_at = instant(run.day, '08:00:00');
    const ended_at = instant(run.day, '20:00:00');
    const consumed = run.consumptions.reduce((sum, [, , mass_g]) => sum + mass_g, 0);
    const produced = run.outputs.reduce((sum, [, , mass_g]) => sum + mass_g, 0);
    const row = {
      reference: run.reference, run_type: run.run_type, site: SITE_DEMO, equipment: run.equipment, recipe_version: run.recipe_version,
      recipe: RECIPES[run.recipe_version], set_points_achieved: run.set_points_achieved, operator: PLANT, started_at, ended_at,
      state: 'closed', losses_g: consumed - produced, closed_by: PLANT, event_at: started_at, recorded_at: started_at, effective_on: run.day,
    };
    await s.insert('run', row);
    await s.act({ person: PLANT, at: started_at, act: 'run.start', object: run.reference, content: { run_type: run.run_type, recipe_version: run.recipe_version, equipment: run.equipment } });
    let minute = 10;
    for (const [reference, input, mass_g] of run.consumptions) {
      const at = instant(run.day, `08:${String(minute).padStart(2, '0')}:00`);
      minute += 10;
      await s.insert('consumption', { reference, run: run.reference, input, mass_g, recorded_by: PLANT, event_at: at, recorded_at: at, effective_on: run.day });
      await s.act({ person: PLANT, at, act: 'run.consume', object: run.reference, content: { reference, input, mass_g } });
    }
    for (const [reference, kind, mass_g, disposition] of run.outputs) {
      const at = instant(run.day, '19:30:00');
      await s.insert('output', { reference, run: run.reference, kind, mass_g, disposition, recorded_by: PLANT, event_at: at, recorded_at: at, effective_on: run.day });
      await s.act({ person: PLANT, at, act: 'run.output', object: run.reference, content: { reference, kind, mass_g, disposition } });
    }
    await s.act({ person: PLANT, at: ended_at, act: 'run.close', object: run.reference, content: { ended_at, losses_g: consumed - produced, state: 'closed' } });
  }

  for (const lot of LOTS) {
    const dispositioned_at = instant(lot.dispositioned_on, '15:00:00');
    const row = {
      reference: lot.reference, grade: GRADE_N6, site: lot.site, mass_g: lot.mass_g, output: lot.output, components: [], sites: [lot.site],
      disposition: lot.disposition, claim_type: 'mass_balance', dispositioned_by: lot.dispositioned_by, dispositioned_at,
      produced_on: lot.produced_on, event_at: instant(lot.produced_on, '19:30:00'), recorded_at: instant(lot.produced_on, '19:30:00'), effective_on: lot.produced_on,
    };
    await s.insert('lot', row);
    await s.act({ person: lot.dispositioned_by, at: dispositioned_at, act: 'lot.disposition', object: lot.reference, content: { disposition: lot.disposition } });
  }

  const testAt = instant('2026-03-16', '10:30:00');
  const testResult = {
    reference: 'TR-0001', lot: 'LOT-N6-0001', batch: null, property: 'relative_viscosity', method: 'ISO 307', instrument: 'VISC-1', analyst: ANALYST,
    value: '2.41', unit: 'ratio', uncertainty_bp: 100, method_mismatch: false, usable_for_release: true, recorded_by: ANALYST,
    event_at: testAt, recorded_at: testAt, effective_on: '2026-03-16',
  };
  await s.insert('test_result', testResult);
  await s.act({ person: ANALYST, at: testAt, act: 'test_result.record', object: 'LOT-N6-0001', content: testResult });

  const deviations = [
    { reference: 'DEV-0001', description: 'Filter pressure excursion during purification', state: 'open', outcome: null, runs: ['RUN-U-0001'], lots: ['LOT-N6-0002'], raised_at: instant('2026-03-13', '11:00:00'), closed_at: null, effective_on: '2026-03-13' },
    { reference: 'DEV-0002', description: 'Unexpected colour in dissolution output', state: 'closed', outcome: 'cause_not_established', runs: ['RUN-D-0002'], lots: [], raised_at: instant('2026-03-06', '11:00:00'), closed_at: instant('2026-03-09', '16:00:00'), effective_on: '2026-03-06' },
  ];
  for (const deviation of deviations) {
    await s.insert('deviation', { ...deviation, raised_by: QUALITY, closed_by: deviation.closed_at ? QUALITY : null });
    await s.act({ person: QUALITY, at: deviation.raised_at, act: 'deviation.raise', object: deviation.reference, content: { description: deviation.description, runs: deviation.runs, lots: deviation.lots } });
    if (deviation.closed_at) {
      await s.act({ person: QUALITY, at: deviation.closed_at, act: 'deviation.close', object: deviation.reference, content: { outcome: deviation.outcome } });
    }
  }

  const overrideAt = instant('2026-03-18', '14:30:00');
  const override = {
    reference: OVERRIDE_REFERENCE, separation: 'analyst_not_dispositioner',
    reason: 'Night shift analyst dispositioned the lot because no second qualified person was on site',
    lot: 'LOT-N6-0001', authorised_by: QUALITY, authorised_on: '2026-03-18', reviewed: false, recorded_at: overrideAt,
  };
  await s.insert('override', override);
  await s.act({ person: QUALITY, at: overrideAt, act: 'override.authorise', object: 'LOT-N6-0001', content: override });
}
