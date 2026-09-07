// The arithmetic layer. It reads the operational record and the versioned
// definitions. It writes to neither. Every answer carries its derivation and
// the versions it was computed against.
import { all, one } from './db.js';
import {
  contentBp,
  creditGranted,
  dryMass,
  floorDiv,
  shareBp,
  applyBp,
  carryForward,
} from './units.js';

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export function approvalInForce(periods, onDate) {
  const d = iso(onDate);
  return (
    periods.find((p) => iso(p.valid_from) <= d && d <= iso(p.valid_to)) || null
  );
}

export function calibrationLapsed(calibratedOn, receivedOn) {
  if (!calibratedOn) return true;
  const cal = new Date(calibratedOn);
  const limit = new Date(cal);
  limit.setMonth(limit.getMonth() + 12);
  return new Date(receivedOn) > limit;
}

export const REQUIRED_CUSTODY = [
  'collection_site',
  'collector',
  'transport',
  'arrival',
  'weighing',
  'acceptance',
];

export async function partyNameOn(reference, onDate, fallback) {
  const rows = await all(
    'select name, effective_from from party_version where reference = $1 order by effective_from asc',
    [reference],
  );
  const d = iso(onDate);
  let name = fallback;
  for (const r of rows) if (iso(r.effective_from) <= d) name = r.name;
  return name;
}

export async function batchView(batchRow) {
  const b = batchRow;
  const links = await all(
    'select * from custody_link where batch = $1 order by ordinal asc',
    [b.reference],
  );
  const device = b.device
    ? await one('select * from weighing_device where reference = $1', [b.device])
    : null;
  const periods = await all(
    'select * from approval_period where collector = $1 order by valid_from asc',
    [b.collector],
  );
  const collector = await one('select * from collector where reference = $1', [b.collector]);

  const dry_mass_g = dryMass(b.net_g, b.moisture_bp);
  const approval = approvalInForce(periods, b.received_on);
  const present = new Set(links.map((l) => l.kind));
  const missing = REQUIRED_CUSTODY.filter((k) => !present.has(k));
  const custody_complete = missing.length === 0;

  const flags = [];
  if (device && calibrationLapsed(device.calibrated_on, b.received_on)) {
    flags.push('lapsed_calibration');
  }

  let claimable = true;
  let claimable_reason = null;
  const approvalOk = approval && ['approved', 'conditional'].includes(approval.state);
  if (!approvalOk) {
    claimable = false;
    claimable_reason = 'collector_approval_lapsed';
  } else if (!custody_complete) {
    claimable = false;
    claimable_reason = 'custody_link_missing';
  }
  if (!claimable) flags.push('non_claimable');
  if (!custody_complete) flags.push('custody_link_missing');

  // Late evidence makes the batch claimable from the date it arrived, never
  // retroactively from the receipt date.
  let claimable_from = null;
  if (custody_complete && approvalOk) {
    const late = links.filter((l) => l.late && l.arrived_on);
    claimable_from = late.length
      ? iso(late.map((l) => l.arrived_on).sort().at(-1))
      : iso(b.received_on);
    if (b.claimable_from) claimable_from = iso(b.claimable_from);
  }

  const collector_name = await partyNameOn(b.collector, b.received_on, collector?.name);
  const composition = { ...(b.composition || {}) };
  const delivered_g = b.net_g;
  const accepted_g = b.accepted_g === null || b.accepted_g === undefined
    ? delivered_g - (b.rejected_g || 0)
    : b.accepted_g;

  return {
    reference: b.reference,
    collector: b.collector,
    collector_name,
    site: b.site,
    grade: b.grade,
    category: b.category,
    gross_g: b.gross_g,
    tare_g: b.tare_g,
    net_g: b.net_g,
    delivered_g,
    accepted_g,
    rejected_g: b.rejected_g || 0,
    rejected_destination: b.rejected_destination,
    rejected_reason: b.rejected_reason,
    moisture_bp: b.moisture_bp,
    moisture_method: b.moisture_method,
    device: b.device,
    device_calibrated_on: device ? iso(device.calibrated_on) : null,
    received_on: iso(b.received_on),
    dry_mass_g,
    claimable,
    claimable_reason,
    claimable_from,
    missing_custody_kinds: missing,
    custody_complete,
    flags,
    composition,
    contamination: b.contamination,
    custody: links.map((l) => ({
      kind: l.kind,
      date: iso(l.link_date),
      party: l.party,
      arrived_on: iso(l.arrived_on),
      late: l.late,
    })),
    approval_state_on_receipt: approval?.state || 'none',
    event_at: b.event_at,
    recorded_at: b.recorded_at,
    effective_on: iso(b.effective_on),
    created_by: b.created_by,
    derivation: {
      dry_mass_g: 'net_g * (10000 - moisture_bp) / 10000, floored',
      claimable: `approval period in force on ${iso(b.received_on)}`,
    },
  };
}

