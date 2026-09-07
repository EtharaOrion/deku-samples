import { Hono } from 'hono';
import { all, one, query, tx } from '../db.js';
import {
  asDate, idempotent, recordAct, refuse, refusePagination, refuseAuditorWrites,
  requireFields, requireRole, requireSession, refuseComputedInput,
} from '../http.js';
import { lotClaim, batchImpact, genealogy } from '../engine.js';
import { carbonFigureFor, recompute } from '../carbon.js';
import { keycloakPassword } from '../auth.js';
import { sendMail } from '../mail.js';
import { certificateDocument } from '../seed.js';

const app = new Hono();

const SCHEME = 'RCS-2026';
const REGISTRATION = 'REG-RAVEL-0042';
const VERIFY_BASE = 'https://ravel.example.com/verify';

const pct = (bp) => `${Math.floor(bp / 100)}.${String(bp % 100).padStart(2, '0')} per cent`;

// The permitted and prohibited statements are generated from the claim type,
// the percentage and the category split, in the recipient's language.
export function statementsFor({ claim_type, content_bp, category_split, language }) {
  const fr = language === 'fr';
  const post = category_split.post_consumer;
  const pre = category_split.pre_consumer;
  if (claim_type === 'mass_balance') {
    return {
      permitted: fr
        ? `Cette matière est revendiquée par bilan massique. Elle n'est pas physiquement séparée. Le destinataire peut déclarer que ${pct(content_bp)} de contenu recyclé a été attribué à cette livraison au titre du référentiel ${SCHEME}, dont ${post} g post-consommation et ${pre} g pré-consommation.`
        : `This material is claimed by mass balance. It is not physically segregated. The recipient may state that ${pct(content_bp)} recycled content has been allocated to this delivery under ${SCHEME}, of which ${post} g is post-consumer and ${pre} g is pre-consumer.`,
      prohibited: fr
        ? `Vous ne pouvez pas déclarer que cette matière contient physiquement du contenu recyclé.`
        : 'You may not state that this material physically contains recycled content.',
    };
  }
  if (claim_type === 'controlled_blending') {
    return {
      permitted: fr
        ? `Cette matière est revendiquée par mélange contrôlé. Le destinataire peut déclarer ${pct(content_bp)} de contenu recyclé au titre du référentiel ${SCHEME}, dont ${post} g post-consommation et ${pre} g pré-consommation.`
        : `This material is claimed by controlled blending. The recipient may state ${pct(content_bp)} recycled content under ${SCHEME}, of which ${post} g is post-consumer and ${pre} g is pre-consumer.`,
      prohibited: fr
        ? `Vous ne pouvez pas déclarer que chaque unité de cette matière contient ce pourcentage.`
        : 'You may not state that every unit of this material contains that percentage.',
    };
  }
  return {
    permitted: fr
      ? `Cette matière est physiquement séparée. Le destinataire peut déclarer ${pct(content_bp)} de contenu recyclé au titre du référentiel ${SCHEME}, dont ${post} g post-consommation et ${pre} g pré-consommation.`
      : `This material is physically segregated. The recipient may state ${pct(content_bp)} recycled content under ${SCHEME}, of which ${post} g is post-consumer and ${pre} g is pre-consumer.`,
    prohibited: fr
      ? `Vous ne pouvez pas étendre cette déclaration à une matière hors de ce lot.`
      : 'You may not extend this statement to material outside this lot.',
  };
}

