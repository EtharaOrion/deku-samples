// A certificate is a document readable without this system, an object at a permanent address,
// and a permission stating what the recipient may and may not say. Every field is derived;
// the only free text is a withdrawal reason.

const CLAIM_WORDS = {
  en: {
    physically_segregated: 'physically segregated',
    controlled_blending: 'controlled blending',
    mass_balance: 'mass balance'
  },
  fr: {
    physically_segregated: 'physiquement séparé',
    controlled_blending: 'mélange contrôlé',
    mass_balance: 'bilan massique'
  }
};

const pct = (bp) => `${Math.floor(bp / 100)}.${String(bp % 100).padStart(2, '0')} per cent`;
const pctFr = (bp) => `${Math.floor(bp / 100)},${String(bp % 100).padStart(2, '0')} pour cent`;

/** Generated from the claim type, the percentage and the category split, in the recipient's language. */
export function statements({ claim_type, content_bp, category_split, grade, language = 'en' }) {
  const split = Object.entries(category_split || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k.replace('_', '-')} ${v} g`)
    .join(', ') || 'none';

  if (language === 'fr') {
    const permitted = claim_type === 'mass_balance'
      ? `Ce matériau ${grade} porte une teneur recyclée de ${pctFr(content_bp)} attribuée par bilan massique (${split}). Vous pouvez déclarer une teneur recyclée de ${pctFr(content_bp)} attribuée par bilan massique.`
      : `Ce matériau ${grade} porte une teneur recyclée de ${pctFr(content_bp)} (${split}). Vous pouvez déclarer une teneur recyclée de ${pctFr(content_bp)}.`;
    const prohibited = claim_type === 'mass_balance'
      ? `Vous ne pouvez pas déclarer que ce matériau contient physiquement de la matière recyclée. Ce matériau est revendiqué par bilan massique. Il n'est pas physiquement séparé.`
      : `Vous ne pouvez pas déclarer une teneur recyclée supérieure à ${pctFr(content_bp)}, ni la déclarer pour un autre matériau.`;
    return { permitted_statement: permitted, prohibited_statement: prohibited };
  }

  const permitted = claim_type === 'mass_balance'
    ? `This ${grade} material carries ${pct(content_bp)} recycled content allocated by mass balance (${split}). You may state that this material carries ${pct(content_bp)} recycled content allocated by mass balance.`
    : `This ${grade} material carries ${pct(content_bp)} recycled content under ${CLAIM_WORDS.en[claim_type]} (${split}). You may state that this material carries ${pct(content_bp)} recycled content.`;
  const prohibited = claim_type === 'mass_balance'
    ? `You may not state that this material physically contains recycled content. This material is claimed by mass balance. It is not physically segregated.`
    : `You may not state a recycled content higher than ${pct(content_bp)}, and you may not apply this statement to any other material.`;
  return { permitted_statement: permitted, prohibited_statement: prohibited };
}

/**
 * The document as plain text. Real headings in order, so a reader moving by heading reaches
 * the claim type before the percentage. Byte-stable: two reads return identical bytes.
 */
