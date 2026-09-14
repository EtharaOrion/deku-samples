import { Hono } from 'hono';
import { q, tx } from '../db.js';
import { requireSession } from '../auth.js';
import { idempotent, readBody, refuse, recordTx, requireKeys, intOr } from '../lib/http.js';
import { nowIso, floorDiv } from '../lib/util.js';

const factors = new Hono();
factors.use('*', requireSession());

factors.get('/', async (c) => {
  const r = await q('SELECT * FROM conversion_factor ORDER BY site, published_on');
  return c.json(r.rows.map((f) => ({
    reference: f.reference, site: f.site, factor_bp: f.factor_bp, derived_from: f.derived_from,
    derived_to: f.derived_to, derived_in_g: Number(f.derived_in_g), derived_out_g: Number(f.derived_out_g),
    provisional: f.provisional, published_by: f.published_by, published_on: f.published_on
  })));
});

factors.post('/', async (c) => {
  const user = c.get('user');
  if (!['claims_manager', 'quality_manager'].includes(user.role)) {
    refuse(403, 'forbidden', { message: 'A claims manager publishes a conversion factor.' });
  }
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['site', 'factor_bp', 'derived_from', 'derived_to', 'derived_in_g', 'derived_out_g']);
    const inG = intOr(body.derived_in_g);
    const outG = intOr(body.derived_out_g);
    const provisional = inG === 0;
    if (!provisional) {
      const check = floorDiv(outG * 10000, inG);
      if (intOr(body.factor_bp) !== check) {
        refuse(409, 'factor_does_not_reconcile', {
          factor_bp: intOr(body.factor_bp), arithmetic: check,
          message: 'The factor is refused unless factor_bp equals derived_out_g * 10000 / derived_in_g, floored. A factor is always the arithmetic of a stated window rather than a number somebody chose.'
        });
      }
    }
    return await tx(async (client) => {
      const r = await client.query('INSERT INTO ref_seq (kind, n) VALUES ($1, 1) ON CONFLICT (kind) DO UPDATE SET n = ref_seq.n + 1 RETURNING n', ['cf_' + body.site]);
      const ref = 'CF-' + String(body.site).replace('SITE-', '') + '-' + r.rows[0].n;
      await client.query(
        `INSERT INTO conversion_factor (reference, site, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [ref, body.site, intOr(body.factor_bp), body.derived_from, body.derived_to, inG, outG, provisional, user.email, nowIso().slice(0, 10)]
      );
      await recordTx(client, { user, act: 'conversion_factor_published', object: ref, site: body.site, payload: { factor_bp: intOr(body.factor_bp), provisional } });
      return { reference: ref, factor_bp: intOr(body.factor_bp), provisional };
    });
  });
});

// ---- sites certification with backward reach ----
export async function siteCertification(c) {
  const user = c.get('user');
  if (user.role !== 'quality_manager') refuse(403, 'forbidden');
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['state', 'effective_from']);
    const site = (await q('SELECT * FROM site WHERE reference = $1', [c.req.param('reference')])).rows[0];
    if (!site) refuse(404, 'not_found');
    const effectiveTo = body.effective_to || null;
    const inWindow = (await q(
      `SELECT * FROM certificate WHERE site = $1 AND $2 <= signed_at::date AND ($3::date IS NULL OR signed_at::date <= $3)`,
      [site.reference, body.effective_from, effectiveTo]
    )).rows;
    const certificatesInWindow = inWindow.map((cert) => ({
      number: cert.number, state: cert.state,
      resolution_required: true,
      outcomes_available: ['reissued', 'withdrawn', 'unaffected']
    }));
    return await tx(async (client) => {
      await client.query('INSERT INTO certification_period (site, state, valid_from, valid_to, recorded_on, recorded_by) VALUES ($1,$2,$3,$4,$5,$6)',
        [site.reference, body.state, body.effective_from, effectiveTo, nowIso().slice(0, 10), user.email]);
      await client.query('UPDATE site SET certification_state = $2 WHERE reference = $1', [site.reference, body.state === 'suspended' ? 'suspended' : 'certified']);
      await recordTx(client, { user, act: body.state === 'suspended' ? 'site_suspended' : 'site_certification_recorded', object: site.reference, site: site.reference, payload: { effective_from: body.effective_from, certificates_in_window: inWindow.map((x) => x.number) } });
      return { reference: site.reference, state: body.state, effective_from: body.effective_from, certificates_in_window: certificatesInWindow };
    });
  });
}

// ---- restatements resolutions ----
factors.post('/:reference/resolutions', async (c) => {
  const user = c.get('user');
  if (!['claims_manager', 'quality_manager'].includes(user.role)) refuse(403, 'forbidden');
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['certificate', 'outcome', 'reason']);
    if (!['reissued', 'withdrawn', 'unaffected'].includes(body.outcome)) refuse(400, 'unknown_outcome');
    const rst = (await q('SELECT * FROM restatement WHERE reference = $1', [c.req.param('reference')])).rows[0];
    if (!rst) refuse(404, 'not_found');
    const existing = (await q('SELECT * FROM resolution WHERE restatement = $1 AND certificate = $2', [rst.reference, body.certificate])).rows;
    if (existing.length) {
      refuse(409, 'already_resolved', { message: 'A restatement holds exactly one resolution per affected certificate.' });
    }
    return await tx(async (client) => {
      await client.query('INSERT INTO resolution (restatement, certificate, outcome, reason, resolved_by) VALUES ($1,$2,$3,$4,$5)',
        [rst.reference, body.certificate, body.outcome, body.reason, user.email]);
      await recordTx(client, { user, act: 'restatement_resolved', object: rst.reference, payload: { certificate: body.certificate, outcome: body.outcome } });
      return { reference: rst.reference, certificate: body.certificate, outcome: body.outcome };
    });
  });
});

factors.get('/list', async (c) => {
  const r = await q('SELECT * FROM restatement ORDER BY opened_on DESC');
  return c.json(await Promise.all(r.rows.map(async (x) => {
    const resolutions = await q('SELECT * FROM resolution WHERE restatement = $1', [x.reference]);
    return {
      reference: x.reference, balance_period: x.balance_period, reason: x.reason,
      opened_on: x.opened_on, closed: x.closed,
      content_movements: x.content_movements,
      resolutions: resolutions.rows.map((r2) => ({ certificate: r2.certificate, outcome: r2.outcome, reason: r2.reason }))
    };
  })));
});

export default factors;
