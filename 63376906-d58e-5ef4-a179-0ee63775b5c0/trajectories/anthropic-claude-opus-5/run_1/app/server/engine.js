// The arithmetic layer. It reads the operational record and the versioned
// definitions, and nothing else. It writes to neither. Every answer carries its
// derivation and the versions it was computed against.
import { query, one } from './db.js';
import { dryMass, creditGranted, contentBp, shareBp, floorDiv } from './lib/num.js';
import { dateOnly } from './lib/http.js';

const CUSTODY_KINDS = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
const CALIBRATION_MONTHS = 12;

export function monthsBetween(from, to) {
  const a = new Date(from + 'T00:00:00Z');
  const b = new Date(to + 'T00:00:00Z');
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
    + (b.getUTCDate() >= a.getUTCDate() ? 0 : -1);
}

export function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---- Parties: the names they had at the time -------------------------------

export async function partyNameOn(reference, onDate) {
  const rows = await query(
    `SELECT name, effective_from FROM party_version
      WHERE reference = $1 AND effective_from <= $2
      ORDER BY effective_from DESC, id DESC LIMIT 1`,
    [reference, onDate]
  );
  if (rows[0]) return rows[0].name;
  const any = await query(
    'SELECT name FROM party_version WHERE reference = $1 ORDER BY effective_from ASC LIMIT 1',
    [reference]
  );
  if (any[0]) return any[0].name;
  const col = await one('SELECT name FROM collector WHERE reference = $1', [reference]);
  if (col) return col.name;
  const cus = await one('SELECT name FROM customer WHERE reference = $1', [reference]);
  return cus ? cus.name : reference;
}

// ---- Collectors: the approval in force on a date, never a current flag ------

export async function approvalInForce(collector, onDate) {
  const rows = await query(
    `SELECT * FROM approval_period
      WHERE collector = $1 AND valid_from <= $2 AND valid_to >= $2
      ORDER BY valid_from DESC LIMIT 1`,
    [collector, onDate]
  );
  return rows[0] || null;
}

export async function lastApprovalBefore(collector, onDate) {
  const rows = await query(
    `SELECT * FROM approval_period WHERE collector = $1 AND valid_to < $2
      ORDER BY valid_to DESC LIMIT 1`,
    [collector, onDate]
  );
  return rows[0] || null;
}

export function approvalExpiring(period, asOf) {
  if (!period) return false;
  const to = dateOnly(period.valid_to);
  return to >= asOf && to <= addDays(asOf, 14);
}

// ---- Feedstock -------------------------------------------------------------

export async function resolveBatch(row) {
  if (!row) return null;
  const receivedOn = dateOnly(row.received_on);
  const custody = await query(
    'SELECT kind, link_date, party, ordinal, arrived_on, late FROM custody_link WHERE batch = $1 ORDER BY ordinal',
    [row.reference]
  );
  const present = new Set(custody.map((l) => l.kind));
  const missing = CUSTODY_KINDS.filter((k) => !present.has(k));
  const custodyComplete = missing.length === 0;

  const approval = await approvalInForce(row.collector, receivedOn);
  const approvalOk = approval && ['approved', 'conditional'].includes(approval.state);

  let claimable = true;
  let claimableReason = null;
  let missingLink = null;
  if (!approvalOk) {
    claimable = false;
    claimableReason = 'collector_approval_lapsed';
  } else if (!custodyComplete) {
    claimable = false;
    claimableReason = 'custody_link_missing';
    missingLink = missing[0];
  }

  // A late custody document makes the batch claimable from the date it arrived.
  let claimableFrom = null;
  if (custodyComplete && approvalOk) {
    const late = custody.filter((l) => l.late && l.arrived_on).map((l) => dateOnly(l.arrived_on)).sort();
    claimableFrom = late.length ? late[late.length - 1] : receivedOn;
  }

  const flags = [];
  if (row.device) {
    const device = await one('SELECT * FROM weighing_device WHERE reference = $1', [row.device]);
    if (device && monthsBetween(dateOnly(device.calibrated_on), receivedOn) >= CALIBRATION_MONTHS) {
      flags.push('lapsed_calibration');
    }
  }
  if (!custodyComplete) flags.push('custody_link_missing');
  if (!approvalOk) flags.push('collector_approval_lapsed');

  const composition = row.composition || {};
  const lapsedOn = !approvalOk && approval === null
    ? dateOnly((await lastApprovalBefore(row.collector, receivedOn))?.valid_to)
    : null;

  const deliveredG = Number(row.net_g);
  const rejectedG = Number(row.rejected_g || 0);
  const acceptedG = row.accepted_g === null || row.accepted_g === undefined
    ? deliveredG - rejectedG : Number(row.accepted_g);

  return {
    reference: row.reference,
    collector: row.collector,
    collector_name: await partyNameOn(row.collector, receivedOn),
    site: row.site,
    grade: row.grade,
    category: row.category,
    gross_g: Number(row.gross_g),
    tare_g: Number(row.tare_g),
    net_g: deliveredG,
    delivered_g: deliveredG,
    accepted_g: acceptedG,
    rejected_g: rejectedG,
    rejected_reason: row.rejected_reason,
    rejected_destination: row.rejected_destination,
    moisture_bp: Number(row.moisture_bp),
    moisture_method: row.moisture_method,
    device: row.device,
    received_on: receivedOn,
    dry_mass_g: dryMass(deliveredG, row.moisture_bp),
    dry_mass_derivation: {
      rule: 'net_g * (10000 - moisture_bp) / 10000, floored',
      net_g: deliveredG,
      moisture_bp: Number(row.moisture_bp),
    },
    claimable,
    claimable_reason: claimableReason,
    claimable_from: claimableFrom,
    missing_custody_kind: missingLink,
    approval_state_on_receipt: approval ? approval.state : 'none',
    approval_lapsed_on: lapsedOn,
    custody_complete: custodyComplete,
    custody: custody.map((l) => ({
      kind: l.kind,
      date: dateOnly(l.link_date),
      party: l.party,
      arrived_on: dateOnly(l.arrived_on),
      late: l.late,
    })),
    missing_custody_kinds: missing,
    flags,
    composition,
    contamination: row.contamination || {},
    event_at: row.event_at,
    recorded_at: row.recorded_at,
    effective_on: dateOnly(row.effective_on),
  };
}

