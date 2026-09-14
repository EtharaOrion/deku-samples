import { Hono } from 'hono';
import { q, tx } from '../db.js';
import { requireSession } from '../auth.js';
import { idempotent, readBody, refuse, recordTx, requireKeys, intOr } from '../lib/http.js';
import { loadGraph, batchClaimable, batchFlags, CUSTODY_KINDS } from '../lib/engine.js';
import { nowIso } from '../lib/util.js';

const batches = new Hono();
batches.use('*', requireSession());

const partyNameAt = async (ref, date) => {
  const r = await q(`SELECT name, effective_from FROM party_version WHERE reference=$1 AND effective_from <= $2 ORDER BY effective_from DESC LIMIT 1`, [ref, date]);
  return r.rows.length ? r.rows[0].name : ref;
};

async function batchView(b, G) {
  const g = G || (await loadGraph());
  const res = batchClaimable(b, g);
  const flags = batchFlags(b, g);
  const kinds = (b.custody || []).map((k) => k.kind);
  const missing = CUSTODY_KINDS.filter((k) => !kinds.includes(k));
  const dry = Math.floor((Number(b.net_g) * (10000 - Number(b.moisture_bp))) / 10000);
  const custodyComplete = missing.length === 0;
  const approval = (g.approvalsByCollector.get(b.collector) || []).find((p) => p.valid_from <= b.received_on && b.received_on <= p.valid_to) || null;
  return {
    reference: b.reference, collector: b.collector, collector_name: b.collector_name, site: b.site, grade: b.grade,
    category: b.category, gross_g: Number(b.gross_g), tare_g: Number(b.tare_g), net_g: Number(b.net_g),
    moisture_bp: Number(b.moisture_bp), moisture_method: b.moisture_method, device: b.device,
    calibrated_on: g.deviceById.get(b.device) ? g.deviceById.get(b.device).calibrated_on : null,
    received_on: b.received_on,
    composition: b.composition, contamination: b.contamination, custody: b.custody,
    dry_mass_g: dry, claimable: res.claimable && !b.claimable_from_late,
    claimable_reason: res.claimable ? null : res.reason,
    claimable_from: b.claimable_from || null,
    flags, custody_complete: custodyComplete, missing_custody_kind: missing[0] || null,
    accepted_g: b.accepted_g === null ? Number(b.net_g) : Number(b.accepted_g),
    rejected_g: Number(b.rejected_g || 0), rejected_destination: b.rejected_destination || null,
    approval_in_force: approval ? { state: approval.state, valid_from: approval.valid_from, valid_to: approval.valid_to } : null,
    claimable_basis: {
      rule: 'A batch resolves its claimability against the collector approval in force on its receipt date.',
      approval_state_on_receipt: approval ? approval.state : 'none',
      approval_valid_to: approval ? approval.valid_to : null
    },
    derivation: {
      dry_mass_g: `floor(net_g ${b.net_g} * (10000 - moisture_bp ${b.moisture_bp}) / 10000)`,
      claimable: 'approval in force on received_on plus a complete custody list'
    }
  };
}

batches.get('/', async (c) => {
  const r = await q('SELECT * FROM batch ORDER BY reference');
  const G = await loadGraph();
  return c.json(await Promise.all(r.rows.map((b) => batchView(b, G))));
});

batches.get('/:reference', async (c) => {
  const r = await q('SELECT * FROM batch WHERE reference = $1', [c.req.param('reference')]);
  if (!r.rows.length) return c.json({ error: 'not_found' }, 404);
  return c.json(await batchView(r.rows[0]));
});

batches.post('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'plant_operator' && user.role !== 'quality_manager') {
    refuse(403, 'forbidden', { message: 'Only a plant operator books in a batch.' });
  }
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['collector', 'site', 'category', 'net_g', 'moisture_bp', 'received_on']);
    if (!body.category || !['post_consumer', 'pre_consumer'].includes(body.category)) {
      refuse(400, 'category_required', { message: 'The category is required at intake, has no default.' });
    }
    const G = await loadGraph();
    const name = await partyNameAt(body.collector, body.received_on);
    const reference = await nextRef('batch', 'BATCH');
    const dryClaimableFrom = custodyComplete(body.custody) ? body.received_on : null;
    const res = await tx(async (client) => {
      await client.query(
        `INSERT INTO batch (reference, collector, collector_name, site, grade, category, gross_g, tare_g, net_g, moisture_bp, moisture_method, device, received_on, composition, contamination, custody, accepted_g, rejected_g, delivered_g, claimable_from, created_by, accepted)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,0,$18,$19,$20,true)`,
        [reference, body.collector, name, body.site, body.grade || 'N6', body.category,
         intOr(body.gross_g, 0), intOr(body.tare_g, 0), intOr(body.net_g), intOr(body.moisture_bp),
         body.moisture_method || 'ISO 665', body.device || '', body.received_on,
         JSON.stringify(body.composition || []), JSON.stringify(body.contamination || {}),
         JSON.stringify(body.custody || []), intOr(body.net_g), intOr(body.net_g), dryClaimableFrom, user.email]
      );
      if (body.device) {
        await client.query(
          `INSERT INTO weighing (reference, site, device, calibrated_on, net_g, recorded_on)
           VALUES ($1,$2,$3,(SELECT calibrated_on FROM device WHERE reference=$3),$4,$5)`,
          ['W-' + reference, body.site, body.device, intOr(body.net_g), body.received_on]
        );
      }
      await recordTx(client, {
        user, act: 'batch_booked_in', object: reference, site: body.site,
        event_at: nowIso(), effective_on: body.received_on,
        payload: { collector: body.collector, category: body.category, net_g: intOr(body.net_g), device: body.device, received_on: body.received_on }
      });
      return { reference };
    });
    return res;
  });
});

