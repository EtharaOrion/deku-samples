import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record, entryView, checkChain, retentionFor } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore, refusePagination } from '../lib/idem.js';

export async function register({ app, pool }) {
  app.get('/api/record', async (c) => {
    refusePagination(c.req.query());
    requireSession(c);
    const rows = (await pool.query(`SELECT * FROM record_entries ORDER BY seq`)).rows;
    return c.json(rows.map(entryView));
  });

  app.get('/api/record/check', async (c) => {
    requireSession(c);
    return withTx(pool, async (client) => c.json(await checkChain(client)));
  });

  // an edit and a deletion of an entry are both refused
  app.patch('/api/record/:seq', async (c) => {
    requireSession(c);
    throw new HttpError(405, 'entry_immutable', {
      message: 'No entry is edited and no entry is removed. A correction is a new entry naming what it corrects.'
    });
  });
  app.delete('/api/record/:seq', async (c) => {
    requireSession(c);
    throw new HttpError(405, 'entry_immutable', {
      message: 'No entry is edited and no entry is removed. Retention expiry deletes content while keeping position and digest.'
    });
  });

  // a correction is a new entry naming what it corrects
  app.post('/api/record/:seq/corrections', async (c) => {
    const s = requireSession(c);
    const seq = Number(c.req.param('seq'));
    const body = await c.req.json().catch(() => ({}));
    if (!body.note) throw new HttpError(400, 'note_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `record:${seq}:corrections`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const orig = (await client.query(`SELECT * FROM record_entries WHERE seq=$1`, [seq])).rows[0];
      if (!orig) throw new HttpError(404, 'entry_not_found');
      const e = await record(client, {
        kind: 'correction', object_ref: orig.object_ref, actor: s.email, site: orig.site,
        content: { corrects_seq: seq, note: body.note }, corrections: String(seq)
      });
      const response = { seq: Number(e.seq), corrects: seq, note: body.note };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.get('/api/record/:seq/retention', async (c) => {
    requireSession(c);
    const seq = Number(c.req.param('seq'));
    const row = (await pool.query(`SELECT * FROM record_entries WHERE seq=$1`, [seq])).rows[0];
    if (!row) throw new HttpError(404, 'entry_not_found');
    return c.json(await retentionFor(pool, row));
  });

  app.post('/api/record/:seq/legal-hold', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('auditor')) throw new HttpError(403, 'auditor_required');
    const seq = Number(c.req.param('seq'));
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `record:${seq}:hold`, {});
      if (guard.replay) return c.json(guard.response, guard.status);
      const row = (await client.query(`SELECT * FROM record_entries WHERE seq=$1`, [seq])).rows[0];
      if (!row) throw new HttpError(404, 'entry_not_found');
      const existing = (await client.query(`SELECT reference FROM legal_holds WHERE seq=$1`, [seq])).rows[0];
      if (existing) throw new HttpError(409, 'already_held', { hold: existing.reference });
      const n = (await client.query(`SELECT count(*)::int AS n FROM legal_holds`)).rows[0].n + 1;
      const ref = `HLD-${String(n).padStart(4, '0')}`;
      await client.query(`INSERT INTO legal_holds (reference,seq,placed_by,placed_on) VALUES ($1,$2,$3,CURRENT_DATE)`, [ref, seq, s.email]);
      await record(client, { kind: 'legal_hold_placed', object_ref: ref, actor: s.email, content: { seq } });
      const response = { reference: ref, seq, placed_by: s.email };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.delete('/api/record/:seq/legal-hold', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('auditor')) throw new HttpError(403, 'auditor_required');
    const seq = Number(c.req.param('seq'));
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `record:${seq}:unhold`, {});
      if (guard.replay) return c.json(guard.response, guard.status);
      const h = (await client.query(`SELECT * FROM legal_holds WHERE seq=$1`, [seq])).rows[0];
      if (!h) throw new HttpError(404, 'hold_not_found');
      await client.query(`DELETE FROM legal_holds WHERE seq=$1`, [seq]);
      await record(client, { kind: 'legal_hold_lifted', object_ref: h.reference, actor: s.email, content: { seq } });
      const response = { reference: h.reference, seq, lifted: true };
      await idemStore(client, guard, 200, response);
      return c.json(response);
    });
  });

  app.post('/api/record/:seq/expire', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('auditor')) throw new HttpError(403, 'auditor_required');
    const seq = Number(c.req.param('seq'));
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `record:${seq}:expire`, {});
      if (guard.replay) return c.json(guard.response, guard.status);
      const row = (await client.query(`SELECT * FROM record_entries WHERE seq=$1 FOR UPDATE`, [seq])).rows[0];
      if (!row) throw new HttpError(404, 'entry_not_found');
      const hold = (await client.query(`SELECT reference FROM legal_holds WHERE seq=$1`, [seq])).rows[0];
      if (hold) throw new HttpError(409, 'legal_hold_refuses_deletion', {
        message: 'A record under hold refuses deletion.', hold: hold.reference
      });
      const r = await retentionFor(client, row);
      if (new Date(r.retain_until) > new Date()) throw new HttpError(409, 'retention_not_elapsed', {
        message: 'Content is deleted only once retain_until has passed.',
        retain_until: r.retain_until
      });
      // a certificate's existence is never deleted
      if (row.kind === 'certificate_signed' || row.kind === 'certificate_withdrawn') {
        throw new HttpError(409, 'certificate_existence_never_deleted', {
          message: 'The one fact never deleted is that a certificate existed.'
        });
      }
      await client.query(`UPDATE record_entries SET content_deleted=true, content_deleted_on=CURRENT_DATE WHERE seq=$1`, [seq]);
      await record(client, { kind: 'retention_expiry', object_ref: String(seq), actor: s.email, content: { seq, content_deleted: true } });
      const response = { seq, content_deleted: true, deleted_on: new Date().toISOString().slice(0, 10) };
      await idemStore(client, guard, 200, response);
      return c.json(response);
    });
  });

  // the nine record queries, each a complete set
  app.get('/api/record/queries/:name', async (c) => {
    refusePagination(c.req.query());
    requireSession(c);
    const name = c.req.param('name');
    const withPool = pool;
    switch (name) {
      case 'lots_from_batch': {
        const batch = c.req.query().batch;
        if (!batch) throw new HttpError(400, 'batch_required');
        const reach = new Set();
        const expand = async (ref) => {
          if (reach.has(ref)) return;
          reach.add(ref);
          const cons = (await withPool.query(`SELECT * FROM consumptions WHERE input_ref=$1`, [ref])).rows;
          for (const cs of cons) {
            const outs = (await withPool.query(`SELECT * FROM outputs WHERE run=$1`, [cs.run])).rows;
            for (const o of outs) { reach.add(o.reference); if (o.kind === 'intermediate') await expand(o.reference); }
          }
        };
        await expand(batch);
        const lots = (await withPool.query(`SELECT * FROM lots WHERE reference = ANY($1)`, [[...reach]])).rows;
        return c.json(lots.map((l) => ({ reference: l.reference, mass_g: l.mass_g, disposition: l.disposition, site: l.site })));
      }
      case 'certificates_on_period': {
        const period = c.req.query().period;
        const rows = period
          ? (await withPool.query(`SELECT * FROM certificates WHERE period=$1 ORDER BY number`, [period])).rows
          : (await withPool.query(`SELECT * FROM certificates ORDER BY number`)).rows;
        return c.json(rows.map((x) => ({ number: x.number, lot: x.lot, state: x.state, recipient: x.recipient, content_bp: x.content_bp, period: x.period })));
      }
      case 'certificates_under_method_version': {
        const mv = c.req.query().method_version;
        const rows = (await withPool.query(`
          SELECT c.* FROM certificates c JOIN carbon_figures f ON f.id = c.carbon_figure
          WHERE ($1::text IS NULL OR ('CM-PA6 v' || f.method_version) = $1)
          ORDER BY c.number`, [mv || null])).rows;
        return c.json(rows.map((x) => ({ number: x.number, method_version: 'CM-PA6 v' + (x.carbon_figure ? '2' : ''), lot: x.lot })));
      }
      case 'lots_released_under_unreviewed_override': {
        const rows = (await withPool.query(`
          SELECT l.reference, l.disposition, o.reference AS override, o.reviewed
          FROM lots l JOIN overrides o ON o.lot = l.reference
          WHERE l.disposition='released' AND NOT o.reviewed ORDER BY l.reference`)).rows;
        return c.json(rows);
      }
      case 'allocations_in_final_fortnight': {
        const rows = (await withPool.query(`
          SELECT m.* FROM credit_movements m JOIN balance_periods b ON b.id = m.period
          WHERE m.kind='allocation' AND m.effective_on > (b.period_to - 14) ORDER BY m.effective_on`)).rows;
        return c.json(rows.map((m) => ({ id: m.id, period: m.period, lot: m.lot, mass_g: m.mass_g, effective_on: m.effective_on })));
      }
      case 'refused_allocations': {
        const rows = (await withPool.query(`SELECT * FROM record_entries WHERE kind='allocation_refused' ORDER BY seq`)).rows;
        return c.json(rows.map((e) => ({ seq: Number(e.seq), actor: e.actor, content: e.content, at: e.recorded_at })));
      }
      case 'collector_declaration_departures': {
        const rows = (await withPool.query(`SELECT * FROM collector_findings ORDER BY id`)).rows;
        return c.json(rows.map((f) => ({ id: f.id, collector: f.collector, opened_on: f.opened_on, closed: f.closed, detail: f.detail })));
      }
      case 'acts_by_person': {
        const person = c.req.query().person;
        const rows = person
          ? (await withPool.query(`SELECT * FROM record_entries WHERE actor=$1 ORDER BY seq`, [person])).rows
          : (await withPool.query(`SELECT * FROM record_entries ORDER BY seq`)).rows;
        return c.json(rows.map((e) => ({ seq: Number(e.seq), actor: e.actor, kind: e.kind, object_ref: e.object_ref, at: e.recorded_at })));
      }
      case 'exports_by_auditor': {
        const person = c.req.query().person;
        const rows = person
          ? (await withPool.query(`SELECT * FROM exports WHERE exported_by=$1 ORDER BY exported_at`, [person])).rows
          : (await withPool.query(`SELECT * FROM exports ORDER BY exported_at`)).rows;
        return c.json(rows.map((x) => ({ reference: x.reference, exported_by: x.exported_by, exported_at: x.exported_at, empty: x.empty })));
      }
      default:
        throw new HttpError(404, 'unknown_query', {
          message: 'The nine questions are: lots_from_batch, certificates_on_period, certificates_under_method_version, lots_released_under_unreviewed_override, allocations_in_final_fortnight, refused_allocations, collector_declaration_departures, acts_by_person, exports_by_auditor.'
        });
    }
  });
}
