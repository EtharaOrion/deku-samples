import { Component, Input, OnChanges } from '@angular/core';
import { SCAN_MODULES, SCAN_QUIET, SCAN_UNIT, scanMatrix } from '../core/art';

/**
 * A scan code generated at render time from the address it points at, drawn as
 * vector geometry on a 0 0 230 230 grid.
 */
@Component({
  selector: 'app-scan-code',
  standalone: true,
  template: `
    <svg viewBox="0 0 230 230" [attr.width]="size" [attr.height]="size"
         role="img" [attr.aria-label]="'Scan code for ' + payload">
      <rect width="230" height="230" fill="var(--paper)" />
      <g fill="var(--ink)">
        @for (m of modules; track m.k) {
          <rect [attr.x]="m.x" [attr.y]="m.y" [attr.width]="unit" [attr.height]="unit" rx="1.5" />
        }
        @for (f of finders; track f.k) {
          <rect [attr.x]="f.x" [attr.y]="f.y" [attr.width]="f.s" [attr.height]="f.s"
                [attr.rx]="f.r" fill="none" stroke="var(--ink)" [attr.stroke-width]="unit" />
          <rect [attr.x]="f.ix" [attr.y]="f.iy" [attr.width]="f.is" [attr.height]="f.is"
                [attr.rx]="f.ir" fill="var(--ink)" />
        }
      </g>
    </svg>
  `,
})
export class ScanCodeComponent implements OnChanges {
  @Input() payload = '';
  @Input() size = 160;

  unit = SCAN_UNIT;
  modules: { k: string; x: number; y: number }[] = [];
  finders: any[] = [];

  ngOnChanges() {
    const grid = scanMatrix(this.payload);
    const off = (SCAN_QUIET / 2) * SCAN_UNIT;
    this.modules = [];
    for (let y = 0; y < SCAN_MODULES; y++) {
      for (let x = 0; x < SCAN_MODULES; x++) {
        if (grid[y][x]) {
          this.modules.push({ k: `${x}-${y}`, x: off + x * SCAN_UNIT, y: off + y * SCAN_UNIT });
        }
      }
    }
    const s = 7 * SCAN_UNIT;
    const corners: [number, number][] = [
      [0, 0], [SCAN_MODULES - 7, 0], [0, SCAN_MODULES - 7],
    ];
    this.finders = corners.map(([cx, cy], i) => {
      const x = off + cx * SCAN_UNIT, y = off + cy * SCAN_UNIT;
      return {
        k: `f${i}`,
        x: x + SCAN_UNIT / 2, y: y + SCAN_UNIT / 2,
        s: s - SCAN_UNIT, r: 15.456,
        ix: x + 2 * SCAN_UNIT, iy: y + 2 * SCAN_UNIT,
        is: 3 * SCAN_UNIT, ir: 6,
      };
    });
  }
}
