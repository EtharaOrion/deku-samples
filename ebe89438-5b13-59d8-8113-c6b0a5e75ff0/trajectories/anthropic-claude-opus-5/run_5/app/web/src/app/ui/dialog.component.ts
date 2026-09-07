import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  AfterViewInit,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * A dialog is a card of at most 480px at radius 24px over a scrim at depth 9901,
 * entering on the panel curve, trapping focus, returning focus to the control
 * that opened it and closing on the escape key. Below 484px it becomes a sheet
 * rising from the foot of the screen.
 */
@Component({
  selector: 'app-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" (click)="onScrim($event)">
      <div
        class="panel"
        #panel
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId()"
        (keydown)="onKeydown($event)"
      >
        <h2 class="panel__title t-modal-title" [id]="titleId()">{{ heading() }}</h2>
        <div class="panel__body">
          <ng-content />
        </div>
        <div class="panel__actions">
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
        z-index: var(--z-scrim);
        background: rgba(21, 21, 21, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--s5);
      }
      .panel {
        width: 100%;
        max-width: 480px;
        background: var(--paper);
        color: var(--ink);
        border-radius: var(--r-card-lg);
        box-shadow: var(--elev-primary);
        padding: var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s4);
        animation: panel-enter 0.42s var(--ease-panel) both;
        max-height: calc(100vh - 48px);
        overflow-y: auto;
      }
      .panel__title { font-family: var(--serif); font-weight: 400; }
      .panel__body { display: flex; flex-direction: column; gap: var(--s3); }
      .panel__actions { display: flex; gap: var(--s2); justify-content: flex-end; flex-wrap: wrap; }
      @media (max-width: 483px) {
        .scrim { align-items: flex-end; padding: 0; }
        .panel {
          max-width: none;
          border-radius: var(--r-card-lg) var(--r-card-lg) 0 0;
          animation: sheet-enter 0.42s var(--ease-panel) both;
          max-height: 88vh;
        }
        .panel__actions { flex-direction: column-reverse; }
        .panel__actions ::ng-deep .btn { width: 100%; }
      }
      @media (prefers-reduced-motion: reduce) {
        .panel { animation: none; }
      }
    `,
  ],
})
export class DialogComponent implements AfterViewInit, OnDestroy {
  readonly heading = input.required<string>();
  readonly closed = output<void>();

  private panel = viewChild<ElementRef<HTMLElement>>('panel');
  private opener: HTMLElement | null = null;

  readonly titleId = computed(() => `dialog-title-${Math.random().toString(36).slice(2, 9)}`);

  ngAfterViewInit(): void {
    this.opener = document.activeElement as HTMLElement | null;
    queueMicrotask(() => this.focusables()[0]?.focus());
  }

  ngOnDestroy(): void {
    // Focus returns to the control that opened the dialog.
    this.opener?.focus?.();
  }

  onScrim(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }

  /** Closes on the escape key wherever focus happens to sit. */
  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    event.stopPropagation();
    this.closed.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const items = this.focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusables(): HTMLElement[] {
    const root = this.panel()?.nativeElement;
    if (!root) return [];
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }
}
