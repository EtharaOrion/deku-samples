import { RUN_STAGES } from '../../shared/enums.js';
import type { OutputRow, RunRow } from '../db/read.js';
import type { Recipe } from '../db/seed/operations.js';
import { byproductShare } from '../arithmetic/carbon.js';
import { floorDivide } from '../arithmetic/floor.js';
import { consumedG, lossesG, producedG, toleranceChecks, withinTolerance } from '../arithmetic/runs.js';
import type { Sources } from './sources.js';

function outputsOfRun(run: string, s: Sources): OutputRow[] {
  return s.outputList.filter((row) => row.run === run);
}

export function runView(run: RunRow, s: Sources): Record<string, unknown> {
  const consumptions = s.consumptionsByRun.get(run.reference) ?? [];
  const outputs = outputsOfRun(run.reference, s);
  const consumed_g = consumedG(consumptions);
  const produced_g = producedG(outputs);
  const losses_g = run.losses_g ?? lossesG(consumed_g, produced_g);
  const recipe = (Object.keys(run.recipe ?? {}).length > 0 ? run.recipe : null) as Recipe | null;
  const checks = toleranceChecks(recipe, run.set_points_achieved ?? {});
  const stage = RUN_STAGES.find((row) => row.run_type === run.run_type)?.label ?? run.run_type;
  return {
    ...run,
    stage,
    consumptions: consumptions.map((row) => ({ reference: row.reference, input: row.input, mass_g: row.mass_g, effective_on: row.effective_on })),
    outputs: outputs.map((row) => ({ reference: row.reference, kind: row.kind, mass_g: row.mass_g, disposition: row.disposition })),
    consumed_g,
    produced_g,
    losses_g,
    tolerance_checks: checks,
    within_tolerance: withinTolerance(checks),
    derivation: {
      losses_g: `consumed ${consumed_g} g minus produced ${produced_g} g`,
      within_tolerance: 'set points achieved compared with the recipe version limits',
      versions: { recipe_version: run.recipe_version },
    },
  };
}

export function outputView(output: OutputRow, s: Sources): Record<string, unknown> {
  const run = s.runs.get(output.run);
  const view: Record<string, unknown> = { ...output, run_type: run?.run_type ?? null, site: run?.site ?? null };
  if (output.kind !== 'byproduct' || !run) return view;
  const outputs = outputsOfRun(run.reference, s);
  const claim_g = consumedG(s.consumptionsByRun.get(run.reference) ?? []);
  const figure = s.figures.find((row) => s.lots.get(row.lot)?.site === run.site && row.superseded_by === null);
  const emissions_mg = (figure?.value_mg_per_kg ?? 0) * floorDivide(producedG(outputs), 1000);
  const share = byproductShare(output, outputs, claim_g, emissions_mg);
  return {
    ...view,
    ...share,
    derivation: {
      share_bp: `byproduct ${output.mass_g} g over total run output ${producedG(outputs)} g`,
      claim_share_g: 'share applied to the claim mass entering the run',
      emissions_share_mg: 'share applied to the emissions of the run output',
    },
  };
}
