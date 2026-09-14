import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore } from '../lib/idem.js';

export async function register({ app, pool }) {
  app.get('/api/parties/:reference/versions', async (c) => {
    const ref = c.req.param('reference');
    const r = await pool.query(`SELECT name, effective_from FROM party_versions WHERE party=$1 ORDER BY effective_from ASC, id ASC`, [ref]);
    const cur = await pool.query(`SELECT current_name FROM parties WHERE reference=$1`, [ref]);
    return c.json({
      reference: ref,
      current_name: cur.rows.length ? cur.rows[0].current_name : null,
      versions: r.rows.map((v) => ({ name: v.name, effective_from: v.effective_from }))
    });
  });

  app.post('/api/parties/:reference/versions', async (c) => {
    const s = requireSession(c);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    if (!body.name || !body.effective_from) throw new HttpError(400, 'name_and_effective_from_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `parties:${ref}:versions`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const prior = await client.query(`SELECT id FROM party_versions WHERE party=$1 ORDER BY id DESC LIMIT 1`, [ref]);
      await client.query(`INSERT INTO party_versions (party,name,effective_from) VALUES ($1,$2,$3)`, [ref, body.name, body.effective_from]);
      await client.query(`UPDATE parties SET current_name=$1 WHERE reference=$2`, [body.name, ref]);
      await record(client, { kind: 'party_renamed', object_ref: ref, actor: s.email, content: { name: body.name, effective_from: body.effective_from, supersedes_version_id: prior.rows.length ? prior.rows[0].id : null } });
      const response = { reference: ref, name: body.name, effective_from: body.effective_from, supersedes: prior.rows.length ? prior.rows[0].id : null };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });
}
