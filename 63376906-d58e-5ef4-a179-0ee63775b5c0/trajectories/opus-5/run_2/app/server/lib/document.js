// A certificate is a document readable without this system. It is plain text,
// its structure is real headings in order, and it is byte-stable: two reads of
// the same certificate version return identical bytes.

const rule = (ch = '=') => ch.repeat(72);
const bp = (v) => `${Math.floor(v / 100)}.${String(v % 100).padStart(2, '0')} per cent`;

export function renderDocument(c) {
  const L = [];
  const w = (s = '') => L.push(s);

  w('RAVEL MATERIALS SAS');
  w(rule('='));
  w('RECYCLED CONTENT CERTIFICATE');
  w();
  if (c.state === 'withdrawn' && c.withdrawal) {
    // A withdrawn certificate says withdrawn before it shows any figure.
    w('STATUS: WITHDRAWN');
    w(rule('-'));
    w(`This certificate was withdrawn on ${c.withdrawal.withdrawn_on}. Reason: ${c.withdrawal.reason}.`);
    w('The statements below are void and may no longer be made.');
    w();
  }

  w('1. CERTIFICATE');
  w(rule('-'));
  w(`Number                  ${c.number}`);
  w(`Version                 ${c.version}`);
  w(`Issued to               ${c.recipient_name} (${c.recipient})`);
  w(`Signed by               ${c.signer_name} (${c.signer})`);
  w(`Signed at               ${c.signed_at}`);
  w(`Site                    ${c.site}`);
  w(`Scheme                  ${c.scheme}`);
  w(`Producer registration   ${c.registration}`);
  w(`State                   ${c.state}`);
  w();

  w('2. CLAIM TYPE');
  w(rule('-'));
  w(`Claim type              ${c.claim_type}`);
  if (c.claim_type === 'mass_balance') {
    w('This material is claimed by mass balance. It is not physically segregated.');
  }
  w();

  w('3. RECYCLED CONTENT');
  w(rule('-'));
  w(`Recycled content        ${c.content_bp} basis points (${bp(c.content_bp)})`);
  w(`Claim type              ${c.claim_type}`);
  w(`Post-consumer           ${c.category_split.post_consumer || 0} g`);
  w(`Pre-consumer            ${c.category_split.pre_consumer || 0} g`);
  w(`Bookkeeping period      ${c.period}`);
  if (c.provisional_factor) {
    w('This certificate rests on a provisional conversion factor.');
  }
  w();

  w('4. MATERIAL');
  w(rule('-'));
  w(`Grade                   ${c.grade}`);
  w(`Specification version   ${c.specification_version}`);
  for (const l of c.lots) w(`Lot                     ${l.reference} at ${l.mass_g} g`);
  w();

  w('5. CARBON');
  w(rule('-'));
  w(`Carbon figure           ${c.carbon.value_mg_per_kg} mg CO2e per kg`);
  w(`Boundary                ${c.carbon.boundary}`);
  w(`Method version          ${c.carbon.method_version}`);
  w(`Uncertainty             ${c.carbon.uncertainty_bp} basis points`);
  w(`Primary data share      ${c.primary_share_bp} basis points`);
  if (c.carbon.comparator) {
    const cm = c.carbon.comparator;
    w(`Comparator              ${cm.material}, ${cm.dataset} ${cm.dataset_year}, ${cm.region}`);
    if (cm.comparator_mg_per_kg) {
      const rel = c.carbon.value_mg_per_kg < cm.comparator_mg_per_kg ? 'lower than' : 'higher than';
      w(`Comparison              ${rel} ${cm.material} from ${cm.dataset}`);
    }
  }
  w(`Energy, location-based  ${c.carbon.energy_location_mg_per_kg} mg CO2e per kg`);
  w(`Energy, market-based    ${c.carbon.energy_market_mg_per_kg} mg CO2e per kg`);
  w();
  w('   Carbon breakdown, attached:');
  for (const b of (c.carbon.breakdown || [])) {
    w(`   ${b.line.padEnd(26)} ${String(b.mg_per_kg).padStart(10)} mg/kg   ${b.tag}`);
  }
  w();

  w('6. TEST RESULTS');
  w(rule('-'));
  for (const t of (c.test_results || [])) {
    w(`${t.property.padEnd(22)}  ${t.value} ${t.unit} by ${t.method}, uncertainty ${t.uncertainty_bp} bp`);
  }
  w();

  // A statement is written on one line and never broken, so it survives as
  // words and no page break falls inside it.
  w('7. PERMITTED STATEMENT');
  w(rule('-'));
  w(c.permitted_statement);
  if (c.permitted_statement_recipient_language &&
      c.permitted_statement_recipient_language !== c.permitted_statement) {
    w();
    w(c.permitted_statement_recipient_language);
  }
  w();

  w('8. PROHIBITED STATEMENT');
  w(rule('-'));
  w(c.prohibited_statement);
  w();

  w('9. VERIFICATION');
  w(rule('-'));
  w(`Verify this certificate at ravel.example.com/verify/${c.number}.`);
  w(c.verification_url);
  w();
  w(rule('='));
  w('End of certificate.');
  return L.join('\n') + '\n';
}

