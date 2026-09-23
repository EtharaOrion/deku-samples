import { STATEMENTS } from '../../shared/copy.js';
import type { ApprovalPeriodRow, BatchRow, CollectorRow } from '../db/read.js';
import { COLLECTOR_EXPIRY_WARNING_DAYS } from '../db/constants.js';
import {
  approvalInForce,
  declarationDepartureBp,
  declarationDeparts,
  dryMassG,
} from '../arithmetic/batches.js';
import { daysBetween, todayIso } from '../arithmetic/dates.js';
import type { Sources } from './sources.js';

export function batchView(batch: BatchRow, s: Sources): Record<string, unknown> {
  const claim = s.batchClaim(batch);
  const flags = s.batchFlags(batch);
  const dry_mass_g = dryMassG(batch.net_g, batch.moisture_bp);
  const departure_bp = declarationDepartureBp(batch);
  const statements: string[] = [];
  if (!claim.claimable && claim.missing_custody.length > 0) {
    statements.push(STATEMENTS.nonClaimable(`${claim.missing_custody.join(', ')} custody link`));
  }
  if (!claim.claimable && claim.approval_lapsed_on) {
    statements.push(STATEMENTS.collectorLapsed(claim.approval_lapsed_on));
  }
  return {
    ...batch,
    collector_name: s.partyName(batch.collector, batch.received_on),
    dry_mass_g,
    accepted_g: batch.net_g - batch.rejected_g,
    claimable: claim.claimable,
    claimable_reason: claim.claimable_reason,
    claimable_from: claim.claimable_from,
    custody_complete: claim.custody_complete,
    missing_custody: claim.missing_custody,
    approval_lapsed_on: claim.approval_lapsed_on,
    flags,
    declaration_departure_bp: departure_bp,
    finding: declarationDeparts(batch),
    statements,
    derivation: {
      dry_mass_g: `floor(net_g ${batch.net_g} × (10000 − moisture_bp ${batch.moisture_bp}) ÷ 10000) = ${dry_mass_g}`,
      claimable: claim.claimable
        ? `collector approval in force on ${batch.received_on} and every custody link present`
        : `${claim.claimable_reason} on ${batch.received_on}`,
      flags: flags.length === 0 ? 'no flag applies' : flags.join(', '),
    },
  };
}

interface Finding {
  reference: string;
  batch: string;
  declared_fraction_bp: number;
  measured_fraction_bp: number;
  departure_bp: number;
  received_on: string;
}

export function findingsOf(collector: string, s: Sources): Finding[] {
  return s.batchList
    .filter((batch) => batch.collector === collector && declarationDeparts(batch))
    .map((batch) => ({
      reference: `FND-${batch.reference}`,
      batch: batch.reference,
      declared_fraction_bp: batch.composition.fraction_bp,
      measured_fraction_bp: batch.composition.measured_fraction_bp ?? batch.composition.fraction_bp,
      departure_bp: declarationDepartureBp(batch) ?? 0,
      received_on: batch.received_on,
    }));
}

export function collectorView(collector: CollectorRow, periods: ApprovalPeriodRow[], s: Sources): Record<string, unknown> {
  const today = todayIso();
  const inForce = approvalInForce(periods, today);
  const days_to_registration_expiry = daysBetween(today, collector.registration_expiry);
  return {
    reference: collector.reference,
    name: s.partyName(collector.reference, today),
    country: collector.country,
    registration: collector.registration,
    registration_expiry: collector.registration_expiry,
    registration_expiring_within_days:
      days_to_registration_expiry >= 0 && days_to_registration_expiry <= COLLECTOR_EXPIRY_WARNING_DAYS
        ? days_to_registration_expiry
        : null,
    collection_site_types: collector.collection_site_types,
    declared_streams: collector.declared_streams,
    scheme_status: collector.scheme_status,
    approval_state: inForce ? inForce.state : 'lapsed',
    approval_periods: periods.map((period) => ({
      reference: period.reference,
      state: period.state,
      valid_from: period.valid_from,
      valid_to: period.valid_to,
      condition: period.condition,
      condition_closes_on: period.condition_closes_on,
      recorded_by: period.recorded_by,
    })),
    findings: findingsOf(collector.reference, s),
    batches: s.batchList.filter((batch) => batch.collector === collector.reference).map((batch) => batch.reference),
  };
}
