import { Hono } from 'hono';
import { q, one, tx } from '../db.js';
import { append } from '../record.js';
import { withIdempotency, ok, requireRole, requireSession, refusePagination } from '../http.js';
import { evaluateConditions, carbonForLot, lotClaim, batchImpact, partyNameOn, genealogy, iso, readAt } from '../engine.js';
import { statements, renderDocument, voidStatements } from '../certificate.js';
import { verifyPassword } from '../auth.js';
import { certificateIssued, certificateWithdrawn } from '../mail.js';
import { hasRole } from '../auth.js';

export const certificates = new Hono();

const SCHEME = 'RCS-2026';
const REGISTRATION = 'REG-RAVEL-0042';
const VERIFY_BASE = 'https://ravel.example.com/verify';

function certPayload(row) {
  return {
    number: row.number, version: row.version, site: row.site, lots: row.lots,
    recipient: row.recipient, recipient_name: row.recipient_name, grade: row.grade,
    specification_version: row.specification_version, claim_type: row.claim_type,
    content_bp: row.content_bp, category_split: row.category_split, period: row.period,
    carbon: row.carbon, primary_share_bp: row.primary_share_bp, scheme: row.scheme,
    registration: row.registration, test_results: row.test_results,
    permitted_statement: row.permitted_statement, prohibited_statement: row.prohibited_statement,
    signer: row.signer, signer_name: row.signer_name, signed_at: row.signed_at,
    verification_url: row.verification_url, state: row.state,
    provisional_factor: row.provisional_factor,
    conditions: row.conditions, input_versions: row.input_versions,
    derived_from: row.derived_from, withdrawal: row.withdrawal
  };
}

certificates.get('/certificates', async (c) => {
  const bad = refusePagination(c); if (bad) return bad;
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT * FROM certificate ORDER BY signed_at ASC');
  return c.json(rows.map(certPayload));
});

certificates.get('/certificates/:number', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const number = c.req.param('number');
  const version = c.req.query('version');
  const row = version
    ? await one('SELECT * FROM certificate WHERE number = $1 AND version = $2', [number, Number(version)])
    : await one('SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC LIMIT 1', [number]);
  if (!row) return c.json({ error: 'not_found' }, 404);
  const payload = certPayload(row);
  // A deviation travels with every lot it touches and appears on the internal view.
  const lotRefs = (row.lots || []).map((l) => l.reference);
  const devs = lotRefs.length
    ? await q(`SELECT reference, state, description, outcome FROM deviation WHERE lots ?| $1`, [lotRefs])
    : [];
  const overrides = lotRefs.length
    ? await q('SELECT reference, separation, reviewed, authorised_by FROM separation_override WHERE lot = ANY($1)', [lotRefs])
    : [];
  return c.json({ ...payload, deviations: devs, overrides, read_at: readAt() });
});

/** The document as plain text, byte-stable across reads. */
certificates.get('/certificates/:number/document', async (c) => {
  const number = c.req.param('number');
  const version = c.req.query('version');
  const row = version
    ? await one('SELECT document FROM certificate WHERE number = $1 AND version = $2', [number, Number(version)])
    : await one('SELECT document FROM certificate WHERE number = $1 ORDER BY version DESC LIMIT 1', [number]);
  if (!row) return c.text('No such certificate.\n', 404, { 'content-type': 'text/plain; charset=utf-8' });
  return c.text(row.document, 200, { 'content-type': 'text/plain; charset=utf-8' });
});

