import { rq } from '../db/pool.js';
import { resolveBatch } from './feedstock.js';

/** Genealogy is a traversal over the consumption records rather than a stored
 *  summary. A batch reached by several paths appears exactly once, with the
 *  total mass it contributed, and the whole thing runs backwards too.
 *
 *  Everything here loads the consumption and output tables once and walks them
 *  in memory, because the reverse traversal is the one a withdrawal runs on the
 *  worst day the company will have and it has five seconds to answer. */
async function loadGraph() {
  const [consumptions, outputs, runs, lots, batches] = await Promise.all([
    rq('SELECT reference, run, input_kind, input_ref, mass_g FROM consumption'),
    rq('SELECT reference, run, kind, mass_g, disposition FROM output'),
    rq('SELECT reference, run_type, site, losses_g, state, recipe_version FROM run'),
    rq('SELECT reference, output_ref, mass_g, site, grade, disposition, claim_type FROM lot'),
    rq('SELECT * FROM batch')
  ]);

  const byRun = new Map();      // run -> consumptions feeding it
  const producedBy = new Map(); // output ref -> run that produced it
  const outputsOfRun = new Map();
  const consumersOf = new Map(); // input ref -> consumptions drawing on it

  for (const c of consumptions) {
    if (!byRun.has(c.run)) byRun.set(c.run, []);
    byRun.get(c.run).push(c);
    if (!consumersOf.has(c.input_ref)) consumersOf.set(c.input_ref, []);
    consumersOf.get(c.input_ref).push(c);
  }
  for (const o of outputs) {
    producedBy.set(o.reference, o.run);
    if (!outputsOfRun.has(o.run)) outputsOfRun.set(o.run, []);
    outputsOfRun.get(o.run).push(o);
  }

  return {
    consumptions, outputs, runs, lots, batches,
    byRun, producedBy, outputsOfRun, consumersOf,
    runByRef: new Map(runs.map((r) => [r.reference, r])),
    outputByRef: new Map(outputs.map((o) => [o.reference, o])),
    lotByRef: new Map(lots.map((l) => [l.reference, l])),
    lotByOutput: new Map(lots.filter((l) => l.output_ref).map((l) => [l.output_ref, l])),
    batchByRef: new Map(batches.map((b) => [b.reference, b]))
  };
}

async function flagsAndSplit(g, batchRefs) {
  const resolved = new Map();
  for (const ref of batchRefs) {
    const row = g.batchByRef.get(ref);
    if (row) resolved.set(ref, await resolveBatch(row));
  }
  return resolved;
}

