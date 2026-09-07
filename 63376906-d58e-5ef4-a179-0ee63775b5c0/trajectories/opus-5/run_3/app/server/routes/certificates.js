import { Hono } from 'hono';
import { rq, rq1, tx } from '../db/pool.js';
import { appendEntry } from '../lib/record.js';
import {
  idempotent, refuse, requireRole, requireSession, refuseAuditorWrite,
  refuseComputedInputs, refusePaging, recordRefusal
} from '../lib/http.js';
import { passwordGrant } from '../lib/auth.js';
import { evaluateConditions, statementsFor, renderDocument, VERIFY_BASE } from '../engine/certificate.js';
import { lotClaim } from '../engine/ledger.js';
import { lotCarbon } from '../engine/carbon.js';
import { batchImpact } from '../engine/genealogy.js';
import { partyNameOn } from '../engine/feedstock.js';
import { mailCertificateIssued, mailCertificateWithdrawn } from '../lib/mail.js';

export const certificates = new Hono();

function shape(row) {
  return {
    number: row.number,
    version: row.version,
    site: row.site,
    lots: row.lots,
    grade: row.grade,
    specification_version: row.specification_version,
    // claim_type is returned at the same weight as content_bp, so no response
    // carries the percentage without the type beside it.
    claim_type: row.claim_type,
    content_bp: row.content_bp,
    category_split: row.category_split,
    period: row.period,
    carbon: row.carbon,
    primary_share_bp: row.primary_share_bp,
    scheme: row.scheme,
    registration: row.registration,
    test_results: row.test_results,
    permitted_statement: row.permitted_statement,
    prohibited_statement: row.prohibited_statement,
    signer: row.signer,
    signer_name: row.signer_name,
    signed_at: row.signed_at,
    issued_on: String(row.issued_on).slice(0, 10),
    verification_url: row.verification_url,
    state: row.state,
    provisional_factor: row.provisional_factor,
    recipient: row.recipient,
    recipient_name: row.recipient_name,
    withdrawn_on: row.withdrawn_on ? String(row.withdrawn_on).slice(0, 10) : null,
    withdrawn_by: row.withdrawn_by,
    withdrawal_reason: row.withdrawal_reason,
    // Stored as they stood at the moment of signing and never recomputed on read.
    conditions_at_signing: row.conditions_at_signing,
    input_versions: row.input_versions,
    // A deviation appears on the internal view of any certificate issued
    // against the lot it touches.
    deviations: row.deviations,
    supersedes: row.supersedes,
    derived_from: row.derived_from,
    withdrawal_statement: row.state === 'withdrawn'
      ? `This certificate was withdrawn on ${String(row.withdrawn_on).slice(0, 10)}. Reason: ${row.withdrawal_reason}.`
      : null
  };
}

certificates.get('/certificates', async (c) => {
  refusePaging(c);
  const session = c.get('session');
  let rows = await rq('SELECT * FROM certificate ORDER BY number');
  // A converter sees its own certificates and never a genealogy.
  if (session?.customer) rows = rows.filter((r) => r.recipient === session.customer);
  const out = [];
  for (const r of rows) {
    const s = shape(r);
    const lotRefs = (r.lots || []).map((l) => l.reference);
    const devs = lotRefs.length
      ? await rq(`SELECT reference, state, title, outcome FROM deviation
                   WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(lots) x WHERE x = ANY($1))`, [lotRefs])
      : [];
    out.push({ ...s, deviations: devs });
  }
  return c.json(out);
});

certificates.get('/certificates/:number', async (c) => {
  const row = await rq1('SELECT * FROM certificate WHERE number = $1', [c.req.param('number')]);
  if (!row) throw refuse(404, 'no_such_certificate', `No certificate is recorded at ${c.req.param('number')}.`);
  const lotRefs = (row.lots || []).map((l) => l.reference);
  const devs = lotRefs.length
    ? await rq(`SELECT reference, state, title, outcome FROM deviation
                 WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(lots) x WHERE x = ANY($1))`, [lotRefs])
    : [];
  const notifications = await rq(
    'SELECT recipient, recipient_name, subject, kind, sent_at, delivered FROM certificate_notification WHERE certificate = $1 ORDER BY id',
    [row.number]
  );
  return c.json({ ...shape(row), deviations: devs, notifications });
});

