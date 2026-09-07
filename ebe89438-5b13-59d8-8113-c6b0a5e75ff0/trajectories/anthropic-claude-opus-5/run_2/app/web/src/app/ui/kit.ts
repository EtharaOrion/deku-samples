import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Notices } from '../core/notices';
import { PillTone } from '../core/models';

/* ------------------------------------------------------------- brand mark */

/**
 * A four-pointed star with concave sides on the coordinate box 0 0 133 134,
 * filled with the current text colour and drawn from geometry.
 */
@Component({
  selector: 'app-brand',
  standalone: true,
  imports: [RouterLink, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (link()) {
      <a class="lockup" routerLink="/" [attr.aria-label]="'Community Calendar, home'">
        <ng-container *ngTemplateOutlet="mark"></ng-container>
      </a>
    } @else {
      <span class="lockup">
        <ng-container *ngTemplateOutlet="mark"></ng-container>
      </span>
    }
    <ng-template #mark>
      <svg
        [attr.width]="size()"
        [attr.height]="size()"
        viewBox="0 0 133 134"
        [attr.fill]="tint() || 'currentColor'"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M66.5 0c0 36.7 29.8 66.5 66.5 67-36.7.5-66.5 30.3-66.5 67 0-36.7-29.8-66.5-66.5-67C36.7 66.5 66.5 36.7 66.5 0z"
        />
      </svg>
      @if (word()) {
        <span class="wordmark" [style.color]="tint() || null">Community Calendar</span>
      }
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .lockup {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: inherit;
        text-decoration: none;
      }
      svg {
        position: relative;
        top: -2px;
      }
      .wordmark {
        font-weight: 700;
        letter-spacing: -0.02em;
        font-size: 16px;
        line-height: 24px;
        color: var(--ink);
        white-space: nowrap;
      }
      @media (hover: hover) {
        a.lockup:hover .wordmark {
          color: var(--ink-64);
        }
      }
    `,
  ],
})
export class BrandComponent {
  readonly size = input<number>(16);
  readonly word = input<boolean>(true);
  readonly link = input<boolean>(true);
  readonly tint = input<string>('');
}

/* -------------------------------------------------------------------- pill */

@Component({
  selector: 'app-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pill" [class]="'pill-' + tone()">{{ word() }}</span>`,
})
export class PillComponent {
  readonly word = input.required<string>();
  readonly tone = input<PillTone>('neutral');
}

/* ------------------------------------------------------------------ avatar */

/** Generated from the display name as a coloured circle carrying the initial. */
@Component({
  selector: 'app-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="avatar"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.background]="background()"
      [style.font-size.px]="size() * 0.42"
      aria-hidden="true"
      >{{ initial() }}</span
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
        box-shadow: var(--hairline-inset);
        flex: none;
        line-height: 1;
      }
    `,
  ],
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly size = input<number>(24);

  readonly initial = computed(() =>
    (this.name() || '?').trim().charAt(0).toUpperCase(),
  );

  readonly background = computed(() => {
    const hues = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff'];
    const name = this.name() || '';
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return hues[h % hues.length];
  });
}

/* ---------------------------------------------------------------- skeleton */

@Component({
  selector: 'app-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="skeleton"
    [style.width]="width()"
    [style.height]="height()"
    [style.border-radius]="radius()"
    aria-hidden="true"
  ></span>`,
  styles: [':host { display: block; }', '.skeleton { display: block; }'],
})
export class SkeletonComponent {
  readonly width = input<string>('100%');
  readonly height = input<string>('16px');
  readonly radius = input<string>('4px');
}

/* ----------------------------------------------------------------- spinner */

