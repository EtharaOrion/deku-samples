import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, output, ViewChild,
} from '@angular/core';

/**
 * A dialog is a card over a scrim at depth 9901: it traps focus, returns focus
 * to the control that opened it and closes on the escape key.
 */
@Component({
  selector: 'g-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" #scrim (click)="scrimClick($event)">
      <div class="dialog" role="dialog" aria-modal="true" [attr.aria-labelledby]="titleId" (keydown.escape)="closed.emit()">
        <h2 [id]="titleId" tabindex="-1" #heading>{{ title }}</h2>
        <ng-content />
      </div>
    </div>
  `,
})
export class Dialog implements AfterViewInit, OnDestroy {
  @Input({ required: true }) title!: string;
  @Input() danger = false;
  @ViewChild('heading', { static: true }) heading!: ElementRef<HTMLElement>;
  @ViewChild('scrim', { static: true }) scrim!: ElementRef<HTMLElement>;
  closed = output<void>();
  titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  private restoreTo: HTMLElement | null = null;
  private keydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.closed.emit();
      return;
    }
    if (e.key === 'Tab') this.trap(e);
  };

  ngAfterViewInit(): void {
    this.restoreTo = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', this.keydown, true);
    this.heading.nativeElement.focus();
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.keydown, true);
    this.restoreTo?.focus?.();
  }

  private trap(e: KeyboardEvent): void {
    const focusables = this.scrim.nativeElement.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables.length) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  scrimClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.closed.emit();
  }
}
