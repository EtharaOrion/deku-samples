import { q } from '../lib/db.js';
import { floorDiv } from './arithmetic.js';
import { batchViews } from './feedstock.js';

// Genealogy is a traversal over the consumption records rather than a stored
// summary: a graph and not a tree, runnable in both directions.
async function loadGraph() {
  const [consumptions, outputs, lots, batches, runs] = await Promise.all([
    q('SELECT * FROM consumption'),
    q('SELECT * FROM output'),
    q('SELECT * FROM lot'),
    q('SELECT * FROM batch'),
    q('SELECT * FROM run'),
  ]);
  const views = await batchViews(batches);
  const batchByRef = new Map(views.map((b) => [b.reference, b]));
  const outputByRef = new Map(outputs.map((o) => [o.reference, o]));
  const runByRef = new Map(runs.map((r) => [r.reference, r]));
  const lotByOutput = new Map(lots.filter((l) => l.output_ref).map((l) => [l.output_ref, l]));
  const lotByRef = new Map(lots.map((l) => [l.reference, l]));
  return { consumptions, outputs, lots, batches: views, runs, batchByRef, outputByRef, runByRef, lotByOutput, lotByRef };
}

function nodeId(kind, reference) { return `${kind}:${reference}`; }

export async function genealogyOf(lotReference) {
  const g = await loadGraph();
  const lot = g.lotByRef.get(lotReference);
  if (!lot) return null;

  const nodes = new Map();
  const edges = [];
  const seenEdge = new Set();

  function addNode(kind, reference, mass, extra = {}) {
    const id = nodeId(kind, reference);
    if (!nodes.has(id)) nodes.set(id, { id, kind, reference, mass_g: mass, flags: [], category_split: {}, ...extra });
    return nodes.get(id);
  }
  function addEdge(from, to, mass) {
    const key = `${from}|${to}|${mass}`;
    if (seenEdge.has(key)) return;
    seenEdge.add(key);
    edges.push({ from, to, mass_g: mass });
  }

  // walk backwards from the lot to the batches
  const lotNode = addNode('lot', lot.reference, Number(lot.mass_g), { grade: lot.grade, site: lot.site, disposition: lot.disposition, claim_type: lot.claim_type });

  const stack = [];
  if (lot.output_ref) {
    const out = g.outputByRef.get(lot.output_ref);
    if (out) {
      addEdge(nodeId('run', out.run), lotNode.id, Number(out.mass_g));
      stack.push({ kind: 'run', reference: out.run });
    }
  }

  const visitedRuns = new Set();
  const batchContribution = new Map();

  while (stack.length) {
    const item = stack.pop();
    if (item.kind === 'run') {
      if (visitedRuns.has(item.reference)) continue;
      visitedRuns.add(item.reference);
      const run = g.runByRef.get(item.reference);
      if (!run) continue;
      const runOutputs = g.outputs.filter((o) => o.run === run.reference);
      const totalOut = runOutputs.reduce((s, o) => s + Number(o.mass_g), 0);
      addNode('run', run.reference, totalOut, {
        run_type: run.run_type, site: run.site, state: run.state,
        losses_g: run.losses_g === null ? null : Number(run.losses_g),
        recipe_version: run.recipe_version, within_tolerance: run.within_tolerance,
      });
      for (const cons of g.consumptions.filter((c) => c.run === run.reference)) {
        const mass = Number(cons.mass_g);
        if (cons.input_kind === 'batch') {
          batchContribution.set(cons.input_ref, (batchContribution.get(cons.input_ref) || 0) + mass);
          addEdge(nodeId('batch', cons.input_ref), nodeId('run', run.reference), mass);
        } else {
          const out = g.outputByRef.get(cons.input_ref);
          addNode('output', cons.input_ref, out ? Number(out.mass_g) : mass, { kind_detail: out?.kind, produced_by: out?.run });
          addEdge(nodeId('output', cons.input_ref), nodeId('run', run.reference), mass);
          if (out) {
            addEdge(nodeId('run', out.run), nodeId('output', out.reference), Number(out.mass_g));
            stack.push({ kind: 'run', reference: out.run });
          }
        }
      }
    }
  }

  // a batch reachable by several paths appears as exactly one node whose mass_g is
  // the total mass it contributed
  for (const [ref, mass] of batchContribution) {
    const b = g.batchByRef.get(ref);
    const node = addNode('batch', ref, mass, {
      category: b?.category, collector: b?.collector, collector_name: b?.collector_name,
      claimable: b?.claimable, claimable_reason: b?.claimable_reason, received_on: b?.received_on,
    });
    node.mass_g = mass;
    node.flags = [...(b?.flags || [])];
    node.category_split = b?.claimable ? { [b.category]: mass } : { non_claimable: mass };
  }

  propagateSplits(nodes, edges, g);
  propagateFlags(nodes, edges);

  const list = [...nodes.values()].map(({ id, ...rest }) => ({ ...rest, id }));
  const flagged = list.some((n) => n.flags.length > 0);

  return {
    lot: lot.reference,
    nodes: list,
    edges,
    flagged,
    text_equivalent: nestedList(lotNode.id, nodes, edges),
    read_at: new Date().toISOString(),
    derivation: 'traversal over consumption records; a batch reached by several paths appears once with its total contributed mass',
  };
}

