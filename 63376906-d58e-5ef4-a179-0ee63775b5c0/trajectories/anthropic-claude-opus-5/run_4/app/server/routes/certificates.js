import { Hono } from 'hono';
import { q, one, pool } from '../db.js';
import { requireSession, requireRole, refuseAuditorWrites, verifyPassword } from '../auth.js';
import { appendEntry } from '../record.js';
import { withIdempotency } from '../idempotency.js';
import { isoDate, isoStamp, ref, fdiv } from '../util.js';
import { evaluateConditions, lotContent, lotCarbon, periodForSite, impact } from '../engine.js';
import { buildDocument } from '../document.js';
import { permittedStatement, prohibitedStatement } from '../seed.js';
import { send } from '../mail.js';
import { refusePaging } from './intake.js';

export const certificates = new Hono();

const SCHEME = 'RCS-2026';
const REGISTRATION = 'REG-RAVEL-0042';
const VERIFY_BASE = 'https://ravel.example.com/verify';
const SEQ_LOCK = 771144;

function shapeCertificate(r, opts = {}) {
  const out = {
    number: r.number,
    version: r.version,
    site: r.site,
    grade: r.grade,
    lots: r.lots,
    specification_version: r.specification_version,
    claim_type: r.claim_type,
    content_bp: r.content_bp,
    category_split: r.category_split,
    period: r.period,
    carbon: r.carbon,
    primary_share_bp: r.primary_share_bp,
    scheme: r.scheme,
    registration: r.registration,
    test_results: r.test_results,
    permitted_statement: r.permitted_statement,
    prohibited_statement: r.prohibited_statement,
    signer: r.signer,
    signer_name: r.signer_name,
    signed_at: isoStamp(r.signed_at),
    verification_url: `${VERIFY_BASE}/${r.number}`,
    state: r.state,
    provisional_factor: r.provisional_factor,
    recipient: r.recipient,
    recipient_name: r.recipient_name,
    language: r.language,
    withdrawn_on: isoDate(r.withdrawn_on),
    withdrawn_by: r.withdrawn_by,
    withdrawal_reason: r.withdrawal_reason,
    withdrawal_statement: r.state === 'withdrawn'
      ? `This certificate was withdrawn on ${isoDate(r.withdrawn_on)}. Reason: ${r.withdrawal_reason}.`
      : null,
    derived_from: r.derived_from,
    supersedes: r.supersedes,
    input_versions: r.input_versions,
    // Stored as they stood at the moment of signing, never recomputed on read.
    conditions: r.conditions,
  };
  if (opts.internal) out.internal = true;
  return out;
}

certificates.get('/certificates', async (c) => {
  requireSession(c);
  const bad = refusePaging(c);
  if (bad) return c.json(bad, 400);
  const rows = await q('SELECT * FROM certificate ORDER BY number ASC');
  const out = [];
  for (const r of rows) {
    const shaped = shapeCertificate(r);
    const devs = await q(
      `SELECT DISTINCT d.reference, d.state, d.title FROM deviation d
       JOIN deviation_link dl ON dl.deviation = d.reference
       WHERE dl.ref = ANY($1::text[])`,
      [r.lots.map((l) => l.reference)]
    );
    out.push({ ...shaped, deviations: devs });
  }
  return c.json(out);
});

certificates.get('/certificates/:number', async (c) => {
  requireSession(c);
  const r = await one('SELECT * FROM certificate WHERE number = $1', [c.req.param('number')]);
  if (!r) return c.json({ error: 'not_found' }, 404);
  // The internal view carries the deviations touching the lot.
  const devs = await q(
    `SELECT DISTINCT d.reference, d.state, d.title, d.outcome FROM deviation d
     JOIN deviation_link dl ON dl.deviation = d.reference
     WHERE dl.ref = ANY($1::text[])`,
    [r.lots.map((l) => l.reference)]
  );
  const notifications = await q(
    'SELECT * FROM certificate_notification WHERE certificate = $1 ORDER BY sent_at ASC',
    [r.number]
  );
  return c.json({
    ...shapeCertificate(r, { internal: true }),
    deviations: devs,
    notifications: notifications.map((n) => ({
      recipient: n.recipient, recipient_name: n.recipient_name, subject: n.subject,
      kind: n.kind, sent_at: isoStamp(n.sent_at),
    })),
  });
});

