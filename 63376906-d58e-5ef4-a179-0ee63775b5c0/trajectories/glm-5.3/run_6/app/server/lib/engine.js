import { dryMass } from './units.js';

const CUSTODY_KINDS = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
const CAL_MS = 365 * 24 * 3600 * 1000;

const isoDay = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));

export async function batchFlags(c, b) {
  const flags = [];
  const kinds = new Set((b.custody || []).map((l) => l.kind));
  const missing = CUSTODY_KINDS.filter((k) => !kinds.has(k));
  const dev = (await c.query(`SELECT * FROM devices WHERE reference=$1`, [b.device])).rows[0];
  if (dev) {
    const cal = new Date(isoDay(dev.calibrated_on) + 'T00:00:00Z').getTime();
    const rec = new Date(isoDay(b.received_on) + 'T00:00:00Z').getTime();
    if (Number.isFinite(cal) && Number.isFinite(rec) && rec - cal > CAL_MS) flags.push('lapsed_calibration');
  }
  return { flags, missing };
}

export const isoDateOnly = isoDay;

export async function approvalInForce(c, collector, onDate) {
  return (await c.query(
    `SELECT * FROM approval_periods WHERE collector=$1 AND $2 BETWEEN valid_from AND valid_to
     ORDER BY valid_from DESC, id DESC LIMIT 1`, [collector, onDate]
  )).rows[0] || null;
}

export async function claimableOf(c, b) {
  if (b.accepted_g === 0 && b.rejected_g > 0) return { claimable: false, reason: 'rejected' };
  const ap = await approvalInForce(c, b.collector, b.received_on);
  if (!ap || ap.state === 'lapsed') {
    const prior = (await c.query(
      `SELECT * FROM approval_periods WHERE collector=$1 AND valid_to < $2 ORDER BY valid_to DESC LIMIT 1`,
      [b.collector, b.received_on]
    )).rows[0] || null;
    return { claimable: false, reason: 'collector_approval_lapsed', lapsed_on: prior ? prior.valid_to : null };
  }
  if (ap.state === 'suspended') return { claimable: false, reason: 'collector_suspended' };
  const { missing } = await batchFlags(c, b);
  if (missing.length) return { claimable: false, reason: 'custody_link_missing', missing };
  if (b.claimable_from) return { claimable: false, reason: 'custody_completed_late', claimable_from: b.claimable_from };
  return { claimable: true, reason: null };
}

export async function batchView(c, b) {
  const cl = await claimableOf(c, b);
  const { flags, missing } = await batchFlags(c, b);
  const ap = await approvalInForce(c, b.collector, b.received_on);
  return {
    reference: b.reference,
    collector: b.collector,
    collector_name: b.collector_name || b.collector,
    site: b.site,
    grade: b.grade,
    category: b.category,
    received_on: b.received_on,
    gross_g: b.gross_g,
    tare_g: b.tare_g,
    net_g: b.net_g,
    moisture_bp: b.moisture_bp,
    moisture_method: b.moisture_method,
    device: b.device,
    composition: b.composition,
    contamination: b.contamination,
    custody: b.custody || [],
    dry_mass_g: dryMass(b.net_g, b.moisture_bp),
    claimable: cl.claimable,
    claimable_reason: cl.reason,
    claimable_from: cl.claimable_from || null,
    flags,
    custody_complete: missing.length === 0,
    custody_missing: missing,
    accepted_g: b.accepted_g,
    rejected_g: b.rejected_g,
    rejected_destination: b.rejected_destination,
    rejection_reason: b.rejection_reason,
    approval_in_force: ap ? { state: ap.state, valid_from: ap.valid_from, valid_to: ap.valid_to } : null,
    delivered_g: b.net_g
  };
}

