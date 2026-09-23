import { CLAIM_TYPE_LABEL, type ClaimType } from '../../shared/enums.js';
import { STATEMENTS, VERIFY_HOST } from '../../shared/copy.js';
import { REGISTRATION, SCHEME } from '../db/constants.js';
import type { CertificateRow, DeviationRow } from '../db/read.js';
import { floorDivide } from './floor.js';

export function permittedStatement(claim_type: ClaimType, content_bp: number): string {
  const percent = `${floorDivide(content_bp, 100)} per cent`;
  if (claim_type === 'mass_balance') {
    return `This material carries a ${percent} recycled-content claim under the mass balance claim type. ${STATEMENTS.massBalanceClaim}`;
  }
  if (claim_type === 'controlled_blending') {
    return `This material contains ${percent} recycled content under the controlled blending claim type.`;
  }
  return `This material is ${percent} recycled content under the physically segregated claim type.`;
}

export function prohibitedStatement(claim_type: ClaimType): string {
  if (claim_type === 'mass_balance') return STATEMENTS.massBalanceProhibited;
  if (claim_type === 'controlled_blending') return 'You may not state that this material is physically segregated recycled content.';
  return 'You may not state a recycled content higher than the certified figure.';
}

function verificationUrl(number: string): string {
  return `https://${VERIFY_HOST}/verify/${number}`;
}

export interface CertificateView extends Record<string, unknown> {
  number: string; version: number; site: string; lots: { reference: string; mass_g: number }[]; grade: string;
  specification_version: string; claim_type: ClaimType; claim_type_label: string; content_bp: number;
  category_split: Record<string, number>; period: string | null;
  carbon: CertificateRow['carbon']; primary_share_bp: number | null; scheme: string; registration: string;
  test_results: Record<string, unknown>[]; permitted_statement: string; prohibited_statement: string;
  signer: string; signed_at: string; verification_url: string; state: string; provisional_factor: boolean;
  recipient: string; recipient_name: string; withdrawn_on: string | null; withdrawal_reason: string | null;
  withdrawn_by: string | null; supersedes: string | null; input_versions: Record<string, string>;
  deviations: string[]; derivation: Record<string, unknown>;
}

export function certificateView(cert: CertificateRow, recipientName: string, deviations: DeviationRow[]): CertificateView {
  return {
    number: cert.number,
    version: cert.version,
    site: cert.site,
    lots: cert.lots,
    grade: cert.grade,
    specification_version: cert.specification_version,
    claim_type: cert.claim_type,
    claim_type_label: CLAIM_TYPE_LABEL[cert.claim_type],
    content_bp: cert.content_bp,
    category_split: cert.category_split,
    period: cert.period,
    carbon: cert.carbon,
    primary_share_bp: cert.primary_share_bp,
    scheme: SCHEME,
    registration: REGISTRATION,
    test_results: cert.test_results,
    permitted_statement: permittedStatement(cert.claim_type, cert.content_bp),
    prohibited_statement: prohibitedStatement(cert.claim_type),
    signer: cert.signer,
    signed_at: cert.signed_at,
    verification_url: verificationUrl(cert.number),
    state: cert.state,
    provisional_factor: cert.provisional_factor,
    recipient: cert.recipient,
    recipient_name: recipientName,
    withdrawn_on: cert.withdrawn_on,
    withdrawal_reason: cert.withdrawal_reason,
    withdrawn_by: cert.withdrawn_by,
    supersedes: cert.supersedes,
    input_versions: cert.input_versions,
    deviations: deviations.map((d) => d.reference),
    derivation: {
      content_bp: 'floor(sum of allocated claim mass in grams * 10000 / lot mass in grams)',
      carbon: 'carbon figure recorded for the lot under the method version named in input_versions',
      versions: cert.input_versions,
    },
  };
}