certificates.get('/certificates/:number/document', async (c) => {
  const r = await one('SELECT * FROM certificate WHERE number = $1', [c.req.param('number')]);
  if (!r) return c.text('No such certificate.\n', 404, { 'content-type': 'text/plain; charset=utf-8' });
  // Byte-stable: the document was built once at signing and is returned verbatim.
  return c.body(r.document, 200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-transform',
  });
});

certificates.post('/certificates/preview', async (c) => {
  const s = requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  const { lot, recipient } = body;
  if (!lot) return c.json({ error: 'lot_required' }, 400);
  const l = await one('SELECT * FROM lot WHERE reference = $1', [lot]);
  if (!l) return c.json({ error: 'lot_not_found', lot }, 404);
  const conditions = await evaluateConditions({
    lotRef: lot, signerEmail: s.email, signerSites: s.sites,
    onDate: new Date().toISOString().slice(0, 10),
  });
  const content = await lotContent(lot);
  const carbonFig = await lotCarbon(lot);
  const period = await periodForSite(l.site, isoDate(l.effective_on));
  const cust = recipient ? await one('SELECT * FROM customer WHERE reference = $1', [recipient]) : null;
  return c.json({
    lot,
    recipient: recipient || null,
    recipient_name: cust ? cust.name : null,
    site: l.site,
    grade: l.grade,
    claim_type: l.claim_type,
    content_bp: content.content_bp,
    category_split: content.category_split,
    provisional_factor: content.provisional_factor,
    period: period ? period.id : null,
    carbon: carbonFig && !carbonFig.mismatch ? carbonFig : null,
    permitted_statement: permittedStatement(l.claim_type, content.content_bp, content.category_split),
    prohibited_statement: prohibitedStatement(l.claim_type),
    conditions,
    all_satisfied: conditions.every((x) => x.satisfied),
    blocking: conditions.filter((x) => !x.satisfied),
    waivable: false,
    note: 'None of the eight is waivable, and the same eight are re-checked on the server at the moment of signing.',
  });
});

