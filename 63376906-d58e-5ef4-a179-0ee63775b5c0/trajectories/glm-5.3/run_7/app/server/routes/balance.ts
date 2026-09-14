// Balance periods, allocations, transfers, close, restatements, conversion factors.
import { Hono } from 'hono';
import { db } from '../dbindex.ts';
import { requireSession, requireRole, deny, readJson, requireFields, rememberIdempotent, noPaginationShared } from '../middleware.js';
import { periodBalance, tryAllocate, tryTransferOut } from '../engine/ledger.js';
import { record } from '../engine/record.js';
import { factorBp } from '../engine/arithmetic.js';

export const balanceRoutes = new Hono();

balanceRoutes.get('/balance-periods', async (c) => {
  await requireSession(c);
  noPaginationShared(c);
  const rows = (await db.query('SELECT id FROM balance_periods ORDER BY period_from, site')).rows;
  const out = [];
  for (const r of rows) out.push(await periodBalance(db, r.id));
  return c.json(out);
});

balanceRoutes.get('/balance-periods/:id', async (c) => {
  await requireSession(c);
  noPaginationShared(c);
  const view = await periodBalance(db, c.req.param('id'));
  if (!view) deny('period_not_found', 'No such balance period.', 404);
  return c.json(view);
});

balanceRoutes.post('/balance-periods/:id/allocations', async (c) => {
  const s = await requireRole(c, ['claims_manager']);
  const body = await readJson(c);
  requireFields(body, ['lot', 'category', 'mass_g']);
  if (!['post_consumer', 'pre_consumer'].includes(body.category)) deny('invalid_category', 'category is post_consumer or pre_consumer; the two are never netted.', 400);
  if (!Number.isInteger(body.mass_g)) deny('no_decimals', 'mass_g must be an integer number of grams.', 400);
  const id = c.req.param('id');

  const result = await tryAllocate(db, id, body.lot, body.category, body.mass_g, s.email);
  if (!result.ok) {
    await record(db, {
      person: s.email, act: 'allocation_refused', object_kind: 'balance_period', object_reference: id,
      detail: { lot: body.lot, category: body.category, requested_g: result.requested_g, available_g: result.available_g }
    });
    return c.json({ error: 'insufficient_credits', message: `This allocation is refused. Available: ${result.available_g} g. Requested: ${result.requested_g} g.`, available_g: result.available_g, requested_g: result.requested_g }, 409);
  }
  await record(db, {
    person: s.email, act: 'allocation_made', object_kind: 'balance_period', object_reference: id,
    detail: { lot: body.lot, category: body.category, mass_g: body.mass_g, movement: result.movement, content_bp: result.content_bp }
  });
  await rememberIdempotent(c, 201, { reference: result.movement, content_bp: result.content_bp });
  return c.json({ reference: result.movement, lot: body.lot, category: body.category, mass_g: body.mass_g, content_bp: result.content_bp }, 201);
});

balanceRoutes.post('/balance-periods/:id/transfers', async (c) => {
  const s = await requireRole(c, ['claims_manager']);
  const body = await readJson(c);
  requireFields(body, ['to_period', 'mass_g', 'category']);
  if (!Number.isInteger(body.mass_g)) deny('no_decimals', 'mass_g must be an integer.', 400);
  const fromId = c.req.param('id');
  const from = (await db.query('SELECT * FROM balance_periods WHERE id=$1', [fromId])).rows[0];
  const to = (await db.query('SELECT * FROM balance_periods WHERE id=$1', [body.to_period])).rows[0];
  if (!from || !to) deny('period_not_found', 'No such balance period.', 404);
  if (from.state === 'closed' || to.state === 'closed') deny('period_closed', 'A closed period refuses every further write.', 409);

  const outResult = await tryTransferOut(db, fromId, to.id, body.category, body.mass_g, s.email);
  if (!outResult.ok) {
    return c.json({ error: 'insufficient_credits', message: `This transfer is refused. Available: ${outResult.available_g} g. Requested: ${outResult.requested_g} g.`, available_g: outResult.available_g, requested_g: outResult.requested_g }, 409);
  }

  const tref = outResult.transfer;
  const mref = 'CRM-' + String(Number((await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),'')::bigint,0)+1 AS n FROM credit_movements")).rows[0].n)).padStart(4, '0');
  await db.query(
    `INSERT INTO credit_movements (reference,period,category,direction,mass_g,reason,origin_site,movement,effective_on)
     VALUES ($1,$2,$3,'in',$4,$5,$6,$7,CURRENT_DATE)`,
    [mref, to.id, body.category, body.mass_g, `Inbound credit from inter-site transfer ${tref}.`, from.site, tref]
  );
  await record(db, { person: s.email, act: 'transfer_made', object_kind: 'transfer', object_reference: tref, detail: { from: fromId, to: to.id, mass_g: body.mass_g, category: body.category } });
  await rememberIdempotent(c, 201, { reference: tref });
  return c.json({
    reference: tref, mass_g: body.mass_g, category: body.category, origin_site: from.site,
    receiving_period: to.id,
    inbound_credits: [{ reference: mref, mass_g: body.mass_g, origin_site: from.site, movement: tref, fresh_credit: false }]
  }, 201);
});

