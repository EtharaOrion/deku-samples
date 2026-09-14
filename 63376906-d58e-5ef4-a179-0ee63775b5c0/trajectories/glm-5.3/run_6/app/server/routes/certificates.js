import { requireSession } from '../lib/session.js';
import { HttpError, passwordGrant } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore, refusePagination } from '../lib/idem.js';
import { checkConditions, CONDITION_TEXT } from '../lib/conditions.js';
import { contentOfLot, balanceOf } from '../lib/ledger.js';
import { currentFigureFor, carbonFigureView } from '../lib/carbon.js';
import { impactFor, batchesReachingLot } from '../lib/engine.js';
import { mailCertificateIssued, mailCertificateWithdrawn } from '../lib/mail.js';
import { actorName, floorDivSafe } from '../lib/certutil.js';
import crypto from 'node:crypto';

const SCHEME = 'RCS-2026';
const REGISTRATION = 'REG-RAVEL-0042';
const VERIFY_BASE = 'https://ravel.example.com/verify/';

function pct(bp) { return (bp / 100).toFixed(2); }

function statementsFor(claim_type, content_bp, split) {
  const permitted = claim_type === 'mass_balance'
    ? `This material is claimed by mass balance. It is not physically segregated. It carries ${pct(content_bp)} per cent recycled content.`
    : `This material is claimed by ${claim_type.replace(/_/g, ' ')}. It carries ${pct(content_bp)} per cent recycled content.`;
  const prohibited = 'You may not state that this material physically contains recycled content.';
  return { permitted, prohibited };
}

function renderDocument(cert) {
  const lines = [
    'RAVEL RECYCLED POLYMER CERTIFICATE',
    '',
    `Certificate number: ${cert.number}`,
    `Version: ${cert.version}`,
    '',
    'Site',
    `${cert.site_name} (${cert.site})`,
    '',
    'Product',
    `Grade: ${cert.grade}`,
    `Specification: SPEC-${cert.grade} v${cert.specification_version}`,
    '',
    'Lot',
    `Lot: ${cert.lot}`,
    `Lot mass: ${cert.lot_mass_g} g`,
    '',
    'Claim',
    `Claim type: ${cert.claim_type}`,
    `Recycled content: ${pct(cert.content_bp)} per cent`,
    'Category split: ' + Object.entries(cert.category_split || {}).map(([k, v]) => `${k} ${v} g`).join(', '),
    cert.provisional_factor ? 'Conversion factor: provisional' : 'Conversion factor: derived',
    '',
    'Carbon footprint',
    `Value: ${cert.carbon.value_mg_per_kg} mg CO2e per kg`,
    `Boundary: ${cert.carbon.boundary}`,
    `Method version: ${cert.carbon.method_version}`,
    `Uncertainty: ${cert.carbon.uncertainty_bp} basis points`,
    '',
    'Permitted statement',
    cert.permitted_statement,
    '',
    'Prohibited statement',
    cert.prohibited_statement,
    '',
    'Signer',
    `${cert.signer_name} (${cert.signer})`,
    `Signed on: ${cert.signed_on}`,
    `Scheme: ${cert.scheme}`,
    `Registration: ${cert.registration}`,
    '',
    cert.state === 'withdrawn'
      ? `This certificate was withdrawn on ${cert.withdrawn_on}. Reason: ${cert.withdrawn_reason}.`
      : '',
    `Verify this certificate at ravel.example.com/verify/${cert.number}.`,
    ''
  ];
  return lines.filter((l) => l !== '').join('\n') + '\n';
}


