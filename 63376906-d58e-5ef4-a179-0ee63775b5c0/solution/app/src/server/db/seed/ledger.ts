import { CARRY_OVER_LIMIT_BP, GRADE_N6, PRIMARY_THRESHOLD_BP, SITE_DEMO, SITE_PILOT, SITE_COMM } from '../constants.js';
import { instant, type Seeder } from './seeder.js';

const CLAIMS = 'claims@example.com';
const QUALITY = 'quality@example.com';
const SIGNER2 = 'signer2@example.com';
const AUDITOR = 'auditor@example.com';

const PERIOD_DEMO_CLOSED = 'BP-DEMO-N6-2025H2';
const PERIOD_DEMO_OPEN = 'BP-DEMO-N6-2026H1';
const PERIOD_PILOT_OPEN = 'BP-PILOT-N6-2026H1';

const PERIODS = [
  { reference: PERIOD_DEMO_CLOSED, site: SITE_DEMO, starts_on: '2025-07-01', ends_on: '2025-12-31', state: 'closed', closed_on: '2026-01-15', cut_off: '2026-01-10', closed_by: CLAIMS },
  { reference: PERIOD_DEMO_OPEN, site: SITE_DEMO, starts_on: '2026-01-01', ends_on: '2026-06-30', state: 'open', closed_on: null, cut_off: null, closed_by: null },
  { reference: PERIOD_PILOT_OPEN, site: SITE_PILOT, starts_on: '2026-01-01', ends_on: '2026-06-30', state: 'open', closed_on: null, cut_off: null, closed_by: null },
];

const CONVERSION_FACTORS = [
  { reference: 'CF-DEMO-1', site: SITE_DEMO, version: 1, factor_bp: 8000, derived_from: '2026-01-01', derived_to: '2026-03-31', derived_in_g: 1000000, derived_out_g: 800000, provisional: false, published_on: '2026-04-02' },
  { reference: 'CF-PILOT-1', site: SITE_PILOT, version: 1, factor_bp: 7500, derived_from: null, derived_to: null, derived_in_g: 0, derived_out_g: 0, provisional: true, published_on: '2026-01-05' },
];

const TRANSFER = { reference: 'TRF-0001', from_period: PERIOD_PILOT_OPEN, to_period: PERIOD_DEMO_OPEN, category: 'post_consumer', mass_g: 50000, on: '2026-05-12' };

const MOVEMENTS = [
  { reference: 'CRM-P-0001', period: PERIOD_PILOT_OPEN, category: 'post_consumer', kind: 'opening', mass_g: 200000, lot: null, batch: null, consumption: null, transfer: null, origin_site: null, on: '2026-01-01' },
  { reference: 'CRM-0001', period: PERIOD_DEMO_OPEN, category: 'post_consumer', kind: 'consumption_credit', mass_g: 240000, lot: null, batch: 'BATCH-1001', consumption: 'CON-0001', transfer: null, origin_site: null, on: '2026-03-04' },
  { reference: 'CRM-0002', period: PERIOD_DEMO_OPEN, category: 'pre_consumer', kind: 'consumption_credit', mass_g: 240000, lot: null, batch: 'BATCH-1002', consumption: 'CON-0002', transfer: null, origin_site: null, on: '2026-03-04' },
  { reference: 'CRM-0003', period: PERIOD_DEMO_OPEN, category: 'pre_consumer', kind: 'consumption_credit', mass_g: 96000, lot: null, batch: 'BATCH-1004', consumption: 'CON-0004', transfer: null, origin_site: null, on: '2026-03-05' },
  { reference: 'CRM-0004', period: PERIOD_DEMO_OPEN, category: 'post_consumer', kind: 'consumption_credit', mass_g: 120000, lot: null, batch: 'BATCH-1001', consumption: 'CON-0005', transfer: null, origin_site: null, on: '2026-03-06' },
  { reference: 'CRM-P-0002', period: PERIOD_PILOT_OPEN, category: 'post_consumer', kind: 'transfer_out', mass_g: 50000, lot: null, batch: null, consumption: null, transfer: TRANSFER.reference, origin_site: SITE_PILOT, on: TRANSFER.on },
  { reference: 'CRM-0005', period: PERIOD_DEMO_OPEN, category: 'post_consumer', kind: 'transfer_in', mass_g: 50000, lot: null, batch: null, consumption: null, transfer: TRANSFER.reference, origin_site: SITE_PILOT, on: TRANSFER.on },
];