/** An issued document is byte-stable: two reads of the same certificate version
 *  return identical bytes, because a customer's auditor compares the copy they
 *  filed with the copy they fetch. The bytes were written once, at signing. */
certificates.get('/certificates/:number/document', async (c) => {
  const row = await rq1('SELECT document, state, number FROM certificate WHERE number = $1', [c.req.param('number')]);
  if (!row) throw refuse(404, 'no_such_certificate', `No certificate is recorded at ${c.req.param('number')}.`);
  return new Response(row.document, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `inline; filename="${row.number}.txt"`,
      'cache-control': 'no-transform'
    }
  });
});

certificates.post('/certificates/preview', async (c) => {
  const session = requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);
  if (!body.lot) throw refuse(400, 'missing_field', 'A preview names the lot it is for.');

  const signingDate = new Date().toISOString().slice(0, 10);
  const evaluated = await evaluateConditions({
    lotRef: body.lot, recipient: body.recipient, signer: session, signingDate
  });
  const lot = evaluated.lot;
  const claim = lot ? await lotClaim(body.lot) : null;
  let carbon = null;
  try { carbon = lot ? await lotCarbon(body.lot) : null; } catch { carbon = null; }

  const recipientName = body.recipient
    ? await partyNameOn(body.recipient, signingDate) : null;
  const customer = body.recipient
    ? await rq1('SELECT * FROM customer WHERE reference = $1', [body.recipient]) : null;

  const statements = claim ? statementsFor({
    claimType: lot.claim_type, contentBp: claim.content_bp,
    categorySplit: claim.category_split, language: customer?.language || 'en'
  }) : null;

  const factor = lot ? await rq1(
    'SELECT provisional FROM conversion_factor WHERE site = $1 ORDER BY version DESC LIMIT 1', [lot.site]) : null;

  return c.json({
    lot: body.lot,
    recipient: body.recipient || null,
    recipient_name: recipientName,
    // Exactly eight entries, none of them waivable.
    conditions: evaluated.conditions,
    blocking: evaluated.conditions.filter((x) => !x.satisfied),
    can_sign: evaluated.conditions.every((x) => x.satisfied),
    site: lot?.site || null,
    grade: lot?.grade || null,
    claim_type: lot?.claim_type || null,
    content_bp: claim?.content_bp ?? null,
    category_split: claim?.category_split ?? null,
    carbon,
    primary_share_bp: carbon?.primary_share_bp ?? null,
    period: lot?.balance_period || null,
    provisional_factor: !!factor?.provisional,
    permitted_statement: statements?.permitted_statement || null,
    prohibited_statement: statements?.prohibited_statement || null,
    language: customer?.language || 'en',
    note: 'None of the eight is waivable, and the same eight are re-checked on the server at the moment of signing.'
  });
});

/** Signing re-authenticates: the signing act carries the password again and a
 *  session alone is not a signing credential. */
