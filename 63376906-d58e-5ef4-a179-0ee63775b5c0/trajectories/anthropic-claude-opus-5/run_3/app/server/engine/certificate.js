import { rq, rq1 } from '../db/pool.js';
import { lotClaim } from './ledger.js';
import { lotCarbon } from './carbon.js';
import { partyNameOn } from './feedstock.js';

export const VERIFY_BASE = 'https://ravel.example.com/verify';

/** Eight conditions, checked on the server, none of them waivable, and decided
 *  again at the moment of signing against the records as they stand then rather
 *  than as they stood at the preview. */
export async function evaluateConditions({ lotRef, recipient, signer, signingDate }) {
  const lot = await rq1('SELECT * FROM lot WHERE reference = $1', [lotRef]);
  const conditions = [];
  const push = (condition, satisfied, blocking_reference, detail, link) =>
    conditions.push({ condition, satisfied, blocking_reference: blocking_reference || null, detail, link: link || null });

  if (!lot) {
    for (let i = 0; i < 8; i++) push(`condition ${i + 1}`, false, lotRef, 'No such lot.');
    return { conditions, lot: null };
  }

  // 1. The lot is released.
  push('The lot is released',
    lot.disposition === 'released', lot.disposition === 'released' ? null : lotRef,
    lot.disposition === 'released'
      ? `${lotRef} carries the disposition released.`
      : `${lotRef} carries the disposition ${lot.disposition}. Only a released lot may be certified.`,
    `/console/lots/${lotRef}`);

  // 2. No deviation touching it is open.
  const openDev = await rq(
    `SELECT reference FROM deviation WHERE state = 'open'
      AND (EXISTS (SELECT 1 FROM jsonb_array_elements_text(lots) x WHERE x = $1)
        OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(runs) r
                    WHERE r IN (SELECT o.run FROM output o WHERE o.reference = $2)))`,
    [lotRef, lot.output_ref]
  );
  push('No deviation touching the lot is open',
    openDev.length === 0, openDev.map((d) => d.reference).join(', ') || null,
    openDev.length === 0
      ? 'No open deviation touches this lot.'
      : `Deviation ${openDev.map((d) => d.reference).join(', ')} is open and touches this lot.`,
    openDev.length ? `/console/deviations/${openDev[0].reference}` : null);

  // 3. No override on it is unreviewed.
  const unreviewed = await rq(
    'SELECT reference, separation, authorised_by FROM separation_override WHERE lot = $1 AND reviewed = false', [lotRef]
  );
  push('No override on the lot is unreviewed',
    unreviewed.length === 0, unreviewed.map((o) => o.reference).join(', ') || null,
    unreviewed.length === 0
      ? 'Every override on this lot has been reviewed by a second person.'
      : `Override ${unreviewed.map((o) => o.reference).join(', ')} breaks ${unreviewed[0].separation} and has not been reviewed by a second person.`,
    unreviewed.length ? `/console/overrides/${unreviewed[0].reference}` : null);

  // 4. The bookkeeping period is closed.
  const period = lot.balance_period
    ? await rq1('SELECT * FROM balance_period WHERE id = $1', [lot.balance_period]) : null;
  push('The bookkeeping period is closed',
    !!period && period.state === 'closed', period && period.state !== 'closed' ? period.id : (period ? null : lotRef),
    !period
      ? 'This lot names no balance period.'
      : period.state === 'closed'
        ? `${period.id} closed on ${String(period.closed_on).slice(0, 10)}.`
        : `${period.id} is open. A certificate rests on a closed period.`,
    period ? `/console/balance/${period.id}` : null);

  // 5. The balance invariant holds with the allocation applied.
  const claim = await lotClaim(lotRef);
  let invariantOk = false;
  let invariantDetail = 'No claim is attached to this lot.';
  if (period && claim) {
    const avail = await rq1(
      `SELECT COALESCE(SUM(CASE WHEN direction='in' THEN mass_g ELSE -mass_g END),0) AS g
         FROM credit_movement WHERE balance_period = $1`, [period.id]
    );
    const margin = Number(avail?.g || 0);
    invariantOk = margin >= 0 && claim.credit_attached_g > 0;
    invariantDetail = claim.credit_attached_g > 0
      ? `${claim.credit_attached_g} g of claim is attached; the period's margin is ${margin} g.`
      : 'No claim is attached to this lot, so there is no percentage to certify.';
  }
  push('The balance invariant holds with the allocation applied',
    invariantOk, invariantOk ? null : (period?.id || lotRef), invariantDetail,
    period ? `/console/balance/${period.id}` : null);

  // 6. The carbon figure exists with all four components.
  let carbon = null;
  let carbonOk = false;
  let carbonDetail = 'No carbon figure exists for this lot.';
  try {
    carbon = await lotCarbon(lotRef);
    if (carbon) {
      carbonOk = carbon.value_mg_per_kg !== null && !!carbon.boundary
        && !!carbon.method_version && carbon.uncertainty_bp !== null && carbon.uncertainty_bp !== undefined;
      carbonDetail = carbonOk
        ? `${carbon.value_mg_per_kg} mg/kg on ${carbon.boundary} under ${carbon.method_version} at ${carbon.uncertainty_bp} bp uncertainty.`
        : 'The carbon figure is missing one of its four components.';
    }
  } catch (e) {
    carbonDetail = e.body?.detail || 'The carbon figure could not be resolved.';
  }
  push('The carbon figure exists with all four components',
    carbonOk, carbonOk ? null : lotRef, carbonDetail, `/console/lots/${lotRef}/carbon`);

  // 7. The signer holds signing scope for that site on the date of signing.
  // A certification is a dated period, and an issuing condition resolves against
  // the period in force on the date of signing rather than a current flag.
  const scopeOk = !!signer && (signer.sites || []).includes(lot.site) && signer.roles.includes('certificate_signer');
  const cert = await rq1(
    `SELECT * FROM site_certification WHERE site = $1 AND effective_from <= $2::date
       AND (effective_to IS NULL OR effective_to >= $2::date)
     ORDER BY effective_from DESC, reference DESC LIMIT 1`,
    [lot.site, signingDate]
  );
  const siteCertified = !cert || cert.state !== 'suspended';
  push('The signer holds signing scope for the site on the date of signing',
    scopeOk && siteCertified, scopeOk && siteCertified ? null : lot.site,
    !scopeOk
      ? `${signer?.email || 'the signer'} is scoped to ${(signer?.sites || []).join(', ') || 'no site'} and this lot is at ${lot.site}.`
      : !siteCertified
        ? `${lot.site} certification is suspended from ${String(cert.effective_from).slice(0, 10)}. Reason: ${cert.reason || 'not stated'}.`
        : `${signer.email} is scoped to ${lot.site} on ${signingDate}.`,
    `/console/sites/${lot.site}`);

  // 8. The signer did not enter the data.
  const entered = signer ? await rq(
    `SELECT reference FROM test_result WHERE subject_ref = $1 AND entered_by = $2
     UNION ALL SELECT reference FROM run WHERE reference IN (SELECT o.run FROM output o WHERE o.reference = $3) AND recorded_by = $2
     UNION ALL SELECT reference FROM lot WHERE reference = $1 AND recorded_by = $2`,
    [lotRef, signer.email, lot.output_ref]
  ) : [];
  push('The signer did not enter the data',
    entered.length === 0, entered.map((e) => e.reference).join(', ') || null,
    entered.length === 0
      ? `${signer?.email || 'the signer'} entered none of the records behind this lot.`
      : `${signer.email} entered ${entered.map((e) => e.reference).join(', ')}. Whoever signs a certificate did not enter its data.`,
    `/console/lots/${lotRef}`);

  return { conditions, lot, claim, carbon, period };
}

