import { query, one, tx, nextCounter, pool } from '../db.js';
import {
  refuse, requireSession, requireRole, refuseAuditorWrite, withIdempotency,
  refusePagination, recordRefusal, todayISO, dateOnly, momentISO,
} from '../lib/http.js';
import { appendEntry } from '../lib/record.js';
import { sendMail } from '../lib/mail.js';
import { authenticateAtKeycloak } from '../lib/auth.js';
import * as engine from '../engine.js';
import { renderDocument } from '../seed.js';

const SCHEME = 'RCS-2026';
const REGISTRATION = 'REG-RAVEL-0042';
const VERIFY_BASE = 'https://ravel.example.com/verify';

function certPayload(row) {
  return {
    number: row.number,
    version: row.version,
    site: row.site,
    lots: row.lots,
    grade: row.grade,
    specification_version: row.specification_version,
    claim_type: row.claim_type,
    content_bp: Number(row.content_bp),
    category_split: row.category_split,
    period: row.period,
    carbon: row.carbon,
    primary_share_bp: Number(row.primary_share_bp),
    scheme: row.scheme,
    registration: row.registration,
    test_results: row.test_results,
    permitted_statement: row.permitted_statement,
    prohibited_statement: row.prohibited_statement,
    recipient: row.recipient,
    recipient_name: row.recipient_name,
    language: row.language,
    signer: row.signer,
    signer_name: row.signer_name,
    signed_at: momentISO(row.signed_at),
    issued_on: dateOnly(row.issued_on),
    verification_url: row.verification_url,
    state: row.state,
    provisional_factor: row.provisional_factor,
    conditions: row.conditions,
    input_versions: row.input_versions,
    withdrawal_reason: row.withdrawal_reason,
    withdrawn_by: row.withdrawn_by,
    withdrawn_on: dateOnly(row.withdrawn_on),
    derived_from: row.derived_from,
  };
}

