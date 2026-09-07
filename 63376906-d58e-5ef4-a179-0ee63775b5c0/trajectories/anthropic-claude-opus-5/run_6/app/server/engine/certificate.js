import { q } from '../lib/db.js';
import { iso, partyNameOn } from './feedstock.js';
import { lotClaim } from './ledger.js';
import { carbonFor } from './carbon.js';

// Eight conditions, checked on the server, none waivable, and re-checked at the
// moment of signing against the records as they stand then.
export async function evaluateConditions({ lotReference, signerEmail, signOn }) {
  const day = signOn || new Date().toISOString().slice(0, 10);
  const lot = (await q('SELECT * FROM lot WHERE reference = $1', [lotReference]))[0];
  const conditions = [];

  const push = (condition, satisfied, blocking_reference, detail) =>
    conditions.push({ condition, satisfied, blocking_reference: satisfied ? null : (blocking_reference || null), detail: detail || null });

  if (!lot) {
    for (const name of CONDITION_NAMES) push(name, false, lotReference, 'The lot does not exist.');
    return { conditions, lot: null };
  }

  // 1. the lot is released
  push('lot_released', lot.disposition === 'released', lot.reference,
    lot.disposition === 'released' ? null : `The lot disposition is ${lot.disposition}.`);

  // 2. no deviation touching it is open
  const deviations = await q("SELECT * FROM deviation WHERE state = 'open'");
  const openDev = deviations.find((d) => (d.lots || []).includes(lot.reference));
  push('no_open_deviation', !openDev, openDev?.reference,
    openDev ? `Deviation ${openDev.reference} touching this lot is open.` : null);

  // 3. no override on it is unreviewed
  const overrides = await q('SELECT * FROM override_record WHERE lot = $1', [lot.reference]);
  const unreviewed = overrides.find((o) => !o.reviewed);
  push('no_unreviewed_override', !unreviewed, unreviewed?.reference,
    unreviewed ? `Override ${unreviewed.reference} on this lot is unreviewed. It must be reviewed by somebody other than ${unreviewed.authorised_by}.` : null);

  // 4. the bookkeeping period is closed.
  // A claim is period-dependent: it is drawn from a period's credits, and a period
  // that is still open can still move. So this blocks once claim has been drawn
  // from an open period. A lot with no claim drawn yet has nothing period-dependent
  // to certify, and the condition is not in breach.
  const period = await periodForLot(lot);
  const drawn = await q(
    "SELECT sum(mass_g)::bigint AS total FROM credit_movement WHERE lot = $1 AND direction = 'out' AND kind = 'allocation'",
    [lot.reference]);
  const drawnG = Number(drawn[0]?.total || 0);
  let periodOk;
  let periodDetail = null;
  if (!period) {
    periodOk = false;
    periodDetail = 'No balance period covers this lot.';
  } else if (period.state === 'closed') {
    periodOk = true;
  } else if (drawnG > 0) {
    periodOk = false;
    periodDetail = `Balance period ${period.id} is open, and ${drawnG} g of claim on this lot is drawn from it. A period that is still open can still move.`;
  } else {
    periodOk = true;
    periodDetail = null;
  }
  push('period_closed', periodOk, period?.id, periodDetail);

  // 5. the balance invariant holds with the allocation applied: the credit attached
  // never exceeds the credit available, and never exceeds the mass of the lot. An
  // unallocated lot does not breach it; a lot claiming more than the ledger holds does.
  const claim = await lotClaim(lot.reference);
  let invariantHolds = false;
  let invariantDetail = null;
  if (!period) {
    invariantDetail = 'No balance period covers this lot, so the invariant cannot be evaluated.';
  } else {
    const cats = await categoryAvailability(period.id);
    const negative = Object.entries(cats).filter(([, v]) => v.credits_available_g < 0);
    if (negative.length) {
      invariantDetail = `Credit attached exceeds credit available for ${negative.map(([k]) => k).join(', ')} in ${period.id}.`;
    } else if (claim.credit_attached_g > claim.lot_mass_g) {
      invariantDetail = `Credit attached (${claim.credit_attached_g} g) exceeds the mass of the lot (${claim.lot_mass_g} g).`;
    } else {
      invariantHolds = true;
    }
  }
  push('balance_invariant_holds', invariantHolds, period?.id, invariantDetail);

  // 6. the carbon figure exists with all four components
  const carbon = await carbonFor(lot.reference, { internal: true });
  const carbonOk = !!carbon && !carbon.mismatch
    && carbon.value_mg_per_kg !== undefined && !!carbon.boundary
    && !!carbon.method_version && carbon.uncertainty_bp !== undefined;
  push('carbon_figure_complete', carbonOk, carbon?.figure_id || lot.reference,
    carbonOk ? null : 'No carbon figure carrying a value, a boundary, a method version and an uncertainty exists for this lot.');

  // 7. the signer holds signing scope for that site on the date of signing
  const signer = (await q('SELECT * FROM person WHERE lower(email) = lower($1)', [signerEmail || '']))[0];
  const scoped = !!signer && (signer.sites || []).includes(lot.site)
    && (signer.roles || []).includes('certificate_signer')
    && iso(signer.grant_ends) >= day;
  let scopeDetail = null;
  if (!scoped) {
    if (!signer) scopeDetail = 'No signer identified.';
    else if (!(signer.roles || []).includes('certificate_signer')) scopeDetail = `${signer.email} does not hold the certificate signer role.`;
    else if (!(signer.sites || []).includes(lot.site)) scopeDetail = `${signer.email} holds signing scope for ${(signer.sites || []).join(', ')} and not for ${lot.site}.`;
    else scopeDetail = `The grant for ${signer.email} ended on ${iso(signer.grant_ends)}.`;
  }
  // a site certification suspension in force on the signing date blocks issuing
  const certState = await certificationInForce(lot.site, day, lot.grade);
  if (scoped && certState && certState.state === 'suspended') {
    scopeDetail = `Certification for ${lot.site} is suspended from ${iso(certState.effective_from)}.`;
  }
  push('signer_holds_scope', scoped && !(certState && certState.state === 'suspended'), lot.site, scopeDetail);

  // 8. the signer did not enter the data
  const entered = await q(
    `SELECT reference FROM test_result WHERE subject_kind = 'lot' AND subject_ref = $1 AND lower(entered_by) = lower($2)`,
    [lot.reference, signerEmail || '']);
  const enteredRuns = await q(
    `SELECT r.reference FROM run r
       JOIN output o ON o.run = r.reference
      WHERE o.reference = $1 AND lower(r.operator) = lower($2)`, [lot.output_ref || '', signerEmail || '']);
  const didNotEnter = entered.length === 0 && enteredRuns.length === 0;
  push('signer_did_not_enter_data', didNotEnter, entered[0]?.reference || enteredRuns[0]?.reference,
    didNotEnter ? null : `${signerEmail} entered data against this lot.`);

  return { conditions, lot, claim, carbon, period, signer, certification: certState };
}