export const CARBON_METHOD = 'CM-PA6';
const CARBON_METHOD_VERSIONS = [
  { version: '1', standard: 'ISO 14067', functional_unit: '1 kg of pellet', boundary: 'cradle-to-gate', allocation_basis: 'mass', reviewer: 'Ilse Grootveld', published_on: '2025-06-01', state: 'superseded', emission_factors: [{ source: 'EcoBase 2024', year: '2024' }] },
  { version: '2', standard: 'ISO 14067', functional_unit: '1 kg of pellet', boundary: 'cradle-to-gate', allocation_basis: 'mass', reviewer: 'Ilse Grootveld', published_on: '2026-01-20', state: 'current', emission_factors: [{ source: 'EcoBase 2025', year: '2025' }, { source: 'Grid mix EU-27 2024', year: '2024' }] },
];

const COMPARATOR = { material: 'virgin PA6', dataset: 'EcoBase 2025', dataset_year: '2025', region: 'EU-27' };

const CARBON_FIGURES = [
  {
    reference: 'CFG-0001', lot: 'LOT-N6-0001', uncertainty_bp: 1200, primary_share_bp: 6500, computed_on: '2026-03-15',
    breakdown: [
      { line: 'collection_and_transport', mg_per_kg: 310000, tag: 'primary' },
      { line: 'process_energy', mg_per_kg: 1850000, tag: 'primary' },
      { line: 'reagents', mg_per_kg: 1180000, tag: 'supplier_specific' },
      { line: 'water_and_effluent', mg_per_kg: 240000, tag: 'primary' },
      { line: 'waste_and_residues', mg_per_kg: 330000, tag: 'secondary' },
      { line: 'outbound_transport', mg_per_kg: 410000, tag: 'secondary' },
      { line: 'byproduct_credit', mg_per_kg: -60000, tag: 'primary' },
    ],
    energy: { energy_location_mg_per_kg: 1850000, energy_market_mg_per_kg: 620000, metered_kwh: 300000, retired_kwh: 250000, unmatched_kwh: 50000 },
  },
  {
    reference: 'CFG-0002', lot: 'LOT-N6-0003', uncertainty_bp: 1500, primary_share_bp: 6100, computed_on: '2026-02-25',
    breakdown: [
      { line: 'collection_and_transport', mg_per_kg: 330000, tag: 'primary' },
      { line: 'process_energy', mg_per_kg: 1950000, tag: 'primary' },
      { line: 'reagents', mg_per_kg: 1200000, tag: 'supplier_specific' },
      { line: 'water_and_effluent', mg_per_kg: 250000, tag: 'primary' },
      { line: 'waste_and_residues', mg_per_kg: 340000, tag: 'secondary' },
      { line: 'outbound_transport', mg_per_kg: 400000, tag: 'secondary' },
      { line: 'byproduct_credit', mg_per_kg: -60000, tag: 'primary' },
    ],
    energy: { energy_location_mg_per_kg: 1950000, energy_market_mg_per_kg: 700000, metered_kwh: 60000, retired_kwh: 0, unmatched_kwh: 60000 },
  },
];

const ENERGY_INSTRUMENTS = [
  { reference: 'EAC-2026-0007', quantity_kwh: 250000, vintage: '2026', region: 'EU-27', state: 'retired', period: PERIOD_DEMO_OPEN, retired_by: CLAIMS, retired_on: '2026-03-10' },
  { reference: 'EAC-2025-0031', quantity_kwh: 100000, vintage: '2025', region: 'EU-27', state: 'held', period: null, retired_by: null, retired_on: null },
];

const SPEC_PROPERTIES = [
  { property: 'relative_viscosity', method: 'ISO 307', limit: '2.40', unit: 'ratio', basis: 'guaranteed' },
  { property: 'moisture', method: 'ISO 15512', limit: '0.10', unit: 'percent', basis: 'guaranteed' },
  { property: 'yellowness_index', method: 'ASTM E313', limit: '8.0', unit: 'index', basis: 'typical' },
  { property: 'ash_content', method: 'ISO 3451-1', limit: '0.30', unit: 'percent', basis: 'informational' },
];
const VIRGIN_REFERENCE = { reference: 'virgin PA6 at relative viscosity 2.42', source: 'EcoBase 2025', date: '2025-11-30' };
const SPECIFICATIONS = [
  { version: '2', issued_on: '2025-09-01', state: 'superseded' },
  { version: '3', issued_on: '2026-02-01', state: 'current' },
];
const CONFORMANCES = [
  { reference: 'CNF-0001', customer: 'CUS-HELIOS', version: '3', issued_on: '2026-02-05' },
  { reference: 'CNF-0002', customer: 'CUS-VANTA', version: '2', issued_on: '2025-09-15' },
];

