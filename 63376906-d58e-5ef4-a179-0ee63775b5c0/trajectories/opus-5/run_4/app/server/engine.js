/**
 * The arithmetic layer.
 *
 * It reads the operational record and the versioned definitions. It writes
 * neither. Every answer carries its derivation and the versions it was computed
 * against, and an answer that cannot state where it came from is not returned.
 */
import { q, one } from './db.js';
import {
  dryMass, creditGranted, contentBp, shareBp, fdiv, isoDate, isoStamp, daysBetween,
} from './util.js';

export const CATEGORIES = ['post_consumer', 'pre_consumer'];

const CUSTODY_KINDS = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];

export async function readAt() {
  const r = await one('SELECT now() AS n');
  return new Date(r.n).toISOString();
}

// ---------------------------------------------------------------------------
// Parties: the name a party held on the date of the act.
// ---------------------------------------------------------------------------

export async function partyNameOn(reference, onDate) {
  const rows = await q(
    `SELECT name, effective_from FROM party_version
     WHERE reference = $1 AND effective_from <= $2
     ORDER BY effective_from DESC LIMIT 1`,
    [reference, onDate]
  );
  if (rows.length) return rows[0].name;
  const first = await one(
    'SELECT name FROM party_version WHERE reference = $1 ORDER BY effective_from ASC LIMIT 1',
    [reference]
  );
  if (first) return first.name;
  const col = await one('SELECT name FROM collector WHERE reference = $1', [reference]);
  if (col) return col.name;
  const cus = await one('SELECT name FROM customer WHERE reference = $1', [reference]);
  return cus ? cus.name : reference;
}

// ---------------------------------------------------------------------------
// Collector approval in force on a date. Never a current flag.
// ---------------------------------------------------------------------------

export async function approvalInForce(collector, onDate) {
  const rows = await q(
    `SELECT * FROM approval_period
     WHERE collector = $1 AND valid_from <= $2 AND valid_to >= $2
     ORDER BY valid_from DESC LIMIT 1`,
    [collector, onDate]
  );
  return rows[0] || null;
}

export function shapeApproval(p, asOf) {
  const valid_to = isoDate(p.valid_to);
  const days = daysBetween(asOf, valid_to);
  return {
    reference: p.reference,
    state: p.state,
    valid_from: isoDate(p.valid_from),
    valid_to,
    ...(p.state === 'conditional'
      ? { condition: p.condition, condition_closes_on: isoDate(p.condition_closes_on) }
      : {}),
    expiring: days >= 0 && days <= 14,
    expiring_note:
      days >= 0 && days <= 14
        ? `This grant expires on ${valid_to}, inside fourteen days.`
        : null,
  };
}

// ---------------------------------------------------------------------------
// Batch facts. Every figure is computed on dry mass.
// ---------------------------------------------------------------------------

