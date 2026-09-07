// The ledger. A balance is the sum of its movements and is never held as a total.
import { q, one, pool, poolRunner } from '../lib/db.js';
import { contentBp, mulDiv, dayOf } from '../lib/num.js';
import { contextFor, batchFacts } from './genealogy.js';

export const CATEGORIES = ['post_consumer', 'pre_consumer'];

// credits_in_g counts fresh credit granted at a consumption, plus credit carried
// in from the period before. A transfer between sites is never a fresh credit,
// so it is reported on its own as inbound_credits and outbound_transfers and
// carried in total_credit_g, where the journey conserves it exactly.
const IN_DIRECTIONS = new Set(['in', 'carry_in']);
const OUT_DIRECTIONS = new Set(['out', 'expiry', 'carry_out']);

export async function movementsFor(periodId, runner = poolRunner) {
  const { rows } = await runner.query('select * from credit_movement where period = $1 order by seq asc', [periodId]);
  return rows;
}

export function summariseMovements(rows) {
  const out = {};
  for (const cat of CATEGORIES) {
    const mine = rows.filter((m) => m.category === cat);
    const sum = (pred) => mine.filter(pred).reduce((s, m) => s + Number(m.mass_g), 0);
    const credits_in_g = sum((m) => IN_DIRECTIONS.has(m.direction));
    const credits_out_g = sum((m) => OUT_DIRECTIONS.has(m.direction));
    const transferred_in_g = sum((m) => m.direction === 'transfer_in');
    const transferred_out_g = sum((m) => m.direction === 'transfer_out');
    out[cat] = {
      credits_in_g,
      credits_out_g,
      credits_available_g: credits_in_g - credits_out_g,
      transferred_in_g,
      transferred_out_g,
      total_credit_g: credits_in_g - credits_out_g + transferred_in_g - transferred_out_g,
      movement_count: mine.length,
    };
  }
  return out;
}

export async function availableFor(periodId, category, runner = poolRunner) {
  const rows = await movementsFor(periodId, runner);
  return summariseMovements(rows)[category].credits_available_g;
}

export async function conversionFactorsInForce(site, on, runner = poolRunner) {
  const rows = await runner.q(
    'select * from conversion_factor where site = $1 order by published_on asc, version asc',
    [site],
  );
  const day = on ? dayOf(on) : null;
  const applicable = day ? rows.filter((r) => dayOf(r.published_on) <= day) : rows;
  const chosen = applicable.length ? applicable[applicable.length - 1] : rows[rows.length - 1];
  return {
    in_force: chosen
      ? {
          reference: chosen.reference,
          version: chosen.version,
          factor_bp: chosen.factor_bp,
          derived_from: chosen.derived_from ? dayOf(chosen.derived_from) : null,
          derived_to: chosen.derived_to ? dayOf(chosen.derived_to) : null,
          derived_in_g: Number(chosen.derived_in_g),
          derived_out_g: Number(chosen.derived_out_g),
          provisional: chosen.provisional,
        }
      : null,
    all: rows.map((r) => ({
      reference: r.reference,
      version: r.version,
      factor_bp: r.factor_bp,
      derived_from: r.derived_from ? dayOf(r.derived_from) : null,
      derived_to: r.derived_to ? dayOf(r.derived_to) : null,
      derived_in_g: Number(r.derived_in_g),
      derived_out_g: Number(r.derived_out_g),
      provisional: r.provisional,
    })),
  };
}

export async function periodFor(site, grade, on) {
  const day = dayOf(on);
  return one(
    'select * from balance_period where site = $1 and grade = $2 and period_from <= $3 and period_to >= $3',
    [site, grade, day],
  );
}

export async function nonClaimableInput(periodId, runner = poolRunner) {
  const period = await runner.one('select * from balance_period where id = $1', [periodId]);
  if (!period) return 0;
  const ctx = await contextFor(runner);
  const runs = ctx.runs.filter((r) => r.site === period.site);
  const runRefs = new Set(runs.map((r) => r.reference));
  let total = 0;
  const counted = new Set();
  for (const cn of ctx.consumptions) {
    if (!runRefs.has(cn.run)) continue;
    if (cn.input_kind !== 'batch') continue;
    const eff = dayOf(cn.effective_on);
    if (eff < dayOf(period.period_from) || eff > dayOf(period.period_to)) continue;
    const b = ctx.batches.find((x) => x.reference === cn.input_ref);
    if (!b) continue;
    const facts = batchFacts(b, ctx);
    if (!facts.claimable && !counted.has(`${cn.reference}`)) {
      counted.add(cn.reference);
      total += Number(cn.mass_g);
    }
  }
  return total;
}

