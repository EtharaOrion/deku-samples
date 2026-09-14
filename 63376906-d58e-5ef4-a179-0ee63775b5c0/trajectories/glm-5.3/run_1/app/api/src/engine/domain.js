import { q, one } from '../db.js';
import { dryMass, creditGranted, contentBp, floorDiv, floorMulDiv } from './int.js';

// ---- Claimability resolves against the approval in force on the receipt date, never a current flag.
export async function approvalInForce(collector, on) {
  return one(
    `SELECT * FROM approval_periods
      WHERE collector = $1 AND valid_from <= $2 AND valid_to >= $2
      ORDER BY valid_from DESC LIMIT 1`, [collector, on]);
}

export const requiredCustodyKinds = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];

export async function batchCustody(reference) {
  return q(`SELECT kind, occurred_on, party, late, attached_on FROM custodies WHERE batch = $1 ORDER BY id`, [reference]);
}

export function custodyMissing(kinds) {
  return requiredCustodyKinds.filter((k) => !kinds.includes(k));
}

export async function collectorNameOn(party, on) {
  const v = await one(
    `SELECT name FROM party_versions WHERE party = $1 AND effective_from <= $2
      ORDER BY effective_from DESC LIMIT 1`, [party, on]);
  return v ? v.name : null;
}

// Every derived claimability answer, with the reason named.
export async function resolveBatch(b, opts = {}) {
  const kinds = b.custody_kinds || (await batchCustody(b.reference)).map((r) => r.kind);
  const late = (await one(`SELECT max(attached_on) late FROM custodies WHERE batch=$1 AND late`, [b.reference]))?.late || null;
  const approval = await approvalInForce(b.collector, b.received_on);
  let claimable = true, reason = null;
  if (!approval || !['approved', 'conditional'].includes(approval.state)) {
    claimable = false; reason = approval ? `collector_approval_${approval.state}` : 'collector_approval_lapsed';
  } else {
    const missing = custodyMissing(kinds);
    if (missing.length) { claimable = false; reason = `custody_link_missing:${missing[0]}`; }
  }
  const device = await one('SELECT * FROM weighing_devices WHERE reference = $1', [b.device]);
  // a calibration is valid for twelve months: the receipt date more than 365 days after
  // the calibration date is a lapsed calibration, and the flag repeats on every lot downstream
  const lapsed = !!device && (new Date(b.received_on) - new Date(device.calibrated_on)) / 86400000 > 365;
  const flags = [];
  if (lapsed) flags.push('lapsed_calibration');
  const dry = dryMass(b.net_g, b.moisture_bp);
  const dm = {};
  let claimable_from = null;
  if (!claimable && reason?.startsWith('custody_link_missing') && late) {
    claimable_from = late;
  }
  const collector_name = await collectorNameOn(b.collector, b.received_on);
  return {
    reference: b.reference, collector: b.collector, site: b.site, grade: b.grade, category: b.category,
    gross_g: b.gross_g, tare_g: b.tare_g, net_g: b.net_g, moisture_bp: b.moisture_bp,
    moisture_method: b.moisture_method, device: b.device, received_on: iso(b.received_on),
    dry_mass_g: dry, claimable, claimable_reason: claimable ? null : reason,
    claimable_from, flags, custody_complete: custodyMissing(kinds).length === 0,
    collector_name, composition: b.composition, contamination: b.contamination,
    accepted_g: b.accepted_g ?? b.net_g, rejected_g: b.rejected_g ?? 0,
    rejected_destination: b.rejected_destination || null,
    event_at: iso(b.event_at), recorded_at: iso(b.recorded_at), effective_on: iso(b.effective_on),
    derivation: {
      dry_mass_g: `net_g ${b.net_g} * (10000 - moisture_bp ${b.moisture_bp}) / 10000, floored`,
      claimable: `approval in force on received_on ${iso(b.received_on)} and custody complete`
    }
  };
}

const iso = (d) => (d instanceof Date ? d.toISOString() : d);
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);



