import type { Category } from '../../shared/enums.js';
import { STATEMENTS } from '../../shared/copy.js';
import type { BatchRow, LotRow, PeriodRow } from '../db/read.js';
import { BP_SCALE, floorDivide } from '../arithmetic/floor.js';
import { allocatedToLot, categorySplit, contentBp, periodCovers, periodsDrawnBy, type CategoryFigures } from '../arithmetic/ledger.js';
import { buildGenealogy, buildImpact, type Genealogy, type Impact } from '../arithmetic/genealogy.js';
import { carbonAnswer, type CarbonAnswer } from '../arithmetic/carbon.js';
import { nowIso } from '../arithmetic/dates.js';
import { Refusal } from '../auth/guard.js';
import type { Sources } from './sources.js';

/** Write modules reach the blend and retirement arithmetic through this module alone. */
export { blendLots, type BlendComponent } from '../arithmetic/blend.js';
export { retirementRefusal } from '../arithmetic/carbon.js';

interface LotContent {
  content_bp: number;
  provisional_factor: boolean;
  category_split: CategoryFigures;
  claim_g: number;
}

export function lotContent(lot: LotRow, s: Sources): LotContent {
  if (lot.components.length > 0) {
    let weighted_g_bp = 0;
    let mass_g = 0;
    let provisional = false;
    const split: CategoryFigures = { post_consumer: 0, pre_consumer: 0 };
    for (const component of lot.components) {
      const source = s.lots.get(component.lot);
      const content = source ? lotContent(source, s) : { content_bp: component.content_bp, provisional_factor: false, category_split: split, claim_g: 0 };
      weighted_g_bp += component.mass_g * content.content_bp;
      mass_g += component.mass_g;
      provisional = provisional || content.provisional_factor;
      for (const category of Object.keys(content.category_split) as Category[]) {
        split[category] += floorDivide(component.mass_g * content.category_split[category], source?.mass_g || component.mass_g);
      }
    }
    return { content_bp: mass_g === 0 ? 0 : floorDivide(weighted_g_bp, mass_g), provisional_factor: provisional, category_split: split, claim_g: 0 };
  }
  const factor = s.factorFor(lot.site);
  const claim_g = allocatedToLot(s.movements, lot.reference);
  const content_bp = contentBp(lot, s.movements, factor);
  const provisional_factor = claim_g === 0 && factor?.provisional === true;
  const category_split = provisional_factor
    ? { post_consumer: floorDivide(lot.mass_g * content_bp, BP_SCALE), pre_consumer: 0 }
    : categorySplit(s.movements, lot.reference);
  return { content_bp, provisional_factor, category_split, claim_g };
}

export function upstreamBatches(lot: LotRow, s: Sources): BatchRow[] {
  const graph = buildGenealogy(lot.reference, s);
  return graph.nodes.filter((node) => node.kind === 'batch').map((node) => s.batches.get(node.reference)).filter((b): b is BatchRow => b !== undefined);
}

export function periodOfLot(lot: LotRow, s: Sources): PeriodRow | null {
  const drawn = periodsDrawnBy(s.movements, lot.reference);
  const first = drawn[0];
  if (first !== undefined) return s.periods.get(first) ?? null;
  const on = lot.produced_on ?? lot.effective_on;
  return s.periodList.find((period) => periodCovers(period, lot.site, on)) ?? null;
}

