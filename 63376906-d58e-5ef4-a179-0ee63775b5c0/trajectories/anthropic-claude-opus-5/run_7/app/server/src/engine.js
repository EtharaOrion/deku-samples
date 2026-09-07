// The arithmetic layer. It reads the operational record and the versioned definitions and
// nothing else, it writes to neither, and every answer states the records it came from.
import { q, one } from './db.js';
import {
  dryMass, creditFromDryMass, contentBp, shareBp, blendedContentBp,
  carryOverCeiling, requiredRemainingBp, proportionOf, floorDiv, BP
} from './units.js';

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);

export function readAt() {
  return new Date().toISOString();
}

/* ---------------------------------------------------------------- parties */

/** The name a party held on a given date, with the identifier it held then. */
export async function partyNameOn(reference, onDate) {
  const versions = await q(
    'SELECT name, effective_from FROM party_version WHERE party = $1 ORDER BY effective_from ASC',
    [reference]
  );
  let name = null;
  for (const v of versions) {
    if (!onDate || iso(v.effective_from) <= iso(onDate)) name = v.name;
  }
  return name || versions[0]?.name || reference;
}

/* ------------------------------------------------------------ collectors */

/** The approval period in force on a date. Never a current flag. */
export function approvalInForce(periods, onDate) {
  const d = iso(onDate);
  return (
    periods.find((p) => iso(p.valid_from) <= d && d <= iso(p.valid_to)) || null
  );
}

export async function collectorApprovalOn(collector, onDate) {
  const periods = await q(
    'SELECT * FROM approval_period WHERE collector = $1 ORDER BY valid_from ASC',
    [collector]
  );
  return approvalInForce(periods, onDate);
}

const EXPIRING_DAYS = 14;

export function approvalExpiring(period, today = new Date()) {
  if (!period) return false;
  const end = new Date(iso(period.valid_to) + 'T00:00:00Z').getTime();
  const now = new Date(iso(today) + 'T00:00:00Z').getTime();
  const days = Math.floor((end - now) / 86400000);
  return days >= 0 && days <= EXPIRING_DAYS;
}

/* --------------------------------------------------------------- batches */

const CUSTODY_KINDS = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];

export async function batchView(reference) {
  const b = await one('SELECT * FROM batch WHERE reference = $1', [reference]);
  if (!b) return null;
  return decorateBatch(b);
}

export async function decorateBatch(b) {
  const links = await q(
    'SELECT kind, link_date, party, arrived_on, late FROM custody_link WHERE batch = $1 ORDER BY ordinal ASC',
    [b.reference]
  );
  const present = new Set(links.map((l) => l.kind));
  const missing = CUSTODY_KINDS.filter((k) => !present.has(k));
  const custody_complete = missing.length === 0;

  const approval = await collectorApprovalOn(b.collector, b.received_on);
  const approvalOk = approval && ['approved', 'conditional'].includes(approval.state);

  const flags = [];
  const dev = await one('SELECT calibrated_on FROM device WHERE reference = $1', [b.device]);
  if (dev) {
    const received = new Date(iso(b.received_on) + 'T00:00:00Z');
    const cal = new Date(iso(dev.calibrated_on) + 'T00:00:00Z');
    const twelveMonths = new Date(cal); twelveMonths.setUTCMonth(twelveMonths.getUTCMonth() + 12);
    if (received > twelveMonths) flags.push('lapsed_calibration');
  }

  let claimable = true;
  let claimable_reason = null;
  let claimable_from = iso(b.claimable_from);
  if (!approvalOk) {
    claimable = false;
    claimable_reason = 'collector_approval_lapsed';
  } else if (!custody_complete) {
    // A late document makes the batch claimable from the date the evidence arrived.
    const lateArrival = links.filter((l) => l.late && l.arrived_on).map((l) => iso(l.arrived_on)).sort().pop();
    claimable = false;
    claimable_reason = 'custody_link_missing';
    if (lateArrival) claimable_from = lateArrival;
  } else {
    const lateArrival = links.filter((l) => l.late && l.arrived_on).map((l) => iso(l.arrived_on)).sort().pop();
    if (lateArrival) { claimable_from = lateArrival; }
  }
  if (!claimable) flags.push('non_claimable');

  const dry_mass_g = dryMass(b.net_g, b.moisture_bp);
  const collector_name = await partyNameOn(b.collector, b.received_on);
  const accepted_g = b.accepted_g === null || b.accepted_g === undefined ? b.net_g - b.rejected_g : b.accepted_g;

  const composition = { ...(b.composition || {}) };

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
    moisture_bp: b.moisture_bp,
    moisture_method: b.moisture_method,
    device: b.device,
    received_on: iso(b.received_on),
    composition,
    contamination: b.contamination || {},
    custody: links.map((l) => ({
      kind: l.kind, date: iso(l.link_date), party: l.party,
      arrived_on: iso(l.arrived_on), late: l.late
    })),
    custody_complete,
    custody_missing: missing,
    dry_mass_g,
    claimable,
    claimable_reason,
    claimable_missing_kind: claimable_reason === 'custody_link_missing' ? missing[0] || null : null,
    claimable_from,
    flags,
    accepted_g,
    rejected_g: b.rejected_g,
    rejected_destination: b.rejected_destination,
    rejected_reason: b.rejected_reason,
    approval_state_on_receipt: approval ? approval.state : 'none',
    approval_valid_to: approval ? iso(approval.valid_to) : null,
    event_at: b.event_at,
    recorded_at: b.recorded_at,
    effective_on: iso(b.effective_on),
    derivation: {
      dry_mass_g: `net_g ${b.net_g} * (10000 - moisture_bp ${b.moisture_bp}) / 10000, floored`,
      claimable: `approval period in force on ${iso(b.received_on)} and custody links`
    }
  };
}