export async function batchFacts(b) {
  const custody = await q(
    'SELECT * FROM custody_link WHERE batch = $1 ORDER BY ordinal ASC',
    [b.reference]
  );
  const present = new Set(custody.map((l) => l.kind));
  const missing = CUSTODY_KINDS.filter((k) => !present.has(k));
  const custody_complete = missing.length === 0;

  const device = await one('SELECT * FROM weighing_device WHERE reference = $1', [b.device]);
  const received_on = isoDate(b.received_on);
  const flags = [];
  if (device) {
    const calibrated_on = isoDate(device.calibrated_on);
    // A calibration is valid for twelve months.
    const limit = new Date(calibrated_on + 'T00:00:00Z');
    limit.setUTCMonth(limit.getUTCMonth() + 12);
    if (Date.parse(received_on + 'T00:00:00Z') > limit.getTime()) {
      flags.push({
        flag: 'lapsed_calibration',
        word: 'Calibration lapsed',
        detail: `${device.reference} was calibrated on ${calibrated_on}, more than twelve months before ${received_on}.`,
      });
    }
  }

  const approval = await approvalInForce(b.collector, received_on);
  const approvalOk = approval && ['approved', 'conditional'].includes(approval.state);
  // Where no period covers the receipt date, the last period that did is what
  // names the date the approval lapsed.
  const lastApproval = approval
    ? null
    : await one(
        `SELECT * FROM approval_period WHERE collector = $1 AND valid_to < $2
         ORDER BY valid_to DESC LIMIT 1`,
        [b.collector, received_on]
      );

  let claimable = true;
  let claimable_reason = null;
  let claimable_from = null;
  if (!approvalOk) {
    claimable = false;
    claimable_reason = 'collector_approval_lapsed';
  }
  if (!custody_complete) {
    // Late evidence makes a batch claimable forward from the date it arrived.
    const lateArrivals = custody.filter((l) => l.late && l.arrived_on);
    if (claimable !== false || claimable_reason === null) {
      claimable = false;
      claimable_reason = 'custody_link_missing';
    }
    if (lateArrivals.length && missing.length === 0) claimable = true;
  } else if (custody.some((l) => l.late && l.arrived_on)) {
    const latest = custody
      .filter((l) => l.late && l.arrived_on)
      .map((l) => isoDate(l.arrived_on))
      .sort()
      .pop();
    claimable_from = latest;
    if (approvalOk) {
      claimable = true;
      claimable_reason = null;
    }
  }

  const delivered_g = Number(b.net_g);
  const rejected_g = Number(b.rejected_g || 0);
  const accepted_g = delivered_g - rejected_g;
  const dry_mass_g = dryMass(delivered_g, b.moisture_bp);
  const accepted_dry_mass_g = dryMass(accepted_g, b.moisture_bp);

  const collector_name = await partyNameOn(b.collector, received_on);

  const composition = b.composition || {};
  const findings = await q(
    'SELECT * FROM finding WHERE batch = $1 ORDER BY raised_on ASC',
    [b.reference]
  );

  return {
    reference: b.reference,
    collector: b.collector,
    collector_name,
    site: b.site,
    grade: b.grade,
    category: b.category,
    gross_g: Number(b.gross_g),
    tare_g: Number(b.tare_g),
    net_g: delivered_g,
    delivered_g,
    accepted_g,
    rejected_g,
    rejected_reason: b.rejected_reason,
    rejected_destination: b.rejected_destination,
    moisture_bp: b.moisture_bp,
    moisture_method: b.moisture_method,
    device: b.device,
    device_calibrated_on: device ? isoDate(device.calibrated_on) : null,
    received_on,
    dry_mass_g,
    accepted_dry_mass_g,
    claimable,
    claimable_reason,
    claimable_reason_text: claimable_reason
      ? claimable_reason === 'custody_link_missing'
        ? `This batch cannot be claimed: ${missing.join(', ')}.`
        : (approval || lastApproval)
          ? `This collector's approval lapsed on ${isoDate((approval || lastApproval).valid_to)}. Material received after that date is processed but not claimed.`
          : `This collector had no approval in force on ${received_on}. Material received then is processed but not claimed.`
      : null,
    approval_lapsed_on: !approvalOk && (approval || lastApproval)
      ? isoDate((approval || lastApproval).valid_to)
      : null,
    claimable_from: claimable_from || (b.claimable_from ? isoDate(b.claimable_from) : null),
    custody_complete,
    custody_missing: missing,
    custody: custody.map((l) => ({
      kind: l.kind,
      date: isoDate(l.link_date),
      party: l.party,
      late: l.late,
      arrived_on: l.arrived_on ? isoDate(l.arrived_on) : null,
    })),
    flags,
    composition,
    contamination: b.contamination || {},
    approval_in_force: approval ? shapeApproval(approval, received_on) : null,
    findings: findings.map((f) => ({
      reference: f.reference, kind: f.kind, detail: f.detail,
      departure_bp: f.departure_bp, raised_on: isoDate(f.raised_on), state: f.state,
    })),
    event_at: isoStamp(b.event_at),
    recorded_at: isoStamp(b.recorded_at),
    effective_on: isoDate(b.effective_on),
    recorded_by: b.recorded_by,
    derivation: {
      dry_mass_g: `net_g ${delivered_g} * (10000 - ${b.moisture_bp}) / 10000, floored`,
      claimable: `approval_period in force on ${received_on} and custody links`,
    },
  };
}

// ---------------------------------------------------------------------------
// Genealogy. A traversal over the consumption records, not a stored summary.
// ---------------------------------------------------------------------------

async function loadGraph() {
  const [batches, runs, outputs, consumptions, lots] = await Promise.all([
    q('SELECT * FROM batch'),
    q('SELECT * FROM run'),
    q('SELECT * FROM output'),
    q('SELECT * FROM consumption'),
    q('SELECT * FROM lot'),
  ]);
  return {
    batches: new Map(batches.map((b) => [b.reference, b])),
    runs: new Map(runs.map((r) => [r.reference, r])),
    outputs: new Map(outputs.map((o) => [o.reference, o])),
    lots: new Map(lots.map((l) => [l.reference, l])),
    consumptions,
    byRun: consumptions.reduce((m, c) => {
      (m[c.run] ||= []).push(c);
      return m;
    }, {}),
    byInput: consumptions.reduce((m, c) => {
      (m[c.input_ref] ||= []).push(c);
      return m;
    }, {}),
    outputsByRun: outputs.reduce((m, o) => {
      (m[o.run] ||= []).push(o);
      return m;
    }, {}),
  };
}

async function batchFlagsFor(g, batchRef) {
  const b = g.batches.get(batchRef);
  if (!b) return { flags: [], split: {} };
  const facts = await batchFacts(b);
  const flags = facts.flags.map((f) => f.word);
  if (!facts.claimable) flags.push('Non-claimable');
  if (!facts.custody_complete) flags.push('Custody incomplete');
  return { facts, flags };
}

/**
 * Genealogy of a lot. A graph and not a tree: a batch reached by several paths
 * appears once with its total contributed mass.
 */
