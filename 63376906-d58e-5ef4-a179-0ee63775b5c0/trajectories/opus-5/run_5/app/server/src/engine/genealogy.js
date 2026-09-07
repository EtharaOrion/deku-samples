// The arithmetic layer. It reads the operational record and the versioned
// definitions and writes to neither.
import { q, one, poolRunner } from '../lib/db.js';
import { dryMass, dayOf } from '../lib/num.js';

// Reads against whichever runner it is handed, so a traversal taken inside a
// snapshot sees the same state as the rest of that read.
async function graphTables(runner = poolRunner) {
  const [batches, runs, consumptions, outputs, lots, devices, approvals, collectors] = await Promise.all([
    runner.q('select * from batch'),
    runner.q('select * from run'),
    runner.q('select * from consumption'),
    runner.q('select * from output'),
    runner.q('select * from lot'),
    runner.q('select * from weighing_device'),
    runner.q('select * from approval_period'),
    runner.q('select * from collector'),
  ]);
  const custody = await runner.q('select * from custody_link order by batch, ordinal');
  return { batches, runs, consumptions, outputs, lots, devices, approvals, collectors, custody };
}

export function approvalInForce(approvals, collector, on) {
  const day = dayOf(on);
  const periods = approvals
    .filter((a) => a.collector === collector)
    .filter((a) => dayOf(a.valid_from) <= day && day <= dayOf(a.valid_to))
    .sort((a, b) => String(b.valid_from).localeCompare(String(a.valid_from)));
  return periods[0] || null;
}

export function batchFacts(b, ctx) {
  const dry = dryMass(b.net_g, b.moisture_bp);
  const links = ctx.custody.filter((l) => l.batch === b.reference);
  const REQUIRED = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
  const present = new Set(links.map((l) => l.kind));
  const missing = REQUIRED.filter((k) => !present.has(k));
  const custody_complete = missing.length === 0;
  const approval = approvalInForce(ctx.approvals, b.collector, b.received_on);
  const approvalOk = approval && (approval.state === 'approved' || approval.state === 'conditional');
  let claimable = true;
  let claimable_reason = null;
  let missing_link = null;
  if (!approvalOk) {
    claimable = false;
    claimable_reason = 'collector_approval_lapsed';
  } else if (!custody_complete) {
    claimable = false;
    claimable_reason = 'custody_link_missing';
    missing_link = missing[0];
  }
  // A late custody document makes the batch claimable forward from its arrival date.
  let claimable_from = b.claimable_from ? dayOf(b.claimable_from) : null;
  if (!claimable && claimable_reason === 'custody_link_missing' && claimable_from) {
    claimable = true;
    claimable_reason = null;
  }
  const device = ctx.devices.find((d) => d.reference === b.device);
  const flags = [];
  if (device) {
    const cal = new Date(String(device.calibrated_on));
    const rec = new Date(String(b.received_on));
    const months = (rec - cal) / (1000 * 60 * 60 * 24 * 365.25 / 12);
    if (months > 12) flags.push('lapsed_calibration');
  }
  if (!custody_complete && !claimable_from) flags.push('custody_link_missing');
  if (!claimable) flags.push('non_claimable');
  const accepted_g = b.accepted_g == null ? b.net_g : b.accepted_g;
  return {
    dry_mass_g: dry,
    claimable,
    claimable_reason,
    missing_link,
    missing_links: missing,
    custody_complete,
    claimable_from,
    flags,
    accepted_g,
    approval_state: approval ? approval.state : 'lapsed',
    approval_valid_to: approval ? dayOf(approval.valid_to) : null,
  };
}

