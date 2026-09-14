// Domain engine: batch view, genealogy traversal, ledger arithmetic, carbon answers.
// Nothing in here writes an operational record; every figure is derived.
import { computeDryMass, computeCredit, computeContentBp } from './units.js';

export const CUSTODY_KINDS = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];

export function missingCustodyKinds(custody) {
  const kinds = new Set((custody || []).map((l) => l.kind));
  return CUSTODY_KINDS.filter((k) => !kinds.has(k));
}

const isoDay = (d) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);

export function calibrationLapsed(calibrated_on, received_on) {
  if (!calibrated_on || !received_on) return false;
  const cal = new Date(isoDay(calibrated_on) + 'T00:00:00Z').getTime();
  const rec = new Date(isoDay(received_on) + 'T00:00:00Z').getTime();
  const twelveMonths = 365.25 * 24 * 3600 * 1000;
  return (rec - cal) > twelveMonths;
}

export async function approvalOn(db, collector, date) {
  const r = await db.query(
    `SELECT * FROM approval_period WHERE collector=$1 AND $2 BETWEEN valid_from AND valid_to
     ORDER BY valid_from DESC LIMIT 1`, [collector, date]);
  return r.rows[0] || null;
}

export async function batchView(db, row) {
  const approval = await approvalOn(db, row.collector, row.received_on);
  const missing = missingCustodyKinds(row.custody);
  const lapsed = calibrationLapsed(row.calibrated_on || null, row.received_on);
  const flags = [];
  if (lapsed) flags.push('lapsed_calibration');
  let claimable = false;
  let claimable_reason = null;
  let claimable_from = row.claimable_from || null;
  if (!approval || (approval.state !== 'approved' && approval.state !== 'conditional')) {
    claimable = false;
    claimable_reason = approval ? `collector_approval_${approval.state}` : 'collector_approval_lapsed';
  } else if (missing.length) {
    claimable = false;
    claimable_reason = 'custody_link_missing';
  } else {
    claimable = true;
  }
  if (!claimable && missing.length && row.claimable_from) {
    claimable = true;
    claimable_reason = null;
  }
  const dry_mass_g = computeDryMass(row.net_g, row.moisture_bp);
  return {
    reference: row.reference,
    collector: row.collector,
    collector_name: row.collector_name,
    site: row.site,
    grade: row.grade,
    category: row.category,
    gross_g: row.gross_g,
    tare_g: row.tare_g,
    net_g: row.net_g,
    moisture_bp: row.moisture_bp,
    moisture_method: row.moisture_method,
    device: row.device,
    device_calibration: row.calibrated_on || null,
    received_on: row.received_on,
    composition: (row.composition || []).map((c) => ({
      polymer: c.polymer, fraction_bp: c.fraction_bp, basis: c.basis,
      measured_fraction_bp: c.measured_fraction_bp ?? null
    })),
    contamination: row.contamination,
    custody: row.custody || [],
    custody_complete: missing.length === 0,
    missing_custody_kinds: missing,
    accepted_g: row.accepted_g,
    rejected_g: row.rejected_g,
    rejected_destination: row.rejected_destination,
    dry_mass_g,
    claimable,
    claimable_reason,
    claimable_from,
    flags,
    approval_in_force: approval ? {
      state: approval.state, valid_from: approval.valid_from, valid_to: approval.valid_to,
      condition: approval.condition || null, condition_closes_on: approval.condition_closes_on || null
    } : null,
    recorded_at: row.recorded_at,
    entered_by: row.entered_by
  };
}