/** Backwards from a lot: every run, output and batch that reaches it. */
export async function lotGenealogy(lotRef) {
  const g = await loadGraph();
  const lot = g.lotByRef.get(lotRef);
  if (!lot) return null;

  const nodes = new Map();
  const edges = [];
  const edgeSeen = new Set();
  // A batch reached by several paths accumulates its mass here and is emitted
  // once, because drawing it twice would double the claim a reader adds up.
  const batchMass = new Map();

  const addEdge = (from, to, massG) => {
    const key = `${from}>${to}`;
    if (edgeSeen.has(key)) {
      const existing = edges.find((e) => `${e.from}>${e.to}` === key);
      existing.mass_g += massG;
      return;
    }
    edgeSeen.add(key);
    edges.push({ from, to, mass_g: massG });
  };

  const visitOutput = (outputRef, seen) => {
    if (seen.has(`o:${outputRef}`)) return;
    seen.add(`o:${outputRef}`);
    const runRef = g.producedBy.get(outputRef);
    if (!runRef) return;
    nodes.set(runRef, { kind: 'run', reference: runRef, run: g.runByRef.get(runRef) });
    addEdge(runRef, outputRef, Number(g.outputByRef.get(outputRef)?.mass_g || 0));
    for (const c of g.byRun.get(runRef) || []) {
      const mass = Number(c.mass_g);
      if (c.input_kind === 'batch') {
        batchMass.set(c.input_ref, (batchMass.get(c.input_ref) || 0) + mass);
        addEdge(c.input_ref, runRef, mass);
      } else {
        nodes.set(c.input_ref, { kind: 'output', reference: c.input_ref, output: g.outputByRef.get(c.input_ref) });
        addEdge(c.input_ref, runRef, mass);
        visitOutput(c.input_ref, seen);
      }
    }
  };

  const seen = new Set();
  if (lot.output_ref) {
    nodes.set(lot.output_ref, { kind: 'output', reference: lot.output_ref, output: g.outputByRef.get(lot.output_ref) });
    addEdge(lot.output_ref, lotRef, Number(lot.mass_g));
    visitOutput(lot.output_ref, seen);
  }

  const resolved = await flagsAndSplit(g, [...batchMass.keys()]);

  const outNodes = [];
  outNodes.push({
    kind: 'lot',
    reference: lot.reference,
    mass_g: Number(lot.mass_g),
    category_split: null,
    flags: []
  });

  for (const [ref, n] of nodes) {
    if (n.kind === 'run') {
      const r = n.run;
      outNodes.push({
        kind: 'run',
        reference: ref,
        mass_g: (g.byRun.get(ref) || []).reduce((s, c) => s + Number(c.mass_g), 0),
        category_split: null,
        flags: [],
        run_type: r?.run_type || null,
        losses_g: r?.losses_g === null || r?.losses_g === undefined ? null : Number(r.losses_g)
      });
    } else if (n.kind === 'output') {
      const o = n.output;
      outNodes.push({
        kind: 'output',
        reference: ref,
        mass_g: Number(o?.mass_g || 0),
        category_split: null,
        flags: []
      });
    }
  }

  // Each batch once, with the total mass it contributed across every path.
  const split = { post_consumer: 0, pre_consumer: 0, non_claimable: 0 };
  for (const [ref, mass] of batchMass) {
    const b = resolved.get(ref);
    const cat = b ? (b.claimable ? b.category : 'non_claimable') : 'non_claimable';
    split[cat] = (split[cat] || 0) + mass;
    outNodes.push({
      kind: 'batch',
      reference: ref,
      mass_g: mass,
      category_split: { [cat]: mass },
      flags: b ? b.flags : [],
      collector: b?.collector || null,
      collector_name: b?.collector_name || null,
      category: b?.category || null,
      claimable: b ? b.claimable : false,
      claimable_reason: b?.claimable_reason || null
    });
  }

  const lotNode = outNodes[0];
  lotNode.category_split = split;
  // A flag anywhere in the graph is visible from the lot without expanding
  // anything, so the lot node carries what its ancestors carry.
  const inherited = new Set();
  for (const n of outNodes) for (const f of n.flags) inherited.add(f);
  lotNode.flags = [...inherited];

  const flagged = outNodes.some((n) => n.flags.length > 0);

  return {
    lot: lotRef,
    nodes: outNodes,
    edges,
    flagged,
    text_equivalent: nestedFromLot(lotRef, outNodes, edges),
    derivation: {
      source: 'traversal over the consumption records',
      consumption_count: g.consumptions.filter((c) => nodes.has(c.run)).length,
      note: 'A batch reachable by several paths appears once with the total mass it contributed.'
    }
  };
}

/** The same facts as a nested list. Not a summary: the same nodes, the same
 *  masses, the same splits and the same flags. */
function nestedFromLot(rootRef, nodes, edges) {
  const byRef = new Map(nodes.map((n) => [n.reference, n]));
  const incoming = new Map();
  for (const e of edges) {
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to).push(e);
  }
  const build = (ref, trail) => {
    const n = byRef.get(ref);
    if (!n) return null;
    const node = {
      kind: n.kind,
      reference: n.reference,
      mass_g: n.mass_g,
      category_split: n.category_split,
      flags: n.flags,
      children: []
    };
    if (trail.has(ref)) return node;
    const next = new Set(trail).add(ref);
    for (const e of incoming.get(ref) || []) {
      const child = build(e.from, next);
      if (child) node.children.push({ ...child, edge_mass_g: e.mass_g });
    }
    return node;
  };
  return build(rootRef, new Set());
}

