import { floorDivide } from './floor.js';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function dateOnly(instant: string): string {
  return instant.slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function hoursBetween(earlier: string, later: string): number {
  return floorDivide(Date.parse(later) - Date.parse(earlier), MS_PER_HOUR);
}

export function daysBetween(earlier: string, later: string): number {
  return floorDivide(Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`), MS_PER_DAY);
}

export function laterOf(first: string, ...rest: string[]): string {
  return rest.reduce((latest, candidate) => (candidate >= latest ? candidate : latest), first);
}
