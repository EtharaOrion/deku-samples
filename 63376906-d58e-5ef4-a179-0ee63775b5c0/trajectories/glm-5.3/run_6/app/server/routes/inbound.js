import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore, refusePagination } from '../lib/idem.js';

const SOURCES = ['weighbridge','control_system','laboratory','customer_reporting'];

export async function register({ app, pool }) {
  app.get('/api/inbound', async (c) => {
    refusePagination(c.req.query());
    requireSession(c);
    const rows = (await pool.query(`SELECT * FROM inbound_records ORDER BY received_at`)).rows;
    return c.json(rows.map((r) => ({
      reference: r.reference, source: r.source, received_at: r.received_at,
      payload_verbatim: r.payload_verbatim, payload: r.payload
    })));
  });

  app.post('/api/inbound/:source', async (c) => {
    const source = c.req.param('source');
    if (!SOURCES.includes(source)) throw new HttpError(400, 'invalid_source');
    const body = await c.req.json().catch(() => ({}));
    if (!body.received_at) throw new HttpError(400, 'received_at_required');
    if (!body.payload) throw new HttpError(400, 'payload_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `inbound:${source}`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const seq = (await client.query(`SELECT v FROM app_meta WHERE k='inbound_seq'`)).rows;
      let n = seq.length ? Number(seq[0].v) + 1 : 4;
      if (seq.length) await client.query(`UPDATE app_meta SET v=$1 WHERE k='inbound_seq'`, [String(n)]);
      else await client.query(`INSERT INTO app_meta VALUES ('inbound_seq',$1)`, [String(n)]);
      const ref = `INB-${String(n).padStart(4, '0')}`;
      const verbatim = JSON.stringify(body.payload);
      await client.query(
        `INSERT INTO inbound_records (reference,source,received_at,payload_verbatim,payload)
         VALUES ($1,$2,$3,$4,$5)`,
        [ref, source, body.received_at, verbatim, JSON.stringify(body.payload)]);
      await record(client, { kind: 'inbound_record', object_ref: ref, site: null, content: { source, received_at: body.received_at, verbatim_bytes: verbatim.length } });
      const response = { reference: ref, source, received_at: body.received_at };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });
}
