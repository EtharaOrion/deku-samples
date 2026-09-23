import { NOTICE_PERIOD_DAYS } from '../db/constants.js';
import {
  byVersion,
  type ChangeNoticeRow,
  type ConformanceRow,
  type ContractAllocationRow,
  type ContractRow,
  type PartyVersionRow,
  type SpecificationRow,
} from '../db/read.js';
import { projectContract, type Projection } from '../arithmetic/projection.js';
import { todayIso } from '../arithmetic/dates.js';
import { lotContent } from './lots.js';
import type { Sources } from './sources.js';

export type { Projection };

const CUSTOMER_KIND = 'customer';
const AUTOMOTIVE = 'automotive';
const CURRENT = 'current';

export function specificationView(specification: SpecificationRow): Record<string, unknown> {
  return {
    grade: specification.grade,
    version: specification.version,
    issued_on: specification.issued_on,
    properties: specification.properties,
    virgin_reference: specification.virgin_reference.reference,
    virgin_reference_source: specification.virgin_reference.source,
    virgin_reference_date: specification.virgin_reference.date,
    state: specification.state,
    issued_by: specification.issued_by,
  };
}

export function currentSpecification(grade: string, s: Sources): SpecificationRow | null {
  return s.specifications
    .filter((row) => row.grade === grade && row.state === CURRENT)
    .sort(byVersion)
    .at(-1) ?? null;
}

function currentSpecificationVersions(s: Sources): string[] {
  return s.specifications.filter((row) => row.state === CURRENT).map((row) => `${row.grade}/${row.version}`);
}

function customerVersions(s: Sources): PartyVersionRow[] {
  return s.parties.filter((row) => row.kind === CUSTOMER_KIND);
}

export function customerReferences(s: Sources): string[] {
  return [...new Set(customerVersions(s).map((row) => row.party))];
}

export function customerView(reference: string, conformances: ConformanceRow[], s: Sources): Record<string, unknown> | null {
  const versions = customerVersions(s).filter((row) => row.party === reference);
  const latest = versions[versions.length - 1];
  if (!latest) return null;
  const held = conformances
    .filter((row) => row.customer === reference)
    .sort(byVersion);
  const newest = held[held.length - 1];
  return {
    reference,
    name: s.partyName(reference, todayIso()),
    email: s.partyEmail(reference),
    holds_specification_version: newest ? newest.version : null,
    application: latest.application,
    industry: latest.industry,
    conformance: held.map((row) => row.reference),
  };
}

export function conformanceView(row: ConformanceRow): Record<string, unknown> {
  return {
    reference: row.reference,
    customer: row.customer,
    grade: row.grade,
    version: row.version,
    issued_on: row.issued_on,
    issued_by: row.issued_by,
  };
}

interface NoticeReach {
  specifications_affected: string[];
  customers_affected: string[];
  qualifications_affected: string[];
  notice_period_days: number;
}

export function noticeReach(qualificationRelevant: boolean, conformances: ConformanceRow[], s: Sources): NoticeReach {
  const holding = [...new Set(conformances.map((row) => row.customer))];
  const automotive = customerVersions(s)
    .filter((row) => row.industry === AUTOMOTIVE && holding.includes(row.party))
    .map((row) => row.party);
  return {
    specifications_affected: currentSpecificationVersions(s),
    customers_affected: holding,
    qualifications_affected: qualificationRelevant ? [...new Set(automotive)] : [],
    notice_period_days: NOTICE_PERIOD_DAYS,
  };
}

export function changeNoticeView(row: ChangeNoticeRow): Record<string, unknown> {
  return {
    reference: row.reference,
    what_changes: row.what_changes,
    against_version: row.against_version,
    parameter: row.parameter,
    qualification_relevant: row.qualification_relevant,
    specifications_affected: row.specifications_affected,
    customers_affected: row.customers_affected,
    qualifications_affected: row.qualifications_affected,
    notice_period_days: row.notice_period_days,
    notified: row.notified,
    waived: row.waived,
    state: row.state,
    raised_by: row.raised_by,
    raised_at: row.raised_at,
    released_at: row.released_at,
    outstanding: row.customers_affected.filter((customer) => !row.notified.includes(customer) && !row.waived.includes(customer)),
  };
}

export function contractView(contract: ContractRow, allocations: ContractAllocationRow[], s: Sources): Record<string, unknown> {
  const site = s.sites.get(contract.site);
  return {
    reference: contract.reference,
    customer: contract.customer,
    site: contract.site,
    period_label: contract.period_label,
    committed_kg: contract.committed_kg,
    floor_bp: contract.floor_bp,
    delivered_kg: contract.delivered_kg,
    shortfall_consequence: contract.shortfall_consequence,
    planned_site_flag: site?.confidence === 'planned',
    flag_dismissible: false,
    allocations: allocations.filter((row) => row.contract === contract.reference).map(allocationView),
  };
}

export function allocationView(row: ContractAllocationRow): Record<string, unknown> {
  return {
    reference: row.reference,
    contract: row.contract,
    lot: row.lot,
    mass_kg: row.mass_kg,
    decided_by: row.decided_by,
    favoured_over: row.favoured_over,
    recorded_at: row.recorded_at,
    effective_on: row.effective_on,
  };
}

export function projectionOf(contract: ContractRow, allocations: ContractAllocationRow[], s: Sources): Projection | null {
  const site = s.sites.get(contract.site);
  if (!site) return null;
  return projectContract(
    contract,
    site,
    allocations.filter((row) => row.contract === contract.reference),
    (reference) => {
      const lot = s.lots.get(reference);
      return { content_bp: lot ? lotContent(lot, s).content_bp : 0, lot: lot ?? null };
    },
  );
}
