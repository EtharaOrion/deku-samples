import { Hono } from 'hono';
import { all, one, query, tx } from '../db.js';
import {
  asDate, idempotent, recordAct, refuse, refusePagination, refuseAuditorWrites,
  requireFields, requireIntegerFields, requireRole, requireSession, refuseComputedInput,
} from '../http.js';
import { batchView, approvalInForce, REQUIRED_CUSTODY, partyNameOn, iso } from '../engine.js';
import { dryMass, creditGranted } from '../units.js';

const app = new Hono();

const nextReference = async (prefix, table, column = 'reference') => {
  const { rows } = await query(
    `select ${column} as ref from ${table} where ${column} like $1 order by ${column} desc limit 1`,
    [`${prefix}%`],
  );
  const last = rows[0]?.ref;
  const n = last ? Number(String(last).slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
};

// ---------------------------------------------------------------- collectors
const collectorView = async (col) => {
  const periods = await all(
    'select * from approval_period where collector = $1 order by valid_from asc',
    [col.reference],
  );
  const findings = await all('select * from finding where collector = $1 order by raised_on asc', [col.reference]);
  const today = new Date().toISOString().slice(0, 10);
  return {
    reference: col.reference,
    name: col.name,
    country: col.country,
    registration: col.registration,
    registration_expiry: asDate(col.registration_expiry),
    collection_site_types: col.site_types,
    declared_streams: col.declared_streams,
    scheme_status: col.scheme_status,
    findings: findings.map((f) => ({
      reference: f.reference, kind: f.kind, detail: f.detail,
      raised_on: asDate(f.raised_on), due_on: asDate(f.due_on), state: f.state, batch: f.batch,
      past_due: !!f.due_on && f.state === 'open' && asDate(f.due_on) < today,
    })),
    approval_periods: periods.map((p) => {
      const validTo = asDate(p.valid_to);
      const days = Math.floor((new Date(validTo) - new Date(today)) / 86400000);
      return {
        state: p.state,
        valid_from: asDate(p.valid_from),
        valid_to: validTo,
        ...(p.state === 'conditional'
          ? { condition: p.condition, condition_closes_on: asDate(p.condition_closes_on) }
          : {}),
        // A grant inside fourteen days of its expiry is reported as expiring.
        expiring: days >= 0 && days <= 14,
        days_to_expiry: days,
      };
    }),
  };
};

app.get('/collectors', async (c) => {
  refusePagination(c);
  const session = requireSession(c);
  let rows = await all('select * from collector order by reference asc');
  // A collector account sees its own record and nothing else.
  if (session.roles.includes('collector')) {
    rows = rows.filter((r) => r.account_email === session.email);
  }
  return c.json(await Promise.all(rows.map(collectorView)));
});

app.get('/collectors/:reference', async (c) => {
  const session = requireSession(c);
  const col = await one('select * from collector where reference = $1', [c.req.param('reference')]);
  if (!col) refuse(404, 'not_found', { message: 'No such collector.' });
  if (session.roles.includes('collector') && col.account_email !== session.email) {
    refuse(403, 'not_permitted', { message: 'A collector sees its own record and nothing else.' });
  }
  return c.json(await collectorView(col));
});

app.post('/collectors/:reference/approvals', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'quality_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['state', 'valid_from', 'valid_to']);
  if (!['approved', 'conditional', 'suspended', 'lapsed'].includes(body.state)) {
    refuse(400, 'unknown_state', { message: 'state is one of approved, conditional, suspended, lapsed.' });
  }
  if (body.state === 'conditional') requireFields(body, ['condition', 'condition_closes_on']);
  const col = await one('select * from collector where reference = $1', [ref]);
  if (!col) refuse(404, 'not_found', { message: 'No such collector.' });

  const result = await idempotent(c, `POST /api/collectors/${ref}/approvals`, body, async () => {
    const r = await one(
      `insert into approval_period (collector,state,valid_from,valid_to,condition,condition_closes_on,recorded_by)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [ref, body.state, body.valid_from, body.valid_to, body.condition || null, body.condition_closes_on || null, session.email],
    );
    const reference = `APR-${String(r.id).padStart(4, '0')}`;
    await recordAct({
      act: `collector_${body.state}`, actor: session.email, site: null,
      object_kind: 'collector', object_reference: ref,
      content: { approval_period: reference, state: body.state, valid_from: body.valid_from, valid_to: body.valid_to },
    });
    return { status: 201, body: { reference, collector: ref, state: body.state, valid_from: body.valid_from, valid_to: body.valid_to } };
  });
  return c.json(result.body, result.status);
});

// ------------------------------------------------------------------ batches
app.get('/batches', async (c) => {
  refusePagination(c);
  const session = requireSession(c);
  let rows = await all('select * from batch order by received_on asc, reference asc');
  if (session.roles.includes('collector')) {
    const col = await one('select * from collector where account_email = $1', [session.email]);
    rows = rows.filter((b) => b.collector === col?.reference);
  }
  const views = await Promise.all(rows.map(batchView));
  if (session.roles.includes('collector')) {
    // A collector sees what it delivered, what was accepted, what was rejected
    // and why, and never a lot, a run, a yield or a carbon figure.
    return c.json(views.map((v) => ({
      reference: v.reference, collector: v.collector, collector_name: v.collector_name,
      category: v.category, received_on: v.received_on, net_g: v.net_g,
      accepted_g: v.accepted_g, rejected_g: v.rejected_g, rejected_reason: v.rejected_reason,
      rejected_destination: v.rejected_destination, claimable: v.claimable, claimable_reason: v.claimable_reason,
    })));
  }
  return c.json(views);
});

app.get('/batches/:reference', async (c) => {
  const session = requireSession(c);
  const b = await one('select * from batch where reference = $1', [c.req.param('reference')]);
  if (!b) refuse(404, 'not_found', { message: 'No such batch.' });
  if (session.roles.includes('collector')) {
    const col = await one('select * from collector where account_email = $1', [session.email]);
    if (b.collector !== col?.reference) refuse(403, 'not_permitted', { message: 'A collector sees its own batches and nothing else.' });
  }
  return c.json(await batchView(b));
});

app.post('/batches', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'plant_operator');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['collector', 'site', 'category', 'received_on', 'device']);
  requireIntegerFields(body, ['gross_g', 'tare_g', 'net_g', 'moisture_bp']);
  if (!['post_consumer', 'pre_consumer'].includes(body.category)) {
    refuse(400, 'unknown_category', { message: 'category is post_consumer or pre_consumer, is required and has no default.' });
  }
  if (!Array.isArray(body.custody)) {
    refuse(400, 'field_required', { message: 'custody is an ordered list of links.', field: 'custody' });
  }
  const col = await one('select * from collector where reference = $1', [body.collector]);
  if (!col) refuse(404, 'not_found', { message: 'No such collector.', field: 'collector' });
  const site = await one('select * from site where reference = $1', [body.site]);
  if (!site) refuse(404, 'not_found', { message: 'No such site.', field: 'site' });
  if (!session.sites.includes(body.site)) {
    refuse(403, 'site_out_of_scope', { message: 'This grant does not cover that site.', site: body.site, sites: session.sites });
  }

  const result = await idempotent(c, 'POST /api/batches', body, async () => {
    const last = await one("select reference from batch where reference like 'BATCH-%' order by reference desc limit 1");
    const num = last ? Number(last.reference.split('-')[1]) + 1 : 1001;
    const batchRef = `BATCH-${num}`;
    const receivedOn = asDate(body.received_on);
    // A batch and its weighing land together or neither lands.
    await tx(async (client) => {
      await client.query(
        `insert into batch (reference,collector,site,grade,category,gross_g,tare_g,net_g,moisture_bp,moisture_method,device,received_on,composition,contamination,accepted_g,event_at,effective_on,created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$8,$15,$12,$16)`,
        [batchRef, body.collector, body.site, body.grade || 'N6', body.category, body.gross_g, body.tare_g,
          body.net_g, body.moisture_bp, body.moisture_method || null, body.device, receivedOn,
          JSON.stringify(body.composition || {}), JSON.stringify(body.contamination || {}),
          body.event_at || `${receivedOn}T08:00:00Z`, session.email],
      );
      let ordinal = 0;
      for (const link of body.custody) {
        if (!REQUIRED_CUSTODY.includes(link.kind)) {
          const e = new Error('unknown_custody_kind');
          e.status = 400;
          e.body = { error: 'unknown_custody_kind', message: `kind is one of ${REQUIRED_CUSTODY.join(', ')}.`, kind: link.kind };
          throw e;
        }
        await client.query(
          'insert into custody_link (batch,ordinal,kind,link_date,party) values ($1,$2,$3,$4,$5)',
          [batchRef, ordinal++, link.kind, link.date, link.party],
        );
      }
      const device = await client.query('select * from weighing_device where reference = $1', [body.device]);
      const cal = device.rows[0];
      await client.query(
        `insert into weighing (reference,batch,device,gross_g,tare_g,net_g,calibration_state,weighed_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [`WGH-${batchRef.split('-')[1]}`, batchRef, body.device, body.gross_g, body.tare_g, body.net_g,
          cal && new Date(cal.calibrated_on) >= new Date(new Date(receivedOn).setFullYear(new Date(receivedOn).getFullYear() - 1))
            ? 'in_calibration' : 'lapsed',
          body.weighed_at || `${receivedOn}T07:45:00Z`],
      );

      // A measured composition departing from the declaration by more than 500
      // basis points is a finding against the collector, not the plant.
      const comp = body.composition || {};
      if (typeof comp.measured_fraction_bp === 'number' && typeof comp.fraction_bp === 'number') {
        const departure = Math.abs(comp.measured_fraction_bp - comp.fraction_bp);
        if (departure > 500) {
          const fr = await client.query("select reference from finding order by reference desc limit 1");
          const fnum = fr.rows[0] ? Number(fr.rows[0].reference.split('-')[1]) + 1 : 1;
          await client.query(
            `insert into finding (reference,collector,kind,detail,raised_on,due_on,state,batch)
             values ($1,$2,'declaration_departure',$3,$4,$5,'open',$6)`,
            [`FND-${String(fnum).padStart(4, '0')}`, body.collector,
              `Declared ${comp.polymer || 'polymer'} fraction ${comp.fraction_bp} bp, measured ${comp.measured_fraction_bp} bp on ${batchRef}: a departure of ${departure} basis points beyond the 500 basis point tolerance.`,
              receivedOn, new Date(new Date(receivedOn).getTime() + 90 * 86400000).toISOString().slice(0, 10), batchRef],
          );
        }
      }

    });

    // The view is built after that transaction has committed, so the custody
    // links it wrote are visible to the traversal that reads them.
    const row = await one('select * from batch where reference = $1', [batchRef]);
    const view = await batchView(row);
    await recordAct({
      act: 'weighing_recorded', actor: session.email, site: body.site,
      object_kind: 'weighing', object_reference: `WGH-${batchRef.split('-')[1]}`,
      content: { device: body.device, net_g: body.net_g },
    });
    await recordAct({
      act: 'batch_booked_in', actor: session.email, site: body.site,
      object_kind: 'batch', object_reference: batchRef,
      content: { net_g: body.net_g, category: body.category, claimable: view.claimable, flags: view.flags },
    });
    return { status: 201, body: view };
  });
  return c.json(result.body, result.status);
});