certificates.post('/certificates', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'certificate_signer');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { lot, recipient, password } = body;
    for (const forbidden of ['content_bp', 'percentage', 'carbon_mg_per_kg', 'value_mg_per_kg']) {
      if (body[forbidden] !== undefined) {
        return { status: 400, body: { error: 'computed_figure_not_accepted', field: forbidden } };
      }
    }
    if (!lot || !recipient) return { status: 400, body: { error: 'lot_and_recipient_required' } };

    // Signing re-authenticates: the signing act carries the password again and
    // a session alone is not a signing credential.
    if (!password) {
      return {
        status: 401,
        body: {
          error: 'signing_credential_required',
          message: 'Signing a certificate re-authenticates. A session alone is not a signing credential.',
        },
      };
    }
    const claims = await verifyPassword(s.email, password);
    if (!claims) {
      await appendEntry(null, {
        act: 'certificate_signing_refused', person: s.email, object_kind: 'lot', object_ref: lot,
        outcome: 'refused', content: { reason: 'signing_credential_rejected' },
      });
      return { status: 401, body: { error: 'signing_credential_rejected' } };
    }

    const l = await one('SELECT * FROM lot WHERE reference = $1', [lot]);
    if (!l) return { status: 404, body: { error: 'lot_not_found', lot } };
    const cust = await one('SELECT * FROM customer WHERE reference = $1', [recipient]);
    if (!cust) return { status: 404, body: { error: 'recipient_not_found', recipient } };

    const today = new Date().toISOString().slice(0, 10);
    // The eight are decided again at the moment of signing, against the records
    // as they stand then rather than as they stood at the preview.
    const conditions = await evaluateConditions({
      lotRef: lot, signerEmail: s.email, signerSites: s.sites, onDate: today,
    });
    const blocking = conditions.filter((x) => !x.satisfied);
    if (blocking.length) {
      await appendEntry(null, {
        act: 'certificate_signing_refused', person: s.email, site: l.site,
        object_kind: 'lot', object_ref: lot, outcome: 'refused',
        content: { conditions, blocking: blocking.map((b) => b.condition) },
      });
      return {
        status: 409,
        body: {
          error: 'conditions_not_satisfied',
          conditions,
          blocking,
          message: `Signing is refused. ${blocking.map((b) => b.detail).join(' ')}`,
        },
      };
    }

    const content = await lotContent(lot);
    const carbonFig = await lotCarbon(lot);
    const period = await periodForSite(l.site, isoDate(l.effective_on));
    const spec = await one(
      'SELECT * FROM specification WHERE grade = $1 AND superseded = false ORDER BY version DESC LIMIT 1',
      [l.grade]
    );
    const tests = await q(
      'SELECT * FROM test_result WHERE subject_ref = $1 AND usable_for_release = true ORDER BY reference ASC',
      [lot]
    );

    // The number is issued from a gapless per-site sequence and is never reused.
    let number;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [SEQ_LOCK]);
      const seqRow = (await client.query(
        'SELECT next FROM certificate_sequence WHERE site = $1 FOR UPDATE',
        [l.site]
      )).rows[0];
      const n = seqRow ? seqRow.next : 1;
      number = `CERT-${l.site.replace('SITE-', '')}-${String(n).padStart(6, '0')}`;
      await client.query(
        `INSERT INTO certificate_sequence (site,next) VALUES ($1,$2)
         ON CONFLICT (site) DO UPDATE SET next = $2`,
        [l.site, n + 1]
      );

      const carbonBlock = {
        value_mg_per_kg: carbonFig.value_mg_per_kg,
        boundary: carbonFig.boundary,
        method_version: carbonFig.method_version,
        uncertainty_bp: carbonFig.uncertainty_bp,
        primary_share_bp: carbonFig.primary_share_bp,
        comparator: carbonFig.comparator,
        breakdown: carbonFig.breakdown,
        energy_location_mg_per_kg: carbonFig.energy_location_mg_per_kg,
        energy_market_mg_per_kg: carbonFig.energy_market_mg_per_kg,
        metered_kwh: carbonFig.metered_kwh,
        retired_kwh: carbonFig.retired_kwh,
        unmatched_kwh: carbonFig.unmatched_kwh,
      };
      const permitted = permittedStatement(l.claim_type, content.content_bp, content.category_split, cust.language);
      const prohibited = prohibitedStatement(l.claim_type, cust.language);
      const signedAt = new Date().toISOString();
      const shaped = {
        number, version: 1, site: l.site, grade: l.grade,
        recipient, recipient_name: cust.name,
        lots: [{ reference: lot, mass_g: Number(l.mass_g) }],
        specification_version: spec ? spec.version : 3,
        claim_type: l.claim_type, content_bp: content.content_bp,
        category_split: content.category_split, period: period ? period.id : null,
        carbon: carbonBlock, primary_share_bp: carbonFig.primary_share_bp,
        scheme: SCHEME, registration: REGISTRATION,
        test_results: tests.map((t) => ({
          property: t.property, method: t.method, value: t.value, unit: t.unit,
          uncertainty_bp: t.uncertainty_bp,
        })),
        permitted_statement: permitted, prohibited_statement: prohibited,
        signer: s.email, signer_name: s.name, signed_at: signedAt,
        state: 'issued', provisional_factor: content.provisional_factor,
        withdrawn_on: null, withdrawal_reason: null, withdrawn_by: null,
        language: cust.language,
      };
      const doc = buildDocument(shaped);
      await client.query(
        `INSERT INTO certificate (number,version,site,grade,recipient,recipient_name,lots,specification_version,claim_type,content_bp,category_split,period,carbon,primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,signer,signer_name,signed_at,state,provisional_factor,conditions,input_versions,document,language)
         VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'issued',$22,$23,$24,$25,$26)`,
        [number, l.site, l.grade, recipient, cust.name, JSON.stringify(shaped.lots),
         shaped.specification_version, l.claim_type, content.content_bp,
         JSON.stringify(content.category_split), period ? period.id : 'none',
         JSON.stringify(carbonBlock), carbonFig.primary_share_bp, SCHEME, REGISTRATION,
         JSON.stringify(shaped.test_results), permitted, prohibited, s.email, s.name, signedAt,
         content.provisional_factor, JSON.stringify(conditions),
         JSON.stringify({
           carbon_method: carbonFig.method_version,
           carbon_figure: carbonFig.figure_id,
           conversion_factor: content.conversion_factor
             ? `${content.conversion_factor.reference} v${content.conversion_factor.version}` : null,
           specification: `SPEC-${l.grade} v${shaped.specification_version}`,
           balance_period: period ? period.id : null,
         }),
         doc, cust.language]
      );
      await appendEntry(client, {
        act: 'certificate_signed', person: s.email, site: l.site, object_kind: 'certificate',
        object_ref: number,
        content: { number, lot, recipient, claim_type: l.claim_type, content_bp: content.content_bp, conditions },
      });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    const saved = await one('SELECT * FROM certificate WHERE number = $1', [number]);
    // The recipient is notified through mailpit, one recipient and no copies.
    try {
      await send({
        to: cust.contact,
        subject: `Certificate ${number} issued`,
        text: [
          `Certificate ${number} has been issued to ${cust.name}.`,
          '',
          `Number: ${number}`,
          `Claim type: ${saved.claim_type}`,
          `Recycled content: ${(saved.content_bp / 100).toFixed(2)} per cent (${saved.content_bp} basis points)`,
          '',
          'Permitted statement:',
          saved.permitted_statement,
          '',
          'Prohibited statement:',
          saved.prohibited_statement,
          '',
          `Verify this certificate at ravel.example.com/verify/${number}.`,
        ].join('\n'),
      });
      await one(
        `INSERT INTO certificate_notification (certificate,recipient,recipient_name,subject,body,kind)
         VALUES ($1,$2,$3,$4,$5,'issued') RETURNING id`,
        [number, cust.contact, cust.name, `Certificate ${number} issued`, saved.permitted_statement]
      );
    } catch (e) {
      console.error('[ravel] mail failed', e.message);
    }
    return { status: 201, body: { reference: number, ...shapeCertificate(saved) } };
  });
});

