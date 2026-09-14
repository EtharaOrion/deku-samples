import { Hono } from 'hono';
import { currentSession, hasRole, siteInScope, exchangePassword, bearer } from '../lib/auth.js';
import { withIdempotency } from '../lib/idempotency.js';
import { appendEntry } from '../lib/record.js';
import { sendMail } from '../lib/mail.js';
import { floorDiv, today } from '../lib/units.js';
import { impactForBatch } from '../lib/engine.js';
import { nextReference } from '../db.js';

const r = new Hono();
const SITE_CERT_SEQ_LOCK = 991001;

function customerName(dbRef) { return dbRef; }

async function statements(content_bp, split, claimType, recipientLanguage = 'en') {
  const pct = (content_bp / 100).toFixed(2);
  const post = split.post_consumer_g || 0;
  const pre = split.pre_consumer_g || 0;
  const en = `This certificate confirms that the material described carries ${pct} per cent recycled content claimed by mass balance, comprising ${post} grams of post-consumer input and ${pre} grams of pre-consumer input. This material is claimed by mass balance. It is not physically segregated.`;
  const pro = 'You may not state that this material physically contains recycled content.';
  const lang = recipientLanguage === 'fr' ? 'fr' : 'en';
  const text = lang === 'fr'
    ? `Ce certificat confirme que le materiau decrit porte ${pct} pour cent de contenu recycle revendique par bilan matiere, dont ${post} grammes d'entree post-consommation et ${pre} grammes d'entree pre-consommation. Ce materiau est revendique par bilan matiere. Il n'est pas physiquement separe.`
    : en;
  const proText = lang === 'fr'
    ? 'Vous ne pouvez pas declarer que ce materiau contient physiquement du contenu recycle.'
    : pro;
  return {
    language: lang, text,
    english: lang === 'en' ? null : en
  };
}

function prohibitedStatement(content_bp, claimType) {
  void content_bp; void claimType;
  return {
    language: 'en',
    text: 'You may not state that this material physically contains recycled content.'
  };
}

