// Certificates: eight conditions, checked on the server, none waivable.
import type { Pool } from 'pg';

export const EIGHT = [
  'lot_released',
  'no_open_deviation',
  'no_unreviewed_override',
  'period_closed',
  'balance_invariant_holds',
  'carbon_figure_complete',
  'signer_scope',
  'signer_not_data_enterer'
] as const;

export const CONDITION_TEXT: Record<string, string> = {
  lot_released: 'The lot is released.',
  no_open_deviation: 'No deviation touching the lot is open.',
  no_unreviewed_override: 'No override on the lot is unreviewed.',
  period_closed: 'The bookkeeping period is closed.',
  balance_invariant_holds: 'The balance invariant holds with the allocation applied.',
  carbon_figure_complete: 'The carbon figure exists with all four components.',
  signer_scope: 'The signer holds signing scope for that site on the date of signing.',
  signer_not_data_enterer: 'The signer did not enter the data.'
};

export async function evaluateConditions(
  db: Pool,
  lot: string,
  signer: string,
  dateOfSigning: string
): Promise<{ conditions: { condition: string; satisfied: boolean; blocking_reference: string | null }[]; period: string | null }> {
  const lotRow = (await db.query('SELECT * FROM lots WHERE reference=$1', [lot])).rows[0];
  if (!lotRow) throw Object.assign(new Error('lot_not_found'), { status: 404 });

  const openDev = (await db.query(
    `SELECT d.reference FROM deviations d JOIN deviation_subjects ds ON ds.deviation=d.reference
     WHERE d.state='open' AND ((ds.subject_kind='lot' AND ds.subject=$1) OR (ds.subject_kind='run' AND ds.subject=$2))`,
    [lot, lotRow.run]
  )).rows[0];

  const unreviewed = (await db.query(
    `SELECT reference FROM overrides WHERE lot=$1 AND reviewed=false ORDER BY reference LIMIT 1`, [lot]
  )).rows[0];

  const period = (await db.query(
    `SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 AND $3 BETWEEN period_from AND period_to`,
    [lotRow.site, lotRow.grade, dateOfSigning]
  )).rows[0] || (await db.query(
    `SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 ORDER BY period_from DESC LIMIT 1`, [lotRow.site, lotRow.grade]
  )).rows[0];

  const invariantHolds = period
    ? (await db.query(
        `SELECT COALESCE(SUM(CASE WHEN direction='in' THEN mass_g ELSE -mass_g END),0) AS a
         FROM credit_movements WHERE period=$1 AND lot=$2`,
        [period.id, lot]
      )).rows[0]
    : null;
  const attached = Number(invariantHolds ? invariantHolds.a : 0);
  const availableNow = period
    ? Number((await db.query(
        `SELECT COALESCE(SUM(CASE WHEN direction='in' THEN mass_g ELSE -mass_g END),0) AS a
         FROM credit_movements WHERE period=$1`,
        [period.id]
      )).rows[0].a)
    : 0;

  const figure = (await db.query('SELECT * FROM carbon_figures WHERE lot=$1 ORDER BY computed_at DESC LIMIT 1', [lot])).rows[0];

  const grant = (await db.query('SELECT * FROM grants WHERE email=$1', [signer])).rows[0];
  const inScope = !!grant && grant.sites.includes(lotRow.site) && grant.role === 'certificate_signer' && grant.ends_on >= dateOfSigning;

  const enteredData = (await db.query(
    `SELECT 1 FROM test_results WHERE analyst=$1 AND subject=$2 LIMIT 1`,
    [signer, lot]
  )).rows[0] || (await db.query(
    `SELECT 1 FROM consumptions c JOIN lots l ON l.run IS NOT NULL WHERE c.run IN (SELECT run FROM outputs WHERE lot=$1) LIMIT 1`,
    [lot]
  )).rows[0];
  const enteredBySigner = !!(await db.query(
    `SELECT 1 FROM test_results WHERE analyst=$1 AND subject=$2`,
    [signer, lot]
  )).rows[0] || !!(await db.query(
    `SELECT 1 FROM runs WHERE reference=$1 AND operator=$2`, [lotRow.run, signer]
  )).rows[0];

  const conditions = [
    { condition: 'lot_released', satisfied: lotRow.disposition === 'released', blocking_reference: lotRow.disposition === 'released' ? null : lot },
    { condition: 'no_open_deviation', satisfied: !openDev, blocking_reference: openDev ? openDev.reference : null },
    { condition: 'no_unreviewed_override', satisfied: !unreviewed, blocking_reference: unreviewed ? unreviewed.reference : null },
    {
      condition: 'period_closed',
      satisfied: !!period && period.state === 'closed',
      blocking_reference: period ? (period.state === 'closed' ? null : period.id) : lotRow.site + '/' + lotRow.grade
    },
    {
      condition: 'balance_invariant_holds',
      satisfied: attached <= availableNow,
      blocking_reference: attached > availableNow ? period?.id || null : null
    },
    {
      condition: 'carbon_figure_complete',
      satisfied: !!figure && figure.value_mg_per_kg != null && figure.uncertainty_bp != null && !!figure.method_version && !!figure.comparator,
      blocking_reference: figure ? null : lot
    },
    { condition: 'signer_scope', satisfied: inScope, blocking_reference: inScope ? null : lotRow.site },
    { condition: 'signer_not_data_enterer', satisfied: !enteredBySigner, blocking_reference: enteredBySigner ? signer : null }
  ];
  return { conditions, period: period ? period.id : null };
}

export function statement(claimType: string, contentBp: number, categorySplit: Record<string, number>, recipientLanguage: string): { permitted: string; prohibited: string } {
  const pct = (contentBp / 100).toFixed(2).replace(/\.?0+$/, '');
  const pctWord = String(Math.floor(contentBp / 100));
  if (claimType === 'mass_balance') {
    const permitted =
      recipientLanguage === 'fr'
        ? `Le matériau contenant ce produit peut être décrit comme contenant ${pctWord} % de nylon 6 recyclé, selon la méthode de bilan de masse.`
        : `Materials containing product manufactured with recycled content may be described as containing ${pctWord}% recycled nylon 6 by mass balance.`;
    const prohibited =
      recipientLanguage === 'fr'
        ? `Vous ne pouvez pas déclarer que ce matériau contient physiquement du contenu recyclé.`
        : `You may not state that this material physically contains recycled content.`;
    return { permitted, prohibited };
  }
  const permitted = `This material may be described as containing ${pctWord}% recycled nylon 6.`;
  const prohibited = `You may not state a recycled-content percentage higher than ${pctWord}%.`;
  return { permitted, prohibited };
}