/* -------------------------------------------------------------- genealogy */

/**
 * Genealogy is a traversal over the consumption records, not a stored summary. A graph and
 * not a tree: a batch reached by several paths appears once with its total mass.
 */
export async function genealogy(lotReference) {
  const lot = await one('SELECT * FROM lot WHERE reference = $1', [lotReference]);
  if (!lot) return null;

  const consumptions = await q('SELECT * FROM consumption', []);
  const outputs = await q('SELECT * FROM output', []);
  const outputByRef = new Map(outputs.map((o) => [o.reference, o]));
  const consumedByRun = new Map();
  for (const c of consumptions) {
    if (!consumedByRun.has(c.run)) consumedByRun.set(c.run, []);
    consumedByRun.get(c.run).push(c);
  }

  const nodes = new Map();
  const edges = [];
  const edgeSeen = new Set();

  const lotOutput = outputs.find((o) => o.reference === lotReference);
  const runs = await q('SELECT * FROM run', []);
  const runByRef = new Map(runs.map((r) => [r.reference, r]));
  const batches = await q('SELECT * FROM batch', []);
  const batchByRef = new Map(batches.map((b) => [b.reference, b]));
  const decorated = new Map();
  for (const b of batches) decorated.set(b.reference, await decorateBatch(b));

  function addNode(kind, reference, mass_g, extra = {}) {
    if (!nodes.has(reference)) {
      nodes.set(reference, { kind, reference, mass_g: 0, category_split: { post_consumer: 0, pre_consumer: 0, non_claimable: 0 }, flags: [], ...extra });
    }
    const n = nodes.get(reference);
    n.mass_g += mass_g;
    return n;
  }

  function addEdge(from, to, mass_g) {
    const key = `${from}->${to}`;
    if (edgeSeen.has(key)) {
      const e = edges.find((x) => x.from === from && x.to === to);
      e.mass_g += mass_g;
      return;
    }
    edgeSeen.add(key);
    edges.push({ from, to, mass_g });
  }

  // Walk backwards from the lot, over consumption rows, adding each contribution.
  const lotNode = addNode('lot', lotReference, lot.mass_g, { site: lot.site, grade: lot.grade });
  const stack = [];
  if (lotOutput) stack.push({ ref: lotReference, run: lotOutput.run });

  const visitedRuns = new Set();
  while (stack.length) {
    const { ref, run } = stack.pop();
    if (!run) continue;
    const r = runByRef.get(run);
    if (r) {
      addNode('run', run, 0, { run_type: r.run_type, site: r.site, losses_g: r.losses_g, within_tolerance: r.within_tolerance });
      addEdge(run, ref, nodes.get(ref).mass_g);
    }
    if (visitedRuns.has(run)) continue;
    visitedRuns.add(run);
    for (const c of consumedByRun.get(run) || []) {
      if (c.input_kind === 'batch') {
        const b = batchByRef.get(c.input_ref);
        const d = decorated.get(c.input_ref);
        const n = addNode('batch', c.input_ref, c.mass_g, { site: b?.site, collector: b?.collector });
        if (d) {
          const cat = d.claimable ? d.category : 'non_claimable';
          n.category_split[cat] = (n.category_split[cat] || 0) + c.mass_g;
          for (const f of d.flags) if (!n.flags.includes(f)) n.flags.push(f);
          if (!d.custody_complete && !n.flags.includes('custody_link_missing')) n.flags.push('custody_link_missing');
        }
        addEdge(c.input_ref, run, c.mass_g);
      } else {
        const src = outputByRef.get(c.input_ref);
        addNode(src?.kind === 'lot' ? 'lot' : 'intermediate', c.input_ref, c.mass_g, { site: runByRef.get(src?.run)?.site });
        addEdge(c.input_ref, run, c.mass_g);
        if (src) stack.push({ ref: c.input_ref, run: src.run });
      }
    }
  }

  // Roll category splits and flags up to the lot so a flag anywhere is visible from it.
  const allNodes = [...nodes.values()];
  for (const n of allNodes) {
    if (n.kind === 'batch') {
      for (const k of Object.keys(n.category_split)) lotNode.category_split[k] += n.category_split[k];
      for (const f of n.flags) if (!lotNode.flags.includes(f)) lotNode.flags.push(f);
    }
  }
  // The lot's own held state carries its words too.
  const openDev = await q(
    `SELECT reference FROM deviation WHERE state = 'open' AND lots ? $1`, [lotReference]
  ).catch(() => []);
  if (openDev.length && !lotNode.flags.includes('open_deviation')) lotNode.flags.push('open_deviation');
  const unrev = await q('SELECT reference FROM separation_override WHERE lot = $1 AND reviewed = false', [lotReference]);
  if (unrev.length && !lotNode.flags.includes('unreviewed_override')) lotNode.flags.push('unreviewed_override');

  const flagged = allNodes.some((n) => n.flags.length > 0);

  // The same facts as a nested list: same nodes, same masses, same splits, same flags.
  const byTarget = new Map();
  for (const e of edges) {
    if (!byTarget.has(e.to)) byTarget.set(e.to, []);
    byTarget.get(e.to).push(e);
  }
  function nest(reference, seen = new Set()) {
    const n = nodes.get(reference);
    if (!n) return null;
    const children = (byTarget.get(reference) || []).map((e) => {
      const key = `${e.from}->${e.to}`;
      if (seen.has(key)) return { kind: nodes.get(e.from)?.kind, reference: e.from, mass_g: e.mass_g, repeated: true, children: [] };
      const next = new Set(seen); next.add(key);
      const child = nest(e.from, next);
      return child ? { ...child, edge_mass_g: e.mass_g } : null;
    }).filter(Boolean);
    return {
      kind: n.kind, reference: n.reference, mass_g: n.mass_g,
      category_split: n.category_split, flags: n.flags, children
    };
  }

  return {
    lot: lotReference,
    direction: 'backwards',
    nodes: allNodes,
    edges,
    flagged,
    text_equivalent: nest(lotReference),
    read_at: readAt(),
    derivation: { source: 'consumption and output records', method: 'traversal, not a stored summary' }
  };
}