@Component({
  selector: 'app-spinner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="spinner" viewBox="0 0 50 50" aria-hidden="true">
      <circle cx="25" cy="25" r="20"></circle>
    </svg>
    <span class="sr-only">Working</span>
  `,
  styles: [':host { display: inline-flex; }'],
})
export class SpinnerComponent {}

/* ----------------------------------------------------------------- notices */

@Component({
  selector: 'app-notice-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="notice-host" role="status" aria-live="polite">
      @for (n of notices.items(); track n.id) {
        <div class="notice" [class]="'notice-' + n.tone">
          <span class="edge" aria-hidden="true"></span>
          <span class="text">{{ n.message }}</span>
          <button type="button" class="dismiss" (click)="notices.dismiss(n.id)">
            <span class="sr-only">Dismiss this message</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .notice-host {
        position: fixed;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%);
        z-index: var(--z-notice);
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: min(560px, calc(100vw - 32px));
        pointer-events: none;
      }
      .notice {
        display: flex;
        align-items: center;
        gap: 12px;
        background: var(--paper);
        border-radius: var(--r-card);
        box-shadow: var(--shadow-primary);
        padding: 12px 12px 12px 0;
        overflow: hidden;
        pointer-events: auto;
        animation: notice-in 0.3s var(--ease-overshoot);
      }
      /* the status hue as a 4px leading edge rather than as a fill */
      .edge {
        width: 4px;
        align-self: stretch;
        background: var(--info);
        flex: none;
      }
      .notice-success .edge { background: var(--success); }
      .notice-warning .edge { background: var(--warning); }
      .notice-danger .edge { background: var(--danger); }
      .notice-info .edge { background: var(--info); }
      .text {
        flex: 1;
        font-size: 15px;
        line-height: 22px;
        color: var(--ink);
      }
      .dismiss {
        border: none;
        background: none;
        cursor: pointer;
        color: var(--ink-36);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: var(--r-nav);
        flex: none;
      }
      @media (hover: hover) {
        .dismiss:hover { color: var(--ink); background: var(--ink-04); }
      }
      @media (prefers-reduced-motion: reduce) {
        .notice { animation: none; }
      }
    `,
  ],
})
export class NoticeHostComponent {
  readonly notices = inject(Notices);
}

/* ------------------------------------------------------------------ dialog */

/**
 * A card of at most 480px over a scrim, entering on the panel curve, trapping
 * focus, returning focus to the control that opened it and closing on escape.
 * Below 484px it is a sheet rising from the foot of the screen.
 */
@Component({
  selector: 'app-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" (click)="onScrim($event)">
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        #panel
        (keydown)="onKeydown($event)"
      >
        <h2 class="dialog-title" [id]="titleId">{{ heading() }}</h2>
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [
    `
      .scrim {
        position: fixed;
        inset: 0;
        background: rgba(21, 21, 21, 0.8);
        z-index: var(--z-scrim);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .sheet {
        background: var(--paper);
        border-radius: var(--r-card-lg);
        padding: 24px;
        width: 100%;
        max-width: 480px;
        max-height: calc(100vh - 48px);
        overflow-y: auto;
        animation: dialog-in 0.4s var(--ease-panel);
      }
      .dialog-title {
        font-size: 17px;
        line-height: 22px;
        font-weight: 600;
        margin-bottom: 16px;
      }
      @keyframes dialog-in {
        from { transform: translateY(12px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @media (max-width: 483px) {
        .scrim { align-items: flex-end; padding: 0; }
        .sheet {
          max-width: none;
          border-radius: var(--r-card-lg) var(--r-card-lg) 0 0;
          max-height: 88vh;
        }
        @keyframes dialog-in {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .sheet { animation: none; }
      }
    `,
  ],
})
export class DialogComponent {
  readonly heading = input.required<string>();
  readonly closed = output<void>();

  readonly titleId = `dlg-${Math.random().toString(36).slice(2, 9)}`;
  private panel = viewChild<ElementRef<HTMLElement>>('panel');
  private opener: HTMLElement | null = null;

