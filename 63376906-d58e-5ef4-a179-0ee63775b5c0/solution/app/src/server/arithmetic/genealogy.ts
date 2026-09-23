import type { Category, GenealogyKind } from '../../shared/enums.js';
import type { BatchRow, CertificateRow, ConsumptionRow, LotRow, OutputRow, RunRow } from '../db/read.js';

export interface GenealogyNode {
  kind: GenealogyKind;
  reference: string;
  mass_g: number;
  category_split: Partial<Record<Category, number>>;
  flags: string[];
}

interface GenealogyEdge {
  from: string;
  to: string;
  mass_g: number;
}

export interface Genealogy {
  lot: string;
  nodes: GenealogyNode[];
  edges: GenealogyEdge[];
  flagged: boolean;
  text_equivalent: string;
}

export interface GenealogySources {
  batches: Map<string, BatchRow>;
  runs: Map<string, RunRow>;
  outputs: Map<string, OutputRow>;
  lots: Map<string, LotRow>;
  consumptionsByRun: Map<string, ConsumptionRow[]>;
  batchFlags: (batch: BatchRow) => string[];
}

function addMass(node: GenealogyNode, category: Category | null, mass_g: number): void {
  node.mass_g += mass_g;
  if (category) node.category_split[category] = (node.category_split[category] ?? 0) + mass_g;
}

/**
 * Walks upstream from a lot through the run that produced it, the outputs the run
 * consumed, and so on down to batches. A batch reached by several paths is one
 * node carrying the total mass that flowed from it into the lot.
 */
export function buildGenealogy(lotRef: string, sources: GenealogySources): Genealogy {
  const nodes = new Map<string, GenealogyNode>();
  const edges = new Map<string, GenealogyEdge>();
  const lot = sources.lots.get(lotRef);
  if (!lot) return { lot: lotRef, nodes: [], edges: [], flagged: false, text_equivalent: `${lotRef} has no genealogy.` };

  const node = (kind: GenealogyNode['kind'], reference: string): GenealogyNode => {
    let existing = nodes.get(reference);
    if (!existing) {
      existing = { kind, reference, mass_g: 0, category_split: {}, flags: [] };
      nodes.set(reference, existing);
    }
    return existing;
  };
  const edge = (from: string, to: string, mass_g: number): void => {
    const key = `${from}>${to}`;
    const existing = edges.get(key);
    if (existing) existing.mass_g += mass_g;
    else edges.set(key, { from, to, mass_g });
  };

  const lotNode = node('lot', lot.reference);
  lotNode.mass_g = lot.mass_g;
  if (lot.disposition === 'quarantined') lotNode.flags.push('quarantined');

  // Upstream walk over the recorded masses: each consumption row is one edge and
  // is counted once, so a batch consumed twice on the way to the lot is one node
  // whose mass is the sum of what was consumed from it.
  const runsWalked = new Set<string>();
  const walkOutput = (outputRef: string, produced_g: number, downstream: string): void => {
    const output = sources.outputs.get(outputRef);
    if (!output) return;
    const run = sources.runs.get(output.run);
    if (!run) return;
    const runNode = node('run', run.reference);
    if (run.losses_g !== null && run.losses_g > 0 && !runNode.flags.includes('losses')) runNode.flags.push('losses');
    edge(run.reference, downstream, produced_g);
    if (runsWalked.has(run.reference)) return;
    runsWalked.add(run.reference);
    for (const consumption of sources.consumptionsByRun.get(run.reference) ?? []) {
      addMass(runNode, null, consumption.mass_g);
      const batch = sources.batches.get(consumption.input);
      if (batch) {
        const batchNode = node('batch', batch.reference);
        addMass(batchNode, batch.category as Category, consumption.mass_g);
        for (const flag of sources.batchFlags(batch)) if (!batchNode.flags.includes(flag)) batchNode.flags.push(flag);
        edge(batch.reference, run.reference, consumption.mass_g);
        continue;
      }
      const upstreamOutput = sources.outputs.get(consumption.input);
      if (upstreamOutput) {
        const outputNode = node('output', upstreamOutput.reference);
        outputNode.mass_g = upstreamOutput.mass_g;
        edge(upstreamOutput.reference, run.reference, consumption.mass_g);
        walkOutput(upstreamOutput.reference, upstreamOutput.mass_g, upstreamOutput.reference);
      }
    }
  };

  if (lot.output) walkOutput(lot.output, lot.mass_g, lot.reference);
  for (const component of lot.components ?? []) {
    const componentLot = sources.lots.get(component.lot);
    if (!componentLot) continue;
    const componentNode = node('lot', componentLot.reference);
    componentNode.mass_g = componentLot.mass_g;
    edge(componentLot.reference, lot.reference, component.mass_g);
    if (componentLot.output) walkOutput(componentLot.output, componentLot.mass_g, componentLot.reference);
  }

  const nodeList = [...nodes.values()];
  const flagged = nodeList.some((n) => n.flags.length > 0);
  const text_equivalent = describe(lot.reference, nodeList, [...edges.values()]);
  return { lot: lot.reference, nodes: nodeList, edges: [...edges.values()], flagged, text_equivalent };
}