/** permitted_statement and prohibited_statement are generated from the claim
 *  type, the percentage and the category split, in the recipient's language.
 *  They are never free text and are returned at the same weight as the figure. */
export function statementsFor({ claimType, contentBp, categorySplit, language }) {
  const pctText = `${Math.floor(contentBp / 100)}.${String(contentBp % 100).padStart(2, '0')}`;
  const catWords = Object.entries(categorySplit || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k.replace('_', '-')} ${v} g`)
    .join(', ');

  const en = {
    mass_balance: {
      permitted: `This material carries a ${pctText} per cent recycled content claim allocated by mass balance under the RCS-2026 scheme. The claim covers ${catWords || 'no allocated category'}. This material is claimed by mass balance. It is not physically segregated.`,
      prohibited: 'You may not state that this material physically contains recycled content. You may not describe it as physically segregated, and you may not restate the percentage against any mass other than the certified mass.'
    },
    controlled_blending: {
      permitted: `This material carries a ${pctText} per cent recycled content claim allocated by controlled blending under the RCS-2026 scheme. The claim covers ${catWords || 'no allocated category'}.`,
      prohibited: 'You may not describe this material as physically segregated, and you may not restate the percentage against any mass other than the certified mass.'
    },
    physically_segregated: {
      permitted: `This material is physically segregated recycled content at ${pctText} per cent under the RCS-2026 scheme. The claim covers ${catWords || 'no allocated category'}.`,
      prohibited: 'You may not restate the percentage against any mass other than the certified mass, and you may not extend the claim to material outside this certificate.'
    }
  };

  const fr = {
    mass_balance: {
      permitted: `Cette matière porte une allégation de contenu recyclé de ${pctText} pour cent, allouée par bilan massique selon le référentiel RCS-2026. L'allégation couvre ${catWords || 'aucune catégorie allouée'}. Cette matière est revendiquée par bilan massique. Elle n'est pas physiquement ségréguée.`,
      prohibited: "Vous ne pouvez pas déclarer que cette matière contient physiquement du contenu recyclé. Vous ne pouvez pas la décrire comme physiquement ségréguée."
    },
    controlled_blending: {
      permitted: `Cette matière porte une allégation de contenu recyclé de ${pctText} pour cent, allouée par mélange contrôlé selon le référentiel RCS-2026.`,
      prohibited: 'Vous ne pouvez pas décrire cette matière comme physiquement ségréguée.'
    },
    physically_segregated: {
      permitted: `Cette matière est un contenu recyclé physiquement ségrégué à ${pctText} pour cent selon le référentiel RCS-2026.`,
      prohibited: "Vous ne pouvez pas étendre l'allégation à une matière hors de ce certificat."
    }
  };

  const table = language === 'fr' ? fr : en;
  const chosen = table[claimType] || table.mass_balance;
  return { permitted_statement: chosen.permitted, prohibited_statement: chosen.prohibited };
}

function pad(s, n) {
  return String(s).padEnd(n, ' ');
}

/** A certificate is a document readable without this system. It renders as
 *  plain text, its structure is real headings in order so a reader moving by
 *  heading reaches the claim type before the percentage, and two reads of one
 *  version return identical bytes. No yield figure appears anywhere in it. */
export function renderDocument(cert) {
  const line = '='.repeat(72);
  const rule = '-'.repeat(72);
  const pctText = `${Math.floor(cert.content_bp / 100)}.${String(cert.content_bp % 100).padStart(2, '0')}`;
  const carbon = cert.carbon || {};
  const out = [];

  out.push(line);
  out.push('RAVEL MATERIALS SAS');
  // The document's headings run in the order a reader needs them, so somebody
  // moving by heading reaches the claim type before the percentage. The title
  // names neither, for the same reason.
  out.push('MATERIAL ORIGIN AND PRODUCT CARBON FOOTPRINT CERTIFICATE');
  out.push(line);
  out.push('');
  if (cert.state === 'withdrawn') {
    // A withdrawn certificate says withdrawn before it shows any figure.
    out.push('WITHDRAWN');
    out.push(rule);
    out.push(`This certificate was withdrawn on ${cert.withdrawn_on}.`);
    out.push(`Reason: ${cert.withdrawal_reason}`);
    out.push('The statements below are void and must no longer be made.');
    out.push('');
  }

  out.push('1. CERTIFICATE');
  out.push(rule);
  out.push(`${pad('Number', 26)}${cert.number}`);
  out.push(`${pad('Version', 26)}${cert.version}`);
  out.push(`${pad('State', 26)}${cert.state}`);
  out.push(`${pad('Issued on', 26)}${cert.issued_on}`);
  out.push(`${pad('Site', 26)}${cert.site}`);
  out.push(`${pad('Scheme', 26)}${cert.scheme}`);
  out.push(`${pad('Producer registration', 26)}${cert.registration}`);
  out.push(`${pad('Recipient', 26)}${cert.recipient_name}`);
  out.push('');

  out.push('2. CLAIM TYPE');
  out.push(rule);
  out.push(`${pad('Claim type', 26)}${cert.claim_type}`);
  out.push(`${pad('Bookkeeping period', 26)}${cert.period}`);
  if (cert.provisional_factor) {
    out.push('');
    out.push('This certificate rests on a provisional conversion factor. The factor was');
    out.push('not derived from a stated window of the site\'s own loss history.');
  }
  out.push('');

  out.push('3. RECYCLED CONTENT');
  out.push(rule);
  out.push(`${pad('Recycled content', 26)}${pctText} per cent (${cert.content_bp} basis points)`);
  for (const [k, v] of Object.entries(cert.category_split || {})) {
    out.push(`${pad(`  ${k}`, 26)}${v} g`);
  }
  out.push(`${pad('Grade', 26)}${cert.grade}`);
  out.push(`${pad('Specification', 26)}${cert.specification_version}`);
  for (const l of cert.lots || []) {
    out.push(`${pad('  Lot', 26)}${l.reference}  ${l.mass_g} g`);
  }
  out.push('');

  out.push('4. CARBON FOOTPRINT');
  out.push(rule);
  out.push(`${pad('Value', 26)}${carbon.value_mg_per_kg} mg CO2e per kg of product`);
  out.push(`${pad('Boundary', 26)}${carbon.boundary}`);
  out.push(`${pad('Method version', 26)}${carbon.method_version}`);
  out.push(`${pad('Uncertainty', 26)}${carbon.uncertainty_bp} basis points`);
  out.push(`${pad('Primary data share', 26)}${cert.primary_share_bp} basis points`);
  if (carbon.comparison) {
    out.push(`${pad('Against comparator', 26)}${carbon.comparison.statement}`);
  }
  if (carbon.energy) {
    out.push(`${pad('Energy, location based', 26)}${carbon.energy.energy_location_mg_per_kg} mg CO2e per kg`);
    out.push(`${pad('Energy, market based', 26)}${carbon.energy.energy_market_mg_per_kg} mg CO2e per kg`);
  }
  out.push('');
  out.push('The breakdown behind this figure is attached as section 8.');
  out.push('');

  out.push('5. WHAT YOU MAY STATE');
  out.push(rule);
  for (const l of wrap(cert.permitted_statement, 72)) out.push(l);
  out.push('');

  out.push('6. WHAT YOU MAY NOT STATE');
  out.push(rule);
  for (const l of wrap(cert.prohibited_statement, 72)) out.push(l);
  out.push('');

  if (cert.statements_language && cert.statements_language.language !== 'en') {
    out.push(`6b. THE SAME STATEMENTS IN ${cert.statements_language.language.toUpperCase()}`);
    out.push(rule);
    for (const l of wrap(cert.statements_language.permitted_statement, 72)) out.push(l);
    out.push('');
    for (const l of wrap(cert.statements_language.prohibited_statement, 72)) out.push(l);
    out.push('');
  }

  out.push('7. TEST RESULTS');
  out.push(rule);
  if (!(cert.test_results || []).length) {
    out.push('No test result is recorded against this lot.');
  } else {
    for (const t of cert.test_results) {
      out.push(`${pad(t.property, 26)}${t.value} ${t.unit}  by ${t.method}`);
    }
  }
  out.push('');

  out.push('8. CARBON BREAKDOWN');
  out.push(rule);
  for (const b of carbon.breakdown || []) {
    out.push(`${pad(b.line, 32)}${pad(b.mg_per_kg, 12)}${b.tag}`);
  }
  out.push('');

  out.push('9. SIGNATURE');
  out.push(rule);
  out.push(`${pad('Signed by', 26)}${cert.signer_name}`);
  out.push(`${pad('Signed at', 26)}${cert.signed_at}`);
  out.push('');
  out.push(`Verify this certificate at ravel.example.com/verify/${cert.number}.`);
  out.push(line);
  return out.join('\n') + '\n';
}

function wrap(text, width) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function recipientName(reference, onDate) {
  const name = await partyNameOn(reference, onDate);
  if (name && name !== reference) return name;
  const c = await rq1('SELECT reference FROM customer WHERE reference = $1', [reference]);
  return c ? c.reference : reference;
}

export { wrap };
