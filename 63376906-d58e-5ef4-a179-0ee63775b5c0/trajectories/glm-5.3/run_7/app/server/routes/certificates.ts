// Certificates: preview, sign, document, withdraw, replay, re-issue, verify is public.
import { Hono } from 'hono';
import { db } from '../dbindex.ts';
import { requireSession, requireRole, deny, readJson, requireFields, rememberIdempotent, rateLimit } from '../middleware.js';
import { evaluateConditions, statement, EIGHT, CONDITION_TEXT } from '../engine/certificates.js';
import { batchImpact } from '../engine/genealogy.js';
import { record } from '../engine/record.js';
import { sendMail } from '../mail.js';
import { verifyPasswordAgain } from './auth.js';

export const certificateRoutes = new Hono();

const VERIFICATION_BASE = 'https://ravel.example.com/verify/';

certificateRoutes.get('/certificates', async (c) => {
  await requireSession(c);
  const rows = (await db.query('SELECT * FROM certificates ORDER BY number')).rows;
  return c.json(rows.map(certSummary));
});

function certSummary(x: any) {
  return {
    number: x.number, version: x.version, site: x.site, grade: x.grade, period: x.period,
    claim_type: x.claim_type, content_bp: x.content_bp, state: x.state, recipient: x.recipient,
    lots: x.lots, specification_version: x.specification_version, signer: x.signer, signed_at: x.signed_at,
    withdrawn_on: x.withdrawn_on, withdrawal_reason: x.withdrawal_reason,
    provisional_factor: x.provisional_factor,
    carbon: x.carbon_figure
  };
}

certificateRoutes.get('/certificates/:number', async (c) => {
  await requireSession(c);
  const x = await fullCertificate(c.req.param('number'));
  return c.json(x);
});

async function fullCertificate(number: string) {
  const x = (await db.query('SELECT * FROM certificates WHERE number=$1', [number])).rows[0];
  if (!x) deny('certificate_not_found', 'No such certificate.', 404);
  const figure = x.carbon_figure ? (await db.query('SELECT * FROM carbon_figures WHERE id=$1', [x.carbon_figure])).rows[0] : null;
  const method = figure ? (await db.query('SELECT * FROM carbon_methods WHERE id=$1 AND version=$2', [figure.method_id, figure.method_version])).rows[0] : null;
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
    recipient: x.recipient,
    carbon: figure ? {
      value_mg_per_kg: Number(figure.value_mg_per_kg),
      boundary: method?.boundary,
      method_version: `${figure.method_id} v${figure.method_version}`,
      uncertainty_bp: figure.uncertainty_bp,
      primary_share_bp: figure.primary_share_bp
    } : null,
    primary_share_bp: figure ? figure.primary_share_bp : null,
    scheme: x.scheme,
    registration: x.registration,
    test_results: x.test_results,
    permitted_statement: x.permitted_statement,
    prohibited_statement: x.prohibited_statement,
    signer: x.signer,
    signed_at: x.signed_at,
    verification_url: VERIFICATION_BASE + x.number,
    state: x.state,
    provisional_factor: x.provisional_factor,
    conditions: x.conditions,
    withdrawn_by: x.withdrawn_by,
    withdrawn_on: x.withdrawn_on,
    withdrawal_reason: x.withdrawal_reason,
    notified_recipients: x.notified_recipients,
    void_statements: x.void_statements,
    derived_certificates: x.derived_certificates,
    batch_traversal: x.batch_traversal,
    derived_from: x.derived_from
  };
}

certificateRoutes.post('/certificates/preview', async (c) => {
  const s = await requireRole(c, ['certificate_signer']);
  const body = await readJson(c);
  requireFields(body, ['lot', 'recipient']);
  const { conditions, period } = await evaluateConditions(db, body.lot, s.email, new Date().toISOString().slice(0, 10));
  return c.json({
    lot: body.lot, recipient: body.recipient, period,
    conditions: conditions.map((cond) => ({ condition: cond.condition, satisfied: cond.satisfied, blocking_reference: cond.blocking_reference, statement: CONDITION_TEXT[cond.condition] }))
  });
});