const CONTRACTS = [
  { reference: 'CON-HELIOS-1', customer: 'CUS-HELIOS', site: SITE_DEMO, period_label: '2026-H1', committed_kg: 200, floor_bp: 5000, delivered_kg: 0, shortfall_consequence: 'a make-good volume in the following period' },
  { reference: 'CON-VANTA-1', customer: 'CUS-VANTA', site: SITE_COMM, period_label: '2029-H1', committed_kg: 1000, floor_bp: 3000, delivered_kg: 0, shortfall_consequence: 'a make-good volume in the following period' },
];

const CERTIFICATE_WITHDRAWN = 'CERT-PILOT-000001';
const CERTIFICATES = [
  { number: CERTIFICATE_WITHDRAWN, recipient: 'CUS-HELIOS', signed_at: instant('2026-03-02', '10:00:00'), state: 'withdrawn', withdrawn_on: '2026-04-18', withdrawal_reason: 'A collector category was corrected after acceptance' },
  { number: 'CERT-PILOT-000002', recipient: 'CUS-VANTA', signed_at: instant('2026-03-20', '10:00:00'), state: 'issued', withdrawn_on: null, withdrawal_reason: null },
];

export async function seedLedger(s: Seeder): Promise<void> {
  for (const period of PERIODS) {
    await s.insert('balance_period', { ...period, grade: GRADE_N6, carry_over_limit_bp: CARRY_OVER_LIMIT_BP, allocation_basis: 'mass' });
    await s.act({ person: CLAIMS, at: instant(period.starts_on, '00:00:00'), act: 'period.open', object: period.reference, content: { site: period.site, starts_on: period.starts_on, ends_on: period.ends_on } });
    if (period.closed_on) {
      await s.act({ person: CLAIMS, at: instant(period.closed_on, '17:00:00'), act: 'period.close', object: period.reference, content: { closed_on: period.closed_on, cut_off: period.cut_off } });
    }
  }

  for (const factor of CONVERSION_FACTORS) {
    await s.insert('conversion_factor', { ...factor, published_by: CLAIMS, superseded_by: null, recorded_at: instant(factor.published_on) });
    await s.act({ person: CLAIMS, at: instant(factor.published_on), act: 'conversion_factor.publish', object: factor.reference, content: factor });
  }

  const { on: transferOn, ...transferRow } = TRANSFER;
  await s.insert('transfer', { ...transferRow, recorded_by: CLAIMS, event_at: instant(transferOn), recorded_at: instant(transferOn), effective_on: transferOn });
  for (const movement of MOVEMENTS) {
    const { on, ...row } = movement;
    await s.insert('credit_movement', { ...row, recorded_by: CLAIMS, event_at: instant(on, '12:00:00'), recorded_at: instant(on, '12:00:00'), effective_on: on });
  }
  await s.act({ person: CLAIMS, at: instant(TRANSFER.on), act: 'period.transfer', object: TRANSFER.reference, content: TRANSFER });

  for (const version of CARBON_METHOD_VERSIONS) {
    await s.insert('carbon_method', { reference: CARBON_METHOD, ...version, published_by: QUALITY, data_quality_rules: { primary_threshold_bp: PRIMARY_THRESHOLD_BP }, recorded_at: instant(version.published_on) });
    await s.act({ person: QUALITY, at: instant(version.published_on), act: 'carbon_method.publish', object: `${CARBON_METHOD}/${version.version}`, content: version });
  }

  for (const figure of CARBON_FIGURES) {
    const value_mg_per_kg = figure.breakdown.reduce((sum, line) => sum + line.mg_per_kg, 0);
    const row = {
      reference: figure.reference, lot: figure.lot, version: 1, method: CARBON_METHOD, method_version: '2', value_mg_per_kg,
      uncertainty_bp: figure.uncertainty_bp, primary_share_bp: figure.primary_share_bp, breakdown: figure.breakdown, energy: figure.energy,
      comparator: COMPARATOR, input_versions: { carbon_method: `${CARBON_METHOD}/2`, emission_factors: 'EcoBase 2025' }, reason: 'Initial computation',
      computed_by: QUALITY, computed_on: figure.computed_on, superseded_by: null, recorded_at: instant(figure.computed_on),
    };
    await s.insert('carbon_figure', row);
    await s.act({ person: QUALITY, at: instant(figure.computed_on), act: 'carbon_figure.compute', object: figure.lot, content: { reference: figure.reference, value_mg_per_kg, method_version: '2' } });
  }

  for (const instrument of ENERGY_INSTRUMENTS) {
    await s.insert('energy_instrument', { ...instrument, recorded_at: instant(instrument.retired_on ?? '2026-01-15') });
    if (instrument.retired_on) {
      await s.act({ person: CLAIMS, at: instant(instrument.retired_on), act: 'energy_instrument.retire', object: instrument.reference, content: instrument });
    }
  }

  for (const spec of SPECIFICATIONS) {
    await s.insert('specification', { grade: GRADE_N6, ...spec, properties: SPEC_PROPERTIES, virgin_reference: VIRGIN_REFERENCE, issued_by: QUALITY, recorded_at: instant(spec.issued_on) });
    await s.act({ person: QUALITY, at: instant(spec.issued_on), act: 'specification.publish', object: `${GRADE_N6}/${spec.version}`, content: spec });
  }
  for (const conformance of CONFORMANCES) {
    await s.insert('conformance', { ...conformance, grade: GRADE_N6, issued_by: QUALITY, recorded_at: instant(conformance.issued_on) });
    await s.act({ person: QUALITY, at: instant(conformance.issued_on), act: 'specification.issue', object: conformance.customer, content: conformance });
  }

  for (const contract of CONTRACTS) {
    await s.insert('contract', contract);
    await s.act({ person: CLAIMS, at: instant('2026-01-08'), act: 'contract.record', object: contract.reference, content: contract });
  }

  const [, pilotFigure] = CARBON_FIGURES;
  if (!pilotFigure) throw new Error('the pilot carbon figure is missing from the seed');
  const pilotValue = pilotFigure.breakdown.reduce((sum, line) => sum + line.mg_per_kg, 0);
  let holdSeq: number | null = null;
  for (const certificate of CERTIFICATES) {
    const row = {
      number: certificate.number, version: 1, site: SITE_PILOT, lot: 'LOT-N6-0003', lots: [{ reference: 'LOT-N6-0003', mass_g: 200000 }], grade: GRADE_N6,
      specification_version: '3', claim_type: 'mass_balance', content_bp: 7500, category_split: { post_consumer: 150000, pre_consumer: 0 },
      period: PERIOD_PILOT_OPEN,
      carbon: { value_mg_per_kg: pilotValue, boundary: 'cradle-to-gate', method_version: '2', uncertainty_bp: pilotFigure.uncertainty_bp },
      carbon_figure: pilotFigure.reference, primary_share_bp: pilotFigure.primary_share_bp, recipient: certificate.recipient, test_results: [],
      signer: SIGNER2, signed_at: certificate.signed_at, state: certificate.state, withdrawn_on: certificate.withdrawn_on,
      withdrawal_reason: certificate.withdrawal_reason, withdrawn_by: certificate.withdrawn_on ? SIGNER2 : null, provisional_factor: true,
      input_versions: { conversion_factor: 'CF-PILOT-1/1', carbon_method: `${CARBON_METHOD}/2`, carbon_figure: `${pilotFigure.reference}/1`, specification: `${GRADE_N6}/3` },
      supersedes: null, recorded_at: certificate.signed_at,
    };
    await s.insert('certificate', row);
    const signed = await s.act({ person: SIGNER2, at: certificate.signed_at, act: 'certificate.sign', object: certificate.number, content: { lot: row.lot, recipient: row.recipient, content_bp: row.content_bp, claim_type: row.claim_type } });
    if (certificate.number === CERTIFICATE_WITHDRAWN) holdSeq = signed.seq;
    if (certificate.withdrawn_on) {
      await s.act({ person: SIGNER2, at: instant(certificate.withdrawn_on, '09:30:00'), act: 'certificate.withdraw', object: certificate.number, content: { reason: certificate.withdrawal_reason, withdrawn_on: certificate.withdrawn_on } });
    }
  }

  if (holdSeq !== null) {
    const placedAt = instant('2026-04-20', '11:00:00');
    const hold = { reference: 'HLD-0001', seq: holdSeq, reason: 'Withdrawal under review by the scheme owner', placed_by: AUDITOR, placed_at: placedAt, lifted_by: null, lifted_at: null };
    await s.insert('legal_hold', hold);
    await s.act({ person: AUDITOR, at: placedAt, act: 'record.hold', object: String(holdSeq), content: hold });
  }
}
