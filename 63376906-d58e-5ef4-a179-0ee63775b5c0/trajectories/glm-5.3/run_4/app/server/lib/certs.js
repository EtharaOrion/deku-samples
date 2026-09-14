// Certificate arithmetic: the eight conditions, statements, document rendering.
import { q } from '../db.js';

export const CONDITIONS = [
  ['lot_released', 'The lot is released'],
  ['no_open_deviation', 'No deviation touching the lot is open'],
  ['no_unreviewed_override', 'No override on the lot is unreviewed'],
  ['period_closed', 'The bookkeeping period is closed'],
  ['balance_invariant_holds', 'The balance invariant holds with the allocation applied'],
  ['carbon_complete', 'The carbon figure exists with all four components'],
  ['signer_scope', 'The signer holds signing scope for that site on the date of signing'],
  ['signer_did_not_enter_data', 'The signer did not enter the data']
];

export function pct(bp) {
  const n = bp / 100;
  return String(n).replace(/\.?0+$/, '');
}

export function permittedStatement(claimType, contentBp, split) {
  const share = pct(contentBp);
  if (claimType === 'mass_balance') {
    return `This material is claimed by mass balance and carries ${share} per cent recycled content allocated to it. It is not physically segregated.`;
  }
  if (claimType === 'physically_segregated') {
    return `This material contains ${share} per cent physically segregated recycled content.`;
  }
  return `This material carries ${share} per cent recycled content allocated by controlled blending.`;
}

export function prohibitedStatement(claimType) {
  if (claimType === 'mass_balance') {
    return 'You may not state that this material physically contains recycled content.';
  }
  return 'You may not state a recycled-content percentage other than the one this certificate carries.';
}

export async function evaluateEight(lotRef, user, site, opts = {}) {
  const out = [];
  const lot = (await q('SELECT * FROM lot WHERE reference = $1', [lotRef])).rows[0];
  const period = opts.period || (await q(`SELECT * FROM balance_period WHERE site = $1 ORDER BY period_from DESC LIMIT 1`, [site])).rows[0];

  const push = (condition, label, satisfied, blocking_reference) =>
    out.push({ condition, label: label || (CONDITIONS.find((c) => c[0] === condition) || [])[1], satisfied: !!satisfied, blocking_reference: satisfied ? null : blocking_reference });

  push('lot_released', null, lot && lot.disposition === 'released', lot ? '/console/lots/' + lot.reference : '/console/lots');
  const dev = lot ? (await q(`SELECT reference FROM deviation WHERE state='open' AND (lots @> $1::jsonb OR runs @> $2::jsonb)`, [JSON.stringify([lot.reference]), JSON.stringify([lot.run])])).rows : [];
  push('no_open_deviation', null, dev.length === 0, dev.length ? '/console/deviations/' + dev[0].reference : null);
  const ovr = lot ? (await q(`SELECT reference FROM override WHERE lot = $1 AND reviewed = false`, [lot.reference])).rows : [];
  push('no_unreviewed_override', null, ovr.length === 0, ovr.length ? '/console/overrides/' + ovr[0].reference : null);
  push('period_closed', null, period && period.state === 'closed', period ? '/console/balance/' + period.id : '/console/balance');
  const alloc = opts.allocationApplied || { attached: 0, available: 0 };
  push('balance_invariant_holds', null, alloc.attached <= alloc.available, '/console/balance/' + (period ? period.id : ''));
  const fig = lot ? (await q('SELECT * FROM carbon_figure WHERE lot = $1 AND superseded = false ORDER BY version DESC LIMIT 1', [lot.reference])).rows[0] : null;
  const carbonComplete = fig && fig.value_mg_per_kg !== null && fig.boundary && fig.method_id && fig.uncertainty_bp !== null;
  push('carbon_complete', null, carbonComplete, '/console/lots/' + lotRef + '/carbon');
  push('signer_scope', null, (user.sites || []).includes(site), '/console');
  // the signer did not enter the data: no test result, no disposition, no batch, no run on this lot
  let entered = false;
  let enteredWhere = null;
  if (lot) {
    const tr = await q('SELECT COUNT(*)::int AS n FROM test_result WHERE lot = $1 AND analyst = $2', [lot.reference, user.email]);
    if (tr.rows[0].n > 0) { entered = true; enteredWhere = 'test_result'; }
    if (!entered && lot.created_by === user.email) { entered = true; enteredWhere = 'lot'; }
    const rn = await q('SELECT COUNT(*)::int AS n FROM run WHERE reference = $1 AND created_by = $2', [lot.run, user.email]);
    if (!entered && rn.rows[0].n > 0) { entered = true; enteredWhere = 'run'; }
  }
  push('signer_did_not_enter_data', null, !entered, enteredWhere ? '/console/lots/' + lotRef : null);
  return out;
}

export function documentFor(cert) {
  const L = [];
  L.push('RAVEL RECYCLED POLYMER CERTIFICATE');
  L.push('');
  L.push('Certificate number: ' + cert.number);
  L.push('Version: ' + cert.version);
  L.push('Site: ' + cert.site);
  L.push('Grade: ' + cert.grade);
  L.push('Specification version: ' + cert.specification_version);
  L.push('');
  L.push('CLAIM');
  L.push('Claim type: ' + cert.claim_type);
  L.push('Recycled content: ' + pct(cert.content_bp) + ' per cent (' + cert.content_bp + ' basis points)');
  L.push('Category split: ' + Object.entries(cert.category_split || {}).map(([k, v]) => k + ' ' + v).join(', '));
  L.push('');
  L.push('CARBON');
  const carbon = cert.carbon || {};
  L.push('Carbon figure: ' + (carbon.value_mg_per_kg || 0) + ' mg CO2e per kg');
  L.push('Boundary: ' + (carbon.boundary || ''));
  L.push('Method version: ' + (carbon.method_version || ''));
  L.push('Uncertainty: ' + (carbon.uncertainty_bp || 0) + ' basis points');
  L.push('Comparator: ' + ((carbon.comparator || {}).material || '') + ', dataset ' + ((carbon.comparator || {}).dataset || '') + ' ' + ((carbon.comparator || {}).dataset_year || '') + ', region ' + ((carbon.comparator || {}).region || ''));
  L.push('');
  L.push('PERMITTED STATEMENT');
  L.push(cert.permitted_statement);
  L.push('');
  L.push('PROHIBITED STATEMENT');
  L.push(cert.prohibited_statement);
  L.push('');
  L.push('RECIPIENT');
  L.push(cert.recipient_name + ' (' + cert.recipient + ')');
  L.push('');
  L.push('SIGNATURE');
  L.push('Signed by ' + cert.signer + ' on ' + cert.signed_at);
  L.push('Scheme: ' + cert.scheme + ', registration ' + cert.registration);
  if (cert.provisional_factor) {
    L.push('This certificate rests on a provisional conversion factor.');
  }
  if (cert.state === 'withdrawn') {
    L.push('');
    L.push('WITHDRAWN');
    L.push('This certificate was withdrawn on ' + cert.withdrawn_on + '. Reason: ' + cert.withdrawal_reason + '.');
  }
  L.push('');
  L.push('Lots: ' + (cert.lots || []).map((l) => l.reference + ' ' + l.mass_g + ' g').join(', '));
  L.push('Period: ' + cert.balance_period);
  L.push('');
  L.push('Verify this certificate at ravel.example.com/verify/' + cert.number);
  return L.join('\n') + '\n';
}
