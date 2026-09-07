import { Hono } from 'hono';
import { rq, rq1, tx } from '../db/pool.js';
import { appendEntry } from '../lib/record.js';
import {
  idempotent, refuse, requireRole, requireSession, requireSite, refuseAuditorWrite,
  refuseComputedInputs, refusePaging, recordRefusal, today
} from '../lib/http.js';
import { requireNonNegativeInteger, requireInteger, dryMassG, creditG } from '../engine/units.js';
import { resolveBatch, resolveBatchByRef, allBatches, approvalInForce, partyNameOn, REQUIRED_CUSTODY } from '../engine/feedstock.js';
import { lotClaim } from '../engine/ledger.js';

export const operations = new Hono();

async function nextRef(client, table, column, prefix, width = 4) {
  const r = await client.query(`SELECT count(*)::int AS n FROM ${table}`);
  return `${prefix}${String(r.rows[0].n + 1).padStart(width, '0')}`;
}

// ------------------------------------------------------------------ sites

operations.get('/sites', async (c) => {
  const rows = await rq('SELECT * FROM site ORDER BY reference');
  return c.json(rows.map((s) => ({
    reference: s.reference,
    name: s.name,
    // A capacity figure is never returned without its confidence.
    confidence: s.confidence,
    certification_state: s.certification_state
  })));
});

operations.get('/sites/:reference/capacity', async (c) => {
  const s = await rq1('SELECT * FROM site WHERE reference = $1', [c.req.param('reference')]);
  if (!s) throw refuse(404, 'no_such_site', `No site is recorded at ${c.req.param('reference')}.`);
  const nameplate = Number(s.nameplate_kg);
  const contracted = Number(s.contracted_kg);
  return c.json({
    reference: s.reference,
    name: s.name,
    nameplate_kg: nameplate,
    basis: s.capacity_basis,
    contracted_kg: contracted,
    // Computed, and allowed to be negative: SITE-COMM reports -1000000 and
    // reports it in public rather than quietly.
    uncommitted_kg: nameplate - contracted,
    confidence: s.confidence,
    certification_state: s.certification_state,
    last_revised: String(s.last_revised).slice(0, 10),
    derivation: { uncommitted_kg: `nameplate_kg ${nameplate} minus contracted_kg ${contracted}` }
  });
});

operations.get('/sites/:reference/certification', async (c) => {
  const site = c.req.param('reference');
  const rows = await rq(
    'SELECT * FROM site_certification WHERE site = $1 ORDER BY effective_from, reference', [site]
  );
  return c.json(rows.map((r) => ({
    reference: r.reference, site: r.site, grade: r.grade, state: r.state, scheme: r.scheme,
    effective_from: String(r.effective_from).slice(0, 10),
    effective_to: r.effective_to ? String(r.effective_to).slice(0, 10) : null,
    reason: r.reason
  })));
});

/** A suspension may carry an effective_from that precedes the date it was
 *  recorded, and it reaches backwards: every certificate signed inside the
 *  window is enumerated and individually resolved. */
operations.post('/sites/:reference/certification', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'quality_manager');
  const site = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const state = body.state;
  if (!['suspended', 'lifted', 'certified'].includes(state)) {
    throw refuse(400, 'unknown_state', 'A certification act is one of suspended, lifted or certified.');
  }
  if (!body.effective_from) throw refuse(400, 'missing_field', 'A certification act carries an effective_from date.');

  const result = await idempotent(c, `POST /api/sites/${site}/certification`, body, async () => tx(async (client) => {
    const ref = await nextRef(client, 'site_certification', 'reference', 'SC-ACT-');
    await client.query(
      `INSERT INTO site_certification (reference,site,grade,state,scheme,effective_from,effective_to,reason,recorded_by)
       VALUES ($1,$2,$3,$4,'RCS-2026',$5,$6,$7,$8)`,
      [ref, site, body.grade || null, state, body.effective_from, body.effective_to || null,
        body.reason || null, session.email]
    );

    let inWindow = [];
    if (state === 'suspended') {
      const to = body.effective_to || '9999-12-31';
      const rows = await client.query(
        `SELECT number, version, issued_on, recipient, recipient_name, state, grade, content_bp, claim_type
           FROM certificate
          WHERE site = $1 AND issued_on BETWEEN $2::date AND $3::date ORDER BY number`,
        [site, body.effective_from, to]
      );
      inWindow = rows.rows.map((r) => ({
        number: r.number, version: r.version, issued_on: String(r.issued_on).slice(0, 10),
        recipient: r.recipient, recipient_name: r.recipient_name, state: r.state,
        grade: r.grade, content_bp: r.content_bp, claim_type: r.claim_type,
        // Each is individually resolved under the three restatement outcomes.
        available_outcomes: ['reissued', 'withdrawn', 'unaffected'], resolution: null
      }));
      await client.query('UPDATE site SET certification_state = $1 WHERE reference = $2', ['suspended', site]);
    } else if (state === 'lifted' || state === 'certified') {
      await client.query('UPDATE site SET certification_state = $1 WHERE reference = $2', ['certified', site]);
    }

    await appendEntry(client, {
      act: state === 'suspended' ? 'certification_suspended' : 'certification_lifted',
      person: session.email, site, object_kind: 'site', object_ref: site,
      content: { reference: ref, state, effective_from: body.effective_from, reason: body.reason || null,
        certificates_in_window: inWindow.map((x) => x.number) },
      effective_on: body.effective_from
    });

    return {
      status: 201,
      body: {
        reference: ref, site, state,
        effective_from: body.effective_from,
        effective_to: body.effective_to || null,
        reason: body.reason || null,
        certificates_in_window: inWindow,
        // Issuing stops for the affected site and grade, with the suspension
        // named as the blocking condition.
        issuing_blocked: state === 'suspended',
        blocking_condition: state === 'suspended'
          ? `${site} certification is suspended from ${body.effective_from}. Reason: ${body.reason || 'not stated'}.`
          : null,
        note: state !== 'suspended'
          ? 'Lifting restores issuing from the moment the lift takes effect. It does not reinstate a withdrawn certificate: a withdrawal is a fact about a document, and the remedy is a new certificate.'
          : null
      }
    };
  }));
  return c.json(result.body, result.status);
});