export const CONDITION_NAMES = [
  'lot_released', 'no_open_deviation', 'no_unreviewed_override', 'period_closed',
  'balance_invariant_holds', 'carbon_figure_complete', 'signer_holds_scope', 'signer_did_not_enter_data',
];

export async function periodForLot(lot) {
  const rows = await q(
    `SELECT * FROM balance_period WHERE site = $1 AND grade = $2
       AND period_from <= $3 AND period_to >= $3 ORDER BY period_from DESC LIMIT 1`,
    [lot.site, lot.grade, lot.produced_on]);
  if (rows[0]) return rows[0];
  const any = await q('SELECT * FROM balance_period WHERE site = $1 AND grade = $2 ORDER BY period_from DESC LIMIT 1',
    [lot.site, lot.grade]);
  return any[0] || null;
}

// Mirrors the ledger exactly: only 'in' is fresh credit and only 'out' spends it.
// An 'inbound' movement arrived by transfer and is never a fresh credit; a 'note'
// movement records non-claimable input and carries no credit at all.
async function categoryAvailability(periodId) {
  const rows = await q(
    'SELECT category, direction, sum(mass_g) AS total FROM credit_movement WHERE period_id = $1 GROUP BY category, direction',
    [periodId]);
  const out = {};
  for (const r of rows) {
    if (!out[r.category]) out[r.category] = { credits_in_g: 0, credits_out_g: 0, credits_available_g: 0 };
    if (r.direction === 'in') out[r.category].credits_in_g += Number(r.total);
    else if (r.direction === 'out') out[r.category].credits_out_g += Number(r.total);
  }
  for (const v of Object.values(out)) v.credits_available_g = v.credits_in_g - v.credits_out_g;
  return out;
}