export async function batchByReference(reference) {
  const row = await one('SELECT * FROM batch WHERE reference = $1', [reference]);
  return resolveBatch(row);
}

export async function allBatches() {
  const rows = await query('SELECT * FROM batch ORDER BY received_on, reference');
  return Promise.all(rows.map(resolveBatch));
}

// ---- Genealogy: a traversal over the consumption records --------------------

async function productionIndex() {
  const outputs = await query('SELECT * FROM output');
  const byRef = new Map();
  for (const o of outputs) byRef.set(o.reference, o);
  return byRef;
}

// Walks backwards from a lot to the batches, over consumption rows.
export async function genealogy(lotReference) {
  const lot = await one('SELECT * FROM lot WHERE reference = $1', [lotReference]);
  if (!lot) return null;
  const outputs = await productionIndex();
  const consumptions = await query('SELECT * FROM consumption');
  const byRun = new Map();
  for (const con of consumptions) {
    if (!byRun.has(con.run)) byRun.set(con.run, []);
    byRun.get(con.run).push(con);
  }
  const runs = new Map((await query('SELECT * FROM run')).map((r) => [r.reference, r]));
  const batches = await allBatches();
  const batchByRef = new Map(batches.map((b) => [b.reference, b]));

  const nodes = new Map();
  const edges = [];
  const edgeSeen = new Set();

  function addNode(kind, reference, mass, extra = {}) {
    if (!nodes.has(reference)) {
      nodes.set(reference, { kind, reference, mass_g: 0, category_split: {}, flags: [], ...extra });
    }
    const n = nodes.get(reference);
    if (kind === 'batch') {
      // A batch reached by several paths appears once with its total mass.
      n.mass_g += Number(mass);
      n.category_split = { [batchByRef.get(reference).category]: n.mass_g };
    } else if (!n.mass_g) {
      n.mass_g = Number(mass);
    }
    return n;
  }

  function addEdge(from, to, mass) {
    const key = `${from}->${to}`;
    if (edgeSeen.has(key)) {
      const e = edges.find((x) => x.from === from && x.to === to);
      e.mass_g += Number(mass);
      return;
    }
    edgeSeen.add(key);
    edges.push({ from, to, mass_g: Number(mass) });
  }

  const lotOutput = await one("SELECT * FROM output WHERE reference = $1 AND kind = 'lot'", [lotReference]);
  addNode('lot', lot.reference, Number(lot.mass_g), {
    grade: lot.grade, site: lot.site, disposition: lot.disposition, claim_type: lot.claim_type,
  });

  const walk = (outputRef, targetRef, visited) => {
    const out = outputs.get(outputRef);
    if (!out) return;
    const producing = out.run;
    const inputs = byRun.get(producing) || [];
    for (const con of inputs) {
      if (con.input_kind === 'batch') {
        const b = batchByRef.get(con.input_ref);
        if (!b) continue;
        const node = addNode('batch', con.input_ref, con.mass_g, {
          collector: b.collector, collector_name: b.collector_name, category: b.category,
          claimable: b.claimable, claimable_reason: b.claimable_reason, received_on: b.received_on,
        });
        node.flags = Array.from(new Set([...node.flags, ...b.flags]));
        addEdge(con.input_ref, targetRef, con.mass_g);
      } else {
        const upstream = outputs.get(con.input_ref);
        if (!upstream) continue;
        const run = runs.get(upstream.run);
        addNode('intermediate', con.input_ref, Number(upstream.mass_g), {
          produced_by: upstream.run, run_type: run ? run.run_type : null, site: run ? run.site : null,
        });
        addEdge(con.input_ref, targetRef, con.mass_g);
        const key = con.input_ref;
        if (!visited.has(key)) {
          visited.add(key);
          walk(con.input_ref, con.input_ref, visited);
        }
      }
    }
  };

  walk(lotOutput ? lotOutput.reference : lotReference, lot.reference, new Set());

  const nodeList = Array.from(nodes.values());
  // A flag anywhere in the graph is visible from the lot without expanding anything.
  const flagged = nodeList.some((n) => n.flags && n.flags.length > 0);

  return {
    lot: lot.reference,
    nodes: nodeList,
    edges,
    flagged,
    flags: Array.from(new Set(nodeList.flatMap((n) => n.flags || []))),
    text_equivalent: nestedList(lot.reference, nodeList, edges),
    read_at: new Date().toISOString(),
  };
}