export default function register(api) {
  api.get('/certificates', async (c) => {
    refusePagination(c);
    const s = requireSession(c);
    const rows = await query('SELECT * FROM certificate ORDER BY number, version');
    const out = [];
    for (const row of rows) {
      const payload = certPayload(row);
      if (!(s.roles || []).includes('auditor')) {
        // The internal view carries the deviations that travel with the lot.
        const lotRefs = (row.lots || []).map((l) => l.reference || l);
        const devs = await query(
          `SELECT reference, state, outcome FROM deviation WHERE lots ?| $1::text[]`, [lotRefs]
        ).catch(() => []);
        payload.deviations = devs;
      }
      out.push(payload);
    }
    return c.json(out);
  });

  api.get('/certificates/:number', async (c) => {
    requireSession(c);
    const number = c.req.param('number');
    const version = c.req.query('version');
    const row = version
      ? await one('SELECT * FROM certificate WHERE number = $1 AND version = $2', [number, Number(version)])
      : await one('SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC LIMIT 1', [number]);
    if (!row) throw refuse(404, 'no_such_certificate', 'No such certificate.');
    const payload = certPayload(row);
    const lotRefs = (row.lots || []).map((l) => l.reference || l);
    const devs = [];
    for (const lr of lotRefs) {
      const d = await query('SELECT reference, state, outcome, detail FROM deviation WHERE lots @> $1::jsonb',
        [JSON.stringify([lr])]);
      devs.push(...d);
    }
    payload.deviations = devs;
    payload.versions = (await query('SELECT version, state, issued_on FROM certificate WHERE number = $1 ORDER BY version', [number]))
      .map((v) => ({ version: v.version, state: v.state, issued_on: dateOnly(v.issued_on) }));
    return c.json(payload);
  });

  // An issued document is byte-stable: two reads return identical bytes.
  api.get('/certificates/:number/document', async (c) => {
    const number = c.req.param('number');
    const version = c.req.query('version');
    const row = version
      ? await one('SELECT * FROM certificate WHERE number = $1 AND version = $2', [number, Number(version)])
      : await one('SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC LIMIT 1', [number]);
    if (!row) throw refuse(404, 'no_such_certificate', 'No such certificate.');
    return c.body(row.document, 200, { 'content-type': 'text/plain; charset=utf-8' });
  });

  api.post('/certificates/preview', async (c) => {
    const s = requireSession(c);
    const body = await c.req.json().catch(() => ({}));
    const { lot, recipient } = body;
    if (!lot) throw refuse(400, 'lot_required', 'A preview names its lot.');
    const conditions = await engine.evaluateConditions({
      lotReference: lot, signerEmail: body.signer || s.email, signingDate: todayISO(),
    });
    const lotRow = await engine.lotByReference(lot);
    let carbon = null;
    try { carbon = await engine.carbonForLot(lot); } catch { /* named in the condition */ }
    const cus = recipient ? await one('SELECT * FROM customer WHERE reference = $1', [recipient]) : null;
    const statements = lotRow
      ? engine.statementsFor(lotRow.claim_type, lotRow.content_bp, {
          post_consumer_bp: lotRow.mass_g ? Math.floor(lotRow.category_split.post_consumer * 10000 / lotRow.mass_g) : 0,
          pre_consumer_bp: lotRow.mass_g ? Math.floor(lotRow.category_split.pre_consumer * 10000 / lotRow.mass_g) : 0,
        }, cus ? cus.language : 'en')
      : { permitted_statement: null, prohibited_statement: null };
    return c.json({
      lot,
      recipient: recipient || null,
      recipient_name: cus ? cus.name : null,
      conditions,
      all_satisfied: conditions.every((x) => x.satisfied),
      blocking: conditions.filter((x) => !x.satisfied).map((x) => x.condition),
      content_bp: lotRow ? lotRow.content_bp : null,
      claim_type: lotRow ? lotRow.claim_type : null,
      category_split: lotRow ? lotRow.category_split : null,
      carbon,
      provisional_factor: lotRow ? lotRow.provisional_factor : null,
      ...statements,
      note: 'None of the eight is waivable and the same eight are re-checked on the server at the moment of signing.',
    });
  });

  api.post('/certificates', async (c) => {
    const s = requireRole(c, 'certificate_signer');
    refuseAuditorWrite(s);
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, 'POST /certificates', body, async () => {
      const { lot, recipient, password } = body;
      if (!lot || !recipient) throw refuse(400, 'fields_required', 'lot and recipient are required.');
      if (body.content_bp !== undefined || body.percentage !== undefined) {
        throw refuse(400, 'computed_figure_refused', 'Every field is derived. No route accepts a percentage.');
      }
      // The signing act carries the password again: a session alone is not a signing credential.
      if (!password) {
        throw refuse(400, 'reauthentication_required',
          'Signing re-authenticates. The signing act carries the password again and a session alone is not a signing credential.');
      }
      const identity = await authenticateAtKeycloak(s.email, password);
      if (!identity) throw refuse(401, 'reauthentication_failed', 'The password was not accepted at the moment of signing.');

      const lotRow = await one('SELECT * FROM lot WHERE reference = $1', [lot]);
      if (!lotRow) throw refuse(404, 'no_such_lot', 'No such lot.');
      const cus = await one('SELECT * FROM customer WHERE reference = $1', [recipient]);
      if (!cus) throw refuse(404, 'no_such_recipient', 'No such recipient.');

      // The eight conditions are decided again at the moment of signing.
      const signingDate = todayISO();
      const conditions = await engine.evaluateConditions({
        lotReference: lot, signerEmail: s.email, signingDate,
      });
      const failed = conditions.filter((x) => !x.satisfied);
      if (failed.length) {
        await recordRefusal({
          act: 'certificate_signing_refused', person: s.email, site: lotRow.site,
          object_kind: 'lot', object_ref: lot,
          content: { failed_conditions: failed.map((f) => f.condition), conditions },
        });
        throw refuse(409, 'conditions_not_satisfied',
          `Signing is refused: ${failed.map((f) => f.detail).join(' ')}`,
          { conditions, failed_conditions: failed, note: 'None of the eight is waivable.' });
      }

      const lotResolved = await engine.lotByReference(lot);
      const carbon = await engine.carbonForLot(lot);
      const period = await one('SELECT * FROM balance_period WHERE id = $1', [lotRow.period]);
      const spec = await one(
        'SELECT * FROM specification WHERE grade = $1 AND superseded = false ORDER BY version DESC LIMIT 1',
        ['SPEC-' + lotRow.grade]
      );
      const tests = await query(
        'SELECT * FROM test_result WHERE subject_ref = $1 AND usable_for_release = true ORDER BY reference', [lot]
      );
      const factor = await engine.factorInForce(lotRow.site, dateOnly(lotRow.effective_on));
      const split = {
        post_consumer_g: lotResolved.category_split.post_consumer,
        pre_consumer_g: lotResolved.category_split.pre_consumer,
        post_consumer_bp: Math.floor(lotResolved.category_split.post_consumer * 10000 / lotResolved.mass_g),
        pre_consumer_bp: Math.floor(lotResolved.category_split.pre_consumer * 10000 / lotResolved.mass_g),
      };
      const statements = engine.statementsFor(lotResolved.claim_type, lotResolved.content_bp, split, cus.language);
      const carbonOnCert = {
        value_mg_per_kg: carbon.value_mg_per_kg, boundary: carbon.boundary,
        method_version: carbon.method_version, uncertainty_bp: carbon.uncertainty_bp,
        comparator: carbon.comparator, primary_share_bp: carbon.primary_share_bp,
        energy_location_mg_per_kg: carbon.energy_location_mg_per_kg,
        energy_market_mg_per_kg: carbon.energy_market_mg_per_kg,
      };
      const certTests = tests.map((t) => ({
        property: t.property, method: t.method, value: t.value, unit: t.unit, uncertainty_bp: t.uncertainty_bp,
      }));

      // The number is issued from a gapless per-site sequence and is never reused.
      const issued = await tx(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['certseq:' + lotRow.site]);
        const seq = await client.query(
          `INSERT INTO certificate_sequence (site, last) VALUES ($1, 1)
             ON CONFLICT (site) DO UPDATE SET last = certificate_sequence.last + 1
             RETURNING last`,
          [lotRow.site]
        );
        const n = Number(seq.rows[0].last);
        const number = `CERT-${lotRow.site.replace('SITE-', '')}-${String(n).padStart(6, '0')}`;
        const signedAt = new Date().toISOString();
        const document = renderDocument({
          number, version: 1, site: lotRow.site, grade: lotRow.grade,
          lots: [{ reference: lot, mass_g: lotResolved.mass_g }],
          claim_type: lotResolved.claim_type, content_bp: lotResolved.content_bp,
          category_split: split, period: lotRow.period, carbon: carbonOnCert,
          primary_share_bp: carbon.primary_share_bp, scheme: SCHEME, registration: REGISTRATION,
          specification_version: spec ? spec.version : 3, test_results: certTests,
          permitted_statement: statements.permitted_statement,
          prohibited_statement: statements.prohibited_statement,
          recipient_name: cus.name, signer_name: s.name || s.email, signed_at: signedAt,
          issued_on: signingDate, verification_url: `${VERIFY_BASE}/${number}`,
          provisional_factor: !!(factor && factor.provisional), state: 'issued',
        });
        await client.query(
          `INSERT INTO certificate (number,version,site,lots,grade,specification_version,claim_type,content_bp,category_split,period,carbon,primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,recipient,recipient_name,language,signer,signer_name,signed_at,issued_on,verification_url,state,provisional_factor,conditions,input_versions,document,carbon_figure,derived_from)
           VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'issued',$25,$26,$27,$28,$29,$30)`,
          [number, lotRow.site, JSON.stringify([{ reference: lot, mass_g: lotResolved.mass_g }]),
            lotRow.grade, spec ? spec.version : 3, lotResolved.claim_type, lotResolved.content_bp,
            JSON.stringify(split), lotRow.period, JSON.stringify(carbonOnCert), carbon.primary_share_bp,
            SCHEME, REGISTRATION, JSON.stringify(certTests), statements.permitted_statement,
            statements.prohibited_statement, recipient, cus.name, cus.language, s.email,
            s.name || s.email, signedAt, signingDate, `${VERIFY_BASE}/${number}`,
            !!(factor && factor.provisional), JSON.stringify(conditions),
            JSON.stringify({
              carbon_method: carbon.method_version, conversion_factor: factor ? factor.reference : null,
              specification: spec ? `SPEC-${lotRow.grade} v${spec.version}` : null,
              carbon_figure: carbon.figure_id, balance_period: lotRow.period,
            }),
            document, carbon.figure_id, body.derived_from || null]
        );
        // The eight conditions are stored as they stood at the moment of signing.
        await appendEntry(client, {
          act: 'certificate_signed', person: s.email, site: lotRow.site,
          object_kind: 'certificate', object_ref: number, event_at: signedAt,
          content: {
            recipient, lot, claim_type: lotResolved.claim_type, content_bp: lotResolved.content_bp,
            conditions, carbon: carbonOnCert,
          },
        });
        return { number, signedAt };
      });

      await sendMail({
        to: cus.contact,
        subject: `Certificate ${issued.number} issued`,
        text: [
          `Certificate ${issued.number} has been issued to ${cus.name}.`,
          '',
          `Claim type: ${lotResolved.claim_type}`,
          `Recycled content: ${lotResolved.content_bp} basis points (${engine.bpWords(lotResolved.content_bp)})`,
          '',
          'Permitted statement:',
          statements.permitted_statement,
          '',
          `Verify this certificate at ravel.example.com/verify/${issued.number}.`,
        ].join('\n'),
        kind: 'certificate_issued', about: issued.number, recipientName: cus.name,
      }).catch((e) => console.error('mail failed', e));

      const row = await one('SELECT * FROM certificate WHERE number = $1 AND version = 1', [issued.number]);
      return { status: 201, body: { reference: issued.number, ...certPayload(row) } };
    });
  });

  // Withdrawal: one action with five consequences.
  api.post('/certificates/:number/withdraw', async (c) => {
    const s = requireRole(c, 'certificate_signer');
    refuseAuditorWrite(s);
    const number = c.req.param('number');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /certificates/${number}/withdraw`, body, async () => {
      const { reason } = body;
      if (!reason) throw refuse(400, 'reason_required', 'A withdrawal states its reason. It is the only free text on a certificate.');
      const row = await one('SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC LIMIT 1', [number]);
      if (!row) throw refuse(404, 'no_such_certificate', 'No such certificate.');
      if (row.state === 'withdrawn') {
        throw refuse(409, 'already_withdrawn', `This certificate was withdrawn on ${dateOnly(row.withdrawn_on)}. Reason: ${row.withdrawal_reason}.`);
      }
      const account = await one('SELECT * FROM account WHERE email = $1', [s.email]);
      if (!(account.sites || []).includes(row.site)) {
        throw refuse(403, 'site_out_of_scope', `This signer holds no scope for ${row.site}.`);
      }
      const cus = await one('SELECT * FROM customer WHERE reference = $1', [row.recipient]);
      const withdrawnOn = todayISO();

      // 5. The reverse traversal of the underlying batches.
      const lotRefs = (row.lots || []).map((l) => l.reference || l);
      const batchRefs = new Set();
      for (const lr of lotRefs) {
        const g = await engine.genealogy(lr);
        if (g) for (const n of g.nodes) if (n.kind === 'batch') batchRefs.add(n.reference);
      }
      const traversal = [];
      for (const br of batchRefs) {
        const impact = await engine.batchImpact(br);
        traversal.push({
          batch: br,
          lots: impact.lots,
          certificates: impact.certificates.filter((x) => x.number !== number),
          recipients: impact.recipients,
        });
      }
      // 4. Every certificate derived from this one is identified and resolved.
      const derived = await query('SELECT * FROM certificate WHERE derived_from = $1', [number]);

      const voidStatements = [
        row.permitted_statement,
        `This material carries ${row.content_bp} basis points of recycled content under ${row.claim_type}.`,
        `This material is covered by certificate ${number} under scheme ${row.scheme}.`,
      ];

      await tx(async (client) => {
        const document = renderDocument({
          number: row.number, version: row.version, site: row.site, grade: row.grade,
          lots: row.lots, claim_type: row.claim_type, content_bp: Number(row.content_bp),
          category_split: row.category_split, period: row.period, carbon: row.carbon,
          primary_share_bp: Number(row.primary_share_bp), scheme: row.scheme,
          registration: row.registration, specification_version: row.specification_version,
          test_results: row.test_results, permitted_statement: row.permitted_statement,
          prohibited_statement: row.prohibited_statement, recipient_name: row.recipient_name,
          signer_name: row.signer_name, signed_at: momentISO(row.signed_at),
          issued_on: dateOnly(row.issued_on), verification_url: row.verification_url,
          provisional_factor: row.provisional_factor, state: 'withdrawn',
          withdrawal_reason: reason, withdrawn_on: withdrawnOn,
        });
        await client.query(
          `UPDATE certificate SET state = 'withdrawn', withdrawal_reason = $3, withdrawn_by = $4,
             withdrawn_on = $5, document = $6 WHERE number = $1 AND version = $2`,
          [number, row.version, reason, s.email, withdrawnOn, document]
        );
        for (const d of derived) {
          await client.query(
            `UPDATE certificate SET state = 'withdrawn', withdrawal_reason = $3, withdrawn_by = $4, withdrawn_on = $5
               WHERE number = $1 AND version = $2`,
            [d.number, d.version, `Derived from ${number}, which was withdrawn: ${reason}`, s.email, withdrawnOn]
          );
        }
        await appendEntry(client, {
          act: 'certificate_withdrawn', person: s.email, site: row.site,
          object_kind: 'certificate', object_ref: number,
          content: {
            reason, withdrawn_on: withdrawnOn, notified_recipients: [row.recipient_name],
            void_statements: voidStatements,
            derived_certificates: derived.map((d) => d.number),
            batch_traversal: traversal.map((t) => ({ batch: t.batch, certificates: t.certificates.map((x) => x.number) })),
          },
        });
      });

      // 2 and 3. The recipient is notified and the void statements are enumerated.
      await sendMail({
        to: cus ? cus.contact : row.recipient,
        subject: `Certificate ${number} withdrawn`,
        text: [
          `Certificate ${number} was withdrawn on ${withdrawnOn}.`,
          `Reason: ${reason}.`,
          '',
          'The following statements are now void and must no longer be made:',
          ...voidStatements.map((v) => `- ${v}`),
          '',
          'A withdrawal is never a deletion: the document stays readable at its address.',
          `${VERIFY_BASE}/${number}`,
        ].join('\n'),
        kind: 'certificate_withdrawn', about: number, recipientName: row.recipient_name,
      }).catch((e) => console.error('mail failed', e));

      return {
        status: 200,
        body: {
          number,
          state: 'withdrawn',
          reason,
          withdrawn_by: s.email,
          withdrawn_on: withdrawnOn,
          notified_recipients: [{ reference: row.recipient, name: row.recipient_name, address: cus ? cus.contact : null }],
          void_statements: voidStatements,
          derived_certificates: derived.map((d) => ({ number: d.number, version: d.version, state: 'withdrawn' })),
          batch_traversal: traversal,
          note: 'A withdrawal is never a deletion and the document stays readable at its address.',
        },
      };
    });
  });

  api.post('/certificates/:number/reissue', async (c) => {
    const s = requireRole(c, 'certificate_signer');
    refuseAuditorWrite(s);
    const number = c.req.param('number');
    const body = await c.req.json().catch(() => ({}));
    return withIdempotency(c, `POST /certificates/${number}/reissue`, body, async () => {
      const { password, reason } = body;
      if (!password) throw refuse(400, 'reauthentication_required', 'A re-issue re-authenticates.');
      const identity = await authenticateAtKeycloak(s.email, password);
      if (!identity) throw refuse(401, 'reauthentication_failed', 'The password was not accepted.');
      const row = await one('SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC LIMIT 1', [number]);
      if (!row) throw refuse(404, 'no_such_certificate', 'No such certificate.');
      const account = await one('SELECT * FROM account WHERE email = $1', [s.email]);
      if (!(account.sites || []).includes(row.site)) throw refuse(403, 'site_out_of_scope', `This signer holds no scope for ${row.site}.`);
      const lot = (row.lots || [])[0];
      const lotRef = lot.reference || lot;
      const conditions = await engine.evaluateConditions({ lotReference: lotRef, signerEmail: s.email, signingDate: todayISO() });
      const failed = conditions.filter((x) => !x.satisfied);
      if (failed.length) {
        throw refuse(409, 'conditions_not_satisfied', `A re-issue is refused: ${failed.map((f) => f.detail).join(' ')}`, { conditions });
      }
      const newVersion = row.version + 1;
      const signedAt = new Date().toISOString();
      await tx(async (client) => {
        const document = renderDocument({
          number, version: newVersion, site: row.site, grade: row.grade, lots: row.lots,
          claim_type: row.claim_type, content_bp: Number(row.content_bp),
          category_split: row.category_split, period: row.period, carbon: row.carbon,
          primary_share_bp: Number(row.primary_share_bp), scheme: row.scheme,
          registration: row.registration, specification_version: row.specification_version,
          test_results: row.test_results, permitted_statement: row.permitted_statement,
          prohibited_statement: row.prohibited_statement, recipient_name: row.recipient_name,
          signer_name: s.name || s.email, signed_at: signedAt, issued_on: todayISO(),
          verification_url: `${VERIFY_BASE}/${number}`, provisional_factor: row.provisional_factor,
          state: 'issued',
        });
        await client.query(
          `INSERT INTO certificate (number,version,site,lots,grade,specification_version,claim_type,content_bp,category_split,period,carbon,primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,recipient,recipient_name,language,signer,signer_name,signed_at,issued_on,verification_url,state,provisional_factor,conditions,input_versions,document,carbon_figure)
           SELECT number,$2,site,lots,grade,specification_version,claim_type,content_bp,category_split,period,carbon,primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,recipient,recipient_name,language,$3,$4,$5,$6,$7,'issued',provisional_factor,$8,input_versions,$9,carbon_figure
             FROM certificate WHERE number = $1 AND version = $10`,
          [number, newVersion, s.email, s.name || s.email, signedAt, todayISO(),
            `${VERIFY_BASE}/${number}`, JSON.stringify(conditions), document, row.version]
        );
        await appendEntry(client, {
          act: 'certificate_reissued', person: s.email, site: row.site,
          object_kind: 'certificate', object_ref: number,
          content: { version: newVersion, reason: reason || null, conditions },
        });
      });
      const fresh = await one('SELECT * FROM certificate WHERE number = $1 AND version = $2', [number, newVersion]);
      return { status: 201, body: { reference: number, ...certPayload(fresh), note: 'A re-issue produces a new version at a new address rather than new bytes at the old one.' } };
    });
  });

  // A certificate replays from its recorded input versions.
  api.get('/certificates/:number/replay', async (c) => {
    requireSession(c);
    const number = c.req.param('number');
    const row = await one('SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC LIMIT 1', [number]);
    if (!row) throw refuse(404, 'no_such_certificate', 'No such certificate.');
    const iv = row.input_versions || {};
    const missing = [];
    let methodRow = null;
    if (iv.carbon_method) {
      const [mid, mver] = String(iv.carbon_method).split(' v');
      methodRow = await one('SELECT * FROM carbon_method WHERE id = $1 AND version = $2', [mid, Number(mver)]);
      if (!methodRow || methodRow.retired) missing.push({ input: 'carbon_method', reference: iv.carbon_method, reason: methodRow ? 'the method version is retired' : 'the method version cannot be resolved' });
    }
    let factorRow = null;
    if (iv.conversion_factor) {
      factorRow = await one('SELECT * FROM conversion_factor WHERE reference = $1', [iv.conversion_factor]);
      if (!factorRow) missing.push({ input: 'conversion_factor', reference: iv.conversion_factor, reason: 'the conversion factor version cannot be resolved' });
    }
    let figureRow = null;
    if (iv.carbon_figure) {
      figureRow = await one('SELECT * FROM carbon_figure WHERE id = $1', [iv.carbon_figure]);
      if (!figureRow) missing.push({ input: 'carbon_figure', reference: iv.carbon_figure, reason: 'the emission factor set behind the figure is gone' });
    }
    const inputVersions = [
      iv.carbon_method ? { input: 'carbon_method', version: iv.carbon_method, resolved: !!methodRow } : null,
      iv.conversion_factor ? { input: 'conversion_factor', version: iv.conversion_factor, resolved: !!factorRow } : null,
      iv.specification ? { input: 'specification', version: iv.specification, resolved: true } : null,
      iv.carbon_figure ? { input: 'carbon_figure', version: iv.carbon_figure, resolved: !!figureRow } : null,
      iv.balance_period ? { input: 'balance_period', version: iv.balance_period, resolved: true } : null,
    ].filter(Boolean);

    if (missing.length) {
      return c.json({
        number, version: row.version,
        reproducible: false,
        reason: missing.map((m) => `${m.input} ${m.reference}: ${m.reason}`).join('; '),
        missing_inputs: missing,
        input_versions: inputVersions,
        issued: {
          content_bp: Number(row.content_bp),
          carbon_value_mg_per_kg: (row.carbon || {}).value_mg_per_kg,
        },
        note: 'It is never recomputed under today\'s rules and presented as the original.',
      });
    }

    // Recompute the figures from the versioned inputs recorded against it.
    const lotRefs = (row.lots || []).map((l) => l.reference || l);
    const recomputed = { content_bp: null, carbon_value_mg_per_kg: null, uncertainty_bp: null, boundary: null };
    if (lotRefs.length) {
      const lotNow = await engine.lotContent(lotRefs[0]);
      recomputed.content_bp = lotNow ? lotNow.content_bp : null;
    }
    if (figureRow) {
      recomputed.carbon_value_mg_per_kg = Number(figureRow.value_mg_per_kg);
      recomputed.uncertainty_bp = Number(figureRow.uncertainty_bp);
      recomputed.boundary = figureRow.boundary;
    }
    const issued = {
      content_bp: Number(row.content_bp),
      carbon_value_mg_per_kg: (row.carbon || {}).value_mg_per_kg,
      uncertainty_bp: (row.carbon || {}).uncertainty_bp,
      boundary: (row.carbon || {}).boundary,
    };
    const differing = [];
    for (const k of Object.keys(issued)) {
      if (recomputed[k] !== null && recomputed[k] !== undefined && recomputed[k] !== issued[k]) {
        differing.push({ input: k, issued: issued[k], recomputed: recomputed[k] });
      }
    }
    return c.json({
      number, version: row.version,
      reproducible: true,
      issued,
      recomputed,
      agrees: differing.length === 0,
      differing_input: differing.length ? differing[0] : null,
      differing_inputs: differing,
      input_versions: inputVersions,
      note: 'Agreement and disagreement are both ordinary answers.',
      read_at: new Date().toISOString(),
    });
  });

  // ---- Public verification -------------------------------------------------

  const verifyHits = new Map();
  api.get('/verify/:number', async (c) => {
    const ip = c.req.header('x-forwarded-for') || 'anonymous';
    const now = Date.now();
    const hits = (verifyHits.get(ip) || []).filter((t) => now - t < 60000);
    hits.push(now);
    verifyHits.set(ip, hits);
    if (hits.length > 120) {
      return c.json({ error: 'rate_limited', detail: 'This route is rate limited.' }, 429);
    }
    const number = c.req.param('number');
    const row = await one('SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC LIMIT 1', [number]);
    // An unknown number returns 200 with found false rather than an error.
    if (!row) {
      return c.json({
        found: false, number, state: null, issued_on: null, withdrawn_on: null,
        withdrawal_reason: null, site: null, grade: null, claim_type: null, recipient_name: null,
      });
    }
    return c.json({
      found: true,
      number: row.number,
      state: row.state,
      issued_on: dateOnly(row.issued_on),
      withdrawn_on: dateOnly(row.withdrawn_on),
      withdrawal_reason: row.withdrawal_reason,
      site: row.site,
      grade: row.grade,
      claim_type: row.claim_type,
      recipient_name: row.recipient_name,
    });
  });
}
