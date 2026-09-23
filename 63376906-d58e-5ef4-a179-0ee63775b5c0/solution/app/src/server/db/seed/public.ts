import { GRADE_N6, REGISTRATION, SCHEME } from '../constants.js';
import { instant, type Seeder } from './seeder.js';

const PLANT = 'plant@example.com';
const CLAIMS = 'claims@example.com';

const STATISTICS = [
  { key: 'textiles_recycled', value: 'Less than 1 per cent of textiles are recycled into new materials', source: 'Textile Flow Monitor', year: '2024', geography: 'Global' },
  { key: 'plastics_emissions', value: '1.8 gigatonnes of carbon dioxide equivalent a year from plastics production', source: 'Global Materials Emissions Panel', year: '2023', geography: 'Global' },
  { key: 'textile_incineration', value: 'More than 8 per cent of textile waste is incinerated each year', source: 'Textile Flow Monitor', year: '2024', geography: 'EU-27' },
];

const POSITIONS = [
  { reference: 'POS-0001', title: 'Process Engineer', location: 'Lyon, France', department: 'Operations', contract_type: 'Permanent', closes_on: '2026-11-30', summary: 'Own the dissolution and depolymerisation stages of the demonstration plant, from recipe release to run close.' },
];

const NEWS = [
  { reference: 'NEWS-0001', title: 'Series A closes at 40 million euros', tag: 'funding', outlet: 'Materials Weekly', date: '2026-01-22', link: 'https://materials-weekly.example.com/ravel-series-a', language: 'en' },
  { reference: 'NEWS-0002', title: 'Offtake agreement signed for demonstration output', tag: 'partnership', outlet: 'Fibre Report', date: '2026-03-11', link: 'https://fibre-report.example.com/ravel-offtake', language: 'en' },
  { reference: 'NEWS-0003', title: 'Depolymerisation yield published', tag: 'technical', outlet: 'Chimie Circulaire', date: '2026-05-06', link: 'https://chimie-circulaire.example.com/ravel-rendement', language: 'fr' },
];

const CLAIM_SUBSTANTIATIONS = [
  { reference: 'CS-0001', claim: 'Recycled Nylon 6 claimed by mass balance', grade: GRADE_N6, claim_type: 'mass_balance', scheme: SCHEME, evidence: `Certificates issued under ${REGISTRATION} carry the conversion factor derivation, the balance period and the carbon figure with its boundary.`, recorded_on: '2026-02-01' },
  { reference: 'CS-0002', claim: 'Low-carbon relative to virgin PA6', grade: GRADE_N6, claim_type: 'mass_balance', scheme: SCHEME, evidence: 'Cradle-to-gate figure under ISO 14067 compared with the EcoBase 2025 virgin PA6 dataset for EU-27.', recorded_on: '2026-02-01' },
];

const INBOUND = [
  { reference: 'INB-0001', source: 'weighbridge', received_at: '2026-02-20T06:14:00Z', payload: { ticket: 'WB-DEMO-02-000381', device: 'WB-DEMO-02', gross_g: 140000, tare_g: 20000, net_g: 120000, batch: 'BATCH-1004' } },
  { reference: 'INB-0002', source: 'control_system', received_at: '2026-03-04T22:41:00Z', payload: { run: 'RUN-D-0001', temperature_c: 165, pressure_bar: 3, recipe_version: 'RCP-DISS-2' } },
  { reference: 'INB-0003', source: 'laboratory', received_at: '2026-03-06T09:02:00Z', payload: { lot: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ISO 307', value: '2.41', unit: 'ratio' } },
];

export async function seedPublic(s: Seeder): Promise<void> {
  for (const statistic of STATISTICS) await s.insert('statistic', statistic);
  for (const position of POSITIONS) await s.insert('position', position);
  for (const item of NEWS) await s.insert('news_item', item);
  for (const substantiation of CLAIM_SUBSTANTIATIONS) {
    await s.insert('claim_substantiation', substantiation);
    await s.act({ person: CLAIMS, at: instant(substantiation.recorded_on), act: 'claim.substantiate', object: substantiation.reference, content: substantiation });
  }
  for (const inbound of INBOUND) {
    const payload_verbatim = JSON.stringify(inbound.payload);
    await s.insert('inbound_record', { reference: inbound.reference, source: inbound.source, received_at: inbound.received_at, payload_verbatim, recorded_by: PLANT, recorded_at: inbound.received_at });
    await s.act({ person: PLANT, at: inbound.received_at, act: 'inbound.receive', object: inbound.reference, content: { source: inbound.source, received_at: inbound.received_at } });
  }
}