// ------------------------------------------------------------- collectors

async function shapeCollector(row) {
  const periods = await rq(
    'SELECT * FROM approval_period WHERE collector = $1 ORDER BY valid_from', [row.reference]
  );
  const findings = await rq(
    'SELECT reference, kind, detail, departure_bp, raised_on, due_on, state FROM finding WHERE collector = $1 ORDER BY reference',
    [row.reference]
  );
  const t = today();
  const fortnight = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  return {
    reference: row.reference,
    name: await partyNameOn(row.reference, t),
    country: row.country,
    registration: row.registration,
    registration_expiry: String(row.registration_expiry).slice(0, 10),
    collection_site_types: row.collection_site_types,
    declared_streams: row.declared_streams,
    scheme_status: row.scheme_status,
    findings: findings.map((f) => ({
      reference: f.reference, kind: f.kind, detail: f.detail, departure_bp: f.departure_bp,
      raised_on: String(f.raised_on).slice(0, 10),
      due_on: f.due_on ? String(f.due_on).slice(0, 10) : null,
      state: f.state,
      past_date: !!f.due_on && String(f.due_on).slice(0, 10) < t && f.state === 'open'
    })),
    approval_periods: periods.map((p) => {
      const validTo = String(p.valid_to).slice(0, 10);
      return {
        reference: p.reference,
        state: p.state,
        valid_from: String(p.valid_from).slice(0, 10),
        valid_to: validTo,
        condition: p.state === 'conditional' ? p.condition : null,
        condition_closes_on: p.state === 'conditional' && p.condition_closes_on
          ? String(p.condition_closes_on).slice(0, 10) : null,
        // A grant inside fourteen days of its expiry is reported as expiring.
        expiring: validTo >= t && validTo <= fortnight,
        in_force_today: String(p.valid_from).slice(0, 10) <= t && validTo >= t
      };
    })
  };
}

operations.get('/collectors', async (c) => {
  const rows = await rq('SELECT * FROM collector ORDER BY reference');
  return c.json(await Promise.all(rows.map(shapeCollector)));
});

operations.get('/collectors/:reference', async (c) => {
  const row = await rq1('SELECT * FROM collector WHERE reference = $1', [c.req.param('reference')]);
  if (!row) throw refuse(404, 'no_such_collector', `No collector is recorded at ${c.req.param('reference')}.`);
  return c.json(await shapeCollector(row));
});

operations.post('/collectors/:reference/approvals', async (c) => {
  refuseAuditorWrite(c);
  // Approving a collector is a quality act. Whoever books in a batch does not
  // approve the collector: the fourth separation, enforced here.
  const session = requireRole(c, 'quality_manager');
  const collector = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  if (!['approved', 'conditional', 'suspended', 'lapsed'].includes(body.state)) {
    throw refuse(400, 'unknown_state', 'An approval state is one of approved, conditional, suspended or lapsed.');
  }
  if (!body.valid_from || !body.valid_to) {
    throw refuse(400, 'missing_field', 'An approval period carries a valid_from and a valid_to.');
  }
  if (body.state === 'conditional' && (!body.condition || !body.condition_closes_on)) {
    throw refuse(400, 'condition_required',
      'A conditional approval names its condition and the date it must be closed by.');
  }

  const result = await idempotent(c, `POST /api/collectors/${collector}/approvals`, body, async () => tx(async (client) => {
    const ref = await nextRef(client, 'approval_period', 'reference', 'AP-NEW-');
    await client.query(
      `INSERT INTO approval_period (reference,collector,state,valid_from,valid_to,condition,condition_closes_on,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [ref, collector, body.state, body.valid_from, body.valid_to,
        body.condition || null, body.condition_closes_on || null, session.email]
    );
    await appendEntry(client, {
      act: `collector_${body.state}`, person: session.email, object_kind: 'collector', object_ref: collector,
      content: { approval_period: ref, state: body.state, valid_from: body.valid_from, valid_to: body.valid_to },
      effective_on: body.valid_from
    });
    return { status: 201, body: { reference: ref, collector, state: body.state, valid_from: body.valid_from, valid_to: body.valid_to } };
  }));
  return c.json(result.body, result.status);
});

// ------------------------------------------------------------- parties

operations.get('/parties/:reference/versions', async (c) => {
  refusePaging(c);
  const rows = await rq(
    'SELECT * FROM party_version WHERE reference = $1 ORDER BY effective_from', [c.req.param('reference')]
  );
  return c.json(rows.map((r) => ({
    reference: r.reference, kind: r.kind, name: r.name, identifier: r.identifier,
    effective_from: String(r.effective_from).slice(0, 10),
    superseded_on: r.superseded_on ? String(r.superseded_on).slice(0, 10) : null
  })));
});

operations.post('/parties/:reference/versions', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  if (!body.name || !body.effective_from) {
    throw refuse(400, 'missing_field', 'A party version carries a name and an effective_from date.');
  }
  const result = await idempotent(c, `POST /api/parties/${reference}/versions`, body, async () => tx(async (client) => {
    const prior = await client.query(
      'SELECT id, kind FROM party_version WHERE reference = $1 ORDER BY effective_from DESC LIMIT 1', [reference]
    );
    // Supersedes the previous version rather than rewriting it.
    if (prior.rows.length) {
      await client.query('UPDATE party_version SET superseded_on = $1 WHERE id = $2',
        [body.effective_from, prior.rows[0].id]);
    }
    const r = await client.query(
      `INSERT INTO party_version (reference,kind,name,identifier,effective_from) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [reference, body.kind || prior.rows[0]?.kind || 'party', body.name, body.identifier || null, body.effective_from]
    );
    await appendEntry(client, {
      act: 'party_version_recorded', person: session.email, object_kind: 'party', object_ref: reference,
      content: { name: body.name, effective_from: body.effective_from }, effective_on: body.effective_from
    });
    return { status: 201, body: { reference, id: r.rows[0].id, name: body.name, effective_from: body.effective_from } };
  }));
  return c.json(result.body, result.status);
});

