import { q, one } from '../lib/db.js';
import { dayOf } from '../lib/num.js';
import { lotClaim } from './ledger.js';
import { carbonForLot } from './carbon.js';
import { flagsForLot } from './genealogy.js';

export const CONDITION_KEYS = [
  'lot_released',
  'no_open_deviation',
  'no_unreviewed_override',
  'period_closed',
  'balance_invariant_holds',
  'carbon_figure_complete',
  'signer_holds_scope',
  'signer_did_not_enter_data',
];

const CONDITION_TEXT = {
  lot_released: 'The lot is released',
  no_open_deviation: 'No deviation touching the lot is open',
  no_unreviewed_override: 'No override on the lot is unreviewed',
  period_closed: 'The bookkeeping period is closed',
  balance_invariant_holds: 'The balance invariant holds with the allocation applied',
  carbon_figure_complete: 'The carbon figure exists with all four components',
  signer_holds_scope: 'The signer holds signing scope for that site on the date of signing',
  signer_did_not_enter_data: 'The signer did not enter the data',
};

// The eight conditions, decided on the server. None is waivable.
export async function evaluateConditions({ lot: lotRef, signerEmail, signOn }) {
  const lot = await one('select * from lot where reference = $1', [lotRef]);
  const day = signOn || new Date().toISOString().slice(0, 10);
  const results = [];
  const push = (key, satisfied, blocking_reference, detail) =>
    results.push({ condition: key, statement: CONDITION_TEXT[key], satisfied: !!satisfied, blocking_reference: blocking_reference || null, detail: detail || null });

  if (!lot) {
    for (const k of CONDITION_KEYS) push(k, false, lotRef, 'No such lot');
    return { conditions: results, lot: null };
  }

  push('lot_released', lot.disposition === 'released', lot.disposition === 'released' ? null : lotRef, `The lot's disposition is '${lot.disposition}'.`);

  const devs = await q("select * from deviation where state = 'open'");
  const openDev = devs.find((d) => (d.lots || []).includes(lotRef));
  push('no_open_deviation', !openDev, openDev ? openDev.reference : null, openDev ? `Deviation ${openDev.reference} touching this lot is open.` : null);

  const ovrs = await q('select * from override_record where lot = $1', [lotRef]);
  const unreviewed = ovrs.find((o) => !o.reviewed);
  push(
    'no_unreviewed_override',
    !unreviewed,
    unreviewed ? unreviewed.reference : null,
    unreviewed
      ? `Override ${unreviewed.reference} breaking '${unreviewed.separation}' is unreviewed. A second person must review it.`
      : null,
  );

  const period = await one(
    'select * from balance_period where site = $1 and grade = $2 and period_from <= $3 and period_to >= $3',
    [lot.site, lot.grade, lot.produced_on],
  );
  push('period_closed', period ? period.state === 'closed' : false, period ? period.id : null, period ? `Period ${period.id} is ${period.state}.` : 'No bookkeeping period covers this lot.');

  const claim = await lotClaim(lotRef);
  let balanceOk = false;
  let balanceDetail = 'No balance period covers this lot.';
  if (period) {
    const { balancePeriodView } = await import('./ledger.js');
    const view = await balancePeriodView(period.id);
    balanceOk = view.post_consumer.credits_available_g >= 0 && view.pre_consumer.credits_available_g >= 0 && claim.credit_attached_g > 0;
    balanceDetail = claim.credit_attached_g > 0
      ? `Credit attached ${claim.credit_attached_g} g; available post-consumer ${view.post_consumer.credits_available_g} g, pre-consumer ${view.pre_consumer.credits_available_g} g.`
      : 'No claim is attached to this lot, so there is nothing to certify.';
  }
  push('balance_invariant_holds', balanceOk, period ? period.id : null, balanceDetail);

  let carbon = null;
  let carbonOk = false;
  let carbonDetail = 'No carbon figure exists for this lot.';
  try {
    carbon = await carbonForLot(lotRef);
    if (carbon) {
      carbonOk =
        carbon.value_mg_per_kg != null &&
        !!carbon.boundary &&
        !!carbon.method_version &&
        carbon.uncertainty_bp != null;
      carbonDetail = carbonOk ? null : 'The carbon figure is missing one of its four components.';
    }
  } catch (e) {
    carbonDetail = e.body?.detail || 'The carbon figure could not be resolved.';
  }
  push('carbon_figure_complete', carbonOk, carbon ? carbon.figure_id : null, carbonDetail);

  const grant = signerEmail ? await one('select * from access_grant where email = $1 order by ends_on desc limit 1', [signerEmail]) : null;
  const sites = grant ? grant.sites || [] : [];
  const scopeOk = !!grant && sites.includes(lot.site) && dayOf(grant.ends_on) >= day && grant.role === 'certificate_signer';
  push(
    'signer_holds_scope',
    scopeOk,
    grant ? grant.reference : null,
    scopeOk
      ? null
      : grant
        ? `${signerEmail} is scoped to ${sites.join(', ') || 'no site'} until ${dayOf(grant.ends_on)} and this lot is at ${lot.site}.`
        : 'The signer holds no grant.',
  );

  const entered = signerEmail
    ? await q('select * from test_result where subject_ref = $1 and entered_by = $2', [lotRef, signerEmail])
    : [];
  const enteredOps = signerEmail
    ? await q(
        `select reference from consumption where recorded_by = $1 and run in (select reference from run where site = $2)
         union all select reference from output where recorded_by = $1 and run in (select reference from run where site = $2)`,
        [signerEmail, lot.site],
      )
    : [];
  const dataEntered = entered.length > 0 || enteredOps.length > 0;
  push(
    'signer_did_not_enter_data',
    !dataEntered,
    dataEntered ? (entered[0]?.reference || enteredOps[0]?.reference) : null,
    dataEntered ? `${signerEmail} entered data on this lot.` : null,
  );

  return { conditions: results, lot, claim, carbon, period };
}

