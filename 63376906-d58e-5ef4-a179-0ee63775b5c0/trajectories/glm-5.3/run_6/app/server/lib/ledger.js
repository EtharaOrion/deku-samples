import { floorDiv } from './units.js';

export async function factorForSite(c, site, onDate) {
  const rows = (await c.query(`SELECT * FROM conversion_factors WHERE site=$1 ORDER BY provisional ASC, published_on DESC, reference DESC`, [site])).rows;
  const derived = rows.filter((r) => !r.provisional);
  if (derived.length) {
    const inWindow = derived.find((r) => r.derived_from && r.derived_to && onDate >= r.derived_from && onDate <= r.derived_to);
    return inWindow || derived[0];
  }
  return rows[0] || null;
}

export async function balanceOf(c, period) {
  const movs = (await c.query(`SELECT * FROM credit_movements WHERE period=$1 ORDER BY id ASC`, [period])).rows;
  const credit = movs.filter((m) => m.kind !== 'non_claimable_input');
  const out = {};
  for (const cat of ['post_consumer', 'pre_consumer']) {
    const ins = credit.filter((m) => m.category === cat && m.direction === 'in').reduce((a, m) => a + m.mass_g, 0);
    const outs = credit.filter((m) => m.category === cat && m.direction === 'out').reduce((a, m) => a + m.mass_g, 0);
    out[cat] = { credits_in_g: ins, credits_out_g: outs, credits_available_g: ins - outs };
  }
  const nonClaimable = movs.filter((m) => m.kind === 'non_claimable_input').reduce((a, m) => a + m.mass_g, 0);
  return { per: out, movements: movs, non_claimable_input_g: nonClaimable };
}

export async function creditsForLot(c, lotRef) {
  const movs = (await c.query(`SELECT * FROM credit_movements WHERE lot=$1 AND direction='out'`, [lotRef])).rows;
  const per = { post_consumer: 0, pre_consumer: 0 };
  for (const m of movs) per[m.category] += m.mass_g;
  return per;
}

export async function contentOfLot(c, lotRef) {
  const lot = (await c.query(`SELECT * FROM lots WHERE reference=$1`, [lotRef])).rows[0];
  if (!lot) return { content_bp: 0, attached: { post_consumer: 0, pre_consumer: 0 } };
  const per = await creditsForLot(c, lotRef);
  const attached = per.post_consumer + per.pre_consumer;
  return {
    content_bp: attached > 0 ? floorDiv(attached * 10000, lot.mass_g) : 0,
    attached: per
  };
}

export async function balanceView(c, bp, read_at) {
  const { per, movements, non_claimable_input_g } = await balanceOf(c, bp.id);
  const factors = (await c.query(`SELECT * FROM conversion_factors WHERE site=$1 ORDER BY provisional ASC, published_on DESC`, [bp.site])).rows;
  const overrideCount = (await c.query(
    `SELECT count(*)::int AS n FROM overrides WHERE lot IN (SELECT reference FROM lots WHERE site=$1)`, [bp.site]
  )).rows[0].n;
  const restatements = (await c.query(`SELECT count(*)::int AS n FROM restatements WHERE period=$1 AND state='open'`, [bp.id])).rows[0].n;
  const findings = (await c.query(`SELECT count(*)::int AS n FROM collector_findings WHERE NOT closed`, [])).rows[0].n;

  return {
    id: bp.id,
    site: bp.site,
    grade: bp.grade,
    period: { from: bp.period_from, to: bp.period_to },
    state: bp.state,
    carry_over_limit_bp: bp.carry_over_limit_bp,
    allocation_basis: bp.allocation_basis,
    post_consumer: per.post_consumer,
    pre_consumer: per.pre_consumer,
    credits_in_g: { post_consumer: per.post_consumer.credits_in_g, pre_consumer: per.pre_consumer.credits_in_g },
    credits_out_g: { post_consumer: per.post_consumer.credits_out_g, pre_consumer: per.pre_consumer.credits_out_g },
    credits_available_g: { post_consumer: per.post_consumer.credits_available_g, pre_consumer: per.pre_consumer.credits_available_g },
    conversion_factors: factors.map((f) => ({
      reference: f.reference, factor_bp: f.factor_bp, provisional: f.provisional,
      derivation_window: f.derived_from ? { from: f.derived_from, to: f.derived_to, in_g: f.derived_in_g, out_g: f.derived_out_g } : null,
      published_on: f.published_on
    })),
    override_count: overrideCount,
    open_restatement_count: restatements,
    open_finding_count: findings,
    non_claimable_input_g: non_claimable_input_g,
    closed_on: bp.closed_on,
    cut_off: bp.cut_off,
    carried_forward_g: bp.carried_forward_g,
    expired_g: bp.expired_g,
    movements: movements.map((m) => ({
      id: m.id, category: m.category, direction: m.direction, mass_g: m.mass_g, kind: m.kind,
      lot: m.lot, origin_site: m.origin_site, movement_ref: m.movement_ref, effective_on: m.effective_on
    })),
    derivation: {
      description: 'A balance is the sum of its movements and is never held as a total.',
      movement_ids: movements.map((m) => m.id),
      credit_rule: 'credit granted at a consumption = dry_mass_consumed_g * factor_bp / 10000, floored',
      dry_mass_rule: 'dry_mass = net_g * (10000 - moisture_bp) / 10000, floored',
      factor_references: factors.map((f) => f.reference)
    },
    read_at
  };
}