// ------------------------------------------------------------- batches

operations.get('/batches', async (c) => {
  refusePaging(c);
  const session = c.get('session');
  const all = await allBatches();
  // A collector account sees its own batches and nothing else.
  if (session?.collector) return c.json(all.filter((b) => b.collector === session.collector));
  return c.json(all);
});

operations.get('/batches/:reference', async (c) => {
  const b = await resolveBatchByRef(c.req.param('reference'));
  if (!b) throw refuse(404, 'no_such_batch', `No batch is recorded at ${c.req.param('reference')}.`);
  return c.json(b);
});

operations.post('/batches', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'plant_operator');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);

  // category is required at intake and has no default.
  if (!body.category) {
    throw refuse(400, 'category_required',
      'A batch category is required at intake, has no default, and can never be changed after acceptance.');
  }
  if (!['post_consumer', 'pre_consumer'].includes(body.category)) {
    throw refuse(400, 'unknown_category', 'A batch category is post_consumer or pre_consumer.');
  }
  for (const f of ['collector', 'site', 'device', 'received_on', 'moisture_method']) {
    if (!body[f]) throw refuse(400, 'missing_field', `A batch carries ${f}.`, { field: f });
  }
  const grossG = requireNonNegativeInteger(body.gross_g, 'gross_g');
  const tareG = requireNonNegativeInteger(body.tare_g, 'tare_g');
  const netG = requireNonNegativeInteger(body.net_g, 'net_g');
  const moistureBp = requireNonNegativeInteger(body.moisture_bp, 'moisture_bp');
  if (moistureBp > 10000) throw refuse(400, 'moisture_out_of_range', 'moisture_bp is at most 10000, which is one hundred per cent.');
  requireSite(session, body.site);

  const collector = await rq1('SELECT reference FROM collector WHERE reference = $1', [body.collector]);
  if (!collector) throw refuse(400, 'no_such_collector', `No collector is recorded at ${body.collector}.`);
  const device = await rq1('SELECT * FROM weighing_device WHERE reference = $1', [body.device]);
  if (!device) throw refuse(400, 'no_such_device', `No weighing device is recorded at ${body.device}.`);

  const result = await idempotent(c, 'POST /api/batches', body, async () => tx(async (client) => {
    const ref = body.reference || await nextRef(client, 'batch', 'reference', 'BATCH-2', 3);
    const receivedOn = String(body.received_on).slice(0, 10);
    const eventAt = body.event_at || `${receivedOn}T08:00:00Z`;

    // A batch and its weighing land together or neither lands: they are one
    // transaction, so intake can continue while the rest is degraded.
    await client.query(
      `INSERT INTO batch (reference,collector,site,grade,category,gross_g,tare_g,net_g,moisture_bp,moisture_method,
         device,received_on,composition,contamination,accepted_g,event_at,effective_on,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$8,$15,$12,$16)`,
      [ref, body.collector, body.site, body.grade || 'N6', body.category, grossG, tareG, netG,
        moistureBp, body.moisture_method, body.device, receivedOn,
        JSON.stringify(body.composition || {}), JSON.stringify(body.contamination || {}),
        eventAt, session.email]
    );
    const calLapsed = new Date(device.calibrated_on) < new Date(new Date(receivedOn).setFullYear(new Date(receivedOn).getFullYear() - 1));
    await client.query(
      `INSERT INTO weighing (reference,batch,device,gross_g,tare_g,net_g,calibrated_on,calibration_state,weighed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [`WGH-${ref}`, ref, body.device, grossG, tareG, netG, device.calibrated_on,
        calLapsed ? 'lapsed' : 'valid', eventAt]
    );

    const custody = Array.isArray(body.custody) ? body.custody : [];
    let ord = 0;
    for (const link of custody) {
      if (!REQUIRED_CUSTODY.includes(link.kind)) {
        throw refuse(400, 'unknown_custody_kind',
          `A custody link kind is one of ${REQUIRED_CUSTODY.join(', ')}.`, { received: link.kind });
      }
      await client.query(
        `INSERT INTO custody_link (batch,kind,party,link_date,ordinal) VALUES ($1,$2,$3,$4,$5)`,
        [ref, link.kind, link.party || 'unnamed', link.date || receivedOn, ord++]
      );
    }

    // A measured composition departing from the declaration by more than 500
    // basis points raises a finding against the collector, not against the plant.
    const comp = body.composition || {};
    if (comp.measured_fraction_bp != null && comp.fraction_bp != null) {
      const departure = Math.abs(Number(comp.measured_fraction_bp) - Number(comp.fraction_bp));
      if (departure > 500) {
        const fref = await nextRef(client, 'finding', 'reference', 'FND-');
        await client.query(
          `INSERT INTO finding (reference,collector,batch,kind,detail,departure_bp,raised_on,due_on,state)
           VALUES ($1,$2,$3,'declaration_departure',$4,$5,$6,$7,'open')`,
          [fref, body.collector, ref,
            `Declared fraction ${comp.fraction_bp} bp, measured ${comp.measured_fraction_bp} bp on ${ref}: a departure of ${departure} basis points beyond the 500 basis point tolerance.`,
            departure, receivedOn, new Date(new Date(receivedOn).getTime() + 90 * 86400000).toISOString().slice(0, 10)]
        );
        await appendEntry(client, {
          act: 'finding_raised', person: session.email, object_kind: 'collector', object_ref: body.collector,
          content: { finding: fref, batch: ref, departure_bp: departure }, effective_on: receivedOn
        });
      }
    }

    const row = await client.query('SELECT * FROM batch WHERE reference = $1', [ref]);
    await appendEntry(client, {
      act: 'batch_booked_in', person: session.email, site: body.site, object_kind: 'batch', object_ref: ref,
      content: { collector: body.collector, category: body.category, net_g: netG, moisture_bp: moistureBp,
        dry_mass_g: dryMassG(netG, moistureBp), device: body.device },
      event_at: eventAt, effective_on: receivedOn
    });
    await appendEntry(client, {
      act: 'weighing_recorded', person: session.email, site: body.site, object_kind: 'batch', object_ref: ref,
      content: { device: body.device, net_g: netG, calibration_state: calLapsed ? 'lapsed' : 'valid' },
      event_at: eventAt, effective_on: receivedOn
    });

    return { status: 201, body: await resolveBatch(row.rows[0]) };
  }));
  return c.json(result.body, result.status);
});

/** A category change is refused for every role with 409 and a body naming the
 *  rule. There is no route, and no role, that permits it. */
operations.patch('/batches/:reference', async (c) => {
  refuseAuditorWrite(c);
  const session = requireSession(c);
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);

  const batch = await rq1('SELECT * FROM batch WHERE reference = $1', [ref]);
  if (!batch) throw refuse(404, 'no_such_batch', `No batch is recorded at ${ref}.`);

  if ('category' in body) {
    await recordRefusal({
      act: 'batch_category_change_refused', person: session.email, site: batch.site,
      object_kind: 'batch', object_ref: ref,
      content: { attempted_category: body.category, current_category: batch.category }
    });
    throw refuse(409, 'category_immutable_after_acceptance',
      'A batch category is required at intake and can never be changed after acceptance, by anybody, through any route.',
      { batch: ref, category: batch.category, attempted: body.category });
  }

  // Everything else about a booked batch is equally fixed: the app stores what
  // arrived rather than what a later reader could reconstruct.
  throw refuse(409, 'batch_record_is_what_arrived',
    'The batch record captures the mass as the weighbridge reported it. A correction is a new record naming what it corrects.',
    { batch: ref });
});

operations.post('/batches/:reference/custody', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'plant_operator', 'quality_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const batch = await rq1('SELECT * FROM batch WHERE reference = $1', [ref]);
  if (!batch) throw refuse(404, 'no_such_batch', `No batch is recorded at ${ref}.`);
  if (!REQUIRED_CUSTODY.includes(body.kind)) {
    throw refuse(400, 'unknown_custody_kind', `A custody link kind is one of ${REQUIRED_CUSTODY.join(', ')}.`);
  }
  if (!body.arrived_on) {
    throw refuse(400, 'arrived_on_required',
      'Late evidence carries the date it arrived, because the batch becomes claimable from that date rather than from its receipt date.');
  }

  const result = await idempotent(c, `POST /api/batches/${ref}/custody`, body, async () => tx(async (client) => {
    const ordRow = await client.query('SELECT COALESCE(MAX(ordinal), -1) + 1 AS n FROM custody_link WHERE batch = $1', [ref]);
    await client.query(
      `INSERT INTO custody_link (batch,kind,party,link_date,arrived_on,ordinal) VALUES ($1,$2,$3,$4,$5,$6)`,
      [ref, body.kind, body.party || 'unnamed', body.date || body.arrived_on, body.arrived_on, ordRow.rows[0].n]
    );
    await appendEntry(client, {
      act: 'custody_evidence_attached', person: session.email, site: batch.site,
      object_kind: 'batch', object_ref: ref,
      content: { kind: body.kind, arrived_on: body.arrived_on, claimable_from: body.arrived_on },
      effective_on: body.arrived_on
    });
    const row = await client.query('SELECT * FROM batch WHERE reference = $1', [ref]);
    return { status: 201, body: { reference: ref, ...(await resolveBatch(row.rows[0])) } };
  }));
  return c.json(result.body, result.status);
});

operations.post('/batches/:reference/reject', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'plant_operator', 'quality_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);
  const batch = await rq1('SELECT * FROM batch WHERE reference = $1', [ref]);
  if (!batch) throw refuse(404, 'no_such_batch', `No batch is recorded at ${ref}.`);

  const rejectedG = requireNonNegativeInteger(body.rejected_g, 'rejected_g');
  if (!body.reason) throw refuse(400, 'missing_field', 'A rejection names its reason.');
  // A partial rejection records where the rejected mass went.
  if (!body.destination) {
    throw refuse(400, 'destination_required', 'A rejection records where the rejected mass went.');
  }
  const deliveredG = Number(batch.net_g);
  // Accepted mass plus rejected mass equals delivered mass, and a rejection
  // whose parts do not sum is refused.
  if (rejectedG > deliveredG) {
    throw refuse(409, 'rejection_does_not_sum',
      `Accepted mass plus rejected mass equals delivered mass. ${ref} delivered ${deliveredG} g and the rejection is ${rejectedG} g.`,
      { delivered_g: deliveredG, rejected_g: rejectedG });
  }
  if (body.accepted_g != null) {
    const acceptedG = requireNonNegativeInteger(body.accepted_g, 'accepted_g');
    if (acceptedG + rejectedG !== deliveredG) {
      throw refuse(409, 'rejection_does_not_sum',
        `Accepted ${acceptedG} g plus rejected ${rejectedG} g is ${acceptedG + rejectedG} g, and ${deliveredG} g was delivered.`,
        { delivered_g: deliveredG, accepted_g: acceptedG, rejected_g: rejectedG });
    }
  }

  const result = await idempotent(c, `POST /api/batches/${ref}/reject`, body, async () => tx(async (client) => {
    await client.query(
      'UPDATE batch SET rejected_g = $1, rejected_reason = $2, rejected_destination = $3, accepted_g = $4 WHERE reference = $5',
      [rejectedG, body.reason, body.destination, deliveredG - rejectedG, ref]
    );
    await appendEntry(client, {
      act: 'batch_rejected', person: session.email, site: batch.site, object_kind: 'batch', object_ref: ref,
      content: { rejected_g: rejectedG, accepted_g: deliveredG - rejectedG, reason: body.reason, destination: body.destination }
    });
    const row = await client.query('SELECT * FROM batch WHERE reference = $1', [ref]);
    return { status: 201, body: { reference: ref, ...(await resolveBatch(row.rows[0])) } };
  }));
  return c.json(result.body, result.status);
});

// ------------------------------------------------------------------ runs

async function shapeRun(r) {
  const [consumptions, outputs, recipe] = await Promise.all([
    rq('SELECT * FROM consumption WHERE run = $1 ORDER BY reference', [r.reference]),
    rq('SELECT * FROM output WHERE run = $1 ORDER BY reference', [r.reference]),
    rq1('SELECT * FROM recipe_version WHERE reference = $1', [r.recipe_version])
  ]);
  const massIn = consumptions.reduce((s, x) => s + Number(x.mass_g), 0);
  const massOut = outputs.reduce((s, x) => s + Number(x.mass_g), 0);

  // within_tolerance is decided against the recipe version the run followed,
  // never against the current recipe.
  let withinTolerance = true;
  const excursions = [];
  const actual = r.actual_set_points || {};
  const tol = recipe?.tolerances || {};
  for (const [k, range] of Object.entries(tol)) {
    const v = actual[k];
    if (v === undefined) continue;
    if (v < range[0] || v > range[1]) {
      withinTolerance = false;
      excursions.push({ parameter: k, actual: v, tolerance: range });
    }
  }

  const flags = [];
  const batchRefs = consumptions.filter((x) => x.input_kind === 'batch').map((x) => x.input_ref);
  if (batchRefs.length) {
    const bs = await rq('SELECT reference, device, received_on FROM batch WHERE reference = ANY($1)', [batchRefs]);
    for (const b of bs) {
      const resolved = await resolveBatchByRef(b.reference);
      for (const f of resolved.flags) if (!flags.includes(f)) flags.push(f);
      // A missing custody link names the missing kind on the batch, on every
      // run that consumed it, and on every lot downstream.
      if (!resolved.custody_complete) {
        const label = `custody_link_missing:${resolved.custody_missing[0]}`;
        if (!flags.includes(label)) flags.push(label);
      }
    }
  }

  return {
    reference: r.reference,
    run_type: r.run_type,
    site: r.site,
    equipment: r.equipment,
    recipe_version: r.recipe_version,
    recipe: recipe ? {
      reference: recipe.reference, version: recipe.version, set_points: recipe.set_points,
      tolerances: recipe.tolerances, reagents: recipe.reagents,
      residence_minutes: recipe.residence_minutes, released_by: recipe.released_by,
      released_on: String(recipe.released_on).slice(0, 10)
    } : null,
    actual_set_points: actual,
    within_tolerance: withinTolerance,
    excursions,
    operator: r.operator,
    started_at: r.started_at,
    closed_at: r.closed_at,
    state: r.state,
    close_queued: r.close_queued,
    mass_in_g: massIn,
    mass_out_g: massOut,
    // Losses are computed as mass in minus mass out, never accepted.
    losses_g: r.losses_g === null || r.losses_g === undefined ? null : Number(r.losses_g),
    flags,
    consumptions: consumptions.map((x) => ({
      reference: x.reference, input_kind: x.input_kind, input_ref: x.input_ref,
      mass_g: Number(x.mass_g), effective_on: String(x.effective_on).slice(0, 10)
    })),
    outputs: outputs.map((x) => ({
      reference: x.reference, kind: x.kind, mass_g: Number(x.mass_g), disposition: x.disposition
    })),
    event_at: r.event_at,
    recorded_at: r.recorded_at,
    effective_on: String(r.effective_on).slice(0, 10),
    derivation: r.losses_g !== null
      ? { losses_g: `mass in ${massIn} g minus mass out ${massOut} g` }
      : { losses_g: 'computed at close, as mass in minus mass out' }
  };
}

operations.get('/runs', async (c) => {
  refusePaging(c);
  const rows = await rq('SELECT * FROM run ORDER BY started_at, reference');
  return c.json(await Promise.all(rows.map(shapeRun)));
});

operations.get('/runs/:reference', async (c) => {
  const r = await rq1('SELECT * FROM run WHERE reference = $1', [c.req.param('reference')]);
  if (!r) throw refuse(404, 'no_such_run', `No run is recorded at ${c.req.param('reference')}.`);
  return c.json(await shapeRun(r));
});

operations.post('/runs', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'plant_operator');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);
  const types = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];
  if (!types.includes(body.run_type)) {
    throw refuse(400, 'unknown_run_type', `A run type is one of ${types.join(', ')}.`);
  }
  for (const f of ['site', 'equipment', 'recipe_version', 'operator', 'started_at']) {
    if (!body[f]) throw refuse(400, 'missing_field', `A run carries ${f}.`, { field: f });
  }
  requireSite(session, body.site);
  const recipe = await rq1('SELECT * FROM recipe_version WHERE reference = $1', [body.recipe_version]);
  if (!recipe) throw refuse(400, 'no_such_recipe', `No recipe version is recorded at ${body.recipe_version}.`);

  const result = await idempotent(c, 'POST /api/runs', body, async () => tx(async (client) => {
    const n = await client.query('SELECT count(*)::int AS n FROM run');
    const letter = { dissolution: 'D', depolymerisation: 'Y', purification: 'U', repolymerisation: 'R' }[body.run_type];
    const ref = body.reference || `RUN-${letter}-${String(n.rows[0].n + 1).padStart(4, '0')}`;
    const effectiveOn = String(body.started_at).slice(0, 10);
    await client.query(
      `INSERT INTO run (reference,run_type,site,equipment,recipe_version,operator,started_at,state,actual_set_points,
         event_at,effective_on,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8,$7,$9,$10)`,
      [ref, body.run_type, body.site, body.equipment, body.recipe_version, body.operator,
        body.started_at, JSON.stringify(body.actual_set_points || {}), effectiveOn, session.email]
    );
    await appendEntry(client, {
      act: 'run_started', person: session.email, site: body.site, object_kind: 'run', object_ref: ref,
      content: { run_type: body.run_type, recipe_version: body.recipe_version, equipment: body.equipment },
      event_at: body.started_at, effective_on: effectiveOn
    });
    const row = await client.query('SELECT * FROM run WHERE reference = $1', [ref]);
    return { status: 201, body: await shapeRun(row.rows[0]) };
  }));
  return c.json(result.body, result.status);
});

async function assertRunOpen(client, ref) {
  const r = await client.query('SELECT * FROM run WHERE reference = $1 FOR UPDATE', [ref]);
  if (!r.rows.length) throw refuse(404, 'no_such_run', `No run is recorded at ${ref}.`);
  if (r.rows[0].state === 'closed') {
    throw refuse(409, 'run_closed', `${ref} is closed and refuses every write. A correction is a new record naming what it corrects.`);
  }
  return r.rows[0];
}

operations.post('/runs/:reference/consumptions', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'plant_operator');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);
  const massG = requireNonNegativeInteger(body.mass_g, 'mass_g');
  if (!body.input_ref) throw refuse(400, 'missing_field', 'A consumption names the input it drew from.');

  const result = await idempotent(c, `POST /api/runs/${ref}/consumptions`, body, async () => tx(async (client) => {
    const run = await assertRunOpen(client, ref);
    const inputKind = body.input_kind
      || ((await client.query('SELECT 1 FROM batch WHERE reference = $1', [body.input_ref])).rows.length ? 'batch' : 'output');

    const effectiveOn = body.effective_on || String(run.effective_on).slice(0, 10);
    // A consumption whose effective date falls in a closed period is refused as
    // a write into that period and opens a restatement instead.
    const period = await client.query(
      `SELECT * FROM balance_period WHERE site = $1 AND $2::date BETWEEN period_from AND period_to LIMIT 1`,
      [run.site, effectiveOn]
    );
    if (period.rows.length && period.rows[0].state === 'closed') {
      const rn = await client.query('SELECT count(*)::int AS n FROM restatement');
      const rref = `RST-${String(rn.rows[0].n + 1).padStart(4, '0')}`;
      const certs = await client.query(
        'SELECT number FROM certificate WHERE period = $1 ORDER BY number', [period.rows[0].id]
      );
      await client.query(
        `INSERT INTO restatement (reference,balance_period,reason,state,certificates,opened_by,effective_on)
         VALUES ($1,$2,$3,'open',$4,$5,$6)`,
        [rref, period.rows[0].id,
          `A consumption on ${ref} with an effective date of ${effectiveOn} falls inside the closed period ${period.rows[0].id}.`,
          JSON.stringify(certs.rows.map((x) => x.number)), session.email, effectiveOn]
      );
      await appendEntry(client, {
        act: 'restatement_opened', person: session.email, site: run.site, object_kind: 'restatement', object_ref: rref,
        content: { balance_period: period.rows[0].id, triggered_by: ref, effective_on: effectiveOn },
        effective_on: effectiveOn
      });
      throw refuse(409, 'period_closed', `This period is closed. Corrections require a restatement. ${rref} has been opened.`,
        { balance_period: period.rows[0].id, restatement: rref });
    }

    const n = await client.query('SELECT count(*)::int AS n FROM consumption');
    const cref = `CSP-${String(n.rows[0].n + 1).padStart(4, '0')}`;
    await client.query(
      `INSERT INTO consumption (reference,run,input_kind,input_ref,mass_g,event_at,effective_on,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [cref, ref, inputKind, body.input_ref, massG, body.event_at || new Date().toISOString(), effectiveOn, session.email]
    );

    // Credits enter when a claimable batch is consumed, in dry mass times the
    // site's conversion factor. A non-claimable batch grants nothing at all.
    let credit = null;
    if (inputKind === 'batch' && period.rows.length) {
      const b = await resolveBatchByRef(body.input_ref);
      if (b && b.claimable) {
        const factor = await client.query(
          `SELECT * FROM conversion_factor WHERE site = $1 AND superseded_by IS NULL ORDER BY version DESC LIMIT 1`,
          [run.site]
        );
        if (factor.rows.length) {
          const granted = creditG(massG, factor.rows[0].factor_bp);
          if (granted > 0) {
            const mn = await client.query('SELECT count(*)::int AS n FROM credit_movement');
            const mref = `CM-${String(mn.rows[0].n + 1).padStart(4, '0')}`;
            await client.query(
              `INSERT INTO credit_movement (reference,balance_period,direction,category,mass_g,movement,source_kind,
                 source_ref,factor_ref,fresh_credit,derivation,event_at,effective_on,recorded_by)
               VALUES ($1,$2,'in',$3,$4,'consumption','consumption',$5,$6,true,$7,$8,$9,$10)`,
              [mref, period.rows[0].id, b.category, granted, cref, factor.rows[0].reference,
                JSON.stringify({ batch: body.input_ref, dry_mass_consumed_g: massG, factor_bp: factor.rows[0].factor_bp,
                  formula: `dry_mass_consumed_g ${massG} * factor_bp ${factor.rows[0].factor_bp} / 10000, floored = ${granted}` }),
                body.event_at || new Date().toISOString(), effectiveOn, session.email]
            );
            credit = { movement: mref, category: b.category, mass_g: granted, factor_bp: factor.rows[0].factor_bp };
          }
        }
      }
    }

    await appendEntry(client, {
      act: 'consumption_recorded', person: session.email, site: run.site,
      object_kind: 'consumption', object_ref: cref,
      content: { run: ref, input: body.input_ref, mass_g: massG, credit_granted: credit },
      effective_on: effectiveOn
    });
    return { status: 201, body: { reference: cref, run: ref, input_kind: inputKind, input_ref: body.input_ref, mass_g: massG, credit_granted: credit } };
  }));
  return c.json(result.body, result.status);
});