certificates.post('/certificates', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'certificate_signer');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);
  if (!body.lot || !body.recipient) {
    throw refuse(400, 'missing_field', 'A certificate names its lot and its recipient.');
  }
  if (!body.password) {
    throw refuse(401, 're_authentication_required',
      'Signing a certificate re-authenticates. The signing act carries the password again; a session alone is not a signing credential.');
  }
  const reauth = await passwordGrant(session.email, body.password);
  if (!reauth || reauth.email !== session.email) {
    await recordRefusal({
      act: 'certificate_signing_refused', person: session.email, object_kind: 'lot', object_ref: body.lot,
      content: { reason: 're-authentication failed' }
    });
    throw refuse(401, 're_authentication_failed', 'The password did not authenticate at the identity provider.');
  }

  // The idempotency key is scoped to the body, and the password is part of the
  // body, so it is hashed out of the stored response below.
  const keyBody = { lot: body.lot, recipient: body.recipient };
  const result = await idempotent(c, 'POST /api/certificates', keyBody, async () => tx(async (client) => {
    const signingDate = new Date().toISOString().slice(0, 10);

    // The eight conditions are decided again at the moment of signing, against
    // the records as they stand then rather than as they stood at the preview.
    const evaluated = await evaluateConditions({
      lotRef: body.lot, recipient: body.recipient, signer: session, signingDate
    });
    const unmet = evaluated.conditions.filter((x) => !x.satisfied);
    if (unmet.length) {
      await recordRefusal({
        act: 'certificate_signing_refused', person: session.email, site: evaluated.lot?.site,
        object_kind: 'lot', object_ref: body.lot, outcome: 'refused',
        content: { unmet: unmet.map((u) => u.condition), detail: unmet.map((u) => u.detail) }
      });
      throw refuse(409, 'condition_not_satisfied',
        `Signing is refused: ${unmet.map((u) => u.condition).join('; ')}.`,
        { conditions: evaluated.conditions, unmet, note: 'None of the eight is waivable.' });
    }

    const lot = evaluated.lot;
    const claim = await lotClaim(body.lot);
    const carbon = await lotCarbon(body.lot);
    const customer = await client.query('SELECT * FROM customer WHERE reference = $1', [body.recipient]);
    if (!customer.rows.length) throw refuse(400, 'no_such_recipient', `No customer is recorded at ${body.recipient}.`);
    const recipientName = await partyNameOn(body.recipient, signingDate);

    // The number is issued from a gapless per-site sequence and is never
    // reused. Two signatures landing at once take two consecutive numbers,
    // because the sequence row is locked and incremented inside the same
    // transaction that writes the certificate.
    const seq = await client.query(
      'UPDATE certificate_sequence SET last_number = last_number + 1 WHERE site = $1 RETURNING last_number',
      [lot.site]
    );
    const n = seq.rows[0].last_number;
    const number = `CERT-${lot.site.replace('SITE-', '')}-${String(n).padStart(6, '0')}`;

    const statements = statementsFor({
      claimType: lot.claim_type, contentBp: claim.content_bp,
      categorySplit: claim.category_split, language: customer.rows[0].language
    });
    const otherLanguage = customer.rows[0].language === 'en' ? 'fr' : 'en';
    const alt = statementsFor({
      claimType: lot.claim_type, contentBp: claim.content_bp,
      categorySplit: claim.category_split, language: otherLanguage
    });

    const tests = await client.query(
      `SELECT reference, property, method, value, unit, uncertainty_bp FROM test_result
        WHERE subject_ref = $1 AND usable_for_release = true ORDER BY reference`, [body.lot]
    );
    const factor = await client.query(
      'SELECT reference, provisional FROM conversion_factor WHERE site = $1 ORDER BY version DESC LIMIT 1', [lot.site]
    );
    const devs = await client.query(
      `SELECT reference, state, title, outcome FROM deviation
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(lots) x WHERE x = $1)`, [body.lot]
    );

    const inputVersions = {
      carbon_method: carbon.method_version,
      conversion_factor: `${factor.rows[0]?.reference}${factor.rows[0]?.provisional ? ' (provisional)' : ''}`,
      specification: `${lot.specification} v${lot.specification_version}`,
      balance_period: lot.balance_period,
      emission_factor_set: carbon.input_versions?.emission_factor_set || null
    };

    const shaped = {
      number, version: 1, site: lot.site, recipient: body.recipient, recipient_name: recipientName,
      grade: lot.grade, lots: [{ reference: lot.reference, mass_g: Number(lot.mass_g) }],
      specification_version: lot.specification_version, claim_type: lot.claim_type,
      content_bp: claim.content_bp, category_split: claim.category_split,
      period: lot.balance_period, carbon, primary_share_bp: carbon.primary_share_bp,
      scheme: 'RCS-2026', registration: 'REG-RAVEL-0042', test_results: tests.rows,
      permitted_statement: statements.permitted_statement,
      prohibited_statement: statements.prohibited_statement,
      statements_language: { language: otherLanguage, ...alt },
      signer: session.email, signer_name: session.name,
      signed_at: new Date().toISOString(), issued_on: signingDate,
      verification_url: `${VERIFY_BASE}/${number}`, state: 'issued',
      provisional_factor: !!factor.rows[0]?.provisional
    };
    // The document's bytes are written once and never regenerated.
    const document = renderDocument(shaped);

    await client.query(
      `INSERT INTO certificate (number,version,site,recipient,recipient_name,grade,lots,specification_version,
         claim_type,content_bp,category_split,period,carbon,primary_share_bp,scheme,registration,test_results,
         permitted_statement,prohibited_statement,signer,signer_name,signed_at,issued_on,verification_url,state,
         provisional_factor,conditions_at_signing,input_versions,document,deviations,language,supersedes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'issued',
         $25,$26,$27,$28,$29,$30,$31)`,
      [number, 1, lot.site, body.recipient, recipientName, lot.grade,
        JSON.stringify(shaped.lots), lot.specification_version, lot.claim_type, claim.content_bp,
        JSON.stringify(claim.category_split), lot.balance_period, JSON.stringify(carbon),
        carbon.primary_share_bp, 'RCS-2026', 'REG-RAVEL-0042', JSON.stringify(tests.rows),
        statements.permitted_statement, statements.prohibited_statement, session.email, session.name,
        shaped.signed_at, signingDate, shaped.verification_url,
        shaped.provisional_factor, JSON.stringify(evaluated.conditions), JSON.stringify(inputVersions),
        document, JSON.stringify(devs.rows), customer.rows[0].language, body.supersedes || null]
    );

    await appendEntry(client, {
      act: 'certificate_signed', person: session.email, site: lot.site,
      object_kind: 'certificate', object_ref: number, anchor_ref: number,
      content: { lot: body.lot, recipient: body.recipient, content_bp: claim.content_bp,
        claim_type: lot.claim_type, conditions: evaluated.conditions.map((x) => ({ condition: x.condition, satisfied: x.satisfied })) }
    });

    await client.query(
      `INSERT INTO certificate_notification (certificate,recipient,recipient_name,subject,body,kind,delivered)
       VALUES ($1,$2,$3,$4,$5,'issued',false)`,
      [number, customer.rows[0].contact, recipientName, `Certificate ${number} issued`, statements.permitted_statement]
    );

    return {
      status: 201,
      body: { ...shape({ ...shaped, conditions_at_signing: evaluated.conditions, input_versions: inputVersions,
        deviations: devs.rows, issued_on: signingDate, withdrawn_on: null }),
      reference: number,
      mail: { to: customer.rows[0].contact, subject: `Certificate ${number} issued` } }
    };
  }));

  if (result.status === 201 && !result.replayed) {
    try {
      const cust = await rq1('SELECT contact FROM customer WHERE reference = $1', [body.recipient]);
      await mailCertificateIssued({ ...result.body, recipient_contact: cust.contact });
      await pool_markDelivered(result.body.number, 'issued');
    } catch { /* the record is the fact; the mail is the courtesy */ }
  }
  return c.json(result.body, result.status);
});

