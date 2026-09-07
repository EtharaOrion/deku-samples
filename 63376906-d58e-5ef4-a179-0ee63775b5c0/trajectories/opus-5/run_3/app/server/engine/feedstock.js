import { rq, rq1 } from '../db/pool.js';
import { dryMassG } from './units.js';

const REQUIRED_CUSTODY = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];

/** The approval in force on a date, never a current flag. "What was true last
 *  March" has an answer because an approval is a dated period. */
export async function approvalInForce(collector, onDate) {
  return rq1(
    `SELECT * FROM approval_period
      WHERE collector = $1 AND valid_from <= $2::date AND valid_to >= $2::date
      ORDER BY valid_from DESC LIMIT 1`,
    [collector, onDate]
  );
}

/** The name a party held on the date of an act, with the identifier it held
 *  then. A certificate signed in 2026 reads back with the 2026 names however
 *  many renames follow. */
export async function partyNameOn(reference, onDate) {
  const row = await rq1(
    `SELECT name, identifier FROM party_version
      WHERE reference = $1 AND effective_from <= $2::date
      ORDER BY effective_from DESC LIMIT 1`,
    [reference, onDate]
  );
  if (row) return row.name;
  const any = await rq1(
    'SELECT name FROM party_version WHERE reference = $1 ORDER BY effective_from ASC LIMIT 1', [reference]
  );
  return any?.name || reference;
}

export async function custodyState(batchRef, receivedOn) {
  const links = await rq('SELECT * FROM custody_link WHERE batch = $1 ORDER BY ordinal', [batchRef]);
  const present = new Map();
  for (const l of links) present.set(l.kind, l);
  const missing = REQUIRED_CUSTODY.filter((k) => !present.has(k));
  // Where a link arrived late, the batch is claimable forward from the date the
  // evidence arrived rather than from its receipt date.
  let claimableFrom = receivedOn;
  let late = false;
  for (const l of links) {
    if (l.arrived_on) {
      late = true;
      const a = String(l.arrived_on).slice(0, 10);
      if (a > claimableFrom) claimableFrom = a;
    }
  }
  return {
    links: links.map((l) => ({
      kind: l.kind, party: l.party, date: String(l.link_date).slice(0, 10),
      arrived_on: l.arrived_on ? String(l.arrived_on).slice(0, 10) : null
    })),
    complete: missing.length === 0,
    missing,
    claimable_from: late ? claimableFrom : null
  };
}

/** Everything derived about a batch, computed here and stored nowhere. */
export async function resolveBatch(batchRow) {
  const b = batchRow;
  const receivedOn = String(b.received_on).slice(0, 10);
  const dry = dryMassG(Number(b.net_g), Number(b.moisture_bp));

  const approval = await approvalInForce(b.collector, receivedOn);
  const custody = await custodyState(b.reference, receivedOn);
  const device = await rq1('SELECT * FROM weighing_device WHERE reference = $1', [b.device]);

  const approvalOk = approval && (approval.state === 'approved' || approval.state === 'conditional');

  let claimable = true;
  let reason = null;
  if (!approvalOk) {
    // Material from a lapsed collector is processed as non-claimable input.
    claimable = false;
    reason = 'collector_approval_lapsed';
  } else if (!custody.complete) {
    claimable = false;
    reason = 'custody_link_missing';
  }

  const flags = [];
  // A calibration is valid for twelve months. A lapsed calibration flags every
  // lot downstream, so the flag is carried rather than resolved here.
  let lapsedCalibration = false;
  if (device) {
    const cal = new Date(device.calibrated_on);
    const rec = new Date(receivedOn);
    const monthsDiff = (rec.getFullYear() - cal.getFullYear()) * 12 + (rec.getMonth() - cal.getMonth())
      - (rec.getDate() < cal.getDate() ? 1 : 0);
    lapsedCalibration = monthsDiff >= 12;
    if (lapsedCalibration) flags.push('lapsed_calibration');
  }
  if (!claimable) flags.push('non_claimable');
  if (custody.claimable_from) flags.push('custody_completed_late');

  const collectorName = await partyNameOn(b.collector, receivedOn);
  const composition = b.composition || {};
  const deliveredG = Number(b.net_g);
  const rejectedG = Number(b.rejected_g || 0);
  const acceptedG = b.accepted_g === null || b.accepted_g === undefined
    ? deliveredG - rejectedG : Number(b.accepted_g);

  return {
    reference: b.reference,
    collector: b.collector,
    collector_name: collectorName,
    site: b.site,
    grade: b.grade,
    category: b.category,
    gross_g: Number(b.gross_g),
    tare_g: Number(b.tare_g),
    net_g: deliveredG,
    moisture_bp: Number(b.moisture_bp),
    moisture_method: b.moisture_method,
    device: b.device,
    device_calibrated_on: device ? String(device.calibrated_on).slice(0, 10) : null,
    received_on: receivedOn,
    dry_mass_g: dry,
    claimable,
    claimable_reason: reason,
    claimable_missing_link: reason === 'custody_link_missing' ? custody.missing[0] : null,
    claimable_from: custody.claimable_from,
    approval_state_on_receipt: approval ? approval.state : 'none',
    approval_valid_to: approval ? String(approval.valid_to).slice(0, 10) : null,
    flags,
    custody_complete: custody.complete,
    custody_missing: custody.missing,
    custody: custody.links,
    composition: {
      polymer: composition.polymer ?? null,
      fraction_bp: composition.fraction_bp ?? null,
      basis: composition.basis ?? null,
      measured_fraction_bp: composition.measured_fraction_bp ?? null
    },
    contamination: b.contamination || {},
    accepted_g: acceptedG,
    rejected_g: rejectedG,
    rejected_reason: b.rejected_reason,
    rejected_destination: b.rejected_destination,
    event_at: b.event_at,
    recorded_at: b.recorded_at,
    effective_on: String(b.effective_on).slice(0, 10),
    derivation: {
      dry_mass_g: `net_g ${deliveredG} * (10000 - moisture_bp ${b.moisture_bp}) / 10000, floored`,
      claimable: approval
        ? `approval period ${approval.reference} in state ${approval.state} was in force on ${receivedOn}`
        : `no approval period covered ${receivedOn}`,
      custody: custody.complete ? 'all six custody links present' : `missing: ${custody.missing.join(', ')}`
    }
  };
}

export async function resolveBatchByRef(reference) {
  const row = await rq1('SELECT * FROM batch WHERE reference = $1', [reference]);
  if (!row) return null;
  return resolveBatch(row);
}

export async function allBatches() {
  const rows = await rq('SELECT * FROM batch ORDER BY received_on, reference');
  return Promise.all(rows.map(resolveBatch));
}

export { REQUIRED_CUSTODY };
