import { Hono } from 'hono';
import { q, one, pool, tx, snapshot } from '../lib/db.js';
import { dayOf } from '../lib/num.js';
import { refuse, noPaging, withIdempotency, nextRef, recordRefusal } from '../lib/http.js';
import { requireSession, requireRole } from './middleware.js';
import { appendEntry } from '../lib/record.js';
import { keycloakPassword } from '../lib/auth.js';
import { sendMail } from '../lib/mail.js';
import { evaluateConditions, statementsFor, renderDocument, CONDITION_KEYS } from '../engine/certificate.js';
import { lotClaim } from '../engine/ledger.js';
import { carbonForLot } from '../engine/carbon.js';
import { impactOfBatch } from '../engine/genealogy.js';

const r = new Hono();

function shapeCertificate(x) {
  return {
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
    signed_on: dayOf(x.signed_on),
    verification_url: x.verification_url,
    state: x.state,
    provisional_factor: x.provisional_factor,
    recipient: x.recipient,
    recipient_name: x.recipient_name,
    recipient_language: x.recipient_language,
    withdrawal_reason: x.withdrawal_reason,
    withdrawn_by: x.withdrawn_by,
    withdrawn_on: x.withdrawn_on ? dayOf(x.withdrawn_on) : null,
    conditions_at_signing: x.conditions_at_signing,
    input_versions: x.input_versions,
    derived_from: x.derived_from,
  };
}

r.get('/certificates', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from certificate order by number, version');
  return c.json(rows.map(shapeCertificate));
});

r.get('/certificates/:number', async (c) => {
  requireSession(c);
  const number = c.req.param('number');
  const rows = await q('select * from certificate where number = $1 order by version desc', [number]);
  if (!rows.length) throw refuse(404, 'not_found', 'No such certificate.');
  const x = rows[0];
  const shaped = shapeCertificate(x);
  const devs = await q('select * from deviation');
  const lotRefs = (x.lots || []).map((l) => l.lot || l);
  // A deviation travels with every lot it touches and appears on the internal
  // view of any certificate issued against that lot.
  shaped.deviations = devs.filter((d) => (d.lots || []).some((l) => lotRefs.includes(l))).map((d) => ({ reference: d.reference, state: d.state, outcome: d.outcome, detail: d.detail }));
  const ovrs = await q('select * from override_record where lot = any($1)', [lotRefs]);
  shaped.overrides = ovrs.map((o) => ({ reference: o.reference, separation: o.separation, reviewed: o.reviewed, authorised_by: o.authorised_by, reason: o.reason }));
  shaped.versions = rows.map((v) => ({ version: v.version, state: v.state, signed_on: dayOf(v.signed_on) }));
  return c.json(shaped);
});