// A category cannot be changed after acceptance, by anybody, through any route.
app.patch('/batches/:reference', async (c) => {
  refuseAuditorWrites(c);
  const session = requireSession(c);
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  const b = await one('select * from batch where reference = $1', [ref]);
  if (!b) refuse(404, 'not_found', { message: 'No such batch.' });
  if ('category' in body) {
    await recordAct({
      act: 'batch_category_change_refused', actor: session.email, site: b.site,
      object_kind: 'batch', object_reference: ref, refused: true,
      content: { requested_category: body.category, held_category: b.category },
    });
    refuse(409, 'category_immutable_after_acceptance', {
      message: 'A batch category cannot be changed after acceptance, by anybody, through any route. A correction is a new record naming what it corrects.',
      rule: 'batch.category is required at intake, has no default, and is immutable after acceptance',
      batch: ref,
      held_category: b.category,
      requested_category: body.category,
    });
  }
  const allowed = ['moisture_method', 'contamination'];
  const updates = Object.keys(body).filter((k) => allowed.includes(k));
  if (!updates.length) refuse(400, 'nothing_to_change', { message: `Only ${allowed.join(', ')} may be amended.` });
  for (const k of updates) {
    await query(`update batch set ${k} = $1 where reference = $2`, [
      k === 'contamination' ? JSON.stringify(body[k]) : body[k], ref,
    ]);
  }
  await recordAct({
    act: 'batch_amended', actor: session.email, site: b.site,
    object_kind: 'batch', object_reference: ref, content: { fields: updates },
  });
  const row = await one('select * from batch where reference = $1', [ref]);
  return c.json(await batchView(row));
});

