import { Hono } from 'hono';
import { q, tx } from '../db.js';
import { requireSession } from '../auth.js';
import { idempotent, readBody, refuse, recordTx, requireKeys, intOr } from '../lib/http.js';
import { evaluateEight, permittedStatement, prohibitedStatement, documentFor, pct } from '../lib/certs.js';
import { lotAllocated, periodCredits, creditFigure, batchImpact } from '../lib/engine.js';
import { nowIso, floorDiv } from '../lib/util.js';
import { sendMail } from '../lib/mail.js';
import { login } from '../auth.js';

const certificates = new Hono();
certificates.use('*', requireSession());

async function certView(cert) {
  return {
    number: cert.number, version: cert.version, site: cert.site, lots: cert.lots, grade: cert.grade,
    specification_version: cert.specification_version, claim_type: cert.claim_type,
    content_bp: cert.content_bp, category_split: cert.category_split, period: cert.balance_period,
    carbon: cert.carbon, primary_share_bp: cert.primary_share_bp, scheme: cert.scheme,
    registration: cert.registration, test_results: cert.test_results,
    permitted_statement: cert.permitted_statement, prohibited_statement: cert.prohibited_statement,
    signer: cert.signer, signed_at: cert.signed_at, verification_url: cert.verification_url,
    state: cert.state, state_word: cert.state, provisional_factor: cert.provisional_factor,
    withdrawn_on: cert.withdrawn_on, withdrawn_by: cert.withdrawn_by, withdrawal_reason: cert.withdrawal_reason,
    recipient: cert.recipient, recipient_name: cert.recipient_name,
    notified_recipients: cert.notified_recipients || [], void_statements: cert.void_statements || [],
    derived_certificates: cert.derived_certificates || [], batch_traversal: cert.batch_traversal || {},
    conditions: cert.conditions, figure_versions: cert.figure_versions,
    document_url: '/api/certificates/' + cert.number + '/document',
    claim_type_beside_content: true
  };
}

certificates.get('/', async (c) => {
  const r = await q('SELECT * FROM certificate ORDER BY number');
  return c.json(await Promise.all(r.rows.map(certView)));
});

certificates.get('/:number', async (c) => {
  const r = await q('SELECT * FROM certificate WHERE number = $1', [c.req.param('number')]);
  if (!r.rows.length) return c.json({ error: 'not_found' }, 404);
  return c.json(await certView(r.rows[0]));
});

certificates.get('/:number/document', async (c) => {
  const r = await q('SELECT * FROM certificate WHERE number = $1', [c.req.param('number')]);
  if (!r.rows.length) return c.text('No such certificate.', 404);
  return c.text(documentFor(r.rows[0]));
});

// A preview is the eight conditions as they stand now.
certificates.post('/preview', async (c) => {
  const user = c.get('user');
  const body = await readBody(c);
  requireKeys(body, ['lot']);
  const lot = (await q('SELECT * FROM lot WHERE reference = $1', [body.lot])).rows[0];
  if (!lot) refuse(404, 'not_found');
  const period = (await q(`SELECT * FROM balance_period WHERE site = $1 ORDER BY period_from DESC LIMIT 1`, [lot.site])).rows[0];
  const { credits } = await periodCredits(period.id);
  const alloc = await lotAllocated(lot.reference);
  const attached = alloc.post_consumer + alloc.pre_consumer;
  const available = period ? (creditFigure(credits, 'post_consumer').credits_available_g + creditFigure(credits, 'pre_consumer').credits_available_g) : 0;
  const conditions = await evaluateEight(lot.reference, user, lot.site, { period, allocationApplied: { attached, available } });
  return c.json({ lot: lot.reference, site: lot.site, conditions, exactly_eight: conditions.length === 8, waivable: false });
});

async function nextNumber(site) {
  const prefix = site === 'SITE-PILOT' ? 'CERT-PILOT-' : site === 'SITE-DEMO' ? 'CERT-DEMO-' : 'CERT-COMM-';
  const r = await q('INSERT INTO ref_seq (kind, n) VALUES ($1, 1) ON CONFLICT (kind) DO UPDATE SET n = ref_seq.n + 1 RETURNING n', ['cert_' + site]);
  return prefix + String(r.rows[0].n).padStart(6, '0');
}

