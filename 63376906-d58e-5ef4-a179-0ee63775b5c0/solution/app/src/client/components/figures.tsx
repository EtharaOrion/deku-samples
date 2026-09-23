/**
 * Three figures never render alone. Each component below either carries the
 * dependencies its figure needs or does not render the figure at all.
 */

import type { JSX } from 'preact';
import { CLAIM_TYPE_LABEL, type ClaimType } from '../../shared/enums';
import { carbonPerKilogram, kilograms, percent, words } from '../format';

function claimWord(claimType: string): string {
  return CLAIM_TYPE_LABEL[claimType as ClaimType] ?? words(claimType);
}

interface RecycledContentProps {
  content_bp: number;
  claim_type: string;
  scheme?: string | null;
}

/** A recycled-content percentage renders with its claim type, as a word. */
export function RecycledContent({
  content_bp,
  claim_type,
  scheme,
}: RecycledContentProps): JSX.Element {
  return (
    <span class="figure">
      <span class="figure__value">{percent(content_bp)} recycled content</span>
      <span class="figure__depends">
        {`Claimed by ${claimWord(claim_type)}`}
        {scheme ? ` under scheme ${scheme}` : ''}
      </span>
    </span>
  );
}

interface CarbonFigureProps {
  value_mg_per_kg: number;
  boundary: string;
  method_version: string;
  uncertainty_bp: number;
  comparator?: string | null;
}

/** A carbon figure renders with its boundary, its method version and its uncertainty. */
export function CarbonFigure({
  value_mg_per_kg,
  boundary,
  method_version,
  uncertainty_bp,
  comparator,
}: CarbonFigureProps): JSX.Element {
  const value = carbonPerKilogram(value_mg_per_kg);
  const depends = `Boundary ${words(boundary)}, method version ${method_version}, uncertainty ${percent(uncertainty_bp)}`;
  return (
    <span class="figure">
      <span class="tooltip-host" tabIndex={0}>
        <span class="figure__value">{value}</span>
        <span class="tooltip" role="note">
          {`${value}. ${depends}.`}
          {comparator ? ` Lower than the ${comparator} comparator.` : ''}
        </span>
      </span>
      <span class="figure__depends">
        {depends}
        {comparator ? `, lower than the ${comparator} comparator` : ''}
      </span>
    </span>
  );
}

interface CapacityProps {
  nameplate_kg: number;
  confidence: string;
  statement?: string;
}

/** A capacity figure renders with its confidence, as a word. */
export function Capacity({ nameplate_kg, confidence, statement }: CapacityProps): JSX.Element {
  return (
    <span class="figure">
      <span class="figure__value">{statement ?? kilograms(nameplate_kg)}</span>
      <span class="figure__depends">
        {`${kilograms(nameplate_kg)}, ${words(confidence)}`}
      </span>
    </span>
  );
}