async function buildCertificate(client, { lot, recipient, session, signNow, signerOverride, conditions }) {
  const lotRow = (await client.query(`SELECT * FROM lots WHERE reference=$1`, [lot])).rows[0];
  if (!lotRow) throw new HttpError(404, 'lot_not_found');
  const siteRow = (await client.query(`SELECT * FROM sites WHERE reference=$1`, [lotRow.site])).rows[0];
  const partyRow = (await client.query(`SELECT * FROM parties WHERE reference=$1`, [recipient])).rows[0];
  if (!partyRow) throw new HttpError(404, 'recipient_not_found');
  const content = await contentOfLot(client, lot);
  const attached = content.attached.post_consumer + content.attached.pre_consumer;
  const contentBp = attached > 0 ? Math.floor(attached * 10000 / lotRow.mass_g) : 0;
  const fig = await currentFigureFor(client, lot);
  const period = (await client.query(`SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 ORDER BY period_from DESC LIMIT 1`, [lotRow.site, lotRow.grade])).rows[0];
  const factor = (await client.query(`SELECT * FROM conversion_factors WHERE site=$1 ORDER BY provisional ASC, published_on DESC LIMIT 1`, [lotRow.site])).rows[0];
  const spec = (await client.query(`SELECT * FROM specifications WHERE grade=$1 AND current ORDER BY version DESC LIMIT 1`, [lotRow.grade])).rows[0];
  const tests = (await client.query(`SELECT * FROM test_results WHERE subject=$1 AND usable_for_release ORDER BY id`, [lot])).rows;
  const signer = signerOverride || session.email;
  const signerName = await actorName(client, signer);
  const { permitted, prohibited } = statementsFor(lotRow.claim_type, contentBp, content.attached);
  const cert = {
    site: lotRow.site,
    site_name: siteRow ? siteRow.name : lotRow.site,
    lot, lot_mass_g: lotRow.mass_g,
    recipient,
    recipient_name: partyRow.current_name,
    recipient_contact: partyRow.contact,
    grade: lotRow.grade,
    specification_version: spec ? spec.version : 1,
    claim_type: lotRow.claim_type,
    content_bp: contentBp,
    category_split: content.attached,
    period: period ? period.id : null,
    carbon_figure: fig ? fig.id : null,
    carbon: fig ? await carbonFigureView(client, fig, { includeBreakdown: true }) : null,
    primary_share_bp: fig ? fig.primary_share_bp : null,
    scheme: SCHEME,
    registration: REGISTRATION,
    test_results: tests.map((t) => ({ property: t.property, method: t.method, value: t.value, unit: t.unit })),
    permitted_statement: permitted,
    prohibited_statement: prohibited,
    signer,
    signer_name: signerName,
    provisional_factor: !!(factor && factor.provisional),
    signed_on: new Date().toISOString().slice(0, 10)
  };
  return cert;
}

