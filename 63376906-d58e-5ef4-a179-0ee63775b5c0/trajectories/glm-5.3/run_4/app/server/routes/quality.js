import { Hono } from 'hono';
import { q, tx } from '../db.js';
import { requireSession } from '../auth.js';
import { idempotent, readBody, refuse, recordTx, requireKeys } from '../lib/http.js';
import { nowIso } from '../lib/util.js';

const quality = new Hono();
quality.use('*', requireSession());

quality.post('/test-results', async (c) => {
  const user = c.get('user');
  if (!['lab_analyst', 'quality_manager'].includes(user.role)) {
    refuse(403, 'forbidden', { message: 'A laboratory analyst enters a test result against a named method.' });
  }
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['property', 'value', 'unit']);
    if (!body.method) refuse(400, 'method_required', { message: 'A result with no method is refused.' });
    const target = body.lot || body.batch;
    if (!target) refuse(400, 'lot_or_batch_required');
    return await tx(async (client) => {
      const r = await client.query(
        `INSERT INTO test_result (lot, batch, property, method, instrument, analyst, value, unit, uncertainty_bp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [body.lot || null, body.batch || null, body.property, body.method, body.instrument || '', user.email,
         String(body.value), body.unit, Number(body.uncertainty_bp || 0)]
      );
      await recordTx(client, { user, act: 'test_result_entered', object: target, payload: { property: body.property, method: body.method, value: String(body.value) } });
      return { reference: 'TR-' + String(r.rows[0].id).padStart(5, '0'), method_mismatch: false, usable_for_release: true };
    });
  });
});

quality.get('/test-results', async (c) => {
  const r = await q('SELECT * FROM test_result ORDER BY id');
  return c.json(r.rows.map((t) => ({
    id: 'TR-' + String(t.id).padStart(5, '0'), lot: t.lot, batch: t.batch, property: t.property,
    method: t.method, instrument: t.instrument, analyst: t.analyst, value: t.value, unit: t.unit,
    uncertainty_bp: Number(t.uncertainty_bp)
  })));
});

quality.post('/deviations', async (c) => {
  const user = c.get('user');
  if (!['quality_manager', 'plant_operator'].includes(user.role)) {
    refuse(403, 'forbidden', { message: 'A quality manager raises a deviation.' });
  }
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['description']);
    const runs = body.runs || [];
    const lots = body.lots || [];
    if (!runs.length && !lots.length) refuse(400, 'runs_or_lots_required');
    return await tx(async (client) => {
      const r = await client.query('INSERT INTO ref_seq (kind, n) VALUES ($1, 1) ON CONFLICT (kind) DO UPDATE SET n = ref_seq.n + 1 RETURNING n', ['dev']);
      const ref = 'DEV-' + String(r.rows[0].n).padStart(3, '0');
      await client.query('INSERT INTO deviation (reference, runs, lots, raised_by, raised_at, description, state) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [ref, JSON.stringify(runs), JSON.stringify(lots), user.email, nowIso().slice(0, 10), body.description, 'open']);
      await recordTx(client, { user, act: 'deviation_raised', object: ref, payload: { runs, lots } });
      return { reference: ref };
    });
  });
});

quality.get('/deviations', async (c) => {
  const r = await q('SELECT * FROM deviation ORDER BY reference');
  return c.json(r.rows.map((d) => ({
    reference: d.reference, runs: d.runs, lots: d.lots, raised_by: d.raised_by, raised_at: d.raised_at,
    description: d.description, state: d.state, state_word: d.state, outcome: d.outcome
  })));
});

quality.post('/deviations/:reference/close', async (c) => {
  const user = c.get('user');
  if (user.role !== 'quality_manager') refuse(403, 'forbidden', { message: 'A quality manager closes a deviation.' });
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['outcome']);
    if (!['root_cause_found', 'cause_not_established'].includes(body.outcome)) refuse(400, 'unknown_outcome');
    const d = (await q('SELECT * FROM deviation WHERE reference = $1', [c.req.param('reference')])).rows[0];
    if (!d) refuse(404, 'not_found');
    if (d.state === 'closed') refuse(409, 'already_closed');
    return await tx(async (client) => {
      await client.query('UPDATE deviation SET state = $2, outcome = $3 WHERE reference = $1', [d.reference, 'closed', body.outcome]);
      await recordTx(client, { user, act: 'deviation_closed', object: d.reference, payload: { outcome: body.outcome } });
      return { reference: d.reference, outcome: body.outcome };
    });
  });
});

quality.post('/overrides', async (c) => {
  const user = c.get('user');
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['separation', 'reason', 'lot', 'authorised_by']);
    if (String(body.reason || '').length < 40) {
      refuse(400, 'reason_too_short', { message: 'An override carries a reason of at least forty characters.' });
    }
    return await tx(async (client) => {
      const r = await client.query('INSERT INTO ref_seq (kind, n) VALUES ($1, 1) ON CONFLICT (kind) DO UPDATE SET n = ref_seq.n + 1 RETURNING n', ['ovr']);
      const ref = 'OVR-' + String(r.rows[0].n).padStart(4, '0');
      await client.query('INSERT INTO override (reference, lot, separation, reason, authorised_by, authorised_on, reviewed) VALUES ($1,$2,$3,$4,$5,$6,false)',
        [ref, body.lot, body.separation, body.reason, body.authorised_by, nowIso().slice(0, 10)]);
      await recordTx(client, { user, act: 'override_authorised', object: ref, payload: { separation: body.separation, lot: body.lot } });
      return { reference: ref };
    });
  });
});

quality.get('/overrides', async (c) => {
  const r = await q('SELECT * FROM override ORDER BY reference');
  return c.json(r.rows.map((o) => ({
    reference: o.reference, lot: o.lot, separation: o.separation, reason: o.reason,
    authorised_by: o.authorised_by, authorised_on: o.authorised_on,
    reviewed: o.reviewed, reviewed_by: o.reviewed_by, reviewed_on: o.reviewed_on
  })));
});

quality.post('/overrides/:reference/review', async (c) => {
  const user = c.get('user');
  const o = (await q('SELECT * FROM override WHERE reference = $1', [c.req.param('reference')])).rows[0];
  if (!o) refuse(404, 'not_found');
  if (o.authorised_by === user.email) {
    refuse(403, 'forbidden', { message: 'A review is refused for the authoriser.' });
  }
  if (!['quality_manager', 'claims_manager'].includes(user.role)) {
    refuse(403, 'forbidden', { message: 'A review is refused for anybody who is neither a quality manager nor a claims manager.' });
  }
  if (o.reviewed) refuse(409, 'already_reviewed');
  return idempotent(c, async () => {
    return await tx(async (client) => {
      await client.query('UPDATE override SET reviewed = true, reviewed_by = $2, reviewed_on = $3 WHERE reference = $1',
        [o.reference, user.email, nowIso().slice(0, 10)]);
      await recordTx(client, { user, act: 'override_reviewed', object: o.reference, payload: { reviewed: true } });
      return { reference: o.reference, reviewed: true, reviewed_by: user.email };
    });
  });
});

export default quality;
