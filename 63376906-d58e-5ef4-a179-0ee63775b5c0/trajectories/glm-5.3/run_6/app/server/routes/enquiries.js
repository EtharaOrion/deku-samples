import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore } from '../lib/idem.js';
import { mailEnquiry } from '../lib/mail.js';

const DEST = {
  waste_supply: { destination: 'feedstock@example.com', response_days: 3 },
  polymer_purchase: { destination: 'sales@example.com', response_days: 2 },
  partnership: { destination: 'partners@example.com', response_days: 5 },
  press: { destination: 'press@example.com', response_days: 1 }
};

export async function register({ app, pool }) {
  app.get('/api/enquiries', async (c) => {
    const r = await pool.query(`SELECT * FROM enquiries ORDER BY created_at DESC`);
    return c.json(r.rows);
  });

  app.post('/api/enquiries', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.type || !DEST[body.type]) throw new HttpError(400, 'invalid_type');
    if (!body.email) throw new HttpError(400, 'email_required');
    const cfg = DEST[body.type];
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, 'enquiries', body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const seq = (await client.query(`SELECT v FROM app_meta WHERE k='enquiry_seq'`)).rows;
      let n = seq.length ? Number(seq[0].v) + 1 : 1;
      if (seq.length) await client.query(`UPDATE app_meta SET v=$1 WHERE k='enquiry_seq'`, [String(n)]);
      else await client.query(`INSERT INTO app_meta VALUES ('enquiry_seq','1')`);
      const ref = `ENQ-${String(n).padStart(4, '0')}`;
      const deadline = new Date(Date.now() + cfg.response_days * 86400000).toISOString().slice(0, 10);
      await client.query(
        `INSERT INTO enquiries (reference,type,name,email,organisation,message,destination,response_days,deadline)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ref, body.type, body.name || null, body.email, body.organisation || null, body.message || null, cfg.destination, cfg.response_days, body.type === 'press' ? deadline : null]);
      await record(client, { kind: 'enquiry_received', object_ref: ref, actor: body.email, content: { type: body.type, destination: cfg.destination, response_days: cfg.response_days } });
      // opens a collector or conformance record
      if (body.type === 'waste_supply') {
        await client.query(`INSERT INTO parties (reference,kind,current_name,country) VALUES ($1,'collector',$2,$3) ON CONFLICT DO NOTHING`,
          [`COL-PROSPECT-${String(n).padStart(3, '0')}`, body.organisation || body.name || 'Unnamed collector', body.country || null]);
      }
      if (body.type === 'polymer_purchase') {
        await client.query(`INSERT INTO conformances (customer,application,grade,version,trials,outcome) VALUES ($1,$2,$3,0,'[]','pending') ON CONFLICT DO NOTHING`,
          [body.organisation || body.email, body.application || 'unspecified', body.grade || 'N6']);
      }
      const response = { reference: ref, destination: cfg.destination, response_days: cfg.response_days, deadline: body.type === 'press' ? deadline : null };
      await idemStore(client, guard, 201, response);
      // the enquirer receives one mail through mailpit; the notification is part of the act
      let mailSent = false;
      try {
        await mailEnquiry(body.email, ref, cfg.destination, cfg.response_days);
        mailSent = true;
      } catch (e) { console.error('mail failed', e.message); }
      await record(client, { kind: 'enquiry_mail_sent', object_ref: ref, actor: body.email, content: { to: body.email, delivered: mailSent } });
      return c.json({ ...response, mail_delivered: mailSent }, 201);
    });
  });
}