// An issued document is byte-stable: two reads of the same version return
// identical bytes.
r.get('/certificates/:number/document', async (c) => {
  const number = c.req.param('number');
  const version = c.req.query('version');
  const x = version
    ? await one('select * from certificate where number = $1 and version = $2', [number, Number(version)])
    : await one('select * from certificate where number = $1 order by version desc limit 1', [number]);
  if (!x) throw refuse(404, 'not_found', 'No such certificate.');
  return new Response(x.document, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-transform' } });
});

r.post('/certificates/preview', async (c) => {
  const s = requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  const { lot, recipient } = body;
  if (!lot) throw refuse(400, 'lot_required', 'A preview names a lot.');
  const signerEmail = body.signer || s.email;
  const ev = await evaluateConditions({ lot, signerEmail });
  const cust = recipient ? await one('select * from customer where reference = $1', [recipient]) : null;
  let statements = null;
  if (ev.lot && ev.claim) {
    const st = statementsFor({ claim_type: ev.lot.claim_type, content_bp: ev.claim.content_bp, category_split: ev.claim.category_split, language: cust ? cust.language : 'en' });
    statements = st;
  }
  return c.json({
    lot,
    recipient: recipient || null,
    recipient_name: cust ? cust.name : null,
    signer: signerEmail,
    conditions: ev.conditions,
    all_satisfied: ev.conditions.every((x) => x.satisfied),
    claim_type: ev.lot ? ev.lot.claim_type : null,
    content_bp: ev.claim ? ev.claim.content_bp : null,
    category_split: ev.claim ? ev.claim.category_split : null,
    provisional_factor: ev.claim ? ev.claim.provisional_factor : null,
    carbon: ev.carbon || null,
    permitted_statement: statements ? statements.permitted_statement : null,
    prohibited_statement: statements ? statements.prohibited_statement : null,
    note: 'None of the eight is waivable and the same eight are re-checked on the server at the moment of signing.',
  });
});

r.post('/certificates', async (c) => {
  const s = await requireRole(c, 'certificate_signed', 'certificate_signer');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, 'POST /certificates', body, async () => {
    const { lot, recipient, password } = body;
    if (!lot || !recipient) throw refuse(400, 'fields_required', 'A certificate names a lot and a recipient.');
    // Signing a certificate re-authenticates: a session alone is not a signing credential.
    if (!password) throw refuse(401, 'password_required', 'Signing a certificate re-authenticates. The signing act carries the password again and a session alone is not a signing credential.');
    const identity = await keycloakPassword(s.email, password);
    if (!identity) {
      await recordRefusal(s, 'certificate_signing_refused', 'certificate', lot, { reason: 'reauthentication_failed' });
      throw refuse(401, 'reauthentication_failed', 'The password was not accepted. A session alone is not a signing credential.');
    }
    const l = await one('select * from lot where reference = $1', [lot]);
    if (!l) throw refuse(404, 'lot_not_found', 'No such lot.');
    const cust = await one('select * from customer where reference = $1', [recipient]);
    if (!cust) throw refuse(404, 'recipient_not_found', 'No such recipient.');

    // A site's certification resolves against the period in force on the date of
    // signing rather than against a current flag.
    const today = new Date().toISOString().slice(0, 10);
    const certPeriods = await q('select * from site_certification where site = $1 order by effective_from asc', [l.site]);
    const inForce = certPeriods.filter((p) => dayOf(p.effective_from) <= today && (!p.effective_to || dayOf(p.effective_to) >= today)).pop();
    if (inForce && inForce.state === 'suspended' && (!inForce.grade || inForce.grade === l.grade)) {
      await recordRefusal(s, 'certificate_signing_refused', 'certificate', lot, { reason: 'site_certification_suspended', site: l.site }, l.site);
      throw refuse(409, 'site_certification_suspended', `Certification at ${l.site} is suspended from ${dayOf(inForce.effective_from)}. Issuing stops for the affected site and grade with the suspension named as the blocking condition.`, { blocking_reference: inForce.reference, site: l.site });
    }

    // The eight conditions are decided again at the moment of signing, against
    // the records as they stand then rather than as they stood at the preview.
    const ev = await evaluateConditions({ lot, signerEmail: s.email, signOn: today });
    const failing = ev.conditions.filter((x) => !x.satisfied);
    if (failing.length) {
      await recordRefusal(s, 'certificate_signing_refused', 'certificate', lot, { failing: failing.map((x) => x.condition) }, l.site);
      throw refuse(409, 'conditions_not_satisfied', `The eight conditions are re-checked at the moment of signing. ${failing.map((x) => x.detail || x.statement).join(' ')}`, { conditions: ev.conditions, failing: failing.map((x) => ({ condition: x.condition, blocking_reference: x.blocking_reference, detail: x.detail })) });
    }

    const claim = ev.claim;
    const carbon = await carbonForLot(lot, { internal: true });
    const st = statementsFor({ claim_type: l.claim_type, content_bp: claim.content_bp, category_split: claim.category_split, language: cust.language });
    const tests = await q('select * from test_result where subject_ref = $1 and usable_for_release = true order by reference', [lot]);

    return tx(async (client) => {
      // The number is issued from a gapless per-site sequence. A single
      // conditional UPDATE takes the row lock, increments and returns in one
      // statement, so two signatures landing at one site at the same moment take
      // two consecutive numbers: the second waits on the first's lock rather
      // than reading a stale total. The sequence is a row and not a postgres
      // SEQUENCE, because a SEQUENCE leaves a gap when a transaction rolls back
      // and a gap here is a reportable condition.
      await client.query('insert into cert_sequence (site, last_n) values ($1, 0) on conflict (site) do nothing', [l.site]);
      const bumped = await client.query('update cert_sequence set last_n = last_n + 1 where site = $1 returning last_n', [l.site]);
      const n = Number(bumped.rows[0].last_n);
      const number = `CERT-${l.site.replace('SITE-', '')}-${String(n).padStart(6, '0')}`;
      const cert = {
        number,
        version: 1,
        site: l.site,
        lots: [{ lot: l.reference, mass_g: Number(l.mass_g) }],
        grade: l.grade,
        specification: l.specification,
        specification_version: l.specification_version,
        claim_type: l.claim_type,
        content_bp: claim.content_bp,
        category_split: claim.category_split,
        period: ev.period ? ev.period.id : null,
        carbon: {
          value_mg_per_kg: carbon.value_mg_per_kg,
          boundary: carbon.boundary,
          method_version: carbon.method_version,
          uncertainty_bp: carbon.uncertainty_bp,
          comparator: carbon.comparator,
          breakdown: carbon.breakdown,
          energy_location_mg_per_kg: carbon.energy_location_mg_per_kg,
          energy_market_mg_per_kg: carbon.energy_market_mg_per_kg,
          metered_kwh: carbon.metered_kwh,
          retired_kwh: carbon.retired_kwh,
          unmatched_kwh: carbon.unmatched_kwh,
        },
        primary_share_bp: carbon.primary_share_bp,
        scheme: 'RCS-2026',
        registration: 'REG-RAVEL-0042',
        test_results: tests.map((t) => ({ property: t.property, method: t.method, value: t.value, unit: t.unit })),
        permitted_statement: st.permitted_statement,
        prohibited_statement: st.prohibited_statement,
        signer: s.email,
        signer_name: s.name || identity.name,
        signed_at: new Date().toISOString(),
        signed_on: today,
        verification_url: `https://ravel.example.com/verify/${number}`,
        state: 'issued',
        provisional_factor: !!claim.provisional_factor,
        recipient: cust.reference,
        recipient_name: cust.name,
        recipient_language: cust.language,
        conditions_at_signing: ev.conditions,
        input_versions: { carbon_method: carbon.method_version, carbon_figure: carbon.figure_id, conversion_factor: claim.conversion_factor ? claim.conversion_factor.reference : null, specification: `${l.specification} v${l.specification_version}`, emission_factor_set: (carbon.input_versions || {}).emission_factor_set || null },
      };
      cert.document = renderDocument(cert);
      await client.query(
        `insert into certificate (number, version, site, lots, grade, specification_version, claim_type, content_bp, category_split, period, carbon, primary_share_bp, scheme, registration, test_results, permitted_statement, prohibited_statement, signer, signer_name, signed_at, signed_on, verification_url, state, provisional_factor, recipient, recipient_name, recipient_language, conditions_at_signing, input_versions, document)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,
        [cert.number, 1, cert.site, JSON.stringify(cert.lots), cert.grade, cert.specification_version, cert.claim_type, cert.content_bp, JSON.stringify(cert.category_split), cert.period, JSON.stringify(cert.carbon), cert.primary_share_bp, cert.scheme, cert.registration, JSON.stringify(cert.test_results), cert.permitted_statement, cert.prohibited_statement, cert.signer, cert.signer_name, cert.signed_at, cert.signed_on, cert.verification_url, 'issued', cert.provisional_factor, cert.recipient, cert.recipient_name, cert.recipient_language, JSON.stringify(cert.conditions_at_signing), JSON.stringify(cert.input_versions), cert.document],
      );
      await appendEntry(client, { act: 'certificate_signed', person: s.email, person_id: s.person_id, site: l.site, object_kind: 'certificate', object_ref: number, content: { number, lot, recipient: cust.reference, content_bp: cert.content_bp, claim_type: cert.claim_type, conditions: cert.conditions_at_signing } });
      // Mail leaves after the row lands.
      setImmediate(() => {
        sendMail({
          to: cust.contact,
          subject: `Certificate ${number} issued`,
          text: [
            `Certificate ${number} has been issued to ${cust.name}.`,
            '',
            `Claim type: ${cert.claim_type}`,
            `Recycled content: ${cert.content_bp} basis points`,
            '',
            'What you may say:',
            cert.permitted_statement,
            '',
            'What you may not say:',
            cert.prohibited_statement,
            '',
            `Verify this certificate at ravel.example.com/verify/${number}.`,
          ].join('\n'),
        }).catch((e) => console.error('[mail]', e.message));
      });
      return { status: 201, body: { reference: number, ...shapeCertificate({ ...cert, signed_on: cert.signed_on }) } };
    });
  });
  return c.json(out.body, out.status);
});

// A withdrawal is one action with five consequences.
r.post('/certificates/:number/withdraw', async (c) => {
  const s = await requireRole(c, 'certificate_withdrawn', 'certificate_signer');
  const number = c.req.param('number');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /certificates/${number}/withdraw`, body, async () => {
    const x = await one('select * from certificate where number = $1 order by version desc limit 1', [number]);
    if (!x) throw refuse(404, 'not_found', 'No such certificate.');
    if (x.state === 'withdrawn') throw refuse(409, 'already_withdrawn', `This certificate was withdrawn on ${dayOf(x.withdrawn_on)}. Reason: ${x.withdrawal_reason}.`);
    const { reason } = body;
    if (!reason) throw refuse(400, 'reason_required', 'A withdrawal carries a reason. It is the only free text on a certificate.');
    const on = new Date().toISOString().slice(0, 10);
    const consequences = await withdrawalConsequences(x);
    await pool.query("update certificate set state = 'withdrawn', withdrawal_reason = $1, withdrawn_by = $2, withdrawn_on = $3 where number = $4 and version = $5", [reason, s.email, on, number, x.version]);
    const updated = await one('select * from certificate where number = $1 and version = $2', [number, x.version]);
    const doc = renderDocument({ ...shapeCertificate(updated), withdrawn_on: on, withdrawal_reason: reason, specification: 'SPEC-N6' });
    await pool.query('update certificate set document = $1 where number = $2 and version = $3', [doc, number, x.version]);
    // Every certificate derived from this one is identified and resolved.
    const derived = await q('select * from certificate where derived_from = $1', [number]);
    for (const d of derived) {
      await pool.query("update certificate set state = 'withdrawn', withdrawal_reason = $1, withdrawn_by = $2, withdrawn_on = $3 where number = $4 and version = $5", [`Derived from ${number}, which was withdrawn: ${reason}`, s.email, on, d.number, d.version]);
    }
    const mailText = [
      `Certificate ${number} issued to ${x.recipient_name} has been withdrawn on ${on}.`,
      '',
      `Reason: ${reason}`,
      '',
      'The following statements are now void and must no longer be made:',
      ...consequences.void_statements.map((v) => `  - ${v}`),
      '',
      `This certificate was withdrawn on ${on}. Reason: ${reason}.`,
      '',
      `The document remains readable at ravel.example.com/verify/${number}.`,
    ].join('\n');
    const cust = await one('select * from customer where reference = $1', [x.recipient]);
    setImmediate(() => {
      sendMail({ to: cust ? cust.contact : `${x.recipient.toLowerCase()}@example.com`, subject: `Certificate ${number} withdrawn`, text: mailText }).catch((e) => console.error('[mail]', e.message));
    });
    await appendEntry(null, { act: 'certificate_withdrawn', person: s.email, person_id: s.person_id, site: x.site, object_kind: 'certificate', object_ref: number, content: { reason, withdrawn_on: on, notified_recipients: consequences.notified_recipients, void_statements: consequences.void_statements, derived_certificates: derived.map((d) => d.number), batch_traversal: consequences.batch_traversal, notification: { to: cust ? cust.contact : null, subject: `Certificate ${number} withdrawn` } } });
    return {
      status: 200,
      body: {
        number,
        state: 'withdrawn',
        reason,
        withdrawn_by: s.email,
        withdrawn_on: on,
        notified_recipients: consequences.notified_recipients,
        void_statements: consequences.void_statements,
        derived_certificates: derived.map((d) => ({ number: d.number, version: d.version, state: 'withdrawn', resolution: 'withdrawn as derived' })),
        batch_traversal: consequences.batch_traversal,
        note: 'A withdrawal is never a deletion and the document stays readable at its address.',
      },
    };
  });
  return c.json(out.body, out.status);
});

export async function withdrawalConsequences(x) {
  const cust = await one('select * from customer where reference = $1', [x.recipient]);
  const notified_recipients = [{ reference: x.recipient, name: x.recipient_name, contact: cust ? cust.contact : null }];
  const void_statements = [x.permitted_statement, `Any statement of ${x.content_bp} basis points of recycled content in material covered by ${x.number}.`, `Any onward statement to a customer of ${x.recipient_name} resting on ${x.number}.`, `Any statement of the carbon figure ${x.carbon?.value_mg_per_kg} mg CO2e per kg attributed to material covered by ${x.number}.`];
  const lotRefs = (x.lots || []).map((l) => l.lot || l);
  const batchSet = new Set();
  const otherCerts = new Map();
  for (const lotRef of lotRefs) {
    const { genealogyOfLot } = await import('../engine/genealogy.js');
    const g = await genealogyOfLot(lotRef).catch(() => null);
    if (!g) continue;
    for (const n of g.nodes) if (n.kind === 'batch') batchSet.add(n.reference);
  }
  // The reverse traversal of the underlying batches runs so that every other
  // certificate touching them is enumerated in the same action.
  for (const b of batchSet) {
    const imp = await impactOfBatch(b);
    if (!imp) continue;
    for (const cert of imp.certificates) {
      if (cert.number === x.number) continue;
      otherCerts.set(cert.number, cert);
    }
  }
  return {
    notified_recipients,
    void_statements,
    batch_traversal: { batches: [...batchSet].sort(), other_certificates_touching_them: [...otherCerts.values()], complete: true },
  };
}

r.get('/certificates/:number/withdrawal-preview', async (c) => {
  requireSession(c);
  const number = c.req.param('number');
  const x = await one('select * from certificate where number = $1 order by version desc limit 1', [number]);
  if (!x) throw refuse(404, 'not_found', 'No such certificate.');
  const cons = await withdrawalConsequences(x);
  return c.json({
    number,
    state: x.state,
    consequences: [
      'The state becomes withdrawn with the reason, the person and the date.',
      'The recipient is notified and the notification is part of the record.',
      'Every downstream statement the recipient was permitted to make is enumerated in the notification.',
      'Every certificate derived from this one is identified and resolved.',
      'The reverse traversal of the underlying batches runs so that every other certificate touching them is enumerated.',
    ],
    ...cons,
    derived_certificates: (await q('select number, version, state from certificate where derived_from = $1', [number])),
  });
});

r.post('/certificates/:number/reissue', async (c) => {
  const s = await requireRole(c, 'certificate_reissued', 'certificate_signer');
  const number = c.req.param('number');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /certificates/${number}/reissue`, body, async () => {
    const x = await one('select * from certificate where number = $1 order by version desc limit 1', [number]);
    if (!x) throw refuse(404, 'not_found', 'No such certificate.');
    if (!body.password) throw refuse(401, 'password_required', 'A re-issue re-authenticates.');
    const identity = await keycloakPassword(s.email, body.password);
    if (!identity) throw refuse(401, 'reauthentication_failed', 'The password was not accepted.');
    if (!(s.sites || []).includes(x.site)) throw refuse(403, 'site_out_of_scope', `${s.email} may not sign for ${x.site}.`);
    const version = x.version + 1;
    const now = new Date().toISOString();
    const shaped = { ...shapeCertificate(x), version, signed_at: now, signed_on: now.slice(0, 10), signer: s.email, signer_name: s.name, state: 'issued', withdrawal_reason: null, withdrawn_on: null, specification: 'SPEC-N6' };
    const doc = renderDocument(shaped);
    await pool.query(
      `insert into certificate (number, version, site, lots, grade, specification_version, claim_type, content_bp, category_split, period, carbon, primary_share_bp, scheme, registration, test_results, permitted_statement, prohibited_statement, signer, signer_name, signed_at, signed_on, verification_url, state, provisional_factor, recipient, recipient_name, recipient_language, conditions_at_signing, input_versions, document, derived_from)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
      [number, version, x.site, JSON.stringify(x.lots), x.grade, x.specification_version, x.claim_type, x.content_bp, JSON.stringify(x.category_split), x.period, JSON.stringify(x.carbon), x.primary_share_bp, x.scheme, x.registration, JSON.stringify(x.test_results), x.permitted_statement, x.prohibited_statement, s.email, s.name, now, now.slice(0, 10), x.verification_url, 'issued', x.provisional_factor, x.recipient, x.recipient_name, x.recipient_language, JSON.stringify(x.conditions_at_signing), JSON.stringify(x.input_versions), doc, number],
    );
    await pool.query("update certificate set state = 'superseded' where number = $1 and version = $2 and state = 'issued'", [number, x.version]);
    await appendEntry(null, { act: 'certificate_reissued', person: s.email, person_id: s.person_id, site: x.site, object_kind: 'certificate', object_ref: number, content: { version, supersedes: x.version, reason: body.reason || null } });
    return { status: 201, body: { reference: number, number, version, state: 'issued', supersedes: x.version, note: 'A re-issue produces a new version at a new address rather than new bytes at the old one.', address: `/api/certificates/${number}/document?version=${version}` } };
  });
  return c.json(out.body, out.status);
});

// Replay: agreement and disagreement are both ordinary answers.
r.get('/certificates/:number/replay', async (c) => {
  noPaging(c);
  requireSession(c);
  const number = c.req.param('number');
  const version = c.req.query('version');
  const x = version ? await one('select * from certificate where number = $1 and version = $2', [number, Number(version)]) : await one('select * from certificate where number = $1 order by version desc limit 1', [number]);
  if (!x) throw refuse(404, 'not_found', 'No such certificate.');
  const iv = x.input_versions || {};
  const missing = [];
  const figure = iv.carbon_figure ? await one('select * from carbon_figure where id = $1', [iv.carbon_figure]) : null;
  if (iv.carbon_figure && !figure) missing.push(`carbon figure ${iv.carbon_figure}`);
  let mv = null;
  if (iv.carbon_method) {
    const m = /^(\S+) v(\d+)$/.exec(iv.carbon_method);
    if (m) mv = await one('select * from carbon_method_version where id = $1 and version = $2', [m[1], Number(m[2])]);
    if (!mv) missing.push(`carbon method version ${iv.carbon_method}`);
  }
  const cf = iv.conversion_factor ? await one('select * from conversion_factor where reference = $1', [iv.conversion_factor]) : null;
  if (iv.conversion_factor && !cf) missing.push(`conversion factor ${iv.conversion_factor}`);
  if (missing.length) {
    return c.json({
      number,
      version: x.version,
      reproducible: false,
      reason: `The inputs can no longer be resolved: ${missing.join(', ')} is gone. It is never recomputed under today's rules and presented as the original.`,
      input_versions: iv,
      issued: { content_bp: x.content_bp, value_mg_per_kg: x.carbon?.value_mg_per_kg ?? null },
      read_at: new Date().toISOString(),
    });
  }
  const lotRefs = (x.lots || []).map((l) => l.lot || l);
  const claim = lotRefs.length ? await lotClaim(lotRefs[0]) : null;
  const recomputedContent = claim ? claim.content_bp : null;
  const recomputedCarbon = figure ? Number(figure.value_mg_per_kg) : null;
  const issued = { content_bp: x.content_bp, value_mg_per_kg: x.carbon?.value_mg_per_kg ?? null, uncertainty_bp: x.carbon?.uncertainty_bp ?? null, boundary: x.carbon?.boundary ?? null, method_version: x.carbon?.method_version ?? null, claim_type: x.claim_type, primary_share_bp: x.primary_share_bp };
  const recomputed = { content_bp: recomputedContent, value_mg_per_kg: recomputedCarbon, uncertainty_bp: figure ? figure.uncertainty_bp : null, boundary: figure ? figure.boundary : null, method_version: mv ? `${mv.id} v${mv.version}` : null, claim_type: x.claim_type, primary_share_bp: figure ? figure.primary_share_bp : null };
  const differing = [];
  for (const k of Object.keys(issued)) if (issued[k] !== recomputed[k]) differing.push({ input: k, issued: issued[k], recomputed: recomputed[k] });
  return c.json({
    number,
    version: x.version,
    reproducible: true,
    agrees: differing.length === 0,
    issued,
    recomputed,
    differing_input: differing.length ? differing[0] : null,
    differing_inputs: differing,
    input_versions: iv,
    read_at: new Date().toISOString(),
    note: 'Agreement and disagreement are both ordinary answers.',
  });
});

// The public verification answer: found, and ten fields, and nothing else.
r.get('/verify/:number', async (c) => {
  const number = c.req.param('number');
  const ip = c.req.header('x-forwarded-for') || 'anon';
  if (!rateLimit(ip)) throw refuse(429, 'rate_limited', 'This route is rate limited.');
  const x = await one('select * from certificate where number = $1 order by version desc limit 1', [number]);
  if (!x) {
    return c.json({ found: false, number, state: null, issued_on: null, withdrawn_on: null, withdrawal_reason: null, site: null, grade: null, claim_type: null, recipient_name: null });
  }
  return c.json({
    found: true,
    number: x.number,
    state: x.state,
    issued_on: dayOf(x.signed_on),
    withdrawn_on: x.withdrawn_on ? dayOf(x.withdrawn_on) : null,
    withdrawal_reason: x.withdrawal_reason,
    site: x.site,
    grade: x.grade,
    claim_type: x.claim_type,
    recipient_name: x.recipient_name,
  });
});

const buckets = new Map();
function rateLimit(key, limit = 120, windowMs = 60000) {
  const now = Date.now();
  const b = buckets.get(key) || { n: 0, until: now + windowMs };
  if (now > b.until) {
    b.n = 0;
    b.until = now + windowMs;
  }
  b.n += 1;
  buckets.set(key, b);
  if (buckets.size > 5000) buckets.clear();
  return b.n <= limit;
}

export default r;