// The same facts as a nested list: the same nodes, masses, splits and flags.
function nestedList(rootRef, nodeList, edges) {
  const byRef = new Map(nodeList.map((n) => [n.reference, n]));
  const build = (ref, seen) => {
    const node = byRef.get(ref);
    if (!node) return null;
    const inbound = edges.filter((e) => e.to === ref);
    const children = [];
    for (const e of inbound) {
      if (seen.has(e.from)) {
        children.push({ ...byRef.get(e.from), edge_mass_g: e.mass_g, children: [], repeated_path: true });
        continue;
      }
      const next = new Set(seen);
      next.add(e.from);
      const child = build(e.from, next);
      if (child) children.push({ ...child, edge_mass_g: e.mass_g });
    }
    return {
      kind: node.kind,
      reference: node.reference,
      mass_g: node.mass_g,
      category_split: node.category_split,
      flags: node.flags,
      children,
    };
  };
  return build(rootRef, new Set([rootRef]));
}

// The same traversal, backwards from a batch. A complete set, never paginated.
export async function batchImpact(batchReference) {
  const batch = await batchByReference(batchReference);
  if (!batch) return null;
  const lots = await query('SELECT * FROM lot ORDER BY reference');
  const containing = [];
  for (const lot of lots) {
    const g = await genealogy(lot.reference);
    if (!g) continue;
    const node = g.nodes.find((n) => n.kind === 'batch' && n.reference === batchReference);
    if (node) containing.push({ lot: lot.reference, site: lot.site, grade: lot.grade, mass_g: node.mass_g, lot_mass_g: Number(lot.mass_g) });
  }
  const lotRefs = containing.map((l) => l.lot);
  const certs = lotRefs.length
    ? await query(
        `SELECT number, version, site, recipient, recipient_name, state, issued_on, lots
           FROM certificate ORDER BY number, version`
      )
    : [];
  const resting = certs.filter((c) => (c.lots || []).some((l) => lotRefs.includes(l.reference || l)));
  const recipients = [];
  const seen = new Set();
  for (const c of resting) {
    if (seen.has(c.recipient)) continue;
    seen.add(c.recipient);
    recipients.push({ reference: c.recipient, name: c.recipient_name });
  }
  return {
    batch: batchReference,
    direction: 'forward_from_batch',
    lots: containing,
    certificates: resting.map((c) => ({
      number: c.number, version: c.version, site: c.site, state: c.state,
      issued_on: dateOnly(c.issued_on), recipient: c.recipient, recipient_name: c.recipient_name,
    })),
    recipients,
    complete: true,
    read_at: new Date().toISOString(),
  };
}

// ---- Runs ------------------------------------------------------------------