app.post('/batches/:reference/custody', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'plant_operator', 'quality_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['kind', 'date', 'party', 'arrived_on']);
  const b = await one('select * from batch where reference = $1', [ref]);
  if (!b) refuse(404, 'not_found', { message: 'No such batch.' });
  const result = await idempotent(c, `POST /api/batches/${ref}/custody`, body, async () => {
    const { rows } = await query('select coalesce(max(ordinal), -1) + 1 as n from custody_link where batch = $1', [ref]);
    await query(
      'insert into custody_link (batch,ordinal,kind,link_date,party,arrived_on,late) values ($1,$2,$3,$4,$5,$6,true)',
      [ref, rows[0].n, body.kind, body.date, body.party, asDate(body.arrived_on)],
    );
    // Claimable forward from the date the late evidence arrived, never from
    // the receipt date.
    await query('update batch set claimable_from = $1 where reference = $2', [asDate(body.arrived_on), ref]);
    const row = await one('select * from batch where reference = $1', [ref]);
    const view = await batchView(row);
    await recordAct({
      act: 'custody_link_attached', actor: session.email, site: b.site,
      object_kind: 'batch', object_reference: ref,
      content: { kind: body.kind, arrived_on: asDate(body.arrived_on), claimable_from: view.claimable_from },
    });
    return { status: 201, body: { reference: ref, ...view } };
  });
  return c.json(result.body, result.status);
});

app.post('/batches/:reference/reject', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'plant_operator', 'quality_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  requireIntegerFields(body, ['rejected_g']);
  requireFields(body, ['reason', 'destination']);
  const b = await one('select * from batch where reference = $1', [ref]);
  if (!b) refuse(404, 'not_found', { message: 'No such batch.' });
  const delivered = b.net_g;
  const accepted = body.accepted_g ?? delivered - body.rejected_g;
  if (accepted + body.rejected_g !== delivered) {
    refuse(409, 'rejection_does_not_sum', {
      message: 'Accepted mass plus rejected mass equals delivered mass.',
      delivered_g: delivered, accepted_g: accepted, rejected_g: body.rejected_g,
    });
  }
  const result = await idempotent(c, `POST /api/batches/${ref}/reject`, body, async () => {
    await query(
      'update batch set rejected_g = $1, accepted_g = $2, rejected_destination = $3, rejected_reason = $4 where reference = $5',
      [body.rejected_g, accepted, body.destination, body.reason, ref],
    );
    const row = await one('select * from batch where reference = $1', [ref]);
    const view = await batchView(row);
    await recordAct({
      act: 'batch_rejected', actor: session.email, site: b.site,
      object_kind: 'batch', object_reference: ref,
      content: { rejected_g: body.rejected_g, accepted_g: accepted, destination: body.destination, reason: body.reason },
    });
    return { status: 201, body: { reference: ref, ...view } };
  });
  return c.json(result.body, result.status);
});

app.get('/batches/:reference/impact', async (c) => {
  requireSession(c);
  refusePagination(c);
  const { batchImpact } = await import('../engine.js');
  const out = await batchImpact(c.req.param('reference'));
  if (!out) refuse(404, 'not_found', { message: 'No such batch.' });
  return c.json(out);
});