/** The same traversal forwards: every lot containing any of the batch, every certificate and recipient. */
export async function batchImpact(batchReference) {
  const b = await one('SELECT * FROM batch WHERE reference = $1', [batchReference]);
  if (!b) return null;
  const consumptions = await q('SELECT * FROM consumption', []);
  const outputs = await q('SELECT * FROM output', []);
  const outputByRun = new Map();
  for (const o of outputs) {
    if (!outputByRun.has(o.run)) outputByRun.set(o.run, []);
    outputByRun.get(o.run).push(o);
  }
  const consumedInput = new Map();
  for (const c of consumptions) {
    if (!consumedInput.has(c.input_ref)) consumedInput.set(c.input_ref, []);
    consumedInput.get(c.input_ref).push(c);
  }

  const lots = new Map();
  const seen = new Set();
  const frontier = [batchReference];
  while (frontier.length) {
    const ref = frontier.pop();
    if (seen.has(ref)) continue;
    seen.add(ref);
    for (const c of consumedInput.get(ref) || []) {
      for (const o of outputByRun.get(c.run) || []) {
        if (o.kind === 'lot') {
          if (!lots.has(o.reference)) lots.set(o.reference, o);
        } else {
          frontier.push(o.reference);
        }
      }
    }
  }

  const lotRefs = [...lots.keys()];
  const certRows = lotRefs.length
    ? await q(`SELECT * FROM certificate WHERE lots @> to_jsonb($1::text[]) OR EXISTS (
                 SELECT 1 FROM jsonb_array_elements(lots) e WHERE e->>'reference' = ANY($1))`, [lotRefs])
    : [];
  const recipients = [];
  const certificates = [];
  for (const c of certRows) {
    certificates.push({ number: c.number, version: c.version, state: c.state, recipient: c.recipient, recipient_name: c.recipient_name, site: c.site });
    if (!recipients.find((r) => r.reference === c.recipient)) {
      recipients.push({ reference: c.recipient, name: c.recipient_name });
    }
  }
  const lotDetail = lotRefs.length ? await q('SELECT reference, grade, site, mass_g, disposition, claim_type FROM lot WHERE reference = ANY($1)', [lotRefs]) : [];

  return {
    batch: batchReference,
    direction: 'forwards',
    lots: lotDetail,
    certificates,
    recipients,
    complete: true,
    read_at: readAt(),
    derivation: { source: 'consumption and output records' }
  };
}

