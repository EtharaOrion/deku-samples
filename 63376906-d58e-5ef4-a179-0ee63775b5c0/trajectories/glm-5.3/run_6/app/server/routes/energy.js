import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore } from '../lib/idem.js';

export async function register({ app, pool }) {
  app.get('/api/energy-instruments', async (c) => {
    requireSession(c);
    const rows = (await pool.query(`SELECT * FROM energy_instruments ORDER BY reference`)).rows;
    const out = [];
    for (const i of rows) {
      const applied = (await pool.query(`SELECT period, quantity_kwh, retired_on FROM energy_retirements WHERE instrument=$1`, [i.reference])).rows;
      out.push({ ...i, applied });
    }
    return c.json(out);
  });

  app.post('/api/energy-instruments/:reference/retire', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('claims_manager')) throw new HttpError(403, 'claims_manager_required');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    if (!body.period) throw new HttpError(400, 'period_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `energy:${ref}:retire`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const inst = (await client.query(`SELECT * FROM energy_instruments WHERE reference=$1 FOR UPDATE`, [ref])).rows[0];
      if (!inst) throw new HttpError(404, 'instrument_not_found');
      if (inst.state !== 'retired') throw new HttpError(409, 'instrument_not_retired', { message: 'The instrument is not retired.' });
      const total = (await client.query(`SELECT metered_kwh FROM energy_period_totals WHERE period=$1`, [body.period])).rows[0];
      if (!total) throw new HttpError(404, 'period_not_found');
      const already = (await client.query(`SELECT COALESCE(SUM(quantity_kwh),0)::int AS s FROM energy_retirements WHERE period=$1`, [body.period])).rows[0].s;
      const periodYear = Number(body.period.slice(6, 10)) > 50 ? 2026 : 2026;
      const consumptionYear = Number((body.consumption_year || 2026));
      if (inst.vintage !== consumptionYear) throw new HttpError(409, 'vintage_mismatch', {
        message: 'The instrument vintage does not match the consumption.',
        instrument_vintage: inst.vintage, consumption_year: consumptionYear
      });
      if (body.region && inst.region !== body.region) throw new HttpError(409, 'region_mismatch', {
        message: 'The instrument region does not match the consumption.',
        instrument_region: inst.region, requested_region: body.region
      });
      if (already + inst.quantity_kwh > total.metered_kwh) throw new HttpError(409, 'exceeds_metered', {
        message: 'The retired quantity would exceed the metered consumption.',
        metered_kwh: total.metered_kwh, retired_so_far_kwh: already, instrument_kwh: inst.quantity_kwh
      });
      await client.query(`INSERT INTO energy_retirements (instrument,period,quantity_kwh,retired_on) VALUES ($1,$2,$3,CURRENT_DATE)`,
        [ref, body.period, inst.quantity_kwh]);
      await record(client, { kind: 'energy_retired', object_ref: ref, actor: s.email, content: { period: body.period, quantity_kwh: inst.quantity_kwh } });
      const unmatched = total.metered_kwh - already - inst.quantity_kwh;
      const response = { instrument: ref, period: body.period, retired_kwh: inst.quantity_kwh, unmatched_kwh: unmatched };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });
}
