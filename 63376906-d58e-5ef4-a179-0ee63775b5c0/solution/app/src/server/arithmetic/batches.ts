import { BP_SCALE, floorDivide } from './floor.js';
import { addMonths } from './dates.js';
import { CUSTODY_KINDS } from '../../shared/enums.js';
import { DECLARATION_TOLERANCE_BP } from '../db/constants.js';
import type { ApprovalPeriodRow, BatchRow, CustodyLink, PartyVersionRow, WeighingRow } from '../db/read.js';

export const FLAG_LAPSED_CALIBRATION = 'lapsed_calibration';
const REASON_APPROVAL_LAPSED = 'collector_approval_lapsed';
const REASON_CUSTODY_MISSING = 'custody_link_missing';

/** The reason a custody gap blocks a claim, naming the links that are absent. */
function custodyMissingReason(missing: string[]): string {
  return `${REASON_CUSTODY_MISSING}: ${missing.join(', ')}`;
}

export function dryMassG(netG: number, moistureBp: number): number {
  return floorDivide(netG * (BP_SCALE - moistureBp), BP_SCALE);
}

/** The approval period in force on a date: approved or conditional and covering the date. */
export function approvalInForce(periods: ApprovalPeriodRow[], on: string): ApprovalPeriodRow | null {
  return (
    periods.find(
      (p) => (p.state === 'approved' || p.state === 'conditional') && p.valid_from <= on && (p.valid_to === null || p.valid_to >= on),
    ) ?? null
  );
}

/** The date the collector's approval lapsed, if it did before the given date. */
function approvalLapsedOn(periods: ApprovalPeriodRow[], before: string): string | null {
  const lapsed = periods
    .filter((p) => (p.state === 'lapsed' || p.state === 'suspended') && p.valid_from <= before)
    .sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1));
  if (lapsed[0]) return lapsed[0].valid_from;
  const expired = periods
    .filter((p) => p.valid_to !== null && p.valid_to < before)
    .sort((a, b) => ((a.valid_to ?? '') < (b.valid_to ?? '') ? 1 : -1));
  return expired[0]?.valid_to ?? null;
}

function missingCustodyKinds(links: { kind: string }[]): string[] {
  const present = new Set(links.map((l) => l.kind));
  return CUSTODY_KINDS.filter((k) => !present.has(k));
}

/** A chain is broken when a link is absent, and stays broken once a link only arrived after acceptance. */
export function custodyBrokenAtAcceptance(links: CustodyLink[]): boolean {
  return missingCustodyKinds(links).length > 0 || links.some((link) => typeof link.arrived_on === 'string');
}

/** Date from which a late custody link makes the batch claimable (the latest arrival date among late links). */
function claimableFrom(links: { arrived_on?: string }[]): string | null {
  const arrivals = links.map((l) => l.arrived_on).filter((d): d is string => typeof d === 'string').sort();
  return arrivals[arrivals.length - 1] ?? null;
}

export function calibrationLapsed(device: WeighingRow, receivedOn: string): boolean {
  return addMonths(device.calibrated_on, device.calibration_months) < receivedOn;
}

export function nameInForce(versions: PartyVersionRow[], on: string): string | null {
  const inForce = versions.filter((v) => v.effective_from <= on).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return inForce[0]?.name ?? null;
}

export function declarationDepartureBp(batch: BatchRow): number | null {
  const measured = batch.composition.measured_fraction_bp;
  if (typeof measured !== 'number') return null;
  return Math.abs(batch.composition.fraction_bp - measured);
}

export function declarationDeparts(batch: BatchRow): boolean {
  const departure = declarationDepartureBp(batch);
  return departure !== null && departure > DECLARATION_TOLERANCE_BP;
}

interface Claimability {
  claimable: boolean;
  claimable_reason: string | null;
  claimable_from: string | null;
  custody_complete: boolean;
  missing_custody: string[];
  approval_lapsed_on: string | null;
}

export function claimability(batch: BatchRow, periods: ApprovalPeriodRow[]): Claimability {
  const missing = missingCustodyKinds(batch.custody);
  const from = claimableFrom(batch.custody);
  const approval = approvalInForce(periods, batch.received_on);
  const lapsedOn = approval ? null : approvalLapsedOn(periods, batch.received_on);
  if (!approval) {
    return { claimable: false, claimable_reason: REASON_APPROVAL_LAPSED, claimable_from: null, custody_complete: missing.length === 0, missing_custody: missing, approval_lapsed_on: lapsedOn };
  }
  if (missing.length > 0) {
    return { claimable: false, claimable_reason: custodyMissingReason(missing), claimable_from: null, custody_complete: false, missing_custody: missing, approval_lapsed_on: null };
  }
  return { claimable: true, claimable_reason: null, claimable_from: from, custody_complete: true, missing_custody: [], approval_lapsed_on: null };
}
