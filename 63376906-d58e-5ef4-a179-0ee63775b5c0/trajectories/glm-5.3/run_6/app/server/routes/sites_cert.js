import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';

export async function register({ app, pool }) {
  // suspension with an effective_from that may precede the record date
  app.post('/api/sites/:reference/certification', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('quality_manager')) throw new HttpError(403, 'quality_manager_required');
    const body = await c.req.json().catch(() => ({}));
    const site = c.req.param('reference');
    const kind = body.kind || 'suspension';
    const effective_from = body.effective_from;
    const effective_to = body.effective_to || null;
    if (!effective_from) throw new HttpError(400, 'effective_from_required');
    if (kind === 'suspension' && !effective_to) throw new HttpError(400, 'effective_to_required_for_suspension');
    return withTx(pool, async (client) => {
      const id = await client.query(`INSERT INTO suspensions (site,kind,effective_from,effective_to,recorded_by)
        VALUES ($1,$2,$3,$4,$5) RETURNING id`, [site, kind, effective_from, effective_to, s.email]);
      if (kind === 'suspension') {
        await client.query(`UPDATE sites SET certification_state='suspended' WHERE reference=$1`, [site]);
      } else {
        await client.query(`UPDATE sites SET certification_state='certified' WHERE reference=$1`, [site]);
      }
      // enumerate certificates signed inside the window
      const certs = (await client.query(
        `SELECT number, lot, state FROM certificates WHERE site=$1 AND signed_at::date BETWEEN $2 AND $3 ORDER BY number`,
        [site, effective_from, effective_to]
      )).rows;
      const resolutions = certs.map((x) => ({ certificate: x.number, outcome: null, reason: null }));
      await record(client, {
        kind: kind === 'suspension' ? 'certification_suspended' : 'certification_lifted',
        object_ref: site, actor: s.email, site,
        content: { effective_from, effective_to, certificates_in_window: certs.map((x) => x.number) }
      });
      return c.json({
        id: id.rows[0].id, site, kind, effective_from, effective_to,
        certificates_in_window: certs.map((x) => ({ number: x.number, lot: x.lot, state: x.state, resolution: null })),
        resolutions
      }, 201);
    });
  });

  app.get('/api/sites/:reference/certification', (c) => {
    const ref = c.req.param('reference');
    return pool.query(`SELECT * FROM suspensions WHERE site=$1 ORDER BY id DESC`, [ref]).then((r) => {
      const rows = r.rows;
      const active = rows.find((x) => x.kind === 'suspension');
      return c.json({
        site: ref,
        suspended: !!active,
        window: active ? { effective_from: active.effective_from, effective_to: active.effective_to } : null,
        history: rows.map((x) => ({ kind: x.kind, effective_from: x.effective_from, effective_to: x.effective_to, recorded_by: x.recorded_by }))
      });
    });
  });
}
