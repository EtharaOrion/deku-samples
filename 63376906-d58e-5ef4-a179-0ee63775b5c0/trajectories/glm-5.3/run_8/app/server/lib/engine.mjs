import { q, one } from "./db.mjs";
import { dryMass, creditGranted, contentBp, byproductShareBp, blendContent, factorBpFromWindow } from "./core.mjs";
import { batchClaimability, loadGraph, ancestorsOfLot } from "./genealogy.mjs";

/* The arithmetic layer: no surface of its own, no writable input other than the
   operational record and the versioned methods. Every answer carries its derivation. */

export async function periodCredits(periodId) {
  const rows = await q("SELECT * FROM credit_movement WHERE period=$1 ORDER BY event_at, id", [periodId]);
  const out = {
    post_consumer: { credits_in_g: 0, credits_out_g: 0 },
    pre_consumer: { credits_in_g: 0, credits_out_g: 0 },
  };
  const movements = [];
  for (const m of rows) {
    // transfers are movements on their own, reported as inbound_credits, never a fresh credit
    if (m.reason === "transfer_in" || m.reason === "transfer_out") continue;
    const cat = out[m.category] || (out[m.category] = { credits_in_g: 0, credits_out_g: 0 });
    if (m.direction === "in") cat.credits_in_g += Number(m.mass_g);
    else cat.credits_out_g += Number(m.mass_g);
    movements.push({
      reference: m.reference,
      direction: m.direction,
      category: m.category,
      mass_g: Number(m.mass_g),
      reason: m.reason,
      lot: m.lot,
      batch: m.batch,
      origin_site: m.origin_site,
      transfer: m.transfer,
      effective_on: m.effective_on,
      event_at: m.event_at,
      fresh_credit: m.reason !== "transfer_in",
      derivation: m.derivation || null,
    });
  }
  for (const cat of Object.values(out)) cat.credits_available_g = cat.credits_in_g - cat.credits_out_g;
  return { byCategory: out, movements };
}

export async function periodForEffectiveDate(site, grade, effectiveOn) {
  return one(
    "SELECT * FROM balance_period WHERE site=$1 AND grade=$2 AND period_from <= $3 AND period_to >= $3",
    [site, grade, effectiveOn]
  );
}

export async function factorInForce(siteRef, onDate) {
  const rows = await q(
    "SELECT * FROM conversion_factor WHERE site=$1 AND published_on <= $2 ORDER BY published_on DESC, reference DESC LIMIT 1",
    [siteRef, onDate || "9999-12-31"]
  );
  return rows[0] || null;
}

export async function grantCreditsForConsumption(client, { consumption }) {
  if (consumption.input_kind !== "batch") return null;
  const b = await client.query("SELECT * FROM batch WHERE reference=$1", [consumption.input]);
  const batch = b.rows[0];
  if (!batch) return null;
  const period = await periodForEffectiveDate(batch.site, batch.grade, consumption.effective_on);
  if (!period) return null;
  const device = (await client.query("SELECT * FROM weighing_device WHERE reference=$1", [batch.device])).rows[0];
  const cl = await batchClaimability(batch, device);
  if (!cl.claimable) return { granted: 0, claimable: false, reason: cl.reason, period: period.id };
  const factor = await factorInForce(batch.site, consumption.effective_on);
  if (!factor) return { granted: 0, claimable: true, reason: "no_conversion_factor", period: period.id };
  const dry = dryMass(consumption.mass_g, batch.moisture_bp);
  const credit = creditGranted(dry, factor.factor_bp);
  const ref = "CRM-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  await client.query(
    `INSERT INTO credit_movement (reference, period, direction, category, mass_g, reason, batch, consumption, effective_on, event_at, recorded_by, derivation)
     VALUES ($1,$2,'in',$3,$4,'consumption',$5,$6,$7,$8,$9,$10)`,
    [ref, period.id, batch.category, credit, batch.reference, consumption.reference, consumption.effective_on,
      consumption.consumed_at.toISOString(), consumption.recorded_by,
      JSON.stringify({ dry_mass_consumed_g: dry, factor_reference: factor.reference, factor_bp: factor.factor_bp, rule: "floor(dry_mass_consumed_g * factor_bp / 10000)" })]
  );
  return { granted: credit, period: period.id, reference: ref, dry, factor: factor.reference, claimable: true };
}

