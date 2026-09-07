import { formatBp } from './certificate.js';

// The document is readable without this system, as plain text, and byte-stable:
// two reads of the same certificate version return identical bytes.
export function renderDocument(payload) {
  const L = [];
  const rule = '='.repeat(72);
  const thin = '-'.repeat(72);
  L.push(rule);
  L.push('RAVEL MATERIALS SAS');
  L.push('CERTIFICATE OF RECYCLED CONTENT AND CARBON FOOTPRINT');
  L.push(rule);
  L.push('');
  if (payload.state === 'withdrawn') {
    // a withdrawn certificate says `withdrawn` before it shows any figure
    L.push('WITHDRAWN');
    L.push(`This certificate was withdrawn on ${payload.withdrawn_on}. Reason: ${payload.withdrawal_reason}.`);
    L.push('');
    L.push(thin);
    L.push('');
  }
  L.push(`Certificate number: ${payload.number}`);
  L.push(`Version: ${payload.version}`);
  L.push(`State: ${payload.state}`);
  L.push(`Issued on: ${payload.signed_at}`);
  L.push(`Site: ${payload.site} (${payload.site_name})`);
  L.push(`Scheme: ${payload.scheme}`);
  L.push(`Producer registration: ${payload.registration}`);
  L.push(`Recipient: ${payload.recipient_name}`);
  L.push('');
  L.push('1. CLAIM TYPE');
  L.push(thin);
  L.push(`Claim type: ${payload.claim_type}`);
  L.push('');
  L.push('2. RECYCLED CONTENT');
  L.push(thin);
  L.push(`Recycled content: ${formatBp(payload.content_bp)} per cent (${payload.content_bp} basis points)`);
  L.push(`Claim type: ${payload.claim_type}`);
  for (const [cat, mass] of Object.entries(payload.category_split || {})) {
    L.push(`  ${cat}: ${mass} g`);
  }
  L.push(`Bookkeeping period: ${payload.period}`);
  if (payload.provisional_factor) {
    L.push('This certificate rests on a provisional conversion factor.');
  }
  L.push('');
  L.push('3. LOTS');
  L.push(thin);
  for (const lot of payload.lots || []) {
    L.push(`  ${lot.reference}  ${lot.mass_g} g  grade ${lot.grade}  site ${lot.site}`);
  }
  L.push(`Grade: ${payload.grade}`);
  L.push(`Specification: ${payload.specification_version}`);
  L.push('');
  L.push('4. CARBON FOOTPRINT');
  L.push(thin);
  L.push(`Value: ${payload.carbon.value_mg_per_kg} mg CO2e per kg of product`);
  L.push(`Boundary: ${payload.carbon.boundary}`);
  L.push(`Method version: ${payload.carbon.method_version}`);
  L.push(`Uncertainty: ${payload.carbon.uncertainty_bp} basis points`);
  L.push(`Primary data share: ${payload.primary_share_bp} basis points`);
  L.push(`Comparator: ${payload.carbon.comparator.material}, ${payload.carbon.comparator.dataset} ${payload.carbon.comparator.dataset_year}, ${payload.carbon.comparator.region}`);
  if (payload.carbon.comparison_statement) L.push(payload.carbon.comparison_statement);
  L.push(`Energy, location-based: ${payload.carbon.energy_location_mg_per_kg} mg CO2e per kg`);
  L.push(`Energy, market-based: ${payload.carbon.energy_market_mg_per_kg} mg CO2e per kg`);
  L.push('');
  L.push('   Breakdown (attached):');
  for (const line of payload.carbon.breakdown_attached || payload.carbon.breakdown || []) {
    L.push(`     ${line.line}: ${line.mg_per_kg} mg/kg [${line.tag}]`);
  }
  L.push('');
  L.push('5. TEST RESULTS');
  L.push(thin);
  if (!(payload.test_results || []).length) L.push('  No test results are recorded against these lots.');
  for (const t of payload.test_results || []) {
    L.push(`  ${t.property}: ${t.value} ${t.unit} by ${t.method} (uncertainty ${t.uncertainty_bp} bp)`);
  }
  L.push('');
  L.push('6. PERMITTED STATEMENT');
  L.push(thin);
  for (const line of wrap(payload.permitted_statement, 72)) L.push(line);
  L.push('');
  L.push('7. PROHIBITED STATEMENT');
  L.push(thin);
  for (const line of wrap(payload.prohibited_statement, 72)) L.push(line);
  L.push('');
  L.push('8. SIGNATURE');
  L.push(thin);
  L.push(`Signed by: ${payload.signer_name} (${payload.signer})`);
  L.push(`Signed at: ${payload.signed_at}`);
  L.push('');
  L.push(`Verify this certificate at ravel.example.com/verify/${payload.number}.`);
  L.push(payload.verification_url);
  L.push(rule);
  L.push('');
  return L.join('\n');
}

function wrap(text, width) {
  if (!text) return [''];
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) { lines.push(line.trim()); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}
