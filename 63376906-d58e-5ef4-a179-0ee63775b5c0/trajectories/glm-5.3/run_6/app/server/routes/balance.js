import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore, refusePagination } from '../lib/idem.js';
import { balanceOf, balanceView, contentOfLot } from '../lib/ledger.js';
import { floorDiv } from '../lib/units.js';

export async function register({ app, pool }) {
  app.get('/api/balance-periods', async (c) => {
    refusePagination(c.req.query());
    requireSession(c);
    const rows = (await pool.query(`SELECT * FROM balance_periods ORDER BY site, period_from`)).rows;
    const read_at = new Date().toISOString();
    const out = [];
    for (const bp of rows) out.push(await balanceView(pool, bp, read_at));
    return c.json(out);
  });

  app.get('/api/balance-periods/:id', async (c) => {
    refusePagination(c.req.query());
    requireSession(c);
    const bp = (await pool.query(`SELECT * FROM balance_periods WHERE id=$1`, [c.req.param('id')])).rows[0];
    if (!bp) throw new HttpError(404, 'balance_period_not_found');
    return c.json(await balanceView(pool, bp, new Date().toISOString()));
  });

  // Allocations: refused rather than warned about when the margin cannot carry it.
  app.post('/api/balance-periods/:id/allocations', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('claims_manager')) throw new HttpError(403, 'claims_manager_required');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    if (!body.lot || !body.category || body.mass_g == null) throw new HttpError(400, 'lot_category_mass_g_required');
    if (!['post_consumer','pre_consumer'].includes(body.category)) throw new HttpError(400, 'invalid_category');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `balance:${id}:allocations`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      // lock the ledger rows so two racing allocations serialise
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`ledger:${id}`]);
      const bp = (await client.query(`SELECT * FROM balance_periods WHERE id=$1`, [id])).rows[0];
      if (!bp) throw new HttpError(404, 'balance_period_not_found');
      if (bp.state === 'closed') throw new HttpError(409, 'period_closed', { message: 'This period is closed. Corrections require a restatement.' });
      const lot = (await client.query(`SELECT * FROM lots WHERE reference=$1`, [body.lot])).rows[0];
      if (!lot) throw new HttpError(404, 'lot_not_found');
      if (lot.site !== bp.site) throw new HttpError(409, 'lot_site_mismatch');
      const bal = await balanceOf(client, id);
      const requested = Number(body.mass_g);
      const available = bal.per[body.category].credits_available_g;
      if (requested > available) {
        await record(client, {
          kind: 'allocation_refused', object_ref: id, actor: s.email, site: bp.site,
          content: { lot: body.lot, category: body.category, available_g: available, requested_g: requested, margin_at_instant: available }
        });
        throw new HttpError(409, 'insufficient_credits', {
          message: 'This allocation is refused. Available: ' + available + ' g. Requested: ' + requested + ' g.',
          available_g: available,
          requested_g: requested
        });
      }
      const attachedNow = await contentOfLot(client, body.lot);
      if (attachedNow.attached.post_consumer + attachedNow.attached.pre_consumer + requested > lot.mass_g) {
        throw new HttpError(409, 'exceeds_lot_mass', {
          message: 'The allocation would attach more credit than the lot has mass.',
          lot_mass_g: lot.mass_g
        });
      }
      const ins = await client.query(
        `INSERT INTO credit_movements (period,category,direction,mass_g,kind,lot,effective_on)
         VALUES ($1,$2,'out',$3,'allocation',$4,CURRENT_DATE) RETURNING id`,
        [id, body.category, requested, body.lot]);
      await record(client, {
        kind: 'allocation_made', object_ref: id, actor: s.email, site: bp.site,
        content: { lot: body.lot, category: body.category, mass_g: requested, movement_id: ins.rows[0].id }
      });
      const after = await contentOfLot(client, body.lot);
      const response = {
        period: id, lot: body.lot, category: body.category, mass_g: requested,
        movement_id: ins.rows[0].id,
        content_bp: after.content_bp,
        credit_attached: after.attached,
        credits_available_g: (await balanceOf(client, id)).per[body.category].credits_available_g
      };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.post('/api/balance-periods/:id/transfers', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('claims_manager')) throw new HttpError(403, 'claims_manager_required');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    if (!body.to_period || body.mass_g == null || !body.category) throw new HttpError(400, 'to_period_mass_category_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `balance:${id}:transfers`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)), pg_advisory_xact_lock(hashtext($2))`, [`ledger:${id}`, `ledger:${body.to_period}`]);
      const from = (await client.query(`SELECT * FROM balance_periods WHERE id=$1`, [id])).rows[0];
      const to = (await client.query(`SELECT * FROM balance_periods WHERE id=$1`, [body.to_period])).rows[0];
      if (!from || !to) throw new HttpError(404, 'balance_period_not_found');
      if (from.state === 'closed' || to.state === 'closed') throw new HttpError(409, 'period_closed');
      const bal = await balanceOf(client, id);
      const mass = Number(body.mass_g);
      if (mass > bal.per[body.category].credits_available_g) {
        throw new HttpError(409, 'insufficient_credits', {
          available_g: bal.per[body.category].credits_available_g, requested_g: mass
        });
      }
      const n = (await client.query(`SELECT count(*)::int AS n FROM transfers`)).rows[0].n + 1;
      const ref = `TRF-${String(n).padStart(4, '0')}`;
      await client.query(`INSERT INTO transfers (reference,from_period,to_period,mass_g,category,effective_on,recorded_by)
        VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,$6)`, [ref, id, body.to_period, mass, body.category, s.email]);
      await client.query(`INSERT INTO credit_movements (period,category,direction,mass_g,kind,origin_site,movement_ref,effective_on)
        VALUES ($1,$2,'out',$3,'transfer_out',NULL,$4,CURRENT_DATE)`, [id, body.category, mass, ref]);
      await client.query(`INSERT INTO credit_movements (period,category,direction,mass_g,kind,origin_site,movement_ref,effective_on)
        VALUES ($1,$2,'in',$3,'transfer_in',$4,$5,CURRENT_DATE)`, [body.to_period, body.category, mass, from.site, ref]);
      await record(client, { kind: 'transfer_recorded', object_ref: ref, actor: s.email, site: from.site, content: { from: id, to: body.to_period, mass_g: mass } });
      // receiving period answers inbound_credits
      const inbounds = (await client.query(
        `SELECT m.movement_ref, m.mass_g, b.site AS origin_site, m.movement_ref AS movement, false AS fresh_credit
         FROM credit_movements m JOIN balance_periods b ON b.id=$1
         WHERE m.period=$1 AND m.kind='transfer_in'`, [body.to_period])).rows;
      const response = {
        reference: ref, from_period: id, to_period: body.to_period, mass_g: mass, category: body.category,
        inbound_credits: inbounds.map((x) => ({ reference: x.movement_ref, mass_g: x.mass_g, origin_site: x.origin_site, movement: x.movement_ref, fresh_credit: false })),
        total_credit_unchanged: true
      };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.post('/api/balance-periods/:id/close', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('claims_manager')) throw new HttpError(403, 'claims_manager_required');
    const id = c.req.param('id');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `balance:${id}:close`, {});
      if (guard.replay) return c.json(guard.response, guard.status);
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`ledger:${id}`]);
      const bp = (await client.query(`SELECT * FROM balance_periods WHERE id=$1`, [id])).rows[0];
      if (!bp) throw new HttpError(404, 'balance_period_not_found');
      if (bp.state === 'closed') throw new HttpError(409, 'period_closed', { message: 'This period is closed and refuses to reopen.' });
      // separation: whoever published the carbon method version does not close the period applying it
      const method = (await client.query(`SELECT * FROM carbon_methods ORDER BY version DESC LIMIT 1`)).rows[0];
      if (method && method.reviewer === s.email) {
        throw new HttpError(403, 'publisher_not_closer', {
          message: 'Whoever published the carbon method version may not close the period applying it.'
        });
      }
      // every lot in the period needs a disposition
      const lots = (await client.query(`SELECT * FROM lots WHERE site=$1 AND grade=$2`, [bp.site, bp.grade])).rows;
      const pending = lots.filter((l) => l.disposition === 'pending');
      if (pending.length) throw new HttpError(409, 'lot_without_disposition', {
        message: 'Every lot in the period must carry a disposition before the period closes.',
        lots: pending.map((l) => l.reference)
      });
      // no open deviation touching any lot in the period
      const devs = (await client.query(`SELECT * FROM deviations WHERE state='open'`)).rows;
      const lotRefs = lots.map((l) => l.reference);
      const openTouching = devs.filter((d) => Array.isArray(d.subjects) && d.subjects.some((x) => lotRefs.includes(x) || x === bp.site));
      if (openTouching.length) throw new HttpError(409, 'open_deviation', {
        message: 'A deviation touching this period is open.',
        deviations: openTouching.map((d) => d.reference)
      });
      // balance must reconcile: available never negative
      const bal = await balanceOf(client, id);
      const negative = Object.keys(bal.per).filter((k) => bal.per[k].credits_available_g < 0);
      if (negative.length) throw new HttpError(409, 'balance_does_not_reconcile', {
        message: 'The balance does not reconcile.', categories: negative
      });
      // settle the carry-over
      const carried = {}, expired = {};
      for (const cat of ['post_consumer','pre_consumer']) {
        const limit = floorDiv(bal.per[cat].credits_in_g * bp.carry_over_limit_bp, 10000);
        const avail = bal.per[cat].credits_available_g;
        const carry = Math.min(avail, limit);
        carried[cat] = Math.max(0, carry);
        expired[cat] = Math.max(0, avail - carry);
      }
      await client.query(`UPDATE balance_periods SET state='closed', closed_on=CURRENT_DATE,
        cut_off=CURRENT_DATE - 5, carried_forward_g=$1, expired_g=$2 WHERE id=$3`,
        [JSON.stringify(carried), JSON.stringify(expired), id]);
      await record(client, { kind: 'period_closed', object_ref: id, actor: s.email, site: bp.site, content: { carried_forward_g: carried, expired_g: expired } });
      const response = {
        id, state: 'closed', closed_on: new Date().toISOString().slice(0, 10),
        cut_off: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10),
        carried_forward_g: carried, expired_g: expired
      };
      await idemStore(client, guard, 200, response);
      return c.json(response);
    });
  });
}