export async function genealogyFor(c, lotRef) {
  const lot = (await c.query(`SELECT * FROM lots WHERE reference=$1`, [lotRef])).rows[0];
  if (!lot) return null;
  const nodes = new Map();
  const edges = [];
  let flagged = false;

  const ensure = (kind, reference, extra) => {
    let n = nodes.get(reference);
    if (!n) {
      n = { kind, reference, mass_g: 0, category_split: {}, flags: [], ...(extra || {}) };
      nodes.set(reference, n);
    }
    return n;
  };

  const batchNode = async (ref, mass) => {
    const b = (await c.query(`SELECT * FROM batches WHERE reference=$1`, [ref])).rows[0];
    if (!b) return;
    const cl = await claimableOf(c, b);
    const { flags } = await batchFlags(c, b);
    const kinds = new Set((b.custody || []).map((l) => l.kind));
    const missing = CUSTODY_KINDS.filter((k) => !kinds.has(k));
    const nf = [...flags];
    if (missing.length) nf.push('custody_missing_' + missing[0]);
    if (!cl.claimable) {
      if (cl.reason === 'custody_completed_late') nf.push('claimable_from_' + cl.claimable_from);
      else nf.push('non_claimable');
    }
    const key = cl.claimable ? b.category : 'non_claimable';
    const n = ensure('batch', b.reference, {
      category: b.category, claimable: cl.claimable, claimable_reason: cl.reason,
      collector: b.collector, collector_name: b.collector_name || b.collector
    });
    n.mass_g += mass;
    n.category_split = { ...n.category_split, [key]: (n.category_split[key] || 0) + mass };
    n.flags = [...new Set([...(n.flags || []), ...nf])];
    if (n.flags.length) flagged = true;
  };

  // Walk backward from an output: the mass carried is the mass consumed of it.
  const walkFromOutput = async (outputRef, consumedMass) => {
    if (consumedMass <= 0) return;
    const out = (await c.query(`SELECT * FROM outputs WHERE reference=$1`, [outputRef])).rows[0];
    if (!out) return;
    const n = ensure(out.kind, out.reference, {});
    n.mass_g += consumedMass;
    const run = (await c.query(`SELECT * FROM runs WHERE reference=$1`, [out.run])).rows[0];
    if (!run) return;
    ensure('run', run.reference, { run_type: run.run_type, state: run.closed_at ? 'closed' : 'open' });
    edges.push({ from: run.reference, to: out.reference, mass_g: consumedMass });
    const ins = (await c.query(`SELECT * FROM consumptions WHERE run=$1`, [run.reference])).rows;
    for (const ci of ins) {
      edges.push({ from: ci.input_ref, to: run.reference, mass_g: ci.mass_g });
      if (ci.input_kind === 'batch') {
        await batchNode(ci.input_ref, ci.mass_g);
      } else {
        const n2 = ensure('intermediate', ci.input_ref, {});
        n2.mass_g += ci.mass_g;
        await walkFromOutput(ci.input_ref, ci.mass_g);
      }
    }
  };

  const lotNode = ensure('lot', lot.reference, {
    grade: lot.grade, site: lot.site, disposition: lot.disposition, claim_type: lot.claim_type
  });
  lotNode.mass_g = lot.mass_g;
  if ((lot.flags || []).length) { lotNode.flags = [...lot.flags]; flagged = true; }

  if (lot.produced_by) {
    const run = (await c.query(`SELECT * FROM runs WHERE reference=$1`, [lot.produced_by])).rows[0];
    if (run) {
      ensure('run', run.reference, { run_type: run.run_type, state: run.closed_at ? 'closed' : 'open' });
      edges.push({ from: run.reference, to: lot.reference, mass_g: lot.mass_g });
      const ins = (await c.query(`SELECT * FROM consumptions WHERE run=$1`, [run.reference])).rows;
      for (const ci of ins) {
        edges.push({ from: ci.input_ref, to: run.reference, mass_g: ci.mass_g });
        if (ci.input_kind === 'batch') await batchNode(ci.input_ref, ci.mass_g);
        else {
          const n2 = ensure('intermediate', ci.input_ref, {});
          n2.mass_g += ci.mass_g;
          await walkFromOutput(ci.input_ref, ci.mass_g);
        }
      }
    }
  }

  const nodeList = [...nodes.values()].map((n) => ({
    kind: n.kind, reference: n.reference, mass_g: n.mass_g,
    category_split: n.category_split || {}, flags: n.flags || []
  }));
  return { lot: lotRef, nodes: nodeList, edges, flagged, text_equivalent: textTree(nodeList, edges, lotRef) };
}

export function textTree(nodes, edges, rootRef) {
  const byRef = new Map(nodes.map((n) => [n.reference, n]));
  const children = new Map();
  for (const e of edges) {
    if (!children.has(e.from)) children.set(e.from, []);
    children.get(e.from).push(e);
  }
  const expanded = new Set();
  const render = (ref) => {
    const n = byRef.get(ref) || { kind: 'node', reference: ref, mass_g: 0, category_split: {}, flags: [] };
    const item = { kind: n.kind, reference: ref, mass_g: n.mass_g, category_split: n.category_split || {}, flags: n.flags || [], to: [] };
    if (expanded.has(ref)) return item;
    expanded.add(ref);
    const kids = (children.get(ref) || []).slice().sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
    for (const e of kids) item.to.push(render(e.to));
    return item;
  };
  return [render(rootRef)];
}