// Eight conditions, computed against the records as they stand right now.
async function evaluateConditions(db, { lotRef, site, signer, periodId }) {
  const conditions = [];
  const lot = (await db.query('SELECT * FROM lot WHERE reference=$1', [lotRef])).rows[0];
  // 1 lot released
  conditions.push({
    condition: 'lot_released',
    satisfied: Boolean(lot && lot.disposition === 'released'),
    blocking_reference: lot && lot.disposition !== 'released' ? lotRef : null,
    statement: lot && lot.disposition === 'released'
      ? `The lot ${lotRef} is released.`
      : `The lot ${lotRef} is ${lot ? lot.disposition : 'missing'} rather than released.`
  });
  // 2 no open deviation
  const openDev = (await db.query("SELECT * FROM deviation WHERE state='open'")).rows
    .filter((d) => (d.affects_lots || []).includes(lotRef));
  conditions.push({
    condition: 'no_open_deviation',
    satisfied: openDev.length === 0,
    blocking_reference: openDev.length ? openDev[0].reference : null,
    statement: openDev.length
      ? `A deviation touching this lot is open: ${openDev.map((d) => d.reference).join(', ')}.`
      : 'No deviation touching this lot is open.'
  });
  // 3 no unreviewed override
  const unreviewed = (await db.query('SELECT * FROM override WHERE lot=$1 AND reviewed=false', [lotRef])).rows;
  conditions.push({
    condition: 'no_unreviewed_override',
    satisfied: unreviewed.length === 0,
    blocking_reference: unreviewed.length ? unreviewed[0].reference : null,
    statement: unreviewed.length
      ? `An override on this lot is unreviewed: ${unreviewed.map((o) => o.reference).join(', ')}. A second person must review it before signing.`
      : 'No override on this lot is unreviewed.'
  });
  // 4 bookkeeping period closed: a certificate issues from a closed period.
  const period = periodId
    ? (await db.query('SELECT * FROM balance_period WHERE id=$1', [periodId])).rows[0]
    : (await db.query("SELECT * FROM balance_period WHERE site=$1 AND grade=$2 AND state='closed' ORDER BY period_start DESC LIMIT 1", [site, lot ? lot.grade : 'N6'])).rows[0];
  conditions.push({
    condition: 'period_closed',
    satisfied: Boolean(period && period.state === 'closed'),
    blocking_reference: period ? period.id : null,
    statement: period
      ? (period.state === 'closed'
        ? `The bookkeeping period ${period.id} is closed.`
        : `The bookkeeping period ${period.id} is open.`)
      : 'No bookkeeping period covers this lot.'
  });
  // 5 balance invariant holds with the allocation applied
  const attached = (await db.query(
    `SELECT category, sum(mass_g)::int AS g FROM credit_movement WHERE direction='out' AND kind='allocation' AND derivation->>'lot'=$1 GROUP BY category`,
    [lotRef])).rows;
  const attachedTotal = attached.reduce((s, a) => s + a.g, 0);
  let invariant = true;
  if (period) {
    const movements = (await db.query('SELECT * FROM credit_movement WHERE period=$1', [period.id])).rows;
    const ins = movements.filter((m) => m.direction === 'in' && m.category === 'post_consumer').reduce((s, m) => s + m.mass_g, 0);
    const outs = movements.filter((m) => m.direction === 'out' && m.category === 'post_consumer').reduce((s, m) => s + m.mass_g, 0);
    invariant = outs <= ins;
  }
  conditions.push({
    condition: 'balance_invariant_holds',
    satisfied: invariant && attachedTotal <= (lot ? lot.mass_g : 0),
    blocking_reference: period ? period.id : null,
    statement: invariant
      ? `Credits attached (${attachedTotal} g) do not exceed the lot mass or the credits available.`
      : 'The ledger would be exceeded by the allocation applied.'
  });
  // 6 carbon figure with all four components
  const fig = (await db.query(
    'SELECT * FROM carbon_figure WHERE lot=$1 AND superseded=false ORDER BY id DESC LIMIT 1', [lotRef])).rows[0];
  const carbonComplete = Boolean(fig && fig.value_mg_per_kg !== null && fig.boundary && fig.method_version && fig.uncertainty_bp !== null);
  conditions.push({
    condition: 'carbon_figure_complete',
    satisfied: carbonComplete,
    blocking_reference: carbonComplete ? null : lotRef,
    statement: carbonComplete
      ? `The carbon figure exists with its boundary, method version and uncertainty.`
      : 'The carbon figure is missing or incomplete: it must carry boundary, method version and uncertainty.'
  });
  // 7 signer scope for this site on the date of signing
  const scopeOk = siteInScope({ sites: signer?.sites || [] }, site);
  const grantEnd = signer?.grant_end || null;
  const grantEndIso = grantEnd ? new Date(grantEnd).toISOString().slice(0, 10) : null;
  const inForce = !grantEndIso || grantEndIso >= today();
  conditions.push({
    condition: 'signer_scope_covers_site',
    satisfied: Boolean(signer && scopeOk && inForce),
    blocking_reference: signer ? site : null,
    statement: signer && scopeOk && inForce
      ? `The signer holds signing scope for ${site}.`
      : `The signer does not hold signing scope for ${site} on the date of signing.`
  });
  // 8 the signer did not enter the data
  const entered = await db.query(
    'SELECT count(*)::int AS n FROM test_result WHERE lot=$1 AND analyst=$2', [lotRef, signer?.email]);
  const enteredBatch = await db.query(
    "SELECT count(*)::int AS n FROM batch WHERE entered_by=$2 AND reference IN (SELECT (derivation->>'batch') FROM credit_movement WHERE derivation->>'lot'=$1)",
    [lotRef, signer?.email]);
  const clean = entered.rows[0].n === 0 && enteredBatch.rows[0].n === 0;
  conditions.push({
    condition: 'signer_did_not_enter_data',
    satisfied: clean,
    blocking_reference: null,
    statement: clean
      ? 'The signer did not enter the data this certificate rests on.'
      : 'The signer entered data this certificate rests on.'
  });
  return conditions;
}

r.post('/certificates/preview', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'certificate_signer')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  const body = await c.req.json().catch(() => ({}));
  if (!body.lot) return Response.json({ error: 'invalid_request', message: 'lot is required' }, { status: 400 });
  const lot = (await db.query('SELECT * FROM lot WHERE reference=$1', [body.lot])).rows[0];
  if (!lot) return Response.json({ error: 'unknown_lot' }, { status: 400 });
  const account = (await db.query('SELECT * FROM app_account WHERE email=$1', [s.email])).rows[0];
  const conditions = await evaluateConditions(db, {
    lotRef: lot.reference, site: lot.site, signer: { ...s, grant_end: account?.grant_end }, periodId: body.period
  });
  return c.json({ lot: lot.reference, site: lot.site, conditions });
});

