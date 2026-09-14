import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore, refusePagination } from '../lib/idem.js';
import { batchView, impactFor } from '../lib/engine.js';
import { dryMass, partyNameAt } from '../lib/units.js';

const CATEGORIES = ['post_consumer', 'pre_consumer'];

export async function register({ app, pool }) {
  app.get('/api/batches', async (c) => {
    refusePagination(c.req.query());
    const s = requireSession(c);
    const rows = (await pool.query(`SELECT * FROM batches ORDER BY reference`)).rows;
    const out = [];
    for (const b of rows) out.push(await batchView(pool, b));
    return c.json(out);
  });

  app.get('/api/batches/:reference', async (c) => {
    const s = requireSession(c);
    const b = (await pool.query(`SELECT * FROM batches WHERE reference=$1`, [c.req.param('reference')])).rows[0];
    if (!b) throw new HttpError(404, 'batch_not_found');
    return c.json(await batchView(pool, b));
  });

  app.post('/api/batches', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('plant_operator')) throw new HttpError(403, 'plant_operator_required');
    const body = await c.req.json().catch(() => ({}));
    const errs = [];
    if (!body.collector) errs.push('collector');
    if (!body.site) errs.push('site');
    if (!body.category) errs.push('category');
    if (!CATEGORIES.includes(body.category)) errs.push('category must be post_consumer or pre_consumer');
    if (body.net_g == null || body.gross_g == null || body.tare_g == null) errs.push('gross_g, tare_g, net_g');
    if (body.moisture_bp == null) errs.push('moisture_bp');
    if (!body.moisture_method) errs.push('moisture_method');
    if (!body.device) errs.push('device');
    if (!body.received_on) errs.push('received_on');
    if (!body.composition) errs.push('composition');
    if (!body.contamination) errs.push('contamination');
    if (!body.custody) errs.push('custody');
    if (errs.length) throw new HttpError(400, 'invalid_batch', { missing: errs });
    if (Number(body.net_g) + Number(body.tare_g) !== Number(body.gross_g)) {
      throw new HttpError(400, 'mass_does_not_sum', { message: 'net_g plus tare_g must equal gross_g.' });
    }
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, 'batches', body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const seq = (await client.query(`SELECT v FROM app_meta WHERE k='batch_seq'`)).rows;
      let n = seq.length ? Number(seq[0].v) + 1 : 1006;
      if (seq.length) await client.query(`UPDATE app_meta SET v=$1 WHERE k='batch_seq'`, [String(n)]);
      else await client.query(`INSERT INTO app_meta VALUES ('batch_seq',$1)`, [String(n)]);
      const ref = `BATCH-${n}`;
      const name = await partyNameAt(client, body.collector, body.received_on);
      await client.query(
        `INSERT INTO batches (reference,collector,site,grade,category,received_on,gross_g,tare_g,net_g,moisture_bp,moisture_method,device,composition,contamination,custody,accepted_g,collector_name,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [ref, body.collector, body.site, body.grade || 'N6', body.category, body.received_on,
         Number(body.gross_g), Number(body.tare_g), Number(body.net_g), Number(body.moisture_bp),
         body.moisture_method, body.device, JSON.stringify(body.composition), JSON.stringify(body.contamination),
         JSON.stringify(body.custody || []), Number(body.net_g), name, s.email]);
      await record(client, { kind: 'batch_booked', object_ref: ref, actor: s.email, site: body.site, content: { collector: body.collector, category: body.category, net_g: Number(body.net_g), moisture_bp: Number(body.moisture_bp), device: body.device, received_on: body.received_on } });
      const row = (await client.query(`SELECT * FROM batches WHERE reference=$1`, [ref])).rows[0];
      const response = await batchView(client, row);
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.patch('/api/batches/:reference', async (c) => {
    const s = requireSession(c);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    const b = (await pool.query(`SELECT * FROM batches WHERE reference=$1`, [ref])).rows[0];
    if (!b) throw new HttpError(404, 'batch_not_found');
    if (body.category !== undefined && body.category !== b.category) {
      throw new HttpError(409, 'category_immutable', {
        message: 'A batch category cannot be changed after acceptance, by any role, through any route.',
        rule: 'batch_category_immutable'
      });
    }
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `batches:${ref}:patch`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const fields = ['composition','contamination','custody'];
      for (const f of fields) if (body[f] !== undefined) {
        await client.query(`UPDATE batches SET ${f}=$1 WHERE reference=$2`, [JSON.stringify(body[f]), ref]);
      }
      const row = (await client.query(`SELECT * FROM batches WHERE reference=$1`, [ref])).rows[0];
      await record(client, { kind: 'batch_updated', object_ref: ref, actor: s.email, site: b.site, content: { fields: Object.keys(body) } });
      const response = await batchView(client, row);
      await idemStore(client, guard, 200, response);
      return c.json(response);
    });
  });

  app.post('/api/batches/:reference/custody', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('plant_operator')) throw new HttpError(403, 'plant_operator_required');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    if (!body.kind || !body.date || !body.party) throw new HttpError(400, 'kind_date_party_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `batches:${ref}:custody`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const b = (await client.query(`SELECT * FROM batches WHERE reference=$1`, [ref])).rows[0];
      if (!b) throw new HttpError(404, 'batch_not_found');
      const cust = b.custody || [];
      if (!cust.find((l) => l.kind === body.kind)) cust.push({ kind: body.kind, date: body.date, party: body.party });
      const kinds = new Set(cust.map((l) => l.kind));
      const complete = ['collection_site','collector','transport','arrival','weighing','acceptance'].every((k) => kinds.has(k));
      const lateDate = body.date;
      await client.query(`UPDATE batches SET custody=$1, claimable_from=$2 WHERE reference=$3`,
        [JSON.stringify(cust), complete ? (b.claimable_from || lateDate) : b.claimable_from, ref]);
      await record(client, { kind: 'custody_late_document', object_ref: ref, actor: s.email, site: b.site, content: { kind: body.kind, date: body.date, complete, claimable_from: complete ? lateDate : null } });
      const row = (await client.query(`SELECT * FROM batches WHERE reference=$1`, [ref])).rows[0];
      const response = await batchView(client, row);
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.post('/api/batches/:reference/reject', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('plant_operator')) throw new HttpError(403, 'plant_operator_required');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    if (body.rejected_g == null || !body.reason || !body.destination) throw new HttpError(400, 'rejected_g_reason_destination_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `batches:${ref}:reject`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const b = (await client.query(`SELECT * FROM batches WHERE reference=$1`, [ref])).rows[0];
      if (!b) throw new HttpError(404, 'batch_not_found');
      const rejected = Number(body.rejected_g);
      const accepted = b.net_g - rejected;
      if (accepted + rejected !== b.net_g) throw new HttpError(400, 'parts_do_not_sum');
      await client.query(`UPDATE batches SET rejected_g=$1, accepted_g=$2, rejected_destination=$3, rejection_reason=$4 WHERE reference=$5`,
        [rejected, accepted, body.destination, body.reason, ref]);
      await record(client, { kind: 'batch_rejected', object_ref: ref, actor: s.email, site: b.site, content: { rejected_g: rejected, reason: body.reason, destination: body.destination } });
      const row = (await client.query(`SELECT * FROM batches WHERE reference=$1`, [ref])).rows[0];
      const response = await batchView(client, row);
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.get('/api/batches/:reference/impact', async (c) => {
    refusePagination(c.req.query());
    const s = requireSession(c);
    const imp = await impactFor(pool, c.req.param('reference'));
    if (!imp) throw new HttpError(404, 'batch_not_found');
    return c.json(imp);
  });
}