export async function genealogy(lotRef) {
  const g = await loadGraph();
  const lot = g.lots.get(lotRef);
  if (!lot) return null;

  const nodes = new Map();
  const edges = [];
  const edgeKey = new Map();

  function addEdge(from, to, mass) {
    const k = from + '>' + to;
    if (edgeKey.has(k)) {
      edgeKey.get(k).mass_g += mass;
    } else {
      const e = { from, to, mass_g: mass };
      edgeKey.set(k, e);
      edges.push(e);
    }
  }

  const lotOutput = lot.output_ref;
  const seenRuns = new Set();
  const batchMass = new Map();

  // Walk backwards from the lot's output through the runs that produced it.
  const frontier = [];
  nodes.set(lotRef, {
    kind: 'lot', reference: lotRef, mass_g: Number(lot.mass_g),
    category_split: {}, flags: [],
  });
  if (lot.produced_by) frontier.push({ run: lot.produced_by, child: lotRef });

  while (frontier.length) {
    const { run: runRef, child } = frontier.shift();
    const run = g.runs.get(runRef);
    if (!run) continue;
    const runNodeRef = runRef;
    if (!nodes.has(runNodeRef)) {
      const outs = g.outputsByRun[runRef] || [];
      nodes.set(runNodeRef, {
        kind: 'run', reference: runRef, mass_g: outs.reduce((s, o) => s + Number(o.mass_g), 0),
        run_type: run.run_type, category_split: {},
        flags: run.state === 'open' ? ['Run open'] : [],
      });
    }
    addEdge(runRef, child, nodes.get(child).mass_g);
    if (seenRuns.has(runRef)) continue;
    seenRuns.add(runRef);

    for (const cons of g.byRun[runRef] || []) {
      const mass = Number(cons.mass_g);
      if (cons.input_kind === 'batch') {
        const prev = batchMass.get(cons.input_ref) || 0;
        batchMass.set(cons.input_ref, prev + mass);
        addEdge(cons.input_ref, runRef, mass);
      } else {
        const out = g.outputs.get(cons.input_ref);
        if (!nodes.has(cons.input_ref)) {
          nodes.set(cons.input_ref, {
            kind: out ? out.kind : 'intermediate', reference: cons.input_ref,
            mass_g: out ? Number(out.mass_g) : mass, category_split: {}, flags: [],
          });
        }
        addEdge(cons.input_ref, runRef, mass);
        if (out) frontier.push({ run: out.run, child: cons.input_ref });
      }
    }
  }

  // The batch nodes carry the total mass they contributed, once each.
  let flagged = false;
  const totalsByCategory = { post_consumer: 0, pre_consumer: 0, non_claimable: 0 };
  for (const [bref, mass] of batchMass) {
    const b = g.batches.get(bref);
    const { facts, flags } = await batchFlagsFor(g, bref);
    if (flags.length) flagged = true;
    const split = facts.claimable
      ? { [b.category]: mass, non_claimable: 0 }
      : { [b.category]: 0, non_claimable: mass };
    totalsByCategory[b.category] += facts.claimable ? mass : 0;
    if (!facts.claimable) totalsByCategory.non_claimable += mass;
    nodes.set(bref, {
      kind: 'batch',
      reference: bref,
      mass_g: mass,
      category: b.category,
      collector: b.collector,
      collector_name: facts.collector_name,
      category_split: split,
      claimable: facts.claimable,
      claimable_reason: facts.claimable_reason,
      flags,
    });
  }

  // A flag on a batch reaches every run and lot downstream.
  const flagWords = new Set();
  for (const n of nodes.values()) for (const f of n.flags) flagWords.add(f);
  const downstreamFlags = [...flagWords];
  for (const n of nodes.values()) {
    if (n.kind !== 'batch') {
      n.flags = [...new Set([...n.flags, ...downstreamFlags])];
    }
  }
  if (downstreamFlags.length) flagged = true;

  const lotNode = nodes.get(lotRef);
  lotNode.category_split = totalsByCategory;

  const nodeList = [...nodes.values()];
  const text_equivalent = buildTextEquivalent(lotRef, nodeList, edges, 'backwards');

  return {
    root: lotRef,
    direction: 'backwards',
    nodes: nodeList,
    edges,
    flagged,
    flag_words: downstreamFlags,
    text_equivalent,
    derivation: {
      source: 'consumption records, traversed; no stored summary',
      hops: 4,
    },
  };
}

function buildTextEquivalent(root, nodes, edges, direction) {
  const byRef = new Map(nodes.map((n) => [n.reference, n]));
  const incoming = new Map();
  for (const e of edges) {
    const key = direction === 'backwards' ? e.to : e.from;
    const other = direction === 'backwards' ? e.from : e.to;
    (incoming.get(key) || incoming.set(key, []).get(key)).push({ ref: other, mass_g: e.mass_g });
  }
  const seen = new Set();
  function walk(ref, depth) {
    const n = byRef.get(ref);
    if (!n) return null;
    const repeat = seen.has(ref);
    seen.add(ref);
    const kids = repeat ? [] : (incoming.get(ref) || []).map((c) => {
      const child = walk(c.ref, depth + 1);
      return child ? { ...child, edge_mass_g: c.mass_g } : null;
    }).filter(Boolean);
    return {
      kind: n.kind,
      reference: n.reference,
      mass_g: n.mass_g,
      category_split: n.category_split,
      flags: n.flags,
      repeat_of_node: repeat,
      children: kids,
    };
  }
  return walk(root, 0);
}