balanceRoutes.get('/balance-periods/:id/transfers', async (c) => {
  await requireSession(c);
  const id = c.req.param('id');
  const rows = (await db.query("SELECT * FROM credit_movements WHERE period=$1 AND origin_site IS NOT NULL AND direction='in' ORDER BY recorded_at", [id])).rows;
  return c.json(rows.map((r: any) => ({
    reference: r.reference, mass_g: Number(r.mass_g), origin_site: r.origin_site, movement: r.movement, fresh_credit: false, category: r.category
  })));
});

balanceRoutes.post('/balance-periods/:id/close', async (c) => {
  const s = await requireRole(c, ['claims_manager']);
  const id = c.req.param('id');
  const p = (await db.query('SELECT * FROM balance_periods WHERE id=$1', [id])).rows[0];
  if (!p) deny('period_not_found', 'No such balance period.', 404);
  if (p.state === 'closed') deny('period_closed', 'A closed period refuses every further write and refuses to reopen.', 409);

  // the publisher of the carbon method version it applies does not close the period
  const method = (await db.query(
    `SELECT * FROM carbon_methods WHERE id LIKE 'CM-%' AND published_by=$1 ORDER BY version DESC LIMIT 1`, [s.email]
  )).rows[0];
  const appliedMethod = (await db.query('SELECT * FROM carbon_methods ORDER BY version DESC LIMIT 1')).rows[0];
  if (method && appliedMethod && method.id === appliedMethod.id && method.version === appliedMethod.version) {
    await record(db, { person: s.email, act: 'refused_period_close_separation', object_kind: 'balance_period', object_reference: id, detail: { separation: 'method_publisher_not_closer' } });
    deny('separation_refused', 'Whoever published the carbon method version this period applies does not close it.', 403);
  }

  // lots without disposition
  const lotsInPeriod = (await db.query(
    `SELECT DISTINCT l.reference, l.disposition FROM lots l
     JOIN credit_movements m ON m.lot=l.reference WHERE m.period=$1`, [id]
  )).rows;
  const missingDisposition = lotsInPeriod.filter((l: any) => l.disposition === 'pending');
  if (missingDisposition.length) {
    await record(db, { person: s.email, act: 'refused_period_close', object_kind: 'balance_period', object_reference: id, detail: { reason: 'lot_without_disposition', lots: missingDisposition.map((l: any) => l.reference) } });
    return c.json({ error: 'lot_without_disposition', message: `Lots without disposition: ${missingDisposition.map((l: any) => l.reference).join(', ')}.`, lots: missingDisposition.map((l: any) => l.reference) }, 409);
  }

  const openDevs = [];
  for (const l of lotsInPeriod) {
    const d = (await db.query(
      `SELECT d.reference FROM deviations d JOIN deviation_subjects ds ON ds.deviation=d.reference
       WHERE d.state='open' AND ds.subject_kind='lot' AND ds.subject=$1 LIMIT 1`, [l.reference]
    )).rows[0];
    if (d) openDevs.push(d.reference);
  }
  if (openDevs.length) {
    await record(db, { person: s.email, act: 'refused_period_close', object_kind: 'balance_period', object_reference: id, detail: { reason: 'open_deviation', deviations: [...new Set(openDevs)] } });
    return c.json({ error: 'open_deviation', message: `Open deviations touching lots in the period: ${[...new Set(openDevs)].join(', ')}.`, deviations: [...new Set(openDevs)] }, 409);
  }

  const view = await periodBalance(db, id);
  const movementsSum = view!.post_consumer.credits_available_g + view!.pre_consumer.credits_available_g;
  const movementCount = (await db.query('SELECT COUNT(*)::int AS n FROM credit_movements WHERE period=$1', [id])).rows[0].n;
  if (movementCount > 0 && movementsSum < 0) {
    await record(db, { person: s.email, act: 'refused_period_close', object_kind: 'balance_period', object_reference: id, detail: { reason: 'balance_does_not_reconcile' } });
    return c.json({ error: 'balance_does_not_reconcile', message: 'The balance does not reconcile.', balance: view }, 409);
  }

  const closedOn = new Date().toISOString().slice(0, 10);
  const cutOff = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  await db.query('UPDATE balance_periods SET state=$1, closed_on=$2, cut_off=$3, closed_by=$4 WHERE id=$5', ['closed', closedOn, cutOff, s.email, id]);
  await record(db, { person: s.email, site: p.site, act: 'period_closed', object_kind: 'balance_period', object_reference: id, detail: { closed_on: closedOn, cut_off: cutOff } });
  const after = await periodBalance(db, id);
  await rememberIdempotent(c, 200, { id, state: 'closed' });
  return c.json({ id, state: 'closed', closed_on: closedOn, cut_off: cutOff, carry_over: after!.carry_over });
});