// ---------------------------------------------------------------------------
// Genealogy: a traversal over consumption records. A graph, not a tree.
// ---------------------------------------------------------------------------
export async function loadGraph(db) {
  const runs = (await db.query('SELECT * FROM run')).rows;
  const consumptions = (await db.query('SELECT * FROM consumption')).rows;
  const outputs = (await db.query('SELECT * FROM output')).rows;
  const lots = (await db.query('SELECT * FROM lot')).rows;
  const batches = (await db.query(
    'SELECT b.*, w.calibrated_on FROM batch b LEFT JOIN weighing_device w ON w.reference = b.device')).rows;
  const byRun = new Map();
  for (const o of outputs) {
    if (!byRun.has(o.run)) byRun.set(o.run, []);
    byRun.get(o.run).push(o);
  }
  const consByRun = new Map();
  for (const c of consumptions) {
    if (!consByRun.has(c.run)) consByRun.set(c.run, []);
    consByRun.get(c.run).push(c);
  }
  return { runs, consumptions, outputs, lots, batches, byRun, consByRun };
}

function batchFlags(b) {
  const flags = [];
  if (calibrationLapsed(b.calibrated_on, b.received_on)) flags.push('lapsed_calibration');
  if (missingCustodyKinds(b.custody).length) flags.push('custody_link_missing');
  return flags;
}