// One traversal, used forwards from a lot and backwards from a batch.
export async function loadGraphData() {
  const [consumptions, outputs, runs, batches, lots] = await Promise.all([
    all('select * from consumption'),
    all('select * from output'),
    all('select * from run'),
    all('select * from batch'),
    all('select * from lot'),
  ]);
  return {
    consumptions,
    outputs,
    runs,
    batches: new Map(batches.map((b) => [b.reference, b])),
    lots: new Map(lots.map((l) => [l.reference, l])),
    outputsByRef: new Map(outputs.map((o) => [o.reference, o])),
    outputsByRun: outputs.reduce((m, o) => {
      (m.get(o.run) || m.set(o.run, []).get(o.run)).push(o);
      return m;
    }, new Map()),
    consumptionsByRun: consumptions.reduce((m, c) => {
      (m.get(c.run) || m.set(c.run, []).get(c.run)).push(c);
      return m;
    }, new Map()),
    consumptionsByInput: consumptions.reduce((m, c) => {
      (m.get(c.input_reference) || m.set(c.input_reference, []).get(c.input_reference)).push(c);
      return m;
    }, new Map()),
    runsByRef: new Map(runs.map((r) => [r.reference, r])),
  };
}

async function batchFlags(ref, cache) {
  if (cache.has(ref)) return cache.get(ref);
  const b = await one('select * from batch where reference = $1', [ref]);
  const view = b ? await batchView(b) : null;
  cache.set(ref, view);
  return view;
}