/** The eight conditions, checked on the server, none waivable. */
certificates.post('/certificates/preview', async (c) => {
  const auth = await requireSession(c);
  if (auth.error) return auth.error;
  const body = await c.req.json().catch(() => ({}));
  if (!body.lot) return c.json({ error: 'missing_field', field: 'lot' }, 400);
  const conditions = await evaluateConditions({
    lot: body.lot, signerEmail: auth.session.email, signerSites: auth.session.sites
  });
  const lot = await one('SELECT * FROM lot WHERE reference = $1', [body.lot]);
  let claim = null; let carbon = null;
  if (lot) {
    claim = await lotClaim(body.lot);
    try { carbon = await carbonForLot(body.lot, { internal: true }); } catch { carbon = null; }
  }
  let preview = null;
  if (lot && claim) {
    const recipient = body.recipient
      ? await one('SELECT * FROM customer WHERE reference = $1', [body.recipient])
      : null;
    const st = statements({
      claim_type: lot.claim_type, content_bp: claim.content_bp,
      category_split: claim.category_split, grade: lot.grade,
      language: recipient?.language || 'en'
    });
    const stOther = statements({
      claim_type: lot.claim_type, content_bp: claim.content_bp,
      category_split: claim.category_split, grade: lot.grade,
      language: (recipient?.language || 'en') === 'en' ? 'fr' : 'en'
    });
    const factor = await one(
      `SELECT provisional FROM conversion_factor WHERE site = $1 ORDER BY published_on DESC LIMIT 1`, [lot.site]
    );
    preview = {
      lot: lot.reference, site: lot.site, grade: lot.grade, mass_g: lot.mass_g,
      claim_type: lot.claim_type, content_bp: claim.content_bp,
      category_split: claim.category_split,
      carbon, provisional_factor: !!factor?.provisional,
      recipient: body.recipient || null,
      recipient_name: recipient ? await partyNameOn(recipient.reference, new Date().toISOString().slice(0, 10)) : null,
      ...st,
      counterpart_statement: stOther.permitted_statement,
      counterpart_language: (recipient?.language || 'en') === 'en' ? 'fr' : 'en'
    };
  }
  return c.json({
    lot: body.lot, recipient: body.recipient || null,
    conditions,
    all_satisfied: conditions.every((x) => x.satisfied),
    preview,
    read_at: readAt(),
    note: 'None of the eight is waivable and the same eight are re-checked at the moment of signing.'
  });
});

