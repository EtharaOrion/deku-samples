import { query, one, tx, nextCounter } from '../db.js';
import {
  refuse, requireSession, requireRole, refuseAuditorWrite, withIdempotency,
  refusePagination, todayISO, dateOnly, momentISO,
} from '../lib/http.js';
import { appendEntry } from '../lib/record.js';
import { sendMail } from '../lib/mail.js';
import { requireInteger, floorDiv, shareBp } from '../lib/num.js';
import * as engine from '../engine.js';

const ENQUIRY_DESTINATIONS = {
  waste_supply: { destination: 'feedstock@example.com', response_days: 3 },
  polymer_purchase: { destination: 'sales@example.com', response_days: 2 },
  partnership: { destination: 'partners@example.com', response_days: 5 },
  press: { destination: 'press@example.com', response_days: 1 },
};

export default function register(api) {
  // ---- Published figures --------------------------------------------------

  api.get('/statistics', async (c) => {
    refusePagination(c);
    const rows = await query('SELECT * FROM statistic ORDER BY key');
    // A figure that cannot carry all three is not published.
    return c.json(rows
      .filter((s) => s.source && s.year && s.geography)
      .map((s) => ({ key: s.key, value: s.value, source: s.source, year: s.year, geography: s.geography })));
  });

  api.get('/positions', async (c) => {
    refusePagination(c);
    const rows = await query('SELECT * FROM position ORDER BY closes_on');
    return c.json(rows.map((p) => ({
      reference: p.reference, title: p.title, location: p.location, department: p.department,
      contract_type: p.contract_type, closes_on: dateOnly(p.closes_on),
    })));
  });

  api.get('/news', async (c) => {
    refusePagination(c);
    const rows = await query('SELECT * FROM news_item ORDER BY dated DESC');
    return c.json(rows.map((n) => ({
      reference: n.reference, title: n.title, tag: n.tag, outlet: n.outlet,
      date: dateOnly(n.dated), link: n.link, language: n.language,
    })));
  });

  api.get('/claim-register', async (c) => {
    refusePagination(c);
    const rows = await query('SELECT * FROM claim_substantiation ORDER BY reference');
    const today = todayISO();
    return c.json(rows.map((r) => ({
      reference: r.reference, claim: r.claim, route: r.route,
      first_published: dateOnly(r.first_published), evidence: r.evidence,
      evidence_expires: dateOnly(r.evidence_expires),
      method_version: r.method_version, approver: r.approver,
      review_date: dateOnly(r.review_date), state: r.state,
      // A claim whose evidence expires is reported before its review date.
      evidence_expiring_before_review: !!r.evidence_expires
        && dateOnly(r.evidence_expires) < dateOnly(r.review_date),
      evidence_expired: !!r.evidence_expires && dateOnly(r.evidence_expires) < today,
    })));
  });

  api.get('/process-diagram', async (c) => {
    // Generated from the four run types so it stays correct when a stage changes.
    const rows = await query(
      `SELECT r.run_type,
              COALESCE(SUM(DISTINCT 0),0) AS zero
         FROM run r GROUP BY r.run_type`
    );
    const order = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];
    const stages = [];
    for (const t of order) {
      const runs = await query('SELECT reference FROM run WHERE run_type = $1', [t]);
      const refs = runs.map((r) => r.reference);
      let massIn = 0;
      let massOut = 0;
      if (refs.length) {
        const ins = await query('SELECT COALESCE(SUM(mass_g),0)::bigint AS m FROM consumption WHERE run = ANY($1::text[])', [refs]);
        const outs = await query('SELECT COALESCE(SUM(mass_g),0)::bigint AS m FROM output WHERE run = ANY($1::text[])', [refs]);
        massIn = Number(ins[0].m);
        massOut = Number(outs[0].m);
      }
      stages.push({
        stage: t, runs: refs.length, mass_in_g: massIn, mass_out_g: massOut,
        losses_g: massIn - massOut,
      });
    }
    return c.json({
      stages,
      note: 'Losses reduce the claim.',
      text_equivalent: stages.map((s) =>
        `${s.stage}: ${s.mass_in_g} g in, ${s.mass_out_g} g out, ${s.losses_g} g lost across ${s.runs} runs.`),
    });
  });

  // ---- Enquiries ----------------------------------------------------------

  api.post('/enquiries', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, 'POST /enquiries', body, async () => {
      const { type, email, name, organisation, message } = body;
      const dest = ENQUIRY_DESTINATIONS[type];
      if (!dest) {
        throw refuse(400, 'type_invalid',
          'type is one of waste_supply, polymer_purchase, partnership, press.');
      }
      if (!email) throw refuse(400, 'email_required', 'An enquiry carries an address to answer.');
      const deadline = type === 'press' ? engine.addDays(todayISO(), dest.response_days) : null;
      const reference = await tx(async (client) => {
        const r = await nextCounter(client, 'enquiry', 4, 'ENQ-');
        await client.query(
          `INSERT INTO enquiry (reference,type,name,email,organisation,message,destination,response_days,deadline)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [r, type, name || null, email, organisation || null, message || null,
            dest.destination, dest.response_days, deadline]
        );
        // A waste-supply enquiry opens a collector record.
        if (type === 'waste_supply') {
          const cref = await nextCounter(client, 'collector_enquiry', 4, 'COL-ENQ-');
          await client.query(
            `INSERT INTO collector (reference,name,country,registration,registration_expiry,scheme_status,site_types,declared_streams)
             VALUES ($1,$2,'unknown','pending',CURRENT_DATE + INTERVAL '365 days','enquiry','[]','[]')
             ON CONFLICT (reference) DO NOTHING`,
            [cref, organisation || name || email]
          );
          await client.query('INSERT INTO party (reference,kind) VALUES ($1,$2) ON CONFLICT DO NOTHING', [cref, 'collector']);
          await client.query(
            'INSERT INTO party_version (reference,name,effective_from) VALUES ($1,$2,CURRENT_DATE)',
            [cref, organisation || name || email]
          );
        }
        // A polymer enquiry opens a conformance record.
        if (type === 'polymer_purchase') {
          const nref = await nextCounter(client, 'conformance', 4, 'CNF-');
          await client.query(
            `INSERT INTO conformance (reference,customer,application,specification_grade,specification_version,trials,outcome)
             SELECT $1, reference, 'enquiry', 'SPEC-N6', 3, '[]'::jsonb, 'not_started'
               FROM customer LIMIT 1`,
            [nref]
          );
        }
        await appendEntry(client, {
          act: 'enquiry_received', object_kind: 'enquiry', object_ref: r,
          content: { type, destination: dest.destination, response_days: dest.response_days, deadline },
        });
        return r;
      });
      await sendMail({
        to: email,
        subject: `Enquiry ${reference} received`,
        text: [
          `Your enquiry ${reference} has been received.`,
          '',
          `It has been directed to ${dest.destination}.`,
          `We answer an enquiry of this type within ${dest.response_days} working days.`,
          deadline ? `Press deadline recorded: ${deadline}.` : '',
          '',
          'Your data is received by Ravel Materials SAS, is used only to answer this enquiry,',
          `is kept for ${type === 'press' ? 12 : type === 'waste_supply' || type === 'polymer_purchase' ? 36 : 24} months,`,
          'and is removed on request to privacy@example.com.',
        ].filter(Boolean).join('\n'),
        kind: 'enquiry_received', about: reference,
      }).catch((e) => console.error('mail failed', e));
      return {
        status: 201,
        body: {
          reference, type, destination: dest.destination, response_days: dest.response_days,
          deadline,
        },
      };
    });
  });

  api.get('/enquiries', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM enquiry ORDER BY reference');
    return c.json(rows.map((e) => ({
      reference: e.reference, type: e.type, name: e.name, email: e.email,
      organisation: e.organisation, destination: e.destination,
      response_days: e.response_days, deadline: dateOnly(e.deadline),
      recorded_at: momentISO(e.recorded_at),
    })));
  });

  // ---- Inbound sources ----------------------------------------------------

  const SOURCES = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];

  api.post('/inbound/:source', async (c) => {
    const source = c.req.param('source');
    if (!SOURCES.includes(source)) {
      throw refuse(400, 'source_invalid', `source is one of ${SOURCES.join(', ')}.`);
    }
    const raw = await c.req.text();
    let body;
    try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
    return withIdempotency(c, `POST /inbound/${source}`, body, async () => {
      const { received_at, payload } = body;
      if (payload === undefined) throw refuse(400, 'payload_required', 'An inbound record carries a payload.');
      // The bytes exactly as they arrived rather than the shape the app parsed them into.
      const verbatim = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const reference = await tx(async (client) => {
        const r = await nextCounter(client, 'inbound_record', 4, 'INB-');
        await client.query(
          `INSERT INTO inbound_record (reference,source,received_at,payload_verbatim,payload)
           VALUES ($1,$2,$3,$4,$5)`,
          [r, source, received_at || new Date().toISOString(), verbatim,
            (() => { try { return JSON.stringify(JSON.parse(verbatim)); } catch { return null; } })()]
        );
        await appendEntry(client, {
          act: 'inbound_record_received', object_kind: 'inbound_record', object_ref: r,
          event_at: received_at || new Date().toISOString(),
          content: { source, payload_verbatim: verbatim },
        });
        return r;
      });
      return {
        status: 201,
        body: { reference, source, received_at: received_at || new Date().toISOString(), payload_verbatim: verbatim },
      };
    });
  });

  api.get('/inbound', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM inbound_record ORDER BY received_at, reference');
    return c.json(rows.map((r) => ({
      reference: r.reference, source: r.source, received_at: momentISO(r.received_at),
      payload_verbatim: r.payload_verbatim,
    })));
  });

  // ---- Reconciliation: six figures rather than six verdicts ----------------

  api.get('/reconciliation', async (c) => {
    requireSession(c);
    const readAt = new Date().toISOString();
    const runs = await query('SELECT * FROM run');
    let residual = 0;
    for (const r of runs) {
      const resolved = await engine.resolveRun(r);
      if (r.state === 'closed') residual += resolved.mass_in_g - resolved.mass_out_g - Number(r.losses_g || 0);
    }
    const periods = await query('SELECT * FROM balance_period');
    let margin = 0;
    for (const p of periods) {
      const { figures } = await engine.balanceFigures(p.id);
      margin += figures.post_consumer.credits_available_g + figures.pre_consumer.credits_available_g;
    }
    const openRunConsumptions = (await query(
      "SELECT COUNT(*)::int AS n FROM consumption c JOIN run r ON r.reference = c.run WHERE r.state = 'open'"
    ))[0].n;
    const batches = await engine.allBatches();
    const brokenCustody = batches.filter((b) => !b.custody_complete);
    const superseded = await query(
      `SELECT c.number FROM certificate c JOIN carbon_figure f ON f.id = c.carbon_figure
        WHERE f.superseded_by IS NOT NULL`
    );
    const SOURCES = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];
    const ages = [];
    for (const source of SOURCES) {
      const last = await one(
        'SELECT received_at FROM inbound_record WHERE source = $1 ORDER BY received_at DESC LIMIT 1', [source]
      );
      ages.push({
        source,
        // A source that has never sent reports null rather than zero.
        age_hours: last ? Math.floor((Date.now() - new Date(last.received_at).getTime()) / 3600000) : null,
        last_received_at: last ? momentISO(last.received_at) : null,
      });
    }
    return c.json({
      mass_balance_residual_g: residual,
      credit_margin_g: margin,
      consumptions_on_open_runs: openRunConsumptions,
      batches_with_broken_custody: brokenCustody.map((b) => ({
        batch: b.reference, missing_custody_kind: b.missing_custody_kind || b.missing_custody_kinds[0],
      })),
      batches_with_broken_custody_count: brokenCustody.length,
      certificates_with_superseded_figures: superseded.map((x) => x.number),
      certificates_with_superseded_figures_count: superseded.length,
      integration_ages: ages,
      read_at: readAt,
      note: 'Six figures rather than six verdicts. None is a badge and none is styled as passing.',
    });
  });

  // ---- Specifications, customers, change control --------------------------

  api.get('/specifications', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM specification ORDER BY grade, version');
    return c.json(rows.map((s) => ({
      grade: s.grade, version: s.version, issued_on: dateOnly(s.issued_on),
      rows: s.rows, virgin_reference: s.virgin_reference, superseded: s.superseded,
    })));
  });

  api.get('/specifications/:grade/versions/:version', async (c) => {
    const s = await one('SELECT * FROM specification WHERE grade = $1 AND version = $2',
      [c.req.param('grade'), Number(c.req.param('version'))]);
    if (!s) throw refuse(404, 'no_such_specification_version', 'No such specification version.');
    return c.json({
      grade: s.grade, version: s.version, issued_on: dateOnly(s.issued_on),
      rows: s.rows,
      virgin_reference: s.virgin_reference,
      superseded: s.superseded,
      note: 'A guaranteed limit is tested on every lot.',
    });
  });

  api.post('/specifications/:grade/versions/:version/issue', async (c) => {
    const s = requireRole(c, 'quality_manager', 'claims_manager');
    refuseAuditorWrite(s);
    const grade = c.req.param('grade');
    const version = Number(c.req.param('version'));
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /specifications/${grade}/versions/${version}/issue`, body, async () => {
      const { customer } = body;
      if (!customer) throw refuse(400, 'customer_required', 'A specification is issued to a named customer.');
      const spec = await one('SELECT * FROM specification WHERE grade = $1 AND version = $2', [grade, version]);
      if (!spec) throw refuse(404, 'no_such_specification_version', 'No such specification version.');
      const cus = await one('SELECT * FROM customer WHERE reference = $1', [customer]);
      if (!cus) throw refuse(404, 'no_such_customer', 'No such customer.');
      const reference = await tx(async (client) => {
        const r = await nextCounter(client, 'specification_issue', 4, 'SPI-');
        await client.query(
          'INSERT INTO specification_issue (reference,grade,version,customer,issued_by) VALUES ($1,$2,$3,$4,$5)',
          [r, grade, version, customer, s.email]
        );
        await client.query(
          'UPDATE customer SET holds_grade = $2, holds_version = $3 WHERE reference = $1',
          [customer, grade, version]
        );
        await appendEntry(client, {
          act: 'specification_issued', person: s.email, object_kind: 'specification',
          object_ref: `${grade} v${version}`, content: { customer, version },
        });
        return r;
      });
      return { status: 201, body: { reference, grade, version, customer, issued_by: s.email } };
    });
  });

  api.get('/customers', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM customer ORDER BY reference');
    return c.json(rows.map((x) => ({
      reference: x.reference, name: x.name, contact: x.contact,
      holds_specification_version: x.holds_grade ? `${x.holds_grade} v${x.holds_version}` : null,
      application: x.application, industry: x.industry, language: x.language,
    })));
  });

  api.get('/customers/:reference', async (c) => {
    requireSession(c);
    const x = await one('SELECT * FROM customer WHERE reference = $1', [c.req.param('reference')]);
    if (!x) throw refuse(404, 'no_such_customer', 'No such customer.');
    const conf = await query('SELECT * FROM conformance WHERE customer = $1 ORDER BY reference', [x.reference]);
    return c.json({
      reference: x.reference, name: x.name, contact: x.contact,
      holds_specification_version: x.holds_grade ? `${x.holds_grade} v${x.holds_version}` : null,
      application: x.application, industry: x.industry, language: x.language,
      conformance: conf.map((k) => ({
        reference: k.reference, application: k.application,
        specification_version: `${k.specification_grade} v${k.specification_version}`,
        trials: k.trials, outcome: k.outcome, dated: dateOnly(k.dated),
      })),
    });
  });

  api.get('/change-notices', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM change_notice ORDER BY reference');
    const out = [];
    for (const n of rows) {
      const acks = await query('SELECT * FROM change_notice_ack WHERE change_notice = $1', [n.reference]);
      out.push({
        reference: n.reference, title: n.title, detail: n.detail, parameter: n.parameter,
        qualification_relevant: n.qualification_relevant,
        specifications_affected: n.specifications_affected,
        customers_affected: n.customers_affected,
        qualifications_affected: n.qualifications_affected,
        notice_period_days: n.notice_period_days, state: n.state,
        raised_by: n.raised_by, raised_at: momentISO(n.raised_at),
        acknowledgements: acks.map((a) => ({ customer: a.customer, kind: a.kind, recorded_at: momentISO(a.recorded_at) })),
      });
    }
    return c.json(out);
  });

  api.post('/change-notices', async (c) => {
    const s = requireRole(c, 'quality_manager', 'claims_manager', 'plant_operator');
    refuseAuditorWrite(s);
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, 'POST /change-notices', body, async () => {
      const { title, detail, parameter, grade } = body;
      if (!title || !detail) throw refuse(400, 'fields_required', 'title and detail are required.');
      // Derived, rather than asserted.
      const specs = await query(
        'SELECT grade, version FROM specification WHERE superseded = false ORDER BY grade, version'
      );
      const specsAffected = specs
        .filter((x) => !grade || x.grade === grade)
        .map((x) => `${x.grade} v${x.version}`);
      const customers = await query('SELECT * FROM customer ORDER BY reference');
      const customersAffected = customers.map((x) => ({
        reference: x.reference, name: x.name, industry: x.industry,
        holds: x.holds_grade ? `${x.holds_grade} v${x.holds_version}` : null,
      }));
      const conformances = await query("SELECT * FROM conformance WHERE outcome = 'qualified' ORDER BY reference");
      const qualificationRelevant = ['temperature', 'pressure', 'relative_viscosity', 'moisture', 'recipe']
        .some((p) => String(parameter || '').includes(p));
      const qualificationsAffected = qualificationRelevant
        ? conformances.map((k) => ({ reference: k.reference, customer: k.customer, application: k.application }))
        : [];
      // A change touching a qualification-relevant parameter for an automotive
      // customer blocks rather than warns.
      const blocking = qualificationRelevant
        && customersAffected.some((x) => x.industry === 'automotive');
      const noticeDays = blocking ? 90 : 30;
      const reference = await tx(async (client) => {
        const r = await nextCounter(client, 'change_notice', 4, 'CHN-');
        await client.query(
          `INSERT INTO change_notice (reference,title,detail,parameter,qualification_relevant,specifications_affected,customers_affected,qualifications_affected,notice_period_days,state,raised_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'raised',$10)`,
          [r, title, detail, parameter || null, qualificationRelevant,
            JSON.stringify(specsAffected), JSON.stringify(customersAffected),
            JSON.stringify(qualificationsAffected), noticeDays, s.email]
        );
        await appendEntry(client, {
          act: 'change_notice_raised', person: s.email, object_kind: 'change_notice', object_ref: r,
          content: { title, parameter: parameter || null, specifications_affected: specsAffected, notice_period_days: noticeDays },
        });
        return r;
      });
      return {
        status: 201,
        body: {
          reference, title, detail, parameter: parameter || null,
          qualification_relevant: qualificationRelevant,
          specifications_affected: specsAffected,
          customers_affected: customersAffected,
          qualifications_affected: qualificationsAffected,
          notice_period_days: noticeDays,
          blocking,
          blocking_reason: blocking
            ? `This change may invalidate ${qualificationsAffected.length} customer qualifications.`
            : null,
          state: 'raised',
        },
      };
    });
  });

  api.post('/change-notices/:reference/notify', async (c) => {
    const s = requireRole(c, 'quality_manager', 'claims_manager');
    refuseAuditorWrite(s);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /change-notices/${ref}/notify`, body, async () => {
      const { customer, waived } = body;
      if (!customer) throw refuse(400, 'customer_required', 'A notice notifies one named customer.');
      const n = await one('SELECT * FROM change_notice WHERE reference = $1', [ref]);
      if (!n) throw refuse(404, 'no_such_change_notice', 'No such change notice.');
      const cus = await one('SELECT * FROM customer WHERE reference = $1', [customer]);
      if (!cus) throw refuse(404, 'no_such_customer', 'No such customer.');
      await tx(async (client) => {
        await client.query(
          'INSERT INTO change_notice_ack (change_notice,customer,kind,recorded_by) VALUES ($1,$2,$3,$4)',
          [ref, customer, waived ? 'waived' : 'notified', s.email]
        );
        await appendEntry(client, {
          act: waived ? 'change_notice_waived' : 'change_notice_notified', person: s.email,
          object_kind: 'change_notice', object_ref: ref,
          content: { customer, kind: waived ? 'waived' : 'notified' },
        });
      });
      if (!waived) {
        await sendMail({
          to: cus.contact,
          subject: `Change notice ${ref} requires acknowledgement`,
          text: [
            `Change notice ${ref}: ${n.title}`,
            '',
            n.detail,
            '',
            `Specifications affected: ${(n.specifications_affected || []).join(', ') || 'none'}`,
            `Notice period: ${n.notice_period_days} days`,
            n.qualification_relevant
              ? `This change may invalidate ${(n.qualifications_affected || []).length} customer qualifications.`
              : '',
          ].filter(Boolean).join('\n'),
          kind: 'change_notice_notified', about: ref, recipientName: cus.name,
        }).catch((e) => console.error('mail failed', e));
      }
      return { status: 201, body: { reference: ref, customer, kind: waived ? 'waived' : 'notified', notified: !waived } };
    });
  });

  api.post('/change-notices/:reference/release', async (c) => {
    const s = requireRole(c, 'quality_manager', 'claims_manager');
    refuseAuditorWrite(s);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /change-notices/${ref}/release`, body, async () => {
      const n = await one('SELECT * FROM change_notice WHERE reference = $1', [ref]);
      if (!n) throw refuse(404, 'no_such_change_notice', 'No such change notice.');
      const acks = await query('SELECT * FROM change_notice_ack WHERE change_notice = $1', [ref]);
      const owed = (n.customers_affected || []).filter(
        (x) => !acks.some((a) => a.customer === x.reference)
      );
      if (owed.length) {
        throw refuse(409, 'notice_outstanding',
          'A release is refused until every customer owed notice has been notified or has waived it in a recorded act.',
          { customers_owed_notice: owed, qualifications_affected: n.qualifications_affected });
      }
      await tx(async (client) => {
        await client.query(
          "UPDATE change_notice SET state = 'released', released_at = now() WHERE reference = $1", [ref]
        );
        await appendEntry(client, {
          act: 'change_notice_released', person: s.email, object_kind: 'change_notice', object_ref: ref,
          content: { customers_notified: acks.map((a) => a.customer) },
        });
      });
      return { status: 200, body: { reference: ref, state: 'released', customers_notified: acks.map((a) => a.customer) } };
    });
  });

  // ---- Contracts ----------------------------------------------------------

  async function contractProjection(row) {
    const site = await one('SELECT * FROM site WHERE reference = $1', [row.site]);
    const allocations = await query('SELECT * FROM allocation WHERE contract = $1 ORDER BY reference', [row.id]);
    const deliveredKg = allocations.reduce((a, x) => a + Math.floor(Number(x.mass_g) / 1000), Number(row.delivered_kg));
    // A running weighted content, floored.
    let weighted = 0;
    let mass = 0;
    for (const a of allocations) {
      weighted += Number(a.mass_g) * Number(a.content_bp);
      mass += Number(a.mass_g);
    }
    const runningContentBp = mass ? floorDiv(weighted, mass) : 0;
    const committedG = Number(row.committed_kg) * 1000;
    const remainingG = committedG - mass;
    // The required remaining average, floored.
    const requiredRemainingBp = remainingG > 0
      ? floorDiv(Number(row.floor_bp) * committedG - weighted, remainingG)
      : 0;
    const unreachable = requiredRemainingBp > 10000;
    return {
      contract: row.id,
      recipient: row.recipient,
      site: row.site,
      period: row.period,
      delivered_kg: deliveredKg,
      committed_kg: Number(row.committed_kg),
      running_content_bp: runningContentBp,
      floor_bp: Number(row.floor_bp),
      required_remaining_bp: requiredRemainingBp,
      state: unreachable ? 'unreachable' : 'on_track',
      unreachable_on: unreachable ? (dateOnly(row.unreachable_on) || todayISO()) : null,
      unreachable_allocation: unreachable ? (row.unreachable_allocation || (allocations.length ? allocations[allocations.length - 1].reference : null)) : null,
      shortfall_consequence: row.shortfall_consequence,
      planned_site_flag: site ? site.confidence === 'planned' : false,
      flag_dismissible: false,
      site_confidence: site ? site.confidence : null,
      allocations: allocations.map((a) => ({
        reference: a.reference, lot: a.lot, mass_g: Number(a.mass_g), content_bp: Number(a.content_bp),
        decided_by: a.decided_by, favoured_over: a.favoured_over,
      })),
      derivation: {
        running_content_bp: 'sum(mass * content) / sum(mass), floored',
        required_remaining_bp: '(floor_bp * committed_g - weighted_so_far) / remaining_g, floored',
        note: 'An unreachable floor is reported and never refused.',
      },
    };
  }

  api.get('/contracts', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM contract ORDER BY id');
    return c.json(await Promise.all(rows.map(contractProjection)));
  });

  api.get('/contracts/:id/projection', async (c) => {
    requireSession(c);
    const row = await one('SELECT * FROM contract WHERE id = $1', [c.req.param('id')]);
    if (!row) throw refuse(404, 'no_such_contract', 'No such contract.');
    return c.json(await contractProjection(row));
  });

  api.post('/contracts/:id/allocations', async (c) => {
    const s = requireRole(c, 'claims_manager');
    refuseAuditorWrite(s);
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /contracts/${id}/allocations`, body, async () => {
      const { lot, favoured_over } = body;
      if (!lot) throw refuse(400, 'lot_required', 'An allocation attaches a lot to a contract.');
      const contract = await one('SELECT * FROM contract WHERE id = $1', [id]);
      if (!contract) throw refuse(404, 'no_such_contract', 'No such contract.');
      const lotResolved = await engine.lotByReference(lot);
      if (!lotResolved) throw refuse(404, 'no_such_lot', 'No such lot.');
      // A claim already allocated to one contract is refused a second attachment.
      const existing = await one('SELECT * FROM allocation WHERE lot = $1', [lot]);
      if (existing) {
        throw refuse(409, 'lot_already_allocated',
          'A claim already allocated to one contract is refused a second attachment.',
          { lot, existing_contract: existing.contract, existing_allocation: existing.reference });
      }
      const reference = await tx(async (client) => {
        const r = await nextCounter(client, 'allocation', 4, 'ALC-');
        await client.query(
          `INSERT INTO allocation (reference,contract,lot,mass_g,content_bp,decided_by,favoured_over)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [r, id, lot, lotResolved.mass_g, lotResolved.content_bp, s.email,
            JSON.stringify(favoured_over || [])]
        );
        await appendEntry(client, {
          act: 'contract_allocation_recorded', person: s.email, object_kind: 'contract', object_ref: id,
          content: {
            lot, mass_g: lotResolved.mass_g, content_bp: lotResolved.content_bp,
            decided_by: s.email, favoured_over: favoured_over || [],
            note: 'It is a commercial decision and never an automatic sort with nobody\'s name on it.',
          },
        });
        return r;
      });
      const projection = await contractProjection(await one('SELECT * FROM contract WHERE id = $1', [id]));
      return {
        status: 201,
        body: {
          reference, contract: id, lot, mass_g: lotResolved.mass_g,
          content_bp: lotResolved.content_bp, claim_type: lotResolved.claim_type,
          decided_by: s.email, favoured_over: favoured_over || [],
          projection,
        },
      };
    });
  });

  // ---- Notifications (the record of what left) ----------------------------

  api.get('/notifications', async (c) => {
    refusePagination(c);
    requireSession(c);
    const rows = await query('SELECT * FROM notification ORDER BY sent_at DESC');
    return c.json(rows.map((n) => ({
      reference: n.reference, kind: n.kind, recipient: n.recipient,
      recipient_name: n.recipient_name, subject: n.subject, body: n.body,
      sent_at: momentISO(n.sent_at), about: n.about,
    })));
  });
}
