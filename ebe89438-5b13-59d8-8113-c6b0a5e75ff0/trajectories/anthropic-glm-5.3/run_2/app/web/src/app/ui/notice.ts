import { Component, Input } from '@angular/core';

/** A notice names the outcome in words with a 4px leading status edge. */
@Component({
  selector: 'cc-notice',
  standalone: true,
  template: `
    <div class="notice" [class.notice-ok]="tone==='ok'" [class.notice-warn]="tone==='warn'"
         [class.notice-bad]="tone==='bad'" role="status" [attr.aria-live]="polite ? 'polite' : 'assertive'">
      <span class="pill {{ pillClass }}" *ngIf="false"></span>
      <p class="grow">{{ message }}</p>
      <button class="notice-x" type="button" (click)="dismiss.emit()" aria-label="Dismiss notice">×</button>
    </div>`,
  styles: [`
    p { margin: 0; font-size: 15px; line-height: 22px; }
    .notice-x { border: 0; background: none; font-size: 20px; line-height: 1; color: var(--ink-36);
      min-width: 32px; min-height: 32px; border-radius: 100px; }
    .notice-x:hover { color: var(--ink); background: var(--ink-04); }
  `],
})
export class Notice {
  @Input() message = '';
  @Input() tone: 'ok' | 'warn' | 'bad' | 'info' = 'info';
  @Input() polite = true;
  dismiss = new (class { emit(): void {} })();
}
