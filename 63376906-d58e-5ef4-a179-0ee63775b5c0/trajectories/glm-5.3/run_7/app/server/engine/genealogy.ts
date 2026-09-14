// Genealogy: a graph traversal over consumption records, not a stored summary.
import type { Pool } from 'pg';

export type GNode = {
  kind: string;
  reference: string;
  mass_g: number;
  category_split: Record<string, number>;
  flags: string[];
};

export type GEdge = { from: string; to: string; mass_g: number };

export type Genealogy = {
  lot: string;
  nodes: GNode[];
  edges: GEdge[];
  flagged: boolean;
  text_equivalent: any;
};

type Row = {
  batch: any;
  run: any;
  lot: any;
  input_reference: string;
  input_kind: string;
  mass_g: string | number;
};

// Traverse upstream from a lot over consumptions and outputs.
// A batch reached by several paths appears once with its total mass.
export async function upstreamGraph(db: Pool, lotRef: string): Promise<Genealogy> {
  const nodes = new Map<string, GNode>();
  const edges = new Map<string, GEdge>();

  const addNode = (n: GNode) => {
    const existing = nodes.get(n.reference);
    if (existing) {
      existing.mass_g += n.mass_g;
      for (const f of n.flags) if (!existing.flags.includes(f)) existing.flags.push(f);
      for (const k of Object.keys(n.category_split)) {
        existing.category_split[k] = (existing.category_split[k] || 0) + n.category_split[k];
      }
    } else nodes.set(n.reference, n);
  };
  const addEdge = (from: string, to: string, mass: number) => {
    const key = from + '>' + to;
    const e = edges.get(key);
    if (e) e.mass_g += mass;
    else edges.set(key, { from, to, mass_g: mass });
  };

  const lot = (await db.query('SELECT * FROM lots WHERE reference=$1', [lotRef])).rows[0];
  if (!lot) throw Object.assign(new Error('lot_not_found'), { status: 404 });

  const flagCache = new Map<string, string[]>();
  const flagsForBatch = async (ref: string): Promise<string[]> => {
    if (flagCache.has(ref)) return flagCache.get(ref)!;
    const b = (await db.query('SELECT * FROM batches WHERE reference=$1', [ref])).rows[0];
    const flags: string[] = [];
    if (b) {
      const dev = (await db.query('SELECT calibrated_on, received_on FROM devices d JOIN batches b2 ON b2.device=d.reference WHERE b2.reference=$1', [ref])).rows[0];
      if (dev && dev.calibrated_on) {
        const expiry = new Date(dev.calibrated_on as string);
        expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
        if (expiry.toISOString().slice(0, 10) < (dev.received_on as string)) flags.push('lapsed_calibration');
      }
      const kinds = new Set((b.custody as any[]).map((c: any) => c.kind));
      const required = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
      const missing = required.find((k) => !kinds.has(k));
      if (missing) flags.push('custody_link_missing:' + missing);
      const approval = (await db.query(
        `SELECT 1 FROM approval_periods ap WHERE ap.collector=$1 AND ap.state IN ('approved','conditional')
           AND $2 BETWEEN ap.valid_from AND ap.valid_to LIMIT 1`,
        [b.collector, b.received_on]
      )).rows;
      if (missing || approval.length === 0) flags.push('non_claimable');
    }
    flagCache.set(ref, flags);
    return flags;
  };

  // walk upstream: lot -> output(s) -> run -> consumptions -> inputs
  const walkOutput = async (outputRef: string, massRemaining: number, visited: Map<string, number>): Promise<void> => {
    const out = (await db.query('SELECT * FROM outputs WHERE reference=$1', [outputRef])).rows[0];
    if (!out) return;
    addNode({ kind: out.kind === 'lot' ? 'lot' : out.kind, reference: out.reference, mass_g: massRemaining, category_split: {}, flags: [] });
    await walkRun(out.run, massRemaining, visited);
  };

  const walkRun = async (runRef: string, massRemaining: number, visited: Map<string, number>): Promise<void> => {
    const run = (await db.query('SELECT * FROM runs WHERE reference=$1', [runRef])).rows[0];
    if (!run) return;
    const seen = visited.get(runRef) || 0;
    if (seen > 4) return; // guard against cycles; the plant has four stages
    visited.set(runRef, seen + 1);
    const rows = (await db.query('SELECT * FROM consumptions WHERE run=$1 ORDER BY id', [runRef])).rows;
    const totalIn = rows.reduce((a: number, r: any) => a + Number(r.mass_g), 0);
    if (totalIn === 0) return;
    for (const r of rows) {
      const share = Math.floor((Number(r.mass_g) * massRemaining) / totalIn);
      if (share <= 0 && r.input_kind !== 'batch') continue;
      // A batch node carries the total mass consumed from it by runs in this
      // ancestry, so a batch reached by several paths appears once, summed.
      const nodeMass = r.input_kind === 'batch' ? Number(r.mass_g) : share;
      addEdge(r.input_reference, 'RUN:' + runRef, Number(r.mass_g));
      if (r.input_kind === 'batch') {
        const b = (await db.query('SELECT * FROM batches WHERE reference=$1', [r.input_reference])).rows[0];
        const flags = await flagsForBatch(r.input_reference);
        addNode({ kind: 'batch', reference: r.input_reference, mass_g: nodeMass, category_split: { [b?.category || 'unknown']: nodeMass }, flags });
      } else {
        await walkOutput(r.input_reference, share, visited);
      }
    }
    addNode({ kind: 'run', reference: runRef, mass_g: massRemaining, category_split: {}, flags: [] });
  };

  const lotOutputs = (await db.query("SELECT * FROM outputs WHERE lot=$1", [lotRef])).rows;
  if (lotOutputs.length === 0) {
    // blended lot: descend into its parents
    if (lot.blended_from) {
      for (const parent of lot.blended_from as any[]) await walkOutput(parent.reference, Number(parent.mass_g), new Map());
    } else {
      // pilot lot with no recorded output row
      addNode({ kind: 'lot', reference: lot.reference, mass_g: Number(lot.mass_g), category_split: {}, flags: [] });
    }
  } else {
    addNode({ kind: 'lot', reference: lot.reference, mass_g: Number(lot.mass_g), category_split: {}, flags: [] });
    for (const o of lotOutputs) await walkRun(o.run, Number(o.mass_g), new Map());
  }

  const nodeList = [...nodes.values()];
  const text = buildTextEquivalent(nodeList, [...edges.values()], lotRef);
  return { lot: lotRef, nodes: nodeList, edges: [...edges.values()], flagged: nodeList.some((n) => n.flags.length > 0), text_equivalent: text };
}