export function certificateDocument(cert: CertificateRow, recipientName: string): string {
  const lines: string[] = [];
  lines.push(`RECYCLED CONTENT CERTIFICATE ${cert.number}`);
  lines.push(`Version ${cert.version}`);
  lines.push(`Scheme ${SCHEME}, registration ${REGISTRATION}`);
  lines.push(`State: ${cert.state}`);
  if (cert.state === 'withdrawn' && cert.withdrawn_on && cert.withdrawal_reason) {
    lines.push(STATEMENTS.withdrawn(cert.withdrawn_on, cert.withdrawal_reason));
  }
  lines.push('');
  lines.push(`Issued to ${recipientName} (${cert.recipient})`);
  lines.push(`Site ${cert.site}`);
  lines.push(`Grade ${cert.grade}, specification version ${cert.specification_version}`);
  for (const lot of cert.lots) lines.push(`Lot ${lot.reference}: ${lot.mass_g} g`);
  lines.push(`Balance period ${cert.period ?? 'none'}`);
  lines.push('');
  lines.push(`Claim type: ${CLAIM_TYPE_LABEL[cert.claim_type]}`);
  lines.push(`Recycled content: ${cert.content_bp} basis points (${floorDivide(cert.content_bp, 100)} per cent) by ${CLAIM_TYPE_LABEL[cert.claim_type]}`);
  for (const [category, mass_g] of Object.entries(cert.category_split)) lines.push(`Category ${category}: ${mass_g} g`);
  lines.push(`Provisional conversion factor: ${cert.provisional_factor ? 'yes' : 'no'}`);
  lines.push('');
  if (cert.carbon) {
    lines.push(`Carbon footprint: ${cert.carbon.value_mg_per_kg} mg CO2e per kg`);
    lines.push(`Boundary: ${cert.carbon.boundary}`);
    lines.push(`Method version: ${cert.carbon.method_version}`);
    lines.push(`Uncertainty: ${cert.carbon.uncertainty_bp} basis points`);
    lines.push(`Primary data share: ${cert.primary_share_bp ?? 0} basis points`);
  }
  lines.push('');
  lines.push(`Permitted statement: ${permittedStatement(cert.claim_type, cert.content_bp)}`);
  lines.push(`Prohibited statement: ${prohibitedStatement(cert.claim_type)}`);
  lines.push('');
  lines.push(`Signed by ${cert.signer} at ${cert.signed_at}`);
  lines.push(STATEMENTS.verify(cert.number));
  return lines.join('\n') + '\n';
}

export interface Replay extends Record<string, unknown> {
  certificate: string;
  issued: number | null;
  recomputed: number | null;
  agrees: boolean;
  differing_input: string | null;
  input_versions: Record<string, string>;
  reproducible: boolean;
  reason: string | null;
  carbon_issued: number | null;
  carbon_recomputed: number | null;
}

interface ReplayInputs {
  cert: CertificateRow;
  recomputedContentBp: number;
  recomputedCarbonMgPerKg: number | null;
  currentVersions: Record<string, string>;
}

export function replayCertificate(input: ReplayInputs): Replay {
  const { cert } = input;
  const carbonIssued = cert.carbon ? cert.carbon.value_mg_per_kg : null;
  const contentAgrees = cert.content_bp === input.recomputedContentBp;
  const carbonAgrees = carbonIssued === input.recomputedCarbonMgPerKg;
  const differing = Object.keys(cert.input_versions).find((key) => input.currentVersions[key] !== cert.input_versions[key]) ?? null;
  const agrees = contentAgrees && carbonAgrees;
  let differing_input: string | null = null;
  if (!agrees) {
    if (differing) differing_input = `${differing}: issued under ${cert.input_versions[differing]}, now ${input.currentVersions[differing]}`;
    else if (!contentAgrees) differing_input = 'allocated claim mass';
    else differing_input = 'carbon figure';
  }
  return {
    certificate: cert.number,
    issued: cert.content_bp,
    recomputed: input.recomputedContentBp,
    agrees,
    differing_input,
    input_versions: cert.input_versions,
    reproducible: true,
    reason: agrees ? null : 'the recomputation from recorded inputs differs from the issued figure',
    carbon_issued: carbonIssued,
    carbon_recomputed: input.recomputedCarbonMgPerKg,
  };
}

export function unreproducibleReplay(number: string, reason: string): Replay {
  return {
    certificate: number, issued: null, recomputed: null, agrees: false, differing_input: null,
    input_versions: {}, reproducible: false, reason, carbon_issued: null, carbon_recomputed: null,
  };
}

export interface Withdrawal extends Record<string, unknown> {
  number: string;
  state: 'withdrawn';
  reason: string;
  withdrawn_by: string;
  withdrawn_on: string;
  notified_recipients: { reference: string; name: string; email: string | null }[];
  void_statements: string[];
  derived_certificates: string[];
  batch_traversal: string[];
  consequences: string[];
}

export function withdrawalOf(
  cert: CertificateRow,
  reason: string,
  withdrawnBy: string,
  withdrawnOn: string,
  recipient: { reference: string; name: string; email: string | null },
  derivedCertificates: string[],
  batchTraversal: string[],
): Withdrawal {
  const voidStatements = [permittedStatement(cert.claim_type, cert.content_bp), STATEMENTS.verify(cert.number)];
  return {
    number: cert.number,
    state: 'withdrawn',
    reason,
    withdrawn_by: withdrawnBy,
    withdrawn_on: withdrawnOn,
    notified_recipients: [recipient],
    void_statements: voidStatements,
    derived_certificates: derivedCertificates,
    batch_traversal: batchTraversal,
    consequences: [
      `certificate ${cert.number} moved to state withdrawn on ${withdrawnOn}`,
      `recipient ${recipient.name} notified by mail`,
      `${voidStatements.length} statements declared void`,
      `${derivedCertificates.length} derived certificates enumerated`,
      `${batchTraversal.length} batches traversed for further impact`,
    ],
  };
}