// A batch reaches a lot across four hops by several paths. The traversal walks
// consumption records; nothing is stored as a summary.
export async function genealogyOfLot(lotRef, runner = poolRunner) {
  const ctx = await graphTables(runner);
  const lot = ctx.lots.find((l) => l.reference === lotRef);
  if (!lot) return null;
  const outputByRef = new Map(ctx.outputs.map((o) => [o.reference, o]));
  const runByRef = new Map(ctx.runs.map((r) => [r.reference, r]));
  const batchByRef = new Map(ctx.batches.map((b) => [b.reference, b]));
  const consByRun = new Map();
  for (const cn of ctx.consumptions) {
    if (!consByRun.has(cn.run)) consByRun.set(cn.run, []);
    consByRun.get(cn.run).push(cn);
  }
  const outByRun = new Map();
  for (const o of ctx.outputs) {
    if (!outByRun.has(o.run)) outByRun.set(o.run, []);
    outByRun.get(o.run).push(o);
  }

  const nodes = new Map();
  const edgeAgg = new Map();
  const batchMass = new Map();

  function addNode(kind, reference, mass_g, extra = {}) {
    if (!nodes.has(reference)) nodes.set(reference, { kind, reference, mass_g, category_split: {}, flags: [], ...extra });
    return nodes.get(reference);
  }
  function addEdge(from, to, mass_g) {
    const k = `${from}>${to}`;
    const cur = edgeAgg.get(k) || { from, to, mass_g: 0 };
    cur.mass_g += mass_g;
    edgeAgg.set(k, cur);
  }

  // Walk backwards from the lot's output through runs and consumptions.
  const lotNodeRef = lot.reference;
  addNode('lot', lotNodeRef, lot.mass_g, { grade: lot.grade, site: lot.site, disposition: lot.disposition, claim_type: lot.claim_type });

  const seenRuns = new Set();
  const stack = [];
  const producingRun = ctx.outputs.find((o) => o.reference === lot.output_ref)?.run;
  if (producingRun) stack.push({ run: producingRun, into: lotNodeRef });

  const childListing = new Map(); // node -> [child refs]

  function link(parent, child) {
    if (!childListing.has(parent)) childListing.set(parent, []);
    if (!childListing.get(parent).includes(child)) childListing.get(parent).push(child);
  }

  while (stack.length) {
    const { run: runRef, into } = stack.pop();
    const run = runByRef.get(runRef);
    if (!run) continue;
    const runNodeKey = runRef;
    const outs = outByRun.get(runRef) || [];
    const totalOut = outs.reduce((s, o) => s + Number(o.mass_g), 0);
    addNode('run', runNodeKey, totalOut, {
      run_type: run.run_type,
      site: run.site,
      state: run.state,
      losses_g: run.losses_g,
      within_tolerance: run.within_tolerance,
    });
    addEdge(runNodeKey, into, nodes.get(into).mass_g);
    link(into, runNodeKey);
    if (seenRuns.has(runRef)) continue;
    seenRuns.add(runRef);
    for (const cn of consByRun.get(runRef) || []) {
      if (cn.input_kind === 'batch') {
        const b = batchByRef.get(cn.input_ref);
        if (!b) continue;
        // one node, mass_g is the total mass it contributed across every path
        batchMass.set(cn.input_ref, (batchMass.get(cn.input_ref) || 0) + Number(cn.mass_g));
        addNode('batch', cn.input_ref, 0, {
          category: b.category,
          site: b.site,
          collector: b.collector,
          collector_name: b.collector_name,
          received_on: dayOf(b.received_on),
        });
        addEdge(cn.input_ref, runNodeKey, Number(cn.mass_g));
        link(runNodeKey, cn.input_ref);
      } else {
        const o = outputByRef.get(cn.input_ref);
        if (!o) continue;
        addNode('output', cn.input_ref, Number(o.mass_g), { kind_detail: o.kind, disposition: o.disposition });
        addEdge(cn.input_ref, runNodeKey, Number(cn.mass_g));
        link(runNodeKey, cn.input_ref);
        stack.push({ run: o.run, into: cn.input_ref });
      }
    }
  }

  for (const [ref, mass] of batchMass) {
    const n = nodes.get(ref);
    if (n) {
      n.mass_g = mass;
      const b = batchByRef.get(ref);
      const facts = batchFacts(b, ctx);
      n.flags = facts.flags;
      n.claimable = facts.claimable;
      n.claimable_reason = facts.claimable_reason;
      n.dry_mass_g = facts.dry_mass_g;
      n.category_split = facts.claimable
        ? { [b.category]: mass, non_claimable: 0 }
        : { post_consumer: 0, pre_consumer: 0, non_claimable: mass };
    }
  }

  // Roll the category split up through the graph by mass contribution.
  const order = [...nodes.keys()];
  for (let pass = 0; pass < 6; pass++) {
    for (const ref of order) {
      const n = nodes.get(ref);
      if (n.kind === 'batch') continue;
      const kids = childListing.get(ref) || [];
      const split = { post_consumer: 0, pre_consumer: 0, non_claimable: 0 };
      let any = false;
      for (const k of kids) {
        const kn = nodes.get(k);
        if (!kn) continue;
        any = true;
        for (const cat of Object.keys(split)) split[cat] += Number(kn.category_split?.[cat] || 0);
      }
      if (any) n.category_split = split;
      const kidFlags = kids.flatMap((k) => nodes.get(k)?.flags || []);
      n.flags = [...new Set([...(n.flags || []), ...kidFlags])];
    }
  }

  const nodeList = [...nodes.values()];
  const edges = [...edgeAgg.values()];
  const flagged = nodeList.some((n) => (n.flags || []).length > 0);

  function nest(ref, seen = new Set()) {
    const n = nodes.get(ref);
    if (!n) return null;
    const kids = (childListing.get(ref) || []).filter((k) => !seen.has(k));
    const nextSeen = new Set([...seen, ref]);
    return {
      kind: n.kind,
      reference: n.reference,
      mass_g: n.mass_g,
      category_split: n.category_split,
      flags: n.flags,
      inputs: kids.map((k) => nest(k, nextSeen)).filter(Boolean),
    };
  }

  return {
    lot: lotRef,
    nodes: nodeList,
    edges,
    flagged,
    text_equivalent: nest(lotNodeRef),
  };
}

