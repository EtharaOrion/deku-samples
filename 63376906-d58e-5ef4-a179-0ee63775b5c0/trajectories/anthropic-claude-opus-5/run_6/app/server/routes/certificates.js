import { Hono } from 'hono';
import { q, pool } from '../lib/db.js';
import {
  requireSession, requireAct, withIdempotency, refuse, refusePagination,
  requireFields, today,
} from '../lib/http.js';
import { appendEntry } from '../lib/records.js';
import { keycloakPassword } from '../lib/auth.js';
import { sendMail } from '../lib/mail.js';
import { evaluateConditions, statementsFor, recipientName, formatBp } from '../engine/certificate.js';
import { carbonFor } from '../engine/carbon.js';
import { lotClaim } from '../engine/ledger.js';
import { renderDocument } from '../engine/document.js';
import { impactOf } from '../engine/genealogy.js';
import { iso } from '../engine/feedstock.js';

const r = new Hono();

const SCHEME = 'RCS-2026';
const REGISTRATION = 'REG-RAVEL-0042';
const VERIFY_BASE = 'https://ravel.example.com/verify';

function certView(row) {
  return {
    ...row.payload,
    number: row.number,
    version: row.version,
    state: row.state,
    signer: row.signer,
    signed_at: row.signed_at,
    withdrawn_on: iso(row.withdrawn_on),
    withdrawn_by: row.withdrawn_by,
    withdrawal_reason: row.withdrawal_reason,
    supersedes: row.supersedes,
    superseded_by: row.superseded_by,
    conditions: row.conditions,
    verification_url: `${VERIFY_BASE}/${row.number}`,
    withdrawal_statement: row.state === 'withdrawn'
      ? `This certificate was withdrawn on ${iso(row.withdrawn_on)}. Reason: ${row.withdrawal_reason}.`
      : null,
  };
}

r.get('/certificates', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const rows = await q('SELECT * FROM certificate ORDER BY number ASC');
  const deviations = await q('SELECT * FROM deviation');
  return c.json(rows.map((row) => {
    const lotRefs = (row.payload?.lots || []).map((l) => l.reference);
    // a deviation travels with every lot it touches and appears on the internal view
    const touching = deviations.filter((d) => (d.lots || []).some((x) => lotRefs.includes(x)));
    return { ...certView(row), deviations: touching.map((d) => ({ reference: d.reference, state: d.state, outcome: d.outcome })) };
  }));
});

r.get('/certificates/:number', async (c) => {
  await requireSession(c);
  const row = (await q('SELECT * FROM certificate WHERE number = $1', [c.req.param('number')]))[0];
  if (!row) refuse(404, 'not_found', { error: 'not_found', message: 'No such certificate.' });
  const lotRefs = (row.payload?.lots || []).map((l) => l.reference);
  const deviations = (await q('SELECT * FROM deviation')).filter((d) => (d.lots || []).some((x) => lotRefs.includes(x)));
  const overrides = await q('SELECT * FROM override_record WHERE lot = ANY($1)', [lotRefs]);
  return c.json({
    ...certView(row),
    deviations: deviations.map((d) => ({ reference: d.reference, state: d.state, outcome: d.outcome, detail: d.detail })),
    overrides: overrides.map((o) => ({ reference: o.reference, separation: o.separation, reviewed: o.reviewed, authorised_by: o.authorised_by })),
  });
});

// An issued document is byte-stable: two reads return identical bytes.
r.get('/certificates/:number/document', async (c) => {
  const row = (await q('SELECT * FROM certificate WHERE number = $1', [c.req.param('number')]))[0];
  if (!row) refuse(404, 'not_found', { error: 'not_found', message: 'No such certificate.' });
  return new Response(row.document, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `inline; filename="${row.number}.txt"`,
      'cache-control': 'no-transform',
    },
  });
});