export async function nonClaimableInput(site, from, to) {
  const rows = await q(
    `SELECT coalesce(sum(c.mass_g),0) AS n FROM consumption c
     JOIN batch b ON b.reference = c.input AND c.input_kind = 'batch'
     JOIN run r ON r.reference = c.run
     WHERE r.site = $1 AND c.effective_on >= $2 AND c.effective_on <= $3
       AND NOT EXISTS (
         SELECT 1 FROM approval_period ap
         WHERE ap.collector = b.collector AND ap.valid_from <= b.received_on AND ap.valid_to >= b.received_on
           AND ap.state IN ('approved','conditional'))
     `, [site, from, to]
  );
  return Number(rows[0].n);
}

export async function periodSummary(periodId) {
  const p = await one("SELECT * FROM balance_period WHERE id=$1", [periodId]);
  if (!p) return null;
  const { byCategory, movements } = await periodCredits(periodId);
  const factors = await q("SELECT * FROM conversion_factor WHERE site=$1 ORDER BY published_on DESC", [p.site]);
  const inForce = await factorInForce(p.site, p.period_to);
  const overrideRows = await q(
    "SELECT o.reference FROM override o JOIN lot l ON l.reference = o.lot WHERE l.site=$1 AND o.authorised_on BETWEEN $2 AND $3",
    [p.site, p.period_from, p.period_to]
  );
  const restatements = await q("SELECT reference FROM restatement WHERE period=$1 AND state='open'", [periodId]);
  const findings = await q("SELECT reference FROM finding WHERE state='open' AND due_on < to_char(now(), 'YYYY-MM-DD')");
  const nonClaimable = await nonClaimableInput(p.site, p.period_from, p.period_to);

  const decorate = (cat, key) => {
    const c = byCategory[key] || { credits_in_g: 0, credits_out_g: 0, credits_available_g: 0 };
    return Object.assign({}, c, {
      derivation: {
        rule: "credits_available_g = credits_in_g - credits_out_g; a balance is the sum of its movements",
        movements: movements.filter((m) => m.category === key).map((m) => m.reference),
      },
    });
  };

  return {
    id: p.id,
    site: p.site,
    grade: p.grade,
    period_from: p.period_from,
    period_to: p.period_to,
    state: p.state,
    carry_over_limit_bp: Number(p.carry_over_limit_bp),
    allocation_basis: p.allocation_basis,
    closed_on: p.closed_on,
    closed_by: p.closed_by,
    cut_off: p.cut_off,
    post_consumer: decorate(byCategory, "post_consumer"),
    pre_consumer: decorate(byCategory, "pre_consumer"),
    conversion_factors: factors.map((f) => ({
      reference: f.reference,
      factor_bp: Number(f.factor_bp),
      provisional: f.provisional,
      derived_from: f.derived_from,
      derived_to: f.derived_to,
      derived_in_g: Number(f.derived_in_g),
      derived_out_g: Number(f.derived_out_g),
      in_force: inForce && inForce.reference === f.reference,
      derivation: {
        rule: "factor_bp = floor(derived_out_g * 10000 / derived_in_g)",
        window: [f.derived_from, f.derived_to],
        published_on: f.published_on,
      },
    })),
    override_count: overrideRows.length,
    open_restatement_count: restatements.length,
    open_finding_count: findings.length,
    non_claimable_input_g: nonClaimable,
    carried_forward_g: p.carried_forward || null,
    expired_g: p.expired || null,
    inbound_credits: movements.filter((m) => m.reason === "transfer_in").map((m) => ({
      reference: m.reference,
      mass_g: m.mass_g,
      origin_site: m.origin_site,
      movement: m.transfer,
      fresh_credit: false,
    })),
    movements,
    read_at: new Date().toISOString(),
  };
}

export async function lotContent(lotRef) {
  const allocs = await q("SELECT * FROM allocation WHERE lot=$1", [lotRef]);
  const lot = await one("SELECT * FROM lot WHERE reference=$1", [lotRef]);
  if (!lot) return null;
  const attached = allocs.reduce((s, a) => s + Number(a.mass_g), 0);
  const bp = contentBp(attached, lot.mass_g);
  const split = { post_consumer: 0, pre_consumer: 0 };
  for (const a of allocs) split[a.category] += Number(a.mass_g);
  const provisional = await lotProvisionalFactor(lotRef);
  return {
    lot: lotRef,
    mass_g: Number(lot.mass_g),
    credit_attached_g: attached,
    content_bp: bp,
    claim_type: lot.claim_type,
    category_split: split,
    provisional_factor: provisional,
    derivation: {
      rule: "content_bp = floor(credit_attached_g * 10000 / lot_mass_g)",
      allocations: allocs.map((a) => a.reference),
    },
  };
}

