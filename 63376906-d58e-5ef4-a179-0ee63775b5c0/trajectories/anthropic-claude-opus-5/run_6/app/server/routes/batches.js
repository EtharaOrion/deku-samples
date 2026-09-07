import { Hono } from 'hono';
import { q, pool } from '../lib/db.js';
import {
  requireSession, requireAct, withIdempotency, refuse, refusePagination,
  requireFields, requireIntegers, rejectComputedInputs, nextReference, today,
} from '../lib/http.js';
import { appendEntry } from '../lib/records.js';
import { batchViews, batchView, iso, REQUIRED_CUSTODY } from '../engine/feedstock.js';
import { impactOf } from '../engine/genealogy.js';

const r = new Hono();

// A collector account sees its own batches and nothing else.
function scopeFor(actor) {
  if ((actor.roles || []).includes('collector')) return { collector: actor.collector_reference };
  return null;
}

r.get('/batches', async (c) => {
  const actor = await requireSession(c);
  refusePagination(c);
  const scope = scopeFor(actor);
  const rows = scope
    ? await q('SELECT * FROM batch WHERE collector = $1 ORDER BY received_on ASC', [scope.collector])
    : await q('SELECT * FROM batch ORDER BY received_on ASC');
  return c.json(await batchViews(rows));
});

r.get('/batches/:reference', async (c) => {
  await requireSession(c);
  const view = await batchView(c.req.param('reference'));
  if (!view) refuse(404, 'not_found', { error: 'not_found', message: 'No such batch.' });
  return c.json(view);
});

// POST /api/batches books a batch. category is required and has no default.
r.post('/batches', async (c) => {
  const actor = await requireAct(c, 'batch.book');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, body, async () => {
    rejectComputedInputs(body);
    requireFields(body, ['collector', 'site', 'category', 'gross_g', 'tare_g', 'net_g', 'moisture_bp', 'moisture_method', 'device', 'received_on', 'custody']);
    requireIntegers(body, ['gross_g', 'tare_g', 'net_g', 'moisture_bp']);
    if (!['post_consumer', 'pre_consumer'].includes(body.category)) {
      refuse(400, 'category_required', { error: 'category_required', message: 'category is required at intake, has no default, and is one of post_consumer, pre_consumer.' });
    }
    const col = (await q('SELECT * FROM collector WHERE reference = $1', [body.collector]))[0];
    if (!col) refuse(404, 'not_found', { error: 'not_found', message: 'No such collector.' });
    const site = (await q('SELECT * FROM site WHERE reference = $1', [body.site]))[0];
    if (!site) refuse(404, 'not_found', { error: 'not_found', message: 'No such site.' });
    const dev = (await q('SELECT * FROM weighing_device WHERE reference = $1', [body.device]))[0];
    if (!dev) refuse(404, 'not_found', { error: 'not_found', message: 'No such weighing device.' });
    if (!Array.isArray(body.custody)) {
      refuse(400, 'custody_required', { error: 'custody_required', message: 'custody is an ordered list of links, each with a kind, a date and a party.' });
    }
    // a batch and its weighing land together or neither lands
    const nextRef = await nextBatchRef();
    const eventAt = body.event_at || new Date().toISOString();
    const effectiveOn = body.effective_on || body.received_on;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO batch (reference, collector, site, grade, category, gross_g, tare_g, net_g, moisture_bp, moisture_method,
          device, received_on, composition, contamination, accepted_g, rejected_g, booked_by, event_at, recorded_at, effective_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$8,0,$15,$16,now(),$17)`,
        [nextRef, body.collector, body.site, body.grade || 'N6', body.category, body.gross_g, body.tare_g, body.net_g,
          body.moisture_bp, body.moisture_method, body.device, body.received_on,
          JSON.stringify(body.composition || {}), JSON.stringify(body.contamination || {}),
          actor.email, eventAt, effectiveOn]);
      let ord = 0;
      for (const link of body.custody) {
        if (!link.kind || !REQUIRED_CUSTODY.includes(link.kind)) {
          refuse(400, 'unknown_custody_kind', { error: 'unknown_custody_kind', message: `A custody link kind is one of ${REQUIRED_CUSTODY.join(', ')}.`, received: link.kind });
        }
        await client.query(
          'INSERT INTO custody_link (batch, kind, link_date, party, ord) VALUES ($1,$2,$3,$4,$5)',
          [nextRef, link.kind, link.date, link.party, ord++]);
      }
      await client.query(
        `INSERT INTO weighing (batch, device, gross_g, tare_g, net_g, calibration_state, weighed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [nextRef, body.device, body.gross_g, body.tare_g, body.net_g,
          calibrationState(dev.calibrated_on, body.received_on), eventAt]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    const view = await batchView(nextRef);

    // a measured composition departing by more than 500 bp raises a finding against
    // the collector's approval record rather than against the plant
    if (view.composition_departure_bp !== null && view.composition_departure_bp > 500) {
      const fref = await nextReference('FND', 'finding');
      await pool.query(
        `INSERT INTO finding (reference, collector, kind, detail, raised_on, due_on, state, batch)
         VALUES ($1,$2,'declaration_departure',$3,$4,$5,'open',$6)`,
        [fref, body.collector,
          `Measured composition ${view.composition.measured_fraction_bp} bp against a declared ${view.composition.fraction_bp} bp on ${nextRef}: a departure of ${view.composition_departure_bp} basis points beyond the 500 basis point tolerance.`,
          today(), addDays(today(), 90), nextRef]);
      view.finding_raised = fref;
      await appendEntry(null, { person: actor.email, object_kind: 'finding', object_ref: fref, action: 'raised', content: { collector: body.collector, batch: nextRef, departure_bp: view.composition_departure_bp } });
    }

    await appendEntry(null, {
      person: actor.email, site: body.site, object_kind: 'batch', object_ref: nextRef,
      action: 'booked_in', at: eventAt,
      content: { collector: body.collector, category: body.category, net_g: body.net_g, moisture_bp: body.moisture_bp, received_on: body.received_on, dry_mass_g: view.dry_mass_g, claimable: view.claimable, claimable_reason: view.claimable_reason },
    });
    await appendEntry(null, {
      person: actor.email, site: body.site, object_kind: 'weighing', object_ref: nextRef,
      action: 'weighed', at: eventAt,
      content: { device: body.device, net_g: body.net_g, calibration_state: calibrationState(dev.calibrated_on, body.received_on) },
    });

    return { status: 201, body: { reference: nextRef, ...view } };
  });
  return c.json(out.body, out.status);
});

