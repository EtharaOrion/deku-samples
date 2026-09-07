import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { pool, query, one, tx, nextCounter } from './db.js';
import {
  Refusal, refuse, session, requireSession, requireRole, refuseAuditorWrite,
  withIdempotency, refusePagination, recordRefusal, todayISO, nowISO, dateOnly, momentISO,
} from './lib/http.js';
import {
  authenticateAtKeycloak, issueAppToken, sessionClaimsFor, SESSION_HOURS,
} from './lib/auth.js';
import { appendEntry, checkChain, ZERO_DIGEST } from './lib/record.js';
import { sendMail } from './lib/mail.js';
import { dryMass, creditGranted, contentBp, shareBp, floorDiv, weightedContentBp, requireInteger } from './lib/num.js';
import * as engine from './engine.js';
import { renderDocument } from './seed.js';

const api = new Hono();

const SCHEME = 'RCS-2026';
const REGISTRATION = 'REG-RAVEL-0042';
const VERIFY_BASE = 'https://ravel.example.com/verify';

api.onError((err, c) => {
  if (err instanceof Refusal) return c.json(err.body, err.status);
  if (err && err.status && err.body) return c.json(err.body, err.status);
  console.error('api error', err);
  return c.json({ error: 'internal_error', detail: String(err && err.message) }, 500);
});

// ---- Health ----------------------------------------------------------------

api.get('/health', async (c) => {
  try {
    await pool.query('SELECT 1');
    return c.json({ status: 'ok', ready: true });
  } catch {
    return c.json({ status: 'degraded', ready: false }, 503);
  }
});

// ---- Identity --------------------------------------------------------------

api.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body || {};
  if (!email || !password) throw refuse(400, 'credentials_required', 'An email and a password are required.');
  const identity = await authenticateAtKeycloak(email, password);
  if (!identity) throw refuse(401, 'authentication_failed', 'The email and password were not accepted.');
  const claims = await sessionClaimsFor(identity.email, identity.roles);
  if (claims.grant_ends_on && dateOnly(claims.grant_ends_on) < todayISO()) {
    throw refuse(403, 'grant_ended', `This grant ended on ${dateOnly(claims.grant_ends_on)}. Nothing renews silently.`);
  }
  return c.json({
    access_token: issueAppToken(claims),
    token_type: 'Bearer',
    expires_in: SESSION_HOURS * 3600,
  });
});

api.get('/auth/me', (c) => {
  const s = requireSession(c);
  return c.json({ email: s.email, name: s.name, roles: s.roles, sites: s.sites, grant_ends_on: s.grant_ends_on });
});

// ---- Sites and capacity ----------------------------------------------------

api.get('/sites', async (c) => {
  const rows = await query('SELECT * FROM site ORDER BY reference');
  return c.json(rows.map((s) => ({
    reference: s.reference, name: s.name, confidence: s.confidence,
    certification_state: s.certification_state,
  })));
});

api.get('/sites/:reference/capacity', async (c) => {
  const s = await one('SELECT * FROM site WHERE reference = $1', [c.req.param('reference')]);
  if (!s) throw refuse(404, 'no_such_site', 'No such site.');
  return c.json({
    reference: s.reference,
    nameplate_kg: Number(s.nameplate_kg),
    basis: s.capacity_basis,
    contracted_kg: Number(s.contracted_kg),
    uncommitted_kg: Number(s.nameplate_kg) - Number(s.contracted_kg),
    confidence: s.confidence,
    last_revised: dateOnly(s.last_revised),
    derivation: { rule: 'nameplate_kg minus contracted_kg, and it is allowed to be negative' },
  });
});

api.get('/sites/:reference/certification', async (c) => {
  const ref = c.req.param('reference');
  const rows = await query(
    'SELECT * FROM certification_period WHERE site = $1 ORDER BY effective_from DESC, reference DESC',
    [ref]
  );
  return c.json(rows.map((r) => ({
    reference: r.reference, site: r.site, grade: r.grade, state: r.state,
    effective_from: dateOnly(r.effective_from), effective_to: dateOnly(r.effective_to),
    reason: r.reason, recorded_at: momentISO(r.recorded_at),
  })));
});

