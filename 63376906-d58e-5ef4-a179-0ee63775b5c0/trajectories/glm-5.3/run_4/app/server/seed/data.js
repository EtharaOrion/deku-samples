// Seed rows fixed by the brief. Data only; no derivation happens here.
export const SITES = [
  { reference: 'SITE-PILOT', name: 'Pilot', confidence: 'commissioned', certification_state: 'certified', nameplate_kg: 40000, contracted_kg: 24000 },
  { reference: 'SITE-DEMO', name: 'Demonstration', confidence: 'commissioned', certification_state: 'certified', nameplate_kg: 400000, contracted_kg: 320000 },
  { reference: 'SITE-COMM', name: 'Commercial', confidence: 'planned', certification_state: 'not_certified', nameplate_kg: 25000000, contracted_kg: 26000000 }
];
export const CAPACITY_BASIS = '8000 hours per year, 0.90 availability, 0.80 yield';
export const LAST_REVISED = '2026-06-30';

export const USERS = [
  { email: 'plant@example.com', name: 'Ines Bekele', role: 'plant_operator', sites: ['SITE-DEMO', 'SITE-PILOT'], grant_ends: '2027-06-30' },
  { email: 'analyst@example.com', name: 'Tomas Vlach', role: 'lab_analyst', sites: ['SITE-DEMO', 'SITE-PILOT'], grant_ends: '2027-06-30' },
  { email: 'quality@example.com', name: 'Marit Solheim', role: 'quality_manager', sites: ['SITE-DEMO', 'SITE-PILOT'], grant_ends: '2027-06-30' },
  { email: 'claims@example.com', name: 'Osei Danquah', role: 'claims_manager', sites: ['SITE-DEMO', 'SITE-PILOT'], grant_ends: '2027-06-30' },
  { email: 'signer@example.com', name: 'Hana Ferreira', role: 'certificate_signer', sites: ['SITE-DEMO', 'SITE-PILOT'], grant_ends: '2027-06-30' },
  { email: 'signer2@example.com', name: 'Pavel Ostrowski', role: 'certificate_signer', sites: ['SITE-PILOT'], grant_ends: '2027-06-30' },
  { email: 'auditor@example.com', name: 'Ruth Lindqvist', role: 'auditor', sites: ['SITE-DEMO', 'SITE-PILOT'], grant_ends: '2027-06-30' }
];

export const COLLECTORS = [
  { reference: 'COL-ALDER', name: 'Alder Reclaim', country: 'PT', registration: 'WCR-PT-4471', registration_expiry: '2027-03-31', site_types: ['kerbside', 'bring site'], streams: ['discarded fishing nets', 'post-consumer textiles'], scheme_status: 'verified' },
  { reference: 'COL-BRINE', name: 'Brine Textile Recovery', country: 'NL', registration: 'WCR-NL-2208', registration_expiry: '2027-01-31', site_types: ['industrial laundry'], streams: ['pre-consumer offcuts'], scheme_status: 'verified' },
  { reference: 'COL-CINDER', name: 'Cinder Industrial Offcuts', country: 'FR', registration: 'WCR-FR-6613', registration_expiry: '2026-12-31', site_types: ['factory collection'], streams: ['pre-consumer offcuts', 'coated fabric rolls'], scheme_status: 'verified' }
];

export const APPROVALS = [
  { collector: 'COL-ALDER', state: 'approved', valid_from: '2026-01-01', valid_to: '2026-12-31', condition: null, condition_closes_on: null },
  { collector: 'COL-BRINE', state: 'approved', valid_from: '2026-01-01', valid_to: '2026-06-30', condition: null, condition_closes_on: null },
  { collector: 'COL-CINDER', state: 'conditional', valid_from: '2026-01-01', valid_to: '2026-12-31', condition: 'Sampling plan for coated streams to be agreed', condition_closes_on: '2026-10-31' }
];

export const PARTY_VERSIONS = [
  { reference: 'COL-ALDER', name: 'Alder Reclaim', effective_from: '2026-01-01' },
  { reference: 'COL-BRINE', name: 'Brine Textile Recovery', effective_from: '2026-01-01' },
  { reference: 'COL-BRINE', name: 'Brine Circular Materials', effective_from: '2026-08-01' },
  { reference: 'COL-CINDER', name: 'Cinder Industrial Offcuts', effective_from: '2026-01-01' }
];

