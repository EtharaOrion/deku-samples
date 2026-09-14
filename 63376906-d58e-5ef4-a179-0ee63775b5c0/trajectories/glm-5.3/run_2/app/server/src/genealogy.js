import { q, one } from "./db.js";

// Genealogy is a traversal over the consumption records rather than a stored
// summary: a graph and not a tree. A batch reached by several paths appears
// once with its total mass. Both directions carry the same facts as a nested
// list.

const BATCH_FIELDS = `reference, collector, category, received_on, net_g, moisture_bp, device, status, claimable_from, contamination, composition, custody, accepted_g, rejected_g, rejected_destination, site as site_ref`;

export async function batchByRef(ref) {
  return one(`select * from batches where reference = $1`, [ref]);
}
export async function runByRef(ref) {
  return one(`select * from runs where reference = $1`, [ref]);
}
export async function lotByRef(ref) {
  return one(`select * from lots where reference = $1`, [ref]);
}
export async function outputByRef(ref) {
  return one(`select * from outputs where reference = $1`, [ref]);
}

// Forward traversal from a lot to every batch that reached it.
export async function forwardTraversal(lotRef) {
  const nodes = new Map();
  const edges = [];
  const addedRuns = new Set();

  const lot = await lotByRef(lotRef);
  if (!lot) return null;
  nodes.set(lot.reference, {
    kind: "lot",
    reference: lot.reference,
    mass_g: Number(lot.mass_g),
    category_split: {},
    flags: await flagsForLot(lotRef),
  });

  async function addOutput(ref, viaMass) {
    const out = await outputByRef(ref);
    if (!out) return;
    nodes.set(out.reference, {
      kind: out.kind,
      reference: out.reference,
      mass_g: Number(out.mass_g),
      category_split: {},
      flags: [],
    });
    await addRun(out.run, out.reference, viaMass);
  }

  async function addRun(runRef, toRef, viaMass) {
    if (addedRuns.has(runRef + ":" + toRef)) return;
    addedRuns.add(runRef + ":" + toRef);
    const run = await runByRef(runRef);
    if (!run) return;
    nodes.set(run.reference, {
      kind: "run",
      reference: run.reference,
      mass_g: null,
      category_split: {},
      flags: [],
    });
    edges.push({ from: run.reference, to: toRef, mass_g: viaMass });
    const cons = await q(`select * from consumptions where run = $1`, [runRef]);
    for (const c of cons) {
      const mass = Number(c.mass_g);
      edges.push({ from: c.input_reference, to: run.reference, mass_g: mass });
      if (c.input_type === "batch") {
        await addBatch(c.input_reference, mass);
      } else {
        await addOutput(c.input_reference, mass);
      }
    }
  }

  async function addBatch(ref, viaMass) {
    const b = await batchByRef(ref);
    if (!b) return;
    const existing = nodes.get(ref);
    if (existing) {
      existing.mass_g = Number(existing.mass_g) + viaMass;
      return;
    }
    nodes.set(ref, {
      kind: "batch",
      reference: ref,
      mass_g: viaMass,
      category_split: { [b.category]: viaMass },
      flags: await flagsForBatch(b),
    });
  }

  // the lot is produced by a run, via an output row
  const lotOutput = await one(`select * from outputs where lot = $1`, [lotRef]);
  if (lotOutput) {
    edges.push({ from: lotOutput.run, to: lotRef, mass_g: Number(lotOutput.mass_g) });
    await addRun(lotOutput.run, lotRef, Number(lotOutput.mass_g));
  }
  if (lot.blended_from) {
    for (const src of lot.blended_from) {
      await addOutput(src.reference, Number(src.mass_g));
    }
  }

  // category split: distribute each batch's contributed mass by its own
  // category over the batch node, and propagate totals onto runs and lots.
  const flagged = [...nodes.values()].some((n) => (n.flags || []).length > 0);
  return {
    nodes: [...nodes.values()],
    edges,
    flagged,
  };
}

export async function flagsForBatch(b) {
  const flags = [];
  const dev = b.device ? await one(`select * from devices where reference = $1`, [b.device]) : null;
  if (dev) {
    const months = (new Date(b.received_on) - new Date(dev.calibrated_on)) / (30.44 * 86400000);
    if (months > 12) flags.push("lapsed_calibration");
  }
  const ap = await one(
    `select * from approval_periods where collector = $1 and $2 between valid_from and valid_to`,
    [b.collector, b.received_on]
  );
  if (!ap || (ap.state !== "approved" && ap.state !== "conditional"))
    flags.push("collector_approval_not_in_force");
  const required = ["collection_site", "collector", "transport", "arrival", "weighing", "acceptance"];
  const kinds = new Set((b.custody || []).map((l) => l.kind));
  for (const k of required) if (!kinds.has(k)) flags.push("custody_link_missing:" + k);
  return flags;
}

export async function flagsForLot(lotRef) {
  const flags = [];
  const upstream = await upstreamBatches(lotRef);
  for (const b of upstream) {
    const f = await flagsForBatch(b);
    flags.push(...f);
  }
  const dev = await q(
    `select d.* from deviations d where state = 'open' and affects_lots @> $1`,
    [JSON.stringify([lotRef])]
  );
  for (const d of dev) flags.push("open_deviation:" + d.reference);
  const ovr = await q(`select * from overrides where lot = $1 and reviewed = false`, [lotRef]);
  for (const o of ovr) flags.push("unreviewed_override:" + o.reference);
  return [...new Set(flags)];
}

