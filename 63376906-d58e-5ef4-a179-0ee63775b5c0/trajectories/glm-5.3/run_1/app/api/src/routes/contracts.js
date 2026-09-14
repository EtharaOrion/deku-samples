import { Hono } from 'hono';
import { q, one, client } from '../db.js';
import { requireAuth, requireRole, bad, notFound, conflict, forbidden, reqField, intField, rememberIdempotency, refusePagination } from '../lib/http.js';
import { entry } from '../record.js';
import { requiredRemainingBp, contentBp, floorDiv } from '../engine/int.js';

const r = new Hono();

r.get('/api/contracts', async (c) => {
  refusePagination(c);
  await requireAuth(c);
  const rows = await q('SELECT * FROM contracts ORDER BY id');
  return c.json(await Promise.all(rows.map(serializeContract)));
});

r.get('/api/contracts/:id', async (c) => {
  await requireAuth(c);
  const x = await one('SELECT * FROM contracts WHERE id=$1', [c.req.param('id')]);
  if (!x) throw notFound('contract_not_found');
  return c.json(await serializeContract(x));
});

async function serializeContract(x) {
  const allocs = await q('SELECT * FROM contract_allocations WHERE contract=$1 ORDER BY id', [x.id]);
  const site = await one('SELECT * FROM sites WHERE reference=$1', [x.site]);
  let delivered = Number(x.delivered_kg);
  let weighted = 0n;
  for (const a of allocs) {
    const lot = await one('SELECT * FROM lots WHERE reference=$1', [a.lot]);
    if (lot) {
      const attached = Number((await one(`SELECT coalesce(sum(mass_g),0)::bigint m FROM credit_movements WHERE lot=$1 AND kind='allocation'`, [a.lot])).m);
      const bp = attached > 0 ? contentBp(attached, Number(lot.mass_g)) : 0;
      weighted += BigInt(Math.floor(Number(lot.mass_g) / 1000)) * BigInt(bp);
    }
  }
  const running = delivered > 0 ? Number(weighted / BigInt(Math.max(delivered, 1))) : 0;
  const required = requiredRemainingBp(Number(x.committed_kg), x.floor_bp, delivered, running);
  const unreachable = required > 10000;
  return {
    id: x.id, recipient: x.recipient, site: x.site, period: x.period,
    committed_kg: Number(x.committed_kg), floor_bp: x.floor_bp,
    delivered_kg: delivered, running_content_bp: running,
    required_remaining_bp: required,
    state: unreachable ? 'unreachable' : 'on_track',
    unreachable_on: unreachable ? (x.unreachable_on ? isoD(x.unreachable_on) : isoD(new Date())) : null,
    allocation_that_made_it_so: x.unreachable_allocation || null,
    planned_site_flag: site?.confidence === 'planned',
    flag_dismissible: false,
    shortfall_consequence: x.shortfall_consequence,
    allocations: allocs.map(a => ({ lot: a.lot, decided_by: a.decided_by, favoured_over: a.favoured_over }))
  };
}

const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

r.get('/api/contracts/:id/projection', async (c) => {
  await requireAuth(c);
  const x = await one('SELECT * FROM contracts WHERE id=$1', [c.req.param('id')]);
  if (!x) throw notFound('contract_not_found');
  return c.json(await serializeContract(x));
});

r.post('/api/contracts/:id/allocations', async (c) => {
  const user = await requireRole(c, 'claims_manager');
  const x = await one('SELECT * FROM contracts WHERE id=$1', [c.req.param('id')]);
  if (!x) throw notFound('contract_not_found');
  const b = await c.req.json();
  const lot = reqField(b.lot, 'lot');
  const existing = await one(`SELECT 1 FROM contract_allocations WHERE lot=$1 AND contract<>$2`, [lot, x.id]);
  if (existing) throw conflict('claim_already_allocated_to_contract', { lot, rule: 'a claim already allocated to one contract is refused a second attachment' });
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO contract_allocations (contract, lot, decided_by, favoured_over) VALUES ($1,$2,$3,$4)`,
      [x.id, lot, reqField(b.decided_by, 'decided_by'), JSON.stringify(b.favoured_over || [])]);
    const e = await entry(tx, { person: user.email, site: x.site, object: x.id, act: 'contract_allocation',
      content: { contract: x.id, lot, decided_by: b.decided_by, favoured_over: b.favoured_over || [] } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: `${x.id}:${lot}`, contract: x.id, lot, decided_by: b.decided_by, favoured_over: b.favoured_over || [], record_seq: e.seq });
    return c.json({ reference: `${x.id}:${lot}`, contract: x.id, lot, decided_by: b.decided_by, favoured_over: b.favoured_over || [], record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

export default r;