export const DEVICES = [
  { reference: 'WB-DEMO-01', site: 'SITE-DEMO', calibrated_on: '2026-05-01' },
  { reference: 'WB-DEMO-02', site: 'SITE-DEMO', calibrated_on: '2025-02-01' }
];

function custody(date, collector, device, omit) {
  const links = [
    { kind: 'collection_site', party: collector },
    { kind: 'collector', party: collector },
    { kind: 'transport', party: 'TRN-PT-001' },
    { kind: 'arrival', party: 'SITE-DEMO' },
    { kind: 'weighing', party: device },
    { kind: 'acceptance', party: 'SITE-DEMO' }
  ];
  return links.filter((l) => !(omit || []).includes(l.kind)).map((l) => ({ kind: l.kind, date, party: l.party }));
}

export const BATCHES = [
  { reference: 'BATCH-1001', collector: 'COL-ALDER', site: 'SITE-DEMO', grade: 'N6', category: 'post_consumer', net_g: 500000, gross_g: 515000, tare_g: 15000, moisture_bp: 1000, moisture_method: 'ISO 665', device: 'WB-DEMO-01', received_on: '2026-02-10', composition: [{ polymer: 'PA6', fraction_bp: 9200, basis: 'sampled', measured_fraction_bp: 9200, elastane_bp: 400 }], contamination: { non_nylon_bp: 300, elastane_bp: 400, coatings: 'none', colour_load: 'medium', foreign_matter: 'trace' }, custody: custody('2026-02-10', 'COL-ALDER', 'WB-DEMO-01'), claimable_from: '2026-02-10' },
  { reference: 'BATCH-1002', collector: 'COL-ALDER', site: 'SITE-DEMO', grade: 'N6', category: 'pre_consumer', net_g: 300000, gross_g: 312000, tare_g: 12000, moisture_bp: 0, moisture_method: 'ISO 665', device: 'WB-DEMO-01', received_on: '2026-02-12', composition: [{ polymer: 'PA6', fraction_bp: 9900, basis: 'declared', measured_fraction_bp: null, elastane_bp: 0 }], contamination: { non_nylon_bp: 100, elastane_bp: 0, coatings: 'none', colour_load: 'low', foreign_matter: 'none' }, custody: custody('2026-02-12', 'COL-ALDER', 'WB-DEMO-01'), claimable_from: '2026-02-12' },
  { reference: 'BATCH-1003', collector: 'COL-BRINE', site: 'SITE-DEMO', grade: 'N6', category: 'post_consumer', net_g: 200000, gross_g: 210000, tare_g: 10000, moisture_bp: 500, moisture_method: 'ISO 665', device: 'WB-DEMO-01', received_on: '2026-07-05', composition: [{ polymer: 'PA6', fraction_bp: 9500, basis: 'declared', measured_fraction_bp: null, elastane_bp: 0 }], contamination: { non_nylon_bp: 150, elastane_bp: 0, coatings: 'none', colour_load: 'low', foreign_matter: 'none' }, custody: custody('2026-07-05', 'COL-BRINE', 'WB-DEMO-01'), claimable_from: null },
  { reference: 'BATCH-1004', collector: 'COL-CINDER', site: 'SITE-DEMO', grade: 'N6', category: 'pre_consumer', net_g: 120000, gross_g: 128000, tare_g: 8000, moisture_bp: 0, moisture_method: 'ISO 665', device: 'WB-DEMO-02', received_on: '2026-02-20', composition: [{ polymer: 'PA6', fraction_bp: 9900, basis: 'declared', measured_fraction_bp: 9100, elastane_bp: 0 }], contamination: { non_nylon_bp: 100, elastane_bp: 0, coatings: 'coated backings present', colour_load: 'low', foreign_matter: 'none' }, custody: custody('2026-02-20', 'COL-CINDER', 'WB-DEMO-02'), claimable_from: '2026-02-20' },
  { reference: 'BATCH-1005', collector: 'COL-ALDER', site: 'SITE-DEMO', grade: 'N6', category: 'post_consumer', net_g: 100000, gross_g: 106000, tare_g: 6000, moisture_bp: 0, moisture_method: 'ISO 665', device: 'WB-DEMO-01', received_on: '2026-03-02', composition: [{ polymer: 'PA6', fraction_bp: 9300, basis: 'declared', measured_fraction_bp: null, elastane_bp: 0 }], contamination: { non_nylon_bp: 200, elastane_bp: 0, coatings: 'none', colour_load: 'low', foreign_matter: 'none' }, custody: custody('2026-03-02', 'COL-ALDER', 'WB-DEMO-01', ['transport']), claimable_from: null }
];