operations.post('/runs/:reference/outputs', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'plant_operator');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);
  const massG = requireNonNegativeInteger(body.mass_g, 'mass_g');
  if (!['intermediate', 'lot', 'byproduct'].includes(body.kind)) {
    throw refuse(400, 'unknown_output_kind', 'An output kind is one of intermediate, lot or byproduct.');
  }
  if (body.kind === 'byproduct' && !['sold', 'disposed'].includes(body.disposition)) {
    throw refuse(400, 'byproduct_disposition_required',
      'A byproduct carries a disposition of sold or disposed. A sold byproduct takes a share of the claim; a disposed one is a loss.');
  }

  const result = await idempotent(c, `POST /api/runs/${ref}/outputs`, body, async () => tx(async (client) => {
    const run = await assertRunOpen(client, ref);
    const n = await client.query('SELECT count(*)::int AS n FROM output');
    const letter = { dissolution: 'D', depolymerisation: 'Y', purification: 'U', repolymerisation: 'R' }[run.run_type];
    const oref = body.reference
      || (body.kind === 'lot' ? `LOT-N6-${String(n.rows[0].n + 1).padStart(4, '0')}`
        : `OUT-${letter}-${String(n.rows[0].n + 1).padStart(4, '0')}`);
    const effectiveOn = body.effective_on || String(run.effective_on).slice(0, 10);
    await client.query(
      `INSERT INTO output (reference,run,kind,mass_g,disposition,allocation_basis,event_at,effective_on,recorded_by)
       VALUES ($1,$2,$3,$4,$5,'mass',$6,$7,$8)`,
      [oref, ref, body.kind, massG, body.disposition || null,
        body.event_at || new Date().toISOString(), effectiveOn, session.email]
    );
    if (body.kind === 'lot') {
      const period = await client.query(
        `SELECT id FROM balance_period WHERE site = $1 AND $2::date BETWEEN period_from AND period_to LIMIT 1`,
        [run.site, effectiveOn]
      );
      await client.query(
        `INSERT INTO lot (reference,output_ref,grade,site,mass_g,disposition,claim_type,specification_version,
           balance_period,event_at,effective_on,recorded_by)
         VALUES ($1,$1,$2,$3,$4,'pending','mass_balance',3,$5,$6,$7,$8)`,
        [oref, body.grade || 'N6', run.site, massG, period.rows[0]?.id || null,
          body.event_at || new Date().toISOString(), effectiveOn, session.email]
      );
    }
    await appendEntry(client, {
      act: 'output_recorded', person: session.email, site: run.site, object_kind: 'output', object_ref: oref,
      content: { run: ref, kind: body.kind, mass_g: massG, disposition: body.disposition || null },
      effective_on: effectiveOn
    });
    return { status: 201, body: { reference: oref, run: ref, kind: body.kind, mass_g: massG, disposition: body.disposition || null } };
  }));
  return c.json(result.body, result.status);
});