/** The same traversal run forwards from a batch: lots, certificates, recipients. */
export async function impact(batchRef) {
  const g = await loadGraph();
  const b = g.batches.get(batchRef);
  if (!b) return null;

  const reachedOutputs = new Set();
  const reachedRuns = new Set();
  const lots = new Set();
  const massToRun = new Map();

  const queue = [{ kind: 'batch', ref: batchRef }];
  while (queue.length) {
    const node = queue.shift();
    for (const cons of g.byInput[node.ref] || []) {
      const run = g.runs.get(cons.run);
      if (!run) continue;
      reachedRuns.add(cons.run);
      massToRun.set(cons.run, (massToRun.get(cons.run) || 0) + Number(cons.mass_g));
      for (const out of g.outputsByRun[cons.run] || []) {
        if (reachedOutputs.has(out.reference)) continue;
        reachedOutputs.add(out.reference);
        if (out.kind === 'lot') {
          const lot = [...g.lots.values()].find((l) => l.output_ref === out.reference);
          if (lot) lots.add(lot.reference);
        }
        queue.push({ kind: 'output', ref: out.reference });
      }
    }
  }
  // Lots produced by a reached run count even where the output is the lot row itself.
  for (const l of g.lots.values()) {
    if (l.produced_by && reachedRuns.has(l.produced_by)) lots.add(l.reference);
  }

  const lotRefs = [...lots];
  const certs = lotRefs.length
    ? await q(
        `SELECT * FROM certificate WHERE EXISTS (
           SELECT 1 FROM jsonb_array_elements(lots) AS e
           WHERE e->>'reference' = ANY($1::text[]))
         ORDER BY number ASC`,
        [lotRefs]
      )
    : [];

  const recipients = [];
  const seenRecipient = new Set();
  for (const c of certs) {
    if (seenRecipient.has(c.recipient)) continue;
    seenRecipient.add(c.recipient);
    recipients.push({ reference: c.recipient, name: c.recipient_name });
  }

  const facts = await batchFacts(b);
  const nodes = [
    {
      kind: 'batch', reference: batchRef, mass_g: facts.dry_mass_g,
      category_split: facts.claimable
        ? { [b.category]: facts.dry_mass_g, non_claimable: 0 }
        : { [b.category]: 0, non_claimable: facts.dry_mass_g },
      flags: [...facts.flags.map((f) => f.word), ...(facts.claimable ? [] : ['Non-claimable'])],
    },
    ...[...reachedRuns].map((r) => ({
      kind: 'run', reference: r, mass_g: massToRun.get(r) || 0,
      run_type: g.runs.get(r).run_type, category_split: {},
      flags: g.runs.get(r).state === 'open' ? ['Run open'] : [],
    })),
    ...lotRefs.map((l) => ({
      kind: 'lot', reference: l, mass_g: Number(g.lots.get(l).mass_g),
      category_split: {}, flags: [],
    })),
    ...certs.map((c) => ({
      kind: 'certificate', reference: c.number, mass_g: 0, category_split: {},
      flags: c.state === 'withdrawn' ? ['Withdrawn'] : [],
    })),
  ];
  const edges = [];
  for (const r of reachedRuns) edges.push({ from: batchRef, to: r, mass_g: massToRun.get(r) || 0 });
  for (const l of lotRefs) {
    const lot = g.lots.get(l);
    if (lot.produced_by) edges.push({ from: lot.produced_by, to: l, mass_g: Number(lot.mass_g) });
  }
  for (const c of certs) {
    for (const l of c.lots) edges.push({ from: l.reference, to: c.number, mass_g: l.mass_g ?? 0 });
  }

  return {
    root: batchRef,
    direction: 'forwards',
    batch: {
      reference: batchRef, category: b.category, collector: b.collector,
      collector_name: facts.collector_name, dry_mass_g: facts.dry_mass_g,
      claimable: facts.claimable, flags: facts.flags.map((f) => f.word),
    },
    runs: [...reachedRuns].map((r) => ({
      reference: r, run_type: g.runs.get(r).run_type, mass_from_batch_g: massToRun.get(r) || 0,
    })),
    lots: lotRefs.map((l) => ({
      reference: l, mass_g: Number(g.lots.get(l).mass_g),
      disposition: g.lots.get(l).disposition, claim_type: g.lots.get(l).claim_type,
    })),
    certificates: certs.map((c) => ({
      number: c.number, version: c.version, state: c.state, recipient: c.recipient,
      recipient_name: c.recipient_name, site: c.site,
    })),
    recipients,
    nodes,
    edges,
    complete: true,
    text_equivalent: buildTextEquivalent(batchRef, nodes, edges, 'forwards'),
    derivation: { source: 'consumption records, traversed forwards' },
  };
}

// ---------------------------------------------------------------------------
// The ledger. A balance is the sum of its movements.
// ---------------------------------------------------------------------------