async function issueNumber(db, site) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [SITE_CERT_SEQ_LOCK]);
    const prefix = site === 'SITE-PILOT' ? 'CERT-PILOT-' : `CERT-${site.replace('SITE-', '')}-`;
    const r0 = await client.query('SELECT count(*)::int AS n FROM app_reference WHERE prefix=$1', [prefix]);
    let n;
    if (r0.rows[0].n === 0) {
      await client.query('INSERT INTO app_reference (prefix,last_n) VALUES ($1,1)', [prefix]);
      n = 1;
    } else {
      const u = await client.query('UPDATE app_reference SET last_n=last_n+1 WHERE prefix=$1 RETURNING last_n', [prefix]);
      n = u.rows[0].last_n;
    }
    await client.query('COMMIT');
    return `${prefix}${String(n).padStart(6, '0')}`;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

function documentFor(cert) {
  return [
    'RAVEL MATERIALS SAS - RECYCLED CONTENT CERTIFICATE',
    '',
    `Certificate number: ${cert.number}`,
    `Version: ${cert.version}`,
    `Site: ${cert.site}`,
    `Grade: ${cert.grade}`,
    `Specification: SPEC-${cert.grade} version ${cert.specification_version}`,
    `Lot: ${cert.lots.map((l) => `${l.reference} ${l.mass_g} g`).join(', ')}`,
    `Claim type: ${cert.claim_type}`,
    `Recycled content: ${(cert.content_bp / 100).toFixed(2)} per cent (${cert.content_bp} basis points)`,
    `Category split: post-consumer ${cert.category_split.post_consumer_g} g, pre-consumer ${cert.category_split.pre_consumer_g} g`,
    `Balance period: ${cert.period}`,
    `Carbon footprint: ${cert.carbon.value_mg_per_kg} mg CO2e per kg`,
    `Carbon boundary: ${cert.carbon.boundary}`,
    `Carbon method version: ${cert.carbon.method} version ${cert.carbon.method_version}`,
    `Carbon uncertainty: ${cert.carbon.uncertainty_bp} basis points`,
    `Scheme: ${cert.scheme}`,
    `Producer registration: ${cert.registration}`,
    `Signer: ${cert.signer}`,
    `Signed at: ${cert.signed_at}`,
    `Verification: ${cert.verification_url}`,
    '',
    'PERMITTED STATEMENT',
    cert.permitted_statement.text,
    '',
    'PROHIBITED STATEMENT',
    cert.prohibited_statement.text,
    '',
    cert.state === 'withdrawn'
      ? `This certificate was withdrawn on ${cert.withdrawn_on_iso}. Reason: ${cert.withdrawal_reason}.`
      : 'Issued under the Ravel mass-balance system. Losses reduce the claim.'
  ].join('\n');
}