certificateRoutes.post('/certificates', async (c) => {
  const s = await requireRole(c, ['certificate_signer']);
  const body = await readJson(c);
  requireFields(body, ['lot', 'recipient', 'password']);
  if (!body.password) deny('reauthentication_required', 'Signing carries the password again; a session alone is not a signing credential.', 401);
  const passwordOk = await verifyPasswordAgain(s.email, body.password);
  if (!passwordOk) deny('reauthentication_failed', 'The password was not accepted for this signing act.', 401);

  const lotRef = body.lot;
  const lot = (await db.query('SELECT * FROM lots WHERE reference=$1', [lotRef])).rows[0];
  if (!lot) deny('lot_not_found', 'No such lot.', 404);
  if (!s.sites.includes(lot.site)) {
    await record(db, { person: s.email, site: lot.site, act: 'refused_signing_scope', object_kind: 'certificate', object_reference: lotRef, detail: { reason: 'site_out_of_scope', grant_sites: s.sites } });
    deny('site_out_of_scope', `Your signing scope does not cover ${lot.site}.`, 403);
  }

  const signingDate = new Date().toISOString().slice(0, 10);
  const { conditions, period } = await evaluateConditions(db, lotRef, s.email, signingDate);
  const blocking = conditions.filter((x) => !x.satisfied);
  if (blocking.length) {
    await record(db, {
      person: s.email, site: lot.site, act: 'refused_certificate_signing', object_kind: 'certificate', object_reference: lotRef,
      detail: { blocking_conditions: blocking.map((b) => b.condition) }
    });
    return c.json({
      error: 'conditions_not_satisfied',
      message: `Signing is refused. The condition that changed or fails: ${blocking.map((b) => CONDITION_TEXT[b.condition]).join(' ')}`,
      conditions: conditions.map((cond) => ({ condition: cond.condition, satisfied: cond.satisfied, blocking_reference: cond.blocking_reference, statement: CONDITION_TEXT[cond.condition] }))
    }, 409);
  }

  // suspension in force at the date of signing stops issuing
  const suspension = (await db.query(
    `SELECT * FROM site_events WHERE site=$1 AND kind='certification_suspended' AND effective_from <= $2 AND (effective_to IS NULL OR effective_to >= $2)`,
    [lot.site, signingDate]
  )).rows[0];
  if (suspension) {
    await record(db, { person: s.email, site: lot.site, act: 'refused_certificate_signing', object_kind: 'certificate', object_reference: lotRef, detail: { reason: 'certification_suspended', window: [suspension.effective_from, suspension.effective_to] } });
    return c.json({ error: 'certification_suspended', message: `Issuing is stopped for ${lot.site}: the site's certification is suspended from ${suspension.effective_from}.`, window: { from: suspension.effective_from, to: suspension.effective_to } }, 409);
  }

  const seq = await db.connect();
  let number: string;
  try {
    await seq.query('BEGIN');
    await seq.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['certseq:' + lot.site]);
    const row = (await seq.query('SELECT next_number FROM certificate_sequences WHERE site=$1 FOR UPDATE', [lot.site])).rows[0];
    const prefix = lot.site === 'SITE-PILOT' ? 'CERT-PILOT' : lot.site === 'SITE-DEMO' ? 'CERT-DEMO' : 'CERT-COMM';
    number = `${prefix}-${String(row.next_number).padStart(6, '0')}`;
    await seq.query('UPDATE certificate_sequences SET next_number=$1 WHERE site=$2', [Number(row.next_number) + 1, lot.site]);
    await seq.query('COMMIT');
  } catch (e) {
    await seq.query('ROLLBACK').catch(() => {});
    seq.release();
    throw e;
  }
  seq.release();

  const attachedRows = (await db.query(`SELECT category, mass_g FROM credit_movements WHERE lot=$1 AND direction='out'`, [lotRef])).rows;
  const attached = attachedRows.reduce((a: number, r: any) => a + Number(r.mass_g), 0);
  const contentBp = Math.floor((attached * 10000) / Number(lot.mass_g));
  const split: Record<string, number> = {};
  for (const r of attachedRows) split[r.category] = (split[r.category] || 0) + Number(r.mass_g);
  for (const k of Object.keys(split)) split[k] = Math.floor((split[k] * 100) / attached);

  const recipient = (await db.query('SELECT * FROM customers WHERE reference=$1', [body.recipient])).rows[0];
  const lang = recipient?.industry === 'automotive' ? 'en' : 'en';
  const stmt = statement(lot.claim_type, contentBp, split, lang);

  const factor = (await db.query('SELECT * FROM conversion_factors WHERE site=$1 AND superseded_by IS NULL ORDER BY published_on DESC LIMIT 1', [lot.site])).rows[0];
  const figure = (await db.query('SELECT * FROM carbon_figures WHERE lot=$1 ORDER BY computed_at DESC LIMIT 1', [lotRef])).rows[0];
  const spec = (await db.query('SELECT * FROM specifications WHERE grade=$1 ORDER BY version DESC LIMIT 1', [lot.grade])).rows[0];
  const tests = (await db.query('SELECT * FROM test_results WHERE subject=$1 AND usable_for_release=true ORDER BY recorded_at', [lotRef])).rows;

  await db.query(
    `INSERT INTO certificates (number,version,site,grade,period,claim_type,content_bp,category_split,lots,specification_version,recipient,carbon_figure,scheme,registration,test_results,permitted_statement,prohibited_statement,provisional_factor,conditions,derived_from,signer,signed_at,state)
     VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now(),'issued')`,
    [number, lot.site, lot.grade, period, lot.claim_type, contentBp, JSON.stringify(split),
     JSON.stringify([{ reference: lotRef, mass_g: Number(lot.mass_g) }]), spec ? spec.version : 1, body.recipient,
     figure ? figure.id : null, 'RCS-2026', 'REG-RAVEL-0042',
     JSON.stringify(tests.map((t: any) => ({ reference: t.reference, property: t.property, method: t.method, value: t.value, unit: t.unit }))),
     stmt.permitted, stmt.prohibited, factor ? factor.provisional : false,
     JSON.stringify(conditions.map((x) => ({ condition: x.condition, satisfied: x.satisfied, blocking_reference: x.blocking_reference }))),
     JSON.stringify({ conversion_factor: factor?.reference || null, carbon_method: figure ? { id: figure.method_id, version: figure.method_version } : null, specification: { grade: lot.grade, version: spec?.version || null } }),
     s.email]
  );

  await record(db, {
    person: s.email, site: lot.site, act: 'certificate_signed', object_kind: 'certificate', object_reference: number,
    detail: { lot: lotRef, recipient: body.recipient, claim_type: lot.claim_type, content_bp: contentBp, period, conditions: conditions.map((x) => ({ condition: x.condition, satisfied: x.satisfied })) }
  });

  const recipientMail = recipient?.contact || body.recipient;
  if (recipientMail.includes('@')) {
    await sendMail({
      to: recipientMail,
      subject: `Certificate ${number} issued`,
      text: [
        `Certificate number: ${number}`,
        `Claim type: ${lot.claim_type}`,
        `Recycled content: ${Math.floor(contentBp / 100)} per cent (${contentBp} basis points)`,
        '',
        'Permitted statement:',
        stmt.permitted,
        '',
        'Prohibited statement:',
        stmt.prohibited,
        '',
        `Verify this certificate at ravel.example.com/verify/${number}`
      ].join('\n')
    });
  }

  await rememberIdempotent(c, 201, { number });
  return c.json(await fullCertificate(number), 201);
});