  constructor() {
    this.opener = document.activeElement as HTMLElement | null;
    effect(() => {
      const el = this.panel()?.nativeElement;
      if (!el) return;
      const first = el.querySelector<HTMLElement>(
        'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])',
      );
      (first ?? el).focus();
    });
  }

  onScrim(event: MouseEvent) {
    if (event.target === event.currentTarget) this.close();
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const el = this.panel()?.nativeElement;
    if (!el) return;
    const focusable = Array.from(
      el.querySelectorAll<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private close() {
    this.closed.emit();
    // returns focus to the control that opened it
    setTimeout(() => this.opener?.focus?.(), 0);
  }
}

/* --------------------------------------------------------------- scan code */

/**
 * Drawn as vector geometry on a 0 0 230 230 grid as a 25 by 25 module matrix
 * at 9.2 per module, with three finder patterns and a quiet zone of 4 modules.
 * It encodes the address it points at into the module pattern.
 */
@Component({
  selector: 'app-scan-code',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div [innerHTML]="svg()"></div>`,
  styles: [':host { display: block; }', 'div ::ng-deep svg { width: 100%; height: auto; }'],
})
export class ScanCodeComponent {
  private sanitizer = inject(DomSanitizer);

  readonly value = input.required<string>();
  readonly size = input<number>(230);

  readonly svg = computed<SafeHtml>(() => {
    const MODULES = 25;
    const UNIT = 9.2;
    const QUIET = 4;
    const value = this.value();

    // A deterministic module matrix derived from the address.
    const bits = matrixFor(value, MODULES);
    const parts: string[] = [];

    const isFinder = (r: number, c: number) =>
      (r < 7 && c < 7) || (r < 7 && c >= MODULES - 7) || (r >= MODULES - 7 && c < 7);

    for (let r = 0; r < MODULES; r++) {
      for (let c = 0; c < MODULES; c++) {
        if (isFinder(r, c)) continue;
        if (!bits[r * MODULES + c]) continue;
        parts.push(
          `<rect x="${(c * UNIT).toFixed(2)}" y="${(r * UNIT).toFixed(2)}" width="${UNIT}" height="${UNIT}" rx="1.6"/>`,
        );
      }
    }

    // three finder patterns as rounded squares of outer radius 15.456
    const finder = (cx: number, cy: number) => `
      <rect x="${cx}" y="${cy}" width="${7 * UNIT}" height="${7 * UNIT}" rx="15.456" fill="none" stroke="currentColor" stroke-width="${UNIT}"/>
      <rect x="${cx + 2.2 * UNIT}" y="${cy + 2.2 * UNIT}" width="${2.6 * UNIT}" height="${2.6 * UNIT}" rx="6" fill="currentColor"/>`;

    const total = MODULES * UNIT;
    const markup = `
<svg viewBox="${-QUIET * UNIT} ${-QUIET * UNIT} ${total + 2 * QUIET * UNIT} ${total + 2 * QUIET * UNIT}"
     xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Scan code for ${escapeAttr(value)}">
  <rect x="${-QUIET * UNIT}" y="${-QUIET * UNIT}" width="${total + 2 * QUIET * UNIT}" height="${total + 2 * QUIET * UNIT}" fill="var(--paper, #ffffff)"/>
  <g fill="currentColor">${parts.join('')}</g>
  ${finder(0, 0)}
  ${finder(total - 7 * UNIT, 0)}
  ${finder(0, total - 7 * UNIT)}
</svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(markup);
  });
}

function matrixFor(value: string, modules: number): boolean[] {
  const out: boolean[] = [];
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
  for (let i = 0; i < modules * modules; i++) out.push((next() & 7) > 3);
  return out;
}

function escapeAttr(s: string) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/* ---------------------------------------------------------- empty & states */

@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state">
      <h2>{{ heading() }}</h2>
      <p>{{ body() }}</p>
      <ng-content></ng-content>
    </div>
  `,
})
export class EmptyStateComponent {
  readonly heading = input.required<string>();
  readonly body = input.required<string>();
}