// A suspension reaches backwards: an effective_from may precede the recording date.
api.post('/sites/:reference/certification', async (c) => {
  const s = requireRole(c, 'quality_manager');
  refuseAuditorWrite(s);
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /sites/${ref}/certification`, body, async () => {
    const { state, effective_from, effective_to, grade, reason } = body;
    if (!['suspended', 'certified', 'withdrawn'].includes(state)) {
      throw refuse(400, 'state_required', 'state is one of suspended, certified, withdrawn.');
    }
    if (!effective_from) throw refuse(400, 'effective_from_required', 'An effective_from date is required.');
    const site = await one('SELECT * FROM site WHERE reference = $1', [ref]);
    if (!site) throw refuse(404, 'no_such_site', 'No such site.');

    const reference = await tx(async (client) => {
      const r = await nextCounter(client, 'certification_period', 4, 'CERTP-');
      await client.query(
        `INSERT INTO certification_period (reference,site,grade,state,effective_from,effective_to,reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [r, ref, grade || null, state, effective_from, effective_to || null, reason || null]
      );
      if (state === 'certified') {
        await client.query(
          `UPDATE certification_period SET effective_to = $1
             WHERE site = $2 AND state = 'suspended' AND effective_to IS NULL`,
          [effective_from, ref]
        );
      }
      await appendEntry(client, {
        act: state === 'suspended' ? 'site_certification_suspended' : 'site_certification_lifted',
        person: s.email, site: ref, object_kind: 'certification_period', object_ref: r,
        content: { state, effective_from, effective_to: effective_to || null, grade: grade || null, reason: reason || null },
      });
      return r;
    });

    // Every certificate signed inside the window, each individually resolved.
    const window = await query(
      `SELECT * FROM certificate WHERE site = $1 AND issued_on >= $2 AND ($3::date IS NULL OR issued_on <= $3)
        ${grade ? 'AND grade = $4' : ''} ORDER BY number`,
      grade ? [ref, effective_from, effective_to || null, grade] : [ref, effective_from, effective_to || null]
    );
    return {
      status: 201,
      body: {
        reference,
        site: ref,
        state,
        effective_from,
        effective_to: effective_to || null,
        grade: grade || null,
        reason: reason || null,
        certificates_in_window: window.map((cert) => ({
          number: cert.number, version: cert.version, issued_on: dateOnly(cert.issued_on),
          recipient: cert.recipient, recipient_name: cert.recipient_name, state: cert.state,
          resolutions_available: ['reissued', 'withdrawn', 'unaffected'],
          resolution: null,
        })),
        issuing_blocked: state === 'suspended',
        blocking_condition: state === 'suspended'
          ? `The certification for ${ref}${grade ? ` grade ${grade}` : ''} is suspended from ${effective_from}.`
          : null,
        note: state === 'certified'
          ? 'Lifting a suspension restores issuing from the moment it takes effect. It reinstates no withdrawn certificate: the remedy is a new certificate.'
          : null,
      },
    };
  });
});

// ---- Parties ---------------------------------------------------------------

api.get('/parties/:reference/versions', async (c) => {
  refusePagination(c);
  const rows = await query(
    'SELECT * FROM party_version WHERE reference = $1 ORDER BY effective_from, id',
    [c.req.param('reference')]
  );
  return c.json(rows.map((r, i) => ({
    reference: r.reference,
    name: r.name,
    effective_from: dateOnly(r.effective_from),
    superseded_on: rows[i + 1] ? dateOnly(rows[i + 1].effective_from) : null,
    recorded_at: momentISO(r.recorded_at),
  })));
});