// Signing re-authenticates: the password travels with the act.
r.post('/certificates', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'certificate_signer')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    const reauth = await exchangePassword(db, s.email, body.password || '');
    if (!reauth) {
      return Response.json({
        error: 'reauthentication_required',
        message: 'Signing a certificate re-authenticates: the signing act carries the password again and a session alone is not a signing credential.'
      }, { status: 401 });
    }
    if (!body.lot) return Response.json({ error: 'invalid_request', message: 'lot is required' }, { status: 400 });
    const lot = (await db.query('SELECT * FROM lot WHERE reference=$1', [body.lot])).rows[0];
    if (!lot) return Response.json({ error: 'unknown_lot' }, { status: 400 });
    const recipient = body.recipient
      ? (await db.query('SELECT * FROM customer WHERE reference=$1', [body.recipient])).rows[0]
      : null;
    if (!recipient) return Response.json({ error: 'unknown_recipient' }, { status: 400 });

    const account = (await db.query('SELECT * FROM app_account WHERE email=$1', [s.email])).rows[0];
    const conditions = await evaluateConditions(db, {
      lotRef: lot.reference, site: lot.site,
      signer: { ...s, grant_end: account?.grant_end }, periodId: body.period
    });
    const blocking = conditions.filter((x) => !x.satisfied);
    if (blocking.length) {
      await appendEntry(db, {
        kind: 'certificate_signing_refused', object_ref: lot.reference, person: s.email, site: lot.site,
        content: { lot: lot.reference, refused_conditions: blocking.map((b) => b.condition) }
      });
      return Response.json({
        error: 'condition_not_satisfied',
        message: `The condition ${blocking[0].condition} is not satisfied and no condition is waivable.`,
        condition: blocking[0].condition,
        conditions
      }, { status: 409 });
    }

    const period = body.period
      ? (await db.query('SELECT * FROM balance_period WHERE id=$1', [body.period])).rows[0]
      : (await db.query("SELECT * FROM balance_period WHERE site=$1 AND grade=$2 AND state='closed' ORDER BY period_start DESC LIMIT 1", [lot.site, lot.grade])).rows[0];
    const attached = (await db.query(
      `SELECT category, sum(mass_g)::int AS g FROM credit_movement WHERE direction='out' AND kind='allocation' AND derivation->>'lot'=$1 GROUP BY category`,
      [lot.reference])).rows;
    const split = { post_consumer_g: 0, pre_consumer_g: 0 };
    for (const a of attached) {
      if (a.category === 'post_consumer') split.post_consumer_g = a.g;
      if (a.category === 'pre_consumer') split.pre_consumer_g = a.g;
    }
    const attachedTotal = split.post_consumer_g + split.pre_consumer_g;
    const content_bp = floorDiv(attachedTotal * 10000, lot.mass_g);
    const fig = (await db.query(
      'SELECT * FROM carbon_figure WHERE lot=$1 AND superseded=false ORDER BY id DESC LIMIT 1', [lot.reference])).rows[0];
    const cf = (await db.query(
      'SELECT * FROM conversion_factor WHERE site=$1 ORDER BY provisional, published_on DESC LIMIT 1', [lot.site])).rows[0];
    const spec = (await db.query(
      "SELECT * FROM specification WHERE grade=$1 AND state='current' ORDER BY version DESC LIMIT 1", [lot.grade])).rows[0];
    const tests = (await db.query(
      'SELECT * FROM test_result WHERE lot=$1 AND usable_for_release=true ORDER BY id', [lot.reference])).rows;
    const certName = (await db.query(
      'SELECT name FROM party_version WHERE party_ref=$1 AND effective_from <= $2 ORDER BY effective_from DESC LIMIT 1',
      [recipient.reference, today()])).rows;
    const recipientName = certName.length ? certName[0].name : recipient.reference;
    const perm = statements(content_bp, split, lot.claim_type, 'en');
    const number = await issueNumber(db, lot.site);
    const verification_url = `https://ravel.example.com/verify/${number}`;
    const cert = {
      number, version: 1, site: lot.site,
      lots: [{ reference: lot.reference, mass_g: lot.mass_g }],
      grade: lot.grade,
      specification_version: spec ? spec.version : 3,
      claim_type: lot.claim_type,
      content_bp,
      category_split: split,
      period: period ? period.id : null,
      carbon: {
        value_mg_per_kg: fig.value_mg_per_kg, boundary: fig.boundary,
        method: fig.method, method_version: fig.method_version, uncertainty_bp: fig.uncertainty_bp,
        comparator: fig.comparator, breakdown: fig.breakdown,
        energy_location_mg_per_kg: fig.energy_location_mg_per_kg,
        energy_market_mg_per_kg: fig.energy_market_mg_per_kg
      },
      primary_share_bp: fig.primary_share_bp,
      scheme: 'RCS-2026',
      registration: 'REG-RAVEL-0042',
      test_results: tests.map((t) => ({ property: t.property, method: t.method, value: t.value, unit: t.unit })),
      permitted_statement: perm,
      prohibited_statement: prohibitedStatement(content_bp, lot.claim_type),
      signer: s.email,
      signed_at: new Date().toISOString(),
      verification_url,
      state: 'issued',
      provisional_factor: Boolean(cf && cf.provisional),
      conditions,
      input_versions: {
        specification: `SPEC-${lot.grade}:${spec ? spec.version : 3}`,
        conversion_factor: cf ? cf.reference : null,
        carbon_method: `${fig.method}:${fig.method_version}`,
        carbon_figure: `${lot.reference}:v${fig.figure_version}`,
        test_results: tests.map((t) => `${t.property}:${t.method}`),
        recipes: [], site_certification: 'certified:2026'
      },
      recipient: recipient.reference,
      recipient_name: recipientName
    };
    cert.document = documentFor(cert);
    await db.query(
      `INSERT INTO certificate (number,version,site,lots,grade,specification_version,claim_type,content_bp,category_split,period,carbon,
        primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,signer,signed_at,verification_url,state,
        provisional_factor,conditions,input_versions,document,derived_from,recipient)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,null,$26)`,
      [cert.number, cert.version, cert.site, JSON.stringify(cert.lots), cert.grade, cert.specification_version,
        cert.claim_type, cert.content_bp, JSON.stringify(cert.category_split), cert.period, JSON.stringify(cert.carbon),
        cert.primary_share_bp, cert.scheme, cert.registration, JSON.stringify(cert.test_results),
        JSON.stringify(cert.permitted_statement), JSON.stringify(cert.prohibited_statement), cert.signer, cert.signed_at,
        cert.verification_url, cert.state, cert.provisional_factor, JSON.stringify(cert.conditions),
        JSON.stringify(cert.input_versions), cert.document, cert.recipient]);

    await appendEntry(db, {
      kind: 'certificate_signed', object_ref: cert.number, person: s.email, site: cert.site,
      content: {
        number: cert.number, lot: lot.reference, claim_type: cert.claim_type, content_bp: cert.content_bp,
        conditions_as_stood: conditions
      }
    });
    await sendMail(recipient.contact, `Certificate ${cert.number} issued`,
      `Certificate number: ${cert.number}\nClaim type: ${cert.claim_type}\nRecycled content: ${(cert.content_bp / 100).toFixed(2)} per cent\n\nPermitted statement:\n${cert.permitted_statement.text}\n\nVerify this certificate at ravel.example.com/verify/${cert.number}.`);
    return Response.json(certView((await db.query('SELECT * FROM certificate WHERE number=$1', [cert.number])).rows[0], db), { status: 201 });
  });
});

