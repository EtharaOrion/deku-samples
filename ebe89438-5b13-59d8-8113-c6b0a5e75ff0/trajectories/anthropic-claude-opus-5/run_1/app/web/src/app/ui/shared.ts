import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Notices } from '../core/notices';
import {
  EVENT_STATE_TONES,
  EVENT_STATE_WORDS,
  STATUS_TONES,
  STATUS_WORDS,
  type EventState,
  type EventSummary,
  type RegistrationStatus,
} from '../core/models';
import { CoverArt } from './cover-art';
import { Icon } from './icons';
import { monthLabel, dayNumber, shortDate, timeOfDay } from '../core/timefmt';

/** Registration state is carried as a word in a pill, never by colour alone. */
@Component({
  selector: 'app-status-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pill" [class]="tone()">{{ word() }}</span>`,
})
export class StatusPill {
  readonly status = input.required<RegistrationStatus>();
  readonly word = computed(() => STATUS_WORDS[this.status()] ?? this.status());
  readonly tone = computed(() => STATUS_TONES[this.status()] ?? '');
}

@Component({
  selector: 'app-state-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pill" [class]="tone()">{{ word() }}</span>`,
})
export class StatePill {
  readonly state = input.required<EventState>();
  readonly word = computed(() => EVENT_STATE_WORDS[this.state()] ?? this.state());
  readonly tone = computed(() => EVENT_STATE_TONES[this.state()] ?? '');
}