// The same traversal backwards: every lot containing any of the batch, every
// certificate resting on those lots, and every recipient.
export async function impactOfBatch(batchRef, runner = poolRunner) {
  const ctx = await graphTables(runner);
  const b = ctx.batches.find((x) => x.reference === batchRef);
  if (!b) return null;
  const outByRef = new Map(ctx.outputs.map((o) => [o.reference, o]));
  const consByInput = new Map();
  for (const cn of ctx.consumptions) {
    if (!consByInput.has(cn.input_ref)) consByInput.set(cn.input_ref, []);
    consByInput.get(cn.input_ref).push(cn);
  }
  const outsByRun = new Map();
  for (const o of ctx.outputs) {
    if (!outsByRun.has(o.run)) outsByRun.set(o.run, []);
    outsByRun.get(o.run).push(o);
  }

  const runs = new Set();
  const outputs = new Set();
  const lots = new Set();
  const frontier = [batchRef];
  const seen = new Set();
  while (frontier.length) {
    const ref = frontier.pop();
    if (seen.has(ref)) continue;
    seen.add(ref);
    for (const cn of consByInput.get(ref) || []) {
      runs.add(cn.run);
      for (const o of outsByRun.get(cn.run) || []) {
        outputs.add(o.reference);
        if (o.kind === 'lot') {
          const l = ctx.lots.find((x) => x.output_ref === o.reference);
          if (l) lots.add(l.reference);
        }
        frontier.push(o.reference);
      }
    }
  }
  // A blend carries the impact into the blended lot too.
  for (const l of ctx.lots) {
    const from = l.blended_from || [];
    if (Array.isArray(from) && from.some((f) => lots.has(f?.lot || f))) lots.add(l.reference);
  }

  const certs = await runner.q('select * from certificate order by number, version');
  const affected = certs.filter((c) => (c.lots || []).some((x) => lots.has(x.lot || x)));
  const recipients = [];
  const seenRec = new Set();
  for (const c of affected) {
    if (!seenRec.has(c.recipient)) {
      seenRec.add(c.recipient);
      recipients.push({ reference: c.recipient, name: c.recipient_name });
    }
  }
  const facts = batchFacts(b, ctx);
  return {
    batch: batchRef,
    batch_mass_g: b.net_g,
    dry_mass_g: facts.dry_mass_g,
    claimable: facts.claimable,
    flags: facts.flags,
    runs: [...runs].sort(),
    outputs: [...outputs].sort(),
    lots: [...lots].sort().map((r) => {
      const l = ctx.lots.find((x) => x.reference === r);
      return { reference: r, mass_g: l.mass_g, grade: l.grade, site: l.site, disposition: l.disposition, claim_type: l.claim_type };
    }),
    certificates: affected.map((c) => ({
      number: c.number,
      version: c.version,
      state: c.state,
      site: c.site,
      recipient: c.recipient,
      recipient_name: c.recipient_name,
      signed_on: dayOf(c.signed_on),
    })),
    recipients,
    complete: true,
  };
}