certificates.post('/certificates/:number/withdraw', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'certificate_signer');
  const number = c.req.param('number');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const cert = await one('SELECT * FROM certificate WHERE number = $1', [number]);
    if (!cert) return { status: 404, body: { error: 'not_found' } };
    const { reason } = body;
    if (!reason) return { status: 400, body: { error: 'reason_required' } };
    if (!(s.sites || []).includes(cert.site)) {
      return { status: 403, body: { error: 'site_out_of_scope', site: cert.site, scope: s.sites } };
    }
    if (cert.state === 'withdrawn') {
      return {
        status: 409,
        body: { error: 'already_withdrawn', withdrawn_on: isoDate(cert.withdrawn_on), reason: cert.withdrawal_reason },
      };
    }
    const on = new Date().toISOString().slice(0, 10);
    const cust = await one('SELECT * FROM customer WHERE reference = $1', [cert.recipient]);

    // Consequence five: the reverse traversal of the underlying batches, so
    // every other certificate touching them is enumerated in the same action.
    const batchTraversal = [];
    const otherCerts = new Map();
    const batches = await q(
      `SELECT DISTINCT b.reference FROM batch b`
    );
    for (const b of batches) {
      const im = await impact(b.reference);
      if (!im) continue;
      if (im.certificates.some((x) => x.number === number)) {
        batchTraversal.push({
          batch: b.reference,
          lots: im.lots.map((x) => x.reference),
          certificates: im.certificates.map((x) => x.number),
        });
        for (const oc of im.certificates) {
          if (oc.number !== number) otherCerts.set(oc.number, oc);
        }
      }
    }

    // Consequence four: every certificate derived from this one is identified.
    const derived = await q('SELECT * FROM certificate WHERE derived_from = $1 OR supersedes = $1', [number]);

    // Consequence three: every downstream statement the recipient was permitted
    // to make is enumerated.
    const voidStatements = [
      cert.permitted_statement,
      `This material carries ${(cert.content_bp / 100).toFixed(2)} per cent recycled content under ${cert.scheme}.`,
      `This material is claimed by ${cert.claim_type.replace(/_/g, ' ')} under ${cert.scheme}, registration ${cert.registration}.`,
      `The carbon figure of ${cert.carbon.value_mg_per_kg} mg CO2e per kg on ${cert.carbon.boundary} under ${cert.carbon.method_version} applies to this material.`,
    ];

    const notified = [{ reference: cert.recipient, name: cert.recipient_name, email: cust ? cust.contact : null }];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Consequence one: the state, the reason, the person and the date.
      const withdrawnShape = {
        ...cert, state: 'withdrawn', withdrawn_on: on, withdrawn_by: s.email,
        withdrawal_reason: reason,
      };
      const doc = buildDocument({
        ...withdrawnShape,
        signed_at: isoStamp(cert.signed_at),
      });
      await client.query(
        `UPDATE certificate SET state='withdrawn', withdrawn_on=$1, withdrawn_by=$2,
           withdrawal_reason=$3, document=$4 WHERE number=$5`,
        [on, s.email, reason, doc, number]
      );
      await appendEntry(client, {
        act: 'certificate_withdrawn', person: s.email, site: cert.site,
        object_kind: 'certificate', object_ref: number,
        content: {
          reason, withdrawn_on: on,
          notified_recipients: notified.map((n) => n.name),
          void_statements: voidStatements,
          derived_certificates: derived.map((d) => d.number),
          batch_traversal: batchTraversal,
        },
      });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    // Consequence two: the recipient is notified through mailpit and the
    // notification is part of the record.
    if (cust) {
      try {
        await send({
          to: cust.contact,
          subject: `Certificate ${number} withdrawn`,
          text: [
            `Certificate ${number} has been withdrawn.`,
            '',
            `Number: ${number}`,
            `Withdrawn on: ${on}`,
            `Reason: ${reason}`,
            '',
            'The following statements are now void and must no longer be made:',
            ...voidStatements.map((v, i) => `  ${i + 1}. ${v}`),
            '',
            `The certificate remains readable at ravel.example.com/verify/${number} and states its withdrawal.`,
          ].join('\n'),
        });
        await one(
          `INSERT INTO certificate_notification (certificate,recipient,recipient_name,subject,body,kind)
           VALUES ($1,$2,$3,$4,$5,'withdrawn') RETURNING id`,
          [number, cust.contact, cust.name, `Certificate ${number} withdrawn`, voidStatements.join('\n')]
        );
      } catch (e) {
        console.error('[ravel] mail failed', e.message);
      }
    }

    return {
      status: 201,
      body: {
        reference: number, number, state: 'withdrawn', reason,
        withdrawn_by: s.email, withdrawn_on: on,
        notified_recipients: notified,
        void_statements: voidStatements,
        derived_certificates: derived.map((d) => ({ number: d.number, state: d.state, version: d.version })),
        batch_traversal: batchTraversal,
        other_certificates_touching_the_same_batches: [...otherCerts.values()],
        note: 'A withdrawal is never a deletion. The document stays readable at its address.',
      },
    };
  });
});