export async function upstreamBatches(lotRef) {
  const set = new Map();
  const seen = new Set();
  async function walk(ref) {
    if (seen.has(ref)) return;
    seen.add(ref);
    if (ref.startsWith("BATCH-")) {
      const b = await batchByRef(ref);
      if (b) set.set(ref, b);
      return;
    }
    const cons = await q(`select * from consumptions where input_reference = $1`, [ref]);
    for (const c of cons) {
      if (c.run) await walkRunInputs(c.run);
    }
  }
  async function walkRunInputs(runRef) {
    const cons = await q(`select * from consumptions where run = $1`, [runRef]);
    for (const c of cons) {
      if (c.input_type === "batch") {
        const b = await batchByRef(c.input_reference);
        if (b) set.set(c.input_reference, b);
      } else {
        await walk(c.input_reference);
      }
    }
  }
  const out = await one(`select * from outputs where lot = $1`, [lotRef]);
  if (out) await walkRunInputs(out.run);
  const lot = await lotByRef(lotRef);
  if (lot?.blended_from) {
    for (const src of lot.blended_from) await walk(src.reference);
  }
  return [...set.values()];
}

// Reverse traversal from a batch: every lot containing any of it, every
// certificate resting on those lots, and every recipient. It returns the
// complete set and is never paginated.
export async function reverseTraversal(batchRef) {
  const batch = await batchByRef(batchRef);
  if (!batch) return null;

  // Forward reachability: which outputs and lots each batch mass reached.
  // Walk the consumptions graph from the batch forward.
  const lots = new Map();
  const intermediates = new Set();
  const visited = new Set();

  async function forward(ref) {
    if (visited.has(ref)) return;
    visited.add(ref);
    const cons = await q(`select * from consumptions where input_reference = $1`, [ref]);
    for (const c of cons) {
      const outs = await q(`select * from outputs where run = $1`, [c.run]);
      for (const o of outs) {
        if (o.kind === "lot") {
          const lot = await lotByRef(o.lot);
          if (lot) lots.set(lot.reference, lot);
        } else if (o.kind === "intermediate") {
          intermediates.add(o.reference);
          await forward(o.reference);
        }
      }
    }
  }
  await forward(batchRef);

  const certificates = [];
  const recipients = new Map();
  for (const lotRef of [...lots.keys()]) {
    const certs = await q(`select * from certificates where lot = $1`, [lotRef]);
    for (const cert of certs) {
      certificates.push(cert);
      const party = await one(`select * from parties where reference = $1`, [cert.recipient]);
      const name = await partyNameOn(cert.recipient, cert.signed_at);
      recipients.set(cert.recipient, {
        reference: cert.recipient,
        name,
        contact_email: party?.contact_email,
      });
    }
  }

  return {
    batch: {
      reference: batch.reference,
      collector: batch.collector,
      category: batch.category,
      received_on: batch.received_on,
      net_g: Number(batch.net_g),
    },
    lots: [...lots.values()].map((l) => ({
      reference: l.reference,
      grade: l.grade,
      site: l.site,
      mass_g: Number(l.mass_g),
      disposition: l.disposition,
      claim_type: l.claim_type,
    })),
    certificates: certificates.map(certSummary),
    recipients: [...recipients.values()],
    derived: {
      lots_count: lots.size,
      certificates_count: certificates.length,
      recipients_count: recipients.size,
    },
  };
}

export function certSummary(c) {
  return {
    number: c.number,
    version: c.version,
    site: c.site,
    lot: c.lot,
    recipient: c.recipient,
    recipient_name: c.recipient_name,
    state: c.state,
    signed_at: c.signed_at,
    withdrawn_on: c.withdrawn_on,
    withdrawn_reason: c.withdrawn_reason,
  };
}

// A party's name as it stood on a date, with the identifier it held then.
export async function partyNameOn(reference, when) {
  const date = typeof when === "string" ? when.slice(0, 10) : when?.toISOString?.().slice(0, 10);
  const v = await one(
    `select * from party_versions where party = $1 and effective_from <= $2
     order by effective_from desc limit 1`,
    [reference, date]
  );
  if (v) return v.name;
  const p = await one(`select * from parties where reference = $1`, [reference]);
  return p?.current_name || reference;
}

// A nested list carrying the same nodes, masses, category splits and flags.
export function textEquivalent(g) {
  const out = { node: g.nodes.find((n) => n.kind === "lot")?.reference, children: [] };
  const childrenByParent = new Map();
  for (const e of g.edges) {
    if (!childrenByParent.has(e.to)) childrenByParent.set(e.to, []);
    childrenByParent.get(e.to).push(e);
  }
  function build(ref, seen) {
    const node = g.nodes.find((n) => n.reference === ref);
    const incoming = childrenByParent.get(ref) || [];
    return incoming
      .filter((e) => !seen.has(e.from))
      .map((e) => {
        const n = g.nodes.find((x) => x.reference === e.from);
        const s2 = new Set(seen);
        s2.add(e.from);
        return {
          kind: n?.kind,
          reference: e.from,
          mass_g: e.mass_g,
          node_mass_g: n?.mass_g ?? null,
          category_split: n?.category_split || {},
          flags: n?.flags || [],
          children: build(e.from, s2),
        };
      });
  }
  out.children = build(out.node, new Set());
  return out;
}