certificateRoutes.post('/certificates/:number/withdraw', async (c) => {
  const s = await requireRole(c, ['certificate_signer']);
  const body = await readJson(c);
  requireFields(body, ['reason']);
  const number = c.req.param('number');
  const x = (await db.query('SELECT * FROM certificates WHERE number=$1', [number])).rows[0];
  if (!x) deny('certificate_not_found', 'No such certificate.', 404);
  if (!s.sites.includes(x.site)) deny('site_out_of_scope', `Your signing scope does not cover ${x.site}.`, 403);
  if (x.state === 'withdrawn') deny('already_withdrawn', 'This certificate is withdrawn.', 409);

  // derived certificates: those that rest on the same lots
  const otherCerts = (await db.query('SELECT number, lots FROM certificates WHERE number<>$1 AND state<>$2', [number, 'withdrawn'])).rows;
  const derived: string[] = otherCerts
    .filter((o: any) => (o.lots as any[]).some((l: any) => (x.lots as any[]).some((m: any) => m.reference === l.reference)))
    .map((o: any) => o.number);

  // reverse traversal over the underlying batches
  const batches: string[] = [];
  const lotsTouched: string[] = [];
  for (const l of x.lots as any[]) {
    const g = await batchImpact(db, l.reference);
    lotsTouched.push(...g.lots.map((m: any) => m.reference));
  }
  const traversalCerts: string[] = [];
  for (const l of x.lots as any[]) {
    const g = await batchImpact(db, l.reference);
    for (const cert of g.certificates) {
      if (cert.number !== number && !traversalCerts.includes(cert.number)) traversalCerts.push(cert.number);
    }
  }

  const withdrawnOn = new Date().toISOString().slice(0, 10);
  const voidStatements = [x.permitted_statement, x.prohibited_statement];
  const recipients = [x.recipient];

  await db.query(
    `UPDATE certificates SET state='withdrawn', withdrawn_by=$1, withdrawn_on=$2, withdrawal_reason=$3, notified_recipients=$4, void_statements=$5, derived_certificates=$6, batch_traversal=$7 WHERE number=$8`,
    [s.email, withdrawnOn, body.reason, JSON.stringify(recipients), JSON.stringify(voidStatements), JSON.stringify(derived), JSON.stringify({ batches, lots: [...new Set(lotsTouched)], certificates: traversalCerts, recipients_of_those_certificates: recipients }), number]
  );

  for (const n of derived) {
    const existing = (await db.query('SELECT resolution_reference FROM certificates WHERE number=$1', [n])).rows;
    await db.query(`UPDATE certificates SET state='withdrawn', withdrawn_by=$1, withdrawn_on=$2, withdrawal_reason=$3 WHERE number=$4`,
      [s.email, withdrawnOn, `Derived from ${number}, withdrawn under it`, n]);
  }

  const customer = (await db.query('SELECT * FROM customers WHERE reference=$1', [x.recipient])).rows[0];
  if (customer?.contact?.includes('@')) {
    await sendMail({
      to: customer.contact,
      subject: `Certificate ${number} withdrawn`,
      text: [
        `Certificate number: ${number}`,
        `Reason: ${body.reason}`,
        '',
        'Statements now void:',
        ...voidStatements.map((v) => `- ${v}`)
      ].join('\n')
    });
  }

  await record(db, {
    person: s.email, site: x.site, act: 'certificate_withdrawn', object_kind: 'certificate', object_reference: number,
    detail: { reason: body.reason, notified_recipients: recipients, void_statements: voidStatements, derived_certificates: derived, batch_traversal: { lots: [...new Set(lotsTouched)], certificates: traversalCerts } }
  });

  return c.json({
    number,
    state: 'withdrawn',
    reason: body.reason,
    withdrawn_by: s.email,
    withdrawn_on: withdrawnOn,
    notified_recipients: recipients,
    void_statements: voidStatements,
    derived_certificates: derived,
    batch_traversal: { batches, lots: [...new Set(lotsTouched)], certificates: traversalCerts }
  });
});