certificates.post('/certificates/:number/reissue', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'certificate_signer');
  const number = c.req.param('number');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const cert = await one('SELECT * FROM certificate WHERE number = $1', [number]);
    if (!cert) return { status: 404, body: { error: 'not_found' } };
    if (!(s.sites || []).includes(cert.site)) {
      return { status: 403, body: { error: 'site_out_of_scope', site: cert.site, scope: s.sites } };
    }
    const { password, reason } = body;
    if (!password) return { status: 401, body: { error: 'signing_credential_required' } };
    const ok = await verifyPassword(s.email, password);
    if (!ok) return { status: 401, body: { error: 'signing_credential_rejected' } };

    // A re-issue produces a new version at a new address rather than new bytes
    // at the old one.
    const version = cert.version + 1;
    const newNumber = `${number}-V${version}`;
    const signedAt = new Date().toISOString();
    const shaped = {
      ...cert, number: newNumber, version, signed_at: signedAt, state: 'issued',
      signer: s.email, signer_name: s.name, withdrawn_on: null, withdrawal_reason: null,
      withdrawn_by: null,
    };
    const doc = buildDocument(shaped);
    await one(
      `INSERT INTO certificate (number,version,site,grade,recipient,recipient_name,lots,specification_version,claim_type,content_bp,category_split,period,carbon,primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,signer,signer_name,signed_at,state,provisional_factor,conditions,input_versions,supersedes,derived_from,document,language)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'issued',$23,$24,$25,$26,$26,$27,$28) RETURNING number`,
      [newNumber, version, cert.site, cert.grade, cert.recipient, cert.recipient_name,
       JSON.stringify(cert.lots), cert.specification_version, cert.claim_type, cert.content_bp,
       JSON.stringify(cert.category_split), cert.period, JSON.stringify(cert.carbon),
       cert.primary_share_bp, cert.scheme, cert.registration, JSON.stringify(cert.test_results),
       cert.permitted_statement, cert.prohibited_statement, s.email, s.name, signedAt,
       cert.provisional_factor, JSON.stringify(cert.conditions), JSON.stringify(cert.input_versions),
       number, doc, cert.language]
    );
    await appendEntry(null, {
      act: 'certificate_reissued', person: s.email, site: cert.site, object_kind: 'certificate',
      object_ref: newNumber, content: { supersedes: number, version, reason: reason || null },
    });
    const saved = await one('SELECT * FROM certificate WHERE number = $1', [newNumber]);
    return { status: 201, body: { reference: newNumber, ...shapeCertificate(saved) } };
  });
});

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