// Genealogy: a graph, not a tree. A batch reached by several paths appears
// once, with the total mass it contributed.
export async function genealogy(lotReference) {
  const g = await loadGraphData();
  const lot = g.lots.get(lotReference);
  if (!lot) return null;
  const viewCache = new Map();

  const nodes = new Map();
  const edgeTotals = new Map();
  const addEdge = (from, to, mass) => {
    const key = `${from}\u0000${to}`;
    edgeTotals.set(key, (edgeTotals.get(key) || 0) + mass);
  };

  const output = lot.output_reference
    ? g.outputsByRef.get(lot.output_reference)
    : [...g.outputsByRef.values()].find((o) => o.reference === lotReference);

  const seenRuns = new Set();
  const queue = [];
  const startOutput = output || g.outputsByRef.get(lotReference);
  nodes.set(lotReference, {
    kind: 'lot',
    reference: lotReference,
    mass_g: lot.mass_g,
    node_flags: [],
  });
  if (startOutput) queue.push({ run: startOutput.run, child: lotReference });

  const childrenOf = new Map(); // parent -> [child]

  while (queue.length) {
    const { run: runRef, child } = queue.shift();
    const run = g.runsByRef.get(runRef);
    if (!run) continue;
    if (!nodes.has(runRef)) {
      const outs = g.outputsByRun.get(runRef) || [];
      nodes.set(runRef, {
        kind: 'run',
        reference: runRef,
        run_type: run.run_type,
        mass_g: outs.reduce((s, o) => s + o.mass_g, 0),
        losses_g: run.losses_g,
        node_flags: run.within_tolerance === false ? ['outside_tolerance'] : [],
      });
    }
    addEdge(runRef, child, nodes.get(child).mass_g);
    (childrenOf.get(runRef) || childrenOf.set(runRef, []).get(runRef)).push(child);
    if (seenRuns.has(runRef)) continue;
    seenRuns.add(runRef);

    for (const c of g.consumptionsByRun.get(runRef) || []) {
      const inputRef = c.input_reference;
      if (g.batches.has(inputRef)) {
        const existing = nodes.get(inputRef);
        if (existing) existing.mass_g += c.mass_g;
        else {
          const view = await batchFlags(inputRef, viewCache);
          nodes.set(inputRef, {
            kind: 'batch',
            reference: inputRef,
            mass_g: c.mass_g,
            collector: view?.collector,
            collector_name: view?.collector_name,
            category: view?.category,
            claimable: view?.claimable,
            node_flags: view?.flags || [],
          });
        }
        addEdge(inputRef, runRef, c.mass_g);
        (childrenOf.get(inputRef) || childrenOf.set(inputRef, []).get(inputRef)).push(runRef);
      } else {
        const out = g.outputsByRef.get(inputRef);
        if (!out) continue;
        if (!nodes.has(inputRef)) {
          nodes.set(inputRef, {
            kind: 'output',
            reference: inputRef,
            mass_g: out.mass_g,
            output_kind: out.kind,
            node_flags: [],
          });
        }
        addEdge(inputRef, runRef, c.mass_g);
        (childrenOf.get(inputRef) || childrenOf.set(inputRef, []).get(inputRef)).push(runRef);
        queue.push({ run: out.run, child: inputRef });
      }
    }
  }

  // Category split per node, derived from the batches beneath it.
  const splits = new Map();
  for (const [ref, node] of nodes) {
    if (node.kind === 'batch') {
      const claimable = node.claimable;
      splits.set(ref, {
        post_consumer: claimable && node.category === 'post_consumer' ? node.mass_g : 0,
        pre_consumer: claimable && node.category === 'pre_consumer' ? node.mass_g : 0,
        non_claimable: claimable ? 0 : node.mass_g,
      });
    }
  }
  // Propagate splits upwards proportionally by consumed mass.
  const order = ['batch', 'output', 'run', 'lot'];
  void order;
  const resolveSplit = (ref, seen = new Set()) => {
    if (splits.has(ref)) return splits.get(ref);
    if (seen.has(ref)) return { post_consumer: 0, pre_consumer: 0, non_claimable: 0 };
    seen.add(ref);
    const node = nodes.get(ref);
    let inputs = [];
    if (node.kind === 'run') {
      inputs = (g.consumptionsByRun.get(ref) || [])
        .filter((c) => nodes.has(c.input_reference))
        .map((c) => ({ ref: c.input_reference, mass: c.mass_g }));
    } else if (node.kind === 'output' || node.kind === 'lot') {
      const out = node.kind === 'lot'
        ? (lot.output_reference ? g.outputsByRef.get(lot.output_reference) : null)
        : g.outputsByRef.get(ref);
      if (out) inputs = [{ ref: out.run, mass: out.mass_g }];
    }
    const totals = { post_consumer: 0, pre_consumer: 0, non_claimable: 0 };
    let totalIn = 0;
    const parts = [];
    for (const i of inputs) {
      const s = resolveSplit(i.ref, seen);
      const sum = s.post_consumer + s.pre_consumer + s.non_claimable;
      parts.push({ s, mass: i.mass, sum });
      totalIn += i.mass;
    }
    if (totalIn === 0) { splits.set(ref, totals); return totals; }
    for (const p of parts) {
      const scale = p.sum === 0 ? 0 : p.mass / p.sum;
      void scale;
      for (const k of Object.keys(totals)) {
        totals[k] += p.sum === 0 ? 0 : floorDiv(BigInt(p.s[k]) * BigInt(p.mass), BigInt(p.sum));
      }
    }
    // Losses reduce every share proportionally to the node's own mass.
    const nodeMass = node.mass_g;
    const inSum = totals.post_consumer + totals.pre_consumer + totals.non_claimable;
    if (inSum > 0 && nodeMass < inSum) {
      for (const k of Object.keys(totals)) {
        totals[k] = floorDiv(BigInt(totals[k]) * BigInt(nodeMass), BigInt(inSum));
      }
    }
    splits.set(ref, totals);
    return totals;
  };
  for (const ref of nodes.keys()) resolveSplit(ref);

  const nodeList = [...nodes.values()].map((n) => ({
    kind: n.kind,
    reference: n.reference,
    mass_g: n.mass_g,
    category_split: splits.get(n.reference) || { post_consumer: 0, pre_consumer: 0, non_claimable: 0 },
    flags: n.node_flags || [],
    run_type: n.run_type,
    output_kind: n.output_kind,
    collector: n.collector,
    collector_name: n.collector_name,
    losses_g: n.losses_g,
  }));

  const edges = [...edgeTotals.entries()].map(([k, mass_g]) => {
    const [from, to] = k.split('\u0000');
    return { from, to, mass_g };
  });

  const flagged = nodeList.some((n) => n.flags.length > 0);

  // The same facts as a nested list: the list is not a summary.
  const nodeByRef = new Map(nodeList.map((n) => [n.reference, n]));
  const parentsOf = new Map();
  for (const e of edges) {
    (parentsOf.get(e.to) || parentsOf.set(e.to, []).get(e.to)).push(e);
  }
  const buildText = (ref, seen = new Set()) => {
    const n = nodeByRef.get(ref);
    const node = {
      kind: n.kind,
      reference: n.reference,
      mass_g: n.mass_g,
      category_split: n.category_split,
      flags: n.flags,
      run_type: n.run_type,
      output_kind: n.output_kind,
      losses_g: n.losses_g,
      inputs: [],
    };
    if (seen.has(ref)) { node.repeated = true; return node; }
    const nextSeen = new Set(seen).add(ref);
    for (const e of parentsOf.get(ref) || []) {
      node.inputs.push({ ...buildText(e.from, nextSeen), contributed_mass_g: e.mass_g });
    }
    return node;
  };

  return {
    lot: lotReference,
    direction: 'backwards_from_lot',
    nodes: nodeList,
    edges,
    flagged,
    text_equivalent: buildText(lotReference),
    derivation: { source: 'consumption and output records, traversed at read time' },
    read_at: new Date().toISOString(),
  };
}

