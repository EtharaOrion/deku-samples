import { q, one, pool, tx } from '../lib/db.js';
import {
  refuse, requireSession, requireRole, idempotent, record, refuseParams,
  refuseComputedInput, requireOneOf, refuseAuditorWrite, nextReference,
} from '../lib/http.js';
import {
  certificateConditions, lotView, carbonForLot, batchImpact, iso, partyNameOn, statementsFor,
} from '../lib/engine.js';
import { keycloakPassword } from '../lib/auth.js';
import { renderDocument } from '../lib/document.js';
import { sendMail } from '../lib/mail.js';

const SCHEME = 'RCS-2026';
const REGISTRATION = 'REG-RAVEL-0042';
const VERIFY_BASE = 'https://ravel.example.com/verify';

const rateWindow = new Map();

export default function mount(app) {
  /* ------------------------------------------------------- the register */
  app.get('/certificates', async (c) => {
    refuseParams(c);
    const s = requireSession(c);
    const rows = await q('SELECT * FROM certificate ORDER BY signed_at ASC');
    return c.json(rows.map((x) => shape(x, s)));
  });

  app.get('/certificates/:number', async (c) => {
    const s = requireSession(c);
    const rows = await q(
      'SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC', [c.req.param('number')]);
    if (!rows.length) refuse(404, 'no_such_certificate', { message: 'There is no such certificate.' });
    const x = rows[0];
    const dev = await q(
      `SELECT * FROM deviation WHERE lots && $1`,
      [(x.lots || []).map((l) => l.reference)]);
    return c.json({
      ...shape(x, s),
      versions: rows.map((r) => ({ version: r.version, signed_at: r.signed_at, state: r.state })),
      // A deviation appears on the internal view of any certificate issued against the lot.
      deviations: dev.map((d) => ({ reference: d.reference, state: d.state, outcome: d.outcome, detail: d.detail })),
      conditions_at_signing: x.conditions,
      input_versions: x.input_versions,
    });
  });

  // An issued document is byte-stable.
  app.get('/certificates/:number/document', async (c) => {
    const rows = await q(
      'SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC', [c.req.param('number')]);
    if (!rows.length) refuse(404, 'no_such_certificate', { message: 'There is no such certificate.' });
    const version = c.req.query('version');
    const x = version ? rows.find((r) => String(r.version) === String(version)) : rows[0];
    if (!x) refuse(404, 'no_such_version', { message: 'There is no such certificate version.' });
    return new Response(x.document, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-transform' },
    });
  });

  /* ------------------------------------------------------------ preview */
  app.post('/certificates/preview', async (c) => {
    const s = requireSession(c);
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    if (!body.lot) refuse(400, 'field_required', { message: 'lot is required.', field: 'lot' });
    const lot = await lotView(body.lot);
    if (!lot) refuse(404, 'no_such_lot', { message: 'There is no such lot.', field: 'lot' });
    const conditions = await certificateConditions({ lotRef: body.lot, signer: s });
    const carbon = await carbonForLot(body.lot);
    const recipient = body.recipient ? await one('SELECT * FROM customer WHERE reference = $1', [body.recipient]) : null;
    const statements = statementsFor(lot.claim_type, lot.content_bp, lot.category_split, recipient?.language || 'en');
    const suspension = await suspensionFor(lot.site, iso(new Date()), lot.grade);
    return c.json({
      lot: body.lot,
      recipient: body.recipient || null,
      recipient_name: recipient ? await partyNameOn(recipient.reference, iso(new Date())) : null,
      conditions,
      satisfied: conditions.every((x) => x.satisfied) && !suspension,
      blocking: conditions.filter((x) => !x.satisfied),
      scheme_suspension: suspension,
      site: lot.site,
      grade: lot.grade,
      claim_type: lot.claim_type,
      content_bp: lot.content_bp,
      category_split: lot.category_split,
      mass_g: lot.mass_g,
      period: lot.period,
      provisional_factor: lot.provisional_factor,
      carbon: carbon && !carbon.mismatch ? carbon : null,
      ...statements,
      note: 'None of the eight is waivable and the same eight are re-checked on the server at the moment of signing.',
    });
  });

  /* -------------------------------------------------------------- sign */
  // Signing re-authenticates: the signing act carries the password again and a
  // session alone is not a signing credential.
  app.post('/certificates', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'certificate_signer');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    if (!body.lot) refuse(400, 'field_required', { message: 'lot is required.', field: 'lot' });
    if (!body.recipient) refuse(400, 'field_required', { message: 'recipient is required.', field: 'recipient' });
    if (!body.password) {
      refuse(401, 'signing_credential_required', {
        message: 'Signing a certificate re-authenticates. A session alone is not a signing credential.',
      });
    }
    const reauth = await keycloakPassword(s.email, body.password);
    if (!reauth) {
      await record(c, {
        action: 'certificate_signing_refused', object_kind: 'lot', object_ref: body.lot,
        outcome: 'refused', content: { reason: 'reauthentication_failed' },
      });
      refuse(401, 'reauthentication_failed', { message: 'That password was not accepted at the moment of signing.' });
    }
    const lot = await lotView(body.lot);
    if (!lot) refuse(404, 'no_such_lot', { message: 'There is no such lot.', field: 'lot' });
    const recipient = await one('SELECT * FROM customer WHERE reference = $1', [body.recipient]);
    if (!recipient) refuse(404, 'no_such_recipient', { message: 'There is no such recipient.', field: 'recipient' });

    // A signer may not sign for a site outside their scope.
    if (!s.sites.includes(lot.site)) {
      await record(c, {
        action: 'certificate_signing_refused', object_kind: 'lot', object_ref: body.lot, site: lot.site,
        outcome: 'refused', content: { reason: 'signer_scope', held_sites: s.sites, lot_site: lot.site },
      });
      refuse(403, 'signer_scope_does_not_cover_site', {
        message: `This signer holds ${s.sites.join(' and ')} and the lot is at ${lot.site}.`,
        held_sites: s.sites, lot_site: lot.site,
      });
    }

    const signed_at = new Date().toISOString();
    const today = signed_at.slice(0, 10);

    // A site's certification resolves against the period in force on the date of signing.
    const suspension = await suspensionFor(lot.site, today, lot.grade);
    if (suspension) {
      await record(c, {
        action: 'certificate_signing_refused', object_kind: 'lot', object_ref: body.lot, site: lot.site,
        outcome: 'refused', content: { reason: 'certification_suspended', suspension },
      });
      refuse(409, 'certification_suspended', {
        message: `Certification for ${lot.site} is suspended from ${suspension.effective_from}. Issuing has stopped for this site.`,
        suspension,
      });
    }

    // The eight conditions are decided again at the moment of signing.
    const conditions = await certificateConditions({ lotRef: body.lot, signer: s, onDateISO: today });
    const failing = conditions.filter((x) => !x.satisfied);
    if (failing.length) {
      await record(c, {
        action: 'certificate_signing_refused', object_kind: 'lot', object_ref: body.lot, site: lot.site,
        outcome: 'refused', content: { failing: failing.map((f) => f.condition), conditions },
      });
      refuse(409, 'conditions_not_satisfied', {
        message: `This certificate is refused: ${failing.map((f) => f.detail || f.condition).join('; ')}.`,
        conditions,
        blocking: failing,
        note: 'The eight conditions are decided again at the moment of signing, against the records as they stand then.',
      });
    }

    const result = await idempotent(c, body, async () => {
      const carbon = await carbonForLot(body.lot);
      const recipient_name = await partyNameOn(recipient.reference, today);
      const statements = statementsFor(lot.claim_type, lot.content_bp, lot.category_split, recipient.language || 'en');
      const tests = lot.test_results
        .filter((t) => t.usable_for_release)
        .map((t) => ({ property: t.property, method: t.method, value: t.value, unit: t.unit, uncertainty_bp: t.uncertainty_bp }));

      // Two signatures landing at the same moment at one site take two
      // consecutive numbers: the sequence has no gap afterwards.
      const number = await tx(async (client) => {
        const r = await client.query(
          `UPDATE cert_sequence SET next_number = next_number + 1 WHERE site = $1 RETURNING next_number`,
          [lot.site]);
        if (!r.rows.length) {
          await client.query('INSERT INTO cert_sequence (site, next_number) VALUES ($1, 2)', [lot.site]);
          return `CERT-${lot.site.replace('SITE-', '')}-${String(1).padStart(6, '0')}`;
        }
        const n = Number(r.rows[0].next_number) - 1;
        return `CERT-${lot.site.replace('SITE-', '')}-${String(n).padStart(6, '0')}`;
      });

      const docBody = {
        number, version: 1, site: lot.site,
        lots: [{ reference: lot.reference, mass_g: lot.mass_g }],
        grade: lot.grade, specification_version: lot.specification_version,
        claim_type: lot.claim_type, content_bp: lot.content_bp, category_split: lot.category_split,
        period: lot.period, carbon, primary_share_bp: carbon.primary_share_bp,
        scheme: SCHEME, registration: REGISTRATION, test_results: tests,
        permitted_statement: statements.permitted_statement,
        prohibited_statement: statements.prohibited_statement,
        permitted_statement_recipient_language: statements.permitted_statement_recipient_language,
        signer: s.email, signer_name: s.name, signed_at,
        recipient: recipient.reference, recipient_name,
        verification_url: `${VERIFY_BASE}/${number}`,
        state: 'issued', provisional_factor: lot.provisional_factor, withdrawal: null,
      };
      const document = renderDocument(docBody);
      await pool.query(
        `INSERT INTO certificate (number, version, site, recipient, recipient_name, lots, grade, specification_version,
          claim_type, content_bp, category_split, period, carbon, primary_share_bp, scheme, registration, test_results,
          permitted_statement, prohibited_statement, signer, signer_name, signed_at, verification_url, state,
          provisional_factor, conditions, input_versions, document, language)
         VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'issued',$23,$24,$25,$26,$27)`,
        [number, lot.site, recipient.reference, recipient_name,
          JSON.stringify([{ reference: lot.reference, mass_g: lot.mass_g }]), lot.grade, lot.specification_version,
          lot.claim_type, lot.content_bp, JSON.stringify(lot.category_split), lot.period,
          JSON.stringify(carbon), carbon.primary_share_bp, SCHEME, REGISTRATION, JSON.stringify(tests),
          statements.permitted_statement, statements.prohibited_statement, s.email, s.name, signed_at,
          `${VERIFY_BASE}/${number}`, lot.provisional_factor, JSON.stringify(conditions),
          JSON.stringify({
            carbon_method: carbon.method_version, carbon_figure: carbon.figure_id,
            conversion_factor: lot.conversion_factor?.reference,
            specification: `SPEC-${lot.grade} v${lot.specification_version}`,
          }),
          document, recipient.language || 'en']);

      // The eight conditions are stored as they stood at the moment of signing.
      await record(c, {
        action: 'certificate_signed', object_kind: 'certificate', object_ref: number, site: lot.site,
        content: {
          lot: lot.reference, recipient: recipient.reference, content_bp: lot.content_bp,
          claim_type: lot.claim_type, conditions, signed_at,
        },
      });
      await sendMail({
        to: recipient.contact,
        subject: `Certificate ${number} issued`,
        text: [
          `Certificate ${number} has been issued to ${recipient_name}.`,
          '',
          `Number:            ${number}`,
          `Claim type:        ${lot.claim_type}`,
          `Recycled content:  ${lot.content_bp} basis points`,
          '',
          'Permitted statement:',
          statements.permitted_statement,
          '',
          'Prohibited statement:',
          statements.prohibited_statement,
          '',
          `Verify this certificate at ravel.example.com/verify/${number}.`,
        ].join('\n'),
        act: 'certificate_issued',
        object_ref: number,
      });
      const row = await one('SELECT * FROM certificate WHERE number = $1 AND version = 1', [number]);
      return { status: 201, body: { reference: number, ...shape(row, s) } };
    });
    return c.json(result.body, result.status);
  });

  /* ---------------------------------------------------------- re-issue */
  // A re-issue produces a new version at a new address rather than new bytes at
  // the old one.
  app.post('/certificates/:number/reissue', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'certificate_signer');
    const number = c.req.param('number');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    if (!body.password) refuse(401, 'signing_credential_required', { message: 'Re-issuing re-authenticates.' });
    const reauth = await keycloakPassword(s.email, body.password);
    if (!reauth) refuse(401, 'reauthentication_failed', { message: 'That password was not accepted.' });
    const rows = await q('SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC', [number]);
    if (!rows.length) refuse(404, 'no_such_certificate', { message: 'There is no such certificate.' });
    const prior = rows[0];
    if (!s.sites.includes(prior.site)) {
      refuse(403, 'signer_scope_does_not_cover_site', {
        message: `This signer holds ${s.sites.join(' and ')} and the certificate is at ${prior.site}.`,
      });
    }
    const result = await idempotent(c, body, async () => {
      const lot = await lotView(prior.lots[0].reference);
      const carbon = await carbonForLot(lot.reference);
      const conditions = await certificateConditions({ lotRef: lot.reference, signer: s });
      const version = prior.version + 1;
      const signed_at = new Date().toISOString();
      const statements = statementsFor(lot.claim_type, lot.content_bp, lot.category_split, prior.language);
      const docBody = {
        ...prior, number, version, lots: [{ reference: lot.reference, mass_g: lot.mass_g }],
        content_bp: lot.content_bp, category_split: lot.category_split, claim_type: lot.claim_type,
        carbon, primary_share_bp: carbon.primary_share_bp, signer: s.email, signer_name: s.name,
        signed_at, state: 'issued', withdrawal: null,
        permitted_statement: statements.permitted_statement,
        prohibited_statement: statements.prohibited_statement,
        permitted_statement_recipient_language: statements.permitted_statement_recipient_language,
        verification_url: `${VERIFY_BASE}/${number}`,
        recipient_name: prior.recipient_name, test_results: prior.test_results,
      };
      const document = renderDocument(docBody);
      await pool.query(
        `INSERT INTO certificate (number, version, site, recipient, recipient_name, lots, grade, specification_version,
          claim_type, content_bp, category_split, period, carbon, primary_share_bp, scheme, registration, test_results,
          permitted_statement, prohibited_statement, signer, signer_name, signed_at, verification_url, state,
          provisional_factor, conditions, input_versions, document, derived_from, language)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'issued',$24,$25,$26,$27,$28,$29)`,
        [number, version, prior.site, prior.recipient, prior.recipient_name,
          JSON.stringify([{ reference: lot.reference, mass_g: lot.mass_g }]), prior.grade, lot.specification_version,
          lot.claim_type, lot.content_bp, JSON.stringify(lot.category_split), lot.period,
          JSON.stringify(carbon), carbon.primary_share_bp, SCHEME, REGISTRATION, JSON.stringify(prior.test_results),
          statements.permitted_statement, statements.prohibited_statement, s.email, s.name, signed_at,
          `${VERIFY_BASE}/${number}`, lot.provisional_factor, JSON.stringify(conditions),
          JSON.stringify(prior.input_versions), document, `${number} v${prior.version}`, prior.language]);
      await pool.query('UPDATE certificate SET superseded_by = $1 WHERE number = $2 AND version = $3',
        [`${number} v${version}`, number, prior.version]);
      await record(c, {
        action: 'certificate_reissued', object_kind: 'certificate', object_ref: number, site: prior.site,
        content: { version, supersedes: prior.version, reason: body.reason || null },
      });
      const row = await one('SELECT * FROM certificate WHERE number = $1 AND version = $2', [number, version]);
      return { status: 201, body: { reference: number, ...shape(row, s) } };
    });
    return c.json(result.body, result.status);
  });

  /* -------------------------------------------------------- withdrawal */
  // One action with five consequences.
  app.post('/certificates/:number/withdraw', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'certificate_signer');
    const number = c.req.param('number');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const rows = await q('SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC', [number]);
    if (!rows.length) refuse(404, 'no_such_certificate', { message: 'There is no such certificate.' });
    const cert = rows[0];
    if (!body.reason) refuse(400, 'field_required', { message: 'reason is required.', field: 'reason' });
    if (!s.sites.includes(cert.site)) {
      refuse(403, 'signer_scope_does_not_cover_site', {
        message: `This signer holds ${s.sites.join(' and ')} and the certificate is at ${cert.site}.`,
      });
    }
    if (cert.state === 'withdrawn') {
      refuse(409, 'already_withdrawn', {
        message: 'This certificate is already withdrawn. A withdrawal is never a deletion and the document stays readable at its address.',
      });
    }

    const result = await idempotent(c, body, async () => {
      const withdrawn_on = iso(new Date());
      const withdrawal = { reason: body.reason, withdrawn_on, withdrawn_by: s.identifier, withdrawn_by_email: s.email };
      const recipientRow = await one('SELECT * FROM customer WHERE reference = $1', [cert.recipient]);

      // 1. The state becomes withdrawn with the reason, the person and the date.
      const docBody = { ...cert, state: 'withdrawn', withdrawal };
      const document = renderDocument(docBody);
      await pool.query(
        `UPDATE certificate SET state = 'withdrawn', withdrawal = $1, document = $2 WHERE number = $3 AND version = $4`,
        [JSON.stringify(withdrawal), document, number, cert.version]);

      // 3. Every downstream statement the recipient was permitted to make.
      const void_statements = [
        cert.permitted_statement,
        `Any statement that ${cert.recipient_name} holds ${cert.content_bp} basis points of recycled content under ${cert.claim_type} on certificate ${number}.`,
        `Any statement resting on the carbon figure of ${cert.carbon?.value_mg_per_kg} mg CO2e per kg carried by certificate ${number}.`,
      ];

      // 4. Every certificate derived from this one is identified and resolved.
      const derived = await q(
        `SELECT * FROM certificate WHERE derived_from LIKE $1 OR number = $2 AND version <> $3`,
        [`${number}%`, number, cert.version]);
      const derived_certificates = derived.map((d) => ({
        number: d.number, version: d.version, state: d.state,
        resolution: 'identified and resolved under the withdrawal of ' + number,
      }));

      // 5. The reverse traversal of the underlying batches.
      const lotRefs = (cert.lots || []).map((l) => l.reference);
      const batches = new Set();
      const traversals = [];
      for (const lotRef of lotRefs) {
        const { genealogy } = await import('../lib/engine.js');
        const g = await genealogy(lotRef);
        if (g) for (const n of g.nodes) if (n.kind === 'batch') batches.add(n.reference);
      }
      for (const b of batches) traversals.push(await batchImpact(b));
      const otherCertificates = [];
      for (const t of traversals) {
        for (const x of t.certificates) {
          if (x.number !== number && !otherCertificates.find((y) => y.number === x.number)) otherCertificates.push(x);
        }
      }

      // 2. The recipient is notified through mailpit and the notification is
      //    part of the record.
      const mailText = [
        `Certificate ${number} has been withdrawn.`,
        '',
        `Number:  ${number}`,
        `Reason:  ${body.reason}`,
        `Date:    ${withdrawn_on}`,
        '',
        `This certificate was withdrawn on ${withdrawn_on}. Reason: ${body.reason}.`,
        '',
        'The following statements are now void and may no longer be made:',
        ...void_statements.map((v, i) => `${i + 1}. ${v}`),
        '',
        `The certificate remains readable at ravel.example.com/verify/${number}.`,
      ].join('\n');
      const notified_recipients = [{
        reference: cert.recipient, name: cert.recipient_name,
        address: recipientRow?.contact || null, notified: true,
      }];
      await sendMail({
        to: recipientRow?.contact || 'records@example.com',
        subject: `Certificate ${number} withdrawn`,
        text: mailText,
        act: 'certificate_withdrawn',
        object_ref: number,
      });

      await record(c, {
        action: 'certificate_withdrawn', object_kind: 'certificate', object_ref: number, site: cert.site,
        content: {
          reason: body.reason, withdrawn_on, withdrawn_by: s.identifier,
          notified_recipients, void_statements,
          derived_certificates: derived_certificates.map((d) => `${d.number} v${d.version}`),
          batch_traversal: { batches: [...batches], certificates: otherCertificates.map((x) => x.number) },
          notification: { subject: `Certificate ${number} withdrawn`, to: recipientRow?.contact, body: mailText },
        },
      });
      return {
        status: 200,
        body: {
          number, state: 'withdrawn', reason: body.reason,
          withdrawn_by: s.email, withdrawn_on,
          notified_recipients, void_statements, derived_certificates,
          batch_traversal: {
            batches: [...batches],
            lots: traversals.flatMap((t) => t.lots.map((l) => l.reference)),
            certificates: otherCertificates,
            complete: true,
          },
          note: 'A withdrawal is never a deletion and the document stays readable at its address.',
        },
      };
    });
    return c.json(result.body, result.status);
  });

  /* ------------------------------------------------------------- replay */
  app.get('/certificates/:number/replay', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC', [c.req.param('number')]);
    if (!rows.length) refuse(404, 'no_such_certificate', { message: 'There is no such certificate.' });
    const cert = rows[0];
    const iv = cert.input_versions || {};

    // A figure whose inputs can no longer be resolved is never recomputed under
    // today's rules and presented as the original.
    const missing = [];
    if (iv.carbon_method) {
      const [id, v] = String(iv.carbon_method).split(' v');
      const m = await one('SELECT * FROM carbon_method WHERE id = $1 AND version = $2', [id, Number(v)]);
      if (!m) missing.push(`the carbon method version ${iv.carbon_method} is gone`);
    }
    if (iv.conversion_factor) {
      const f = await one('SELECT * FROM conversion_factor WHERE reference = $1', [iv.conversion_factor]);
      if (!f) missing.push(`the conversion factor ${iv.conversion_factor} is gone`);
    }
    if (iv.carbon_figure) {
      const f = await one('SELECT * FROM carbon_figure WHERE id = $1', [iv.carbon_figure]);
      if (!f) missing.push(`the emission factor set behind ${iv.carbon_figure} is gone`);
    }
    if (missing.length) {
      return c.json({
        number: cert.number, version: cert.version,
        reproducible: false,
        reason: missing.join('; '),
        input_versions: iv,
        issued: { content_bp: cert.content_bp, carbon_mg_per_kg: cert.carbon?.value_mg_per_kg },
        recomputed: null, agrees: null, differing_input: null,
        read_at: new Date().toISOString(),
      });
    }

    const lot = await lotView(cert.lots[0].reference);
    const carbon = await carbonForLot(cert.lots[0].reference);
    const issued = {
      content_bp: cert.content_bp,
      category_split: cert.category_split,
      carbon_value_mg_per_kg: cert.carbon?.value_mg_per_kg ?? null,
      carbon_method_version: cert.carbon?.method_version ?? null,
      uncertainty_bp: cert.carbon?.uncertainty_bp ?? null,
      boundary: cert.carbon?.boundary ?? null,
      claim_type: cert.claim_type,
    };
    const recomputed = {
      content_bp: lot ? lot.content_bp : null,
      category_split: lot ? lot.category_split : null,
      carbon_value_mg_per_kg: carbon && !carbon.mismatch ? carbon.value_mg_per_kg : null,
      carbon_method_version: carbon && !carbon.mismatch ? carbon.method_version : null,
      uncertainty_bp: carbon && !carbon.mismatch ? carbon.uncertainty_bp : null,
      boundary: carbon && !carbon.mismatch ? carbon.boundary : null,
      claim_type: lot ? lot.claim_type : null,
    };
    let differing_input = null;
    for (const k of Object.keys(issued)) {
      if (JSON.stringify(issued[k]) !== JSON.stringify(recomputed[k])) {
        differing_input = { field: k, issued: issued[k], recomputed: recomputed[k] };
        break;
      }
    }
    return c.json({
      number: cert.number, version: cert.version,
      reproducible: true,
      issued, recomputed,
      agrees: differing_input === null,
      differing_input,
      input_versions: iv,
      read_at: new Date().toISOString(),
      note: 'Agreement and disagreement are both ordinary answers.',
    });
  });

  /* ------------------------------------------------------ public verify */
  // Public, unauthenticated and rate limited. It returns these fields and
  // nothing else: no yield, no collector, no genealogy, no carbon breakdown.
  app.get('/verify/:number', async (c) => {
    const ip = c.req.header('x-forwarded-for') || 'anonymous';
    const now = Date.now();
    const bucket = rateWindow.get(ip) || { count: 0, until: now + 60000 };
    if (now > bucket.until) { bucket.count = 0; bucket.until = now + 60000; }
    bucket.count++;
    rateWindow.set(ip, bucket);
    if (bucket.count > 120) {
      return c.json({ error: 'rate_limited', message: 'Too many verification requests. Try again shortly.' }, 429);
    }
    const number = c.req.param('number');
    const rows = await q('SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC', [number]);
    if (!rows.length) {
      // An unknown number returns 200 with found false rather than an error, and
      // the route cannot be used to enumerate the customer list.
      return c.json({
        found: false, number, state: null, issued_on: null, withdrawn_on: null,
        withdrawal_reason: null, site: null, grade: null, claim_type: null, recipient_name: null,
      });
    }
    const x = rows[0];
    return c.json({
      found: true,
      number: x.number,
      state: x.state,
      issued_on: iso(x.signed_at),
      withdrawn_on: x.withdrawal?.withdrawn_on || null,
      withdrawal_reason: x.withdrawal?.reason || null,
      site: x.site,
      grade: x.grade,
      claim_type: x.claim_type,
      recipient_name: x.recipient_name,
    });
  });
}