operations.post('/runs/:reference/close', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'plant_operator');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);

  const result = await idempotent(c, `POST /api/runs/${ref}/close`, body, async () => tx(async (client) => {
    const r = await client.query('SELECT * FROM run WHERE reference = $1 FOR UPDATE', [ref]);
    if (!r.rows.length) throw refuse(404, 'no_such_run', `No run is recorded at ${ref}.`);
    const run = r.rows[0];
    if (run.state === 'closed') {
      // A second close answers 409 and is itself recorded as an attempt.
      await appendEntry(client, {
        act: 'run_close_attempted', person: session.email, site: run.site, object_kind: 'run',
        object_ref: ref, outcome: 'refused',
        content: { detail: 'the run was already closed', closed_at: run.closed_at }
      });
      throw refuse(409, 'run_already_closed',
        `${ref} closed at ${run.closed_at}. A closed run refuses a second close, and the attempt is recorded.`);
    }

    const cons = await client.query('SELECT COALESCE(SUM(mass_g),0) AS g FROM consumption WHERE run = $1', [ref]);
    const outs = await client.query('SELECT COALESCE(SUM(mass_g),0) AS g FROM output WHERE run = $1', [ref]);
    const massIn = Number(cons.rows[0].g);
    const massOut = Number(outs.rows[0].g);
    const losses = massIn - massOut;

    await client.query(
      `UPDATE run SET state = 'closed', closed_at = $1, losses_g = $2, actual_set_points = COALESCE($3, actual_set_points)
       WHERE reference = $4`,
      [body.closed_at || new Date().toISOString(), losses,
        body.actual_set_points ? JSON.stringify(body.actual_set_points) : null, ref]
    );

    // A run outside its recipe tolerance raises a deviation whether or not its
    // output passed its tests.
    const row = await client.query('SELECT * FROM run WHERE reference = $1', [ref]);
    const shaped = await shapeRun(row.rows[0]);
    let deviation = null;
    if (!shaped.within_tolerance) {
      const dn = await client.query('SELECT count(*)::int AS n FROM deviation');
      deviation = `DEV-${String(dn.rows[0].n + 1).padStart(4, '0')}`;
      const lots = await client.query("SELECT reference FROM lot WHERE output_ref IN (SELECT reference FROM output WHERE run = $1)", [ref]);
      await client.query(
        `INSERT INTO deviation (reference,state,title,detail,runs,lots,raised_by,event_at,effective_on)
         VALUES ($1,'open',$2,$3,$4,$5,$6,now(),$7)`,
        [deviation, `${ref} ran outside its recipe tolerance`,
          shaped.excursions.map((e) => `${e.parameter} reached ${e.actual} against a tolerance of ${e.tolerance[0]} to ${e.tolerance[1]}`).join('; '),
          JSON.stringify([ref]), JSON.stringify(lots.rows.map((x) => x.reference)),
          session.email, String(run.effective_on).slice(0, 10)]
      );
      await appendEntry(client, {
        act: 'deviation_raised', person: session.email, site: run.site, object_kind: 'deviation', object_ref: deviation,
        content: { runs: [ref], reason: 'outside recipe tolerance', excursions: shaped.excursions }
      });
    }

    await appendEntry(client, {
      act: 'run_closed', person: session.email, site: run.site, object_kind: 'run', object_ref: ref,
      content: { mass_in_g: massIn, mass_out_g: massOut, losses_g: losses, within_tolerance: shaped.within_tolerance }
    });

    return { status: 201, body: { ...shaped, deviation_raised: deviation, queued: false } };
  }));
  return c.json(result.body, result.status);
});

