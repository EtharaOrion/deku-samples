import { contentOfLot, balanceOf } from './ledger.js';

export const CONDITION_TEXT = {
  lot_released: 'The lot is released.',
  no_open_deviation: 'No deviation touching the lot is open.',
  no_unreviewed_override: 'No override on the lot is unreviewed.',
  period_closed: 'The bookkeeping period is closed.',
  balance_invariant_holds: 'The balance invariant holds with the allocation applied.',
  carbon_figure_complete: 'The carbon figure exists with all four components.',
  signer_scope: 'The signer holds signing scope for that site on the date of signing.',
  signer_not_data_enterer: 'The signer did not enter the data.'
};

export function periodForLot(c, lot) {
  return c.query(
    `SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 ORDER BY period_from DESC LIMIT 1`,
    [lot.site, lot.grade]
  ).then((r) => r.rows[0] || null);
}

export async function checkConditions(c, { lotRef, session, signingSite }) {
  const out = [];
  const lot = (await c.query(`SELECT * FROM lots WHERE reference=$1`, [lotRef])).rows[0];
  if (!lot) throw new Error('unknown lot');

  out.push({
    condition: 'lot_released',
    text: CONDITION_TEXT.lot_released,
    satisfied: lot.disposition === 'released',
    blocking_reference: lot.disposition === 'released' ? null : `/console/lots/${lot.reference}`,
    detail: { disposition: lot.disposition }
  });

  const devs = (await c.query(`SELECT reference, subjects FROM deviations WHERE state='open'`)).rows;
  const touching = devs.filter((d) => Array.isArray(d.subjects) && d.subjects.includes(lotRef));
  out.push({
    condition: 'no_open_deviation',
    text: CONDITION_TEXT.no_open_deviation,
    satisfied: touching.length === 0,
    blocking_reference: touching.length ? `/console/deviations/${touching[0].reference}` : null,
    detail: touching.map((d) => d.reference)
  });

  const unreviewed = (await c.query(`SELECT reference FROM overrides WHERE lot=$1 AND NOT reviewed`, [lotRef])).rows;
  out.push({
    condition: 'no_unreviewed_override',
    text: CONDITION_TEXT.no_unreviewed_override,
    satisfied: unreviewed.length === 0,
    blocking_reference: unreviewed.length ? `/console/overrides/${unreviewed[0].reference}` : null,
    detail: unreviewed.map((o) => o.reference)
  });

  const period = await periodForLot(c, lot);
  out.push({
    condition: 'period_closed',
    text: CONDITION_TEXT.period_closed,
    satisfied: !!period && period.state === 'closed',
    blocking_reference: period && period.state !== 'closed' ? `/console/balance/${period.id}` : null,
    detail: period ? { id: period.id, state: period.state } : null
  });

  const attached = await contentOfLot(c, lotRef);
  const bal = period ? await balanceOf(c, period.id) : null;
  let holds = true;
  let margin = null;
  if (bal) {
    const pc = bal.per.post_consumer.credits_available_g - attached.attached.post_consumer;
    const pr = bal.per.pre_consumer.credits_available_g - attached.attached.pre_consumer;
    margin = { post_consumer: pc, pre_consumer: pr };
    holds = pc >= 0 && pr >= 0;
  }
  out.push({
    condition: 'balance_invariant_holds',
    text: CONDITION_TEXT.balance_invariant_holds,
    satisfied: holds,
    blocking_reference: period ? `/console/balance/${period.id}` : null,
    detail: { attached_g: attached.attached, margin_g: margin }
  });

  const fig = (await c.query(`SELECT * FROM carbon_figures WHERE lot=$1 AND superseded_by IS NULL ORDER BY version DESC LIMIT 1`, [lotRef])).rows[0] || null;
  const complete = !!fig && fig.value_mg_per_kg != null && !!fig.boundary && !!fig.method_id && fig.uncertainty_bp != null;
  out.push({
    condition: 'carbon_figure_complete',
    text: CONDITION_TEXT.carbon_figure_complete,
    satisfied: complete,
    blocking_reference: complete ? null : `/console/lots/${lotRef}/carbon`,
    detail: fig ? { figure_id: fig.id, boundary: fig.boundary, method_version: `${fig.method_id} v${fig.method_version}`, uncertainty_bp: fig.uncertainty_bp } : null
  });

  const sites = session ? session.sites : [];
  const siteToCheck = signingSite || lot.site;
  out.push({
    condition: 'signer_scope',
    text: CONDITION_TEXT.signer_scope,
    satisfied: sites.includes(siteToCheck),
    blocking_reference: null,
    detail: { site: siteToCheck, signer_sites: sites }
  });

  const email = session ? session.email : null;
  const entered = [];
  if (email) {
    const tr = (await c.query(`SELECT count(*)::int AS n FROM test_results WHERE analyst=$1 AND subject=$2`, [email, lotRef])).rows[0].n;
    if (tr > 0) entered.push('test_results');
    const disp = (await c.query(`SELECT disposition_by FROM lots WHERE reference=$1`, [lotRef])).rows[0];
    if (disp && disp.disposition_by === email) entered.push('disposition');
    const consumedRuns = (await c.query(
      `SELECT DISTINCT r.operator FROM runs r JOIN outputs o ON o.run = r.reference
       WHERE o.reference IN (SELECT input_ref FROM consumptions WHERE input_kind='intermediate')
         OR r.reference = (SELECT produced_by FROM lots WHERE reference=$1)`, [lotRef]
    )).rows;
    if (consumedRuns.some((r) => r.operator === email)) entered.push('runs');
  }
  out.push({
    condition: 'signer_not_data_enterer',
    text: CONDITION_TEXT.signer_not_data_enterer,
    satisfied: entered.length === 0,
    blocking_reference: entered.length ? `/console/lots/${lotRef}` : null,
    detail: { entered_by_signer: entered }
  });

  return out;
}

export function firstBlocking(conditions) {
  return conditions.find((x) => !x.satisfied) || null;
}
