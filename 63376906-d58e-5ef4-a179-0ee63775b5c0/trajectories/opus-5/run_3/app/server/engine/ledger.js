import { rq, rq1 } from '../db/pool.js';
import { contentBp, carryOver } from './units.js';

const CATEGORIES = ['post_consumer', 'pre_consumer'];

/** A balance is the sum of its movements and is never held as a total.
 *  The two categories are never netted against one another. */
export async function periodBalance(periodId, client = null) {
  const run = client
    ? (sql, args) => client.query(sql, args).then((r) => r.rows)
    : rq;

  const period = (await run('SELECT * FROM balance_period WHERE id = $1', [periodId]))[0];
  if (!period) return null;

  const movements = await run(
    `SELECT direction, category, mass_g, movement, source_ref, lot, origin_site, fresh_credit, reference
       FROM credit_movement WHERE balance_period = $1 ORDER BY reference`, [periodId]
  );

  const totals = {};
  for (const cat of CATEGORIES) {
    totals[cat] = { credits_in_g: 0, credits_out_g: 0, credits_available_g: 0, transferred_in_g: 0 };
  }
  for (const m of movements) {
    const t = totals[m.category];
    if (!t) continue;
    if (m.direction === 'in') {
      // Credit that entered this period is credit granted at a consumption.
      // Credit that arrived from another site is inbound credit, enumerated
      // separately as inbound_credits and never counted as fresh: it was
      // granted once already, in the period it came from.
      if (m.fresh_credit) t.credits_in_g += Number(m.mass_g);
      else t.transferred_in_g += Number(m.mass_g);
    } else t.credits_out_g += Number(m.mass_g);
  }
  for (const cat of CATEGORIES) {
    totals[cat].credits_available_g = totals[cat].credits_in_g - totals[cat].credits_out_g;
  }

  return { period, movements, totals };
}

export async function availableG(periodId, category, client = null) {
  const b = await periodBalance(periodId, client);
  if (!b) return 0;
  return b.totals[category]?.credits_available_g ?? 0;
}

/** Non-claimable input is reported rather than absorbed: material that was
 *  processed but carried no claim is a figure on the balance screen. */
async function nonClaimableInputG(periodId) {
  const rows = await rq(
    `SELECT COALESCE(SUM(c.mass_g), 0) AS g
       FROM consumption c
       JOIN run r ON r.reference = c.run
       JOIN balance_period bp ON bp.id = $1
       JOIN batch b ON b.reference = c.input_ref AND c.input_kind = 'batch'
      WHERE r.site = bp.site
        AND c.effective_on BETWEEN bp.period_from AND bp.period_to
        AND NOT EXISTS (
          SELECT 1 FROM credit_movement cm
           WHERE cm.balance_period = bp.id AND cm.movement = 'consumption'
             AND cm.source_ref = c.reference AND cm.mass_g > 0)`,
    [periodId]
  );
  return Number(rows[0]?.g || 0);
}

