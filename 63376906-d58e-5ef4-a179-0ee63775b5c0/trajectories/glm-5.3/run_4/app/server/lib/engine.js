// The arithmetic layer. No surface of its own; it reads the operational
// record and the versioned methods and nothing else.
import { q } from '../db.js';
import { dryMass, creditGranted, contentBp, floorDiv } from './util.js';

export const CUSTODY_KINDS = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];

export async function loadGraph() {
  const [runs, outs, cons, lots, bts, devs, ovr, devi, periods] = await Promise.all([
    q('SELECT * FROM run'),
    q('SELECT * FROM output'),
    q('SELECT * FROM consumption'),
    q('SELECT * FROM lot'),
    q('SELECT * FROM batch'),
    q('SELECT * FROM device'),
    q('SELECT * FROM override'),
    q('SELECT * FROM deviation'),
    q('SELECT * FROM approval_period')
  ]);
  const G = {
    runs: runs.rows,
    outputs: outs.rows,
    consumptions: cons.rows,
    lots: lots.rows,
    batches: bts.rows,
    devices: devs.rows,
    overrides: ovr.rows,
    deviations: devi.rows,
    approvals: periods.rows
  };
  G.outputsByRun = new Map();
  for (const o of G.outputs) {
    if (!G.outputsByRun.has(o.run)) G.outputsByRun.set(o.run, []);
    G.outputsByRun.get(o.run).push(o);
  }
  G.consumptionsByInput = new Map();
  for (const c of G.consumptions) {
    if (!G.consumptionsByInput.has(c.batch)) G.consumptionsByInput.set(c.batch, []);
    G.consumptionsByInput.get(c.batch).push(c);
  }
  G.runById = new Map(G.runs.map((r) => [r.reference, r]));
  G.outputById = new Map(G.outputs.map((o) => [o.reference, o]));
  G.batchById = new Map(G.batches.map((b) => [b.reference, b]));
  G.lotById = new Map(G.lots.map((l) => [l.reference, l]));
  G.deviceById = new Map(G.devices.map((d) => [d.reference, d]));
  G.approvalsByCollector = new Map();
  for (const p of G.approvals) {
    if (!G.approvalsByCollector.has(p.collector)) G.approvalsByCollector.set(p.collector, []);
    G.approvalsByCollector.get(p.collector).push(p);
  }
  return G;
}

export function calibrationLapsed(device, receivedOn) {
  if (!device || !device.calibrated_on || !receivedOn) return false;
  const cal = new Date(device.calibrated_on + 'T00:00:00Z');
  const rec = new Date(receivedOn + 'T00:00:00Z');
  if (isNaN(cal.getTime()) || isNaN(rec.getTime())) return false;
  const ms = rec.getTime() - cal.getTime();
  // a calibration is valid for twelve months
  return ms > 365.25 * 86400000;
}

export function approvalInForce(periods, on) {
  return (periods || []).find((p) => p.valid_from <= on && on <= p.valid_to) || null;
}

export function batchClaimable(b, G) {
  const reasons = [];
  const periods = G.approvalsByCollector.get(b.collector) || [];
  const approval = approvalInForce(periods, b.received_on);
  if (!approval || !['approved', 'conditional'].includes(approval.state)) {
    reasons.push('collector_approval_lapsed');
  }
  if (b.claimable_from && b.claimable_from > b.received_on) {
    reasons.push('custody_link_missing');
  }
  const kinds = (b.custody || []).map((k) => k.kind);
  const missing = CUSTODY_KINDS.filter((k) => !kinds.includes(k));
  if (missing.length) reasons.push('custody_link_missing:' + missing[0]);
  const lapsed = calibrationLapsed(G.deviceById.get(b.device), b.received_on);
  return { claimable: reasons.length === 0, reason: reasons.length ? reasons.find((r) => r !== 'custody_link_missing') || reasons[0] : null, lapsed_calibration: lapsed, missing: missing[0] || null };
}

export function batchFlags(b, G) {
  const res = batchClaimable(b, G);
  const flags = [];
  if (res.lapsed_calibration) flags.push('lapsed_calibration');
  if (!res.claimable) {
    if (res.reason === 'collector_approval_lapsed') flags.push('collector_approval_lapsed');
    else if (String(res.reason).startsWith('custody_link_missing')) flags.push('custody_link_missing');
  }
  return flags;
}

// ---------- forward genealogy ----------