export function lotView(lot: LotRow, s: Sources): Record<string, unknown> {
  const content = lotContent(lot, s);
  const deviations = s.deviations.filter((d) => d.lots.includes(lot.reference)).sort((a, b) => (a.state === b.state ? 0 : a.state === 'open' ? -1 : 1));
  const openDeviations = deviations.filter((d) => d.state === 'open').map((d) => d.reference);
  const overrides = s.overrides.filter((o) => o.lot === lot.reference);
  const unreviewed = overrides.filter((o) => !o.reviewed).map((o) => o.reference);
  const graph = buildGenealogy(lot.reference, s);
  const flags = new Set<string>();
  for (const node of graph.nodes) for (const flag of node.flags) flags.add(flag);
  if (openDeviations.length > 0) flags.add('open_deviation');
  if (unreviewed.length > 0) flags.add('unreviewed_override');
  const figure = s.figureFor(lot.reference);
  const factor = s.factorFor(lot.site);
  const statements: string[] = [];
  if (lot.claim_type === 'mass_balance') statements.push(STATEMENTS.massBalanceClaim);
  for (const batch of upstreamBatches(lot, s)) {
    const claim = s.batchClaim(batch);
    if (!claim.claimable) statements.push(STATEMENTS.nonClaimable(claim.missing_custody.length > 0 ? `${claim.missing_custody[0]} link missing` : claim.claimable_reason ?? 'not claimable'));
  }
  for (const override of overrides) statements.push(STATEMENTS.overridden(override.authorised_by, override.authorised_on));
  return {
    ...lot,
    content_bp: content.content_bp,
    category_split: content.category_split,
    provisional_factor: content.provisional_factor,
    claim_g: content.claim_g,
    deviations: deviations.map((d) => d.reference),
    open_deviations: openDeviations,
    overrides: overrides.map((o) => ({ reference: o.reference, separation: o.separation, authorised_by: o.authorised_by, authorised_on: o.authorised_on, reviewed: o.reviewed })),
    unreviewed_overrides: unreviewed,
    flags: [...flags],
    periods_drawn: periodsDrawnBy(s.movements, lot.reference),
    carbon: figure
      ? { value_mg_per_kg: figure.value_mg_per_kg, boundary: s.methodOf(figure.method, figure.method_version)?.boundary ?? 'cradle-to-gate', method_version: figure.method_version, uncertainty_bp: figure.uncertainty_bp }
      : null,
    statements,
    derivation: {
      content_bp: content.provisional_factor
        ? `provisional conversion factor ${factor?.reference ?? 'none'} at ${content.content_bp} bp; no claim allocated`
        : `floor(${content.claim_g} g claimed x ${BP_SCALE} / ${lot.mass_g} g) = ${content.content_bp} bp`,
      versions: { conversion_factor: factor ? `${factor.reference}/${factor.version}` : null, carbon_figure: figure ? `${figure.reference}/${figure.version}` : null },
    },
  };
}

export function genealogyOf(lot: LotRow, s: Sources): Genealogy {
  return buildGenealogy(lot.reference, s);
}

export function impactOf(batch: string, s: Sources): Impact {
  return buildImpact(batch, s.consumptions, s.outputList, s.lotList, s.certificates, (recipient) => s.partyName(recipient, nowIso().slice(0, 10)));
}

export function yieldOf(lot: LotRow, s: Sources): Record<string, unknown> {
  const graph = buildGenealogy(lot.reference, s);
  const input_g = graph.nodes.filter((node) => node.kind === 'batch').reduce((sum, node) => sum + node.mass_g, 0);
  const yield_bp = input_g === 0 ? 0 : floorDivide(lot.mass_g * BP_SCALE, input_g);
  return { lot: lot.reference, yield_bp, input_g, output_g: lot.mass_g, derivation: `floor(${lot.mass_g} x ${BP_SCALE} / ${input_g}) = ${yield_bp} bp` };
}

export function carbonOf(lot: LotRow, s: Sources, methodVersion?: string): CarbonAnswer & { lot: string; allocation_basis: string } {
  const figure = s.figureFor(lot.reference);
  if (!figure) throw new Refusal(404, 'carbon_figure_not_found', `No carbon figure exists for ${lot.reference}.`);
  const method = s.methodOf(figure.method, methodVersion ?? figure.method_version);
  if (!method) throw new Refusal(404, 'carbon_method_version_not_found', `Method version ${methodVersion ?? figure.method_version} is not published.`);
  const period = periodOfLot(lot, s);
  const periodBasis = period?.allocation_basis ?? 'mass';
  if (methodVersion !== undefined && method.allocation_basis !== periodBasis) {
    throw new Refusal(409, 'allocation_basis_mismatch', `Method version ${method.version} allocates on an ${method.allocation_basis} basis; the balance period allocates on a ${periodBasis} basis. One allocation basis governs claim and emissions.`, {
      method_allocation_basis: method.allocation_basis,
      period_allocation_basis: periodBasis,
    });
  }
  const factor = s.factorFor(lot.site);
  const recordedFactor = figure.input_versions.conversion_factor;
  const factorCurrent = recordedFactor === undefined || (factor !== null && recordedFactor === `${factor.reference}/${factor.version}`);
  const cache_valid = figure.superseded_by === null && factorCurrent;
  return { ...carbonAnswer(figure, method, cache_valid), lot: lot.reference, allocation_basis: method.allocation_basis };
}