export const RECIPES = [
  { version: 'RCP-DISS-2', run_type: 'dissolution', set_points: [{ parameter: 'temperature_c', value: 165, unit: 'celsius', min: 160, max: 170 }, { parameter: 'pressure_bar', value: 3, unit: 'bar', min: 2, max: 4 }, { parameter: 'residence_minutes', value: 90, unit: 'minutes', min: 80, max: 100 }], reagents: [{ name: 'benzyl alcohol', ratio_bp: 4000 }], residence_time_minutes: 90, released_by: 'quality@example.com', released_on: '2025-11-14' },
  { version: 'RCP-DEPO-4', run_type: 'depolymerisation', set_points: [{ parameter: 'temperature_c', value: 280, unit: 'celsius', min: 270, max: 290 }, { parameter: 'pressure_bar', value: 12, unit: 'bar', min: 10, max: 14 }], reagents: [{ name: 'sodium hydroxide', ratio_bp: 800 }], residence_time_minutes: 150, released_by: 'quality@example.com', released_on: '2025-11-14' },
  { version: 'RCP-PURI-1', run_type: 'purification', set_points: [{ parameter: 'temperature_c', value: 95, unit: 'celsius', min: 90, max: 100 }], reagents: [{ name: 'activated carbon', ratio_bp: 300 }], residence_time_minutes: 60, released_by: 'quality@example.com', released_on: '2025-11-14' },
  { version: 'RCP-REPO-3', run_type: 'repolymerisation', set_points: [{ parameter: 'temperature_c', value: 260, unit: 'celsius', min: 250, max: 270 }], reagents: [{ name: 'caprolactam', ratio_bp: 9500 }], residence_time_minutes: 240, released_by: 'quality@example.com', released_on: '2025-11-14' }
];

export const RUNS = [
  { reference: 'RUN-D-0001', run_type: 'dissolution', site: 'SITE-DEMO', equipment: 'DISS-01', recipe_version: 'RCP-DISS-2', operator: 'plant@example.com', started_at: '2026-03-01T06:00:00Z', closed: true, closed_at: '2026-03-01T14:00:00Z', losses_g: 120000, set_points: [{ parameter: 'temperature_c', value: 165 }, { parameter: 'pressure_bar', value: 3 }], within_tolerance: true },
  { reference: 'RUN-D-0002', run_type: 'dissolution', site: 'SITE-DEMO', equipment: 'DISS-01', recipe_version: 'RCP-DISS-2', operator: 'plant@example.com', started_at: '2026-03-02T06:00:00Z', closed: true, closed_at: '2026-03-02T13:00:00Z', losses_g: 60000, set_points: [{ parameter: 'temperature_c', value: 163 }, { parameter: 'pressure_bar', value: 3 }], within_tolerance: true },
  { reference: 'RUN-D-0003', run_type: 'dissolution', site: 'SITE-DEMO', equipment: 'DISS-01', recipe_version: 'RCP-DISS-2', operator: 'plant@example.com', started_at: '2026-03-03T06:00:00Z', closed: true, closed_at: '2026-03-03T12:00:00Z', losses_g: 30000, set_points: [{ parameter: 'temperature_c', value: 168 }, { parameter: 'pressure_bar', value: 2 }], within_tolerance: true },
  { reference: 'RUN-Y-0001', run_type: 'depolymerisation', site: 'SITE-DEMO', equipment: 'DEPO-01', recipe_version: 'RCP-DEPO-4', operator: 'plant@example.com', started_at: '2026-03-04T06:00:00Z', closed: true, closed_at: '2026-03-04T18:00:00Z', losses_g: 50000, set_points: [{ parameter: 'temperature_c', value: 281 }, { parameter: 'pressure_bar', value: 12 }], within_tolerance: true },
  { reference: 'RUN-U-0001', run_type: 'purification', site: 'SITE-DEMO', equipment: 'PURI-01', recipe_version: 'RCP-PURI-1', operator: 'plant@example.com', started_at: '2026-03-05T06:00:00Z', closed: true, closed_at: '2026-03-05T16:00:00Z', losses_g: 40000, set_points: [{ parameter: 'temperature_c', value: 95 }], within_tolerance: true },
  { reference: 'RUN-R-0001', run_type: 'repolymerisation', site: 'SITE-DEMO', equipment: 'REPO-01', recipe_version: 'RCP-REPO-3', operator: 'plant@example.com', started_at: '2026-03-06T06:00:00Z', closed: true, closed_at: '2026-03-06T22:00:00Z', losses_g: 20000, set_points: [{ parameter: 'temperature_c', value: 262 }], within_tolerance: true }
];