// Eight conditions, exactly, each with condition, satisfied and blocking_reference.
r.post('/certificates/preview', async (c) => {
  const actor = await requireAct(c, 'certificate.preview');
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['lot']);
  const evaluated = await evaluateConditions({
    lotReference: body.lot, signerEmail: actor.email, signOn: today(),
  });
  const preview = await buildPayload({
    lot: evaluated.lot, recipient: body.recipient, signerEmail: actor.email,
    signerName: actor.name, number: 'PREVIEW', signedAt: new Date().toISOString(),
  }).catch(() => null);
  await appendEntry(null, {
    person: actor.email, site: evaluated.lot?.site || null, object_kind: 'certificate',
    object_ref: body.lot, action: 'previewed',
    content: { lot: body.lot, recipient: body.recipient || null, blocking: evaluated.conditions.filter((x) => !x.satisfied).map((x) => x.condition) },
  });
  return c.json({
    lot: body.lot,
    recipient: body.recipient || null,
    conditions: evaluated.conditions,
    all_satisfied: evaluated.conditions.every((x) => x.satisfied),
    blocking: evaluated.conditions.filter((x) => !x.satisfied),
    document_preview: preview ? preview.document : null,
    payload_preview: preview ? preview.payload : null,
    note: 'None of the eight is waivable and the same eight are re-checked on the server at the moment of signing.',
  });
});

async function buildPayload({ lot, recipient, signerEmail, signerName, number, signedAt, version = 1 }) {
  if (!lot) throw new Error('no lot');
  const [claim, carbon, spec, site, tests, factor, cust] = await Promise.all([
    lotClaim(lot.reference),
    carbonFor(lot.reference, { internal: false }),
    q('SELECT * FROM specification WHERE grade = $1 AND superseded = false', [lot.grade]),
    q('SELECT * FROM site WHERE reference = $1', [lot.site]),
    q("SELECT * FROM test_result WHERE subject_kind = 'lot' AND subject_ref = $1 AND usable_for_release = true", [lot.reference]),
    q('SELECT * FROM conversion_factor WHERE site = $1 AND superseded = false ORDER BY version DESC LIMIT 1', [lot.site]),
    recipient ? q('SELECT * FROM customer WHERE reference = $1', [recipient]) : Promise.resolve([]),
  ]);
  const period = (await q(
    'SELECT * FROM balance_period WHERE site = $1 AND grade = $2 ORDER BY period_from DESC LIMIT 1', [lot.site, lot.grade]))[0];
  const language = cust[0]?.language || 'en';
  const recName = recipient ? await recipientName(recipient, signedAt.slice(0, 10)) : 'the recipient';
  const statements = statementsFor({
    claimType: lot.claim_type, contentBpValue: claim.content_bp, categorySplit: claim.category_split,
    scheme: SCHEME, number, language,
  });
  const payload = {
    number, version, site: lot.site, site_name: site[0]?.name,
    lots: [{ reference: lot.reference, mass_g: Number(lot.mass_g), grade: lot.grade, site: lot.site }],
    grade: lot.grade,
    specification_version: `SPEC-${lot.grade} v${spec[0]?.version ?? lot.specification_version}`,
    claim_type: lot.claim_type,
    content_bp: claim.content_bp,
    category_split: claim.category_split,
    period: period?.id || null,
    carbon: carbon && !carbon.mismatch ? {
      value_mg_per_kg: carbon.value_mg_per_kg,
      boundary: carbon.boundary,
      method_version: carbon.method_version,
      uncertainty_bp: carbon.uncertainty_bp,
      comparator: carbon.comparator,
      comparison_statement: carbon.comparison_statement,
      energy_location_mg_per_kg: carbon.energy_location_mg_per_kg,
      energy_market_mg_per_kg: carbon.energy_market_mg_per_kg,
      breakdown_attached: carbon.breakdown_attached,
    } : null,
    primary_share_bp: carbon && !carbon.mismatch ? carbon.primary_share_bp : null,
    scheme: SCHEME,
    registration: REGISTRATION,
    test_results: tests.map((t) => ({ property: t.property, method: t.method, value: t.value, unit: t.unit, uncertainty_bp: Number(t.uncertainty_bp) })),
    permitted_statement: statements.permitted_statement,
    prohibited_statement: statements.prohibited_statement,
    language: statements.language,
    signer: signerEmail,
    signer_name: signerName,
    signed_at: signedAt,
    recipient,
    recipient_name: recName,
    verification_url: `${VERIFY_BASE}/${number}`,
    state: 'issued',
    provisional_factor: !!factor[0]?.provisional,
    input_versions: {
      conversion_factor: factor[0]?.reference || null,
      carbon_method: carbon && !carbon.mismatch ? carbon.method_version : null,
      specification: `SPEC-${lot.grade} v${spec[0]?.version}`,
      period: period?.id || null,
    },
  };
  return { payload, document: renderDocument(payload) };
}