// Runs and output nodes that transitively feed a lot.
function upstreamOfLot(g, lotRef) {
  const runs = new Set();
  const outputs = new Set();
  const queue = [{ kind: 'lot', ref: lotRef }];
  const seen = new Set();
  while (queue.length) {
    const n = queue.shift();
    const key = `${n.kind}:${n.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const [runRef, outs] of g.byRun) {
      const hit = outs.some((o) => (o.kind === n.kind) && o.reference === n.ref);
      if (!hit) continue;
      runs.add(runRef);
      for (const o of outs) {
        if (o.kind === 'intermediate') outputs.add(o.reference);
      }
      for (const c of g.consByRun.get(runRef) || []) {
        if (c.input_kind === 'batch') continue;
        queue.push({ kind: c.input_kind, ref: c.input_ref });
      }
    }
  }
  return { runs, outputs };
}

// Distribute each batch's mass forward through runs, restricted to nodes whose
// downstream reaches the lot. Returns Map nodeKey -> {byBatch, flags}
function attribute(g, batchMass, allowedOutputs, allowedRuns) {
  const attr = new Map();
  const bucket = (key) => {
    if (!attr.has(key)) attr.set(key, { byBatch: new Map(), flags: new Set(), total: 0 });
    return attr.get(key);
  };
  for (const [bref, mass] of batchMass) {
    const b = g.batches.find((x) => x.reference === bref);
    const bk = bucket(`batch:${bref}`);
    bk.byBatch.set(bref, mass);
    bk.total += mass;
    for (const f of batchFlags(b)) bk.flags.add(f);
  }
  // Topological order by hop depth from the batches, so every contribution to
  // a node has landed before that node distributes downstream.
  const depth = new Map();
  for (const k of batchMass.keys()) depth.set(`batch:${k}`, 0);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of g.consumptions) {
      const fromKey = `${c.input_kind}:${c.input_ref}`;
      if (!depth.has(fromKey)) continue;
      for (const o of g.byRun.get(c.run) || []) {
        if (o.kind === 'byproduct') continue;
        const okey = `${o.kind}:${o.reference}`;
        const d = depth.get(fromKey) + 1;
        if (!depth.has(okey) || depth.get(okey) < d) {
          depth.set(okey, d);
          changed = true;
        }
      }
    }
  }
  const order = [...depth.keys()].sort((a, b) => depth.get(a) - depth.get(b));
  for (const key of order) {
    const nb = attr.get(key);
    if (!nb) continue;
    const cpos = key.indexOf(':');
    const kind = key.slice(0, cpos);
    const ref = key.slice(cpos + 1);
    for (const c of g.consumptions) {
      if (c.input_kind !== kind || c.input_ref !== ref) continue;
      if (allowedRuns && !allowedRuns.has(c.run)) continue;
      const outs = g.byRun.get(c.run) || [];
      const totalConsumed = (g.consByRun.get(c.run) || []).reduce((s, x) => s + x.mass_g, 0) || 1;
      const entering = Math.min(nb.total, c.mass_g);
      for (const o of outs) {
        if (o.kind === 'byproduct') continue;
        if (o.kind === 'intermediate' && allowedOutputs && !allowedOutputs.has(o.reference)) continue;
        const okey = `${o.kind}:${o.reference}`;
        const ob = bucket(okey);
        for (const [br, m] of nb.byBatch) {
          const part = Math.floor(m * entering * o.mass_g / (nb.total * totalConsumed));
          ob.byBatch.set(br, (ob.byBatch.get(br) || 0) + part);
          ob.total += part;
        }
        for (const f of nb.flags) ob.flags.add(f);
      }
    }
  }

  return attr;
}

function splitOf(g, bucket, targetMass) {
  const merged = new Map();
  if (bucket) {
    for (const [bref, m] of bucket.byBatch) {
      const b = g.batches.find((x) => x.reference === bref);
      const cat = b ? b.category : 'unknown';
      merged.set(cat, (merged.get(cat) || 0) + m);
    }
  }
  const total = [...merged.values()].reduce((s, m) => s + m, 0);
  if (!total) return {};
  if (targetMass == null || targetMass === total) return Object.fromEntries(merged);
  const keys = [...merged.keys()];
  const out = {};
  let assigned = 0;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) {
      out[k] = targetMass - assigned;
    } else {
      const v = Math.floor(merged.get(k) * targetMass / total);
      out[k] = v;
      assigned += v;
    }
  });
  return out;
}

export async function genealogyForLot(db, lotRef) {
  const g = await loadGraph(db);
  const lot = g.lots.find((l) => l.reference === lotRef);
  if (!lot) return null;
  const { runs: feedingRuns, outputs: feedingOutputs } = upstreamOfLot(g, lotRef);

  const batchMass = new Map();
  for (const runRef of feedingRuns) {
    for (const c of g.consByRun.get(runRef) || []) {
      if (c.input_kind !== 'batch') continue;
      batchMass.set(c.input_ref, (batchMass.get(c.input_ref) || 0) + c.mass_g);
    }
  }
  const attr = attribute(g, batchMass, feedingOutputs, feedingRuns);

  const nodes = [];
  const nodeIndex = new Map();
  function node(key, extra) {
    if (!nodeIndex.has(key)) {
      const n = { key, ...extra };
      nodeIndex.set(key, n);
      nodes.push(n);
    }
    return nodeIndex.get(key);
  }
  node(`lot:${lotRef}`, {
    kind: 'lot', reference: lotRef, mass_g: lot.mass_g,
    category_split: splitOf(g, attr.get(`lot:${lotRef}`), lot.mass_g),
    flags: [...(attr.get(`lot:${lotRef}`)?.flags || [])]
  });
  for (const [bref, mass] of batchMass) {
    const b = g.batches.find((x) => x.reference === bref);
    node(`batch:${bref}`, {
      kind: 'batch', reference: bref, mass_g: mass,
      category_split: { [b.category]: mass },
      flags: batchFlags(b),
      claimable: missingCustodyKinds(b.custody).length === 0
    });
  }
  const edges = [];
  for (const runRef of feedingRuns) {
    const run = g.runs.find((r) => r.reference === runRef);
    node(`run:${runRef}`, {
      kind: 'run', reference: runRef, run_type: run ? run.run_type : null,
      mass_g: (g.consByRun.get(runRef) || []).reduce((s, c) => s + c.mass_g, 0),
      category_split: splitOf(g, attr.get(`run:${runRef}`)),
      flags: []
    });
    for (const c of g.consByRun.get(runRef) || []) {
      edges.push({ from: c.input_ref, to: runRef, mass_g: c.mass_g });
    }
    for (const o of g.byRun.get(runRef) || []) {
      if (o.kind === 'byproduct') continue;
      if (o.kind === 'intermediate' && !feedingOutputs.has(o.reference)) continue;
      if (o.kind === 'lot' && o.reference !== lotRef) continue;
      edges.push({ from: runRef, to: o.reference, mass_g: o.mass_g });
      if (o.kind === 'intermediate') {
        node(`intermediate:${o.reference}`, {
          kind: 'intermediate', reference: o.reference, mass_g: o.mass_g,
          category_split: splitOf(g, attr.get(`intermediate:${o.reference}`)),
          flags: [...(attr.get(`intermediate:${o.reference}`)?.flags || [])]
        });
      }
    }
  }
  const flagged = nodes.some((n) => (n.flags || []).length > 0);
  return {
    lot: lotRef,
    nodes: nodes.map((n) => ({
      kind: n.kind, reference: n.reference, mass_g: n.mass_g,
      category_split: n.category_split || {}, flags: n.flags || [],
      run_type: n.run_type || null, claimable: n.claimable === undefined ? null : n.claimable
    })),
    edges,
    flagged,
    text_equivalent: textEquivalent(nodes, edges, lotRef)
  };
}

function textEquivalent(nodes, edges, lotRef) {
  const outgoing = new Map();
  for (const e of edges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    outgoing.get(e.from).push(e);
  }
  function walk(ref, seen) {
    const n = nodes.find((x) => x.reference === ref);
    if (!n) return null;
    const children = [];
    for (const e of outgoing.get(ref) || []) {
      if (seen.has(e.to)) continue;
      const child = walk(e.to, new Set([...seen, ref]));
      if (child) children.push({ via_mass_g: e.mass_g, ...child });
    }
    return {
      kind: n.kind, reference: n.reference, mass_g: n.mass_g,
      category_split: n.category_split || {}, flags: n.flags || [],
      contributes_to: children
    };
  }
  return [walk(lotRef, new Set())].filter(Boolean);
}

// Backward traversal from a batch: every lot containing any of it, every
// certificate resting on those lots, and every recipient. Complete set.
export async function impactForBatch(db, batchRef) {
  const g = await loadGraph(db);
  const batch = g.batches.find((b) => b.reference === batchRef);
  if (!batch) return null;
  const certs = (await db.query('SELECT number, lots, recipient, state, site FROM certificate')).rows;

  const consumedTotal = g.consumptions
    .filter((c) => c.input_kind === 'batch' && c.input_ref === batchRef)
    .reduce((s, c) => s + c.mass_g, 0);
  const attr = new Map(); // nodeKey -> mass of this batch contained
  attr.set(`batch:${batchRef}`, consumedTotal);
  const depth = new Map([[`batch:${batchRef}`, 0]]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of g.consumptions) {
      const fromKey = `${c.input_kind}:${c.input_ref}`;
      if (!depth.has(fromKey)) continue;
      for (const o of g.byRun.get(c.run) || []) {
        if (o.kind === 'byproduct') continue;
        const okey = `${o.kind}:${o.reference}`;
        const d = depth.get(fromKey) + 1;
        if (!depth.has(okey) || depth.get(okey) < d) {
          depth.set(okey, d);
          changed = true;
        }
      }
    }
  }
  for (const key of [...depth.keys()].sort((a, b) => depth.get(a) - depth.get(b))) {
    const mass = attr.get(key);
    if (!mass) continue;
    const cpos = key.indexOf(':');
    const kind = key.slice(0, cpos);
    const ref = key.slice(cpos + 1);
    for (const c of g.consumptions) {
      if (c.input_kind !== kind || c.input_ref !== ref) continue;
      const outs = g.byRun.get(c.run) || [];
      const totalConsumed = (g.consByRun.get(c.run) || []).reduce((s, x) => s + x.mass_g, 0) || 1;
      const entering = Math.min(mass, c.mass_g);
      for (const o of outs) {
        if (o.kind === 'byproduct') continue;
        const okey = `${o.kind}:${o.reference}`;
        const give = Math.floor(entering * o.mass_g / totalConsumed);
        attr.set(okey, (attr.get(okey) || 0) + give);
      }
    }
  }

  const lotsReached = g.lots
    .filter((l) => (attr.get(`lot:${l.reference}`) || 0) > 0)
    .map((l) => ({
      reference: l.reference, mass_g: l.mass_g, batch_mass_g: attr.get(`lot:${l.reference}`),
      disposition: l.disposition, site: l.site
    }));
  const certificates = [];
  for (const c of certs) {
    const lotsArr = typeof c.lots === 'string' ? JSON.parse(c.lots || '[]') : c.lots;
    if (lotsArr.some((l) => lotsReached.some((r) => r.reference === l.reference))) {
      certificates.push({
        number: c.number, state: c.state, site: c.site, recipient: c.recipient,
        lots: lotsArr.map((l) => l.reference)
      });
    }
  }
  return {
    batch: {
      reference: batch.reference, mass_g: batch.net_g,
      dry_mass_g: computeDryMass(batch.net_g, batch.moisture_bp),
      category: batch.category, flags: batchFlags(batch),
      claimable: missingCustodyKinds(batch.custody).length === 0
    },
    lots: lotsReached,
    certificates,
    recipients: [...new Set(certificates.map((c) => c.recipient))]
  };
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------
export async function ledgerForPeriod(db, periodId) {
  const p = (await db.query('SELECT * FROM balance_period WHERE id=$1', [periodId])).rows[0];
  if (!p) return null;
  const movements = (await db.query('SELECT * FROM credit_movement WHERE period=$1 ORDER BY id', [periodId])).rows;
  const COUNTED_IN = ['consumption', 'carry_over'];
  const COUNTED_OUT = ['allocation', 'expiry'];
  const totals = {};
  for (const cat of ['post_consumer', 'pre_consumer', 'non_claimable']) {
    const ins = movements.filter((m) => m.category === cat && m.direction === 'in' && COUNTED_IN.includes(m.kind)).reduce((s, m) => s + m.mass_g, 0);
    const outs = movements.filter((m) => m.category === cat && m.direction === 'out' && COUNTED_OUT.includes(m.kind)).reduce((s, m) => s + m.mass_g, 0);
    totals[cat] = { credits_in_g: ins, credits_out_g: outs, credits_available_g: ins - outs };
  }
  const factors = (await db.query(
    'SELECT * FROM conversion_factor WHERE site=$1 ORDER BY provisional, published_on DESC', [p.site])).rows;
  const overrides = (await db.query('SELECT count(*)::int AS n FROM override WHERE reviewed=false')).rows[0].n;
  const restatements = (await db.query(
    'SELECT count(*)::int AS n FROM restatement WHERE period=$1 AND state=\'open\'', [periodId])).rows[0].n;
  const findings = (await db.query("SELECT count(*)::int AS n FROM finding WHERE state='open'")).rows[0].n;
  const derivationMovements = movements.map((m) => ({
    id: m.id, category: m.category, direction: m.direction, kind: m.kind, mass_g: m.mass_g,
    derivation: m.derivation, effective_on: m.effective_on
  }));
  return {
    period: p,
    totals,
    non_claimable_input_g: movements.filter((m) => m.kind === 'non_claimable_input').reduce((s, m) => s + m.mass_g, 0),
    conversion_factors: factors.map((f) => ({
      reference: f.reference, factor_bp: f.factor_bp, provisional: f.provisional,
      derivation_window: { from: f.derived_from, to: f.derived_to },
      derived_in_g: f.derived_in_g, derived_out_g: f.derived_out_g, published_on: f.published_on
    })),
    carry_over_limit_bp: p.carry_over_limit_bp,
    override_count: overrides,
    open_restatement_count: restatements,
    open_finding_count: findings,
    state: p.state,
    movements: derivationMovements
  };
}