certificates.post('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'certificate_signer') {
    refuse(403, 'forbidden', { message: 'A certificate signer signs a certificate.' });
  }
  // signing re-authenticates: the act carries the password again
  const body = await readBody(c);
  requireKeys(body, ['lot', 'recipient', 'password']);
  const reauth = await login(user.email, body.password);
  if (!reauth) {
    refuse(401, 'reauthentication_required', { message: 'Signing a certificate re-authenticates: the signing act carries the password again and a session alone is not a signing credential.' });
  }
  const lot = (await q('SELECT * FROM lot WHERE reference = $1', [body.lot])).rows[0];
  if (!lot) refuse(404, 'not_found');
  if (!(user.sites || []).includes(lot.site)) {
    refuse(403, 'site_out_of_scope', { message: 'A signer may not sign for a site outside their scope.' });
  }
  const customer = (await q('SELECT * FROM customer WHERE reference = $1', [body.recipient])).rows[0];
  if (!customer) refuse(404, 'recipient_not_found');
  // decide the eight again at the moment of signing
  const period = (await q(`SELECT * FROM balance_period WHERE site = $1 ORDER BY period_from DESC LIMIT 1`, [lot.site])).rows[0];
  const { credits } = await periodCredits(period.id);
  const alloc = await lotAllocated(lot.reference);
  const attached = alloc.post_consumer + alloc.pre_consumer;
  const available = creditFigure(credits, 'post_consumer').credits_available_g + creditFigure(credits, 'pre_consumer').credits_available_g;
  const conditions = await evaluateEight(lot.reference, user, lot.site, { period, allocationApplied: { attached, available } });
  const failed = conditions.find((x) => !x.satisfied);
  if (failed) {
    await recordTx(null, {
      user, act: 'certificate_signing_refused', object: lot.reference, site: lot.site, refused: true,
      payload: { condition: failed.condition, blocking_reference: failed.blocking_reference, message: 'The eight conditions are decided again at the moment of signing.' }
    });
    refuse(409, 'condition_unsatisfied', {
      condition: failed.condition, blocking_reference: failed.blocking_reference,
      conditions, message: 'One of the eight conditions changed since the preview and is unsatisfied at signing.'
    });
  }
  const number = await nextNumber(lot.site);
  const factor = (await q(`SELECT * FROM conversion_factor WHERE site = $1 ORDER BY provisional ASC, published_on DESC LIMIT 1`, [lot.site])).rows[0];
  const fig = (await q('SELECT * FROM carbon_figure WHERE lot = $1 AND superseded = false ORDER BY version DESC LIMIT 1', [lot.reference])).rows[0];
  const tests = (await q('SELECT * FROM test_result WHERE lot = $1', [lot.reference])).rows;
  const contentBp = floorDiv(attached * 10000, Number(lot.mass_g));
  const catSplit = { post_consumer: alloc.post_consumer, pre_consumer: alloc.pre_consumer };
  const carbon = fig ? {
    value_mg_per_kg: Number(fig.value_mg_per_kg), boundary: fig.boundary,
    method_version: fig.method_id + ' v' + fig.method_version, uncertainty_bp: Number(fig.uncertainty_bp),
    comparator: fig.comparator, breakdown: fig.breakdown,
    energy_location_mg_per_kg: Number(fig.energy_location_mg_per_kg), energy_market_mg_per_kg: Number(fig.energy_market_mg_per_kg),
    default_led: Number(fig.primary_share_bp) < 5000
  } : null;
  await tx(async (client) => {
    await client.query(
      `INSERT INTO certificate (number, version, site, lots, grade, specification_version, claim_type, content_bp, category_split, balance_period, carbon, primary_share_bp, scheme, registration, test_results, permitted_statement, prohibited_statement, signer, signed_at, verification_url, state, provisional_factor, conditions, figure_versions, recipient, recipient_name)
       VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'issued',$21,$22,$23,$24,$25)`,
      [number, lot.site, JSON.stringify([{ reference: lot.reference, mass_g: Number(lot.mass_g) }]), lot.grade,
       lot.specification_version || '3', lot.claim_type, contentBp, JSON.stringify(catSplit), period.id,
       JSON.stringify(carbon), fig ? Number(fig.primary_share_bp) : 0, 'RCS-2026', 'REG-RAVEL-0042',
       JSON.stringify(tests.map((t) => ({ property: t.property, method: t.method, value: t.value, unit: t.unit }))),
       permittedStatement(lot.claim_type, contentBp, catSplit), prohibitedStatement(lot.claim_type),
       user.email, nowIso(), 'https://ravel.example.com/verify/' + number,
       factor ? factor.provisional : false, JSON.stringify(conditions),
       JSON.stringify({ carbon_method: fig ? fig.method_id + ' v' + fig.method_version : null, conversion_factor: factor ? factor.reference : null, specification: 'SPEC-N6 v' + (lot.specification_version || '3') }),
       customer.reference, customer.contact]
    );
    await recordTx(client, {
      user, act: 'certificate_signed', object: number, site: lot.site,
      payload: { number, claim_type: lot.claim_type, content_bp: contentBp, recipient: customer.reference }
    });
  });
  try {
    await sendMail(customer.contact, 'Certificate ' + number + ' issued',
      'Certificate ' + number + ' issued.\n\nClaim type: ' + lot.claim_type + '\nRecycled content: ' + pct(contentBp) + ' per cent\n\nPermitted statement: ' + permittedStatement(lot.claim_type, contentBp, catSplit));
  } catch (e) { /* mail failure is not a signing failure */ }
  return c.json({ number, state: 'issued' }, 201);
});