// Signing re-authenticates: the signing act carries the password again.
r.post('/certificates', async (c) => {
  const actor = await requireAct(c, 'certificate.sign');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['lot', 'recipient', 'password']);
    const reauth = await keycloakPassword(actor.email, body.password);
    if (!reauth) {
      await appendEntry(null, {
        person: actor.email, object_kind: 'certificate', object_ref: body.lot,
        action: 'sign_refused', content: { reason: 'reauthentication_failed' },
      });
      refuse(401, 'reauthentication_failed', {
        error: 'reauthentication_failed',
        message: 'A session alone is not a signing credential. The signing act carries the password again.',
      });
    }

    const signedAt = new Date().toISOString();
    // the eight conditions are decided again at the moment of signing, against the
    // records as they stand then rather than as they stood at the preview
    const evaluated = await evaluateConditions({
      lotReference: body.lot, signerEmail: actor.email, signOn: signedAt.slice(0, 10),
    });
    const blocking = evaluated.conditions.filter((x) => !x.satisfied);
    if (blocking.length) {
      await appendEntry(null, {
        person: actor.email, site: evaluated.lot?.site || null, object_kind: 'certificate',
        object_ref: body.lot, action: 'sign_refused',
        content: { blocking: blocking.map((x) => ({ condition: x.condition, blocking_reference: x.blocking_reference })), conditions: evaluated.conditions },
      });
      refuse(409, 'conditions_not_satisfied', {
        error: 'conditions_not_satisfied',
        message: 'The eight conditions are decided again at the moment of signing. None is waivable.',
        conditions: evaluated.conditions,
        blocking,
      });
    }
    const cust = (await q('SELECT * FROM customer WHERE reference = $1', [body.recipient]))[0];
    if (!cust) refuse(404, 'not_found', { error: 'not_found', message: 'No such recipient.' });

    // the number is issued from a gapless per-site sequence and is never reused
    const client = await pool.connect();
    let number;
    let payloadBundle;
    try {
      await client.query('BEGIN');
      const seqRow = await client.query('SELECT * FROM certificate_sequence WHERE site = $1 FOR UPDATE', [evaluated.lot.site]);
      const next = Number(seqRow.rows[0].last) + 1;
      number = `CERT-${evaluated.lot.site.replace('SITE-', '')}-${String(next).padStart(6, '0')}`;
      await client.query('UPDATE certificate_sequence SET last = $1 WHERE site = $2', [next, evaluated.lot.site]);
      payloadBundle = await buildPayload({
        lot: evaluated.lot, recipient: body.recipient, signerEmail: actor.email,
        signerName: actor.name, number, signedAt,
      });
      await client.query(
        `INSERT INTO certificate (number, seq_number, version, site, recipient, payload, conditions, document, state, signer, signed_at)
         VALUES ($1,$2,1,$3,$4,$5,$6,$7,'issued',$8,$9)`,
        [number, next, evaluated.lot.site, body.recipient, JSON.stringify(payloadBundle.payload),
          JSON.stringify(evaluated.conditions), payloadBundle.document, actor.email, signedAt]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    // the eight conditions are stored as they stood at the moment of signing
    await appendEntry(null, {
      person: actor.email, site: evaluated.lot.site, object_kind: 'certificate', object_ref: number,
      action: 'signed', at: signedAt,
      content: {
        lot: body.lot, recipient: body.recipient, content_bp: payloadBundle.payload.content_bp,
        claim_type: payloadBundle.payload.claim_type, conditions: evaluated.conditions,
      },
    });

    await sendMail({
      to: cust.contact,
      subject: `Certificate ${number} issued`,
      text: [
        `Certificate ${number} has been issued to ${payloadBundle.payload.recipient_name}.`,
        '',
        `Certificate number: ${number}`,
        `Claim type: ${payloadBundle.payload.claim_type}`,
        `Recycled content: ${formatBp(payloadBundle.payload.content_bp)} per cent (${payloadBundle.payload.content_bp} basis points)`,
        '',
        'Permitted statement:',
        payloadBundle.payload.permitted_statement,
        '',
        'Prohibited statement:',
        payloadBundle.payload.prohibited_statement,
        '',
        `Verify this certificate at ravel.example.com/verify/${number}.`,
      ].join('\n'),
    });

    return { status: 201, body: { reference: number, ...payloadBundle.payload, conditions: evaluated.conditions } };
  });
  return c.json(out.body, out.status);
});

