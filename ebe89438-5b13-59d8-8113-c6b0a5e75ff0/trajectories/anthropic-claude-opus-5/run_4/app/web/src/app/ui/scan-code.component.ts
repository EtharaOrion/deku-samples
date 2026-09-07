import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * A scan code generated at render time from the address it points at, drawn as
 * vector geometry on a 0 0 230 230 grid as a 25 by 25 module matrix at 9.2 per
 * module, with three finder patterns as rounded squares of outer radius 15.456,
 * foreground ink on paper and a quiet zone of 4 modules.
 */
const MODULES = 25;
const UNIT = 9.2;
const QUIET = 4;

function hash(seed: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function inFinder(x: number, y: number): boolean {
  const corner = (cx: number, cy: number) => x >= cx && x < cx + 7 && y >= cy && y < cy + 7;
  return corner(0, 0) || corner(MODULES - 7, 0) || corner(0, MODULES - 7);
}

@Component({
  selector: 'app-scan-code',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 230 230"
      [attr.width]="size()"
      [attr.height]="size()"
      role="img"
      [attr.aria-label]="'Scan code for ' + value()"
    >
      <rect width="230" height="230" fill="#ffffff" rx="8" />
      <g fill="#151515">
        @for (m of modules(); track m.k) {
          <rect [attr.x]="m.x" [attr.y]="m.y" [attr.width]="unit" [attr.height]="unit" rx="1.6" />
        }
      </g>
      @for (f of finders(); track f.k) {
        <g>
          <rect
            [attr.x]="f.x"
            [attr.y]="f.y"
            width="64.4"
            height="64.4"
            rx="15.456"
            fill="none"
            stroke="#151515"
            stroke-width="9.2"
          />
          <rect
            [attr.x]="f.x + 18.4"
            [attr.y]="f.y + 18.4"
            width="27.6"
            height="27.6"
            rx="7"
            fill="#151515"
          />
        </g>
      }
    </svg>
  `,
  styles: [':host{display:inline-block}svg{border-radius:8px}'],
})
export class ScanCodeComponent {
  value = input.required<string>();
  size = input<number>(160);

  readonly unit = UNIT - 0.6;

  readonly modules = computed(() => {
    const v = this.value();
    const out: Array<{ x: number; y: number; k: string }> = [];
    for (let y = 0; y < MODULES; y++) {
      for (let x = 0; x < MODULES; x++) {
        if (inFinder(x, y)) continue;
        const on = (hash(v, y * MODULES + x) >>> 3) % 100 < 46;
        if (!on) continue;
        out.push({ x: QUIET + x * UNIT, y: QUIET + y * UNIT, k: `${x}-${y}` });
      }
    }
    return out;
  });

  readonly finders = computed(() => [
    { x: QUIET + 4.6, y: QUIET + 4.6, k: 'tl' },
    { x: QUIET + (MODULES - 7) * UNIT + 4.6, y: QUIET + 4.6, k: 'tr' },
    { x: QUIET + 4.6, y: QUIET + (MODULES - 7) * UNIT + 4.6, k: 'bl' },
  ]);
}