// Eight conditions, decided on the server, none waivable, re-decided at the
// moment of signing.
export async function evaluateConditions({ lotReference, signerEmail, recipient }) {
  const lot = await one('select * from lot where reference = $1', [lotReference]);
  if (!lot) return null;
  const conditions = [];
  const add = (condition, satisfied, blocking_reference, detail, resolve_route) =>
    conditions.push({ condition, satisfied, blocking_reference: blocking_reference || null, detail: detail || null, resolve_route: resolve_route || null });

  add('lot_released', lot.disposition === 'released', lot.disposition === 'released' ? null : lot.reference,
    lot.disposition === 'released' ? 'The lot is released.' : `The lot disposition is ${lot.disposition}.`,
    `/console/lots/${lot.reference}`);

  const openDev = await one("select * from deviation where $1 = any(lots) and state = 'open' limit 1", [lotReference]);
  add('no_open_deviation', !openDev, openDev?.reference,
    openDev ? `Deviation ${openDev.reference} touching this lot is open.` : 'No deviation touching this lot is open.',
    openDev ? `/console/deviations/${openDev.reference}` : null);

  const unreviewed = await one('select * from override where lot = $1 and reviewed = false limit 1', [lotReference]);
  add('no_unreviewed_override', !unreviewed, unreviewed?.reference,
    unreviewed
      ? `Override ${unreviewed.reference} on this lot is unreviewed. Separation overridden by ${unreviewed.authorised_by} on ${asDate(unreviewed.created_on)}. This cannot be removed.`
      : 'No override on this lot is unreviewed.',
    unreviewed ? `/console/overrides/${unreviewed.reference}` : null);

  const period = await one(
    'select * from balance_period where site = $1 and grade = $2 order by period_from desc limit 1',
    [lot.site, lot.grade],
  );
  add('period_closed', period?.state === 'closed', period?.state === 'closed' ? null : period?.id,
    period ? `The bookkeeping period ${period.id} is ${period.state}.` : 'No bookkeeping period covers this lot.',
    period ? `/console/balance/${period.id}` : null);

  const claim = await lotClaim(lotReference);
  let invariantHolds = false;
  let invariantDetail = 'No claim is attached to this lot.';
  if (period) {
    const movements = await all('select * from credit_movement where period = $1', [period.id]);
    const post = movements.filter((m) => m.category === 'post_consumer');
    const pre = movements.filter((m) => m.category === 'pre_consumer');
    const avail = (rows) => rows.filter((m) => m.direction === 'in').reduce((s, m) => s + m.mass_g, 0)
      - rows.filter((m) => m.direction === 'out').reduce((s, m) => s + m.mass_g, 0);
    invariantHolds = avail(post) >= 0 && avail(pre) >= 0 && claim.credit_attached_g > 0;
    invariantDetail = claim.credit_attached_g > 0
      ? `The allocation of ${claim.credit_attached_g} g holds with a margin of ${avail(post)} g post-consumer and ${avail(pre)} g pre-consumer.`
      : 'No claim is attached to this lot, so there is nothing to certify.';
  }
  add('balance_invariant_holds', invariantHolds, invariantHolds ? null : period?.id, invariantDetail,
    period ? `/console/balance/${period.id}` : null);

  let carbon = null;
  try {
    carbon = await carbonFigureFor(lotReference, { internal: true });
  } catch { carbon = null; }
  const carbonComplete = !!carbon && carbon.value_mg_per_kg !== undefined && !!carbon.boundary
    && carbon.method_version !== undefined && carbon.uncertainty_bp !== undefined;
  add('carbon_figure_complete', carbonComplete, carbonComplete ? null : lotReference,
    carbonComplete
      ? `The figure carries its boundary (${carbon.boundary}), its method version (${carbon.method_version_label}) and its uncertainty (${carbon.uncertainty_bp} basis points).`
      : 'No carbon figure with all four components exists for this lot.',
    `/console/lots/${lotReference}/carbon`);

  const person = await one('select * from person where email = $1', [signerEmail]);
  const today = new Date().toISOString().slice(0, 10);
  const cert = await one(
    "select * from site_certification where site = $1 and effective_from <= $2 and (effective_to is null or effective_to >= $2) order by effective_from desc limit 1",
    [lot.site, today],
  );
  const suspended = cert?.state === 'suspended';
  const inScope = !!person && (person.sites || []).includes(lot.site) && !suspended
    && (!person.grant_ends_on || asDate(person.grant_ends_on) >= today);
  add('signer_holds_scope', inScope, inScope ? null : lot.site,
    suspended
      ? `The certification for ${lot.site} is suspended from ${asDate(cert.effective_from)}.`
      : inScope
        ? `${signerEmail} holds signing scope for ${lot.site} on ${today}.`
        : `${signerEmail} does not hold signing scope for ${lot.site} on ${today}. Scope: ${(person?.sites || []).join(', ') || 'none'}.`,
    `/console/certificates`);

  const entered = await one(
    'select * from test_result where subject_reference = $1 and entered_by = $2 limit 1',
    [lotReference, signerEmail],
  );
  const enteredBatch = await one(
    'select * from batch where created_by = $1 and reference = any($2) limit 1',
    [signerEmail, ((await genealogy(lotReference))?.nodes || []).filter((n) => n.kind === 'batch').map((n) => n.reference)],
  );
  const didNotEnter = !entered && !enteredBatch;
  add('signer_did_not_enter_data', didNotEnter, entered?.reference || enteredBatch?.reference,
    didNotEnter ? 'The signer entered none of this lot\'s data.' : 'The signer entered data behind this lot.',
    entered ? `/console/lots/${lotReference}` : null);

  return { lot, conditions, claim, carbon, period, recipient };
}