/** Forwards from a batch: every lot containing any of it, every certificate
 *  resting on those lots, and every recipient. The complete set, never paged. */
export async function batchImpact(batchRef) {
  const g = await loadGraph();
  if (!g.batchByRef.has(batchRef)) return null;

  const reachedOutputs = new Set();
  const reachedRuns = new Set();
  const queue = [{ kind: 'batch', ref: batchRef }];

  while (queue.length) {
    const cur = queue.shift();
    for (const c of g.consumersOf.get(cur.ref) || []) {
      if (reachedRuns.has(c.run)) continue;
      reachedRuns.add(c.run);
      for (const o of g.outputsOfRun.get(c.run) || []) {
        if (reachedOutputs.has(o.reference)) continue;
        reachedOutputs.add(o.reference);
        queue.push({ kind: 'output', ref: o.reference });
      }
    }
  }

  const lots = [];
  for (const outRef of reachedOutputs) {
    const lot = g.lotByOutput.get(outRef);
    if (lot) lots.push(lot);
  }
  const lotRefs = lots.map((l) => l.reference);

  const certificates = lotRefs.length
    ? await rq(
      `SELECT number, version, site, recipient, recipient_name, state, issued_on, lots, claim_type, content_bp
         FROM certificate
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(lots) l WHERE l->>'reference' = ANY($1))
        ORDER BY number`, [lotRefs])
    : [];

  const recipients = [];
  const seenRecipient = new Set();
  for (const c of certificates) {
    if (seenRecipient.has(c.recipient)) continue;
    seenRecipient.add(c.recipient);
    recipients.push({ reference: c.recipient, name: c.recipient_name });
  }

  const batch = await resolveBatch(g.batchByRef.get(batchRef));

  return {
    batch: batchRef,
    direction: 'forward',
    batch_mass_g: batch.dry_mass_g,
    runs: [...reachedRuns].sort(),
    outputs: [...reachedOutputs].sort(),
    lots: lots.map((l) => ({
      reference: l.reference, mass_g: Number(l.mass_g), site: l.site,
      grade: l.grade, disposition: l.disposition, claim_type: l.claim_type
    })),
    certificates: certificates.map((c) => ({
      number: c.number, version: c.version, site: c.site, state: c.state,
      issued_on: String(c.issued_on).slice(0, 10), recipient: c.recipient,
      recipient_name: c.recipient_name, claim_type: c.claim_type, content_bp: c.content_bp
    })),
    recipients,
    complete: true,
    text_equivalent: {
      kind: 'batch',
      reference: batchRef,
      mass_g: batch.dry_mass_g,
      category_split: { [batch.claimable ? batch.category : 'non_claimable']: batch.dry_mass_g },
      flags: batch.flags,
      children: lots.map((l) => ({
        kind: 'lot',
        reference: l.reference,
        mass_g: Number(l.mass_g),
        category_split: null,
        flags: [],
        children: certificates.filter((c) => (c.lots || []).some((x) => x.reference === l.reference))
          .map((c) => ({
            kind: 'certificate',
            reference: c.number,
            mass_g: null,
            state: c.state,
            flags: c.state === 'withdrawn' ? ['withdrawn'] : [],
            children: [{ kind: 'recipient', reference: c.recipient, name: c.recipient_name, flags: [], children: [] }]
          }))
      }))
    },
    derivation: {
      source: 'the same traversal over the consumption records, run backwards',
      note: 'Complete set by contract. This is the traversal a withdrawal runs.'
    }
  };
}

/** The batches a lot descends from, with the mass each contributed. The ledger
 *  and the carbon layer both need this and neither should re-walk the graph. */
export async function batchContributions(lotRef) {
  const gen = await lotGenealogy(lotRef);
  if (!gen) return [];
  return gen.nodes.filter((n) => n.kind === 'batch');
}

export { loadGraph };