async function nextBatchRef() {
  const rows = await q("SELECT reference FROM batch WHERE reference LIKE 'BATCH-%' ORDER BY reference DESC LIMIT 1");
  const last = rows[0]?.reference;
  const n = last ? Number(String(last).split('-').pop()) : 1000;
  return `BATCH-${(Number.isFinite(n) ? n : 1000) + 1}`;
}

function calibrationState(calibratedOn, receivedOn) {
  const cal = new Date(calibratedOn);
  const rec = new Date(receivedOn);
  const months = (rec.getFullYear() - cal.getFullYear()) * 12 + (rec.getMonth() - cal.getMonth()) + (rec.getDate() >= cal.getDate() ? 0 : -1);
  return months >= 12 ? 'lapsed' : 'in_calibration';
}

function addDays(day, n) {
  const d = new Date(day);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// A batch category cannot be changed after acceptance, by anybody, through any route.
r.patch('/batches/:reference', async (c) => {
  const actor = await requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  const reference = c.req.param('reference');
  const batch = (await q('SELECT * FROM batch WHERE reference = $1', [reference]))[0];
  if (!batch) refuse(404, 'not_found', { error: 'not_found', message: 'No such batch.' });
  if (body.category !== undefined) {
    await appendEntry(null, {
      person: actor.email, site: batch.site, object_kind: 'batch', object_ref: reference,
      action: 'category_change_refused',
      content: { attempted_category: body.category, current_category: batch.category, rule: 'category_immutable_after_acceptance' },
    });
    refuse(409, 'category_immutable_after_acceptance', {
      error: 'category_immutable_after_acceptance',
      rule: 'A batch category is required at intake, has no default, and can never be changed after acceptance.',
      message: `${reference} was accepted as ${batch.category}. A correction is a new record naming what it corrects, not an edit.`,
      current_category: batch.category,
      attempted_category: body.category,
    });
  }
  refuse(409, 'batch_not_editable', {
    error: 'batch_not_editable',
    message: 'The operational record stores what arrived. A correction is a new record naming what it corrects.',
  });
});

// A late custody document: the batch becomes claimable from the date it arrived.
r.post('/batches/:reference/custody', async (c) => {
  const actor = await requireAct(c, 'batch.custody');
  const body = await c.req.json().catch(() => ({}));
  const reference = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['kind', 'date', 'party', 'arrived_on']);
    const batch = (await q('SELECT * FROM batch WHERE reference = $1', [reference]))[0];
    if (!batch) refuse(404, 'not_found', { error: 'not_found', message: 'No such batch.' });
    if (!REQUIRED_CUSTODY.includes(body.kind)) {
      refuse(400, 'unknown_custody_kind', { error: 'unknown_custody_kind', message: `A custody link kind is one of ${REQUIRED_CUSTODY.join(', ')}.` });
    }
    const existing = await q('SELECT * FROM custody_link WHERE batch = $1', [reference]);
    const ins = await pool.query(
      'INSERT INTO custody_link (batch, kind, link_date, party, ord, arrived_on, document) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [reference, body.kind, body.date, body.party, existing.length, body.arrived_on, body.document || null]);
    const ref = `CUS-${String(ins.rows[0].id).padStart(4, '0')}`;
    const view = await batchView(reference);
    await appendEntry(null, {
      person: actor.email, site: batch.site, object_kind: 'batch', object_ref: reference,
      action: 'custody_link_attached',
      content: { kind: body.kind, arrived_on: body.arrived_on, claimable: view.claimable, claimable_from: view.claimable_from },
    });
    return {
      status: 201,
      body: {
        reference: ref, batch: reference, kind: body.kind, arrived_on: body.arrived_on,
        claimable: view.claimable, claimable_from: view.claimable_from,
        custody_complete: view.custody_complete,
        note: 'The batch is claimable forward from the date the late evidence arrived, not from its receipt date.',
      },
    };
  });
  return c.json(out.body, out.status);
});

