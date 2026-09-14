// The eight conditions are the whole of certificate gating. They are decided
// again at the moment of signing, against the records as they stand then, and
// are stored as they stood and never recomputed on read.
import { q } from "./db.js";

export const CONDITION_LABELS = [
  "lot_released",
  "no_open_deviation",
  "no_unreviewed_override",
  "period_closed",
  "balance_invariant_holds",
  "carbon_figure_complete",
  "signer_scope",
  "signer_not_data_enterer",
];

export async function certificateConditions(ctx) {
  const { lot, period, carbonFigure, signer, site, invariant } = ctx;
  const conds = [];

  conds.push({
    condition: "lot_released",
    satisfied: lot?.disposition === "released",
    blocking_reference: lot?.disposition === "released" ? null : lot?.reference,
  });

  const touching = (
    await q(`select * from deviations where state = 'open'`)
  ).filter((d) => (d.affects_lots || []).includes(lot?.reference));
  conds.push({
    condition: "no_open_deviation",
    satisfied: touching.length === 0,
    blocking_reference: touching[0]?.reference || null,
  });

  const unreviewed = await q(
    `select * from overrides where lot = $1 and reviewed = false`,
    [lot?.reference]
  );
  conds.push({
    condition: "no_unreviewed_override",
    satisfied: unreviewed.length === 0,
    blocking_reference: unreviewed[0]?.reference || null,
  });

  const periodRow = period;
  const periodClosed = periodRow?.state === "closed";
  conds.push({
    condition: "period_closed",
    satisfied: periodClosed,
    blocking_reference: periodClosed ? null : periodRow?.label || null,
  });

  // the balance invariant holds with the allocation applied
  const inv = ctx.invariant;
  conds.push({
    condition: "balance_invariant_holds",
    satisfied: !!inv?.holds,
    blocking_reference: inv?.holds ? null : periodRow?.label || null,
  });

  const cf = carbonFigure;
  const carbonOk =
    !!cf &&
    cf.value_mg_per_kg !== null &&
    cf.value_mg_per_kg !== undefined &&
    !!cf.boundary &&
    !!cf.method_version &&
    cf.uncertainty_bp !== null &&
    cf.uncertainty_bp !== undefined;
  conds.push({
    condition: "carbon_figure_complete",
    satisfied: carbonOk,
    blocking_reference: carbonOk ? null : lot?.reference,
  });

  // signer scope for that site on the date of signing
  const scopeOk = (signer?.sites || []).includes(site);
  conds.push({
    condition: "signer_scope",
    satisfied: scopeOk,
    blocking_reference: scopeOk ? null : site,
  });

  // the signer did not enter the data
  const entered = await q(
    `select distinct analyst from test_results where subject = $1`,
    [lot?.reference]
  );
  const enteredBySigner = entered.some((r) => r.analyst === signer?.email);
  conds.push({
    condition: "signer_not_data_enterer",
    satisfied: !enteredBySigner,
    blocking_reference: enteredBySigner ? signer?.email : null,
  });

  return conds;
}

export function permittedStatement(claimType, contentBPValue, categorySplit, lang = "en") {
  const pct = contentBPValue / 100;
  const cats = [];
  if (categorySplit?.post_consumer) cats.push(`${categorySplit.post_consumer} g post-consumer`);
  if (categorySplit?.pre_consumer) cats.push(`${categorySplit.pre_consumer} g pre-consumer`);
  const catText = cats.join(" and ");
  if (claimType === "mass_balance") {
    return lang === "fr"
      ? `Ce matériau est revendiqué par bilan matière. Il n'est pas physiquement séparé. La teneur en matières recyclées est de ${pct} pour cent (${catText}). Vous ne pouvez pas déclarer que ce matériau contient physiquement des matières recyclées.`
      : `This material is claimed by mass balance. It is not physically segregated. The recycled-content figure is ${pct} per cent (${catText}). You may not state that this material physically contains recycled content.`;
  }
  if (claimType === "controlled_blending") {
    return lang === "fr"
      ? `Ce matériau est produit par mélange contrôlé. Teneur en matières recyclées : ${pct} pour cent (${catText}).`
      : `This material is produced by controlled blending. Recycled-content figure: ${pct} per cent (${catText}).`;
  }
  return lang === "fr"
    ? `Ce matériau est physiquement séparé. Teneur en matières recyclées : ${pct} pour cent (${catText}).`
    : `This material is physically segregated. Recycled-content figure: ${pct} per cent (${catText}).`;
}

export function prohibitedStatement(claimType, lang = "en") {
  if (claimType === "mass_balance") {
    return lang === "fr"
      ? `Vous ne pouvez pas déclarer que ce matériau contient physiquement des matières recyclées.`
      : `You may not state that this material physically contains recycled content.`;
  }
  if (claimType === "controlled_blending") {
    return lang === "fr"
      ? `Vous ne pouvez pas déclarer que ce lot est issu d'un flux recyclé à cent pour cent.`
      : `You may not state that this lot is from a one hundred per cent recycled stream.`;
  }
  return lang === "fr"
    ? `Vous ne pouvez pas déclarer un contenu inférieur à celui certifié.`
    : `You may not state a content lower than the certified figure.`;
}
