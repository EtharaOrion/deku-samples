// Exact arithmetic. Every derived integer is floored, never rounded, never carried at half.
export function floorDiv(a: number, b: number): number {
  if (b === 0) throw new Error('division_by_zero');
  return Math.floor(a / b);
}

// dry mass = net_g * (10000 - moisture_bp) / 10000, floored
export function dryMassG(netG: number, moistureBp: number): number {
  return floorDiv(netG * (10000 - moistureBp), 10000);
}

// credit = dry_mass_consumed_g * factor_bp / 10000, floored
export function creditG(dryMassG: number, factorBp: number): number {
  return floorDiv(dryMassG * factorBp, 10000);
}

// recycled content = credit_attached_g * 10000 / lot_mass_g, floored
export function contentBp(creditAttachedG: number, lotMassG: number): number {
  return floorDiv(creditAttachedG * 10000, lotMassG);
}

// byproduct share = byproduct_mass_g * 10000 / total_output_mass_g, floored
export function shareBp(partG: number, totalG: number): number {
  return floorDiv(partG * 10000, totalG);
}

// conversion factor = derived_out_g * 10000 / derived_in_g, floored
export function factorBp(outG: number, inG: number): number {
  return floorDiv(outG * 10000, inG);
}

// blended content = (mass_a * content_a + mass_b * content_b) / (mass_a + mass_b), floored
export function blendContentBp(massA: number, contentA: number, massB: number, contentB: number): number {
  const total = massA + massB;
  if (total === 0) return 0;
  return floorDiv(massA * contentA + massB * contentB, total);
}

// running weighted content of remaining volume, floored
export function requiredRemainingBp(committedKg: number, deliveredKg: number, runningBp: number, floorBp: number): number {
  const remainingKg = committedKg - deliveredKg;
  if (remainingKg <= 0) return 0;
  const need = committedKg * floorBp - deliveredKg * runningBp;
  return need <= 0 ? 0 : floorDiv(need, remainingKg);
}

export function sum(list: number[]): number {
  return list.reduce((a, b) => a + b, 0);
}

export function inPeriod(periodFrom: string, periodTo: string, on: string): boolean {
  return on >= periodFrom && on <= periodTo;
}

export function twelveMonthsBefore(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}