export function statementsFor({ claim_type, content_bp, category_split, language = 'en' }) {
  const pct = `${Math.floor(content_bp / 100)}.${String(content_bp % 100).padStart(2, '0')} per cent`;
  const cats = Object.entries(category_split || {})
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `${k.replace(/_/g, '-')} ${v} g`)
    .join(', ');
  const en = {
    physically_segregated: {
      permitted: `This material is physically segregated recycled content at ${pct} (${content_bp} basis points), from ${cats || 'no allocated category'}. You may state that this material physically contains recycled content at that percentage.`,
      prohibited: 'You may not state a percentage other than the one on this certificate, and you may not aggregate this claim with a claim from another certificate.',
    },
    controlled_blending: {
      permitted: `This material carries a controlled-blending claim of ${pct} (${content_bp} basis points), from ${cats || 'no allocated category'}. You may state that this material was produced under controlled blending at that percentage.`,
      prohibited: 'You may not state that this material physically contains recycled content at this percentage in any given article, and you may not aggregate this claim with a claim from another certificate.',
    },
    mass_balance: {
      permitted: `This material is claimed by mass balance. It is not physically segregated. The claim is ${pct} (${content_bp} basis points), from ${cats || 'no allocated category'}. You may state that ${pct} of the material you received is attributed recycled content under a mass-balance chain of custody.`,
      prohibited:
        'You may not state that this material physically contains recycled content. You may not aggregate this claim with a claim from another certificate, and you may not restate the percentage on a different basis.',
    },
  };
  const fr = {
    physically_segregated: {
      permitted: `Cette matière est un contenu recyclé physiquement séparé à ${pct} (${content_bp} points de base).`,
      prohibited: "Vous ne pouvez pas déclarer un pourcentage autre que celui du présent certificat.",
    },
    controlled_blending: {
      permitted: `Cette matière porte une allégation de mélange contrôlé de ${pct} (${content_bp} points de base).`,
      prohibited: "Vous ne pouvez pas déclarer que cette matière contient physiquement ce pourcentage de contenu recyclé.",
    },
    mass_balance: {
      permitted: `Cette matière fait l'objet d'une allégation par bilan massique. Elle n'est pas physiquement séparée. L'allégation est de ${pct} (${content_bp} points de base).`,
      prohibited:
        "Vous ne pouvez pas déclarer que cette matière contient physiquement du contenu recyclé. Vous ne pouvez pas cumuler cette allégation avec celle d'un autre certificat.",
    },
  };
  const table = language === 'fr' ? fr : en;
  return { permitted_statement: table[claim_type].permitted, prohibited_statement: table[claim_type].prohibited, percentage_text: pct };
}