export const CONSUMPTIONS = [
  { run: 'RUN-D-0001', batch: 'BATCH-1001', mass_g: 300000, effective_on: '2026-03-01' },
  { run: 'RUN-D-0001', batch: 'BATCH-1002', mass_g: 300000, effective_on: '2026-03-01' },
  { run: 'RUN-D-0002', batch: 'BATCH-1003', mass_g: 190000, effective_on: '2026-03-02' },
  { run: 'RUN-D-0002', batch: 'BATCH-1004', mass_g: 120000, effective_on: '2026-03-02' },
  { run: 'RUN-D-0003', batch: 'BATCH-1001', mass_g: 150000, effective_on: '2026-03-03' },
  { run: 'RUN-Y-0001', batch: 'OUT-D-0001', mass_g: 480000, effective_on: '2026-03-04' },
  { run: 'RUN-Y-0001', batch: 'OUT-D-0002', mass_g: 250000, effective_on: '2026-03-04' },
  { run: 'RUN-Y-0001', batch: 'OUT-D-0003', mass_g: 120000, effective_on: '2026-03-04' },
  { run: 'RUN-U-0001', batch: 'OUT-Y-0001', mass_g: 800000, effective_on: '2026-03-05' },
  { run: 'RUN-R-0001', batch: 'OUT-U-0001', mass_g: 720000, effective_on: '2026-03-06' }
];

export const OUTPUTS = [
  { reference: 'OUT-D-0001', run: 'RUN-D-0001', kind: 'intermediate', mass_g: 480000, disposition: null, lot: null },
  { reference: 'OUT-D-0002', run: 'RUN-D-0002', kind: 'intermediate', mass_g: 250000, disposition: null, lot: null },
  { reference: 'OUT-D-0003', run: 'RUN-D-0003', kind: 'intermediate', mass_g: 120000, disposition: null, lot: null },
  { reference: 'OUT-Y-0001', run: 'RUN-Y-0001', kind: 'intermediate', mass_g: 800000, disposition: null, lot: null },
  { reference: 'OUT-U-0001', run: 'RUN-U-0001', kind: 'intermediate', mass_g: 720000, disposition: null, lot: null },
  { reference: 'OUT-U-0002', run: 'RUN-U-0001', kind: 'byproduct', mass_g: 40000, disposition: 'sold', lot: null },
  { reference: 'LOT-N6-0001', run: 'RUN-R-0001', kind: 'lot', mass_g: 400000, disposition: null, lot: 'LOT-N6-0001' },
  { reference: 'LOT-N6-0002', run: 'RUN-R-0001', kind: 'lot', mass_g: 300000, disposition: null, lot: 'LOT-N6-0002' }
];

