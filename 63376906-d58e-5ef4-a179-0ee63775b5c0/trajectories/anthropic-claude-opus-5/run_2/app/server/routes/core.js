import { q, one, pool, tx } from '../lib/db.js';
import { keycloakPassword, personFor, issueToken } from '../lib/auth.js';
import {
  refuse, requireSession, requireRole, idempotent, record, refuseParams,
  refuseComputedInput, requireInteger, requireOneOf, refuseAuditorWrite, nextReference,
} from '../lib/http.js';
import {
  collectorView, batchView, batchViewFromRow, iso, partyNameOn, CUSTODY_KINDS,
  approvalInForce, monthsBetween,
} from '../lib/engine.js';
import { dryMassG } from '../lib/arith.js';

export default function mount(app) {
  /* ---------------------------------------------------------- identity */
  app.post('/auth/login', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { email, password } = body || {};
    if (!email || !password) {
      refuse(400, 'credentials_required', { message: 'An email and a password are required.' });
    }
    const claims = await keycloakPassword(email, password);
    if (!claims) {
      await record(c, {
        actor: String(email), action: 'sign_in_refused', object_kind: 'session', object_ref: String(email),
        outcome: 'refused', content: { reason: 'credentials_not_accepted' },
      });
      refuse(401, 'credentials_not_accepted', { message: 'That email and password were not accepted.' });
    }
    const person = await personFor(claims.email);
    if (!person) {
      refuse(403, 'no_account', { message: 'Signup is closed and this identity holds no account.' });
    }
    const access_token = issueToken({ email: person.email, identifier: person.identifier });
    await record(c, {
      actor: person.identifier, action: 'signed_in', object_kind: 'session', object_ref: person.identifier,
      content: { email: person.email, role: person.role },
    });
    return c.json({
      access_token, token_type: 'Bearer', expires_in: 12 * 60 * 60,
      email: person.email, roles: [person.role], sites: person.sites, name: person.name,
    });
  });

  app.get('/auth/me', async (c) => {
    const s = requireSession(c);
    return c.json({
      email: s.email, name: s.name, roles: s.roles, sites: s.sites,
      identifier: s.identifier, grant_ends_on: iso(s.grant_ends_on),
    });
  });

  /* ------------------------------------------------------------- sites */
  app.get('/sites', async (c) => {
    const rows = await q('SELECT * FROM site ORDER BY nameplate_kg ASC');
    return c.json(rows.map((s) => ({
      reference: s.reference, name: s.name, confidence: s.confidence,
      certification_state: s.certification_state,
    })));
  });

  app.get('/sites/:reference/capacity', async (c) => {
    const s = await one('SELECT * FROM site WHERE reference = $1', [c.req.param('reference')]);
    if (!s) refuse(404, 'no_such_site', { message: 'There is no such site.' });
    return c.json({
      reference: s.reference,
      name: s.name,
      nameplate_kg: Number(s.nameplate_kg),
      basis: s.basis,
      contracted_kg: Number(s.contracted_kg),
      // uncommitted_kg is computed and is allowed to be negative.
      uncommitted_kg: Number(s.nameplate_kg) - Number(s.contracted_kg),
      confidence: s.confidence,
      last_revised: iso(s.last_revised),
      certification_state: s.certification_state,
      derivation: { uncommitted_kg: 'nameplate_kg minus contracted_kg' },
    });
  });

  app.get('/sites/:reference/certification', async (c) => {
    const ref = c.req.param('reference');
    const rows = await q(
      'SELECT * FROM site_certification WHERE site = $1 ORDER BY effective_from ASC', [ref]);
    return c.json(rows.map((r) => ({
      reference: r.id, site: r.site, state: r.state, grade: r.grade,
      effective_from: iso(r.effective_from), effective_to: iso(r.effective_to),
      reason: r.reason, recorded_at: r.recorded_at,
    })));
  });

  // A suspension may carry an effective_from that precedes the date it was recorded.
  app.post('/sites/:reference/certification', async (c) => {
    const s = requireRole(c, 'quality_manager', 'claims_manager');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const site = await one('SELECT * FROM site WHERE reference = $1', [ref]);
    if (!site) refuse(404, 'no_such_site', { message: 'There is no such site.' });
    const state = requireOneOf(body, 'state', ['certified', 'suspended', 'not_certified']);
    const effective_from = body.effective_from;
    if (!effective_from) refuse(400, 'field_required', { message: 'effective_from is required.', field: 'effective_from' });

    const result = await idempotent(c, body, async () => {
      const id = await nextReference('CRTP');
      await pool.query(
        `INSERT INTO site_certification (id, site, state, grade, effective_from, effective_to, reason, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, ref, state, body.grade || null, effective_from, body.effective_to || null, body.reason || null, s.identifier]);
      await pool.query('UPDATE site SET certification_state = $1 WHERE reference = $2',
        [state === 'suspended' ? 'suspended' : state, ref]);

      // Every certificate signed inside the window, each individually resolved.
      const certs = await q(
        `SELECT * FROM certificate WHERE site = $1 AND signed_at >= $2 ${body.effective_to ? 'AND signed_at <= $3' : ''}`,
        body.effective_to ? [ref, effective_from, body.effective_to] : [ref, effective_from]);
      const inWindow = certs
        .filter((x) => !body.grade || x.grade === body.grade)
        .map((x) => ({
          number: x.number, version: x.version, grade: x.grade, state: x.state,
          recipient: x.recipient, recipient_name: x.recipient_name, signed_at: x.signed_at,
          resolution_outcomes: ['reissued', 'withdrawn', 'unaffected'],
          resolution: null,
        }));
      await record(c, {
        action: state === 'suspended' ? 'site_certification_suspended' : 'site_certification_recorded',
        object_kind: 'site_certification', object_ref: id, site: ref,
        content: { state, effective_from, effective_to: body.effective_to || null, reason: body.reason || null, certificates_in_window: inWindow.map((x) => x.number) },
      });
      return {
        status: 201,
        body: {
          reference: id, site: ref, state, effective_from,
          effective_to: body.effective_to || null, reason: body.reason || null,
          certificates_in_window: inWindow,
          issuing_blocked: state === 'suspended',
          blocking_condition: state === 'suspended'
            ? `Certification for ${ref}${body.grade ? ' grade ' + body.grade : ''} is suspended from ${effective_from}.`
            : null,
          reinstates_withdrawn: false,
          note: state !== 'suspended'
            ? 'Lifting a suspension restores issuing from the moment the lift takes effect and reinstates no withdrawn certificate.'
            : null,
        },
      };
    });
    return c.json(result.body, result.status);
  });

  /* -------------------------------------------------------- collectors */
  app.get('/collectors', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT reference FROM collector ORDER BY reference ASC');
    const out = [];
    for (const r of rows) out.push(await collectorView(r.reference));
    return c.json(out);
  });

  app.get('/collectors/:reference', async (c) => {
    requireSession(c);
    const v = await collectorView(c.req.param('reference'));
    if (!v) refuse(404, 'no_such_collector', { message: 'There is no such collector.' });
    return c.json(v);
  });

  // Approving, suspending or lapsing a collector is reserved for a quality manager.
  app.post('/collectors/:reference/approvals', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'quality_manager');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const collector = await one('SELECT * FROM collector WHERE reference = $1', [ref]);
    if (!collector) refuse(404, 'no_such_collector', { message: 'There is no such collector.' });
    const state = requireOneOf(body, 'state', ['approved', 'conditional', 'suspended', 'lapsed']);
    if (!body.valid_from || !body.valid_to) {
      refuse(400, 'field_required', { message: 'valid_from and valid_to are required: an approval is a dated period.' });
    }
    if (state === 'conditional' && (!body.condition || !body.condition_closes_on)) {
      refuse(400, 'condition_required', {
        message: 'A conditional approval names its condition and the date it must be closed by.',
      });
    }
    const result = await idempotent(c, body, async () => {
      const id = await nextReference('AP');
      await pool.query(
        `INSERT INTO approval_period (id, collector, state, valid_from, valid_to, condition, condition_closes_on, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, ref, state, body.valid_from, body.valid_to, body.condition || null, body.condition_closes_on || null, s.identifier]);
      await record(c, {
        action: `collector_${state}`, object_kind: 'approval_period', object_ref: id,
        content: { collector: ref, state, valid_from: body.valid_from, valid_to: body.valid_to, condition: body.condition || null },
      });
      return { status: 201, body: { reference: id, ...(await collectorView(ref)) } };
    });
    return c.json(result.body, result.status);
  });

  /* ------------------------------------------------------------ parties */
  app.get('/parties/:reference/versions', async (c) => {
    refuseParams(c);
    const rows = await q(
      'SELECT * FROM party_version WHERE party_reference = $1 ORDER BY effective_from ASC',
      [c.req.param('reference')]);
    return c.json(rows.map((r) => ({
      reference: r.id, party: r.party_reference, kind: r.kind, name: r.name,
      effective_from: iso(r.effective_from), superseded_by: r.superseded_by,
    })));
  });

  // A new name from an effective date supersedes the previous version rather
  // than rewriting it.
  app.post('/parties/:reference/versions', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'quality_manager', 'claims_manager');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    if (!body.name || !body.effective_from) {
      refuse(400, 'field_required', { message: 'name and effective_from are required.' });
    }
    const result = await idempotent(c, body, async () => {
      const prior = await one(
        `SELECT * FROM party_version WHERE party_reference = $1 AND superseded_by IS NULL
         ORDER BY effective_from DESC LIMIT 1`, [ref]);
      const id = await nextReference('PV');
      await pool.query(
        `INSERT INTO party_version (id, party_reference, kind, name, effective_from)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, ref, body.kind || prior?.kind || 'party', body.name, body.effective_from]);
      if (prior) await pool.query('UPDATE party_version SET superseded_by = $1 WHERE id = $2', [id, prior.id]);
      await record(c, {
        action: 'party_version_recorded', object_kind: 'party_version', object_ref: id,
        content: { party: ref, name: body.name, effective_from: body.effective_from, supersedes: prior?.id || null },
      });
      return { status: 201, body: { reference: id, party: ref, name: body.name, effective_from: body.effective_from, supersedes: prior?.id || null } };
    });
    return c.json(result.body, result.status);
  });

  /* ------------------------------------------------------------ batches */
  app.get('/batches', async (c) => {
    refuseParams(c);
    const s = requireSession(c);
    const rows = await q('SELECT * FROM batch ORDER BY received_on ASC');
    const out = [];
    for (const r of rows) out.push(await batchViewFromRow(r));
    return c.json(out);
  });

  app.get('/batches/:reference', async (c) => {
    requireSession(c);
    const v = await batchView(c.req.param('reference'));
    if (!v) refuse(404, 'no_such_batch', { message: 'There is no such batch.' });
    return c.json(v);
  });

  app.post('/batches', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'plant_operator', 'quality_manager');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);

    // category is required at intake and has no default.
    const category = requireOneOf(body, 'category', ['post_consumer', 'pre_consumer']);
    const collectorRef = body.collector;
    if (!collectorRef) refuse(400, 'field_required', { message: 'collector is required.', field: 'collector' });
    const collector = await one('SELECT * FROM collector WHERE reference = $1', [collectorRef]);
    if (!collector) refuse(400, 'no_such_collector', { message: 'There is no such collector.' });
    const siteRef = body.site;
    const site = await one('SELECT * FROM site WHERE reference = $1', [siteRef]);
    if (!site) refuse(400, 'no_such_site', { message: 'There is no such site.' });
    const gross_g = requireInteger(body, 'gross_g');
    const tare_g = requireInteger(body, 'tare_g');
    const net_g = requireInteger(body, 'net_g');
    const moisture_bp = requireInteger(body, 'moisture_bp');
    if (moisture_bp > 10000) refuse(400, 'out_of_range', { message: 'moisture_bp is a proportion in basis points.', field: 'moisture_bp' });
    if (!body.received_on) refuse(400, 'field_required', { message: 'received_on is required.', field: 'received_on' });
    const device = await one('SELECT * FROM weighing_device WHERE reference = $1', [body.device]);
    if (!device) refuse(400, 'no_such_device', { message: 'There is no such weighing device.', field: 'device' });
    if (!body.moisture_method) refuse(400, 'field_required', { message: 'moisture_method is required.', field: 'moisture_method' });

    const custody = Array.isArray(body.custody) ? body.custody : [];
    for (const link of custody) {
      if (!CUSTODY_KINDS.includes(link.kind)) {
        refuse(400, 'value_not_permitted', { message: `A custody link kind is one of ${CUSTODY_KINDS.join(', ')}.`, field: 'custody.kind' });
      }
      if (!link.date || !link.party) {
        refuse(400, 'field_required', { message: 'Every custody link carries a date and a party.' });
      }
    }

    const result = await idempotent(c, body, async () => {
      const reference = await nextReference('BATCH', 4);
      const received_on = String(body.received_on).slice(0, 10);
      // A batch and its weighing land together or neither lands.
      await tx(async (client) => {
        await client.query(
          `INSERT INTO batch (reference, collector, site, grade, category, gross_g, tare_g, net_g, moisture_bp,
            moisture_method, device, received_on, composition, contamination, accepted_g, event_at, effective_on, created_by, closed)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$8,$15,$12,$16,true)`,
          [reference, collectorRef, siteRef, body.grade || 'N6', category, gross_g, tare_g, net_g, moisture_bp,
            body.moisture_method, body.device, received_on,
            JSON.stringify(body.composition || {}), JSON.stringify(body.contamination || {}),
            body.event_at || received_on + 'T00:00:00Z', s.identifier]);
        let ordinal = 0;
        for (const link of custody) {
          await client.query(
            `INSERT INTO custody_link (id, batch, ordinal, kind, link_date, party) VALUES ($1,$2,$3,$4,$5,$6)`,
            [`CUS-${reference}-${link.kind}`, reference, ordinal++, link.kind, String(link.date).slice(0, 10), link.party]);
        }
        const lapsed = monthsBetween(iso(device.calibrated_on), received_on) >= 12;
        await client.query(
          `INSERT INTO weighing (reference, batch, device, gross_g, tare_g, net_g, calibration_state, weighed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [`WGH-${reference}`, reference, body.device, gross_g, tare_g, net_g,
            lapsed ? 'lapsed' : 'in_calibration', body.event_at || received_on + 'T00:00:00Z']);
      });

      // A measured composition departing from the declaration by more than 500
      // basis points raises a finding against the collector, not against the plant.
      const comp = body.composition || {};
      if (comp.measured_fraction_bp !== undefined && comp.fraction_bp !== undefined) {
        const departure = Math.abs(Number(comp.measured_fraction_bp) - Number(comp.fraction_bp));
        if (departure > 500) {
          const fid = await nextReference('FND');
          await pool.query(
            `INSERT INTO collector_finding (id, collector, kind, detail, raised_on, due_on, state, batch, departure_bp)
             VALUES ($1,$2,'declaration_departure',$3,$4,$5,'open',$6,$7)`,
            [fid, collectorRef,
              `Declared ${comp.polymer || 'polymer'} fraction of ${comp.fraction_bp} basis points measured at ${comp.measured_fraction_bp} basis points on ${reference}, a departure of ${departure} basis points.`,
              received_on, null, reference, departure]);
          await record(c, {
            action: 'collector_finding_raised', object_kind: 'collector_finding', object_ref: fid,
            content: { collector: collectorRef, batch: reference, departure_bp: departure },
          });
        }
      }

      const view = await batchView(reference);
      await record(c, {
        action: 'batch_booked_in', object_kind: 'batch', object_ref: reference, site: siteRef,
        content: {
          collector: collectorRef, category, net_g, moisture_bp, received_on,
          dry_mass_g: view.dry_mass_g, claimable: view.claimable, claimable_reason: view.claimable_reason,
        },
      });
      await record(c, {
        action: 'weighing_recorded', object_kind: 'weighing', object_ref: `WGH-${reference}`, site: siteRef,
        content: { batch: reference, device: body.device, net_g, calibration_state: view.flags.includes('lapsed_calibration') ? 'lapsed' : 'in_calibration' },
      });
      return { status: 201, body: { reference, ...view } };
    });
    return c.json(result.body, result.status);
  });

  // A batch category cannot be changed after acceptance, by anybody, through any route.
  app.patch('/batches/:reference', async (c) => {
    refuseAuditorWrite(c);
    const s = requireSession(c);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const batch = await one('SELECT * FROM batch WHERE reference = $1', [ref]);
    if (!batch) refuse(404, 'no_such_batch', { message: 'There is no such batch.' });
    if (body.category !== undefined) {
      await record(c, {
        action: 'batch_category_change_refused', object_kind: 'batch', object_ref: ref, site: batch.site,
        outcome: 'refused', content: { attempted_category: body.category, held_category: batch.category, role: s.role },
      });
      refuse(409, 'batch_category_immutable_after_acceptance', {
        message: 'The category is required at intake, has no default, and can never be changed after acceptance. This applies to every role through every route.',
        held_category: batch.category,
        attempted_category: body.category,
      });
    }
    if (batch.closed) {
      refuse(409, 'batch_closed', { message: 'This batch is closed. A correction is a new record naming what it corrects.' });
    }
    refuse(400, 'nothing_amendable', {
      message: 'This route amends nothing else on a batch. Late custody evidence is attached at /api/batches/{reference}/custody.',
    });
  });

  // A late document makes the batch claimable from the date the evidence arrived
  // rather than from its receipt date.
  app.post('/batches/:reference/custody', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'plant_operator', 'quality_manager');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const batch = await one('SELECT * FROM batch WHERE reference = $1', [ref]);
    if (!batch) refuse(404, 'no_such_batch', { message: 'There is no such batch.' });
    const kind = requireOneOf(body, 'kind', CUSTODY_KINDS);
    if (!body.party) refuse(400, 'field_required', { message: 'party is required.', field: 'party' });
    const arrived_on = String(body.arrived_on || body.date || '').slice(0, 10);
    if (!arrived_on) refuse(400, 'field_required', { message: 'arrived_on is required: late evidence carries the date it arrived.', field: 'arrived_on' });

    const result = await idempotent(c, body, async () => {
      const existing = await q('SELECT * FROM custody_link WHERE batch = $1', [ref]);
      const id = `CUS-${ref}-${kind}`;
      await pool.query(
        `INSERT INTO custody_link (id, batch, ordinal, kind, link_date, party, arrived_on, late)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true)
         ON CONFLICT (id) DO UPDATE SET arrived_on = EXCLUDED.arrived_on, late = true`,
        [id, ref, existing.length, kind, String(body.date || arrived_on).slice(0, 10), body.party, arrived_on]);
      const after = await q('SELECT kind FROM custody_link WHERE batch = $1', [ref]);
      const complete = new Set(after.map((x) => x.kind)).size === CUSTODY_KINDS.length;
      if (complete) {
        await pool.query('UPDATE batch SET claimable_from = $1 WHERE reference = $2', [arrived_on, ref]);
      }
      const view = await batchView(ref);
      await record(c, {
        action: 'custody_link_attached', object_kind: 'batch', object_ref: ref, site: batch.site,
        content: { kind, party: body.party, arrived_on, custody_complete: view.custody_complete, claimable_from: view.claimable_from },
      });
      return { status: 201, body: { reference: id, ...view } };
    });
    return c.json(result.body, result.status);
  });

  // A rejection whose parts do not sum is refused.
  app.post('/batches/:reference/reject', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'plant_operator', 'quality_manager');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const batch = await one('SELECT * FROM batch WHERE reference = $1', [ref]);
    if (!batch) refuse(404, 'no_such_batch', { message: 'There is no such batch.' });
    const rejected_g = requireInteger(body, 'rejected_g');
    if (!body.reason) refuse(400, 'field_required', { message: 'reason is required.', field: 'reason' });
    if (!body.destination) {
      refuse(400, 'field_required', {
        message: 'destination is required: a partial rejection records where the rejected mass went.', field: 'destination',
      });
    }
    const delivered = Number(batch.net_g);
    if (rejected_g > delivered) {
      refuse(409, 'rejection_does_not_sum', {
        message: 'Accepted mass plus rejected mass equals delivered mass.',
        delivered_g: delivered, rejected_g,
      });
    }
    if (body.accepted_g !== undefined && Number(body.accepted_g) + rejected_g !== delivered) {
      refuse(409, 'rejection_does_not_sum', {
        message: 'Accepted mass plus rejected mass equals delivered mass.',
        delivered_g: delivered, rejected_g, accepted_g: Number(body.accepted_g),
      });
    }
    const result = await idempotent(c, body, async () => {
      await pool.query(
        `UPDATE batch SET rejected_g = $1, accepted_g = $2, rejected_destination = $3, rejected_reason = $4
         WHERE reference = $5`,
        [rejected_g, delivered - rejected_g, body.destination, body.reason, ref]);
      const view = await batchView(ref);
      await record(c, {
        action: 'batch_rejected', object_kind: 'batch', object_ref: ref, site: batch.site,
        content: { rejected_g, accepted_g: view.accepted_g, destination: body.destination, reason: body.reason },
      });
      return { status: 201, body: { reference: ref, ...view } };
    });
    return c.json(result.body, result.status);
  });

  app.get('/batches/:reference/weighing', async (c) => {
    requireSession(c);
    const rows = await q('SELECT * FROM weighing WHERE batch = $1', [c.req.param('reference')]);
    return c.json(rows.map((w) => ({
      reference: w.reference, batch: w.batch, device: w.device, gross_g: Number(w.gross_g),
      tare_g: Number(w.tare_g), net_g: Number(w.net_g), calibration_state: w.calibration_state,
      weighed_at: w.weighed_at,
    })));
  });

  app.get('/weighing-devices', async (c) => {
    requireSession(c);
    const rows = await q('SELECT * FROM weighing_device ORDER BY reference');
    return c.json(rows.map((d) => ({
      reference: d.reference, site: d.site, calibrated_on: iso(d.calibrated_on),
      calibration_valid_months: 12,
    })));
  });
}