certificateRoutes.post('/certificates/:number/reissue', async (c) => {
  const s = await requireRole(c, ['certificate_signer']);
  const body = await readJson(c);
  requireFields(body, ['password']);
  const passwordOk = await verifyPasswordAgain(s.email, body.password);
  if (!passwordOk) deny('reauthentication_failed', 'The password was not accepted for this signing act.', 401);
  const number = c.req.param('number');
  const x = (await db.query('SELECT * FROM certificates WHERE number=$1', [number])).rows[0];
  if (!x) deny('certificate_not_found', 'No such certificate.', 404);

  const newVersion = Number(x.version) + 1;
  await db.query(
    `INSERT INTO certificates (number,version,site,grade,period,claim_type,content_bp,category_split,lots,specification_version,recipient,carbon_figure,scheme,registration,test_results,permitted_statement,prohibited_statement,provisional_factor,conditions,derived_from,signer,signed_at,state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now(),'issued')`,
    [number, newVersion, x.site, x.grade, x.period, x.claim_type, x.content_bp, JSON.stringify(x.category_split), JSON.stringify(x.lots),
     x.specification_version, x.recipient, x.carbon_figure, x.scheme, x.registration, JSON.stringify(x.test_results),
     x.permitted_statement, x.prohibited_statement, x.provisional_factor, JSON.stringify(x.conditions), JSON.stringify(x.derived_from), s.email]
  );
  await record(db, { person: s.email, site: x.site, act: 'certificate_reissued', object_kind: 'certificate', object_reference: `${number} v${newVersion}`, detail: { previous_version: x.version } });
  return c.json({ number, version: newVersion, previous_version: x.version, state: 'issued' }, 201);
});

