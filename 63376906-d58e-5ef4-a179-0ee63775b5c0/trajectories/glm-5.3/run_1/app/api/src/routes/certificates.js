import { Hono } from 'hono';
import { q, one, client, exec } from '../db.js';
import { requireAuth, requireRole, bad, notFound, conflict, forbidden, reqField, intField, enumField, rememberIdempotency, refusePagination } from '../lib/http.js';
import { entry, entryTop } from '../record.js';
import { sendMail } from '../mail.js';
import { cfg } from '../config.js';
import { contentBp, floorDiv, floorMulDiv } from '../engine/int.js';
import { batchImpact } from '../engine/domain.js';

const r = new Hono();
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const iso = (d) => (d instanceof Date ? d.toISOString() : d);

const CONDITIONS = [
  'lot_released',
  'no_open_deviation',
  'no_unreviewed_override',
  'period_closed',
  'balance_invariant_holds',
  'carbon_figure_complete',
  'signer_scope_covers_site',
  'signer_did_not_enter_data'
];

const CLAIM_STATEMENTS = {
  mass_balance: {
    permitted: (bp, split) => `This material is claimed by mass balance. It is not physically segregated.`,
    prohibited: () => `You may not state that this material physically contains recycled content.`
  },
  controlled_blending: {
    permitted: (bp) => `This material is claimed under controlled blending at ${bp} basis points of recycled content.`,
    prohibited: () => `You may not state that this material is physically segregated recycled content.`
  },
  physically_segregated: {
    permitted: (bp) => `This material is physically segregated recycled content at ${bp} basis points.`,
    prohibited: () => `You may not state a recycled-content percentage beyond the documented share.`
  }
};

async function attachedFor(lot) {
  return Number((await one(`SELECT coalesce(sum(mass_g),0)::bigint m FROM credit_movements WHERE lot=$1 AND kind='allocation'`, [lot])).m);
}

// The eight conditions, decided against the records as they stand now.
export async function eightConditions(lot, signer) {
  const l = await one('SELECT * FROM lots WHERE reference=$1', [lot]);
  if (!l) throw notFound('lot_not_found');
  const attached = await attachedFor(lot);
  const bp = attached > 0 ? contentBp(attached, Number(l.mass_g)) : null;
  const byCat = await q(`SELECT category, coalesce(sum(mass_g),0)::bigint m FROM credit_movements WHERE lot=$1 AND kind='allocation' GROUP BY category`, [lot]);
  const split = {}; for (const c of byCat) split[c.category] = Number(c.m);
  const dev = await q(`SELECT * FROM deviations WHERE state='open'`);
  const touching = dev.filter(d => (d.lots || []).includes(lot) || (d.runs || []).includes(l.produced_by));
  const ovr = await q(`SELECT * FROM overrides WHERE lot=$1 AND reviewed=false`, [lot]);
  const period = await one(`SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 AND state='closed' ORDER BY period_to DESC LIMIT 1`, [l.site, l.grade]);
  const figure = await one(`SELECT * FROM carbon_figures WHERE lot=$1 AND superseded=false ORDER BY version DESC LIMIT 1`, [lot]);
  const carbonOk = !!figure && figure.boundary && figure.method_version && figure.uncertainty_bp !== null;
  const entered = signer ? await one(`SELECT 1 FROM test_results WHERE subject IN (SELECT reference FROM lots WHERE reference=$1) AND analyst=$2 LIMIT 1`, [lot, signer]) : null;
  const enteredBatch = signer ? await one(`SELECT 1 FROM batches WHERE collector=$2 AND reference IN (SELECT batch FROM consumptions WHERE run IN (SELECT run FROM outputs WHERE reference=$1)) LIMIT 1`, [lot, signer]) : null;
  const ledgerOk = attached <= Number(l.mass_g);
  const siteCert = await one(`SELECT * FROM site_certifications WHERE site=$1 AND state='suspended' AND NOT lifted ORDER BY valid_from DESC LIMIT 1`, [l.site]);
  const susp = siteCert && (!siteCert.effective_from || new Date(siteCert.effective_from) <= new Date());
  const out = [
    { condition: 'lot_released', satisfied: l.disposition === 'released', blocking_reference: l.disposition === 'released' ? null : `/console/lots/${lot}` },
    { condition: 'no_open_deviation', satisfied: touching.length === 0, blocking_reference: touching.length ? `/console/deviations/${touching[0].reference}` : null },
    { condition: 'no_unreviewed_override', satisfied: ovr.length === 0, blocking_reference: ovr.length ? `/console/overrides/${ovr[0].reference}` : null },
    { condition: 'period_closed', satisfied: !!period, blocking_reference: period ? null : `/console/balance` },
    { condition: 'balance_invariant_holds', satisfied: ledgerOk, blocking_reference: ledgerOk ? null : `/console/balance` },
    { condition: 'carbon_figure_complete', satisfied: carbonOk, blocking_reference: carbonOk ? null : `/console/lots/${lot}/carbon` },
    { condition: 'signer_scope_covers_site', satisfied: signer ? signer.sites.includes(l.site) : false, blocking_reference: null },
    { condition: 'signer_did_not_enter_data', satisfied: signer ? !(entered || enteredBatch) : false, blocking_reference: null }
  ];
  if (susp) out.push({ condition: 'site_certification_suspended', satisfied: false, blocking_reference: `/console/sites/${l.site}/certification` });
  return { conditions: out, lot: l, attached, content_bp: bp, category_split: split, figure, period, touching, ovr, suspended: !!susp };
}