function propagateSplits(nodes, edges, g) {
  // forward pass: attribute batch categories through runs and outputs by mass, floored
  const incoming = new Map();
  for (const e of edges) {
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to).push(e);
  }
  const order = topoOrder(nodes, edges);
  for (const id of order) {
    const node = nodes.get(id);
    if (!node || node.kind === 'batch') continue;
    const ins = incoming.get(id) || [];
    const split = {};
    for (const e of ins) {
      const src = nodes.get(e.from);
      if (!src) continue;
      const srcMass = src.mass_g || 0;
      for (const [cat, mass] of Object.entries(src.category_split || {})) {
        const share = srcMass ? floorDiv(mass * e.mass_g, srcMass) : 0;
        split[cat] = (split[cat] || 0) + share;
      }
    }
    if (node.kind === 'output' || node.kind === 'lot') {
      // an output takes its share of the run's inputs by output mass
      const parentEdge = ins[0];
      const parent = parentEdge ? nodes.get(parentEdge.from) : null;
      if (parent && parent.kind === 'run' && parent.mass_g) {
        const scaled = {};
        for (const [cat, mass] of Object.entries(parent.category_split || {})) {
          scaled[cat] = floorDiv(mass * node.mass_g, parent.mass_g);
        }
        node.category_split = scaled;
        continue;
      }
    }
    node.category_split = split;
  }
}

function propagateFlags(nodes, edges) {
  const incoming = new Map();
  for (const e of edges) {
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to).push(e);
  }
  for (const id of topoOrder(nodes, edges)) {
    const node = nodes.get(id);
    if (!node || node.kind === 'batch') continue;
    const inherited = new Set(node.flags);
    for (const e of incoming.get(id) || []) {
      for (const f of nodes.get(e.from)?.flags || []) inherited.add(f);
    }
    node.flags = [...inherited];
  }
}

function topoOrder(nodes, edges) {
  const indeg = new Map([...nodes.keys()].map((k) => [k, 0]));
  const out = new Map([...nodes.keys()].map((k) => [k, []]));
  for (const e of edges) {
    if (!nodes.has(e.from) || !nodes.has(e.to)) continue;
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
    out.get(e.from).push(e.to);
  }
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([k]) => k);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of out.get(id) || []) {
      indeg.set(next, indeg.get(next) - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
  }
  for (const k of nodes.keys()) if (!order.includes(k)) order.push(k);
  return order;
}

// the same facts, as a nested list: not a summary, the same information in another form
function nestedList(rootId, nodes, edges) {
  const incoming = new Map();
  for (const e of edges) {
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to).push(e);
  }
  function build(id, seen) {
    const node = nodes.get(id);
    if (!node) return null;
    const children = [];
    if (!seen.has(id)) {
      const nextSeen = new Set(seen).add(id);
      for (const e of incoming.get(id) || []) {
        const child = build(e.from, nextSeen);
        if (child) children.push({ ...child, edge_mass_g: e.mass_g });
      }
    }
    return {
      kind: node.kind, reference: node.reference, mass_g: node.mass_g,
      category_split: node.category_split, flags: node.flags, children,
    };
  }
  return build(rootId, new Set());
}

// the same traversal backwards: every lot containing any of the batch, every
// certificate resting on those lots, and every recipient.
export async function impactOf(batchReference) {
  const g = await loadGraph();
  const batch = g.batchByRef.get(batchReference);
  if (!batch) return null;

  const reachedOutputs = new Set();
  const reachedRuns = new Set();
  const frontier = [{ kind: 'batch', reference: batchReference }];
  while (frontier.length) {
    const item = frontier.pop();
    const consumers = g.consumptions.filter((c) => c.input_ref === item.reference && c.input_kind === (item.kind === 'batch' ? 'batch' : 'output'));
    for (const c of consumers) {
      if (reachedRuns.has(c.run)) continue;
      reachedRuns.add(c.run);
      for (const o of g.outputs.filter((x) => x.run === c.run)) {
        if (reachedOutputs.has(o.reference)) continue;
        reachedOutputs.add(o.reference);
        frontier.push({ kind: 'output', reference: o.reference });
      }
    }
  }

  const lots = g.lots.filter((l) => l.output_ref && reachedOutputs.has(l.output_ref));
  const lotRefs = lots.map((l) => l.reference);
  const certRows = await q('SELECT * FROM certificate');
  const certs = certRows.filter((c) => (c.payload?.lots || []).some((l) => lotRefs.includes(l.reference)));
  const parties = await q('SELECT * FROM party_version ORDER BY effective_from ASC');

  const recipients = [];
  for (const c of certs) {
    const name = c.payload?.recipient_name || c.recipient;
    if (!recipients.some((r) => r.reference === c.recipient)) {
      recipients.push({ reference: c.recipient, name, certificates: [] });
    }
    recipients.find((r) => r.reference === c.recipient).certificates.push(c.number);
  }

  return {
    batch: batchReference,
    complete: true,
    runs: [...reachedRuns],
    outputs: [...reachedOutputs],
    lots: lots.map((l) => ({ reference: l.reference, grade: l.grade, site: l.site, mass_g: Number(l.mass_g), disposition: l.disposition, claim_type: l.claim_type })),
    certificates: certs.map((c) => ({
      number: c.number, version: c.version, state: c.state, site: c.site,
      recipient: c.recipient, recipient_name: c.payload?.recipient_name || c.recipient,
      lots: (c.payload?.lots || []).map((l) => l.reference),
    })),
    recipients,
    read_at: new Date().toISOString(),
    derivation: 'reverse traversal over consumption records from the batch to every lot, certificate and recipient',
    parties_seen: parties.length,
  };
}