export async function lotProvisionalFactor(lotRef) {
  const idx = await loadGraph();
  const { batchMass } = ancestorsOfLot(idx, lotRef);
  const factors = await q("SELECT * FROM conversion_factor WHERE provisional = true");
  const provisionalSites = new Set(factors.map((f) => f.site));
  const lot = idx.lotByRef.get(lotRef);
  if (lot && provisionalSites.has(lot.site)) return true;
  for (const ref of batchMass.keys()) {
    const b = idx.batchByRef.get(ref);
    if (b && provisionalSites.has(b.site)) return true;
  }
  return false;
}

export async function runClaim(runRef) {
  // the claim attributable to a run: credits granted at the batch consumptions of
  // the runs that lead into it
  const idx = await loadGraph();
  const upstream = new Set([runRef]);
  const stack = [runRef];
  while (stack.length) {
    const r = stack.pop();
    const cons = idx.consumptionsByRun.get(r) || [];
    for (const c of cons) {
      if (c.input_kind === "output") {
        const parentRun = idx.runOfOutput.get(c.input);
        if (parentRun && !upstream.has(parentRun)) { upstream.add(parentRun); stack.push(parentRun); }
      }
    }
  }
  const refs = [...upstream];
  if (!refs.length) return { post_consumer: 0, pre_consumer: 0, derivation: { runs: [] } };
  const rows = await q(
    "SELECT category, coalesce(sum(mass_g),0) AS n FROM credit_movement WHERE reason='consumption' AND consumption IN (SELECT reference FROM consumption WHERE run = ANY($1)) GROUP BY category",
    [refs]
  );
  const out = { post_consumer: 0, pre_consumer: 0, derivation: { runs: refs } };
  for (const r of rows) out[r.category] = Number(r.n);
  return out;
}

export async function byproductShares(runRef) {
  const run = await one("SELECT * FROM run WHERE reference=$1", [runRef]);
  if (!run) return null;
  const outs = await q("SELECT * FROM output WHERE run=$1", [runRef]);
  const totalOut = outs.reduce((s, o) => s + Number(o.mass_g), 0);
  const claim = await runClaim(runRef);
  const claimTotal = claim.post_consumer + claim.pre_consumer;
  return outs
    .filter((o) => o.kind === "byproduct" && o.disposition === "sold")
    .map((o) => {
      const shareBp = byproductShareBp(Number(o.mass_g), totalOut);
      return {
        reference: o.reference,
        mass_g: Number(o.mass_g),
        total_output_mass_g: totalOut,
        share_bp: shareBp,
        claim_share_g: Math.floor((claimTotal * shareBp) / 10000),
        emissions_share_mg: null,
        disposition: o.disposition,
        derivation: {
          rule: "share_bp = floor(byproduct_mass_g * 10000 / total_output_mass_g); claim_share_g = floor(run_claim * share_bp / 10000)",
          basis: "mass",
          run_claim: claim,
        },
      };
    });
}

export async function blendLots(aRef, bRef) {
  const [a, b] = await Promise.all([
    one("SELECT * FROM lot WHERE reference=$1", [aRef]),
    one("SELECT * FROM lot WHERE reference=$1", [bRef]),
  ]);
  if (!a || !b) return null;
  const ca = await lotContent(aRef);
  const cb = await lotContent(bRef);
  const mass = Number(a.mass_g) + Number(b.mass_g);
  const bp = blendContent(Number(a.mass_g), ca.content_bp, Number(b.mass_g), cb.content_bp);
  return {
    mass_g: mass,
    content_bp: bp,
    claim_type: a.claim_type === b.claim_type ? a.claim_type : weakerClaim(a.claim_type, b.claim_type),
    sites: a.site === b.site ? [a.site] : [a.site, b.site].sort(),
    provisional_factor: ca.provisional_factor || cb.provisional_factor,
    derivation: {
      rule: "content_bp = floor((mass_a * content_a + mass_b * content_b) / (mass_a + mass_b))",
      inputs: [aRef + "@" + ca.content_bp, bRef + "@" + cb.content_bp],
    },
  };
}

function weakerClaim(a, b) {
  const order = ["physically_segregated", "controlled_blending", "mass_balance"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

export function carryOver(creditsInG, availableG, limitBp) {
  const cap = Math.floor((creditsInG * limitBp) / 10000);
  const carried = Math.min(availableG, cap);
  return { carried_forward_g: carried, expired_g: availableG - carried, cap_g: cap };
}

export { dryMass, creditGranted, contentBp, byproductShareBp, blendContent, factorBpFromWindow };