function describe(lotRef: string, nodes: GenealogyNode[], edges: GenealogyEdge[]): string {
  const lines: string[] = [`Lot ${lotRef}`];
  const byRef = new Map(nodes.map((n) => [n.reference, n]));
  const visit = (reference: string, depth: number, seen: Set<string>): void => {
    for (const e of edges.filter((x) => x.to === reference)) {
      const n = byRef.get(e.from);
      if (!n) continue;
      const split = Object.entries(n.category_split).map(([k, v]) => `${k} ${v} g`).join(', ');
      const flags = n.flags.length ? ` flags: ${n.flags.join(', ')}` : '';
      lines.push(`${'  '.repeat(depth)}- ${n.kind} ${n.reference}: ${e.mass_g} g into ${reference}; total ${n.mass_g} g${split ? ` (${split})` : ''}${flags}`);
      if (!seen.has(e.from)) {
        seen.add(e.from);
        visit(e.from, depth + 1, seen);
      }
    }
  };
  visit(lotRef, 1, new Set([lotRef]));
  return lines.join('\n');
}

export interface Impact {
  batch: string;
  lots: string[];
  certificates: string[];
  recipients: string[];
  runs: string[];
}

/** Reverse traversal: everything downstream of a batch. */
export function buildImpact(
  batchRef: string,
  consumptions: ConsumptionRow[],
  outputs: OutputRow[],
  lots: LotRow[],
  certificates: CertificateRow[],
  recipientName: (recipient: string) => string,
): Impact {
  const runsReached = new Set<string>();
  const outputsReached = new Set<string>();
  const queue: string[] = [batchRef];
  while (queue.length) {
    const input = queue.shift() as string;
    for (const consumption of consumptions) {
      if (consumption.input !== input || runsReached.has(consumption.run)) continue;
      runsReached.add(consumption.run);
      for (const output of outputs) {
        if (output.run === consumption.run && !outputsReached.has(output.reference)) {
          outputsReached.add(output.reference);
          queue.push(output.reference);
        }
      }
    }
  }
  const lotsReached = new Set<string>();
  for (const lot of lots) if (lot.output && outputsReached.has(lot.output)) lotsReached.add(lot.reference);
  let grew = true;
  while (grew) {
    grew = false;
    for (const lot of lots) {
      if (lotsReached.has(lot.reference)) continue;
      if ((lot.components ?? []).some((c) => lotsReached.has(c.lot))) {
        lotsReached.add(lot.reference);
        grew = true;
      }
    }
  }
  const certs = certificates.filter((c) => c.lots.some((l) => lotsReached.has(l.reference)));
  const recipients = [...new Set(certs.map((c) => recipientName(c.recipient)))];
  return {
    batch: batchRef,
    lots: [...lotsReached],
    certificates: certs.map((c) => c.number),
    recipients,
    runs: [...runsReached],
  };
}