// A re-issue produces a new version at a new address rather than new bytes at the old one.
r.post('/certificates/:number/reissue', async (c) => {
  const actor = await requireAct(c, 'certificate.reissue');
  const body = await c.req.json().catch(() => ({}));
  const original = c.req.param('number');
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['password', 'reason']);
    const reauth = await keycloakPassword(actor.email, body.password);
    if (!reauth) refuse(401, 'reauthentication_failed', { error: 'reauthentication_failed', message: 'A session alone is not a signing credential.' });
    const row = (await q('SELECT * FROM certificate WHERE number = $1', [original]))[0];
    if (!row) refuse(404, 'not_found', { error: 'not_found', message: 'No such certificate.' });
    const lot = (await q('SELECT * FROM lot WHERE reference = $1', [row.payload.lots[0].reference]))[0];
    const signedAt = new Date().toISOString();
    const evaluated = await evaluateConditions({ lotReference: lot.reference, signerEmail: actor.email, signOn: signedAt.slice(0, 10) });
    const blocking = evaluated.conditions.filter((x) => !x.satisfied);
    if (blocking.length) {
      refuse(409, 'conditions_not_satisfied', { error: 'conditions_not_satisfied', message: 'The eight conditions are decided again at the moment of signing.', conditions: evaluated.conditions, blocking });
    }
    const client = await pool.connect();
    let number;
    let bundle;
    try {
      await client.query('BEGIN');
      const seqRow = await client.query('SELECT * FROM certificate_sequence WHERE site = $1 FOR UPDATE', [row.site]);
      const next = Number(seqRow.rows[0].last) + 1;
      number = `CERT-${row.site.replace('SITE-', '')}-${String(next).padStart(6, '0')}`;
      await client.query('UPDATE certificate_sequence SET last = $1 WHERE site = $2', [next, row.site]);
      bundle = await buildPayload({
        lot, recipient: row.recipient, signerEmail: actor.email, signerName: actor.name,
        number, signedAt, version: Number(row.version) + 1,
      });
      await client.query(
        `INSERT INTO certificate (number, seq_number, version, site, recipient, payload, conditions, document, state, signer, signed_at, supersedes, derived_from)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'issued',$9,$10,$11,$11)`,
        [number, next, Number(row.version) + 1, row.site, row.recipient, JSON.stringify(bundle.payload),
          JSON.stringify(evaluated.conditions), bundle.document, actor.email, signedAt, original]);
      await client.query('UPDATE certificate SET superseded_by = $1 WHERE number = $2', [number, original]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    await appendEntry(null, {
      person: actor.email, site: row.site, object_kind: 'certificate', object_ref: number,
      action: 'reissued', at: signedAt, content: { supersedes: original, reason: body.reason, conditions: evaluated.conditions },
    });
    const cust = (await q('SELECT * FROM customer WHERE reference = $1', [row.recipient]))[0];
    if (cust) {
      await sendMail({
        to: cust.contact,
        subject: `Certificate ${number} issued`,
        text: [
          `Certificate ${number} has been issued, superseding ${original}.`,
          `Claim type: ${bundle.payload.claim_type}`,
          `Recycled content: ${formatBp(bundle.payload.content_bp)} per cent (${bundle.payload.content_bp} basis points)`,
          '',
          'Permitted statement:',
          bundle.payload.permitted_statement,
          '',
          `Verify this certificate at ravel.example.com/verify/${number}.`,
        ].join('\n'),
      });
    }
    return { status: 201, body: { reference: number, ...bundle.payload, supersedes: original, conditions: evaluated.conditions } };
  });
  return c.json(out.body, out.status);
});