/* ----------------------------------------------------------- the ledger */

export async function periodView(id) {
  const p = await one('SELECT * FROM balance_period WHERE id = $1', [id]);
  if (!p) return null;
  const movements = await q('SELECT * FROM credit_movement WHERE period = $1 ORDER BY id ASC', [id]);

  const cats = ['post_consumer', 'pre_consumer'];
  const credits_in_g = {}; const credits_out_g = {}; const credits_available_g = {};
  const transferred_in_g = {}; const transferred_out_g = {};
  const inbound_credits = [];
  for (const cat of cats) {
    // A balance is the sum of its movements and is never held as a total.
    const ins = movements.filter((m) => m.direction === 'in' && m.category === cat);
    const outs = movements.filter((m) => m.direction === 'out' && m.category === cat);
    credits_in_g[cat] = ins.reduce((s, m) => s + m.mass_g, 0);
    credits_out_g[cat] = outs.reduce((s, m) => s + m.mass_g, 0);
    credits_available_g[cat] = credits_in_g[cat] - credits_out_g[cat];
    // A transfer is never a fresh credit. It is reported on its own so the credit that
    // entered this period by consumption stays legible beside the credit that travelled.
    transferred_in_g[cat] = movements.filter((m) => m.direction === 'transfer_in' && m.category === cat)
      .reduce((s, m) => s + m.mass_g, 0);
    transferred_out_g[cat] = movements.filter((m) => m.direction === 'transfer_out' && m.category === cat)
      .reduce((s, m) => s + m.mass_g, 0);
  }
  for (const m of movements.filter((m) => m.direction === 'transfer_in')) {
    inbound_credits.push({
      reference: m.movement, mass_g: m.mass_g, origin_site: m.origin_site,
      movement: m.movement, category: m.category, fresh_credit: m.fresh_credit
    });
  }

  const nonClaimable = movements.filter((m) => m.category === 'non_claimable');
  const non_claimable_input_g = nonClaimable.reduce((s, m) => s + (m.derivation?.dry_mass_g || 0), 0);

  const factors = await q(
    'SELECT * FROM conversion_factor WHERE site = $1 ORDER BY published_on ASC', [p.site]
  );
  const overrideRows = await q(
    `SELECT o.reference FROM separation_override o JOIN lot l ON l.reference = o.lot
     WHERE l.site = $1 AND l.grade = $2`, [p.site, p.grade]
  );
  const restatements = await q(`SELECT reference FROM restatement WHERE period = $1 AND state = 'open'`, [id]);
  const findings = await q(`SELECT reference, due_on FROM finding WHERE state = 'open'`);

  const carried = p.state === 'closed' ? await carryOver(p, credits_in_g, credits_available_g) : null;

  return {
    id: p.id,
    site: p.site,
    grade: p.grade,
    period: { from: iso(p.period_from), to: iso(p.period_to) },
    state: p.state,
    carry_over_limit_bp: p.carry_over_limit_bp,
    allocation_basis: p.allocation_basis,
    credits_in_g,
    credits_out_g,
    credits_available_g,
    transferred_in_g,
    transferred_out_g,
    inbound_credits,
    non_claimable_input_g,
    conversion_factors: factors.map((f) => ({
      reference: f.reference, version: f.version, factor_bp: f.factor_bp,
      derived_from: iso(f.derived_from), derived_to: iso(f.derived_to),
      derived_in_g: f.derived_in_g, derived_out_g: f.derived_out_g, provisional: f.provisional
    })),
    override_count: overrideRows.length,
    open_restatement_count: restatements.length,
    open_finding_count: findings.length,
    closed_on: iso(p.closed_on),
    cut_off: iso(p.cut_off),
    carried_forward_g: carried ? carried.carried_forward_g : null,
    expired_g: carried ? carried.expired_g : null,
    movements: movements.map((m) => ({
      id: Number(m.id), direction: m.direction, category: m.category, mass_g: m.mass_g,
      lot: m.lot, source_kind: m.source_kind, source_ref: m.source_ref,
      fresh_credit: m.fresh_credit, origin_site: m.origin_site,
      effective_on: iso(m.effective_on), derivation: m.derivation
    })),
    read_at: readAt(),
    derivation: {
      credits_in_g: 'sum of credit movements in, per category',
      credits_out_g: 'sum of credit movements out, per category',
      credits_available_g: 'credits_in_g minus credits_out_g, per category',
      non_claimable_input_g: 'dry mass of non-claimable batches consumed in the period'
    }
  };
}

