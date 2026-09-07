import {
  ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, inject, input,
  HostListener,
} from '@angular/core';

/**
 * A dialog: a card of at most 480px over a scrim, trapping focus, returning
 * focus to the control that opened it and closing on the escape key.
 */
@Component({
  selector: 'app-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="scrim" (click)="onBackdrop($event)">
        <div class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="title()"
             (click)="$event.stopPropagation()" #panel>
          <h2>{{ title() }}</h2>
          @if (body()) { <p class="body">{{ body() }}</p> }
          <ng-content />
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }
    .scrim {
      position: fixed; inset: 0; z-index: var(--z-scrim); background: var(--ink-80);
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .dialog {
      background: var(--paper); border-radius: var(--r-card-lg); width: 100%; max-width: 480px;
      padding: 24px; box-shadow: var(--shadow-primary), var(--ring-onboard);
      animation: panel-in 0.3s var(--panel-in);
      max-height: calc(100vh - 48px); overflow: auto;
    }
    h2 { font: 700 17px/22px var(--sans); margin: 0 0 8px; }
    .body { font-size: 15px; line-height: 22px; color: var(--ink-64); margin: 0 0 16px; }
    @keyframes panel-in { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }
    @media (max-width: 483px) {
      .scrim { align-items: flex-end; padding: 0; }
      .dialog { border-radius: 24px 24px 0 0; max-width: none; max-height: 90vh; }
    }
  `],
})
export class DialogComponent {
  open = input(false, { transform: booleanAttribute });
  title = input.required<string>();
  body = input<string | undefined>(undefined);
  closed = input<() => void>(undefined as unknown as () => void);

  private el = inject(ElementRef<HTMLElement>);
  private returnFocus: HTMLElement | null = null;

  ngOnInit() { this.returnFocus = document.activeElement as HTMLElement; }

  ngOnChanges() {
    if (this.open()) { this.returnFocus = document.activeElement as HTMLElement; setTimeout(() => this.focusFirst()); }
    else this.releaseFocus();
  }

  ngOnDestroy() { this.releaseFocus(); }

  onBackdrop(_e: MouseEvent) { this.close(); }

  close() {
    this.releaseFocus();
    const cb = this.closed();
    if (typeof cb === 'function') cb();
  }

  private releaseFocus() {
    this.returnFocus?.focus?.();
    this.returnFocus = null;
  }

  private focusFirst() {
    const root = this.el.nativeElement as HTMLElement;
    const target = root.querySelector<HTMLElement>(
      'input, select, textarea, button:not(.close), [tabindex]:not([tabindex="-1"])');
    target?.focus();
  }

  /** Escape closes; Tab stays inside. */
  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (!this.open()) return;
    if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
    if (e.key === 'Tab') this.trap(e);
  }

  private trap(e: KeyboardEvent) {
    const root = this.el.nativeElement as HTMLElement;
    const items = Array.from(root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement;
    if (e.shiftKey && (active === first || !root.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    else if (!root.contains(active)) { e.preventDefault(); first.focus(); }
  }
}