// The reverse traversal: every lot containing any of the batch, every
// certificate resting on those lots, and every recipient.
export async function batchImpact(batchReference) {
  const g = await loadGraphData();
  if (!g.batches.has(batchReference)) return null;

  const reachable = new Set([batchReference]);
  const queue = [batchReference];
  const lotsHit = new Set();
  const runsHit = new Set();
  while (queue.length) {
    const ref = queue.shift();
    for (const c of g.consumptionsByInput.get(ref) || []) {
      runsHit.add(c.run);
      for (const o of g.outputsByRun.get(c.run) || []) {
        if (reachable.has(o.reference)) continue;
        reachable.add(o.reference);
        queue.push(o.reference);
      }
    }
  }
  for (const l of g.lots.values()) {
    if (reachable.has(l.reference) || (l.output_reference && reachable.has(l.output_reference))) {
      lotsHit.add(l.reference);
    }
    // A blended lot inherits the reach of both parents.
    if (l.blended_from) {
      for (const p of l.blended_from) if (lotsHit.has(p.lot)) lotsHit.add(l.reference);
    }
  }

  const certs = await all('select * from certificate order by number asc');
  const touching = certs.filter((c) => (c.lots || []).some((l) => lotsHit.has(l.reference)));

  return {
    batch: batchReference,
    direction: 'forwards_from_batch',
    complete: true,
    runs: [...runsHit].sort(),
    outputs: [...reachable].filter((r) => r !== batchReference).sort(),
    lots: [...lotsHit].sort().map((ref) => {
      const l = g.lots.get(ref);
      return {
        reference: ref,
        mass_g: l.mass_g,
        grade: l.grade,
        site: l.site,
        disposition: l.disposition,
        claim_type: l.claim_type,
      };
    }),
    certificates: touching.map((c) => ({
      number: c.number,
      version: c.version,
      state: c.state,
      site: c.site,
      recipient: c.recipient,
      recipient_name: c.recipient_name,
      issued_on: iso(c.issued_on),
    })),
    recipients: [...new Map(touching.map((c) => [c.recipient, c.recipient_name])).entries()].map(
      ([reference, name]) => ({ reference, name }),
    ),
    read_at: new Date().toISOString(),
    derivation: { source: 'consumption records traversed forwards, certificates matched by lot' },
  };
}

export async function periodMovements(periodId) {
  return all(
    'select * from credit_movement where period = $1 order by id asc',
    [periodId],
  );
}

