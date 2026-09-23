/** Four inline vectors. Each renders beside a visible word, so a vector that fails costs nothing. */

import type { JSX } from 'preact';

type MarkName = 'flag' | 'lock' | 'arrow' | 'warning';

const GLYPHS: Record<MarkName, JSX.Element> = {
  flag: (
    <g>
      <path d="M4 14.5V2" />
      <path d="M4 2.8h8l-1.7 3 1.7 3H4" />
    </g>
  ),
  lock: (
    <g>
      <rect x="3.2" y="7" width="9.6" height="6.8" rx="1.2" />
      <path d="M5.5 7V5.1a2.5 2.5 0 0 1 5 0V7" />
    </g>
  ),
  arrow: (
    <g>
      <path d="M2.5 8h11" />
      <path d="M9.5 4.2 13.5 8l-4 3.8" />
    </g>
  ),
  warning: (
    <g>
      <path d="M8 2.4 14.6 13.4H1.4Z" />
      <path d="M8 6.4v3.1" />
      <path d="M8 11.5h.01" />
    </g>
  ),
};

interface MarkProps {
  name: MarkName;
  label: string;
  labelFirst?: boolean;
}

export function Mark({ name, label, labelFirst }: MarkProps): JSX.Element {
  return (
    <span class={labelFirst ? 'mark mark--label-first' : 'mark'}>
      <svg class="mark__glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        {GLYPHS[name]}
      </svg>
      <span class="mark__label">{label}</span>
    </span>
  );
}

export const FlagMark = (props: { label?: string }): JSX.Element => (
  <Mark name="flag" label={props.label ?? 'Flagged'} />
);

export const LockMark = (props: { label?: string }): JSX.Element => (
  <Mark name="lock" label={props.label ?? 'Closed'} />
);

export const ArrowMark = (props: { label?: string }): JSX.Element => (
  <Mark name="arrow" label={props.label ?? 'Forwards'} />
);

export const WarningMark = (props: { label?: string }): JSX.Element => (
  <Mark name="warning" label={props.label ?? 'Lapsed'} />
);
