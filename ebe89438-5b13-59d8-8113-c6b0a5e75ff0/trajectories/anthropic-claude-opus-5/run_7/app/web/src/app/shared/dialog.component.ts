import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter,
  HostListener, Input, OnDestroy, Output, ViewChild,
} from '@angular/core';

/**
 * A dialog traps focus, returns it to the control that opened it, and closes
 * on the escape key. Destructive dialogs put the destructive action second.
 */
@Component({
  selector: 'app-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" (mousedown)="onScrim($event)">
      <div class="dialog" role="dialog" aria-modal="true"
           [attr.aria-labelledby]="titleId" #panel>
        <h2 class="modal-title" [id]="titleId">{{ heading }}</h2>
        <div class="body">
          <ng-content />
        </div>
        <div class="dialog-actions">
          <ng-content select="[dialogActions]" />
        </div>
      </div>
    </div>
  `,
  styles: [`.body { margin-top: var(--s3); }`],
})
export class DialogComponent implements AfterViewInit, OnDestroy {
  @Input() heading = '';
  @Input() closeOnScrim = true;
  @Output() closed = new EventEmitter<void>();

  @ViewChild('panel') panel?: ElementRef<HTMLElement>;
  titleId = `dlg-${Math.random().toString(36).slice(2, 9)}`;
  private opener: HTMLElement | null = null;

  ngAfterViewInit() {
    this.opener = document.activeElement as HTMLElement | null;
    queueMicrotask(() => {
      const first = this.focusable()[0];
      (first ?? this.panel?.nativeElement)?.focus();
    });
  }

  ngOnDestroy() {
    // Focus returns to the control that opened the dialog.
    this.opener?.focus?.();
  }

  private focusable(): HTMLElement[] {
    const root = this.panel?.nativeElement;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.closed.emit();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = this.focusable();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  onScrim(e: MouseEvent) {
    if (this.closeOnScrim && e.target === e.currentTarget) this.closed.emit();
  }
}