export async function resolveRun(row) {
  if (!row) return null;
  const cons = await query('SELECT * FROM consumption WHERE run = $1 ORDER BY reference', [row.reference]);
  const outs = await query('SELECT * FROM output WHERE run = $1 ORDER BY reference', [row.reference]);
  const recipe = await one('SELECT * FROM recipe_version WHERE reference = $1', [row.recipe_version]);
  const massIn = cons.reduce((a, c) => a + Number(c.mass_g), 0);
  const massOut = outs.reduce((a, o) => a + Number(o.mass_g), 0);
  const actual = row.actual_set_points || {};
  let withinTolerance = true;
  const toleranceDetail = [];
  if (recipe) {
    for (const [k, band] of Object.entries(recipe.tolerances || {})) {
      const v = actual[k];
      if (v === undefined || v === null) continue;
      const ok = Number(v) >= Number(band.min) && Number(v) <= Number(band.max);
      if (!ok) withinTolerance = false;
      toleranceDetail.push({ parameter: k, actual: Number(v), min: Number(band.min), max: Number(band.max), within: ok });
    }
  }
  const flags = [];
  for (const c of cons) {
    if (c.input_kind === 'batch') {
      const b = await batchByReference(c.input_ref);
      if (b) for (const f of b.flags) if (!flags.includes(f)) flags.push(f);
    }
  }
  return {
    reference: row.reference,
    run_type: row.run_type,
    site: row.site,
    equipment: row.equipment,
    recipe_version: row.recipe_version,
    recipe: recipe ? { reference: recipe.reference, set_points: recipe.set_points, tolerances: recipe.tolerances, reagents: recipe.reagents, residence_min: recipe.residence_min, released_by: recipe.released_by } : null,
    operator: row.operator,
    started_at: row.started_at,
    closed_at: row.closed_at,
    state: row.state,
    queued: row.queued,
    mass_in_g: massIn,
    mass_out_g: massOut,
    losses_g: row.losses_g === null ? null : Number(row.losses_g),
    losses_derivation: { rule: 'mass in minus mass out', mass_in_g: massIn, mass_out_g: massOut },
    actual_set_points: actual,
    within_tolerance: withinTolerance,
    tolerance_detail: toleranceDetail,
    consumptions: cons.map((c) => ({
      reference: c.reference, input_kind: c.input_kind, input_ref: c.input_ref, mass_g: Number(c.mass_g),
      event_at: c.event_at, recorded_at: c.recorded_at, effective_on: dateOnly(c.effective_on),
    })),
    outputs: outs.map((o) => ({
      reference: o.reference, kind: o.kind, mass_g: Number(o.mass_g), disposition: o.disposition,
    })),
    flags,
    event_at: row.event_at,
    effective_on: dateOnly(row.effective_on),
  };
}

export async function runByReference(reference) {
  return resolveRun(await one('SELECT * FROM run WHERE reference = $1', [reference]));
}

// ---- The ledger: a balance is the sum of its movements ---------------------

const CATEGORIES = ['post_consumer', 'pre_consumer'];

export async function balanceFigures(periodId, client = null) {
  const runner = client
    ? (text, params) => client.query(text, params).then((r) => r.rows)
    : query;
  const moves = await runner(
    'SELECT * FROM credit_movement WHERE period = $1 ORDER BY recorded_at, reference',
    [periodId]
  );
  const out = {};
  for (const cat of CATEGORIES) {
    const ins = moves.filter((m) => m.category === cat && m.direction === 'in' && m.fresh_credit);
    const inbound = moves.filter((m) => m.category === cat && m.direction === 'in' && !m.fresh_credit);
    const outs = moves.filter((m) => m.category === cat && m.direction === 'out');
    const inG = ins.reduce((a, m) => a + Number(m.mass_g), 0);
    const inboundG = inbound.reduce((a, m) => a + Number(m.mass_g), 0);
    const outG = outs.reduce((a, m) => a + Number(m.mass_g), 0);
    out[cat] = {
      credits_in_g: inG,
      credits_out_g: outG,
      credits_available_g: inG - outG,
      inbound_credits_g: inboundG,
      derivation: {
        rule: 'a balance is the sum of its movements and is never held as a total',
        credits_available_rule: 'credits_in_g minus credits_out_g',
        movements_in: ins.map((m) => ({ reference: m.reference, movement: m.movement, mass_g: Number(m.mass_g), batch: m.batch, lot: m.lot, origin_site: m.origin_site, factor_version: m.factor_version })),
        movements_inbound: inbound.map((m) => ({ reference: m.reference, movement: m.movement, mass_g: Number(m.mass_g), origin_site: m.origin_site, fresh_credit: false })),
        movements_out: outs.map((m) => ({ reference: m.reference, movement: m.movement, mass_g: Number(m.mass_g), lot: m.lot })),
      },
    };
  }
  return { figures: out, movements: moves };
}

export async function creditAttachedToLot(lotReference) {
  const rows = await query(
    `SELECT category, SUM(mass_g)::bigint AS mass_g FROM credit_movement
      WHERE lot = $1 AND direction = 'out' AND movement = 'allocation' GROUP BY category`,
    [lotReference]
  );
  const split = { post_consumer: 0, pre_consumer: 0 };
  for (const r of rows) split[r.category] = Number(r.mass_g);
  return split;
}

