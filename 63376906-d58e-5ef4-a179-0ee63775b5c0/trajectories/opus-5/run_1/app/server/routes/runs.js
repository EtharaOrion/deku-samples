import { pool, query, one, tx, nextCounter } from '../db.js';
import {
  refuse, requireSession, requireRole, refuseAuditorWrite, withIdempotency,
  refusePagination, recordRefusal, todayISO, dateOnly,
} from '../lib/http.js';
import { appendEntry } from '../lib/record.js';
import { requireInteger, dryMass, creditGranted, weightedContentBp } from '../lib/num.js';
import * as engine from '../engine.js';

const RUN_TYPES = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];

export default function register(api) {
  api.get('/runs', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM run ORDER BY started_at, reference');
    const out = [];
    for (const r of rows) out.push(await engine.resolveRun(r));
    return c.json(out);
  });

  api.get('/runs/:reference', async (c) => {
    requireSession(c);
    const r = await engine.runByReference(c.req.param('reference'));
    if (!r) throw refuse(404, 'no_such_run', 'No such run.');
    return c.json(r);
  });

  api.post('/runs', async (c) => {
    const s = requireRole(c, 'plant_operator');
    refuseAuditorWrite(s);
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, 'POST /runs', body, async () => {
      const { run_type, site, equipment, recipe_version, operator, started_at } = body;
      if (!RUN_TYPES.includes(run_type)) throw refuse(400, 'run_type_invalid', `run_type is one of ${RUN_TYPES.join(', ')}.`);
      if (!site || !equipment || !recipe_version || !operator || !started_at) {
        throw refuse(400, 'fields_required', 'site, equipment, recipe_version, operator and started_at are required.');
      }
      if (body.losses_g !== undefined) {
        throw refuse(400, 'computed_figure_refused', 'A loss figure is computed and no route accepts one.');
      }
      const recipe = await one('SELECT * FROM recipe_version WHERE reference = $1', [recipe_version]);
      if (!recipe) throw refuse(404, 'no_such_recipe_version', 'No such recipe version.');
      if (!(s.sites || []).includes(site)) throw refuse(403, 'site_out_of_scope', `This grant does not cover ${site}.`);
      const reference = await tx(async (client) => {
        const r = await nextCounter(client, 'run_' + run_type, 4,
          `RUN-${{ dissolution: 'D', depolymerisation: 'Y', purification: 'U', repolymerisation: 'R' }[run_type]}-`);
        await client.query(
          `INSERT INTO run (reference,run_type,site,equipment,recipe_version,operator,started_at,state,actual_set_points,event_at,effective_on,recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8,$7,$9,$10)`,
          [r, run_type, site, equipment, recipe_version, operator, started_at,
            JSON.stringify(body.actual_set_points || {}), dateOnly(body.effective_on || started_at), s.email]
        );
        await appendEntry(client, {
          act: 'run_started', person: s.email, site, object_kind: 'run', object_ref: r,
          event_at: started_at, content: { run_type, equipment, recipe_version, operator },
        });
        return r;
      });
      return { status: 201, body: await engine.runByReference(reference) };
    });
  });

  api.post('/runs/:reference/consumptions', async (c) => {
    const s = requireRole(c, 'plant_operator');
    refuseAuditorWrite(s);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /runs/${ref}/consumptions`, body, async () => {
      const { input_kind, input_ref, mass_g } = body;
      requireInteger(mass_g, 'mass_g');
      if (!['batch', 'output'].includes(input_kind)) throw refuse(400, 'input_kind_invalid', 'input_kind is one of batch, output.');
      const run = await one('SELECT * FROM run WHERE reference = $1', [ref]);
      if (!run) throw refuse(404, 'no_such_run', 'No such run.');
      if (run.state === 'closed') {
        await recordRefusal({
          act: 'consumption_refused', person: s.email, site: run.site, object_kind: 'run', object_ref: ref,
          content: { reason: 'a closed run refuses every write' },
        });
        throw refuse(409, 'run_closed', 'A closed run refuses every write. A correction is a new record naming what it corrects.');
      }
      const effectiveOn = dateOnly(body.effective_on || body.event_at || run.started_at);

      // A consumption whose effective date falls in a closed period is refused
      // as a write into that period and opens a restatement instead.
      const period = await one(
        `SELECT * FROM balance_period WHERE site = $1 AND period_from <= $2 AND period_to >= $2 LIMIT 1`,
        [run.site, effectiveOn]
      );
      if (period && period.state === 'closed') {
        const restatement = await tx(async (client) => {
          const r = await nextCounter(client, 'restatement', 4, 'RST-');
          const certs = await client.query('SELECT number, version FROM certificate WHERE period = $1', [period.id]);
          await client.query(
            `INSERT INTO restatement (reference,period,reason,state,certificates,opened_by)
             VALUES ($1,$2,$3,'open',$4,$5)`,
            [r, period.id,
              `A consumption effective ${effectiveOn} arrived after the period closed.`,
              JSON.stringify(certs.rows.map((x) => ({ certificate: x.number, version: x.version }))), s.email]
          );
          await appendEntry(client, {
            act: 'restatement_opened', person: s.email, site: run.site,
            object_kind: 'restatement', object_ref: r,
            content: { period: period.id, reason: 'a consumption effective in a closed period' },
          });
          return r;
        });
        throw refuse(409, 'period_closed',
          'This period is closed. Corrections require a restatement.',
          { period: period.id, restatement, effective_on: effectiveOn });
      }

      const result = await tx(async (client) => {
        const reference = await nextCounter(client, 'consumption', 4, 'CON-');
        const eventAt = body.event_at || new Date().toISOString();
        await client.query(
          `INSERT INTO consumption (reference,run,input_kind,input_ref,mass_g,event_at,effective_on,recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [reference, ref, input_kind, input_ref, mass_g, eventAt, effectiveOn, s.email]
        );
        // Credits enter when a claimable batch is consumed.
        let credit = null;
        if (input_kind === 'batch' && period) {
          const batch = await engine.batchByReference(input_ref);
          if (!batch) throw refuse(404, 'no_such_batch', 'No such batch.');
          const claimableOn = batch.claimable && (!batch.claimable_from || batch.claimable_from <= effectiveOn);
          if (claimableOn) {
            const factor = await engine.factorInForce(run.site, effectiveOn);
            const dry = dryMass(mass_g, 0);
            const granted = creditGranted(dry, factor ? factor.factor_bp : 0);
            if (granted > 0) {
              const mref = await nextCounter(client, 'credit_movement', 4, 'CRM-');
              await client.query(
                `INSERT INTO credit_movement (reference,period,direction,movement,category,mass_g,batch,consumption,fresh_credit,factor_version,derivation,event_at,effective_on,recorded_by)
                 VALUES ($1,$2,'in','consumption',$3,$4,$5,$6,true,$7,$8,$9,$10,$11)`,
                [mref, period.id, batch.category, granted, input_ref, reference,
                  factor ? factor.reference : null,
                  JSON.stringify({
                    rule: 'dry_mass_consumed_g * factor_bp / 10000, floored',
                    dry_mass_consumed_g: dry, factor_bp: factor ? factor.factor_bp : 0,
                    factor: factor ? factor.reference : null, consumption: reference,
                  }), eventAt, effectiveOn, s.email]
              );
              credit = { reference: mref, mass_g: granted, category: batch.category };
            }
          }
        }
        await appendEntry(client, {
          act: 'consumption_recorded', person: s.email, site: run.site,
          object_kind: 'consumption', object_ref: reference, event_at: eventAt, effective_on: effectiveOn,
          content: { run: ref, input_kind, input: input_ref, mass_g: Number(mass_g), credit },
        });
        return { reference, credit };
      });
      return { status: 201, body: { reference: result.reference, run: ref, input_kind, input_ref, mass_g: Number(mass_g), effective_on: effectiveOn, credit_granted: result.credit } };
    });
  });

  api.post('/runs/:reference/outputs', async (c) => {
    const s = requireRole(c, 'plant_operator');
    refuseAuditorWrite(s);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /runs/${ref}/outputs`, body, async () => {
      const { kind, mass_g, disposition } = body;
      requireInteger(mass_g, 'mass_g');
      if (!['intermediate', 'lot', 'byproduct'].includes(kind)) {
        throw refuse(400, 'kind_invalid', 'kind is one of intermediate, lot, byproduct.');
      }
      if (kind === 'byproduct' && !['sold', 'disposed'].includes(disposition)) {
        throw refuse(400, 'disposition_required', 'A byproduct carries a disposition in sold, disposed.');
      }
      const run = await one('SELECT * FROM run WHERE reference = $1', [ref]);
      if (!run) throw refuse(404, 'no_such_run', 'No such run.');
      if (run.state === 'closed') throw refuse(409, 'run_closed', 'A closed run refuses every write.');

      const result = await tx(async (client) => {
        const prefix = { dissolution: 'OUT-D-', depolymerisation: 'OUT-Y-', purification: 'OUT-U-', repolymerisation: 'OUT-R-' }[run.run_type];
        let reference;
        if (kind === 'lot') {
          reference = await nextCounter(client, 'lot_' + (body.grade || 'N6'), 4, `LOT-${body.grade || 'N6'}-`);
        } else {
          reference = await nextCounter(client, 'output_' + run.run_type, 4, prefix);
        }
        const eventAt = body.event_at || new Date().toISOString();
        const effectiveOn = dateOnly(body.effective_on || eventAt);
        await client.query(
          `INSERT INTO output (reference,run,kind,mass_g,disposition,event_at,effective_on,recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [reference, ref, kind, mass_g, disposition || null, eventAt, effectiveOn, s.email]
        );
        if (kind === 'lot') {
          const period = await client.query(
            `SELECT id FROM balance_period WHERE site = $1 AND grade = $2 AND period_from <= $3 AND period_to >= $3 LIMIT 1`,
            [run.site, body.grade || 'N6', effectiveOn]
          );
          const factor = await engine.factorInForce(run.site, effectiveOn);
          await client.query(
            `INSERT INTO lot (reference,grade,site,mass_g,disposition,claim_type,produced_by,output_ref,period,provisional_factor,sites_named,event_at,effective_on,recorded_by)
             VALUES ($1,$2,$3,$4,'pending',$5,$6,$1,$7,$8,$9,$10,$11,$12)`,
            [reference, body.grade || 'N6', run.site, mass_g, body.claim_type || 'mass_balance', ref,
              period.rows[0] ? period.rows[0].id : null, factor ? factor.provisional : false,
              JSON.stringify([run.site]), eventAt, effectiveOn, s.email]
          );
        }
        await appendEntry(client, {
          act: 'output_recorded', person: s.email, site: run.site, object_kind: 'output',
          object_ref: reference, event_at: eventAt,
          content: { run: ref, kind, mass_g: Number(mass_g), disposition: disposition || null },
        });
        return reference;
      });
      return { status: 201, body: { reference: result, run: ref, kind, mass_g: Number(mass_g), disposition: disposition || null } };
    });
  });

  api.post('/runs/:reference/close', async (c) => {
    const s = requireRole(c, 'plant_operator');
    refuseAuditorWrite(s);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /runs/${ref}/close`, body, async () => {
      if (body.losses_g !== undefined) {
        throw refuse(400, 'computed_figure_refused', 'losses_g is computed as mass in minus mass out and no route accepts one.');
      }
      const run = await one('SELECT * FROM run WHERE reference = $1', [ref]);
      if (!run) throw refuse(404, 'no_such_run', 'No such run.');
      // A second close answers 409 and is itself recorded as an attempt.
      if (run.state === 'closed') {
        await recordRefusal({
          act: 'run_close_attempted', person: s.email, site: run.site, object_kind: 'run', object_ref: ref,
          content: { reason: 'a closed run refuses a second close', closed_at: run.closed_at },
        });
        throw refuse(409, 'run_already_closed', 'A closed run refuses a second close. The attempt is recorded.',
          { closed_at: run.closed_at, losses_g: Number(run.losses_g) });
      }
      const closed = await tx(async (client) => {
        const cons = await client.query('SELECT mass_g FROM consumption WHERE run = $1', [ref]);
        const outs = await client.query('SELECT mass_g, kind, disposition, reference FROM output WHERE run = $1', [ref]);
        const massIn = cons.rows.reduce((a, r) => a + Number(r.mass_g), 0);
        const massOut = outs.rows.reduce((a, r) => a + Number(r.mass_g), 0);
        const losses = massIn - massOut;
        const closedAt = body.closed_at || new Date().toISOString();
        await client.query(
          `UPDATE run SET state = 'closed', closed_at = $2, losses_g = $3,
             actual_set_points = COALESCE($4::jsonb, actual_set_points) WHERE reference = $1`,
          [ref, closedAt, losses, body.actual_set_points ? JSON.stringify(body.actual_set_points) : null]
        );
        await appendEntry(client, {
          act: 'run_closed', person: s.email, site: run.site, object_kind: 'run', object_ref: ref,
          event_at: closedAt,
          content: { losses_g: losses, mass_in_g: massIn, mass_out_g: massOut, rule: 'mass in minus mass out' },
        });
        return { losses, closedAt };
      });

      const resolved = await engine.runByReference(ref);
      // A run outside its recipe tolerance raises a deviation whether or not
      // its output passed its tests.
      let deviation = null;
      if (!resolved.within_tolerance) {
        deviation = await tx(async (client) => {
          const r = await nextCounter(client, 'deviation', 4, 'DEV-');
          const lots = await client.query("SELECT reference FROM output WHERE run = $1 AND kind = 'lot'", [ref]);
          const detail = resolved.tolerance_detail
            .filter((t) => !t.within)
            .map((t) => `${t.parameter} reached ${t.actual} against a band of ${t.min} to ${t.max}`)
            .join('; ');
          await client.query(
            `INSERT INTO deviation (reference,state,runs,lots,detail,raised_by,raised_at,event_at,effective_on)
             VALUES ($1,'open',$2,$3,$4,$5,now(),now(),CURRENT_DATE)`,
            [r, JSON.stringify([ref]), JSON.stringify(lots.rows.map((x) => x.reference)),
              `Run outside its recipe tolerance: ${detail}.`, s.email]
          );
          await appendEntry(client, {
            act: 'deviation_raised', person: s.email, site: run.site, object_kind: 'deviation', object_ref: r,
            content: { run: ref, detail, rule: 'a run outside its recipe tolerance raises a deviation' },
          });
          return r;
        });
      }
      return {
        status: 200,
        body: {
          ...(await engine.runByReference(ref)),
          reference: ref,
          losses_g: closed.losses,
          deviation_raised: deviation,
          queued: false,
          note: 'Losses reduce the claim.',
        },
      };
    });
  });

  // ---- Genealogy ----------------------------------------------------------

  api.get('/lots/:reference/genealogy', async (c) => {
    refusePagination(c);
    requireSession(c);
    const g = await engine.genealogy(c.req.param('reference'));
    if (!g) throw refuse(404, 'no_such_lot', 'No such lot.');
    return c.json(g);
  });

  api.get('/batches/:reference/impact', async (c) => {
    refusePagination(c);
    requireSession(c);
    const impact = await engine.batchImpact(c.req.param('reference'));
    if (!impact) throw refuse(404, 'no_such_batch', 'No such batch.');
    return c.json(impact);
  });

  // ---- Lots ---------------------------------------------------------------

  api.get('/lots', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM lot ORDER BY reference');
    const out = [];
    for (const r of rows) out.push(await engine.resolveLot(r));
    return c.json(out);
  });

  api.get('/lots/:reference', async (c) => {
    requireSession(c);
    const lot = await engine.lotByReference(c.req.param('reference'));
    if (!lot) throw refuse(404, 'no_such_lot', 'No such lot.');
    return c.json(lot);
  });

  // A yield figure answers for plant, quality and the claims manager only.
  api.get('/lots/:reference/yield', async (c) => {
    const s = requireRole(c, 'plant_operator', 'quality_manager', 'claims_manager', 'auditor');
    const y = await engine.lotYield(c.req.param('reference'));
    if (!y) throw refuse(404, 'no_such_lot', 'No such lot.');
    return c.json(y);
  });

  api.post('/lots/:reference/disposition', async (c) => {
    const s = requireSession(c);
    refuseAuditorWrite(s);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    const lot = await one('SELECT * FROM lot WHERE reference = $1', [ref]);
    if (!lot) throw refuse(404, 'no_such_lot', 'No such lot.');

    if (!(s.roles || []).includes('quality_manager')) {
      await recordRefusal({
        act: 'disposition_refused', person: s.email, site: lot.site, object_kind: 'lot', object_ref: ref,
        content: { reason: 'only a quality manager sets a lot disposition', roles: s.roles },
      });
      throw refuse(403, 'role_not_held', 'Only a quality manager sets a lot disposition.');
    }
    // Whoever entered a test result does not disposition that lot.
    const entered = await query(
      'SELECT reference FROM test_result WHERE subject_ref = $1 AND entered_by = $2', [ref, s.email]
    );
    if (entered.length) {
      await recordRefusal({
        act: 'disposition_refused', person: s.email, site: lot.site, object_kind: 'lot', object_ref: ref,
        content: { separation: 'analyst_not_dispositioner', test_result: entered[0].reference },
      });
      throw refuse(403, 'separation_analyst_not_dispositioner',
        'Whoever entered a test result does not disposition that lot.',
        { separation: 'analyst_not_dispositioner', blocking_reference: entered[0].reference });
    }
    const openDev = await query(
      `SELECT reference FROM deviation WHERE state = 'open' AND lots @> $1::jsonb`, [JSON.stringify([ref])]
    );
    if (openDev.length) {
      await recordRefusal({
        act: 'disposition_refused', person: s.email, site: lot.site, object_kind: 'lot', object_ref: ref,
        content: { reason: 'a deviation touching the lot is open', deviation: openDev[0].reference },
      });
      throw refuse(409, 'deviation_open', 'A deviation touching this lot is open.',
        { blocking_reference: openDev[0].reference });
    }
    return withIdempotency(c, `POST /lots/${ref}/disposition`, body, async () => {
      const { disposition } = body;
      if (!['pending', 'released', 'quarantined', 'rejected'].includes(disposition)) {
        throw refuse(400, 'disposition_invalid', 'disposition is one of pending, released, quarantined, rejected.');
      }
      await tx(async (client) => {
        await client.query(
          'UPDATE lot SET disposition = $2, dispositioned_by = $3, dispositioned_at = now() WHERE reference = $1',
          [ref, disposition, s.email]
        );
        await appendEntry(client, {
          act: 'lot_dispositioned', person: s.email, site: lot.site, object_kind: 'lot', object_ref: ref,
          content: { disposition },
        });
      });
      return { status: 200, body: await engine.lotByReference(ref) };
    });
  });

  // ---- Blending -----------------------------------------------------------

  api.post('/lots/:reference/blend', async (c) => {
    const s = requireRole(c, 'plant_operator', 'quality_manager', 'claims_manager');
    refuseAuditorWrite(s);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /lots/${ref}/blend`, body, async () => {
      if (body.content_bp !== undefined) throw refuse(400, 'computed_figure_refused', 'The blended content is computed and no route accepts one.');
      const other = body.with || body.lot_b;
      if (!other) throw refuse(400, 'lot_required', 'A blend names the second lot as `with`.');
      const a = await engine.lotByReference(ref);
      const b = await engine.lotByReference(other);
      if (!a || !b) throw refuse(404, 'no_such_lot', 'No such lot.');
      const CLAIM_ORDER = ['physically_segregated', 'controlled_blending', 'mass_balance'];
      const weaker = CLAIM_ORDER[Math.max(CLAIM_ORDER.indexOf(a.claim_type), CLAIM_ORDER.indexOf(b.claim_type))];
      const massG = a.mass_g + b.mass_g;
      const blendedBp = weightedContentBp(a.mass_g, a.content_bp, b.mass_g, b.content_bp);
      const sites = Array.from(new Set([...(a.sites_named || [a.site]), ...(b.sites_named || [b.site])])).sort();
      const provisional = a.provisional_factor || b.provisional_factor;

      const reference = await tx(async (client) => {
        const r = await nextCounter(client, 'lot_' + a.grade, 4, `LOT-${a.grade}-`);
        await client.query(
          `INSERT INTO lot (reference,grade,site,mass_g,disposition,claim_type,period,provisional_factor,blended_from,sites_named,event_at,effective_on,recorded_by)
           VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,now(),CURRENT_DATE,$10)`,
          [r, a.grade, a.site, massG, weaker, null, provisional,
            JSON.stringify([{ lot: a.reference, mass_g: a.mass_g, content_bp: a.content_bp },
              { lot: b.reference, mass_g: b.mass_g, content_bp: b.content_bp }]),
            JSON.stringify(sites), s.email]
        );
        const credit = Math.floor((blendedBp * massG) / 10000);
        await appendEntry(client, {
          act: 'lots_blended', person: s.email, site: a.site, object_kind: 'lot', object_ref: r,
          content: { blended_from: [a.reference, b.reference], mass_g: massG, content_bp: blendedBp, sites_named: sites },
        });
        return r;
      });
      return {
        status: 201,
        body: {
          reference,
          mass_g: massG,
          content_bp: blendedBp,
          claim_type: weaker,
          sites_named: sites,
          provisional_factor: provisional,
          blended_from: [
            { lot: a.reference, mass_g: a.mass_g, content_bp: a.content_bp, site: a.site, claim_type: a.claim_type },
            { lot: b.reference, mass_g: b.mass_g, content_bp: b.content_bp, site: b.site, claim_type: b.claim_type },
          ],
          derivation: {
            rule: '(mass_a * content_a + mass_b * content_b) / (mass_a + mass_b), floored',
            note: 'The resulting claim takes the weaker of the two claim types and the weaker certification scope. Any non-claimable material in the blend dilutes the computed percentage.',
          },
        },
      };
    });
  });

  api.get('/outputs/:reference/byproduct-share', async (c) => {
    requireSession(c);
    const share = await engine.byproductShare(c.req.param('reference'));
    if (!share) throw refuse(404, 'no_such_byproduct', 'No such byproduct output.');
    return c.json(share);
  });

  api.get('/outputs', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM output ORDER BY reference');
    return c.json(rows.map((o) => ({
      reference: o.reference, run: o.run, kind: o.kind, mass_g: Number(o.mass_g), disposition: o.disposition,
    })));
  });

  api.get('/recipe-versions', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM recipe_version ORDER BY reference');
    return c.json(rows.map((r) => ({
      reference: r.reference, run_type: r.run_type, version: r.version,
      set_points: r.set_points, tolerances: r.tolerances, reagents: r.reagents,
      residence_min: r.residence_min, released_by: r.released_by, released_on: dateOnly(r.released_on),
    })));
  });
}