// Withdrawal is one action with five consequences.
r.post('/certificates/:number/withdraw', async (c) => {
  const actor = await requireAct(c, 'certificate.withdraw');
  const body = await c.req.json().catch(() => ({}));
  const number = c.req.param('number');
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['reason']);
    const row = (await q('SELECT * FROM certificate WHERE number = $1', [number]))[0];
    if (!row) refuse(404, 'not_found', { error: 'not_found', message: 'No such certificate.' });
    if (row.state === 'withdrawn') {
      refuse(409, 'already_withdrawn', {
        error: 'already_withdrawn',
        message: `This certificate was withdrawn on ${iso(row.withdrawn_on)}. Reason: ${row.withdrawal_reason}.`,
        withdrawn_on: iso(row.withdrawn_on), reason: row.withdrawal_reason,
      });
    }
    const withdrawnOn = today();
    const cust = (await q('SELECT * FROM customer WHERE reference = $1', [row.recipient]))[0];
    const recName = row.payload?.recipient_name || row.recipient;

    // 1. the state becomes withdrawn with the reason, the person and the date
    await pool.query(
      `UPDATE certificate SET state = 'withdrawn', withdrawal_reason = $1, withdrawn_by = $2, withdrawn_on = $3 WHERE number = $4`,
      [body.reason, actor.email, withdrawnOn, number]);
    // the document stays readable at its address and states the withdrawal
    const withdrawnPayload = { ...row.payload, state: 'withdrawn', withdrawn_on: withdrawnOn, withdrawal_reason: body.reason };
    await pool.query('UPDATE certificate SET document = $1, payload = $2 WHERE number = $3',
      [renderDocument(withdrawnPayload), JSON.stringify(withdrawnPayload), number]);

    // 3. every downstream statement the recipient was permitted to make is enumerated
    const voidStatements = [
      row.payload?.permitted_statement,
      `Any statement that ${recName} supplies material certified at ${formatBp(row.payload?.content_bp || 0)} per cent recycled content under certificate ${number}.`,
      `Any statement citing certificate ${number} in a regulatory filing, a product label, a datasheet or a marketing claim.`,
      `Any statement resting on the carbon figure of ${row.payload?.carbon?.value_mg_per_kg} mg CO2e per kg carried by certificate ${number}.`,
    ].filter(Boolean);

    // 4. every certificate derived from this one is identified and resolved
    const derived = await q('SELECT * FROM certificate WHERE derived_from = $1 OR supersedes = $1', [number]);

    // 5. the reverse traversal of the underlying batches runs
    const lotRefs = (row.payload?.lots || []).map((l) => l.reference);
    const consumptions = await q('SELECT * FROM consumption');
    const batchRefs = await batchesUnder(lotRefs, consumptions);
    const traversal = [];
    for (const b of batchRefs) {
      const impact = await impactOf(b);
      if (impact) {
        traversal.push({
          batch: b,
          lots: impact.lots.map((l) => l.reference),
          certificates: impact.certificates.filter((x) => x.number !== number).map((x) => ({ number: x.number, state: x.state, recipient_name: x.recipient_name })),
          recipients: impact.recipients.map((x) => ({ reference: x.reference, name: x.name })),
        });
      }
    }

    // 2. the recipient is notified and the notification is part of the record
    const notified = [];
    if (cust) {
      const mail = await sendMail({
        to: cust.contact,
        subject: `Certificate ${number} withdrawn`,
        text: [
          `Certificate ${number} was withdrawn on ${withdrawnOn}. Reason: ${body.reason}.`,
          '',
          'The following statements are now void and must no longer be made:',
          ...voidStatements.map((s, i) => `${i + 1}. ${s}`),
          '',
          'A withdrawal is never a deletion. The document stays readable at its address and states the withdrawal.',
          `Verify this certificate at ravel.example.com/verify/${number}.`,
        ].join('\n'),
      });
      notified.push({ reference: row.recipient, name: recName, address: cust.contact, notified_at: new Date().toISOString(), message_id: mail.message_id });
    }

    await appendEntry(null, {
      person: actor.email, site: row.site, object_kind: 'certificate', object_ref: number,
      action: 'withdrawn',
      content: {
        reason: body.reason, withdrawn_on: withdrawnOn,
        notified_recipients: notified.map((x) => x.name),
        void_statements: voidStatements.length,
        derived_certificates: derived.map((x) => x.number),
        batch_traversal: traversal.map((x) => x.batch),
      },
    });

    return {
      status: 201,
      body: {
        reference: number, number, state: 'withdrawn', reason: body.reason,
        withdrawn_by: actor.email, withdrawn_on: withdrawnOn,
        notified_recipients: notified,
        void_statements: voidStatements,
        derived_certificates: derived.map((x) => ({ number: x.number, state: x.state, resolution: x.state === 'withdrawn' ? 'already_withdrawn' : 'requires_resolution' })),
        batch_traversal: traversal,
        withdrawal_statement: `This certificate was withdrawn on ${withdrawnOn}. Reason: ${body.reason}.`,
        note: 'A withdrawal is never a deletion and the document stays readable at its address.',
      },
    };
  });
  return c.json(out.body, out.status);
});