export async function batchWithFacts(reference, runner = poolRunner) {
  const ctx = await graphTables(runner);
  const b = ctx.batches.find((x) => x.reference === reference);
  if (!b) return null;
  return shapeBatch(b, ctx);
}

export function shapeBatch(b, ctx) {
  const facts = batchFacts(b, ctx);
  const links = ctx.custody.filter((l) => l.batch === b.reference);
  return {
    reference: b.reference,
    collector: b.collector,
    collector_name: b.collector_name,
    site: b.site,
    grade: b.grade,
    category: b.category,
    gross_g: Number(b.gross_g),
    tare_g: Number(b.tare_g),
    net_g: Number(b.net_g),
    moisture_bp: b.moisture_bp,
    moisture_method: b.moisture_method,
    device: b.device,
    received_on: dayOf(b.received_on),
    composition: b.composition,
    contamination: b.contamination,
    dry_mass_g: facts.dry_mass_g,
    claimable: facts.claimable,
    claimable_reason: facts.claimable_reason,
    claimable_from: facts.claimable_from,
    missing_link: facts.missing_link,
    missing_links: facts.missing_links,
    custody_complete: facts.custody_complete,
    flags: facts.flags,
    accepted_g: facts.accepted_g,
    rejected_g: Number(b.rejected_g || 0),
    rejected_destination: b.rejected_destination,
    rejected_reason: b.rejected_reason,
    approval_state_on_receipt: facts.approval_state,
    approval_valid_to: facts.approval_valid_to,
    custody: links.map((l) => ({
      kind: l.kind,
      party: l.party,
      date: l.link_date ? dayOf(l.link_date) : null,
      late: l.late,
      arrived_on: l.arrived_on ? dayOf(l.arrived_on) : null,
      document: l.document,
    })),
    event_at: b.event_at,
    recorded_at: b.recorded_at,
    effective_on: dayOf(b.effective_on),
    derivation: {
      dry_mass_g: 'net_g * (10000 - moisture_bp) / 10000, floored',
      claimable: 'approval period in force on received_on, and the custody chain',
    },
  };
}

export async function listBatches(runner = poolRunner) {
  const ctx = await graphTables(runner);
  return ctx.batches
    .sort((a, b) => a.reference.localeCompare(b.reference))
    .map((b) => shapeBatch(b, ctx));
}

export async function contextFor(runner = poolRunner) {
  return graphTables(runner);
}

export async function lotDryClaimableInputs(lotRef) {
  const g = await genealogyOfLot(lotRef);
  if (!g) return [];
  return g.nodes.filter((n) => n.kind === 'batch');
}

export async function flagsForLot(lotRef, runner = poolRunner) {
  const g = await genealogyOfLot(lotRef, runner);
  if (!g) return [];
  const s = new Set();
  for (const n of g.nodes) for (const f of n.flags || []) s.add(f);
  return [...s];
}

export async function runOutputsFor(runRef) {
  return q('select * from output where run = $1 order by reference', [runRef]);
}

export async function lotByRef(ref) {
  return one('select * from lot where reference = $1', [ref]);
}