// ------------------------------------------------------------------ lots

async function shapeLot(l) {
  const [claim, overrides, deviations, tests] = await Promise.all([
    lotClaim(l.reference),
    rq('SELECT reference, separation, reviewed, authorised_by, reason, effective_on FROM separation_override WHERE lot = $1', [l.reference]),
    rq(`SELECT reference, state, title, outcome FROM deviation
         WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(lots) x WHERE x = $1)`, [l.reference]),
    rq('SELECT reference, property, method, value, unit, uncertainty_bp, analyst, entered_by, method_mismatch, usable_for_release FROM test_result WHERE subject_ref = $1', [l.reference])
  ]);

  // A lapsed calibration flags every lot downstream, and a missing custody link
  // names its kind on every lot downstream too.
  const flags = [];
  const batches = await rq(
    `WITH RECURSIVE up(ref, kind) AS (
       SELECT c.input_ref, c.input_kind FROM consumption c
         JOIN output o ON o.run = c.run WHERE o.reference = $1
       UNION
       SELECT c.input_ref, c.input_kind FROM consumption c
         JOIN output o ON o.run = c.run JOIN up ON up.ref = o.reference AND up.kind = 'output')
     SELECT DISTINCT ref FROM up WHERE kind = 'batch'`, [l.output_ref]
  );
  for (const b of batches) {
    const resolved = await resolveBatchByRef(b.ref);
    if (!resolved) continue;
    for (const f of resolved.flags) if (!flags.includes(f)) flags.push(f);
    if (!resolved.custody_complete) {
      const label = `custody_link_missing:${resolved.custody_missing[0]}`;
      if (!flags.includes(label)) flags.push(label);
    }
  }
  if (overrides.some((o) => !o.reviewed)) flags.push('unreviewed_override');
  if (deviations.some((d) => d.state === 'open')) flags.push('open_deviation');

  return {
    reference: l.reference,
    grade: l.grade,
    site: l.site,
    mass_g: Number(l.mass_g),
    disposition: l.disposition,
    // The claim type is returned at the same weight as the percentage: no
    // response carries the percentage without the type beside it.
    claim_type: l.claim_type,
    content_bp: claim.content_bp,
    credit_attached_g: claim.credit_attached_g,
    category_split: claim.category_split,
    specification: l.specification,
    specification_version: l.specification_version,
    balance_period: l.balance_period,
    blended_from: l.blended_from,
    blended_sites: l.blended_sites,
    flags,
    overrides: overrides.map((o) => ({
      reference: o.reference, separation: o.separation, reviewed: o.reviewed,
      authorised_by: o.authorised_by, reason: o.reason,
      effective_on: String(o.effective_on).slice(0, 10)
    })),
    deviations,
    test_results: tests,
    output_ref: l.output_ref,
    effective_on: String(l.effective_on).slice(0, 10),
    derivation: claim.derivation
  };
}