r.post('/api/certificates/preview', async (c) => {
  const user = await requireRole(c, 'certificate_signer');
  const b = await c.req.json();
  const lot = reqField(b.lot, 'lot');
  const recipient = reqField(b.recipient, 'recipient');
  const result = await eightConditions(lot, user);
  return c.json({
    lot, recipient, signer: user.email,
    conditions: result.conditions.slice(0, 8),
    extra_conditions: result.conditions.slice(8),
    content_bp: result.content_bp, claim_type: result.lot.claim_type,
    all_satisfied: result.conditions.slice(0, 8).every(x => x.satisfied)
  });
});

// ---- Signing. The number is gapless per site. The eight are re-decided at the moment of signing.
r.post('/api/certificates', async (c) => {
  const user = await requireRole(c, 'certificate_signer');
  const b = await c.req.json();
  // Signing re-authenticates: a session alone is not a signing credential.
  const password = reqField(b.password, 'password');
  const { keycloakLogin } = await import('../auth.js');
  const kc = await keycloakLogin(user.email, password);
  if (!kc || kc.claims.email !== user.email) throw forbidden('reauthentication_failed', { rule: 'signing carries the password again' });

  const lot = reqField(b.lot, 'lot');
  const recipientRef = reqField(b.recipient, 'recipient');
  const result = await eightConditions(lot, user);
  const failed = result.conditions.filter(x => !x.satisfied);
  if (failed.length) {
    await entryTop({ person: user.email, site: result.lot.site, object: lot, act: 'certificate_signing_refused',
      content: { lot, conditions_failed: failed.map(x => x.condition) } });
    throw conflict('condition_not_satisfied', { condition: failed[0].condition, failed: failed.map(x => x.condition),
      message: `The condition that changed: ${failed[0].condition}` });
  }
  const l = result.lot;
  const rec = await one('SELECT * FROM customers WHERE reference=$1', [recipientRef]);
  if (!rec) throw notFound('recipient_not_found');
  const spec = await one('SELECT * FROM specifications WHERE id=$1 ORDER BY version DESC LIMIT 1', ['SPEC-' + l.grade]);
  const tests = await q('SELECT * FROM test_results WHERE subject=$1 AND usable_for_release ORDER BY id', [lot]);
  const factor = await one(`SELECT * FROM conversion_factors WHERE site=$1 ORDER BY published_on DESC LIMIT 1`, [l.site]);
  const period = result.period;

  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['cert-seq:' + l.site]);
    const seq = await one(`SELECT next_number FROM certificate_sequences WHERE site=$1 FOR UPDATE`, [l.site], tx);
    if (!seq) throw bad('sequence_missing', { site: l.site });
    const n = Number(seq.next_number);
    const siteShort = l.site.replace('SITE-', '');
    const number = `CERT-${siteShort}-${String(n).padStart(6, '0')}`;
    await tx.query(`UPDATE certificate_sequences SET next_number = $2 WHERE site=$1`, [l.site, n + 1], tx);
    const claim_type = l.claim_type;
    const statements = CLAIM_STATEMENTS[claim_type];
    const permitted = statements.permitted(result.content_bp, result.category_split);
    const prohibited = statements.prohibited();
    const figure = result.figure;
    const carbon = figure ? {
      lot, value_mg_per_kg: Number(figure.value_mg_per_kg), boundary: figure.boundary,
      method_version: `CM-PA6 v${figure.method_version}`, uncertainty_bp: figure.uncertainty_bp,
      comparator: figure.comparator, breakdown: figure.breakdown
    } : null;
    await tx.query(`INSERT INTO certificates (number, version, site, recipient, period, grade, specification, specification_version,
        claim_type, content_bp, category_split, lots, scheme, registration, test_results, permitted_statement, prohibited_statement,
        signer, signed_at, verification_url, state, provisional_factor, conditions, carbon, primary_share_bp)
      VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now(),$18,'issued',$19,$20,$21,$22)`,
      [number, l.site, recipientRef, period.id, l.grade, spec.id, spec.version, claim_type, result.content_bp,
       JSON.stringify(result.category_split), JSON.stringify([{ lot, mass_g: Number(l.mass_g) }]),
       'RCS-2026', 'REG-RAVEL-0042', JSON.stringify(tests.map(t => ({ property: t.property, method: t.method, value: Number(t.value), unit: t.unit, uncertainty_bp: t.uncertainty_bp }))),
       permitted, prohibited, user.email, cfg.verifyBase + number, factor?.provisional || false,
       JSON.stringify(result.conditions.slice(0, 8)), JSON.stringify(carbon), figure ? figure.primary_share_bp : null], tx);
    const e = await entry(tx, { person: user.email, site: l.site, object: number, act: 'certificate_signed',
      content: { number, lot, recipient: recipientRef, claim_type, content_bp: result.content_bp, conditions: result.conditions.map(x => ({ condition: x.condition, satisfied: x.satisfied })) } });
    await tx.query('COMMIT');
    const cust = await one(`SELECT contact FROM customers WHERE reference=$1`, [recipientRef]);
    if (cust?.contact) {
      await sendMail(cust.contact, `Certificate ${number} issued`,
        `Certificate ${number} issued.\n\nClaim type: ${claim_type}.\nRecycled content: ${result.content_bp} basis points.\nPermitted statement: ${permitted}\n\nVerify this certificate at ravel.example.com/verify/${number}.`);
    }
    await rememberIdempotency(c, 201, { reference: number, number, record_seq: e.seq });
    const cert = await one('SELECT * FROM certificates WHERE number=$1', [number]);
    return c.json(serializeCertificate(cert), 201);
  } catch (ex) { try { await tx.query('ROLLBACK'); } catch {} throw ex; } finally { tx.release(); }
});