batches.patch('/:reference', async (c) => {
  const user = c.get('user');
  const body = await readBody(c);
  const r = await q('SELECT * FROM batch WHERE reference = $1', [c.req.param('reference')]);
  if (!r.rows.length) return c.json({ error: 'not_found' }, 404);
  const b = r.rows[0];
  if (body.category && body.category !== b.category) {
    await recordTx(null, {
      user, act: 'batch_category_change_refused', object: b.reference, site: b.site, refused: true,
      payload: { from: b.category, to: body.category, rule: 'A batch category cannot be changed after acceptance, by anybody, through any route.' }
    });
    return c.json({
      error: 'category_immutable',
      rule: 'A batch category cannot be changed after acceptance, by anybody, through any route.',
      current_category: b.category
    }, 409);
  }
  const fields = ['gross_g', 'tare_g', 'net_g', 'moisture_bp', 'moisture_method', 'device', 'received_on', 'composition', 'contamination', 'custody'];
  const updates = {};
  for (const f of fields) if (body[f] !== undefined) updates[f] = body[f];
  if (!Object.keys(updates).length) return c.json({ error: 'nothing_to_update' }, 400);
  const sets = Object.keys(updates).map((f, i) => `${f} = $${i + 2}`).join(', ');
  await q(`UPDATE batch SET ${sets} WHERE reference = $1`, [b.reference, ...Object.values(updates)]);
  await recordTx(null, { user, act: 'batch_annotated', object: b.reference, site: b.site, payload: updates });
  return c.json({ reference: b.reference, updated: Object.keys(updates) });
});

batches.post('/:reference/custody', async (c) => {
  const user = c.get('user');
  return idempotent(c, async () => {
    const body = await readBody(c);
    const r = await q('SELECT * FROM batch WHERE reference = $1', [c.req.param('reference')]);
    if (!r.rows.length) refuse(404, 'not_found');
    const b = r.rows[0];
    requireKeys(body, ['arrived_on']);
    const custody = [...(b.custody || []), ...(body.links || [{ kind: body.kind || 'transport', date: body.arrived_on, party: body.party || b.collector }])];
    const claimableFrom = custodyComplete(custody) ? body.arrived_on : b.claimable_from;
    const out = await tx(async (client) => {
      await client.query('UPDATE batch SET custody = $2, claimable_from = $3 WHERE reference = $1', [b.reference, JSON.stringify(custody), claimableFrom]);
      await recordTx(client, {
        user, act: 'custody_link_attached', object: b.reference, site: b.site, event_at: nowIso(), effective_on: body.arrived_on,
        payload: { arrived_on: body.arrived_on, claimable_from: claimableFrom, message: 'The batch becomes claimable from that date rather than from its receipt date.' }
      });
      return { reference: b.reference, claimable_from: claimableFrom };
    });
    return out;
  });
});

batches.post('/:reference/reject', async (c) => {
  const user = c.get('user');
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['rejected_g', 'reason', 'destination']);
    const r = await q('SELECT * FROM batch WHERE reference = $1', [c.req.param('reference')]);
    if (!r.rows.length) refuse(404, 'not_found');
    const b = r.rows[0];
    const rejected = intOr(body.rejected_g);
    const alreadyRejected = Number(b.rejected_g || 0);
    const accepted = Number(b.net_g) - rejected - alreadyRejected;
    if (accepted < 0) {
      refuse(409, 'rejection_does_not_sum', {
        delivered_g: Number(b.net_g), rejected_g: rejected + alreadyRejected,
        message: 'Accepted mass plus rejected mass equals delivered mass, and a rejection whose parts do not sum is refused.'
      });
    }
    return await tx(async (client) => {
      await client.query('UPDATE batch SET rejected_g = $2, rejected_destination = $3, rejected_reason = $4, accepted_g = $5 WHERE reference = $1',
        [b.reference, rejected + alreadyRejected, body.destination, body.reason, accepted]);
      await recordTx(client, {
        user, act: 'batch_rejected', object: b.reference, site: b.site, event_at: nowIso(), effective_on: nowIso().slice(0, 10),
        payload: { rejected_g: rejected, reason: body.reason, destination: body.destination }
      });
      return { reference: b.reference, accepted_g: accepted, rejected_g: rejected + alreadyRejected, rejected_destination: body.destination };
    });
  });
});

function custodyComplete(custody) {
  const kinds = (custody || []).map((k) => k.kind);
  return CUSTODY_KINDS.every((k) => kinds.includes(k));
}

async function nextRef(kind, prefix) {
  const r = await q('INSERT INTO ref_seq (kind, n) VALUES ($1, 1) ON CONFLICT (kind) DO UPDATE SET n = ref_seq.n + 1 RETURNING n', [kind]);
  return prefix + '-' + String(r.rows[0].n + 1000);
}

export default batches;