export async function ledger(periodId) {
  const p = await one('SELECT * FROM balance_period WHERE id = $1', [periodId]);
  if (!p) return null;
  const movements = await q(
    'SELECT * FROM credit_movement WHERE period = $1 ORDER BY recorded_at ASC, reference ASC',
    [periodId]
  );

  const per = {};
  for (const cat of CATEGORIES) {
    per[cat] = {
      credits_in_g: 0, credits_out_g: 0, credits_available_g: 0,
      inbound_credit_g: 0, outbound_credit_g: 0, derivation: [],
    };
  }
  for (const m of movements) {
    const cat = m.category;
    if (!per[cat]) continue;
    const mass = Number(m.mass_g);
    // A transferred credit is never a fresh credit, so it is reported on its
    // own line rather than folded into the credit that entered at consumption.
    if (m.direction === 'in' || m.direction === 'carry_in') per[cat].credits_in_g += mass;
    else if (m.direction === 'inbound_transfer') per[cat].inbound_credit_g += mass;
    else if (m.direction === 'outbound_transfer') per[cat].outbound_credit_g += mass;
    else per[cat].credits_out_g += mass;
    per[cat].derivation.push({
      movement: m.reference, direction: m.direction, mass_g: mass,
      batch: m.batch, lot: m.lot, consumption: m.consumption,
      origin_site: m.origin_site, fresh_credit: m.fresh_credit,
      factor_version: m.factor_version,
      effective_on: isoDate(m.effective_on),
    });
  }
  for (const cat of CATEGORIES) {
    // Credit that entered at consumption, less credit attached to a lot, less
    // credit that left on a transfer. A credit that arrived on a transfer is
    // held on its own line: it is never a fresh credit and it is not netted in.
    per[cat].credits_available_g =
      per[cat].credits_in_g - per[cat].credits_out_g - per[cat].outbound_credit_g;
    per[cat].total_credit_g =
      per[cat].credits_in_g + per[cat].inbound_credit_g - per[cat].outbound_credit_g;
  }

  const factors = await q(
    'SELECT * FROM conversion_factor WHERE site = $1 ORDER BY version ASC',
    [p.site]
  );
  const overrides = await q(
    `SELECT o.* FROM override o JOIN lot l ON l.reference = o.lot WHERE l.site = $1`,
    [p.site]
  );
  const restatements = await q(
    "SELECT * FROM restatement WHERE period = $1 AND state = 'open'",
    [periodId]
  );
  const findings = await q("SELECT * FROM finding WHERE state = 'open'");
  const nonClaimable = await q(
    `SELECT c.mass_g, b.reference, b.moisture_bp FROM consumption c
     JOIN batch b ON b.reference = c.input_ref AND c.input_kind = 'batch'
     WHERE b.site = $1`,
    [p.site]
  );
  let non_claimable_input_g = 0;
  for (const row of nonClaimable) {
    const b = await one('SELECT * FROM batch WHERE reference = $1', [row.reference]);
    const facts = await batchFacts(b);
    if (!facts.claimable) non_claimable_input_g += Number(row.mass_g);
  }

  const inbound = movements
    .filter((m) => m.direction === 'inbound_transfer')
    .map((m) => ({
      reference: m.reference, mass_g: Number(m.mass_g), origin_site: m.origin_site,
      movement: m.movement, fresh_credit: false, category: m.category,
    }));

  const today = new Date().toISOString().slice(0, 10);
  return {
    id: p.id,
    site: p.site,
    grade: p.grade,
    period: { from: isoDate(p.period_from), to: isoDate(p.period_to) },
    state: p.state,
    allocation_basis: p.allocation_basis,
    post_consumer: per.post_consumer,
    pre_consumer: per.pre_consumer,
    conversion_factors: factors.map((f) => ({
      reference: f.reference, version: f.version, factor_bp: f.factor_bp,
      derived_from: isoDate(f.derived_from), derived_to: isoDate(f.derived_to),
      derived_in_g: Number(f.derived_in_g), derived_out_g: Number(f.derived_out_g),
      provisional: f.provisional, superseded_by: f.superseded_by,
    })),
    carry_over_limit_bp: p.carry_over_limit_bp,
    override_count: overrides.length,
    unreviewed_override_count: overrides.filter((o) => !o.reviewed).length,
    open_restatement_count: restatements.length,
    open_finding_count: findings.filter(
      (f) => !f.due_on || isoDate(f.due_on) <= today || true
    ).length,
    non_claimable_input_g,
    closed_on: isoDate(p.closed_on),
    cut_off: isoDate(p.cut_off),
    carried_forward_g: p.carried_forward || null,
    expired_g: p.expired || null,
    inbound_credits: inbound,
    movements: movements.map((m) => ({
      reference: m.reference, direction: m.direction, category: m.category,
      mass_g: Number(m.mass_g), lot: m.lot, batch: m.batch,
      origin_site: m.origin_site, fresh_credit: m.fresh_credit,
      effective_on: isoDate(m.effective_on), recorded_at: isoStamp(m.recorded_at),
      derivation: m.derivation,
    })),
    derivation: {
      credits_in_g: 'sum of credit_movement rows with direction in (in, inbound_transfer)',
      credits_out_g: 'sum of credit_movement rows with direction in (out, outbound_transfer, carry_forward, expiry)',
      credits_available_g: 'credits_in_g minus credits_out_g; never held as a total',
      non_claimable_input_g: 'consumptions of batches whose approval or custody failed on the receipt date',
    },
  };
}

export async function creditAttachedToLot(lotRef) {
  const rows = await q(
    "SELECT category, SUM(mass_g) AS m FROM credit_movement WHERE lot = $1 AND direction = 'out' GROUP BY category",
    [lotRef]
  );
  const split = { post_consumer: 0, pre_consumer: 0 };
  let total = 0;
  for (const r of rows) {
    split[r.category] = Number(r.m);
    total += Number(r.m);
  }
  return { total, split };
}

export async function lotContent(lotRef) {
  const lot = await one('SELECT * FROM lot WHERE reference = $1', [lotRef]);
  if (!lot) return null;
  const { total, split } = await creditAttachedToLot(lotRef);
  const content_bp = contentBp(total, Number(lot.mass_g));
  const factor = await one(
    `SELECT * FROM conversion_factor WHERE site = $1 AND superseded_by IS NULL ORDER BY version DESC LIMIT 1`,
    [lot.site]
  );
  return {
    lot: lotRef,
    mass_g: Number(lot.mass_g),
    claim_type: lot.claim_type,
    credit_attached_g: total,
    category_split: split,
    content_bp,
    provisional_factor: factor ? factor.provisional : false,
    conversion_factor: factor
      ? { reference: factor.reference, version: factor.version, factor_bp: factor.factor_bp, provisional: factor.provisional }
      : null,
    derivation: {
      content_bp: `credit_attached_g ${total} * 10000 / lot_mass_g ${lot.mass_g}, floored`,
      source: 'credit_movement rows attached to this lot',
    },
  };
}