function buildTextEquivalent(nodes: GNode[], edges: GEdge[], lotRef: string) {
  // Nested list of the same nodes, same masses, same splits, same flags.
  const byRef = new Map(nodes.map((n) => [n.reference, n]));
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    const list = childrenOf.get(e.to) || [];
    if (!list.includes(e.from)) list.push(e.from);
    childrenOf.set(e.to, list);
  }
  const seen = new Set<string>();
  const render = (ref: string, depth: number): any => {
    const n = byRef.get(ref);
    const kids = (childrenOf.get(ref) || []).map((c) => byRef.get(c)!).filter(Boolean);
    const childEntries: any[] = [];
    for (const k of kids) {
      const key = ref + '>' + k.reference;
      if (seen.has(key)) continue;
      seen.add(key);
      const e = edges.find((x) => x.from === k.reference && x.to === ref);
      childEntries.push({ ...render(k.reference, depth + 1), edge_mass_g: e ? e.mass_g : k.mass_g });
    }
    return {
      kind: n?.kind,
      reference: ref,
      mass_g: n?.mass_g ?? 0,
      category_split: n?.category_split ?? {},
      flags: n?.flags ?? [],
      feeds: childEntries
    };
  };
  return render(lotRef, 0);
}

// Reverse traversal from a batch: every lot containing any of it, every certificate
// resting on those lots, every recipient. Complete set, never paginated.
export async function batchImpact(db: Pool, batchRef: string) {
  const lots = new Map<string, { reference: string; mass_g: number; site: string }>();

  const downstreamOfRun = async (runRef: string, mass: number, depth: number): Promise<void> => {
    if (depth > 6) return;
    const outs = (await db.query('SELECT * FROM outputs WHERE run=$1', [runRef])).rows;
    const outsMass = outs.reduce((a: number, o: any) => a + Number(o.mass_g), 0);
    if (outsMass === 0) return;
    for (const o of outs) {
      const share = Math.floor((Number(o.mass_g) * mass) / outsMass);
      if (share <= 0) continue;
      if (o.kind === 'lot' && o.lot) {
        const site = (await db.query('SELECT site FROM lots WHERE reference=$1', [o.lot])).rows[0]?.site || '';
        const existing = lots.get(o.lot);
        if (existing) existing.mass_g += share;
        else lots.set(o.lot, { reference: o.lot, mass_g: share, site });
      } else if (o.kind === 'intermediate') {
        const cons = (await db.query('SELECT * FROM consumptions WHERE input_reference=$1', [o.reference])).rows;
        for (const c of cons) await downstreamOfRun(c.run, share, depth + 1);
      }
    }
  };

  const cons = (await db.query('SELECT * FROM consumptions WHERE batch=$1', [batchRef])).rows;
  for (const c of cons) await downstreamOfRun(c.run, Number(c.mass_g), 0);

  const lotRefs = [...lots.keys()];
  const certs = lotRefs.length
    ? (await db.query('SELECT * FROM certificates ORDER BY number')).rows.filter((c: any) =>
        (c.lots as any[]).some((l) => lotRefs.includes(l.reference))
      )
    : [];
  const recipients = [...new Set(certs.map((c: any) => c.recipient))];
  const names = await partyNames(db, recipients);
  return {
    batch: batchRef,
    lots: [...lots.values()],
    certificates: certs.map((c: any) => ({ number: c.number, version: c.version, state: c.state, site: c.site, recipient: c.recipient, claim_type: c.claim_type, content_bp: Number(c.content_bp) })),
    recipients: recipients.map((r) => ({ reference: r, name: names[r] || r }))
  };
}

export async function partyNames(db: Pool, refs: string[], on?: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const ref of refs) {
    const r = await db.query(
      'SELECT name FROM party_versions WHERE party=$1 AND effective_from <= COALESCE($2::date, CURRENT_DATE) ORDER BY effective_from DESC LIMIT 1',
      [ref, on || null]
    );
    if (r.rows[0]) out[ref] = r.rows[0].name;
  }
  return out;
}
