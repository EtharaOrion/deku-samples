import type { ProjectionState } from '../../shared/enums.js';
import type { ContractAllocationRow, ContractRow, LotRow, SiteRow } from '../db/read.js';
import { BP_SCALE, floorDivide } from './floor.js';

export interface Projection {
  contract: string;
  customer: string;
  site: string;
  period: string;
  delivered_kg: number;
  committed_kg: number;
  remaining_kg: number;
  running_content_bp: number;
  floor_bp: number;
  required_remaining_bp: number;
  state: ProjectionState;
  unreachable_since: string | null;
  unreachable_allocation: string | null;
  planned_site_flag: boolean;
  flag_dismissible: false;
  shortfall_consequence: string;
  allocations: { reference: string; lot: string; mass_kg: number; content_bp: number; decided_by: string; favoured_over: string | null; recorded_at: string }[];
  versions: Record<string, string>;
  derivation: Record<string, unknown>;
}

const KG_PER_G = 1000;

export function projectContract(
  contract: ContractRow,
  site: SiteRow,
  allocations: ContractAllocationRow[],
  lotContent: (lot: string) => { content_bp: number; lot: LotRow | null },
): Projection {
  const rows = allocations
    .map((a) => ({
      reference: a.reference,
      lot: a.lot,
      mass_kg: a.mass_kg,
      content_bp: lotContent(a.lot).content_bp,
      decided_by: a.decided_by,
      favoured_over: a.favoured_over,
      recorded_at: a.recorded_at,
    }))
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const delivered_kg = contract.delivered_kg + rows.reduce((sum, r) => sum + r.mass_kg, 0);
  const claim_kg_bp = rows.reduce((sum, r) => sum + r.mass_kg * r.content_bp, 0);
  const running_content_bp = delivered_kg === 0 ? 0 : floorDivide(claim_kg_bp, delivered_kg);
  const remaining_kg = Math.max(contract.committed_kg - delivered_kg, 0);
  const required_claim_kg_bp = contract.committed_kg * contract.floor_bp - claim_kg_bp;
  const required_remaining_bp = remaining_kg === 0 ? (running_content_bp >= contract.floor_bp ? 0 : BP_SCALE + 1) : Math.max(floorDivide(required_claim_kg_bp + remaining_kg - 1, remaining_kg), 0);
  const unreachable = required_remaining_bp > BP_SCALE;
  let unreachable_since: string | null = null;
  let unreachable_allocation: string | null = null;
  if (unreachable) {
    let running_kg = contract.delivered_kg;
    let running_claim = 0;
    for (const r of rows) {
      running_kg += r.mass_kg;
      running_claim += r.mass_kg * r.content_bp;
      const rem = Math.max(contract.committed_kg - running_kg, 0);
      const need = contract.committed_kg * contract.floor_bp - running_claim;
      const bp = rem === 0 ? (need <= 0 ? 0 : BP_SCALE + 1) : floorDivide(need + rem - 1, rem);
      if (bp > BP_SCALE) {
        unreachable_since = r.recorded_at;
        unreachable_allocation = r.reference;
        break;
      }
    }
  }
  return {
    contract: contract.reference,
    customer: contract.customer,
    site: contract.site,
    period: contract.period_label,
    delivered_kg,
    committed_kg: contract.committed_kg,
    remaining_kg,
    running_content_bp,
    floor_bp: contract.floor_bp,
    required_remaining_bp,
    state: unreachable ? 'unreachable' : 'on_track',
    unreachable_since,
    unreachable_allocation,
    planned_site_flag: site.confidence === 'planned',
    flag_dismissible: false,
    shortfall_consequence: contract.shortfall_consequence,
    allocations: rows,
    versions: { site_confidence: site.confidence, site_capacity_revised_on: site.capacity_revised_on },
    derivation: {
      delivered_kg: 'contract.delivered_kg + sum of allocation mass_kg',
      running_content_bp: 'floor(sum(mass_kg * content_bp) / delivered_kg)',
      required_remaining_bp: 'ceil((committed_kg * floor_bp - sum(mass_kg * content_bp)) / remaining_kg)',
      state: 'unreachable when required_remaining_bp exceeds 10000 basis points',
      units: { mass: 'kg', content: 'bp', grams_per_kg: KG_PER_G },
    },
  };
}
