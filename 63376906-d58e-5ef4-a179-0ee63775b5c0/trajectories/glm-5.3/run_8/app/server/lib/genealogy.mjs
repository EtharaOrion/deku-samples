import { q, one } from "./db.mjs";

/* Genealogy is a traversal over the consumption records, never a stored summary.
   A batch reachable by several paths appears once, with the total mass it contributed. */

export async function loadGraph() {
  const [runs, consumptions, outputs, batches, lots] = await Promise.all([
    q("SELECT * FROM run ORDER BY started_at"),
    q("SELECT * FROM consumption ORDER BY consumed_at"),
    q("SELECT * FROM output"),
    q("SELECT * FROM batch"),
    q("SELECT * FROM lot"),
  ]);
  const idx = {
    runs, consumptions, outputs, batches, lots,
    runByRef: new Map(runs.map((r) => [r.reference, r])),
    batchByRef: new Map(batches.map((b) => [b.reference, b])),
    outByRef: new Map(outputs.map((o) => [o.reference, o])),
    lotByRef: new Map(lots.map((l) => [l.reference, l])),
    consumptionsByRun: new Map(),
    outputsByRun: new Map(),
    runOfOutput: new Map(),
    lotOfOutput: new Map(),
    consumptionsOfInput: new Map(),
  };
  for (const c of consumptions) {
    if (!idx.consumptionsByRun.has(c.run)) idx.consumptionsByRun.set(c.run, []);
    idx.consumptionsByRun.get(c.run).push(c);
    const key = c.input_kind + "|" + c.input;
    if (!idx.consumptionsOfInput.has(key)) idx.consumptionsOfInput.set(key, []);
    idx.consumptionsOfInput.get(key).push(c);
  }
  for (const o of outputs) {
    if (!idx.outputsByRun.has(o.run)) idx.outputsByRun.set(o.run, []);
    idx.outputsByRun.get(o.run).push(o);
    idx.runOfOutput.set(o.reference, o.run);
    if (o.kind === "lot" && o.lot) idx.lotOfOutput.set(o.reference, o.lot);
  }
  return idx;
}

export function missingCustody(b) {
  const required = ["collection_site", "collector", "transport", "arrival", "weighing", "acceptance"];
  const have = new Set((b.custody || []).map((c) => c.kind));
  for (const k of required) if (!have.has(k)) return k;
  return null;
}

export function calibrationLapsedOn(b, calibratedOn) {
  if (!calibratedOn) return false;
  const received = Date.parse(b.received_on);
  const cal = Date.parse(calibratedOn);
  if (Number.isNaN(received) || Number.isNaN(cal)) return false;
  return received - cal > 365.25 * 24 * 3600 * 1000;
}

export function batchFlags(b, calibratedOn) {
  const flags = [];
  if (calibrationLapsedOn(b, calibratedOn)) flags.push("lapsed_calibration");
  const missing = missingCustody(b);
  if (missing) flags.push("custody_link_missing_" + missing);
  return flags;
}

export async function approvalInForce(collectorRef, onDate) {
  const rows = await q(
    `SELECT * FROM approval_period WHERE collector=$1 AND valid_from <= $2 AND valid_to >= $2
     ORDER BY valid_from DESC LIMIT 1`,
    [collectorRef, onDate]
  );
  return rows[0] || null;
}

export async function batchClaimability(b, device) {
  const approval = await approvalInForce(b.collector, b.received_on);
  const missing = missingCustody(b);
  let claimable = true;
  let reason = null;
  if (!approval || (approval.state !== "approved" && approval.state !== "conditional")) {
    claimable = false;
    reason = approval ? "collector_approval_" + approval.state : "collector_approval_lapsed";
  } else if (missing) {
    claimable = false;
    reason = "custody_link_missing";
  }
  const lapsed = calibrationLapsedOn(b, device ? device.calibrated_on : null);
  return { claimable, reason, missing_kind: missing, approval, lapsed_calibration: lapsed };
}