export function renderDocument(cert) {
  const L = [];
  const rule = '='.repeat(72);
  const thin = '-'.repeat(72);
  L.push(rule);
  L.push(`RECYCLED CONTENT CERTIFICATE ${cert.number}`);
  L.push(rule);
  L.push('');
  if (cert.state === 'withdrawn' && cert.withdrawal) {
    L.push('STATUS');
    L.push(thin);
    L.push('WITHDRAWN');
    L.push(`This certificate was withdrawn on ${cert.withdrawal.withdrawn_on}. Reason: ${cert.withdrawal.reason}.`);
    L.push('');
  }
  L.push('1. ISSUER');
  L.push(thin);
  L.push('Producer         : Ravel Materials SAS');
  L.push(`Registration     : ${cert.registration}`);
  L.push(`Scheme           : ${cert.scheme}`);
  L.push(`Site             : ${cert.site}`);
  L.push('');
  L.push('2. RECIPIENT');
  L.push(thin);
  L.push(`Recipient        : ${cert.recipient_name}`);
  L.push(`Reference        : ${cert.recipient}`);
  L.push('');
  L.push('3. CLAIM TYPE');
  L.push(thin);
  L.push(`Claim type       : ${CLAIM_WORDS.en[cert.claim_type]} (${cert.claim_type})`);
  if (cert.claim_type === 'mass_balance') {
    L.push('This material is claimed by mass balance. It is not physically segregated.');
  }
  L.push('');
  L.push('4. RECYCLED CONTENT');
  L.push(thin);
  L.push(`Recycled content : ${cert.content_bp} basis points (${pct(cert.content_bp)})`);
  L.push(`Claim type       : ${cert.claim_type}`);
  for (const [k, v] of Object.entries(cert.category_split || {})) {
    L.push(`  ${k.padEnd(15)}: ${v} g`);
  }
  L.push(`Grade            : ${cert.grade}`);
  L.push(`Specification    : ${cert.grade} version ${cert.specification_version}`);
  L.push(`Bookkeeping period: ${cert.period}`);
  if (cert.provisional_factor) {
    L.push('This certificate rests on a provisional conversion factor.');
  }
  L.push('');
  L.push('5. LOTS');
  L.push(thin);
  for (const l of cert.lots || []) {
    L.push(`  ${l.reference.padEnd(18)} ${String(l.mass_g).padStart(12)} g`);
  }
  L.push('');
  L.push('6. CARBON');
  L.push(thin);
  L.push(`Value            : ${cert.carbon.value_mg_per_kg} mg CO2e per kg`);
  L.push(`Boundary         : ${cert.carbon.boundary}`);
  L.push(`Method version   : ${cert.carbon.method_version}`);
  L.push(`Uncertainty      : ${cert.carbon.uncertainty_bp} basis points`);
  L.push(`Primary share    : ${cert.primary_share_bp} basis points`);
  if (cert.carbon.comparator) {
    L.push(`Comparator       : ${cert.carbon.comparator.material}, ${cert.carbon.comparator.dataset} ${cert.carbon.comparator.dataset_year}, ${cert.carbon.comparator.region}`);
    L.push(`This figure is lower than ${cert.carbon.comparator.material} from ${cert.carbon.comparator.dataset}.`);
  }
  L.push(`Energy, location : ${cert.carbon.energy_location_mg_per_kg} mg CO2e per kg`);
  L.push(`Energy, market   : ${cert.carbon.energy_market_mg_per_kg} mg CO2e per kg`);
  L.push('The emissions breakdown is attached to this certificate as a separate schedule.');
  L.push('');
  L.push('7. TEST RESULTS');
  L.push(thin);
  if (!(cert.test_results || []).length) {
    L.push('No test result is recorded against this certificate.');
  }
  for (const t of cert.test_results || []) {
    L.push(`  ${String(t.property).padEnd(22)} ${String(t.value).padStart(10)} ${t.unit}   ${t.method}`);
  }
  L.push('');
  L.push('8. PERMITTED STATEMENT');
  L.push(thin);
  for (const line of wrap(cert.permitted_statement, 72)) L.push(line);
  L.push('');
  L.push('9. PROHIBITED STATEMENT');
  L.push(thin);
  for (const line of wrap(cert.prohibited_statement, 72)) L.push(line);
  L.push('');
  L.push('10. SIGNATURE');
  L.push(thin);
  L.push(`Signed by        : ${cert.signer_name} (${cert.signer})`);
  L.push(`Signed at        : ${cert.signed_at}`);
  L.push(`Version          : ${cert.version}`);
  L.push('');
  L.push(`Verify this certificate at ravel.example.com/verify/${cert.number}.`);
  L.push(rule);
  return L.join('\n') + '\n';
}

function wrap(text, width) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) { lines.push(line.trim()); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}

/** Every downstream statement the recipient was permitted to make. */
export function voidStatements(cert) {
  return [
    cert.permitted_statement,
    `That lot ${(cert.lots || []).map((l) => l.reference).join(', ')} carries a recycled content claim of ${cert.content_bp} basis points.`,
    `That certificate ${cert.number} supports a ${cert.claim_type} claim for ${cert.recipient_name}.`,
    `That the carbon figure of ${cert.carbon.value_mg_per_kg} mg CO2e per kg applies to material supplied under this certificate.`
  ];
}