operations.get('/lots', async (c) => {
  refusePaging(c);
  const rows = await rq('SELECT * FROM lot ORDER BY reference');
  return c.json(await Promise.all(rows.map(shapeLot)));
});

operations.get('/lots/:reference', async (c) => {
  const l = await rq1('SELECT * FROM lot WHERE reference = $1', [c.req.param('reference')]);
  if (!l) throw refuse(404, 'no_such_lot', `No lot is recorded at ${c.req.param('reference')}.`);
  return c.json(await shapeLot(l));
});

/** A yield figure answers for plant operations, quality and the claims manager,
 *  and refuses a collector and a converter. It appears on no certificate, in no
 *  certificate document and in no verification answer. */
operations.get('/lots/:reference/yield', async (c) => {
  const session = requireRole(c, 'plant_operator', 'quality_manager', 'claims_manager', 'auditor');
  const ref = c.req.param('reference');
  const l = await rq1('SELECT * FROM lot WHERE reference = $1', [ref]);
  if (!l) throw refuse(404, 'no_such_lot', `No lot is recorded at ${ref}.`);

  const chain = await rq(
    `WITH RECURSIVE up(run) AS (
       SELECT o.run FROM output o WHERE o.reference = $1
       UNION
       SELECT o.run FROM output o JOIN consumption c ON c.input_ref = o.reference
         JOIN up ON up.run = c.run)
     SELECT r.reference, r.run_type,
       (SELECT COALESCE(SUM(mass_g),0) FROM consumption WHERE run = r.reference) AS in_g,
       (SELECT COALESCE(SUM(mass_g),0) FROM output WHERE run = r.reference) AS out_g,
       r.losses_g
     FROM run r JOIN up ON up.run = r.reference ORDER BY r.started_at`, [l.output_ref]
  );

  const totalIn = chain.reduce((s, r) => s + Number(r.in_g), 0);
  const totalOut = chain.reduce((s, r) => s + Number(r.out_g), 0);
  const totalLosses = chain.reduce((s, r) => s + Number(r.losses_g || 0), 0);

  return c.json({
    lot: ref,
    // Losses reduce the claim: material that disappears in processing does not
    // carry its claim forward.
    stages: chain.map((r) => ({
      run: r.reference, run_type: r.run_type,
      mass_in_g: Number(r.in_g), mass_out_g: Number(r.out_g),
      losses_g: Number(r.losses_g || 0),
      yield_bp: Number(r.in_g) ? Math.floor(Number(r.out_g) * 10000 / Number(r.in_g)) : 0
    })),
    total_mass_in_g: totalIn,
    total_mass_out_g: totalOut,
    total_losses_g: totalLosses,
    overall_yield_bp: totalIn ? Math.floor(totalOut * 10000 / totalIn) : 0,
    audience: 'plant operations, quality and the claims manager',
    note: 'A yield figure appears on no certificate, in no certificate document and in no verification answer.',
    derivation: { overall_yield_bp: `total mass out ${totalOut} g * 10000 / total mass in ${totalIn} g, floored` }
  });
});

export { shapeRun, shapeLot, nextRef };