// A balance is the sum of its movements and is never held as a total.
export function summariseMovements(movements) {
  const cats = ['post_consumer', 'pre_consumer'];
  const out = {};
  for (const cat of cats) {
    const ins = movements.filter((m) => m.category === cat && m.direction === 'in');
    const outs = movements.filter((m) => m.category === cat && m.direction === 'out');
    // Inbound credit from another site is held on its own line. It is never a
    // fresh credit and it never joins the credit this period granted.
    const inbound = movements.filter((m) => m.category === cat && m.direction === 'inbound');
    const credits_in_g = ins.reduce((s, m) => s + m.mass_g, 0);
    const credits_out_g = outs.reduce((s, m) => s + m.mass_g, 0);
    const inbound_credit_g = inbound.reduce((s, m) => s + m.mass_g, 0);
    out[cat] = {
      credits_in_g,
      credits_out_g,
      credits_available_g: credits_in_g - credits_out_g,
      inbound_credit_g,
      total_credit_g: credits_in_g + inbound_credit_g - credits_out_g,
      derivation: {
        credits_in_g: ins.map((m) => ({ movement: m.id, source: m.source_reference, mass_g: m.mass_g, formula: m.derivation?.formula })),
        credits_out_g: outs.map((m) => ({ movement: m.id, lot: m.lot, mass_g: m.mass_g })),
        inbound_credit_g: inbound.map((m) => ({ movement: m.id, transfer: m.movement_reference, origin_site: m.origin_site, mass_g: m.mass_g, fresh_credit: false })),
        credits_available_g: 'credits_in_g minus credits_out_g, summed over the movements above',
      },
    };
  }
  return out;
}

export async function balancePeriodView(period) {
  const movements = await periodMovements(period.id);
  const categories = summariseMovements(movements);
  const factors = await all(
    'select * from conversion_factor where site = $1 order by published_at asc',
    [period.site],
  );
  const lots = await all('select * from lot where site = $1 and grade = $2', [period.site, period.grade]);
  const lotRefs = lots.map((l) => l.reference);
  const overrides = lotRefs.length
    ? await all('select * from override where lot = any($1)', [lotRefs])
    : [];
  const restatements = await all(
    "select * from restatement where period = $1 and state = 'open'",
    [period.id],
  );
  const findings = await all(
    "select * from finding where state = 'open'",
    [],
  );
  const nonClaimable = movements
    .filter((m) => m.source_kind === 'non_claimable_consumption')
    .reduce((s, m) => s + m.mass_g, 0);

  const inbound = movements
    .filter((m) => m.source_kind === 'transfer_in')
    .map((m) => ({
      reference: m.movement_reference,
      mass_g: m.mass_g,
      origin_site: m.origin_site,
      movement: m.source_reference,
      category: m.category,
      fresh_credit: false,
    }));

  return {
    id: period.id,
    site: period.site,
    grade: period.grade,
    period: { from: iso(period.period_from), to: iso(period.period_to) },
    state: period.state,
    carry_over_limit_bp: period.carry_over_limit_bp,
    allocation_basis: period.allocation_basis,
    post_consumer: categories.post_consumer,
    pre_consumer: categories.pre_consumer,
    conversion_factors: factors.map((f) => ({
      reference: f.reference,
      version: f.version,
      factor_bp: f.factor_bp,
      derived_from: iso(f.derived_from),
      derived_to: iso(f.derived_to),
      derived_in_g: f.derived_in_g,
      derived_out_g: f.derived_out_g,
      provisional: f.provisional,
      superseded_by: f.superseded_by,
    })),
    override_count: overrides.length,
    unreviewed_override_count: overrides.filter((o) => !o.reviewed).length,
    open_restatement_count: restatements.length,
    open_finding_count: findings.length,
    non_claimable_input_g: nonClaimable,
    inbound_credits: inbound,
    closed_on: iso(period.closed_on),
    cut_off: iso(period.cut_off),
    carried_forward_g: period.carried_forward,
    expired_g: period.expired,
    lots: lots.map((l) => ({ reference: l.reference, mass_g: l.mass_g, disposition: l.disposition })),
    read_at: new Date().toISOString(),
    derivation: {
      source: 'credit_movement rows summed at read time',
      movements: movements.length,
    },
  };
}

export async function lotClaim(lotReference) {
  const lot = await one('select * from lot where reference = $1', [lotReference]);
  if (!lot) return null;
  const outMovements = await all(
    "select * from credit_movement where lot = $1 and direction = 'out'",
    [lotReference],
  );
  const post = outMovements.filter((m) => m.category === 'post_consumer').reduce((s, m) => s + m.mass_g, 0);
  const pre = outMovements.filter((m) => m.category === 'pre_consumer').reduce((s, m) => s + m.mass_g, 0);
  const credit_attached_g = post + pre;
  return {
    lot: lotReference,
    mass_g: lot.mass_g,
    credit_attached_g,
    category_split: { post_consumer: post, pre_consumer: pre },
    content_bp: lot.blend_content_bp !== null && lot.blend_content_bp !== undefined
      ? lot.blend_content_bp
      : contentBp(credit_attached_g, lot.mass_g),
    claim_type: lot.claim_type,
    derivation: { formula: 'credit_attached_g * 10000 / lot_mass_g, floored', movements: outMovements.map((m) => m.id) },
  };
}

