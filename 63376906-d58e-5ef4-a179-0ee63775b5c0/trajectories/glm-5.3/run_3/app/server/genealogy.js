// Traversal over consumption records. A graph, not a tree. Runnable both ways.
import { q, one } from './db.js';
import { batchFlags } from './engine.js';

const BATCH_INFO = new Map();
async function infoOf(ref) {
  if (!BATCH_INFO.has(ref)) {
    const b = await one(`select * from batch where reference = $1`, [ref]);
    BATCH_INFO.set(ref, b ? { flags: await batchFlags(b), category: b.category,
      custodyKinds: new Set((b.custody || []).map((l) => l.kind)), mass_g: b.net_g } : null);
  }
  return BATCH_INFO.get(ref);
}
export function clearCache() { BATCH_INFO.clear(); }

// Forward: from a lot back to the batches. A batch reached by several paths
// appears once, with the total mass it contributed.
export async function genealogyOfLot(lotRef) {
  const lot = await one(`select * from lot where reference = $1`, [lotRef]);
  if (!lot) return null;
  const nodes = new Map();
  const edges = [];
  const edgeSeen = new Set();
  const node = (kind, reference) => {
    const key = `${kind}:${reference}`;
    if (!nodes.has(key)) nodes.set(key, { kind, reference, mass_g: 0, category_split: {}, flags: [] });
    return nodes.get(key);
  };
  const edge = (from, to, mass) => {
    const key = `${from}|${to}`;
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    edges.push({ from, to, mass_g: mass });
  };

  const visited = new Set();
  const stack = [{ kind: 'lot', ref: lotRef }];
  node('lot', lotRef).mass_g = lot.mass_g;
  const batchTotals = new Map();

  while (stack.length) {
    const { kind, ref } = stack.pop();
    const key = `${kind}:${ref}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (kind === 'lot') {
      const prod = await q(`select run_ref, mass_g from output where lot = $1 and kind = 'lot'`, [ref]);
      for (const o of prod) {
        edge('run:' + o.run_ref, 'lot:' + ref, o.mass_g);
        node('run', o.run_ref);
        stack.push({ kind: 'run', ref: o.run_ref });
      }
    } else if (kind === 'run') {
      const cons = await q(`select * from consumption where run_ref = $1`, [ref]);
      for (const c of cons) {
        const fromKey = (c.input_kind === 'batch' ? 'batch:' : 'output:') + c.input_ref;
        edge(fromKey, 'run:' + ref, c.mass_g);
        if (c.input_kind === 'batch') {
          batchTotals.set(c.input_ref, (batchTotals.get(c.input_ref) || 0) + c.mass_g);
          node('batch', c.input_ref);
        } else {
          node('output', c.input_ref);
          stack.push({ kind: 'output', ref: c.input_ref });
        }
      }
    } else if (kind === 'output') {
      const o = await one(`select * from output where reference = $1`, [ref]);
      if (!o) continue;
      node('output', ref).mass_g = o.mass_g;
      stack.push({ kind: 'run', ref: o.run_ref });
    }
  }
  // fill run node masses with mass in, batch nodes with total contributed mass
  for (const n of nodes.values()) {
    if (n.kind === 'run') {
      const cons = await q(`select coalesce(sum(mass_g),0)::int as m from consumption where run_ref = $1`, [n.reference]);
      n.mass_g = cons[0].m;
    }
    if (n.kind === 'batch') {
      const info = await infoOf(n.reference);
      n.mass_g = batchTotals.get(n.reference) || 0;
      n.category_split = info ? { [info.category]: n.mass_g } : {};
      n.flags = info ? [...info.flags] : [];
      const required = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
      if (info && required.some((k) => !info.custodyKinds.has(k))) n.flags = [...new Set([...n.flags, 'custody_link_missing'])];
    }
  }
  const list = [...nodes.values()];
  const flagged = list.some((n) => (n.flags || []).length > 0);
  return { lot: lotRef, nodes: list, edges, flagged, text_equivalent: textOf(list, edges) };
}

function textOf(nodes, edges) {
  const outsTo = {};
  for (const e of edges) (outsTo[e.from] ||= []).push(e);
  const key = (n) => `${n.kind}:${n.reference}`;
  const byKey = new Map(nodes.map((n) => [key(n), n]));
  const built = new Map();
  function build(n) {
    const k = key(n);
    if (built.has(k)) return built.get(k);
    const children = (outsTo[k] || []).map((e) => {
      const child = byKey.get(e.to);
      return child ? { edge_mass_g: e.mass_g, node: build(child) } : null;
    }).filter(Boolean);
    const out = { kind: n.kind, reference: n.reference, mass_g: n.mass_g, category_split: n.category_split || {}, flags: n.flags || [] };
    if (children.length) out.to = children;
    built.set(k, out);
    return out;
  }
  return nodes.filter((n) => n.kind === 'batch').map(build);
}

// Reverse: from a batch to every lot, certificate and recipient that touch it.
export async function impactOfBatch(batchRef) {
  const batch = await one(`select * from batch where reference = $1`, [batchRef]);
  if (!batch) return null;
  const visited = new Set();
  const stack = [batchRef];
  const runsTouching = [];
  const lots = new Map();
  while (stack.length) {
    const ref = stack.pop();
    if (visited.has(ref)) continue;
    visited.add(ref);
    const cons = await q(`select * from consumption where input_kind = 'output' and input_ref = $1`, [ref]);
    for (const c of cons) {
      runsTouching.push(c.run_ref);
      const outs = await q(`select * from output where run_ref = $1`, [c.run_ref]);
      for (const o of outs) {
        if (o.kind === 'lot') lots.set(o.reference, true);
        else stack.push(o.reference);
      }
    }
  }
  const directRuns = await q(`select distinct run_ref from consumption where input_kind = 'batch' and input_ref = $1`, [batchRef]);
  for (const r of directRuns) {
    runsTouching.push(r.run_ref);
    const outs = await q(`select * from output where run_ref = $1`, [r.run_ref]);
    for (const o of outs) {
      if (o.kind === 'lot') lots.set(o.reference, true);
      else stack.push(o.reference);
    }
  }
  // second pass for outputs stacked after their run was recorded
  while (stack.length) {
    const ref = stack.pop();
    if (visited.has(ref)) continue;
    visited.add(ref);
    const cons = await q(`select * from consumption where input_kind = 'output' and input_ref = $1`, [ref]);
    for (const c of cons) {
      runsTouching.push(c.run_ref);
      const outs = await q(`select * from output where run_ref = $1`, [c.run_ref]);
      for (const o of outs) { if (o.kind === 'lot') lots.set(o.reference, true); else stack.push(o.reference); }
    }
  }

  const lotList = [];
  for (const ref of lots.keys()) {
    const l = await one(`select * from lot where reference = $1`, [ref]);
    if (!l) continue;
    const all = await q(`select * from certificate order by signed_at`);
    const certs = all.filter((x) => (x.lots || []).some((lr) => lr.reference === ref));
    lotList.push({ kind: 'lot', reference: ref, mass_g: l.mass_g, disposition: l.disposition, site: l.site, claim_type: l.claim_type,
      certificates: certs.map((c) => ({ number: c.number, version: c.version, state: c.state, recipient: c.recipient,
        recipient_name: c.recipient_name, signed_on: c.signed_on, claim_type: c.claim_type, content_bp: c.content_bp })) });
  }
  const recipients = [...new Map(lotList.flatMap((l) => l.certificates.map((c) => [c.recipient, { reference: c.recipient, name: c.recipient_name }]))).values()];
  const batchInfo = await infoOf(batchRef);
  return {
    batch: batchRef, batch_mass_g: batch?.net_g, lots: lotList, recipients,
    certificates: lotList.flatMap((l) => l.certificates),
    runs: [...new Set(runsTouching)],
    nodes: [{ kind: 'batch', reference: batchRef, mass_g: batch?.net_g, flags: batchInfo ? batchInfo.flags : [], category_split: batchInfo ? { [batchInfo.category]: batch.net_g } : {} }]
      .concat(lotList.map((l) => ({ kind: 'lot', reference: l.reference, mass_g: l.mass_g }))),
    text_equivalent: { batch: batchRef, lots: lotList.map((l) => ({ kind: 'lot', reference: l.reference, mass_g: l.mass_g,
      certificates: l.certificates.map((c) => ({ number: c.number, state: c.state, recipient: c.recipient, recipient_name: c.recipient_name })) })) },
    derivation: { note: 'complete traversal over consumption records; never paginated' },
  };
}