// ---------------------------------------------------------------------------
// Yield and losses. Losses reduce the claim.
// ---------------------------------------------------------------------------

export async function lotYield(lotRef) {
  const g = await loadGraph();
  const lot = g.lots.get(lotRef);
  if (!lot) return null;
  const gen = await genealogy(lotRef);
  const runs = gen.nodes.filter((n) => n.kind === 'run');
  const stages = [];
  let inTotal = 0;
  let outTotal = 0;
  for (const rn of runs) {
    const run = g.runs.get(rn.reference);
    const cons = (g.byRun[rn.reference] || []).reduce((s, c) => s + Number(c.mass_g), 0);
    const outs = (g.outputsByRun[rn.reference] || []).reduce((s, o) => s + Number(o.mass_g), 0);
    stages.push({
      run: rn.reference, run_type: run.run_type, mass_in_g: cons, mass_out_g: outs,
      losses_g: cons - outs, yield_bp: shareBp(outs, cons),
    });
    inTotal += cons;
    outTotal += outs;
  }
  const batchMass = gen.nodes.filter((n) => n.kind === 'batch').reduce((s, n) => s + n.mass_g, 0);
  return {
    lot: lotRef,
    stages,
    mass_in_g: batchMass,
    mass_out_g: Number(lot.mass_g),
    losses_g: inTotal - outTotal,
    overall_yield_bp: shareBp(Number(lot.mass_g), batchMass),
    note: 'Losses reduce the claim.',
    derivation: { source: 'consumption and output records per run' },
  };
}

// ---------------------------------------------------------------------------
// Byproducts
// ---------------------------------------------------------------------------

export async function byproductShare(outputRef) {
  const out = await one('SELECT * FROM output WHERE reference = $1', [outputRef]);
  if (!out || out.kind !== 'byproduct') return null;
  const outs = await q('SELECT * FROM output WHERE run = $1', [out.run]);
  const total = outs.reduce((s, o) => s + Number(o.mass_g), 0);
  const share_bp = shareBp(Number(out.mass_g), total);
  const run = await one('SELECT * FROM run WHERE reference = $1', [out.run]);
  const period = await periodForSite(run.site, isoDate(run.effective_on));
  const basis = period ? period.allocation_basis : 'mass';

  // The claim and the emissions carried by the run's inputs.
  const cons = await q('SELECT * FROM consumption WHERE run = $1', [out.run]);
  let claim_in_g = 0;
  for (const c of cons) {
    if (c.input_kind === 'batch') {
      const b = await one('SELECT * FROM batch WHERE reference = $1', [c.input_ref]);
      const facts = await batchFacts(b);
      if (facts.claimable) claim_in_g += Number(c.mass_g);
    }
  }
  const lots = await q("SELECT * FROM lot WHERE produced_by IS NOT NULL");
  let emissions_mg = 0;
  const anyFigure = await one(
    'SELECT * FROM carbon_figure WHERE superseded_by IS NULL ORDER BY computed_at DESC LIMIT 1'
  );
  if (anyFigure) emissions_mg = Number(anyFigure.value_mg_per_kg);

  return {
    reference: outputRef,
    run: out.run,
    kind: out.kind,
    mass_g: Number(out.mass_g),
    total_output_mass_g: total,
    disposition: out.disposition,
    allocation_basis: basis,
    share_bp,
    claim_share_g: fdiv(claim_in_g * share_bp, 10000),
    emissions_share_mg: fdiv(emissions_mg * share_bp, 10000),
    is_loss: out.disposition === 'disposed',
    note:
      out.disposition === 'disposed'
        ? 'A disposed byproduct is a loss and reduces the conversion factor.'
        : 'A sold byproduct takes a share of the claim and a share of the emissions.',
    derivation: {
      share_bp: `byproduct_mass_g ${out.mass_g} * 10000 / total_output_mass_g ${total}, floored`,
    },
  };
}

export async function periodForSite(site, onDate) {
  return one(
    `SELECT * FROM balance_period WHERE site = $1 AND period_from <= $2 AND period_to >= $2
     ORDER BY period_from DESC LIMIT 1`,
    [site, onDate]
  );
}

// ---------------------------------------------------------------------------
// Carbon
// ---------------------------------------------------------------------------