async function pool_markDelivered(number, kind) {
  const { pool } = await import('../db/pool.js');
  await pool.query('UPDATE certificate_notification SET delivered = true WHERE certificate = $1 AND kind = $2', [number, kind]);
}

/** A withdrawal is one action with five consequences. */
certificates.post('/certificates/:number/withdraw', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'certificate_signer');
  const number = c.req.param('number');
  const body = await c.req.json().catch(() => ({}));
  // The withdrawal reason is the only free text on a certificate.
  if (!body.reason) throw refuse(400, 'missing_field', 'A withdrawal states its reason.');

  const result = await idempotent(c, `POST /api/certificates/${number}/withdraw`, { reason: body.reason }, async () => tx(async (client) => {
    const r = await client.query('SELECT * FROM certificate WHERE number = $1 FOR UPDATE', [number]);
    if (!r.rows.length) throw refuse(404, 'no_such_certificate', `No certificate is recorded at ${number}.`);
    const cert = r.rows[0];
    if (cert.state === 'withdrawn') {
      throw refuse(409, 'already_withdrawn',
        `${number} was withdrawn on ${String(cert.withdrawn_on).slice(0, 10)}. A withdrawal is never undone: the remedy is a new certificate.`);
    }
    if (!session.sites.includes(cert.site)) {
      throw refuse(403, 'site_out_of_scope',
        `Your grant covers ${session.sites.join(', ')} and ${number} was issued at ${cert.site}.`);
    }

    const withdrawnOn = new Date().toISOString().slice(0, 10);

    // 1. The state becomes withdrawn with the reason, the person and the date.
    await client.query(
      `UPDATE certificate SET state = 'withdrawn', withdrawn_on = $1, withdrawn_by = $2, withdrawal_reason = $3
       WHERE number = $4`, [withdrawnOn, session.email, body.reason, number]
    );

    // 3. Every downstream statement the recipient was permitted to make is
    //    enumerated.
    const voidStatements = [
      cert.permitted_statement,
      `Any restatement of ${cert.content_bp} basis points of recycled content sourced from certificate ${number}.`,
      `Any description of material under certificate ${number} as carrying a ${cert.claim_type} claim.`,
      `Any onward declaration to a regulator or a customer that rests on certificate ${number}.`
    ];

    // 4. Every certificate derived from this one is identified and resolved.
    const derived = await client.query(
      'SELECT number, version, state, recipient, recipient_name FROM certificate WHERE derived_from = $1 OR supersedes = $1 ORDER BY number',
      [number]
    );

    // 5. The reverse traversal of the underlying batches runs, so that every
    //    other certificate touching them is enumerated in the same action.
    const lotRefs = (cert.lots || []).map((l) => l.reference);
    const batchRefs = lotRefs.length
      ? (await client.query(
        `WITH RECURSIVE up(ref, kind) AS (
           SELECT c.input_ref, c.input_kind FROM consumption c JOIN output o ON o.run = c.run
             WHERE o.reference IN (SELECT output_ref FROM lot WHERE reference = ANY($1))
           UNION
           SELECT c.input_ref, c.input_kind FROM consumption c JOIN output o ON o.run = c.run
             JOIN up ON up.ref = o.reference AND up.kind = 'output')
         SELECT DISTINCT ref FROM up WHERE kind = 'batch'`, [lotRefs])).rows.map((x) => x.ref)
      : [];

    const traversal = [];
    for (const b of batchRefs) {
      const impact = await batchImpact(b);
      if (impact) {
        traversal.push({
          batch: b,
          lots: impact.lots.map((l) => l.reference),
          certificates: impact.certificates.map((x) => ({ number: x.number, state: x.state, recipient_name: x.recipient_name })),
          recipients: impact.recipients
        });
      }
    }
    const otherCerts = [...new Set(traversal.flatMap((t) => t.certificates.map((x) => x.number)))]
      .filter((x) => x !== number);

    // 2. The recipient is notified, and the notification is part of the record.
    const customer = await client.query('SELECT contact FROM customer WHERE reference = $1', [cert.recipient]);
    const notified = [{ reference: cert.recipient, name: cert.recipient_name, contact: customer.rows[0]?.contact || null }];
    await client.query(
      `INSERT INTO certificate_notification (certificate,recipient,recipient_name,subject,body,kind,delivered)
       VALUES ($1,$2,$3,$4,$5,'withdrawn',false)`,
      [number, customer.rows[0]?.contact || 'unknown', cert.recipient_name,
        `Certificate ${number} withdrawn`, voidStatements.join('\n')]
    );

    await appendEntry(client, {
      act: 'certificate_withdrawn', person: session.email, site: cert.site,
      object_kind: 'certificate', object_ref: number, anchor_ref: number,
      content: { reason: body.reason, withdrawn_on: withdrawnOn,
        notified_recipients: notified.map((x) => x.name),
        void_statements: voidStatements.length,
        derived_certificates: derived.rows.map((x) => x.number),
        batch_traversal: traversal.map((t) => t.batch) },
      effective_on: withdrawnOn
    });

    return {
      status: 201,
      body: {
        number, state: 'withdrawn', reason: body.reason,
        withdrawn_by: session.email, withdrawn_on: withdrawnOn,
        // Recipients by name, never a count.
        notified_recipients: notified,
        void_statements: voidStatements,
        derived_certificates: derived.rows,
        batch_traversal: traversal,
        other_certificates_touching_the_same_batches: otherCerts,
        document_still_resolves: `${VERIFY_BASE}/${number}`,
        statement: `This certificate was withdrawn on ${withdrawnOn}. Reason: ${body.reason}.`,
        note: 'A withdrawal is never a deletion and the document stays readable at its address.',
        mail: { to: customer.rows[0]?.contact, subject: `Certificate ${number} withdrawn` }
      }
    };
  }));

  if (result.status === 201 && !result.replayed) {
    try {
      const cert = await rq1('SELECT * FROM certificate WHERE number = $1', [number]);
      const cust = await rq1('SELECT contact FROM customer WHERE reference = $1', [cert.recipient]);
      await mailCertificateWithdrawn({ ...cert, recipient_contact: cust.contact }, body.reason, result.body.void_statements);
      await pool_markDelivered(number, 'withdrawn');
    } catch { /* the record is the fact */ }
  }
  return c.json(result.body, result.status);
});