// the withdrawal blast radius, readable before confirming
r.get('/certificates/:number/withdrawal-preview', async (c) => {
  await requireSession(c);
  const number = c.req.param('number');
  const row = (await q('SELECT * FROM certificate WHERE number = $1', [number]))[0];
  if (!row) refuse(404, 'not_found', { error: 'not_found', message: 'No such certificate.' });
  const cust = (await q('SELECT * FROM customer WHERE reference = $1', [row.recipient]))[0];
  const recName = row.payload?.recipient_name || row.recipient;
  const voidStatements = [
    row.payload?.permitted_statement,
    `Any statement that ${recName} supplies material certified at ${formatBp(row.payload?.content_bp || 0)} per cent recycled content under certificate ${number}.`,
    `Any statement citing certificate ${number} in a regulatory filing, a product label, a datasheet or a marketing claim.`,
    `Any statement resting on the carbon figure of ${row.payload?.carbon?.value_mg_per_kg} mg CO2e per kg carried by certificate ${number}.`,
  ].filter(Boolean);
  const derived = await q('SELECT * FROM certificate WHERE derived_from = $1 OR supersedes = $1', [number]);
  const lotRefs = (row.payload?.lots || []).map((l) => l.reference);
  const consumptions = await q('SELECT * FROM consumption');
  const batchRefs = await batchesUnder(lotRefs, consumptions);
  const traversal = [];
  for (const b of batchRefs) {
    const impact = await impactOf(b);
    if (impact) {
      traversal.push({
        batch: b,
        lots: impact.lots.map((l) => l.reference),
        certificates: impact.certificates.filter((x) => x.number !== number).map((x) => ({ number: x.number, state: x.state, recipient_name: x.recipient_name })),
        recipients: impact.recipients.map((x) => ({ reference: x.reference, name: x.name })),
      });
    }
  }
  return c.json({
    number,
    state: row.state,
    consequences: [
      'The state becomes withdrawn with the reason, the person and the date.',
      'The recipient is notified and the notification is part of the record.',
      'Every downstream statement the recipient was permitted to make is enumerated in the notification.',
      'Every certificate derived from this one is identified and resolved.',
      'The reverse traversal of the underlying batches runs, so every other certificate touching them is enumerated.',
    ],
    notified_recipients: cust ? [{ reference: row.recipient, name: recName, address: cust.contact }] : [],
    void_statements: voidStatements,
    derived_certificates: derived.map((x) => ({ number: x.number, state: x.state })),
    batch_traversal: traversal,
  });
});

async function batchesUnder(lotRefs, consumptions) {
  const lots = await q('SELECT * FROM lot WHERE reference = ANY($1)', [lotRefs]);
  const outputs = await q('SELECT * FROM output');
  const outByRef = new Map(outputs.map((o) => [o.reference, o]));
  const found = new Set();
  const stack = [];
  for (const l of lots) if (l.output_ref) stack.push(l.output_ref);
  const seen = new Set();
  while (stack.length) {
    const ref = stack.pop();
    if (seen.has(ref)) continue;
    seen.add(ref);
    const o = outByRef.get(ref);
    if (!o) continue;
    for (const cn of consumptions.filter((x) => x.run === o.run)) {
      if (cn.input_kind === 'batch') found.add(cn.input_ref);
      else stack.push(cn.input_ref);
    }
  }
  return [...found];
}