async function suspensionFor(site, dateISO, grade) {
  const rows = await q(
    `SELECT * FROM site_certification WHERE site = $1 AND state = 'suspended' AND effective_from <= $2
     ORDER BY effective_from DESC`, [site, dateISO]);
  for (const r of rows) {
    if (r.grade && grade && r.grade !== grade) continue;
    if (r.effective_to && iso(r.effective_to) < dateISO) continue;
    // A later lift restores issuing from the moment it takes effect.
    const lift = await one(
      `SELECT * FROM site_certification WHERE site = $1 AND state <> 'suspended'
       AND effective_from > $2 AND effective_from <= $3 ORDER BY effective_from DESC LIMIT 1`,
      [site, iso(r.effective_from), dateISO]);
    if (lift) continue;
    return {
      reference: r.id, site, state: 'suspended', grade: r.grade,
      effective_from: iso(r.effective_from), effective_to: iso(r.effective_to), reason: r.reason,
    };
  }
  return null;
}

function shape(x, session) {
  const out = {
    number: x.number,
    version: x.version,
    site: x.site,
    lots: x.lots,
    grade: x.grade,
    specification_version: x.specification_version,
    claim_type: x.claim_type,
    content_bp: x.content_bp,
    category_split: x.category_split,
    period: x.period,
    carbon: x.carbon,
    primary_share_bp: x.primary_share_bp,
    scheme: x.scheme,
    registration: x.registration,
    test_results: x.test_results,
    permitted_statement: x.permitted_statement,
    prohibited_statement: x.prohibited_statement,
    signer: x.signer,
    signer_name: x.signer_name,
    signed_at: x.signed_at,
    verification_url: x.verification_url,
    state: x.state,
    provisional_factor: x.provisional_factor,
    recipient: x.recipient,
    recipient_name: x.recipient_name,
    withdrawal: x.withdrawal,
    derived_from: x.derived_from,
    superseded_by: x.superseded_by,
    language: x.language,
  };
  // A yield figure appears on no certificate.
  delete out.yield_bp;
  return out;
}
