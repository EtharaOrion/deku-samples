/**
 * The certificate as a document readable without this system.
 *
 * Two reads of the same certificate version return identical bytes, so it is
 * built once at signing from the fields as they stood then and stored. Nothing
 * here reads the clock.
 */

const RULE = '='.repeat(72);
const THIN = '-'.repeat(72);

function pct(bp) {
  const whole = Math.floor(bp / 100);
  const frac = String(bp % 100).padStart(2, '0');
  return `${whole}.${frac} per cent`;
}

function wrap(text, width = 72) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line.length) line = w;
    else if (line.length + 1 + w.length <= width) line += ' ' + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

export function buildDocument(cert) {
  const L = [];
  const put = (s = '') => L.push(s);

  put(RULE);
  put('RAVEL MATERIALS SAS');
  put('RECYCLED CONTENT AND CARBON CERTIFICATE');
  put(RULE);
  put();
  if (cert.state === 'withdrawn') {
    // A withdrawn certificate says withdrawn before it shows any figure.
    put('WITHDRAWN');
    put(`This certificate was withdrawn on ${cert.withdrawn_on}. Reason: ${cert.withdrawal_reason}.`);
    put('It is retained and readable. It may not be relied upon.');
    put();
    put(THIN);
    put();
  }
  put('1. CERTIFICATE');
  put();
  put(`   Number                 ${cert.number}`);
  put(`   Version                ${cert.version}`);
  put(`   State                  ${cert.state}`);
  put(`   Site                   ${cert.site}`);
  put(`   Grade                  ${cert.grade}`);
  put(`   Scheme                 ${cert.scheme}`);
  put(`   Producer registration  ${cert.registration}`);
  put(`   Balance period         ${cert.period}`);
  put(`   Specification version  ${cert.grade} v${cert.specification_version}`);
  put();
  put('2. RECIPIENT');
  put();
  put(`   ${cert.recipient_name} (${cert.recipient})`);
  put();
  put('3. CLAIM TYPE');
  put();
  put(`   Claim type             ${cert.claim_type}`);
  if (cert.claim_type === 'mass_balance') {
    put('   This material is claimed by mass balance. It is not physically');
    put('   segregated.');
  }
  put();
  put('4. RECYCLED CONTENT');
  put();
  put(`   Recycled content       ${pct(cert.content_bp)} (${cert.content_bp} basis points)`);
  put(`   Claim type             ${cert.claim_type}`);
  put(`   Post-consumer          ${cert.category_split.post_consumer} g`);
  put(`   Pre-consumer           ${cert.category_split.pre_consumer} g`);
  if (cert.provisional_factor) {
    put('   Conversion factor      provisional');
    put('   This certificate rests on a provisional conversion factor.');
  }
  put();
  put('5. LOTS');
  put();
  for (const l of cert.lots) put(`   ${l.reference.padEnd(20)} ${String(l.mass_g).padStart(12)} g`);
  put();
  put('6. CARBON');
  put();
  put(`   Value                  ${cert.carbon.value_mg_per_kg} mg CO2e per kg of product`);
  put(`   Boundary               ${cert.carbon.boundary}`);
  put(`   Method version         ${cert.carbon.method_version}`);
  put(`   Uncertainty            ${cert.carbon.uncertainty_bp} basis points`);
  put(`   Primary data share     ${cert.primary_share_bp} basis points`);
  if (cert.carbon.comparator) {
    const cmp = cert.carbon.comparator;
    put(`   Comparator             ${cmp.material}, ${cmp.dataset} ${cmp.dataset_year}, ${cmp.region}`);
    if (cmp.value_mg_per_kg != null) {
      const lower = cert.carbon.value_mg_per_kg < cmp.value_mg_per_kg;
      put(`   Comparison             ${lower ? 'lower' : 'higher'} than ${cmp.material} in ${cmp.dataset} ${cmp.dataset_year}`);
    }
  }
  put(`   Energy, location-based ${cert.carbon.energy_location_mg_per_kg} mg CO2e per kg`);
  put(`   Energy, market-based   ${cert.carbon.energy_market_mg_per_kg} mg CO2e per kg`);
  put();
  put('   Breakdown, attached');
  for (const b of cert.carbon.breakdown || []) {
    put(`     ${b.line.padEnd(28)} ${String(b.mg_per_kg).padStart(10)}  ${b.tag}`);
  }
  put();
  put('7. TEST RESULTS');
  put();
  for (const t of cert.test_results || []) {
    put(`   ${t.property.padEnd(24)} ${String(t.value).padStart(8)} ${t.unit}  ${t.method}  +/- ${t.uncertainty_bp} bp`);
  }
  put();
  put('8. PERMITTED STATEMENT');
  put();
  for (const line of wrap(cert.permitted_statement, 68)) put('   ' + line);
  put();
  put('9. PROHIBITED STATEMENT');
  put();
  for (const line of wrap(cert.prohibited_statement, 68)) put('   ' + line);
  put();
  put('10. SIGNATURE');
  put();
  put(`   Signed by              ${cert.signer_name} (${cert.signer})`);
  put(`   Signed at              ${cert.signed_at}`);
  if (cert.state === 'withdrawn') {
    put(`   Withdrawn on           ${cert.withdrawn_on}`);
    put(`   Withdrawn by           ${cert.withdrawn_by}`);
    put(`   Withdrawal reason      ${cert.withdrawal_reason}`);
  }
  put();
  put(THIN);
  put(`Verify this certificate at ravel.example.com/verify/${cert.number}.`);
  put(RULE);
  return L.join('\n') + '\n';
}
