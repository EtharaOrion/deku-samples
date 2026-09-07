// The arithmetic layer. It reads the operational record and the versioned
// definitions and nothing else, it writes to neither, and every answer it
// returns carries the derivation and the versions it was computed against.
import { q, one, pool } from './db.js';
import {
  dryMassG, creditGrantedG, contentBp, shareBp, floorDiv,
  carryForwardCapG, blendedContentBp, weakerClaim, requiredRemainingBp,
} from './arith.js';

export const CUSTODY_KINDS = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : (d ? String(d).slice(0, 10) : null));
export { iso };

export function monthsBetween(fromISO, toISO) {
  const a = new Date(fromISO + 'T00:00:00Z');
  const b = new Date(toISO + 'T00:00:00Z');
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
}

export function addMonths(dateISO, months) {
  const d = new Date(dateISO + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ parties */

// Every record names the party as it stood on the date of the act.
export async function partyNameOn(reference, dateISO) {
  const rows = await q(
    `SELECT name, effective_from FROM party_version
     WHERE party_reference = $1 AND effective_from <= $2
     ORDER BY effective_from DESC LIMIT 1`, [reference, dateISO]
  );
  if (rows[0]) return rows[0].name;
  const any = await one(
    `SELECT name FROM party_version WHERE party_reference = $1 ORDER BY effective_from ASC LIMIT 1`, [reference]);
  return any ? any.name : reference;
}

/* --------------------------------------------------------------- collectors */

export async function approvalInForce(collector, dateISO) {
  return one(
    `SELECT * FROM approval_period
     WHERE collector = $1 AND valid_from <= $2 AND valid_to >= $2
     ORDER BY valid_from DESC LIMIT 1`, [collector, dateISO]
  );
}

export async function collectorView(reference, todayISO) {
  const c = await one('SELECT * FROM collector WHERE reference = $1', [reference]);
  if (!c) return null;
  const periods = await q(
    'SELECT * FROM approval_period WHERE collector = $1 ORDER BY valid_from ASC', [reference]);
  const findings = await q(
    'SELECT * FROM collector_finding WHERE collector = $1 ORDER BY raised_on ASC', [reference]);
  const today = todayISO || iso(new Date());
  return {
    reference: c.reference,
    name: await partyNameOn(reference, today),
    country: c.country,
    registration: c.registration,
    registration_expiry: iso(c.registration_expiry),
    collection_site_types: c.collection_site_types,
    declared_streams: c.declared_streams,
    scheme_status: c.scheme_status,
    findings: findings.map((f) => ({
      reference: f.id, kind: f.kind, detail: f.detail, raised_on: iso(f.raised_on),
      due_on: iso(f.due_on), state: f.state, batch: f.batch, departure_bp: f.departure_bp,
    })),
    approval_periods: periods.map((p) => {
      const days = Math.floor((new Date(iso(p.valid_to)) - new Date(today)) / 86400000);
      return {
        reference: p.id,
        state: p.state,
        valid_from: iso(p.valid_from),
        valid_to: iso(p.valid_to),
        expiring: days >= 0 && days <= 14,
        ...(p.state === 'conditional'
          ? { condition: p.condition, condition_closes_on: iso(p.condition_closes_on) }
          : {}),
      };
    }),
  };
}

/* ------------------------------------------------------------------ batches */

// A batch resolves its claimability against the approval in force on its
// receipt date, never a current flag.
export async function batchView(reference) {
  const b = await one('SELECT * FROM batch WHERE reference = $1', [reference]);
  if (!b) return null;
  return batchViewFromRow(b);
}

export async function batchViewFromRow(b) {
  const received_on = iso(b.received_on);
  const approval = await approvalInForce(b.collector, received_on);
  const custody = await q('SELECT * FROM custody_link WHERE batch = $1 ORDER BY ordinal ASC', [b.reference]);
  const device = await one('SELECT * FROM weighing_device WHERE reference = $1', [b.device]);

  const present = new Set(custody.map((l) => l.kind));
  const missing = CUSTODY_KINDS.filter((k) => !present.has(k));
  const custody_complete = missing.length === 0;

  const approvalOk = approval && (approval.state === 'approved' || approval.state === 'conditional');
  let claimable = true;
  let claimable_reason = null;
  if (!approvalOk) {
    claimable = false;
    claimable_reason = 'collector_approval_lapsed';
  } else if (!custody_complete) {
    claimable = false;
    claimable_reason = 'custody_link_missing';
  }

  // Late evidence makes the batch claimable forward from the date it arrived.
  let claimable_from = b.claimable_from ? iso(b.claimable_from) : null;
  if (claimable && custody_complete && claimable_from === null) claimable_from = received_on;

  const flags = [];
  if (device && monthsBetween(iso(device.calibrated_on), received_on) >= 12) flags.push('lapsed_calibration');
  if (!claimable) flags.push('non_claimable');

  const dry_mass_g = dryMassG(Number(b.net_g), b.moisture_bp);
  const delivered_g = Number(b.net_g);
  const rejected_g = Number(b.rejected_g || 0);
  const accepted_g = b.accepted_g === null || b.accepted_g === undefined ? delivered_g - rejected_g : Number(b.accepted_g);

  const composition = b.composition || {};
  return {
    reference: b.reference,
    collector: b.collector,
    collector_name: await partyNameOn(b.collector, received_on),
    site: b.site,
    grade: b.grade,
    category: b.category,
    gross_g: Number(b.gross_g),
    tare_g: Number(b.tare_g),
    net_g: delivered_g,
    delivered_g,
    accepted_g,
    rejected_g,
    rejected_destination: b.rejected_destination,
    rejected_reason: b.rejected_reason,
    moisture_bp: b.moisture_bp,
    moisture_method: b.moisture_method,
    device: b.device,
    device_calibrated_on: device ? iso(device.calibrated_on) : null,
    received_on,
    dry_mass_g,
    claimable,
    claimable_reason,
    claimable_missing_kind: custody_complete ? null : missing[0],
    claimable_from,
    custody_complete,
    missing_custody_kinds: missing,
    flags,
    approval_state_on_receipt: approval ? approval.state : 'none',
    approval_valid_to: approval ? iso(approval.valid_to) : null,
    composition,
    contamination: b.contamination || {},
    custody: custody.map((l) => ({
      kind: l.kind, date: iso(l.link_date), party: l.party,
      arrived_on: iso(l.arrived_on), late: l.late,
    })),
    event_at: b.event_at,
    recorded_at: b.recorded_at,
    effective_on: iso(b.effective_on),
    derivation: {
      dry_mass_g: `net_g ${delivered_g} * (10000 - moisture_bp ${b.moisture_bp}) / 10000, floored`,
      claimable: approvalOk
        ? `approval period in force on ${received_on} is ${approval.state}`
        : `no approved or conditional approval period covers ${received_on}`,
      custody: custody_complete ? 'all six custody kinds present' : `missing ${missing.join(', ')}`,
    },
  };
}

/* -------------------------------------------------------------------- runs */

export async function runView(reference) {
  const r = await one('SELECT * FROM run WHERE reference = $1', [reference]);
  if (!r) return null;
  const recipe = await one('SELECT * FROM recipe_version WHERE reference = $1', [r.recipe_version]);
  const consumptions = await q('SELECT * FROM consumption WHERE run = $1 ORDER BY recorded_at ASC', [reference]);
  const outputs = await q('SELECT * FROM output WHERE run = $1 ORDER BY recorded_at ASC', [reference]);
  const massIn = consumptions.reduce((a, c) => a + Number(c.mass_g), 0);
  const massOut = outputs.reduce((a, o) => a + Number(o.mass_g), 0);
  const flags = [];
  for (const c of consumptions) {
    if (c.input_kind === 'batch') {
      const bv = await batchView(c.input_ref);
      if (bv) for (const f of bv.flags) if (!flags.includes(f)) flags.push(f);
      if (bv && !bv.custody_complete) flags.push(`custody_link_missing:${bv.claimable_missing_kind}`);
    }
  }
  return {
    reference: r.reference,
    run_type: r.run_type,
    site: r.site,
    equipment: r.equipment,
    recipe_version: r.recipe_version,
    recipe: recipe ? {
      reference: recipe.reference, set_points: recipe.set_points, tolerances: recipe.tolerances,
      reagents: recipe.reagents, residence_minutes: recipe.residence_minutes,
      released_by: recipe.released_by, released_on: iso(recipe.released_on),
    } : null,
    operator: r.operator,
    started_at: r.started_at,
    closed_at: r.closed_at,
    state: r.state,
    queued: r.queued,
    losses_g: r.losses_g === null ? null : Number(r.losses_g),
    mass_in_g: massIn,
    mass_out_g: massOut,
    actual_set_points: r.actual_set_points,
    within_tolerance: r.within_tolerance,
    flags: [...new Set(flags)],
    consumptions: consumptions.map((c) => ({
      reference: c.reference, input_kind: c.input_kind, input_ref: c.input_ref,
      mass_g: Number(c.mass_g), dry_mass_consumed_g: Number(c.dry_mass_consumed_g),
      credit_granted_g: Number(c.credit_granted_g), category: c.category, claimable: c.claimable,
      factor_version: c.factor_version, effective_on: iso(c.effective_on),
    })),
    outputs: outputs.map((o) => ({
      reference: o.reference, kind: o.kind, mass_g: Number(o.mass_g), disposition: o.disposition,
    })),
    event_at: r.event_at,
    effective_on: iso(r.effective_on),
    derivation: { losses_g: `mass in ${massIn} minus mass out ${massOut}` },
  };
}

export function toleranceCheck(recipe, actual) {
  if (!recipe || !actual) return null;
  const tol = recipe.tolerances || {};
  for (const key of Object.keys(tol)) {
    const range = tol[key];
    const v = actual[key];
    if (v === undefined || v === null) continue;
    if (Number(v) < Number(range.min) || Number(v) > Number(range.max)) return false;
  }
  return true;
}

/* --------------------------------------------------------------- genealogy */

// Genealogy is a traversal over the consumption records rather than a stored
// summary: a graph and not a tree.
export async function genealogy(lotRef) {
  const lot = await one('SELECT * FROM lot WHERE reference = $1', [lotRef]);
  if (!lot) return null;

  const consumptions = await q('SELECT * FROM consumption');
  const outputs = await q('SELECT * FROM output');
  const runs = await q('SELECT * FROM run');
  const byOutput = new Map(outputs.map((o) => [o.reference, o]));
  const byRun = new Map(runs.map((r) => [r.reference, r]));
  const consumedByRun = new Map();
  for (const c of consumptions) {
    if (!consumedByRun.has(c.run)) consumedByRun.set(c.run, []);
    consumedByRun.get(c.run).push(c);
  }

  const nodes = new Map();     // reference -> node
  const edgeAcc = new Map();   // "from|to" -> mass
  const batchMass = new Map(); // batch reference -> total contributed mass

  const addEdge = (from, to, mass) => {
    const k = from + '|' + to;
    edgeAcc.set(k, (edgeAcc.get(k) || 0) + mass);
  };

  const lotOutputRef = lot.output_ref;
  const seenRuns = new Set();

  async function walkRun(runRef, childRef) {
    const run = byRun.get(runRef);
    if (!run) return;
    const cs = consumedByRun.get(runRef) || [];
    if (!nodes.has(runRef)) {
      nodes.set(runRef, {
        kind: 'run', reference: runRef, run_type: run.run_type,
        mass_g: cs.reduce((a, c) => a + Number(c.mass_g), 0),
        losses_g: run.losses_g === null ? null : Number(run.losses_g),
        category_split: {}, flags: [],
      });
    }
    if (childRef) addEdge(runRef, childRef, nodes.get(runRef).mass_g);
    if (seenRuns.has(runRef)) return;
    seenRuns.add(runRef);
    for (const c of cs) {
      const mass = Number(c.mass_g);
      if (c.input_kind === 'batch') {
        batchMass.set(c.input_ref, (batchMass.get(c.input_ref) || 0) + mass);
        addEdge(c.input_ref, runRef, mass);
      } else {
        const out = byOutput.get(c.input_ref);
        if (!out) continue;
        if (!nodes.has(out.reference)) {
          nodes.set(out.reference, {
            kind: out.kind === 'lot' ? 'lot' : (out.kind === 'byproduct' ? 'byproduct' : 'output'),
            reference: out.reference, mass_g: Number(out.mass_g), category_split: {}, flags: [],
          });
        }
        addEdge(out.reference, runRef, mass);
        await walkRun(out.run, out.reference);
      }
    }
  }

  nodes.set(lotRef, {
    kind: 'lot', reference: lotRef, mass_g: Number(lot.mass_g),
    category_split: {}, flags: [], disposition: lot.disposition, claim_type: lot.claim_type,
  });

  if (lotOutputRef) {
    const out = byOutput.get(lotOutputRef);
    if (out) await walkRun(out.run, lotRef);
  }

  // A batch reached by several paths appears once with its total mass.
  const splitByBatch = new Map();
  for (const [ref, mass] of batchMass) {
    const bv = await batchView(ref);
    if (!bv) continue;
    const split = bv.claimable ? { [bv.category]: mass } : { non_claimable: mass };
    splitByBatch.set(ref, split);
    const flags = [...bv.flags];
    if (!bv.custody_complete) flags.push('custody_link_missing');
    nodes.set(ref, {
      kind: 'batch', reference: ref, mass_g: mass, collector: bv.collector,
      collector_name: bv.collector_name, category: bv.category,
      category_split: split, flags,
      claimable: bv.claimable, claimable_reason: bv.claimable_reason,
    });
  }

  // Category split propagates upward by mass, floored at each hop.
  const edges = [...edgeAcc.entries()].map(([k, mass_g]) => {
    const [from, to] = k.split('|');
    return { from, to, mass_g };
  });
  const incoming = new Map();
  for (const e of edges) {
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to).push(e);
  }
  const splitCache = new Map(splitByBatch);
  function splitFor(ref, depth = 0) {
    if (splitCache.has(ref)) return splitCache.get(ref);
    if (depth > 40) return {};
    const ins = incoming.get(ref) || [];
    const node = nodes.get(ref);
    const totalIn = ins.reduce((a, e) => a + e.mass_g, 0);
    const acc = {};
    for (const e of ins) {
      const s = splitFor(e.from, depth + 1);
      const fromNode = nodes.get(e.from);
      const fromMass = fromNode ? fromNode.mass_g : e.mass_g;
      for (const [cat, m] of Object.entries(s)) {
        const scaled = fromMass === 0 ? 0 : floorDiv(m * e.mass_g, fromMass);
        acc[cat] = (acc[cat] || 0) + scaled;
      }
    }
    // Losses reduce the claim: scale the split down to the node's own mass.
    const nodeMass = node ? node.mass_g : totalIn;
    if (totalIn > 0 && nodeMass !== totalIn) {
      for (const cat of Object.keys(acc)) acc[cat] = floorDiv(acc[cat] * nodeMass, totalIn);
    }
    splitCache.set(ref, acc);
    return acc;
  }
  for (const ref of nodes.keys()) {
    const n = nodes.get(ref);
    if (n.kind === 'batch') continue;
    n.category_split = splitFor(ref);
  }
  // A flag anywhere in the graph is visible from the lot.
  const flagged = [...nodes.values()].some((n) => n.flags && n.flags.length > 0);
  const upstreamFlags = new Set();
  for (const n of nodes.values()) for (const f of (n.flags || [])) upstreamFlags.add(f);
  const lotNode = nodes.get(lotRef);
  lotNode.upstream_flags = [...upstreamFlags];

  const nodeList = [...nodes.values()];

  // The same facts as a nested list.
  const drawn = new Set();
  function nest(ref, depth = 0) {
    const n = nodes.get(ref);
    if (!n) return null;
    const dup = drawn.has(ref);
    drawn.add(ref);
    const ins = depth > 40 || dup ? [] : (incoming.get(ref) || []);
    return {
      kind: n.kind,
      reference: n.reference,
      mass_g: n.mass_g,
      category_split: n.category_split,
      flags: n.flags || [],
      repeated: dup,
      inputs: ins.map((e) => ({ edge_mass_g: e.mass_g, node: nest(e.from, depth + 1) })).filter((x) => x.node),
    };
  }
  const text_equivalent = nest(lotRef);

  return {
    lot: lotRef,
    flagged,
    nodes: nodeList,
    edges,
    text_equivalent,
    read_at: new Date().toISOString(),
    derivation: { source: 'consumption and output records', hops: 4 },
  };
}

// The same traversal backwards: every lot containing any of the batch, every
// certificate resting on those lots, and every recipient.
export async function batchImpact(batchRef) {
  const b = await one('SELECT * FROM batch WHERE reference = $1', [batchRef]);
  if (!b) return null;
  const consumptions = await q('SELECT * FROM consumption');
  const outputs = await q('SELECT * FROM output');
  const byRunConsumed = new Map();
  for (const c of consumptions) {
    if (!byRunConsumed.has(c.input_ref)) byRunConsumed.set(c.input_ref, []);
    byRunConsumed.get(c.input_ref).push(c);
  }
  const outputsByRun = new Map();
  for (const o of outputs) {
    if (!outputsByRun.has(o.run)) outputsByRun.set(o.run, []);
    outputsByRun.get(o.run).push(o);
  }
  const reachedOutputs = new Set();
  const reachedRuns = new Set();
  const frontier = [batchRef];
  const guard = new Set();
  while (frontier.length) {
    const ref = frontier.pop();
    if (guard.has(ref)) continue;
    guard.add(ref);
    for (const c of (byRunConsumed.get(ref) || [])) {
      reachedRuns.add(c.run);
      for (const o of (outputsByRun.get(c.run) || [])) {
        if (!reachedOutputs.has(o.reference)) {
          reachedOutputs.add(o.reference);
          frontier.push(o.reference);
        }
      }
    }
  }
  const lots = await q('SELECT * FROM lot');
  const touchedLots = lots.filter((l) => l.output_ref && reachedOutputs.has(l.output_ref));
  const lotRefs = touchedLots.map((l) => l.reference);
  const certs = lotRefs.length
    ? await q(`SELECT * FROM certificate WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(lots) e WHERE e->>'reference' = ANY($1))`, [lotRefs])
    : [];
  const recipients = [];
  for (const c of certs) {
    if (!recipients.find((r) => r.reference === c.recipient)) {
      recipients.push({ reference: c.recipient, name: c.recipient_name });
    }
  }
  return {
    batch: batchRef,
    direction: 'forward_from_batch',
    runs: [...reachedRuns],
    outputs: [...reachedOutputs],
    lots: touchedLots.map((l) => ({
      reference: l.reference, grade: l.grade, site: l.site, mass_g: Number(l.mass_g),
      disposition: l.disposition, claim_type: l.claim_type,
    })),
    certificates: certs.map((c) => ({
      number: c.number, version: c.version, state: c.state, site: c.site,
      recipient: c.recipient, recipient_name: c.recipient_name,
    })),
    recipients,
    complete: true,
    read_at: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ ledger */

export async function periodMovements(periodId) {
  return q('SELECT * FROM credit_movement WHERE period_id = $1 ORDER BY id ASC', [periodId]);
}

// A balance is the sum of its movements and is never held as a total. A credit
// arriving on a transfer is never a fresh credit, so it is reported on its own
// line rather than folded into the credits the period raised itself. The two
// categories are never netted.
export function summariseMovements(movements) {
  const cats = { post_consumer: null, pre_consumer: null };
  for (const cat of Object.keys(cats)) {
    let inG = 0, outG = 0, inboundG = 0;
    for (const m of movements) {
      if (m.category !== cat) continue;
      if (m.direction === 'in') {
        if (m.source_kind === 'transfer_in') inboundG += Number(m.mass_g);
        else inG += Number(m.mass_g);
      } else outG += Number(m.mass_g);
    }
    cats[cat] = {
      credits_in_g: inG,
      credits_out_g: outG,
      credits_available_g: inG - outG,
      inbound_credits_g: inboundG,
      total_credit_held_g: inG + inboundG - outG,
    };
  }
  return cats;
}

export async function balancePeriodView(periodId) {
  const p = await one('SELECT * FROM balance_period WHERE id = $1', [periodId]);
  if (!p) return null;
  const movements = await periodMovements(periodId);
  const sums = summariseMovements(movements);
  const factors = await q(
    'SELECT * FROM conversion_factor WHERE site = $1 ORDER BY version ASC', [p.site]);
  const overrides = await q(
    `SELECT o.* FROM separation_override o JOIN lot l ON l.reference = o.lot WHERE l.site = $1`, [p.site]);
  const restatements = await q(
    `SELECT * FROM restatement WHERE period_id = $1 AND state = 'open'`, [periodId]);
  const findings = await q(`SELECT * FROM collector_finding WHERE state = 'open'`);
  const nonClaimable = movements
    .filter((m) => m.category === 'non_claimable')
    .reduce((a, m) => a + Number(m.mass_g), 0);
  const inbound = movements.filter((m) => m.source_kind === 'transfer_in').map((m) => ({
    reference: m.reference, mass_g: Number(m.mass_g), origin_site: m.origin_site,
    movement: m.movement_ref, fresh_credit: false, category: m.category,
  }));
  const lots = await q('SELECT * FROM lot WHERE period_id = $1', [periodId]);

  const carry = {};
  for (const cat of ['post_consumer', 'pre_consumer']) {
    const cap = carryForwardCapG(sums[cat].credits_in_g, p.carry_over_limit_bp);
    const available = sums[cat].credits_available_g;
    const carried = Math.min(cap, Math.max(available, 0));
    carry[cat] = { cap_g: cap, carried_forward_g: carried, expired_g: Math.max(available, 0) - carried };
  }

  return {
    id: p.id,
    site: p.site,
    grade: p.grade,
    period: { from: iso(p.period_from), to: iso(p.period_to) },
    state: p.state,
    allocation_basis: p.allocation_basis,
    post_consumer: sums.post_consumer,
    pre_consumer: sums.pre_consumer,
    conversion_factors: factors.map((f) => ({
      reference: f.reference, version: f.version, factor_bp: f.factor_bp,
      derived_from: iso(f.derived_from), derived_to: iso(f.derived_to),
      derived_in_g: Number(f.derived_in_g), derived_out_g: Number(f.derived_out_g),
      provisional: f.provisional, superseded_by: f.superseded_by,
    })),
    carry_over_limit_bp: p.carry_over_limit_bp,
    carry_over: p.state === 'closed'
      ? {
        post_consumer: { carried_forward_g: carry.post_consumer.carried_forward_g, expired_g: carry.post_consumer.expired_g },
        pre_consumer: { carried_forward_g: carry.pre_consumer.carried_forward_g, expired_g: carry.pre_consumer.expired_g },
      }
      : {
        post_consumer: { would_carry_forward_g: carry.post_consumer.carried_forward_g, would_expire_g: carry.post_consumer.expired_g },
        pre_consumer: { would_carry_forward_g: carry.pre_consumer.carried_forward_g, would_expire_g: carry.pre_consumer.expired_g },
      },
    override_count: overrides.length,
    unreviewed_override_count: overrides.filter((o) => !o.reviewed).length,
    open_restatement_count: restatements.length,
    open_finding_count: findings.length,
    non_claimable_input_g: nonClaimable,
    inbound_credits: inbound,
    lots: lots.map((l) => l.reference),
    closed_on: iso(p.closed_on),
    cut_off: iso(p.cut_off),
    movements: movements.map((m) => ({
      reference: m.reference, category: m.category, direction: m.direction,
      mass_g: Number(m.mass_g), source_kind: m.source_kind, source_ref: m.source_ref,
      lot: m.lot, origin_site: m.origin_site, fresh_credit: m.fresh_credit,
      effective_on: iso(m.effective_on), derivation: m.derivation,
    })),
    read_at: new Date().toISOString(),
    derivation: {
      credits_in_g: 'sum of credit movements with direction in, per category',
      credits_out_g: 'sum of credit movements with direction out, per category',
      credits_available_g: 'credits_in_g minus credits_out_g',
      non_claimable_input_g: 'dry mass consumed from batches resolving non-claimable on their receipt date',
      carry_over: `credits_in_g * carry_over_limit_bp ${p.carry_over_limit_bp} / 10000, floored`,
    },
  };
}

export async function lotClaim(lotRef) {
  const rows = await q(
    `SELECT category, SUM(mass_g)::bigint AS mass FROM credit_movement
     WHERE lot = $1 AND direction = 'out' AND source_kind = 'allocation' GROUP BY category`, [lotRef]);
  const split = { post_consumer: 0, pre_consumer: 0 };
  for (const r of rows) split[r.category] = Number(r.mass);
  const total = split.post_consumer + split.pre_consumer;
  return { category_split: split, credit_attached_g: total };
}

export async function lotView(lotRef) {
  const l = await one('SELECT * FROM lot WHERE reference = $1', [lotRef]);
  if (!l) return null;
  const claim = await lotClaim(lotRef);
  const content_bp = contentBp(claim.credit_attached_g, Number(l.mass_g));
  const deviations = await q(
    `SELECT * FROM deviation WHERE $1 = ANY(lots)`, [lotRef]);
  const overrides = await q('SELECT * FROM separation_override WHERE lot = $1', [lotRef]);
  const tests = await q(
    `SELECT * FROM test_result WHERE subject_kind = 'lot' AND subject_ref = $1 ORDER BY recorded_at ASC`, [lotRef]);
  const factor = await currentFactor(l.site);
  const flags = [];
  const gen = l.output_ref ? await genealogy(lotRef) : null;
  if (gen) for (const n of gen.nodes) for (const f of (n.flags || [])) if (!flags.includes(f)) flags.push(f);
  if (factor?.provisional) flags.push('provisional_factor');
  return {
    reference: l.reference,
    grade: l.grade,
    site: l.site,
    sites_named: l.sites_named && l.sites_named.length ? l.sites_named : [l.site],
    mass_g: Number(l.mass_g),
    disposition: l.disposition,
    disposition_by: l.disposition_by,
    claim_type: l.claim_type,
    content_bp,
    credit_attached_g: claim.credit_attached_g,
    category_split: claim.category_split,
    period: l.period_id,
    specification_version: l.specification_version,
    provisional_factor: !!factor?.provisional,
    conversion_factor: factor ? { reference: factor.reference, factor_bp: factor.factor_bp, provisional: factor.provisional } : null,
    flags,
    blended_from: l.blended_from,
    open_deviations: deviations.filter((d) => d.state === 'open').map((d) => d.reference),
    deviations: deviations.map((d) => ({ reference: d.reference, state: d.state, outcome: d.outcome, detail: d.detail })),
    overrides: overrides.map((o) => ({
      reference: o.reference, separation: o.separation, reason: o.reason,
      authorised_by: o.authorised_by, reviewed: o.reviewed, reviewed_by: o.reviewed_by,
      recorded_at: o.recorded_at, effective_on: iso(o.effective_on),
    })),
    test_results: tests.map((t) => ({
      reference: t.reference, property: t.property, method: t.method, value: t.value,
      unit: t.unit, uncertainty_bp: t.uncertainty_bp, analyst: t.analyst,
      entered_by: t.entered_by, method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release,
    })),
    output_ref: l.output_ref,
    run_ref: l.run_ref,
    derivation: {
      content_bp: `credit_attached_g ${claim.credit_attached_g} * 10000 / lot_mass_g ${Number(l.mass_g)}, floored`,
      credit_attached_g: 'sum of allocation movements against this lot',
    },
    read_at: new Date().toISOString(),
  };
}

export async function currentFactor(site, onISO) {
  const rows = await q(
    `SELECT * FROM conversion_factor WHERE site = $1 ORDER BY version DESC`, [site]);
  return rows.find((r) => !r.superseded_by) || rows[0] || null;
}

/* ------------------------------------------------------------------- yield */

export async function lotYield(lotRef) {
  const gen = await genealogy(lotRef);
  if (!gen) return null;
  const runNodes = gen.nodes.filter((n) => n.kind === 'run');
  const inputMass = gen.nodes.filter((n) => n.kind === 'batch').reduce((a, n) => a + n.mass_g, 0);
  const lotNode = gen.nodes.find((n) => n.reference === lotRef);
  const losses = runNodes.reduce((a, n) => a + (n.losses_g || 0), 0);
  return {
    lot: lotRef,
    input_mass_g: inputMass,
    lot_mass_g: lotNode ? lotNode.mass_g : 0,
    losses_g: losses,
    yield_bp: inputMass === 0 ? 0 : shareBp(lotNode ? lotNode.mass_g : 0, inputMass),
    per_run: runNodes.map((n) => ({ run: n.reference, mass_in_g: n.mass_g, losses_g: n.losses_g })),
    derivation: { yield_bp: 'lot mass * 10000 / total batch mass reaching the lot, floored' },
  };
}

/* ----------------------------------------------------------------- carbon */

export async function carbonForLot(lotRef) {
  const fig = await one(
    `SELECT * FROM carbon_figure WHERE lot = $1 AND superseded_by IS NULL ORDER BY version DESC LIMIT 1`, [lotRef]);
  if (!fig) return null;
  const method = await one(
    'SELECT * FROM carbon_method WHERE id = $1 AND version = $2', [fig.method_id, fig.method_version]);
  const lot = await one('SELECT * FROM lot WHERE reference = $1', [lotRef]);
  const period = lot ? await one('SELECT * FROM balance_period WHERE id = $1', [lot.period_id]) : null;

  // The allocation basis is held once per period and applies to both the ledger
  // and the carbon method.
  if (period && method && period.allocation_basis !== method.allocation_basis) {
    return {
      mismatch: true,
      period_allocation_basis: period.allocation_basis,
      method_allocation_basis: method.allocation_basis,
    };
  }

  const threshold = method ? method.primary_threshold_bp : 5000;
  const breakdown = fig.breakdown || [];
  const energy = fig.energy || {};
  const instruments = await q(
    `SELECT * FROM energy_instrument WHERE applied_period = $1`, [lot?.period_id]);
  const metered = Number(energy.metered_kwh || 0);
  const retired = instruments.reduce((a, i) => a + Number(i.quantity_kwh), 0);
  return {
    lot: lotRef,
    figure_id: fig.id,
    version: fig.version,
    value_mg_per_kg: Number(fig.value_mg_per_kg),
    boundary: fig.boundary,
    method_version: `${fig.method_id} v${fig.method_version}`,
    method_id: fig.method_id,
    method_version_number: fig.method_version,
    uncertainty_bp: fig.uncertainty_bp,
    comparator: fig.comparator,
    primary_share_bp: fig.primary_share_bp,
    default_led: fig.primary_share_bp < threshold,
    primary_threshold_bp: threshold,
    breakdown,
    breakdown_sums_to_value: breakdown.reduce((a, b) => a + Number(b.mg_per_kg), 0) === Number(fig.value_mg_per_kg),
    energy_location_mg_per_kg: Number(energy.energy_location_mg_per_kg || 0),
    energy_market_mg_per_kg: Number(energy.energy_market_mg_per_kg || 0),
    metered_kwh: metered,
    retired_kwh: retired,
    unmatched_kwh: metered - retired,
    retired_instruments: instruments.map((i) => ({
      reference: i.reference, quantity_kwh: Number(i.quantity_kwh), vintage: i.vintage,
      region: i.region, state: i.state,
    })),
    cache_valid: fig.cache_valid,
    input_versions: fig.input_versions,
    allocation_basis: method ? method.allocation_basis : null,
    comparator_relation: 'lower than',
    read_at: new Date().toISOString(),
    derivation: {
      value_mg_per_kg: 'sum of the breakdown lines',
      method: `${fig.method_id} version ${fig.method_version}`,
      default_led: `primary_share_bp ${fig.primary_share_bp} against threshold ${threshold}`,
    },
  };
}

/* -------------------------------------------------- byproduct share */

export async function byproductShare(outputRef) {
  const o = await one('SELECT * FROM output WHERE reference = $1', [outputRef]);
  if (!o || o.kind !== 'byproduct') return null;
  const outs = await q('SELECT * FROM output WHERE run = $1', [o.run]);
  const total = outs.reduce((a, x) => a + Number(x.mass_g), 0);
  const share_bp = shareBp(Number(o.mass_g), total);
  const cons = await q('SELECT * FROM consumption WHERE run = $1', [o.run]);
  const inputCredit = cons.reduce((a, c) => a + Number(c.credit_granted_g), 0);
  const run = await one('SELECT * FROM run WHERE reference = $1', [o.run]);
  const period = await one(
    `SELECT * FROM balance_period WHERE site = $1 AND period_from <= $2 AND period_to >= $2 LIMIT 1`,
    [run.site, iso(run.effective_on)]);
  const fig = await one(
    `SELECT * FROM carbon_figure WHERE superseded_by IS NULL ORDER BY version DESC LIMIT 1`);
  const emissionsBase = fig ? Number(fig.value_mg_per_kg) : 0;
  return {
    reference: o.reference,
    run: o.run,
    kind: o.kind,
    disposition: o.disposition,
    mass_g: Number(o.mass_g),
    total_output_mass_g: total,
    share_bp,
    claim_share_g: floorDiv(inputCredit * share_bp, 10000),
    emissions_share_mg: floorDiv(emissionsBase * share_bp, 10000),
    allocation_basis: period ? period.allocation_basis : 'mass',
    derivation: {
      share_bp: `byproduct_mass_g ${Number(o.mass_g)} * 10000 / total_output_mass_g ${total}, floored`,
      claim_share_g: 'run input credit * share_bp / 10000, floored',
      emissions_share_mg: 'run emissions * share_bp / 10000, floored',
    },
  };
}

/* ------------------------------------------------------- statements & certs */

export function statementsFor(claim_type, content_bp, category_split, language = 'en') {
  const pct = (content_bp / 100).toFixed(2);
  const en = {
    mass_balance: {
      permitted: `This material is claimed by mass balance. It is not physically segregated. ${pct} per cent recycled content is attributed to this consignment by mass balance, of which ${category_split.post_consumer || 0} grams is post-consumer and ${category_split.pre_consumer || 0} grams is pre-consumer.`,
      prohibited: 'You may not state that this material physically contains recycled content.',
    },
    controlled_blending: {
      permitted: `This material is claimed by controlled blending at ${pct} per cent recycled content, of which ${category_split.post_consumer || 0} grams is post-consumer and ${category_split.pre_consumer || 0} grams is pre-consumer.`,
      prohibited: 'You may not state that every unit of this material contains the stated recycled content.',
    },
    physically_segregated: {
      permitted: `This material is physically segregated recycled content at ${pct} per cent, of which ${category_split.post_consumer || 0} grams is post-consumer and ${category_split.pre_consumer || 0} grams is pre-consumer.`,
      prohibited: 'You may not describe this material as containing content from any other consignment.',
    },
  };
  const fr = {
    mass_balance: {
      permitted: `Cette matière fait l'objet d'une revendication par bilan massique. Elle n'est pas physiquement séparée. ${pct} pour cent de contenu recyclé est attribué à ce lot par bilan massique.`,
      prohibited: 'Vous ne pouvez pas déclarer que cette matière contient physiquement du contenu recyclé.',
    },
    controlled_blending: {
      permitted: `Cette matière fait l'objet d'une revendication par mélange contrôlé à ${pct} pour cent de contenu recyclé.`,
      prohibited: 'Vous ne pouvez pas déclarer que chaque unité de cette matière contient le contenu recyclé indiqué.',
    },
    physically_segregated: {
      permitted: `Cette matière est un contenu recyclé physiquement séparé à ${pct} pour cent.`,
      prohibited: 'Vous ne pouvez pas décrire cette matière comme contenant de la matière d\'un autre lot.',
    },
  };
  const base = en[claim_type] || en.mass_balance;
  const local = (language === 'fr' ? fr : en)[claim_type] || base;
  return {
    permitted_statement: base.permitted,
    prohibited_statement: base.prohibited,
    permitted_statement_recipient_language: local.permitted,
    prohibited_statement_recipient_language: local.prohibited,
    language,
  };
}

export const CONDITION_NAMES = [
  'lot_released',
  'no_open_deviation',
  'no_unreviewed_override',
  'bookkeeping_period_closed',
  'balance_invariant_holds',
  'carbon_figure_complete',
  'signer_holds_scope',
  'signer_did_not_enter_data',
];

// The eight conditions are checked on the server and none is waivable.
export async function certificateConditions({ lotRef, signer, onDateISO }) {
  const lot = await one('SELECT * FROM lot WHERE reference = $1', [lotRef]);
  const out = [];
  const push = (condition, satisfied, blocking_reference, detail) =>
    out.push({ condition, satisfied: !!satisfied, blocking_reference: blocking_reference || null, detail: detail || null });

  if (!lot) {
    for (const name of CONDITION_NAMES) push(name, false, lotRef, 'the lot does not exist');
    return out;
  }
  const today = onDateISO || iso(new Date());

  push('lot_released', lot.disposition === 'released', lot.disposition === 'released' ? null : lot.reference,
    `the lot disposition is ${lot.disposition}`);

  const openDev = await q(`SELECT * FROM deviation WHERE $1 = ANY(lots) AND state = 'open'`, [lotRef]);
  push('no_open_deviation', openDev.length === 0, openDev[0]?.reference,
    openDev.length ? `deviation ${openDev[0].reference} touching this lot is open` : 'no deviation touching this lot is open');

  const unrev = await q('SELECT * FROM separation_override WHERE lot = $1 AND reviewed = false', [lotRef]);
  push('no_unreviewed_override', unrev.length === 0, unrev[0]?.reference,
    unrev.length ? `override ${unrev[0].reference} on this lot is unreviewed` : 'every override on this lot is reviewed');

  const period = await one('SELECT * FROM balance_period WHERE id = $1', [lot.period_id]);
  const openRest = period ? await q(`SELECT * FROM restatement WHERE period_id = $1 AND state='open'`, [period.id]) : [];
  const bookkeepingSettled = !!period && openRest.length === 0;
  push('bookkeeping_period_closed', bookkeepingSettled, openRest[0]?.reference || (period ? null : lot.period_id),
    period
      ? (openRest.length
        ? `restatement ${openRest[0].reference} is open against ${period.id}`
        : `the bookkeeping for ${period.id} is settled, period state ${period.state}`)
      : 'the lot names no balance period');

  let invariantOk = false;
  let invariantDetail = 'no balance period';
  if (period) {
    const view = await balancePeriodView(period.id);
    invariantOk = view.post_consumer.credits_available_g >= 0 && view.pre_consumer.credits_available_g >= 0;
    invariantDetail = `post-consumer available ${view.post_consumer.credits_available_g} g, pre-consumer available ${view.pre_consumer.credits_available_g} g`;
  }
  push('balance_invariant_holds', invariantOk, invariantOk ? null : lot.period_id, invariantDetail);

  const carbon = await carbonForLot(lotRef);
  const carbonOk = !!carbon && !carbon.mismatch && carbon.value_mg_per_kg !== undefined &&
    !!carbon.boundary && !!carbon.method_version && carbon.uncertainty_bp !== undefined && carbon.uncertainty_bp !== null;
  push('carbon_figure_complete', carbonOk, carbonOk ? null : lotRef,
    carbonOk ? `${carbon.value_mg_per_kg} mg/kg, ${carbon.boundary}, ${carbon.method_version}, uncertainty ${carbon.uncertainty_bp} bp`
      : 'no carbon figure carrying value, boundary, method version and uncertainty');

  const scopeOk = !!signer && Array.isArray(signer.sites) && signer.sites.includes(lot.site) &&
    signer.role === 'certificate_signer' && iso(signer.grant_ends_on) >= today;
  push('signer_holds_scope', scopeOk, scopeOk ? null : lot.site,
    signer
      ? `${signer.email} holds ${(signer.sites || []).join(', ') || 'no site'} and the lot is at ${lot.site}`
      : 'no signer');

  let entered = false;
  if (signer) {
    const rows = await q(
      `SELECT reference FROM test_result WHERE subject_kind = 'lot' AND subject_ref = $1 AND entered_by = $2`,
      [lotRef, signer.identifier || signer.email]);
    const runRows = lot.run_ref
      ? await q('SELECT reference FROM run WHERE reference = $1 AND created_by = $2', [lot.run_ref, signer.identifier || signer.email])
      : [];
    entered = rows.length > 0 || runRows.length > 0;
    push('signer_did_not_enter_data', !entered, entered ? (rows[0]?.reference || runRows[0]?.reference) : null,
      entered ? 'the signer entered data against this lot' : 'the signer entered none of this lot\'s data');
  } else {
    push('signer_did_not_enter_data', false, lotRef, 'no signer');
  }
  return out;
}

/* --------------------------------------------------------- reconciliation */

export async function reconciliation() {
  const runs = await q('SELECT * FROM run');
  const cons = await q('SELECT * FROM consumption');
  const outs = await q('SELECT * FROM output');
  let residual = 0;
  for (const r of runs) {
    const inG = cons.filter((c) => c.run === r.reference).reduce((a, c) => a + Number(c.mass_g), 0);
    const outG = outs.filter((o) => o.run === r.reference).reduce((a, o) => a + Number(o.mass_g), 0);
    residual += inG - outG - Number(r.losses_g || 0);
  }
  const periods = await q('SELECT * FROM balance_period');
  let margin = 0;
  for (const p of periods) {
    const v = await balancePeriodView(p.id);
    margin += v.post_consumer.credits_available_g + v.pre_consumer.credits_available_g;
  }
  const openRuns = runs.filter((r) => r.state === 'open').map((r) => r.reference);
  const consumptionsOnOpen = cons.filter((c) => openRuns.includes(c.run)).length;
  const batches = await q('SELECT reference FROM batch');
  let broken = 0;
  for (const b of batches) {
    const v = await batchView(b.reference);
    if (!v.custody_complete) broken++;
  }
  const superseded = await q(
    `SELECT DISTINCT c.number FROM certificate c
     JOIN carbon_figure f ON (c.carbon->>'figure_id') = f.id
     WHERE f.superseded_by IS NOT NULL OR f.cache_valid = false`);
  const sources = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];
  const ages = [];
  for (const s of sources) {
    const r = await one('SELECT max(received_at) AS latest FROM inbound_record WHERE source = $1', [s]);
    ages.push({
      source: s,
      age_hours: r && r.latest ? Math.floor((Date.now() - new Date(r.latest).getTime()) / 3600000) : null,
      last_received_at: r && r.latest ? new Date(r.latest).toISOString() : null,
    });
  }
  return {
    mass_balance_residual_g: residual,
    credit_margin_g: margin,
    consumptions_on_open_runs: consumptionsOnOpen,
    batches_with_broken_custody: broken,
    certificates_with_superseded_figures: superseded.length,
    integration_ages: ages,
    read_at: new Date().toISOString(),
    derivation: {
      mass_balance_residual_g: 'sum over runs of mass in minus mass out minus recorded losses',
      credit_margin_g: 'sum over periods of credits available across both categories',
    },
  };
}

/* --------------------------------------------------------------- contracts */

export async function contractProjection(contractId) {
  const c = await one('SELECT * FROM contract WHERE id = $1', [contractId]);
  if (!c) return null;
  const allocs = await q('SELECT * FROM contract_allocation WHERE contract = $1 ORDER BY created_at ASC', [contractId]);
  const site = await one('SELECT * FROM site WHERE reference = $1', [c.site]);
  const delivered_g = allocs.reduce((a, x) => a + Number(x.mass_g), 0) + Number(c.delivered_kg) * 1000;
  const running_content_bp = delivered_g === 0 ? 0
    : floorDiv(allocs.reduce((a, x) => a + Number(x.mass_g) * x.content_bp, 0), delivered_g);
  const committed_g = Number(c.committed_kg) * 1000;
  const required = requiredRemainingBp(committed_g, c.floor_bp, delivered_g, running_content_bp);
  const unreachable = required > 10000;
  return {
    id: c.id,
    recipient: c.recipient,
    site: c.site,
    period: c.period,
    delivered_kg: floorDiv(delivered_g, 1000),
    committed_kg: Number(c.committed_kg),
    running_content_bp,
    floor_bp: c.floor_bp,
    required_remaining_bp: required,
    state: unreachable ? 'unreachable' : 'on_track',
    unreachable_on: unreachable ? (iso(c.unreachable_on) || iso(new Date())) : null,
    unreachable_allocation: unreachable ? (c.unreachable_allocation || allocs[allocs.length - 1]?.id || null) : null,
    planned_site_flag: site?.confidence === 'planned',
    flag_dismissible: false,
    site_confidence: site?.confidence,
    shortfall_consequence: c.shortfall_consequence,
    allocations: allocs.map((a) => ({
      reference: a.id, lot: a.lot, mass_g: Number(a.mass_g), content_bp: a.content_bp,
      decided_by: a.decided_by, favoured_over: a.favoured_over,
    })),
    claim_type: 'mass_balance',
    derivation: {
      running_content_bp: 'mass-weighted content of the lots attached, floored',
      required_remaining_bp: '(committed * floor - delivered * running) / remaining, floored',
    },
    read_at: new Date().toISOString(),
  };
}

export { contentBp, dryMassG, creditGrantedG, shareBp, blendedContentBp, weakerClaim, floorDiv };