// A rejection in whole or in part records where the rejected mass went.
r.post('/batches/:reference/reject', async (c) => {
  const actor = await requireAct(c, 'batch.reject');
  const body = await c.req.json().catch(() => ({}));
  const reference = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['rejected_g', 'reason', 'destination']);
    requireIntegers(body, ['rejected_g']);
    const batch = (await q('SELECT * FROM batch WHERE reference = $1', [reference]))[0];
    if (!batch) refuse(404, 'not_found', { error: 'not_found', message: 'No such batch.' });
    const delivered = Number(batch.net_g);
    const rejected = body.rejected_g;
    const accepted = delivered - rejected;
    // accepted mass plus rejected mass equals delivered mass
    if (rejected < 0 || accepted < 0 || accepted + rejected !== delivered) {
      await appendEntry(null, {
        person: actor.email, site: batch.site, object_kind: 'batch', object_ref: reference,
        action: 'rejection_refused',
        content: { rejected_g: rejected, delivered_g: delivered, reason: 'parts_do_not_sum' },
      });
      refuse(409, 'rejection_does_not_sum', {
        error: 'rejection_does_not_sum',
        message: 'Accepted mass plus rejected mass equals delivered mass.',
        delivered_g: delivered, rejected_g: rejected, accepted_g: accepted,
      });
    }
    await pool.query(
      'UPDATE batch SET rejected_g = $1, accepted_g = $2, rejected_reason = $3, rejected_destination = $4 WHERE reference = $5',
      [rejected, accepted, body.reason, body.destination, reference]);
    await appendEntry(null, {
      person: actor.email, site: batch.site, object_kind: 'batch', object_ref: reference,
      action: rejected === delivered ? 'rejected' : 'partially_rejected',
      content: { rejected_g: rejected, accepted_g: accepted, reason: body.reason, destination: body.destination },
    });
    const view = await batchView(reference);
    return { status: 201, body: { reference, accepted_g: accepted, rejected_g: rejected, rejected_destination: body.destination, reason: body.reason, delivered_g: delivered, ...view } };
  });
  return c.json(out.body, out.status);
});

// The same traversal backwards, a complete set, never paginated.
r.get('/batches/:reference/impact', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const result = await impactOf(c.req.param('reference'));
  if (!result) refuse(404, 'not_found', { error: 'not_found', message: 'No such batch.' });
  return c.json(result);
});

export default r;
