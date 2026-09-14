// Claimability, flags and the four separations, resolved from dated records.
import type { Pool } from 'pg';
import { twelveMonthsBefore } from './arithmetic';

export const CUSTODY_KINDS = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];

export type BatchResolution = {
  dry_mass_g: number;
  claimable: boolean;
  claimable_reason: string | null;
  claimable_from: string | null;
  flags: string[];
  custody_complete: boolean;
  missing_custody_kind: string | null;
  collector_name: string;
  collector_name_as_at: string;
};

export function dryMass(netG: number, moistureBp: number): number {
  return Math.floor((netG * (10000 - moistureBp)) / 10000);
}

export async function approvalInForce(db: Pool, collector: string, on: string) {
  const r = await db.query(
    `SELECT * FROM approval_periods WHERE collector=$1 AND valid_from <= $2 AND valid_to >= $2
     ORDER BY valid_from DESC LIMIT 1`,
    [collector, on]
  );
  return r.rows[0] || null;
}

export async function collectorNamesAsAt(db: Pool, collector: string, on: string) {
  const r = await db.query(
    `SELECT name FROM party_versions WHERE party=$1 AND effective_from <= $2 ORDER BY effective_from DESC LIMIT 1`,
    [collector, on]
  );
  return r.rows[0]?.name || collector;
}

export async function currentPartyName(db: Pool, party: string) {
  const r = await db.query(
    `SELECT name FROM party_versions WHERE party=$1 ORDER BY effective_from DESC LIMIT 1`,
    [party]
  );
  return r.rows[0]?.name || party;
}

export async function resolveBatch(db: Pool, batch: any): Promise<BatchResolution> {
  const approval = await approvalInForce(db, batch.collector, batch.received_on);
  const kinds = new Set<string>((batch.custody as any[]).map((c: any) => c.kind));
  const missing = CUSTODY_KINDS.find((k) => !kinds.has(k)) || null;

  const custodyComplete = missing === null;
  let claimable = true;
  let reason: string | null = null;
  if (!approval || !['approved', 'conditional'].includes(approval.state)) {
    claimable = false;
    reason = approval
      ? 'collector_approval_' + approval.state
      : 'collector_approval_lapsed';
    if (approval && approval.state === 'suspended') reason = 'collector_approval_suspended';
    if (!approval) reason = 'collector_approval_lapsed';
  } else if (!custodyComplete) {
    claimable = false;
    reason = 'custody_link_missing:' + missing;
  }

  const device = (await db.query('SELECT * FROM devices WHERE reference=$1', [batch.device])).rows[0];
  const flags: string[] = [];
  if (device && device.calibrated_on < twelveMonthsBefore(batch.received_on)) flags.push('lapsed_calibration');

  return {
    dry_mass_g: dryMass(batch.net_g, batch.moisture_bp),
    claimable,
    claimable_reason: reason,
    claimable_from: batch.claimable_from || null,
    flags,
    custody_complete: custodyComplete,
    missing_custody_kind: missing,
    collector_name: await currentPartyName(db, batch.collector),
    collector_name_as_at: await collectorNamesAsAt(db, batch.collector, batch.received_on)
  };
}

export const SEPARATIONS = {
  analyst_not_dispositioner: 'Whoever entered a test result does not disposition that lot.',
  method_publisher_not_closer: 'Whoever published a carbon method version does not close the period applying it.',
  signer_not_data_enterer: 'Whoever signs a certificate did not enter its data.',
  booker_not_approver: 'Whoever books in a batch does not approve the collector.'
} as const;