export async function lotContent(lotReference) {
  const lot = await one('SELECT * FROM lot WHERE reference = $1', [lotReference]);
  if (!lot) return null;
  const split = await creditAttachedToLot(lotReference);
  const attached = split.post_consumer + split.pre_consumer;
  return {
    lot: lot.reference,
    mass_g: Number(lot.mass_g),
    credit_attached_g: attached,
    category_split: split,
    content_bp: contentBp(attached, lot.mass_g),
    claim_type: lot.claim_type,
    derivation: {
      rule: 'credit_attached_g * 10000 / lot_mass_g, floored',
      credit_attached_g: attached,
      lot_mass_g: Number(lot.mass_g),
    },
  };
}

export async function resolveLot(row) {
  if (!row) return null;
  const content = await lotContent(row.reference);
  const devs = await query(
    `SELECT * FROM deviation WHERE lots @> $1::jsonb ORDER BY reference`,
    [JSON.stringify([row.reference])]
  );
  const overrides = await query('SELECT * FROM override WHERE lot = $1 ORDER BY reference', [row.reference]);
  const g = await genealogy(row.reference);
  const flags = g ? g.flags : [];
  const factor = await factorInForce(row.site, dateOnly(row.effective_on));
  return {
    reference: row.reference,
    grade: row.grade,
    site: row.site,
    sites_named: row.sites_named || [row.site],
    mass_g: Number(row.mass_g),
    disposition: row.disposition,
    claim_type: row.claim_type,
    content_bp: content.content_bp,
    category_split: content.category_split,
    credit_attached_g: content.credit_attached_g,
    content_derivation: content.derivation,
    produced_by: row.produced_by,
    period: row.period,
    blended_from: row.blended_from,
    provisional_factor: row.provisional_factor || (factor ? factor.provisional : false),
    flags,
    deviations: devs.map((d) => ({ reference: d.reference, state: d.state, outcome: d.outcome, detail: d.detail })),
    open_deviations: devs.filter((d) => d.state === 'open').map((d) => d.reference),
    overrides: overrides.map((o) => ({
      reference: o.reference, separation: o.separation, reason: o.reason,
      authorised_by: o.authorised_by, reviewed: o.reviewed, reviewed_by: o.reviewed_by,
      recorded_at: o.recorded_at,
    })),
    unreviewed_overrides: overrides.filter((o) => !o.reviewed).map((o) => o.reference),
    dispositioned_by: row.dispositioned_by,
    effective_on: dateOnly(row.effective_on),
  };
}

export async function lotByReference(reference) {
  return resolveLot(await one('SELECT * FROM lot WHERE reference = $1', [reference]));
}

export async function factorInForce(site, onDate) {
  const rows = await query(
    `SELECT * FROM conversion_factor WHERE site = $1 AND published_on <= $2
      ORDER BY published_on DESC, version DESC LIMIT 1`,
    [site, onDate || new Date().toISOString().slice(0, 10)]
  );
  if (rows[0]) return rows[0];
  const any = await query('SELECT * FROM conversion_factor WHERE site = $1 ORDER BY version DESC LIMIT 1', [site]);
  return any[0] || null;
}

export async function periodForLot(lot) {
  if (lot.period) return one('SELECT * FROM balance_period WHERE id = $1', [lot.period]);
  return one(
    `SELECT * FROM balance_period WHERE site = $1 AND grade = $2
       AND period_from <= $3 AND period_to >= $3 LIMIT 1`,
    [lot.site, lot.grade, lot.effective_on || dateOnly(lot.effective_on)]
  );
}

// ---- Yield: for plant, quality and claims, never on a certificate ----------

export async function lotYield(lotReference) {
  const g = await genealogy(lotReference);
  if (!g) return null;
  const lot = await one('SELECT * FROM lot WHERE reference = $1', [lotReference]);
  const inputMass = g.nodes.filter((n) => n.kind === 'batch').reduce((a, n) => a + n.mass_g, 0);
  return {
    lot: lotReference,
    input_mass_g: inputMass,
    lot_mass_g: Number(lot.mass_g),
    yield_bp: shareBp(Number(lot.mass_g), inputMass),
    derivation: { rule: 'lot_mass_g * 10000 / input_mass_g, floored', input_mass_g: inputMass, lot_mass_g: Number(lot.mass_g) },
    note: 'Losses reduce the claim.',
  };
}

// ---- Byproducts ------------------------------------------------------------