/** Signing re-authenticates: a session alone is not a signing credential. */
certificates.post('/certificates', async (c) => {
  const auth = await requireRole(c, 'certificate_signer');
  if (auth.error) return auth.error;
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, 'POST /api/certificates', body, async () => {
    if (!body.lot || !body.recipient) {
      return ok({ error: 'missing_field', required: ['lot', 'recipient'] }, 400);
    }
    if (!body.password) {
      return ok({
        error: 'reauthentication_required',
        rule: 'The signing act carries the password again. A session alone is not a signing credential.'
      }, 401);
    }
    const check = await verifyPassword(auth.session.email, body.password);
    if (!check.ok) {
      await append(null, {
        act: 'certificate_signing_refused', person: auth.session.email,
        object_kind: 'lot', object_ref: body.lot, outcome: 'refused',
        content: { reason: 'reauthentication_failed' }
      });
      return ok({ error: 'reauthentication_failed', rule: 'The signing act carries the password again.' }, 401);
    }

    const lot = await one('SELECT * FROM lot WHERE reference = $1', [body.lot]);
    if (!lot) return ok({ error: 'unknown_lot', lot: body.lot }, 404);
    const recipient = await one('SELECT * FROM customer WHERE reference = $1', [body.recipient]);
    if (!recipient) return ok({ error: 'unknown_recipient', recipient: body.recipient }, 404);

    // The eight conditions are decided again at the moment of signing, against the records
    // as they stand then rather than as they stood at the preview.
    const conditions = await evaluateConditions({
      lot: body.lot, signerEmail: auth.session.email, signerSites: auth.session.sites,
      onDate: new Date()
    });
    const failed = conditions.filter((x) => !x.satisfied);
    if (failed.length) {
      await append(null, {
        act: 'certificate_signing_refused', person: auth.session.email, site: lot.site,
        object_kind: 'lot', object_ref: body.lot, outcome: 'refused',
        content: { failed_conditions: failed.map((f) => f.condition) }
      });
      return ok({
        error: 'conditions_not_satisfied',
        conditions,
        failed_conditions: failed,
        rule: 'None of the eight conditions is waivable, and they are decided again at the moment of signing.'
      }, 409);
    }

    const claim = await lotClaim(body.lot);
    const carbonFigure = await carbonForLot(body.lot, { internal: true });
    const factor = await one(
      `SELECT reference, provisional FROM conversion_factor WHERE site = $1 ORDER BY published_on DESC LIMIT 1`, [lot.site]
    );
    const period = await one(
      `SELECT id FROM balance_period WHERE site = $1 AND grade = $2 AND $3 BETWEEN period_from AND period_to ORDER BY period_from DESC LIMIT 1`,
      [lot.site, lot.grade, iso(lot.produced_on)]
    );
    const tests = await q(
      `SELECT property, method, value, unit, uncertainty_bp FROM test_result
        WHERE subject_ref = $1 AND usable_for_release = true ORDER BY entered_at`,
      [body.lot]
    );
    const signedAt = new Date().toISOString();
    const recipientName = await partyNameOn(recipient.reference, signedAt.slice(0, 10));
    const st = statements({
      claim_type: lot.claim_type, content_bp: claim.content_bp,
      category_split: claim.category_split, grade: lot.grade, language: recipient.language
    });

    // The number is issued from a gapless per-site sequence and is never reused. Two
    // signatures at one site take two consecutive numbers with no gap afterwards.
    const issued = await tx(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`certseq:${lot.site}`]);
      // next_number is the number this signature takes; the row then advances by one, so the
      // sequence is gapless and no number is issued twice.
      await client.query(
        `INSERT INTO certificate_sequence (site, next_number) VALUES ($1, 1) ON CONFLICT (site) DO NOTHING`,
        [lot.site]
      );
      const seq = (await client.query(
        `UPDATE certificate_sequence SET next_number = next_number + 1 WHERE site = $1
         RETURNING next_number - 1 AS issued`, [lot.site]
      )).rows[0];
      const n = seq.issued;
      const number = `CERT-${lot.site.replace('SITE-', '')}-${String(n).padStart(6, '0')}`;
      const certCarbon = {
        figure_id: carbonFigure.figure_id,
        value_mg_per_kg: carbonFigure.value_mg_per_kg,
        boundary: carbonFigure.boundary,
        method_version: carbonFigure.method_version,
        uncertainty_bp: carbonFigure.uncertainty_bp,
        comparator: carbonFigure.comparator,
        energy_location_mg_per_kg: carbonFigure.energy_location_mg_per_kg,
        energy_market_mg_per_kg: carbonFigure.energy_market_mg_per_kg,
        metered_kwh: carbonFigure.metered_kwh,
        retired_kwh: carbonFigure.retired_kwh,
        unmatched_kwh: carbonFigure.unmatched_kwh
      };
      const base = {
        number, version: 1, site: lot.site,
        lots: [{ reference: lot.reference, mass_g: lot.mass_g }],
        recipient: recipient.reference, recipient_name: recipientName,
        grade: lot.grade, specification_version: lot.specification_version || 3,
        claim_type: lot.claim_type, content_bp: claim.content_bp,
        category_split: claim.category_split, period: period?.id || '',
        carbon: certCarbon, primary_share_bp: carbonFigure.primary_share_bp,
        scheme: SCHEME, registration: REGISTRATION, test_results: tests,
        signer: auth.session.email, signer_name: auth.session.name,
        signed_at: signedAt, verification_url: `${VERIFY_BASE}/${number}`,
        state: 'issued', provisional_factor: !!factor?.provisional,
        withdrawal: null, ...st
      };
      const document = renderDocument(base);
      const input_versions = {
        carbon_method: carbonFigure.method_version,
        conversion_factor: factor?.reference,
        specification: `SPEC-${lot.grade} v${lot.specification_version || 3}`,
        emission_factor_set: carbonFigure.comparator?.dataset,
        balance_period: period?.id
      };
      await client.query(
        `INSERT INTO certificate (number, version, site, lots, recipient, recipient_name, grade,
          specification_version, claim_type, content_bp, category_split, period, carbon, primary_share_bp,
          scheme, registration, test_results, permitted_statement, prohibited_statement, signer, signer_name,
          signed_at, verification_url, state, provisional_factor, conditions, input_versions, document)
         VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'issued',$23,$24,$25,$26)`,
        [number, lot.site, JSON.stringify(base.lots), recipient.reference, recipientName, lot.grade,
          base.specification_version, lot.claim_type, claim.content_bp, JSON.stringify(claim.category_split),
          period?.id || '', JSON.stringify(certCarbon), carbonFigure.primary_share_bp, SCHEME, REGISTRATION,
          JSON.stringify(tests), st.permitted_statement, st.prohibited_statement,
          auth.session.email, auth.session.name, signedAt, `${VERIFY_BASE}/${number}`,
          !!factor?.provisional,
          // The eight conditions are stored as they stood at the moment of signing and are
          // never recomputed on read.
          JSON.stringify(conditions), JSON.stringify(input_versions), document]
      );
      return { ...base, input_versions, conditions };
    });

    let mail = null;
    try {
      mail = await certificateIssued({ ...issued, recipient_contact: recipient.contact });
    } catch (err) { mail = { error: String(err.message) }; }

    await append(null, {
      act: 'certificate_signed', person: auth.session.email, site: lot.site,
      object_kind: 'certificate', object_ref: issued.number,
      content: {
        recipient: recipient.reference, content_bp: issued.content_bp,
        claim_type: issued.claim_type, conditions: conditions.map((x) => ({ condition: x.condition, satisfied: x.satisfied })),
        mail
      }
    });
    return ok({ reference: issued.number, ...issued, mail }, 201);
  });
});