// --------------------------------------------------------------------- runs
const runView = async (r) => {
  const recipe = await one('select * from recipe_version where reference = $1', [r.recipe_version]);
  const consumptions = await all('select * from consumption where run = $1 order by reference asc', [r.reference]);
  const outputs = await all('select * from output where run = $1 order by reference asc', [r.reference]);
  const deviations = await all('select * from deviation where $1 = any(runs)', [r.reference]);
  // A missing custody link is named on the batch, on every run that consumed
  // it and on every lot downstream.
  const flags = [];
  for (const cons of consumptions) {
    const b = await one('select * from batch where reference = $1', [cons.input_reference]);
    if (b) {
      const v = await batchView(b);
      for (const f of v.flags) if (!flags.includes(f)) flags.push(f);
    }
  }
  return {
    reference: r.reference,
    run_type: r.run_type,
    site: r.site,
    equipment: r.equipment,
    recipe_version: r.recipe_version,
    recipe: recipe ? { reference: recipe.reference, set_points: recipe.set_points, tolerances: recipe.tolerances, reagents: recipe.reagents, residence_time_min: recipe.residence_time_min, released_by: recipe.released_by } : null,
    actual_set_points: r.actual_set_points,
    within_tolerance: r.within_tolerance,
    operator: r.operator,
    started_at: r.started_at,
    closed_at: r.closed_at,
    state: r.state,
    queued: r.queued,
    losses_g: r.losses_g,
    mass_in_g: consumptions.reduce((s, x) => s + x.mass_g, 0),
    mass_out_g: outputs.reduce((s, x) => s + x.mass_g, 0),
    consumptions: consumptions.map((x) => ({ reference: x.reference, input_kind: x.input_kind, input_reference: x.input_reference, mass_g: x.mass_g, dry_mass_g: x.dry_mass_g, effective_on: asDate(x.effective_on) })),
    outputs: outputs.map((x) => ({ reference: x.reference, kind: x.kind, mass_g: x.mass_g, disposition: x.disposition })),
    deviations: deviations.map((d) => ({ reference: d.reference, state: d.state, outcome: d.outcome })),
    flags,
    event_at: r.event_at,
    recorded_at: r.recorded_at,
    effective_on: asDate(r.effective_on),
    derivation: { losses_g: 'mass in minus mass out, computed at close' },
  };
};

app.get('/runs', async (c) => {
  refusePagination(c);
  const session = requireSession(c);
  if (session.roles.includes('collector') || session.roles.includes('converter')) {
    refuse(403, 'not_permitted', { message: 'A collector never sees a run.' });
  }
  const rows = await all('select * from run order by started_at asc');
  return c.json(await Promise.all(rows.map(runView)));
});

app.get('/runs/:reference', async (c) => {
  requireSession(c);
  const r = await one('select * from run where reference = $1', [c.req.param('reference')]);
  if (!r) refuse(404, 'not_found', { message: 'No such run.' });
  return c.json(await runView(r));
});

app.post('/runs', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'plant_operator');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['run_type', 'site', 'equipment', 'recipe_version', 'operator', 'started_at']);
  if (!['dissolution', 'depolymerisation', 'purification', 'repolymerisation'].includes(body.run_type)) {
    refuse(400, 'unknown_run_type', { message: 'run_type is one of dissolution, depolymerisation, purification, repolymerisation.' });
  }
  const recipe = await one('select * from recipe_version where reference = $1', [body.recipe_version]);
  if (!recipe) refuse(404, 'not_found', { message: 'No such recipe version.', field: 'recipe_version' });
  if (!session.sites.includes(body.site)) {
    refuse(403, 'site_out_of_scope', { message: 'This grant does not cover that site.', site: body.site });
  }
  const result = await idempotent(c, 'POST /api/runs', body, async () => {
    const prefix = { dissolution: 'RUN-D-', depolymerisation: 'RUN-Y-', purification: 'RUN-U-', repolymerisation: 'RUN-R-' }[body.run_type];
    const { rows } = await query("select reference from run where reference like $1 order by reference desc limit 1", [`${prefix}%`]);
    const n = rows[0] ? Number(rows[0].reference.slice(prefix.length)) + 1 : 1;
    const reference = `${prefix}${String(n).padStart(4, '0')}`;
    const effective = asDate(body.effective_on || body.started_at);
    await query(
      `insert into run (reference,run_type,site,equipment,recipe_version,operator,started_at,event_at,effective_on,created_by,state)
       values ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,'open')`,
      [reference, body.run_type, body.site, body.equipment, body.recipe_version, body.operator, body.started_at, effective, session.email],
    );
    await recordAct({
      act: 'run_started', actor: session.email, site: body.site,
      object_kind: 'run', object_reference: reference,
      content: { run_type: body.run_type, recipe_version: body.recipe_version, started_at: body.started_at },
    });
    const r = await one('select * from run where reference = $1', [reference]);
    return { status: 201, body: { reference, ...(await runView(r)) } };
  });
  return c.json(result.body, result.status);
});

const refuseClosedRun = async (reference, session, act) => {
  const r = await one('select * from run where reference = $1', [reference]);
  if (!r) refuse(404, 'not_found', { message: 'No such run.' });
  if (r.state === 'closed') {
    await recordAct({
      act: `${act}_refused`, actor: session.email, site: r.site,
      object_kind: 'run', object_reference: reference, refused: true,
      content: { reason: 'run_closed', closed_at: r.closed_at },
    });
    refuse(409, 'run_closed', {
      message: 'A closed run refuses every write. A correction is a new record naming what it corrects.',
      run: reference, closed_at: r.closed_at,
    });
  }
  return r;
};