export async function byproductShare(outputReference) {
  const out = await one('SELECT * FROM output WHERE reference = $1', [outputReference]);
  if (!out || out.kind !== 'byproduct') return null;
  const siblings = await query('SELECT * FROM output WHERE run = $1', [out.run]);
  const total = siblings.reduce((a, o) => a + Number(o.mass_g), 0);
  const share = shareBp(Number(out.mass_g), total);
  const run = await one('SELECT * FROM run WHERE reference = $1', [out.run]);
  const period = await one(
    `SELECT * FROM balance_period WHERE site = $1 AND period_from <= $2 AND period_to >= $2 LIMIT 1`,
    [run.site, dateOnly(run.effective_on)]
  );
  const basis = period ? period.allocation_basis : 'mass';
  // Its share of the input's claim and of the input's emissions.
  const figures = await query('SELECT * FROM carbon_figure WHERE superseded_by IS NULL');
  const emissionsBase = figures[0] ? Number(figures[0].value_mg_per_kg) : 0;
  const inputCredit = await runInputCredit(out.run);
  return {
    output: out.reference,
    run: out.run,
    kind: out.kind,
    disposition: out.disposition,
    mass_g: Number(out.mass_g),
    total_output_mass_g: total,
    share_bp: share,
    allocation_basis: basis,
    claim_share_g: floorDiv(inputCredit * share, 10000),
    emissions_share_mg: floorDiv(emissionsBase * share, 10000),
    derivation: {
      rule: 'byproduct_mass_g * 10000 / total_output_mass_g, floored',
      byproduct_mass_g: Number(out.mass_g),
      total_output_mass_g: total,
    },
  };
}

async function runInputCredit(runReference) {
  const cons = await query('SELECT * FROM consumption WHERE run = $1', [runReference]);
  let total = 0;
  for (const c of cons) {
    if (c.input_kind === 'batch') {
      const b = await batchByReference(c.input_ref);
      if (b && b.claimable) {
        const factor = await factorInForce(b.site, b.received_on);
        total += creditGranted(dryMass(c.mass_g, b.moisture_bp), factor ? factor.factor_bp : 0);
      }
    }
  }
  return total;
}

// ---- Carbon ----------------------------------------------------------------

export async function carbonForLot(lotReference) {
  const fig = await one(
    'SELECT * FROM carbon_figure WHERE lot = $1 AND superseded_by IS NULL ORDER BY version DESC LIMIT 1',
    [lotReference]
  );
  if (!fig) return null;
  const method = await one(
    'SELECT * FROM carbon_method WHERE id = $1 AND version = $2',
    [fig.method_id, fig.method_version]
  );
  const lot = await one('SELECT * FROM lot WHERE reference = $1', [lotReference]);
  const period = lot ? await periodForLot({ ...lot, effective_on: dateOnly(lot.effective_on) }) : null;

  // The allocation basis is held once per period and applies to both.
  if (period && method && period.allocation_basis !== method.allocation_basis) {
    const err = new Error('allocation_basis_mismatch');
    err.status = 409;
    err.body = {
      error: 'allocation_basis_mismatch',
      detail: `The period holds allocation basis ${period.allocation_basis} and the carbon method holds ${method.allocation_basis}.`,
      period_allocation_basis: period.allocation_basis,
      method_allocation_basis: method.allocation_basis,
    };
    throw err;
  }

  const breakdown = fig.breakdown || [];
  const threshold = method ? method.primary_threshold_bp : 5000;
  const energy = fig.energy || {};
  const instruments = await query('SELECT * FROM energy_instrument WHERE applied_to = $1', [period ? period.id : null]);
  const retired = instruments.reduce((a, i) => a + Number(i.quantity_kwh), 0);
  const metered = Number(energy.metered_kwh || 0);

  return {
    lot: lotReference,
    value_mg_per_kg: Number(fig.value_mg_per_kg),
    boundary: fig.boundary,
    method_version: `${fig.method_id} v${fig.method_version}`,
    method_id: fig.method_id,
    method_version_number: fig.method_version,
    uncertainty_bp: Number(fig.uncertainty_bp),
    primary_share_bp: Number(fig.primary_share_bp),
    primary_threshold_bp: threshold,
    default_led: Number(fig.primary_share_bp) < threshold,
    comparator: fig.comparator,
    comparator_relation:
      fig.comparator && Number(fig.comparator.value_mg_per_kg)
        ? (Number(fig.value_mg_per_kg) < Number(fig.comparator.value_mg_per_kg) ? 'lower_than_comparator' : 'not_lower_than_comparator')
        : null,
    breakdown,
    breakdown_sum_mg_per_kg: breakdown.reduce((a, l) => a + Number(l.mg_per_kg), 0),
    allocation_basis: method ? method.allocation_basis : null,
    energy_location_mg_per_kg: Number(energy.energy_location_mg_per_kg || 0),
    energy_market_mg_per_kg: Number(energy.energy_market_mg_per_kg || 0),
    metered_kwh: metered,
    retired_kwh: retired,
    unmatched_kwh: metered - retired,
    retired_instruments: instruments.map((i) => ({
      reference: i.reference, quantity_kwh: Number(i.quantity_kwh), vintage: i.vintage, region: i.region, state: i.state,
    })),
    figure_id: fig.id,
    figure_version: fig.version,
    cache_valid: fig.cache_valid,
    input_versions: fig.input_versions,
    computed_at: fig.computed_at,
  };
}