export async function carryOver(period, creditsIn, creditsAvailable) {
  const carried_forward_g = {}; const expired_g = {};
  for (const cat of ['post_consumer', 'pre_consumer']) {
    const ceiling = carryOverCeiling(creditsIn[cat] || 0, period.carry_over_limit_bp);
    const available = creditsAvailable[cat] || 0;
    const carried = Math.min(available, ceiling);
    carried_forward_g[cat] = carried;
    expired_g[cat] = available - carried;
  }
  return { carried_forward_g, expired_g };
}

/** Claim attached to a lot, and the content it produces. Every percentage is computed. */
export async function lotClaim(lotReference) {
  const lot = await one('SELECT * FROM lot WHERE reference = $1', [lotReference]);
  if (!lot) return null;
  const movements = await q(
    `SELECT category, mass_g FROM credit_movement WHERE lot = $1 AND direction = 'out'`, [lotReference]
  );
  const category_split = { post_consumer: 0, pre_consumer: 0 };
  for (const m of movements) category_split[m.category] = (category_split[m.category] || 0) + m.mass_g;
  const credit_attached_g = category_split.post_consumer + category_split.pre_consumer;
  return {
    lot: lotReference,
    mass_g: lot.mass_g,
    credit_attached_g,
    content_bp: contentBp(credit_attached_g, lot.mass_g),
    claim_type: lot.claim_type,
    category_split,
    derivation: { content_bp: `credit_attached_g ${credit_attached_g} * 10000 / lot_mass_g ${lot.mass_g}, floored` }
  };
}

/* ------------------------------------------------------------ byproducts */

export async function byproductShare(outputReference) {
  const o = await one('SELECT * FROM output WHERE reference = $1', [outputReference]);
  if (!o) return null;
  const siblings = await q('SELECT * FROM output WHERE run = $1', [o.run]);
  const total = siblings.reduce((s, x) => s + x.mass_g, 0);
  const share_bp = shareBp(o.mass_g, total);
  const run = await one('SELECT * FROM run WHERE reference = $1', [o.run]);
  const period = await one(
    `SELECT * FROM balance_period WHERE site = $1 AND $2 BETWEEN period_from AND period_to LIMIT 1`,
    [run.site, iso(run.effective_on)]
  );
  // The run's claim: the credit granted on the consumptions that fed it, traced to its lots.
  const lotOutputs = siblings.filter((x) => x.kind === 'lot');
  let runClaim = 0;
  for (const l of lotOutputs) {
    const c = await lotClaim(l.reference);
    if (c) runClaim += c.credit_attached_g;
  }
  let emissions = 0;
  for (const l of lotOutputs) {
    const f = await one('SELECT value_mg_per_kg FROM carbon_figure WHERE lot = $1 AND superseded_by IS NULL', [l.reference]);
    if (f) emissions += f.value_mg_per_kg;
  }
  return {
    reference: o.reference,
    run: o.run,
    kind: o.kind,
    disposition: o.disposition,
    mass_g: o.mass_g,
    total_output_mass_g: total,
    share_bp,
    allocation_basis: period?.allocation_basis || 'mass',
    claim_share_g: proportionOf(runClaim, share_bp),
    emissions_share_mg: proportionOf(emissions, share_bp),
    derivation: { share_bp: `byproduct_mass_g ${o.mass_g} * 10000 / total_output_mass_g ${total}, floored` }
  };
}

/* ---------------------------------------------------------------- carbon */