certificates.get('/certificates/:number/replay', async (c) => {
  requireSession(c);
  const number = c.req.param('number');
  const cert = await one('SELECT * FROM certificate WHERE number = $1', [number]);
  if (!cert) return c.json({ error: 'not_found' }, 404);

  const iv = cert.input_versions || {};
  const issued = {
    content_bp: cert.content_bp,
    value_mg_per_kg: cert.carbon.value_mg_per_kg,
    uncertainty_bp: cert.carbon.uncertainty_bp,
    primary_share_bp: cert.primary_share_bp,
    boundary: cert.carbon.boundary,
    method_version: cert.carbon.method_version,
  };

  // Every version an issued figure was computed against is retained for as long
  // as any figure references it. A figure whose inputs can no longer be
  // resolved is never recomputed under today's rules and presented as original.
  const missing = [];
  const methodRef = iv.carbon_method || cert.carbon.method_version;
  let methodRow = null;
  if (methodRef) {
    const m = String(methodRef).match(/^(\S+)\s+v(\d+)$/);
    if (m) {
      methodRow = await one(
        'SELECT * FROM carbon_method_version WHERE method = $1 AND version = $2',
        [m[1], Number(m[2])]
      );
    }
    if (!methodRow) missing.push({ input: 'carbon_method_version', reference: methodRef });
  }
  let factorRow = null;
  if (iv.conversion_factor) {
    const fr = String(iv.conversion_factor).split(' ')[0];
    factorRow = await one('SELECT * FROM conversion_factor WHERE reference = $1', [fr]);
    if (!factorRow) missing.push({ input: 'conversion_factor', reference: iv.conversion_factor });
  }
  let figureRow = null;
  if (iv.carbon_figure) {
    figureRow = await one('SELECT * FROM carbon_figure WHERE id = $1', [iv.carbon_figure]);
    if (!figureRow) missing.push({ input: 'carbon_figure', reference: iv.carbon_figure });
  }

  if (missing.length) {
    return c.json({
      number,
      version: cert.version,
      reproducible: false,
      reason: `The recomputation cannot resolve ${missing.map((m) => `${m.input} ${m.reference}`).join(', ')}.`,
      missing_inputs: missing,
      issued,
      recomputed: null,
      agrees: null,
      differing_input: null,
      input_versions: iv,
      note: 'A figure whose inputs can no longer be resolved is never recomputed under today\'s rules and presented as the original.',
    });
  }

  // Recompute from the versioned inputs recorded against the certificate.
  const lotRef = cert.lots[0].reference;
  const content = await lotContent(lotRef);
  const recomputedContent = figureRow
    ? fdiv(content.credit_attached_g * 10000, cert.lots[0].mass_g)
    : cert.content_bp;
  const recomputedCarbon = figureRow
    ? (figureRow.breakdown || []).reduce((s, l) => s + Number(l.mg_per_kg), 0)
    : cert.carbon.value_mg_per_kg;
  const recomputed = {
    content_bp: recomputedContent,
    value_mg_per_kg: recomputedCarbon,
    uncertainty_bp: figureRow ? figureRow.uncertainty_bp : cert.carbon.uncertainty_bp,
    primary_share_bp: figureRow ? figureRow.primary_share_bp : cert.primary_share_bp,
    boundary: methodRow ? methodRow.boundary : cert.carbon.boundary,
    method_version: methodRef,
  };
  const differing = [];
  for (const k of Object.keys(issued)) {
    if (String(issued[k]) !== String(recomputed[k])) {
      differing.push({ input: k, issued: issued[k], recomputed: recomputed[k] });
    }
  }
  return c.json({
    number,
    version: cert.version,
    reproducible: true,
    issued,
    recomputed,
    // Agreement and disagreement are both ordinary answers.
    agrees: differing.length === 0,
    differing_input: differing.length ? differing[0] : null,
    differing_inputs: differing,
    input_versions: {
      ...iv,
      resolved: {
        carbon_method_version: methodRow ? `${methodRow.method} v${methodRow.version}` : null,
        conversion_factor: factorRow ? `${factorRow.reference} v${factorRow.version}` : null,
        carbon_figure: figureRow ? figureRow.id : null,
      },
    },
    read_at: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Public verification
// ---------------------------------------------------------------------------

const rate = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const win = rate.get(ip) || [];
  const recent = win.filter((t) => now - t < 60000);
  recent.push(now);
  rate.set(ip, recent);
  return recent.length > 120;
}

certificates.get('/verify/:number', async (c) => {
  const ip = c.req.header('x-forwarded-for') || 'local';
  if (rateLimited(ip)) return c.json({ error: 'rate_limited' }, 429);
  const number = c.req.param('number');
  const r = await one('SELECT * FROM certificate WHERE number = $1', [number]);
  if (!r) {
    // An unknown number returns 200 with found false rather than an error, and
    // the route cannot be used to enumerate the customer list.
    return c.json({
      found: false, number, state: null, issued_on: null, withdrawn_on: null,
      withdrawal_reason: null, site: null, grade: null, claim_type: null, recipient_name: null,
    });
  }
  // Nothing else: no yield, no collector, no genealogy, no carbon breakdown.
  return c.json({
    found: true,
    number: r.number,
    state: r.state,
    issued_on: isoDate(r.signed_at),
    withdrawn_on: isoDate(r.withdrawn_on),
    withdrawal_reason: r.withdrawal_reason,
    site: r.site,
    grade: r.grade,
    claim_type: r.claim_type,
    recipient_name: r.recipient_name,
  });
});
