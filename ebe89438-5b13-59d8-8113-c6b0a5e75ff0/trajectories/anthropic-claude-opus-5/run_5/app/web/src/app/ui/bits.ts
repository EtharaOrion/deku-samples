import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { dayNumber, monthLabel } from '../core/time';
import { scanCode } from '../core/art';

/** Every list has an empty state naming the absence and offering a way out. */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state">
      <p class="empty-state__title">{{ title() }}</p>
      <p class="empty-state__body">{{ body() }}</p>
      @if (actionLabel()) {
        @if (actionLink()) {
          <a class="btn btn--primary" [routerLink]="actionLink()">{{ actionLabel() }}</a>
        } @else {
          <button type="button" class="btn btn--primary" (click)="action.emit()">
            {{ actionLabel() }}
          </button>
        }
      }
    </div>
  `,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  readonly actionLabel = input<string | null>(null);
  readonly actionLink = input<string | null>(null);
  readonly action = output<void>();
}

/** The small calendar tile that sits beside a date. */
@Component({
  selector: 'app-date-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="chip" aria-hidden="true">
      <span class="chip__month t-month">{{ month() }}</span>
      <span class="chip__day">{{ day() }}</span>
    </span>
  `,
  styles: [
    `
      :host { display: inline-flex; flex: none; }
      .chip {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: var(--r-menu);
        border: 1px solid var(--ink-08);
        background: var(--paper);
        overflow: hidden;
      }
      .chip__month {
        width: 100%;
        text-align: center;
        background: var(--ink-04);
        color: var(--ink-64);
        letter-spacing: 0.04em;
      }
      .chip__day { font-size: 17px; line-height: 22px; font-weight: 600; }
    `,
  ],
})
export class DateChipComponent {
  readonly instant = input<string | null>(null);
  readonly zone = input('UTC');
  readonly month = computed(() => monthLabel(this.instant(), this.zone()));
  readonly day = computed(() => dayNumber(this.instant(), this.zone()));
}

/**
 * A scan code generated at render time from the address it points at, drawn as
 * vector geometry on a 0 0 230 230 grid.
 */
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
      [attr.aria-label]="'Scan code for ' + payload()"
    >
      <rect width="230" height="230" fill="var(--paper)" rx="8" />
      @for (m of squares(); track m.k) {
        <rect [attr.x]="m.x" [attr.y]="m.y" width="9.2" height="9.2" [attr.fill]="ink()" />
      }
      @for (f of finders(); track f.k) {
        <rect
          [attr.x]="f.x"
          [attr.y]="f.y"
          [attr.width]="f.w"
          [attr.height]="f.w"
          [attr.rx]="f.r"
          fill="none"
          [attr.stroke]="ink()"
          [attr.stroke-width]="f.s"
        />
      }
    </svg>
  `,
  styles: [':host { display: inline-flex; line-height: 0; }'],
})
export class ScanCodeComponent {
  readonly payload = input.required<string>();
  readonly size = input(160);
  readonly ink = input('var(--ink)');

  private code = computed(() => scanCode(this.payload()));

  /** The quiet zone of 4 modules is folded into the origin. */
  readonly squares = computed(() => {
    const { modules, moduleSize, size } = this.code();
    const usable = 230 - 2 * 18;
    const step = usable / size;
    const out: Array<{ k: string; x: number; y: number }> = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!modules[r][c]) continue;
        if (isFinderArea(r, c, size)) continue;
        out.push({ k: `${r}-${c}`, x: 18 + c * step, y: 18 + r * step });
      }
    }
    return out;
  });

  readonly finders = computed(() => {
    const { size } = this.code();
    const usable = 230 - 2 * 18;
    const step = usable / size;
    const w = step * 7;
    const positions: Array<[number, number]> = [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ];
    const out: Array<{ k: string; x: number; y: number; w: number; r: number; s: number }> = [];
    positions.forEach(([r, c], i) => {
      out.push({ k: `outer-${i}`, x: 18 + c * step, y: 18 + r * step, w, r: 15.456, s: step });
      out.push({
        k: `inner-${i}`,
        x: 18 + (c + 2.5) * step,
        y: 18 + (r + 2.5) * step,
        w: step * 2,
        r: step * 0.7,
        s: step * 2,
      });
    });
    return out;
  });
}

function isFinderArea(r: number, c: number, size: number): boolean {
  return (r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8);
}

/** The one spinner in the product, inside a control that is working. */
@Component({
  selector: 'app-spinner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="spinner" viewBox="0 0 66 66" aria-hidden="true">
      <circle cx="33" cy="33" r="28" />
    </svg>
  `,
  styles: [':host { display: inline-flex; line-height: 0; }'],
})
export class SpinnerComponent {}
