import { CLAIM_TYPE_STRENGTH, type ClaimType } from '../../shared/enums.js';
import { floorDivide } from './floor.js';

export interface BlendComponent {
  lot: string;
  mass_g: number;
  content_bp: number;
  claim_type: ClaimType;
  site: string;
  provisional_factor: boolean;
  sites: string[];
}

export interface BlendResult {
  mass_g: number;
  content_bp: number;
  claim_type: ClaimType;
  sites: string[];
  provisional_factor: boolean;
  components: { lot: string; mass_g: number; content_bp: number }[];
}

function weakerClaimType(a: ClaimType, b: ClaimType): ClaimType {
  return CLAIM_TYPE_STRENGTH[a] <= CLAIM_TYPE_STRENGTH[b] ? a : b;
}

export function blendLots(components: BlendComponent[]): BlendResult {
  const mass_g = components.reduce((sum, c) => sum + c.mass_g, 0);
  const claim_g = components.reduce((sum, c) => sum + c.mass_g * c.content_bp, 0);
  const content_bp = mass_g === 0 ? 0 : floorDivide(claim_g, mass_g);
  const claim_type = components.map((c) => c.claim_type).reduce(weakerClaimType);
  const sites = [...new Set(components.flatMap((c) => [c.site, ...c.sites]))].sort();
  return {
    mass_g,
    content_bp,
    claim_type,
    sites,
    provisional_factor: components.some((c) => c.provisional_factor),
    components: components.map((c) => ({ lot: c.lot, mass_g: c.mass_g, content_bp: c.content_bp })),
  };
}