app.post('/certificates/preview', async (c) => {
  const session = requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['lot']);
  const evaluation = await evaluateConditions({
    lotReference: body.lot,
    signerEmail: body.signer || session.email,
    recipient: body.recipient,
  });
  if (!evaluation) refuse(404, 'not_found', { message: 'No such lot.', field: 'lot' });
  const { lot, conditions, claim, carbon, period } = evaluation;
  const customer = body.recipient ? await one('select * from customer where reference = $1', [body.recipient]) : null;
  const statements = statementsFor({
    claim_type: lot.claim_type,
    content_bp: claim.content_bp,
    category_split: claim.category_split,
    language: customer?.language || 'en',
  });
  return c.json({
    lot: lot.reference,
    site: lot.site,
    grade: lot.grade,
    recipient: body.recipient || null,
    recipient_name: customer?.name || null,
    conditions,
    all_satisfied: conditions.every((x) => x.satisfied),
    blocking: conditions.filter((x) => !x.satisfied).map((x) => x.condition),
    content_bp: claim.content_bp,
    claim_type: lot.claim_type,
    category_split: claim.category_split,
    mass_g: lot.mass_g,
    period: period?.id || null,
    carbon,
    provisional_factor: lot.provisional_factor,
    permitted_statement: statements.permitted,
    prohibited_statement: statements.prohibited,
    waivable: false,
    read_at: new Date().toISOString(),
  });
});