app.post('/runs/:reference/consumptions', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'plant_operator');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['input_reference']);
  requireIntegerFields(body, ['mass_g']);
  const run = await refuseClosedRun(ref, session, 'consumption_recorded');

  const batch = await one('select * from batch where reference = $1', [body.input_reference]);
  const output = batch ? null : await one('select * from output where reference = $1', [body.input_reference]);
  if (!batch && !output) refuse(404, 'not_found', { message: 'No such input.', field: 'input_reference' });

  const effective_on = asDate(body.effective_on || body.event_at || run.effective_on);
  // A consumption whose effective date falls in a closed period is refused as
  // a write into that period and opens a restatement instead.
  const period = await one(
    'select * from balance_period where site = $1 and $2 between period_from and period_to order by period_from desc limit 1',
    [run.site, effective_on],
  );
  if (period && period.state === 'closed') {
    const { rows } = await query("select reference from restatement order by reference desc limit 1");
    const n = rows[0] ? Number(rows[0].reference.split('-')[1]) + 1 : 1;
    const reference = `RST-${String(n).padStart(4, '0')}`;
    const certs = await all('select number, content_bp from certificate where period = $1', [period.id]);
    await query(
      'insert into restatement (reference,period,reason,opened_by,certificates) values ($1,$2,$3,$4,$5)',
      [reference, period.id,
        `A consumption effective on ${effective_on} arrived after ${period.id} closed and cannot be written into it.`,
        session.email, JSON.stringify(certs.map((x) => ({ certificate: x.number })))],
    );
    await recordAct({
      act: 'restatement_opened', actor: session.email, site: run.site,
      object_kind: 'restatement', object_reference: reference,
      content: { period: period.id, trigger: 'consumption_into_closed_period', effective_on },
    });
    refuse(409, 'period_closed', {
      message: 'This period is closed. Corrections require a restatement.',
      period: period.id, effective_on, restatement: reference,
    });
  }

  const result = await idempotent(c, `POST /api/runs/${ref}/consumptions`, body, async () => {
    const { rows } = await query("select reference from consumption order by reference desc limit 1");
    const n = rows[0] ? Number(rows[0].reference.split('-')[1]) + 1 : 1;
    const reference = `CSM-${String(n).padStart(4, '0')}`;
    const dry = batch ? dryMass(body.mass_g, batch.moisture_bp) : body.mass_g;
    await query(
      `insert into consumption (reference,run,input_kind,input_reference,mass_g,dry_mass_g,event_at,effective_on,created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [reference, ref, batch ? 'batch' : 'output', body.input_reference, body.mass_g, dry,
        body.event_at || new Date().toISOString(), effective_on, session.email],
    );
    // Credits enter when a claimable batch is consumed.
    if (batch && period) {
      const view = await batchView(batch);
      const factor = await one(
        'select * from conversion_factor where site = $1 and superseded_by is null order by published_at desc limit 1',
        [batch.site],
      );
      if (view.claimable && factor) {
        const credit = creditGranted(dry, factor.factor_bp);
        await query(
          `insert into credit_movement (period,category,direction,mass_g,source_kind,source_reference,derivation,effective_on)
           values ($1,$2,'in',$3,'consumption',$4,$5,$6)`,
          [period.id, batch.category, credit, batch.reference,
            JSON.stringify({ formula: 'dry_mass_consumed_g * factor_bp / 10000, floored', dry_mass_consumed_g: dry, factor_bp: factor.factor_bp, factor: factor.reference, consumption: reference }),
            effective_on],
        );
      } else {
        await query(
          `insert into credit_movement (period,category,direction,mass_g,source_kind,source_reference,derivation,effective_on)
           values ($1,$2,'none',$3,'non_claimable_consumption',$4,$5,$6)`,
          [period.id, batch.category, dry, batch.reference,
            JSON.stringify({ reason: view.claimable_reason, dry_mass_consumed_g: dry, credit_granted_g: 0, consumption: reference }),
            effective_on],
        );
      }
    }
    await recordAct({
      act: 'consumption_recorded', actor: session.email, site: run.site,
      object_kind: 'consumption', object_reference: reference,
      content: { run: ref, input: body.input_reference, mass_g: body.mass_g, dry_mass_g: dry },
    });
    return { status: 201, body: { reference, run: ref, input_reference: body.input_reference, mass_g: body.mass_g, dry_mass_g: dry, effective_on } };
  });
  return c.json(result.body, result.status);
});

app.post('/runs/:reference/outputs', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'plant_operator');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['kind']);
  requireIntegerFields(body, ['mass_g']);
  if (!['intermediate', 'lot', 'byproduct'].includes(body.kind)) {
    refuse(400, 'unknown_output_kind', { message: 'kind is one of intermediate, lot, byproduct.' });
  }
  if (body.kind === 'byproduct') {
    requireFields(body, ['disposition']);
    if (!['sold', 'disposed'].includes(body.disposition)) {
      refuse(400, 'unknown_disposition', { message: 'A byproduct disposition is sold or disposed.' });
    }
  }
  const run = await refuseClosedRun(ref, session, 'output_recorded');
  const result = await idempotent(c, `POST /api/runs/${ref}/outputs`, body, async () => {
    let reference;
    if (body.kind === 'lot') {
      const { rows } = await query("select reference from lot where reference like 'LOT-N6-%' order by reference desc limit 1");
      const n = rows[0] ? Number(rows[0].reference.split('-')[2]) + 1 : 1;
      reference = `LOT-N6-${String(n).padStart(4, '0')}`;
    } else {
      const letter = { dissolution: 'D', depolymerisation: 'Y', purification: 'U', repolymerisation: 'R' }[run.run_type];
      const { rows } = await query("select reference from output where reference like $1 order by reference desc limit 1", [`OUT-${letter}-%`]);
      const n = rows[0] ? Number(rows[0].reference.split('-')[2]) + 1 : 1;
      reference = `OUT-${letter}-${String(n).padStart(4, '0')}`;
    }
    const effective = asDate(body.effective_on || run.effective_on);
    await query(
      `insert into output (reference,run,kind,mass_g,disposition,allocation_basis,event_at,effective_on,created_by)
       values ($1,$2,$3,$4,$5,'mass',$6,$7,$8)`,
      [reference, ref, body.kind, body.mass_g, body.disposition || null,
        body.event_at || new Date().toISOString(), effective, session.email],
    );
    if (body.kind === 'lot') {
      await query(
        `insert into lot (reference,grade,site,sites,mass_g,claim_type,output_reference,event_at,effective_on,created_by,provisional_factor)
         values ($1,$2,$3,$4,$5,'mass_balance',$1,$6,$7,$8,$9)`,
        [reference, body.grade || 'N6', run.site, JSON.stringify([run.site]), body.mass_g,
          body.event_at || new Date().toISOString(), effective, session.email,
          !!(await one("select 1 as x from conversion_factor where site = $1 and provisional = true and superseded_by is null", [run.site]))],
      );
    }
    await recordAct({
      act: 'output_recorded', actor: session.email, site: run.site,
      object_kind: 'output', object_reference: reference,
      content: { run: ref, kind: body.kind, mass_g: body.mass_g, disposition: body.disposition || null },
    });
    return { status: 201, body: { reference, run: ref, kind: body.kind, mass_g: body.mass_g, disposition: body.disposition || null } };
  });
  return c.json(result.body, result.status);
});

app.post('/runs/:reference/close', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'plant_operator');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  const run = await one('select * from run where reference = $1', [ref]);
  if (!run) refuse(404, 'not_found', { message: 'No such run.' });
  if (run.state === 'closed') {
    // A second close is refused and is itself recorded as an attempt.
    await recordAct({
      act: 'run_close_attempted', actor: session.email, site: run.site,
      object_kind: 'run', object_reference: ref, refused: true,
      content: { reason: 'already_closed', closed_at: run.closed_at },
    });
    refuse(409, 'run_already_closed', {
      message: 'A closed run refuses a second close. The attempt is recorded.',
      run: ref, closed_at: run.closed_at,
    });
  }
  const result = await idempotent(c, `POST /api/runs/${ref}/close`, body, async () => {
    const consumptions = await all('select * from consumption where run = $1', [ref]);
    const outputs = await all('select * from output where run = $1', [ref]);
    const massIn = consumptions.reduce((s, x) => s + x.mass_g, 0);
    const massOut = outputs.reduce((s, x) => s + x.mass_g, 0);
    const losses = massIn - massOut;
    const recipe = await one('select * from recipe_version where reference = $1', [run.recipe_version]);
    const actual = body.actual_set_points || run.actual_set_points || {};
    let within = true;
    for (const [k, band] of Object.entries(recipe?.tolerances || {})) {
      const v = actual[k];
      if (typeof v === 'number' && (v < band[0] || v > band[1])) within = false;
    }
    await query(
      "update run set state = 'closed', closed_at = $1, losses_g = $2, actual_set_points = $3, within_tolerance = $4 where reference = $5",
      [body.closed_at || new Date().toISOString(), losses, JSON.stringify(actual), within, ref],
    );
    let deviation = null;
    // A run outside its recipe tolerance raises a deviation whether or not its
    // output passed its tests.
    if (!within) {
      const { rows } = await query("select reference from deviation order by reference desc limit 1");
      const n = rows[0] ? Number(rows[0].reference.split('-')[1]) + 1 : 1;
      deviation = `DEV-${String(n).padStart(4, '0')}`;
      const lotRefs = (await all("select reference from lot where output_reference = any($1)", [outputs.map((o) => o.reference)])).map((l) => l.reference);
      await query(
        `insert into deviation (reference,state,runs,lots,detail,raised_by,raised_on) values ($1,'open',$2,$3,$4,$5,$6)`,
        [deviation, [ref], lotRefs,
          `Run ${ref} closed outside the tolerance of ${run.recipe_version}. Actual set points: ${JSON.stringify(actual)}.`,
          session.email, new Date().toISOString().slice(0, 10)],
      );
      await recordAct({
        act: 'deviation_raised', actor: session.email, site: run.site,
        object_kind: 'deviation', object_reference: deviation,
        content: { run: ref, reason: 'outside_recipe_tolerance' },
      });
    }
    await recordAct({
      act: 'run_closed', actor: session.email, site: run.site,
      object_kind: 'run', object_reference: ref,
      content: { losses_g: losses, mass_in_g: massIn, mass_out_g: massOut, within_tolerance: within, deviation },
    });
    const r = await one('select * from run where reference = $1', [ref]);
    return { status: 200, body: { reference: ref, ...(await runView(r)), deviation, queued: false } };
  });
  return c.json(result.body, result.status);
});

// -------------------------------------------------------------- test results
app.get('/test-results', async (c) => {
  refusePagination(c);
  requireSession(c);
  const rows = await all('select * from test_result order by reference asc');
  return c.json(rows.map((t) => ({
    reference: t.reference, subject_kind: t.subject_kind, subject_reference: t.subject_reference,
    property: t.property, method: t.method, instrument: t.instrument, analyst: t.analyst,
    value: t.value, unit: t.unit, uncertainty_bp: t.uncertainty_bp,
    method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release,
    entered_by: t.entered_by, effective_on: asDate(t.effective_on),
  })));
});

app.post('/test-results', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'lab_analyst', 'quality_manager');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['property', 'value', 'unit']);
  if (!body.method) {
    refuse(400, 'method_required', { message: 'A result with no method is refused. Every result names the method that produced it.', field: 'method' });
  }
  const subjectRef = body.lot || body.batch || body.subject_reference;
  if (!subjectRef) refuse(400, 'field_required', { message: 'A result is recorded against a lot or a batch.', field: 'lot' });
  const lot = await one('select * from lot where reference = $1', [subjectRef]);
  const batch = lot ? null : await one('select * from batch where reference = $1', [subjectRef]);
  if (!lot && !batch) refuse(404, 'not_found', { message: 'No such lot or batch.', field: 'lot' });

  const result = await idempotent(c, 'POST /api/test-results', body, async () => {
    const { rows } = await query("select reference from test_result order by reference desc limit 1");
    const n = rows[0] ? Number(rows[0].reference.split('-')[1]) + 1 : 1;
    const reference = `TST-${String(n).padStart(4, '0')}`;
    // A result produced by a method other than the one the specification names
    // is kept as evidence and never reaches a disposition.
    const spec = await one('select * from specification where grade = $1 and superseded = false order by version desc limit 1', [lot?.grade || batch?.grade || 'N6']);
    const specProp = (spec?.properties || []).find((p) => p.property === body.property);
    const mismatch = !!specProp && specProp.method !== body.method;
    await query(
      `insert into test_result (reference,subject_kind,subject_reference,property,method,instrument,analyst,value,unit,uncertainty_bp,method_mismatch,usable_for_release,entered_by,event_at,effective_on)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [reference, lot ? 'lot' : 'batch', subjectRef, body.property, body.method, body.instrument || null,
        body.analyst || session.email, String(body.value), body.unit, body.uncertainty_bp ?? null,
        mismatch, !mismatch, session.email,
        body.event_at || new Date().toISOString(), asDate(body.effective_on || new Date())],
    );
    await recordAct({
      act: 'test_result_entered', actor: session.email, site: lot?.site || batch?.site || null,
      object_kind: 'test_result', object_reference: reference,
      content: { subject: subjectRef, property: body.property, method: body.method, method_mismatch: mismatch },
    });
    return {
      status: 201,
      body: {
        reference, subject_kind: lot ? 'lot' : 'batch', subject_reference: subjectRef,
        property: body.property, method: body.method, value: String(body.value), unit: body.unit,
        uncertainty_bp: body.uncertainty_bp ?? null,
        method_mismatch: mismatch, usable_for_release: !mismatch,
        specification_method: specProp?.method || null,
      },
    };
  });
  return c.json(result.body, result.status);
});