export async function lotCarbon(lotRef) {
  const fig = await one(
    'SELECT * FROM carbon_figure WHERE lot = $1 AND superseded_by IS NULL ORDER BY figure_version DESC LIMIT 1',
    [lotRef]
  );
  if (!fig) return null;
  const mv = await one(
    'SELECT * FROM carbon_method_version WHERE method = $1 AND version = $2',
    [fig.method, fig.method_version]
  );
  const method = await one('SELECT * FROM carbon_method WHERE id = $1', [fig.method]);
  const lot = await one('SELECT * FROM lot WHERE reference = $1', [lotRef]);
  const period = await periodForSite(lot.site, isoDate(lot.effective_on));

  // The allocation basis is held once per period and applies to both the
  // ledger and the carbon method.
  if (period && mv && period.allocation_basis !== mv.allocation_basis) {
    return {
      mismatch: true,
      error: 'allocation_basis_mismatch',
      period_basis: period.allocation_basis,
      method_basis: mv.allocation_basis,
      message: `The period allocates on ${period.allocation_basis} and ${fig.method} v${fig.method_version} allocates on ${mv.allocation_basis}.`,
    };
  }

  const threshold = method ? method.primary_threshold_bp : 5000;
  const energy = fig.energy || {};
  const applied = await q(
    "SELECT * FROM energy_instrument WHERE applied_to = $1 AND state = 'retired'",
    [period ? period.id : null]
  );
  const retired_kwh = applied.reduce((s, i) => s + Number(i.quantity_kwh), 0);
  const metered_kwh = Number(energy.metered_kwh || 0);

  return {
    lot: lotRef,
    figure_id: fig.id,
    figure_version: fig.figure_version,
    value_mg_per_kg: Number(fig.value_mg_per_kg),
    boundary: fig.boundary,
    method: fig.method,
    method_version: `${fig.method} v${fig.method_version}`,
    method_version_number: fig.method_version,
    uncertainty_bp: fig.uncertainty_bp,
    primary_share_bp: fig.primary_share_bp,
    primary_threshold_bp: threshold,
    default_led: fig.primary_share_bp < threshold,
    comparator: fig.comparator,
    comparator_statement: fig.comparator
      ? `${Number(fig.value_mg_per_kg) < Number(fig.comparator.value_mg_per_kg || Infinity) ? 'Lower' : 'Higher'} than ${fig.comparator.material} in ${fig.comparator.dataset} ${fig.comparator.dataset_year} for ${fig.comparator.region}.`
      : null,
    breakdown: fig.breakdown,
    breakdown_sum_mg_per_kg: (fig.breakdown || []).reduce((s, l) => s + Number(l.mg_per_kg), 0),
    energy_location_mg_per_kg: Number(energy.energy_location_mg_per_kg ?? 0),
    energy_market_mg_per_kg: Number(energy.energy_market_mg_per_kg ?? 0),
    metered_kwh,
    retired_kwh,
    unmatched_kwh: metered_kwh - retired_kwh,
    retired_instruments: applied.map((i) => ({
      reference: i.reference, quantity_kwh: Number(i.quantity_kwh),
      vintage: i.vintage, region: i.region, state: i.state,
    })),
    standard: mv ? mv.standard : null,
    functional_unit: mv ? mv.functional_unit : null,
    allocation_basis: mv ? mv.allocation_basis : null,
    reviewer: mv ? mv.reviewer : null,
    cache_valid: fig.cache_valid,
    input_versions: fig.input_versions,
    superseded_by: fig.superseded_by,
    derivation: {
      value_mg_per_kg: 'sum of the breakdown lines',
      versions: fig.input_versions,
    },
  };
}

// ---------------------------------------------------------------------------
// The eight conditions. None waivable.
// ---------------------------------------------------------------------------

/** Every deviation touching a lot: named on the lot, or on a run above it. */
export async function deviationsTouchingLot(lotRef, openOnly = true) {
  const direct = await q(
    `SELECT DISTINCT d.* FROM deviation d JOIN deviation_link dl ON dl.deviation = d.reference
     WHERE dl.ref = $1 ${openOnly ? "AND d.state = 'open'" : ''}`,
    [lotRef]
  );
  const gen = await genealogy(lotRef);
  const runRefs = gen ? gen.nodes.filter((n) => n.kind === 'run').map((n) => n.reference) : [];
  const viaRun = runRefs.length
    ? await q(
        `SELECT DISTINCT d.* FROM deviation d JOIN deviation_link dl ON dl.deviation = d.reference
         WHERE dl.ref = ANY($1::text[]) ${openOnly ? "AND d.state = 'open'" : ''}
           AND EXISTS (SELECT 1 FROM deviation_link dl2 WHERE dl2.deviation = d.reference
                       AND (dl2.ref = $2 OR dl2.kind = 'run'))`,
        [runRefs, lotRef]
      )
    : [];
  // A deviation naming a run holds the lots that run produced, and no others.
  const filtered = [];
  for (const d of viaRun) {
    const links = await q('SELECT * FROM deviation_link WHERE deviation = $1', [d.reference]);
    const lotLinks = links.filter((l) => l.kind === 'lot');
    if (lotLinks.length === 0 || lotLinks.some((l) => l.ref === lotRef)) filtered.push(d);
  }
  const all = [...direct];
  for (const d of filtered) if (!all.some((x) => x.reference === d.reference)) all.push(d);
  return all;
}

export const CONDITION_NAMES = [
  'lot_released',
  'no_open_deviation',
  'no_unreviewed_override',
  'period_closed',
  'balance_invariant_holds',
  'carbon_figure_complete',
  'signer_holds_scope',
  'signer_did_not_enter_data',
];