// Signing re-authenticates: a session alone is not a signing credential.
app.post('/certificates', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'certificate_signer');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['lot', 'recipient', 'password']);
  const identity = await keycloakPassword(session.email, body.password);
  if (!identity) {
    await recordAct({
      act: 'certificate_signing_refused', actor: session.email, site: null,
      object_kind: 'lot', object_reference: body.lot, refused: true,
      content: { reason: 'reauthentication_failed' },
    });
    refuse(401, 'reauthentication_failed', {
      message: 'The signing act carries the password again. A session alone is not a signing credential.',
    });
  }
  const customer = await one('select * from customer where reference = $1', [body.recipient]);
  if (!customer) refuse(404, 'not_found', { message: 'No such recipient.', field: 'recipient' });

  const { idempotencyBody } = { idempotencyBody: { lot: body.lot, recipient: body.recipient } };
  const result = await idempotent(c, 'POST /api/certificates', idempotencyBody, async () => {
    // The eight are decided again here, against the records as they stand now.
    const evaluation = await evaluateConditions({ lotReference: body.lot, signerEmail: session.email, recipient: body.recipient });
    if (!evaluation) {
      const e = new Error('not_found');
      e.status = 404;
      e.body = { error: 'not_found', message: 'No such lot.', field: 'lot' };
      throw e;
    }
    const { lot, conditions, claim, carbon, period } = evaluation;
    const unsatisfied = conditions.filter((x) => !x.satisfied);
    if (unsatisfied.length) {
      await recordAct({
        act: 'certificate_signing_refused', actor: session.email, site: lot.site,
        object_kind: 'lot', object_reference: lot.reference, refused: true,
        content: { blocking: unsatisfied.map((x) => x.condition), decided_at: new Date().toISOString() },
      });
      return {
        status: 409,
        body: {
          error: 'conditions_not_satisfied',
          message: 'The eight conditions are decided again at the moment of signing. One or more of them does not hold now.',
          conditions,
          blocking: unsatisfied.map((x) => ({ condition: x.condition, blocking_reference: x.blocking_reference, detail: x.detail })),
        },
      };
    }
    const statements = statementsFor({
      claim_type: lot.claim_type, content_bp: claim.content_bp,
      category_split: claim.category_split, language: customer.language,
    });
    const tests = await all('select * from test_result where subject_reference = $1 and usable_for_release = true', [lot.reference]);

    const number = await tx(async (client) => {
      // The sequence is gapless per site: two signatures landing together take
      // two consecutive numbers and neither is lost.
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`certseq:${lot.site}`]);
      const { rows } = await client.query('select last_number from certificate_sequence where site = $1 for update', [lot.site]);
      const next = (rows[0]?.last_number ?? 0) + 1;
      await client.query(
        'insert into certificate_sequence (site,last_number) values ($1,$2) on conflict (site) do update set last_number = $2',
        [lot.site, next],
      );
      return `CERT-${lot.site.replace('SITE-', '')}-${String(next).padStart(6, '0')}`;
    });

    const signedAt = new Date().toISOString();
    const cert = {
      number, version: 1, site: lot.site,
      lots: [{ reference: lot.reference, mass_g: lot.mass_g }],
      grade: lot.grade, specification_version: lot.specification_version,
      claim_type: lot.claim_type, content_bp: claim.content_bp, category_split: claim.category_split,
      period: period.id,
      carbon: {
        value_mg_per_kg: carbon.value_mg_per_kg, boundary: carbon.boundary,
        method_version: carbon.method_version, method_version_label: carbon.method_version_label,
        uncertainty_bp: carbon.uncertainty_bp, comparator: carbon.comparator,
        allocation_basis: carbon.allocation_basis, breakdown_attached: true,
      },
      primary_share_bp: carbon.primary_share_bp,
      scheme: SCHEME, registration: REGISTRATION,
      test_results: tests.map((t) => ({ property: t.property, method: t.method, value: t.value, unit: t.unit })),
      permitted_statement: statements.permitted, prohibited_statement: statements.prohibited,
      signer: session.email, signer_name: session.name, signed_at: signedAt,
      verification_url: `${VERIFY_BASE}/${number}`, state: 'issued',
      provisional_factor: lot.provisional_factor,
      recipient: customer.reference, recipient_name: customer.name,
      recipient_language: customer.language, conditions,
      issued_on: signedAt.slice(0, 10), withdrawal: null,
    };
    const document = certificateDocument(cert);
    await query(
      `insert into certificate (number,version,site,lots,grade,specification_version,claim_type,content_bp,category_split,period,carbon,primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,signer,signer_name,signed_at,verification_url,state,provisional_factor,recipient,recipient_name,recipient_language,conditions,document,issued_on)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
      [cert.number, cert.version, cert.site, JSON.stringify(cert.lots), cert.grade, cert.specification_version,
        cert.claim_type, cert.content_bp, JSON.stringify(cert.category_split), cert.period,
        JSON.stringify(cert.carbon), cert.primary_share_bp, cert.scheme, cert.registration,
        JSON.stringify(cert.test_results), cert.permitted_statement, cert.prohibited_statement,
        cert.signer, cert.signer_name, cert.signed_at, cert.verification_url, cert.state,
        cert.provisional_factor, cert.recipient, cert.recipient_name, cert.recipient_language,
        JSON.stringify(cert.conditions), document, cert.issued_on],
    );
    await sendMail({
      to: customer.contact,
      subject: `Certificate ${number} issued`,
      text: [
        `Certificate ${number} issued.`, '',
        `Number: ${number}`,
        `Claim type: ${cert.claim_type}`,
        `Recycled content: ${pct(cert.content_bp)} (${cert.content_bp} basis points)`,
        '', 'Permitted statement:', cert.permitted_statement,
        '', 'Prohibited statement:', cert.prohibited_statement,
        '', `Verify this certificate at ravel.example.com/verify/${number}.`,
      ].join('\n'),
      act: 'certificate_signed', object_reference: number,
    });
    await recordAct({
      act: 'certificate_signed', actor: session.email, site: lot.site,
      object_kind: 'certificate', object_reference: number,
      content: { lot: lot.reference, recipient: customer.reference, content_bp: cert.content_bp, claim_type: cert.claim_type, conditions },
    });
    return { status: 201, body: { reference: number, ...cert, document_url: `/api/certificates/${number}/document` } };
  });
  return c.json(result.body, result.status);
});

const certOut = (x) => ({
  reference: x.number, number: x.number, version: x.version, site: x.site, lots: x.lots,
  grade: x.grade, specification_version: x.specification_version, claim_type: x.claim_type,
  content_bp: x.content_bp, category_split: x.category_split, period: x.period,
  carbon: x.carbon, primary_share_bp: x.primary_share_bp, scheme: x.scheme, registration: x.registration,
  test_results: x.test_results, permitted_statement: x.permitted_statement,
  prohibited_statement: x.prohibited_statement, signer: x.signer, signer_name: x.signer_name,
  signed_at: x.signed_at, verification_url: x.verification_url, state: x.state,
  provisional_factor: x.provisional_factor, recipient: x.recipient, recipient_name: x.recipient_name,
  issued_on: asDate(x.issued_on), withdrawal: x.withdrawal, conditions: x.conditions,
  derived_from: x.derived_from, superseded_by: x.superseded_by,
  document_url: `/api/certificates/${x.number}/document`,
});

app.get('/certificates', async (c) => {
  refusePagination(c);
  const session = requireSession(c);
  let rows = await all('select * from certificate order by number asc');
  if (session.roles.includes('converter')) {
    const cus = await one('select * from customer where contact = $1', [session.email]);
    rows = rows.filter((x) => x.recipient === cus?.reference);
  }
  return c.json(rows.map(certOut));
});

app.get('/certificates/:number', async (c) => {
  requireSession(c);
  const x = await one('select * from certificate where number = $1', [c.req.param('number')]);
  if (!x) refuse(404, 'not_found', { message: 'No such certificate.' });
  const deviations = await all('select * from deviation where lots && $1', [(x.lots || []).map((l) => l.reference)]);
  let carbon = null;
  try { carbon = await carbonFigureFor(x.lots[0]?.reference, { internal: true }); } catch { carbon = null; }
  return c.json({
    ...certOut(x),
    // A deviation travels with every lot it touches and appears on the
    // internal view of any certificate issued against that lot.
    internal: {
      deviations: deviations.map((d) => ({ reference: d.reference, state: d.state, outcome: d.outcome })),
      carbon_breakdown: carbon?.breakdown || [],
      energy: carbon?.energy || null,
    },
  });
});

// An issued document is byte-stable: two reads of the same version return
// identical bytes.
app.get('/certificates/:number/document', async (c) => {
  const x = await one('select * from certificate where number = $1', [c.req.param('number')]);
  if (!x) refuse(404, 'not_found', { message: 'No such certificate.' });
  return new Response(x.document, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-transform' },
  });
});

app.post('/certificates/:number/withdraw', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'certificate_signer');
  const number = c.req.param('number');
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['reason']);
  const x = await one('select * from certificate where number = $1', [number]);
  if (!x) refuse(404, 'not_found', { message: 'No such certificate.' });
  if (x.state === 'withdrawn') {
    refuse(409, 'already_withdrawn', {
      message: 'This certificate was already withdrawn. A withdrawal is never a deletion and the document stays readable.',
      withdrawn_on: x.withdrawal?.withdrawn_on,
    });
  }
  const result = await idempotent(c, `POST /api/certificates/${number}/withdraw`, body, async () => {
    const withdrawnOn = new Date().toISOString().slice(0, 10);
    const withdrawal = { reason: body.reason, withdrawn_by: session.email, withdrawn_on: withdrawnOn };
    const customer = await one('select * from customer where reference = $1', [x.recipient]);
    const void_statements = [x.permitted_statement, `The recipient may state ${pct(x.content_bp)} recycled content under ${x.scheme} for this delivery.`];
    // Every certificate derived from this one is identified and resolved.
    const derived = await all('select * from certificate where derived_from = $1', [number]);
    // The reverse traversal of the underlying batches runs, so every other
    // certificate touching them is enumerated in the same action.
    const gen = await genealogy(x.lots[0]?.reference);
    const batchRefs = (gen?.nodes || []).filter((n) => n.kind === 'batch').map((n) => n.reference);
    const traversal = [];
    for (const b of batchRefs) {
      const impact = await batchImpact(b);
      if (impact) traversal.push({ batch: b, certificates: impact.certificates.map((k) => k.number), recipients: impact.recipients });
    }
    const others = [...new Set(traversal.flatMap((t) => t.certificates))].filter((n) => n !== number);

    const updated = { ...x, state: 'withdrawn', withdrawal };
    const document = certificateDocument({ ...updated, issued_on: asDate(x.issued_on) });
    await query(
      "update certificate set state = 'withdrawn', withdrawal = $1, document = $2 where number = $3",
      [JSON.stringify(withdrawal), document, number],
    );
    for (const d of derived) {
      await query("update certificate set state = 'withdrawn', withdrawal = $1 where number = $2",
        [JSON.stringify({ ...withdrawal, reason: `Derived from ${number}, withdrawn: ${body.reason}` }), d.number]);
    }
    const notified_recipients = [{ reference: x.recipient, name: x.recipient_name, email: customer?.contact }];
    await sendMail({
      to: customer?.contact || 'unknown@example.com',
      subject: `Certificate ${number} withdrawn`,
      text: [
        `Certificate ${number} withdrawn.`, '',
        `Number: ${number}`,
        `Reason: ${body.reason}`,
        `Withdrawn on: ${withdrawnOn}`,
        '', 'Every statement below is now void and must not be made:',
        ...void_statements.map((s) => `- ${s}`),
        '', `This certificate was withdrawn on ${withdrawnOn}. Reason: ${body.reason}.`,
        `The document remains readable at ravel.example.com/verify/${number}.`,
      ].join('\n'),
      act: 'certificate_withdrawn', object_reference: number,
    });
    await recordAct({
      act: 'certificate_withdrawn', actor: session.email, site: x.site,
      object_kind: 'certificate', object_reference: number,
      content: { reason: body.reason, notified: notified_recipients.map((r) => r.name), derived: derived.map((d) => d.number), traversal_certificates: others },
    });
    return {
      status: 200,
      body: {
        reference: number, number,
        state: 'withdrawn', reason: body.reason,
        withdrawn_by: session.email, withdrawn_on: withdrawnOn,
        notified_recipients,
        void_statements,
        derived_certificates: derived.map((d) => ({ number: d.number, state: 'withdrawn' })),
        batch_traversal: traversal,
        other_certificates_touching_these_batches: others,
      },
    };
  });
  return c.json(result.body, result.status);
});

// Before confirming, the screen needs the enumerated lists rather than a count.
app.get('/certificates/:number/withdrawal-preview', async (c) => {
  requireSession(c);
  const number = c.req.param('number');
  const x = await one('select * from certificate where number = $1', [number]);
  if (!x) refuse(404, 'not_found', { message: 'No such certificate.' });
  const customer = await one('select * from customer where reference = $1', [x.recipient]);
  const derived = await all('select * from certificate where derived_from = $1', [number]);
  const gen = await genealogy(x.lots[0]?.reference);
  const batchRefs = (gen?.nodes || []).filter((n) => n.kind === 'batch').map((n) => n.reference);
  const traversal = [];
  for (const b of batchRefs) {
    const impact = await batchImpact(b);
    if (impact) traversal.push({ batch: b, certificates: impact.certificates.map((k) => k.number), recipients: impact.recipients });
  }
  return c.json({
    number,
    state: x.state,
    consequences: [
      'The state becomes withdrawn with the reason, the person and the date.',
      'The recipient is notified and the notification is part of the record.',
      'Every downstream statement the recipient was permitted to make is enumerated in the notification.',
      'Every certificate derived from this one is identified and resolved.',
      'The reverse traversal of the underlying batches runs and every other certificate touching them is enumerated.',
    ],
    notified_recipients: [{ reference: x.recipient, name: x.recipient_name, email: customer?.contact }],
    void_statements: [x.permitted_statement, `The recipient may state ${pct(x.content_bp)} recycled content under ${x.scheme} for this delivery.`],
    derived_certificates: derived.map((d) => ({ number: d.number, recipient_name: d.recipient_name })),
    batch_traversal: traversal,
    other_certificates_touching_these_batches: [...new Set(traversal.flatMap((t) => t.certificates))].filter((n) => n !== number),
    read_at: new Date().toISOString(),
  });
});

app.post('/certificates/:number/reissue', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'certificate_signer');
  const number = c.req.param('number');
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['reason', 'password']);
  const identity = await keycloakPassword(session.email, body.password);
  if (!identity) refuse(401, 'reauthentication_failed', { message: 'The signing act carries the password again.' });
  const x = await one('select * from certificate where number = $1', [number]);
  if (!x) refuse(404, 'not_found', { message: 'No such certificate.' });
  const result = await idempotent(c, `POST /api/certificates/${number}/reissue`, body, async () => {
    // A re-issue produces a new version at a new address rather than new bytes
    // at the old one.
    const version = x.version + 1;
    const newNumber = `${number}-V${version}`;
    const signedAt = new Date().toISOString();
    const cert = { ...x, number: newNumber, version, signer: session.email, signer_name: session.name, signed_at: signedAt, issued_on: signedAt.slice(0, 10), state: 'issued', withdrawal: null, verification_url: `${VERIFY_BASE}/${newNumber}` };
    const document = certificateDocument(cert);
    await query(
      `insert into certificate (number,version,site,lots,grade,specification_version,claim_type,content_bp,category_split,period,carbon,primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,signer,signer_name,signed_at,verification_url,state,provisional_factor,recipient,recipient_name,recipient_language,conditions,document,issued_on,derived_from)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'issued',$22,$23,$24,$25,$26,$27,$28,$29)`,
      [newNumber, version, x.site, JSON.stringify(x.lots), x.grade, x.specification_version, x.claim_type,
        x.content_bp, JSON.stringify(x.category_split), x.period, JSON.stringify(x.carbon), x.primary_share_bp,
        x.scheme, x.registration, JSON.stringify(x.test_results), x.permitted_statement, x.prohibited_statement,
        session.email, session.name, signedAt, cert.verification_url, x.provisional_factor, x.recipient,
        x.recipient_name, x.recipient_language, JSON.stringify(x.conditions), document, signedAt.slice(0, 10), number],
    );
    await query('update certificate set superseded_by = $1 where number = $2', [newNumber, number]);
    await recordAct({
      act: 'certificate_reissued', actor: session.email, site: x.site,
      object_kind: 'certificate', object_reference: newNumber,
      content: { supersedes: number, reason: body.reason },
    });
    return { status: 201, body: { reference: newNumber, number: newNumber, version, supersedes: number, state: 'issued' } };
  });
  return c.json(result.body, result.status);
});

// Replay: agreement and disagreement are both ordinary answers.
app.get('/certificates/:number/replay', async (c) => {
  requireSession(c);
  const x = await one('select * from certificate where number = $1', [c.req.param('number')]);
  if (!x) refuse(404, 'not_found', { message: 'No such certificate.' });
  const mv = await one(
    'select * from carbon_method_version where method = $1 and version = $2',
    [x.carbon.method_version_label?.split(' ')[0] || 'CM-PA6', x.carbon.method_version],
  );
  const figure = await one(
    'select * from carbon_figure where lot = $1 order by version asc limit 1',
    [x.lots[0]?.reference],
  );
  const factor = await one(
    'select * from conversion_factor where site = $1 order by version asc limit 1',
    [x.site],
  );
  const input_versions = {
    carbon_method: mv ? `${mv.method} v${mv.version}` : null,
    conversion_factor: factor ? `${factor.reference} v${factor.version}` : null,
    specification: `SPEC-${x.grade} v${x.specification_version}`,
    period: x.period,
  };
  // A figure whose inputs can no longer be resolved is never recomputed under
  // today's rules and presented as the original.
  if (!mv || mv.retired || !figure) {
    return c.json({
      number: x.number,
      reproducible: false,
      reason: !mv ? 'the method version this figure was computed against is gone'
        : mv.retired ? `the method version ${mv.method} v${mv.version} is retired`
          : 'the carbon figure recorded against this certificate can no longer be resolved',
      issued: { content_bp: x.content_bp, carbon: x.carbon },
      recomputed: null,
      agrees: null,
      differing_input: null,
      input_versions,
      read_at: new Date().toISOString(),
    });
  }
  const claim = await lotClaim(x.lots[0]?.reference);
  const recomputedCarbon = await recompute(figure, mv);
  const issued = {
    content_bp: x.content_bp,
    value_mg_per_kg: x.carbon.value_mg_per_kg,
    boundary: x.carbon.boundary,
    method_version: x.carbon.method_version,
    uncertainty_bp: x.carbon.uncertainty_bp,
  };
  const recomputed = {
    content_bp: claim.content_bp,
    value_mg_per_kg: recomputedCarbon.value_mg_per_kg,
    boundary: recomputedCarbon.boundary,
    method_version: recomputedCarbon.method_version,
    uncertainty_bp: recomputedCarbon.uncertainty_bp,
  };
  const differing = Object.keys(issued).find((k) => issued[k] !== recomputed[k]);
  return c.json({
    number: x.number,
    reproducible: true,
    issued,
    recomputed,
    agrees: !differing,
    differing_input: differing
      ? { field: differing, issued: issued[differing], recomputed: recomputed[differing],
          input: differing === 'content_bp' ? input_versions.conversion_factor : input_versions.carbon_method }
      : null,
    input_versions,
    read_at: new Date().toISOString(),
  });
});

export default app;