export async function carbonForLot(lotReference, { internal = true } = {}) {
  const figure = await one(
    'SELECT * FROM carbon_figure WHERE lot = $1 AND superseded_by IS NULL ORDER BY version DESC LIMIT 1',
    [lotReference]
  );
  if (!figure) return null;
  const method = await one(
    'SELECT * FROM carbon_method WHERE id = $1 AND version = $2', [figure.method_id, figure.method_version]
  );
  const lot = await one('SELECT site, grade FROM lot WHERE reference = $1', [lotReference]);
  const period = await one(
    `SELECT * FROM balance_period WHERE site = $1 AND grade = $2 ORDER BY period_from DESC LIMIT 1`,
    [lot.site, lot.grade]
  );
  // The allocation basis is held once per period and applies to both ledger and method.
  if (period && method && period.allocation_basis !== method.allocation_basis) {
    const err = new Error('allocation basis mismatch');
    err.status = 409;
    err.body = {
      error: 'allocation_basis_mismatch',
      period_allocation_basis: period.allocation_basis,
      method_allocation_basis: method.allocation_basis,
      rule: 'The allocation basis is held once per period and applies to both the ledger and the carbon method'
    };
    throw err;
  }

  const threshold = method?.primary_threshold_bp ?? 5000;
  const energy = figure.energy || {};
  const answer = {
    lot: lotReference,
    figure_id: figure.id,
    figure_version: figure.version,
    value_mg_per_kg: figure.value_mg_per_kg,
    boundary: figure.boundary,
    method_version: `${figure.method_id} v${figure.method_version}`,
    method_id: figure.method_id,
    method_version_number: figure.method_version,
    uncertainty_bp: figure.uncertainty_bp,
    comparator: figure.comparator,
    primary_share_bp: figure.primary_share_bp,
    primary_threshold_bp: threshold,
    default_led: figure.primary_share_bp < threshold,
    cache_valid: figure.cache_valid,
    functional_unit: method?.functional_unit,
    allocation_basis: method?.allocation_basis,
    standard: method?.standard,
    energy_location_mg_per_kg: energy.energy_location_mg_per_kg,
    energy_market_mg_per_kg: energy.energy_market_mg_per_kg,
    metered_kwh: energy.metered_kwh,
    retired_kwh: energy.retired_kwh,
    unmatched_kwh: energy.unmatched_kwh,
    input_versions: figure.input_versions,
    computed_on: iso(figure.computed_on),
    comparator_statement: figure.comparator
      ? `${figure.value_mg_per_kg} mg CO2e per kg is lower than ${figure.comparator.material} from ${figure.comparator.dataset}`
      : null,
    derivation: { source: 'carbon_figure against its method version', lines: 'breakdown lines sum to the value' }
  };
  // The internal view returns the breakdown always.
  if (internal) answer.breakdown = figure.breakdown;
  return answer;
}

export async function recomputeEnergy(periodId) {
  const instruments = await q(
    `SELECT * FROM energy_instrument WHERE applied_period = $1 AND state = 'retired'`, [periodId]
  );
  const retired_kwh = instruments.reduce((s, i) => s + i.quantity_kwh, 0);
  return { retired_kwh, instruments };
}

/* --------------------------------------------------------------- yield */

export async function lotYield(lotReference) {
  const lot = await one('SELECT * FROM lot WHERE reference = $1', [lotReference]);
  if (!lot) return null;
  const g = await genealogy(lotReference);
  const batchMass = g.nodes.filter((n) => n.kind === 'batch').reduce((s, n) => s + n.mass_g, 0);
  const losses = g.nodes.filter((n) => n.kind === 'run').reduce((s, n) => s + (n.losses_g || 0), 0);
  return {
    lot: lotReference,
    input_mass_g: batchMass,
    output_mass_g: lot.mass_g,
    losses_g: losses,
    yield_bp: batchMass ? floorDiv(lot.mass_g * BP, batchMass) : 0,
    derivation: { yield_bp: 'lot mass * 10000 / total batch mass consumed, floored', note: 'Losses reduce the claim.' }
  };
}

/* ------------------------------------------------- certificate conditions */

export const CONDITION_NAMES = [
  'lot_released',
  'no_open_deviation',
  'no_unreviewed_override',
  'period_closed',
  'balance_invariant_holds',
  'carbon_figure_complete',
  'signer_holds_scope',
  'signer_did_not_enter_data'
];