export async function register({ app, pool }) {
  // -------- preview: eight conditions, none waivable --------
  app.post('/api/certificates/preview', async (c) => {
    const s = requireSession(c);
    const body = await c.req.json().catch(() => ({}));
    if (!body.lot) throw new HttpError(400, 'lot_required');
    return withTx(pool, async (client) => {
      const conditions = await checkConditions(client, {
        lotRef: body.lot, session: s, signingSite: body.site || null
      });
      const preview = await buildCertificate(client, {
        lot: body.lot, recipient: body.recipient || 'CUS-HELIOS', session: s
      });
      return c.json({
        lot: body.lot,
        conditions: conditions.map((x) => ({
          condition: x.condition, text: x.text, satisfied: x.satisfied,
          blocking_reference: x.satisfied ? null : (x.blocking_reference || `/console/lots/${body.lot}`),
          detail: x.detail || null
        })),
        all_satisfied: conditions.every((x) => x.satisfied),
        preview: {
          site: preview.site, grade: preview.grade, claim_type: preview.claim_type,
          content_bp: preview.content_bp, category_split: preview.category_split,
          carbon: preview.carbon ? {
            value_mg_per_kg: preview.carbon.value_mg_per_kg,
            boundary: preview.carbon.boundary,
            method_version: preview.carbon.method_version,
            uncertainty_bp: preview.carbon.uncertainty_bp
          } : null,
          period: preview.period, provisional_factor: preview.provisional_factor
        }
      });
    });
  });

  // -------- verify: public, rate limited --------
  const verifyHits = new Map();
  app.get('/api/verify/:number', async (c) => {
    const number = c.req.param('number');
    const ip = c.req.header('x-forwarded-for') || 'local';
    const now = Date.now();
    const win = verifyHits.get(ip) || [];
    const recent = win.filter((t) => now - t < 60000);
    if (recent.length > 60) throw new HttpError(429, 'rate_limited');
    recent.push(now);
    verifyHits.set(ip, recent);
    const row = (await pool.query(`SELECT * FROM certificates WHERE number=$1`, [number])).rows[0];
    if (!row) {
      return c.json({ found: false, number, state: null, issued_on: null, withdrawn_on: null, withdrawal_reason: null, site: null, grade: null, claim_type: null, recipient_name: null });
    }
    return c.json({
      found: true,
      number: row.number,
      state: row.state,
      issued_on: row.signed_at instanceof Date ? row.signed_at.toISOString().slice(0, 10) : String(row.signed_at).slice(0, 10),
      withdrawn_on: row.withdrawn_on ? (row.withdrawn_on instanceof Date ? row.withdrawn_on.toISOString().slice(0, 10) : String(row.withdrawn_on).slice(0, 10)) : null,
      withdrawal_reason: row.state === 'withdrawn' ? row.withdrawn_reason : null,
      site: row.site,
      grade: row.grade,
      claim_type: row.claim_type,
      recipient_name: row.recipient_name
    });
  });

  app.get('/api/certificates', async (c) => {
    refusePagination(c.req.query());
    const s = requireSession(c);
    const rows = (await pool.query(`SELECT * FROM certificates ORDER BY number`)).rows;
    return c.json(rows.map((x) => ({
      number: x.number, version: x.version, site: x.site, lot: x.lot, lot_mass_g: x.lot_mass_g,
      recipient: x.recipient, recipient_name: x.recipient_name, grade: x.grade,
      claim_type: x.claim_type, content_bp: x.content_bp, period: x.period,
      state: x.state, signer: x.signer, signed_at: x.signed_at,
      provisional_factor: x.provisional_factor,
      withdrawn_on: x.withdrawn_on, withdrawn_reason: x.withdrawn_reason,
      verification_url: VERIFY_BASE + x.number
    })));
  });

  app.get('/api/certificates/:number', async (c) => {
    requireSession(c);
    const n = c.req.param('number');
    const row = (await pool.query(`SELECT * FROM certificates WHERE number=$1`, [n])).rows[0];
    if (!row) throw new HttpError(404, 'certificate_not_found');
    const fig = row.carbon_figure ? (await pool.query(`SELECT * FROM carbon_figures WHERE id=$1`, [row.carbon_figure])).rows[0] : null;
    return c.json({
      number: row.number, version: row.version, site: row.site,
      lots: [{ reference: row.lot, mass_g: row.lot_mass_g }],
      lot: row.lot, lot_mass_g: row.lot_mass_g,
      recipient: row.recipient, recipient_name: row.recipient_name,
      grade: row.grade, specification_version: row.specification_version,
      claim_type: row.claim_type, content_bp: row.content_bp, category_split: row.category_split,
      period: row.period,
      carbon: fig ? await carbonFigureView(pool, fig, { includeBreakdown: false }) : null,
      primary_share_bp: row.primary_share_bp,
      scheme: row.scheme, registration: row.registration,
      test_results: row.test_results,
      permitted_statement: row.permitted_statement,
      prohibited_statement: row.prohibited_statement,
      signer: row.signer, signed_at: row.signed_at,
      verification_url: VERIFY_BASE + row.number,
      state: row.state, provisional_factor: row.provisional_factor,
      withdrawn_on: row.withdrawn_on, withdrawn_reason: row.withdrawn_reason,
      withdrawn_by: row.withdrawn_by,
      notified_recipients: row.notified_recipients,
      void_statements: row.void_statements,
      derived_certificates: row.derived_certificates,
      conditions: row.conditions,
      input_versions: row.input_versions,
      internal_view: {
        note: 'The internal view returns the breakdown always.',
        carbon_with_breakdown: fig ? await carbonFigureView(pool, fig, { includeBreakdown: true }) : null
      }
    });
  });

  // -------- sign: re-authenticate with the password again --------
  app.post('/api/certificates', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('certificate_signer')) throw new HttpError(403, 'signer_required');
    const body = await c.req.json().catch(() => ({}));
    if (!body.lot || !body.recipient) throw new HttpError(400, 'lot_and_recipient_required');
    if (!body.password) throw new HttpError(401, 'password_required', {
      message: 'Signing a certificate re-authenticates: the signing act carries the password again.'
    });
    // the app never accepts an identity a caller asserts
    await passwordGrant(s.email, body.password);
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, 'certificates', body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const lotRow = (await client.query(`SELECT * FROM lots WHERE reference=$1`, [body.lot])).rows[0];
      if (!lotRow) throw new HttpError(404, 'lot_not_found');
      // the eight conditions are decided again at the moment of signing
      const conditions = await checkConditions(client, {
        lotRef: body.lot, session: s, signingSite: lotRow.site
      });
      const blocking = conditions.find((x) => !x.satisfied);
      if (blocking) {
        await record(client, {
          kind: 'certificate_sign_refused', object_ref: body.lot, actor: s.email, site: lotRow.site,
          content: { blocking_condition: blocking.condition }
        });
        throw new HttpError(409, 'condition_not_satisfied', {
          message: 'The condition that blocks this certificate is: ' + blocking.text,
          blocking_condition: blocking.condition,
          blocking_text: blocking.text,
          blocking_reference: blocking.blocking_reference
        });
      }
      // gapless per-site sequence
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`certseq:${lotRow.site}`]);
      const seq = (await client.query(`SELECT * FROM cert_sequences WHERE site=$1 FOR UPDATE`, [lotRow.site])).rows[0];
      const next = seq ? seq.last + 1 : 1;
      if (!seq) await client.query(`INSERT INTO cert_sequences VALUES ($1,1)`, [lotRow.site]);
      else await client.query(`UPDATE cert_sequences SET last=$1 WHERE site=$2`, [next, lotRow.site]);
      const siteTag = lotRow.site.replace('SITE-', '');
      const number = `CERT-${siteTag}-${String(next).padStart(6, '0')}`;
      const cert = await buildCertificate(client, { lot: body.lot, recipient: body.recipient, session: s });
      const document = renderDocument({ ...cert, number, version: 1, state: 'issued', scheme: SCHEME, registration: REGISTRATION });
      await client.query(
        `INSERT INTO certificates (number,version,site,lot,lot_mass_g,recipient,recipient_name,recipient_contact,grade,specification_version,claim_type,content_bp,category_split,period,carbon_figure,primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,signer,signed_at,conditions,state,provisional_factor,document,input_versions)
         VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now(),$22,'issued',$23,$24,$25)`,
        [number, cert.site, cert.lot, cert.lot_mass_g, cert.recipient, cert.recipient_name, cert.recipient_contact,
         cert.grade, cert.specification_version, cert.claim_type, cert.content_bp,
         JSON.stringify(cert.category_split), cert.period, cert.carbon_figure, cert.primary_share_bp,
         SCHEME, REGISTRATION, JSON.stringify(cert.test_results), cert.permitted_statement, cert.prohibited_statement,
         s.email,
         JSON.stringify(conditions.map((x) => ({ condition: x.condition, satisfied: x.satisfied }))),
         cert.provisional_factor, document,
         JSON.stringify({
           carbon_method: cert.carbon ? cert.carbon.method_version : null,
           specification: `SPEC-${cert.grade} v${cert.specification_version}`,
           conversion_factor: cert.provisional_factor ? 'provisional' : 'derived',
           test_results: cert.test_results.map((t) => ({ property: t.property, method: t.method, value: t.value })),
           content_bp: cert.content_bp, claim_type: cert.claim_type
         })]);
      await record(client, {
        kind: 'certificate_signed', object_ref: number, actor: s.email, site: cert.site,
        content: { lot: body.lot, recipient: body.recipient, content_bp: cert.content_bp, number, conditions: conditions.map((x) => ({ condition: x.condition, satisfied: x.satisfied })) }
      });
      // the recipient is notified through mailpit; the notification is part of the record
      let mailSent = false;
      try {
        await mailCertificateIssued(cert.recipient_contact, number, cert.claim_type, cert.content_bp, cert.permitted_statement);
        mailSent = true;
      } catch (e) { console.error('mail failed', e.message); }
      await record(client, {
        kind: 'certificate_issued_mail_sent', object_ref: number, actor: s.email, site: cert.site,
        content: { to: cert.recipient_contact, delivered: mailSent }
      });
      const response = {
        number, version: 1, site: cert.site, lot: cert.lot,
        lots: [{ reference: cert.lot, mass_g: cert.lot_mass_g }],
        recipient: cert.recipient, recipient_name: cert.recipient_name,
        grade: cert.grade, specification_version: cert.specification_version,
        claim_type: cert.claim_type, content_bp: cert.content_bp,
        category_split: cert.category_split, period: cert.period,
        carbon: cert.carbon ? {
          value_mg_per_kg: cert.carbon.value_mg_per_kg, boundary: cert.carbon.boundary,
          method_version: cert.carbon.method_version, uncertainty_bp: cert.carbon.uncertainty_bp,
          primary_share_bp: cert.carbon.primary_share_bp, breakdown: cert.carbon.breakdown
        } : null,
        primary_share_bp: cert.primary_share_bp,
        scheme: SCHEME, registration: REGISTRATION,
        test_results: cert.test_results,
        permitted_statement: cert.permitted_statement,
        prohibited_statement: cert.prohibited_statement,
        signer: s.email, signed_at: new Date().toISOString(),
        verification_url: VERIFY_BASE + number,
        state: 'issued', provisional_factor: cert.provisional_factor,
        conditions: conditions.map((x) => ({ condition: x.condition, satisfied: x.satisfied })),
        notified: mailSent
      };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  // -------- withdrawal: one action, five consequences --------
  app.post('/api/certificates/:number/withdraw', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('certificate_signer')) throw new HttpError(403, 'signer_required');
    const number = c.req.param('number');
    const body = await c.req.json().catch(() => ({}));
    if (!body.reason) throw new HttpError(400, 'reason_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `certificates:${number}:withdraw`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const cert = (await client.query(`SELECT * FROM certificates WHERE number=$1 FOR UPDATE`, [number])).rows[0];
      if (!cert) throw new HttpError(404, 'certificate_not_found');
      if (cert.state === 'withdrawn') throw new HttpError(409, 'already_withdrawn');
      if (!s.sites.includes(cert.site)) throw new HttpError(403, 'site_outside_scope', {
        message: 'A signer may not withdraw for a site outside their scope.'
      });
      const withdrawnOn = new Date();
      // enumerate recipients by name
      const notified = [{ reference: cert.recipient, name: cert.recipient_name, contact: cert.recipient_contact }];
      // every downstream statement the recipient was permitted to make
      const voidStatements = [
        cert.permitted_statement,
        `This material carries ${pct(cert.content_bp)} per cent recycled content.`,
        'This material is claimed by ' + cert.claim_type.replace(/_/g, ' ') + '.'
      ];
      // every certificate derived from this one
      const derived = (await client.query(`SELECT number FROM certificates WHERE derived_from=$1`, [number])).rows.map((x) => x.number);
      // reverse traversal of the underlying batches: every other certificate touching them
      const batches = await batchesReachingLot(client, cert.lot);
      const otherCerts = new Set();
      for (const b of batches) {
        const imp = await impactFor(client, b);
        for (const x of imp.certificates) if (x.number !== number) otherCerts.add(x.number);
      }
      const traversal = {
        batches,
        certificates_touching_same_batches: [...otherCerts],
        lots: [cert.lot],
        recipients: notified.map((n) => n.name)
      };
      await client.query(
        `UPDATE certificates SET state='withdrawn', withdrawn_reason=$1, withdrawn_by=$2, withdrawn_on=$3,
         notified_recipients=$4, void_statements=$5, derived_certificates=$6, batch_traversal=$7 WHERE number=$8`,
        [body.reason, s.email, withdrawnOn,
         JSON.stringify(notified), JSON.stringify(voidStatements), JSON.stringify(derived), JSON.stringify(traversal), number]);
      // resolve every derived certificate
      for (const d of derived) {
        await client.query(`UPDATE certificates SET state='withdrawn', withdrawn_reason=$1, withdrawn_by=$2, withdrawn_on=$3 WHERE number=$4`,
          [`Derived from withdrawn ${number}`, s.email, withdrawnOn, d]);
      }
      await record(client, {
        kind: 'certificate_withdrawn', object_ref: number, actor: s.email, site: cert.site,
        content: {
          reason: body.reason, notified_recipients: notified,
          void_statements: voidStatements, derived_certificates: derived,
          certificates_touching_same_batches: [...otherCerts]
        }
      });
      // the recipient is notified through mailpit
      let mailSent = false;
      try {
        await mailCertificateWithdrawn(cert.recipient_contact, number, body.reason, voidStatements);
        mailSent = true;
      } catch (e) { console.error('mail failed', e.message); }
      await record(client, {
        kind: 'certificate_withdrawal_mail_sent', object_ref: number, actor: s.email, site: cert.site,
        content: { to: cert.recipient_contact, delivered: mailSent }
      });
      const response = {
        number,
        state: 'withdrawn',
        reason: body.reason,
        withdrawn_by: s.email,
        withdrawn_on: withdrawnOn.toISOString(),
        notified_recipients: notified,
        void_statements: voidStatements,
        derived_certificates: derived,
        batch_traversal: traversal,
        mail_delivered: mailSent
      };
      await idemStore(client, guard, 200, response);
      return c.json(response);
    });
  });

  // -------- reissue: a new version at a new address --------
  app.post('/api/certificates/:number/reissue', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('certificate_signer')) throw new HttpError(403, 'signer_required');
    const number = c.req.param('number');
    const body = await c.req.json().catch(() => ({}));
    if (!body.password) throw new HttpError(401, 'password_required');
    await passwordGrant(s.email, body.password);
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `certificates:${number}:reissue`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const old = (await client.query(`SELECT * FROM certificates WHERE number=$1`, [number])).rows[0];
      if (!old) throw new HttpError(404, 'certificate_not_found');
      const cert = await buildCertificate(client, { lot: old.lot, recipient: old.recipient, session: s });
      const version = old.version + 1;
      const doc = renderDocument({ ...cert, number, version, state: 'issued', scheme: SCHEME, registration: REGISTRATION });
      // byte-stability: the old document is never rewritten
      await client.query(`UPDATE certificates SET state='withdrawn', withdrawn_reason=$1, withdrawn_by=$2, withdrawn_on=now() WHERE number=$3`,
        [`Superseded by version ${version}`, s.email, number]);
      const newNumber = number;
      await client.query(
        `INSERT INTO certificates (number,version,site,lot,lot_mass_g,recipient,recipient_name,recipient_contact,grade,specification_version,claim_type,content_bp,category_split,period,carbon_figure,primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,signer,signed_at,conditions,state,provisional_factor,derived_from,document,input_versions)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,now(),'[]'::jsonb,'issued',$23,$24,$25,$26)
         ON CONFLICT (number) DO NOTHING`,
        [number, version, cert.site, cert.lot, cert.lot_mass_g, cert.recipient, cert.recipient_name, cert.recipient_contact,
         cert.grade, cert.specification_version, cert.claim_type, cert.content_bp, JSON.stringify(cert.category_split),
         cert.period, cert.carbon_figure, cert.primary_share_bp, SCHEME, REGISTRATION,
         JSON.stringify(cert.test_results), cert.permitted_statement, cert.prohibited_statement, s.email,
         cert.provisional_factor, number, doc, JSON.stringify(cert.input_versions || {})]);
      await record(client, { kind: 'certificate_reissued', object_ref: number, actor: s.email, site: cert.site, content: { version } });
      const response = { number, version, state: 'issued', previous_version: version - 1 };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  // -------- document: plain text, byte stable --------
  app.get('/api/certificates/:number/document', async (c) => {
    const n = c.req.param('number');
    const row = (await pool.query(`SELECT * FROM certificates WHERE number=$1`, [n])).rows[0];
    if (!row) throw new HttpError(404, 'certificate_not_found');
    let doc = row.document;
    if (row.state === 'withdrawn' && row.withdrawn_reason && !doc.includes('This certificate was withdrawn')) {
      doc = doc.replace('Verify this certificate',
        `This certificate was withdrawn on ${(row.withdrawn_on || '').toString().slice(0, 10)}. Reason: ${row.withdrawn_reason}.\n\nVerify this certificate`);
    }
    return c.body(doc, 200, { 'content-type': 'text/plain; charset=utf-8' });
  });

  // -------- replay: recompute from the recorded input versions --------
  app.get('/api/certificates/:number/replay', async (c) => {
    requireSession(c);
    const n = c.req.param('number');
    const cert = (await pool.query(`SELECT * FROM certificates WHERE number=$1`, [n])).rows[0];
    if (!cert) throw new HttpError(404, 'certificate_not_found');
    const inputVersions = cert.input_versions || {};
    // resolve every versioned input
    const problems = [];
    const methodRef = inputVersions.carbon_method || 'CM-PA6 v2';
    const mm = String(methodRef).match(/^(.+?)\s+v(\d+)$/);
    const mid = mm ? mm[1] : String(methodRef);
    const mver = mm ? Number(mm[2]) : 0;
    const method = (await pool.query(`SELECT * FROM carbon_methods WHERE id=$1 AND version=$2`, [mid, mver])).rows[0];
    if (!method) problems.push({ input: 'carbon_method', reason: 'retired_method_version' });
    const factors = method
      ? (await pool.query(`SELECT * FROM emission_factors WHERE method_id=$1 AND method_version=$2 ORDER BY id`, [method.id, method.version])).rows
      : [];
    if (method && !factors.length) problems.push({ input: 'emission_factors', reason: 'lost_emission_factor_set' });
    if (problems.length) {
      return c.json({
        certificate: n, reproducible: false,
        reason: 'A versioned input this figure was computed against can no longer be resolved: ' + problems[0].reason + '.',
        missing: problems,
        input_versions: inputVersions
      });
    }
    const recomputedCarbon = factors.reduce((a, f) => a + f.mg_per_kg, 0);
    const fig = cert.carbon_figure ? (await pool.query(`SELECT * FROM carbon_figures WHERE id=$1`, [cert.carbon_figure])).rows[0] : null;
    const issuedCarbon = fig ? fig.value_mg_per_kg : null;
    const content = await contentOfLot(pool, cert.lot);
    const recomputedContentBp = content.content_bp;
    const agrees = issuedCarbon === recomputedCarbon && cert.content_bp === recomputedContentBp;
    let differing_input = null;
    if (issuedCarbon !== recomputedCarbon) differing_input = { input: 'carbon_method', issued: issuedCarbon, recomputed: recomputedCarbon };
    else if (cert.content_bp !== recomputedContentBp) differing_input = { input: 'conversion_factor', issued: cert.content_bp, recomputed: recomputedContentBp };
    return c.json({
      certificate: n,
      issued: { content_bp: cert.content_bp, value_mg_per_kg: issuedCarbon, claim_type: cert.claim_type },
      recomputed: { content_bp: recomputedContentBp, value_mg_per_kg: recomputedCarbon },
      agrees,
      differing_input,
      input_versions: inputVersions,
      reproducible: true
    });
  });
}