api.post('/parties/:reference/versions', async (c) => {
  const s = requireRole(c, 'quality_manager', 'claims_manager');
  refuseAuditorWrite(s);
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /parties/${ref}/versions`, body, async () => {
    const { name, effective_from } = body;
    if (!name || !effective_from) throw refuse(400, 'name_and_date_required', 'A name and an effective_from date are required.');
    const reference = await tx(async (client) => {
      const r = await client.query(
        'INSERT INTO party_version (reference,name,effective_from) VALUES ($1,$2,$3) RETURNING id',
        [ref, name, effective_from]
      );
      const id = `PV-${r.rows[0].id}`;
      await appendEntry(client, {
        act: 'party_version_recorded', person: s.email, object_kind: 'party', object_ref: ref,
        content: { name, effective_from, note: 'The previous version is superseded rather than rewritten.' },
      });
      return id;
    });
    return { status: 201, body: { reference, party: ref, name, effective_from, supersedes_previous: true } };
  });
});

// ---- Collectors ------------------------------------------------------------

async function collectorPayload(row) {
  const periods = await query(
    'SELECT * FROM approval_period WHERE collector = $1 ORDER BY valid_from',
    [row.reference]
  );
  const findings = await query('SELECT * FROM finding WHERE collector = $1 ORDER BY reference', [row.reference]);
  const today = todayISO();
  return {
    reference: row.reference,
    name: row.name,
    country: row.country,
    registration: row.registration,
    registration_expiry: dateOnly(row.registration_expiry),
    collection_site_types: row.site_types,
    declared_streams: row.declared_streams,
    scheme_status: row.scheme_status,
    declared_polymer: row.declared_polymer,
    declared_fraction_bp: row.declared_fraction_bp,
    findings: findings.map((f) => ({
      reference: f.reference, kind: f.kind, detail: f.detail, batch: f.batch,
      departure_bp: f.departure_bp, raised_on: dateOnly(f.raised_on),
      due_on: dateOnly(f.due_on), state: f.state,
      past_its_date: f.state === 'open' && f.due_on && dateOnly(f.due_on) < today,
    })),
    approval_periods: periods.map((p) => ({
      reference: p.reference,
      state: p.state,
      valid_from: dateOnly(p.valid_from),
      valid_to: dateOnly(p.valid_to),
      expiring: engine.approvalExpiring(p, today),
      ...(p.state === 'conditional'
        ? { condition: p.condition, condition_closes_on: dateOnly(p.condition_closes_on) }
        : {}),
    })),
  };
}

api.get('/collectors', async (c) => {
  refusePagination(c);
  requireSession(c);
  const rows = await query('SELECT * FROM collector ORDER BY reference');
  return c.json(await Promise.all(rows.map(collectorPayload)));
});

api.get('/collectors/:reference', async (c) => {
  requireSession(c);
  const row = await one('SELECT * FROM collector WHERE reference = $1', [c.req.param('reference')]);
  if (!row) throw refuse(404, 'no_such_collector', 'No such collector.');
  return c.json(await collectorPayload(row));
});

api.post('/collectors/:reference/approvals', async (c) => {
  const s = requireSession(c);
  refuseAuditorWrite(s);
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  if (!(s.roles || []).includes('quality_manager')) {
    await recordRefusal({
      act: 'collector_approval_refused', person: s.email, object_kind: 'collector', object_ref: ref,
      content: { reason: 'only a quality manager approves, suspends or lapses a collector', roles: s.roles },
    });
    throw refuse(403, 'role_not_held', 'Only a quality manager approves, suspends or lapses a collector.');
  }
  return withIdempotency(c, `POST /collectors/${ref}/approvals`, body, async () => {
    const { state, valid_from, valid_to, condition, condition_closes_on } = body;
    if (!['approved', 'conditional', 'suspended', 'lapsed'].includes(state)) {
      throw refuse(400, 'state_invalid', 'state is one of approved, conditional, suspended, lapsed.');
    }
    if (!valid_from || !valid_to) throw refuse(400, 'dates_required', 'A valid_from and a valid_to date are required.');
    if (state === 'conditional' && (!condition || !condition_closes_on)) {
      throw refuse(400, 'condition_required', 'A conditional approval names its condition and the date it must be closed by.');
    }
    const col = await one('SELECT * FROM collector WHERE reference = $1', [ref]);
    if (!col) throw refuse(404, 'no_such_collector', 'No such collector.');
    const reference = await tx(async (client) => {
      const r = await nextCounter(client, 'approval_period', 4, 'APR-');
      await client.query(
        `INSERT INTO approval_period (reference,collector,state,valid_from,valid_to,condition,condition_closes_on,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [r, ref, state, valid_from, valid_to, condition || null, condition_closes_on || null, s.email]
      );
      await appendEntry(client, {
        act: `collector_${state}`, person: s.email, object_kind: 'collector', object_ref: ref,
        content: { approval_period: r, state, valid_from, valid_to, condition: condition || null },
      });
      return r;
    });
    return {
      status: 201,
      body: {
        reference, collector: ref, state, valid_from, valid_to,
        condition: condition || null, condition_closes_on: condition_closes_on || null,
        expiring: engine.approvalExpiring({ valid_to }, todayISO()),
      },
    };
  });
});