export function renderDocument(cert) {
  const L = [];
  const pct = `${Math.floor(cert.content_bp / 100)}.${String(cert.content_bp % 100).padStart(2, '0')} per cent`;
  // The structure is real headings in order. Each numbered heading names one
  // thing and names it once, so a reader moving by heading through plain text
  // reaches the claim type before the percentage and is never sent to the title
  // by a phrase that only looks like a heading.
  L.push('RAVEL MATERIALS SAS');
  L.push('CERTIFICATE OF ORIGIN AND CARBON FOOTPRINT');
  L.push('');
  L.push(`Certificate number: ${cert.number}`);
  L.push(`Version: ${cert.version}`);
  L.push(`State: ${cert.state}`);
  if (cert.state === 'withdrawn') {
    L.push(`WITHDRAWN. This certificate was withdrawn on ${cert.withdrawn_on}. Reason: ${cert.withdrawal_reason}.`);
  }
  L.push('');
  L.push('1. CLAIM TYPE');
  L.push(`   ${cert.claim_type}`);
  L.push('');
  L.push('2. RECYCLED CONTENT');
  L.push(`   ${pct} (${cert.content_bp} basis points), claim type ${cert.claim_type}`);
  const split = cert.category_split || {};
  for (const k of Object.keys(split)) L.push(`   ${k}: ${split[k]} g`);
  L.push('');
  L.push('3. MATERIAL');
  L.push(`   Grade: ${cert.grade}`);
  L.push(`   Specification: ${cert.specification || 'SPEC-N6'} version ${cert.specification_version}`);
  L.push(`   Site: ${cert.site}`);
  for (const l of cert.lots || []) L.push(`   Lot ${l.lot}: ${l.mass_g} g`);
  L.push(`   Bookkeeping period: ${cert.period}`);
  if (cert.provisional_factor) L.push('   This certificate rests on a provisional conversion factor.');
  L.push('');
  L.push('4. CARBON FOOTPRINT');
  const cb = cert.carbon || {};
  L.push(`   ${cb.value_mg_per_kg} mg CO2e per kg of product`);
  L.push(`   Boundary: ${cb.boundary}`);
  L.push(`   Method version: ${cb.method_version}`);
  L.push(`   Uncertainty: ${cb.uncertainty_bp} basis points`);
  L.push(`   Primary data share: ${cert.primary_share_bp} basis points`);
  if (cb.comparator) {
    L.push(`   Comparator: ${cb.comparator.material}, dataset ${cb.comparator.dataset} (${cb.comparator.dataset_year}), region ${cb.comparator.region}`);
    if (cb.comparator.relation) L.push(`   This figure is ${cb.comparator.relation}.`);
  }
  L.push(`   Energy, location-based: ${cb.energy_location_mg_per_kg} mg CO2e per kg`);
  L.push(`   Energy, market-based: ${cb.energy_market_mg_per_kg} mg CO2e per kg`);
  L.push('   Breakdown (attached):');
  for (const line of cb.breakdown || []) L.push(`     ${line.line}: ${line.mg_per_kg} mg/kg (${line.tag})`);
  L.push('');
  L.push('5. WHAT YOU MAY SAY');
  L.push(`   ${cert.permitted_statement}`);
  L.push('');
  L.push('6. WHAT YOU MAY NOT SAY');
  L.push(`   ${cert.prohibited_statement}`);
  L.push('');
  L.push('7. SCHEME');
  L.push(`   Scheme: ${cert.scheme}`);
  L.push(`   Producer registration: ${cert.registration}`);
  L.push('');
  L.push('8. TEST RESULTS');
  for (const t of cert.test_results || []) L.push(`   ${t.property}: ${t.value} ${t.unit} by ${t.method}`);
  if (!(cert.test_results || []).length) L.push('   No test result is attached to this certificate.');
  L.push('');
  L.push('9. RECIPIENT');
  L.push(`   ${cert.recipient_name} (${cert.recipient})`);
  L.push('');
  L.push('10. SIGNATURE');
  L.push(`   Signed by ${cert.signer_name} (${cert.signer})`);
  L.push(`   Signed at ${cert.signed_at}`);
  L.push('');
  L.push(`Verify this certificate at ravel.example.com/verify/${cert.number}.`);
  L.push(cert.verification_url);
  return L.join('\n');
}

export async function lotFlags(lotRef) {
  return flagsForLot(lotRef);
}