// ---- Certificates: the eight conditions ------------------------------------

export const CONDITION_NAMES = [
  'lot_released',
  'no_open_deviation',
  'no_unreviewed_override',
  'period_closed',
  'balance_invariant_holds',
  'carbon_figure_complete',
  'signer_holds_scope',
  'signer_did_not_enter_data',
];

export async function evaluateConditions({ lotReference, signerEmail, signingDate }) {
  const lot = await lotByReference(lotReference);
  const conditions = [];
  if (!lot) {
    return CONDITION_NAMES.map((condition) => ({
      condition, satisfied: false, blocking_reference: lotReference,
      detail: 'No such lot.',
    }));
  }
  const onDate = signingDate || new Date().toISOString().slice(0, 10);

  conditions.push({
    condition: 'lot_released',
    satisfied: lot.disposition === 'released',
    blocking_reference: lot.disposition === 'released' ? null : lot.reference,
    detail: lot.disposition === 'released'
      ? 'The lot is released.'
      : `The lot disposition is ${lot.disposition}.`,
  });

  const openDev = lot.open_deviations[0] || null;
  conditions.push({
    condition: 'no_open_deviation',
    satisfied: !openDev,
    blocking_reference: openDev,
    detail: openDev ? `Deviation ${openDev} touching this lot is open.` : 'No deviation touching the lot is open.',
  });

  const unreviewed = lot.unreviewed_overrides[0] || null;
  conditions.push({
    condition: 'no_unreviewed_override',
    satisfied: !unreviewed,
    blocking_reference: unreviewed,
    detail: unreviewed
      ? `Override ${unreviewed} on this lot is unreviewed. A second person must review it.`
      : 'No override on the lot is unreviewed.',
  });

  const lotRow = await one('SELECT * FROM lot WHERE reference = $1', [lotReference]);
  const period = await periodForLot({ ...lotRow, effective_on: dateOnly(lotRow.effective_on) });
  conditions.push({
    condition: 'period_closed',
    satisfied: !!period && period.state === 'closed',
    blocking_reference: period ? period.id : null,
    detail: period
      ? (period.state === 'closed' ? `Period ${period.id} is closed.` : `Period ${period.id} is open.`)
      : 'No bookkeeping period covers this lot.',
  });

  // Credits attached never exceed credits available, with this lot's allocation applied.
  let invariantHolds = false;
  let invariantDetail = 'No bookkeeping period covers this lot.';
  if (period) {
    const { figures } = await balanceFigures(period.id);
    invariantHolds = CATEGORIES.every((c) => figures[c].credits_available_g >= 0);
    invariantDetail = invariantHolds
      ? `Attached credit ${lot.credit_attached_g} g. The ledger holds ${figures.post_consumer.credits_available_g} g post-consumer and ${figures.pre_consumer.credits_available_g} g pre-consumer still available.`
      : 'The ledger does not reconcile: attached credit exceeds available credit.';
  }
  conditions.push({
    condition: 'balance_invariant_holds',
    satisfied: invariantHolds,
    blocking_reference: invariantHolds ? null : (period ? period.id : null),
    detail: invariantDetail,
  });

  let carbon = null;
  let carbonComplete = false;
  let carbonDetail = 'No carbon figure exists for this lot.';
  try {
    carbon = await carbonForLot(lotReference);
    carbonComplete = !!carbon
      && carbon.value_mg_per_kg !== undefined
      && !!carbon.boundary && !!carbon.method_version
      && carbon.uncertainty_bp !== undefined && carbon.uncertainty_bp !== null;
    if (carbonComplete) {
      carbonDetail = `${carbon.value_mg_per_kg} mg/kg, boundary ${carbon.boundary}, method ${carbon.method_version}, uncertainty ${carbon.uncertainty_bp} bp.`;
    }
  } catch (e) {
    carbonDetail = e.body ? e.body.detail : 'The carbon figure could not be resolved.';
  }
  conditions.push({
    condition: 'carbon_figure_complete',
    satisfied: carbonComplete,
    blocking_reference: carbonComplete ? null : lotReference,
    detail: carbonDetail,
  });

  const account = signerEmail ? await one('SELECT * FROM account WHERE email = $1', [signerEmail]) : null;
  const sites = account ? account.sites : [];
  const inScope = !!account && sites.includes(lot.site);
  const grantOk = !!account && dateOnly(account.grant_ends_on) >= onDate;
  const certPeriod = await one(
    `SELECT * FROM certification_period WHERE site = $1 AND effective_from <= $2
       AND (effective_to IS NULL OR effective_to >= $2) ORDER BY effective_from DESC LIMIT 1`,
    [lot.site, onDate]
  );
  const siteCertified = !certPeriod || certPeriod.state !== 'suspended';
  conditions.push({
    condition: 'signer_holds_scope',
    satisfied: inScope && grantOk && siteCertified,
    blocking_reference: inScope && grantOk && siteCertified ? null : lot.site,
    detail: !inScope
      ? `The signer holds no signing scope for ${lot.site}.`
      : !grantOk
      ? `The signer's grant ended on ${dateOnly(account.grant_ends_on)}.`
      : !siteCertified
      ? `The certification for ${lot.site} is suspended from ${dateOnly(certPeriod.effective_from)}.`
      : `The signer holds signing scope for ${lot.site} on ${onDate}.`,
  });

  const entered = signerEmail
    ? await query(
        `SELECT reference FROM test_result WHERE subject_ref = $1 AND entered_by = $2`,
        [lotReference, signerEmail]
      )
    : [];
  const enteredRun = signerEmail && lotRow.produced_by
    ? await query('SELECT reference FROM run WHERE reference = $1 AND recorded_by = $2', [lotRow.produced_by, signerEmail])
    : [];
  const didEnter = entered.length > 0 || enteredRun.length > 0;
  conditions.push({
    condition: 'signer_did_not_enter_data',
    satisfied: !didEnter,
    blocking_reference: didEnter ? (entered[0] ? entered[0].reference : enteredRun[0].reference) : null,
    detail: didEnter
      ? 'The signer entered data on this lot and may not sign against it.'
      : 'The signer entered none of this lot\'s data.',
  });

  return conditions;
}