export async function impactFor(c, batchRef) {
  const batch = (await c.query(`SELECT * FROM batches WHERE reference=$1`, [batchRef])).rows[0];
  if (!batch) return null;
  const reach = new Set();
  const expand = async (ref) => {
    if (reach.has(ref)) return;
    reach.add(ref);
    const cons = (await c.query(`SELECT * FROM consumptions WHERE input_ref=$1`, [ref])).rows;
    for (const cs of cons) {
      const outs = (await c.query(`SELECT * FROM outputs WHERE run=$1`, [cs.run])).rows;
      for (const o of outs) {
        if (o.kind === 'intermediate') await expand(o.reference);
        else reach.add(o.reference);
      }
    }
  };
  await expand(batchRef);
  const lots = [];
  for (const r of reach) {
    const l = (await c.query(`SELECT * FROM lots WHERE reference=$1`, [r])).rows[0];
    if (l) lots.push(l);
  }
  const lotRefs = lots.map((l) => l.reference);
  const certs = lotRefs.length
    ? (await c.query(`SELECT * FROM certificates WHERE lot = ANY($1) ORDER BY number`, [lotRefs])).rows
    : [];
  const recipients = [];
  for (const r of [...new Set(certs.map((x) => x.recipient))]) {
    const p = (await c.query(`SELECT * FROM parties WHERE reference=$1`, [r])).rows[0];
    recipients.push({ reference: r, name: p ? p.current_name : r, contact: p ? p.contact : null });
  }
  const nodes = [{ kind: 'batch', reference: batch.reference, mass_g: batch.net_g, category_split: { [batch.category]: batch.net_g }, flags: [] }];
  const edges = [];
  const runRefs = new Set();
  for (const ref of reach) {
    const cons = (await c.query(`SELECT * FROM consumptions WHERE input_ref=$1`, [ref])).rows;
    for (const cs of cons) runRefs.add(cs.run);
  }
  for (const rr of runRefs) {
    const run = (await c.query(`SELECT * FROM runs WHERE reference=$1`, [rr])).rows[0];
    if (!run) continue;
    nodes.push({ kind: 'run', reference: run.reference, mass_g: 0, category_split: {}, flags: [] });
    const outs = (await c.query(`SELECT * FROM outputs WHERE run=$1`, [rr])).rows;
    for (const o of outs) edges.push({ from: run.reference, to: o.reference, mass_g: 0 });
    const ins = (await c.query(`SELECT * FROM consumptions WHERE run=$1`, [rr])).rows;
    for (const i of ins) edges.push({ from: i.input_ref, to: run.reference, mass_g: 0 });
  }
  for (const r of reach) {
    const o = (await c.query(`SELECT * FROM outputs WHERE reference=$1`, [r])).rows[0];
    if (!o || o.reference === batchRef) continue;
    const l = lots.find((x) => x.reference === o.reference);
    nodes.push({
      kind: l ? 'lot' : o.kind, reference: o.reference, mass_g: o.mass_g,
      category_split: {}, flags: l ? (l.flags || []) : []
    });
  }
  for (const cert of certs) {
    nodes.push({ kind: 'certificate', reference: cert.number, mass_g: cert.lot_mass_g, category_split: cert.category_split, flags: cert.state === 'withdrawn' ? ['withdrawn'] : [] });
    edges.push({ from: cert.lot, to: cert.number, mass_g: cert.lot_mass_g });
  }
  for (const rc of recipients) {
    nodes.push({ kind: 'recipient', reference: rc.reference, mass_g: 0, category_split: {}, flags: [] });
    for (const cert of certs.filter((x) => x.recipient === rc.reference)) edges.push({ from: cert.number, to: rc.reference, mass_g: 0 });
  }
  return {
    batch: batchRef,
    lots: lots.map((l) => ({ reference: l.reference, mass_g: l.mass_g, site: l.site, grade: l.grade, disposition: l.disposition, flags: l.flags || [] })),
    certificates: certs.map((x) => ({
      number: x.number, lot: x.lot, state: x.state, recipient: x.recipient,
      recipient_name: x.recipient_name, content_bp: x.content_bp, claim_type: x.claim_type
    })),
    recipients,
    nodes, edges,
    text_equivalent: [{
      kind: 'batch', reference: batchRef, mass_g: batch.net_g,
      category_split: { [batch.category]: batch.net_g }, flags: [],
      to: lots.map((l) => ({
        kind: 'lot', reference: l.reference, mass_g: l.mass_g, category_split: {}, flags: l.flags || [],
        to: certs.filter((x) => x.lot === l.reference).map((x) => ({
          kind: 'certificate', reference: x.number, mass_g: x.lot_mass_g, category_split: x.category_split,
          flags: x.state === 'withdrawn' ? ['withdrawn'] : [],
          to: recipients.filter((r) => r.reference === x.recipient).map((r) => ({
            kind: 'recipient', reference: r.reference, mass_g: 0, category_split: {}, flags: [], to: []
          }))
        }))
      }))
    }]
  };
}

export async function batchesReachingLot(c, lotRef) {
  const reach = new Set([lotRef]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const ref of [...reach]) {
      const out = (await c.query(`SELECT * FROM outputs WHERE reference=$1`, [ref])).rows[0];
      if (!out) continue;
      const ins = (await c.query(`SELECT * FROM consumptions WHERE run=$1 AND input_kind='intermediate'`, [out.run])).rows;
      for (const i of ins) if (!reach.has(i.input_ref)) { reach.add(i.input_ref); grew = true; }
    }
  }
  const batches = new Set();
  for (const o of reach) {
    const cons = (await c.query(`SELECT * FROM consumptions WHERE input_ref=$1 AND input_kind='batch'`, [o])).rows;
    for (const x of cons) batches.add(x.input_ref);
  }
  return [...batches];
}