/* ancestors of a lot */
export function ancestorsOfLot(idx, lotRef) {
  const batchMass = new Map();
  const runRefs = new Set();
  const outputRefs = new Set();
  const edges = [];

  const visitOutput = (outRef) => {
    if (outputRefs.has(outRef)) return;
    outputRefs.add(outRef);
    const o = idx.outByRef.get(outRef);
    if (!o) return;
    const runRef = idx.runOfOutput.get(outRef);
    edges.push({ from: "run:" + runRef, to: "output:" + outRef, mass_g: Number(o.mass_g) });
    visitRun(runRef);
  };

  const visitRun = (runRef) => {
    if (!runRef || runRefs.has(runRef)) return;
    runRefs.add(runRef);
    const cons = idx.consumptionsByRun.get(runRef) || [];
    for (const c of cons) {
      edges.push({ from: c.input_kind + ":" + c.input, to: "run:" + runRef, mass_g: Number(c.mass_g) });
      if (c.input_kind === "batch") {
        batchMass.set(c.input, (batchMass.get(c.input) || 0) + Number(c.mass_g));
      } else {
        visitOutput(c.input);
      }
    }
  };

  for (const [outRef, lot] of idx.lotOfOutput.entries()) {
    if (lot === lotRef) {
      const o = idx.outByRef.get(outRef);
      edges.push({ from: "output:" + outRef, to: "lot:" + lotRef, mass_g: Number(o.mass_g) });
      visitRun(idx.runOfOutput.get(outRef));
    }
  }
  return { batchMass, runRefs, outputRefs, edges };
}

export function categorySplitFor(idx, batchMass) {
  const split = { post_consumer: 0, pre_consumer: 0 };
  for (const [ref, mass] of batchMass.entries()) {
    const b = idx.batchByRef.get(ref);
    if (!b) continue;
    split[b.category] = (split[b.category] || 0) + Number(mass);
  }
  return split;
}

export async function genealogyForLot(lotRef) {
  const idx = await loadGraph();
  const lot = idx.lotByRef.get(lotRef);
  if (!lot) return null;
  const { batchMass, runRefs, outputRefs, edges } = ancestorsOfLot(idx, lotRef);
  const devices = new Map((await q("SELECT * FROM weighing_device")).map((d) => [d.reference, d]));

  const nodes = [];
  let flagged = false;
  for (const [ref, mass] of batchMass.entries()) {
    const b = idx.batchByRef.get(ref);
    const dev = devices.get(b.device);
    const flags = batchFlags(b, dev ? dev.calibrated_on : null);
    const cl = await batchClaimability(b, dev);
    if (!cl.claimable) flags.push("non_claimable");
    if (flags.length) flagged = true;
    const split = { post_consumer: 0, pre_consumer: 0 };
    split[b.category] = mass;
    nodes.push({ kind: "batch", reference: ref, mass_g: mass, category_split: split, flags, claimable: cl.claimable, claimable_reason: cl.reason, claimable_from: b.claimable_from || null });
  }
  for (const r of runRefs) {
    const run = idx.runByRef.get(r);
    const flags = [];
    const badCustody = (idx.consumptionsByRun.get(r) || []).filter((c) => {
      if (c.input_kind !== "batch") return false;
      const b = idx.batchByRef.get(c.input);
      return b && missingCustody(b);
    });
    if (badCustody.length) { flags.push("custody_link_missing"); if (flags.length) flagged = true; }
    nodes.push({ kind: "run", reference: r, mass_g: run ? Number(run.mass_in_g) : 0, category_split: null, flags });
  }
  for (const o of outputRefs) {
    const out = idx.outByRef.get(o);
    nodes.push({ kind: out && out.kind === "byproduct" ? "byproduct" : "intermediate", reference: o, mass_g: out ? Number(out.mass_g) : 0, category_split: null, flags: [] });
  }
  nodes.push({ kind: "lot", reference: lotRef, mass_g: Number(lot.mass_g), category_split: categorySplitFor(idx, batchMass), flags: [] });

  return {
    lot: lotRef,
    nodes,
    edges,
    flagged,
    text_equivalent: textEquivalent(idx, lotRef, devices),
    derivation: {
      method: "traversal of the consumption records",
      batches: batchMass.size,
      runs: runRefs.size,
      computed_at: new Date().toISOString(),
    },
  };
}