/** The eight conditions, decided on the server. None is waivable. */
export async function evaluateConditions({ lot: lotReference, signerEmail, signerSites, onDate }) {
  const lot = await one('SELECT * FROM lot WHERE reference = $1', [lotReference]);
  const conditions = [];
  const push = (condition, satisfied, blocking_reference, detail) =>
    conditions.push({ condition, satisfied: !!satisfied, blocking_reference: blocking_reference || null, detail: detail || null });

  if (!lot) {
    for (const name of CONDITION_NAMES) push(name, false, lotReference, 'lot not found');
    return conditions;
  }

  push('lot_released', lot.disposition === 'released', lot.disposition === 'released' ? null : lotReference,
    lot.disposition === 'released' ? 'The lot is released.' : `The lot disposition is ${lot.disposition}.`);

  const openDevs = await q(`SELECT reference FROM deviation WHERE state = 'open' AND lots ? $1`, [lotReference]);
  push('no_open_deviation', openDevs.length === 0, openDevs[0]?.reference,
    openDevs.length ? `Deviation ${openDevs[0].reference} is open.` : 'No deviation touching this lot is open.');

  const unreviewed = await q('SELECT reference FROM separation_override WHERE lot = $1 AND reviewed = false', [lotReference]);
  push('no_unreviewed_override', unreviewed.length === 0, unreviewed[0]?.reference,
    unreviewed.length ? `Override ${unreviewed[0].reference} is unreviewed.` : 'No override on this lot is unreviewed.');

  const period = await one(
    `SELECT * FROM balance_period WHERE site = $1 AND grade = $2 AND $3 BETWEEN period_from AND period_to
     ORDER BY period_from DESC LIMIT 1`, [lot.site, lot.grade, iso(lot.produced_on)]
  );
  push('period_closed', period?.state === 'closed', period ? period.id : null,
    period ? (period.state === 'closed' ? `Period ${period.id} is closed.` : `Period ${period.id} is open.`) : 'No bookkeeping period covers this lot.');

  let invariantHolds = false; let invariantDetail = 'No allocation exists for this lot.';
  if (period) {
    const view = await periodView(period.id);
    const claim = await lotClaim(lotReference);
    const negative = Object.values(view.credits_available_g).some((v) => v < 0);
    invariantHolds = !negative && claim.credit_attached_g > 0;
    invariantDetail = negative
      ? 'Credits attached exceed credits available.'
      : claim.credit_attached_g > 0
        ? `Claim of ${claim.credit_attached_g} g attached with the balance holding.`
        : 'No claim is attached to this lot.';
  }
  push('balance_invariant_holds', invariantHolds, period ? period.id : null, invariantDetail);

  let carbonOk = false; let carbonDetail = 'No carbon figure exists for this lot.';
  let carbon = null;
  try {
    carbon = await carbonForLot(lotReference);
    if (carbon) {
      carbonOk = carbon.value_mg_per_kg !== null && !!carbon.boundary && !!carbon.method_version && carbon.uncertainty_bp !== null;
      carbonDetail = carbonOk ? 'The carbon figure carries its boundary, method version and uncertainty.' : 'The carbon figure is missing a component.';
    }
  } catch (err) {
    carbonDetail = err.body?.error || 'The carbon figure could not be resolved.';
  }
  push('carbon_figure_complete', carbonOk, carbon ? carbon.figure_id : null, carbonDetail);

  // Scope resolves against the certification period in force on the date of signing.
  const day = iso(onDate || new Date());
  const grants = await q('SELECT site, ends_on FROM access_grant WHERE email = $1', [signerEmail]);
  const scoped = grants.some((g) => g.site === lot.site && iso(g.ends_on) >= day);
  const suspension = await one(
    `SELECT * FROM site_certification WHERE site = $1 AND state = 'suspended'
       AND effective_from <= $2 AND (effective_to IS NULL OR effective_to >= $2)
       AND (grade IS NULL OR grade = $3) ORDER BY effective_from DESC LIMIT 1`,
    [lot.site, day, lot.grade]
  );
  push('signer_holds_scope', scoped && !suspension, suspension ? lot.site : (scoped ? null : lot.site),
    suspension
      ? `The certification for ${lot.site} is suspended from ${iso(suspension.effective_from)}.`
      : scoped ? `The signer holds signing scope for ${lot.site} on ${day}.` : `The signer holds no signing scope for ${lot.site}.`);

  const entered = await q(
    `SELECT reference FROM test_result WHERE subject_ref = $1 AND entered_by = $2`, [lotReference, signerEmail]
  );
  const enteredConsumption = await q(
    `SELECT c.reference FROM consumption c
       JOIN output o ON o.run = c.run AND o.reference = $1
      WHERE c.recorded_by = $2`, [lotReference, signerEmail]
  );
  const didEnter = entered.length > 0 || enteredConsumption.length > 0;
  push('signer_did_not_enter_data', !didEnter, didEnter ? (entered[0]?.reference || enteredConsumption[0]?.reference) : null,
    didEnter ? 'The signer entered data on this lot.' : 'The signer did not enter the data.');

  return conditions;
}

/* ---------------------------------------------------- contract projection */