export function serializeCertificate(x) {
  const withdrawn = x.state === 'withdrawn';
  const wd = x.derived_resolutions && typeof x.derived_resolutions === 'string' ? JSON.parse(x.derived_resolutions) : (x.derived_resolutions || {});
  return {
    number: x.number, version: x.version, site: x.site,
    recipient: x.recipient,
    lots: typeof x.lots === 'string' ? JSON.parse(x.lots) : x.lots,
    grade: x.grade, specification_version: x.specification_version,
    specification: x.specification, claim_type: x.claim_type, content_bp: x.content_bp,
    category_split: x.category_split, period: x.period,
    carbon: x.carbon, primary_share_bp: x.primary_share_bp,
    scheme: x.scheme, registration: x.registration,
    test_results: x.test_results,
    permitted_statement: x.permitted_statement, prohibited_statement: x.prohibited_statement,
    signer: x.signer, signed_at: iso(x.signed_at),
    verification_url: x.verification_url,
    state: x.state, provisional_factor: x.provisional_factor,
    conditions: x.conditions,
    withdrawn_on: wd.withdrawn_on || null, withdrawn_by: wd.withdrawn_by || null,
    withdrawal_reason: wd.withdrawal_reason || null,
    notified_recipients: wd.notified_recipients || [], void_statements: wd.void_statements || [],
    derived_certificates: wd.derived_certificates || [], batch_traversal: wd.batch_traversal || null
  };
}

r.get('/api/certificates', async (c) => {
  refusePagination(c);
  await requireAuth(c);
  const rows = await q('SELECT * FROM certificates ORDER BY number');
  return c.json(rows.map(serializeCertificate));
});

r.get('/api/certificates/:number', async (c) => {
  refusePagination(c);
  await requireAuth(c);
  const x = await one('SELECT * FROM certificates WHERE number = $1', [c.req.param('number')]);
  if (!x) throw notFound('certificate_not_found');
  return c.json(serializeCertificate(x));
});

