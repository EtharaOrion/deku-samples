// The arithmetic layer. No surface of its own; no writable input other than the
// operational record and the versioned methods. Every answer carries derivation.
import { q, one, tx } from './db.js';
import { dryMass, creditGranted, contentBp, shareBp, factorBp } from './units.js';

export const CATEGORIES = ['post_consumer', 'pre_consumer'];

export async function partyNameAt(partyRef, date) {
  const rows = await q(
    `select name from party_version where party = $1 and effective_from <= $2 order by effective_from desc limit 1`,
    [partyRef, date]);
  if (rows.length) return rows[0].name;
  const p = await one(`select reference from party where reference = $1`, [partyRef]);
  return p ? p.reference : partyRef;
}

export async function approvalInForce(collectorRef, date) {
  return one(
    `select * from approval_period where collector = $1 and valid_from <= $2 and valid_to >= $2
     order by valid_from desc limit 1`, [collectorRef, date]);
}

export async function batchClaimability(b) {
  const reasons = [];
  const ap = await approvalInForce(b.collector, b.received_on);
  const approval = ap ? ap.state : null;
  let claimable = approval === 'approved' || approval === 'conditional';
  if (!claimable) reasons.push(approval === 'conditional' ? 'collector_approval_conditional' : 'collector_approval_lapsed');
  const kinds = (b.custody || []).map((l) => l.kind);
  const required = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
  const missing = required.filter((k) => !kinds.includes(k));
  let custody_complete = missing.length === 0;
  if (!custody_complete) { reasons.push('custody_link_missing:' + missing.join(',')); claimable = false; }
  return { claimable, reasons, approval, custody_complete, missing, dry_mass_g: dryMass(b.net_g, b.moisture_bp) };
}

export async function batchFlags(b) {
  const flags = [];
  if (b.device) {
    const d = await one(`select * from device where reference = $1`, [b.device]);
    if (d) {
      const limit = new Date(b.received_on); limit.setFullYear(limit.getFullYear() - 1);
      if (new Date(d.calibrated_on) < limit) flags.push('lapsed_calibration');
    }
  }
  if (b.rejected_g > 0) flags.push('partially_rejected');
  return flags;
}

export async function batchView(b) {
  const cl = await batchClaimability(b);
  const flags = await batchFlags(b);
  const [openFinding] = await q(`select count(*)::int as n from finding where batch = $1 and state = 'open'`, [b.reference]).then(r=>r);
  const missing = cl.missing.length ? { missing_link: cl.missing[0] } : {};
  const collectorName = await partyNameAt(b.collector, b.received_on);
  const out = {
    reference: b.reference, collector: b.collector, collector_name: collectorName, site: b.site, grade: b.grade,
    category: b.category, gross_g: b.gross_g, tare_g: b.tare_g, net_g: b.net_g, moisture_bp: b.moisture_bp,
    moisture_method: b.moisture_method, device: b.device, received_on: b.received_on,
    dry_mass_g: cl.dry_mass_g, dry_mass: { formula: 'net_g * (10000 - moisture_bp) / 10000 floored', net_g: b.net_g, moisture_bp: b.moisture_bp },
    claimable: cl.claimable, claimable_reason: cl.claimable ? null : cl.reasons[0], claimable_reasons: cl.reasons,
    claimable_from: b.claimable_from || null, custody_complete: cl.custody_complete,
    missing_custody_link: cl.missing[0] || null, flags, custody: b.custody || [], composition: b.composition || [],
    contamination: b.contamination || {}, accepted_g: b.accepted_g ?? b.net_g, rejected_g: b.rejected_g,
    rejected_destination: b.rejected_destination, delivered_g: b.net_g,
    approval_in_force: cl.approval, open_findings: openFinding ? openFinding.n : 0,
    derivation: { claimability: 'collector approval in force on received_on; custody links present',
                  dry_mass: 'net_g * (10000 - moisture_bp) / 10000, floored' },
  };
  return out;
}