balanceRoutes.post('/balance-periods/:id/restatements', async (c) => {
  const s = await requireRole(c, ['claims_manager']);
  const body = await readJson(c);
  requireFields(body, ['reason']);
  const id = c.req.param('id');
  const p = (await db.query('SELECT * FROM balance_periods WHERE id=$1', [id])).rows[0];
  if (!p) deny('period_not_found', 'No such balance period.', 404);

  const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM restatements")).rows[0].n;
  const ref = 'RST-' + String(n).padStart(4, '0');
  const certs = (await db.query('SELECT * FROM certificates WHERE period=$1 ORDER BY number', [id])).rows;

  const contentMovements: any[] = [];
  if (body.conversion_factor) {
    const cf = (await db.query('SELECT * FROM conversion_factors WHERE reference=$1', [body.conversion_factor])).rows[0];
    if (!cf) deny('factor_not_found', 'No such conversion factor.', 404);
    for (const cert of certs) {
      const corrected = Math.floor((cert.content_bp * cf.factor_bp) / (await currentFactorBp(db, p.site)));
      contentMovements.push({ certificate: cert.number, content_bp: cert.content_bp, corrected_content_bp: corrected });
    }
  }

  await db.query(
    `INSERT INTO restatements (reference,period,reason,opened_by,opened_on,certificates,content_movements,conversion_factor,state)
     VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,'open')`,
    [ref, id, body.reason, s.email, JSON.stringify(certs.map((x: any) => x.number)), JSON.stringify(contentMovements), body.conversion_factor || null]
  );
  await record(db, { person: s.email, act: 'restatement_opened', object_kind: 'restatement', object_reference: ref, detail: { period: id, reason: body.reason, certificates: certs.map((x: any) => x.number) } });
  await rememberIdempotent(c, 201, { reference: ref });
  return c.json({ reference: ref, period: id, certificates: certs.map((x: any) => x.number), content_movements: contentMovements }, 201);
});

async function currentFactorBp(db: any, site: string): Promise<number> {
  const r = await db.query('SELECT factor_bp FROM conversion_factors WHERE site=$1 AND superseded_by IS NULL ORDER BY published_on DESC LIMIT 1', [site]);
  return r.rows[0] ? Number(r.rows[0].factor_bp) : 10000;
}

balanceRoutes.get('/restatements', async (c) => {
  await requireSession(c);
  const rows = (await db.query('SELECT * FROM restatements ORDER BY opened_at')).rows;
  const out = [];
  for (const r of rows) {
    const resolutions = (await db.query('SELECT * FROM resolutions WHERE restatement=$1 ORDER BY id', [r.reference])).rows;
    out.push({
      reference: r.reference, period: r.period, reason: r.reason, opened_by: r.opened_by, opened_on: r.opened_on,
      certificates: r.certificates, content_movements: r.content_movements, state: r.state,
      resolutions: resolutions.map((x: any) => ({ certificate: x.certificate, outcome: x.outcome, reason: x.reason, resolved_by: x.resolved_by }))
    });
  }
  return c.json(out);
});