// A node's mass is the total mass it contributed toward the lot: the sum of the
// consumption masses recorded against it on runs that feed the lot. A batch
// reached by several paths appears once with that total.
export function lotGenealogy(lotRef, G) {
  const lot = G.lotById.get(lotRef);
  if (!lot) return null;

  // runs producing the lot
  const lotRuns = new Set(G.outputs.filter((o) => o.kind === 'lot' && o.lot === lotRef).map((o) => o.run));

  // backward BFS from the lot's runs to every run feeding them
  const connectedRuns = new Set();
  const stack = [...lotRuns];
  while (stack.length) {
    const runRef = stack.pop();
    if (connectedRuns.has(runRef)) continue;
    connectedRuns.add(runRef);
    for (const c of G.consumptions.filter((x) => x.run === runRef)) {
      const o = G.outputById.get(c.batch);
      if (o && o.kind === 'intermediate') stack.push(o.run);
    }
  }

  // nodes: any batch or intermediate consumed by a connected run
  const nodeMass = new Map();
  const incoming = new Map(); // node -> [{run, mass}]
  for (const c of G.consumptions) {
    if (!connectedRuns.has(c.run)) continue;
    const isBatch = G.batchById.has(c.batch);
    const isInter = (G.outputById.get(c.batch) || {}).kind === 'intermediate';
    if (!isBatch && !isInter) continue;
    nodeMass.set(c.batch, (nodeMass.get(c.batch) || 0) + Number(c.mass_g));
    if (!incoming.has(c.batch)) incoming.set(c.batch, []);
    incoming.get(c.batch).push({ run: c.run, mass_g: Number(c.mass_g) });
  }

  const nodes = [];
  const edges = [];
  const used = new Set();

  for (const [nodeRef, mass] of nodeMass.entries()) {
    if (mass <= 0) continue;
    used.add(nodeRef);
    const b = G.batchById.get(nodeRef);
    if (b) {
      const fl = batchFlags(b, G);
      nodes.push({
        kind: 'batch',
        reference: nodeRef,
        mass_g: mass,
        category: b.category,
        category_split: { [b.category]: mass },
        flags: fl,
        claimable: fl.length === 0,
        claimable_reason: fl.length ? fl[0] : null
      });
    } else {
      const o = G.outputById.get(nodeRef);
      nodes.push({
        kind: 'intermediate',
        reference: nodeRef,
        mass_g: mass,
        produced_by: o ? o.run : null,
        stage: o ? (G.runById.get(o.run) || {}).run_type : null,
        category_split: {},
        flags: []
      });
    }
    // edges to what this node's mass flowed into
    for (const inc of incoming.get(nodeRef) || []) {
      const outputs = G.outputsByRun.get(inc.run) || [];
      const outMass = outputs.reduce((s, o) => s + Number(o.mass_g), 0);
      if (outMass === 0) continue;
      for (const o of outputs) {
        const carried = Math.floor(inc.mass_g * (Number(o.mass_g) / outMass));
        if (carried <= 0) continue;
        if (o.kind === 'lot' && o.lot === lotRef) {
          edges.push({ from: nodeRef, to: lotRef, mass_g: carried });
        } else if (o.kind === 'intermediate' && nodeMass.has(o.reference)) {
          edges.push({ from: nodeRef, to: o.reference, mass_g: carried });
        }
      }
    }
  }

  nodes.push({
    kind: 'lot',
    reference: lotRef,
    mass_g: Number(lot.mass_g),
    category_split: lotSplitFromNodes(used, G),
    flags: [],
    grade: lot.grade,
    site: lot.site
  });

  nodes.sort((a, b) => a.kind.localeCompare(b.kind) || a.reference.localeCompare(b.reference));
  const flagged = nodes.some((n) => (n.flags || []).length > 0);

  return {
    lot: lotRef,
    nodes,
    edges,
    flagged,
    text_equivalent: textEquivalent(nodes, edges, lotRef)
  };
}

function lotSplitFromNodes(used, G) {
  const split = {};
  for (const ref of used) {
    const b = G.batchById.get(ref);
    if (b) split[b.category] = (split[b.category] || 0) + (nodeMassFor(ref, G) || 0);
  }
  return split;
}

function nodeMassFor(ref, G) {
  let m = 0;
  for (const c of G.consumptions) if (c.batch === ref) m += Number(c.mass_g);
  return m;
}

function textEquivalent(nodes, edges, lotRef) {
  const byRef = new Map(nodes.map((n) => [n.reference, n]));
  const childrenOf = new Map();
  for (const e of edges) {
    if (!childrenOf.has(e.from)) childrenOf.set(e.from, []);
    childrenOf.get(e.from).push(e);
  }
  const render = (ref) => {
    const n = byRef.get(ref);
    if (!n) return null;
    const kids = (childrenOf.get(ref) || []).map((e) => render(e.to)).filter(Boolean);
    const out = {
      kind: n.kind,
      reference: n.reference,
      mass_g: n.mass_g,
      category_split: n.category_split,
      flags: n.flags || []
    };
    if (kids.length) out.children = kids;
    return out;
  };
  return [render(lotRef)].filter(Boolean);
}

// ---------- reverse traversal ----------

