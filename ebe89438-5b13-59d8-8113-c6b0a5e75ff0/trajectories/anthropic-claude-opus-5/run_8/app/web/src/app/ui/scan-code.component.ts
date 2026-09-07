import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const MODULES = 25;
const UNIT = 9.2;
const QUIET = 4;
const FINDER_RADIUS = 15.456;

/**
 * A scan code drawn as vector geometry from the address it points at: a 25 by 25
 * module matrix on a 0 0 230 230 grid, three rounded finder patterns, four
 * modules of quiet zone. Generated at render time, never fetched.
 */
@Component({
  selector: 'app-scan-code',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 230 230" [attr.width]="size()" [attr.height]="size()" role="img" [attr.aria-label]="'Scan code for ' + value()">
      <rect width="230" height="230" fill="var(--scan-paper, #ffffff)" rx="8" />
      <g fill="var(--scan-ink, #151515)">
        @for (m of modules(); track m.k) {
          <rect [attr.x]="m.x" [attr.y]="m.y" [attr.width]="unit" [attr.height]="unit" rx="1.4" />
        }
        @for (f of finders(); track f.k) {
          <path [attr.d]="f.d" fill-rule="evenodd" />
        }
      </g>
    </svg>
  `,
  styles: [':host { display: inline-flex; }'],
})
export class ScanCodeComponent {
  readonly value = input.required<string>();
  readonly size = input<number>(180);
  readonly unit = UNIT;

  private offset = (QUIET * UNIT) / 2;

  private bits = computed(() => {
    const text = this.value() || '';
    // A deterministic module matrix derived from the address, drawn as geometry.
    const grid: boolean[][] = [];
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < text.length; i++) {
      h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619) >>> 0;
      h2 = (Math.imul(h2 + text.charCodeAt(i) * (i + 7), 2246822519) ^ (h1 >>> 5)) >>> 0;
    }
    let state = (h1 ^ (h2 << 1)) >>> 0 || 0x9e3779b9;
    const next = () => {
      state ^= state << 13;
      state >>>= 0;
      state ^= state >> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 0xffffffff;
    };
    for (let y = 0; y < MODULES; y++) {
      grid[y] = [];
      for (let x = 0; x < MODULES; x++) grid[y][x] = next() > 0.5;
    }
    return grid;
  });

  private inFinder(x: number, y: number): boolean {
    const zones = [
      [0, 0],
      [MODULES - 7, 0],
      [0, MODULES - 7],
    ];
    return zones.some(([fx, fy]) => x >= fx && x < fx + 8 && y >= fy && y < fy + 8);
  }

  readonly modules = computed(() => {
    const grid = this.bits();
    const out: Array<{ k: string; x: number; y: number }> = [];
    for (let y = 0; y < MODULES; y++) {
      for (let x = 0; x < MODULES; x++) {
        if (!grid[y][x] || this.inFinder(x, y)) continue;
        out.push({ k: `${x}-${y}`, x: this.offset + x * UNIT, y: this.offset + y * UNIT });
      }
    }
    return out;
  });

  readonly finders = computed(() => {
    const zones: Array<[number, number]> = [
      [0, 0],
      [MODULES - 7, 0],
      [0, MODULES - 7],
    ];
    return zones.map(([fx, fy], i) => {
      const x = this.offset + fx * UNIT;
      const y = this.offset + fy * UNIT;
      const outer = 7 * UNIT;
      const inner = 5 * UNIT;
      const core = 3 * UNIT;
      const ro = FINDER_RADIUS;
      const ri = FINDER_RADIUS * 0.62;
      const rc = FINDER_RADIUS * 0.4;
      return {
        k: `f${i}`,
        d:
          roundedRect(x, y, outer, outer, ro) +
          roundedRect(x + UNIT, y + UNIT, inner, inner, ri) +
          roundedRect(x + 2 * UNIT, y + 2 * UNIT, core, core, rc),
      };
    });
  });
}

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return (
    `M${x + rr},${y}h${w - 2 * rr}a${rr},${rr} 0 0 1 ${rr},${rr}` +
    `v${h - 2 * rr}a${rr},${rr} 0 0 1 ${-rr},${rr}` +
    `h${-(w - 2 * rr)}a${rr},${rr} 0 0 1 ${-rr},${-rr}` +
    `v${-(h - 2 * rr)}a${rr},${rr} 0 0 1 ${rr},${-rr}z`
  );
}