function textEquivalent(idx, lotRef, devices) {
  const buildRun = (runRef, seen) => {
    const run = idx.runByRef.get(runRef);
    const cons = idx.consumptionsByRun.get(runRef) || [];
    return {
      kind: "run",
      reference: runRef,
      mass_g: run ? Number(run.mass_in_g) : 0,
      flags: [],
      children: cons.map((c) => {
        if (c.input_kind === "batch") {
          const b = idx.batchByRef.get(c.input);
          const dev = devices.get(b.device);
          const flags = batchFlags(b, dev ? dev.calibrated_on : null);
          return { kind: "batch", reference: c.input, mass_g: Number(c.mass_g), category_split: { [b.category]: Number(c.mass_g) }, flags, children: [] };
        }
        const next = new Set(seen);
        next.add("output:" + c.input);
        return { kind: "intermediate", reference: c.input, mass_g: Number(c.mass_g), flags: [], children: [buildRun(idx.runOfOutput.get(c.input), next)] };
      }),
    };
  };
  const children = [];
  for (const [outRef, lot] of idx.lotOfOutput.entries()) {
    if (lot !== lotRef) continue;
    children.push(buildRun(idx.runOfOutput.get(outRef), new Set(["output:" + outRef])));
  }
  const lot = idx.lotByRef.get(lotRef);
  return { kind: "lot", reference: lotRef, mass_g: lot ? Number(lot.mass_g) : 0, flags: [], children };
}

/* descendants of a batch */
export function descendantsOfBatch(idx, batchRef) {
  const lotMass = new Map();
  const runRefs = new Set();
  const visit = (kind, ref, seen) => {
    const key = kind + "|" + ref;
    if (seen.has(key)) return;
    const next = new Set(seen);
    next.add(key);
    const cons = idx.consumptionsOfInput.get(key) || [];
    for (const c of cons) {
      runRefs.add(c.run);
      const outs = idx.outputsByRun.get(c.run) || [];
      const totalOut = outs.reduce((s, o) => s + Number(o.mass_g), 0);
      for (const o of outs) {
        const share = totalOut ? Math.floor((Number(c.mass_g) * Number(o.mass_g)) / totalOut) : 0;
        if (o.kind === "lot" && o.lot) {
          lotMass.set(o.lot, (lotMass.get(o.lot) || 0) + share);
        } else if (o.kind === "intermediate") {
          visit("output", o.reference, next);
        }
      }
    }
  };
  visit("batch", batchRef, new Set());
  return { lotMass, runRefs };
}

export async function impactOfBatch(batchRef) {
  const idx = await loadGraph();
  const b = idx.batchByRef.get(batchRef);
  if (!b) return null;
  const { lotMass } = descendantsOfBatch(idx, batchRef);
  const lots = [...lotMass.keys()];
  const certs = await q("SELECT * FROM certificate");
  const touching = certs.filter((c) => (c.lots || []).some((l) => lots.includes(l.reference)));
  const customers = await q("SELECT * FROM customer");
  const custByRef = new Map(customers.map((c) => [c.reference, c]));
  return {
    batch: batchRef,
    lots: lots.sort().map((l) => ({ reference: l, mass_from_batch_g: lotMass.get(l) })),
    certificates: touching.map((c) => ({ number: c.number, state: c.state, recipient: c.recipient, recipient_name: c.recipient_name })),
    recipients: [...new Set(touching.map((c) => (custByRef.get(c.recipient) || {}).contact || c.recipient_name))],
    derivation: { method: "traversal of the consumption records, forward", computed_at: new Date().toISOString() },
  };
}
