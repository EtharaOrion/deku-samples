import { Hono } from 'hono';
import { q, one, pool } from '../db.js';
import { requireSession, requireRole, requireSite, refuseAuditorWrites } from '../auth.js';
import { appendEntry } from '../record.js';
import { withIdempotency } from '../idempotency.js';
import { isoDate, isInt, ref } from '../util.js';
import { batchFacts, impact } from '../engine.js';

export const intake = new Hono();

const CATEGORIES = ['post_consumer', 'pre_consumer'];
const CUSTODY_KINDS = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];

function refusePaging(c) {
  const u = new URL(c.req.url);
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (u.searchParams.has(p)) {
      return {
        error: 'paging_not_permitted',
        parameter: p,
        message:
          'This answer is a complete set by contract. A caller handed a page resolves a page and believes the work is finished.',
      };
    }
  }
  return null;
}
export { refusePaging };

intake.get('/batches', async (c) => {
  const s = requireSession(c);
  const bad = refusePaging(c);
  if (bad) return c.json(bad, 400);
  const rows = await q('SELECT * FROM batch ORDER BY received_on ASC, reference ASC');
  const out = [];
  for (const b of rows) out.push(await batchFacts(b));
  return c.json(out);
});

intake.get('/batches/:reference', async (c) => {
  requireSession(c);
  const b = await one('SELECT * FROM batch WHERE reference = $1', [c.req.param('reference')]);
  if (!b) return c.json({ error: 'not_found' }, 404);
  return c.json(await batchFacts(b));
});

intake.get('/batches/:reference/impact', async (c) => {
  requireSession(c);
  const bad = refusePaging(c);
  if (bad) return c.json(bad, 400);
  const r = await impact(c.req.param('reference'));
  if (!r) return c.json({ error: 'not_found' }, 404);
  return c.json(r);
});