balanceRoutes.post('/restatements/:reference/resolutions', async (c) => {
  const s = await requireRole(c, ['claims_manager']);
  const body = await readJson(c);
  requireFields(body, ['certificate', 'outcome', 'reason']);
  if (!['reissued', 'withdrawn', 'unaffected'].includes(body.outcome)) deny('invalid_outcome', 'outcome is reissued, withdrawn or unaffected.', 400);
  const ref = c.req.param('reference');
  const rst = (await db.query('SELECT * FROM restatements WHERE reference=$1', [ref])).rows[0];
  if (!rst) deny('restatement_not_found', 'No such restatement.', 404);
  const affected = (rst.certificates as string[]) || [];
  if (!affected.includes(body.certificate)) deny('certificate_not_affected', 'That certificate is not in this restatement.', 409);
  const dup = (await db.query('SELECT 1 FROM resolutions WHERE restatement=$1 AND certificate=$2', [ref, body.certificate])).rows[0];
  if (dup) deny('already_resolved', 'Each affected certificate takes exactly one resolution in this restatement.', 409);
  await db.query(
    `INSERT INTO resolutions (restatement,certificate,outcome,reason,resolved_by) VALUES ($1,$2,$3,$4,$5)`,
    [ref, body.certificate, body.outcome, body.reason, s.email]
  );
  if (body.outcome === 'withdrawn') {
    await db.query(`UPDATE certificates SET state='withdrawn', withdrawn_by=$1, withdrawn_on=CURRENT_DATE, withdrawal_reason=$2 WHERE number=$3 AND state<>'withdrawn'`,
      [s.email, 'Resolved as withdrawn under restatement ' + ref, body.certificate]);
  }
  await record(db, { person: s.email, act: 'restatement_resolved', object_kind: 'restatement', object_reference: ref, detail: { certificate: body.certificate, outcome: body.outcome, reason: body.reason } });
  return c.json({ reference: ref, certificate: body.certificate, outcome: body.outcome }, 201);
});

balanceRoutes.get('/conversion-factors', async (c) => {
  await requireSession(c);
  const rows = (await db.query('SELECT * FROM conversion_factors ORDER BY site, published_on')).rows;
  return c.json(rows.map((f: any) => ({
    reference: f.reference, site: f.site, factor_bp: f.factor_bp, derived_from: f.derived_from, derived_to: f.derived_to,
    derived_in_g: Number(f.derived_in_g), derived_out_g: Number(f.derived_out_g), provisional: f.provisional, published_on: f.published_on, superseded_by: f.superseded_by
  })));
});

balanceRoutes.post('/conversion-factors', async (c) => {
  const s = await requireRole(c, ['claims_manager']);
  const body = await readJson(c);
  requireFields(body, ['site', 'factor_bp', 'derived_in_g', 'derived_out_g']);
  for (const f of ['factor_bp', 'derived_in_g', 'derived_out_g']) if (!Number.isInteger(body[f])) deny('no_decimals', `${f} must be an integer.`, 400);
  const site = (await db.query('SELECT * FROM sites WHERE reference=$1', [body.site])).rows[0];
  if (!site) deny('site_not_found', 'No such site.', 404);

  const provisional = Number(body.derived_in_g) === 0;
  if (!provisional) {
    const expected = factorBp(Number(body.derived_out_g), Number(body.derived_in_g));
    if (Number(body.factor_bp) !== expected) {
      return c.json({
        error: 'factor_not_derived',
        message: `factor_bp must equal derived_out_g * 10000 / derived_in_g floored, which is ${expected}.`,
        factor_bp: body.factor_bp, expected_factor_bp: expected
      }, 409);
    }
  }
  const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM conversion_factors")).rows[0].n;
  const ref = 'CF-' + (body.site === 'SITE-PILOT' ? 'PILOT' : body.site === 'SITE-DEMO' ? 'DEMO' : 'COMM') + '-' + n;
  await db.query(
    `INSERT INTO conversion_factors (reference,site,factor_bp,derived_from,derived_to,derived_in_g,derived_out_g,provisional,published_on,published_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE,$9)`,
    [ref, body.site, body.factor_bp, body.derived_from || null, body.derived_to || null, body.derived_in_g, body.derived_out_g, provisional, s.email]
  );
  await record(db, { person: s.email, site: body.site, act: 'conversion_factor_published', object_kind: 'conversion_factor', object_reference: ref, detail: { factor_bp: body.factor_bp, derived_in_g: body.derived_in_g, derived_out_g: body.derived_out_g, provisional } });
  await rememberIdempotent(c, 201, { reference: ref });
  return c.json({ reference: ref, factor_bp: body.factor_bp, provisional }, 201);
});