export async function contractProjection(id) {
  const c = await one('SELECT * FROM contract WHERE id = $1', [id]);
  if (!c) return null;
  const allocations = await q('SELECT * FROM contract_allocation WHERE contract = $1 ORDER BY created_at ASC', [id]);
  const delivered_kg = c.delivered_kg + allocations.reduce((s, a) => s + floorDiv(a.mass_g, 1000), 0);
  const totalMass = allocations.reduce((s, a) => s + a.mass_g, 0);
  const weighted = allocations.reduce((s, a) => s + a.mass_g * a.content_bp, 0);
  const running_content_bp = totalMass ? floorDiv(weighted, totalMass) : 0;
  const required_remaining_bp = requiredRemainingBp(c.committed_kg, c.floor_bp, delivered_kg, running_content_bp);
  const state = required_remaining_bp > BP ? 'unreachable' : 'on_track';
  const site = await one('SELECT confidence FROM site WHERE reference = $1', [c.site]);
  return {
    contract: c.id,
    recipient: c.recipient,
    site: c.site,
    period: c.period,
    delivered_kg,
    committed_kg: c.committed_kg,
    running_content_bp,
    floor_bp: c.floor_bp,
    required_remaining_bp,
    state,
    unreachable_on: iso(c.unreachable_on),
    unreachable_allocation: c.unreachable_allocation,
    shortfall_consequence: c.shortfall_consequence,
    planned_site_flag: site?.confidence === 'planned',
    flag_dismissible: false,
    site_confidence: site?.confidence,
    allocations: allocations.map((a) => ({
      reference: a.reference, lot: a.lot, mass_g: a.mass_g, content_bp: a.content_bp,
      decided_by: a.decided_by, favoured_over: a.favoured_over
    })),
    read_at: readAt(),
    derivation: {
      running_content_bp: 'mass-weighted content of the lots allocated, floored',
      required_remaining_bp: '(committed*floor - delivered*running) / remaining, floored'
    }
  };
}

/* ------------------------------------------------------- reconciliation */

const SOURCES = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];

export async function reconciliation() {
  const runs = await q(`SELECT reference, losses_g, state FROM run`);
  const consumptions = await q('SELECT run, mass_g FROM consumption');
  const outputs = await q('SELECT run, mass_g FROM output');
  let residual = 0;
  for (const r of runs) {
    if (r.state !== 'closed') continue;
    const inMass = consumptions.filter((c) => c.run === r.reference).reduce((s, c) => s + c.mass_g, 0);
    const outMass = outputs.filter((o) => o.run === r.reference).reduce((s, o) => s + o.mass_g, 0);
    residual += inMass - outMass - (r.losses_g || 0);
  }
  const periods = await q(`SELECT id FROM balance_period WHERE state = 'open'`);
  let margin = 0;
  for (const p of periods) {
    const v = await periodView(p.id);
    margin += v.credits_available_g.post_consumer + v.credits_available_g.pre_consumer;
  }
  const openRunConsumptions = await q(
    `SELECT count(*)::int AS n FROM consumption c JOIN run r ON r.reference = c.run WHERE r.state = 'open'`
  );
  const batches = await q('SELECT reference FROM batch');
  let broken = 0;
  for (const b of batches) {
    const v = await batchView(b.reference);
    if (!v.custody_complete) broken++;
  }
  const superseded = await q(
    `SELECT count(DISTINCT c.number)::int AS n FROM certificate c
       JOIN carbon_figure f ON (c.carbon->>'figure_id') = f.id
      WHERE f.superseded_by IS NOT NULL OR f.cache_valid = false`
  );
  const inbound = await q(
    `SELECT source, max(received_at) AS latest FROM inbound_record GROUP BY source`
  );
  const now = Date.now();
  const integration_ages = SOURCES.map((source) => {
    const row = inbound.find((i) => i.source === source);
    return {
      source,
      // A source that has never sent reports null rather than zero.
      age_hours: row ? Math.floor((now - new Date(row.latest).getTime()) / 3600000) : null,
      last_received_at: row ? new Date(row.latest).toISOString() : null
    };
  });

  return {
    mass_balance_residual_g: residual,
    credit_margin_g: margin,
    consumptions_on_open_runs: openRunConsumptions[0].n,
    batches_with_broken_custody: broken,
    certificates_with_superseded_figures: superseded[0].n,
    integration_ages,
    read_at: readAt(),
    derivation: {
      mass_balance_residual_g: 'sum over closed runs of mass in minus mass out minus losses',
      credit_margin_g: 'credits available across open periods, both categories'
    }
  };
}

export { iso, blendedContentBp, dryMass, creditFromDryMass, contentBp, shareBp };
