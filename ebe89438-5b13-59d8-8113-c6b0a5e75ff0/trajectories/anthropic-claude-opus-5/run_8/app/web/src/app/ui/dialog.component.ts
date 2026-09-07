import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * A dialog traps focus, returns it to the control that opened it, and closes on
 * escape. Above 484px it is a centred card; below it rises from the foot.
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
        (click)="$event.stopPropagation()"
      >
        <h2 class="t-modal-title" [id]="titleId">{{ heading() }}</h2>
        @if (blurb()) {
          <p class="blurb t-caption">{{ blurb() }}</p>
        }
        <div class="content">
          <ng-content />
        </div>
        <div class="actions">
          <ng-content select="[dialogActions]" />
        </div>
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
        padding: var(--s5);
      }
      .sheet {
        background: var(--paper);
        color: var(--ink);
        border-radius: var(--r-card-lg);
        padding: var(--s5);
        width: 100%;
        max-width: 480px;
        max-height: 88vh;
        overflow-y: auto;
        box-shadow: var(--elev-primary);
        animation: panel-in 0.42s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .blurb {
        color: var(--ink-64);
        margin-top: var(--s2);
      }
      .content {
        margin-top: var(--s4);
      }
      .actions {
        display: flex;
        gap: var(--s2);
        justify-content: flex-end;
        margin-top: var(--s5);
        flex-wrap: wrap;
      }
      @media (max-width: 483px) {
        .scrim {
          align-items: flex-end;
          padding: 0;
        }
        .sheet {
          max-width: none;
          border-radius: var(--r-card-lg) var(--r-card-lg) 0 0;
          padding-bottom: var(--s6);
        }
        .actions > * {
          flex: 1;
        }
      }
    `,
  ],
})
export class DialogComponent implements AfterViewInit, OnDestroy {
  readonly heading = input.required<string>();
  readonly blurb = input<string>('');
  readonly dismissed = output<void>();

  private panel = viewChild<ElementRef<HTMLElement>>('panel');
  private opener: HTMLElement | null = null;
  readonly titleId = `dlg-${Math.random().toString(36).slice(2, 9)}`;

  ngAfterViewInit(): void {
    this.opener = document.activeElement as HTMLElement | null;
    queueMicrotask(() => {
      const el = this.panel()?.nativeElement;
      const first = el?.querySelector<HTMLElement>(
        'input, select, textarea, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      (first ?? el)?.focus();
    });
  }

  ngOnDestroy(): void {
    this.opener?.focus?.();
  }

  onScrim(event: MouseEvent) {
    event.stopPropagation();
    this.dismissed.emit();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.dismissed.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    const el = this.panel()?.nativeElement;
    if (!el) return;
    const focusable = Array.from(
      el.querySelectorAll<HTMLElement>('input, select, textarea, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
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
}