intake.post('/batches', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'plant_operator');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const {
      collector, site, category, gross_g, tare_g, net_g, moisture_bp, moisture_method,
      device, received_on, composition, contamination, custody, grade,
    } = body;

    // No route accepts a percentage, a carbon value or a loss figure.
    for (const forbidden of ['content_bp', 'recycled_content_bp', 'claim_bp', 'carbon_mg_per_kg', 'value_mg_per_kg', 'losses_g', 'dry_mass_g', 'claimable']) {
      if (body[forbidden] !== undefined) {
        return {
          status: 400,
          body: {
            error: 'computed_figure_not_accepted', field: forbidden,
            message: 'A recycled-content percentage, a carbon value and a loss figure are computed. No route accepts one.',
          },
        };
      }
    }

    if (!category) {
      return {
        status: 400,
        body: { error: 'category_required', message: 'category is required at intake and has no default.' },
      };
    }
    if (!CATEGORIES.includes(category)) {
      return { status: 400, body: { error: 'category_not_permitted', permitted: CATEGORIES } };
    }
    for (const [k, v] of Object.entries({ gross_g, tare_g, net_g, moisture_bp })) {
      if (!isInt(v)) {
        return { status: 400, body: { error: 'integer_required', field: k, message: 'A mass is an integer number of grams and a proportion is an integer number of basis points. No figure crosses the wire as a decimal.' } };
      }
    }
    if (!collector || !site || !device || !received_on) {
      return { status: 400, body: { error: 'field_required', message: 'collector, site, device and received_on are all required.' } };
    }
    if (!(s.sites || []).includes(site)) {
      return { status: 403, body: { error: 'site_out_of_scope', site, scope: s.sites } };
    }
    const col = await one('SELECT reference FROM collector WHERE reference = $1', [collector]);
    if (!col) return { status: 404, body: { error: 'collector_not_found', collector } };
    const dev = await one('SELECT reference FROM weighing_device WHERE reference = $1', [device]);
    if (!dev) return { status: 404, body: { error: 'device_not_found', device } };

    const reference = ref('BATCH');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO batch (reference,collector,site,grade,category,gross_g,tare_g,net_g,moisture_bp,moisture_method,device,received_on,composition,contamination,event_at,effective_on,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [reference, collector, site, grade || 'N6', category, gross_g, tare_g, net_g, moisture_bp,
         moisture_method || 'not stated', device, received_on,
         JSON.stringify(composition || {}), JSON.stringify(contamination || {}),
         received_on + 'T00:00:00Z', received_on, s.email]
      );
      const links = Array.isArray(custody) ? custody : [];
      let i = 0;
      for (const l of links) {
        if (!CUSTODY_KINDS.includes(l.kind)) continue;
        await client.query(
          'INSERT INTO custody_link (batch,ordinal,kind,link_date,party) VALUES ($1,$2,$3,$4,$5)',
          [reference, i++, l.kind, l.date || received_on, l.party || 'not stated']
        );
      }
      // A batch and its weighing land together or neither lands.
      await client.query(
        `INSERT INTO weighing (reference,batch,device,gross_g,tare_g,net_g,calibration_state,weighed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [`WGH-${reference}`, reference, device, gross_g, tare_g, net_g, 'as recorded', received_on + 'T00:00:00Z']
      );
      await appendEntry(client, {
        act: 'batch_booked_in', person: s.email, site, object_kind: 'batch', object_ref: reference,
        content: { collector, category, net_g, moisture_bp, device, received_on },
      });
      await appendEntry(client, {
        act: 'weighing_recorded', person: s.email, site, object_kind: 'weighing',
        object_ref: `WGH-${reference}`,
        content: { batch: reference, device, net_g },
      });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    // A declaration departing from a sample by more than 500 bp stands as a
    // finding against the collector, never against the plant.
    const comp = composition || {};
    if (isInt(comp.fraction_bp) && isInt(comp.measured_fraction_bp)) {
      const departure = Math.abs(comp.fraction_bp - comp.measured_fraction_bp);
      if (departure > 500) {
        const fref = ref('FND');
        await one(
          `INSERT INTO finding (reference,collector,batch,kind,detail,departure_bp,raised_on,state)
           VALUES ($1,$2,$3,'declaration_departure',$4,$5,$6,'open') RETURNING reference`,
          [fref, collector, reference,
           `Declared ${comp.polymer || 'polymer'} fraction ${comp.fraction_bp} bp against a measured ${comp.measured_fraction_bp} bp, a departure of ${departure} basis points.`,
           departure, received_on]
        );
        await appendEntry(null, {
          act: 'finding_raised', person: s.email, object_kind: 'finding', object_ref: fref,
          content: { collector, batch: reference, departure_bp: departure },
        });
      }
    }

    const b = await one('SELECT * FROM batch WHERE reference = $1', [reference]);
    return { status: 201, body: { reference, ...(await batchFacts(b)) } };
  });
});

intake.patch('/batches/:reference', async (c) => {
  // The category rule is decided before the role is, so that every role,
  // including the auditor, is answered with the rule that refused it.
  const s = requireSession(c);
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const b = await one('SELECT * FROM batch WHERE reference = $1', [reference]);
  if (!b) return c.json({ error: 'not_found' }, 404);

  // A batch category cannot be changed after acceptance, by anybody, through
  // any route. The refusal is itself an entry.
  if (body.category !== undefined) {
    await appendEntry(null, {
      act: 'batch_category_change_refused', person: s.email, site: b.site,
      object_kind: 'batch', object_ref: reference, outcome: 'refused',
      content: { requested: body.category, held: b.category },
    });
    return c.json(
      {
        error: 'category_immutable_after_acceptance',
        rule: 'A batch category is required at intake, has no default, and can never be changed after acceptance.',
        batch: reference, category: b.category, requested: body.category,
      },
      409
    );
  }
  refuseAuditorWrites(c);
  return c.json({ error: 'no_mutable_field', message: 'This route accepts no field on a booked-in batch.' }, 400);
});

intake.post('/batches/:reference/custody', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'plant_operator', 'quality_manager');
  const reference = c.req.param('reference');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const b = await one('SELECT * FROM batch WHERE reference = $1', [reference]);
    if (!b) return { status: 404, body: { error: 'not_found' } };
    const { kind, date, party, arrived_on } = body;
    if (!CUSTODY_KINDS.includes(kind)) {
      return { status: 400, body: { error: 'kind_not_permitted', permitted: CUSTODY_KINDS } };
    }
    if (!arrived_on) {
      return { status: 400, body: { error: 'arrived_on_required', message: 'A late document carries the date it arrived: the batch becomes claimable from that date rather than from its receipt date.' } };
    }
    const n = await one('SELECT count(*)::int AS n FROM custody_link WHERE batch = $1', [reference]);
    const cref = ref('CUS');
    await one(
      `INSERT INTO custody_link (batch,ordinal,kind,link_date,party,late,arrived_on)
       VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING id`,
      [reference, n.n, kind, date || arrived_on, party || 'not stated', arrived_on]
    );
    await one('UPDATE batch SET claimable_from = $1 WHERE reference = $2 RETURNING reference', [arrived_on, reference]);
    await appendEntry(null, {
      act: 'custody_link_attached', person: s.email, site: b.site, object_kind: 'batch',
      object_ref: reference, content: { kind, arrived_on, party: party || null },
    });
    const updated = await one('SELECT * FROM batch WHERE reference = $1', [reference]);
    const facts = await batchFacts(updated);
    return { status: 201, body: { reference: cref, batch: reference, ...facts } };
  });
});

intake.post('/batches/:reference/reject', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'plant_operator', 'quality_manager');
  const reference = c.req.param('reference');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const b = await one('SELECT * FROM batch WHERE reference = $1', [reference]);
    if (!b) return { status: 404, body: { error: 'not_found' } };
    const { rejected_g, reason, destination } = body;
    if (!isInt(rejected_g)) return { status: 400, body: { error: 'integer_required', field: 'rejected_g' } };
    if (!reason || !destination) {
      return { status: 400, body: { error: 'reason_and_destination_required', message: 'A partial rejection records where the rejected mass went.' } };
    }
    const delivered = Number(b.net_g);
    if (rejected_g < 0 || rejected_g > delivered) {
      // Accepted plus rejected equals delivered. A rejection whose parts do not
      // sum is refused.
      await appendEntry(null, {
        act: 'batch_rejection_refused', person: s.email, site: b.site, object_kind: 'batch',
        object_ref: reference, outcome: 'refused',
        content: { rejected_g, delivered_g: delivered, reason: 'parts do not sum' },
      });
      return {
        status: 409,
        body: {
          error: 'rejection_does_not_sum', delivered_g: delivered, rejected_g,
          accepted_g: delivered - rejected_g,
          message: 'Accepted mass plus rejected mass equals delivered mass.',
        },
      };
    }
    await one(
      `UPDATE batch SET rejected_g = $1, rejected_reason = $2, rejected_destination = $3,
        accepted = $4 WHERE reference = $5 RETURNING reference`,
      [rejected_g, reason, destination, rejected_g < delivered, reference]
    );
    await appendEntry(null, {
      act: 'batch_rejected', person: s.email, site: b.site, object_kind: 'batch',
      object_ref: reference,
      content: { rejected_g, accepted_g: delivered - rejected_g, reason, destination },
    });
    const updated = await one('SELECT * FROM batch WHERE reference = $1', [reference]);
    return { status: 201, body: { reference, ...(await batchFacts(updated)) } };
  });
});