/** One action with five consequences. A withdrawal is never a deletion. */
certificates.post('/certificates/:number/withdraw', async (c) => {
  const auth = await requireRole(c, 'certificate_signer');
  if (auth.error) return auth.error;
  const number = c.req.param('number');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/certificates/${number}/withdraw`, body, async () => {
    const row = await one('SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC LIMIT 1', [number]);
    if (!row) return ok({ error: 'not_found' }, 404);
    if (!body.reason) return ok({ error: 'missing_field', field: 'reason' }, 400);
    if (row.state === 'withdrawn') {
      return ok({ error: 'already_withdrawn', number, rule: 'A withdrawal is a fact about a document; the remedy is a new certificate.' }, 409);
    }
    if (!auth.session.sites.includes(row.site)) {
      return ok({ error: 'outside_signing_scope', site: row.site, scope: auth.session.sites }, 403);
    }
    const withdrawnOn = new Date().toISOString().slice(0, 10);
    const withdrawal = { reason: body.reason, withdrawn_by: auth.session.email, withdrawn_on: withdrawnOn };

    // 3. Every downstream statement the recipient was permitted to make.
    const void_statements = voidStatements(certPayload(row));

    // 1. The state becomes withdrawn with the reason, the person and the date. The document
    // stays readable at its address and restates the withdrawal.
    const updated = { ...certPayload(row), state: 'withdrawn', withdrawal };
    const document = renderDocument(updated);
    await q(
      `UPDATE certificate SET state = 'withdrawn', withdrawal = $2, document = $3 WHERE number = $1 AND version = $4`,
      [number, JSON.stringify(withdrawal), document, row.version]
    );

    // 4. Every certificate derived from this one is identified and resolved.
    const derived = await q('SELECT number, version, state FROM certificate WHERE derived_from = $1', [number]);
    for (const d of derived) {
      const dRow = await one('SELECT * FROM certificate WHERE number = $1 AND version = $2', [d.number, d.version]);
      const dWithdrawal = { reason: `Derived from ${number}, which was withdrawn: ${body.reason}`, withdrawn_by: auth.session.email, withdrawn_on: withdrawnOn };
      const dDoc = renderDocument({ ...certPayload(dRow), state: 'withdrawn', withdrawal: dWithdrawal });
      await q(
        `UPDATE certificate SET state = 'withdrawn', withdrawal = $2, document = $3 WHERE number = $1 AND version = $4`,
        [d.number, JSON.stringify(dWithdrawal), dDoc, d.version]
      );
    }

    // 5. The reverse traversal of the underlying batches, so every other certificate touching
    // them is enumerated in the same action.
    const g = await genealogy((row.lots || [])[0]?.reference);
    const batchRefs = g ? g.nodes.filter((n) => n.kind === 'batch').map((n) => n.reference) : [];
    const batch_traversal = [];
    const touched = new Map();
    for (const b of batchRefs) {
      const impact = await batchImpact(b);
      batch_traversal.push({ batch: b, lots: impact.lots.map((l) => l.reference), certificates: impact.certificates.map((x) => x.number) });
      for (const cert of impact.certificates) {
        if (cert.number !== number) touched.set(cert.number, cert);
      }
    }

    // 2. The recipient is notified through mailpit and the notification is part of the record.
    const recipient = await one('SELECT contact FROM customer WHERE reference = $1', [row.recipient]);
    let mail = null;
    try {
      mail = await certificateWithdrawn(
        { ...certPayload(row), recipient_contact: recipient?.contact || `${row.recipient}@example.com` },
        body.reason, void_statements
      );
    } catch (err) { mail = { error: String(err.message) }; }

    const notified_recipients = [{ reference: row.recipient, name: row.recipient_name, contact: recipient?.contact, notified: !mail?.error }];

    await append(null, {
      act: 'certificate_withdrawn', person: auth.session.email, site: row.site,
      object_kind: 'certificate', object_ref: number,
      content: {
        reason: body.reason, notified_recipients, void_statements,
        derived_certificates: derived.map((d) => d.number),
        other_certificates_touching_the_same_batches: [...touched.keys()], mail
      }
    });

    return ok({
      number, state: 'withdrawn', reason: body.reason,
      withdrawn_by: auth.session.email, withdrawn_on: withdrawnOn,
      notified_recipients,
      void_statements,
      derived_certificates: derived.map((d) => ({ number: d.number, state: 'withdrawn', resolved: true })),
      batch_traversal,
      other_certificates_touching_the_same_batches: [...touched.values()],
      mail,
      note: 'A withdrawal is never a deletion and the document stays readable at its address.'
    }, 201);
  });
});

/** A re-issue produces a new version at a new address rather than new bytes at the old one. */
certificates.post('/certificates/:number/reissue', async (c) => {
  const auth = await requireRole(c, 'certificate_signer');
  if (auth.error) return auth.error;
  const number = c.req.param('number');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/certificates/${number}/reissue`, body, async () => {
    const row = await one('SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC LIMIT 1', [number]);
    if (!row) return ok({ error: 'not_found' }, 404);
    if (!body.password) return ok({ error: 'reauthentication_required' }, 401);
    const check = await verifyPassword(auth.session.email, body.password);
    if (!check.ok) return ok({ error: 'reauthentication_failed' }, 401);
    if (!auth.session.sites.includes(row.site)) {
      return ok({ error: 'outside_signing_scope', site: row.site, scope: auth.session.sites }, 403);
    }
    const lotRef = (row.lots || [])[0]?.reference;
    const conditions = await evaluateConditions({
      lot: lotRef, signerEmail: auth.session.email, signerSites: auth.session.sites, onDate: new Date()
    });
    const failed = conditions.filter((x) => !x.satisfied);
    if (failed.length) return ok({ error: 'conditions_not_satisfied', conditions, failed_conditions: failed }, 409);
    const version = row.version + 1;
    const signedAt = new Date().toISOString();
    const base = { ...certPayload(row), version, signed_at: signedAt, signer: auth.session.email, signer_name: auth.session.name, state: 'issued', withdrawal: null };
    const document = renderDocument(base);
    await q(
      `INSERT INTO certificate (number, version, site, lots, recipient, recipient_name, grade,
        specification_version, claim_type, content_bp, category_split, period, carbon, primary_share_bp,
        scheme, registration, test_results, permitted_statement, prohibited_statement, signer, signer_name,
        signed_at, verification_url, state, provisional_factor, conditions, input_versions, document, derived_from)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'issued',$24,$25,$26,$27,$28)`,
      [number, version, row.site, JSON.stringify(row.lots), row.recipient, row.recipient_name, row.grade,
        row.specification_version, row.claim_type, row.content_bp, JSON.stringify(row.category_split),
        row.period, JSON.stringify(row.carbon), row.primary_share_bp, row.scheme, row.registration,
        JSON.stringify(row.test_results), row.permitted_statement, row.prohibited_statement,
        auth.session.email, auth.session.name, signedAt, `${VERIFY_BASE}/${number}?version=${version}`,
        row.provisional_factor, JSON.stringify(conditions), JSON.stringify(row.input_versions), document, number]
    );
    await append(null, {
      act: 'certificate_reissued', person: auth.session.email, site: row.site,
      object_kind: 'certificate', object_ref: `${number} v${version}`, content: { supersedes_version: row.version }
    });
    return ok({ reference: number, number, version, state: 'issued', signed_at: signedAt, verification_url: `${VERIFY_BASE}/${number}?version=${version}` }, 201);
  });
});

