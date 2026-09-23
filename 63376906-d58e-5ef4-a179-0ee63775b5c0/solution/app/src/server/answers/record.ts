import { RECORD_QUERIES, type RecordQuery } from '../../shared/enums.js';
import type { InboundRow, PeriodRow } from '../db/read.js';
import { RETENTION_SCHEME_MONTHS } from '../db/constants.js';
import type { RecordEntry } from '../record/entries.js';
import { addDays, addMonths, dateOnly } from '../arithmetic/dates.js';
import { reconcile, type Reconciliation } from '../arithmetic/reconciliation.js';
import { expiryRefusal, retentionOf, type Retention } from '../arithmetic/retention.js';
import { custodyBrokenAtAcceptance } from '../arithmetic/batches.js';
import { findingsOf } from './batches.js';
import { impactOf } from './lots.js';
import type { Sources } from './sources.js';

export { expiryRefusal, retentionOf };
export type { Reconciliation, Retention };

export function reconciliationOf(s: Sources, inbound: InboundRow[], readAt: string): Reconciliation {
  return reconcile({
    runs: s.runList,
    consumptions: s.consumptions,
    outputs: s.outputList,
    batches: s.batchList,
    custodyBroken: (batch) => custodyBrokenAtAcceptance(batch.custody),
    certificates: s.certificates,
    figures: s.figures,
    movementsByPeriod: s.movementsByPeriod,
    originClosed: s.originClosed,
    inbound,
    readAt,
  });
}

/** An entry is retained for as long as any certificate resting on it is retained. */
export function referencedUntil(entry: RecordEntry, s: Sources): string | null {
  const text = `${entry.object ?? ''} ${JSON.stringify(entry.content ?? {})}`;
  const dates = s.certificates
    .filter((certificate) => text.includes(certificate.number) || text.includes(certificate.lot))
    .map((certificate) => addMonths(dateOnly(certificate.signed_at), RETENTION_SCHEME_MONTHS));
  return dates.length === 0 ? null : dates.reduce((latest, date) => (date > latest ? date : latest));
}

export function isRecordQuery(name: string): name is RecordQuery {
  return (RECORD_QUERIES as readonly string[]).includes(name);
}

export interface QueryParameters {
  batch: string;
  period: string;
  person: string;
  method_version: string;
  auditor: string;
}

const FORTNIGHT_DAYS = 14;

function finalFortnight(period: PeriodRow | undefined): { from: string; to: string } | null {
  if (!period) return null;
  return { from: addDays(period.ends_on, -FORTNIGHT_DAYS), to: period.ends_on };
}

export function answerQuery(
  name: RecordQuery,
  parameters: QueryParameters,
  s: Sources,
  entries: RecordEntry[],
): unknown[] {
  if (name === 'lots_from_batch') {
    return parameters.batch === '' ? [] : impactOf(parameters.batch, s).lots;
  }
  if (name === 'certificates_on_period') {
    return s.certificates
      .filter((certificate) => certificate.period === parameters.period)
      .map((certificate) => ({ number: certificate.number, site: certificate.site, period: certificate.period, state: certificate.state, signed_at: certificate.signed_at }));
  }
  if (name === 'certificates_under_method_version') {
    return s.certificates
      .filter((certificate) => certificate.carbon?.method_version === parameters.method_version)
      .map((certificate) => ({ number: certificate.number, method_version: certificate.carbon?.method_version ?? null, carbon_figure: certificate.carbon_figure }));
  }
  if (name === 'lots_released_under_unreviewed_override') {
    const held = new Set(s.overrides.filter((override) => !override.reviewed).map((override) => override.lot));
    return s.lotList
      .filter((lot) => lot.disposition === 'released' && held.has(lot.reference))
      .map((lot) => ({ lot: lot.reference, site: lot.site, overrides: s.overrides.filter((override) => override.lot === lot.reference && !override.reviewed).map((override) => override.reference) }));
  }
  if (name === 'allocations_in_final_fortnight') {
    const window = finalFortnight(s.periods.get(parameters.period));
    if (!window) return [];
    return s.movements
      .filter((movement) => movement.kind === 'allocation' && movement.period === parameters.period && movement.effective_on >= window.from && movement.effective_on <= window.to)
      .map((movement) => ({ reference: movement.reference, period: movement.period, lot: movement.lot, category: movement.category, mass_g: movement.mass_g, effective_on: movement.effective_on }));
  }
  if (name === 'refused_allocations') {
    return entries
      .filter((entry) => entry.outcome === 'refused' && entry.act.includes('alloc'))
      .map((entry) => ({ seq: entry.seq, person: entry.person, at: entry.at, act: entry.act, object: entry.object, content: entry.content }));
  }
  if (name === 'collector_declaration_departures') {
    const collectors = [...new Set(s.batchList.map((batch) => batch.collector))];
    return collectors.flatMap((collector) => findingsOf(collector, s).map((finding) => ({ collector, ...finding })));
  }
  if (name === 'acts_by_person') {
    return entries
      .filter((entry) => entry.person === parameters.person)
      .map((entry) => ({ seq: entry.seq, at: entry.at, act: entry.act, object: entry.object, outcome: entry.outcome }));
  }
  return entries
    .filter((entry) => entry.act.includes('export') && entry.person === parameters.auditor)
    .map((entry) => ({ seq: entry.seq, at: entry.at, auditor: entry.person, scope: entry.content, returned_nothing: countOfExport(entry) === 0 }));
}

function countOfExport(entry: RecordEntry): number {
  const content = entry.content as { entry_count?: unknown } | null;
  return typeof content?.entry_count === 'number' ? content.entry_count : 0;
}