export async function periodDetail(periodId) {
  const b = await periodBalance(periodId);
  if (!b) return null;
  const { period, movements, totals } = b;

  const factors = await rq(
    `SELECT reference, version, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional
       FROM conversion_factor WHERE site = $1 ORDER BY version`, [period.site]
  );

  const [overrides, restatements, findings, lots, nonClaimable] = await Promise.all([
    rq(`SELECT o.reference, o.reviewed FROM separation_override o
         JOIN lot l ON l.reference = o.lot WHERE l.site = $1 AND l.grade = $2`, [period.site, period.grade]),
    rq('SELECT reference FROM restatement WHERE balance_period = $1 AND state = $2', [periodId, 'open']),
    rq(`SELECT reference, due_on FROM finding WHERE state = 'open'`),
    rq('SELECT reference, mass_g, disposition FROM lot WHERE site = $1 AND grade = $2', [period.site, period.grade]),
    nonClaimableInputG(periodId)
  ]);

  const inbound = movements.filter((m) => m.movement === 'transfer_in').map((m) => ({
    reference: m.reference,
    mass_g: Number(m.mass_g),
    origin_site: m.origin_site,
    movement: m.movement,
    fresh_credit: false
  }));

  const perCategory = {};
  for (const cat of CATEGORIES) {
    const t = totals[cat];
    perCategory[cat] = {
      credits_in_g: t.credits_in_g,
      credits_out_g: t.credits_out_g,
      credits_available_g: t.credits_available_g,
      transferred_in_g: t.transferred_in_g,
      derivation: {
        credits_in_g: `sum of ${movements.filter((m) => m.direction === 'in' && m.category === cat && m.fresh_credit).length} credit grants at consumption; transferred credit is enumerated separately in inbound_credits and is never fresh`,
        credits_out_g: `sum of ${movements.filter((m) => m.direction === 'out' && m.category === cat).length} outbound movements`,
        credits_available_g: 'credits_in_g minus credits_out_g, at the moment of this read',
        movements: movements.filter((m) => m.category === cat).map((m) => m.reference)
      }
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  return {
    id: period.id,
    site: period.site,
    grade: period.grade,
    period: { from: String(period.period_from).slice(0, 10), to: String(period.period_to).slice(0, 10) },
    state: period.state,
    allocation_basis: period.allocation_basis,
    post_consumer: perCategory.post_consumer,
    pre_consumer: perCategory.pre_consumer,
    conversion_factors: factors.map((f) => ({
      reference: f.reference,
      version: f.version,
      factor_bp: f.factor_bp,
      provisional: f.provisional,
      derivation_window: {
        derived_from: f.derived_from ? String(f.derived_from).slice(0, 10) : null,
        derived_to: f.derived_to ? String(f.derived_to).slice(0, 10) : null,
        derived_in_g: Number(f.derived_in_g),
        derived_out_g: Number(f.derived_out_g)
      }
    })),
    carry_over_limit_bp: period.carry_over_limit_bp,
    override_count: overrides.length,
    unreviewed_override_count: overrides.filter((o) => !o.reviewed).length,
    open_restatement_count: restatements.length,
    open_finding_count: findings.length,
    findings_past_date: findings.filter((f) => f.due_on && String(f.due_on).slice(0, 10) < today).length,
    non_claimable_input_g: nonClaimable,
    metered_kwh: Number(period.metered_kwh),
    inbound_credits: inbound,
    closed_on: period.closed_on ? String(period.closed_on).slice(0, 10) : null,
    cut_off: period.cut_off ? String(period.cut_off).slice(0, 10) : null,
    carried_forward_g: period.carried_forward || null,
    expired_g: period.expired || null,
    lots: lots.map((l) => ({
      reference: l.reference, mass_g: Number(l.mass_g), disposition: l.disposition
    })),
    movements: movements.map((m) => ({
      reference: m.reference, direction: m.direction, category: m.category,
      mass_g: Number(m.mass_g), movement: m.movement, lot: m.lot,
      source_ref: m.source_ref, origin_site: m.origin_site, fresh_credit: m.fresh_credit
    }))
  };
}

/** The claim attached to a lot, and the percentage that follows from it.
 *  Every percentage is computed and no route accepts one. */
export async function lotClaim(lotRef) {
  const lot = await rq1('SELECT * FROM lot WHERE reference = $1', [lotRef]);
  if (!lot) return null;
  const attached = await rq(
    `SELECT category, COALESCE(SUM(mass_g),0) AS g FROM credit_movement
      WHERE lot = $1 AND direction = 'out' AND movement = 'allocation' GROUP BY category`, [lotRef]
  );
  const split = { post_consumer: 0, pre_consumer: 0 };
  for (const r of attached) split[r.category] = Number(r.g);
  const total = split.post_consumer + split.pre_consumer;
  const massG = Number(lot.mass_g);
  return {
    lot: lotRef,
    mass_g: massG,
    credit_attached_g: total,
    category_split: split,
    content_bp: contentBp(total, massG),
    claim_type: lot.claim_type,
    derivation: {
      content_bp: `credit_attached_g ${total} * 10000 / lot_mass_g ${massG}, floored`,
      source: 'the sum of the allocation movements attached to this lot'
    }
  };
}

/** What a close would settle, computed before it is committed so the surface
 *  can state it and the close can record it. */
export async function carryOverAtClose(periodId) {
  const b = await periodBalance(periodId);
  if (!b) return null;
  const out = {};
  for (const cat of CATEGORIES) {
    const t = b.totals[cat];
    out[cat] = carryOver(t.credits_in_g, t.credits_available_g, b.period.carry_over_limit_bp);
  }
  return out;
}

/** A period closes only when every lot in it has a disposition, no deviation
 *  touching it is open, and the balance reconciles. The refusal names which. */
export async function closeBlockers(periodId) {
  const detail = await periodDetail(periodId);
  if (!detail) return null;
  const blockers = [];

  const pendingLots = detail.lots.filter((l) => l.disposition === 'pending');
  if (pendingLots.length) {
    blockers.push({
      condition: 'every lot in the period carries a disposition',
      blocking_reference: pendingLots.map((l) => l.reference).join(', ')
    });
  }

  const lotRefs = detail.lots.map((l) => l.reference);
  const openDeviations = lotRefs.length
    ? await rq(
      `SELECT reference FROM deviation WHERE state = 'open'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(lots) x WHERE x = ANY($1))`, [lotRefs])
    : [];
  if (openDeviations.length) {
    blockers.push({
      condition: 'no deviation touching the period is open',
      blocking_reference: openDeviations.map((d) => d.reference).join(', ')
    });
  }

  for (const cat of CATEGORIES) {
    if (detail[cat].credits_available_g < 0) {
      blockers.push({
        condition: 'the balance reconciles',
        blocking_reference: `${cat} available is ${detail[cat].credits_available_g} g`
      });
    }
  }

  return blockers;
}

export { CATEGORIES };