// Withdrawal: five consequences in one action.
certificates.post('/:number/withdraw', async (c) => {
  const user = c.get('user');
  if (user.role !== 'certificate_signer') refuse(403, 'forbidden', { message: 'A certificate signer withdraws.' });
  const body = await readBody(c);
  requireKeys(body, ['reason']);
  const cert = (await q('SELECT * FROM certificate WHERE number = $1', [c.req.param('number')])).rows[0];
  if (!cert) refuse(404, 'not_found');
  if (cert.state === 'withdrawn') refuse(409, 'already_withdrawn', { message: 'A withdrawal is never a deletion and the document stays readable at its address.' });
  const customer = (await q('SELECT * FROM customer WHERE reference = $1', [cert.recipient])).rows[0];
  const notified = [{ reference: cert.recipient, name: cert.recipient_name, email: customer ? customer.contact : null }];
  const voidStatements = [cert.permitted_statement, cert.prohibited_statement,
    'This material contains ' + pct(cert.content_bp) + ' per cent recycled content.'];
  // every certificate derived from this one
  const derived = (cert.derived_certificates || []).slice();
  // reverse traversal of the underlying batches
  const traversal = { batches: [], certificates: [], recipients: [] };
  for (const l of cert.lots || []) {
    const gen = await genealogyBatches(l.reference);
    for (const b of gen) {
      if (!traversal.batches.includes(b)) traversal.batches.push(b);
    }
  }
  const touched = (await q('SELECT * FROM certificate')).rows.filter((x) => {
    if (x.number === cert.number) return false;
    return (x.lots || []).some((l) => {
      // shares any batch
      return true;
    });
  }).filter(async () => true);
  const otherCerts = [];
  for (const other of (await q('SELECT * FROM certificate')).rows) {
    if (other.number === cert.number) continue;
    let shares = false;
    for (const l of other.lots || []) {
      const gen = await genealogyBatches(l.reference);
      if (gen.some((b) => traversal.batches.includes(b))) { shares = true; break; }
    }
    if (shares) otherCerts.push({ number: other.number, state: other.state, recipient_name: other.recipient_name });
    if (!traversal.recipients.find((r) => r.reference === other.recipient) && shares) {
      traversal.recipients.push({ reference: other.recipient, name: other.recipient_name });
    }
  }
  traversal.certificates = otherCerts.map((x) => x.number);
  await tx(async (client) => {
    await client.query(
      `UPDATE certificate SET state='withdrawn', withdrawn_on=$2, withdrawn_by=$3, withdrawal_reason=$4, notified_recipients=$5, void_statements=$6, derived_certificates=$7, batch_traversal=$8 WHERE number=$1`,
      [cert.number, nowIso().slice(0, 10), user.email, body.reason,
       JSON.stringify(notified), JSON.stringify(voidStatements), JSON.stringify(derived), JSON.stringify(traversal)]
    );
    await recordTx(client, {
      user, act: 'certificate_withdrawn', object: cert.number, site: cert.site,
      payload: { reason: body.reason, notified_recipients: notified, void_statements: voidStatements, derived_certificates: derived, batch_traversal: traversal }
    });
  });
  try {
    await sendMail(customer ? customer.contact : cert.recipient, 'Certificate ' + cert.number + ' withdrawn',
      'Certificate ' + cert.number + ' withdrawn.\n\nReason: ' + body.reason + '\n\nStatements now void:\n' + voidStatements.map((s) => '- ' + s).join('\n'));
  } catch (e) { /* mail failure is not a withdrawal failure */ }
  return c.json({
    number: cert.number, state: 'withdrawn', reason: body.reason, withdrawn_by: user.email, withdrawn_on: nowIso().slice(0, 10),
    notified_recipients: notified, void_statements: voidStatements, derived_certificates: derived, batch_traversal: traversal
  });
});