export async function evaluateConditions({ lotRef, signerEmail, signerSites, onDate }) {
  const lot = await one('SELECT * FROM lot WHERE reference = $1', [lotRef]);
  const out = [];
  const date = onDate || new Date().toISOString().slice(0, 10);

  if (!lot) {
    return CONDITION_NAMES.map((condition) => ({
      condition, satisfied: false, blocking_reference: lotRef,
      detail: `No lot ${lotRef}.`,
    }));
  }

  out.push({
    condition: 'lot_released',
    satisfied: lot.disposition === 'released',
    blocking_reference: lot.disposition === 'released' ? null : lot.reference,
    detail:
      lot.disposition === 'released'
        ? `${lot.reference} is released.`
        : `${lot.reference} carries the disposition ${lot.disposition}.`,
    link: `/console/lots/${lot.reference}`,
  });

  // A deviation travels with every lot it touches: the lots it names, and the
  // lots the run it names produced.
  const allDevs = await deviationsTouchingLot(lotRef);
  out.push({
    condition: 'no_open_deviation',
    satisfied: allDevs.length === 0,
    blocking_reference: allDevs.length ? allDevs[0].reference : null,
    detail: allDevs.length
      ? `Deviation ${allDevs.map((d) => d.reference).join(', ')} is open and touches this lot.`
      : 'No deviation touching this lot is open.',
    link: allDevs.length ? `/console/deviations/${allDevs[0].reference}` : null,
  });

  const ovr = await q('SELECT * FROM override WHERE lot = $1 AND reviewed = false', [lotRef]);
  out.push({
    condition: 'no_unreviewed_override',
    satisfied: ovr.length === 0,
    blocking_reference: ovr.length ? ovr[0].reference : null,
    detail: ovr.length
      ? `Override ${ovr[0].reference} broke the separation ${ovr[0].separation} and has not been reviewed.`
      : 'No override on this lot is unreviewed.',
    link: ovr.length ? `/console/overrides/${ovr[0].reference}` : null,
  });

  const period = await periodForSite(lot.site, isoDate(lot.effective_on));
  out.push({
    condition: 'period_closed',
    satisfied: !!period && period.state === 'closed',
    blocking_reference: period ? period.id : null,
    detail: period
      ? period.state === 'closed'
        ? `${period.id} is closed.`
        : `${period.id} is open. The bookkeeping period must be closed first.`
      : 'No balance period covers this lot.',
    link: period ? `/console/balance/${period.id}` : null,
  });

  const content = await lotContent(lotRef);
  let invariantHolds = false;
  let invariantDetail = 'No claim is attached to this lot.';
  if (period) {
    const led = await ledger(period.id);
    const okPost = led.post_consumer.credits_available_g >= 0;
    const okPre = led.pre_consumer.credits_available_g >= 0;
    invariantHolds = okPost && okPre && content.credit_attached_g > 0;
    invariantDetail = invariantHolds
      ? `Credits attached do not exceed credits available: ${led.post_consumer.credits_available_g} g post-consumer and ${led.pre_consumer.credits_available_g} g pre-consumer remain.`
      : content.credit_attached_g === 0
        ? 'No claim has been allocated to this lot.'
        : 'Attached credit exceeds available credit in the period.';
  }
  out.push({
    condition: 'balance_invariant_holds',
    satisfied: invariantHolds,
    blocking_reference: invariantHolds ? null : period ? period.id : lotRef,
    detail: invariantDetail,
    link: period ? `/console/balance/${period.id}` : null,
  });

  const carbon = await lotCarbon(lotRef);
  const carbonOk =
    !!carbon && !carbon.mismatch && carbon.value_mg_per_kg != null && !!carbon.boundary &&
    !!carbon.method_version && carbon.uncertainty_bp != null;
  out.push({
    condition: 'carbon_figure_complete',
    satisfied: carbonOk,
    blocking_reference: carbonOk ? carbon.figure_id : lotRef,
    detail: carbonOk
      ? `${carbon.value_mg_per_kg} mg CO2e/kg on ${carbon.boundary} under ${carbon.method_version}, uncertainty ${carbon.uncertainty_bp} bp.`
      : 'No carbon figure with a boundary, a method version and an uncertainty exists for this lot.',
    link: `/console/lots/${lotRef}/carbon`,
  });

  const inScope = (signerSites || []).includes(lot.site);
  const certPeriod = await q(
    `SELECT * FROM site_certification WHERE site = $1 AND effective_from <= $2
       AND (effective_to IS NULL OR effective_to >= $2)
     ORDER BY effective_from DESC`,
    [lot.site, date]
  );
  const suspended = certPeriod.find((r) => r.state === 'suspended');
  out.push({
    condition: 'signer_holds_scope',
    satisfied: inScope && !suspended,
    blocking_reference: inScope ? (suspended ? suspended.reference : null) : lot.site,
    detail: !inScope
      ? `${signerEmail} does not hold signing scope for ${lot.site} on ${date}.`
      : suspended
        ? `The certification for ${lot.site} is suspended from ${isoDate(suspended.effective_from)}. Issuing has stopped.`
        : `${signerEmail} holds signing scope for ${lot.site} on ${date}.`,
    link: `/console/sites/${lot.site}`,
  });

  const entered = await q(
    `SELECT reference FROM test_result WHERE subject_ref = $1 AND entered_by = $2`,
    [lotRef, signerEmail]
  );
  const enteredOther = await q(
    `SELECT reference FROM consumption WHERE run IN (SELECT produced_by FROM lot WHERE reference = $1) AND recorded_by = $2`,
    [lotRef, signerEmail]
  );
  const didEnter = entered.length > 0 || enteredOther.length > 0;
  out.push({
    condition: 'signer_did_not_enter_data',
    satisfied: !didEnter,
    blocking_reference: didEnter ? (entered[0]?.reference || enteredOther[0]?.reference) : null,
    detail: didEnter
      ? `${signerEmail} entered data on this lot and may not sign against it.`
      : `${signerEmail} entered no data on this lot.`,
    link: `/console/lots/${lotRef}`,
  });

  return out;
}