certificateRoutes.get('/certificates/:number/document', async (c) => {
  await requireSession(c);
  const number = c.req.param('number');
  const rows = (await db.query('SELECT * FROM certificates WHERE number=$1 ORDER BY version DESC', [number])).rows;
  if (!rows.length) deny('certificate_not_found', 'No such certificate.', 404);
  const x = rows[0];
  const figure = x.carbon_figure ? (await db.query('SELECT * FROM carbon_figures WHERE id=$1', [x.carbon_figure])).rows[0] : null;
  const method = figure ? (await db.query('SELECT * FROM carbon_methods WHERE id=$1 AND version=$2', [figure.method_id, figure.method_version])).rows[0] : null;

  const lines: string[] = [];
  lines.push('RAVEL MATERIALS SAS — RECYCLED CONTENT CERTIFICATE');
  lines.push('');
  lines.push(`Certificate number: ${x.number}`);
  lines.push(`Version: ${x.version}`);
  lines.push(`State: ${x.state}`);
  if (x.state === 'withdrawn') {
    lines.push(`This certificate was withdrawn on ${x.withdrawn_on}. Reason: ${x.withdrawal_reason}.`);
  }
  lines.push('');
  lines.push('CLAIM');
  lines.push(`Claim type: ${x.claim_type}`);
  lines.push(`Recycled content: ${Math.floor(x.content_bp / 100)} per cent (${x.content_bp} basis points)`);
  lines.push('This material is claimed by mass balance. It is not physically segregated.');
  lines.push('');
  lines.push('LOTS');
  for (const l of x.lots as any[]) lines.push(`  ${l.reference} — ${l.mass_g} g`);
  lines.push('');
  lines.push(`Site: ${x.site}`);
  lines.push(`Grade: ${x.grade} — specification version ${x.specification_version}`);
  lines.push(`Balance period: ${x.period}`);
  lines.push(`Scheme: ${x.scheme}`);
  lines.push(`Producer registration: ${x.registration}`);
  lines.push('');
  lines.push('CARBON');
  if (figure) {
    lines.push(`Carbon value: ${figure.value_mg_per_kg} mg CO2e per kg of pellet`);
    lines.push(`Boundary: ${method?.boundary}`);
    lines.push(`Method version: ${figure.method_id} v${figure.method_version} (${method?.standard})`);
    lines.push(`Uncertainty: ${figure.uncertainty_bp} basis points`);
    lines.push(`Primary data share: ${figure.primary_share_bp} basis points`);
    if (x.provisional_factor) lines.push('Conversion factor: provisional');
  }
  lines.push('');
  lines.push('PERMITTED AND PROHIBITED STATEMENTS');
  lines.push(`Permitted: ${x.permitted_statement}`);
  lines.push(`Prohibited: ${x.prohibited_statement}`);
  lines.push('');
  lines.push('TEST RESULTS');
  for (const t of x.test_results as any[]) lines.push(`  ${t.reference} — ${t.property} by ${t.method}: ${t.value} ${t.unit}`);
  lines.push('');
  lines.push(`Signed by: ${x.signer}`);
  lines.push(`Signed at: ${String(x.signed_at)}`);
  lines.push(`Verify this certificate at ravel.example.com/verify/${x.number}`);
  lines.push('');
  if (x.carbon_figure) lines.push('Carbon breakdown is attached to the filed copy rather than stated inline.');

  const text = lines.join('\n');
  return c.body(text, 200, { 'content-type': 'text/plain; charset=utf-8' });
});

