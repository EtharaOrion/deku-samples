import type { ConsumptionRow, OutputRow } from '../db/read.js';
import type { Recipe } from '../db/seed/operations.js';

interface ToleranceCheck {
  set_point: string;
  achieved: number;
  min: number;
  max: number;
  within: boolean;
}

export function toleranceChecks(recipe: Recipe | null, achieved: Record<string, number>): ToleranceCheck[] {
  if (!recipe) return [];
  const checks: ToleranceCheck[] = [];
  for (const [name, point] of Object.entries(recipe.set_points)) {
    const value = achieved[name];
    if (typeof value !== 'number') continue;
    checks.push({ set_point: name, achieved: value, min: point.min, max: point.max, within: value >= point.min && value <= point.max });
  }
  return checks;
}

export function withinTolerance(checks: ToleranceCheck[]): boolean | null {
  if (checks.length === 0) return null;
  return checks.every((check) => check.within);
}

export function consumedG(consumptions: ConsumptionRow[]): number {
  return consumptions.reduce((sum, row) => sum + row.mass_g, 0);
}

export function producedG(outputs: OutputRow[]): number {
  return outputs.reduce((sum, row) => sum + row.mass_g, 0);
}

export function lossesG(consumed: number, produced: number): number {
  return consumed - produced;
}