// ---- Withdrawal: one action, five consequences, never a deletion.
r.post('/api/certificates/:number/withdraw', async (c) => {
  const user = await requireRole(c, 'certificate_signer');
  const x = await one('SELECT * FROM certificates WHERE number = $1', [c.req.param('number')]);
  if (!x) throw notFound('certificate_not_found');
  if (x.state === 'withdrawn') throw conflict('certificate_already_withdrawn');
  if (!user.sites.includes(x.site)) throw forbidden('site_out_of_scope', { site: x.site });
  const b = await c.req.json();
  const reason = reqField(b.reason, 'reason');
  const lots = typeof x.lots === 'string' ? JSON.parse(x.lots) : x.lots;
  // reverse traversal of the underlying batches
  const traversals = [];
  const certsTouching = new Map();
  for (const lotRow of lots) {
    const genealogy = await (await import('../engine/domain.js')).genealogyFor(lotRow.lot);
    const batchRefs = (genealogy?.nodes || []).filter(n => n.kind === 'batch').map(n => n.reference);
    for (const bref of batchRefs) {
      const impact = await (await import('../engine/domain.js')).batchImpact(bref);
      for (const cert of impact.certificates) if (cert.number !== x.number) certsTouching.set(cert.number, cert);
      traversals.push({ batch: bref, certificates: impact.certificates.map(cc => cc.number) });
    }
  }
  const cust = await one('SELECT * FROM customers WHERE reference=$1', [x.recipient]);
  const notified = [{ recipient: x.recipient, name: cust ? cust.party : x.recipient, address: cust?.contact || null }];
  const voidStatements = [
    `Certificate ${x.number} statement: ${x.permitted_statement}`,
    `You may not state that this material physically contains recycled content (withdrawn).`,
    `Any claim of ${x.content_bp} basis points of recycled content under ${x.scheme}.`
  ];
  const derived = [...certsTouching.values()].map(v => ({ number: v.number, state: v.state, resolution: 'to_be_resolved' }));
  const derived_resolutions = {
    withdrawn_on: isoD(new Date()), withdrawn_by: user.email, withdrawal_reason: reason,
    notified_recipients: notified, void_statements: voidStatements,
    derived_certificates: derived, batch_traversal: traversals
  };
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`UPDATE certificates SET state='withdrawn', derived_resolutions=$2 WHERE number=$1`,
      [x.number, JSON.stringify(derived_resolutions)]);
    const e = await entry(tx, { person: user.email, site: x.site, object: x.number, act: 'certificate_withdrawn',
      content: { number: x.number, reason, notified_recipients: notified, void_statements: voidStatements,
        derived_certificates: derived, batch_traversal: traversals } });
    await tx.query('COMMIT');
    if (cust?.contact) {
      await sendMail(cust.contact, `Certificate ${x.number} withdrawn`,
        `Certificate ${x.number} withdrawn.\n\nReason: ${reason}\n\nStatements now void:\n${voidStatements.map(s => '- ' + s).join('\n')}\n`);
    }
    await rememberIdempotency(c, 201, { reference: x.number, state: 'withdrawn', reason, record_seq: e.seq });
    return c.json({ number: x.number, state: 'withdrawn', reason, withdrawn_by: user.email,
      withdrawn_on: isoD(new Date()), notified_recipients: notified, void_statements: voidStatements,
      derived_certificates: derived, batch_traversal: traversals, record_seq: e.seq }, 201);
  } catch (ex) { try { await tx.query('ROLLBACK'); } catch {} throw ex; } finally { tx.release(); }
});