// ---- The ledger is the sum of its movements, never a stored total.
export async function periodBalance(id) {
  const rows = await q(
    `SELECT category, direction, kind, sum(mass_g)::bigint mass FROM credit_movements WHERE balance_period = $1 GROUP BY category, direction, kind`, [id]);
  const out = {};
  for (const cat of ['post_consumer', 'pre_consumer']) {
    // fresh credit is granted at a consumption; a transfer is a movement, not a fresh credit
    const inn = Number(rows.find((r) => r.category === cat && r.direction === 'in' && r.kind === 'consumption')?.mass || 0);
    const o = Number(rows.find((r) => r.category === cat && r.direction === 'out' && r.kind === 'allocation')?.mass || 0);
    out[cat] = { credits_in_g: inn, credits_out_g: o, credits_available_g: inn - o, derivation: `sum of credit_movements for ${id}, category ${cat}: fresh credit in minus credit attached to lots` };
  }
  return out;
}

export async function conversionFactorFor(site, on) {
  return one(
    `SELECT * FROM conversion_factors WHERE site = $1 AND published_on <= $2 ORDER BY published_on DESC, id DESC LIMIT 1`,
    [site, on]);
}

// ---- Genealogy: a traversal over the consumption records, a graph and not a tree.
export async function genealogyFor(lot) {
  const nodes = new Map();
  const edges = [];
  const walk = (kind, reference, factorIn) => {
    const key = `${kind}:${reference}`;
    if (!nodes.has(key)) nodes.set(key, { kind, reference, mass_g: 0n, category_split: {}, flags: [] });
    const n = nodes.get(key);
    return n;
  };
  // forward walk from the lot to batches, accumulating mass by path
  const lotRow = await one('SELECT * FROM lots WHERE reference = $1', [lot]);
  if (!lotRow) return null;
  const outRef = await one(`SELECT reference FROM outputs WHERE kind='lot' AND reference = $1`, [lot]);
  walk('lot', lot, null);
  const lotNode = nodes.get(`lot:${lot}`);

  const categorySplits = new Map();

  async function descend(outputRef, mass, path) {
    if (path.size > 12) return;
    // who produced this output
    const out = await one('SELECT * FROM outputs WHERE reference = $1', [outputRef]);
    if (!out) return;
    const run = await one('SELECT * FROM runs WHERE reference = $1', [out.run]);
    if (!run) return;
    addNode('run', run.reference, mass);
    const key = `run:${run.reference}`;
    if (path.has(key)) return;
    const seen = new Set(path); seen.add(key);
    // mass in of the run
    const inputs = await q('SELECT * FROM consumptions WHERE run = $1', [run.reference]);
    const totalIn = inputs.reduce((s, i) => s + Number(i.mass_g), 0);
    const totalOut = await q(`SELECT coalesce(sum(mass_g),0)::bigint m FROM outputs WHERE run = $1`, [run.reference]);
    const outs = Number(totalOut[0].m);
    for (const i of inputs) {
      const share = totalIn > 0 ? floorDiv(BigInt(mass) * BigInt(i.mass_g), BigInt(totalIn)) : 0n;
      if (i.batch) {
        const b = await one('SELECT * FROM batches WHERE reference = $1', [i.batch]);
        if (b) {
          // the node carries the total mass the batch contributed, undiluted by the chain:
          // the mass recorded on the consumption itself
          const n = addNode('batch', b.reference, i.mass_g);
          n.category_split[b.category] = (n.category_split[b.category] || 0) + Number(i.mass_g);
          edges.push({ from: `batch:${b.reference}`, to: `run:${run.reference}`, mass_g: Number(i.mass_g) });
          const rb = await resolveBatch(b);
          if (rb.flags.length) n.flags = [...new Set([...n.flags, ...rb.flags])];
          if (!rb.claimable) n.flags = [...new Set([...n.flags, 'non_claimable'])];
        }
      } else if (i.input_output) {
        const src = await one('SELECT * FROM outputs WHERE reference = $1', [i.input_output]);
        if (src) {
          edges.push({ from: `output:${i.input_output}`, to: `run:${run.reference}`, mass_g: Number(share) });
          await descend(i.input_output, Number(share), seen);
        }
      }
    }
  }

  function addNode(kind, reference, mass) {
    const key = `${kind}:${reference}`;
    if (!nodes.has(key)) nodes.set(key, { kind, reference, mass_g: 0n, category_split: {}, flags: [] });
    nodes.get(key).mass_g += BigInt(mass);
    return nodes.get(key);
  }

  const lotOutputs = await one(`SELECT * FROM outputs WHERE kind='lot' AND reference = $1`, [lot]);
  if (lotOutputs) {
    edges.push({ from: `run:${lotOutputs.run}`, to: `lot:${lot}`, mass_g: Number(lotOutputs.mass_g) });
    await descend(lot, Number(lotOutputs.mass_g), new Set());
  }

  const nodeList = [...nodes.values()].map((n) => ({
    kind: n.kind, reference: n.reference, mass_g: Number(n.mass_g),
    category_split: n.category_split, flags: n.flags
  }));
  const flagged = nodeList.some((n) => n.flags.length > 0);

  // text equivalent: same facts as a nested list
  const batchNodes = nodeList.filter((n) => n.kind === 'batch');
  const runNodes = nodeList.filter((n) => n.kind === 'run');
  const text_equivalent = {
    lot: { reference: lot, mass_g: Number(lotRow.mass_g) },
    runs: runNodes.map((r) => ({
      reference: r.reference, mass_g: r.mass_g,
      inputs: batchNodes.map((b) => ({ kind: 'batch', reference: b.reference, mass_g: b.mass_g, category_split: b.category_split, flags: b.flags }))
        .concat(nodeList.filter((n) => n.kind === 'output').map((o) => ({ kind: 'intermediate', reference: o.reference, mass_g: o.mass_g })))
    })),
    batches: batchNodes.map((b) => ({ reference: b.reference, mass_g: b.mass_g, category_split: b.category_split, flags: b.flags }))
  };
  return { nodes: nodeList, edges, flagged, text_equivalent };
}