certificateRoutes.get('/certificates/:number/replay', async (c) => {
  await requireSession(c);
  const number = c.req.param('number');
  const x = (await db.query('SELECT * FROM certificates WHERE number=$1 ORDER BY version DESC LIMIT 1', [number])).rows[0];
  if (!x) deny('certificate_not_found', 'No such certificate.', 404);

  const inputVersions = x.derived_from as any;
  const recomputed: Record<string, any> = {};
  const differing: any[] = [];

  // recompute content from the ledger
  const lotsRows = x.lots as any[];
  let attached = 0, lotMass = 0;
  for (const l of lotsRows) {
    const row = (await db.query('SELECT mass_g FROM lots WHERE reference=$1', [l.reference])).rows[0];
    lotMass += Number(row?.mass_g || l.mass_g);
    const mv = (await db.query(`SELECT COALESCE(SUM(mass_g),0) AS g FROM credit_movements WHERE lot=$1 AND direction='out'`, [l.reference])).rows[0];
    attached += Number(mv.g);
  }
  const recomputedContentBp = Math.floor((attached * 10000) / lotMass);
  recomputed.content_bp = recomputedContentBp;
  if (recomputedContentBp !== Number(x.content_bp)) differing.push({ input: 'credit_movements', issued: Number(x.content_bp), recomputed: recomputedContentBp });

  // resolve the versioned inputs
  const versions: any[] = [];
  let reproducible = true;
  let reason = null;
  if (inputVersions?.carbon_method) {
    const m = (await db.query('SELECT * FROM carbon_methods WHERE id=$1 AND version=$2', [inputVersions.carbon_method.id, inputVersions.carbon_method.version])).rows[0];
    if (!m) { reproducible = false; reason = 'The method version the figure was computed against has been retired.'; }
    else versions.push({ kind: 'carbon_method', reference: `${m.id} v${m.version}`, state: m.superseded_by ? 'superseded' : 'current' });
  }
  if (inputVersions?.conversion_factor) {
    const f = (await db.query('SELECT * FROM conversion_factors WHERE reference=$1', [inputVersions.conversion_factor])).rows[0];
    if (!f) { reproducible = false; reason = 'The conversion factor the certificate rests on is gone.'; }
    else versions.push({ kind: 'conversion_factor', reference: f.reference, state: f.superseded_by ? 'superseded' : 'current' });
  }
  if (inputVersions?.specification) {
    const sp = (await db.query('SELECT * FROM specifications WHERE grade=$1 AND version=$2', [inputVersions.specification.grade, inputVersions.specification.version])).rows[0];
    if (!sp) { reproducible = false; reason = 'The specification version named on the certificate is gone.'; }
    else versions.push({ kind: 'specification', reference: `${sp.grade} v${sp.version}`, state: sp.state });
  }
  if (x.carbon_figure) {
    const fig = (await db.query('SELECT * FROM carbon_figures WHERE id=$1', [x.carbon_figure])).rows[0];
    if (!fig) { reproducible = false; reason = 'The emission factor set behind the figure has been lost.'; }
    else versions.push({ kind: 'carbon_figure', reference: fig.id, state: fig.cache_valid ? 'current' : 'superseded' });
  }

  if (!reproducible) {
    return c.json({ number, issued: null, recomputed: null, agrees: null, differing_input: null, input_versions: versions, reproducible: false, reason });
  }

  const agrees = differing.length === 0;
  await record(db, { person: (await requireSession(c)).email, act: 'certificate_replayed', object_kind: 'certificate', object_reference: number, detail: { agrees, differing } });
  return c.json({
    number,
    issued: { content_bp: Number(x.content_bp), claim_type: x.claim_type },
    recomputed: { content_bp: recomputed.content_bp },
    agrees,
    differing_input: differing.length ? differing[0] : null,
    input_versions: versions,
    reproducible: true
  });
});