async function certView(row, db) {
  const w = row.state === 'withdrawn'
    ? (await db.query('SELECT * FROM withdrawal WHERE number=$1', [row.number])).rows[0]
    : null;
  const recipientName = await partyName(db, row.recipient, today());
  return {
    number: row.number,
    version: row.version,
    site: row.site,
    lots: row.lots,
    grade: row.grade,
    specification_version: row.specification_version,
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
    signed_at: row.signed_at,
    verification_url: row.verification_url,
    state: row.state,
    provisional_factor: row.provisional_factor,
    conditions: row.conditions,
    input_versions: row.input_versions,
    recipient: row.recipient,
    recipient_name: recipientName,
    withdrawn_on: w ? w.withdrawn_on : null,
    withdrawal_reason: w ? w.reason : null,
    withdrawn_by: w ? w.withdrawn_by : null
  };
}

async function partyName(db, ref, date) {
  const rows = (await db.query(
    'SELECT name FROM party_version WHERE party_ref=$1 AND effective_from <= $2 ORDER BY effective_from DESC LIMIT 1',
    [ref, date])).rows;
  if (rows.length) return rows[0].name;
  const cust = (await db.query('SELECT * FROM customer WHERE reference=$1', [ref])).rows[0];
  return cust ? cust.reference : ref;
}

r.get('/certificates', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM certificate ORDER BY number')).rows;
  const out = [];
  for (const row of rows) out.push(await certView(row, db));
  return c.json(out);
});

r.get('/certificates/:number', async (c) => {
  const db = c.get('db');
  const row = (await db.query('SELECT * FROM certificate WHERE number=$1', [c.req.param('number')])).rows[0];
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(await certView(row, db));
});

r.get('/certificates/:number/document', async (c) => {
  const db = c.get('db');
  const row = (await db.query('SELECT * FROM certificate WHERE number=$1', [c.req.param('number')])).rows[0];
  if (!row) return c.text('No such certificate.', 404);
  return c.text(row.document, 200, { 'content-type': 'text/plain; charset=utf-8' });
});