// The reverse traversal: every lot containing any of the batch, every certificate, every recipient. Complete and unpaginated.
export async function batchImpact(batchRef) {
  const affected = new Map(); // lot -> mass
  const visitedOut = new Set();
  async function ascend(outputRef, mass) {
    const mIn = BigInt(mass);
    if (visitedOut.has(outputRef)) return;
    visitedOut.add(outputRef);
    const consumed = await q(`SELECT * FROM consumptions WHERE input_output = $1`, [outputRef]);
    for (const c of consumed) {
      const run = await one('SELECT * FROM runs WHERE reference = $1', [c.run]);
      if (!run) continue;
      const outs = await q('SELECT * FROM outputs WHERE run = $1', [run.reference]);
      const totalOut = outs.reduce((s, o) => s + Number(o.mass_g), 0);
      for (const o of outs) {
        const shareOut = BigInt(totalOut > 0 ? floorDiv(mIn * BigInt(o.mass_g), BigInt(totalOut)) : 0);
        if (o.kind === 'lot') {
          affected.set(o.reference, (affected.get(o.reference) || 0n) + shareOut);
        } else {
          await ascend(o.reference, shareOut);
        }
      }
    }
  }
  // every lot containing any of the batch, however many hops away
  const direct = await q('SELECT * FROM consumptions WHERE batch = $1', [batchRef]);
  const byRun = new Map();
  for (const c of direct) {
    if (!byRun.has(c.run)) byRun.set(c.run, 0n);
    byRun.set(c.run, byRun.get(c.run) + BigInt(c.mass_g));
  }
  for (const [runRef, batchMassIn] of byRun) {
    const outs = await q('SELECT * FROM outputs WHERE run = $1', [runRef]);
    const totalOut = outs.reduce((s, o) => s + Number(o.mass_g), 0);
    for (const o of outs) {
      const share = BigInt(totalOut > 0 ? floorDiv(batchMassIn * BigInt(o.mass_g), BigInt(totalOut)) : 0);
      if (share === 0n) continue;
      if (o.kind === 'lot') affected.set(o.reference, (affected.get(o.reference) || 0n) + share);
      else await ascend(o.reference, share);
    }
  }
  const lots = [];
  for (const [lotRef, mass] of affected) {
    const certs = await q('SELECT * FROM certificates WHERE lots @> $1::jsonb ORDER BY number', [JSON.stringify([{ lot: lotRef }])]);
    lots.push({
      lot: lotRef, mass_g: Number(mass),
      certificates: certs.map(serializeCertificateLite),
      recipients: [...new Set(certs.map((x) => x.recipient))]
    });
  }
  return {
    batch: batchRef,
    lots, lots_count: lots.length,
    certificates: lots.flatMap((l) => l.certificates),
    recipients: lots.flatMap((l) => l.recipients),
    complete_set: true
  };
}

export function serializeCertificateLite(x) {
  return { number: x.number, state: x.state, recipient: x.recipient, site: x.site, signed_at: iso(x.signed_at) };
}
