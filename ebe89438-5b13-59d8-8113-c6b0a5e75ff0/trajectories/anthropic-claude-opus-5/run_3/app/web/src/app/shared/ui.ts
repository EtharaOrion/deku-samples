import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output, ElementRef, AfterViewInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STATUS_TONE, STATUS_WORDS, type RegistrationStatus } from '../core/models';
import { avatarFor, SCAN_FINDERS, SCAN_MODULES, SCAN_QUIET, SCAN_UNIT, scanMatrix } from '../core/art';
import { BrandMarkComponent, IconComponent } from './icons.component';

/** Registration state is always a word in a pill, never a colour alone. */
@Component({
  selector: 'app-status-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pill" [class]="'pill pill-' + tone">{{ word }}</span>`,
})
export class StatusPillComponent {
  @Input({ required: true }) status!: RegistrationStatus;

  get word() {
    return STATUS_WORDS[this.status] ?? this.status;
  }
  get tone() {
    return STATUS_TONE[this.status] ?? 'info';
  }
}

@Component({
  selector: 'app-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="avatar"
      [style.width.px]="size"
      [style.height.px]="size"
      [style.background]="art.colour"
      [style.font-size.px]="size * 0.42"
      aria-hidden="true"
      >{{ art.initial }}</span
    >
  `,
  styles: [
    `
      .avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 100%;
        color: #ffffff;
        font-weight: 600;
        box-shadow: rgba(0, 15, 58, 0.08) 0px 0px 0px 0.5px inset;
        flex: none;
        line-height: 1;
      }
    `,
  ],
})
export class AvatarComponent {
  @Input() name = '';
  @Input() size = 24;

  get art() {
    return avatarFor(this.name);
  }
}

/**
 * A scan code drawn as vector geometry from the address it points at, on a
 * 0 0 230 230 grid as a 25 by 25 module matrix at 9.2 per module, with three
 * finder patterns as rounded squares and a quiet zone of 4 modules.
 */
@Component({
  selector: 'app-scan-code',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 230 230"
      role="img"
      [attr.aria-label]="'Scan code for ' + value"
    >
      <rect width="230" height="230" fill="var(--paper, #ffffff)" />
      <g fill="var(--ink, #151515)">
        @for (cell of cells; track cell.k) {
          <rect [attr.x]="cell.x" [attr.y]="cell.y" [attr.width]="unit" [attr.height]="unit" />
        }
      </g>
      @for (f of finders; track f.x + '-' + f.y) {
        <g [attr.transform]="'translate(' + (quiet + f.x * unit) + ',' + (quiet + f.y * unit) + ')'">
          <rect
            [attr.width]="unit * 7"
            [attr.height]="unit * 7"
            rx="15.456"
            fill="none"
            stroke="var(--ink, #151515)"
            [attr.stroke-width]="unit"
          />
          <rect
            [attr.x]="unit * 2"
            [attr.y]="unit * 2"
            [attr.width]="unit * 3"
            [attr.height]="unit * 3"
            rx="6"
            fill="var(--ink, #151515)"
          />
        </g>
      }
    </svg>
  `,
})
export class ScanCodeComponent {
  @Input({ required: true }) value = '';
  @Input() size = 180;

  readonly unit = SCAN_UNIT;
  readonly quiet = SCAN_QUIET * SCAN_UNIT * 0.25;
  readonly finders = SCAN_FINDERS;

  get cells() {
    const matrix = scanMatrix(this.value);
    const out: Array<{ x: number; y: number; k: string }> = [];
    for (let y = 0; y < SCAN_MODULES; y++) {
      for (let x = 0; x < SCAN_MODULES; x++) {
        if (matrix[y][x]) {
          out.push({ x: this.quiet + x * this.unit, y: this.quiet + y * this.unit, k: `${x}-${y}` });
        }
      }
    }
    return out;
  }
}

/**
 * A dialog: a card over a scrim, entering on the panel curve, trapping focus,
 * returning focus to the control that opened it and closing on the escape key.
 */
@Component({
  selector: 'app-dialog',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" (click)="onScrim($event)">
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        (click)="$event.stopPropagation()"
      >
        <div class="dialog-head">
          <h2 [id]="titleId" class="t-modal-title">{{ heading }}</h2>
          <button type="button" class="icon-btn" (click)="closed.emit()">
            <app-icon name="close" [size]="18" />
            <span class="visually-hidden">Close this dialog</span>
          </button>
        </div>
        <ng-content />
      </div>
    </div>
  `,
  styles: [
    `
      .dialog-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 16px;
      }

      h2 {
        font-family: var(--serif);
        font-weight: 400;
      }

      .icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border: none;
        background: none;
        border-radius: var(--r-nav);
        cursor: pointer;
        color: var(--ink-64);
        flex: none;
      }

      @media (hover: hover) {
        .icon-btn:hover {
          background: var(--ink-04);
          color: var(--ink);
        }
      }
    `,
  ],
})
export class DialogComponent implements AfterViewInit {
  @Input() heading = '';
  @Input() dismissOnScrim = true;
  @Output() closed = new EventEmitter<void>();

  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly titleId = `dlg-${Math.random().toString(36).slice(2, 9)}`;
  private opener: HTMLElement | null = null;

  ngAfterViewInit() {
    this.opener = document.activeElement as HTMLElement;
    queueMicrotask(() => this.focusables()[0]?.focus());
  }

  ngOnDestroy() {
    // Focus returns to the control that opened it.
    this.opener?.focus?.();
  }

  private focusables(): HTMLElement[] {
    return Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    // Focus is trapped inside the dialog.
    const items = this.focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  onScrim(event: MouseEvent) {
    if (this.dismissOnScrim) this.closed.emit();
    event.stopPropagation();
  }
}

/** The brand lockup: the mark at the cap-height of the final letter. */
@Component({
  selector: 'app-lockup',
  standalone: true,
  imports: [BrandMarkComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="link" class="lockup" [class.tinted]="tinted">
      <app-brand-mark [size]="markSize" />
      <span class="wordmark" [style.font-size.px]="size">Deku</span>
    </a>
  `,
  styles: [
    `
      .lockup {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        color: var(--ink);
      }

      .lockup app-brand-mark {
        position: relative;
        top: -2px;
      }

      .wordmark {
        font-weight: 700;
        letter-spacing: -0.02em;
      }

      /* The suspended-account page is the one route where the lockup is tinted. */
      .tinted {
        color: var(--pink);
      }

      @media (hover: hover) {
        .tinted:hover {
          color: var(--pink-hover);
        }
      }
    `,
  ],
})
export class LockupComponent {
  @Input() size = 19;
  @Input() link = '/';
  @Input() tinted = false;

  get markSize() {
    return Math.round(this.size * 0.72);
  }
}

/** A skeleton block at the radius of the thing it stands for. */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    class="skeleton"
    [style.width]="width"
    [style.height]="height"
    [style.border-radius]="radius"
    aria-hidden="true"
  ></div>`,
})
export class SkeletonComponent {
  @Input() width = '100%';
  @Input() height = '16px';
  @Input() radius = '4px';
}