// Public, unauthenticated, rate limited.
const verifyBuckets = new Map();
r.get('/verify/:number', async (c) => {
  const db = c.get('db');
  const ip = c.req.header('x-forwarded-for') || 'local';
  const nowTs = Date.now();
  const bucket = verifyBuckets.get(ip) || { count: 0, reset: nowTs + 60000 };
  if (nowTs > bucket.reset) { bucket.count = 0; bucket.reset = nowTs + 60000; }
  bucket.count += 1;
  verifyBuckets.set(ip, bucket);
  if (bucket.count > 60) {
    return c.json({ error: 'rate_limited' }, 429);
  }
  const number = c.req.param('number');
  const row = (await db.query('SELECT * FROM certificate WHERE number=$1', [number])).rows[0];
  if (!row) {
    return c.json({
      found: false, number,
      statement: `There is no certificate numbered ${number} in this register.`
    });
  }
  const w = row.state === 'withdrawn'
    ? (await db.query('SELECT * FROM withdrawal WHERE number=$1', [row.number])).rows[0]
    : null;
  const recipientName = await partyName(db, row.recipient, new Date(row.signed_at).toISOString().slice(0, 10));
  return c.json({
    found: true,
    number: row.number,
    state: row.state,
    issued_on: new Date(row.signed_at).toISOString().slice(0, 10),
    withdrawn_on: w ? w.withdrawn_on : null,
    withdrawal_reason: w ? w.reason : null,
    site: row.site,
    grade: row.grade,
    claim_type: row.claim_type,
    recipient_name: recipientName
  });
});