/** A re-issue produces a new version at a new address rather than new bytes at
 *  the old one. */
certificates.post('/certificates/:number/reissue', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'certificate_signer');
  const number = c.req.param('number');
  const body = await c.req.json().catch(() => ({}));
  if (!body.password) {
    throw refuse(401, 're_authentication_required', 'Signing re-authenticates. A session alone is not a signing credential.');
  }
  const reauth = await passwordGrant(session.email, body.password);
  if (!reauth) throw refuse(401, 're_authentication_failed', 'The password did not authenticate.');

  const result = await idempotent(c, `POST /api/certificates/${number}/reissue`, { reason: body.reason || null }, async () => tx(async (client) => {
    const r = await client.query('SELECT * FROM certificate WHERE number = $1 FOR UPDATE', [number]);
    if (!r.rows.length) throw refuse(404, 'no_such_certificate', `No certificate is recorded at ${number}.`);
    const old = r.rows[0];
    if (!session.sites.includes(old.site)) {
      throw refuse(403, 'site_out_of_scope', `Your grant covers ${session.sites.join(', ')} and ${number} was issued at ${old.site}.`);
    }

    const seq = await client.query(
      'UPDATE certificate_sequence SET last_number = last_number + 1 WHERE site = $1 RETURNING last_number', [old.site]
    );
    const newNumber = `CERT-${old.site.replace('SITE-', '')}-${String(seq.rows[0].last_number).padStart(6, '0')}`;
    const lotRef = (old.lots || [])[0]?.reference;
    const claim = await lotClaim(lotRef);
    const carbon = await lotCarbon(lotRef);
    const signingDate = new Date().toISOString().slice(0, 10);

    const evaluated = await evaluateConditions({ lotRef, recipient: old.recipient, signer: session, signingDate });
    const unmet = evaluated.conditions.filter((x) => !x.satisfied);
    if (unmet.length) {
      throw refuse(409, 'condition_not_satisfied',
        `Re-issue is refused: ${unmet.map((u) => u.condition).join('; ')}.`, { conditions: evaluated.conditions, unmet });
    }

    const statements = statementsFor({
      claimType: old.claim_type, contentBp: claim.content_bp,
      categorySplit: claim.category_split, language: old.language
    });
    const shaped = {
      ...shape(old), number: newNumber, version: old.version + 1, content_bp: claim.content_bp,
      category_split: claim.category_split, carbon, primary_share_bp: carbon.primary_share_bp,
      permitted_statement: statements.permitted_statement, prohibited_statement: statements.prohibited_statement,
      signer: session.email, signer_name: session.name, signed_at: new Date().toISOString(),
      issued_on: signingDate, verification_url: `${VERIFY_BASE}/${newNumber}`, state: 'issued'
    };
    const document = renderDocument(shaped);

    await client.query(
      `INSERT INTO certificate (number,version,site,recipient,recipient_name,grade,lots,specification_version,
         claim_type,content_bp,category_split,period,carbon,primary_share_bp,scheme,registration,test_results,
         permitted_statement,prohibited_statement,signer,signer_name,signed_at,issued_on,verification_url,state,
         provisional_factor,conditions_at_signing,input_versions,document,derived_from,supersedes,language)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'issued',
         $25,$26,$27,$28,$29,$29,$30)`,
      [newNumber, old.version + 1, old.site, old.recipient, old.recipient_name, old.grade,
        JSON.stringify(old.lots), old.specification_version, old.claim_type, claim.content_bp,
        JSON.stringify(claim.category_split), old.period, JSON.stringify(carbon), carbon.primary_share_bp,
        old.scheme, old.registration, JSON.stringify(old.test_results),
        statements.permitted_statement, statements.prohibited_statement, session.email, session.name,
        shaped.signed_at, signingDate, shaped.verification_url, old.provisional_factor,
        JSON.stringify(evaluated.conditions), JSON.stringify(old.input_versions), document, number, old.language]
    );
    await client.query("UPDATE certificate SET state = 'superseded' WHERE number = $1 AND state = 'issued'", [number]);

    await appendEntry(client, {
      act: 'certificate_reissued', person: session.email, site: old.site,
      object_kind: 'certificate', object_ref: newNumber, anchor_ref: newNumber,
      content: { supersedes: number, version: old.version + 1, reason: body.reason || null }
    });
    return { status: 201, body: { reference: newNumber, number: newNumber, version: old.version + 1, supersedes: number, state: 'issued' } };
  }));
  return c.json(result.body, result.status);
});

