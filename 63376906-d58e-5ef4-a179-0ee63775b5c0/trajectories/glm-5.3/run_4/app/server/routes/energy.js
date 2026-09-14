import { Hono } from 'hono';
import { q, tx } from '../db.js';
import { requireSession } from '../auth.js';
import { idempotent, readBody, refuse, recordTx, requireKeys } from '../lib/http.js';
import { nowIso } from '../lib/util.js';

const energy = new Hono();
energy.use('*', requireSession());

energy.get('/lots/:reference/carbon', async (c) => {
  const lot = (await q('SELECT * FROM lot WHERE reference = $1', [c.req.param('reference')])).rows[0];
  if (!lot) return c.json({ error: 'not_found' }, 404);
  const fig = (await q('SELECT * FROM carbon_figure WHERE lot = $1 AND superseded = false ORDER BY version DESC LIMIT 1', [lot.reference])).rows[0];
  if (!fig) return c.json({ error: 'no_carbon_figure' }, 404);
  const method = (await q('SELECT * FROM carbon_method WHERE id = $1 AND version = $2', [fig.method_id, fig.method_version])).rows[0];
  const period = (await q(`SELECT * FROM balance_period WHERE site = $1 AND $2 BETWEEN period_from AND period_to`, [lot.site, nowIso().slice(0, 10)])).rows[0];
  if (period && method && period.allocation_basis !== method.allocation_basis) {
    refuse(409, 'allocation_basis_mismatch', {
      period_basis: period.allocation_basis, method_basis: method.allocation_basis,
      message: 'The allocation basis is held once per period and applies to both the ledger and the carbon method.'
    });
  }
  return c.json({
    lot: lot.reference,
    value_mg_per_kg: Number(fig.value_mg_per_kg),
    boundary: fig.boundary,
    method_version: fig.method_id + ' v' + fig.method_version,
    uncertainty_bp: Number(fig.uncertainty_bp),
    comparator: fig.comparator,
    primary_share_bp: Number(fig.primary_share_bp),
    breakdown: fig.breakdown,
    default_led: Number(fig.primary_share_bp) < 5000,
    energy_location_mg_per_kg: fig.energy_location_mg_per_kg === null ? null : Number(fig.energy_location_mg_per_kg),
    energy_market_mg_per_kg: fig.energy_market_mg_per_kg === null ? null : Number(fig.energy_market_mg_per_kg),
    cache_valid: fig.cache_valid,
    input_versions: fig.input_versions,
    breakdown_always_present: true
  });
});

energy.get('/instruments', async (c) => {
  const r = await q('SELECT * FROM energy_instrument ORDER BY reference');
  return c.json(r.rows.map((i) => ({ reference: i.reference, quantity_kwh: Number(i.quantity_kwh), vintage: i.vintage, region: i.region, state: i.state })));
});

energy.post('/energy-instruments/:reference/retire', async (c) => {
  const user = c.get('user');
  if (!['claims_manager', 'quality_manager'].includes(user.role)) refuse(403, 'forbidden');
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['balance_period', 'quantity_kwh']);
    const inst = (await q('SELECT * FROM energy_instrument WHERE reference = $1', [c.req.param('reference')])).rows[0];
    if (!inst) refuse(404, 'not_found');
    if (inst.state !== 'retired') refuse(409, 'instrument_not_retired', { message: 'It is refused when the instrument is not retired.' });
    if (String(inst.vintage) !== String(body.vintage || '2026')) refuse(409, 'vintage_mismatch', { instrument_vintage: inst.vintage, consumption_vintage: body.vintage });
    if (inst.region !== (body.region || 'EU-27')) refuse(409, 'region_mismatch', { instrument_region: inst.region, consumption_region: body.region });
    const metered = 300000;
    const already = (await q('SELECT COALESCE(SUM(retired_kwh),0)::bigint AS m FROM energy_retirement WHERE balance_period = $1', [body.balance_period])).rows[0].m;
    if (Number(already) + Number(body.quantity_kwh) > metered) {
      refuse(409, 'exceeds_metered', { metered_kwh: metered, retired_kwh: Number(already), requested_kwh: Number(body.quantity_kwh) });
    }
    return await tx(async (client) => {
      await client.query('INSERT INTO energy_retirement (instrument, balance_period, retired_kwh, retired_on, retired_by, consumption_vintage, consumption_region) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [inst.reference, body.balance_period, Number(body.quantity_kwh), nowIso().slice(0, 10), user.email, body.vintage || '2026', body.region || 'EU-27']);
      await recordTx(client, { user, act: 'energy_retired', object: inst.reference, payload: { retired_kwh: Number(body.quantity_kwh), balance_period: body.balance_period } });
      return { reference: inst.reference, retired_kwh: Number(body.quantity_kwh), unmatched_kwh: metered - Number(already) - Number(body.quantity_kwh) };
    });
  });
});

export default energy;