export async function lotFlags(lotRef) {
  const flags = new Set();
  const batchRefs = new Set();
  const seen = new Set();
  const stack = [{ kind: 'lot', ref: lotRef }];
  while (stack.length) {
    const cur = stack.pop();
    const key = `${cur.kind}:${cur.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (cur.kind === 'lot') {
      const prod = await q(`select run_ref from output where lot = $1 and kind = 'lot'`, [cur.ref]);
      for (const o of prod) stack.push({ kind: 'run', ref: o.run_ref });
    } else if (cur.kind === 'run') {
      const cons = await q(`select input_kind, input_ref from consumption where run_ref = $1`, [cur.ref]);
      for (const c of cons) {
        if (c.input_kind === 'batch') batchRefs.add(c.input_ref);
        else stack.push({ kind: 'output', ref: c.input_ref });
      }
    } else if (cur.kind === 'output') {
      const o = await one(`select run_ref from output where reference = $1`, [cur.ref]);
      if (o) stack.push({ kind: 'run', ref: o.run_ref });
    }
  }
  for (const ref of batchRefs) {
    const b = await one(`select * from batch where reference = $1`, [ref]);
    if (!b) continue;
    const kinds = new Set((b.custody || []).map((l) => l.kind));
    const required = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
    if (required.some((k) => !kinds.has(k))) flags.add('custody_link_missing');
    for (const f of await batchFlags(b)) flags.add(f);
  }
  return [...flags];
}

export async function periodFor(site, grade, date) {
  return one(`select * from balance_period where site = $1 and grade = $2 and period_from <= $3 and period_to >= $3`, [site, grade, date]);
}

export async function balanceOf(periodId) {
  const movs = await q(`select * from credit_movement where balance_period = $1 order by id`, [periodId]);
  const out = {};
  for (const c of CATEGORIES) out[c] = { credits_in_g: 0, credits_out_g: 0 };
  for (const m of movs) {
    if (!(m.category in out)) continue;
    if (m.direction === 'in') out[m.category].credits_in_g += m.mass_g;
    else out[m.category].credits_out_g += m.mass_g;
  }
  for (const c of CATEGORIES) out[c].credits_available_g = out[c].credits_in_g - out[c].credits_out_g;
  return { categories: out, movements: movs };
}

export async function conversionFactorFor(site, date) {
  const rows = await q(`select * from conversion_factor where site = $1 order by published_on desc, created_at desc`, [site]);
  const nonProv = rows.find((r) => !r.provisional && (!r.derived_to || new Date(r.derived_to) >= new Date(date)));
  return nonProv || rows.find((r) => r.provisional) || null;
}

export async function grantCredits(runRef) {
  const run = await one(`select * from run where reference = $1`, [runRef]);
  if (!run) return [];
  const cons = await q(`select * from consumption where run_ref = $1`, [runRef]);
  const granted = [];
  for (const c of cons) {
    if (c.input_kind !== 'batch') continue;
    const b = await one(`select * from batch where reference = $1`, [c.input_ref]);
    if (!b) continue;
    const cl = await batchClaimability(b);
    const eff = b.claimable_from || b.received_on;
    const ap = await approvalInForce(b.collector, eff);
    const approved = ap && (ap.state === 'approved' || ap.state === 'conditional');
    const period = await periodFor(b.site, b.grade, c.effective_on);
    if (!period) continue;
    const cf = await conversionFactorFor(b.site, c.effective_on);
    if (!cf) continue;
    const dry = dryMass(c.mass_g, b.moisture_bp);
    const amount = approved ? creditGranted(dry, cf.factor_bp) : 0;
    granted.push({ period: period.id, batch: b.reference, category: approved ? b.category : 'non_claimable',
      mass_g: amount, factor: cf.reference, factor_bp: cf.factor_bp, dry_mass_consumed_g: dry,
      effective_on: c.effective_on, site: b.site });
  }
  return granted;
}

export function statementFor(claimType, contentBpValue, split, lang = 'en') {
  const pct = (contentBpValue / 100).toFixed(2);
  if (claimType === 'physically_segregated') {
    return {
      permitted: `This material contains ${pct} per cent recycled polyamide, physically segregated from other material throughout production.`,
      prohibited: `You may not state that this material was produced by mass balance.`,
    };
  }
  if (claimType === 'controlled_blending') {
    return {
      permitted: `This material is claimed under controlled blending at ${pct} per cent recycled content and may not be described as physically segregated.`,
      prohibited: `You may not state that this material physically contains recycled content.`,
    };
  }
  return {
    permitted: `This material is claimed by mass balance at ${pct} per cent recycled polyamide (${splitString(split)}). It is not physically segregated.`,
    prohibited: `You may not state that this material physically contains recycled content.`,
  };
}
function splitString(split) {
  const total = Object.entries(split || {}).filter(([k, v]) => ['post_consumer', 'pre_consumer'].includes(k) && v > 0).reduce((s, [, v]) => s + v, 0);
  const parts = Object.entries(split || {}).filter(([k, v]) => ['post_consumer', 'pre_consumer'].includes(k) && v > 0)
    .map(([k, v]) => `${(Math.floor((v * 10000) / (total || 1)) / 100).toFixed(2)} per cent ${k.replace('_', ' ')}`);
  return parts.join(', ') || 'no category share stated';
}

export function certificateNumber(site, seq) {
  const short = site === 'SITE-PILOT' ? 'PILOT' : site === 'SITE-DEMO' ? 'DEMO' : site.replace('SITE-', '');
  return `CERT-${short}-${String(seq).padStart(6, '0')}`;
}
