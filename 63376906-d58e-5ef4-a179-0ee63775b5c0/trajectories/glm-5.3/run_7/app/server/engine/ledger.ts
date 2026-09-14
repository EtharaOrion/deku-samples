// Ledger: a balance is the sum of its movements, never a held total.
import type { Pool } from 'pg';
import { dryMassG, creditG, contentBp, sum } from './arithmetic';

export type CategoryBalance = {
  credits_in_g: number;
  credits_out_g: number;
  credits_available_g: number;
  derivation: { movements: string[] };
};

export type BalancePeriodView = {
  id: string;
  site: string;
  grade: string;
  period: { from: string; to: string };
  state: 'open' | 'closed';
  allocation_basis: string;
  post_consumer: CategoryBalance;
  pre_consumer: CategoryBalance;
  non_claimable_input_g: { value: number; derivation: string[] };
  conversion_factors: any[];
  carry_over_limit_bp: number;
  override_count: { value: number; derivation: string[] };
  open_restatement_count: { value: number; derivation: string[] };
  open_finding_count: { value: number; derivation: string[] };
  carry_over?: any;
  closed_on?: string | null;
  cut_off?: string | null;
  read_at: string;
};

export async function periodBalance(db: Pool, periodId: string): Promise<BalancePeriodView | null> {
  const p = (await db.query('SELECT * FROM balance_periods WHERE id=$1', [periodId])).rows[0];
  if (!p) return null;
  const movements = (await db.query('SELECT * FROM credit_movements WHERE period=$1 ORDER BY recorded_at, reference', [periodId])).rows;

  const cat = (category: string): CategoryBalance => {
    // A transfer is never a fresh credit and never a claim leaving, so it is
    // reported as inbound credit beside the ledger rather than inside it.
    const rows = movements.filter((m: any) => m.category === category && !m.movement);
    const ins = rows.filter((m: any) => m.direction === 'in');
    const outs = rows.filter((m: any) => m.direction === 'out');
    return {
      credits_in_g: sum(ins.map((m: any) => Number(m.mass_g))),
      credits_out_g: sum(outs.map((m: any) => Number(m.mass_g))),
      credits_available_g: sum(ins.map((m: any) => Number(m.mass_g))) - sum(outs.map((m: any) => Number(m.mass_g))),
      derivation: { movements: rows.map((m: any) => m.reference) }
    };
  };

  const nonClaimable = await db.query(
    `SELECT COALESCE(SUM(c.mass_g),0) AS g FROM consumptions c
     JOIN batches b ON b.reference=c.batch
     WHERE c.effective_on BETWEEN $1 AND $2
       AND NOT EXISTS (
         SELECT 1 FROM approval_periods ap
         WHERE ap.collector=b.collector AND ap.state IN ('approved','conditional')
           AND b.received_on BETWEEN ap.valid_from AND ap.valid_to)`,
    [p.period_from, p.period_to]
  );

  const overrides = await db.query(
    `SELECT COUNT(*)::int AS n FROM overrides o JOIN lots l ON l.reference=o.lot
     WHERE l.site=$1 AND o.authorised_on BETWEEN $2 AND $3`,
    [p.site, p.period_from, p.period_to]
  );
  const restatements = await db.query(
    `SELECT COUNT(*)::int AS n FROM restatements WHERE period=$1 AND state='open'`,
    [periodId]
  );
  const findings = await db.query(
    `SELECT COUNT(*)::int AS n FROM findings WHERE state='open' AND opened_on BETWEEN $1 AND $2`,
    [p.period_from, p.period_to]
  );
  const factors = await db.query(
    `SELECT * FROM conversion_factors WHERE site=$1 AND superseded_by IS NULL ORDER BY published_on DESC`,
    [p.site]
  );

  const view: BalancePeriodView = {
    id: p.id,
    site: p.site,
    grade: p.grade,
    period: { from: p.period_from, to: p.period_to },
    state: p.state,
    allocation_basis: p.allocation_basis,
    post_consumer: cat('post_consumer'),
    pre_consumer: cat('pre_consumer'),
    non_claimable_input_g: { value: Number(nonClaimable.rows[0].g), derivation: ['consumptions of batches with no approval in force on receipt'] },
    inbound_credits: movements.filter((m: any) => m.movement && m.direction === 'in').map((m: any) => ({
      reference: m.reference, mass_g: Number(m.mass_g), origin_site: m.origin_site, movement: m.movement, category: m.category, fresh_credit: false
    })),
    transfers_out: movements.filter((m: any) => m.movement && m.direction === 'out').map((m: any) => ({
      reference: m.reference, mass_g: Number(m.mass_g), movement: m.movement, category: m.category
    })),
    conversion_factors: factors.rows.map((f: any) => ({
      reference: f.reference,
      factor_bp: f.factor_bp,
      derived_from: f.derived_from,
      derived_to: f.derived_to,
      derived_in_g: Number(f.derived_in_g),
      derived_out_g: Number(f.derived_out_g),
      provisional: f.provisional,
      derivation_window: f.derived_from ? { from: f.derived_from, to: f.derived_to } : null
    })),
    carry_over_limit_bp: p.carry_over_limit_bp,
    override_count: { value: overrides.rows[0].n, derivation: ['overrides authorised inside the period on lots of this site'] },
    open_restatement_count: { value: restatements.rows[0].n, derivation: ['restatements open against this period'] },
    open_finding_count: { value: findings.rows[0].n, derivation: ['collector findings opened inside the period'] },
    closed_on: p.closed_on,
    cut_off: p.cut_off,
    read_at: new Date().toISOString()
  };

  if (p.state === 'closed') {
    const limit = p.carry_over_limit_bp;
    const carry = (c: CategoryBalance) => ({
      carried_forward_g: Math.min(c.credits_available_g, Math.floor((c.credits_in_g * limit) / 10000)),
      expired_g: Math.max(0, c.credits_available_g - Math.floor((c.credits_in_g * limit) / 10000))
    });
    view.carry_over = {
      post_consumer: carry(view.post_consumer),
      pre_consumer: carry(view.pre_consumer)
    };
  }
  return view;
}