// --------------------------------------------------------------- deviations
app.get('/deviations', async (c) => {
  refusePagination(c);
  requireSession(c);
  const rows = await all('select * from deviation order by reference asc');
  return c.json(rows.map((d) => ({
    reference: d.reference, state: d.state, runs: d.runs, lots: d.lots, detail: d.detail,
    outcome: d.outcome, raised_by: d.raised_by, raised_on: asDate(d.raised_on),
    closed_by: d.closed_by, closed_on: asDate(d.closed_on),
  })));
});

app.post('/deviations', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'quality_manager');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['detail']);
  const result = await idempotent(c, 'POST /api/deviations', body, async () => {
    const { rows } = await query("select reference from deviation order by reference desc limit 1");
    const n = rows[0] ? Number(rows[0].reference.split('-')[1]) + 1 : 1;
    const reference = `DEV-${String(n).padStart(4, '0')}`;
    await query(
      `insert into deviation (reference,state,runs,lots,detail,raised_by,raised_on) values ($1,'open',$2,$3,$4,$5,$6)`,
      [reference, body.runs || [], body.lots || [], body.detail, session.email, new Date().toISOString().slice(0, 10)],
    );
    await recordAct({
      act: 'deviation_raised', actor: session.email, site: body.site || null,
      object_kind: 'deviation', object_reference: reference,
      content: { runs: body.runs || [], lots: body.lots || [] },
    });
    return { status: 201, body: { reference, state: 'open', runs: body.runs || [], lots: body.lots || [], detail: body.detail } };
  });
  return c.json(result.body, result.status);
});