/** Replay recomputes the certificate's figures from the versioned inputs
 *  recorded against it. Agreement and disagreement are both ordinary answers. */
certificates.get('/certificates/:number/replay', async (c) => {
  requireSession(c);
  const number = c.req.param('number');
  const cert = await rq1('SELECT * FROM certificate WHERE number = $1', [number]);
  if (!cert) throw refuse(404, 'no_such_certificate', `No certificate is recorded at ${number}.`);

  const inputVersions = cert.input_versions || {};
  const missing = [];

  // A figure whose inputs can no longer be resolved is reported as
  // unreproducible with a named reason. It is never recomputed under today's
  // rules and presented as the original.
  const methodRef = String(inputVersions.carbon_method || '');
  const m = methodRef.match(/^(\S+)\s+v(\d+)$/);
  let methodVersion = null;
  if (m) {
    methodVersion = await rq1('SELECT * FROM carbon_method_version WHERE method = $1 AND version = $2', [m[1], Number(m[2])]);
    if (!methodVersion) missing.push(`the carbon method version ${methodRef} has been retired`);
  } else {
    missing.push('the certificate names no resolvable carbon method version');
  }

  const factorRef = String(inputVersions.conversion_factor || '').replace(' (provisional)', '');
  const factor = factorRef ? await rq1('SELECT * FROM conversion_factor WHERE reference = $1', [factorRef]) : null;
  if (factorRef && !factor) missing.push(`the conversion factor ${factorRef} can no longer be resolved`);

  if (missing.length) {
    return c.json({
      number, reproducible: false, reason: missing.join('; '),
      input_versions: inputVersions,
      issued: { content_bp: cert.content_bp, value_mg_per_kg: cert.carbon?.value_mg_per_kg ?? null },
      recomputed: null, agrees: null, differing_input: null,
      note: 'A figure whose inputs can no longer be resolved is never recomputed under today\'s rules and presented as the original.'
    });
  }

  const lotRef = (cert.lots || [])[0]?.reference;
  const claim = lotRef ? await lotClaim(lotRef) : null;
  const figure = await rq1(
    'SELECT * FROM carbon_figure WHERE lot = $1 AND method_version = $2 ORDER BY version LIMIT 1',
    [lotRef, methodVersion.version]
  );
  const recomputedCarbon = figure
    ? (figure.breakdown || []).reduce((s, l) => s + Number(l.mg_per_kg), 0)
    : null;

  const issued = {
    content_bp: cert.content_bp,
    value_mg_per_kg: cert.carbon?.value_mg_per_kg ?? null,
    claim_type: cert.claim_type,
    category_split: cert.category_split
  };
  const recomputed = {
    content_bp: claim ? claim.content_bp : null,
    value_mg_per_kg: recomputedCarbon,
    claim_type: cert.claim_type,
    category_split: claim ? claim.category_split : null
  };

  const differences = [];
  if (issued.content_bp !== recomputed.content_bp) {
    differences.push({
      input: 'the claim attached to the lot',
      issued: issued.content_bp, recomputed: recomputed.content_bp, field: 'content_bp'
    });
  }
  if (issued.value_mg_per_kg !== recomputed.value_mg_per_kg) {
    differences.push({
      input: `the carbon breakdown under ${methodRef}`,
      issued: issued.value_mg_per_kg, recomputed: recomputed.value_mg_per_kg, field: 'value_mg_per_kg'
    });
  }

  return c.json({
    number,
    reproducible: true,
    issued,
    recomputed,
    agrees: differences.length === 0,
    // It names both values together with the one input that moved.
    differing_input: differences.length ? differences[0] : null,
    all_differences: differences,
    input_versions: inputVersions,
    conditions_at_signing: cert.conditions_at_signing,
    note: 'Agreement and disagreement are both ordinary answers. A disagreement is the finding an auditor came for.'
  });
});