// ---- Statements, generated from the claim type -----------------------------

const STATEMENTS = {
  en: {
    mass_balance: {
      permitted: (content, split) =>
        `This material is claimed by mass balance at ${bpWords(content)} recycled content (post-consumer ${bpWords(split.post_consumer_bp)}, pre-consumer ${bpWords(split.pre_consumer_bp)}). It is not physically segregated.`,
      prohibited: () =>
        'You may not state that this material physically contains recycled content.',
    },
    controlled_blending: {
      permitted: (content) =>
        `This material is claimed by controlled blending at ${bpWords(content)} recycled content.`,
      prohibited: () =>
        'You may not state that this material is physically segregated recycled material.',
    },
    physically_segregated: {
      permitted: (content) =>
        `This material is physically segregated recycled material at ${bpWords(content)} recycled content.`,
      prohibited: () =>
        'You may not describe this material as certified beyond the scope stated on this certificate.',
    },
  },
  fr: {
    mass_balance: {
      permitted: (content, split) =>
        `Cette matière fait l'objet d'une revendication par bilan massique à ${bpWords(content)} de contenu recyclé (post-consommation ${bpWords(split.post_consumer_bp)}, pré-consommation ${bpWords(split.pre_consumer_bp)}). Elle n'est pas physiquement ségréguée.`,
      prohibited: () =>
        'Vous ne pouvez pas déclarer que cette matière contient physiquement du contenu recyclé.',
    },
    controlled_blending: {
      permitted: (content) => `Cette matière fait l'objet d'une revendication par mélange contrôlé à ${bpWords(content)} de contenu recyclé.`,
      prohibited: () => "Vous ne pouvez pas déclarer que cette matière est physiquement ségréguée.",
    },
    physically_segregated: {
      permitted: (content) => `Cette matière est une matière recyclée physiquement ségréguée à ${bpWords(content)} de contenu recyclé.`,
      prohibited: () => "Vous ne pouvez pas décrire cette matière au-delà du périmètre indiqué sur ce certificat.",
    },
  },
};

export function bpWords(bp) {
  const whole = Math.floor(Number(bp) / 100);
  const frac = Number(bp) % 100;
  return frac === 0 ? `${whole} per cent` : `${whole}.${String(frac).padStart(2, '0')} per cent`;
}

export function statementsFor(claimType, contentBpValue, split, language = 'en') {
  const pack = STATEMENTS[language] || STATEMENTS.en;
  const entry = pack[claimType] || pack.mass_balance;
  return {
    permitted_statement: entry.permitted(contentBpValue, split),
    prohibited_statement: entry.prohibited(contentBpValue, split),
  };
}

export { CATEGORIES, CUSTODY_KINDS };