export const LOTS = [
  { reference: 'LOT-N6-0001', run: 'RUN-R-0001', site: 'SITE-DEMO', grade: 'N6', mass_g: 400000, disposition: 'released', claim_type: 'mass_balance', specification_version: '3', provisional_factor: false },
  { reference: 'LOT-N6-0002', run: 'RUN-R-0001', site: 'SITE-DEMO', grade: 'N6', mass_g: 300000, disposition: 'quarantined', claim_type: 'mass_balance', specification_version: '3', provisional_factor: false },
  { reference: 'LOT-N6-0003', run: 'RUN-R-0001', site: 'SITE-PILOT', grade: 'N6', mass_g: 200000, disposition: 'released', claim_type: 'mass_balance', specification_version: '3', provisional_factor: true }
];

export const TEST_RESULTS = [
  { lot: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ISO 307', instrument: 'VISC-02', analyst: 'analyst@example.com', value: '2.46', unit: 'ratio', uncertainty_bp: 400 },
  { lot: 'LOT-N6-0001', property: 'moisture', method: 'ISO 15512', instrument: 'MOIS-01', analyst: 'analyst@example.com', value: '0.08', unit: 'percent', uncertainty_bp: 300 },
  { lot: 'LOT-N6-0003', property: 'relative_viscosity', method: 'ISO 307', instrument: 'VISC-02', analyst: 'analyst@example.com', value: '2.41', unit: 'ratio', uncertainty_bp: 400 }
];

export const DEVIATIONS = [
  { reference: 'DEV-0001', runs: ['RUN-U-0001'], lots: ['LOT-N6-0002'], raised_by: 'quality@example.com', raised_at: '2026-03-06', description: 'Filtration pressure excursion on the purification stage upstream of LOT-N6-0002.', state: 'open', outcome: null },
  { reference: 'DEV-0002', runs: ['RUN-D-0002'], lots: [], raised_by: 'quality@example.com', raised_at: '2026-03-03', description: 'Dissolution off-spec colour carry-over; cause not established.', state: 'closed', outcome: 'cause_not_established' }
];

export const OVERRIDES = [
  { reference: 'OVR-0001', lot: 'LOT-N6-0001', separation: 'analyst_not_dispositioner', reason: 'Night shift analyst dispositioned the lot because no second qualified person was on site', authorised_by: 'quality@example.com', authorised_on: '2026-03-18', reviewed: false, reviewed_by: null, reviewed_on: null }
];

export const FACTORS = [
  { reference: 'CF-DEMO-1', site: 'SITE-DEMO', factor_bp: 8000, derived_from: '2026-01-01', derived_to: '2026-03-31', derived_in_g: 1000000, derived_out_g: 800000, provisional: false, published_by: 'claims@example.com', published_on: '2026-04-01' },
  { reference: 'CF-PILOT-1', site: 'SITE-PILOT', factor_bp: 7500, derived_from: null, derived_to: null, derived_in_g: 0, derived_out_g: 0, provisional: true, published_by: 'claims@example.com', published_on: '2026-02-01' }
];

export const BALANCE_PERIODS = [
  { id: 'BP-DEMO-N6-2025H2', site: 'SITE-DEMO', grade: 'N6', period_from: '2025-07-01', period_to: '2025-12-31', state: 'closed', carry_over_limit_bp: 2000, closed_on: '2026-01-15', cut_off: '2026-01-10', allocation_basis: 'mass' },
  { id: 'BP-DEMO-N6-2026H1', site: 'SITE-DEMO', grade: 'N6', period_from: '2026-01-01', period_to: '2026-06-30', state: 'open', carry_over_limit_bp: 2000, closed_on: null, cut_off: null, allocation_basis: 'mass' },
  { id: 'BP-PILOT-N6-2026H1', site: 'SITE-PILOT', grade: 'N6', period_from: '2026-01-01', period_to: '2026-06-30', state: 'open', carry_over_limit_bp: 2000, closed_on: null, cut_off: null, allocation_basis: 'mass' }
];

export const TRANSFERS = [
  { reference: 'TRF-0001', from_period: 'BP-PILOT-N6-2026H1', to_period: 'BP-DEMO-N6-2026H1', mass_g: 50000, category: 'post_consumer', moved_on: '2026-05-12' }
];

export const CARBON_METHODS = [
  { id: 'CM-PA6', version: 1, standard: 'ISO 14067', functional_unit: '1 kg of pellet', boundary: 'cradle-to-gate', allocation_basis: 'mass', reviewer: 'Ilse Grootveld', published_on: '2025-09-12', data_quality: { primary_threshold_bp: 5000, rules: ['Every factor names its source and year', 'A figure below the primary threshold is labelled default-led'] }, emission_factors: [{ line: 'process_energy', source: 'EcoBase', year: '2024' }, { line: 'reagents', source: 'Supplier EPD', year: '2024' }], primary_threshold_bp: 5000, superseded: true, superseded_on: '2026-01-20', published_by: 'quality@example.com' },
  { id: 'CM-PA6', version: 2, standard: 'ISO 14067', functional_unit: '1 kg of pellet', boundary: 'cradle-to-gate', allocation_basis: 'mass', reviewer: 'Ilse Grootveld', published_on: '2026-01-20', data_quality: { primary_threshold_bp: 5000, rules: ['Every factor names its source and year', 'A figure below the primary threshold is labelled default-led'] }, emission_factors: [{ line: 'collection_and_transport', source: 'EcoBase', year: '2025' }, { line: 'process_energy', source: 'EcoBase', year: '2025' }, { line: 'reagents', source: 'Supplier EPD', year: '2025' }, { line: 'water_and_effluent', source: 'EcoBase', year: '2025' }, { line: 'waste_and_residues', source: 'EcoBase', year: '2025' }, { line: 'outbound_transport', source: 'EcoBase', year: '2025' }, { line: 'byproduct_credit', source: 'Plant metering', year: '2025' }], primary_threshold_bp: 5000, superseded: false, superseded_on: null, published_by: 'quality@example.com' }
];

export const CARBON_FIGURES = [
  { lot: 'LOT-N6-0001', version: 1, value_mg_per_kg: 4260000, uncertainty_bp: 1200, primary_share_bp: 6500, method_id: 'CM-PA6', method_version: 2, boundary: 'cradle-to-gate', breakdown: [{ line: 'collection_and_transport', mg_per_kg: 310000, tag: 'primary' }, { line: 'process_energy', mg_per_kg: 1850000, tag: 'primary' }, { line: 'reagents', mg_per_kg: 1180000, tag: 'supplier_specific' }, { line: 'water_and_effluent', mg_per_kg: 240000, tag: 'primary' }, { line: 'waste_and_residues', mg_per_kg: 330000, tag: 'secondary' }, { line: 'outbound_transport', mg_per_kg: 410000, tag: 'secondary' }, { line: 'byproduct_credit', mg_per_kg: -60000, tag: 'primary' }], energy_location_mg_per_kg: 1850000, energy_market_mg_per_kg: 620000, comparator: { material: 'virgin PA6', dataset: 'EcoBase 2025', dataset_year: '2025', region: 'EU-27' }, input_versions: { carbon_method: 'CM-PA6 v2', conversion_factor: 'CF-DEMO-1', emission_factor_set: 'EcoBase 2025' }, computed_at: '2026-03-07' }
];

export const ENERGY_INSTRUMENTS = [
  { reference: 'EAC-2026-0007', quantity_kwh: 250000, vintage: '2026', region: 'EU-27', state: 'retired' },
  { reference: 'EAC-2025-0031', quantity_kwh: 100000, vintage: '2025', region: 'EU-27', state: 'held' }
];

export const ENERGY_RETIREMENTS = [
  { instrument: 'EAC-2026-0007', balance_period: 'BP-DEMO-N6-2026H1', retired_kwh: 250000, retired_on: '2026-05-02', retired_by: 'claims@example.com', consumption_vintage: '2026', consumption_region: 'EU-27' }
];

export const SPECIFICATIONS = [
  { id: 'SPEC-N6', version: 2, issued_on: '2025-08-01', rows: [{ property: 'relative_viscosity', method: 'ISO 307', limit: '2.38', unit: 'ratio', basis: 'guaranteed' }, { property: 'moisture', method: 'ISO 15512', limit: '0.12', unit: 'percent', basis: 'guaranteed' }], virgin_reference: { reference: 'virgin PA6 at relative viscosity 2.42', source: 'EcoBase 2025', dated: '2025-11-30' }, superseded: true },
  { id: 'SPEC-N6', version: 3, issued_on: '2026-02-01', rows: [{ property: 'relative_viscosity', method: 'ISO 307', limit: '2.40', unit: 'ratio', basis: 'guaranteed' }, { property: 'moisture', method: 'ISO 15512', limit: '0.10', unit: 'percent', basis: 'guaranteed' }, { property: 'yellowness_index', method: 'ASTM E313', limit: '8.0', unit: 'index', basis: 'typical' }, { property: 'ash_content', method: 'ISO 3451-1', limit: '0.30', unit: 'percent', basis: 'informational' }], virgin_reference: { reference: 'virgin PA6 at relative viscosity 2.42', source: 'EcoBase 2025', dated: '2025-11-30' }, superseded: false }
];

export const CUSTOMERS = [
  { reference: 'CUS-HELIOS', contact: 'helios@example.com', holds: { spec_id: 'SPEC-N6', version: 3 }, application: 'technical apparel yarn', industry: 'textiles' },
  { reference: 'CUS-VANTA', contact: 'vanta@example.com', holds: { spec_id: 'SPEC-N6', version: 2 }, application: 'airbag fabric', industry: 'automotive' }
];

export const CONFORMANCES = [
  { customer: 'CUS-HELIOS', spec_id: 'SPEC-N6', spec_version: 3, application: 'technical apparel yarn', trials: [{ property: 'relative_viscosity', date: '2026-02-20', outcome: 'pass' }], outcome: 'qualified' },
  { customer: 'CUS-VANTA', spec_id: 'SPEC-N6', spec_version: 2, application: 'airbag fabric', trials: [{ property: 'relative_viscosity', date: '2025-09-14', outcome: 'pass' }], outcome: 'qualified' }
];

export const CONTRACTS = [
  { id: 'CON-HELIOS-1', recipient: 'CUS-HELIOS', site: 'SITE-DEMO', period: '2026-H1', committed_kg: 200, floor_bp: 5000, delivered_kg: 0, shortfall_consequence: 'a make-good volume in the following period', unreachable_on: null, unreachable_allocation: null },
  { id: 'CON-VANTA-1', recipient: 'CUS-VANTA', site: 'SITE-COMM', period: '2029-H1', committed_kg: 1000, floor_bp: 3000, delivered_kg: 0, shortfall_consequence: 'a make-good volume in the following period', unreachable_on: null, unreachable_allocation: null }
];

export const CERTIFICATES = [
  { number: 'CERT-PILOT-000001', version: 1, site: 'SITE-PILOT', lots: [{ reference: 'LOT-N6-0003', mass_g: 200000 }], grade: 'N6', specification_version: '3', claim_type: 'mass_balance', content_bp: 7500, category_split: { post_consumer: 10000 }, balance_period: 'BP-PILOT-N6-2026H1', primary_share_bp: 6500, scheme: 'RCS-2026', registration: 'REG-RAVEL-0042', signer: 'signer2@example.com', signed_at: '2026-03-02T10:00:00Z', state: 'withdrawn', recipient: 'CUS-HELIOS', recipient_name: 'Helios', provisional_factor: true, withdrawn_on: '2026-04-18', withdrawn_by: 'signer2@example.com', withdrawal_reason: 'A collector category was corrected after acceptance', notified_recipients: [{ reference: 'CUS-HELIOS', name: 'Helios' }], void_statements: ['This material contains 75 per cent recycled content.', 'This material is physically segregated recycled nylon.'], derived_certificates: [], batch_traversal: { batches: ['BATCH-1001', 'BATCH-1002', 'BATCH-1003', 'BATCH-1004'], certificates: ['CERT-PILOT-000001'] } },
  { number: 'CERT-PILOT-000002', version: 1, site: 'SITE-PILOT', lots: [{ reference: 'LOT-N6-0003', mass_g: 200000 }], grade: 'N6', specification_version: '3', claim_type: 'mass_balance', content_bp: 7500, category_split: { post_consumer: 10000 }, balance_period: 'BP-PILOT-N6-2026H1', primary_share_bp: 6500, scheme: 'RCS-2026', registration: 'REG-RAVEL-0042', signer: 'signer2@example.com', signed_at: '2026-03-02T11:00:00Z', state: 'issued', recipient: 'CUS-VANTA', recipient_name: 'Vanta', provisional_factor: true, withdrawn_on: null, withdrawn_by: null, withdrawal_reason: null, notified_recipients: null, void_statements: null, derived_certificates: null, batch_traversal: null }
];

export const INBOUND = [
  { source: 'weighbridge', received_at: '2026-02-20T06:14:00Z', payload: { device: 'WB-DEMO-02', batch: 'BATCH-1004', ticket: 'WB-2026-0431', gross_g: 128000, tare_g: 8000, calibration_state: 'lapsed' } },
  { source: 'control_system', received_at: '2026-03-04T22:41:00Z', payload: { run: 'RUN-D-0001', set_points: [{ parameter: 'temperature_c', value: 165 }, { parameter: 'pressure_bar', value: 3 }] } },
  { source: 'laboratory', received_at: '2026-03-06T09:02:00Z', payload: { lot: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ISO 307', value: '2.46', unit: 'ratio' } }
];

export const STATISTICS = [
  { key: 'textiles_recycled', value: 'Less than 1 per cent of textiles are recycled into new materials', source: 'Textile Flow Monitor', year: '2024', geography: 'Global' },
  { key: 'plastics_emissions', value: '1.8 gigatonnes of carbon dioxide equivalent a year from plastics production', source: 'Global Materials Emissions Panel', year: '2023', geography: 'Global' },
  { key: 'textile_incineration', value: 'More than 8 per cent of textile waste is incinerated each year', source: 'Textile Flow Monitor', year: '2024', geography: 'EU-27' }
];

export const POSITIONS = [
  { title: 'Process Engineer', location: 'Lyon, France', department: 'Operations', contract_type: 'Permanent', closes_on: '2026-11-30' }
];

export const NEWS = [
  { title: 'Series A closes at 40 million euros', tag: 'funding', outlet: 'Materials Weekly', dated: '2026-01-22', link: 'https://ravel.example.com/news/series-a', language: 'en' },
  { title: 'Offtake agreement signed for demonstration output', tag: 'partnership', outlet: 'Fibre Report', dated: '2026-03-11', link: 'https://ravel.example.com/news/offtake', language: 'en' },
  { title: 'Depolymerisation yield published', tag: 'technical', outlet: 'Chimie Circulaire', dated: '2026-05-06', link: 'https://ravel.example.com/news/yield', language: 'fr' }
];

export const CLAIM_SUBSTANTIATIONS = [
  { claim: 'Low-carbon virgin-quality recycled nylon 6', route: '/product', first_published: '2026-01-15', evidence: [{ kind: 'carbon figure', reference: 'LOT-N6-0001' }, { kind: 'carbon method version', reference: 'CM-PA6 v2' }], method_version: 'CM-PA6 v2', approver: 'quality@example.com', review_on: '2027-01-15' },
  { claim: 'Less than 1 per cent of textiles are recycled into new materials', route: '/about', first_published: '2026-01-15', evidence: [{ kind: 'statistic', reference: 'textiles_recycled' }], method_version: 'n/a', approver: 'quality@example.com', review_on: '2027-01-15' }
];

export const RETENTION = { scheme_months: 120, statutory_months: 84 };

export const ENQUIRY_TYPES = [
  { type: 'waste_supply', destination: 'feedstock@example.com', response_days: 3, retention_months: 36 },
  { type: 'polymer_purchase', destination: 'sales@example.com', response_days: 2, retention_months: 36 },
  { type: 'partnership', destination: 'partners@example.com', response_days: 5, retention_months: 24 },
  { type: 'press', destination: 'press@example.com', response_days: 1, retention_months: 12 }
];

export const PRIVACY = {
  controller: 'Ravel Materials SAS',
  address: '12 Rue de la Chimie Verte, 69003 Lyon, France',
  rights_address: 'privacy@example.com',
  disclosure_address: 'security@example.com',
  retention: {
    enquiry: 24,
    waste_supply_enquiry: 36,
    polymer_enquiry: 36,
    press_enquiry: 12,
    account_and_acts: 120,
    record: 180
  }
};