// A site's certification is a dated period exactly as a collector's approval is.
export async function certificationInForce(site, onDate, grade) {
  const rows = await q(
    `SELECT * FROM site_certification WHERE site = $1 AND effective_from <= $2
       AND (effective_to IS NULL OR effective_to >= $2)
       AND (grade IS NULL OR grade = $3)
     ORDER BY effective_from DESC, id DESC`, [site, onDate, grade || null]);
  return rows[0] || null;
}

// permitted_statement and prohibited_statement are generated from the claim type,
// the percentage and the category split, in the recipient's language.
const STATEMENTS = {
  en: {
    mass_balance: {
      permitted: (p) => `This material is claimed by mass balance. It is not physically segregated. ${p.content} of the mass supplied under this certificate is attributed to recycled input under ${p.scheme}, of which ${p.split}. You may describe this material as certified recycled content by mass balance, citing certificate ${p.number}.`,
      prohibited: () => 'You may not state that this material physically contains recycled content. You may not describe it as physically segregated, as mechanically recycled, or as made from a named waste stream. You may not aggregate this claim with any other certificate covering the same mass.',
    },
    controlled_blending: {
      permitted: (p) => `This material is claimed by controlled blending. ${p.content} of the mass supplied under this certificate is recycled input under ${p.scheme}, of which ${p.split}. You may describe this material as containing certified recycled content at the stated percentage, citing certificate ${p.number}.`,
      prohibited: () => 'You may not state that this material is physically segregated recycled content. You may not state a percentage other than the one on this certificate.',
    },
    physically_segregated: {
      permitted: (p) => `This material is physically segregated recycled content under ${p.scheme}, at ${p.content} of the mass supplied under this certificate, of which ${p.split}. You may describe this material as physically containing recycled content, citing certificate ${p.number}.`,
      prohibited: () => 'You may not state a percentage other than the one on this certificate. You may not extend this claim to material outside the lots named here.',
    },
  },
  fr: {
    mass_balance: {
      permitted: (p) => `Cette matière fait l'objet d'une revendication par bilan massique. Elle n'est pas physiquement ségréguée. ${p.content} de la masse fournie au titre de ce certificat est attribuée à une entrée recyclée selon ${p.scheme}, dont ${p.split}. Vous pouvez décrire cette matière comme contenant du contenu recyclé certifié par bilan massique, en citant le certificat ${p.number}.`,
      prohibited: () => "Vous ne pouvez pas déclarer que cette matière contient physiquement du contenu recyclé. Vous ne pouvez pas la décrire comme physiquement ségréguée, ni comme recyclée mécaniquement, ni comme issue d'un flux de déchets nommé.",
    },
    controlled_blending: {
      permitted: (p) => `Cette matière fait l'objet d'une revendication par mélange contrôlé. ${p.content} de la masse fournie est du contenu recyclé selon ${p.scheme}, dont ${p.split}. Certificat ${p.number}.`,
      prohibited: () => 'Vous ne pouvez pas déclarer que cette matière est physiquement ségréguée.',
    },
    physically_segregated: {
      permitted: (p) => `Cette matière est du contenu recyclé physiquement ségrégué selon ${p.scheme}, à ${p.content} de la masse fournie, dont ${p.split}. Certificat ${p.number}.`,
      prohibited: () => 'Vous ne pouvez pas déclarer un pourcentage autre que celui figurant sur ce certificat.',
    },
  },
};

export function statementsFor({ claimType, contentBpValue, categorySplit, scheme, number, language }) {
  const lang = STATEMENTS[language] ? language : 'en';
  const set = STATEMENTS[lang][claimType] || STATEMENTS[lang].mass_balance;
  const content = `${formatBp(contentBpValue)} per cent`;
  const splitWords = Object.entries(categorySplit || {})
    .map(([k, v]) => `${v} g ${k.replace(/_/g, '-')}`)
    .join(' and ');
  const p = { content, split: splitWords || 'no allocated category', scheme, number };
  return { permitted_statement: set.permitted(p), prohibited_statement: set.prohibited(p), language: lang };
}

// basis points rendered as a decimal string for prose only; the wire carries the integer
export function formatBp(bp) {
  const whole = Math.trunc(bp / 100);
  const frac = Math.abs(bp % 100);
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

export async function recipientName(reference, onDate) {
  const versions = await q('SELECT * FROM party_version WHERE party = $1 ORDER BY effective_from ASC', [reference]);
  return partyNameOn(versions, onDate) || reference;
}