export async function lotYield(lotReference) {
  const g = await loadGraphData();
  const lot = g.lots.get(lotReference);
  if (!lot) return null;
  const gen = await genealogy(lotReference);
  const batchMass = gen.nodes.filter((n) => n.kind === 'batch').reduce((s, n) => s + n.mass_g, 0);
  const runRefs = gen.nodes.filter((n) => n.kind === 'run').map((n) => n.reference);
  const losses = runRefs.reduce((s, r) => s + (g.runsByRef.get(r)?.losses_g || 0), 0);
  return {
    lot: lotReference,
    input_mass_g: batchMass,
    output_mass_g: lot.mass_g,
    losses_g: losses,
    yield_bp: shareBp(lot.mass_g, batchMass),
    runs: runRefs,
    derivation: { formula: 'lot mass_g * 10000 / input mass_g, floored' },
  };
}

export async function byproductShare(outputReference) {
  const out = await one('select * from output where reference = $1', [outputReference]);
  if (!out) return null;
  const siblings = await all('select * from output where run = $1', [out.run]);
  const total = siblings.reduce((s, o) => s + o.mass_g, 0);
  const share_bp = shareBp(out.mass_g, total);
  const run = await one('select * from run where reference = $1', [out.run]);
  const period = await one(
    'select * from balance_period where site = $1 and $2 between period_from and period_to',
    [run.site, run.effective_on],
  );
  // The claim and the emissions the run's inputs carried.
  const consumptions = await all('select * from consumption where run = $1', [out.run]);
  void consumptions;
  const inputClaim = await runInputClaim(out.run);
  // The emissions the run's material carries, taken from the figure on a lot
  // this run's output reaches, and shared on the same basis.
  const downstream = await Promise.all(
    siblings.filter((s) => s.reference !== outputReference).map((s) => reachableLots(s.reference)),
  );
  const lotRefs = [...new Set(downstream.flat())];
  const figure = lotRefs.length
    ? await one(
        'select * from carbon_figure where lot = any($1) and superseded_by is null order by version desc limit 1',
        [lotRefs],
      )
    : null;
  return {
    reference: outputReference,
    run: out.run,
    kind: out.kind,
    disposition: out.disposition,
    mass_g: out.mass_g,
    total_output_mass_g: total,
    share_bp,
    allocation_basis: period?.allocation_basis || out.allocation_basis || 'mass',
    claim_share_g: applyBp(inputClaim, share_bp),
    emissions_share_mg: figure ? applyBp(figure.value_mg_per_kg, share_bp) : 0,
    derivation: { formula: 'byproduct_mass_g * 10000 / total_output_mass_g, floored' },
  };
}

async function reachableLots(outputReference) {
  const g = await loadGraphData();
  const seen = new Set([outputReference]);
  const queue = [outputReference];
  const lots = [];
  while (queue.length) {
    const ref = queue.shift();
    const lot = [...g.lots.values()].find((l) => l.output_reference === ref);
    if (lot) lots.push(lot.reference);
    for (const c of g.consumptionsByInput.get(ref) || []) {
      for (const o of g.outputsByRun.get(c.run) || []) {
        if (seen.has(o.reference)) continue;
        seen.add(o.reference);
        queue.push(o.reference);
      }
    }
  }
  return lots;
}

async function runInputClaim(runReference) {
  const consumptions = await all('select * from consumption where run = $1', [runReference]);
  let total = 0;
  for (const c of consumptions) {
    const b = await one('select * from batch where reference = $1', [c.input_reference]);
    if (b) {
      const view = await batchView(b);
      if (!view.claimable) continue;
      const factor = await one(
        "select * from conversion_factor where site = $1 and superseded_by is null order by published_at desc limit 1",
        [b.site],
      );
      total += creditGranted(c.dry_mass_g, factor?.factor_bp || 0);
    } else {
      const out = await one('select * from output where reference = $1', [c.input_reference]);
      if (out) {
        const parentClaim = await runInputClaim(out.run);
        const siblings = await all('select * from output where run = $1', [out.run]);
        const totalOut = siblings.reduce((s, o) => s + o.mass_g, 0);
        total += applyBp(parentClaim, shareBp(c.mass_g, totalOut));
      }
    }
  }
  return total;
}

export { carryForward, creditGranted, dryMass, contentBp, shareBp, applyBp, iso };
