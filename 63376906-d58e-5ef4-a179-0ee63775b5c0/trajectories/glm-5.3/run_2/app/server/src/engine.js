import { q, one, withTx } from "./db.js";
import { dryMassG, creditGrantedG, contentBP } from "./arithmetic.js";

// The engine. The arithmetic has no surface of its own and no writable input
// other than the operational record and the versioned methods. Every answer
// carries its derivation and the versions it was computed against.

export async function factorForSite(site, on_date) {
  const rows = await q(
    `select * from conversion_factors where site = $1 order by published_on desc`,
    [site]
  );
  const candidates = rows.filter((r) => !on_date || new Date(r.published_on) <= new Date(on_date + "T23:59:59"));
  return candidates[0] || rows.at(-1) || null;
}

export async function periodFor(site, grade, on_date) {
  return one(
    `select * from balance_periods
     where site = $1 and grade = $2 and $3 between period_from and period_to
     order by id desc limit 1`,
    [site, grade, on_date]
  );
}

// A batch resolves its claimability against the collector approval in force on
// its receipt date, never a current flag.
export async function approvalInForce(collector, on_date) {
  return one(
    `select * from approval_periods
     where collector = $1 and $2 between valid_from and valid_to
     order by valid_from desc limit 1`,
    [collector, on_date]
  );
}

export async function batchClaimability(b) {
  const reasons = [];
  const ap = await approvalInForce(b.collector, b.received_on);
  const collector = await one(`select * from parties where reference = $1`, [b.collector]);
  let claimable = true;
  let reason = null;
  if (!ap) {
    claimable = false;
    reason = "collector_approval_lapsed";
  } else if (ap.state !== "approved" && ap.state !== "conditional") {
    claimable = false;
    reason = "collector_approval_" + ap.state;
  }
  const custody = b.custody || [];
  const requiredKinds = ["collection_site", "collector", "transport", "arrival", "weighing", "acceptance"];
  const present = new Set(custody.map((l) => l.kind));
  const missing = requiredKinds.filter((k) => !present.has(k));
  if (missing.length > 0) {
    claimable = false;
    reason = "custody_link_missing";
  }
  const flags = [];
  if (b.device) {
    const dev = await one(`select * from devices where reference = $1`, [b.device]);
    if (dev) {
      const months = (new Date(b.received_on) - new Date(dev.calibrated_on)) / (30.44 * 86400000);
      if (months > 12) flags.push("lapsed_calibration");
    }
  }
  if (missing.length > 0) {
    return {
      claimable: false,
      claimable_reason: "custody_link_missing",
      missing_kinds: missing,
      flags,
      claimable_from: b.claimable_from || null,
    };
  }
  return {
    claimable,
    claimable_reason: claimable ? null : reason,
    missing_kinds: [],
    flags,
    claimable_from: b.claimable_from || null,
  };
}

export async function batchFlags(b) {
  const f = await batchClaimability(b);
  return f.flags;
}

// Ledger totals. A balance is the sum of its movements and is never held as a
// total. Fresh credit is what entered at a consumption; an inter-site transfer
// arrives as an inbound movement naming its origin and is reported beside it.
export async function periodTotals(periodId) {
  const rows = await q(
    `select kind, category, mass_g, fresh_credit, origin_site from credit_movements where period = $1`,
    [periodId]
  );
  const per = { post_consumer: { in: 0, out: 0 }, pre_consumer: { in: 0, out: 0 } };
  const inbound = [];
  for (const r of rows) {
    if (!per[r.category]) per[r.category] = { in: 0, out: 0 };
    if (r.kind === "in") per[r.category].in += Number(r.mass_g);
    else per[r.category].out += Number(r.mass_g);
    if (r.origin_site) {
      inbound.push({
        reference: r.movement,
        mass_g: Number(r.mass_g),
        origin_site: r.origin_site,
        movement: r.movement,
        fresh_credit: !!r.fresh_credit,
        category: r.category,
      });
    }
  }
  return { per, inbound };
}

export async function periodMovements(periodId) {
  return q(
    `select * from credit_movements where period = $1 order by id`,
    [periodId]
  );
}

// The ledger view a balance screen renders: credits in, credits out, available
// per category, with the derivation naming the records each figure came from.
// credits_in_g counts fresh credit; an inbound transfer is reported separately
// so the two are never netted and never confused.
export async function balanceView(periodId) {
  const p = await one(`select * from balance_periods where id = $1`, [periodId]);
  const movements = await periodMovements(periodId);
  const per = { post_consumer: { in: 0, out: 0 }, pre_consumer: { in: 0, out: 0 } };
  const inboundCredits = [];
  const spendable = { post_consumer: { in: 0, out: 0 }, pre_consumer: { in: 0, out: 0 } };
  for (const m of movements) {
    if (!per[m.category] || m.category === "non_claimable") {
      if (m.category === "non_claimable") continue;
      per[m.category] = { in: 0, out: 0 };
      spendable[m.category] = spendable[m.category] || { in: 0, out: 0 };
    }
    if (m.kind === "in") {
      if (m.fresh_credit) per[m.category].in += Number(m.mass_g);
      spendable[m.category].in += Number(m.mass_g);
    } else {
      per[m.category].out += Number(m.mass_g);
      spendable[m.category].out += Number(m.mass_g);
    }
  }
  for (const m of movements) {
    if (m.origin_site) {
      inboundCredits.push({
        reference: m.movement,
        mass_g: Number(m.mass_g),
        origin_site: m.origin_site,
        movement: m.movement,
        fresh_credit: !!m.fresh_credit,
        category: m.category,
      });
    }
  }
  const available = {};
  for (const cat of Object.keys(spendable)) {
    available[cat] = spendable[cat].in - spendable[cat].out;
  }
  const nonClaimable = movements
    .filter((m) => m.category === "non_claimable" && m.kind === "in")
    .reduce((a, m) => a + Number(m.mass_g), 0);
  const factors = await q(
    `select * from conversion_factors where site = $1 order by published_on desc`,
    [p.site]
  );
  return { period: p, per, available, movements, inboundCredits, non_claimable_input_g: nonClaimable, factors };
}

// The invariant checked at every allocation and at every signature.
export async function marginFor(periodId, category, extraOutG = 0) {
  const movements = await periodMovements(periodId);
  let inG = 0;
  let outG = 0;
  for (const m of movements) {
    if (m.category !== category) continue;
    if (m.kind === "in") inG += Number(m.mass_g);
    else outG += Number(m.mass_g);
  }
  return { available_g: inG - outG - extraOutG, in_g: inG, out_g: outG };

}

// Credits enter when a claimable batch is consumed, in dry mass times the
// site's conversion factor, floored. Losses reduce the claim: material that
// disappears in processing does not carry its claim forward.
export function creditForConsumption(dryMassConsumedG, factorBP) {
  return creditGrantedG(dryMassConsumedG, factorBP);
}

export function contentForLot(creditAttachedG, lotMassG) {
  return contentBP(creditAttachedG, lotMassG);
}