// Every query below runs against the runner it was handed. When that runner is
// a snapshot, the whole view is one consistent state.
export async function balancePeriodView(periodId, runner = poolRunner) {
  const period = await runner.one('select * from balance_period where id = $1', [periodId]);
  if (!period) return null;
  const rows = await movementsFor(periodId, runner);
  const sums = summariseMovements(rows);
  const factors = await conversionFactorsInForce(period.site, period.period_to, runner);
  const [overrides, restatements, findings] = await Promise.all([
    runner.q(
      `select o.* from override_record o join lot l on l.reference = o.lot
       where l.site = $1 and o.effective_on between $2 and $3`,
      [period.site, period.period_from, period.period_to],
    ),
    runner.q("select * from restatement where period = $1 and state = 'open'", [periodId]),
    runner.q("select * from finding where state = 'open'"),
  ]);
  const nonClaimable = await nonClaimableInput(periodId, runner);
  const today = new Date().toISOString().slice(0, 10);
  const pastDate = findings.filter((f) => f.due_on && dayOf(f.due_on) < today);

  const per = {};
  for (const cat of CATEGORIES) {
    per[cat] = {
      ...sums[cat],
      derivation: {
        credits_in_g: `sum of ${cat} credit movements in, each granted at a consumption as dry mass times factor_bp / 10000, floored`,
        credits_out_g: `sum of ${cat} credit movements out, each an allocation attaching claim to a lot`,
        credits_available_g: 'credits_in_g minus credits_out_g, over the movements themselves',
        movements: rows.filter((m) => m.category === cat).map((m) => m.reference),
      },
    };
  }

  return {
    id: period.id,
    site: period.site,
    grade: period.grade,
    period: { from: dayOf(period.period_from), to: dayOf(period.period_to) },
    state: period.state,
    allocation_basis: period.allocation_basis,
    post_consumer: per.post_consumer,
    pre_consumer: per.pre_consumer,
    conversion_factors: factors.all.map((f) => ({
      ...f,
      derivation_window: f.derived_from ? { from: f.derived_from, to: f.derived_to } : null,
      in_force: factors.in_force && f.reference === factors.in_force.reference,
    })),
    carry_over_limit_bp: period.carry_over_limit_bp,
    override_count: overrides.length,
    unreviewed_override_count: overrides.filter((o) => !o.reviewed).length,
    overrides: overrides.map((o) => ({ reference: o.reference, lot: o.lot, separation: o.separation, reviewed: o.reviewed })),
    open_restatement_count: restatements.length,
    open_finding_count: findings.length,
    findings_past_date_count: pastDate.length,
    non_claimable_input_g: nonClaimable,
    closed_on: period.closed_on ? dayOf(period.closed_on) : null,
    cut_off: period.cut_off ? dayOf(period.cut_off) : null,
    carried_forward_g: period.carried_forward || null,
    expired_g: period.expired || null,
    metered_kwh: Number(period.metered_kwh),
    inbound_credits: rows
      .filter((m) => m.direction === 'transfer_in')
      .map((m) => ({
        reference: m.reference,
        mass_g: Number(m.mass_g),
        origin_site: m.origin_site,
        movement: m.movement,
        category: m.category,
        fresh_credit: false,
      })),
    allocations: rows
      .filter((m) => m.direction === 'out')
      .map((m) => ({ reference: m.reference, lot: m.lot, category: m.category, mass_g: Number(m.mass_g), effective_on: dayOf(m.effective_on) })),
    derivation: {
      source: 'credit_movement rows for this period; a balance is the sum of its movements and is never held as a total',
    },
  };
}

export async function creditAttachedToLot(lotRef, runner = poolRunner) {
  const rows = await runner.q("select * from credit_movement where lot = $1 and direction = 'out'", [lotRef]);
  const byCat = { post_consumer: 0, pre_consumer: 0 };
  for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + Number(r.mass_g);
  const total = byCat.post_consumer + byCat.pre_consumer;
  return { total_g: total, category_split: byCat, movements: rows.map((r) => r.reference) };
}

export async function lotClaim(lotRef, runner = poolRunner) {
  const lot = await runner.one('select * from lot where reference = $1', [lotRef]);
  if (!lot) return null;
  const attached = await creditAttachedToLot(lotRef, runner);
  const content_bp = contentBp(attached.total_g, lot.mass_g);
  const factors = await conversionFactorsInForce(lot.site, lot.produced_on, runner);
  const provisional = factors.in_force ? !!factors.in_force.provisional : false;
  return {
    lot: lotRef,
    mass_g: Number(lot.mass_g),
    claim_type: lot.claim_type,
    credit_attached_g: attached.total_g,
    content_bp,
    category_split: attached.category_split,
    provisional_factor: provisional,
    conversion_factor: factors.in_force,
    derivation: {
      content_bp: 'credit_attached_g * 10000 / lot_mass_g, floored',
      credit_attached_g: attached.movements,
    },
  };
}

// Losses reduce the claim: a run's yield is what came out of what went in.
export async function lotYield(lotRef, runner = poolRunner) {
  const ctx = await contextFor(runner);
  const lot = ctx.lots.find((l) => l.reference === lotRef);
  if (!lot) return null;
  const { genealogyOfLot } = await import('./genealogy.js');
  const g = await genealogyOfLot(lotRef, runner);
  const runRefs = g.nodes.filter((n) => n.kind === 'run').map((n) => n.reference);
  const stages = runRefs
    .map((r) => {
      const run = ctx.runs.find((x) => x.reference === r);
      const ins = ctx.consumptions.filter((c) => c.run === r).reduce((s, c) => s + Number(c.mass_g), 0);
      const outs = ctx.outputs.filter((o) => o.run === r).reduce((s, o) => s + Number(o.mass_g), 0);
      return {
        run: r,
        run_type: run.run_type,
        mass_in_g: ins,
        mass_out_g: outs,
        losses_g: ins - outs,
        yield_bp: ins ? mulDiv(outs, 10000, ins) : 0,
      };
    })
    .sort((a, b) => a.run.localeCompare(b.run));
  const totalIn = stages.reduce((s, x) => s + x.mass_in_g, 0);
  const totalOut = stages.reduce((s, x) => s + x.mass_out_g, 0);
  return {
    lot: lotRef,
    stages,
    total_losses_g: totalIn - totalOut,
    derivation: { yield_bp: 'mass_out_g * 10000 / mass_in_g, floored, per run', note: 'Losses reduce the claim.' },
  };
}