// ---- Feedstock intake ------------------------------------------------------

api.get('/batches', async (c) => {
  refusePagination(c);
  const s = requireSession(c);
  const batches = await engine.allBatches();
  return c.json(batches);
});

api.get('/batches/:reference', async (c) => {
  requireSession(c);
  const b = await engine.batchByReference(c.req.param('reference'));
  if (!b) throw refuse(404, 'no_such_batch', 'No such batch.');
  return c.json(b);
});

api.post('/batches', async (c) => {
  const s = requireRole(c, 'plant_operator');
  refuseAuditorWrite(s);
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, 'POST /batches', body, async () => {
    const {
      collector, site, category, gross_g, tare_g, net_g, moisture_bp, moisture_method,
      device, received_on, composition, contamination, custody,
    } = body;
    // The category is required at intake and has no default.
    if (!category) throw refuse(400, 'category_required', 'category is required at intake and has no default.');
    if (!['post_consumer', 'pre_consumer'].includes(category)) {
      throw refuse(400, 'category_invalid', 'category is one of post_consumer, pre_consumer.');
    }
    if (!collector || !site || !received_on) throw refuse(400, 'fields_required', 'collector, site and received_on are required.');
    for (const [k, v] of Object.entries({ gross_g, tare_g, net_g, moisture_bp })) requireInteger(v, k);
    if (body.dry_mass_g !== undefined || body.claim_bp !== undefined || body.content_bp !== undefined) {
      throw refuse(400, 'computed_figure_refused', 'No route accepts a computed figure. Dry mass and every percentage are derived.');
    }
    const col = await one('SELECT * FROM collector WHERE reference = $1', [collector]);
    if (!col) throw refuse(404, 'no_such_collector', 'No such collector.');
    if (!(s.sites || []).includes(site)) throw refuse(403, 'site_out_of_scope', `This grant does not cover ${site}.`);

    const result = await tx(async (client) => {
      const reference = await nextCounter(client, 'batch', 4, 'BATCH-');
      const eventAt = body.event_at || `${received_on}T08:00:00Z`;
      await client.query(
        `INSERT INTO batch (reference,collector,site,grade,category,gross_g,tare_g,net_g,moisture_bp,moisture_method,device,received_on,composition,contamination,accepted_g,event_at,effective_on,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$8,$15,$12,$16)`,
        [reference, collector, site, body.grade || 'N6', category, gross_g, tare_g, net_g,
          moisture_bp, moisture_method || 'ISO 15512', device || null, received_on,
          JSON.stringify(composition || {}), JSON.stringify(contamination || {}), eventAt, s.email]
      );
      // A batch and its weighing land together or neither lands.
      if (device) {
        const dev = await client.query('SELECT * FROM weighing_device WHERE reference = $1', [device]);
        if (!dev.rows[0]) throw refuse(404, 'no_such_device', 'No such weighing device.');
        const lapsed = engine.monthsBetween(dateOnly(dev.rows[0].calibrated_on), received_on) >= 12;
        const wref = await nextCounter(client, 'weighing', 4, 'WGH-');
        await client.query(
          `INSERT INTO weighing (reference,batch,device,gross_g,tare_g,net_g,calibration_state,weighed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [wref, reference, device, gross_g, tare_g, net_g, lapsed ? 'lapsed' : 'in_calibration', eventAt]
        );
        await appendEntry(client, {
          act: 'weighing_recorded', person: s.email, site, object_kind: 'weighing', object_ref: wref,
          event_at: eventAt,
          content: { batch: reference, device, net_g, calibration_state: lapsed ? 'lapsed' : 'in_calibration' },
        });
      }
      let ordinal = 0;
      for (const link of custody || []) {
        await client.query(
          'INSERT INTO custody_link (batch,kind,link_date,party,ordinal) VALUES ($1,$2,$3,$4,$5)',
          [reference, link.kind, link.date || null, link.party || null, ordinal++]
        );
      }
      // A departure beyond tolerance stands as a finding against the collector.
      const comp = composition || {};
      let finding = null;
      if (comp.measured_fraction_bp != null && col.declared_fraction_bp != null) {
        const departure = Math.abs(Number(comp.measured_fraction_bp) - Number(col.declared_fraction_bp));
        if (departure > 500) {
          finding = await nextCounter(client, 'finding', 4, 'FND-');
          await client.query(
            `INSERT INTO finding (reference,collector,batch,kind,detail,departure_bp,raised_on,due_on,state)
             VALUES ($1,$2,$3,'declaration_departure',$4,$5,$6,$7,'open')`,
            [finding, collector, reference,
              `Declared ${col.declared_fraction_bp} bp, measured ${comp.measured_fraction_bp} bp: a departure of ${departure} basis points.`,
              departure, received_on, engine.addDays(received_on, 60)]
          );
          await appendEntry(client, {
            act: 'finding_raised', person: s.email, object_kind: 'collector', object_ref: collector,
            content: { finding, batch: reference, departure_bp: departure },
          });
        }
      }
      await appendEntry(client, {
        act: 'batch_booked_in', person: s.email, site, object_kind: 'batch', object_ref: reference,
        event_at: eventAt,
        content: { collector, category, net_g, moisture_bp, device: device || null, received_on },
      });
      return { reference, finding };
    });

    const resolved = await engine.batchByReference(result.reference);
    return { status: 201, body: { ...resolved, finding_raised: result.finding } };
  });
});

// A batch category cannot be changed after acceptance, by anybody, through any route.
api.patch('/batches/:reference', async (c) => {
  const s = requireSession(c);
  refuseAuditorWrite(s);
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const batch = await one('SELECT * FROM batch WHERE reference = $1', [ref]);
  if (!batch) throw refuse(404, 'no_such_batch', 'No such batch.');
  if (body.category !== undefined && body.category !== batch.category) {
    await recordRefusal({
      act: 'batch_category_change_refused', person: s.email, site: batch.site,
      object_kind: 'batch', object_ref: ref,
      content: { rule: 'a batch category cannot be changed after acceptance', from: batch.category, to: body.category },
    });
    throw refuse(409, 'category_immutable_after_acceptance',
      'A batch category cannot be changed after acceptance, by anybody, through any route. A correction is a new record naming what it corrects.',
      { rule: 'category_immutable_after_acceptance', current_category: batch.category, requested_category: body.category });
  }
  if (body.content_bp !== undefined || body.dry_mass_g !== undefined) {
    throw refuse(400, 'computed_figure_refused', 'No route accepts a computed figure.');
  }
  const allowed = ['moisture_method', 'contamination'];
  const sets = [];
  const params = [ref];
  for (const field of allowed) {
    if (body[field] !== undefined) {
      params.push(field === 'contamination' ? JSON.stringify(body[field]) : body[field]);
      sets.push(`${field} = $${params.length}`);
    }
  }
  if (!sets.length) return c.json(await engine.batchByReference(ref));
  await tx(async (client) => {
    await client.query(`UPDATE batch SET ${sets.join(', ')} WHERE reference = $1`, params);
    await appendEntry(client, {
      act: 'batch_amended', person: s.email, site: batch.site, object_kind: 'batch', object_ref: ref,
      content: { fields: Object.keys(body) },
    });
  });
  return c.json(await engine.batchByReference(ref));
});

// A late custody document: the batch becomes claimable from the date it arrived.
api.post('/batches/:reference/custody', async (c) => {
  const s = requireRole(c, 'plant_operator', 'quality_manager');
  refuseAuditorWrite(s);
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /batches/${ref}/custody`, body, async () => {
    const { kind, date, party, arrived_on } = body;
    if (!kind) throw refuse(400, 'kind_required', 'A custody link names its kind.');
    if (!engine.CUSTODY_KINDS.includes(kind)) {
      throw refuse(400, 'kind_invalid', `kind is one of ${engine.CUSTODY_KINDS.join(', ')}.`);
    }
    const batch = await one('SELECT * FROM batch WHERE reference = $1', [ref]);
    if (!batch) throw refuse(404, 'no_such_batch', 'No such batch.');
    const arrived = arrived_on || todayISO();
    const reference = await tx(async (client) => {
      const r = await client.query(
        `INSERT INTO custody_link (batch,kind,link_date,party,ordinal,arrived_on,late)
         VALUES ($1,$2,$3,$4,(SELECT COALESCE(MAX(ordinal),-1)+1 FROM custody_link WHERE batch = $1),$5,true)
         RETURNING id`,
        [ref, kind, date || arrived, party || null, arrived]
      );
      const id = `CUS-${r.rows[0].id}`;
      await appendEntry(client, {
        act: 'custody_link_attached', person: s.email, site: batch.site,
        object_kind: 'batch', object_ref: ref,
        content: { kind, arrived_on: arrived, note: 'claimable forward from the date late evidence arrived' },
      });
      return id;
    });
    const resolved = await engine.batchByReference(ref);
    return { status: 201, body: { reference, ...resolved } };
  });
});

api.post('/batches/:reference/reject', async (c) => {
  const s = requireRole(c, 'plant_operator', 'quality_manager');
  refuseAuditorWrite(s);
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /batches/${ref}/reject`, body, async () => {
    const { rejected_g, reason, destination } = body;
    requireInteger(rejected_g, 'rejected_g');
    if (!reason || !destination) throw refuse(400, 'reason_and_destination_required', 'A rejection records its reason and where the rejected mass went.');
    const batch = await one('SELECT * FROM batch WHERE reference = $1', [ref]);
    if (!batch) throw refuse(404, 'no_such_batch', 'No such batch.');
    const delivered = Number(batch.net_g);
    if (Number(rejected_g) < 0 || Number(rejected_g) > delivered) {
      throw refuse(409, 'rejection_does_not_sum',
        'Accepted mass plus rejected mass equals delivered mass, and a rejection whose parts do not sum is refused.',
        { delivered_g: delivered, rejected_g: Number(rejected_g) });
    }
    const accepted = delivered - Number(rejected_g);
    await tx(async (client) => {
      await client.query(
        `UPDATE batch SET rejected_g = $2, accepted_g = $3, rejected_reason = $4, rejected_destination = $5,
           accepted = $6 WHERE reference = $1`,
        [ref, rejected_g, accepted, reason, destination, accepted > 0]
      );
      await appendEntry(client, {
        act: 'batch_rejected', person: s.email, site: batch.site, object_kind: 'batch', object_ref: ref,
        content: { rejected_g: Number(rejected_g), accepted_g: accepted, reason, destination },
      });
    });
    const resolved = await engine.batchByReference(ref);
    return { status: 200, body: { ...resolved, reference: ref, accepted_g: accepted, rejected_g: Number(rejected_g), rejected_destination: destination } };
  });
});

// ---- The remaining route modules ------------------------------------------
import registerRuns from './routes/runs.js';
import registerLedger from './routes/ledger.js';
import registerQuality from './routes/quality.js';
import registerCertificates from './routes/certificates.js';
import registerRecord from './routes/record.js';
import registerPublic from './routes/public.js';

registerRuns(api);
registerLedger(api);
registerQuality(api);
registerCertificates(api);
registerRecord(api);
registerPublic(api);

api.all('*', (c) => c.json({ error: 'no_such_route', detail: 'No such route.' }, 404));

export default api;
export { SCHEME, REGISTRATION, VERIFY_BASE };
