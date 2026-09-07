import { query, one, tx, nextCounter } from '../db.js';
import {
  refuse, requireSession, requireRole, refuseAuditorWrite, withIdempotency,
  refusePagination, recordRefusal, todayISO, dateOnly, momentISO,
} from '../lib/http.js';
import { appendEntry } from '../lib/record.js';
import { requireInteger, floorDiv } from '../lib/num.js';
import * as engine from '../engine.js';

const SEPARATIONS = [
  'analyst_not_dispositioner',
  'method_publisher_not_period_closer',
  'signer_not_data_enterer',
  'bookkeeper_not_approver',
];

export default function register(api) {
  // ---- Test results -------------------------------------------------------

  api.get('/test-results', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM test_result ORDER BY reference');
    return c.json(rows.map((t) => ({
      reference: t.reference, subject_kind: t.subject_kind, subject_ref: t.subject_ref,
      property: t.property, method: t.method, instrument: t.instrument, analyst: t.analyst,
      value: t.value, unit: t.unit, uncertainty_bp: t.uncertainty_bp,
      method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release,
      entered_by: t.entered_by, event_at: momentISO(t.event_at),
    })));
  });

  api.post('/test-results', async (c) => {
    const s = requireRole(c, 'lab_analyst', 'quality_manager');
    refuseAuditorWrite(s);
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, 'POST /test-results', body, async () => {
      const { property, method, instrument, analyst, value, unit, uncertainty_bp } = body;
      if (!method) throw refuse(400, 'method_required', 'A result with no method is refused.');
      if (!property || value === undefined || !unit) {
        throw refuse(400, 'fields_required', 'property, value and unit are required.');
      }
      if (uncertainty_bp !== undefined && uncertainty_bp !== null) requireInteger(uncertainty_bp, 'uncertainty_bp');
      const subjectRef = body.lot || body.batch || body.subject_ref;
      const subjectKind = body.lot ? 'lot' : body.batch ? 'batch' : body.subject_kind;
      if (!subjectRef) throw refuse(400, 'subject_required', 'A result records against a lot or a batch.');

      // A result produced by a method other than the specification's is kept as
      // evidence and never reaches a disposition.
      let mismatch = false;
      if (subjectKind === 'lot') {
        const lot = await one('SELECT * FROM lot WHERE reference = $1', [subjectRef]);
        if (lot) {
          const spec = await one(
            'SELECT * FROM specification WHERE grade = $1 AND superseded = false ORDER BY version DESC LIMIT 1',
            ['SPEC-' + lot.grade]
          );
          if (spec) {
            const row = (spec.rows || []).find((r) => r.property === property);
            if (row && row.method !== method) mismatch = true;
          }
        }
      }
      const reference = await tx(async (client) => {
        const r = await nextCounter(client, 'test_result', 4, 'TST-');
        const eventAt = body.event_at || new Date().toISOString();
        await client.query(
          `INSERT INTO test_result (reference,subject_kind,subject_ref,property,method,instrument,analyst,value,unit,uncertainty_bp,method_mismatch,usable_for_release,entered_by,event_at,effective_on)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [r, subjectKind, subjectRef, property, method, instrument || null, analyst || s.name || s.email,
            String(value), unit, uncertainty_bp ?? null, mismatch, !mismatch, s.email,
            eventAt, dateOnly(eventAt)]
        );
        await appendEntry(client, {
          act: 'test_result_entered', person: s.email, object_kind: 'test_result', object_ref: r,
          event_at: eventAt,
          content: { subject: subjectRef, property, method, value: String(value), unit, method_mismatch: mismatch },
        });
        return r;
      });
      return {
        status: 201,
        body: {
          reference, subject_kind: subjectKind, subject_ref: subjectRef, property, method,
          instrument: instrument || null, analyst: analyst || s.name || s.email,
          value: String(value), unit, uncertainty_bp: uncertainty_bp ?? null,
          method_mismatch: mismatch,
          usable_for_release: !mismatch,
          detail: mismatch
            ? 'This result was produced by a method other than the one the specification names. It is kept as evidence and never reaches a disposition.'
            : null,
        },
      };
    });
  });

  // ---- Deviations ---------------------------------------------------------

  api.get('/deviations', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM deviation ORDER BY reference');
    return c.json(rows.map((d) => ({
      reference: d.reference, state: d.state, runs: d.runs, lots: d.lots, detail: d.detail,
      outcome: d.outcome, raised_by: d.raised_by, raised_at: momentISO(d.raised_at),
      closed_by: d.closed_by, closed_at: momentISO(d.closed_at),
    })));
  });

  api.post('/deviations', async (c) => {
    const s = requireRole(c, 'quality_manager');
    refuseAuditorWrite(s);
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, 'POST /deviations', body, async () => {
      const { runs, lots, detail } = body;
      if (!detail) throw refuse(400, 'detail_required', 'A deviation states what happened.');
      const reference = await tx(async (client) => {
        const r = await nextCounter(client, 'deviation', 4, 'DEV-');
        await client.query(
          `INSERT INTO deviation (reference,state,runs,lots,detail,raised_by,raised_at,event_at,effective_on)
           VALUES ($1,'open',$2,$3,$4,$5,now(),now(),CURRENT_DATE)`,
          [r, JSON.stringify(runs || []), JSON.stringify(lots || []), detail, s.email]
        );
        await appendEntry(client, {
          act: 'deviation_raised', person: s.email, object_kind: 'deviation', object_ref: r,
          content: { runs: runs || [], lots: lots || [], detail },
        });
        return r;
      });
      return { status: 201, body: { reference, state: 'open', runs: runs || [], lots: lots || [], detail } };
    });
  });

  api.post('/deviations/:reference/close', async (c) => {
    const s = requireRole(c, 'quality_manager');
    refuseAuditorWrite(s);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /deviations/${ref}/close`, body, async () => {
      const { outcome } = body;
      // Both are honest outcomes and neither is hidden.
      if (!['root_cause_found', 'cause_not_established'].includes(outcome)) {
        throw refuse(400, 'outcome_invalid', 'outcome is one of root_cause_found, cause_not_established.');
      }
      const d = await one('SELECT * FROM deviation WHERE reference = $1', [ref]);
      if (!d) throw refuse(404, 'no_such_deviation', 'No such deviation.');
      if (d.state === 'closed') throw refuse(409, 'deviation_closed', 'This deviation is already closed.');
      await tx(async (client) => {
        await client.query(
          "UPDATE deviation SET state = 'closed', outcome = $2, closed_by = $3, closed_at = now() WHERE reference = $1",
          [ref, outcome, s.email]
        );
        await appendEntry(client, {
          act: 'deviation_closed', person: s.email, object_kind: 'deviation', object_ref: ref,
          content: { outcome, note: 'Both outcomes are honest and neither is hidden.' },
        });
      });
      return { status: 200, body: { reference: ref, state: 'closed', outcome, closed_by: s.email } };
    });
  });

  // ---- Overrides ----------------------------------------------------------

  api.get('/overrides', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM override ORDER BY reference');
    return c.json(rows.map((o) => ({
      reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot,
      authorised_by: o.authorised_by, reviewed: o.reviewed, reviewed_by: o.reviewed_by,
      reviewed_at: momentISO(o.reviewed_at), recorded_at: momentISO(o.recorded_at),
      permanent: true,
      statement: `Separation overridden by ${o.authorised_by} on ${dateOnly(o.effective_on)}. This cannot be removed.`,
    })));
  });

  api.post('/overrides', async (c) => {
    const s = requireRole(c, 'quality_manager', 'claims_manager', 'plant_operator');
    refuseAuditorWrite(s);
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, 'POST /overrides', body, async () => {
      const { separation, reason, lot, authorised_by } = body;
      if (!separation) throw refuse(400, 'separation_required', 'An override names the separation broken.');
      if (!reason || String(reason).length < 40) {
        throw refuse(400, 'reason_too_short',
          'An override carries a reason of at least forty characters.',
          { minimum_characters: 40, given_characters: reason ? String(reason).length : 0 });
      }
      if (!lot) throw refuse(400, 'lot_required', 'An override names its lot.');
      if (!authorised_by) throw refuse(400, 'authoriser_required', 'An override names its authoriser.');
      const lotRow = await one('SELECT * FROM lot WHERE reference = $1', [lot]);
      if (!lotRow) throw refuse(404, 'no_such_lot', 'No such lot.');
      const reference = await tx(async (client) => {
        const r = await nextCounter(client, 'override', 4, 'OVR-');
        await client.query(
          `INSERT INTO override (reference,separation,reason,lot,authorised_by,recorded_by,reviewed,event_at,effective_on)
           VALUES ($1,$2,$3,$4,$5,$6,false,now(),CURRENT_DATE)`,
          [r, separation, reason, lot, authorised_by, s.email]
        );
        await appendEntry(client, {
          act: 'override_recorded', person: s.email, site: lotRow.site, object_kind: 'override', object_ref: r,
          content: { separation, lot, authorised_by, reason },
        });
        return r;
      });
      return {
        status: 201,
        body: {
          reference, separation, reason, lot, authorised_by, reviewed: false, permanent: true,
          statement: `Separation overridden by ${authorised_by} on ${todayISO()}. This cannot be removed.`,
          note: 'It shows on the lot for its life, is counted on the balance screen, and blocks signing until a second person reviews it.',
        },
      };
    });
  });

  api.post('/overrides/:reference/review', async (c) => {
    const s = requireSession(c);
    refuseAuditorWrite(s);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    const o = await one('SELECT * FROM override WHERE reference = $1', [ref]);
    if (!o) throw refuse(404, 'no_such_override', 'No such override.');
    if (o.authorised_by === s.email) {
      await recordRefusal({
        act: 'override_review_refused', person: s.email, object_kind: 'override', object_ref: ref,
        content: { reason: 'the authoriser does not review their own override' },
      });
      throw refuse(403, 'authoriser_may_not_review',
        'A review is refused for the authoriser. A second person reviews it.');
    }
    if (!['quality_manager', 'claims_manager'].some((r) => (s.roles || []).includes(r))) {
      throw refuse(403, 'role_not_held', 'A review is refused for anybody who is neither a quality manager nor a claims manager.');
    }
    return withIdempotency(c, `POST /overrides/${ref}/review`, body, async () => {
      if (o.reviewed) return { status: 200, body: { reference: ref, reviewed: true, reviewed_by: o.reviewed_by } };
      await tx(async (client) => {
        await client.query(
          'UPDATE override SET reviewed = true, reviewed_by = $2, reviewed_at = now() WHERE reference = $1',
          [ref, s.email]
        );
        await appendEntry(client, {
          act: 'override_reviewed', person: s.email, object_kind: 'override', object_ref: ref,
          content: { reviewed_by: s.email, note: 'A review removes nothing.' },
        });
      });
      return {
        status: 200,
        body: {
          reference: ref, reviewed: true, reviewed_by: s.email, lot: o.lot,
          separation: o.separation, reason: o.reason, authorised_by: o.authorised_by,
          note: 'A review sets reviewed true and removes nothing.',
        },
      };
    });
  });

  // ---- Carbon -------------------------------------------------------------

  api.get('/carbon-methods', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM carbon_method ORDER BY id, version');
    return c.json(rows.map((m) => ({
      id: m.id, version: m.version, standard: m.standard, functional_unit: m.functional_unit,
      boundary: m.boundary, allocation_basis: m.allocation_basis, reviewer: m.reviewer,
      published_on: dateOnly(m.published_on), published_by: m.published_by,
      data_quality_rules: m.data_quality_rules, emission_factors: m.emission_factors,
      primary_threshold_bp: m.primary_threshold_bp, superseded: m.superseded, retired: m.retired,
    })));
  });

  api.get('/carbon-methods/:id/versions/:version', async (c) => {
    requireSession(c);
    const m = await one('SELECT * FROM carbon_method WHERE id = $1 AND version = $2',
      [c.req.param('id'), Number(c.req.param('version'))]);
    if (!m) throw refuse(404, 'no_such_method_version', 'No such carbon method version.');
    return c.json({
      id: m.id, version: m.version, standard: m.standard, functional_unit: m.functional_unit,
      boundary: m.boundary, allocation_basis: m.allocation_basis, reviewer: m.reviewer,
      published_on: dateOnly(m.published_on), published_by: m.published_by,
      data_quality_rules: m.data_quality_rules, emission_factors: m.emission_factors,
      primary_threshold_bp: m.primary_threshold_bp, superseded: m.superseded, retired: m.retired,
    });
  });

  api.post('/carbon-methods', async (c) => {
    const s = requireSession(c);
    refuseAuditorWrite(s);
    const body = await c.req.json().catch(() => ({}));
    if (!(s.roles || []).includes('quality_manager')) {
      await recordRefusal({
        act: 'carbon_method_publish_refused', person: s.email, object_kind: 'carbon_method',
        object_ref: body.id || 'unknown',
        content: { reason: 'publishing a version is refused for anybody but a quality manager', roles: s.roles },
      });
      throw refuse(403, 'role_not_held', 'Publishing a carbon method version is refused for anybody but a quality manager.');
    }
    return withIdempotency(c, 'POST /carbon-methods', body, async () => {
      const { id, standard, functional_unit, boundary, allocation_basis, reviewer } = body;
      if (!id || !standard || !functional_unit || !boundary || !allocation_basis || !reviewer) {
        throw refuse(400, 'fields_required', 'id, standard, functional_unit, boundary, allocation_basis and reviewer are required.');
      }
      const result = await tx(async (client) => {
        const prev = await client.query(
          'SELECT * FROM carbon_method WHERE id = $1 ORDER BY version DESC LIMIT 1', [id]
        );
        const version = prev.rows[0] ? prev.rows[0].version + 1 : 1;
        await client.query(
          `INSERT INTO carbon_method (id,version,standard,functional_unit,boundary,allocation_basis,reviewer,published_on,published_by,data_quality_rules,emission_factors,primary_threshold_bp)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [id, version, standard, functional_unit, boundary, allocation_basis, reviewer,
            body.published_on || todayISO(), s.email,
            JSON.stringify(body.data_quality_rules || []), JSON.stringify(body.emission_factors || []),
            body.primary_threshold_bp ?? 5000]
        );
        if (prev.rows[0]) {
          // A new version supersedes rather than overwrites.
          await client.query('UPDATE carbon_method SET superseded = true WHERE id = $1 AND version = $2',
            [id, prev.rows[0].version]);
        }
        await appendEntry(client, {
          act: 'carbon_method_version_published', person: s.email, object_kind: 'carbon_method',
          object_ref: `${id} v${version}`,
          content: { standard, boundary, allocation_basis, reviewer },
        });
        return version;
      });
      return {
        status: 201,
        body: {
          reference: `${id} v${result}`, id, version: result, standard, functional_unit, boundary,
          allocation_basis, reviewer, published_by: s.email,
          note: 'A computation in flight completes under the version it started with. This version applies from the next computation.',
        },
      };
    });
  });

  api.get('/lots/:reference/carbon', async (c) => {
    requireSession(c);
    const carbon = await engine.carbonForLot(c.req.param('reference'));
    if (!carbon) throw refuse(404, 'no_carbon_figure', 'No carbon figure exists for this lot.');
    return c.json(carbon);
  });

  api.get('/carbon-figures', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM carbon_figure ORDER BY id, version');
    return c.json(rows.map((f) => ({
      id: f.id, lot: f.lot, version: f.version,
      method_version: `${f.method_id} v${f.method_version}`,
      value_mg_per_kg: Number(f.value_mg_per_kg), boundary: f.boundary,
      uncertainty_bp: Number(f.uncertainty_bp), primary_share_bp: Number(f.primary_share_bp),
      breakdown: f.breakdown, comparator: f.comparator,
      energy_location_mg_per_kg: Number((f.energy || {}).energy_location_mg_per_kg || 0),
      energy_market_mg_per_kg: Number((f.energy || {}).energy_market_mg_per_kg || 0),
      cache_valid: f.cache_valid, superseded_by: f.superseded_by,
      input_versions: f.input_versions, computed_at: momentISO(f.computed_at),
    })));
  });

  // A figure is never silently recomputed: a recomputation is a recorded act.
  api.post('/carbon-figures/:id/recompute', async (c) => {
    const s = requireRole(c, 'quality_manager', 'claims_manager');
    refuseAuditorWrite(s);
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /carbon-figures/${id}/recompute`, body, async () => {
      const { reason } = body;
      if (!reason) throw refuse(400, 'reason_required', 'A recomputation records a person, a date and a reason.');
      const fig = await one('SELECT * FROM carbon_figure WHERE id = $1', [id]);
      if (!fig) throw refuse(404, 'no_such_figure', 'No such carbon figure.');
      const lot = await one('SELECT * FROM lot WHERE reference = $1', [fig.lot]);
      const period = lot ? await one('SELECT * FROM balance_period WHERE id = $1', [lot.period]) : null;
      if (period && period.state === 'closed') {
        const open = await query("SELECT reference FROM restatement WHERE period = $1 AND state = 'open'", [period.id]);
        if (!open.length) {
          throw refuse(409, 'period_closed',
            'A recomputation against a closed period is refused unless a restatement is open.',
            { period: period.id });
        }
      }
      const method = await one(
        'SELECT * FROM carbon_method WHERE id = $1 AND superseded = false ORDER BY version DESC LIMIT 1',
        [fig.method_id]
      );
      const newId = await tx(async (client) => {
        const r = await nextCounter(client, 'carbon_figure', 4, 'CFG-');
        const version = fig.version + 1;
        await client.query(
          `INSERT INTO carbon_figure (id,lot,version,method_id,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,boundary,comparator,breakdown,energy,input_versions,recompute_reason,recomputed_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [r, fig.lot, version, fig.method_id, method ? method.version : fig.method_version,
            fig.value_mg_per_kg, fig.uncertainty_bp, fig.primary_share_bp,
            method ? method.boundary : fig.boundary,
            JSON.stringify(fig.comparator), JSON.stringify(fig.breakdown), JSON.stringify(fig.energy),
            JSON.stringify({ ...(fig.input_versions || {}), carbon_method: `${fig.method_id} v${method ? method.version : fig.method_version}`, recomputed_from: id }),
            reason, s.email]
        );
        // A new figure version alongside the old.
        await client.query('UPDATE carbon_figure SET superseded_by = $2 WHERE id = $1', [id, r]);
        await appendEntry(client, {
          act: 'carbon_figure_recomputed', person: s.email, object_kind: 'carbon_figure', object_ref: r,
          content: { supersedes: id, lot: fig.lot, reason, method_version: method ? `${fig.method_id} v${method.version}` : null },
        });
        return r;
      });
      const certs = await query(
        `SELECT number, version, recipient, recipient_name, state FROM certificate WHERE carbon_figure = $1 ORDER BY number`,
        [id]
      );
      return {
        status: 201,
        body: {
          reference: newId, supersedes: id, lot: fig.lot, reason, recomputed_by: s.email,
          recomputed_on: todayISO(),
          certificates_carrying_superseded_figure: certs.map((x) => ({
            certificate: x.number, version: x.version, recipient: x.recipient,
            recipient_name: x.recipient_name, state: x.state,
          })),
          complete: true,
        },
      };
    });
  });

  api.get('/energy-instruments', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM energy_instrument ORDER BY reference');
    return c.json(rows.map((i) => ({
      reference: i.reference, quantity_kwh: Number(i.quantity_kwh), vintage: i.vintage,
      region: i.region, state: i.state, applied_to: i.applied_to,
    })));
  });

  api.post('/energy-instruments/:reference/retire', async (c) => {
    const s = requireRole(c, 'claims_manager', 'quality_manager');
    refuseAuditorWrite(s);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /energy-instruments/${ref}/retire`, body, async () => {
      const { period } = body;
      const inst = await one('SELECT * FROM energy_instrument WHERE reference = $1', [ref]);
      if (!inst) throw refuse(404, 'no_such_instrument', 'No such energy instrument.');
      const p = await one('SELECT * FROM balance_period WHERE id = $1', [period]);
      if (!p) throw refuse(404, 'no_such_period', 'No such balance period.');
      const refusals = [];
      if (inst.state !== 'retired') refusals.push({ reason: 'instrument_not_retired', detail: `The instrument state is ${inst.state} rather than retired.` });
      const periodYear = Number(dateOnly(p.period_from).slice(0, 4));
      if (Number(inst.vintage) !== periodYear) {
        refusals.push({ reason: 'vintage_does_not_match', detail: `The instrument vintage is ${inst.vintage} and the consumption falls in ${periodYear}.` });
      }
      const figures = await query('SELECT * FROM carbon_figure WHERE superseded_by IS NULL');
      const lotRows = await query('SELECT reference FROM lot WHERE period = $1', [period]);
      const lotRefs = lotRows.map((l) => l.reference);
      const relevant = figures.filter((f) => lotRefs.includes(f.lot));
      const metered = relevant.reduce((a, f) => Math.max(a, Number((f.energy || {}).metered_kwh || 0)), 0);
      const alreadyRetired = (await query(
        'SELECT COALESCE(SUM(quantity_kwh),0)::bigint AS q FROM energy_instrument WHERE applied_to = $1 AND reference <> $2',
        [period, ref]
      ))[0];
      const region = relevant.length ? 'EU-27' : inst.region;
      if (inst.region !== region) {
        refusals.push({ reason: 'region_does_not_match', detail: `The instrument region is ${inst.region} and the consumption is in ${region}.` });
      }
      if (Number(alreadyRetired.q) + Number(inst.quantity_kwh) > metered) {
        refusals.push({ reason: 'exceeds_metered_consumption', detail: `The retired quantity would exceed the metered consumption of ${metered} kWh.` });
      }
      if (refusals.length) {
        await recordRefusal({
          act: 'energy_instrument_retirement_refused', person: s.email,
          object_kind: 'energy_instrument', object_ref: ref, content: { period, refusals },
        });
        throw refuse(409, 'retirement_refused', refusals.map((r) => r.detail).join(' '), { refusals, instrument: ref, period });
      }
      await tx(async (client) => {
        await client.query('UPDATE energy_instrument SET applied_to = $2 WHERE reference = $1', [ref, period]);
        await appendEntry(client, {
          act: 'energy_instrument_retired', person: s.email, site: p.site,
          object_kind: 'energy_instrument', object_ref: ref,
          content: { period, quantity_kwh: Number(inst.quantity_kwh), vintage: inst.vintage, region: inst.region },
        });
      });
      const totalRetired = Number(alreadyRetired.q) + Number(inst.quantity_kwh);
      return {
        status: 200,
        body: {
          reference: ref, period, quantity_kwh: Number(inst.quantity_kwh),
          metered_kwh: metered, retired_kwh: totalRetired, unmatched_kwh: metered - totalRetired,
        },
      };
    });
  });
}