app.post('/deviations/:reference/close', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'quality_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['outcome']);
  if (!['root_cause_found', 'cause_not_established'].includes(body.outcome)) {
    refuse(400, 'unknown_outcome', { message: 'outcome is root_cause_found or cause_not_established. Both are honest outcomes and neither is hidden.' });
  }
  const d = await one('select * from deviation where reference = $1', [ref]);
  if (!d) refuse(404, 'not_found', { message: 'No such deviation.' });
  if (d.state === 'closed') refuse(409, 'deviation_closed', { message: 'This deviation is already closed.' });
  const result = await idempotent(c, `POST /api/deviations/${ref}/close`, body, async () => {
    await query(
      "update deviation set state = 'closed', outcome = $1, closed_by = $2, closed_on = $3 where reference = $4",
      [body.outcome, session.email, new Date().toISOString().slice(0, 10), ref],
    );
    await recordAct({
      act: 'deviation_closed', actor: session.email, site: null,
      object_kind: 'deviation', object_reference: ref, content: { outcome: body.outcome },
    });
    return { status: 200, body: { reference: ref, state: 'closed', outcome: body.outcome, closed_by: session.email } };
  });
  return c.json(result.body, result.status);
});

// ---------------------------------------------------------------- overrides
app.get('/overrides', async (c) => {
  refusePagination(c);
  requireSession(c);
  const rows = await all('select * from override order by reference asc');
  return c.json(rows.map((o) => ({
    reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot,
    authorised_by: o.authorised_by, created_by: o.created_by, created_on: asDate(o.created_on),
    reviewed: o.reviewed, reviewed_by: o.reviewed_by, reviewed_at: o.reviewed_at,
    permanent: true,
  })));
});