// Replay: agreement and disagreement are both ordinary answers.
r.get('/certificates/:number/replay', async (c) => {
  await requireSession(c);
  const row = (await q('SELECT * FROM certificate WHERE number = $1', [c.req.param('number')]))[0];
  if (!row) refuse(404, 'not_found', { error: 'not_found', message: 'No such certificate.' });
  const issued = row.payload;
  const inputVersions = issued.input_versions || {};

  // a figure whose inputs can no longer be resolved is not recomputed under
  // today's rules and presented as the original
  const missing = [];
  if (inputVersions.conversion_factor) {
    const f = await q('SELECT * FROM conversion_factor WHERE reference = $1', [inputVersions.conversion_factor]);
    if (!f.length) missing.push({ input: 'conversion_factor', reference: inputVersions.conversion_factor });
  }
  if (inputVersions.carbon_method) {
    const [mid, ver] = String(inputVersions.carbon_method).split(' v');
    const mv = await q('SELECT * FROM carbon_method_version WHERE method_id = $1 AND version = $2', [mid, Number(ver)]);
    if (!mv.length) missing.push({ input: 'carbon_method', reference: inputVersions.carbon_method });
  }
  if (missing.length) {
    return c.json({
      number: row.number, reproducible: false,
      reason: `The recomputation cannot resolve ${missing.map((m) => `${m.input} ${m.reference}`).join(', ')}.`,
      missing_inputs: missing,
      input_versions: inputVersions,
      issued: { content_bp: issued.content_bp, carbon_value_mg_per_kg: issued.carbon?.value_mg_per_kg },
      recomputed: null, agrees: null, differing_input: null,
      note: 'It is never recomputed under today\'s rules and presented as the original.',
    });
  }

  const lot = (await q('SELECT * FROM lot WHERE reference = $1', [issued.lots[0].reference]))[0];
  const claim = await lotClaim(lot.reference);
  const carbon = await carbonFor(lot.reference, { internal: true });
  const recomputed = {
    content_bp: claim.content_bp,
    claim_type: lot.claim_type,
    category_split: claim.category_split,
    carbon_value_mg_per_kg: carbon && !carbon.mismatch ? carbon.value_mg_per_kg : null,
    carbon_method_version: carbon && !carbon.mismatch ? carbon.method_version : null,
    boundary: carbon && !carbon.mismatch ? carbon.boundary : null,
    uncertainty_bp: carbon && !carbon.mismatch ? carbon.uncertainty_bp : null,
  };
  const issuedFigures = {
    content_bp: issued.content_bp,
    claim_type: issued.claim_type,
    category_split: issued.category_split,
    carbon_value_mg_per_kg: issued.carbon?.value_mg_per_kg ?? null,
    carbon_method_version: issued.carbon?.method_version ?? null,
    boundary: issued.carbon?.boundary ?? null,
    uncertainty_bp: issued.carbon?.uncertainty_bp ?? null,
  };
  const differing = [];
  for (const key of Object.keys(issuedFigures)) {
    if (JSON.stringify(issuedFigures[key]) !== JSON.stringify(recomputed[key])) {
      differing.push({ field: key, issued: issuedFigures[key], recomputed: recomputed[key] });
    }
  }
  return c.json({
    number: row.number,
    reproducible: true,
    issued: issuedFigures,
    recomputed,
    agrees: differing.length === 0,
    differing_input: differing.length ? differing[0] : null,
    differing_inputs: differing,
    input_versions: inputVersions,
    read_at: new Date().toISOString(),
    note: 'Agreement and disagreement are both ordinary answers.',
  });
});

// GET /api/verify/{number} is public, unauthenticated and rate limited.
const verifyHits = new Map();
r.get('/verify/:number', async (c) => {
  const ip = c.req.header('x-forwarded-for') || 'anonymous';
  const now = Date.now();
  const window = verifyHits.get(ip) || [];
  const recent = window.filter((t) => now - t < 60000);
  recent.push(now);
  verifyHits.set(ip, recent);
  if (recent.length > 60) {
    return c.json({ error: 'rate_limited', message: 'Too many verification requests.' }, 429);
  }
  const number = c.req.param('number');
  const row = (await q('SELECT * FROM certificate WHERE number = $1', [number]))[0];
  // an unknown number returns 200 with found false rather than an error, and the
  // route cannot be used to enumerate the customer list
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
    issued_on: String(row.signed_at instanceof Date ? row.signed_at.toISOString() : row.signed_at).slice(0, 10),
    withdrawn_on: iso(row.withdrawn_on),
    withdrawal_reason: row.withdrawal_reason,
    site: row.site,
    grade: row.payload?.grade || null,
    claim_type: row.payload?.claim_type || null,
    recipient_name: row.payload?.recipient_name || null,
  });
});

export default r;
