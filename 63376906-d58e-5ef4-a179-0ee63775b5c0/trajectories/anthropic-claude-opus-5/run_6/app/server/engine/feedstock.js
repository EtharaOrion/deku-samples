import { q } from '../lib/db.js';
import { dryMass } from './arithmetic.js';

const REQUIRED_CUSTODY = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];

function monthsBetween(fromDate, toDate) {
  const a = new Date(fromDate);
  const b = new Date(toDate);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1);
}

export function iso(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

// A batch resolves its claimability against the approval in force on its receipt
// date, never a current flag.
export function approvalInForce(periods, onDate) {
  const day = iso(onDate);
  const hits = (periods || []).filter((p) => iso(p.valid_from) <= day && day <= iso(p.valid_to));
  hits.sort((a, b) => (iso(b.valid_from) < iso(a.valid_from) ? -1 : 1));
  return hits[0] || null;
}

export function partyNameOn(versions, onDate) {
  const day = iso(onDate);
  const eligible = (versions || []).filter((v) => iso(v.effective_from) <= day);
  eligible.sort((a, b) => (iso(a.effective_from) < iso(b.effective_from) ? 1 : -1));
  return eligible[0]?.name || null;
}

export function deriveBatch(batch, custody, approvals, device, partyVersions) {
  const dry = dryMass(Number(batch.net_g), Number(batch.moisture_bp));
  const kinds = new Set(custody.map((c) => c.kind));
  const missing = REQUIRED_CUSTODY.filter((k) => !kinds.has(k));
  const custodyComplete = missing.length === 0;

  const approval = approvalInForce(approvals, batch.received_on);
  const approvalOk = approval && ['approved', 'conditional'].includes(approval.state);

  const flags = [];
  if (device && monthsBetween(device.calibrated_on, batch.received_on) >= 12) flags.push('lapsed_calibration');

  let claimable = true;
  let reason = null;
  let missingKind = null;
  if (!approvalOk) {
    claimable = false;
    reason = approval
      ? (approval.state === 'suspended' ? 'collector_approval_suspended' : 'collector_approval_lapsed')
      : 'collector_approval_lapsed';
  } else if (!custodyComplete) {
    claimable = false;
    reason = 'custody_link_missing';
    [missingKind] = missing;
    flags.push('custody_link_missing');
  }

  // late evidence: the batch becomes claimable from the date the document arrived
  let claimableFrom = null;
  if (!custodyComplete) {
    claimableFrom = null;
  } else {
    const lateLinks = custody.filter((c) => c.arrived_on);
    if (lateLinks.length) {
      const latest = lateLinks.map((c) => iso(c.arrived_on)).sort().pop();
      if (latest > iso(batch.received_on)) claimableFrom = latest;
    }
  }
  if (claimable && !flags.includes('non_claimable')) { /* claimable */ } else if (!claimable) flags.push('non_claimable');

  const composition = batch.composition || {};
  const declaredBp = composition.fraction_bp ?? null;
  const measuredBp = composition.measured_fraction_bp ?? null;
  const departureBp = (declaredBp !== null && measuredBp !== null) ? Math.abs(declaredBp - measuredBp) : null;

  return {
    dry_mass_g: dry,
    claimable,
    claimable_reason: reason,
    claimable_missing_kind: missingKind,
    claimable_from: claimableFrom,
    custody_complete: custodyComplete,
    custody_missing: missing,
    flags,
    approval_state_on_receipt: approval ? approval.state : 'none',
    approval_valid_to: approval ? iso(approval.valid_to) : null,
    collector_name: partyNameOn(partyVersions, batch.received_on),
    composition_departure_bp: departureBp,
    derivation: {
      dry_mass_g: `net_g ${batch.net_g} * (10000 - moisture_bp ${batch.moisture_bp}) / 10000, floored`,
      claimable: `approval period in force on ${iso(batch.received_on)}${approval ? ` (${approval.state}, ${iso(approval.valid_from)}..${iso(approval.valid_to)})` : ' (none)'}; custody links ${custody.length}/6`,
    },
  };
}

export async function batchView(reference) {
  const rows = await q('SELECT * FROM batch WHERE reference = $1', [reference]);
  if (!rows.length) return null;
  return (await batchViews([rows[0]]))[0];
}

export async function batchViews(batches) {
  if (!batches.length) return [];
  const refs = batches.map((b) => b.reference);
  const custody = await q('SELECT * FROM custody_link WHERE batch = ANY($1) ORDER BY ord ASC', [refs]);
  const approvals = await q('SELECT * FROM approval_period ORDER BY valid_from ASC');
  const devices = await q('SELECT * FROM weighing_device');
  const versions = await q('SELECT * FROM party_version ORDER BY effective_from ASC');
  return batches.map((b) => {
    const c = custody.filter((x) => x.batch === b.reference);
    const derived = deriveBatch(
      b,
      c,
      approvals.filter((a) => a.collector === b.collector),
      devices.find((d) => d.reference === b.device),
      versions.filter((v) => v.party === b.collector)
    );
    return {
      reference: b.reference,
      collector: b.collector,
      collector_name: derived.collector_name,
      site: b.site,
      grade: b.grade,
      category: b.category,
      gross_g: Number(b.gross_g),
      tare_g: Number(b.tare_g),
      net_g: Number(b.net_g),
      moisture_bp: Number(b.moisture_bp),
      moisture_method: b.moisture_method,
      device: b.device,
      received_on: iso(b.received_on),
      composition: b.composition,
      contamination: b.contamination,
      custody: c.map((x) => ({ kind: x.kind, date: iso(x.link_date), party: x.party, arrived_on: iso(x.arrived_on), document: x.document })),
      accepted_g: b.accepted_g === null ? Number(b.net_g) - Number(b.rejected_g) : Number(b.accepted_g),
      rejected_g: Number(b.rejected_g),
      rejected_reason: b.rejected_reason,
      rejected_destination: b.rejected_destination,
      delivered_g: Number(b.net_g),
      event_at: b.event_at,
      recorded_at: b.recorded_at,
      effective_on: iso(b.effective_on),
      ...derived,
    };
  });
}

export { REQUIRED_CUSTODY, monthsBetween };