app.post('/overrides', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['separation', 'reason', 'lot', 'authorised_by']);
  if (String(body.reason).trim().length < 40) {
    refuse(400, 'reason_too_short', {
      message: 'An override names a reason of at least forty characters.',
      field: 'reason', length: String(body.reason).trim().length, minimum: 40,
    });
  }
  const lot = await one('select * from lot where reference = $1', [body.lot]);
  if (!lot) refuse(404, 'not_found', { message: 'No such lot.', field: 'lot' });
  const result = await idempotent(c, 'POST /api/overrides', body, async () => {
    const { rows } = await query("select reference from override order by reference desc limit 1");
    const n = rows[0] ? Number(rows[0].reference.split('-')[1]) + 1 : 1;
    const reference = `OVR-${String(n).padStart(4, '0')}`;
    await query(
      `insert into override (reference,separation,reason,lot,authorised_by,created_by,created_on,reviewed)
       values ($1,$2,$3,$4,$5,$6,$7,false)`,
      [reference, body.separation, body.reason, body.lot, body.authorised_by, session.email, new Date().toISOString().slice(0, 10)],
    );
    await recordAct({
      act: 'separation_overridden', actor: session.email, site: lot.site,
      object_kind: 'override', object_reference: reference,
      content: { separation: body.separation, lot: body.lot, authorised_by: body.authorised_by },
    });
    return { status: 201, body: { reference, separation: body.separation, reason: body.reason, lot: body.lot, authorised_by: body.authorised_by, reviewed: false, permanent: true } };
  });
  return c.json(result.body, result.status);
});

app.post('/overrides/:reference/review', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const o = await one('select * from override where reference = $1', [ref]);
  if (!o) refuse(404, 'not_found', { message: 'No such override.' });
  if (o.authorised_by === session.email) {
    await recordAct({
      act: 'override_review_refused', actor: session.email, site: null,
      object_kind: 'override', object_reference: ref, refused: true,
      content: { reason: 'authoriser_cannot_review' },
    });
    refuse(403, 'authoriser_cannot_review', {
      message: 'The authoriser of an override does not review it. A second person does.',
      authorised_by: o.authorised_by,
    });
  }
  const result = await idempotent(c, `POST /api/overrides/${ref}/review`, body, async () => {
    await query(
      'update override set reviewed = true, reviewed_by = $1, reviewed_at = now() where reference = $2',
      [session.email, ref],
    );
    await recordAct({
      act: 'override_reviewed', actor: session.email, site: null,
      object_kind: 'override', object_reference: ref, content: { reviewed_by: session.email, note: body.note || null },
    });
    const r = await one('select * from override where reference = $1', [ref]);
    return {
      status: 200,
      body: {
        reference: ref, separation: r.separation, reason: r.reason, lot: r.lot,
        authorised_by: r.authorised_by, reviewed: true, reviewed_by: r.reviewed_by, reviewed_at: r.reviewed_at,
        removed: false, permanent: true,
      },
    };
  });
  return c.json(result.body, result.status);
});

// ----------------------------------------------------------------- parties
app.get('/parties/:reference/versions', async (c) => {
  refusePagination(c);
  requireSession(c);
  const rows = await all(
    'select * from party_version where reference = $1 order by effective_from asc',
    [c.req.param('reference')],
  );
  if (!rows.length) refuse(404, 'not_found', { message: 'No such party.' });
  return c.json(rows.map((r) => ({
    id: r.id, reference: r.reference, kind: r.kind, name: r.name,
    effective_from: asDate(r.effective_from), superseded_by: r.superseded_by,
  })));
});

app.post('/parties/:reference/versions', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['name', 'effective_from']);
  const existing = await all('select * from party_version where reference = $1 order by effective_from asc', [ref]);
  if (!existing.length) refuse(404, 'not_found', { message: 'No such party.' });
  const result = await idempotent(c, `POST /api/parties/${ref}/versions`, body, async () => {
    const r = await one(
      'insert into party_version (reference,kind,name,effective_from) values ($1,$2,$3,$4) returning id',
      [ref, existing[0].kind, body.name, asDate(body.effective_from)],
    );
    // Supersede rather than rewrite: the previous version keeps its name.
    const prior = existing.filter((x) => asDate(x.effective_from) <= asDate(body.effective_from)).at(-1);
    if (prior) await query('update party_version set superseded_by = $1 where id = $2', [r.id, prior.id]);
    await recordAct({
      act: 'party_version_recorded', actor: session.email, site: null,
      object_kind: 'party', object_reference: ref,
      content: { name: body.name, effective_from: asDate(body.effective_from), supersedes: prior?.id || null },
    });
    return { status: 201, body: { reference: `PVR-${r.id}`, party: ref, name: body.name, effective_from: asDate(body.effective_from), supersedes: prior?.id || null } };
  });
  return c.json(result.body, result.status);
});

app.get('/recipe-versions', async (c) => {
  requireSession(c);
  const rows = await all('select * from recipe_version order by reference asc');
  return c.json(rows.map((r) => ({
    reference: r.reference, run_type: r.run_type, version: r.version,
    set_points: r.set_points, tolerances: r.tolerances, reagents: r.reagents,
    residence_time_min: r.residence_time_min, released_by: r.released_by, published_on: asDate(r.published_on),
  })));
});

app.get('/weighing-devices', async (c) => {
  requireSession(c);
  const rows = await all('select * from weighing_device order by reference asc');
  const today = new Date().toISOString().slice(0, 10);
  return c.json(rows.map((d) => {
    const limit = new Date(d.calibrated_on);
    limit.setMonth(limit.getMonth() + 12);
    return {
      reference: d.reference, site: d.site, calibrated_on: asDate(d.calibrated_on),
      calibration_valid_until: limit.toISOString().slice(0, 10),
      lapsed: limit.toISOString().slice(0, 10) < today,
    };
  }));
});

export { approvalInForce, partyNameOn, iso };
export default app;