// ---- The document: plain text, byte-stable for a version.
r.get('/api/certificates/:number/document', async (c) => {
  const x = await one('SELECT * FROM certificates WHERE number = $1', [c.req.param('number')]);
  if (!x) return c.text('No such certificate.', 404);
  const carbon = x.carbon;
  const doc = [
    `RAVEL RECYCLED POLYMER CERTIFICATE`,
    ``,
    `Certificate number: ${x.number}`,
    `Version: ${x.version}`,
    `Site: ${x.site}`,
    `Grade: ${x.grade}`,
    `Specification: ${x.specification} version ${x.specification_version}`,
    `Scheme: ${x.scheme}`,
    `Producer registration: ${x.registration}`,
    `Period: ${x.period}`,
    ``,
    `CLAIM`,
    `Claim type: ${x.claim_type}`,
    `Recycled content: ${x.content_bp} basis points`,
    `Category split: ${Object.entries(x.category_split || {}).map(([k, v]) => `${k} ${v} g`).join(', ')}`,
    ``,
    `LOTS`,
    ...(x.lots || []).map(l => `  ${l.lot} — ${l.mass_g} g`),
    ``,
    `CARBON`,
    carbon ? `  Value: ${carbon.value_mg_per_kg} mg CO2e per kg` : `  No carbon figure.`,
    carbon ? `  Boundary: ${carbon.boundary}` : '',
    carbon ? `  Method version: ${carbon.method_version}` : '',
    carbon ? `  Uncertainty: ${carbon.uncertainty_bp} basis points` : '',
    carbon ? `  Primary data share: ${x.primary_share_bp} basis points` : '',
    ``,
    `PERMITTED STATEMENT`,
    `  ${x.permitted_statement}`,
    ``,
    `PROHIBITED STATEMENT`,
    `  ${x.prohibited_statement}`,
    ``,
    x.state === 'withdrawn' ? `WITHDRAWN` : `STATUS`,
    x.state === 'withdrawn'
      ? `  This certificate was withdrawn on ${x.derived_resolutions?.withdrawn_on || ''}. Reason: ${x.derived_resolutions?.withdrawal_reason || x.derived_resolutions?.reason || ''}.`
      : `  Issued.`,
    ``,
    `Signed by ${x.signer} on ${iso(x.signed_at).slice(0, 10)}.`,
    `Verify this certificate at ravel.example.com/verify/${x.number}.`
  ].filter(l => l !== '').join('\n');
  return c.body(doc + '\n', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
});

// ---- Public verification: no session, rate limited, and no enumeration.
const verifyBuckets = new Map();
r.get('/api/verify/:number', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'anon';
  const now = Date.now();
  const b = verifyBuckets.get(ip) || { start: now, count: 0 };
  if (now - b.start > 60000) { b.start = now; b.count = 0; }
  b.count++;
  verifyBuckets.set(ip, b);
  if (b.count > 30) return c.json({ error: 'rate_limited' }, 429);
  const x = await one('SELECT * FROM certificates WHERE number = $1', [c.req.param('number')]);
  if (!x) return c.json({ found: false, number: c.req.param('number') });
  const wd = x.derived_resolutions || {};
  return c.json({
    found: true, number: x.number, state: x.state,
    issued_on: iso(x.signed_at).slice(0, 10),
    withdrawn_on: wd.withdrawn_on || null, withdrawal_reason: wd.withdrawal_reason || wd.reason || null,
    site: x.site, grade: x.grade, claim_type: x.claim_type,
    content_bp: x.content_bp, recipient_name: x.recipient
  });
});

// ---- Replay: recompute from the recorded input versions.
r.get('/api/certificates/:number/replay', async (c) => {
  await requireAuth(c);
  const x = await one('SELECT * FROM certificates WHERE number = $1', [c.req.param('number')]);
  if (!x) throw notFound('certificate_not_found');
  const lots = typeof x.lots === 'string' ? JSON.parse(x.lots) : x.lots;
  const recomputed = {};
  let differing = null;
  let reproducible = true, reason = null;
  for (const l of lots) {
    const attached = await attachedFor(l.lot);
    const lotRow = await one('SELECT * FROM lots WHERE reference=$1', [l.lot]);
    const bp = attached > 0 ? contentBp(attached, Number(lotRow.mass_g)) : null;
    recomputed[l.lot] = bp;
    if (bp !== x.content_bp && !differing) differing = { input: `credit_attached_g for ${l.lot}`, issued_value: x.content_bp, recomputed_value: bp };
  }
  const figure = await one(`SELECT * FROM carbon_figures WHERE lot=$1 ORDER BY version DESC LIMIT 1`, [lots[0]?.lot]);
  if (!figure) { reproducible = false; reason = 'input version no longer resolvable: carbon figure absent'; }
  const method = await one(`SELECT * FROM carbon_methods WHERE id='CM-PA6' AND version=$1`, [x.carbon?.method_version ? Number(String(x.carbon.method_version).replace(/[^0-9]/g, '')) : figure?.method_version]);
  if (!method) { reproducible = false; reason = 'a retired method version cannot be resolved'; }
  return c.json({
    number: x.number,
    issued: { content_bp: x.content_bp, carbon_value_mg_per_kg: x.carbon?.value_mg_per_kg ?? null },
    recomputed: { content_bp: recomputed[lots[0]?.lot] ?? null, carbon_value_mg_per_kg: figure ? Number(figure.value_mg_per_kg) : null },
    agrees: !differing && reproducible,
    differing_input: differing,
    reproducible, reason,
    input_versions: {
      conversion_factor: (await one(`SELECT reference, factor_bp FROM conversion_factors WHERE site=$1 ORDER BY published_on DESC LIMIT 1`, [x.site])) || null,
      carbon_method: x.carbon?.method_version || null,
      specification: `${x.specification} v${x.specification_version}`
    }
  });
});

export default r;
