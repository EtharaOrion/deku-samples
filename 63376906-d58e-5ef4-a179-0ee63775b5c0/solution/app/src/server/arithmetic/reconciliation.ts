import { INBOUND_SOURCES, type InboundSource } from '../../shared/enums.js';
import type {
  BatchRow,
  CarbonFigureRow,
  CertificateRow,
  ConsumptionRow,
  InboundRow,
  MovementRow,
  OutputRow,
  RunRow,
} from '../db/read.js';
import { hoursBetween } from './dates.js';
import { periodFigures, sumCategories } from './ledger.js';

export interface Reconciliation {
  mass_balance_residual_g: number;
  credit_margin_g: number;
  consumptions_on_open_runs: number;
  batches_with_broken_custody: number;
  certificates_with_superseded_figures: number;
  integration_ages: Record<InboundSource, number | null>;
  references: {
    consumptions_on_open_runs: string[];
    batches_with_broken_custody: string[];
    certificates_with_superseded_figures: string[];
  };
  read_at: string;
  derivation: {
    mass_balance_residual_g: string;
    credit_margin_g: string;
    integration_ages: string;
  };
}

interface ReconciliationSources {
  runs: RunRow[];
  consumptions: ConsumptionRow[];
  outputs: OutputRow[];
  batches: BatchRow[];
  custodyBroken: (batch: BatchRow) => boolean;
  certificates: CertificateRow[];
  figures: CarbonFigureRow[];
  movementsByPeriod: Map<string, MovementRow[]>;
  originClosed: (originSite: string | null) => boolean;
  inbound: InboundRow[];
  readAt: string;
}

function massBalanceResidualG(runs: RunRow[], consumptions: ConsumptionRow[], outputs: OutputRow[]): number {
  let residual = 0;
  for (const run of runs) {
    if (run.state !== 'closed') continue;
    const consumed = consumptions.filter((row) => row.run === run.reference).reduce((total, row) => total + row.mass_g, 0);
    const produced = outputs.filter((row) => row.run === run.reference).reduce((total, row) => total + row.mass_g, 0);
    residual += consumed - produced - (run.losses_g ?? 0);
  }
  return residual;
}

function integrationAges(inbound: InboundRow[], readAt: string): Record<InboundSource, number | null> {
  const ages = {} as Record<InboundSource, number | null>;
  for (const source of INBOUND_SOURCES) {
    const latest = inbound
      .filter((row) => row.source === source)
      .map((row) => row.received_at)
      .sort()
      .at(-1);
    ages[source] = latest === undefined ? null : hoursBetween(latest, readAt);
  }
  return ages;
}

export function reconcile(sources: ReconciliationSources): Reconciliation {
  const openRuns = new Set(sources.runs.filter((run) => run.state !== 'closed').map((run) => run.reference));
  const supersededFigures = new Set(sources.figures.filter((figure) => figure.superseded_by !== null).map((figure) => figure.reference));
  let margin_g = 0;
  for (const movements of sources.movementsByPeriod.values()) {
    margin_g += sumCategories(periodFigures(movements, sources.originClosed).credits_available_g);
  }
  const references = {
    consumptions_on_open_runs: sources.consumptions.filter((row) => openRuns.has(row.run)).map((row) => row.reference),
    batches_with_broken_custody: sources.batches.filter(sources.custodyBroken).map((batch) => batch.reference),
    certificates_with_superseded_figures: sources.certificates
      .filter((certificate) => certificate.carbon_figure !== null && supersededFigures.has(certificate.carbon_figure))
      .map((certificate) => certificate.number),
  };
  return {
    mass_balance_residual_g: massBalanceResidualG(sources.runs, sources.consumptions, sources.outputs),
    credit_margin_g: margin_g,
    consumptions_on_open_runs: references.consumptions_on_open_runs.length,
    batches_with_broken_custody: references.batches_with_broken_custody.length,
    certificates_with_superseded_figures: references.certificates_with_superseded_figures.length,
    references,
    integration_ages: integrationAges(sources.inbound, sources.readAt),
    read_at: sources.readAt,
    derivation: {
      mass_balance_residual_g: 'sum over closed runs of consumed minus produced minus recorded losses',
      credit_margin_g: 'sum over every balance period of credits available in grams',
      integration_ages: 'whole hours between the latest received_at per source and read_at; null when never received',
    },
  };
}
