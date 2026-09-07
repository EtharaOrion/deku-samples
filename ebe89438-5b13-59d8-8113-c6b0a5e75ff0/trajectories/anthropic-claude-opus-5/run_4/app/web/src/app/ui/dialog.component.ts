import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * A card of at most 480px at radius 24px over a scrim at depth 9901, entering
 * on the panel curve, trapping focus, returning focus to the control that
 * opened it and closing on the escape key. Below 484px it rises from the foot
 * of the screen as a sheet.
 */
@Component({
  selector: 'app-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim anim-scrim" (click)="onScrim($event)">
      <div
        class="sheet anim-panel"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        #card
        (keydown)="onKeydown($event)"
      >
        <h2 class="t-modal-title" [id]="titleId">{{ heading() }}</h2>
        <ng-content />
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      .scrim {
        position: fixed;
        inset: 0;
        background: rgba(21, 21, 21, 0.8);
        z-index: 9901;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--s5);
        animation: scrim-enter 0.2s var(--ease) both;
      }
      .sheet {
        background: var(--paper);
        border-radius: var(--r-card-lg);
        padding: var(--s5);
        width: 100%;
        max-width: 480px;
        max-height: calc(100vh - 48px);
        overflow: auto;
        animation: panel-enter 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      h2 {
        margin-bottom: var(--s4);
      }
      @media (max-width: 483px) {
        .scrim {
          align-items: flex-end;
          padding: 0;
        }
        .sheet {
          max-width: 100%;
          border-radius: var(--r-card-lg) var(--r-card-lg) 0 0;
          animation: sheet-enter 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .scrim,
        .sheet {
          animation: none !important;
        }
      }
    `,
  ],
})
export class DialogComponent implements AfterViewInit, OnDestroy {
  heading = input.required<string>();
  closed = output<void>();

  readonly titleId = `dlg-${Math.random().toString(36).slice(2, 9)}`;
  private card = viewChild.required<ElementRef<HTMLElement>>('card');
  private opener: HTMLElement | null = null;

  ngAfterViewInit() {
    this.opener = document.activeElement as HTMLElement | null;
    const first = this.focusables()[0];
    (first ?? this.card().nativeElement).focus?.();
  }

  ngOnDestroy() {
    this.opener?.focus?.();
  }

  private focusables(): HTMLElement[] {
    return Array.from(
      this.card().nativeElement.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.closed.emit();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = this.focusables();
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  onScrim(e: MouseEvent) {
    if (e.target === e.currentTarget) this.closed.emit();
  }
}
