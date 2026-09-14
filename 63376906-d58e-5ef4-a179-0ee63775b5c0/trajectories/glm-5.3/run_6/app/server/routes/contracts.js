import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore, refusePagination } from '../lib/idem.js';
import { floorDiv } from '../lib/units.js';

export async function register({ app, pool }) {
  app.get('/api/contracts', async (c) => {
    refusePagination(c.req.query());
    requireSession(c);
    const rows = (await pool.query(`SELECT * FROM contracts ORDER BY id`)).rows;
    const out = [];
    for (const ct of rows) {
      const allocs = (await pool.query(`SELECT * FROM allocations WHERE contract=$1 ORDER BY id`, [ct.id])).rows;
      const site = (await pool.query(`SELECT confidence FROM sites WHERE reference=$1`, [ct.site])).rows[0];
      let delivered_g = 0, weighted = 0;
      for (const a of allocs) {
        const lot = (await pool.query(`SELECT mass_g FROM lots WHERE reference=$1`, [a.lot])).rows[0];
        const attached = (await pool.query(`SELECT COALESCE(SUM(mass_g),0)::int AS s FROM credit_movements WHERE lot=$1 AND direction='out'`, [a.lot])).rows[0].s;
        if (lot) { delivered_g += a.mass_g || lot.mass_g; weighted += attached; }
      }
      out.push({
        id: ct.id, recipient: ct.recipient, site: ct.site, period: ct.period,
        committed_kg: ct.committed_kg, floor_bp: ct.floor_bp,
        delivered_kg: Math.floor(delivered_g / 1000),
        running_content_bp: delivered_g > 0 ? floorDiv(weighted * 10000, delivered_g) : 0,
        shortfall_consequence: ct.shortfall_consequence,
        state: ct.unreachable_on ? 'unreachable' : 'on_track',
        unreachable_on: ct.unreachable_on,
        unreachable_allocation: ct.unreachable_allocation,
        planned_site_flag: site && site.confidence === 'planned',
        flag_dismissible: false
      });
    }
    return c.json(out);
  });

  app.get('/api/contracts/:id/projection', async (c) => {
    const s = requireSession(c);
    const id = c.req.param('id');
    const ct = (await pool.query(`SELECT * FROM contracts WHERE id=$1`, [id])).rows[0];
    if (!ct) throw new HttpError(404, 'contract_not_found');
    const site = (await pool.query(`SELECT * FROM sites WHERE reference=$1`, [ct.site])).rows[0];
    const allocs = (await pool.query(`SELECT * FROM allocations WHERE contract=$1 ORDER BY id`, [ct.id])).rows;
    const committedG = ct.committed_kg * 1000;
    let delivered_g = 0, weighted = 0;
    for (const a of allocs) {
      const lot = (await pool.query(`SELECT mass_g FROM lots WHERE reference=$1`, [a.lot])).rows[0];
      const attached = (await pool.query(`SELECT COALESCE(SUM(mass_g),0)::int AS s FROM credit_movements WHERE lot=$1 AND direction='out'`, [a.lot])).rows[0].s;
      if (lot) { delivered_g += a.mass_g || lot.mass_g; weighted += attached; }
    }
    const remaining_g = Math.max(0, committedG - delivered_g);
    const running = delivered_g > 0 ? floorDiv(weighted * 10000, delivered_g) : 0;
    let required = null;
    if (remaining_g > 0) {
      required = floorDiv((committedG * ct.floor_bp) - weighted, remaining_g);
    }
    const unreachable = required != null && required > 10000;
    return c.json({
      contract: id,
      delivered_kg: Math.floor(delivered_g / 1000),
      committed_kg: ct.committed_kg,
      running_content_bp: running,
      floor_bp: ct.floor_bp,
      required_remaining_bp: required,
      state: ct.unreachable_on ? 'unreachable' : (unreachable ? 'on_track' : 'on_track'),
      unreachable_on: ct.unreachable_on,
      unreachable_allocation: ct.unreachable_allocation,
      required_remaining_reachable: required == null || required <= 10000,
      planned_site_flag: site.confidence === 'planned',
      flag_dismissible: false,
      shortfall_consequence: ct.shortfall_consequence,
      derivation: {
        running_content_bp: 'sum of attached credit over delivered mass, floored',
        required_remaining_bp: '(committed_kg * floor_bp - attached credit so far) / remaining mass, floored'
      }
    });
  });

  app.post('/api/contracts/:id/allocations', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('claims_manager')) throw new HttpError(403, 'claims_manager_required');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    if (!body.lot) throw new HttpError(403, 'lot_required');
    if (!body.decided_by) throw new HttpError(400, 'decided_by_required', {
      message: 'A short-supply allocation names the person who decided and the contracts that went without.'
    });
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `contracts:${id}:allocations`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const ct = (await client.query(`SELECT * FROM contracts WHERE id=$1`, [id])).rows[0];
      if (!ct) throw new HttpError(404, 'contract_not_found');
      const existing = (await client.query(`SELECT id FROM allocations WHERE lot=$1`, [body.lot])).rows;
      if (existing.length) throw new HttpError(409, 'already_allocated', {
        message: 'A claim already allocated to one contract is refused a second attachment.',
        existing_contract: (await client.query(`SELECT contract FROM allocations WHERE lot=$1`, [body.lot])).rows[0].contract
      });
      const lot = (await client.query(`SELECT * FROM lots WHERE reference=$1`, [body.lot])).rows[0];
      if (!lot) throw new HttpError(404, 'lot_not_found');
      const ins = await client.query(
        `INSERT INTO allocations (contract,lot,mass_g,decided_by,favoured_over)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [id, body.lot, body.mass_g != null ? Number(body.mass_g) : lot.mass_g, body.decided_by, JSON.stringify(body.favoured_over || [])]);
      // an unreachable floor is reported, never refused
      const committedG = ct.committed_kg * 1000;
      const allocs = (await client.query(`SELECT * FROM allocations WHERE contract=$1`, [id])).rows;
      let delivered_g = 0, weighted = 0;
      for (const a of allocs) {
        const attached = (await client.query(`SELECT COALESCE(SUM(mass_g),0)::int AS s FROM credit_movements WHERE lot=$1 AND direction='out'`, [a.lot])).rows[0].s;
        const l = (await client.query(`SELECT mass_g FROM lots WHERE reference=$1`, [a.lot])).rows[0];
        if (l) { delivered_g += a.mass_g || l.mass_g; weighted += attached; }
      }
      const remaining = Math.max(0, committedG - delivered_g);
      const required = remaining > 0 ? floorDiv(committedG * ct.floor_bp - weighted, remaining) : null;
      if (required != null && required > 10000 && !ct.unreachable_on) {
        await client.query(`UPDATE contracts SET unreachable_on=CURRENT_DATE, unreachable_allocation=$1 WHERE id=$2`,
          [JSON.stringify({ allocation_id: ins.rows[0].id, decided_by: body.decided_by }), id]);
      }
      await record(client, { kind: 'contract_allocation', object_ref: id, actor: s.email, content: { lot: body.lot, decided_by: body.decided_by, favoured_over: body.favoured_over || [] } });
      const response = { id: ins.rows[0].id, contract: id, lot: body.lot, decided_by: body.decided_by, favoured_over: body.favoured_over || [] };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });
}