// Withdrawal: five consequences in one action.
r.post('/certificates/:number/withdraw', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'certificate_signer', 'quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const number = c.req.param('number');
    const cert = (await db.query('SELECT * FROM certificate WHERE number=$1', [number])).rows[0];
    if (!cert) return Response.json({ error: 'not_found' }, { status: 404 });
    if (cert.state === 'withdrawn') return Response.json({ error: 'already_withdrawn' }, { status: 409 });
    const body = await c.req.json().catch(() => ({}));
    if (!body.reason) return Response.json({ error: 'invalid_request', message: 'a withdrawal carries a reason' }, { status: 400 });

    const customer = (await db.query('SELECT * FROM customer WHERE reference=$1', [cert.recipient])).rows[0];
    const recipientName = await partyName(db, cert.recipient, today());
    const notified = [{
      reference: cert.recipient,
      name: recipientName,
      contact: customer ? customer.contact : null
    }];
    const void_statements = [
      `This material contains ${(cert.content_bp / 100).toFixed(2)} per cent recycled content.`,
      'This material physically contains recycled content.',
      'This material is physically segregated recycled nylon.'
    ];
    // derived certificates
    const derived = (await db.query('SELECT number FROM certificate WHERE derived_from=$1', [number])).rows
      .map((x) => x.number);
    // reverse traversal of the underlying batches
    const lotsArr = cert.lots.map((l) => l.reference);
    const traversal = { lots: [], certificates: [], recipients: [] };
    for (const lotRef of lotsArr) {
      const imp = await batchTraversalForLot(db, lotRef);
      traversal.lots.push(...imp.lots);
      traversal.certificates.push(...imp.certificates);
      traversal.recipients.push(...imp.recipients);
    }
    traversal.certificates = [...new Set(traversal.certificates.filter((n2) => n2 !== number))];
    traversal.recipients = [...new Set(traversal.recipients)];

    await db.query(`UPDATE certificate SET state='withdrawn' WHERE number=$1`, [number]);
    await db.query(
      `INSERT INTO withdrawal (number,reason,withdrawn_by,withdrawn_on,notified_recipients,void_statements,derived_certificates,batch_traversal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [number, body.reason, s.email, today(), JSON.stringify(notified), JSON.stringify(void_statements),
        JSON.stringify(derived), JSON.stringify(traversal)]);

    await appendEntry(db, {
      kind: 'certificate_withdrawn', object_ref: number, person: s.email, site: cert.site,
      content: {
        number, reason: body.reason, notified: notified.map((n2) => n2.reference),
        void_statements, derived_certificates: derived, batch_traversal: traversal
      }
    });

    if (customer) {
      await sendMail(customer.contact, `Certificate ${number} withdrawn`,
        `Certificate number: ${number}\nReason: ${body.reason}\n\nStatements now void:\n${void_statements.map((v) => `- ${v}`).join('\n')}\n\nThe certificate document remains readable at its address.`);
    }

    return Response.json({
      number,
      state: 'withdrawn',
      reason: body.reason,
      withdrawn_by: s.email,
      withdrawn_on: today(),
      notified_recipients: notified,
      void_statements,
      derived_certificates: derived,
      batch_traversal: traversal
    }, { status: 201 });
  });
});

async function batchTraversalForLot(db, lotRef) {
  const { impactForBatch } = await import('../lib/engine.js');
  const batches = (await db.query('SELECT reference FROM batch')).rows;
  const certs = (await db.query('SELECT number, lots, recipient, state FROM certificate')).rows;
  const out = { lots: [], certificates: [], recipients: [] };
  for (const b of batches) {
    const imp = await impactForBatch(db, b.reference);
    if (!imp) continue;
    if (imp.lots.some((l) => l.reference === lotRef)) {
      out.lots.push(...imp.lots.map((l) => l.reference));
      for (const cert of imp.certificates) {
        if (!out.certificates.includes(cert.number)) out.certificates.push(cert.number);
        if (!out.recipients.includes(cert.recipient)) out.recipients.push(cert.recipient);
      }
    }
  }
  out.lots = [...new Set(out.lots)];
  void certs;
  return out;
}

// Replay: recompute from the recorded input versions.
r.get('/certificates/:number/replay', async (c) => {
  const db = c.get('db');
  const row = (await db.query('SELECT * FROM certificate WHERE number=$1', [c.req.param('number')])).rows[0];
  if (!row) return c.json({ error: 'not_found' }, 404);
  const lotsArr = row.lots;
  const lot = (await db.query('SELECT * FROM lot WHERE reference=$1', [lotsArr[0].reference])).rows[0];
  const attached = (await db.query(
    `SELECT category, sum(mass_g)::int AS g FROM credit_movement WHERE direction='out' AND kind='allocation' AND derivation->>'lot'=$1 GROUP BY category`,
    [lot.reference])).rows;
  const split = { post_consumer_g: 0, pre_consumer_g: 0 };
  for (const a of attached) {
    if (a.category === 'post_consumer') split.post_consumer_g = a.g;
    if (a.category === 'pre_consumer') split.pre_consumer_g = a.g;
  }
  // Recompute from the recorded inputs: where the ledger holds no allocation
  // for this lot, the certificate's own recorded split is its input.
  const ledgerHasAllocation = attached.length > 0;
  const recordedSplit = ledgerHasAllocation ? split : {
    post_consumer_g: row.category_split.post_consumer_g || 0,
    pre_consumer_g: row.category_split.pre_consumer_g || 0
  };
  const recomputed_content_bp = floorDiv((recordedSplit.post_consumer_g + recordedSplit.pre_consumer_g) * 10000, lot.mass_g);
  const fig = (await db.query(
    'SELECT * FROM carbon_figure WHERE lot=$1 AND superseded=false ORDER BY id DESC LIMIT 1', [lot.reference])).rows[0];

  const input_versions = row.input_versions || {};
  // Reproducibility: every version the figure was computed against must resolve.
  const missing = [];
  const cm = input_versions.carbon_method
    ? (await db.query('SELECT * FROM carbon_method WHERE reference=$1 AND version=$2',
      [input_versions.carbon_method.split(':')[0], Number(input_versions.carbon_method.split(':')[1])])).rows[0]
    : null;
  if (input_versions.carbon_method && !cm) missing.push('carbon method version retired');
  if (fig && (!fig.input_versions || !fig.input_versions.emission_factors)) missing.push('emission factor set lost');
  if (missing.length) {
    return c.json({
      number: row.number,
      reproducible: false,
      reason: missing[0],
      input_versions
    });
  }
  const differing_input = recomputed_content_bp !== row.content_bp
    ? { field: 'content_bp', issued: row.content_bp, recomputed: recomputed_content_bp, cause: 'the ledger allocation against this lot moved' }
    : (fig && fig.value_mg_per_kg !== row.carbon.value_mg_per_kg)
      ? { field: 'value_mg_per_kg', issued: row.carbon.value_mg_per_kg, recomputed: fig.value_mg_per_kg, cause: 'the carbon figure was recomputed' }
      : null;
  return c.json({
    number: row.number,
    issued: {
      content_bp: row.content_bp,
      value_mg_per_kg: row.carbon.value_mg_per_kg,
      method_version: row.carbon.method_version
    },
    recomputed: {
      content_bp: recomputed_content_bp,
      value_mg_per_kg: fig ? fig.value_mg_per_kg : null,
      method_version: fig ? `${fig.method} version ${fig.method_version}` : null
    },
    agrees: !differing_input,
    differing_input,
    reproducible: true,
    input_versions
  });
});

export default r;