export async function batchImpact(batchRef) {
  const G = await loadGraph();
  const batch = G.batchById.get(batchRef);
  if (!batch) return null;

  const lotMass = new Map();
  const spread = (nodeRef, grams) => {
    for (const c of G.consumptionsByInput.get(nodeRef) || []) {
      const run = G.runById.get(c.run);
      if (!run) continue;
      const outputs = G.outputsByRun.get(run.reference) || [];
      const outMass = outputs.reduce((s, o) => s + Number(o.mass_g), 0);
      if (outMass === 0) continue;
      for (const o of outputs) {
        const carried = grams * (Number(o.mass_g) / outMass);
        if (o.kind === 'lot') {
          lotMass.set(o.lot, (lotMass.get(o.lot) || 0) + carried);
        } else if (o.kind === 'intermediate') {
          spread(o.reference, carried);
        }
      }
    }
  };
  spread(batchRef, Number(batch.net_g));

  const lots = [...lotMass.entries()]
    .filter(([, m]) => m > 0)
    .map(([ref, m]) => ({ reference: ref, mass_g: Math.floor(m) }))
    .sort((a, b) => a.reference.localeCompare(b.reference));

  const certRows = await q('SELECT * FROM certificate');
  const certs = certRows.rows.filter((c) =>
    (c.lots || []).some((l) => lots.some((x) => x.reference === (l.reference || l)))
  );
  const recipients = [];
  for (const cert of certs) {
    if (!recipients.find((r) => r.reference === cert.recipient)) {
      recipients.push({ reference: cert.recipient, name: cert.recipient_name });
    }
  }
  return {
    batch: batchRef,
    lots,
    certificates: certs.map((c) => ({
      number: c.number,
      state: c.state,
      recipient: c.recipient,
      recipient_name: c.recipient_name
    })),
    recipients,
    text_equivalent: [
      {
        kind: 'batch',
        reference: batchRef,
        children: lots.map((l) => ({
          kind: 'lot',
          reference: l.reference,
          mass_g: l.mass_g,
          children: certs
            .filter((c) => (c.lots || []).some((x) => (x.reference || x) === l.reference))
            .map((c) => ({
              kind: 'certificate',
              reference: c.number,
              state: c.state,
              children: [
                { kind: 'recipient', reference: c.recipient, name: c.recipient_name }
              ]
            }))
        }))
      }
    ]
  };
}

// ---------- ledger arithmetic ----------

export async function periodCredits(periodId) {
  const mov = await q('SELECT * FROM credit_movement WHERE balance_period = $1', [periodId]);
  const bp = await q('SELECT * FROM balance_period WHERE id = $1', [periodId]);
  const factor = await q(
    `SELECT * FROM conversion_factor WHERE site = $1 AND provisional = false ORDER BY published_on DESC, reference DESC LIMIT 1`,
    [bp.rows[0] ? bp.rows[0].site : null]
  );
  const fbp = factor.rows.length ? factor.rows[0].factor_bp : 0;
  const credits = {};
  // Credits in are granted at consumption only: a transfer is never a fresh credit.
  for (const m of mov.rows) {
    if (m.kind !== 'consumption' && m.kind !== 'allocation') continue;
    const cat = (credits[m.category] || (credits[m.category] = { in: 0, out: 0 }));
    if (m.direction === 'in') cat.in += Number(m.mass_g);
    else cat.out += Number(m.mass_g);
  }
  return {
    movements: mov.rows,
    factor_bp: fbp,
    factor_reference: factor.rows[0]?.reference || null,
    credits,
    period: bp.rows[0]
  };
}

export function creditFigure(credits, cat) {
  const c = credits[cat] || { in: 0, out: 0 };
  return { credits_in_g: c.in, credits_out_g: c.out, credits_available_g: c.in - c.out };
}

export async function lotAllocated(lotRef) {
  const r = await q(
    `SELECT category, SUM(mass_g)::bigint AS m FROM credit_movement WHERE lot = $1 AND direction = 'out' GROUP BY category`,
    [lotRef]
  );
  const out = { post_consumer: 0, pre_consumer: 0 };
  for (const row of r.rows) out[row.category] = Number(row.m);
  return out;
}

export function contentFor(attachedByCat, lotMass) {
  let attached = 0;
  for (const v of Object.values(attachedByCat)) attached += v;
  return { attached_g: attached, content_bp: contentBp(attached, lotMass) };
}

export async function lotFlagsDownstream(lotRef, G) {
  // flags from every batch the lot descends from
  const flags = [];
  const seenBatch = new Set();
  const walk = (nodeRef) => {
    for (const c of G.consumptionsByInput.get(nodeRef) || []) {
      const run = G.runById.get(c.run);
      if (!run) continue;
      const outputs = G.outputsByRun.get(run.reference) || [];
      const outMass = outputs.reduce((s, o) => s + Number(o.mass_g), 0);
      if (outMass === 0) continue;
      for (const o of outputs) {
        if (o.kind === 'lot' && o.lot === lotRef) {
          if (G.batchById.has(nodeRef) && !seenBatch.has(nodeRef)) {
            seenBatch.add(nodeRef);
            for (const f of batchFlags(G.batchById.get(nodeRef), G)) flags.push({ batch: nodeRef, flag: f });
          }
        } else if (o.kind === 'intermediate') {
          walk(o.reference);
        }
      }
    }
  };
  walk(lotRef);
  return flags;
}