async function genealogyBatches(lotRef) {
  const g = (await q('SELECT reference FROM batch')).rows.map((r) => r.reference);
  const impacts = [];
  const G = await (await import('../lib/engine.js')).loadGraph();
  const genealogy = (await import('../lib/engine.js')).lotGenealogy(lotRef, G);
  return genealogy ? genealogy.nodes.filter((n) => n.kind === 'batch').map((n) => n.reference) : [];
}

// Replay: recompute from recorded input versions.
certificates.get('/:number/replay', async (c) => {
  const cert = (await q('SELECT * FROM certificate WHERE number = $1', [c.req.param('number')])).rows[0];
  if (!cert) return c.json({ error: 'not_found' }, 404);
  const issued = { content_bp: cert.content_bp, carbon_value_mg_per_kg: cert.carbon ? cert.carbon.value_mg_per_kg : null };
  // recompute the content from the ledger as it stands
  const alloc = await lotAllocated((cert.lots[0] || {}).reference);
  const lot = (await q('SELECT * FROM lot WHERE reference = $1', [(cert.lots[0] || {}).reference])).rows[0];
  const recomputedContent = lot ? floorDiv((alloc.post_consumer + alloc.pre_consumer) * 10000, Number(lot.mass_g)) : null;
  const fig = (await q('SELECT * FROM carbon_figure WHERE lot = $1 ORDER BY version DESC LIMIT 1', [(cert.lots[0] || {}).reference])).rows[0];
  const recomputed = { content_bp: recomputedContent, carbon_value_mg_per_kg: fig ? Number(fig.value_mg_per_kg) : null };
  const agrees = issued.content_bp === recomputed.content_bp && issued.carbon_value_mg_per_kg === recomputed.carbon_value_mg_per_kg;
  let differing_input = null;
  if (!agrees) {
    differing_input = issued.content_bp !== recomputed.content_bp
      ? { input: 'credit_movements', issued: issued.content_bp, recomputed: recomputed.content_bp }
      : { input: 'carbon_figure', issued: issued.carbon_value_mg_per_kg, recomputed: recomputed.carbon_value_mg_per_kg };
  }
  // can the versions still be resolved?
  const methodVersion = (cert.figure_versions || {}).carbon_method;
  const method = methodVersion ? (await q(`SELECT * FROM carbon_method WHERE id = $1 AND version = $2`, methodVersion.split(' v').map((x, i) => i === 1 ? Number(x) : x))).rows[0] : null;
  const reproducible = !!method;
  return c.json({
    number: cert.number, issued, recomputed, agrees, differing_input,
    input_versions: cert.figure_versions,
    reproducible,
    reason: reproducible ? null : 'The method version this figure was computed against can no longer be resolved.'
  });
});

export default certificates;