/** A notice names the outcome in words and is announced politely. */
@Component({
  selector: 'app-notices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="notice-stack" role="status" aria-live="polite">
      @for (n of notices.items(); track n.id) {
        <div class="notice" [class]="'notice-' + n.tone">
          <span class="notice-text">{{ n.message }}</span>
          <button type="button" class="notice-x" (click)="notices.dismiss(n.id)" aria-label="Dismiss this message">
            <app-icon name="close" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .notice-text {
        flex: 1;
      }
      .notice-x {
        background: none;
        border: 0;
        cursor: pointer;
        color: var(--ink-tertiary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 44px;
        margin: -12px -8px -12px 0;
      }
      @media (hover: hover) {
        .notice-x:hover {
          color: var(--ink);
        }
      }
    `,
  ],
})
export class NoticeStack {
  readonly notices = inject(Notices);
}

/**
 * A dialog traps focus, returns it to the control that opened it, and closes on
 * the escape key.
 */
@Component({
  selector: 'app-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" (click)="onScrim($event)">
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        #panel
        (click)="$event.stopPropagation()"
      >
        <h2 [id]="titleId">{{ heading() }}</h2>
        <ng-content />
      </div>
    </div>
  `,
})
export class Dialog {
  readonly heading = input.required<string>();
  readonly closed = output<void>();
  readonly titleId = `dlg-${Math.random().toString(36).slice(2, 9)}`;
  private panel = viewChild<ElementRef<HTMLElement>>('panel');
  private opener: HTMLElement | null = null;

  constructor() {
    this.opener = document.activeElement as HTMLElement | null;
    effect(() => {
      const el = this.panel()?.nativeElement;
      if (el) queueMicrotask(() => this.focusFirst(el));
    });
  }

  private focusFirst(el: HTMLElement) {
    const target = el.querySelector<HTMLElement>(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])'
    );
    (target ?? el).focus();
  }

  onScrim(e: MouseEvent) {
    if (e.target === e.currentTarget) this.close();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const el = this.panel()?.nativeElement;
    if (!el) return;
    const nodes = Array.from(
      el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((n) => n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  close() {
    this.closed.emit();
    this.opener?.focus?.();
  }
}

/** One card in a results grid. */
@Component({
  selector: 'app-event-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CoverArt, StatePill],
  template: `
    <a class="card ecard lift interactive" [routerLink]="['/', event().slug]">
      <app-cover [seed]="event().cover_seed" [title]="event().title" radius="var(--r-card)" />
      <div class="ecard-body">
        <h3 class="t-card-title">{{ event().title }}</h3>
        <p class="ecard-meta t-caption">
          <span class="chip">
            <span class="t-month">{{ month() }}</span>
            <span class="chip-day">{{ day() }}</span>
          </span>
          <span class="ecard-when">
            {{ dateLine() }}<br />
            <span class="ecard-city">{{ event().city }}</span>
          </span>
        </p>
        @if (event().state === 'registration_closed') {
          <app-state-pill [state]="event().state" />
        } @else if (event().remaining !== null) {
          <span class="t-caption ecard-seats">{{ seatLine() }}</span>
        }
      </div>
    </a>
  `,
  styles: [
    `
      .ecard {
        display: block;
        overflow: hidden;
        color: inherit;
        height: 100%;
      }
      .ecard-body {
        padding: var(--s3) var(--s3) var(--s4);
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }
      h3 {
        font-weight: 500;
        font-size: 14px;
        line-height: 21px;
        color: var(--ink);
      }
      .ecard-meta {
        display: flex;
        align-items: center;
        gap: var(--s2);
        color: var(--ink-secondary);
        margin: 0;
      }
      .chip {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        border-radius: var(--r-menu);
        background: var(--ink-fill);
        border: 1px solid var(--ink-hairline);
        flex: 0 0 auto;
      }
      .chip .t-month {
        color: var(--ink-tertiary);
      }
      .chip-day {
        font-size: 15px;
        line-height: 18px;
        font-weight: 600;
      }
      .ecard-city {
        color: var(--ink-tertiary);
      }
      .ecard-seats {
        color: var(--ink-secondary);
      }
      .pill {
        align-self: flex-start;
      }
    `,
  ],
})
export class EventCard {
  readonly event = input.required<EventSummary>();
  readonly month = computed(() => monthLabel(this.event().starts_at, this.event().time_zone));
  readonly day = computed(() => dayNumber(this.event().starts_at, this.event().time_zone));
  readonly dateLine = computed(() => {
    const e = this.event();
    const d = shortDate(e.starts_at, e.time_zone);
    const t = timeOfDay(e.starts_at, e.time_zone);
    return t ? `${d}, ${t}` : d;
  });
  readonly seatLine = computed(() => {
    const r = this.event().remaining;
    if (r === null) return 'Open registration';
    if (r === 0) return 'Full, waiting list open';
    return r === 1 ? '1 seat left' : `${r} seats left`;
  });
}

/**
 * A scan code drawn as vector geometry on a 0 0 230 230 grid as a 25 by 25
 * module matrix at 9.2 per module, with three finder patterns and a quiet zone
 * of 4 modules. Generated at render time from the address it points at.
 */
@Component({
  selector: 'app-scan-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 230 230" [style.width.px]="size()" [style.height.px]="size()" role="img" [attr.aria-label]="'Scan code for ' + value()">
      <rect width="230" height="230" [attr.fill]="paper()" />
      @for (m of modules(); track m.k) {
        <rect [attr.x]="m.x" [attr.y]="m.y" width="9.2" height="9.2" [attr.fill]="ink()" />
      }
      @for (f of finders(); track f.k) {
        <rect [attr.x]="f.x" [attr.y]="f.y" width="64.4" height="64.4" rx="15.456" [attr.fill]="ink()" />
        <rect [attr.x]="f.x + 9.2" [attr.y]="f.y + 9.2" width="46" height="46" rx="10.35" [attr.fill]="paper()" />
        <rect [attr.x]="f.x + 18.4" [attr.y]="f.y + 18.4" width="27.6" height="27.6" rx="6.9" [attr.fill]="ink()" />
      }
    </svg>
  `,
  styles: [':host { display: inline-flex }'],
})
export class ScanCode {
  readonly value = input.required<string>();
  readonly size = input<number>(180);
  readonly ink = input<string>('#151515');
  readonly paper = input<string>('#ffffff');

  private readonly MODULES = 25;
  private readonly UNIT = 9.2;
  private readonly QUIET = 4;

  readonly finders = computed(() => {
    const q = this.QUIET * this.UNIT;
    const far = (this.MODULES - this.QUIET - 7) * this.UNIT;
    return [
      { k: 'tl', x: q, y: q },
      { k: 'tr', x: far, y: q },
      { k: 'bl', x: q, y: far },
    ];
  });

  readonly modules = computed(() => {
    const v = this.value();
    const out: { k: string; x: number; y: number }[] = [];
    // a deterministic matrix derived from the address, drawn as geometry
    let h = 2166136261;
    for (let i = 0; i < v.length; i++) {
      h ^= v.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    let state = h >>> 0;
    const next = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
    const inFinder = (c: number, r: number) => {
      const q = this.QUIET;
      const far = this.MODULES - q - 7;
      const box = (c0: number, r0: number) =>
        c >= c0 - 1 && c < c0 + 8 && r >= r0 - 1 && r < r0 + 8;
      return box(q, q) || box(far, q) || box(q, far);
    };
    for (let r = this.QUIET; r < this.MODULES - this.QUIET; r++) {
      for (let c = this.QUIET; c < this.MODULES - this.QUIET; c++) {
        if (inFinder(c, r)) continue;
        if (next() > 0.5)
          out.push({ k: `${c}-${r}`, x: c * this.UNIT, y: r * this.UNIT });
      }
    }
    return out;
  });
}
