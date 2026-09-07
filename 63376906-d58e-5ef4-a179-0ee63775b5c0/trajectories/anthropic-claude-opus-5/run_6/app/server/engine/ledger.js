import { q } from '../lib/db.js';
import { carryOver, contentBp } from './arithmetic.js';
import { iso } from './feedstock.js';

const CATEGORIES = ['post_consumer', 'pre_consumer'];

// A balance is the sum of its movements and is never held as a total.
export async function ledgerFor(periodId, client) {
  const runner = client ? (t, p) => client.query(t, p).then((r) => r.rows) : q;
  const rows = await runner('SELECT * FROM credit_movement WHERE period_id = $1 ORDER BY id ASC', [periodId]);
  const totals = {};
  for (const cat of CATEGORIES) {
    totals[cat] = { credits_in_g: 0, credits_out_g: 0, credits_available_g: 0, inbound_credits_g: 0, movements: [] };
  }
  for (const m of rows) {
    if (!totals[m.category]) continue;
    const mass = Number(m.mass_g);
    // 'in' is fresh credit granted at a consumption; 'inbound' arrived by transfer and is
    // never a fresh credit; 'note' records non-claimable input, which carries no credit.
    if (m.direction === 'in') totals[m.category].credits_in_g += mass;
    else if (m.direction === 'out') totals[m.category].credits_out_g += mass;
    else if (m.direction === 'inbound') totals[m.category].inbound_credits_g += mass;
    totals[m.category].movements.push({
      id: Number(m.id), kind: m.kind, direction: m.direction, mass_g: mass, ref: m.ref,
      lot: m.lot, origin_site: m.origin_site, fresh_credit: m.fresh_credit,
      effective_on: iso(m.effective_on), derivation: m.derivation,
    });
  }
  // the two categories are never netted
  for (const cat of CATEGORIES) {
    totals[cat].credits_available_g = totals[cat].credits_in_g - totals[cat].credits_out_g;
    totals[cat].total_credit_held_g = totals[cat].credits_available_g + totals[cat].inbound_credits_g;
  }
  return totals;
}

export async function periodView(period) {
  const totals = await ledgerFor(period.id);
  const factors = await q('SELECT * FROM conversion_factor WHERE site = $1 ORDER BY version ASC', [period.site]);
  const overrides = await q(
    `SELECT o.* FROM override_record o JOIN lot l ON l.reference = o.lot WHERE l.site = $1`, [period.site]);
  const restatements = await q('SELECT * FROM restatement WHERE period_id = $1', [period.id]);
  const findings = await q('SELECT * FROM finding WHERE state = $1', ['open']);
  const movements = await q('SELECT * FROM credit_movement WHERE period_id = $1', [period.id]);
  const nonClaimable = movements.filter((m) => m.kind === 'non_claimable_input')
    .reduce((s, m) => s + Number(m.mass_g), 0);

  const today = new Date().toISOString().slice(0, 10);
  const overdueFindings = findings.filter((f) => f.due_on && iso(f.due_on) < today);

  const out = {
    id: period.id,
    site: period.site,
    grade: period.grade,
    period: { from: iso(period.period_from), to: iso(period.period_to) },
    state: period.state,
    allocation_basis: period.allocation_basis,
    carry_over_limit_bp: Number(period.carry_over_limit_bp),
    categories: {},
    conversion_factors: factors.map((f) => ({
      reference: f.reference, version: f.version, factor_bp: Number(f.factor_bp),
      derived_from: iso(f.derived_from), derived_to: iso(f.derived_to),
      derived_in_g: Number(f.derived_in_g), derived_out_g: Number(f.derived_out_g),
      provisional: f.provisional, superseded: f.superseded,
      derivation: f.provisional
        ? 'provisional: no derivation window, derived_in_g is zero'
        : `derived_out_g ${f.derived_out_g} * 10000 / derived_in_g ${f.derived_in_g}, floored`,
    })),
    override_count: overrides.length,
    open_restatement_count: restatements.filter((r) => r.state === 'open').length,
    open_finding_count: findings.length,
    findings_past_date_count: overdueFindings.length,
    non_claimable_input_g: nonClaimable,
    closed_on: iso(period.closed_on),
    cut_off: iso(period.cut_off),
    closed_by: period.closed_by,
    metered_kwh: Number(period.metered_kwh),
    read_at: new Date().toISOString(),
  };

  for (const cat of CATEGORIES) {
    const t = totals[cat];
    const co = carryOver(t.credits_in_g, t.credits_available_g, Number(period.carry_over_limit_bp));
    out.categories[cat] = {
      credits_in_g: t.credits_in_g,
      credits_out_g: t.credits_out_g,
      credits_available_g: t.credits_available_g,
      inbound_credits_g: t.inbound_credits_g,
      total_credit_held_g: t.total_credit_held_g,
      inbound_credits: t.movements.filter((m) => m.kind === 'transfer_in').map((m) => ({
        reference: m.ref, mass_g: m.mass_g, origin_site: m.origin_site, movement: 'transfer', fresh_credit: false,
      })),
      carried_forward_g: period.state === 'closed' ? co.carried_forward_g : null,
      expired_g: period.state === 'closed' ? co.expired_g : null,
      carry_over_cap_g: co.cap_g,
      movements: t.movements,
      derivation: {
        credits_in_g: `sum of ${t.movements.filter((m) => m.direction === 'in').length} inbound movements`,
        credits_out_g: `sum of ${t.movements.filter((m) => m.direction === 'out').length} outbound movements`,
        credits_available_g: 'credits_in_g minus credits_out_g, per category, never netted across categories',
      },
    };
  }
  return out;
}

export async function lotClaim(lotReference) {
  const lot = (await q('SELECT * FROM lot WHERE reference = $1', [lotReference]))[0];
  if (!lot) return null;
  const movements = await q(
    "SELECT * FROM credit_movement WHERE lot = $1 AND direction = 'out' AND kind = 'allocation'", [lotReference]);
  const split = {};
  let attached = 0;
  for (const m of movements) {
    split[m.category] = (split[m.category] || 0) + Number(m.mass_g);
    attached += Number(m.mass_g);
  }
  return {
    lot: lot.reference,
    lot_mass_g: Number(lot.mass_g),
    credit_attached_g: attached,
    content_bp: contentBp(attached, Number(lot.mass_g)),
    category_split: split,
    claim_type: lot.claim_type,
    derivation: `credit_attached_g ${attached} * 10000 / lot_mass_g ${lot.mass_g}, floored`,
  };
}

export { CATEGORIES };