// A transfer moves credit between sites. It is never a fresh credit and the
// total across the two periods is unchanged by the journey.
export async function tryTransferOut(
  db: Pool,
  fromPeriod: string,
  toPeriod: string,
  category: string,
  massG: number,
  who: string
): Promise<{ ok: true; transfer: string } | { ok: false; available_g: number; requested_g: number }> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['alloc:' + fromPeriod + ':' + category]);
    const p = (await client.query('SELECT * FROM balance_periods WHERE id=$1 FOR UPDATE', [fromPeriod])).rows[0];
    if (!p) throw Object.assign(new Error('period_not_found'), { status: 404 });
    if (p.state === 'closed') throw Object.assign(new Error('period_closed'), { status: 409, code: 'period_closed' });

    const movements = (await client.query('SELECT * FROM credit_movements WHERE period=$1 AND category=$2 AND movement IS NULL', [fromPeriod, category])).rows;
    const avail = movements.reduce((a: number, m: any) => a + (m.direction === 'in' ? Number(m.mass_g) : -Number(m.mass_g)), 0);
    if (massG > avail) {
      await client.query('COMMIT');
      return { ok: false, available_g: avail, requested_g: massG };
    }

    const tref = 'TRF-' + String(Number((await client.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),'')::bigint,0)+1 AS n FROM transfers")).rows[0].n)).padStart(4, '0');
    await client.query(`INSERT INTO transfers (reference,from_period,to_period,mass_g,category,moved_on) VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)`,
      [tref, fromPeriod, toPeriod, massG, category]);
    const mref = 'CRM-' + String(Number((await client.query(`SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),'')::bigint),0)+1 AS n FROM credit_movements`)).rows[0].n)).padStart(4, '0');
    await client.query(
      `INSERT INTO credit_movements (reference,period,category,direction,mass_g,reason,movement,effective_on)
       VALUES ($1,$2,$3,'out',$4,$5,$6,CURRENT_DATE)`,
      [mref, fromPeriod, category, massG, `Credit moved to ${toPeriod} by inter-site transfer ${tref}.`, tref]
    );
    await client.query('COMMIT');
    return { ok: true, transfer: tref };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
// The invariant: credits attached never exceed credits available. Refused, not warned.
export async function tryAllocate(
  db: Pool,
  periodId: string,
  lot: string,
  category: string,
  massG: number,
  who: string
): Promise<{ ok: true; movement: string; content_bp: number } | { ok: false; available_g: number; requested_g: number }> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['alloc:' + periodId + ':' + category]);
    const p = (await client.query('SELECT * FROM balance_periods WHERE id=$1 FOR UPDATE', [periodId])).rows[0];
    if (!p) throw Object.assign(new Error('period_not_found'), { status: 404 });
    if (p.state === 'closed') throw Object.assign(new Error('period_closed'), { status: 409, code: 'period_closed' });
    const lotRow = (await client.query('SELECT * FROM lots WHERE reference=$1', [lot])).rows[0];
    if (!lotRow) throw Object.assign(new Error('lot_not_found'), { status: 404 });
    if (lotRow.site !== p.site) throw Object.assign(new Error('lot_site_mismatch'), { status: 409, code: 'lot_site_mismatch' });

    const movements = (await client.query('SELECT * FROM credit_movements WHERE period=$1 AND category=$2 AND movement IS NULL', [periodId, category])).rows;
    const avail = sum(movements.filter((m: any) => m.direction === 'in').map((m: any) => Number(m.mass_g))) -
      sum(movements.filter((m: any) => m.direction === 'out').map((m: any) => Number(m.mass_g)));

    if (massG > avail) {
      await client.query('COMMIT');
      return { ok: false, available_g: avail, requested_g: massG };
    }

    const ref = 'CRM-' + String(Number((await client.query(`SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),'')::bigint),0)+1 AS n FROM credit_movements`)).rows[0].n)).padStart(4, '0');
    await client.query(
      `INSERT INTO credit_movements (reference,period,category,direction,mass_g,reason,lot,effective_on)
       VALUES ($1,$2,$3,'out',$4,$5,$6,$7)`,
      [ref, periodId, category, massG, 'Claim attached to lot ' + lot + ' by ' + who, lot, new Date().toISOString().slice(0, 10)]
    );
    const attachedRows = (await client.query(
      `SELECT COALESCE(SUM(mass_g),0) AS g FROM credit_movements WHERE lot=$1 AND category=$2 AND direction='out'`,
      [lot, category]
    )).rows;
    const attached = Number(attachedRows[0].g);
    await client.query('COMMIT');
    return { ok: true, movement: ref, content_bp: contentBp(attached, Number(lotRow.mass_g)) };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