/**
 * Replay: recomputes from the versioned inputs recorded against the certificate. Agreement
 * and disagreement are both ordinary answers.
 */
certificates.get('/certificates/:number/replay', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const number = c.req.param('number');
  const row = await one('SELECT * FROM certificate WHERE number = $1 ORDER BY version DESC LIMIT 1', [number]);
  if (!row) return c.json({ error: 'not_found' }, 404);

  const input_versions = row.input_versions || {};
  const missing = [];
  const methodRef = String(input_versions.carbon_method || '');
  const [methodId, methodVersion] = methodRef.split(' v');
  const method = methodId
    ? await one('SELECT * FROM carbon_method WHERE id = $1 AND version = $2', [methodId, Number(methodVersion)])
    : null;
  if (!method) missing.push(`carbon method version ${methodRef}`);
  else if (method.retired) missing.push(`carbon method version ${methodRef} is retired`);
  const factor = input_versions.conversion_factor
    ? await one('SELECT * FROM conversion_factor WHERE reference = $1', [input_versions.conversion_factor])
    : null;
  if (input_versions.conversion_factor && !factor) missing.push(`conversion factor ${input_versions.conversion_factor}`);
  const figureId = row.carbon?.figure_id;
  const figure = figureId ? await one('SELECT * FROM carbon_figure WHERE id = $1', [figureId]) : null;
  if (figureId && !figure) missing.push(`carbon figure ${figureId}`);

  if (missing.length) {
    // Never recomputed under today's rules and presented as the original.
    return c.json({
      number, version: row.version,
      reproducible: false,
      reason: `The inputs can no longer be resolved: ${missing.join(', ')}.`,
      missing_inputs: missing,
      input_versions,
      issued: { content_bp: row.content_bp, carbon_value_mg_per_kg: row.carbon?.value_mg_per_kg },
      read_at: readAt()
    });
  }

  const lotRef = (row.lots || [])[0]?.reference;
  const claim = await lotClaim(lotRef);
  const recomputedContent = claim ? claim.content_bp : null;
  const recomputedCarbon = figure ? figure.breakdown.reduce((s, l) => s + l.mg_per_kg, 0) : null;

  const issued = {
    content_bp: row.content_bp,
    carbon_value_mg_per_kg: row.carbon?.value_mg_per_kg,
    uncertainty_bp: row.carbon?.uncertainty_bp,
    boundary: row.carbon?.boundary,
    method_version: row.carbon?.method_version,
    claim_type: row.claim_type
  };
  const recomputed = {
    content_bp: recomputedContent,
    carbon_value_mg_per_kg: recomputedCarbon,
    uncertainty_bp: figure?.uncertainty_bp,
    boundary: method?.boundary,
    method_version: `${method.id} v${method.version}`,
    claim_type: row.claim_type
  };
  const differing = [];
  for (const key of Object.keys(issued)) {
    if (String(issued[key]) !== String(recomputed[key])) differing.push({ input: key, issued: issued[key], recomputed: recomputed[key] });
  }

  await append(null, {
    act: 'certificate_replayed', person: auth.session.email, site: row.site,
    object_kind: 'certificate', object_ref: number,
    content: { agrees: differing.length === 0, differing_input: differing[0]?.input || null }
  });

  return c.json({
    number, version: row.version,
    reproducible: true,
    issued, recomputed,
    agrees: differing.length === 0,
    differing_input: differing.length ? differing[0] : null,
    differing_inputs: differing,
    input_versions,
    read_at: readAt(),
    note: 'Agreement and disagreement are both ordinary answers.'
  });
});
